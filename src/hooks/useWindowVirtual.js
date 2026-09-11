/**
 * Virtualisation légère (window scroll).
 * Place : src/hooks/useWindowVirtual.js
 * À utiliser seulement si items.length > ~80.
 */
import { useMemo, useState, useEffect } from "react";

/**
 * @param {array} items
 * @param {{ itemHeight?: number, overscan?: number }} opts
 */
export function useWindowVirtual(items, { itemHeight = 140, overscan = 5 } = {}) {
  const [scrollY, setScrollY] = useState(0);
  const [vh, setVh] = useState(() =>
    typeof window !== "undefined" ? window.innerHeight : 800
  );

  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        setScrollY(window.scrollY || window.pageYOffset || 0);
        ticking = false;
      });
    };
    const onResize = () => setVh(window.innerHeight);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return useMemo(() => {
    const len = items?.length || 0;
    const start = Math.max(0, Math.floor(scrollY / itemHeight) - overscan);
    const visible = Math.ceil(vh / itemHeight) + overscan * 2;
    const end = Math.min(len, start + visible);
    return {
      start,
      end,
      offsetY: start * itemHeight,
      totalHeight: len * itemHeight,
      slice: (items || []).slice(start, end),
    };
  }, [items, scrollY, vh, itemHeight, overscan]);
}

/**
 * Liste virtualisée simple.
 * Si < 60 items → rendu normal (pas de virtualisation).
 */
export function VirtualList({
  items,
  itemHeight = 140,
  renderItem,
  keyExtractor,
  className = "",
}) {
  const { slice, start, offsetY, totalHeight } = useWindowVirtual(items, {
    itemHeight,
  });

  if (!items?.length) return null;

  if (items.length < 60) {
    return (
      <div className={`flex flex-col gap-2 ${className}`}>
        {items.map((item, i) => (
          <div key={keyExtractor ? keyExtractor(item, i) : i}>
            {renderItem(item, i)}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={className} style={{ height: totalHeight, position: "relative" }}>
      <div style={{ transform: `translateY(${offsetY}px)` }}>
        {slice.map((item, i) => {
          const index = start + i;
          return (
            <div
              key={keyExtractor ? keyExtractor(item, index) : index}
              style={{ minHeight: itemHeight }}
            >
              {renderItem(item, index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
