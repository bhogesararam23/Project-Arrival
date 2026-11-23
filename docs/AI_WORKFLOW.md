# AI-Assisted Development Workflow

Project Arrival may be developed with different AI assistants and coding agents. The repository—not any single agent's hidden memory—is the source of truth.

## Required agent behavior

Before changing code:
1. Read README, project brief, PRD, architecture, engineering principles and relevant ADRs.
2. Inspect the current branch, working tree and existing implementation.
3. Identify the exact task and acceptance criteria.
4. Check for overlapping work and existing abstractions.
5. Propose a small plan for non-trivial changes.

When changing code:
- Work on a focused branch.
- Keep changes scoped and reviewable.
- Do not rewrite unrelated modules.
- Do not add secrets or personal data.
- Do not invent provider capabilities or claim untested integrations work.
- Add/adjust tests and docs.
- Run the relevant checks and report exact commands/results.
- Preserve user-authored work.

Before handing work to another agent:
- Commit or clearly identify uncommitted changes.
- Summarize implemented changes and rationale.
- List files touched.
- List tests run and failures.
- Document assumptions, unresolved questions and next safe action.
- Update relevant ADRs if a decision changed.

## Human ownership

AI tools are assistants, not project owners. The maintainer reviews architecture, evidence, code, licenses, security, and commits. Do not fabricate attribution or make commits appear to have been authored by a human who did not create them. Use meaningful commit messages and honest co-author attribution where appropriate.

## Commit conventions

Use Conventional Commits:
- feat:
- fix:
- docs:
- refactor:
- test:
- build:
- ci:
- perf:
- research:

One logical change per commit. Avoid empty commits, artificial commit splitting, or backdating. A commit should represent a real, reviewable change.
