# Wallet financial relations — W02 partial

Source `3a44a4fd23af6aba31eaa85b6494acef5fb45bce` adds explicit migration3 for
wallet_record_fx and wallet_transfer_fees. It persists independent positive minor
amounts as INTEGER/BigInt, rational rate strings, source and effective quote date.
W01 major-unit conversion must agree exactly with the credit amount, including
its one rounding boundary. Fees remain separately classified expense records,
FK-linked uniquely to their transfer; no fee is hidden in debit/credit amounts.

Repositories reject overwritten FX, invalid rates/currency/amounts, mismatched
current transfer legs, reused fees and invalid fee shape. Linking rechecks current
parent postings/FX. Snapshots require consistent transfer signs/currencies, FX for
cross-currency legs and voided fees when a linked transfer is voided. One-leg
external and balanced same-currency transfers require no invented FX.

Core1/metadata2 SQL and checksums remain frozen. Financial3 checksum is
62dc673e1c18834975ff8477266d39a59d07641f5985a914488b3b7ef1acebf8. Only explicit
pilot registration/application upgrades storage; startup retains supported1/2/3
without activation. Standalone2/3/4 map to those domains; the shared I01 envelope
stays1. Restore requires matching installed version, not automatic loss of new
fields to accept old backups. W03 still owns the explicit old-backup converter.

Cloud6539tests/349files/matching6539JUnit/zero failed-skipped-todo; lint/build0.
All6493parent cases remain+46, including one declared version-neutral title rename
and advanced future sentinels. Wallet200/10files run in the full suite; targeted198
ran before two final cases. Cold native refusal covers changed FX affinity and fee
FK/uniqueness with unchanged file bytes and closed handles. LOCAL SELF12paths,
0Critical/0Important/0Minor, is not an independent review.

[Proof](evidence/w02-financial-relations-development.json) binds frozen source,
reports/hashes and RED failures/corrections. These are Cloud working-tree reports
for committed source, not exact-HEAD Windows CI. No PR/run/browser validation was
created. Current Windows2022 Node24/Node22/package/service and Server2019R02 unrun.

No financial HTTP/UI/cutover, quote refresh, provider call or extra writer was added.
W02 full entities/private receipts, W03 durable migration/quarantine/conversion,
W04 authorized routes/media and W05 transaction commands/UI remain unfinished.
Existing finance remains active; full M1/Wallet/master acceptance is not claimed.
No dependencies/workflows changed; no release/tag/VPS.
