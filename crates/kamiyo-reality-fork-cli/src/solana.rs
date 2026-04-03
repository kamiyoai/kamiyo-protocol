use std::fmt;
use std::str::FromStr;

use anyhow::{bail, Context, Result};
use borsh::BorshDeserialize;
use curve25519_dalek::edwards::CompressedEdwardsY;
use serde::Serialize;
use sha2::{Digest, Sha256};

const KAMIYO_PROGRAM_ID: &str = "3ZYPtFBF8rfRYvLi5QUnU4teHPzFEpHuz6dUZry9FRKr";
const SYSTEM_PROGRAM: &str = "11111111111111111111111111111111";
const SOL_PER_LAMPORT: f64 = 1e-9;

// ── Pubkey ──

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Pubkey(pub [u8; 32]);


impl fmt::Display for Pubkey {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", bs58::encode(&self.0).into_string())
    }
}

impl FromStr for Pubkey {
    type Err = anyhow::Error;
    fn from_str(s: &str) -> Result<Self> {
        let bytes = bs58::decode(s)
            .into_vec()
            .context("invalid base58 address")?;
        let arr: [u8; 32] = bytes
            .try_into()
            .map_err(|v: Vec<u8>| anyhow::anyhow!("invalid pubkey length: {}", v.len()))?;
        Ok(Self(arr))
    }
}

impl Serialize for Pubkey {
    fn serialize<S: serde::Serializer>(&self, s: S) -> std::result::Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

// ── PDA derivation ──

fn program_id() -> &'static Pubkey {
    static PID: once_cell::sync::Lazy<Pubkey> =
        once_cell::sync::Lazy::new(|| KAMIYO_PROGRAM_ID.parse().expect("hardcoded program ID"));
    &PID
}

fn system_program_id() -> &'static Pubkey {
    static SYS: once_cell::sync::Lazy<Pubkey> =
        once_cell::sync::Lazy::new(|| SYSTEM_PROGRAM.parse().expect("hardcoded system program"));
    &SYS
}

fn find_program_address(seeds: &[&[u8]], program_id: &[u8; 32]) -> Result<(Pubkey, u8)> {
    for bump in (0u8..=255).rev() {
        let mut hasher = Sha256::new();
        for seed in seeds {
            hasher.update(seed);
        }
        hasher.update([bump]);
        hasher.update(program_id);
        hasher.update(b"ProgramDerivedAddress");
        let hash: [u8; 32] = hasher.finalize().into();
        if CompressedEdwardsY(hash).decompress().is_none() {
            return Ok((Pubkey(hash), bump));
        }
    }
    bail!("could not derive PDA: no valid bump found")
}

pub fn agent_pda(owner: &Pubkey) -> Result<(Pubkey, u8)> {
    find_program_address(&[b"agent", &owner.0], &program_id().0)
}

// ── Anchor discriminators ──

fn discriminator(prefix: &str, name: &str) -> [u8; 8] {
    let hash = Sha256::digest(format!("{prefix}:{name}").as_bytes());
    // SHA256 always produces 32 bytes; slicing to 8 is infallible
    let mut disc = [0u8; 8];
    disc.copy_from_slice(&hash[..8]);
    disc
}

fn anchor_account_discriminator(name: &str) -> [u8; 8] {
    discriminator("account", name)
}

fn anchor_instruction_discriminator(name: &str) -> [u8; 8] {
    discriminator("global", name)
}

// ── Account types ──

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum AgentType {
    Trading,
    Service,
    Oracle,
    Custom,
}

impl AgentType {
    pub fn from_u8(v: u8) -> Self {
        match v {
            0 => Self::Trading,
            1 => Self::Service,
            2 => Self::Oracle,
            _ => Self::Custom,
        }
    }

    pub fn to_u8(self) -> u8 {
        match self {
            Self::Trading => 0,
            Self::Service => 1,
            Self::Oracle => 2,
            Self::Custom => 3,
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::Trading => "Trading",
            Self::Service => "Service",
            Self::Oracle => "Oracle",
            Self::Custom => "Custom",
        }
    }
}

impl FromStr for AgentType {
    type Err = anyhow::Error;
    fn from_str(s: &str) -> Result<Self> {
        match s.to_lowercase().as_str() {
            "trading" | "t" => Ok(Self::Trading),
            "service" | "s" => Ok(Self::Service),
            "oracle" | "o" => Ok(Self::Oracle),
            "custom" | "c" => Ok(Self::Custom),
            _ => bail!("invalid agent type: {s} (expected: trading, service, oracle, custom)"),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum EscrowStatus {
    Active,
    Released,
    Disputed,
    Resolved,
}

impl EscrowStatus {
    fn from_u8(v: u8) -> Self {
        match v {
            0 => Self::Active,
            1 => Self::Released,
            2 => Self::Disputed,
            _ => Self::Resolved,
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::Active => "Active",
            Self::Released => "Released",
            Self::Disputed => "Disputed",
            Self::Resolved => "Resolved",
        }
    }
}

#[derive(Debug, Serialize)]
pub struct AgentIdentity {
    pub owner: Pubkey,
    pub name: String,
    pub agent_type: AgentType,
    pub reputation: u64,
    pub stake_amount: u64,
    pub is_active: bool,
    pub created_at: i64,
    pub last_active: i64,
    pub total_escrows: u64,
    pub successful_escrows: u64,
    pub disputed_escrows: u64,
    pub pda: Pubkey,
}

#[derive(Debug, Serialize)]
pub struct EscrowInfo {
    pub address: Pubkey,
    pub agent: Pubkey,
    pub api: Pubkey,
    pub amount: u64,
    pub status: EscrowStatus,
    pub created_at: i64,
    pub expires_at: i64,
    pub transaction_id: String,
    pub quality_score: Option<u8>,
    pub refund_percentage: Option<u8>,
    pub token_mint: Option<Pubkey>,
}

// ── Borsh raw structs ──

#[derive(BorshDeserialize)]
struct AgentIdentityRaw {
    owner: [u8; 32],
    name: String,
    agent_type: u8,
    reputation: u64,
    stake_amount: u64,
    is_active: bool,
    created_at: i64,
    last_active: i64,
    total_escrows: u64,
    successful_escrows: u64,
    disputed_escrows: u64,
    _bump: u8,
}

#[derive(BorshDeserialize)]
struct OracleSubmissionRaw {
    _oracle: [u8; 32],
    _quality_score: u8,
    _submitted_at: i64,
}

#[derive(BorshDeserialize)]
struct OracleCommitmentRaw {
    _oracle: [u8; 32],
    _commitment_hash: [u8; 32],
    _committed_at: i64,
}

#[derive(BorshDeserialize)]
struct EscrowRaw {
    agent: [u8; 32],
    api: [u8; 32],
    amount: u64,
    status: u8,
    created_at: i64,
    expires_at: i64,
    transaction_id: String,
    _bump: u8,
    quality_score: Option<u8>,
    refund_percentage: Option<u8>,
    _oracle_submissions: Vec<OracleSubmissionRaw>,
    _oracle_commitments: Vec<OracleCommitmentRaw>,
    token_mint: Option<[u8; 32]>,
    _escrow_token_account: Option<[u8; 32]>,
    _token_decimals: u8,
    _disputed_at: Option<i64>,
    _commit_phase_ends_at: Option<i64>,
}

fn deserialize_anchor_account<T: BorshDeserialize>(
    data: &[u8],
    expected_disc: &[u8; 8],
) -> Result<T> {
    if data.len() < 8 {
        bail!("account data too short ({} bytes)", data.len());
    }
    if &data[..8] != expected_disc {
        bail!(
            "account discriminator mismatch: expected {:?}, got {:?}",
            expected_disc,
            &data[..8]
        );
    }
    T::try_from_slice(&data[8..]).context("failed to deserialize account data")
}

// ── RPC client ──

pub struct SolanaRpc {
    url: String,
}

impl SolanaRpc {
    pub fn new(cluster: &str) -> Self {
        let url = match cluster {
            "devnet" | "d" => "https://api.devnet.solana.com",
            "mainnet" | "mainnet-beta" | "m" => "https://api.mainnet-beta.solana.com",
            "localnet" | "localhost" | "l" => "http://127.0.0.1:8899",
            "testnet" | "t" => "https://api.testnet.solana.com",
            url => url,
        };
        Self {
            url: url.to_string(),
        }
    }

    fn rpc_call(&self, method: &str, params: serde_json::Value) -> Result<serde_json::Value> {
        let body = serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": method,
            "params": params,
        });

        let resp: serde_json::Value = ureq::post(&self.url)
            .set("Content-Type", "application/json")
            .send_json(body)
            .context("RPC request failed")?
            .into_json()
            .context("invalid JSON response")?;

        if let Some(error) = resp.get("error") {
            bail!("RPC error: {}", error);
        }

        resp.get("result")
            .cloned()
            .context("missing 'result' in RPC response")
    }

    fn get_account_data(&self, address: &Pubkey) -> Result<Option<Vec<u8>>> {
        let result = self.rpc_call(
            "getAccountInfo",
            serde_json::json!([address.to_string(), { "encoding": "base64" }]),
        )?;

        let value = match result.get("value") {
            Some(v) if !v.is_null() => v,
            _ => return Ok(None),
        };

        let data_arr = value
            .get("data")
            .and_then(|d| d.as_array())
            .context("invalid data field in account")?;

        let encoded = data_arr
            .first()
            .and_then(|v| v.as_str())
            .context("missing base64 data")?;

        use base64::Engine;
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(encoded)
            .context("invalid base64 in account data")?;

        Ok(Some(bytes))
    }

    fn get_program_accounts_raw(
        &self,
        program: &str,
        filters: Vec<serde_json::Value>,
    ) -> Result<Vec<(String, Vec<u8>)>> {
        let result = self.rpc_call(
            "getProgramAccounts",
            serde_json::json!([
                program,
                {
                    "encoding": "base64",
                    "filters": filters,
                }
            ]),
        )?;

        let accounts = result
            .as_array()
            .context("expected array from getProgramAccounts")?;

        use base64::Engine;
        let mut out = Vec::new();
        for entry in accounts {
            let pubkey = entry
                .get("pubkey")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let data_arr = entry
                .get("account")
                .and_then(|a| a.get("data"))
                .and_then(|d| d.as_array())
                .context("invalid account data")?;
            let encoded = data_arr
                .first()
                .and_then(|v| v.as_str())
                .context("missing base64 data")?;
            let bytes = base64::engine::general_purpose::STANDARD
                .decode(encoded)
                .context("invalid base64")?;
            out.push((pubkey, bytes));
        }
        Ok(out)
    }

    pub fn get_agent(&self, owner: &Pubkey) -> Result<AgentIdentity> {
        let (pda, _bump) = agent_pda(owner)?;
        self.get_agent_by_pda(&pda)
    }

    pub fn get_agent_by_pda(&self, pda: &Pubkey) -> Result<AgentIdentity> {
        let data = self
            .get_account_data(pda)?
            .context("agent account not found")?;

        let disc = anchor_account_discriminator("AgentIdentity");
        let raw: AgentIdentityRaw = deserialize_anchor_account(&data, &disc)?;

        Ok(AgentIdentity {
            pda: *pda,
            owner: Pubkey(raw.owner),
            name: raw.name,
            agent_type: AgentType::from_u8(raw.agent_type),
            reputation: raw.reputation,
            stake_amount: raw.stake_amount,
            is_active: raw.is_active,
            created_at: raw.created_at,
            last_active: raw.last_active,
            total_escrows: raw.total_escrows,
            successful_escrows: raw.successful_escrows,
            disputed_escrows: raw.disputed_escrows,
        })
    }

    pub fn get_escrows_for_agent(&self, agent_pda: &Pubkey) -> Result<Vec<EscrowInfo>> {
        let escrow_disc = anchor_account_discriminator("Escrow");
        let disc_b58 = bs58::encode(&escrow_disc).into_string();
        let agent_b58 = agent_pda.to_string();

        let filters = vec![
            serde_json::json!({ "memcmp": { "offset": 0, "bytes": disc_b58 } }),
            serde_json::json!({ "memcmp": { "offset": 8, "bytes": agent_b58 } }),
        ];

        let accounts =
            self.get_program_accounts_raw(KAMIYO_PROGRAM_ID, filters)?;

        let mut escrows = Vec::new();
        for (addr_str, data) in &accounts {
            match deserialize_anchor_account::<EscrowRaw>(data, &escrow_disc) {
                Ok(raw) => {
                    let addr: Pubkey = match addr_str.parse() {
                        Ok(a) => a,
                        Err(_) => continue,
                    };
                    escrows.push(EscrowInfo {
                        address: addr,
                        agent: Pubkey(raw.agent),
                        api: Pubkey(raw.api),
                        amount: raw.amount,
                        status: EscrowStatus::from_u8(raw.status),
                        created_at: raw.created_at,
                        expires_at: raw.expires_at,
                        transaction_id: raw.transaction_id,
                        quality_score: raw.quality_score,
                        refund_percentage: raw.refund_percentage,
                        token_mint: raw.token_mint.map(Pubkey),
                    });
                }
                Err(_) => continue,
            }
        }
        escrows.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        Ok(escrows)
    }

    #[allow(dead_code)]
    pub fn get_balance(&self, address: &Pubkey) -> Result<u64> {
        let result = self.rpc_call("getBalance", serde_json::json!([address.to_string()]))?;
        result
            .get("value")
            .and_then(|v| v.as_u64())
            .context("invalid balance response")
    }

    pub fn get_latest_blockhash(&self) -> Result<[u8; 32]> {
        let result = self.rpc_call(
            "getLatestBlockhash",
            serde_json::json!([{ "commitment": "finalized" }]),
        )?;
        let hash_str = result
            .get("value")
            .and_then(|v| v.get("blockhash"))
            .and_then(|v| v.as_str())
            .context("missing blockhash")?;
        let bytes = bs58::decode(hash_str)
            .into_vec()
            .context("invalid blockhash base58")?;
        let arr: [u8; 32] = bytes
            .try_into()
            .map_err(|_| anyhow::anyhow!("blockhash not 32 bytes"))?;
        Ok(arr)
    }

    pub fn send_raw_transaction(&self, tx_bytes: &[u8]) -> Result<String> {
        use base64::Engine;
        let encoded = base64::engine::general_purpose::STANDARD.encode(tx_bytes);
        let result = self.rpc_call(
            "sendTransaction",
            serde_json::json!([encoded, { "encoding": "base64" }]),
        )?;
        result
            .as_str()
            .map(String::from)
            .context("expected transaction signature string")
    }
}

// ── Transaction building ──

fn compact_u16(val: u16) -> Vec<u8> {
    if val < 0x80 {
        vec![val as u8]
    } else if val < 0x4000 {
        vec![(val & 0x7f) as u8 | 0x80, (val >> 7) as u8]
    } else {
        vec![
            (val & 0x7f) as u8 | 0x80,
            ((val >> 7) & 0x7f) as u8 | 0x80,
            (val >> 14) as u8,
        ]
    }
}

struct AccountMeta {
    pubkey: Pubkey,
    is_signer: bool,
    is_writable: bool,
}

struct RawInstruction {
    program_id: Pubkey,
    accounts: Vec<AccountMeta>,
    data: Vec<u8>,
}

fn build_message(
    payer: &Pubkey,
    instructions: &[RawInstruction],
    recent_blockhash: &[u8; 32],
) -> Vec<u8> {
    let mut all_keys: Vec<(Pubkey, bool, bool)> = Vec::new();
    all_keys.push((*payer, true, true));

    for ix in instructions {
        for meta in &ix.accounts {
            if let Some(existing) = all_keys.iter_mut().find(|(k, _, _)| *k == meta.pubkey) {
                existing.1 |= meta.is_signer;
                existing.2 |= meta.is_writable;
            } else {
                all_keys.push((meta.pubkey, meta.is_signer, meta.is_writable));
            }
        }
        if !all_keys.iter().any(|(k, _, _)| *k == ix.program_id) {
            all_keys.push((ix.program_id, false, false));
        }
    }

    // sort: signers first (writable before readonly), then non-signers (writable before readonly)
    all_keys.sort_by(|a, b| {
        b.1.cmp(&a.1)
            .then(b.2.cmp(&a.2))
            .then(a.0 .0.cmp(&b.0 .0))
    });

    let num_signers = all_keys.iter().filter(|(_, s, _)| *s).count() as u8;
    let num_readonly_signed = all_keys
        .iter()
        .filter(|(_, s, w)| *s && !*w)
        .count() as u8;
    let num_readonly_unsigned = all_keys
        .iter()
        .filter(|(_, s, w)| !*s && !*w)
        .count() as u8;

    let key_index = |pk: &Pubkey| -> u8 {
        all_keys
            .iter()
            .position(|(k, _, _)| k == pk)
            .expect("key must exist in all_keys (added during collection)") as u8
    };

    let mut msg = Vec::new();
    msg.push(num_signers);
    msg.push(num_readonly_signed);
    msg.push(num_readonly_unsigned);
    msg.extend_from_slice(&compact_u16(all_keys.len() as u16));
    for (k, _, _) in &all_keys {
        msg.extend_from_slice(&k.0);
    }
    msg.extend_from_slice(recent_blockhash);
    msg.extend_from_slice(&compact_u16(instructions.len() as u16));
    for ix in instructions {
        msg.push(key_index(&ix.program_id));
        msg.extend_from_slice(&compact_u16(ix.accounts.len() as u16));
        for meta in &ix.accounts {
            msg.push(key_index(&meta.pubkey));
        }
        msg.extend_from_slice(&compact_u16(ix.data.len() as u16));
        msg.extend_from_slice(&ix.data);
    }
    msg
}

fn sign_and_serialize(
    signing_key: &ed25519_dalek::SigningKey,
    message: &[u8],
    num_signers: u8,
) -> Vec<u8> {
    use ed25519_dalek::Signer;
    let signature = signing_key.sign(message);

    let mut tx = Vec::new();
    tx.extend_from_slice(&compact_u16(num_signers as u16));
    tx.extend_from_slice(&signature.to_bytes());
    // pad remaining signer slots with zero (only 1 signer in our case)
    for _ in 1..num_signers {
        tx.extend_from_slice(&[0u8; 64]);
    }
    tx.extend_from_slice(message);
    tx
}

pub fn load_keypair(path: &str) -> Result<(ed25519_dalek::SigningKey, Pubkey)> {
    let expanded = if path.starts_with('~') {
        let home = dirs::home_dir().context("could not find home directory")?;
        home.join(&path[2..])
    } else {
        std::path::PathBuf::from(path)
    };

    let text = std::fs::read_to_string(&expanded)
        .with_context(|| format!("failed to read keypair: {}", expanded.display()))?;

    let bytes: Vec<u8> = serde_json::from_str(&text).context(
        "invalid keypair format (expected JSON array of bytes, like Solana CLI keypair)",
    )?;

    if bytes.len() != 64 {
        bail!("keypair must be 64 bytes, got {}", bytes.len());
    }

    let secret: [u8; 32] = bytes[..32]
        .try_into()
        .context("invalid secret key bytes")?;
    let signing_key = ed25519_dalek::SigningKey::from_bytes(&secret);
    let verifying_key = signing_key.verifying_key();
    let pubkey = Pubkey(verifying_key.to_bytes());

    Ok((signing_key, pubkey))
}

pub fn create_agent_tx(
    rpc: &SolanaRpc,
    signing_key: &ed25519_dalek::SigningKey,
    owner: &Pubkey,
    name: &str,
    agent_type: AgentType,
    stake_lamports: u64,
) -> Result<String> {
    if name.is_empty() || name.len() > 32 {
        bail!("agent name must be 1-32 characters");
    }
    if stake_lamports < 100_000_000 {
        bail!("minimum stake is 0.1 SOL (100000000 lamports)");
    }

    let (pda, _) = agent_pda(owner)?;
    let disc = anchor_instruction_discriminator("create_agent");

    let mut data = Vec::with_capacity(64);
    data.extend_from_slice(&disc);
    data.extend_from_slice(&(name.len() as u32).to_le_bytes());
    data.extend_from_slice(name.as_bytes());
    data.push(agent_type.to_u8());
    data.extend_from_slice(&stake_lamports.to_le_bytes());

    let ix = RawInstruction {
        program_id: *program_id(),
        accounts: vec![
            AccountMeta { pubkey: pda, is_signer: false, is_writable: true },
            AccountMeta { pubkey: *owner, is_signer: true, is_writable: true },
            AccountMeta { pubkey: *system_program_id(), is_signer: false, is_writable: false },
        ],
        data,
    };

    let blockhash = rpc.get_latest_blockhash()?;
    let message = build_message(owner, &[ix], &blockhash);
    let tx_bytes = sign_and_serialize(signing_key, &message, 1);
    rpc.send_raw_transaction(&tx_bytes)
}

pub fn deactivate_agent_tx(
    rpc: &SolanaRpc,
    signing_key: &ed25519_dalek::SigningKey,
    owner: &Pubkey,
) -> Result<String> {
    let (pda, _) = agent_pda(owner)?;
    let disc = anchor_instruction_discriminator("deactivate_agent");

    let ix = RawInstruction {
        program_id: *program_id(),
        accounts: vec![
            AccountMeta { pubkey: pda, is_signer: false, is_writable: true },
            AccountMeta { pubkey: *owner, is_signer: true, is_writable: true },
        ],
        data: disc.to_vec(),
    };

    let blockhash = rpc.get_latest_blockhash()?;
    let message = build_message(owner, &[ix], &blockhash);
    let tx_bytes = sign_and_serialize(signing_key, &message, 1);
    rpc.send_raw_transaction(&tx_bytes)
}

// ── Display helpers ──

pub fn format_sol(lamports: u64) -> String {
    let sol = lamports as f64 * SOL_PER_LAMPORT;
    if sol >= 1.0 {
        format!("{:.2} SOL", sol)
    } else if sol >= 0.001 {
        format!("{:.4} SOL", sol)
    } else {
        format!("{} lamports", lamports)
    }
}

pub fn format_timestamp(ts: i64) -> String {
    chrono::DateTime::from_timestamp(ts, 0)
        .map(|dt| dt.format("%Y-%m-%d %H:%M:%S UTC").to_string())
        .unwrap_or_else(|| format!("{ts}"))
}

pub fn cluster_label(cluster: &str) -> &str {
    match cluster {
        "devnet" | "d" => "devnet",
        "mainnet" | "mainnet-beta" | "m" => "mainnet-beta",
        "localnet" | "localhost" | "l" => "localnet",
        "testnet" | "t" => "testnet",
        url => url,
    }
}
