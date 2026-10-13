import { createRoute, z } from '@hono/zod-openapi';
import type { OpenAPIHono } from '@hono/zod-openapi';
import { HTTPException } from 'hono/http-exception';
import { getAddress } from 'viem';
import type { AppEnv } from '../context.js';
import { rateLimit, turnstile } from '../security.js';
import { AddressSchema, AmountSchema, errors, json } from './common.js';

/** Gas the faucet keeps for itself (it pays for its own sends). */
const GAS_RESERVE_WEI = 100_000_000_000_000n; // 0.0001 ETH
const DAY = 86_400;

/** Season 0 testnet faucet (docs/05 §5): one small drip per wallet per day, behind Turnstile. */
export function registerFaucet(app: OpenAPIHono<AppEnv>): void {
  app.openapi(
    createRoute({
      method: 'get',
      path: '/faucet',
      tags: ['faucet'],
      summary:
        'Whether the testnet faucet is on, how much it gives and its address (for donations)',
      responses: {
        200: json(
          z.object({
            enabled: z.boolean(),
            amountWei: AmountSchema.nullable(),
            address: AddressSchema.nullable(),
            balanceWei: AmountSchema.nullable(),
          }),
          'Faucet',
        ),
      },
    }),
    async (c) => {
      const faucet = c.var.deps.faucet ?? null;
      const cfg = c.var.deps.cfg.faucet;
      if (faucet === null || cfg === null) {
        return c.json({ enabled: false, amountWei: null, address: null, balanceWei: null }, 200);
      }
      let balance: string | null = null;
      try {
        balance = (await faucet.balanceOf(faucet.address)).toString();
      } catch {
        // RPC trouble: still say where to donate
      }
      return c.json(
        {
          enabled: true,
          amountWei: cfg.amountWei.toString(),
          address: faucet.address,
          balanceWei: balance,
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/faucet',
      tags: ['faucet'],
      summary: 'Send a little testnet ETH to a wallet (once per wallet per UTC day)',
      middleware: [rateLimit('faucet', 3, DAY), turnstile] as const,
      request: {
        body: { content: { 'application/json': { schema: z.object({ address: AddressSchema }) } } },
      },
      responses: {
        200: json(z.object({ txHash: z.string(), amountWei: AmountSchema }), 'Sent'),
        400: errors[400],
        403: errors[403],
        404: errors[404],
        409: errors[409],
        429: errors[429],
        503: errors[503],
      },
    }),
    async (c) => {
      const faucet = c.var.deps.faucet ?? null;
      const cfg = c.var.deps.cfg.faucet;
      if (faucet === null || cfg === null)
        throw new HTTPException(404, { message: 'the faucet is off' });
      const to = getAddress(c.req.valid('json').address);
      const day = Math.floor(c.var.deps.now() / 1000 / DAY);
      const store = c.var.deps.store;

      if ((await faucet.balanceOf(to)) >= cfg.maxRecipientBalanceWei) {
        throw new HTTPException(409, {
          message: 'this wallet already has enough test ETH to play',
        });
      }
      if ((await store.incr(`faucet:wallet:${to}:${day}`, DAY)) > 1) {
        throw new HTTPException(429, { message: 'this wallet already got test ETH today' });
      }
      const sends = await store.incr(`faucet:sends:${day}`, DAY);
      if (BigInt(sends) * cfg.amountWei > cfg.dailyBudgetWei) {
        throw new HTTPException(429, {
          message: "today's faucet budget is used up; try after 00:00 UTC",
        });
      }
      if ((await faucet.balanceOf(faucet.address)) < cfg.amountWei + GAS_RESERVE_WEI) {
        throw new HTTPException(503, { message: 'the faucet is empty for now; try again later' });
      }
      const txHash = await faucet.send(to, cfg.amountWei);
      return c.json({ txHash, amountWei: cfg.amountWei.toString() }, 200);
    },
  );
}
