'use client';

import { WalletProviders } from '../../game/WalletProviders';
import { Game } from './Game';

export function PlayApp({ openConnect = false }: { openConnect?: boolean }) {
  return (
    <WalletProviders>
      <Game openConnect={openConnect} />
    </WalletProviders>
  );
}
