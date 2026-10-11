# F04-a review and decision

Fresh whole-branch review covered ba69b09cd32d391487c67e345c76ce3bd08971d1 through 54df708c4c6765cb31dda4901bbde2343d84c2e5. One Important finding; no Critical or Minor findings. No second review is substituted for regression evidence.

The reviewer reproduced an idle-startup key-rotation defect in three fresh synthetic source processes. Issue under A, start successfully/readiness under B without any authentication traffic, restore A and restart: the old token was accepted. Runtime checked key readability but persisted generation only on a later authentication request.

Grading: Important. A successful startup after replacing a compromised signing key must revoke previous sessions. One fix pass adds the real-process regression in tests/runtime-process.test.ts; observed RED HTTP200 where401 was required, then GREEN after explicit auth.initialize() validates and persists the active key through the existing gateway before readiness. Pure createAuth construction still performs no storage/key I/O. Dynamic request-time rotation remains supported.

Corrected Cloud full suite352/352 tests42files, zero failed/skipped; lint/build are recorded separately in implementation-status. Exact corrected/final Windows evidence remains required before merge. Independent first-source proof351/351 per Node22/24 is historical, not proof for the correction.

Reviewer also independently confirmed equal-time33-login eviction to32, persistent logout across store reconstruction and absence of issued tokens from command results.

Ruling: Windows first-source execution is independently verified from full logs and both artifact sets; the corrected/final SHA needs fresh evidence — review did not judge CI — cost: no merge on stale reports.

Ruling: browser/user-switch/cache, SSE/media/object ACL, input/proxy/bootstrap/dependency and broader backup/log privacy remain F04-b/c/F05 gates — this focused PR supplies sessions, not Internet readiness — cost: F04 cannot be marked complete yet.

Ruling: Server2019, service/power-loss, encrypted recovery, package and performance remain their F06/F07/F09/R02 gates — Windows2022/source tests cannot prove those environments — cost: no deployment or whole-foundation acceptance from this slice.

All fixtures are synthetic with blocked providers and no real notification/AI delivery. No dependencies or lockfile changed. No release/tag or VPS access/deployment.
