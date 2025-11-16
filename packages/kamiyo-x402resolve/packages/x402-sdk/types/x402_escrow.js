"use strict";
{
    "version";
    "0.1.0",
        "name";
    "x402_escrow",
        "instructions";
    [
        {
            "name": "initializeEscrow",
            "accounts": [
                {
                    "name": "escrow",
                    "isMut": true,
                    "isSigner": false
                },
                {
                    "name": "agent",
                    "isMut": true,
                    "isSigner": true
                },
                {
                    "name": "api",
                    "isMut": false,
                    "isSigner": false
                },
                {
                    "name": "systemProgram",
                    "isMut": false,
                    "isSigner": false
                }
            ],
            "args": [
                {
                    "name": "amount",
                    "type": "u64"
                },
                {
                    "name": "timeLock",
                    "type": "i64"
                },
                {
                    "name": "transactionId",
                    "type": "string"
                }
            ]
        },
        {
            "name": "releaseFunds",
            "accounts": [
                {
                    "name": "escrow",
                    "isMut": true,
                    "isSigner": false
                },
                {
                    "name": "agent",
                    "isMut": true,
                    "isSigner": true
                },
                {
                    "name": "api",
                    "isMut": true,
                    "isSigner": false
                },
                {
                    "name": "systemProgram",
                    "isMut": false,
                    "isSigner": false
                }
            ],
            "args": []
        },
        {
            "name": "resolveDispute",
            "accounts": [
                {
                    "name": "escrow",
                    "isMut": true,
                    "isSigner": false
                },
                {
                    "name": "agent",
                    "isMut": true,
                    "isSigner": false
                },
                {
                    "name": "api",
                    "isMut": true,
                    "isSigner": false
                },
                {
                    "name": "verifier",
                    "isMut": false,
                    "isSigner": false
                },
                {
                    "name": "systemProgram",
                    "isMut": false,
                    "isSigner": false
                }
            ],
            "args": [
                {
                    "name": "qualityScore",
                    "type": "u8"
                },
                {
                    "name": "refundPercentage",
                    "type": "u8"
                },
                {
                    "name": "signature",
                    "type": {
                        "array": ["u8", 64]
                    }
                }
            ]
        },
        {
            "name": "markDisputed",
            "accounts": [
                {
                    "name": "escrow",
                    "isMut": true,
                    "isSigner": false
                },
                {
                    "name": "agent",
                    "isMut": false,
                    "isSigner": true
                }
            ],
            "args": []
        }
    ],
        "accounts";
    [
        {
            "name": "Escrow",
            "type": {
                "kind": "struct",
                "fields": [
                    {
                        "name": "agent",
                        "type": "publicKey"
                    },
                    {
                        "name": "api",
                        "type": "publicKey"
                    },
                    {
                        "name": "amount",
                        "type": "u64"
                    },
                    {
                        "name": "status",
                        "type": {
                            "defined": "EscrowStatus"
                        }
                    },
                    {
                        "name": "createdAt",
                        "type": "i64"
                    },
                    {
                        "name": "expiresAt",
                        "type": "i64"
                    },
                    {
                        "name": "transactionId",
                        "type": "string"
                    },
                    {
                        "name": "bump",
                        "type": "u8"
                    },
                    {
                        "name": "qualityScore",
                        "type": {
                            "option": "u8"
                        }
                    },
                    {
                        "name": "refundPercentage",
                        "type": {
                            "option": "u8"
                        }
                    }
                ]
            }
        }
    ],
        "types";
    [
        {
            "name": "EscrowStatus",
            "type": {
                "kind": "enum",
                "variants": [
                    {
                        "name": "Active"
                    },
                    {
                        "name": "Released"
                    },
                    {
                        "name": "Disputed"
                    },
                    {
                        "name": "Resolved"
                    }
                ]
            }
        }
    ],
        "errors";
    [
        {
            "code": 6000,
            "name": "InvalidStatus",
            "msg": "Invalid escrow status for this operation"
        },
        {
            "code": 6001,
            "name": "Unauthorized",
            "msg": "Unauthorized: Only agent or expired escrow can release"
        },
        {
            "code": 6002,
            "name": "InvalidQualityScore",
            "msg": "Invalid quality score (must be 0-100)"
        },
        {
            "code": 6003,
            "name": "InvalidRefundPercentage",
            "msg": "Invalid refund percentage (must be 0-100)"
        },
        {
            "code": 6004,
            "name": "InvalidSignature",
            "msg": "Invalid verifier signature"
        }
    ],
        "metadata";
    {
        "address";
        "BtSoJmuFZCq8DmWbesuAbu7E6KJijeSeLLBUWTKC6x4P";
    }
}
