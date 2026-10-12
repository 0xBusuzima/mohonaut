'use client';

import './globals.css';
import { ErrorScreen } from '../components/ErrorScreen';

/** Last-resort boundary when the root layout itself fails: it renders its own document. */
export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en" data-theme="dark">
      <body className="min-h-dvh bg-surface text-fg">
        <ErrorScreen error={error} reset={reset} />
      </body>
    </html>
  );
}
