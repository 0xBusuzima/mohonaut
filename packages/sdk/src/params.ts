/** MiningCore.Param in declaration order (contracts/src/MiningCore.sol); events carry the index. */
export const PARAM_NAMES = [
  'FuelPrice',
  'VrgdaR',
  'VrgdaK',
  'FastRefineFee',
  'RefineDelay',
  'MaxTankHours',
  'OracleStaleness',
  'SiteCostScale',
] as const;

export type ParamName = (typeof PARAM_NAMES)[number];
