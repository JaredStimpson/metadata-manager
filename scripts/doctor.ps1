. "$PSScriptRoot\common.ps1"

Initialize-Tooling

$repoRoot = Get-RepoRoot
$checks = @(
  @{ Name = 'package.json'; Path = Join-Path $repoRoot 'package.json' },
  @{ Name = 'node_modules'; Path = Join-Path $repoRoot 'node_modules' },
  @{ Name = 'Electron binary'; Path = Join-Path $repoRoot 'node_modules\electron\dist\electron.exe' },
  @{ Name = 'Electron launcher'; Path = Join-Path $repoRoot 'Run.cmd' },
  @{ Name = 'Map setup launcher'; Path = Join-Path $repoRoot 'MapSetup.cmd' },
  @{ Name = 'Map scripts'; Path = Join-Path $repoRoot 'scripts\maps.ps1' },
  @{ Name = 'Preload source'; Path = Join-Path $repoRoot 'src\preload\index.ts' },
  @{ Name = 'Renderer API client'; Path = Join-Path $repoRoot 'src\renderer\src\apiClient.ts' },
  @{ Name = 'Backend server source'; Path = Join-Path $repoRoot 'src\main\services\backend-server.ts' },
  @{ Name = 'Backend logger source'; Path = Join-Path $repoRoot 'src\main\services\backend-logger.ts' },
  @{ Name = 'Thumbnail cache source'; Path = Join-Path $repoRoot 'src\main\services\thumbnail-cache.ts' },
  @{ Name = 'Built main process'; Path = Join-Path $repoRoot 'out\main\index.js'; Optional = $true },
  @{ Name = 'Built preload bridge'; Path = Join-Path $repoRoot 'out\preload\index.mjs'; Optional = $true },
  @{ Name = 'Built renderer'; Path = Join-Path $repoRoot 'out\renderer\index.html'; Optional = $true }
)

Write-Host ''
foreach ($check in $checks) {
  if (Test-Path $check.Path) {
    Write-Host "[OK] $($check.Name)"
  } elseif ($check.ContainsKey('Optional') -and $check.Optional) {
    Write-Host "[NOT BUILT] $($check.Name)"
  } else {
    Write-Host "[MISSING] $($check.Name)"
  }
}

Write-Host ''
try {
  & $script:PhotoMetaNodeExe -e "const pkg=require('./node_modules/electron/package.json'); const electron=require('./node_modules/electron'); console.log('[OK] Electron package ' + pkg.version); console.log('Electron runtime: ' + electron);"
  Assert-LastExitCode 'electron package probe'
} catch {
  Write-Host "[MISSING] Electron package could not be resolved: $($_.Exception.Message)"
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
Write-Host 'Doctor complete. If any build output says NOT BUILT, run Build.cmd or Run.cmd once.'
Write-Host 'When the app is running, open Maintenance -> Settings to see the backend port and persistent log path.'
