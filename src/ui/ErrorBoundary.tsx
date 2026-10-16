import { Component, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

/** Keeps a crash in one page from taking down the whole studio (audio keeps playing). */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error('MIXPLAY view error:', error.message);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="page">
        <div className="empty" role="alert">
          <AlertTriangle />
          <b>This view hit a problem.</b>
          <span className="small">{this.state.error.message}</span>
          <span className="small">Your mix and any playing audio are unaffected.</span>
          <button className="btn" onClick={() => this.setState({ error: null })}>
            <RotateCcw /> Try again
          </button>
        </div>
      </div>
    );
  }
}
