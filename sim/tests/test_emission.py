"""Emission schedule (spec §3) — float model, exact integer reference and World Depth."""
import math
import unittest

from engine.emission import (
    WAD,
    cumulative_emission,
    daily_emission,
    decay_lambda,
    delta_h_wad,
    half_life_days,
    hourly_rate,
    hourly_schedule_int,
    split_int,
    year_emission,
)

CAP = 100_000_000.0
DELTA_D = 0.0005

# spec §3.2 table: year → (emission M DIG, cumulative M DIG, average per day K DIG); values as printed
SPEC_TABLE = {1: (16.69, 16.69, 45.7), 2: (13.90, 30.59, 38.1), 3: (11.58, 42.17, 31.7), 4: (9.65, 51.82, 26.4),
              5: (8.04, 59.86, 22.0), 10: (3.23, 83.9, 8.8), 20: (0.52, 97.4, 1.4)}


class EmissionScheduleTest(unittest.TestCase):
    def test_hourly_rate_matches_spec(self) -> None:
        self.assertAlmostEqual(hourly_rate(DELTA_D), 2.08383e-5, delta=5e-11)
        self.assertAlmostEqual((1 - hourly_rate(DELTA_D)) ** 24, 1 - DELTA_D, delta=1e-14)

    def test_day_one_is_50k(self) -> None:
        reserve, emitted = CAP, 0.0
        for _ in range(24):  # 24 hourly epochs, H > 0 throughout
            e = reserve * hourly_rate(DELTA_D)
            emitted += e
            reserve -= e
        self.assertAlmostEqual(emitted, 50_000.0, delta=1e-6)
        self.assertAlmostEqual(daily_emission(CAP, DELTA_D), 50_000.0, delta=1e-9)

    def test_year_table_matches_spec(self) -> None:
        for year, (e_m, cum_m, avg_k) in SPEC_TABLE.items():
            with self.subTest(year=year):
                e = year_emission(CAP, DELTA_D, year)
                cum = cumulative_emission(CAP, DELTA_D, year)
                # tolerance = half a unit of the last printed digit
                self.assertLessEqual(abs(e / 1e6 - e_m), 0.005 + 1e-9)
                self.assertLessEqual(abs(cum / 1e6 - cum_m), (0.005 if cum_m < 80 else 0.05) + 1e-9)
                self.assertLessEqual(abs(e / 365 / 1e3 - avg_k), 0.05 + 1e-9)

    def test_half_life_and_lambda(self) -> None:
        self.assertAlmostEqual(decay_lambda(DELTA_D), 0.000500125, delta=1e-9)
        self.assertAlmostEqual(half_life_days(DELTA_D), 1386.0, delta=1.0)
        self.assertAlmostEqual((1 - DELTA_D) ** 365, 0.83314, delta=1e-5)  # spec prints 0.833147 truncated

    def test_world_depth_strata_days(self) -> None:
        """spec §3.4: day = −ln(1 − depth/100,000)/λ (no recycling, continuous mining)."""
        lam = decay_lambda(DELTA_D)
        for depth_m, day in ((2_000, 40), (6_000, 124), (12_262, 262), (20_000, 446), (35_000, 861),
                             (60_000, 1_832), (85_000, 3_793)):
            with self.subTest(depth=depth_m):
                self.assertAlmostEqual(-math.log(1 - depth_m * 1_000 / CAP) / lam, day, delta=1.0)


class IntegerReferenceTest(unittest.TestCase):
    def test_delta_h_wad(self) -> None:
        dh = delta_h_wad("0.0005")
        self.assertEqual(dh, 20_838_326_282_491)  # floor(1e18·(1 − 0.9995^(1/24))), 60-digit Decimal
        self.assertLessEqual(abs(dh / WAD - hourly_rate(DELTA_D)), 1e-18)

    def test_integer_schedule_conserves_and_tracks_float(self) -> None:
        r0 = 100_000_000 * WAD
        rows = hourly_schedule_int(r0, delta_h_wad("0.0005"), 2000)
        total = sum(e for _, e in rows)
        last_r, last_e = rows[-1]
        self.assertEqual(total + (last_r - last_e), r0)  # nothing created or lost
        reserve = float(r0)
        for h, (r, e) in enumerate(rows):
            self.assertLessEqual(abs(r - reserve) / reserve, 1e-12, msg=f"hour {h}")
            reserve -= reserve * hourly_rate(DELTA_D)
        self.assertTrue(all(rows[i][1] >= rows[i + 1][1] for i in range(len(rows) - 1)))

    def test_split_is_exact(self) -> None:
        for e in (0, 1, 7, 10_001, 2_083_832_628_249_100_000_000):
            miners, dev, treasury = split_int(e)
            self.assertEqual(miners + dev + treasury, e)
            self.assertEqual(miners, e * 9000 // 10000)
            self.assertEqual(dev, e * 500 // 10000)


if __name__ == "__main__":
    unittest.main()
