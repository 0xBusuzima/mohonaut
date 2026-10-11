"""Spec v0.2 mechanics: daily mint cap (T3), genesis tank cap (§11), §12 r rule with re-anchoring."""
import unittest

import numpy as np

from engine.config import Governance, load_params
from engine.governance import GovernanceRule, VrgdaSchedule
from engine.minting import HOUR0, MintMeter, diurnal_profile, open_day_profile
from engine.model import Simulation
from engine.scenarios import SCENARIOS
from engine.vrgda import unit_price

GOV = Governance(enabled=True, delay_days=3, weeks=4, sr_low=0.5, price_ratio_low=0.25, price_ratio_high=4.0,
                 step=0.25, cooldown_days=30, r_min=1000.0, r_max=100000.0)


class MintCapTest(unittest.TestCase):
    def test_meter_defers_beyond_cap(self) -> None:
        meter = MintMeter(days=5, daily_cap=100.0)
        prof = diurnal_profile(0.8, 15)
        self.assertAlmostEqual(prof.sum(), 1.0)
        self.assertAlmostEqual(open_day_profile(0.5, prof)[0], 0.5)
        self.assertEqual(meter.allow(1, 70.0, prof), 70.0)
        self.assertEqual(meter.allow(1, 50.0, HOUR0), 30.0)    # only 30 left today
        self.assertAlmostEqual(meter.deferred[1], 20.0)
        self.assertEqual(meter.allow(2, 20.0, HOUR0), 20.0)    # tomorrow it fits
        self.assertTrue(np.all(meter.daily() <= 100.0 + 1e-9))

    def test_binding_cap_defers_and_conserves_supply(self) -> None:
        """A cap that binds often: every day stays under it and no DIG is created or lost."""
        params = load_params({"model.days": 150, "spec.token.daily_mint_cap": 45_000.0})
        res = Simulation(params, SCENARIOS["hype"], seed=4).run()
        s = res.series
        self.assertTrue(np.all(s["mint_daily"] <= 45_000.0 + 1e-6))
        self.assertGreater(int(np.count_nonzero(s["mint_deferred"] > 0)), 0)
        self.assertLess(float(np.abs(s["invariant_err"]).max()), 1e-3)

    def test_default_cap_never_binds_in_base(self) -> None:
        res = Simulation(load_params({"model.days": 200}), SCENARIOS["base"], seed=1).run()
        self.assertEqual(int(np.count_nonzero(res.series["mint_deferred"] > 0)), 0)
        self.assertGreaterEqual(res.series["mint_daily"][3], res.scalars["dig_lp"])  # LP minted at the open


class GenesisTankCapTest(unittest.TestCase):
    def _genesis(self, overrides: dict) -> Simulation:
        sim = Simulation(load_params(overrides), SCENARIOS["base"], seed=2)
        for d in range(3):  # pre-fill + 72 h genesis; the market opens at the end of day 2
            sim.step(d)
        return sim

    def test_tanks_last_at_most_until_open_plus_24h(self) -> None:
        sim = self._genesis({})
        co, k = sim.co, sim.co.k
        daily_kwh = 24.0 * co.N[:k] * (co.mach[:k] @ sim.p.spec.machines.kw)
        self.assertTrue(np.all(co.tank[:k] <= daily_kwh * 1.0 + 1e-6))  # ≤ 1 day left at the open

    def test_cap_lowers_p0_and_genesis_spend(self) -> None:
        capped = self._genesis({})
        uncapped = self._genesis({"spec.genesis.tank_until_hours_after_open": 0})
        self.assertLess(capped.genesis_purchased_usd, 0.6 * uncapped.genesis_purchased_usd)
        self.assertLess(capped.p0_usd, uncapped.p0_usd)
        self.assertAlmostEqual(capped.dig_lp / uncapped.dig_lp, 1.0, delta=0.05)  # DIG_LP ≈ 30 % of accrual


class GovernanceTest(unittest.TestCase):
    def test_reanchor_keeps_price_continuous(self) -> None:
        sched = VrgdaSchedule(r=2000.0)
        for t, n, r_new in ((100.0, 150_000.0, 1500.0), (130.0, 190_000.0, 1125.0), (400.0, 400_000.0, 1406.25)):
            before = unit_price(*sched.effective(t, n), 10.0, 0.15, sched.r)
            sched.set_r(t, n, r_new)
            after = unit_price(*sched.effective(t, n), 10.0, 0.15, sched.r)
            self.assertAlmostEqual(after / before, 1.0, delta=1e-12)
        # without re-anchoring the same cut would jump the price by orders of magnitude
        self.assertGreater(unit_price(130.0, 190_000.0, 10.0, 0.15, 1125.0)
                           / unit_price(130.0, 190_000.0, 10.0, 0.15, 1500.0), 100.0)

    def test_rule_needs_four_weeks_then_waits_72h(self) -> None:
        rule = GovernanceRule(GOV)
        for week in range(3):
            rule.weekly(7 * week + 6, 2000.0, sr_week=0.4, price_ratio_week=1.0)
            self.assertIsNone(rule.pending)
        rule.weekly(27, 2000.0, sr_week=0.4, price_ratio_week=1.0)
        self.assertEqual(rule.pending, (30, 1500.0))
        self.assertIsNone(rule.due(29))
        self.assertEqual(rule.due(30), 1500.0)
        for week in range(4):  # cooldown: no new change for 30 days after it takes effect
            rule.weekly(34 + 7 * week, 1500.0, sr_week=0.1, price_ratio_week=0.1)
        self.assertIsNone(rule.pending)

    def test_low_price_and_high_price_rules_and_bounds(self) -> None:
        rule = GovernanceRule(GOV)
        for week in range(4):
            rule.weekly(7 * week + 6, 1100.0, sr_week=0.9, price_ratio_week=0.2)
        self.assertEqual(rule.pending, (30, 1000.0))  # r_min bound
        rule = GovernanceRule(GOV)
        for week in range(4):
            rule.weekly(7 * week + 6, 2000.0, sr_week=0.9, price_ratio_week=5.0)
        self.assertEqual(rule.pending, (30, 2500.0))
        rule = GovernanceRule(GOV)
        for week, ratio in enumerate((5.0, 5.0, 1.0, 5.0)):  # streak broken
            rule.weekly(7 * week + 6, 2000.0, sr_week=0.9, price_ratio_week=ratio)
        self.assertIsNone(rule.pending)

    def test_disabled_rule_never_changes_r(self) -> None:
        params = load_params({"model.days": 400, "spec.governance.enabled": False})
        res = Simulation(params, SCENARIOS["deep_bear"], seed=0).run()
        self.assertTrue(np.all(res.series["vrgda_r"] == params.spec.r))


if __name__ == "__main__":
    unittest.main()
