/**
 * Mode Zéro Data — repli SMS (Android uniquement, activé par l'utilisateur).
 *
 * Sans data, le message part en SMS classique depuis l'interface BAARO.
 * Limites assumées :
 *  - Un SMS n'est PAS chiffré de bout en bout (le réseau mobile le voit) : c'est pourquoi
 *    le réglage est désactivé par défaut et explicite.
 *  - Il faut connaître le numéro du destinataire (cache local CHIFFRÉ, rempli quand l'app a du réseau).
 *  - Envoi uniquement : l'app ne lit jamais les SMS de l'utilisateur.
 */
import { Capacitor, registerPlugin } from "@capacitor/core";
import { getSetting } from "./appSettings.js";
import { getSecureItem, setSecureItem } from "./messageOutbox.js";

const NUMBERS_KEY = "baaro_sms_numbers_v2";
const LEGACY_NUMBERS_KEY = "baaro_sms_numbers_v1"; // ancien format en clair, migré puis supprimé
const SMS_PREFIX = "BAARO: ";
const MAX_CHARS = 450; // 3 segments SMS max : on ne vide pas le forfait de l'utilisateur

const BaaroSms = registerPlugin("BaaroSms");

export function isSmsFallbackEnabled() {
  try {
    return getSetting("sms_fallback") === true;
  } catch {
    return false;
  }
}

export function isSmsSupported() {
  try {
    return Capacitor.getPlatform() === "android" && Capacitor.isPluginAvailable("BaaroSms");
  } catch {
    return false;
  }
}

let numbersPromise = null;

function readNumbers() {
  if (!numbersPromise) {
    numbersPromise = (async () => {
      let map = {};
      try {
        const raw = await getSecureItem(NUMBERS_KEY);
        if (raw) map = JSON.parse(raw) || {};
      } catch {
        map = {};
      }
      // Migration : l'ancien clair est supprimé, puis re-sauvegardé chiffré
      try {
        const legacy = localStorage.getItem(LEGACY_NUMBERS_KEY);
        if (legacy) {
          map = { ...(JSON.parse(legacy) || {}), ...map };
          localStorage.removeItem(LEGACY_NUMBERS_KEY);
          await setSecureItem(NUMBERS_KEY, JSON.stringify(map));
        }
      } catch {
        /* ignore */
      }
      return map;
    })();
  }
  return numbersPromise;
}

export async function rememberSmsNumber(userId, phone) {
  const clean = String(phone || "").replace(/[\s\-().]/g, "");
  if (!userId || !/^\+?[1-9]\d{6,14}$/.test(clean)) return;
  const map = await readNumbers();
  map[userId] = clean;
  await setSecureItem(NUMBERS_KEY, JSON.stringify(map));
}

export async function getSmsNumber(userId) {
  return (await readNumbers())[userId] || null;
}

/** À appeler à la déconnexion, avec wipeSecureStorage(). */
export function clearSmsNumbers() {
  numbersPromise = null;
  try {
    localStorage.removeItem(NUMBERS_KEY);
    localStorage.removeItem(LEGACY_NUMBERS_KEY);
  } catch {
    /* ignore */
  }
}

/** Quand le réseau est là : mémorise le numéro du contact (si son profil l'expose) pour plus tard. */
export async function cacheSmsNumberFromProfile(supabase, userId) {
  if (!userId || (await getSmsNumber(userId))) return;
  try {
    const { data } = await supabase.from("profiles").select("phone").eq("id", userId).maybeSingle();
    if (data?.phone) await rememberSmsNumber(userId, data.phone);
  } catch {
    /* la colonne peut ne pas exister ou ne pas être lisible : sans importance */
  }
}

/** Demande la permission SEND_SMS (à appeler quand l'utilisateur active le réglage). */
export async function requestSmsPermission() {
  if (!isSmsSupported()) return false;
  try {
    const res = await BaaroSms.requestSmsPermission();
    return !!res?.granted;
  } catch {
    return false;
  }
}

/**
 * Tente d'envoyer le texte par SMS. Ne lève jamais : renvoie { ok, reason? }.
 */
export async function sendSmsFallback(toUserId, text) {
  if (!isSmsFallbackEnabled()) return { ok: false, reason: "disabled" };
  if (!isSmsSupported()) return { ok: false, reason: "unsupported" };
  const to = await getSmsNumber(toUserId);
  if (!to) return { ok: false, reason: "no_number" };
  try {
    const status = await BaaroSms.isAvailable();
    if (!status?.available) return { ok: false, reason: "unsupported" };
    if (!status.granted) return { ok: false, reason: "no_permission" };
    const body = (SMS_PREFIX + String(text || "")).slice(0, MAX_CHARS);
    await BaaroSms.send({ to, body });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e?.message || "failed" };
  }
}
