# P10-d4c backend — one local whole-branch self-review

Scope: backend delta from accepted127/main `c6880052719912a955e52cf339d0f8c796d20a2c`, implementation checkpoint `9a1ac7da0482a7d9bd405db24fa1f1ee9b6678a1`. This is a LOCAL SELF-review. No fresh independent reviewer, agent review or GitHub approval is claimed. One complete pass; no repeated whole-branch review.

Reviewed all34 changed source/test files: the cutover command/family resolver/schema/semantic validator; adapter/inspection/structure/snapshot registrations; every explicit version admission; ordinary/legacy persistence; HTTP ports/routes; completion/materialization/media consumers; all five new test suites. Frozen1–12 schema/checksum definitions were inspected and remain unchanged. Default migration remains6; supported13 is opt-in and unknown14 remains refused.

| Area | Review outcome |
| --- | --- |
| Auth and privacy | Current SQL administrator and Task authority checked before cached receipt lookup and inside the transaction; read preview has no mutation; nonadministrators cannot receive family IDs; HTTP private responses and revoked session paths tested. |
| Transaction/idempotency | Captured revision plus whole-family fingerprint; one gateway, no nested public transaction; failure hook rolls back Task metadata, registry, series and receipt; same UUID replays, changed payload refuses. Events occur after commit; no new notification/reward delivery. |
| Preservation | Selected pending work/proof and nonempty original history, existing IDs/due/rank/assignee/body/comments/deleted state and old interval/end/roster/source provenance retained. Only positive old generator type, audit and revision change. Other active work needs explicit acknowledgement. |
| Successor/reward ownership | New series begins with0accepted work; conversion generates no successor or rotation/points. Later approval uses the existing claim owner once; legacy recurrence knobs cannot restart generators or register a parallel series on13. Pre13 behavior remains characterized. |
| Migration/recovery | Exact additive13 DDL/columns/checksum and native references; pure boot/snapshot cross-references; complete original family membership with only owned new descendants allowed. Logical plus separately compiled encrypted recovery cover UUID replay, pending approval, int64 Wallet, malformed memento, damaged boot/repair, old12 compatibility, unknown14/drift, handles and no provider access. |
| Shared users writer | UPSERT retains referenced parent rows and ordering; absent users keeps prior partial-save behavior; actual removals still honor FK restrictions and duplicates roll back. Schema12 skip references have dedicated regressions. |
| Bounds | Family10000/8MiB; SQL provenance-size preflight before loading large JSON; batched tag map and linear family closure. No truncation, dropped assertions, skips, retries, widened timeouts or continue-on-error. |

Findings: **0 Critical, 0 Important, 0 Minor** at this source checkpoint. No correction pass is needed for a review finding. Actual development failures are retained separately: missing implementation, four integration failures, omitted-sibling snapshot acceptance and fourteen baseline compatibility failures. Those were observed and causally fixed before this review; they are not hidden or labeled passing runs.

Validation remains an independent gate: final complete Cloud/native exit, composition with the accepted editor parent, and exact-HEAD Windows quality/browser/package/service/raw/log qualification must all be recorded before merge. The cutover UI, actual13ZIP qualification, fullP10/master completion and Server2019/R02 remain outstanding. No release/tag/VPS action is authorized or performed.
