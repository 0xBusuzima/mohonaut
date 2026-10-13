import { STRATA } from '@mohonaut/sdk';
import type { Metadata } from 'next';
import { Card } from '../../components/Card';
import { SitePage } from '../../components/SiteChrome';
import { ForemanMoSvg } from '../../game/pixel/mo-art';
import { GEN1_RIGS } from '../../lib/catalog';
import { LINKS } from '../../lib/site';

export const metadata: Metadata = {
  title: 'Brand',
  description:
    'The Mohonaut press kit: logos to download, colours, type, Foreman Mo, and how to use them.',
};

const LOGOS = [
  { file: 'mohonaut-wordmark-on-charcoal', name: 'Wordmark on charcoal' },
  { file: 'mohonaut-wordmark', name: 'Wordmark' },
  { file: 'mohonaut-wordmark-white', name: 'Wordmark, white' },
  { file: 'mohonaut-lockup-on-charcoal', name: 'Lockup on charcoal' },
  { file: 'mohonaut-mark', name: 'Casing mark (small sizes, icons)' },
  { file: 'mohonaut-monogram', name: 'Monogram' },
];

const COLOURS = [
  ['Night Black', '#0E1013', 'The darkest ground: night sky, the foot of the bore log'],
  ['Charcoal', '#16191D', 'Main background'],
  ['Graphite', '#22272D', 'Panels and cards'],
  ['Steel', '#39414A', 'Borders and dividers, not text'],
  ['Concrete', '#8B939C', 'Secondary text'],
  ['Bone', '#ECE7DC', 'Main text'],
  ['Safety Orange', '#FF6B1A', 'The brand colour: actions, hard hats, rig paint; dark text on it'],
  ['Sodium Amber', '#FFB31A', 'Lamp light in art; warnings in the interface'],
  ['Gauge Cyan', '#2EE6D6', 'Instruments only: live data, "we are here" on the bore log'],
  ['Alarm Red', '#FF3D2E', 'Incidents and errors'],
] as const;

const TYPE = [
  ['Big Shoulders Display', 'Headlines and the wordmark'],
  ['Barlow and Barlow Condensed', 'Interface and body text'],
  ['JetBrains Mono', 'Numbers, depths and gauges'],
  ['Pixelify Sans', 'Inside the game only'],
] as const;

/** The press kit (docs/05 §3.1): downloads, colours, type, the mascot and the rules. */
export default function BrandPage() {
  return (
    <SitePage>
      <h1 className="font-display text-5xl font-black tracking-wide uppercase">Brand</h1>
      <p className="mt-4 max-w-2xl text-lg">
        Logos, colours and type for writing about Mohonaut. Everything here is our own work; the
        fonts are open-licensed (SIL OFL). Please use the files as they are.
      </p>

      <h2 className="mt-12 font-display text-3xl font-black tracking-wide uppercase">Logos</h2>
      <ul className="mt-6 grid gap-4 sm:grid-cols-2">
        {LOGOS.map((l) => (
          <li key={l.file}>
            <Card title={l.name}>
              <div className="grid h-32 place-items-center rounded bg-night p-4">
                <img
                  src={`/brand-kit/${l.file}.svg`}
                  alt={`${l.name} of Mohonaut`}
                  className="max-h-24 w-auto max-w-full"
                />
              </div>
              <p className="mt-3 flex gap-4 text-sm">
                <a href={`/brand-kit/${l.file}.svg`} download className="text-data underline">
                  SVG
                </a>
                <a href={`/brand-kit/${l.file}.png`} download className="text-data underline">
                  PNG
                </a>
              </p>
            </Card>
          </li>
        ))}
      </ul>

      <h2 className="mt-12 font-display text-3xl font-black tracking-wide uppercase">Rules</h2>
      <ul className="mt-4 flex max-w-2xl list-disc flex-col gap-2 pl-6">
        <li>
          Below 64 pixels use the casing mark alone; the monogram reads like a key that small.
        </li>
        <li>Leave clear space around a logo at least the height of its &quot;O&quot;.</li>
        <li>No recolouring, stretching, outlines, shadows or effects.</li>
        <li>
          No other brands next to ours as if endorsed, and never the marks of Robinhood or any other
          company.
        </li>
        <li>No price talk, charts or promises next to the logo.</li>
      </ul>

      <h2 className="mt-12 font-display text-3xl font-black tracking-wide uppercase">Colours</h2>
      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {COLOURS.map(([name, hex, use]) => (
          <li key={hex} className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="h-10 w-10 shrink-0 rounded border border-line"
              style={{ background: hex }}
            />
            <span>
              <span className="font-semibold">{name}</span>{' '}
              <span className="num text-sm text-fg-muted">{hex}</span>
              <span className="block text-sm text-fg-muted">{use}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-6 max-w-2xl text-sm text-fg-muted">
        About 70% of any screen is night (Night Black, Charcoal, Graphite), about 20% Bone text,
        Safety Orange at most 7% and Gauge Cyan at most 3%.
      </p>
      <h3 className="mt-6 font-semibold">The bore log</h3>
      <ul className="mt-3 flex flex-wrap gap-2">
        {STRATA.map((s) => (
          <li key={s.numeral} className="flex items-center gap-2 text-sm">
            <span
              aria-hidden="true"
              className="h-5 w-8 rounded-sm border border-line"
              style={{ background: s.colour }}
            />
            {s.numeral} {s.name} <span className="num text-fg-muted">{s.colour}</span>
          </li>
        ))}
      </ul>

      <h2 className="mt-12 font-display text-3xl font-black tracking-wide uppercase">Type</h2>
      <ul className="mt-4 flex flex-col gap-2">
        {TYPE.map(([font, use]) => (
          <li key={font}>
            <span className="font-semibold">{font}</span>: {use}
          </li>
        ))}
      </ul>

      <h2 className="mt-12 font-display text-3xl font-black tracking-wide uppercase">Foreman Mo</h2>
      <div className="mt-4 flex max-w-2xl items-center gap-6">
        <ForemanMoSvg size={120} label="Foreman Mo, the site foreman" />
        <p>
          The one mascot: a mole foreman in a safety-orange hard hat with a headlamp, thick round
          glasses and a hi-vis vest. Grumpy but fair, counts every litre twice, hates shortcuts. He
          talks about the bore, safety, diesel and the shift, never about prices or buying.
        </p>
      </div>

      <h2 className="mt-12 font-display text-3xl font-black tracking-wide uppercase">Rigs</h2>
      <p className="mt-4 max-w-2xl">
        The six Generation 1 rigs as they stand on a pad at night, drawn by the game itself. Scale
        them only by whole numbers (2x, 3x) with nearest-neighbour, so the pixels stay square.
      </p>
      <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {GEN1_RIGS.map((r) => (
          <li key={r.id}>
            <figure className="overflow-hidden rounded-lg border border-line bg-surface-raised">
              <img
                src={`/rigs/rig-${r.id}.png`}
                alt={`${r.name} on its pad at night`}
                width={300}
                height={276}
                loading="lazy"
                className="pixel-canvas h-auto w-full"
              />
              <figcaption className="flex items-center justify-between p-3 text-sm">
                {r.name}
                <a href={`/rigs/rig-${r.id}.png`} download className="text-data underline">
                  PNG
                </a>
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>

      <h2 className="mt-12 font-display text-3xl font-black tracking-wide uppercase">Contact</h2>
      <p className="mt-4">
        Press and partnerships: <a href={LINKS.x}>@playmohonaut</a> on X, in public replies or
        through <a href="/support/">support</a>. We never send the first private message.
      </p>
    </SitePage>
  );
}
