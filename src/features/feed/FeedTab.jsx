//... garde tous tes imports

// REMPLACE CE BLOC dans ton fichier (ligne ~ 380):
{/* 2. Actions sociales avancées */}
<SocialPostEnhancements post={post} userId={meId} />

// AVANT tu avais ça séparé:
{post.author_id!== meId && <TipButton recipientId={post.author_id} postId={post.id} />}
<div className="flex items-center gap-2 text-[10px]" style={{ color: COLORS.muted }}>
  <span>👁 {Number(post.views_count || 0)} vues</span>
  <span>·</span>
  <span>❤️ {Number(post.likes || 0)} likes</span>
</div>

// APRÈS - NOUVELLE BARRE UNIFIÉE AVEC POURBOIRE ARGENT RÉEL:
<div className="flex items-center justify-between gap-2 pt-1 flex-wrap">
  <div className="flex items-center gap-2 text-[11px] font-medium" style={{ color: COLORS.muted }}>
    <span className="flex items-center gap-1">👁️ {Number(post.views_count || 0)} vues</span>
    <span>·</span>
    <span className="flex items-center gap-1">❤️ {Number(post.likes || 0)} likes</span>
    {post.author_id === meId && (
      <>
        <button type="button" onClick={() => setEngagement({ type: "postViews", id: post.id })} className="ml-2 text-[10px] underline hover:text-white">Voir les vues</button>
        <button type="button" onClick={() => setEngagement({ type: "postLikes", id: post.id })} className="text-[10px] underline hover:text-white">Voir les likes</button>
      </>
    )}
  </div>

  <div className="flex items-center gap-2">
    {post.author_id!== meId && (
      <TipButton
        recipientId={post.author_id}
        postId={post.id}
        // 👇 Pourboire en vrai argent, pas en points
        label="💸 Pourboire"
        className="h-8 px-3 rounded-full text-xs font-bold border"
        style={{ background: `${COLORS.gold}18`, borderColor: COLORS.borderGold, color: COLORS.gold }}
      />
    )}
    <button className="w-8 h-8 rounded-full border flex items-center justify-center" style={{background: COLORS.surface2, borderColor: COLORS.border}}>🔖</button>
    <button className="w-8 h-8 rounded-full border flex items-center justify-center" style={{background: COLORS.surface2, borderColor: COLORS.border}}>↗️</button>
  </div>
</div>
