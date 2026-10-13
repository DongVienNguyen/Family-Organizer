# F08-n — publication-disabled candidate and promotion preparation

Both dispatch workflows require trusted main and an explicit main commit, version
and first-attempt CI run. They use the same authenticated collector and complete
raw readers, with read-only GitHub permissions, Windows2022 and checked native
exit codes. They do not accept uploaded operator evidence or approval JSON.

After full normalization, candidate-handoff.json records the original ZIP digest
and size, actual manifest digest, target version/SHA/run and proposed immutable
asset name. It describes an asset handoff; it does not copy, rebuild, upload a
release asset or create a draft release/tag. Returned intent is detached from
the caller's mutable receipt. The existing source-level publication function
must still refuse before any preparation record can report success.

promote-release.yml prepares the same evidence and handoff under a distinct
read-only artifact name. A successful preparation job certifies collection and
the disabled handoff only. Its promotion field explicitly remains blocked by the
source lock and missing actual WindowsServer2019 acceptance. There is no publish
job, write token, production secret, deploy step or caller override.

Actual draft/prerelease creation and subsequent promotion remain unavailable
and unauthorized. Later authorization requires reviewed publishing source,
actual bound Server2019/R02 evidence with provenance and operator approval;
F05 Administration403/protection and full F09 remain separate open gates.
Synthetic unit receipts test policy refusal and naming, not GitHub authority.
Exact Windows CI and trusted-main live preparation are recorded in status.
