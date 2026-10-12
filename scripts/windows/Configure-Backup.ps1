[CmdletBinding(SupportsShouldProcess=$true)]
param([Parameter(Mandatory=$true)][string]$ReleaseRoot,[Parameter(Mandatory=$true)][string]$InstanceRoot,[Parameter(Mandatory=$true)][string]$ExpectedManifestSha256,[ValidateSet('Enable','Disable')][string]$Operation='Enable',[string]$ServiceId='FamilyOrganizer',[ValidateRange(1,65535)][int]$Port=3000,[switch]$ValidateOnly)
. (Join-Path $PSScriptRoot 'ServiceCommon.ps1')
$context=Get-ServiceContext $ReleaseRoot $InstanceRoot $ServiceId $Port $ExpectedManifestSha256
Assert-ServiceMetadataAcl $context.marker
$descriptor=Get-Content -LiteralPath $context.marker -Raw -Encoding UTF8 | ConvertFrom-Json
Assert-ServiceOwner $context $descriptor
$service=Get-Service -Name $ServiceId -ErrorAction Stop
if($service.Status -ne 'Stopped'){throw 'Backup configuration requires the owned service stopped'}
$backupRoot=Join-Path $context.instance 'backups'
$keyFile=Join-Path $context.instance 'config/recovery-backup.key'
$configFile=Join-Path $context.instance 'config/recovery-backup.json'
foreach($file in @($backupRoot,$keyFile,$configFile)){Assert-NoServiceReparse $file}
foreach($file in @($keyFile,$configFile)){if(Test-Path -LiteralPath $file){Assert-ServiceMetadataAcl $file}}
if($ValidateOnly -or !$PSCmdlet.ShouldProcess($context.instance,'Configure one owned encrypted backup schedule')){return}
Assert-ServiceAdministrator
$operationGuard=$null;$inputStream=$null;$memory=New-Object IO.MemoryStream
$keyBytes=$null;$oldKeyBytes=$null;$readBuffer=$null;$decodeBytes=$null;$request=$null;$decodedText=$null
$stage=$configFile+'.tmp-'+[guid]::NewGuid().ToString('N')
$oldConfig=$stage+'.old'
$keyCreated=$false;$keyReady=$false;$configurationPhase='guard'
function Write-BackupDurable {
    param([string]$File,[byte[]]$Bytes,[IO.FileMode]$Mode)
    $stream=New-Object IO.FileStream($File,$Mode,[IO.FileAccess]::Write,[IO.FileShare]::None,4096,[IO.FileOptions]::WriteThrough)
    try{$stream.Write($Bytes,0,$Bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
}
try{
    $operationGuard=Enter-OwnedDataOperation $context
    if($Operation -eq 'Enable'){
        $configurationPhase='input';$inputStream=[Console]::OpenStandardInput();$readBuffer=New-Object byte[] 4096
        $deadline=[DateTime]::UtcNow.AddSeconds(20)
        while($true){
            $remaining=[int][Math]::Max(0,($deadline-[DateTime]::UtcNow).TotalMilliseconds)
            $read=$inputStream.ReadAsync($readBuffer,0,$readBuffer.Length)
            if(!$read.Wait($remaining)){throw 'Backup input timeout'}
            $count=$read.Result;if($count -eq 0){break}
            if($memory.Length+$count -gt 16384){throw 'Backup input limit'}
            $memory.Write($readBuffer,0,$count)
        }
        $decoder=New-Object Text.UTF8Encoding($false,$true)
        $decodeBytes=$memory.ToArray();$decodedText=$decoder.GetString($decodeBytes).TrimStart([char]0xFEFF)
        $request=$decodedText | ConvertFrom-Json
        $configurationPhase='shape';$names=@($request.PSObject.Properties.Name | Sort-Object)
        if(($names -join ',') -cne 'includeCredentials,includeEnv,includeFiles,includeSettings,key'){throw 'Backup input shape'}
        if($request.includeCredentials -isnot [bool] -or !$request.includeCredentials -or $request.key -isnot [string] -or $request.key -cnotmatch '^[a-f0-9]{64}$'){throw 'Backup input invalid'}
        $configurationPhase='groups';foreach($spec in @(@('includeSettings',@('gemini','telegram')),@('includeFiles',@('sessionSigningKey')),@('includeEnv',@('gemini','vapid')))){
            $groups=$request.($spec[0]);$allowed=@($spec[1])
            if($groups -isnot [array] -or $groups.Count -gt $allowed.Count -or @($groups | Sort-Object -Unique).Count -ne $groups.Count){throw 'Backup group shape'}
            foreach($group in $groups){if($group -isnot [string] -or $group -cnotin $allowed){throw 'Backup group invalid'}}
        }
        $configurationPhase='key';$keyBytes=New-Object byte[] 32
        for($index=0;$index -lt 32;$index++){$keyBytes[$index]=[Convert]::ToByte($request.key.Substring(2*$index,2),16)}
        if(Test-Path -LiteralPath $keyFile){
            $stream=[IO.File]::Open($keyFile,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
            try{
                if($stream.Length -ne 32){throw 'Existing backup key invalid'}
                $oldKeyBytes=New-Object byte[] 32;$offset=0
                while($offset -lt 32){$count=$stream.Read($oldKeyBytes,$offset,32-$offset);if($count -le 0){throw 'Existing backup key truncated'};$offset+=$count}
                if($stream.ReadByte() -ne -1){throw 'Existing backup key grew'}
            }finally{$stream.Dispose()}
            $difference=0;for($index=0;$index -lt 32;$index++){$difference=$difference -bor ($keyBytes[$index] -bxor $oldKeyBytes[$index])}
            if($difference -ne 0){throw 'Changing an existing recovery key is forbidden'}
            Set-OwnedServiceAcl $keyFile $ServiceId 'R'
        }else{
            if(Test-Path -LiteralPath $backupRoot){if(@(Get-ChildItem -LiteralPath $backupRoot -Filter '*.fo-recovery' -Force).Count -gt 0){throw 'Existing ciphertext requires its original recovery key'}}
            # Create the final key name with its protected read-only service DACL
            # before writing any key bytes. A complete retained key can be retried.
            Write-BackupDurable $keyFile ([byte[]]@()) ([IO.FileMode]::CreateNew);$keyCreated=$true
            $configurationPhase='key-publish';Set-OwnedServiceAcl $keyFile $ServiceId 'R'
            Write-BackupDurable $keyFile $keyBytes ([IO.FileMode]::Open);$keyReady=$true
        }
        if(!(Test-Path -LiteralPath $backupRoot)){New-Item -ItemType Directory -Path $backupRoot | Out-Null}
        if(!(Get-Item -LiteralPath $backupRoot).PSIsContainer){throw 'Backup output is not a directory'}
        $configurationPhase='output-acl';Set-OwnedServiceAcl $backupRoot $ServiceId 'M'
        $configuration=@{format=1;enabled=$true;backupRoot=$backupRoot;keyFile=$keyFile;includeCredentials=$true;includeSettings=@($request.includeSettings | Sort-Object);includeFiles=@($request.includeFiles | Sort-Object);includeEnv=@($request.includeEnv | Sort-Object)}
    }else{$configuration=@{format=1;enabled=$false}}
    $configurationPhase='config-publish';$text=$configuration | ConvertTo-Json -Depth 4 -Compress
    $bytes=[Text.Encoding]::UTF8.GetBytes($text)
    try{Write-BackupDurable $stage $bytes ([IO.FileMode]::CreateNew)}finally{[Array]::Clear($bytes,0,$bytes.Length)}
    Set-OwnedServiceAcl $stage $ServiceId 'R'
    $configurationPhase='config-replace'
    if(Test-Path -LiteralPath $configFile){[IO.File]::Replace($stage,$configFile,$oldConfig)}else{[IO.File]::Move($stage,$configFile)}
    $configurationPhase='config-seal';Set-OwnedServiceAcl $configFile $ServiceId 'R'
    Assert-BackupSecretAcl $configFile $ServiceId
    if(Test-Path -LiteralPath $keyFile){Assert-BackupSecretAcl $keyFile $ServiceId}
    @{configured=$true;enabled=($Operation -eq 'Enable');keyReplaced=$false} | ConvertTo-Json -Compress
}catch{throw ('RECOVERY_BACKUP_CONFIGURATION_FAILED ('+$configurationPhase+';hresult='+$_.Exception.HResult+')')}
finally{
    try{
        try{foreach($file in @($stage,$oldConfig)){if(Test-Path -LiteralPath $file){Remove-Item -LiteralPath $file -Force}}}
        finally{try{if($keyCreated -and !$keyReady -and (Test-Path -LiteralPath $keyFile)){Remove-Item -LiteralPath $keyFile -Force}}finally{
        foreach($buffer in @($keyBytes,$oldKeyBytes,$readBuffer,$decodeBytes)){if($buffer){[Array]::Clear($buffer,0,$buffer.Length)}}
        if($request -and $request.PSObject.Properties['key']){$request.key=$null};$request=$null;$decodedText=$null
        if($memory.Length -gt 0){$owned=$memory.GetBuffer();[Array]::Clear($owned,0,$owned.Length)}
        }}
    }finally{try{$memory.Dispose();if($inputStream){$inputStream.Dispose()}}finally{if($operationGuard){$operationGuard.Dispose()}}}
}
