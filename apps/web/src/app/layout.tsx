import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import '@fontsource/barlow/400.css';
import '@fontsource/barlow/600.css';
import '@fontsource/barlow/700.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/big-shoulders-display/800';
import '@fontsource/big-shoulders-display/900';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/saira-stencil-one/400.css';
import './globals.css';
import { ToastProvider } from '../components/Toast';

export const metadata: Metadata = {
  title: { default: 'Mohonaut — Race to the Moho', template: '%s · Mohonaut' },
  description:
    'An on-chain idle drilling game on Robinhood Chain. One shared bore, a published formula, every $MOHN mined.',
  metadataBase: new URL('https://mohonaut.com'),
};

export const viewport: Viewport = {
  themeColor: '#16191D',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="dark">
      <body className="min-h-dvh bg-surface text-fg antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-orange focus:px-4 focus:py-2 focus:text-night"
        >
          Skip to content
        </a>
        <ToastProvider>
          <div id="main">{children}</div>
        </ToastProvider>
      </body>
    </html>
  );
}
