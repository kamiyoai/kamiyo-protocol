// scripts/create_test_users.js
// Creates test users for each subscription tier for beta testing

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function createTestUsers() {
  console.log('Creating test users for each tier...');

  const testUsers = [
    {
      email: 'free@test.kamiyo.ai',
      name: 'Free Tier Tester',
      tier: 'free',
      status: 'active'
    },
    {
      email: 'pro@test.kamiyo.ai',
      name: 'Pro Tier Tester',
      tier: 'pro',
      status: 'active'
    },
    {
      email: 'team@test.kamiyo.ai',
      name: 'Team Tier Tester',
      tier: 'team',
      status: 'active'
    },
    {
      email: 'enterprise@test.kamiyo.ai',
      name: 'Enterprise Tier Tester',
      tier: 'enterprise',
      status: 'active'
    }
  ];

  for (const userData of testUsers) {
    try {
      // Check if user already exists
      const existingUser = await prisma.user.findUnique({
        where: { email: userData.email }
      });

      if (existingUser) {
        console.log(`✓ User ${userData.email} already exists`);

        // Update or create subscription
        const existingSubscription = await prisma.subscription.findFirst({
          where: { userId: existingUser.id }
        });

        if (existingSubscription) {
          await prisma.subscription.update({
            where: { id: existingSubscription.id },
            data: {
              tier: userData.tier,
              status: userData.status
            }
          });
          console.log(`  ✓ Updated subscription to ${userData.tier}`);
        } else {
          await prisma.subscription.create({
            data: {
              userId: existingUser.id,
              tier: userData.tier,
              status: userData.status
            }
          });
          console.log(`  ✓ Created ${userData.tier} subscription`);
        }
        continue;
      }

      // Create new user
      const user = await prisma.user.create({
        data: {
          email: userData.email
        }
      });

      console.log(`✓ Created user: ${userData.email}`);

      // Create subscription for paid tiers
      if (userData.tier !== 'free') {
        await prisma.subscription.create({
          data: {
            userId: user.id,
            tier: userData.tier,
            status: userData.status
          }
        });
        console.log(`  ✓ Created ${userData.tier} subscription`);
      }

    } catch (error) {
      console.error(`✗ Error creating user ${userData.email}:`, error.message);
    }
  }

  console.log('\n✅ Test users created successfully!');
  console.log('\nTest credentials:');
  console.log('  free@test.kamiyo.ai     - Free tier (24h delayed data)');
  console.log('  pro@test.kamiyo.ai      - Pro tier (real-time, 50K API/day)');
  console.log('  team@test.kamiyo.ai     - Team tier (5 webhooks, fork analysis)');
  console.log('  enterprise@test.kamiyo.ai - Enterprise tier (all features)');
  console.log('\nNote: Use Google OAuth or NextAuth to authenticate with these emails');
}

createTestUsers()
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
