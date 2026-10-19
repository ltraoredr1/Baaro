import { X } from 'lucide-react';

export function ProductPicker({ products, onPick, onClose }) {
  return (
    <div className="p-3 rounded-xl border space-y-2 bg-black/30 border-amber-500/30">
      <div className="flex justify-between items-center">
        <span className="text-xs font-bold text-amber-400">Épingler un produit de ta boutique</span>
        <button onClick={onClose} className="text-zinc-400 hover:text-white"><X size={14} /></button>
      </div>
      {products.length === 0 ? (
        <p className="text-xs text-zinc-400">Aucun produit disponible dans ta boutique.</p>
      ) : (
        <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto pr-1">
          {products.map((prod) => (
            <button
              key={prod.id}
              onClick={() => onPick(prod)}
              className="text-left p-2 rounded-lg border border-white/10 hover:border-amber-400/50 bg-white/5 transition flex items-center justify-between"
            >
              <span className="text-xs font-semibold text-white truncate">{prod.name}</span>
              <span className="text-xs font-bold text-amber-400">{prod.price} {prod.currency}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
