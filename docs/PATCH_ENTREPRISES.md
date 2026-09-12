# BAARO — Patch création Entreprises & Compagnies

Ce patch corrige la visibilité du parcours « Entreprises & Services ».

Fichiers concernés uniquement :
- src/app/tabs.jsx
- src/components/Navigation.jsx
- src/components/CompaniesTab.jsx

Résultat :
- nouvel onglet `companies` relié à CompaniesTab ;
- « Entreprises » visible dans le menu Plus sur mobile ;
- visible dans la navigation desktop ;
- bouton « Créer une entreprise » distinct de « Créer ma boutique » ;
- le formulaire existant permet déjà de choisir Transport, Radio, TV, Télécoms,
  Énergie, Banque/Finances, Assurance, Éducation, Santé, Hôtellerie/Tourisme,
  Commerce ou Autre.

Aucun fichier API ajouté/modifié.
Aucune virtualisation.
