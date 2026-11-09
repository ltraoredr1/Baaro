import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../../supabaseClient.js";
import {
  ensureKeyPair,
  adoptLegacyKeyPair,
  clearLocalKeyPair,
  restoreFromBackup,
  restoreFromPinBackup,
  verifyPinBackup,
  rewrapPinBackup,
  hasDeviceEscrow,
  buildPinBackupFromDeviceEscrow,
  rewrapLegacyBackupWithPin,
  computePinProof,
  isValidPin,
} from "../lib/crypto";

/**
 * Modes de récupération exposés à l'interface :
 *  - "setup"  : compte sans clé → choisir un PIN à 4 chiffres
 *  - "unlock" : clé du compte absente de cet appareil, sauvegarde disponible
 *               → saisir le PIN (ou, pour les anciens comptes, l'ancien code long)
 *  - "reset"  : clé du compte absente et aucune sauvegarde
 *               → nouvelle clé (anciens messages illisibles sur cet appareil)
 *
 * backupKind : "pin" (sauvegarde serveur protégée par PIN, essais limités)
 *              ou "legacy" (ancien code de récupération long, dans user_metadata).
 */

// ─── API de sauvegarde par PIN (api/e2e-backup.js) ───────────────────────────

const API_BASE = (
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE_URL) ||
  ""
).replace(/\/$/, "");

function formatLock(lockedUntil) {
  const ms = new Date(lockedUntil).getTime() - Date.now();
  const minutes = Math.max(1, Math.ceil(ms / 60000));

  if (minutes < 60) return `${minutes} min`;
  if (minutes < 60 * 48) return `${Math.ceil(minutes / 60)} h`;
  return `${Math.ceil(minutes / 1440)} jours`;
}

async function callBackupApi(action, payload = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;

  if (!token) throw new Error("Session requise.");

  const res = await fetch(`${API_BASE}/api/e2e-backup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ action, ...payload }),
  });

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    if (res.status === 429 && json.lockedUntil) {
      throw new Error(
        `Trop d'essais. Réessaie dans ${formatLock(json.lockedUntil)}.`
      );
    }

    if (res.status === 401 && action === "restore") {
      const left = json.attemptsLeft;
      throw new Error(
        json.lockedUntil
          ? `PIN incorrect. Trop d'essais : réessaie dans ${formatLock(json.lockedUntil)}.`
          : `PIN incorrect. ${left} essai${left > 1 ? "s" : ""} restant${left > 1 ? "s" : ""}.`
      );
    }

    throw new Error(json.error || "Sauvegarde de la clé indisponible.");
  }

  return json;
}

// Statut de la sauvegarde PIN. Un échec réseau ne doit jamais faire croire
// qu'il n'y a pas de sauvegarde (sinon on proposerait de créer une 2e clé).
async function fetchPinStatus() {
  try {
    return await callBackupApi("status");
  } catch (err) {
    console.warn("[useCryptoKeys] Statut sauvegarde PIN indisponible :", err);
    return null;
  }
}

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

// Sauvegarde PIN : envoi de la preuve + de la clé chiffrée au serveur.
async function savePinBackupToServer(pinAuth) {
  await callBackupApi("save", pinAuth);
}

// ─── Rappel de vérification du PIN (jours 1, 7 et 30) ────────────────────────
// Un PIN qu'on ne saisit jamais s'oublie : on invite à le ressaisir à intervalles espacés.
const PIN_CHECK_PREFIX = "baaro_e2e_pin_check:";
const PIN_CHECK_DELAYS_MS = [1, 7, 30].map((d) => d * 24 * 60 * 60 * 1000);

function readPinCheck(userId) {
  try {
    const raw = JSON.parse(localStorage.getItem(PIN_CHECK_PREFIX + userId) || "null");
    return raw && Number.isFinite(raw.t) && Number.isInteger(raw.stage) ? raw : null;
  } catch {
    return null;
  }
}
function writePinCheck(userId, value) {
  try {
    localStorage.setItem(PIN_CHECK_PREFIX + userId, JSON.stringify(value));
  } catch {
    // ignoré
  }
}
function isPinCheckDue(record) {
  return (
    !!record &&
    record.stage < PIN_CHECK_DELAYS_MS.length &&
    Date.now() >= record.t + PIN_CHECK_DELAYS_MS[record.stage]
  );
}

// Récupère la sauvegarde PIN côté serveur après vérification de la preuve.
// Les mauvais PIN comptent dans la limite d'essais du serveur.
async function fetchPinBackupData(pin) {
  const status = await callBackupApi("status");

  if (!status?.exists) {
    throw new Error("Aucune sauvegarde de clé trouvée pour ce compte.");
  }

  if (status.lockedUntil) {
    throw new Error(`Trop d'essais. Réessaie dans ${formatLock(status.lockedUntil)}.`);
  }

  const proof = await computePinProof(pin, status.salt, status.iter);

  return callBackupApi("restore", { proof });
}

// ─── Ancien code de récupération (comptes créés avant le PIN) ────────────────
// Un code long affiché une seule fois pouvait être en attente de confirmation.
const PENDING_CODE_PREFIX = "baaro_e2e_code_pending:";

function readPendingCode(userId) {
  try {
    return localStorage.getItem(PENDING_CODE_PREFIX + userId) || null;
  } catch {
    return null;
  }
}
function clearPendingCode(userId) {
  try {
    localStorage.removeItem(PENDING_CODE_PREFIX + userId);
  } catch {
    // ignoré
  }
}

// Erreurs liées à la clé locale : on propose la récupération au lieu de bloquer.
const KEY_ERROR_RE =
  /autre clé publique|paire de clés|clé privée (cryptographique )?invalide|clé publique rsa invalide/i;

export function useCryptoKeys(userId) {
  const [privateKey, setPrivateKey] = useState(null);
  const [publicKeyJwk, setPublicKeyJwk] = useState(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState(null); // "setup" | "unlock" | "reset" | null
  const [backupKind, setBackupKind] = useState(null); // "pin" | "legacy" | null
  const [retry, setRetry] = useState(0);
  const [pinReminderDue, setPinReminderDue] = useState(false);
  const [canResetPin, setCanResetPin] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState(null);

  useEffect(() => {
    let cancelled = false;

    setPrivateKey(null);
    setPublicKeyJwk(null);
    setReady(false);
    setError(null);
    setMode(null);
    setBackupKind(null);
    setRecoveryCode(null);

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

        const hasLegacyBackup = !!user.user_metadata?.e2e_backup;
        const pinStatus = await fetchPinStatus();
        const hasPinBackup = !!pinStatus?.exists;

        hasBackup = hasLegacyBackup || hasPinBackup;

        if (!cancelled) {
          setBackupKind(hasPinBackup ? "pin" : hasLegacyBackup ? "legacy" : null);
        }

        await requestPersistentStorage();

        const serverPublicKey = await getProfilePublicKey(userId);

        // La clé est propre à CE compte. Elle n'est créée automatiquement que si le compte n'en a encore aucune.
        let pair = null;

        try {
          pair = await ensureKeyPair({ userId, allowCreate: false });
        } catch (err) {
          // Clé locale illisible / corrompue : on passe en récupération.
          console.warn("[useCryptoKeys] Clé locale illisible :", err);
          pair = null;
        }

        // Ancienne clé unique d'avant les clés par compte : reprise seulement si elle est bien la nôtre.
        // Ne bloque jamais : en cas d'échec, on bascule simplement en récupération.
        if (!pair && serverPublicKey) {
          try {
            pair = await adoptLegacyKeyPair(userId, serverPublicKey);
          } catch (err) {
            console.warn("[useCryptoKeys] Reprise de l'ancienne clé impossible :", err);
            pair = null;
          }
        }

        // Le statut de la sauvegarde est inconnu (réseau) alors que le compte a déjà une clé :
        // ne jamais proposer la réinitialisation, qui ferait perdre l'historique.
        if (!pair && serverPublicKey && !hasBackup && pinStatus === null) {
          throw new Error(
            "Impossible de vérifier ta sauvegarde de clé. Vérifie ta connexion et réessaie."
          );
        }

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
        setRecoveryCode(readPendingCode(userId));
        setReady(true);
      } catch (err) {
        console.error("[useCryptoKeys]", err);

        if (!cancelled) {
          if (KEY_ERROR_RE.test(err?.message || "")) {
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

  // Rappel : démarre le compteur à la première utilisation du PIN, puis espace les vérifications.
  useEffect(() => {
    if (!userId || !ready || backupKind !== "pin") {
      setPinReminderDue(false);
      return;
    }

    let record = readPinCheck(userId);

    if (!record) {
      record = { t: Date.now(), stage: 0 };
      writePinCheck(userId, record);
    }

    setPinReminderDue(isPinCheckDue(record));
  }, [userId, ready, backupKind]);

  // « PIN oublié » possible seulement si cet appareil garde la copie de secours de la clé.
  useEffect(() => {
    if (!userId || !ready) {
      setCanResetPin(false);
      return undefined;
    }

    let off = false;
    hasDeviceEscrow(userId).then((ok) => {
      if (!off) setCanResetPin(ok);
    });

    return () => {
      off = true;
    };
  }, [userId, ready]);

  // ─── Actions de récupération ──────────────────────────────────────────────

  // Première configuration : crée la clé + la sauvegarde protégée par PIN (4 chiffres).
  const setupKeys = useCallback(async (pin) => {
    if (!isValidPin(pin)) {
      throw new Error("Le PIN doit contenir exactement 4 chiffres.");
    }

    const pair = await ensureKeyPair({ userId, allowCreate: true, pin });

    if (!pair?.pinAuth) {
      throw new Error("Une clé existe déjà sur cet appareil.");
    }

    try {
      await savePinBackupToServer(pair.pinAuth);
    } catch (err) {
      await clearLocalKeyPair(userId);
      throw err;
    }

    writePinCheck(userId, { t: Date.now(), stage: 0 });
    setRetry((n) => n + 1);
  }, [userId]);

  // Nouvel appareil / stockage vidé : restaure la clé depuis la sauvegarde.
  // secret = PIN à 4 chiffres (sauvegarde "pin") ou ancien code long (sauvegarde "legacy").
  const unlockKeys = useCallback(
    async (secret, newPin) => {
      let restored;

      if (backupKind === "pin") {
        if (!isValidPin(secret)) {
          throw new Error("Le PIN doit contenir exactement 4 chiffres.");
        }

        // Le PIN ne quitte jamais l'appareil : seule une preuve dérivée est envoyée.
        const data = await fetchPinBackupData(secret);

        restored = await restoreFromPinBackup(data, secret, userId);
      } else {
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

        restored = await restoreFromBackup(backup, secret, userId);

        // Migration vers le PIN : l'ancien code long ne sera plus nécessaire.
        // Un échec ici ne bloque pas le déverrouillage (l'ancien code reste valable).
        if (isValidPin(newPin)) {
          try {
            const pinAuth = await rewrapLegacyBackupWithPin(backup, secret, newPin);
            await savePinBackupToServer(pinAuth);
            writePinCheck(userId, { t: Date.now(), stage: 0 });
          } catch (err) {
            console.warn("[useCryptoKeys] Migration vers le PIN impossible :", err);
          }
        }
      }

      const serverKey = await getProfilePublicKey(userId);

      if (serverKey && !samePublicKey(serverKey, restored.publicKeyJwk)) {
        await clearLocalKeyPair(userId);
        throw new Error(
          "Cette sauvegarde ne correspond plus à la clé du compte. " +
            "Utilisez la réinitialisation."
        );
      }

      setRetry((n) => n + 1);
    },
    [userId, backupKind]
  );

  // Aucune sauvegarde (ou PIN oublié) : nouvelle clé protégée par un nouveau PIN.
  // Les anciens messages ne seront plus lisibles avec cette nouvelle clé.
  const resetKeys = useCallback(
    async (pin) => {
      if (!isValidPin(pin)) {
        throw new Error("Le PIN doit contenir exactement 4 chiffres.");
      }

      // Réinitialisation voulue : l'ancienne clé locale (devenue inutile) est remplacée.
      await clearLocalKeyPair(userId);
      const pair = await ensureKeyPair({ userId, allowCreate: true, pin });

      if (!pair?.pinAuth) {
        throw new Error("Création de la nouvelle clé impossible.");
      }

      const { data, error: updateError } = await supabase
        .from("profiles")
        .update({ public_key: pair.publicKeyJwk })
        .eq("id", userId)
        .select("id");

      if (updateError || !data?.length) {
        await clearLocalKeyPair(userId);
        throw new Error(
          updateError?.message || "Remplacement de la clé refusé par le serveur."
        );
      }

      try {
        // Remplace aussi l'ancienne sauvegarde PIN (et remet les essais à zéro).
        await savePinBackupToServer(pair.pinAuth);
        writePinCheck(userId, { t: Date.now(), stage: 0 });
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

  // Vérifie que l'utilisateur se souvient de son PIN (sans modifier la clé locale).
  const verifyPin = useCallback(async (pin) => {
    if (!isValidPin(pin)) {
      throw new Error("Le PIN doit contenir exactement 4 chiffres.");
    }

    const data = await fetchPinBackupData(pin);
    await verifyPinBackup(data, pin);

    const record = readPinCheck(userId) || { t: Date.now(), stage: 0 };
    writePinCheck(userId, { ...record, stage: record.stage + 1 });
    setPinReminderDue(false);

    return true;
  }, [userId]);

  // Changement de PIN : l'ancien PIN est requis, la clé et l'historique sont conservés.
  const changePin = useCallback(async (oldPin, newPin) => {
    if (!isValidPin(oldPin) || !isValidPin(newPin)) {
      throw new Error("Le PIN doit contenir exactement 4 chiffres.");
    }

    if (oldPin === newPin) {
      throw new Error("Le nouveau PIN doit être différent de l'ancien.");
    }

    const data = await fetchPinBackupData(oldPin);
    const pinAuth = await rewrapPinBackup(data, oldPin, newPin);

    await savePinBackupToServer(pinAuth);

    // Nouveau PIN : le cycle de rappels repart de zéro.
    writePinCheck(userId, { t: Date.now(), stage: 0 });
    setPinReminderDue(false);

    return true;
  }, [userId]);

  // PIN oublié (appareil conservé) — étape 1 : code de vérification par SMS ou e-mail.
  const sendPinResetCode = useCallback(async () => {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user || user.id !== userId) {
      throw new Error("Vérification de session impossible.");
    }

    if (user.phone) {
      const phone = user.phone.startsWith("+") ? user.phone : `+${user.phone}`;
      const { error: otpError } = await supabase.auth.signInWithOtp({
        phone,
        options: { shouldCreateUser: false },
      });
      if (otpError) throw new Error("Envoi du code impossible : " + otpError.message);
      return "sms";
    }

    if (user.email) {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: user.email,
        options: { shouldCreateUser: false },
      });
      if (otpError) throw new Error("Envoi du code impossible : " + otpError.message);
      return "email";
    }

    throw new Error("Aucun téléphone ni e-mail pour vérifier ton identité.");
  }, [userId]);

  // PIN oublié — étape 2 : code reçu + nouveau PIN. L'historique est conservé.
  const resetPinWithCode = useCallback(async (code, newPin) => {
    if (!isValidPin(newPin)) {
      throw new Error("Le PIN doit contenir exactement 4 chiffres.");
    }

    const token = String(code || "").trim();
    if (!token) throw new Error("Saisis le code reçu.");

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user || user.id !== userId) {
      throw new Error("Vérification de session impossible.");
    }

    const { data, error: verifyError } = user.phone
      ? await supabase.auth.verifyOtp({
          phone: user.phone.startsWith("+") ? user.phone : `+${user.phone}`,
          token,
          type: "sms",
        })
      : await supabase.auth.verifyOtp({ email: user.email, token, type: "email" });

    if (verifyError) throw new Error("Code incorrect ou expiré.");
    if (data?.user?.id !== userId) {
      throw new Error("Ce code ne correspond pas à ce compte.");
    }

    // Identité revérifiée : on ré-enveloppe la clé de cet appareil avec le nouveau PIN.
    const pinAuth = await buildPinBackupFromDeviceEscrow(userId, newPin);
    await savePinBackupToServer(pinAuth);

    writePinCheck(userId, { t: Date.now(), stage: 0 });
    setBackupKind("pin");
    setPinReminderDue(false);

    return true;
  }, [userId]);

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

  // L'utilisateur confirme avoir noté son code : il n'est plus conservé ni affiché.
  const acknowledgeRecoveryCode = useCallback(() => {
    clearPendingCode(userId);
    setRecoveryCode(null);
  }, [userId]);

  return {
    privateKey,
    publicKeyJwk,
    ready,
    error,
    mode,
    backupKind,
    recoveryCode,
    acknowledgeRecoveryCode,
    pinReminderDue,
    verifyPin,
    changePin,
    canResetPin,
    sendPinResetCode,
    resetPinWithCode,
    setupKeys,
    unlockKeys,
    resetKeys,
    fetchRecipientPublicKey,
  };
}
