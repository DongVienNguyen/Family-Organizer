// Independent synthetic report fixtures match existing compiled-probe schemas.
const records={
  "package-functional.json": {
    "productivity": {"completed": true, "fixtureCommitSha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "taskIds": ["canonical-parent", "canonical-task"], "rawTaskRows": 0, "revision": 2, "malformedCurrentTaskRepaired": true, "structureCommands":{"httpEnabled":true,"catalogRetry":true,"checklistProgress":true,"treeSectionMove":true,"archiveRetry":true,"staleRefused":true,"invalidRefused":true,"v1Refused":true,"atomicSubtaskRetry":true,"personalPinRetry":true}, "structureStorage":{"version":4,"checklistPreserved":true,"catalogPreserved":true,"tagOwnershipPreserved":true,"v1StartupWithoutUpgrade":true,"v2StartupWithoutUpgrade":true,"v3StartupWithoutUpgrade":true,"personalPinsPreserved":true,"atomicSubtaskPreserved":true}, "semanticCommands": {"httpEnabled":true,"noneCreated":true,"legacyFullFormPreserved":true,"staleRevisionRefused":true,"forgedFieldsRefused":true,"restartPreserved":true}, "sparseCoreRefusal": {"exitCode": 1, "databaseBytesPreserved": true, "nativeHandlesClosed": true, "journal": "delete", "tableCount": 2}, "snapshotChecksum": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc", "encryptedSha256": "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd", "refusalCases": [{"kind": "changed-checksum", "exitCode": 1, "databaseBytesPreserved": true, "nativeHandlesClosed": true, "journal": "delete"}, {"kind": "future-version", "exitCode": 1, "databaseBytesPreserved": true, "nativeHandlesClosed": true, "journal": "delete"}, {"kind": "unknown-namespace", "exitCode": 1, "databaseBytesPreserved": true, "nativeHandlesClosed": true, "journal": "delete"}], "networkAttempts": [], "nativeHandlesClosed": true},
    "commitSha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "nodeVersion": "v24.21.0",
    "nodeExecutable": "C:\\synthetic\\fo package dữ liệu 11111111-2222-4333-8444-555555555555\\release with spaces\\bin\\node.exe",
    "platform": "win32",
    "architecture": "x64",
    "checks": [
      "legacy-migration-source-preserved",
      "finance-create-read-update",
      "task-reward-once",
      "restart-preserves-finance-reward",
      "finance-delete",
      "ordinary-backup-excludes-credentials",
      "restore-requires-explicit-credential-reentry",
      "compiled-offline-reentry-preserves-user-ids",
      "shared-snapshot-restore",
      "restore-revokes-session",
      "restore-preserves-reward-no-replay",
      "snapshot-core-rows-preserved",
      "offline-providers",
      "native-handles-closed",
      "compiled-canonical-task-http-restart-snapshot-recovery",
      "compiled-canonical-unsupported-migration-refusal"
    ],
    "networkAttempts": [],
    "snapshotChecksum": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
  },
  "package-recovery.json": {
    "commitSha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "platform": "win32",
    "architecture": "x64",
    "nodeVersion": "v24.21.0",
    "nodeExecutable": "C:\\synthetic\\fo package dữ liệu 11111111-2222-4333-8444-555555555555\\release with spaces\\bin\\node.exe",
    "completed": true,
    "checks": [
      "compiled-recovery-whole-release-excluded",
      "compiled-recovery-encrypted-no-key-plaintext",
      "compiled-recovery-authentication-before-mutation",
      "compiled-portable-restore-ids-finance-reward-media",
      "compiled-recovery-no-claim-command-replay",
      "compiled-recovery-native-handles-closed"
    ],
    "nativeExitCodes": [
      {
        "phase": "release-root-refusal",
        "exitCode": 1
      },
      {
        "phase": "release-bin-refusal",
        "exitCode": 1
      },
      {
        "phase": "release-ops-refusal",
        "exitCode": 1
      },
      {
        "phase": "encrypted-backup",
        "exitCode": 0
      },
      {
        "phase": "target-initialize",
        "exitCode": 0
      },
      {
        "phase": "wrong-key",
        "exitCode": 1
      },
      {
        "phase": "tampered-ciphertext",
        "exitCode": 1
      },
      {
        "phase": "portable-restore",
        "exitCode": 0
      }
    ],
    "encryptedSha256": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "encryptedBytes": 23930
  },
  "package-private-settings.json": {
    "commitSha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "platform": "win32",
    "architecture": "x64",
    "nodeVersion": "v24.21.0",
    "nodeExecutable": "C:\\synthetic\\fo package dữ liệu 11111111-2222-4333-8444-555555555555\\release with spaces\\bin\\node.exe",
    "completed": true,
    "checks": [
      "compiled-explicit-settings-encrypted-no-plaintext",
      "compiled-selected-settings-wrong-key-no-mutation",
      "compiled-authenticated-invalid-snapshot-unwarmed-schema-rows-journal-files-preserved",
      "compiled-selected-subset-unselected-settings-retained",
      "compiled-private-settings-business-claims-session-preserved",
      "compiled-private-settings-offline-source-retained-closed-handles"
    ],
    "nativeExitCodes": [
      {
        "phase": "selected-backup",
        "exitCode": 0
      },
      {
        "phase": "target-initialize",
        "exitCode": 0
      },
      {
        "phase": "wrong-key",
        "exitCode": 1
      },
      {
        "phase": "invalid-snapshot-manifest",
        "exitCode": 1
      },
      {
        "phase": "invalid-snapshot-checksum",
        "exitCode": 1
      },
      {
        "phase": "invalid-snapshot-primary-key",
        "exitCode": 1
      },
      {
        "phase": "invalid-snapshot-migrations",
        "exitCode": 1
      },
      {
        "phase": "invalid-snapshot-credentials",
        "exitCode": 1
      },
      {
        "phase": "selected-restore",
        "exitCode": 0
      }
    ],
    "encryptedSha256": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  },
  "package-signing-key.json": {
    "commitSha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "platform": "win32",
    "architecture": "x64",
    "nodeVersion": "v24.21.0",
    "nodeExecutable": "C:\\synthetic\\fo package dữ liệu 11111111-2222-4333-8444-555555555555\\release with spaces\\bin\\node.exe",
    "completed": true,
    "checks": [
      "compiled-explicit-signing-key-encrypted-no-plaintext",
      "compiled-signing-key-wrong-key-missing-selection-no-mutation",
      "compiled-unselected-signing-key-retained",
      "compiled-selected-signing-key-business-claims-sessions-preserved",
      "compiled-selected-signing-key-removal-provider-env-retained",
      "compiled-signing-key-offline-source-retained-closed-handles"
    ],
    "nativeExitCodes": [
      {
        "phase": "signing-backup",
        "exitCode": 0
      },
      {
        "phase": "signing-target-initialize",
        "exitCode": 0
      },
      {
        "phase": "signing-wrong-key",
        "exitCode": 1
      },
      {
        "phase": "signing-raw-backup",
        "exitCode": 0
      },
      {
        "phase": "signing-missing-group",
        "exitCode": 1
      },
      {
        "phase": "signing-omitted",
        "exitCode": 0
      },
      {
        "phase": "signing-selected",
        "exitCode": 0
      },
      {
        "phase": "signing-absent-backup",
        "exitCode": 0
      },
      {
        "phase": "signing-absent-restore",
        "exitCode": 0
      }
    ],
    "encryptedSha256": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  },
  "package-provider-env.json": {
    "commitSha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "platform": "win32",
    "architecture": "x64",
    "nodeVersion": "v24.21.0",
    "nodeExecutable": "C:\\synthetic\\fo package dữ liệu 11111111-2222-4333-8444-555555555555\\release with spaces\\bin\\node.exe",
    "completed": true,
    "checks": [
      "compiled-explicit-provider-env-encrypted-no-plaintext",
      "compiled-provider-env-wrong-key-missing-selection-no-mutation",
      "compiled-unselected-provider-env-bytes-retained",
      "compiled-provider-env-subset-vapid-pair-host-text-preserved",
      "compiled-provider-env-business-claims-sessions-source-preserved",
      "compiled-selected-provider-env-removal-unselected-values-retained",
      "compiled-provider-env-offline-closed-handles"
    ],
    "nativeExitCodes": [
      {
        "phase": "env-backup",
        "exitCode": 0
      },
      {
        "phase": "env-target-initialize",
        "exitCode": 0
      },
      {
        "phase": "env-wrong-key",
        "exitCode": 1
      },
      {
        "phase": "env-raw-backup",
        "exitCode": 0
      },
      {
        "phase": "env-missing-group",
        "exitCode": 1
      },
      {
        "phase": "env-omitted",
        "exitCode": 0
      },
      {
        "phase": "env-gemini-selected",
        "exitCode": 0
      },
      {
        "phase": "env-vapid-selected",
        "exitCode": 0
      },
      {
        "phase": "env-absent-backup",
        "exitCode": 0
      },
      {
        "phase": "env-absent-restore",
        "exitCode": 0
      }
    ],
    "encryptedSha256": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  },
  "package-online-recovery.json": {
    "commitSha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "platform": "win32",
    "architecture": "x64",
    "nodeVersion": "v24.21.0",
    "nodeExecutable": "C:\\synthetic\\fo package dữ liệu 11111111-2222-4333-8444-555555555555\\release with spaces\\bin\\node.exe",
    "completed": true,
    "checks": [
      "compiled-online-live-wal-selected-secrets-encrypted",
      "compiled-online-failed-capture-keeps-runtime-and-prior-output",
      "compiled-online-native-denied-output-keeps-runtime",
      "compiled-online-concurrent-exclusive-publication",
      "compiled-online-later-http-write-owner-retained",
      "compiled-online-shutdown-fence-drained",
      "compiled-online-shared-offline-restore-point-in-time-claims-config-sessions",
      "compiled-online-overlapping-live-writer-snapshot-consistent",
      "compiled-online-offline-network-closed-handles"
    ],
    "nativeExitCodes": [
      {
        "phase": "online-live-capture",
        "exitCode": 0
      },
      {
        "phase": "online-target-initialize",
        "exitCode": 0
      },
      {
        "phase": "online-offline-restore",
        "exitCode": 0
      },
      {
        "phase": "online-overlap-restore",
        "exitCode": 0
      }
    ],
    "encryptedSha256": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  },
  "production.json": {
    "incompatibleSchemas": [
      {
        "name": "future",
        "exitCode": 1,
        "bytesSchemaRowsJournalPreserved": true,
        "databaseSha256": "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
        "journal": "delete",
        "nativeHandlesReleased": true,
        "networkAttempts": []
      },
      {
        "name": "missing-version",
        "exitCode": 1,
        "bytesSchemaRowsJournalPreserved": true,
        "databaseSha256": "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
        "journal": "delete",
        "nativeHandlesReleased": true,
        "networkAttempts": []
      },
      {
        "name": "foreign",
        "exitCode": 1,
        "bytesSchemaRowsJournalPreserved": true,
        "databaseSha256": "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
        "journal": "delete",
        "nativeHandlesReleased": true,
        "networkAttempts": []
      },
      {
        "name": "sqliteX",
        "exitCode": 1,
        "bytesSchemaRowsJournalPreserved": true,
        "databaseSha256": "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
        "journal": "delete",
        "nativeHandlesReleased": true,
        "networkAttempts": []
      },
      {
        "name": "sqliteData",
        "exitCode": 1,
        "bytesSchemaRowsJournalPreserved": true,
        "databaseSha256": "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
        "journal": "delete",
        "nativeHandlesReleased": true,
        "networkAttempts": []
      },
      {
        "name": "malformed-metadata",
        "exitCode": 1,
        "bytesSchemaRowsJournalPreserved": true,
        "databaseSha256": "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
        "journal": "delete",
        "nativeHandlesReleased": true,
        "networkAttempts": []
      },
      {
        "name": "malformed-owned-table",
        "exitCode": 1,
        "bytesSchemaRowsJournalPreserved": true,
        "databaseSha256": "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
        "journal": "delete",
        "nativeHandlesReleased": true,
        "networkAttempts": []
      }
    ],
    "commitSha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "nodeVersion": "v24.21.0",
    "platform": "win32",
    "architecture": "x64",
    "cwd": "C:\\Windows\\System32",
    "productionRoot": "C:\\synthetic\\fo package dữ liệu 11111111-2222-4333-8444-555555555555\\release with spaces\\app",
    "checks": [
      "production-dependencies-only",
      "no-source-ts",
      "foreign-cwd",
      "static-assets",
      "legacy-preserved",
      "restart-persistence",
      "write-permission-fail-fast",
      "offline-providers",
      "graceful-shutdown",
      "readiness",
      "crash-recovery",
      "auth-session-restart",
      "auth-session-logout",
      "private-response-cache",
      "authenticated-realtime",
      "object-visibility",
      "authenticated-media",
      "task-write-authority",
      "content-write-authority",
      "derived-object-privacy",
      "explicit-first-account",
      "provider-digest-privacy",
      "incompatible-schema-preserved"
    ]
  }
};
export function releaseConsumerFixture():any{return {reports:structuredClone(records),expected:{commitSha:"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",runId:42},packageReports:{commitSha:"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",runId:42,appVersion:"1.1.0",zipSha256:"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",packageReportAgreement:true,validation:{nodeExecutable:"C:\\synthetic\\fo package d\u1eef li\u1ec7u 11111111-2222-4333-8444-555555555555\\release with spaces\\bin\\node.exe"}}};}
