# F05-a review and correction

Single fresh read-only whole-branch review: BASEc24486b to
HEADd5165a130eac8261e7d4feadf86e0345562a0f55, PR19. No Critical findings.
All four findings were accepted and graded before one correction pass; no
rereview or additional reviewer test run was used.

| Severity | Finding | Correction and verification |
|---|---|---|
| Important | B05 completed all Member reads before switching | Hold an actual authenticated Member notes response, switch to Child, then release it; preserve positive Member access, Child visibility and revoked-token assertions in all3engines |
| Important | Production server/index hashes were recorded but unvalidated | Writer independently hashes current build outputs; contract requires matching hashes; six actual synthetic corruption RED cases before correction |
| Minor | JUnit checked15totals but not engine/case identity | Compare all15unique suite-hostname/test-name pairs with the JSON matrix; three actual synthetic identity corruption RED cases before correction |
| Minor | Mobile navigation and theme persistence absent | B01 opens the actual mobile menu, navigates to notes, toggles theme and verifies it after reload in every engine |

The nine added machine-gate tests first failed against the reviewed code, while
the existing46tests passed. These are new harness evidence requirements, not
claims of previously exploitable app vulnerabilities. Late-response/mobile flows
are additional real-browser characterizations; their Windows results remain
pending until the corrected SHA's reports are independently read.

The first exact Windows run38188559453 retained its failure: Node22 and24 each
passed1137tests in78files, all seven native checks/audit0 and22compiled production
proofs. Browser9passed/6failed/0skipped/0flaky; server exited0, SQLite integrityok,
connection closed, fixture removed and external-attempt log empty. B03 and B05
failed in all engines because the new fixture omitted required Note.tags and
mistook the existing private-media anti-enumeration404 policy for403. Corrections
add valid tags/isPinned and assert strict404 plus identical missing-file response
and positive authorized access. Finance denial remains403. No source behavior or
existing assertion is weakened. Raw reports, failure screenshots/video/trace and
full logs were downloaded; hashes are in evidence/f05-a-first-source.json.

Main protection remains blocked by actual Administration-write HTTP403. F05-b
coverage, full legacy matrix, packaging/service/encryption and Server2019 remain
subsequent work. No release/tag/VPS actions occurred.
