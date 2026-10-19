import { X } from 'lucide-react';
import { VideoTranslateControls } from '../../../components/VideoTranslateControls.jsx';

export function ViewerHeader({ stories, index, progress, story, videoRef, onClose }) {
  return (
    <div className="absolute top-0 inset-x-0 z-30 p-3 bg-gradient-to-b from-black/80 via-black/40 to-transparent space-y-3">
      <div className="flex gap-1.5 w-full">
        {stories.map((s, idx) => {
          const val = idx < index ? 100 : idx === index ? progress : 0;
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
            {story.profiles?.avatar_url ? (
              <img src={story.profiles.avatar_url} alt="avatar" className="w-full h-full object-cover" />
            ) : (
              (story.profiles?.display_name || 'M')[0]
            )}
          </div>
          <div>
            <h4 className="text-white text-sm font-semibold tracking-wide">{story.profiles?.display_name || 'Membre'}</h4>
            {story.audio_title && <p className="text-[10px] text-amber-300 font-medium truncate max-w-[180px]">🎵 {story.audio_title}</p>}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {story.media_type === 'video' && story.media_url && (
            <div onClick={(e) => e.stopPropagation()}>
              <VideoTranslateControls mediaUrl={story.media_url} videoId={story.id} videoRef={videoRef} />
            </div>
          )}
          <button onClick={onClose} className="p-2 text-white/80 hover:text-white rounded-full bg-black/20 hover:bg-black/40 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
