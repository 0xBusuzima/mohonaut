"""Constant-product pool with protocol-owned liquidity."""
import unittest

import numpy as np

from engine.amm import Pool, execute_flows


class PoolTest(unittest.TestCase):
    def test_swaps_keep_k_and_fees_leave_the_reserves(self) -> None:
        # Uniswap v4: the fee accrues to the position, so the reserves keep k exactly.
        pool = Pool.create(10.0, 100_000.0, 0.003)
        k0 = pool.eth * pool.dig
        pool.buy_dig(1.0)
        pool.sell_dig(5_000.0)
        self.assertAlmostEqual(pool.eth * pool.dig / k0, 1.0, places=12)
        self.assertAlmostEqual(pool.fee_eth, 0.003)
        self.assertAlmostEqual(pool.fee_dig, 15.0)
        eth_fee, dig_fee = pool.collect_fees()
        self.assertAlmostEqual(eth_fee, 0.003)
        self.assertAlmostEqual(dig_fee, 15.0)
        self.assertEqual((pool.fee_eth, pool.fee_dig), (0.0, 0.0))

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
        # The pool gains the ETH in minus the swap fee, which accrues to the position.
        self.assertAlmostEqual(pool.eth + pool.fee_eth, eth0 + 2.0, delta=1e-12)
        self.assertGreater(pool.fee_eth, 0.0)
        self.assertGreater(minted, 0.0)
        self.assertAlmostEqual(pool.pol_shares, pool.shares)  # all liquidity is POL
        self.assertGreater(pool.shares, shares0)

    def test_execute_flows_conserves_tokens(self) -> None:
        pool = Pool.create(50.0, 400_000.0, 0.003)
        eth0, dig0 = pool.eth, pool.dig
        eth_in = np.array([1.0, 0.5, 0.0])
        dig_in = np.array([2_000.0, 0.0, 7_000.0])
        dig_out, eth_out = execute_flows(pool, eth_in, dig_in, rounds=8)
        self.assertAlmostEqual(eth0 + eth_in.sum(), pool.eth + pool.fee_eth + eth_out.sum(), places=9)
        self.assertAlmostEqual(dig0 + dig_in.sum(), pool.dig + pool.fee_dig + dig_out.sum(), places=6)
        self.assertAlmostEqual(dig_out[1] / dig_out[0], 0.5)  # same average price for every buyer


if __name__ == "__main__":
    unittest.main()
