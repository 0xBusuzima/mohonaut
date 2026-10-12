'use client';

import { WalletProviders } from '../../game/WalletProviders';
import { PlayScreen } from './PlayScreen';

export function PlayApp({ openConnect = false }: { openConnect?: boolean }) {
  return (
    <WalletProviders>
      <PlayScreen openConnect={openConnect} />
    </WalletProviders>
  );
}
