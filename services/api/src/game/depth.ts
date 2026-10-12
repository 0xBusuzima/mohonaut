/**
 * World Bore depth (docs/02 §3.4): world depth (m) = cumulative accrued emission (MOHN) / 1,000.
 * A player's contribution uses the same scale: their accrued MOHN / 1,000.
 */

const WEI_PER_MILLIMETRE = 10n ** 18n; // 1,000 MOHN per metre = 1 MOHN per millimetre

export const KOLA_LINE_M = 12_262;
export const MOHO_LINE_M = 35_000;

export const STRATA = [
  { numeral: 'I', name: 'Regolith', fromM: 0 },
  { numeral: 'II', name: 'Sediment Cover', fromM: 2_000 },
  { numeral: 'III', name: 'Granite Basement', fromM: 6_000 },
  { numeral: 'IV', name: 'Archean Gneiss', fromM: KOLA_LINE_M },
  { numeral: 'V', name: 'Granulite Floor', fromM: 20_000 },
  { numeral: 'VI', name: 'Peridotite Zone', fromM: MOHO_LINE_M },
  { numeral: 'VII', name: 'Asthenosphere', fromM: 60_000 },
  { numeral: 'VIII', name: 'The Core', fromM: 85_000 },
] as const;

/** Whole millimetres for an amount of MOHN wei (rounded down). */
export function millimetres(mohnWei: bigint): bigint {
  return mohnWei / WEI_PER_MILLIMETRE;
}

export function stratumAt(mm: bigint) {
  const metres = Number(mm / 1000n);
  let current: (typeof STRATA)[number] = STRATA[0];
  for (const s of STRATA) if (metres >= s.fromM) current = s;
  const next = STRATA.find((s) => s.fromM > metres) ?? null;
  return { current, next };
}

/** "1,240 m", "37 cm" or "4 mm": small contributions stay readable (docs/01 §4.11). */
export function formatDepth(mm: bigint): string {
  if (mm >= 1000n) return `${(mm / 1000n).toLocaleString('en-US')} m`;
  if (mm >= 10n) return `${mm / 10n} cm`;
  return `${mm} mm`;
}
