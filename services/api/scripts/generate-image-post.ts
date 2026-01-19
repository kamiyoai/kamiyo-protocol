#!/usr/bin/env npx ts-node
// Generate a post with AI-generated KAMIYO image

import Anthropic from '@anthropic-ai/sdk';
import { generateMeme, isImageGenAvailable } from '../src/image-gen';
import { queueManualPost, approvePost } from '../src/autonomous';

const args = process.argv.slice(2);
const autoApprove = args.includes('--approve');
const topic = args.find(a => a !== '--approve') || 'crypto markets';

async function main() {
  if (!isImageGenAvailable()) {
    console.error('No image generation service available (need XAI_API_KEY or OPENAI_API_KEY)');
    process.exit(1);
  }

  const anthropic = new Anthropic();

  console.log(`Generating image for topic: "${topic}"`);
  const image = await generateMeme(anthropic, topic);

  if (!image) {
    console.error('Image generation failed');
    process.exit(1);
  }

  console.log(`Image saved: ${image.path}`);
  console.log(`Prompt: ${image.prompt.slice(0, 100)}...`);

  // Generate tweet text
  console.log('Generating tweet text...');
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 60,
    system: `You are KAMIYO, a cyberpunk AI agent. Write a short tweet (under 200 chars) about: ${topic}.
Be cryptic, confident, slightly edgy. No emojis. No hashtags. Lowercase preferred.`,
    messages: [{ role: 'user', content: 'Write the tweet.' }],
  });

  const tweetText = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('')
    .trim()
    .replace(/^["']|["']$/g, '');

  console.log(`Tweet: "${tweetText}"`);

  const post = queueManualPost(tweetText, image.path);
  console.log(`Queued post #${post.id}`);

  if (autoApprove) {
    approvePost(post.id);
    console.log('Auto-approved. Will post on next cycle.');
  } else {
    console.log('Status: pending (use --approve to auto-approve)');
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
