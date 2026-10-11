# F04-h single wholebranch review

BASE67bffd8..sourceb56de22 reviewed once read-only by a fresh reviewer. NoCritical/Minor; all three Important findings accepted before source mutation. One TDD correction pass, without another review.

| Finding | Correction | Actual regression |
|---|---|---|
| Adult exemption exposes unproven historical system document/plan details | Generic allowlisted projection for every unproven system notice, including adults | Admin/Member historical private document/revoked-plan content |
| Generic IDs/extensions expose canonical source IDs/dates; push tag repeats them | Domain-separated keyed actor-specific opaque ID; allowlisted generic fields; resolve public acknowledgments to canonical storage and canonical queued references to projected body/tag | Child/Guest task ID, document ID/expiry, opaque acknowledgment/wrong recipient/raw-ID refusal, push tag, actor separation/key rotation, unknown source extension |
| Frozen patient marker survives medication/vaccination move/deletion | Reference canonical medication/vaccination ID, verify existence/current patient ACL | Actual native source creation/reminders and move/delete across list/native acknowledgment/queued mocked push; exact source metadata |

Twenty-five additional actual RED cases, two authorized health reminder/read characterizations. All110 target assertions passed with inherited ACL/outbox coverage; corrected Cloud lint/full918/91871files/build all exit0, zero skips; frozen lock unchanged. Corrected source887367f06266425947fd89b15740ea236c40c785 independently passed Windows run38178880558 on both Node22/24:918/91871files, six command exits0,20 production proofs/evidence/gate. Hashes in evidence/f04-h-corrected-source.json. Final documentation HEAD requires its own exact run. Original27 RED/four chars plus correction25 RED/two chars gives52 actual RED/six characterizations. No assertions removed or dependency/lock changes.

Cost: old unproven system details also become generic for adults; history/source bytes remain stored. Generic notification identifiers reveal no canonical source/date and grant no authentication; current Bearer/recipient/role authority still applies. They remain stable per actor/current installation key; key rotation requires a refetch. New proven notices retain canonical IDs. The shared historical read flag remains the existing behavior. Medication/vaccination provenance now follows current source existence/patient rather than assuming original patient membership remains.

First-source Windows b56de22/run38177773857 was independently verified on both Node22/24:891/89171files zero skips, six command exits0,20 compiled production proofs and gate; full-log/JUnit/JSON/native/production hashes in evidence/f04-h-first-source.json. This GREEN source still had the three reviewed bugs; corrected/final exact HEAD requires separate acceptance.

Reviewer declined independent Windows/browser/PWA/Server2019, enforcement, other deferred provider/backup/bootstrap/dependency gates and full F04 acceptance. No release/tag/VPS operation.
