import { Connection, Keypair, Commitment } from "@solana/web3.js";
import { Wallet } from "@coral-xyz/anchor";
import {
  KamiyoClient,
  UnifiedKamiyoClient,
  AgentManager,
  AgreementManager,
  OracleManager,
  ReputationManager,
  EscrowDisputeManager,
  QualityOracle,
  DisputeMonitor,
  FundryManager,
  ElfaManager,
  createX402Client,
  RpcPool,
  CircuitBreaker,
  KAMIYO_PROGRAM_ID,
} from "@kamiyo/sdk";

export interface TrustLayerBootstrapConfig {
  rpcUrl: string;
  secretKey: Uint8Array;
  commitment?: Commitment;
  fundryMcpEndpoint?: string;
  elfaMcpEndpoint?: string;
}

export async function bootstrapTrustLayer(config: TrustLayerBootstrapConfig) {
  const connection = new Connection(config.rpcUrl, {
    commitment: config.commitment ?? "confirmed",
  });

  const keypair = Keypair.fromSecretKey(config.secretKey);
  const wallet = new Wallet(keypair);

  const client = new KamiyoClient({ connection, wallet });
  const unified = new UnifiedKamiyoClient({ connection, wallet });

  const agents = new AgentManager(client);
  const agreements = new AgreementManager(client);
  const oracles = new OracleManager(client);
  const reputation = new ReputationManager(client);

  const disputes = new EscrowDisputeManager(connection, wallet);
  const qualityOracle = new QualityOracle(connection, wallet);
  const disputeMonitor = new DisputeMonitor(connection);

  const fundry = new FundryManager({
    connection,
    wallet,
    fundryMcpEndpoint: config.fundryMcpEndpoint,
  });

  const elfa = new ElfaManager({
    connection,
    wallet,
    elfaMcpEndpoint: config.elfaMcpEndpoint,
  });

  const x402 = createX402Client(connection, keypair, KAMIYO_PROGRAM_ID, {
    qualityThreshold: 70,
    maxPricePerRequest: 0.1,
  });

  const rpcPool = RpcPool.fromEnv("mainnet-beta");
  await rpcPool.init();

  const breaker = new CircuitBreaker({
    name: "trust-layer-remote-deps",
    failureThreshold: 4,
    resetTimeoutMs: 30_000,
    successThreshold: 2,
  });

  return {
    connection,
    wallet,
    keypair,
    client,
    unified,
    agents,
    agreements,
    oracles,
    reputation,
    disputes,
    qualityOracle,
    disputeMonitor,
    fundry,
    elfa,
    x402,
    rpcPool,
    breaker,
  };
}
