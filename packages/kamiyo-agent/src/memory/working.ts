import type { Message } from '../provider';

export interface WorkingMemoryConfig {
  maxTokens?: number;
  compactionThreshold?: number; // fraction (0-1) of maxTokens that triggers compaction
  strategy?: 'summarize' | 'truncate' | 'sliding-window';
}

const CHARS_PER_TOKEN = 4; // rough estimate

export class WorkingMemory {
  private messages: Message[] = [];
  private systemContext: string = '';
  private compactedSummary: string | null = null;
  private readonly maxTokens: number;
  private readonly threshold: number;
  readonly strategy: 'summarize' | 'truncate' | 'sliding-window';

  constructor(config: WorkingMemoryConfig = {}) {
    this.maxTokens = config.maxTokens ?? 100_000;
    this.threshold = config.compactionThreshold ?? 0.8;
    this.strategy = config.strategy ?? 'summarize';
  }

  setSystemContext(ctx: string): void {
    this.systemContext = ctx;
  }

  getSystemContext(): string {
    return this.systemContext;
  }

  push(message: Message): void {
    this.messages.push(message);
  }

  getMessages(): Message[] {
    return [...this.messages];
  }

  getAll(): Message[] {
    const result: Message[] = [];
    if (this.compactedSummary) {
      result.push({ role: 'system', content: this.compactedSummary });
    }
    result.push(...this.messages);
    return result;
  }

  get length(): number {
    return this.messages.length;
  }

  estimateTokens(): number {
    let chars = this.systemContext.length;
    if (this.compactedSummary) chars += this.compactedSummary.length;
    for (const msg of this.messages) {
      chars += messageChars(msg);
    }
    return Math.ceil(chars / CHARS_PER_TOKEN);
  }

  needsCompaction(): boolean {
    return this.estimateTokens() >= this.maxTokens * this.threshold;
  }

  truncate(keep: number): Message[] {
    if (this.messages.length <= keep) return [];
    const removed = this.messages.splice(0, this.messages.length - keep);
    return removed;
  }

  slideWindow(): Message[] {
    const removed: Message[] = [];
    while (this.needsCompaction() && this.messages.length > 2) {
      removed.push(this.messages.shift()!);
    }
    return removed;
  }

  setCompactedSummary(summary: string): void {
    this.compactedSummary = summary;
  }

  getCompactedSummary(): string | null {
    return this.compactedSummary;
  }

  replaceMessages(messages: Message[]): void {
    this.messages = [...messages];
  }

  clear(): void {
    this.messages = [];
    this.compactedSummary = null;
    this.systemContext = '';
  }
}

function messageChars(msg: Message): number {
  if (typeof msg.content === 'string') return msg.content.length;
  let total = 0;
  for (const part of msg.content) {
    if ('text' in part) total += part.text.length;
    else if ('content' in part) total += part.content.length;
    else if ('input' in part) total += JSON.stringify(part.input).length;
  }
  return total;
}
