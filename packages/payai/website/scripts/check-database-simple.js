/**
 * Check Production Database Schema (Simple)
 */

const { Client } = require('pg');

async function checkDatabase() {
    const DATABASE_URL = process.env.DATABASE_URL;

    if (!DATABASE_URL) {
        console.error('❌ ERROR: DATABASE_URL environment variable not set');
        process.exit(1);
    }

    const client = new Client({
        connectionString: DATABASE_URL,
        ssl: {
            rejectUnauthorized: false
        }
    });

    try {
        await client.connect();
        console.log('✅ Connected to database');
        console.log('');

        // List all tables
        console.log('='.repeat(60));
        console.log('EXISTING TABLES:');
        console.log('='.repeat(60));
        const tables = await client.query(`
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
            ORDER BY table_name;
        `);

        tables.rows.forEach(row => {
            console.log(`  📋 ${row.table_name}`);
        });

        console.log('');
        console.log('='.repeat(60));
        console.log('USER TABLE STRUCTURE:');
        console.log('='.repeat(60));

        const userColumns = await client.query(`
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'User'
            ORDER BY ordinal_position;
        `);

        console.table(userColumns.rows);

        // Check for existing users (simple query)
        console.log('='.repeat(60));
        console.log('USER COUNT:');
        console.log('='.repeat(60));

        const userCount = await client.query(`SELECT COUNT(*) FROM "User"`);
        console.log(`  Total users: ${userCount.rows[0].count}`);

        if (parseInt(userCount.rows[0].count) > 0) {
            const sampleUsers = await client.query(`
                SELECT id, email, "createdAt"
                FROM "User"
                ORDER BY "createdAt" DESC
                LIMIT 5;
            `);
            console.log('\n  Recent users:');
            console.table(sampleUsers.rows);
        }

        // Check for authentication-related tables
        console.log('');
        console.log('='.repeat(60));
        console.log('AUTH-RELATED TABLES STATUS:');
        console.log('='.repeat(60));

        const authTables = ['Account', 'Session', 'VerificationToken', 'ApiKey'];
        for (const tableName of authTables) {
            const exists = await client.query(`
                SELECT EXISTS (
                    SELECT FROM information_schema.tables
                    WHERE table_schema = 'public'
                    AND table_name = $1
                );
            `, [tableName]);

            const status = exists.rows[0].exists ? '✅ EXISTS' : '❌ MISSING';
            console.log(`  ${status}: ${tableName}`);

            if (exists.rows[0].exists) {
                const count = await client.query(`SELECT COUNT(*) FROM "${tableName}"`);
                console.log(`           Records: ${count.rows[0].count}`);
            }
        }

        console.log('');

    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    } finally {
        await client.end();
    }
}

checkDatabase().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
