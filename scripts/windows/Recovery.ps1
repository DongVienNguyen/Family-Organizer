[CmdletBinding(SupportsShouldProcess=$true)]
param([Parameter(Mandatory=$true)][string]$ReleaseRoot,[Parameter(Mandatory=$true)][ValidateSet('Backup','Restore')][string]$Operation,[Parameter(Mandatory=$true)][string]$InstanceRoot,[Parameter(Mandatory=$true)][string]$ExpectedManifestSha256,[string]$ServiceId='FamilyOrganizer',[ValidateRange(1,65535)][int]$Port=3000,[switch]$ValidateOnly)
. (Join-Path $PSScriptRoot 'ServiceCommon.ps1')
$context=Get-ServiceContext $ReleaseRoot $InstanceRoot $ServiceId $Port $ExpectedManifestSha256
Assert-ServiceMetadataAcl $context.marker
$descriptor=Get-Content -LiteralPath $context.marker -Raw -Encoding UTF8 | ConvertFrom-Json
Assert-ServiceOwner $context $descriptor
$service=Get-Service -Name $ServiceId -ErrorAction Stop
if($service.Status -ne 'Stopped'){throw 'Recovery operation requires the owned service stopped'}
$database=Join-Path $context.instance 'data/family.db'
Assert-NoServiceReparse $database
# Confirm all native SQLite handles are closed before accepting confidential stdin.
$probe=[IO.File]::Open($database,[IO.FileMode]::Open,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
$probe.Dispose()
if($ValidateOnly -or !$PSCmdlet.ShouldProcess($context.instance,'Run encrypted recovery '+$Operation)){return}
Assert-ServiceAdministrator
$inputStream=$null
$operationGuard=$null
$memory=New-Object IO.MemoryStream
$process=New-Object Diagnostics.Process
$started=$false
try{
    $operationGuard=Enter-OwnedDataOperation $context
    $inputStream=[Console]::OpenStandardInput()
    # Bounded UTF8 stdin only: no passwords in arguments, environment, files or logs.
    $buffer=New-Object byte[] 4096
    $deadline=[DateTime]::UtcNow.AddSeconds(20)
    while($true){
        $remaining=[int][Math]::Max(0,($deadline-[DateTime]::UtcNow).TotalMilliseconds)
        $read=$inputStream.ReadAsync($buffer,0,$buffer.Length)
        if(!$read.Wait($remaining)){throw 'Recovery input timeout'}
        $count=$read.Result
        if($count -eq 0){break}
        if($memory.Length+$count -gt 16384){throw 'Recovery input limit'}
        $memory.Write($buffer,0,$count)
    }
    $info=New-Object Diagnostics.ProcessStartInfo
    $info.FileName=$context.node
    $mode=if($Operation -eq 'Backup'){'--backup-recovery'}else{'--restore-recovery'}
    $info.Arguments='"'+(Join-Path $context.release 'app/dist/operator.cjs')+'" '+$mode
    $info.WorkingDirectory=Join-Path $context.release 'app'
    $info.UseShellExecute=$false
    $info.RedirectStandardInput=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
    $info.EnvironmentVariables.Remove('NODE_OPTIONS');$info.EnvironmentVariables.Remove('NODE_PATH')
    $info.EnvironmentVariables['NODE_ENV']='production'
    $info.EnvironmentVariables['APP_CODE_ROOT']=Join-Path $context.release 'app'
    $info.EnvironmentVariables['DATA_DIR']=Join-Path $context.instance 'data'
    $info.EnvironmentVariables['CONFIG_DIR']=Join-Path $context.instance 'config'
    $info.EnvironmentVariables['LOG_DIR']=Join-Path $context.instance 'logs'
    $process.StartInfo=$info
    if(!$process.Start()){throw 'Recovery operator could not start'}
    $started=$true
    $stdout=$process.StandardOutput.ReadToEndAsync();$stderr=$process.StandardError.ReadToEndAsync()
    $memory.Position=0;$memory.CopyTo($process.StandardInput.BaseStream);$process.StandardInput.Close()
    if(!$process.WaitForExit(30000)){$process.Kill();$process.WaitForExit();throw 'Recovery operator timeout'}
    $code=$process.ExitCode
    $script:ServiceNativeResults.Add(@{phase='recovery-'+$Operation.ToLowerInvariant();exitCode=$code})
    if($code -ne 0){
        # Forward only bounded constant error codes, never raw stdout/stderr/input.
        $safeCode='RECOVERY_OPERATION_FAILED'
        try{
            $failure=$stdout.Result.Trim() | ConvertFrom-Json
            if($failure.error -is [string] -and $failure.error -cin @('RECOVERY_PENDING_RESTORE','RECOVERY_INPUT_INVALID','RECOVERY_PATH_INVALID','RECOVERY_ENVELOPE_INVALID','RECOVERY_SNAPSHOT_INVALID','RECOVERY_STORE_REQUIRED','RECOVERY_OPERATION_FAILED','INITIALIZATION_INPUT_INVALID','INITIALIZATION_INPUT_LIMIT','INITIALIZATION_INPUT_TIMEOUT','INITIALIZATION_CONFIGURATION_INVALID','INITIALIZATION_STORAGE_FAILED')){$safeCode=$failure.error}
        }catch{}
        throw "Recovery operator native exit $code ($safeCode)"
    }
    # Only the authenticated operator's safe success result is printed.
    $result=$stdout.Result.Trim() | ConvertFrom-Json
    if($Operation -eq 'Backup'){if($result.encrypted -ne $true -or $result.sha256 -cnotmatch '^[a-f0-9]{64}$' -or $result.bytes -le 48){throw 'Recovery operator result invalid'}}
    elseif($result.sessionsRevoked -ne $true -or $result.restoredFiles -lt 0){throw 'Recovery operator result invalid'}
    $result | ConvertTo-Json -Compress
}finally{
    try{
        if($started -and !$process.HasExited){$process.Kill();$process.WaitForExit()}
    }finally{
        try{$process.Dispose();$memory.Dispose();if($inputStream){$inputStream.Dispose()}}
        finally{if($operationGuard){$operationGuard.Dispose()}}
    }
}
