import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in component tree:', error, errorInfo);
  }

  private handleReload = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 my-6 max-w-2xl mx-auto bg-red-500/10 border border-red-500/30 rounded-2xl text-center space-y-3">
          <div className="flex justify-center">
            <div className="p-3 bg-red-500/20 rounded-full text-red-400">
              <AlertTriangle className="w-6 h-6" />
            </div>
          </div>
          <h3 className="text-sm font-bold text-[var(--text-primary)]">
            {this.props.fallbackTitle || 'A temporary display error occurred in this view.'}
          </h3>
          <p className="text-xs text-[var(--text-secondary)] font-mono max-w-lg mx-auto break-words">
            {this.state.error?.message || 'Unknown error'}
          </p>
          <div className="pt-2">
            <button
              onClick={this.handleReload}
              className="px-4 py-2 bg-[var(--accent)] text-white rounded-xl text-xs font-semibold hover:opacity-90 transition-opacity inline-flex items-center space-x-2"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry and Reload View</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
