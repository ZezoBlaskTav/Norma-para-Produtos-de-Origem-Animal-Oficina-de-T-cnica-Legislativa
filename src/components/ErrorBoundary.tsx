import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    const raw = error instanceof Error ? error.message : String(error);
    return {
      hasError: true,
      message: raw,
    };
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    let friendlyDetail = this.state.message;
    try {
      const parsed = JSON.parse(this.state.message) as {
        error?: string;
        operationType?: string;
        path?: string;
      };
      if (parsed?.error) {
        friendlyDetail = `Erro de banco de dados (${parsed.operationType || 'operação'} em ${parsed.path || 'coleção'}): ${parsed.error}`;
      }
    } catch {
      // Texto simples
    }

    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-lg w-full bg-white border border-slate-200 rounded-lg p-6 space-y-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-700 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h1 className="text-base font-semibold text-slate-900">
                Ocorreu uma falha inesperada no aplicativo
              </h1>
              <p className="text-xs text-slate-600 leading-relaxed">
                Suas minutas permanecem protegidas no armazenamento local. Recarregue
                a página para continuar.
              </p>
            </div>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded text-xs font-mono text-slate-700 break-words">
            {friendlyDetail}
          </div>

          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Recarregar aplicativo</span>
          </button>
        </div>
      </div>
    );
  }
}
