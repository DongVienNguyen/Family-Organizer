# Loaded only by the authenticated owned Update/Rollback entry points.
function Invoke-OwnedUpdateNode {
    param($Tool,[string]$Phase,[string]$Script,[string[]]$Arguments,[object]$InputPacket)
    $process=New-Object Diagnostics.Process
    $started=$false;$bytes=$null
    try{
        $info=New-Object Diagnostics.ProcessStartInfo
        $info.FileName=$Tool.node
        $info.Arguments='"'+$Script+'"'+(($Arguments | ForEach-Object {' "'+$_+'"'}) -join '')
        $info.WorkingDirectory=Join-Path $Tool.release 'app'
        $info.UseShellExecute=$false;$info.RedirectStandardInput=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
        $info.EnvironmentVariables.Remove('NODE_OPTIONS');$info.EnvironmentVariables.Remove('NODE_PATH')
        $info.EnvironmentVariables['NODE_ENV']='production';$info.EnvironmentVariables['APP_CODE_ROOT']=Join-Path $Tool.release 'app'
        $info.EnvironmentVariables['DATA_DIR']=Join-Path $Tool.instance 'data';$info.EnvironmentVariables['CONFIG_DIR']=Join-Path $Tool.instance 'config';$info.EnvironmentVariables['LOG_DIR']=Join-Path $Tool.instance 'logs'
        $process.StartInfo=$info;if(!$process.Start()){throw 'UPDATE_NATIVE_FAILED'};$started=$true
        $stdout=$process.StandardOutput.ReadToEndAsync();$stderr=$process.StandardError.ReadToEndAsync()
        if($null -ne $InputPacket){$bytes=[Text.Encoding]::UTF8.GetBytes(($InputPacket | ConvertTo-Json -Depth 12 -Compress));$process.StandardInput.BaseStream.Write($bytes,0,$bytes.Length)}
        $process.StandardInput.Close()
        if(!$process.WaitForExit(30000)){$process.Kill();$process.WaitForExit();throw 'UPDATE_NATIVE_TIMEOUT'}
        $code=$process.ExitCode;$script:ServiceNativeResults.Add(@{phase=$Phase;exitCode=$code})
        if($code -ne 0){throw ('UPDATE_NATIVE_FAILED ('+$Phase+';exit='+$code+')')}
        if($stdout.Result.Length -gt 262144){throw 'UPDATE_NATIVE_OUTPUT_LIMIT'}
        return ($stdout.Result.Trim() | ConvertFrom-Json)
    }finally{try{if($started -and !$process.HasExited){$process.Kill();$process.WaitForExit()}}finally{$process.Dispose();if($bytes){[Array]::Clear($bytes,0,$bytes.Length)}}}
}
function Invoke-UpdateJournal {
    param($Tool,[string]$Action,[object]$Packet,[string]$Expected)
    $journalArguments=@($Tool.instance,$Action);if($Action -eq 'transition'){$journalArguments+=@($Expected)}
    $value=Invoke-OwnedUpdateNode $Tool ('update-journal-'+$Action) (Join-Path $Tool.release 'ops/update-journal.mjs') $journalArguments $Packet
    $file=Join-Path $Tool.instance 'service/update-journal.json'
    if($Action -ne 'read'){Set-OwnedServiceAcl $file '' 'RX'}
    Assert-ServiceMetadataAcl $file
    return $value
}
function Set-UpdatePhase {
    param($Tool,$State,[string]$Phase,$Snapshot)
    $event=@{phase=$Phase};if($Phase -eq 'snapshot'){$event.snapshot=$Snapshot}
    return (Invoke-UpdateJournal $Tool 'transition' $event $State.sha256)
}
function Write-UpdateDurable {
    param([string]$File,[byte[]]$Bytes,[IO.FileMode]$Mode)
    $stream=New-Object IO.FileStream($File,$Mode,[IO.FileAccess]::Write,[IO.FileShare]::None,4096,[IO.FileOptions]::WriteThrough)
    try{$stream.Write($Bytes,0,$Bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
}
function Publish-UpdateControl {
    param($Context,[string]$OperationId,[ValidateSet('held','approve')][string]$Phase)
    $file=Join-Path $Context.instance 'config/update-control.json';Assert-NoServiceReparse $file
    if(Test-Path -LiteralPath $file){Assert-BackupSecretAcl $file $Context.id}
    $stage=$file+'.stage-'+[guid]::NewGuid().ToString('N');$previous=$stage+'.old'
    $bytes=[Text.Encoding]::UTF8.GetBytes((@{format=1;operationId=$OperationId;manifestSha256=$Context.manifestHash;phase=$Phase} | ConvertTo-Json -Compress))
    try{
        Write-UpdateDurable $stage $bytes ([IO.FileMode]::CreateNew);Set-OwnedServiceAcl $stage $Context.id 'R'
        if(Test-Path -LiteralPath $file){[IO.File]::Replace($stage,$file,$previous)}else{[IO.File]::Move($stage,$file)}
        Assert-BackupSecretAcl $file $Context.id
    }finally{[Array]::Clear($bytes,0,$bytes.Length);foreach($temporary in @($stage,$previous)){if(Test-Path -LiteralPath $temporary){Remove-Item -LiteralPath $temporary -Force}}}
}
function Assert-UpdateHeldControl {
    param($Context,[string]$OperationId)
    $file=Join-Path $Context.instance 'config/update-control.json';Assert-BackupSecretAcl $file $Context.id
    $control=Get-Content -LiteralPath $file -Raw -Encoding UTF8 | ConvertFrom-Json
    if(@($control.PSObject.Properties.Name).Count -ne 4 -or $control.format -ne 1 -or $control.operationId -cne $OperationId -or $control.manifestSha256 -cne $Context.manifestHash -or $control.phase -cne 'held'){throw 'UPDATE_WRITES_MAY_HAVE_OPENED'}
}
function Stop-OwnedUpdateService {
    param($Context)
    $service=Get-Service -Name $Context.id -ErrorAction Stop
    if($service.Status -ne 'Stopped'){
        Invoke-ServiceNative 'update-stop' $Context.wrapper @('stop')
        $service.WaitForStatus([ServiceProcess.ServiceControllerStatus]::Stopped,[TimeSpan]::FromSeconds(50));$service.Refresh()
        if($service.Status -ne 'Stopped'){throw 'UPDATE_STOP_FAILED'}
    }
    $database=Join-Path $Context.instance 'data/family.db';Assert-NoServiceReparse $database
    $closed=[IO.File]::Open($database,[IO.FileMode]::Open,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None);$closed.Dispose()
}
function Inspect-OwnedUpdateStorage {
    param($Tool,[string]$OperationId,$Schema,[string]$ManifestSha256)
    return (Invoke-OwnedUpdateNode $Tool 'update-inspect' (Join-Path $Tool.release 'app/dist/operator.cjs') @('--inspect-update') @{operationId=$OperationId;schema=$Schema;manifestSha256=$ManifestSha256})
}
function Switch-OwnedUpdateRelease {
    param($Context,$Guard)
    if((Get-Service -Name $Context.id -ErrorAction Stop).Status -ne 'Stopped'){throw 'UPDATE_SWITCH_REQUIRES_STOPPED'}
    # Both complete manifests were authenticated by the caller. Keep both roots.
    Set-OwnedServiceAcl $Context.release $Context.id 'RX';Assert-RecoveryCopyAncestors $Context.release
    $stage=$Context.xml+'.stage-'+[guid]::NewGuid().ToString('N');$previous=$stage+'.old'
    try{
        Invoke-ServiceNative 'update-render' $Context.node @((Join-Path $Context.release 'ops/write-service-config.mjs'),$Context.release,$Context.instance,$Context.id,[string]$Context.port,$stage)
        Set-OwnedServiceAcl $stage '' 'RX';[IO.File]::Replace($stage,$Context.xml,$previous)
        $descriptor=@{format=1;serviceId=$Context.id;releaseRoot=$Context.release;instanceRoot=$Context.instance;manifestHash=$Context.manifestHash;commitSha=$Context.commitSha;port=$Context.port;xmlSha256=(Get-ServiceHash $Context.xml)}
        $bytes=[Text.Encoding]::UTF8.GetBytes(($descriptor | ConvertTo-Json -Depth 5 -Compress))
        # The existing guard owns this descriptor. A partial interrupted write is
        # explicitly unusable; journal evidence and both binaries are retained.
        try{$Guard.Position=0;$Guard.SetLength(0);$Guard.Write($bytes,0,$bytes.Length);$Guard.Flush($true)}finally{[Array]::Clear($bytes,0,$bytes.Length)}
        Assert-ServiceOwner $Context (Get-Content -LiteralPath $Context.marker -Raw -Encoding UTF8 | ConvertFrom-Json)
    }finally{foreach($file in @($stage,$previous)){if(Test-Path -LiteralPath $file){Remove-Item -LiteralPath $file -Force}}}
}
function Wait-OwnedUpdateHttp {
    param($Context,[ValidateSet('held','ready')][string]$Expected)
    $deadline=[DateTime]::UtcNow.AddSeconds(15)
    while([DateTime]::UtcNow -lt $deadline){
        try{
            $health=Invoke-RestMethod -Uri ('http://127.0.0.1:'+$Context.port+'/api/health') -TimeoutSec 2
            if($health.ok -ne $true -or $health.version -cne (Get-Content (Join-Path $Context.release 'app/package.json') -Raw | ConvertFrom-Json).version){throw 'UPDATE_HEALTH_FAILED'}
            if($Expected -eq 'held'){
                try{$response=Invoke-WebRequest -UseBasicParsing -Uri ('http://127.0.0.1:'+$Context.port+'/api/ready') -TimeoutSec 2;throw 'UPDATE_EARLY_READY'}
                catch{if($_.Exception -isnot [Net.WebException] -or !$_.Exception.Response -or [int]$_.Exception.Response.StatusCode -ne 503){throw 'UPDATE_EARLY_READY'}}
            }else{$response=Invoke-RestMethod -Uri ('http://127.0.0.1:'+$Context.port+'/api/ready') -TimeoutSec 2;if($response.ready -ne $true -or $response.phase -cne 'ready'){throw 'UPDATE_READY_FAILED'}}
            return
        }catch{if($_.Exception.Message -eq 'UPDATE_EARLY_READY'){throw};Start-Sleep -Milliseconds 100}
    }
    throw 'UPDATE_HEALTH_FAILED'
}
function Invoke-OwnedUpdateRecovery {
    param($Tool,[ValidateSet('Backup','Restore')][string]$Operation,[string]$File,[string]$Key)
    return (Invoke-OwnedUpdateNode $Tool ('update-recovery-'+$Operation.ToLowerInvariant()) (Join-Path $Tool.release 'app/dist/operator.cjs') @($(if($Operation -eq 'Backup'){'--backup-recovery'}else{'--restore-recovery'})) @{file=$File;key=$Key;includeCredentials=$true;includeSettings=@('gemini','telegram');includeFiles=@('sessionSigningKey');includeEnv=@('gemini','vapid')})
}
function Get-ProtectedUpdateContext {
    param([string]$ReleaseRoot,[string]$InstanceRoot,[string]$ServiceId,[int]$Port,[string]$ExpectedManifestSha256)
    $root=Get-ServiceRoot $ReleaseRoot
    Assert-ServiceAdministrator
    Assert-RecoveryCopyAncestors $root
    $pending=New-Object 'System.Collections.Generic.Stack[string]';$pending.Push($root);$count=0
    $writes=[Security.AccessControl.FileSystemRights]'Write,Delete,DeleteSubdirectoriesAndFiles,ChangePermissions,TakeOwnership'
    while($pending.Count -gt 0){
        $file=$pending.Pop();$count++;if($count -gt 100000){throw 'UPDATE_RELEASE_TREE_LIMIT'}
        $attributes=[IO.File]::GetAttributes($file);if($attributes -band [IO.FileAttributes]::ReparsePoint){throw 'UPDATE_RELEASE_REPARSE'}
        $directory=($attributes -band [IO.FileAttributes]::Directory) -ne 0
        $acl=if($directory){[IO.Directory]::GetAccessControl($file)}else{[IO.File]::GetAccessControl($file)}
        if($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -notin @('S-1-5-18','S-1-5-32-544') -or ($directory -and !$acl.AreAccessRulesProtected)){throw 'UPDATE_RELEASE_OWNER_INVALID'}
        foreach($rule in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])){if($rule.AccessControlType -eq 'Allow' -and ($rule.FileSystemRights -band $writes) -and $rule.IdentityReference.Value -notin @('S-1-5-18','S-1-5-32-544')){throw 'UPDATE_RELEASE_WRITER_INVALID'}}
        # Check each parent before enumerating its children, without repeated
        # provider/ancestor walks per file. Native ACLs still cover every entry.
        if($directory){foreach($child in [IO.Directory]::EnumerateFileSystemEntries($file)){$pending.Push($child)}}
    }
    # Protection precedes hashing and executing the authenticated import closure.
    return (Get-ServiceContext $root $InstanceRoot $ServiceId $Port $ExpectedManifestSha256)
}
function Assert-OwnedUpdateBoundary {
    param($Tool,$State,$Current,[ValidateSet('terminal','rollback')][string]$Mode)
    Assert-ServiceMetadataAcl (Join-Path $Current.instance 'service/update-journal.json')
    $descriptor=Get-Content -LiteralPath $Current.marker -Raw -Encoding UTF8 | ConvertFrom-Json
    Assert-ServiceOwner $Current $descriptor
    $schema=(Get-Content -LiteralPath (Join-Path $Current.release 'release-manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json).schema
    $row=$State.journal.current
    $operationId=if($row.phase -eq 'binary-rolled-back'){$row.rollbackOperationId}else{$row.operationId}
    $storage=Inspect-OwnedUpdateStorage $Tool $operationId $schema $Current.manifestHash
    $null=Invoke-OwnedUpdateNode $Tool 'update-boundary' (Join-Path $Tool.release 'ops/update-journal.mjs') @($Current.instance,'boundary') @{owner=$descriptor;storage=$storage;mode=$Mode;expectedSha256=$State.sha256}
    return $storage
}
