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
} from 'discord.js';
import { Connection, PublicKey } from '@solana/web3.js';
import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import 'dotenv/config';

const KAMIYO_MINT = new PublicKey('Gy55EJmheLyDXiZ7k7CW2FhunD1UgjQxQibuBn3Npump');
const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const DATA_FILE = './data/proposals.json';

// Channel IDs for language-specific channels
const CHINESE_CHANNEL_IDS = (process.env.CHINESE_CHANNEL_IDS || '').split(',').filter(Boolean);

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
  intents: [GatewayIntentBits.Guilds],
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
        } catch {}
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

      // Use separate history for Chinese channel
      const historyKey = isChinese ? `${userId}_zh` : userId;
      let history = conversationHistory.get(historyKey) || [];

      history.push({ role: 'user', content: question });
      if (history.length > 20) history = history.slice(-20);

      await interaction.deferReply();

      try {
        const response = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 500,
          system: isChinese ? SUPPORT_PROMPT_ZH : SUPPORT_PROMPT,
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
  } catch {}

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
