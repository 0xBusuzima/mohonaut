import type { Metadata } from 'next';
import { Card } from '../../components/Card';
import { SitePage } from '../../components/SiteChrome';

export const metadata: Metadata = {
  title: 'Season 0',
  description:
    'Testnet Season 0: the whole game on Robinhood Chain testnet, five milestones for the Pioneer badge, and the rules.',
};

const MILESTONES = [
  ['First diesel', 'Buy diesel once: your drill site opens with a free Pilot Rig.'],
  ['First rig', 'Buy a rig in the Equipment Market.'],
  ['Site level 3', 'Upgrade your drill site to level 3.'],
  ['First refine', 'Refine some $MOHN, standard or fast.'],
  ['A crew', 'Start a crew or join one.'],
];

export default function Season0Page() {
  return (
    <SitePage>
      <h1 className="font-display text-5xl font-black tracking-wide uppercase">Season 0</h1>
      <p className="mt-4 text-lg">
        The real contracts and the whole game, on Robinhood Chain testnet. Nothing in Season 0 has
        value: test ETH, test $MOHN and testnet rigs stay on testnet.
      </p>

      <h2 className="mt-12 font-display text-3xl font-black tracking-wide uppercase">
        The Pioneer badge
      </h2>
      <p className="mt-4">
        Finish these five milestones during Season 0 and the Pioneer badge appears on your drill
        site. It is cosmetic and cannot be transferred; it carries over to mainnet as a badge only.
        There are no token rewards for Season 0.
      </p>
      <ol className="mt-6 grid gap-4 sm:grid-cols-2">
        {MILESTONES.map(([title, text], i) => (
          <li key={title}>
            <Card label={`Milestone ${i + 1}`} title={title}>
              <p>{text}</p>
            </Card>
          </li>
        ))}
      </ol>

      <h2 className="mt-12 font-display text-3xl font-black tracking-wide uppercase">Rules</h2>
      <ul className="mt-4 flex list-disc flex-col gap-2 pl-6">
        <li>
          Test ETH comes from our{' '}
          <a href="/faucet/" className="text-data underline">
            faucet
          </a>
          : once a day per wallet, behind a bot check.
        </li>
        <li>
          One person, one drill site. Wallet farms, scripted sign-ups and bot traffic are flagged;
          flagged accounts get no badges or season plaques.
        </li>
        <li>
          Invite friends with your public page link (Profile → Copy invite link). Inviting does not
          count toward any badge.
        </li>
        <li>
          Found a bug? Tell us through{' '}
          <a href="/support/" className="text-data underline">
            support
          </a>
          . Security issues follow the rules on the{' '}
          <a href="/security/" className="text-data underline">
            security
          </a>{' '}
          page.
        </li>
        <li>Testnet can be reset or redeployed at any time; your badge record is kept.</li>
      </ul>

      <a
        href="/play/"
        className="mt-12 inline-flex h-11 items-center rounded-md bg-orange px-5 font-condensed font-semibold tracking-wide text-night uppercase"
      >
        Play Season 0
      </a>
    </SitePage>
  );
}
