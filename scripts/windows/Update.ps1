[CmdletBinding(SupportsShouldProcess=$true)]
param([Parameter(Mandatory=$true)][string]$ReleaseRoot,[Parameter(Mandatory=$true)][string]$InstanceRoot,[Parameter(Mandatory=$true)][string]$ExpectedManifestSha256,[string]$CandidateReleaseRoot,[string]$ExpectedCandidateManifestSha256,[ValidateSet('Apply','RollbackSnapshot','RollbackBinary')][string]$Operation='Apply',[string]$ServiceId='FamilyOrganizer',[ValidateRange(1,65535)][int]$Port=3000,[switch]$ValidateOnly)
. (Join-Path $PSScriptRoot 'ServiceCommon.ps1')
. (Join-Path $PSScriptRoot 'UpdateCommon.ps1')
$context=Get-ProtectedUpdateContext $ReleaseRoot $InstanceRoot $ServiceId $Port $ExpectedManifestSha256
$journalFile=Join-Path $context.instance 'service/update-journal.json'
$controlFile=Join-Path $context.instance 'config/update-control.json'
$keyFile=Join-Path $context.instance 'config/recovery-backup.key'
$guard=$null;$state=$null;$already=$false;$script:updateState=$null;$script:updateKey=$null;$script:updateKeyBytes=$null;$startedContext=$null
$old=$context;$candidate=$null;$tool=$context
if($Operation -eq 'Apply'){
    if(!$CandidateReleaseRoot -or !$ExpectedCandidateManifestSha256){throw 'UPDATE_CANDIDATE_REQUIRED'}
    $candidate=Get-ProtectedUpdateContext $CandidateReleaseRoot $context.instance $ServiceId $Port $ExpectedCandidateManifestSha256
    $tool=$candidate
}else{
    Assert-ServiceMetadataAcl $journalFile;$state=Invoke-UpdateJournal $tool 'read' $null ''
    $old=Get-ProtectedUpdateContext $state.journal.current.oldRelease.root $context.instance $ServiceId $Port $state.journal.current.oldRelease.manifestSha256
    $candidate=Get-ProtectedUpdateContext $state.journal.current.candidateRelease.root $context.instance $ServiceId $Port $state.journal.current.candidateRelease.manifestSha256
    if($context.release -ine $candidate.release){throw 'UPDATE_JOURNAL_BINDING_INVALID'}
}
$null=Invoke-OwnedUpdateNode $tool 'update-roots' (Join-Path $tool.release 'ops/update-journal.mjs') @($context.instance,'roots') @{oldReleaseRoot=$old.release;candidateReleaseRoot=$candidate.release}
Assert-ServiceMetadataAcl $context.instance;Assert-RecoveryCopyAncestors $context.instance
function Get-UpdateSchema {param($Release);return (Get-Content -LiteralPath (Join-Path $Release.release 'release-manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json).schema}
function Assert-CurrentUpdateOwner {param($Release);Assert-ServiceOwner $Release (Get-Content -LiteralPath $Release.marker -Raw -Encoding UTF8 | ConvertFrom-Json)}
function Test-UpdateRequestBoundary {
    $descriptor=Get-Content -LiteralPath $context.marker -Raw -Encoding UTF8 | ConvertFrom-Json
    if($Operation -eq 'Apply'){
        if($descriptor.releaseRoot -ine $context.release){
            Assert-CurrentUpdateOwner $candidate
            Assert-ServiceMetadataAcl $journalFile;$existing=Invoke-UpdateJournal $tool 'read' $null '';$row=$existing.journal.current
            if($row.phase -cne 'committed' -or $row.oldRelease.root -ine $old.release -or $row.oldRelease.manifestSha256 -cne $old.manifestHash -or $row.candidateRelease.root -ine $candidate.release -or $row.candidateRelease.manifestSha256 -cne $candidate.manifestHash){throw 'UPDATE_JOURNAL_BINDING_INVALID'}
            $null=Assert-OwnedUpdateBoundary $tool $existing $candidate 'terminal'
            return @{already=$true;state=$existing;current=$candidate}
        }
        Assert-CurrentUpdateOwner $context
        if(Test-Path -LiteralPath $journalFile){
            Assert-ServiceMetadataAcl $journalFile;$existing=Invoke-UpdateJournal $tool 'read' $null ''
            $null=Assert-OwnedUpdateBoundary $tool $existing $context 'terminal'
        }elseif(Test-Path -LiteralPath $controlFile){throw 'UPDATE_CONTROL_PENDING'}
        return @{already=$false;current=$context}
    }
    Assert-ServiceMetadataAcl $journalFile;$existing=Invoke-UpdateJournal $tool 'read' $null '';$row=$existing.journal.current
    if($row.serviceId -cne $ServiceId -or $row.instanceRoot -ine $context.instance -or $row.oldRelease.root -ine $old.release -or $row.oldRelease.manifestSha256 -cne $old.manifestHash -or $row.candidateRelease.root -ine $candidate.release -or $row.candidateRelease.manifestSha256 -cne $candidate.manifestHash){throw 'UPDATE_JOURNAL_BINDING_INVALID'}
    if($descriptor.releaseRoot -ieq $old.release){
        $terminal=if($Operation -eq 'RollbackSnapshot'){'rolled-back'}else{'binary-rolled-back'}
        if($row.phase -cne $terminal){throw 'UPDATE_JOURNAL_BINDING_INVALID'}
        $null=Assert-OwnedUpdateBoundary $tool $existing $old 'terminal'
        return @{already=$true;state=$existing;current=$old}
    }
    if($descriptor.releaseRoot -ine $candidate.release){throw 'UPDATE_JOURNAL_BINDING_INVALID'}
    $storage=Assert-OwnedUpdateBoundary $tool $existing $candidate 'rollback'
    if($Operation -eq 'RollbackSnapshot' -and ($row.writesMayOpen -ne $false -or $storage.writesMayHaveOpened -ne $false)){throw 'UPDATE_WRITES_MAY_HAVE_OPENED'}
    return @{already=$false;state=$existing;current=$candidate}
}
$preflight=Test-UpdateRequestBoundary
if($ValidateOnly -or !$PSCmdlet.ShouldProcess($context.instance,'Owned update '+$Operation)){return}
Assert-ServiceAdministrator
function Read-OwnedUpdateKey {
    Assert-BackupSecretAcl $keyFile $ServiceId
    $stream=[IO.File]::Open($keyFile,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
    try{
        if($stream.Length -ne 32){throw 'UPDATE_RECOVERY_KEY_INVALID'}
        $script:updateKeyBytes=New-Object byte[] 32;$offset=0
        while($offset -lt 32){$count=$stream.Read($script:updateKeyBytes,$offset,32-$offset);if($count -le 0){throw 'UPDATE_RECOVERY_KEY_INVALID'};$offset+=$count}
        if($stream.ReadByte() -ne -1){throw 'UPDATE_RECOVERY_KEY_INVALID'}
    }finally{$stream.Dispose()}
    return ([BitConverter]::ToString($script:updateKeyBytes)).Replace('-','').ToLowerInvariant()
}
function Complete-OwnedUpdateRollback {
    param([bool]$Snapshot)
    $row=$script:updateState.journal.current
    $storage=Assert-OwnedUpdateBoundary $tool $script:updateState $candidate 'rollback'
    if($Snapshot -and ($row.writesMayOpen -ne $false -or $storage.writesMayHaveOpened -ne $false)){throw 'UPDATE_WRITES_MAY_HAVE_OPENED'}
    Stop-OwnedUpdateService $candidate
    $null=Inspect-OwnedUpdateStorage $tool $row.operationId (Get-UpdateSchema $old) $candidate.manifestHash
    if($Snapshot){
        Assert-UpdateHeldControl $candidate $row.operationId
        Assert-ServiceMetadataAcl $row.snapshot.file
        if((Get-ServiceHash $row.snapshot.file) -cne $row.snapshot.sha256 -or (Get-Item -LiteralPath $row.snapshot.file).Length -ne $row.snapshot.bytes){throw 'UPDATE_SNAPSHOT_CHANGED'}
        $script:updateState=Set-UpdatePhase $tool $script:updateState 'rollback-snapshot' $null
        if(!$script:updateKey){$script:updateKey=Read-OwnedUpdateKey}
        $result=Invoke-OwnedUpdateRecovery $old 'Restore' $row.snapshot.file $script:updateKey
        if($result.sessionsRevoked -ne $true){throw 'UPDATE_RESTORE_FAILED'}
        $script:updateState=Set-UpdatePhase $tool $script:updateState 'restored' $null;$rollbackId=$row.operationId
    }else{
        $rollbackId=[guid]::NewGuid().ToString().ToLowerInvariant()
        $script:updateState=Invoke-UpdateJournal $tool 'transition' @{phase='rollback-binary';rollbackOperationId=$rollbackId} $script:updateState.sha256
    }
    Publish-UpdateControl $old $rollbackId 'held';Switch-OwnedUpdateRelease $old $guard
    $script:startedUpdateContext=$old
    Invoke-ServiceNative 'update-rollback-start' $old.wrapper @('start');Wait-OwnedUpdateHttp $old 'held'
    $smoke=Inspect-OwnedUpdateStorage $tool $rollbackId (Get-UpdateSchema $old) $old.manifestHash
    if($smoke.writesMayHaveOpened -ne $false){throw 'UPDATE_ROLLBACK_BINDING_INVALID'}
    if($Snapshot){$script:updateState=Set-UpdatePhase $tool $script:updateState 'reopening-old' $null}
    Publish-UpdateControl $old $rollbackId 'approve';Wait-OwnedUpdateHttp $old 'ready'
    $opened=Inspect-OwnedUpdateStorage $tool $rollbackId (Get-UpdateSchema $old) $old.manifestHash
    if($opened.openedBindingVerified -ne $true){throw 'UPDATE_ROLLBACK_OPEN_FAILED'}
    $script:updateState=Set-UpdatePhase $tool $script:updateState $(if($Snapshot){'rolled-back'}else{'binary-rolled-back'}) $null
    Assert-CurrentUpdateOwner $old
}
$script:startedUpdateContext=$null
try{
    # Re-read authoritative owner/SCM/XML and all boundary evidence under the guard.
    $guard=Enter-OwnedDataOperation $context
    $current=Test-UpdateRequestBoundary
    if($current.already){@{alreadyCompleted=$true;phase=$current.state.journal.current.phase;operationId=$current.state.journal.current.operationId;writesMayOpen=$true} | ConvertTo-Json -Compress;return}
    if($Operation -ne 'Apply'){$script:updateState=$current.state;Complete-OwnedUpdateRollback ($Operation -eq 'RollbackSnapshot')}
    else{
        $operationId=[guid]::NewGuid().ToString().ToLowerInvariant()
        $script:updateState=Invoke-UpdateJournal $tool 'initialize' @{operationId=$operationId;serviceId=$ServiceId;instanceRoot=$context.instance;oldRelease=@{root=$old.release;manifestSha256=$old.manifestHash};candidateRelease=@{root=$candidate.release;manifestSha256=$candidate.manifestHash}} ''
        Stop-OwnedUpdateService $old
        $null=Inspect-OwnedUpdateStorage $tool $operationId (Get-UpdateSchema $old) $old.manifestHash
        $null=Inspect-OwnedUpdateStorage $tool $operationId (Get-UpdateSchema $candidate) $candidate.manifestHash
        $script:updateKey=Read-OwnedUpdateKey
        $backupRoot=Join-Path $context.instance 'backups';Assert-NoServiceReparse $backupRoot
        if(!(Test-Path -LiteralPath $backupRoot)){throw 'UPDATE_BACKUP_ROOT_REQUIRED'}
        $file=Join-Path $backupRoot ('recovery_'+$operationId+'.fo-recovery')
        # Source release captures BEFORE any candidate storage/bootstrap execution.
        $snapshot=Invoke-OwnedUpdateRecovery $old 'Backup' $file $script:updateKey
        if($snapshot.encrypted -ne $true -or $snapshot.sha256 -cnotmatch '^[a-f0-9]{64}$' -or $snapshot.bytes -le 48){throw 'UPDATE_SNAPSHOT_FAILED'}
        Set-OwnedServiceAcl $file '' 'RX';Assert-ServiceMetadataAcl $file
        $script:updateState=Set-UpdatePhase $tool $script:updateState 'snapshot' @{file=$file;sha256=$snapshot.sha256;bytes=$snapshot.bytes}
        $script:updateState=Set-UpdatePhase $tool $script:updateState 'switching' $null
        Publish-UpdateControl $candidate $operationId 'held';Switch-OwnedUpdateRelease $candidate $guard
        $script:updateState=Set-UpdatePhase $tool $script:updateState 'held' $null
        $script:startedUpdateContext=$candidate
        Invoke-ServiceNative 'update-candidate-start' $candidate.wrapper @('start');Wait-OwnedUpdateHttp $candidate 'held'
        $storage=Assert-OwnedUpdateBoundary $tool $script:updateState $candidate 'rollback'
        if($storage.writesMayHaveOpened -ne $false){throw 'UPDATE_EARLY_OPEN'}
        $script:updateState=Set-UpdatePhase $tool $script:updateState 'opening' $null
        Publish-UpdateControl $candidate $operationId 'approve';Wait-OwnedUpdateHttp $candidate 'ready'
        $opened=Inspect-OwnedUpdateStorage $tool $operationId (Get-UpdateSchema $candidate) $candidate.manifestHash
        if($opened.openedBindingVerified -ne $true){throw 'UPDATE_OPEN_FAILED'}
        $script:updateState=Set-UpdatePhase $tool $script:updateState 'committed' $null
        Assert-CurrentUpdateOwner $candidate
    }
    @{updated=($Operation -eq 'Apply');rollback=($Operation -ne 'Apply');phase=$script:updateState.journal.current.phase;operationId=$script:updateState.journal.current.operationId;writesMayOpen=$script:updateState.journal.current.writesMayOpen;nativeExitCodes=$script:ServiceNativeResults.ToArray()} | ConvertTo-Json -Depth 8 -Compress
}catch{
    $originalFailure=$_
    if($Operation -eq 'Apply' -and $script:updateState){
        try{
            $latest=Invoke-UpdateJournal $tool 'read' $null ''
            if($latest.journal.current.phase -in @('planned','snapshot','switching','held','opening')){$script:updateState=Set-UpdatePhase $tool $latest 'failed' $null}
            if($script:updateState.journal.current.PSObject.Properties['snapshot'] -and $script:updateState.journal.current.writesMayOpen -eq $false){Complete-OwnedUpdateRollback $true}
            elseif($script:startedUpdateContext){Assert-CurrentUpdateOwner $script:startedUpdateContext;Stop-OwnedUpdateService $script:startedUpdateContext}
        }catch{Write-Output 'UPDATE_RECOVERY_REQUIRED';if($script:startedUpdateContext){try{Assert-CurrentUpdateOwner $script:startedUpdateContext;Stop-OwnedUpdateService $script:startedUpdateContext}catch{Write-Output 'UPDATE_STOP_REQUIRES_OWNER_RECOVERY'}}}
    }elseif($script:startedUpdateContext){
        # An ordinary explicit rollback failure must not leave old Ready/writable.
        try{Assert-CurrentUpdateOwner $script:startedUpdateContext;Stop-OwnedUpdateService $script:startedUpdateContext}catch{Write-Output 'UPDATE_STOP_REQUIRES_OWNER_RECOVERY'}
    }
    throw ('UPDATE_OPERATION_FAILED ('+$Operation+'; '+$originalFailure.Exception.Message+')')
}finally{try{if($guard){$guard.Dispose()}}finally{if($script:updateKeyBytes){[Array]::Clear($script:updateKeyBytes,0,$script:updateKeyBytes.Length)};$script:updateKey=$null;$script:updateState=$null;$script:startedUpdateContext=$null}}
