"""Constant-product ETH/DIG pool (full range ≙ Uniswap v2 math) with protocol-owned liquidity.

Swap fees do not stay in the reserves: as in Uniswap v4 they accrue to the position, and the
LiquidityManager takes them out at every addition or collection (docs/02 §10, AI review AI-8 /
SPEC-5): DIG fees are burned, ETH fees go to the buyback bucket. The model keeps them in
``fee_eth`` / ``fee_dig`` until ``collect_fees``. Third-party LPs are not modelled, so all
liquidity (and all fees) are POL — a conservative lower bound on depth.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np


@dataclass
class Pool:
    eth: float
    dig: float
    fee: float
    shares: float      # total LP shares
    pol_shares: float  # shares owned by the protocol (never withdrawn)
    fee_eth: float = 0.0  # swap fees accrued to the position, not yet collected
    fee_dig: float = 0.0

    @classmethod
    def create(cls, eth: float, dig: float, fee: float) -> Pool:
        shares = math.sqrt(eth * dig)
        return cls(eth=eth, dig=dig, fee=fee, shares=shares, pol_shares=shares)

    def price(self) -> float:
        """Spot price in ETH per DIG."""
        return self.eth / self.dig

    def buy_dig(self, eth_in: float) -> float:
        """Swap ETH → DIG; returns DIG out."""
        if eth_in <= 0.0:
            return 0.0
        eff = eth_in * (1.0 - self.fee)
        out = self.dig * eff / (self.eth + eff)
        self.eth += eff
        self.fee_eth += eth_in - eff
        self.dig -= out
        return out

    def sell_dig(self, dig_in: float) -> float:
        """Swap DIG → ETH; returns ETH out."""
        if dig_in <= 0.0:
            return 0.0
        eff = dig_in * (1.0 - self.fee)
        out = self.eth * eff / (self.dig + eff)
        self.dig += eff
        self.fee_dig += dig_in - eff
        self.eth -= out
        return out

    def zap_eth(self, eth_in: float) -> float:
        """Add single-sided ETH as POL: swap the optimal part s to DIG, add the rest at the pool ratio.

        With the fee leaving the reserves, s solves (1 − f)²s² + x(2 − f)s − x·A = 0 (x = ETH
        reserve, A = ETH in), which makes the leftover ETH and the bought DIG exactly proportional
        to the post-swap reserves. Net effect: the pool gains A − f·s ETH (f·s is the swap fee,
        accrued to the position), its DIG reserve is unchanged. Returns shares minted.
        """
        if eth_in <= 0.0:
            return 0.0
        f, x = self.fee, self.eth
        g = 1.0 - f
        s = (math.sqrt(x * x * (2.0 - f) ** 2 + 4.0 * g * g * x * eth_in) - x * (2.0 - f)) / (2.0 * g * g)
        dig_bought = self.buy_dig(s)
        eth_left = eth_in - s
        minted = self.shares * min(eth_left / self.eth, dig_bought / self.dig)
        self.eth += eth_left
        self.dig += dig_bought
        self.shares += minted
        self.pol_shares += minted
        return minted

    def collect_fees(self) -> tuple[float, float]:
        """Take the accrued fees out of the position: returns (ETH, DIG) and resets them."""
        eth, dig = self.fee_eth, self.fee_dig
        self.fee_eth = self.fee_dig = 0.0
        return eth, dig

    def eth_to_move_price(self, pct: float) -> float:
        """ETH that must be bought in (fee ignored) to raise the spot price by ``pct``."""
        return self.eth * (math.sqrt(1.0 + pct) - 1.0)


def execute_flows(pool: Pool, eth_in: np.ndarray, dig_in: np.ndarray, rounds: int) -> tuple[np.ndarray, np.ndarray]:
    """Execute one day of buys (ETH in) and sells (DIG in) against the pool.

    The day is split into ``rounds`` alternating sell/buy tranches to mimic random
    ordering; every buyer gets the day's average buy price and every seller the
    average sell price. Returns (DIG out per buyer, ETH out per seller).
    """
    total_buy, total_sell = float(eth_in.sum()), float(dig_in.sum())
    got_dig = got_eth = 0.0
    for i in range(rounds):
        if i % 2 == 0:
            got_eth += pool.sell_dig(total_sell / rounds)
            got_dig += pool.buy_dig(total_buy / rounds)
        else:
            got_dig += pool.buy_dig(total_buy / rounds)
            got_eth += pool.sell_dig(total_sell / rounds)
    dig_out = eth_in * (got_dig / total_buy) if total_buy > 0.0 else np.zeros_like(eth_in)
    eth_out = dig_in * (got_eth / total_sell) if total_sell > 0.0 else np.zeros_like(dig_in)
    return dig_out, eth_out
