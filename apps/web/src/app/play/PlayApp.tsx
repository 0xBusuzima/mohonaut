'use client';

import '@rainbow-me/rainbowkit/styles.css';
import {
  RainbowKitAuthenticationProvider,
  RainbowKitProvider,
  darkTheme,
} from '@rainbow-me/rainbowkit';
import type { AuthenticationStatus } from '@rainbow-me/rainbowkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { WagmiProvider } from 'wagmi';
import { sessionActive, siweAdapter } from '../../game/auth';
import { wagmiConfig } from '../../game/wallet';
import { API_URL } from '../../lib/site';
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
  const [status, setStatus] = useState<AuthenticationStatus>('loading');
  useEffect(() => {
    void sessionActive().then((active) => setStatus(active ? 'authenticated' : 'unauthenticated'));
  }, []);
  if (API_URL === '') return <>{children}</>;
  const adapter = {
    ...siweAdapter,
    verify: async (args: Parameters<typeof siweAdapter.verify>[0]) => {
      const ok = await siweAdapter.verify(args);
      setStatus(ok ? 'authenticated' : 'unauthenticated');
      return ok;
    },
    signOut: async () => {
      await siweAdapter.signOut();
      setStatus('unauthenticated');
    },
  };
  return (
    <RainbowKitAuthenticationProvider adapter={adapter} status={status}>
      {children}
    </RainbowKitAuthenticationProvider>
  );
}

export function PlayApp() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <Auth>
          <RainbowKitProvider theme={theme} modalSize="compact">
            <PlayScreen />
          </RainbowKitProvider>
        </Auth>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
