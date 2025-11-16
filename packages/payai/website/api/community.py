# -*- coding: utf-8 -*-
"""
Community Submission System
Allows users to submit exploits with bounty rewards for verified submissions
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from database import get_db

router = APIRouter(prefix="/community", tags=["Community"])


# Models
class ExploitSubmission(BaseModel):
    """User exploit submission"""
    tx_hash: str = Field(..., description="Transaction hash on blockchain")
    chain: str = Field(..., description="Blockchain name")
    protocol: str = Field(..., description="Protocol name")
    amount_usd: Optional[float] = Field(None, description="Estimated loss in USD")
    description: str = Field(..., description="Description of the exploit")
    submitter_wallet: str = Field(..., description="Wallet address for bounty payment")
    evidence_url: Optional[str] = Field(None, description="URL to screenshot/proof")


class SubmissionResponse(BaseModel):
    """Response to submission"""
    submission_id: int
    status: str
    message: str
    bounty_amount: Optional[float] = None


class UserReputation(BaseModel):
    """User reputation score"""
    wallet_address: str
    verified_submissions: int
    false_submissions: int
    reputation_score: int
    total_bounties_earned: float


# Database schema additions needed:
# CREATE TABLE community_submissions (
#     id INTEGER PRIMARY KEY AUTOINCREMENT,
#     tx_hash TEXT NOT NULL,
#     chain TEXT NOT NULL,
#     protocol TEXT NOT NULL,
#     amount_usd REAL,
#     description TEXT,
#     submitter_wallet TEXT NOT NULL,
#     evidence_url TEXT,
#     status TEXT DEFAULT 'pending',  # pending, verified, rejected
#     bounty_paid REAL DEFAULT 0,
#     created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
#     reviewed_at DATETIME,
#     UNIQUE(tx_hash, submitter_wallet)
# );
#
# CREATE TABLE user_reputation (
#     wallet_address TEXT PRIMARY KEY,
#     verified_count INTEGER DEFAULT 0,
#     false_count INTEGER DEFAULT 0,
#     total_bounties REAL DEFAULT 0,
#     created_at DATETIME DEFAULT CURRENT_TIMESTAMP
# );


class CommunitySystem:
    """Manages community submissions and bounties"""

    def __init__(self):
        self.db = get_db()

        # Bounty amounts based on submission quality
        self.bounty_tiers = {
            'first_report': 50.0,      # First to report (verified)
            'verified': 20.0,          # Verified submission
            'duplicate': 5.0,          # Valid but duplicate
            'false': -10.0             # False report (penalty)
        }

    def submit_exploit(self, submission: ExploitSubmission) -> SubmissionResponse:
        """
        Process user submission

        Workflow:
        1. Validate tx_hash exists on blockchain
        2. Check if already in database (duplicate)
        3. Queue for manual review
        4. Calculate potential bounty
        """

        # Validate transaction exists
        if not self._validate_transaction(submission.tx_hash, submission.chain):
            return SubmissionResponse(
                submission_id=0,
                status="rejected",
                message="Transaction not found on blockchain",
                bounty_amount=0
            )

        # Check if already reported
        existing = self.db.get_exploit_by_tx_hash(submission.tx_hash)

        if existing:
            # Duplicate submission
            submission_id = self._record_submission(submission, 'duplicate')

            return SubmissionResponse(
                submission_id=submission_id,
                status="duplicate",
                message="This exploit was already reported. Small bounty awarded for verification.",
                bounty_amount=self.bounty_tiers['duplicate']
            )

        # New submission - queue for review
        submission_id = self._record_submission(submission, 'pending')

        return SubmissionResponse(
            submission_id=submission_id,
            status="pending",
            message="Submission received! Under review. Bounty will be paid if verified.",
            bounty_amount=self.bounty_tiers['verified']  # Potential bounty
        )

    def _validate_transaction(self, tx_hash: str, chain: str) -> bool:
        """
        Validate transaction exists on blockchain

        In production: Use Web3 to check actual blockchain
        """

        # Basic format validation
        if not tx_hash.startswith('0x') and not tx_hash.startswith('generated-'):
            return False

        if len(tx_hash) != 66 and not tx_hash.startswith('generated-'):
            return False

        # In production, add real blockchain verification:
        # from web3 import Web3
        # w3 = Web3(Web3.HTTPProvider(provider_uri))
        # try:
        #     tx = w3.eth.get_transaction(tx_hash)
        #     return tx is not None
        # except:
        #     return False

        return True  # Simplified for now

    def _record_submission(self, submission: ExploitSubmission, status: str) -> int:
        """Record submission in database"""

        # In production, use actual database table:
        # cursor.execute("""
        #     INSERT INTO community_submissions
        #     (tx_hash, chain, protocol, amount_usd, description, submitter_wallet, evidence_url, status)
        #     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        # """, (submission.tx_hash, submission.chain, ...))

        # For now, return mock ID
        return 1

    def get_user_reputation(self, wallet_address: str) -> UserReputation:
        """Get user's reputation score"""

        # In production, query from user_reputation table
        # For now, return mock data

        return UserReputation(
            wallet_address=wallet_address,
            verified_submissions=0,
            false_submissions=0,
            reputation_score=0,
            total_bounties_earned=0.0
        )

    def calculate_reputation_score(self, verified: int, false: int) -> int:
        """
        Calculate reputation score

        Formula: (verified * 10) - (false * 5)
        """
        return (verified * 10) - (false * 5)

    def verify_submission(self, submission_id: int, is_valid: bool, is_first: bool = False):
        """
        Verify submission (admin function)

        Args:
            submission_id: Submission to verify
            is_valid: Whether submission is valid
            is_first: Whether this was first report
        """

        # Get submission details
        # submission = get_submission(submission_id)

        if is_valid:
            # Determine bounty amount
            if is_first:
                bounty = self.bounty_tiers['first_report']
            else:
                bounty = self.bounty_tiers['verified']

            # Pay bounty (integrate with payment provider)
            # self._pay_bounty(submission.submitter_wallet, bounty)

            # Update user reputation
            # self._update_reputation(submission.submitter_wallet, verified=True)

            # Insert into main exploits table
            # self.db.insert_exploit(...)

            pass
        else:
            # False report - penalize
            # self._update_reputation(submission.submitter_wallet, verified=False)
            pass


# FastAPI endpoints
community_system = CommunitySystem()


@router.post("/submit", response_model=SubmissionResponse)
async def submit_exploit(submission: ExploitSubmission):
    """
    Submit a new exploit for verification

    **Bounty Structure:**
    - First report (verified): $50 USDC
    - Verified submission: $20 USDC
    - Valid duplicate: $5 USDC
    - False report: -10 reputation points

    **Requirements:**
    - Valid transaction hash
    - Evidence (screenshot, link, etc.)
    - Wallet address for payment
    """
    try:
        return community_system.submit_exploit(submission)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/reputation/{wallet_address}", response_model=UserReputation)
async def get_reputation(wallet_address: str):
    """
    Get user reputation score

    **Reputation Formula:**
    - +10 points per verified submission
    - -5 points per false submission
    """
    try:
        return community_system.get_user_reputation(wallet_address)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/leaderboard")
async def get_leaderboard(limit: int = 10):
    """
    Get top contributors by reputation

    Returns list of users with most verified submissions
    """
    # In production, query database for top users
    return {
        "leaderboard": [
            {
                "rank": 1,
                "wallet": "0x1234...5678",
                "reputation_score": 150,
                "verified_submissions": 15,
                "total_bounties": 300.0
            }
        ]
    }


# Test function
if __name__ == '__main__':
    print("Community Submission System")
    print("\n=== Bounty Structure ===")

    system = CommunitySystem()

    for tier, amount in system.bounty_tiers.items():
        print(f"{tier}: ${amount}")

    print("\n=== Example Submission ===")

    example = ExploitSubmission(
        tx_hash="0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        chain="Ethereum",
        protocol="Example Protocol",
        amount_usd=1000000.0,
        description="Flash loan exploit on Example Protocol",
        submitter_wallet="0x1234567890123456789012345678901234567890",
        evidence_url="https://example.com/proof"
    )

    response = system.submit_exploit(example)

    print(f"Status: {response.status}")
    print(f"Message: {response.message}")
    print(f"Potential bounty: ${response.bounty_amount}")

    print("\n=== User Reputation ===")

    rep = system.get_user_reputation(example.submitter_wallet)
    print(f"Score: {rep.reputation_score}")
    print(f"Verified: {rep.verified_submissions}")
    print(f"Total bounties: ${rep.total_bounties_earned}")
