# Versioned Provider Integration Interfaces

These are proposed TypeScript domain contracts, not implemented SDK wrappers. Vendor request/response types remain inside adapters. Every adapter declares explicit capabilities; unsupported methods return explicit errors.

## Common envelope

Suggested shared types:

    type AdapterContext = { requestId: string; providerAccountRef: string; marketCountry: string; deadlineAt: string };
    type AdapterError =
      | { kind: "capability_unsupported"; operation: string }
      | { kind: "invalid_request"; retryable: false; safeCode: string }
      | { kind: "unauthorized"; retryable: false }
      | { kind: "rate_limited"; retryable: true; retryAfterSeconds?: number }
      | { kind: "transient"; retryable: true; safeCode: string }
      | { kind: "unknown_outcome"; reconcileBeforeRetry: true; safeCode: string };
    type Capability = { operation: string; status: "unknown" | "pending" | "sandbox_tested" | "production_verified" | "disabled"; countries: string[]; currencies?: string[]; evidenceUrl: string; reviewedAt: string; expiresAt?: string };

Use runtime validation at boundaries. Money is bigint minor units internally and safe integer minor units over JSON. Normalize timestamps to UTC while retaining provider event identity/time for audit.

## Discovery and geocoding

Discovery search accepts query, approved fields and context. A result carries source ID, returned fields, attribution, observedAt and retention mode (ephemeral, duration-limited or persistable). A policy layer checks source_registry before persistence. Geocoding includes coordinate persistence expiry/terms key. Geocoding never proves delivery serviceability.

## Merchant and catalogue

Merchant capability declarations separately cover menu read/write, order create/cancel, acceptance/rejection, availability and webhooks. Catalogue snapshot includes version, source timestamp, currency, items/modifiers and validity. Order submit returns provider reference and pending state; only authoritative event/query can establish acceptance. HTTP request acceptance is not merchant acceptance.

## Payment

Payment create returns provider reference and phase (requires action, authorized, processing, captured, failed or unknown). Expose authorize/capture/void/refund/retrieve only when supported. Refund requires a stable idempotency key and amount. Market approval evidence separately declares funds flow; technical capability does not establish legal suitability.

## Fulfilment

Quote returns serviceability decision, fee/currency, ETA window, provider reference and expiry. Create requires an unexpired accepted quote and idempotency key. Cancel distinguishes request accepted from cancellation confirmed. Tracking events include event ID, times, phase and optional restricted location. Never synthesize progress or location.

## Webhook and versioning

Normalize to provider key/account/event ID/type, occurred and received time, subject reference, payload digest and redacted payload after raw-body signature verification. Delivery is at-least-once and potentially out of order; handlers are idempotent and query state when ordering is ambiguous. Avoid retaining raw personal payload unless terms require and permit it.

Public HTTP contracts use /v1; breaking semantics require a new version policy. Adapter contract version is independent of provider API version. Pin upstream version when possible, monitor changelogs, test documented fixtures and sandbox, and maintain capability per merchant/country/account. Sandbox pass is not production verification.
