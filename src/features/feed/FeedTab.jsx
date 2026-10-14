// DANS FeedTab.jsx - remplace le menu ⋯ par celui-ci:

{/* MENU 3 POINTS */}
<div className="relative">
  <button onClick={() => setOpenMenuId(openMenuId === post.id ? null : post.id)} 
    className="w-8 h-8 rounded-full flex items-center justify-center" 
    style={{ background: COLORS.surface2 }}>⋯</button>
  
  {openMenuId === post.id && (
    <div className="absolute right-0 top-10 z-20 w-44 rounded-xl border p-1 shadow-xl" 
      style={{ background: COLORS.surface, borderColor: COLORS.border }}>
      
      {isOwn ? (
        <>
          <button onClick={() => { setEditingId(post.id); setEditText(displayText); setOpenMenuId(null); }} 
            className="w-full text-left px-3 py-2.5 rounded-lg text-sm hover:bg-white/5" 
            style={{ color: COLORS.ivory }}>✏️ Modifier</button>
          <button onClick={async()=>{ setOpenMenuId(null); if(confirm("Supprimer ce post?")){await supabase.from("posts").delete().eq("id", post.id); refresh();}}} 
            className="w-full text-left px-3 py-2.5 rounded-lg text-sm text-red-400 hover:bg-white/5">🗑️ Supprimer</button>
        </>
      ) : (
        <>
          <button onClick={async()=>{ setOpenMenuId(null); const raison=prompt("Pourquoi signaler?"); if(raison){await supabase.from("reports").insert({post_id: post.id, reason: raison}); alert("✅ Signalé, merci");}}} 
            className="w-full text-left px-3 py-2.5 rounded-lg text-sm hover:bg-white/5" 
            style={{ color: COLORS.ivory }}>🚩 Signaler</button>
          <button onClick={()=>{setOpenMenuId(null); alert("Tu ne verras plus ce post");}} 
            className="w-full text-left px-3 py-2.5 rounded-lg text-sm hover:bg-white/5" 
            style={{ color: COLORS.muted }}>🙈 Ne plus voir</button>
          <button onClick={()=>{setOpenMenuId(null); alert("Utilisateur bloqué");}} 
            className="w-full text-left px-3 py-2.5 rounded-lg text-sm text-red-400 hover:bg-white/5">⛔ Bloquer</button>
        </>
      )}
    </div>
  )}
</div>
