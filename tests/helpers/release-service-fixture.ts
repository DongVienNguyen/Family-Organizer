// Existing disposable synthetic Windows service report schema, copied before implementation.
// This data fixture is never GitHub authority or Server2019/reboot acceptance.
const fixture = {
  "service-exit.json": {
    "zipSha256": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "serviceRemoved": true,
    "nativeExitCodes": [
      {
        "exitCode": 0,
        "phase": "validate-only"
      },
      {
        "exitCode": 0,
        "phase": "what-if"
      },
      {
        "exitCode": 0,
        "phase": "install"
      },
      {
        "exitCode": 0,
        "phase": "version"
      },
      {
        "exitCode": 0,
        "phase": "seed"
      },
      {
        "exitCode": 0,
        "phase": "install-again"
      },
      {
        "exitCode": 0,
        "phase": "start"
      },
      {
        "exitCode": 0,
        "phase": "first-functional"
      },
      {
        "exitCode": 0,
        "phase": "credential-active"
      },
      {
        "exitCode": 0,
        "phase": "recovery-active"
      },
      {
        "exitCode": 0,
        "phase": "stop"
      },
      {
        "exitCode": 0,
        "phase": "database-closed"
      },
      {
        "exitCode": 0,
        "phase": "credential-stopped"
      },
      {
        "exitCode": 0,
        "phase": "recovery-stopped"
      },
      {
        "exitCode": 0,
        "phase": "restart-start"
      },
      {
        "exitCode": 0,
        "phase": "restarted-functional"
      },
      {
        "exitCode": 0,
        "phase": "restart"
      },
      {
        "exitCode": 0,
        "phase": "restart-graceful-functional"
      },
      {
        "exitCode": 0,
        "phase": "recovered-functional"
      },
      {
        "exitCode": 0,
        "phase": "final-stop"
      },
      {
        "exitCode": 0,
        "phase": "database-closed"
      },
      {
        "exitCode": 0,
        "phase": "scheduled-configure"
      },
      {
        "exitCode": 0,
        "phase": "scheduled-start"
      },
      {
        "exitCode": 0,
        "phase": "scheduled-active"
      },
      {
        "exitCode": 0,
        "phase": "scheduled-stop"
      },
      {
        "exitCode": 0,
        "phase": "database-closed"
      },
      {
        "exitCode": 0,
        "phase": "scheduled-finalize"
      },
      {
        "exitCode": 0,
        "phase": "update-configure-held"
      },
      {
        "exitCode": 0,
        "phase": "update-start-held"
      },
      {
        "exitCode": 0,
        "phase": "update-held"
      },
      {
        "exitCode": 0,
        "phase": "update-stop-held"
      },
      {
        "exitCode": 0,
        "phase": "database-closed"
      },
      {
        "exitCode": 0,
        "phase": "update-stopped-held"
      },
      {
        "exitCode": 0,
        "phase": "update-configure-approve"
      },
      {
        "exitCode": 0,
        "phase": "update-start-candidate"
      },
      {
        "exitCode": 0,
        "phase": "update-approve"
      },
      {
        "exitCode": 0,
        "phase": "update-ready"
      },
      {
        "exitCode": 0,
        "phase": "update-stop-approved"
      },
      {
        "exitCode": 0,
        "phase": "database-closed"
      },
      {
        "exitCode": 0,
        "phase": "owned-update-coordinator"
      },
      {
        "exitCode": 0,
        "phase": "uninstall"
      },
      {
        "exitCode": 0,
        "phase": "uninstall-again"
      }
    ],
    "runUrl": "https://github.com/DongVienNguyen/Family-Organizer/actions/runs/12345",
    "server2019Acceptance": "not-run",
    "commitSha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "exitCode": 0,
    "serviceId": "FamilyOrganizer-CI74d2d1b6d70c4d8881629339f28f7312",
    "fixtureCleanup": true,
    "frameworkRelease": 533325,
    "consumerInstall": false,
    "checks": [
      "synthetic-service-security-refusals",
      "validate-only-whatif-no-mutation",
      "owned-idempotent-install-data-preserved",
      "localservice-per-service-sid-acl",
      "automatic-delayed-start-bounded-logs",
      "start-stop-graceful-closed-handles",
      "owned-offline-credential-reentry",
      "owned-encrypted-recovery",
      "restart-graceful-worker-replacement-persistence",
      "restart-crash-recovery-persistence",
      "owned-localservice-scheduled-encrypted-backup",
      "owned-update-startup-fence-durable-rollback-boundary",
      "owned-native-update-pre-post-write-compatible-rollback",
      "owned-uninstall-idempotent-data-retained"
    ],
    "consumerRebuild": false,
    "wrapperVersion": "2.12.0",
    "failure": null,
    "actualReboot": "not-run",
    "sourceCheckoutPresent": false,
    "preflightNativeExitCodes": [
      {
        "exitCode": 0,
        "phase": "package-validation"
      },
      {
        "exitCode": 0,
        "phase": "security-render"
      },
      {
        "exitCode": 1,
        "phase": "owned-configuration"
      },
      {
        "exitCode": 1,
        "phase": "owned-configuration"
      },
      {
        "exitCode": 0,
        "phase": "package-validation"
      }
    ]
  },
  "service-functional.json": {
    "commitSha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "nodeVersion": "v24.21.0",
    "platform": "win32",
    "architecture": "x64",
    "checks": [
      "synthetic-offline-fixture",
      "service-finance-write",
      "closed-database-integrity",
      "service-restart-persistence",
      "service-restart-persistence",
      "service-crash-recovery-persistence",
      "closed-database-integrity",
      "closed-database-integrity",
      "closed-database-integrity",
      "closed-database-integrity"
    ],
    "legacySourceSha256": "c7085551711cf2c797dd9bfeff4b03a0574f977fef39c98741257cd0d0815c25",
    "financeId": "tx_1791879618880_4bc814c5-0fc4-44e1-878c-c8df4807e053"
  },
  "service-security.json": [
    {
      "passed": true,
      "failure": "owned-configuration native exit 1",
      "name": "self-hashed-alternate-service-xml"
    },
    {
      "passed": true,
      "failure": "owned-configuration native exit 1",
      "name": "installed-clr-config-tampering"
    },
    {
      "name": "administrative-node-preload-not-executed",
      "passed": true
    },
    {
      "name": "administrative-node-environment-restored",
      "passed": true
    },
    {
      "exitCode": 1,
      "passed": true,
      "name": "uninstall-requires-independent-trust"
    },
    {
      "name": "existing-explicit-write-grant-removed",
      "passed": true
    },
    {
      "passed": true,
      "failure": "Owned service tree contains reparse point",
      "name": "descendant-junction-refused-before-acl"
    },
    {
      "name": "junction-target-acl-unchanged",
      "passed": true
    }
  ],
  "service-credentials.json": {
    "commitSha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "platform": "win32",
    "architecture": "x64",
    "checks": [
      "windows-desktop-host-security-module-validated",
      "running-service-refused-before-input",
      "validation-whatif-no-input-no-mutation",
      "invalid-batch-atomic-no-secret-output",
      "owned-compiled-operator-reentry-preserves-ids-roles-business"
    ],
    "nativeExitCodes": [
      {
        "phase": "desktop-host-validation",
        "exitCode": 0
      },
      {
        "phase": "active-refusal",
        "exitCode": 1
      },
      {
        "phase": "-ValidateOnly",
        "exitCode": 0
      },
      {
        "phase": "-WhatIf",
        "exitCode": 0
      },
      {
        "phase": "invalid-batch",
        "exitCode": 1
      },
      {
        "phase": "credential-reentry",
        "exitCode": 0
      }
    ],
    "completed": true,
    "powershellHost": {
      "commandModule": "Microsoft.PowerShell.Security",
      "inputEncoding": "utf-8",
      "major": 5,
      "edition": "Desktop",
      "inputPreamble": "EF-BB-BF",
      "securityModulePath": "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\Modules\\Microsoft.PowerShell.Security\\Microsoft.PowerShell.Security.psd1"
    }
  },
  "service-recovery.json": {
    "commitSha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "platform": "win32",
    "architecture": "x64",
    "checks": [
      "owned-recovery-running-service-refused-before-input",
      "owned-recovery-validation-whatif-no-input-mutation",
      "owned-recovery-operation-lock-overlap-no-journal-mutation",
      "owned-recovery-encrypted-backup-external-key",
      "owned-recovery-wrong-key-no-mutation",
      "owned-recovery-restore-business-ids-session-revocation",
      "owned-private-settings-missing-group-no-mutation",
      "owned-private-settings-selected-restore-business-preserved",
      "owned-unselected-signing-key-retained",
      "owned-selected-signing-key-business-session-policy-preserved",
      "owned-unselected-provider-env-bytes-retained",
      "owned-selected-provider-env-host-business-session-policy-preserved"
    ],
    "nativeExitCodes": [
      {
        "phase": "active-Backup",
        "exitCode": 1
      },
      {
        "phase": "active-Restore",
        "exitCode": 1
      },
      {
        "phase": "Backup-ValidateOnly",
        "exitCode": 0
      },
      {
        "phase": "Backup-WhatIf",
        "exitCode": 0
      },
      {
        "phase": "Restore-ValidateOnly",
        "exitCode": 0
      },
      {
        "phase": "Restore-WhatIf",
        "exitCode": 0
      },
      {
        "phase": "overlap-Backup",
        "exitCode": 1
      },
      {
        "phase": "overlap-Restore",
        "exitCode": 1
      },
      {
        "phase": "overlap-Reset",
        "exitCode": 1
      },
      {
        "phase": "encrypted-backup",
        "exitCode": 0
      },
      {
        "phase": "wrong-key",
        "exitCode": 1
      },
      {
        "phase": "encrypted-restore",
        "exitCode": 0
      },
      {
        "phase": "private-settings-backup",
        "exitCode": 0
      },
      {
        "phase": "private-settings-missing-group",
        "exitCode": 1
      },
      {
        "phase": "private-settings-restore",
        "exitCode": 0
      },
      {
        "phase": "signing-key-backup",
        "exitCode": 0
      },
      {
        "phase": "signing-key-omitted",
        "exitCode": 0
      },
      {
        "phase": "signing-key-selected",
        "exitCode": 0
      },
      {
        "phase": "provider-env-backup",
        "exitCode": 0
      },
      {
        "phase": "provider-env-omitted",
        "exitCode": 0
      },
      {
        "phase": "provider-env-selected",
        "exitCode": 0
      }
    ],
    "completed": true,
    "operationLockProbes": [
      0,
      1,
      0,
      0,
      0
    ],
    "operationInputReady": true,
    "encryptedSha256": "9e5e1fd295664cdbc686f0084a1f85011dd2fba1fd288dc0d4ebe2cda1b22188",
    "encryptedBytes": 9642
  },
  "service-scheduled-backup.json": {
    "commitSha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "platform": "win32",
    "architecture": "x64",
    "nodeExecutable": "C:\\fo-service-cedb96f9-14a5-4024-b8da-3b82eff5e2d1\\release dữ liệu with spaces\\bin\\node.exe",
    "checks": [
      "owned-schedule-validation-whatif-no-input-no-mutation",
      "owned-schedule-explicit-portable-key-idempotent-no-rotation",
      "owned-schedule-existing-key-readers-resealed-bytes-retained",
      "owned-schedule-reinstall-private-key-config-acls-preserved",
      "owned-localservice-scheduled-capture-ready-private-health-key-excluded",
      "owned-maintenance-validation-whatif-no-input-no-mutation",
      "owned-maintenance-copy-root-untrusted-writer-refused",
      "owned-maintenance-file-owner-writer-delete-child-short-alias-hostile-parent-refused",
      "owned-encrypted-copy-retention-shared-restore-key-source-preserved",
      "owned-scheduled-offline-restore-claims-sessions-source-key-retained"
    ],
    "nativeExitCodes": [
      {
        "phase": "schedule--ValidateOnly",
        "exitCode": 0
      },
      {
        "phase": "schedule--WhatIf",
        "exitCode": 0
      },
      {
        "phase": "schedule-invalid-selection",
        "exitCode": 1
      },
      {
        "phase": "schedule-enable",
        "exitCode": 0
      },
      {
        "phase": "schedule-enable-again",
        "exitCode": 0
      },
      {
        "phase": "schedule-key-change-refusal",
        "exitCode": 1
      },
      {
        "phase": "schedule-extra-reader-fixture",
        "exitCode": 0
      },
      {
        "phase": "schedule-extra-reader-reseal",
        "exitCode": 0
      },
      {
        "phase": "schedule-extra-reader-acl",
        "exitCode": 0
      },
      {
        "phase": "schedule-missing-service-read-fixture",
        "exitCode": 0
      },
      {
        "phase": "schedule-missing-service-read-reseal",
        "exitCode": 0
      },
      {
        "phase": "schedule-missing-service-read-acl",
        "exitCode": 0
      },
      {
        "phase": "schedule-reinstall",
        "exitCode": 0
      },
      {
        "phase": "schedule-reinstall-acl",
        "exitCode": 0
      },
      {
        "phase": "schedule-running-refusal",
        "exitCode": 1
      },
      {
        "phase": "schedule-shared-offline-restore",
        "exitCode": 0
      },
      {
        "phase": "maintenance--ValidateOnly",
        "exitCode": 0
      },
      {
        "phase": "maintenance--WhatIf",
        "exitCode": 0
      },
      {
        "phase": "maintenance-seal-copy-root",
        "exitCode": 0
      },
      {
        "phase": "maintenance-untrusted-writer-fixture",
        "exitCode": 0
      },
      {
        "phase": "maintenance-untrusted-writer-refusal",
        "exitCode": 1
      },
      {
        "phase": "maintenance-reseal-copy-root",
        "exitCode": 0
      },
      {
        "phase": "maintenance-ancestor-inventory",
        "exitCode": 0
      },
      {
        "phase": "maintenance-copy",
        "exitCode": 0
      },
      {
        "phase": "maintenance-copy-again",
        "exitCode": 0
      },
      {
        "phase": "maintenance-review-anchor-seal",
        "exitCode": 0
      },
      {
        "phase": "maintenance-file-writer-fixture",
        "exitCode": 0
      },
      {
        "phase": "maintenance-file-writer-refusal",
        "exitCode": 1
      },
      {
        "phase": "maintenance-file-writer-reseal",
        "exitCode": 0
      },
      {
        "phase": "maintenance-file-owner-fixture",
        "exitCode": 0
      },
      {
        "phase": "maintenance-file-owner-refusal",
        "exitCode": 1
      },
      {
        "phase": "maintenance-file-owner-reseal",
        "exitCode": 0
      },
      {
        "phase": "maintenance-delete-child-fixture",
        "exitCode": 0
      },
      {
        "phase": "maintenance-delete-child-refusal",
        "exitCode": 1
      },
      {
        "phase": "maintenance-delete-child-reseal",
        "exitCode": 0
      },
      {
        "phase": "maintenance-short-name-fixture",
        "exitCode": 0
      },
      {
        "phase": "maintenance-alias-files-seal",
        "exitCode": 0
      },
      {
        "phase": "maintenance-source-short-alias-refusal",
        "exitCode": 1
      },
      {
        "phase": "maintenance-protected-short-alias-refusal",
        "exitCode": 1
      },
      {
        "phase": "maintenance-hostile-parent-fixture",
        "exitCode": 0
      },
      {
        "phase": "maintenance-hostile-parent-refusal",
        "exitCode": 1
      },
      {
        "phase": "maintenance-prune",
        "exitCode": 0
      },
      {
        "phase": "maintenance-copy-shared-restore",
        "exitCode": 0
      },
      {
        "phase": "schedule-disable",
        "exitCode": 0
      }
    ],
    "completed": true,
    "fileName": "recovery_f577e23d-64f7-4379-a496-ef3c62e40cf5.fo-recovery",
    "encryptedSha256": "49e93e7501ea204967f1c5124ea8cd7e62155145dae853962c0520b99a1f428d",
    "encryptedBytes": 19574,
    "copyAncestors": [
      {
        "path": "C:\\",
        "owner": "S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464",
        "rules": [
          {
            "sid": "S-1-5-11",
            "rights": 4,
            "type": "Allow",
            "propagation": 0
          },
          {
            "sid": "S-1-5-11",
            "rights": -536805376,
            "type": "Allow",
            "propagation": 2
          },
          {
            "sid": "S-1-5-18",
            "rights": 2032127,
            "type": "Allow",
            "propagation": 0
          },
          {
            "sid": "S-1-5-32-544",
            "rights": 2032127,
            "type": "Allow",
            "propagation": 0
          },
          {
            "sid": "S-1-5-32-545",
            "rights": 1179817,
            "type": "Allow",
            "propagation": 0
          }
        ]
      }
    ],
    "reviewRegressions": [
      {
        "phase": "maintenance-file-writer-refusal",
        "exitCode": 1,
        "expectedExitCode": 1
      },
      {
        "phase": "maintenance-file-owner-refusal",
        "exitCode": 1,
        "expectedExitCode": 1
      },
      {
        "phase": "maintenance-delete-child-refusal",
        "exitCode": 1,
        "expectedExitCode": 1
      },
      {
        "phase": "maintenance-source-short-alias-refusal",
        "exitCode": 1,
        "expectedExitCode": 1
      },
      {
        "phase": "maintenance-protected-short-alias-refusal",
        "exitCode": 1,
        "expectedExitCode": 1
      },
      {
        "phase": "maintenance-hostile-parent-refusal",
        "exitCode": 1,
        "expectedExitCode": 1
      }
    ]
  },
  "service-update-fence.json": {
    "commitSha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "platform": "win32",
    "architecture": "x64",
    "checks": [
      "owned-update-fixed-control-private-reader-reinstall-preserved",
      "owned-update-held-http-jobs-no-writes-open",
      "owned-update-held-stop-graceful-closed-storage",
      "owned-update-new-attempt-held-before-approval",
      "owned-update-approved-health-smoke-durable-boundary-before-ready"
    ],
    "nativeExitCodes": [
      {
        "phase": "update-configure-held-seal",
        "exitCode": 0
      },
      {
        "phase": "update-configure-held-reinstall",
        "exitCode": 0
      },
      {
        "phase": "update-configure-held-reinstall-acl",
        "exitCode": 0
      },
      {
        "phase": "update-configure-approve-seal",
        "exitCode": 0
      },
      {
        "phase": "update-configure-approve-reinstall",
        "exitCode": 0
      },
      {
        "phase": "update-configure-approve-reinstall-acl",
        "exitCode": 0
      },
      {
        "phase": "update-approve-publish",
        "exitCode": 0
      }
    ],
    "completed": true,
    "operationId": "d2bfde08-9707-4ad5-8bf1-90fce42fd31f",
    "businessSha256": "fe51d0981fd05a0828cd9d12fc4f9ff78c759cbbb041401e680e340a761a6e9d",
    "jobsSha256": "5f0d8b03d8890b9dd046bca6af3e5d44b95b28991c9d19612a86cf11d607ce19",
    "writesMayOpen": true
  },
  "service-update-coordinator.json": {
    "commitSha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "platform": "win32",
    "architecture": "x64",
    "checks": [
      "owned-update-validation-whatif-no-input-no-stop-no-mutation",
      "owned-update-install-uninstall-share-existing-operation-guard",
      "owned-update-candidate-failure-preapproval-shared-restore-fresh-writes-retained",
      "owned-update-stopped-fresh-encrypted-snapshot-held-approve-ready-latch-history",
      "owned-update-source-operator-capture-before-candidate-bootstrap",
      "owned-update-postapproval-snapshot-refused-no-data-journal-control-mutation",
      "owned-update-incompatible-binary-refused-without-reset-or-snapshot-loss",
      "owned-update-compatible-binary-rollback-postapproval-business-retained",
      "owned-update-ordinary-explicit-rollback-failure-stopped-data-latch-retained",
      "owned-update-closed-handles-claim-no-replay-source-key-snapshot-retained"
    ],
    "nativeExitCodes": [
      {
        "phase": "coordinator-seal-candidate",
        "exitCode": 0,
        "expectedExitCode": 0
      },
      {
        "phase": "coordinator-review-writable-fixture",
        "exitCode": 0,
        "expectedExitCode": 0
      },
      {
        "phase": "coordinator-review-writable-refusal",
        "exitCode": 1,
        "expectedExitCode": null
      },
      {
        "phase": "coordinator-review-writable-reseal",
        "exitCode": 0,
        "expectedExitCode": 0
      },
      {
        "phase": "coordinator-review-stale-owner-refusal",
        "exitCode": 1,
        "expectedExitCode": null
      },
      {
        "phase": "coordinator-review-stale-owner-repair",
        "exitCode": 0,
        "expectedExitCode": 0
      },
      {
        "phase": "coordinator-review-snapshot-seal",
        "exitCode": 0,
        "expectedExitCode": 0
      },
      {
        "phase": "coordinator-review-snapshot-reinstall",
        "exitCode": 0,
        "expectedExitCode": 0
      },
      {
        "phase": "coordinator-review-snapshot-acl",
        "exitCode": 0,
        "expectedExitCode": null
      },
      {
        "phase": "coordinator-review-snapshot-reseal",
        "exitCode": 0,
        "expectedExitCode": 0
      },
      {
        "phase": "coordinator-validateonly",
        "exitCode": 0,
        "expectedExitCode": 0
      },
      {
        "phase": "coordinator-whatif",
        "exitCode": 0,
        "expectedExitCode": 0
      },
      {
        "phase": "coordinator-overlap-apply",
        "exitCode": 1,
        "expectedExitCode": 1
      },
      {
        "phase": "coordinator-overlap-install",
        "exitCode": 1,
        "expectedExitCode": 1
      },
      {
        "phase": "coordinator-overlap-uninstall",
        "exitCode": 1,
        "expectedExitCode": 1
      },
      {
        "phase": "coordinator-start-source",
        "exitCode": 0,
        "expectedExitCode": 0
      },
      {
        "phase": "coordinator-stop-source-for-fault",
        "exitCode": 0,
        "expectedExitCode": 0
      },
      {
        "phase": "coordinator-candidate-failure",
        "exitCode": 1,
        "expectedExitCode": 1
      },
      {
        "phase": "coordinator-snapshot-rollback-idempotent",
        "exitCode": 0,
        "expectedExitCode": 0
      },
      {
        "phase": "coordinator-healthy-apply",
        "exitCode": 0,
        "expectedExitCode": 0
      },
      {
        "phase": "coordinator-apply-idempotent",
        "exitCode": 0,
        "expectedExitCode": 0
      },
      {
        "phase": "coordinator-postopen-snapshot-refusal",
        "exitCode": 1,
        "expectedExitCode": 1
      },
      {
        "phase": "coordinator-stop-for-schema-refusal",
        "exitCode": 0,
        "expectedExitCode": 0
      },
      {
        "phase": "coordinator-incompatible-binary-refusal",
        "exitCode": 1,
        "expectedExitCode": 1
      },
      {
        "phase": "coordinator-review-explicit-rollback-failure",
        "exitCode": 1,
        "expectedExitCode": null
      },
      {
        "phase": "coordinator-review-explicit-rollback-stopped",
        "exitCode": 0,
        "expectedExitCode": null
      },
      {
        "phase": "coordinator-review-explicit-rollback-repair",
        "exitCode": 0,
        "expectedExitCode": 0
      },
      {
        "phase": "coordinator-compatible-binary-rollback",
        "exitCode": 0,
        "expectedExitCode": 0
      },
      {
        "phase": "coordinator-binary-rollback-idempotent",
        "exitCode": 0,
        "expectedExitCode": 0
      },
      {
        "phase": "coordinator-final-stop",
        "exitCode": 0,
        "expectedExitCode": 0
      },
      {
        "phase": "coordinator-closed-storage",
        "exitCode": 0,
        "expectedExitCode": 0
      }
    ],
    "candidateType": "synthetic tested ZIP copy plus authenticated candidate-only backup bootstrap mutation probe; no published release/version",
    "completed": true,
    "reviewRefusals": [
      {
        "name": "mutable-candidate-executable-refused-before-elevated-execution",
        "actualExitCode": 1,
        "expectedExitCode": 1
      },
      {
        "name": "stale-authorized-uninstall-refused-under-guard",
        "actualExitCode": 1,
        "expectedExitCode": 1
      },
      {
        "name": "journal-snapshot-no-service-writer-after-reinstall",
        "actualExitCode": 0,
        "expectedExitCode": 0
      },
      {
        "name": "damaged-opened-binding-fails-explicit-rollback",
        "actualExitCode": 1,
        "expectedExitCode": 1
      },
      {
        "name": "explicit-rollback-postapproval-failure-stops-owned-old-service",
        "actualExitCode": 0,
        "expectedExitCode": 0
      }
    ],
    "candidateManifestSha256": "95fe8e62d25a1858cf0d9914c2d643f7ff600307beffbb6237155c938912b9aa",
    "freshBeforeUpdateId": "tx_1791879807566_e63c7fc8-b463-4fe6-9cff-91a867c8ed06",
    "sourceCapturePointsBefore": 17,
    "sourceCapturePointsAfter": 17,
    "failedOperationId": "4f68828d-a226-4bc7-ae49-329c2f9f95eb",
    "preopenBusinessSha256": "66a327c258c5efbc93a20b9e853335b07a3fb2d4b1998962fbe82c6304b09b0c",
    "operationId": "3d0d8c3d-be88-445b-9da2-40632bbde658",
    "postopenFinanceId": "tx_1791879863752_075c2def-5ff1-487e-9ccb-2192485814c7",
    "postopenBusinessSha256": "f5d476b31a22436691d0f4afc1c000131f772fe00a3c3e3f6e31fa28098d7929",
    "explicitRollbackFaultInjected": true,
    "rollbackOperationId": "4f6227bc-a012-47fe-9472-d557dc9c20c7"
  }
};
export const releaseServiceFixture=():any=>structuredClone(fixture);
