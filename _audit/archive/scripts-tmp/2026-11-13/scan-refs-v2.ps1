$ErrorActionPreference = 'Stop'
$csv = @(Import-Csv -LiteralPath '_audit/scripts-lifecycle/INVENTORY_2026-11-13.csv')
$alive = @($csv | Where-Object { Test-Path -LiteralPath $_.path })
$roots = @('package.json','src','electron','docs')
$scanOut = @('path|external|externalRefs|internal')
foreach ($row in $alive) {
  $rel = $row.path
  $base = Split-Path $rel -Leaf
  $relSlash = $rel -replace '\\','/'
  $external = @()
  foreach ($root in $roots) {
    $external += @(rg -l -F --no-messages $base $root | ForEach-Object { $_ -replace '/','\' })
    $external += @(rg -l -F --no-messages $relSlash $root | ForEach-Object { $_ -replace '/','\' })
  }
  $external = @($external | Sort-Object -Unique | Where-Object { $_ -ne $rel })
  $internalRaw = @(rg -l -F --no-messages $base scripts | ForEach-Object { $_ -replace '/','\' })
  $internalRaw += @(rg -l -F --no-messages $relSlash scripts | ForEach-Object { $_ -replace '/','\' })
  $internal = @($internalRaw | Sort-Object -Unique | Where-Object { $_ -ne $rel })
  $scanOut += ('{0}|{1}|{2}|{3}' -f $rel, $external.Count, (($external | Select-Object -First 5) -join '; '), (($internal | Sort-Object -Unique) -join '; '))
}
[System.IO.File]::WriteAllLines('scripts\tmp\refs-v2.tsv', $scanOut, (New-Object System.Text.UTF8Encoding($false)))
$keepExternal = @($scanOut | Select-Object -Skip 1 | Where-Object { ($_ -split '\|')[1] -ne '0' })
Write-Output ("alive={0}; externalKeep={1}" -f $alive.Count, $keepExternal.Count)
$keepExternal | ForEach-Object { $_ }
