/**
 * Generation 1 rigs (docs/02 §6.1). The contract's catalog is the source of truth; these values
 * are what MiningCore was initialised with, and existing rigs can never change (docs/02 §0).
 */
export interface RigSpec {
  id: number;
  name: string;
  dp: number;
  litresPerHour: number;
  premiumPct: number;
  unlock: string;
}

export const GEN1_RIGS: RigSpec[] = [
  {
    id: 0,
    name: 'Pilot Rig',
    dp: 10,
    litresPerHour: 0.25,
    premiumPct: 0,
    unlock: 'Free, one per site',
  },
  { id: 1, name: 'Rotary Rig', dp: 50, litresPerHour: 1, premiumPct: 0, unlock: 'Site L1' },
  { id: 2, name: 'Top Drive', dp: 150, litresPerHour: 2.5, premiumPct: 8, unlock: 'Site L3' },
  {
    id: 3,
    name: 'Diamond Core Drill',
    dp: 420,
    litresPerHour: 6,
    premiumPct: 17,
    unlock: 'Site L6',
  },
  { id: 4, name: 'Turbodrill', dp: 1000, litresPerHour: 12.5, premiumPct: 27, unlock: 'Site L10' },
  { id: 5, name: 'Plasma Bore', dp: 2700, litresPerHour: 30, premiumPct: 40, unlock: 'Site L15' },
];

export const efficiency = (r: RigSpec) => r.dp / r.litresPerHour;
