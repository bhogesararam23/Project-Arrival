# ADR 0005: Database Schema Hardening and Migration Framework

- **Status:** Accepted
- **Date:** 2026-11-24
- **Owner:** Principal Engineer, Project Arrival

## Context

The initial schema proposal (`docs/database/migrations/001_initial_platform.sql`) defined the core tables and data types for customers, merchants, locations, catalogues, quotes, orders, payments, fulfilment, capabilities, and outbox. However, it had several engineering gaps:
1. Absence of symmetrical rollback scripts (`.down.sql`) to enable safe development iteration and test teardowns.
2. Incomplete check constraints for ISO standard formats (ISO 3166-1 alpha-2 country codes and ISO 4217 currency codes).
3. Missing composite indexes on high-throughput query paths: `outbox(aggregate_type, aggregate_id)`, `menu_items(catalogue_id, sort_order)`, and `order_events(order_id, occurred_at)`.
4. Absence of database-level immutability triggers on `audit_records`.
5. Need for an automated migration verification and execution tool with syntax checking and parenthetical balance checks.

## Decision

1. Require every migration in `packages/database/migrations` to have a strictly matching `.down.sql` file wrapped in an explicit `BEGIN; ... COMMIT;` transaction block.
2. Introduce migration `002_schema_hardening.sql` enforcing:
   - Regex check constraints on ISO country codes (`^[A-Z]{2}$`) and currency codes (`^[A-Z]{3}$`).
   - Composite lookup indexes for outbox polling and menu retrieval.
   - An immutable database trigger on `audit_records` raising an exception on any attempted `UPDATE` or `DELETE`.
3. Provide a standalone TypeScript migration runner and validator (`@arrival/database`) capable of dry-run validation, forward migration, rollback, and test integration without external heavy ORM lock-in.

## Consequences

- Schema integrity and data provenance are strictly preserved.
- Database rollbacks and migrations are testable in CI and automated testing suites.
- Any attempt to modify audit records at the SQL level fails immediately.
