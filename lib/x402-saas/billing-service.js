/**
 * x402 SaaS Billing Service
 *
 * Manages Stripe subscriptions for x402 Infrastructure SaaS
 * Handles subscription creation, updates, cancellations, and webhooks
 */

import stripe from '../stripe.js';
import prisma from '../prisma.js';
import { TenantManager } from './tenant-manager.js';

// Stripe Price IDs (set via environment variables)
const STRIPE_PRICES = {
  free: null, // Free tier has no Stripe price
  pro: process.env.STRIPE_PRICE_PRO || process.env.X402_STRIPE_PRICE_PRO,
  team: process.env.STRIPE_PRICE_TEAM || process.env.X402_STRIPE_PRICE_TEAM,
  enterprise: process.env.STRIPE_PRICE_ENTERPRISE || process.env.X402_STRIPE_PRICE_ENTERPRISE
};

export class BillingService {
  /**
   * Create Stripe customer for tenant
   * @param {string} tenantId - Tenant ID
   * @param {string} email - Customer email
   * @param {string} companyName - Company name
   * @returns {Promise<string>} Stripe customer ID
   */
  static async createStripeCustomer(tenantId, email, companyName) {
    const customer = await stripe.customers.create({
      email,
      name: companyName,
      metadata: {
        tenant_id: tenantId,
        source: 'x402_saas'
      }
    });

    // Update tenant with Stripe customer ID
    await prisma.x402Tenant.update({
      where: { id: tenantId },
      data: { stripeCustomerId: customer.id }
    });

    return customer.id;
  }

  /**
   * Create Stripe Checkout session for subscription
   * @param {string} tenantId - Tenant ID
   * @param {string} tier - Subscription tier (pro, team, enterprise)
   * @param {string} successUrl - Success redirect URL
   * @param {string} cancelUrl - Cancel redirect URL
   * @returns {Promise<object>} Checkout session
   */
  static async createCheckoutSession(tenantId, tier, successUrl, cancelUrl) {
    const tenant = await TenantManager.getTenant(tenantId);

    if (!tenant) {
      throw new Error('Tenant not found');
    }

    const priceId = STRIPE_PRICES[tier];
    if (!priceId && tier !== 'free') {
      throw new Error(`Invalid tier: ${tier}. Must be free, pro, team, or enterprise.`);
    }

    // Get or create Stripe customer
    let customerId = tenant.stripeCustomerId;
    if (!customerId) {
      customerId = await this.createStripeCustomer(
        tenantId,
        tenant.email,
        tenant.companyName || tenant.email
      );
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1
        }
      ],
      mode: 'subscription',
      success_url: successUrl,
      cancel_url: cancelUrl,
      subscription_data: {
        metadata: {
          tenant_id: tenantId,
          tier: tier
        }
      },
      metadata: {
        tenant_id: tenantId,
        tier: tier
      }
    });

    return session;
  }

  /**
   * Create subscription directly (for Enterprise/custom deals)
   * @param {string} tenantId - Tenant ID
   * @param {string} tier - Subscription tier
   * @returns {Promise<object>} Subscription
   */
  static async createSubscription(tenantId, tier) {
    const tenant = await TenantManager.getTenant(tenantId);

    if (!tenant) {
      throw new Error('Tenant not found');
    }

    const priceId = STRIPE_PRICES[tier];
    if (!priceId) {
      throw new Error(`Invalid tier: ${tier}`);
    }

    // Get or create Stripe customer
    let customerId = tenant.stripeCustomerId;
    if (!customerId) {
      customerId = await this.createStripeCustomer(
        tenantId,
        tenant.email,
        tenant.companyName || tenant.email
      );
    }

    // Create subscription
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      metadata: {
        tenant_id: tenantId,
        tier: tier
      }
    });

    // Update tenant with subscription info
    await prisma.x402Tenant.update({
      where: { id: tenantId },
      data: {
        stripeSubscriptionId: subscription.id,
        tier: tier,
        status: 'active'
      }
    });

    // Update tenant tier settings
    await TenantManager.updateTier(tenantId, tier);

    return subscription;
  }

  /**
   * Cancel subscription
   * @param {string} tenantId - Tenant ID
   * @param {boolean} immediately - Cancel immediately or at period end
   * @returns {Promise<object>} Cancelled subscription
   */
  static async cancelSubscription(tenantId, immediately = false) {
    const tenant = await TenantManager.getTenant(tenantId);

    if (!tenant || !tenant.stripeSubscriptionId) {
      throw new Error('No active subscription found');
    }

    const subscription = await stripe.subscriptions.update(
      tenant.stripeSubscriptionId,
      {
        cancel_at_period_end: !immediately
      }
    );

    if (immediately) {
      await stripe.subscriptions.cancel(tenant.stripeSubscriptionId);

      // Downgrade to free tier
      await prisma.x402Tenant.update({
        where: { id: tenantId },
        data: {
          tier: 'free',
          status: 'active',
          stripeSubscriptionId: null
        }
      });

      await TenantManager.updateTier(tenantId, 'free');
    }

    return subscription;
  }

  /**
   * Update subscription (upgrade/downgrade)
   * @param {string} tenantId - Tenant ID
   * @param {string} newTier - New tier
   * @returns {Promise<object>} Updated subscription
   */
  static async updateSubscription(tenantId, newTier) {
    const tenant = await TenantManager.getTenant(tenantId);

    if (!tenant || !tenant.stripeSubscriptionId) {
      throw new Error('No active subscription found');
    }

    const newPriceId = STRIPE_PRICES[newTier];
    if (!newPriceId) {
      throw new Error(`Invalid tier: ${newTier}`);
    }

    // Get current subscription
    const subscription = await stripe.subscriptions.retrieve(
      tenant.stripeSubscriptionId
    );

    // Update subscription with proration
    const updatedSubscription = await stripe.subscriptions.update(
      tenant.stripeSubscriptionId,
      {
        items: [
          {
            id: subscription.items.data[0].id,
            price: newPriceId
          }
        ],
        proration_behavior: 'always_invoice', // Prorate immediately
        metadata: {
          tenant_id: tenantId,
          tier: newTier,
          previous_tier: tenant.tier
        }
      }
    );

    // Update tenant tier
    await TenantManager.updateTier(tenantId, newTier);

    return updatedSubscription;
  }

  /**
   * Get customer portal session (for subscription management)
   * @param {string} tenantId - Tenant ID
   * @param {string} returnUrl - Return URL after managing subscription
   * @returns {Promise<object>} Portal session
   */
  static async createPortalSession(tenantId, returnUrl) {
    const tenant = await TenantManager.getTenant(tenantId);

    if (!tenant || !tenant.stripeCustomerId) {
      throw new Error('No Stripe customer found');
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: tenant.stripeCustomerId,
      return_url: returnUrl
    });

    return session;
  }

  /**
   * Handle webhook events from Stripe
   * @param {object} event - Stripe event
   * @returns {Promise<void>}
   */
  static async handleWebhookEvent(event) {
    const { type, data } = event;
    const object = data.object;

    switch (type) {
      // Subscription created
      case 'customer.subscription.created':
        await this.handleSubscriptionCreated(object);
        break;

      // Subscription updated
      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(object);
        break;

      // Subscription deleted/cancelled
      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(object);
        break;

      // Payment succeeded
      case 'invoice.payment_succeeded':
        await this.handlePaymentSucceeded(object);
        break;

      // Payment failed
      case 'invoice.payment_failed':
        await this.handlePaymentFailed(object);
        break;

      default:
        console.log(`Unhandled webhook event: ${type}`);
    }
  }

  /**
   * Handle subscription created
   * @param {object} subscription - Stripe subscription object
   */
  static async handleSubscriptionCreated(subscription) {
    const tenantId = subscription.metadata.tenant_id;
    const tier = subscription.metadata.tier;

    if (!tenantId) {
      console.error('Subscription created without tenant_id in metadata');
      return;
    }

    await prisma.x402Tenant.update({
      where: { id: tenantId },
      data: {
        stripeSubscriptionId: subscription.id,
        tier: tier,
        status: 'active'
      }
    });

    await TenantManager.updateTier(tenantId, tier);

    console.log(`Subscription created for tenant ${tenantId}: ${subscription.id}`);
  }

  /**
   * Handle subscription updated
   * @param {object} subscription - Stripe subscription object
   */
  static async handleSubscriptionUpdated(subscription) {
    const tenantId = subscription.metadata.tenant_id;

    if (!tenantId) return;

    // Update tenant status based on subscription status
    const status = subscription.status === 'active' ? 'active' : 'suspended';

    await prisma.x402Tenant.update({
      where: { id: tenantId },
      data: { status }
    });

    console.log(`Subscription updated for tenant ${tenantId}: ${subscription.status}`);
  }

  /**
   * Handle subscription deleted
   * @param {object} subscription - Stripe subscription object
   */
  static async handleSubscriptionDeleted(subscription) {
    const tenantId = subscription.metadata.tenant_id;

    if (!tenantId) return;

    // Downgrade to free tier
    await prisma.x402Tenant.update({
      where: { id: tenantId },
      data: {
        tier: 'free',
        status: 'active',
        stripeSubscriptionId: null
      }
    });

    await TenantManager.updateTier(tenantId, 'free');

    console.log(`Subscription cancelled for tenant ${tenantId}`);
  }

  /**
   * Handle successful payment
   * @param {object} invoice - Stripe invoice object
   */
  static async handlePaymentSucceeded(invoice) {
    const customerId = invoice.customer;
    const subscriptionId = invoice.subscription;

    console.log(`Payment succeeded: ${invoice.id} for subscription ${subscriptionId}`);
  }

  /**
   * Handle failed payment
   * @param {object} invoice - Stripe invoice object
   */
  static async handlePaymentFailed(invoice) {
    const customerId = invoice.customer;

    // Find tenant by Stripe customer ID
    const tenant = await prisma.x402Tenant.findUnique({
      where: { stripeCustomerId: customerId }
    });

    if (tenant) {
      // Suspend tenant
      await prisma.x402Tenant.update({
        where: { id: tenant.id },
        data: { status: 'suspended' }
      });

      console.error(`Payment failed for tenant ${tenant.id}, account suspended`);
    }
  }
}
