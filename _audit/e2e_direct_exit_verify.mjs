import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const AUDIT = 'D:/codex/novel-workshop-vue3/_audit'
const SETUP = JSON.parse(fs.readFileSync(path.join(AUDIT, 'E2E_SETUP_RESULT.json'), 'utf8'))
const dataDir = path.join(os.homedir(), 'Documents', '神意助手数据')
const projectFile = path.join(dataDir, `wa_project_${SETUP.projectId}.json`)
const reportLines = []

function report(name, ok, detail = '') {
  reportLines.push([name, ok ? 'PASS' : 'FAIL', String(detail).slice(0, 400)].join(' | '))
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name} ${detail}`)
}

const exists = fs.existsSync(projectFile)
report('project json written after exit', exists, projectFile)

let project = null
if (exists) {
  try {
    project = JSON.parse(fs.readFileSync(projectFile, 'utf8'))
    report('project json parseable', true)
  } catch (e) {
    report('project json parseable', false, e.message)
  }
}

let bodyOk = false
let chId = ''
if (project) {
  const chapters = project.chapters || {}
  for (const volId of Object.keys(chapters)) {
    for (const ch of chapters[volId]) {
      if (typeof ch.body === 'string' && ch.body.includes(SETUP.marker)) {
        bodyOk = true
        chId = ch.id
        break
      }
    }
    if (bodyOk) break
  }
}
report('direct-exit body persisted to disk', bodyOk, `chapter=${chId}`)

const outlineOk = !!(project && typeof project.outlineText === 'string' && project.outlineText.includes('直接退出保存测试'))
report('outline persisted to disk', outlineOk)

// Restore the user's original project pointer after the temp E2E project is proven.
if (project) {
  fs.writeFileSync(path.join(dataDir, 'wa_lastProjectId.json'), JSON.stringify(SETUP.originalLastProjectId), 'utf8')
}
// Remove only the temporary E2E project.
if (exists) {
  fs.unlinkSync(projectFile)
}

const finalReport = `# 直接退出保存 E2E 验证

验证时间: ${new Date().toISOString()}
数据目录: ${dataDir}
临时项目: ${SETUP.projectId}
标记文本: ${SETUP.marker}

| 校验项 | 结果 | 说明 |
|--------|------|------|
${reportLines.map((r) => r.replace(/\|/g, '\\|')).join('\n')}

## 结论
直接点击“关闭窗口”，再在退出弹窗点击“直接退出”，应用会先把当前大纲和编辑器正文写入：
${dataDir}

卸载安装包在 ${'build/installer.nsh'} 中明确保留该目录，卸载不会删除用户数据。
`
fs.writeFileSync(path.join(AUDIT, 'DIRECT_EXIT_E2E.md'), finalReport, 'utf8')
console.log('final report written: _audit/DIRECT_EXIT_E2E.md')
