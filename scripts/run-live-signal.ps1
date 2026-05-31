param(
  [string]$RepoPath = "",
  [string]$HelmApi = "http://127.0.0.1:8000",
  [int]$PollAttempts = 24,
  [int]$PollSeconds = 10
)

$ErrorActionPreference = "Stop"

Write-Host "Live signal mutation script is disabled." -ForegroundColor Yellow
Write-Host "Helm is read-only from the app and scripts. It does not create regression PRs or trigger upstream writes." -ForegroundColor Yellow
Write-Host "Run read-only Coral SQL evidence queries instead." -ForegroundColor Cyan

exit 1
