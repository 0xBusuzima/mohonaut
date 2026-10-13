"""Fail CI when line or branch coverage of contracts/src drops below the threshold.

Reads an lcov file produced by `forge coverage --report lcov`. Only files under src/ count.
"""
import sys

THRESHOLD = 95.0


def main(path: str) -> int:
    lines_found = lines_hit = branches_found = branches_hit = 0
    counting = False
    with open(path, encoding="utf-8") as f:
        for raw in f:
            line = raw.strip()
            if line.startswith("SF:"):
                counting = "/src/" in line.replace("\\", "/") or line[3:].startswith("src/")
            elif not counting:
                continue
            elif line.startswith("LF:"):
                lines_found += int(line[3:])
            elif line.startswith("LH:"):
                lines_hit += int(line[3:])
            elif line.startswith("BRF:"):
                branches_found += int(line[4:])
            elif line.startswith("BRH:"):
                branches_hit += int(line[4:])
    line_pct = 100.0 * lines_hit / lines_found if lines_found else 100.0
    branch_pct = 100.0 * branches_hit / branches_found if branches_found else 100.0
    print(f"src line coverage {line_pct:.2f}% | branch coverage {branch_pct:.2f}% (min {THRESHOLD}%)")
    return 0 if line_pct >= THRESHOLD and branch_pct >= THRESHOLD else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "contracts/lcov.info"))
