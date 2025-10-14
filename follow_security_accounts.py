#!/usr/bin/env python3
"""
Follow top security accounts on Twitter
"""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv
import tweepy
import time

load_dotenv()

# Initialize Twitter API client
client = tweepy.Client(
    bearer_token=os.getenv('X_BEARER_TOKEN'),
    consumer_key=os.getenv('X_API_KEY'),
    consumer_secret=os.getenv('X_API_SECRET'),
    access_token=os.getenv('X_ACCESS_TOKEN'),
    access_token_secret=os.getenv('X_ACCESS_SECRET')
)

# Top security researchers and accounts to follow
accounts_to_follow = [
    # Security Researchers
    'samczsun',  # Paradigm security researcher
    'pcaversaccio',  # Smart contract security
    'zachxbt',  # On-chain investigator
    'officer_cia',  # Security researcher
    'bertcmiller',  # Flashbots
    'bantg',  # Yearn security
    'transmissions11',  # Security researcher
    'halbornSecurity',  # Halborn
    'hexagate_',  # Security firm

    # Alert Accounts
    'PeckShieldAlert',  # Real-time alerts
    'CertiKAlert',  # CertiK alerts
    'BlockSecTeam',  # BlockSec
    'slowmist_team',  # SlowMist
    'BeosinAlert',  # Beosin
    'AnciliaInc',  # Ancilia
    'CyversAlerts',  # Cyvers

    # Audit Firms
    'Consensys',  # ConsenSys Diligence
    'OpenZeppelin',  # OpenZeppelin
    'trailofbits',  # Trail of Bits
    'Quantstamp',  # Quantstamp
    'code4rena',  # Code Arena
    'spearbit',  # Spearbit

    # DeFi Protocols (to understand their security)
    'Uniswap',
    'AaveAave',
    'CurveFinance',
    'MakerDAO',
    'compoundfinance',
    'SushiSwap',

    # Security News/Analysis
    'Rekt_HQ',  # Rekt News
    'immunefi',  # Immunefi bug bounties
    'DeFiSafety',  # DeFi Safety
    'defihacklabs',  # DeFi Hack Labs

    # Blockchain Explorers
    'etherscan',  # Etherscan
    'bscscan',  # BSCScan

    # MEV/Security
    'bertcmiller',  # MEV researcher
    'mevalphaleak',  # MEV Alpha Leak
    'Flashbots',  # Flashbots

    # Additional Researchers
    'tinchoabbate',  # Security researcher
    'adrianhetman',  # Security researcher
    'cmichelio',  # Smart contract dev
    'StErMi',  # Security researcher
    'pashovkrum',  # Security researcher
    'bytes032',  # Security researcher
    'jtriley_eth',  # Security researcher
    'danielvf',  # Security researcher

    # Projects with good security practices
    'graphprotocol',  # The Graph
    'chainlink',  # Chainlink
    'synthetix_io',  # Synthetix

    # VCs (potential customers)
    'Paradigm',  # Paradigm
    'a16zcrypto',  # a16z crypto
    'ElectricCapital',  # Electric Capital

    # More Security
    'AuditDAO',  # Audit DAO
    'sherlockdefi',  # Sherlock
    'hacxyk',  # Security researcher
    'DevDacian',  # Security researcher
    'trust__90',  # Trust Security

    # Ecosystem Security
    'ethereum',  # Ethereum Foundation
    'arbitrum',  # Arbitrum
    'Optimism',  # Optimism
    '0xPolygon',  # Polygon
    'avax',  # Avalanche

    # More Researchers
    '0xkarmacoma',  # Symbolic execution
    'MevRefund',  # MEV protection
    'rugdoc',  # Rug checker
    'tokensniffer',  # Token checker

    # Additional Audit Firms
    'MixBytes',  # MixBytes
    'pessimisticio',  # Pessimistic
    'runtime_xyz',  # Runtime Verification
    'veridise_inc',  # Veridise

    # More Alert Services
    'Forta_Network',  # Forta Network
    'GoPlus_Security',  # GoPlus

    # DeFi Analytics (potential collaboration)
    'DefiLlama',  # DeFi Llama
    'DuneAnalytics',  # Dune Analytics
    'nansen_ai',  # Nansen

    # Additional VCs
    'dragonfly_xyz',  # Dragonfly
    'polychain',  # Polychain
    'multicoincap',  # Multicoin

    # More Security Researchers
    'ret2basic',  # Security researcher
    '0xOwenThurm',  # Security auditor
    '0xVolodya',  # Security researcher
    'RareSkills_io',  # Smart contract education/security

    # Total: 90+ accounts
]

print(f"Following {len(accounts_to_follow)} security accounts...\n")

followed_count = 0
failed_count = 0
already_following = 0

for username in accounts_to_follow:
    try:
        # Get user ID from username
        user = client.get_user(username=username)

        if user.data:
            user_id = user.data.id

            # Follow the user
            try:
                client.follow_user(user_id)
                followed_count += 1
                print(f"✓ Followed @{username}")

                # Rate limiting - Twitter allows ~400 follows/day, ~15/15min window
                # Wait 4 seconds between follows to be safe
                time.sleep(4)

            except tweepy.errors.Forbidden as e:
                if 'already' in str(e).lower():
                    already_following += 1
                    print(f"  Already following @{username}")
                else:
                    failed_count += 1
                    print(f"✗ Failed to follow @{username}: {e}")

    except Exception as e:
        failed_count += 1
        print(f"✗ Error with @{username}: {e}")

    # Every 15 follows, take a longer break (rate limit safety)
    if followed_count % 15 == 0 and followed_count > 0:
        print(f"\n  Rate limit safety: Pausing for 60 seconds...\n")
        time.sleep(60)

print(f"\n{'='*60}")
print(f"RESULTS:")
print(f"{'='*60}")
print(f"Successfully followed: {followed_count}")
print(f"Already following: {already_following}")
print(f"Failed: {failed_count}")
print(f"Total attempted: {len(accounts_to_follow)}")
print(f"{'='*60}\n")

print("Note: Twitter has daily limits (~400 follows/day). If you hit the limit,")
print("run this script again tomorrow to continue following the remaining accounts.")
