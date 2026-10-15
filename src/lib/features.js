import config from "../app-config.json";

export const FEATURES = config.features;

/**
 * Vérifie si une fonctionnalité v2.0.0 est activée
 * Exemple d'utilisation : if (isFeatureEnabled("ai_editing", "translation")) { ... }
 */
export function isFeatureEnabled(category, featureName) {
  return FEATURES[category]?.includes(featureName) ?? false;
}
