import { useEffect, useState } from 'react';
import { ShieldCheck, Sparkles, ChevronRight, X } from 'lucide-react';
import { FUTURE_MODULES } from '../lib/futureModules.js';

/**
 * Panneau "futur" compact : un petit bouton ; le contenu s'ouvre dans une feuille
 * par-dessus l'écran (il ne masque plus la messagerie).
 * Même API qu'avant : <FutureModulePanel moduleId onNavigate />
 * Option : defaultOpen (false par défaut).
 */
export function FutureModulePanel({ moduleId, onNavigate, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const item = FUTURE_MODULES[moduleId];

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!item) return null;

  return (
    <>
      <div className="flex justify-end px-4 py-1.5">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold"
          style={{
            background: 'rgba(255,255,255,.05)',
            borderColor: 'rgba(45,191,166,.3)',
            color: '#5eead4',
          }}
        >
          <ShieldCheck size={14} />
          {item.title}
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-[95] flex items-end" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <section
            className="relative w-full max-h-[80dvh] overflow-y-auto rounded-t-3xl border-t p-4"
            style={{
              borderColor: 'rgba(45,191,166,.22)',
              background: 'linear-gradient(135deg,#0d1f2a,#14122b)',
              color: '#F5F3EF',
              paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))',
            }}
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute top-3 right-3 p-2 rounded-full bg-white/10"
              aria-label="Fermer"
            >
              <X size={18} />
            </button>

            <div className="flex items-start justify-between gap-3 pr-10 pt-1">
              <div>
                <div className="flex items-center gap-2">
                  <Sparkles size={15} style={{ color: '#22d3ee' }} />
                  <h3 className="text-sm font-bold">{item.title}</h3>
                  <span
                    className="text-[9px] rounded-full px-2 py-0.5"
                    style={{ background: 'rgba(45,191,166,.12)', color: '#5eead4' }}
                  >
                    FUTUR
                  </span>
                </div>
                <p className="text-[11px] mt-1 opacity-60">
                  Fonctionnalités conçues pour rester contrôlables, explicables et sécurisées.
                </p>
              </div>
              <ShieldCheck size={18} style={{ color: '#5eead4' }} className="flex-shrink-0" />
            </div>

            <div className="flex flex-wrap gap-1.5 mt-3">
              {item.capabilities.map((x) => (
                <span key={x} className="text-[10px] px-2 py-1 rounded-full border opacity-80">
                  {x}
                </span>
              ))}
            </div>

            <div className="flex flex-wrap gap-2 mt-3">
              {item.actions.map((x, i) => (
                <button
                  key={x}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onNavigate?.(moduleId, x, i);
                  }}
                  className="text-[10px] font-semibold px-3 py-1.5 rounded-xl border hover:bg-white/5 transition flex items-center gap-1"
                >
                  <span>{x}</span>
                  <ChevronRight size={12} />
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
