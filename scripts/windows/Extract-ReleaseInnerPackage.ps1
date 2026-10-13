param([Parameter(Mandatory=$true)][string]$ArchivePath,[Parameter(Mandatory=$true)][string]$ArchiveSha256,[Parameter(Mandatory=$true)][long]$ArchiveBytes,[Parameter(Mandatory=$true)][string]$Destination)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'Archive.ps1')
$stream=$null;$archive=$null
try {
    if ($ArchiveSha256 -cnotmatch '^[a-f0-9]{64}$' -or $ArchiveBytes -le 0 -or $ArchiveBytes -gt 67108864 -or (Test-Path -LiteralPath $Destination)) { throw 'Inner input rejected' }
    foreach ($leaf in @($ArchivePath,[IO.Path]::GetDirectoryName($Destination))) {
        for ($current=$leaf;$current;$current=[IO.Path]::GetDirectoryName($current)) {
            if (((Get-Item -LiteralPath $current -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Linked inner parent rejected' }
        }
    }
    # One descriptor holds the original ZIP against Windows writes/deletion
    # through checksum, preflight and extraction. No package code is executed.
    $stream=[IO.File]::Open($ArchivePath,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
    if ($stream.Length -ne $ArchiveBytes) { throw 'Inner size changed' }
    $algorithm=[Security.Cryptography.SHA256]::Create()
    try {$actual=([BitConverter]::ToString($algorithm.ComputeHash($stream))).Replace('-','').ToLowerInvariant()} finally {$algorithm.Dispose()}
    if ($actual -cne $ArchiveSha256) { throw 'Inner bytes changed' }
    $stream.Position=0
    $archive=[IO.Compression.ZipArchive]::new($stream,[IO.Compression.ZipArchiveMode]::Read,$true)
    $entries=@(Get-VerifiedArchiveEntries $archive)
    New-Item -ItemType Directory -Path $Destination | Out-Null
    [long]$total=0;[int]$files=0;$buffer=New-Object byte[] 65536
    foreach ($entry in $entries) {
        $target=Join-Path $Destination $entry.FullName.Replace('/',[IO.Path]::DirectorySeparatorChar)
        if ($entry.FullName.EndsWith('/')) {New-Item -ItemType Directory -Path $target -Force|Out-Null;continue}
        New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($target)) -Force|Out-Null
        for ($current=[IO.Path]::GetDirectoryName($target);$current;$current=[IO.Path]::GetDirectoryName($current)) {
            if (((Get-Item -LiteralPath $current -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Linked inner output parent rejected' }
        }
        $source=$entry.Open()
        try {
            $output=[IO.File]::Open($target,[IO.FileMode]::CreateNew)
            try {
                [long]$written=0
                while (($count=$source.Read($buffer,0,$buffer.Length)) -gt 0) {
                    if ($written+$count -gt $entry.Length -or $written+$count -gt 134217728 -or $total+$count -gt 1073741824) {throw 'Inner expansion exceeds budget'}
                    $output.Write($buffer,0,$count);$written+=$count;$total+=$count
                }
                if ($written -ne $entry.Length) {throw 'Inner declared length changed'}
            }finally{$output.Dispose()}
        }finally{$source.Dispose()}
        $files++
    }
    @{exitCode=0;archiveSha256=$actual;archiveBytes=$stream.Length;entryCount=$entries.Count;files=$files;expandedBytes=$total} | ConvertTo-Json -Compress
    exit 0
}catch{Write-Output 'RELEASE_INNER_EXTRACTION_REJECTED';exit 1}
finally {if ($archive){$archive.Dispose()};if ($stream){$stream.Dispose()}}
