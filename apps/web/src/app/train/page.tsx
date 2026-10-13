import type { Metadata } from 'next';
import { TrainLoader } from './TrainLoader';

export const metadata: Metadata = {
  title: 'Training site',
  description:
    'Try Mohonaut without a wallet: a simulated drill site at 60x speed with practice diesel and practice $MOHN. Nothing of value, nothing on-chain.',
  openGraph: {
    type: 'website',
    siteName: 'Mohonaut',
    title: 'Mohonaut training site: try the rig',
    description:
      'A drill site in your browser: no wallet, practice diesel and practice $MOHN, nothing of value.',
    // Drawn at build time from the game's pixel art (scripts/gen-pixel-art.mjs).
    images: [
      {
        url: '/og-train.png',
        width: 1200,
        height: 630,
        alt: 'Mohonaut training site: four rigs at night and Foreman Mo.',
      },
    ],
  },
};

export default function TrainPage() {
  return <TrainLoader />;
}
