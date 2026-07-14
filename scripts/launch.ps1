. "$PSScriptRoot\common.ps1"

Initialize-Tooling

if (-not (Test-Path (Join-Path (Get-RepoRoot) 'node_modules'))) {
  Write-Host 'Dependencies are missing. Running setup first...'
  & "$PSScriptRoot\setup.ps1" -SkipVerify
}

Write-Host ''
Write-Host 'Starting Offline Photo Metadata Manager...'
Invoke-LocalBin electron-vite dev

