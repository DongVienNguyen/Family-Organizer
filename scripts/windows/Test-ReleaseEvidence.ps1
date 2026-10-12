[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$EvidenceFile,[string]$AcceptanceFile)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$PSNativeCommandUseErrorActionPreference=$false
# Local verifier only: the authenticated collector, not an uploaded JSON, establishes provenance.
$arguments=@((Join-Path $PSScriptRoot 'test-release-evidence.mjs'),$EvidenceFile)
if ($AcceptanceFile) { $arguments+=$AcceptanceFile }
& node @arguments
$code=$LASTEXITCODE
if ($code -ne 0) { exit $code }
