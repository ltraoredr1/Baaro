export const config = {
  port: Number(process.env.BAARO_WORKER_PORT || 8787),
  secret: process.env.BAARO_WORKER_SECRET || "",
  tmpDir: process.env.BAARO_WORKER_TMP_DIR || "/tmp/baaro-worker",
  ffmpeg: process.env.FFMPEG_BIN || "ffmpeg",
  ffprobe: process.env.FFPROBE_BIN || "ffprobe",
  whisper: process.env.WHISPER_BIN || "whisper",
  r2: {
    accountId: process.env.R2_ACCOUNT_ID || "",
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
    bucket: process.env.R2_BUCKET_NAME || "baaro-media",
    publicBaseUrl: String(process.env.R2_PUBLIC_BASE_URL || "").replace(/\/+$/, "")
  },
  supabase: {
    url: process.env.SUPABASE_URL || "",
    anonKey: process.env.SUPABASE_ANON_KEY || ""
  },
  openai: {
    key: process.env.OPENAI_API_KEY || "",
    base: String(process.env.OPENAI_API_BASE || "https://api.openai.com/v1").replace(/\/+$/, ""),
    model: process.env.OPENAI_MODEL || "gpt-4o-mini"
  }
};

export function assertR2() {
  for (const [key, value] of Object.entries(config.r2)) {
    if (!value && key !== "publicBaseUrl") throw new Error(`Variable R2 manquante: ${key}`);
  }
}
