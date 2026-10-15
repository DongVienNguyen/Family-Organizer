[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$ArtifactDirectory, [Parameter(Mandatory=$true)][string]$CommitSha, [Parameter(Mandatory=$true)][string]$ReportDirectory)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$PSNativeCommandUseErrorActionPreference=$false
. (Join-Path $PSScriptRoot 'Archive.ps1')
New-Item -ItemType Directory -Path $ReportDirectory -Force | Out-Null
$fixture=Join-Path $env:RUNNER_TEMP ('fo package dữ liệu ' + [guid]::NewGuid())
$release=Join-Path $fixture 'release with spaces'
$denied=Join-Path $fixture 'denied-data'
$identity=[Security.Principal.WindowsIdentity]::GetCurrent().Name
$aclChanged=$false
$code=1
$native=@{}
$originalPath=$env:PATH
try {
    $execution=Get-Content -LiteralPath (Join-Path $ArtifactDirectory 'producer-exit.json') -Raw | ConvertFrom-Json
    if ($execution.commitSha -cne $CommitSha -or $execution.exitCode -ne 0 -or $execution.fixtureCleanup -ne $true) { throw 'Producer execution/cleanup failed' }
    foreach ($name in @('git','install','prepare','manifest')) { if ($execution.nativeExitCodes.$name -ne 0) { throw 'Producer native execution failed' } }
    $producer=Get-Content -LiteralPath (Join-Path $ArtifactDirectory 'producer-evidence.json') -Raw | ConvertFrom-Json
    if ($producer.commitSha -cne $CommitSha -or $producer.platform -cne 'win32' -or $producer.architecture -cne 'x64' -or $producer.zipSha256 -cnotmatch '^[a-f0-9]{64}$') { throw 'Producer identity rejected' }
    foreach ($name in @('install','prepare','manifest')) { if ($producer.nativeExitCodes.$name -ne 0) { throw 'Producer native command failed' } }
    $zip=Join-Path $ArtifactDirectory 'family-organizer-win-x64.zip'
    if ((Get-FileHash $zip -Algorithm SHA256).Hash.ToLowerInvariant() -cne $producer.zipSha256 -or (Get-Item -LiteralPath $zip).Length -ne $producer.zipSize) { throw 'Package ZIP checksum/size mismatch' }
    New-Item -ItemType Directory -Path $fixture | Out-Null
    Expand-VerifiedArchive $zip $release
    # Consumer has no checkout, npm install, build, source modules, NODE_PATH or global Node.
    $env:PATH=$env:windir+'\System32;'+$env:windir+';'+$env:windir+'\System32\WindowsPowerShell\v1.0'
    Remove-Item Env:NODE_PATH, Env:NODE_OPTIONS, Env:APP_CODE_ROOT -ErrorAction SilentlyContinue
    $node=Join-Path $release 'bin/node.exe'
    & $node (Join-Path $PSScriptRoot 'verify-package.mjs') $release $CommitSha $producer.appVersion (Join-Path $ReportDirectory 'package-validation.json') 2>&1 | Tee-Object -FilePath (Join-Path $ReportDirectory 'package-validation.log')
    $native.validation=$LASTEXITCODE
    if ($native.validation -ne 0) { throw 'Bundled package inventory/runtime rejected' }
    & powershell.exe -NoProfile -File (Join-Path $release 'ops/Start-App.ps1') -DataRoot (Join-Path $fixture 'launcher data') -ConfigRoot (Join-Path $fixture 'launcher config') -LogRoot (Join-Path $fixture 'launcher logs') -ValidateOnly
    $native.launchValidation=$LASTEXITCODE
    if ($native.launchValidation -ne 0) { throw 'Windows PowerShell launcher validation failed' }
    & powershell.exe -NoProfile -File (Join-Path $release 'ops/Start-App.ps1') -DataRoot (Join-Path $fixture 'launcher data') -ConfigRoot (Join-Path $fixture 'launcher config') -LogRoot (Join-Path $fixture 'launcher logs') -WhatIf
    $native.launchWhatIf=$LASTEXITCODE
    if ($native.launchWhatIf -ne 0 -or (Test-Path -LiteralPath (Join-Path $fixture 'launcher data'))) { throw 'Launcher WhatIf changed storage or failed' }
    New-Item -ItemType Directory -Path $denied | Out-Null
    & icacls.exe $denied /deny ($identity+':(OI)(CI)(W)') | Out-Host
    $native.denyAcl=$LASTEXITCODE
    if ($native.denyAcl -ne 0) { throw 'Denied-write fixture ACL failed' }
    $aclChanged=$true
    $env:TEST_COMMIT_SHA=$CommitSha
    & $node (Join-Path $PSScriptRoot 'probe-production.mjs') (Join-Path $release 'app') $fixture (Join-Path $env:windir 'System32') $denied (Join-Path $ReportDirectory 'production.json') 2>&1 | Tee-Object -FilePath (Join-Path $ReportDirectory 'production.log')
    $native.production=$LASTEXITCODE
    if ($native.production -ne 0) { throw 'Packaged compiled regressions failed' }
    & $node (Join-Path $PSScriptRoot 'probe-package-functional.mjs') (Join-Path $release 'app') $fixture (Join-Path $env:windir 'System32') (Join-Path $ReportDirectory 'package-functional.json') 2>&1 | Tee-Object -FilePath (Join-Path $ReportDirectory 'package-functional.log')
    $native.functional=$LASTEXITCODE
    if ($native.functional -ne 0) { throw 'Packaged CRUD/restart/shared snapshot regression failed' }
    & $node (Join-Path $PSScriptRoot 'probe-recovery.mjs') $release $fixture (Join-Path $ReportDirectory 'package-recovery.json') 2>&1 | Tee-Object -FilePath (Join-Path $ReportDirectory 'package-recovery.log')
    $native.recovery=$LASTEXITCODE
    if ($native.recovery -ne 0) { throw 'Compiled encrypted recovery regression failed' }
    & $node (Join-Path $PSScriptRoot 'probe-private-settings.mjs') $release $fixture (Join-Path $ReportDirectory 'package-private-settings.json') 2>&1 | Tee-Object -FilePath (Join-Path $ReportDirectory 'package-private-settings.log')
    $native.privateSettings=$LASTEXITCODE
    if ($native.privateSettings -ne 0) { throw 'Compiled private settings recovery regression failed' }
    & $node (Join-Path $PSScriptRoot 'probe-signing-key.mjs') $release $fixture (Join-Path $ReportDirectory 'package-signing-key.json') 2>&1 | Tee-Object -FilePath (Join-Path $ReportDirectory 'package-signing-key.log')
    $native.signingKey=$LASTEXITCODE
    if ($native.signingKey -ne 0) { throw 'Compiled signing key recovery regression failed' }
    & $node (Join-Path $PSScriptRoot 'probe-provider-env.mjs') $release $fixture (Join-Path $ReportDirectory 'package-provider-env.json') 2>&1 | Tee-Object -FilePath (Join-Path $ReportDirectory 'package-provider-env.log')
    $native.providerEnv=$LASTEXITCODE
    if ($native.providerEnv -ne 0) { throw 'Compiled provider env recovery regression failed' }
    & $node (Join-Path $PSScriptRoot 'probe-online-recovery.mjs') $release $fixture $denied (Join-Path $ReportDirectory 'package-online-recovery.json') 2>&1 | Tee-Object -FilePath (Join-Path $ReportDirectory 'package-online-recovery.log')
    $native.onlineRecovery=$LASTEXITCODE
    if ($native.onlineRecovery -ne 0) { throw 'Compiled online recovery regression failed' }
    & $node (Join-Path $PSScriptRoot 'probe-board-package.mjs') (Join-Path $release 'app') $fixture (Join-Path $env:windir 'System32') (Join-Path $ReportDirectory 'package-board.json') $producer.zipSha256 2>&1 | Tee-Object -FilePath (Join-Path $ReportDirectory 'package-board.log')
    $native.boards=$LASTEXITCODE
    if ($native.boards -ne 0) { throw 'Exact ZIP schema8 board/recovery regression failed' }
    $code=0
} catch { $_ | Out-String | Set-Content -LiteralPath (Join-Path $ReportDirectory 'failure.log'); Write-Host $_; $code=1 }
finally {
    if ($aclChanged) {
        & icacls.exe $denied /remove:d $identity | Out-Host
        $native.restoreAcl=$LASTEXITCODE
        if ($native.restoreAcl -ne 0) { $code=1 }
    }
    $env:PATH=$originalPath
    $cleanup=$false
    try { if (Test-Path -LiteralPath $fixture) { Remove-Item -LiteralPath $fixture -Recurse -Force }; $cleanup=!(Test-Path -LiteralPath $fixture) } catch { Write-Host $_; $code=1 }
    @{commitSha=$CommitSha;runUrl=$env:WORKFLOW_RUN_URL;exitCode=$code;nativeExitCodes=$native;fixtureCleanup=$cleanup;zipSha256=if (Test-Path -LiteralPath (Join-Path $ArtifactDirectory 'family-organizer-win-x64.zip')) {(Get-FileHash (Join-Path $ArtifactDirectory 'family-organizer-win-x64.zip') -Algorithm SHA256).Hash.ToLowerInvariant()} else {$null};sourceCheckoutPresent=(Test-Path -LiteralPath (Join-Path $env:GITHUB_WORKSPACE '.git'));consumerRebuild=$false;consumerInstall=$false} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $ReportDirectory 'package-exit.json') -Encoding utf8
}
exit $code
