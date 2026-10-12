import type { Metadata } from 'next';
import { TrainLoader } from './TrainLoader';

export const metadata: Metadata = {
  title: 'Training site',
  description:
    'Try Mohonaut without a wallet: a simulated drill site at 60x speed with practice diesel and practice $MOHN. Nothing of value, nothing on-chain.',
};

export default function TrainPage() {
  return <TrainLoader />;
}
