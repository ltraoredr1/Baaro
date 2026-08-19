// Identifiant d'appareil persistant (pas un identifiant d'utilisateur).
// Sert uniquement de signal anti-abus : combien de comptes ont été créés
// depuis ce même navigateur / cette même app installée. Ce n'est pas une
// preuve d'identité — un utilisateur qui vide son stockage local ou change
// d'appareil obtient un nouvel identifiant. C'est voulu : c'est un frein,
// pas un verrou.

const KEY = "baaro:device_id";

export function getDeviceId() {
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `dev-${Date.now()}-${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch (e) {
    // Stockage indisponible (mode privé strict, etc.) : identifiant
    // temporaire propre à cette session seulement.
    return `volatile-${Date.now()}-${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
  }
}
