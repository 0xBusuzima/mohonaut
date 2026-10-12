'use client';

import '@rainbow-me/rainbowkit/styles.css';
import {
  RainbowKitAuthenticationProvider,
  RainbowKitProvider,
  darkTheme,
} from '@rainbow-me/rainbowkit';
import type { AuthenticationStatus } from '@rainbow-me/rainbowkit';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { WagmiProvider } from 'wagmi';
import { siweAdapter } from '../../game/auth';
import { wagmiConfig } from '../../game/wallet';
import { API_URL } from '../../lib/site';
import { ME_KEY, useMe } from '../../social/session';
import { PlayScreen } from './PlayScreen';

const queryClient = new QueryClient();

const theme = darkTheme({
  accentColor: '#FF6B1A',
  accentColorForeground: '#0E1013',
  borderRadius: 'small',
  fontStack: 'system',
});

/** Sign-in (SIWE) is offered only when the API is configured; playing needs only a wallet. */
function Auth({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const { me, loading } = useMe();
  if (API_URL === '') return <>{children}</>;
  const status: AuthenticationStatus = loading
    ? 'loading'
    : me === null
      ? 'unauthenticated'
      : 'authenticated';
  const adapter = {
    ...siweAdapter,
    verify: async (args: Parameters<typeof siweAdapter.verify>[0]) => {
      const ok = await siweAdapter.verify(args);
      await client.invalidateQueries({ queryKey: ME_KEY });
      return ok;
    },
    signOut: async () => {
      await siweAdapter.signOut();
      client.setQueryData(ME_KEY, null);
    },
  };
  return (
    <RainbowKitAuthenticationProvider adapter={adapter} status={status}>
      {children}
    </RainbowKitAuthenticationProvider>
  );
}

export function PlayApp({ openConnect = false }: { openConnect?: boolean }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <Auth>
          <RainbowKitProvider theme={theme} modalSize="compact">
            <PlayScreen openConnect={openConnect} />
          </RainbowKitProvider>
        </Auth>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
