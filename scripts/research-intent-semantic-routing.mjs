import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const ROOT = process.cwd()
const REPO_LIST_PATH = path.join(ROOT, '_audit', 'RESEARCH_2026-09-22_INTENT_SEMANTIC_ROUTING_PHASE2_REPOS.json')
const CACHE_ROOT = path.join(ROOT, '_audit', 'research-cache', 'intent-semantic-routing-phase2')
const EVIDENCE_PATH = path.join(ROOT, '_audit', 'RESEARCH_2026-09-22_INTENT_SEMANTIC_ROUTING_PHASE2_EVIDENCE.json')

const MAX_FILES_PER_REPO = 16
const MAX_FILE_BYTES = 220_000
const CODE_EXTENSIONS = new Set(['.py', '.ts', '.tsx', '.js', '.mjs', '.cjs', '.java', '.cs', '.go', '.rs', '.rb'])
const DATA_EXTENSIONS = new Set(['.json', '.yml', '.yaml'])
const IMPLEMENTMENT_HINT = /(intent|router|routing|classif|embed|threshold|confidence|calibr|oos|out.of.scope|fallback|similarity|vector|nlu|route)/i
const EXCLUDE_HINT = /(node_modules|dist\/|build\/|\.min\.|\.map$|package-lock|yarn\.lock|pnpm-lock|__pycache__|\.ipynb$)/i

function token() {
  return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
}

const githubToken = token()
const headers = {
  Authorization: `Bearer ${githubToken}`,
  Accept: 'application/vnd.github+json',
  'User-Agent': 'novel-workshop-research',
}

async function githubJson(url) {
  const response = await fetch(url, { headers })
  if (!response.ok) throw new Error(`${url} -> ${response.status} ${await response.text()}`)
  return response.json()
}

function safeRepoName(repository) {
  return repository.replace(/[^a-zA-Z0-9._-]+/g, '__')
}

function selectImplementationFiles(tree) {
  const candidates = tree.filter(item => {
    if (item.type !== 'blob') return false
    if (item.size > MAX_FILE_BYTES) return false
    const extension = path.extname(item.path).toLowerCase()
    if (!CODE_EXTENSIONS.has(extension) && !DATA_EXTENSIONS.has(extension)) return false
    if (EXCLUDE_HINT.test(item.path)) return false
    return IMPLEMENTMENT_HINT.test(item.path)
  })
  const code = candidates.filter(item => CODE_EXTENSIONS.has(path.extname(item.path).toLowerCase()))
  const data = candidates.filter(item => DATA_EXTENSIONS.has(path.extname(item.path).toLowerCase()))
  return [...code, ...data].slice(0, MAX_FILES_PER_REPO)
}

async function downloadFile(repository, branch, item) {
  const url = `https://api.github.com/repos/${repository}/contents/${encodeURIComponent(item.path)}?ref=${encodeURIComponent(branch)}`
  const response = await fetch(url, { headers })
  if (!response.ok) throw new Error(`${url} -> ${response.status}`)
  const payload = await response.json()
  if (payload.encoding !== 'base64' || typeof payload.content !== 'string') {
    throw new Error(`unexpected content encoding for ${repository}/${item.path}`)
  }
  return Buffer.from(payload.content, 'base64')
}

async function researchRepository(repository, category) {
  const repoDir = path.join(CACHE_ROOT, safeRepoName(repository))
  fs.mkdirSync(repoDir, { recursive: true })
  const metadata = await githubJson(`https://api.github.com/repos/${repository}`)
  const branch = metadata.default_branch
  const tree = await githubJson(`https://api.github.com/repos/${repository}/git/trees/${encodeURIComponent(branch)}?recursive=1`)
  const selected = selectImplementationFiles(tree.tree || [])
  const files = []
  for (const item of selected) {
    const destination = path.join(repoDir, safeRepoName(item.path))
    try {
      const content = await downloadFile(repository, branch, item)
      fs.writeFileSync(destination, content)
      files.push({
        path: item.path,
        bytes: content.length,
        evidenceFile: path.relative(ROOT, destination).replaceAll('\\', '/'),
      })
    } catch (error) {
      files.push({
        path: item.path,
        bytes: item.size,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return {
    repository,
    category,
    url: metadata.html_url,
    stars: metadata.stargazers_count,
    defaultBranch: branch,
    language: metadata.language,
    description: metadata.description,
    implementationFiles: files,
    downloadedFiles: files.filter(file => !file.error).length,
  }
}

const repoList = JSON.parse(fs.readFileSync(REPO_LIST_PATH, 'utf8'))
fs.rmSync(CACHE_ROOT, { recursive: true, force: true })
fs.mkdirSync(CACHE_ROOT, { recursive: true })
const results = []
const failures = []
for (const entry of repoList.repositories) {
  process.stdout.write(`[research] ${entry.id} (${entry.category})\n`)
  try {
    results.push(await researchRepository(entry.id, entry.category))
  } catch (error) {
    failures.push({
      repository: entry.id,
      category: entry.category,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

const evidence = {
  schema: 'intent-semantic-routing-phase2-evidence',
  generatedAt: new Date().toISOString(),
  repositoryCount: results.length,
  failureCount: failures.length,
  downloadedFileCount: results.reduce((sum, item) => sum + item.downloadedFiles, 0),
  selection: {
    maxFilesPerRepository: MAX_FILES_PER_REPO,
    maxFileBytes: MAX_FILE_BYTES,
    implementationHint: String(IMPLEMENTMENT_HINT),
  },
  repositories: results,
  failures,
}
fs.writeFileSync(EVIDENCE_PATH, JSON.stringify(evidence, null, 2))
process.stdout.write(`[research] repositories=${results.length} failures=${failures.length} files=${evidence.downloadedFileCount}\n`)
if (results.length < 50) {
  throw new Error(`research requirement not met: ${results.length}/50 repositories`)
}
