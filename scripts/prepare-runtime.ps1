param([string]$Version = '1.31.2')

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $repoRoot 'runtime-tools'
$target = Join-Path $runtimeDir 'pmtiles.exe'
$staging = Join-Path $runtimeDir '.download'

New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
Remove-Item -LiteralPath $staging -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $staging | Out-Null

try {
  Write-Host "Fetching pinned PMTiles CLI v$Version release metadata..."
  $release = Invoke-RestMethod -Uri "https://api.github.com/repos/protomaps/go-pmtiles/releases/tags/v$Version" -Headers @{ 'User-Agent' = 'photo-meta-builder' }
  $asset = $release.assets |
    Where-Object { $_.name -match 'Windows' -and $_.name -match 'x86_64' -and $_.name -match '\.zip$' } |
    Select-Object -First 1
  if (-not $asset) { throw 'The pinned release does not contain a Windows x64 ZIP asset.' }
  if (-not $asset.digest -or $asset.digest -notmatch '^sha256:([0-9a-fA-F]{64})$') {
    throw 'GitHub did not provide the required SHA-256 digest for the pinned PMTiles asset.'
  }
  $expectedHash = $Matches[1]

  $zip = Join-Path $staging $asset.name
  Write-Host "Downloading $($asset.name)..."
  Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $zip -Headers @{ 'User-Agent' = 'photo-meta-builder' }
  $actualZipHash = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash
  if ($actualZipHash -ne $expectedHash) { throw "PMTiles archive checksum mismatch. Expected $expectedHash, got $actualZipHash." }

  Expand-Archive -LiteralPath $zip -DestinationPath $staging -Force
  $executable = Get-ChildItem -LiteralPath $staging -Filter pmtiles.exe -File -Recurse | Select-Object -First 1
  if (-not $executable) { throw 'The verified PMTiles archive did not contain pmtiles.exe.' }
  Copy-Item -LiteralPath $executable.FullName -Destination $target -Force
  Write-Host "Bundled PMTiles CLI: $target"
  Write-Host "Verified archive SHA-256: $actualZipHash"
} finally {
  Remove-Item -LiteralPath $staging -Recurse -Force -ErrorAction SilentlyContinue
}
