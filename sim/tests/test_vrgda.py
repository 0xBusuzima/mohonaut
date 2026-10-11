"""VRGDA (spec §6.2) and outpost (spec §7) pricing."""
import math
import unittest

import numpy as np

from engine.config import load_params
from engine.vrgda import (
    batch_cost,
    day_cost,
    outpost_capacity_kw,
    outpost_cumulative_cost,
    outpost_slots,
    outpost_upgrade_cost,
    price_index,
    tier_cost,
    unit_price,
    units_for_budget,
)

P0, K, R = 10.0, 0.15, 8000.0


class VrgdaTest(unittest.TestCase):
    def test_closed_form_equals_sum_of_unit_prices(self) -> None:
        for t, n, q in ((0.0, 0.0, 1), (0.0, 0.0, 50), (3.5, 12_000.0, 150), (30.0, 100_000.0, 2700),
                        (200.0, 1_234_567.0, 420), (1.25, 0.0, 10_000)):
            with self.subTest(t=t, n=n, q=q):
                summed = math.fsum(unit_price(t, n + j, P0, K, R) for j in range(q))
                self.assertAlmostEqual(batch_cost(t, n, q, P0, K, R) / summed, 1.0, delta=1e-10)

    def test_catalog_prices_at_p0(self) -> None:
        mc = load_params().spec.machines
        expected = {1: 500, 2: 1620, 3: 4914, 4: 12700, 5: 37800}  # spec §6.1 "Fiyat @ p0=10"
        for tier, price in expected.items():
            marginal = unit_price(0.0, 0.0, P0, K, R) * mc.dp[tier] * (1 + mc.premium[tier])
            self.assertAlmostEqual(marginal, price, delta=1e-9)
            # the exact batch cost is slightly higher because each unit moves n
            exact = tier_cost(0.0, 0.0, mc.dp[tier], mc.premium[tier], P0, K, R)
            self.assertGreater(exact, price)
            self.assertLess(exact / price - 1, mc.dp[tier] * K / R)

    def test_price_moves_with_schedule(self) -> None:
        self.assertAlmostEqual(unit_price(1.0, 0.0, P0, K, R), P0 * (1 - K))        # no sales: −k per day
        self.assertAlmostEqual(unit_price(5.0, 5 * R, P0, K, R), P0)                 # on schedule: p0
        self.assertAlmostEqual(unit_price(0.0, R, P0, K, R), P0 / (1 - K))           # one day ahead

    def test_day_cost_matches_fine_sequential_purchases(self) -> None:
        """The simulator's daily batch = buying Q/M units M times spread over the day.

        The continuous path prices a unit at its midpoint (n + j + ½) while the spec's discrete
        sum uses n + j, so the reference shifts n by half a unit (otherwise they differ by ln(a)/2 ≈ 1e-5).
        """
        m = 4000
        for t, n, q in ((10.0, 60_000.0, 3_000.0), (10.0, 60_000.0, 30_000.0), (0.0, 0.0, 8_000.0)):
            with self.subTest(q=q):
                seq = math.fsum(batch_cost(t + (j + 0.5) / m, n + 0.5 + j * q / m, q / m, P0, K, R)
                                for j in range(m))
                self.assertAlmostEqual(day_cost(t, n, q, P0, K, R) / seq, 1.0, delta=1e-7)

    def test_day_cost_with_floor(self) -> None:
        floor = 2.5
        for t, n, q in ((20.0, 10_000.0, 2_000.0), (20.0, 10_000.0, 200_000.0), (0.0, 0.0, 1_000.0)):
            with self.subTest(q=q):
                s = (np.arange(20_000) + 0.5) / 20_000
                path = unit_price(t, n, P0, K, R) * np.exp((1 - q / R) * math.log1p(-K) * s)
                numeric = q * float(np.maximum(path, floor).mean())
                self.assertAlmostEqual(day_cost(t, n, q, P0, K, R, floor) / numeric, 1.0, delta=1e-6)

    def test_units_for_budget_inverts_day_cost(self) -> None:
        for budget in (1.0, 5_000.0, 80_000.0, 3e6):
            for floor in (0.0, 2.5):
                q = units_for_budget(15.0, 90_000.0, budget, P0, K, R, floor)
                self.assertAlmostEqual(day_cost(15.0, 90_000.0, q, P0, K, R, floor) / budget, 1.0, delta=1e-9)


class OutpostTest(unittest.TestCase):
    def setUp(self) -> None:
        self.o = load_params().spec.outpost

    def test_spec_table(self) -> None:
        # spec §7: L → (slots, capacity kW, next-level cost at idx = 1); printed values are rounded
        for level, slots, cap, cost in ((1, 4, 6.0, 150), (5, 8, 13.3, 5_180), (10, 13, 35.9, 23_800),
                                        (15, 18, 97.1, 58_000), (20, 23, 262, 109_000), (29, 32, 1_565, 247_000)):
            with self.subTest(level=level):
                self.assertEqual(outpost_slots(level, self.o), slots)
                self.assertLess(abs(outpost_capacity_kw(level, self.o) / cap - 1), 0.006)
                self.assertLess(abs(outpost_upgrade_cost(level, 1.0, self.o) / cost - 1), 0.005)
        self.assertAlmostEqual(outpost_capacity_kw(1, self.o), 6.0)

    def test_total_to_level_30(self) -> None:
        total = float(outpost_cumulative_cost(np.array([30]), self.o)[0])
        self.assertAlmostEqual(total / 2.3e6, 1.0, delta=0.05)  # spec: "L30'a toplam ≈ 2.3M DIG"
        direct = sum(outpost_upgrade_cost(level, 1.0, self.o) for level in range(1, 30))
        self.assertAlmostEqual(total, direct, delta=1e-6)

    def test_price_index_clamp(self) -> None:
        self.assertEqual(price_index(0.1, 10.0, 0.25, 4.0), 0.25)
        self.assertEqual(price_index(100.0, 10.0, 0.25, 4.0), 4.0)
        self.assertAlmostEqual(price_index(15.0, 10.0, 0.25, 4.0), 1.5)


if __name__ == "__main__":
    unittest.main()
