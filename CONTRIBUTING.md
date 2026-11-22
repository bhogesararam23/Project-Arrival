# Contributing to Project Arrival

Thanks for helping build Arrival.

## Before starting

- Read the README and relevant documents under `docs/`.
- Search existing issues and code before opening duplicate work.
- For substantial changes, open or reference an issue with scope and acceptance criteria.
- Check provider terms and data licensing before implementing ingestion.

## Development rules

- Use focused branches and pull requests.
- Follow the language adoption policy in `docs/ARCHITECTURE.md`.
- Add tests for behavior changes.
- Add database migrations rather than editing production schemas manually.
- Update docs when behavior or architecture changes.
- Never commit credentials, customer data or unlicensed datasets.
- Report checks truthfully.

## Pull request checklist

- [ ] Scope is focused and linked to an issue where appropriate.
- [ ] Tests were added or updated.
- [ ] Relevant checks run (include commands/results).
- [ ] Security/privacy implications reviewed.
- [ ] Provider/data terms reviewed where relevant.
- [ ] Documentation and ADRs updated where required.
- [ ] No unrelated files or generated artifacts included.

## Commit messages

Follow Conventional Commits, for example:
- `docs: define restaurant discovery requirements`
- `feat(discovery): add normalized merchant search`
- `test(checkout): cover expired price quotes`

Do not create artificial commits merely to increase commit count.
