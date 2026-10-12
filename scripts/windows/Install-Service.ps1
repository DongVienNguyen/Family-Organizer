[CmdletBinding(SupportsShouldProcess=$true)]
param([Parameter(Mandatory=$true)][string]$ReleaseRoot,[Parameter(Mandatory=$true)][string]$InstanceRoot,[Parameter(Mandatory=$true)][string]$ExpectedManifestSha256,[string]$ServiceId='FamilyOrganizer',[ValidateRange(1,65535)][int]$Port=3000,[switch]$ValidateOnly)
. (Join-Path $PSScriptRoot 'ServiceCommon.ps1')
$context=Get-ServiceContext $ReleaseRoot $InstanceRoot $ServiceId $Port $ExpectedManifestSha256
$existing=Get-Service -Name $ServiceId -ErrorAction SilentlyContinue
$descriptor=$null
if (Test-Path -LiteralPath $context.marker) {
    Assert-ServiceMetadataAcl $context.instance
    Assert-ServiceMetadataAcl $context.directory
    Assert-ServiceMetadataAcl $context.marker
    $descriptor=Get-Content -LiteralPath $context.marker -Raw -Encoding UTF8 | ConvertFrom-Json
    Assert-ServiceOwner $context $descriptor
} elseif ($existing -or ((Test-Path -LiteralPath $context.instance) -and @(Get-ChildItem -LiteralPath $context.instance -Force).Count -gt 0)) { throw 'Refuse unowned existing service/instance; no data overwrite' }
if ($ValidateOnly -or !$PSCmdlet.ShouldProcess($context.instance,'Install owned Family Organizer service')) { return }
Assert-ServiceAdministrator
if($existing -and $existing.Status -ne 'Stopped'){throw 'Stop the owned service before ACL reconfiguration'}
# Preflight all existing trees before recursive ACL operations/install commands.
foreach($root in @($context.instance,$context.release)){if(Test-Path -LiteralPath $root){$null=Get-ServiceTree $root}}
if (!$descriptor) {
    New-Item -ItemType Directory -Path $context.directory,(Join-Path $context.instance 'data'),(Join-Path $context.instance 'config'),(Join-Path $context.instance 'logs') -Force | Out-Null
    Set-OwnedServiceAcl $context.instance '' 'RX'
    Copy-Item -LiteralPath (Join-Path $context.release 'bin/family-organizer-service.exe') -Destination $context.wrapper
    Copy-Item -LiteralPath (Join-Path $context.release 'bin/family-organizer-service.exe.config') -Destination ($context.wrapper+'.config')
    Invoke-ServiceNative 'write-config' $context.node @((Join-Path $context.release 'ops/write-service-config.mjs'),$context.release,$context.instance,$context.id,[string]$context.port,$context.xml)
    $descriptor=@{format=1;serviceId=$ServiceId;releaseRoot=$context.release;instanceRoot=$context.instance;manifestHash=$context.manifestHash;commitSha=$context.commitSha;port=$Port;xmlSha256=(Get-ServiceHash $context.xml)}
    [IO.File]::WriteAllText($context.marker,($descriptor | ConvertTo-Json -Depth 5), (New-Object Text.UTF8Encoding($false)))
}
# Seal critical files and verify canonical configuration before elevated WinSW use.
Set-OwnedServiceAcl $context.directory '' 'RX'
Assert-ServiceOwner $context $descriptor
if (!$existing) { Invoke-ServiceNative 'install' $context.wrapper @('install') }
Invoke-ServiceNative 'service-sid' (Join-Path $env:windir 'System32/sc.exe') @('sidtype',$ServiceId,'unrestricted')
Set-OwnedServiceAcl $context.instance $ServiceId 'RX'
Set-OwnedServiceAcl $context.release $ServiceId 'RX'
foreach ($name in @('data','config','logs')) { Set-OwnedServiceAcl (Join-Path $context.instance $name) $ServiceId 'M' }
# Reapply private operator controls after the recursive instance/config ACLs.
$backupRoot=Join-Path $context.instance 'backups'
if(Test-Path -LiteralPath $backupRoot){Set-OwnedServiceAcl $backupRoot $ServiceId 'M'}
foreach($name in @('recovery-backup.key','recovery-backup.json','update-control.json')){
    $file=Join-Path (Join-Path $context.instance 'config') $name
    if(Test-Path -LiteralPath $file){Set-OwnedServiceAcl $file $ServiceId 'R';Assert-BackupSecretAcl $file $ServiceId}
}
Assert-ServiceOwner $context (Get-Content -LiteralPath $context.marker -Raw -Encoding UTF8 | ConvertFrom-Json)
@{serviceId=$ServiceId;commitSha=$context.commitSha;frameworkRelease=$context.frameworkRelease;alreadyInstalled=[bool]$existing;nativeExitCodes=$script:ServiceNativeResults.ToArray()} | ConvertTo-Json -Depth 8
