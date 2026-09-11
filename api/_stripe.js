/**
 * Helpers Stripe — erreurs normalisées pour BAARO
 * À placer dans api/_stripe.js (préfixe _ = pas un endpoint)
 */
import Stripe from 'stripe';

let _stripe = null;

export function getStripe() {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY manquante');
  _stripe = new Stripe(key, {
    apiVersion: '2024-11-20.acacia',
    maxNetworkRetries: 2,
  });
  return _stripe;
}

/**
 * Mappe une erreur Stripe vers un message utilisateur + code HTTP stable.
 */
export function mapStripeError(err) {
  const base = {
    ok: false,
    provider: 'stripe',
    type: err?.type || 'unknown',
    code: err?.code || null,
    decline_code: err?.decline_code || null,
    param: err?.param || null,
    requestId: err?.requestId || err?.raw?.requestId || null,
    message: 'Erreur de paiement. Réessaie ou utilise un autre moyen.',
    status: 402,
  };

  switch (err?.type) {
    case 'StripeCardError':
      // Carte refusée / insuffisant / fraud
      return {
        ...base,
        status: 402,
        message: humanCardMessage(err),
      };

    case 'StripeRateLimitError':
      return {
        ...base,
        status: 429,
        message: 'Trop de tentatives. Attends quelques secondes puis réessaie.',
      };

    case 'StripeInvalidRequestError':
      return {
        ...base,
        status: 400,
        message: err.message || 'Requête de paiement invalide.',
      };

    case 'StripeAPIError':
      return {
        ...base,
        status: 502,
        message: 'Service de paiement temporairement indisponible. Réessaie plus tard.',
      };

    case 'StripeConnectionError':
      return {
        ...base,
        status: 503,
        message: 'Impossible de joindre le service de paiement. Vérifie ta connexion.',
      };

    case 'StripeAuthenticationError':
      // Clé API invalide — côté serveur, ne pas exposer le détail
      console.error('[Stripe] Authentication error', err.message);
      return {
        ...base,
        status: 500,
        message: 'Configuration paiement invalide. Contacte le support.',
      };

    case 'StripePermissionError':
      return {
        ...base,
        status: 403,
        message: 'Paiement non autorisé pour ce compte.',
      };

    case 'StripeIdempotencyError':
      return {
        ...base,
        status: 409,
        message: 'Cette opération a déjà été traitée. Rafraîchis la page.',
      };

    default:
      // Erreurs réseau Node, timeouts, etc.
      if (err?.code === 'ETIMEDOUT' || err?.code === 'ECONNRESET') {
        return {
          ...base,
          status: 503,
          message: 'Délai dépassé avec le service de paiement. Réessaie.',
        };
      }
      console.error('[Stripe] Unhandled error', err);
      return {
        ...base,
        status: 500,
        message: err?.message || base.message,
      };
  }
}

function humanCardMessage(err) {
  const code = err.decline_code || err.code;
  const map = {
    card_declined: 'Carte refusée par ta banque.',
    insufficient_funds: 'Fonds insuffisants.',
    lost_card: 'Carte signalée comme perdue. Contacte ta banque.',
    stolen_card: 'Carte signalée comme volée. Contacte ta banque.',
    expired_card: 'Carte expirée.',
    incorrect_cvc: 'Code de sécurité (CVC) incorrect.',
    incorrect_number: 'Numéro de carte incorrect.',
    invalid_expiry_month: 'Mois d’expiration invalide.',
    invalid_expiry_year: 'Année d’expiration invalide.',
    processing_error: 'Erreur de traitement. Réessaie dans un instant.',
    fraudulent: 'Paiement bloqué pour suspicion de fraude.',
    do_not_honor: 'Banque a refusé le paiement. Contacte ta banque.',
    generic_decline: 'Paiement refusé. Essaie une autre carte.',
  };
  if (code && map[code]) return map[code];
  // Message Stripe déjà en langage naturel (souvent en anglais)
  if (err.message && err.message.length < 120) return err.message;
  return 'Paiement par carte refusé. Vérifie tes informations ou utilise un autre moyen.';
}

/**
 * Crée une Checkout Session Stripe.
 * amount en unité majeure (ex: 10.50 EUR) → converti en centimes sauf devises zéro-décimale.
 */
const ZERO_DECIMAL = new Set(['XOF', 'XAF', 'JPY', 'KRW', 'VND']);

export function toStripeAmount(amount, currency) {
  const cur = String(currency || 'XOF').toUpperCase();
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) throw Object.assign(new Error('Montant invalide'), { type: 'StripeInvalidRequestError' });
  if (ZERO_DECIMAL.has(cur)) return Math.round(n);
  return Math.round(n * 100);
}

export async function createCheckoutSession({
  amount,
  currency,
  paymentRef,
  description,
  customerEmail,
  successUrl,
  cancelUrl,
  metadata = {},
}) {
  const stripe = getStripe();
  const unitAmount = toStripeAmount(amount, currency);

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: String(currency).toLowerCase(),
            unit_amount: unitAmount,
            product_data: {
              name: description || 'Paiement BAARO',
            },
          },
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: paymentRef,
      customer_email: customerEmail || undefined,
      metadata: {
        payment_ref: paymentRef,
        ...metadata,
      },
    });

    return {
      ok: true,
      payment_url: session.url,
      session_id: session.id,
      transaction_id: paymentRef,
    };
  } catch (err) {
    throw mapStripeError(err);
  }
}

/**
 * Vérifie la signature du webhook Stripe.
 * rawBody = Buffer ou string brut (pas le JSON parsé).
 */
export function constructStripeEvent(rawBody, signature) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET manquante');
  return stripe.webhooks.constructEvent(rawBody, signature, secret);
}
