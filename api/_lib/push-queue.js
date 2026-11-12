
/**
 * BAARO — File durable des notifications push
 *
 * Tables :
 * - push_notification_jobs
 * - push_notification_dead_letters
 * - push_tokens
 * - notification_preferences
 *
 * RPC :
 * - claim_push_notification_jobs(p_limit integer)
 */

export const PUSH_QUEUE_BATCH_SIZE = 40;
export const PUSH_QUEUE_MAX_DELAY_MS = 6 * 60 * 60 * 1000;
export const PUSH_QUEUE_MAX_ATTEMPTS = 8;

const CATEGORY_COLUMNS = {
  message: "messages",
  messages: "messages",
  social: "social",
  live: "live",
  earnings: "earnings",
  wallet: "earnings",
  marketing: "marketing",
};

const DEFAULT_PREFERENCES = {
  messages: true,
  social: true,
  live: true,
  earnings: true,
  marketing: false,
};

function safeError(value, maxLength = 500) {
  const message =
    typeof value === "string"
      ? value
      : value?.message || String(value || "Erreur inconnue");

  return message
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .slice(0, maxLength);
}

function validId(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeTargets(targets) {
  if (!Array.isArray(targets)) return [];

  const unique = new Map();

  for (const target of targets) {
    if (
      !target ||
      !validId(target.id) ||
      !validId(target.user_id) ||
      !validId(target.token) ||
      !["web", "android", "ios"].includes(target.platform)
    ) {
      continue;
    }

    unique.set(`${target.user_id}:${target.id}`, target);
  }

  return [...unique.values()];
}

function normalizePayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Payload de notification invalide.");
  }

  const serialized = JSON.stringify(payload);

  if (!serialized || serialized.length > 20_000) {
    throw new Error("Payload de notification trop volumineux.");
  }

  return JSON.parse(serialized);
}

/**
 * Délai exponentiel avec jitter.
 * Tentative 1 : entre 2,5 et 5 secondes.
 * Le délai est plafonné à six heures.
 */
export function exponentialBackoffWithJitter(attempt, random = Math.random) {
  const safeAttempt = Math.max(
    1,
    Math.min(30, Math.floor(Number(attempt) || 1))
  );

  const base = Math.min(
    PUSH_QUEUE_MAX_DELAY_MS,
    5_000 * 2 ** (safeAttempt - 1)
  );

  let randomValue = Number(random());

  if (!Number.isFinite(randomValue)) randomValue = 0;
  randomValue = Math.max(0, Math.min(1, randomValue));

  return Math.min(
    PUSH_QUEUE_MAX_DELAY_MS,
    Math.round(base * (0.5 + randomValue * 0.5))
  );
}

function getPreference(row, category) {
  const column = CATEGORY_COLUMNS[category];

  if (!column) return false;

  if (!row) {
    return DEFAULT_PREFERENCES[column];
  }

  const value = row[column];

  if (typeof value === "boolean") return value;

  return DEFAULT_PREFERENCES[column];
}

async function updateJob(admin, job, patch) {
  const { data, error } = await admin
    .from("push_notification_jobs")
    .update(patch)
    .eq("id", job.id)
    .eq("claim_token", job.claim_token)
    .select("id");

  if (error) throw error;

  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("Le job n'est plus détenu par ce worker.");
  }

  return data[0];
}

async function archiveDeadLetter(admin, job, errorMessage) {
  const row = {
    source_job_id: job.id,
    batch_id: job.batch_id,
    user_id: job.user_id,
    token_id: job.token_id,
    payload: job.payload || {},
    last_error: safeError(errorMessage),
    attempts: Number(job.attempts) || 0,
    created_at: new Date().toISOString(),
  };

  const { error } = await admin
    .from("push_notification_dead_letters")
    .upsert(row, {
      onConflict: "source_job_id",
      ignoreDuplicates: true,
    });

  if (error) throw error;
}

async function removeInvalidToken(admin, job) {
  const { error } = await admin
    .from("push_tokens")
    .delete()
    .eq("id", job.token_id)
    .eq("user_id", job.user_id);

  if (error) throw error;
}

async function loadJobToken(admin, job) {
  const { data, error } = await admin
    .from("push_tokens")
    .select("id, user_id, token, platform")
    .eq("id", job.token_id)
    .eq("user_id", job.user_id)
    .maybeSingle();

  if (error) throw error;

  return data || null;
}

async function loadJobPreferences(admin, userIds) {
  if (!userIds.length) {
    return { rows: new Map(), error: null };
  }

  const { data, error } = await admin
    .from("notification_preferences")
    .select("*")
    .in("user_id", userIds);

  if (error) {
    return { rows: new Map(), error };
  }

  const rows = new Map();

  for (const row of data || []) {
    if (validId(row.user_id)) {
      rows.set(row.user_id, row);
    }
  }

  return { rows, error: null };
}

function isCategoryAllowed(preferences, category) {
  const column = CATEGORY_COLUMNS[category];

  if (!column) return false;

  return getPreference(preferences, category);
}

function emptyResult() {
  return {
    ok: true,
    claimed: 0,
    sent: 0,
    retryScheduled: 0,
    deadLettered: 0,
    cancelled: 0,
    errors: 0,
  };
}

/**
 * Ajoute les notifications à la file durable.
 *
 * Le token push n'est jamais enregistré dans push_notification_jobs.
 * L'idempotence est assurée par batch_id + token_id.
 */
export async function enqueuePushNotifications(
  admin,
  targets,
  payload,
  batchId
) {
  if (!admin) {
    return { ok: false, error: new Error("Client Supabase requis.") };
  }

  if (!validId(batchId) || batchId.length > 200) {
    return { ok: false, error: new Error("Identifiant de lot invalide.") };
  }

  let safePayload;

  try {
    safePayload = normalizePayload(payload);
  } catch (error) {
    return { ok: false, error };
  }

  const normalizedTargets = normalizeTargets(targets);

  if (!normalizedTargets.length) {
    return {
      ok: true,
      accepted: 0,
      queued: 0,
      sent: 0,
      deadLettered: 0,
      cancelled: 0,
    };
  }

  const rows = normalizedTargets.map((target) => ({
    batch_id: batchId,
    user_id: target.user_id,
    token_id: target.id,
    payload: safePayload,
    status: "queued",
    attempts: 0,
    max_attempts: PUSH_QUEUE_MAX_ATTEMPTS,
    available_at: new Date().toISOString(),
  }));

  try {
    const { error: insertError } = await admin
      .from("push_notification_jobs")
      .upsert(rows, {
        onConflict: "batch_id,token_id",
        ignoreDuplicates: true,
      });

    if (insertError) {
      return { ok: false, error: insertError };
    }

    const { data, error: readError } = await admin
      .from("push_notification_jobs")
      .select("status")
      .eq("batch_id", batchId);

    if (readError) {
      return { ok: false, error: readError };
    }

    const statuses = data || [];

    return {
      ok: true,
      accepted: normalizedTargets.length,
      queued: statuses.filter((row) => row.status === "queued").length,
      sent: statuses.filter((row) => row.status === "sent").length,
      deadLettered: statuses.filter((row) => row.status === "dead").length,
      cancelled: statuses.filter((row) => row.status === "cancelled").length,
    };
  } catch (error) {
    return { ok: false, error };
  }
}

/**
 * Réclame et traite un lot de jobs.
 *
 * Le RPC doit verrouiller les lignes et attribuer un claim_token unique.
 * Les mises à jour sont conditionnées par ce claim_token afin d'éviter
 * qu'un ancien worker écrase le travail d'un autre.
 */
export async function processPushQueue(admin, sendToken, options = {}) {
  const result = emptyResult();

  if (!admin || typeof sendToken !== "function") {
    return {
      ...result,
      ok: false,
      error: "Client Supabase et fonction d'envoi requis.",
    };
  }

  const now = typeof options.now === "function"
    ? options.now
    : Date.now;

  const random = typeof options.random === "function"
    ? options.random
    : Math.random;

  try {
    const { data: jobs, error: claimError } = await admin.rpc(
      "claim_push_notification_jobs",
      { p_limit: PUSH_QUEUE_BATCH_SIZE }
    );

    if (claimError) throw claimError;

    const claimedJobs = Array.isArray(jobs) ? jobs : [];
    result.claimed = claimedJobs.length;

    if (!claimedJobs.length) return result;

    const userIds = [
      ...new Set(
        claimedJobs
          .map((job) => job.user_id)
          .filter(validId)
      ),
    ];

    const preferencesResult = await loadJobPreferences(admin, userIds);

    // En cas d'erreur de lecture, aucun envoi n'est autorisé.
    if (preferencesResult.error) {
      result.errors += claimedJobs.length;
      return {
        ...result,
        ok: false,
        error: "Impossible de vérifier les préférences de notification.",
      };
    }

    for (const job of claimedJobs) {
      try {
        if (!job?.id || !job?.claim_token || !job?.user_id || !job?.token_id) {
          throw new Error("Job incomplet ou claim_token manquant.");
        }

        const category = job.payload?.category;
        const preferences = preferencesResult.rows.get(job.user_id);

        // Vérification des préférences à nouveau juste avant l'envoi.
        if (!isCategoryAllowed(preferences, category)) {
          await updateJob(admin, job, {
            status: "cancelled",
            last_error: "Notification désactivée dans les préférences.",
            completed_at: new Date(now()).toISOString(),
          });

          result.cancelled += 1;
          continue;
        }

        const tokenRow = await loadJobToken(admin, job);

        if (!tokenRow) {
          const message = "Jeton push introuvable ou supprimé.";

          await archiveDeadLetter(admin, job, message);

          await updateJob(admin, job, {
            status: "dead",
            last_error: message,
            completed_at: new Date(now()).toISOString(),
          });

          result.deadLettered += 1;
          continue;
        }

        if (
          tokenRow.user_id !== job.user_id ||
          tokenRow.id !== job.token_id ||
          !validId(tokenRow.token)
        ) {
          const message = "Jeton push invalide ou incohérent.";

          await archiveDeadLetter(admin, job, message);
          await removeInvalidToken(admin, job);

          await updateJob(admin, job, {
            status: "dead",
            last_error: message,
            completed_at: new Date(now()).toISOString(),
          });

          result.deadLettered += 1;
          continue;
        }

        let delivery;

        try {
          delivery = await sendToken(tokenRow, job.payload || {});
        } catch (error) {
          delivery = {
            ok: false,
            error: safeError(error),
          };
        }

        if (delivery?.ok === true) {
          await updateJob(admin, job, {
            status: "sent",
            sent_at: new Date(now()).toISOString(),
            last_error: null,
            completed_at: new Date(now()).toISOString(),
          });

          result.sent += 1;
          continue;
        }

        const message = safeError(
          delivery?.error || "Échec d'envoi de la notification."
        );

        const attempts = Math.max(0, Number(job.attempts) || 0);
        const maxAttempts = Math.max(
          1,
          Number(job.max_attempts) || PUSH_QUEUE_MAX_ATTEMPTS
        );

        const permanentlyInvalid = delivery?.dead === true;
        const exhausted = attempts >= maxAttempts;

        if (permanentlyInvalid || exhausted) {
          await archiveDeadLetter(admin, job, message);

          if (permanentlyInvalid) {
            await removeInvalidToken(admin, job);
          }

          await updateJob(admin, job, {
            status: "dead",
            last_error: message,
            completed_at: new Date(now()).toISOString(),
          });

          result.deadLettered += 1;
          continue;
        }

        const delay = exponentialBackoffWithJitter(
          Math.max(1, attempts),
          random
        );

        const availableAt = new Date(now() + delay).toISOString();

        await updateJob(admin, job, {
          status: "queued",
          available_at: availableAt,
          last_error: message,
        });

        result.retryScheduled += 1;
      } catch (error) {
        result.errors += 1;

        // Ne jamais considérer une erreur d'écriture comme un succès.
        console.error(
          "[push-queue] Échec de traitement du job :",
          safeError(error)
        );
      }
    }

    return result;
  } catch (error) {
    console.error(
      "[push-queue] Erreur du worker :",
      safeError(error)
    );

    return {
      ...result,
      ok: false,
      error: safeError(error),
    };
  }
}
