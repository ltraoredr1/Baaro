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
import java.util.concurrent.atomic.AtomicBoolean;
import android.os.StatFs;

@CapacitorPlugin(name = "BaaroUpdater")
public class BaaroUpdaterPlugin extends Plugin {
    private static final String REPOSITORY = "ltraoredr1/Baaro";
    private static final long MAX_APK_BYTES = 300L * 1024L * 1024L;
    private static final int CONNECT_TIMEOUT_MS = 20_000;
    private static final int READ_TIMEOUT_MS = 45_000;
    private static final int BUFFER_BYTES = 32 * 1024;
    private static final int MAX_REDIRECTS = 5;
    private static final AtomicBoolean DOWNLOAD_IN_PROGRESS = new AtomicBoolean(false);

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
        if (!DOWNLOAD_IN_PROGRESS.compareAndSet(false, true)) {
            call.reject("Un téléchargement APK est déjà en cours.");
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
            } finally {
                DOWNLOAD_IN_PROGRESS.set(false);
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
        File backup = new File(root, "baaro-v" + version + ".apk.bak").getCanonicalFile();
        String rootPrefix = root.getPath() + File.separator;

        if (!apk.getPath().startsWith(rootPrefix)
            || !partial.getPath().startsWith(rootPrefix)
            || !backup.getPath().startsWith(rootPrefix)) {
            throw new IOException("Chemin de mise à jour invalide.");
        }

        // Récupérer une sauvegarde laissée par un arrêt brutal du processus.
        if (backup.exists()) {
            if (apk.exists()) {
                if (!backup.delete()) {
                    throw new IOException("Nettoyage de la sauvegarde APK impossible.");
                }
            } else if (!backup.renameTo(apk)) {
                throw new IOException("Restauration de la sauvegarde APK impossible.");
            }
        }

        long offset = partial.isFile() ? partial.length() : 0L;
        if (offset > MAX_APK_BYTES) {
            if (!partial.delete()) throw new IOException("Nettoyage du téléchargement invalide impossible.");
            offset = 0L;
        }

        URL currentUrl = new URL(
            "https://github.com/" + REPOSITORY + "/releases/download/v" + version
                + "/baaro-v" + version + ".apk"
        );

        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        if (offset > 0) {
            try (InputStream existing = new BufferedInputStream(new java.io.FileInputStream(partial))) {
                byte[] prefixBuffer = new byte[BUFFER_BYTES];
                int n;
                while ((n = existing.read(prefixBuffer)) != -1) digest.update(prefixBuffer, 0, n);
            }
        }

        boolean saved = false;
        boolean keepPartialOnFailure = true;
        boolean rangeRestarted = false;

        try {
            HttpURLConnection connection;
            int redirects = 0;

            while (true) {
                if (!"https".equalsIgnoreCase(currentUrl.getProtocol())) {
                    throw new IOException("Redirection non HTTPS refusée.");
                }
                if (redirects == 0 && !isExpectedReleaseUrl(currentUrl, version)) {
                    throw new IOException("Adresse de téléchargement APK non autorisée.");
                }
                if (redirects > 0 && !isTrustedGitHubHost(currentUrl)) {
                    throw new IOException("Hôte de redirection APK non autorisé.");
                }

                connection = (HttpURLConnection) currentUrl.openConnection();
                connection.setInstanceFollowRedirects(false);
                connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
                connection.setReadTimeout(READ_TIMEOUT_MS);
                connection.setRequestProperty("Accept", "application/vnd.android.package-archive");
                connection.setRequestProperty("User-Agent", "BAARO-Android-Updater");
                if (offset > 0) connection.setRequestProperty("Range", "bytes=" + offset + "-");

                int status = connection.getResponseCode();

                if (status == HttpURLConnection.HTTP_MOVED_PERM
                    || status == HttpURLConnection.HTTP_MOVED_TEMP
                    || status == HttpURLConnection.HTTP_SEE_OTHER
                    || status == 307 || status == 308) {
                    String location = connection.getHeaderField("Location");
                    connection.disconnect();
                    if (location == null || ++redirects > MAX_REDIRECTS) {
                        throw new IOException("Redirection APK invalide ou trop longue.");
                    }
                    currentUrl = new URL(currentUrl, location);
                    continue;
                }

                if (status == 416) {
                    connection.disconnect();

                    if (offset > 0 && !rangeRestarted) {
                        if (partial.exists() && !partial.delete()) {
                            throw new IOException("Impossible de réinitialiser le téléchargement APK.");
                        }

                        offset = 0L;
                        digest = MessageDigest.getInstance("SHA-256");
                        rangeRestarted = true;
                        redirects = 0;
                        currentUrl = new URL(
                            "https://github.com/" + REPOSITORY
                                + "/releases/download/v" + version
                                + "/baaro-v" + version + ".apk"
                        );
                        continue;
                    }

                    throw new IOException("Reprise APK refusée même après redémarrage.");
                }

                if (status == HttpURLConnection.HTTP_OK && offset > 0) {
                    // Le serveur ignore Range : on recommence proprement depuis zéro.
                    offset = 0;
                    digest = MessageDigest.getInstance("SHA-256");
                } else if (status == 206 && offset > 0) {
                    String range = connection.getHeaderField("Content-Range");
                    java.util.regex.Matcher matcher = java.util.regex.Pattern
                        .compile("bytes (\\d+)-(\\d+)/(\\d+|\\*)")
                        .matcher(range == null ? "" : range);

                    boolean validRange = false;
                    if (matcher.matches()) {
                        long rangeStart = Long.parseLong(matcher.group(1));
                        long rangeEnd = Long.parseLong(matcher.group(2));
                        String rangeTotal = matcher.group(3);

                        validRange = rangeStart == offset
                            && rangeEnd >= rangeStart
                            && ("*".equals(rangeTotal)
                                || rangeEnd < Long.parseLong(rangeTotal));

                        long responseLength = connection.getContentLengthLong();
                        if (responseLength >= 0
                            && responseLength != rangeEnd - rangeStart + 1L) {
                            validRange = false;
                        }
                    }

                    if (!validRange) {
                        keepPartialOnFailure = false;
                        connection.disconnect();
                        throw new IOException("Réponse Content-Range invalide.");
                    }
                } else if (status != HttpURLConnection.HTTP_OK) {
                    connection.disconnect();
                    throw new IOException("Le serveur a refusé le téléchargement APK (HTTP " + status + ").");
                }
                break;
            }

            long declaredLength = connection.getContentLengthLong();
            long totalLength = -1L;
            String contentRange = connection.getHeaderField("Content-Range");
            if (contentRange != null) {
                java.util.regex.Matcher matcher = java.util.regex.Pattern
                    .compile("bytes (\\d+)-(\\d+)/(\\d+|\\*)")
                    .matcher(contentRange);
                if (matcher.matches() && !"*".equals(matcher.group(3))) {
                    totalLength = Long.parseLong(matcher.group(3));
                }
            } else if (declaredLength >= 0) {
                totalLength = offset + declaredLength;
            }

            if (totalLength > MAX_APK_BYTES) {
                connection.disconnect();
                keepPartialOnFailure = false;
                throw new IOException("APK trop volumineux; téléchargement annulé.");
            }

            StatFs stat = new StatFs(getContext().getCacheDir().getAbsolutePath());
            long available = stat.getAvailableBytes();
            long needed = (totalLength >= 0 ? totalLength - offset : 0L) + 20L * 1024L * 1024L;
            if (available < needed) {
                connection.disconnect();
                throw new IOException("Espace disque insuffisant pour télécharger l’APK.");
            }

            long receivedThisRequest = 0L;
            long receivedTotal = offset;
            byte[] buffer = new byte[BUFFER_BYTES];
            try (InputStream input = new BufferedInputStream(connection.getInputStream());
                 FileOutputStream output = new FileOutputStream(partial, offset > 0)) {
                int count;
                while ((count = input.read(buffer)) != -1) {
                    receivedThisRequest += count;
                    receivedTotal += count;
                    if (receivedTotal > MAX_APK_BYTES) {
                        keepPartialOnFailure = false;
                        throw new IOException("APK trop volumineux; téléchargement annulé.");
                    }
                    digest.update(buffer, 0, count);
                    output.write(buffer, 0, count);
                }
                output.getFD().sync();
            } finally {
                connection.disconnect();
            }

            if (receivedThisRequest <= 0) {
                throw new IOException("Aucune donnée reçue pour l’APK.");
            }
            if (declaredLength >= 0 && receivedThisRequest != declaredLength) {
                throw new IOException("Téléchargement interrompu. La partie reçue est conservée pour reprise.");
            }
            if (totalLength >= 0 && receivedTotal != totalLength) {
                throw new IOException("Téléchargement incomplet. La partie reçue est conservée pour reprise.");
            }

            byte[] actualHash = digest.digest();
            byte[] expectedHash = hexToBytes(expectedSha256);
            if (!MessageDigest.isEqual(actualHash, expectedHash)) {
                keepPartialOnFailure = false;
                throw new IOException("SHA-256 incorrect : APK rejeté.");
            }

            // Remplacement protégé : conserver l'ancien APK si la finalisation échoue.
            if (backup.exists() && !backup.delete()) {
                throw new IOException("Nettoyage de l'ancienne sauvegarde APK impossible.");
            }
            boolean hadOldApk = apk.exists();
            if (hadOldApk && !apk.renameTo(backup)) {
                throw new IOException("Sauvegarde de l'ancien APK impossible.");
            }
            if (!partial.renameTo(apk)) {
                if (hadOldApk && backup.exists()) backup.renameTo(apk);
                throw new IOException("Finalisation APK impossible; l'ancien fichier est préservé.");
            }

            saved = true;
            if (backup.exists()) backup.delete();
            return relativePath;
        } finally {
            if (!saved && !keepPartialOnFailure && partial.exists()) partial.delete();
        }
    }

    private boolean isExpectedReleaseUrl(URL url, String version) {
        String expectedPath = "/" + REPOSITORY + "/releases/download/v" + version
            + "/baaro-v" + version + ".apk";
        return "https".equalsIgnoreCase(url.getProtocol())
            && "github.com".equalsIgnoreCase(url.getHost())
            && expectedPath.equals(url.getPath());
    }

    private boolean isTrustedGitHubHost(URL url) {
        if (url == null
            || !"https".equalsIgnoreCase(url.getProtocol())
            || url.getUserInfo() != null
            || (url.getPort() != -1 && url.getPort() != 443)) {
            return false;
        }

        String host = url.getHost().toLowerCase(Locale.ROOT);

        return "github.com".equals(host)
            || "release-assets.githubusercontent.com".equals(host)
            || "objects.githubusercontent.com".equals(host)
            || "github-releases.githubusercontent.com".equals(host);
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
        String expectedSha256 = call.getString("sha256");

        if (relativePath == null || relativePath.trim().isEmpty()) {
            call.reject("Chemin APK manquant.");
            return;
        }
        if (expectedSha256 == null || !expectedSha256.matches("(?i)[a-f0-9]{64}")) {
            call.reject("Empreinte SHA-256 invalide.");
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

            String filename = apk.getName();
            if (!filename.matches("baaro-v\\d+\\.\\d+\\.\\d+\\.apk")) {
                call.reject("Nom de fichier APK non autorisé.");
                return;
            }

            long apkLength = apk.length();
            if (apkLength <= 0 || apkLength > MAX_APK_BYTES) {
                call.reject("Taille du fichier APK invalide.");
                return;
            }

            MessageDigest installDigest = MessageDigest.getInstance("SHA-256");
            try (InputStream input = new BufferedInputStream(
                    new java.io.FileInputStream(apk))) {
                byte[] buffer = new byte[BUFFER_BYTES];
                int count;
                while ((count = input.read(buffer)) != -1) {
                    installDigest.update(buffer, 0, count);
                }
            }

            byte[] actualHash = installDigest.digest();
            byte[] expectedHash = hexToBytes(expectedSha256);
            if (!MessageDigest.isEqual(actualHash, expectedHash)) {
                call.reject("SHA-256 incorrect avant installation : APK rejeté.");
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
