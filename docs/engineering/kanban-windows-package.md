# P08-b5b — schema8 Windows ZIP proof

The package compatibility range is Productivity1–8 and Wallet1. This advertises
supported recovery/startup schemas; it does not apply schema8 automatically.
Fresh installations still register Productivity1–6 unless an explicit pilot opts
in. Frozen migrations1–7 and Wallet1 remain unchanged.

The Windows producer builds a separate synthetic schema8 fixture containing a
shared canonical board, a private Task, a subtask, an owned Kanban board reference,
a Matrix override and Wallet1 signed64-bit extremes. The fixture stays in the
harness artifact, outside the runtime ZIP. Existing schema6/Wallet1 consumer
fixtures and assertions remain in place.

The clean Windows consumer uses the downloaded ZIP's Node/addon and compiled CJS
from System32 without checkout, install or rebuild. Its additional probe requires
real HTTP WIP/configuration/reference/privacy behavior, restart, ordinary backup
and restore, credential reentry, encrypted independent restore, session revocation,
old7 startup/backup without automatic migration, and byte-preserving refusal of
old7/future9/index-drift restore targets. Every native process exit and server stop
is recorded, external network attempts are blocked, and isolated data/handles are
cleaned up. Money stays exact and reward/notification replay is forbidden.

`package-board.json` is mandatory alongside all seven existing raw functional
reports. The collector binds its source, ZIP, executable/addon hashes, fixture
identity, schema bounds, exact phase vectors and cleanup/offline assertions to the
verified package receipt. A build flag alone cannot satisfy this gate.

At development time the Cloud host is Linux: fixture generation, native SQLite,
contract mutations and full regression reports are diagnostics. Exact-HEAD Windows
Actions logs and raw ZIP reports are required before acceptance. Windows2022 does
not establish Server2019/build17763 acceptance. No release/tag/VPS operation is
part of this change. The earlier F08 trusted source reader's fixed four-command
harness grammar predates producer-generated JSON fixtures; release promotion
remains disabled and that grammar/inventory needs a separate focused adaptation
before release qualification. No executable or generated fixture is silently
accepted by that reader.
