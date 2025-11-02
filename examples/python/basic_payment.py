#!/usr/bin/env python3
"""
KAMIYO PayAI Integration - Basic Payment Example

This example demonstrates how to:
1. Request a paid endpoint
2. Handle 402 Payment Required response
3. Authorize payment via PayAI
4. Retry with payment token
5. Receive exploit intelligence data
"""

import httpx
import asyncio
from decimal import Decimal

# API Configuration
API_BASE_URL = "https://api.kamiyo.ai"
ENDPOINT = "/exploits"


async def request_with_payment():
    """Request paid endpoint with automatic payment handling"""

    async with httpx.AsyncClient() as client:
        # Step 1: Request endpoint
        print(f"📡 Requesting {ENDPOINT}...")
        response = await client.get(f"{API_BASE_URL}{ENDPOINT}")

        # Step 2: Handle 402 Payment Required
        if response.status_code == 402:
            print("💰 Payment required!")
            payment_details = response.json()

            print(f"   Amount: ${payment_details['amount_usdc']} USDC")
            print(f"   Endpoint: {payment_details['endpoint']}")
            print(f"   Payment options: {len(payment_details['payment_options'])}")

            # Step 3: Get PayAI option
            payai_option = next(
                opt for opt in payment_details['payment_options']
                if opt['provider'] == 'PayAI Network'
            )

            print(f"\n✅ Using PayAI Network")
            print(f"   Supported chains: {', '.join(payai_option['supported_chains'][:3])}...")

            # Step 4: Authorize payment (mock for example)
            # In production, use PayAI SDK or wallet integration
            payment_token = await authorize_payai_payment(
                payment_details['endpoint'],
                Decimal(str(payment_details['amount_usdc'])),
                payai_option
            )

            # Step 5: Retry with payment
            print(f"\n🔄 Retrying with payment token...")
            final_response = await client.get(
                f"{API_BASE_URL}{ENDPOINT}",
                headers={"X-PAYMENT": payment_token}
            )

            if final_response.status_code == 200:
                data = final_response.json()
                print(f"\n✅ Success! Received {len(data.get('exploits', []))} exploits")
                return data
            else:
                print(f"\n❌ Payment verification failed: {final_response.status_code}")
                return None

        elif response.status_code == 200:
            # Already authenticated
            data = response.json()
            print(f"✅ Success! Received {len(data.get('exploits', []))} exploits")
            return data

        else:
            print(f"❌ Error: {response.status_code}")
            return None


async def authorize_payai_payment(
    endpoint: str,
    amount_usdc: Decimal,
    payai_option: dict
) -> str:
    """
    Authorize payment via PayAI Network

    In production, replace this with actual PayAI SDK integration:
    - Connect wallet (Phantom, MetaMask, etc.)
    - Sign payment authorization
    - Return base64-encoded payment token

    Args:
        endpoint: API endpoint being accessed
        amount_usdc: Payment amount in USDC
        payai_option: PayAI payment option from 402 response

    Returns:
        Base64-encoded payment token
    """
    print(f"\n💳 Authorizing payment...")
    print(f"   Endpoint: {endpoint}")
    print(f"   Amount: ${amount_usdc} USDC")

    # Mock payment authorization
    # In production, use:
    # from payai_sdk import authorize_payment
    # token = await authorize_payment(endpoint, amount_usdc, payai_option)

    # For this example, return mock token
    import base64
    import json

    mock_payment = {
        "x402Version": 1,
        "scheme": "exact",
        "network": "base",
        "payload": {
            "payer": "0xMockAddress",
            "amount": str(int(amount_usdc * Decimal(10**6))),
            "resource": endpoint
        }
    }

    payment_token = base64.b64encode(
        json.dumps(mock_payment).encode('utf-8')
    ).decode('utf-8')

    print(f"   ✅ Payment authorized")
    return payment_token


async def main():
    """Main example function"""
    print("="*70)
    print("KAMIYO PAYAI INTEGRATION - BASIC PAYMENT EXAMPLE")
    print("="*70 + "\n")

    result = await request_with_payment()

    if result:
        print("\n📊 Exploit Data:")
        for exploit in result.get('exploits', [])[:3]:  # Show first 3
            print(f"\n   🔴 {exploit.get('protocol', 'Unknown')}")
            print(f"      Amount: ${exploit.get('amount_stolen_usd', 0):,.0f}")
            print(f"      Chain: {exploit.get('chain', 'unknown')}")
            print(f"      Type: {exploit.get('attack_type', 'unknown')}")

    print("\n" + "="*70)


if __name__ == "__main__":
    asyncio.run(main())
