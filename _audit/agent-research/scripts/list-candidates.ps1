param(
  [string]$OutFile = "_audit/agent-research/candidates.json"
)

$ErrorActionPreference = "Stop"
$headers = @{ "User-Agent" = "novel-workshop-agent-research" }

$repos = @(
  @{ id = "codex"; repo = "openai/codex"; branch = "main"; patterns = @("token_budget", "compact", "agent_loop", "tool", "session", "plan") },
  @{ id = "aider"; repo = "Aider-AI/aider"; branch = "main"; patterns = @("repo_map", "token", "model_info", "models", "editblock") },
  @{ id = "continue"; repo = "continuedev/continue"; branch = "main"; patterns = @("context_window", "token", "compaction", "toolCall") },
  @{ id = "vercel-ai"; repo = "vercel/ai"; branch = "main"; patterns = @("maxOutputTokens", "prepareStep", "toolCall", "agent-loop", "harness") },
  @{ id = "langgraphjs"; repo = "langchain-ai/langgraphjs"; branch = "main"; patterns = @("checkpoint", "recursionLimit", "state", "graph") },
  @{ id = "librechat"; repo = "danny-avila/LibreChat"; branch = "main"; patterns = @("maxTokens", "contextWindow", "context_window", "token") },
  @{ id = "cherry"; repo = "CherryHQ/cherry-studio"; branch = "main"; patterns = @("maxTokens", "contextWindow", "token") },
  @{ id = "cline"; repo = "cline/cline"; branch = "main"; patterns = @("model_info", "maxTokens", "contextWindow", "toolLoop", "loop_detector") },
  @{ id = "roo"; repo = "RooCodeInc/Roo-Code"; branch = "main"; patterns = @("model_info", "maxTokens", "contextWindow", "condense", "sliding") },
  @{ id = "openhands"; repo = "All-Hands-AI/OpenHands"; branch = "main"; patterns = @("action", "agent_controller", "state", "condensation") }
)

$result = @()
foreach ($entry in $repos) {
  $uri = "https://api.github.com/repos/$($entry.repo)/git/trees/$($entry.branch)?recursive=1"
  Write-Host "TREE $($entry.repo)"
  $tree = Invoke-RestMethod -Uri $uri -Headers $headers
  $files = @($tree.tree | Where-Object { $_.type -eq "blob" -and $_.path -match "\.(ts|tsx|js|py|rs)$" })
  $matched = foreach ($file in $files) {
    $hit = $false
    foreach ($pattern in $entry.patterns) {
      if (-not $pattern) { continue }
      if ($pattern.Contains("_")) {
        if ($file.path -like "*$pattern*") { $hit = $true; break }
      } else {
        if ($file.path -match $pattern) { $hit = $true; break }
      }
    }
    if ($hit) { $file }
  }
  $matches = @($matched | Select-Object -First 100 -Property path, size)
  $result += [pscustomobject]@{
    id = $entry.id
    repo = $entry.repo
    branch = $entry.branch
    truncated = $tree.truncated
    candidates = $matches
  }
}

$result | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $OutFile -Encoding UTF8
Write-Host "SAVED $OutFile"
