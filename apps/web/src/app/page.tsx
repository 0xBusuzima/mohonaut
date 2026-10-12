import { KOLA_LINE_M, MOHO_LINE_M, STRATA } from '@mohonaut/sdk';
import Link from 'next/link';
import { StratumBadge } from '../components/Badge';
import { BoreLog } from '../components/BoreLog';
import { Card } from '../components/Card';
import { LiveStrip } from '../components/LiveStrip';
import { SiteFooter, SiteHeader } from '../components/SiteChrome';
import { Table } from '../components/Table';
import { GEN1_RIGS, efficiency } from '../lib/catalog';
import { LINKS } from '../lib/site';
import { HomeHero } from './HomeHero';

const FAQ_PREVIEW = [
  {
    q: 'What is $MOHN used for?',
    a: 'Buying rigs and site upgrades in the Equipment Market. 80% of in-game $MOHN spend is burned for good; 20% returns to the reserve.',
  },
  {
    q: 'How is my share calculated?',
    a: "Your share of each hour's emission is 90% of that hour's slice, times your active Drill Power divided by the network's.",
  },
  {
    q: 'What do I pay ETH for?',
    a: "Diesel. ETH from fuel is routed 55% to buyback & burn, 30% to protocol liquidity that can't be withdrawn, 15% to operations. Published weekly.",
  },
  {
    q: 'Can the team change the rules?',
    a: "Some things can't change at all: the token, the cap, the emission schedule, the 90/5/5 split, the burn ratio and existing rigs. Everything else has hard limits in code and waits 96 hours in a public queue.",
  },
  {
    q: 'Is it audited?',
    a: 'Not yet. Here is what we did instead, and when an independent audit happens: /security.',
  },
  {
    q: 'When can I withdraw my $MOHN?',
    a: 'Mined $MOHN goes through the Refinery: free with a 72-hour queue, or instant for an 8% fee (half burned, half returned to the reserve). Refining is closed during the 72 hours of Genesis, and there is no pool before Market Open. We don’t comment on price.',
  },
];

const ROADMAP = [
  ['Design system and services', 'done'],
  ['Training Site', 'next'],
  ['Testnet Season 0', 'next'],
  ['Economy paper', 'next'],
  ['Public code review (4 weeks)', 'next'],
  ['Contracts live, verified 7 days before Genesis', 'next'],
  ['Pre-fill → Genesis Dig → Market Open', 'next'],
  ['Crews and Season 1', 'next'],
  ['Independent audit, paid from operations revenue', 'next'],
];

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main>
        {/* S1 — Hero: the site at night, full height */}
        <HomeHero />

        {/* S2 — Live strip */}
        <section aria-label="Live numbers" className="mx-auto max-w-6xl px-4">
          <LiveStrip />
        </section>

        {/* S3 — How it works */}
        <section className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="font-display text-4xl font-black tracking-wide uppercase">How it works</h2>
          <ol className="mt-6 grid gap-4 md:grid-cols-3">
            <li>
              <Card label="1" title="Build">
                Every drill site starts with a free Pilot Rig. Level up your site for more pads and
                more fuel-line capacity.
              </Card>
            </li>
            <li>
              <Card label="2" title="Fuel">
                Rigs burn diesel, measured in litres per hour. You fill your tank with ETH. When a
                rig isn’t worth its fuel, shut it down.
              </Card>
            </li>
            <li>
              <Card label="3" title="Drill">
                Every hour the network cores a fixed slice of what’s left in the reserve. 90% goes
                to players, split by Drill Power: your share is your active DP divided by
                everyone’s.
              </Card>
            </li>
          </ol>
          <p className="mt-6 text-fg-muted">
            The deeper the bore, the harder the rock: the hourly slice shrinks as the reserve does.
          </p>
          <p className="num mt-2">your share of hour h = E_h × 0.90 × your DP ÷ network DP</p>
          <Link href="/docs/economy/" className="mt-2 inline-block text-data underline">
            How emission works
          </Link>
        </section>

        {/* S4 — Fair launch */}
        <section className="mx-auto max-w-6xl px-4">
          <div className="rounded-xl border-2 border-orange bg-surface-sunken p-8">
            <p className="font-display text-3xl font-black tracking-wide uppercase">
              No presale. No team buy. No premine.
            </p>
            <p className="mt-4 max-w-3xl">
              The emission split is fixed in code: 90% players, 5% team, 5% treasury. The team’s
              share accrues hour by hour and can only leave through the same public 72-hour refine
              queue as everyone else’s.
            </p>
            <p className="mt-4 max-w-3xl">
              Contracts are deployed and verified 7 days before Genesis. There is no pool to snipe:
              the contract creates it 72 hours after Genesis starts, at a ratio computed from
              Genesis data.
            </p>
          </div>
        </section>

        {/* S5 — The rigs */}
        <section className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="font-display text-4xl font-black tracking-wide uppercase">The rigs</h2>
          <div className="mt-6">
            <Table
              caption="Generation 1 rigs"
              rowKey={(r) => String(r.id)}
              rows={GEN1_RIGS}
              columns={[
                { key: 'name', header: 'Rig', render: (r) => r.name },
                {
                  key: 'dp',
                  header: 'DP',
                  numeric: true,
                  render: (r) => r.dp.toLocaleString('en-US'),
                },
                { key: 'burn', header: 'ℓ/h', numeric: true, render: (r) => r.litresPerHour },
                { key: 'eff', header: 'DP per ℓ/h', numeric: true, render: (r) => efficiency(r) },
                { key: 'unlock', header: 'Unlock', render: (r) => r.unlock },
              ]}
            />
          </div>
          <p className="mt-4 max-w-3xl text-fg-muted">
            Bigger rigs buy fuel efficiency, not cheaper Drill Power. Existing rigs never change:
            the contracts have no function to edit them, and any upgrade waits 7 days in a public
            queue.
          </p>
        </section>

        {/* S6 — World Bore and strata */}
        <section className="mx-auto grid max-w-6xl gap-8 px-4 md:grid-cols-[auto_1fr]">
          <BoreLog depthMm={0n} height={520} />
          <div>
            <h2 className="font-display text-4xl font-black tracking-wide uppercase">
              One bore. Eight strata.
            </h2>
            <p className="mt-4 max-w-2xl">
              World Bore depth = all $MOHN mined so far ÷ 1,000, in metres. New rig generations,
              palettes and music unlock when the bore crosses each line, not when a calendar says
              so. Anyone can check how deep we are.
            </p>
            <ul className="mt-6 flex flex-col gap-2">
              {STRATA.map((s, i) => (
                <li key={s.name} className="flex items-baseline justify-between gap-4">
                  <StratumBadge index={i} />
                  <span className="num text-fg-muted">
                    from {s.fromM.toLocaleString('en-US')} m
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-fg-muted">
              Kola Line at {KOLA_LINE_M.toLocaleString('en-US')} m: the deepest hole people have
              actually drilled. Moho Line at {MOHO_LINE_M.toLocaleString('en-US')} m: where the
              crust ends.
            </p>
          </div>
        </section>

        {/* S7 — Crews, Seasons, Survey */}
        <section className="mx-auto grid max-w-6xl gap-4 px-4 py-16 md:grid-cols-3">
          <Card title="Crews">
            5 to 25 players under one banner. Crew ranks are cosmetic; emission is never split by
            crew.
          </Card>
          <Card title="Seasons">
            About eight weeks each, ranked on World Bore contribution, fuel efficiency and crew
            play. Rewards are badges and titles.
          </Card>
          <Card title="Survey">
            Once a day, free. Bring back a core sample, a fossil or a piece of drilling history for
            your Core Collection. Nothing in Mohonaut is a paid roll.
          </Card>
        </section>

        {/* S8 — Trust and safety */}
        <section className="mx-auto max-w-6xl px-4">
          <h2 className="font-display text-4xl font-black tracking-wide uppercase">
            Trust & safety
          </h2>
          <ul className="mt-6 grid gap-3 md:grid-cols-2">
            <li>Verified contracts, published 7 days before Genesis.</li>
            <li>
              Immutable token: no owner, one minter, no tax, no blacklist, no pause. Hard cap
              100,000,000. At most 500,000 $MOHN can be minted per UTC day, and that limit is
              written into the token.
            </li>
            <li>
              Adjustable settings have hard limits in code and wait 96 hours in a public queue.
              Contract upgrades wait 7 days.{' '}
              <Link href="/economy/#timelock" className="text-data underline">
                Live queue
              </Link>
            </li>
            <li>
              Unaudited. What we did instead: an internal multi-role review, formal proofs of the
              mint limits, fuzzing and mutation testing, four weeks of public code review and a
              public testnet season. An independent audit is the first big item paid for from
              operations revenue.{' '}
              <Link href="/security/" className="text-data underline">
                /security
              </Link>
            </li>
            <li>
              Guarded launch: minting is capped at 150,000 $MOHN per hour, and an emergency pause
              expires on its own after 72 hours.
            </li>
            <li>We never DM first. Official links live on /contracts.</li>
          </ul>
        </section>

        {/* S9 — Founder */}
        <section className="mx-auto max-w-6xl px-4 py-16">
          <Card label="Founder" title="Built in public">
            I’m building Mohonaut under my own name. Ask me anything on X, in public:{' '}
            <a href={LINKS.founder} className="text-data underline" rel="me noopener">
              @onderyazici
            </a>
          </Card>
        </section>

        {/* S10 — Roadmap */}
        <section className="mx-auto max-w-6xl px-4">
          <h2 className="font-display text-4xl font-black tracking-wide uppercase">
            Gates, not dates
          </h2>
          <ol className="mt-6 flex flex-col gap-2">
            {ROADMAP.map(([step, state]) => (
              <li key={step} className="flex items-baseline gap-3">
                <span
                  className={`font-condensed text-sm font-semibold uppercase ${state === 'done' ? 'text-good' : 'text-fg-muted'}`}
                >
                  {state}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </section>

        {/* S11 — FAQ preview */}
        <section className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="font-display text-4xl font-black tracking-wide uppercase">FAQ</h2>
          <dl className="mt-6 grid gap-6 md:grid-cols-2">
            {FAQ_PREVIEW.map((f) => (
              <div key={f.q}>
                <dt className="font-semibold">{f.q}</dt>
                <dd className="mt-1 text-fg-muted">{f.a}</dd>
              </div>
            ))}
          </dl>
          <Link href="/faq/" className="mt-6 inline-block text-data underline">
            All questions
          </Link>
        </section>
      </main>
      <SiteFooter />
      <script
        type="application/ld+json"
        // Structured data (docs/05 §3.6): the game and the organisation behind it.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([
            {
              '@context': 'https://schema.org',
              '@type': 'VideoGame',
              name: 'Mohonaut',
              genre: 'Idle',
              gamePlatform: 'Web browser',
              url: 'https://mohonaut.com/',
            },
            {
              '@context': 'https://schema.org',
              '@type': 'Organization',
              name: 'Mohonaut',
              url: 'https://mohonaut.com/',
              sameAs: [LINKS.x, LINKS.founder],
            },
          ]),
        }}
      />
    </>
  );
}
