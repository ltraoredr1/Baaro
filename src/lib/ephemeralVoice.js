const PREFIX = "[baaro-ephemeral-voice:v1]";
const DEFAULT_TTL_HOURS = 24;

export function encodeEphemeralVoice({
  url,
  mime,
  duration = 0,
  expiresAt,
  size = 0,
}) {
  if (!url) throw new Error("URL audio manquante");

  const payload = {
    url: String(url),
    mime: String(mime || "audio/webm"),
    duration: Math.max(0, Math.floor(Number(duration) || 0)),
    expiresAt:
      expiresAt ||
      new Date(Date.now() + DEFAULT_TTL_HOURS * 3600_000).toISOString(),
    size: Math.max(0, Number(size) || 0),
  };

  return `${PREFIX}${JSON.stringify(payload)}`;
}

export function parseEphemeralVoice(text) {
  if (typeof text !== "string" || !text.startsWith(PREFIX)) return null;

  try {
    const payload = JSON.parse(text.slice(PREFIX.length));

    if (!payload?.url || !payload?.expiresAt) return null;

    return {
      url: String(payload.url),
      mime: String(payload.mime || "audio/webm"),
      duration: Math.max(0, Math.floor(Number(payload.duration) || 0)),
      expiresAt: String(payload.expiresAt),
      size: Math.max(0, Number(payload.size) || 0),
    };
  } catch {
    return null;
  }
}

export function isEphemeralVoiceExpired(voice, now = Date.now()) {
  const expires = Date.parse(voice?.expiresAt || "");
  return !Number.isFinite(expires) || expires <= now;
}

export { DEFAULT_TTL_HOURS };
