param(
  [ValidateSet('Menu', 'Starter', 'Custom', 'OpenDocs')]
  [string]$Mode = 'Menu',
  [string]$Bbox,
  [int]$MaxZoom = 8,
  [string]$Output,
  [string]$SourceUrl
)

. "$PSScriptRoot\common.ps1"

Initialize-Tooling

if ($Mode -eq 'Menu') {
  Write-Host ''
  Write-Host 'Offline Map Setup'
  Write-Host '1. Create a small world overview map'
  Write-Host '2. Create a custom area map from a bounding box'
  Write-Host '3. Open map download docs'
  Write-Host ''
  $choice = Read-Host 'Choose 1, 2, or 3'
  switch ($choice) {
    '1' { $Mode = 'Starter' }
    '2' { $Mode = 'Custom' }
    '3' { $Mode = 'OpenDocs' }
    default { throw 'Choose 1, 2, or 3.' }
  }
}

if ($Mode -eq 'OpenDocs') {
  Start-Process 'https://docs.protomaps.com/basemaps/downloads'
  Start-Process 'https://bboxfinder.com'
  return
}

$mapsDir = Get-DefaultMapsDir
New-Item -ItemType Directory -Force -Path $mapsDir | Out-Null

$pmtilesExe = Get-PmtilesCli
$source = if ($SourceUrl) { $SourceUrl } else { Get-LatestProtomapsBuildUrl }
Write-Host "PMTiles CLI: $pmtilesExe"
Write-Host "Remote source: $source"
Write-Host 'The extract command uses HTTP range requests and may take time before its first progress update.'

if ($Mode -eq 'Custom') {
  if (-not $Bbox) {
    Write-Host ''
    Write-Host 'Use bboxfinder.com to copy a box in this order: minLon,minLat,maxLon,maxLat'
    Start-Process 'https://bboxfinder.com'
    $Bbox = Read-Host 'Bounding box'
  }
  if ($Bbox -notmatch '^-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?$') {
    throw 'Bounding box must look like: -123.2,37.1,-121.7,38.2'
  }
  if (-not $Output) {
    $Output = Join-Path $mapsDir "custom_z$MaxZoom.pmtiles"
  }
  Write-Host ''
  Write-Host "Creating custom map: $Output"
  Write-Host "Starting network extraction for bounding box $Bbox through zoom $MaxZoom..."
  & $pmtilesExe extract $source $Output "--bbox=$Bbox" "--maxzoom=$MaxZoom"
  Assert-LastExitCode 'pmtiles extract custom area'
} else {
  if (-not $Output) {
    $Output = Join-Path $mapsDir "world_overview_z$MaxZoom.pmtiles"
  }
  Write-Host ''
  Write-Host "Creating starter map: $Output"
  Write-Host "Starting network extraction through zoom $MaxZoom..."
  & $pmtilesExe extract $source $Output "--maxzoom=$MaxZoom"
  Assert-LastExitCode 'pmtiles extract starter map'
}

Write-Host ''
Write-Host 'Map file ready:'
Write-Host $Output
Write-Host ''
Write-Host 'In the app, click Map Pack and choose this .pmtiles file.'
