import React from 'react';

interface Props {
  name: string;
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error(`[CB8] ${this.props.name} crashed:`, error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (error) {
      return (
        <div style={{ padding: 32, color: '#f88', fontFamily: 'monospace', background: '#111', height: '100%' }}>
          <h2 style={{ color: '#f44', marginBottom: 12 }}>{this.props.name} encountered an error</h2>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{error.message}</pre>
          <button
            onClick={() => this.setState({ error: null })}
            style={{ marginTop: 16, padding: '6px 16px', cursor: 'pointer' }}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
