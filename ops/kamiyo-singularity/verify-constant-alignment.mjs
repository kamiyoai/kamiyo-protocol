#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function read(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function mustMatch(source, regex, label) {
  const match = source.match(regex);
  if (!match) {
    throw new Error(`missing ${label}`);
  }
  return match[1];
}

function normalizeBps(value) {
  return Number(value.replace(/_/g, "").trim());
}

const marketCreate = read("programs/kamiyo-singularity-market/src/instructions/create_market.rs");
const orderbookSettle = read("programs/kamiyo-singularity-orderbook/src/instructions/settle_trade.rs");
const marketState = read("programs/kamiyo-singularity-market/src/state/market.rs");
const withdrawFees = read("programs/kamiyo-singularity-market/src/instructions/withdraw_fees.rs");
const appConstants = read("apps/kamiyo-singularity/src/lib/constants.ts");

const marketAuthority = mustMatch(
  marketCreate,
  /KAMIYO_FEE_POOL_AUTHORITY:\s*Pubkey\s*=\s*pubkey!\("([A-Za-z0-9]+)"\)/,
  "market fee pool authority"
);

const orderbookAuthority = mustMatch(
  orderbookSettle,
  /KAMIYO_FEE_POOL_AUTHORITY:\s*Pubkey\s*=\s*pubkey!\("([A-Za-z0-9]+)"\)/,
  "orderbook fee pool authority"
);

const appAuthority = mustMatch(
  appConstants,
  /KAMIYO_STAKING_POOL_ADDRESS\s*=\s*['"]([A-Za-z0-9]+)['"]/, 
  "app staking pool address"
);

if (marketAuthority !== orderbookAuthority || marketAuthority !== appAuthority) {
  throw new Error(
    `pool authority mismatch: market=${marketAuthority}, orderbook=${orderbookAuthority}, app=${appAuthority}`
  );
}

const rustFeeBpsRaw = mustMatch(
  orderbookSettle,
  /SINGULARITY_TRADING_FEE_BPS:\s*u64\s*=\s*([0-9_]+)/,
  "rust trading fee bps"
);

const appFeeBpsRaw = mustMatch(
  appConstants,
  /SINGULARITY_TRADING_FEE_BPS\s*=\s*([0-9_]+)/,
  "app trading fee bps"
);

const rustFeeBps = normalizeBps(rustFeeBpsRaw);
const appFeeBps = normalizeBps(appFeeBpsRaw);

if (rustFeeBps !== appFeeBps) {
  throw new Error(`trading fee bps mismatch: rust=${rustFeeBps}, app=${appFeeBps}`);
}

if (rustFeeBps !== 50) {
  throw new Error(`unexpected trading fee bps: expected 50, got ${rustFeeBps}`);
}

const protocolShareRaw = mustMatch(
  marketState,
  /DEFAULT_PROTOCOL_FEE_SHARE_BPS:\s*u16\s*=\s*([0-9_]+)/,
  "default protocol fee share"
);
const protocolShare = normalizeBps(protocolShareRaw);
if (protocolShare !== 10_000) {
  throw new Error(`unexpected protocol fee share: expected 10000, got ${protocolShare}`);
}

if (!withdrawFees.includes("CreatorFeeWithdrawalDisabled")) {
  throw new Error("creator fee withdrawal guard missing");
}

console.log("constant alignment passed");
