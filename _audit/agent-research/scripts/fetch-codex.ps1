$ErrorActionPreference = "Stop"

$root = (Get-Location).Path
$work = Join-Path $root "_audit/agent-research/work"
$repo = Join-Path $work "codex"
$target = Join-Path $work "codex-paths.txt"
New-Item -ItemType Directory -Force -Path $work | Out-Null
if (Test-Path -LiteralPath $repo) { Remove-Item -LiteralPath $repo -Recurse -Force }

$paths = @(
  "codex-rs/app-server/src/request_processors/turn_processor.rs",
  "codex-rs/core/src/session/token_budget.rs",
  "codex-rs/core/src/state/auto_compact_window.rs",
  "codex-rs/core/src/compact.rs",
  "codex-rs/core/src/compact_token_budget.rs",
  "codex-rs/core/src/tools/registry.rs",
  "codex-rs/core/src/tools/router.rs",
  "codex-rs/core/src/tools/handlers/multi_agents_v2/spawn.rs",
  "codex-rs/core/src/tools/handlers/multi_agents_v2/wait.rs",
  "codex-rs/core/src/tools/handlers/multi_agents_v2/interrupt_agent.rs",
  "codex-rs/core/src/tools/handlers/plan.rs",
  "codex-rs/core/src/tools/handlers/get_context_remaining.rs",
  "codex-rs/core/src/session/turn.rs",
  "codex-rs/core/src/state/turn_token_usage.rs",
  "codex-rs/core/src/tools/executed_tool_calls.rs",
  "codex-rs/core/src/session/context_window.rs",
  "codex-rs/core/src/agents_md.rs"
)
$paths | Set-Content -LiteralPath $target -Encoding UTF8

git clone --depth 1 --filter=blob:none --no-checkout https://github.com/openai/codex.git $repo
Set-Location $repo
git sparse-checkout init --no-cone
$input = Get-Content -LiteralPath $target
$input | git sparse-checkout set --stdin
git checkout
Set-Location $root

$cache = Join-Path $root "_audit/agent-research/cache"
$map = @{
  "codex-rs/app-server/src/request_processors/turn_processor.rs" = "codex-turn-processor.rs"
  "codex-rs/core/src/session/token_budget.rs" = "codex-session-token-budget.rs"
  "codex-rs/core/src/state/auto_compact_window.rs" = "codex-auto-compact-window.rs"
  "codex-rs/core/src/compact.rs" = "codex-compact.rs"
  "codex-rs/core/src/compact_token_budget.rs" = "codex-compact-token-budget.rs"
  "codex-rs/core/src/tools/registry.rs" = "codex-tools-registry.rs"
  "codex-rs/core/src/tools/router.rs" = "codex-tools-router.rs"
  "codex-rs/core/src/tools/handlers/multi_agents_v2/spawn.rs" = "codex-multiagent-spawn.rs"
  "codex-rs/core/src/tools/handlers/multi_agents_v2/wait.rs" = "codex-multiagent-wait.rs"
  "codex-rs/core/src/tools/handlers/multi_agents_v2/interrupt_agent.rs" = "codex-multiagent-interrupt.rs"
  "codex-rs/core/src/tools/handlers/plan.rs" = "codex-plan-tool.rs"
  "codex-rs/core/src/tools/handlers/get_context_remaining.rs" = "codex-context-remaining.rs"
  "codex-rs/core/src/session/turn.rs" = "codex-session-turn.rs"
  "codex-rs/core/src/state/turn_token_usage.rs" = "codex-turn-token-usage.rs"
  "codex-rs/core/src/tools/executed_tool_calls.rs" = "codex-executed-tool-calls.rs"
  "codex-rs/core/src/session/context_window.rs" = "codex-context-window.rs"
  "codex-rs/core/src/agents_md.rs" = "codex-agents-md.rs"
}
foreach ($entry in $map.GetEnumerator()) {
  $src = Join-Path $repo $entry.Key
  $dst = Join-Path $cache $entry.Value
  Copy-Item -LiteralPath $src -Destination $dst -Force
}
Get-ChildItem -LiteralPath $cache -Filter "codex-*" | Select-Object Name,Length | Format-Table -AutoSize
