/**
 * src/features/messaging/hooks/useCryptoKeys.js
 * Gestion clés E2E avec IndexedDB + Supabase profiles.public_key
 */
import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../../supabaseClient.js";
import { generateKeyPair, importPrivateKey, importPublicKey } from "../lib/crypto.js";

const DB_NAME = "baaro_keys";
const STORE = "keys";

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getFromIDB(userId) {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(userId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch { return null; }
}

async function saveToIDB(userId, data) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(data, userId);
  } catch {}
}

export function useCryptoKeys(currentUserId) {
  const [privateKey, setPrivateKey] = useState(null);
  const [publicKeyJwk, setPublicKeyJwk] = useState(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!currentUserId) return;
    let cancelled = false;
    (async () => {
      try {
        setError(null);
        let stored = await getFromIDB(currentUserId);
        let privJwk, pubJwk, privKey;

        if (stored?.privateJwk && stored?.publicJwk) {
          privJwk = stored.privateJwk;
          pubJwk = stored.publicJwk;
          privKey = await importPrivateKey(privJwk);
        } else {
          const pair = await generateKeyPair();
          privJwk = pair.privateJwk;
          pubJwk = pair.publicJwk;
          privKey = pair.privateKey;
          await saveToIDB(currentUserId, { privateJwk: privJwk, publicJwk: pubJwk });
          // Upload public key to profile
          try {
            await supabase.from("profiles").update({ public_key: pubJwk }).eq("id", currentUserId);
          } catch {}
        }

        if (!cancelled) {
          setPrivateKey(privKey);
          setPublicKeyJwk(pubJwk);
          setReady(true);
        }
      } catch (e) {
        if (!cancelled) { setError(e.message); setReady(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [currentUserId]);

  const fetchRecipientPublicKey = useCallback(async (recipientId) => {
    try {
      const { data, error } = await supabase.from("profiles").select("public_key").eq("id", recipientId).maybeSingle();
      if (error) throw error;
      return data?.public_key || null;
    } catch (e) {
      console.warn("fetchRecipientPublicKey", e.message);
      return null;
    }
  }, []);

  return { privateKey, publicKeyJwk, ready, error, fetchRecipientPublicKey };
}
