// scripts/update_user_tier.js
// Update user tier in database - for fixing incorrect tier assignments

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function updateUserTier(email, newTier) {
    try {
        // Valid tiers: free, pro, team, enterprise
        const validTiers = ['free', 'pro', 'team', 'enterprise'];

        if (!validTiers.includes(newTier)) {
            console.error(`Invalid tier: ${newTier}. Must be one of: ${validTiers.join(', ')}`);
            process.exit(1);
        }

        // Find user
        const user = await prisma.user.findUnique({
            where: { email },
            include: { subscriptions: true }
        });

        if (!user) {
            console.error(`User not found: ${email}`);
            process.exit(1);
        }

        console.log(`Found user: ${user.email} (ID: ${user.id})`);
        console.log(`Current subscriptions:`, user.subscriptions);

        // Check if user has an active subscription
        const activeSubscription = user.subscriptions.find(sub => sub.status === 'active');

        if (activeSubscription) {
            // Update existing subscription
            const updated = await prisma.subscription.update({
                where: { id: activeSubscription.id },
                data: {
                    tier: newTier,
                    status: 'active',
                    updatedAt: new Date()
                }
            });
            console.log(`✅ Updated existing subscription to tier: ${newTier}`);
            console.log(updated);
        } else {
            // Create new subscription
            const created = await prisma.subscription.create({
                data: {
                    userId: user.id,
                    tier: newTier,
                    status: 'active'
                }
            });
            console.log(`✅ Created new subscription with tier: ${newTier}`);
            console.log(created);
        }

        // Deactivate any old subscriptions with wrong tiers
        const oldSubs = user.subscriptions.filter(sub =>
            sub.id !== activeSubscription?.id && sub.status === 'active'
        );

        if (oldSubs.length > 0) {
            await prisma.subscription.updateMany({
                where: {
                    id: { in: oldSubs.map(s => s.id) }
                },
                data: {
                    status: 'inactive',
                    updatedAt: new Date()
                }
            });
            console.log(`✅ Deactivated ${oldSubs.length} old subscription(s)`);
        }

        console.log(`\n✅ Successfully updated ${email} to ${newTier} tier`);

    } catch (error) {
        console.error('Error updating user tier:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

// Get command line arguments
const email = process.argv[2];
const tier = process.argv[3];

if (!email || !tier) {
    console.log('Usage: node scripts/update_user_tier.js <email> <tier>');
    console.log('Valid tiers: free, pro, team, enterprise');
    console.log('\nExample:');
    console.log('  node scripts/update_user_tier.js dennisgoslar@gmail.com enterprise');
    process.exit(1);
}

updateUserTier(email, tier);
