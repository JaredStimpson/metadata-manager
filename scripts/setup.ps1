param(
  [switch]$SkipVerify,
  [switch]$StarterMap
)

. "$PSScriptRoot\common.ps1"

Initialize-Tooling

Write-Host ''
Write-Host 'Installing dependencies...'
Invoke-Pnpm install

Write-Host ''
Write-Host 'Ensuring native Electron/esbuild binaries are ready...'
Invoke-Pnpm rebuild electron esbuild

if (-not $SkipVerify) {
  Write-Host ''
  Write-Host 'Running verification...'
  Invoke-LocalBin tsc --noEmit
  Invoke-LocalBin vitest run --root .
}

if ($StarterMap) {
  Write-Host ''
  Write-Host 'Creating a starter offline map...'
  & "$PSScriptRoot\maps.ps1" -Mode Starter
}

Write-Host ''
Write-Host 'Setup complete. Run Launch.cmd to start the app.'
