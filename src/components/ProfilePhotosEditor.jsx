/**
 * Édition photo de profil + couverture
 * Identité : userId = auth.users.id = profiles.id (jamais handle / email)
 * Place : src/components/ProfilePhotosEditor.jsx
 *
 * Usage :
 *   <ProfilePhotosEditor
 *     userId={session.user.id}
 *     profile={userProfile}
 *     onUpdated={(patch) => { /* merge dans le state parent *\/ }}
 *   />
 */
import { useRef, useState, useEffect } from "react";
import { Camera, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { COLORS } from "../theme.js";
import { supabase } from "../supabaseClient.js";
import { uploadProfileMedia } from "../lib/profileMedia.js";
import { useToast } from "./ToastContext.jsx";
import { LazyImage } from "./LazyMedia.jsx";

function isAuthUserId(id) {
  if (!id || typeof id !== "string") return false;
  // Refuser handle (@xxx) ou email comme "identité"
  if (id.startsWith("@")) return false;
  if (id.includes("@") && id.includes(".")) return false;
  return id.length >= 32;
}

export default function ProfilePhotosEditor({ userId, profile, onUpdated }) {
  const { showToast } = useToast();
  const avatarRef = useRef(null);
  const coverRef = useRef(null);
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || null);
  const [coverUrl, setCoverUrl] = useState(profile?.cover_url || null);
  const [busy, setBusy] = useState(null); // 'avatar' | 'cover' | null

  // Resync quand le profil est rechargé (profiles.id = auth.users.id)
  useEffect(() => {
    setAvatarUrl(profile?.avatar_url || null);
    setCoverUrl(profile?.cover_url || null);
  }, [profile?.avatar_url, profile?.cover_url]);

  async function persist(patch) {
    if (!isAuthUserId(userId)) {
      throw new Error("Identité invalide : auth.users.id requis");
    }
    const { error } = await supabase.from("profiles").upsert(
      {
        id: userId, // = auth.users.id
        ...patch,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );
    if (error) throw error;
    onUpdated?.(patch);
  }

  async function onPick(kind, file) {
    if (!file) return;
    if (!isAuthUserId(userId)) {
      showToast?.("Connexion requise", "error");
      return;
    }
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
      showToast?.(
        kind === "avatar"
          ? "Photo de profil mise à jour"
          : "Couverture mise à jour",
        "success"
      );
    } catch (e) {
      console.error("[BAARO] upload profile media", e);
      showToast?.(e.message || "Échec de l'envoi", "error");
    } finally {
      setBusy(null);
    }
  }

  async function clear(kind) {
    if (!isAuthUserId(userId)) return;
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

  const initial = (profile?.display_name || profile?.handle || "?").charAt(0).toUpperCase();

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-semibold" style={{ color: COLORS.muted }}>
        Photos de profil
      </p>

      {/* ── Couverture ── */}
      <div
        className="relative w-full h-28 rounded-2xl overflow-hidden border"
        style={{ borderColor: COLORS.border, background: COLORS.surface2 }}
      >
        {coverUrl ? (
          <LazyImage
            src={coverUrl}
            alt="Couverture"
            className="w-full h-full object-cover"
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ background: `linear-gradient(135deg, ${COLORS.surface2}, ${COLORS.surface})` }}
          >
            <ImagePlus size={28} style={{ color: COLORS.muted }} />
          </div>
        )}

        <div className="absolute inset-0 flex items-end justify-end gap-2 p-2">
          <button
            type="button"
            disabled={!!busy}
            onClick={() => coverRef.current?.click()}
            className="text-[11px] font-bold px-3 py-1.5 rounded-lg border flex items-center gap-1"
            style={{
              borderColor: COLORS.borderGold,
              color: COLORS.gold,
              background: "rgba(0,0,0,0.45)",
            }}
          >
            {busy === "cover" ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Camera size={12} />
            )}
            Couverture
          </button>
          {coverUrl && (
            <button
              type="button"
              disabled={!!busy}
              onClick={() => clear("cover")}
              className="text-[11px] px-2 py-1.5 rounded-lg border flex items-center gap-1"
              style={{
                borderColor: COLORS.border,
                color: COLORS.muted,
                background: "rgba(0,0,0,0.45)",
              }}
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

      {/* ── Avatar ── */}
      <div className="flex items-center gap-4">
        <div
          className="relative w-20 h-20 rounded-full overflow-hidden border-2 shrink-0"
          style={{ borderColor: COLORS.borderGold, background: COLORS.surface2 }}
        >
          {avatarUrl ? (
            <LazyImage
              src={avatarUrl}
              alt="Photo de profil"
              className="w-full h-full object-cover"
            />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center text-2xl font-bold"
              style={{ color: COLORS.gold }}
            >
              {initial}
            </div>
          )}
          {busy === "avatar" && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <Loader2 size={20} className="animate-spin" style={{ color: COLORS.gold }} />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1.5 min-w-0">
          <button
            type="button"
            disabled={!!busy}
            onClick={() => avatarRef.current?.click()}
            className="text-[11px] font-bold px-3 py-1.5 rounded-lg border self-start flex items-center gap-1.5"
            style={{ borderColor: COLORS.borderGold, color: COLORS.gold }}
          >
            <Camera size={12} />
            Photo de profil
          </button>
          {avatarUrl && (
            <button
              type="button"
              disabled={!!busy}
              onClick={() => clear("avatar")}
              className="text-[11px] self-start flex items-center gap-1"
              style={{ color: COLORS.muted }}
            >
              <Trash2 size={12} />
              Retirer
            </button>
          )}
          <p className="text-[10px]" style={{ color: COLORS.muted }}>
            JPEG, PNG, WebP · max 5 Mo
          </p>
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
