import React from 'react';
import { Icon } from './Icon';

/**
 * ErrorBoundary - last line of defence for the UI.
 *
 * Without this, any render-time exception (e.g. a page reading a property of a
 * payload that arrived in an unexpected shape) unmounts the whole React tree and
 * leaves the user staring at a blank white page with no way back. Instead we show
 * a friendly card with the error text, a Reload button and a Go-to-dashboard
 * link, and we log the real error to the console for debugging.
 */
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Keep the technical detail in the console; users only see the friendly card.
    console.error('Unhandled UI error:', error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const message = error?.message || 'An unexpected error occurred.';
    // `compact` is used to wrap an individual panel (e.g. one site tab) so a
    // single broken panel does not replace the whole page.
    const wrapper = this.props.compact
      ? 'card text-center py-8'
      : 'card max-w-lg w-full text-center';
    const outer = this.props.compact ? '' : 'min-h-screen flex items-center justify-center p-6 bg-gray-50';

    return (
      <div className={outer}>
        <div className={wrapper}>
          {!this.props.compact && (
            <Icon name="alertTriangle" size={36} className="mx-auto mb-3 text-warning-500" />
          )}
          <h1 className={`font-semibold text-gray-900 mb-2 ${this.props.compact ? 'text-base' : 'text-xl'}`}>
            Something went wrong
          </h1>
          <p className="text-gray-500 mb-2">
            This screen hit an unexpected error. Your data has not been changed.
          </p>
          <p className="text-xs text-gray-400 mb-5 break-words">{message}</p>
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => this.setState({ error: null })}
            >
              Try again
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => window.location.reload()}
            >
              Reload page
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
