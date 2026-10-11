$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$PSNativeCommandUseErrorActionPreference = $false
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$reports = Join-Path $repoRoot 'reports'
$fixture = Join-Path $env:RUNNER_TEMP ('fo production dữ liệu ' + [guid]::NewGuid())
$packageRoot = Join-Path $fixture 'release with spaces'
$denied = Join-Path $fixture 'denied-data'
$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$aclChanged = $false
$code = 1
try {
    New-Item -ItemType Directory -Path $packageRoot, $denied -Force | Out-Null
    Copy-Item (Join-Path $repoRoot 'dist') $packageRoot -Recurse
    Copy-Item (Join-Path $repoRoot 'package.json'), (Join-Path $repoRoot 'package-lock.json') $packageRoot
    Push-Location $packageRoot
    try {
        & npm.cmd ci --omit=dev --foreground-scripts 2>&1 | Tee-Object -FilePath (Join-Path $reports 'production-install.log')
        $installCode = $LASTEXITCODE
        if ($installCode -ne 0) { throw "Production npm ci exited $installCode" }
    } finally { Pop-Location }
    & icacls.exe $denied /deny ($identity + ':(OI)(CI)(W)') | Out-Host
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the write-denied fixture' }
    $aclChanged = $true
    $foreignCwd = Join-Path $env:windir 'System32'
    & node (Join-Path $PSScriptRoot 'probe-production.mjs') $packageRoot $fixture $foreignCwd $denied (Join-Path $reports 'production.json') 2>&1 |
        Tee-Object -FilePath (Join-Path $reports 'production.log')
    $code = $LASTEXITCODE
} catch {
    Write-Host $_
    $code = 1
} finally {
    if ($aclChanged) {
        & icacls.exe $denied /remove:d $identity | Out-Host
        if ($LASTEXITCODE -ne 0) { $code = 1 }
    }
    try { Remove-Item -LiteralPath $fixture -Recurse -Force } catch { Write-Host $_; $code = 1 }
    @{ check = 'production'; exitCode = $code } | ConvertTo-Json | Set-Content (Join-Path $reports 'production-exit.json')
}
exit $code
