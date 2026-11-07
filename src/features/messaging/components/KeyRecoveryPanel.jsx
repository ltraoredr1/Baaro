/**
 * BAARO — Écran de configuration / récupération des clés de chiffrement.
 *
 * mode "setup"  : première configuration (créer une phrase secrète)
 * mode "unlock" : nouvel appareil → saisir la phrase pour retrouver l'historique
 * mode "reset"  : aucune sauvegarde → nouvelle clé (anciens messages illisibles)
 */
import { useState } from "react";
import { Loader2, Lock } from "lucide-react";

export function KeyRecoveryPanel({ mode, C, onSetup, onUnlock, onReset }) {
  const [view, setView] = useState(mode); // permet de passer de "unlock" à "reset"
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const needsConfirm = view === "setup" || view === "reset";

  const texts = {
    setup: {
      title: "Protège tes messages",
      body: "Crée une phrase secrète. Elle te permettra de retrouver tes conversations sur un nouvel appareil. Note-la : elle ne peut pas être récupérée si tu l'oublies.",
      button: "Activer la messagerie sécurisée",
    },
    unlock: {
      title: "Retrouve tes conversations",
      body: "Saisis ta phrase secrète pour déverrouiller tes anciens messages sur cet appareil.",
      button: "Déverrouiller",
    },
    reset: {
      title: "Nouvelle clé de chiffrement",
      body: "Aucune sauvegarde n'est disponible. Une nouvelle clé sera créée : les anciens messages ne seront pas lisibles sur cet appareil. Choisis une phrase secrète pour protéger la nouvelle clé.",
      button: "Créer une nouvelle clé",
    },
  }[view];

  const submit = async (e) => {
    e.preventDefault();
    setErr("");

    if (pass.length < 8) {
      setErr("La phrase secrète doit contenir au moins 8 caractères.");
      return;
    }
    if (needsConfirm && pass !== pass2) {
      setErr("Les deux phrases ne sont pas identiques.");
      return;
    }

    setBusy(true);
    try {
      if (view === "setup") await onSetup(pass);
      else if (view === "unlock") await onUnlock(pass);
      else await onReset(pass);
      setPass("");
      setPass2("");
    } catch (error) {
      setErr(error?.message || "Opération impossible.");
    } finally {
      setBusy(false);
    }
  };

  const inputStyle = {
    background: C.surface,
    borderColor: C.borderGold,
    color: C.ivory,
  };

  return (
    <div className="flex flex-col items-center px-6 py-12 max-w-md mx-auto w-full">
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center mb-4"
        style={{ background: C.surface2 }}
      >
        <Lock size={24} style={{ color: C.gold }} />
      </div>

      <h3 className="text-lg font-bold mb-2 text-center" style={{ color: C.ivory }}>
        {texts.title}
      </h3>
      <p className="text-sm text-center mb-6" style={{ color: C.muted }}>
        {texts.body}
      </p>

      <form onSubmit={submit} className="w-full space-y-3">
        <input
          type="password"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          placeholder="Phrase secrète"
          autoComplete="off"
          className="w-full px-4 py-3 rounded-2xl border text-sm outline-none"
          style={inputStyle}
        />

        {needsConfirm && (
          <input
            type="password"
            value={pass2}
            onChange={(e) => setPass2(e.target.value)}
            placeholder="Confirmer la phrase secrète"
            autoComplete="off"
            className="w-full px-4 py-3 rounded-2xl border text-sm outline-none"
            style={inputStyle}
          />
        )}

        {err && (
          <p role="alert" className="text-xs" style={{ color: "#fca5a5" }}>
            {err}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full py-3 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
          style={{
            background: `linear-gradient(135deg, ${C.gold}, #C49A3C)`,
            color: "#0B1220",
          }}
        >
          {busy && <Loader2 size={16} className="animate-spin" />}
          {texts.button}
        </button>

        {view === "unlock" && (
          <button
            type="button"
            onClick={() => {
              setErr("");
              setView("reset");
            }}
            className="w-full text-xs py-2"
            style={{ color: C.muted }}
          >
            Phrase oubliée ? Créer une nouvelle clé
          </button>
        )}
      </form>
    </div>
  );
}
