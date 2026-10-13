"""Generates the Grafana dashboards in infra/monitoring/grafana/dashboards (run after editing).

    python tools/gen_dashboards.py          write the JSON files
    python tools/gen_dashboards.py --check  exit 1 if a file differs (CI)
"""
import json
import sys
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "infra" / "monitoring" / "grafana" / "dashboards"


def panel(pid, title, exprs, x, y, unit="short", kind="timeseries", w=12, h=8):
    return {
        "id": pid,
        "type": kind,
        "title": title,
        "datasource": {"type": "prometheus", "uid": "prometheus"},
        "gridPos": {"x": x, "y": y, "w": w, "h": h},
        "fieldConfig": {"defaults": {"unit": unit}, "overrides": []},
        "targets": [
            {"refId": chr(65 + i), "expr": expr, "legendFormat": legend}
            for i, (expr, legend) in enumerate(exprs)
        ],
    }


def logs(pid, title, query, y):
    return {
        "id": pid,
        "type": "logs",
        "title": title,
        "datasource": {"type": "loki", "uid": "loki"},
        "gridPos": {"x": 0, "y": y, "w": 24, "h": 10},
        "targets": [{"refId": "A", "expr": query}],
    }


def dashboard(uid, title, panels):
    return {
        "uid": uid,
        "title": title,
        "tags": ["mohonaut"],
        "timezone": "utc",
        "schemaVersion": 39,
        "refresh": "1m",
        "time": {"from": "now-24h", "to": "now"},
        "panels": panels,
    }


DASHBOARDS = {
    "indexer.json": dashboard("mohonaut-indexer", "Indexer", [
        panel(1, "Blocks behind head", [('indexer_head_block - ignoring(stream) indexer_block', "{{stream}}")], 0, 0),
        panel(2, "Events indexed / min", [("sum by (contract) (rate(indexer_events_total[5m])) * 60", "{{contract}}")], 12, 0),
        panel(3, "Projected RPC compute units / month", [("rate(indexer_rpc_compute_units_total[6h]) * 86400 * 30", "projected"), ("vector(30e6)", "free tier")], 0, 8),
        panel(4, "RPC requests / min", [("sum by (method) (rate(indexer_rpc_requests_total[5m])) * 60", "{{method}}")], 12, 8),
        panel(5, "On-chain alerts", [("indexer_alerts_pending", "pending"), ("increase(indexer_alerts_sent_total[1h])", "sent / h"), ("increase(indexer_alert_failures_total[1h])", "failed / h")], 0, 16),
        panel(6, "Seconds since last successful poll", [("time() - indexer_last_success_timestamp_seconds", "age")], 12, 16, unit="s"),
        logs(7, "Indexer logs", '{container=~".*indexer.*"}', 24),
    ]),
    "keeper.json": dashboard("mohonaut-keeper", "Keeper", [
        panel(1, "Keeper balance (ETH)", [("keeper_balance_wei / 1e18", "balance"), ("vector(0.002)", "alert")], 0, 0),
        panel(2, "Hours since last success", [("(time() - keeper_last_success_timestamp_seconds) / 3600", "{{task}}")], 12, 0),
        panel(3, "Transactions", [("increase(keeper_tx_total[1h])", "{{task}} {{status}}")], 0, 8),
        panel(4, "Errors and price-guard skips", [("increase(keeper_errors_total[1h])", "error {{task}}"), ("increase(keeper_guard_trips_total[1h])", "guard {{task}}")], 12, 8),
        panel(5, "Lock holder", [("keeper_lock_held", "{{instance}}")], 0, 16),
        logs(6, "Keeper logs", '{container=~".*keeper.*"}', 24),
    ]),
    "api.json": dashboard("mohonaut-api", "API", [
        panel(1, "Requests / s by route", [("sum by (route) (rate(api_requests_total[5m]))", "{{route}}")], 0, 0),
        panel(2, "p95 latency", [("histogram_quantile(0.95, sum by (le, route) (rate(api_request_duration_seconds_bucket[5m])))", "{{route}}")], 12, 0, unit="s"),
        panel(3, "5xx ratio", [('sum(rate(api_requests_total{status=~"5.."}[5m])) / clamp_min(sum(rate(api_requests_total[5m])), 1e-9)', "5xx")], 0, 8, unit="percentunit"),
        panel(4, "429 (rate limited) / min", [('sum by (route) (rate(api_requests_total{status="429"}[5m])) * 60', "{{route}}")], 12, 8),
        logs(5, "API logs", '{container=~".*api.*"}', 16),
    ]),
}


def main() -> None:
    check = "--check" in sys.argv
    stale = 0
    OUT.mkdir(parents=True, exist_ok=True)
    for name, board in DASHBOARDS.items():
        text = json.dumps(board, indent=2) + "\n"
        path = OUT / name
        current = path.read_text(encoding="utf-8") if path.exists() else ""
        if current == text:
            continue
        if check:
            print(f"stale: {path}")
            stale += 1
        else:
            path.write_text(text, encoding="utf-8", newline="\n")
            print(f"wrote {path}")
    if stale:
        sys.exit(1)


if __name__ == "__main__":
    main()
