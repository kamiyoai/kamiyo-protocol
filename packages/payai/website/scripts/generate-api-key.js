// scripts/generate-api-key.js
// Helper script to generate API keys for users

const path = require('path');
// Load Prisma client from website directory
const { PrismaClient } = require(path.join(__dirname, '..', 'website', 'node_modules', '@prisma', 'client'));
const crypto = require('crypto');

const prisma = new PrismaClient();

function generateApiKey() {
    // Generate a secure random API key (32 bytes = 64 hex characters)
    return 'kmy_' + crypto.randomBytes(32).toString('hex');
}

async function generateApiKeyForUser(email) {
    try {
        // Find user
        const user = await prisma.user.findUnique({
            where: { email },
            include: {
                apiKeys: {
                    where: { status: 'active' }
                }
            }
        });

        if (!user) {
            console.error(`User not found: ${email}`);
            process.exit(1);
        }

        // Check if user already has an active API key
        if (user.apiKeys.length > 0) {
            console.log(`User ${email} already has ${user.apiKeys.length} active API key(s):`);
            user.apiKeys.forEach((key, index) => {
                console.log(`  ${index + 1}. ${key.key} (created: ${key.createdAt})`);
            });
            console.log('\nUse --force to create another key anyway');
            return;
        }

        // Generate new API key
        const apiKey = generateApiKey();

        // Save to database
        const newKey = await prisma.apiKey.create({
            data: {
                userId: user.id,
                key: apiKey,
                name: 'Auto-generated API Key',
                status: 'active'
            }
        });

        console.log('✅ API key generated successfully!');
        console.log(`User: ${email}`);
        console.log(`API Key: ${newKey.key}`);
        console.log(`Created: ${newKey.createdAt}`);
        console.log('\n⚠️  Save this API key securely. You won\'t be able to see it again.');

    } catch (error) {
        console.error('Error generating API key:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

async function generateApiKeysForAllUsers() {
    try {
        // Get all users without active API keys
        const users = await prisma.user.findMany({
            include: {
                apiKeys: {
                    where: { status: 'active' }
                }
            }
        });

        const usersWithoutKeys = users.filter(u => u.apiKeys.length === 0);

        if (usersWithoutKeys.length === 0) {
            console.log('✅ All users already have active API keys');
            return;
        }

        console.log(`Found ${usersWithoutKeys.length} users without API keys. Generating...`);

        for (const user of usersWithoutKeys) {
            const apiKey = generateApiKey();

            await prisma.apiKey.create({
                data: {
                    userId: user.id,
                    key: apiKey,
                    name: 'Auto-generated API Key',
                    status: 'active'
                }
            });

            console.log(`✅ Generated API key for ${user.email}: ${apiKey}`);
        }

        console.log(`\n✅ Generated ${usersWithoutKeys.length} API keys`);

    } catch (error) {
        console.error('Error generating API keys:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

// Main
const args = process.argv.slice(2);

if (args.length === 0) {
    console.log('Usage:');
    console.log('  node scripts/generate-api-key.js <email>        - Generate API key for specific user');
    console.log('  node scripts/generate-api-key.js --all          - Generate API keys for all users without keys');
    console.log('  node scripts/generate-api-key.js --help         - Show this help message');
    process.exit(0);
}

if (args[0] === '--help') {
    console.log('API Key Generator');
    console.log('');
    console.log('Usage:');
    console.log('  node scripts/generate-api-key.js <email>        - Generate API key for specific user');
    console.log('  node scripts/generate-api-key.js --all          - Generate API keys for all users without keys');
    console.log('');
    console.log('Examples:');
    console.log('  node scripts/generate-api-key.js user@example.com');
    console.log('  node scripts/generate-api-key.js --all');
    process.exit(0);
}

if (args[0] === '--all') {
    generateApiKeysForAllUsers();
} else {
    const email = args[0];
    generateApiKeyForUser(email);
}
