# Proposed PostgreSQL/PostGIS Schema

**Status:** Proposed migration only; not applied or tested against a running database. PostgreSQL 16+ and PostGIS 3.x are proposed baselines; verify hosting support.

The schema separates discoverable venues from merchant locations, source observations from normalized records, and public catalogue data from immutable order snapshots. Payment and fulfilment attempts are one-to-many from orders. Guest access secrets are represented only by digests and each guest grant is bound to one order. Order idempotency references a principal/operation-scoped idempotency record. Precise recipient coordinates are isolated in a restricted table with explicit expiry rather than exposed on the general address row. Provider capability is dated, evidenced and market-scoped. Checkout and order rows refer to an encrypted delivery-address record; access control must still be applied in the service layer. Retention/partitioning, encryption, RLS, migration tooling and legal retention still need review.

Apply only through reviewed migration tooling in a disposable database first. No provider seed or fake production record is included.

See [001_initial_platform.sql](migrations/001_initial_platform.sql).
