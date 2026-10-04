import { ShieldCheck, Sparkles, ChevronRight } from 'lucide-react';
import { FUTURE_MODULES } from '../lib/futureModules.js';

export function FutureModulePanel({ moduleId, onNavigate }) {
  const item = FUTURE_MODULES[moduleId];
  if (!item) return null;
  return (
    <section className="mt-5 mb-3 rounded-2xl border p-4" style={{borderColor:'rgba(45,191,166,.22)',background:'linear-gradient(135deg,rgba(45,191,166,.07),rgba(124,58,237,.07))'}}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><Sparkles size={15} style={{color:'#22d3ee'}}/><h3 className="text-sm font-bold">{item.title}</h3><span className="text-[9px] rounded-full px-2 py-0.5" style={{background:'rgba(45,191,166,.12)',color:'#5eead4'}}>FUTUR</span></div>
          <p className="text-[11px] mt-1 opacity-60">Fonctionnalités conçues pour rester contrôlables, explicables et sécurisées.</p>
        </div>
        <ShieldCheck size={18} style={{color:'#5eead4'}} />
      </div>
      <div className="flex flex-wrap gap-1.5 mt-3">{item.capabilities.map((x)=><span key={x} className="text-[10px] px-2 py-1 rounded-full border opacity-80">{x}</span>)}</div>
      <div className="flex flex-wrap gap-2 mt-3">{item.actions.map((x,i)=><button key={x} type="button" onClick={()=>onNavigate?.(moduleId,x,i)} className="text-[10px] font-semibold px-3 py-1.5 rounded-xl border hover:bg-white/5 transition flex items-center gap-1"><span>{x}</span><ChevronRight size={12}/></button>)}</div>
    </section>
  );
}
