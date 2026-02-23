/**
 * Daily Scheduler - posts exactly twice per day at intentional times.
 *
 * Replaces the interval-based ProductionScheduler with a calendar-aware
 * scheduler that posts once in the morning window and once in the evening
 * window. Stateless across restarts: reconstructs state from Twitter timeline.
 */

import { EventEmitter } from 'events';
import { createXTools, type XToolsConfig, type ToolConfig } from '@kamiyo/agents';
import { createLogger, getMetrics, withRetry } from './lib';

const log = createLogger('kyoshin:daily-scheduler');
const metrics = getMetrics();

export type PostSlot = 'morning' | 'evening';

interface SlotState {
  name: PostSlot;
  targetTime: Date;
  posted: boolean;
  tweetId?: string;
}

interface DailySchedule {
  date: string; // YYYY-MM-DD UTC
  slots: SlotState[];
}

export interface DailySchedulerConfig {
  twitter: XToolsConfig;
  twitterHandle: string;
  morningWindow: [number, number]; // [startHourUTC, endHourUTC]
  eveningWindow: [number, number];
  onTick: (slot: PostSlot) => Promise<void>;
  onError?: (error: Error, slot: PostSlot) => void;
}

/**
 * Gaussian-distributed random number using Box-Muller transform.
 * Returns a value centered at `mean` with standard deviation `stddev`,
 * clamped to [min, max].
 */
function gaussianRandom(mean: number, stddev: number, min: number, max: number): number {
  let u1 = Math.random();
  let u2 = Math.random();
  // Avoid log(0)
  if (u1 === 0) u1 = 0.0001;
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  const value = mean + z * stddev;
  return Math.max(min, Math.min(max, value));
}

export class DailyScheduler extends EventEmitter {
  private config: DailySchedulerConfig;
  private xTools: ToolConfig[];
  private schedule: DailySchedule | null = null;
  private timer: NodeJS.Timeout | null = null;
  private midnightTimer: NodeJS.Timeout | null = null;
  private running = false;
  private consecutiveFailures = 0;

  constructor(config: DailySchedulerConfig) {
    super();
    this.config = config;
    this.xTools = createXTools(config.twitter);

    log.info('Daily scheduler initialized', {
      morningWindow: config.morningWindow,
      eveningWindow: config.eveningWindow,
      handle: config.twitterHandle,
    });
  }

  /**
   * Start the scheduler. Checks timeline to avoid duplicates, then schedules.
   */
  async start(): Promise<void> {
    if (this.running) {
      log.warn('Scheduler already running');
      return;
    }

    this.running = true;
    log.info('Daily scheduler starting');

    await this.buildTodaySchedule();
    this.scheduleNext();
    this.scheduleMidnightReset();

    this.emit('started');
    metrics.incrementCounter('daily_scheduler_started');
  }

  /**
   * Build today's schedule by checking what was already posted.
   */
  private async buildTodaySchedule(): Promise<void> {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);

    // Generate target times for today
    const morningTarget = this.generateSlotTime(now, this.config.morningWindow);
    const eveningTarget = this.generateSlotTime(now, this.config.eveningWindow);

    this.schedule = {
      date: dateStr,
      slots: [
        { name: 'morning', targetTime: morningTarget, posted: false },
        { name: 'evening', targetTime: eveningTarget, posted: false },
      ],
    };

    // Check timeline to mark already-posted slots
    await this.reconcileWithTimeline(now);

    log.info('Daily schedule built', {
      date: dateStr,
      morningTarget: morningTarget.toISOString(),
      morningPosted: this.schedule.slots[0].posted,
      eveningTarget: eveningTarget.toISOString(),
      eveningPosted: this.schedule.slots[1].posted,
    });
  }

  /**
   * Check Kyoshin's timeline to find posts already made today.
   * Prevents duplicates across deploys.
   */
  private async reconcileWithTimeline(now: Date): Promise<void> {
    if (!this.schedule) return;

    try {
      const getTimelineTool = this.xTools.find((t) => t.name === 'get_timeline');
      if (!getTimelineTool) {
        log.warn('get_timeline tool not found, skipping reconciliation');
        return;
      }

      const result = await withRetry(
        () => getTimelineTool.handler({
          limit: 20,
        }),
        { maxAttempts: 2, initialDelayMs: 2000 }
      );

      if (!result.success || !result.data || typeof result.data !== 'object') {
        log.warn('Timeline fetch failed', { error: result.error });
        return;
      }

      const timelineData = result.data as {
        tweets?: Array<{ id?: string; createdAt?: string }>;
      };
      const tweets = timelineData.tweets || [];

      const todayStart = new Date(now);
      todayStart.setUTCHours(0, 0, 0, 0);

      const [morningStart, morningEnd] = this.config.morningWindow;
      const [eveningStart, eveningEnd] = this.config.eveningWindow;

      for (const tweet of tweets) {
        const t = tweet as { createdAt?: string; id?: string };
        if (!t.createdAt) continue;

        const tweetTime = new Date(t.createdAt);
        if (tweetTime < todayStart) continue; // Not today

        const hour = tweetTime.getUTCHours();

        // Check if this tweet falls in the morning window
        if (hour >= morningStart && hour < morningEnd) {
          this.schedule.slots[0].posted = true;
          this.schedule.slots[0].tweetId = t.id;
          log.info('Morning slot already posted', { tweetId: t.id, time: t.createdAt });
        }

        // Check if this tweet falls in the evening window
        if (hour >= eveningStart && hour < eveningEnd) {
          this.schedule.slots[1].posted = true;
          this.schedule.slots[1].tweetId = t.id;
          log.info('Evening slot already posted', { tweetId: t.id, time: t.createdAt });
        }
      }

      metrics.incrementCounter('daily_scheduler_timeline_reconciled');
    } catch (error) {
      log.warn('Timeline reconciliation failed', { error: String(error) });
      // Continue without reconciliation -- may post slightly early but won't duplicate
      // because the timeline check happens on every restart
    }
  }

  /**
   * Generate a target time within a window using Gaussian distribution.
   */
  private generateSlotTime(today: Date, window: [number, number]): Date {
    const [startHour, endHour] = window;
    const midpoint = (startHour + endHour) / 2;
    const stddev = (endHour - startHour) / 4; // ~95% within window

    const hour = gaussianRandom(midpoint, stddev, startHour, endHour);
    const minutes = Math.floor(Math.random() * 60);

    const target = new Date(today);
    target.setUTCHours(Math.floor(hour), minutes, 0, 0);

    return target;
  }

  /**
   * Schedule the next pending slot.
   */
  private scheduleNext(): void {
    if (!this.running || !this.schedule) return;

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    const now = Date.now();
    const nextSlot = this.schedule.slots.find((s) => !s.posted && s.targetTime.getTime() > now);

    if (!nextSlot) {
      // All slots for today are done or past
      const remaining = this.schedule.slots.filter((s) => !s.posted);
      if (remaining.length > 0) {
        // Slots were missed (past their target time). Execute immediately.
        const missed = remaining[0];
        const timeSinceMissed = now - missed.targetTime.getTime();
        // Only execute if missed by less than 3 hours
        if (timeSinceMissed < 3 * 60 * 60 * 1000) {
          log.info('Executing missed slot', {
            slot: missed.name,
            missedBy: `${Math.round(timeSinceMissed / 60000)}m`,
          });
          this.executeTick(missed);
          return;
        }
        log.info('Slot missed by too much, skipping', {
          slot: missed.name,
          missedBy: `${Math.round(timeSinceMissed / 60000)}m`,
        });
      }

      log.info('All slots for today complete or past');
      return;
    }

    const delay = nextSlot.targetTime.getTime() - now;

    log.info('Next post scheduled', {
      slot: nextSlot.name,
      targetTime: nextSlot.targetTime.toISOString(),
      delayMs: delay,
      delayHuman: `${Math.round(delay / 60000)}m`,
    });

    metrics.recordGauge('daily_scheduler_next_tick_ms', delay);

    this.timer = setTimeout(() => {
      this.executeTick(nextSlot);
    }, delay);
  }

  /**
   * Execute a posting slot.
   */
  private async executeTick(slot: SlotState): Promise<void> {
    const startTime = Date.now();

    log.info('Executing slot', { slot: slot.name });
    metrics.incrementCounter('daily_scheduler_tick_started');

    try {
      await this.config.onTick(slot.name);

      slot.posted = true;
      this.consecutiveFailures = 0;

      const duration = Date.now() - startTime;

      log.info('Slot completed', { slot: slot.name, durationMs: duration });
      metrics.incrementCounter('daily_scheduler_tick_success');
      metrics.recordHistogram('daily_scheduler_tick_duration_ms', duration);

      this.emit('success', slot.name);
    } catch (error) {
      this.consecutiveFailures++;

      const err = error instanceof Error ? error : new Error(String(error));

      log.error('Slot failed', {
        slot: slot.name,
        error: err.message,
        consecutiveFailures: this.consecutiveFailures,
      });

      metrics.incrementCounter('daily_scheduler_tick_error');

      if (this.config.onError) {
        try {
          this.config.onError(err, slot.name);
        } catch {
          // Ignore callback errors
        }
      }

      // Retry once after 5 minutes if the slot isn't too far past
      if (this.consecutiveFailures <= 2) {
        const retryDelay = 5 * 60 * 1000;
        log.info('Scheduling retry', { slot: slot.name, retryDelay });
        this.timer = setTimeout(() => this.executeTick(slot), retryDelay);
        return;
      }

      this.emit('alert', `${slot.name} slot failed ${this.consecutiveFailures} times`);
    }

    // Schedule next slot
    this.scheduleNext();
  }

  /**
   * Schedule midnight UTC reset to build tomorrow's schedule.
   */
  private scheduleMidnightReset(): void {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(0, 5, 0, 0); // 00:05 UTC to avoid edge cases

    const delay = tomorrow.getTime() - now.getTime();

    this.midnightTimer = setTimeout(async () => {
      if (!this.running) return;

      log.info('Midnight reset: building new schedule');
      await this.buildTodaySchedule();
      this.scheduleNext();
      this.scheduleMidnightReset(); // Reschedule for next midnight
    }, delay);

    log.debug('Midnight reset scheduled', {
      resetAt: tomorrow.toISOString(),
      delayMs: delay,
    });
  }

  stop(): void {
    if (!this.running) return;

    this.running = false;

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (this.midnightTimer) {
      clearTimeout(this.midnightTimer);
      this.midnightTimer = null;
    }

    log.info('Daily scheduler stopped');
    metrics.incrementCounter('daily_scheduler_stopped');
    this.emit('stopped');
  }

  isRunning(): boolean {
    return this.running;
  }

  getSchedule(): DailySchedule | null {
    return this.schedule ? {
      ...this.schedule,
      slots: this.schedule.slots.map((s) => ({ ...s })),
    } : null;
  }

  getHealthStatus(): {
    healthy: boolean;
    running: boolean;
    consecutiveFailures: number;
    todaySlots: { name: string; posted: boolean; targetTime: string }[];
  } {
    return {
      healthy: this.consecutiveFailures < 3,
      running: this.running,
      consecutiveFailures: this.consecutiveFailures,
      todaySlots: this.schedule?.slots.map((s) => ({
        name: s.name,
        posted: s.posted,
        targetTime: s.targetTime.toISOString(),
      })) ?? [],
    };
  }
}
