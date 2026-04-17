import { z } from 'zod';
import { defineTool, type Capability, type ToolDefinition } from '@kamiyo-org/agent';

export interface PaymentsConfig {
  stripe?: { secretKey: string };
}

const chargeSchema = z.object({
  amount: z.number().int().min(1).max(99_999_999),
  currency: z
    .string()
    .length(3)
    .regex(/^[a-z]{3}$/i),
  customerId: z.string().min(1),
  description: z.string().max(1000).optional(),
  paymentMethodId: z.string().optional(),
});

const invoiceSchema = z.object({
  customerId: z.string().min(1),
  items: z
    .array(
      z.object({
        description: z.string().max(1000),
        amount: z.number().int().min(1).max(99_999_999),
        currency: z
          .string()
          .length(3)
          .regex(/^[a-z]{3}$/i),
      })
    )
    .min(1)
    .max(250),
  dueDate: z.string().optional(),
});

const listChargesSchema = z.object({
  customerId: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

function loadStripe(): (new (key: string) => StripeClient) | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
    return require('stripe') as new (key: string) => StripeClient;
  } catch {
    return null;
  }
}

function getStripe(key: string, cache: { client: StripeClient | null }): StripeClient {
  if (cache.client) return cache.client;
  const Stripe = loadStripe();
  if (!Stripe) throw new Error('stripe package not installed');
  cache.client = new Stripe(key) as StripeClient;
  return cache.client;
}

export function paymentsCapability(config: PaymentsConfig): Capability {
  const stripeCache: { client: StripeClient | null } = { client: null };

  const tools: ToolDefinition[] = [];

  if (config.stripe) {
    const secretKey = config.stripe.secretKey;

    tools.push(
      defineTool({
        name: 'stripe_charge',
        description: 'Create a Stripe PaymentIntent to charge a customer.',
        schema: chargeSchema,
        category: 'payments',
        requiresApproval: true,
        handler: async input => {
          const stripe = getStripe(secretKey, stripeCache);
          const pi = await stripe.paymentIntents.create({
            amount: input.amount,
            currency: input.currency,
            customer: input.customerId,
            description: input.description,
            payment_method: input.paymentMethodId,
            confirm: !!input.paymentMethodId,
          });
          return JSON.stringify({ id: pi.id, status: pi.status, amount: pi.amount });
        },
      }),
      defineTool({
        name: 'stripe_invoice',
        description: 'Create and send a Stripe invoice.',
        schema: invoiceSchema,
        category: 'payments',
        requiresApproval: true,
        handler: async input => {
          const stripe = getStripe(secretKey, stripeCache);
          const invoice = await stripe.invoices.create({
            customer: input.customerId,
            auto_advance: true,
          });

          for (const item of input.items) {
            await stripe.invoiceItems.create({
              customer: input.customerId,
              invoice: invoice.id,
              description: item.description,
              amount: item.amount,
              currency: item.currency,
            });
          }

          const sent = await stripe.invoices.sendInvoice(invoice.id);
          return JSON.stringify({
            id: sent.id,
            status: sent.status,
            hosted_url: sent.hosted_invoice_url,
          });
        },
      }),
      defineTool({
        name: 'stripe_list_charges',
        description: 'List recent Stripe charges, optionally filtered by customer.',
        schema: listChargesSchema,
        category: 'payments',
        handler: async input => {
          const stripe = getStripe(secretKey, stripeCache);
          const params: { limit: number; customer?: string } = { limit: input.limit ?? 10 };
          if (input.customerId) params.customer = input.customerId;
          const charges = await stripe.charges.list(params);
          return JSON.stringify(
            charges.data.map(c => ({
              id: c.id,
              amount: c.amount,
              status: c.status,
              created: c.created,
            }))
          );
        },
      })
    );
  }

  if (tools.length === 0) {
    console.warn(
      '[kamiyo] paymentsCapability: no payment providers configured (stripe). No tools registered.'
    );
  }

  return { name: 'payments', description: 'Stripe payment and invoice tools', tools };
}

interface StripePaymentIntent {
  id: string;
  status: string;
  amount: number;
}

interface StripeInvoice {
  id: string;
  status: string;
  hosted_invoice_url?: string;
}

interface StripeCharge {
  id: string;
  amount: number;
  status: string;
  created: number;
}

interface StripeClient {
  paymentIntents: {
    create(params: {
      amount: number;
      currency: string;
      customer: string;
      description?: string;
      payment_method?: string;
      confirm?: boolean;
    }): Promise<StripePaymentIntent>;
  };
  invoices: {
    create(params: { customer: string; auto_advance?: boolean }): Promise<StripeInvoice>;
    sendInvoice(id: string): Promise<StripeInvoice>;
  };
  invoiceItems: {
    create(params: {
      customer: string;
      invoice: string;
      description: string;
      amount: number;
      currency: string;
    }): Promise<{ id: string }>;
  };
  charges: {
    list(params: { limit: number; customer?: string }): Promise<{ data: StripeCharge[] }>;
  };
}
