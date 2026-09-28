import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary a capturé une exception runtime:', error, errorInfo);
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return typeof this.props.fallback === 'function'
          ? this.props.fallback({ error: this.state.error, reset: this.handleReset })
          : this.props.fallback;
      }

      const title = this.props.title || 'Un problème est survenu lors du chargement de ce bloc';
      const description = this.props.description || 'L\'affichage a été sécurisé pour préserver l\'intégrité de la page.';

      return (
        <div className="p-5 sm:p-6 rounded-2xl bg-rose-50/90 border-2 border-rose-400 text-rose-950 shadow-sm animate-in fade-in duration-200 my-3">
          <div className="flex items-start gap-4">
            <div className="p-2.5 rounded-xl bg-rose-600 text-white shrink-0 mt-0.5 shadow-xs">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="flex-1 space-y-2">
              <h3 className="text-sm sm:text-base font-extrabold text-rose-950 flex items-center gap-2">
                <span>{title}</span>
              </h3>
              <p className="text-xs text-rose-800 leading-relaxed font-medium">
                {description}
              </p>
              {this.state.error?.message && (
                <div className="p-2.5 bg-rose-100/90 border border-rose-300/80 rounded-xl font-mono text-[11px] text-rose-950 break-all select-all">
                  <strong>Erreur interceptée :</strong> {this.state.error.message}
                </div>
              )}
              <div className="pt-2 flex items-center gap-3">
                <button
                  type="button"
                  onClick={this.handleReset}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition-colors shadow-xs cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Réessayer l'affichage</span>
                </button>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white hover:bg-rose-100 text-rose-900 border border-rose-300 font-bold text-xs transition-colors cursor-pointer"
                >
                  <span>Recharger la page</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
