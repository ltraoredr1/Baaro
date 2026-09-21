import { Capacitor } from "@capacitor/core";

// En web (Vercel) : chaîne vide = "/api/chat" suffit
// En natif (APK) : il faut une URL absolue vers ton backend
const PROD_URL = "https://baaro-three.vercel.app"; // ton domaine Vercel

export const API_BASE = 
  import.meta.env.VITE_API_BASE_URL || 
  (Capacitor.isNativePlatform() ? PROD_URL : "");
