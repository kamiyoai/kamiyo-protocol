import OpenAI from 'openai';
import { logger } from './logger.js';

const XAI_API_KEY = process.env.XAI_API_KEY;

export const grokClient = XAI_API_KEY
  ? new OpenAI({
      apiKey: XAI_API_KEY,
      baseURL: 'https://api.x.ai/v1',
    })
  : null;

export function isGrokAvailable(): boolean {
  return !!grokClient;
}

if (grokClient) {
  logger.info('Grok client initialized');
} else {
  logger.warn('Grok client not available (XAI_API_KEY not set)');
}
