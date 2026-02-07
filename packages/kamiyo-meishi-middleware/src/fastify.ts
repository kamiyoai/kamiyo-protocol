import { createVerifier, type MeishiMiddlewareConfig, type MeishiVerificationContext } from './verification.js';

/**
 * Fastify plugin that verifies Meishi Agent Compliance Passport headers.
 *
 * Usage:
 * ```ts
 * import { meishiPlugin } from '@kamiyo/meishi-middleware/fastify';
 *
 * fastify.register(meishiPlugin, {
 *   connection,
 *   keypair,
 *   minComplianceScore: 400,
 * });
 * ```
 */
export function meishiPlugin(
  fastify: any,
  config: MeishiMiddlewareConfig,
  done: (err?: Error) => void
) {
  const verifier = createVerifier(config);

  fastify.decorateRequest('meishi', null);

  fastify.addHook('preHandler', async (request: any, reply: any) => {
    const headers: Record<string, string | undefined> = {};
    for (const key of Object.keys(request.headers)) {
      const val = request.headers[key];
      headers[key] = Array.isArray(val) ? val[0] : val;
    }

    const ctx = await verifier.verify(headers);
    request.meishi = ctx;

    if (!ctx.verified && ctx.result) {
      reply.code(403).send({
        error: 'Meishi verification failed',
        details: ctx.result.errors,
        warnings: ctx.result.warnings,
      });
      return;
    }
  });

  done();
}

export type { MeishiMiddlewareConfig, MeishiVerificationContext } from './verification.js';
