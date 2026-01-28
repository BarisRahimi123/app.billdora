import React from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo });
    // Log to console for debugging
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    this.props.onReset?.();
  };

  handleGoHome = () => {
    window.location.href = '/dashboard';
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-[400px] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white rounded-2xl border border-neutral-200 p-8 text-center shadow-sm">
            <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-red-50 flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>
            
            <h2 className="text-xl font-semibold text-neutral-900 mb-2">
              Something went wrong
            </h2>
            
            <p className="text-neutral-600 mb-6">
              We encountered an unexpected error. Please try refreshing the page or return to the dashboard.
            </p>

            {process.env.NODE_ENV === 'development' && this.state.error && (
              <div className="mb-6 p-4 bg-neutral-50 rounded-lg text-left overflow-auto max-h-32">
                <p className="text-sm font-mono text-red-600 break-words">
                  {this.state.error.message}
                </p>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={this.handleReset}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#476E66] text-white rounded-xl hover:bg-[#3A5B54] transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Try Again
              </button>
              <button
                onClick={this.handleGoHome}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-neutral-100 text-neutral-700 rounded-xl hover:bg-neutral-200 transition-colors"
              >
                <Home className="w-4 h-4" />
                Go to Dashboard
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Hook for functional components to show inline errors
export function useErrorHandler() {
  const [error, setError] = React.useState<string | null>(null);

  const handleError = React.useCallback((err: unknown) => {
    if (err instanceof Error) {
      setError(err.message);
    } else if (typeof err === 'string') {
      setError(err);
    } else {
      setError('An unexpected error occurred');
    }
  }, []);

  const clearError = React.useCallback(() => {
    setError(null);
  }, []);

  return { error, handleError, clearError };
}

// Inline error display component
export function InlineError({ 
  message, 
  onDismiss, 
  className = '' 
}: { 
  message: string; 
  onDismiss?: () => void; 
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 ${className}`}>
      <AlertTriangle className="w-5 h-5 flex-shrink-0" />
      <p className="flex-1 text-sm">{message}</p>
      {onDismiss && (
        <button 
          onClick={onDismiss}
          className="p-1 hover:bg-red-100 rounded transition-colors"
        >
          <span className="sr-only">Dismiss</span>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}

// Field-level validation error
export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-1 text-sm text-red-600">{message}</p>
  );
}
