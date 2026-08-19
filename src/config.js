// En mode web (Vercel), l'API est servie sur le même domaine : chaîne vide,
// donc "/api/chat" suffit.
// En mode natif (Capacitor/iOS/Android), l'app n'a pas de backend local :
// il faut pointer vers votre site déployé, via VITE_API_BASE_URL.
export const API_BASE = import.meta.env.VITE_API_BASE_URL || "";
