import { useEffect, useState } from 'react';
import { fetchMyProducts } from '../api/storiesApi.js';

export function useMyProducts(userId) {
  const [products, setProducts] = useState([]);
  useEffect(() => {
    let alive = true;
    setProducts([]);
    if (!userId) return () => { alive = false; };
    fetchMyProducts(userId)
      .then((items) => { if (alive) setProducts(items); })
      .catch((e) => { if (alive) console.error('[Stories] products:', e); });
    return () => { alive = false; };
  }, [userId]);
  return products;
}
