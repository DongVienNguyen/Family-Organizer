$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$PSNativeCommandUseErrorActionPreference = $false
New-Item -ItemType Directory -Force reports | Out-Null

& npm.cmd exec -- playwright install chromium firefox webkit 2>&1 |
    Tee-Object -FilePath reports/browsers-install.log
$installCode = $LASTEXITCODE
@{ check = 'browsers-install'; exitCode = $installCode } |
    ConvertTo-Json | Set-Content reports/browsers-install-exit.json
if ($installCode -ne 0) {
    @{ check = 'browser'; exitCode = $installCode } | ConvertTo-Json | Set-Content reports/browser-exit.json
    exit $installCode
}

& node scripts/ci/run-productivity-browser.mjs 2>&1 | Tee-Object -FilePath reports/productivity-browser-native.log
$browserCode = $LASTEXITCODE
@{ check = 'browser'; exitCode = $browserCode } |
    ConvertTo-Json | Set-Content reports/browser-exit.json
if ($browserCode -ne 0) { exit $browserCode }
