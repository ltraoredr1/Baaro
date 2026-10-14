/**
 * BAARO AI Router - Mode Exclusif Gemini
 */

export function isOpen() {
  return false;
}

export function recordFailure() {}

export function recordSuccess() {}

export function openProviders() {
  return [];
}

export function normalizeCountry(value) {
  const country = String(value || "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(country) ? country : null;
}

export function chooseProvider() {
  return "gemini";
}

export function providerConfig(provider) {
  if (provider === "gemini") {
    return {
      key: process.env.GEMINI_API_KEY,
      base: "https://generativelanguage.googleapis.com/v1beta",
      model: process.env.GEMINI_MODEL || "gemini-3.8-flash",
    };
  }
  return null;
}
