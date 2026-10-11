"""Golden vectors: stored files are reproducible and agree with the float engine."""
import json
import unittest
from pathlib import Path

import make_vectors
from engine.config import load_params
from engine.vrgda import batch_cost, outpost_upgrade_cost, unit_price

VECTORS = Path(make_vectors.__file__).resolve().parent / "vectors"


class VectorsTest(unittest.TestCase):
    def test_files_are_reproducible(self) -> None:
        for name, build in make_vectors.VECTORS.items():
            with self.subTest(file=name):
                path = VECTORS / name
                self.assertTrue(path.exists(), f"run make_vectors.py ({name} missing)")
                self.assertEqual(json.loads(path.read_text(encoding="utf-8")), json.loads(json.dumps(build())))

    def test_vrgda_vectors_match_float_engine(self) -> None:
        spec = load_params().spec
        for row in json.loads((VECTORS / "vrgda_costs.json").read_text(encoding="utf-8"))["rows"]:
            t, n, q = float(row["t_days"]), float(row["n_units"]), float(row["q_units"])
            price = unit_price(t, n, spec.p0, spec.k, spec.r)
            cost = batch_cost(t, n, q, spec.p0, spec.k, spec.r)
            if price < 1e-9:  # far behind schedule: the price underflows to a few wei (or 0) — an edge case
                self.assertLessEqual(abs(int(row["unit_price_wad"]) / 1e18 - price), 1e-18)
                continue
            self.assertAlmostEqual(int(row["unit_price_wad"]) / 1e18 / price, 1.0, delta=1e-12)
            self.assertAlmostEqual(int(row["batch_cost_wad"]) / 1e18 / cost, 1.0, delta=1e-9)

    def test_outpost_vectors_match_float_engine(self) -> None:
        o = load_params().spec.outpost
        for row in json.loads((VECTORS / "outpost_costs.json").read_text(encoding="utf-8"))["rows"][:-1]:
            self.assertAlmostEqual(int(row["next_level_cost_wad"]) / 1e18 / outpost_upgrade_cost(row["level"], 1.0, o),
                                   1.0, delta=1e-12)

    def test_market_open_identity(self) -> None:
        """DIG_LP ≈ POL_ETH·ETHUSD·accrual / energy_USD (both sides worth the POL ETH at P0)."""
        for row in json.loads((VECTORS / "market_open.json").read_text(encoding="utf-8"))["rows"]:
            pol, eth_usd = int(row["pol_eth_wad"]) / 1e18, int(row["eth_usd_wad"]) / 1e18
            acc, energy = int(row["genesis_miner_accrual_wad"]) / 1e18, int(row["genesis_energy_usd_wad"]) / 1e18
            expected = min(pol * eth_usd * acc / energy, 1e6)
            self.assertAlmostEqual(int(row["dig_lp_wad"]) / 1e18 / expected, 1.0, delta=1e-9)


if __name__ == "__main__":
    unittest.main()


class ReanchorVectorsTest(unittest.TestCase):
    def test_reanchor_vectors_match_engine_and_are_continuous(self) -> None:
        from engine.governance import VrgdaSchedule
        data = json.loads((VECTORS / "vrgda_reanchor.json").read_text(encoding="utf-8"))
        p0, k = float(data["params"]["p0"]), float(data["params"]["k"])
        sched = VrgdaSchedule(r=float(data["rows"][0]["r_old"]))
        for row in data["rows"]:
            t, n = float(row["t_days"]), float(row["n_units"])
            before = int(row["price_before_wad"])
            self.assertLessEqual(abs(int(row["price_after_wad"]) - before), 1)  # continuous to the wei
            sched.set_r(t, n, float(row["r_new"]))
            self.assertAlmostEqual(sched.s_anchor, int(row["s_anchor_wad"]) / 1e18, delta=1e-9)
            later = unit_price(*sched.effective(t + 1.0, n + 1000.0), p0, k, sched.r)
            self.assertAlmostEqual(later / (int(row["price_t_plus_1d_n_plus_1000_wad"]) / 1e18), 1.0, delta=1e-9)
