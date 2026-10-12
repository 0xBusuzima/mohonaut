import type { Metadata } from 'next';
import { SitePage } from '../../components/SiteChrome';
import { FaucetForm } from './FaucetForm';

export const metadata: Metadata = {
  title: 'Testnet faucet',
  description: 'Free test ETH for Mohonaut Season 0 on Robinhood Chain testnet.',
};

export default function FaucetPage() {
  return (
    <SitePage>
      <h1 className="font-display text-5xl font-black tracking-wide uppercase">Testnet faucet</h1>
      <p className="mt-4 text-lg">
        Season 0 runs on Robinhood Chain testnet. Test ETH has no value; it only pays for diesel and
        network fees in the test game. This faucet never runs on mainnet.
      </p>
      <FaucetForm />
    </SitePage>
  );
}
