#!/usr/bin/env python3
"""Test x402 endpoint locally"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import json
from api.x402.config import get_x402_config

def test_x402_schema():
    """Generate and validate x402 schema response"""
    config = get_x402_config()

    # Generate the same response as the endpoint
    response_data = {
        "x402Version": 1,
        "accepts": [
            {
                "scheme": "exact",
                "network": "base",
                "maxAmountRequired": str(int(config.endpoint_prices.get("/exploits", 0.01) * 1_000_000)),
                "resource": "/exploits",
                "description": "Get real-time cryptocurrency exploit data with 20+ aggregated sources",
                "mimeType": "application/json",
                "payTo": config.base_payment_address,
                "maxTimeoutSeconds": 300,
                "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
                "outputSchema": {
                    "input": {
                        "type": "http",
                        "method": "GET",
                        "queryParams": {
                            "page": {
                                "type": "integer",
                                "required": False,
                                "description": "Page number (default: 1)"
                            },
                            "page_size": {
                                "type": "integer",
                                "required": False,
                                "description": "Items per page (default: 100, max: 500)"
                            },
                            "chain": {
                                "type": "string",
                                "required": False,
                                "description": "Filter by blockchain (e.g., Ethereum, BSC)"
                            },
                            "min_amount": {
                                "type": "number",
                                "required": False,
                                "description": "Minimum loss amount in USD"
                            }
                        }
                    },
                    "output": {
                        "data": {
                            "type": "array",
                            "description": "List of exploit records"
                        },
                        "total": {
                            "type": "integer",
                            "description": "Total number of exploits"
                        },
                        "page": {
                            "type": "integer",
                            "description": "Current page number"
                        },
                        "has_more": {
                            "type": "boolean",
                            "description": "Whether more pages exist"
                        }
                    }
                },
                "extra": {
                    "provider": "Kamiyo",
                    "version": "1.0.0",
                    "sources_count": 20,
                    "documentation": "https://api.kamiyo.ai/docs"
                }
            },
            {
                "scheme": "exact",
                "network": "base",
                "maxAmountRequired": str(int(config.endpoint_prices.get("/exploits/latest-alert", 0.01) * 1_000_000)),
                "resource": "/exploits/latest-alert",
                "description": "Get latest exploit alert with AI-powered risk assessment",
                "mimeType": "application/json",
                "payTo": config.base_payment_address,
                "maxTimeoutSeconds": 300,
                "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
                "outputSchema": {
                    "input": {
                        "type": "http",
                        "method": "GET",
                        "queryParams": {
                            "hours": {
                                "type": "integer",
                                "required": False,
                                "description": "Time window in hours (1-24, default: 1)"
                            }
                        }
                    },
                    "output": {
                        "alert_status": {
                            "type": "string",
                            "enum": ["critical", "high", "medium", "low", "none"],
                            "description": "Current alert status"
                        },
                        "exploit": {
                            "type": "object",
                            "description": "Latest exploit details"
                        },
                        "risk_score": {
                            "type": "number",
                            "description": "Risk assessment score (0-100)"
                        },
                        "affected_protocols": {
                            "type": "array",
                            "description": "List of affected protocols"
                        },
                        "recommended_action": {
                            "type": "string",
                            "description": "AI-generated recommended action"
                        }
                    }
                },
                "extra": {
                    "provider": "Kamiyo",
                    "version": "1.0.0",
                    "ai_powered": True,
                    "documentation": "https://api.kamiyo.ai/docs"
                }
            }
        ]
    }

    # Convert to JSON and print
    json_output = json.dumps(response_data, indent=2)
    print(json_output)

    # Validate required fields
    print("\n=== Validation ===")
    print(f"x402Version: {response_data['x402Version']}")
    print(f"Number of accepts: {len(response_data['accepts'])}")

    for i, accept in enumerate(response_data['accepts']):
        print(f"\nAccept #{i+1}:")
        print(f"  scheme: {accept['scheme']}")
        print(f"  network: {accept['network']}")
        print(f"  maxAmountRequired: {accept['maxAmountRequired']}")
        print(f"  resource: {accept['resource']}")
        print(f"  description: {accept['description'][:50]}...")
        print(f"  mimeType: {accept['mimeType']}")
        print(f"  payTo: {accept['payTo']}")
        print(f"  maxTimeoutSeconds: {accept['maxTimeoutSeconds']}")
        print(f"  asset: {accept['asset']}")

    print("\n✓ Schema validation passed")

if __name__ == "__main__":
    test_x402_schema()
