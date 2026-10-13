'use client';

import { useMemo } from 'react';
import { decorFor } from '../../game/pixel/decor';
import { PixelWorld } from '../../game/pixel/PixelWorld';
import { scenePads, yardWords } from '../../game/play';
import { useNow } from '../../lib/clock';
import type { Profile } from '../../social/api';

/** A player's drill site as it stands: their rigs on their pads, running while fuelled. */
export function SiteView({ profile }: { profile: Profile }) {
  const now = useNow(60_000);
  const fuelled = now !== null && Number(profile.fuelledUntilHour) * 3600 * 1000 > now;
  const model = useMemo(
    () => ({
      pads: scenePads(
        profile.siteLevel,
        profile.rigs.map((r) => ({
          id: r.typeId,
          owned: Number(r.owned),
          active: Number(r.active),
        })),
        fuelled ? 1n : 0n,
      ),
      tankFill: fuelled ? 0.6 : 0,
      decor: decorFor(profile.collection.completedSets),
      ...(profile.crew === null ? {} : { crewTag: profile.crew.tag }),
      plaques: (profile.plaques ?? []).map((p) => p.rank),
    }),
    [profile, fuelled],
  );
  return (
    <div className="relative h-[26rem] overflow-hidden border-[3px] border-night bg-[#0d1220]">
      <PixelWorld
        contained
        model={model}
        label={`Drill site level ${profile.siteLevel} at night, ${fuelled ? 'drilling' : 'idle, the tank is empty'}. ${yardWords(model)}`.trim()}
      />
    </div>
  );
}
