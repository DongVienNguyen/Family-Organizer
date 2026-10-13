param([Parameter(Mandatory=$true)][string]$CertificatePath)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
try {
    $certificate=[System.Security.Cryptography.X509Certificates.X509Certificate2]::new($CertificatePath)
    try { $fingerprint=$certificate.Thumbprint } finally { $certificate.Dispose() }
    $observations=@()
    foreach ($location in @('CurrentUser','LocalMachine')) {
        $store=[System.Security.Cryptography.X509Certificates.X509Store]::new('Root',[System.Security.Cryptography.X509Certificates.StoreLocation]::$location)
        try {
            $store.Open([System.Security.Cryptography.X509Certificates.OpenFlags]::ReadOnly)
            $matches=@($store.Certificates | Where-Object { $_.Thumbprint -ceq $fingerprint }).Count
            $observations+=@{location=$location;name='Root';matchingCertificates=$matches}
        } finally { $store.Close();$store.Dispose() }
    }
    @{fingerprintSha1=$fingerprint;stores=$observations;exitCode=0} | ConvertTo-Json -Depth 4 -Compress
    exit 0
} catch { Write-Output 'CADDY_TRUST_OBSERVATION_REJECTED';exit 1 }
