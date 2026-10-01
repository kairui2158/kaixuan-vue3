$ErrorActionPreference = "Stop"
$root = (Get-Location).Path
$work = Join-Path $root "_audit/agent-research/work"
$cache = Join-Path $root "_audit/agent-research/cache"
New-Item -ItemType Directory -Force -Path $work | Out-Null

$projects = @(
  @{
    id = "aider"; repo = "https://github.com/Aider-AI/aider.git"; paths = @(
      @{ path = "aider/models.py"; name = "aider-models.py" },
      @{ path = "aider/coders/editblock_coder.py"; name = "aider-editblock-coder.py" },
      @{ path = "aider/coders/editblock_prompts.py"; name = "aider-editblock-prompts.py" },
      @{ path = "aider/commands.py"; name = "aider-commands.py" }
    )
  },
  @{
    id = "continue"; repo = "https://github.com/continuedev/continue.git"; paths = @(
      @{ path = "extensions/cli/src/compaction.ts"; name = "continue-cli-compaction.ts" },
      @{ path = "extensions/cli/src/stream/streamChatResponse.autoCompaction.ts"; name = "continue-auto-compaction.ts" },
      @{ path = "extensions/cli/src/stream/handleToolCalls.ts"; name = "continue-handle-tool-calls.ts" },
      @{ path = "core/util/conversationCompaction.ts"; name = "continue-conversation-compaction.ts" },
      @{ path = "core/llm/countTokens.ts"; name = "continue-count-tokens.ts" }
    )
  },
  @{
    id = "vercel"; repo = "https://github.com/vercel/ai.git"; paths = @(
      @{ path = "examples/ai-functions/src/harness-agent/claude-code/stop-when.ts"; name = "vercel-agent-stop-when.ts" },
      @{ path = "examples/ai-functions/src/harness-agent/claude-code/compaction.ts"; name = "vercel-agent-compaction.ts" },
      @{ path = "examples/ai-functions/src/harness-agent/claude-code/resume.ts"; name = "vercel-agent-resume.ts" },
      @{ path = "examples/ai-functions/src/harness-agent/claude-code/multi-turn.ts"; name = "vercel-agent-multi-turn.ts" }
    )
  },
  @{
    id = "langgraph"; repo = "https://github.com/langchain-ai/langgraphjs.git"; paths = @(
      @{ path = "libs/checkpoint-postgres/src/index.ts"; name = "langgraph-checkpoint.ts" },
      @{ path = "libs/checkpoint-postgres/src/store/index.ts"; name = "langgraph-checkpoint-store.ts" }
    )
  },
  @{
    id = "cherry"; repo = "https://github.com/CherryHQ/cherry-studio.git"; paths = @(
      @{ path = "src/main/ai/contextBuild/resolveContextWindow.ts"; name = "cherry-resolve-context-window.ts" },
      @{ path = "src/main/ai/runtime/agentContextWindow.ts"; name = "cherry-agent-context-window.ts" },
      @{ path = "src/main/ai/tokens/footprint.ts"; name = "cherry-token-footprint.ts" },
      @{ path = "src/main/ai/provider/custom/__tests__/boundary/anthropic.maxOutputTokens.test.ts"; name = "cherry-max-output-boundary.test.ts" }
    )
  },
  @{
    id = "openhands"; repo = "https://github.com/All-Hands-AI/OpenHands.git"; paths = @(
      @{ path = "src/components/conversation-events/chat/event-content-helpers/get-action-content.ts"; name = "openhands-action-content.ts" },
      @{ path = "src/components/features/chat/components/chat-input-actions.tsx"; name = "openhands-chat-input-actions.tsx" }
    )
  }
)

foreach ($project in $projects) {
  $repoDir = Join-Path $work $project.id
  if (Test-Path -LiteralPath $repoDir) { Remove-Item -LiteralPath $repoDir -Recurse -Force }
  git clone --depth 1 --filter=blob:none --no-checkout $project.repo $repoDir
  Push-Location $repoDir
  git sparse-checkout init --no-cone
  $project.paths | ForEach-Object { $_.path } | git sparse-checkout set --stdin
  git checkout
  Pop-Location
  foreach ($item in $project.paths) {
    $src = Join-Path $repoDir $item.path
    $dst = Join-Path $cache $item.name
    Copy-Item -LiteralPath $src -Destination $dst -Force
  }
  Write-Host "DONE $($project.id)"
}
Get-ChildItem -LiteralPath $cache | Where-Object { $_.Name -match '^(aider|continue|vercel|langgraph|cherry|openhands)-' } | Select-Object Name,Length | Format-Table -AutoSize
