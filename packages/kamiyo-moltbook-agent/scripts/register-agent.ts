#!/usr/bin/env node

/**
 * Register or recover KAMIYO agent with Moltbook
 */

const MOLTBOOK_API = 'https://www.moltbook.com/api/v1';

interface RegisterResponse {
  agent: {
    api_key: string;
    claim_url: string;
    verification_code: string;
  };
}

interface RecoverResponse {
  success: boolean;
  recovery_email_sent?: boolean;
  hint?: string;
}

async function recoverAgent(): Promise<void> {
  console.log('Attempting to recover existing KAMIYO agent...\n');

  // Try to recover via the recovery endpoint
  const response = await fetch(`${MOLTBOOK_API}/agents/recover`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: 'kamiyo',
      email: 'dev@kamiyo.ai',
    }),
  });

  const data = await response.json();
  console.log('Recovery response:', JSON.stringify(data, null, 2));
}

async function registerAgent(): Promise<void> {
  const agentName = process.argv[2] || 'kamiyo';
  console.log(`Registering "${agentName}" agent with Moltbook...\n`);

  const response = await fetch(`${MOLTBOOK_API}/agents/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: agentName,
      description: 'ZK reputation oracle & trust infrastructure for the agent internet. Verify reputations, build trust graphs, facilitate secure escrow.',
      capabilities: [
        'zk-proofs',
        'reputation-verification',
        'escrow',
        'trust-graphs',
        'dkg-attestations',
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    if (text.includes('already taken') || text.includes('already registered')) {
      console.log('Agent already registered. Attempting recovery...\n');
      await recoverAgent();
      return;
    }
    console.error(`Registration failed: ${response.status}`);
    console.error(text);
    process.exit(1);
  }

  const data = (await response.json()) as RegisterResponse;

  console.log('='.repeat(60));
  console.log('REGISTRATION SUCCESSFUL');
  console.log('='.repeat(60));
  console.log('');
  console.log('API Key (save this - shown only once):');
  console.log(`  ${data.agent.api_key}`);
  console.log('');
  console.log('Claim URL (visit this to claim your agent):');
  console.log(`  ${data.agent.claim_url}`);
  console.log('');
  console.log('Verification Code (post this on Twitter):');
  console.log(`  Claiming my molty @moltbook #${data.agent.verification_code}`);
  console.log('');
  console.log('='.repeat(60));
  console.log('NEXT STEPS:');
  console.log('='.repeat(60));
  console.log('1. Save the API key above');
  console.log('2. Visit the claim URL');
  console.log('3. Post the verification tweet from @kamiyo_ai Twitter');
  console.log('4. Add to .env:');
  console.log(`   MOLTBOOK_API_KEY=${data.agent.api_key}`);
  console.log('');
}

registerAgent().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
