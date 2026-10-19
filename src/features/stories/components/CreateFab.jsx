import { X, History } from 'lucide-react';
import { COLORS as C } from '../../../theme.js';

export function CreateFab({ isOpen, onToggle }) {
  return (
    <div className="fixed bottom-20 right-5 z-40">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-2 px-5 py-3 rounded-full font-bold text-xs shadow-2xl transition-all active:scale-95 border border-amber-400/40 backdrop-blur-md"
        style={{ background: C.gold || '#f59e0b', color: '#000' }}
      >
        {isOpen ? <X size={18} /> : <History size={18} />}
        <span>{isOpen ? 'Fermer' : 'Créer une story'}</span>
      </button>
    </div>
  );
}
