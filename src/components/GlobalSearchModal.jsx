import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useGlobalSearch } from '../hooks/useGlobalSearch.js';
import { COLORS } from '../theme.js';

function SearchIcon({ style }) {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" style={style}>
      <circle cx="8.5" cy="8.5" r="6" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <line x1="13.2" y1="13.2" x2="18" y2="18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function XIcon({ size = 14, style }) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} aria-hidden="true" style={style}>
      <line x1="4" y1="4" x2="16" y2="16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="16" y1="4" x2="4" y2="16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function VerifiedBadge() {
  return (
    <svg viewBox="0 0 20 20" width="13" height="13" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path
        d="M10 1.5l2.1 1.9 2.8-.4 1 2.6 2.6 1-.4 2.8 1.9 2.1-1.9 2.1.4 2.8-2.6 1-1 2.6-2.8-.4L10 18.5l-2.1-1.9-2.8.4-1-2.6-2.6-1 .4-2.8L0 8.9l1.9-2.1-.4-2.8 2.6-1 1-2.6 2.8.4L10 1.5z"
        fill={COLORS.gold}
      />
      <path d="M6.2 10l2.2 2.2 5-5" fill="none" stroke={COLORS.bg} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Props réellement attendues par MainShell.jsx :
 * - onSelectUser(profileId) : l'ID du profil, pas l'objet utilisateur
 * - onSelectTab(tabId)       : changement d'onglet (utilisé ici pour "debates")
 * - onSelectShop()           : réservé — aucune donnée "shop" n'est encore
 *                              cherchée par useGlobalSearch, donc cette prop
 *                              est acceptée mais non déclenchée pour l'instant.
 */
function GlobalSearchModal({ isOpen, onClose, onSelectUser, onSelectTab, onSelectShop, delay = 300 }) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef(null);

  const { results, loading, error } = useGlobalSearch(query, delay);
  const showResults = query.trim().length >= 2;

  const flatItems = useMemo(
    () => [
      ...results.users.map((u) => ({ type: 'user', data: u })),
      ...results.debates.map((d) => ({ type: 'debate', data: d })),
    ],
    [results]
  );

  useEffect(() => {
    if (!isOpen) return;

    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    inputRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [isOpen]);

  useEffect(() => {
    setActiveIndex(-1);
  }, [results]);

  const selectItem = useCallback(
    (item) => {
      if (!item) return;
      if (item.type === 'user') {
        onSelectUser?.(item.data.id);
      } else {
        // Pas de deep-link vers un débat précis pour l'instant :
        // on ouvre l'onglet "Débats" en général.
        onSelectTab?.('debates');
      }
      onClose?.();
    },
    [onSelectUser, onSelectTab, onClose]
  );

  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      onClose?.();
      return;
    }
    if (!showResults || flatItems.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((i) => (i + 1) % flatItems.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((i) => (i <= 0 ? flatItems.length - 1 : i - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      selectItem(flatItems[activeIndex] ?? flatItems[0]);
    }
  }

  if (!isOpen) return null;

  const listboxId = 'baaro-global-search-listbox';

  return (
    <div
      className="fixed inset-0 z-50 flex justify-center px-4 pt-[12vh]"
      style={{ backgroundColor: 'rgba(11, 18, 32, 0.7)', backdropFilter: 'blur(4px)' }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Recherche globale"
        className="w-full max-w-xl flex flex-col overflow-hidden rounded-2xl"
        style={{ backgroundColor: COLORS.surface, border: `1px solid ${COLORS.border}`, boxShadow: '0 24px 60px rgba(0,0,0,0.5)', maxHeight: '70vh' }}
      >
        <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: `1px solid ${COLORS.border}` }}>
          <SearchIcon style={{ color: COLORS.muted }} />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={showResults}
            aria-haspopup="listbox"
            aria-controls={listboxId}
            aria-activedescendant={activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined}
            autoComplete="off"
            className="flex-1 bg-transparent text-[0.95rem] outline-none"
            style={{ color: COLORS.ivory }}
            placeholder="Rechercher une personne ou un débat…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          {loading && (
            <span
              className="h-4 w-4 rounded-full border-2 animate-spin motion-reduce:animate-none motion-reduce:opacity-70"
              style={{ borderColor: COLORS.border, borderTopColor: COLORS.gold }}
              aria-hidden="true"
            />
          )}
          {!loading && query && (
            <button type="button" onClick={() => setQuery('')} aria-label="Effacer la recherche" className="rounded-full p-1" style={{ color: COLORS.muted }}>
              <XIcon size={14} />
            </button>
          )}
          <button type="button" onClick={onClose} aria-label="Fermer la recherche" className="ml-1 rounded-full p-1" style={{ color: COLORS.muted }}>
            <XIcon size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2" role="listbox" id={listboxId}>
          {!showResults && (
            <p className="px-3 py-6 text-center text-sm" style={{ color: COLORS.muted }}>
              Tapez au moins 2 caractères pour lancer la recherche.
            </p>
          )}

          {showResults && error && (
            <p className="px-3 py-4 text-sm" style={{ color: COLORS.muted }}>{error}</p>
          )}

          {showResults && !error && !loading && flatItems.length === 0 && (
            <p className="px-3 py-4 text-sm" style={{ color: COLORS.muted }}>
              Aucun résultat pour « {query.trim()} ».
            </p>
          )}

          {showResults && !error && results.users.length > 0 && (
            <div className="mb-1">
              <p className="px-3 pb-1 pt-2 text-xs" style={{ color: COLORS.mutedLight }}>Personnes</p>
              {results.users.map((user, i) => (
                <button
                  key={user.id}
                  id={`${listboxId}-option-${i}`}
                  role="option"
                  aria-selected={activeIndex === i}
                  type="button"
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => selectItem({ type: 'user', data: user })}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left"
                  style={{ backgroundColor: activeIndex === i ? COLORS.goldGlow : 'transparent' }}
                >
                  <span
                    className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-full text-lg"
                    style={{ backgroundColor: COLORS.surface2 }}
                  >
                    {user.avatar_url ? (
                      <img src={user.avatar_url} alt="" loading="lazy" className="h-full w-full object-cover" />
                    ) : (
                      <span aria-hidden="true">{user.flag}</span>
                    )}
                  </span>
                  <span className="flex min-w-0 flex-col overflow-hidden">
                    <span className="flex items-center gap-1 truncate text-sm font-semibold" style={{ color: COLORS.ivory }}>
                      {user.display_name}
                      {user.is_verified && <VerifiedBadge />}
                    </span>
                    <span className="truncate text-xs" style={{ color: COLORS.muted }}>{user.handle}</span>
                  </span>
                </button>
              ))}
            </div>
          )}

          {showResults && !error && results.debates.length > 0 && (
            <div className="pt-1" style={{ borderTop: results.users.length > 0 ? `1px solid ${COLORS.border}` : 'none' }}>
              <p className="px-3 pb-1 pt-2 text-xs" style={{ color: COLORS.mutedLight }}>Débats</p>
              {results.debates.map((debate, i) => {
                const index = results.users.length + i;
                return (
                  <button
                    key={debate.id}
                    id={`${listboxId}-option-${index}`}
                    role="option"
                    aria-selected={activeIndex === index}
                    type="button"
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => selectItem({ type: 'debate', data: debate })}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left"
                    style={{ backgroundColor: activeIndex === index ? COLORS.tealGlow : 'transparent' }}
                  >
                    <span className="ml-1 mr-2 h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: COLORS.teal }} aria-hidden="true" />
                    <span className="flex min-w-0 flex-col overflow-hidden">
                      <span className="truncate text-sm font-semibold" style={{ color: COLORS.ivory }}>{debate.title}</span>
                      <span className="truncate text-xs" style={{ color: COLORS.muted }}>{debate.topic}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center gap-4 px-4 py-2 text-xs" style={{ borderTop: `1px solid ${COLORS.border}`, color: COLORS.muted }}>
          <span>↑↓ naviguer</span>
          <span>↵ sélectionner</span>
          <span>Échap fermer</span>
        </div>
      </div>
    </div>
  );
}

export { GlobalSearchModal };
export default GlobalSearchModal;
