# ADR 0003: Keep external providers behind adapters

- **Status:** Accepted
- **Date:** 2026-11-22

## Context

Restaurant discovery, merchant order acceptance, payments, maps and fulfilment vary across countries and providers.

## Decision

Define provider-neutral domain contracts. Vendor-specific SDKs, identifiers, status values, authentication and webhook behavior remain inside adapters. Provider capabilities must be explicit and location-aware.

## Consequences

Providers can be added or replaced without leaking vendor-specific assumptions into customer or order domain logic. Adapter conformance and contract tests become mandatory.
