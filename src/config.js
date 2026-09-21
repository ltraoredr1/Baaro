import { Capacitor } from "@capacitor/core";

// 2 domaines Vercel de BAARO
const PROD_URL_MAIN = "https://baaro-three.vercel.app";
const PROD_URL_XI = "https://baaro-xi.vercel.app";

const isNative = Capacitor.isNativePlatform();

// URL principale : baaro-three
// Web = "" pour utiliser /api/chat en relatif (Vercel)
// APK = URL absolue obligatoire
export const API_BASE = 
  import.meta.env.VITE_API_BASE_URL || 
  (isNative ? PROD_URL_MAIN : "");

// URL secondaire : baaro-xi
export const API_BASE_XI = 
  import.meta.env.VITE_API_SECONDARY_URL || 
  (isNative ? PROD_URL_XI : PROD_URL_XI);

// Helper si tu veux switcher facilement
export const getApiBase = (useXi = false) => useXi ? API_BASE_XI : API_BASE;
