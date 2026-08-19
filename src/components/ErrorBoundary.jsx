import { Component } from "react";
import { COLORS } from "../theme.js";

/**
 * Error Boundary global — empêche un crash d'onglet de faire planter toute l'app.
 *
 * Usage :
 *   <ErrorBoundary>
 *     <MonComposant />
 *   </ErrorBoundary>
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("[BAARO] ErrorBoundary caught:", error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="min-h-[40vh] flex items-center justify-center p-6"
          style={{ color: COLORS.ivory }}
        >
          <div className="text-center max-w-md">
            <div className="text-4xl mb-4">⚠️</div>
            <h2 className="text-lg font-bold mb-2" style={{ color: COLORS.gold }}>
              Une erreur est survenue
            </h2>
            <p className="text-sm mb-6" style={{ color: COLORS.muted }}>
              Cet onglet a rencontré un problème. Vous pouvez réessayer ou recharger
              l'application.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleReset}
                className="px-4 py-2 rounded-xl text-sm font-semibold transition"
                style={{
                  background: COLORS.surface2,
                  color: COLORS.ivory,
                  border: `1px solid ${COLORS.border}`,
                }}
              >
                Réessayer
              </button>
              <button
                onClick={this.handleReload}
                className="px-4 py-2 rounded-xl text-sm font-bold transition"
                style={{
                  background: "linear-gradient(135deg, #D9AE52 0%, #2DBFA6 100%)",
                  color: "#0B1220",
                }}
              >
                Recharger
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
