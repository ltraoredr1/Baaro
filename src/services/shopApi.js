import { supabase } from "../supabaseClient.js";

// ===== FONCTIONS EXISTANTES =====

export async function fetchActiveShops({ query = "", country, city, category, limit = 40 } = {}) {
  let q = supabase.from("shops").select("id, name, description, category, country, city, logo_url, currency, is_verified").eq("is_active", true).order("created_at", { ascending: false }).limit(limit);
  if (query.trim()) q = q.or(`name.ilike.%${query.trim()}%,city.ilike.%${query.trim()}%,category.ilike.%${query.trim()}%`);
  if (country) q = q.eq("country", country);
  if (city) q = q.ilike("city", `%${city}%`);
  if (category) q = q.ilike("category", `%${category}%`);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function fetchShopById(shopId) {
  const { data, error } = await supabase.from("shops").select("id, name, description, category, country, city, logo_url, currency, owner_id, is_verified").eq("id", shopId).single();
  if (error) throw error;
  return data;
}

export async function fetchShopProducts(shopId, { onlyAvailable = true } = {}) {
  let q = supabase.from("shop_products").select(`id, name, description, price, compare_at_price, currency, type, category, tags, stock, low_stock_threshold, sku, images, image_url, is_available, shop_id`).eq("shop_id", shopId).order("created_at", { ascending: false });
  if (onlyAvailable) q = q.eq("is_available", true);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function createOrder({ shopId, buyerId, items, method = "pickup", notes = "", dropoffAddress = null }) {
  if (!shopId || !buyerId || !Array.isArray(items) || items.length === 0) throw new Error("Données de commande invalides.");
  const payload = items.map((i) => ({ product_id: i.productId, quantity: Math.max(1, Math.min(100, Number(i.quantity) || 1)) }));
  const { data, error } = await supabase.rpc("create_order_secure", {
    p_shop_id: shopId,
    p_buyer_id: buyerId,
    p_method: method,
    p_notes: notes || null,
    p_dropoff_address: dropoffAddress || null,
    p_items: payload
  });
  if (error) throw error;
  return data;
}

export async function cancelOrder(orderId, reason = "") {
  const { data, error } = await supabase.rpc("cancel_order_secure", {
    p_order_id: orderId,
    p_reason: reason
  });
  if (error) throw error;
  return data;
}

export async function updateOrderStatus(orderId, status) {
  const { data, error } = await supabase.rpc("update_order_status_secure", {
    p_order_id: orderId,
    p_status: status
  });
  if (error) throw error;
  return data;
}

export async function fetchBuyerOrders(buyerId) {
  const { data, error } = await supabase.from("orders").select(`id, status, method, total_amount, currency, pickup_code, notes, payment_status, created_at, shops ( id, name, city ), order_items ( id, name, unit_price, quantity, currency )`).eq("buyer_id", buyerId).order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function fetchSellerOrders(shopId) {
  const { data, error } = await supabase.from("orders").select(`id, status, method, total_amount, currency, pickup_code, notes, payment_status, created_at, buyer_id, order_items ( id, name, unit_price, quantity, currency )`).eq("shop_id", shopId).order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

// ===== ADMIN =====

export async function fetchAllShopsForAdmin({ status = "all", limit = 100 } = {}) {
  let q = supabase.from("shops").select("*, profiles!shops_owner_id_fkey(id, display_name, handle, avatar_url)").order("created_at", { ascending: false }).limit(limit);

  if (status === "pending") q = q.eq("is_active", false);
  else if (status === "active") q = q.eq("is_active", true);

  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function moderateShop(shopId, action, reason = "") {
  const { data, error } = await supabase.rpc("admin_moderate_shop", {
    p_shop_id: shopId,
    p_action: action,
    p_reason: reason
  });
  if (error) throw error;
  return data;
}

export async function reportProduct(productId, reason, description = "") {
  const { data, error } = await supabase.from("shop_product_reports").insert({
    product_id: productId,
    reporter_id: (await supabase.auth.getUser()).data.user?.id,
    reason,
    description,
    status: "pending"
  }).select().single();
  if (error) throw error;
  return data;
}

export async function fetchProductReports({ status = "pending", limit = 50 } = {}) {
  const { data, error } = await supabase
    .from("shop_product_reports")
    .select(`
      *,
      shop_products (id, name, images, shop_id, shops(name)),
      profiles!shop_product_reports_reporter_id_fkey(id, display_name, handle)
    `)
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

export async function handleProductReport(reportId, action, notes = "") {
  const { data, error } = await supabase.rpc("admin_handle_product_report", {
    p_report_id: reportId,
    p_action: action,
    p_notes: notes
  });
  if (error) throw error;
  return data;
}

export async function verifySeller(shopId, verified) {
  const { data, error } = await supabase.rpc("admin_moderate_shop", {
    p_shop_id: shopId,
    p_action: verified ? "verify" : "unverify"
  });
  if (error) throw error;
  return data;
}

export async function createDispute(orderId, reason, description = "") {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié");

  const { data, error } = await supabase.from("shop_disputes").insert({
    order_id: orderId,
    created_by: user.id,
    reason,
    description,
    status: "open"
  }).select().single();

  if (error) throw error;
  return data;
}

export async function fetchDisputes({ status = "open", limit = 50 } = {}) {
  const { data, error } = await supabase
    .from("shop_disputes")
    .select(`
      *,
      orders!shop_disputes_order_id_fkey(id, total_amount, currency, shops(name)),
      profiles!shop_disputes_created_by_fkey(id, display_name, handle)
    `)
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

export async function resolveDispute(disputeId, resolution, notes = "") {
  const { data, error } = await supabase.rpc("admin_resolve_dispute", {
    p_dispute_id: disputeId,
    p_resolution: resolution,
    p_notes: notes
  });
  if (error) throw error;
  return data;
}

export async function fetchCommissionStats({ startDate, endDate } = {}) {
  let q = supabase
    .from("shop_commissions")
    .select("commission_amount, seller_amount, total_amount, currency, created_at");

  if (startDate) q = q.gte("created_at", startDate);
  if (endDate) q = q.lte("created_at", endDate);

  const { data, error } = await q;
  if (error) throw error;

  const stats = (data || []).reduce((acc, comm) => {
    const currency = comm.currency || "XOF";
    if (!acc[currency]) {
      acc[currency] = { total_commission: 0, total_seller: 0, total_amount: 0, count: 0 };
    }
    acc[currency].total_commission += Number(comm.commission_amount || 0);
    acc[currency].total_seller += Number(comm.seller_amount || 0);
    acc[currency].total_amount += Number(comm.total_amount || 0);
    acc[currency].count += 1;
    return acc;
  }, {});

  return stats;
}

export async function detectFraudulentOrders() {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { data: recentOrders } = await supabase
    .from("orders")
    .select("buyer_id, total_amount, created_at")
    .gte("created_at", oneHourAgo);

  const counts = {};
  const highValue = [];
  (recentOrders || []).forEach(o => {
    counts[o.buyer_id] = (counts[o.buyer_id] || 0) + 1;
    if (Number(o.total_amount) > 1000000) {
      highValue.push(o);
    }
  });

  return {
    suspicious_users: Object.entries(counts)
      .filter(([_, count]) => count > 10)
      .map(([userId]) => userId),
    high_value_orders: highValue,
    detected_at: new Date().toISOString()
  };
}
