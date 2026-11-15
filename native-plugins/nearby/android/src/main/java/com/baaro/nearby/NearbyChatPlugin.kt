package com.baaro.nearby

import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
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
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.ParcelFileDescriptor
import android.provider.OpenableColumns
import android.webkit.MimeTypeMap
import androidx.activity.result.ActivityResult
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

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
            strings = [Manifest.permission.RECORD_AUDIO],
            alias = "microphone"
        ),
        Permission(
            strings = [Manifest.permission.ACCESS_COARSE_LOCATION],
            alias = "locationCoarse"
        ),
        Permission(
            strings = [
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION
            ],
            alias = "locationFine"
        )
    ]
)
class NearbyChatPlugin : Plugin() {

    companion object {
        private const val SERVICE_ID = "com.baaro.app.nearby"
        private const val DEFAULT_DISPLAY_NAME = "Utilisateur BAARO"
        private const val MAX_MESSAGE_BYTES = 32 * 1024
        private const val MAX_FILE_BYTES = NearbyPluginRules.MAX_FILE_BYTES
        private const val MAX_INCOMING_FILES = 4
        private const val MAX_PICKED_FILES = 8
        private const val RECEIVED_DIR = "nearby_received"
        private const val CALL_RING_TIMEOUT_MS = 45_000L
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

    private class FileMeta(val name: String, val mime: String, val size: Long)
    private class PickedFile(val name: String, val mime: String, val size: Long)
    private class OutgoingFile(val meta: FileMeta, val descriptor: ParcelFileDescriptor)

    // Fichiers choisis par l'utilisateur : seuls ces URI peuvent être envoyés.
    private val pickedFiles = LinkedHashMap<String, PickedFile>()
    private val outgoingFiles = mutableMapOf<Long, OutgoingFile>()
    private val incomingFiles = mutableMapOf<Long, Payload>()
    private val incomingEndpoints = mutableMapOf<Long, String>()
    private val incomingMeta = mutableMapOf<Long, FileMeta>()
    private val incomingCompleted = mutableSetOf<Long>()
    private val rejectedIncoming = mutableSetOf<Long>()
    private val ioExecutor: ExecutorService by lazy { Executors.newSingleThreadExecutor() }

    private class CallState(
        val id: String,
        val endpointId: String,
        val media: String,
        val incoming: Boolean,
        var active: Boolean = false
    )

    private var currentCall: CallState? = null
    private var callTimeout: Runnable? = null
    private val voiceRecorder by lazy { VoiceRecorder(context) }
    private val callAudio by lazy { CallAudio(context) }
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
        if (endpointId != null) event.put("endpointId", endpointId)
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

    // ───────────── Transfert de fichiers ─────────────

    private fun receivedDir(): File =
        File(context.filesDir, RECEIVED_DIR).also { if (!it.exists()) it.mkdirs() }

    /** Supprime le fichier temporaire créé par Nearby pour un payload reçu. */
    private fun deletePayloadFile(payload: Payload) {
        val file = payload.asFile() ?: return
        try {
            val uri = if (Build.VERSION.SDK_INT >= 29) file.asUri() else null
            if (uri != null) {
                context.contentResolver.delete(uri, null, null)
            } else {
                @Suppress("DEPRECATION")
                file.asJavaFile()?.delete()
            }
        } catch (_: Exception) {
            // Nettoyage au mieux : un fichier temporaire restant n'est pas bloquant.
        }
    }

    private fun closeOutgoing(payloadId: Long) {
        outgoingFiles.remove(payloadId)?.let {
            try { it.descriptor.close() } catch (_: Exception) {}
        }
    }

    private fun discardIncoming(payloadId: Long) {
        incomingFiles.remove(payloadId)?.let(::deletePayloadFile)
        incomingEndpoints.remove(payloadId)
        incomingMeta.remove(payloadId)
        incomingCompleted.remove(payloadId)
        rejectedIncoming.remove(payloadId)
    }

    private fun clearFileTransfers() {
        outgoingFiles.keys.toList().forEach(::closeOutgoing)
        incomingFiles.keys.toList().forEach(::discardIncoming)
        incomingMeta.clear()
        incomingCompleted.clear()
        rejectedIncoming.clear()
        pickedFiles.clear()
    }

    /** Métadonnées envoyées par l'expéditeur avant le fichier : nom, type et taille annoncés. */
    private fun handleFileMetadata(endpointId: String, envelope: JSONObject) {
        val payloadId = envelope.optString("id").toLongOrNull()
        val size = envelope.optLong("size", -1L)
        if (payloadId == null) return

        if (!NearbyPluginRules.isFileSizeAllowed(size)) {
            rejectedIncoming.add(payloadId)
            if (incomingFiles.containsKey(payloadId)) {
                client().cancelPayload(payloadId)
                discardIncoming(payloadId)
            }
            emit("ERROR", endpointId) {
                put("message", "Fichier Nearby refusé : taille maximale de 20 Mo dépassée.")
            }
            return
        }
        // Écarte les métadonnées orphelines (fichier annulé avant l'arrivée de ses métadonnées).
        while (incomingMeta.size >= MAX_INCOMING_FILES) {
            incomingMeta.remove(incomingMeta.keys.first())
        }

        incomingMeta[payloadId] = FileMeta(
            name = NearbyPluginRules.sanitizeFileName(envelope.optString("name")),
            mime = envelope.optString("mime").ifBlank { "application/octet-stream" }.take(100),
            size = size
        )
        // Le fichier peut déjà être arrivé en entier avant ses métadonnées.
        if (payloadId in incomingCompleted) tryFinalizeIncoming(payloadId, sessionGeneration)
    }

    /** Copie le fichier reçu dans le stockage de l'application, puis avertit l'interface. */
    private fun tryFinalizeIncoming(payloadId: Long, generation: Long) {
        val payload = incomingFiles[payloadId] ?: return
        val meta = incomingMeta[payloadId] ?: return
        if (payloadId !in incomingCompleted) return
        val endpointId = incomingEndpoints[payloadId] ?: return
        val senderName = connectedEndpoints[endpointId] ?: "Inconnu"

        incomingFiles.remove(payloadId)
        incomingCompleted.remove(payloadId)
        incomingEndpoints.remove(payloadId)
        incomingMeta.remove(payloadId)

        ioExecutor.execute {
            var destination: File? = null
            var errorMessage: String? = null
            try {
                val file = payload.asFile()
                val uri = if (Build.VERSION.SDK_INT >= 29) file?.asUri() else null
                @Suppress("DEPRECATION")
                val source = when {
                    uri != null -> context.contentResolver.openInputStream(uri)
                    else -> file?.asJavaFile()?.inputStream()
                } ?: throw IllegalStateException("Fichier reçu illisible.")

                val dir = receivedDir()
                val name = NearbyPluginRules.uniqueFileName(meta.name) { File(dir, it).exists() }
                val target = File(dir, name)
                destination = target
                var copied = 0L
                source.use { input ->
                    target.outputStream().use { output ->
                        val buffer = ByteArray(64 * 1024)
                        while (true) {
                            val read = input.read(buffer)
                            if (read < 0) break
                            copied += read
                            if (copied > MAX_FILE_BYTES) throw IllegalStateException("Fichier trop volumineux.")
                            output.write(buffer, 0, read)
                        }
                    }
                }
                if (copied != meta.size) throw IllegalStateException("Fichier incomplet ou altéré.")
            } catch (error: Exception) {
                destination?.delete()
                destination = null
                errorMessage = "Impossible d'enregistrer le fichier reçu : ${error.message}"
            } finally {
                deletePayloadFile(payload)
            }

            val saved = destination
            mainHandler.post {
                if (generation != sessionGeneration) {
                    saved?.delete()
                    return@post
                }
                if (saved != null) {
                    emit("FILE_RECEIVED", endpointId) {
                        put("payloadId", payloadId.toString())
                        put("senderName", senderName)
                        put("fileName", saved.name)
                        put("mimeType", meta.mime)
                        put("size", saved.length())
                        put("path", saved.absolutePath)
                        put("timestamp", System.currentTimeMillis())
                    }
                } else {
                    emit("ERROR", endpointId) { put("message", errorMessage ?: "Fichier reçu invalide.") }
                }
            }
        }
    }

    // ───────────── Appels (vocal / vidéo) ─────────────

    private fun hasMicrophonePermission(): Boolean =
        ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) ==
            PackageManager.PERMISSION_GRANTED

    private fun sendControl(endpointId: String, envelope: JSONObject, onFailure: (Exception) -> Unit = {}) {
        try {
            client().sendPayload(listOf(endpointId), Payload.fromBytes(envelope.toString().toByteArray(Charsets.UTF_8)))
                .addOnFailureListener { onFailure(it) }
        } catch (error: Exception) {
            onFailure(error)
        }
    }

    private fun callEnvelope(action: String, call: CallState, reason: String? = null): JSONObject =
        JSONObject()
            .put("v", MESSAGE_PROTOCOL_VERSION)
            .put("type", "call")
            .put("action", action)
            .put("id", call.id)
            .put("media", call.media)
            .apply { if (reason != null) put("reason", reason) }

    private fun emitCallState(call: CallState) {
        val state = when {
            call.active -> "active"
            call.incoming -> "ringing_in"
            else -> "ringing_out"
        }
        emit("CALL_STATE", call.endpointId) {
            put("callId", call.id)
            put("media", call.media)
            put("state", state)
            put("incoming", call.incoming)
            put("deviceName", connectedEndpoints[call.endpointId] ?: endpointNames[call.endpointId] ?: "Appareil")
        }
    }

    private fun scheduleCallTimeout(call: CallState) {
        callTimeout?.let(mainHandler::removeCallbacks)
        val timeout = Runnable {
            val current = currentCall
            if (current == null || current.id != call.id || current.active) return@Runnable
            // L'appelant prévient l'autre appareil ; l'appelé abandonne simplement la sonnerie.
            finishCall("timeout", notifyPeer = !current.incoming)
        }
        callTimeout = timeout
        mainHandler.postDelayed(timeout, CALL_RING_TIMEOUT_MS)
    }

    /** Démarre l'audio : envoie notre flux micro et joue celui de l'autre appareil à son arrivée. */
    private fun activateCall(call: CallState) {
        callTimeout?.let(mainHandler::removeCallbacks)
        callTimeout = null
        try {
            val stream = callAudio.start()
            call.active = true
            client().sendPayload(listOf(call.endpointId), Payload.fromStream(stream))
                .addOnFailureListener { error ->
                    emit("ERROR", call.endpointId) {
                        put("message", "Flux audio impossible : ${error.message}")
                    }
                    if (currentCall?.id == call.id) finishCall("error", notifyPeer = true)
                }
            emitCallState(call)
        } catch (error: Exception) {
            emit("ERROR", call.endpointId) {
                put("message", "Impossible de démarrer l'audio : ${error.message}")
            }
            finishCall("error", notifyPeer = true)
        }
    }

    private fun finishCall(reason: String, notifyPeer: Boolean) {
        val call = currentCall ?: return
        currentCall = null
        callTimeout?.let(mainHandler::removeCallbacks)
        callTimeout = null
        if (notifyPeer) sendControl(call.endpointId, callEnvelope("end", call, reason))
        callAudio.stop()
        emit("CALL_ENDED", call.endpointId) {
            put("callId", call.id)
            put("reason", reason)
        }
    }

    /** Arrêt silencieux (arrêt de Nearby) : pas d'événement, pas de message à l'autre appareil. */
    private fun teardownCallAndVoice() {
        callTimeout?.let(mainHandler::removeCallbacks)
        callTimeout = null
        currentCall = null
        callAudio.stop()
        voiceRecorder.cancel()
    }

    private fun handleCallControl(endpointId: String, envelope: JSONObject) {
        val id = envelope.optString("id")
        if (id.isBlank()) return
        val media = NearbyPluginRules.parseCallMedia(envelope.optString("media"))
        val current = currentCall

        when (envelope.optString("action")) {
            "invite" -> {
                if (current != null || voiceRecorder.isRecording) {
                    val busy = CallState(id, endpointId, media, incoming = true)
                    sendControl(endpointId, callEnvelope("reject", busy, "busy"))
                    return
                }
                val call = CallState(id, endpointId, media, incoming = true)
                currentCall = call
                scheduleCallTimeout(call)
                emitCallState(call)
            }
            "accept" -> {
                if (current == null || current.id != id || current.endpointId != endpointId ||
                    current.incoming || current.active) return
                activateCall(current)
            }
            "reject" -> {
                if (current == null || current.id != id || current.endpointId != endpointId) return
                val reason = if (envelope.optString("reason") == "busy") "busy" else "rejected"
                finishCall(reason, notifyPeer = false)
            }
            "end" -> {
                if (current == null || current.id != id || current.endpointId != endpointId) return
                finishCall("remote", notifyPeer = false)
            }
        }
    }

    private fun handleVideoFrame(endpointId: String, envelope: JSONObject) {
        val call = currentCall ?: return
        if (!call.active || call.media != "video" || call.endpointId != endpointId) return
        if (envelope.optString("id") != call.id) return
        val data = envelope.optString("data")
        if (!NearbyPluginRules.isVideoFrameAllowed(data)) return
        emit("VIDEO_FRAME", endpointId) {
            put("callId", call.id)
            put("data", data)
        }
    }

    private fun payloadCallback(generation: Long) = object : PayloadCallback() {
        override fun onPayloadReceived(endpointId: String, payload: Payload) {
            if (!isCurrentSession(generation)) {
                if (payload.type == Payload.Type.FILE) {
                    client().cancelPayload(payload.id)
                    deletePayloadFile(payload)
                } else if (payload.type == Payload.Type.STREAM) {
                    client().cancelPayload(payload.id)
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
                    val controlEnvelope = try {
                        JSONObject(rawText).takeIf { it.optString("type") in setOf("file", "call", "vframe") }
                    } catch (_: Exception) {
                        null
                    }
                    if (controlEnvelope != null) {
                        when (controlEnvelope.optString("type")) {
                            "file" -> handleFileMetadata(endpointId, controlEnvelope)
                            "call" -> handleCallControl(endpointId, controlEnvelope)
                            "vframe" -> handleVideoFrame(endpointId, controlEnvelope)
                        }
                        return
                    }
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
                    if (payload.id in rejectedIncoming || incomingFiles.size >= MAX_INCOMING_FILES) {
                        rejectedIncoming.remove(payload.id)
                        client().cancelPayload(payload.id)
                        deletePayloadFile(payload)
                        emit("ERROR", endpointId) {
                            put("message", "Fichier Nearby refusé.")
                        }
                        return
                    }
                    incomingFiles[payload.id] = payload
                    incomingEndpoints[payload.id] = endpointId
                }
                Payload.Type.STREAM -> {
                    val call = currentCall
                    val input = payload.asStream()?.asInputStream()
                    if (call == null || !call.active || call.endpointId != endpointId || input == null) {
                        client().cancelPayload(payload.id)
                        try { input?.close() } catch (_: Exception) {}
                        return
                    }
                    callAudio.play(input)
                }
                else -> Unit
            }
        }

        override fun onPayloadTransferUpdate(endpointId: String, update: PayloadTransferUpdate) {
            if (!isCurrentSession(generation)) return

            val id = update.payloadId
            // Les messages texte (BYTES) ne sont pas des transferts de fichiers.
            val isFile = id in outgoingFiles || id in incomingFiles || id in incomingMeta
            if (!isFile) {
                cancelingPayloads.remove(id)
                return
            }

            if (update.status == PayloadTransferUpdate.Status.IN_PROGRESS && update.totalBytes > MAX_FILE_BYTES) {
                if (cancelingPayloads.add(id)) {
                    client().cancelPayload(id)
                    emit("ERROR", endpointId) {
                        put("message", "Transfert Nearby annulé : taille maximale de fichier dépassée.")
                    }
                }
                return
            }
            if (update.status != PayloadTransferUpdate.Status.IN_PROGRESS) {
                cancelingPayloads.remove(id)
            }

            val status = when (update.status) {
                PayloadTransferUpdate.Status.SUCCESS -> "SUCCESS"
                PayloadTransferUpdate.Status.IN_PROGRESS -> "IN_PROGRESS"
                PayloadTransferUpdate.Status.FAILURE -> "FAILURE"
                PayloadTransferUpdate.Status.CANCELED -> "CANCELED"
                else -> "UNKNOWN"
            }.let(NearbyPluginRules::normalizeTransferStatus)

            val outgoing = outgoingFiles[id]
            val meta = outgoing?.meta ?: incomingMeta[id]
            emit("TRANSFER_UPDATE", endpointId) {
                put("payloadId", id.toString())
                put("status", status)
                put("bytesTransferred", update.bytesTransferred)
                put("totalBytes", update.totalBytes)
                put("direction", if (outgoing != null) "outgoing" else "incoming")
                if (meta != null) {
                    put("fileName", meta.name)
                    put("mimeType", meta.mime)
                }
            }

            when (status) {
                "SUCCESS" -> {
                    if (outgoing != null) {
                        closeOutgoing(id)
                    } else {
                        incomingCompleted.add(id)
                        tryFinalizeIncoming(id, generation)
                    }
                }
                "IN_PROGRESS" -> Unit
                else -> {
                    if (outgoing != null) closeOutgoing(id) else discardIncoming(id)
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
            if (currentCall?.endpointId == endpointId) finishCall("lost", notifyPeer = false)
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

        displayName = call.getString("displayName")?.trim()?.takeIf { it.isNotEmpty() } ?: DEFAULT_DISPLAY_NAME
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

        // stopAdvertising(), stopDiscovery() et stopAllEndpoints() sont synchrones (void).
        val errors = mutableListOf<String>()

        fun stopStep(name: String, action: () -> Unit) {
            try {
                action()
            } catch (error: Exception) {
                errors += "$name: ${error.message ?: "échec inconnu"}"
            }
        }

        stopStep("diffusion") { client().stopAdvertising() }
        stopStep("découverte") { client().stopDiscovery() }
        stopStep("endpoints") { client().stopAllEndpoints() }

        clearConnectionState()
        isStarted = false; isStarting = false; isStopping = false

        val errorMessage = NearbyPluginRules.combineStopErrors(errors, emptyList<String>())
        if (errorMessage != null) {
            emit("ERROR") { put("message", "Échec de l'arrêt Nearby : $errorMessage") }
            call.reject("Échec de l'arrêt Nearby : $errorMessage")
        } else {
            emit("STOPPED")
            call.resolve(JSObject().apply { put("success", true) })
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
        clearFileTransfers()
        teardownCallAndVoice()
        pendingTimeouts.values.forEach(mainHandler::removeCallbacks)
        pendingTimeouts.clear()
        receivedMessageIds.clear()
    }

    @PluginMethod
    fun send(call: PluginCall) {
        val text = call.getString("text")
        if (text.isNullOrBlank()) { call.reject("Le message ne peut pas être vide."); return }
        if (!::connectionsClient.isInitialized || !isStarted || isStopping) { call.reject("Nearby n'est pas démarré."); return }

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

    // ───────────── Méthodes Capacitor : fichiers ─────────────

    @PluginMethod
    fun pickFile(call: PluginCall) {
        val kind = call.getString("kind")
        val mimeTypes = try {
            NearbyPluginRules.pickerMimeTypes(kind)
        } catch (error: IllegalArgumentException) {
            call.reject(error.message ?: "Type de fichier non pris en charge.")
            return
        }
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = if (mimeTypes.size == 1) mimeTypes[0] else "*/*"
            if (mimeTypes.size > 1) putExtra(Intent.EXTRA_MIME_TYPES, mimeTypes)
            putExtra(Intent.EXTRA_ALLOW_MULTIPLE, false)
        }
        try {
            startActivityForResult(call, intent, "pickFileResult")
        } catch (error: ActivityNotFoundException) {
            call.reject("Aucun sélecteur de fichiers disponible sur cet appareil.")
        }
    }

    @ActivityCallback
    private fun pickFileResult(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        if (result.resultCode != Activity.RESULT_OK) {
            call.resolve(JSObject().apply { put("cancelled", true) })
            return
        }
        val uri = result.data?.data
        if (uri == null) { call.reject("Aucun fichier sélectionné."); return }

        var name: String? = null
        var size = -1L
        try {
            context.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
                if (cursor.moveToFirst()) {
                    val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                    val sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE)
                    if (nameIndex >= 0 && !cursor.isNull(nameIndex)) name = cursor.getString(nameIndex)
                    if (sizeIndex >= 0 && !cursor.isNull(sizeIndex)) size = cursor.getLong(sizeIndex)
                }
            }
            if (size <= 0) {
                context.contentResolver.openFileDescriptor(uri, "r")?.use { size = it.statSize }
            }
        } catch (error: Exception) {
            call.reject("Impossible de lire ce fichier : ${error.message}")
            return
        }

        if (size <= 0) { call.reject("Fichier vide ou illisible."); return }
        if (!NearbyPluginRules.isFileSizeAllowed(size)) {
            call.reject("Ce fichier dépasse la limite de 20 Mo.")
            return
        }

        val mime = context.contentResolver.getType(uri)?.takeIf { it.isNotBlank() } ?: "application/octet-stream"
        val kind = call.getString("kind")
        if ((kind == "image" && !mime.startsWith("image/")) || (kind == "video" && !mime.startsWith("video/"))) {
            call.reject(if (kind == "image") "Choisis une photo." else "Choisis une vidéo.")
            return
        }

        val safeName = NearbyPluginRules.sanitizeFileName(name)
        pickedFiles[uri.toString()] = PickedFile(safeName, mime, size)
        while (pickedFiles.size > MAX_PICKED_FILES) {
            pickedFiles.remove(pickedFiles.keys.first())
        }
        call.resolve(JSObject().apply {
            put("cancelled", false)
            put("uri", uri.toString())
            put("name", safeName)
            put("mimeType", mime)
            put("size", size)
        })
    }

    @PluginMethod
    fun sendFile(call: PluginCall) {
        if (!::connectionsClient.isInitialized || !isStarted || isStopping) { call.reject("Nearby n'est pas démarré."); return }

        val uriString = call.getString("uri")
        val picked = uriString?.let { pickedFiles[it] }
        if (uriString == null || picked == null) {
            call.reject("Choisis d'abord un fichier avec le sélecteur.")
            return
        }

        val requested = call.getString("endpointId")?.trim().orEmpty()
        val endpointId = when {
            requested.isNotEmpty() -> requested
            connectedEndpoints.size == 1 -> connectedEndpoints.keys.first()
            connectedEndpoints.isEmpty() -> { call.reject("Aucun appareil Nearby n'est connecté."); return }
            else -> { call.reject("Choisis l'appareil destinataire du fichier."); return }
        }
        if (!connectedEndpoints.containsKey(endpointId)) { call.reject("Cet appareil n'est pas connecté."); return }
        if (!NearbyPluginRules.isFileSizeAllowed(picked.size)) { call.reject("Ce fichier dépasse la limite de 20 Mo."); return }

        val descriptor = try {
            context.contentResolver.openFileDescriptor(Uri.parse(uriString), "r")
        } catch (error: Exception) {
            null
        }
        if (descriptor == null) { call.reject("Impossible d'ouvrir le fichier."); return }
        if (descriptor.statSize > MAX_FILE_BYTES) {
            descriptor.close()
            call.reject("Ce fichier dépasse la limite de 20 Mo.")
            return
        }

        val payload = Payload.fromFile(descriptor)
        val payloadId = payload.id
        val meta = FileMeta(picked.name, picked.mime, picked.size)
        outgoingFiles[payloadId] = OutgoingFile(meta, descriptor)
        pickedFiles.remove(uriString)

        val metadata = JSONObject()
            .put("v", MESSAGE_PROTOCOL_VERSION)
            .put("type", "file")
            .put("id", payloadId.toString())
            .put("name", meta.name)
            .put("mime", meta.mime)
            .put("size", meta.size)
            .put("ts", System.currentTimeMillis())
            .toString()
            .toByteArray(Charsets.UTF_8)

        fun fail(message: String) {
            closeOutgoing(payloadId)
            call.reject(message)
        }

        try {
            // Les métadonnées partent d'abord ; le destinataire gère aussi l'ordre inverse.
            client().sendPayload(listOf(endpointId), Payload.fromBytes(metadata))
                .addOnSuccessListener {
                    try {
                        client().sendPayload(listOf(endpointId), payload)
                            .addOnSuccessListener {
                                call.resolve(JSObject().apply {
                                    put("success", true)
                                    put("payloadId", payloadId.toString())
                                    put("endpointId", endpointId)
                                    put("fileName", meta.name)
                                    put("mimeType", meta.mime)
                                    put("size", meta.size)
                                })
                            }
                            .addOnFailureListener { error -> fail("Échec de l'envoi du fichier : ${error.message}") }
                    } catch (error: Exception) {
                        fail("Échec de l'envoi du fichier : ${error.message}")
                    }
                }
                .addOnFailureListener { error -> fail("Échec de l'envoi du fichier : ${error.message}") }
        } catch (error: Exception) {
            fail("Échec de l'envoi du fichier : ${error.message}")
        }
    }

    @PluginMethod
    fun cancelTransfer(call: PluginCall) {
        val payloadId = call.getString("payloadId")?.toLongOrNull()
        if (payloadId == null) { call.reject("Identifiant de transfert invalide."); return }
        if (!::connectionsClient.isInitialized || !isStarted || isStopping) { call.reject("Nearby n'est pas démarré."); return }
        val known = payloadId in outgoingFiles || payloadId in incomingFiles || payloadId in incomingMeta
        if (!known) { call.reject("Aucun transfert en cours à annuler."); return }

        try {
            client().cancelPayload(payloadId)
                .addOnSuccessListener { call.resolve(JSObject().apply { put("success", true) }) }
                .addOnFailureListener { error -> call.reject("Impossible d'annuler : ${error.message}") }
        } catch (error: Exception) {
            call.reject("Impossible d'annuler : ${error.message}")
        }
    }

    @PluginMethod
    fun openFile(call: PluginCall) {
        val path = call.getString("path")
        if (path.isNullOrBlank()) { call.reject("Chemin du fichier manquant."); return }

        // Seuls les fichiers enregistrés par ce plugin peuvent être ouverts.
        val directory = receivedDir().canonicalFile
        val file = try { File(path).canonicalFile } catch (_: Exception) { null }
        if (file == null || !file.path.startsWith(directory.path + File.separator) || !file.isFile) {
            call.reject("Fichier introuvable.")
            return
        }

        val extension = file.extension.lowercase()
        var mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension)
            ?: call.getString("mimeType")?.takeIf { it.isNotBlank() }
            ?: "*/*"
        if (extension == "apk" || mime == "application/vnd.android.package-archive") {
            call.reject("Ce type de fichier ne peut pas être ouvert depuis BAARO.")
            return
        }
        if (mime == "*/*") mime = "application/octet-stream"

        try {
            val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, mime)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
            call.resolve(JSObject().apply { put("success", true) })
        } catch (error: ActivityNotFoundException) {
            call.reject("Aucune application ne peut ouvrir ce fichier.")
        } catch (error: Exception) {
            call.reject("Impossible d'ouvrir le fichier : ${error.message}")
        }
    }

    // ───────────── Méthodes Capacitor : vocal et appels ─────────────

    @PluginMethod
    fun startVoiceRecording(call: PluginCall) {
        if (currentCall != null) { call.reject("Termine l'appel avant d'enregistrer un vocal."); return }
        if (voiceRecorder.isRecording) { call.reject("Un enregistrement est déjà en cours."); return }
        if (!hasMicrophonePermission()) { call.reject("Autorise le micro pour enregistrer un vocal."); return }
        try {
            voiceRecorder.start()
            call.resolve(JSObject().apply {
                put("success", true)
                put("maxDurationMs", VoiceRecorder.MAX_DURATION_MS)
            })
        } catch (error: Exception) {
            call.reject("Impossible de démarrer l'enregistrement : ${error.message}")
        }
    }

    @PluginMethod
    fun stopVoiceRecording(call: PluginCall) {
        val result = voiceRecorder.stop()
        if (result == null) { call.reject("Message vocal trop court."); return }
        val size = result.file.length()
        if (!NearbyPluginRules.isFileSizeAllowed(size)) {
            result.file.delete()
            call.reject("Ce vocal dépasse la limite de 20 Mo.")
            return
        }
        val stamp = SimpleDateFormat("dd-MM HH'h'mm", Locale.FRANCE).format(Date())
        val name = NearbyPluginRules.sanitizeFileName("Vocal $stamp.m4a")
        val uri = Uri.fromFile(result.file).toString()
        pickedFiles[uri] = PickedFile(name, "audio/mp4", size)
        while (pickedFiles.size > MAX_PICKED_FILES) {
            pickedFiles.remove(pickedFiles.keys.first())
        }
        call.resolve(JSObject().apply {
            put("uri", uri)
            put("name", name)
            put("mimeType", "audio/mp4")
            put("size", size)
            put("durationMs", result.durationMs)
            put("path", result.file.absolutePath)
        })
    }

    @PluginMethod
    fun cancelVoiceRecording(call: PluginCall) {
        voiceRecorder.cancel()
        call.resolve(JSObject().apply { put("success", true) })
    }

    @PluginMethod
    fun startCall(call: PluginCall) {
        if (!::connectionsClient.isInitialized || !isStarted || isStopping) { call.reject("Nearby n'est pas démarré."); return }
        if (currentCall != null) { call.reject("Un appel est déjà en cours."); return }
        if (voiceRecorder.isRecording) { call.reject("Termine l'enregistrement du vocal avant d'appeler."); return }
        if (!hasMicrophonePermission()) { call.reject("Autorise le micro pour passer un appel."); return }

        val requested = call.getString("endpointId")?.trim().orEmpty()
        val endpointId = when {
            requested.isNotEmpty() -> requested
            connectedEndpoints.size == 1 -> connectedEndpoints.keys.first()
            connectedEndpoints.isEmpty() -> { call.reject("Aucun appareil Nearby n'est connecté."); return }
            else -> { call.reject("Choisis l'appareil à appeler."); return }
        }
        if (!connectedEndpoints.containsKey(endpointId)) { call.reject("Cet appareil n'est pas connecté."); return }

        val state = CallState(
            UUID.randomUUID().toString(),
            endpointId,
            NearbyPluginRules.parseCallMedia(call.getString("media")),
            incoming = false
        )
        currentCall = state
        scheduleCallTimeout(state)
        emitCallState(state)
        sendControl(endpointId, callEnvelope("invite", state)) { error ->
            if (currentCall?.id == state.id) finishCall("error", notifyPeer = false)
            emit("ERROR", endpointId) { put("message", "Appel impossible : ${error.message}") }
        }
        call.resolve(JSObject().apply {
            put("success", true)
            put("callId", state.id)
        })
    }

    @PluginMethod
    fun answerCall(call: PluginCall) {
        val state = currentCall
        val callId = call.getString("callId")
        if (state == null || !state.incoming || state.active || state.id != callId) {
            call.reject("Aucun appel entrant à traiter.")
            return
        }
        if (call.getBoolean("accept", false) != true) {
            sendControl(state.endpointId, callEnvelope("reject", state, "rejected"))
            finishCall("local", notifyPeer = false)
            call.resolve(JSObject().apply { put("success", true) })
            return
        }
        if (!hasMicrophonePermission()) {
            call.reject("Autorise le micro pour répondre à l'appel.")
            return
        }
        sendControl(state.endpointId, callEnvelope("accept", state))
        activateCall(state)
        call.resolve(JSObject().apply { put("success", true) })
    }

    @PluginMethod
    fun endCall(call: PluginCall) {
        if (currentCall == null) { call.resolve(JSObject().apply { put("success", true) }); return }
        finishCall("local", notifyPeer = true)
        call.resolve(JSObject().apply { put("success", true) })
    }

    @PluginMethod
    fun setCallMuted(call: PluginCall) {
        callAudio.muted = call.getBoolean("muted", false) == true
        call.resolve(JSObject().apply { put("success", true) })
    }

    @PluginMethod
    fun setCallSpeaker(call: PluginCall) {
        if (currentCall?.active != true) { call.reject("Aucun appel en cours."); return }
        callAudio.setSpeaker(call.getBoolean("enabled", false) == true)
        call.resolve(JSObject().apply { put("success", true) })
    }

    @PluginMethod
    fun sendVideoFrame(call: PluginCall) {
        val state = currentCall
        if (state == null || !state.active || state.media != "video") {
            call.reject("Aucun appel vidéo en cours.")
            return
        }
        val data = call.getString("data")
        if (!NearbyPluginRules.isVideoFrameAllowed(data)) {
            call.reject("Image vidéo invalide ou trop volumineuse.")
            return
        }
        val envelope = JSONObject()
            .put("v", MESSAGE_PROTOCOL_VERSION)
            .put("type", "vframe")
            .put("id", state.id)
            .put("data", data)
            .toString()
            .toByteArray(Charsets.UTF_8)
        if (envelope.size > MAX_MESSAGE_BYTES) {
            call.reject("Image vidéo trop volumineuse.")
            return
        }
        try {
            client().sendPayload(listOf(state.endpointId), Payload.fromBytes(envelope))
                .addOnSuccessListener { call.resolve(JSObject().apply { put("success", true) }) }
                .addOnFailureListener { error -> call.reject("Envoi de l'image impossible : ${error.message}") }
        } catch (error: Exception) {
            call.reject("Envoi de l'image impossible : ${error.message}")
        }
    }

    override fun handleOnDestroy() {
        super.handleOnDestroy()
        teardownCallAndVoice()
        ioExecutor.shutdownNow()
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
