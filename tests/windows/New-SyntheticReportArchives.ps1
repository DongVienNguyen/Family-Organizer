param([Parameter(Mandatory=$true)][string]$Root,[Parameter(Mandatory=$true)][string]$CommitSha)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
Add-Type -AssemblyName System.IO.Compression
if ($CommitSha -cnotmatch '^[a-f0-9]{40}$') { throw 'Synthetic identity rejected' }
$prefixes=@('windows-node22','windows-node24','windows-browsers','windows-package','windows-package-harness','windows-package-tests','windows-service-tests','windows-productivity-browsers')
for ($index=0;$index -lt $prefixes.Count;$index++) {
    $file=Join-Path $Root (($index+1).ToString()+'.zip')
    $stream=[IO.File]::Open($file,[IO.FileMode]::CreateNew)
    try {
        $zip=[IO.Compression.ZipArchive]::new($stream,[IO.Compression.ZipArchiveMode]::Create,$true)
        try {
            $entry=$zip.CreateEntry('synthetic dữ liệu with spaces.json')
            $writer=[IO.StreamWriter]::new($entry.Open(),[Text.UTF8Encoding]::new($false))
            try { $writer.Write('SYNTHETIC_REPORT_DATA'*10) } finally { $writer.Dispose() }
        } finally { $zip.Dispose() }
    } finally { $stream.Dispose() }
}
Write-Output 'EIGHT_SYNTHETIC_ARCHIVES_CREATED'
exit 0
