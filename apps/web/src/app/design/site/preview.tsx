'use client';

import { SiteScene } from '../../../game/SiteScene';
import type { ScenePad } from '../../../game/SiteScene';
import { GEN1_RIGS } from '../../../lib/catalog';

// Row 1-2: the six rigs drilling; row 3: the same rigs switched off; then two empty pads.
const PADS: ScenePad[] = [
  ...GEN1_RIGS.map((_, i) => ({ typeId: i, running: true })),
  ...GEN1_RIGS.map((_, i) => ({ typeId: i, running: false })),
  { typeId: null, running: false },
  { typeId: null, running: false },
];

export function SitePreview() {
  return (
    <SiteScene
      pads={PADS}
      label={`Sample drill site: ${GEN1_RIGS.map((r) => r.name).join(', ')}, drilling and switched off.`}
    />
  );
}
