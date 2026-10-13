// Independent existing synthetic native report schemas copied before implementation.
const fixture={
  "node-sdk.json": {
    "nodeVersion": "v24.21.0",
    "builderOnly": true,
    "commitSha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "server2019Acceptance": "not-run",
    "localSdkConfigured": true,
    "platform": "win32",
    "librarySha256": "a0a84aa03917b578d286010b7521837e9ff1136ffb2e4a406c14316c33fd06f7",
    "headersSha256": "57c6bee2e30bbbee5bd51d6cc343eb992e174b56a2a1d0eab7a7510771c20ea2",
    "headerVersionVerified": true,
    "architecture": "x64",
    "maxTransferRetries": 2,
    "testRetries": 0,
    "nativeExitCodes": {
      "list": 0,
      "listPolicy": 0,
      "headers": 0,
      "library": 0,
      "extract": 0,
      "policy": 0
    }
  },
  "caddy-native.json": {
    "commitSha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "nodeVersion": "v24.21.0",
    "platform": "win32",
    "architecture": "x64",
    "caddyVersion": "2.11.7",
    "binarySha256": "5f93a9bd555f3aac9d33af2756ba14b3519d8cca4ffd55256bdaeab444c9db2a",
    "phases": [
      {
        "name": "version",
        "exitCode": 0,
        "signal": null
      },
      {
        "name": "validate",
        "exitCode": 0,
        "signal": null
      },
      {
        "name": "tls-held-backend-status",
        "passed": true
      },
      {
        "name": "tls-private-ca-loopback-proxy-header-boundary",
        "passed": true
      },
      {
        "name": "untrusted-synthetic-ca-refused",
        "passed": true,
        "errorCode": "UNABLE_TO_GET_ISSUER_CERT_LOCALLY"
      },
      {
        "name": "owned-admin-stop",
        "exitCode": 0,
        "signal": null
      }
    ],
    "trustStoreObservation": {
      "exitCode": 0,
      "fingerprintSha1": "29167868D7C8E276E04D4573C3501E8F2B9E6EEE",
      "stores": [
        {
          "name": "Root",
          "location": "CurrentUser",
          "matchingCertificates": 0
        },
        {
          "name": "Root",
          "location": "LocalMachine",
          "matchingCertificates": 0
        }
      ]
    },
    "fixtureCleanup": true,
    "systemTrustInstalled": false,
    "backend": "synthetic-loopback-only",
    "server2019Acceptance": "not-run"
  },
  "caddy-exit.json": {
    "exitCode": 0,
    "fixtureCleanup": true,
    "zipSha512": "c308154504e53755958ffc62d8a2657ab17eefd6dd25c45dbb2c3d93d29519971f77ca652f7d0f2bcb7f980b9ba3822478865e29969d0272d7613550a43152b1",
    "systemTrustInstalled": false,
    "server2019Acceptance": "not-run",
    "nativeExitCodes": {
      "download": 0,
      "probe": 0
    },
    "licenseSha256": "cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30",
    "commitSha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "zipSha256": "0a1edc0b799512051c57071ce0e798d3f2cf67dc98171366f1d2b326072e3b06"
  },
  "release-report-extraction-native.json": {
    "commitSha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "nodeVersion": "v24.21.0",
    "platform": "win32",
    "architecture": "x64",
    "archiveCount": 7,
    "extractedFiles": 7,
    "expandedBytes": 1470,
    "positiveNativeExit": 0,
    "negativeNativeExit": 1,
    "negativeBeforeWriteEmpty": true,
    "fixtureCleanup": true,
    "scope": "synthetic-no-github-authentication",
    "publicationAllowed": false,
    "server2019Acceptance": "not-run"
  },
  "evidence.json": {
    "nodeSdk": {
      "nodeVersion": "v24.21.0",
      "builderOnly": true,
      "commitSha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "server2019Acceptance": "not-run",
      "localSdkConfigured": true,
      "platform": "win32",
      "librarySha256": "a0a84aa03917b578d286010b7521837e9ff1136ffb2e4a406c14316c33fd06f7",
      "headersSha256": "57c6bee2e30bbbee5bd51d6cc343eb992e174b56a2a1d0eab7a7510771c20ea2",
      "headerVersionVerified": true,
      "architecture": "x64",
      "maxTransferRetries": 2,
      "testRetries": 0,
      "nativeExitCodes": {
        "list": 0,
        "listPolicy": 0,
        "headers": 0,
        "library": 0,
        "extract": 0,
        "policy": 0
      }
    },
    "caddy": {
      "probe": {
        "commitSha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "nodeVersion": "v24.21.0",
        "platform": "win32",
        "architecture": "x64",
        "caddyVersion": "2.11.7",
        "binarySha256": "5f93a9bd555f3aac9d33af2756ba14b3519d8cca4ffd55256bdaeab444c9db2a",
        "phases": [
          {
            "name": "version",
            "exitCode": 0,
            "signal": null
          },
          {
            "name": "validate",
            "exitCode": 0,
            "signal": null
          },
          {
            "name": "tls-held-backend-status",
            "passed": true
          },
          {
            "name": "tls-private-ca-loopback-proxy-header-boundary",
            "passed": true
          },
          {
            "name": "untrusted-synthetic-ca-refused",
            "passed": true,
            "errorCode": "UNABLE_TO_GET_ISSUER_CERT_LOCALLY"
          },
          {
            "name": "owned-admin-stop",
            "exitCode": 0,
            "signal": null
          }
        ],
        "trustStoreObservation": {
          "exitCode": 0,
          "fingerprintSha1": "29167868D7C8E276E04D4573C3501E8F2B9E6EEE",
          "stores": [
            {
              "name": "Root",
              "location": "CurrentUser",
              "matchingCertificates": 0
            },
            {
              "name": "Root",
              "location": "LocalMachine",
              "matchingCertificates": 0
            }
          ]
        },
        "fixtureCleanup": true,
        "systemTrustInstalled": false,
        "backend": "synthetic-loopback-only",
        "server2019Acceptance": "not-run"
      },
      "exit": {
        "exitCode": 0,
        "fixtureCleanup": true,
        "zipSha512": "c308154504e53755958ffc62d8a2657ab17eefd6dd25c45dbb2c3d93d29519971f77ca652f7d0f2bcb7f980b9ba3822478865e29969d0272d7613550a43152b1",
        "systemTrustInstalled": false,
        "server2019Acceptance": "not-run",
        "nativeExitCodes": {
          "download": 0,
          "probe": 0
        },
        "licenseSha256": "cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30",
        "commitSha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "zipSha256": "0a1edc0b799512051c57071ce0e798d3f2cf67dc98171366f1d2b326072e3b06"
      }
    },
    "releaseReportExtraction": {
      "commitSha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "nodeVersion": "v24.21.0",
      "platform": "win32",
      "architecture": "x64",
      "archiveCount": 7,
      "extractedFiles": 7,
      "expandedBytes": 1470,
      "positiveNativeExit": 0,
      "negativeNativeExit": 1,
      "negativeBeforeWriteEmpty": true,
      "fixtureCleanup": true,
      "scope": "synthetic-no-github-authentication",
      "publicationAllowed": false,
      "server2019Acceptance": "not-run"
    }
  }
};
export const releaseAuxiliaryFixture=():any=>structuredClone(fixture);
