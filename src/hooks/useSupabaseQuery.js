// Ton execute ne voit pas quand enabled passe de false -> true
const execute = useCallback(async () => {
  // ...
}, [...deps, enabled, initialData]); // <- ajoute enabled

// et enlève le eslint-disable, il ne sert plus
