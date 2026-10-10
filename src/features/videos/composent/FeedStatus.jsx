import { COLORS } from "../../../theme.js";

export function FeedLoading() {
  return (
    <div className="fixed inset-0 z-40 bg-black text-white flex items-center justify-center">
      <div className="text-center">
        <div className="mx-auto mb-4 h-12 w-12 rounded-full border-2 border-white/20 border-t-white animate-spin" />
        <p className="text-sm text-white/60">Chargement des vidéos…</p>
      </div>
    </div>
  );
}

export function FeedError({ message, onRetry }) {
  return (
    <section className="min-h-[100dvh] flex items-center justify-center px-6 text-center snap-start">
      <div>
        <div className="text-5xl mb-4">⚠️</div>
        <h2 className="font-black text-xl">Impossible de charger les vidéos</h2>
        <p className="text-sm text-white/50 mt-2 mb-5">{message}</p>
        <button
          onClick={onRetry}
          className="px-5 py-3 rounded-2xl font-bold"
          style={{ background: COLORS.gold, color: "#000" }}
        >
          Réessayer
        </button>
      </div>
    </section>
  );
}

export function FeedEmpty({ onPublish }) {
  return (
    <section className="min-h-[100dvh] flex items-center justify-center px-6 text-center snap-start">
      <div>
        <div className="text-6xl mb-5">🎬</div>
        <h2 className="font-black text-2xl">Aucune vidéo</h2>
        <p className="text-sm text-white/50 mt-2 mb-6">
          Sois le premier à publier une vidéo sur BAARO.
        </p>
        <button
          onClick={onPublish}
          className="px-6 py-3 rounded-2xl font-black"
          style={{ background: COLORS.gold, color: "#000" }}
        >
          Publier une vidéo
        </button>
      </div>
    </section>
  );
}
