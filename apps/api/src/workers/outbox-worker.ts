import { randomUUID } from 'node:crypto';
import type { OutboxMessage } from '@arrival/contracts';
import type { IOutboxRepository } from '../repositories/interfaces.js';
import { logger } from '../logger.js';

export type OutboxMessageHandler = (message: OutboxMessage) => Promise<void>;

export interface OutboxWorkerOptions {
  workerId?: string;
  batchSize?: number;
  leaseDurationMs?: number;
  pollIntervalMs?: number;
  maxConcurrency?: number;
  baseBackoffMs?: number;
}

export class OutboxWorker {
  readonly workerId: string;
  private readonly batchSize: number;
  private readonly leaseDurationMs: number;
  private readonly pollIntervalMs: number;
  private readonly maxConcurrency: number;
  private readonly baseBackoffMs: number;

  private running = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private activeProcessing: Promise<unknown> | null = null;
  private lastProcessedAt: string | null = null;
  private totalClaimed = 0;
  private totalCompleted = 0;
  private totalRetried = 0;
  private totalDeadLettered = 0;
  private totalHandlerErrors = 0;

  getHealthMetrics() {
    return {
      workerId: this.workerId,
      running: this.running,
      lastProcessedAt: this.lastProcessedAt,
      totalClaimed: this.totalClaimed,
      totalCompleted: this.totalCompleted,
      totalRetried: this.totalRetried,
      totalDeadLettered: this.totalDeadLettered,
      totalHandlerErrors: this.totalHandlerErrors,
    };
  }

  constructor(
    private readonly outboxRepo: IOutboxRepository,
    private readonly handlers: Record<string, OutboxMessageHandler>,
    options?: OutboxWorkerOptions
  ) {
    this.workerId = options?.workerId || `worker-${randomUUID().slice(0, 8)}`;
    this.batchSize = Math.min(Math.max(options?.batchSize ?? 10, 1), 100);
    this.leaseDurationMs = options?.leaseDurationMs ?? 30_000;
    this.pollIntervalMs = options?.pollIntervalMs ?? 1_000;
    this.maxConcurrency = Math.min(Math.max(options?.maxConcurrency ?? 5, 1), 20);
    this.baseBackoffMs = options?.baseBackoffMs ?? 1_000;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    logger.info(`OutboxWorker [${this.workerId}] started`);
    this.scheduleNextPoll();
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.activeProcessing) {
      await this.activeProcessing;
    }
    logger.info(`OutboxWorker [${this.workerId}] stopped gracefully`);
  }

  private scheduleNextPoll(): void {
    if (!this.running) return;
    this.timer = setTimeout(() => {
      if (!this.running) return;
      this.activeProcessing = this.processOnce()
        .catch((err) => {
          logger.error(`OutboxWorker [${this.workerId}] poll error`, err);
        })
        .finally(() => {
          this.activeProcessing = null;
          this.scheduleNextPoll();
        });
    }, this.pollIntervalMs);
  }

  async processOnce(): Promise<{
    claimed: number;
    completed: number;
    retried: number;
    deadLettered: number;
  }> {
    const messages = await this.outboxRepo.claimBatch(
      this.workerId,
      this.batchSize,
      this.leaseDurationMs
    );

    const stats = {
      claimed: messages.length,
      completed: 0,
      retried: 0,
      deadLettered: 0,
    };

    if (messages.length === 0) {
      return stats;
    }

    // Bounded concurrency batch execution
    for (let i = 0; i < messages.length; i += this.maxConcurrency) {
      const chunk = messages.slice(i, i + this.maxConcurrency);
      await Promise.all(
        chunk.map(async (msg) => {
          const leaseToken = msg.leaseToken || '';
          const handler = this.handlers[msg.eventType];

          if (!handler) {
            await this.outboxRepo.deadLetter(
              msg.id,
              leaseToken,
              `No handler registered for outbox eventType "${msg.eventType}"`
            );
            stats.deadLettered += 1;
            return;
          }

          try {
            await handler(msg);
            const ok = await this.outboxRepo.complete(msg.id, leaseToken);
            if (ok) {
              stats.completed += 1;
            }
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            const maxAttempts = msg.maxAttempts ?? 5;

            if (msg.attempts >= maxAttempts) {
              await this.outboxRepo.deadLetter(msg.id, leaseToken, errorMsg);
              stats.deadLettered += 1;
            } else {
              // Bounded exponential backoff with jitter
              const expDelay = Math.min(300_000, this.baseBackoffMs * Math.pow(2, msg.attempts - 1));
              const jitter = Math.floor(Math.random() * 250);
              const nextAvailableAt = new Date(Date.now() + expDelay + jitter).toISOString();
              await this.outboxRepo.scheduleRetry(msg.id, leaseToken, nextAvailableAt, errorMsg);
              stats.retried += 1;
            }
          }
        })
      );
    }

    this.recordStats(stats);
    return stats;
  }

  private recordStats(stats: { claimed: number; completed: number; retried: number; deadLettered: number }) {
    this.totalClaimed += stats.claimed;
    this.totalCompleted += stats.completed;
    this.totalRetried += stats.retried;
    this.totalDeadLettered += stats.deadLettered;
    this.totalHandlerErrors += stats.retried + stats.deadLettered;
    if (stats.claimed > 0) {
      this.lastProcessedAt = new Date().toISOString();
    }
  }
}
