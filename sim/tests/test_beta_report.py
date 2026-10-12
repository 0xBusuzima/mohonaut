import tempfile
import unittest
from pathlib import Path

import numpy as np

import beta_report as br

WAD = 10**18
GENESIS_DAY = 20_000


def fans(days: int = 40) -> dict[str, np.ndarray]:
    """A tiny fan: emission exactly 1,000/day (as trailing sum / 28), burns 300-700, SR 0.3-0.7."""
    em = np.minimum(np.arange(1, days + 1), 28) * 1000.0 / 28.0

    def band(lo: np.ndarray, mid: np.ndarray, hi: np.ndarray) -> np.ndarray:
        return np.stack([lo, (lo + mid) / 2, mid, (mid + hi) / 2, hi])

    return {
        "emission": band(em, em, em),
        "burn_spend": band(em * 0.3, em * 0.5, em * 0.7),
        "sr28": band(np.full(days, 0.3), np.full(days, 0.5), np.full(days, 0.7)),
    }


def day(i: int, emitted: float, burned: float) -> dict:
    return {
        "day": GENESIS_DAY + i,
        "emitted": str(int(emitted * WAD)),
        "burned": str(int(burned * WAD)),
        "recycled": "0",
    }


class BetaReportTest(unittest.TestCase):
    def test_on_schedule_and_inside_the_band(self):
        days = [day(i, 1000, 500) for i in range(30)]
        checks = br.compare(days, GENESIS_DAY, fans())
        self.assertEqual({c.verdict for c in checks}, {"ok"})
        self.assertEqual(len(checks), 30 * 3)

    def test_flags_emission_off_schedule_and_burns_outside_the_band(self):
        days = [day(i, 1000, 500) for i in range(10)] + [day(10, 1500, 3000)]
        checks = br.compare(days, GENESIS_DAY, fans())
        last = {c.metric: c.verdict for c in checks if c.day == 10}
        self.assertTrue(last["emission"].startswith("off schedule"))
        self.assertEqual(last["burned"], "above the 95 % band")

    def test_ignores_days_before_genesis_and_fills_gaps(self):
        days = [day(-3, 9999, 9999), day(0, 1000, 500), day(2, 1000, 500)]
        series = br.daily_series(days, GENESIS_DAY)
        self.assertEqual(list(series["emission"]), [1000.0, 0.0, 1000.0])

    def test_report_counts_and_lists_what_is_off(self):
        checks = br.compare([day(0, 2000, 500)], GENESIS_DAY, fans())
        text = br.report(checks, "spec__base")
        self.assertIn("| 0 | emission |", text)
        self.assertIn("checks outside expectations", text)
        self.assertIn("- day 0, emission: off schedule", text)

    def test_reads_the_fans_file_layout(self):
        # run_scenarios.py writes <part>__<scenario>__<series> (the file itself is not in git).
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "fans.npz"
            np.savez_compressed(path, **{f"spec__base__{k}": v for k, v in fans().items()},
                                spec__bear__emission=np.zeros((5, 3)))
            loaded = br.load_fans(path, "spec__base")
            self.assertEqual(set(loaded), set(fans()))
            self.assertEqual(loaded["emission"].shape[0], 5)
            with self.assertRaises(SystemExit):
                br.load_fans(path, "spec__hype")


if __name__ == "__main__":
    unittest.main()
