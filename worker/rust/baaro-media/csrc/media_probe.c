#include <libavformat/avformat.h>
#include <libavutil/mathematics.h>

#include <stdint.h>
#include <string.h>

typedef struct {
    int has_video;
    int has_audio;
    int width;
    int height;
    int64_t duration_ms;
} BaaroProbeInfo;

enum {
    BAARO_PROBE_OK = 0,
    BAARO_PROBE_BAD_ARGUMENT = 1,
    BAARO_PROBE_OPEN_FAILED = 2,
    BAARO_PROBE_STREAM_INFO_FAILED = 3,
    BAARO_PROBE_NO_MEDIA_STREAM = 4,
    BAARO_PROBE_NO_MEMORY = 5
};

/* Called only for local files whose header matched BAARO's media allowlist. */
int baaro_probe_media(const char *path, BaaroProbeInfo *out) {
    AVFormatContext *format = NULL;
    int status = BAARO_PROBE_OK;

    if (path == NULL || out == NULL) {
        return BAARO_PROBE_BAD_ARGUMENT;
    }
    memset(out, 0, sizeof(*out));
    av_log_set_level(AV_LOG_QUIET);

    format = avformat_alloc_context();
    if (format == NULL) {
        return BAARO_PROBE_NO_MEMORY;
    }
    /* Bound header probing; actual decoding remains isolated in ffmpeg. */
    format->probesize = 1024 * 1024;
    format->max_analyze_duration = 3 * AV_TIME_BASE;

    if (avformat_open_input(&format, path, NULL, NULL) < 0) {
        status = BAARO_PROBE_OPEN_FAILED;
        goto cleanup;
    }
    if (avformat_find_stream_info(format, NULL) < 0) {
        status = BAARO_PROBE_STREAM_INFO_FAILED;
        goto cleanup;
    }

    for (unsigned int i = 0; i < format->nb_streams; i++) {
        const AVCodecParameters *codec = format->streams[i]->codecpar;
        if (codec->codec_type == AVMEDIA_TYPE_VIDEO &&
            codec->width > 0 && codec->height > 0) {
            out->has_video = 1;
            if (out->width == 0) {
                out->width = codec->width;
                out->height = codec->height;
            }
        } else if (codec->codec_type == AVMEDIA_TYPE_AUDIO &&
                   codec->codec_id != AV_CODEC_ID_NONE && codec->sample_rate > 0) {
            out->has_audio = 1;
        }
    }

    if (!out->has_audio && !out->has_video) {
        status = BAARO_PROBE_NO_MEDIA_STREAM;
        goto cleanup;
    }
    if (format->duration != AV_NOPTS_VALUE && format->duration > 0) {
        out->duration_ms = av_rescale_q(format->duration, AV_TIME_BASE_Q,
                                        (AVRational){1, 1000});
    }

cleanup:
    if (format != NULL) {
        avformat_close_input(&format);
    }
    return status;
}

unsigned int baaro_libavformat_version(void) {
    return avformat_version();
}
