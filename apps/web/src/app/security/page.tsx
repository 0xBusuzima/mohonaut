import type { Metadata } from 'next';
import { Badge } from '../../components/Badge';
import { SitePage } from '../../components/SiteChrome';
import { LINKS } from '../../lib/site';

export const metadata: Metadata = {
  title: 'Security',
  description:
    'Unaudited: what we did instead, the limits written into the contracts, the pause and how to report a bug.',
};

export default function SecurityPage() {
  return (
    <SitePage>
      <h1 className="font-display text-5xl font-black tracking-wide uppercase">Security</h1>
      <p className="mt-4">
        <Badge tone="warning">Unaudited</Badge>
      </p>
      <p className="mt-4 text-lg">
        Mohonaut has not had an independent audit yet. It is the first large item paid for from
        operations revenue. Until then, use it at your own risk; this page lists what we did instead
        and the limits that hold whatever happens.
      </p>

      <h2 className="mt-10 font-display text-3xl font-black tracking-wide uppercase">
        What we did instead
      </h2>
      <ul className="mt-4 list-disc space-y-2 pl-6">
        <li>
          An internal multi-role review of every contract: 14 confirmed findings, each fixed or
          documented with the test that proves it.
        </li>
        <li>
          Formal proofs (Halmos) that only the minter can mint, the cap holds and the daily limit
          holds.
        </li>
        <li>
          Property fuzzing (Foundry, Medusa, Echidna) of the economy invariants, and mutation
          testing of the test suite.
        </li>
        <li>
          Static analysis (Slither, Aderyn) on every change; 99.9% line coverage of the contracts.
        </li>
        <li>Four weeks of public code review and a public testnet season before mainnet.</li>
      </ul>

      <h2 className="mt-10 font-display text-3xl font-black tracking-wide uppercase">
        Limits written into the code
      </h2>
      <ul className="mt-4 list-disc space-y-2 pl-6">
        <li>At most 500,000 $MOHN can be minted per UTC day, enforced by the token itself.</li>
        <li>At most 150,000 $MOHN in any 60 minutes; a mint above that is refused.</li>
        <li>
          Every parameter has hard bounds and a rate limit, and waits 96 hours in a public queue;
          upgrades wait 7 days.
        </li>
        <li>
          Protocol liquidity can never be withdrawn; the buyback spends at most 2% of the pool per
          day.
        </li>
        <li>
          The Guardian can pause player actions for at most 72 hours; the pause ends on its own and
          cannot touch balances.
        </li>
      </ul>

      <h2 className="mt-10 font-display text-3xl font-black tracking-wide uppercase">
        Report a bug
      </h2>
      <p className="mt-4">
        Email{' '}
        <a href={LINKS.security} className="text-data underline">
          security@mohonaut.com
        </a>
        . Please do not post details publicly before we answer. Bug bounty rules are published with
        the public code review.
      </p>
    </SitePage>
  );
}
