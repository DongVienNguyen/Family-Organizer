# I01-c whole-branch review and corrections

Reviewed `fb583fe82348ba5299c60d03a18c1d7b72412c1a..af8961f93ef4f000bfacb8f252b6bf8cfb366fc3`
once with a fresh reviewer. All six findings were graded Important for their
observed user impact; there were no Critical or Minor findings. One fix pass,
no re-review, and only synthetic/offline data.

| Finding | Observed RED | Correction and regression GREEN |
|---|---|---|
| Imported backup filename deletes outside backups/ | Correct-checksum traversal accepted; existing delete removed sentinel; retention removed sentinel | Validate imported names and each file consumer; reconcile only bounded ordinary local JSON files. Five path/delete/retention cases. |
| Accepted manifest writes journal its reader rejects | 8,500 safe empty-file entries produced a journal above4MiB; reader rejected it | Shared32MiB writer/reader bound covers10k supported paths; writer checks before publishing. Accepted large-manifest journal round-trip. |
| Absent public settings survive restore | Later threshold999 remained active | Replace entire public allowlist, preserving local-only credentials. Threshold/delivery/link absence regression. |
| Identical legacy ZIP retry conflicts | Same actor/request/original bytes generated a changed compatibility checksum | Hash original ZIP input before conversion; cached response retains later writes and enters maintenance once. |
| Committed JSON restore retry loses reference | Restored metadata cannot find its own backup; restored filename reference absent | Resolve cached response by stable backup-ID identity before lookup; reconcile local references. Test removes metadata after first restore and verifies retry preserves later writes. |
| HTTP suppresses409 conflict | Shared ZIP returned400; file-backed route returned500 | Preserve typed4xx status using existing error adapter; two actual managed HTTP regressions return409. |

The journal fixture initially failed its size precondition. Increasing its paths
then produced the actual `Invalid restore journal size` RED before the correction.
The retention regression observed sentinel deletion before adding the additional
explicit rejection assertion. These details are retained instead of presenting
fixture failures as independent implementation evidence.

All eleven added cases passed with the existing tests: Cloud311/311 in38files,
lint and build exit0. The corrected source must independently pass Windows;
the first source's300-test Windows GREEN is historical, not proof of corrections.
JUnit/JSON and logs remain required for exact-HEAD acceptance.

Rulings:

- Backup references describe installation-local files. Restore reconciles them
  inside its existing gateway transaction, removes missing files and adopts safe
  orphan JSON files. This preserves the old operator behavior without trusting
  uploaded paths. Cost if wrong: a future portable backup-file archive needs an
  explicit separate reference migration; these snapshots do not archive backups/.
- Direct shared snapshots retain checksum identity; compatibility/input adapters
  use stable original-input identity. File-backed commands bind to backup ID and
  return an already committed result despite subsequent metadata changes. Cost
  if wrong: intentionally restoring a replaced file under the same ID requires a
  fresh request ID, consistent with other idempotent commands.
- Public settings absence restores defaults; named provider/session credentials
  and unknown local-only configuration remain local. Cost if wrong: newly added
  public keys must explicitly join the allowlist and its privacy tests.
- Windows2022/process-crash evidence does not cover Server2019, power loss,
  WinSW, encryption, packaging, full authentication/privacy/dependency audit,
  browsers/performance or future domain schemas. Those remain F04–F09/P/W/R02
  gates. Cost if wrong: rollout must wait for those acceptance checks.

No dependency/lockfile update, weakened assertion, skipped test, release/tag,
production secret, real notification/AI delivery or VPS access/deployment.
