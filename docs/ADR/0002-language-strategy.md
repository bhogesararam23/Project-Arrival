# ADR 0002: Polyglot language strategy

- **Status:** Accepted as adoption policy; concrete runtime choices remain evidence-led
- **Date:** 2026-11-22

## Context

The project owner wants TypeScript, Rust and C++ in the engineering toolkit, with Dart for a future mobile client. The project also expects to develop and evaluate original algorithms.

## Decision

- TypeScript is the default for the web application, API orchestration and integrations.
- Rust is approved for components with demonstrable systems, concurrency, memory-safety or performance needs.
- C++ is approved for algorithm research and performance-sensitive modules where a benchmark or ecosystem need supports it.
- Dart/Flutter is reserved for a future mobile client when native mobile requirements justify it.
- SQL is used for PostgreSQL/PostGIS schema and data operations.

No component is introduced solely to increase language count. Every new runtime requires a documented problem, interface, test strategy, build process, maintenance cost, alternatives and evidence.

## Consequences

The platform can use each language where it has a clear advantage without prematurely creating multiple services and toolchains. TypeScript remains the initial integration spine.
