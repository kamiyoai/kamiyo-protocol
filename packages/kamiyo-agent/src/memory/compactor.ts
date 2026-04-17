import type { LLMProvider, Message } from '../provider';
import type { WorkingMemory } from './working';

export interface CompactorConfig {
  provider?: LLMProvider;
  model?: string;
  maxSummaryTokens?: number;
}

export class Compactor {
  private provider: LLMProvider | null;
  private model: string;
  private maxSummaryTokens: number;

  constructor(config: CompactorConfig = {}) {
    this.provider = config.provider ?? null;
    this.model = config.model ?? 'claude-haiku-4-5-20251001';
    this.maxSummaryTokens = config.maxSummaryTokens ?? 500;
  }

  async compact(memory: WorkingMemory): Promise<void> {
    if (!memory.needsCompaction()) return;

    switch (memory.strategy) {
      case 'truncate':
        memory.truncate(4);
        break;
      case 'sliding-window':
        memory.slideWindow();
        break;
      case 'summarize':
        await this.summarize(memory);
        break;
    }
  }

  private async summarize(memory: WorkingMemory): Promise<void> {
    const messages = memory.getMessages();
    if (messages.length <= 4) return;

    const toSummarize = messages.slice(0, -2);
    const toKeep = messages.slice(-2);

    if (!this.provider) {
      memory.replaceMessages(toKeep);
      return;
    }

    const existing = memory.getCompactedSummary();
    const contextBlock = existing ? `Previous summary:\n${existing}\n\n` : '';
    const transcript = toSummarize
      .map(m => {
        const text = typeof m.content === 'string' ? m.content : extractText(m.content);
        return `${m.role}: ${text}`;
      })
      .join('\n');

    try {
      const response = await this.provider.chat({
        model: this.model,
        system:
          'Summarize this conversation concisely, preserving key facts, decisions, and context needed for continuation. Be brief.',
        messages: [
          {
            role: 'user',
            content: `${contextBlock}New messages to summarize:\n${transcript}`,
          },
        ],
        maxTokens: this.maxSummaryTokens,
      });

      if (response.text) {
        memory.setCompactedSummary(response.text);
      }
    } catch {
      // LLM unavailable — fall through to truncation
    }
    memory.replaceMessages(toKeep);
  }
}

function extractText(content: Message['content']): string {
  if (typeof content === 'string') return content;
  return content
    .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
    .map(c => c.text)
    .join(' ');
}
