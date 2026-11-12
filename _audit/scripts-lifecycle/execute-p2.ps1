#Requires -Version 5.1
<# Execute ratified P2 batches. Stops on any failed closure, hash, tag, or negative assertion. #>
[CmdletBinding()]
param(
  [string]$Root,
  [string]$PlanPath = '_audit/scripts-lifecycle/BATCH_PLAN_2026-11-13.md'
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Assert-True {
  param([bool]$Condition, [string]$Message)
  if (-not $Condition) { throw $Message }
}

if (-not $Root) { $Root = (& git rev-parse --show-toplevel).Trim() }
$Root = [System.IO.Path]::GetFullPath($Root).TrimEnd('\', '/')
$planPath = Join-Path $Root $PlanPath
Assert-True (Test-Path -LiteralPath $planPath) "plan missing: $PlanPath"

$lines = @(Get-Content -LiteralPath $planPath)
$batches = @()
$current = $null
foreach ($line in $lines) {
  if ($line -like '## 保留与隔离*') { break }
  if ($line -like '### *') {
    $parts = @($line.Substring(4).Split('|') | ForEach-Object { $_.Trim() })
    Assert-True ($parts.Count -eq 4) "bad batch header: $line"
    $actionValue = ($parts[1] -split '=')[1]
    $countValue = [int](($parts[2] -split '=')[1])
    $tagValue = ($parts[3] -split '=')[1]
    $current = [ordered]@{ id = $parts[0]; action = $actionValue; count = $countValue; tag = $tagValue; files = @() }
    $batches += $current
    continue
  }
  if ($current -and $line -like '- scripts\*') {
    $rel = $line.Substring(2).Split(' ')[0].Trim()
    $historyCommit = (& git log -1 --diff-filter=D --pretty=format:'%H' -- $trackedPath)
    $trackedNow = @(& git ls-files -- $trackedPath).Count -gt 0
    $exists = Test-Path -LiteralPath (Join-Path $Root $rel)
    Assert-True ($trackedNow -or $exists -or $historyCommit) "batch file missing: $rel"
    $current.files += $rel
  }
}

  $completedBatchIds = @{}
foreach ($entry in @(Get-ChildItem -LiteralPath (Join-Path $Root '_audit\scripts-lifecycle\BATCH_LEDGERS') -File -ErrorAction SilentlyContinue)) {
  $ledgerLines = @(Get-Content -LiteralPath $entry.FullName)
  $tab = [string][char]9
  if ($ledgerLines.Count -ge 4 -and $ledgerLines[0].StartsWith('batch' + $tab) -and $ledgerLines[3].StartsWith('preCommit' + $tab)) {
    $completedBatchIds[$entry.BaseName] = $true
  }
}
$batches = @($batches | Where-Object { -not $completedBatchIds.ContainsKey($_.id) })
Assert-True ($batches.Count -ge 1) "no remaining P2 batches"
$ledgerRoot = Join-Path $Root '_audit\scripts-lifecycle\BATCH_LEDGERS'
$archiveRoot = Join-Path $Root '_audit\scripts-lifecycle\archive'
New-Item -ItemType Directory -Force -Path $ledgerRoot, $archiveRoot | Out-Null

# Materialize after all batch files are fully parsed.
$batches = @($batches | ForEach-Object { [pscustomobject]@{ id = $_.id; action = $_.action; count = $_.count; tag = $_.tag; files = @($_.files) } })
foreach ($batch in $batches) {
  Assert-True ($batch.files.Count -eq $batch.count) "count mismatch for $($batch.id)"
  Assert-True (-not (& git rev-parse --verify --quiet "refs/tags/$($batch.tag)")) "tag already exists: $($batch.tag)"
}

$summary = @(
  '# P2 BATCH SUMMARY - 2026-11-13',
  '',
  'batch|action|tag|preCommit|postCommit|files|hashRows|negativeAssertions'
)
$archiveManifest = @(
  '# ARCHIVE MANIFEST - 2026-11-13',
  '# format: batch|originalPath|sha256|date|adjudication',
  ''
)

foreach ($batch in $batches) {
  & git rev-parse --verify HEAD | Out-Null
  Assert-True ($LASTEXITCODE -eq 0) 'git HEAD unavailable'
  & git tag $batch.tag
  Assert-True ($LASTEXITCODE -eq 0) "failed to tag pre-batch: $($batch.tag)"
  Assert-True (Test-Path -LiteralPath $batch.files[0]) "batch first file missing: $($batch.id)"
  Write-Output ("START batch=$($batch.id) files=$($batch.files.Count) first=$($batch.files[0])")
  $preCommit = (& git rev-parse HEAD).Trim()

  $ledgerPath = Join-Path $ledgerRoot ($batch.id + '.tsv')
  $ledger = @("batch`t$($batch.id)", "action`t$($batch.action)", "tag`t$($batch.tag)", "preCommit`t$preCommit", "pathHashRows`t$($batch.files.Count)", "path`taction`tstatus`tsha256")
  foreach ($rel in $batch.files) {
    $full = [System.IO.Path]::GetFullPath((Join-Path $Root $rel))
    Assert-True ($full.StartsWith($Root + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) "outside workspace: $rel"
    $hash = (Get-FileHash -LiteralPath $full -Algorithm SHA256).Hash
    $statusLines = @(& git status --porcelain -- $rel)
    $status = if ($statusLines.Count -gt 0) { $statusLines[0].Trim() } else { 'clean' }
    $ledger += ($rel + "`t" + $batch.action + "`t" + $status + "`t" + $hash)
  }
  [System.IO.File]::WriteAllLines($ledgerPath, $ledger, (New-Object System.Text.UTF8Encoding($false)))
  Assert-True (@($ledger | Where-Object { $_ -match '^[^#].*\t' }).Count -eq ($batch.files.Count + 5)) "hash row mismatch: $($batch.id)"

  if ($batch.action -eq 'archive') {
    foreach ($rel in $batch.files) {
      $source = Join-Path $Root $rel
      $relative = $rel -replace '^scripts[\\/]', ''
      $target = Join-Path $archiveRoot $relative
      Assert-True (-not (Test-Path -LiteralPath $target)) "archive target exists: $target"
      New-Item -ItemType Directory -Force -Path (Split-Path $target -Parent) | Out-Null
      Copy-Item -LiteralPath $source -Destination $target
      $sourceHash = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash
      $targetHash = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash
      Assert-True ($sourceHash -eq $targetHash) "archive hash mismatch: $rel"
      $archiveManifest += ($batch.id + '|' + $rel + '|' + $targetHash + '|' + '2026-11-13' + '|' + $(if ($rel -like 'scripts\tmp\*') { 'D1-archive' } else { 'zero-ref-chain-archive' }))
    }
    [System.IO.File]::WriteAllLines((Join-Path $archiveRoot 'MANIFEST.tsv'), $archiveManifest, (New-Object System.Text.UTF8Encoding($false)))
  }

  foreach ($rel in $batch.files) {
    $tracked = @(& git ls-files -- $rel)
    if ($tracked.Count -gt 0) {
      & git rm -- $rel
      Assert-True ($LASTEXITCODE -eq 0) "git rm failed: $rel"
    } elseif ($batch.action -eq 'archive') {
      Remove-Item -LiteralPath (Join-Path $Root $rel)
      Assert-True (-not (Test-Path -LiteralPath (Join-Path $Root $rel))) "tmp remove failed: $rel"
    } else {
      throw "retire file is untracked: $rel"
    }
  }

  & git add -- $ledgerPath
  if ($batch.action -eq 'archive') { & git add -- $archiveRoot }
  Assert-True ($LASTEXITCODE -eq 0) "failed to stage ledger/archive: $($batch.id)"

  $negativeCount = 0
  foreach ($rel in $batch.files) {
    $leaf = Split-Path $rel -Leaf
    $null = & rg -n -F -- $leaf package.json src electron docs
    $code = $LASTEXITCODE
    Assert-True ($code -eq 1) "reference assertion failed ($leaf): rg exit $code"
    $negativeCount++
  }

  $changed = @(& git diff --name-only --cached)
  Assert-True ($changed.Count -gt 0) "no staged changes: $($batch.id)"
  Write-Output ("STAGED batch=$($batch.id) count=$($changed.Count) first=$($changed[0])")
  foreach ($changedPath in $changed) {
    $allowed = $changedPath -like 'scripts/*' -or $changedPath -like '_audit/scripts-lifecycle/archive/*' -or $changedPath -like '_audit/scripts-lifecycle/BATCH_LEDGERS/*'
    Assert-True $allowed "disallowed staged path: $changedPath"
  }

  $commitMessage = 'chore(scripts): lifecycle ' + $batch.id
  & git commit -m $commitMessage
  Assert-True ($LASTEXITCODE -eq 0) "commit failed: $($batch.id)"
  $postCommit = (& git rev-parse HEAD).Trim()
  Write-Output ("POST_COMMIT batch=$($batch.id) commit=$postCommit")
  $residue = @(& git diff --name-only)
  Assert-True ($residue.Count -eq 0) "unstaged residue after commit: $($batch.id)"
  $summary += ($batch.id + '|' + $batch.action + '|' + $batch.tag + '|' + $preCommit + '|' + $postCommit + '|' + $batch.files.Count + '|' + $batch.files.Count + '|' + $negativeCount)
  Write-Output ("COMPLETE batch=$($batch.id) files=$($batch.files.Count) tag=$($batch.tag) commit=$postCommit")
}

[System.IO.File]::WriteAllLines((Join-Path $Root '_audit\scripts-lifecycle\P2_SUMMARY_2026-11-13.tsv'), $summary, (New-Object System.Text.UTF8Encoding($false)))
Write-Output ("ALL_BATCHES_COMPLETE total=$($batches.Count) files=$(@($batches | ForEach-Object { $_.files }).Count)")
