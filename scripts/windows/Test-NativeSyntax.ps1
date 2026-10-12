[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$ReportPath)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
if($PSVersionTable.PSVersion.Major -ne 5 -or $PSVersionTable.PSEdition -ne 'Desktop'){throw 'Windows Desktop PowerShell5.1 parser required'}
$results=@()
foreach($file in Get-ChildItem -LiteralPath $PSScriptRoot -Filter '*.ps1' -File){
    $tokens=$null;$errors=$null
    $null=[Management.Automation.Language.Parser]::ParseFile($file.FullName,[ref]$tokens,[ref]$errors)
    $results+=@{file=$file.Name;errors=@($errors | ForEach-Object {$_.Message})}
}
@{hostVersion=$PSVersionTable.PSVersion.ToString();edition=$PSVersionTable.PSEdition;files=$results} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $ReportPath -Encoding UTF8
if(@($results | Where-Object {$_.errors.Count -ne 0}).Count -ne 0){throw 'Native PowerShell source parser rejected scripts'}
