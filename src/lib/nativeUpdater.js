import { Capacitor, registerPlugin } from "@capacitor/core";
import { App } from "@capacitor/app";

const REPOSITORY = "ltraoredr1/Baaro";
const RELEASE_API =
  "https://api.github.com/repos/" + REPOSITORY + "/releases/latest";

const BaaroUpdater = registerPlugin("BaaroUpdater");

const PENDING_UPDATE_KEY = "baaro.pending.native.update.v1";
let resumeListenerPromise = null;

function readPendingUpdate() {
  try {
    const value = localStorage.getItem(PENDING_UPDATE_KEY);
    if (!value) return null;
    const parsed = JSON.parse(value);
    if (
      typeof parsed.version !== "string" ||
      !/^\d+\.\d+\.\d+$/.test(parsed.version)
    ) return null;
    return parsed;
  } catch {
    return null;
  }
}

function savePendingUpdate(version) {
  try {
    localStorage.setItem(
      PENDING_UPDATE_KEY,
      JSON.stringify({ version, createdAt: Date.now() })
    );
  } catch {
    throw new Error("Impossible de mémoriser la mise à jour en attente.");
  }
}

function clearPendingUpdate() {
  try {
    localStorage.removeItem(PENDING_UPDATE_KEY);
  } catch {
    console.warn("[BAARO Updater] Nettoyage du statut en attente impossible.");
  }
}

function emitUpdateResult(detail) {
  try {
    window.dispatchEvent(
      new CustomEvent("baaro:native-update-result", { detail })
    );
  } catch (error) {
    console.warn("[BAARO Updater] Événement de résultat indisponible.", error);
  }
}

async function verifyPendingNativeInstall() {
  const pending = readPendingUpdate();
  if (!pending) return null;

  // Une entrée trop ancienne ne doit jamais bloquer les mises à jour.
  if (
    !Number.isFinite(pending.createdAt) ||
    Date.now() - pending.createdAt > 24 * 60 * 60 * 1000
  ) {
    clearPendingUpdate();
    emitUpdateResult({
      status: "expired",
      version: pending.version
    });
    return { updated: false, reason: "pending-expired" };
  }

  try {
    const installed = await App.getInfo();

    if (compareVersions(installed.version, pending.version) >= 0) {
      clearPendingUpdate();

      const result = {
        status: "installed",
        version: installed.version,
        expectedVersion: pending.version
      };

      emitUpdateResult(result);
      console.info("[BAARO Updater] Installation confirmée :", installed.version);

      return {
        updated: true,
        version: installed.version,
        reason: "installation-confirmed"
      };
    }

    // Le processus d'installation a été quitté sans installer la version.
    clearPendingUpdate();

    const result = {
      status: "cancelled",
      installedVersion: installed.version,
      expectedVersion: pending.version
    };

    emitUpdateResult(result);
    console.warn("[BAARO Updater] Installation non confirmée :", result);

    return {
      updated: false,
      reason: "installation-not-confirmed",
      version: pending.version
    };
  } catch (error) {
    console.warn("[BAARO Updater] Vérification après installation impossible.", error);
    return null;
  }
}

async function ensureNativeResumeListener() {
  if (!resumeListenerPromise) {
    resumeListenerPromise = App.addListener(
      "appStateChange",
      ({ isActive }) => {
        if (isActive) {
          void verifyPendingNativeInstall();
        }
      }
    ).catch((error) => {
      resumeListenerPromise = null;
      console.warn("[BAARO Updater] Listener de reprise indisponible.", error);
    });
  }

  await resumeListenerPromise;
}


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
    typeof manifest.version !== "string" ||
    !/^\d+\.\d+\.\d+$/.test(manifest.version) ||
    typeof manifest.apkUrl !== "string" ||
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
    await ensureNativeResumeListener();

    const pendingResult = await verifyPendingNativeInstall();
    if (pendingResult) return pendingResult;

    const installed = await App.getInfo();
    const manifest = await getLatestManifest();

    if (!manifest) return { updated: false, reason: "no-release" };

    if (compareVersions(manifest.version, installed.version) <= 0) {
      return { updated: false, reason: "already-current" };
    }

    const accepted = window.confirm(
      "Une nouvelle version de BAARO est disponible : " +
      manifest.version +
      ". Voulez-vous la télécharger et lancer l'installation Android ?"
    );

    if (!accepted) {
      return { updated: false, available: true, version: manifest.version };
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

    const download = await BaaroUpdater.downloadApk({
      version: manifest.version,
      sha256: manifest.sha256
    });

    if (!download?.path) {
      throw new Error("Le téléchargement natif n’a pas fourni de fichier APK.");
    }

    // Enregistrer la version AVANT de quitter BAARO vers l'installateur.
    savePendingUpdate(manifest.version);

    try {
      await BaaroUpdater.installApk({ path: download.path });
    } catch (installError) {
      clearPendingUpdate();
      throw installError;
    }

    return {
      updated: false,
      installerLaunched: true,
      version: manifest.version,
      verificationPending: true
    };

  } catch (error) {
    console.error("[BAARO Updater Maison]", error);

    return {
      updated: false,
      error: error?.message || "Erreur updater inconnue"
    };
  }
}
