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
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
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
      setStories((data || []).map(s => ({
        ...s,
        profiles: map.get(s.author_id) || null
      })));
    } catch (e) {
      console.error('[Stories] load:', e);
      setStories([]);
    } finally {
      setLoading(false);
    }
  };

  const loadCounts = async (storyId) => {
    const [{ count: views }, { count: likes }] = await Promise.all([
      supabase.from('story_views').select('viewer_id', { count: 'exact', head: true }).eq('story_id', storyId),
      supabase.from('story_reactions').select('user_id', { count: 'exact', head: true }).eq('story_id', storyId)
    ]);
    setCounts(prev => ({ ...prev, [storyId]: { views: views ?? 0, likes: likes ?? 0 } }));
  };

  useEffect(() => {
    stories.filter(s => s.author_id === id).forEach(s => loadCounts(s.id));
  }, [stories, id]);

  useEffect(() => {
    load();
    const ch = supabase.channel('stories_live').on('postgres_changes', { event: '*', schema: 'public', table: 'stories' }, load).subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  const create = async () => {
    setError('');
    if (!caption.trim() && !mediaFile) {
      setError('Ajoute du texte ou un média');
      return;
    }
    if (!id) {
      setError('Tu dois être connecté');
      return;
    }
    
    setCreating(true);
    try {
      let mediaUrl = null;
      let mediaType = 'text';

      if (mediaFile) {
        const result = await uploadExternalMedia(mediaFile, {
          folder: 'posts',
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
        visibility: 'public'
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

  const react = async (s) => {
    if (!id) return;
    const { error } = await supabase.from('story_reactions').upsert(
      { story_id: s.id, user_id: id, reaction: '❤️' },
      { onConflict: 'story_id,user_id' }
    );
    if (error) return;
    await supabase.rpc('record_story_view', { p_story_id: s.id });
    await loadCounts(s.id);
  };

  const remove = async (s) => {
    if (s.author_id !== id) return;
    await supabase.from('stories').update({ deleted_at: new Date().toISOString() }).eq('id', s.id);
    setSelected(null);
    load();
  };

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
            {creating ? 'Publication...' : <><Plus size={16} className="inline mr-1"/>Publier</>}
          </button>
        </div>
      </div>

      {loading ? (
        <p style={{ color: C.muted }}>Chargement…</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {stories.map(s => (
            <button 
              key={s.id} 
              onClick={async () => {
                setSelected(s);
                await supabase.rpc('record_story_view', { p_story_id: s.id });
                if (s.author_id === id) loadCounts(s.id);
              }} 
              className="text-left rounded-2xl overflow-hidden border min-h-48 p-3 flex flex-col justify-between active:opacity-90" 
              style={{ background: s.background || C.surface, borderColor: C.border, color: C.ivory }}
            >
              <div>
                <b>{s.profiles?.display_name || 'Membre'}</b>
                <div className="text-xs opacity-70">@{s.profiles?.handle || ''}</div>
              </div>
              
              {s.media_url && s.media_type !== 'text' ? (
                s.media_type === 'video' ? (
                  <video src={s.media_url} className="w-full h-32 object-cover rounded-lg mb-2" muted />
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.82)' }}>
          <div className="w-full max-w-md rounded-3xl p-5 max-h-[90vh] overflow-y-auto" style={{ background: C.surface, color: C.ivory }}>
            <div className="flex justify-between items-center mb-4">
              <b>{selected.profiles?.display_name || 'Story'}</b>
              <button onClick={() => setSelected(null)} className="p-1 active:opacity-70">✕</button>
            </div>
            
            {selected.media_url && selected.media_type !== 'text' ? (
              selected.media_type === 'video' ? (
                <video src={selected.media_url} className="w-full rounded-lg mb-4" controls autoPlay />
              ) : (
                <img src={selected.media_url} alt="story" className="w-full rounded-lg mb-4" />
              )
            ) : (
              <p className="text-lg py-8 whitespace-pre-wrap text-center">{selected.caption}</p>
            )}
            
            <div className="flex gap-2 flex-wrap items-center mt-4">
              {selected.author_id === id && <>
                <button onClick={() => setEngagement({ type: 'storyViews', id: selected.id })} className="px-3 py-2 rounded-xl border text-xs active:opacity-80">👁 Voir les vues</button>
                <button onClick={() => setEngagement({ type: 'storyLikes', id: selected.id })} className="px-3 py-2 rounded-xl border text-xs active:opacity-80">❤️ Voir les likes</button>
              </>}
              <button onClick={() => react(selected)} className="px-3 py-2 rounded-xl border active:opacity-80"><Heart size={16}/></button>
              <button className="px-3 py-2 rounded-xl border active:opacity-80"><Send size={16}/></button>
              {selected.author_id === id && (
                <button onClick={() => remove(selected)} className="px-3 py-2 rounded-xl border text-red-400 active:opacity-80"><Trash2 size={16}/></button>
              )}
              <span className="ml-auto text-xs opacity-60 flex items-center gap-1">
                <Eye size={14}/> {counts[selected.id]?.views || 0} vues
              </span>
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