/**
 * Generate API Keys for All Existing Users
 */

const { PrismaClient } = require('@prisma/client');
const { createDefaultApiKey } = require('../lib/apiKeyUtils');

const prisma = new PrismaClient();

async function generateKeysForAllUsers() {
    try {
        console.log('==================================');
        console.log('Generate API Keys for All Users');
        console.log('==================================');
        console.log('');

        // Get all users
        const users = await prisma.user.findMany({
            select: {
                id: true,
                email: true,
                createdAt: true
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        console.log(`Found ${users.length} users`);
        console.log('');

        let generated = 0;
        let skipped = 0;
        let failed = 0;

        for (const user of users) {
            // Check if user already has an API key
            const existingKey = await prisma.apiKey.findFirst({
                where: {
                    userId: user.id,
                    status: 'active'
                }
            });

            if (existingKey) {
                console.log(`⏭️  ${user.email} - Already has API key (skipped)`);
                skipped++;
                continue;
            }

            // Generate new API key
            try {
                await createDefaultApiKey(user.id);
                console.log(`✅ ${user.email} - API key generated`);
                generated++;
            } catch (error) {
                console.error(`❌ ${user.email} - Failed: ${error.message}`);
                failed++;
            }
        }

        console.log('');
        console.log('==================================');
        console.log('Summary:');
        console.log(`  Total users: ${users.length}`);
        console.log(`  Generated: ${generated}`);
        console.log(`  Skipped (already had key): ${skipped}`);
        console.log(`  Failed: ${failed}`);
        console.log('==================================');

    } catch (error) {
        console.error('Fatal error:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

generateKeysForAllUsers();
