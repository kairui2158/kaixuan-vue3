const fs = require('fs')
const path = require('path')

const CONTRACT_DIR = 'D:/codex/novel-workshop-vue3/_audit/manual/behavioral_contracts'
const SRC_DIR = 'D:/codex/novel-workshop-vue3/src'
const REPORT_DIR = 'D:/codex/novel-workshop-vue3/_audit/diff-engine'

// --- 1. Parse all contract files ---
function walkDir(dir) {
  let results = []
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f)
    if (fs.statSync(p).isDirectory()) results = results.concat(walkDir(p))
    else if (f.endsWith('.md') && f !== 'BATCH_COMPLETION_REPORT.md') results.push(p)
  }
  return results
}

function parseContract(filePath) {
  const content = fs.readFileSync(filePath, 'utf8')
  const basename = path.basename(filePath)

  // Extract source file reference
  let srcFile = null
  const srcMatch = content.match(/源文件:?\s*`?([^`\n]+)`?/) ||
                   content.match(/源文件:?\s*(src[^\n|]+)/) ||
                   content.match(/# (.+?)\.vue/) ||
                   content.match(/# (.+?)\.ts/)
  if (srcMatch) {
    srcFile = srcMatch[1].trim().replace(/`/g, '')
    // Handle directory references like 'src/components/deai/'
    if (srcFile.endsWith('/')) srcFile = srcFile.slice(0, -1)
  }

  // Extract all function entries (## FXX: name)
  const funcs = []
  const funcRegex = /## (F\d+[C]?:\s*.+)/g
  let m
  while ((m = funcRegex.exec(content)) !== null) {
    const header = m[1].trim()
    // Parse function name from header like 'F01: currentStepName (computed)' or 'F03: startGeneration()'
    const parts = header.split(':')
    const fid = parts[0].trim()
    const rest = parts.slice(1).join(':').trim()
    // Extract function name - remove parenthetical descriptors
    let funcName = rest.split('(')[0].split(' (')[0].trim()
    // Extract L1 structure info
    const l1Match = content.slice(m.index, m.index + 2000).match(/\| L1[^|]*\| ([^|]+) \|/)
    const l1Info = l1Match ? l1Match[1].trim() : ''
    funcs.push({ fid, funcName, header, l1Info })
  }

  return { file: basename, srcFile, funcs, funcCount: funcs.length }
}

// --- 2. Check if function exists in source ---
function findInSource(srcFile, funcName) {
  if (!srcFile || !funcName) return { found: false, locations: [], reason: 'no srcFile or funcName' }

  // Map contract source references to actual files
  let searchPaths = []
  const fullSrc = srcFile.startsWith('src/') || srcFile.startsWith('electron/')
  if (fullSrc) {
    searchPaths.push(path.join('D:/codex/novel-workshop-vue3', srcFile))
  } else if (srcFile.startsWith('src') || srcFile.includes('/')) {
    // Could be a directory or partial path
    const candidates = [
      path.join('D:/codex/novel-workshop-vue3', srcFile),
      path.join(SRC_DIR, path.basename(srcFile))
    ]
    searchPaths.push(...candidates)
  }

  // If srcFile is a directory, search all .vue/.ts/.js files in it
  let filesToSearch = []
  for (const sp of searchPaths) {
    if (fs.existsSync(sp) && fs.statSync(sp).isDirectory()) {
      filesToSearch.push(...walkDirForCode(sp))
    } else if (fs.existsSync(sp)) {
      filesToSearch.push(sp)
    }
  }

  // Also search all source files as fallback
  if (filesToSearch.length === 0) {
    filesToSearch = walkDirForCode(SRC_DIR)
    // Add electron dir
    const electronDir = 'D:/codex/novel-workshop-vue3/electron'
    if (fs.existsSync(electronDir)) filesToSearch.push(...walkDirForCode(electronDir))
  }

  const locations = []
  for (const f of filesToSearch) {
    try {
      const content = fs.readFileSync(f, 'utf8')
      // Search for function name as identifier
      // Match: function funcName, const funcName, funcName(, funcName =, def funcName
      const patterns = [
        new RegExp('\\bfunction\\s+' + escapeRegex(funcName) + '\\b'),
        new RegExp('\\bconst\\s+' + escapeRegex(funcName) + '\\b'),
        new RegExp('\\blet\\s+' + escapeRegex(funcName) + '\\b'),
        new RegExp('\\b' + escapeRegex(funcName) + '\\s*\\('),
        new RegExp('\\b' + escapeRegex(funcName) + '\\s*[=:]')
      ]
      for (const pat of patterns) {
        if (pat.test(content)) {
          locations.push(path.relative('D:/codex/novel-workshop-vue3', f))
          break
        }
      }
    } catch (e) { /* skip unreadable files */ }
  }

  return { found: locations.length > 0, locations: [...new Set(locations)] }
}

function walkDirForCode(dir) {
  let results = []
  if (!fs.existsSync(dir)) return results
  try {
    for (const f of fs.readdirSync(dir)) {
      const p = path.join(dir, f)
      const stat = fs.statSync(p)
      if (stat.isDirectory() && !f.startsWith('node_modules') && !f.startsWith('dist') && !f.startsWith('_audit')) {
        results = results.concat(walkDirForCode(p))
      } else if (stat.isFile() && (f.endsWith('.vue') || f.endsWith('.ts') || f.endsWith('.js'))) {
        results.push(p)
      }
    }
  } catch (e) { /* skip */ }
  return results
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// --- 3. Collect test results ---
function collectTestResults() {
  const testFiles = [
    { name: 'test_pipeline_v2', report: 'pipeline_v2_report.json' },
    { name: 'test_p9_chapter_tree', report: 'p9_chapter_tree_report.json' },
    { name: 'test_p8_deai', report: 'p8_deai_report.json' },
    { name: 'test_p6_provider', report: 'p6_provider_report.json' }
  ]
  const results = []
  for (const t of testFiles) {
    const reportPath = path.join('D:/codex/novel-workshop-vue3/_audit', t.report)
    if (fs.existsSync(reportPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(reportPath, 'utf8'))
        const pass = data.pass || data.passed || (data.summary && data.summary.pass) || 0
        const fail = data.fail || data.failed || (data.summary && data.summary.fail) || 0
        results.push({ name: t.name, pass, fail, found: true })
      } catch (e) {
        results.push({ name: t.name, pass: 0, fail: 0, found: false, error: e.message })
      }
    } else {
      // Try _audit subdirectories
      const altPath = path.join('D:/codex/novel-workshop-vue3/_audit', t.name + '_report.json')
      if (fs.existsSync(altPath)) {
        try {
          const data = JSON.parse(fs.readFileSync(altPath, 'utf8'))
          const pass = data.pass || data.passed || (data.summary && data.summary.pass) || 0
          const fail = data.fail || data.failed || (data.summary && data.summary.fail) || 0
          results.push({ name: t.name, pass, fail, found: true })
        } catch (e) {
          results.push({ name: t.name, pass: 0, fail: 0, found: false })
        }
      } else {
        results.push({ name: t.name, pass: 0, fail: 0, found: false })
      }
    }
  }
  return results
}

// --- 4. Reverse coverage: find source functions not in any contract ---
function findUncoveredFunctions(allContracts) {
  const allSrcFiles = walkDirForCode(SRC_DIR)
  const electronDir = 'D:/codex/novel-workshop-vue3/electron'
  if (fs.existsSync(electronDir)) allSrcFiles.push(...walkDirForCode(electronDir))

  // Collect all contract function names
  const contractFuncNames = new Set()
  for (const c of allContracts) {
    for (const f of c.funcs) {
      contractFuncNames.add(f.funcName.toLowerCase())
    }
  }

  const uncovered = []
  for (const f of allSrcFiles) {
    try {
      const content = fs.readFileSync(f, 'utf8')
      // Find function declarations
      const patterns = [
        /\bfunction\s+([a-zA-Z_$][\w$]*)\b/g,
        /\bconst\s+([a-zA-Z_$][\w$]*)\s*=/g,
      ]
      for (const pat of patterns) {
        let m
        while ((m = pat.exec(content)) !== null) {
          const name = m[1]
          // Skip common non-function names
          if (['ref','computed','reactive','defineStore','defineComponent','watch','onMounted','onUnmounted','nextTick','useXxx'].includes(name)) continue
          if (name.startsWith('use') && name.length <= 6) continue
          if (!contractFuncNames.has(name.toLowerCase())) {
            uncovered.push({ name, file: path.relative('D:/codex/novel-workshop-vue3', f) })
          }
        }
      }
    } catch (e) { /* skip */ }
  }
  return uncovered.slice(0, 50) // Limit output
}

// --- 5. Main ---
function main() {
  console.log('=== Contract-Based Diff Detection ===')
  console.log('Time: ' + new Date().toISOString())
  console.log('')

  // Parse contracts
  const contractFiles = walkDir(CONTRACT_DIR)
  console.log('Contract files found: ' + contractFiles.length)

  const allContracts = []
  let totalFuncs = 0
  for (const cf of contractFiles) {
    const parsed = parseContract(cf)
    allContracts.push(parsed)
    totalFuncs += parsed.funcCount
    console.log('  ' + parsed.file + ': ' + parsed.funcCount + ' functions, src=' + (parsed.srcFile || 'NOT FOUND'))
  }
  console.log('Total functions: ' + totalFuncs)
  console.log('')

  // Structural check: each function exists in source?
  console.log('=== Structural Check ===')
  let passCount = 0, failCount = 0, partialCount = 0
  const results = []
  for (const c of allContracts) {
    for (const f of c.funcs) {
      const check = findInSource(c.srcFile, f.funcName)
      const status = check.found ? 'PASS' : 'FAIL'
      if (check.found) passCount++
      else failCount++
      results.push({
        contract: c.file,
        fid: f.fid,
        funcName: f.funcName,
        srcFile: c.srcFile,
        status,
        locations: check.locations
      })
    }
  }
  console.log('PASS: ' + passCount + ' / FAIL: ' + failCount + ' / Total: ' + (passCount + failCount))
  console.log('')

  // Show failures
  if (failCount > 0) {
    console.log('=== FAILURES ===')
    for (const r of results.filter(r => r.status === 'FAIL')) {
      console.log('  [FAIL] ' + r.contract + ' ' + r.fid + ': ' + r.funcName + ' (src=' + (r.srcFile || 'none') + ')')
    }
    console.log('')
  }

  // Collect test results
  console.log('=== Test Results ===')
  const testResults = collectTestResults()
  let totalPass = 0, totalFail = 0
  for (const t of testResults) {
    if (t.found) {
      console.log('  ' + t.name + ': ' + t.pass + ' PASS / ' + t.fail + ' FAIL')
      totalPass += t.pass
      totalFail += t.fail
    } else {
      console.log('  ' + t.name + ': report not found')
    }
  }
  console.log('  Total: ' + totalPass + ' PASS / ' + totalFail + ' FAIL')
  console.log('')

  // Reverse coverage
  console.log('=== Reverse Coverage (source functions not in contracts) ===')
  const uncovered = findUncoveredFunctions(allContracts)
  console.log('Uncovered functions (first 50): ' + uncovered.length)
  for (const u of uncovered.slice(0, 20)) {
    console.log('  ' + u.name + ' in ' + u.file)
  }
  if (uncovered.length > 20) console.log('  ... and ' + (uncovered.length - 20) + ' more')
  console.log('')

  // Summary
  const matchRate = ((passCount / (passCount + failCount)) * 100).toFixed(1)
  console.log('=== SUMMARY ===')
  console.log('Contract functions: ' + totalFuncs)
  console.log('Structural match: ' + passCount + '/' + (passCount + failCount) + ' (' + matchRate + '%)')
  console.log('Test results: ' + totalPass + ' PASS / ' + totalFail + ' FAIL')
  console.log('Uncovered source functions: ' + uncovered.length + ' (top 50 shown)')

  // Write JSON report
  const report = {
    timestamp: new Date().toISOString(),
    contractFiles: allContracts.map(c => ({ file: c.file, srcFile: c.srcFile, funcCount: c.funcCount })),
    totalFunctions: totalFuncs,
    structuralCheck: { pass: passCount, fail: failCount, matchRate: matchRate + '%' },
    failures: results.filter(r => r.status === 'FAIL'),
    testResults,
    totalTestPass: totalPass,
    totalTestFail: totalFail,
    uncoveredFunctions: uncovered
  }
  fs.writeFileSync(path.join(REPORT_DIR, 'contract_diff_report.json'), JSON.stringify(report, null, 2))
  console.log('')
  console.log('Report written: ' + path.join(REPORT_DIR, 'contract_diff_report.json'))
}

main()
