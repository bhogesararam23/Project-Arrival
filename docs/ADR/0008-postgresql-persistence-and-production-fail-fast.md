# 0008 — PostgreSQL Persistence Layer, Migration Tamper-Resistance, and Production Fail-Fast

**Status:** Accepted  
**Date:** 2026-11-24  
**Author:** Principal Engineer / Database Architect  

## Context

During the platform foundation phase, domain repositories were largely implemented in-memory for testing, while the database package provided SQL migrations and a lightweight CLI migrator. To advance the platform toward trustworthy production operation, four core database and persistence requirements needed to be met:
1. **Real PostgreSQL Repository Layer:** The API needed full PostgreSQL repository implementations for places, catalogues, checkout quotes, orders, guest sessions, capability overrides, idempotency records, and the transactional outbox.
2. **Migration Concurrency and Tamper Resistance:** Multiple application replicas deploying concurrently could race when running migrations. Furthermore, manual or unauthorized post-deployment modifications to applied SQL migration files needed to be detected and blocked.
3. **Fail-Fast Configuration Invariant:** In production environments (`NODE_ENV === 'production'`), starting the API server with ephemeral in-memory storage or missing `DATABASE_URL` represents a severe data-loss risk and must fail closed immediately.

## Decision

1. **Production-Ready PostgreSQL Repository Suite:**
   - Implemented typed, SQL-backed repositories under `@arrival/database/src/repositories/`:
     - `PostgresPlaceRepository`
     - `PostgresCatalogueRepository`
     - `PostgresQuoteRepository`
     - `PostgresOrderRepository`
     - `PostgresGuestRepository`
     - `PostgresCapabilityRepository`
     - `PostgresIdempotencyRepository`
     - `PostgresOutboxRepository`
   - All repositories use parameterized queries, explicit column projections, immutable event appending, and exact BigInt minor-unit mapping.

2. **Migration Advisory Locking and SHA-256 Checksumming:**
   - Added `checksum text NOT NULL DEFAULT ''` to `schema_migrations`.
   - `DatabaseMigrator` computes the SHA-256 digest of every migration SQL file before execution.
   - When running migrations, the migrator acquires a PostgreSQL advisory lock (`pg_advisory_lock(849201849)`) to ensure single-instance migration execution during rolling deployments.
   - On every run, applied migration files are re-hashed against recorded checksums; any tampering or discrepancy halts migration execution immediately.

3. **Strict Production Startup Contract:**
   - In `apps/api/src/config.ts`, if `NODE_ENV === 'production'` and `DATABASE_URL` is undefined or empty, initialization throws a fatal error: `DATABASE_URL is required in production environment`.
   - The application does not silently degrade to in-memory mocks when running in production mode.

## Consequences

- Guarantees data durability, transactional consistency, and auditability across all core domain aggregates.
- Eliminates migration race conditions during automated container deployments.
- Prevents accidental deployment of ephemeral in-memory storage in production environments.
