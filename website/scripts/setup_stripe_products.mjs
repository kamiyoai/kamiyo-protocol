#!/usr/bin/env node
/**
 * Setup Stripe Products and Prices
 * 
 * This script creates subscription products and prices in Stripe
 * based on the tier definitions in api/subscriptions/tiers.py
 * 
 * Usage:
 *   1. Ensure you have a valid Stripe secret key in .env (STRIPE_SECRET_KEY)
 *   2. Run: node scripts/setup_stripe_products.mjs
 */

import Stripe from 'stripe';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Tier definitions matching api/subscriptions/tiers.py
const TIERS = [
  {
    name: 'basic',
    display_name: 'Basic',
    price_monthly: 2900, // $29.00 in cents
    description: 'Perfect for individual developers and small projects',
    features: [
      '1,000 API requests/day',
      'Email + Discord alerts',
      '30 days historical data',
      'Real-time alerts',
      'Email support'
    ]
  },
  {
    name: 'pro',
    display_name: 'Pro',
    price_monthly: 9900, // $99.00 in cents
    description: 'For professional developers and growing teams',
    features: [
      '50,000 API requests/day',
      'All alert channels (Email, Discord, Telegram)',
      '90 days historical data',
      'Real-time alerts',
      'Email support'
    ]
  },
  {
    name: 'team',
    display_name: 'Team',
    price_monthly: 29900, // $299.00 in cents
    description: 'For teams requiring advanced features',
    features: [
      '200,000 API requests/day',
      'All alert channels including webhooks',
      '1 year historical data',
      'Real-time alerts',
      'Priority support',
      'Custom integrations'
    ]
  },
  {
    name: 'enterprise',
    display_name: 'Enterprise',
    price_monthly: 49900, // $499.00 in cents
    description: 'For organizations with mission-critical needs',
    features: [
      'Unlimited API requests',
      'All alert channels',
      'Unlimited historical data',
      'Real-time alerts',
      'Dedicated support',
      'Custom integrations',
      'Account manager',
      'SLA guarantee',
      'White label option'
    ]
  }
];

async function setupStripeProducts() {
  console.log('🔧 Setting up Stripe products and prices...\n');

  const results = [];

  for (const tier of TIERS) {
    try {
      // Create or retrieve product
      console.log(`Creating product: ${tier.display_name}...`);
      const product = await stripe.products.create({
        name: `Kamiyo ${tier.display_name}`,
        description: tier.description,
        metadata: {
          tier: tier.name,
          features: tier.features.join(' | ')
        }
      });

      console.log(`  ✅ Product created: ${product.id}`);

      // Create recurring price
      console.log(`  Creating monthly price...`);
      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: tier.price_monthly,
        currency: 'usd',
        recurring: {
          interval: 'month'
        },
        metadata: {
          tier: tier.name
        }
      });

      console.log(`  ✅ Price created: ${price.id} ($${tier.price_monthly / 100}/month)`);
      console.log(`  📋 Tier: ${tier.name}\n`);

      results.push({
        tier: tier.name,
        product_id: product.id,
        price_id: price.id
      });

    } catch (error) {
      console.error(`  ❌ Error creating ${tier.display_name}:`, error.message);
    }
  }

  console.log('\n✅ Stripe setup complete!');
  console.log('\n📝 Product and Price IDs:');
  console.log(JSON.stringify(results, null, 2));
  console.log('\n📋 Next steps:');
  console.log('1. Log in to https://dashboard.stripe.com/test/products');
  console.log('2. Verify all products and prices are created');
  console.log('3. Save the price IDs above for your checkout code');
}

// Run setup
setupStripeProducts().catch(console.error);
