[CmdletBinding(SupportsShouldProcess=$true)]
param([Parameter(Mandatory=$true)][string]$ReleaseRoot,[Parameter(Mandatory=$true)][string]$InstanceRoot,[Parameter(Mandatory=$true)][string]$ExpectedManifestSha256,[ValidateSet('Binary','Snapshot')][string]$Mode='Binary',[string]$ServiceId='FamilyOrganizer',[ValidateRange(1,65535)][int]$Port=3000,[switch]$ValidateOnly)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
& (Join-Path $PSScriptRoot 'Update.ps1') -ReleaseRoot $ReleaseRoot -InstanceRoot $InstanceRoot -ExpectedManifestSha256 $ExpectedManifestSha256 -Operation $(if($Mode -eq 'Snapshot'){'RollbackSnapshot'}else{'RollbackBinary'}) -ServiceId $ServiceId -Port $Port -ValidateOnly:$ValidateOnly -WhatIf:$WhatIfPreference
