import { useEffect, useState } from 'react';
import { supabase } from '../../supabaseClient.js';
import { COLORS as C } from '../../theme.js';
import { Plus, Eye, Heart, Send, Trash2, Image as ImageIcon, X } from 'lucide-react';
import { EngagementList } from '../../components/EngagementList.jsx';
import { uploadExternalMedia } from '../../lib/externalMedia.js';

export function StoriesTab({ id, onOpenProfile }) {
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [caption, setCaption] = useState('');
  const [mediaFile, setMediaFile] = useState(null);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState(null);
  const [engagement, setEngagement] = useState(null);
  const [counts, setCounts] = useState({});
  const [myLikes, setMyLikes] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');          // erreur de la page
  const [modalMsg, setModalMsg] = useState(null);  // message affiché DANS la fenêtre de la story

  // ------------------------------------------------------------------
  // Chargement
  // ------------------------------------------------------------------
  const load = async (initial = false) => {
    if (initial) setLoading(true);
    try {
      const { data, error } = await supabase
        .from('stories')
        .select('id, author_id, media_url, media_type, caption, background, visibility, expires_at, created_at')
        .gt('expires_at', new Date().toISOString())
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(80);
      if (error) throw error;

      const ids = [...new Set((data || []).map(s => s.author_id).filter(Boolean))];
      let profiles = [];
      if (ids.length) {
        const { data: p, error: pe } = await supabase
          .from('profiles')
          .select('id, display_name, handle, avatar_url, flag')
          .in('id', ids);
        if (pe) throw pe;
        profiles = p || [];
      }
      const map = new Map(profiles.map(p => [p.id, p]));
      const list = (data || []).map(s => ({ ...s, profiles: map.get(s.author_id) || null }));
      setStories(list);

      // Mes likes (pour afficher le cœur plein et permettre de l'enlever)
      if (id && list.length) {
        const { data: mine } = await supabase
          .from('story_reactions')
          .select('story_id')
          .eq('user_id', id)
          .in('story_id', list.map(s => s.id));
        setMyLikes(new Set((mine || []).map(r => r.story_id)));
      }
    } catch (e) {
      console.error('[Stories] load:', e);
      setError('Chargement impossible : ' + (e.message || 'erreur inconnue'));
    } finally {
      setLoading(false);
    }
  };

  const loadCounts = async (storyId) => {
    try {
      const [{ count: views }, { count: likes }] = await Promise.all([
        supabase.from('story_views').select('viewer_id', { count: 'exact', head: true }).eq('story_id', storyId),
        supabase.from('story_reactions').select('user_id', { count: 'exact', head: true }).eq('story_id', storyId),
      ]);
      setCounts(prev => ({ ...prev, [storyId]: { views: views ?? 0, likes: likes ?? 0 } }));
    } catch (e) {
      console.error('[Stories] counts:', e);
    }
  };

  useEffect(() => {
    stories.filter(s => s.author_id === id).forEach(s => loadCounts(s.id));
  }, [stories, id]);

  useEffect(() => {
    load(true);
    const ch = supabase
      .channel('stories_live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stories' }, () => load())
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  // ------------------------------------------------------------------
  // Création
  // ------------------------------------------------------------------
  const create = async () => {
    setError('');
    if (!caption.trim() && !mediaFile) { setError('Ajoute du texte ou un média'); return; }
    if (!id) { setError('Tu dois être connecté'); return; }

    setCreating(true);
    try {
      let mediaUrl = null;
      let mediaType = 'text';
      if (mediaFile) {
        const result = await uploadExternalMedia(mediaFile, {
          folder: 'stories',
          user_id: id,
          maxBytes: 100 * 1024 * 1024,
        });
        mediaUrl = result.url;
        mediaType = mediaFile.type.startsWith('video') ? 'video' : 'image';
      }
      const { error } = await supabase.from('stories').insert({
        author_id: id,
        media_type: mediaType,
        media_url: mediaUrl,
        caption: caption.trim(),
        visibility: 'public',
      });
      if (error) throw error;
      setCaption('');
      setMediaFile(null);
      await load();
    } catch (e) {
      setError('Erreur : ' + (e.message || 'Impossible de créer la story'));
    } finally {
      setCreating(false);
    }
  };

  // ------------------------------------------------------------------
  // Ouvrir une story
  // ------------------------------------------------------------------
  const openStory = async (s) => {
    setModalMsg(null);
    setSelected(s);
    if (s.author_id === id) {
      loadCounts(s.id);            // ma propre vue ne compte pas
    } else if (id) {
      try { await supabase.rpc('record_story_view', { p_story_id: s.id }); } catch { /* non bloquant */ }
    }
  };

  // ------------------------------------------------------------------
  // Like / unlike
  // ------------------------------------------------------------------
  const react = async (s) => {
    if (!id) { setModalMsg({ type: 'error', text: 'Connecte-toi pour réagir.' }); return; }
    if (busy) return;
    setBusy(true);
    setModalMsg(null);
    try {
      if (myLikes.has(s.id)) {
        const { error } = await supabase
          .from('story_reactions').delete().eq('story_id', s.id).eq('user_id', id);
        if (error) throw error;
        setMyLikes(prev => { const n = new Set(prev); n.delete(s.id); return n; });
      } else {
        const { error } = await supabase
          .from('story_reactions')
          .upsert({ story_id: s.id, user_id: id, reaction: '❤️' }, { onConflict: 'story_id,user_id' });
        if (error) throw error;
        setMyLikes(prev => new Set(prev).add(s.id));
      }
      if (s.author_id === id) loadCounts(s.id);
    } catch (e) {
      console.error('[Stories] react:', e);
      setModalMsg({ type: 'error', text: 'Réaction impossible : ' + (e.message || 'erreur') });
    } finally {
      setBusy(false);
    }
  };

  // ------------------------------------------------------------------
  // Partager
  // ------------------------------------------------------------------
  const share = async (s) => {
    setModalMsg(null);
    const text = s.caption || 'Story BAARO';
    const url = s.media_url || window.location.origin;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'BAARO', text, url });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        setModalMsg({ type: 'ok', text: 'Lien copié' });
      } else {
        setModalMsg({ type: 'error', text: 'Partage non disponible sur cet appareil.' });
      }
    } catch (e) {
      if (e?.name !== 'AbortError') setModalMsg({ type: 'error', text: 'Partage impossible.' });
    }
  };

  // ------------------------------------------------------------------
  // Supprimer
  // ------------------------------------------------------------------
  const remove = async (s) => {
    if (s.author_id !== id || busy) return;
    if (!window.confirm('Supprimer cette story ?')) return;
    setBusy(true);
    setModalMsg(null);
    try {
      // Suppression définitive de SA story (autorisée par la règle stories_delete).
      // La suppression « douce » (deleted_at) est impossible ici : la règle de lecture
      // stories_read exige deleted_at IS NULL, donc la base refuse la mise à jour.
      const { data, error } = await supabase
        .from('stories')
        .delete()
        .eq('id', s.id)
        .eq('author_id', id)
        .select('id');
      if (error) {
        console.error('[Stories] delete:', error);
        throw new Error(error.message);
      }
      if (!data?.length) throw new Error('Story introuvable ou déjà supprimée.');
      setStories(prev => prev.filter(x => x.id !== s.id));
      setSelected(null);
    } catch (e) {
      setModalMsg({ type: 'error', text: 'Suppression impossible : ' + (e.message || 'erreur') });
    } finally {
      setBusy(false);
    }
  };

  const isMine = selected && selected.author_id === id;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold" style={{ color: C.ivory }}>Stories</h2>
          <p className="text-xs" style={{ color: C.muted }}>24 h · texte et média</p>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl border" style={{ background: 'rgba(239, 68, 68, 0.1)', borderColor: 'rgba(239, 68, 68, 0.3)', color: '#fca5a5' }}>
          <div className="flex items-center justify-between">
            <span className="text-sm">{error}</span>
            <button onClick={() => setError('')} className="p-1 hover:opacity-70"><X size={14} /></button>
          </div>
        </div>
      )}

      <div className="rounded-2xl p-4 border" style={{ background: C.surface, borderColor: C.border }}>
        <textarea
          value={caption}
          onChange={e => setCaption(e.target.value)}
          placeholder="Créer une story..."
          className="w-full bg-transparent outline-none min-h-20"
          style={{ color: C.ivory }}
        />

        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <label className="flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer active:opacity-70" style={{ borderColor: C.border, color: C.ivory }}>
            <ImageIcon size={16} />
            <span className="text-sm">Ajouter média</span>
            <input
              type="file"
              accept="image/*,video/*"
              onChange={(e) => {
                const file = e.target.files[0];
                if (file) { setMediaFile(file); setError(''); }
                e.target.value = '';
              }}
              className="hidden"
            />
          </label>

          {mediaFile && (
            <div className="flex items-center gap-2">
              <span className="text-xs px-2 py-1 rounded-lg" style={{ background: C.border, color: C.ivory }}>{mediaFile.name}</span>
              <button onClick={() => setMediaFile(null)} className="p-1 rounded-lg hover:opacity-70" style={{ color: C.muted }}><X size={14} /></button>
            </div>
          )}
        </div>

        <div className="flex justify-end mt-3">
          <button
            disabled={creating || (!caption.trim() && !mediaFile)}
            onClick={create}
            className="px-4 py-2 rounded-xl font-semibold flex items-center disabled:opacity-50 active:opacity-80"
            style={{ background: C.gold, color: '#000' }}
          >
            {creating ? 'Publication...' : <><Plus size={16} className="inline mr-1" />Publier</>}
          </button>
        </div>
      </div>

      {loading ? (
        <p style={{ color: C.muted }}>Chargement…</p>
      ) : stories.length === 0 ? (
        <p className="text-sm" style={{ color: C.muted }}>Aucune story pour le moment.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {stories.map(s => (
            <button
              key={s.id}
              onClick={() => openStory(s)}
              className="text-left rounded-2xl overflow-hidden border min-h-48 p-3 flex flex-col justify-between active:opacity-90"
              style={{ background: s.background || C.surface, borderColor: C.border, color: C.ivory }}
            >
              <div>
                <b>{s.profiles?.display_name || 'Membre'}</b>
                <div className="text-xs opacity-70">@{s.profiles?.handle || ''}</div>
              </div>

              {s.media_url && s.media_type !== 'text' ? (
                s.media_type === 'video' ? (
                  <video src={s.media_url} className="w-full h-32 object-cover rounded-lg mb-2" muted playsInline />
                ) : (
                  <img src={s.media_url} alt="story" className="w-full h-32 object-cover rounded-lg mb-2" />
                )
              ) : (
                <p className="text-sm line-clamp-5">{s.caption}</p>
              )}

              <div className="text-[10px] opacity-60 flex items-center justify-between gap-2">
                <span>24 h · {new Date(s.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                {s.author_id === id && <span>👁 {counts[s.id]?.views || 0} · ❤️ {counts[s.id]?.likes || 0}</span>}
              </div>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,.82)' }}
          onClick={() => setSelected(null)}
        >
          <div
            className="w-full max-w-md rounded-3xl p-5 max-h-[90vh] overflow-y-auto"
            style={{ background: C.surface, color: C.ivory }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <b>{selected.profiles?.display_name || 'Story'}</b>
              <button onClick={() => setSelected(null)} className="p-1 active:opacity-70">✕</button>
            </div>

            {selected.media_url && selected.media_type !== 'text' ? (
              selected.media_type === 'video' ? (
                <video src={selected.media_url} className="w-full rounded-lg mb-4" controls autoPlay playsInline />
              ) : (
                <img src={selected.media_url} alt="story" className="w-full rounded-lg mb-4" />
              )
            ) : (
              <p className="text-lg py-8 whitespace-pre-wrap text-center">{selected.caption}</p>
            )}

            {selected.media_url && selected.media_type !== 'text' && selected.caption && (
              <p className="text-sm mb-3 whitespace-pre-wrap">{selected.caption}</p>
            )}

            {/* Message visible DANS la fenêtre (avant, les erreurs étaient cachées derrière) */}
            {modalMsg && (
              <div
                className="p-2 rounded-xl text-xs mb-3"
                style={{
                  background: modalMsg.type === 'error' ? 'rgba(239,68,68,.12)' : 'rgba(16,185,129,.12)',
                  color: modalMsg.type === 'error' ? '#fca5a5' : '#6ee7b7',
                }}
              >
                {modalMsg.text}
              </div>
            )}

            <div className="flex gap-2 flex-wrap items-center mt-4">
              {isMine && (
                <>
                  <button
                    onClick={() => setEngagement({ type: 'storyViews', id: selected.id })}
                    className="px-3 py-2 rounded-xl border text-xs active:opacity-80"
                    style={{ borderColor: C.border }}
                  >
                    👁 Voir les vues
                  </button>
                  <button
                    onClick={() => setEngagement({ type: 'storyLikes', id: selected.id })}
                    className="px-3 py-2 rounded-xl border text-xs active:opacity-80"
                    style={{ borderColor: C.border }}
                  >
                    ❤️ Voir les likes
                  </button>
                </>
              )}

              <button
                onClick={() => react(selected)}
                disabled={busy}
                aria-label="J'aime"
                className="px-3 py-2 rounded-xl border active:opacity-80 disabled:opacity-50"
                style={{ borderColor: C.border, color: myLikes.has(selected.id) ? '#f87171' : C.ivory }}
              >
                <Heart size={16} fill={myLikes.has(selected.id) ? '#f87171' : 'transparent'} />
              </button>

              <button
                onClick={() => share(selected)}
                aria-label="Partager"
                className="px-3 py-2 rounded-xl border active:opacity-80"
                style={{ borderColor: C.border }}
              >
                <Send size={16} />
              </button>

              {isMine && (
                <button
                  onClick={() => remove(selected)}
                  disabled={busy}
                  aria-label="Supprimer"
                  className="px-3 py-2 rounded-xl border text-red-400 active:opacity-80 disabled:opacity-50"
                  style={{ borderColor: C.border }}
                >
                  <Trash2 size={16} />
                </button>
              )}

              {isMine && (
                <span className="ml-auto text-xs opacity-60 flex items-center gap-1">
                  <Eye size={14} /> {counts[selected.id]?.views || 0} vues
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {engagement && (
        <EngagementList
          type={engagement.type}
          targetId={engagement.id}
          ownerId={selected?.author_id || id}
          viewerId={id}
          onClose={() => setEngagement(null)}
        />
      )}
    </div>
  );
}

export default StoriesTab;
