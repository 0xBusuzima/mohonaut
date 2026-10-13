import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { fontVariables } from './fonts';
import { AnnouncementBar } from '../components/AnnouncementBar';
import { ErrorReporting } from '../components/ErrorReporting';
import { ToastProvider } from '../components/Toast';

export const metadata: Metadata = {
  title: { default: 'Mohonaut — Race to the Moho', template: '%s · Mohonaut' },
  description:
    'An on-chain idle drilling game on Robinhood Chain. One shared bore, a published formula, every $MOHN mined.',
  metadataBase: new URL('https://mohonaut.com'),
  openGraph: {
    type: 'website',
    siteName: 'Mohonaut',
    title: 'Mohonaut — Not the moon. The Moho.',
    description:
      'An on-chain idle drilling game. Run a drill site, fuel your rigs and core one shared hole with everyone else. Every token comes out of the ground.',
    images: [
      { url: '/og.png', width: 1200, height: 630, alt: 'Mohonaut: Not the moon. The Moho.' },
    ],
  },
  twitter: { card: 'summary_large_image', site: '@playmohonaut', creator: '@onderyazici' },
};

export const viewport: Viewport = {
  themeColor: '#16191D',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="dark" className={fontVariables}>
      <body className="min-h-dvh bg-surface text-fg antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-orange focus:px-4 focus:py-2 focus:text-night"
        >
          Skip to content
        </a>
        <ErrorReporting />
        <ToastProvider>
          <AnnouncementBar />
          <div id="main">{children}</div>
        </ToastProvider>
      </body>
    </html>
  );
}
