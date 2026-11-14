import { useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { COLORS } from "../theme.js";
import { useToast } from "./ToastContext.jsx";
import {
  usePushState,
  enablePush,
  disablePushOnDevice,
  setAccountPush,
} from "../lib/pushState.js";

const STATUS = {
  unsupported: "Non supporté sur ce navigateur / appareil.",
  denied:
    "Bloqué dans les paramètres du système ou du navigateur. Autorisez les notifications pour BAARO, puis revenez ici.",
  permission: "Autorisation non accordée sur cet appareil.",
  optedOut: "Désactivées sur cet appareil.",
  accountOff: "Coupées pour votre compte (tous vos appareils).",
};

/**
 * Notifications push : l'état affiché est l'état réel (voir lib/pushState.js).
 * Le composant ne modifie plus `notif_push` : c'est un reflet calculé.
 */
export function PushSettings() {
  const { showToast } = useToast();
  const { state } = usePushState();
  const [busy, setBusy] = useState(false);

  const run = async (fn, okMsg, okKind = "success") => {
    setBusy(true);
    try {
      const res = await fn();
      if (res?.ok === false) showToast(res.error || "Erreur", "error");
      else showToast(okMsg, okKind);
    } finally {
      setBusy(false);
    }
  };

  const box = {
    background: COLORS.surface,
    borderColor: COLORS.borderTeal,
  };

  if (!state) {
    return (
      <div className="rounded-2xl p-4 border text-xs" style={{ ...box, color: COLORS.muted }}>
        …
      </div>
    );
  }

  if (state.reason === "unsupported") {
    return (
      <div className="rounded-2xl p-4 border text-xs" style={{ ...box, color: COLORS.muted }}>
        {STATUS.unsupported}
      </div>
    );
  }

  const btn = "flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-xs font-bold transition disabled:opacity-50";
  const gold = { background: "linear-gradient(135deg, #D9AE52 0%, #2DBFA6 100%)", color: COLORS.bg };

  return (
    <div className="rounded-2xl p-5 border flex flex-col gap-3" style={box}>
      <p className="text-xs" style={{ color: COLORS.muted }}>
        Recevez des alertes pour les messages, lives et récompenses.
      </p>
      <p className="text-[11px]" style={{ color: state.effective ? COLORS.teal : COLORS.muted }}>
        {state.effective ? "✓ Actives sur cet appareil" : STATUS[state.reason]}
      </p>

      {state.effective && (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={() => run(disablePushOnDevice, "Notifications désactivées sur cet appareil", "info")}
            className={btn}
            style={{ background: COLORS.surface2, border: `1px solid ${COLORS.border}`, color: COLORS.ivory }}
          >
            <BellOff size={14} />
            {busy ? "…" : "Désactiver sur cet appareil"}
          </button>
          <p className="text-[10px]" style={{ color: COLORS.muted }}>
            Vos autres appareils ne sont pas modifiés.
          </p>
        </>
      )}

      {state.reason === "accountOff" && (
        <button
          type="button"
          disabled={busy}
          onClick={() => run(() => setAccountPush(true), "Notifications réactivées")}
          className={btn}
          style={gold}
        >
          <Bell size={14} />
          {busy ? "…" : "Réactiver pour mon compte"}
        </button>
      )}

      {(state.reason === "permission" || state.reason === "optedOut") && (
        <button
          type="button"
          disabled={busy}
          onClick={() => run(enablePush, "Notifications activées")}
          className={btn}
          style={gold}
        >
          <Bell size={14} />
          {busy ? "…" : "Activer sur cet appareil"}
        </button>
      )}
    </div>
  );
}

export default PushSettings;
