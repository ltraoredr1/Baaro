import { useState, useEffect } from "react";
import { X, Trash2, Loader2, ShoppingCart, AlertTriangle } from "lucide-react";
import { COLORS } from "../../../theme.js";
import { supabase } from "../../../supabaseClient.js";
import { useToast } from "../../../components/ToastContext.jsx";

export default function CartDrawer({ isOpen, onClose, id }) {
  const { showToast } = useToast();
  const [cartItems, setCartItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (isOpen && id) loadCart(); }, [isOpen, id]);

  const loadCart = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from("cart").select(`id, quantity, shop_products (id, name, price, compare_at_price, currency, stock, images, image_url, is_available)`).eq("user_id", id);
      if (error) throw error;
      const validItems = (data || []).filter(item => item.shop_products && item.shop_products.is_available && item.shop_products.stock > 0);
      setCartItems(validItems);
    } catch (err) { console.error("Erreur chargement panier:", err); } finally { setLoading(false); }
  };

  const updateQuantity = async (cartId, productId, newQuantity) => {
    if (newQuantity <= 0) { await removeFromCart(cartId); return; }
    try {
      const { error } = await supabase.from("cart").update({ quantity: newQuantity }).eq("id", cartId);
      if (error) throw error;
      loadCart();
    } catch (err) { showToast("Erreur de mise à jour", "error"); }
  };

  const removeFromCart = async (cartId) => {
    try {
      const { error } = await supabase.from("cart").delete().eq("id", cartId);
      if (error) throw error;
      loadCart();
      showToast("Article retiré", "success");
    } catch (err) { showToast("Erreur de suppression", "error"); }
  };

  const total = cartItems.reduce((sum, item) => sum + (Number(item.shop_products?.price || 0) * item.quantity), 0);
  const currency = cartItems[0]?.shop_products?.currency || "XOF";
  const totalItems = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md h-full flex flex-col shadow-2xl" style={{ background: COLORS.surface }}>
        <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: COLORS.border }}>
          <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: COLORS.ivory }}><ShoppingCart size={20} style={{ color: COLORS.gold }} /> Mon Panier ({totalItems})</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10" style={{ color: COLORS.muted }}><X size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="animate-spin" style={{ color: COLORS.gold }} /></div>
          ) : cartItems.length === 0 ? (
            <div className="text-center py-12" style={{ color: COLORS.muted }}><ShoppingCart size={48} className="mx-auto mb-3 opacity-30" /><p>Votre panier est vide</p></div>
          ) : (
            cartItems.map((item) => {
              const product = item.shop_products;
              const imageUrl = product?.images?.[0] || product?.image_url;
              return (
                <div key={item.id} className="flex gap-3 p-3 rounded-xl border" style={{ background: COLORS.surface2, borderColor: COLORS.border }}>
                  <div className="w-16 h-16 rounded-lg overflow-hidden shrink-0" style={{ background: "rgba(255,255,255,0.05)" }}>
                    {imageUrl ? <img src={imageUrl} alt={product.name} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><ShoppingCart size={16} style={{ color: COLORS.muted }} /></div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-bold truncate" style={{ color: COLORS.ivory }}>{product.name}</h4>
                    <p className="text-xs font-bold mt-1" style={{ color: COLORS.gold }}>{Number(product.price).toLocaleString()} {product.currency}</p>
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center gap-2 rounded-lg border px-1" style={{ borderColor: COLORS.border }}>
                        <button onClick={() => updateQuantity(item.id, product.id, item.quantity - 1)} className="p-1" style={{ color: COLORS.ivory }}><X size={12} /></button>
                        <span className="text-xs font-bold min-w-[20px] text-center" style={{ color: COLORS.ivory }}>{item.quantity}</span>
                        <button onClick={() => updateQuantity(item.id, product.id, item.quantity + 1)} className="p-1" style={{ color: COLORS.ivory }}><span className="text-lg leading-none">+</span></button>
                      </div>
                      <button onClick={() => removeFromCart(item.id)} className="p-1.5 rounded-lg hover:bg-red-500/10" style={{ color: "#ef4444" }}><Trash2 size={14} /></button>
                    </div>
                    {product.stock <= 5 && <p className="text-[10px] mt-1 flex items-center gap-1" style={{ color: "#f59e0b" }}><AlertTriangle size={10} /> Plus que {product.stock} en stock</p>}
                  </div>
                </div>
              );
            })
          )}
        </div>
        {cartItems.length > 0 && (
          <div className="p-4 border-t" style={{ borderColor: COLORS.border }}>
            <div className="flex justify-between items-center mb-4">
              <span className="text-sm" style={{ color: COLORS.muted }}>Total</span>
              <span className="text-xl font-black" style={{ color: COLORS.ivory }}>{total.toLocaleString()} {currency}</span>
            </div>
            <button onClick={() => { onClose(); /* La navigation vers le checkout est gérée par ShopDetail ou le Router */ }} className="w-full py-3 rounded-xl font-bold text-sm" style={{ background: COLORS.gold, color: COLORS.bg }}>Passer la commande</button>
          </div>
        )}
      </div>
    </div>
  );
}
