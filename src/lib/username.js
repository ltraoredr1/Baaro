const RESERVED = new Set([
  "membre", "member", "user", "admin", "baaro", "support",
  "null", "undefined", "me", "profil", "profile", "settings", "api", "www", "help"
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
    const fallback = slugifyUsername(fallbackDisplayName);
    core = fallback && !RESERVED.has(fallback) ? fallback : "baaro_ok2";
    if (core.length < 3 || RESERVED.has(core)) {
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

export async function checkHandleAvailable(supabase, handle, id = null) {
  const normalized = normalizeHandle(handle, "");
  const core = normalized.replace(/^@/, "");

  if (core.length < 3) {
    return { ok: false, handle: normalized, reason: "L'identifiant doit faire au moins 3 caractères." };
  }
  if (RESERVED.has(core)) {
    return { ok: false, handle: normalized, reason: "Cet identifiant est réservé.", suggestion: suggestHandle(`${core}_ok`, 1) };
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("handle", normalized)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    return { ok: false, handle: normalized, reason: "Impossible de vérifier l'identifiant. Réessaie." };
  }

  if (data && data.id !== id) {
    const baseName = core.replace(/\d+$/, "") || core;
    const candidate = suggestHandle(baseName, Math.floor(Math.random() * 90) + 10);
    return { ok: false, handle: normalized, reason: `L'identifiant ${normalized} est déjà pris.`, suggestion: candidate };
  }

  return { ok: true, handle: normalized };
}

export async function resolveUniqueHandle(supabase, rawHandle, displayName, id) {
  const requested = String(rawHandle || "").trim();
  let candidate = normalizeHandle(requested, displayName);
  const first = await checkHandleAvailable(supabase, candidate, id);

  if (first.ok) return { handle: first.handle, conflict: false };

  const base = slugifyUsername(displayName || candidate.replace(/^@/, ""));
  const candidates = [];
  if (first.suggestion) candidates.push(first.suggestion);
  for (let attempt = 1; attempt <= 10; attempt++) {
    candidates.push(suggestHandle(base, attempt));
  }
  candidates.push(`@baaro_${Math.random().toString(36).slice(2, 8)}`);

  for (const tryHandle of candidates) {
    const check = await checkHandleAvailable(supabase, tryHandle, id);
    if (check.ok) {
      return {
        handle: check.handle,
        conflict: true,
        message: `${candidate} n'est pas disponible — identifiant utilisé : ${check.handle}`,
      };
    }
  }

  if (id) {
    const { data: current } = await supabase
      .from("profiles")
      .select("handle")
      .eq("id", id)
      .maybeSingle();
    if (current?.handle) {
      const currentCheck = await checkHandleAvailable(supabase, current.handle, id);
      if (currentCheck.ok) {
        return {
          handle: current.handle,
          conflict: true,
          message: `${candidate} n'est pas disponible — identifiant actuel conservé : ${current.handle}`,
        };
      }
    }
  }

  return { handle: `@baaro_${Math.random().toString(36).slice(2, 8)}`, conflict: true, message: `${candidate} n'est pas disponible.` };
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
