# ADR 0001: Start with a modular monolith

- **Status:** Accepted as initial direction
- **Date:** 2026-11-22

## Context

Arrival is at foundation stage with a small contributor group and no production workload. The product has distinct domains and several external integrations, but operational complexity must remain manageable.

## Decision

Start with a modular monolith. Define domain boundaries and provider adapter contracts. Extract services only when measured scale, deployment isolation, fault isolation, or team ownership justifies it.

## Alternatives

- Microservices from day one: rejected due to unnecessary deployment, observability, and distributed transaction overhead.
- Unstructured single application: rejected because it makes domain boundaries and future extraction difficult.

## Consequences

Fewer moving parts initially, with deliberate module boundaries. Some modules may later need independent workers or services.
