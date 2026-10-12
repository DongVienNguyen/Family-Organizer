[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$CommitSha, [Parameter(Mandatory=$true)][string]$OutputDirectory)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$PSNativeCommandUseErrorActionPreference=$false
. (Join-Path $PSScriptRoot 'Archive.ps1')
$repoRoot=(Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$OutputDirectory=(Resolve-Path -LiteralPath $OutputDirectory).Path
$native=@{git=$null;install=$null;prepare=$null;manifest=$null}
$failure=$null
$cleanup=$false
$code=1
$workspace=Join-Path $env:RUNNER_TEMP ('fo-package-build-' + [guid]::NewGuid())
$root=Join-Path $workspace 'release'
try {
    $actualSha=& git -C $repoRoot rev-parse HEAD
    $native.git=$LASTEXITCODE
    if ($native.git -ne 0 -or $actualSha.Trim() -cne $CommitSha) { throw 'Package source SHA mismatch' }
    New-Item -ItemType Directory -Path (Join-Path $root 'app'), (Join-Path $root 'bin'), (Join-Path $root 'licenses') -Force | Out-Null
    $nodeZip=Join-Path $workspace 'node.zip'
    Invoke-WebRequest 'https://nodejs.org/dist/v24.21.0/node-v24.21.0-win-x64.zip' -OutFile $nodeZip
    if ((Get-FileHash $nodeZip -Algorithm SHA256).Hash.ToLowerInvariant() -cne '158f7685b44de51f6c0df1d153526cbcd3e1bc739a8dfc607721cef75de9e541') { throw 'Official Node archive checksum mismatch' }
    $nodeFiles=Join-Path $workspace 'official-node'
    Expand-VerifiedArchive $nodeZip $nodeFiles
    Copy-Item -LiteralPath (Join-Path $nodeFiles 'node-v24.21.0-win-x64/node.exe') -Destination (Join-Path $root 'bin/node.exe')
    Copy-Item -LiteralPath (Join-Path $nodeFiles 'node-v24.21.0-win-x64/LICENSE') -Destination (Join-Path $root 'licenses/node-LICENSE.txt')
    Copy-Item -LiteralPath (Join-Path $repoRoot 'package.json'), (Join-Path $repoRoot 'package-lock.json') -Destination (Join-Path $root 'app')
    Push-Location (Join-Path $root 'app')
    try {
        & npm.cmd ci --omit=dev --foreground-scripts 2>&1 | Tee-Object -FilePath (Join-Path $OutputDirectory 'production-install.log')
        $installCode=$LASTEXITCODE
        $native.install=$installCode
        if ($installCode -ne 0) { throw "Windows production install exited $installCode" }
    } finally { Pop-Location }
    $node=Join-Path $root 'bin/node.exe'
    & $node (Join-Path $PSScriptRoot 'prepare-package.mjs') $repoRoot $root
    $prepareCode=$LASTEXITCODE
    $native.prepare=$prepareCode
    if ($prepareCode -ne 0) { throw "Package preparation exited $prepareCode" }
    & $node (Join-Path $PSScriptRoot 'write-manifest.mjs') $root $CommitSha 2>&1 | Tee-Object -FilePath (Join-Path $OutputDirectory 'manifest-validation.log')
    $manifestCode=$LASTEXITCODE
    $native.manifest=$manifestCode
    if ($manifestCode -ne 0) { throw "Package manifest validation exited $manifestCode" }
    Copy-Item -LiteralPath (Join-Path $root 'release-manifest.json') -Destination $OutputDirectory
    $zipPath=Join-Path $OutputDirectory 'family-organizer-win-x64.zip'
    $zip=[IO.Compression.ZipFile]::Open($zipPath,[IO.Compression.ZipArchiveMode]::Create)
    try {
        foreach ($file in Get-ChildItem -LiteralPath $root -Recurse -File) {
            $relative=$file.FullName.Substring($root.Length + 1).Replace('\','/')
            [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip,$file.FullName,$relative,[IO.Compression.CompressionLevel]::Optimal) | Out-Null
        }
    } finally { $zip.Dispose() }
    $manifest=Get-Content -LiteralPath (Join-Path $root 'release-manifest.json') -Raw | ConvertFrom-Json
    @{ commitSha=$CommitSha; appVersion=$manifest.appVersion; platform='win32'; architecture='x64'; zipSha256=(Get-FileHash $zipPath -Algorithm SHA256).Hash.ToLowerInvariant(); zipSize=(Get-Item $zipPath).Length; runUrl=$env:WORKFLOW_RUN_URL; nativeExitCodes=@{install=$installCode;prepare=$prepareCode;manifest=$manifestCode} } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $OutputDirectory 'producer-evidence.json') -Encoding utf8
    $code=0
} catch { $failure=$_; $code=1 }
finally {
    try { if (Test-Path -LiteralPath $workspace) { Remove-Item -LiteralPath $workspace -Recurse -Force }; $cleanup=!(Test-Path -LiteralPath $workspace) }
    catch { if (!$failure) { $failure=$_ }; $code=1 }
    @{commitSha=$CommitSha;runUrl=$env:WORKFLOW_RUN_URL;exitCode=$code;nativeExitCodes=$native;fixtureCleanup=$cleanup;failure=if ($failure) {$failure.ToString()} else {$null}} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $OutputDirectory 'producer-exit.json') -Encoding utf8
}
if ($failure) { throw $failure }
if ($code -ne 0 -or !$cleanup) { throw 'Package producer did not complete cleanly' }
