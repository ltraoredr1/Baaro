import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../../supabaseClient.js";
import {
  ensureKeyPair,
  clearLocalKeyPair,
  restoreFromBackup,
} from "../lib/crypto";

/**
 * Modes de récupération exposés à l'interface :
 *  - "setup"  : compte sans clé → créer une phrase secrète
 *  - "unlock" : clé du compte absente de cet appareil, sauvegarde disponible
 *               → saisir la phrase secrète pour retrouver les conversations
 *  - "reset"  : clé du compte absente et aucune sauvegarde
 *               → nouvelle clé (anciens messages illisibles sur cet appareil)
 */

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
    throw new Error("Impossible de vérifier la clé publique : " + error.message);
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

// Demande au navigateur de ne pas purger IndexedDB (cause fréquente de perte).
async function requestPersistentStorage() {
  try {
    if (
      navigator.storage?.persist &&
      !(await navigator.storage.persisted())
    ) {
      await navigator.storage.persist();
    }
  } catch {
    // Non bloquant.
  }
}

async function saveBackupToAccount(backup) {
  const { error } = await supabase.auth.updateUser({
    data: { e2e_backup: backup },
  });

  if (error) {
    throw new Error("Sauvegarde de la clé impossible : " + error.message);
  }
}

export function useCryptoKeys(userId) {
  const [privateKey, setPrivateKey] = useState(null);
  const [publicKeyJwk, setPublicKeyJwk] = useState(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState(null); // "setup" | "unlock" | "reset" | null
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;

    setPrivateKey(null);
    setPublicKeyJwk(null);
    setReady(false);
    setError(null);
    setMode(null);

    if (!userId) return undefined;

    async function initialize() {
      let hasBackup = false;

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

        hasBackup = !!user.user_metadata?.e2e_backup;

        await requestPersistentStorage();

        const serverPublicKey = await getProfilePublicKey(userId);

        // Ne crée JAMAIS de clé automatiquement.
        const pair = await ensureKeyPair({ allowCreate: false });

        if (cancelled) return;

        // Aucune clé locale sur cet appareil.
        if (!pair) {
          if (hasBackup) setMode("unlock");
          else if (serverPublicKey) setMode("reset");
          else setMode("setup");

          setError("Clé de chiffrement introuvable sur cet appareil.");
          return;
        }

        const validPublicKey = parsePublicKey(pair.publicKeyJwk);

        if (!validPublicKey || !pair.privateKey) {
          throw new Error("Paire de clés cryptographiques invalide.");
        }

        // La clé locale diffère de celle du compte.
        if (serverPublicKey && !samePublicKey(serverPublicKey, validPublicKey)) {
          setMode(hasBackup ? "unlock" : "reset");
          setError(
            "La clé de cet appareil ne correspond pas à celle du compte."
          );
          return;
        }

        // Publication sans remplacement silencieux.
        await publishPublicKey(userId, validPublicKey);

        if (cancelled) return;

        setPrivateKey(pair.privateKey);
        setPublicKeyJwk(validPublicKey);
        setReady(true);
      } catch (err) {
        console.error("[useCryptoKeys]", err);

        if (!cancelled) {
          if (/autre clé publique/i.test(err?.message || "")) {
            setMode(hasBackup ? "unlock" : "reset");
          }

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
  }, [userId, retry]);

  // ─── Actions de récupération ──────────────────────────────────────────────

  // Première configuration : crée la clé + la sauvegarde protégée.
  const setupKeys = useCallback(async (passphrase) => {
    const pair = await ensureKeyPair({ allowCreate: true, passphrase });

    if (!pair?.backup) {
      throw new Error("Une clé existe déjà sur cet appareil.");
    }

    try {
      await saveBackupToAccount(pair.backup);
    } catch (err) {
      await clearLocalKeyPair();
      throw err;
    }

    setRetry((n) => n + 1);
  }, []);

  // Nouvel appareil / stockage vidé : restaure la clé depuis la sauvegarde.
  const unlockKeys = useCallback(
    async (passphrase) => {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        throw new Error("Vérification de session impossible.");
      }

      const backup = user.user_metadata?.e2e_backup;

      if (!backup) {
        throw new Error("Aucune sauvegarde de clé trouvée pour ce compte.");
      }

      const restored = await restoreFromBackup(backup, passphrase);
      const serverKey = await getProfilePublicKey(userId);

      if (serverKey && !samePublicKey(serverKey, restored.publicKeyJwk)) {
        await clearLocalKeyPair();
        throw new Error(
          "Cette sauvegarde ne correspond plus à la clé du compte. " +
            "Utilisez la réinitialisation."
        );
      }

      setRetry((n) => n + 1);
    },
    [userId]
  );

  // Aucune sauvegarde (ou phrase oubliée) : nouvelle clé.
  // Les anciens messages ne seront plus lisibles avec cette nouvelle clé.
  const resetKeys = useCallback(
    async (passphrase) => {
      const pair = await ensureKeyPair({ allowCreate: true, passphrase });

      if (!pair?.backup) {
        throw new Error(
          "Une clé existe déjà sur cet appareil : supprimez-la avant de réinitialiser."
        );
      }

      const { data, error: updateError } = await supabase
        .from("profiles")
        .update({ public_key: pair.publicKeyJwk })
        .eq("id", userId)
        .select("id");

      if (updateError || !data?.length) {
        await clearLocalKeyPair();
        throw new Error(
          updateError?.message || "Remplacement de la clé refusé par le serveur."
        );
      }

      try {
        await saveBackupToAccount(pair.backup);
      } catch (err) {
        // La clé est remplacée sur le serveur ; on garde la clé locale.
        console.warn("[useCryptoKeys] Sauvegarde non enregistrée.");
        throw err;
      }

      published.delete(userId);
      setRetry((n) => n + 1);
    },
    [userId]
  );

  // Récupération et validation de la clé publique d'un destinataire.
  const fetchRecipientPublicKey = useCallback(async (recipientId) => {
    if (!recipientId || typeof recipientId !== "string") {
      return null;
    }

    try {
      const { data, error: fetchError } = await supabase
        .from("profiles")
        .select("public_key")
        .eq("id", recipientId)
        .maybeSingle();

      if (fetchError) {
        console.warn(
          "[useCryptoKeys] Lecture de la clé destinataire impossible:",
          fetchError.message
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
    mode,
    setupKeys,
    unlockKeys,
    resetKeys,
    fetchRecipientPublicKey,
  };
}
