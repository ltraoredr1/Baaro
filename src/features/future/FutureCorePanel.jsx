import { useEffect, useState } from "react";
import { supabase } from "../../supabaseClient.js";
import {
  Bot,
  ShieldAlert,
  Languages,
  WifiOff,
  Store,
  Activity,
  KeyRound,
  Download,
  ChevronRight,
  Video,
  Database,
} from "lucide-react";

const MODULES = [
  {
    key: "ai_editing",
    title: "AI Editing (Gemini)",
    desc: "Smart hooks, chapitrage automatique, surbrillance et cadrage intelligent.",
    icon: Video,
  },
  {
    key: "translator",
    title: "Traduction universelle",
    desc: "Sous-titres, doublage vocal et traduction texte instantanée par Gemini.",
    icon: Languages,
  },
  {
    key: "safety",
    title: "Modération & Anti-arnaque",
    desc: "Analyse contextuelle des liens, détection d'abus et modération préventive.",
    icon: ShieldAlert,
  },
  {
    key: "trust",
    title: "Trust ID",
    desc: "Identité et réputation explicables, contestables et vérifiables.",
    icon: KeyRound,
  },
  {
    key: "media_r2",
    title: "Média & Streaming R2",
    desc: "Uploads directs sécurisés, encodage HLS et diffusion rapide sans latence.",
    icon: Database,
  },
  {
    key: "offline",
    title: "Offline-first",
    desc: "File locale chiffrée et synchronisation différée résiliente.",
    icon: WifiOff,
  },
  {
    key: "commerce",
    title: "Commerce & Paiements",
    desc: "Découverte produits, vendeurs vérifiés, Stripe et suivi des commandes.",
    icon: Store,
  },
  {
    key: "creator",
    title: "Creator Economy & Coach",
    desc: "Analyse d'audience, conseils de croissance IA, abonnements et pourboires.",
    icon: Activity,
  },
];

export function FutureCorePanel({ user_id }) {
  const [prefs, setPrefs] = useState({});
  const [busy, setBusy] = useState(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!user_id) return;
    supabase
      .from("future_preferences")
      .select("module_key,enabled")
      .eq("user_id", user_id)
      .then(({ data }) => {
        const next = {};
        for (const row of data || []) next[row.module_key] = row.enabled;
        setPrefs(next);
      });
  }, [user_id]);

  async function toggle(moduleKey) {
    if (!user_id || busy) return;
    setBusy(moduleKey);
    setNotice("");
    const enabled = prefs[moduleKey] === false ? true : !(prefs[moduleKey] ?? true);

    const { error } = await supabase.from("future_preferences").upsert(
      { user_id: user_id, module_key: moduleKey, enabled },
      { onConflict: "user_id,module_key" }
    );

    if (error) {
      setNotice("Impossible d'enregistrer cette préférence pour le moment.");
    } else {
      setPrefs((p) => ({ ...p, [moduleKey]: enabled }));
    }
    setBusy(null);
  }

  async function exportData() {
    if (!user_id) return;
    setBusy("export");
    setNotice("");

    const { data, error } = await supabase.rpc("future_export_user_data");
    if (error) {
      setNotice("L'export est temporairement indisponible.");
    } else {
      const blob = new Blob([JSON.stringify(data || {}, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `baaro-data-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setNotice("Export préparé. Aucun secret ni jeton n'est inclus.");
    }
    setBusy(null);
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white">BAARO Core Intelligence v2.0</h2>
          <p className="text-xs text-white/45">
            Contrôlez les capacités avancées et modules IA de votre compte.
          </p>
        </div>
        <button
          onClick={exportData}
          disabled={busy === "export"}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[.04] px-3 py-2 text-xs font-semibold text-white/75 disabled:opacity-40 transition hover:bg-white/10"
        >
          <Download size={15} /> Exporter mes données
        </button>
      </div>

      {notice && (
        <div className="rounded-xl border border-amber-300/20 bg-amber-300/5 px-3 py-2 text-xs text-amber-200">
          {notice}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {MODULES.map(({ key, title, desc, icon: Icon }) => {
          const enabled = prefs[key] ?? true;
          return (
            <button
              key={key}
              onClick={() => toggle(key)}
              disabled={busy === key}
              className="group text-left rounded-2xl border border-white/10 bg-white/[.025] p-4 transition hover:bg-white/[.055] disabled:opacity-50"
            >
              <div className="flex items-center justify-between">
                <span className="rounded-xl bg-cyan-300/10 p-2 text-cyan-300">
                  <Icon size={18} />
                </span>
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    enabled ? "bg-emerald-400" : "bg-white/20"
                  }`}
                />
              </div>
              <h3 className="mt-3 font-semibold text-white text-sm">{title}</h3>
              <p className="mt-1 text-xs leading-5 text-white/45">{desc}</p>
              <span className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold text-white/45 group-hover:text-white/70">
                {enabled ? "Activé" : "Désactivé"}
                <ChevronRight size={13} />
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export default FutureCorePanel;
