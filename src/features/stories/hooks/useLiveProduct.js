import { useEffect, useState } from 'react';
import { fetchLiveProduct } from '../api/storiesApi.js';

/**
 * Le snapshot stocké dans story.product n'est pas une source fiable de prix/stock.
 * Renvoie un état explicite et n'expose comme produit achetable que la version live.
 */
export function useLiveProduct(snapshot) {
  const pid = snapshot?.id;
  const [state, setState] = useState({ productId: pid, product: null, status: snapshot ? 'loading' : 'empty' });

  useEffect(() => {
    let alive = true;
    setState({ productId: pid, product: null, status: snapshot ? 'loading' : 'empty' });
    if (pid === undefined || pid === null) {
      if (snapshot) setState({ productId: pid, product: null, status: 'unavailable' });
      return () => { alive = false; };
    }
    fetchLiveProduct(pid)
      .then((product) => {
        if (alive) setState({ productId: pid, product, status: product ? 'live' : 'unavailable' });
      })
      .catch((error) => {
        if (alive) {
          console.warn('[Stories] données produit live indisponibles :', error?.message || error);
          setState({ productId: pid, product: null, status: 'error' });
        }
      });
    return () => { alive = false; };
  }, [pid, Boolean(snapshot)]);

  // La valeur d'un ancien PID n'est jamais rendue pendant la phase post-render/effect.
  return state.productId === pid
    ? state
    : { productId: pid, product: null, status: snapshot ? 'loading' : 'empty' };
}
