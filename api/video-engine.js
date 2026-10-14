import { applyCors, getAdminClient, requireUser, rateLimitAsync } from "./_shared.js";
import { chooseProvider, providerConfig } from "./_lib/ai/router.js";
import { callOpenAICompatible } from "./_lib/ai/openai-compatible.js";

const JOB_TYPES = new Set(["transcode","thumbnail","captions","translate","dub","moderate","features","highlights","edit_plan"]);
const WORKER_SECRET = process.env.BAARO_WORKER_SECRET || "";

function json(res, status, body) { return res.status(status).json(body); }
function cleanText(v, max=4000) { return String(v ?? "").trim().slice(0,max); }

async function aiEditPlan(admin, id, body) {
  const prompt = cleanText(body.prompt, 2500);
  const transcript = cleanText(body.transcript, 12000);
  if (!prompt && !transcript) throw Object.assign(new Error("prompt ou transcript requis"), {status:400});
  
  const system = `Tu es le moteur de montage IA de BAARO. Retourne uniquement du JSON valide avec: hook, cuts:[{start_ms,end_ms,reason}], captions_style, music_mood, title_variants:[string], thumbnail_ideas:[string], aspect_ratios:[string].`;
  const input = `${prompt ? "OBJECTIF:\n"+prompt+"\n" : ""}${transcript ? "TRANSCRIPT:\n"+transcript : ""}`;
  
  const provider = chooseProvider({ requested: body.provider });
  const cfg = providerConfig(provider);

  if (cfg?.key && cfg?.base) {
    try {
      const res = await callOpenAICompatible({
        base: cfg.base,
        key: cfg.key,
        model: cfg.model,
        system,
        messages: [{ role: "user", content: input }],
        maxTokens: 2000
      });
      let plan; 
      try { plan = JSON.parse(res.reply.replace(/^```json\s*|\s*```$/g, "")); } 
      catch { plan = { raw: res.reply }; }
      return { ok: true, provider, plan };
    } catch (e) {
      console.warn("Échec IA plan de montage:", e.message);
    }
  }

  return { ok: true, plan: { hook: "Créer une accroche à partir du premier moment fort.", cuts: [], captions_style: "dynamic", music_mood: "neutral", title_variants: [], thumbnail_ideas: [], aspect_ratios: ["9:16", "1:1", "16:9"], queued: true } };
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
