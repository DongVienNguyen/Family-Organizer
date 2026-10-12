$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$PSNativeCommandUseErrorActionPreference = $false
New-Item -ItemType Directory -Force reports | Out-Null
& node scripts/ci/write-coverage-evidence.mjs 2>&1 | Tee-Object -FilePath reports/coverage.log
$coverageCode = $LASTEXITCODE
@{ check = 'coverage'; exitCode = $coverageCode; nativeCoverageExitCode = $coverageCode } |
    ConvertTo-Json | Set-Content reports/coverage-exit.json
if ($coverageCode -ne 0) { exit $coverageCode }
