# 0009 — Durable Outbox Worker Leasing and Webhook Inbox Deduplication

**Status:** Accepted  
**Date:** 2026-11-27  
**Author:** Principal Engineer / Distributed Systems Architect  

## Context

In Milestone 2, the `outbox` and `webhook_inbox` tables existed in SQL migrations, but `PgOutboxRepository` only provided a bare `SELECT` in `fetchPending()` with no atomic claiming, no lease expiration, no dead-letter handling, and no worker runner, while `webhook_inbox` had no repository or HTTP ingress.

## Decision

1. **At-Least-Once Outbox Delivery with `FOR UPDATE SKIP LOCKED`:**
   - `PgOutboxRepository.claimBatch()` atomically claims eligible rows (`published_at IS NULL AND dead_lettered_at IS NULL AND available_at <= now() AND (locked_until IS NULL OR locked_until <= now())`) using `FOR UPDATE SKIP LOCKED`, assigning `worker_id`, a unique `lease_token`, `locked_until`, and incrementing `attempts`.
   - `OutboxWorker` executes handlers with bounded concurrency (`maxConcurrency`), calling `complete(id, leaseToken)` on success, `scheduleRetry()` with bounded exponential backoff and jitter on transient failure, and `deadLetter()` when `attempts >= maxAttempts`.
   - Poison messages are isolated in the dead-letter queue without blocking healthy messages, and can be inspected or replayed by `ops_admin` operators with an audit trail.
   - We explicitly do **not** claim exactly-once external delivery; consumers must remain idempotent.

2. **Signature-First, Replay-Resistant Webhook Inbox:**
   - `POST /v1/webhooks/:providerKey` validates timestamp skew (default 300s) and verifies cryptographic signatures (`WebhookSignatureVerifier`) **before** trusting payloads or mutating domain state.
   - Sensitive fields are redacted prior to persistence, and events are deduplicated atomically on `(provider_key, provider_account_ref, provider_event_ref)`.

## Consequences

- Multiple API/worker replicas can run concurrently without double-claiming outbox jobs.
- Worker crashes recover automatically once `locked_until` expires.
- Duplicate or replayed provider webhooks are safely ignored without corrupting order or payment state.
