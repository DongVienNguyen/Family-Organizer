# F07-f — explicit portable provider environment recovery

`includeEnv:["gemini","vapid"]` selects provider groups independently from
includeSettings/includeFiles. Gemini includes GEMINI_API_KEY and its existing API_KEY
fallback. VAPID includes public/private key and subject together. No group silently
selects APP_URL, launch roots, PORT, native preload options, build metadata or unknown
variables. Omitted selection leaves target .env bytes untouched. Selected missing
values remove all matching target bindings; unselected target entries/comments/
quoted multiline values and UTF8 BOM/CRLF are retained. A dotenv roundtrip validates
that the resulting values match exactly; ambiguous unterminated quotes or values
that cannot be represented safely are refused before staging. Windows provider-name casing aliases are captured using the existing first-binding
semantics and normalized to canonical names; selected merges remove all casing aliases.
Host precedence and launch-root filtering use actual platform case semantics. Provider values have
bounded UTF8 lengths and no control bytes; the complete local file is limited1MiB.

Authenticated private-env-v1 metadata contains the same I01 snapshot and optional
settings/file selections, plus strict privateEnv format1 group/value metadata.
Older raw/settings/files encrypted bodies remain supported. All saved metadata is
validated even when unselected, before writable target storage. Runtime-branded
patches enter only the internal shared restore coordinator. Read-cache tombstones
and identities based on ciphertext plus settings/file/env selections avoid plaintext
provider verifiers in exported command metadata. Keys are supplied via external
stdin only; no plain provider values appear in release/report artifacts.

The same journal/SQL commit marker covers .env with optional hadFile/hash/size
metadata and fixed UUID-derived staging/old paths in protected CONFIG_DIR. Journal
ownership is published before plaintext staging. The coordinator validates/merges
local text before safety copy/staging, then promotes env with media/settings/key and
business rows. Uncommitted recovery restores original bytes; committed recovery
validates hash/size before cleanup. Source config and encrypted snapshots remain.
Sessions are revoked and historical effects quarantined; no parallel engine.

Runtime recovery finishes before db -> push/provider module evaluation. Initial
launch environment names remain authoritative. After journal recovery, configuration
reconciles values derived from the original/recovered file, including target APP_URL
when .env was temporarily absent during the first import, and clears removed provider
values. Launch roots/NODE_ENV still cannot be selected through dotenv. Existing
explicit host overrides win over restored file values.

Actual26 helper REDs,1 Windows BOM RED,4 CLI selection REDs,1 config-reload RED,
2 shared boundary/promotion REDs and3 env crash cases were developed. The first
SQL-commit crash attempt failed dependency resolution from temporary eval cwd and
was not counted as a behavioral RED; a corrected counterfactual then observed the
actual stale provider value. A subsequent real env-old-renamed startup assertion
exposed missing target APP_URL, fixed by reconciliation of file-derived values.
Target144 tests/5files plus46 helper/config cases after casing checks pass. Full
Cloud1591/1591 tests/90files passed with2workers, failed/pending/todo0; lint/build0.
Initial lint2 unknown-value narrowing is retained; an erased cast after its guard
corrected it without runtime changes. Native ZIP7 env proofs and owned PS5.1 env probes
are added; compiled Cloud14 functional plus6 raw/6 private/6 signing/7 env proofs
completed. One fresh review and exact Windows remain required before merge.
All values/providers/keys are synthetic/offline; VAPID test keys are generated locally
without sending notifications. Server2019/reboot/power-loss/RPO/RTO are not proved.

Remaining F07 work: online backup/one-owner scheduler/age/disk-full/retention/offhost
encrypted copy and guarded update/rollback. F05 Administration403 remains an external
main-protection blocker. No release/tag/VPS access/deployment or new domain features.
