/**
 * Statuts / Stories en haut du Fil — style WhatsApp / Instagram.
 * À placer en premier enfant de FeedTab.
 */
import { useState } from "react";
import { X } from "lucide-react";
import { supabase } from "../supabaseClient.js";
import { StoriesBar } from "./StoriesBar.jsx";
import { StoryViewer } from "./StoryViewer.jsx";
import { COLORS } from "../theme.js";
import { useToast } from "./ToastContext.jsx";

export function FeedStories({ userId, onRewardPoints }) {
  const { showToast, showPointsReward } = useToast();
  const [storyGroup, setStoryGroup] = useState(null);
  const [storyRefreshKey, setStoryRefreshKey] = useState(0);
  const [showCreateStory, setShowCreateStory] = useState(false);
  const [storyFile, setStoryFile] = useState(null);
  const [storyText, setStoryText] = useState("");
  const [uploadingStory, setUploadingStory] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);

  const handleFile = (file) => {
    if (!file) return;
    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
      showToast("Photo ou vidéo uniquement", "error");
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      showToast("Fichier trop lourd (100 Mo max)", "error");
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setStoryFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleCreateStory = async () => {
    if (!storyFile) return showToast("Choisis une photo ou vidéo", "error");

    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser();
    if (!currentUser) return showToast("Tu n'es pas connecté", "error");

    setUploadingStory(true);
    try {
      const ext = (storyFile.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${currentUser.id}/${crypto.randomUUID()}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from("stories")
        .upload(path, storyFile);
      if (upErr) throw upErr;

      const {
        data: { publicUrl },
      } = supabase.storage.from("stories").getPublicUrl(path);
      const isVideo = storyFile.type.startsWith("video");

      const { data: createdStory, error: storyErr } = await supabase
        .from("stories")
        .insert({
          author_id: currentUser.id,
          media_url: publicUrl,
          media_type: isVideo ? "video" : "image",
          text_overlay: storyText.trim() || null,
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        })
        .select("id")
        .single();
      if (storyErr) throw storyErr;

      showToast("Statut publié !", "success");
      setStoryRefreshKey((k) => k + 1);
      setShowCreateStory(false);
      setStoryFile(null);
      setStoryText("");
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      onRewardPoints?.("publish_story", "Story publiée", createdStory?.id);
      showPointsReward?.(15, "Story publiée");
    } catch (err) {
      showToast("Erreur statut : " + (err.message || "échec"), "error");
    } finally {
      setUploadingStory(false);
    }
  };

  return (
    <>
      <div
        className="rounded-2xl border mb-2 overflow-hidden"
        style={{
          borderColor: COLORS.borderGold || "rgba(217,174,82,0.35)",
          background: "rgba(0,0,0,0.25)",
        }}
      >
        <div className="px-3 pt-2 flex items-center justify-between">
          <span
            className="text-[10px] font-bold uppercase tracking-widest"
            style={{ color: COLORS.muted }}
          >
            Statuts
          </span>
          <span className="text-[10px]" style={{ color: COLORS.muted }}>
            24 h
          </span>
        </div>
        <StoriesBar
          refreshKey={storyRefreshKey}
          onOpenStory={setStoryGroup}
          onCreateStory={() => setShowCreateStory(true)}
        />
      </div>

      {storyGroup && (
        <StoryViewer
          group={storyGroup}
          onClose={() => setStoryGroup(null)}
          currentUserId={userId}
        />
      )}

      {showCreateStory && (
        <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4">
          <div
            className="w-full max-w-md rounded-t-3xl sm:rounded-2xl border p-5 pb-8"
            style={{
              background: COLORS.surface || "#111A2C",
              borderColor: COLORS.borderGold,
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-white text-base">Nouveau statut</h3>
              <button
                type="button"
                onClick={() => {
                  setShowCreateStory(false);
                  setStoryFile(null);
                  if (previewUrl) URL.revokeObjectURL(previewUrl);
                  setPreviewUrl(null);
                }}
                className="p-2 text-gray-400"
              >
                <X size={22} />
              </button>
            </div>

            <div
              onClick={() => document.getElementById("feed-story-input")?.click()}
              className="border-2 border-dashed rounded-xl p-6 text-center cursor-pointer mb-3 min-h-[160px] flex flex-col items-center justify-center"
              style={{
                borderColor: storyFile ? COLORS.gold : "rgba(255,255,255,0.15)",
              }}
            >
              {previewUrl ? (
                storyFile?.type.startsWith("video") ? (
                  <video
                    src={previewUrl}
                    className="max-h-48 rounded-lg"
                    controls
                  />
                ) : (
                  <img
                    src={previewUrl}
                    alt=""
                    className="max-h-48 rounded-lg object-contain"
                  />
                )
              ) : (
                <>
                  <div className="text-3xl mb-2">📷</div>
                  <p className="text-sm text-gray-400">Photo ou vidéo</p>
                  <p className="text-[10px] text-gray-500 mt-1">Expire dans 24 h</p>
                </>
              )}
              <input
                id="feed-story-input"
                type="file"
                accept="image/*,video/*"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
            </div>

            <input
              type="text"
              value={storyText}
              onChange={(e) => setStoryText(e.target.value)}
              placeholder="Légende (optionnel)"
              maxLength={120}
              className="w-full mb-4 rounded-xl px-3 py-2.5 text-sm bg-black/40 text-white outline-none border border-white/10"
            />

            <button
              type="button"
              disabled={!storyFile || uploadingStory}
              onClick={handleCreateStory}
              className="w-full py-3 rounded-xl font-bold text-sm disabled:opacity-40"
              style={{ background: COLORS.gold, color: "#000" }}
            >
              {uploadingStory ? "Publication…" : "Publier le statut"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
