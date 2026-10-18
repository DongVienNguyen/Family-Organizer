# F08-a — release evidence contract

The release pipeline is being built in focused PRs. This PR supplies a pure policy
and a local Windows verifier; it does **not** yet fetch GitHub artifacts, create a
candidate, publish or promote a release. `npm run release` remains disabled.

`release-evidence.mjs` binds an explicit repository, full commit SHA, run ID,
application version and `v<version>` tag to a trusted main push, the pinned CI
workflow and all eight first-attempt GitHub Actions checks. Missing, duplicate,
foreign, skipped, cancelled or rerun checks/artifacts fail. The artifact's GitHub
SHA256 digest must equal the downloaded artifact archive's digest. The inner ZIP,
manifest and normalized quality/browser/consumer/service receipts must agree.

The receipts are an internal interface for the next authenticated collector. A
JSON file supplied by an operator is not authenticated CI evidence. The collector
must obtain API records itself, verify archive bytes and full package/runtime/native
inventory, read actual JSON/JUnit and coverage reports, and produce these receipts.
This policy alone does not establish those facts or full regression coverage.

`Test-ReleaseEvidence.ps1 -EvidenceFile <file>` validates a local receipt and
checks the Node exit code immediately. `-AcceptanceFile <file>` also checks the
promotion policy: actual Windows Server2019/build17763/x64, the pinned runtime,
original app SHA and ZIP hash, explicit operator approval and reboot/TLS/restore/
rollback acceptance. Synthetic acceptance fixtures prove rejection logic only;
Windows2022 does not establish Server2019 acceptance. The authenticated promotion
adapter must establish acceptance provenance before calling this policy.

Publication is a source-level locked operation. `assertPublicationAllowed()`
always throws `RELEASE_PUBLICATION_DISABLED`; an environment variable, input or
receipt cannot enable it. No release/tag/VPS operation is authorized in this task.
The next F08 PR will implement read-only trusted-main artifact collection and
explicit dispatch workflows while retaining this publication lock.

Two F08-a review minors were corrected in F08-b with actual RED/GREEN tests:
SemVer now rejects numeric prerelease leading zeros and accepts valid uppercase/
build metadata; malformed nonarray quality returns an error list. The publication
lock stays unconditional. Metadata live proof is f08-b-live.json; archive/report/
full candidate acceptance remains separate and incomplete.

The F08-k collector stage also reads the actual SDK, Caddy and extraction reports
for both builder runtimes, compares each to the corresponding quality receipt,
and binds all independent harness files to the target Git workflow declaration.
The declaration is parsed with pinned builder-only `yaml@2.9.1` (ISC), requires
the literal `package-build` producer on Windows2022/pwsh, and rejects aliases,
duplicate keys, conditional/continued steps and unsupported job contexts. Text
in an environment value is not a declaration; target code is never executed.
The harness directory and every ordinary file identity/size/timestamp are checked
throughout hashing and again before a success receipt. Browser-tested server and
index hashes must match the producer manifest. Contradictory Caddy failure/phase
fields fail; the intentional extraction exit1 and certificate refusal remain valid.

These receipts verify the stated subsets only. Inner ZIP contents, full license
agreement, full collector acceptance and publication remain separate gates.

F08-l adds trusted-builder native extraction of the digest-bound inner Windows
ZIP without executing its contents. One read-shared descriptor spans checksum,
all-entry preflight and bounded extraction; unsafe paths fail before output.
The packed manifest must equal the authenticated producer declaration. Actual
file inventory, lengths and hashes, copied target lockfile, dependency identities
and original pinned licenses/MPL source must agree. Final file/root checks reject
replacement or insertion while the reader validates data. Synthetic native
positive/refusal tests exercise the extractor separately; fixture metadata is
not GitHub authority. Full normalized release acceptance and publication stay
closed even after the inner byte/license subset is verified.

F08-m composes the authenticated collector's completed reader receipts into
`reports/release-evidence.json`. It binds each family to the explicit target SHA,
run and original ZIP, requires both runtime/suite/source inventories and their
shared evidence hashes, the browser/harness counts, complete consumer/service
readers and actual inner extraction/original-license agreement. The resulting
request/source/run/check/artifact/download/package/report tuple must pass the
existing `validateReleaseEvidence` policy before any success receipt is written.
Missing or contradictory families fail; producer success flags alone are insufficient.

The normalized receipt uses `reportsVerified:true` and
`consumerFunctionalVerified:true` for that explicit artifact run. The separate
`release-report-preflight.json` retains each reader's earlier subset receipt and
its pre-composition flags; it is not the final normalized receipt. Both files
are retained as Actions artifacts. These flags do not assert complete legacy
F09 coverage, protected main, actual Server2019 or publication approval.
`publicationAllowed:false` remains unconditional, and `assertPublicationAllowed`
still rejects even a complete normalized receipt. The pure normalizer accepts
synthetic prior facts for unit tests; only its invocation after the authenticated
API/download/Git/raw/native readers in trusted-main dispatch confers CI provenance.
No operator JSON ingestion, write-token job, release/tag or VPS action is added.

Composition also matches each extraction row's original artifact ID, archive
SHA256, byte count and file to the authenticated download receipt. The independent
read supplying coverage retains its actual `evidence.json` digest, and that digest
must match quality/runtime/auxiliary evidence before normalized verification.
These bindings were added after six actual contradiction failures in review.
The old preflight console marker is a deferred wording note; the normalized JSON
and explicit publication lock determine the new final result.

Current F08-o2 protocol also requires the Productivity browser/native touch family and three generated fixtures bound to consumer-recorded SHA256 values. See [generated fixture policy](release-generated-fixture-policy.md). Historical receipts remain historical; publication stays disabled.
