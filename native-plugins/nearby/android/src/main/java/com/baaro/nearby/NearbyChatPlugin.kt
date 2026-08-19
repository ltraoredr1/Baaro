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
 * BAARO Nearby Connections bridge.
 *
 * Security model:
 * - connections are NOT auto-accepted;
 * - JS receives connectionRequested and must explicitly accept/reject;
 * - payloads are size-limited;
 * - the native layer never awards points or changes wallet state.
 *
 * Application-level identity/authentication must still be handled by BAARO
 * before treating a received payload as a trusted user message.
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
    private val maxMessageBytes = 16 * 1024
    private val connectedEndpoints = mutableSetOf<String>()
    private val pendingEndpoints = mutableSetOf<String>()
    private lateinit var connectionsClient: ConnectionsClient

    override fun load() {
        connectionsClient = Nearby.getConnectionsClient(context)
    }

    @PluginMethod
    fun start(call: PluginCall) {
        val displayName = call.getString("displayName")?.trim()
        if (displayName.isNullOrEmpty() || displayName.length > 48) {
            call.reject("Nom d'appareil invalide")
            return
        }

        val options = AdvertisingOptions.Builder()
            .setStrategy(Strategy.P2P_CLUSTER)
            .build()

        val discoveryOptions = DiscoveryOptions.Builder()
            .setStrategy(Strategy.P2P_CLUSTER)
            .build()

        connectionsClient.startAdvertising(
            displayName,
            serviceId,
            connectionLifecycleCallback,
            options
        )
        connectionsClient.startDiscovery(
            serviceId,
            endpointDiscoveryCallback,
            discoveryOptions
        )

        call.resolve()
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        connectionsClient.stopAdvertising()
        connectionsClient.stopDiscovery()
        connectionsClient.stopAllEndpoints()
        connectedEndpoints.clear()
        pendingEndpoints.clear()
        call.resolve()
    }

    @PluginMethod
    fun accept(call: PluginCall) {
        val endpointId = call.getString("endpointId")
        if (endpointId.isNullOrBlank() || !pendingEndpoints.contains(endpointId)) {
            call.reject("Demande de connexion inconnue")
            return
        }

        pendingEndpoints.remove(endpointId)
        connectionsClient.acceptConnection(endpointId, payloadCallback)
        call.resolve()
    }

    @PluginMethod
    fun reject(call: PluginCall) {
        val endpointId = call.getString("endpointId")
        if (endpointId.isNullOrBlank() || !pendingEndpoints.remove(endpointId)) {
            call.reject("Demande de connexion inconnue")
            return
        }

        connectionsClient.rejectConnection(endpointId)
        call.resolve()
    }

    @PluginMethod
    fun send(call: PluginCall) {
        val text = call.getString("text") ?: run {
            call.reject("Texte manquant")
            return
        }

        val bytes = text.toByteArray(StandardCharsets.UTF_8)
        if (bytes.isEmpty() || bytes.size > maxMessageBytes) {
            call.reject("Message trop volumineux")
            return
        }

        if (connectedEndpoints.isEmpty()) {
            call.reject("Aucun appareil connecté")
            return
        }

        val payload = Payload.fromBytes(bytes)
        connectionsClient.sendPayload(connectedEndpoints.toList(), payload)
        call.resolve()
    }

    private val endpointDiscoveryCallback = object : EndpointDiscoveryCallback() {
        override fun onEndpointFound(endpointId: String, info: DiscoveredEndpointInfo) {
            if (pendingEndpoints.contains(endpointId) || connectedEndpoints.contains(endpointId)) return

            connectionsClient.requestConnection(
                "BAARO",
                endpointId,
                connectionLifecycleCallback
            )
        }

        override fun onEndpointLost(endpointId: String) {
            pendingEndpoints.remove(endpointId)
            connectedEndpoints.remove(endpointId)
            notifyDeviceEvent("deviceLost", endpointId)
        }
    }

    private val connectionLifecycleCallback = object : ConnectionLifecycleCallback() {
        override fun onConnectionInitiated(endpointId: String, info: ConnectionInfo) {
            pendingEndpoints.add(endpointId)

            val data = JSObject()
            data.put("endpointId", endpointId)
            data.put("endpointName", info.endpointName)
            data.put("authenticationToken", info.authenticationToken)
            data.put("isIncoming", info.isIncomingConnection)
            notifyListeners("connectionRequested", data)
        }

        override fun onConnectionResult(endpointId: String, result: ConnectionResolution) {
            pendingEndpoints.remove(endpointId)

            if (result.status.isSuccess) {
                connectedEndpoints.add(endpointId)
                notifyDeviceEvent("deviceFound", endpointId)
            } else {
                connectedEndpoints.remove(endpointId)
                notifyDeviceEvent("connectionFailed", endpointId)
            }
        }

        override fun onDisconnected(endpointId: String) {
            pendingEndpoints.remove(endpointId)
            connectedEndpoints.remove(endpointId)
            notifyDeviceEvent("deviceLost", endpointId)
        }
    }

    private val payloadCallback = object : PayloadCallback() {
        override fun onPayloadReceived(endpointId: String, payload: Payload) {
            if (payload.type != Payload.Type.BYTES) return

            val bytes = payload.asBytes() ?: return
            if (bytes.size > maxMessageBytes) return

            val data = JSObject()
            data.put("text", String(bytes, StandardCharsets.UTF_8))
            data.put("fromEndpointId", endpointId)
            notifyListeners("messageReceived", data)
        }

        override fun onPayloadTransferUpdate(
            endpointId: String,
            update: PayloadTransferUpdate
        ) {}
    }

    private fun notifyDeviceEvent(eventName: String, endpointId: String) {
        val data = JSObject()
        data.put("endpointId", endpointId)
        notifyListeners(eventName, data)
    }
}
