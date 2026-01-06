"""Multi-chain USDC payment verification (Base, Ethereum, Solana)."""

import logging
from typing import Optional
from decimal import Decimal
from dataclasses import dataclass
from web3 import Web3
from web3.exceptions import TransactionNotFound

from .config import get_x402_config

logger = logging.getLogger(__name__)

USDC_DECIMALS = Decimal("1000000")

# Transfer event topic (keccak256("Transfer(address,address,uint256)"))
TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"


@dataclass
class VerificationResult:
    is_valid: bool
    tx_hash: str
    chain: str
    amount_usdc: Decimal
    from_address: str
    to_address: str
    confirmations: int
    block_number: int
    risk_score: float
    error_message: Optional[str] = None


def _invalid_result(
    tx_hash: str,
    chain: str,
    error: str,
    confirmations: int = 0,
    block_number: int = 0,
    risk_score: float = 1.0,
) -> VerificationResult:
    return VerificationResult(
        is_valid=False,
        tx_hash=tx_hash,
        chain=chain,
        amount_usdc=Decimal("0"),
        from_address="",
        to_address="",
        confirmations=confirmations,
        block_number=block_number,
        risk_score=risk_score,
        error_message=error,
    )


class PaymentVerifier:
    """Multi-chain USDC payment verifier."""

    SUPPORTED_CHAINS = ["base", "ethereum", "solana", "base-sepolia", "solana-devnet"]

    def __init__(self):
        self.config = get_x402_config()
        self._web3_clients = {}

    def _get_web3(self, chain: str) -> Web3:
        if chain not in self._web3_clients:
            rpc_url = self.config.get_rpc_url(chain)
            self._web3_clients[chain] = Web3(Web3.HTTPProvider(rpc_url))
        return self._web3_clients[chain]

    async def verify_payment(
        self, tx_hash: str, chain: str, expected_amount: Optional[Decimal] = None
    ) -> VerificationResult:
        try:
            if chain in ["base", "base-sepolia", "ethereum"]:
                return await self._verify_evm(tx_hash, chain, expected_amount)
            elif chain in ["solana", "solana-devnet"]:
                return await self._verify_solana(tx_hash, chain, expected_amount)
            else:
                return _invalid_result(tx_hash, chain, f"Unsupported chain: {chain}")
        except Exception as e:
            logger.error(f"Verification error: {e}")
            return _invalid_result(tx_hash, chain, str(e))

    async def _verify_evm(
        self, tx_hash: str, chain: str, expected_amount: Optional[Decimal] = None
    ) -> VerificationResult:
        w3 = self._get_web3(chain)

        try:
            receipt = w3.eth.get_transaction_receipt(tx_hash)
        except TransactionNotFound:
            return _invalid_result(tx_hash, chain, "Transaction not found")

        if receipt["status"] != 1:
            return _invalid_result(
                tx_hash, chain, "Transaction failed", block_number=receipt["blockNumber"]
            )

        current_block = w3.eth.block_number
        confirmations = current_block - receipt["blockNumber"]
        required = self.config.get_required_confirmations(chain)

        if confirmations < required:
            return _invalid_result(
                tx_hash,
                chain,
                f"Insufficient confirmations: {confirmations}/{required}",
                confirmations=confirmations,
                block_number=receipt["blockNumber"],
                risk_score=0.5,
            )

        usdc_contract = self.config.get_usdc_contract(chain).lower()
        payment_address = self.config.get_payment_address(chain).lower()

        transfer = None
        for log in receipt["logs"]:
            if log["address"].lower() != usdc_contract:
                continue
            if len(log["topics"]) < 3:
                continue

            to_addr = "0x" + log["topics"][2].hex()[-40:]
            if to_addr.lower() == payment_address:
                from_addr = "0x" + log["topics"][1].hex()[-40:]
                value = int(log["data"].hex(), 16)
                transfer = {"from": from_addr, "to": to_addr, "value": value}
                break

        if not transfer:
            return _invalid_result(
                tx_hash,
                chain,
                "No USDC transfer to payment address",
                confirmations=confirmations,
                block_number=receipt["blockNumber"],
            )

        amount_usdc = Decimal(transfer["value"]) / USDC_DECIMALS

        if expected_amount and amount_usdc < expected_amount:
            return VerificationResult(
                is_valid=False,
                tx_hash=tx_hash,
                chain=chain,
                amount_usdc=amount_usdc,
                from_address=transfer["from"],
                to_address=transfer["to"],
                confirmations=confirmations,
                block_number=receipt["blockNumber"],
                risk_score=0.7,
                error_message=f"Amount {amount_usdc} < expected {expected_amount}",
            )

        risk_score = self._calc_risk(amount_usdc, confirmations, chain)

        return VerificationResult(
            is_valid=True,
            tx_hash=tx_hash,
            chain=chain,
            amount_usdc=amount_usdc,
            from_address=transfer["from"],
            to_address=transfer["to"],
            confirmations=confirmations,
            block_number=receipt["blockNumber"],
            risk_score=risk_score,
        )

    async def _verify_solana(
        self, tx_hash: str, chain: str, expected_amount: Optional[Decimal] = None
    ) -> VerificationResult:
        try:
            from solana.rpc.async_api import AsyncClient
        except ImportError:
            return _invalid_result(tx_hash, chain, "Solana SDK not installed")

        try:
            rpc_url = self.config.get_rpc_url(chain)
            async with AsyncClient(rpc_url) as client:
                tx_resp = await client.get_transaction(
                    tx_hash, encoding="jsonParsed", max_supported_transaction_version=0
                )

                if not tx_resp.value:
                    return _invalid_result(tx_hash, chain, "Transaction not found")

                tx = tx_resp.value
                slot = tx.slot

                slot_resp = await client.get_slot()
                confirmations = slot_resp.value - slot

                if confirmations < self.config.solana_confirmations:
                    return _invalid_result(
                        tx_hash,
                        chain,
                        f"Insufficient confirmations: {confirmations}",
                        confirmations=confirmations,
                        block_number=slot,
                        risk_score=0.5,
                    )

                payment_address = self.config.solana_payment_address
                amount_usdc = Decimal("0")
                from_addr = ""
                to_addr = ""

                meta = tx.transaction.meta
                if meta and hasattr(meta, "inner_instructions"):
                    for inner in meta.inner_instructions:
                        for ix in inner.instructions:
                            if hasattr(ix, "parsed"):
                                parsed = ix.parsed
                                if parsed.get("type") == "transfer":
                                    info = parsed.get("info", {})
                                    if info.get("destination") == payment_address:
                                        amount = int(info.get("amount", 0))
                                        amount_usdc = Decimal(amount) / USDC_DECIMALS
                                        from_addr = info.get("source", "")
                                        to_addr = info.get("destination", "")
                                        break

                if amount_usdc == 0:
                    return _invalid_result(
                        tx_hash,
                        chain,
                        "No USDC transfer found",
                        confirmations=confirmations,
                        block_number=slot,
                    )

                if expected_amount and amount_usdc < expected_amount:
                    return VerificationResult(
                        is_valid=False,
                        tx_hash=tx_hash,
                        chain=chain,
                        amount_usdc=amount_usdc,
                        from_address=from_addr,
                        to_address=to_addr,
                        confirmations=confirmations,
                        block_number=slot,
                        risk_score=0.7,
                        error_message=f"Amount {amount_usdc} < expected {expected_amount}",
                    )

                risk_score = self._calc_risk(amount_usdc, confirmations, chain)

                return VerificationResult(
                    is_valid=True,
                    tx_hash=tx_hash,
                    chain=chain,
                    amount_usdc=amount_usdc,
                    from_address=from_addr,
                    to_address=to_addr,
                    confirmations=confirmations,
                    block_number=slot,
                    risk_score=risk_score,
                )

        except Exception as e:
            logger.error(f"Solana verification error: {e}")
            return _invalid_result(tx_hash, chain, str(e))

    def _calc_risk(self, amount: Decimal, confirmations: int, chain: str) -> float:
        score = 0.1
        required = self.config.get_required_confirmations(chain)

        if confirmations >= required * 3:
            score -= 0.05
        elif confirmations >= required * 2:
            score -= 0.02

        if amount > 100:
            score += 0.1
        elif amount > 10:
            score += 0.05

        if chain == "ethereum":
            score -= 0.02
        elif chain == "solana":
            score += 0.02

        return max(0.0, min(1.0, score))

    def get_supported_chains(self) -> list:
        return self.SUPPORTED_CHAINS


payment_verifier = PaymentVerifier()
