export function DraftBanner({ onRestore, onDiscard }) {
  return (
    <div className="flex items-center justify-between gap-2 p-2 rounded-xl border border-amber-500/30 bg-amber-500/10 text-xs text-amber-300">
      <span>Brouillon retrouvé (les médias ne sont pas conservés)</span>
      <span className="flex gap-2 shrink-0">
        <button onClick={onRestore} className="font-bold underline">Reprendre</button>
        <button onClick={onDiscard} className="opacity-70 underline">Supprimer</button>
      </span>
    </div>
  );
}
