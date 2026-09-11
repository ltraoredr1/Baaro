import { useState } from "react";
import { COLORS } from "../theme.js";
import { supabase } from "../supabaseClient.js";
import ImageUpload from "./ImageUpload.jsx";
import { useToast } from "./ToastContext.jsx";

/**
 * Formulaire ajout / édition produit avec image.
 */
export default function ProductForm({
  shopId,
  shopCurrency = "XOF",
  userId,
  product = null, // si édition
  onSaved,
  onCancel,
}) {
  const { showToast } = useToast();
  const [name, setName] = useState(product?.name || "");
  const [description, setDescription] = useState(product?.description || "");
  const [price, setPrice] = useState(product?.price?.toString() || "");
  const [type, setType] = useState(product?.type || "produit");
  const [imageUrl, setImageUrl] = useState(product?.image_url || null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const inputStyle = {
    background: COLORS.surface2,
    borderColor: COLORS.border,
    color: COLORS.ivory,
  };

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    const p = Number(price);
    if (!name.trim() || !Number.isFinite(p) || p < 0) {
      setError("Nom et prix valides requis.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        shop_id: shopId,
        name: name.trim(),
        description: description.trim() || null,
        price: p,
        currency: shopCurrency,
        type,
        image_url: imageUrl || null,
        is_available: true,
      };

      if (product?.id) {
        const { error: err } = await supabase
          .from("shop_products")
          .update(payload)
          .eq("id", product.id);
        if (err) throw err;
        showToast("Produit mis à jour", "success");
      } else {
        const { error: err } = await supabase.from("shop_products").insert(payload);
        if (err) throw err;
        showToast("Produit ajouté", "success");
      }
      onSaved?.();
    } catch (err) {
      setError(err.message || "Erreur");
      showToast(err.message || "Erreur", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <ImageUpload
        userId={userId}
        folder="products"
        value={imageUrl}
        onChange={setImageUrl}
        label="Photo du produit"
      />

      <input
        type="text"
        placeholder="Nom du produit / service"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="rounded-xl border px-3 py-2 text-sm"
        style={inputStyle}
        required
      />

      <textarea
        placeholder="Description (optionnel)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        className="rounded-xl border px-3 py-2 text-sm"
        style={inputStyle}
      />

      <div className="flex gap-2">
        <input
          type="number"
          step="0.01"
          min="0"
          placeholder={`Prix (${shopCurrency})`}
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="flex-1 rounded-xl border px-3 py-2 text-sm"
          style={inputStyle}
          required
        />
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="rounded-xl border px-3 py-2 text-sm"
          style={inputStyle}
        >
          <option value="produit">Produit</option>
          <option value="service">Service</option>
        </select>
      </div>

      {error && (
        <p className="text-xs" style={{ color: "#f87171" }}>
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="flex-1 rounded-xl py-2 text-sm font-bold disabled:opacity-50"
          style={{ background: COLORS.goldGlow, color: COLORS.gold }}
        >
          {saving ? "Enregistrement…" : product ? "Mettre à jour" : "Ajouter"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 rounded-xl text-sm border"
            style={{ borderColor: COLORS.border, color: COLORS.muted }}
          >
            Annuler
          </button>
        )}
      </div>
    </form>
  );
}
