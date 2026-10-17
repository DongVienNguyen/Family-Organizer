# Wallet feature checklist

This records implementation progress, not Windows acceptance. Latest legacy-receipt
source94222ad; see [status](implementation-status.md) and source-bound evidence.
The new Wallet remains inactive by default; its gated account/record UI is wired. Existing
Finance still serves users; bulk/remaining-filter UI and activation gates remain.

| Task | Current evidence | Remaining requirement |
| --- | --- | --- |
| W01 | Accepted exact money/date/filter contracts | Retain through final integration |
| W02 | One I01 writer, core1/metadata2/FX-fee3/migration4/private receipts5, exact snapshots/media/cold compatibility | Full remaining entities and legacy receipt conversion |
| W03 | Scoped legacy projection, durable quarantine/mapping/checksum, repeat safety/backup service and native0–4 shared backup conversion to installed5 and version-matched safety pilot, explicit private receipt backup conversion/replacements;7130full Cloud tests | Raw legacy JSON/ZIP without shared manifest conversion, live receipt apply/financial remediation/cutover and actual write bridge |
| W04 | Fresh adult/grant SQL ACL, guarded core HTTP/grant CRUD, partial FX/fee redaction and session SDK/private full-record receipt endpoints/old-URL deny markers;7130full Cloud tests | Live migration/legacy bridge, grant editing UI, export/report/audit enforcement and full integration |
| W05 | Backend account/record/transfer/edit/void and guarded API, account/record forms and transfer/fee/void UI;7130full Cloud +14native browser cases, server action authority/feedback | Remaining linked lifecycle integration |
| W06 | Scoped query, exact account/record forms, list and core filter UI/session owner;7130full Cloud,14Chromium cases | Durable selection/bulk, remaining filter controls/preferences, other engines/touch and full integration |
| W07 | Low-level catalog metadata and adult read route/SDK/record choices | Catalog CRUD/tree, templates/clone/split and management UI |
| W08 | Exact balances/transaction FX and shared matching-leg query prerequisites | Shared reporting/valuation FX/coverage/drilldown engine and charts |
| W09 | Not implemented | Personal dashboard/filter/chart/widget preferences |
| W10 | Not implemented | CSV/XLS/XLSX/OFX preview/commit/dedupe/undo |
| W11 | Not implemented | Scoped exports, formula safety and previewed rule engine |
| W12 | Pilot schedule/occurrence tables only | Owned recurrence/confirmation/reminders/idempotency integration |
| W13 | Not implemented | Debt/goal canonical links without double posting |
| W14 | Not implemented | Budget/carry/forecast engine and UI |
| W15 | Not implemented | Portfolio/trades/quotes/coverage without double counting |
| W16 | Private receipt attach/verified download/confirmed detach, existing HEIC reuse;14Chromium cases | Retention, settings/PWA/OCR/warranty/shopping and remaining UX integration |
| W17 | Incremental Cloud regression only | Complete functional/browser/security/backup/performance/Windows inventory |
| W18 | Not implemented | Parity audit, rollback and staged rollout evidence |

No scope is waived by this checklist. Remaining M1 is separately tracked in
[m1-feature-checklist.md](m1-feature-checklist.md). I02/I03 and Server2019R02 are
separate gates. No release/tag/VPS access/deployment is authorized.
