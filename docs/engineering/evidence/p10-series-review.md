# P10-d4 backend command review — 2026-10-16

Scope: branch codex/p10-series-commands against accepted main18dc0a669fe847679a73fec7ebed1c5959e207f3. This is a local whole-branch self-review, not an independent agent review. Cloud/executor skill catalogs are empty in this session; no fresh reviewer was invoked. Scope excludes the recurrence editor/browser fixture upgrade and controlled legacy cutover, which remain required before fullP10 acceptance.

All findings recorded together before one Critical/Important regression correction pass. No rereview is planned.

| ID | Grade | Finding | Required correction / owner |
| --- | --- | --- | --- |
| I1 | Important | Resolution admission permits a populated live series with accepted/skipped root but zero effective open occurrences; it also permits an ended series with effective open work. A damaged database can boot into a silent stalled or contradictory series. | Require exactly one effective open occurrence for populated live series and zero for ended series; retain valid unmaterialized legacy configuration admission. Prove logical refusal and compiled authenticated repair. |
| I2 | Important | The reminder producer excludes stopped Tasks, but a reminder queued before a skip is still projected by the delivery port after the Task stops. | Suppress only the existing three Task-deadline reminder identities when their referenced Task is stopped; preserve historical inbox, approval/reward/other task notices and active reminder positive controls. No provider delivery in tests. |
| I3 | Important | The latest-missed selector returns an accumulated past candidate ahead of a later explicit due exception even though the configured explicit override contract says the adult-selected deadline takes precedence. | Return the explicit candidate; preserve the original overdue/current Task until an authorized resolution. Add focused pure and command regression. |
| M1 | Minor | The retained four-column legacy board has no stopped column; canonical List can expose the stopped Task, but the future recurrence editor must communicate this history explicitly. | Deferred to P10 editor/P09 UX before default rollout; do not silently treat stopped as completed or delete it. |

Reviewed: strict skip/edit payloads; fresh role/object checks before cache and within gateway transaction; expected Task/series revisions; immutable accepted/skip facts; rollback/UUID replay; end/count/anchor/timezone and roster semantics; media inheritance and private child response filtering; additive12 registrations/inspection/snapshot/default6; frozen11 materialization behavior; raw schema constraints; native encrypted restore/refusal/replay and Wallet preservation; active status projections and reminder consumers; authenticated routes/SSE metadata after commit; original assertions and evidence retention.

No Critical findings. No assurance is claimed for the unimplemented editor, controlled legacy cutover, full P08/P09/P10, remaining Wallet/productivity plans, Windows Server2019 or deployment.
