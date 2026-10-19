import { useEffect, useState } from 'react';
import { fetchMyProducts } from '../api/storiesApi.js';

export function useMyProducts(userId) {
  const [products, setProducts] = useState([]);
  useEffect(() => {
    if (!userId) return;
    fetchMyProducts(userId).then(setProducts).catch((e) => console.error('[Stories] products:', e));
  }, [userId]);
  return products;
}
