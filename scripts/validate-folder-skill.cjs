'use strict'

const fs = require('fs')
const path = require('path')

const REQUIRED_FILES = ['SKILL.md', 'template.md']
const OPTIONAL_FILES = ['meta.json', 'script.js', 'samples.txt', 'schema.json']
const ALLOWED_FILES = new Set([...REQUIRED_FILES, ...OPTIONAL_FILES, 'children'])
const YAML_FIELDS = ['schema', 'version', 'id', 'name', 'description', 'format']
const SCRIPT_HOOKS = ['preProcess', 'postProcess', 'plan', 'afterStep']
const EXECUTION_MODES = new Set(['single', 'multi-pass', 'composite'])

function fail(errors) {
  for (const item of errors) console.error(`[失败] ${item}`)
  console.error(`校验未通过：${errors.length} 个问题`)
  process.exit(1)
}

function parseFrontMatter(content) {
  const normalized = content.replace(/\r\n/g, '\n')
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n?/)
  if (!match) return { ok: false, fields: {}, body: normalized }
  const fields = {}
  for (const line of match[1].split('\n')) {
    const item = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (item) fields[item[1]] = item[2].trim().replace(/^["']|["']$/g, '')
  }
  return { ok: true, fields, body: normalized.slice(match[0].length).trim() }
}

function countTemplateVariables(template) {
  const matches = template.match(/\{\{[^}]+\}\}/g) || []
  return [...new Set(matches.map(item => item.trim()))]
}

function validateMeta(meta, errors) {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
    errors.push('meta.json 必须是 JSON 对象')
    return
  }
  for (const key of Object.keys(meta)) {
    if (['executionMode', 'passes', 'apiCallLimit', 'sampleCount', 'smartSamples', 'children', 'agent'].includes(key)) continue
    errors.push(`meta.json 含未知字段：${key}`)
  }
  if (meta.executionMode !== undefined && !EXECUTION_MODES.has(meta.executionMode)) {
    errors.push(`meta.executionMode 仅支持 single / multi-pass / composite，当前为 ${JSON.stringify(meta.executionMode)}`)
  }
  if (meta.apiCallLimit !== undefined && (!Number.isInteger(meta.apiCallLimit) || meta.apiCallLimit < 1)) {
    errors.push('meta.apiCallLimit 必须是大于 0 的整数')
  }
  if (meta.sampleCount !== undefined && (!Number.isInteger(meta.sampleCount) || meta.sampleCount < 1 || meta.sampleCount > 5)) {
    errors.push('meta.sampleCount 必须是 1-5 的整数')
  }
  if (meta.smartSamples !== undefined && typeof meta.smartSamples !== 'boolean') {
    errors.push('meta.smartSamples 必须是布尔值')
  }
  if (meta.passes !== undefined) {
    if (!Array.isArray(meta.passes)) {
      errors.push('meta.passes 必须是数组')
    } else if (meta.passes.length > 5) {
      errors.push('meta.passes 最多 5 轮')
    } else {
      meta.passes.forEach((item, index) => {
        if (typeof item !== 'object' || item === null || Array.isArray(item)) {
          errors.push(`meta.passes[${index}] 必须是对象`)
          return
        }
        if (item.input !== undefined && !['original', 'previous'].includes(item.input)) {
          errors.push(`meta.passes[${index}].input 仅支持 original / previous`)
        }
      })
    }
  }
  if (meta.children !== undefined) {
    if (!Array.isArray(meta.children) || meta.children.some(item => typeof item !== 'string' || !item.trim())) {
      errors.push('meta.children 必须是非空字符串数组')
    }
  }
  if (meta.agent !== undefined) {
    const agent = meta.agent
    if (typeof agent !== 'object' || agent === null || Array.isArray(agent)) {
      errors.push('meta.agent 必须是对象')
    } else {
      for (const key of Object.keys(agent)) {
        if (!['model', 'temperature', 'maxTokens', 'systemPrompt'].includes(key)) {
          errors.push(`meta.agent 含未知字段：${key}`)
        }
      }
      if (agent.temperature !== undefined && (typeof agent.temperature !== 'number' || agent.temperature < 0 || agent.temperature > 1)) {
        errors.push('meta.agent.temperature 必须是 0-1 的数字')
      }
      if (agent.maxTokens !== undefined && (!Number.isInteger(agent.maxTokens) || agent.maxTokens < 1)) {
        errors.push('meta.agent.maxTokens 必须是正整数')
      }
      if (agent.model !== undefined && typeof agent.model !== 'string') {
        errors.push('meta.agent.model 必须是字符串')
      }
      if (agent.systemPrompt !== undefined && typeof agent.systemPrompt !== 'string') {
        errors.push('meta.agent.systemPrompt 必须是字符串')
      }
    }
  }
}

function validateScript(content, errors) {
  if (/require\s*\(/.test(content)) errors.push('script.js 不能使用 require')
  if (/process\s*\./.test(content)) errors.push('script.js 不能访问 process')
  if (/__dirname/.test(content)) errors.push('script.js 不能访问 __dirname')
  const exportsObject = /module\.exports\s*=\s*\{/.test(content)
  const foundHooks = SCRIPT_HOOKS.filter(hook => {
    if (exportsObject) return new RegExp(`\\b${hook}\\s*\\(`).test(content)
    return new RegExp(`(?:module\\.exports|exports)\\s*\\.\\s*${hook}\\b`).test(content)
  })
  if (foundHooks.length === 0) errors.push('script.js 必须通过 module.exports 导出至少一个钩子函数')
}

function validateYamlFields(fields, errors) {
  for (const field of ['schema', 'version', 'id', 'name']) {
    if (!fields[field] || !String(fields[field]).trim()) errors.push(`SKILL.md 缺少必填字段：${field}`)
  }
  for (const key of Object.keys(fields)) {
    if (!YAML_FIELDS.includes(key)) errors.push(`SKILL.md 含未知字段：${key}`)
  }
  if (fields.schema && fields.schema !== 'shenyi-skill-folder') {
    errors.push(`SKILL.md schema 必须是 shenyi-skill-folder，当前为 ${fields.schema}`)
  }
  if (fields.version && fields.version !== '1') {
    errors.push(`SKILL.md version 必须是 1，当前为 ${fields.version}`)
  }
  if (fields.format && fields.format !== 'folder') {
    errors.push(`SKILL.md format 必须是 folder，当前为 ${fields.format}`)
  }
}

function validateFolder(folderPath) {
  const errors = []
  const resolved = path.resolve(folderPath)
  let stat = null
  try { stat = fs.statSync(resolved) } catch (_) { /* handled below */ }
  if (!stat || !stat.isDirectory()) {
    fail([`技能文件夹不存在或不是目录：${resolved}`])
  }

  for (const file of REQUIRED_FILES) {
    if (!fs.existsSync(path.join(resolved, file))) errors.push(`缺少必需文件：${file}`)
  }
  for (const entry of fs.readdirSync(resolved)) {
    if (!ALLOWED_FILES.has(entry)) errors.push(`不支持或未识别的顶层文件/目录：${entry}`)
  }
  if (errors.length > 0) fail(errors)

  const skillContent = fs.readFileSync(path.join(resolved, 'SKILL.md'), 'utf8')
  const parsed = parseFrontMatter(skillContent)
  if (!parsed.ok) errors.push('SKILL.md 缺少 YAML 元信息头（--- 包裹）')
  else validateYamlFields(parsed.fields, errors)

  const template = fs.readFileSync(path.join(resolved, 'template.md'), 'utf8')
  if (!template.trim()) errors.push('template.md 不能为空')

  for (const file of ['meta.json', 'schema.json']) {
    const filePath = path.join(resolved, file)
    if (!fs.existsSync(filePath)) continue
    try { JSON.parse(fs.readFileSync(filePath, 'utf8')) } catch (error) { errors.push(`${file} 不是有效 JSON：${error.message}`) }
  }
  if (fs.existsSync(path.join(resolved, 'meta.json'))) {
    validateMeta(JSON.parse(fs.readFileSync(path.join(resolved, 'meta.json'), 'utf8')), errors)
  }
  if (fs.existsSync(path.join(resolved, 'script.js'))) {
    validateScript(fs.readFileSync(path.join(resolved, 'script.js'), 'utf8'), errors)
  }
  if (fs.existsSync(path.join(resolved, 'samples.txt'))) {
    const samples = fs.readFileSync(path.join(resolved, 'samples.txt'), 'utf8')
    if (!samples.trim()) errors.push('samples.txt 存在但不能为空')
  }

  if (errors.length > 0) fail(errors)

  const meta = fs.existsSync(path.join(resolved, 'meta.json'))
    ? JSON.parse(fs.readFileSync(path.join(resolved, 'meta.json'), 'utf8'))
    : {}
  const variables = countTemplateVariables(template)
  console.log(`[通过] Folder SKILL 校验通过：${resolved}`)
  console.log(`ID：${parsed.fields.id || path.basename(resolved)}`)
  console.log(`名称：${parsed.fields.name || parsed.fields.id || path.basename(resolved)}`)
  console.log(`模板变量：${variables.length === 0 ? '无' : variables.join('、')}`)
  console.log(`能力：${meta.executionMode || 'single'}${meta.apiCallLimit ? `，调用上限 ${meta.apiCallLimit}` : ''}${meta.smartSamples ? '，智能样本' : ''}`)
  if (meta.agent) console.log(`Agent 默认值：temperature=${meta.agent.temperature ?? '未设置'}，maxTokens=${meta.agent.maxTokens ?? '未设置'}`)
}

const target = process.argv[2]
if (!target) {
  console.error('用法：node scripts/validate-folder-skill.cjs <技能文件夹路径>')
  process.exit(1)
}
validateFolder(target)
