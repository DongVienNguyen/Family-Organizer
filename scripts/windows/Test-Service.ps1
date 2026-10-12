[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$ArtifactDirectory,[Parameter(Mandatory=$true)][string]$CommitSha,[Parameter(Mandatory=$true)][string]$ReportDirectory)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$PSNativeCommandUseErrorActionPreference=$false
. (Join-Path $PSScriptRoot 'Archive.ps1')
New-Item -ItemType Directory -Path $ReportDirectory -Force | Out-Null
$ReportDirectory=(Resolve-Path -LiteralPath $ReportDirectory).Path
$script:ServiceNativeResults=New-Object System.Collections.Generic.List[object]
$native=New-Object System.Collections.Generic.List[object]
$checks=New-Object System.Collections.Generic.List[string]
$fixture=Join-Path $env:RUNNER_TEMP ('fo-service-'+[guid]::NewGuid())
$release=Join-Path $fixture 'release dữ liệu with spaces'
$instance=Join-Path $fixture 'instance dữ liệu with spaces'
$id='FamilyOrganizer-CI'+([guid]::NewGuid().ToString('N'))
$failure=$null;$cleanup=$false;$code=1;$context=$null
function Invoke-TestNative {
    param([string]$Phase,[string]$File,[string[]]$NativeArguments)
    & $File @NativeArguments 2>&1 | Tee-Object -FilePath (Join-Path $ReportDirectory "$Phase.log") | Out-Host
    $exitCode=$LASTEXITCODE
    $native.Add(@{phase=$Phase;exitCode=$exitCode})
    if ($exitCode -ne 0) { throw "$Phase exited $exitCode" }
}
function Wait-ServiceReady {
    $deadline=[DateTime]::UtcNow.AddSeconds(40)
    do {
        try { $response=Invoke-RestMethod "http://127.0.0.1:$port/api/ready" -TimeoutSec 2; if ($response.ready -eq $true) { return } } catch { }
        Start-Sleep -Milliseconds 200
    } while ([DateTime]::UtcNow -lt $deadline)
    throw 'Windows service readiness timeout'
}
function Get-ShutdownCount {
    $total=0
    foreach ($log in Get-ChildItem -LiteralPath (Join-Path $instance 'logs') -Filter '*.out.log') { $total += [regex]::Matches((Get-Content -LiteralPath $log.FullName -Raw),'Shutdown complete').Count }
    return $total
}
function Assert-ServiceClosed {
    param([int]$PriorCount)
    $controller=Get-Service -Name $id
    $controller.WaitForStatus([ServiceProcess.ServiceControllerStatus]::Stopped,[TimeSpan]::FromSeconds(50))
    $controller.Refresh()
    if ($controller.Status -ne 'Stopped') { throw 'Service did not stop' }
    $workers=@(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -ieq $context.node })
    if ($workers.Count -ne 0) { throw 'Bundled Node worker still running' }
    $stream=[IO.File]::Open((Join-Path $instance 'data/family.db'),[IO.FileMode]::Open,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
    $stream.Dispose()
    if ((Get-ShutdownCount) -le $PriorCount) { throw 'No successful graceful shutdown proof' }
    Invoke-TestNative 'database-closed' $context.node @((Join-Path $PSScriptRoot 'probe-service.mjs'),'closed',$release,$instance,[string]$port,(Join-Path $ReportDirectory 'service-functional.json'))
}
try {
    $producer=Get-Content -LiteralPath (Join-Path $ArtifactDirectory 'producer-evidence.json') -Raw | ConvertFrom-Json
    $execution=Get-Content -LiteralPath (Join-Path $ArtifactDirectory 'producer-exit.json') -Raw | ConvertFrom-Json
    if ($producer.commitSha -cne $CommitSha -or $execution.commitSha -cne $CommitSha -or $execution.exitCode -ne 0 -or !$execution.fixtureCleanup) { throw 'Service package source/producer proof rejected' }
    foreach ($phase in @('git','install','prepare','manifest')) { if ($execution.nativeExitCodes.$phase -ne 0) { throw 'Producer native check failed' } }
    $zip=Join-Path $ArtifactDirectory 'family-organizer-win-x64.zip'
    if ((Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant() -cne $producer.zipSha256) { throw 'Service ZIP hash mismatch' }
    Expand-VerifiedArchive $zip $release
    $manifestHash=(Get-FileHash -LiteralPath (Join-Path $release 'release-manifest.json') -Algorithm SHA256).Hash.ToLowerInvariant()
    . (Join-Path $release 'ops/ServiceCommon.ps1')
    $listener=New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback,0)
    $listener.Start();$port=$listener.LocalEndpoint.Port;$listener.Stop()
    $context=Get-ServiceContext $release $instance $id $port $manifestHash
    if ($context.commitSha -cne $CommitSha) { throw 'Service manifest source mismatch' }
    . (Join-Path $PSScriptRoot 'Test-ServiceSecurity.ps1') -Context $context -ReportDirectory $ReportDirectory
    $checks.Add('synthetic-service-security-refusals')
    $env:PATH=Join-Path $env:windir 'System32'
    Remove-Item Env:NODE_PATH,Env:NODE_OPTIONS -ErrorAction SilentlyContinue
    $powershell=Join-Path $env:windir 'System32/WindowsPowerShell/v1.0/powershell.exe'
    $install=Join-Path $release 'ops/Install-Service.ps1'
    $uninstall=Join-Path $release 'ops/Uninstall-Service.ps1'
    $installArgs=@('-NoProfile','-File',$install,'-ReleaseRoot',$release,'-InstanceRoot',$instance,'-ServiceId',$id,'-Port',[string]$port,'-ExpectedManifestSha256',$manifestHash)
    Invoke-TestNative 'validate-only' $powershell ($installArgs+@('-ValidateOnly'))
    Invoke-TestNative 'what-if' $powershell ($installArgs+@('-WhatIf'))
    if ((Test-Path -LiteralPath $instance) -or (Get-Service -Name $id -ErrorAction SilentlyContinue)) { throw 'Validation changed service/storage' }
    $checks.Add('validate-only-whatif-no-mutation')
    Invoke-TestNative 'install' $powershell $installArgs
    Invoke-TestNative 'version' $context.wrapper @('version')
    $version=[Diagnostics.FileVersionInfo]::GetVersionInfo($context.wrapper).FileVersion
    if ($version -notmatch '^2\.12\.0') { throw 'Unexpected wrapper version' }
    Invoke-TestNative 'seed' $context.node @((Join-Path $PSScriptRoot 'probe-service.mjs'),'seed',$release,$instance,[string]$port,(Join-Path $ReportDirectory 'service-functional.json'))
    $dbSourceHash=(Get-FileHash -LiteralPath (Join-Path $instance 'data/db.json') -Algorithm SHA256).Hash
    Invoke-TestNative 'install-again' $powershell $installArgs
    if ((Get-FileHash -LiteralPath (Join-Path $instance 'data/db.json') -Algorithm SHA256).Hash -cne $dbSourceHash) { throw 'Idempotent install changed existing data' }
    $service=Get-CimInstance Win32_Service -Filter "Name='$id'"
    $registry=Get-ItemProperty ("HKLM:\SYSTEM\CurrentControlSet\Services\"+$id)
    if ($service.StartName -ine 'NT AUTHORITY\LocalService' -or $service.StartMode -ne 'Auto' -or $registry.DelayedAutostart -ne 1 -or $registry.ServiceSidType -ne 1) { throw 'Service account/boot/SID configuration rejected' }
    $sid=(New-Object Security.Principal.NTAccount('NT SERVICE',$id)).Translate([Security.Principal.SecurityIdentifier]).Value
    foreach ($root in @($release,$instance,(Join-Path $instance 'data'),(Join-Path $instance 'config'),(Join-Path $instance 'logs'))) {
        $acl=Get-Acl -LiteralPath $root
        $rules=@($acl.Access | Where-Object { $_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -eq $sid -and $_.AccessControlType -eq 'Allow' })
        if ($rules.Count -eq 0) { throw 'Per-service SID ACL missing' }
        foreach ($rule in $acl.Access) {
            $ruleSid=$rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
            if ($rule.AccessControlType -eq 'Allow' -and $ruleSid -in @('S-1-1-0','S-1-5-11','S-1-5-32-545') -and ($rule.FileSystemRights -band [Security.AccessControl.FileSystemRights]::Write)) { throw 'Broad write grant on service root' }
        }
    }
    $checks.Add('owned-idempotent-install-data-preserved');$checks.Add('localservice-per-service-sid-acl');$checks.Add('automatic-delayed-start-bounded-logs')
    Invoke-TestNative 'start' $context.wrapper @('start');Wait-ServiceReady
    $listeners=@(Get-NetTCPConnection -LocalPort $port -State Listen)
    if ($listeners.Count -ne 1 -or $listeners[0].LocalAddress -cne '127.0.0.1') { throw 'Service listener is not loopback only' }
    Invoke-TestNative 'first-functional' $context.node @((Join-Path $PSScriptRoot 'probe-service.mjs'),'first',$release,$instance,[string]$port,(Join-Path $ReportDirectory 'service-functional.json'))
    Invoke-TestNative 'credential-active' $context.node @((Join-Path $PSScriptRoot 'probe-credential-service.mjs'),'active',$release,$instance,$id,[string]$port,$manifestHash,(Join-Path $ReportDirectory 'service-credentials.json'))
    Invoke-TestNative 'recovery-active' $context.node @((Join-Path $PSScriptRoot 'probe-recovery-service.mjs'),'active',$release,$instance,$id,[string]$port,$manifestHash,(Join-Path $ReportDirectory 'service-recovery.json'))
    $prior=Get-ShutdownCount
    Invoke-TestNative 'stop' $context.wrapper @('stop');Assert-ServiceClosed $prior;$checks.Add('start-stop-graceful-closed-handles')
    Invoke-TestNative 'credential-stopped' $context.node @((Join-Path $PSScriptRoot 'probe-credential-service.mjs'),'stopped',$release,$instance,$id,[string]$port,$manifestHash,(Join-Path $ReportDirectory 'service-credentials.json'))
    $checks.Add('owned-offline-credential-reentry')
    Invoke-TestNative 'recovery-stopped' $context.node @((Join-Path $PSScriptRoot 'probe-recovery-service.mjs'),'stopped',$release,$instance,$id,[string]$port,$manifestHash,(Join-Path $ReportDirectory 'service-recovery.json'))
    $checks.Add('owned-encrypted-recovery')
    Invoke-TestNative 'restart-start' $context.wrapper @('start');Wait-ServiceReady
    Invoke-TestNative 'restarted-functional' $context.node @((Join-Path $PSScriptRoot 'probe-service.mjs'),'restarted',$release,$instance,[string]$port,(Join-Path $ReportDirectory 'service-functional.json'))
    $beforeRestart=@(Get-CimInstance Win32_Process | Where-Object {$_.ExecutablePath -ieq $context.node})
    if($beforeRestart.Count -ne 1){throw 'Pre-restart owned worker missing'}
    $prior=Get-ShutdownCount
    Invoke-TestNative 'restart' $context.wrapper @('restart');Wait-ServiceReady
    $afterRestart=@(Get-CimInstance Win32_Process | Where-Object {$_.ExecutablePath -ieq $context.node})
    if($afterRestart.Count -ne 1 -or $afterRestart[0].ProcessId -eq $beforeRestart[0].ProcessId -or (Get-ShutdownCount) -le $prior){throw 'Restart lacks worker replacement/graceful shutdown proof'}
    Invoke-TestNative 'restart-graceful-functional' $context.node @((Join-Path $PSScriptRoot 'probe-service.mjs'),'restarted',$release,$instance,[string]$port,(Join-Path $ReportDirectory 'service-functional.json'))
    $checks.Add('restart-graceful-worker-replacement-persistence')
    $service=Get-CimInstance Win32_Service -Filter "Name='$id'"
    $workers=@(Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq $service.ProcessId -and $_.ExecutablePath -ieq $context.node })
    if ($workers.Count -ne 1) { throw 'Owned service Node process missing' }
    $owner=Invoke-CimMethod -InputObject $workers[0] -MethodName GetOwner
    if ($owner.Domain -ine 'NT AUTHORITY' -or $owner.User -ine 'LOCAL SERVICE') { throw 'Node worker has unexpected account' }
    $oldWorker=$workers[0].ProcessId
    Stop-Process -Id $oldWorker -Force
    Wait-ServiceReady
    $workers=@(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -ieq $context.node })
    if ($workers.Count -ne 1 -or $workers[0].ProcessId -eq $oldWorker) { throw 'SCM recovery did not replace failed worker' }
    Invoke-TestNative 'recovered-functional' $context.node @((Join-Path $PSScriptRoot 'probe-service.mjs'),'recovered',$release,$instance,[string]$port,(Join-Path $ReportDirectory 'service-functional.json'))
    $checks.Add('restart-crash-recovery-persistence')
    $prior=Get-ShutdownCount
    Invoke-TestNative 'final-stop' $context.wrapper @('stop');Assert-ServiceClosed $prior
    Invoke-TestNative 'scheduled-configure' $context.node @((Join-Path $PSScriptRoot 'probe-scheduled-service.mjs'),'configure',$release,$instance,$id,[string]$port,$manifestHash,(Join-Path $ReportDirectory 'service-scheduled-backup.json'))
    Invoke-TestNative 'scheduled-start' $context.wrapper @('start');Wait-ServiceReady
    Invoke-TestNative 'scheduled-active' $context.node @((Join-Path $PSScriptRoot 'probe-scheduled-service.mjs'),'active',$release,$instance,$id,[string]$port,$manifestHash,(Join-Path $ReportDirectory 'service-scheduled-backup.json'))
    $prior=Get-ShutdownCount
    Invoke-TestNative 'scheduled-stop' $context.wrapper @('stop');Assert-ServiceClosed $prior
    Invoke-TestNative 'scheduled-finalize' $context.node @((Join-Path $PSScriptRoot 'probe-scheduled-service.mjs'),'finalize',$release,$instance,$id,[string]$port,$manifestHash,(Join-Path $ReportDirectory 'service-scheduled-backup.json'))
    $checks.Add('owned-localservice-scheduled-encrypted-backup')
    $uninstallArgs=@('-NoProfile','-File',$uninstall,'-ReleaseRoot',$release,'-ExpectedManifestSha256',$manifestHash,'-InstanceRoot',$instance,'-ServiceId',$id)
    Invoke-TestNative 'uninstall' $powershell $uninstallArgs
    Invoke-TestNative 'uninstall-again' $powershell $uninstallArgs
    if ((Get-Service -Name $id -ErrorAction SilentlyContinue) -or !(Test-Path -LiteralPath (Join-Path $instance 'data/family.db'))) { throw 'Uninstall ownership/data retention failed' }
    $checks.Add('owned-uninstall-idempotent-data-retained')
    $code=0
} catch { $failure=$_; $code=1 }
finally {
    try {
        if (Get-Service -Name $id -ErrorAction SilentlyContinue) {
            if (!$context) { throw 'Cannot prove failed fixture service ownership' }
            $cleanupArgs=@('-NoProfile','-File',(Join-Path $release 'ops/Uninstall-Service.ps1'),'-ReleaseRoot',$release,'-ExpectedManifestSha256',$manifestHash,'-InstanceRoot',$instance,'-ServiceId',$id)
            Invoke-TestNative 'cleanup-service' (Join-Path $env:windir 'System32/WindowsPowerShell/v1.0/powershell.exe') $cleanupArgs
        }
    } catch { if (!$failure) { $failure=$_ }; $code=1 }
    # Preserve logs/metadata even when owned uninstallation fails; never delete a
    # fixture whose service remains registered. These files contain no credentials.
    try {
        $serviceLogs=Join-Path $instance 'logs'
        if(Test-Path -LiteralPath $serviceLogs){
            $logsTarget=Join-Path $ReportDirectory 'service-logs'
            New-Item -ItemType Directory -Path $logsTarget -Force | Out-Null
            foreach($log in Get-ChildItem -LiteralPath $serviceLogs -File -Force){
                Assert-NoServiceReparse $log.FullName
                Copy-Item -LiteralPath $log.FullName -Destination $logsTarget
            }
        }
        if($context){
            foreach($file in @($context.marker,$context.xml,($context.wrapper+'.config'))){
                if(Test-Path -LiteralPath $file){Assert-NoServiceReparse $file;Copy-Item -LiteralPath $file -Destination $ReportDirectory}
            }
        }
    } catch { if (!$failure) { $failure=$_ }; $code=1 }
    try {
        if (Get-Service -Name $id -ErrorAction SilentlyContinue) { throw 'Fixture service remains installed' }
        if (Test-Path -LiteralPath $fixture) { Remove-Item -LiteralPath $fixture -Recurse -Force }
        $cleanup=!(Test-Path -LiteralPath $fixture)
    } catch { if (!$failure) { $failure=$_ }; $code=1 }
    @{commitSha=$CommitSha;runUrl=$env:WORKFLOW_RUN_URL;exitCode=$code;failure=if ($failure) {$failure.ToString()} else {$null};nativeExitCodes=$native.ToArray();preflightNativeExitCodes=$script:ServiceNativeResults.ToArray();checks=$checks.ToArray();serviceId=$id;frameworkRelease=if ($context) {$context.frameworkRelease} else {$null};wrapperVersion=if ($context) {'2.12.0'} else {$null};fixtureCleanup=$cleanup;serviceRemoved=!(Get-Service -Name $id -ErrorAction SilentlyContinue);sourceCheckoutPresent=(Test-Path -LiteralPath (Join-Path $env:GITHUB_WORKSPACE '.git'));consumerRebuild=$false;consumerInstall=$false;zipSha256=if (Test-Path -LiteralPath (Join-Path $ArtifactDirectory 'family-organizer-win-x64.zip')) {(Get-FileHash -LiteralPath (Join-Path $ArtifactDirectory 'family-organizer-win-x64.zip') -Algorithm SHA256).Hash.ToLowerInvariant()} else {$null};server2019Acceptance='not-run';actualReboot='not-run'} | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $ReportDirectory 'service-exit.json') -Encoding utf8
}
if ($failure) { throw $failure }
if ($code -ne 0 -or !$cleanup) { throw 'Windows service fixture did not complete cleanly' }
