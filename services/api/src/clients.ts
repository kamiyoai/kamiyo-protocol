/**
 * Centralized API clients
 * Single instances shared across all modules
 */

import OpenAI from 'openai';
import Database, { Database as DatabaseType } from 'better-sqlite3';
import { mkdirSync, existsSync } from 'fs';
import { logger } from './logger';

const XAI_API_KEY = process.env.XAI_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const DATA_DIR = process.env.DATA_DIR || './data';

// Ensure data directory exists
if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

// Grok (xAI) client - used for Live Search and image generation
export const grokClient = XAI_API_KEY ? new OpenAI({
  apiKey: XAI_API_KEY,
  baseURL: 'https://api.x.ai/v1',
}) : null;

// OpenAI client - DALL-E 3 fallback
export const openaiClient = OPENAI_API_KEY ? new OpenAI({
  apiKey: OPENAI_API_KEY,
}) : null;

// Shared database connection
export const db: DatabaseType = new Database(`${DATA_DIR}/autonomous.db`);

// Check client availability
export function isGrokAvailable(): boolean {
  return !!grokClient;
}

export function isOpenAIAvailable(): boolean {
  return !!openaiClient;
}

if (grokClient) {
  logger.info('Grok client initialized');
}

if (openaiClient) {
  logger.info('OpenAI client initialized');
}
