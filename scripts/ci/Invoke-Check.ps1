param(
    [Parameter(Mandatory)]
    [ValidateSet('install', 'native', 'lint', 'test', 'build')]
    [string] $Check
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
# Capture every native exit explicitly, including failures piped to Tee-Object.
$PSNativeCommandUseErrorActionPreference = $false
New-Item -ItemType Directory -Force reports | Out-Null

if ($Check -eq 'install') {
    $npmVersion = & npm.cmd --version
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    @{ npmVersion = "$npmVersion" } | ConvertTo-Json | Set-Content reports/toolchain.json
    if ("$npmVersion" -ne $env:EXPECTED_NPM) { throw 'npm differs from pinned toolchain' }
}

switch ($Check) {
    install { $program = 'npm.cmd'; $arguments = @('ci', '--foreground-scripts') }
    native { $program = 'node'; $arguments = @('scripts/ci/probe-sqlite.mjs') }
    lint { $program = 'npm.cmd'; $arguments = @('run', 'lint') }
    test {
        $program = 'npm.cmd'
        $arguments = @('test', '--', '--reporter=default', '--reporter=junit',
            '--outputFile.junit=reports/junit.xml', '--reporter=json', '--outputFile.json=reports/vitest.json')
    }
    build { $program = 'npm.cmd'; $arguments = @('run', 'build') }
}

& $program @arguments 2>&1 | Tee-Object -FilePath "reports/$Check.log"
$code = $LASTEXITCODE
@{ check = $Check; exitCode = $code } | ConvertTo-Json | Set-Content "reports/$Check-exit.json"
if ($code -ne 0) { exit $code }
