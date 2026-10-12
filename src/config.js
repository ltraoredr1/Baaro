import { Capacitor } from "@capacitor/core";

const PROD_URL_MAIN = "https://baaro-xi.vercel.app";
const isNative = Capacitor.isNativePlatform();

console.log("[BAARO CONFIG] isNative:", isNative, "platform:", Capacitor.getPlatform());

export const API_BASE =
  import.meta.env.VITE_API_BASE_URL ||
  (isNative ? PROD_URL_MAIN : "");

export const getApiBase = () => {
  console.log("[BAARO CONFIG] API_BASE:", API_BASE);
  return API_BASE;
};
