# Family-Organizer — PC source handoff

- This source-only snapshot was requested by the owner on 2026-10-18.
  Local Windows PC development supersedes earlier Cloud-only workflow instructions.
- Read START-HERE-PC.md, SOURCE-MANIFEST.json, CLAUDE.md, DESIGN.md and
  docs/superpowers/plans/2026-10-18-pc-continuation.md before editing.
- This is partial W15 work, not a fully accepted release. Full tests/reports and
  history remain on codex/feature-first-acceptance; source SHA is in the manifest.
- Do not fetch the entire test corpus/reports or browser binaries onto the PC.
  Do not claim missing tests passed. Preserve pinned package.json/package-lock.json;
  React/Vite build needs devDependencies. Use npm.cmd and immediate LASTEXITCODE checks.
- Use synthetic local storage and offline providers only. Keep I01 atomic writes,
  exact Money, idempotency/revisions, current ACL/media/SSE and original attribution.
- Prioritize feature completion and focused checks; full tests and exact-HEAD Windows
  qualification run on the full branch before integration. PC is not a CI runner.
- Never merge this filtered snapshot into main/full Cloud: apply selected source/docs
  diffs instead, preserving tests/workflows/evidence there. Do not push main directly.
- No release/tag, VPS access/deployment, Docker/WSL/GHCR runtime, public integration
  API/tokens/MCP/bank sync. Server2019 acceptance remains R02.
- The original Cloud instructions are retained in docs/handoff/original-cloud-AGENTS.md.
