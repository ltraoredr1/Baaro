import { BackBar } from "./BackBar.jsx";
import { COLORS } from "../theme.js";

const DOCS = {
  terms: { title: "Conditions d'utilisation — BAARO", sections: [
    ["1. Acceptation", "En créant ou utilisant un compte BAARO, vous acceptez ces conditions, la politique de confidentialité, les règles de la communauté et les règles applicables aux paiements, achats et retraits."],
    ["2. Compte", "Vous devez fournir des informations exactes, protéger vos identifiants et ne pas créer de comptes destinés à contourner une suspension, une limite ou un dispositif anti-fraude."],
    ["3. Contenu", "Vous restez responsable des contenus que vous publiez et devez disposer des droits nécessaires. BAARO peut limiter, masquer ou retirer un contenu qui viole la loi, les droits d'autrui ou les règles de la communauté."],
    ["4. Monétisation", "Les revenus, récompenses et commissions sont soumis aux règles de chaque programme. Les points Creator Rewards ne sont pas de la monnaie et ne sont ni transférables ni encaissables. Les revenus monétaires peuvent rester en attente jusqu'à validation, remboursement, contrôle anti-fraude ou KYC."],
    ["5. Paiements et retraits", "Les achats sont traités par les prestataires de paiement disponibles. Un retrait créateur n'est possible que si les conditions d'éligibilité, KYC, minimum de retrait, contrôles de risque et disponibilité du prestataire sont satisfaits."],
    ["6. Suspension", "BAARO peut suspendre ou fermer un compte en cas de fraude, abus, violation des règles ou obligation légale. Les soldes peuvent être placés en retenue lorsqu'une vérification ou un litige est nécessaire."],
    ["7. Disponibilité", "Certaines fonctionnalités peuvent dépendre du pays, du fournisseur de paiement, de l'âge, de la réglementation ou de la disponibilité technique."],
    ["8. Modifications", "BAARO peut modifier les fonctionnalités et les présentes conditions. Les changements importants seront signalés par un moyen approprié."] ] },
  community: { title: "Règles de la communauté", sections: [
    ["Respect", "Pas de harcèlement, menaces, haine ciblée, doxxing ou intimidation."],
    ["Sécurité", "Pas de fraude, usurpation, phishing, manipulation de paiements, farming de récompenses ou création de comptes destinés à contourner les protections."],
    ["Contenu interdit", "Pas de contenu illégal, exploitation sexuelle de mineurs, terrorisme, vente de biens interdits ou contenu visant à faciliter un préjudice grave."],
    ["Authenticité", "Pas de faux engagement, bots, vues artificielles, spam ou manipulation des classements et programmes Creator Rewards."],
    ["Modération", "BAARO peut limiter la visibilité, retirer un contenu, suspendre des fonctionnalités ou fermer un compte lorsque cela est nécessaire."] ] },
  refund: { title: "Achats, remboursements et litiges", sections: [
    ["Achats numériques", "Les produits numériques, boosts, crédits fermés, cosmétiques, billets et services peuvent être soumis à des règles différentes selon leur nature et leur fournisseur."],
    ["Remboursement", "Les remboursements sont traités selon la loi applicable, les conditions du produit et les règles du prestataire de paiement. Une demande ne doit pas servir à conserver un avantage déjà consommé."],
    ["Chargeback", "Un paiement contesté peut entraîner une suspension temporaire du bénéfice acheté, une retenue de revenus ou une vérification anti-fraude."],
    ["Litige Marketplace", "Les vendeurs et acheteurs doivent fournir des informations exactes. BAARO peut retenir temporairement une somme pendant la résolution d'un litige."] ] },
  creator: { title: "Conditions Creator Economy", sections: [
    ["Éligibilité", "L'accès à la monétisation dépend du pays, de l'âge, du statut du compte, du respect des règles et, lorsque nécessaire, du KYC."],
    ["Revenus", "Les revenus sont calculés selon les règles du programme et peuvent être corrigés en cas de fraude, remboursement, annulation ou erreur de mesure."],
    ["Points", "Les Creator Rewards sont des points de programme. Ils ne constituent pas un dépôt, une monnaie électronique, une créance payable en espèces ou un solde retirable."],
    ["Retraits", "Les retraits monétaires sont soumis au minimum de retrait, au KYC, aux contrôles de risque et à la disponibilité d'un partenaire de paiement autorisé."] ] },
  merchant: { title: "Conditions vendeurs et commerçants", sections: [
    ["Responsabilité", "Le vendeur est responsable de la légalité, de la qualité, de la livraison et de la description de ses produits ou services."],
    ["Commissions", "BAARO peut appliquer les commissions affichées au moment de la transaction. Les commissions peuvent varier selon le programme."],
    ["Remboursements et litiges", "Les vendeurs doivent coopérer aux demandes de preuve, remboursements et procédures de litige."] ] },
  cookies: { title: "Cookies et technologies similaires", sections: [
    ["Essentiels", "BAARO utilise des technologies nécessaires à la session, la sécurité, la préférence de langue et le fonctionnement du service."],
    ["Mesure", "Des mesures techniques peuvent être utilisées pour comprendre les performances et détecter les abus. Les paramètres disponibles peuvent varier selon le pays et le produit."] ] }
};

export function LegalPage({ type="terms", onBack }) {
  const doc = DOCS[type] || DOCS.terms;
  return <div className="max-w-2xl mx-auto w-full pb-28 px-3" style={{color:COLORS.ivory}}>
    {onBack ? <BackBar title={doc.title} onBack={onBack}/> : <h1 className="text-xl font-bold mb-6" style={{color:COLORS.gold}}>{doc.title}</h1>}
    <div className="space-y-5 text-sm leading-relaxed" style={{color:COLORS.mutedLight}}>
      {doc.sections.map(([h,p])=><section key={h}><h2 className="font-bold mb-2" style={{color:COLORS.ivory}}>{h}</h2><p>{p}</p></section>)}
      <p className="text-xs pt-4" style={{color:COLORS.muted}}>Dernière mise à jour : octobre 2026. À adapter à l'entité juridique, aux pays et aux prestataires réellement utilisés par BAARO et à faire valider par un conseil juridique avant publication.</p>
    </div>
  </div>;
}
