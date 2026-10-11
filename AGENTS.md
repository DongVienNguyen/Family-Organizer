# Family-Organizer: Windows-native foundation

- Work only in DongVienNguyen/Family-Organizer. Read CLAUDE.md and the master,
  Windows foundation and Cloud guide in docs/superpowers/plans first.
- The Cloud task is already isolated. Use the existing checkout; create no
  worktree unless the user requests it. Use a focused branch/PR per foundation task.
- Keep React/Express/SQLite and existing behavior. F01–F09 + I01 precede new
  Matrix/Kanban/Wallet features. No public integration API, scoped tokens, MCP or bank sync.
- Windows CI uses windows-2022, x64 and pwsh. Check LASTEXITCODE immediately
  after every npm/native invocation, including commands piped into logs.
- .node-version pins Node24.21.0 after the F01 Windows compatibility run.
  Keep the Node22 baseline job. F02 pins addon13.0.3/N-API after11.10.0 failed
  allocation-driven GC/startup on Node24. Production packaging must carry the
  verified Windows binary, never compile on VPS. F01 reports remain historical.
- Use synthetic, isolated fixtures and offline provider adapters. Never use
  production keys/data or deliver notifications from tests. Preserve assertions.
- Save JUnit/JSON reports, logs, exact tested HEAD SHA and CI URLs; keep
  docs/engineering/implementation-status.md current. A build is not a test suite.
- Cloud node_modules must never enter a Windows package. Server2019 acceptance
  is R02, separate from Windows2022 CI. Do not require the user's PC as a runner.
- Docker/Pi files are migration inputs only; no new Docker/Linux/WSL/GHCR pipeline.
  Release automation is disabled pending F08. Do not invoke the old Bash release.
- The user authorizes all PR merges after review and successful exact-HEAD Windows CI.
  Continue dependent tasks without another merge question. No release/tag or VPS
  access/deployment is authorized.
- F03: import server/app.ts for isolated route construction; startApplication explicitly
  loads storage. Register all schedules in AppJobs, drain requests/effects before
  sqliteClose. No app apply/restart/Immich management routes; retain external links.
- UI work must follow DESIGN.md; preserve original author/license attribution.
