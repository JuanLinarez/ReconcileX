import { Component, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[var(--app-bg)] p-6">
          <div className="max-w-md w-full text-center space-y-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-red-50 text-red-500">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <h1 className="text-xl font-bold font-heading text-[var(--app-heading)]">
                Something went wrong
              </h1>
              <p className="text-sm text-[var(--app-body)]">
                An unexpected error occurred. This is usually a temporary issue.
                Please try refreshing the page.
              </p>
            </div>
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--app-primary)] px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 transition-opacity cursor-pointer"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh Page
              </button>
              <button
                type="button"
                onClick={() => {
                  window.location.href = '/';
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-[var(--app-body)] hover:bg-gray-50 transition-colors cursor-pointer"
              >
                <Home className="h-4 w-4" />
                Go to Dashboard
              </button>
            </div>
            <p className="text-xs text-[var(--app-body)]/50">
              If this keeps happening, please contact support.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
