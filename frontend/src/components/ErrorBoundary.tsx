import { Component, ErrorInfo } from 'react';
import type { ReactNode } from 'react';
import { logger } from '@utils/logger';

interface Props {
  children: ReactNode;
  /** Optional custom fallback UI. Falls back to the built-in error screen. */
  fallback?: ReactNode;
  /** Optional callback called when an error is caught. */
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * RESILIENCE: Global Error Boundary
 *
 * Catches any unhandled React rendering errors and shows a graceful
 * recovery UI instead of a blank/crashed screen. Allows the user to
 * retry without a full page reload.
 *
 * Usage:
 *   <ErrorBoundary>
 *     <YourComponent />
 *   </ErrorBoundary>
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logger.uiCrash({
      errorMessage:   error.message,
      componentStack: info.componentStack ?? undefined,
      errorBoundary:  'GlobalErrorBoundary',
    });
    this.props.onError?.(error, info);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)',
            color: '#fff',
            fontFamily: 'Inter, system-ui, sans-serif',
            padding: '2rem',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>⚠️</div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.5rem' }}>
            Something went wrong
          </h1>
          <p style={{ color: '#a5b4fc', maxWidth: '480px', marginBottom: '1.5rem', lineHeight: 1.6 }}>
            An unexpected error occurred. Your session data is safe.
            {this.state.error && (
              <span>
                {' '}Error: <code style={{ color: '#fca5a5' }}>{this.state.error.message}</code>
              </span>
            )}
          </p>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              id="error-boundary-retry"
              onClick={this.handleReset}
              style={{
                padding: '0.75rem 2rem',
                borderRadius: '0.5rem',
                border: 'none',
                background: 'linear-gradient(90deg, #6366f1, #8b5cf6)',
                color: '#fff',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: '1rem',
              }}
            >
              Try Again
            </button>
            <button
              id="error-boundary-reload"
              onClick={() => window.location.reload()}
              style={{
                padding: '0.75rem 2rem',
                borderRadius: '0.5rem',
                border: '1px solid #6366f1',
                background: 'transparent',
                color: '#a5b4fc',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: '1rem',
              }}
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
