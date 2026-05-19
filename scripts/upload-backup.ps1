<#
.SYNOPSIS
  Upload a JSON backup to /api/import-backup on the server.
.PARAMETER ServerUrl
  Base URL of the server (e.g. https://meu-crm.com)
.PARAMETER Token
  Master user token (Bearer)
.PARAMETER FilePath
  Path to the local JSON backup file
.PARAMETER Clear
  If present, adds ?clear=true to the request
.EXAMPLE
  .\upload-backup.ps1 -ServerUrl 'https://meu-crm.com' -Token 'TOKEN_MASTER' -FilePath '.\\crm-energia-backup.json' -Clear
#>
param(
    [Parameter(Mandatory=$true)][string]$ServerUrl,
    [Parameter(Mandatory=$true)][string]$Token,
    [Parameter(Mandatory=$true)][string]$FilePath,
    [switch]$Clear
)

if (-not (Test-Path $FilePath)) {
    Write-Error "File not found: $FilePath"
    exit 2
}

$ServerUrl = $ServerUrl.TrimEnd('/')
$Uri = "$ServerUrl/api/import-backup"
if ($Clear) { $Uri = "$Uri?clear=true" }

Write-Host "Uploading $FilePath to $Uri"

$Headers = @{ Authorization = "Bearer $Token" }
try {
    $response = Invoke-RestMethod -Uri $Uri -Method Post -Headers $Headers -ContentType 'application/json' -InFile $FilePath -ErrorAction Stop
    Write-Host "Server response:`n" ($response | ConvertTo-Json -Depth 5)
} catch {
    Write-Error "Upload failed: $($_.Exception.Message)"
    exit 1
}

Write-Host "Upload finished successfully."
