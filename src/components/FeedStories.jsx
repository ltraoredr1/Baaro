import { useEffect, useMemo, useState } from "react";
import { X, Image as ImageIcon, Video, Type, BarChart3, Smile, Send } from "lucide-react";
import { supabase } from "../supabaseClient.js";
import { StoriesBar } from "./StoriesBar.jsx";
import { StoryViewer } from "./StoryViewer.jsx";
import { StoryComposer } from "./StoryComposer.jsx";
import { COLORS } from "../theme.js";
import { useToast } from "./ToastContext.jsx";

function isValidAuthUserId(value) {
  if (!value || typeof value !== "string") return false;
  if (value.startsWith("@") || (value.includes("@") && value.includes("."))) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}


const MAX_FILE_SIZE = 100 * 1024 * 1024;
const MAX_TEXT = 500;
const STORY_BACKGROUNDS = [
  "linear-gradient(135deg,#18233d,#0b1220)",
  "linear-gradient(135deg,#5b3b13,#121826)",
  "linear-gradient(135deg,#3a174d,#101827)",
  "linear-gradient(135deg,#0c4a4e,#101827)",
];

export function FeedStories({ userId, onRewardPoints }) {
  const { showToast, showPointsReward } = useToast();
  const [resolvedUserId, setResolvedUserId] = useState(userId || null);
  const [storyGroup, setStoryGroup] = useState(null);
  const [storyRefreshKey, setStoryRefreshKey] = useState(0);

  useEffect(() => {
    if (isValidAuthUserId(userId)) {
      setResolvedUserId(userId);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!cancelled && user?.id) setResolvedUserId(user.id);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("text");
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [background, setBackground] = useState(STORY_BACKGROUNDS[0]);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [publishing, setPublishing] = useState(false);
  const [carouselOpen, setCarouselOpen] = useState(false);

  const reset = () => {
    if (preview) URL.revokeObjectURL(preview);
    setOpen(false);
    setMode("text");
    setText("");
    setFile(null);
    setPreview("");
    setBackground(STORY_BACKGROUNDS[0]);
    setPollQuestion("");
    setPollOptions(["", ""]);
  };

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const canPublish = useMemo(() => {
    if (mode === "text") return text.trim().length > 0;
    if (mode === "poll") return pollQuestion.trim() && pollOptions.filter(Boolean).length >= 2;
    return !!file;
  }, [mode, text, pollQuestion, pollOptions, file]);

  const chooseFile = (next) => {
    if (!next) return;
    if (!next.type.startsWith("image/") && !next.type.startsWith("video/")) {
      showToast("Photo ou vidéo uniquement", "error");
      return;
    }
    if (next.size > MAX_FILE_SIZE) {
      showToast("Fichier trop lourd (100 Mo max)", "error");
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    setFile(next);
    setPreview(URL.createObjectURL(next));
    setMode(next.type.startsWith("video/") ? "video" : "image");
  };

  const publish = async () => {
    if (!canPublish || publishing) return;
    const { data: auth } = await supabase.auth.getUser();
    const currentUser = auth?.user;
    if (!currentUser) {
      showToast("Connecte-toi pour publier une story", "error");
      return;
    }

    setPublishing(true);
    try {
      let mediaUrl = null;
      let mediaType = null;

      if (file) {
        const ext = (file.name.split(".").pop() || (mode === "video" ? "mp4" : "jpg")).toLowerCase();
        const path = `${currentUser.id}/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from("stories").upload(path, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type,
        });
        if (error) throw error;
        mediaUrl = supabase.storage.from("stories").getPublicUrl(path).data.publicUrl;
        mediaType = mode === "video" ? "video" : "image";
      }

      const storyPayload = {
        author_id: currentUser.id,
        story_type: mode === "poll" ? "poll" : mode,
        media_url: mediaUrl,
        media_type: mediaType,
        text: mode === "text" ? text.trim() : null,
        text_overlay: text.trim() || null,
        background: mode === "text" ? background : null,
        duration_seconds: mode === "video" ? 15 : 5,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      };

      const { data: story, error: storyError } = await supabase
        .from("stories")
        .insert(storyPayload)
        .select("id")
        .single();
      if (storyError) throw storyError;

      if (mode === "poll") {
        const question = pollQuestion.trim();
        const options = pollOptions.map((v) => v.trim()).filter(Boolean).slice(0, 4);
        const { data: poll, error: pollError } = await supabase
          .from("story_polls")
          .insert({ story_id: story.id, question })
          .select("id")
          .single();
        if (pollError) throw pollError;

        const { error: optionsError } = await supabase
          .from("story_poll_options")
          .insert(options.map((option_text, position) => ({
            poll_id: poll.id,
            option_text,
            position,
          })));
        if (optionsError) throw optionsError;
      }

      showToast("Story publiée !", "success");
      showPointsReward?.(15, "Story publiée");
      onRewardPoints?.("publish_story", "Story publiée", story.id);
      setStoryRefreshKey((k) => k + 1);
      reset();
    } catch (e) {
      showToast("Erreur : " + (e?.message || "publication impossible"), "error");
    } finally {
      setPublishing(false);
    }
  };

  const updateOption = (index, value) =>
    setPollOptions((items) => items.map((v, i) => (i === index ? value : v)));

  return (
    <>
      <div
        className="rounded-2xl border mb-2 overflow-hidden"
        style={{ borderColor: COLORS.borderGold || "rgba(217,174,82,.35)", background: "rgba(0,0,0,.25)" }}
      >
        <div className="px-3 pt-2 flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: COLORS.muted }}>
            Statuts
          </span>
          <span className="text-[10px]" style={{ color: COLORS.muted }}>24 h</span>
        </div>
        <StoriesBar refreshKey={storyRefreshKey} onOpenStory={setStoryGroup} onCreateStory={() => setOpen(true)} />
      </div>

      {storyGroup && (
        <StoryViewer group={storyGroup} onClose={() => setStoryGroup(null)} currentUserId={resolvedUserId || userId} />
      )}

      {open && (
        <div className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center">
          <div className="w-full max-w-md max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl p-5 border"
               style={{ background: COLORS.surface || "#111827", borderColor: COLORS.borderGold || "#80652c" }}>
            <div className="flex items-center justify-between mb-4 gap-2">
              <h3 className="text-white font-bold text-lg">Créer une story</h3>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => { setOpen(false); setCarouselOpen(true); }}
                  className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg border"
                  style={{ borderColor: COLORS.borderGold || "#80652c", color: COLORS.gold }}
                >
                  Carousel + audio
                </button>
                <button type="button" onClick={reset} className="p-2 text-white/70"><X size={22} /></button>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2 mb-4">
              {[
                ["text", <Type size={17} />, "Texte"],
                ["image", <ImageIcon size={17} />, "Photo"],
                ["video", <Video size={17} />, "Vidéo"],
                ["poll", <BarChart3 size={17} />, "Sondage"],
              ].map(([value, icon, label]) => (
                <button key={value} onClick={() => setMode(value)}
                  className="rounded-xl py-2 text-[11px] flex flex-col items-center gap-1 border"
                  style={{
                    borderColor: mode === value ? COLORS.gold : "rgba(255,255,255,.1)",
                    color: mode === value ? COLORS.gold : "#aaa"
                  }}>
                  {icon}{label}
                </button>
              ))}
            </div>

            {mode === "text" && (
              <div className="space-y-3">
                <div className="min-h-52 rounded-2xl p-5 flex items-center justify-center text-center"
                     style={{ background, color: "#fff" }}>
                  <textarea value={text} onChange={(e) => setText(e.target.value.slice(0, MAX_TEXT))}
                    placeholder="Écris ta story…" className="w-full bg-transparent outline-none resize-none text-2xl font-bold text-center placeholder:text-white/50" />
                </div>
                <div className="flex gap-2 overflow-x-auto">
                  {STORY_BACKGROUNDS.map((bg, i) => (
                    <button key={i} onClick={() => setBackground(bg)}
                      className="w-10 h-10 rounded-full shrink-0 border-2"
                      style={{ background: bg, borderColor: background === bg ? COLORS.gold : "transparent" }} />
                  ))}
                </div>
              </div>
            )}

            {(mode === "image" || mode === "video") && (
              <div className="space-y-3">
                <label className="block rounded-2xl border-2 border-dashed p-4 text-center cursor-pointer"
                       style={{ borderColor: file ? COLORS.gold : "rgba(255,255,255,.15)" }}>
                  <input type="file" accept={mode === "video" ? "video/*" : "image/*"} className="hidden"
                    onChange={(e) => chooseFile(e.target.files?.[0])} />
                  {preview ? (
                    mode === "video" ? <video src={preview} controls playsInline className="max-h-72 mx-auto rounded-xl" /> :
                    <img src={preview} alt="" className="max-h-72 mx-auto rounded-xl object-contain" />
                  ) : (
                    <div className="py-12 text-white/50">
                      {mode === "video" ? <Video size={36} className="mx-auto mb-2" /> : <ImageIcon size={36} className="mx-auto mb-2" />}
                      Choisir {mode === "video" ? "une vidéo" : "une photo"}
                    </div>
                  )}
                </label>
                <input value={text} onChange={(e) => setText(e.target.value.slice(0, MAX_TEXT))}
                  placeholder="Ajouter un texte / une légende…" className="w-full rounded-xl bg-black/30 border border-white/10 p-3 text-white outline-none" />
              </div>
            )}

            {mode === "poll" && (
              <div className="space-y-3">
                <div className="rounded-2xl p-5" style={{ background: background, color: "#fff" }}>
                  <BarChart3 className="mx-auto mb-3" size={34} />
                  <input value={pollQuestion} onChange={(e) => setPollQuestion(e.target.value.slice(0, 240))}
                    placeholder="Ta question ?" className="w-full bg-transparent outline-none text-xl font-bold text-center placeholder:text-white/50" />
                </div>
                {pollOptions.map((value, i) => (
                  <input key={i} value={value} onChange={(e) => updateOption(i, e.target.value.slice(0, 100))}
                    placeholder={`Choix ${i + 1}`} className="w-full rounded-xl bg-black/30 border border-white/10 p-3 text-white outline-none" />
                ))}
                {pollOptions.length < 4 && (
                  <button onClick={() => setPollOptions((x) => [...x, ""])} className="text-sm" style={{ color: COLORS.gold }}>
                    + Ajouter un choix
                  </button>
                )}
              </div>
            )}

            <button disabled={!canPublish || publishing} onClick={publish}
              className="w-full mt-5 rounded-xl py-3 font-bold disabled:opacity-40 flex items-center justify-center gap-2"
              style={{ background: COLORS.gold, color: "#000" }}>
              <Send size={17} /> {publishing ? "Publication…" : "Publier"}
            </button>
          </div>
        </div>
      )}

      {carouselOpen && (
        <StoryComposer
          currentUserId={resolvedUserId || userId}
          onClose={() => setCarouselOpen(false)}
          onCreated={() => {
            setCarouselOpen(false);
            setStoryRefreshKey((k) => k + 1);
            showToast?.("Story carousel publiée !", "success");
            onRewardPoints?.("publish_story", "Story carousel", null);
          }}
        />
      )}
    </>
  );
}
