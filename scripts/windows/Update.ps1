[CmdletBinding(SupportsShouldProcess=$true)]
param([Parameter(Mandatory=$true)][string]$ReleaseRoot,[Parameter(Mandatory=$true)][string]$InstanceRoot,[Parameter(Mandatory=$true)][string]$ExpectedManifestSha256,[string]$CandidateReleaseRoot,[string]$ExpectedCandidateManifestSha256,[ValidateSet('Apply','RollbackSnapshot','RollbackBinary')][string]$Operation='Apply',[string]$ServiceId='FamilyOrganizer',[ValidateRange(1,65535)][int]$Port=3000,[switch]$ValidateOnly)
. (Join-Path $PSScriptRoot 'ServiceCommon.ps1')
. (Join-Path $PSScriptRoot 'UpdateCommon.ps1')
$context=Get-ServiceContext $ReleaseRoot $InstanceRoot $ServiceId $Port $ExpectedManifestSha256
Assert-ServiceMetadataAcl $context.marker
$descriptor=Get-Content -LiteralPath $context.marker -Raw -Encoding UTF8 | ConvertFrom-Json
$service=Get-Service -Name $ServiceId -ErrorAction Stop
$journalFile=Join-Path $context.instance 'service/update-journal.json'
$controlFile=Join-Path $context.instance 'config/update-control.json'
$keyFile=Join-Path $context.instance 'config/recovery-backup.key'
$script:updateState=$null;$script:updateKey=$null;$script:updateKeyBytes=$null
$state=$null;$guard=$null;$keyBytes=$null;$key=$null;$tool=$context;$old=$context;$candidate=$null;$operationId=$null
if($Operation -eq 'Apply'){
    if(!$CandidateReleaseRoot -or !$ExpectedCandidateManifestSha256){throw 'UPDATE_CANDIDATE_REQUIRED'}
    $candidate=Get-ServiceContext $CandidateReleaseRoot $context.instance $ServiceId $Port $ExpectedCandidateManifestSha256
    $tool=$candidate
    if($descriptor.releaseRoot -ine $context.release){
        # A completed exact same request is a read-only idempotent retry.
        Assert-ServiceOwner $candidate $descriptor
        Assert-ServiceMetadataAcl $journalFile
        $completed=Invoke-UpdateJournal $tool 'read' $null ''
        $record=$completed.journal.current
        if($record.phase -cne 'committed' -or $record.writesMayOpen -ne $true -or $record.oldRelease.root -ine $context.release -or $record.oldRelease.manifestSha256 -cne $context.manifestHash -or $record.candidateRelease.root -ine $candidate.release -or $record.candidateRelease.manifestSha256 -cne $candidate.manifestHash){throw 'UPDATE_JOURNAL_BINDING_INVALID'}
        Assert-BackupSecretAcl $controlFile $ServiceId
        $approved=Get-Content -LiteralPath $controlFile -Raw -Encoding UTF8 | ConvertFrom-Json
        if($approved.format -ne 1 -or $approved.operationId -cne $record.operationId -or $approved.manifestSha256 -cne $candidate.manifestHash -or $approved.phase -cne 'approve'){throw 'UPDATE_JOURNAL_BINDING_INVALID'}
        $schema=(Get-Content -LiteralPath (Join-Path $candidate.release 'release-manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json).schema
        $opened=Inspect-OwnedUpdateStorage $tool $record.operationId $schema
        if($opened.openedMetadata -ne $true -or $opened.openedCommands -ne 1){throw 'UPDATE_JOURNAL_BINDING_INVALID'}
        @{updated=$true;alreadyApplied=$true;operationId=$record.operationId;phase='committed';writesMayOpen=$true} | ConvertTo-Json -Compress
        return
    }
    Assert-ServiceOwner $context $descriptor
}else{
    Assert-ServiceMetadataAcl $journalFile
    $state=Invoke-UpdateJournal $tool 'read' $null ''
    $old=Get-ServiceContext $state.journal.current.oldRelease.root $context.instance $ServiceId $Port $state.journal.current.oldRelease.manifestSha256
    $candidate=Get-ServiceContext $state.journal.current.candidateRelease.root $context.instance $ServiceId $Port $state.journal.current.candidateRelease.manifestSha256
    if($state.journal.current.serviceId -cne $ServiceId -or $state.journal.current.instanceRoot -ine $context.instance -or $context.release -ine $candidate.release){throw 'UPDATE_JOURNAL_BINDING_INVALID'}
    if($descriptor.releaseRoot -ine $context.release){
        $record=$state.journal.current
        $terminal=if($Operation -eq 'RollbackSnapshot'){'rolled-back'}else{'binary-rolled-back'}
        if($record.phase -cne $terminal -or $record.writesMayOpen -ne $true -or $descriptor.releaseRoot -ine $old.release){throw 'UPDATE_JOURNAL_BINDING_INVALID'}
        Assert-ServiceOwner $old $descriptor
        Assert-BackupSecretAcl $controlFile $ServiceId
        $approved=Get-Content -LiteralPath $controlFile -Raw -Encoding UTF8 | ConvertFrom-Json
        $approvedId=if($terminal -eq 'rolled-back'){$record.operationId}else{$record.rollbackOperationId}
        if($approved.format -ne 1 -or $approved.operationId -cne $approvedId -or $approved.manifestSha256 -cne $old.manifestHash -or $approved.phase -cne 'approve'){throw 'UPDATE_JOURNAL_BINDING_INVALID'}
        $schema=(Get-Content -LiteralPath (Join-Path $old.release 'release-manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json).schema
        $opened=Inspect-OwnedUpdateStorage $tool $approvedId $schema
        if($opened.openedMetadata -ne $true -or $opened.openedCommands -ne 1){throw 'UPDATE_JOURNAL_BINDING_INVALID'}
        @{rollback=$true;alreadyRolledBack=$true;operationId=$record.operationId;phase=$terminal;writesMayOpen=$true} | ConvertTo-Json -Compress
        return
    }
    Assert-ServiceOwner $context $descriptor
}
# Reject short names/physical aliases, reparse roots and overlap before mutations.
$null=Invoke-OwnedUpdateNode $tool 'update-roots' (Join-Path $tool.release 'ops/update-journal.mjs') @($context.instance,'roots') @{oldReleaseRoot=$old.release;candidateReleaseRoot=$candidate.release}
foreach($root in @($context.instance,$old.release,$candidate.release)){Assert-ServiceMetadataAcl $root;Assert-RecoveryCopyAncestors $root;$null=Get-ServiceTree $root}
if(Test-Path -LiteralPath $journalFile){Assert-ServiceMetadataAcl $journalFile}
if(Test-Path -LiteralPath $controlFile){Assert-BackupSecretAcl $controlFile $ServiceId}
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
function Get-UpdateSchema {
    param($Release)
    return (Get-Content -LiteralPath (Join-Path $Release.release 'release-manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json).schema
}
function Assert-CurrentUpdateOwner {
    param($Release)
    Assert-ServiceOwner $Release (Get-Content -LiteralPath $Release.marker -Raw -Encoding UTF8 | ConvertFrom-Json)
}
function Complete-OwnedUpdateRollback {
    param([bool]$Snapshot)
    $row=$script:updateState.journal.current
    if($Snapshot -and $row.writesMayOpen -ne $false){throw 'UPDATE_WRITES_MAY_HAVE_OPENED'}
    Assert-CurrentUpdateOwner $candidate
    Stop-OwnedUpdateService $candidate
    $storage=Inspect-OwnedUpdateStorage $tool $row.operationId (Get-UpdateSchema $old)
    if($Snapshot){
        if($row.writesMayOpen -ne $false -or $storage.writesMayHaveOpened -ne $false){throw 'UPDATE_WRITES_MAY_HAVE_OPENED'}
        Assert-UpdateHeldControl $candidate $row.operationId
        Assert-ServiceMetadataAcl $row.snapshot.file;Assert-NoServiceReparse $row.snapshot.file
        if((Get-ServiceHash $row.snapshot.file) -cne $row.snapshot.sha256 -or (Get-Item -LiteralPath $row.snapshot.file).Length -ne $row.snapshot.bytes){throw 'UPDATE_SNAPSHOT_CHANGED'}
        $script:updateState=Set-UpdatePhase $tool $script:updateState 'rollback-snapshot' $null
        if(!$script:updateKey){$script:updateKey=Read-OwnedUpdateKey}
        $result=Invoke-OwnedUpdateRecovery $tool 'Restore' $row.snapshot.file $script:updateKey
        if($result.sessionsRevoked -ne $true){throw 'UPDATE_RESTORE_FAILED'}
        $script:updateState=Set-UpdatePhase $tool $script:updateState 'restored' $null
        $rollbackId=$row.operationId
    }else{
        # Actual schemas were checked against old binary before any configuration change.
        $rollbackId=[guid]::NewGuid().ToString().ToLowerInvariant()
        $script:updateState=Invoke-UpdateJournal $tool 'transition' @{phase='rollback-binary';rollbackOperationId=$rollbackId} $script:updateState.sha256
    }
    Publish-UpdateControl $old $rollbackId 'held'
    Switch-OwnedUpdateRelease $old $guard
    Invoke-ServiceNative 'update-rollback-start' $old.wrapper @('start')
    Wait-OwnedUpdateHttp $old 'held'
    $smoke=Inspect-OwnedUpdateStorage $tool $rollbackId (Get-UpdateSchema $old)
    if($smoke.writesMayHaveOpened -ne $false){throw 'UPDATE_ROLLBACK_BINDING_INVALID'}
    if($Snapshot){$script:updateState=Set-UpdatePhase $tool $script:updateState 'reopening-old' $null}
    # Binary rollback already persisted its conservative opening latch.
    Publish-UpdateControl $old $rollbackId 'approve'
    Wait-OwnedUpdateHttp $old 'ready'
    $opened=Inspect-OwnedUpdateStorage $tool $rollbackId (Get-UpdateSchema $old)
    if($opened.openedMetadata -ne $true -or $opened.openedCommands -ne 1){throw 'UPDATE_ROLLBACK_OPEN_FAILED'}
    $script:updateState=Set-UpdatePhase $tool $script:updateState $(if($Snapshot){'rolled-back'}else{'binary-rolled-back'}) $null
    Assert-CurrentUpdateOwner $old
}
try{
    $guard=Enter-OwnedDataOperation $context
    if($Operation -ne 'Apply'){
        $script:updateState=Invoke-UpdateJournal $tool 'read' $null ''
        $script:updateKey=$null
        Complete-OwnedUpdateRollback ($Operation -eq 'RollbackSnapshot')
    }else{
        if(Test-Path -LiteralPath $journalFile){
            $previous=Invoke-UpdateJournal $tool 'read' $null ''
            if($previous.journal.current.phase -notin @('committed','rolled-back','binary-rolled-back')){throw 'UPDATE_JOURNAL_ACTIVE'}
            if(Test-Path -LiteralPath $controlFile){
                $prior=Get-Content -LiteralPath $controlFile -Raw -Encoding UTF8 | ConvertFrom-Json
                $priorRow=$previous.journal.current
                $priorId=if($priorRow.phase -eq 'binary-rolled-back'){$priorRow.rollbackOperationId}else{$priorRow.operationId}
                if($prior.format -ne 1 -or $prior.phase -cne 'approve' -or $prior.operationId -cne $priorId -or $prior.manifestSha256 -cne $context.manifestHash){throw 'UPDATE_CONTROL_PENDING'}
            }
        }elseif(Test-Path -LiteralPath $controlFile){throw 'UPDATE_CONTROL_PENDING'}
        $operationId=[guid]::NewGuid().ToString().ToLowerInvariant()
        $script:updateState=Invoke-UpdateJournal $tool 'initialize' @{operationId=$operationId;serviceId=$ServiceId;instanceRoot=$context.instance;oldRelease=@{root=$old.release;manifestSha256=$old.manifestHash};candidateRelease=@{root=$candidate.release;manifestSha256=$candidate.manifestHash}} ''
        Stop-OwnedUpdateService $old
        $null=Inspect-OwnedUpdateStorage $tool $operationId (Get-UpdateSchema $old)
        $null=Inspect-OwnedUpdateStorage $tool $operationId (Get-UpdateSchema $candidate)
        $script:updateKey=Read-OwnedUpdateKey
        $backupRoot=Join-Path $context.instance 'backups';Assert-NoServiceReparse $backupRoot
        if(!(Test-Path -LiteralPath $backupRoot)){throw 'UPDATE_BACKUP_ROOT_REQUIRED'}
        $file=Join-Path $backupRoot ('recovery_'+$operationId+'.fo-recovery')
        $snapshot=Invoke-OwnedUpdateRecovery $tool 'Backup' $file $script:updateKey
        if($snapshot.encrypted -ne $true -or $snapshot.sha256 -cnotmatch '^[a-f0-9]{64}$' -or $snapshot.bytes -le 48){throw 'UPDATE_SNAPSHOT_FAILED'}
        Set-OwnedServiceAcl $file '' 'RX';Assert-ServiceMetadataAcl $file
        $script:updateState=Set-UpdatePhase $tool $script:updateState 'snapshot' @{file=$file;sha256=$snapshot.sha256;bytes=$snapshot.bytes}
        $script:updateState=Set-UpdatePhase $tool $script:updateState 'switching' $null
        Publish-UpdateControl $candidate $operationId 'held'
        Switch-OwnedUpdateRelease $candidate $guard
        $script:updateState=Set-UpdatePhase $tool $script:updateState 'held' $null
        Invoke-ServiceNative 'update-candidate-start' $candidate.wrapper @('start')
        Wait-OwnedUpdateHttp $candidate 'held'
        Assert-UpdateHeldControl $candidate $operationId
        $storage=Inspect-OwnedUpdateStorage $tool $operationId (Get-UpdateSchema $candidate)
        if($storage.writesMayHaveOpened -ne $false){throw 'UPDATE_EARLY_OPEN'}
        # Flush the independent latch BEFORE approval. A later DB restore cannot erase it.
        $script:updateState=Set-UpdatePhase $tool $script:updateState 'opening' $null
        Publish-UpdateControl $candidate $operationId 'approve'
        Wait-OwnedUpdateHttp $candidate 'ready'
        $opened=Inspect-OwnedUpdateStorage $tool $operationId (Get-UpdateSchema $candidate)
        if($opened.openedMetadata -ne $true -or $opened.openedCommands -ne 1){throw 'UPDATE_OPEN_FAILED'}
        $script:updateState=Set-UpdatePhase $tool $script:updateState 'committed' $null
        Assert-CurrentUpdateOwner $candidate
    }
    @{updated=($Operation -eq 'Apply');rollback=($Operation -ne 'Apply');phase=$script:updateState.journal.current.phase;operationId=$script:updateState.journal.current.operationId;writesMayOpen=$script:updateState.journal.current.writesMayOpen;nativeExitCodes=$script:ServiceNativeResults.ToArray()} | ConvertTo-Json -Depth 8 -Compress
}catch{
    # Unknown/corrupt journal/owner/control stays unavailable; never infer safe
    # restore from absent DB metadata. Keep original release/snapshot/evidence.
    $originalFailure=$_
    if($Operation -eq 'Apply' -and $script:updateState){
        try{
            $latest=Invoke-UpdateJournal $tool 'read' $null ''
            if($latest.journal.current.phase -in @('planned','snapshot','switching','held','opening')){$script:updateState=Set-UpdatePhase $tool $latest 'failed' $null}
            if($script:updateState -and $script:updateState.journal.current.PSObject.Properties['snapshot'] -and $script:updateState.journal.current.writesMayOpen -eq $false){Complete-OwnedUpdateRollback $true}
            else{Assert-CurrentUpdateOwner $candidate;Stop-OwnedUpdateService $candidate}
        }catch{
            # A mismatch/partial switch is a manual recovery requirement.
            Write-Output 'UPDATE_RECOVERY_REQUIRED'
        }
    }
    throw ('UPDATE_OPERATION_FAILED ('+$Operation+'; '+$originalFailure.Exception.Message+')')
}finally{
    try{if($guard){$guard.Dispose()}}finally{if($script:updateKeyBytes){[Array]::Clear($script:updateKeyBytes,0,$script:updateKeyBytes.Length)};$script:updateKey=$null;$script:updateState=$null}
}
