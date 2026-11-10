import { Capacitor } from "@capacitor/core";
// Filesystem importé en dynamique plus bas (ne pas mettre en haut, sinon Vercel plante)
import JSZip from "jszip";

const UPDATE_URL = "https://baaro-xi.vercel.app/updates/manifest.json";
const UPDATE_DIR = "baaro-update";

export async function checkUpdateNative() {
  if (!Capacitor.isNativePlatform()) return { updated: false };

  try {
    const localVersion = localStorage.getItem("baaro_native_version") || "1.0.0";

    const res = await fetch(UPDATE_URL, { cache: "no-store" });
    if (!res.ok) return { updated: false };
    const remote = await res.json();

    if (!remote.version || remote.version === localVersion) {
      console.log(`[Baaro] Déjà à jour : ${localVersion}`);
      return { updated: false };
    }

    console.log(`[Baaro] Mise à jour native : ${localVersion} -> ${remote.version}`);

    // 1. Télécharge le zip
    const zipRes = await fetch(remote.url, { cache: "no-store" });
    if (!zipRes.ok) throw new Error("Téléchargement zip échoué");
    const blob = await zipRes.blob();

    // 2. Vérifie le SHA256 si tu veux (optionnel, mais recommandé)
    // On saute la vérif ici pour la V1, on la rajoutera après

    // 3. Dézippe en JS et écrit dans le dossier de l'app
    const zip = await JSZip.loadAsync(blob);
    const entries = Object.keys(zip.files);

    for (const path of entries) {
      const file = zip.files[path];
      if (file.dir) continue;
      const content = await file.async("blob");
      const arrayBuffer = await content.arrayBuffer();
      const base64 = await blobToBase64(new Blob([arrayBuffer]));

      // On crée les dossiers si besoin
      const parts = path.split("/");
      if (parts.length > 1) {
        try {
          await Filesystem.mkdir({
            path: `${UPDATE_DIR}/${parts.slice(0, -1).join("/")}`,
            directory: Directory.Data,
            recursive: true,
          });
        } catch {}
      }

      await Filesystem.writeFile({
        path: `${UPDATE_DIR}/${path}`,
        data: base64,
        directory: Directory.Data,
        recursive: true,
      });
    }

    // 4. Sauvegarde la version et recharge sur le nouveau index.html
    localStorage.setItem("baaro_native_version", remote.version);
    localStorage.setItem("baaro_update_pending", JSON.stringify(remote));

    // 5. On prévient l'utilisateur et on recharge
    window.dispatchEvent(new CustomEvent("baaro:update-available", { detail: remote }));
    console.log(`[Baaro] Update ${remote.version} installé, rechargement...`);

    // On recharge sur le nouveau bundle
    const uri = await Filesystem.getUri({ path: `${UPDATE_DIR}/index.html`, directory: Directory.Data });
    window.location.href = Capacitor.convertFileSrc(uri.uri);

    return { updated: true, version: remote.version };
  } catch (e) {
    console.warn("[Baaro] checkUpdateNative", e);
    return { updated: false, error: e };
  }
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
