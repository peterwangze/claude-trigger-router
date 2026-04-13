param()

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repoRoot

$packageFile = $null

function Invoke-Checked {
  param(
    [Parameter(Mandatory = $true)]
    [scriptblock]$ActionBlock,
    [Parameter(Mandatory = $true)]
    [string]$FailureMessage
  )

  & $ActionBlock
  if ($LASTEXITCODE -ne 0) {
    throw "$FailureMessage (exit code: $LASTEXITCODE)"
  }
}

try {
  Write-Host "==> Build current package" -ForegroundColor Cyan
  Invoke-Checked { npm run build } "Build failed"

  Write-Host ""
  Write-Host "==> Pack publish payload" -ForegroundColor Cyan
  $packageFile = (npm pack --silent).Trim()
  if ($LASTEXITCODE -ne 0) {
    throw "npm pack failed (exit code: $LASTEXITCODE)"
  }

  if (-not $packageFile) {
    throw "npm pack did not return a tarball name."
  }

  $packagePath = Join-Path $repoRoot $packageFile
  if (-not (Test-Path -LiteralPath $packagePath)) {
    throw "Expected tarball was not created: $packagePath"
  }

  Write-Host "Tarball: $packagePath" -ForegroundColor Green

  Write-Host ""
  Write-Host "==> Install tarball globally into real environment" -ForegroundColor Cyan
  Invoke-Checked { npm install -g $packagePath } "Global install failed"

  Write-Host ""
  Write-Host "Local release install completed." -ForegroundColor Green
  Write-Host "Recommended quick checks:" -ForegroundColor Yellow
  Write-Host "  ctr version"
  Write-Host "  ctr help"
  Write-Host "  ctr status"
  Write-Host "  ctr code"
}
finally {
  if ($packageFile) {
    $packagePath = Join-Path $repoRoot $packageFile
    if (Test-Path -LiteralPath $packagePath) {
      Remove-Item -LiteralPath $packagePath -Force -ErrorAction SilentlyContinue
    }
  }
}
