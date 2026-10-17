# Wallet legacy projection — W03 partial

Source `9f8537a643a0e6253ec43b3ba2998bea7fb6f212` adds a pure explicit owned
projection and one batched scoped finance read. The base WalletRecord lacks money,
account and createdAt, so the approved plan signature is expanded to a typed
bundle instead of hidden storage lookups. Identity, creator, business date, text,
VND amount, known timestamp and edit revision are retained.

The adapter refuses unsafe Number conversion, USD-as-VND, unsupported account
coercion and fake income/expense for transfers/adjustments/trades. Unknown creation
time becomes empty createdAt plus createdAtKnown=false; no midnight is fabricated.
walletRevision enables future legacy conflict checks.

Current role/deletion/grants precede SQL bodies and counts. Only visible rows
contribute to the coverage envelope. Unsupported capabilities have explicit
counts; malformed canonical data is an error, not a silently skipped row. Category/
receipt ports run only for compatible authorized records. This reader owns no
writer/cache/provider and does not activate or wire old routes.

Single-leg income/expense/adjustment type edits now preserve identity/provenance
and reverse signed postings correctly. Transfer/trade crossings still require
specialized workflows. This closes the type-edit compatibility gap recorded at
source6837a52; the actual legacy writer bridge remains unfinished.

Cloud6624tests/353files/matching6624JUnit/zero failed-skipped-todo; lint/build0.
All6586parent cases retained+38; Wallet285/14files inside full suite, legacy38/2
files targeted. LOCAL SELF5paths0C/0I/0M is not independent. See
[proof](evidence/w03-legacy-projection-development.json) for frozen hashes, raw
reports and RED35/compatibilityRED2→GREEN. No assertions/skips/retries/timeouts
were reduced.

No PR/run/browser check was created. This is Cloud working-tree qualification,
not exact-HEAD Windows CI. Current Windows2022 Node24/Node22/package/service and
Server2019R02 remain unrun. Legacy consumers must visibly handle partial coverage;
I02 must use canonical reporting before cutover. Durable W03 migration/quarantine/
mapping/conversion, W02 private receipts, W04 HTTP/media and W05UI/link integration
remain required. Existing Finance is still active; full Wallet/master incomplete.
No HTTP/provider/dependency/workflow, release/tag/VPS change.
