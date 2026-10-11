# F04-g single branch review

Reviewed source9730254 against merged main7efdb40 once by a fresh read-only reviewer. No Critical or Minor findings; both Important findings accepted before mutation.

| Finding | Ruling and correction | Regression evidence |
|---|---|---|
| Changed attachment list rejects untouched legacy fields | Preserve each unchanged canonical attachment field by stable ID, validate every new/changed field and list uniqueness/bounds | Removing a second file, adding a new file beside historical values, renaming a retained file with unchanged extension all failed before correction |
| Downstream type/title checks override canonical preservation | Apply required/type checks to creation/changes; keep an untouched canonical title exactly | Partial and full DTO notes edits with unknown historical type or spaced title all failed before correction |

Seven actual new RED cases, plus three characterizations rejecting changed legacy extensions/new unknown attachment fields/new invalid dates. All existing authority, malformed-value, conflict and media assertions remain. No dependency or lockfile change. This is one correction pass, without another review. A first correction lint run caught an unknown-type narrowing error; it was fixed before full verification.

Cost: historical values remain until deliberately repaired; unrelated content edits do not silently normalize them. Changed/new values remain subject to schema checks. This preserves original behavior rather than inventing a data migration. No approval bypass, new API or attachment ownership relaxation.

First-source Windows run38176066061 at9730254 was independently read: both runtimes850/85069files, zero skips, all six commands exit0,19 compiled production proofs and ci-gate. Full logs and JUnit/JSON/native/production artifacts were downloaded; immutable hashes are in evidence/f04-g-first-source.json. Intentional negative fixtures emit errors in the full log and remain passed assertions.

Corrected Cloud lint/full860/86069files/build all exit0, zero skips; frozen lockfile unchanged. Corrected sourceec77266/run38176775633 is independently Windows GREEN on both runtimes860/86069files with all six command exits0,19 production proofs and gate; full-log/report hashes in evidence/f04-g-corrected-source.json. Final documentation HEAD must have its own exact Windows verification before merge, recorded in the immutable PR proof comment. The review declined actual browser/PWA, Windows execution, Server2019, packaging/services and full F04/F05 acceptance; those cannot be inferred from these source tests. F05 main protection remains blocked by GitHub403, documented separately. No release/tag/VPS operation.
