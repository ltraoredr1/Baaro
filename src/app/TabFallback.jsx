import { COLORS } from "../theme.js";

export function TabFallback() {
  return (
    <div
      className="flex items-center justify-center py-20 text-sm"
      style={{ color: COLORS.muted }}
    >
      Chargement de l&apos;onglet…
    </div>
  );
}

export function LoadingScreen({ message = "Chargement de BAARO..." }) {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: "#0B1220", color: "white" }}
    >
      <div className="text-center">
        <div className="text-4xl mb-4 animate-pulse">⏳</div>
        <p>{message}</p>
      </div>
    </div>
  );
}
