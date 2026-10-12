import type { Metadata } from 'next';
import { Badge } from '../../components/Badge';
import { SitePage } from '../../components/SiteChrome';
import { DEPLOYMENT, LINKS, NETWORK } from '../../lib/site';

export const metadata: Metadata = {
  title: 'Official contracts',
  description:
    'Every Mohonaut contract address, its role and its timelock. Get addresses only from this page.',
};

const ROWS: { key: keyof typeof DEPLOYMENT; name: string; role: string }[] = [
  { key: 'MohnToken', name: 'MohnToken ($MOHN)', role: 'The token. No owner, one minter, 100,000,000 cap, 500,000 per day.' },
  { key: 'MiningCore', name: 'MiningCore', role: 'The game: drill sites, rigs, diesel, emission, refinery (upgradeable through the 7-day timelock).' },
  { key: 'RevenueRouter', name: 'RevenueRouter', role: 'Routes diesel ETH: 55% buyback, 30% protocol liquidity, 15% operations.' },
  { key: 'LiquidityManager', name: 'LiquidityManager', role: 'Owns the protocol liquidity (it has no function to remove it) and keeps the 1-hour average price that bounds keeper trades.' },
  { key: 'BuybackBurner', name: 'BuybackBurner', role: 'Buys $MOHN with the buyback share (at most 1/20 of it per day, near the 1-hour average price) and burns all of it.' },
  { key: 'ParamsTimelock', name: 'Timelock (96 h)', role: 'Every parameter change waits here for 96 hours.' },
  { key: 'UpgradeTimelock', name: 'Timelock (7 days)', role: 'Contract upgrades wait here for 7 days.' },
];

export default function ContractsPage() {
  return (
    <SitePage wide>
      <h1 className="font-display text-5xl font-black tracking-wide uppercase">Official contracts</h1>
      <p className="mt-4 max-w-3xl text-lg">
        Get addresses only from this page and the pinned post of{' '}
        <a href={LINKS.x} className="text-data underline" rel="me noopener">
          @playmohonaut
        </a>
        . We never DM first.
      </p>
      {NETWORK.testnet && (
        <p className="mt-4">
          <Badge tone="warning">{NETWORK.name} (chain {NETWORK.chainId}): testnet only, nothing has value</Badge>
        </p>
      )}
      <ul className="mt-8 flex flex-col gap-4">
        {ROWS.map((r) => {
          const address = String(DEPLOYMENT[r.key]);
          return (
            <li key={r.key} className="rounded-lg border border-line bg-surface-raised p-4">
              <p className="font-condensed text-lg font-semibold uppercase">{r.name}</p>
              <p className="num mt-1 break-all">{address}</p>
              <p className="mt-1 text-fg-muted">{r.role}</p>
              <a
                href={`${NETWORK.explorer}/address/${address}`}
                className="mt-2 inline-block text-data underline"
                rel="noopener"
              >
                Verified source on Blockscout
              </a>
            </li>
          );
        })}
      </ul>
      <section className="mt-12 max-w-3xl">
        <h2 className="font-display text-3xl font-black tracking-wide uppercase">Who can do what</h2>
        <ul className="mt-4 list-disc space-y-2 pl-6">
          <li>Parameter changes: proposed by the operations Safe, public for 96 hours, then anyone can execute them.</li>
          <li>Upgrades of MiningCore: the same, with 7 days.</li>
          <li>Guardian Safe: can pause player actions for at most 72 hours; the pause ends on its own.</li>
          <li>Keeper: closes hours, finalises refines and runs the capped daily buyback and liquidity addition. Nothing else.</li>
          <li>Nobody can mint outside the game rules, change existing rigs, or remove protocol liquidity.</li>
        </ul>
      </section>
    </SitePage>
  );
}
