package com.baaro.nearby

import android.annotation.SuppressLint
import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.AudioTrack
import android.media.MediaRecorder
import android.os.Build
import android.os.ParcelFileDescriptor
import android.os.SystemClock
import java.io.File
import java.io.InputStream

/** Enregistre un message vocal en AAC (.m4a), prêt à être envoyé comme fichier. */
internal class VoiceRecorder(private val context: Context) {

    companion object {
        const val MAX_DURATION_MS = 5 * 60 * 1000
        const val MIN_DURATION_MS = 800L
        private const val DIRECTORY = "nearby_voice"
        private const val MAX_AGE_MS = 24L * 60L * 60L * 1000L
    }

    class Result(val file: File, val durationMs: Long)

    private var recorder: MediaRecorder? = null
    private var file: File? = null
    private var startedAt = 0L

    val isRecording: Boolean get() = recorder != null

    @Suppress("DEPRECATION")
    fun start() {
        check(recorder == null) { "Un enregistrement est déjà en cours." }
        val directory = File(context.cacheDir, DIRECTORY).apply { mkdirs() }
        // Les anciens vocaux envoyés ne servent plus : on évite d'accumuler du cache.
        directory.listFiles()?.forEach {
            if (System.currentTimeMillis() - it.lastModified() > MAX_AGE_MS) it.delete()
        }
        val output = File(directory, "vocal-${System.currentTimeMillis()}.m4a")
        val instance = if (Build.VERSION.SDK_INT >= 31) MediaRecorder(context) else MediaRecorder()
        try {
            instance.setAudioSource(MediaRecorder.AudioSource.MIC)
            instance.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            instance.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            instance.setAudioChannels(1)
            instance.setAudioSamplingRate(22_050)
            instance.setAudioEncodingBitRate(48_000)
            instance.setMaxDuration(MAX_DURATION_MS)
            instance.setOutputFile(output.absolutePath)
            instance.prepare()
            instance.start()
        } catch (error: Exception) {
            try { instance.release() } catch (_: Exception) {}
            output.delete()
            throw error
        }
        recorder = instance
        file = output
        startedAt = SystemClock.elapsedRealtime()
    }

    /** Arrête l'enregistrement. Retourne null si le message est trop court ou invalide. */
    fun stop(): Result? {
        val instance = recorder ?: return null
        val output = file ?: return null
        val duration = SystemClock.elapsedRealtime() - startedAt
        recorder = null
        file = null
        try {
            instance.stop()
        } catch (_: RuntimeException) {
            // Arrêt très rapide, ou durée maximale déjà atteinte : on juge d'après la durée.
            if (duration < MIN_DURATION_MS) {
                instance.release()
                output.delete()
                return null
            }
        }
        instance.release()
        if (duration < MIN_DURATION_MS || output.length() == 0L) {
            output.delete()
            return null
        }
        return Result(output, minOf(duration, MAX_DURATION_MS.toLong()))
    }

    fun cancel() {
        val instance = recorder ?: return
        val output = file
        recorder = null
        file = null
        try { instance.stop() } catch (_: RuntimeException) {}
        try { instance.release() } catch (_: Exception) {}
        output?.delete()
    }
}

/**
 * Audio d'un appel vocal : capture du micro en PCM 16 kHz mono envoyée via un flux Nearby,
 * et lecture du flux reçu de l'autre appareil.
 */
internal class CallAudio(private val context: Context) {

    companion object {
        const val SAMPLE_RATE = 16_000
        private const val FRAME_BYTES = 640 // 20 ms de PCM 16 bits mono
    }

    @Volatile private var running = false
    @Volatile var muted = false

    private var record: AudioRecord? = null
    private var captureThread: Thread? = null
    private var playThread: Thread? = null
    private var previousMode = AudioManager.MODE_NORMAL

    private val audioManager: AudioManager
        get() = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager

    /** Démarre la capture et retourne l'extrémité de lecture du tube à envoyer à l'autre appareil. */
    @SuppressLint("MissingPermission")
    fun start(): ParcelFileDescriptor {
        check(!running) { "L'audio de l'appel est déjà démarré." }
        val minBuffer = AudioRecord.getMinBufferSize(
            SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT
        )
        check(minBuffer > 0) { "Micro indisponible." }

        val instance = AudioRecord(
            MediaRecorder.AudioSource.VOICE_COMMUNICATION,
            SAMPLE_RATE,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
            maxOf(minBuffer, 4096) * 2
        )
        if (instance.state != AudioRecord.STATE_INITIALIZED) {
            instance.release()
            throw IllegalStateException("Micro indisponible.")
        }

        val pipe = ParcelFileDescriptor.createPipe()
        previousMode = audioManager.mode
        audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
        muted = false
        running = true
        record = instance

        try {
            instance.startRecording()
        } catch (error: Exception) {
            running = false
            record = null
            instance.release()
            audioManager.mode = previousMode
            pipe.forEach { try { it.close() } catch (_: Exception) {} }
            throw error
        }

        val writeEnd = pipe[1]
        captureThread = Thread({
            val output = ParcelFileDescriptor.AutoCloseOutputStream(writeEnd)
            val buffer = ByteArray(FRAME_BYTES)
            try {
                while (running) {
                    val read = instance.read(buffer, 0, buffer.size)
                    if (read <= 0) break
                    if (muted) java.util.Arrays.fill(buffer, 0, read, 0)
                    output.write(buffer, 0, read)
                }
            } catch (_: Exception) {
                // Tube fermé par l'autre appareil ou fin de l'appel.
            } finally {
                try { output.close() } catch (_: Exception) {}
            }
        }, "baaro-call-capture").also { it.start() }

        return pipe[0]
    }

    /** Lit le flux audio de l'autre appareil dans le haut-parleur ou l'écouteur. */
    fun play(input: InputStream) {
        if (!running) {
            try { input.close() } catch (_: Exception) {}
            return
        }
        playThread?.interrupt()

        val minBuffer = AudioTrack.getMinBufferSize(
            SAMPLE_RATE, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT
        )
        val track = AudioTrack.Builder()
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build()
            )
            .setAudioFormat(
                AudioFormat.Builder()
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .setSampleRate(SAMPLE_RATE)
                    .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                    .build()
            )
            .setBufferSizeInBytes(maxOf(minBuffer, 4096) * 2)
            .setTransferMode(AudioTrack.MODE_STREAM)
            .build()

        track.play()
        playThread = Thread({
            val buffer = ByteArray(FRAME_BYTES * 2)
            try {
                while (running) {
                    val read = input.read(buffer)
                    if (read < 0) break
                    if (read > 0) track.write(buffer, 0, read)
                }
            } catch (_: Exception) {
                // Flux interrompu : fin de l'appel ou perte de connexion.
            } finally {
                try { input.close() } catch (_: Exception) {}
                try { track.stop() } catch (_: Exception) {}
                track.release()
            }
        }, "baaro-call-playback").also { it.start() }
    }

    @Suppress("DEPRECATION")
    fun setSpeaker(enabled: Boolean) {
        audioManager.isSpeakerphoneOn = enabled
    }

    fun stop() {
        if (!running && record == null) return
        running = false
        val instance = record
        record = null
        try { instance?.stop() } catch (_: Exception) {}
        captureThread?.let { try { it.join(300) } catch (_: InterruptedException) {} }
        try { instance?.release() } catch (_: Exception) {}
        captureThread = null
        playThread?.interrupt()
        playThread = null
        try {
            @Suppress("DEPRECATION")
            audioManager.isSpeakerphoneOn = false
            audioManager.mode = previousMode
        } catch (_: Exception) {}
    }
}
