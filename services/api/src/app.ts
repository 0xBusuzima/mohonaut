import { OpenAPIHono } from '@hono/zod-openapi';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { secureHeaders } from 'hono/secure-headers';
import { sessionMiddleware } from './auth/session.js';
import type { AppDeps, AppEnv } from './context.js';
import { registerAdmin } from './routes/admin.js';
import { registerAuth } from './routes/auth.js';
import { registerGovernance } from './routes/governance.js';
import { registerProfile } from './routes/profile.js';
import { registerSocial } from './routes/social.js';
import { registerWorld } from './routes/world.js';
import { clientIp, rateLimit, sameOriginWrites } from './security.js';

export const API_VERSION = '0.1.0';

/** The whole API as a Hono app (tests call `app.request`, main.ts serves it on Node). */
export function createApp(deps: AppDeps): OpenAPIHono<AppEnv> {
  const app = new OpenAPIHono<AppEnv>({
    defaultHook: (result, c) => {
      if (!result.success) {
        const error = result.error.issues
          .map((i) => `${i.path.join('.') || 'body'}: ${i.message}`)
          .join('; ');
        return c.json({ error }, 400);
      }
      return undefined;
    },
  });

  app.use('*', async (c, next) => {
    c.set('deps', deps);
    await next();
  });
  if (deps.metrics !== undefined) app.use('*', deps.metrics.middleware());
  app.use('*', secureHeaders());
  app.use(
    '*',
    cors({
      origin: deps.cfg.webOrigin,
      credentials: true,
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowHeaders: ['content-type', 'cf-turnstile-response'],
      maxAge: 600,
    }),
  );
  app.use('*', clientIp);
  app.use('*', rateLimit('global', 300, 60));
  app.use('*', sameOriginWrites);
  app.use('*', sessionMiddleware);

  registerAuth(app);
  registerWorld(app);
  registerGovernance(app);
  registerProfile(app);
  registerSocial(app);
  registerAdmin(app);

  app.get('/healthz', (c) => c.text('ok'));
  app.doc31('/openapi.json', {
    openapi: '3.1.0',
    info: {
      title: 'Mohonaut API',
      version: API_VERSION,
      description:
        'Off-chain game services (sessions, crews, Survey, seasons, cards, admin). Game state and value live on-chain.',
    },
  });

  app.notFound((c) => c.json({ error: 'not found' }, 404));
  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      return c.json({ error: err.message || 'error' }, err.status);
    }
    console.error(JSON.stringify({ level: 'error', msg: 'unhandled', error: String(err) }));
    return c.json({ error: 'internal error' }, 500);
  });
  return app;
}
