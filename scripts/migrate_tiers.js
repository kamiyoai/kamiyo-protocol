// scripts/migrate_tiers.js
// Run this script to update your database tier from 'ephemeral' to 'enterprise'
// Usage: node scripts/migrate_tiers.js

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function migrateTiers() {
    console.log('🚀 Starting tier migration...\n');

    try {
        // 1. Check current state
        console.log('📊 Current state:');
        const usersBefore = await prisma.user.groupBy({
            by: ['tier'],
            _count: true,
        });
        console.log('Users by tier (before):', usersBefore);

        // 2. Check your specific account
        const yourAccount = await prisma.user.findUnique({
            where: { email: 'admin@kamiyo.ai' },
            select: { email: true, tier: true, createdAt: true }
        });
        console.log('\n👤 Your account (before):', yourAccount);

        // 3. Migrate users table
        console.log('\n🔄 Migrating users table...');
        const userUpdates = await prisma.$executeRaw`
            UPDATE "User"
            SET tier = CASE
                WHEN tier = 'ephemeral' THEN 'enterprise'
                WHEN tier = 'guide' THEN 'pro'
                WHEN tier = 'architect' THEN 'team'
                WHEN tier = 'creator' THEN 'enterprise'
                WHEN tier = 'kami' THEN 'enterprise'
                WHEN tier = 'kama' THEN 'enterprise'
                WHEN tier NOT IN ('free', 'pro', 'team', 'enterprise') THEN 'free'
                ELSE tier
            END
            WHERE tier IS NOT NULL
        `;
        console.log(`✅ Updated ${userUpdates} user records`);

        // 4. Specifically ensure your account is enterprise
        console.log('\n🎯 Ensuring your account is enterprise tier...');
        const yourUpdate = await prisma.user.update({
            where: { email: 'admin@kamiyo.ai' },
            data: { tier: 'enterprise' },
            select: { email: true, tier: true }
        });
        console.log('✅ Your account updated:', yourUpdate);

        // 5. Migrate subscriptions table if it exists
        try {
            console.log('\n🔄 Migrating subscriptions table...');
            const subUpdates = await prisma.$executeRaw`
                UPDATE "Subscription"
                SET tier = CASE
                    WHEN tier = 'ephemeral' THEN 'enterprise'
                    WHEN tier = 'guide' THEN 'pro'
                    WHEN tier = 'architect' THEN 'team'
                    WHEN tier = 'creator' THEN 'enterprise'
                    WHEN tier = 'kami' THEN 'enterprise'
                    WHEN tier = 'kama' THEN 'enterprise'
                    WHEN tier NOT IN ('free', 'pro', 'team', 'enterprise') THEN 'free'
                    ELSE tier
                END
                WHERE tier IS NOT NULL
            `;
            console.log(`✅ Updated ${subUpdates} subscription records`);
        } catch (e) {
            console.log('ℹ️  No subscriptions table or no records to update');
        }

        // 6. Verify results
        console.log('\n📊 Final state:');
        const usersAfter = await prisma.user.groupBy({
            by: ['tier'],
            _count: true,
        });
        console.log('Users by tier (after):', usersAfter);

        const yourAccountAfter = await prisma.user.findUnique({
            where: { email: 'admin@kamiyo.ai' },
            select: { email: true, tier: true }
        });
        console.log('\n👤 Your account (after):', yourAccountAfter);

        console.log('\n✅ Migration completed successfully!');
        console.log('🎉 Your tier is now:', yourAccountAfter.tier);

    } catch (error) {
        console.error('❌ Migration failed:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

// Run migration
migrateTiers()
    .then(() => {
        console.log('\n✅ Done! You can now refresh your dashboard.');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Error:', error);
        process.exit(1);
    });
