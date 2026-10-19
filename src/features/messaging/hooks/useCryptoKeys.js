import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabaseClient";
import { ensureKeyPair } from "../lib/crypto";

const published = new Set();

export function useCryptoKeys(userId) {
  const [privateKey, setPrivateKey] = useState(null);
  const [publicKeyJwk, setPublicKeyJwk] = useState(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      try {
        const { publicKeyJwk: localPub, privateKey: priv } = await ensureKeyPair();
        if (cancelled) return;
        setPrivateKey(priv);
        setPublicKeyJwk(localPub);
        if (!published.has(userId)) {
          const { data: profile } = await supabase
            .from("profiles").select("public_key").eq("id", userId).maybeSingle();
          let serverKey = null;
          try {
            serverKey = profile?.public_key
              ? typeof profile.public_key === "string" ? JSON.parse(profile.public_key) : profile.public_key
              : null;
          } catch {}
          if (!serverKey || serverKey.n !== localPub.n) {
            const { data: rows, error: upErr } = await supabase
              .from("profiles").update({ public_key: localPub }).eq("id", userId).select("id");
            if (upErr) { console.warn("[useCryptoKeys] upload échoué:", upErr); setError("Clé non publiée : " + upErr.message); }
            else if (!rows || rows.length === 0) { console.warn("[useCryptoKeys] profil introuvable", userId); setError("Profil introuvable"); }
            else published.add(userId);
          } else published.add(userId);
        }
        if (!cancelled) setReady(true);
      } catch (err) {
        console.error("[useCryptoKeys]", err);
        if (!cancelled) setError(err.message || "Erreur crypto");
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const fetchRecipientPublicKey = useCallback(async (recipientId) => {
    const { data, error } = await supabase
      .from("profiles").select("public_key").eq("id", recipientId).maybeSingle();
    if (error || !data?.public_key) return null;
    try {
      return typeof data.public_key === "string" ? JSON.parse(data.public_key) : data.public_key;
    } catch { return null; }
  }, []);

  return { privateKey, publicKeyJwk, ready, error, fetchRecipientPublicKey };
}
