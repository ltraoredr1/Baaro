import { useRef, useState, useEffect } from "react";
import { Camera, X, Loader2 } from "lucide-react";
import { COLORS as THEME_COLORS } from "../theme.js";
import { uploadShopMedia } from "../services/mediaUpload.js";
import { useToast } from "./ToastContext.jsx";

const FALLBACK = {
  surface2: "rgba(255,255,255,0.06)",
  border: "rgba(255,255,255,0.08)",
  muted: "rgba(245,243,239,0.5)",
  gold: "#D9AE52",
};

export default function ImageUpload({
  userId,
  folder = "products",
  value,
  onChange,
  label = "Image",
  compact = false,
}) {
  const C = {...FALLBACK,...(THEME_COLORS||{}) };
  const { showToast } = useToast() || {};
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(value || null);
  const objectUrlRef = useRef(null);

  useEffect(() => {
    setPreview(value || null);
  }, [value]);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      showToast?.("Image trop lourde (max 8Mo)", "error");
      return;
    }

    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const localUrl = URL.createObjectURL(file);
    objectUrlRef.current = localUrl;
    setPreview(localUrl);
    setUploading(true);

    try {
      const url = await uploadShopMedia(file, { folder, userId });
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
      setPreview(url);
      onChange?.(url);
      showToast?.("Image envoyée", "success");
    } catch (err) {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
      setPreview(value || null);
      showToast?.(err.message || "Échec de l'upload", "error");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function clear() {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setPreview(null);
    onChange?.(null);
  }

  const size = compact? "w-16 h-16" : "w-24 h-24";

  return (
    <div className="flex flex-col gap-1.5">
      {label && <span className="text-xs font-medium" style={{ color: C.muted }}>{label}</span>}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading ||!userId}
          className={`${size} rounded-xl border flex items-center justify-center overflow-hidden shrink-0 relative disabled:opacity-50 hover:border-amber-400/30 transition`}
          style={{ background: C.surface2, borderColor: C.border }}
        >
          {preview? <img src={preview} alt="" className="w-full h-full object-cover" /> : <Camera size={compact? 18 : 22} style={{ color: C.muted }} />}
          {uploading && <div className="absolute inset-0 bg-black/60 flex items-center justify-center"><Loader2 size={20} className="animate-spin" style={{ color: C.gold }} /></div>}
        </button>

        <div className="flex flex-col gap-1">
          <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading ||!userId} className="text-xs font-bold px-2.5 py-1 rounded-lg border disabled:opacity-50" style={{ borderColor: C.border, color: C.gold }}>
            {preview? "Changer" : "Ajouter"}
          </button>
          {preview && <button type="button" onClick={clear} disabled={uploading} className="text-xs px-2.5 py-1 rounded-lg border flex items-center gap-1 hover:bg-white/5" style={{ borderColor: C.border, color: "#f87171" }}><X size={12} /> Retirer</button>}
        </div>
      </div>

      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={handleFile} />
    </div>
  );
}
