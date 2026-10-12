import { asc, eq, isNull, sql } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { alerts } from '../db/schema.js';
import { txLink } from './rules.js';

type AlertRow = typeof alerts.$inferSelect;
type Severity = AlertRow['severity'];

const RANK: Record<Severity, number> = { info: 0, warning: 1, critical: 2 };

export interface AlertTransport {
  name: string;
  send(text: string, alert: AlertRow): Promise<void>;
}

/** Telegram Bot API sendMessage (free). The token stays in a secret file or the environment. */
export function telegramTransport(
  token: string,
  chatId: string,
  apiBase = 'https://api.telegram.org',
): AlertTransport {
  return {
    name: 'telegram',
    async send(text) {
      const res = await fetch(`${apiBase}/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string };
      if (!res.ok || body.ok !== true) {
        throw new Error(`telegram: ${res.status} ${body.description ?? ''}`.trim());
      }
    },
  };
}

/** Generic JSON webhook (e.g. an e-mail relay or a pager). */
export function webhookTransport(url: string): AlertTransport {
  return {
    name: 'webhook',
    async send(text, alert) {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          severity: alert.severity,
          rule: alert.rule,
          title: alert.title,
          body: alert.body,
          txHash: alert.txHash,
          blockNumber: alert.blockNumber.toString(),
          text,
        }),
      });
      if (!res.ok) throw new Error(`webhook: ${res.status}`);
    },
  };
}

export function formatAlert(alert: AlertRow, chainId: number): string {
  const link = txLink(chainId, alert.txHash);
  return [
    `[${alert.severity.toUpperCase()}] ${alert.title}`,
    alert.body,
    `chain ${chainId} · block ${alert.blockNumber} · ${new Date(Number(alert.blockTime) * 1000).toISOString()}`,
    ...(link === null ? [] : [link]),
  ].join('\n');
}

export interface NotifierOptions {
  chainId: number;
  /** Alerts below this severity are recorded but not sent. */
  minSeverity: Severity;
  /** Alerts whose block is older than this are skipped (e.g. history on a first sync). */
  maxAgeSeconds: number;
  now: () => number;
}

export interface DeliveryReport {
  sent: number;
  skipped: number;
  failed: number;
  pending: number;
}

/**
 * Drains the alert outbox. A row is marked delivered only after every transport accepted it;
 * failures are retried on the next run (attempts counts them).
 */
export class Notifier {
  constructor(
    private readonly database: Database,
    private readonly transports: AlertTransport[],
    private readonly opts: NotifierOptions,
  ) {}

  async deliver(limit = 50): Promise<DeliveryReport> {
    const db = this.database.db;
    const pending = await db
      .select()
      .from(alerts)
      .where(isNull(alerts.deliveredAt))
      .orderBy(asc(alerts.id))
      .limit(limit);
    const report: DeliveryReport = { sent: 0, skipped: 0, failed: 0, pending: 0 };
    const nowS = Math.floor(this.opts.now() / 1000);
    for (const alert of pending) {
      const tooOld = Number(alert.blockTime) < nowS - this.opts.maxAgeSeconds;
      if (tooOld || RANK[alert.severity] < RANK[this.opts.minSeverity]) {
        await db
          .update(alerts)
          .set({ deliveredAt: new Date(this.opts.now()), skipped: true })
          .where(eq(alerts.id, alert.id));
        report.skipped += 1;
        continue;
      }
      try {
        const text = formatAlert(alert, this.opts.chainId);
        for (const t of this.transports) await t.send(text, alert);
        await db
          .update(alerts)
          .set({ deliveredAt: new Date(this.opts.now()), attempts: alert.attempts + 1 })
          .where(eq(alerts.id, alert.id));
        report.sent += 1;
      } catch {
        await db
          .update(alerts)
          .set({ attempts: alert.attempts + 1 })
          .where(eq(alerts.id, alert.id));
        report.failed += 1;
      }
    }
    const [left] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(alerts)
      .where(isNull(alerts.deliveredAt));
    report.pending = left?.n ?? 0;
    return report;
  }
}
