"""Sybil neutrality (spec §5.2, §13): splitting an account does not raise emission per ETH of energy."""
import unittest

import numpy as np

from engine.config import load_params
from engine.emission import distribute
from engine.metrics import summarize_run
from engine.model import Simulation
from engine.scenarios import SCENARIOS

SPLIT = (0.90, 0.05, 0.05)


def energy_eth(dp: np.ndarray, eta: np.ndarray, usd_per_kwh: float = 0.10, eth_usd: float = 3000.0) -> np.ndarray:
    """ETH per day to power ``dp`` DP of machines with efficiency ``eta`` (DP/kW), spec §5.1."""
    return dp / eta * 24.0 * usd_per_kwh / eth_usd


class SybilNeutralityTest(unittest.TestCase):
    def test_split_account_gets_same_emission_per_eth(self) -> None:
        others = np.array([40_000.0, 15_000.0, 2_500.0])  # other miners' active DP
        whole_dp, whole_eta = 6_000.0, 60.0
        for n_split in (2, 10, 1000):
            with self.subTest(wallets=n_split):
                # one account
                dp1 = np.append(others, whole_dp)
                acc1, _, _, _ = distribute(25_000.0, dp1, 0.03, np.zeros(4), np.zeros(4, bool), dp1, *SPLIT)
                per_eth_1 = acc1[-1] / energy_eth(np.array([whole_dp]), np.array([whole_eta]))[0]
                # the same machines spread over n_split accounts (no referral)
                dp2 = np.append(others, np.full(n_split, whole_dp / n_split))
                acc2, _, _, _ = distribute(25_000.0, dp2, 0.03, np.zeros(len(dp2)), np.zeros(len(dp2), bool), dp2, *SPLIT)
                split_energy = energy_eth(np.full(n_split, whole_dp / n_split), np.full(n_split, whole_eta)).sum()
                per_eth_2 = acc2[-n_split:].sum() / split_energy
                self.assertAlmostEqual(per_eth_2 / per_eth_1, 1.0, delta=1e-12)
                np.testing.assert_allclose(acc2[: len(others)], acc1[: len(others)], rtol=1e-12)

    def test_self_referral_is_the_only_bonus_and_capped_at_3pct(self) -> None:
        dp = np.array([10_000.0, 500.0])
        acc, ref, _, treasury = distribute(10_000.0, dp, 0.03, np.array([0.0, 1.0]), np.array([False, True]),
                                           np.array([10_000.0, 0.0]), *SPLIT)
        self.assertAlmostEqual(ref[1] / acc[1], 0.03)
        self.assertGreaterEqual(treasury, 0.0)

    def test_sybil_scenario_same_day_ratio(self) -> None:
        """Model level: the sybil earns per kWh what any auger earns that day (+ ≤ 3 % referral)."""
        params = load_params({"model.days": 120})
        res = Simulation(params, SCENARIOS["sybil"], seed=3).run()
        s = summarize_run(res.series, res.monthly, res.cohorts, res.scalars, params)
        self.assertGreaterEqual(s["sybil_ratio_same_tier"], 1.0 - 1e-9)
        self.assertLessEqual(s["sybil_ratio_same_tier"], 1.03 + 1e-9)


if __name__ == "__main__":
    unittest.main()
