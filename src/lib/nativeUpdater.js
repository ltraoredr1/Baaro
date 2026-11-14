import { Capacitor, registerPlugin } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Filesystem, Directory } from "@capacitor/filesystem";

const REPOSITORY = "ltraoredr1/Baaro";
const RELEASE_API =
  "https://api.github.com/repos/" + REPOSITORY + "/releases/latest";

const BaaroUpdater = registerPlugin("BaaroUpdater");
const MAX_APK_BYTES = 300 * 1024 * 1024;

function compareVersions(a, b) {
  const parse = (v) => {
    if (typeof v !== "string" || !/^\d+\.\d+\.\d+$/.test(v)) {
      throw new Error("Version invalide.");
    }
    return v.split(".").map(Number);
  };

  const left = parse(a);
  const right = parse(b);

  for (let i = 0; i < 3; i++) {
    if (left[i] > right[i]) return 1;
    if (left[i] < right[i]) return -1;
  }
  return 0;
}

function toBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(i, Math.min(i + chunkSize, bytes.length))
    );
  }

  return btoa(binary);
}

async function sha256(bytes) {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Vérification cryptographique indisponible.");
  }

  const digest = await crypto.subtle.digest("SHA-256", bytes);

  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function getLatestManifest() {
  const response = await fetch(RELEASE_API, {
    cache: "no-store",
    headers: { Accept: "application/vnd.github+json" }
  });

  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Impossible de consulter la Release BAARO.");

  const release = await response.json();

  if (release.draft || release.prerelease) return null;

  const asset = release.assets?.find(
    (item) => item.name === "manifest.json"
  );

  if (!asset?.browser_download_url) {
    throw new Error("Manifeste officiel absent de la Release.");
  }

  const manifestResponse = await fetch(asset.browser_download_url, {
    cache: "no-store"
  });

  if (!manifestResponse.ok) {
    throw new Error("Téléchargement du manifeste impossible.");
  }

  const manifest = await manifestResponse.json();

  if (
    !manifest.version ||
    !manifest.apkUrl ||
    !/^[a-f0-9]{64}$/i.test(manifest.sha256 || "") ||
    manifest.appId !== "com.baaro.app" ||
    release.tag_name !== "v" + manifest.version
  ) {
    throw new Error("Manifeste de mise à jour invalide.");
  }

  const apkUrl = new URL(manifest.apkUrl);
  const expectedPath =
    "/" + REPOSITORY + "/releases/download/v" +
    manifest.version + "/baaro-v" + manifest.version + ".apk";

  if (
    apkUrl.protocol !== "https:" ||
    apkUrl.hostname !== "github.com" ||
    apkUrl.pathname !== expectedPath
  ) {
    throw new Error("Adresse APK non autorisée.");
  }

  return manifest;
}

export async function checkUpdateNative() {
  if (!Capacitor.isNativePlatform()) {
    return { updated: false, platform: "web" };
  }

  if (Capacitor.getPlatform() !== "android") {
    return { updated: false, platform: Capacitor.getPlatform() };
  }

  try {
    const installed = await App.getInfo();
    const manifest = await getLatestManifest();

    if (!manifest) return { updated: false, reason: "no-release" };

    if (compareVersions(manifest.version, installed.version) <= 0) {
      return { updated: false, reason: "already-current" };
    }

    const permission = await BaaroUpdater.canInstallPackages();

    if (!permission?.allowed) {
      await BaaroUpdater.openInstallPermissionSettings();
      return {
        updated: false,
        permissionRequired: true,
        version: manifest.version
      };
    }

    const accepted = window.confirm(
      "Une nouvelle version de BAARO est disponible : " +
      manifest.version +
      ". Voulez-vous la télécharger et lancer l'installation Android ?"
    );

    if (!accepted) {
      return { updated: false, available: true, version: manifest.version };
    }

    const response = await fetch(manifest.apkUrl, { cache: "no-store" });

    if (!response.ok) throw new Error("Téléchargement de l'APK impossible.");

    const bytes = new Uint8Array(await response.arrayBuffer());

    if (!bytes.length || bytes.length > MAX_APK_BYTES) {
      throw new Error("Taille APK invalide.");
    }

    const actualHash = await sha256(bytes);

    if (actualHash.toLowerCase() !== manifest.sha256.toLowerCase()) {
      throw new Error("SHA-256 incorrect : APK rejeté.");
    }

    const relativePath =
      "updates/baaro-v" + manifest.version + ".apk";

    await Filesystem.writeFile({
      path: relativePath,
      data: toBase64(bytes),
      directory: Directory.Cache,
      recursive: true
    });

    await BaaroUpdater.installApk({ path: relativePath });

    return {
      updated: false,
      installerLaunched: true,
      version: manifest.version
    };

  } catch (error) {
    console.error("[BAARO Updater Maison]", error);

    return {
      updated: false,
      error: error?.message || "Erreur updater inconnue"
    };
  }
}
