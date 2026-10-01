#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

const ROOT = process.cwd()
const OUT_DIR = path.join(ROOT, '_audit', 'research-editor-full-product-2026-09-24')
const CACHE_DIR = path.join(OUT_DIR, 'cache')
fs.mkdirSync(CACHE_DIR, { recursive: true })

const ROUNDS = 10
const TARGET_REPOS_PER_ROUND = 3
const TARGET_FILES_PER_REPO = 3
const MIN_SOURCE_FILE_BYTES = 1200
const MAX_SOURCE_FILE_BYTES = 400000
const SEARCH_RESULT_LIMIT = 10
const MIN_STARS = 100

const ALLOWED_EXTENSIONS = /\.(ts|tsx|js|jsx|mjs|cjs|vue|svelte|rs|go|java|kt|py|swift|c|cc|cpp|h|hpp|cs)$/i
const EXCLUDED_PATH_PATTERNS = /(node_modules|vendor|dist|build|\.min\.|__snapshots__|\/fixtures?\/|\/\.|readme|license|changelog)/i

const DIMENSIONS = {
  'tool-protocol': {
    seeds: [
      'microsoft/vscode', 'microsoft/monaco-editor', 'zed-industries/zed', 'neovim/neovim',
      'ProseMirror/prosemirror-commands', 'ProseMirror/prosemirror-state', 'facebook/lexical',
      'ueberdosis/tiptap', 'codemirror/codemirror.next', 'continuedev/continue'
    ],
    queries: [
      'editor command protocol', 'editor tool interface', 'editor command registry',
      'editor command execution', 'editor extension api', 'editor command palette',
      'editor command service', 'editor tool call protocol', 'editor command dispatcher',
      'editor command handler'
    ],
    matcher: /(command|tool|protocol|api|dispatcher|registry|handler|palette)/i,
    terms: ['command', 'tool', 'protocol', 'api', 'dispatcher', 'registry', 'handler']
  },
  'permission-security': {
    seeds: [
      'microsoft/vscode', 'OpenHands/OpenHands', 'continuedev/continue', 'cline/cline',
      'RooCodeInc/Roo-Code', 'Aider-AI/aider', 'zed-industries/zed', 'openai/codex',
      'AppFlowy-IO/AppFlowy', 'toeverything/AFFiNE'
    ],
    queries: [
      'editor permission system', 'editor authorization', 'editor access control',
      'editor sandbox', 'editor trust system', 'editor security policy',
      'editor permission model', 'editor capability', 'editor write permission',
      'editor command authorization'
    ],
    matcher: /(permission|authorization|access|sandbox|trust|security|policy|capability|guard|protect)/i,
    terms: ['permission', 'authorization', 'access', 'sandbox', 'trust', 'security', 'policy', 'capability', 'guard']
  },
  'long-document-edittask': {
    seeds: [
      'microsoft/vscode', 'zed-industries/zed', 'neovim/neovim', 'continuedev/continue',
      'Aider-AI/aider', 'jina-ai/reader', 'yjs/yjs', 'automerge/automerge',
      'logseq/logseq', 'toeverything/AFFiNE'
    ],
    queries: [
      'large document editor', 'virtual document editor', 'document pagination editor',
      'large file editor', 'document buffer editor', 'editor document range',
      'long document editing', 'document chunk editor', 'editor large file support',
      'document window editor'
    ],
    matcher: /(buffer|document|range|line|pagination|virtual|chunk|window|large|offset|cursor)/i,
    terms: ['buffer', 'document', 'range', 'line', 'pagination', 'virtual', 'chunk', 'window', 'large', 'offset']
  },
  'observability-trace': {
    seeds: [
      'microsoft/vscode', 'zed-industries/zed', 'continuedev/continue', 'OpenHands/OpenHands',
      'Aider-AI/aider', 'cline/cline', 'RooCodeInc/Roo-Code', 'logseq/logseq',
      'toeverything/AFFiNE', 'outline/outline'
    ],
    queries: [
      'editor telemetry', 'editor tracing', 'editor diagnostics',
      'editor logging system', 'editor instrumentation', 'editor event log',
      'editor metrics', 'editor observability', 'editor performance trace',
      'editor diagnostic logging'
    ],
    matcher: /(telemetry|trace|tracing|log|logging|diagnostic|instrument|event|metric|observability)/i,
    terms: ['telemetry', 'trace', 'tracing', 'log', 'logging', 'diagnostic', 'instrument', 'event', 'metric']
  },
  'undo-system': {
    seeds: [
      'microsoft/vscode', 'ProseMirror/prosemirror-history', 'facebook/lexical', 'quilljs/quill',
      'codemirror/codemirror.next', 'zed-industries/zed', 'neovim/neovim',
      'automerge/automerge', 'yjs/yjs', 'logseq/logseq'
    ],
    queries: [
      'undo redo editor', 'editor history stack', 'document transaction undo',
      'editor undo manager', 'collaborative undo editor', 'editor checkpoint',
      'editor revert', 'editor history plugin', 'editor undo stack',
      'editor transaction history'
    ],
    matcher: /(undo|redo|history|transaction|revert|checkpoint|stack|rollback)/i,
    terms: ['undo', 'redo', 'history', 'transaction', 'revert', 'checkpoint', 'stack', 'rollback']
  },
  'verification-strength': {
    seeds: [
      'microsoft/vscode', 'zed-industries/zed', 'continuedev/continue', 'OpenHands/OpenHands',
      'cline/cline', 'RooCodeInc/Roo-Code', 'Aider-AI/aider', 'facebook/lexical',
      'ProseMirror/prosemirror-view', 'ueberdosis/tiptap'
    ],
    queries: [
      'editor test suite', 'editor integration test', 'editor e2e test',
      'editor unit test', 'editor regression test', 'editor spec test',
      'editor test framework', 'editor acceptance test', 'editor test coverage',
      'editor snapshot test'
    ],
    matcher: /(test|spec|e2e|regression|coverage|snapshot|acceptance)/i,
    terms: ['test', 'spec', 'e2e', 'regression', 'coverage', 'snapshot']
  },
  'entry-adaptation': {
    seeds: [
      'microsoft/vscode', 'microsoft/monaco-editor', 'zed-industries/zed', 'toeverything/AFFiNE',
      'outline/outline', 'logseq/logseq', 'AppFlowy-IO/AppFlowy', 'siyuan-note/siyuan',
      'toeverything/blocksuite', 'ueberdosis/tiptap'
    ],
    queries: [
      'editor workbench', 'editor panel component', 'editor container view',
      'editor adapter', 'editor facade', 'editor command entry',
      'editor ui adapter', 'editor view adapter', 'editor integration',
      'editor entry point'
    ],
    matcher: /(workbench|panel|container|adapter|facade|entry|view|component|integration)/i,
    terms: ['workbench', 'panel', 'container', 'adapter', 'facade', 'entry', 'view', 'component', 'integration']
  },
  'context-injection': {
    seeds: [
      'continuedev/continue', 'cline/cline', 'RooCodeInc/Roo-Code', 'OpenHands/OpenHands',
      'Aider-AI/aider', 'zed-industries/zed', 'openai/codex', 'jina-ai/reader',
      'microsoft/vscode', 'logseq/logseq'
    ],
    queries: [
      'editor context', 'editor prompt context', 'editor selection context',
      'editor document context', 'editor retrieval', 'editor embedding',
      'editor token budget', 'editor context window', 'editor excerpt',
      'editor active document'
    ],
    matcher: /(context|prompt|selection|document|retriev|embed|token|budget|window|excerpt|active)/i,
    terms: ['context', 'prompt', 'selection', 'document', 'retriev', 'embed', 'token', 'budget', 'window', 'excerpt']
  },
  'editor-core-features': {
    seeds: [
      'microsoft/vscode', 'microsoft/monaco-editor', 'facebook/lexical', 'ProseMirror/prosemirror-view',
      'ueberdosis/tiptap', 'quilljs/quill', 'codemirror/codemirror.next',
      'toeverything/blocksuite', 'toeverything/AFFiNE', 'siyuan-note/siyuan'
    ],
    queries: [
      'editor outline', 'editor fold', 'editor bookmark', 'editor navigation',
      'editor search replace', 'editor completion', 'editor command menu',
      'editor keymap', 'editor syntax highlight', 'editor text operations'
    ],
    matcher: /(outline|fold|bookmark|navigation|search|replace|completion|menu|keymap|highlight|operation|command)/i,
    terms: ['outline', 'fold', 'bookmark', 'navigation', 'search', 'replace', 'completion', 'menu', 'keymap', 'highlight']
  },
  'experience-feedback': {
    seeds: [
      'microsoft/vscode', 'zed-industries/zed', 'microsoft/monaco-editor', 'facebook/lexical',
      'ueberdosis/tiptap', 'ProseMirror/prosemirror-view', 'toeverything/AFFiNE',
      'logseq/logseq', 'AppFlowy-IO/AppFlowy', 'outline/outline'
    ],
    queries: [
      'editor cursor animation', 'editor scroll', 'editor viewport', 'editor highlight',
      'editor focus', 'editor overlay', 'editor transition', 'editor selection highlight',
      'editor scroll into view', 'editor visual feedback'
    ],
    matcher: /(cursor|scroll|viewport|highlight|focus|overlay|transition|animation|selection|visual|feedback)/i,
    terms: ['cursor', 'scroll', 'viewport', 'highlight', 'focus', 'overlay', 'transition', 'animation', 'selection', 'feedback']
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
  if (/(^|\/)(test|spec|e2e)/i.test(p)) score -= dimension === 'verification-strength' ? 0 : 2
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
    .sort((a, b) => b.score - a.score)

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

  const seedEvidence = await collectRepoEvidence(seedRepo, dimension)
  if (seedEvidence) repositories.push(seedEvidence)
  else errors.push(`seed ${seedRepo} had no matching source files`)

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
