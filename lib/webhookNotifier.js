/**
 * Webhook Notification Service
 * 
 * Triggers webhook endpoints when new exploits are detected.
 * Filters by chain and amount, handles retries, and tracks failures.
 */

import prisma from './prisma';
import fetch from 'node-fetch';

/**
 * Send webhook notification for a new exploit
 * 
 * @param {Object} exploit - The exploit data
 * @returns {Promise<void>}
 */
export async function notifyWebhooks(exploit) {
  try {
    // Get all active webhooks
    const webhooks = await prisma.webhook.findMany({
      where: { status: 'active' },
      include: {
        user: {
          include: {
            subscriptions: {
              where: { status: 'active' },
              orderBy: { createdAt: 'desc' },
              take: 1
            }
          }
        }
      }
    });

    // Filter and trigger matching webhooks
    const promises = webhooks.map(async (webhook) => {
      // Check if user still has Team or Enterprise tier
      const tier = webhook.user.subscriptions[0]?.tier || 'free';
      if (!['team', 'enterprise'].includes(tier.toLowerCase())) {
        return; // Skip if user no longer has access
      }

      // Check chain filter
      if (webhook.chains) {
        try {
          const chainFilters = JSON.parse(webhook.chains);
          if (chainFilters.length > 0 && !chainFilters.includes(exploit.chain)) {
            return; // Skip if exploit chain doesn't match
          }
        } catch (e) {
          console.error(`Invalid chain filter for webhook ${webhook.id}:`, e);
        }
      }

      // Check minimum amount filter
      if (webhook.minAmount && exploit.amount_usd < webhook.minAmount) {
        return; // Skip if amount too small
      }

      // Trigger webhook
      await triggerWebhook(webhook, exploit);
    });

    await Promise.allSettled(promises);
  } catch (error) {
    console.error('Error in notifyWebhooks:', error);
  }
}

/**
 * Trigger a single webhook with retry logic
 * 
 * @param {Object} webhook - The webhook configuration
 * @param {Object} exploit - The exploit data
 * @returns {Promise<void>}
 */
async function triggerWebhook(webhook, exploit) {
  const payload = {
    event: 'exploit.detected',
    timestamp: new Date().toISOString(),
    data: {
      tx_hash: exploit.tx_hash,
      chain: exploit.chain,
      protocol: exploit.protocol,
      amount_usd: exploit.amount_usd,
      timestamp: exploit.timestamp,
      category: exploit.category,
      description: exploit.description,
      source: exploit.source,
      source_url: exploit.source_url
    }
  };

  const maxRetries = 3;
  let attempt = 0;
  let success = false;

  while (attempt < maxRetries && !success) {
    attempt++;
    
    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Kamiyo-Webhook/1.0',
          'X-Kamiyo-Event': 'exploit.detected',
          'X-Kamiyo-Webhook-Id': webhook.id
        },
        body: JSON.stringify(payload),
        timeout: 10000 // 10 second timeout
      });

      if (response.ok) {
        success = true;
        
        // Update webhook success stats
        await prisma.webhook.update({
          where: { id: webhook.id },
          data: {
            lastTrigger: new Date(),
            failCount: 0, // Reset fail count on success
            status: 'active'
          }
        });

        console.log(`Webhook ${webhook.id} triggered successfully for exploit ${exploit.tx_hash}`);
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      console.error(`Webhook ${webhook.id} attempt ${attempt} failed:`, error.message);
      
      // If this was the last attempt, update fail count
      if (attempt >= maxRetries) {
        const newFailCount = webhook.failCount + 1;
        const newStatus = newFailCount >= 10 ? 'failed' : 'active'; // Mark as failed after 10 consecutive failures
        
        await prisma.webhook.update({
          where: { id: webhook.id },
          data: {
            failCount: newFailCount,
            status: newStatus
          }
        });

        console.error(`Webhook ${webhook.id} failed after ${maxRetries} attempts. Fail count: ${newFailCount}`);
      }
      
      // Wait before retry (exponential backoff)
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }
  }
}

/**
 * Test a webhook endpoint
 * 
 * @param {string} webhookId - The webhook ID to test
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function testWebhook(webhookId) {
  try {
    const webhook = await prisma.webhook.findUnique({
      where: { id: webhookId }
    });

    if (!webhook) {
      return { success: false, message: 'Webhook not found' };
    }

    const testPayload = {
      event: 'webhook.test',
      timestamp: new Date().toISOString(),
      message: 'This is a test notification from Kamiyo',
      data: {
        tx_hash: '0xtest123...',
        chain: 'Ethereum',
        protocol: 'Test Protocol',
        amount_usd: 100000,
        timestamp: new Date().toISOString(),
        category: 'Test',
        description: 'Test exploit notification'
      }
    };

    const response = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Kamiyo-Webhook/1.0',
        'X-Kamiyo-Event': 'webhook.test',
        'X-Kamiyo-Webhook-Id': webhook.id
      },
      body: JSON.stringify(testPayload),
      timeout: 10000
    });

    if (response.ok) {
      await prisma.webhook.update({
        where: { id: webhookId },
        data: {
          lastTrigger: new Date(),
          failCount: 0,
          status: 'active'
        }
      });

      return { success: true, message: 'Webhook test successful' };
    } else {
      return { success: false, message: `HTTP ${response.status}: ${response.statusText}` };
    }
  } catch (error) {
    return { success: false, message: error.message };
  }
}
