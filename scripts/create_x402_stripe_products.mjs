#!/usr/bin/env node
/**
 * Create x402 Infrastructure SaaS Stripe Products
 *
 * Creates 3 subscription products for x402 SaaS:
 * - Starter: $99/month
 * - Pro: $299/month
 * - Enterprise: $999/month
 *
 * Free tier doesn't need a Stripe product (no payment)
 */

import Stripe from 'stripe';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env') });

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const X402_PRODUCTS = [
  {
    name: 'x402 Infrastructure Starter',
    tier: 'starter',
    description: '50,000 verifications per month. Multi-chain USDC payment verification for your APIs.',
    price: 99,
    features: [
      '50,000 verifications/month',
      '3 chains (Solana, Base, Ethereum)',
      'PayAI network integration',
      'Webhook notifications',
      'Email support',
      'API documentation',
      'Python SDK included'
    ],
    metadata: {
      tier: 'starter',
      verifications_limit: '50000',
      enabled_chains: 'solana,base,ethereum',
      payai_enabled: 'true'
    }
  },
  {
    name: 'x402 Infrastructure Pro',
    tier: 'pro',
    description: '500,000 verifications per month. Production-ready infrastructure for high-volume applications.',
    price: 299,
    features: [
      '500,000 verifications/month',
      '6 chains (Solana, Base, Ethereum, Polygon, Avalanche, Sei)',
      'PayAI network integration',
      'Custom branding',
      'Webhook notifications',
      'Priority email support',
      'Dedicated onboarding',
      'SDK support (Python & JS)'
    ],
    metadata: {
      tier: 'pro',
      verifications_limit: '500000',
      enabled_chains: 'solana,base,ethereum,polygon,avalanche,sei',
      payai_enabled: 'true',
      custom_branding: 'true'
    }
  },
  {
    name: 'x402 Infrastructure Enterprise',
    tier: 'enterprise',
    description: 'Unlimited verifications. White-glove support for mission-critical applications.',
    price: 999,
    features: [
      'Unlimited verifications',
      'All supported chains',
      'PayAI network integration',
      'Custom branding',
      'Webhook notifications',
      'Phone & email support',
      '99.95% SLA',
      'Dedicated account manager',
      'Custom contract terms',
      'Priority feature requests'
    ],
    metadata: {
      tier: 'enterprise',
      verifications_limit: '-1',
      enabled_chains: 'all',
      payai_enabled: 'true',
      custom_branding: 'true',
      sla: '99.95'
    }
  }
];

async function createX402Products() {
  console.log('🚀 Creating x402 Infrastructure SaaS Stripe Products\n');

  const results = [];

  for (const productData of X402_PRODUCTS) {
    try {
      console.log(`Creating product: ${productData.name}...`);

      // Create product
      const product = await stripe.products.create({
        name: productData.name,
        description: productData.description,
        metadata: productData.metadata
      });

      console.log(`✅ Product created: ${product.id}`);

      // Create monthly recurring price
      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: productData.price * 100, // Convert to cents
        currency: 'usd',
        recurring: {
          interval: 'month'
        },
        metadata: {
          tier: productData.tier
        }
      });

      console.log(`✅ Price created: ${price.id} ($${productData.price}/month)`);

      results.push({
        tier: productData.tier,
        productId: product.id,
        priceId: price.id,
        price: productData.price
      });

      console.log('');

    } catch (error) {
      console.error(`❌ Error creating product ${productData.name}:`, error.message);
      throw error;
    }
  }

  // Print summary
  console.log('========================================');
  console.log('✅ x402 SaaS Products Created Successfully');
  console.log('========================================\n');

  console.log('Add these to your .env file:\n');
  results.forEach(({ tier, productId, priceId, price }) => {
    const upperTier = tier.toUpperCase();
    console.log(`# ${tier.charAt(0).toUpperCase() + tier.slice(1)} Tier - $${price}/month`);
    console.log(`X402_STRIPE_PRICE_${upperTier}=${priceId}`);
    console.log(`X402_STRIPE_PRODUCT_${upperTier}=${productId}`);
    console.log('');
  });

  // Save to file
  const envContent = results.map(({ tier, productId, priceId, price }) => {
    const upperTier = tier.toUpperCase();
    return `# ${tier.charAt(0).toUpperCase() + tier.slice(1)} Tier - $${price}/month\nX402_STRIPE_PRICE_${upperTier}=${priceId}\nX402_STRIPE_PRODUCT_${upperTier}=${productId}\n`;
  }).join('\n');

  const fs = await import('fs');
  fs.writeFileSync(
    join(__dirname, '..', 'x402_stripe_products.env'),
    envContent
  );

  console.log('💾 Product IDs saved to: x402_stripe_products.env');
  console.log('\nNext steps:');
  console.log('1. Add the environment variables to your .env file');
  console.log('2. Update Render environment variables');
  console.log('3. Deploy the billing integration');
}

// Run
createX402Products()
  .then(() => {
    console.log('\n✅ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Failed:', error);
    process.exit(1);
  });
