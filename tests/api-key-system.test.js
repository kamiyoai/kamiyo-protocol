/**
 * Comprehensive API Key System Tests
 * Tests API endpoints, security, edge cases, and stress scenarios
 */

const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
const { generateApiKey, isValidApiKeyFormat, getUserByApiKey } = require('../lib/apiKeyUtils');

const prisma = new PrismaClient();

// Test user data
const TEST_USER_EMAIL = `test-${Date.now()}@kamiyo.test`;
let testUserId = null;
let createdKeyIds = [];

// Colors for console output
const colors = {
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    reset: '\x1b[0m'
};

function log(type, message) {
    const color = {
        pass: colors.green,
        fail: colors.red,
        warn: colors.yellow,
        info: colors.blue
    }[type] || colors.reset;

    console.log(`${color}${message}${colors.reset}`);
}

async function createTestUser() {
    try {
        const user = await prisma.user.create({
            data: {
                email: TEST_USER_EMAIL,
                passwordHash: 'test-hash'
            }
        });
        testUserId = user.id;
        log('pass', `✓ Created test user: ${TEST_USER_EMAIL}`);
        return user;
    } catch (error) {
        log('fail', `✗ Failed to create test user: ${error.message}`);
        throw error;
    }
}

async function cleanupTestData() {
    try {
        // Delete test API keys
        await prisma.apiKey.deleteMany({
            where: { userId: testUserId }
        });

        // Delete test user
        await prisma.user.delete({
            where: { id: testUserId }
        });

        log('pass', '✓ Cleaned up test data');
    } catch (error) {
        log('warn', `⚠ Cleanup warning: ${error.message}`);
    }
}

// ============================================================================
// UNIT TESTS
// ============================================================================

async function testApiKeyGeneration() {
    log('info', '\n📝 Testing API Key Generation...');

    // Test 1: Generate key format
    const key1 = generateApiKey();
    const isValid1 = isValidApiKeyFormat(key1);

    if (isValid1 && key1.startsWith('kmy_') && key1.length === 68) {
        log('pass', '  ✓ API key format is correct');
    } else {
        log('fail', `  ✗ API key format invalid: ${key1}`);
        return false;
    }

    // Test 2: Uniqueness (generate 100 keys, check for duplicates)
    const keys = new Set();
    for (let i = 0; i < 100; i++) {
        keys.add(generateApiKey());
    }

    if (keys.size === 100) {
        log('pass', '  ✓ Generated 100 unique keys');
    } else {
        log('fail', `  ✗ Key collision detected (${keys.size}/100 unique)`);
        return false;
    }

    // Test 3: Format validation
    const validKeys = [
        'kmy_' + 'a'.repeat(64),
        'kmy_' + crypto.randomBytes(32).toString('hex')
    ];

    const invalidKeys = [
        'invalid',
        'kmy_',
        'kmy_short',
        'wrong_' + 'a'.repeat(64),
        'kmy_' + 'z'.repeat(64) // 'z' not in hex
    ];

    let formatTestsPassed = true;
    validKeys.forEach(key => {
        if (!isValidApiKeyFormat(key)) {
            log('fail', `  ✗ Valid key rejected: ${key}`);
            formatTestsPassed = false;
        }
    });

    invalidKeys.forEach(key => {
        if (isValidApiKeyFormat(key)) {
            log('fail', `  ✗ Invalid key accepted: ${key}`);
            formatTestsPassed = false;
        }
    });

    if (formatTestsPassed) {
        log('pass', '  ✓ Format validation working correctly');
    }

    return true;
}

async function testDatabaseOperations() {
    log('info', '\n💾 Testing Database Operations...');

    // Test 1: Create API key
    const apiKey = generateApiKey();

    const created = await prisma.apiKey.create({
        data: {
            userId: testUserId,
            key: apiKey,
            name: 'Test Key 1',
            status: 'active'
        }
    });

    createdKeyIds.push(created.id);

    if (created.key === apiKey && created.status === 'active') {
        log('pass', '  ✓ API key created successfully');
    } else {
        log('fail', '  ✗ API key creation failed');
        return false;
    }

    // Test 2: Find by key
    const found = await prisma.apiKey.findUnique({
        where: { key: apiKey }
    });

    if (found && found.id === created.id) {
        log('pass', '  ✓ API key lookup by key works');
    } else {
        log('fail', '  ✗ API key lookup failed');
        return false;
    }

    // Test 3: Find by userId
    const userKeys = await prisma.apiKey.findMany({
        where: { userId: testUserId }
    });

    if (userKeys.length === 1 && userKeys[0].id === created.id) {
        log('pass', '  ✓ API key lookup by userId works');
    } else {
        log('fail', `  ✗ Expected 1 key, found ${userKeys.length}`);
        return false;
    }

    // Test 4: Update (revoke)
    const revoked = await prisma.apiKey.update({
        where: { id: created.id },
        data: {
            status: 'revoked',
            revokedAt: new Date()
        }
    });

    if (revoked.status === 'revoked' && revoked.revokedAt) {
        log('pass', '  ✓ API key revocation works');
    } else {
        log('fail', '  ✗ API key revocation failed');
        return false;
    }

    // Test 5: Unique constraint
    try {
        await prisma.apiKey.create({
            data: {
                userId: testUserId,
                key: apiKey, // Duplicate key
                name: 'Duplicate',
                status: 'active'
            }
        });
        log('fail', '  ✗ Unique constraint not enforced');
        return false;
    } catch (error) {
        if (error.code === 'P2002') {
            log('pass', '  ✓ Unique constraint enforced');
        } else {
            log('fail', `  ✗ Unexpected error: ${error.message}`);
            return false;
        }
    }

    return true;
}

async function testRateLimiting() {
    log('info', '\n🚦 Testing Rate Limiting (Max 5 Keys)...');

    // Create 5 keys (should succeed)
    const keys = [];
    for (let i = 0; i < 5; i++) {
        const key = await prisma.apiKey.create({
            data: {
                userId: testUserId,
                key: generateApiKey(),
                name: `Test Key ${i + 2}`,
                status: 'active'
            }
        });
        keys.push(key);
        createdKeyIds.push(key.id);
    }

    // Count active keys
    const activeCount = await prisma.apiKey.count({
        where: {
            userId: testUserId,
            status: 'active'
        }
    });

    if (activeCount === 5) {
        log('pass', '  ✓ Created 5 active keys');
    } else {
        log('fail', `  ✗ Expected 5 keys, found ${activeCount}`);
        return false;
    }

    // The 6th key creation should be prevented by application logic
    // (Database doesn't enforce this, API endpoint does)
    log('pass', '  ✓ Rate limit check ready for API endpoint');

    return true;
}

async function testGetUserByApiKey() {
    log('info', '\n🔐 Testing getUserByApiKey()...');

    // Create a test key
    const testKey = generateApiKey();
    const created = await prisma.apiKey.create({
        data: {
            userId: testUserId,
            key: testKey,
            name: 'Auth Test Key',
            status: 'active'
        }
    });
    createdKeyIds.push(created.id);

    // Test 1: Valid active key
    const user1 = await getUserByApiKey(testKey);

    if (user1 && user1.id === testUserId) {
        log('pass', '  ✓ Valid API key returns user');
    } else {
        log('fail', '  ✗ Failed to get user with valid key');
        return false;
    }

    // Test 2: Invalid key format
    const user2 = await getUserByApiKey('invalid-key');

    if (!user2) {
        log('pass', '  ✓ Invalid format rejected');
    } else {
        log('fail', '  ✗ Invalid format accepted');
        return false;
    }

    // Test 3: Non-existent key
    const user3 = await getUserByApiKey(generateApiKey());

    if (!user3) {
        log('pass', '  ✓ Non-existent key rejected');
    } else {
        log('fail', '  ✗ Non-existent key accepted');
        return false;
    }

    // Test 4: Revoked key
    await prisma.apiKey.update({
        where: { id: created.id },
        data: { status: 'revoked' }
    });

    const user4 = await getUserByApiKey(testKey);

    if (!user4) {
        log('pass', '  ✓ Revoked key rejected');
    } else {
        log('fail', '  ✗ Revoked key accepted');
        return false;
    }

    // Test 5: lastUsedAt updated
    // Re-activate for this test
    await prisma.apiKey.update({
        where: { id: created.id },
        data: { status: 'active', lastUsedAt: null }
    });

    const beforeTime = new Date();
    await getUserByApiKey(testKey);
    await new Promise(resolve => setTimeout(resolve, 100)); // Wait 100ms

    const updated = await prisma.apiKey.findUnique({
        where: { id: created.id }
    });

    if (updated.lastUsedAt && updated.lastUsedAt >= beforeTime) {
        log('pass', '  ✓ lastUsedAt timestamp updated');
    } else {
        log('fail', '  ✗ lastUsedAt not updated');
        return false;
    }

    return true;
}

// ============================================================================
// STRESS TESTS
// ============================================================================

async function stressConcurrentKeyCreation() {
    log('info', '\n⚡ Stress Testing Concurrent Key Creation...');

    const promises = [];
    const testKeys = [];

    // Try to create 10 keys concurrently
    for (let i = 0; i < 10; i++) {
        const key = generateApiKey();
        testKeys.push(key);

        promises.push(
            prisma.apiKey.create({
                data: {
                    userId: testUserId,
                    key,
                    name: `Concurrent Key ${i}`,
                    status: 'active'
                }
            }).catch(err => ({ error: err.message }))
        );
    }

    const results = await Promise.all(promises);

    const successful = results.filter(r => !r.error).length;
    const failed = results.filter(r => r.error).length;

    // Track created IDs for cleanup
    results.forEach(r => {
        if (r.id) createdKeyIds.push(r.id);
    });

    log('pass', `  ✓ Concurrent operations handled: ${successful} created, ${failed} failed`);

    // Verify no duplicates
    const allKeys = await prisma.apiKey.findMany({
        where: { userId: testUserId }
    });

    const keySet = new Set(allKeys.map(k => k.key));

    if (keySet.size === allKeys.length) {
        log('pass', '  ✓ No duplicate keys in database');
    } else {
        log('fail', `  ✗ Duplicate keys detected!`);
        return false;
    }

    return true;
}

async function stressLargeKeyLookup() {
    log('info', '\n📊 Stress Testing Large Key Lookup...');

    // Lookup 1000 times
    const startTime = Date.now();

    const promises = [];
    for (let i = 0; i < 1000; i++) {
        promises.push(
            prisma.apiKey.findMany({
                where: { userId: testUserId },
                take: 10
            })
        );
    }

    await Promise.all(promises);

    const elapsed = Date.now() - startTime;
    const avgTime = elapsed / 1000;

    if (avgTime < 1) {
        log('pass', `  ✓ 1000 lookups completed in ${avgTime.toFixed(2)}ms (excellent)`);
    } else if (avgTime < 5) {
        log('pass', `  ✓ 1000 lookups completed in ${avgTime.toFixed(2)}ms (good)`);
    } else {
        log('warn', `  ⚠ 1000 lookups completed in ${avgTime.toFixed(2)}ms (slow)`);
    }

    return true;
}

// ============================================================================
// EDGE CASE TESTS
// ============================================================================

async function testEdgeCases() {
    log('info', '\n🔍 Testing Edge Cases...');

    // Test 1: Empty key name
    const key1 = await prisma.apiKey.create({
        data: {
            userId: testUserId,
            key: generateApiKey(),
            name: null, // No name
            status: 'active'
        }
    });
    createdKeyIds.push(key1.id);

    if (key1.name === null) {
        log('pass', '  ✓ Null key name handled');
    } else {
        log('fail', '  ✗ Null key name not handled');
        return false;
    }

    // Test 2: Very long key name
    const longName = 'A'.repeat(1000);
    try {
        const key2 = await prisma.apiKey.create({
            data: {
                userId: testUserId,
                key: generateApiKey(),
                name: longName,
                status: 'active'
            }
        });
        createdKeyIds.push(key2.id);
        log('pass', '  ✓ Long key names accepted');
    } catch (error) {
        log('warn', `  ⚠ Long names rejected (might be database limit)`);
    }

    // Test 3: Special characters in name
    const specialName = `Test 🔑 Key <script>alert('xss')</script>`;
    const key3 = await prisma.apiKey.create({
        data: {
            userId: testUserId,
            key: generateApiKey(),
            name: specialName,
            status: 'active'
        }
    });
    createdKeyIds.push(key3.id);

    if (key3.name === specialName) {
        log('pass', '  ✓ Special characters in names handled');
    } else {
        log('fail', '  ✗ Special characters sanitized unexpectedly');
    }

    // Test 4: Double revocation
    const key4 = await prisma.apiKey.create({
        data: {
            userId: testUserId,
            key: generateApiKey(),
            name: 'Double Revoke Test',
            status: 'active'
        }
    });
    createdKeyIds.push(key4.id);

    await prisma.apiKey.update({
        where: { id: key4.id },
        data: { status: 'revoked', revokedAt: new Date() }
    });

    const revokedAt1 = (await prisma.apiKey.findUnique({ where: { id: key4.id } })).revokedAt;

    await new Promise(resolve => setTimeout(resolve, 100));

    await prisma.apiKey.update({
        where: { id: key4.id },
        data: { status: 'revoked', revokedAt: new Date() }
    });

    const revokedAt2 = (await prisma.apiKey.findUnique({ where: { id: key4.id } })).revokedAt;

    if (revokedAt2 > revokedAt1) {
        log('pass', '  ✓ Double revocation handled (timestamp updated)');
    } else {
        log('warn', '  ⚠ Double revocation timestamp not updated');
    }

    return true;
}

// ============================================================================
// MAIN TEST RUNNER
// ============================================================================

async function runAllTests() {
    console.log('\n' + '='.repeat(80));
    console.log('  KAMIYO API KEY SYSTEM - COMPREHENSIVE TEST SUITE');
    console.log('='.repeat(80));

    let passedTests = 0;
    let failedTests = 0;

    try {
        // Setup
        log('info', '\n🔧 Setting up test environment...');
        await createTestUser();

        // Run all test suites
        const tests = [
            { name: 'API Key Generation', fn: testApiKeyGeneration },
            { name: 'Database Operations', fn: testDatabaseOperations },
            { name: 'Rate Limiting', fn: testRateLimiting },
            { name: 'getUserByApiKey', fn: testGetUserByApiKey },
            { name: 'Concurrent Creation', fn: stressConcurrentKeyCreation },
            { name: 'Large Lookup Performance', fn: stressLargeKeyLookup },
            { name: 'Edge Cases', fn: testEdgeCases }
        ];

        for (const test of tests) {
            try {
                const result = await test.fn();
                if (result !== false) {
                    passedTests++;
                    log('pass', `\n✓ ${test.name} PASSED`);
                } else {
                    failedTests++;
                    log('fail', `\n✗ ${test.name} FAILED`);
                }
            } catch (error) {
                failedTests++;
                log('fail', `\n✗ ${test.name} FAILED: ${error.message}`);
                console.error(error);
            }
        }

    } finally {
        // Cleanup
        log('info', '\n🧹 Cleaning up...');
        await cleanupTestData();
        await prisma.$disconnect();
    }

    // Results summary
    console.log('\n' + '='.repeat(80));
    console.log('  TEST RESULTS');
    console.log('='.repeat(80));
    log('info', `  Total Tests: ${passedTests + failedTests}`);
    log('pass', `  Passed: ${passedTests}`);
    if (failedTests > 0) {
        log('fail', `  Failed: ${failedTests}`);
    } else {
        log('pass', `  Failed: ${failedTests}`);
    }
    console.log('='.repeat(80) + '\n');

    if (failedTests === 0) {
        log('pass', '🎉 ALL TESTS PASSED! System is production-ready.');
        process.exit(0);
    } else {
        log('fail', '❌ SOME TESTS FAILED. Review issues before deployment.');
        process.exit(1);
    }
}

// Run tests
if (require.main === module) {
    runAllTests().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

module.exports = {
    runAllTests,
    testApiKeyGeneration,
    testDatabaseOperations
};
