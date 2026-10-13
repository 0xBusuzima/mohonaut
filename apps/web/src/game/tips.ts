import { MAX_SITE_LEVEL, sitePads } from '@mohonaut/sdk';
import type { GameState } from './state';

/** A window the guide can open for the player. */
export type TipTarget = 'fuel' | 'market' | 'refinery' | 'site' | 'bore' | 'crew';

export interface Tip {
  /** Remembered once dismissed; tips about the tank carry the day so they can come back. */
  id: string;
  text: string;
  action: { label: string; target: TipTarget } | null;
}

const DAY = 86_400;

/**
 * Foreman Mo's next tip for this site, or null. Pure: the state and the tips already dismissed
 * decide. Urgent ones (an empty or low tank) come first, then the next step in the game.
 */
export function nextTip(state: GameState, seen: ReadonlySet<string>, social: boolean): Tip | null {
  const p = state.player;
  if (p === null || !p.registered) return null;
  const day = Math.floor(state.at / DAY);
  const hoursLeft = p.burn > 0n ? Number((p.tank * 10n) / p.burn) / 10 : Infinity;
  const extraRigs = state.rigs.filter((r) => r.id !== 0).reduce((n, r) => n + r.owned, 0);
  const freePads = sitePads(p.level) - p.padsUsed;
  const candidates: (Tip | null)[] = [
    p.tank === 0n
      ? {
          id: `empty-tank-${day}`,
          text: 'The tank is dry and every rig has stopped. A top-up of diesel starts them again.',
          action: { label: 'Diesel tank', target: 'fuel' },
        }
      : null,
    p.tank > 0n && hoursLeft < 12
      ? {
          id: `low-tank-${day}`,
          text: `Diesel for about ${Math.max(1, Math.floor(hoursLeft))} more hours. Rigs stop when the tank runs dry.`,
          action: { label: 'Diesel tank', target: 'fuel' },
        }
      : null,
    extraRigs === 0
      ? {
          id: 'first-rig',
          text: 'Evening, driller. Your Pilot Rig is already turning. The orange container is the Equipment Market: more rigs, more Drill Power.',
          action: { label: 'Equipment market', target: 'market' },
        }
      : null,
    state.network.marketOpened && p.pending > 0n && p.refines.length === 0
      ? {
          id: 'refine',
          text: 'What your rigs core stays unrefined until it goes through the shack: free with a 72-hour wait, or straight away for a fee.',
          action: { label: 'Refinery', target: 'refinery' },
        }
      : null,
    // The first goal (docs/09 3): enough cored for the next site level.
    p.siteUpgradePrice !== null && p.pending + p.scrapCredit >= p.siteUpgradePrice
      ? {
          id: `afford-site-${p.level + 1}`,
          text: `What your rigs have cored now covers site level ${p.level + 1}: ${sitePads(p.level + 1)} pads and a wider fuel line.`,
          action: { label: 'Expand the site', target: 'site' },
        }
      : null,
    freePads > 0 && extraRigs > 0
      ? {
          id: `free-pad-${p.padsUsed}`,
          text: `${freePads} free pad${freePads === 1 ? '' : 's'} on your site. Each rig needs one.`,
          action: { label: 'Equipment market', target: 'market' },
        }
      : null,
    freePads === 0 && p.level < MAX_SITE_LEVEL
      ? {
          id: `site-full-${p.level}`,
          text: 'Every pad is taken. A bigger site brings more pads and a wider fuel line.',
          action: { label: 'Expand the site', target: 'site' },
        }
      : null,
    {
      id: 'world-bore',
      text: 'Every driller cores the same hole: the World Bore, the wellhead in the middle of your site. The rock gets harder the deeper it goes.',
      action: { label: 'World Bore', target: 'bore' },
    },
    social
      ? {
          id: 'crew',
          text: 'Drillers team up in crews to climb the board together. A crew shares nothing in the economy, only the name.',
          action: { label: 'Crews', target: 'crew' },
        }
      : null,
  ];
  return candidates.find((t): t is Tip => t !== null && !seen.has(t.id)) ?? null;
}
