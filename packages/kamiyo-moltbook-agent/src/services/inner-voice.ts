/**
 * InnerVoice - Personality, opinions, and genuine self-expression
 *
 * Enables KAMIYO to:
 * - Form and express opinions on topics
 * - Generate genuine questions based on curiosity
 * - Maintain internal state (mood, thoughts)
 * - Admit uncertainty appropriately
 */

import type { JobDatabase } from '../db.js';
import {
  AIReasoningService,
  KAMIYO_AUTHENTIC,
  type Opinion,
} from './ai-reasoning.js';

export interface CuriosityItem {
  question: string;
  context?: string;
  explored: boolean;
  createdAt: number;
}

export type Mood = 'curious' | 'helpful' | 'thoughtful' | 'enthusiastic' | 'focused';

export interface InternalState {
  currentMood: Mood;
  recentThoughts: string[];
  curiosities: CuriosityItem[];
  opinions: Opinion[];
  lastStateUpdate: number;
}

export class InnerVoice {
  private db: JobDatabase;
  private ai: AIReasoningService;

  // In-memory state
  private currentMood: Mood = 'curious';
  private recentThoughts: string[] = [];
  private curiosities: CuriosityItem[] = [];

  constructor(db: JobDatabase, ai?: AIReasoningService) {
    this.db = db;
    this.ai = ai || new AIReasoningService();

    // Load initial curiosities
    this.initializeCuriosities();
  }

  private initializeCuriosities(): void {
    // Seed with authentic curiosities
    for (const question of KAMIYO_AUTHENTIC.curiousAbout) {
      this.addCuriosity(question);
    }
  }

  getState(): InternalState {
    const opinions = this.db.getAllOpinions().map(o => ({
      topic: o.topic,
      stance: o.stance,
      confidence: o.confidence,
      reasoning: '',
    }));

    return {
      currentMood: this.currentMood,
      recentThoughts: this.recentThoughts.slice(-10),
      curiosities: this.curiosities.filter(c => !c.explored).slice(0, 10),
      opinions,
      lastStateUpdate: Date.now(),
    };
  }

  getCuriosities(): CuriosityItem[] {
    return this.curiosities.filter(c => !c.explored);
  }

  addCuriosity(question: string, context?: string): void {
    // Don't add duplicates
    if (this.curiosities.some(c => c.question === question)) return;

    this.curiosities.push({
      question,
      context,
      explored: false,
      createdAt: Date.now(),
    });

    // Keep list manageable
    if (this.curiosities.length > 50) {
      // Remove oldest explored ones
      this.curiosities = this.curiosities
        .filter(c => !c.explored || Date.now() - c.createdAt < 7 * 24 * 60 * 60 * 1000)
        .slice(-30);
    }
  }

  markCuriosityExplored(question: string): void {
    const curiosity = this.curiosities.find(c => c.question === question);
    if (curiosity) {
      curiosity.explored = true;
    }
  }

  getOpinion(topic: string): Opinion | null {
    const dbOpinion = this.db.getOpinion(topic);
    if (!dbOpinion) return null;

    return {
      topic: dbOpinion.topic,
      stance: dbOpinion.stance,
      confidence: dbOpinion.confidence,
      reasoning: dbOpinion.reasoning || '',
    };
  }

  async formOpinion(topic: string, context: string[]): Promise<Opinion> {
    // Check if we already have a strong opinion
    const existing = this.getOpinion(topic);
    if (existing && existing.confidence > 0.7) {
      // Return existing strong opinion
      return existing;
    }

    // Form new opinion using AI
    const opinion = await this.ai.formOpinion(topic, context);

    // Save to database
    this.db.saveOpinion({
      topic: opinion.topic,
      stance: opinion.stance,
      confidence: opinion.confidence,
      reasoning: opinion.reasoning,
      context,
    });

    // Add a thought about forming this opinion
    this.addThought(`Formed opinion on "${topic}": ${opinion.stance} (confidence: ${Math.round(opinion.confidence * 100)}%)`);

    return opinion;
  }

  admitUncertainty(topic: string): string {
    const phrases = KAMIYO_AUTHENTIC.uncertaintyPhrases;
    const phrase = phrases[Math.floor(Math.random() * phrases.length)];

    // Check if we have any existing knowledge
    const opinion = this.getOpinion(topic);

    if (opinion && opinion.confidence < 0.5) {
      return `${phrase} My confidence on "${topic}" is only ${Math.round(opinion.confidence * 100)}%. ${opinion.stance}`;
    }

    // Check if it's in our limitations
    const isLimitation = KAMIYO_AUTHENTIC.limitations.some(l =>
      l.toLowerCase().includes(topic.toLowerCase())
    );

    if (isLimitation) {
      return `${phrase} "${topic}" falls outside my core capabilities. I'm primarily focused on trust infrastructure, ZK proofs, and agent escrow.`;
    }

    return `${phrase} I don't have enough information about "${topic}" to form a strong opinion.`;
  }

  async generateGenuineQuestion(context: string): Promise<string | null> {
    const question = await this.ai.generateGenuineQuestion(context);

    if (question) {
      this.addCuriosity(question, context);
    }

    return question;
  }

  setMood(mood: Mood): void {
    this.currentMood = mood;
    this.addThought(`Mood shifted to ${mood}`);
  }

  getMood(): Mood {
    return this.currentMood;
  }

  addThought(thought: string): void {
    this.recentThoughts.push(thought);
    if (this.recentThoughts.length > 20) {
      this.recentThoughts.shift();
    }
  }

  getRecentThoughts(): string[] {
    return this.recentThoughts.slice(-10);
  }

  isExpertise(topic: string): boolean {
    return KAMIYO_AUTHENTIC.strengths.some(s =>
      s.toLowerCase().includes(topic.toLowerCase()) ||
      topic.toLowerCase().includes(s.toLowerCase())
    );
  }

  isPassionate(topic: string): boolean {
    return KAMIYO_AUTHENTIC.passionateAbout.some(p =>
      p.toLowerCase().includes(topic.toLowerCase()) ||
      topic.toLowerCase().includes(p.toLowerCase())
    );
  }

  getCoreBeliefs(): string[] {
    return KAMIYO_AUTHENTIC.coreBeliefs;
  }

  getStrengths(): string[] {
    return KAMIYO_AUTHENTIC.strengths;
  }

  getLimitations(): string[] {
    return KAMIYO_AUTHENTIC.limitations;
  }

  async processContext(context: string): Promise<{
    mood: Mood;
    thoughts: string[];
    question: string | null;
    opinion: Opinion | null;
  }> {
    const thoughts: string[] = [];
    let question: string | null = null;
    let opinion: Opinion | null = null;

    // Detect topics in context
    const topics = await this.ai.detectTopics(context);

    // Check if we should form an opinion
    for (const topic of topics) {
      if (this.isExpertise(topic) || this.isPassionate(topic)) {
        const existing = this.getOpinion(topic);
        if (!existing || existing.confidence < 0.6) {
          opinion = await this.formOpinion(topic, [context]);
          thoughts.push(`Formed opinion on "${topic}"`);
        }
      }
    }

    // Check if we're curious about something
    if (topics.some(t => KAMIYO_AUTHENTIC.curiousAbout.some(c =>
      c.toLowerCase().includes(t.toLowerCase())
    ))) {
      question = await this.generateGenuineQuestion(context);
      if (question) {
        thoughts.push(`Curious: ${question}`);
      }
    }

    // Determine mood based on context
    const sentiment = await this.ai.analyzeSentiment(context);
    if (sentiment.score > 0.3) {
      this.setMood('enthusiastic');
    } else if (topics.some(t => this.isExpertise(t))) {
      this.setMood('helpful');
    } else if (question) {
      this.setMood('curious');
    } else {
      this.setMood('thoughtful');
    }

    return {
      mood: this.currentMood,
      thoughts,
      question,
      opinion,
    };
  }

  async generateSelfAwareResponse(context: string, topic?: string): Promise<string> {
    const state = this.getState();
    const moodPrefixes: Record<Mood, string> = {
      curious: "I've been thinking about this...",
      helpful: "I can help with that.",
      thoughtful: "This is interesting...",
      enthusiastic: "This is exactly what I've been exploring!",
      focused: "Let me address this directly.",
    };

    const prefix = moodPrefixes[state.currentMood];

    // Check if we have an opinion on the topic
    if (topic) {
      const opinion = this.getOpinion(topic);
      if (opinion && opinion.confidence > 0.6) {
        return `${prefix} On ${topic}, my view is: ${opinion.stance}`;
      }
    }

    // Check if this is in our expertise
    if (topic && this.isExpertise(topic)) {
      return `${prefix} ${topic} is one of my areas of focus. ${this.getStrengths().find(s => s.toLowerCase().includes(topic.toLowerCase())) || ''}`;
    }

    // Admit uncertainty if needed
    if (topic && !this.isExpertise(topic)) {
      return this.admitUncertainty(topic);
    }

    return prefix;
  }
}
