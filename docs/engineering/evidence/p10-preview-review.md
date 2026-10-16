# P10-d2 fresh whole-branch review

Reviewed BASE `dd1407a85f81105af7de03107afde3a8d333fcd3` → HEAD `2f0ab90a04f0490f8c8d88e287d1f319e7f13877` in `/workspace/Family-Organizer`. HEAD matched, working tree was clean, and all 13 development-evidence source hashes matched. Read the review package, approved P10 plan/spec, master/Windows/Cloud constraints, AGENTS/CLAUDE, slice brief, preview contract and latest P10-d2 rulings. This is one whole-branch review, not a reopening of accepted P10-d1 reviews.

## Findings

### I1 — Important: explicit completion-based deadlines disappear while acceptance is unknown

Location: `server/productivity/recurrencePreview.ts:46`; related exclusion at `server/productivity/recurrencePreview.ts:62`.

Concrete trigger: create a completion-based monthly series with `nextOrdinal=1`, an unfinished or pending root, and a saved ordinal-1 `due` exception for `2027-02-15`. Request February. The planner correctly returns `awaiting-acceptance` for the unknown calculated date, but `include` returns before consulting the explicit deadline. The response is an empty successful preview even though the stored exception supplies the date without guessing acceptance. An explicit ordinal-2 deadline is also discarded unconditionally by line 62, including when the root has an accepted reference. These are supported exception intents accepted by the store, not forged acceptance inputs.

Consequence: the family's explicitly rescheduled future work disappears from its calendar. Keeping unknown calculated dates unresolved must not discard known explicit deadlines or infer an accepted completion/rotation/reward from displaying them. Preserve count/end constraints and skip/due-none exclusion while evaluating explicit deadlines independently of an unknown base. The existing separate tests for unknown acceptance and due-based rescheduling do not exercise this combination.

### I2 — Important: maximum valid selected-date preview blocks the single application thread for seconds

Location: `server/productivity/recurrenceSlots.ts:14`, called per ordinal by `server/productivity/recurrencePreview.ts:44` and `server/productivity/recurrencePreview.ts:56`.

Concrete trigger: a due-based explicit-date series containing all 366 dates in 2028, with an all-day anchor `2027-12-31`, timezone `Asia/Saigon`, end `never`, and preview `[2028-01-01,2029-01-01)`. Every candidate normalizes the entire policy again. Explicit-date normalization calls `localDayStart` for every selected date, so the service performs 367 full 366-date validations, even though its decoded policy was already validated. The private formatter cache avoids construction but not these repeated binary searches.

A single storage-free Node/tsx timing probe of precisely the 367 planner calls made for that range took **11,823 ms** in this Cloud environment. It imported only the pure planner, opened no storage and reran no tests. This is an observed Cloud duration, not a Windows benchmark. The HTTP handler is synchronous, so this valid request stalls other requests, including ordinary family interactions, on the application's one Node process. Normalize/validate shared policy and anchor once per projection, retaining validation for standalone public planner callers; do not relax the accepted 366-date/range contract or test timeouts.

### M1 — Minor: range fast-path rejects valid moved occurrences beyond its nominal ordinal horizon

Location: `server/productivity/recurrencePreview.ts:55`.

Concrete trigger: daily interval-1 due-based series anchored `1000-01-01`, count 2, next ordinal 1, with its valid ordinal-1 due exception moved to `2027-02-15`. February 2027 is a valid requested range and the exception is within the root-inclusive count. `firstOrdinal` computes more than 100000 from the nominal daily cadence and line 55 returns 422 before the exceptions pass. The same old finite series without the exception returns 422 rather than an empty preview.

Consequence: an optimization based on the requested date blocks a supported bounded occurrence that was explicitly moved into range. Skip the exhausted nominal scan while still inspecting valid bounded exceptions. Rated Minor because the trigger needs an extreme anchor/range separation; it does not warrant broadening the supported ordinal domain.

## Other reviewed behavior

The new service uses current-user validation and current recursive Task read ACL before decoding or returning series content; missing/private preview responses converge, and virtual DTOs omit policy, rotation roster and reward/Wallet fields. The service's dependency is read-only and its bodies contain no domain write calls. The internal registration route delegates current authority, revision/idempotency and current returned configuration to the accepted store. No changed code registers or applies a migration by request; default registration remains separate from explicit schema-10 setup. Public formatter instances stay fresh, with a private bounded cache used only by date conversion. The extracted timed resolver retains wall time/milliseconds and explicit gap/fold handling. Root-inclusive count, sorted explicit successors, original-anchor calendar calculations, inclusive end checks and the exact 1000-result guard are otherwise coherent in the inspected code. Existing test evidence was read, not rerun.

The five supplied Review Focus items were applied to changed behavior: date/time and rescheduling interactions are addressed above; no changed WIP/order commit logic or child completion/reward authority was found; privacy review covered the new route/read projection and cache behavior without reopening unrelated accepted surfaces.

## Declined to judge — root rulings required

- Exact-HEAD Windows qualification, native package/browser/service evidence and Server2019 acceptance: not run by this reviewer and not established by the Cloud timing probe or existing Cloud suite results.
- Full P10 materialization/accepted-occurrence history, scheduler restart, edit/skip command HTTP/UI integration, legacy cutover and compensating reward reversal: explicitly outside this preview slice. In particular, reading accepted history after the first successor remains future-owner work; I1 concerns already-stored explicit deadlines, not inventing that history.
- Production rollout, public integrations, release/deployment and historical closed review findings: outside this branch's authorization and scope.
- Windows performance target compliance: the I2 observation proves a practical Cloud synchronous-request cost, but is not a Windows p95 acceptance measurement.

Result: **0 Critical, 2 Important, 1 Minor**. Root should grade all findings and declined boundaries before the one authorized TDD correction pass. No application/source edits, Git mutations, suite reruns, external comments or rereview were performed.
