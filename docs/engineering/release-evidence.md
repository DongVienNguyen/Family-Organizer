# F08-a — release evidence contract

The release pipeline is being built in focused PRs. This PR supplies a pure policy
and a local Windows verifier; it does **not** yet fetch GitHub artifacts, create a
candidate, publish or promote a release. `npm run release` remains disabled.

`release-evidence.mjs` binds an explicit repository, full commit SHA, run ID,
application version and `v<version>` tag to a trusted main push, the pinned CI
workflow and all seven first-attempt GitHub Actions checks. Missing, duplicate,
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

Two review minors are deferred to F08-b before candidate use: the current version
matcher accepts numeric prerelease identifiers with leading zeros and excludes
uppercase/build metadata; malformed nonarray `quality` can throw instead of
returning an error list. The CLI catches malformed input and refuses with a
constant message. Neither case enables publication.
