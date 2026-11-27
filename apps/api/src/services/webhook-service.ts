import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  ArrivalError,
  canTransitionOrder,
  canTransitionPayment,
  canTransitionFulfilment,
  type WebhookInboxMessage,
  type OrderState,
  type PaymentState,
  type FulfilmentState,
} from '@arrival/contracts';
import type {
  IWebhookInboxRepository,
  IOrderRepository,
  IPaymentRepository,
  IFulfilmentRepository,
} from '../repositories/interfaces.js';

export interface WebhookSignatureVerifier {
  verify(params: {
    providerKey: string;
    rawBody: string;
    signatureHeader?: string | undefined;
    timestampHeader?: string | undefined;
  }): boolean;
}

/**
 * Deterministic HMAC-SHA256 verifier for sandbox/test adapters.
 * Format: signatureHeader = "v1=<hex_hmac_sha256(secret, `${timestamp}.${rawBody}`)>".
 * Real production provider adapters must implement each provider's actual documented protocol.
 */
export class HmacSha256TestWebhookVerifier implements WebhookSignatureVerifier {
  constructor(private readonly secretsByProvider: Record<string, string>) {}

  verify(params: {
    providerKey: string;
    rawBody: string;
    signatureHeader?: string | undefined;
    timestampHeader?: string | undefined;
  }): boolean {
    const secret = this.secretsByProvider[params.providerKey];
    if (!secret || !params.signatureHeader || !params.timestampHeader) {
      return false;
    }

    const sigMatch = params.signatureHeader.match(/^v1=([0-9a-fA-F]{64})$/);
    if (!sigMatch) {
      return false;
    }

    const expectedHex = createHmac('sha256', secret)
      .update(`${params.timestampHeader}.${params.rawBody}`)
      .digest('hex');

    const providedBuf = Buffer.from(sigMatch[1]!.toLowerCase(), 'hex');
    const expectedBuf = Buffer.from(expectedHex.toLowerCase(), 'hex');
    if (providedBuf.length !== expectedBuf.length) {
      return false;
    }

    return timingSafeEqual(providedBuf, expectedBuf);
  }
}

const SENSITIVE_KEYS = new Set([
  'card',
  'pan',
  'cvv',
  'secret',
  'token',
  'password',
  'address',
  'recipient',
  'email',
  'phone',
  'authorization',
]);

export function redactWebhookPayload(payload: unknown, depth = 0): unknown {
  if (depth > 6 || payload === null || typeof payload !== 'object') {
    return payload;
  }
  if (Array.isArray(payload)) {
    return payload.map((item) => redactWebhookPayload(item, depth + 1));
  }
  const redacted: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(payload as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      redacted[key] = '[REDACTED]';
    } else {
      redacted[key] = redactWebhookPayload(val, depth + 1);
    }
  }
  return redacted;
}

export class WebhookService {
  constructor(
    private readonly webhookRepo: IWebhookInboxRepository,
    private readonly verifier: WebhookSignatureVerifier,
    private readonly orderRepo: IOrderRepository,
    private readonly paymentRepo: IPaymentRepository,
    private readonly fulfilmentRepo: IFulfilmentRepository,
    private readonly maxTimestampSkewSeconds = 300
  ) {}

  async receiveWebhook(params: {
    providerKey: string;
    rawBody: string;
    payload: Record<string, unknown>;
    signatureHeader?: string | undefined;
    timestampHeader?: string | undefined;
  }): Promise<{
    inboxId: string;
    deduplicated: boolean;
    status: 'processed' | 'duplicate_ignored';
  }> {
    // 1. Validate timestamp tolerance BEFORE processing
    if (!params.timestampHeader) {
      throw ArrivalError.badRequest('Missing webhook timestamp header', 'MISSING_WEBHOOK_TIMESTAMP');
    }
    const tsSeconds = Number(params.timestampHeader);
    if (!Number.isFinite(tsSeconds)) {
      throw ArrivalError.badRequest('Invalid webhook timestamp header', 'INVALID_WEBHOOK_TIMESTAMP');
    }
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSeconds - tsSeconds) > this.maxTimestampSkewSeconds) {
      throw ArrivalError.badRequest(
        'Webhook timestamp outside acceptable replay tolerance window',
        'EXPIRED_WEBHOOK_TIMESTAMP'
      );
    }

    // 2. Verify cryptographic signature BEFORE trusting payload or mutating state
    const validSig = this.verifier.verify({
      providerKey: params.providerKey,
      rawBody: params.rawBody,
      signatureHeader: params.signatureHeader,
      timestampHeader: params.timestampHeader,
    });
    if (!validSig) {
      throw ArrivalError.unauthorized('Invalid webhook signature', 'INVALID_WEBHOOK_SIGNATURE');
    }

    // 3. Extract correlation identifiers & compute digest
    const providerEventRef = String(params.payload['eventId'] || '');
    const providerAccountRef = String(params.payload['accountRef'] || 'default');
    const eventType = String(params.payload['eventType'] || '');
    const orderId = typeof params.payload['orderId'] === 'string' ? params.payload['orderId'] : null;

    if (!providerEventRef || !eventType) {
      throw ArrivalError.badRequest('Webhook payload missing eventId or eventType', 'INVALID_WEBHOOK_PAYLOAD');
    }

    const payloadDigest = createHash('sha256').update(params.rawBody, 'utf8').digest('hex');
    const inboxMessage: WebhookInboxMessage = {
      id: randomUUID(),
      providerKey: params.providerKey,
      providerAccountRef,
      providerEventRef,
      eventType,
      receivedAt: new Date().toISOString(),
      eventTimestamp: new Date(tsSeconds * 1000).toISOString(),
      signatureVerified: true,
      payloadDigest,
      redactedPayload: redactWebhookPayload(params.payload),
      status: 'pending',
      attempts: 0,
      correlationOrderId: orderId,
    };

    // 4. Deduplicate atomically in webhook_inbox
    const { inserted, message } = await this.webhookRepo.ingest(inboxMessage);
    if (!inserted) {
      if (message.payloadDigest && message.payloadDigest !== payloadDigest) {
        throw ArrivalError.conflict(
          'Duplicate webhook event ID received with mismatched payload digest',
          'WEBHOOK_PAYLOAD_MISMATCH'
        );
      }
      return {
        inboxId: message.id,
        deduplicated: true,
        status: 'duplicate_ignored',
      };
    }

    // 5. Dispatch verified event to domain state machines
    try {
      await this.dispatchEvent(eventType, orderId, providerEventRef);
      await this.webhookRepo.markProcessed(message.id);
      return {
        inboxId: message.id,
        deduplicated: false,
        status: 'processed',
      };
    } catch (err) {
      await this.webhookRepo.markFailed(
        message.id,
        err instanceof Error ? err.message : String(err)
      );
      throw err;
    }
  }

  /**
   * Recovers and processes verified webhook events left in 'pending' state after a process crash.
   */
  async recoverPendingEvents(limit = 20): Promise<{ claimed: number; processed: number; failed: number }> {
    const pending = await this.webhookRepo.claimPendingBatch(limit);
    let processed = 0;
    let failed = 0;

    for (const msg of pending) {
      try {
        await this.dispatchEvent(msg.eventType, msg.correlationOrderId || null, msg.providerEventRef);
        await this.webhookRepo.markProcessed(msg.id);
        processed += 1;
      } catch (err) {
        await this.webhookRepo.markFailed(
          msg.id,
          err instanceof Error ? err.message : String(err)
        );
        failed += 1;
      }
    }

    return { claimed: pending.length, processed, failed };
  }

  private async dispatchEvent(
    eventType: string,
    orderId: string | null,
    providerEventRef: string
  ): Promise<void> {
    if (!orderId) return;

    const order = await this.orderRepo.getById(orderId);
    if (!order) return;

    const nowIso = new Date().toISOString();

    if (eventType === 'merchant.accepted') {
      const targetOrderState: OrderState = 'accepted';
      if (canTransitionOrder(order.orderState, targetOrderState)) {
        await this.orderRepo.updateState(orderId, targetOrderState, order.orderState);
        await this.orderRepo.updateMerchantOrderState(orderId, 'merchant_accepted');
        await this.orderRepo.recordEvent(orderId, {
          eventType: 'merchant_accepted',
          occurredAt: nowIso,
          source: 'merchant',
          message: `Merchant accepted order (ref: ${providerEventRef})`,
          fromState: order.orderState,
          toState: targetOrderState,
        });
      }
      return;
    }

    if (eventType === 'merchant.preparing') {
      const targetOrderState: OrderState = 'preparing';
      if (canTransitionOrder(order.orderState, targetOrderState)) {
        await this.orderRepo.updateState(orderId, targetOrderState, order.orderState);
        await this.orderRepo.updateMerchantOrderState(orderId, 'preparing');
        await this.orderRepo.recordEvent(orderId, {
          eventType: 'merchant_preparing',
          occurredAt: nowIso,
          source: 'merchant',
          message: 'Merchant started preparing order',
          fromState: order.orderState,
          toState: targetOrderState,
        });
      }
      return;
    }

    if (eventType === 'payment.captured') {
      const attempt = await this.paymentRepo.getLatestByOrderId(orderId);
      const targetState: PaymentState = 'captured';
      if (attempt && canTransitionPayment(attempt.state, targetState)) {
        await this.paymentRepo.updateState(attempt.id, targetState);
        await this.orderRepo.recordEvent(orderId, {
          eventType: 'payment_captured',
          occurredAt: nowIso,
          source: 'payment',
          message: 'Payment captured',
          toState: order.orderState,
        });
      }
      return;
    }

    if (eventType === 'fulfilment.assigned' || eventType === 'fulfilment.delivered') {
      const attempt = await this.fulfilmentRepo.getLatestByOrderId(orderId);
      const targetState: FulfilmentState = eventType === 'fulfilment.delivered' ? 'delivered' : 'assigned';
      if (attempt && canTransitionFulfilment(attempt.state, targetState)) {
        await this.fulfilmentRepo.updateState(attempt.id, targetState);
        if (targetState === 'delivered' && canTransitionOrder(order.orderState, 'completed')) {
          await this.orderRepo.updateState(orderId, 'completed', order.orderState);
        }
        await this.orderRepo.recordEvent(orderId, {
          eventType: eventType.replace('.', '_'),
          occurredAt: nowIso,
          source: 'fulfilment',
          message: `Fulfilment updated to ${targetState}`,
          toState: targetState === 'delivered' && canTransitionOrder(order.orderState, 'completed')
            ? 'completed'
            : order.orderState,
        });
      }
    }
  }
}
