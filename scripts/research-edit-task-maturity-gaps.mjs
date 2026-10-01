import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'

const OUT_DIR = '_audit/research-cache/edit-task-maturity-2026-09-22'
const LEDGER = '_audit/RESEARCH_2026-09-22_EDIT_TASK_MATURITY_GAPS.json'

const REPOS = [
  {
    repo: 'SWE-agent/SWE-agent',
    focus: 'editor,str_replace,tool,action,validation',
    patterns: /(str_replace|editor|edit_anthropic|action_sampler|command)/i,
  },
  {
    repo: 'cline/cline',
    focus: 'sdk,diff,edit,coordinator,session',
    patterns: /(sdk-diff|SdkController|diff-edit|session-diff|task-resume)/i,
  },
  {
    repo: 'OpenHands/OpenHands',
    focus: 'agent,event,state,trajectory,action,security',
    patterns: /(event|state|trajectory|action|agent|session|runtime|history|controller|security)/i,
  },
  {
    repo: 'aaif-goose/goose',
    focus: 'session,confirmation,tool,state,machine,resume',
    patterns: /(session|confirmation|tool|state|resume|interrupt|scheduler|ledger)/i,
  },
  {
    repo: 'RooCodeInc/Roo-Code',
    focus: 'checkpoint,diff,strategy,task,edit,provider',
    patterns: /(checkpoint|diff|strategy|task|edit|provider|terminal|browser)/i,
  },
  {
    repo: 'cline/cline',
    focus: 'diff,edit,tool,state,sdk,plan',
    patterns: /(diff|edit|tool|state|plan|message|assistant|task)/i,
  },
  {
    repo: 'FlowiseAI/Flowise',
    focus: 'flow,execution,state,node,variable,queue',
    patterns: /(flow|execution|state|node|variable|queue|assistant)/i,
  },
  {
    repo: 'tabbyml/tabby',
    focus: 'completion,context,index,snippet,edit',
    patterns: /(completion|context|index|snippet|edit|range|position)/i,
  },
  {
    repo: 'ProseMirror/prosemirror-transform',
    focus: 'step,transform,history,position,map,range',
    patterns: /(step|transform|position|map|range|replace)/i,
  },
  {
    repo: 'ProseMirror/prosemirror-state',
    focus: 'state,selection,transaction,history',
    patterns: /(state|selection|transaction|history|apply)/i,
  },
  {
    repo: 'ProseMirror/prosemirror-history',
    focus: 'history,undo,redo,transaction,branch',
    patterns: /(history|undo|redo|transaction|branch|step)/i,
  },
  {
    repo: 'automerge/automerge',
    focus: 'change,transaction,patch,history,sync,conflict',
    patterns: /(change|transaction|patch|history|sync|conflict|state)/i,
  },
  {
    repo: 'toeverything/AFFiNE',
    focus: 'doc,history,undo,revision,block,editor',
    patterns: /(doc|history|undo|revision|block|editor|workspace)/i,
  },
  {
    repo: 'logseq/logseq',
    focus: 'file,persist,state,editor,undo,transaction',
    patterns: /(file|persist|state|editor|undo|transaction|sync)/i,
  },
  {
    repo: 'microsoft/monaco-editor',
    focus: 'edit,range,model,undo,redo,bulk,operation',
    patterns: /(edit|range|model|undo|redo|bulk|operation)/i,
  },
  {
    repo: 'semgrep/semgrep',
    focus: 'range,match,edit,fix,rule,target',
    patterns: /(range|match|edit|fix|rule|target|pattern)/i,
  },
  {
    repo: 'mendableai/firecrawl',
    focus: 'job,queue,state,batch,retry,timeout',
    patterns: /(job|queue|state|batch|retry|timeout|crawl)/i,
  },
  {
    repo: 'smallcloudai/refact',
    focus: 'agent,edit,diff,session,state',
    patterns: /(agent|edit|diff|session|state|tool|scratchpad)/i,
  },
  {
    repo: 'vercel/ai',
    focus: 'stream,toolloop,partial,step,error,retry',
    patterns: /(stream|tool|partial|step|error|retry|loop|state)/i,
  },
]

function ghApi(path, accept = 'application/vnd.github+json') {
  return JSON.parse(execFileSync('gh', ['api', '-H', `Accept: ${accept}`, path], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  }))
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function sanitizePath(path) {
  return path.replace(/[^a-zA-Z0-9._-]+/g, '__').slice(-180)
}

function isSource(path) {
  return /\.(ts|tsx|js|jsx|py|rs|go|java|kt|rb|cs|c|cpp|h)$/i.test(path)
}

function scorePath(path, patterns) {
  if (!isSource(path)) return 0
  if (/(test|spec|fixture|mock|benchmark|example|samples?)\//i.test(path)) return 0
  if (!patterns.test(path)) return 0
  let score = 1
  if (/(state|checkpoint|session|task|plan|history|event)/i.test(path)) score += 4
  if (/(edit|diff|patch|replace|apply|undo|rollback|version|range|context|index|retriev|tool|loop|resume|interrupt)/i.test(path)) score += 4
  if (/(src|lib|core|packages|apps)\//.test(path)) score += 1
  if (path.split('/').length > 8) score -= 1
  return score
}

const EXCERPT_RE = /(^|\s)(class|interface|type|enum|struct|const|function|def|fn|impl|public|private|export|async)\b|(throw |Error|retry|rollback|undo|checkpoint|interrupt|resume|partial|version|hash|diff|range|limit|batch|state|history|plan|confirm|timeout|timeout|failure)/i

function extractExcerpts(text) {
  const lines = text.split(/\r?\n/)
  const excerpts = []
  for (let i = 0; i < lines.length && excerpts.length < 80; i++) {
    if (!EXCERPT_RE.test(lines[i])) continue
    const end = Math.min(lines.length - 1, i + 4)
    excerpts.push({
      line: i + 1,
      text: lines.slice(i, end + 1).join('\n').slice(0, 1400),
    })
    i = end
  }
  return excerpts
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })
  const results = []
  for (const item of REPOS) {
    try {
      const meta = ghApi(`repos/${item.repo}`)
      await delay(1200)
      const tree = ghApi(`repos/${item.repo}/git/trees/${meta.default_branch}?recursive=1`)
      await delay(1200)
      const paths = (tree.tree || [])
        .filter(entry => entry.type === 'blob')
        .map(entry => ({ path: entry.path, score: scorePath(entry.path, item.patterns) }))
        .filter(entry => entry.score > 0)
        .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
        .slice(0, 10)

      const files = []
      for (const entry of paths) {
        try {
          const raw = execFileSync('gh', [
            'api',
            '-H',
            'Accept: application/vnd.github.raw',
            `repos/${item.repo}/contents/${entry.path}?ref=${encodeURIComponent(meta.default_branch)}`,
          ], { encoding: 'utf8', maxBuffer: 12 * 1024 * 1024 })
          if (!raw || raw.length > 500000) continue
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
          await delay(500)
        } catch (error) {
          files.push({ path: entry.path, score: entry.score, error: String(error.message || error).slice(0, 200) })
        }
      }
      results.push({
        repo: item.repo,
        focus: item.focus,
        url: meta.html_url,
        defaultBranch: meta.default_branch,
        stars: meta.stargazers_count,
        language: meta.language,
        description: meta.description,
        updatedAt: meta.updated_at,
        candidatePathCount: (tree.tree || []).filter(entry => entry.type === 'blob' && scorePath(entry.path, item.patterns) > 0).length,
        files,
      })
      writeFileSync(LEDGER, JSON.stringify(results, null, 2), 'utf8')
      console.log(`[ok] ${item.repo}: ${files.filter(file => file.excerpts).length}/${paths.length} files`)
    } catch (error) {
      results.push({
        repo: item.repo,
        focus: item.focus,
        error: String(error.message || error).slice(0, 500),
      })
      writeFileSync(LEDGER, JSON.stringify(results, null, 2), 'utf8')
      console.log(`[err] ${item.repo}: ${error.message}`)
    }
  }
  console.log(`[done] ${results.length} gap repos recorded`)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
