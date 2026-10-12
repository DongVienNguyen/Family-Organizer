# Preflight every entry before writing any extracted file. Compatible with Windows PowerShell 5.1.
function Get-VerifiedArchiveEntries {
    param([System.IO.Compression.ZipArchive]$Archive)
    if ($Archive.Entries.Count -eq 0 -or $Archive.Entries.Count -gt 100000) { throw 'Missing or excessive ZIP entries' }
    $names = @{}
    [long]$total = 0
    foreach ($entry in $Archive.Entries) {
        $name = $entry.FullName
        if ([string]::IsNullOrEmpty($name) -or $name.Length -gt 1024 -or $name.Contains('\') -or $name.Normalize() -cne $name) { throw 'Unsafe ZIP path' }
        $directory = $name.EndsWith('/')
        $key = $name.TrimEnd('/').ToLowerInvariant()
        foreach ($part in $name.TrimEnd('/').Split('/')) {
            if (!$part -or $part -eq '.' -or $part -eq '..' -or $part.Length -gt 255 -or $part -match '[<>:"|?*\x00-\x1f]' -or $part -match '[. ]$' -or $part -match '^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)') { throw 'Unsafe ZIP path' }
        }
        if ($names.ContainsKey($key)) { throw 'Duplicate or aliased ZIP entry' }
        $names[$key] = $directory
        if ($entry.Length -lt 0 -or $entry.Length -gt 134217728 -or $entry.CompressedLength -lt 0 -or $entry.CompressedLength -gt 536870912) { throw 'ZIP size exceeds budget' }
        if ($entry.Length -gt 1048576 -and $entry.Length / [Math]::Max(1, $entry.CompressedLength) -gt 500) { throw 'ZIP expansion ratio exceeds budget' }
        if (($entry.ExternalAttributes -band 0xF0000000L) -eq 0xA0000000L -or ($entry.ExternalAttributes -band 1024) -ne 0) { throw 'ZIP symlink/reparse entry' }
        if ($directory -and $entry.Length -ne 0) { throw 'Nonempty ZIP directory' }
        $total += $entry.Length
    }
    if ($total -gt 1073741824) { throw 'ZIP expanded size exceeds budget' }
    foreach ($key in $names.Keys) {
        $parent = $key
        while ($parent.Contains('/')) {
            $parent = $parent.Substring(0, $parent.LastIndexOf('/'))
            if ($names.ContainsKey($parent) -and !$names[$parent]) { throw 'ZIP file owns descendant paths' }
        }
    }
    return $Archive.Entries
}
function Expand-VerifiedArchive {
    param([string]$ZipPath, [string]$Destination)
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    if (Test-Path -LiteralPath $Destination) { throw 'Extraction destination must not exist' }
    $archive = [System.IO.Compression.ZipFile]::OpenRead($ZipPath)
    try {
        $entries = @(Get-VerifiedArchiveEntries $archive)
        New-Item -ItemType Directory -Path $Destination | Out-Null
        foreach ($entry in $entries) {
            $target = Join-Path $Destination $entry.FullName.Replace('/', [IO.Path]::DirectorySeparatorChar)
            if ($entry.FullName.EndsWith('/')) { New-Item -ItemType Directory -Path $target -Force | Out-Null; continue }
            New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($target)) -Force | Out-Null
            $source = $entry.Open()
            $output = [IO.File]::Open($target, [IO.FileMode]::CreateNew)
            try { $source.CopyTo($output) } finally { $output.Dispose(); $source.Dispose() }
            if ((Get-Item -LiteralPath $target).Length -ne $entry.Length) { throw 'Extracted size differs from ZIP' }
        }
    } finally { $archive.Dispose() }
}
