//... dans le map:
{allPosts.map((post) => {
  const p = post.profiles;
  const isOwn = post.author_id === userId;
  const displayText = post.content || post.text || post.caption || "";

  return (
    <article key={post.id} className="glass-card p-4">
      <div className="flex gap-3">
        <img src={p?.avatar_url} className="w-10 h-10 rounded-full" style={{ borderColor: COLORS.borderGold }} alt="" />
        <div className="flex-1 min-w-0">
          <div className="flex justify-between">
            <span className="font-bold" style={{color: COLORS.ivory}}>{p?.display_name} <span style={{color: COLORS.muted}}>@{p?.handle}</span></span>
            {isOwn && <button onClick={()=>setOpenMenuId(post.id)} className="w-8 h-8 rounded-full" style={{background: COLORS.surface2}}>⋯</button>}
          </div>

          {/* LE TEXTE QUI MANQUAIT */}
          {displayText && (
            <div className="mt-2 text-[15px] leading-6 whitespace-pre-wrap" style={{color: COLORS.ivory}}>
              {displayText}
            </div>
          )}

          {post.media_url && <img src={post.media_url} className="mt-3 rounded-xl w-full max-h-[480px] object-contain" alt="" />}
          <div className="mt-3"><SocialPostEnhancements post={post} user_id={userId} /></div>
        </div>
      </div>
    </article>
  );
})}
