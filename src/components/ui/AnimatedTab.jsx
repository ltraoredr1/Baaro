import { useEffect, useState } from 'react';

export default function AnimatedTab({ children, tabKey }) {
  const [displayChildren, setDisplayChildren] = useState(children);
  const [displayKey, setDisplayKey] = useState(tabKey);
  const [phase, setPhase] = useState('in'); // in | out

  useEffect(() => {
    if (tabKey !== displayKey) {
      setPhase('out');
      const t = setTimeout(() => {
        setDisplayKey(tabKey);
        setDisplayChildren(children);
        // Force reflow pour que le 'in' se rejoue
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
      className={`transition-all duration-200 ease-out will-change-transform ${
        phase === 'out'
          ? 'opacity-0 translate-y-2 scale-[0.99]'
          : 'opacity-100 translate-y-0 scale-100'
      } h-full w-full`}
    >
      {displayChildren}
    </div>
  );
}
