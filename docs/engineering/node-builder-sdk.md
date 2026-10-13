# Pinned Windows builder SDK

PR44's first Node22 install failed before tests when implicit node-gyp fetched
headers through /download/release and received502. The canonical /dist route
then returned200 for headers and SHASUMS, but its node.lib transfer received502.
Both failures and exact logs are preserved; they are not native acceptance.

Before npm ci, hosted Windows jobs now download the exact version's official
headers and x64 import library with hardcoded SHA256 checks. curl may retry
transient transfers at most twice within bounded transfer deadlines; npm and
tests are not retried. All native exit codes are checked immediately. The header
inventory is checked before extraction, extracted links are rejected, the header
version is verified, and node-gyp receives its documented local nodedir layout:
include/node plus Release/node.lib. TLS/checksum verification stays enabled.

SDK assets are builder inputs in a disposable RUNNER_TEMP directory; that SDK
tree is not placed in the app release. Existing Node22/Node24 runtime pins,
VisualStudio pin, loaded better-sqlite3 N-API binary hash and tests remain required.
The quality receipt requires the SDK's six native exits, pinned checksums,
configuration and no-test-retry scope. Its policy suite is mandatory.

Cloud inspected the pinned official Node22 and Node24 assets and inventories;
that does not execute Windows SDK preparation or prove Server2019. New SDK
source policy33 availability REDs and two omitted-evidence/suite REDs became250
targeted passing assertions across5files. Frozen SDK-corrected Cloud2249/114 tests and lint/build0 passed. Exact new
Windows compilation/tests/package/service evidence remain mandatory.
