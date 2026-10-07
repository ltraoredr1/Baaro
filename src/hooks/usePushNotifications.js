import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { supabase } from "../supabaseClient.js";

export function usePushNotifications(user_id) {
  useEffect(() => {
    if (!user_id) return;
    let mounted = true;

    const setup = async () => {
      if (Capacitor.isNativePlatform()) {
        const perm = await PushNotifications.requestPermissions();
        if (!mounted) return;
        if (perm.receive !== "granted") return;

        await PushNotifications.register();

        PushNotifications.addListener("registration", async (token) => {
          if (!mounted) return;
          await supabase.from("push_subscriptions").upsert(
            { user_id: user_id, token: token.value, platform: Capacitor.getPlatform() },
            { onConflict: "user_id,token" }
          );
        });

        PushNotifications.addListener("pushNotificationReceived", (notification) => {
          if (!mounted) return;
          console.log("[push] reçue :", notification);
        });

        PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
          if (!mounted) return;
          const data = action.notification?.data;
          if (data?.channel_id) {
            // TODO : naviguer vers le canal
            console.log("[push] ouvrir canal", data.channel_id);
          }
        });
      } else {
        // Web : demander la permission Notification
        if ("Notification" in window && Notification.permission === "default") {
          await Notification.requestPermission();
        }
      }
    };

    setup();

    return () => {
      mounted = false;
      PushNotifications.removeAllListeners();
    };
  }, [user_id]);
}
