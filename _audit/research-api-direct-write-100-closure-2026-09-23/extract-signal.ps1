param(
  [string]$Dimension,
  [int]$Top = 12
)

$root = $PSScriptRoot
$patterns = @{
  protocol = @('tool_schema','additionalProperties','tool_choice','function call','tool_use','openai','anthropic','gemini','schema')
  permission = @('permission','approval','approve','deny','allow','tool_call_id','fail')
  editing = @('diff','checkpoint','edit','write','cursor','replace','apply','review')
  statemachine = @('checkpoint','state','resume','interrupt','recover','transition','thread')
  toolloop = @('loop','retry','tool call','converge','iteration','max_','stop')
  observability = @('trace','telemetry','span','usage','token','event','log')
  longdocument = @('context window','token','chunk','long context','truncate','pagination','budget')
  provider = @('openai','anthropic','gemini','azure','provider','retry','stream','usage')
  routing = @('intent','classifier','route','semantic','embedding','fallback','confidence')
  verification = @('test','e2e','playwright','electron','assert','regression','mock')
}

$terms = $patterns[$Dimension]
$rows = @()
foreach ($round in 11..20) {
  $file = Join-Path $root ("round-{0}-{1}.json" -f $round, $Dimension)
  if (-not (Test-Path -LiteralPath $file)) { continue }
  $json = Get-Content -LiteralPath $file -Raw | ConvertFrom-Json
  foreach ($repo in $json.repositories) {
    foreach ($cached in $repo.cachedFiles) {
      $score = 0
      $lower = ($cached.path + ' ' + $cached.excerpt).ToLowerInvariant()
      foreach ($term in $terms) {
        if ($lower.Contains($term.ToLowerInvariant())) { $score += 3 }
      }
      if ($cached.path -match '\.(ts|tsx|js|py|rs|go)$') { $score += 2 }
      if ($cached.path -match '(test|spec)') { $score += 1 }
      $rows += [pscustomobject]@{
        Score = $score
        Repo = $repo.fullName
        Stars = $repo.stars
        Path = $cached.path
        CachePath = $cached.cachePath
      }
    }
  }
}

$rows | Sort-Object Score -Descending | Select-Object -First $Top
