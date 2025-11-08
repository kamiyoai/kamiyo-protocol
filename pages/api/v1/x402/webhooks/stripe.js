/**
 * POST /api/v1/x402/webhooks/stripe
 *
 * Stripe webhook handler for x402 SaaS subscriptions
 * Handles subscription lifecycle events
 */

import { buffer } from 'micro';
import stripe from '../../../../../lib/stripe.js';
import { BillingService } from '../../../../../lib/x402-saas/billing-service.js';

// Disable body parsing, need raw body for webhook verification
export const config = {
  api: {
    bodyParser: false
  }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get raw body
    const buf = await buffer(req);
    const sig = req.headers['stripe-signature'];

    if (!sig) {
      return res.status(400).json({ error: 'Missing stripe-signature header' });
    }

    // Verify webhook signature
    let event;
    try {
      event = stripe.webhooks.constructEvent(
        buf,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return res.status(400).json({ error: `Webhook Error: ${err.message}` });
    }

    // Handle the event
    console.log(`Received webhook: ${event.type}`);

    try {
      await BillingService.handleWebhookEvent(event);

      return res.status(200).json({ received: true });

    } catch (error) {
      console.error(`Error handling webhook ${event.type}:`, error);

      // Return 200 to acknowledge receipt even if processing failed
      // Stripe will retry failed webhooks
      return res.status(200).json({
        received: true,
        error: error.message
      });
    }

  } catch (error) {
    console.error('Webhook handler error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
