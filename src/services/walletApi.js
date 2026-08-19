import { API_BASE } from "../config.js";
import { supabase } from "./supabase.js";

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function walletRequest(body) {
  const res = await fetch(`${API_BASE}/api/wallet`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: json.error || res.statusText, status: res.status };
  }
  return json;
}

export const walletStatus = () => walletRequest({ action: "status" });
export const walletEarn = (actionKey, detail) =>
  walletRequest({ action: "earn", actionKey, detail });
export const walletRedeem = (optionId) =>
  walletRequest({ action: "redeem", optionId });
export const walletConvert = (pts) =>
  walletRequest({ action: "convert", pts });
