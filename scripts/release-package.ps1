param(
  [ValidateSet("verify", "publish", "stage", "clean")]
  [string]$Action = "verify",
  [switch]$SkipVerify
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Invoke-CommandChecked {
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

function Invoke-Step {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Title,
    [Parameter(Mandatory = $true)]
    [scriptblock]$ActionBlock
  )

  Write-Host ""
  Write-Host "==> $Title" -ForegroundColor Cyan
  & $ActionBlock
}

function Get-PackageInfo {
  $packageJsonPath = Join-Path $repoRoot "package.json"
  return Get-Content -LiteralPath $packageJsonPath -Raw | ConvertFrom-Json
}

function New-ReleaseTestConfig {
  $releaseConfigDir = Join-Path $releaseHome ".claude-trigger-router"
  $releaseConfigFile = Join-Path $releaseConfigDir "config.yaml"
  $exampleConfig = Join-Path $repoRoot "config/trigger.example.yaml"

  if (-not (Test-Path -LiteralPath $exampleConfig)) {
    throw "Example config not found: $exampleConfig"
  }

  if (-not (Test-Path -LiteralPath $releaseConfigDir)) {
    New-Item -ItemType Directory -Path $releaseConfigDir -Force | Out-Null
  }

  Copy-Item -LiteralPath $exampleConfig -Destination $releaseConfigFile -Force

  $releaseClaudeConfig = Join-Path $releaseHome ".claude.json"
  if (-not (Test-Path -LiteralPath $releaseClaudeConfig)) {
    Set-Content -LiteralPath $releaseClaudeConfig -Value @'
{
  "numStartups": 1,
  "autoUpdaterStatus": "enabled",
  "userID": "release-stage-user",
  "hasCompletedOnboarding": true,
  "lastOnboardingVersion": "1.0.17",
  "projects": {}
}
'@
  }

  if ($IsWindows) {
    $wrapperCmd = Join-Path $stagePrefix "ctr-release-home.cmd"
    $wrapperPs1 = Join-Path $stagePrefix "ctr-release-home.ps1"
    $escapedHome = $releaseHome.Replace('"', '""')
    $escapedCli = $stageCliPath.Replace('"', '""')
    Set-Content -LiteralPath $wrapperCmd -Value @"
@echo off
set "HOME=$escapedHome"
set "USERPROFILE=$escapedHome"
"$escapedCli" %*
"@
    Set-Content -LiteralPath $wrapperPs1 -Value @"
`$env:HOME = '$releaseHome'
`$env:USERPROFILE = '$releaseHome'
& '$stageCliPath' @args
"@
  }

  return $releaseConfigFile
}

function Get-LatestPublishedVersion {
  param(
    [Parameter(Mandatory = $true)]
    [string]$PackageName,
    [Parameter(Mandatory = $true)]
    [string]$Version
  )

  $publishedVersion = npm view "$PackageName@$Version" version --registry=https://registry.npmjs.org/ 2>$null
  if ($LASTEXITCODE -eq 0) {
    return ($publishedVersion | Out-String).Trim()
  }

  return $null
}

function Invoke-ReleaseVerification {
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

function Invoke-ReleaseStage {
  Invoke-Step "Build dist bundle" {
    Invoke-CommandChecked { npm run build } "Build failed"
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

  Invoke-Step "Install tarball into staged directory" {
    if (Test-Path -LiteralPath $stagePrefix) {
      Remove-Item -LiteralPath $stagePrefix -Recurse -Force
    }

    New-Item -ItemType Directory -Path $stagePrefix | Out-Null
    Invoke-CommandChecked {
      npm install -g (Join-Path $repoRoot $packageFile) --prefix $stagePrefix
    } "Staged install failed"
  }

  if (-not (Test-Path -LiteralPath $stageCliPath)) {
    throw "Staged CLI wrapper not found: $stageCliPath"
  }

  $releaseConfigFile = New-ReleaseTestConfig
  $script:keepArtifacts = $true

  Write-Host ""
  Write-Host "Staged package is ready for manual verification." -ForegroundColor Green
  Write-Host "Stage directory: $stagePrefix"
  Write-Host "CLI path: $stageCliPath"
  Write-Host "Isolated HOME: $releaseHome"
  Write-Host "Test config: $releaseConfigFile"
  Write-Host ""
  Write-Host "Example commands:" -ForegroundColor Cyan
  if ($IsWindows) {
    $wrapperCmd = Join-Path $stagePrefix "ctr-release-home.cmd"
    Write-Host "  `"$wrapperCmd`" --help"
    Write-Host "  `"$wrapperCmd`" version"
    Write-Host "  `"$wrapperCmd`" init --force"
    Write-Host "  `"$wrapperCmd`" setup"
    Write-Host "  `"$wrapperCmd`" start --port 5678"
    Write-Host "  `"$wrapperCmd`" status"
    Write-Host "  `"$wrapperCmd`" stop"
    Write-Host ""
    Write-Host "Before running start/setup, edit the staged test config if needed:" -ForegroundColor Yellow
    Write-Host "  $releaseConfigFile"
  } else {
    Write-Host "  HOME=`"$releaseHome`" `"$stageCliPath`" --help"
    Write-Host "  HOME=`"$releaseHome`" `"$stageCliPath`" version"
    Write-Host "  HOME=`"$releaseHome`" `"$stageCliPath`" init --force"
    Write-Host "  HOME=`"$releaseHome`" `"$stageCliPath`" setup"
    Write-Host "  HOME=`"$releaseHome`" `"$stageCliPath`" start --port 5678"
    Write-Host "  HOME=`"$releaseHome`" `"$stageCliPath`" status"
    Write-Host "  HOME=`"$releaseHome`" `"$stageCliPath`" stop"
  }
  Write-Host ""
  Write-Host "When you finish manual validation, run:" -ForegroundColor Yellow
  Write-Host "  npm run release:clean"
}

function Invoke-ReleaseClean {
  if (Test-Path -LiteralPath $stagePrefix) {
    Remove-Item -LiteralPath $stagePrefix -Recurse -Force
    Write-Host "Removed staged install: $stagePrefix" -ForegroundColor Green
  } else {
    Write-Host "No staged install found at: $stagePrefix" -ForegroundColor Yellow
  }

  if (Test-Path -LiteralPath $releaseHome) {
    Remove-Item -LiteralPath $releaseHome -Recurse -Force
    Write-Host "Removed staged HOME/config: $releaseHome" -ForegroundColor Green
  } else {
    Write-Host "No staged HOME/config found at: $releaseHome" -ForegroundColor Yellow
  }

  if (Test-Path -LiteralPath $tarballGlobPath) {
    Get-ChildItem -LiteralPath $tarballGlobPath | Remove-Item -Force
  } else {
    Get-ChildItem -Path (Join-Path $repoRoot "*.tgz") -ErrorAction SilentlyContinue | Remove-Item -Force
  }

  Write-Host "Removed local release tarballs from repo root." -ForegroundColor Green
}

function Invoke-ReleasePublish {
  $package = Get-PackageInfo
  $publishedVersion = Get-LatestPublishedVersion -PackageName $package.name -Version $package.version

  if ($publishedVersion) {
    throw "Version $publishedVersion has already been published. Bump package.json before running publish."
  }

  if (-not $SkipVerify) {
    Invoke-ReleaseVerification
  } else {
    Write-Host "Skipping verification because -SkipVerify was provided." -ForegroundColor Yellow
  }

  Invoke-Step "Publish package to npm" {
    Invoke-CommandChecked {
      npm publish --access public --registry=https://registry.npmjs.org/
    } "npm publish failed"
  }

  Write-Host ""
  Write-Host "Publish completed successfully." -ForegroundColor Green
}

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repoRoot

$tempPrefix = Join-Path $repoRoot ".tmp-npm-global"
$stagePrefix = Join-Path $repoRoot ".release-stage"
$releaseHome = Join-Path $repoRoot ".release-home"
$tarballGlobPath = Join-Path $repoRoot "*.tgz"
$packageFile = $null
$keepArtifacts = $false
$cliPath = if ($IsWindows) {
  Join-Path $tempPrefix "ctr.cmd"
} else {
  Join-Path $tempPrefix "bin/ctr"
}
$stageCliPath = if ($IsWindows) {
  Join-Path $stagePrefix "ctr.cmd"
} else {
  Join-Path $stagePrefix "bin/ctr"
}

try {
  switch ($Action) {
    "verify" {
      Invoke-ReleaseVerification
    }
    "publish" {
      Invoke-ReleasePublish
    }
    "stage" {
      Invoke-ReleaseStage
    }
    "clean" {
      Invoke-ReleaseClean
    }
    default {
      throw "Unsupported action: $Action"
    }
  }
}
finally {
  if (Test-Path -LiteralPath $tempPrefix) {
    Remove-Item -LiteralPath $tempPrefix -Recurse -Force -ErrorAction SilentlyContinue
  }

  if ($packageFile -and -not $keepArtifacts) {
    $packagePath = Join-Path $repoRoot $packageFile
    if (Test-Path -LiteralPath $packagePath) {
      Remove-Item -LiteralPath $packagePath -Force -ErrorAction SilentlyContinue
    }
  }
}
