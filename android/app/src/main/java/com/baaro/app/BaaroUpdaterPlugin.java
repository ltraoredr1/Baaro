package com.baaro.app;

import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;

@CapacitorPlugin(name = "BaaroUpdater")
public class BaaroUpdaterPlugin extends Plugin {

    @PluginMethod
    public void canInstallPackages(PluginCall call) {
        boolean allowed = Build.VERSION.SDK_INT < 26
            || getContext().getPackageManager().canRequestPackageInstalls();

        com.getcapacitor.JSObject result = new com.getcapacitor.JSObject();
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
