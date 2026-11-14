package com.baaro.nearby

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NearbyPluginRulesTest {
    @Test
    fun rejectsCallbacksFromOldOrStoppingSessions() {
        assertTrue(NearbyPluginRules.isCurrentSession(4, 4, false, true, false))
        assertTrue(NearbyPluginRules.isCurrentSession(4, 4, true, false, false))
        assertFalse(NearbyPluginRules.isCurrentSession(3, 4, false, true, false))
        assertFalse(NearbyPluginRules.isCurrentSession(4, 4, false, true, true))
        assertFalse(NearbyPluginRules.isCurrentSession(4, 4, false, false, false))
    }

    @Test
    fun requiredPermissionsFollowAndroidApiLevel() {
        assertEquals(listOf("locationCoarse"), NearbyPluginRules.requiredPermissionAliases(24))
        assertEquals(listOf("locationCoarse"), NearbyPluginRules.requiredPermissionAliases(28))
        assertEquals(listOf("locationFine"), NearbyPluginRules.requiredPermissionAliases(29))
        assertEquals(listOf("locationFine"), NearbyPluginRules.requiredPermissionAliases(30))
        assertEquals(
            listOf("bluetooth", "locationCoarse", "locationFine"),
            NearbyPluginRules.requiredPermissionAliases(31)
        )
        assertEquals(
            listOf("bluetooth", "locationCoarse", "locationFine"),
            NearbyPluginRules.requiredPermissionAliases(32)
        )
        assertEquals(listOf("bluetooth", "nearbyWifi"), NearbyPluginRules.requiredPermissionAliases(33))
    }

    @Test(expected = IllegalArgumentException::class)
    fun rejectsUnsupportedAndroidApiLevel() {
        NearbyPluginRules.requiredPermissionAliases(23)
    }

    @Test
    fun selectsAllConnectedEndpointsForBroadcast() {
        val connected = linkedMapOf("endpoint-a" to "A", "endpoint-b" to "B")

        assertEquals(listOf("endpoint-a", "endpoint-b"), NearbyPluginRules.selectSendTargets(connected, null))
        assertEquals(listOf("endpoint-a", "endpoint-b"), NearbyPluginRules.selectSendTargets(connected, "  "))
    }

    @Test
    fun selectsOnlyRequestedConnectedEndpoint() {
        val connected = linkedMapOf("endpoint-a" to "A", "endpoint-b" to "B")

        assertEquals(listOf("endpoint-b"), NearbyPluginRules.selectSendTargets(connected, " endpoint-b "))
    }

    @Test(expected = IllegalArgumentException::class)
    fun rejectsARequestedEndpointThatIsNotConnected() {
        NearbyPluginRules.selectSendTargets(mapOf("endpoint-a" to "A"), "endpoint-b")
    }

    @Test
    fun onlyReservesOneConnectionActionPerEndpoint() {
        val actions = mutableMapOf<String, NearbyPluginRules.ConnectionAction>()

        assertTrue(
            NearbyPluginRules.reserveConnectionAction(
                actions,
                "incoming",
                NearbyPluginRules.ConnectionAction.ACCEPT
            )
        )
        assertFalse(
            NearbyPluginRules.reserveConnectionAction(
                actions,
                "incoming",
                NearbyPluginRules.ConnectionAction.REJECT
            )
        )
        assertEquals(NearbyPluginRules.ConnectionAction.ACCEPT, actions["incoming"])
    }

    @Test
    fun doesNotPolluteOutgoingRequestsWhenEndpointIsAlreadyPending() {
        val pending = setOf("incoming")
        val requesting = mutableSetOf<String>()

        assertFalse(NearbyPluginRules.reserveConnectionRequest(pending, requesting, "incoming"))
        assertTrue(requesting.isEmpty())
        assertTrue(NearbyPluginRules.reserveConnectionRequest(pending, requesting, "outgoing"))
        assertFalse(NearbyPluginRules.reserveConnectionRequest(pending, requesting, "outgoing"))
    }

    @Test
    fun defersDiscoveryLossForOutgoingRequestsAndKeepsConnectedOrIncomingEndpoints() {
        val connected = mapOf("connected" to "A")
        val pending = setOf("incoming")
        val requesting = setOf("outgoing")

        assertEquals(
            NearbyPluginRules.DiscoveryLossAction.IGNORE,
            NearbyPluginRules.discoveryLossAction("connected", connected, pending, requesting)
        )
        assertEquals(
            NearbyPluginRules.DiscoveryLossAction.IGNORE,
            NearbyPluginRules.discoveryLossAction("incoming", connected, pending, requesting)
        )
        assertEquals(
            NearbyPluginRules.DiscoveryLossAction.DEFER,
            NearbyPluginRules.discoveryLossAction("outgoing", connected, pending, requesting)
        )
        assertEquals(
            NearbyPluginRules.DiscoveryLossAction.EMIT,
            NearbyPluginRules.discoveryLossAction("discovered", connected, pending, requesting)
        )
    }
}
