'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { gameChain } from '../../../game/network';
import type { GameState } from '../../../game/state';
import { useRigQuote } from '../../../game/quote';
import { MarketWindow, RigsWindow } from '../../play/RigCards';

/** Chain reads only (the market's batch quotes); no wallet in the preview. */
const config = createConfig({ chains: [gameChain], transports: { [gameChain.id]: http() } });
const queries = new QueryClient();

/** The windows open without a wallet: buttons do nothing here. */
const NO_ACTION = { busy: null, run: () => Promise.resolve(false) };

export function RigWindows({
  panel,
  state,
  openMarket,
}: {
  panel: 'market' | 'rigs';
  state: GameState;
  openMarket: () => void;
}) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queries}>
        {panel === 'market' ? (
          <MarketWindow state={state} action={NO_ACTION} useQuote={useRigQuote} />
        ) : (
          <RigsWindow state={state} action={NO_ACTION} openMarket={openMarket} />
        )}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
