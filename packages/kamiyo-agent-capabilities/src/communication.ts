import { z } from 'zod';
import { defineTool, type Capability, type ToolDefinition } from '@kamiyo-org/agent';

export interface CommunicationConfig {
  slack?: { token: string; defaultChannel?: string };
  discord?: { token: string; defaultChannel?: string };
  telegram?: { token: string; defaultChatId?: string };
}

const slackSchema = z.object({
  channel: z.string().optional(),
  message: z.string(),
  threadTs: z.string().optional(),
});

const discordSchema = z.object({
  channelId: z.string(),
  message: z.string(),
});

const telegramSchema = z.object({
  chatId: z.string().optional(),
  message: z.string(),
  parseMode: z.enum(['HTML', 'Markdown', 'MarkdownV2']).optional(),
});

export function communicationCapability(config: CommunicationConfig): Capability {
  const tools: ToolDefinition[] = [];

  if (config.slack) {
    const slackToken = config.slack.token;
    const defaultChannel = config.slack.defaultChannel;

    tools.push(
      defineTool({
        name: 'slack_send',
        description: 'Send a message to a Slack channel.',
        schema: slackSchema,
        category: 'communication',
        requiresApproval: true,
        handler: async input => {
          const channel = input.channel ?? defaultChannel;
          if (!channel) throw new Error('No channel specified');
          const res = await fetch('https://slack.com/api/chat.postMessage', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${slackToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              channel,
              text: input.message,
              thread_ts: input.threadTs,
            }),
          });
          return JSON.stringify(await res.json());
        },
      })
    );
  }

  if (config.discord) {
    const discordToken = config.discord.token;

    tools.push(
      defineTool({
        name: 'discord_send',
        description: 'Send a message to a Discord channel.',
        schema: discordSchema,
        category: 'communication',
        requiresApproval: true,
        handler: async input => {
          const res = await fetch(
            `https://discord.com/api/v10/channels/${input.channelId}/messages`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bot ${discordToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ content: input.message }),
            }
          );
          return JSON.stringify(await res.json());
        },
      })
    );
  }

  if (config.telegram) {
    const tgToken = config.telegram.token;
    const defaultChat = config.telegram.defaultChatId;

    tools.push(
      defineTool({
        name: 'telegram_send',
        description: 'Send a message via Telegram bot.',
        schema: telegramSchema,
        category: 'communication',
        requiresApproval: true,
        handler: async input => {
          const chatId = input.chatId ?? defaultChat;
          if (!chatId) throw new Error('No chat ID specified');
          const res = await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: input.message,
              parse_mode: input.parseMode,
            }),
          });
          return JSON.stringify(await res.json());
        },
      })
    );
  }

  if (tools.length === 0) {
    console.warn(
      '[kamiyo] communicationCapability: no services configured (slack/discord/telegram). No tools registered.'
    );
  }

  return {
    name: 'communication',
    description: 'Slack, Discord, and Telegram messaging tools',
    tools,
  };
}
