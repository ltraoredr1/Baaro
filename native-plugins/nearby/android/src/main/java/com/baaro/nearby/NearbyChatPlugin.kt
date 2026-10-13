package com.baaro.nearby

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.google.android.gms.nearby.Nearby
import com.google.android.gms.nearby.connection.AdvertisingOptions
import com.google.android.gms.nearby.connection.ConnectionInfo
import com.google.android.gms.nearby.connection.ConnectionLifecycleCallback
import com.google.android.gms.nearby.connection.ConnectionResolution
import com.google.android.gms.nearby.connection.ConnectionsClient
import com.google.android.gms.nearby.connection.DiscoveredEndpointInfo
import com.google.android.gms.nearby.connection.DiscoveryOptions
import com.google.android.gms.nearby.connection.EndpointDiscoveryCallback
import com.google.android.gms.nearby.connection.Payload
import com.google.android.gms.nearby.connection.PayloadCallback
import com.google.android.gms.nearby.connection.PayloadTransferUpdate
import com.google.android.gms.nearby.connection.Strategy
import android.Manifest

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

    companion object {
        private const val SERVICE_ID = "com.baaro.app.nearby"
        private const val DEFAULT_DISPLAY_NAME = "Utilisateur BAARO"
    }

    private lateinit var connectionsClient: ConnectionsClient
    private val strategy = Strategy.P2P_CLUSTER
    private val endpointNames = mutableMapOf<String, String>()
    private val pendingEndpoints = mutableSetOf<String>()
    private val connectedEndpoints = mutableMapOf<String, String>()
    private var isStarting = false
    private var isStarted = false
    private var isStopping = false
    private var displayName = DEFAULT_DISPLAY_NAME

    private fun client(): ConnectionsClient {
        if (!::connectionsClient.isInitialized) {
            connectionsClient = Nearby.getConnectionsClient(activity)
        }
        return connectionsClient
    }

    private fun emit(type: String, endpointId: String? = null, extras: JSObject.() -> Unit = {}) {
        val event = JSObject()
        event.put("type", type)
        if (endpointId!= null) event.put("endpointId", endpointId)
        event.extras()
        notifyListeners("nearbyEvent", event)
    }

    private fun emitError(message: String) {
        emit("ERROR") { put("message", message) }
    }

    private val payloadCallback = object : PayloadCallback() {
        override fun onPayloadReceived(endpointId: String, payload: Payload) {
            if (payload.type!= Payload.Type.BYTES) return
            val bytes = payload.asBytes()?: return
            val message = String(bytes, Charsets.UTF_8)
            emit("MESSAGE_RECEIVED", endpointId) {
                put("senderName", connectedEndpoints[endpointId]?: "Inconnu")
                put("text", message)
            }
        }
        override fun onPayloadTransferUpdate(endpointId: String, update: PayloadTransferUpdate) {}
    }

    private val connectionLifecycleCallback = object : ConnectionLifecycleCallback() {
        override fun onConnectionInitiated(endpointId: String, connectionInfo: ConnectionInfo) {
            endpointNames[endpointId] = connectionInfo.endpointName
            pendingEndpoints.add(endpointId)
            emit("CONNECTION_REQUESTED", endpointId) { put("deviceName", connectionInfo.endpointName) }
        }
        override fun onConnectionResult(endpointId: String, result: ConnectionResolution) {
            pendingEndpoints.remove(endpointId)
            if (result.status.isSuccess) {
                val name = endpointNames[endpointId]?: "Appareil distant"
                connectedEndpoints[endpointId] = name
                emit("DEVICE_CONNECTED", endpointId) { put("deviceName", name) }
            } else {
                connectedEndpoints.remove(endpointId)
                emit("ERROR") { put("message", "La connexion avec ${endpointNames[endpointId]?: "l'appareil distant"} a échoué.") }
                endpointNames.remove(endpointId)
            }
        }
        override fun onDisconnected(endpointId: String) {
            val name = endpointNames[endpointId]
            connectedEndpoints.remove(endpointId)
            pendingEndpoints.remove(endpointId)
            endpointNames.remove(endpointId)
            emit("DEVICE_LOST", endpointId) { if (name!= null) put("deviceName", name) }
        }
    }

    private val endpointDiscoveryCallback = object : EndpointDiscoveryCallback() {
        override fun onEndpointFound(endpointId: String, info: DiscoveredEndpointInfo) {
            endpointNames[endpointId] = info.endpointName
            emit("DEVICE_FOUND", endpointId) {
                put("deviceName", info.endpointName)
                put("serviceId", info.serviceId)
            }
        }
        override fun onEndpointLost(endpointId: String) {
            if (!connectedEndpoints.containsKey(endpointId) &&!pendingEndpoints.contains(endpointId)) {
                endpointNames.remove(endpointId)
            }
            emit("DEVICE_LOST", endpointId)
        }
    }

    @PluginMethod
    fun start(call: PluginCall) {
        if (isStarting || isStopping) { call.reject("Une opération Nearby est déjà en cours."); return }
        if (isStarted) { call.resolve(JSObject().apply { put("success", true) }); return }
        displayName = call.getString("displayName")?.trim()?.takeIf { it.isNotEmpty() }?: DEFAULT_DISPLAY_NAME
        isStarting = true
        val advertisingOptions = AdvertisingOptions.Builder().setStrategy(strategy).build()
        client().startAdvertising(displayName, SERVICE_ID, connectionLifecycleCallback, advertisingOptions)
           .addOnSuccessListener {
                val discoveryOptions = DiscoveryOptions.Builder().setStrategy(strategy).build()
                client().startDiscovery(SERVICE_ID, endpointDiscoveryCallback, discoveryOptions)
                   .addOnSuccessListener {
                        isStarting = false; isStarted = true
                        call.resolve(JSObject().apply { put("success", true) })
                    }.addOnFailureListener { error ->
                        try { client().stopAdvertising() } catch (_: Exception) {}
                        isStarting = false; isStarted = false
                        call.reject("Échec de la découverte Nearby : ${error.message}")
                    }
            }.addOnFailureListener { error ->
                isStarting = false; isStarted = false
                call.reject("Échec de la diffusion Nearby : ${error.message}")
            }
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        if (isStopping) { call.reject("L'arrêt de Nearby est déjà en cours."); return }
        isStopping = true
        if (!::connectionsClient.isInitialized) {
            clearConnectionState(); isStarted = false; isStarting = false; isStopping = false
            call.resolve(JSObject().apply { put("success", true) }); return
        }
        try { client().stopAdvertising() } catch (_: Exception) {}
        try { client().stopDiscovery() } catch (_: Exception) {}
        val endpoints = (connectedEndpoints.keys + pendingEndpoints).toSet()
        endpoints.forEach { endpointId ->
            try { client().disconnectFromEndpoint(endpointId) } catch (_: Exception) {}
        }
        clearConnectionState()
        isStarted = false; isStarting = false; isStopping = false
        call.resolve(JSObject().apply { put("success", true) })
    }

    private fun clearConnectionState() {
        connectedEndpoints.clear(); pendingEndpoints.clear(); endpointNames.clear()
    }

    @PluginMethod
    fun send(call: PluginCall) {
        val text = call.getString("text")
        if (text.isNullOrBlank()) { call.reject("Le message ne peut pas être vide."); return }
        if (!::connectionsClient.isInitialized ||!isStarted || isStopping) { call.reject("Nearby n'est pas démarré."); return }
        val requestedEndpoint = call.getString("endpointId")
        val targets = if (!requestedEndpoint.isNullOrBlank()) {
            if (!connectedEndpoints.containsKey(requestedEndpoint)) { call.reject("Cet appareil n'est pas connecté."); return }
            listOf(requestedEndpoint)
        } else { connectedEndpoints.keys.toList() }
        if (targets.isEmpty()) { call.reject("Aucun appareil Nearby n'est connecté."); return }
        val payload = Payload.fromBytes(text.toByteArray(Charsets.UTF_8))
        var failed = 0
        var completed = 0
        targets.forEach { endpointId ->
            client().sendPayload(endpointId, payload)
               .addOnSuccessListener {
                    completed++
                    if (completed + failed == targets.size && failed == 0) {
                        call.resolve(JSObject().apply { put("success", true); put("sentTo", targets.size) })
                    }
                }
               .addOnFailureListener { error ->
                    failed++
                    if (failed + completed == targets.size) {
                        call.reject("Échec de l'envoi Nearby : ${error.message}")
                    }
                }
        }
        // Si aucun payload n'a été envoyé (cas improbable)
        if (targets.isEmpty()) { call.reject("Aucun appareil Nearby n'est connecté.") }
    }

    @PluginMethod
    fun accept(call: PluginCall) {
        val endpointId = call.getString("endpointId")
        if (endpointId.isNullOrBlank()) { call.reject("endpointId manquant."); return }
        if (!pendingEndpoints.contains(endpointId)) { call.reject("Aucune demande de connexion en attente pour cet appareil."); return }
        client().acceptConnection(endpointId, payloadCallback)
           .addOnSuccessListener { call.resolve(JSObject().apply { put("success", true) }) }
           .addOnFailureListener { error -> call.reject("Impossible d'accepter la connexion : ${error.message}") }
    }

    @PluginMethod
    fun reject(call: PluginCall) {
        val endpointId = call.getString("endpointId")
        if (endpointId.isNullOrBlank()) { call.reject("endpointId manquant."); return }
        if (!pendingEndpoints.contains(endpointId)) { call.reject("Aucune demande de connexion en attente pour cet appareil."); return }
        client().rejectConnection(endpointId)
           .addOnSuccessListener {
                pendingEndpoints.remove(endpointId); connectedEndpoints.remove(endpointId); endpointNames.remove(endpointId)
                call.resolve(JSObject().apply { put("success", true) })
            }
           .addOnFailureListener { error -> call.reject("Impossible de refuser la connexion : ${error.message}") }
    }
}
