import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { GEN1_RIGS, efficiency } from '../src/lib/catalog';

/** The rigs shown on the site are exactly the ones MiningCore is initialised with. */
it('matches the Gen-1 catalog in MiningCore.initialize', () => {
  const source = readFileSync(
    join(process.cwd(), '..', '..', 'contracts', 'src', 'MiningCore.sol'),
    'utf8',
  );
  const constant = (name: string) => {
    const m = new RegExp(`${name}\\s*=\\s*([0-9.e_]+)`).exec(source);
    if (m?.[1] === undefined) throw new Error(`no ${name}`);
    return Number(m[1].replace(/_/g, ''));
  };
  const rows = [...source.matchAll(/_addMachine\(c, MachineType\(([^)]*)\)\)/g)]
    .map((m) => (m[1] ?? '').split(',').map((v) => v.trim()))
    .filter((row) => !(row[0] ?? '').includes('.')); // skip the generic addMachineGeneration call
  expect(rows).toHaveLength(GEN1_RIGS.length);
  rows.forEach(([dp = '', premiumBps = '', minLevel = '', , burn = ''], i) => {
    const rig = GEN1_RIGS[i];
    if (rig === undefined) throw new Error(`no rig ${i}`);
    const value = (v: string) => (/^[A-Z_]+$/.test(v) ? constant(v) : Number(v));
    expect(value(dp), `${rig.name} DP`).toBe(rig.dp);
    expect(value(premiumBps) / 100, `${rig.name} premium`).toBe(rig.premiumPct);
    expect(value(burn) / 1e18, `${rig.name} burn`).toBe(rig.litresPerHour);
    if (i > 0) expect(rig.unlock).toBe(`Site L${minLevel}`);
  });
  expect(GEN1_RIGS.map(efficiency)).toEqual([40, 50, 60, 70, 80, 90]);
});
