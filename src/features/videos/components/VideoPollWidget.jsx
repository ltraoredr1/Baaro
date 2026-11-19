import { useEffect, useMemo, useState } from "react";
import { BarChart3, Check, Plus, Send } from "lucide-react";
import { supabase } from "../../../supabaseClient.js";

const getOptions = (value) => Array.isArray(value)
  ? value.map((x) => typeof x === "string" ? x : String(x?.option_key || x?.key || x?.label || "")).filter(Boolean)
  : [];

export default function VideoPollWidget({ video, user, isOwner }) {
  const [poll,setPoll]=useState(null), [results,setResults]=useState([]);
  const [voted,setVoted]=useState(false), [open,setOpen]=useState(false);
  const [loading,setLoading]=useState(true), [busy,setBusy]=useState(false), [error,setError]=useState("");
  const [question,setQuestion]=useState(""), [options,setOptions]=useState(["",""]), [selected,setSelected]=useState([]);

  useEffect(()=>{
    let active=true;
    (async()=>{
      const {data,error:e}=await supabase.from("video_polls")
        .select("id,question,options,allow_multiple,created_at,duration_seconds")
        .eq("video_id",video.id).order("created_at",{ascending:false}).limit(1).maybeSingle();
      if(!active)return;
      if(e){setError("Sondage indisponible.");setLoading(false);return;}
      setPoll(data||null);
      if(data&&user?.id){
        const {data:mine}=await supabase.from("video_poll_votes").select("option_key")
          .eq("poll_id",data.id).eq("user_id",user.id);
        if(!active)return;
        const keys=(mine||[]).map(x=>x.option_key);setSelected(keys);setVoted(keys.length>0);
        if(keys.length||isOwner){
          const {data:res}=await supabase.rpc("get_video_poll_results",{p_poll_id:data.id});
          if(active&&res?.results)setResults(res.results);
        }
      }
      setLoading(false);
    })();
    return ()=>{active=false;};
  },[video.id,user?.id,isOwner]);

  const list=useMemo(()=>getOptions(poll?.options),[poll?.options]);
  const total=results.reduce((n,x)=>n+Number(x.votes||0),0);

  const create=async()=>{
    const opts=options.map(x=>x.trim()).filter(Boolean);
    if(!question.trim()||opts.length<2||opts.length>4||new Set(opts.map(x=>x.toLowerCase())).size!==opts.length){
      setError("Question requise et 2 à 4 choix différents.");return;
    }
    setBusy(true);setError("");
    const {data,error:e}=await supabase.rpc("create_video_poll",{
      p_video_id:video.id,p_question:question.trim(),p_options:opts,
      p_duration_seconds:null,p_allow_multiple:false
    });
    if(e)setError(e.message?.includes("POLL_ALREADY_EXISTS")?"Un sondage existe déjà.":"Création impossible.");
    else {setPoll(data);setOpen(true);}
    setBusy(false);
  };

  const vote=async()=>{
    if(!selected.length||busy||!poll||!user?.id)return;
    setBusy(true);setError("");
    const {data,error:e}=await supabase.rpc("vote_video_poll",{p_poll_id:poll.id,p_option_keys:selected});
    if(e)setError(e.message?.includes("POLL_CLOSED")?"Sondage terminé.":"Vote non enregistré.");
    else {setVoted(true);setResults(data?.results||[]);}
    setBusy(false);
  };

  if(loading||(!poll&&!isOwner))return null;
  return <div className="mt-2" onClick={e=>e.stopPropagation()}>
    <button type="button" onClick={()=>setOpen(x=>!x)} className="inline-flex items-center gap-2 rounded-full border border-yellow-400/40 bg-black/70 px-3 py-2 text-xs font-bold text-yellow-200">
      <BarChart3 size={15}/>{poll?"Sondage":"Créer un sondage"}
    </button>
    {open&&<div className="mt-2 rounded-2xl border border-white/15 bg-black/95 p-3 shadow-xl">
      {!poll?<div className="space-y-2">
        <input value={question} onChange={e=>setQuestion(e.target.value)} maxLength={240} placeholder="Pose ta question…" className="w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm text-white"/>
        {options.map((v,i)=><input key={i} value={v} maxLength={80} onChange={e=>setOptions(old=>old.map((x,j)=>j===i?e.target.value:x))} placeholder={`Choix ${i+1}`} className="w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm text-white"/>)}
        {options.length<4&&<button type="button" onClick={()=>setOptions(x=>[...x,""])} className="flex items-center gap-1 text-xs text-yellow-200"><Plus size={14}/>Ajouter un choix</button>}
        <button type="button" disabled={busy} onClick={create} className="w-full rounded-xl bg-yellow-400 px-3 py-2 text-sm font-black text-black">{busy?"Création…":"Publier le sondage"}</button>
      </div>:<>
        <p className="mb-3 text-sm font-bold">{poll.question}</p>
        <div className="space-y-2">{list.map(option=>{
          const count=Number(results.find(x=>x.option_key===option)?.votes||0),pct=total?Math.round(count/total*100):0;
          return <button key={option} type="button" disabled={voted||busy} onClick={()=>setSelected([option])} className={`relative w-full overflow-hidden rounded-xl border px-3 py-2 text-left text-xs ${selected.includes(option)?"border-yellow-300":"border-white/15"}`}>
            {voted&&<span className="absolute inset-y-0 left-0 bg-yellow-400/20" style={{width:`${pct}%`}}/>}
            <span className="relative flex justify-between gap-2"><span>{option}</span>{voted?<b>{pct}% · {count}</b>:selected.includes(option)?<Check size={14}/>:null}</span>
          </button>;
        })}</div>
        {!voted&&user?.id&&<button type="button" disabled={!selected.length||busy} onClick={vote} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-yellow-400 px-3 py-2 text-sm font-black text-black"><Send size={14}/>{busy?"Envoi…":"Voter"}</button>}
        {!user?.id&&<p className="mt-2 text-xs text-white/60">Connecte-toi pour voter.</p>}
        {voted&&<p className="mt-2 text-[11px] text-white/50">{total} vote(s)</p>}
      </>}
      {error&&<p className="mt-2 text-xs text-red-300">{error}</p>}
    </div>}
  </div>;
}
