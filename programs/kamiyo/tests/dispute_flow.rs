use anchor_lang::{AccountDeserialize, InstructionData, ToAccountMetas};
use ed25519_dalek::Keypair as DalekKeypair;
use kamiyo::{Escrow, EscrowStatus, OracleRegistry};
use solana_program_test::{processor, ProgramTest, ProgramTestContext};
use solana_sdk::{
    ed25519_instruction,
    instruction::Instruction,
    signature::{Keypair, Signer},
    system_instruction, system_program,
    transaction::Transaction,
};

const TIME_LOCK_SECS: i64 = 3600;
const WARP_SECS: i64 = 310;
const ORACLE_STAKE_LAMPORTS: u64 = 1_000_000_000;
const ESCROW_AMOUNT_LAMPORTS: u64 = 1_000_000_000;

fn kamiyo_native_processor<'a, 'b, 'c, 'd>(
    program_id: &'a solana_sdk::pubkey::Pubkey,
    accounts: &'b [solana_sdk::account_info::AccountInfo<'c>],
    data: &'d [u8],
) -> Result<(), solana_sdk::program_error::ProgramError> {
    // solana-program-test uses a more general `AccountInfo` lifetime than Anchor's entrypoint
    // expects. In practice these are the same for native tests, so we tie them together here.
    let accounts: &'b [solana_sdk::account_info::AccountInfo<'b>] =
        unsafe { std::mem::transmute(accounts) };
    kamiyo::entry(program_id, accounts, data)
}

fn pda_protocol_config() -> solana_sdk::pubkey::Pubkey {
    solana_sdk::pubkey::Pubkey::find_program_address(&[b"protocol_config"], &kamiyo::ID).0
}

fn pda_treasury() -> solana_sdk::pubkey::Pubkey {
    solana_sdk::pubkey::Pubkey::find_program_address(&[b"treasury"], &kamiyo::ID).0
}

fn pda_oracle_registry() -> solana_sdk::pubkey::Pubkey {
    solana_sdk::pubkey::Pubkey::find_program_address(&[b"oracle_registry"], &kamiyo::ID).0
}

fn pda_reputation(entity: &solana_sdk::pubkey::Pubkey) -> solana_sdk::pubkey::Pubkey {
    solana_sdk::pubkey::Pubkey::find_program_address(&[b"reputation", entity.as_ref()], &kamiyo::ID).0
}

fn pda_escrow(
    agent: &solana_sdk::pubkey::Pubkey,
    transaction_id: &str,
) -> solana_sdk::pubkey::Pubkey {
    solana_sdk::pubkey::Pubkey::find_program_address(
        &[b"escrow", agent.as_ref(), transaction_id.as_bytes()],
        &kamiyo::ID,
    )
    .0
}

async fn get_account_lamports(
    context: &mut ProgramTestContext,
    pubkey: solana_sdk::pubkey::Pubkey,
) -> u64 {
    context
        .banks_client
        .get_account(pubkey)
        .await
        .unwrap()
        .map(|a| a.lamports)
        .unwrap_or(0)
}

async fn get_escrow(context: &mut ProgramTestContext, escrow: solana_sdk::pubkey::Pubkey) -> Escrow {
    let account = context
        .banks_client
        .get_account(escrow)
        .await
        .unwrap()
        .expect("escrow account missing");
    let mut data: &[u8] = &account.data;
    Escrow::try_deserialize(&mut data).unwrap()
}

async fn get_oracle_registry(
    context: &mut ProgramTestContext,
    registry: solana_sdk::pubkey::Pubkey,
) -> OracleRegistry {
    let account = context
        .banks_client
        .get_account(registry)
        .await
        .unwrap()
        .expect("oracle registry missing");
    let mut data: &[u8] = &account.data;
    OracleRegistry::try_deserialize(&mut data).unwrap()
}

async fn process_tx(
    context: &mut ProgramTestContext,
    ixs: &[Instruction],
    signers: &[&Keypair],
) -> Result<(), solana_program_test::BanksClientError> {
    let recent_blockhash = context.banks_client.get_latest_blockhash().await.unwrap();
    let mut tx = Transaction::new_with_payer(ixs, Some(&context.payer.pubkey()));
    let mut all_signers = Vec::<&Keypair>::with_capacity(1 + signers.len());
    all_signers.push(&context.payer);
    all_signers.extend_from_slice(signers);
    tx.sign(&all_signers, recent_blockhash);
    context.banks_client.process_transaction(tx).await
}

async fn warp_forward(context: &mut ProgramTestContext, seconds: i64) {
    use solana_sdk::clock::Clock;

    if seconds <= 0 {
        return;
    }

    let start: Clock = context.banks_client.get_sysvar().await.unwrap();
    let target_ts = start.unix_timestamp + seconds;

    loop {
        let clock: Clock = context.banks_client.get_sysvar().await.unwrap();
        if clock.unix_timestamp >= target_ts {
            return;
        }
        let remaining = (target_ts - clock.unix_timestamp).max(1) as f64;
        let slots = (remaining / 0.4).ceil() as u64 + 1;
        context
            .warp_to_slot(clock.slot.saturating_add(slots))
            .unwrap();
    }
}

async fn setup_base(oracle_count: usize, max_score_deviation: u8) -> (ProgramTestContext, Keypair, Keypair, Vec<Keypair>) {
    let mut program = ProgramTest::new("kamiyo", kamiyo::ID, processor!(kamiyo_native_processor));
    program.set_compute_max_units(1_400_000);

    let mut context = program.start_with_context().await;

    let agent = Keypair::new();
    let api = Keypair::new();
    let mut oracles = Vec::with_capacity(oracle_count);
    for _ in 0..oracle_count {
        oracles.push(Keypair::new());
    }

    // Fund agent + oracles
    let fund_ixs = {
        let mut ixs = Vec::new();
        ixs.push(system_instruction::transfer(
            &context.payer.pubkey(),
            &agent.pubkey(),
            20 * solana_sdk::native_token::LAMPORTS_PER_SOL,
        ));
        ixs.push(system_instruction::transfer(
            &context.payer.pubkey(),
            &api.pubkey(),
            solana_sdk::native_token::LAMPORTS_PER_SOL,
        ));
        for oracle in &oracles {
            ixs.push(system_instruction::transfer(
                &context.payer.pubkey(),
                &oracle.pubkey(),
                5 * solana_sdk::native_token::LAMPORTS_PER_SOL,
            ));
        }
        ixs
    };
    process_tx(&mut context, &fund_ixs, &[]).await.unwrap();

    // initialize_protocol
    let secondary = Keypair::new();
    let tertiary = Keypair::new();
    let init_protocol_ix = Instruction {
        program_id: kamiyo::ID,
        accounts: kamiyo::accounts::InitializeProtocol {
            protocol_config: pda_protocol_config(),
            authority: context.payer.pubkey(),
            system_program: system_program::ID,
        }
        .to_account_metas(None),
        data: kamiyo::instruction::InitializeProtocol {
            secondary_signer: secondary.pubkey(),
            tertiary_signer: tertiary.pubkey(),
        }
        .data(),
    };
    process_tx(&mut context, &[init_protocol_ix], &[]).await.unwrap();

    // initialize_treasury
    let init_treasury_ix = Instruction {
        program_id: kamiyo::ID,
        accounts: kamiyo::accounts::InitializeTreasury {
            treasury: pda_treasury(),
            admin: context.payer.pubkey(),
            system_program: system_program::ID,
        }
        .to_account_metas(None),
        data: kamiyo::instruction::InitializeTreasury {}.data(),
    };
    process_tx(&mut context, &[init_treasury_ix], &[]).await.unwrap();

    // initialize_oracle_registry
    let init_oracle_registry_ix = Instruction {
        program_id: kamiyo::ID,
        accounts: kamiyo::accounts::InitializeOracleRegistry {
            oracle_registry: pda_oracle_registry(),
            admin: context.payer.pubkey(),
            system_program: system_program::ID,
        }
        .to_account_metas(None),
        data: kamiyo::instruction::InitializeOracleRegistry {
            min_consensus: 3,
            max_score_deviation,
        }
        .data(),
    };
    process_tx(&mut context, &[init_oracle_registry_ix], &[]).await.unwrap();

    // add_oracle for each oracle
    for oracle in &oracles {
        let add_oracle_ix = Instruction {
            program_id: kamiyo::ID,
            accounts: kamiyo::accounts::AddOracle {
                oracle_registry: pda_oracle_registry(),
                admin: context.payer.pubkey(),
                oracle_signer: oracle.pubkey(),
                system_program: system_program::ID,
            }
            .to_account_metas(None),
            data: kamiyo::instruction::AddOracle {
                oracle_pubkey: oracle.pubkey(),
                oracle_type: kamiyo::OracleType::Ed25519,
                weight: 1,
                stake_amount: ORACLE_STAKE_LAMPORTS,
            }
            .data(),
        };
        process_tx(&mut context, &[add_oracle_ix], &[oracle]).await.unwrap();
    }

    (context, agent, api, oracles)
}

async fn init_reputation_for(
    context: &mut ProgramTestContext,
    entity: solana_sdk::pubkey::Pubkey,
) {
    let ix = Instruction {
        program_id: kamiyo::ID,
        accounts: kamiyo::accounts::InitReputation {
            reputation: pda_reputation(&entity),
            entity,
            payer: context.payer.pubkey(),
            system_program: system_program::ID,
        }
        .to_account_metas(None),
        data: kamiyo::instruction::InitReputation {}.data(),
    };
    process_tx(context, &[ix], &[]).await.unwrap();
}

async fn create_sol_escrow(
    context: &mut ProgramTestContext,
    agent: &Keypair,
    api: solana_sdk::pubkey::Pubkey,
    transaction_id: &str,
    amount: u64,
) -> solana_sdk::pubkey::Pubkey {
    let escrow = pda_escrow(&agent.pubkey(), transaction_id);
    let ix = Instruction {
        program_id: kamiyo::ID,
        accounts: kamiyo::accounts::InitializeEscrow {
            protocol_config: pda_protocol_config(),
            treasury: pda_treasury(),
            escrow,
            agent: agent.pubkey(),
            api,
            system_program: system_program::ID,
            token_mint: None,
            escrow_token_account: None,
            agent_token_account: None,
            token_program: None,
            associated_token_program: None,
        }
        .to_account_metas(None),
        data: kamiyo::instruction::InitializeEscrow {
            amount,
            time_lock: TIME_LOCK_SECS,
            transaction_id: transaction_id.to_string(),
            use_spl_token: false,
        }
        .data(),
    };
    process_tx(context, &[ix], &[agent]).await.unwrap();
    escrow
}

async fn mark_disputed(
    context: &mut ProgramTestContext,
    agent: &Keypair,
    escrow: solana_sdk::pubkey::Pubkey,
) {
    let ix = Instruction {
        program_id: kamiyo::ID,
        accounts: kamiyo::accounts::MarkDisputed {
            protocol_config: pda_protocol_config(),
            escrow,
            reputation: pda_reputation(&agent.pubkey()),
            agent: agent.pubkey(),
        }
        .to_account_metas(None),
        data: kamiyo::instruction::MarkDisputed {}.data(),
    };
    process_tx(context, &[ix], &[agent]).await.unwrap();
}

fn compute_commitment_hash(transaction_id: &str, score: u8, salt: &[u8; 32]) -> [u8; 32] {
    let mut data = Vec::with_capacity(transaction_id.len() + 1 + 32);
    data.extend_from_slice(transaction_id.as_bytes());
    data.push(score);
    data.extend_from_slice(salt);
    solana_sdk::hash::hash(&data).to_bytes()
}

async fn commit_scores(
    context: &mut ProgramTestContext,
    escrow: solana_sdk::pubkey::Pubkey,
    transaction_id: &str,
    oracles: &[Keypair],
    scores: &[u8],
    salts: &[[u8; 32]],
) {
    for ((oracle, score), salt) in oracles.iter().zip(scores.iter()).zip(salts.iter()) {
        let commitment_hash = compute_commitment_hash(transaction_id, *score, salt);
        let ix = Instruction {
            program_id: kamiyo::ID,
            accounts: kamiyo::accounts::CommitOracleScore {
                protocol_config: pda_protocol_config(),
                escrow,
                oracle_registry: pda_oracle_registry(),
                oracle: oracle.pubkey(),
            }
            .to_account_metas(None),
            data: kamiyo::instruction::CommitOracleScore { commitment_hash }.data(),
        };
        process_tx(context, &[ix], &[oracle]).await.unwrap();
    }
}

async fn reveal_scores(
    context: &mut ProgramTestContext,
    escrow: solana_sdk::pubkey::Pubkey,
    transaction_id: &str,
    oracles: &[Keypair],
    scores: &[u8],
    salts: &[[u8; 32]],
    ) {
    for ((oracle, score), salt) in oracles.iter().zip(scores.iter()).zip(salts.iter()) {
        let message = format!("{transaction_id}:{score}");
        let sig = oracle.sign_message(message.as_bytes());
        let sig: [u8; 64] = sig.as_ref().try_into().unwrap();
        let dalek = DalekKeypair::from_bytes(&oracle.to_bytes()).unwrap();
        let ed25519_ix = ed25519_instruction::new_ed25519_instruction(&dalek, message.as_bytes());
        let ix = Instruction {
            program_id: kamiyo::ID,
            accounts: kamiyo::accounts::SubmitOracleScore {
                protocol_config: pda_protocol_config(),
                escrow,
                oracle_registry: pda_oracle_registry(),
                oracle: oracle.pubkey(),
                instructions_sysvar: solana_sdk::sysvar::instructions::id(),
            }
            .to_account_metas(None),
            data: kamiyo::instruction::SubmitOracleScore {
                quality_score: *score,
                salt: *salt,
                signature: sig,
            }
            .data(),
        };
        process_tx(context, &[ed25519_ix, ix], &[oracle])
            .await
            .unwrap();
    }
}

async fn finalize(
    context: &mut ProgramTestContext,
    escrow: solana_sdk::pubkey::Pubkey,
    agent: solana_sdk::pubkey::Pubkey,
    api: solana_sdk::pubkey::Pubkey,
    with_treasury: bool,
) -> Result<(), solana_program_test::BanksClientError> {
    let ix = Instruction {
        program_id: kamiyo::ID,
        accounts: kamiyo::accounts::FinalizeMultiOracleDispute {
            protocol_config: pda_protocol_config(),
            escrow,
            oracle_registry: pda_oracle_registry(),
            agent,
            api,
            agent_identity: None,
            caller: context.payer.pubkey(),
            treasury: with_treasury.then_some(pda_treasury()),
            escrow_token_account: None,
            agent_token_account: None,
            api_token_account: None,
            treasury_token_account: None,
            token_program: None,
        }
        .to_account_metas(None),
        data: kamiyo::instruction::FinalizeMultiOracleDispute {}.data(),
    };
    process_tx(context, &[ix], &[])
        .await
        .map_err(|e| e)
}

#[tokio::test]
async fn resolve_dispute_full_refund_succeeds() {
    let (mut context, agent, api, oracles) = setup_base(1, 50).await;
    init_reputation_for(&mut context, agent.pubkey()).await;
    init_reputation_for(&mut context, api.pubkey()).await;

    let transaction_id = "tx_resolve_full_refund";
    let escrow = create_sol_escrow(
        &mut context,
        &agent,
        api.pubkey(),
        transaction_id,
        ESCROW_AMOUNT_LAMPORTS,
    )
    .await;
    mark_disputed(&mut context, &agent, escrow).await;

    let quality_score = 0u8;
    let refund_percentage = 100u8;

    let message = {
        let mut data = Vec::with_capacity(33);
        data.extend_from_slice(escrow.as_ref());
        data.push(quality_score);
        solana_sdk::hash::hash(&data).to_bytes()
    };

    let verifier = &oracles[0];
    let sig = verifier.sign_message(&message);
    let sig: [u8; 64] = sig.as_ref().try_into().unwrap();
    let dalek = DalekKeypair::from_bytes(&verifier.to_bytes()).unwrap();
    let ed25519_ix = ed25519_instruction::new_ed25519_instruction(&dalek, &message);
    let resolve_ix = Instruction {
        program_id: kamiyo::ID,
        accounts: kamiyo::accounts::ResolveDispute {
            protocol_config: pda_protocol_config(),
            escrow,
            agent: agent.pubkey(),
            api: api.pubkey(),
            oracle_registry: pda_oracle_registry(),
            verifier: verifier.pubkey(),
            instructions_sysvar: solana_sdk::sysvar::instructions::id(),
            agent_reputation: pda_reputation(&agent.pubkey()),
            api_reputation: pda_reputation(&api.pubkey()),
            system_program: system_program::ID,
            escrow_token_account: None,
            agent_token_account: None,
            api_token_account: None,
            token_program: None,
        }
        .to_account_metas(None),
        data: kamiyo::instruction::ResolveDispute {
            quality_score,
            refund_percentage,
            signature: sig,
        }
        .data(),
    };

    let agent_before = get_account_lamports(&mut context, agent.pubkey()).await;
    let api_before = get_account_lamports(&mut context, api.pubkey()).await;
    let escrow_before = get_account_lamports(&mut context, escrow).await;

    process_tx(&mut context, &[ed25519_ix, resolve_ix], &[])
        .await
        .unwrap();

    let agent_after = get_account_lamports(&mut context, agent.pubkey()).await;
    let api_after = get_account_lamports(&mut context, api.pubkey()).await;
    let escrow_after = get_account_lamports(&mut context, escrow).await;

    assert_eq!(
        agent_after.saturating_sub(agent_before),
        ESCROW_AMOUNT_LAMPORTS
    );
    assert_eq!(api_after, api_before);
    assert_eq!(
        escrow_before.saturating_sub(escrow_after),
        ESCROW_AMOUNT_LAMPORTS
    );

    let escrow_state = get_escrow(&mut context, escrow).await;
    assert!(escrow_state.status == EscrowStatus::Resolved);
    assert_eq!(escrow_state.quality_score, Some(quality_score));
    assert_eq!(escrow_state.refund_percentage, Some(refund_percentage));
}

#[tokio::test]
async fn finalize_multi_oracle_full_refund_succeeds() {
    let (mut context, agent, api, oracles) = setup_base(3, 50).await;
    init_reputation_for(&mut context, agent.pubkey()).await;

    let transaction_id = "tx_finalize_full_refund";
    let escrow = create_sol_escrow(
        &mut context,
        &agent,
        api.pubkey(),
        transaction_id,
        ESCROW_AMOUNT_LAMPORTS,
    )
    .await;
    mark_disputed(&mut context, &agent, escrow).await;

    let scores = [0u8, 0u8, 0u8];
    let salts = [[1u8; 32], [2u8; 32], [3u8; 32]];

    commit_scores(
        &mut context,
        escrow,
        transaction_id,
        &oracles,
        &scores,
        &salts,
    )
    .await;

    warp_forward(&mut context, WARP_SECS).await;

    reveal_scores(
        &mut context,
        escrow,
        transaction_id,
        &oracles,
        &scores,
        &salts,
    )
    .await;

    let agent_before = get_account_lamports(&mut context, agent.pubkey()).await;
    let api_before = get_account_lamports(&mut context, api.pubkey()).await;
    let escrow_before = get_account_lamports(&mut context, escrow).await;

    finalize(&mut context, escrow, agent.pubkey(), api.pubkey(), true)
        .await
        .unwrap();

    let agent_after = get_account_lamports(&mut context, agent.pubkey()).await;
    let api_after = get_account_lamports(&mut context, api.pubkey()).await;
    let escrow_after = get_account_lamports(&mut context, escrow).await;

    assert_eq!(
        agent_after.saturating_sub(agent_before),
        ESCROW_AMOUNT_LAMPORTS
    );
    assert_eq!(api_after, api_before);
    assert_eq!(
        escrow_before.saturating_sub(escrow_after),
        ESCROW_AMOUNT_LAMPORTS
    );

    let escrow_state = get_escrow(&mut context, escrow).await;
    assert!(escrow_state.status == EscrowStatus::Resolved);
    assert_eq!(escrow_state.refund_percentage, Some(100));
}

#[tokio::test]
async fn finalize_multi_oracle_without_treasury_has_no_oracle_rewards() {
    let (mut context, agent, api, oracles) = setup_base(3, 50).await;
    init_reputation_for(&mut context, agent.pubkey()).await;

    let transaction_id = "tx_finalize_no_treasury";
    let escrow = create_sol_escrow(
        &mut context,
        &agent,
        api.pubkey(),
        transaction_id,
        ESCROW_AMOUNT_LAMPORTS,
    )
    .await;
    mark_disputed(&mut context, &agent, escrow).await;

    let scores = [60u8, 60u8, 60u8];
    let salts = [[10u8; 32], [11u8; 32], [12u8; 32]];

    commit_scores(
        &mut context,
        escrow,
        transaction_id,
        &oracles,
        &scores,
        &salts,
    )
    .await;

    warp_forward(&mut context, WARP_SECS).await;

    reveal_scores(
        &mut context,
        escrow,
        transaction_id,
        &oracles,
        &scores,
        &salts,
    )
    .await;

    finalize(&mut context, escrow, agent.pubkey(), api.pubkey(), false)
        .await
        .unwrap();

    let registry = get_oracle_registry(&mut context, pda_oracle_registry()).await;
    assert!(registry.oracles.iter().all(|o| o.total_rewards == 0));
}

#[tokio::test]
async fn finalize_fails_if_oracle_removed_between_reveal_and_finalize() {
    let (mut context, agent, api, mut oracles) = setup_base(3, 50).await;
    init_reputation_for(&mut context, agent.pubkey()).await;

    let transaction_id = "tx_finalize_oracle_removed";
    let escrow = create_sol_escrow(
        &mut context,
        &agent,
        api.pubkey(),
        transaction_id,
        ESCROW_AMOUNT_LAMPORTS,
    )
    .await;
    mark_disputed(&mut context, &agent, escrow).await;

    let scores = [60u8, 60u8, 60u8];
    let salts = [[20u8; 32], [21u8; 32], [22u8; 32]];

    commit_scores(
        &mut context,
        escrow,
        transaction_id,
        &oracles,
        &scores,
        &salts,
    )
    .await;
    warp_forward(&mut context, WARP_SECS).await;
    reveal_scores(
        &mut context,
        escrow,
        transaction_id,
        &oracles,
        &scores,
        &salts,
    )
    .await;

    // Admin removes one of the participating oracles.
    let removed = oracles.remove(0);
    let remove_ix = Instruction {
        program_id: kamiyo::ID,
        accounts: kamiyo::accounts::RemoveOracle {
            oracle_registry: pda_oracle_registry(),
            admin: context.payer.pubkey(),
            oracle_wallet: removed.pubkey(),
        }
        .to_account_metas(None),
        data: kamiyo::instruction::RemoveOracle {
            oracle_pubkey: removed.pubkey(),
        }
        .data(),
    };
    process_tx(&mut context, &[remove_ix], &[]).await.unwrap();

    let err = finalize(&mut context, escrow, agent.pubkey(), api.pubkey(), true)
        .await
        .err()
        .expect("finalize should fail");
    let escrow_state = get_escrow(&mut context, escrow).await;
    assert!(escrow_state.status == EscrowStatus::Disputed);

    // Ensure the failure is from the kamiyo program (custom error), not a runtime failure.
    match err {
        solana_program_test::BanksClientError::TransactionError(
            solana_sdk::transaction::TransactionError::InstructionError(
                _,
                solana_sdk::instruction::InstructionError::Custom(_),
            ),
        ) => {}
        other => panic!("unexpected error: {other:?}"),
    }
}

#[tokio::test]
async fn finalize_slashes_outlier_and_moves_slashed_stake_to_treasury() {
    let (mut context, agent, api, oracles) = setup_base(3, 0).await;
    init_reputation_for(&mut context, agent.pubkey()).await;

    let transaction_id = "tx_finalize_slash_outlier";
    let escrow = create_sol_escrow(
        &mut context,
        &agent,
        api.pubkey(),
        transaction_id,
        ESCROW_AMOUNT_LAMPORTS,
    )
    .await;
    mark_disputed(&mut context, &agent, escrow).await;

    let scores = [80u8, 80u8, 0u8];
    let salts = [[30u8; 32], [31u8; 32], [32u8; 32]];

    commit_scores(
        &mut context,
        escrow,
        transaction_id,
        &oracles,
        &scores,
        &salts,
    )
    .await;
    warp_forward(&mut context, WARP_SECS).await;
    reveal_scores(
        &mut context,
        escrow,
        transaction_id,
        &oracles,
        &scores,
        &salts,
    )
    .await;

    let treasury = pda_treasury();
    let registry = pda_oracle_registry();

    let treasury_before = get_account_lamports(&mut context, treasury).await;
    let registry_before = get_account_lamports(&mut context, registry).await;

    finalize(&mut context, escrow, agent.pubkey(), api.pubkey(), true)
        .await
        .unwrap();

    let treasury_after = get_account_lamports(&mut context, treasury).await;
    let registry_after = get_account_lamports(&mut context, registry).await;

    let slashed = ORACLE_STAKE_LAMPORTS / 10;
    assert_eq!(registry_before.saturating_sub(registry_after), slashed);
    assert!(treasury_after >= treasury_before + slashed);

    let registry_state = get_oracle_registry(&mut context, registry).await;
    let outlier = registry_state
        .oracles
        .iter()
        .find(|o| o.pubkey == oracles[2].pubkey())
        .expect("outlier oracle missing");
    assert_eq!(outlier.violation_count, 1);
    assert_eq!(outlier.stake_amount, ORACLE_STAKE_LAMPORTS - slashed);
}
