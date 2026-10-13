param([Parameter(Mandatory=$true)][string]$ReportDirectory,[Parameter(Mandatory=$true)][string]$CommitSha)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$PSNativeCommandUseErrorActionPreference=$false
& node (Join-Path $PSScriptRoot 'supervise-caddy-native.mjs') (Get-Process -Id $PID).Path $ReportDirectory $CommitSha
$code=$LASTEXITCODE
if ($code -ne 0) { exit $code }
exit 0
