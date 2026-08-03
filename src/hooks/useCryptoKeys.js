/**
 * Hook de gestion des clés E2E.
 * - Génère la paire si absente
 * - Upload la clé publique dans profiles.public_key
 * - Expose privateKey pour le déchiffrement
 */
import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabaseClient";
import {
  ensureKeyPair,
  getLocalPrivateKey,
  getLocalPublicKeyJwk,
} from "../lib/crypto";

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
        const { publicKeyJwk: localPub, privateKey: priv } =
          await ensureKeyPair();

        if (cancelled) return;

        setPrivateKey(priv);
        setPublicKeyJwk(localPub);

        const { data: profile } = await supabase
          .from("profiles")
          .select("public_key")
          .eq("user_id", userId)
          .maybeSingle();

        const serverKey = profile?.public_key
          ? typeof profile.public_key === "string"
            ? JSON.parse(profile.public_key)
            : profile.public_key
          : null;

        const needsUpload =
          !serverKey ||
          JSON.stringify(serverKey) !== JSON.stringify(localPub);

        if (needsUpload) {
          const { error: upErr } = await supabase
            .from("profiles")
            .update({ public_key: localPub })
            .eq("user_id", userId);

          if (upErr) {
            console.warn("[useCryptoKeys] Upload clé publique échoué:", upErr);
          }
        }

        if (!cancelled) setReady(true);
      } catch (err) {
        console.error("[useCryptoKeys]", err);
        if (!cancelled) setError(err.message || "Erreur crypto");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const fetchRecipientPublicKey = useCallback(async (recipientId) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("public_key")
      .eq("user_id", recipientId)
      .maybeSingle();

    if (error || !data?.public_key) return null;

    try {
      return typeof data.public_key === "string"
        ? JSON.parse(data.public_key)
        : data.public_key;
    } catch {
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
