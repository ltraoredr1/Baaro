import { supabase } from "../supabaseClient.js";

export const COMPANY_TYPES = [
  ["transport","Transport","🚌"],["radio","Radio","📻"],["tv","Télévision","📺"],
  ["telecom","Télécoms","📡"],["energy","Énergie","⚡"],["bank","Banque / Finances","🏦"],
  ["insurance","Assurance","🛡️"],["education","Éducation","🎓"],["health","Santé","🏥"],
  ["hospitality","Hôtellerie / Tourisme","🏨"],["shop","Commerce","🏪"],["other","Autre","🏢"]
].map(([id,label,icon]) => ({ id, label, icon }));

export const PROGRAM_TYPES = [
  ["schedule","Horaire / Grille"],["route","Itinéraire"],["show","Émission"],
  ["service","Service"],["event","Événement"],["other","Autre"]
].map(([id,label]) => ({ id, label }));

export async function fetchActiveCompanies({ query="", companyType, country, city, limit=40 }={}) {
  let q = supabase.from("companies")
    .select("id,name,description,company_type,category,country,city,logo_url,phone,currency")
    .eq("is_active", true).order("created_at", { ascending: false }).limit(limit);
  const term = query.trim().replace(/[%_]/g, (m) => `\\${m}`);
  if (term) q = q.or(`name.ilike.%${term}%,city.ilike.%${term}%,category.ilike.%${term}%,description.ilike.%${term}%`);
  if (companyType) q = q.eq("company_type", companyType);
  if (country) q = q.eq("country", country);
  if (city) q = q.ilike("city", `%${city}%`);
  const { data, error } = await q; if (error) throw error; return data || [];
}

export async function fetchCompanyById(id) {
  const { data, error } = await supabase.from("companies").select("*").eq("id", id).single();
  if (error) throw error; return data;
}
export async function fetchMyCompany(userId) {
  const { data, error } = await supabase.from("companies").select("*").eq("owner_id", userId).order("created_at", { ascending:false }).limit(1).maybeSingle();
  if (error) throw error; return data;
}
export async function createCompany(payload) {
  const { data, error } = await supabase.from("companies").insert(payload).select().single();
  if (error) throw error; return data;
}
export async function updateCompany(id, updates) {
  const { data, error } = await supabase.from("companies").update({ ...updates, updated_at:new Date().toISOString() }).eq("id",id).select().single();
  if (error) throw error; return data;
}
export async function fetchCompanyPrograms(id) {
  const { data, error } = await supabase.from("company_programs").select("*").eq("company_id",id).eq("is_active",true).order("sort_order").order("start_time");
  if (error) throw error; return data || [];
}
export async function fetchCompanyTariffs(id) {
  const { data, error } = await supabase.from("company_tariffs").select("*").eq("company_id",id).eq("is_active",true).order("created_at",{ascending:false});
  if (error) throw error; return data || [];
}
export async function fetchCompanyInfos(id) {
  const { data, error } = await supabase.from("company_infos").select("*").eq("company_id",id).eq("is_public",true).order("sort_order");
  if (error) throw error; return data || [];
}
