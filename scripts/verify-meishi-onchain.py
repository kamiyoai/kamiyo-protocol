#!/usr/bin/env python3
"""
Verify Meishi on-chain program bytes against a local build artifact.

This is a production-safety guard: you should be able to prove
what is deployed matches what you built/reviewed.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import struct
import sys
import urllib.request
from pathlib import Path


ALPHABET = b"123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"


def b58encode(b: bytes) -> str:
    n = int.from_bytes(b, "big")
    res = bytearray()
    while n > 0:
        n, r = divmod(n, 58)
        res.append(ALPHABET[r])
    pad = 0
    for c in b:
        if c == 0:
            pad += 1
        else:
            break
    res.extend(ALPHABET[:1] * pad)
    return bytes(reversed(res)).decode("ascii")


def rpc(url: str, method: str, params: list) -> dict:
    req = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
    resp = json.loads(
        urllib.request.urlopen(
            urllib.request.Request(url, data=req, headers={"Content-Type": "application/json"})
        ).read()
    )
    if "error" in resp:
        raise RuntimeError(resp["error"])
    return resp["result"]


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--url",
        default="https://api.mainnet-beta.solana.com",
        help="Solana JSON-RPC URL (default: mainnet).",
    )
    parser.add_argument(
        "--program",
        default="6uejE3hDz3ZNHW7P4uHQEHS6fHAQ4vLJg7rx4VBYwpyK",
        help="Meishi program id.",
    )
    parser.add_argument(
        "--artifact",
        default="kamiyo-protocol/target/deploy/meishi.so",
        help="Local .so artifact path to compare against.",
    )
    args = parser.parse_args()

    program = args.program
    url = args.url

    # Program account -> ProgramData address.
    acc = rpc(url, "getAccountInfo", [program, {"encoding": "base64"}])["value"]
    if not acc:
        print(f"program_missing {program}")
        return 2

    owner = acc["owner"]
    executable = bool(acc["executable"])
    prog_data = base64.b64decode(acc["data"][0])
    tag = struct.unpack("<I", prog_data[:4])[0]
    if tag != 2:
        print(f"unexpected_program_tag {tag}")
        return 2
    programdata_addr = b58encode(prog_data[4:36])

    # ProgramData -> header + program bytes.
    pd_acc = rpc(url, "getAccountInfo", [programdata_addr, {"encoding": "base64"}])["value"]
    if not pd_acc:
        print(f"programdata_missing {programdata_addr}")
        return 2

    pd = base64.b64decode(pd_acc["data"][0])
    ptag = struct.unpack("<I", pd[:4])[0]
    if ptag != 3:
        print(f"unexpected_programdata_tag {ptag}")
        return 2

    last_slot = struct.unpack("<Q", pd[4:12])[0]
    opt = pd[12]
    upgrade_authority = None
    if opt == 0:
        header_len = 13
    elif opt == 1:
        header_len = 45
        upgrade_authority = b58encode(pd[13:45])
    else:
        print(f"unexpected_upgrade_authority_tag {opt}")
        return 2

    program_bytes = pd[header_len:]
    onchain_sha = sha256_hex(program_bytes)
    onchain_len = len(program_bytes)

    # Optional: get deploy time (may be null).
    block_time = None
    try:
        block_time = rpc(url, "getBlockTime", [last_slot])
    except Exception:
        block_time = None

    artifact_path = Path(args.artifact)
    local_sha = None
    local_len = None
    if artifact_path.exists():
        blob = artifact_path.read_bytes()
        local_sha = sha256_hex(blob)
        local_len = len(blob)

    print(f"url {url}")
    print(f"program {program}")
    print(f"owner {owner}")
    print(f"executable {str(executable).lower()}")
    print(f"programdata {programdata_addr}")
    print(f"last_deploy_slot {last_slot}")
    print(f"last_deploy_blocktime {block_time}")
    print(f"upgrade_authority {upgrade_authority}")
    print(f"onchain_bytes {onchain_len}")
    print(f"onchain_sha256 {onchain_sha}")

    if local_sha is None:
        print("local_artifact_missing true")
        return 0

    print(f"local_bytes {local_len}")
    print(f"local_sha256 {local_sha}")
    match = local_sha == onchain_sha
    print(f"match {str(match).lower()}")
    return 0 if match else 2


if __name__ == "__main__":
    raise SystemExit(main())

