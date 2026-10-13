param([Parameter(Mandatory=$true)][string]$ReportDirectory,[Parameter(Mandatory=$true)][string]$CommitSha,[Parameter(Mandatory=$true)][string]$OwnedRoot)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$PSNativeCommandUseErrorActionPreference=$false
if ($CommitSha -cnotmatch '^[a-f0-9]{40}$') { throw 'Caddy source identity rejected' }
. (Join-Path $PSScriptRoot 'Archive.ps1')
$root=$OwnedRoot
$zipSha256=$null
$zipSha512=$null
$licenseSha256=$null
$code=1
$native=@{}
try {
    $zip=Join-Path $root 'caddy.zip'
    & curl.exe --fail --location --proto '=https' --proto-redir '=https' --max-time 60 --retry 0 --silent --show-error --output $zip 'https://github.com/caddyserver/caddy/releases/download/v2.11.7/caddy_2.11.7_windows_amd64.zip'
    $native.download=$LASTEXITCODE
    if ($native.download -ne 0) { throw 'Pinned Caddy download failed' }
    if ((Get-Item -LiteralPath $zip).Length -gt 134217728 -or (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant() -cne '0a1edc0b799512051c57071ce0e798d3f2cf67dc98171366f1d2b326072e3b06' -or (Get-FileHash -LiteralPath $zip -Algorithm SHA512).Hash.ToLowerInvariant() -cne 'c308154504e53755958ffc62d8a2657ab17eefd6dd25c45dbb2c3d93d29519971f77ca652f7d0f2bcb7f980b9ba3822478865e29969d0272d7613550a43152b1') { throw 'Pinned Caddy archive bytes rejected' }
    $zipSha256=(Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant()
    $zipSha512=(Get-FileHash -LiteralPath $zip -Algorithm SHA512).Hash.ToLowerInvariant()
    $tool=Join-Path $root 'tool'
    Expand-VerifiedArchive $zip $tool
    $entries=@(Get-ChildItem -LiteralPath $tool -File | Select-Object -ExpandProperty Name | Sort-Object)
    if (($entries -join ',') -cne 'caddy.exe,LICENSE,README.md' -or @(Get-ChildItem -LiteralPath $tool -Directory).Count -ne 0) { throw 'Caddy archive inventory rejected' }
    $exe=Join-Path $tool 'caddy.exe'
    if ((Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash.ToLowerInvariant() -cne '5f93a9bd555f3aac9d33af2756ba14b3519d8cca4ffd55256bdaeab444c9db2a' -or (Get-FileHash -LiteralPath (Join-Path $tool 'LICENSE') -Algorithm SHA256).Hash.ToLowerInvariant() -cne 'cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30') { throw 'Caddy binary/license bytes rejected' }
    $licenseSha256=(Get-FileHash -LiteralPath (Join-Path $tool 'LICENSE') -Algorithm SHA256).Hash.ToLowerInvariant()
    New-Item -ItemType Directory -Path $ReportDirectory -Force | Out-Null
    & node (Join-Path $PSScriptRoot 'probe-caddy-native.mjs') $exe (Join-Path $root 'probe data with spaces') (Join-Path $ReportDirectory 'caddy-native.json') $CommitSha 2>&1 | Tee-Object -FilePath (Join-Path $ReportDirectory 'caddy-native.log')
    $native.probe=$LASTEXITCODE
    if ($native.probe -ne 0) { throw 'Caddy native synthetic probe failed' }
    $code=0
} catch { Write-Host 'CADDY_NATIVE_REJECTED';$code=1 }
finally {
    $cleanup=$false
    New-Item -ItemType Directory -Path $ReportDirectory -Force | Out-Null
    @{commitSha=$CommitSha;exitCode=$code;zipSha256=$zipSha256;zipSha512=$zipSha512;licenseSha256=$licenseSha256;nativeExitCodes=$native;fixtureCleanup=$cleanup;server2019Acceptance='not-run';systemTrustInstalled=$false} | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $ReportDirectory 'caddy-exit.json') -Encoding utf8
}
exit $code
