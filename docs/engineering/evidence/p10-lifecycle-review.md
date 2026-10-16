# ONE fresh whole-branch P10-d3 review

Reviewed BASE `c78bd0ac443b3c2dea4185cb7a7f122fbf32a9a5` → frozen HEAD `98cfcce0a7e62127c00c99da34907fe152a2d6c3` in `/workspace/Family-Organizer`.

**Result: 0 Critical, 2 Important, 0 Minor.** Findings below are the complete grading for this review, before the implementer's single correction pass. No rereview is requested. Closed PR125 findings and deferred preview MinorM1 remain closed.

## Important I1 — Invalid completion-based calendar slots exhaust the series instead of advancing past the skipped date

**Location:** `server/productivity/recurrenceAccepted.ts:38` and `:43` (interaction with `server/productivity/recurrenceSlots.ts:33`).

**Trigger:** Register a valid completion-based monthly series with `invalidDate:'skip'`, accept an occurrence on January31, and use a root-inclusive count of5. The same issue arises for leap-day yearly completion and for end-date/never policies when the next interval has no valid calendar date.

**Technical evidence:** The newly added lifecycle loop increments the global `nextOrdinal` when `plan(nextOrdinal)` returns `skipped`. The accepted pure planner deliberately sets the calendar ordinal to1 for completion-based policies: each new accepted completion advances one interval from its actual acceptance time. Within this single invocation, `acceptedAt` never changes. Consequently, planning ordinals1,2,3,4 returns the identical February31 skipped date four times. Ordinal5 then returns the count end. The writer commits root acceptance/reward/rotation and `ended_at`, without any successor, although March31 is a valid later monthly candidate. With `end:'never'`, the synchronous request walks through100,000 identical skipped plans before ending the supposedly unbounded series. It holds the shared transaction/event loop during that unnecessary work; no timing threshold or Windows performance claim is needed to establish the repeated identical computation.

**User consequence:** A valid recurring task silently stops after its first acceptance, consumes all future count slots without reaching their dates, and can block unrelated requests while scanning the cap. A date end after the skipped month does not help because the nominal date never progresses.

**Independent confirmation:** The storage-free output in `p10-lifecycle-review-pure-probe.json` records the four identical February skips and count end for those exact inputs. No completion transaction or suite was executed. Source lines38–43 and59–61 establish the resulting lifecycle mutation.

**Correction boundary:** Distinguish the per-acceptance calendar offset used to search beyond an invalid virtual cycle from the durable global ordinal. Preserve the actual acceptance anchor, count/end rules, and exactly one accepted rotation/reward. Do not change the previously accepted rule that an ordinary completion-based successor starts one interval after the latest acceptance, regardless of its global ordinal. Add a causal lifecycle regression for completion-based skip (including finite count and bounded treatment of never), rather than merely testing the pure helper's existing behavior.

## Important I2 — Recovery coherence admits a cursor that strands the existing open occurrence

**Location:** `server/productivity/occurrenceRecord.ts:27` and `:32`; consumers at `server/productivity/seriesRecord.ts:50` and `server/productivity/snapshot.ts:54`.

**Trigger:** Start with the ordinary valid history of rootordinal0 accepted and successorordinal1 open, acceptedCount1, nextOrdinal2. In persisted data or an otherwise structurally valid replacement snapshot, change only nextOrdinal to3. All foreign keys, unique keys, DDL, policy fields, timestamps and recorded task revisions can remain valid.

**Technical evidence:** The new coherence validator requires every occurrence ordinal to be less than nextOrdinal and requires at most one open row. Both checks accept openordinal1 with nextOrdinal3. It does not require the current open row to equal nextOrdinal−1. The writer itself requires precisely that equality at `recurrenceAccepted.ts:30` and rejects the next completion with422 when it is absent. This is not a hypothetical check that the domain does not need: it is an invariant already required by the new mutation owner. Every successful materialization sets nextOrdinal immediately after its newly inserted open ordinal, so skipped virtual ordinals do not justify an open row behind that cursor.

**User consequence:** Normal startup and shared replacement-snapshot validation admit inconsistent owned history as healthy; the user's visible current recurring task then cannot be accepted. A restore can therefore install a series that has no functioning next transition, despite the new explicit owned-history coherence guarantee. This finding concerns admission/repair boundaries, not a claim that the normal writer spontaneously creates the damage.

**Independent confirmation:** The same storage-free probe passes the root/open rows with nextOrdinal3 to `validateOwnedOccurrenceRows`; the result is `coherence:'accepted'`, while the exact acceptance predicate evaluates to rejection. Native SQL permits this shape, and `decodeSeries` also permits acceptedCount1/nextOrdinal3. Existing tests cover a cursor behind all rows, but not a cursor ahead of the existing open row.

**Correction boundary:** At bootstrap/snapshot validation, require a present open row to be the exact current materialized slot (`nextOrdinal−1`). Preserve legitimate skipped ordinal gaps, terminal series, and immutable accepted revisions below reopened current task revisions. Add causal pure coherence and admission coverage for this supported-schema damage; authenticated repair must still be able to replace damaged data with valid history.

## Coverage and evidence

- Read the supplied review package, repository AGENTS/CLAUDE, approved planning/spec contracts, P10-d3 brief/current progress, lifecycle documentation, and development/parent-composition/type-only evidence.
- Reviewed the entire35-file diff, including all29 source/test/gate manifest entries, not only added assertions. Traced the new completion hook through FamilyDB approval/reward/reopen behavior, transaction-scoped policies, canonical flush/refresh hooks, task structure/board/search writers, media authorization, current/cached ACL filtering, recurrence planners and shared snapshot/bootstrap inspection.
- Confirmed HEAD matches the frozen review SHA and all29 source hashes match the development evidence. Repository was clean before and after review.
- Independently read existing Cloud JSON and JUnit:5163 passed,280 files,0 failed/pending/todo; JUnit5163 with0 failures/errors. Every listed Cloud report/log/type-proof hash matches the evidence. Lint/build exit0 and native compiled recovery outcome are existing recorded evidence, not newly executed checks.
- Parent composition preserves the accepted125 tree; type-only fixture proof records identical emitted JavaScript. Default registration remains6;11 is explicit. Migration1–10/opaque occurrence handling remains preserved by the additive schema and existing native evidence. The version11 changes to views/catalog/matrix/pins/grouping/structure keep current-view9 separate from database version11.
- No suite, build, application initialization, migration, database mutation, source/Git mutation, external comment or agent delegation occurred. One small pure-helper probe ran and retained its complete JSON output outside the checkout. The review report is also outside the checkout.

## Declined to judge / boundaries for implementer rulings

1. **Exact Windows qualification:** Pending and owned by the parent workflow; Cloud/native source evidence does not establish Windows CI or Server2019/R02 acceptance. No release, deployment or publication approval is implied.
2. **FullP10 completion:** Current-occurrence skip/edit-scope commands, jobs/missed-cycle restart behavior, editor/UI, controlled legacy recurring-task cutover and whole-plan acceptance remain future owners. Their absence is not an additional defect in this slice.
3. **Closed preview review:** PR125 and its deferred MinorM1 extreme historical-anchor horizon behavior are not reopened. I1 concerns new accepted-lifecycle scanning of an unchanged completion anchor, not that historical-preview finding.
4. **Arbitrary corruption authentication:** No claim that checksums alone authenticate edited snapshots, or that validators can reconstruct every historical fact. I2 is narrowly the supported-schema internal cursor invariant necessary for this writer to operate; cryptographic tampering resistance is not being redefined.
5. **Collection serialization:** Accepted native evidence compares all legacy JSON fields semantically because recovery canonicalizes key order; it is not a byte-identical collection-JSON promise. Domain/opaque rows and refusal-file hashes retain their existing exact assertions.
6. **Broader performance targets:** Windows p95/large installation benchmarking remains outside this review. I1's finite loop of identical candidates is a concrete algorithmic defect, independent of those benchmarks. Existing rank scans/legacy synchronization were inspected but no separate regression was established.
7. **Recurrence end/exception product policy:** The accepted planner treats nominal end/count boundaries as authoritative; this slice preserves that contract. I did not reclassify that prior policy as a new bug or silently prescribe allowing an exception beyond an exhausted nominal series.
8. **New privacy or reward policy expansion:** No additional demonstrated bypass was found in the new task-local completion scope, linked reversal, media capability, successor visibility or cached-ID filtering. This is review evidence, not a claim that every future UI/report/integration path is accepted.

No Minor findings were added or opportunistically reopened. The implementer should grade both Important findings and all declined boundaries before its single authorized correction pass.
