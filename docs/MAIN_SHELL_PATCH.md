# Patch MainShell.jsx

Dans `src/app/MainShell.jsx`, à l’intérieur de `tabProps`, ajoute :

```js
shop: { userId },
```

Exemple :

```js
const tabProps = {
  feed: { ... },
  // ...
  settings: { ... },
  shop: { userId },   // ← ajouter
};
```

Si `tabs.jsx` et `Navigation.jsx` sont remplacés par les versions de ce package, l’onglet **Boutiques** apparaît dans le menu « Plus ».
