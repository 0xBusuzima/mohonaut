'use client';

import { useEffect } from 'react';
import { useAccount, useConnect } from 'wagmi';
import { E2E_ACCOUNT } from './wallet';

/** End-to-end builds (NEXT_PUBLIC_E2E_ACCOUNT): connect the local anvil account by itself. */
export function useE2EConnect(): void {
  const { isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  useEffect(() => {
    if (E2E_ACCOUNT === '' || isConnected) return;
    const mock = connectors.find((c) => c.id === 'mock');
    if (mock !== undefined) connect({ connector: mock });
  }, [connect, connectors, isConnected]);
}
