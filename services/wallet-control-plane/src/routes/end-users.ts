import { Hono } from 'hono';
import { z } from 'zod';
import { getCdpClient } from '../services/cdp.js';
import { upsertEndUser } from '../db/queries.js';

export const endUsersRouter = new Hono();

const CreateSchema = z
  .object({
    email: z.string().email(),
    userId: z.string().min(1).max(256).optional(),
    createEvmSmartAccount: z.boolean().optional(),
    enableSpendPermissions: z.boolean().optional(),
    createSolanaAccount: z.boolean().optional(),
  })
  .strict();

endUsersRouter.post('/v1/end-users', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  const cdp = getCdpClient();
  const endUser = await cdp.endUser.createEndUser({
    userId: parsed.data.userId,
    authenticationMethods: [{ type: 'email', email: parsed.data.email }],
    evmAccount:
      typeof parsed.data.createEvmSmartAccount === 'boolean'
        ? {
            createSmartAccount: parsed.data.createEvmSmartAccount,
            enableSpendPermissions: !!parsed.data.enableSpendPermissions,
          }
        : undefined,
    solanaAccount: parsed.data.createSolanaAccount ? { createSmartAccount: false } : undefined,
  });

  await upsertEndUser({ userId: endUser.userId, email: parsed.data.email });

  return c.json({ userId: endUser.userId });
});

const ValidateSchema = z
  .object({
    accessToken: z.string().min(1),
  })
  .strict();

endUsersRouter.post('/v1/end-users/validate', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = ValidateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  const cdp = getCdpClient();
  const user = await cdp.endUser.validateAccessToken({ accessToken: parsed.data.accessToken });

  return c.json({ userId: user.userId });
});
