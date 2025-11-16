#!/usr/bin/env node
// scripts/hash-existing-api-keys.js
// ONE-TIME MIGRATION: Hash all existing plaintext API keys in the database

import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = process.env.EXPLOIT_DB_PATH || '/Users/dennisgoslar/Projekter/kamiyo/data/kamiyo.db';
const SALT_ROUNDS = 10;

async function hashExistingKeys() {
    console.log('🔐 API Key Hashing Migration');
    console.log('==============================\n');
    console.log(`Database: ${DB_PATH}\n`);

    const db = new Database(DB_PATH);

    // Get all users with plaintext API keys (not already hashed)
    const users = db.prepare(`
        SELECT id, email, api_key
        FROM users
        WHERE api_key NOT LIKE '$2%'
    `).all();

    if (users.length === 0) {
        console.log('✅ No plaintext API keys found. All keys are already hashed.\n');
        db.close();
        return;
    }

    console.log(`Found ${users.length} users with plaintext API keys\n`);

    const updateStmt = db.prepare(`
        UPDATE users
        SET api_key = ?
        WHERE id = ?
    `);

    let hashedCount = 0;
    const errors = [];

    for (const user of users) {
        try {
            console.log(`Hashing key for user ${user.id} (${user.email})...`);

            // Hash the plaintext API key
            const hashedKey = await bcrypt.hash(user.api_key, SALT_ROUNDS);

            // Update the database
            updateStmt.run(hashedKey, user.id);

            hashedCount++;
            console.log(`  ✅ Hashed successfully\n`);

        } catch (error) {
            errors.push({ userId: user.id, email: user.email, error: error.message });
            console.log(`  ❌ Error: ${error.message}\n`);
        }
    }

    db.close();

    console.log('==============================');
    console.log(`✅ Migration complete!`);
    console.log(`   Successfully hashed: ${hashedCount}/${users.length} keys`);

    if (errors.length > 0) {
        console.log(`\n❌ Errors:`);
        errors.forEach(e => {
            console.log(`   User ${e.userId} (${e.email}): ${e.error}`);
        });
        process.exit(1);
    } else {
        console.log(`\n🎉 All API keys are now securely hashed with bcrypt!`);
        process.exit(0);
    }
}

// Run the migration
hashExistingKeys().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
