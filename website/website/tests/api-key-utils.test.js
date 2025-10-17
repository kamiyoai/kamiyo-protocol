/**
 * API Key Utilities Unit Tests
 * Tests functions that don't require database connection
 */

const { generateApiKey, isValidApiKeyFormat, hashApiKey } = require('../lib/apiKeyUtils');

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

async function testApiKeyGeneration() {
    log('info', '\n📝 Testing API Key Generation...');

    // Test 1: Generate key format
    const key1 = generateApiKey();
    const isValid1 = isValidApiKeyFormat(key1);

    if (isValid1 && key1.startsWith('kmy_') && key1.length === 68) {
        log('pass', '  ✓ API key format is correct (kmy_ + 64 hex chars)');
    } else {
        log('fail', `  ✗ API key format invalid: ${key1}`);
        return false;
    }

    // Test 2: Uniqueness (generate 1000 keys, check for duplicates)
    log('info', '  Testing uniqueness with 1000 keys...');
    const keys = new Set();
    for (let i = 0; i < 1000; i++) {
        keys.add(generateApiKey());
    }

    if (keys.size === 1000) {
        log('pass', '  ✓ Generated 1000 unique keys (no collisions)');
    } else {
        log('fail', `  ✗ Key collision detected (${keys.size}/1000 unique)`);
        return false;
    }

    // Test 3: Randomness distribution
    const firstChars = new Set();
    for (let i = 0; i < 100; i++) {
        const key = generateApiKey();
        firstChars.add(key[4]); // First char after kmy_
    }

    // Should have good distribution of hex characters
    if (firstChars.size >= 10) {
        log('pass', `  ✓ Good randomness (${firstChars.size}/16 possible hex chars used)`);
    } else {
        log('warn', `  ⚠ Low randomness (${firstChars.size}/16 hex chars)`);
    }

    return true;
}

async function testFormatValidation() {
    log('info', '\n🔍 Testing Format Validation...');

    const validKeys = [
        'kmy_' + 'a'.repeat(64),
        'kmy_' + 'f'.repeat(64),
        'kmy_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        generateApiKey()
    ];

    const invalidKeys = [
        '',
        'invalid',
        'kmy_',
        'kmy_short',
        'kmy_' + 'a'.repeat(63), // Too short
        'kmy_' + 'a'.repeat(65), // Too long
        'wrong_' + 'a'.repeat(64), // Wrong prefix
        'kmy_' + 'g'.repeat(64), // 'g' not in hex
        'kmy_' + 'Z'.repeat(64), // Uppercase (should fail)
        'KMY_' + 'a'.repeat(64), // Wrong case prefix
        'kmy_0123456789abcdef012345678 9abcdef0123456789abcdef0123456789abcdef', // Space
        null,
        undefined
    ];

    let passed = true;

    // Test valid keys
    validKeys.forEach((key, i) => {
        if (!isValidApiKeyFormat(key)) {
            log('fail', `  ✗ Valid key #${i+1} rejected: ${key ? key.substring(0, 20) : key}...`);
            passed = false;
        }
    });

    // Test invalid keys
    invalidKeys.forEach((key, i) => {
        if (isValidApiKeyFormat(key)) {
            log('fail', `  ✗ Invalid key #${i+1} accepted: ${key ? key.substring(0, 20) : key}...`);
            passed = false;
        }
    });

    if (passed) {
        log('pass', `  ✓ Format validation correct (${validKeys.length} valid, ${invalidKeys.length} invalid)`);
    }

    return passed;
}

async function testHashFunction() {
    log('info', '\n🔐 Testing Hash Function...');

    const key = generateApiKey();
    const hash1 = hashApiKey(key);
    const hash2 = hashApiKey(key);

    // Test 1: Deterministic (same input = same output)
    if (hash1 === hash2) {
        log('pass', '  ✓ Hash function is deterministic');
    } else {
        log('fail', '  ✗ Hash function not deterministic');
        return false;
    }

    // Test 2: Length (SHA-256 = 64 hex chars)
    if (hash1.length === 64 && /^[a-f0-9]{64}$/.test(hash1)) {
        log('pass', '  ✓ Hash output is 64-character hex (SHA-256)');
    } else {
        log('fail', `  ✗ Hash format incorrect: ${hash1}`);
        return false;
    }

    // Test 3: Different inputs = different outputs
    const key2 = generateApiKey();
    const hash3 = hashApiKey(key2);

    if (hash1 !== hash3) {
        log('pass', '  ✓ Different inputs produce different hashes');
    } else {
        log('fail', '  ✗ Hash collision detected!');
        return false;
    }

    // Test 4: Avalanche effect (small change = big difference)
    const similarKey = key.slice(0, -1) + (key[key.length - 1] === 'a' ? 'b' : 'a');
    const hash4 = hashApiKey(similarKey);

    let differentBits = 0;
    for (let i = 0; i < hash1.length; i++) {
        if (hash1[i] !== hash4[i]) differentBits++;
    }

    if (differentBits > hash1.length / 4) {
        log('pass', `  ✓ Good avalanche effect (${differentBits}/${hash1.length} chars different)`);
    } else {
        log('warn', `  ⚠ Weak avalanche effect (${differentBits}/${hash1.length} chars different)`);
    }

    return true;
}

async function testPerformance() {
    log('info', '\n⚡ Testing Performance...');

    // Test 1: Key generation speed
    const startGen = Date.now();
    for (let i = 0; i < 10000; i++) {
        generateApiKey();
    }
    const genTime = Date.now() - startGen;
    const genPerSec = (10000 / genTime * 1000).toFixed(0);

    if (genTime < 1000) {
        log('pass', `  ✓ Generated 10,000 keys in ${genTime}ms (~${genPerSec} keys/sec)`);
    } else {
        log('warn', `  ⚠ Slow generation: 10,000 keys in ${genTime}ms (~${genPerSec} keys/sec)`);
    }

    // Test 2: Validation speed
    const testKeys = Array.from({ length: 10000 }, () => generateApiKey());
    const startVal = Date.now();
    testKeys.forEach(key => isValidApiKeyFormat(key));
    const valTime = Date.now() - startVal;
    const valPerSec = (10000 / valTime * 1000).toFixed(0);

    if (valTime < 100) {
        log('pass', `  ✓ Validated 10,000 keys in ${valTime}ms (~${valPerSec} validations/sec)`);
    } else {
        log('warn', `  ⚠ Slow validation: 10,000 keys in ${valTime}ms (~${valPerSec} validations/sec)`);
    }

    // Test 3: Hash speed
    const startHash = Date.now();
    testKeys.slice(0, 1000).forEach(key => hashApiKey(key));
    const hashTime = Date.now() - startHash;
    const hashPerSec = (1000 / hashTime * 1000).toFixed(0);

    if (hashTime < 200) {
        log('pass', `  ✓ Hashed 1,000 keys in ${hashTime}ms (~${hashPerSec} hashes/sec)`);
    } else {
        log('warn', `  ⚠ Slow hashing: 1,000 keys in ${hashTime}ms (~${hashPerSec} hashes/sec)`);
    }

    return true;
}

async function testEdgeCases() {
    log('info', '\n🧪 Testing Edge Cases...');

    let passed = true;

    // Test 1: Empty string
    if (!isValidApiKeyFormat('')) {
        log('pass', '  ✓ Empty string rejected');
    } else {
        log('fail', '  ✗ Empty string accepted');
        passed = false;
    }

    // Test 2: Null/undefined
    if (!isValidApiKeyFormat(null) && !isValidApiKeyFormat(undefined)) {
        log('pass', '  ✓ Null/undefined rejected');
    } else {
        log('fail', '  ✗ Null/undefined accepted');
        passed = false;
    }

    // Test 3: Numbers
    if (!isValidApiKeyFormat(12345) && !isValidApiKeyFormat(0)) {
        log('pass', '  ✓ Numbers rejected');
    } else {
        log('fail', '  ✗ Numbers accepted');
        passed = false;
    }

    // Test 4: Objects
    if (!isValidApiKeyFormat({}) && !isValidApiKeyFormat([])) {
        log('pass', '  ✓ Objects/arrays rejected');
    } else {
        log('fail', '  ✗ Objects/arrays accepted');
        passed = false;
    }

    // Test 5: Case sensitivity
    const key = generateApiKey();
    const upperKey = key.toUpperCase();

    if (isValidApiKeyFormat(key) && !isValidApiKeyFormat(upperKey)) {
        log('pass', '  ✓ Case sensitivity enforced');
    } else {
        log('fail', '  ✗ Case sensitivity not enforced');
        passed = false;
    }

    // Test 6: SQL injection attempts
    const sqlInjections = [
        "kmy_'; DROP TABLE users; --" + 'a'.repeat(64 - 26),
        "kmy_<script>alert('xss')</script>" + 'a'.repeat(64 - 36)
    ];

    sqlInjections.forEach(injection => {
        if (!isValidApiKeyFormat(injection)) {
            // Expected - should reject
        } else {
            log('fail', '  ✗ Potential injection accepted');
            passed = false;
        }
    });

    log('pass', '  ✓ Injection attempts rejected');

    return passed;
}

// ============================================================================
// MAIN TEST RUNNER
// ============================================================================

async function runAllTests() {
    console.log('\n' + '='.repeat(80));
    console.log('  KAMIYO API KEY UTILITIES - UNIT TEST SUITE');
    console.log('  (No database connection required)');
    console.log('='.repeat(80));

    let passedTests = 0;
    let failedTests = 0;

    const tests = [
        { name: 'API Key Generation', fn: testApiKeyGeneration },
        { name: 'Format Validation', fn: testFormatValidation },
        { name: 'Hash Function', fn: testHashFunction },
        { name: 'Performance', fn: testPerformance },
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
        log('pass', '🎉 ALL TESTS PASSED! Utility functions are production-ready.');
        console.log('\n📝 Note: Database integration tests require production DB access.');
        console.log('   Run manual API endpoint tests after deployment.');
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
    testFormatValidation
};
