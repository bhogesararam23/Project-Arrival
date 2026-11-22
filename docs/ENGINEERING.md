# Engineering Principles

## Working standards

1. Prefer correctness and operability over novelty.
2. Make the smallest complete, reviewable change.
3. Keep business rules in explicit domain modules.
4. Define contracts before integrations.
5. Keep external providers behind adapters.
6. Use strict TypeScript and explicit error types.
7. Use migrations for all schema changes.
8. Add unit, integration, contract and end-to-end tests appropriate to risk.
9. Document non-obvious decisions in ADRs.
10. Measure before optimizing or adding another language/runtime.
11. Keep production dependencies and developer tooling explicit.
12. Do not claim an integration works until it has been tested against the real provider sandbox or production contract.

## Language selection policy

- TypeScript: default for product/API orchestration.
- Rust: use for measured systems, concurrency, reliability or performance needs.
- C++: use for algorithmic/performance research with benchmarks.
- Dart: future Flutter mobile client when justified.
- SQL: database schema, constraints, indexes, PostGIS operations.

A component must not be rewritten in multiple languages just to increase language count. New language adoption requires an ADR describing the problem, alternatives, interface, testing, build, maintenance, and benchmark evidence.

## Algorithms and research

Every original algorithm proposal should include:
- Problem statement and intended decision/use.
- Inputs, outputs and invariants.
- Dataset origin, license, quality and limitations.
- Baseline algorithm or existing approach.
- Evaluation metrics and benchmark methodology.
- Reproducibility instructions and fixed test fixtures.
- Failure cases, bias/coverage limits and operational cost.
- A clear decision on whether it belongs in production.

Do not market an algorithm as novel or superior without comparative evidence.

## Code quality

- No secrets, real customer data, or provider credentials in Git.
- No arbitrary generated scaffolding.
- No dead abstractions without a use case.
- No silently swallowed errors.
- No floating-point money arithmetic.
- No public endpoint for sensitive records.
- No fake order or courier state in production paths.
