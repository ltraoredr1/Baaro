/**
 * Édition photo de profil + couverture
 * Place : src/components/ProfilePhotosEditor.jsx
 * Usage dans SettingsTab : <ProfilePhotosEditor userId={accountUserId} profile={userProfile} onUpdated={...} />
 */
import { useRef, useState } from "react";
import { Camera, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { COLORS } from "../theme.js";
import { supabase } from "../supabaseClient.js";
import { uploadProfileMedia } from "../lib/profileMedia.js";
import { useToast } from "./ToastContext.jsx";
import { LazyImage } from "./LazyMedia.jsx";

export default function ProfilePhotosEditor({ userId, profile, onUpdated }) {
  const { showToast } = useToast();
  const avatarRef = useRef(null);
  const coverRef = useRef(null);
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || null);
  const [coverUrl, setCoverUrl] = useState(profile?.cover_url || null);
  const [busy, setBusy] = useState(null); // 'avatar' | 'cover' | null

  async function persist(patch) {
    if (!userId) return;
    const { error } = await supabase
      .from("profiles")
      .upsert(
        {
          user_id: userId,
          ...patch,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
    if (error) throw error;
    onUpdated?.(patch);
  }

  async function onPick(kind, file) {
    if (!file || !userId) return;
    setBusy(kind);
    try {
      const url = await uploadProfileMedia(file, { userId, kind });
      if (kind === "avatar") {
        setAvatarUrl(url);
        await persist({ avatar_url: url });
      } else {
        setCoverUrl(url);
        await persist({ cover_url: url });
      }
      showToast?.(kind === "avatar" ? "Photo de profil mise à jour" : "Couverture mise à jour", "success");
    } catch (e) {
      showToast?.(e.message || "Échec de l'envoi", "error");
    } finally {
      setBusy(null);
    }
  }

  async function clear(kind) {
    setBusy(kind);
    try {
      if (kind === "avatar") {
        setAvatarUrl(null);
        await persist({ avatar_url: null });
      } else {
        setCoverUrl(null);
        await persist({ cover_url: null });
      }
      showToast?.("Image retirée", "success");
    } catch (e) {
      showToast?.(e.message || "Erreur", "error");
    } finally {
      setBusy(null);
    }
  }

  const initial = (profile?.display_name || "?").charAt(0).toUpperCase();

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-semibold" style={{ color: COLORS.muted }}>
        Photos
      </p>

      {/* Couverture */}
      <div
        className="relative w-full h-28 rounded-2xl overflow-hidden border"
        style={{ borderColor: COLORS.border, background: COLORS.surface2 }}
      >
        {coverUrl ? (
          <LazyImage src={coverUrl} alt="" variant="full" className="w-full h-28 object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ color: COLORS.muted }}>
            <ImagePlus size={28} />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
        <div className="absolute bottom-2 right-2 flex gap-1.5">
          <button
            type="button"
            disabled={!!busy || !userId}
            onClick={() => coverRef.current?.click()}
            className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1"
            style={{ background: COLORS.gold, color: "#0B1220", opacity: busy === "cover" ? 0.7 : 1 }}
          >
            {busy === "cover" ? <Loader2 size={12} className="animate-spin" /> : <Camera size={12} />}
            Couverture
          </button>
          {coverUrl && (
            <button
              type="button"
              disabled={!!busy}
              onClick={() => clear("cover")}
              className="p-1.5 rounded-lg border"
              style={{ borderColor: COLORS.border, background: "rgba(0,0,0,0.5)", color: "#fff" }}
              aria-label="Retirer la couverture"
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
        <input
          ref={coverRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) onPick("cover", f);
          }}
        />
      </div>

      {/* Avatar */}
      <div className="flex items-center gap-3 -mt-8 ml-3 relative z-10">
        <button
          type="button"
          disabled={!!busy || !userId}
          onClick={() => avatarRef.current?.click()}
          className="w-20 h-20 rounded-full overflow-hidden border-4 flex items-center justify-center relative"
          style={{
            borderColor: COLORS.bg || "#0B1220",
            background: COLORS.surface,
            boxShadow: `0 0 0 1px ${COLORS.borderGold}`,
          }}
        >
          {avatarUrl ? (
            <LazyImage src={avatarUrl} alt="" variant="avatar" className="w-20 h-20 rounded-full" />
          ) : (
            <span className="text-2xl font-bold" style={{ color: COLORS.gold }}>
              {initial}
            </span>
          )}
          {busy === "avatar" && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <Loader2 size={20} className="animate-spin" style={{ color: COLORS.gold }} />
            </div>
          )}
        </button>
        <div className="flex flex-col gap-1 pt-6">
          <button
            type="button"
            disabled={!!busy || !userId}
            onClick={() => avatarRef.current?.click()}
            className="text-xs font-bold px-3 py-1.5 rounded-lg border self-start"
            style={{ borderColor: COLORS.borderGold, color: COLORS.gold }}
          >
            Photo de profil
          </button>
          {avatarUrl && (
            <button
              type="button"
              disabled={!!busy}
              onClick={() => clear("avatar")}
              className="text-[11px] self-start"
              style={{ color: COLORS.muted }}
            >
              Retirer
            </button>
          )}
        </div>
        <input
          ref={avatarRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) onPick("avatar", f);
          }}
        />
      </div>
    </div>
  );
}
