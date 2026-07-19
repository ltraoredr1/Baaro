package com.baaro.nearby

import android.Manifest
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.google.android.gms.nearby.Nearby
import com.google.android.gms.nearby.connection.*
import java.nio.charset.StandardCharsets

/**
 * Plugin natif BAARO : communication de proximité (Bluetooth / Wi-Fi Direct /
 * hotspot local) via l'API Google Nearby Connections. Fonctionne sans
 * Internet ni forfait data — seuls les appareils à portée physique
 * communiquent entre eux.
 *
 * Stratégie P2P_CLUSTER : chaque appareil peut être connecté à plusieurs
 * autres en même temps, ce qui permet à un message de circuler de proche en
 * proche (relais) même si l'expéditeur et le destinataire ne sont pas
 * directement à portée l'un de l'autre.
 */
@CapacitorPlugin(
    name = "NearbyChat",
    permissions = [
        Permission(strings = [Manifest.permission.BLUETOOTH_ADVERTISE], alias = "bluetoothAdvertise"),
        Permission(strings = [Manifest.permission.BLUETOOTH_CONNECT], alias = "bluetoothConnect"),
        Permission(strings = [Manifest.permission.BLUETOOTH_SCAN], alias = "bluetoothScan"),
        Permission(strings = [Manifest.permission.ACCESS_FINE_LOCATION], alias = "location")
    ]
)
class NearbyChatPlugin : Plugin() {

    private val serviceId = "com.baaro.nearby.SERVICE"
    private val connectedEndpoints = mutableSetOf<String>()
    private lateinit var connectionsClient: ConnectionsClient

    override fun load() {
        connectionsClient = Nearby.getConnectionsClient(context)
    }

    @PluginMethod
    fun start(call: PluginCall) {
        val displayName = call.getString("displayName") ?: "Membre BAARO"

        val options = AdvertisingOptions.Builder().setStrategy(Strategy.P2P_CLUSTER).build()
        connectionsClient.startAdvertising(displayName, serviceId, connectionLifecycleCallback, options)

        val discoveryOptions = DiscoveryOptions.Builder().setStrategy(Strategy.P2P_CLUSTER).build()
        connectionsClient.startDiscovery(serviceId, endpointDiscoveryCallback, discoveryOptions)

        call.resolve()
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        connectionsClient.stopAdvertising()
        connectionsClient.stopDiscovery()
        connectionsClient.stopAllEndpoints()
        connectedEndpoints.clear()
        call.resolve()
    }

    @PluginMethod
    fun send(call: PluginCall) {
        val text = call.getString("text") ?: return call.reject("Texte manquant")
        val payload = Payload.fromBytes(text.toByteArray(StandardCharsets.UTF_8))
        for (endpointId in connectedEndpoints) {
            connectionsClient.sendPayload(endpointId, payload)
        }
        call.resolve()
    }

    private val endpointDiscoveryCallback = object : EndpointDiscoveryCallback() {
        override fun onEndpointFound(endpointId: String, info: DiscoveredEndpointInfo) {
            connectionsClient.requestConnection("Membre BAARO", endpointId, connectionLifecycleCallback)
        }
        override fun onEndpointLost(endpointId: String) {
            connectedEndpoints.remove(endpointId)
            notifyDeviceEvent("deviceLost", endpointId)
        }
    }

    private val connectionLifecycleCallback = object : ConnectionLifecycleCallback() {
        override fun onConnectionInitiated(endpointId: String, info: ConnectionInfo) {
            connectionsClient.acceptConnection(endpointId, payloadCallback)
        }
        override fun onConnectionResult(endpointId: String, result: ConnectionResolution) {
            if (result.status.isSuccess) {
                connectedEndpoints.add(endpointId)
                notifyDeviceEvent("deviceFound", endpointId)
            }
        }
        override fun onDisconnected(endpointId: String) {
            connectedEndpoints.remove(endpointId)
            notifyDeviceEvent("deviceLost", endpointId)
        }
    }

    private val payloadCallback = object : PayloadCallback() {
        override fun onPayloadReceived(endpointId: String, payload: Payload) {
            if (payload.type == Payload.Type.BYTES) {
                val text = String(payload.asBytes()!!, StandardCharsets.UTF_8)
                val data = JSObject()
                data.put("text", text)
                data.put("fromEndpointId", endpointId)
                notifyListeners("messageReceived", data)
            }
        }
        override fun onPayloadTransferUpdate(endpointId: String, update: PayloadTransferUpdate) {}
    }

    private fun notifyDeviceEvent(eventName: String, endpointId: String) {
        val data = JSObject()
        data.put("endpointId", endpointId)
        notifyListeners(eventName, data)
    }
}
