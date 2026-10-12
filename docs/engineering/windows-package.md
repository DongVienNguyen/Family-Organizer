# Windows package — F06-b/F06-c

This focused change adds a Windows2022 producer and a different clean Windows2022
consumer. It prepares CI artifacts; it does not create a tag/release or deploy.
Windows Server2019 acceptance remains R02.

The producer checks its exact checkout SHA, verifies the pinned official
Node24.21.0 win-x64 ZIP SHA256, installs production dependencies on Windows from
package-lock.json, and packages dist, node.exe, the Windows x64 N-API SQLite
prebuild, an operator launcher, license/author notices and a release manifest.
No Cloud node_modules are transferred. Eight frontend-only direct dependencies
move to devDependencies without changing locked versions; their compiled assets
and original license/build-input metadata remain distributed.

The manifest binds app version, source SHA, Node patch/ABI/N-API, archive and native
hashes, schema bounds and every file's size/SHA256. The manifest excludes its own
hash; detached producer evidence hashes the complete ZIP, including the manifest.
The JSON schema describes structural fields; package-contract.mjs additionally
checks path/size budgets, exact pins and cross-field relations. Full source and
license inventory checks run after extraction. Dependency notices distinguish
standalone notices from complete original MIT notices embedded in upstream READMEs.
The producer and consumer reject unresolved runtime license evidence. The missing
http_ece1.2.0 MIT notice is copied verbatim from its npm gitHead, with commit/blob
and byte hashes pinned. Shared MPL2 and source Apache2 terms are included; the
original web-push3.6.7 copyright and preferred-form src/*.js bytes are preserved
and verified against the build input. Unknown license identifiers require review.
This recognition policy verifies the reviewed runtime closure; it does not claim
automated legal compatibility certification or full frontend/font license review.
Original README/source SPDX attribution and bundled upstream notices are kept.

The consumer downloads that ZIP and a separate built-in-only test harness. It has
no checkout, npm install or build, clears NODE_PATH/NODE_OPTIONS and removes global
Node from PATH. Before extraction, PowerShell validates all central-directory
entries, rejecting traversal, Windows devices/ADS/drive paths, symlinks/reparse
flags, case aliases, parent-file collisions and excessive expansion/size. The
preflight also runs malicious archives under Windows PowerShell5.1. The consumer
extracts into a Unicode/space path and uses only bin/node.exe for runtime and
compiled app tests. It validates launcher ValidateOnly/WhatIf, all manifest bytes,
production dependency identities, actual SQLite loading, existing compiled
regressions and additional synthetic finance CRUD, task reward/restart, legacy
migration and shared I01 snapshot/restore/session revocation/core-row retention.
Owned fixtures are removed after all child processes and native handles close;
cleanup and every native exit code are recorded, including failure paths.

Artifact retention is14days. Raw producer/install/build/manifest/preflight logs,
manifest, ZIP and consumer reports remain separate evidence. The ci-gate requires
both package jobs in addition to both quality runtimes and browser regressions.

Remaining F06/F07 work: actual Windows service templates/install/start/stop/recovery,
launcher production service integration, authenticated portable encrypted recovery,
operator update/rollback and remaining frontend/font license review. F09 still requires
all legacy features' regression mapping/performance and all required jobs green
at the same SHA. Main protection API enforcement is currently HTTP403 despite
user authorization. None of those pending checks is inferred from ZIP success.
