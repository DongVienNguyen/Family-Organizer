# I01-a review and execution decisions

One fresh whole-branch reviewer examined `06657385..361eeab` and reproduced
three Important findings and one Minor using isolated synthetic native storage.
No implementation agent or second review was used. The author graded all four
Important by effect and performed one regression-first fix pass.

| Finding | Regression and correction |
|---|---|
| Async migration committed before its continuation | Reject async callbacks before invocation, observe/reject thenables, roll back DDL and version records together. |
| Nested savepoint advanced baseline before outer commit | Keep pending document baselines in the same gateway write scope; publish after the real native COMMIT and discard on rollback. Tests cover rollback/retry and successful savepoint/follow-up edit. |
| Optimistic HTTP preconditions rejected an identical committed retry | Task/note/document version checks run inside the command callback, after retry lookup. Access checks remain before the command. Real HTTP tests preserve stale fresh-write409, authenticated retry200 and invalid-token401. Payload version fields are not stored on business records. |
| HTTP catch handlers converted typed409 to400 | Pure common error ports preserve typed4xx and edit-conflict body shape through legacy handlers. Real reward HTTP same-hash retry200/different-hash409. |

The seven new regressions failed before the fixes (plus two unhandled errors from
the defective async migration path). The corrected targeted suite passes20/20; the complete Cloud suite passes239/239
in28files, with lint and build successful.
Whole-suite and exact Windows evidence are recorded in implementation-status and
the PR evidence comment. Earlier232-test Windows GREEN is superseded by the
corrected HEAD, and is not evidence for these fixes. No deferred review minors.
The preliminary repeated-writer route-loop concern was withdrawn after tracing
actual call sites; no speculative behavior change was made for it.

## Rulings and costs

1. Split I01 into gateway/migration/legacy ownership and snapshot/jobs PRs because
   the master counts51task IDs rather than prescribing51PRs. Cost: I01 stays
   incomplete until both acceptance groups pass; later domain work remains gated.
2. Require explicit immutable migration identities through the registry checksum
   argument. Bundled function source is unstable across TS/CJS. Cost: domain
   migrations must supply constants; omission is rejected.
3. Keep untracked full-document replacement for explicit bootstrap/offline seed
   and legacy restore during part(a); tracked documents use collection conflict
   checks. Cost: internal callers must not misuse the seed port with cloned stale
   data. Part(b) must complete restore ownership before any domain enablement.
4. Keep backup/settings staging and full restore recovery in I01-b. Cost: this
   PR proves SQL atomicity, not filesystem rollback/durable delivery acceptance;
   no release or rollout occurs between parts.
5. Re-grade HTTP409 suppression Important because clients need the specified
   conflict contract. Cost:49existing catch handlers share the pure typed-error
   port, verified through real HTTP and existing route/parser regressions.
6. Resolve the reviewer's declined-to-judge evidence explicitly: first source
   Windows GREEN was independently read/verified; fixed HEAD must pass again.
   Server2019/package/service/live delivery and I01-b remain named later gates.
   Cost: neither complete I01 nor deployment readiness follows from part(a).
