param([Parameter(Mandatory=$true)][string]$Root)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
Add-Type -AssemblyName System.IO.Compression
foreach ($name in @('positive','unsafe')) {
    $stream=[IO.File]::Open((Join-Path $Root ($name+'.zip')),[IO.FileMode]::CreateNew)
    try {
        $zip=[IO.Compression.ZipArchive]::new($stream,[IO.Compression.ZipArchiveMode]::Create,$true)
        try {
            $entry=$zip.CreateEntry($(if ($name -eq 'positive'){'synthetic dữ liệu with spaces.txt'}else{'../outside-sentinel'}))
            $output=$entry.Open()
            try {$bytes=[Text.Encoding]::UTF8.GetBytes('SYNTHETIC_INNER_DATA');$output.Write($bytes,0,$bytes.Length)} finally {$output.Dispose()}
        } finally {$zip.Dispose()}
    } finally {$stream.Dispose()}
}
exit 0
