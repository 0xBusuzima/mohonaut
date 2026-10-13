'use client';

import { Component } from 'react';
import type { ReactNode } from 'react';
import { reportError } from '../../lib/errors';
import { PxButton } from './px';

/**
 * Around one window's body: an error inside it (an unexpected answer from the API, say) shows a
 * short note in that window and is reported, while the site and the HUD keep running.
 */
export class WindowBoundary extends Component<
  { children: ReactNode; onClose?: (() => void) | undefined },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: unknown): void {
    reportError(error);
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="flex flex-col items-center gap-3 text-center">
        <p className="text-lg">
          This window hit a snag. Your site is safe on-chain: close it and open it again.
        </p>
        {this.props.onClose !== undefined && (
          <PxButton variant="light" onClick={this.props.onClose}>
            Close
          </PxButton>
        )}
      </div>
    );
  }
}
