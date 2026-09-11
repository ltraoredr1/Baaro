import { supabase } from "../../../supabaseClient.js";

/**
 * Types d'entreprises supportés
 */
export const COMPANY_TYPES = [
  { id: "shop", label: "Boutique / Commerce", icon: "🏪" },
  { id: "transport", label: "Transport", icon: "🚌" },
  { id: "radio", label: "Radio / Radiodiffusion", icon: "📻" },
  { id: "tv", label: "Télévision", icon: "📺" },
  { id: "telecom", label: "Télécoms", icon: "📡" },
  { id: "energy", label: "Énergie", icon: "⚡" },
  { id: "bank", label: "Banque / Finances", icon: "🏦" },
  { id: "insurance", label: "Assurance", icon: "🛡️" },
  { id: "education", label: "Éducation", icon: "🎓" },
  { id: "health", label: "Santé", icon: "🏥" },
  { id: "hospitality", label: "Hôtellerie / Tourisme", icon: "🏨" },
  { id: "other", label: "Autre", icon: "🏢" },
];

export const PROGRAM_TYPES = [
  { id: "schedule", label: "Horaire / Grille" },
  { id: "route", label: "Itinéraire (transport)" },
  { id: "show", label: "Émission (radio/TV)" },
  { id: "service", label: "Service" },
  { id: "event", label: "Événement" },
  { id: "other", label: "Autre" },
];

export const DAYS_LABELS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

/* ========== COMPANIES ========== */

export async function fetchActiveCompanies({
  query = "",
  companyType,
  country,
  city,
  limit = 40,
} = {}) {
  let q = supabase
    .from("companies")
    .select(
      "id, name, description, company_type, category, country, city, logo_url, phone, currency"
    )
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (query.trim()) {
    q = q.or(
      `name.ilike.%${query.trim()}%,city.ilike.%${query.trim()}%,category.ilike.%${query.trim()}%,description.ilike.%${query.trim()}%`
    );
  }
  if (companyType) q = q.eq("company_type", companyType);
  if (country) q = q.eq("country", country);
  if (city) q = q.ilike("city", `%${city}%`);

  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function fetchCompanyById(companyId) {
  const { data, error } = await supabase
    .from("companies")
    .select(
      "id, name, description, company_type, category, country, city, address, logo_url, cover_url, phone, email, website, social_links, currency, owner_id"
    )
    .eq("id", companyId)
    .single();
  if (error) throw error;
  return data;
}

export async function fetchMyCompany(userId) {
  const { data, error } = await supabase
    .from("companies")
    .select("id, name, company_type, is_active, subscription_status, currency, country, city")
    .eq("owner_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createCompany(payload) {
  const { data, error } = await supabase
    .from("companies")
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateCompany(companyId, updates) {
  const { data, error } = await supabase
    .from("companies")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", companyId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/* ========== PROGRAMS ========== */

export async function fetchCompanyPrograms(companyId, { onlyActive = true } = {}) {
  let q = supabase
    .from("company_programs")
    .select("*")
    .eq("company_id", companyId)
    .order("sort_order", { ascending: true })
    .order("start_time", { ascending: true });

  if (onlyActive) q = q.eq("is_active", true);

  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function createProgram(payload) {
  const { data, error } = await supabase
    .from("company_programs")
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateProgram(programId, updates) {
  const { data, error } = await supabase
    .from("company_programs")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", programId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteProgram(programId) {
  const { error } = await supabase
    .from("company_programs")
    .delete()
    .eq("id", programId);
  if (error) throw error;
}

/* ========== TARIFFS ========== */

export async function fetchCompanyTariffs(companyId, { onlyActive = true } = {}) {
  let q = supabase
    .from("company_tariffs")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  if (onlyActive) q = q.eq("is_active", true);

  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function createTariff(payload) {
  const { data, error } = await supabase
    .from("company_tariffs")
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateTariff(tariffId, updates) {
  const { data, error } = await supabase
    .from("company_tariffs")
    .update(updates)
    .eq("id", tariffId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteTariff(tariffId) {
  const { error } = await supabase
    .from("company_tariffs")
    .delete()
    .eq("id", tariffId);
  if (error) throw error;
}

/* ========== INFOS ========== */

export async function fetchCompanyInfos(companyId) {
  const { data, error } = await supabase
    .from("company_infos")
    .select("*")
    .eq("company_id", companyId)
    .eq("is_public", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function createInfo(payload) {
  const { data, error } = await supabase
    .from("company_infos")
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateInfo(infoId, updates) {
  const { data, error } = await supabase
    .from("company_infos")
    .update(updates)
    .eq("id", infoId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteInfo(infoId) {
  const { error } = await supabase
    .from("company_infos")
    .delete()
    .eq("id", infoId);
  if (error) throw error;
}
