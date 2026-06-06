param(
    [string]$Code = "999000"
)

$AppUrl = $env:APP_URL
if ([string]::IsNullOrEmpty($AppUrl)) {
    $AppUrl = "https://localhost:3000"
}

$uri = "$AppUrl/api/scan"
# Example barcodes: 999123 (Club Mate), 999456 (Cola), 999789 (Water), 999000 (Beer)
$body = @{ barcode = $Code } | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri $uri -Method Post -Body $body -ContentType "application/json"
    Write-Host "`nSuccessfully scanned barcode: $Code" -ForegroundColor Green
    $response | Format-List
} catch {
    Write-Host "`nFailed to scan barcode: $Code" -ForegroundColor Red
    Write-Host $_.Exception.Message
}

