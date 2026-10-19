import { useState } from 'react';

export function useCartQuantities() {
  const [quantities, setQuantities] = useState({});
  const add = (id) => setQuantities((p) => ({ ...p, [id]: (p[id] || 0) + 1 }));
  const remove = (id) => setQuantities((p) => ({ ...p, [id]: Math.max(0, (p[id] || 0) - 1) }));
  return { quantities, add, remove };
}
