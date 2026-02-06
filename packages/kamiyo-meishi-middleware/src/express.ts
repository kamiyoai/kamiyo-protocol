import type { Request, Response, NextFunction } from 'express';
import { createVerifier, type MeishiMiddlewareConfig, type MeishiVerificationContext } from './verification.js';

declare global {
  namespace Express {
    interface Request {
      meishi?: MeishiVerificationContext;
    }
  }
}

/**
 * Express middleware that verifies Meishi Agent Compliance Passport headers.
 *
 * Usage:
 * ```ts
 * import { meishiMiddleware } from '@kamiyo/meishi-middleware/express';
 *
 * app.use(meishiMiddleware({
 *   connection,
 *   keypair,
 *   minComplianceScore: 400,
 * }));
 *
 * app.post('/checkout', (req, res) => {
 *   if (!req.meishi?.verified) {
 *     return res.status(403).json({ error: 'Invalid Meishi' });
 *   }
 *   // proceed with transaction
 * });
 * ```
 */
export function meishiMiddleware(config: MeishiMiddlewareConfig) {
  const verifier = createVerifier(config);

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const headers: Record<string, string | undefined> = {};
      for (const key of Object.keys(req.headers)) {
        const val = req.headers[key];
        headers[key] = Array.isArray(val) ? val[0] : val;
      }

      const ctx = await verifier.verify(headers);
      req.meishi = ctx;

      if (!ctx.verified && ctx.result) {
        res.status(403).json({
          error: 'Meishi verification failed',
          details: ctx.result.errors,
          warnings: ctx.result.warnings,
        });
        return;
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

export type { MeishiMiddlewareConfig, MeishiVerificationContext } from './verification.js';
