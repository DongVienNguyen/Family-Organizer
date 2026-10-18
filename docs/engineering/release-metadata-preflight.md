# F08-b — trusted-main metadata preflight

This focused F08 slice collects authenticated read-only GitHub metadata. It does
not download/revalidate package bytes, publish a candidate, create a tag/release
or deploy. Full F08 still needs the artifact/report collector and promotion workflow.

The release-candidate workflow currently names its job metadata only. It is manual,
Windows2022/pwsh/x64, with pinned Actions and contents/actions/checks read. Explicit
commit/version/CI run inputs use environment bindings, never shell interpolation.
Trusted-main dispatch is checked before checkout. The workflow executes its own
main SHA, fetches history and disables persisted credentials. No production secrets,
PC or production runner are required.

The Node adapter checks every native Git status/signal: actual checkout matches the
workflow SHA, origin is this repository, target is an ancestor of main and target
package version matches. The transport permits fixed own-repo GitHub API paths,
GET/no redirects, a20-second timeout, counted1MiB response budget and strict UTF8/JSON.
Errors expose neither credentials nor response bodies. Offline tests use synthetic
transports and never call real providers.

The policy requires the explicit successful first-attempt main push, CI workflow
381168350 at .github/workflows/ci.yml, eight distinct GitHub Actions checks
(app15368) and corresponding successful jobs, and eight unique unexpired artifact
identities/digests bound to the same run/SHA, including the package harness used
by both consumers. Unknown, duplicate and missing artifacts fail closed. It never searches for latest success.

Output kind github-metadata-preflight has publicationAllowed:false. API digests
refer to archives not yet downloaded or checked. This output is not a completed
candidate receipt or Server2019 approval. The unconditional publication lock and
disabled npm release stay in effect.

Two F08-a deferred minors are corrected with four actual RED assertions: numeric
prerelease leading zeros fail, valid uppercase/build SemVer passes, malformed
nonarray quality returns errors. Runtime ZIP manifest compatibility remains an
independent prerequisite of full F08.

After reviewed merge and exact-HEAD Windows, a read-only trusted-main dispatch can
validate the live adapter against an explicit successful main CI run. Read-only metadata dispatch38312563391 ran successfully from main a571d62 for
explicit de66d95/CI38309067494. Evidence f08-b-live.json records exact metadata/log
hashes. This proves the live Git/API metadata adapter, not archive/report/candidate
acceptance. F08-c extends the workflow to archive downloads; its live dispatch
is still pending.

Checks are requested with filter=all and a bounded100-record response. Only the
explicit selected CI run is accepted; unrelated workflow checks on the same commit
are separated so the preflight does not reject its own check. Each accepted check
URL must match its actual job ID. More than100 records fail closed; pagination
expansion is not silently assumed. These two policy defects have actual RED/GREEN
regressions.

One fresh whole-branch review found the original six-artifact inventory rejected
every successful real CI run. The seven-artifact fixture reproduced three failing
positive assertions; explicit harness validation fixes the single underlying defect.
Negative tests retain complete inventory, unique ID/name and identity/digest checks.

Current F08-o2 protocol also requires the Productivity browser/native touch family and three generated fixtures bound to consumer-recorded SHA256 values. See [generated fixture policy](release-generated-fixture-policy.md). Historical receipts remain historical; publication stays disabled.
