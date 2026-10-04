import { useState, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { supabase } from '../supabaseClient';
import { useCurrentUser } from './useCommunity';

// ---------------------------------------------------------------------
// Hachage local (SHA-256). Le numéro/e-mail en clair ne quitte jamais
// l'appareil : seuls des hachages sont envoyés au serveur pour comparaison.
// ---------------------------------------------------------------------
async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function normalizeEmail(raw) {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  return v || null;
}

// Indicatifs pays courants (Afrique + principaux pays internationaux couverts
// par la diversité déjà présente dans les profils BAARO). Utilisé uniquement
// pour retrouver la forme LOCALE d'un numéro déjà international — jamais pour
// deviner un indicatif au hasard.
const COMMON_CALLING_CODES = [
  225, 221, 223, 226, 227, 228, 229, 224, 237, 243, 234, 233, 255, 254, 256,
  27, 20, 212, 213, 216, 218, 249, 251,
  33, 1, 44, 49, 34, 39, 351, 32, 41, 7, 86, 91, 81, 82, 55, 52, 61,
];

// Produit toutes les formes plausibles d'un même numéro (avec +, sans +, avec
// le 0 initial local, sans) pour maximiser les correspondances entre "comment
// ce numéro est enregistré sur BAARO" et "comment il apparaît dans un
// répertoire de téléphone" — sans dépendre d'un indicatif deviné à l'avance.
function expandPhoneVariants(raw) {
  let cleaned = (raw || '').replace(/[^\d+]/g, '');
  if (!cleaned) return [];
  if (cleaned.startsWith('00')) cleaned = '+' + cleaned.slice(2);

  const variants = new Set();
  if (cleaned.startsWith('+')) {
    const bare = cleaned.slice(1);
    variants.add(cleaned);
    variants.add(bare);
    for (const cc of COMMON_CALLING_CODES) {
      const ccStr = String(cc);
      if (bare.startsWith(ccStr)) {
        const local = bare.slice(ccStr.length);
        if (local.length >= 6) {
          variants.add('0' + local);
          variants.add(local);
        }
      }
    }
  } else {
    variants.add(cleaned);
    variants.add(cleaned.replace(/^0+/, ''));
  }
  return [...variants].filter((v) => v.length >= 6);
}

export function useContacts() {
  const { id } = useCurrentUser();
  const [syncing, setSyncing] = useState(false);
  const [progressLabel, setProgressLabel] = useState('');
  const [matches, setMatches] = useState([]);
  const [unmatched, setUnmatched] = useState([]);

  const isNative = Capacitor.isNativePlatform();
  const [webSupported] = useState(
    typeof navigator !== 'undefined' && 'contacts' in navigator && typeof window !== 'undefined' && 'ContactsManager' in window
  );
  const supported = isNative || webSupported;

  // Enregistre MON PROPRE numéro/e-mail (toutes variantes hachées) pour être
  // trouvable par les autres, quelle que soit la façon dont ils m'ont enregistré.
  const registerMyIdentifiers = useCallback(
    async ({ phone, email }) => {
      if (!id) throw new Error('Non connecté');
      const rows = [];

      if (phone) {
        const variants = expandPhoneVariants(phone);
        const hashes = await Promise.all(variants.map(sha256Hex));
        hashes.forEach((h) => rows.push({ hash: h, profile_id: id, kind: 'phone' }));
        const { error } = await supabase.from('profiles').update({ phone }).eq('id', id);
        if (error) throw error;
        await supabase.from('contact_hashes').delete().eq('profile_id', id).eq('kind', 'phone');
      }
      if (email) {
        const n = normalizeEmail(email);
        if (n) rows.push({ hash: await sha256Hex(n), profile_id: id, kind: 'email' });
        await supabase.from('contact_hashes').delete().eq('profile_id', id).eq('kind', 'email');
      }
      if (rows.length) {
        const { error } = await supabase.from('contact_hashes').upsert(rows, { onConflict: 'hash' });
        if (error) throw error;
      }
    },
    [id]
  );

  // --- Chemin natif (Android/iOS, app packagée avec Capacitor) ---------
  const pickNativeContacts = useCallback(async () => {
    const { Contacts } = await import('@capacitor-community/contacts');
    try {
      const perm = await Contacts.getPermissions();
      if (!perm?.granted) {
        const req = await Contacts.requestPermissions();
        if (!req?.granted) return [];
      }
    } catch (e) {
      console.warn('Permission contacts refusée/indisponible', e);
      return [];
    }
    const { contacts } = await Contacts.getContacts();
    return (contacts || []).map((c) => ({
      name: c.displayName ? [c.displayName] : [],
      tel: (c.phoneNumbers || []).map((p) => p.number).filter(Boolean),
      email: (c.emails || []).map((e) => e.address).filter(Boolean),
    }));
  }, []);

  // --- Chemin web (Contact Picker API — Chrome Android surtout) --------
  const pickWebContacts = useCallback(async () => {
    if (!webSupported) return [];
    try {
      const raw = await navigator.contacts.select(['name', 'tel', 'email'], { multiple: true });
      return raw || [];
    } catch (e) {
      console.warn('Contact Picker refusé ou indisponible', e);
      return [];
    }
  }, [webSupported]);

  const pickDeviceContacts = useCallback(async () => {
    if (isNative) return pickNativeContacts();
    return pickWebContacts();
  }, [isNative, pickNativeContacts, pickWebContacts]);

  // Hache un (gros) répertoire en parallèle et interroge le serveur par lots,
  // tout en gardant la correspondance hash -> contact d'origine pour pouvoir
  // proposer une invitation à ceux qui n'ont pas matché.
  const findMatches = useCallback(async (rawContacts) => {
    setSyncing(true);
    setProgressLabel(`Analyse de ${rawContacts.length} contact${rawContacts.length > 1 ? 's' : ''}…`);
    try {
      const variantOwners = new Map(); // variante texte -> Set(index du contact brut)
      rawContacts.forEach((c, idx) => {
        for (const t of c.tel || []) {
          for (const v of expandPhoneVariants(t)) {
            if (!variantOwners.has(v)) variantOwners.set(v, new Set());
            variantOwners.get(v).add(idx);
          }
        }
        for (const e of c.email || []) {
          const n = normalizeEmail(e);
          if (!n) continue;
          if (!variantOwners.has(n)) variantOwners.set(n, new Set());
          variantOwners.get(n).add(idx);
        }
      });

      const variants = [...variantOwners.keys()];
      if (!variants.length) { setMatches([]); setUnmatched([]); return []; }

      // Hachage 100% en parallèle : SHA-256 est quasi instantané, la lenteur
      // vient uniquement d'awaits séquentiels — on les évite complètement.
      const hashList = await Promise.all(variants.map(sha256Hex));
      const hashToVariant = new Map(hashList.map((h, i) => [h, variants[i]]));
      const uniqueHashes = [...new Set(hashList)];

      setProgressLabel('Recherche des correspondances…');

      // Requêtes par lots de 400 hachages, en parallèle : reste rapide et
      // sûr même avec un répertoire de plusieurs milliers de contacts.
      const CHUNK = 400;
      const chunks = [];
      for (let i = 0; i < uniqueHashes.length; i += CHUNK) chunks.push(uniqueHashes.slice(i, i + CHUNK));
      const rows = (
        await Promise.all(
          chunks.map(async (chunk) => {
            const { data, error } = await supabase.rpc('find_users_by_contact_hashes', { hashes: chunk });
            if (error) throw error;
            return data || [];
          })
        )
      ).flat();

      const byId = new Map();
      const matchedIdx = new Set();
      for (const row of rows) {
        if (!byId.has(row.id)) byId.set(row.id, row);
        const variant = hashToVariant.get(row.matched_hash);
        const owners = variant ? variantOwners.get(variant) : null;
        owners?.forEach((idx) => matchedIdx.add(idx));
      }

      const merged = [...byId.values()];
      const notYetThere = rawContacts.filter((c, idx) => {
        if (matchedIdx.has(idx)) return false;
        return (c.tel && c.tel.length) || (c.email && c.email.length);
      });

      setMatches(merged);
      setUnmatched(notYetThere);
      return merged;
    } finally {
      setSyncing(false);
      setProgressLabel('');
    }
  }, []);

  const syncDeviceContacts = useCallback(async () => {
    const raw = await pickDeviceContacts();
    if (!raw.length) { setMatches([]); setUnmatched([]); return []; }
    return findMatches(raw);
  }, [pickDeviceContacts, findMatches]);

  // Recherche manuelle par UN numéro ou UN e-mail (champ "S'abonner via numéro/e-mail").
  const searchByIdentifier = useCallback(async (value) => {
    const v = (value || '').trim();
    if (!v) return null;
    const isEmail = v.includes('@');
    const variants = isEmail ? [normalizeEmail(v)].filter(Boolean) : expandPhoneVariants(v);
    if (!variants.length) return null;
    const hashes = [...new Set(await Promise.all(variants.map(sha256Hex)))];
    const { data, error } = await supabase.rpc('find_users_by_contact_hashes', { hashes });
    if (error) throw error;
    return data?.[0] || null;
  }, []);

  // Invite un contact non trouvé sur BAARO (partage natif, ou SMS/e-mail en repli).
  const inviteContact = useCallback((contact) => {
    const name = contact.name?.[0] || '';
    const text = `Salut${name ? ' ' + name.split(' ')[0] : ''} ! Rejoins-moi sur BAARO 🌍 : https://baaro-xi.vercel.app`;
    if (navigator.share) {
      navigator.share({ text }).catch(() => {});
      return;
    }
    if (contact.tel?.[0]) {
      window.location.href = `sms:${contact.tel[0]}?&body=${encodeURIComponent(text)}`;
    } else if (contact.email?.[0]) {
      window.location.href = `mailto:${contact.email[0]}?subject=${encodeURIComponent('Rejoins-moi sur BAARO')}&body=${encodeURIComponent(text)}`;
    }
  }, []);

  return {
    syncing,
    progressLabel,
    matches,
    unmatched,
    supported,
    isNative,
    registerMyIdentifiers,
    syncDeviceContacts,
    findMatches,
    searchByIdentifier,
    inviteContact,
  };
}
