import type { ScenePad } from '../play';
import type { WorldFx } from './world';

interface SiteView {
  pads: readonly ScenePad[];
  tankFill: number;
}

/**
 * One-off effects for a change of the site between two readings, starting at `at`: a rig of a
 * type the player had fewer of drops in (pads are listed by rig type, so it lands on the last pad
 * of that type), diesel arriving, and the new pads of a bigger site (listed last, empty).
 */
export function siteEffects(was: SiteView, now: SiteView, at: number): WorldFx[] {
  const out: WorldFx[] = [];
  const count = (pads: readonly ScenePad[], id: number) =>
    pads.filter((p) => p.typeId === id).length;
  const types = new Set(now.pads.map((p) => p.typeId).filter((id): id is number => id !== null));
  for (const id of types) {
    if (count(now.pads, id) > count(was.pads, id)) {
      out.push({ kind: 'rig', pad: now.pads.map((p) => p.typeId).lastIndexOf(id), at });
    }
  }
  if (now.tankFill > was.tankFill + 0.005) out.push({ kind: 'fuel', pad: -1, at });
  if (was.pads.length > 0) {
    for (let i = was.pads.length; i < now.pads.length; i++) out.push({ kind: 'pad', pad: i, at });
  }
  return out;
}
