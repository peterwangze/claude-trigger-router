$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Invoke-CommandChecked {
  param(
    [Parameter(Mandatory = $true)]
    [scriptblock]$Action,
    [Parameter(Mandatory = $true)]
    [string]$FailureMessage
  )

  & $Action
  if ($LASTEXITCODE -ne 0) {
    throw "$FailureMessage (exit code: $LASTEXITCODE)"
  }
}

function Invoke-Step {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Title,
    [Parameter(Mandatory = $true)]
    [scriptblock]$Action
  )

  Write-Host ""
  Write-Host "==> $Title" -ForegroundColor Cyan
  & $Action
}

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repoRoot

$tempPrefix = Join-Path $repoRoot ".tmp-npm-global"
$packageFile = $null
$cliPath = if ($IsWindows) {
  Join-Path $tempPrefix "ctr.cmd"
} else {
  Join-Path $tempPrefix "bin/ctr"
}

try {
  Invoke-Step "Build dist bundle" {
    Invoke-CommandChecked { npm run build } "Build failed"
  }

  Invoke-Step "Run test suite" {
    Invoke-CommandChecked { npm test -- --run } "Tests failed"
  }

  Invoke-Step "Inspect publish payload" {
    Invoke-CommandChecked { npm pack --dry-run } "npm pack --dry-run failed"
  }

  Invoke-Step "Create tarball" {
    $script:packageFile = (npm pack --silent).Trim()
    if ($LASTEXITCODE -ne 0) {
      throw "npm pack failed (exit code: $LASTEXITCODE)"
    }

    if (-not $script:packageFile) {
      throw "npm pack did not return a tarball name."
    }

    $packagePath = Join-Path $repoRoot $script:packageFile
    if (-not (Test-Path -LiteralPath $packagePath)) {
      throw "Expected tarball was not created: $packagePath"
    }

    Write-Host "Tarball: $packagePath" -ForegroundColor Green
  }

  Invoke-Step "Install tarball into isolated prefix" {
    if (Test-Path -LiteralPath $tempPrefix) {
      Remove-Item -LiteralPath $tempPrefix -Recurse -Force
    }

    New-Item -ItemType Directory -Path $tempPrefix | Out-Null
    Invoke-CommandChecked {
      npm install -g (Join-Path $repoRoot $packageFile) --prefix $tempPrefix
    } "Tarball install failed"
  }

  if (-not (Test-Path -LiteralPath $cliPath)) {
    throw "Installed CLI wrapper not found: $cliPath"
  }

  Invoke-Step "Smoke test installed CLI" {
    Invoke-CommandChecked { & $cliPath --help } "Installed CLI help command failed"
    Invoke-CommandChecked { & $cliPath version } "Installed CLI version command failed"
    Invoke-CommandChecked { & $cliPath upgrade } "Installed CLI upgrade command failed"
  }

  Write-Host ""
  Write-Host "Package verification passed. Safe to publish after reviewing the output above." -ForegroundColor Green
}
finally {
  if (Test-Path -LiteralPath $tempPrefix) {
    Remove-Item -LiteralPath $tempPrefix -Recurse -Force -ErrorAction SilentlyContinue
  }

  if ($packageFile) {
    $packagePath = Join-Path $repoRoot $packageFile
    if (Test-Path -LiteralPath $packagePath) {
      Remove-Item -LiteralPath $packagePath -Force -ErrorAction SilentlyContinue
    }
  }
}
