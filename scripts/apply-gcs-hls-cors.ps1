#Requires -Version 5.1
<#
  One-shot: apply HLS CORS to the processed-videos GCS bucket.
  Prereqs: gcloud SDK (gsutil), authenticated: gcloud auth login
  Usage (from repo root):
    .\server\scripts\apply-gcs-hls-cors.ps1
    .\server\scripts\apply-gcs-hls-cors.ps1 -Bucket "vixhunter-processed-videos"
#>
param(
  [string] $Bucket = "vixhunter-processed-videos"
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$corsFile = Join-Path $scriptDir "..\config\gcs-cors.json" | Resolve-Path

Write-Host "[GCS] Applying CORS from: $corsFile"
Write-Host "[GCS] Bucket: gs://$Bucket"
& gsutil cors set $corsFile "gs://$Bucket"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`n[GCS] Current CORS rules:"
& gsutil cors get "gs://$Bucket"
