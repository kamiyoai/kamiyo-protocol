import { Telegraf, Markup } from 'telegraf';
import { Connection, PublicKey } from '@solana/web3.js';
import Anthropic from '@anthropic-ai/sdk';
import type { Tool, ToolUseBlock, TextBlock, MessageParam } from '@anthropic-ai/sdk/resources/messages';
import * as fs from 'fs';
import 'dotenv/config';

const KAMIYO_MINT = new PublicKey('Gy55EJmheLyDXiZ7k7CW2FhunD1UgjQxQibuBn3Npump');
const KAMIYO_PAIR = 'Gy55EJmheLyDXiZ7k7CW2FhunD1UgjQxQibuBn3Npump';
const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const DATA_FILE = './data/proposals.json';
const ADMIN_IDS = (process.env.ADMIN_IDS || '').split(',').filter(Boolean);
const GITHUB_REPO = 'kamiyo-ai/kamiyo-protocol';
const DOC_REFRESH_INTERVAL = 60 * 60 * 1000;

const DOCS_TO_FETCH = [
  'README.md',
  'docs/TESTING_GUIDE.md',
  'packages/kamiyo-tetsuo/README.md',
  'packages/kamiyo-agent-core/README.md',
  'packages/kamiyo-daydreams/README.md',
];

let docsContent = '';

// Custom tool definitions for Claude
const customTools: Tool[] = [
  {
    name: 'get_token_data',
    description: 'Get live KAMIYO token data: price, market cap, 24h volume, price change, liquidity.',
    input_schema: {
      type: 'object' as const,
      properties: {}
    }
  },
  {
    name: 'get_holder_count',
    description: 'Get the current number of KAMIYO token holders.',
    input_schema: {
      type: 'object' as const,
      properties: {}
    }
  },
  {
    name: 'search_twitter',
    description: 'Search Twitter/X for mentions of KAMIYO or related topics.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search query (e.g. "KAMIYO", "$KAMIYO")' }
      },
      required: ['query']
    }
  },
  {
    name: 'get_proposals',
    description: 'Get list of governance proposals. Can filter by status.',
    input_schema: {
      type: 'object' as const,
      properties: {
        status: { type: 'string', enum: ['active', 'passed', 'rejected', 'all'], description: 'Filter by status' }
      }
    }
  },
  {
    name: 'get_proposal',
    description: 'Get details of a specific proposal by ID.',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'Proposal ID (e.g. KIP-1)' }
      },
      required: ['id']
    }
  }
];

// Tool implementations
async function getTokenData(): Promise<string> {
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${KAMIYO_PAIR}`);
    if (!res.ok) return `DexScreener error: ${res.status}`;

    const data = await res.json();
    const pair = data.pairs?.[0];

    if (!pair) return 'Token data not found.';

    return `KAMIYO Token Data:
- Price: $${parseFloat(pair.priceUsd).toFixed(8)}
- Market Cap: $${formatLargeNumber(pair.marketCap)}
- 24h Volume: $${formatLargeNumber(pair.volume?.h24)}
- 24h Change: ${pair.priceChange?.h24 || 0}%
- Liquidity: $${formatLargeNumber(pair.liquidity?.usd)}
- DEX: ${pair.dexId}`;
  } catch (e) {
    return `Error fetching token data: ${e}`;
  }
}

async function getHolderCount(): Promise<string> {
  try {
    // Use Helius or Solscan API for holder count
    const apiKey = process.env.HELIUS_API_KEY;
    if (!apiKey) {
      // Fallback to basic RPC call for token accounts
      const accounts = await connection.getProgramAccounts(
        new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
        {
          filters: [
            { dataSize: 165 },
            { memcmp: { offset: 0, bytes: KAMIYO_MINT.toBase58() } }
          ]
        }
      );
      return `KAMIYO has approximately ${accounts.length} token holders.`;
    }

    const res = await fetch(`https://api.helius.xyz/v0/token-metadata?api-key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mintAccounts: [KAMIYO_MINT.toBase58()] })
    });

    if (!res.ok) return `Helius error: ${res.status}`;
    const data = await res.json();
    const holders = data[0]?.onChainAccountInfo?.accountInfo?.data?.parsed?.info?.supply;
    return `Token supply info retrieved. Check DexScreener for holder count.`;
  } catch (e) {
    return `Error fetching holder count: ${e}`;
  }
}

async function searchTwitter(query: string): Promise<string> {
  // Twitter API requires OAuth - use a search proxy or scraper
  // For now, return a helpful message with manual search link
  const encodedQuery = encodeURIComponent(query);
  return `Twitter search for "${query}":
Search manually: https://twitter.com/search?q=${encodedQuery}

Recent KAMIYO updates: https://twitter.com/kamiyo_ai

Note: Real-time Twitter search requires API access. Check the links above for latest tweets.`;
}

function getProposalsData(status?: string): string {
  const data = loadData();
  let proposals = data.proposals;

  if (status && status !== 'all') {
    proposals = proposals.filter(p => p.status === status);
  }

  if (proposals.length === 0) {
    return `No ${status || ''} proposals found.`;
  }

  return proposals.slice(-10).map(p => {
    const results = calculateResults(p);
    return `[${p.status.toUpperCase()}] ${p.id}: ${p.title} (${results.forPct.toFixed(0)}% for, ${p.votes.length} voters)`;
  }).join('\n');
}

function getProposalData(id: string): string {
  const data = loadData();
  const proposal = data.proposals.find(p => p.id.toLowerCase() === id.toLowerCase());

  if (!proposal) return `Proposal ${id} not found.`;

  const results = calculateResults(proposal);
  const timeLeft = Math.max(0, proposal.endsAt - Date.now());
  const hoursLeft = Math.floor(timeLeft / (1000 * 60 * 60));

  return `${proposal.id}: ${proposal.title}

Description: ${proposal.description}

Status: ${proposal.status}
For: ${formatNumber(results.forVotes)} KAMIYO (${results.forPct.toFixed(1)}%)
Against: ${formatNumber(results.againstVotes)} KAMIYO (${results.againstPct.toFixed(1)}%)
Abstain: ${formatNumber(results.abstainVotes)} KAMIYO
Voters: ${proposal.votes.length}
Time Left: ${proposal.status === 'active' ? `${hoursLeft}h` : 'Ended'}
Created by: ${proposal.author}`;
}

async function executeTool(name: string, input: Record<string, unknown>): Promise<string> {
  switch (name) {
    case 'get_token_data':
      return await getTokenData();
    case 'get_holder_count':
      return await getHolderCount();
    case 'search_twitter':
      return await searchTwitter(input.query as string);
    case 'get_proposals':
      return getProposalsData(input.status as string);
    case 'get_proposal':
      return getProposalData(input.id as string);
    default:
      return `Unknown tool: ${name}`;
  }
}

function formatLargeNumber(n: number | undefined): string {
  if (!n) return '0';
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + 'B';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(2) + 'K';
  return n.toFixed(2);
}

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

You have access to tools for:
- Web search (crypto news, comparisons)
- Live token data (price, market cap, volume)
- Twitter/X search
- Governance proposals

Use tools when you need live data or information not in the docs. Don't use tools for basic questions already answered in the docs below.

## About KAMIYO
KAMIYO is an AI agent reputation and coordination protocol on Solana. Agents earn ZK reputation through on-chain performance. Token holders govern the protocol.

## Token
- Symbol: $KAMIYO
- Mint: Gy55EJmheLyDXiZ7k7CW2FhunD1UgjQxQibuBn3Npump
- Chain: Solana

## Links
- Website: https://kamiyo.ai
- GitHub: https://github.com/kamiyo-ai
- Twitter: https://x.com/kamiyo_ai
- DEXScreener: https://dexscreener.com/solana/${KAMIYO_PAIR}

## Guidelines
- Keep responses short
- Use tools for live data
- Never share private keys

---

# Documentation

${docsContent || 'Loading...'}`;
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
  await ctx.reply(`Welcome to KAMIYO Bot

Commands:
/link_wallet <address> - Link your Solana wallet
/my_wallet - Check voting power
/proposals - List active proposals
/proposal <id> - View proposal
/kamiyo <question> - Ask the AI assistant

The AI can search the web, get live token data, and answer questions about KAMIYO.

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
    await ctx.reply('Usage: /kamiyo <question>\n\nExample: /kamiyo What is the current price?');
    return;
  }

  await ctx.sendChatAction('typing');

  try {
    const messages: MessageParam[] = [{ role: 'user', content: question }];

    // Tool use loop - includes Claude's native web search + custom tools
    const allTools = [
      { type: 'web_search_20250305' as const, name: 'web_search', max_uses: 3 },
      ...customTools,
    ];

    let response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: getSystemPrompt(),
      tools: allTools as Tool[],
      messages,
    });

    // Process tool calls
    while (response.stop_reason === 'tool_use') {
      const toolUseBlocks = response.content.filter((b): b is ToolUseBlock => b.type === 'tool_use');

      const toolResults = await Promise.all(
        toolUseBlocks.map(async (toolUse) => {
          console.log(`Executing tool: ${toolUse.name}`);
          const result = await executeTool(toolUse.name, toolUse.input as Record<string, unknown>);
          return {
            type: 'tool_result' as const,
            tool_use_id: toolUse.id,
            content: result,
          };
        })
      );

      messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user', content: toolResults });

      await ctx.sendChatAction('typing');

      response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: getSystemPrompt(),
        tools: allTools as Tool[],
        messages,
      });
    }

    // Extract final text response
    const textBlocks = response.content.filter((b): b is TextBlock => b.type === 'text');
    const reply = textBlocks.map(b => b.text).join('\n');

    await ctx.reply(reply.slice(0, 4096) || 'No response generated.');
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
