# W11: exports and previewed categorization rules

Development continues on `codex/feature-first-acceptance`, after W10 source
`5a885a5143874f7bda7eb839e9c90c7d4980a5bc`. Wallet remains off/absent by default;
these APIs neither migrate nor activate it. Windows qualification, the final
independent branch review and Server2019 R02 remain separate.

Exports use the same query/filter/FX evaluation as Records. Direct checked IDs
retain their captured revisions; captured selections retain their original ID
set, filter and explicit exclusions. Later matching records are excluded.
Current role, account scope and revisions are checked before preparation and
again while consuming the real stream. Partial transfers redact category,
labels, text and inaccessible counterpart data. A stale/private ID fails the
whole explicit selection.

CSV uses UTF8/BOM, quoted fields and formula-prefix escaping for raw text.
XLSX uses string cells, with no formulas or numeric conversion of large money.
Single income/expense amounts are exact signed major-unit decimals; visible
postings retain exact minor-unit strings in every format. PDF renders actual
record IDs, Vietnamese text and large money. Exports are bounded to10000records
and20MiB; PDF to1000records/2MiB input. Cancellation, scope retirement or byte,
hash, MIME, filename or count mismatch prevents file delivery.

The existing pdfmake0.3.11 standalone engine and font VFS are bundled into the
server using explicit esbuild aliases. No dependency version, lockfile or runtime
closure changes. A compiled CommonJS child without `node_modules` renders the
actual PDF offline. The original Roboto3.014 copyright/OFL text is included in
Windows packages; the package verifier pins all four font binaries in both the
server and browser bundles. Existing library/author notices stay intact. The
independent consumer harness and authenticated service import closure include
the new font verifier, while historical package policies remain accepted.

Rules default to source `import`. `manual` requires explicit selection; no bank
source/provider exists. Keywords match normalized literal phrases within note
or payee, with any/all semantics. Smaller priority runs first, ties retain the
explicit input order, the first category action wins, labels are additive and
unique, and `stopOnMatch` is explicit. Actions cannot change amount, account,
postings, FX, dates or record provenance.

Manually categorized records remain unchanged, including a category explicitly
cleared by a later manual edit. Actual manual label/review changes are remembered
independently. Full-form edits that retain the same category do not falsely claim
its ownership. Both ordinary and bulk manual edits record origins inside their
existing I01 transaction; old storage versions remain untouched.

Explicit schema11/standalone12 adds personal rules,15-minute preview headers and
metadata-only before/after rows, and manual origins. Accepted1–10 SQL is unchanged.
Preview writes configuration metadata, never ledger rows, money or financial
audits. It captures the current filtered ID/revision set and a SHA256 candidate
identity. Apply rechecks saved configuration revisions, current actor/account
access, supported record structure, catalog state and every candidate revision
inside one atomic I01 write. Rerunning an already satisfied rule adds no record
revision, label or audit. Native failure rolls back rows, provenance, preview
state, audits and nonce together. Unknown financial links still block import undo;
metadata-only rule previews do not block undo of an unmodified import.

Personal configuration and previews require their owner, including for another
Admin. Partial transfer access cannot reveal captured full-transfer metadata.
Snapshot validation checks hashes, owner/configuration/revision bindings and
origins before restore. Preview storage has both per-owner and global row bounds.

The session owner keeps uncertain command bodies/keys only in memory, above tab
navigation. It clears private views synchronously on hide, scope refresh and
logout; late bodies cannot revive them. Retry is explicit and uses the original
body/key. The UI shows source consent, priority, stop behavior, before/after rows
and counts, and confirms apply. Locale strings cover Vietnamese/English/Chinese.

Current limits and remaining acceptance:

- Rules leave split, linked fee, recurring, trade, archived-account and read-only
  candidates unchanged through the generic rule workflow. Partial transfers fail
  before exposing their metadata. Dedicated workflows retain ownership.
- PDF uses Roboto; CJK/emoji font coverage has not been qualified. CSV/XLSX retain
  Unicode text. Complete PDF glyph/fallback behavior belongs to W16/i18n acceptance
  and remains required before claiming full multilingual export acceptance.
- W18 must qualify10k responsiveness, capacity and retention. W10's synchronous
  import commit still blocks the event loop; an asynchronous queue acknowledgement
  does not satisfy the nonblocking target. See [imports](wallet-imports.md).
- No current PR/Actions run, Windows package/service/multiengine/touch result or
  Server2019 acceptance is inferred from Cloud tests. The package schema ceiling
  and guarded activation/canonical cutover still need final W18/I03 integration.

Raw failed and passing reports are retained in the engineering evidence for this
checkpoint. Focused tests and builds are not substitutes for the complete suite.

Cloud checkpoint: source `d6906b75498d03a0588cf4817ce3d948a84df76f`. Full suite **7927 tests/446 files**,
matching full JUnit, zero failures/skips/todo; all 7825 parent test
identities plus 102 retained with multiplicity. Lint/build exit0. Final
Chromium 45/45 retains all 42 parent cases; fixture 11 is offline, integrityOK,
original Finance retained, normal-stop/closed/cleaned and bound to the tested
build hashes. First intermediate 45/45 is retained separately. Actual development
failures and fixes, including the incorrect partial-transfer search fixture
(corrected to select by visible type while retaining the404 assertion), remain
recorded. The first concurrent full run retained 7926 passes/one 10s deep-graph timeout;
the final complete suite ran after the browser finished. No source, assertion or
deadline was changed to handle that timeout. No retries or deadlines were weakened. Author inspection
of 50 frozen paths is not independent whole-branch review.

[Proof](evidence/w11-export-rules-development.json),
[full JUnit](evidence/w11-export-rules-cloud.junit.xml.gz),
[full log](evidence/w11-export-rules-cloud.log.gz),
[first concurrent failed JUnit](evidence/w11-export-rules-cloud-first.junit.xml.gz),
[final browser JUnit](evidence/w11-export-rules-browser.junit.xml).
PR/CI run URL:none. Next:W12 recurrence and the remaining accepted scope above.
