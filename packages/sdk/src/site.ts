/**
 * Drill site levels (docs/02 §7; contracts/src/lib/SiteMath.sol): pads and fuel-line capacity.
 * The capacity table is the contract's own (6 × 1.22^(L − 1) ℓ/h, WAD), copied exactly.
 */

export const MAX_SITE_LEVEL = 30;

const FUEL_LINE_WAD: readonly bigint[] = [
  6000000000000000000n,
  7320000000000000000n,
  8930400000000000000n,
  10895088000000000000n,
  13292007360000000000n,
  16216248979200000000n,
  19783823754624000000n,
  24136264980641280000n,
  29446243276382361600n,
  35924416797186481152n,
  43827788492567507005n,
  53469901960932358546n,
  65233280392337477426n,
  79584602078651722460n,
  97093214535955101402n,
  118453721733865223710n,
  144513540515315572927n,
  176306519428684998970n,
  215093953702995698744n,
  262414623517654752468n,
  320145840691538798011n,
  390577925643677333573n,
  476505069285286346960n,
  581336184528049343291n,
  709230145124220198815n,
  865260777051548642555n,
  1055618148002889343917n,
  1287854140563524999578n,
  1571182051487500499486n,
  1916842102814750609373n,
];

function check(level: number): void {
  if (!Number.isInteger(level) || level < 1 || level > MAX_SITE_LEVEL) {
    throw new RangeError(`site level must be 1-${MAX_SITE_LEVEL}`);
  }
}

/** Pads (one rig each) at a site level: 3 + L. */
export function sitePads(level: number): number {
  check(level);
  return 3 + level;
}

/** Fuel-line capacity in litres per hour (18 decimals). */
export function fuelLineWad(level: number): bigint {
  check(level);
  return FUEL_LINE_WAD[level - 1] as bigint;
}
