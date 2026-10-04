import { mkdir, rm, writeFile, readFile, readdir } from "node:fs/promises";
import { join, basename, extname } from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "./lib/config.mjs";
import { downloadToFile, putFile, publicUrl } from "./lib/r2.mjs";
import { run } from "./lib/exec.mjs";

const VIDEO_EXT = ".mp4";
const MIME = { mp4: "video/mp4", webm: "video/webm", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", vtt: "text/vtt", srt: "application/x-subrip", mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav" };

function keyFromJob(job) {
  return job.payload?.sourceKey || job.payload?.key || job.payload?.r2Key || null;
}
function outputKey(job, suffix, extension) {
  const base = job.payload?.outputPrefix || `processed/${job.owner_id}/${job.video_id || job.asset_id || job.id}`;
  return `${base}/${job.job_type}-${suffix}.${extension}`;
}
async function tempJob(job) {
  const dir = join(config.tmpDir, job.id);
  await mkdir(dir, { recursive: true });
  return dir;
}
async function source(job, dir) {
  const key = keyFromJob(job);
  if (!key) throw new Error("payload.sourceKey est requis pour un traitement vidéo");
  const input = join(dir, `source${extname(key) || VIDEO_EXT}`);
  await downloadToFile(key, input);
  return input;
}
async function ffprobe(input) {
  const { stdout } = await run(config.ffprobe, ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", input]);
  return JSON.parse(stdout);
}
async function transcode(job, input, dir) {
  const profile = String(job.payload?.profile || "mobile");
  const profiles = { mobile: ["720:-2", "2500k"], hd: ["1080:-2", "5000k"], source: ["copy", "copy"] };
  const [size, bitrate] = profiles[profile] || profiles.mobile;
  const output = join(dir, `video-${profile}.mp4`);
  const args = ["-y", "-i", input];
  if (size === "copy") args.push("-c", "copy");
  else args.push("-vf", `scale=${size}`, "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-maxrate", bitrate, "-bufsize", "2M", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart");
  args.push(output);
  await run(config.ffmpeg, args);
  const key = outputKey(job, profile, "mp4");
  return { url: await putFile(key, output, MIME.mp4), key, profile };
}
async function thumbnail(job, input, dir) {
  const output = join(dir, "thumbnail.jpg");
  await run(config.ffmpeg, ["-y", "-ss", String(job.payload?.at || 1), "-i", input, "-frames:v", "1", "-vf", "scale=720:-2", "-q:v", "3", output]);
  const key = outputKey(job, "cover", "jpg");
  return { url: await putFile(key, output, MIME.jpg), key };
}
async function captions(job, input, dir) {
  const model = job.payload?.whisperModel || process.env.WHISPER_MODEL || "small";
  const outputDir = join(dir, "whisper");
  await mkdir(outputDir, { recursive: true });
  await run(config.whisper, [input, "--model", model, "--output_format", "vtt", "--output_dir", outputDir, "--task", "transcribe"]);
  const files = (await readdir(outputDir)).filter(x => x.endsWith(".vtt"));
  if (!files.length) throw new Error("Whisper n'a produit aucun VTT");
  const local = join(outputDir, files[0]);
  const key = outputKey(job, "captions", "vtt");
  return { url: await putFile(key, local, MIME.vtt), key, language: job.payload?.language || "auto" };
}
async function features(job, input) {
  return { probe: await ffprobe(input), extractedAt: new Date().toISOString() };
}
async function highlights(job, input, dir) {
  const probe = await ffprobe(input);
  const duration = Number(probe.format?.duration || 0);
  const points = [0.18, 0.42, 0.68, 0.86].map(r => Math.max(0, Math.min(duration - 1, duration * r))).filter(Number.isFinite);
  const outputs = [];
  for (let i = 0; i < points.length; i++) {
    const file = join(dir, `highlight-${i + 1}.mp4`);
    await run(config.ffmpeg, ["-y", "-ss", String(points[i]), "-i", input, "-t", "6", "-vf", "scale=720:-2", "-c:v", "libx264", "-preset", "veryfast", "-crf", "24", "-c:a", "aac", "-movflags", "+faststart", file]);
    const key = outputKey(job, `highlight-${i + 1}`, "mp4");
    outputs.push({ url: await putFile(key, file, MIME.mp4), key });
  }
  return { duration, highlights: outputs };
}
async function moderate(job, input) {
  const probe = await ffprobe(input);
  const video = probe.streams?.find(s => s.codec_type === "video");
  const audio = probe.streams?.find(s => s.codec_type === "audio");
  return { status: "pending_external_model", safeBasicChecks: { hasVideo: Boolean(video), hasAudio: Boolean(audio), duration: Number(probe.format?.duration || 0) }, provider: job.payload?.moderationProvider || null };
}
async function editPlan(job) {
  if (!config.openai.key) return { status: "queued", message: "OPENAI_API_KEY non configurée" };
  const input = job.payload?.transcript || job.payload?.prompt || "Créer un plan de montage court et dynamique.";
  const r = await fetch(`${config.openai.base}/chat/completions`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${config.openai.key}` }, body: JSON.stringify({ model: config.openai.model, temperature: 0.2, messages: [{ role: "system", content: "Retourne uniquement JSON: {hook,cuts:[{start_ms,end_ms,reason}],captions_style,title_variants,thumbnail_ideas,aspect_ratios}." }, { role: "user", content: String(input).slice(0, 30000) }] }) });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error?.message || "IA montage indisponible");
  const text = data.choices?.[0]?.message?.content || "{}";
  try { return JSON.parse(text.replace(/^```json\s*|\s*```$/g, "")); } catch { return { raw: text }; }
}
async function translate(job) {
  if (!config.openai.key) return { status: "queued", message: "OPENAI_API_KEY non configurée" };
  const text = String(job.payload?.text || "").slice(0, 30000);
  if (!text) throw new Error("payload.text requis pour translate");
  const target = String(job.payload?.targetLanguage || "fr");
  const r = await fetch(`${config.openai.base}/chat/completions`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${config.openai.key}` }, body: JSON.stringify({ model: config.openai.model, temperature: 0.1, messages: [{ role: "system", content: `Traduis le texte vers ${target}. Retourne uniquement le texte traduit.` }, { role: "user", content: text }] }) });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error?.message || "Traduction indisponible");
  return { targetLanguage: target, text: data.choices?.[0]?.message?.content || "" };
}
async function dub(job, input, dir) {
  const endpoint = process.env.BAARO_TTS_URL;
  if (!endpoint) return { status: "queued", message: "BAARO_TTS_URL non configurée", input: publicUrl(keyFromJob(job)) };
  const text = String(job.payload?.text || "").slice(0, 30000);
  const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json", ...(process.env.BAARO_TTS_SECRET ? { authorization: `Bearer ${process.env.BAARO_TTS_SECRET}` } : {}) }, body: JSON.stringify({ text, language: job.payload?.targetLanguage || "fr", voice: job.payload?.voice || "default" }) });
  if (!response.ok) throw new Error(`TTS HTTP ${response.status}`);
  const audio = join(dir, "dub.mp3");
  await writeFile(audio, Buffer.from(await response.arrayBuffer()));
  const key = outputKey(job, "dub", "mp3");
  return { url: await putFile(key, audio, MIME.mp3), key };
}

export async function processJob(job) {
  const dir = await tempJob(job);
  try {
    let input = null;
    if (!["translate", "edit_plan"].includes(job.job_type)) input = await source(job, dir);
    switch (job.job_type) {
      case "transcode": return await transcode(job, input, dir);
      case "thumbnail": return await thumbnail(job, input, dir);
      case "captions": return await captions(job, input, dir);
      case "translate": return await translate(job);
      case "dub": return await dub(job, input, dir);
      case "moderate": return await moderate(job, input);
      case "features": return await features(job, input);
      case "highlights": return await highlights(job, input, dir);
      case "edit_plan": return await editPlan(job);
      default: throw new Error(`Job non supporté: ${job.job_type}`);
    }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
