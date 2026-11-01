package com.baaro.app;

import android.Manifest;
import android.content.Context;
import android.os.Build;
import android.telephony.SmsManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.ArrayList;

/**
 * Mode Zéro Data : envoi d'un SMS classique depuis l'interface BAARO quand il n'y a pas de data.
 * Envoi uniquement (SEND_SMS). Aucune lecture des SMS de l'utilisateur.
 */
@CapacitorPlugin(
    name = "BaaroSms",
    permissions = {
        @Permission(strings = { Manifest.permission.SEND_SMS }, alias = "sms")
    }
)
public class BaaroSmsPlugin extends Plugin {

    @PluginMethod
    public void isAvailable(PluginCall call) {
        boolean hasTelephony = getContext().getPackageManager()
            .hasSystemFeature(android.content.pm.PackageManager.FEATURE_TELEPHONY_MESSAGING);
        JSObject res = new JSObject();
        res.put("available", hasTelephony);
        res.put("granted", getPermissionState("sms") == PermissionState.GRANTED);
        call.resolve(res);
    }

    @PluginMethod
    public void requestSmsPermission(PluginCall call) {
        if (getPermissionState("sms") == PermissionState.GRANTED) {
            JSObject res = new JSObject();
            res.put("granted", true);
            call.resolve(res);
            return;
        }
        requestPermissionForAlias("sms", call, "smsPermissionCallback");
    }

    @PermissionCallback
    private void smsPermissionCallback(PluginCall call) {
        JSObject res = new JSObject();
        res.put("granted", getPermissionState("sms") == PermissionState.GRANTED);
        call.resolve(res);
    }

    @PluginMethod
    public void send(PluginCall call) {
        String to = call.getString("to");
        String body = call.getString("body");
        if (to == null || to.trim().isEmpty() || body == null || body.isEmpty()) {
            call.reject("Numéro ou texte manquant");
            return;
        }
        if (getPermissionState("sms") != PermissionState.GRANTED) {
            call.reject("Permission SMS non accordée");
            return;
        }
        try {
            SmsManager sms;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                sms = getContext().getSystemService(SmsManager.class);
            } else {
                sms = SmsManager.getDefault();
            }
            if (sms == null) {
                call.reject("SMS indisponible sur cet appareil");
                return;
            }
            ArrayList<String> parts = sms.divideMessage(body);
            if (parts.size() > 1) {
                sms.sendMultipartTextMessage(to.trim(), null, parts, null, null);
            } else {
                sms.sendTextMessage(to.trim(), null, body, null, null);
            }
            JSObject res = new JSObject();
            res.put("sent", true);
            res.put("parts", parts.size());
            call.resolve(res);
        } catch (Exception e) {
            call.reject("Envoi SMS impossible: " + e.getMessage());
        }
    }
}
