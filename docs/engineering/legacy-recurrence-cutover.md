# Controlled legacy recurrence cutover — P10-d4c backend

This is an explicit administrator pilot operation, not startup migration or production rollout. Default Productivity migration remains6. Frozen1–12 migrations/checksums/DDL stay unchanged; explicit13 adds `productivity_legacy_cutovers`. Backend PR129 is accepted at160d45750c639d0ce053d119678aeb35572e2a0a (Windows38924197212), merged as5fc6ad8dd0942212c1b05d708bdcc7229b2c0f77. Each Node22/24 passed5387tests/297files with matchingJUnit; all8checks/11raw families and136first-attempt browser/touch cases passed. The controlled client/UI slice is in development. Full P10 and actual13 Windows ZIP qualification remain incomplete.

The operator must first enable the complete pilot migration chain in a disposable synthetic installation. The runtime admits an already migrated13 installation without applying13 to older storage. Unknown14, checksum mismatch and drifted DDL fail closed. No release/tag, real family conversion, VPS or Server2019 qualification is authorized here.

## Internal authenticated contract

- `GET /api/productivity/tasks/legacy-recurrence/:id/preview` requires a current administrator. It resolves the selected Task's entire old recurrence family, including soft-deleted history, and returns a fingerprint, family IDs, IDs whose old generator will stop, other open Task IDs and pending status. It accepts no query fields and makes no writes or receipts.
- `POST /api/productivity/tasks/legacy-recurrence/:id/cutover` accepts `{expectedRevision,input:{fingerprint,policy,anchor,acknowledgeOtherActive}}` with a caller-owned request UUID through the existing session/command gateway. Policy/missed handling and anchor are explicit. Other open family Tasks require acknowledgement; they remain ordinary work. This is not a public integration API or an automatic data-import endpoint.
- Administrator authority is checked before reading a cached receipt and again in the transaction. Current Task revision and the fingerprint bind all original Task rows and tags. Stale data returns409; malformed or incoherent families refuse without writes. A family is bounded to10000Tasks/8MiB; oversized legacy provenance is rejected in SQL before loading its large JSON bodies. Unrelated orphan history does not block a coherent selected family.

| Data | Result |
| --- | --- |
| Existing Task IDs, body, due, assignee, rank, proof/comments, pending/submission flags, deleted state | Preserved |
| Previous history | Preserved in order; one cutover audit entry is appended per changed Task |
| Old positive recurrence type across the whole family, including deleted generators | Set to `none`; Task revision increments once |
| Old interval, end date, roster and source linkage | Preserved as provenance; retained forms cannot change these recurrence knobs after conversion |
| New series | Selected Task is ordinal0; explicit new policy/anchor, acceptedCount0, nextOrdinal1 and roster origin cursor |
| Existing rewards, claims, accepted occurrence facts, notifications, Wallet data | Preserved; conversion generates no successor, reward, acceptance, rotation advancement or delivery |
| Pending child work | Remains pending with proof; later authorized approval uses the existing semantic owner and grants one reward/successor |

New canonical successors retain the existing completion/skip/edit owner. Legacy forms may continue ordinary title/proof/status operations with unchanged recurrence fields; they cannot restart an old generator. A legacy descendant whose recurrence type is alreadynone must also use controlled conversion rather than registering a parallel series. This additional admission guard applies to explicit13; older pilot behavior remains characterized separately.

The shared user collection writer now upserts retained user rows and removes only absent IDs. Deleting and reinserting all users violated native foreign keys after skip/cutover history referenced those IDs. User ordering/metadata updates now preserve parent identity; deleting a referenced user and duplicate IDs still refuse atomically. This is covered for already supported schema12 as well as13.

## Recovery and evidence

The registry stores the original root, selected Task, series, actor and a bounded versioned provenance memento. Boot and logical/encrypted replacement validate native constraints, exact columns/checksums and semantic cross-references. Every original member must remain in the memento; only new canonical occurrences owned by this series may extend the family. A checksummed snapshot cannot omit a historical sibling to remove its generator guard. Ordinary restore does not replay conversion or rewards.

Development tests exercise real SQLite transactions/HTTP and separately compiled Node processes: encrypted restore, pending proof, UUID replay, approval once, Wallet int64 extremes, closed handles, old12 remaining12/refusing a13 replacement, unknown14, DDL drift, semantic damage and encrypted repair. No test sends a provider notification or uses production credentials/data. Reports, causal RED→GREEN histories, exact tested source hashes and Windows URLs belong in the accompanying evidence/status records; a Cloud test or build alone is not Windows acceptance.

The Windows ZIP package harness currently qualifies its documented earlier pilot fixture. This backend13 test is not a claim that an actual13 release ZIP or Windows Server2019 has been accepted. Extend package/rollout evidence before production use.

## Controlled editor (development; Windows qualification pending)

The shared Task drawer identifies an old recurrence type, a historical source link
or a known descendant. A current administrator reads a private family preview;
ordinary new Tasks retain the existing series editor. “Inspect old recurrence”
allows explicit discovery when only retained historical linkage is available.
The preview makes no writes and is never stored in the drawer draft cache.

Conversion reuses the existing policy controls. The anchor starts empty, separately
from the current Task due date. The user must explicitly select missed handling,
confirm the new policy/anchor and acknowledge any other open family Tasks. A
completion-based policy may explicitly start without an anchor. Changing policy
or anchor clears the policy acknowledgement. The existing owned confirmation
modal allows cancellation with no writes. Pending child work may be converted
without accepting it; ordinary series edits still refuse pending work.

A coherent historical family with every old generator already disabled is also
eligible. It contains at least two linked Tasks; conversion changes no Task rows,
but records the same provenance and starts one series with acceptedCount0. A
single ordinary nonrecurring Task still uses ordinary series creation. Recovery
validates family connectivity and complete membership in both cases. No DDL or
migration checksum changes are needed for this eligibility correction.

Commands use the existing session, native no-store reads and caller-owned UUID;
there is no automatic retry or offline mutation queue. An authority refusal clears
only recurrence metadata/draft, preserving the readable Task and unsent comment,
checklist and subtask inputs. Refreshing/reopening requires a current authorized
preview. All labels are provided in Vietnamese, English and Chinese.

The explicit browser-only fixture advances from12 to13 without changing the
original39Task rows, two boards or nine saved views. New synthetic families are
created through retained app routes after the previous30browser cases. Both new
flows must pass independently in Chromium, Firefox and WebKit; previous90flows,
45legacy cases and native touch remain mandatory. This fixture does not advance
default production storage or qualify an actual13 Windows ZIP.
