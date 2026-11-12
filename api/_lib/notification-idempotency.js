export const NOTIFICATION_IDEMPOTENCY_INDEX =
  "notifications_idempotency_key_uidx";

export function buildInteractionNotificationKey({
  type,
  recipientId,
  actorId,
  sourceId,
  eventKey = "",
}) {
  return ["interaction", type, recipientId, actorId, sourceId, eventKey]
    .map((part) => String(part || ""))
    .join(":");
}

function isIdempotencyConflict(error) {
  if (error?.code !== "23505") return false;
  const description = [error.constraint, error.message, error.details]
    .filter(Boolean)
    .join(" ");
  return description.includes(NOTIFICATION_IDEMPOTENCY_INDEX);
}

function isMissingPreviewColumn(error) {
  const description = [error?.message, error?.details, error?.hint]
    .filter(Boolean)
    .join(" ");
  return /preview/i.test(description);
}

async function insertOnce(admin, row) {
  const { data, error } = await admin
    .from("notifications")
    .insert(row)
    .select("notification_id")
    .single();

  if (isIdempotencyConflict(error)) {
    return { inserted: false, notificationId: null };
  }
  return { data, error };
}

/**
 * One database INSERT, protected by the notifications.idempotency_key unique
 * index. Concurrent requests with the same key produce one row; the loser is
 * reported as a duplicate rather than relying on a racy preflight SELECT.
 */
export async function insertNotificationOnce(admin, row) {
  if (!row?.idempotency_key) {
    throw new TypeError("idempotency_key obligatoire pour une notification.");
  }

  let result = await insertOnce(admin, row);
  if (result.inserted === false) return result;

  if (
    result.error &&
    row.preview !== undefined &&
    isMissingPreviewColumn(result.error)
  ) {
    const { preview: _preview, ...legacyRow } = row;
    result = await insertOnce(admin, legacyRow);
    if (result.inserted === false) return result;
  }

  if (result.error) throw result.error;
  return {
    inserted: true,
    notificationId: result.data?.notification_id || null,
  };
}

/**
 * Atomic bulk insert for audience notifications. The unique index ignores
 * recipients already notified for this event while returning newly inserted
 * rows only; callers may still re-enqueue push with the same stable batch key.
 */
export async function insertNotificationsOnce(admin, rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  if (rows.some((row) => !row?.idempotency_key)) {
    throw new TypeError("Chaque notification doit avoir une idempotency_key.");
  }

  let result = await admin
    .from("notifications")
    .upsert(rows, {
      onConflict: "idempotency_key",
      ignoreDuplicates: true,
    })
    .select("notification_id, idempotency_key");

  if (
    result.error &&
    rows.some((row) => row.preview !== undefined) &&
    isMissingPreviewColumn(result.error)
  ) {
    const legacyRows = rows.map(({ preview: _preview, ...row }) => row);
    result = await admin
      .from("notifications")
      .upsert(legacyRows, {
        onConflict: "idempotency_key",
        ignoreDuplicates: true,
      })
      .select("notification_id, idempotency_key");
  }

  if (result.error) throw result.error;
  return result.data || [];
}
