import type { MiddlewareHandler } from 'hono';
import { matchedRoutes } from 'hono/route';
import { Counter, Histogram, Registry } from 'prom-client';
import type { AppEnv } from './context.js';

/** Request metrics for Prometheus, served on a private port (main.ts), never on the API itself. */
export class ApiMetrics {
  readonly registry = new Registry();

  readonly requests = new Counter({
    name: 'api_requests_total',
    help: 'HTTP requests by route template, method and status',
    labelNames: ['route', 'method', 'status'],
    registers: [this.registry],
  });

  readonly duration = new Histogram({
    name: 'api_request_duration_seconds',
    help: 'HTTP request duration by route template',
    labelNames: ['route', 'method'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
    registers: [this.registry],
  });

  middleware(): MiddlewareHandler<AppEnv> {
    return async (c, next) => {
      const start = performance.now();
      try {
        await next();
      } finally {
        // Route templates (/profiles/:address), not raw paths, keep label cardinality bounded.
        const handler = matchedRoutes(c)
          .filter((r) => r.method !== 'ALL')
          .at(-1);
        const route = handler?.path ?? 'unmatched';
        const labels = { route, method: c.req.method };
        this.duration.observe(labels, (performance.now() - start) / 1000);
        this.requests.inc({ ...labels, status: String(c.res.status) });
      }
    };
  }
}
