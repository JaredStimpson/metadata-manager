. "$PSScriptRoot\common.ps1"

Initialize-Tooling

$repoRoot = Get-RepoRoot
$checks = @(
  @{ Name = 'package.json'; Path = Join-Path $repoRoot 'package.json' },
  @{ Name = 'node_modules'; Path = Join-Path $repoRoot 'node_modules' },
  @{ Name = 'Electron binary'; Path = Join-Path $repoRoot 'node_modules\electron\dist\electron.exe' },
  @{ Name = 'Map scripts'; Path = Join-Path $repoRoot 'scripts\maps.ps1' }
)

Write-Host ''
foreach ($check in $checks) {
  if (Test-Path $check.Path) {
    Write-Host "[OK] $($check.Name)"
  } else {
    Write-Host "[MISSING] $($check.Name)"
  }
}

$mapsDir = Get-DefaultMapsDir
Write-Host ''
Write-Host "Default maps folder: $mapsDir"
if (Test-Path $mapsDir) {
  $maps = Get-ChildItem -LiteralPath $mapsDir -Filter *.pmtiles -File -ErrorAction SilentlyContinue
  Write-Host "PMTiles files found: $($maps.Count)"
} else {
  Write-Host 'PMTiles files found: 0'
}

Write-Host ''
Write-Host 'Doctor complete.'

