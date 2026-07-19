import { Component, type ErrorInfo, type ReactNode } from 'react';

import {
  CRASH_RECOVERY_DELAY_MS,
  didAutoResetOnThisLoad,
  resetStateAndReload,
  scheduleHealthyClear
} from './crashRecovery';

import './appErrorBoundary.css';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  secondsLeft: number;
}

/**
 * Catches render crashes. If one does not clear within a few seconds,
 * resets persisted form state and reloads (same as `?reset=true`).
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null, secondsLeft: Math.ceil(CRASH_RECOVERY_DELAY_MS / 1000) };

  private recoveryTimer: number | null = null;
  private countdownTimer: number | null = null;
  private healthyClear: (() => void) | null = null;
  private recoveryStarted = false;

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error, secondsLeft: Math.ceil(CRASH_RECOVERY_DELAY_MS / 1000) };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('App crash caught by error boundary:', error, info.componentStack);
    this.beginRecovery();
  }

  componentDidMount() {
    this.healthyClear = scheduleHealthyClear();
  }

  componentWillUnmount() {
    this.clearTimers();
    this.healthyClear?.();
  }

  private clearTimers() {
    if (this.recoveryTimer !== null) {
      window.clearTimeout(this.recoveryTimer);
      this.recoveryTimer = null;
    }
    if (this.countdownTimer !== null) {
      window.clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
  }

  private beginRecovery() {
    if (this.recoveryStarted) return;
    this.recoveryStarted = true;

    this.healthyClear?.();
    this.healthyClear = null;
    this.clearTimers();

    // Previous auto-reset did not stick; avoid looping.
    if (didAutoResetOnThisLoad()) return;

    this.countdownTimer = window.setInterval(() => {
      this.setState((prev) => ({
        secondsLeft: Math.max(0, prev.secondsLeft - 1)
      }));
    }, 1000);

    this.recoveryTimer = window.setTimeout(() => {
      resetStateAndReload();
    }, CRASH_RECOVERY_DELAY_MS);
  }

  private handleResetNow = () => {
    this.clearTimers();
    resetStateAndReload();
  };

  render() {
    const { error, secondsLeft } = this.state;

    if (!error) {
      return this.props.children;
    }

    const skipAutoRecovery = didAutoResetOnThisLoad();

    return (
      <div className="app-crash-recovery" role="alert">
        <h1 className="app-crash-recovery-title">Something went wrong</h1>
        {skipAutoRecovery ? (
          <>
            <p className="app-crash-recovery-body">
              The app crashed again after resetting. You can try resetting once more, or reload the
              page.
            </p>
            <div className="app-crash-recovery-actions">
              <button type="button" className="app-crash-recovery-button" onClick={this.handleResetNow}>
                Reset and reload
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="app-crash-recovery-body">
              Resetting saved settings and reloading in {secondsLeft}s…
            </p>
            <div className="app-crash-recovery-actions">
              <button type="button" className="app-crash-recovery-button" onClick={this.handleResetNow}>
                Reset now
              </button>
            </div>
          </>
        )}
      </div>
    );
  }
}
