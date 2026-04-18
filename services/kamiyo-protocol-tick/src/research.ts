import OpenAI from 'openai';
import type { Config } from './config.js';

export async function generateTickSummary(
  cfg: Config,
  context: {
    tickNumber: number;
    walletAddress: string;
    solBalance: number;
    recentSignatures: string[];
  }
): Promise<string> {
  const client = new OpenAI({
    baseURL: cfg.LLM_BASE_URL,
    apiKey: cfg.LLM_API_KEY,
  });

  const prompt = `You are the Kamiyo protocol maintenance agent. Generate a brief status report for tick #${context.tickNumber}.

Context:
- Operator wallet: ${context.walletAddress}
- SOL balance: ${context.solBalance.toFixed(6)} SOL
- Recent on-chain signatures (last 24h): ${context.recentSignatures.length}
- Timestamp: ${new Date().toISOString()}

Write a 2-3 sentence protocol health summary. Include the tick number and current balance. Be factual and concise. This summary will be recorded as an on-chain inference settlement receipt.`;

  const response = await client.chat.completions.create({
    model: cfg.LLM_MODEL,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 256,
    temperature: 0.3,
  });

  return (
    response.choices[0]?.message?.content?.trim() ??
    `Tick #${context.tickNumber}: protocol heartbeat at ${new Date().toISOString()}`
  );
}
