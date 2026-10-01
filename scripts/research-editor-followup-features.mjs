#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

const ROOT = process.cwd()
const OUT_DIR = path.join(ROOT, '_audit', 'research-editor-followup-features-2026-09-25')
const CACHE_DIR = path.join(OUT_DIR, 'cache')
fs.mkdirSync(CACHE_DIR, { recursive: true })

const ROUNDS = 10
const TARGET_REPOS_PER_ROUND = 3
const TARGET_FILES_PER_REPO = 3
const MIN_SOURCE_FILE_BYTES = 1200
const MAX_SOURCE_FILE_BYTES = 400000
const SEARCH_RESULT_LIMIT = 10
const MIN_STARS = 100

const ALLOWED_EXTENSIONS = /\.(ts|tsx|js|jsx|mjs|cjs|vue|svelte|rs|go|java|kt|py|swift|c|cc|cpp|h|hpp|cs|el|rbi)$/i
const EXCLUDED_PATH_PATTERNS = /(node_modules|vendor|dist|build|\.min\.|__snapshots__|\/fixtures?\/|\/\.|readme|license|changelog)/i

const DIMENSIONS = {
  'search-replace': {
    seeds: [
      'microsoft/vscode', 'microsoft/monaco-editor', 'neovim/neovim',
      'codemirror/codemirror.next', 'zed-industries/zed', 'facebook/lexical',
      'helix-editor/helix', 'lapce/lapce', 'vim/vim', 'emacs-mirror/emacs'
    ],
    queries: [
      'editor find replace', 'search replace widget editor', 'find widget editor',
      'replace all editor', 'text search replace editor', 'regex find replace editor',
      'case sensitive find replace', 'editor search controller', 'document find model',
      'replace preview editor'
    ],
    matcher: /(find|search|replace|query|match)/i,
    terms: ['find', 'search', 'replace', 'query', 'match']
  },
  'virtualized-rendering': {
    seeds: [
      'microsoft/vscode', 'microsoft/monaco-editor', 'zed-industries/zed',
      'codemirror/codemirror.next', 'neovim/neovim', 'helix-editor/helix',
      'lapce/lapce', 'toeverything/AFFiNE', 'siyuan-note/siyuan', 'AppFlowy-IO/AppFlowy'
    ],
    queries: [
      'virtual list editor', 'virtualized text editor', 'editor viewport rendering',
      'line virtualization editor', 'large file editor performance', 'editor chunk rendering',
      'lazy render editor', 'editor viewport lines', 'virtual scroll text editor',
      'editor render range'
    ],
    matcher: /(virtual|viewport|render|line|chunk|window|lazy|performance|buffer)/i,
    terms: ['virtual', 'viewport', 'render', 'line', 'chunk', 'window', 'lazy', 'performance', 'buffer']
  },
  'inline-diff': {
    seeds: [
      'microsoft/vscode', 'Aider-AI/aider', 'continuedev/continue', 'cline/cline',
      'zed-industries/zed', 'JetBrains/intellij-community', 'geany/geany',
      'neovim/neovim', 'kkymt?/invalid-repository', 'logseq/logseq'
    ].filter(repo => !repo.includes('?')),
    queries: [
      'inline diff editor', 'editor diff view', 'word diff editor',
      'diff hunk editor', 'editor change review', 'editor revert change',
      'inline change decoration', 'diff editor apply reject', 'editor diff highlight',
      'editor changes view'
    ],
    matcher: /(diff|change|hunk|review|revert|decoration|inline|merge|patch)/i,
    terms: ['diff', 'change', 'hunk', 'review', 'revert', 'decoration', 'inline', 'merge', 'patch']
  },
  'trace-compare': {
    seeds: [
      'promptfoo/promptfoo', 'langfuse/langfuse', 'Arize-ai/phoenix',
      'mlflow/mlflow', 'langchain-ai/langchainjs', 'traceloop/openllmetry',
      'openai/evals', 'microsoft/vscode', 'continuedev/continue', 'Aider-AI/aider'
    ],
    queries: [
      'llm trace comparison', 'prompt version diff', 'llm run diff',
      'tool call trace', 'evaluation run comparison', 'prompt versioning',
      'llm observability trace', 'span diff analysis', 'llm replay trace',
      'prompt experiment compare'
    ],
    matcher: /(trace|span|diff|compare|version|eval|run|observ|tool|experiment)/i,
    terms: ['trace', 'span', 'diff', 'compare', 'version', 'eval', 'run', 'observ', 'tool', 'experiment']
  },
  'multi-cursor': {
    seeds: [
      'microsoft/vscode', 'zed-industries/zed', 'neovim/neovim',
      'helix-editor/helix', 'lapce/lapce', 'codemirror/codemirror.next',
      'emacs-mirror/emacs', 'vim/vim', 'KDE/kate', 'facebook/lexical'
    ],
    queries: [
      'multi cursor editor', 'multiple cursors editor', 'column selection editor',
      'block selection editor', 'editor cursor ranges', 'editor selection set',
      'sublime multiple cursor', 'editor secondary cursor', 'rectangular selection editor',
      'editor cursor list'
    ],
    matcher: /(cursor|selection|range|column|block|multi|multiple)/i,
    terms: ['cursor', 'selection', 'range', 'column', 'block', 'multi', 'multiple']
  }
}

const repoMetaCache = new Map()
const usedFileKeys = new Set()

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

async function fetchJson(...args) {
  const raw = await ghApi(...args)
  return JSON.parse(raw)
}

async function getRepoMeta(repo) {
  if (repoMetaCache.has(repo)) return repoMetaCache.get(repo)
  const meta = await fetchJson('-H', 'Accept: application/vnd.github+json', `repos/${repo}`)
  const entry = {
    fullName: meta.full_name,
    stars: meta.stargazers_count,
    language: meta.language,
    defaultBranch: meta.default_branch,
    url: meta.html_url,
    archived: Boolean(meta.archived)
  }
  repoMetaCache.set(repo, entry)
  return entry
}

async function getHeadCommit(repo, branch) {
  try {
    const commit = await fetchJson('-H', 'Accept: application/vnd.github+json', `repos/${repo}/commits/${branch}`)
    return commit.sha
  } catch {
    return null
  }
}

async function searchRepositories(query) {
  const json = await fetchJson(
    '-H', 'Accept: application/vnd.github+json',
    `search/repositories?q=${encodeURIComponent(`${query} in:name,description,readme`)}&per_page=${SEARCH_RESULT_LIMIT}`
  )
  return (json.items || [])
    .filter(item => !item.archived && item.stargazers_count >= MIN_STARS)
    .map(item => ({
      fullName: item.full_name,
      stars: item.stargazers_count,
      language: item.language,
      defaultBranch: item.default_branch,
      url: item.html_url,
      archived: Boolean(item.archived)
    }))
}

async function listRepositoryFiles(repo) {
  try {
    const json = await fetchJson('-H', 'Accept: application/vnd.github+json', `repos/${repo}/git/trees/HEAD?recursive=1`)
    return (json.tree || [])
      .filter(item => item.type === 'blob' && item.size && item.size <= MAX_SOURCE_FILE_BYTES)
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

function isAllowedSourceFile(filePath) {
  if (!ALLOWED_EXTENSIONS.test(filePath)) return false
  if (EXCLUDED_PATH_PATTERNS.test(filePath)) return false
  return true
}

function scoreFile(filePath, dimension) {
  const p = filePath.toLowerCase()
  let score = 0
  for (const term of DIMENSIONS[dimension].terms) {
    if (p.includes(term)) score += 2
  }
  if (!DIMENSIONS[dimension].matcher.test(p)) score -= 4
  if (/(^|\/)(test|spec|e2e)/i.test(p)) score -= 2
  return score
}

async function collectRepoEvidence(repo, dimension) {
  const meta = await getRepoMeta(repo)
  if (meta.archived) return null
  const files = await listRepositoryFiles(repo)
  const candidates = files
    .filter(file => file.size >= MIN_SOURCE_FILE_BYTES)
    .filter(file => isAllowedSourceFile(file.path))
    .filter(file => DIMENSIONS[dimension].matcher.test(file.path))
    .map(file => ({ ...file, score: scoreFile(file.path, dimension) }))
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))

  const cachedFiles = []
  for (const file of candidates) {
    if (cachedFiles.length >= TARGET_FILES_PER_REPO) break
    const key = `${repo}/${file.path}`
    if (usedFileKeys.has(key)) continue
    const raw = await fetchFile(repo, meta.defaultBranch, file.path)
    if (!raw || raw.length < MIN_SOURCE_FILE_BYTES || raw.length > MAX_SOURCE_FILE_BYTES) continue
    usedFileKeys.add(key)
    const cachePath = path.join(CACHE_DIR, `${safeName(repo)}__${safeName(file.path)}.txt`)
    fs.writeFileSync(cachePath, raw)
    cachedFiles.push({
      path: file.path,
      size: raw.length,
      cachePath: path.relative(ROOT, cachePath),
      excerpt: raw.slice(0, 4000)
    })
  }
  if (!cachedFiles.length) return null
  const commitSha = await getHeadCommit(repo, meta.defaultBranch)
  return {
    fullName: meta.fullName,
    stars: meta.stars,
    language: meta.language,
    defaultBranch: meta.defaultBranch,
    commitSha,
    url: meta.url,
    cachedFiles
  }
}

async function fetchRound(dimension, roundNumber) {
  const config = DIMENSIONS[dimension]
  const query = config.queries[(roundNumber - 1) % config.queries.length]
  const seedRepo = config.seeds[(roundNumber - 1) % config.seeds.length]

  const repositories = []
  const errors = []

  try {
    const seedEvidence = await collectRepoEvidence(seedRepo, dimension)
    if (seedEvidence) repositories.push(seedEvidence)
    else errors.push(`seed ${seedRepo} had no matching source files`)
  } catch (error) {
    errors.push(`seed ${seedRepo}: ${error.message}`)
  }

  let searchResults = []
  try {
    searchResults = await searchRepositories(query)
  } catch (error) {
    errors.push(`search failed: ${error.message}`)
  }

  for (const candidate of searchResults) {
    if (repositories.length >= TARGET_REPOS_PER_ROUND) break
    if (candidate.fullName === seedRepo) continue
    try {
      const evidence = await collectRepoEvidence(candidate.fullName, dimension)
      if (evidence) repositories.push(evidence)
    } catch (error) {
      errors.push(`${candidate.fullName}: ${error.message}`)
    }
  }

  for (const fallback of config.seeds) {
    if (repositories.length >= TARGET_REPOS_PER_ROUND) break
    if (fallback === seedRepo) continue
    if (repositories.some(item => item.fullName === fallback)) continue
    try {
      const evidence = await collectRepoEvidence(fallback, dimension)
      if (evidence) repositories.push(evidence)
    } catch (error) {
      errors.push(`${fallback}: ${error.message}`)
    }
  }

  return {
    dimension,
    round: roundNumber,
    query,
    seedRepo,
    repositories,
    errors
  }
}

async function main() {
  const started = Date.now()
  const allRounds = []
  const dimensionNames = Object.keys(DIMENSIONS)

  for (const dimension of dimensionNames) {
    for (let roundNumber = 1; roundNumber <= ROUNDS; roundNumber += 1) {
      const roundFile = path.join(OUT_DIR, `round-${String(roundNumber).padStart(2, '0')}-${dimension}.json`)
      let result
      if (fs.existsSync(roundFile)) {
        result = JSON.parse(fs.readFileSync(roundFile, 'utf8'))
        if (result.dimension !== dimension || result.round !== roundNumber) {
          throw new Error(`Round cache mismatch: ${roundFile}`)
        }
        for (const repo of result.repositories || []) {
          for (const file of repo.cachedFiles || []) usedFileKeys.add(`${repo.fullName}/${file.path}`)
        }
      } else {
        process.stdout.write(`round ${roundNumber}/${ROUNDS} ${dimension}\n`)
        result = await fetchRound(dimension, roundNumber)
        fs.writeFileSync(roundFile, JSON.stringify(result, null, 2))
      }
      allRounds.push(result)
    }
  }

  const uniqueRepos = new Map()
  const uniqueFiles = new Map()
  const perDimension = {}
  for (const dimension of dimensionNames) perDimension[dimension] = { rounds: 0, repositories: 0, files: 0 }

  for (const round of allRounds) {
    perDimension[round.dimension].rounds += 1
    for (const repo of round.repositories || []) {
      perDimension[round.dimension].repositories += 1
      const key = repo.fullName.toLowerCase()
      if (!uniqueRepos.has(key)) {
        uniqueRepos.set(key, {
          fullName: repo.fullName,
          stars: repo.stars,
          language: repo.language,
          url: repo.url,
          dimensions: [],
          cachedFiles: []
        })
      }
      const entry = uniqueRepos.get(key)
      if (!entry.dimensions.includes(round.dimension)) entry.dimensions.push(round.dimension)
      for (const file of repo.cachedFiles || []) {
        perDimension[round.dimension].files += 1
        const fileKey = `${repo.fullName}/${file.path}`
        uniqueFiles.set(fileKey, file)
        if (!entry.cachedFiles.some(item => item.path === file.path)) {
          const { excerpt, ...withoutExcerpt } = file
          entry.cachedFiles.push(withoutExcerpt)
        }
      }
    }
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    dimensions: dimensionNames,
    roundsPerDimension: ROUNDS,
    uniqueRepositories: uniqueRepos.size,
    uniqueCachedFiles: uniqueFiles.size,
    elapsedMs: Date.now() - started,
    perDimension,
    repositories: [...uniqueRepos.values()],
    failures: allRounds.filter(round => !round.repositories?.length).length
  }
  fs.writeFileSync(path.join(OUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2))

  console.log(JSON.stringify({
    uniqueRepositories: uniqueRepos.size,
    uniqueCachedFiles: uniqueFiles.size,
    failedRounds: summary.failures,
    perDimension: summary.perDimension
  }, null, 2))
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
