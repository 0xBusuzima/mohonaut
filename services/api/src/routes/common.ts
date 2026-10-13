import { z } from '@hono/zod-openapi';

export const AddressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/)
  .openapi({ example: '0xbA27372EaE81EE53d7D434deD7D3299A383C2a6c' });

/** wei / MOHN amounts are decimal strings (they exceed JavaScript numbers). */
export const AmountSchema = z
  .string()
  .regex(/^-?\d+$/)
  .openapi({ example: '1500000000000000000' });

const ErrorSchema = z.object({ error: z.string() }).openapi('Error');

export const OkSchema = z.object({ ok: z.literal(true) }).openapi('Ok');

export const json = <T extends z.ZodType>(schema: T, description: string) => ({
  content: { 'application/json': { schema } },
  description,
});

export const errors = {
  400: json(ErrorSchema, 'Invalid request'),
  401: json(ErrorSchema, 'Not signed in'),
  403: json(ErrorSchema, 'Not permitted'),
  404: json(ErrorSchema, 'Not found'),
  409: json(ErrorSchema, 'Conflict'),
  429: json(ErrorSchema, 'Rate limited'),
  503: json(ErrorSchema, 'Temporarily unavailable'),
} as const;

export const DepthSchema = z
  .object({
    mm: AmountSchema,
    text: z.string().openapi({ example: '1,240 m' }),
  })
  .openapi('Depth');

/** Postgres unique violation (23505), through Drizzle's error wrapper. */
export function isUniqueViolation(err: unknown): boolean {
  for (
    let e: unknown = err;
    e !== null && typeof e === 'object';
    e = (e as { cause?: unknown }).cause
  ) {
    if ((e as { code?: unknown }).code === '23505') return true;
  }
  return false;
}
