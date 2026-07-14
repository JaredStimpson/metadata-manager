. "$PSScriptRoot\common.ps1"

Initialize-Tooling

Write-Host ''
Write-Host 'Typechecking...'
Invoke-LocalBin tsc --noEmit

Write-Host ''
Write-Host 'Running tests...'
Invoke-LocalBin vitest run --root .

Write-Host ''
Write-Host 'Building production bundles...'
Invoke-LocalBin electron-vite build

Write-Host ''
Write-Host 'Verification complete.'

