"""Constant-product pool with protocol-owned liquidity."""
import unittest

import numpy as np

from engine.amm import Pool, execute_flows


class PoolTest(unittest.TestCase):
    def test_swaps_never_decrease_k(self) -> None:
        pool = Pool.create(10.0, 100_000.0, 0.003)
        k0 = pool.eth * pool.dig
        pool.buy_dig(1.0)
        pool.sell_dig(5_000.0)
        self.assertGreaterEqual(pool.eth * pool.dig, k0)

    def test_round_trip_loses_only_fees(self) -> None:
        pool = Pool.create(10.0, 100_000.0, 0.0)
        got = pool.buy_dig(1.0)
        back = pool.sell_dig(got)
        self.assertAlmostEqual(back, 1.0, places=12)

    def test_zap_adds_eth_keeps_dig_and_mints_pol(self) -> None:
        pool = Pool.create(10.0, 100_000.0, 0.003)
        dig0, eth0, shares0 = pool.dig, pool.eth, pool.shares
        minted = pool.zap_eth(2.0)
        self.assertAlmostEqual(pool.dig, dig0, delta=1e-6)
        self.assertAlmostEqual(pool.eth, eth0 + 2.0, delta=1e-12)
        self.assertGreater(minted, 0.0)
        self.assertAlmostEqual(pool.pol_shares, pool.shares)  # all liquidity is POL
        self.assertGreater(pool.shares, shares0)

    def test_execute_flows_conserves_tokens(self) -> None:
        pool = Pool.create(50.0, 400_000.0, 0.003)
        eth0, dig0 = pool.eth, pool.dig
        eth_in = np.array([1.0, 0.5, 0.0])
        dig_in = np.array([2_000.0, 0.0, 7_000.0])
        dig_out, eth_out = execute_flows(pool, eth_in, dig_in, rounds=8)
        self.assertAlmostEqual(eth0 + eth_in.sum(), pool.eth + eth_out.sum(), places=9)
        self.assertAlmostEqual(dig0 + dig_in.sum(), pool.dig + dig_out.sum(), places=6)
        self.assertAlmostEqual(dig_out[1] / dig_out[0], 0.5)  # same average price for every buyer


if __name__ == "__main__":
    unittest.main()
