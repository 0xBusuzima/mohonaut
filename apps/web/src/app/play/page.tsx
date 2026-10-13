import type { Metadata } from 'next';
import { PlayLoader } from './PlayLoader';

export const metadata: Metadata = {
  title: 'Play',
  description: 'Your drill site: diesel, rigs, the Equipment Market and the refinery.',
  robots: { index: false },
};

export default function PlayPage() {
  return <PlayLoader />;
}
