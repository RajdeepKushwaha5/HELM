param(
  [string]$RepoPath = "",
  [string]$HelmApi = "http://127.0.0.1:8000",
  [switch]$Merge
)

$ErrorActionPreference = "Stop"

Write-Host "Apply-live-fix is disabled." -ForegroundColor Yellow
Write-Host "Helm is a read-only Coral evidence surface and no longer pushes branches, opens PRs, or merges code from scripts." -ForegroundColor Yellow
Write-Host "Review Safe Drafts in the UI, then run any remediation manually outside Helm after explicit human approval." -ForegroundColor Cyan

exit 1
