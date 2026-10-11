$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$PSNativeCommandUseErrorActionPreference = $false
New-Item -ItemType Directory -Force reports | Out-Null
$code = 1
$nativeAuditCode = -1
try {
    $runtimeText = & node -p 'JSON.stringify({nodeVersion:process.version,platform:process.platform,architecture:process.arch})'
    $runtimeCode = $LASTEXITCODE
    if ($runtimeCode -ne 0) { throw 'Could not read audit runtime' }
    $runtime = $runtimeText | ConvertFrom-Json
    $auditText = & npm.cmd audit --json --audit-level=low 2> reports/audit.stderr.log
    $nativeAuditCode = $LASTEXITCODE
    $auditText | Set-Content -Encoding utf8 reports/audit.json
    @{
        commitSha = $env:TEST_COMMIT_SHA
        nodeVersion = $runtime.nodeVersion
        platform = $runtime.platform
        architecture = $runtime.architecture
        lockSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath package-lock.json).Hash.ToLowerInvariant()
    } | ConvertTo-Json | Set-Content -Encoding utf8 reports/audit-context.json
    if ($nativeAuditCode -ne 0) { $code = $nativeAuditCode; throw 'Dependency audit returned a nonzero native exit' }
    $null = $auditText | ConvertFrom-Json
    $code = 0
} catch {
    Write-Host 'Dependency audit check failed; inspect the retained reports.'
} finally {
    @{ check = 'audit'; exitCode = $code; nativeAuditExitCode = $nativeAuditCode } |
        ConvertTo-Json | Set-Content -Encoding utf8 reports/audit-exit.json
}
exit $code
