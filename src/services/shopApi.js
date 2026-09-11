import { supabase } from "../supabaseClient.js";

export async function fetchActiveShops({ query = "", country, city, category, limit = 40 } = {}) {
  let q = supabase
    .from("shops")
    .select("id, name, description, category, country, city, logo_url, currency")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (query.trim()) {
    q = q.or(
      `name.ilike.%${query.trim()}%,city.ilike.%${query.trim()}%,category.ilike.%${query.trim()}%`
    );
  }
  if (country) q = q.eq("country", country);
  if (city) q = q.ilike("city", `%${city}%`);
  if (category) q = q.ilike("category", `%${category}%`);

  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function fetchShopById(shopId) {
  const { data, error } = await supabase
    .from("shops")
    .select("id, name, description, category, country, city, logo_url, currency, owner_id")
    .eq("id", shopId)
    .single();
  if (error) throw error;
  return data;
}

export async function fetchShopProducts(shopId, { onlyAvailable = true } = {}) {
  let q = supabase
    .from("shop_products")
    .select("id, name, description, price, currency, type, image_url, is_available")
    .eq("shop_id", shopId)
    .order("created_at", { ascending: false });

  if (onlyAvailable) q = q.eq("is_available", true);

  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function createOrder({
  shopId,
  buyerId,
  items,
  method = "pickup",
  notes = "",
  dropoffAddress = null,
}) {
  if (!shopId || !buyerId || !Array.isArray(items) || items.length === 0) {
    throw new Error("Commande invalide.");
  }

  // Le serveur recalcule les prix depuis shop_products.
  // Les prix/noms envoyés par le client ne sont jamais utilisés pour facturer.
  const payload = items.map((i) => ({
    productId: i.productId,
    quantity: Math.max(1, Math.min(100, Number(i.quantity) || 1)),
  }));

  const { data, error } = await supabase.rpc("create_order_secure", {
    p_shop_id: shopId,
    p_method: method,
    p_notes: notes || null,
    p_dropoff_address: dropoffAddress || null,
    p_items: payload,
  });

  if (error) throw error;
  return data;
}

export async function updateOrderStatus(orderId, status) {
  const { data, error } = await supabase
    .from("orders")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", orderId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function fetchBuyerOrders(userId) {
  const { data, error } = await supabase
    .from("orders")
    .select(`
      id, status, method, total_amount, currency, pickup_code, notes, created_at,
      shops ( id, name, city ),
      order_items ( id, name, unit_price, quantity, currency )
    `)
    .eq("buyer_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function fetchSellerOrders(shopId) {
  const { data, error } = await supabase
    .from("orders")
    .select(`
      id, status, method, total_amount, currency, pickup_code, notes, created_at, buyer_id,
      order_items ( id, name, unit_price, quantity, currency )
    `)
    .eq("shop_id", shopId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}
