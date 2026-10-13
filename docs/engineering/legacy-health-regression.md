# F09-f — existing medication and child-health HTTP regression

These tests characterize existing Express routes with real native SQLite and
synthetic authenticated users. They introduce no new health feature or provider
call. The service jobs are not started; no notification is delivered.

| Existing requirement | Evidence owner |
| --- | --- |
| Medication create/edit, immutable record identity, persisted dosage/schedule/active flag, delete | `server/legacyHealthHttp.test.ts` |
| Dose taken → skipped updates the same dose; clear removes it; since-date filter; invalid status leaves the complete state unchanged | Same HTTP suite, actual SQLite reads |
| Vaccination scheduled/done/skipped and deletion; growth numeric input/edit/deletion and nonpositive/nonnumeric refusal | Same HTTP suite |
| One emergency profile per existing member, stable created identity, contact trimming/bounds and missing member refusal | Same HTTP suite |
| Child/guest see only their patient records, cannot read dose logs or mutate/delete family care rows | Same HTTP suite; full state comparison after all refusals |
| Reminder source ownership, patient reassignment/deletion suppress stale notifications and queued deliveries | Existing `server/derivedPrivacyNative.test.ts`, offline delivery mock |
| Cross-actor patient invalidations and object visibility | Existing `server/realtimeHttp.test.ts`, `server/objectAclHttp.test.ts` |
| BMI category/date/gender boundaries | Existing `src/utils/bmi.test.ts` |
| Required suite missing from JSON/JUnit evidence fails CI | `tests/evidence.test.ts`, `scripts/ci/write-evidence.mjs` |

Five new characterization tests initially passed. One actual evidence-gate RED
showed that the new suite was not required; the corrected gate requires it.
Characterization success is not a claim of newly fixed application defects.

Health UI actions, growth rendering/BMI in the browser, module flags and complete
restart/restore mapping remain F09 work. Existing native package/service tests
cover installation persistence and restore separately. This slice does not
establish full F09 or Server2019 acceptance. Exact new Windows results are recorded
in implementation-status and its linked evidence before merge.
