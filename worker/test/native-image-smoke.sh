set -eu

version="$(/usr/local/bin/baaro-media --version)"
printf '%s\n' "$version" | grep -q 'libavformat'

ffmpeg -nostdin -hide_banner -loglevel error \
  -f lavfi -i sine=frequency=997:duration=0.25 \
  -c:a pcm_s16le -y /tmp/baaro-native-smoke.wav

result="$(/usr/local/bin/baaro-media sniff /tmp/baaro-native-smoke.wav)"
case "$result" in
  *'"containerValid":true'*) ;;
  *) printf 'Validation C/Rust invalide: %s\n' "$result" >&2; exit 1 ;;
esac
