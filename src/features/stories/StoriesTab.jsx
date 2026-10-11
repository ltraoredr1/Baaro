import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '../../supabaseClient.js';
import { COLORS as C } from '../../theme.js';
import { Plus, Eye, Heart, Send, Trash2, Image as ImageIcon, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { EngagementList } from '../../components/EngagementList.jsx';
import { uploadExternalMedia } from '../../lib/externalMedia.js';

const STORY_DURATION = 5000; // 5 secondes par défaut pour les images

export function StoriesTab({ id, onOpenProfile }) {
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [caption, setCaption] = useState('');
  const [mediaFile, setMediaFile] = useState(null);
  const [creating, setCreating] = useState(false);
  
  // États de la visionneuse plein écran améliorée
  const [selectedStoryIndex, setSelectedStoryIndex] = useState(null);
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [mediaLoading, setMediaLoading] = useState(false);

  const [engagement, setEngagement] = useState(null);
  const [counts, setCounts] = useState({});
  const [myLikes, setMyLikes] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');          
  const [modalMsg, setModalMsg] = useState(null);  

  const progressTimer = useRef(null);
  const videoRef = useRef(null);

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
  // Navigation fluide dans la visionneuse (Stories)
  // ------------------------------------------------------------------
  const currentStory = selectedStoryIndex !== null ? stories[selectedStoryIndex] : null;

  const handleNext = useCallback(() => {
    if (selectedStoryIndex !== null) {
      if (selectedStoryIndex < stories.length - 1) {
        setMediaLoading(true);
        setProgress(0);
        setSelectedStoryIndex(prev => prev + 1);
      } else {
        setSelectedStoryIndex(null); // Fin de toutes les stories
      }
    }
  }, [selectedStoryIndex, stories.length]);

  const handlePrevious = useCallback(() => {
    if (selectedStoryIndex !== null) {
      if (selectedStoryIndex > 0) {
        setMediaLoading(true);
        setProgress(0);
        setSelectedStoryIndex(prev => prev - 1);
      }
    }
  }, [selectedStoryIndex]);

  // Gestion du timer de progression pour les images et stories textuelles
  useEffect(() => {
    if (!currentStory || isPaused || mediaLoading) return;

    if (currentStory.media_type !== 'video') {
      const startTime = Date.now();
      const duration = STORY_DURATION;

      const updateProgress = () => {
        const elapsedTime = Date.now() - startTime;
        const currentProgress = (elapsedTime / duration) * 100;

        if (currentProgress >= 100) {
          setProgress(100);
          handleNext();
        } else {
          setProgress(currentProgress);
          progressTimer.current = setTimeout(updateProgress, 50);
        }
      };

      progressTimer.current = setTimeout(updateProgress, 50);

      return () => {
        if (progressTimer.current) clearTimeout(progressTimer.current);
      };
    }
  }, [currentStory, isPaused, mediaLoading, handleNext]);

  // Enregistrement de la vue à l'ouverture d'une story
  const openStory = async (index) => {
    const s = stories[index];
    if (!s) return;
    setModalMsg(null);
    setProgress(0);
    setMediaLoading(true);
    setSelectedStoryIndex(index);

    if (s.author_id === id) {
      loadCounts(s.id);            
    } else if (id) {
      try { await supabase.rpc('record_story_view', { p_story_id: s.id }); } catch { /* non bloquant */ }
    }
  };

  const closeViewer = () => {
    setSelectedStoryIndex(null);
    setProgress(0);
  };

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
      const { data, error } = await supabase
        .from('stories')
        .delete()
        .eq('id', s.id)
        .eq('author_id', id)
        .select('id');
      if (error) throw new Error(error.message);
      if (!data?.length) throw new Error('Story introuvable ou déjà supprimée.');
      setStories(prev => prev.filter(x => x.id !== s.id));
      closeViewer();
    } catch (e) {
      setModalMsg({ type: 'error', text: 'Suppression impossible : ' + (e.message || 'erreur') });
    } finally {
      setBusy(false);
    }
  };

  const isMine = currentStory && currentStory.author_id === id;

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

      {/* Formulaire de création */}
      <div className="rounded-2xl p-4 border shadow-sm backdrop-blur-md" style={{ background: C.surface, borderColor: C.border }}>
        <textarea
          value={caption}
          onChange={e => setCaption(e.target.value)}
          placeholder="Créer une story..."
          className="w-full bg-transparent outline-none min-h-20 resize-none"
          style={{ color: C.ivory }}
        />

        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <label className="flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer active:opacity-70 transition-all hover:bg-white/5" style={{ borderColor: C.border, color: C.ivory }}>
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
              <span className="text-xs px-2.5 py-1 rounded-lg truncate max-w-[200px]" style={{ background: C.border, color: C.ivory }}>{mediaFile.name}</span>
              <button onClick={() => setMediaFile(null)} className="p-1 rounded-lg hover:opacity-70" style={{ color: C.muted }}><X size={14} /></button>
            </div>
          )}
        </div>

        <div className="flex justify-end mt-3">
          <button
            disabled={creating || (!caption.trim() && !mediaFile)}
            onClick={create}
            className="px-4 py-2 rounded-xl font-semibold flex items-center disabled:opacity-50 active:opacity-80 transition-all shadow-md"
            style={{ background: C.gold, color: '#000' }}
          >
            {creating ? 'Publication...' : <><Plus size={16} className="inline mr-1" />Publier</>}
          </button>
        </div>
      </div>

      {/* Grille des stories */}
      {loading ? (
        <p style={{ color: C.muted }}>Chargement…</p>
      ) : stories.length === 0 ? (
        <p className="text-sm" style={{ color: C.muted }}>Aucune story pour le moment.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {stories.map((s, index) => (
            <button
              key={s.id}
              onClick={() => openStory(index)}
              className="text-left rounded-2xl overflow-hidden border min-h-48 p-3 flex flex-col justify-between active:scale-[0.98] transition-all hover:shadow-lg relative group"
              style={{ background: s.background || C.surface, borderColor: C.border, color: C.ivory }}
            >
              <div className="z-10">
                <b className="truncate block">{s.profiles?.display_name || 'Membre'}</b>
                <div className="text-xs opacity-70">@{s.profiles?.handle || ''}</div>
              </div>

              {s.media_url && s.media_type !== 'text' ? (
                s.media_type === 'video' ? (
                  <video src={s.media_url} className="w-full h-32 object-cover rounded-lg my-2 pointer-events-none" muted playsInline />
                ) : (
                  <img src={s.media_url} alt="story" className="w-full h-32 object-cover rounded-lg my-2" />
                )
              ) : (
                <p className="text-sm line-clamp-4 my-auto">{s.caption}</p>
              )}

              <div className="text-[10px] opacity-60 flex items-center justify-between gap-2 z-10">
                <span>{new Date(s.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                {s.author_id === id && <span>👁 {counts[s.id]?.views || 0} · ❤️ {counts[s.id]?.likes || 0}</span>}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* --- VISIONNEUSE PLEIN ÉCRAN AMÉLIORÉE (Modal style Stories Pro) --- */}
      {currentStory && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-md select-none"
          onClick={closeViewer}
        >
          <div
            className="relative w-full h-full sm:w-[420px] sm:h-[85vh] sm:rounded-2xl overflow-hidden bg-zinc-950 shadow-2xl flex flex-col justify-between border border-zinc-800/50"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={() => setIsPaused(true)}
            onMouseUp={() => setIsPaused(false)}
            onTouchStart={() => setIsPaused(true)}
            onTouchEnd={() => setIsPaused(false)}
          >
            {/* Barre de progression supérieure & En-tête */}
            <div className="absolute top-0 inset-x-0 z-30 p-3 bg-gradient-to-b from-black/80 via-black/40 to-transparent space-y-3">
              <div className="flex gap-1.5 w-full">
                {stories.map((s, idx) => {
                  let val = 0;
                  if (idx < selectedStoryIndex) val = 100;
                  else if (idx === selectedStoryIndex) val = progress;
                  return (
                    <div key={s.id} className="h-1 flex-1 bg-white/30 rounded-full overflow-hidden">
                      <div className="h-full bg-white transition-all duration-75 ease-linear" style={{ width: `${val}%` }} />
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-9 h-9 rounded-full overflow-hidden border-2 border-primary bg-zinc-800 flex items-center justify-center text-white font-bold text-sm">
                    {currentStory.profiles?.avatar_url ? (
                      <img src={currentStory.profiles.avatar_url} alt="avatar" className="w-full h-full object-cover" />
                    ) : (
                      (currentStory.profiles?.display_name || 'M')[0]
                    )}
                  </div>
                  <div>
                    <h4 className="text-white text-sm font-semibold tracking-wide">{currentStory.profiles?.display_name || 'Membre'}</h4>
                    <span className="text-zinc-400 text-xs">{new Date(currentStory.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>

                <button
                  onClick={closeViewer}
                  className="p-2 text-white/80 hover:text-white rounded-full bg-black/20 hover:bg-black/40 transition-colors"
                  aria-label="Fermer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Contenu Média central */}
            <div className="absolute inset-0 flex items-center justify-center bg-zinc-900">
              {mediaLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/60 z-20">
                  <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              )}

              {currentStory.media_url && currentStory.media_type !== 'text' ? (
                currentStory.media_type === 'video' ? (
                  <video
                    ref={videoRef}
                    src={currentStory.media_url}
                    className="w-full h-full object-cover"
                    autoPlay
                    playsInline
                    onLoadedData={() => setMediaLoading(false)}
                    onTimeUpdate={(e) => {
                      const v = e.currentTarget;
                      setProgress((v.currentTime / v.duration) * 100);
                    }}
                    onEnded={handleNext}
                  />
                ) : (
                  <img
                    src={currentStory.media_url}
                    alt="story content"
                    className="w-full h-full object-cover"
                    onLoad={() => setMediaLoading(false)}
                  />
                )
              ) : (
                <div className="p-8 text-center w-full">
                  <p className="text-xl whitespace-pre-wrap font-medium" style={{ color: C.ivory }}>{currentStory.caption}</p>
                </div>
              )}
            </div>

            {/* Zones tactiles latérales invisibles pour naviguer */}
            <div className="absolute inset-y-0 left-0 w-1/3 z-20 cursor-pointer" onClick={handlePrevious} />
            <div className="absolute inset-y-0 right-0 w-1/3 z-20 cursor-pointer" onClick={handleNext} />

            {/* Message contextuel dans la modale */}
            {modalMsg && (
              <div
                className="absolute top-20 inset-x-6 z-40 p-2.5 rounded-xl text-xs text-center backdrop-blur-md shadow-lg"
                style={{
                  background: modalMsg.type === 'error' ? 'rgba(239,68,68,0.85)' : 'rgba(16,185,129,0.85)',
                  color: '#fff',
                }}
              >
                {modalMsg.text}
              </div>
            )}

            {/* Barre d'interactions en bas */}
            <div className="absolute bottom-0 inset-x-0 z-30 p-4 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex items-center gap-2">
              {isMine && (
                <>
                  <button
                    onClick={() => setEngagement({ type: 'storyViews', id: currentStory.id })}
                    className="px-3 py-2 rounded-xl border text-xs text-white bg-white/10 hover:bg-white/20 backdrop-blur-md transition-all border-white/20"
                  >
                    👁 {counts[currentStory.id]?.views || 0}
                  </button>
                  <button
                    onClick={() => setEngagement({ type: 'storyLikes', id: currentStory.id })}
                    className="px-3 py-2 rounded-xl border text-xs text-white bg-white/10 hover:bg-white/20 backdrop-blur-md transition-all border-white/20"
                  >
                    ❤️ {counts[currentStory.id]?.likes || 0}
                  </button>
                </>
              )}

              <button
                onClick={() => react(currentStory)}
                disabled={busy}
                aria-label="J'aime"
                className={`p-2.5 rounded-xl backdrop-blur-md transition-all border ${
                  myLikes.has(currentStory.id) ? 'bg-red-500 border-red-500 text-white scale-105' : 'bg-white/10 text-white border-white/20 hover:bg-white/20'
                }`}
              >
                <Heart size={18} fill={myLikes.has(currentStory.id) ? 'currentColor' : 'transparent'} />
              </button>

              <button
                onClick={() => share(currentStory)}
                aria-label="Partager"
                className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white backdrop-blur-md border border-white/20 transition-all"
              >
                <Send size={18} />
              </button>

              {isMine && (
                <button
                  onClick={() => remove(currentStory)}
                  disabled={busy}
                  aria-label="Supprimer"
                  className="p-2.5 rounded-xl bg-red-500/20 hover:bg-red-500/40 text-red-300 backdrop-blur-md border border-red-500/30 ml-auto transition-all"
                >
                  <Trash2 size={18} />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {engagement && (
        <EngagementList
          type={engagement.type}
          targetId={engagement.id}
          ownerId={currentStory?.author_id || id}
          viewerId={id}
          onClose={() => setEngagement(null)}
        />
      )}
    </div>
  );
}

export default StoriesTab;
