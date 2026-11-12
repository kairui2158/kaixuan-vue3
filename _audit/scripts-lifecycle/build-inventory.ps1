#Requires -Version 5.1
<#
P0 inventory builder for the ratified scripts-lifecycle audit (D1-D5).
Read-only over scripts/** and reference surfaces. Fails loudly on parse,
scan, or statistic drift. Self-test mode builds an isolated fixture and
asserts the instrument's failure paths and comment guards.
#>
[CmdletBinding()]
param(
  [switch]$SelfTest,
  [string]$Root,
  [int]$TimeoutSeconds = 180
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Assert-True {
  param([bool]$Condition, [string]$Message)
  if (-not $Condition) { throw $Message }
}

function Get-NormalRelPath {
  param([string]$FullPath, [string]$RootPath)
  $rel = $FullPath.Substring($RootPath.Length).TrimStart('\', '/')
  return $rel.Replace('/', '\')
}

function Invoke-Rg {
  param([string[]]$Patterns, [string[]]$Paths, [string[]]$AdditionalArgs = @())
  $rgArgs = @('--no-heading', '--line-number', '--color', 'never') + $Patterns + $Paths + $AdditionalArgs
  $raw = & rg @rgArgs 2>$null
  $code = $LASTEXITCODE
  if ($code -eq 2) { throw "rg scan failed (exit=2): $($rgArgs -join ' ')" }
  return @($raw | Where-Object { $null -ne $_ })
}

function Add-SurfaceHits {
  param([hashtable]$Map, [string[]]$Lines)
  foreach ($line in $Lines) {
    foreach ($m in [regex]::Matches($line, "(?i)scripts[/\\][A-Za-z0-9_\-./\\ ]+?\.(?:mjs|cjs|js|py|ps1|sh|cmd|bat|ts)")) {
      $p = ($m.Value -replace '/', '\') -replace '\\+', '\'
      if (-not $Map.ContainsKey($p)) { $Map[$p] = @() }
      if ($Map[$p] -notcontains $line) { $Map[$p] += $line }
    }
  }
}

function Get-LineRef {
  param([string]$RgLine)
  $parts = $RgLine -split ':', 3
  if ($parts.Count -ge 2) { return "$($parts[0]):$($parts[1])" }
  return $RgLine
}

function Get-MatchCount {
  param([string]$Text, [string]$Pattern)
  if ([string]::IsNullOrEmpty($Text)) { return 0 }
  return [regex]::Matches($Text, $Pattern).Count
}

function Resolve-ScriptDep {
  param([string]$FromRel, [string]$DepSpec, [hashtable]$FileMap, [string]$RootPath)
  $baseDir = Split-Path $FromRel -Parent
  $joined = Join-Path $baseDir $DepSpec
  $full = [System.IO.Path]::GetFullPath((Join-Path $RootPath $joined))
  if (-not $full.StartsWith($RootPath, [System.StringComparison]::OrdinalIgnoreCase)) { return $null }
  $rel = Get-NormalRelPath -FullPath $full -RootPath $RootPath
  $candidates = @($rel, "$rel.js", "$rel.mjs", "$rel.cjs", (Join-Path $rel 'index.js'), (Join-Path $rel 'index.mjs'), (Join-Path $rel 'index.cjs'))
  foreach ($cand in $candidates) {
    if ($FileMap.ContainsKey($cand)) { return $cand }
  }
  return $null
}

function New-FixtureRoot {
  param([string]$RootPath)
  New-Item -ItemType Directory -Force -Path (Join-Path $RootPath 'scripts') | Out-Null
  New-Item -ItemType Directory -Force -Path (Join-Path $RootPath '_audit\scripts-lifecycle') | Out-Null
  Set-Content -LiteralPath (Join-Path $RootPath 'package.json') -Value '{ "scripts": { "fixture-entry": "node scripts/silent.mjs" } }' -Encoding ASCII
  Set-Content -LiteralPath (Join-Path $RootPath 'scripts\silent.mjs') -Value "async function f(){ return await readFile('x').catch(() => ''); }" -Encoding ASCII
  Set-Content -LiteralPath (Join-Path $RootPath 'scripts\commented.mjs') -Value '// destructive example: taskkill /IM node.exe' -Encoding ASCII
  Set-Content -LiteralPath (Join-Path $RootPath 'scripts\ok.mjs') -Value "const t = setTimeout(() => {}, 1000); // taskkill mention in comment" -Encoding ASCII
  $dup = "console.log('dup');"
  Set-Content -LiteralPath (Join-Path $RootPath 'scripts\dup1.mjs') -Value $dup -Encoding ASCII
  Set-Content -LiteralPath (Join-Path $RootPath 'scripts\dup2.mjs') -Value $dup -Encoding ASCII
}

try {
  $script:deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  function Assert-Budget {
    param([string]$Phase)
    if ([DateTime]::UtcNow -gt $script:deadline) { throw "timeout budget exceeded at phase $Phase" }
  }

  Write-Output 'PHASE start: resolve root'
  if (-not $Root) {
    $Root = (& git rev-parse --show-toplevel).Trim()
  }
  $Root = [System.IO.Path]::GetFullPath($Root).TrimEnd('\', '/')
  Assert-True (Test-Path (Join-Path $Root 'scripts')) "scripts directory not found under root: $Root"

  $isGitRepo = $false
  $prevEap = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  & git -C $Root rev-parse --is-inside-work-tree 2>$null | Out-Null
  $ErrorActionPreference = $prevEap
  if ($LASTEXITCODE -eq 0) { $isGitRepo = $true }

  $runDate = (Get-Date).ToString('yyyy-MM-dd')
  if ($SelfTest) { New-FixtureRoot -RootPath $Root }
  Write-Output "PHASE root: $Root runDate=$runDate gitRepo=$isGitRepo"
  Assert-Budget 'root'

  Write-Output 'PHASE scan: enumerate scripts'
  $scriptFiles = @(Get-ChildItem (Join-Path $Root 'scripts') -Recurse -File)
  Assert-True ($scriptFiles.Count -gt 0) 'scripts enumeration returned zero files'
  $relPaths = @{}
  foreach ($f in $scriptFiles) {
    $rel = Get-NormalRelPath -FullPath $f.FullName -RootPath $Root
    Assert-True (-not $relPaths.ContainsKey($rel)) "duplicate normalized path: $rel"
    $relPaths[$rel] = $f.FullName
  }
  Write-Output "PHASE scan: scripts files=$($scriptFiles.Count)"
  Assert-Budget 'enumerate'

  Write-Output 'PHASE read: load contents'
  $contents = @{}
  foreach ($rel in $relPaths.Keys) {
    $text = [System.IO.File]::ReadAllText($relPaths[$rel])
    Assert-True ($text.Length -gt 0) "empty or unreadable script content: $rel"
    $contents[$rel] = $text
  }
  Assert-Budget 'read'

  Write-Output 'PHASE git: tracked set and last-commit dates'
  $trackedMap = @{}
  $commitDates = @{}
  if ($isGitRepo) {
    foreach ($line in (& git -C $Root ls-files -- scripts)) {
      $key = $line.Replace('/', '\')
      if ($key) { $trackedMap[$key] = $true }
    }
    Assert-True ($trackedMap.Count -gt 0) 'git ls-files returned zero tracked scripts'
    $lastTs = $null
    foreach ($line in (& git -C $Root log --name-only --pretty=format:'@@%ct' -- scripts)) {
      if ($line -like '@@*') {
        $lastTs = [int64]$line.Substring(2)
      } elseif ($line.Trim() -ne '' -and $null -ne $lastTs) {
        $key = $line.Replace('/', '\')
        if ($key.StartsWith('scripts\') -and -not $commitDates.ContainsKey($key)) {
          $commitDates[$key] = [DateTimeOffset]::FromUnixTimeSeconds($lastTs).LocalDateTime.ToString('yyyy-MM-dd')
        }
      }
    }
  }
  Assert-Budget 'git'

  Write-Output 'PHASE refs: npm entries'
  $npmEntryMap = @{}
  $pkgPath = Join-Path $Root 'package.json'
  if (Test-Path $pkgPath) {
    $pkg = Get-Content $pkgPath -Raw | ConvertFrom-Json
    Assert-True ($null -ne $pkg.scripts) 'package.json has no scripts section'
    foreach ($prop in $pkg.scripts.PSObject.Properties) {
      foreach ($tok in ($prop.Value -split '\s+')) {
        $t = $tok.Trim('"', "'")
        if ($t.StartsWith('scripts/')) {
          $key = $t.Replace('/', '\')
          if (-not $npmEntryMap.ContainsKey($key)) { $npmEntryMap[$key] = @() }
          if ($npmEntryMap[$key] -notcontains $prop.Name) { $npmEntryMap[$key] += $prop.Name }
        }
      }
    }
  }
  Assert-Budget 'npm'

  Write-Output 'PHASE refs: src/electron/doc surfaces'
  $srcElectronHits = @{}
  $docSpecHits = @{}
  $srcPaths = @()
  foreach ($p in @('src', 'electron')) { if (Test-Path (Join-Path $Root $p)) { $srcPaths += $p } }
  if (Test-Path $pkgPath) { $srcPaths += 'package.json' }
  if ($srcPaths.Count -gt 0) {
    Add-SurfaceHits -Map $srcElectronHits -Lines (Invoke-Rg -Patterns @('scripts/') -Paths $srcPaths)
  }
  $docPaths = @()
  if (Test-Path (Join-Path $Root 'docs')) { $docPaths += 'docs' }
  if (Test-Path (Join-Path $Root '.dependency-cruiser.cjs')) { $docPaths += '.dependency-cruiser.cjs' }
  $rootMd = @(Get-ChildItem $Root -File -Filter '*.md' | ForEach-Object { $_.FullName })
  if ($rootMd.Count -gt 0) { $docPaths += $rootMd }
  if ($docPaths.Count -gt 0) {
    Add-SurfaceHits -Map $docSpecHits -Lines (Invoke-Rg -Patterns @('scripts/') -Paths $docPaths -AdditionalArgs @('--glob', '*.md'))
  }
  Assert-Budget 'surfaces'

  Write-Output 'PHASE refs: internal dependency closure'
  $rxImport = "(?m)^\s*(?:import\s+[^;]*?from\s*|import\s*\(\s*|require\(\s*)['""](\.{1,2}/[^'""]+)['""]"
  $childMap = @{}
  $parentMap = @{}
  foreach ($rel in $relPaths.Keys) {
    $childMap[$rel] = @()
    $parentMap[$rel] = @()
    foreach ($m in [regex]::Matches($contents[$rel], $rxImport)) {
      $dep = Resolve-ScriptDep -FromRel $rel -DepSpec $m.Groups[1].Value -FileMap $relPaths -RootPath $Root
      if ($dep) {
        if ($childMap[$rel] -notcontains $dep) { $childMap[$rel] += $dep }
        if (-not $parentMap.ContainsKey($dep)) { $parentMap[$dep] = @() }
        if ($parentMap[$dep] -notcontains $rel) { $parentMap[$dep] += $rel }
      }
    }
  }
  $chainHeadTokens = @('decrypt-provider-key', 'style-profile-p0', 'style-profile', 'deai')
  $chainOrigin = @{}
  $queue = New-Object System.Collections.Generic.Queue[string]
  foreach ($rel in $relPaths.Keys) {
    $lower = $rel.ToLowerInvariant()
    foreach ($tok in $chainHeadTokens) {
      if ($lower.Contains($tok)) {
        if (-not $chainOrigin.ContainsKey($rel)) {
          $chainOrigin[$rel] = "head-token:$tok"
          $queue.Enqueue($rel)
        }
        break
      }
    }
    if ($rel -like 'scripts\lib\*' -or $rel -like 'scripts\tests\*') {
      if (-not $chainOrigin.ContainsKey($rel)) {
        $chainOrigin[$rel] = 'path-rule:lib-tests'
        $queue.Enqueue($rel)
      }
    }
  }
  while ($queue.Count -gt 0) {
    $current = $queue.Dequeue()
    foreach ($next in (@($childMap[$current]) + @($parentMap[$current]))) {
      if ($relPaths.ContainsKey($next) -and -not $chainOrigin.ContainsKey($next)) {
        $chainOrigin[$next] = "closure:$current"
        $queue.Enqueue($next)
      }
    }
    Assert-Budget 'closure'
  }
  Write-Output "PHASE refs: internal chain members=$($chainOrigin.Count)"
  Assert-Budget 'closure-end'

  Write-Output 'PHASE classify: build rows'
  $rxCatchSilent = "(?m)catch\s*(?:\([^)]*\))?\s*\{\s*\}|\.catch\(\s*\(\s*\)\s*=>\s*['""]{2}\s*\)|SilentlyContinue"
  $rxCommentCatch = "(?m)^\s*(?://|/\*|\*|#).*\bcatch\b"
  $rxDestructive = "(?m)^#.*(?:taskkill|Stop-Process|rmSync|unlinkSync|Remove-Item)|\b(?:taskkill|Stop-Process|rmSync|unlinkSync|Remove-Item)\b"
  $rxCommentDestructive = "(?m)^\s*(?://|/\*|\*|#).*(?:taskkill|Stop-Process|rmSync|unlinkSync|Remove-Item)"
  $rxSubprocess = "\b(?:spawnSync|spawn|execFileSync|execFile|execSync|Start-Process|Start-Job|Invoke-Expression)\b"
  $rxCommentSubprocess = "(?m)^\s*(?://|/\*|\*|#).*(?:spawnSync|spawn|execFileSync|execFile|execSync|Start-Process|Start-Job|Invoke-Expression)"
  $rxProvider = "(?i)\b(?:live[-_ ]?mode|live[-_ ]?provider|provider[-_ ]?live|api[_-]?key|baseurl|endpoint|providerchannel|supplier)\b"
  $rxCommentProvider = "(?m)^\s*(?://|/\*|\*|#).*(?:live[-_ ]?mode|live[-_ ]?provider|provider[-_ ]?live)"
  $rxLive = "(?i)\b(?:live[-_ ]?mode|live[-_ ]?provider|provider[-_ ]?live|SHENYI_[A-Z_]*LIVE)\b"
  $rxSecret = "(?i)(sk-[a-z0-9_-]{8,}|api[_-]?key\s*[=:]\s*['""][^'""]{8,})"
  $rxTimeoutSignal = "(?i)\b(?:timeout|timeouts|deadline|watchdog|abortsignal|settimeout|setinterval|timeoutms|requesttimeout|stopwatch|timer)\b"
  $rxCommentTimeout = "(?m)^\s*(?://|/\*|\*|#).*(?:timeout|timeouts|deadline|watchdog|abortsignal|settimeout|setinterval|timeoutms|requesttimeout|stopwatch|timer)"

  $hashMap = @{}
  $rows = @()
  $flagStats = @{ catchSilent = 0; catchSilentActive = 0; destructive = 0; destructiveActive = 0; subprocess = 0; provider = 0; live = 0; noTimeout = 0; noTimeoutActive = 0; secret = 0 }
  foreach ($rel in ($relPaths.Keys | Sort-Object)) {
    $text = $contents[$rel]
    $hash = (Get-FileHash -LiteralPath $relPaths[$rel] -Algorithm SHA256).Hash
    $hashMap[$rel] = $hash

    $catchTotal = Get-MatchCount $text $rxCatchSilent
    $catchComment = Get-MatchCount $text $rxCommentCatch
    $catchActive = [Math]::Max(0, $catchTotal - $catchComment)
    $destructiveTotal = Get-MatchCount $text $rxDestructive
    $destructiveComment = Get-MatchCount $text $rxCommentDestructive
    $destructiveActive = [Math]::Max(0, $destructiveTotal - $destructiveComment)
    $subprocessTotal = Get-MatchCount $text $rxSubprocess
    $subprocessComment = Get-MatchCount $text $rxCommentSubprocess
    $subprocessActive = [Math]::Max(0, $subprocessTotal - $subprocessComment)
    $providerTotal = Get-MatchCount $text $rxProvider
    $providerComment = Get-MatchCount $text $rxCommentProvider
    $providerActive = [Math]::Max(0, $providerTotal - $providerComment)
    $liveTotal = Get-MatchCount $text $rxLive
    $liveComment = Get-MatchCount $text $rxCommentProvider
    $liveActive = [Math]::Max(0, $liveTotal - $liveComment)
    $secretTotal = Get-MatchCount $text $rxSecret
    $secretActive = $secretTotal
    $timeoutTotal = Get-MatchCount $text $rxTimeoutSignal
    $timeoutComment = Get-MatchCount $text $rxCommentTimeout
    $timeoutActive = [Math]::Max(0, $timeoutTotal - $timeoutComment)

    if ($catchTotal -gt 0) { $flagStats.catchSilent++ }
    if ($catchActive -gt 0) { $flagStats.catchSilentActive++ }
    if ($destructiveTotal -gt 0) { $flagStats.destructive++ }
    if ($destructiveActive -gt 0) { $flagStats.destructiveActive++ }
    if ($subprocessActive -gt 0) { $flagStats.subprocess++ }
    if ($providerActive -gt 0) { $flagStats.provider++ }
    if ($liveActive -gt 0) { $flagStats.live++ }
    if ($timeoutTotal -eq 0) { $flagStats.noTimeout++ }
    if ($timeoutActive -eq 0) { $flagStats.noTimeoutActive++ }
    if ($secretTotal -gt 0) { $flagStats.secret++ }

    if ($npmEntryMap.ContainsKey($rel)) {
      $entryClass = 'npm'
      $evidence = 'package.json:' + ($npmEntryMap[$rel] -join '|')
      $reason = 'npm entry reference; keep as long-term regression asset'
    } elseif ($srcElectronHits.ContainsKey($rel)) {
      $entryClass = 'src-electron'
      $evidence = (@($srcElectronHits[$rel] | ForEach-Object { Get-LineRef $_ }) | Select-Object -First 2) -join '; '
      $reason = 'src/electron reference; keep as delivery asset'
    } elseif ($docSpecHits.ContainsKey($rel)) {
      $entryClass = 'doc-spec'
      $evidence = (@($docSpecHits[$rel] | ForEach-Object { Get-LineRef $_ }) | Select-Object -First 2) -join '; '
      $reason = 'doc/spec reference; keep as spec asset; P1 verifies current spec validity'
    } elseif ($chainOrigin.ContainsKey($rel)) {
      $entryClass = 'internal-chain'
      $evidence = $chainOrigin[$rel]
      $reason = 'internal chain closure member; P1 adjudicates as one chain'
    } else {
      $entryClass = 'none'
      $evidence = 'no-external-entry'
      $reason = 'no external entry; P1 four-question adjudication required'
    }

    $flags = @()
    if ($catchActive -gt 0) { $flags += 'catch-silent' }
    if ($destructiveActive -gt 0) { $flags += 'destructive' }
    if ($subprocessActive -gt 0) { $flags += 'subprocess' }
    if ($providerActive -gt 0) { $flags += 'provider' }
    if ($liveActive -gt 0) { $flags += 'live-provider' }
    if ($timeoutActive -eq 0) { $flags += 'no-timeout' }
    if ($secretTotal -gt 0) { $flags += 'secret-suspicion' }

    $disposition = 'decision-required'
    if ($entryClass -eq 'npm' -or $entryClass -eq 'src-electron') {
      $disposition = 'keep'
      if ($secretTotal -gt 0) { $reason += '; secret-suspicion requires P1 review' }
    } elseif ($entryClass -eq 'doc-spec') {
      $disposition = 'keep'
    } elseif ($secretTotal -gt 0) {
      $disposition = 'quarantine-only'
      $reason += '; secret-suspicion: isolate only, no deletion'
    }

    $tracked = if ($trackedMap.ContainsKey($rel)) { 'true' } else { 'false' }
    $commitDate = if ($commitDates.ContainsKey($rel)) { $commitDates[$rel] } else { '' }
    $rows += [pscustomobject]@{
      path = $rel
      sizeBytes = (Get-Item -LiteralPath $relPaths[$rel]).Length
      lastCommitDate = $commitDate
      gitTracked = $tracked
      entryClass = $entryClass
      qualityFlags = ($flags -join ';')
      evidenceRefs = $evidence
      disposition = $disposition
      reason = $reason
    }
    Assert-Budget 'classify'
  }

  $classStats = @{}
  foreach ($row in $rows) { $classStats[$row.entryClass] = 1 + ($classStats[$row.entryClass] | ForEach-Object { $_ }) }
  Assert-Budget 'classify-end'

  Write-Output 'PHASE write: csv'
  $outDir = Join-Path $Root '_audit\scripts-lifecycle'
  New-Item -ItemType Directory -Force -Path $outDir | Out-Null
  $csvPath = Join-Path $outDir ("INVENTORY_$runDate.csv")
  $allowedDispositions = @('keep', 'retire', 'archive', 'fix-quality', 'quarantine-only', 'decision-required')
  $allowedClasses = @('npm', 'src-electron', 'doc-spec', 'internal-chain', 'none')
  $csvLines = @('path,sizeBytes,lastCommitDate,gitTracked,entryClass,qualityFlags,evidenceRefs,disposition,reason')
  foreach ($row in $rows) {
    Assert-True ($allowedDispositions -contains $row.disposition) "invalid disposition: $($row.path) $($row.disposition)"
    Assert-True ($allowedClasses -contains $row.entryClass) "invalid entryClass: $($row.path) $($row.entryClass)"
    Assert-True ($row.reason.Length -gt 0) "missing reason: $($row.path)"
    $cells = @($row.path, $row.sizeBytes, $row.lastCommitDate, $row.gitTracked, $row.entryClass, $row.qualityFlags, $row.evidenceRefs, $row.disposition, $row.reason)
    $encoded = ($cells | ForEach-Object { '"' + ("$_" -replace '"', '""') + '"' }) -join ','
    $csvLines += $encoded
  }
  [System.IO.File]::WriteAllLines($csvPath, $csvLines, (New-Object System.Text.UTF8Encoding($false)))
  $csvSha = (Get-FileHash -LiteralPath $csvPath -Algorithm SHA256).Hash
  Assert-Budget 'write'

  Write-Output 'PHASE verify: csv roundtrip and totals'
  $parsed = @(Import-Csv -LiteralPath $csvPath)
  Assert-True ($parsed.Count -eq $scriptFiles.Count) "inventory row count $($parsed.Count) != scripts files $($scriptFiles.Count)"
  Assert-True ($classStats.Keys.Count -gt 0) 'classification produced zero classes'
  $classSum = 0
  foreach ($k in $classStats.Keys) { $classSum += $classStats[$k] }
  Assert-True ($classSum -eq $scriptFiles.Count) "class sum $classSum != total $($scriptFiles.Count)"
  if (-not $SelfTest) {
    Assert-True (($npmEntryMap.Count) -ge 1) 'npm entry map is empty in repo mode'
    Assert-True (($docSpecHits.Count) -ge 1) 'doc/spec surface produced zero hits in repo mode'
    Assert-True (($chainOrigin.Count) -ge 1) 'internal chain closure produced zero members in repo mode'
  }
  Assert-True ($flagStats.catchSilentActive -le $flagStats.catchSilent) 'active catch-silent exceeds baseline'
  Assert-True ($flagStats.destructiveActive -le $flagStats.destructive) 'active destructive exceeds baseline'
  Assert-Budget 'verify'

  $dupGroups = @($hashMap.GetEnumerator() | Group-Object -Property Value | Where-Object { $_.Count -gt 1 })
  Write-Output 'PHASE canary: negative-path check'
  try {
    Assert-True $false 'canary-negative-path'
    throw 'canary assertion did not throw'
  } catch {
    if ($_.Exception.Message -ne 'canary-negative-path') { throw }
  }

  Write-Output '=== P0 INVENTORY SUMMARY ==='
  Write-Output "root=$Root"
  Write-Output "runDate=$runDate"
  Write-Output "total=$($scriptFiles.Count) tracked=$($trackedMap.Count) csvRows=$($parsed.Count)"
  $classOut = @()
  foreach ($k in @('npm', 'src-electron', 'doc-spec', 'internal-chain', 'none')) {
    $v = 0
    if ($classStats.ContainsKey($k)) { $v = $classStats[$k] }
    $classOut += "$k=$v"
  }
  Write-Output ("classes: " + ($classOut -join ' '))
  Write-Output ("qualityFiles: catchSilent=$($flagStats.catchSilent) catchSilentActive=$($flagStats.catchSilentActive) destructive=$($flagStats.destructive) destructiveActive=$($flagStats.destructiveActive) subprocess=$($flagStats.subprocess) provider=$($flagStats.provider) live=$($flagStats.live) noTimeout=$($flagStats.noTimeout) noTimeoutActive=$($flagStats.noTimeoutActive) secret=$($flagStats.secret)")
  Write-Output "duplicateGroups=$($dupGroups.Count)"
  Write-Output "csv=$csvPath"
  Write-Output "csvSha256=$csvSha"
  Write-Output '=== P0 INVENTORY COMPLETE ==='
} finally {
  Write-Output 'PHASE end'
}
