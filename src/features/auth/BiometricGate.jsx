import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Fingerprint } from "lucide-react";
import { supabase } from "../../supabaseClient.js";
import { useSettings } from "../../hooks/useSettings.js";
import {
  isBiometricAvailable,
  hasBiometric,
  enableBiometric,
  verifyBiometric,
} from "../../lib/biometric.js";

const OK_KEY = "baaro_bio_ok";
const FRESH_KEY = "baaro_bio_fresh";
const SKIP_KEY = "baaro_bio_skip";

const ss = {
  get: (k) => { try { return sessionStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { sessionStorage.setItem(k, v); } catch {} },
  del: (k) => { try { sessionStorage.removeItem(k); } catch {} },
};

export default function BiometricGate({ children }) {
  const { settings } = useSettings();
  const biometricSetting = !!settings?.biometric;

  const [state, setState] = useState("checking"); // checking | locked | enroll | open
  const [userId, setUserId] = useState(null);
  const [label, setLabel] = useState("Membre BAARO");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Sur l'APK, le verrou natif (nativeSettings.js) fait déjà le travail
      if (Capacitor.isNativePlatform()) {
        setState("open");
        return;
      }
      const { data } = await supabase.auth.getSession();
      const user = data?.session?.user;
      if (cancelled) return;
      if (!user || user.is_anonymous) {
        setState("open");
        return;
      }

      // Connexion toute fraîche par mot de passe : pas de double demande
      if (ss.get(FRESH_KEY) === "1") {
        ss.set(OK_KEY, user.id);
        ss.set(SKIP_KEY, user.id);
        ss.del(FRESH_KEY);
      }

      setUserId(user.id);
      setLabel(user.phone || "Membre BAARO");

      // Empreinte déjà enregistrée sur cet appareil : verrou normal
      if (hasBiometric(user.id)) {
        setState(ss.get(OK_KEY) === user.id ? "open" : "locked");
        return;
      }

      // Réglage actif (cloud) mais empreinte absente de cet appareil : proposer
      if (
        biometricSetting &&
        ss.get(SKIP_KEY) !== user.id &&
        (await isBiometricAvailable())
      ) {
        if (!cancelled) setState("enroll");
        return;
      }

      setState("open");
    })();
    return () => { cancelled = true; };
  }, [biometricSetting]);

  const unlock = async () => {
    setError("");
    const ok = await verifyBiometric(userId);
    if (ok) {
      ss.set(OK_KEY, userId);
      setState("open");
    } else {
      setError("Empreinte non reconnue. Réessaie ou utilise ton mot de passe.");
    }
  };

  // Déclenchement automatique du scan quand l'écran de verrou apparaît
  useEffect(() => {
    if (state === "locked") unlock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const enroll = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    const ok = await enableBiometric(userId, label);
    setBusy(false);
    if (ok) setState("open");
    else setError("Activation annulée ou impossible sur cet appareil.");
  };

  const later = () => {
    ss.set(SKIP_KEY, userId);
    setState("open");
  };

  const usePassword = async () => {
    ss.del(OK_KEY);
    await supabase.auth.signOut();
    window.location.reload();
  };

  if (state === "checking") return null;
  if (state === "open") return children;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-950 text-slate-100">
      <div className="w-full max-w-sm text-center space-y-5">
        <h1 className="text-3xl font-black text-amber-400">BAARO</h1>

        {state === "locked" ? (
          <>
            <p className="text-sm text-slate-400">Déverrouille avec ton empreinte</p>
            <button
              type="button"
              onClick={unlock}
              className="mx-auto w-20 h-20 rounded-full flex items-center justify-center bg-gradient-to-tr from-amber-500 to-teal-400 text-slate-950 active:scale-95 transition"
            >
              <Fingerprint size={40} />
            </button>
            {error && <p className="text-xs text-rose-400">{error}</p>}
            <button
              type="button"
              onClick={usePassword}
              className="text-xs text-slate-400 hover:text-slate-200 underline"
            >
              Utiliser mon mot de passe
            </button>
          </>
        ) : (
          <>
            <p className="text-sm text-slate-300">
              Le déverrouillage par empreinte est activé sur ton compte.
              Veux-tu l'enregistrer sur cet appareil ?
            </p>
            <button
              type="button"
              onClick={enroll}
              disabled={busy}
              className="w-full py-3 rounded-xl font-bold text-sm bg-gradient-to-r from-amber-500 to-teal-400 text-slate-950 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Fingerprint size={18} />
              {busy ? "…" : "Enregistrer mon empreinte"}
            </button>
            {error && <p className="text-xs text-rose-400">{error}</p>}
            <button
              type="button"
              onClick={later}
              className="text-xs text-slate-400 hover:text-slate-200 underline"
            >
              Plus tard
            </button>
          </>
        )}
      </div>
    </div>
  );
}
