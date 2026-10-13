param([Parameter(Mandatory=$true)][string]$InputFile,[Parameter(Mandatory=$true)][string]$Destination,[ValidateRange(1,1073741824)][long]$MaxExpandedBytes=1073741824)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'Archive.ps1')
$opened=@()
try {
    if ((Get-Item -LiteralPath $InputFile).Length -gt 65536) { throw 'Extraction input exceeds budget' }
    $rows=@(Get-Content -LiteralPath $InputFile -Raw | ConvertFrom-Json)
    if ($rows.Count -ne 7) { throw 'Exactly seven archive inputs required' }
    $names=@{}
    [long]$totalDeclared=0
    [long]$entryCount=0
    foreach ($row in $rows) {
        if ($row.name -cnotmatch '^windows-(node22|node24|browsers|package|package-harness|package-tests|service-tests)-[a-f0-9]{40}-1$' -or $names.ContainsKey($row.name) -or $row.archiveSha256 -cnotmatch '^[a-f0-9]{64}$') { throw 'Archive input rejected' }
        $names[$row.name]=$true
        # Keeping all ZipArchive streams open prevents Windows writes/deletion
        # between checksum/preflight and extraction.
        $archive=[IO.Compression.ZipFile]::OpenRead($row.file)
        $opened+=@{archive=$archive;row=$row}
        if ((Get-FileHash -LiteralPath $row.file -Algorithm SHA256).Hash.ToLowerInvariant() -cne $row.archiveSha256 -or (Get-Item -LiteralPath $row.file).Length -ne $row.bytes) { throw 'Pinned archive bytes changed' }
        $entries=@(Get-VerifiedArchiveEntries $archive)
        foreach ($entry in $entries) { $totalDeclared+=$entry.Length;$entryCount++ }
        if ($totalDeclared -gt $MaxExpandedBytes -or $entryCount -gt 100000) { throw 'Batch extraction budget exceeded' }
    }
    [long]$totalWritten=0
    $results=@()
    $buffer=New-Object byte[] 65536
    foreach ($item in $opened) {
        $targetRoot=Join-Path $Destination $item.row.name
        if (Test-Path -LiteralPath $targetRoot) { throw 'Archive destination must be fresh' }
        New-Item -ItemType Directory -Path $targetRoot | Out-Null
        [long]$archiveWritten=0
        [int]$files=0
        foreach ($entry in $item.archive.Entries) {
            $target=Join-Path $targetRoot $entry.FullName.Replace('/',[IO.Path]::DirectorySeparatorChar)
            if ($entry.FullName.EndsWith('/')) { New-Item -ItemType Directory -Path $target -Force | Out-Null;continue }
            New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($target)) -Force | Out-Null
            for ($parent=[IO.Path]::GetDirectoryName($target);$parent;$parent=[IO.Path]::GetDirectoryName($parent)) {
                if (((Get-Item -LiteralPath $parent -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Linked extraction parent rejected' }
            }
            $source=$entry.Open()
            try {
                $output=[IO.File]::Open($target,[IO.FileMode]::CreateNew)
                try {
                    [long]$written=0
                    while (($count=$source.Read($buffer,0,$buffer.Length)) -gt 0) {
                        if ($written+$count -gt $entry.Length -or $written+$count -gt 134217728 -or $totalWritten+$count -gt $MaxExpandedBytes) { throw 'Actual extraction exceeds budget' }
                        $output.Write($buffer,0,$count);$written+=$count;$totalWritten+=$count;$archiveWritten+=$count
                    }
                    if ($written -ne $entry.Length) { throw 'Actual expansion differs from declaration' }
                } finally { $output.Dispose() }
            } finally { $source.Dispose() }
            $files++
        }
        $results+=@{artifactId=$item.row.artifactId;name=$item.row.name;files=$files;expandedBytes=$archiveWritten}
    }
    @{archives=$results;expandedBytes=$totalWritten;entryCount=$entryCount;exitCode=0} | ConvertTo-Json -Depth 5 -Compress
    exit 0
} catch { Write-Output 'RELEASE_REPORT_EXTRACTION_REJECTED';exit 1 }
finally { foreach ($item in $opened) { $item.archive.Dispose() } }
