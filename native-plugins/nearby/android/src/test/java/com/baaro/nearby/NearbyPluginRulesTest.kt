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
        assertEquals(listOf("bluetooth", "locationFine"), NearbyPluginRules.requiredPermissionAliases(31))
        assertEquals(listOf("bluetooth", "locationFine"), NearbyPluginRules.requiredPermissionAliases(32))
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

    @Test
    fun stopErrorsAreAggregatedAfterAllStopTasksFinish() {
        assertEquals(
            "diffusion: échec; endpoints: timeout",
            NearbyPluginRules.combineStopErrors(
                listOf("diffusion: échec"),
                listOf("endpoints: timeout")
            )
        )
        assertEquals(
            "fallback",
            NearbyPluginRules.combineStopErrors(emptyList(), emptyList(), "fallback")
        )
        assertEquals(
            null,
            NearbyPluginRules.combineStopErrors(emptyList(), emptyList())
        )
    }

    @Test
    fun transferStatusesKeepFailureAndCancellationVisible() {
        assertEquals("IN_PROGRESS", NearbyPluginRules.normalizeTransferStatus("IN_PROGRESS"))
        assertEquals("SUCCESS", NearbyPluginRules.normalizeTransferStatus("SUCCESS"))
        assertEquals("FAILURE", NearbyPluginRules.normalizeTransferStatus("FAILURE"))
        assertEquals("CANCELED", NearbyPluginRules.normalizeTransferStatus("CANCELED"))
        assertEquals("UNKNOWN", NearbyPluginRules.normalizeTransferStatus("unexpected"))
    }

    @Test
    fun enforcesTwentyMegabyteFileLimit() {
        assertTrue(NearbyPluginRules.isFileSizeAllowed(1))
        assertTrue(NearbyPluginRules.isFileSizeAllowed(20L * 1024L * 1024L))
        assertFalse(NearbyPluginRules.isFileSizeAllowed(20L * 1024L * 1024L + 1))
        assertFalse(NearbyPluginRules.isFileSizeAllowed(0))
        assertFalse(NearbyPluginRules.isFileSizeAllowed(-1))
    }

    @Test
    fun pickerTypesCoverPhotoVideoAndDocument() {
        assertEquals(listOf("image/*"), NearbyPluginRules.pickerMimeTypes("image").toList())
        assertEquals(listOf("video/*"), NearbyPluginRules.pickerMimeTypes("video").toList())
        assertTrue(NearbyPluginRules.pickerMimeTypes("document").contains("application/pdf"))
    }

    @Test(expected = IllegalArgumentException::class)
    fun pickerRejectsUnknownKind() {
        NearbyPluginRules.pickerMimeTypes("audio")
    }

    @Test
    fun sanitizesRemoteFileNames() {
        assertEquals("passwd", NearbyPluginRules.sanitizeFileName("../../etc/passwd"))
        assertEquals("evil.txt", NearbyPluginRules.sanitizeFileName("C:\\temp\\evil.txt"))
        assertEquals("fichier", NearbyPluginRules.sanitizeFileName(null))
        assertEquals("fichier", NearbyPluginRules.sanitizeFileName("  ..  "))
        assertEquals("photo.jpg", NearbyPluginRules.sanitizeFileName(".photo.jpg"))
        val long = NearbyPluginRules.sanitizeFileName("a".repeat(300) + ".pdf")
        assertEquals(120, long.length)
        assertTrue(long.endsWith(".pdf"))
    }

    @Test
    fun addsSuffixWhenFileNameExists() {
        val existing = setOf("photo.jpg", "photo (1).jpg")
        assertEquals("video.mp4", NearbyPluginRules.uniqueFileName("video.mp4") { it in existing })
        assertEquals("photo (2).jpg", NearbyPluginRules.uniqueFileName("photo.jpg") { it in existing })
    }

    @Test
    fun validatesVideoFrames() {
        assertTrue(NearbyPluginRules.isVideoFrameAllowed("QUJDRA=="))
        assertFalse(NearbyPluginRules.isVideoFrameAllowed(null))
        assertFalse(NearbyPluginRules.isVideoFrameAllowed(""))
        assertFalse(NearbyPluginRules.isVideoFrameAllowed("abc\"><script>"))
        assertFalse(NearbyPluginRules.isVideoFrameAllowed("A".repeat(NearbyPluginRules.MAX_VIDEO_FRAME_CHARS + 1)))
        assertTrue(NearbyPluginRules.isVideoFrameAllowed("A".repeat(NearbyPluginRules.MAX_VIDEO_FRAME_CHARS)))
    }

    @Test
    fun callMediaDefaultsToAudio() {
        assertEquals("video", NearbyPluginRules.parseCallMedia("video"))
        assertEquals("audio", NearbyPluginRules.parseCallMedia("audio"))
        assertEquals("audio", NearbyPluginRules.parseCallMedia("autre"))
        assertEquals("audio", NearbyPluginRules.parseCallMedia(null))
    }
}
