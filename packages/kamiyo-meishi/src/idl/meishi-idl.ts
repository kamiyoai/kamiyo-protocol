import type { Idl } from '@coral-xyz/anchor';

export const MEISHI_IDL: Idl = {
  "address": "6uejE3hDz3ZNHW7P4uHQEHS6fHAQ4vLJg7rx4VBYwpyK",
  "metadata": {
    "name": "meishi",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Meishi - Agent Compliance Passports for the agent economy"
  },
  "instructions": [
    {
      "name": "create_meishi",
      "docs": [
        "Create a new Meishi passport for an agent.",
        "The caller must own an active Kamiyo AgentIdentity."
      ],
      "discriminator": [
        53,
        24,
        81,
        209,
        227,
        131,
        160,
        214
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "agent_identity",
          "docs": [
            "- owner is Kamiyo program",
            "- PDA derivation from owner key",
            "- account discriminator + active state"
          ]
        },
        {
          "name": "passport",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  101,
                  105,
                  115,
                  104,
                  105
                ]
              },
              {
                "kind": "account",
                "path": "agent_identity"
              }
            ]
          }
        },
        {
          "name": "system_program",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "jurisdiction",
          "type": "u8"
        }
      ]
    },
    {
      "name": "record_audit",
      "docs": [
        "Record a compliance audit result. Only registered oracles can submit."
      ],
      "discriminator": [
        50,
        115,
        90,
        228,
        160,
        190,
        231,
        179
      ],
      "accounts": [
        {
          "name": "oracle",
          "writable": true,
          "signer": true
        },
        {
          "name": "passport",
          "writable": true
        },
        {
          "name": "audit",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  100,
                  105,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "passport"
              },
              {
                "kind": "account",
                "path": "passport.audit_nonce",
                "account": "MeishiPassport"
              }
            ]
          }
        },
        {
          "name": "oracle_registry",
          "optional": true
        },
        {
          "name": "system_program",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "audit_type",
          "type": "u8"
        },
        {
          "name": "compliance_score_after",
          "type": "i16"
        },
        {
          "name": "findings_hash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "findings_ual",
          "type": "string"
        },
        {
          "name": "passed",
          "type": "bool"
        }
      ]
    },
    {
      "name": "record_transaction",
      "docs": [
        "Record a completed transaction against this passport.",
        "Called by the escrow program via CPI or by an authorized service."
      ],
      "discriminator": [
        134,
        39,
        187,
        220,
        192,
        43,
        119,
        10
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true
        },
        {
          "name": "passport",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "volume_usd",
          "type": "u64"
        },
        {
          "name": "disputed",
          "type": "bool"
        },
        {
          "name": "dispute_lost",
          "type": "bool"
        }
      ]
    },
    {
      "name": "revoke_mandate",
      "docs": [
        "Revoke an active mandate. Only the principal can revoke."
      ],
      "discriminator": [
        252,
        97,
        140,
        119,
        67,
        43,
        177,
        108
      ],
      "accounts": [
        {
          "name": "principal",
          "signer": true
        },
        {
          "name": "passport",
          "writable": true
        },
        {
          "name": "mandate",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "set_liability_allocation",
      "docs": [
        "Set a pre-agreed liability allocation between the agent and a counterparty.",
        "Both parties must sign."
      ],
      "discriminator": [
        145,
        62,
        80,
        30,
        111,
        140,
        175,
        70
      ],
      "accounts": [
        {
          "name": "agent_owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "counterparty",
          "signer": true
        },
        {
          "name": "passport"
        },
        {
          "name": "arbitration_oracle"
        },
        {
          "name": "liability",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  105,
                  97,
                  98,
                  105,
                  108,
                  105,
                  116,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "passport"
              },
              {
                "kind": "account",
                "path": "counterparty"
              }
            ]
          }
        },
        {
          "name": "system_program",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "consumer_liability_bps",
          "type": "u16"
        },
        {
          "name": "developer_liability_bps",
          "type": "u16"
        },
        {
          "name": "merchant_liability_bps",
          "type": "u16"
        },
        {
          "name": "platform_liability_bps",
          "type": "u16"
        },
        {
          "name": "max_liability_usd",
          "type": "u64"
        },
        {
          "name": "expires_at",
          "type": "i64"
        }
      ]
    },
    {
      "name": "suspend_meishi",
      "docs": [
        "Suspend a Meishi passport. Oracle consensus or protocol multisig can suspend."
      ],
      "discriminator": [
        191,
        103,
        244,
        76,
        77,
        113,
        54,
        172
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true
        },
        {
          "name": "passport",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "reason",
          "type": "u8"
        }
      ]
    },
    {
      "name": "transfer_principal",
      "docs": [
        "Transfer principal authority to a new address."
      ],
      "discriminator": [
        73,
        188,
        1,
        172,
        105,
        95,
        96,
        84
      ],
      "accounts": [
        {
          "name": "current_principal",
          "signer": true
        },
        {
          "name": "passport",
          "writable": true
        },
        {
          "name": "new_principal"
        }
      ],
      "args": []
    },
    {
      "name": "unsuspend_meishi",
      "docs": [
        "Lift suspension after remediation."
      ],
      "discriminator": [
        152,
        43,
        48,
        19,
        123,
        209,
        87,
        163
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true
        },
        {
          "name": "passport",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "update_compliance_score",
      "docs": [
        "Update compliance score via oracle consensus (multi-sig).",
        "Separate from record_audit — this is for score-only updates without full audit."
      ],
      "discriminator": [
        48,
        196,
        169,
        142,
        226,
        210,
        214,
        152
      ],
      "accounts": [
        {
          "name": "oracle",
          "signer": true
        },
        {
          "name": "passport",
          "writable": true
        },
        {
          "name": "oracle_registry",
          "optional": true
        }
      ],
      "args": [
        {
          "name": "new_score",
          "type": "i16"
        }
      ]
    },
    {
      "name": "update_mandate",
      "docs": [
        "Set or update the authorization mandate for a Meishi passport.",
        "Only the principal (delegating human) can set mandates."
      ],
      "discriminator": [
        69,
        131,
        248,
        29,
        105,
        50,
        139,
        30
      ],
      "accounts": [
        {
          "name": "principal",
          "writable": true,
          "signer": true
        },
        {
          "name": "passport",
          "writable": true
        },
        {
          "name": "mandate",
          "writable": true
        },
        {
          "name": "instructions",
          "address": "Sysvar1nstructions1111111111111111111111111"
        },
        {
          "name": "system_program",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "spending_limit_usd",
          "type": "u64"
        },
        {
          "name": "daily_limit_usd",
          "type": "u64"
        },
        {
          "name": "monthly_limit_usd",
          "type": "u64"
        },
        {
          "name": "category_whitelist",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "merchant_whitelist_hash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "requires_human_approval_above",
          "type": "u64"
        },
        {
          "name": "geo_restrictions",
          "type": "u8"
        },
        {
          "name": "valid_from",
          "type": "i64"
        },
        {
          "name": "valid_until",
          "type": "i64"
        },
        {
          "name": "principal_signature",
          "type": {
            "array": [
              "u8",
              64
            ]
          }
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "LiabilityAllocation",
      "discriminator": [
        214,
        175,
        179,
        74,
        163,
        46,
        30,
        237
      ]
    },
    {
      "name": "MeishiAudit",
      "discriminator": [
        182,
        24,
        190,
        120,
        217,
        244,
        228,
        62
      ]
    },
    {
      "name": "MeishiMandate",
      "discriminator": [
        97,
        214,
        195,
        72,
        220,
        194,
        76,
        88
      ]
    },
    {
      "name": "MeishiPassport",
      "discriminator": [
        229,
        255,
        37,
        103,
        199,
        138,
        246,
        154
      ]
    }
  ],
  "events": [
    {
      "name": "AuditRecorded",
      "discriminator": [
        179,
        47,
        159,
        144,
        34,
        102,
        145,
        129
      ]
    },
    {
      "name": "ComplianceScoreUpdated",
      "discriminator": [
        162,
        38,
        249,
        184,
        19,
        96,
        57,
        223
      ]
    },
    {
      "name": "LiabilityAllocated",
      "discriminator": [
        222,
        175,
        16,
        203,
        34,
        193,
        72,
        196
      ]
    },
    {
      "name": "MandateRevoked",
      "discriminator": [
        228,
        111,
        181,
        60,
        204,
        58,
        131,
        28
      ]
    },
    {
      "name": "MandateUpdated",
      "discriminator": [
        100,
        65,
        226,
        199,
        157,
        3,
        34,
        110
      ]
    },
    {
      "name": "MeishiCreated",
      "discriminator": [
        131,
        41,
        45,
        224,
        17,
        125,
        39,
        15
      ]
    },
    {
      "name": "MeishiSuspended",
      "discriminator": [
        90,
        33,
        236,
        234,
        166,
        67,
        78,
        148
      ]
    },
    {
      "name": "MeishiUnsuspended",
      "discriminator": [
        69,
        237,
        11,
        133,
        98,
        233,
        27,
        11
      ]
    },
    {
      "name": "PrincipalTransferred",
      "discriminator": [
        150,
        101,
        230,
        119,
        11,
        109,
        135,
        111
      ]
    },
    {
      "name": "TransactionRecorded",
      "discriminator": [
        230,
        239,
        28,
        0,
        64,
        176,
        105,
        195
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "Unauthorized",
      "msg": "Unauthorized"
    },
    {
      "code": 6001,
      "name": "InvalidJurisdiction",
      "msg": "Invalid jurisdiction value (must be 0-4)"
    },
    {
      "code": 6002,
      "name": "InvalidComplianceScore",
      "msg": "Invalid compliance score (must be -1000 to 1000)"
    },
    {
      "code": 6003,
      "name": "MandateInPast",
      "msg": "Mandate valid_from must be in the future"
    },
    {
      "code": 6004,
      "name": "InvalidMandateDuration",
      "msg": "Invalid mandate duration (1 hour to 365 days)"
    },
    {
      "code": 6005,
      "name": "SpendingLimitExceeded",
      "msg": "Spending limit exceeds maximum"
    },
    {
      "code": 6006,
      "name": "InvalidSpendingHierarchy",
      "msg": "Per-tx limit must be <= daily, daily must be <= monthly"
    },
    {
      "code": 6007,
      "name": "MandateAlreadyRevoked",
      "msg": "Mandate has already been revoked"
    },
    {
      "code": 6008,
      "name": "MandateMismatch",
      "msg": "Mandate does not belong to this passport"
    },
    {
      "code": 6009,
      "name": "InvalidAuditType",
      "msg": "Invalid audit type (must be 0-3)"
    },
    {
      "code": 6010,
      "name": "UalTooLong",
      "msg": "Findings UAL exceeds 256 characters"
    },
    {
      "code": 6011,
      "name": "AlreadySuspended",
      "msg": "Passport is already suspended"
    },
    {
      "code": 6012,
      "name": "NotSuspended",
      "msg": "Passport is not suspended"
    },
    {
      "code": 6013,
      "name": "InvalidSuspensionReason",
      "msg": "Invalid suspension reason (must be 1-4)"
    },
    {
      "code": 6014,
      "name": "LiabilityBpsMismatch",
      "msg": "Liability basis points must sum to 10000"
    },
    {
      "code": 6015,
      "name": "LiabilityExpired",
      "msg": "Liability allocation has expired"
    },
    {
      "code": 6016,
      "name": "InvalidLiabilityCap",
      "msg": "Liability cap must be greater than zero"
    },
    {
      "code": 6017,
      "name": "PassportSuspended",
      "msg": "Passport is suspended — transaction not allowed"
    },
    {
      "code": 6018,
      "name": "ArithmeticOverflow",
      "msg": "Arithmetic overflow"
    },
    {
      "code": 6019,
      "name": "AgentIdentityInvalid",
      "msg": "Agent identity not found or inactive"
    },
    {
      "code": 6020,
      "name": "InvalidDisputeState",
      "msg": "dispute_lost requires disputed to be true"
    },
    {
      "code": 6021,
      "name": "MandateSignatureMissing",
      "msg": "Missing required ed25519 mandate signature verification instruction"
    },
    {
      "code": 6022,
      "name": "InvalidMandateSignature",
      "msg": "Mandate signature payload is invalid"
    },
    {
      "code": 6023,
      "name": "OracleRegistryMissing",
      "msg": "Oracle registry account is missing"
    },
    {
      "code": 6024,
      "name": "OracleRegistryInvalid",
      "msg": "Oracle registry account is invalid"
    },
    {
      "code": 6025,
      "name": "OracleNotRegistered",
      "msg": "Oracle signer is not registered"
    },
    {
      "code": 6026,
      "name": "OracleSignerMissing",
      "msg": "Oracle cosigner account must be a signer"
    },
    {
      "code": 6027,
      "name": "OracleConsensusInsufficient",
      "msg": "Oracle consensus quorum not met"
    }
  ],
  "types": [
    {
      "name": "AuditRecorded",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "passport",
            "type": "pubkey"
          },
          {
            "name": "auditor",
            "type": "pubkey"
          },
          {
            "name": "audit_type",
            "type": "u8"
          },
          {
            "name": "score_before",
            "type": "i16"
          },
          {
            "name": "score_after",
            "type": "i16"
          },
          {
            "name": "passed",
            "type": "bool"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "AuditType",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "Initial"
          },
          {
            "name": "Periodic"
          },
          {
            "name": "Triggered"
          },
          {
            "name": "Dispute"
          }
        ]
      }
    },
    {
      "name": "ComplianceClass",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "Unclassified"
          },
          {
            "name": "Minimal"
          },
          {
            "name": "Limited"
          },
          {
            "name": "High"
          },
          {
            "name": "Unacceptable"
          }
        ]
      }
    },
    {
      "name": "ComplianceScoreUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "passport",
            "type": "pubkey"
          },
          {
            "name": "old_score",
            "type": "i16"
          },
          {
            "name": "new_score",
            "type": "i16"
          },
          {
            "name": "updated_by",
            "type": "pubkey"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "Jurisdiction",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "Global"
          },
          {
            "name": "EU"
          },
          {
            "name": "US"
          },
          {
            "name": "UK"
          },
          {
            "name": "APAC"
          }
        ]
      }
    },
    {
      "name": "LiabilityAllocated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "passport",
            "type": "pubkey"
          },
          {
            "name": "counterparty",
            "type": "pubkey"
          },
          {
            "name": "consumer_bps",
            "type": "u16"
          },
          {
            "name": "developer_bps",
            "type": "u16"
          },
          {
            "name": "merchant_bps",
            "type": "u16"
          },
          {
            "name": "platform_bps",
            "type": "u16"
          },
          {
            "name": "max_liability_usd",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "LiabilityAllocation",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "meishi",
            "docs": [
              "The agent's Meishi passport"
            ],
            "type": "pubkey"
          },
          {
            "name": "counterparty",
            "docs": [
              "Merchant/platform being transacted with"
            ],
            "type": "pubkey"
          },
          {
            "name": "consumer_liability_bps",
            "docs": [
              "Consumer's liability share (basis points)"
            ],
            "type": "u16"
          },
          {
            "name": "developer_liability_bps",
            "docs": [
              "Agent developer's liability share (basis points)"
            ],
            "type": "u16"
          },
          {
            "name": "merchant_liability_bps",
            "docs": [
              "Merchant's liability share (basis points)"
            ],
            "type": "u16"
          },
          {
            "name": "platform_liability_bps",
            "docs": [
              "Platform's liability share (basis points)"
            ],
            "type": "u16"
          },
          {
            "name": "max_liability_usd",
            "docs": [
              "Maximum liability cap in micro-USD"
            ],
            "type": "u64"
          },
          {
            "name": "arbitration_oracle",
            "docs": [
              "Designated dispute resolver"
            ],
            "type": "pubkey"
          },
          {
            "name": "agreed_at",
            "docs": [
              "Agreement timestamp"
            ],
            "type": "i64"
          },
          {
            "name": "expires_at",
            "docs": [
              "Expiration timestamp"
            ],
            "type": "i64"
          },
          {
            "name": "bump",
            "docs": [
              "PDA bump"
            ],
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "MandateRevoked",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "passport",
            "type": "pubkey"
          },
          {
            "name": "mandate",
            "type": "pubkey"
          },
          {
            "name": "version",
            "type": "u32"
          },
          {
            "name": "principal",
            "type": "pubkey"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "MandateUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "passport",
            "type": "pubkey"
          },
          {
            "name": "mandate",
            "type": "pubkey"
          },
          {
            "name": "version",
            "type": "u32"
          },
          {
            "name": "principal",
            "type": "pubkey"
          },
          {
            "name": "valid_from",
            "type": "i64"
          },
          {
            "name": "valid_until",
            "type": "i64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "MeishiAudit",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "meishi",
            "docs": [
              "Parent Meishi passport"
            ],
            "type": "pubkey"
          },
          {
            "name": "auditor",
            "docs": [
              "Oracle that performed audit"
            ],
            "type": "pubkey"
          },
          {
            "name": "audit_type",
            "docs": [
              "Audit classification"
            ],
            "type": {
              "defined": {
                "name": "AuditType"
              }
            }
          },
          {
            "name": "compliance_score_before",
            "docs": [
              "Score before this audit"
            ],
            "type": "i16"
          },
          {
            "name": "compliance_score_after",
            "docs": [
              "Score after this audit"
            ],
            "type": "i16"
          },
          {
            "name": "findings_hash",
            "docs": [
              "Hash of detailed findings (full report on DKG)"
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "findings_ual",
            "docs": [
              "OriginTrail UAL for full audit report"
            ],
            "type": "string"
          },
          {
            "name": "passed",
            "docs": [
              "Whether the agent passed this audit"
            ],
            "type": "bool"
          },
          {
            "name": "timestamp",
            "docs": [
              "Audit timestamp"
            ],
            "type": "i64"
          },
          {
            "name": "bump",
            "docs": [
              "PDA bump"
            ],
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "MeishiCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "passport",
            "type": "pubkey"
          },
          {
            "name": "agent_identity",
            "type": "pubkey"
          },
          {
            "name": "issuer",
            "type": "pubkey"
          },
          {
            "name": "jurisdiction",
            "type": "u8"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "MeishiMandate",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "meishi",
            "docs": [
              "Parent Meishi passport"
            ],
            "type": "pubkey"
          },
          {
            "name": "version",
            "docs": [
              "Mandate version (incremental)"
            ],
            "type": "u32"
          },
          {
            "name": "principal_signature",
            "docs": [
              "Ed25519 signature from delegating human"
            ],
            "type": {
              "array": [
                "u8",
                64
              ]
            }
          },
          {
            "name": "spending_limit_usd",
            "docs": [
              "Max per-transaction in micro-USD"
            ],
            "type": "u64"
          },
          {
            "name": "daily_limit_usd",
            "docs": [
              "Max daily spend in micro-USD"
            ],
            "type": "u64"
          },
          {
            "name": "monthly_limit_usd",
            "docs": [
              "Max monthly spend in micro-USD"
            ],
            "type": "u64"
          },
          {
            "name": "category_whitelist",
            "docs": [
              "Bitmap of allowed product categories (up to 256)"
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "merchant_whitelist_hash",
            "docs": [
              "Merkle root of allowed merchants (off-chain list)"
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "requires_human_approval_above",
            "docs": [
              "Threshold for human-in-the-loop (micro-USD)"
            ],
            "type": "u64"
          },
          {
            "name": "geo_restrictions",
            "docs": [
              "Bitmap: EU, US, UK, APAC, etc."
            ],
            "type": "u8"
          },
          {
            "name": "valid_from",
            "docs": [
              "Mandate validity start"
            ],
            "type": "i64"
          },
          {
            "name": "valid_until",
            "docs": [
              "Mandate validity end"
            ],
            "type": "i64"
          },
          {
            "name": "revoked",
            "docs": [
              "Whether mandate has been revoked"
            ],
            "type": "bool"
          },
          {
            "name": "revoked_at",
            "docs": [
              "Revocation timestamp"
            ],
            "type": "i64"
          },
          {
            "name": "bump",
            "docs": [
              "PDA bump"
            ],
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "MeishiPassport",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "agent_identity",
            "docs": [
              "Link to existing Kamiyo AgentIdentity PDA"
            ],
            "type": "pubkey"
          },
          {
            "name": "issuer",
            "docs": [
              "Who created/deployed this agent"
            ],
            "type": "pubkey"
          },
          {
            "name": "principal",
            "docs": [
              "Human/entity who delegated authority"
            ],
            "type": "pubkey"
          },
          {
            "name": "kamon_hash",
            "docs": [
              "Deterministic hash for visual Kamon crest generation"
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "compliance_class",
            "docs": [
              "EU AI Act risk classification"
            ],
            "type": {
              "defined": {
                "name": "ComplianceClass"
              }
            }
          },
          {
            "name": "compliance_score",
            "docs": [
              "Compliance score: -1000 to 1000"
            ],
            "type": "i16"
          },
          {
            "name": "jurisdiction",
            "docs": [
              "Regulatory jurisdiction"
            ],
            "type": {
              "defined": {
                "name": "Jurisdiction"
              }
            }
          },
          {
            "name": "mandate_hash",
            "docs": [
              "Hash of current authorization mandate"
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "mandate_expires",
            "docs": [
              "When current mandate expires"
            ],
            "type": "i64"
          },
          {
            "name": "mandate_version",
            "docs": [
              "Current mandate version counter"
            ],
            "type": "u32"
          },
          {
            "name": "total_transactions",
            "docs": [
              "Lifetime transaction count"
            ],
            "type": "u64"
          },
          {
            "name": "total_volume_usd",
            "docs": [
              "Lifetime volume in micro-USD"
            ],
            "type": "u64"
          },
          {
            "name": "disputes_filed",
            "docs": [
              "Disputes initiated against this agent"
            ],
            "type": "u32"
          },
          {
            "name": "disputes_lost",
            "docs": [
              "Disputes this agent lost"
            ],
            "type": "u32"
          },
          {
            "name": "last_audit",
            "docs": [
              "Timestamp of last compliance audit"
            ],
            "type": "i64"
          },
          {
            "name": "audit_nonce",
            "docs": [
              "Audit nonce for PDA derivation"
            ],
            "type": "u32"
          },
          {
            "name": "suspended",
            "docs": [
              "Emergency suspension flag"
            ],
            "type": "bool"
          },
          {
            "name": "suspension_reason",
            "docs": [
              "Reason for suspension"
            ],
            "type": {
              "defined": {
                "name": "SuspensionReason"
              }
            }
          },
          {
            "name": "created_at",
            "docs": [
              "Creation timestamp"
            ],
            "type": "i64"
          },
          {
            "name": "updated_at",
            "docs": [
              "Last update timestamp"
            ],
            "type": "i64"
          },
          {
            "name": "bump",
            "docs": [
              "PDA bump"
            ],
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "MeishiSuspended",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "passport",
            "type": "pubkey"
          },
          {
            "name": "reason",
            "type": "u8"
          },
          {
            "name": "suspended_by",
            "type": "pubkey"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "MeishiUnsuspended",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "passport",
            "type": "pubkey"
          },
          {
            "name": "unsuspended_by",
            "type": "pubkey"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "PrincipalTransferred",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "passport",
            "type": "pubkey"
          },
          {
            "name": "old_principal",
            "type": "pubkey"
          },
          {
            "name": "new_principal",
            "type": "pubkey"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "SuspensionReason",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "None"
          },
          {
            "name": "ComplianceFailure"
          },
          {
            "name": "FraudDetected"
          },
          {
            "name": "MandateExpired"
          },
          {
            "name": "OracleConsensus"
          }
        ]
      }
    },
    {
      "name": "TransactionRecorded",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "passport",
            "type": "pubkey"
          },
          {
            "name": "volume_usd",
            "type": "u64"
          },
          {
            "name": "disputed",
            "type": "bool"
          },
          {
            "name": "dispute_lost",
            "type": "bool"
          },
          {
            "name": "total_transactions",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    }
  ]
} as unknown as Idl;
