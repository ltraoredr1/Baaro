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

const MIN_HANDLE_LENGTH = 3;
const MAX_HANDLE_LENGTH = 30;

function randomSuffix(length = 6) {
  // Génère un suffixe aléatoire pour les suggestions, pas une garantie
  // d'unicité. La disponibilité est toujours vérifiée en base.
  return Math.random().toString(36).slice(2, 2 + length).padEnd(length, "0");
}

function isReserved(value) {
  return RESERVED.has(String(value || "").toLowerCase());
}

function cleanCore(raw, maxLength = MAX_HANDLE_LENGTH) {
  return String(raw || "")
    .trim()
    .replace(/^@+/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_.]/g, "_")
    .replace(/_+/g, "_")
    .replace(/\.{2,}/g, ".")
    .replace(/^[._]+|[._]+$/g, "")
    .slice(0, maxLength)
    .replace(/[._]+$/g, "");
}

/**
 * Produit une base d'identifiant à partir d'un nom.
 * Cette fonction ne garantit pas que l'identifiant est disponible.
 */
export function slugifyUsername(input) {
  let core = cleanCore(input, 24);

  if (
    !core ||
    isReserved(core) ||
    /^\d+$/.test(core) ||
    core.length < MIN_HANDLE_LENGTH
  ) {
    core = "baaro_user";
  }

  return core;
}

/**
 * Normalise un identifiant.
 * Le résultat est toujours préfixé par @.
 */
export function normalizeHandle(raw, fallbackDisplayName = "") {
  let core = cleanCore(raw);

  if (
    !core ||
    core.length < MIN_HANDLE_LENGTH ||
    isReserved(core) ||
    /^\d+$/.test(core)
  ) {
    core = cleanCore(fallbackDisplayName);

    if (
      !core ||
      core.length < MIN_HANDLE_LENGTH ||
      isReserved(core) ||
      /^\d+$/.test(core)
    ) {
      core = "baaro_user";
    }
  }

  return `@${core}`;
}

/**
 * Renvoie un identifiant affichable sans accepter les valeurs
 * de remplacement génériques les plus courantes.
 */
export function displayHandle(handle, displayName = "") {
  const value = String(handle || "").trim();
  const core = value.replace(/^@+/, "");

  if (
    !core ||
    ["membre", "member", "user"].includes(core.toLowerCase()) ||
    /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(core)
  ) {
    return normalizeHandle("", displayName || "baaro_user");
  }

  return normalizeHandle(core, displayName || "baaro_user");
}

/**
 * Produit une suggestion déterministe pour un numéro de tentative.
 * attempt = 0 renvoie la base ; attempt = 1 renvoie la base suivie de 2.
 */
export function suggestHandle(displayName, attempt = 0) {
  const base = slugifyUsername(displayName);

  if (attempt <= 0) {
    return `@${base}`;
  }

  const suffix = String(attempt + 1);
  const prefix = base.slice(0, MAX_HANDLE_LENGTH - suffix.length);

  return `@${prefix}${suffix}`;
}

/**
 * Vérifie la disponibilité d'un identifiant dans profiles.
 *
 * Important :
 * - profiles.handle doit contenir l'identifiant avec @ ;
 * - une contrainte UNIQUE en base reste indispensable ;
 * - cette vérification seule ne protège pas contre deux inscriptions
 *   simultanées utilisant le même identifiant.
 */
export async function checkHandleAvailable(supabase, handle, id = null) {
  const raw = String(handle || "").trim();
  const core = cleanCore(raw);

  if (
    !core ||
    core.length < MIN_HANDLE_LENGTH ||
    core.length > MAX_HANDLE_LENGTH ||
    isReserved(core) ||
    /^\d+$/.test(core)
  ) {
    const normalized = core ? `@${core}` : "";
    return {
      ok: false,
      handle: normalized,
      reason: !core || core.length < MIN_HANDLE_LENGTH
        ? "L'identifiant doit faire au moins 3 caractères."
        : "Cet identifiant n'est pas autorisé.",
      suggestion: suggestHandle(core || "baaro_user", 1),
    };
  }

  const normalized = `@${core}`;

  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("handle", normalized)
    .maybeSingle();

  if (error) {
    console.error("[username] Vérification de disponibilité :", error);

    return {
      ok: false,
      handle: normalized,
      reason: "Impossible de vérifier l'identifiant. Réessaie.",
    };
  }

  if (data && String(data.id) !== String(id ?? "")) {
    const baseName = core.replace(/\d+$/, "") || core;

    return {
      ok: false,
      handle: normalized,
      reason: `L'identifiant ${normalized} est déjà pris.`,
      suggestion: suggestHandle(baseName, 1),
    };
  }

  return {
    ok: true,
    handle: normalized,
  };
}

/**
 * Résout un conflit en cherchant des identifiants alternatifs.
 * La disponibilité de chaque candidat est vérifiée avant son retour.
 *
 * Le résultat doit toujours être sauvegardé en base, en gérant également
 * une éventuelle violation UNIQUE due à une requête concurrente.
 */
export async function resolveUniqueHandle(
  supabase,
  rawHandle,
  displayName,
  id = null
) {
  const requestedCore = cleanCore(rawHandle);
  const candidate = normalizeHandle(rawHandle, displayName);

  const first = await checkHandleAvailable(supabase, candidate, id);

  if (first.ok) {
    return {
      handle: first.handle,
      conflict: false,
    };
  }

  const base = slugifyUsername(
    displayName || requestedCore || candidate.replace(/^@/, "")
  );

  const candidates = [];
  const seen = new Set([candidate.toLowerCase()]);

  function addCandidate(value) {
    const normalized = normalizeHandle(value, base);
    const key = normalized.toLowerCase();

    if (!seen.has(key)) {
      seen.add(key);
      candidates.push(normalized);
    }
  }

  if (first.suggestion) {
    addCandidate(first.suggestion);
  }

  for (let attempt = 1; attempt <= 20; attempt += 1) {
    addCandidate(suggestHandle(base, attempt));
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    addCandidate(`@${base.slice(0, 20)}_${randomSuffix(6)}`);
  }

  for (const tryHandle of candidates) {
    const check = await checkHandleAvailable(supabase, tryHandle, id);

    if (check.ok) {
      return {
        handle: check.handle,
        conflict: true,
        message:
          `${candidate} n'est pas disponible. ` +
          `Identifiant proposé : ${check.handle}`,
      };
    }
  }

  // Dernière possibilité : conserver l'identifiant actuel si celui-ci
  // appartient bien à l'utilisateur et reste disponible.
  if (id) {
    const { data: current, error } = await supabase
      .from("profiles")
      .select("handle")
      .eq("id", id)
      .maybeSingle();

    if (!error && current?.handle) {
      const currentCheck = await checkHandleAvailable(
        supabase,
        current.handle,
        id
      );

      if (currentCheck.ok) {
        return {
          handle: currentCheck.handle,
          conflict: true,
          message:
            `${candidate} n'est pas disponible. ` +
            `Identifiant actuel conservé : ${currentCheck.handle}`,
        };
      }
    }
  }

  return {
    handle: null,
    conflict: true,
    message:
      "Impossible de trouver un identifiant disponible. Réessaie.",
  };
}

/**
 * Détecte une violation d'unicité liée à handle.
 * Une erreur 23505 sur une autre colonne ne doit pas être assimilée
 * automatiquement à un conflit d'identifiant.
 */
export function isHandleUniqueViolation(error) {
  if (!error) {
    return false;
  }

  const code = String(error.code || "");
  const message = String(error.message || "").toLowerCase();
  const details = String(error.details || "").toLowerCase();
  const hint = String(error.hint || "").toLowerCase();
  const combined = `${message} ${details} ${hint}`;

  if (code !== "23505") {
    return (
      combined.includes("profiles_handle") ||
      combined.includes("profiles.handle") ||
      (combined.includes("unique") && combined.includes("handle"))
    );
  }

  return (
    combined.includes("profiles_handle") ||
    combined.includes("profiles.handle") ||
    combined.includes("(handle)") ||
    combined.includes("handle_key")
  );
}
