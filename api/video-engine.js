import { applyCors, getAdminClient, requireUser, rateLimitAsync } from "./_shared.js";
import { GoogleGenAI } from "@google/genai";

const JOB_TYPES = new Set(["transcode","thumbnail","captions","translate","dub","moderate","features","highlights","edit_plan"]);
const WORKER_SECRET = process.env.BAARO_WORKER_SECRET || "";

function json(res, status, body) { return res.status(status).json(body); }
function cleanText(v, max=4000) { return String(v ?? "").trim().slice(0,max); }

async function aiEditPlan(admin, id, body) {
  const prompt = cleanText(body.prompt, 2500);
  const transcript = cleanText(body.transcript, 12000);
  if (!prompt && !transcript) throw Object.assign(new Error("prompt ou transcript requis"), {status:400});
  
  const systemInstruction = `Tu es le moteur de montage IA de BAARO. Retourne uniquement du JSON valide (sans aucun bloc markdown autour si possible) avec cette structure exacte:
{
  "hook": "...",
  "cuts": [{"start_ms": 0, "end_ms": 1000, "reason": "..."}],
  "captions_style": "dynamic",
  "music_mood": "neutral",
  "title_variants": ["..."],
  "thumbnail_ideas": ["..."],
  "aspect_ratios": ["9:16", "1:1", "16:9"]
}`;

  const input = `${prompt ? "OBJECTIF:\n"+prompt+"\n" : ""}${transcript ? "TRANSCRIPT:\n"+transcript : ""}`;
  
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (!apiKey) throw new Error("Clé API Gemini manquante sur le serveur");

  const ai = new GoogleGenAI({ apiKey });

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `${systemInstruction}\n\nDONNÉES D'ENTRÉE:\n${input}`,
    });

    const rawReply = String(response.text || "").trim();
    let plan; 
    try { 
      // Nettoyage des balises markdown si présentes
      const cleanedJson = rawReply.replace(/^```json\s*|\s*```$/g, "").trim();
      plan = JSON.parse(cleanedJson); 
    } 
    catch { 
      plan = { raw: rawReply }; 
    }

    return { ok: true, provider: "gemini", plan };
  } catch (e) {
    console.error("Erreur Gemini plan de montage:", e.message);
    throw Object.assign(new Error("Erreur de génération du plan par Gemini"), { status: 502 });
  }
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== "POST" && req.method !== "GET") return json(res, 405, { error: "Méthode non autorisée" });
  
  const body = req.body || {};
  const admin = getAdminClient();
  const limit = await rateLimitAsync(req, { key: "video-engine", max: 60, windowMs: 60000 });
  if (!limit.ok) return json(res, limit.status, limit.body);

  let user; 
  try { user = await requireUser(req, admin); } 
  catch (e) { return json(res, e.status || 401, { error: e.message }); }

  try {
    const action = String(body.action || "rank");
    if (action === "edit_plan") return json(res, 200, await aiEditPlan(admin, user.id, body));
    return json(res, 400, { error: "Action non gérée directement" });
  } catch (e) { 
    return json(res, e.status || 500, { ok: false, error: e.message || "Erreur moteur" }); 
  }
}
