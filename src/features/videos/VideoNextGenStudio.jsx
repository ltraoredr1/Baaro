import { useEffect, useState } from "react";
import {
  BarChart3,
  Bot,
  BrainCircuit,
  CalendarClock,
  Check,
  ChevronRight,
  Clapperboard,
  Gauge,
  Globe2,
  Handshake,
  Layers3,
  Leaf,
  MessageCircleQuestion,
  Mic2,
  PlaySquare,
  Sparkles,
  Trophy,
  Type,
  Users,
  X,
  Zap,
} from "lucide-react";
import { COLORS } from "../../theme.js";
import { SAVER_MODES, SPEEDS } from "./hooks/usePlaybackSettings.js";

const STORAGE_KEY = "baaro:studio-features";
const DEFAULT_SELECTION = ["ai", "remix", "translate"];

const FEATURES = [
  { key: "ai", icon: BrainCircuit, title: "BAARO AI Cut", text: "Détecte les meilleurs moments, propose un hook, un titre et une couverture." },
  { key: "subtitles", icon: Type, title: "Sous-titres automatiques", text: "Transcription synchronisée, lisible même sans le son.", isNew: true },
  { key: "remix", icon: Layers3, title: "Remix intelligent", text: "Remix, réaction, green screen et réponse vidéo avec attribution automatique." },
  { key: "duet", icon: Users, title: "Duo & collaboration", text: "Invitez plusieurs créateurs et construisez une vidéo ensemble." },
  { key: "chapters", icon: Clapperboard, title: "Chapitres interactifs", text: "Transformez les vidéos longues en navigation instantanée par moments." },
  { key: "poll", icon: Zap, title: "Vidéo interactive", text: "Sondages, questions et choix qui influencent la suite du contenu." },
  { key: "translate", icon: Globe2, title: "Voix multilingue", text: "Préparez sous-titres et doublage multilingue sans changer de vidéo." },
  { key: "challenge", icon: Trophy, title: "Défis BAARO", text: "Lancez un challenge, classez les participations et récompensez la communauté." },
  { key: "creator", icon: Bot, title: "Coach créateur", text: "Suggestions de hook, rythme, hashtags et moment idéal de publication." },
  { key: "schedule", icon: CalendarClock, title: "Publication programmée", text: "Choisissez le meilleur créneau : la vidéo sort quand votre audience est là.", isNew: true },
  { key: "insights", icon: BarChart3, title: "Analyse d'audience", text: "Où les gens décrochent, ce qui est rejoué, d'où viennent les vues.", isNew: true },
  { key: "live", icon: Mic2, title: "Live → vidéo", text: "Transformez automatiquement les meilleurs passages d'un live en vidéos." },
  { key: "questions", icon: MessageCircleQuestion, title: "Questions → réponse", text: "Une question devient directement une nouvelle vidéo réponse." },
  { key: "series", icon: PlaySquare, title: "Séries intelligentes", text: "Regroupez automatiquement vos épisodes et reprenez là où l'audience s'est arrêtée." },
  { key: "collab", icon: Handshake, title: "Co-création rémunérée", text: "Préparez le partage de revenus entre créateurs et partenaires." },
];

const VALID_KEYS = new Set(FEATURES.map((feature) => feature.key));

const SAVER_LABEL = { auto: "Auto", on: "Activé", off: "Désactivé" };

function readSelection() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));

    if (Array.isArray(stored)) {
      return new Set(stored.filter((key) => VALID_KEYS.has(key)));
    }
  } catch {
    // ignore : on retombe sur la sélection par défaut
  }

  return new Set(DEFAULT_SELECTION);
}

function Switch({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition ${
        checked ? "bg-yellow-400" : "bg-white/15"
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
          checked ? "left-[22px]" : "left-0.5"
        }`}
      />
    </button>
  );
}

export default function VideoNextGenStudio({
  open,
  onClose,
  onCreate,
  settings,
  onSettingsChange,
  dataSaverActive = false,
}) {
  const [selected, setSelected] = useState(readSelection);

  // Mémorise le choix d'outils.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...selected]));
    } catch {
      // stockage indisponible
    }
  }, [selected]);

  // Échap pour fermer + blocage du défilement de la page derrière.
  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };

    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  const toggle = (key) =>
    setSelected((prev) => {
      const next = new Set(prev);

      if (next.has(key)) next.delete(key);
      else next.add(key);

      return next;
    });

  const count = selected.size;
  const hasSettings = !!settings && !!onSettingsChange;

  return (
    <div
      className="fixed inset-0 z-[140] flex items-end justify-center bg-black/85 p-0 text-white backdrop-blur-xl sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Studio vidéo NextGen"
        className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-3xl border border-white/10 bg-zinc-950 shadow-2xl sm:rounded-3xl"
      >
        <div className="sticky top-0 z-10 border-b border-white/10 bg-zinc-950/95 p-5 backdrop-blur">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div
                className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10px] font-black"
                style={{ background: `${COLORS.gold}22`, color: COLORS.gold }}
              >
                <Sparkles size={13} /> BAARO VIDEO NEXTGEN
              </div>
              <h2 className="mt-2 text-2xl font-black">
                Un studio vidéo nouvelle génération
              </h2>
              <p className="mt-1 text-xs text-white/50">
                Crée, remixe, collabore et transforme chaque vidéo en
                expérience interactive.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fermer"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {hasSettings && (
          <section className="mx-4 mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <h3 className="mb-3 text-sm font-black">Lecture du flux</h3>

            <div className="space-y-4">
              <div>
                <div className="mb-2 flex items-center gap-2 text-xs font-bold">
                  <Leaf size={14} className="text-emerald-400" />
                  Économie de données
                  {dataSaverActive && (
                    <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] text-emerald-300">
                      active
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {SAVER_MODES.map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      aria-pressed={settings.dataSaver === mode}
                      onClick={() => onSettingsChange({ dataSaver: mode })}
                      className={`rounded-xl py-2 text-xs font-bold transition ${
                        settings.dataSaver === mode
                          ? "bg-yellow-400 text-black"
                          : "bg-white/10 text-white/70"
                      }`}
                    >
                      {SAVER_LABEL[mode]}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-[11px] leading-relaxed text-white/40">
                  Pas de préchargement de la vidéo suivante. « Auto »
                  s'active sur réseau lent ou en mode économie de données du
                  téléphone.
                </p>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-bold">Lecture continue</div>
                  <div className="text-[11px] text-white/40">
                    Passe seul à la suite (sinon la vidéo boucle).
                  </div>
                </div>
                <Switch
                  checked={settings.autoNext}
                  onChange={(value) => onSettingsChange({ autoNext: value })}
                  label="Lecture continue"
                />
              </div>

              <div>
                <div className="mb-2 flex items-center gap-2 text-xs font-bold">
                  <Gauge size={14} /> Vitesse
                </div>
                <div className="flex gap-2">
                  {SPEEDS.map((speed) => (
                    <button
                      key={speed}
                      type="button"
                      aria-pressed={settings.speed === speed}
                      onClick={() => onSettingsChange({ speed })}
                      className={`flex-1 rounded-xl py-2 text-xs font-bold transition ${
                        settings.speed === speed
                          ? "bg-yellow-400 text-black"
                          : "bg-white/10 text-white/70"
                      }`}
                    >
                      ×{speed}
                    </button>
                  ))}
                </div>
              </div>

              <p className="text-[11px] text-white/35">
                Raccourcis clavier : ↑ ↓ naviguer · Espace pause · M son · L
                like · C commentaires · F plein écran
              </p>
            </div>
          </section>
        )}

        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
          {FEATURES.map(({ key, icon: Icon, title, text, isNew }) => {
            const active = selected.has(key);

            return (
              <button
                key={key}
                type="button"
                aria-pressed={active}
                onClick={() => toggle(key)}
                className={`rounded-2xl border p-4 text-left transition ${
                  active
                    ? "border-yellow-400/40 bg-yellow-400/[0.08]"
                    : "border-white/10 bg-white/[0.03]"
                }`}
              >
                <div className="flex items-start gap-3">
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                    style={{
                      background: active ? COLORS.gold : "rgba(255,255,255,.08)",
                      color: active ? "#000" : "#fff",
                    }}
                  >
                    {active ? <Check size={18} /> : <Icon size={18} />}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-black">
                      {title}
                      {isNew && (
                        <span className="rounded-full bg-emerald-400/15 px-1.5 py-0.5 text-[9px] font-black text-emerald-300">
                          NOUVEAU
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-xs leading-relaxed text-white/45">
                      {text}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="sticky bottom-0 flex gap-3 border-t border-white/10 bg-zinc-950/95 p-4 backdrop-blur">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-2xl bg-white/10 py-3 text-sm font-bold"
          >
            Fermer
          </button>
          <button
            type="button"
            onClick={() => onCreate?.([...selected])}
            className="flex flex-[2] items-center justify-center gap-2 rounded-2xl py-3 text-sm font-black"
            style={{ background: COLORS.gold, color: "#000" }}
          >
            <Sparkles size={17} />
            {count === 0
              ? "Continuer sans outil"
              : `Continuer avec ${count} outil${count > 1 ? "s" : ""}`}
            <ChevronRight size={17} />
          </button>
        </div>
      </div>
    </div>
  );
}
