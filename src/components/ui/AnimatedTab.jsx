import { useEffect, useState } from 'react';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion.js';

// IMPORTANT : pas de transform / will-change / filter ici.
// Ils cassent les éléments "fixed" (bouton flottant, modales) placés à l'intérieur.
export default function AnimatedTab({ children, tabKey }) {
  const [displayChildren, setDisplayChildren] = useState(children);
  const [displayKey, setDisplayKey] = useState(tabKey);
  const [phase, setPhase] = useState('in'); // in | out
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (tabKey !== displayKey) {
      setPhase('out');
      const t = setTimeout(() => {
        setDisplayKey(tabKey);
        setDisplayChildren(children);
        requestAnimationFrame(() => setPhase('in'));
      }, 150);
      return () => clearTimeout(t);
    } else {
      // Même onglet mais props qui changent (ex: id)
      setDisplayChildren(children);
    }
  }, [tabKey, children, displayKey]);

  return (
    <div
      className={`${reducedMotion ? '' : 'transition-opacity duration-200 ease-out'} ${
        phase === 'out' ? 'opacity-0' : 'opacity-100'
      } h-full w-full`}
    >
      {displayChildren}
    </div>
  );
}
