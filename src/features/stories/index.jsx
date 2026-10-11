import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '../../supabaseClient.js';
import { COLORS as C } from '../../theme.js';
import { Plus, Eye, Heart, Send, Trash2, Image as ImageIcon, X, HelpCircle, ShoppingBag } from 'lucide-react';
import { EngagementList } from '../../components/EngagementList.jsx';
import { uploadExternalMedia } from '../../lib/externalMedia.js';

// --- IMPORTS DE TOUS LES MODULES ---
import { AudioPicker } from '../../components/AudioPicker.jsx';
import { ConnectionStatus } from '../../components/ConnectionStatus.jsx';
import { FutureModulePanel } from '../../components/FutureModulePanel.jsx';
import { MediaCarousel } from '../../components/MediaCarousel.jsx';
import { PollComposer } from '../../components/PollComposer.jsx';
import { PollDisplay } from '../../components/PollDisplay.jsx';
import ProductCard from '../../components/ProductCard.jsx';
import { RichTextComposer } from '../../components/RichTextComposer.jsx';
import { RichTextRenderer } from '../../components/RichTextRenderer.jsx';
import { TranslateButton } from '../../components/TranslateButton.jsx';
import { AutoTranslate } from '../../components/TranslatedText.jsx';
import { VideoTranslateControls } from '../../components/VideoTranslateControls.jsx';

const STORY_DURATION = 5000;

export function StoriesTab({ id, onOpenProfile }) {
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [caption, setCaption] = useState('');
  
  // --- CARROUSEL MULTI-MÉDIAS ---
  const [mediaItems, setMediaItems] = useState([]); 
  const [selectedMediaIndex, setSelectedMediaIndex] = useState(0);

  // --- AUDIO ---
  const [selectedAudio, setSelectedAudio] = useState(null);

  // --- SONDAGE ---
  const [showPollComposer, setShowPollComposer] = useState(false);
  const [pollData, setPollData] = useState(null);

  // --- PRODUIT BOUTIQUE ---
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [myProducts, setMyProducts] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [cartQuantities, setCartQuantities] = useState({});

  // --- TRADUCTION ---
  const [translatedCaption, setTranslatedCaption] = useState(null);

  // --- ÉTATS VISIONNEUSE ---
  const [creating, setCreating] = useState(false);
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
  // Chargement des Stories
  // ------------------------------------------------------------------
  const load = async (initial = false) => {
    if (initial) setLoading(true);
    try {
      const { data, error } = await supabase
        .from('stories')
        .select('id, author_id, media_url, media_type, caption, audio_url, audio_title, poll, product, background, visibility, expires_at, created_at')
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

  const loadMyProducts = async () => {
    if (!id) return;
    try {
      const { data, error } = await supabase
        .from('shop_products')
        .select('*')
        .eq('user_id', id)
        .eq('is_available', true);
      if (!error && data) {
        setMyProducts(data);
      }
    } catch (e) {
      console.error('[Stories] loadMyProducts:', e);
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
    loadMyProducts();
    const ch = supabase
      .channel('stories_live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stories' }, () => load())
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  // ------------------------------------------------------------------
  // Carrousel de Médias
  // ------------------------------------------------------------------
  const handleAddMediaFiles = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const newItems = files.map(file => ({
      id: Math.random().toString(36).substring(2, 9),
      file,
      type: file.type.startsWith('video') ? 'video' : 'image',
      previewUrl: URL.createObjectURL(file),
      duration: 5,
    }));

    setMediaItems(prev => [...prev, ...newItems].slice(0, 10));
    e.target.value = '';
  };

  const handleMoveMedia = (fromIndex, toIndex) => {
    setMediaItems(prev => {
      const updated = [...prev];
      const [movedItem] = updated.splice(fromIndex, 1);
      updated.splice(toIndex, 0, movedItem);
      return updated;
    });
  };

  const handleRemoveMedia = (mediaId) => {
    setMediaItems(prev => prev.filter(m => m.id !== mediaId));
  };

  // ------------------------------------------------------------------
  // Visionneuse de Story
  // ------------------------------------------------------------------
  const currentStory = selectedStoryIndex !== null ? stories[selectedStoryIndex] : null;

  const handleNext = useCallback(() => {
    if (selectedStoryIndex !== null) {
      if (selectedStoryIndex < stories.length - 1) {
        setMediaLoading(true);
        setProgress(0);
        setTranslatedCaption(null);
        setSelectedStoryIndex(prev => prev + 1);
      } else {
        setSelectedStoryIndex(null);
        setTranslatedCaption(null);
      }
    }
  }, [selectedStoryIndex, stories.length]);

  const handlePrevious = useCallback(() => {
    if (selectedStoryIndex !== null && selectedStoryIndex > 0) {
      setMediaLoading(true);
      setProgress(0);
      setTranslatedCaption(null);
      setSelectedStoryIndex(prev => prev - 1);
    }
  }, [selectedStoryIndex]);

  useEffect(() => {
    if (!currentStory || isPaused || mediaLoading) return;

    if (currentStory.media_type !== 'video') {
      const startTime = Date.now();
      const updateProgress = () => {
        const elapsedTime = Date.now() - startTime;
        const currentProgress = (elapsedTime / STORY_DURATION) * 100;

        if (currentProgress >= 100) {
          setProgress(100);
          handleNext();
        } else {
          setProgress(currentProgress);
          progressTimer.current = setTimeout(updateProgress, 50);
        }
      };
      progressTimer.current = setTimeout(updateProgress, 50);
      return () => { if (progressTimer.current) clearTimeout(progressTimer.current); };
    }
  }, [currentStory, isPaused, mediaLoading, handleNext]);

  const openStory = async (index) => {
    const s = stories[index];
    if (!s) return;
    setModalMsg(null);
    setProgress(0);
    setMediaLoading(true);
    setTranslatedCaption(null);
    setSelectedStoryIndex(index);

    if (s.author_id === id) {
      loadCounts(s.id);            
    } else if (id) {
      try { await supabase.rpc('record_story_view', { p_story_id: s.id }); } catch {}
    }
  };

  const closeViewer = () => {
    setSelectedStoryIndex(null);
    setProgress(0);
    setTranslatedCaption(null);
  };

  // ------------------------------------------------------------------
  // Création
  // ------------------------------------------------------------------
  const create = async () => {
    setError('');
    const hasPoll = pollData?.question && pollData?.options?.some(o => o.trim());
    if (!caption.trim() && mediaItems.length === 0 && !selectedAudio && !hasPoll && !selectedProduct) {
      setError('Ajoute du texte, un média, un sondage, un produit ou une musique');
      return;
    }
    if (!id) { setError('Tu dois être connecté'); return; }

    setCreating(true);
    try {
      let mediaUrl = null;
      let mediaType = 'text';

      if (mediaItems.length > 0) {
        const activeMedia = mediaItems[0];
        const result = await uploadExternalMedia(activeMedia.file, {
          folder: 'stories',
          user_id: id,
          maxBytes: 100 * 1024 * 1024,
        });
        mediaUrl = result.url;
        mediaType = activeMedia.type;
      }

      const { error } = await supabase.from('stories').insert({
        author_id: id,
        media_type: mediaType,
        media_url: mediaUrl,
        caption: caption.trim(),
        visibility: 'public',
        audio_url: selectedAudio?.audio_url || null,
        audio_title: selectedAudio?.title || null,
        poll: hasPoll ? pollData : null,
        product: selectedProduct || null,
      });

      if (error) throw error;

      setCaption('');
      setMediaItems([]);
      setSelectedAudio(null);
      setPollData(null);
      setSelectedProduct(null);
      setShowPollComposer(false);
      setShowProductPicker(false);
      await load();
    } catch (e) {
      setError('Erreur : ' + (e.message || 'Impossible de créer la story'));
    } finally {
      setCreating(false);
    }
  };

  // ------------------------------------------------------------------
  // Actions
  // ------------------------------------------------------------------
  const react = async (s) => {
    if (!id) { setModalMsg({ type: 'error', text: 'Connecte-toi pour réagir.' }); return; }
    if (busy) return;
    setBusy(true);
    setModalMsg(null);
    try {
      if (myLikes.has(s.id)) {
        const { error } = await supabase.from('story_reactions').delete().eq('story_id', s.id).eq('user_id', id);
        if (error) throw error;
        setMyLikes(prev => { const n = new Set(prev); n.delete(s.id); return n; });
      } else {
        const { error } = await supabase.from('story_reactions').upsert({ story_id: s.id, user_id: id, reaction: '❤️' }, { onConflict: 'story_id,user_id' });
        if (error) throw error;
        setMyLikes(prev => new Set(prev).add(s.id));
      }
      if (s.author_id === id) loadCounts(s.id);
    } catch (e) {
      setModalMsg({ type: 'error', text: 'Réaction impossible : ' + (e.message || 'erreur') });
    } finally {
      setBusy(false);
    }
  };

  const share = async (s) => {
    setModalMsg(null);
    const text = s.caption || 'Story BAARO';
    const url = s.media_url || window.location.origin;
    try {
      if (navigator.share) await navigator.share({ title: 'BAARO', text, url });
      else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        setModalMsg({ type: 'ok', text: 'Lien copié' });
      }
    } catch (e) {
      if (e?.name !== 'AbortError') setModalMsg({ type: 'error', text: 'Partage impossible.' });
    }
  };

  const remove = async (s) => {
    if (s.author_id !== id || busy) return;
    if (!window.confirm('Supprimer cette story ?')) return;
    setBusy(true);
    setModalMsg(null);
    try {
      const { data, error } = await supabase.from('stories').delete().eq('id', s.id).eq('author_id', id).select('id');
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

  const handleCartAdd = (productId) => {
    setCartQuantities(prev => ({ ...prev, [productId]: (prev[productId] || 0) + 1 }));
  };

  const handleCartRemove = (productId) => {
    setCartQuantities(prev => ({ ...prev, [productId]: Math.max(0, (prev[productId] || 0) - 1) }));
  };

  const isMine = currentStory && currentStory.author_id === id;

  return (
    <div className="space-y-4 relative">
      <ConnectionStatus />

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold" style={{ color: C.ivory }}>Stories</h2>
          <p className="text-xs" style={{ color: C.muted }}>24 h · texte, média, produit, sondage et musique</p>
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

      {/* FORMULAIRE DE CRÉATION DE STORY */}
      <div className="rounded-2xl p-4 border shadow-sm backdrop-blur-md space-y-4" style={{ background: C.surface, borderColor: C.border }}>
        {/* ÉDITEUR DE TEXTE ENRICHI */}
        <RichTextComposer
          value={caption}
          onChange={setCaption}
          placeholder="Créer une story..."
          rows={3}
        />

        {/* CARROUSEL DE MÉDIAS */}
        {mediaItems.length > 0 && (
          <MediaCarousel
            mediaItems={mediaItems}
            selectedIndex={selectedMediaIndex}
            onSelectIndex={setSelectedMediaIndex}
            onMove={handleMoveMedia}
            onRemove={handleRemoveMedia}
          />
        )}

        {/* PRODUIT ÉPINGLÉ PRÉVISUALISATION */}
        {selectedProduct && (
          <div className="relative border rounded-xl p-2 bg-white/5">
            <button
              onClick={() => setSelectedProduct(null)}
              className="absolute top-2 right-2 p-1 rounded-full bg-black/60 text-white z-10"
            >
              <X size={14} />
            </button>
            <ProductCard
              product={selectedProduct}
              quantity={cartQuantities[selectedProduct.id] || 0}
              onAdd={() => handleCartAdd(selectedProduct.id)}
              onRemove={() => handleCartRemove(selectedProduct.id)}
            />
          </div>
        )}

        {/* SÉLECTION DE PRODUIT BOUTIQUE */}
        {showProductPicker && (
          <div className="p-3 rounded-xl border space-y-2 bg-black/30 border-amber-500/30">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-amber-400">Épingler un produit de ta boutique</span>
              <button onClick={() => setShowProductPicker(false)} className="text-zinc-400 hover:text-white"><X size={14}/></button>
            </div>
            {myProducts.length === 0 ? (
              <p className="text-xs text-zinc-400">Aucun produit disponible dans ta boutique.</p>
            ) : (
              <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto pr-1">
                {myProducts.map(prod => (
                  <button
                    key={prod.id}
                    onClick={() => {
                      setSelectedProduct(prod);
                      setShowProductPicker(false);
                    }}
                    className="text-left p-2 rounded-lg border border-white/10 hover:border-amber-400/50 bg-white/5 transition flex items-center justify-between"
                  >
                    <span className="text-xs font-semibold text-white truncate">{prod.name}</span>
                    <span className="text-xs font-bold text-amber-400">{prod.price} {prod.currency}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* SONDAGE */}
        {showPollComposer && (
          <PollComposer
            value={pollData}
            onChange={setPollData}
            onClose={() => {
              setShowPollComposer(false);
              setPollData(null);
            }}
          />
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <label className="flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer active:opacity-70 transition-all hover:bg-white/5" style={{ borderColor: C.border, color: C.ivory }}>
            <ImageIcon size={16} />
            <span className="text-sm">Ajouter média</span>
            <input
              type="file"
              accept="image/*,video/*"
              multiple
              onChange={handleAddMediaFiles}
              className="hidden"
            />
          </label>

          <button
            type="button"
            onClick={() => setShowPollComposer(!showPollComposer)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border transition-all hover:bg-white/5"
            style={{ borderColor: C.border, color: C.teal || '#2dd4bf' }}
          >
            <HelpCircle size={16} />
            <span className="text-sm">{showPollComposer ? "Masquer le sondage" : "Créer un sondage"}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowProductPicker(!showProductPicker)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border transition-all hover:bg-white/5"
            style={{ borderColor: C.border, color: C.gold || '#f59e0b' }}
          >
            <ShoppingBag size={16} />
            <span className="text-sm">Produit</span>
          </button>
        </div>

        {/* MUSIQUE */}
        <AudioPicker
          selectedAudio={selectedAudio}
          onSelectAudio={setSelectedAudio}
          onRemoveAudio={() => setSelectedAudio(null)}
        />

        <div className="flex justify-end pt-2">
          <button
            disabled={creating || (!caption.trim() && mediaItems.length === 0 && !selectedAudio && !pollData?.question && !selectedProduct)}
            onClick={create}
            className="px-4 py-2 rounded-xl font-semibold flex items-center disabled:opacity-50 active:opacity-80 transition-all shadow-md"
            style={{ background: C.gold, color: '#000' }}
          >
            {creating ? 'Publication...' : <><Plus size={16} className="inline mr-1" />Publier</>}
          </button>
        </div>
      </div>

      {/* GRILLE DES STORIES */}
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
                <div className="text-sm line-clamp-4 my-auto">
                  <AutoTranslate text={s.caption} showToggle={false}>
                    {(translatedTxt) => <RichTextRenderer content={translatedTxt} />}
                  </AutoTranslate>
                </div>
              )}

              {s.product?.name && (
                <div className="my-1 px-2 py-1 rounded bg-amber-500/10 border border-amber-500/20 text-[11px] truncate text-amber-400">
                  🛍️ {s.product.name}
                </div>
              )}

              {s.poll?.question && (
                <div className="my-1 px-2 py-1 rounded bg-teal-500/10 border border-teal-500/20 text-[11px] truncate" style={{ color: C.teal || '#2dd4bf' }}>
                  📊 {s.poll.question}
                </div>
              )}

              <div className="text-[10px] opacity-60 flex items-center justify-between gap-2 z-10">
                <span>{new Date(s.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                {s.author_id === id && <span>👁 {counts[s.id]?.views || 0} · ❤️ {counts[s.id]?.likes || 0}</span>}
              </div>
            </button>
          ))}
        </div>
      )}

      <FutureModulePanel 
        moduleId="stories_ia_filters" 
        onNavigate={(modId, action) => console.log('Navigation futur module:', modId, action)} 
      />

      {/* VISIONNEUSE DE STORY PLEIN ÉCRAN */}
      {currentStory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-md select-none" onClick={closeViewer}>
          <div
            className="relative w-full h-full sm:w-[420px] sm:h-[85vh] sm:rounded-2xl overflow-hidden bg-zinc-950 shadow-2xl flex flex-col justify-between border border-zinc-800/50"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={() => setIsPaused(true)}
            onMouseUp={() => setIsPaused(false)}
            onTouchStart={() => setIsPaused(true)}
            onTouchEnd={() => setIsPaused(false)}
          >
            {currentStory.audio_url && (
              <audio src={currentStory.audio_url} autoPlay loop muted={isPaused} />
            )}

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
                    {currentStory.audio_title && (
                      <p className="text-[10px] text-amber-300 font-medium truncate max-w-[180px]">🎵 {currentStory.audio_title}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* CONTRÔLES DE TRADUCTION VIDÉO (SOUS-TITRES & VOIX DUB) */}
                  {currentStory.media_type === 'video' && currentStory.media_url && (
                    <div onClick={(e) => e.stopPropagation()}>
                      <VideoTranslateControls
                        mediaUrl={currentStory.media_url}
                        videoId={currentStory.id}
                        videoRef={videoRef}
                      />
                    </div>
                  )}

                  <button onClick={closeViewer} className="p-2 text-white/80 hover:text-white rounded-full bg-black/20 hover:bg-black/40 transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>

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
                    onTimeUpdate={(e) => setProgress((e.currentTarget.currentTime / e.currentTarget.duration) * 100)}
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
                <div className="p-8 text-center w-full space-y-3">
                  {/* TRADUCTION AUTOMATIQUE OU MANUELLE */}
                  <AutoTranslate text={currentStory.caption}>
                    {(autoTranslatedTxt) => (
                      <RichTextRenderer 
                        content={translatedCaption || autoTranslatedTxt} 
                        className="text-xl font-medium" 
                      />
                    )}
                  </AutoTranslate>

                  {/* BOUTON DE TRADUCTION MANUELLE */}
                  {currentStory.caption && (
                    <div className="flex justify-center" onClick={(e) => e.stopPropagation()}>
                      <TranslateButton
                        text={currentStory.caption}
                        isTranslated={!!translatedCaption}
                        onTranslated={(txt) => setTranslatedCaption(txt)}
                        onClear={() => setTranslatedCaption(null)}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* PRODUCT CARD DANS LA STORY */}
              {currentStory.product && (
                <div 
                  className="absolute top-20 inset-x-6 z-30"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ProductCard
                    product={currentStory.product}
                    quantity={cartQuantities[currentStory.product.id] || 0}
                    onAdd={() => handleCartAdd(currentStory.product.id)}
                    onRemove={() => handleCartRemove(currentStory.product.id)}
                  />
                </div>
              )}

              {/* SONDAGE POLLDISPLAY DANS LA STORY */}
              {currentStory.poll?.question && (
                <div 
                  className="absolute bottom-20 inset-x-6 z-30"
                  onClick={(e) => e.stopPropagation()}
                >
                  <PollDisplay
                    postId={currentStory.id}
                    question={currentStory.poll.question}
                    options={currentStory.poll.options}
                    endsAt={currentStory.expires_at}
                    user_id={id}
                  />
                </div>
              )}
            </div>

            <div className="absolute inset-y-0 left-0 w-1/3 z-20 cursor-pointer" onClick={handlePrevious} />
            <div className="absolute inset-y-0 right-0 w-1/3 z-20 cursor-pointer" onClick={handleNext} />

            <div className="absolute bottom-0 inset-x-0 z-30 p-4 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex items-center gap-2">
              {isMine && (
                <>
                  <button onClick={() => setEngagement({ type: 'storyViews', id: currentStory.id })} className="px-3 py-2 rounded-xl text-xs text-white bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20">
                    👁 {counts[currentStory.id]?.views || 0}
                  </button>
                  <button onClick={() => setEngagement({ type: 'storyLikes', id: currentStory.id })} className="px-3 py-2 rounded-xl text-xs text-white bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20">
                    ❤️ {counts[currentStory.id]?.likes || 0}
                  </button>
                </>
              )}

              <button
                onClick={() => react(currentStory)}
                disabled={busy}
                className={`p-2.5 rounded-xl backdrop-blur-md border transition-all ${
                  myLikes.has(currentStory.id) ? 'bg-red-500 border-red-500 text-white' : 'bg-white/10 text-white border-white/20 hover:bg-white/20'
                }`}
              >
                <Heart size={18} fill={myLikes.has(currentStory.id) ? 'currentColor' : 'transparent'} />
              </button>

              <button onClick={() => share(currentStory)} className="p-2.5 rounded-xl bg-white/10 text-white backdrop-blur-md border border-white/20">
                <Send size={18} />
              </button>

              {isMine && (
                <button onClick={() => remove(currentStory)} disabled={busy} className="p-2.5 rounded-xl bg-red-500/20 text-red-300 backdrop-blur-md border border-red-500/30 ml-auto">
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
