Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-RepoRoot {
  return (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
}

function Initialize-Tooling {
  $repoRoot = Get-RepoRoot
  Set-Location $repoRoot

  $nodeExe = Resolve-NodeExe
  $nodeDir = Split-Path -Parent $nodeExe
  if ($env:PATH -notlike "*$nodeDir*") {
    $env:PATH = "$nodeDir;$env:PATH"
  }

  $script:PhotoMetaNodeExe = $nodeExe
  $script:PhotoMetaPnpmCjs = Resolve-PnpmCjs
  Write-Host "Node: $nodeExe"
  if ($script:PhotoMetaPnpmCjs) {
    Write-Host "pnpm: $script:PhotoMetaPnpmCjs"
  } else {
    $pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
    if ($pnpm) {
      Write-Host "pnpm: $($pnpm.Source)"
    } else {
      Write-Host "pnpm: corepack pnpm"
    }
  }
}

function Resolve-NodeExe {
  if ($env:PHOTO_METADATA_NODE -and (Test-Path $env:PHOTO_METADATA_NODE)) {
    return (Resolve-Path $env:PHOTO_METADATA_NODE).Path
  }

  if ($env:PHOTO_METADATA_NODE_HOME) {
    $candidate = Join-Path $env:PHOTO_METADATA_NODE_HOME 'node.exe'
    if (Test-Path $candidate) {
      return (Resolve-Path $candidate).Path
    }
  }

  $codexNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
  if (Test-Path $codexNode) {
    return (Resolve-Path $codexNode).Path
  }

  $node = Get-Command node -ErrorAction SilentlyContinue
  if ($node) {
    return $node.Source
  }

  throw 'Node.js 20.18 or newer is required. Install Node.js, then run Setup.cmd again.'
}

function Resolve-PnpmCjs {
  if ($env:PHOTO_METADATA_PNPM_CJS -and (Test-Path $env:PHOTO_METADATA_PNPM_CJS)) {
    return (Resolve-Path $env:PHOTO_METADATA_PNPM_CJS).Path
  }

  $codexPnpm = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\pnpm\bin\pnpm.cjs'
  if (Test-Path $codexPnpm) {
    return (Resolve-Path $codexPnpm).Path
  }

  return $null
}

function Invoke-Pnpm {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)

  if ($script:PhotoMetaPnpmCjs) {
    & $script:PhotoMetaNodeExe $script:PhotoMetaPnpmCjs @Arguments
    Assert-LastExitCode "pnpm $($Arguments -join ' ')"
    return
  }

  $pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
  if ($pnpm) {
    & $pnpm.Source @Arguments
    Assert-LastExitCode "pnpm $($Arguments -join ' ')"
    return
  }

  $corepack = Get-Command corepack -ErrorAction SilentlyContinue
  if ($corepack) {
    & $corepack.Source pnpm @Arguments
    Assert-LastExitCode "corepack pnpm $($Arguments -join ' ')"
    return
  }

  throw 'pnpm was not found. Install pnpm 11.x or enable Corepack, then run Setup.cmd again.'
}

function Invoke-LocalBin {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments
  )

  $repoRoot = Get-RepoRoot
  $cmd = Join-Path $repoRoot "node_modules\.bin\$Name.CMD"
  $bin = Join-Path $repoRoot "node_modules\.bin\$Name"

  if (Test-Path $cmd) {
    & $cmd @Arguments
    Assert-LastExitCode "$Name $($Arguments -join ' ')"
    return
  }

  if (Test-Path $bin) {
    & $bin @Arguments
    Assert-LastExitCode "$Name $($Arguments -join ' ')"
    return
  }

  throw "Local tool '$Name' was not found. Run Setup.cmd first."
}

function Assert-LastExitCode {
  param([Parameter(Mandatory = $true)][string]$CommandName)
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed: $CommandName"
  }
}

function Get-DefaultMapsDir {
  $documents = [Environment]::GetFolderPath('MyDocuments')
  if (-not $documents) {
    $documents = Join-Path $env:USERPROFILE 'Documents'
  }
  return Join-Path $documents 'Photo Metadata Manager\Maps'
}

function Get-ToolsDir {
  $repoRoot = Get-RepoRoot
  $toolsDir = Join-Path $repoRoot '.tools'
  New-Item -ItemType Directory -Force -Path $toolsDir | Out-Null
  return $toolsDir
}

function Get-PmtilesCli {
  $toolsDir = Get-ToolsDir
  $pmtilesExe = Join-Path $toolsDir 'pmtiles.exe'
  if (Test-Path $pmtilesExe) {
    return (Resolve-Path $pmtilesExe).Path
  }

  Write-Host ''
  Write-Host 'Downloading PMTiles CLI...'
  $release = Invoke-RestMethod -Uri 'https://api.github.com/repos/protomaps/go-pmtiles/releases/latest' -Headers @{ 'User-Agent' = 'metadata-manager-setup' }
  $asset = $release.assets |
    Where-Object { $_.name -match 'windows' -and $_.name -match '(amd64|x86_64|x64)' -and $_.name -match '\.zip$' } |
    Select-Object -First 1

  if (-not $asset) {
    Start-Process 'https://github.com/protomaps/go-pmtiles/releases'
    throw 'Could not find a Windows PMTiles CLI asset automatically. Download pmtiles.exe from the releases page and place it in .tools.'
  }

  $zipPath = Join-Path $toolsDir $asset.name
  Write-Host "Downloading PMTiles CLI asset: $($asset.browser_download_url)"
  Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $zipPath -Headers @{ 'User-Agent' = 'metadata-manager-setup' }
  Write-Host "PMTiles CLI archive downloaded: $zipPath"
  Expand-Archive -Path $zipPath -DestinationPath $toolsDir -Force
  $found = Get-ChildItem -LiteralPath $toolsDir -Recurse -Filter pmtiles.exe -File | Select-Object -First 1
  if (-not $found) {
    throw 'Downloaded PMTiles CLI archive did not contain pmtiles.exe.'
  }
  Copy-Item -LiteralPath $found.FullName -Destination $pmtilesExe -Force
  return (Resolve-Path $pmtilesExe).Path
}

function Get-LatestProtomapsBuildUrl {
  Write-Host ''
  Write-Host 'Finding an available official Protomaps daily basemap build...'
  $today = [DateTime]::UtcNow.Date
  for ($daysAgo = 0; $daysAgo -lt 21; $daysAgo++) {
    $date = $today.AddDays(-$daysAgo).ToString('yyyyMMdd')
    $candidate = "https://build.protomaps.com/$date.pmtiles"
    Write-Host "Checking build: $candidate"
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri $candidate -Method Head -MaximumRedirection 5 -TimeoutSec 20 -Headers @{ 'User-Agent' = 'photo-metadata-manager' }
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400) {
        Write-Host "Using official basemap build: $candidate"
        return $candidate
      }
    } catch {
      Write-Host "Build unavailable: $date"
    }
  }
  throw 'Could not find an available Protomaps daily build from the last 21 days. Open https://maps.protomaps.com/builds, copy a PMTiles URL, and paste it into Source PMTiles URL.'
}
