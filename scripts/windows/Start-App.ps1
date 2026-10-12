[CmdletBinding(SupportsShouldProcess=$true)]
param([Parameter(Mandatory=$true)][string]$DataRoot, [Parameter(Mandatory=$true)][string]$ConfigRoot, [Parameter(Mandatory=$true)][string]$LogRoot, [ValidateRange(1,65535)][int]$Port=3000, [switch]$ValidateOnly)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$PSNativeCommandUseErrorActionPreference = $false
$releaseRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
foreach ($root in @($DataRoot,$ConfigRoot,$LogRoot)) {
    if (![IO.Path]::IsPathRooted($root) -or $root -notmatch '^[A-Za-z]:[\\/]') { throw 'Storage roots must be fully qualified local Windows paths' }
    $resolved = [IO.Path]::GetFullPath($root)
    if ($resolved.TrimEnd('\') -ieq $releaseRoot -or $resolved.StartsWith($releaseRoot + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Storage must be outside release' }
}
$node = Join-Path $releaseRoot 'bin/node.exe'
$server = Join-Path $releaseRoot 'app/dist/server.cjs'
if (!(Test-Path -LiteralPath $node -PathType Leaf) -or !(Test-Path -LiteralPath $server -PathType Leaf)) { throw 'Incomplete Windows package' }
if ($ValidateOnly -or !$PSCmdlet.ShouldProcess($releaseRoot, 'Start Family Organizer')) { return }
$env:NODE_ENV='production'
$env:APP_CODE_ROOT=Join-Path $releaseRoot 'app'
$env:DATA_DIR=[IO.Path]::GetFullPath($DataRoot)
$env:CONFIG_DIR=[IO.Path]::GetFullPath($ConfigRoot)
$env:LOG_DIR=[IO.Path]::GetFullPath($LogRoot)
$env:HOST='127.0.0.1'
$env:PORT=[string]$Port
Remove-Item Env:NODE_PATH, Env:NODE_OPTIONS -ErrorAction SilentlyContinue
& $node $server
$code=$LASTEXITCODE
if ($code -ne 0) { throw "Family Organizer exited $code" }
