import React from 'react';

/**
 * Props for ErrorBoundary
 */
export interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  FallbackComponent?: React.ComponentType<{ error: Error; resetErrorBoundary: () => void }>;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  resetOn?: any;
}

export interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

/**
 * Generic Error Boundary to catch UI crashes and show a fallback UI.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (this.state.hasError && prevProps.resetOn !== this.props.resetOn) {
      this.setState({ hasError: false, error: undefined });
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      const { error } = this.state;
      
      if (this.props.FallbackComponent) {
        const Fallback = this.props.FallbackComponent;
        return <Fallback error={error || new Error('Unknown error')} resetErrorBoundary={this.handleReset} />;
      }

      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="p-6 rounded-2xl border border-red-500/20 bg-red-500/5 text-slate-100 shadow-xl" role="alert" aria-live="assertive">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-3xl" aria-hidden="true">⚠️</span>
            <h2 className="text-xl font-semibold">Component crashed</h2>
          </div>
          <p className="text-slate-300 mb-6 text-sm">
            Something went wrong while rendering this part of the application.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={this.handleReset}
              className="px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-white font-medium transition-colors"
            >
              Try Again
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 font-medium transition-colors border border-slate-700"
            >
              Refresh App
            </button>
          </div>
          {this.state.error && (
            <details className="mt-6">
              <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-300">
                Stack trace
              </summary>
              <pre className="mt-2 text-xs text-red-400 bg-black/40 p-3 rounded-lg overflow-auto max-h-48 border border-white/5">
                {this.state.error.stack}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

export function withErrorBoundary<P extends object>(
    WrappedComponent: React.ComponentType<P>,
    boundaryProps?: Omit<ErrorBoundaryProps, 'children'>
) {
    return (props: P) => (
        <ErrorBoundary {...boundaryProps}>
            <WrappedComponent {...props} />
        </ErrorBoundary>
    );
}
