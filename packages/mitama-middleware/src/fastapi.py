"""
HTTP 402 Payment Required middleware for FastAPI

Implements RFC 9110 Section 15.5.3 - 402 Payment Required
https://httpwg.org/specs/rfc9110.html#status.402

Usage:
```python
from fastapi import FastAPI, Request
from Naori_middleware import Naori_payment_middleware, X402Config

app = FastAPI()

config = X402Config(
    realm="my-api",
    program_id="AFmBBw7kbrnwhhzYadAMCMh4BBBZcZdS3P7Z6vpsqsSR",
    rpc_url="https://api.devnet.solana.com",
    price=0.001,
    quality_guarantee=True
)

app.middleware("http")(Naori_payment_middleware(config))
```
"""

from dataclasses import dataclass
from typing import Optional, Callable
from fastapi import Request, Response
from fastapi.responses import JSONResponse
from solders.pubkey import Pubkey
import httpx


@dataclass
class X402Config:
    """Configuration for Naori payment middleware"""
    realm: str
    program_id: str
    rpc_url: str
    price: float
    quality_guarantee: bool = False


async def verify_escrow(escrow_pubkey: str, program_id: str, rpc_url: str) -> bool:
    """Verify escrow account exists and is owned by program"""
    try:
        pubkey = Pubkey.from_string(escrow_pubkey)

        async with httpx.AsyncClient() as client:
            response = await client.post(
                rpc_url,
                json={
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "getAccountInfo",
                    "params": [
                        str(pubkey),
                        {"encoding": "jsonParsed"}
                    ]
                }
            )

            data = response.json()

            if not data.get("result") or not data["result"].get("value"):
                return False

            account = data["result"]["value"]
            owner = account.get("owner")

            return owner == program_id

    except Exception:
        return False


def Naori_payment_middleware(config: X402Config) -> Callable:
    """
    Create HTTP 402 payment middleware for FastAPI

    Returns a middleware function that checks for payment proof
    in X-Payment-Proof header. If missing, returns 402 status.
    If present, validates escrow and attaches to request state.
    """

    async def middleware(request: Request, call_next):
        payment_proof = request.headers.get("x-payment-proof")

        if not payment_proof:
            return JSONResponse(
                status_code=402,
                headers={
                    "WWW-Authenticate": f'Solana realm="{config.realm}"',
                    "X-Escrow-Address": "Required",
                    "X-Price": f"{config.price} SOL",
                    "X-Quality-Guarantee": "true" if config.quality_guarantee else "false",
                    "X-Program-Id": config.program_id
                },
                content={
                    "error": "Payment Required",
                    "message": "This API requires payment via Solana escrow",
                    "amount": config.price,
                    "currency": "SOL",
                    "escrow_program": config.program_id,
                    "quality_guarantee": config.quality_guarantee,
                    "payment_flow": {
                        "step_1": "Create escrow with specified amount",
                        "step_2": "Retry request with X-Payment-Proof header",
                        "step_3": "Receive data with quality score",
                        "step_4": "Automatic dispute if quality < threshold"
                    }
                }
            )

        is_valid = await verify_escrow(
            payment_proof,
            config.program_id,
            config.rpc_url
        )

        if not is_valid:
            return JSONResponse(
                status_code=403,
                content={
                    "error": "Invalid Payment",
                    "message": "Escrow account not found or invalid",
                    "provided": payment_proof
                }
            )

        request.state.escrow = {
            "pubkey": payment_proof,
            "amount": config.price,
            "program_id": config.program_id
        }

        response = await call_next(request)
        return response

    return middleware


def get_escrow_info(request: Request) -> Optional[dict]:
    """Extract escrow information from request state"""
    return getattr(request.state, "escrow", None)
