import { uploadExternalMedia } from "../lib/externalMedia.js";
import { useState, useRef } from "react";
import { COLORS } from "../theme.js";
import { supabase } from "../supabaseClient.js";
import { useToast } from "./ToastContext.jsx";
import { X, Upload, Loader2, Plus, Trash2, Package } from "lucide-react";

const CATEGORIES = ["Électronique", "Mode & Vêtements", "Maison & Décoration", "Alimentation", "Beauté & Santé", "Sports & Loisirs", "Autre"];

export default function ProductForm({ shopId, shopCurrency = "XOF", user_id, product = null, onSaved, onCancel }) {
  const { showToast } = useToast();
  const [name, setName] = useState(product?.name || "");
  const [description, setDescription] = useState(product?.description || "");
  const [price, setPrice] = useState(product?.price?.toString() || "");
  const [compareAtPrice, setCompareAtPrice] = useState(product?.compare_at_price?.toString() || "");
  const [type, setType] = useState(product?.type || "produit");
  const [category, setCategory] = useState(product?.category || "");
  const [stock, setStock] = useState(product?.stock?.toString() ?? "");
  const [lowStockThreshold, setLowStockThreshold] = useState(product?.low_stock_threshold?.toString() || "5");
  const [sku, setSku] = useState(product?.sku || "");
  const [tags, setTags] = useState(product?.tags || []);
  const [tagInput, setTagInput] = useState("");
  const [images, setImages] = useState(product?.images || (product?.image_url ? [product.image_url] : []));
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);

  const inputStyle = { background: COLORS.surface2, borderColor: COLORS.border, color: COLORS.ivory };

  const handleImageUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    if (images.length + files.length > 5) { setError("Maximum 5 images par produit."); return; }

    setUploading(true);
    setError("");
    try {
      const newUrls = [];
      for (const file of files) {
        if (file.size > 5 * 1024 * 1024) throw new Error(`Image trop lourde : ${file.name} (max 5Mo)`);
        const result = await uploadExternalMedia(file, {
          folder: "shop",
          user_id,
          maxBytes: 5 * 1024 * 1024,
        });
        newUrls.push(result.url);
      }
      setImages((prev) => [...prev, ...newUrls]);
    } catch (err) {
      setError(err.message);
      showToast(err.message, "error");
    } finally {
      setUploading(false);
    }
  };

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) { setTags([...tags, t]); setTagInput(""); }
  };

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    const p = Number(price);
    const cap = compareAtPrice ? Number(compareAtPrice) : null;
    const stk = type === "produit" ? (stock === "" ? null : parseInt(stock, 10)) : null;
    const lst = type === "produit" ? parseInt(lowStockThreshold, 10) : null;

    if (!name.trim() || !Number.isFinite(p) || p <= 0) { setError("Un nom et un prix valide (> 0) sont requis."); return; }
    if (type === "produit" && (stk === null || stk < 0)) { setError("Veuillez indiquer une quantité de stock valide."); return; }

    setSaving(true);
    try {
      const payload = {
        shop_id: shopId, name: name.trim(), description: description.trim() || null, price: p,
        compare_at_price: cap, currency: shopCurrency, type, category: category || null, tags,
        stock: stk, low_stock_threshold: lst, sku: sku.trim() || null, images,
        image_url: images[0] || null, is_available: stk === null || stk > 0,
      };

      if (product?.id) {
        const { error: err } = await supabase.from("shop_products").update(payload).eq("id", product.id);
        if (err) throw err;
        showToast("Produit mis à jour", "success");
      } else {
        const { error: err } = await supabase.from("shop_products").insert(payload);
        if (err) throw err;
        showToast("Produit ajouté", "success");
      }
      onSaved?.();
    } catch (err) {
      console.error(err);
      setError(err.message || "Erreur lors de l'enregistrement");
      showToast(err.message || "Erreur", "error");
    } finally {
      setSaving(false);
    }
  }

  const isLowStock = stock !== "" && parseInt(stock) <= parseInt(lowStockThreshold) && parseInt(stock) > 0;
  const isOutOfStock = stock !== "" && parseInt(stock) === 0;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <label className="text-[11px] font-bold uppercase tracking-wider mb-2 block" style={{ color: COLORS.muted }}>Photos du produit (max 5)</label>
        <div className="grid grid-cols-4 gap-2 mb-2">
          {images.map((img, idx) => (
            <div key={idx} className="relative aspect-square rounded-xl overflow-hidden border" style={{ borderColor: COLORS.border }}>
              <img src={img} alt="" className="w-full h-full object-cover" />
              <button type="button" onClick={() => setImages(prev => prev.filter((_, i) => i !== idx))} className="absolute top-1 right-1 p-1 rounded-full bg-red-500/90 text-white"><Trash2 size={12} /></button>
              {idx === 0 && <span className="absolute bottom-1 left-1 text-[8px] px-1.5 py-0.5 rounded bg-yellow-500/90 text-black font-bold">PRINCIPALE</span>}
            </div>
          ))}
          {images.length < 5 && (
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="aspect-square rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1 text-xs font-bold transition" style={{ borderColor: COLORS.borderGold, color: uploading ? COLORS.muted : COLORS.gold }}>
              {uploading ? <Loader2 size={16} className="animate-spin" /> : <><Upload size={16} /> Ajouter</>}
            </button>
          )}
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleImageUpload} className="hidden" />
      </div>

      <input type="text" placeholder="Nom du produit / service *" value={name} onChange={(e) => setName(e.target.value)} className="rounded-xl border px-3 py-2.5 text-sm font-bold" style={inputStyle} required />
      <textarea placeholder="Description détaillée (optionnel)" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="rounded-xl border px-3 py-2 text-sm resize-none" style={inputStyle} />

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] font-bold uppercase mb-1 block" style={{ color: COLORS.muted }}>Prix *</label>
          <input type="number" step="0.01" min="0" placeholder="0.00" value={price} onChange={(e) => setPrice(e.target.value)} className="w-full rounded-xl border px-3 py-2.5 text-sm" style={inputStyle} required />
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase mb-1 block" style={{ color: COLORS.muted }}>Ancien prix (promo)</label>
          <input type="number" step="0.01" min="0" placeholder="Optionnel" value={compareAtPrice} onChange={(e) => setCompareAtPrice(e.target.value)} className="w-full rounded-xl border px-3 py-2.5 text-sm" style={inputStyle} />
        </div>
      </div>
      {compareAtPrice && Number(compareAtPrice) > Number(price || 0) && (
        <div className="text-[11px] font-bold px-2 py-1 rounded-lg flex items-center gap-1" style={{ background: "rgba(34,197,94,0.15)", color: "#22c55e" }}>
          💰 Promotion : -{Math.round((1 - Number(price) / Number(compareAtPrice)) * 100)}%
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <select value={type} onChange={(e) => setType(e.target.value)} className="rounded-xl border px-3 py-2.5 text-sm" style={inputStyle}>
          <option value="produit">Produit physique</option>
          <option value="service">Service</option>
          <option value="numerique">Produit numérique</option>
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-xl border px-3 py-2.5 text-sm" style={inputStyle}>
          <option value="">Catégorie...</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {type === "produit" && (
        <div className="p-3 rounded-xl border" style={{ background: COLORS.surface, borderColor: isOutOfStock ? "#ef4444" : isLowStock ? "#f59e0b" : COLORS.border }}>
          <div className="flex items-center gap-2 mb-2"><Package size={14} style={{ color: COLORS.gold }} /><span className="text-[11px] font-bold uppercase" style={{ color: COLORS.muted }}>Gestion du stock</span></div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-bold mb-1 block" style={{ color: COLORS.muted }}>Quantité disponible</label>
              <input type="number" min="0" placeholder="0" value={stock} onChange={(e) => setStock(e.target.value)} className="w-full rounded-xl border px-3 py-2 text-sm" style={{ ...inputStyle, borderColor: isOutOfStock ? "#ef4444" : isLowStock ? "#f59e0b" : COLORS.border }} required />
              {isOutOfStock && <p className="text-[10px] mt-1 font-bold" style={{ color: "#ef4444" }}>⚠️ Rupture de stock</p>}
              {isLowStock && !isOutOfStock && <p className="text-[10px] mt-1 font-bold" style={{ color: "#f59e0b" }}>⚠️ Stock faible</p>}
            </div>
            <div>
              <label className="text-[10px] font-bold mb-1 block" style={{ color: COLORS.muted }}>Alerte stock faible</label>
              <input type="number" min="0" value={lowStockThreshold} onChange={(e) => setLowStockThreshold(e.target.value)} className="w-full rounded-xl border px-3 py-2 text-sm" style={inputStyle} />
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <input type="text" placeholder="Référence / SKU (optionnel)" value={sku} onChange={(e) => setSku(e.target.value)} className="rounded-xl border px-3 py-2.5 text-sm" style={inputStyle} />
        <div className="flex gap-1">
          <input type="text" placeholder="Tag..." value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())} className="flex-1 rounded-xl border px-3 py-2.5 text-sm" style={inputStyle} />
          <button type="button" onClick={addTag} className="px-3 rounded-xl" style={{ background: COLORS.gold, color: COLORS.bg }}><Plus size={16} /></button>
        </div>
      </div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold" style={{ background: `${COLORS.teal}22`, color: COLORS.teal }}>
              {t}
              <button type="button" onClick={() => setTags(tags.filter((x) => x !== t))}><X size={10} /></button>
            </span>
          ))}
        </div>
      )}

      {error && <p className="text-xs font-bold px-3 py-2 rounded-lg" style={{ background: "rgba(239,68,68,0.1)", color: "#f87171", border: "1px solid rgba(239,68,68,0.3)" }}>{error}</p>}

      <div className="flex gap-2 pt-2">
        <button type="submit" disabled={saving || uploading} className="flex-1 rounded-xl py-3 text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2" style={{ background: COLORS.gold, color: COLORS.bg }}>
          {saving ? <Loader2 size={16} className="animate-spin" /> : null}
          {saving ? "Enregistrement…" : product ? "Mettre à jour" : "Ajouter le produit"}
        </button>
        {onCancel && <button type="button" onClick={onCancel} className="px-4 rounded-xl text-sm font-bold border" style={{ borderColor: COLORS.border, color: COLORS.muted }}>Annuler</button>}
      </div>
    </form>
  );
      }
