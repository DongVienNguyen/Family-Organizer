param([Parameter(Mandatory=$true)][string]$ReportPath)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'Archive.ps1')
Add-Type -AssemblyName System.IO.Compression.FileSystem
$fixture=Join-Path $env:TEMP ('fo-archive-contract-'+[guid]::NewGuid())
New-Item -ItemType Directory -Path $fixture | Out-Null
$results=@()
try {
    $cases=@('../outside','/outside','C:/outside','app\outside','app/file:stream','app/CON.txt','app/NUL','app/file.','app/file ','app//file','app/./file','app/../file','app/COM1.log','app/LPT9.log','case-alias','file-parent','symlink','reparse','bomb')
    foreach ($case in $cases) {
        $zipPath=Join-Path $fixture ([guid]::NewGuid().ToString()+'.zip')
        $zip=[IO.Compression.ZipFile]::Open($zipPath,[IO.Compression.ZipArchiveMode]::Create)
        try {
            if ($case -eq 'case-alias') { $zip.CreateEntry('app/file') | Out-Null; $zip.CreateEntry('APP/FILE') | Out-Null }
            elseif ($case -eq 'file-parent') { $zip.CreateEntry('app') | Out-Null; $zip.CreateEntry('app/file') | Out-Null }
            else {
                $name=if ($case -in @('symlink','reparse','bomb')) {'app/file'} else {$case}
                $entry=$zip.CreateEntry($name)
                if ($case -eq 'symlink') { $entry.ExternalAttributes=-1610612736 }
                elseif ($case -eq 'reparse') { $entry.ExternalAttributes=1024 }
                elseif ($case -eq 'bomb') { $stream=$entry.Open(); try { $stream.Write((New-Object byte[] 2097152),0,2097152) } finally { $stream.Dispose() } }
            }
        } finally { $zip.Dispose() }
        $target=Join-Path $fixture ([guid]::NewGuid().ToString())
        $rejected=$false
        try { Expand-VerifiedArchive $zipPath $target } catch { $rejected=$true }
        if (!$rejected -or (Test-Path -LiteralPath $target)) { throw "Unsafe archive accepted or wrote files: $case" }
        $results+=@{case=$case;rejected=$true;noFilesWritten=$true}
    }
    $safeZip=Join-Path $fixture 'safe.zip'
    $zip=[IO.Compression.ZipFile]::Open($safeZip,[IO.Compression.ZipArchiveMode]::Create)
    try { $entry=$zip.CreateEntry('app/dữ liệu with spaces.txt'); $writer=New-Object IO.StreamWriter($entry.Open()); try {$writer.Write('synthetic')}finally{$writer.Dispose()} } finally {$zip.Dispose()}
    $safe=Join-Path $fixture 'safe'
    Expand-VerifiedArchive $safeZip $safe
    if ((Get-Content -LiteralPath (Join-Path $safe 'app/dữ liệu with spaces.txt') -Raw) -cne 'synthetic') { throw 'Safe Unicode archive failed' }
    @{powershell=$PSVersionTable.PSVersion.ToString();rejected=$results;safeUnicodeExtract=$true} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $ReportPath -Encoding utf8
} finally { Remove-Item -LiteralPath $fixture -Recurse -Force }
