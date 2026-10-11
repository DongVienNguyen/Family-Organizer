# Derived object privacy

Reward history, in-app notifications, push delivery and Admin activity logs now apply current source visibility. The existing canonical point ledger, family balances/leaderboard, reward shop and React/Express/SQLite remain. No Wallet currency ledger, new API or integration token.

| Projection | Current rule |
|---|---|
| Rewards | Adults retain existing history; limited actors see a task reason/ID only while that task is visible. Their own manual reasons remain. Other manual or inaccessible task reasons are generic. All point entries/amounts remain, preserving original family balances. |
| Notifications | Existing recipient restriction plus current typed source ACL. Finance remains adult-only; patient data uses existing patient ACL. A deleted/revoked object source is absent from authorized lists/read acknowledgments. |
| Push | Resolve the queued managed reference and live recipient/subscription again, then use the same authorized notification list for body and badge. Unknown/deleted roles or invisible sources dispatch nothing. |
| Activity | Admin permission does not grant private document read. New document logs carry the canonical document reference; invisible/deleted sources and unproven historical `Giấy tờ` details are generic. Actor/action/time remain. |

New canonical writers attach optional internal source references for tasks, schedules, document/medication/vaccination reminders, finance reminders and document logs. Authorized manual nudges and existing family birthday/gift announcements have explicit audience markers. These references are not accepted through a client management endpoint. Historical JSON/snapshot data remains unchanged; an ordinary read never mutates the ledger, source or notice.

Historical untyped task/plan/note/system content for actors without domain-wide read authority is generic because recipient identity cannot prove source visibility. Historical finance broadcasts are absent for limited actors; untyped health broadcasts are absent unless adult or the original recipient. Cost: some old limited-user notification details become generic; newly created authorized manual messages remain readable. No prose parsing or guessed source binding. Reward balances stay shared as required by the existing family leaderboard; this does not grant access to private task IDs/titles.

Native mark-read/read-all repeat current live actor/context and source authority inside the synchronous I01 gateway, preserving rollback and cached command semantics. Read projections resolve current live known roles from the installation snapshot. The app factory and outbox registration remain storage-free imports. Old raw native getters remain trusted snapshot/internal ports, not new HTTP endpoints.

TDD:24 observed source/HTTP/queued-provider failures, four preservation characterizations and three observed missing-suite/proof gate failures, all GREEN. Frozen npm ci/lint/full891/89171files/build exit0, zero skips; no dependency/lock changes. Existing HTTP ACL fixture now supplies the new read projection port and keeps its assertions. The20th compiled proof tests source-deleted reward redaction without changing balances, obsolete task-notice filtering and a readable/acknowledgeable manual nudge. Exact Windows source/final HEAD and fresh whole-branch review remain pending.

Weekly digest/provider audience/revalidation/raw-error redaction, bootstrap/proxy/login input, dependency findings and encrypted credential backups remain other foundation gates. Actual browser/PWA is F05; Server2019 is R02. F05 ruleset/protection writes403 remains an external blocker, not enforced merge policy. No release/tag/VPS operation.
