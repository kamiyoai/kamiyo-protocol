/**
 * KAMIYO x402 SDK Usage Example
 * 
 * This example demonstrates how AI agents can use the KAMIYO x402 SDK
 * to make payments and access exploit intelligence data.
 */

const { KamiyoX402SDK, PaymentRequiredError } = require('./kamiyo-x402-sdk');

async function exampleUsage() {
    console.log('🚀 KAMIYO x402 SDK Usage Example\n');

    // Initialize SDK
    const sdk = new KamiyoX402SDK({
        apiBaseUrl: 'https://api.kamiyo.ai'
    });

    try {
        // Step 1: Get supported chains and pricing
        console.log('1. Getting supported chains and pricing...');
        const chains = await sdk.getSupportedChains();
        console.log('✅ Supported chains:', chains.supported_chains);
        console.log('💰 Minimum payment:', chains.min_payment_amount, 'USDC\n');

        // Step 2: Get pricing information
        const pricing = await sdk.getPricing();
        console.log('2. Pricing information:');
        console.log('   Pay-per-use: $' + pricing.pricing_tiers.pay_per_use.price_per_call + ' per call');
        console.log('   Requests per $1: ' + pricing.pricing_tiers.pay_per_use.requests_per_dollar + '\n');

        // Step 3: Try to access exploit data without payment
        console.log('3. Trying to access exploit data without payment...');
        try {
            await sdk.getExploits({ pageSize: 10 });
            console.log('❌ Unexpected: Should have required payment');
        } catch (error) {
            if (error instanceof PaymentRequiredError) {
                console.log('✅ Expected: Payment required for exploit data');
                console.log('   Endpoint:', error.paymentDetails.endpoint);
                console.log('   Amount:', error.paymentDetails.amount_usdc, 'USDC\n');
            } else {
                throw error;
            }
        }

        // Step 4: Verify a payment (simulated)
        console.log('4. Verifying payment transaction...');
        // In a real scenario, you would:
        // 1. Send USDC to the payment address
        // 2. Get the transaction hash
        // 3. Verify it here
        
        // For this example, we'll simulate a successful payment
        const simulatedTxHash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
        
        try {
            const verification = await sdk.verifyPayment(simulatedTxHash, 'base');
            console.log('✅ Payment verified:', verification.is_valid);
            console.log('   Amount:', verification.amount_usdc, 'USDC');
            console.log('   From:', verification.from_address);
            console.log('   Risk score:', verification.risk_score);
            console.log('   Payment ID:', verification.payment_id);
        } catch (error) {
            console.log('⚠️  Payment verification failed (expected in demo):', error.message);
            console.log('   In production, this would work with a real transaction\n');
        }

        // Step 5: Generate payment token (if payment was successful)
        console.log('5. Generating payment token...');
        // This would only work if we had a real payment
        // For demo purposes, we'll simulate setting a token
        sdk.setPaymentToken('demo-payment-token-12345');
        console.log('✅ Payment token set (simulated)\n');

        // Step 6: Access paid data with payment token
        console.log('6. Accessing exploit data with payment token...');
        try {
            // This would work with a real payment token
            const exploits = await sdk.getExploits({ pageSize: 5 });
            console.log('✅ Successfully accessed exploit data!');
            console.log('   Total exploits:', exploits.total);
            console.log('   Current page:', exploits.page);
            console.log('   Has more data:', exploits.has_more);
            
            if (exploits.data && exploits.data.length > 0) {
                console.log('   Sample exploit:');
                console.log('     Protocol:', exploits.data[0].protocol);
                console.log('     Chain:', exploits.data[0].chain);
                console.log('     Amount:', exploits.data[0].amount_usd, 'USD');
            }
        } catch (error) {
            console.log('⚠️  Data access failed (expected with demo token):', error.message);
            console.log('   In production, this would work with a valid payment token\n');
        }

        // Step 7: Get statistics
        console.log('7. Getting statistics...');
        try {
            const stats = await sdk.getStats(7); // Last 7 days
            console.log('✅ Statistics retrieved:');
            console.log('   Total exploits:', stats.total_exploits);
            console.log('   Total loss:', stats.total_loss_usd, 'USD');
            console.log('   Affected chains:', stats.affected_chains);
        } catch (error) {
            console.log('⚠️  Statistics access failed:', error.message);
        }

        // Step 8: Get risk score for a protocol
        console.log('8. Getting risk score for Uniswap V3...');
        try {
            const riskScore = await sdk.getRiskScore('Uniswap V3');
            console.log('✅ Risk score retrieved:');
            console.log('   Protocol: Uniswap V3');
            console.log('   Risk level:', riskScore.risk_level || 'Medium');
            console.log('   Confidence:', riskScore.confidence || 'High');
        } catch (error) {
            console.log('⚠️  Risk score access failed:', error.message);
        }

        console.log('\n🎉 Example completed!');
        console.log('\nNext steps for production use:');
        console.log('1. Get real USDC payment address from /x402/supported-chains');
        console.log('2. Send USDC payment to the address');
        console.log('3. Use the transaction hash with verifyPayment()');
        console.log('4. Generate payment token with generatePaymentToken()');
        console.log('5. Use the token to access paid endpoints');

    } catch (error) {
        console.error('❌ Error in example:', error);
    }
}

// Advanced example for AI trading bots
async function tradingBotExample() {
    console.log('\n🤖 AI Trading Bot Integration Example\n');

    const sdk = new KamiyoX402SDK({
        apiBaseUrl: 'https://api.kamiyo.ai',
        paymentToken: 'your-payment-token-here'
    });

    try {
        // Monitor for new exploits in real-time
        console.log('Monitoring for new exploits...');
        
        setInterval(async () => {
            try {
                const recentExploits = await sdk.getExploits({
                    pageSize: 10,
                    chain: 'ethereum' // Focus on Ethereum
                });

                // Check if any new high-value exploits
                const highValueExploits = recentExploits.data.filter(
                    exploit => exploit.amount_usd > 1000000 // $1M+
                );

                if (highValueExploits.length > 0) {
                    console.log('🚨 High-value exploit detected!');
                    highValueExploits.forEach(exploit => {
                        console.log(`   ${exploit.protocol} lost $${exploit.amount_usd} on ${exploit.chain}`);
                    });

                    // In a real bot, you would:
                    // 1. Adjust trading positions
                    // 2. Hedge against affected protocols
                    // 3. Notify risk management team
                }
            } catch (error) {
                console.log('Error fetching exploits:', error.message);
            }
        }, 30000); // Check every 30 seconds

    } catch (error) {
        console.error('Trading bot error:', error);
    }
}

// Run examples if this file is executed directly
if (require.main === module) {
    exampleUsage().then(() => {
        console.log('\n✨ All examples completed!');
    }).catch(error => {
        console.error('Example failed:', error);
    });
}

module.exports = {
    exampleUsage,
    tradingBotExample
};
