$ErrorActionPreference = 'Stop'
$csv = @(Import-Csv -LiteralPath '_audit/scripts-lifecycle/INVENTORY_2026-11-13.csv')
$refs = @{}
Get-Content -LiteralPath 'scripts/tmp/refs-v2.tsv' | Select-Object -Skip 1 | ForEach-Object {
  $p = $_ -split '\|',4
  $refs[$p[0]] = [pscustomobject]@{ external=[int]$p[1]; refs=$p[2]; internal=$p[3] }
}
$alive = @($csv | Where-Object { Test-Path -LiteralPath $_.path })
$rows = @()
foreach ($row in $alive) {
  $rel = $row.path
  $r = $refs[$rel]
  if ($r.external -gt 0) { $action = 'keep' }
  elseif ($rel -match 'deai' -and $rel -notmatch 'decrypt-provider-key') { $action = 'archive-deai-calibration' }
  elseif ($rel -match 'decrypt-provider-key') { $action = 'keep-internal-decrypt-helper' }
  elseif ($rel -eq 'scripts\verify-api-direct-write-v2-e2e.mjs') { $action = 'archive-obsolete-e2e' }
  elseif ($row.disposition -eq 'quarantine-only') { $action = 'archive-quarantine-only' }
  else { throw "unclassified: $rel" }
  $rows += [pscustomobject]@{ path=$rel; disposition=$row.disposition; action=$action; externalRefs=$r.external; evidence=$r.refs; internalRefs=$r.internal }
}
$keep = @($rows | Where-Object { $_.action -like 'keep*' })
$deai = @($rows | Where-Object { $_.action -eq 'archive-deai-calibration' } | Sort-Object path)
$obsolete = @($rows | Where-Object { $_.action -eq 'archive-obsolete-e2e' })
$quarantine = @($rows | Where-Object { $_.action -eq 'archive-quarantine-only' } | Sort-Object path)
$archive = @($deai + $obsolete + $quarantine)
if ($keep.Count -ne 20) { throw "keep expected 20 got $($keep.Count)" }
if ($archive.Count -ne 74) { throw "archive expected 74 got $($archive.Count)" }
$inv = @('path,disposition,action,externalRefs,evidence,internalRefs')
foreach ($r in @($keep + $archive | Sort-Object path)) {
  $evidence = $r.evidence -replace '"','""'
  $internal = $r.internalRefs -replace '"','""'
  $inv += ('"{0}","{1}","{2}","{3}","{4}","{5}"' -f $r.path,$r.disposition,$r.action,$r.externalRefs,$evidence,$internal)
}
[System.IO.File]::WriteAllLines('_audit/scripts-lifecycle/INVENTORY_V2_2026-11-13.csv',$inv,(New-Object System.Text.UTF8Encoding($false)))
$batches = @(
  @{id='V2-B01'; action='archive'; tag='scripts-lifecycle-v2-01-archive-deai'; files=$deai},
  @{id='V2-B02'; action='archive'; tag='scripts-lifecycle-v2-02-archive-quarantine-a'; files=@($quarantine[0..19])},
  @{id='V2-B03'; action='archive'; tag='scripts-lifecycle-v2-03-archive-quarantine-b'; files=@($quarantine[20..39])},
  @{id='V2-B04'; action='archive'; tag='scripts-lifecycle-v2-04-archive-quarantine-c'; files=@($quarantine[40..55])},
  @{id='V2-B05'; action='archive'; tag='scripts-lifecycle-v2-05-archive-obsolete-e2e'; files=$obsolete}
)
$lines = @(
  '# BATCH PLAN V2 - 2026-11-13 - scripts lifecycle settlement',
  '',
  'Only the 76 surviving candidates are in scope. Non-zero external references stay. The deai calibration chain is archived as one closure. decrypt-provider-key helpers remain because npm/live verifiers invoke them. quarantine-only files are moved without content mutation.',
  '',
  ('alive={0} keep={1} archive={2}' -f $alive.Count,$keep.Count,$archive.Count),
  '',
  '## V2 batches',
  ''
)
foreach ($b in $batches) {
  $lines += ('### {0} | action={1} | count={2} | tag={3}' -f $b.id,$b.action,$b.files.Count,$b.tag)
  foreach ($f in $b.files) { $lines += '- ' + $f.path }
  $lines += ''
}
$lines += '## Keep'
$lines += ''
foreach ($f in ($keep | Sort-Object path)) { $lines += ('- {0} | external={1} | {2}' -f $f.path,$f.externalRefs,$f.evidence) }
$lines += ''
$lines += '## Archive'
$lines += ''
foreach ($f in $archive) { $lines += ('- {0} | {1}' -f $f.path,$f.action) }
[System.IO.File]::WriteAllLines('_audit/scripts-lifecycle/BATCH_PLAN_V2_2026-11-13.md',$lines,(New-Object System.Text.UTF8Encoding($false)))
$batchCounts = @($batches | ForEach-Object { $_.files.Count }) -join ','
Write-Output "inventoryRows=$($inv.Count-1); batches=$($batches.Count); batchCounts=$batchCounts"
