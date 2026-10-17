# Wallet feature checklist

This records implementation progress, not Windows acceptance. Latest internal-API/SDK
source73c6743; see [status](implementation-status.md) and source-bound evidence.
The new Wallet remains inactive and unwired; existing Finance still serves users.

| Task | Current evidence | Remaining requirement |
| --- | --- | --- |
| W01 | Accepted exact money/date/filter contracts | Retain through final integration |
| W02 | One I01 writer, core1/metadata2/FX-fee3/migration4, exact snapshots/cold compatibility | Full remaining entities/private attachment manifest and conversion |
| W03 | Scoped legacy projection, durable quarantine/mapping/checksum, repeat safety/backup service and native0/1/2/3 shared backup conversion;6726full Cloud tests | Raw legacy JSON/ZIP without shared manifest conversion, private receipt conversion, remediation/cutover and actual write bridge |
| W04 | Fresh adult/grant SQL ACL, guarded core HTTP/grant CRUD, partial FX/fee redaction and session SDK;6824full Cloud tests | Private receipt/media, export/report/audit enforcement and full integration |
| W05 | Backend account/record/transfer/edit/void and guarded API;6824full Cloud tests | UI wiring and linked lifecycle integration |
| W06 | Scoped shared filters/counts/cursor/matched legs;44query cases,6770full Cloud tests | Durable selection/bulk, account/record forms and functional browser tests |
| W07 | Low-level catalog metadata only | Catalog CRUD/tree, templates/clone/split and UI |
| W08 | Exact balances/transaction FX and shared matching-leg query prerequisites | Shared reporting/valuation FX/coverage/drilldown engine and charts |
| W09 | Not implemented | Personal dashboard/filter/chart/widget preferences |
| W10 | Not implemented | CSV/XLS/XLSX/OFX preview/commit/dedupe/undo |
| W11 | Not implemented | Scoped exports, formula safety and previewed rule engine |
| W12 | Pilot schedule/occurrence tables only | Owned recurrence/confirmation/reminders/idempotency integration |
| W13 | Not implemented | Debt/goal canonical links without double posting |
| W14 | Not implemented | Budget/carry/forecast engine and UI |
| W15 | Not implemented | Portfolio/trades/quotes/coverage without double counting |
| W16 | Not implemented | Wallet settings/PWA/receipt/UX integration |
| W17 | Incremental Cloud regression only | Complete functional/browser/security/backup/performance/Windows inventory |
| W18 | Not implemented | Parity audit, rollback and staged rollout evidence |

No scope is waived by this checklist. Remaining M1 is separately tracked in
[m1-feature-checklist.md](m1-feature-checklist.md). I02/I03 and Server2019R02 are
separate gates. No release/tag/VPS access/deployment is authorized.
