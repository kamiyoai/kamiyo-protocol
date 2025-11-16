/**
 * Apply API Key Migration to Production Database
 * Uses Node.js pg library to execute SQL migration
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function applyMigration() {
    const DATABASE_URL = process.env.DATABASE_URL;

    if (!DATABASE_URL) {
        console.error('❌ ERROR: DATABASE_URL environment variable not set');
        process.exit(1);
    }

    console.log('==================================');
    console.log('API Key Migration Tool');
    console.log('==================================');
    console.log('');

    // Extract host from DATABASE_URL
    const hostMatch = DATABASE_URL.match(/@([^/]+)/);
    const dbHost = hostMatch ? hostMatch[1] : 'unknown';
    console.log(`📊 Target Database: ${dbHost}`);
    console.log('');

    const client = new Client({
        connectionString: DATABASE_URL,
        ssl: {
            rejectUnauthorized: false // Required for Render.com
        }
    });

    try {
        console.log('🔄 Connecting to database...');
        await client.connect();
        console.log('✅ Connected');
        console.log('');

        // Read migration file
        const migrationPath = path.join(__dirname, '../prisma/migrations/add_api_keys.sql');
        const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

        console.log('🔄 Applying migration...');
        await client.query(migrationSQL);
        console.log('');
        console.log('✅ Migration applied successfully!');
        console.log('');

        // Verify table exists
        console.log('Verifying table was created...');
        const result = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_schema = 'public'
                AND table_name = 'ApiKey'
            ) as table_exists;
        `);

        if (result.rows[0].table_exists) {
            console.log('✅ ApiKey table verified');
            console.log('');

            // Show table structure
            console.log('Table structure:');
            const structure = await client.query(`
                SELECT column_name, data_type, is_nullable, column_default
                FROM information_schema.columns
                WHERE table_name = 'ApiKey'
                ORDER BY ordinal_position;
            `);

            console.table(structure.rows);
        } else {
            console.log('⚠️  Warning: Could not verify table creation');
        }

        console.log('');
        console.log('==================================');
        console.log('Next steps:');
        console.log('1. Generate API keys for existing users:');
        console.log('   node scripts/generate-api-key.js --all');
        console.log('');
        console.log('2. Deploy updated code to production');
        console.log('==================================');

    } catch (error) {
        console.error('');
        console.error('❌ Migration failed!');
        console.error('Error:', error.message);
        console.error('');
        process.exit(1);
    } finally {
        await client.end();
    }
}

// Run migration
applyMigration().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
