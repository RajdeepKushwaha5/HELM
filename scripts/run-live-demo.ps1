param(
  [string]$RepoPath = "",
  [string]$HelmApi = "http://127.0.0.1:8000",
  [int]$PollAttempts = 12,
  [int]$PollSeconds = 10
)

$ErrorActionPreference = "Stop"

Write-Host "Live demo mutation script is disabled." -ForegroundColor Yellow
Write-Host "Helm no longer creates, pushes, or merges regression branches from this project." -ForegroundColor Yellow
Write-Host "Use the read-only app workflow or run a Coral SQL proof directly against existing source data." -ForegroundColor Cyan

exit 1
