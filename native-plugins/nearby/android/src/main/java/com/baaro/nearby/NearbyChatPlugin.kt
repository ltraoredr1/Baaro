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

@CapacitorPlugin(
    name = "NearbyChat",
    permissions = [
        Permission(
            strings = [
                Manifest.permission.BLUETOOTH_SCAN,
                Manifest.permission.BLUETOOTH_CONNECT,
                Manifest.permission.NEARBY_WIFI_DEVICES
            ],
            alias = "nearby"
        ),
        Permission(
            strings = [Manifest.permission.ACCESS_FINE_LOCATION],
            alias = "location"
        )
    ]
)
class NearbyChatPlugin : Plugin() {

    private lateinit var connectionsClient: ConnectionsClient
    private val strategy = Strategy.P2P_CLUSTER
    private val serviceId = "com.baaro.app.nearby"
    private var myDisplayName: String = "Utilisateur BAARO"
    private val connectedEndpoints = mutableMapOf<String, String>()

    private val payloadCallback = object : PayloadCallback() {
        override fun onPayloadReceived(endpointId: String, payload: Payload) {
            if (payload.type == Payload.Type.BYTES) {
                val message = String(payload.asBytes()!!)
                val senderName = connectedEndpoints[endpointId] ?: "Inconnu"

                val ret = JSObject().apply {
                    put("type", "MESSAGE_RECEIVED")
                    put("endpointId", endpointId)
                    put("senderName", senderName)
                    put("text", message)
                }
                notifyListeners("nearbyEvent", ret)
            }
        }

        override fun onPayloadTransferUpdate(endpointId: String, update: PayloadTransferUpdate) {}
    }

    private val connectionLifecycleCallback = object : ConnectionLifecycleCallback() {
        override fun onConnectionInitiated(endpointId: String, connectionInfo: ConnectionInfo) {
            // On sauvegarde temporairement le nom associé à cet endpoint
            connectedEndpoints[endpointId] = connectionInfo.endpointName

            val ret = JSObject().apply {
                put("type", "CONNECTION_REQUESTED")
                put("endpointId", endpointId)
                put("deviceName", connectionInfo.endpointName)
            }
            notifyListeners("nearbyEvent", ret)
            connectionsClient.acceptConnection(endpointId, payloadCallback)
        }

        override fun onConnectionResult(endpointId: String, result: ConnectionResolution) {
            if (result.status.isSuccess) {
                val name = connectedEndpoints[endpointId] ?: "Appareil distant"

                val ret = JSObject().apply {
                    put("type", "DEVICE_CONNECTED")
                    put("endpointId", endpointId)
                    put("deviceName", name)
                }
                notifyListeners("nearbyEvent", ret)
            } else {
                connectedEndpoints.remove(endpointId)
            }
        }

        override fun onDisconnected(endpointId: String) {
            connectedEndpoints.remove(endpointId)
            val ret = JSObject().apply {
                put("type", "DEVICE_LOST")
                put("endpointId", endpointId)
            }
            notifyListeners("nearbyEvent", ret)
        }
    }

    private val endpointDiscoveryCallback = object : EndpointDiscoveryCallback() {
        override fun onEndpointFound(endpointId: String, info: DiscoveredEndpointInfo) {
            connectedEndpoints[endpointId] = info.endpointName
            val ret = JSObject().apply {
                put("type", "DEVICE_FOUND")
                put("endpointId", endpointId)
                put("deviceName", info.endpointName)
                put("serviceId", info.serviceId)
            }
            notifyListeners("nearbyEvent", ret)
        }

        override fun onEndpointLost(endpointId: String) {
            connectedEndpoints.remove(endpointId)
            val ret = JSObject().apply {
                put("type", "DEVICE_LOST")
                put("endpointId", endpointId)
            }
            notifyListeners("nearbyEvent", ret)
        }
    }

    @PluginMethod
    fun start(call: PluginCall) {
        myDisplayName = call.getString("displayName") ?: "Utilisateur BAARO"
        connectionsClient = Nearby.getConnectionsClient(activity)

        val advertisingOptions = AdvertisingOptions.Builder().setStrategy(strategy).build()
        connectionsClient.startAdvertising(
            myDisplayName,
            serviceId,
            connectionLifecycleCallback,
            advertisingOptions
        ).addOnSuccessListener {
            val discoveryOptions = DiscoveryOptions.Builder().setStrategy(strategy).build()
            connectionsClient.startDiscovery(
                serviceId,
                endpointDiscoveryCallback,
                discoveryOptions
            ).addOnSuccessListener {
                call.resolve(JSObject().apply { put("success", true) })
            }.addOnFailureListener { e ->
                call.reject("Erreur découverte: " + e.message)
            }
        }.addOnFailureListener { e ->
            call.reject("Erreur diffusion: " + e.message)
        }
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        try {
            connectionsClient.stopAdvertising()
            connectionsClient.stopDiscovery()
            connectedEndpoints.clear()
            call.resolve(JSObject().apply { put("success", true) })
        } catch (e: Exception) {
            call.reject("Erreur arrêt: " + e.message)
        }
    }

    @PluginMethod
    fun send(call: PluginCall) {
        val text = call.getString("text") ?: ""
        val endpointId = call.getString("endpointId")

        if (text.isEmpty()) {
            call.reject("Message vide")
            return
        }

        val payload = Payload.fromBytes(text.toByteArray())

        if (endpointId != null) {
            connectionsClient.sendPayload(endpointId, payload)
        } else {
            connectedEndpoints.keys.forEach { id ->
                connectionsClient.sendPayload(id, payload)
            }
        }
        call.resolve(JSObject().apply { put("success", true) })
    }

    @PluginMethod
    fun accept(call: PluginCall) {
        val endpointId = call.getString("endpointId") ?: return call.reject("endpointId manquant")
        connectionsClient.acceptConnection(endpointId, payloadCallback)
        call.resolve(JSObject().apply { put("success", true) })
    }

    @PluginMethod
    fun reject(call: PluginCall) {
        val endpointId = call.getString("endpointId") ?: return call.reject("endpointId manquant")
        connectionsClient.rejectConnection(endpointId)
        call.resolve(JSObject().apply { put("success", true) })
    }
}
