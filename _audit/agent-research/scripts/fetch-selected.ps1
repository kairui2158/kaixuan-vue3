param(
  [string]$ManifestFile = "_audit/agent-research/selected.json",
  [string]$CacheDir = "_audit/agent-research/cache"
)

$ErrorActionPreference = "Stop"
$headers = @{ "User-Agent" = "novel-workshop-agent-research" }
$items = Get-Content -LiteralPath $ManifestFile -Raw | ConvertFrom-Json
$manifest = @()

foreach ($item in $items) {
  $raw = "https://raw.githubusercontent.com/$($item.repo)/$($item.branch)/$($item.path)"
  $target = Join-Path $CacheDir $item.name
  Write-Host "FETCH $($item.repo) $($item.path)"
  Invoke-WebRequest -Uri $raw -Headers $headers -OutFile $target
  $size = (Get-Item -LiteralPath $target).Length
  $manifest += [pscustomobject]@{
    repo = $item.repo; branch = $item.branch; path = $item.path
    url = $raw; cache = $target; bytes = $size; topic = $item.topic
  }
}

$manifestPath = Join-Path $CacheDir "fetch-manifest.json"
if (Test-Path -LiteralPath $manifestPath) {
  $old = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
  $merged = @($old) + $manifest
  $seen = @{}
  $deduped = @()
  foreach ($entry in $merged) {
    $key = "$($entry.repo)|$($entry.path)"
    if (-not $seen.ContainsKey($key)) { $seen[$key] = $true; $deduped += $entry }
  }
  $deduped | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
} else {
  $manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
}
Write-Host "SAVED $manifestPath"
