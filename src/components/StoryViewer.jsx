import { useState, useEffect, useRef } from "react";
import { X } from "lucide-react";
import { supabase } from "../supabaseClient";

export function StoryViewer({ group, onClose, currentUserId }) {
  const [index, setIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const timer = useRef(null);
  const story = group?.stories?.[index];

  useEffect(() => {
    if (!story) return;

    if (currentUserId) {
      supabase
        .from("story_views")
        .upsert({ story_id: story.id, viewer_id: currentUserId })
        .then(() => {});
    }

    setProgress(0);
    const start = Date.now();
    const duration = story.media_type === "video" ? 15000 : 5000;

    timer.current = setInterval(() => {
      const p = Math.min(100, ((Date.now() - start) / duration) * 100);
      setProgress(p);
      if (p >= 100) {
        if (index < group.stories.length - 1) setIndex((i) => i + 1);
        else onClose();
      }
    }, 50);

    return () => clearInterval(timer.current);
  }, [index, story]);

  if (!story) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col">
      <div className="absolute top-3 left-3 right-3 flex gap-1 z-20">
        {group.stories.map((_, i) => (
          <div
            key={i}
            className="h-1 flex-1 rounded-full bg-white/30 overflow-hidden"
          >
            <div
              className="h-full bg-white transition-all duration-100"
              style={{
                width: i < index ? "100%" : i === index ? `${progress}%` : "0%",
              }}
            />
          </div>
        ))}
      </div>

      <div className="absolute top-8 left-4 right-4 flex items-center justify-between z-20">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-full bg-gray-700 flex items-center justify-center text-sm overflow-hidden">
            {group.author?.avatar_url ? (
              <img
                src={group.author.avatar_url}
                className="w-full h-full object-cover"
              />
            ) : (
              group.author?.flag || "🌍"
            )}
          </div>
          <div>
            <p className="text-white text-sm font-bold">
              @{group.author?.handle || "membre"}
            </p>
            <p className="text-white/60 text-[10px]">
              {new Date(story.created_at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
        </div>
        <button onClick={onClose} className="text-white p-2">
          <X size={24} />
        </button>
      </div>

      <div className="flex-1 flex items-center justify-center relative">
        {story.media_type === "video" ? (
          <video
            src={story.media_url}
            className="max-h-full max-w-full object-contain"
            autoPlay
            playsInline
          />
        ) : (
          <img
            src={story.media_url}
            className="max-h-full max-w-full object-contain"
            alt=""
          />
        )}
        {story.text_overlay && (
          <div className="absolute bottom-24 left-4 right-4 text-center">
            <p className="text-white text-xl font-bold drop-shadow-lg">
              {story.text_overlay}
            </p>
          </div>
        )}
      </div>

      <div className="absolute inset-0 flex z-10">
        <div
          className="w-1/3 h-full"
          onClick={() => index > 0 && setIndex((i) => i - 1)}
        />
        <div className="w-1/3 h-full" onClick={onClose} />
        <div
          className="w-1/3 h-full"
          onClick={() => {
            if (index < group.stories.length - 1) setIndex((i) => i + 1);
            else onClose();
          }}
        />
      </div>
    </div>
  );
}
