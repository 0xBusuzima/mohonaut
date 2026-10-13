import { ForemanMoSvg } from '../../game/pixel/mo-art';
import { PxIcon } from './px';

const STEPS: { icon: Parameters<typeof PxIcon>[0]['name']; title: string; text: string }[] = [
  {
    icon: 'fuel',
    title: 'Fill the tank',
    text: 'Diesel is bought with ETH and measured in litres. Rigs burn it by the hour and stop when the tank is dry.',
  },
  {
    icon: 'rig',
    title: 'Put rigs on your pads',
    text: 'Each rig adds Drill Power (DP). Bigger rigs burn less diesel per DP; each pad holds one rig.',
  },
  {
    icon: 'core',
    title: 'Core your share of each hour',
    text: "Every hour, 90% of that hour's slice goes to players, split by active DP. More drillers means a smaller share each.",
  },
  {
    icon: 'coin',
    title: 'Refine or reinvest',
    text: 'What you core stays unrefined. Spend it on rigs and site levels, or refine it to your wallet: free after 72 hours, or now for a fee.',
  },
  {
    icon: 'market',
    title: 'Grow the site',
    text: 'A bigger site has more pads and a wider fuel line. Market prices follow a public formula; nobody sets them by hand.',
  },
  {
    icon: 'trophy',
    title: 'Race to the Moho',
    text: 'Everyone cores the same World Bore. Crews, Seasons and the daily Survey are for the board and the collection, never for the economy. A finished Survey set stands its piece on your site, your crew flies its flag on the shack, and a top-ten season screws a plaque to its wall.',
  },
];

/** How to play, in six steps, as Foreman Mo would put it on a shift briefing. */
export function HelpWindow() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <ForemanMoSvg size={72} label="Foreman Mo" />
        <p>
          Shift briefing. Six things to know, and the full player guide is one click away. Nothing
          here promises a number: your share depends on everyone else.
        </p>
      </div>
      <ol className="grid gap-3 sm:grid-cols-2">
        {STEPS.map((s, i) => (
          <li key={s.title} className="px-inset flex gap-3 p-3">
            <span className="shrink-0">
              <PxIcon name={s.icon} />
            </span>
            <div>
              <p className="text-amber">
                {i + 1}. {s.title}
              </p>
              <p className="text-sm">{s.text}</p>
            </div>
          </li>
        ))}
      </ol>
      <a href="/docs/" className="self-start text-amber underline">
        Read the player guide
      </a>
    </div>
  );
}
