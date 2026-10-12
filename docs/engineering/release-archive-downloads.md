# F08-c — authenticated archive downloads

The trusted-main manual preflight obtains the seven exact artifact identities from
GitHub metadata for the explicit successful first-attempt main CI run. It downloads
those IDs in the same process; an operator-supplied JSON receipt is not authority.
The source Git SHA/origin/ancestry/version and seven checks/jobs/artifacts retain
F08-b validation. It never selects latest success or rebuilds the application.

Each archive is downloaded through a fixed own-repository API GET with the injected
read token. Only its302 redirect to an HTTPS GitHub artifact storage hostname is
accepted. Signed-storage GET uses no API token; another redirect, userinfo, foreign
host, nonstandard port or fragment is rejected. Errors contain neither token,
signed URL, response body nor underlying private error text.

Downloads use fresh exclusive files under a fresh directory. Actual streamed bytes
are counted with a512MiB per-archive limit and120-second whole-download deadline;
declared content length, when present, must match. SHA256 must match the authenticated
API digest before acceptance. Exact native parent/file identities and ordinary-file
checks guard output paths; owned partial files and failed batches are removed.
A1GiB total batch budget limits seven archives. Existing output is preserved.

The receipt kind is github-artifact-archives, with publicationAllowed:false and
reportsVerified:false. Archive hash agreement does not prove safe ZIP extraction,
raw JSON/JUnit/coverage/browser/service reports, inner package manifest/file/license
inventory, or Server2019 acceptance. Those are mandatory later collector gates.
The workflow uploads receipt JSON only; no candidate, tag, release or deployment.
Unconditional publication refusal remains in release-evidence.mjs.

Offline synthetic tests cover redirect/credential separation, invalid ID/digest,
HTTP errors, bounded/truncated/interrupted responses, response cancellation,
exclusive/linked paths, timeout, metadata identity, exact seven downloads, batch
budget and cleanup. New-function availability REDs are distinguished from actual
new-code defects; no historical application bug is claimed from these tests.
Full source verification, review, exact Windows CI and live read-only main dispatch
remain required before this slice is accepted.

One fresh review found the aggregate check ran after a whole archive download.
Two RED assertions prove an exhausted budget sent a third request, and a headerless
partial third response was not cancelled at the remaining allowance. The collector
now refuses when no budget remains and passes the remaining byte allowance into
the downloader's declared/streamed caps. A true headerless backpressured fixture
proves reading, overflow cancellation, one-byte partial output and owned cleanup.
The former headerless fixture still had a content-length header; corrected coverage
is not an additional historical application defect. Frozen corrected Cloud1973/105,
247 target/3files, lint/build0 passed. Main rebase, exact Windows and live archives
remain mandatory; no rereview or completed candidate acceptance is claimed.

After merging the reviewed finance baseline PR39, the archive implementation,
workflow and tests remained byte-identical. Fresh frozen Cloud verification on
main f25af44 passed1989 tests/106files and248 target/3files, with lint/build exit0.
Both finance and archive suites remain mandatory. Exact Windows/live archives
are still pending; this is development evidence only.
