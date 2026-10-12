[CmdletBinding(SupportsShouldProcess=$true)]
param([Parameter(Mandatory=$true)][string]$ReleaseRoot,[Parameter(Mandatory=$true)][string]$ExpectedManifestSha256,[Parameter(Mandatory=$true)][string]$InstanceRoot,[string]$ServiceId='FamilyOrganizer',[switch]$ValidateOnly)
. (Join-Path $PSScriptRoot 'ServiceCommon.ps1')
$instance=Get-ServiceRoot $InstanceRoot
$marker=Join-Path $instance 'service/installation.json'
Assert-ServiceMetadataAcl $instance
Assert-ServiceMetadataAcl (Join-Path $instance 'service')
Assert-ServiceMetadataAcl $marker
$descriptor=Get-Content -LiteralPath $marker -Raw -Encoding UTF8 | ConvertFrom-Json
$context=Get-ServiceContext $ReleaseRoot $instance $ServiceId $descriptor.port $ExpectedManifestSha256
Assert-ServiceOwner $context $descriptor
if ($ValidateOnly -or !$PSCmdlet.ShouldProcess($instance,'Stop and uninstall owned service')) { return }
Assert-ServiceAdministrator
$uninstallGuard=$null
try{
$uninstallGuard=Enter-OwnedDataOperation $context
Assert-ServiceOwner $context (Get-Content -LiteralPath $context.marker -Raw -Encoding UTF8 | ConvertFrom-Json)
$existing=Get-Service -Name $ServiceId -ErrorAction SilentlyContinue
if ($existing) {
    if ($existing.Status -ne 'Stopped') {
        Invoke-ServiceNative 'stop' $context.wrapper @('stop')
        $existing.WaitForStatus([ServiceProcess.ServiceControllerStatus]::Stopped,[TimeSpan]::FromSeconds(50))
        $existing.Refresh()
        if($existing.Status -ne 'Stopped'){throw 'Owned service did not finish stopping'}
    }
    Invoke-ServiceNative 'uninstall' $context.wrapper @('uninstall')
    if (Get-Service -Name $ServiceId -ErrorAction SilentlyContinue) { throw 'Service still registered after uninstall' }
}
@{serviceId=$ServiceId;removed=$true;dataRetained=$true;nativeExitCodes=$script:ServiceNativeResults.ToArray()} | ConvertTo-Json -Depth 8

}finally{if($uninstallGuard){$uninstallGuard.Dispose()}}
