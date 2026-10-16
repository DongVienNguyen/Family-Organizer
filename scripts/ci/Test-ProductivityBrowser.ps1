param([ValidateSet('chromium', 'firefox', 'webkit')][string]$Project)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$PSNativeCommandUseErrorActionPreference = $false
$reportRoot = if ($Project) { Join-Path 'reports/productivity-shards' "$Project/reports" } else { 'reports' }
New-Item -ItemType Directory -Force $reportRoot | Out-Null
$installArgs = @('exec', '--', 'playwright', 'install')
if ($Project) { $installArgs += $Project } else { $installArgs += @('chromium', 'firefox', 'webkit') }
& npm.cmd @installArgs 2>&1 | Tee-Object -FilePath (Join-Path $reportRoot 'browsers-install.log')
$installCode = $LASTEXITCODE
@{ check = 'browsers-install'; exitCode = $installCode } | ConvertTo-Json | Set-Content (Join-Path $reportRoot 'browsers-install-exit.json')
if ($installCode -ne 0) {
    @{ check = 'browser'; exitCode = $installCode } | ConvertTo-Json | Set-Content (Join-Path $reportRoot 'browser-exit.json')
    exit $installCode
}
if ($Project) {
    foreach ($name in @('install-exit.json', 'native-exit.json', 'build-exit.json', 'native.json')) {
        Copy-Item -LiteralPath (Join-Path 'reports' $name) -Destination (Join-Path $reportRoot $name)
    }
}
$browserArgs = @('scripts/ci/run-productivity-browser.mjs')
if ($Project) { $browserArgs += @('--project', $Project) }
& node @browserArgs 2>&1 | Tee-Object -FilePath (Join-Path $reportRoot 'productivity-browser-native.log')
$browserCode = $LASTEXITCODE
@{ check = 'browser'; exitCode = $browserCode } | ConvertTo-Json | Set-Content (Join-Path $reportRoot 'browser-exit.json')
if ($browserCode -ne 0) { exit $browserCode }
exit 0
