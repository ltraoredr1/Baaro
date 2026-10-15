package com.baaro.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private static final String CHANNEL_ID = "baaro_notifications";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        createBaaroNotificationChannel();
    }

    private void createBaaroNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager manager =
                getSystemService(NotificationManager.class);

            if (manager == null) {
                return;
            }

            // Ne pas recréer le canal s'il existe déjà :
            // Android conserve les préférences de l'utilisateur.
            if (manager.getNotificationChannel(CHANNEL_ID) != null) {
                return;
            }

            Uri soundUri = Uri.parse(
                "android.resource://" + getPackageName()
                + "/" + R.raw.baaro_pulse
            );

            AudioAttributes audioAttributes =
                new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build();

            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Notifications BAARO",
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
}
