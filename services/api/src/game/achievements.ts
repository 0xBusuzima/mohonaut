/**
 * Badges (docs/01 §4.10), derived from on-chain history (indexer) and the Survey collection.
 * Badges are cosmetic: they never change drill power, efficiency or emission share.
 */

export const ACHIEVEMENTS = [
  { id: 'spud-in', name: 'Spud-In', description: 'Fuelled a drill site for the first time.' },
  { id: 'rig-up', name: 'Rig Up', description: 'Bought a first drill rig.' },
  {
    id: 'fuel-saver',
    name: 'Fuel Saver',
    description: 'Runs an active fleet averaging at least 80 DP per litre per hour.',
  },
  {
    id: 'kola-witness',
    name: 'Kola Witness',
    description: 'Was drilling when the World Bore passed the Kola Line (12,262 m).',
  },
  { id: 'core-collector', name: 'Core Collector', description: 'Completed a Survey set.' },
  { id: 'crew-hand', name: 'Crew Hand', description: 'Joined a crew.' },
] as const;

export type AchievementId = (typeof ACHIEVEMENTS)[number]['id'];

export interface AchievementInput {
  fuelEth: bigint;
  rigsBought: bigint;
  /** Active DP per (litre per hour) over the whole active fleet; null without active rigs. */
  efficiency: number | null;
  witnessedKola: boolean;
  completedSets: number;
  inCrew: boolean;
}

const FUEL_SAVER_EFFICIENCY = 80;

export function earnedAchievements(p: AchievementInput): AchievementId[] {
  const earned: AchievementId[] = [];
  if (p.fuelEth > 0n) earned.push('spud-in');
  if (p.rigsBought > 0n) earned.push('rig-up');
  if (p.efficiency !== null && p.efficiency >= FUEL_SAVER_EFFICIENCY) earned.push('fuel-saver');
  if (p.witnessedKola) earned.push('kola-witness');
  if (p.completedSets > 0) earned.push('core-collector');
  if (p.inCrew) earned.push('crew-hand');
  return earned;
}

/**
 * Fleet efficiency: Σ(active × DP) / Σ(active × burn), burn in litres per hour (WAD).
 * The free Pilot Rig counts like any other rig.
 */
export function fleetEfficiency(
  rigs: readonly { active: bigint; dp: bigint; burnWad: bigint }[],
): number | null {
  let dp = 0n;
  let burn = 0n;
  for (const r of rigs) {
    dp += r.active * r.dp;
    burn += r.active * r.burnWad;
  }
  if (burn === 0n) return null;
  return Number((dp * 10n ** 18n * 1000n) / burn) / 1000;
}
