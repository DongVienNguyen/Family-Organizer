# Synthetic Windows-only adversarial fixtures. Never register a service or run a hook.
param($Context,[string]$ReportDirectory)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$results=New-Object System.Collections.Generic.List[object]
$root=Join-Path $env:RUNNER_TEMP ('fo-service-security-'+[guid]::NewGuid())
New-Item -ItemType Directory -Path $root | Out-Null
function Test-Refusal {
    param([string]$Name,[scriptblock]$Action)
    $refused=$false
    try { & $Action | Out-Host } catch { $refused=$true }
    $results.Add(@{name=$Name;passed=$refused})
}
try {
    $owned=Join-Path $root 'owned'
    New-Item -ItemType Directory -Path (Join-Path $owned 'service') -Force | Out-Null
    $testContext=@{};foreach($key in $Context.Keys){$testContext[$key]=$Context[$key]}
    $testContext.instance=$owned;$testContext.id='FamilyOrganizer-Negative'+[guid]::NewGuid().ToString('N')
    $testContext.directory=Join-Path $owned 'service'
    $testContext.wrapper=Join-Path $testContext.directory ($testContext.id+'.exe')
    $testContext.xml=Join-Path $testContext.directory ($testContext.id+'.xml')
    $testContext.marker=Join-Path $testContext.directory 'installation.json'
    Copy-Item (Join-Path $Context.release 'bin/family-organizer-service.exe') $testContext.wrapper
    Copy-Item (Join-Path $Context.release 'bin/family-organizer-service.exe.config') ($testContext.wrapper+'.config')
    Invoke-ServiceNative 'security-render' $Context.node @((Join-Path $Context.release 'ops/write-service-config.mjs'),$Context.release,$owned,$testContext.id,[string]$Context.port,$testContext.xml)
    $descriptor=@{format=1;serviceId=$testContext.id;releaseRoot=$Context.release;instanceRoot=$owned;manifestHash=$Context.manifestHash;port=$Context.port;xmlSha256=(Get-FileHash $testContext.xml).Hash.ToLowerInvariant()}
    [IO.File]::WriteAllText($testContext.marker,($descriptor|ConvertTo-Json))
    # Protect synthetic metadata so a future ownership check cannot mask the content assertion.
    foreach($file in @($owned,$testContext.directory,$testContext.marker,$testContext.wrapper,$testContext.xml,($testContext.wrapper+'.config'))){
        $acl=Get-Acl $file;$acl.SetAccessRuleProtection($true,$false)
        foreach($rule in @($acl.Access)){$acl.RemoveAccessRuleSpecific($rule)}
        foreach($sid in @('S-1-5-18','S-1-5-32-544')){
            if((Get-Item $file).PSIsContainer){$rule=New-Object Security.AccessControl.FileSystemAccessRule($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow')}
            else{$rule=New-Object Security.AccessControl.FileSystemAccessRule($sid,'FullControl','Allow')}
            $acl.AddAccessRule($rule)
        }
        $acl.SetOwner((New-Object Security.Principal.SecurityIdentifier('S-1-5-32-544')));Set-Acl $file $acl
    }
    $original=Get-Content $testContext.xml -Raw
    [IO.File]::WriteAllText($testContext.xml,$original.Replace('<user>LocalService</user>','<user>LocalSystem</user>'))
    $descriptor.xmlSha256=(Get-FileHash $testContext.xml).Hash.ToLowerInvariant()
    Test-Refusal 'self-hashed-alternate-service-xml' {Assert-ServiceOwner $testContext $descriptor}
    [IO.File]::WriteAllText($testContext.xml,$original);$descriptor.xmlSha256=(Get-FileHash $testContext.xml).Hash.ToLowerInvariant()
    [IO.File]::WriteAllText(($testContext.wrapper+'.config'),'<configuration><runtime><appDomainManagerType value="SyntheticCanary"/></runtime></configuration>')
    Test-Refusal 'installed-clr-config-tampering' {Assert-ServiceOwner $testContext $descriptor}
    $canary=Join-Path $root 'preload.cjs';$marker=Join-Path $root 'preload-ran.txt'
    [IO.File]::WriteAllText($canary,'require("node:fs").writeFileSync('+($marker|ConvertTo-Json -Compress)+',"synthetic");')
    $priorOptions=$env:NODE_OPTIONS;$priorPath=$env:NODE_PATH
    try {
        $env:NODE_OPTIONS='--require="'+$canary+'"';$env:NODE_PATH=$root
        $null=Get-ServiceContext $Context.release $Context.instance $Context.id $Context.port $Context.manifestHash
        $results.Add(@{name='administrative-node-preload-not-executed';passed=!(Test-Path $marker)})
        $results.Add(@{name='administrative-node-environment-restored';passed=($env:NODE_OPTIONS -ceq ('--require="'+$canary+'"') -and $env:NODE_PATH -ceq $root)})
    } finally {$env:NODE_OPTIONS=$priorOptions;$env:NODE_PATH=$priorPath}
    $fake=Join-Path $root 'fake-release';New-Item -ItemType Directory -Path (Join-Path $fake 'bin'),(Join-Path $fake 'ops') -Force | Out-Null
    Copy-Item $Context.node (Join-Path $fake 'bin/node.exe')
    Copy-Item (Join-Path $Context.release 'ops/*') (Join-Path $fake 'ops')
    $uninstallCanary=Join-Path $root 'uninstall-canary.txt'
    [IO.File]::WriteAllText((Join-Path $fake 'ops/verify-installed-service.mjs'),'import fs from "node:fs";fs.writeFileSync('+($uninstallCanary|ConvertTo-Json -Compress)+',"synthetic");')
    $manifest=Get-Content (Join-Path $Context.release 'release-manifest.json') -Raw | ConvertFrom-Json
    foreach($entry in $manifest.files){if($entry.path -ceq 'ops/verify-installed-service.mjs'){$entry.sha256=(Get-FileHash (Join-Path $fake $entry.path)).Hash.ToLowerInvariant()}}
    [IO.File]::WriteAllText((Join-Path $fake 'release-manifest.json'),($manifest|ConvertTo-Json -Depth 20))
    $descriptor.releaseRoot=$fake;$descriptor.manifestHash=(Get-FileHash (Join-Path $fake 'release-manifest.json')).Hash.ToLowerInvariant()
    [IO.File]::WriteAllText($testContext.marker,($descriptor|ConvertTo-Json))
    & (Join-Path $env:windir 'System32/WindowsPowerShell/v1.0/powershell.exe') -NoProfile -NonInteractive -File (Join-Path $Context.release 'ops/Uninstall-Service.ps1') -InstanceRoot $owned -ServiceId $testContext.id -ValidateOnly 2>&1 | Out-Host
    $uninstallExit=$LASTEXITCODE
    $results.Add(@{name='uninstall-requires-independent-trust';passed=($uninstallExit -ne 0 -and !(Test-Path $uninstallCanary));exitCode=$uninstallExit})
    $aclRoot=Join-Path $root 'acl';New-Item -ItemType Directory -Path $aclRoot | Out-Null
    $acl=Get-Acl $aclRoot;$acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule('S-1-1-0','Modify','ContainerInherit,ObjectInherit','None','Allow')));Set-Acl $aclRoot $acl
    Set-OwnedServiceAcl $aclRoot 'TrustedInstaller' 'RX'
    $broad=@((Get-Acl $aclRoot).Access|Where-Object {$_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -eq 'S-1-1-0' -and ($_.FileSystemRights -band [Security.AccessControl.FileSystemRights]::Write)})
    $results.Add(@{name='existing-explicit-write-grant-removed';passed=($broad.Count -eq 0)})
    $outside=Join-Path $root 'outside';New-Item -ItemType Directory -Path $outside | Out-Null
    $link=Join-Path $aclRoot 'junction';New-Item -ItemType Junction -Path $link -Target $outside | Out-Null
    $before=(Get-Acl $outside).Sddl
    Test-Refusal 'descendant-junction-refused-before-acl' {Set-OwnedServiceAcl $aclRoot 'TrustedInstaller' 'RX'}
    $results.Add(@{name='junction-target-acl-unchanged';passed=((Get-Acl $outside).Sddl -ceq $before)})
    [IO.Directory]::Delete($link)
} finally {
    $results.ToArray() | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $ReportDirectory 'service-security.json') -Encoding utf8
    if(Test-Path (Join-Path $root 'acl/junction')){[IO.Directory]::Delete((Join-Path $root 'acl/junction'))}
    Remove-Item -LiteralPath $root -Recurse -Force
}
$failed=@($results|Where-Object {!$_.passed})
if($failed.Count -gt 0){throw ('Windows service security regressions: '+(($failed|ForEach-Object {$_.name}) -join ', '))}
