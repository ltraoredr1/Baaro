package com.baaro.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /**
     * Canal historique : utilisé par le serveur tant que l'app n'a pas
     * synchronisé le son choisi. Même id que ANDROID_CHANNEL_ID dans
     * src/lib/pushNotifications.js et FCM_ANDROID_CHANNEL_ID côté serveur.
     */
    private static final String LEGACY_CHANNEL_ID = "baaro_notifications_v2";

    /**
     * Android 8+ : le son appartient au canal et ne peut plus changer après
     * sa création. Un canal par son : baaro_notifications_v3_<son>, plus un
     * canal muet. Ces ids et ces noms de fichiers (res/raw/<son>.wav) doivent
     * rester identiques à src/lib/notificationSounds.js et
     * api/_lib/push-sounds.js.
     */
    private static final String CHANNEL_PREFIX = "baaro_notifications_v3_";
    private static final String SILENT_CHANNEL_ID = CHANNEL_PREFIX + "silent";

    private static final String[][] SOUND_CHANNELS = {
        { "baaro_pulse", "Baaro Pulse" },
        { "sahel_beat", "Sahel Beat" },
        { "nko_glow", "N'Ko Glow" },
        { "market_hustle", "Market Hustle" },
        { "live_drop", "Live Drop" },
        { "creator_rise", "Creator Rise" },
        { "baaro_signature", "Baaro Signature" },
    };

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BaaroSmsPlugin.class);
        super.onCreate(savedInstanceState);
        createBaaroNotificationChannels();
    }

    private void createBaaroNotificationChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }

        NotificationManager manager =
            getSystemService(NotificationManager.class);

        if (manager == null) {
            return;
        }

        AudioAttributes audioAttributes =
            new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();

        // Canal historique (son baaro_pulse).
        createSoundChannel(
            manager,
            audioAttributes,
            LEGACY_CHANNEL_ID,
            "Notifications BAARO",
            "baaro_pulse"
        );

        // Un canal par son.
        for (String[] sound : SOUND_CHANNELS) {
            createSoundChannel(
                manager,
                audioAttributes,
                CHANNEL_PREFIX + sound[0],
                "Notifications BAARO — " + sound[1],
                sound[0]
            );
        }

        // Canal muet : aucun son, aucune vibration.
        // Ne pas recréer un canal existant : Android conserve les choix de
        // l'utilisateur dans les réglages système.
        if (manager.getNotificationChannel(SILENT_CHANNEL_ID) == null) {
            NotificationChannel silent = new NotificationChannel(
                SILENT_CHANNEL_ID,
                "Notifications BAARO — Silencieux",
                NotificationManager.IMPORTANCE_LOW
            );

            silent.setDescription("Notifications sans son");
            silent.setSound(null, null);
            silent.enableVibration(false);

            manager.createNotificationChannel(silent);
        }
    }

    private void createSoundChannel(
        NotificationManager manager,
        AudioAttributes audioAttributes,
        String channelId,
        String channelName,
        String rawResourceName
    ) {
        // Ne pas recréer le canal s'il existe déjà :
        // Android conserve les préférences de l'utilisateur.
        if (manager.getNotificationChannel(channelId) != null) {
            return;
        }

        int rawId = getResources().getIdentifier(
            rawResourceName,
            "raw",
            getPackageName()
        );

        if (rawId == 0) {
            // Fichier son absent de res/raw : on n'invente pas de canal sans son.
            return;
        }

        Uri soundUri = Uri.parse(
            "android.resource://" + getPackageName() + "/" + rawId
        );

        NotificationChannel channel = new NotificationChannel(
            channelId,
            channelName,
            NotificationManager.IMPORTANCE_HIGH
        );

        channel.setDescription(
            "Messages, alertes et notifications de BAARO"
        );

        channel.setSound(soundUri, audioAttributes);
        channel.enableVibration(true);

        manager.createNotificationChannel(channel);
    }
}
