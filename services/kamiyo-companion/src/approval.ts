/**
 * Post approval system
 * Options: DM-based approval OR Claude self-review (autonomous mode)
 */

import Anthropic from '@anthropic-ai/sdk';
import { TwitterApi } from 'twitter-api-v2';
import { logger } from './logger';
import { QueuedPost, approvePost, rejectPost, getPendingPosts, getPersonalityState } from './autonomous';

// Owner's Twitter user ID for DM-based approval
const OWNER_USER_ID = process.env.OWNER_TWITTER_ID;

// Approval mode: 'dm' | 'auto' | 'hybrid'
// dm = require owner approval via DM
// auto = Claude self-reviews and decides
// hybrid = auto-approve safe content, DM for edgy stuff
const APPROVAL_MODE = process.env.APPROVAL_MODE || 'hybrid';

// Self-review prompt for Claude
const SELF_REVIEW_PROMPT = `You are reviewing a tweet before it gets posted. Evaluate it for:

1. Quality - Is it interesting, funny, or thought-provoking?
2. Safety - Could it cause harm, be offensive, or get the account banned?
3. Brand alignment - Does it match KAMIYO's personality (crypto-native, direct, slightly spicy but not toxic)?
4. Engagement potential - Will people want to reply or share?

Rate 1-10 and decide: APPROVE or REJECT.

Respond in JSON only:
{"score": <1-10>, "decision": "APPROVE" or "REJECT", "reason": "<brief reason>"}

Be strict but not paranoid. Slightly edgy is fine. Cringe, harmful, or off-brand is not.`;

interface ReviewResult {
  score: number;
  decision: 'APPROVE' | 'REJECT';
  reason: string;
}

// Have Claude review its own generated content
export async function selfReview(anthropic: Anthropic, post: QueuedPost): Promise<ReviewResult> {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 100,
      system: SELF_REVIEW_PROMPT,
      messages: [{ role: 'user', content: `Tweet to review:\n"${post.content}"` }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('');

    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      const result = JSON.parse(match[0]);
      return {
        score: Math.max(1, Math.min(10, result.score || 5)),
        decision: result.decision === 'APPROVE' ? 'APPROVE' : 'REJECT',
        reason: result.reason || 'No reason given',
      };
    }
  } catch (err) {
    logger.error('Self-review failed', { error: String(err) });
  }

  // Default to reject if review fails
  return { score: 0, decision: 'REJECT', reason: 'Review failed' };
}

// Send pending posts to owner via DM
export async function sendPendingToDM(twitter: TwitterApi): Promise<void> {
  if (!OWNER_USER_ID) {
    logger.warn('No OWNER_TWITTER_ID set, cannot send DM approvals');
    return;
  }

  const pending = getPendingPosts();
  if (pending.length === 0) return;

  try {
    // Send each pending post as a DM
    for (const post of pending.slice(0, 3)) { // Max 3 at a time
      const message = `[Pending #${post.id}]\n\n"${post.content}"\n\nReply: approve ${post.id} OR reject ${post.id}`;

      await twitter.v2.sendDmToParticipant(OWNER_USER_ID, {
        text: message,
      });

      logger.info('Sent approval DM', { postId: post.id });

      // Rate limit protection
      await new Promise(r => setTimeout(r, 1000));
    }
  } catch (err) {
    logger.error('Failed to send approval DMs', { error: String(err) });
  }
}

// Process DM responses for approvals
export async function processDMApprovals(twitter: TwitterApi): Promise<void> {
  if (!OWNER_USER_ID) return;

  try {
    // Get recent DMs from owner
    const events = await twitter.v2.listDmEventsWithParticipant(OWNER_USER_ID, {
      'dm_event.fields': ['text', 'created_at', 'sender_id'],
      max_results: 20,
    });

    if (!events.data?.data) return;

    for (const event of events.data.data) {
      // Only process messages FROM owner (not our own replies)
      if (event.sender_id !== OWNER_USER_ID) continue;
      if (event.event_type !== 'MessageCreate') continue;

      const text = event.text?.toLowerCase() || '';

      // Check for approval commands
      const approveMatch = text.match(/approve\s+(\d+)/);
      if (approveMatch) {
        const id = parseInt(approveMatch[1], 10);
        if (approvePost(id)) {
          logger.info('Post approved via DM', { id });
          await twitter.v2.sendDmToParticipant(OWNER_USER_ID, {
            text: `Approved #${id}`,
          });
        }
      }

      const rejectMatch = text.match(/reject\s+(\d+)/);
      if (rejectMatch) {
        const id = parseInt(rejectMatch[1], 10);
        if (rejectPost(id, 'Rejected via DM')) {
          logger.info('Post rejected via DM', { id });
          await twitter.v2.sendDmToParticipant(OWNER_USER_ID, {
            text: `Rejected #${id}`,
          });
        }
      }

      // Bulk approve all
      if (text === 'approve all') {
        const pending = getPendingPosts();
        for (const post of pending) {
          approvePost(post.id);
        }
        logger.info('Bulk approved all pending posts', { count: pending.length });
        await twitter.v2.sendDmToParticipant(OWNER_USER_ID, {
          text: `Approved ${pending.length} posts`,
        });
      }
    }
  } catch (err) {
    logger.error('Failed to process DM approvals', { error: String(err) });
  }
}

// Auto-approve based on self-review score
export async function autoApprove(anthropic: Anthropic): Promise<number> {
  const pending = getPendingPosts();
  let approved = 0;

  for (const post of pending) {
    const review = await selfReview(anthropic, post);

    logger.info('Self-review result', {
      postId: post.id,
      score: review.score,
      decision: review.decision,
      reason: review.reason,
    });

    if (review.decision === 'APPROVE' && review.score >= 6) {
      approvePost(post.id);
      approved++;
    } else if (review.decision === 'REJECT' || review.score < 4) {
      rejectPost(post.id, review.reason);
    }
    // Score 4-5 with REJECT stays pending for manual review

    // Small delay between reviews
    await new Promise(r => setTimeout(r, 500));
  }

  return approved;
}

// Hybrid mode: auto-approve high-quality, DM for uncertain
export async function hybridApprove(anthropic: Anthropic, twitter: TwitterApi): Promise<void> {
  const pending = getPendingPosts();
  const needsManualReview: QueuedPost[] = [];

  for (const post of pending) {
    const review = await selfReview(anthropic, post);

    if (review.decision === 'APPROVE' && review.score >= 7) {
      // High confidence - auto approve
      approvePost(post.id);
      logger.info('Auto-approved', { postId: post.id, score: review.score });
    } else if (review.decision === 'REJECT' && review.score <= 3) {
      // Obviously bad - auto reject
      rejectPost(post.id, review.reason);
      logger.info('Auto-rejected', { postId: post.id, score: review.score });
    } else {
      // Uncertain - needs manual review
      needsManualReview.push(post);
    }

    await new Promise(r => setTimeout(r, 500));
  }

  // Send uncertain ones for DM review
  if (needsManualReview.length > 0 && OWNER_USER_ID) {
    try {
      const summary = needsManualReview
        .map(p => `#${p.id}: "${p.content.slice(0, 50)}..."`)
        .join('\n');

      await twitter.v2.sendDmToParticipant(OWNER_USER_ID, {
        text: `${needsManualReview.length} posts need review:\n\n${summary}\n\nReply: approve <id> or reject <id>`,
      });
    } catch (err) {
      logger.error('Failed to send review DM', { error: String(err) });
    }
  }
}

// Main approval handler - call periodically
export async function runApprovalCycle(anthropic: Anthropic, twitter: TwitterApi): Promise<void> {
  switch (APPROVAL_MODE) {
    case 'auto':
      await autoApprove(anthropic);
      break;
    case 'dm':
      await sendPendingToDM(twitter);
      await processDMApprovals(twitter);
      break;
    case 'hybrid':
    default:
      await hybridApprove(anthropic, twitter);
      await processDMApprovals(twitter);
      break;
  }
}

export { APPROVAL_MODE };
