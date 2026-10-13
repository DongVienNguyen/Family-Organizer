# Windows operations draft

This is a source runbook for the implemented operator contracts. It has not been
executed on Windows Server2019 or a VPS. Use only a reviewed immutable Windows ZIP
whose full exact-SHA Windows evidence has been verified. Actual release publication,
Server2019 staging access and production deployment require their later gates.

| Operation | Existing authoritative contract |
| --- | --- |
| Inspect ZIP/runtime/manifest/source/licenses | [windows-package.md](windows-package.md); Build-Package/Test-Package and native manifest/verifiers; preserve original ZIP SHA256 |
| Choose installation roots/service ID/port | [windows-service.md](windows-service.md); absolute local NTFS roots outside immutable release, loopback app port, owned LocalService SID and protected DACLs |
| Initialize first account | [account-initialization.md](account-initialization.md); compiled bounded-stdin operator, never a default production password or source/demo seed |
| Install/validate/remove owned service | Install-Service/Uninstall-Service contracts in windows-service; ValidateOnly/WhatIf before mutation; removal retains instance data/config |
| Live backup/restore | [shared-snapshots.md](shared-snapshots.md), [online-recovery.md](online-recovery.md); one I01 snapshot/write barrier and staged journal, not a live family.db file copy |
| Ordinary backup | [ordinary-backup-credentials.md](ordinary-backup-credentials.md); credentials/capabilities excluded; explicitly re-enter credentials after restore |
| Encrypted recovery/configuration | [encrypted-backup-maintenance.md](encrypted-backup-maintenance.md), private-settings/provider-env/signing-key recovery contracts; recovery key outside backup, explicitly select private material |
| Scheduled backup/age/retention | [scheduled-recovery.md](scheduled-recovery.md); one backup owner, authenticated output/retention/health. Actual off-host destination and RPO/RTO are unverified |
| Update/rollback | [owned-update-rollback.md](owned-update-rollback.md), [update-startup-fence.md](update-startup-fence.md); maintenance/write fence, original snapshot and owned service, schema guard, no silent loss after new writes |
| Reverse proxy/TLS | [caddy-native-baseline.md](caddy-native-baseline.md); pinned native Caddy, loopback boundary. Current proof uses synthetic backend/private CA; actual compiled Express+public domain/certificate integration remains R02 |
| Candidate/promotion preparation | [candidate-handoff.md](candidate-handoff.md); trusted-main read-only full collector and hash-bound intent. No publisher, release/tag or VPS operation |

PowerShell automation checks LASTEXITCODE immediately after each native/npm
command, including piped commands. ErrorActionPreference alone is insufficient.
Use the package's pinned node.exe; never install/build/compiler on production or
transfer Cloud node_modules. Service stop must drain jobs/requests and close
SQLite before moving/restoring files. Keep old releases/snapshots until the
rollback window and measured recovery rehearsal permit retention cleanup.

Production acceptance still requires an approved version/hash, actual Server2019
OS/build/runtime report, cold install/reboot/recovery/TLS/private data boundaries,
representative load and timed restore. No production commands or placeholders are
presented here as already executed. Old Docker/Pi/Bash/WSL/GHCR deployment instructions
are migration history and must not be used for this Windows runtime.
