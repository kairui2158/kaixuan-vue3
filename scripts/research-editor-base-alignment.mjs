#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

const ROOT = process.cwd()
const OUT_DIR = path.join(ROOT, '_audit', 'research-editor-base-alignment-2026-09-24')
const CACHE_DIR = path.join(OUT_DIR, 'cache')
fs.mkdirSync(CACHE_DIR, { recursive: true })

const ROUNDS = 10
const TARGET_REPOS_PER_DIMENSION = 8
const TARGET_FILES_PER_REPO = 2
const TARGET_BYTES_PER_FILE = 32000
const MIN_SOURCE_FILE_BYTES = 1500

const SEARCH_INTENTS = {
  'context-injection': [
    'context packing editor selection', 'document context window truncation editor',
    'editor context injection system prompt', 'large document prompt excerpt strategy',
    'editor active document context service', 'structured context pack llm editor',
    'prompt context full document replacement', 'editor context summary tool reader',
    'context provider editor state', 'editor context budget injection'
  ],
  'selection-tracking': [
    'editor selection state persistence', 'text selection range snapshot',
    'active editor selection sync', 'selection change editor state',
    'caret selection document position', 'inactive tab selection state',
    'editor selection restored focus', 'selection state undo history',
    'selection range editor plugin', 'editor selection coordinates conversion'
  ],
  'version-integrity': [
    'document version hash snapshot', 'editor content version tracking',
    'optimistic concurrency document version', 'snapshot content version editor',
    'document revision hash validation', 'editor state version vector',
    'version conflict document write', 'document checkpoint content hash',
    'editor versioned document store', 'document version consistency editor'
  ],
  'read-cap-policy': [
    'read range policy document', 'document read limit configuration',
    'editor read capability policy', 'document pagination size policy',
    'context window read limit', 'editor document reader limit',
    'read policy constants editor', 'model window document read',
    'document read channel capacity', 'editor read service limit'
  ],
  'undo-coordination': [
    'undo history single source editor', 'editor undo redo coordination',
    'document transaction undo stack', 'editor history plugin state',
    'batch edit undo atomic', 'undo manager document editor',
    'collaborative undo history reconciliation', 'editor undo stack store',
    'merge undo steps document', 'programmatic edit undo history'
  ],
  'find-replace': [
    'find replace editor implementation', 'document replace all editor',
    'search replace text editor', 'editor replace locked document',
    'find replace history editor', 'replace range editor command',
    'editor search replace service', 'document replace validation',
    'replace transaction editor state', 'find replace editor tests'
  ],
  'dual-entry-equivalence': [
    'editor entry equivalence tests', 'dual editor same document test',
    'editor parity test suite', 'cross editor integration test',
    'editor adapter equivalence', 'multiple editor instances state sync',
    'editor shared service tests', 'editor facade consistency',
    'editor compatibility test matrix', 'editor behavior contract tests'
  ]
}

const SEED_REPOS = [
  'microsoft/vscode', 'microsoft/monaco-editor', 'facebook/lexical',
  'ProseMirror/prosemirror-transform', 'ProseMirror/prosemirror-state',
  'ProseMirror/prosemirror-history', 'ProseMirror/prosemirror-view',
  'yjs/yjs', 'automerge/automerge', 'toeverything/AFFiNE',
  'outline/outline', 'logseq/logseq', 'openai/codex', 'Aider-AI/aider',
  'cline/cline', 'RooCodeInc/Roo-Code', 'OpenHands/OpenHands',
  'continuedev/continue', 'vercel/ai', 'zed-industries/zed',
  'neovim/neovim', 'jina-ai/reader'
]

function safeName(value) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '_')
}

function ghApi(...args) {
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

async function searchRepositories(query, limit) {
  const raw = await ghApi('-H', 'Accept: application/vnd.github+json', `search/repositories?q=${encodeURIComponent(query)}&per_page=${limit}`)
  const json = JSON.parse(raw)
  return (json.items || []).map(item => ({
    fullName: item.full_name,
    stars: item.stargazers_count,
    language: item.language,
    defaultBranch: item.default_branch,
    url: item.html_url,
    description: item.description || ''
  })).filter(item => !item.fullName.includes('[bot]'))
}

async function listRepositoryFiles(repo) {
  try {
    const raw = await ghApi('-H', 'Accept: application/vnd.github+json', `repos/${repo}/git/trees/HEAD?recursive=1`)
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
    return await ghApi('-H', 'Accept: application/vnd.github.raw', `repos/${repo}/contents/${filePath}?ref=${branch}`)
  } catch {
    return null
  }
}

function fileMatchesDimension(path, dimension) {
  const p = path.toLowerCase()
  if (!/\.(ts|tsx|js|jsx|py|rs|go|java|kt|md|json)$/.test(p)) return false
  if (/(assets|icons?|__snapshots__|\.d\.ts$)/.test(p)) return false
  const table = {
    'context-injection': /(context|prompt|inject|budget|window|excerpt|reader)/,
    'selection-tracking': /(selection|caret|cursor|focus|position)/,
    'version-integrity': /(version|revision|snapshot|hash|checkpoint|conflict|consistency)/,
    'read-cap-policy': /(read|limit|policy|window|pagination|capac)/,
    'undo-coordination': /(undo|redo|history|transaction|stack)/,
    'find-replace': /(find|search|replace)/,
    'dual-entry-equivalence': /(test|spec|adapter|facade|parity|compat)/
  }
  return table[dimension].test(p)
}

function scoreFile(path, dimension) {
  const p = path.toLowerCase()
  let score = 0
  const terms = {
    'context-injection': ['context', 'prompt', 'inject', 'budget', 'window', 'excerpt', 'document', 'editor'],
    'selection-tracking': ['selection', 'range', 'caret', 'cursor', 'focus', 'position', 'selectionstate'],
    'version-integrity': ['version', 'revision', 'snapshot', 'hash', 'checkpoint', 'conflict', 'consistency'],
    'read-cap-policy': ['read', 'range', 'limit', 'policy', 'window', 'pagination', 'capacity'],
    'undo-coordination': ['undo', 'redo', 'history', 'transaction', 'batch', 'stack', 'state'],
    'find-replace': ['find', 'search', 'replace', 'range', 'transaction', 'document'],
    'dual-entry-equivalence': ['test', 'spec', 'parity', 'adapter', 'facade', 'state', 'context']
  }
  for (const term of terms[dimension]) if (p.includes(term)) score += 2
  const hasStrongTerm = {
    'context-injection': /context|prompt|inject|budget|excerpt/.test(p),
    'selection-tracking': /selection|caret|cursor/.test(p),
    'version-integrity': /version|revision|snapshot|hash/.test(p),
    'read-cap-policy': /read|limit|window|pagination/.test(p),
    'undo-coordination': /undo|redo|history|transaction/.test(p),
    'find-replace': /find|search|replace/.test(p),
    'dual-entry-equivalence': /(test|spec)\.(ts|tsx|js|jsx|py)$|parity|adapter|facade/.test(p)
  }
  if (!hasStrongTerm[dimension]) score -= 2
  if (/(test|spec|mock|fixture)/.test(p)) score -= dimension === 'dual-entry-equivalence' ? 0 : 1
  if (/(node_modules|vendor|dist|build|min)/.test(p)) score -= 3
  return score
}

async function cacheRepositoryFiles(repo, files, dimension) {
  const cachedFiles = []
  const fetchedPaths = new Set()
  const matching = files
    .filter(file => file.size >= MIN_SOURCE_FILE_BYTES)
    .filter(file => fileMatchesDimension(file.path, dimension))
    .map(file => ({ ...file, score: scoreFile(file.path, dimension) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, TARGET_FILES_PER_REPO)

  for (const file of matching) {
    if (fetchedPaths.has(file.path)) continue
    const raw = await fetchFile(repo.fullName, repo.defaultBranch, file.path)
    if (!raw || raw.length < MIN_SOURCE_FILE_BYTES || raw.length > 400000) continue
    fetchedPaths.add(file.path)
    const cachePath = path.join(CACHE_DIR, `${safeName(repo.fullName)}__${safeName(file.path)}.txt`)
    fs.writeFileSync(cachePath, raw)
    cachedFiles.push({
      path: file.path,
      size: raw.length,
      cachePath: path.relative(ROOT, cachePath),
      excerpt: raw.slice(0, TARGET_BYTES_PER_FILE)
    })
  }
  return cachedFiles
}

async function fetchDimension(dimension, roundNumber) {
  const query = SEARCH_INTENTS[dimension][(roundNumber - 1) % SEARCH_INTENTS[dimension].length]
  let repositories = []
  try {
    const candidates = await searchRepositories(`${query} in:name,description,readme`, 12)
    candidates.sort((a, b) => b.stars - a.stars)
    repositories = candidates.slice(0, TARGET_REPOS_PER_DIMENSION)
  } catch (error) {
    return { dimension, round: roundNumber, query, error: error.message, repositories: [] }
  }

  const results = []
  for (const repo of repositories) {
    const files = await listRepositoryFiles(repo.fullName)
    const cachedFiles = await cacheRepositoryFiles(repo, files, dimension)
    results.push({
      fullName: repo.fullName,
      stars: repo.stars,
      language: repo.language,
      defaultBranch: repo.defaultBranch,
      url: repo.url,
      cachedFiles
    })
  }
  return { dimension, round: roundNumber, query, repositories: results }
}

async function fetchSeedRepository(repo) {
  const rawMeta = await ghApi('-H', 'Accept: application/vnd.github+json', `repos/${repo}`)
  const meta = JSON.parse(rawMeta)
  const repository = {
    fullName: meta.full_name,
    stars: meta.stargazers_count,
    language: meta.language,
    defaultBranch: meta.default_branch,
    url: meta.html_url
  }
  const files = await listRepositoryFiles(repository.fullName)
  const cachedFiles = []
  const dimensions = []
  for (const dimension of Object.keys(SEARCH_INTENTS)) {
    const filesForDimension = await cacheRepositoryFiles(repository, files, dimension)
    if (filesForDimension.length > 0) {
      dimensions.push(dimension)
      for (const file of filesForDimension) {
        if (!cachedFiles.some(item => item.path === file.path)) {
          const { excerpt, ...withoutExcerpt } = file
          cachedFiles.push(withoutExcerpt)
        }
      }
    }
  }
  return { ...repository, cachedFiles, dimensions, seedDirect: true }
}

async function main() {
  const started = Date.now()
  const dimensions = Object.keys(SEARCH_INTENTS)
  const allRounds = []

  for (let roundNumber = 1; roundNumber <= ROUNDS; roundNumber += 1) {
    for (const dimension of dimensions) {
      const roundFile = path.join(OUT_DIR, `round-${String(roundNumber).padStart(2, '0')}-${dimension}.json`)
      let result
      if (fs.existsSync(roundFile)) {
        result = JSON.parse(fs.readFileSync(roundFile, 'utf8'))
        if (result.dimension !== dimension || result.round !== roundNumber) {
          throw new Error(`Round cache mismatch: ${roundFile}`)
        }
      } else {
        process.stdout.write(`round ${roundNumber}/${ROUNDS} ${dimension}\n`)
        result = await fetchDimension(dimension, roundNumber)
        fs.writeFileSync(roundFile, JSON.stringify(result, null, 2))
      }
      allRounds.push(result)
    }
  }

  const seedFile = path.join(OUT_DIR, 'seed-direct.json')
  let seedResults = []
  if (fs.existsSync(seedFile)) {
    seedResults = JSON.parse(fs.readFileSync(seedFile, 'utf8'))
  } else {
    for (const repo of SEED_REPOS) {
      process.stdout.write(`seed ${repo}\n`)
      try {
        seedResults.push(await fetchSeedRepository(repo))
      } catch (error) {
        seedResults.push({ fullName: repo, cachedFiles: [], dimensions: [], seedDirect: true, error: error.message })
      }
      fs.writeFileSync(seedFile, JSON.stringify(seedResults, null, 2))
    }
  }

  for (const repository of seedResults) {
    if (!repository.cachedFiles?.length) continue
    allRounds.push({ dimension: 'seed', round: ROUNDS + 1, query: 'seed-direct', repositories: [repository] })
  }

  const uniqueRepos = new Map()
  const uniqueFiles = new Map()
  for (const round of allRounds) {
    for (const repo of round.repositories || []) {
      if (!repo.cachedFiles?.length) continue
      const key = repo.fullName.toLowerCase()
      if (!uniqueRepos.has(key)) {
        uniqueRepos.set(key, {
          fullName: repo.fullName,
          stars: repo.stars,
          language: repo.language,
          url: repo.url,
          dimensions: [],
          cachedFiles: [],
          seedDirect: Boolean(repo.seedDirect)
        })
      }
      const entry = uniqueRepos.get(key)
      if (round.dimension !== 'seed' && !entry.dimensions.includes(round.dimension)) entry.dimensions.push(round.dimension)
      for (const file of repo.cachedFiles) {
        if (!entry.cachedFiles.some(item => item.path === file.path)) {
          const { excerpt, ...withoutExcerpt } = file
          entry.cachedFiles.push(withoutExcerpt)
        }
        uniqueFiles.set(`${repo.fullName}/${file.path}`, file)
      }
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
      dimensions: uniqueRepos.get(repo.toLowerCase())?.dimensions || []
    })),
    failures: allRounds.filter(round => round.error).length
  }
  fs.writeFileSync(path.join(OUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2))
  console.log(JSON.stringify({
    uniqueRepositories: uniqueRepos.size,
    uniqueCachedFiles: uniqueFiles.size,
    seedCovered: summary.seedCoverage.filter(item => item.covered).length,
    seedTotal: SEED_REPOS.length,
    failures: summary.failures
  }, null, 2))
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
