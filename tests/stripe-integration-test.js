/**
 * Stripe Integration Test Script
 *
 * Tests Stripe billing integration for x402 SaaS
 *
 * Usage:
 *   1. Set test environment variables in .env.test
 *   2. Run: node tests/stripe-integration-test.js
 *
 * Requirements:
 *   - STRIPE_SECRET_KEY (test mode: sk_test_...)
 *   - X402_STRIPE_PRICE_STARTER (test price ID)
 *   - X402_STRIPE_PRICE_PRO (test price ID)
 *   - X402_STRIPE_PRICE_ENTERPRISE (test price ID)
 */

import Stripe from 'stripe';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.test' });

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  reset: '\x1b[0m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function testStripeConnection() {
  log('\n1. Testing Stripe connection...', 'yellow');

  try {
    const balance = await stripe.balance.retrieve();
    log(`✓ Connected to Stripe (Mode: ${process.env.STRIPE_SECRET_KEY.startsWith('sk_test') ? 'TEST' : 'LIVE'})`, 'green');
    return true;
  } catch (error) {
    log(`✗ Failed to connect: ${error.message}`, 'red');
    return false;
  }
}

async function testPriceIds() {
  log('\n2. Testing price IDs...', 'yellow');

  const prices = {
    starter: process.env.X402_STRIPE_PRICE_STARTER,
    pro: process.env.X402_STRIPE_PRICE_PRO,
    enterprise: process.env.X402_STRIPE_PRICE_ENTERPRISE,
  };

  let allValid = true;

  for (const [tier, priceId] of Object.entries(prices)) {
    if (!priceId) {
      log(`✗ Missing price ID for ${tier}`, 'red');
      allValid = false;
      continue;
    }

    try {
      const price = await stripe.prices.retrieve(priceId);
      log(`✓ ${tier}: $${price.unit_amount / 100}/month (${priceId})`, 'green');
    } catch (error) {
      log(`✗ ${tier}: Invalid price ID (${error.message})`, 'red');
      allValid = false;
    }
  }

  return allValid;
}

async function testCustomerCreation() {
  log('\n3. Testing customer creation...', 'yellow');

  try {
    const customer = await stripe.customers.create({
      email: `test-${Date.now()}@example.com`,
      name: 'Test Company',
      metadata: {
        tenant_id: 'test_tenant_123',
        source: 'x402_saas_test',
      },
    });

    log(`✓ Customer created: ${customer.id}`, 'green');

    // Clean up
    await stripe.customers.del(customer.id);
    log(`✓ Customer deleted (cleanup)`, 'green');

    return true;
  } catch (error) {
    log(`✗ Failed to create customer: ${error.message}`, 'red');
    return false;
  }
}

async function testCheckoutSessionCreation() {
  log('\n4. Testing checkout session creation...', 'yellow');

  const priceId = process.env.X402_STRIPE_PRICE_STARTER;

  if (!priceId) {
    log(`✗ Missing starter price ID`, 'red');
    return false;
  }

  try {
    // Create test customer first
    const customer = await stripe.customers.create({
      email: `test-checkout-${Date.now()}@example.com`,
      name: 'Test Checkout',
      metadata: {
        tenant_id: 'test_checkout_tenant',
        source: 'x402_saas_test',
      },
    });

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: 'https://example.com/success?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://example.com/cancel',
      subscription_data: {
        metadata: {
          tenant_id: 'test_checkout_tenant',
          tier: 'starter',
        },
      },
    });

    log(`✓ Checkout session created: ${session.id}`, 'green');
    log(`  URL: ${session.url}`, 'green');

    // Clean up
    await stripe.customers.del(customer.id);
    log(`✓ Test customer deleted (cleanup)`, 'green');

    return true;
  } catch (error) {
    log(`✗ Failed to create checkout session: ${error.message}`, 'red');
    return false;
  }
}

async function testCustomerPortal() {
  log('\n5. Testing customer portal...', 'yellow');

  try {
    // Create test customer
    const customer = await stripe.customers.create({
      email: `test-portal-${Date.now()}@example.com`,
      name: 'Test Portal',
    });

    // Create portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: customer.id,
      return_url: 'https://example.com/dashboard',
    });

    log(`✓ Portal session created`, 'green');
    log(`  URL: ${session.url}`, 'green');

    // Clean up
    await stripe.customers.del(customer.id);
    log(`✓ Test customer deleted (cleanup)`, 'green');

    return true;
  } catch (error) {
    log(`✗ Failed to create portal session: ${error.message}`, 'red');
    return false;
  }
}

async function testWebhookSignature() {
  log('\n6. Testing webhook signature validation...', 'yellow');

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    log(`⚠ Webhook secret not configured (skip test)`, 'yellow');
    return true;
  }

  try {
    // Create a test webhook event
    const payload = JSON.stringify({
      id: 'evt_test',
      type: 'customer.subscription.created',
      data: {
        object: {
          id: 'sub_test',
          customer: 'cus_test',
        },
      },
    });

    const timestamp = Math.floor(Date.now() / 1000);
    const signature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: webhookSecret,
    });

    // Verify signature
    const event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);

    log(`✓ Webhook signature validation works`, 'green');
    return true;
  } catch (error) {
    log(`✗ Webhook signature validation failed: ${error.message}`, 'red');
    return false;
  }
}

async function runTests() {
  log('\n╔════════════════════════════════════════╗', 'yellow');
  log('║  x402 SaaS - Stripe Integration Test  ║', 'yellow');
  log('╚════════════════════════════════════════╝', 'yellow');

  const results = {
    connection: await testStripeConnection(),
    priceIds: await testPriceIds(),
    customerCreation: await testCustomerCreation(),
    checkoutSession: await testCheckoutSessionCreation(),
    customerPortal: await testCustomerPortal(),
    webhookSignature: await testWebhookSignature(),
  };

  const passed = Object.values(results).filter(r => r).length;
  const total = Object.keys(results).length;

  log('\n═══════════════════════════════════════', 'yellow');
  log(`Results: ${passed}/${total} tests passed`, passed === total ? 'green' : 'red');
  log('═══════════════════════════════════════\n', 'yellow');

  if (passed === total) {
    log('✓ All tests passed! Stripe integration is working correctly.', 'green');
    process.exit(0);
  } else {
    log('✗ Some tests failed. Check configuration and try again.', 'red');
    log('\nNext steps:', 'yellow');
    log('1. Create test products in Stripe Dashboard');
    log('2. Set price IDs in .env.test:');
    log('   X402_STRIPE_PRICE_STARTER=price_...');
    log('   X402_STRIPE_PRICE_PRO=price_...');
    log('   X402_STRIPE_PRICE_ENTERPRISE=price_...');
    log('3. Configure webhook endpoint and get signing secret');
    process.exit(1);
  }
}

runTests().catch(error => {
  log(`\n✗ Test suite failed: ${error.message}`, 'red');
  process.exit(1);
});
