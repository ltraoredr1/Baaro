import { config } from "./lib/config.mjs";
import { assertNativeReady } from "./lib/native.mjs";
import { processJob } from "./processor.mjs";

const supabaseUrl = String(config.supabase.url || "").replace(/\/+$/, "");
const serviceKey = config.supabase.serviceRoleKey;

if (!supabaseUrl || !serviceKey) {
  throw new Error("SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont obligatoires.");
}

if (!config.r2.publicBaseUrl) {
  throw new Error("R2_PUBLIC_BASE_URL est obligatoire pour publier la version mobile.");
}

await assertNativeReady();

async function db(path, { method = "GET", body, prefer } = {}) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  const raw = await response.text();
  let data = null;

  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = raw;
  }

  if (!response.ok) {
    throw new Error(`Supabase HTTP ${response.status}: ${String(raw).slice(0, 1200)}`);
  }

  return data;
}

async function updateJob(job, values) {
  await db(`media_jobs?id=eq.${encodeURIComponent(job.id)}`, {
    method: "PATCH",
    body: {
      ...values,
      updated_at: new Date().toISOString(),
    },
  });
}

const batchSize = Math.max(
  1,
  Math.min(3, Number(process.env.BAARO_MEDIA_JOB_BATCH_SIZE) || 1)
);

const workerId = process.env.K_REVISION || `cloud-run-job-${process.pid}`;

const jobs = await db("rpc/claim_video_transcode_jobs", {
  method: "POST",
  body: {
    p_limit: batchSize,
    p_worker: workerId,
  },
});

if (!Array.isArray(jobs) || jobs.length === 0) {
  console.log("[video-transcode] Aucune tâche en attente.");
  process.exit(0);
}

console.log(`[video-transcode] ${jobs.length} tâche(s) récupérée(s).`);

for (const job of jobs) {
  try {
    const result = await processJob(job);

    if (!result?.url || !/^https?:\/\//i.test(result.url)) {
      throw new Error("Le worker n'a pas produit une URL publique valide.");
    }

    const updatedVideos = await db(
      `videos?id=eq.${encodeURIComponent(job.video_id)}`,
      {
        method: "PATCH",
        body: { video_mobile_url: result.url },
        prefer: "return=representation",
      }
    );

    if (!Array.isArray(updatedVideos) || updatedVideos.length === 0) {
      throw new Error("Impossible d'enregistrer la version mobile dans videos.");
    }

    await updateJob(job, {
      status: "completed",
      result,
      error: null,
      locked_at: null,
      locked_by: null,
    });

    console.log(`[video-transcode] Vidéo ${job.video_id} terminée.`);
  } catch (error) {
    const attempts = Number(job.attempts) || 1;
    const maxAttempts = Number(job.max_attempts) || 5;
    const terminal = attempts >= maxAttempts;
    const delay = Math.min(
      60 * 60 * 1000,
      60 * 1000 * (2 ** Math.min(attempts, 5))
    );

    console.error(`[video-transcode] ${job.id}:`, error?.message || error);

    try {
      await updateJob(job, {
        status: terminal ? "dead" : "queued",
        error: String(error?.message || error).slice(0, 2000),
        available_at: new Date(Date.now() + delay).toISOString(),
        locked_at: null,
        locked_by: null,
      });
    } catch (updateError) {
      console.error("[video-transcode] Impossible de sauvegarder l'échec :", updateError);
      process.exitCode = 1;
    }
  }
}
