import { useEffect, useMemo, useState } from "react";
import { BarChart3, Clock3, Eye, Heart, MessageCircle, Share2, TrendingUp, X } from "lucide-react";
import { supabase } from "../../../supabaseClient.js";

const FILTERS = [{value:"7",label:"7 jours"},{value:"30",label:"30 jours"},{value:"all",label:"Tout"}];
const seconds = (v) => {
  if (typeof v === "number") return v;
  const a = String(v || "0").split(":").map(Number);
  return a.length===3 ? a[0]*3600+a[1]*60+a[2] : a.length===2 ? a[0]*60+a[1] : (a[0]||0);
};
const time = (n) => {
  n=Math.max(0,Math.round(n||0)); const h=Math.floor(n/3600),m=Math.floor(n%3600/60),s=n%60;
  return h ? `${h} h ${m} min` : m ? `${m} min ${s} s` : `${s} s`;
};
function Metric({icon:Icon,label,value}) {
  return <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-3"><div className="mb-2 flex items-center gap-2 text-xs text-white/60"><Icon size={15}/>{label}</div><div className="text-xl font-extrabold text-white">{value}</div></div>;
}
export default function CreatorInsights({user,onClose}) {
  const [period,setPeriod]=useState("7"),[videos,setVideos]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState("");
  useEffect(()=>{
    let active=true;
    (async()=>{
      if(!user?.id){setError("Connecte-toi pour consulter tes statistiques.");setLoading(false);return;}
      setLoading(true);setError("");
      const {data,error:e}=await supabase.from("videos").select("id,title,duration,views,likes,comments_count,shares_count,watch_ratio_sum,watch_ratio_count,created_at").eq("author_id",user.id).order("created_at",{ascending:false}).limit(500);
      if(!active)return;
      if(e){setError(e.message||"Chargement impossible.");setVideos([]);}else setVideos(data||[]);
      setLoading(false);
    })();
    return ()=>{active=false;};
  },[user?.id]);
  const rows=useMemo(()=>period==="all"?videos:videos.filter(v=>new Date(v.created_at).getTime()>=Date.now()-Number(period)*86400000),[videos,period]);
  const stats=useMemo(()=>{
    const sum=k=>rows.reduce((n,v)=>n+(Number(v[k])||0),0);
    const rs=sum("watch_ratio_sum"),rc=sum("watch_ratio_count");
    const top=rows.filter(v=>Number(v.watch_ratio_count)>0).map(v=>({...v,retention:Number(v.watch_ratio_sum)/Number(v.watch_ratio_count)})).sort((a,b)=>b.retention-a.retention).slice(0,5);
    return {views:sum("views"),likes:sum("likes"),comments:sum("comments_count"),shares:sum("shares_count"),retention:rc?Math.max(0,Math.min(100,rs/rc*100)):null,watch:rows.reduce((n,v)=>n+seconds(v.duration)*Math.max(0,Number(v.watch_ratio_sum)||0),0),top};
  },[rows]);
  const num=n=>new Intl.NumberFormat("fr-FR").format(n||0);
  return <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/80 p-0 backdrop-blur-sm sm:items-center sm:p-4">
    <section className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-3xl border border-white/10 bg-[#101014] p-4 text-white shadow-2xl sm:rounded-3xl">
      <header className="mb-4 flex items-center justify-between"><div className="flex items-center gap-2"><BarChart3 className="text-yellow-400" size={22}/><div><h2 className="text-lg font-extrabold">Creator Intelligence</h2><p className="text-xs text-white/50">Performances de tes vidéos</p></div></div><button type="button" onClick={onClose} aria-label="Fermer" className="rounded-full bg-white/10 p-2"><X size={19}/></button></header>
      <div className="mb-4 flex gap-2">{FILTERS.map(f=><button key={f.value} type="button" onClick={()=>setPeriod(f.value)} className={`rounded-full px-4 py-2 text-xs font-bold ${period===f.value?"bg-yellow-400 text-black":"bg-white/10 text-white/70"}`}>{f.label}</button>)}</div>
      {loading?<p className="py-12 text-center text-sm text-white/60">Chargement…</p>:error?<p className="rounded-xl bg-red-500/10 p-4 text-sm text-red-200">{error}</p>:<>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Metric icon={Eye} label="Vues" value={num(stats.views)}/>
          <Metric icon={TrendingUp} label="Rétention moyenne" value={stats.retention==null?"—":`${stats.retention.toFixed(1)}%`}/>
          <Metric icon={Clock3} label="Temps regardé estimé" value={time(stats.watch)}/>
          <Metric icon={Heart} label="J’aime" value={num(stats.likes)}/>
          <Metric icon={MessageCircle} label="Commentaires" value={num(stats.comments)}/>
          <Metric icon={Share2} label="Partages" value={num(stats.shares)}/>
        </div>
        <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3"><div className="text-sm font-bold">Engagement total</div><div className="mt-1 text-2xl font-extrabold">{num(stats.likes+stats.comments+stats.shares)}</div><p className="mt-1 text-xs text-white/45">J’aime + commentaires + partages</p></div>
        <div className="mt-5"><h3 className="mb-3 flex items-center gap-2 text-sm font-bold"><TrendingUp size={16} className="text-yellow-400"/>Meilleures rétentions</h3>
          {stats.top.length?<div className="space-y-3">{stats.top.map(v=><div key={v.id}><div className="mb-1 flex justify-between gap-3 text-xs"><span className="truncate text-white/80">{v.title||"Vidéo sans titre"}</span><strong>{(v.retention*100).toFixed(1)}%</strong></div><div className="h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-yellow-400" style={{width:`${Math.max(0,Math.min(100,v.retention*100))}%`}}/></div></div>)}</div>:<p className="text-xs text-white/45">Pas encore assez de données de visionnage.</p>}
        </div>
        {!rows.length&&<p className="mt-5 text-center text-xs text-white/45">Aucune vidéo sur cette période.</p>}
        <p className="mt-5 text-[11px] leading-relaxed text-white/40">Le temps regardé est estimé à partir de la durée et des ratios enregistrés. Les relectures distinctes et la répartition géographique ne sont pas encore mesurées.</p>
      </>}
    </section>
  </div>;
}
