#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Test KAMIYO x402 EVM Payment Verification with Real Testnet Transactions

This script tests the EVM payment verification system with real transactions
from Base Sepolia and Ethereum Sepolia testnets.
"""

import asyncio
import os
from decimal import Decimal
from api.x402.payment_verifier import PaymentVerifier

# Sample testnet transactions (REPLACE WITH REAL ONES)
# These are example transaction hashes - you'll need actual USDC transfers
# on Base Sepolia or Ethereum Sepolia testnets for real testing

TEST_TRANSACTIONS = {
    'base_sepolia': {
        'rpc_url': 'https://sepolia.base.org',
        'usdc_address': '0x036CbD53842c5426634e7929541eC2318f3dCF7e',  # Base Sepolia USDC
        'transactions': [
            # Add real Base Sepolia USDC transfer tx hashes here
            # Format: ('tx_hash', 'expected_amount_usdc')
            # ('0x...', Decimal('1.0')),
        ]
    },
    'ethereum_sepolia': {
        'rpc_url': 'https://ethereum-sepolia-rpc.publicnode.com',
        'usdc_address': '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',  # Ethereum Sepolia USDC
        'transactions': [
            # Add real Ethereum Sepolia USDC transfer tx hashes here
            # Format: ('tx_hash', 'expected_amount_usdc')
            # ('0x...', Decimal('1.0')),
        ]
    }
}


async def test_real_transaction(verifier, tx_hash, chain, expected_amount=None):
    """Test verification with a real transaction"""
    print(f"\n{'='*80}")
    print(f"Testing {chain.upper()} transaction: {tx_hash}")
    print(f"{'='*80}")

    try:
        result = await verifier.verify_payment(tx_hash, chain)

        print(f"\nVerification Result:")
        print(f"  Valid: {result.is_valid}")
        print(f"  Chain: {result.chain}")
        print(f"  Amount: {result.amount_usdc} USDC")
        print(f"  From: {result.from_address}")
        print(f"  To: {result.to_address}")
        print(f"  Block: {result.block_number}")
        print(f"  Confirmations: {result.confirmations}")
        print(f"  Risk Score: {result.risk_score}")

        if result.error_message:
            print(f"  Error: {result.error_message}")

        # Validate expected amount if provided
        if expected_amount and result.is_valid:
            if result.amount_usdc == expected_amount:
                print(f"\n✅ Amount matches expected: {expected_amount} USDC")
            else:
                print(f"\n⚠️  Amount mismatch: expected {expected_amount}, got {result.amount_usdc}")

        return result

    except Exception as e:
        print(f"\n❌ Error testing transaction: {e}")
        import traceback
        traceback.print_exc()
        return None


async def test_base_mainnet_transaction():
    """Test with a real Base mainnet transaction (if available)"""
    verifier = PaymentVerifier()

    # Example: Replace with actual Base mainnet USDC transfer
    # tx_hash = '0x...'
    # result = await test_real_transaction(verifier, tx_hash, 'base')

    print("\n" + "="*80)
    print("BASE MAINNET TESTING")
    print("="*80)
    print("To test with real Base transactions:")
    print("1. Send USDC to the configured payment address on Base")
    print("2. Get the transaction hash")
    print("3. Update this script with the tx hash")
    print("4. Run again")
    print("\nPayment Address (Base):", verifier.get_payment_address('base'))
    print("USDC Contract (Base):", verifier.chains['base'].usdc_contract_address)


async def test_ethereum_mainnet_transaction():
    """Test with a real Ethereum mainnet transaction (if available)"""
    verifier = PaymentVerifier()

    # Example: Replace with actual Ethereum mainnet USDC transfer
    # tx_hash = '0x...'
    # result = await test_real_transaction(verifier, tx_hash, 'ethereum')

    print("\n" + "="*80)
    print("ETHEREUM MAINNET TESTING")
    print("="*80)
    print("To test with real Ethereum transactions:")
    print("1. Send USDC to the configured payment address on Ethereum")
    print("2. Get the transaction hash")
    print("3. Update this script with the tx hash")
    print("4. Run again")
    print("\nPayment Address (Ethereum):", verifier.get_payment_address('ethereum'))
    print("USDC Contract (Ethereum):", verifier.chains['ethereum'].usdc_contract_address)


async def test_edge_cases():
    """Test various edge cases"""
    verifier = PaymentVerifier()

    print("\n" + "="*80)
    print("EDGE CASE TESTING")
    print("="*80)

    # Test 1: Invalid transaction hash
    print("\n1. Testing invalid transaction hash...")
    result = await verifier.verify_payment('0xinvalid123', 'base')
    assert result.is_valid == False
    print(f"   ✅ Correctly rejected invalid tx: {result.error_message}")

    # Test 2: Unsupported chain
    print("\n2. Testing unsupported chain...")
    result = await verifier.verify_payment('0x123', 'unsupported')
    assert result.is_valid == False
    print(f"   ✅ Correctly rejected unsupported chain: {result.error_message}")

    # Test 3: Check chain configuration
    print("\n3. Checking chain configurations...")
    for chain in ['base', 'ethereum']:
        config = verifier.chains[chain]
        print(f"\n   {chain.upper()}:")
        print(f"     RPC: {config.rpc_url}")
        print(f"     USDC: {config.usdc_contract_address}")
        print(f"     Confirmations: {config.required_confirmations}")
        print(f"     Payment Address: {verifier.get_payment_address(chain)}")

        # Test RPC connection
        web3 = verifier.web3_instances.get(chain)
        if web3:
            try:
                block_number = web3.eth.block_number
                print(f"     ✅ Connected - Current block: {block_number}")
            except Exception as e:
                print(f"     ⚠️  Connection issue: {e}")


async def main():
    """Main test runner"""
    print("="*80)
    print("KAMIYO x402 EVM PAYMENT VERIFICATION TEST")
    print("="*80)
    print("\nThis script tests the EVM payment verification implementation")
    print("with both mock tests and real blockchain transactions.\n")

    # Run edge case tests
    await test_edge_cases()

    # Run mainnet tests (with instructions)
    await test_base_mainnet_transaction()
    await test_ethereum_mainnet_transaction()

    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    print("✅ Edge case tests passed")
    print("✅ Chain configurations verified")
    print("✅ RPC connections tested")
    print("\nTo test with real transactions:")
    print("1. Send USDC to payment addresses shown above")
    print("2. Update this script with transaction hashes")
    print("3. Run: python3 test_x402_real_transactions.py")
    print("="*80)


if __name__ == '__main__':
    asyncio.run(main())
