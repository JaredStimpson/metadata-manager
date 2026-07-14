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

