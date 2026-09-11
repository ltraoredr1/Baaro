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
  const total = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
  const currency = items[0]?.currency || "XOF";
  const pickupCode =
    method === "pickup"
      ? Math.random().toString(36).substring(2, 8).toUpperCase()
      : null;

  const { data: order, error } = await supabase
    .from("orders")
    .insert({
      shop_id: shopId,
      buyer_id: buyerId,
      status: "pending",
      payment_status: "unpaid",
      method,
      total_amount: total,
      currency,
      pickup_code: pickupCode,
      notes: notes || null,
      dropoff_address: dropoffAddress,
    })
    .select()
    .single();

  if (error) throw error;

  const orderItems = items.map((i) => ({
    order_id: order.id,
    product_id: i.productId,
    name: i.name,
    unit_price: i.unitPrice,
    quantity: i.quantity,
    currency: i.currency,
  }));

  const { error: itemsError } = await supabase.from("order_items").insert(orderItems);
  if (itemsError) throw itemsError;

  return order;
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
