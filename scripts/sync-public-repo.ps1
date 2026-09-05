param(
  [Parameter(Mandatory = $true)]
  [string]$PublicRepoPath,

  [switch]$SkipPrivateChecks,
  [switch]$RunPublicBuildChecks,
  [switch]$KeepSnapshot
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$publicPaths = @(
  ".github/ISSUE_TEMPLATE",
  ".gitignore",
  "CHANGELOG.md",
  "CONTRIBUTING.md",
  "LICENSE.md",
  "README.md",
  "ROADMAP.md",
  "docs",
  "package-lock.json",
  "package.json",
  "public",
  "scripts",
  "src",
  "tsconfig.json",
  "vite.config.ts"
)

function Resolve-Directory {
  param([string]$Path)

  $resolved = Resolve-Path -LiteralPath $Path -ErrorAction Stop
  if (-not (Test-Path -LiteralPath $resolved.Path -PathType Container)) {
    throw "Expected a directory: $Path"
  }
  return $resolved.Path
}

function Join-SafeChildPath {
  param(
    [string]$Root,
    [string]$RelativePath
  )

  $rootFull = [System.IO.Path]::GetFullPath($Root).TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
  $childFull = [System.IO.Path]::GetFullPath((Join-Path $Root $RelativePath))
  if (-not $childFull.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing path outside root: $RelativePath"
  }
  return $childFull
}

function Invoke-Checked {
  param(
    [string]$WorkingDirectory,
    [string]$FilePath,
    [string[]]$Arguments
  )

  Write-Host ""
  Write-Host ">> $FilePath $($Arguments -join ' ')" -ForegroundColor Cyan
  Push-Location -LiteralPath $WorkingDirectory
  try {
    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
      throw "Command failed with exit code $LASTEXITCODE`: $FilePath $($Arguments -join ' ')"
    }
  } finally {
    Pop-Location
  }
}

function Assert-GitClean {
  param([string]$RepoPath)

  Invoke-Checked -WorkingDirectory $RepoPath -FilePath "git" -Arguments @("rev-parse", "--is-inside-work-tree")
  $status = & git -C $RepoPath status --porcelain=v1 --untracked-files=normal
  if ($LASTEXITCODE -ne 0) {
    throw "Could not read public repo git status."
  }
  if ($status) {
    throw @"
Public repo has uncommitted changes. Commit, stash, or discard them before syncing.

$($status -join [Environment]::NewLine)
"@
  }
}

function Copy-AllowlistedSnapshot {
  param(
    [string]$SnapshotRoot,
    [string]$PublicRoot
  )

  foreach ($relativePath in $publicPaths) {
    $sourcePath = Join-SafeChildPath -Root $SnapshotRoot -RelativePath $relativePath
    $targetPath = Join-SafeChildPath -Root $PublicRoot -RelativePath $relativePath
    if (-not (Test-Path -LiteralPath $sourcePath)) {
      Write-Host "WARN skipped missing snapshot path: $relativePath" -ForegroundColor Yellow
      continue
    }

    $targetParent = Split-Path -Parent $targetPath
    New-Item -ItemType Directory -Force -Path $targetParent | Out-Null
    if (Test-Path -LiteralPath $targetPath) {
      Remove-Item -LiteralPath $targetPath -Recurse -Force
    }
    Copy-Item -LiteralPath $sourcePath -Destination $targetPath -Recurse -Force
  }
}

$privateRoot = Resolve-Directory (Join-Path $PSScriptRoot "..")
$publicRoot = Resolve-Directory $PublicRepoPath
$privateFull = [System.IO.Path]::GetFullPath($privateRoot).TrimEnd('\', '/')
$publicFull = [System.IO.Path]::GetFullPath($publicRoot).TrimEnd('\', '/')

if ($privateFull.Equals($publicFull, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Public repo path must not be the private workspace."
}

if ($publicFull.StartsWith($privateFull + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Public repo path must not be inside the private workspace."
}

Assert-GitClean -RepoPath $publicRoot

if (-not $SkipPrivateChecks) {
  Invoke-Checked -WorkingDirectory $privateRoot -FilePath "npm" -Arguments @("run", "typecheck")
  Invoke-Checked -WorkingDirectory $privateRoot -FilePath "npm" -Arguments @("run", "build")
  Invoke-Checked -WorkingDirectory $privateRoot -FilePath "npm" -Arguments @("run", "release:check")
}

$snapshotParent = Join-Path ([System.IO.Path]::GetTempPath()) "ylang-public-sync"
$snapshotRoot = Join-Path $snapshotParent ([System.Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $snapshotParent | Out-Null

try {
  Invoke-Checked -WorkingDirectory $privateRoot -FilePath "npm" -Arguments @("run", "public:snapshot", "--", $snapshotRoot)
  Copy-AllowlistedSnapshot -SnapshotRoot $snapshotRoot -PublicRoot $publicRoot
  Invoke-Checked -WorkingDirectory $publicRoot -FilePath "npm" -Arguments @("run", "public:check")

  if ($RunPublicBuildChecks) {
    Invoke-Checked -WorkingDirectory $publicRoot -FilePath "npm" -Arguments @("install", "--cache", ".npm-cache")
    Invoke-Checked -WorkingDirectory $publicRoot -FilePath "npm" -Arguments @("run", "typecheck")
    Invoke-Checked -WorkingDirectory $publicRoot -FilePath "npm" -Arguments @("run", "build")
    Invoke-Checked -WorkingDirectory $publicRoot -FilePath "npm" -Arguments @("run", "release:check")
    Invoke-Checked -WorkingDirectory $publicRoot -FilePath "npm" -Arguments @("run", "public:check")
  }

  Write-Host ""
  Write-Host "Public repo synced. Review before committing:" -ForegroundColor Green
  & git -C $publicRoot status --short
} finally {
  if (-not $KeepSnapshot -and (Test-Path -LiteralPath $snapshotRoot)) {
    Remove-Item -LiteralPath $snapshotRoot -Recurse -Force
  } elseif ($KeepSnapshot) {
    Write-Host "Kept snapshot at $snapshotRoot" -ForegroundColor Yellow
  }
}
