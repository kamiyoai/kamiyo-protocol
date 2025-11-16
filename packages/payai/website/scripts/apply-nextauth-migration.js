/**
 * Apply NextAuth Migration to Production Database
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
    console.log('NextAuth Migration Tool');
    console.log('==================================');
    console.log('');

    const client = new Client({
        connectionString: DATABASE_URL,
        ssl: {
            rejectUnauthorized: false
        }
    });

    try {
        console.log('🔄 Connecting to database...');
        await client.connect();
        console.log('✅ Connected');
        console.log('');

        // Read migration file
        const migrationPath = path.join(__dirname, '../prisma/migrations/add_nextauth.sql');
        const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

        console.log('🔄 Applying NextAuth migration...');
        await client.query(migrationSQL);
        console.log('');
        console.log('✅ Migration applied successfully!');
        console.log('');

        // Verify tables exist
        console.log('Verifying tables...');
        const result = await client.query(`
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_name IN ('Account', 'Session', 'VerificationToken')
            ORDER BY table_name;
        `);

        console.log('Created tables:');
        result.rows.forEach(row => {
            console.log(`  ✅ ${row.table_name}`);
        });

        console.log('');
        console.log('==================================');
        console.log('Next steps:');
        console.log('1. Set up Google OAuth credentials');
        console.log('2. Add credentials to .env');
        console.log('3. Test authentication flow');
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

applyMigration().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
