import { Capacitor } from "@capacitor/core";

const PROD_URL_MAIN = "https://baaro-xi.vercel.app";

const isNative = Capacitor.isNativePlatform();

// Web : utilise /api du domaine baaro-xi.
// Natif : utilise explicitement l'API baaro-xi.
export const API_BASE =
  import.meta.env.VITE_API_BASE_URL ||
  (isNative ? PROD_URL_MAIN : "");

// Compatibilité : baaro-xi reste également l'endpoint principal.
export const API_BASE_XI =
  import.meta.env.VITE_API_SECONDARY_URL ||
  PROD_URL_MAIN;

export const getApiBase = () => API_BASE;
