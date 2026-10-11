"""Pro-rata accounting conserves emission; the supply invariant holds in full simulations."""
import unittest

import numpy as np

from engine.agents import merit_order
from engine.config import load_params
from engine.emission import distribute
from engine.model import Simulation
from engine.scenarios import SCENARIOS

SPLIT = (0.90, 0.05, 0.05)


class ProRataTest(unittest.TestCase):
    def test_distribution_conserves_emission(self) -> None:
        rng = np.random.default_rng(7)
        for _ in range(50):
            n = int(rng.integers(1, 40))
            dp = rng.uniform(0, 5_000, n) * (rng.random(n) > 0.2)
            referred = rng.random(n) * (rng.random(n) > 0.5)
            self_ref = rng.random(n) > 0.9
            weight = dp * ~self_ref
            e = float(rng.uniform(1, 60_000))
            accrual, ref_in, dev, treasury = distribute(e, dp, 0.03, referred, self_ref, weight, *SPLIT)
            if dp.sum() == 0:
                continue
            self.assertAlmostEqual(accrual.sum(), 0.9 * e, delta=1e-9 * e)            # E5: miners get 90 %
            self.assertAlmostEqual(accrual.sum() + ref_in.sum() + dev + treasury, e, delta=1e-9 * e)
            self.assertGreaterEqual(treasury, 0.05 * e - 0.027 * e - 1e-9 * e)         # §9: ≤ 2.7 % of E
            nz = dp > 0
            np.testing.assert_allclose(accrual[nz] / dp[nz], 0.9 * e / dp.sum(), rtol=1e-12)  # pro-rata
            self.assertTrue(np.all(accrual[~nz] == 0.0))                               # E4: unpowered earns 0

    def test_no_active_referrer_keeps_credit_in_treasury(self) -> None:
        dp = np.array([100.0, 300.0])
        _accrual, ref_in, _dev, treasury = distribute(1_000.0, dp, 0.03, np.array([1.0, 1.0]),
                                                    np.array([False, False]), np.zeros(2), *SPLIT)
        self.assertEqual(ref_in.sum(), 0.0)
        self.assertAlmostEqual(treasury, 50.0)

    def test_merit_order_is_free_entry_equilibrium(self) -> None:
        dp = np.array([[1000.0, 5000.0, 2000.0]])
        cost = np.array([[0.06, 0.04, 0.03]])  # USD per DP-day (auger, T1, T2-like)
        revenue = 250.0                          # 0.9·E·P in USD/day
        on = merit_order(dp, cost, revenue)
        h = float((dp * on).sum())
        y = revenue / h
        running = on > 0
        self.assertTrue(np.all(cost[running] <= y + 1e-12))           # every running class breaks even
        self.assertTrue(np.all(cost[on < 1] >= y - 1e-12))            # every idle share would lose money
        self.assertAlmostEqual(on[0, 2], 1.0)                          # most efficient class fully on


class SupplyInvariantTest(unittest.TestCase):
    def test_invariant_holds_every_day(self) -> None:
        """supply + pending + queue + reserve + burnedForever == CAP (spec E2) within float dust."""
        params = load_params({"model.days": 240})
        for name in ("base", "whale", "sybil", "hype"):
            with self.subTest(scenario=name):
                result = Simulation(params, SCENARIOS[name], seed=11).run()
                s = result.series
                err = np.abs(s["invariant_err"])
                self.assertLess(float(err.max()), 1e-3)  # DIG, against a 1e8 cap
                total = s["circulating"] + s["pending"] + s["queue"] + s["reserve"] + s["burned_cum"]
                np.testing.assert_allclose(total, 1e8, rtol=1e-11)
                self.assertTrue(np.all(s["reserve"] <= 1e8))
                self.assertTrue(np.all(np.diff(s["burned_cum"]) >= -1e-9))  # burns are permanent
                self.assertTrue(np.all(s["emission"][1:] <= s["reserve"][:-1] * 0.0005 + 1e-6))  # E5 (daily)


if __name__ == "__main__":
    unittest.main()
