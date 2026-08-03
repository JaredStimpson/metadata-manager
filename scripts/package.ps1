$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\common.ps1"

Initialize-Tooling
$repoRoot = Get-RepoRoot
Push-Location $repoRoot
try {
  Write-Host ''
  Write-Host 'Running TypeScript, tests, and production bundle...'
  Invoke-Pnpm run verify

  Write-Host ''
  Write-Host 'Preparing packaged PMTiles runtime...'
  & "$PSScriptRoot\prepare-runtime.ps1"

  Write-Host ''
  Write-Host 'Building assisted installer and portable executable...'
  Invoke-Pnpm exec electron-builder --win nsis portable --x64

  Write-Host ''
  Write-Host 'Windows artifacts are ready:' -ForegroundColor Green
  Get-ChildItem -LiteralPath (Join-Path $repoRoot 'release') -Filter 'Photo-Meta-*.exe' | ForEach-Object {
    Write-Host "  $($_.FullName)"
  }
} finally {
  Pop-Location
}
