#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const OUT_DIR = path.join(ROOT, '_audit', 'research-api-direct-write-100-closure-2026-09-23')
const CACHE_DIR = path.join(OUT_DIR, 'cache')
fs.mkdirSync(CACHE_DIR, { recursive: true })

const GH = (...args) => ghApi(args)

async function ghApi(args) {
  const { spawn } = await import('node:child_process')
  return new Promise((resolve, reject) => {
    const child = spawn('gh', ['api', ...args], { cwd: ROOT, shell: false })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', chunk => { stdout += chunk })
    child.stderr.on('data', chunk => { stderr += chunk })
    child.on('error', reject)
    child.on('close', code => {
      if (code === 0) resolve(stdout)
      else reject(new Error(`gh api ${args.join(' ')} failed (${code}): ${stderr}`))
    })
  })
}

const ROUNDS = 20
const TARGET_REPOS_PER_DIMENSION = 8
const TARGET_FILES_PER_REPO = 2
const TARGET_BYTES_PER_FILE = 32000

const SEARCH_INTENTS_V2 = {
  protocol: [
    'tool result schema validation', 'strict json schema function arguments',
    'tool call argument parse error', 'structured output tool schema',
    'tool contract validation typescript', 'zod tool input validation',
    'json schema function parameters validation', 'tool invocation validation',
    'mcp input schema', 'agent tools typed schema'
  ],
  permission: [
    'tool call approval gate', 'write tool permission confirmation',
    'sandbox tool permission policy', 'tool access control list',
    'capability token tool authorization', 'permission denied tool execution',
    'user approval required tool', 'tool execution guard rails',
    'runtime tool permission broker', 'workspace trust tool permission'
  ],
  editing: [
    'editor apply edit transaction', 'document patch apply validation',
    'text document editing operations', 'edit apply before after blocks',
    'multi file edit tool agent', 'range edit text document',
    'editor command execute validation', 'document mutation undo redo',
    'patch based editing agent', 'structured edit diff apply'
  ],
  statemachine: [
    'workflow execution state persistence', 'durable execution checkpoint',
    'task execution state store', 'workflow retry compensation state',
    'workflow saga state machine', 'execution history event state',
    'workflow checkpoint recovery', 'task lifecycle state model',
    'cancel workflow execution state', 'workflow failure recovery'
  ],
  toolloop: [
    'agent loop max tool calls', 'tool call loop detector',
    'agentic loop stop condition', 'agent iteration guard limit',
    'repeated tool call prevention', 'agent loop progress detection',
    'tool use loop termination', 'agent executor loop',
    'runloop agent tools', 'agent loop supervision policy'
  ],
  observability: [
    'agent observability tool spans', 'tool call tracing instrumentation',
    'structured event log execution', 'trace export jsonl',
    'open telemetry agent instrumentation', 'agent run audit trail',
    'telemetry events agent execution', 'diagnostic events agent tool',
    'llm trace collector', 'execution trace serialization'
  ],
  longdocument: [
    'long context retrieval document chunks', 'million token retrieval pipeline',
    'document segmentation reading agent', 'large document chunk index',
    'context window management llm', 'token counting context budget',
    'document map summarization agent', 'rag long document reader',
    'scrolling context document reader', 'cursor based document pagination'
  ],
  provider: [
    'openai compatible tool calling', 'anthropic messages tool use',
    'google gemini function calling', 'azure openai tools sdk',
    'deepseek function calling client', 'multi provider llm gateway tools',
    'provider adapter tool calling', 'openai chat completions tools',
    'anthropic tool result blocks', 'gemini parallel function calls'
  ],
  routing: [
    'intent recognition fallback', 'utterance classification dataset',
    'intent detection eval set', 'semantic routing embedding classifier',
    'dialogue intent corpus', 'intent threshold calibration',
    'out of scope intent detection', 'tool selection classifier',
    'natural language command routing', 'intent router service'
  ],
  verification: [
    'electron app e2e automation', 'electron spectron playwright',
    'real user monitoring test', 'ui acceptance automation framework',
    'visual regression e2e', 'end to end test evidence',
    'smoke test electron app', 'regression suite e2e ui',
    'test evidence artifact', 'installer verification script'
  ]
}

const SEARCH_INTENTS = {
  protocol: [
    'agent tool schema validation', 'function calling json schema validation',
    'tool call arguments validation', 'openai function calling tools schema',
    'tool protocol validation', 'mcp tool schema validation',
    'agent tool input validation', 'structured tool arguments validation',
    'json schema tool call validation', 'tool call protocol validation'
  ],
  permission: [
    'tool approval state machine', 'agent tool permission policy',
    'human in the loop tool approval', 'tool permission service',
    'capability based tool authorization', 'tool policy enforcement',
    'least privilege tool permission', 'tool allowlist denylist',
    'session tool permission', 'permission gate tool call'
  ],
  editing: [
    'text editor edit command validation', 'atomic batch edit document',
    'editor write tool validation', 'document edit transaction',
    'multi edit atomic', 'edit command target validation',
    'document range replace', 'text edit diff apply',
    'editor command schema', 'batch editor operations'
  ],
  statemachine: [
    'task state machine checkpoint', 'workflow task state transitions',
    'durable task executor state', 'task resume checkpoint',
    'state transition guard', 'partial failure task state',
    'task cancellation state', 'checkpoint hash verification',
    'resumable task state machine', 'long running task state'
  ],
  toolloop: [
    'agent tool loop guard', 'tool call iteration limit',
    'agentic loop supervision', 'tool loop convergence',
    'agent loop max iterations', 'repeated tool call detection',
    'tool only rounds guard', 'agent loop progress',
    'tool loop timeout', 'agentic loop state'
  ],
  observability: [
    'llm observability tool call trace', 'agent trace event schema',
    'structured logging agent tool', 'telemetry tool call attributes',
    'audit log agent action', 'trace context budget',
    'run trace export json', 'diagnostic log agent',
    'event sourcing agent execution', 'observability semantic conventions genai'
  ],
  longdocument: [
    'long context document map', 'document map reader tool',
    'chunked document reading', 'cursor pagination document reader',
    'long document segmentation', 'large document retrieval reader',
    'context window budget', 'token budget context',
    'million token context', 'long document editor agent'
  ],
  provider: [
    'openai tool calls streaming', 'anthropic tool use streaming',
    'gemini function calling streaming', 'provider tool call adapter',
    'multi provider tool calling', 'azure openai tool call',
    'deepseek tool call', 'llm provider protocol adapter',
    'function calling protocol differences', 'tool result wire format'
  ],
  routing: [
    'intent classification training test split', 'intent router calibration',
    'semantic intent classification dataset', 'intent false positive evaluation',
    'dialog act classification corpus', 'conversational intent dataset',
    'intent routing confidence threshold', 'adversarial intent classification',
    'tool selection intent', 'user intent routing agent'
  ],
  verification: [
    'electron e2e real user simulation', 'playwright electron test',
    'electron integration test automation', 'ui test evidence capture',
    'manual verification evidence', 'acceptance test trace',
    'regression gate verification', 'test coverage gate',
    'release verification checklist', 'installer smoke test electron'
  ]
}

const SEED_REPOS = [
  'openai/openai-agents-js', 'openai/openai-agents-python', 'openai/codex',
  'Aider-AI/aider', 'cline/cline', 'RooCodeInc/Roo-Code', 'OpenHands/OpenHands',
  'continuedev/continue', 'vercel/ai', 'langchain-ai/langgraph',
  'modelcontextprotocol/modelcontextprotocol', 'modelcontextprotocol/servers',
  'microsoft/autogen', 'microsoft/semantic-kernel', 'huggingface/smolagents',
  'pydantic/pydantic-ai', 'google-gemini/gemini-cli', 'aaif-goose/goose',
  'SWE-agent/SWE-agent', 'microsoft/vscode', 'microsoft/monaco-editor',
  'facebook/lexical', 'ProseMirror/prosemirror-transform', 'ProseMirror/prosemirror-state',
  'ProseMirror/prosemirror-history', 'yjs/yjs', 'automerge/automerge',
  'toeverything/AFFiNE', 'outline/outline', 'logseq/logseq',
  'jina-ai/reader', 'firecrawl/firecrawl', 'langgenius/dify', 'FlowiseAI/Flowise',
  'n8n-io/n8n', 'temporalio/temporal', 'temporalio/sdk-typescript',
  'PrefectHQ/prefect', 'argoproj/argo-workflows', 'apache/airflow',
  'openlit/openlit', 'traceloop/openllmetry', 'mlflow/mlflow', 'wandb/wandb',
  'semgrep/semgrep', 'ast-grep/ast-grep', 'tree-sitter/tree-sitter',
  'zed-industries/zed', 'neovim/neovim', 'microsoft/TypeScript',
  'getsentry/sentry-javascript', 'smallcloudai/refact', 'tabbyml/tabby',
  'run-llama/llama_index', 'llmware-ai/llmware', 'openai/swarm',
  'crewAIInc/crewAI', 'restatedev/restate', 'dapr/dapr'
]

function safeName(value) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '_')
}

async function searchRepositories(query, limit) {
  const raw = await GH('-H', 'Accept: application/vnd.github+json', `search/repositories?q=${encodeURIComponent(query)}&per_page=${limit}`)
  const json = JSON.parse(raw)
  return (json.items || []).map(item => ({
    fullName: item.full_name,
    stars: item.stargazers_count,
    language: item.language,
    defaultBranch: item.default_branch,
    url: item.html_url,
    description: item.description || ''
  }))
}

async function listRepositoryFiles(repo) {
  try {
    const raw = await GH('-H', 'Accept: application/vnd.github+json', `repos/${repo}/git/trees/HEAD?recursive=1`)
    const json = JSON.parse(raw)
    return (json.tree || [])
      .filter(item => item.type === 'blob' && item.size && item.size <= 400000)
      .map(item => ({ path: item.path, size: item.size }))
  } catch {
    return []
  }
}

async function fetchFile(repo, branch, filePath) {
  try {
    const raw = await GH('-H', 'Accept: application/vnd.github.raw', `repos/${repo}/contents/${filePath}?ref=${branch}`)
    return raw
  } catch {
    return null
  }
}

function fileMatchesDimension(path, dimension) {
  const p = path.toLowerCase()
  if (!/\.(ts|tsx|js|jsx|py|rs|go|java|kt|md|json)$/.test(p)) return false
  const table = {
    protocol: /(schema|validation|tool|function.?call|protocol)/,
    permission: /(permission|approval|policy|author|allow|den?y|capabilit)/,
    editing: /(edit|editor|document|diff|patch|range|replace|transform)/,
    statemachine: /(state|checkpoint|transition|task|workflow|resume|cancel)/,
    toolloop: /(loop|iteration|agent|supervisor|converg|progress|timeout)/,
    observability: /(trace|telemetry|observ|audit|log|event|export|diagnostic)/,
    longdocument: /(chunk|retriev|reader|document|context|token|map|pagin|segment)/,
    provider: /(provider|openai|anthropic|gemini|azure|deepseek|adapter|stream)/,
    routing: /(intent|classif|router|route|dataset|corpus|eval|confidence|threshold)/,
    verification: /(test|e2e|playwright|electron|verification|acceptance|smoke|regression|spec)/
  }
  return table[dimension].test(p)
}

function scoreFile(path, dimension) {
  const p = path.toLowerCase()
  let score = 0
  const terms = {
    protocol: ['schema', 'validation', 'tool', 'function', 'protocol', 'arguments'],
    permission: ['permission', 'approval', 'policy', 'authorization', 'allowlist', 'denied'],
    editing: ['edit', 'editor', 'document', 'diff', 'patch', 'replace', 'atomic'],
    statemachine: ['state', 'checkpoint', 'transition', 'task', 'resume', 'cancel'],
    toolloop: ['loop', 'iteration', 'supervisor', 'convergence', 'progress', 'timeout'],
    observability: ['trace', 'telemetry', 'observability', 'audit', 'event', 'export'],
    longdocument: ['chunk', 'reader', 'document', 'context', 'token', 'pagination', 'map'],
    provider: ['provider', 'openai', 'anthropic', 'gemini', 'azure', 'deepseek', 'stream'],
    routing: ['intent', 'classification', 'router', 'dataset', 'corpus', 'evaluation'],
    verification: ['test', 'e2e', 'playwright', 'electron', 'verification', 'acceptance']
  }
  for (const term of terms[dimension]) if (p.includes(term)) score += 2
  if (/(test|spec|mock|fixture)/.test(p)) score -= 1
  if (/(node_modules|vendor|dist|build|min)/.test(p)) score -= 3
  return score
}

async function fetchDimension(dimension, roundNumber) {
  const intents = roundNumber > 10 ? SEARCH_INTENTS_V2[dimension] : SEARCH_INTENTS[dimension]
  const query = intents[(roundNumber - 1) % intents.length]
  const searchQuery = `${query} in:name,description,readme`
  let candidates = []
  try {
    candidates = await searchRepositories(searchQuery, 12)
  } catch (error) {
    return { dimension, round: roundNumber, query, error: error.message, repositories: [] }
  }
  candidates = candidates.filter(item => !item.fullName.includes('[bot]'))
  candidates.sort((a, b) => b.stars - a.stars)
  const selected = candidates.slice(0, TARGET_REPOS_PER_DIMENSION)

  const repositories = []
  for (const repo of selected) {
    const files = await listRepositoryFiles(repo.fullName)
    const matching = files
      .filter(file => fileMatchesDimension(file.path, dimension))
      .map(file => ({ ...file, score: scoreFile(file.path, dimension) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, TARGET_FILES_PER_REPO)

    const cachedFiles = []
    for (const file of matching) {
      const raw = await fetchFile(repo.fullName, repo.defaultBranch, file.path)
      if (!raw || raw.length > 400000) continue
      const cacheName = `${safeName(repo.fullName)}__${safeName(file.path)}`
      const cachePath = path.join(CACHE_DIR, `${cacheName}.txt`)
      fs.writeFileSync(cachePath, raw)
      cachedFiles.push({
        path: file.path,
        size: raw.length,
        cachePath: path.relative(ROOT, cachePath),
        excerpt: raw.slice(0, TARGET_BYTES_PER_FILE)
      })
    }
    repositories.push({
      fullName: repo.fullName,
      stars: repo.stars,
      language: repo.language,
      defaultBranch: repo.defaultBranch,
      url: repo.url,
      cachedFiles
    })
  }

  return { dimension, round: roundNumber, query, repositories }
}

async function fetchSeedRepository(repo, dimensions) {
  const { execFileSync } = await import('node:child_process')
  let repoMeta
  try {
    repoMeta = JSON.parse(execFileSync('gh', [
      'api',
      '-H', 'Accept: application/vnd.github+json',
      `repos/${repo}`
    ], { cwd: ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }))
  } catch (error) {
    return { fullName: repo, stars: null, language: null, defaultBranch: null, url: null, cachedFiles: [], error: error.message }
  }

  const files = await listRepositoryFiles(repo)
  const cachedFiles = []
  const matchedDimensions = []
  const fetchedPaths = new Set()
  for (const dimension of dimensions) {
    const matching = files
      .filter(file => fileMatchesDimension(file.path, dimension))
      .map(file => ({ ...file, score: scoreFile(file.path, dimension) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, TARGET_FILES_PER_REPO)
    if (matching.length > 0) matchedDimensions.push(dimension)
    for (const file of matching) {
      if (fetchedPaths.has(file.path)) continue
      const raw = await fetchFile(repo, repoMeta.default_branch, file.path)
      if (!raw || raw.length > 400000) continue
      fetchedPaths.add(file.path)
      const cacheName = `${safeName(repo)}__${safeName(file.path)}`
      const cachePath = path.join(CACHE_DIR, `${cacheName}.txt`)
      fs.writeFileSync(cachePath, raw)
      if (!cachedFiles.some(item => item.path === file.path)) {
        cachedFiles.push({ path: file.path, size: raw.length, cachePath: path.relative(ROOT, cachePath), excerpt: raw.slice(0, TARGET_BYTES_PER_FILE) })
      }
    }
  }

  return {
    fullName: repoMeta.full_name,
    stars: repoMeta.stargazers_count,
    language: repoMeta.language,
    defaultBranch: repoMeta.default_branch,
    url: repoMeta.html_url,
    cachedFiles,
    dimensions: matchedDimensions,
    seedDirect: true
  }
}

function mergeRepository(target, source, dimension) {
  if (!target.dimensions.includes(dimension)) target.dimensions.push(dimension)
  for (const file of source.cachedFiles) {
    if (!target.cachedFiles.some(item => item.path === file.path)) {
      target.cachedFiles.push({ path: file.path, size: file.size, cachePath: file.cachePath })
    }
  }
}

async function main() {
  const started = Date.now()
  const dimensions = Object.keys(SEARCH_INTENTS)
  const rounds = []
  const legacyCacheFile = path.join(OUT_DIR, 'legacy-rounds-01-10.json')
  const generateSummary = async () => {
    const uniqueRepos = new Map()
    const uniqueFiles = new Map()
    for (const round of rounds) {
      for (const repo of round.repositories || []) {
        if (!repo.cachedFiles?.length) continue
        const repoKey = repo.fullName.toLowerCase()
        if (!uniqueRepos.has(repoKey)) {
          uniqueRepos.set(repoKey, { fullName: repo.fullName, stars: repo.stars, language: repo.language, url: repo.url, dimensions: [], cachedFiles: [], seedDirect: Boolean(repo.seedDirect) })
        }
        mergeRepository(uniqueRepos.get(repoKey), repo, round.dimension)
      }
    }
    for (const entry of uniqueRepos.values()) {
      for (const file of entry.cachedFiles) {
        uniqueFiles.set(`${entry.fullName}/${file.path}`, file)
      }
    }
    const summary = {
      generatedAt: new Date().toISOString(),
      dimensions,
      rounds: ROUNDS,
      uniqueRepositories: uniqueRepos.size,
      uniqueCachedFiles: uniqueFiles.size,
      elapsedMs: Date.now() - started,
      repositories: [...uniqueRepos.values()],
      seedCoverage: SEED_REPOS.map(repo => ({
        repo,
        covered: uniqueRepos.has(repo.toLowerCase()),
        dimensions: (uniqueRepos.get(repo.toLowerCase())?.dimensions || [])
      })),
      repositoriesWithoutCachedFiles: rounds
        .flatMap(round => round.repositories.map(repo => ({
          fullName: repo.fullName,
          stars: repo.stars,
          language: repo.language,
          url: repo.url,
          dimension: round.dimension,
          round: round.round,
          query: round.query,
          cachedFileCount: (repo.cachedFiles || []).length
        })))
        .filter(entry => entry.cachedFileCount === 0)
        .map(entry => ({
          ...entry,
          fullNameLower: entry.fullName.toLowerCase()
        }))
        .filter((entry, index, array) => array.findIndex(item => item.fullNameLower === entry.fullNameLower) === index),
      failures: rounds.filter(round => round.error).length
    }
    fs.writeFileSync(path.join(OUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2))
    console.log(JSON.stringify({ uniqueRepositories: uniqueRepos.size, uniqueCachedFiles: uniqueFiles.size, seedCovered: summary.seedCoverage.filter(item => item.covered).length, seedTotal: SEED_REPOS.length, failures: summary.failures }, null, 2))
  }

  for (let roundNumber = 1; roundNumber <= ROUNDS; roundNumber++) {
    if (roundNumber < 11) continue

    for (const dimension of dimensions) {
      const roundFile = path.join(OUT_DIR, `round-${String(roundNumber).padStart(2, '0')}-${dimension}.json`)
      let result
      if (fs.existsSync(roundFile)) {
        const cachedRound = JSON.parse(fs.readFileSync(roundFile, 'utf8'))
        if (cachedRound.dimension !== dimension || cachedRound.round !== roundNumber) {
          console.error(`Round cache mismatch for ${roundFile}`)
          process.exit(1)
        }
        result = cachedRound
      } else {
        process.stdout.write(`round ${roundNumber}/${ROUNDS} ${dimension}\n`)
        result = await fetchDimension(dimension, roundNumber)
      }
      rounds.push(result)
      if (!fs.existsSync(roundFile)) {
        fs.writeFileSync(roundFile, JSON.stringify(result, null, 2))
      }
    }
  }

  if (fs.existsSync(legacyCacheFile)) {
    const legacyRounds = JSON.parse(fs.readFileSync(legacyCacheFile, 'utf8'))
    rounds.unshift(...legacyRounds)
  } else {
    console.error(`Missing legacy cache ${legacyCacheFile}; create it from the original summary before running v2 collection.`)
    process.exit(1)
  }

  const seedFile = path.join(OUT_DIR, 'seed-direct.json')
  let seedResults = []
  if (fs.existsSync(seedFile)) {
    seedResults = JSON.parse(fs.readFileSync(seedFile, 'utf8'))
  } else {
    seedResults = []
    for (const repo of SEED_REPOS) {
      process.stdout.write(`seed ${repo}\n`)
      const repository = await fetchSeedRepository(repo, dimensions)
      seedResults.push(repository)
      fs.writeFileSync(seedFile, JSON.stringify(seedResults, null, 2))
    }
  }
  for (const repository of seedResults) {
    if (!repository.cachedFiles?.length) continue
    rounds.push({
      dimension: 'seed',
      round: ROUNDS + 1,
      query: 'seed-direct',
      repositories: [repository]
    })
  }

  await generateSummary()
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
