import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../supabaseClient.js";
import { Sparkles, Brain, ShieldCheck, Compass, Target, Database, Zap, Globe2, LockKeyhole, ArrowRight } from "lucide-react";
import { FutureCorePanel } from "../future/FutureCorePanel.jsx";

const PILLARS = [
  ["Nexus AI", "Une IA personnelle contrôlée par l'utilisateur : contexte, traduction, création, apprentissage et automatisation.", Brain],
  ["Intent Engine", "BAARO comprend l'objectif d'une personne et assemble recherche, communauté, contenu, commerce ou apprentissage autour de cet objectif.", Target],
  ["Trust Graph", "Une réputation explicable basée sur des événements vérifiables, plutôt qu'un score opaque.", ShieldCheck],
  ["Private Memory", "Mémoire facultative, limitée par portée et supprimable. Pas de mémoire cachée imposée.", LockKeyhole],
  ["Universal Discovery", "Une même recherche traverse personnes, posts, vidéos, stories, communautés, débats, entreprises et commerce.", Compass],
  ["BAARO Spaces", "Des espaces qui réunissent discussion, fichiers, événements, apprentissage, tâches et commerce autour d'un même projet.", Globe2],
  ["Creator OS", "Création assistée par IA, distribution, audience, monétisation et propriété des contenus dans un même parcours.", Zap],
  ["Data Vault", "Séparation stricte entre identité, médias, données applicatives et mémoire IA, avec export et contrôle utilisateur.", Database],
];

export function InnovationHub({ user_id }) {
  const [boot, setBoot] = useState(null);
  const [goal, setGoal] = useState("");
  const [goals, setGoals] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user_id) return;
    let active = true;
    (async () => {
      const [{ data: bootData }, { data: goalData }] = await Promise.all([
        supabase.rpc("nexus_bootstrap"),
        supabase.from("nexus_goals").select("id,title,status,progress").eq("user_id", user_id).eq("status", "active").order("updated_at", { ascending: false }).limit(6),
      ]);
      if (active) { setBoot(bootData || null); setGoals(goalData || []); }
    })();
    return () => { active = false; };
  }, [user_id]);

  const activeGoals = useMemo(() => goals.length, [goals]);

  async function addGoal(event) {
    event.preventDefault();
    const title = goal.trim();
    if (!title || !user_id || busy) return;
    setBusy(true);
    const { data } = await supabase.from("nexus_goals").insert({ user_id: user_id, title, status: 'active', progress: 0 }).select("id,title,status,progress").single();
    if (data) setGoals(current => [data, ...current].slice(0, 6));
    setGoal("");
    setBusy(false);
  }

  return (
    <section className="space-y-5 pb-24">
      <header className="overflow-hidden rounded-3xl border border-amber-300/15 bg-gradient-to-br from-amber-400/10 via-white/[0.04] to-cyan-400/10 p-5 sm:p-8">
        <div className="flex items-start gap-4">
          <div className="rounded-2xl bg-amber-300/15 p-3"><Sparkles size={26} className="text-amber-300" /></div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-amber-300">BAARO FUTURE NEXUS</p>
            <h1 className="mt-1 text-3xl font-black tracking-tight text-white">Un système d'exploitation social.</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/65">L'objectif n'est pas de reproduire les réseaux existants. BAARO relie intention, identité, confiance, IA, création, communauté, apprentissage et commerce tout en laissant l'utilisateur contrôler ses données.</p>
          </div>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Piliers" value={PILLARS.length} />
          <Stat label="Objectifs actifs" value={activeGoals} />
          <Stat label="Trust score" value={boot?.trust_score ?? "—"} />
          <Stat label="Mémoire IA" value={boot?.memory_enabled ? "ON" : "OFF"} />
        </div>
      </header>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="flex items-center gap-2 text-sm font-bold text-white"><Target size={17} className="text-amber-300" /> Donne un objectif à BAARO</div>
        <p className="mt-1 text-xs text-white/45">Les prochains moteurs pourront transformer cet objectif en parcours personnalisé.</p>
        <form onSubmit={addGoal} className="mt-3 flex gap-2">
          <input value={goal} onChange={e => setGoal(e.target.value)} maxLength={160} placeholder="Ex. trouver des clients pour mon activité" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/30" />
          <button disabled={!goal.trim() || busy} className="rounded-xl bg-amber-300 px-4 py-2 text-sm font-bold text-black disabled:opacity-40">Créer</button>
        </form>
        {goals.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{goals.map(g => <span key={g.id} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white/70">{g.title}</span>)}</div>}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {PILLARS.map(([title, text, Icon]) => (
          <article key={title} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 hover:bg-white/[0.06]">
            <div className="flex items-center justify-between"><span className="rounded-xl bg-white/[0.06] p-2 text-amber-300"><Icon size={19} /></span><ArrowRight size={15} className="text-white/25" /></div>
            <h2 className="mt-4 font-semibold text-white">{title}</h2>
            <p className="mt-1 text-sm leading-5 text-white/50">{text}</p>
          </article>
        ))}
      </div>

      <FutureCorePanel user_id={user_id} />

      <div className="grid gap-3 sm:grid-cols-3">
        <Principle icon={LockKeyhole} title="Privacy by design" text="Mémoire et personnalisation sont des options contrôlables, pas des obligations." />
        <Principle icon={ShieldCheck} title="Trust by evidence" text="La réputation doit être explicable et contestable, pas un classement opaque." />
        <Principle icon={Database} title="Portable by default" text="L'identité, les contenus et les données doivent rester exportables et séparés." />
      </div>
    </section>
  );
}

function Stat({ label, value }) { return <div className="rounded-2xl border border-white/10 bg-black/10 p-3"><div className="text-lg font-black text-white">{value}</div><div className="text-[11px] text-white/45">{label}</div></div>; }
function Principle({ icon: Icon, title, text }) { return <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4"><Icon size={18} className="text-emerald-300" /><h3 className="mt-3 font-semibold text-white">{title}</h3><p className="mt-1 text-sm leading-5 text-white/50">{text}</p></div>; }
