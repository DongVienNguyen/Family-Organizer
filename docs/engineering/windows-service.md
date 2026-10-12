# Windows service — F07-a

This focused change prepares an owned Family Organizer service and a mandatory
Windows2022 disposable service CI job. Actual Server2019/.NET prerequisites,
reboot and production acceptance remain R02. No production deployment is run.

The package includes official stable WinSW2.12.0's NET461 managed wrapper,
verified SHA256 b5066b7bbdfba1293e5d15cda3caaea88fbeab35bd5b38c41c913d492aadfc4f.
It runs on supported .NET Framework4.8 or later (registry Release>=528040),
with an explicit supportedRuntime config. No self-contained obsolete .NET runtime
is bundled. Exact original MIT notice/author attribution is preserved. Service
pins join app/runtime/native/schema/file hashes in release-manifest.json.

Install-Service.ps1 takes an already verified release, a trusted manifest SHA256,
a separate absolute local InstanceRoot, owned ServiceId (FamilyOrganizer or
FamilyOrganizer- followed by alphanumerics) and loopback Port. Authenticate the
manifest and helper import closure before running the pinned bundled node.exe;
validate all package bytes/licenses/service pins before mutation. ValidateOnly
and WhatIf create no storage/service. Reparse/device/ADS/traversal/variable
expansion and overlapping/system roots are refused. Existing unowned data or
services are refused; idempotent reinstall requires the same protected descriptor,
wrapper/configuration hashes and registered image path/account.

After elevated installation, initialize the first account through the existing
[offline operator](account-initialization.md) before starting an empty installation.
The service uses NT AUTHORITY LocalService with its per-service SID enabled.
Admin/SYSTEM have full access; the service SID reads release/service files and
modifies only its data/config/log folders. Installer/removal actions do not seed
or overwrite a database, credentials or settings. Configuration stays outside
immutable release files and includes no account password.

WinSW starts bundled x64 node.exe and compiled server.cjs with explicit code/storage
roots and cwd, production mode, HOST127.0.0.1, and cleared NODE_PATH/NODE_OPTIONS.
Automatic delayed boot start,45second graceful-stop budget, first failure restart
after5seconds then none (reset1hour), and stdout/stderr10MiB/eight-file rotation
are configured. Production Caddy/TLS/proxy integration and rotation stress proof
remain later work. Reboot/Server2019 are not inferred from a hosted service start.

Use the installed owned wrapper's start/stop/restart commands, checking the native
exit code immediately. Uninstall-Service.ps1 validates the descriptor and registered
image/account before stopping/removing the service; it retains instance data and
configuration for recovery or a deliberate reinstall. It does not remove ProgramData.
A changed release/port is an update operation, not an idempotent reinstall; the
maintenance/snapshot/update/rollback orchestration remains later F07 work.

CI downloads the same producer ZIP and independent harness after the clean package
consumer succeeds, with no source checkout/npm/build/global Node. It verifies
manifest/WinSW/.NET, ValidateOnly/WhatIf, actual SCM account/delayed start/SID/ACL,
idempotent installation, loopback listener, synthetic legacy/finance continuity,
start/stop/restart, unexpected worker exit recovery and per-stop graceful logs,
exclusive database opening/native integrity, owned idempotent uninstall and cleanup.
All native commands check LASTEXITCODE immediately; logs/typed failure/exit/check/
cleanup reports are retained14days. A service failure or skip fails ci-gate.

Source regressions currently pass in Cloud; actual Windows service evidence is
pending and will be recorded in implementation-status.md. F05 main enforcement
still returns403. Portable encrypted recovery, credential-redacted ordinary backup,
one backup owner, off-host encrypted copy, disk-full/age/retention, Caddy and fenced
update/rollback remain pending; this service PR does not complete F07/F09.
