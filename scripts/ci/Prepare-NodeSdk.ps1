param([Parameter(Mandatory=$true)][string]$Version,[Parameter(Mandatory=$true)][string]$CommitSha)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$PSNativeCommandUseErrorActionPreference=$false
if ($CommitSha -cnotmatch '^[a-f0-9]{40}$') { throw 'SDK source identity rejected' }
New-Item -ItemType Directory -Path reports -Force | Out-Null
$native=@{}
$policyText=& node (Join-Path $PSScriptRoot 'node-sdk-policy.mjs') $Version
$native.policy=$LASTEXITCODE
if ($native.policy -ne 0) { throw 'SDK pinned policy failed' }
$policy=$policyText | ConvertFrom-Json
$root=Join-Path $env:RUNNER_TEMP ('fo-builder-node-sdk-'+[guid]::NewGuid())
New-Item -ItemType Directory -Path $root | Out-Null
$headers=Join-Path $root 'headers.tar.gz'
$library=Join-Path $root 'node.lib'
# Retry bounded transfers only for transient network failures. No npm/test retries.
# A 60s transfer timeout must leave time for the two permitted retries; a 60s
# total window exhausted by the first timeout prevented any retry (main CI38347336919).
& curl.exe --fail --location --proto '=https' --proto-redir '=https' --max-time 60 --retry 2 --retry-delay 1 --retry-max-time 180 --silent --show-error --output $headers $policy.headersUrl 2>&1 | Tee-Object reports/node-sdk-headers.log
$native.headers=$LASTEXITCODE
if ($native.headers -ne 0) { throw 'Pinned SDK headers transfer failed' }
if ((Get-Item -LiteralPath $headers).Length -gt 67108864 -or (Get-FileHash -LiteralPath $headers -Algorithm SHA256).Hash.ToLowerInvariant() -cne $policy.headersSha256) { throw 'SDK headers hash rejected' }
& curl.exe --fail --location --proto '=https' --proto-redir '=https' --max-time 60 --retry 2 --retry-delay 1 --retry-max-time 180 --silent --show-error --output $library $policy.libraryUrl 2>&1 | Tee-Object reports/node-sdk-library.log
$native.library=$LASTEXITCODE
if ($native.library -ne 0) { throw 'Pinned SDK library transfer failed' }
if ((Get-Item -LiteralPath $library).Length -gt 134217728 -or (Get-FileHash -LiteralPath $library -Algorithm SHA256).Hash.ToLowerInvariant() -cne $policy.librarySha256) { throw 'SDK library hash rejected' }
$entries=@(& tar.exe -tzf $headers)
$native.list=$LASTEXITCODE
if ($native.list -ne 0) { throw 'SDK header archive listing failed' }
$list=Join-Path $root 'header-paths.txt'
$entries | Set-Content -LiteralPath $list -Encoding utf8
& node (Join-Path $PSScriptRoot 'node-sdk-policy.mjs') $Version $list | Out-Host
$native.listPolicy=$LASTEXITCODE
if ($native.listPolicy -ne 0) { throw 'SDK header path preflight failed' }
& tar.exe -xzf $headers -C $root
$native.extract=$LASTEXITCODE
if ($native.extract -ne 0) { throw 'SDK header extraction failed' }
$sdk=Join-Path $root $policy.folder
foreach ($entry in Get-ChildItem -LiteralPath $sdk -Recurse -Force) {
    if (($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Linked SDK extraction rejected' }
}
$headerText=Get-Content -LiteralPath (Join-Path $sdk 'include/node/node_version.h') -Raw
$parts=$Version.Split('.')
foreach ($index in 0..2) {
    $name=@('MAJOR','MINOR','PATCH')[$index]
    if ($headerText -cnotmatch ('(?m)^#define NODE_'+$name+'_VERSION\s+'+$parts[$index]+'\s*$')) { throw 'SDK header runtime mismatch' }
}
$release=Join-Path $sdk 'Release'
New-Item -ItemType Directory -Path $release | Out-Null
Copy-Item -LiteralPath $library -Destination (Join-Path $release 'node.lib')
if ((Get-FileHash -LiteralPath (Join-Path $release 'node.lib') -Algorithm SHA256).Hash.ToLowerInvariant() -cne $policy.librarySha256) { throw 'Configured SDK library hash mismatch' }
# node-gyp's documented --nodedir layout uses include/node and Release/node.lib.
"npm_config_nodedir=$sdk" | Out-File -LiteralPath $env:GITHUB_ENV -Encoding utf8 -Append
@{commitSha=$CommitSha;nodeVersion=('v'+$Version);platform='win32';architecture='x64';headersSha256=$policy.headersSha256;librarySha256=$policy.librarySha256;nativeExitCodes=$native;headerVersionVerified=$true;localSdkConfigured=$true;maxTransferRetries=2;testRetries=0;builderOnly=$true;server2019Acceptance='not-run'} | ConvertTo-Json -Depth 4 | Set-Content reports/node-sdk.json -Encoding utf8
exit 0
# Disposable runner teardown owns this builder-only directory; no production
# paths are changed and no uncertain recursive cleanup or SDK packaging occurs.
