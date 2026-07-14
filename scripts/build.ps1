. "$PSScriptRoot\common.ps1"

Initialize-Tooling

Write-Host ''
Write-Host 'Building production bundles...'
Invoke-LocalBin electron-vite build

Write-Host ''
Write-Host 'Build complete. Output is in the out/ folder.'

