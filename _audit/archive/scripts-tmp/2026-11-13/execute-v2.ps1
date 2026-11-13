$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Assert-True {
  param([bool]$Condition, [string]$Message)
  if (-not $Condition) { throw $Message }
}

function Invoke-RgExit {
  param([string]$Pattern)
  & rg -n -F --no-messages $Pattern package.json src electron docs | Out-Null
  return $LASTEXITCODE
}

$root = (& git rev-parse --show-toplevel).Trim()
$root = [System.IO.Path]::GetFullPath($root).TrimEnd('\','/')
$planPath = Join-Path $root '_audit/scripts-lifecycle/BATCH_PLAN_V2_2026-11-13.md'
Assert-True (Test-Path -LiteralPath $planPath) 'plan missing'
$lines = @(Get-Content -LiteralPath $planPath)
$batches = @()
$current = $null
foreach ($line in $lines) {
  if ($line -like '## Keep*') { break }
  if ($line -like '### V2-*') {
    $parts = @($line.Substring(4).Split('|') | ForEach-Object { $_.Trim() })
    Assert-True ($parts.Count -eq 4) "bad header: $line"
    $current = [ordered]@{
      id = $parts[0]
      action = ($parts[1] -split '=')[1]
      count = [int](($parts[2] -split '=')[1])
      tag = ($parts[3] -split '=')[1]
      files = @()
    }
    $batches += $current
  } elseif ($current -and $line -match '^-[ ](scripts\\[^ ]+)') {
    $rel = $Matches[1].Trim()
    $full = Join-Path $root $rel
    Assert-True (Test-Path -LiteralPath $full) "missing file: $rel"
    Assert-True (@(& git ls-files -- $rel).Count -eq 1) "not exactly one tracked file: $rel"
    $current.files += $rel
  }
}
$batches = @($batches | ForEach-Object { [pscustomobject]@{ id=$_.id; action=$_.action; count=$_.count; tag=$_.tag; files=@($_.files) } })
Assert-True ($batches.Count -eq 5) "batch count expected 5 got $($batches.Count)"
$parsedFileCount = @($batches | ForEach-Object { $_.files }).Count
$parsedCounts = ($batches | ForEach-Object { '{0}={1}' -f $_.id,$_.files.Count }) -join ','
Assert-True ($parsedFileCount -eq 74) "plan file count expected 74 got $parsedFileCount ($parsedCounts)"
foreach ($batch in $batches) {
  Assert-True ($batch.files.Count -eq $batch.count) "count mismatch: $($batch.id)"
  Assert-True (-not (& git rev-parse --verify --quiet "refs/tags/$($batch.tag)")) "tag exists: $($batch.tag)"
}

$ledgerRoot = Join-Path $root '_audit/scripts-lifecycle/BATCH_LEDGERS'
$archiveRoot = Join-Path $root '_audit/scripts-lifecycle/archive/v2'
New-Item -ItemType Directory -Force -Path $ledgerRoot,$archiveRoot | Out-Null
$manifestPath = Join-Path $archiveRoot 'MANIFEST.tsv'
$manifest = @('# SCRIPTS ARCHIVE MANIFEST V2 - 2026-11-13','# format: batch|originalPath|sha256|date|adjudication','')
$summary = @('# SCRIPTS LIFECYCLE V2 SUMMARY - 2026-11-13','','batch|action|tag|preCommit|postCommit|files|hashRows|negativeAssertions')

foreach ($batch in $batches) {
  & git rev-parse --verify HEAD | Out-Null
  Assert-True ($LASTEXITCODE -eq 0) 'git HEAD unavailable'
  & git tag $batch.tag
  Assert-True ($LASTEXITCODE -eq 0) "tag failed: $($batch.tag)"
  $preCommit = (& git rev-parse HEAD).Trim()
  Write-Output ("START batch={0} files={1} first={2}" -f $batch.id,$batch.files.Count,$batch.files[0])
  $ledgerPath = Join-Path $ledgerRoot ($batch.id + '.tsv')
  $ledger = @('batch'+[char]9+$batch.id,'action'+[char]9+$batch.action,'tag'+[char]9+$batch.tag,'preCommit'+[char]9+$preCommit,'pathHashRows'+[char]9+$batch.files.Count,'path'+[char]9+'action'+[char]9+'status'+[char]9+'sha256')
  foreach ($rel in $batch.files) {
    $full = [System.IO.Path]::GetFullPath((Join-Path $root $rel))
    Assert-True ($full.StartsWith($root + [System.IO.Path]::DirectorySeparatorChar,'OrdinalIgnoreCase')) "outside workspace: $rel"
    $hash = (Get-FileHash -LiteralPath $full -Algorithm SHA256).Hash
    $status = if (@(& git status --porcelain -- $rel).Count -gt 0) { 'dirty' } else { 'clean' }
    $ledger += ($rel + [char]9 + $batch.action + [char]9 + $status + [char]9 + $hash)
  }
  [System.IO.File]::WriteAllLines($ledgerPath,$ledger,(New-Object System.Text.UTF8Encoding($false)))

  foreach ($rel in $batch.files) {
    $leaf = Split-Path $rel -Leaf
    Assert-True ((Invoke-RgExit $leaf) -eq 1) "pre-remove external reference: $leaf"
    $source = Join-Path $root $rel
    $relative = $rel -replace '^scripts[\\/]', ''
    $target = Join-Path $archiveRoot $relative
    Assert-True (-not (Test-Path -LiteralPath $target)) "archive target exists: $target"
    New-Item -ItemType Directory -Force -Path (Split-Path $target -Parent) | Out-Null
    Copy-Item -LiteralPath $source -Destination $target
    $sourceHash = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash
    $targetHash = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash
    Assert-True ($sourceHash -eq $targetHash) "archive hash mismatch: $rel"
    $adjudication = if ($batch.id -eq 'V2-B01') { 'deai-calibration-chain-retired' } else { 'quarantine-only-retired' }
    $manifest += ($batch.id + '|' + $rel + '|' + $targetHash + '|2026-11-13|' + $adjudication)
  }
  [System.IO.File]::WriteAllLines($manifestPath,$manifest,(New-Object System.Text.UTF8Encoding($false)))

  foreach ($rel in $batch.files) {
    & git rm -- $rel
    Assert-True ($LASTEXITCODE -eq 0) "git rm failed: $rel"
  }
  & git add -- $ledgerPath
  & git add -- $archiveRoot
  Assert-True ($LASTEXITCODE -eq 0) "stage failed: $($batch.id)"
  $changed = @(& git diff --name-only --cached)
  Assert-True ($changed.Count -gt 0) "no staged changes: $($batch.id)"
  foreach ($changedPath in $changed) {
    $allowed = $changedPath -like 'scripts/*' -or $changedPath -like '_audit/scripts-lifecycle/archive/v2/*' -or $changedPath -like '_audit/scripts-lifecycle/BATCH_LEDGERS/*'
    Assert-True $allowed "disallowed staged path: $changedPath"
  }
  $negative = 0
  foreach ($rel in $batch.files) {
    Assert-True ((Invoke-RgExit (Split-Path $rel -Leaf)) -eq 1) "post-remove external reference: $rel"
    $negative++
  }
  $commitMessage = 'chore(scripts): lifecycle ' + $batch.id
  & git commit -m $commitMessage
  Assert-True ($LASTEXITCODE -eq 0) "commit failed: $($batch.id)"
  $postCommit = (& git rev-parse HEAD).Trim()
  $residue = @(& git diff --name-only)
  Assert-True ($residue.Count -eq 0) "unstaged residue: $($batch.id)"
  $summary += ($batch.id + '|' + $batch.action + '|' + $batch.tag + '|' + $preCommit + '|' + $postCommit + '|' + $batch.files.Count + '|' + $batch.files.Count + '|' + $negative)
  Write-Output ("COMPLETE batch={0} tag={1} commit={2}" -f $batch.id,$batch.tag,$postCommit)
}
[System.IO.File]::WriteAllLines((Join-Path $root '_audit/scripts-lifecycle/P2_SUMMARY_V2_2026-11-13.tsv'),$summary,(New-Object System.Text.UTF8Encoding($false)))
Write-Output ("ALL_V2_BATCHES_COMPLETE total={0} files={1}" -f $batches.Count,@($batches | ForEach-Object { $_.files }).Count)
