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
}
