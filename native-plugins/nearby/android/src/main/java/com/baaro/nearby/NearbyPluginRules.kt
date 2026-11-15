package com.baaro.nearby

/** Pure rules shared by the Nearby plugin implementation and its Android unit tests. */
internal object NearbyPluginRules {
    enum class DiscoveryLossAction { IGNORE, DEFER, EMIT }
    enum class ConnectionAction { ACCEPT, REJECT }

    fun isCurrentSession(
        callbackGeneration: Long,
        currentGeneration: Long,
        isStarting: Boolean,
        isStarted: Boolean,
        isStopping: Boolean
    ): Boolean =
        callbackGeneration == currentGeneration &&
            !isStopping &&
            (isStarting || isStarted)

    fun reserveConnectionAction(
        actions: MutableMap<String, ConnectionAction>,
        endpointId: String,
        action: ConnectionAction
    ): Boolean {
        if (actions.containsKey(endpointId)) return false
        actions[endpointId] = action
        return true
    }

    fun reserveConnectionRequest(
        pendingEndpoints: Set<String>,
        requestingEndpoints: MutableSet<String>,
        endpointId: String
    ): Boolean {
        if (endpointId in pendingEndpoints) return false
        return requestingEndpoints.add(endpointId)
    }

    fun requiredPermissionAliases(sdkVersion: Int): List<String> {
        require(sdkVersion >= 24) { "Nearby Connections requires Android API 24 or newer." }

        return buildList {
            if (sdkVersion >= 31) add("bluetooth")
            if (sdkVersion >= 33) {
                add("nearbyWifi")
            } else if (sdkVersion >= 29) {
                add("locationFine")
            } else {
                add("locationCoarse")
            }
        }
    }

    fun selectSendTargets(
        connectedEndpoints: Map<String, String>,
        requestedEndpointId: String?
    ): List<String> {
        val requested = requestedEndpointId?.trim().orEmpty()
        if (requested.isNotEmpty()) {
            require(connectedEndpoints.containsKey(requested)) {
                "Cet appareil n'est pas connecté."
            }
            return listOf(requested)
        }

        return connectedEndpoints.keys.toList()
    }

    fun discoveryLossAction(
        endpointId: String,
        connectedEndpoints: Map<String, String>,
        pendingEndpoints: Set<String>,
        requestingEndpoints: Set<String>
    ): DiscoveryLossAction = when {
        endpointId in connectedEndpoints || endpointId in pendingEndpoints -> DiscoveryLossAction.IGNORE
        endpointId in requestingEndpoints -> DiscoveryLossAction.DEFER
        else -> DiscoveryLossAction.EMIT
    }

    fun combineStopErrors(
        synchronousErrors: List<String>,
        asynchronousErrors: List<String>,
        fallback: String? = null
    ): String? {
        val errors = (synchronousErrors + asynchronousErrors).filter { it.isNotBlank() }
        return errors.takeIf { it.isNotEmpty() }?.joinToString("; ") ?: fallback?.takeIf { it.isNotBlank() }
    }

    const val MAX_FILE_BYTES: Long = 20L * 1024L * 1024L

    /** Taille connue, positive et ne dépassant pas la limite de 20 Mo par fichier. */
    fun isFileSizeAllowed(sizeBytes: Long): Boolean = sizeBytes in 1..MAX_FILE_BYTES

    /** Types de sélection acceptés : photo, vidéo ou document. */
    fun pickerMimeTypes(kind: String?): Array<String> = when (kind) {
        "image" -> arrayOf("image/*")
        "video" -> arrayOf("video/*")
        "document" -> arrayOf(
            "application/pdf",
            "text/*",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.ms-powerpoint",
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            "application/zip"
        )
        else -> throw IllegalArgumentException("Type de fichier non pris en charge.")
    }

    /**
     * Nettoie un nom de fichier reçu d'un appareil distant : jamais de chemin,
     * pas de caractères de contrôle, longueur bornée. Évite toute traversée de dossier.
     */
    fun sanitizeFileName(rawName: String?): String {
        val base = (rawName ?: "")
            .substringAfterLast('/')
            .substringAfterLast('\\')
            .filter { it.code >= 32 && it !in "<>:\"|?*" }
            .trim()
            .trimStart('.')
        if (base.isEmpty()) return "fichier"
        if (base.length <= 120) return base
        val dot = base.lastIndexOf('.')
        val ext = if (dot > 0 && base.length - dot <= 10) base.substring(dot) else ""
        return base.take(120 - ext.length) + ext
    }

    /** Ajoute un suffixe numérique tant que le nom existe déjà : photo.jpg → photo (1).jpg. */
    fun uniqueFileName(name: String, exists: (String) -> Boolean): String {
        if (!exists(name)) return name
        val dot = name.lastIndexOf('.')
        val stem = if (dot > 0) name.substring(0, dot) else name
        val ext = if (dot > 0) name.substring(dot) else ""
        var index = 1
        while (true) {
            val candidate = "$stem ($index)$ext"
            if (!exists(candidate)) return candidate
            index++
        }
    }

    /** Image vidéo JPEG en base64 : doit tenir avec son enveloppe JSON sous la limite de 32 Ko d'un message Nearby. */
    const val MAX_VIDEO_FRAME_CHARS = 28_000

    fun isVideoFrameAllowed(data: String?): Boolean {
        if (data.isNullOrEmpty() || data.length > MAX_VIDEO_FRAME_CHARS) return false
        // Les images reçues viennent d'un appareil distant : seuls les caractères base64 sont acceptés.
        return data.all { it in 'A'..'Z' || it in 'a'..'z' || it in '0'..'9' || it == '+' || it == '/' || it == '=' }
    }

    fun parseCallMedia(raw: String?): String = if (raw == "video") "video" else "audio"

    fun normalizeTransferStatus(status: String): String = when (status) {
        "IN_PROGRESS", "SUCCESS", "FAILURE", "CANCELED" -> status
        else -> "UNKNOWN"
    }
}
