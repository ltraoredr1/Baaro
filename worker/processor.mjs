
import {
  mkdir,
  rm,
  writeFile,
  readFile,
  readdir,
} from "node:fs/promises";
import { join, extname } from "node:path";
import { config } from "./lib/config.mjs";
import {
  downloadToFile,
  putFile,
  publicUrl,
} from "./lib/r2.mjs";
import { run } from "./lib/exec.mjs";

const VIDEO_EXT = ".mp4";
const MAX_TRANSLATION_CHARS = 30000;
const TRANSLATION_BATCH_SIZE = 20;

const MIME = {
  mp4: "video/mp4",
  webm: "video/webm",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  vtt: "text/vtt",
  srt: "application/x-subrip",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  wav: "audio/wav",
};

function keyFromJob(job) {
  return (
    job.payload?.sourceKey ||
    job.payload?.key ||
    job.payload?.r2Key ||
    null
  );
}

function outputKey(job, suffix, extension) {
  const base =
    job.payload?.outputPrefix ||
    `processed/${job.owner_id}/${job.video_id || job.asset_id || job.id}`;

  return `${base}/${job.job_type}-${suffix}.${extension}`;
}

async function tempJob(job) {
  const dir = join(config.tmpDir, job.id);
  await mkdir(dir, { recursive: true });
  return dir;
}

async function source(job, dir) {
  const key = keyFromJob(job);

  if (!key) {
    throw new Error(
      "payload.sourceKey est requis pour un traitement vidéo"
    );
  }

  const input = join(
    dir,
    `source${extname(key) || VIDEO_EXT}`
  );

  await downloadToFile(key, input);
  return input;
}

async function ffprobe(input) {
  const { stdout } = await run(config.ffprobe, [
    "-v", "error",
    "-print_format", "json",
    "-show_format",
    "-show_streams",
    input,
  ]);

  return JSON.parse(stdout);
}

async function transcode(job, input, dir) {
  const profile = String(job.payload?.profile || "mobile");

  const profiles = {
    mobile: ["720:-2", "2500k"],
    hd: ["1080:-2", "5000k"],
    source: ["copy", "copy"],
  };

  const [size, bitrate] = profiles[profile] || profiles.mobile;
  const output = join(dir, `video-${profile}.mp4`);
  const args = ["-y", "-i", input];

  if (size === "copy") {
    args.push("-c", "copy");
  } else {
    args.push(
      "-vf", `scale=${size}`,
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "23",
      "-maxrate", bitrate,
      "-bufsize", "2M",
      "-c:a", "aac",
      "-b:a", "128k",
      "-movflags", "+faststart"
    );
  }

  args.push(output);
  await run(config.ffmpeg, args);

  const key = outputKey(job, profile, "mp4");

  return {
    url: await putFile(key, output, MIME.mp4),
    key,
    profile,
  };
}

async function thumbnail(job, input, dir) {
  const output = join(dir, "thumbnail.jpg");

  await run(config.ffmpeg, [
    "-y",
    "-ss", String(job.payload?.at || 1),
    "-i", input,
    "-frames:v", "1",
    "-vf", "scale=720:-2",
    "-q:v", "3",
    output,
  ]);

  const key = outputKey(job, "cover", "jpg");

  return {
    url: await putFile(key, output, MIME.jpg),
    key,
  };
}

/**
 * Transcription audio/vidéo avec Whisper.
 * Le binaire configuré dans config.whisper doit être installé
 * dans l'environnement du worker.
 */
async function transcribeVtt(job, input, dir, prefix = "whisper") {
  const model =
    job.payload?.whisperModel ||
    process.env.WHISPER_MODEL ||
    "small";

  const outputDir = join(dir, prefix);
  await mkdir(outputDir, { recursive: true });

  await run(config.whisper, [
    input,
    "--model", model,
    "--output_format", "vtt",
    "--output_dir", outputDir,
    "--task", "transcribe",
  ]);

  const files = (await readdir(outputDir))
    .filter((file) => file.endsWith(".vtt"));

  if (!files.length) {
    throw new Error("Whisper n'a produit aucun fichier WebVTT");
  }

  return readFile(join(outputDir, files[0]), "utf8");
}

async function captions(job, input, dir) {
  const vtt = await transcribeVtt(job, input, dir);

  const local = join(dir, "captions.vtt");
  await writeFile(local, vtt, "utf8");

  const key = outputKey(job, "captions", "vtt");

  return {
    url: await putFile(key, local, MIME.vtt),
    key,
    language: job.payload?.language || "auto",
    format: "webvtt",
  };
}

async function features(job, input) {
  return {
    probe: await ffprobe(input),
    extractedAt: new Date().toISOString(),
  };
}

async function highlights(job, input, dir) {
  const probe = await ffprobe(input);
  const duration = Number(probe.format?.duration || 0);

  if (!Number.isFinite(duration) || duration <= 1) {
    throw new Error("Durée vidéo invalide");
  }

  const points = [0.18, 0.42, 0.68, 0.86]
    .map((ratio) => Math.max(
      0,
      Math.min(duration - 1, duration * ratio)
    ));

  const outputs = [];

  for (let i = 0; i < points.length; i++) {
    const file = join(dir, `highlight-${i + 1}.mp4`);

    await run(config.ffmpeg, [
      "-y",
      "-ss", String(points[i]),
      "-i", input,
      "-t", "6",
      "-vf", "scale=720:-2",
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "24",
      "-c:a", "aac",
      "-movflags", "+faststart",
      file,
    ]);

    const key = outputKey(job, `highlight-${i + 1}`, "mp4");

    outputs.push({
      url: await putFile(key, file, MIME.mp4),
      key,
    });
  }

  return { duration, highlights: outputs };
}

async function moderate(job, input) {
  const probe = await ffprobe(input);
  const video = probe.streams?.find(
    (stream) => stream.codec_type === "video"
  );
  const audio = probe.streams?.find(
    (stream) => stream.codec_type === "audio"
  );

  return {
    status: "pending_external_model",
    safeBasicChecks: {
      hasVideo: Boolean(video),
      hasAudio: Boolean(audio),
      duration: Number(probe.format?.duration || 0),
    },
    provider: job.payload?.moderationProvider || null,
  };
}

/**
 * Appel IA avec Groq en priorité et Mistral en secours.
 * Les URL peuvent être personnalisées via GROQ_BASE/MISTRAL_BASE.
 */
function translationProviders() {
  const providers = [];

  if (process.env.GROQ_API_KEY) {
    providers.push({
      name: "groq",
      key: process.env.GROQ_API_KEY,
      base:
        process.env.GROQ_BASE ||
        "https://api.groq.com/openai/v1",
      model:
        process.env.GROQ_MODEL ||
        "openai/gpt-oss-20b",
    });
  }

  if (process.env.MISTRAL_API_KEY) {
    providers.push({
      name: "mistral",
      key: process.env.MISTRAL_API_KEY,
      base:
        process.env.MISTRAL_BASE ||
        "https://api.mistral.ai/v1",
      model:
        process.env.MISTRAL_MODEL ||
        "ministral-3b-latest",
    });
  }

  return providers;
}

async function translateWithAI(messages, targetLanguage) {
  const providers = translationProviders();

  if (!providers.length) {
    throw new Error(
      "Configure GROQ_API_KEY ou MISTRAL_API_KEY dans le worker."
    );
  }

  let lastError;

  for (const provider of providers) {
    try {
      const base = provider.base.replace(/\/+$/, "");

      const response = await fetch(
        `${base}/chat/completions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${provider.key}`,
          },
          body: JSON.stringify({
            model: provider.model,
            temperature: 0.1,
            max_tokens: 4000,
            messages: [
              {
                role: "system",
                content:
                  `Tu es un traducteur professionnel. ` +
                  `Traduis fidèlement vers ${targetLanguage}. ` +
                  "Respecte le format demandé. " +
                  "N'ajoute aucun commentaire.",
              },
              ...messages,
            ],
          }),
          signal: AbortSignal.timeout(90000),
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        lastError = new Error(
          data?.error?.message ||
          `${provider.name} HTTP ${response.status}`
        );
        continue;
      }

      const text = data?.choices?.[0]?.message?.content;

      if (typeof text !== "string" || !text.trim()) {
        lastError = new Error(
          `${provider.name} a retourné une réponse vide`
        );
        continue;
      }

      return {
        text: text.trim(),
        provider: provider.name,
        model: provider.model,
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(
    `Traduction indisponible chez Groq et Mistral : ${
      lastError?.message || "erreur inconnue"
    }`
  );
}

/**
 * Découpe le WebVTT en blocs sans perdre les horodatages.
 */
function parseVtt(vtt) {
  const normalized = String(vtt || "")
    .replace(/^\uFEFF/, "")
    .replace(/\r/g, "")
    .trim();

  if (!/^WEBVTT(?:\s|$)/.test(normalized)) {
    throw new Error("La transcription ne contient pas un WebVTT valide");
  }

  return normalized.split(/\n{2,}/).map((block) => {
    const lines = block.split("\n");
    const timingIndex = lines.findIndex(
      (line) => line.includes("-->")
    );

    if (timingIndex < 0) {
      return { raw: block, timing: null, text: [] };
    }

    return {
      raw: null,
      prefix: lines.slice(0, timingIndex),
      timing: lines[timingIndex],
      text: lines.slice(timingIndex + 1),
    };
  });
}

function extractJson(text) {
  const cleaned = String(text)
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("[");
    const end = cleaned.lastIndexOf("]");

    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }

    throw new Error(
      "Le modèle n'a pas retourné le JSON attendu pour les sous-titres"
    );
  }
}

/**
 * Traduit les textes des sous-titres par lots.
 * Les identifiants et horodatages sont conservés localement :
 * le modèle ne peut pas les remplacer dans le fichier final.
 */
async function translateVtt(vtt, targetLanguage) {
  const blocks = parseVtt(vtt);

  const cues = blocks
    .map((block, blockIndex) => ({ ...block, blockIndex }))
    .filter(
      (block) =>
        block.timing &&
        block.text.join("\n").trim()
    );

  if (!cues.length) {
    throw new Error("Aucun sous-titre à traduire");
  }

  let providerUsed = null;
  let modelUsed = null;

  for (
    let start = 0;
    start < cues.length;
    start += TRANSLATION_BATCH_SIZE
  ) {
    const batch = cues.slice(
      start,
      start + TRANSLATION_BATCH_SIZE
    );

    const payload = batch.map((cue, index) => ({
      id: start + index + 1,
      text: cue.text.join("\n"),
    }));

    const result = await translateWithAI(
      [
        {
          role: "user",
          content:
            "Traduis les textes de cette liste vers la langue cible. " +
            "Retourne uniquement un tableau JSON d'objets {id,text}. " +
            "Conserve exactement chaque id. " +
            "Ne traduis pas les identifiants. " +
            "N'omets aucune entrée.\n\n" +
            JSON.stringify(payload),
        },
      ],
      targetLanguage
    );

    providerUsed = result.provider;
    modelUsed = result.model;

    const items = extractJson(result.text);

    if (!Array.isArray(items)) {
      throw new Error("Liste de traductions invalide");
    }

    for (let index = 0; index < batch.length; index++) {
      const expectedId = start + index + 1;
      const item = items.find(
        (entry) => Number(entry?.id) === expectedId
      );

      if (typeof item?.text !== "string" || !item.text.trim()) {
        throw new Error(
          `Traduction manquante pour le sous-titre ${expectedId}`
        );
      }

      // Seul le texte change. Le minutage original reste intact.
      batch[index].text = item.text.trim().split("\n");
    }
  }

  const translatedBlocks = [...blocks];

  for (const cue of cues) {
    translatedBlocks[cue.blockIndex] = [
      ...(cue.prefix || []),
      cue.timing,
      ...cue.text,
    ].join("\n");
  }

  return {
    vtt: translatedBlocks.join("\n\n") + "\n",
    provider: providerUsed,
    model: modelUsed,
    cues: cues.length,
  };
}

/**
 * translate :
 * - payload.text seul : traduction de texte classique.
 * - payload.sourceKey : transcription de la vidéo, traduction
 *   des sous-titres, puis publication du VTT traduit dans R2.
 */
async function translate(job, input, dir) {
  const target = String(
    job.payload?.targetLanguage || "fr"
  ).trim().slice(0, 80);

  if (!target) {
    throw new Error("payload.targetLanguage est requis");
  }

  if (input) {
    const sourceVtt = await transcribeVtt(
      job,
      input,
      dir,
      "whisper-translate"
    );

    const translated = await translateVtt(
      sourceVtt,
      target
    );

    const local = join(dir, "translated.vtt");

    await writeFile(local, translated.vtt, "utf8");

    const safeTarget = target.replace(
      /[^a-zA-Z0-9_-]/g,
      "_"
    );

    const key = outputKey(
      job,
      `translated-${safeTarget}`,
      "vtt"
    );

    const url = await putFile(key, local, MIME.vtt);

    return {
      status: "completed",
      targetLanguage: target,
      sourceLanguage: job.payload?.sourceLanguage || "auto",
      subtitles: { url, key },
      cues: translated.cues,
      provider: translated.provider,
      model: translated.model,
      format: "webvtt",
    };
  }

  const text = String(
    job.payload?.text || ""
  ).slice(0, MAX_TRANSLATION_CHARS);

  if (!text.trim()) {
    throw new Error(
      "payload.sourceKey ou payload.text est requis pour translate"
    );
  }

  const result = await translateWithAI(
    [{ role: "user", content: text }],
    target
  );

  return {
    status: "completed",
    targetLanguage: target,
    text: result.text,
    provider: result.provider,
    model: result.model,
  };
}

async function editPlan(job) {
  if (!config.openai.key) {
    return {
      status: "queued",
      message: "OPENAI_API_KEY non configurée",
    };
  }

  const input =
    job.payload?.transcript ||
    job.payload?.prompt ||
    "Créer un plan de montage court et dynamique.";

  const response = await fetch(
    `${config.openai.base.replace(/\/+$/, "")}/chat/completions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.openai.key}`,
      },
      body: JSON.stringify({
        model: config.openai.model,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              "Retourne uniquement JSON: " +
              "{hook,cuts:[{start_ms,end_ms,reason}]," +
              "captions_style,title_variants,thumbnail_ideas,aspect_ratios}.",
          },
          {
            role: "user",
            content: String(input).slice(0, MAX_TRANSLATION_CHARS),
          },
        ],
      }),
      signal: AbortSignal.timeout(90000),
    }
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data?.error?.message || "IA montage indisponible"
    );
  }

  const text = data.choices?.[0]?.message?.content || "{}";

  try {
    return JSON.parse(
      text.replace(/^```json\s*|\s*```$/g, "")
    );
  } catch {
    return { raw: text };
  }
}

async function dub(job, input, dir) {
  const endpoint = process.env.BAARO_TTS_URL;

  if (!endpoint) {
    return {
      status: "queued",
      message: "BAARO_TTS_URL non configurée",
      input: publicUrl(keyFromJob(job)),
    };
  }

  const text = String(
    job.payload?.text || ""
  ).slice(0, MAX_TRANSLATION_CHARS);

  if (!text.trim()) {
    throw new Error(
      "payload.text est requis pour la synthèse vocale"
    );
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.BAARO_TTS_SECRET
        ? {
            Authorization:
              `Bearer ${process.env.BAARO_TTS_SECRET}`,
          }
        : {}),
    },
    body: JSON.stringify({
      text,
      language: job.payload?.targetLanguage || "fr",
      voice: job.payload?.voice || "default",
    }),
    signal: AbortSignal.timeout(90000),
  });

  if (!response.ok) {
    throw new Error(`TTS HTTP ${response.status}`);
  }

  const audio = join(dir, "dub.mp3");

  await writeFile(
    audio,
    Buffer.from(await response.arrayBuffer())
  );

  const key = outputKey(job, "dub", "mp3");

  return {
    url: await putFile(key, audio, MIME.mp3),
    key,
  };
}

export async function processJob(job) {
  const dir = await tempJob(job);

  try {
    let input = null;

    // Une traduction peut être textuelle ou porter sur une vidéo.
    // Dans le second cas, la source doit être téléchargée depuis R2.
    const needsSource =
      job.job_type !== "edit_plan" &&
      (
        job.job_type !== "translate" ||
        Boolean(keyFromJob(job))
      );

    if (needsSource) {
      input = await source(job, dir);
    }

    switch (job.job_type) {
      case "transcode":
        return await transcode(job, input, dir);

      case "thumbnail":
        return await thumbnail(job, input, dir);

      case "captions":
        return await captions(job, input, dir);

      case "translate":
        return await translate(job, input, dir);

      case "dub":
        return await dub(job, input, dir);

      case "moderate":
        return await moderate(job, input);

      case "features":
        return await features(job, input);

      case "highlights":
        return await highlights(job, input, dir);

      case "edit_plan":
        return await editPlan(job);

      default:
        throw new Error(`Job non supporté: ${job.job_type}`);
    }
  } finally {
    await rm(dir, {
      recursive: true,
      force: true,
    }).catch(() => {});
  }
}
