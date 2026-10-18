$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$PSNativeCommandUseErrorActionPreference=$false
$script:ServiceNativeResults=New-Object System.Collections.Generic.List[object]
function Invoke-ServiceNative {
    param([string]$Phase,[string]$File,[string[]]$NativeArguments)
    $options=$env:NODE_OPTIONS;$nodePath=$env:NODE_PATH
    try {
        Remove-Item Env:NODE_OPTIONS,Env:NODE_PATH -ErrorAction SilentlyContinue
        & $File @NativeArguments | Out-Host
        $code=$LASTEXITCODE
    } finally {$env:NODE_OPTIONS=$options;$env:NODE_PATH=$nodePath}
    $script:ServiceNativeResults.Add(@{phase=$Phase;exitCode=$code})
    if ($code -ne 0) { throw "$Phase native exit $code" }
}
function Get-ServiceHash {
    param([string]$Path)
    # Windows PowerShell5.1 Get-FileHash can skip provider lookup under WhatIf.
    # Literal streaming reads always validate bytes, independently of ShouldProcess.
    $stream=[IO.File]::Open($Path,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
    $algorithm=$null
    try{$algorithm=[Security.Cryptography.SHA256]::Create();return ([BitConverter]::ToString($algorithm.ComputeHash($stream))).Replace('-','').ToLowerInvariant()}
    finally{if($algorithm){$algorithm.Dispose()};$stream.Dispose()}
}
function Assert-NoServiceReparse {
    param([string]$Path)
    # Read-only verification must still execute under the caller's WhatIf.
    $WhatIfPreference=$false
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
    # Read-only verification must still execute under the caller's WhatIf.
    $WhatIfPreference=$false
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
    # Read-only verification must still execute under the caller's WhatIf.
    $WhatIfPreference=$false
    if ($ServiceId -cnotmatch '^FamilyOrganizer(-[A-Za-z0-9]{1,48})?$' -or $Port -lt 1 -or $Port -gt 65535 -or $ExpectedManifestSha256 -cnotmatch '^[a-f0-9]{64}$') { throw 'Invalid owned service identity/evidence' }
    $release=Get-ServiceRoot $ReleaseRoot
    $instance=Get-ServiceRoot $InstanceRoot
    if ($release -ieq $instance -or $release.StartsWith($instance+'\',[StringComparison]::OrdinalIgnoreCase) -or $instance.StartsWith($release+'\',[StringComparison]::OrdinalIgnoreCase)) { throw 'Release and instance roots overlap' }
    $framework=Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full' -Name Release
    if ($framework.Release -lt 528040) { throw 'Supported NET Framework4.8 or later is required' }
    $manifestPath=Join-Path $release 'release-manifest.json'
    Assert-NoServiceReparse $manifestPath
    if ((Get-ServiceHash $manifestPath) -cne $ExpectedManifestSha256) { throw 'Trusted manifest hash mismatch' }
    $manifest=Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $node=Join-Path $release 'bin/node.exe'
    Assert-NoServiceReparse $node
    if ((Get-ServiceHash $node) -cne 'ba4e6d110e8c1592a1ecd390f6b05f3da124b13871a5be62b341a07a853c6c32') { throw 'Official bundled Node executable hash mismatch' }
    # Authenticate the import closure before executing any package helper code.
    $helperNames=@('verify-installed-service.mjs','verify-service-owner.mjs','write-service-config.mjs','package-files.mjs','package-contract.mjs','license-inventory.mjs','license-policy.mjs','reviewed-notices.mjs','service-config.mjs')
    # New packages import this helper; old authenticated packages retain their
    # original closure for rollback. Authenticate it before module evaluation.
    if (@($manifest.files | Where-Object { $_.path -ceq 'ops/wallet-pdf-license.mjs' }).Count -gt 0) { $helperNames+='wallet-pdf-license.mjs' }
    foreach ($name in $helperNames) {
        $relative='ops/'+$name
        $entries=@($manifest.files | Where-Object { $_.path -ceq $relative })
        $file=Join-Path $release $relative
        Assert-NoServiceReparse $file
        if ($entries.Count -ne 1 -or (Get-ServiceHash $file) -cne $entries[0].sha256) { throw 'Service helper import hash mismatch' }
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
    # Read-only verification must still execute under the caller's WhatIf.
    $WhatIfPreference=$false
    if ($Descriptor.format -ne 1 -or $Descriptor.serviceId -cne $Context.id -or $Descriptor.releaseRoot -ine $Context.release -or $Descriptor.instanceRoot -ine $Context.instance -or $Descriptor.manifestHash -cne $Context.manifestHash -or $Descriptor.port -ne $Context.port) { throw 'Existing service ownership/configuration mismatch' }
    foreach($critical in @($Context.instance,$Context.directory,$Context.marker,$Context.wrapper,$Context.xml,($Context.wrapper+'.config'))){Assert-ServiceMetadataAcl $critical}
    Assert-NoServiceReparse $Context.wrapper
    Assert-NoServiceReparse $Context.xml
    Assert-NoServiceReparse ($Context.wrapper+'.config')
    Invoke-ServiceNative 'owned-configuration' $Context.node @((Join-Path $Context.release 'ops/verify-service-owner.mjs'),$Context.release,$Context.instance,$Context.id,[string]$Context.port,$Context.xml,($Context.wrapper+'.config'))
    if ((Get-ServiceHash $Context.wrapper) -cne 'b5066b7bbdfba1293e5d15cda3caaea88fbeab35bd5b38c41c913d492aadfc4f' -or (Get-ServiceHash $Context.xml) -cne $Descriptor.xmlSha256) { throw 'Installed wrapper/configuration hash mismatch' }
    $service=Get-CimInstance Win32_Service -Filter "Name='$($Context.id)'"
    if ($service -and ($service.PathName.Trim('"') -ine $Context.wrapper -or $service.StartName -ine 'NT AUTHORITY\LocalService')) { throw 'Service registry ownership/account mismatch' }
}
function Get-ServiceTree {
    param([string]$Path)
    # Read-only verification must still execute under the caller's WhatIf.
    $WhatIfPreference=$false
    Assert-NoServiceReparse $Path
    $items=New-Object System.Collections.Generic.List[string]
    $pending=New-Object System.Collections.Generic.Stack[string]
    $pending.Push($Path)
    while($pending.Count -gt 0){
        $current=$pending.Pop()
        $item=Get-Item -LiteralPath $current -Force
        if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Owned service tree contains reparse point'}
        $items.Add($current)
        if($item.PSIsContainer){foreach($child in Get-ChildItem -LiteralPath $current -Force){$pending.Push($child.FullName)}}
    }
    return $items.ToArray()
}
function Assert-ServiceMetadataAcl {
    param([string]$Path)
    # Read-only verification must still execute under the caller's WhatIf.
    $WhatIfPreference=$false
    Assert-NoServiceReparse $Path
    $acl=Get-Acl -LiteralPath $Path
    $owner=$acl.GetOwner([Security.Principal.SecurityIdentifier]).Value
    if($owner -notin @('S-1-5-18','S-1-5-32-544')){throw 'Service metadata owner is not Administrator/SYSTEM'}
    if((Get-Item -LiteralPath $Path).PSIsContainer -and !$acl.AreAccessRulesProtected){throw 'Service metadata directory must have protected ACL'}
    $writes=[Security.AccessControl.FileSystemRights]'Write,Delete,DeleteSubdirectoriesAndFiles,ChangePermissions,TakeOwnership'
    foreach($rule in $acl.Access){
        $sid=$rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
        if($rule.AccessControlType -eq 'Allow' -and ($rule.FileSystemRights -band $writes) -and $sid -notin @('S-1-5-18','S-1-5-32-544')){throw 'Service metadata has an untrusted writer'}
    }
}
function Set-OwnedServiceAcl {
    param([string]$Path,[string]$ServiceId,[string]$Access)
    # Complete non-following preflight before ANY ACL mutation. Fresh DACLs remove
    # explicit grants as well as inherited grants; only these three principals remain.
    $items=@(Get-ServiceTree $Path)
    $sid=$null
    if($ServiceId){$sid=(New-Object Security.Principal.NTAccount('NT SERVICE',$ServiceId)).Translate([Security.Principal.SecurityIdentifier])}
    $rights=if($Access -eq 'M'){[Security.AccessControl.FileSystemRights]::Modify}else{[Security.AccessControl.FileSystemRights]::ReadAndExecute}
    foreach($file in $items){
        $directory=(Get-Item -LiteralPath $file -Force).PSIsContainer
        $acl=if($directory){New-Object Security.AccessControl.DirectorySecurity}else{New-Object Security.AccessControl.FileSecurity}
        $acl.SetAccessRuleProtection($true,$false)
        $acl.SetOwner((New-Object Security.Principal.SecurityIdentifier('S-1-5-32-544')))
        foreach($identity in @('S-1-5-18','S-1-5-32-544')){
            if($directory){$rule=New-Object Security.AccessControl.FileSystemAccessRule((New-Object Security.Principal.SecurityIdentifier($identity)),'FullControl','ContainerInherit,ObjectInherit','None','Allow')}
            else{$rule=New-Object Security.AccessControl.FileSystemAccessRule((New-Object Security.Principal.SecurityIdentifier($identity)),'FullControl','Allow')}
            $acl.AddAccessRule($rule)
        }
        if($sid){
            if($directory){$rule=New-Object Security.AccessControl.FileSystemAccessRule($sid,$rights,'ContainerInherit,ObjectInherit','None','Allow')}
            else{$rule=New-Object Security.AccessControl.FileSystemAccessRule($sid,$rights,'Allow')}
            $acl.AddAccessRule($rule)
        }
        Set-Acl -LiteralPath $file -AclObject $acl
    }
}

function Enter-OwnedDataOperation {
    param([hashtable]$Context)
    Assert-ServiceMetadataAcl $Context.marker
    # Protected existing per-instance metadata: allow ownership reads, but only
    # one ReadWrite claimant. No new lock file or marker bytes are written.
    try { return [IO.File]::Open($Context.marker,[IO.FileMode]::Open,[IO.FileAccess]::ReadWrite,[IO.FileShare]::Read) }
    catch [IO.IOException] { throw 'Owned operator operation already active' }
}

function Assert-BackupSecretAcl {
    param([string]$Path,[string]$ServiceId)
    $WhatIfPreference=$false
    Assert-ServiceMetadataAcl $Path
    $acl=Get-Acl -LiteralPath $Path
    if(!$acl.AreAccessRulesProtected){throw 'Backup secret DACL must be protected'}
    $sid=(New-Object Security.Principal.NTAccount('NT SERVICE',$ServiceId)).Translate([Security.Principal.SecurityIdentifier]).Value
    $seen=@{}
    foreach($rule in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])){
        $identity=$rule.IdentityReference.Value
        if($rule.IsInherited -or $rule.AccessControlType -ne 'Allow' -or $identity -notin @('S-1-5-18','S-1-5-32-544',$sid) -or $seen.ContainsKey($identity)){throw 'Backup secret has unexpected reader/rule'}
        $expected=if($identity -eq $sid){[Security.AccessControl.FileSystemRights]'ReadAndExecute,Synchronize'}else{[Security.AccessControl.FileSystemRights]::FullControl}
        if($rule.FileSystemRights -ne $expected){throw 'Backup secret access mismatch'}
        $seen[$identity]=$true
    }
    if($seen.Count -ne 3){throw 'Backup secret principal missing'}
}

function Assert-RecoveryCopyAncestors {
    param([string]$Path)
    Assert-ServiceAdministrator
    Assert-NoServiceReparse $Path
    # An ancestor may grant creation of a new child, but must not let an
    # untrusted principal replace an already protected destination directory.
    $trusted=@('S-1-5-18','S-1-5-32-544',([Security.Principal.WindowsIdentity]::GetCurrent().User.Value))
    $trusted+=((New-Object Security.Principal.NTAccount('NT SERVICE','TrustedInstaller')).Translate([Security.Principal.SecurityIdentifier]).Value)
    $replacement=[Security.AccessControl.FileSystemRights]'WriteData,WriteExtendedAttributes,WriteAttributes,Delete,DeleteSubdirectoriesAndFiles,ChangePermissions,TakeOwnership'
    $current=[IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($Path).TrimEnd('\'))
    while($current){
        $acl=Get-Acl -LiteralPath $current
        if($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -notin $trusted){throw 'Recovery copy ancestor has an untrusted owner'}
        foreach($rule in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])){
            if(($rule.PropagationFlags -band [Security.AccessControl.PropagationFlags]::InheritOnly) -ne 0){continue}
            if($rule.AccessControlType -eq 'Allow' -and ($rule.FileSystemRights -band $replacement) -and $rule.IdentityReference.Value -notin $trusted){throw 'Recovery copy ancestor has an untrusted replacement permission'}
        }
        $parent=[IO.Path]::GetDirectoryName($current)
        if($parent -eq $current){break};$current=$parent
    }
}

function Get-OwnedUpdateSnapshotFiles {
    param($Context)
    $file=Join-Path $Context.instance 'service/update-journal.json'
    if(!(Test-Path -LiteralPath $file)){return @()}
    Assert-ServiceMetadataAcl $file
    . (Join-Path $Context.release 'ops/UpdateCommon.ps1')
    $state=Invoke-OwnedUpdateNode $Context 'protected-snapshot-journal' (Join-Path $Context.release 'ops/update-journal.mjs') @($Context.instance,'read') $null
    $root=Join-Path $Context.instance 'backups'
    $result=New-Object 'System.Collections.Generic.HashSet[string]'
    foreach($row in @($state.journal.history)+@($state.journal.current)){
        if($row.PSObject.Properties['snapshot']){
            $snapshot=$row.snapshot
            if([IO.Path]::GetDirectoryName($snapshot.file) -ine $root -or [IO.Path]::GetFileName($snapshot.file) -cnotmatch '^recovery_[a-f0-9-]{36}\.fo-recovery$'){throw 'UPDATE_SNAPSHOT_PATH_INVALID'}
            Assert-ServiceMetadataAcl $snapshot.file
            if((Get-ServiceHash $snapshot.file) -cne $snapshot.sha256 -or (Get-Item -LiteralPath $snapshot.file).Length -ne $snapshot.bytes){throw 'UPDATE_SNAPSHOT_CHANGED'}
            [void]$result.Add($snapshot.file)
        }
    }
    return @($result)
}
function Protect-OwnedUpdateSnapshots {
    param([string[]]$Files)
    foreach($file in $Files){Set-OwnedServiceAcl $file '' 'RX';Assert-ServiceMetadataAcl $file}
}
