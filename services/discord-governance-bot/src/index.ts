import {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  REST,
  Routes,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction,
  PermissionFlagsBits,
  GuildMember,
} from 'discord.js';
import { Connection, PublicKey } from '@solana/web3.js';
import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import 'dotenv/config';

const KAMIYO_MINT = new PublicKey('Gy55EJmheLyDXiZ7k7CW2FhunD1UgjQxQibuBn3Npump');
const KAMIYO_MINT_STR = 'Gy55EJmheLyDXiZ7k7CW2FhunD1UgjQxQibuBn3Npump';
const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const DATA_FILE = './data/proposals.json';

// Role IDs for token-gated roles (set in env)
const HOLDER_ROLE_ID = process.env.HOLDER_ROLE_ID; // Any holder
const WHALE_ROLE_ID = process.env.WHALE_ROLE_ID;   // 100K+ holders
const MEGA_WHALE_ROLE_ID = process.env.MEGA_WHALE_ROLE_ID; // 1M+ holders

// Holder tiers
const WHALE_THRESHOLD = 100_000;
const MEGA_WHALE_THRESHOLD = 1_000_000;

// Channel IDs for language-specific channels
const CHINESE_CHANNEL_IDS = (process.env.CHINESE_CHANNEL_IDS || '').split(',').filter(Boolean);
const JAPANESE_CHANNEL_IDS = (process.env.JAPANESE_CHANNEL_IDS || '').split(',').filter(Boolean);

const SUPPORT_PROMPT = `You are the KAMIYO support assistant. Answer questions about the KAMIYO protocol concisely and accurately.

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
- Use /link-wallet (then paste your wallet address) to connect your wallet
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

const SUPPORT_PROMPT_ZH = `你是 KAMIYO 支持助手。请用中文简洁准确地回答关于 KAMIYO 协议的问题。

## 关于 KAMIYO
KAMIYO 是一个 AI 代理声誉和协调协议。代理通过链上表现获得声誉。代币持有者通过提案和投票来治理协议。

## 代币
- 符号：$KAMIYO
- 铸造地址：Gy55EJmheLyDXiZ7k7CW2FhunD1UgjQxQibuBn3Npump
- 类型：Token-2022 (pump.fun)
- 精度：6
- 链：Solana

## 治理
- 通过 Discord 进行代币加权投票
- 使用 /link-wallet（然后粘贴你的钱包地址）连接钱包
- 使用 /my-wallet 查看投票权
- 提案需要 60% 的批准才能通过
- 国库由 Squads 多签管理

## 命令
- /link-wallet（然后粘贴钱包地址）- 链接 Solana 钱包用于投票
- /my-wallet - 查看已链接的钱包和投票权
- /propose - 创建治理提案（仅管理员）
- /proposal <id> - 查看提案详情
- /proposals - 按状态列出提案

## 链接
- 网站：https://kamiyo.ai
- 文档：https://docs.kamiyo.ai
- GitHub：https://github.com/kamiyo-ai
- Twitter：https://x.com/kamiyo_ai
- DEXScreener：https://dexscreener.com/solana/Gy55EJmheLyDXiZ7k7CW2FhunD1UgjQxQibuBn3Npump

## 指南
- 回答要简短有帮助
- 如果不知道，就说不知道
- 复杂问题建议在 #dev 频道询问或等待团队回复
- 永远不要分享或索要私钥
- 友好但专业`;

const SUPPORT_PROMPT_JA = `あなたはKAMIYOサポートアシスタントです。KAMIYOプロトコルに関する質問に日本語で簡潔かつ正確に回答してください。

## KAMIYOについて
KAMIYOはAIエージェントの評判と調整のためのプロトコルです。エージェントはオンチェーンのパフォーマンスを通じて評判を獲得します。トークン保有者は提案と投票を通じてプロトコルを統治します。

## トークン
- シンボル：$KAMIYO
- ミントアドレス：Gy55EJmheLyDXiZ7k7CW2FhunD1UgjQxQibuBn3Npump
- タイプ：Token-2022 (pump.fun)
- 小数点：6
- チェーン：Solana

## ガバナンス
- Discordを通じたトークン加重投票
- /link-wallet（その後ウォレットアドレスを貼り付け）でウォレットを接続
- /my-wallet で投票権を確認
- 提案は60%の承認で可決
- トレジャリーはSquadsマルチシグで管理

## コマンド
- /link-wallet（その後アドレスを貼り付け）- 投票用Solanaウォレットをリンク
- /my-wallet - リンク済みウォレットと投票権を確認
- /propose - ガバナンス提案を作成（管理者のみ）
- /proposal <id> - 提案の詳細を表示
- /proposals - ステータス別に提案を一覧表示

## リンク
- ウェブサイト：https://kamiyo.ai
- ドキュメント：https://docs.kamiyo.ai
- GitHub：https://github.com/kamiyo-ai
- Twitter：https://x.com/kamiyo_ai
- DEXScreener：https://dexscreener.com/solana/Gy55EJmheLyDXiZ7k7CW2FhunD1UgjQxQibuBn3Npump

## ガイドライン
- 回答は短く役立つものに
- わからないことはわからないと言う
- 複雑な問題は #dev チャンネルで質問するか、チームの回答を待つよう提案
- 秘密鍵を共有したり要求したりしない
- フレンドリーだがプロフェッショナルに`;

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
  } catch (error) {
    void error;
  }
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

function formatUSD(n: number): string {
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000) return '$' + (n / 1_000).toFixed(2) + 'K';
  return '$' + n.toFixed(2);
}

interface PriceData {
  price: number;
  priceChange24h: number;
  volume24h: number;
  marketCap: number;
  liquidity: number;
}

interface DexScreenerResponse {
  pairs?: Array<{
    priceUsd?: string;
    priceChange?: { h24?: number };
    volume?: { h24?: number };
    marketCap?: number;
    liquidity?: { usd?: number };
  }>;
}

async function getKamiyoPrice(): Promise<PriceData | null> {
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${KAMIYO_MINT_STR}`);
    if (!res.ok) return null;

    const data = await res.json() as DexScreenerResponse;
    const pair = data.pairs?.[0];
    if (!pair) return null;

    return {
      price: parseFloat(pair.priceUsd || '0') || 0,
      priceChange24h: pair.priceChange?.h24 || 0,
      volume24h: pair.volume?.h24 || 0,
      marketCap: pair.marketCap || 0,
      liquidity: pair.liquidity?.usd || 0,
    };
  } catch {
    return null;
  }
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

function createProposalEmbed(proposal: Proposal): EmbedBuilder {
  const results = calculateResults(proposal);
  const timeLeft = Math.max(0, proposal.endsAt - Date.now());
  const hoursLeft = Math.floor(timeLeft / (1000 * 60 * 60));
  const minsLeft = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));

  const statusTag = proposal.status === 'active' ? '[ACTIVE]' :
                    proposal.status === 'passed' ? '[PASSED]' :
                    proposal.status === 'rejected' ? '[REJECTED]' : '[EXPIRED]';

  const embed = new EmbedBuilder()
    .setTitle(`${statusTag} ${proposal.title}`)
    .setDescription(proposal.description)
    .addFields(
      { name: 'For', value: `${formatNumber(results.forVotes)} KAMIYO (${results.forPct.toFixed(1)}%)`, inline: true },
      { name: 'Against', value: `${formatNumber(results.againstVotes)} KAMIYO (${results.againstPct.toFixed(1)}%)`, inline: true },
      { name: 'Abstain', value: `${formatNumber(results.abstainVotes)} KAMIYO`, inline: true },
      { name: 'Voters', value: `${proposal.votes.length}`, inline: true },
      { name: 'Status', value: proposal.status, inline: true },
      { name: 'Time Left', value: proposal.status === 'active' ? `${hoursLeft}h ${minsLeft}m` : 'Ended', inline: true },
    )
    .setFooter({ text: `Proposal ID: ${proposal.id} | Created by ${proposal.author}` })
    .setTimestamp(proposal.createdAt)
    .setColor(proposal.status === 'active' ? 0x00ff00 :
              proposal.status === 'passed' ? 0x00ff00 : 0xff0000);

  return embed;
}

function createVoteButtons(proposalId: string, disabled = false): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`vote_for_${proposalId}`)
      .setLabel('For')
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`vote_against_${proposalId}`)
      .setLabel('Against')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`vote_abstain_${proposalId}`)
      .setLabel('Abstain')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
  );
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

const commands = [
  new SlashCommandBuilder()
    .setName('link-wallet')
    .setDescription('Link your Solana wallet for voting')
    .addStringOption(opt =>
      opt.setName('wallet')
        .setDescription('Your Solana wallet address')
        .setRequired(true)),

  new SlashCommandBuilder()
    .setName('my-wallet')
    .setDescription('Check your linked wallet and voting power'),

  new SlashCommandBuilder()
    .setName('propose')
    .setDescription('Create a new governance proposal')
    .addStringOption(opt =>
      opt.setName('title')
        .setDescription('Proposal title')
        .setRequired(true))
    .addStringOption(opt =>
      opt.setName('description')
        .setDescription('Proposal description')
        .setRequired(true))
    .addIntegerOption(opt =>
      opt.setName('duration')
        .setDescription('Voting duration in hours (default: 72)')
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName('proposal')
    .setDescription('View a proposal')
    .addStringOption(opt =>
      opt.setName('id')
        .setDescription('Proposal ID')
        .setRequired(true)),

  new SlashCommandBuilder()
    .setName('proposals')
    .setDescription('List all proposals')
    .addStringOption(opt =>
      opt.setName('status')
        .setDescription('Filter by status')
        .addChoices(
          { name: 'Active', value: 'active' },
          { name: 'Passed', value: 'passed' },
          { name: 'Rejected', value: 'rejected' },
          { name: 'All', value: 'all' },
        )),

  new SlashCommandBuilder()
    .setName('kamiyo')
    .setDescription('Ask the KAMIYO AI assistant about the protocol, token, governance, etc.')
    .addStringOption(opt =>
      opt.setName('question')
        .setDescription('e.g. "How do I vote?" or "What is KAMIYO?"')
        .setRequired(true)),

  new SlashCommandBuilder()
    .setName('price')
    .setDescription('Get live $KAMIYO price and market stats'),

  new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Verify your token holdings and get holder roles'),

  new SlashCommandBuilder()
    .setName('tip')
    .setDescription('Send tokens to another user')
    .addUserOption(opt =>
      opt.setName('user')
        .setDescription('User to tip')
        .setRequired(true))
    .addNumberOption(opt =>
      opt.setName('amount')
        .setDescription('Amount to send')
        .setRequired(true))
    .addStringOption(opt =>
      opt.setName('token')
        .setDescription('Token to send')
        .addChoices(
          { name: 'SOL', value: 'SOL' },
          { name: 'KAMIYO', value: 'KAMIYO' },
        )
        .setRequired(true)),

  new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Show top KAMIYO holders in this server'),
];

client.once('ready', async () => {
  console.log(`Logged in as ${client.user?.tag}`);

  const rest = new REST().setToken(process.env.DISCORD_TOKEN!);
  const guildId = process.env.GUILD_ID;

  if (!guildId) {
    console.error('GUILD_ID not set');
    process.exit(1);
  }

  try {
    await rest.put(
      Routes.applicationGuildCommands(client.user!.id, guildId),
      { body: commands.map(c => c.toJSON()) }
    );
    console.log('Commands registered');
  } catch (err) {
    console.error('Failed to register commands:', err);
  }

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
          const channel = await client.channels.fetch(proposal.channelId);
          if (channel?.isTextBased()) {
            const msg = await channel.messages.fetch(proposal.messageId);
            await msg.edit({
              embeds: [createProposalEmbed(proposal)],
              components: [createVoteButtons(proposal.id, true)],
            });
          }
        } catch (error) {
          void error;
        }
      }
    }

    if (updated) saveData(data);
  }, 60000);
});

client.on('interactionCreate', async (interaction) => {
  if (interaction.isChatInputCommand()) {
    await handleCommand(interaction);
  } else if (interaction.isButton()) {
    await handleButton(interaction);
  }
});

async function handleCommand(interaction: ChatInputCommandInteraction) {
  const data = loadData();

  switch (interaction.commandName) {
    case 'link-wallet': {
      const wallet = interaction.options.getString('wallet', true);

      try {
        new PublicKey(wallet);
      } catch {
        await interaction.reply({ content: 'Invalid Solana wallet address.', ephemeral: true });
        return;
      }

      const balance = await getTokenBalance(wallet);
      data.walletLinks[interaction.user.id] = wallet;
      saveData(data);

      await interaction.reply({
        content: `Wallet linked: \`${wallet}\`\nVoting power: **${formatNumber(balance)} KAMIYO**`,
        ephemeral: true,
      });
      break;
    }

    case 'my-wallet': {
      const wallet = data.walletLinks[interaction.user.id];
      if (!wallet) {
        await interaction.reply({
          content: 'No wallet linked. Use `/link-wallet` to link your wallet.',
          ephemeral: true,
        });
        return;
      }

      const balance = await getTokenBalance(wallet);
      await interaction.reply({
        content: `Wallet: \`${wallet}\`\nVoting power: **${formatNumber(balance)} KAMIYO**`,
        ephemeral: true,
      });
      break;
    }

    case 'propose': {
      const title = interaction.options.getString('title', true);
      const description = interaction.options.getString('description', true);
      const duration = interaction.options.getInteger('duration') || 72;

      const id = `KIP-${data.proposals.length + 1}`;
      const now = Date.now();

      const proposal: Proposal = {
        id,
        title,
        description,
        author: interaction.user.tag,
        authorId: interaction.user.id,
        channelId: interaction.channelId,
        messageId: '',
        createdAt: now,
        endsAt: now + duration * 60 * 60 * 1000,
        status: 'active',
        votes: [],
        snapshot: {},
      };

      const embed = createProposalEmbed(proposal);
      const buttons = createVoteButtons(id);

      const reply = await interaction.reply({
        embeds: [embed],
        components: [buttons],
        fetchReply: true,
      });

      proposal.messageId = reply.id;
      data.proposals.push(proposal);
      saveData(data);
      break;
    }

    case 'proposal': {
      const id = interaction.options.getString('id', true);
      const proposal = data.proposals.find(p => p.id.toLowerCase() === id.toLowerCase());

      if (!proposal) {
        await interaction.reply({ content: `Proposal ${id} not found.`, ephemeral: true });
        return;
      }

      await interaction.reply({
        embeds: [createProposalEmbed(proposal)],
        components: proposal.status === 'active' ? [createVoteButtons(proposal.id)] : [],
      });
      break;
    }

    case 'proposals': {
      const status = interaction.options.getString('status') || 'active';
      const filtered = status === 'all'
        ? data.proposals
        : data.proposals.filter(p => p.status === status);

      if (filtered.length === 0) {
        await interaction.reply({ content: `No ${status} proposals found.`, ephemeral: true });
        return;
      }

      const list = filtered.slice(-10).map(p => {
        const results = calculateResults(p);
        const tag = p.status === 'active' ? '[ACTIVE]' : p.status === 'passed' ? '[PASSED]' : '[REJECTED]';
        return `${tag} **${p.id}**: ${p.title} (${results.forPct.toFixed(0)}% for)`;
      }).join('\n');

      await interaction.reply({
        content: `**${status.charAt(0).toUpperCase() + status.slice(1)} Proposals:**\n${list}`,
        ephemeral: true,
      });
      break;
    }

    case 'kamiyo': {
      if (!anthropic) {
        await interaction.reply({ content: 'AI support not configured.', ephemeral: true });
        return;
      }

      const question = interaction.options.getString('question', true);
      const userId = interaction.user.id;
      const channelId = interaction.channelId;
      const isChinese = CHINESE_CHANNEL_IDS.includes(channelId);
      const isJapanese = JAPANESE_CHANNEL_IDS.includes(channelId);

      // Use separate history per language
      const langSuffix = isChinese ? '_zh' : isJapanese ? '_ja' : '';
      const historyKey = `${userId}${langSuffix}`;
      let history = conversationHistory.get(historyKey) || [];

      history.push({ role: 'user', content: question });
      if (history.length > 20) history = history.slice(-20);

      await interaction.deferReply();

      // Select prompt based on channel language
      const systemPrompt = isChinese ? SUPPORT_PROMPT_ZH
        : isJapanese ? SUPPORT_PROMPT_JA
        : SUPPORT_PROMPT;

      try {
        const response = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 500,
          system: systemPrompt,
          messages: history,
        });

        const reply = response.content[0].type === 'text' ? response.content[0].text : '';

        history.push({ role: 'assistant', content: reply });
        conversationHistory.set(historyKey, history);

        if (reply.length > 2000) {
          await interaction.editReply(reply.slice(0, 2000));
        } else {
          await interaction.editReply(reply);
        }
      } catch (err) {
        console.error('AI error:', err);
        await interaction.editReply('Something went wrong. Please try again.');
      }
      break;
    }

    case 'price': {
      const priceData = await getKamiyoPrice();

      if (!priceData) {
        await interaction.reply({ content: 'Unable to fetch price data.', ephemeral: true });
        return;
      }

      const changeEmoji = priceData.priceChange24h >= 0 ? '+' : '';
      const changeColor = priceData.priceChange24h >= 0 ? 0x00ff00 : 0xff0000;

      const embed = new EmbedBuilder()
        .setTitle('$KAMIYO Price')
        .setColor(changeColor)
        .addFields(
          { name: 'Price', value: `$${priceData.price.toFixed(6)}`, inline: true },
          { name: '24h Change', value: `${changeEmoji}${priceData.priceChange24h.toFixed(2)}%`, inline: true },
          { name: 'Market Cap', value: formatUSD(priceData.marketCap), inline: true },
          { name: '24h Volume', value: formatUSD(priceData.volume24h), inline: true },
          { name: 'Liquidity', value: formatUSD(priceData.liquidity), inline: true },
        )
        .setFooter({ text: 'Data from DexScreener' })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
      break;
    }

    case 'verify': {
      const wallet = data.walletLinks[interaction.user.id];

      if (!wallet) {
        await interaction.reply({
          content: 'Link your wallet first with `/link-wallet`',
          ephemeral: true,
        });
        return;
      }

      const balance = await getTokenBalance(wallet);
      const member = interaction.member;

      if (!member || !('roles' in member)) {
        await interaction.reply({ content: 'Could not verify roles.', ephemeral: true });
        return;
      }

      const rolesToAdd: string[] = [];
      const rolesToRemove: string[] = [];

      // Determine which roles to add/remove based on balance
      if (balance > 0 && HOLDER_ROLE_ID) {
        rolesToAdd.push(HOLDER_ROLE_ID);
      } else if (HOLDER_ROLE_ID) {
        rolesToRemove.push(HOLDER_ROLE_ID);
      }

      if (balance >= WHALE_THRESHOLD && WHALE_ROLE_ID) {
        rolesToAdd.push(WHALE_ROLE_ID);
      } else if (WHALE_ROLE_ID) {
        rolesToRemove.push(WHALE_ROLE_ID);
      }

      if (balance >= MEGA_WHALE_THRESHOLD && MEGA_WHALE_ROLE_ID) {
        rolesToAdd.push(MEGA_WHALE_ROLE_ID);
      } else if (MEGA_WHALE_ROLE_ID) {
        rolesToRemove.push(MEGA_WHALE_ROLE_ID);
      }

      try {
        const guildMember = member as GuildMember;
        for (const roleId of rolesToAdd) {
          if (!guildMember.roles.cache.has(roleId)) {
            await guildMember.roles.add(roleId);
          }
        }
        for (const roleId of rolesToRemove) {
          if (guildMember.roles.cache.has(roleId)) {
            await guildMember.roles.remove(roleId);
          }
        }
      } catch (err) {
        console.error('Role update failed:', err);
      }

      let tier = 'Non-holder';
      if (balance >= MEGA_WHALE_THRESHOLD) tier = 'Mega Whale (1M+)';
      else if (balance >= WHALE_THRESHOLD) tier = 'Whale (100K+)';
      else if (balance > 0) tier = 'Holder';

      await interaction.reply({
        content: `Verified: **${formatNumber(balance)} KAMIYO**\nTier: **${tier}**\nRoles updated.`,
        ephemeral: true,
      });
      break;
    }

    case 'tip': {
      const targetUser = interaction.options.getUser('user', true);
      const amount = interaction.options.getNumber('amount', true);
      const token = interaction.options.getString('token', true) as 'SOL' | 'KAMIYO';

      const senderWallet = data.walletLinks[interaction.user.id];
      if (!senderWallet) {
        await interaction.reply({
          content: 'Link your wallet first with `/link-wallet`',
          ephemeral: true,
        });
        return;
      }

      const recipientWallet = data.walletLinks[targetUser.id];

      if (targetUser.id === interaction.user.id) {
        await interaction.reply({ content: 'Cannot tip yourself.', ephemeral: true });
        return;
      }

      if (amount <= 0) {
        await interaction.reply({ content: 'Amount must be positive.', ephemeral: true });
        return;
      }

      // Check limits
      const minAmount = token === 'SOL' ? 0.001 : 1;
      const maxAmount = token === 'SOL' ? 10 : 1_000_000;

      if (amount < minAmount || amount > maxAmount) {
        await interaction.reply({
          content: `Amount must be between ${minAmount} and ${formatNumber(maxAmount)} ${token}.`,
          ephemeral: true,
        });
        return;
      }

      if (!recipientWallet) {
        // Create pending tip - recipient needs to link wallet
        await interaction.reply({
          content: `@${targetUser.username} hasn't linked a wallet yet. Ask them to use \`/link-wallet\` to receive tips.`,
          ephemeral: true,
        });
        return;
      }

      // For now, just show the tip intent - actual transfer would need signing
      await interaction.reply({
        content: `Tip ready: **${amount} ${token}** to @${targetUser.username}\n\nTo complete, send ${amount} ${token} to:\n\`${recipientWallet}\``,
        ephemeral: false,
      });
      break;
    }

    case 'leaderboard': {
      // Get all linked wallets and their balances
      const entries: { id: string; balance: number }[] = [];

      for (const [userId, wallet] of Object.entries(data.walletLinks)) {
        const balance = await getTokenBalance(wallet);
        if (balance > 0) {
          entries.push({ id: userId, balance });
        }
      }

      entries.sort((a, b) => b.balance - a.balance);
      const top10 = entries.slice(0, 10);

      if (top10.length === 0) {
        await interaction.reply({ content: 'No holders found in this server.', ephemeral: true });
        return;
      }

      const list = top10.map((e, i) => {
        const medal = i === 0 ? '1.' : i === 1 ? '2.' : i === 2 ? '3.' : `${i + 1}.`;
        return `${medal} <@${e.id}> - **${formatNumber(e.balance)}** KAMIYO`;
      }).join('\n');

      const embed = new EmbedBuilder()
        .setTitle('KAMIYO Holder Leaderboard')
        .setDescription(list)
        .setColor(0xff69b4)
        .setFooter({ text: 'Link wallet with /link-wallet to appear' })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
      break;
    }
  }
}

async function handleButton(interaction: ButtonInteraction) {
  const [action, choice, proposalId] = interaction.customId.split('_');
  if (action !== 'vote') return;

  const data = loadData();
  const proposal = data.proposals.find(p => p.id === proposalId);

  if (!proposal) {
    await interaction.reply({ content: 'Proposal not found.', ephemeral: true });
    return;
  }

  if (proposal.status !== 'active') {
    await interaction.reply({ content: 'This proposal has ended.', ephemeral: true });
    return;
  }

  const wallet = data.walletLinks[interaction.user.id];
  if (!wallet) {
    await interaction.reply({
      content: 'Link your wallet first with `/link-wallet`',
      ephemeral: true,
    });
    return;
  }

  let weight = proposal.snapshot[wallet];
  if (weight === undefined) {
    weight = await getTokenBalance(wallet);
    proposal.snapshot[wallet] = weight;
  }

  if (weight === 0) {
    await interaction.reply({
      content: 'You need KAMIYO tokens to vote.',
      ephemeral: true,
    });
    return;
  }

  proposal.votes = proposal.votes.filter(v => v.wallet !== wallet);

  proposal.votes.push({
    wallet,
    choice: choice as 'for' | 'against' | 'abstain',
    weight,
    timestamp: Date.now(),
  });

  saveData(data);

  try {
    const channel = await client.channels.fetch(proposal.channelId);
    if (channel?.isTextBased()) {
      const msg = await channel.messages.fetch(proposal.messageId);
      await msg.edit({ embeds: [createProposalEmbed(proposal)] });
    }
  } catch (error) {
    void error;
  }

  await interaction.reply({
    content: `Vote recorded: **${choice.toUpperCase()}** with ${formatNumber(weight)} KAMIYO`,
    ephemeral: true,
  });
}

if (!process.env.DISCORD_TOKEN) {
  console.error('DISCORD_TOKEN not set');
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);
