import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../../supabaseClient.js";
import { ensureKeyPair } from "../lib/crypto";

// Évite de republier inutilement une clé déjà vérifiée.
const published = new Map();

// Évite les publications simultanées pour le même compte.
const publicationLocks = new Map();

function parsePublicKey(value) {
  if (!value) return null;

  try {
    const key = typeof value === "string" ? JSON.parse(value) : value;

    if (
      !key ||
      typeof key !== "object" ||
      key.kty !== "RSA" ||
      typeof key.n !== "string" ||
      typeof key.e !== "string"
    ) {
      return null;
    }

    return key;
  } catch {
    return null;
  }
}

// Compare les paramètres cryptographiques essentiels.
// Comparer uniquement n ne suffit pas.
function samePublicKey(a, b) {
  const keyA = parsePublicKey(a);
  const keyB = parsePublicKey(b);

  if (!keyA || !keyB) return false;

  return (
    keyA.kty === keyB.kty &&
    keyA.n === keyB.n &&
    keyA.e === keyB.e &&
    (keyA.alg || null) === (keyB.alg || null)
  );
}

function getKeyFingerprint(key) {
  const parsed = parsePublicKey(key);

  if (!parsed) {
    throw new Error("Format de clé publique invalide.");
  }

  return `${parsed.kty}:${parsed.n}:${parsed.e}:${parsed.alg || ""}`;
}

async function getProfilePublicKey(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("public_key")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(
      "Impossible de vérifier la clé publique : " + error.message
    );
  }

  if (!data) {
    throw new Error("Profil utilisateur introuvable.");
  }

  return parsePublicKey(data.public_key);
}

async function publishPublicKey(userId, publicKeyJwk) {
  const fingerprint = getKeyFingerprint(publicKeyJwk);

  if (published.get(userId) === fingerprint) {
    return true;
  }

  // Une autre instance est déjà en train de publier cette clé.
  if (publicationLocks.has(userId)) {
    await publicationLocks.get(userId);

    const currentKey = await getProfilePublicKey(userId);

    if (!samePublicKey(currentKey, publicKeyJwk)) {
      throw new Error(
        "La clé publique du compte ne correspond pas à celle de cet appareil."
      );
    }

    published.set(userId, fingerprint);
    return true;
  }

  const task = (async () => {
    const serverKey = await getProfilePublicKey(userId);

    // La clé existe déjà : ne jamais la remplacer silencieusement.
    if (serverKey) {
      if (!samePublicKey(serverKey, publicKeyJwk)) {
        throw new Error(
          "Une autre clé publique est déjà enregistrée pour ce compte. " +
          "Une vérification ou une procédure de récupération est nécessaire."
        );
      }

      published.set(userId, fingerprint);
      return true;
    }

    // Publication uniquement si la colonne est encore vide.
    // Cela évite d'écraser une clé ajoutée simultanément.
    const { data, error } = await supabase
      .from("profiles")
      .update({ public_key: publicKeyJwk })
      .eq("id", userId)
      .is("public_key", null)
      .select("id");

    if (error) {
      throw new Error("Publication de la clé impossible : " + error.message);
    }

    if (data?.length) {
      published.set(userId, fingerprint);
      return true;
    }

    // Une autre instance a peut-être publié la clé entre-temps.
    const latestKey = await getProfilePublicKey(userId);

    if (!samePublicKey(latestKey, publicKeyJwk)) {
      throw new Error(
        "La publication de la clé a échoué : une autre clé est enregistrée."
      );
    }

    published.set(userId, fingerprint);
    return true;
  })();

  publicationLocks.set(userId, task);

  try {
    return await task;
  } finally {
    if (publicationLocks.get(userId) === task) {
      publicationLocks.delete(userId);
    }
  }
}

export function useCryptoKeys(userId) {
  const [privateKey, setPrivateKey] = useState(null);
  const [publicKeyJwk, setPublicKeyJwk] = useState(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    setPrivateKey(null);
    setPublicKeyJwk(null);
    setReady(false);
    setError(null);

    if (!userId) return undefined;

    async function initialize() {
      try {
        // Vérifie que le compte connecté correspond au profil demandé.
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError) {
          throw new Error("Vérification de session impossible.");
        }

        if (!user || user.id !== userId) {
          throw new Error("Utilisateur non authentifié ou compte incorrect.");
        }

        // Une clé distante existante interdit la création silencieuse
        // d'une nouvelle clé locale après perte du stockage.
        const serverPublicKey = await getProfilePublicKey(userId);

        // Récupération ou création de la paire de clés locale.
        const {
          publicKeyJwk: localPublicKey,
          privateKey: localPrivateKey,
        } = await ensureKeyPair({ allowCreate: !serverPublicKey });

        if (cancelled) return;

        const validPublicKey = parsePublicKey(localPublicKey);

        if (!validPublicKey || !localPrivateKey) {
          throw new Error("Paire de clés cryptographiques invalide.");
        }

        // Publication sécurisée sans remplacement silencieux.
        await publishPublicKey(userId, validPublicKey);

        if (cancelled) return;

        setPrivateKey(localPrivateKey);
        setPublicKeyJwk(validPublicKey);
        setReady(true);
      } catch (err) {
        console.error("[useCryptoKeys]", err);

        if (!cancelled) {
          setPrivateKey(null);
          setPublicKeyJwk(null);
          setReady(false);
          setError(err?.message || "Erreur d'initialisation cryptographique.");
        }
      }
    }

    initialize();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Récupération et validation de la clé publique d'un destinataire.
  const fetchRecipientPublicKey = useCallback(async (recipientId) => {
    if (!recipientId || typeof recipientId !== "string") {
      return null;
    }

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("public_key")
        .eq("id", recipientId)
        .maybeSingle();

      if (error) {
        console.warn(
          "[useCryptoKeys] Lecture de la clé destinataire impossible:",
          error.message
        );
        return null;
      }

      if (!data?.public_key) return null;

      return parsePublicKey(data.public_key);
    } catch (err) {
      console.warn("[useCryptoKeys] Clé destinataire invalide:", err);
      return null;
    }
  }, []);

  return {
    privateKey,
    publicKeyJwk,
    ready,
    error,
    fetchRecipientPublicKey,
  };
}
