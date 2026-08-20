/**
 * BAARO /api/translate-media
 *
 * Pipeline vidéo / audio :
 *   1) Transcription (OpenAI Whisper)  → texte source + timestamps
 *   2) Traduction (même gateway que /api/translate)
 *   3) Mode "subtitles" → WebVTT traduit (rapide, recommandé)
 *   4) Mode "dub"       → TTS (OpenAI / ElevenLabs) + URL audio
 *
 * Le client n'envoie que mediaUrl + targetLang + mode.
 * Aucune clé exposée au navigateur.
 *
 * Env :
 *   OPENAI_API_KEY          (Whisper + optionnel TTS)
 *   ELEVENLABS_API_KEY      (optionnel, doublage haute qualité)
 *   ELEVENLABS_VOICE_ID     (optionnel)
 *   + mêmes clés IA que /api/translate pour l'étape MT
 */
import { getAdminClient, requireUser } from "./_supabaseAdmin.js";
import { rateLimit } from "./_rateLimit.js";
import { applyCors } from "./_cors.js";
import { chooseProvider, normalizeCountry, providerConfig } from "./ai/router.js";
import { callOpenAICompatible } from "./ai/openai-compatible.js";

const ALLOWED_LANGS = new Set([
  "fr", "en", "es", "pt", "ar", "zh", "hi", "ru", "ja", "de",
  "sw", "it", "ko", "tr", "nl", "pl", "uk", "vi", "id", "th",
]);

const LANG_NAMES = {
  fr: "français", en: "English", es: "español", pt: "português",
  ar: "العربية", zh: "中文", hi: "हिन्दी", ru: "русский",
  ja: "日本語", de: "Deutsch", sw: "Kiswahili", it: "italiano",
  ko: "한국어", tr: "Türkçe", nl: "Nederlands", pl: "polski",
  uk: "українська", vi: "Tiếng Việt", id: "Bahasa Indonesia", th: "ไทย",
};

// Whisper language codes (ISO-639-1)
const WHISPER_OK = ALLOWED_LANGS;

function jsonError(res, status, message) {
  return res.status(status).json({ error: message });
}

function isHttpUrl(u) {
  try {
    const x = new URL(u);
    return x.protocol === "https:" || x.protocol === "http:";
  } catch {
    return false;
  }
}

function secToVtt(t) {
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  const ms = Math.floor((t % 1) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
}

function segmentsToVtt(segments) {
  let out = "WEBVTT\n\n";
  segments.forEach((seg, i) => {
    if (!seg.text?.trim()) return;
    out += `${i + 1}\n`;
    out += `${secToVtt(seg.start)} --> ${secToVtt(seg.end)}\n`;
    out += `${seg.text.trim()}\n\n`;
  });
  return out;
}

async function whisperTranscribe(mediaUrl, languageHint) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw Object.assign(new Error("OPENAI_API_KEY manquante pour Whisper"), { status: 503 });

  // Télécharger le média côté serveur (ne jamais faire confiance au client pour un blob)
  const mediaRes = await fetch(mediaUrl, { redirect: "follow" });
  if (!mediaRes.ok) {
    throw Object.assign(new Error("Impossible de télécharger le média"), { status: 400 });
  }
  const contentType = mediaRes.headers.get("content-type") || "audio/mpeg";
  const buf = Buffer.from(await mediaRes.arrayBuffer());
  if (buf.length > 80 * 1024 * 1024) {
    throw Object.assign(new Error("Fichier trop volumineux (max 80 Mo)"), { status: 400 });
  }

  const form = new FormData();
  const blob = new Blob([buf], { type: contentType });
  form.append("file", blob, "media.bin");
  form.append("model", "whisper-1");
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "segment");
  if (languageHint && WHISPER_OK.has(languageHint)) {
    form.append("language", languageHint);
  }

  const stt = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  const data = await stt.json().catch(() => ({}));
  if (!stt.ok) {
    throw Object.assign(new Error(data.error?.message || "Erreur Whisper"), {
      status: stt.status,
    });
  }

  const segments = (data.segments || []).map((s) => ({
    start: Number(s.start) || 0,
    end: Number(s.end) || 0,
    text: String(s.text || "").trim(),
  }));

  return {
    text: String(data.text || "").trim(),
    language: data.language || languageHint || "auto",
    segments,
  };
}

async function translateBatch(texts, targetLang, provider, country) {
  const targetName = LANG_NAMES[targetLang] || targetLang;
  const system = [
    "Tu es un traducteur de sous-titres pour BAARO.",
    `Traduis chaque ligne vers ${targetName}.`,
    "Réponds UNIQUEMENT avec un JSON array de strings, même longueur que l'entrée.",
    "Conserve emojis et noms propres. Pas de commentaires.",
  ].join(" ");

  const payload = JSON.stringify(texts);
  const userContent = `Lignes à traduire (JSON array):\n${payload}`;

  let raw = "";
  if (provider === "anthropic") {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
        max_tokens: 4000,
        system,
        messages: [{ role: "user", content: userContent }],
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error?.message || "Erreur traduction");
    raw =
      data.content?.find?.((c) => c.type === "text")?.text ||
      data.content?.[0]?.text ||
      "";
  } else {
    const cfg = providerConfig(provider);
    const result = await callOpenAICompatible({
      base: cfg.base,
      key: cfg.key,
      model: cfg.model,
      messages: [{ role: "user", content: userContent }],
      system,
      maxTokens: 4000,
    });
    raw = result.reply || "";
  }

  // Parse JSON array
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) {
    // Fallback : une seule string pour tout
    return texts.map(() => raw.trim() || "");
  }
  try {
    const arr = JSON.parse(match[0]);
    if (Array.isArray(arr) && arr.length === texts.length) {
      return arr.map((t) => String(t ?? ""));
    }
  } catch {
    /* fallthrough */
  }
  return texts.map(() => raw.trim());
}

async function ttsOpenAI(text, targetLang) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini-tts",
      voice: "alloy",
      input: text.slice(0, 4000),
      response_format: "mp3",
    }),
  });
  if (!response.ok) return null;
  const buf = Buffer.from(await response.arrayBuffer());
  return { buffer: buf, contentType: "audio/mpeg", provider: "openai-tts" };
}

async function ttsElevenLabs(text) {
  const key = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";
  if (!key) return null;
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": key,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: text.slice(0, 4000),
        model_id: "eleven_multilingual_v2",
      }),
    }
  );
  if (!response.ok) return null;
  const buf = Buffer.from(await response.arrayBuffer());
  return { buffer: buf, contentType: "audio/mpeg", provider: "elevenlabs" };
}

async function uploadToStorage(admin, userId, buffer, contentType, ext) {
  const path = `translations/${userId}/${Date.now()}.${ext}`;
  const { error } = await admin.storage.from("media").upload(path, buffer, {
    contentType,
    upsert: true,
  });
  if (error) throw error;
  const { data } = admin.storage.from("media").getPublicUrl(path);
  return data.publicUrl;
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") return jsonError(res, 405, "Méthode non autorisée");

  // Plus strict : Whisper + TTS coûtent cher
  const limit = rateLimit(req, { key: "translate-media", max: 8, windowMs: 60_000 });
  if (!limit.ok) {
    Object.entries(limit.headers || {}).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(limit.status).json(limit.body);
  }

  let admin, user;
  try {
    admin = getAdminClient();
    user = await requireUser(req, admin);
  } catch (e) {
    return jsonError(res, e.status || 500, e.message);
  }

  if (user.is_anonymous) {
    return jsonError(res, 403, "Créez un compte pour traduire les vidéos");
  }

  const body = req.body || {};
  const mediaUrl = String(body.mediaUrl || "").trim();
  const targetLang = String(body.targetLang || "en").toLowerCase().slice(0, 8);
  const sourceLangHint = body.sourceLang
    ? String(body.sourceLang).toLowerCase().slice(0, 8)
    : null;
  const mode = body.mode === "dub" ? "dub" : "subtitles"; // subtitles | dub
  const videoId = typeof body.videoId === "string" ? body.videoId.slice(0, 64) : null;

  if (!isHttpUrl(mediaUrl)) return jsonError(res, 400, "mediaUrl invalide");
  if (!ALLOWED_LANGS.has(targetLang)) {
    return jsonError(res, 400, "Langue cible non supportée");
  }

  // Cache job existant
  if (videoId) {
    try {
      const { data: cached } = await admin
        .from("media_translations")
        .select("*")
        .eq("media_id", videoId)
        .eq("target_lang", targetLang)
        .eq("mode", mode)
        .eq("status", "ready")
        .maybeSingle();
      if (cached) {
        return res.status(200).json({
          ok: true,
          cached: true,
          mode,
          targetLang,
          sourceLang: cached.source_lang,
          transcript: cached.transcript,
          vttUrl: cached.vtt_url,
          vttText: cached.vtt_text,
          dubAudioUrl: cached.dub_audio_url,
          segments: cached.segments,
        });
      }
    } catch {
      /* table absente */
    }
  }

  try {
    // 1) STT
    const transcript = await whisperTranscribe(mediaUrl, sourceLangHint);
    if (!transcript.text && (!transcript.segments || !transcript.segments.length)) {
      return jsonError(res, 422, "Aucune parole détectée dans ce média");
    }

    // 2) Traduire segments (ou texte entier)
    let country = null;
    try {
      const { data: profile } = await admin
        .from("profiles")
        .select("country")
        .eq("user_id", user.id)
        .maybeSingle();
      country = normalizeCountry(profile?.country);
    } catch {
      /* ignore */
    }
    const provider = chooseProvider({ country });
    if (!provider) {
      return jsonError(res, 503, "Aucun fournisseur IA pour la traduction");
    }

    const sourceLines =
      transcript.segments?.length > 0
        ? transcript.segments.map((s) => s.text)
        : [transcript.text];

    const translatedLines = await translateBatch(
      sourceLines,
      targetLang,
      provider,
      country
    );

    const translatedSegments = (transcript.segments || []).map((s, i) => ({
      start: s.start,
      end: s.end,
      text: translatedLines[i] || s.text,
      original: s.text,
    }));

    const fullTranslated =
      translatedSegments.length > 0
        ? translatedSegments.map((s) => s.text).join(" ")
        : translatedLines[0] || "";

    const vttText = segmentsToVtt(
      translatedSegments.length
        ? translatedSegments
        : [{ start: 0, end: 5, text: fullTranslated }]
    );

    // Upload VTT
    let vttUrl = null;
    try {
      vttUrl = await uploadToStorage(
        admin,
        user.id,
        Buffer.from(vttText, "utf8"),
        "text/vtt",
        "vtt"
      );
    } catch (e) {
      console.warn("[translate-media] VTT upload failed", e.message);
    }

    // 3) Doublage optionnel
    let dubAudioUrl = null;
    if (mode === "dub") {
      let tts =
        (await ttsElevenLabs(fullTranslated)) ||
        (await ttsOpenAI(fullTranslated, targetLang));
      if (tts) {
        try {
          dubAudioUrl = await uploadToStorage(
            admin,
            user.id,
            tts.buffer,
            tts.contentType,
            "mp3"
          );
        } catch (e) {
          console.warn("[translate-media] dub upload failed", e.message);
        }
      }
    }

    // Persist
    try {
      if (videoId) {
        await admin.from("media_translations").upsert(
          {
            media_id: videoId,
            media_url: mediaUrl,
            target_lang: targetLang,
            source_lang: transcript.language,
            mode,
            status: "ready",
            transcript: transcript.text,
            vtt_text: vttText,
            vtt_url: vttUrl,
            dub_audio_url: dubAudioUrl,
            segments: translatedSegments,
            created_by: user.id,
          },
          { onConflict: "media_id,target_lang,mode" }
        );
      }
    } catch (e) {
      console.warn("[translate-media] cache save failed", e.message);
    }

    return res.status(200).json({
      ok: true,
      cached: false,
      mode,
      targetLang,
      sourceLang: transcript.language,
      transcript: transcript.text,
      translatedText: fullTranslated,
      segments: translatedSegments,
      vttText,
      vttUrl,
      dubAudioUrl,
    });
  } catch (err) {
    console.error("[translate-media]", err);
    return jsonError(
      res,
      err.status && err.status < 500 ? err.status : 502,
      err.message || "Traduction média indisponible"
    );
  }
}
