import { BADGES, BADGE_PALETTE } from './badges';
import { PixelSvg } from './pixel/PixelSvg';

/**
 * Badges as pixel plates with their names: the ones awarded in colour; with `all`, the rest as
 * dark plates so a player sees what else there is. The description is the tooltip and is read
 * out to screen readers.
 */
export function BadgeShelf({
  awarded,
  all = false,
}: {
  awarded: readonly string[];
  all?: boolean;
}) {
  const have = new Set(awarded);
  const shown = all ? BADGES : BADGES.filter((b) => have.has(b.id));
  if (shown.length === 0) return null;
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {shown.map((b) => {
        const got = have.has(b.id);
        return (
          <li key={b.id} title={b.description} className="flex items-center gap-2">
            <PixelSvg rows={b.icon} palette={BADGE_PALETTE} size={32} dim={!got} />
            <span className="text-sm leading-tight">
              <span className={got ? 'text-bone' : 'text-concrete'}>{b.name}</span>
              <span className="sr-only">
                {got ? ': awarded. ' : ': not awarded yet. '}
                {b.description}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
