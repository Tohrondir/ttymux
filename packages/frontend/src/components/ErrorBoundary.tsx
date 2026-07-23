import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Without this, an uncaught render error anywhere below unmounts the whole
 * tree, taking every event listener with it (including the router's
 * `popstate` handler), the page looks frozen and even the browser back
 * button stops doing anything until a manual reload.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('ttymux crashed:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-ink px-6 text-center">
          <p className="font-mono text-sm text-status-error">Something went wrong: {this.state.error.message}</p>
          <a
            href="/"
            className="rounded-md border border-line px-3 py-1.5 text-sm text-fog transition-colors hover:border-signal-dim hover:text-paper"
          >
            Back to dashboard
          </a>
        </div>
      );
    }
    return this.props.children;
  }
}
