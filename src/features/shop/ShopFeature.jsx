import ShopCard from "./components/ShopCard.jsx";
import { useState, useEffect, useCallback } from "react";
import { Search, MapPin, Store, Plus, Package, Edit3, Trash2, Loader2, AlertCircle, Eye, EyeOff, Tag } from "lucide-react";
import { COLORS } from "../../theme.js";
import { supabase } from "../../supabaseClient.js";
import { fetchActiveShops } from "../../services/shopApi.js";
import ProductForm from "../../components/ProductForm.jsx";
import { ConfirmDialog } from "../../components/ConfirmDialog.jsx";
import { useToast } from "../../components/ToastContext.jsx";

export function LocalShopDirectory({ onSelectShop }) {
  const { showToast } = useToast();
  const [shops, setShops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [country, setCountry] = useState("");
  const [category, setCategory] = useState("");

  const loadShops = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const data = await fetchActiveShops({ query: search, country: country || undefined, category: category || undefined });
      setShops(data || []);
    } catch (e) { setError(e.message || "Impossible de charger les boutiques."); } finally { setLoading(false); }
  }, [search, country, category]);

  useEffect(() => { loadShops(); }, [loadShops]);

  if (loading) return <div className="flex flex-col items-center justify-center py-12 gap-3"><Loader2 className="animate-spin" size={32} style={{ color: COLORS.gold }} /><p className="text-sm" style={{ color: COLORS.muted }}>Chargement des boutiques…</p></div>;
  if (error) return <div className="flex flex-col items-center justify-center py-12 gap-3 text-center"><AlertCircle size={32} style={{ color: "#ef4444" }} /><p className="text-sm" style={{ color: "#ef4444" }}>{error}</p><button onClick={loadShops} className="px-4 py-2 rounded-xl text-xs font-bold border transition-all active:scale-95" style={{ borderColor: COLORS.border, color: COLORS.ivory }}>Réessayer</button></div>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: COLORS.muted }} />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher une boutique..." className="w-full pl-10 pr-3 py-2.5 rounded-xl border text-sm outline-none transition-colors focus:border-amber-400/50" style={{ background: COLORS.surface2, borderColor: COLORS.border, color: COLORS.ivory }} />
        </div>
        <div className="flex gap-2">
          <input type="text" value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Pays (ex: ML, FR)" className="flex-1 px-3 py-2 rounded-xl border text-xs outline-none transition-colors focus:border-amber-400/50" style={{ background: COLORS.surface2, borderColor: COLORS.border, color: COLORS.ivory }} />
          <input type="text" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Catégorie" className="flex-1 px-3 py-2 rounded-xl border text-xs outline-none transition-colors focus:border-amber-400/50" style={{ background: COLORS.surface2, borderColor: COLORS.border, color: COLORS.ivory }} />
        </div>
      </div>
      {shops.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-center"><Store size={48} style={{ color: COLORS.muted, opacity: 0.3 }} /><p className="text-sm font-semibold" style={{ color: COLORS.ivory }}>Aucune boutique trouvée</p></div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {shops.map((shop) => (
            <ShopCard key={shop.id} shop={shop} onSelect={onSelectShop} />
          ))}
        </div>
      )}
    </div>
  );
}

export function ShopProductManager({ shopId, shopCurrency, userId }) {
  const { showToast } = useToast();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  const loadProducts = useCallback(async () => {
    if (!shopId) return;
    setLoading(true); setError("");
    try {
      const { data, error: fetchError } = await supabase.from("shop_products").select("*").eq("shop_id", shopId).order("created_at", { ascending: false });
      if (fetchError) throw fetchError;
      setProducts(data || []);
    } catch (e) { setError(e.message || "Impossible de charger les produits."); } finally { setLoading(false); }
  }, [shopId]);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  const openForm = (product = null) => { setEditingProduct(product); setShowForm(true); };
  const closeForm = () => { setShowForm(false); setEditingProduct(null); };
  const handleSaved = () => { closeForm(); loadProducts(); };

  const confirmDelete = async () => {
    const productId = pendingDeleteId;
    if (!productId) return;
    setPendingDeleteId(null);
    try {
      const { error } = await supabase.from("shop_products").delete().eq("id", productId);
      if (error) throw error;
      showToast("Produit supprimé", "success");
      await loadProducts();
    } catch (e) { showToast(e.message || "Suppression impossible", "error"); }
  };

  const toggleAvailability = async (product) => {
    try {
      const newAvailability = !product.is_available;
      const { error } = await supabase.from("shop_products").update({ is_available: newAvailability }).eq("id", product.id);
      if (error) throw error;
      showToast(newAvailability ? "Produit disponible" : "Produit masqué", "success");
      await loadProducts();
    } catch (e) { showToast(e.message || "Erreur de mise à jour", "error"); }
  };

  const filteredProducts = products.filter((p) => p.name.toLowerCase().includes(searchQuery.toLowerCase()) || (p.sku && p.sku.toLowerCase().includes(searchQuery.toLowerCase())) || (p.category && p.category.toLowerCase().includes(searchQuery.toLowerCase())));

  if (loading) return <div className="flex flex-col items-center justify-center py-12 gap-3"><Loader2 className="animate-spin" size={32} style={{ color: COLORS.gold }} /><p className="text-sm" style={{ color: COLORS.muted }}>Chargement des produits…</p></div>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h3 className="font-bold text-sm flex items-center gap-2" style={{ color: COLORS.ivory }}><Package size={16} style={{ color: COLORS.gold }} /> Mes produits ({filteredProducts.length})</h3>
        <div className="flex gap-2">
          <div className="relative flex-1 sm:w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: COLORS.muted }} />
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Rechercher (nom, SKU...)" className="w-full pl-9 pr-3 py-2 rounded-xl border text-xs outline-none" style={{ background: COLORS.surface2, borderColor: COLORS.border, color: COLORS.ivory }} />
          </div>
          <button onClick={() => openForm()} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 whitespace-nowrap" style={{ background: COLORS.gold, color: COLORS.bg }}><Plus size={14} /> Ajouter</button>
        </div>
      </div>

      {error && <div className="rounded-xl border p-3 text-sm flex items-center gap-2" style={{ background: "rgba(239, 68, 68, 0.1)", borderColor: "#ef4444", color: "#ef4444" }}><AlertCircle size={16} /> {error}</div>}

      {filteredProducts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-center"><Package size={48} style={{ color: COLORS.muted, opacity: 0.3 }} /><p className="text-sm font-semibold" style={{ color: COLORS.ivory }}>{searchQuery ? "Aucun produit ne correspond" : "Aucun produit"}</p></div>
      ) : (
        <div className="flex flex-col gap-3">
          {filteredProducts.map((product) => {
            const hasDiscount = product.compare_at_price && Number(product.compare_at_price) > Number(product.price);
            const isLowStock = product.type === "produit" && product.stock !== null && product.stock <= (product.low_stock_threshold || 5) && product.stock > 0;
            const isOutOfStock = product.type === "produit" && product.stock === 0;
            return (
              <div key={product.id} className="flex items-start gap-3 rounded-xl border p-3 transition-all" style={{ background: COLORS.surface, borderColor: COLORS.border, opacity: product.is_available ? 1 : 0.6 }}>
                <div className="w-20 h-20 rounded-lg overflow-hidden shrink-0 relative" style={{ background: COLORS.surface2 }}>
                  {(product.images?.[0] || product.image_url) ? <img src={product.images?.[0] || product.image_url} alt={product.name} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Package size={20} style={{ color: COLORS.muted }} /></div>}
                  {hasDiscount && <span className="absolute top-1 left-1 text-[8px] font-black px-1 py-0.5 rounded bg-red-500 text-white">-{Math.round((1 - Number(product.price) / Number(product.compare_at_price)) * 100)}%</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="font-bold text-sm truncate" style={{ color: COLORS.ivory }}>{product.name}</h4>
                    {!product.is_available && <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-500/20 text-gray-400 font-bold shrink-0">MASQUÉ</span>}
                  </div>
                  {product.category && <p className="text-[10px] mt-0.5 flex items-center gap-1" style={{ color: COLORS.muted }}><Tag size={10} /> {product.category}{product.sku && <span className="ml-1 opacity-70">· SKU: {product.sku}</span>}</p>}
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-sm font-black" style={{ color: COLORS.gold }}>{Number(product.price).toLocaleString()} {product.currency}</span>
                    {hasDiscount && <span className="text-xs line-through" style={{ color: COLORS.muted }}>{Number(product.compare_at_price).toLocaleString()}</span>}
                  </div>
                  {product.type === "produit" && (
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${isOutOfStock ? "bg-red-500/20 text-red-400" : isLowStock ? "bg-amber-500/20 text-amber-400" : "bg-teal-500/20 text-teal-400"}`}>{isOutOfStock ? "Rupture" : isLowStock ? `Stock faible: ${product.stock}` : `Stock: ${product.stock}`}</span>
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <button onClick={() => toggleAvailability(product)} className="p-2 rounded-lg transition-colors hover:bg-white/5" style={{ color: product.is_available ? COLORS.teal : COLORS.muted }} title={product.is_available ? "Masquer" : "Rendre disponible"}>{product.is_available ? <Eye size={16} /> : <EyeOff size={16} />}</button>
                  <button onClick={() => openForm(product)} className="p-2 rounded-lg transition-colors hover:bg-white/5" style={{ color: COLORS.gold }} title="Modifier"><Edit3 size={16} /></button>
                  <button onClick={() => setPendingDeleteId(product.id)} className="p-2 rounded-lg transition-colors hover:bg-red-500/10" style={{ color: "#ef4444" }} title="Supprimer"><Trash2 size={16} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog open={Boolean(pendingDeleteId)} title="Supprimer ce produit ?" message="Cette action est définitive." confirmLabel="Supprimer" cancelLabel="Annuler" onConfirm={confirmDelete} onCancel={() => setPendingDeleteId(null)} />
      {showForm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" onClick={closeForm}>
          <div className="w-full sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl border shadow-2xl p-4 sm:p-6" style={{ background: COLORS.surface, borderColor: COLORS.borderGold }} onClick={(e) => e.stopPropagation()}>
            <ProductForm shopId={shopId} shopCurrency={shopCurrency} userId={userId} product={editingProduct} onSaved={handleSaved} onCancel={closeForm} />
          </div>
        </div>
      )}
    </div>
  );
                                                                                           }
