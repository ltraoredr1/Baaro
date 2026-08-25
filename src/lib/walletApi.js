import { supabase } from "../supabaseClient.js";
import { API_BASE } from "../config.js";

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
  return { ok: true, ...json };
}

export const walletStatus = () => walletRequest({ action: "status" });
export const walletEarn = (actionKey, detail = "", referenceId = null) =>
  walletRequest({ action: "earn", actionKey, detail, referenceId });
export const walletRedeem = (optionId) =>
  walletRequest({ action: "redeem", optionId });
export const walletConvert = (pts) =>
  walletRequest({ action: "convert", pts });

export async function earnPoints(actionKey, detail = "", referenceId = null) {
  return walletEarn(actionKey, detail, referenceId);
}
