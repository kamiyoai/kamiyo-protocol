# Privacy plus shield gate flow

This flow proves a trust threshold and issues a signed shield credential.

```typescript
import { Connection, Keypair } from "@solana/web3.js";
import {
  PrivateReputation,
  Shield,
  CredentialManager,
  ShieldVerifier,
  verifyCredential,
  KAMIYO_PROGRAM_ID,
} from "@kamiyo/sdk";

async function run() {
  const connection = new Connection(process.env.SOLANA_RPC_URL!);
  const payer = Keypair.fromSecretKey(Buffer.from(JSON.parse(process.env.AGENT_SECRET_KEY_JSON!)));
  const agent = payer.publicKey;

  // 1) Build private reputation commitment.
  const rep = new PrivateReputation(agent);
  rep.setStats({
    successfulAgreements: 88,
    totalAgreements: 100,
    disputesWon: 9,
    disputesLost: 2,
  });

  const threshold = 80;
  const thresholdProof = rep.prepareProof(threshold);

  // 2) Build and sign shield credential.
  const shield = new Shield(agent);
  shield.setRep({
    successful: 88,
    total: 100,
    disputesWon: 9,
    disputesLost: 2,
  });

  const blacklistRoot = Shield.emptySmtRoot();
  const credential = shield.issue(blacklistRoot, 3600);

  if (!verifyCredential(credential, blacklistRoot)) {
    throw new Error("credential verification failed");
  }

  const issuer = Keypair.generate();
  const credentialManager = new CredentialManager(issuer);
  const signedCredential = credentialManager.issue(credential);

  // 3) Optional verifier checks.
  const verifier = new ShieldVerifier(connection, KAMIYO_PROGRAM_ID);

  const reputationCheck = await verifier.verifyReputation(
    new Uint8Array(32),
    thresholdProof.publicInputs.agentPk,
    thresholdProof.publicInputs.commitment,
    threshold
  );

  const submitResult = await verifier.submitProof(payer, {
    credential: signedCredential,
    threshold,
    reputationProof: new Uint8Array(32),
  });

  console.log({ reputationCheck, submitResult });
}
```

Notes:

- Replace placeholder proof bytes with actual circuit output.
- For strict crypto validation, use the full `@kamiyo/solana-privacy` proof and verification primitives.
