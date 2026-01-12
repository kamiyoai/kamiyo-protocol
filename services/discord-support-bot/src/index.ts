import { Client, GatewayIntentBits, Message, TextChannel } from 'discord.js';
import Anthropic from '@anthropic-ai/sdk';
import 'dotenv/config';

const SUPPORT_CHANNEL_ID = process.env.SUPPORT_CHANNEL_ID!;
const MAX_HISTORY = 10;

const SYSTEM_PROMPT = `You are the KAMIYO support assistant. Answer questions about the KAMIYO protocol concisely and accurately.

## About KAMIYO
KAMIYO is an AI agent reputation and coordination protocol. Agents earn reputation through on-chain performance. Token holders govern the protocol through proposals and voting.

## Token
- Symbol: $KAMIYO
- Mint: Gy55EJmheLyDXiZ7k7CW2FhunD1UgjQxQibuBn3Npump
- Type: Token-2022 (pump.fun)
- Decimals: 6
- Chain: Solana

## Governance
- Token-weighted voting through Discord
- Use /link-wallet to connect your Solana wallet
- Use /my-wallet to check voting power
- Proposals require 60% approval to pass
- Treasury managed via Squads multisig

## Commands
- /link-wallet (then paste your wallet address) - Link Solana wallet for voting
- /my-wallet - Check linked wallet and voting power
- /propose - Create governance proposal (admin only)
- /proposal <id> - View proposal details
- /proposals - List proposals by status

## Links
- Website: https://kamiyo.ai
- Docs: https://docs.kamiyo.ai
- GitHub: https://github.com/kamiyo-ai
- Twitter: https://x.com/kamiyo_ai
- DEXScreener: https://dexscreener.com/solana/Gy55EJmheLyDXiZ7k7CW2FhunD1UgjQxQibuBn3Npump

## Guidelines
- Keep responses short and helpful
- If you don't know something, say so
- For complex issues, suggest asking in #dev or waiting for team response
- Never share private keys or ask for them
- Be friendly but professional`;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const conversationHistory: Map<string, { role: 'user' | 'assistant'; content: string }[]> = new Map();

client.once('ready', () => {
  console.log(`Logged in as ${client.user?.tag}`);
});

client.on('messageCreate', async (message: Message) => {
  if (message.author.bot) return;
  if (message.channelId !== SUPPORT_CHANNEL_ID) return;

  const question = message.content.trim();
  if (!question) return;

  const userId = message.author.id;
  let history = conversationHistory.get(userId) || [];

  history.push({ role: 'user', content: question });

  if (history.length > MAX_HISTORY * 2) {
    history = history.slice(-MAX_HISTORY * 2);
  }

  try {
    await message.channel.sendTyping();

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: SYSTEM_PROMPT,
      messages: history,
    });

    const reply = response.content[0].type === 'text' ? response.content[0].text : '';

    history.push({ role: 'assistant', content: reply });
    conversationHistory.set(userId, history);

    if (reply.length > 2000) {
      const chunks = reply.match(/.{1,2000}/gs) || [];
      for (const chunk of chunks) {
        await message.reply(chunk);
      }
    } else {
      await message.reply(reply);
    }
  } catch (err) {
    console.error('Error:', err);
    await message.reply('Something went wrong. Please try again or ask in #dev for help.');
  }
});

if (!process.env.DISCORD_TOKEN) {
  console.error('DISCORD_TOKEN not set');
  process.exit(1);
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY not set');
  process.exit(1);
}

if (!process.env.SUPPORT_CHANNEL_ID) {
  console.error('SUPPORT_CHANNEL_ID not set');
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);

