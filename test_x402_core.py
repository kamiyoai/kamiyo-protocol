#!/usr/bin/env python3
"""
Test core x402 payment system components
"""

import asyncio
from api.x402.payment_tracker import payment_tracker, PaymentRecord, PaymentToken
from api.x402.payment_verifier import PaymentVerifier


async def test_payment_tracker():
    """Test payment tracker functionality"""
    print("\n=== Testing Payment Tracker ===")
    
    # Clear any existing data
    payment_tracker.payments.clear()
    payment_tracker.tokens.clear()
    payment_tracker.next_payment_id = 1
    
    # Test creating payment record
    payment = await payment_tracker.create_payment_record(
        tx_hash="0x1234567890abcdef",
        chain="base",
        amount_usdc=1.0,
        from_address="0xsender123"
    )
    
    print(f"✅ Created payment record: ID={payment['id']}, Amount={payment['amount_usdc']} USDC")
    
    # Test generating payment token
    raw_token = await payment_tracker.generate_payment_token(payment['id'])
    print(f"✅ Generated payment token: {raw_token[:20]}...")
    
    # Test getting payment by token
    payment_info = await payment_tracker.get_payment_by_token(raw_token)
    print(f"✅ Retrieved payment by token: ID={payment_info['id']}, Remaining={payment_info['requests_remaining']}")
    
    # Test recording usage
    await payment_tracker.record_usage(payment['id'], "/exploits", 0.10)
    payment_info = await payment_tracker.get_payment_by_token(raw_token)
    print(f"✅ Recorded usage: Remaining={payment_info['requests_remaining']}")
    
    # Test payment stats
    stats = await payment_tracker.get_payment_stats()
    print(f"✅ Payment stats: Total={stats['total_payments']}, Active={stats['active_payments']}")
    
    return True


def test_payment_verifier():
    """Test payment verifier functionality"""
    print("\n=== Testing Payment Verifier ===")
    
    verifier = PaymentVerifier()
    
    # Test supported chains
    chains = verifier.get_supported_chains()
    print(f"✅ Supported chains: {', '.join(chains)}")
    
    # Test payment addresses
    for chain in chains:
        address = verifier.get_payment_address(chain)
        print(f"✅ {chain.upper()} address: {address}")
    
    # Test minimum payment
    print(f"✅ Minimum payment: ${verifier.min_payment_amount}")
    
    return True


async def test_full_flow():
    """Test complete payment flow"""
    print("\n=== Testing Complete Payment Flow ===")
    
    # Clear any existing data
    payment_tracker.payments.clear()
    payment_tracker.tokens.clear()
    payment_tracker.next_payment_id = 1
    
    # Step 1: Create payment record (simulating verified payment)
    payment = await payment_tracker.create_payment_record(
        tx_hash="0xabcdef1234567890",
        chain="base",
        amount_usdc=2.0,
        from_address="0xagent123"
    )
    
    # Step 2: Generate token
    raw_token = await payment_tracker.generate_payment_token(payment['id'])
    
    # Step 3: Use token for multiple requests
    for i in range(3):
        await payment_tracker.record_usage(payment['id'], "/exploits", 0.10)
        payment_info = await payment_tracker.get_payment_by_token(raw_token)
        print(f"  Request {i+1}: Remaining={payment_info['requests_remaining']}")
    
    print("✅ Complete payment flow tested successfully")
    return True


async def main():
    """Run all tests"""
    print("🧪 Testing KAMIYO x402 Payment System Core Components")
    
    try:
        await test_payment_tracker()
        test_payment_verifier()
        await test_full_flow()
        
        print("\n🎉 All core x402 tests passed!")
        return True
        
    except Exception as e:
        print(f"\n❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = asyncio.run(main())
    exit(0 if success else 1)
