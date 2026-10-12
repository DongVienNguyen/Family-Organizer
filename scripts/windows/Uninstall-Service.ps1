[CmdletBinding(SupportsShouldProcess=$true)]
param([Parameter(Mandatory=$true)][string]$InstanceRoot,[string]$ServiceId='FamilyOrganizer',[switch]$ValidateOnly)
. (Join-Path $PSScriptRoot 'ServiceCommon.ps1')
$instance=Get-ServiceRoot $InstanceRoot
$marker=Join-Path $instance 'service/installation.json'
Assert-NoServiceReparse $marker
$descriptor=Get-Content -LiteralPath $marker -Raw | ConvertFrom-Json
$context=Get-ServiceContext $descriptor.releaseRoot $instance $ServiceId $descriptor.port $descriptor.manifestHash
Assert-ServiceOwner $context $descriptor
if ($ValidateOnly -or !$PSCmdlet.ShouldProcess($instance,'Stop and uninstall owned service')) { return }
Assert-ServiceAdministrator
$existing=Get-Service -Name $ServiceId -ErrorAction SilentlyContinue
if ($existing) {
    if ($existing.Status -ne 'Stopped') { Invoke-ServiceNative 'stop' $context.wrapper @('stop') }
    Invoke-ServiceNative 'uninstall' $context.wrapper @('uninstall')
    if (Get-Service -Name $ServiceId -ErrorAction SilentlyContinue) { throw 'Service still registered after uninstall' }
}
@{serviceId=$ServiceId;removed=$true;dataRetained=$true;nativeExitCodes=$script:ServiceNativeResults.ToArray()} | ConvertTo-Json -Depth 8
