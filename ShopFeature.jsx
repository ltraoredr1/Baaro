import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// ------------------------------------------
// Gestion des produits/services (côté propriétaire)
// ------------------------------------------
export function ShopProductManager({ shopId, shopCurrency }) {
  const { t } = useTranslation();
  const [products, setProducts] = useState([]);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [type, setType] = useState('produit');
  const [loading, setLoading] = useState(false);

  // shopCurrency vient de shops/shop_pricing selon le pays de la boutique
  // (voir ShopRegistrationForm) — plus de "FCFA" codé en dur.
  const currency = shopCurrency || 'XOF';

  async function loadProducts() {
    const { data } = await supabase
      .from('shop_products')
      .select('*')
      .eq('shop_id', shopId)
      .order('created_at', { ascending: false });
    setProducts(data ?? []);
  }

  useEffect(() => { loadProducts(); }, [shopId]);

  async function addProduct(e) {
    e.preventDefault();
    if (!name.trim() || !price) return;

    setLoading(true);
    await supabase.from('shop_products').insert({
      shop_id: shopId,
      name: name.trim(),
      price: parseFloat(price),
      currency,
      type,
    });
    setName('');
    setPrice('');
    setLoading(false);
    loadProducts();
  }

  async function toggleAvailable(product) {
    await supabase
      .from('shop_products')
      .update({ is_available: !product.is_available })
      .eq('id', product.id);
    loadProducts();
  }

  async function removeProduct(id) {
    await supabase.from('shop_products').delete().eq('id', id);
    loadProducts();
  }

  return (
    <div className="max-w-md mx-auto space-y-4 p-4">
      <form onSubmit={addProduct} className="space-y-2 border-b pb-4">
        <div className="flex gap-2">
          <button type="button" onClick={() => setType('produit')}
            className={`flex-1 py-1 rounded text-sm ${type === 'produit' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}>
            Produit
          </button>
          <button type="button" onClick={() => setType('service')}
            className={`flex-1 py-1 rounded text-sm ${type === 'service' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}>
            Service
          </button>
        </div>
        <input
          type="text"
          placeholder="Nom"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full border rounded-lg px-3 py-2"
        />
        <input
          type="number"
          step="0.01"
          placeholder={`Prix (${currency})`}
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="w-full border rounded-lg px-3 py-2"
        />
        <button disabled={loading} className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm">
          + Ajouter
        </button>
      </form>

      <ul className="space-y-2">
        {products.map((p) => (
          <li key={p.id} className="flex items-center justify-between border rounded-lg p-2">
            <div>
              <p className="font-medium text-sm">{p.name}</p>
              <p className="text-xs text-gray-500">{p.price} {p.currency} · {p.type}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => toggleAvailable(p)} className="text-xs px-2 py-1 bg-gray-100 rounded">
                {p.is_available ? 'Disponible' : 'Indisponible'}
              </button>
              <button onClick={() => removeProduct(p.id)} className="text-xs px-2 py-1 text-red-600">
                Suppr.
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ------------------------------------------
// Annuaire local (côté utilisateurs) — la "publicité en local"
// Filtré maintenant par pays ET ville : deux villes homonymes dans des
// pays différents ne se mélangent plus.
// ------------------------------------------
export function LocalShopDirectory() {
  const { t } = useTranslation();
  const [shops, setShops] = useState([]);
  const [countryFilter, setCountryFilter] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadShops() {
      setLoading(true);
      let query = supabase.from('shops').select('*').eq('is_active', true);
      if (countryFilter.trim()) query = query.eq('country', countryFilter.trim().toUpperCase());
      if (cityFilter.trim()) query = query.ilike('city', `%${cityFilter.trim()}%`);
      const { data } = await query.order('created_at', { ascending: false });
      setShops(data ?? []);
      setLoading(false);
    }
    loadShops();
  }, [countryFilter, cityFilter]);

  return (
    <div className="max-w-md mx-auto p-4 space-y-3">
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Pays (ex: ML, FR, US)"
          value={countryFilter}
          onChange={(e) => setCountryFilter(e.target.value)}
          maxLength={2}
          className="w-24 border rounded-lg px-3 py-2 uppercase"
        />
        <input
          type="text"
          placeholder="Ville / quartier"
          value={cityFilter}
          onChange={(e) => setCityFilter(e.target.value)}
          className="flex-1 border rounded-lg px-3 py-2"
        />
      </div>

      {loading && <p className="text-sm text-gray-500">{t('common.loading')}</p>}

      <ul className="space-y-3">
        {shops.map((shop) => (
          <li key={shop.id} className="border rounded-xl p-3">
            <p className="font-semibold">{shop.name}</p>
            <p className="text-xs text-gray-500">
              {shop.category} · {shop.city}, {shop.country}
            </p>
            {shop.description && <p className="text-sm mt-1">{shop.description}</p>}
          </li>
        ))}
        {!loading && shops.length === 0 && (
          <p className="text-sm text-gray-500 text-center">Aucune boutique trouvée.</p>
        )}
      </ul>
    </div>
  );
}
