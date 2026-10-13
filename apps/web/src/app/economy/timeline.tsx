import { STRATA } from '@mohonaut/sdk';
import { StratumBadge } from '../../components/Badge';
import { formatSpan, hoursToDepth } from '../../lib/schedule';

/** When the World Bore crosses each stratum line on the emission schedule (no live data). */
export function BoreTimeline() {
  return (
    <section aria-labelledby="timeline" className="mt-12">
      <h2 id="timeline" className="font-display text-3xl font-black tracking-wide uppercase">
        World Bore timeline
      </h2>
      <p className="mt-2 max-w-3xl text-fg-muted">
        Depth is all $MOHN mined so far ÷ 1,000, in metres. On the emission schedule alone, with
        someone drilling every hour and nothing returning to the reserve, the bore reaches each line
        after:
      </p>
      <ol className="mt-6 flex max-w-3xl flex-col gap-2">
        {STRATA.map((s, i) => (
          <li key={s.name} className="flex items-baseline justify-between gap-4">
            <StratumBadge index={i} />
            <span className="num text-right">
              {i === 0 ? 'from Genesis' : formatSpan(hoursToDepth(s.fromM))}
              <span className="ml-3 text-fg-muted">{s.fromM.toLocaleString('en-US')} m</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-4 max-w-3xl text-sm text-fg-muted">
        Hours nobody drills keep their slice in the reserve, and $MOHN that returns to the reserve
        is mined again, so the real bore runs behind or ahead of this. New rig generations, palettes
        and music unlock at these lines, not on dates.
      </p>
    </section>
  );
}
