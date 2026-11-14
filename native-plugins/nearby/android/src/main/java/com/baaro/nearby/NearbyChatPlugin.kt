package com.baaro.nearby

import com.getcapacitor.JSArray
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
import com.google.android.gms.tasks.Task
import com.google.android.gms.tasks.Tasks
import android.Manifest
import android.os.Build
import android.os.Handler
import android.os.Looper
import org.json.JSONObject
import java.util.concurrent.atomic.AtomicBoolean

@CapacitorPlugin(
    name = "NearbyChat",
    permissions = [
        Permission(
            strings = [
                Manifest.permission.BLUETOOTH_SCAN,
                Manifest.permission.BLUETOOTH_CONNECT,
                Manifest.permission.BLUETOOTH_ADVERTISE
            ],
            alias = "bluetooth"
        ),
        Permission(
            strings = [Manifest.permission.NEARBY_WIFI_DEVICES],
            alias = "nearbyWifi"
        ),
        Permission(
            strings = [Manifest.permission.ACCESS_COARSE_LOCATION],
            alias = "locationCoarse"
        ),
        Permission(
            strings = [Manifest.permission.ACCESS_FINE_LOCATION],
            alias = "locationFine"
        )
    ]
)
class NearbyChatPlugin : Plugin() {

    companion object {
        private const val SERVICE_ID = "com.baaro.app.nearby"
        private const val DEFAULT_DISPLAY_NAME = "Utilisateur BAARO"
        private const val MAX_MESSAGE_BYTES = 32 * 1024
        private const val MAX_FILE_BYTES = 20L * 1024L * 1024L
        private const val MAX_PENDING_CONNECTIONS = 3
        private const val MAX_RECENT_MESSAGE_IDS = 512
        private const val MESSAGE_PROTOCOL_VERSION = 1
        private const val PENDING_CONNECTION_TIMEOUT_MS = 60_000L
    }

    private lateinit var connectionsClient: ConnectionsClient
    private val strategy = Strategy.P2P_CLUSTER
    private val endpointNames = mutableMapOf<String, String>()
    private val pendingEndpoints = mutableSetOf<String>()
    private val requestingEndpoints = mutableSetOf<String>()
    private val pendingConnectionActions = mutableMapOf<String, NearbyPluginRules.ConnectionAction>()
    private val lostDuringDiscovery = mutableSetOf<String>()
    private val rejectedByUser = mutableSetOf<String>()
    private val connectedEndpoints = mutableMapOf<String, String>()
    private val cancelingPayloads = mutableSetOf<Long>()
    private val receivedMessageIds = mutableMapOf<String, LinkedHashSet<String>>()
    private val mainHandler = Handler(Looper.getMainLooper())
    private val pendingTimeouts = mutableMapOf<String, Runnable>()
    private var isStarting = false
    private var isStarted = false
    private var isStopping = false
    private var displayName = DEFAULT_DISPLAY_NAME
    private var sessionGeneration = 0L

    @PluginMethod
    fun getAndroidSdkVersion(call: PluginCall) {
        call.resolve(JSObject().apply { put("sdkVersion", Build.VERSION.SDK_INT) })
    }

    @PluginMethod
    fun getRequiredPermissionAliases(call: PluginCall) {
        val aliases = NearbyPluginRules.requiredPermissionAliases(Build.VERSION.SDK_INT)
        val permissions = JSArray()
        aliases.forEach { permissions.put(it) }
        call.resolve(JSObject().apply { put("permissions", permissions) })
    }

    private fun client(): ConnectionsClient {
        if (!::connectionsClient.isInitialized) {
            connectionsClient = Nearby.getConnectionsClient(context)
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

    private fun isCurrentSession(generation: Long): Boolean =
        NearbyPluginRules.isCurrentSession(
            generation,
            sessionGeneration,
            isStarting,
            isStarted,
            isStopping
        )

    private fun isDuplicateMessage(endpointId: String, messageId: String): Boolean {
        val ids = receivedMessageIds.getOrPut(endpointId) { LinkedHashSet() }
        if (!ids.add(messageId)) return true
        if (ids.size > MAX_RECENT_MESSAGE_IDS) {
            ids.iterator().apply { if (hasNext()) { next(); remove() } }
        }
        return false
    }

    private fun expirePendingConnection(endpointId: String, generation: Long) {
        pendingTimeouts.remove(endpointId)?.let(mainHandler::removeCallbacks)
        val timeout = Runnable {
            if (generation != sessionGeneration || !pendingEndpoints.remove(endpointId)) return@Runnable
            pendingConnectionActions.remove(endpointId)
            requestingEndpoints.remove(endpointId)
            rejectedByUser.add(endpointId)
            try { client().rejectConnection(endpointId) } catch (_: Exception) {}
            emit("ERROR", endpointId) {
                put("message", "La demande Nearby a expiré après une minute.")
            }
        }
        pendingTimeouts[endpointId] = timeout
        mainHandler.postDelayed(timeout, PENDING_CONNECTION_TIMEOUT_MS)
    }

    private fun payloadCallback(generation: Long) = object : PayloadCallback() {
        override fun onPayloadReceived(endpointId: String, payload: Payload) {
            if (!isCurrentSession(generation)) {
                if (payload.type == Payload.Type.FILE) {
                    client().cancelPayload(payload.id)
                    payload.asFile()?.asJavaFile()?.delete()
                }
                return
            }

            when (payload.type) {
                Payload.Type.BYTES -> {
                    val bytes = payload.asBytes() ?: return
                    if (bytes.size > MAX_MESSAGE_BYTES) {
                        emit("ERROR", endpointId) {
                            put("message", "Message Nearby refusé : taille maximale dépassée.")
                        }
                        return
                    }
                    val rawText = String(bytes, Charsets.UTF_8)
                    var text = rawText
                    var messageId: String? = null
                    var timestamp = System.currentTimeMillis()
                    try {
                        val envelope = JSONObject(rawText)
                        if (envelope.optInt("v", -1) == MESSAGE_PROTOCOL_VERSION &&
                            envelope.optString("type") == "message" && envelope.has("text")) {
                            text = envelope.optString("text")
                            messageId = envelope.optString("id").takeIf { it.isNotBlank() }
                            timestamp = envelope.optLong("ts", timestamp)
                        }
                    } catch (_: Exception) {
                        // Compatibilité avec les anciennes versions qui envoyaient du texte brut.
                    }
                    if (text.toByteArray(Charsets.UTF_8).size > MAX_MESSAGE_BYTES) {
                        emit("ERROR", endpointId) {
                            put("message", "Message Nearby refusé : taille maximale dépassée.")
                        }
                        return
                    }
                    if (messageId != null && isDuplicateMessage(endpointId, messageId)) return
                    emit("MESSAGE_RECEIVED", endpointId) {
                        put("senderName", connectedEndpoints[endpointId] ?: "Inconnu")
                        put("text", text)
                        put("timestamp", timestamp)
                        if (messageId != null) put("messageId", messageId)
                        put("protocolVersion", MESSAGE_PROTOCOL_VERSION)
                    }
                }
                Payload.Type.FILE -> {
                    val file = payload.asFile()?.asJavaFile()
                    if (file != null) {
                        // Les transferts de fichiers ne sont pas pris en charge par l'interface.
                        client().cancelPayload(payload.id)
                        file.delete()
                        emit("ERROR", endpointId) {
                            put("message", "Les transferts de fichiers Nearby ne sont pas activés.")
                        }
                    }
                }
                else -> Unit
            }
        }

        override fun onPayloadTransferUpdate(endpointId: String, update: PayloadTransferUpdate) {
            if (!isCurrentSession(generation)) return

            if (update.status == PayloadTransferUpdate.Status.IN_PROGRESS && update.totalBytes > MAX_FILE_BYTES) {
                if (cancelingPayloads.add(update.payloadId)) {
                    client().cancelPayload(update.payloadId)
                    emit("ERROR", endpointId) {
                        put("message", "Transfert Nearby annulé : taille maximale de fichier dépassée.")
                    }
                }
                return
            }
            if (update.status != PayloadTransferUpdate.Status.IN_PROGRESS) {
                cancelingPayloads.remove(update.payloadId)
            }

            if (update.status == PayloadTransferUpdate.Status.SUCCESS) {
                emit("TRANSFER_UPDATE", endpointId) {
                    put("payloadId", update.payloadId)
                    put("status", "SUCCESS")
                    put("bytesTransferred", update.bytesTransferred)
                }
            } else if (update.status == PayloadTransferUpdate.Status.IN_PROGRESS) {
                emit("TRANSFER_UPDATE", endpointId) {
                    put("payloadId", update.payloadId)
                    put("status", "IN_PROGRESS")
                    put("bytesTransferred", update.bytesTransferred)
                    put("totalBytes", update.totalBytes)
                }
            } else {
                val status = NearbyPluginRules.normalizeTransferStatus(when (update.status) {
                    PayloadTransferUpdate.Status.FAILURE -> "FAILURE"
                    PayloadTransferUpdate.Status.CANCELED -> "CANCELED"
                    else -> "UNKNOWN"
                })
                emit("TRANSFER_UPDATE", endpointId) {
                    put("payloadId", update.payloadId)
                    put("status", status)
                    put("bytesTransferred", update.bytesTransferred)
                    put("totalBytes", update.totalBytes)
                }
            }
        }
    }

    private fun connectionLifecycleCallback(generation: Long) = object : ConnectionLifecycleCallback() {
        override fun onConnectionInitiated(endpointId: String, connectionInfo: ConnectionInfo) {
            if (!isCurrentSession(generation)) return
            if (pendingEndpoints.size >= MAX_PENDING_CONNECTIONS) {
                rejectedByUser.add(endpointId)
                try {
                    client().rejectConnection(endpointId)
                } catch (_: Exception) {
                    rejectedByUser.remove(endpointId)
                }
                emit("ERROR", endpointId) {
                    put("message", "Trop de demandes Nearby en attente. Réessaie plus tard.")
                }
                return
            }
            endpointNames[endpointId] = connectionInfo.endpointName
            pendingEndpoints.add(endpointId)
            expirePendingConnection(endpointId, generation)
            emit("CONNECTION_REQUESTED", endpointId) {
                put("deviceName", connectionInfo.endpointName)
                put("authToken", connectionInfo.authenticationDigits)
            }
        }

        override fun onConnectionResult(endpointId: String, result: ConnectionResolution) {
            if (!isCurrentSession(generation)) return
            pendingEndpoints.remove(endpointId)
            pendingTimeouts.remove(endpointId)?.let(mainHandler::removeCallbacks)
            requestingEndpoints.remove(endpointId)
            pendingConnectionActions.remove(endpointId)
            val wasLostDuringDiscovery = lostDuringDiscovery.remove(endpointId)
            val wasRejectedLocally = rejectedByUser.remove(endpointId)
            if (result.status.isSuccess) {
                val name = endpointNames[endpointId] ?: "Appareil distant"
                connectedEndpoints[endpointId] = name
                emit("DEVICE_CONNECTED", endpointId) { put("deviceName", name) }
            } else {
                connectedEndpoints.remove(endpointId)
                if (!wasRejectedLocally) {
                    emit("ERROR", endpointId) {
                        put("message", "La connexion avec ${endpointNames[endpointId] ?: "l'appareil distant"} a échoué.")
                    }
                }
                endpointNames.remove(endpointId)
                if (wasLostDuringDiscovery) emit("DEVICE_LOST", endpointId)
            }
        }

        override fun onDisconnected(endpointId: String) {
            if (!isCurrentSession(generation)) return
            val name = endpointNames[endpointId]
            connectedEndpoints.remove(endpointId)
            pendingEndpoints.remove(endpointId)
            pendingTimeouts.remove(endpointId)?.let(mainHandler::removeCallbacks)
            requestingEndpoints.remove(endpointId)
            pendingConnectionActions.remove(endpointId)
            lostDuringDiscovery.remove(endpointId)
            rejectedByUser.remove(endpointId)
            endpointNames.remove(endpointId)
            emit("DEVICE_LOST", endpointId) { if (name != null) put("deviceName", name) }
        }
    }

    private fun endpointDiscoveryCallback(generation: Long) = object : EndpointDiscoveryCallback() {
        override fun onEndpointFound(endpointId: String, info: DiscoveredEndpointInfo) {
            if (!isCurrentSession(generation)) return
            lostDuringDiscovery.remove(endpointId)
            endpointNames[endpointId] = info.endpointName
            emit("DEVICE_FOUND", endpointId) {
                put("deviceName", info.endpointName)
                put("serviceId", info.serviceId)
            }
        }

        override fun onEndpointLost(endpointId: String) {
            if (!isCurrentSession(generation)) return
            when (NearbyPluginRules.discoveryLossAction(
                    endpointId,
                    connectedEndpoints,
                    pendingEndpoints,
                    requestingEndpoints
                )) {
                NearbyPluginRules.DiscoveryLossAction.IGNORE -> return
                NearbyPluginRules.DiscoveryLossAction.DEFER -> {
                    lostDuringDiscovery.add(endpointId)
                    return
                }
                NearbyPluginRules.DiscoveryLossAction.EMIT -> Unit
            }

            endpointNames.remove(endpointId)
            emit("DEVICE_LOST", endpointId)
        }
    }

    private fun failStart(call: PluginCall, generation: Long, message: String) {
        if (generation == sessionGeneration) {
            try { client().stopAdvertising() } catch (_: Exception) {}
            try { client().stopDiscovery() } catch (_: Exception) {}
            try { client().stopAllEndpoints() } catch (_: Exception) {}
            clearConnectionState()
            isStarting = false
            isStarted = false
        }
        call.reject(message)
    }

    @PluginMethod
    fun requestConnection(call: PluginCall) {
        val endpointId = call.getString("endpointId")?.trim()
        if (endpointId.isNullOrEmpty()) { call.reject("endpointId manquant."); return }
        if (!isStarted || isStopping) { call.reject("Nearby n'est pas démarré."); return }
        if (!endpointNames.containsKey(endpointId)) { call.reject("Cet appareil n'est plus disponible."); return }
        if (connectedEndpoints.containsKey(endpointId)) {
            call.resolve(JSObject().apply { put("success", true); put("alreadyConnected", true) })
            return
        }
        if (!NearbyPluginRules.reserveConnectionRequest(pendingEndpoints, requestingEndpoints, endpointId)) {
            call.reject("Une demande de connexion est déjà en cours pour cet appareil.")
            return
        }

        lostDuringDiscovery.remove(endpointId)
        val generation = sessionGeneration
        try {
            client().requestConnection(displayName, endpointId, connectionLifecycleCallback(generation))
                .addOnSuccessListener {
                    call.resolve(JSObject().apply { put("success", true) })
                }
                .addOnFailureListener { error ->
                    if (generation == sessionGeneration) {
                        pendingTimeouts.remove(endpointId)?.let(mainHandler::removeCallbacks)
                        requestingEndpoints.remove(endpointId)
                        if (lostDuringDiscovery.remove(endpointId)) {
                            endpointNames.remove(endpointId)
                            emit("DEVICE_LOST", endpointId)
                        }
                    }
                    call.reject("Impossible de demander la connexion : ${error.message}")
                }
        } catch (error: Exception) {
            if (generation == sessionGeneration) {
                pendingTimeouts.remove(endpointId)?.let(mainHandler::removeCallbacks)
                requestingEndpoints.remove(endpointId)
                if (lostDuringDiscovery.remove(endpointId)) {
                    endpointNames.remove(endpointId)
                    emit("DEVICE_LOST", endpointId)
                }
            }
            call.reject("Impossible de demander la connexion : ${error.message}")
        }
    }

    @PluginMethod
    fun start(call: PluginCall) {
        if (isStarting || isStopping) { call.reject("Une opération Nearby est déjà en cours."); return }
        if (isStarted) { call.resolve(JSObject().apply { put("success", true); put("alreadyStarted", true) }); return }

        displayName = call.getString("displayName")?.trim()?.takeIf { it.isNotEmpty() }?: DEFAULT_DISPLAY_NAME
        sessionGeneration += 1
        val generation = sessionGeneration
        val lifecycleCallback = connectionLifecycleCallback(generation)
        isStarting = true

        try {
            val advertisingOptions = AdvertisingOptions.Builder().setStrategy(strategy).build()
            client().startAdvertising(displayName, SERVICE_ID, lifecycleCallback, advertisingOptions)
                .addOnSuccessListener {
                    try {
                        val discoveryOptions = DiscoveryOptions.Builder().setStrategy(strategy).build()
                        client().startDiscovery(SERVICE_ID, endpointDiscoveryCallback(generation), discoveryOptions)
                            .addOnSuccessListener {
                                if (generation == sessionGeneration) {
                                    isStarting = false
                                    isStarted = true
                                    call.resolve(JSObject().apply { put("success", true) })
                                    emit("STARTED")
                                }
                            }
                            .addOnFailureListener { error ->
                                failStart(call, generation, "Échec de la découverte Nearby : ${error.message}")
                            }
                    } catch (error: Exception) {
                        failStart(call, generation, "Échec de la découverte Nearby : ${error.message}")
                    }
                }
                .addOnFailureListener { error ->
                    failStart(call, generation, "Échec de la diffusion Nearby : ${error.message}")
                }
        } catch (error: Exception) {
            failStart(call, generation, "Échec de la diffusion Nearby : ${error.message}")
        }
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        if (isStopping) { call.reject("L'arrêt de Nearby est déjà en cours."); return }
        if (isStarting) { call.reject("Nearby est en cours de démarrage. Réessaie après sa fin."); return }
        isStopping = true
        sessionGeneration += 1

        if (!::connectionsClient.isInitialized) {
            clearConnectionState(); isStarted = false; isStarting = false; isStopping = false
            call.resolve(JSObject().apply { put("success", true) }); return
        }

        val stopTasks = mutableListOf<Task<Void>>()
        val synchronousErrors = mutableListOf<String>()

        fun collectStopTask(name: String, action: () -> Task<Void>) {
            try {
                stopTasks += action()
            } catch (error: Exception) {
                synchronousErrors += "$name: ${error.message ?: "échec inconnu"}"
            }
        }

        collectStopTask("diffusion") { client().stopAdvertising() }
        collectStopTask("découverte") { client().stopDiscovery() }
        collectStopTask("endpoints") { client().stopAllEndpoints() }

        fun finishStop(errorMessage: String? = null) {
            clearConnectionState()
            isStarted = false; isStarting = false; isStopping = false
            if (errorMessage != null) {
                emit("ERROR") { put("message", "Échec de l'arrêt Nearby : $errorMessage") }
                call.reject("Échec de l'arrêt Nearby : $errorMessage")
            } else {
                emit("STOPPED")
                call.resolve(JSObject().apply { put("success", true) })
            }
        }

        val finished = AtomicBoolean(false)
        fun finishOnce(errorMessage: String? = null) {
            if (finished.compareAndSet(false, true)) finishStop(errorMessage)
        }

        Tasks.whenAllComplete(stopTasks)
            .addOnSuccessListener { completedTasks ->
                val asynchronousErrors = completedTasks.mapIndexedNotNull { index, task ->
                    task.exception?.let { error ->
                        "tâche-${index + 1}: ${error.message ?: "échec inconnu"}"
                    }
                }
                finishOnce(
                    NearbyPluginRules.combineStopErrors(
                        synchronousErrors,
                        asynchronousErrors
                    )
                )
            }
            .addOnFailureListener { error ->
                finishOnce(
                    NearbyPluginRules.combineStopErrors(
                        synchronousErrors,
                        emptyList(),
                        error.message ?: "une tâche d'arrêt a échoué"
                    )
                )
            }
    }

    private fun clearConnectionState() {
        connectedEndpoints.clear()
        pendingEndpoints.clear()
        requestingEndpoints.clear()
        pendingConnectionActions.clear()
        lostDuringDiscovery.clear()
        rejectedByUser.clear()
        endpointNames.clear()
        cancelingPayloads.clear()
        pendingTimeouts.values.forEach(mainHandler::removeCallbacks)
        pendingTimeouts.clear()
        receivedMessageIds.clear()
    }

    @PluginMethod
    fun send(call: PluginCall) {
        val text = call.getString("text")
        if (text.isNullOrBlank()) { call.reject("Le message ne peut pas être vide."); return }
        if (!::connectionsClient.isInitialized ||!isStarted || isStopping) { call.reject("Nearby n'est pas démarré."); return }

        val requestedEndpoint = call.getString("endpointId")
        val targets = try {
            NearbyPluginRules.selectSendTargets(connectedEndpoints, requestedEndpoint)
        } catch (error: IllegalArgumentException) {
            call.reject(error.message ?: "Cet appareil n'est pas connecté.")
            return
        }

        if (targets.isEmpty()) { call.reject("Aucun appareil Nearby n'est connecté."); return }

        val messageId = call.getString("messageId")?.trim()?.takeIf { it.isNotEmpty() }
        val protocolVersion = call.getInt("protocolVersion") ?: MESSAGE_PROTOCOL_VERSION
        val payloadText = JSONObject()
            .put("v", protocolVersion)
            .put("id", messageId ?: "")
            .put("type", "message")
            .put("text", text)
            .put("ts", System.currentTimeMillis())
            .toString()
        val bytes = payloadText.toByteArray(Charsets.UTF_8)
        if (bytes.size > MAX_MESSAGE_BYTES) {
            call.reject("Le message Nearby dépasse la taille maximale de 32 Ko.")
            return
        }
        try {
            val payload = Payload.fromBytes(bytes)
            client().sendPayload(targets, payload)
                .addOnSuccessListener {
                    call.resolve(JSObject().apply {
                        put("success", true)
                        put("sentTo", targets.size)
                        if (messageId != null) put("messageId", messageId)
                    })
                }
                .addOnFailureListener { error ->
                    call.reject("Échec de l'envoi Nearby : ${error.message}")
                }
        } catch (error: Exception) {
            call.reject("Échec de l'envoi Nearby : ${error.message}")
        }
    }

    @PluginMethod
    fun accept(call: PluginCall) {
        val endpointId = call.getString("endpointId")
        if (endpointId.isNullOrBlank()) { call.reject("endpointId manquant."); return }
        if (!isStarted || isStopping) { call.reject("Nearby n'est pas démarré."); return }
        if (call.getBoolean("authenticationConfirmed", false) != true) {
            call.reject("Confirme d'abord que le code Nearby correspond sur les deux appareils.")
            return
        }
        if (!pendingEndpoints.contains(endpointId)) { call.reject("Aucune demande en attente pour cet appareil."); return }
        if (!NearbyPluginRules.reserveConnectionAction(
                pendingConnectionActions,
                endpointId,
                NearbyPluginRules.ConnectionAction.ACCEPT
            )
        ) {
            call.reject("Une action est déjà en cours pour cette demande Nearby.")
            return
        }

        val generation = sessionGeneration
        try {
            client().acceptConnection(endpointId, payloadCallback(generation))
                .addOnSuccessListener { call.resolve(JSObject().apply { put("success", true) }) }
                .addOnFailureListener { error ->
                    if (generation == sessionGeneration) pendingConnectionActions.remove(endpointId)
                    call.reject("Impossible d'accepter : ${error.message}")
                }
        } catch (error: Exception) {
            if (generation == sessionGeneration) pendingConnectionActions.remove(endpointId)
            call.reject("Impossible d'accepter : ${error.message}")
        }
    }

    @PluginMethod
    fun reject(call: PluginCall) {
        val endpointId = call.getString("endpointId")
        if (endpointId.isNullOrBlank()) { call.reject("endpointId manquant."); return }
        if (!isStarted || isStopping) { call.reject("Nearby n'est pas démarré."); return }
        if (!pendingEndpoints.contains(endpointId)) { call.reject("Aucune demande en attente pour cet appareil."); return }
        if (!NearbyPluginRules.reserveConnectionAction(
                pendingConnectionActions,
                endpointId,
                NearbyPluginRules.ConnectionAction.REJECT
            )
        ) {
            call.reject("Une action est déjà en cours pour cette demande Nearby.")
            return
        }

        val generation = sessionGeneration
        rejectedByUser.add(endpointId)
        try {
            client().rejectConnection(endpointId)
                .addOnSuccessListener {
                    if (generation == sessionGeneration) {
                        pendingTimeouts.remove(endpointId)?.let(mainHandler::removeCallbacks)
                        pendingEndpoints.remove(endpointId)
                        connectedEndpoints.remove(endpointId)
                        pendingConnectionActions.remove(endpointId)
                        endpointNames.remove(endpointId)
                    }
                    call.resolve(JSObject().apply { put("success", true) })
                }
                .addOnFailureListener { error ->
                    if (generation == sessionGeneration) {
                        pendingTimeouts.remove(endpointId)?.let(mainHandler::removeCallbacks)
                        pendingConnectionActions.remove(endpointId)
                        rejectedByUser.remove(endpointId)
                    }
                    call.reject("Impossible de refuser : ${error.message}")
                }
        } catch (error: Exception) {
            if (generation == sessionGeneration) {
                pendingTimeouts.remove(endpointId)?.let(mainHandler::removeCallbacks)
                pendingConnectionActions.remove(endpointId)
                rejectedByUser.remove(endpointId)
            }
            call.reject("Impossible de refuser : ${error.message}")
        }
    }

    @PluginMethod
    fun getConnectedDevices(call: PluginCall) {
        val devices = JSObject()
        connectedEndpoints.forEach { (id, name) ->
            devices.put(id, name)
        }
        call.resolve(JSObject().apply {
            put("success", true)
            put("devices", devices)
            put("count", connectedEndpoints.size)
        })
    }
}
