import { connectorsForWallets } from '@rainbow-me/rainbowkit';
import {
  injectedWallet,
  metaMaskWallet,
  phantomWallet,
  rabbyWallet,
  walletConnectWallet,
} from '@rainbow-me/rainbowkit/wallets';
import { createConfig, http } from 'wagmi';
import { mock } from '@wagmi/core';
import type { Address } from 'viem';
import { gameChain } from './network';

/** WalletConnect (mobile wallets, Robinhood Wallet) needs a free Reown project id. */
const projectId = process.env['NEXT_PUBLIC_WC_PROJECT_ID'] ?? '';

/** End-to-end tests connect a local anvil account through wagmi's mock connector. */
export const E2E_ACCOUNT = (process.env['NEXT_PUBLIC_E2E_ACCOUNT'] ?? '') as Address | '';

const wallets =
  projectId === ''
    ? [{ groupName: 'Browser wallets', wallets: [injectedWallet] }]
    : [
        { groupName: 'Popular', wallets: [metaMaskWallet, rabbyWallet, phantomWallet] },
        { groupName: 'More', wallets: [walletConnectWallet, injectedWallet] },
      ];

const connectors = [
  ...connectorsForWallets(wallets, {
    appName: 'Mohonaut',
    // RainbowKit requires a value; without a project id only browser wallets are listed.
    projectId: projectId === '' ? 'mohonaut-browser-wallets-only' : projectId,
  }),
  ...(E2E_ACCOUNT === '' ? [] : [mock({ accounts: [E2E_ACCOUNT], features: { reconnect: true } })]),
];

export const wagmiConfig = createConfig({
  chains: [gameChain],
  connectors,
  transports: { [gameChain.id]: http() },
  ssr: false,
});
