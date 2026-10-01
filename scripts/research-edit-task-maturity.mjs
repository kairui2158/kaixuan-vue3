import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'

const OUT_DIR = '_audit/research-cache/edit-task-maturity-2026-09-22'
const LEDGER = '_audit/RESEARCH_2026-09-22_EDIT_TASK_MATURITY_SOURCES.json'

const REPOS = [
  { repo: 'All-Hands-AI/OpenHands', focus: 'state,event,action,security', query: 'class EventStream' },
  { repo: 'RooCodeInc/Roo-Code', focus: 'checkpoint,diff,strategy', query: 'CheckpointsProvider' },
  { repo: 'cline/cline', focus: 'tool,state,diff', query: 'DiffViewProvider' },
  { repo: 'continuedev/continue', focus: 'edit,context', query: 'performReplace' },
  { repo: 'Aider-AI/aider', focus: 'editblock,repomap,history', query: 'def find_original_update_blocks' },
  { repo: 'SWE-agent/SWE-agent', focus: 'editor,history,tool', query: 'str_replace_editor' },
  { repo: 'block/goose', focus: 'session,confirmation,tool', query: 'tool_confirmation' },
  { repo: 'langchain-ai/langgraph', focus: 'checkpoint,interrupt,resume', query: 'class BaseCheckpointSaver' },
  { repo: 'microsoft/autogen', focus: 'agent,session,state', query: 'class AgentRuntime' },
  { repo: 'crewAIInc/crewAI', focus: 'task,state,planner', query: 'class Task' },
  { repo: 'huggingface/smolagents', focus: 'agentloop,tool,state', query: 'class ToolCallingAgent' },
  { repo: 'openai/codex', focus: 'edit,apply,plan', query: 'apply_patch' },
  { repo: 'google-gemini/gemini-cli', focus: 'tool,edit,state', query: 'EditTool' },
  { repo: 'openai/openai-agents-python', focus: 'agentloop,tool', query: 'class Agent' },
  { repo: 'AgentOps-AI/agentops', focus: 'session,event,state', query: 'class Session' },
  { repo: 'langgenius/dify', focus: 'workflow,state,node', query: 'class WorkflowRun' },
  { repo: 'FlowiseAI/Flowise', focus: 'flow,state,execution', query: 'class ChatFlow' },
  { repo: 'n8n-io/n8n', focus: 'execution,state,resume', query: 'class WorkflowExecution' },
  { repo: 'temporalio/temporal', focus: 'durable,state,history', query: 'WorkflowExecutionHistory' },
  { repo: 'restatedev/restate', focus: 'durable,invocation,state', query: 'InvocationState' },
  { repo: 'sourcegraph/cody', focus: 'context,embedding,chat', query: 'ContextProvider' },
  { repo: 'sourcegraph/sourcegraph', focus: 'search,range,index', query: 'SearchQuery' },
  { repo: 'run-llama/llama_index', focus: 'index,retrieval,node', query: 'class BaseIndex' },
  { repo: 'tabbyml/tabby', focus: 'index,completion,context', query: 'CompletionStream' },
  { repo: 'jina-ai/reader', focus: 'document,chunk,reader', query: 'class Reader' },
  { repo: 'ast-grep/ast-grep', focus: 'structured,edit,range', query: 'struct Edit' },
  { repo: 'tree-sitter/tree-sitter', focus: 'range,parse,edit', query: 'ts_node_edit' },
  { repo: 'ProseMirror/prosemirror', focus: 'step,transform,history', query: 'Transform' },
  { repo: 'facebook/lexical', focus: 'editorstate,history,update', query: 'class EditorState' },
  { repo: 'yjs/yjs', focus: 'crdt,transaction,version', query: 'class Transaction' },
  { repo: 'automerge/automerge', focus: 'crdt,change,history', query: 'Change' },
  { repo: 'toeverything/AFFiNE', focus: 'doc,history,undo', query: 'UndoRedo' },
  { repo: 'logseq/logseq', focus: 'file,persist,state', query: 'FileSync' },
  { repo: 'outline/outline', focus: 'document,revision,edit', query: 'class Document' },
  { repo: 'microsoft/monaco-editor', focus: 'edit,range,model', query: 'EditOperation' },
  { repo: 'microsoft/vscode', focus: 'undo,edit,batch', query: 'class UndoRedoService' },
  { repo: 'neovim/neovim', focus: 'undo,extmark,buffer', query: 'undo_time' },
  { repo: 'zed-industries/zed', focus: 'edit,buffer,version', query: 'struct BufferSnapshot' },
  { repo: 'smallcloudai/refact', focus: 'agent,edit,diff', query: 'EditTool' },
  { repo: 'semgrep/semgrep', focus: 'range,match,edit', query: 'Range' },
  { repo: 'mendableai/firecrawl', focus: 'job,queue,state', query: 'Job' },
  { repo: 'getsentry/sentry-javascript', focus: 'transport,retry,event', query: 'class Transport' },
  { repo: 'dapr/dapr', focus: 'workflow,state,resume', query: 'type WorkflowState' },
  { repo: 'apache/airflow', focus: 'task,state,run', query: 'class TaskInstance' },
  { repo: 'PrefectHQ/prefect', focus: 'flow,run,state', query: 'class FlowRun' },
  { repo: 'argoproj/argo-workflows', focus: 'workflow,node,state', query: 'type NodeStatus' },
  { repo: 'temporalio/sdk-typescript', focus: 'workflow,history,resume', query: 'class Workflow' },
  { repo: 'cloudstateio/cloudstate', focus: 'entity,state,crdt', query: 'Entity' },
  { repo: 'openai/swarm', focus: 'agent,loop,tool', query: 'def run' },
  { repo: 'pydantic/pydantic-ai', focus: 'agent,run,tool', query: 'class Agent' },
  { repo: 'microsoft/semantic-kernel', focus: 'agent,planner,step', query: 'class Plan' },
  { repo: 'openlit/openlit', focus: 'trace,span,session', query: 'class Span' },
  { repo: 'traceloop/openllmetry', focus: 'trace,span,tool', query: 'class Span' },
  { repo: 'aristanetworks/goarista', focus: 'monotonic,state', query: 'type State' },
  { repo: 'llmware-ai/llmware', focus: 'agent,state,library', query: 'class Agent' },
  { repo: 'wandb/wandb', focus: 'run,history,checkpoint', query: 'class Run' },
  { repo: 'mlflow/mlflow', focus: 'run,state,checkpoint', query: 'class Run' },
  { repo: 'openai/openai-agents-js', focus: 'agentloop,tool,run', query: 'class Run' },
  { repo: 'vercel/ai', focus: 'stream,toolloop,partial', query: 'toolCallStreaming' },
  { repo: 'modelcontextprotocol/modelcontextprotocol', focus: 'tool,protocol,call', query: 'CallToolRequest' },
  { repo: 'modelcontextprotocol/servers', focus: 'filesystem,tool,edit', query: 'search' },
  { repo: 'microsoft/TypeScript', focus: 'edit,range,version', query: 'changeKind' },
  { repo: 'redis/om', focus: 'entity,state,persistence', query: 'Entity' },
]

function ghApi(path, headers = {}) {
  const args = ['api', path]
  for (const [key, value] of Object.entries(headers)) args.push('-H', `${key}: ${value}`)
  const stdout = execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  return JSON.parse(stdout)
}

function ghSearch(repo, query) {
  const q = `repo:${repo} ${query}`
  const path = `search/code?q=${encodeURIComponent(q)}&per_page=30`
  return ghApi(path, { Accept: 'application/vnd.github.text-match+json' })
}

function sanitizePath(path) {
  return path.replace(/[^a-zA-Z0-9._-]+/g, '__').slice(-180)
}

function downloadRaw(repo, branch, path) {
  const api = `repos/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`
  return execFileSync('gh', ['api', '-H', 'Accept: application/vnd.github.raw', api], {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  })
}

function scorePath(path) {
  if (!/\.(ts|tsx|js|jsx|py|rs|go|java|kt|rb|cs|c|cpp|h|md)$/i.test(path)) return 0
  let score = 1
  if (/(state|checkpoint|session|task|plan|planner|history|event)/i.test(path)) score += 4
  if (/(edit|diff|patch|replace|apply|undo|rollback|version|range|context|index|retriev|tool|loop|resume|interrupt)/i.test(path)) score += 4
  if (/(_test_|\.spec\.|\/tests?\/|\/__tests__\/|\.md$)/i.test(path)) score -= 2
  if (/(src|lib|core|packages|apps)\//.test(path)) score += 1
  return score
}

const EXCERPT_RE = /(^|\s)(class|interface|type|enum|struct|const|function|def|fn|impl|public|private|export|async)\b|(throw |Error|retry|rollback|undo|checkpoint|interrupt|resume|partial|version|hash|diff|range|limit|batch|state|history|plan)/i

function extractExcerpts(text) {
  const lines = text.split(/\r?\n/)
  const excerpts = []
  for (let i = 0; i < lines.length && excerpts.length < 70; i++) {
    if (!EXCERPT_RE.test(lines[i])) continue
    const start = Math.max(0, i - 1)
    const end = Math.min(lines.length - 1, i + 3)
    excerpts.push({
      line: i + 1,
      text: lines.slice(start, end + 1).join('\n').slice(0, 1200),
    })
    i = end
  }
  return excerpts
}

function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)) }

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })
  const previous = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : []
  const done = new Set(previous.map(entry => entry.repo))
  const results = [...previous]
  let searchCalls = 0

  for (const item of REPOS) {
    if (done.has(item.repo)) continue
    try {
      if (searchCalls >= 28) {
        console.log(`[rate] waiting 62s after ${searchCalls} searches`)
        await delay(62000)
        searchCalls = 0
      }
      const meta = ghApi(`repos/${item.repo}`)
      await delay(1800)
      const search = ghSearch(item.repo, `"${item.query}"`)
      searchCalls++
      await delay(2300)
      const paths = [...new Set((search.items || []).map(entry => entry.path))]
        .map(path => ({ path, score: scorePath(path) }))
        .filter(entry => entry.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 6)

      const files = []
      for (const entry of paths) {
        try {
          const raw = downloadRaw(item.repo, meta.default_branch, entry.path)
          if (!raw || raw.length > 400000) continue
          const rel = `${item.repo}__${sanitizePath(entry.path)}`
          const file = join(OUT_DIR, rel)
          mkdirSync(dirname(file), { recursive: true })
          writeFileSync(file, raw, 'utf8')
          files.push({
            path: entry.path,
            score: entry.score,
            bytes: Buffer.byteLength(raw),
            cache: file,
            excerpts: extractExcerpts(raw),
          })
          await delay(350)
        } catch (error) {
          files.push({ path: entry.path, score: entry.score, error: String(error.message || error).slice(0, 200) })
        }
      }

      results.push({
        repo: item.repo,
        focus: item.focus,
        searchQuery: item.query,
        url: meta.html_url,
        defaultBranch: meta.default_branch,
        stars: meta.stargazers_count,
        language: meta.language,
        description: meta.description,
        updatedAt: meta.updated_at,
        matchedPathCount: (search.items || []).length,
        files,
      })
      writeFileSync(LEDGER, JSON.stringify(results, null, 2), 'utf8')
      console.log(`[ok] ${item.repo}: ${files.filter(file => file.excerpts).length}/${paths.length} files`)
    } catch (error) {
      results.push({
        repo: item.repo,
        focus: item.focus,
        searchQuery: item.query,
        error: String(error.message || error).slice(0, 400),
      })
      writeFileSync(LEDGER, JSON.stringify(results, null, 2), 'utf8')
      console.log(`[err] ${item.repo}: ${error.message}`)
      await delay(2000)
    }
  }

  console.log(`[done] ${results.length} repos recorded; ${results.filter(entry => !entry.error).length} complete`)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
