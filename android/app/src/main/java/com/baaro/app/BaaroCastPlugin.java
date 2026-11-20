package com.baaro.app;

import androidx.fragment.app.FragmentActivity;
import androidx.mediarouter.app.MediaRouteChooserDialogFragment;
import androidx.mediarouter.media.MediaRouteSelector;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import com.google.android.gms.cast.CastMediaControlIntent;
import com.google.android.gms.cast.MediaInfo;
import com.google.android.gms.cast.MediaLoadRequestData;
import com.google.android.gms.cast.MediaStatus;
import com.google.android.gms.cast.MediaMetadata;
import com.google.android.gms.cast.framework.CastContext;
import com.google.android.gms.cast.framework.CastSession;
import com.google.android.gms.cast.framework.media.RemoteMediaClient;

@CapacitorPlugin(name = "BaaroCast")
public class BaaroCastPlugin extends Plugin {
    private static final String PICKER_TAG = "baaro-cast-device-picker";

    private CastContext getCastContext() {
        return CastContext.getSharedInstance(getContext());
    }

    private CastSession getCurrentSession() {
        return getCastContext().getSessionManager().getCurrentCastSession();
    }

    private RemoteMediaClient getRemoteClient(PluginCall call) {
        CastSession session = getCurrentSession();

        if (session == null || session.getRemoteMediaClient() == null) {
            call.reject("Aucun téléviseur connecté. Choisis d'abord un appareil Cast.");
            return null;
        }

        return session.getRemoteMediaClient();
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        try {
            getCastContext();
            JSObject result = new JSObject();
            result.put("available", true);
            call.resolve(result);
        } catch (Exception error) {
            JSObject result = new JSObject();
            result.put("available", false);
            call.resolve(result);
        }
    }

    @PluginMethod
    public void isConnected(PluginCall call) {
        CastSession session = getCurrentSession();
        JSObject result = new JSObject();
        result.put("connected", session != null && session.isConnected());
        call.resolve(result);
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        RemoteMediaClient client = getRemoteClient(call);
        if (client == null) return;

        JSObject result = new JSObject();
        result.put("currentTime",
            Math.max(0L, client.getApproximateStreamPosition()) / 1000.0);
        result.put("isPaused",
            client.getPlayerState() != MediaStatus.PLAYER_STATE_PLAYING);
        result.put("isLoaded",
            client.getPlayerState() != MediaStatus.PLAYER_STATE_UNKNOWN);
        call.resolve(result);
    }

    @PluginMethod
    public void showDevicePicker(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                FragmentActivity activity =
                    (FragmentActivity) getActivity();

                if (activity.isFinishing() || activity.isDestroyed()) {
                    call.reject("Application Android indisponible.");
                    return;
                }

                if (activity.getSupportFragmentManager()
                    .findFragmentByTag(PICKER_TAG) != null) {
                    call.resolve();
                    return;
                }

                MediaRouteSelector selector =
                    new MediaRouteSelector.Builder()
                        .addControlCategory(
                            CastMediaControlIntent.categoryForCast(
                                CastMediaControlIntent.DEFAULT_MEDIA_RECEIVER_APPLICATION_ID
                            )
                        )
                        .build();

                MediaRouteChooserDialogFragment dialog =
                    new MediaRouteChooserDialogFragment();

                dialog.setRouteSelector(selector);
                dialog.show(
                    activity.getSupportFragmentManager(),
                    PICKER_TAG
                );

                call.resolve();
            } catch (Exception error) {
                call.reject("Impossible d'ouvrir la liste des téléviseurs.", error);
            }
        });
    }

    @PluginMethod
    public void loadMedia(PluginCall call) {
        String url = call.getString("url");
        String title = call.getString("title", "Vidéo BAARO");
        String mimeType = call.getString("mimeType", "video/mp4");
        double seconds = call.getDouble("currentTime", 0.0);

        if (url == null || !(url.startsWith("https://") || url.startsWith("http://"))) {
            call.reject("Adresse vidéo publique HTTP(S) obligatoire.");
            return;
        }

        try {
            RemoteMediaClient client = getRemoteClient(call);
            if (client == null) return;

            MediaMetadata metadata =
                new MediaMetadata(MediaMetadata.MEDIA_TYPE_MOVIE);
            metadata.putString(MediaMetadata.KEY_TITLE, title);

            MediaInfo mediaInfo = new MediaInfo.Builder(url)
                .setStreamType(MediaInfo.STREAM_TYPE_BUFFERED)
                .setContentType(mimeType)
                .setMetadata(metadata)
                .build();

            long positionMs = Math.max(0L, (long) (seconds * 1000));

            MediaLoadRequestData request =
                new MediaLoadRequestData.Builder()
                    .setMediaInfo(mediaInfo)
                    .setCurrentTime(positionMs)
                    .setAutoplay(true)
                    .build();

            client.load(request);

            JSObject result = new JSObject();
            result.put("loaded", true);
            result.put("mode", "tv");
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Lecture Chromecast impossible : " + error.getMessage(), error);
        }
    }

    @PluginMethod
    public void play(PluginCall call) {
        RemoteMediaClient client = getRemoteClient(call);
        if (client == null) return;
        client.play();
        call.resolve();
    }

    @PluginMethod
    public void pause(PluginCall call) {
        RemoteMediaClient client = getRemoteClient(call);
        if (client == null) return;
        client.pause();
        call.resolve();
    }

    @PluginMethod
    public void seek(PluginCall call) {
        double seconds = call.getDouble("currentTime", 0.0);
        RemoteMediaClient client = getRemoteClient(call);
        if (client == null) return;

        client.seek(Math.max(0L, (long) (seconds * 1000)));
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        RemoteMediaClient client = getRemoteClient(call);
        if (client == null) return;

        client.stop();
        call.resolve();
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        try {
            getCastContext().getSessionManager().endCurrentSession(true);
            call.resolve();
        } catch (Exception error) {
            call.reject("Déconnexion Chromecast impossible.", error);
        }
    }
}
