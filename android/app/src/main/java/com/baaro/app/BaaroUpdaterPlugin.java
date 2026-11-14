package com.baaro.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Locale;

@CapacitorPlugin(name = "BaaroUpdater")
public class BaaroUpdaterPlugin extends Plugin {
    private static final String REPOSITORY = "ltraoredr1/Baaro";
    private static final long MAX_APK_BYTES = 300L * 1024L * 1024L;
    private static final int CONNECT_TIMEOUT_MS = 20_000;
    private static final int READ_TIMEOUT_MS = 45_000;
    private static final int BUFFER_BYTES = 32 * 1024;
    private static final int MAX_REDIRECTS = 5;

    @PluginMethod
    public void canInstallPackages(PluginCall call) {
        boolean allowed = Build.VERSION.SDK_INT < 26
            || getContext().getPackageManager().canRequestPackageInstalls();

        JSObject result = new JSObject();
        result.put("allowed", allowed);
        call.resolve(result);
    }

    @PluginMethod
    public void openInstallPermissionSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 26) {
            Intent intent = new Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:" + getContext().getPackageName())
            );
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
        }
        call.resolve();
    }

    /**
     * Télécharge l’APK directement en flux dans le cache privé Android.
     * Aucune charge APK n'est renvoyée à JavaScript : ni ArrayBuffer ni Base64.
     */
    @PluginMethod
    public void downloadApk(PluginCall call) {
        String version = call.getString("version");
        String expectedSha256 = call.getString("sha256");

        if (version == null || !version.matches("\\d+\\.\\d+\\.\\d+")) {
            call.reject("Version APK invalide.");
            return;
        }
        if (expectedSha256 == null || !expectedSha256.matches("(?i)[a-f0-9]{64}")) {
            call.reject("Empreinte SHA-256 invalide.");
            return;
        }

        Thread downloadThread = new Thread(() -> {
            try {
                String relativePath = streamVerifiedApk(version, expectedSha256);
                JSObject result = new JSObject();
                result.put("path", relativePath);
                call.resolve(result);
            } catch (Exception error) {
                call.reject(
                    error.getMessage() == null
                        ? "Téléchargement natif de l’APK impossible."
                        : error.getMessage(),
                    error
                );
            }
        }, "baaro-apk-download");
        downloadThread.start();
    }

    private String streamVerifiedApk(String version, String expectedSha256) throws Exception {
        String relativePath = "updates/baaro-v" + version + ".apk";
        File updateRoot = new File(getContext().getCacheDir(), "updates").getCanonicalFile();
        if (!updateRoot.exists() && !updateRoot.mkdirs()) {
            throw new IOException("Création du cache de mise à jour impossible.");
        }

        File root = updateRoot.getCanonicalFile();
        File apk = new File(root, "baaro-v" + version + ".apk").getCanonicalFile();
        File partial = new File(root, "baaro-v" + version + ".apk.part").getCanonicalFile();
        String rootPrefix = root.getPath() + File.separator;
        if (!apk.getPath().startsWith(rootPrefix) || !partial.getPath().startsWith(rootPrefix)) {
            throw new IOException("Chemin de mise à jour invalide.");
        }
        if (partial.exists() && !partial.delete()) {
            throw new IOException("Nettoyage du téléchargement précédent impossible.");
        }

        URL currentUrl = new URL(
            "https://github.com/" + REPOSITORY + "/releases/download/v" + version
                + "/baaro-v" + version + ".apk"
        );
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        boolean saved = false;

        try {
            HttpURLConnection connection = null;
            int redirects = 0;
            while (true) {
                if (!"https".equalsIgnoreCase(currentUrl.getProtocol())) {
                    throw new IOException("Redirection non HTTPS refusée.");
                }
                if (redirects == 0 && !isExpectedReleaseUrl(currentUrl, version)) {
                    throw new IOException("Adresse de téléchargement APK non autorisée.");
                }
                if (redirects > 0 && !isTrustedGitHubHost(currentUrl.getHost())) {
                    throw new IOException("Hôte de redirection APK non autorisé.");
                }

                connection = (HttpURLConnection) currentUrl.openConnection();
                connection.setInstanceFollowRedirects(false);
                connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
                connection.setReadTimeout(READ_TIMEOUT_MS);
                connection.setRequestProperty("Accept", "application/vnd.android.package-archive");
                connection.setRequestProperty("User-Agent", "BAARO-Android-Updater");
                int status = connection.getResponseCode();

                if (status == HttpURLConnection.HTTP_MOVED_PERM
                    || status == HttpURLConnection.HTTP_MOVED_TEMP
                    || status == HttpURLConnection.HTTP_SEE_OTHER
                    || status == 307
                    || status == 308) {
                    String location = connection.getHeaderField("Location");
                    connection.disconnect();
                    if (location == null || ++redirects > MAX_REDIRECTS) {
                        throw new IOException("Redirection APK invalide ou trop longue.");
                    }
                    currentUrl = new URL(currentUrl, location);
                    continue;
                }
                if (status != HttpURLConnection.HTTP_OK) {
                    connection.disconnect();
                    throw new IOException("Le serveur a refusé le téléchargement APK (HTTP " + status + ").");
                }
                break;
            }

            long declaredLength = connection.getContentLengthLong();
            if (declaredLength > MAX_APK_BYTES) {
                connection.disconnect();
                throw new IOException("APK trop volumineux; téléchargement annulé.");
            }

            long received = 0;
            byte[] buffer = new byte[BUFFER_BYTES];
            try (InputStream input = new BufferedInputStream(connection.getInputStream());
                 FileOutputStream output = new FileOutputStream(partial, false)) {
                int count;
                while ((count = input.read(buffer)) != -1) {
                    received += count;
                    if (received > MAX_APK_BYTES) {
                        throw new IOException("APK trop volumineux; téléchargement annulé.");
                    }
                    digest.update(buffer, 0, count);
                    output.write(buffer, 0, count);
                }
                output.getFD().sync();
            } finally {
                connection.disconnect();
            }

            if (received <= 0) {
                throw new IOException("Le fichier APK téléchargé est vide.");
            }
            if (declaredLength >= 0 && received != declaredLength) {
                throw new IOException("Téléchargement APK incomplet.");
            }

            byte[] actualHash = digest.digest();
            byte[] expectedHash = hexToBytes(expectedSha256);
            if (!MessageDigest.isEqual(actualHash, expectedHash)) {
                throw new IOException("SHA-256 incorrect : APK rejeté.");
            }

            if (apk.exists() && !apk.delete()) {
                throw new IOException("Remplacement de l’ancien APK impossible.");
            }
            if (!partial.renameTo(apk)) {
                throw new IOException("Finalisation du fichier APK impossible.");
            }
            saved = true;
            return relativePath;
        } finally {
            if (!saved && partial.exists()) {
                // Le fichier incomplet ou dont l'empreinte est incorrecte ne sera jamais installable.
                //noinspection ResultOfMethodCallIgnored
                partial.delete();
            }
        }
    }

    private boolean isExpectedReleaseUrl(URL url, String version) {
        String expectedPath = "/" + REPOSITORY + "/releases/download/v" + version
            + "/baaro-v" + version + ".apk";
        return "https".equalsIgnoreCase(url.getProtocol())
            && "github.com".equalsIgnoreCase(url.getHost())
            && expectedPath.equals(url.getPath());
    }

    private boolean isTrustedGitHubHost(String host) {
        if (host == null) return false;
        String normalized = host.toLowerCase(Locale.ROOT);
        return "github.com".equals(normalized)
            || normalized.endsWith(".githubusercontent.com");
    }

    private byte[] hexToBytes(String hex) {
        byte[] bytes = new byte[hex.length() / 2];
        for (int i = 0; i < bytes.length; i++) {
            int high = Character.digit(hex.charAt(i * 2), 16);
            int low = Character.digit(hex.charAt(i * 2 + 1), 16);
            if (high < 0 || low < 0) throw new IllegalArgumentException("Empreinte SHA-256 invalide.");
            bytes[i] = (byte) ((high << 4) + low);
        }
        return bytes;
    }

    @PluginMethod
    public void installApk(PluginCall call) {
        String relativePath = call.getString("path");

        if (relativePath == null || relativePath.trim().isEmpty()) {
            call.reject("Chemin APK manquant.");
            return;
        }

        try {
            File updateRoot = new File(
                getContext().getCacheDir(),
                "updates"
            ).getCanonicalFile();

            File apk = new File(
                getContext().getCacheDir(),
                relativePath
            ).getCanonicalFile();

            String root = updateRoot.getPath() + File.separator;

            if (!apk.getPath().startsWith(root) || !apk.isFile()) {
                call.reject("Fichier APK invalide.");
                return;
            }
            if (Build.VERSION.SDK_INT >= 26
                && !getContext().getPackageManager().canRequestPackageInstalls()) {
                call.reject("Autorisation Android d’installation manquante.");
                return;
            }

            Uri apkUri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                apk
            );

            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(
                apkUri,
                "application/vnd.android.package-archive"
            );
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

            getContext().startActivity(intent);
            call.resolve();

        } catch (Exception error) {
            call.reject("Impossible d'ouvrir l'installateur Android.", error);
        }
    }
}
