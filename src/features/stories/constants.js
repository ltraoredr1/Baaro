export const STORY_DURATION = 5000;
export const MAX_MEDIA_ITEMS = 10;
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

// --- Réactions ---
export const REACTIONS = ['❤️', '🔥', '😂', '😮'];

// --- Fonds des stories texte (valeur CSS `background`) ---
export const BACKGROUNDS = [
  { id: 'none',   label: 'Aucun',  value: null },
  { id: 'sunset', label: 'Soleil', value: 'linear-gradient(135deg,#f97316,#db2777)' },
  { id: 'ocean',  label: 'Océan',  value: 'linear-gradient(135deg,#0ea5e9,#6366f1)' },
  { id: 'forest', label: 'Forêt',  value: 'linear-gradient(135deg,#16a34a,#065f46)' },
  { id: 'night',  label: 'Nuit',   value: 'linear-gradient(135deg,#1e1b4b,#7c3aed)' },
  { id: 'gold',   label: 'Or',     value: 'linear-gradient(135deg,#f59e0b,#b45309)' },
  { id: 'rose',   label: 'Rose',   value: 'linear-gradient(135deg,#f472b6,#be123c)' },
  { id: 'slate',  label: 'Noir',   value: '#18181b' },
];

// --- Stickers / programmation / brouillon ---
export const MAX_STICKERS = 4;
export const MAX_SCHEDULE_DAYS = 30;
export const DRAFT_KEY = (userId) => `baaro_story_draft_${userId}`;

// --- Boutique >>> ADAPTER à ton app ---
export const LOW_STOCK_THRESHOLD = 5;          // « Stock limité » si stock <= 5
export const ATTRIBUTION_DAYS = 3;             // une vente est attribuée à la story si achat < 3 jours après le clic
export const productRoute = (productId, { storyId, buy } = {}) => {
  const q = new URLSearchParams();
  if (storyId) q.set('from_story', storyId);
  if (buy) q.set('buy', '1');
  const qs = q.toString();
  return `/shop/product/${productId}${qs ? `?${qs}` : ''}`;
};

// --- Abonnements >>> ADAPTER aux noms de ta table ---
export const FOLLOWS = { table: 'follows', follower: 'follower_id', following: 'followed_id', statusColumn: 'status', accepted: 'accepted' };
