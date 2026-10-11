# I01 shared storage foundation

I01 starts from main `06657385b15543840cee51c6da60f8fadba1daa5`, the
authorized squash merge of F03 PR #3. Its source HEAD `9009a66` passed Windows
run [38142720657](https://github.com/DongVienNguyen/Family-Organizer/actions/runs/38142720657):
216 tests in 24 files per Node22/24 job, all six command exit checks and CI gate.
The user now authorizes all reviewed, verified PR merges. Release publication
and VPS access/deployment remain outside authorization.

I01 is split into focused PRs: (a) gateway, migration registry and legacy writer
ownership; (b) consistent snapshots and durable job leases/retry/outbox. I01 is
incomplete until both meet the master plan acceptance tests. No new domain
features or live provider delivery are introduced by part (a).

The existing SQLite connection remains the only connection manager. Gateway
callbacks are synchronous, hold an immediate transaction, reject public nested
transactions and invalidate transaction handles after completion. Internal legacy
methods explicitly reuse the current transaction and document. Commands persist
actor, command, request ID, payload hash and result in the same commit; equal
retries return the prior result and conflicts return 409. Request bodies are not
independently stored in the audit; retry results contain the returned business
fields and share the database ACL. Authenticated request context takes precedence over legacy
method actor arguments.

Legacy collections are compared against the document read inside the transaction;
only changed collections are persisted. Loaded documents saved outside the gateway
use collection conflict detection so stale full snapshots cannot overwrite newer
points. Seed/import/restore remain explicit whole-document operations. Domain
tables are never enumerated by legacy save. Activity writes nested inside a domain
method share its document and roll back together. SQLite errors propagate to the
caller. Notifications and media deletion are deferred until commit; durable delivery
and filesystem recovery are acceptance requirements for part (b).

Domain migrations require an explicit pilot context and enabled namespaces, run
contiguous versions in one transaction, record immutable checksums and refuse
unknown namespaces or downgraded code. Wallet/productivity version zero means
absent; neither domain is enabled by this PR. Runtime migration checksums must be
explicit constants, independent of TypeScript transformation/bundling.

Legacy writer audit and real Windows RED/GREEN evidence will be recorded below.

## Legacy writer audit

All 74 public collection-mutating methods in `FamilyDB` are wrapped by
`runLegacyCommand`. The AST audit follows transitive `this.method()` calls
and checks task approval, reward redemptions and private notification helpers.

`logActivity`, `createBackup`, `deleteBackup`, `restoreFromSnapshot`, `restoreBackup`, `createUser`, `updateProfile`, `generateBirthdayNotifications`, `deleteUser`, `changePassword`, `adminUpdateUser`, `adminResetPassword`, `saveTask`, `approveTaskCompletion`, `rejectTaskCompletion`, `addCommentToTask`, `deleteTask`, `savePlan`, `deletePlan`, `saveNote`, `deleteNote`, `saveTransaction`, `deleteTransaction`, `addRewardEntry`, `saveRewardItem`, `deleteRewardItem`, `redeemRewardItem`, `seedDefaultRewardItems`, `redeemMysteryItem`, `saveBudget`, `deleteBudget`, `saveCustomCategory`, `deleteCustomCategory`, `setHiddenBuiltinCategories`, `carryForwardBudgets`, `saveRecurringBill`, `deleteRecurringBill`, `saveSavingsGoal`, `deleteSavingsGoal`, `addSavingsContribution`, `removeSavingsContribution`, `saveDebt`, `deleteDebt`, `addDebtPayment`, `removeDebtPayment`, `saveVaccination`, `deleteVaccination`, `saveGrowthRecord`, `deleteGrowthRecord`, `saveHealthProfile`, `payRecurringBill`, `saveAsset`, `deleteAsset`, `saveShoppingItem`, `toggleShoppingItem`, `deleteShoppingItem`, `clearPurchasedShopping`, `clearAllShopping`, `getDishLibrary`, `setMealPlan`, `appendMarketHistory`, `addDishesFromAI`, `saveMedication`, `deleteMedication`, `logMedicationDose`, `saveDocument`, `deleteDocument`, `generateReminders`, `addPushSubscription`, `removePushSubscriptionByEndpoint`, `removePushSubscriptionsByEndpoints`, `sendManualNotification`, `markNotificationRead`, `markAllNotificationsRead`.

Direct SQLite exceptions: module bootstrap and the offline synthetic demo seed
replace a complete document; telemetry is an independent transient table.
No legacy save enumerates domain tables. Settings, media writes, backup file
staging and complete restore recovery require the I01-b coordinator. This part
does not claim filesystem rollback or durable delivery acceptance.

`RewardStoreTx` grants/reverses namespaced completion claims against the existing
`rewardLedger` collection. Its claim table holds identifiers/hashes only; it is
not a second points ledger. Existing legacy grants retain their IDs/shape and
pass through the same write gateway; P10 will integrate domain completion claims.

## RED evidence

Windows run [38145312689](https://github.com/DongVienNguyen/Family-Organizer/actions/runs/38145312689),
HEAD `27d9ee323cf2793c0fa3a4a19b42c4946c3fc4b8`: both Node22/24 passed install,
native compatibility, lint, build and production probes; the 12 new gateway/
migration tests failed at deliberately unimplemented ports. Full logs and both
artifacts were downloaded/read. No assertions were skipped or weakened. Additional
Cloud regression tests prove unsupported schema refusal and transitive legacy
writer ownership against the original implementation before restoring GREEN.
