# M1 functional development checkpoint

2026-10-17 (Asia/Saigon). Source commit
`fc8851afcc8e623f9e05853a598b0fb329fe0648`, on
`codex/feature-first-acceptance`. PR136 source is normally composed for local
development; no new PR, push, Windows run or merge was performed for this group.
This is not acceptance of the entire M1 milestone or master plan.

## Usable flows added

- P10: numbered rotation order with keyboard earlier/later/removal controls.
  Editing and closing the shared drawer preserve an unsaved roster; only an
  explicit save changes the series. Unavailable members remain unnamed until
  explicitly removed. All three locales have the new controls.
- P10: a historical daily series whose bounded count is exhausted returns an
  empty preview or its valid moved exceptions. Unbounded/date-ended series retain
  the supported ordinal refusal. Preview changes no installation table.
- P09: managers can configure off/soft/hard WIP policies from canonical Section
  or Workflow boards. Limits apply to the shared board, including off-filter
  Tasks. Cancel writes nothing; lowering a limit retains existing Tasks. Internal
  authenticated metadata reads disclose no Task identities or counts.
- WIP delivery with an unknown result retains the original command/body/UUID.
  An authorized refresh hides stale metadata while preserving that request;
  checking its outcome is manual. Actor/view retirement and denied authority
  remove private state. No automatic retry, offline write or new completion path.

## Cloud evidence

- Frozen-lockfile install, lint and build: native exit0.
- Full unit/integration:6108 tests/330 files, matching6108 JUnit cases,
  zero failed/skipped/todo. Vitest also reports388 suites including describe
  blocks; that is not the file count.
- Actual Chromium C22/C33/C36/C40/C41/C42/C43/C44: eight first attempts passed.
  Native touch: one first attempt passed. JSON/JUnit and owned fixture reports
  confirm offline operation, integrity, native close and fixture cleanup.
- C44 initially failed after an actual configure200 lost its response: transient
  unloaded views retired the pending owner. Its DOM/trace is retained. The hook
  now suspends before testing view identity; the unchanged browser assertions
  verify hard refusal, soft admission, off/null and original-body manual replay
  across an unrelated real Task/SSE refresh.
- One LOCAL whole-branch SELF review of31 source/test/locale files:0Critical,
  0Important,0Minor; no independent-review claim or rereview. Development failure
  checkpoints are separate from review findings.
- Original42 case bodies, zero-error/offline hooks, native touch, dependencies
  and lockfile remain identical to the composed PR136 source.

Compact hashes, raw report paths, actual failures and test scope:
[feature-first-m1-development.json](evidence/feature-first-m1-development.json).
The new mandatory inventory has44 Productivity cases; historical39/42/43 targets
remain separately bound to their original reports.

## Remaining work and final gate

Continue remaining P08/P09/P10/P17/P18 main interactions, including board/view
creation, quick-add and manual card ordering UX, then close the complete M1
acceptance checklist before Wallet core. These additions do not finish those
entire tasks.

Current source has not run the full44-case browser inventory or Firefox/WebKit,
Windows Node22/24, final Windows package/service qualification, or Server2019 R02.
Windows checks are deliberately deferred under the user-approved feature-first
sequence, and remain required before merge/package handoff. No release, tag, VPS
access or deployment occurred. No user PC runner is required.
