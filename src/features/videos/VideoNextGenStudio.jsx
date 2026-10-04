import { useState } from "react";
import { Bot, BrainCircuit, Check, ChevronRight, Clapperboard, Globe2, Handshake, Layers3, MessageCircleQuestion, Mic2, PlaySquare, Sparkles, Trophy, Users, X, Zap } from "lucide-react";
import { COLORS } from "../../theme.js";

const FEATURES = [
  { key: "ai", icon: BrainCircuit, title: "BAARO AI Cut", text: "Détecte les meilleurs moments, propose un hook, un titre et une couverture." },
  { key: "remix", icon: Layers3, title: "Remix intelligent", text: "Remix, réaction, green screen et réponse vidéo avec attribution automatique." },
  { key: "duet", icon: Users, title: "Duo & collaboration", text: "Invitez plusieurs créateurs et construisez une vidéo ensemble." },
  { key: "chapters", icon: Clapperboard, title: "Chapitres interactifs", text: "Transformez les vidéos longues en navigation instantanée par moments." },
  { key: "poll", icon: Zap, title: "Vidéo interactive", text: "Sondages, questions et choix qui influencent la suite du contenu." },
  { key: "translate", icon: Globe2, title: "Voix multilingue", text: "Préparez sous-titres et doublage multilingue sans changer de vidéo." },
  { key: "challenge", icon: Trophy, title: "Défis BAARO", text: "Lancez un challenge, classez les participations et récompensez la communauté." },
  { key: "creator", icon: Bot, title: "Coach créateur", text: "Suggestions de hook, rythme, hashtags et moment idéal de publication." },
  { key: "live", icon: Mic2, title: "Live → vidéo", text: "Transformez automatiquement les meilleurs passages d'un live en vidéos." },
  { key: "questions", icon: MessageCircleQuestion, title: "Questions → réponse", text: "Une question devient directement une nouvelle vidéo réponse." },
  { key: "series", icon: PlaySquare, title: "Séries intelligentes", text: "Regroupez automatiquement vos épisodes et reprenez là où l'audience s'est arrêtée." },
  { key: "collab", icon: Handshake, title: "Co-création rémunérée", text: "Préparez le partage de revenus entre créateurs et partenaires." },
];

export default function VideoNextGenStudio({ open, onClose, onCreate }) {
  const [selected, setSelected] = useState(new Set(["ai", "remix", "translate"]));
  if (!open) return null;

  const toggle = (key) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  return (
    <div className="fixed inset-0 z-[140] bg-black/85 backdrop-blur-xl flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full max-w-2xl max-h-[92dvh] overflow-y-auto bg-zinc-950 border border-white/10 rounded-t-3xl sm:rounded-3xl shadow-2xl">
        <div className="sticky top-0 z-10 p-5 bg-zinc-950/95 backdrop-blur border-b border-white/10">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-black" style={{ background: `${COLORS.gold}22`, color: COLORS.gold }}>
                <Sparkles size={13} /> BAARO VIDEO NEXTGEN
              </div>
              <h2 className="text-2xl font-black mt-2">Un studio vidéo nouvelle génération</h2>
              <p className="text-xs text-white/50 mt-1">Crée, remixe, collabore et transforme chaque vidéo en expérience interactive.</p>
            </div>
            <button onClick={onClose} className="h-9 w-9 rounded-full bg-white/10 flex items-center justify-center"><X size={18} /></button>
          </div>
        </div>

        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {FEATURES.map(({ key, icon: Icon, title, text }) => {
            const active = selected.has(key);
            return (
              <button key={key} onClick={() => toggle(key)} className={`text-left p-4 rounded-2xl border transition ${active ? "border-yellow-400/40 bg-yellow-400/[0.08]" : "border-white/10 bg-white/[0.03]"}`}>
                <div className="flex items-start gap-3">
                  <span className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: active ? COLORS.gold : "rgba(255,255,255,.08)", color: active ? "#000" : "#fff" }}>
                    {active ? <Check size={18} /> : <Icon size={18} />}
                  </span>
                  <div className="min-w-0">
                    <div className="font-black text-sm">{title}</div>
                    <div className="text-xs text-white/45 leading-relaxed mt-1">{text}</div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="sticky bottom-0 p-4 bg-zinc-950/95 backdrop-blur border-t border-white/10 flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-2xl bg-white/10 py-3 text-sm font-bold">Fermer</button>
          <button onClick={() => onCreate?.([...selected])} className="flex-[2] rounded-2xl py-3 text-sm font-black flex items-center justify-center gap-2" style={{ background: COLORS.gold, color: "#000" }}>
            <Sparkles size={17} /> Continuer avec {selected.size} outils
            <ChevronRight size={17} />
          </button>
        </div>
      </div>
    </div>
  );
}
