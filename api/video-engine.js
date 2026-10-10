import { applyCors, getAdminClient, requireUser, rateLimitAsync } from "./_shared.js";

const JOB_TYPES = new Set(["transcode","thumbnail","captions","translate","dub","moderate","features","highlights","edit_plan"]);
const WORKER_SECRET = process.env.BAARO_WORKER_SECRET || "";

function json(res, status, body) { return res.status(status).json(body); }
function cleanText(v, max=4000) { return String(v ?? "").trim().slice(0,max); }

async function enqueue(admin, id, body) {
  const jobType = String(body.jobType || "");
  if (!JOB_TYPES.has(jobType)) throw Object.assign(new Error("jobType invalide"), {status:400});
  
  const targetId = body.id ? String(body.id) : null;
  if (!targetId) throw Object.assign(new Error("id requis"), {status:400});

  const { data: job, error } = await admin.from("media_jobs").insert({
    owner_id: id, 
    video_id: targetId, 
    asset_id: targetId, 
    job_type: jobType,
    priority: Math.min(100, Math.max(0, Number(body.priority) || 50)),
    payload: body.payload && typeof body.payload === "object" ? body.payload : {}
  }).select("*").single();

  if (error) throw error;
  return job;
}

async function rank(admin, id, limit) {
  const { data, error } = await admin.rpc("video_feed_candidates", { p_user_id: id, p_limit: limit });
  if (error) throw error;
  return data || [];
}

async function watch(admin, id, body) {
  const { error } = await admin.rpc("record_video_watch", {
    p_video_id: body.id, 
    p_watch_ms: Number(body.watchMs) || 0, 
    p_duration_ms: Number(body.durationMs) || 0,
    p_completed: Boolean(body.completed), 
    p_rewatched: Boolean(body.rewatched),
    p_liked: Boolean(body.liked), 
    p_shared: Boolean(body.shared),
    p_negative_signal: body.negativeSignal || null
  });
  if (error) throw error;
  return { ok: true };
}

async function aiEditPlan(admin, id, body) {
  const prompt = cleanText(body.prompt, 2500);
  const transcript = cleanText(body.transcript, 12000);
  if (!prompt && !transcript) throw Object.assign(new Error("prompt ou transcript requis"), {status:400});
  
  const system = `Tu es le moteur de montage IA de BAARO. Retourne uniquement JSON valide avec: hook, cuts:[{start_ms,end_ms,reason}], captions_style, music_mood, title_variants:[string], thumbnail_ideas:[string], aspect_ratios:[string]. Ne fabrique pas de timecodes si le transcript ne permet pas de les déduire.`;
  const input = `${prompt ? "OBJECTIF:\n"+prompt+"\n" : ""}${transcript ? "TRANSCRIPT:\n"+transcript : ""}`;
  
  if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_BASE) {
    const r = await fetch(`${process.env.OPENAI_API_BASE.replace(/\/$/,"")}/chat/completions`, {
      method: "POST", 
      headers: { "content-type": "application/json", "authorization": `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: process.env.OPENAI_MODEL || "gpt-4o-mini", temperature: 0.2, messages: [{ role: "system", content: system }, { role: "user", content: input }] })
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(d.error?.message || "IA indisponible"), { status: 502 });
    const text = d.choices?.[0]?.message?.content || "{}";
    let plan; try { plan = JSON.parse(text.replace(/^```json\s*|\s*```$/g, "")); } catch { plan = { raw: text }; }
    return { ok: true, plan };
  }
  return { ok: true, plan: { hook: "Créer une accroche à partir du premier moment fort.", cuts: [], captions_style: "dynamic", music_mood: "neutral", title_variants: [], thumbnail_ideas: [], aspect_ratios: ["9:16", "1:1", "16:9"], queued: true } };
}

async function monetization(admin, id, body) {
  const action = String(body.monetizationAction || "status");
  if (action === "status") {
    const { data } = await admin.from("creator_monetization").select("*").eq("creator_id", id).maybeSingle();
    const { data: earnings } = await admin.from("creator_earnings").select("net_amount,currency,status").eq("creator_id", id);
    const available = (earnings || []).filter(x => x.status === "available").reduce((s, x) => s + Number(x.net_amount || 0), 0);
    return { enabled: Boolean(data?.enabled), settings: data || null, available };
  }
  if (action === "enable") {
    const { data, error } = await admin.from("creator_monetization").upsert({ creator_id: id, enabled: true }, { onConflict: "creator_id" }).select("*").single();
    if (error) throw error; 
    return { settings: data };
  }
  if (action === "disable") {
    const { error } = await admin.from("creator_monetization").upsert({ creator_id: id, enabled: false }, { onConflict: "creator_id" });
    if (error) throw error; 
    return { ok: true };
  }
  throw Object.assign(new Error("Action monétisation invalide"), { status: 400 });
}

async function processJobs(admin) {
  const worker = process.env.BAARO_WORKER_ID || `vercel-${Date.now()}`;
  const { data: jobs, error } = await admin.rpc("claim_media_jobs", { p_limit: 5, p_worker: worker });
  if (error) throw error;
  
  const processor = String(process.env.BAARO_MEDIA_PROCESSOR_URL || "").replace(/\/$/, "");
  const results = [];
  
  for (const job of jobs || []) {
    try {
      if (!processor) throw new Error("BAARO_MEDIA_PROCESSOR_URL non configurée");
      const r = await fetch(processor, {
        method: "POST",
        headers: { "content-type": "application/json", ...(WORKER_SECRET ? { "x-baaro-worker-secret": WORKER_SECRET } : {}) },
        body: JSON.stringify({ job })
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `Worker HTTP ${r.status}`);
      await admin.from("media_jobs").update({ status: "completed", result: d.result || d, updated_at: new Date().toISOString(), error: null }).eq("id", job.id);
      results.push({ id: job.id, status: "completed" });
    } catch (e) {
      const dead = Number(job.attempts) >= Number(job.max_attempts);
      await admin.from("media_jobs").update({
        status: dead ? "dead" : "queued", 
        error: String(e.message || e).slice(0, 1000),
        available_at: new Date(Date.now() + Math.min(3600000, 2 ** Number(job.attempts) * 10000)).toISOString(),
        updated_at: new Date().toISOString()
      }).eq("id", job.id);
      results.push({ id: job.id, status: dead ? "dead" : "retry", error: String(e.message || e) });
    }
  }
  return results;
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== "POST" && req.method !== "GET") return json(res, 405, { error: "Méthode non autorisée" });
  
  const body = req.body || {};
  const isCron = req.headers["x-vercel-cron"] === "1" || (WORKER_SECRET && req.headers["x-baaro-worker-secret"] === WORKER_SECRET);
  
  if (isCron && (body.action === "process" || req.method === "GET")) {
    try { return json(res, 200, { ok: true, processed: await processJobs(getAdminClient()) }); }
    catch (e) { return json(res, 500, { ok: false, error: e.message }); }
  }
  
  const limit = await rateLimitAsync(req, { key: "video-engine", max: 60, windowMs: 60000 });
  if (!limit.ok) return json(res, limit.status, limit.body);
  
  const admin = getAdminClient();
  let user; 
  try { user = await requireUser(req, admin); } 
  catch (e) { return json(res, e.status || 401, { error: e.message }); }

  try {
    const action = String(body.action || "rank");
    if (action === "rank") return json(res, 200, { ok: true, videos: await rank(admin, user.id, Math.min(100, Math.max(1, Number(body.limit) || 20))) });
    if (action === "watch") return json(res, 200, await watch(admin, user.id, body));
    if (action === "enqueue") return json(res, 202, { ok: true, job: await enqueue(admin, user.id, body) });
    if (action === "edit_plan") return json(res, 200, await aiEditPlan(admin, user.id, body));
    if (action === "monetization") return json(res, 200, await monetization(admin, user.id, body));
    return json(res, 400, { error: "Action inconnue" });
  } catch (e) { 
    return json(res, e.status || 500, { ok: false, error: e.message || "Erreur moteur" }); 
  }
}
