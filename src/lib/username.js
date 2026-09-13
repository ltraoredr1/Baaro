/**
 * Utilitaires nom d'utilisateur BAARO
 * Place : src/lib/username.js
 */

const RESERVED = new Set([
  "membre",
  "member",
  "user",
  "admin",
  "baaro",
  "support",
  "null",
  "undefined",
  "me",
  "profil",
  "profile",
  "settings",
  "api",
  "www",
  "help",
]);

export function slugifyUsername(input) {
  let s = String(input || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_")
    .slice(0, 24);

  if (!s || RESERVED.has(s) || /^\d+$/.test(s)) {
    s = "baaro";
  }
  return s;
}

export function normalizeHandle(raw, fallbackDisplayName = "") {
  let core = String(raw || "")
    .trim()
    .replace(/^@+/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_.]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 30);

  if (!core || core.length < 3 || RESERVED.has(core)) {
    core = slugifyUsername(fallbackDisplayName);
    if (core.length < 3) {
      core = `baaro_${Math.random().toString(36).slice(2, 6)}`;
    }
  }

  return `@${core}`;
}

export function displayHandle(handle, displayName) {
  const h = String(handle || "").trim();
  if (!h || h === "@membre" || h === "@member" || h === "@user") {
    return normalizeHandle("", displayName || "baaro");
  }
  const core = h.replace(/^@/, "");
  if (/^[0-9a-f]{8}/i.test(core) && core.includes("-")) {
    return normalizeHandle("", displayName || "baaro");
  }
  return h.startsWith("@") ? h : `@${h}`;
}

export function suggestHandle(displayName, attempt = 0) {
  const base = slugifyUsername(displayName);
  if (attempt <= 0) return `@${base}`;
  const suffix = String(attempt + 1);
  return `@${base.slice(0, Math.max(1, 30 - suffix.length))}${suffix}`;
}

/**
 * @returns {{ ok: true, handle: string } | { ok: false, handle: string, reason: string, suggestion?: string }}
 */
export async function checkHandleAvailable(supabase, handle, userId = null) {
  const normalized = normalizeHandle(handle, "");
  const core = normalized.replace(/^@/, "");

  if (core.length < 3) {
    return {
      ok: false,
      handle: normalized,
      reason: "L'identifiant doit faire au moins 3 caractères.",
    };
  }
  if (RESERVED.has(core)) {
    return {
      ok: false,
      handle: normalized,
      reason: "Cet identifiant est réservé.",
      suggestion: suggestHandle(`${core}_ok`, 1),
    };
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("handle", normalized)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    return {
      ok: false,
      handle: normalized,
      reason: "Impossible de vérifier l'identifiant. Réessaie.",
    };
  }

  if (data && data.user_id !== userId) {
    let suggestion = null;
    const baseName = core.replace(/\d+$/, "") || core;
    for (let i = 1; i <= 12; i++) {
      const candidate = suggestHandle(baseName, i);
      const { data: taken } = await supabase
        .from("profiles")
        .select("user_id")
        .eq("handle", candidate)
        .maybeSingle();
      if (!taken || taken.user_id === userId) {
        suggestion = candidate;
        break;
      }
    }
    return {
      ok: false,
      handle: normalized,
      reason: `L'identifiant ${normalized} est déjà pris.`,
      suggestion: suggestion || suggestHandle(baseName, Date.now() % 1000),
    };
  }

  return { ok: true, handle: normalized };
}

export async function resolveUniqueHandle(
  supabase,
  rawHandle,
  displayName,
  userId
) {
  let candidate = normalizeHandle(rawHandle, displayName);
  const first = await checkHandleAvailable(supabase, candidate, userId);

  if (first.ok) {
    return { handle: first.handle, conflict: false };
  }

  if (!first.suggestion && first.reason?.includes("caractères")) {
    return {
      handle: candidate,
      conflict: true,
      message: first.reason,
    };
  }

  const base = slugifyUsername(displayName || candidate.replace(/^@/, ""));
  for (let attempt = 1; attempt <= 15; attempt++) {
    const tryHandle =
      first.suggestion && attempt === 1
        ? first.suggestion
        : suggestHandle(base, attempt);
    const check = await checkHandleAvailable(supabase, tryHandle, userId);
    if (check.ok) {
      return {
        handle: check.handle,
        conflict: true,
        message: `${candidate} était pris — identifiant attribué : ${check.handle}`,
      };
    }
  }

  const fallback = `@${base.slice(0, 20)}_${Math.random().toString(36).slice(2, 6)}`;
  return {
    handle: fallback,
    conflict: true,
    message: `${candidate} était pris — identifiant attribué : ${fallback}`,
  };
}

export function isHandleUniqueViolation(error) {
  if (!error) return false;
  const msg = `${error.message || ""} ${error.details || ""} ${error.hint || ""}`.toLowerCase();
  const code = String(error.code || "");
  return (
    code === "23505" ||
    msg.includes("profiles_handle") ||
    msg.includes("duplicate key") ||
    (msg.includes("unique") && msg.includes("handle"))
  );
}
