import { COLORS } from "../theme.js";

/**
 * Page confidentialité simple — accessible depuis Settings ou /privacy
 * À adapter avec ton nom légal / email de contact avant publication stores.
 */
export function PrivacyPage({ onBack }) {
  return (
    <div
      className="max-w-2xl mx-auto w-full pb-28 px-3"
      style={{ color: COLORS.ivory }}
    >
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold" style={{ color: COLORS.gold }}>
          Confidentialité — BAARO
        </h1>
        {onBack && (
          <button
            onClick={onBack}
            className="text-xs underline"
            style={{ color: COLORS.teal }}
          >
            Retour
          </button>
        )}
      </div>

      <div className="space-y-5 text-sm leading-relaxed" style={{ color: COLORS.mutedLight }}>
        <section>
          <h2 className="font-bold mb-2" style={{ color: COLORS.ivory }}>
            1. Données collectées
          </h2>
          <p>
            BAARO collecte les données nécessaires au fonctionnement du service :
            identifiant de compte (anonyme ou email), profil public (nom, bio,
            avatar), publications, messages chiffrés côté client, solde de points
            et transactions, identifiant technique d&apos;appareil (anti-abus), et
            logs techniques (erreurs, performance).
          </p>
        </section>

        <section>
          <h2 className="font-bold mb-2" style={{ color: COLORS.ivory }}>
            2. Utilisation
          </h2>
          <p>
            Ces données servent à fournir le réseau social, le portefeuille de
            points, la messagerie, les lives, la prévention de la fraude et
            l&apos;amélioration du produit. Nous ne vendons pas vos données
            personnelles à des tiers.
          </p>
        </section>

        <section>
          <h2 className="font-bold mb-2" style={{ color: COLORS.ivory }}>
            3. Messagerie
          </h2>
          <p>
            Les messages privés sont chiffrés de bout en bout lorsque cette
            fonctionnalité est active : le serveur ne stocke pas le contenu en
            clair. La clé privée reste sur votre appareil.
          </p>
        </section>

        <section>
          <h2 className="font-bold mb-2" style={{ color: COLORS.ivory }}>
            4. Points et BARO Coin
          </h2>
          <p>
            Les points et le BARO Coin sont des unités internes au service. Ils
            n&apos;ont pas de valeur monétaire garantie. Les rachats (cartes
            cadeaux, virements) sont soumis à des conditions d&apos;éligibilité
            (compte vérifié, ancienneté, anti-fraude) et peuvent être refusés en
            cas d&apos;abus.
          </p>
        </section>

        <section>
          <h2 className="font-bold mb-2" style={{ color: COLORS.ivory }}>
            5. Hébergement et sous-traitants
          </h2>
          <p>
            Les données sont hébergées via Supabase (base Postgres) et le front
            via Vercel. Les lives peuvent utiliser Daily.co. Les paiements
            éventuels passent par Stripe. Ces prestataires traitent les données
            selon leurs propres politiques et accords de sous-traitance.
          </p>
        </section>

        <section>
          <h2 className="font-bold mb-2" style={{ color: COLORS.ivory }}>
            6. Conservation et droits
          </h2>
          <p>
            Vous pouvez demander l&apos;accès, la rectification ou la suppression
            de vos données en contactant le support. Les comptes anonymes sont
            liés à l&apos;appareil ; la suppression du stockage local peut
            entraîner la perte d&apos;accès sans possibilité de récupération.
          </p>
        </section>

        <section>
          <h2 className="font-bold mb-2" style={{ color: COLORS.ivory }}>
            7. Contact
          </h2>
          <p>
            Pour toute question relative à la vie privée :{" "}
            <span style={{ color: COLORS.teal }}>privacy@baaro.app</span>{" "}
            (à remplacer par votre adresse réelle).
          </p>
        </section>

        <p className="text-xs pt-4" style={{ color: COLORS.muted }}>
          Dernière mise à jour : août 2026. Document indicatif — faire valider
          par un conseil juridique avant publication sur les stores.
        </p>
      </div>
    </div>
  );
}
