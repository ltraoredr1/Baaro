import { useRef, useState } from "react";
import { Camera, X, Loader2 } from "lucide-react";
import { COLORS } from "../../../theme.js";
import { uploadShopMedia } from "../services/mediaUpload.js";
import { useToast } from "../../../components/ToastContext.jsx";

/**
 * Sélecteur + preview + upload image.
 * Props:
 *  - userId (required)
 *  - folder: "products" | "logos" | "covers"
 *  - value: url actuelle
 *  - onChange: (url) => void
 *  - label
 */
export default function ImageUpload({
  userId,
  folder = "products",
  value,
  onChange,
  label = "Image",
  compact = false,
}) {
  const { showToast } = useToast();
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(value || null);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Preview local immédiat
    const localUrl = URL.createObjectURL(file);
    setPreview(localUrl);

    setUploading(true);
    try {
      const url = await uploadShopMedia(file, { folder, userId });
      setPreview(url);
      onChange?.(url);
      showToast("Image envoyée", "success");
    } catch (err) {
      setPreview(value || null);
      showToast(err.message || "Échec de l'upload", "error");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function clear() {
    setPreview(null);
    onChange?.(null);
  }

  const size = compact ? "w-16 h-16" : "w-24 h-24";

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <span className="text-xs font-medium" style={{ color: COLORS.muted }}>
          {label}
        </span>
      )}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading || !userId}
          className={`${size} rounded-xl border flex items-center justify-center overflow-hidden shrink-0 relative disabled:opacity-50`}
          style={{
            background: COLORS.surface2,
            borderColor: COLORS.border,
          }}
        >
          {preview ? (
            <img src={preview} alt="" className="w-full h-full object-cover" />
          ) : (
            <Camera size={compact ? 18 : 22} style={{ color: COLORS.muted }} />
          )}
          {uploading && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <Loader2 size={20} className="animate-spin" style={{ color: COLORS.gold }} />
            </div>
          )}
        </button>

        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading || !userId}
            className="text-xs font-bold px-2 py-1 rounded-lg border disabled:opacity-50"
            style={{ borderColor: COLORS.border, color: COLORS.gold }}
          >
            {preview ? "Changer" : "Ajouter"}
          </button>
          {preview && (
            <button
              type="button"
              onClick={clear}
              disabled={uploading}
              className="text-xs px-2 py-1 rounded-lg border flex items-center gap-1"
              style={{ borderColor: COLORS.border, color: "#f87171" }}
            >
              <X size={12} /> Retirer
            </button>
          )}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={handleFile}
      />
    </div>
  );
}
