$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$PSNativeCommandUseErrorActionPreference=$false
$script:ServiceNativeResults=New-Object System.Collections.Generic.List[object]
function Invoke-ServiceNative {
    param([string]$Phase,[string]$File,[string[]]$NativeArguments)
    & $File @NativeArguments | Out-Host
    $code=$LASTEXITCODE
    $script:ServiceNativeResults.Add(@{phase=$Phase;exitCode=$code})
    if ($code -ne 0) { throw "$Phase native exit $code" }
}
function Assert-NoServiceReparse {
    param([string]$Path)
    $current=[IO.Path]::GetFullPath($Path)
    while ($current) {
        if (Test-Path -LiteralPath $current) {
            if ((Get-Item -LiteralPath $current -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Service path contains reparse point' }
        }
        $parent=[IO.Path]::GetDirectoryName($current)
        if ($parent -eq $current) { break }
        $current=$parent
    }
}
function Get-ServiceRoot {
    param([string]$Path)
    if ($Path -notmatch '^[A-Za-z]:[\\/]' -or $Path.Contains('%') -or $Path.Normalize() -cne $Path) { throw 'Literal fully qualified local service path required' }
    $tail=$Path.Substring(3).Replace('/','\').TrimEnd('\')
    foreach ($part in $tail.Split('\')) {
        if (!$part -or $part -in @('.','..') -or $part -match '[<>:"|?*\x00-\x1f]' -or $part -match '[. ]$' -or $part -match '^(con|prn|aux|nul|com[1-9\u00b9\u00b2\u00b3]|lpt[1-9\u00b9\u00b2\u00b3])(\.|$)') { throw 'Unsafe service root' }
    }
    $resolved=[IO.Path]::GetFullPath($Path).TrimEnd('\')
    if ($resolved -match '^[A-Za-z]:\\(Windows|ProgramData|Program Files( \(x86\))?|Users)$') { throw 'System root cannot be service root' }
    Assert-NoServiceReparse $resolved
    return $resolved
}
function Get-ServiceContext {
    param([string]$ReleaseRoot,[string]$InstanceRoot,[string]$ServiceId,[int]$Port,[string]$ExpectedManifestSha256)
    if ($ServiceId -cnotmatch '^FamilyOrganizer(-[A-Za-z0-9]{1,48})?$' -or $Port -lt 1 -or $Port -gt 65535 -or $ExpectedManifestSha256 -cnotmatch '^[a-f0-9]{64}$') { throw 'Invalid owned service identity/evidence' }
    $release=Get-ServiceRoot $ReleaseRoot
    $instance=Get-ServiceRoot $InstanceRoot
    if ($release -ieq $instance -or $release.StartsWith($instance+'\',[StringComparison]::OrdinalIgnoreCase) -or $instance.StartsWith($release+'\',[StringComparison]::OrdinalIgnoreCase)) { throw 'Release and instance roots overlap' }
    $framework=Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full' -Name Release
    if ($framework.Release -lt 528040) { throw 'Supported NET Framework4.8 or later is required' }
    $manifestPath=Join-Path $release 'release-manifest.json'
    Assert-NoServiceReparse $manifestPath
    if ((Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $ExpectedManifestSha256) { throw 'Trusted manifest hash mismatch' }
    $manifest=Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    $node=Join-Path $release 'bin/node.exe'
    Assert-NoServiceReparse $node
    if ((Get-FileHash -LiteralPath $node -Algorithm SHA256).Hash.ToLowerInvariant() -cne 'ba4e6d110e8c1592a1ecd390f6b05f3da124b13871a5be62b341a07a853c6c32') { throw 'Official bundled Node executable hash mismatch' }
    # Authenticate the import closure before executing any package helper code.
    foreach ($name in @('verify-installed-service.mjs','write-service-config.mjs','package-files.mjs','package-contract.mjs','license-inventory.mjs','license-policy.mjs','reviewed-notices.mjs','service-config.mjs')) {
        $relative='ops/'+$name
        $entries=@($manifest.files | Where-Object { $_.path -ceq $relative })
        $file=Join-Path $release $relative
        Assert-NoServiceReparse $file
        if ($entries.Count -ne 1 -or (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -cne $entries[0].sha256) { throw 'Service helper import hash mismatch' }
    }
    Invoke-ServiceNative 'package-validation' $node @((Join-Path $release 'ops/verify-installed-service.mjs'),$release,$manifest.commitSha,$manifest.appVersion)
    return @{release=$release;instance=$instance;id=$ServiceId;port=$Port;node=$node;manifestHash=$ExpectedManifestSha256;commitSha=$manifest.commitSha;frameworkRelease=$framework.Release;directory=(Join-Path $instance 'service');wrapper=(Join-Path $instance "service/$ServiceId.exe");xml=(Join-Path $instance "service/$ServiceId.xml");marker=(Join-Path $instance 'service/installation.json')}
}
function Assert-ServiceAdministrator {
    $identity=[Security.Principal.WindowsIdentity]::GetCurrent()
    $principal=New-Object Security.Principal.WindowsPrincipal($identity)
    if (!$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Service mutation requires elevated Administrator' }
}
function Assert-ServiceOwner {
    param($Context,$Descriptor)
    if ($Descriptor.format -ne 1 -or $Descriptor.serviceId -cne $Context.id -or $Descriptor.releaseRoot -ine $Context.release -or $Descriptor.instanceRoot -ine $Context.instance -or $Descriptor.manifestHash -cne $Context.manifestHash -or $Descriptor.port -ne $Context.port) { throw 'Existing service ownership/configuration mismatch' }
    Assert-NoServiceReparse $Context.wrapper
    Assert-NoServiceReparse $Context.xml
    if ((Get-FileHash -LiteralPath $Context.wrapper -Algorithm SHA256).Hash.ToLowerInvariant() -cne 'b5066b7bbdfba1293e5d15cda3caaea88fbeab35bd5b38c41c913d492aadfc4f' -or (Get-FileHash -LiteralPath $Context.xml -Algorithm SHA256).Hash.ToLowerInvariant() -cne $Descriptor.xmlSha256) { throw 'Installed wrapper/configuration hash mismatch' }
    $service=Get-CimInstance Win32_Service -Filter "Name='$($Context.id)'"
    if ($service -and ($service.PathName.Trim('"') -ine $Context.wrapper -or $service.StartName -ine 'NT AUTHORITY\LocalService')) { throw 'Service registry ownership/account mismatch' }
}
function Set-OwnedServiceAcl {
    param([string]$Path,[string]$ServiceId,[string]$Access)
    Invoke-ServiceNative 'acl' (Join-Path $env:windir 'System32/icacls.exe') @($Path,'/inheritance:r','/grant:r','*S-1-5-18:(OI)(CI)F','*S-1-5-32-544:(OI)(CI)F',"NT SERVICE\${ServiceId}:(OI)(CI)$Access",'/T','/Q')
}
