#Requires -Version 5.1
<#
P1 batch planner for the ratified scripts-lifecycle audit.
Conservative rule: any fixed-name reference outside the candidate closure keeps
the file or whole chain. Only zero-reference closures enter P2.
#>
[CmdletBinding()]
param(
  [string]$Root,
  [string]$InventoryDate = '2026-11-13'
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

if (-not $Root) { $Root = (& git rev-parse --show-toplevel).Trim() }
$Root = [System.IO.Path]::GetFullPath($Root).TrimEnd('\', '/')
$inventoryPath = Join-Path $Root "_audit\scripts-lifecycle\INVENTORY_$InventoryDate.csv"

function Assert-True {
  param([bool]$Condition, [string]$Message)
  if (-not $Condition) { throw $Message }
}

function Invoke-RgFiles {
  param([string]$Pattern, [string[]]$Paths)
  $raw = & rg -l -F --no-messages $Pattern @Paths
  if ($LASTEXITCODE -eq 2) { throw "rg failed for $Pattern" }
  return @($raw | Where-Object { $_ -and $_.Trim() -ne '' } | ForEach-Object { $_.Replace('/', '\') })
}

function Get-ChainToken {
  param([string]$RelPath)
  if ($RelPath -match 'deai') { return 'deai' }
  if ($RelPath -match 'style-profile') { return 'style-profile' }
  if ($RelPath -match 'decrypt-provider-key') { return 'decrypt-provider-key' }
  return $null
}

function Get-Prefix {
  param([string]$RelPath)
  $leaf = Split-Path $RelPath -Leaf
  $stem = [System.IO.Path]::GetFileNameWithoutExtension($leaf)
  $parts = $stem.Split('-')
  if ($parts.Count -ge 2) { return ($parts[0] + '-' + $parts[1]).ToLowerInvariant() }
  return $stem.ToLowerInvariant()
}

$csv = @(Import-Csv -LiteralPath $inventoryPath)
Assert-True ($csv.Count -gt 0) 'inventory is empty'

$externalRoots = @()
foreach ($p in @('package.json', 'src', 'electron', 'docs')) {
  if (Test-Path (Join-Path $Root $p)) { $externalRoots += $p }
}
Assert-True ($externalRoots.Count -gt 0) 'external reference surfaces missing'

$externalRefs = @{}
$internalRefs = @{}
foreach ($row in $csv) {
  $rel = $row.path
  $full = Join-Path $Root $rel
  Assert-True (Test-Path -LiteralPath $full) "inventory path missing: $rel"
  $base = Split-Path $rel -Leaf
  $externalRefs[$rel] = @(Invoke-RgFiles -Pattern $base -Paths $externalRoots)
  $externalRefs[$rel] += @(Invoke-RgFiles -Pattern ($rel.Replace('\', '/')) -Paths $externalRoots)
  $allScripts = @(Invoke-RgFiles -Pattern $base -Paths @('scripts'))
  $allScripts += @(Invoke-RgFiles -Pattern ($rel.Replace('\', '/')) -Paths @('scripts'))
  $internalRefs[$rel] = @($allScripts | Where-Object { $_ -ne $rel })
}

$byToken = @{}
foreach ($row in $csv) {
  $token = Get-ChainToken $row.path
  if ($token) {
    if (-not $byToken.ContainsKey($token)) { $byToken[$token] = @() }
    $byToken[$token] += $row
  }
}

$dispositions = @{}
$refEvidence = @{}
foreach ($row in $csv) {
  $rel = $row.path
  $refEvidence[$rel] = "external=$(@($externalRefs[$rel]).Count);internal=$(@($internalRefs[$rel]).Count)"
  if ($rel -like 'scripts\tmp\*') {
    $dispositions[$rel] = 'archive'
    continue
  }
  if ($row.qualityFlags -match 'secret-suspicion') {
    $dispositions[$rel] = 'quarantine-only'
    continue
  }
  if ($row.entryClass -in @('npm', 'src-electron', 'doc-spec')) {
    $dispositions[$rel] = 'keep'
    continue
  }
}

foreach ($entry in $byToken.GetEnumerator()) {
  $members = @($entry.Value | ForEach-Object { $_.path })
  $outsideScriptRefs = @()
  foreach ($rel in $members) {
    $outsideScriptRefs += @($internalRefs[$rel] | Where-Object { $members -notcontains $_ })
  }
  $hasExternalRef = @($members | Where-Object { @($externalRefs[$_]).Count -gt 0 }).Count -gt 0
  if ($hasExternalRef -or $outsideScriptRefs.Count -gt 0) {
    foreach ($rel in $members) { $dispositions[$rel] = 'keep' }
  } elseif (-not $dispositions.ContainsKey($members[0])) {
    foreach ($rel in $members) { $dispositions[$rel] = 'archive' }
  }
}

foreach ($row in $csv) {
  $rel = $row.path
  if ($dispositions.ContainsKey($rel)) { continue }
  if (@($externalRefs[$rel]).Count -gt 0 -or @($internalRefs[$rel]).Count -gt 0) {
    $dispositions[$rel] = 'keep'
  } else {
    $dispositions[$rel] = 'retire'
  }
}

$batchRows = @()
foreach ($row in $csv) {
  $rel = $row.path
  $batchRows += [pscustomobject]@{
    path = $rel
    action = $dispositions[$rel]
    refs = $refEvidence[$rel]
    evidence = ($externalRefs[$rel] + $internalRefs[$rel] | Select-Object -First 4) -join '; '
  }
}

$tmp = @($batchRows | Where-Object { $_.action -eq 'archive' -and $_.path -like 'scripts\tmp\*' })
$chainArchive = @($batchRows | Where-Object { $_.action -eq 'archive' -and $_.path -notlike 'scripts\tmp\*' })
$retire = @($batchRows | Where-Object { $_.action -eq 'retire' } | Sort-Object path)
$keep = @($batchRows | Where-Object { $_.action -in @('keep', 'quarantine-only') } | Sort-Object path)

$groups = @{}
foreach ($row in $retire) { $p = Get-Prefix $row.path; if (-not $groups.ContainsKey($p)) { $groups[$p] = @() }; $groups[$p] += $row }
$retireBatches = @()
$batchNo = 1
foreach ($prefix in ($groups.Keys | Sort-Object)) {
  $files = @($groups[$prefix] | Sort-Object path)
  for ($i = 0; $i -lt $files.Count; $i += 20) {
    $slice = @($files[$i..([Math]::Min($i + 19, $files.Count - 1))])
    $retireBatches += [pscustomobject]@{
      id = ('B{0:D2}-RETIRE-{1}' -f $batchNo, $prefix.ToUpperInvariant())
      action = 'retire'
      tag = ('scripts-lifecycle-' + ($batchNo.ToString('00')) + '-retire')
      files = $slice
    }
    $batchNo++
  }
}
if ($chainArchive.Count -gt 0) {
  for ($i = 0; $i -lt $chainArchive.Count; $i += 20) {
    $slice = @($chainArchive[$i..([Math]::Min($i + 19, $chainArchive.Count - 1))])
    $retireBatches += [pscustomobject]@{
      id = ('B{0:D2}-ARCHIVE-CHAIN' -f $batchNo)
      action = 'archive'
      tag = ('scripts-lifecycle-' + ($batchNo.ToString('00')) + '-archive-chain')
      files = $slice
    }
    $batchNo++
  }
}
if ($tmp.Count -gt 0) {
  $retireBatches += [pscustomobject]@{
    id = ('B{0:D2}-ARCHIVE-TMP' -f $batchNo)
    action = 'archive'
    tag = 'scripts-lifecycle-archive-tmp'
    files = $tmp
  }
  $batchNo++
}

$outPath = Join-Path $Root '_audit\scripts-lifecycle\BATCH_PLAN_2026-11-13.md'
$lines = @(
  '# BATCH PLAN - 2026-11-13 - scripts lifecycle P1',
  '',
  '保守规则：任何固定文件名或相对路径在 package.json/src/electron/docs/scripts 中出现（候选闭包外），整文件或整链保留。零引用闭包才进入 P2。D1 tmp 归档。secret-suspicion 只隔离。',
  '',
  "inventory=$InventoryDate rows=$($csv.Count)",
  "actions: keep=$(@($batchRows | Where-Object action -eq 'keep').Count) quarantine-only=$(@($batchRows | Where-Object action -eq 'quarantine-only').Count) retire=$($retire.Count) archive=$(@($batchRows | Where-Object action -eq 'archive').Count)",
  '',
  '## P2 批次',
  ''
)
foreach ($batch in $retireBatches) {
  $lines += "### $($batch.id) | action=$($batch.action) | count=$($batch.files.Count) | tag=$($batch.tag)"
  foreach ($file in $batch.files) { $lines += '- ' + $file.path }
  $lines += ''
}
$lines += '## 保留与隔离'
$lines += ''
foreach ($file in $keep) { $lines += '- ' + $file.path + ' | ' + $file.action + ' | ' + $file.refs + ' | ' + $file.evidence }
$lines += ''
$lines += '## 归档/退役'
$lines += ''
foreach ($file in ($retire + $chainArchive + $tmp | Sort-Object path)) { $lines += '- ' + $file.path + ' | ' + $file.action + ' | ' + $file.refs }
[System.IO.File]::WriteAllLines($outPath, $lines, (New-Object System.Text.UTF8Encoding($false)))

Write-Output "batchPlan=$outPath"
Write-Output "keep=$(@($batchRows | Where-Object action -eq 'keep').Count) quarantine=$(@($batchRows | Where-Object action -eq 'quarantine-only').Count) retire=$($retire.Count) archive=$(@($batchRows | Where-Object action -eq 'archive').Count)"
Write-Output "batches=$($retireBatches.Count)"
