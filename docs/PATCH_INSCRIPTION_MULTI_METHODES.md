# BAARO — inscription multi-méthodes

Le formulaire d'authentification prend maintenant en charge :

- E-mail + mot de passe
- Numéro de téléphone + code SMS (OTP)
- Facebook
- X (provider Supabase `twitter`)
- Google
- Mode invité conservé

## Configuration Supabase obligatoire

### E-mail
Dans Authentication > Providers, activer Email.
Si la confirmation d'e-mail est activée, l'utilisateur doit confirmer son adresse avant sa première session complète.

### Téléphone
Dans Authentication > Providers > Phone, activer Phone et configurer un fournisseur SMS compatible avec Supabase.
Le formulaire attend un numéro au format international E.164 (`+223...`, `+33...`, etc.).

### Facebook / X / Google
Activer les providers correspondants dans Supabase et renseigner leurs identifiants OAuth.
Ajouter l'URL de callback Supabase demandée par le provider.
Dans Supabase, ajouter également l'URL publique de BAARO dans les Redirect URLs.

Le code utilise :
- Facebook : `facebook`
- X : `twitter` (nom du provider Supabase)
- Google : `google`

## Profils
La migration `028_auth_accounts.sql` ajoute un trigger `auth.users` qui crée automatiquement une ligne `profiles` pour chaque nouveau compte, quel que soit le moyen d'inscription. Elle crée aussi les profils manquants des utilisateurs existants.

Aucune nouvelle API serverless n'est ajoutée.
