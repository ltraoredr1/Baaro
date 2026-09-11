import { supabase } from "../supabaseClient.js";

export const COMPANY_TYPES = [
  ["transport", "Transport", "🚌"],
  ["radio", "Radio", "📻"],
  ["tv", "Télévision", "📺"],
  ["telecom", "Télécoms", "📡"],
  ["energy", "Énergie", "⚡"],
  ["bank", "Banque / Finances", "🏦"],
  ["insurance", "Assurance", "🛡️"],
  ["education", "Éducation", "🎓"],
  ["health", "Santé", "🏥"],
  ["hospitality", "Hôtellerie / Tourisme", "🏨"],
  ["shop", "Commerce", "🏪"],
  ["other", "Autre", "🏢"],
].map(([id, label, icon]) => ({ id, label, icon }));

export const PROGRAM_TYPES = [
  ["schedule", "Horaire / Grille"],
  ["route", "Itinéraire"],
  ["show", "Émission"],
  ["service", "Service"],
  ["event", "Événement"],
  ["other", "Autre"],
].map(([id, label]) => ({ id, label }));

export const DAYS_LABELS = {
  0: "Dimanche",
  1: "Lundi",
  2: "Mardi",
  3: "Mercredi",
  4: "Jeudi",
  5: "Vendredi",
  6: "Samedi",
};

function escapeLike(value = "") {
  return String(value).trim().replace(/[%_]/g, (m) => `\\${m}`);
}

function assertId(id, label = "ID") {
  if (!id || typeof id !== "string") throw new Error(`${label} invalide.`);
}

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
      "id,name,description,company_type,category,country,city,logo_url,phone,email,website,currency"
    )
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(Number(limit) || 40, 1), 100));

  const term = escapeLike(query);
  if (term) {
    q = q.or(
      `name.ilike.%${term}%,city.ilike.%${term}%,category.ilike.%${term}%,description.ilike.%${term}%`
    );
  }
  if (companyType) q = q.eq("company_type", companyType);
  if (country) q = q.eq("country", country);
  if (city) q = q.ilike("city", `%${escapeLike(city)}%`);

  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function fetchCompanyById(id) {
  assertId(id, "Entreprise");
  const { data, error } = await supabase.from("companies").select("*").eq("id", id).single();
  if (error) throw error;
  return data;
}

export async function fetchMyCompany(userId) {
  assertId(userId, "Utilisateur");
  const { data, error } = await supabase
    .from("companies")
    .select("*")
    .eq("owner_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createCompany(payload) {
  const { data, error } = await supabase.from("companies").insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function updateCompany(id, updates) {
  assertId(id, "Entreprise");
  const { data, error } = await supabase
    .from("companies")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function fetchCompanyPrograms(id, { onlyActive = true } = {}) {
  assertId(id, "Entreprise");
  let q = supabase
    .from("company_programs")
    .select("*")
    .eq("company_id", id)
    .order("sort_order", { ascending: true })
    .order("start_time", { ascending: true, nullsFirst: false });
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

export async function updateProgram(id, updates) {
  assertId(id, "Programme");
  const { data, error } = await supabase
    .from("company_programs")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteProgram(id) {
  assertId(id, "Programme");
  const { error } = await supabase.from("company_programs").delete().eq("id", id);
  if (error) throw error;
}

export async function fetchCompanyTariffs(id, { onlyActive = true } = {}) {
  assertId(id, "Entreprise");
  let q = supabase
    .from("company_tariffs")
    .select("*")
    .eq("company_id", id)
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

export async function updateTariff(id, updates) {
  assertId(id, "Tarif");
  const { data, error } = await supabase
    .from("company_tariffs")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteTariff(id) {
  assertId(id, "Tarif");
  const { error } = await supabase.from("company_tariffs").delete().eq("id", id);
  if (error) throw error;
}

export async function fetchCompanyInfos(id, { publicOnly = true } = {}) {
  assertId(id, "Entreprise");
  let q = supabase
    .from("company_infos")
    .select("*")
    .eq("company_id", id)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  if (publicOnly) q = q.eq("is_public", true);
  const { data, error } = await q;
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

export async function updateInfo(id, updates) {
  assertId(id, "Information");
  const { data, error } = await supabase
    .from("company_infos")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteInfo(id) {
  assertId(id, "Information");
  const { error } = await supabase.from("company_infos").delete().eq("id", id);
  if (error) throw error;
}
