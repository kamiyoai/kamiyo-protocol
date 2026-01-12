import { Telegraf, Markup } from 'telegraf';
import { Connection, PublicKey } from '@solana/web3.js';
import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import 'dotenv/config';

const KAMIYO_MINT = new PublicKey('Gy55EJmheLyDXiZ7k7CW2FhunD1UgjQxQibuBn3Npump');
const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const DATA_FILE = './data/proposals.json';
const ADMIN_IDS = (process.env.ADMIN_IDS || '').split(',').filter(Boolean);
const GITHUB_REPO = 'kamiyo-ai/kamiyo-protocol';
const DOC_REFRESH_INTERVAL = 60 * 60 * 1000; // 1 hour

const DOCS_TO_FETCH = [
  'README.md',
  'docs/TESTING_GUIDE.md',
  'packages/kamiyo-tetsuo/README.md',
  'packages/kamiyo-agent-core/README.md',
  'packages/kamiyo-daydreams/README.md',
  'services/discord-governance-bot/README.md',
  'services/telegram-bot/README.md',
];

let docsContent = '';

async function fetchGitHubFile(path: string): Promise<string | null> {
  try {
    const url = `https://raw.githubusercontent.com/${GITHUB_REPO}/main/${path}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function refreshDocs(): Promise<void> {
  console.log('Fetching docs from GitHub...');
  const docs: string[] = [];

  for (const path of DOCS_TO_FETCH) {
    const content = await fetchGitHubFile(path);
    if (content) {
      docs.push(`## ${path}\n\n${content}`);
    }
  }

  if (docs.length > 0) {
    docsContent = docs.join('\n\n---\n\n');
    console.log(`Loaded ${docs.length} docs from GitHub`);
  }
}

function getSystemPrompt(): string {
  return `You are the KAMIYO support assistant. Answer questions about the KAMIYO protocol concisely and accurately.

## About KAMIYO
KAMIYO is an AI agent reputation and coordination protocol. Agents earn reputation through on-chain performance. Token holders govern the protocol through proposals and voting.

## Token
- Symbol: $KAMIYO
- Mint: Gy55EJmheLyDXiZ7k7CW2FhunD1UgjQxQibuBn3Npump
- Type: Token-2022 (pump.fun)
- Decimals: 6
- Chain: Solana

## Governance
- Token-weighted voting through Telegram
- Use /link_wallet <address> to connect your wallet
- Use /my_wallet to check voting power
- Proposals require 60% approval to pass
- Treasury managed via Squads multisig

## Commands
- /link_wallet <address> - Link Solana wallet for voting
- /my_wallet - Check linked wallet and voting power
- /propose <title>|<description> - Create governance proposal (admin only)
- /proposal <id> - View proposal details
- /proposals - List proposals by status
- /kamiyo <question> - Ask about KAMIYO

## Links
- Website: https://kamiyo.ai
- Docs: https://docs.kamiyo.ai
- GitHub: https://github.com/kamiyo-ai
- Twitter: https://x.com/kamiyo_ai
- DEXScreener: https://dexscreener.com/solana/Gy55EJmheLyDXiZ7k7CW2FhunD1UgjQxQibuBn3Npump

## Guidelines
- Keep responses short and helpful
- If you don't know something, say so
- Never share private keys or ask for them
- Be friendly but professional

---

# Documentation from GitHub

${docsContent || 'Documentation not yet loaded.'}`;
}

interface Vote {
  wallet: string;
  choice: 'for' | 'against' | 'abstain';
  weight: number;
  timestamp: number;
}

interface Proposal {
  id: string;
  title: string;
  description: string;
  author: string;
  authorId: string;
  channelId: string;
  messageId: string;
  createdAt: number;
  endsAt: number;
  status: 'active' | 'passed' | 'rejected' | 'expired';
  votes: Vote[];
  snapshot: Record<string, number>;
}

interface ProposalStore {
  proposals: Proposal[];
  walletLinks: Record<string, string>;
}

const connection = new Connection(RPC_URL, 'confirmed');

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

const conversationHistory: Map<string, { role: 'user' | 'assistant'; content: string }[]> = new Map();

function loadData(): ProposalStore {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    }
  } catch {}
  return { proposals: [], walletLinks: {} };
}

function saveData(data: ProposalStore): void {
  const dir = './data';
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

async function getTokenBalance(wallet: string): Promise<number> {
  try {
    const pubkey = new PublicKey(wallet);
    const accounts = await connection.getParsedTokenAccountsByOwner(pubkey, {
      mint: KAMIYO_MINT,
    });

    let total = 0;
    for (const account of accounts.value) {
      const amount = account.account.data.parsed.info.tokenAmount.uiAmount;
      if (amount) total += amount;
    }
    return total;
  } catch {
    return 0;
  }
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(2) + 'K';
  return n.toFixed(2);
}

function calculateResults(proposal: Proposal) {
  let forVotes = 0;
  let againstVotes = 0;
  let abstainVotes = 0;

  for (const vote of proposal.votes) {
    switch (vote.choice) {
      case 'for': forVotes += vote.weight; break;
      case 'against': againstVotes += vote.weight; break;
      case 'abstain': abstainVotes += vote.weight; break;
    }
  }

  const total = forVotes + againstVotes;
  const forPct = total > 0 ? (forVotes / total) * 100 : 0;
  const againstPct = total > 0 ? (againstVotes / total) * 100 : 0;

  return { forVotes, againstVotes, abstainVotes, forPct, againstPct, total };
}

function formatProposal(proposal: Proposal): string {
  const results = calculateResults(proposal);
  const timeLeft = Math.max(0, proposal.endsAt - Date.now());
  const hoursLeft = Math.floor(timeLeft / (1000 * 60 * 60));
  const minsLeft = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));

  const statusTag = proposal.status === 'active' ? '[ACTIVE]' :
                    proposal.status === 'passed' ? '[PASSED]' :
                    proposal.status === 'rejected' ? '[REJECTED]' : '[EXPIRED]';

  const timeStr = proposal.status === 'active' ? `${hoursLeft}h ${minsLeft}m` : 'Ended';

  return `${statusTag} *${proposal.title}*

${proposal.description}

*For:* ${formatNumber(results.forVotes)} KAMIYO (${results.forPct.toFixed(1)}%)
*Against:* ${formatNumber(results.againstVotes)} KAMIYO (${results.againstPct.toFixed(1)}%)
*Abstain:* ${formatNumber(results.abstainVotes)} KAMIYO

*Voters:* ${proposal.votes.length}
*Status:* ${proposal.status}
*Time Left:* ${timeStr}

_ID: ${proposal.id} | By: ${proposal.author}_`;
}

function getVoteKeyboard(proposalId: string, disabled = false) {
  if (disabled) return undefined;
  return Markup.inlineKeyboard([
    Markup.button.callback('For', `vote_for_${proposalId}`),
    Markup.button.callback('Against', `vote_against_${proposalId}`),
    Markup.button.callback('Abstain', `vote_abstain_${proposalId}`),
  ]);
}

function isAdmin(userId: number): boolean {
  return ADMIN_IDS.includes(String(userId));
}

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN!);

bot.command('start', async (ctx) => {
  await ctx.reply(`Welcome to KAMIYO Governance Bot

Commands:
/link_wallet <address> - Link your Solana wallet
/my_wallet - Check voting power
/proposals - List active proposals
/proposal <id> - View proposal
/kamiyo <question> - Ask the AI assistant

Token: $KAMIYO
Chain: Solana`);
});

bot.command('link_wallet', async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1);
  const wallet = args[0];

  if (!wallet) {
    await ctx.reply('Usage: /link_wallet <solana_address>');
    return;
  }

  try {
    new PublicKey(wallet);
  } catch {
    await ctx.reply('Invalid Solana wallet address.');
    return;
  }

  const balance = await getTokenBalance(wallet);
  const data = loadData();
  data.walletLinks[`telegram_${ctx.from.id}`] = wallet;
  saveData(data);

  await ctx.reply(`Wallet linked: \`${wallet}\`
Voting power: *${formatNumber(balance)} KAMIYO*`, { parse_mode: 'Markdown' });
});

bot.command('my_wallet', async (ctx) => {
  const data = loadData();
  const wallet = data.walletLinks[`telegram_${ctx.from.id}`];

  if (!wallet) {
    await ctx.reply('No wallet linked. Use /link_wallet <address> to link your wallet.');
    return;
  }

  const balance = await getTokenBalance(wallet);
  await ctx.reply(`Wallet: \`${wallet}\`
Voting power: *${formatNumber(balance)} KAMIYO*`, { parse_mode: 'Markdown' });
});

bot.command('propose', async (ctx) => {
  if (!isAdmin(ctx.from.id)) {
    await ctx.reply('Only admins can create proposals.');
    return;
  }

  const args = ctx.message.text.replace('/propose ', '');
  const parts = args.split('|').map(s => s.trim());

  if (parts.length < 2) {
    await ctx.reply('Usage: /propose <title>|<description>\n\nExample:\n/propose Increase rewards|Proposal to increase staking rewards by 10%');
    return;
  }

  const [title, description] = parts;
  const data = loadData();

  const id = `KIP-${data.proposals.length + 1}`;
  const now = Date.now();
  const duration = 72;

  const proposal: Proposal = {
    id,
    title,
    description,
    author: ctx.from.username || ctx.from.first_name || 'Unknown',
    authorId: `telegram_${ctx.from.id}`,
    channelId: String(ctx.chat.id),
    messageId: '',
    createdAt: now,
    endsAt: now + duration * 60 * 60 * 1000,
    status: 'active',
    votes: [],
    snapshot: {},
  };

  const msg = await ctx.reply(formatProposal(proposal), {
    parse_mode: 'Markdown',
    ...getVoteKeyboard(id),
  });

  proposal.messageId = String(msg.message_id);
  data.proposals.push(proposal);
  saveData(data);
});

bot.command('proposal', async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1);
  const id = args[0];

  if (!id) {
    await ctx.reply('Usage: /proposal <id>\n\nExample: /proposal KIP-1');
    return;
  }

  const data = loadData();
  const proposal = data.proposals.find(p => p.id.toLowerCase() === id.toLowerCase());

  if (!proposal) {
    await ctx.reply(`Proposal ${id} not found.`);
    return;
  }

  await ctx.reply(formatProposal(proposal), {
    parse_mode: 'Markdown',
    ...getVoteKeyboard(proposal.id, proposal.status !== 'active'),
  });
});

bot.command('proposals', async (ctx) => {
  const data = loadData();
  const active = data.proposals.filter(p => p.status === 'active');

  if (active.length === 0) {
    await ctx.reply('No active proposals.');
    return;
  }

  const list = active.slice(-10).map(p => {
    const results = calculateResults(p);
    return `[ACTIVE] *${p.id}*: ${p.title} (${results.forPct.toFixed(0)}% for)`;
  }).join('\n');

  await ctx.reply(`*Active Proposals:*\n\n${list}`, { parse_mode: 'Markdown' });
});

bot.command('kamiyo', async (ctx) => {
  if (!anthropic) {
    await ctx.reply('AI support not configured.');
    return;
  }

  const question = ctx.message.text.replace('/kamiyo ', '').trim();

  if (!question) {
    await ctx.reply('Usage: /kamiyo <question>\n\nExample: /kamiyo How do I vote?');
    return;
  }

  const userId = String(ctx.from.id);
  let history = conversationHistory.get(userId) || [];

  history.push({ role: 'user', content: question });
  if (history.length > 20) history = history.slice(-20);

  await ctx.sendChatAction('typing');

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: getSystemPrompt(),
      messages: history,
    });

    const reply = response.content[0].type === 'text' ? response.content[0].text : '';

    history.push({ role: 'assistant', content: reply });
    conversationHistory.set(userId, history);

    await ctx.reply(reply.slice(0, 4096));
  } catch (err) {
    console.error('AI error:', err);
    await ctx.reply('Something went wrong. Please try again.');
  }
});

bot.action(/vote_(for|against|abstain)_(.+)/, async (ctx) => {
  const match = ctx.match;
  if (!match) return;

  const choice = match[1] as 'for' | 'against' | 'abstain';
  const proposalId = match[2];

  const data = loadData();
  const proposal = data.proposals.find(p => p.id === proposalId);

  if (!proposal) {
    await ctx.answerCbQuery('Proposal not found.');
    return;
  }

  if (proposal.status !== 'active') {
    await ctx.answerCbQuery('This proposal has ended.');
    return;
  }

  const wallet = data.walletLinks[`telegram_${ctx.from.id}`];
  if (!wallet) {
    await ctx.answerCbQuery('Link your wallet first with /link_wallet');
    return;
  }

  let weight = proposal.snapshot[wallet];
  if (weight === undefined) {
    weight = await getTokenBalance(wallet);
    proposal.snapshot[wallet] = weight;
  }

  if (weight === 0) {
    await ctx.answerCbQuery('You need KAMIYO tokens to vote.');
    return;
  }

  proposal.votes = proposal.votes.filter(v => v.wallet !== wallet);

  proposal.votes.push({
    wallet,
    choice,
    weight,
    timestamp: Date.now(),
  });

  saveData(data);

  try {
    await ctx.editMessageText(formatProposal(proposal), {
      parse_mode: 'Markdown',
      ...getVoteKeyboard(proposal.id),
    });
  } catch {}

  await ctx.answerCbQuery(`Vote recorded: ${choice.toUpperCase()} with ${formatNumber(weight)} KAMIYO`);
});

// Check for expired proposals every minute
setInterval(async () => {
  const data = loadData();
  let updated = false;

  for (const proposal of data.proposals) {
    if (proposal.status === 'active' && Date.now() > proposal.endsAt) {
      const results = calculateResults(proposal);
      proposal.status = results.forPct >= 60 ? 'passed' : 'rejected';
      updated = true;

      try {
        await bot.telegram.editMessageText(
          proposal.channelId,
          Number(proposal.messageId),
          undefined,
          formatProposal(proposal),
          { parse_mode: 'Markdown' }
        );
      } catch {}
    }
  }

  if (updated) saveData(data);
}, 60000);

if (!process.env.TELEGRAM_BOT_TOKEN) {
  console.error('TELEGRAM_BOT_TOKEN not set');
  process.exit(1);
}

// Fetch docs on startup and refresh hourly
refreshDocs().then(() => {
  setInterval(refreshDocs, DOC_REFRESH_INTERVAL);

  bot.launch().then(() => {
    console.log('Bot started');
  });
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
