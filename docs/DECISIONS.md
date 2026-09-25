# Architecture Decision Log

Every non-obvious technical choice, newest on top. Format: context, decision, alternatives considered, consequences.

---

## ADR-001 — `CLAUDE.md` imports `AGENTS.md`

- **Date:** 2026-09-25
- **Context:** `AGENTS.md` is the single source of truth, and every agent MUST read it at session start. Claude Code loads `CLAUDE.md` into context automatically, but it does not reliably load `AGENTS.md`.
- **Decision:** add a minimal `CLAUDE.md` that only points to `AGENTS.md` and imports it with `@AGENTS.md`. It holds no rules of its own, so the two files can never disagree.
- **Alternatives considered:** duplicating the spec into `CLAUDE.md`, rejected because two copies would drift; relying on each agent to remember to open `AGENTS.md`, rejected because it depends on discipline rather than tooling.
- **Consequences:** any rule change goes into `AGENTS.md` only. `CLAUDE.md` changes only if the import mechanism changes.
