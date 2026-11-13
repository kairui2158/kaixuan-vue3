#!/usr/bin/env node
// Directed DEAI model-positive generation through the real body-layer S2 contract.
// Secrets stay in the Electron main process: the decrypted key is never logged or persisted.

import { app, net, safeStorage } from 'electron'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const providerConfigPath = 'D:/神意助手数据/wa_providers.json'
const appUserDataPath = process.env.DEAI_DIRECTED_APP_USER_DATA || 'D:/神意助手数据/_app-user-data'
const providerId = process.env.DEAI_DIRECTED_PROVIDER_ID || 'prov-1788240547075'
const modelName = process.env.DEAI_DIRECTED_MODEL || 'deepseek-v4-pro'
const model = modelName
const templatePath = 'D:/codex/玄武规划SKILL/凯旋-正文层/kaixuan-s2/template.md'
const corpusRoot = 'D:/codex/deai-corpus'
const sourcePath = path.join(corpusRoot, 'sources', 'model', providerId, modelName, 'samples.jsonl')
const labelPath = path.join(corpusRoot, 'labels', 'model-positive.jsonl')

const requestCount = Number(process.env.DEAI_DIRECTED_REQUEST_COUNT || 5)
const minSuccessCount = Number(process.env.DEAI_DIRECTED_MIN_SUCCESS || 3)
const requestTimeoutMs = Number(process.env.DEAI_DIRECTED_TIMEOUT_MS || 10 * 60 * 1000)
const retriesPerVariant = Number(process.env.DEAI_DIRECTED_RETRIES_PER_VARIANT || 1)
const previewChars = Number(process.env.DEAI_DIRECTED_PREVIEW_CHARS || 0)
const wordsPerChapter = 3500
const decryptOnly = process.env.DEAI_DIRECTED_DECRYPT_ONLY === '1'

if (!fs.statSync(appUserDataPath, { throwIfNoEntry: false })?.isDirectory()) {
  failConfiguration(`app userData directory not found: ${appUserDataPath}`)
}

// Provider keys are DPAPI-encrypted with the app's real userData. This must run
// before Electron readiness so safeStorage loads the matching OS-protected key.
app.setPath('userData', appUserDataPath)

if (!Number.isFinite(requestCount) || requestCount < 1 || requestCount > 10) {
  failConfiguration('DEAI_DIRECTED_REQUEST_COUNT must be between 1 and 10')
}
if (!Number.isFinite(minSuccessCount) || minSuccessCount < 1 || minSuccessCount > requestCount) {
  failConfiguration('DEAI_DIRECTED_MIN_SUCCESS must be between 1 and request count')
}
if (!Number.isFinite(requestTimeoutMs) || requestTimeoutMs < 30_000) {
  failConfiguration('DEAI_DIRECTED_TIMEOUT_MS must be at least 30000')
}
if (!Number.isFinite(retriesPerVariant) || retriesPerVariant < 0 || retriesPerVariant > 3) {
  failConfiguration('DEAI_DIRECTED_RETRIES_PER_VARIANT must be between 0 and 3')
}
if (!Number.isFinite(previewChars) || previewChars < 0 || previewChars > 1000) {
  failConfiguration('DEAI_DIRECTED_PREVIEW_CHARS must be between 0 and 1000')
}

function failConfiguration(message) {
  console.error(JSON.stringify({ phase: 'configuration', ok: false, message }))
  process.exitCode = 2
  app.quit()
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function nonWhitespaceCount(value) {
  return (String(value).match(/\S/g) || []).length
}

function parseJsonlFile(filePath) {
  if (!fs.statSync(filePath, { throwIfNoEntry: false })?.isFile()) return []
  return fs.readFileSync(filePath, 'utf8')
    .split('\n')
    .filter(line => line.trim())
    .map((line, index) => {
      try {
        return JSON.parse(line)
      } catch (error) {
        throw new Error(`invalid JSONL ${filePath}:${index + 1}: ${error.message}`)
      }
    })
}

function decryptProviderKey() {
  const raw = fs.readFileSync(providerConfigPath, 'utf8')
  const parsed = JSON.parse(raw)
  const provider = (Array.isArray(parsed.providers) ? parsed.providers : []).find(item => item.id === providerId)
  if (!provider) throw new Error(`provider not found: ${providerId}`)
  if (!/^https:\/\//.test(String(provider.baseUrl || ''))) throw new Error(`unexpected provider baseUrl: ${provider.baseUrl}`)
  if (!provider.models?.includes(modelName)) throw new Error(`provider does not list model: ${modelName}`)
  const encrypted = String(provider.apiKey || '')
  if (!encrypted.startsWith('enc:')) throw new Error('provider apiKey is not encrypted with Electron safeStorage')
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Electron safeStorage is unavailable')
  const key = safeStorage.decryptString(Buffer.from(encrypted.slice(4), 'base64'))
  if (!key) throw new Error('provider apiKey decryption returned empty key')
  return { provider, key }
}

function buildSkeleton(variant) {
  const variants = [
    {
      chapter: '雨夜检修',
      pov: '林昭',
      place: '旧城排水泵站',
      scenes: [
        { id: 1, budget: 1000, goal: '确认泵站断电原因', action: '林昭用手电检查配电柜，发现保险熔断并记录编号', obstacle: '积水漫过脚踝，配电柜门锈死', change: '以为是普通跳闸，判断为人为切断', result: '林昭退到干燥台阶，改走检修马道' },
        { id: 2, budget: 1300, goal: '从马道接近泵室', action: '沿马道绕行，避开松动的格栅板，记录水位标记', obstacle: '马道栏杆缺一段，雨声盖住异响', change: '听见金属刮擦后确认泵室内有人活动', result: '停在泵室侧门外的阴影里' },
        { id: 3, budget: 1200, goal: '确认侧门内的情况', action: '透过门缝观察，记下工具摆放和脚印方向', obstacle: '门缝窄，视线被蒸汽遮挡', change: '认出工具属于失踪的同事周衡', result: '林昭按住对讲机，没有出声' }
      ],
      hook: '对讲机里突然传来周衡的声音，方向却在泵室外'
    },
    {
      chapter: '冷库交接',
      pov: '沈茴',
      place: '港口冷链仓库',
      scenes: [
        { id: 1, budget: 1100, goal: '核对交接单与货柜编号', action: '沈茴逐项清点货柜，发现一张复写的旧单据', obstacle: '灯光频繁闪烁，管理员催促签字', change: '发现单据签名笔迹与档案不符', result: '把旧单据折进袖口，继续清点' },
        { id: 2, budget: 1200, goal: '进入冷库复查三号柜', action: '借管理员钥匙进入，检查封条和温度记录', obstacle: '冷库温度骤降，管理员留在门外接电话', change: '封条是旧的，温度记录被人补写', result: '沈茴站到三号柜侧后，等管理员进来' },
        { id: 3, budget: 1200, goal: '与管理员完成试探性对话', action: '用补写记录试探，观察对方反应', obstacle: '管理员拒绝回答，伸手要收回单据', change: '确认对方知道内情但不是主使', result: '沈茴交还复印件，保留原件离开' }
      ],
      hook: '出门时，原件上多出一枚新的指纹'
    },
    {
      chapter: '废站信号',
      pov: '陈屿',
      place: '山地废弃中继站',
      scenes: [
        { id: 1, budget: 1000, goal: '恢复中继站供电', action: '陈屿接入手摇发电机，检查蓄电池电压', obstacle: '线缆被啮齿动物咬破，雨雾侵入机房', change: '从电压摆动判断有人近期充过电', result: '只接通接收机，不发出信号' },
        { id: 2, budget: 1300, goal: '监听残留录音', action: '播放磁带，按时间戳记录断点', obstacle: '磁带受潮，部分段落粘连', change: '断点位置与巡逻班表重合', result: '把班表抄在机房门后' },
        { id: 3, budget: 1200, goal: '确认外来痕迹', action: '检查门口泥痕和暖气阀位置', obstacle: '夜雨不断冲刷痕迹，手电电量下降', change: '确认来人离开不到一小时', result: '陈屿关掉接收机，退到楼梯间' }
      ],
      hook: '楼下传来第二个人的脚步声'
    },
    {
      chapter: '旧船坞谈判',
      pov: '韩澈',
      place: '内河旧船坞',
      scenes: [
        { id: 1, budget: 1100, goal: '取回被扣的检测仪', action: '韩澈按约定进入船坞，确认检测仪外壳编号', obstacle: '对方临时更换交货点，通道被铁链锁住', change: '意识到对方在拖延时间等第二个人', result: '站到吊索阴影下，不进铁链内' },
        { id: 2, budget: 1200, goal: '用编号信息换取主动权', action: '指出检测仪内的定位模块已被拆走', obstacle: '对方否认并出示假模块', change: '假模块序列号与外壳不匹配', result: '韩澈把假模块推回去，要求见拆机的人' },
        { id: 3, budget: 1200, goal: '完成条件交换', action: '约定次日中午在码头办公室交还主板', obstacle: '对方要求韩澈独自前来', change: '韩澈答应时间，但改地点为公共码头', result: '双方各自退场，检测仪暂存船坞' }
      ],
      hook: '离开时，铁链上多了一把新锁'
    },
    {
      chapter: '档案室灯',
      pov: '顾青',
      place: '研究院地下档案室',
      scenes: [
        { id: 1, budget: 1000, goal: '调阅三年前的检测批次', action: '顾青按索引抽档，检查页码连续性', obstacle: '调档系统只允许一次取三盒', change: '发现同批次另一份报告缺首页', result: '先把三盒档案放回原位' },
        { id: 2, budget: 1300, goal: '追查缺页报告去向', action: '借阅登记簿反查最后一次取阅人', obstacle: '登记簿最后一行被撕去一角', change: '笔迹压力显示撕去行写的是本院工号', result: '顾青抄下工号前三位' },
        { id: 3, budget: 1200, goal: '确认调阅室监控口径', action: '向值班员询问监控轮换时间', obstacle: '值班员只回答制度，不看人', change: '监控轮换存在四分钟空档', result: '顾青留下借阅单，不取走缺页报告' }
      ],
      hook: '出口的灯在四分钟后同时熄灭'
    }
  ]
  return variants[variant % variants.length]
}

function buildUserPrompt(variantIndex, validationErrors = []) {
  const skeleton = buildSkeleton(variantIndex)
  const sceneBlocks = skeleton.scenes.map(scene => `
【场景${scene.id}】
POV：${skeleton.pov}
时间地点：雨夜 · ${skeleton.place}
人物位置：${skeleton.pov}在安全观察位，可移动但需避免暴露
目标：${scene.goal}(硬)
行动：${scene.action}(硬)
信息来源：手电光、现场痕迹、听觉与环境变化(硬)
阻碍：${scene.obstacle}(硬)
判断变化：${scene.change}(硬)
空间结果：${scene.result}(硬)
情绪表达：behavior_only(软)
节奏：中快、动作优先(软)
字数：${scene.budget}
`).join('')

  return `[单元闭包卷纲]
本单元只覆盖${skeleton.place}的事件。后续卷、后续章节的目标、反转和台词不得提前释放。

[禁止提前释放]
未发生在当前剧情点里的角色、设定、伏笔和结果，不得写入正文。

[正文执行约束]
请为本章节生成约${wordsPerChapter}字的正文内容。不得输出解释或元数据；按S2协议在结尾输出【正文交接】。

[风格与节奏分析]
叙事推进：动作优先，信息差逐步释放。
情绪表达：behavior_only，用身体反应和选择呈现。
语言质感：粗糙度中高，允许现场噪音和口语。
节奏参数：紧张段落动作密度高，判断转折处减速。

[当前卷概要]
角色${skeleton.pov}正在追查一处地点的异常，卷内目标是拿到可核验的证据，不追求一次解决全案。

[上一章概要]
${skeleton.pov}已确认该地点存在人为干预痕迹，但尚未锁定责任人。

[当前章节剧情点]
章节：${skeleton.chapter}
POV：${skeleton.pov}
目标：完成本地点的现场核验，并留下可追查的物证或口径。
章末钩子：${skeleton.hook}

[相关记忆]
${skeleton.pov}不信任口头解释，只记录可复核的编号、痕迹和时间。

--- 上一步输出 ---
【风格合同】
叙事推进=场景单元推进；情绪表达=behavior_only；语言质感=粗糙度中高；节奏=中快、动作优先

${sceneBlocks}
章末钩子：${skeleton.hook}(硬)

请执行本章节的正文生成链路。${validationErrors.length ? `

[上一次候选失败指标]
${validationErrors.join('；')}
不要复述上一版候选输出。按上述硬约束重新生成一版完整正文，并确保结尾包含【正文交接】、FACT_LOCK：和NEW_FACT：。` : ''}`
}

function validateS2Output(text) {
  const errors = []
  if (!text || typeof text !== 'string') return { valid: false, errors: ['empty response'] }
  if (text.trimStart().startsWith('[')) errors.push('output starts with control token')
  if (!text.includes('【正文交接】')) errors.push('missing body handoff block')
  if (!text.includes('FACT_LOCK：')) errors.push('missing FACT_LOCK block')
  if (!text.includes('NEW_FACT：')) errors.push('missing NEW_FACT block')
  const compactCount = nonWhitespaceCount(text)
  if (compactCount < 1500) errors.push(`non-whitespace chars below corpus minimum: ${compactCount}`)
  if (compactCount > 6000) errors.push(`non-whitespace chars above corpus maximum: ${compactCount}`)
  if (/\b(sk-[a-zA-Z0-9_-]{10,})\b/.test(text)) errors.push('possible secret leakage in response')
  return { valid: errors.length === 0, errors, compactCount }
}

async function requestModelOutput({ key, baseUrl, systemPrompt, userPrompt, attempt }) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs)
  try {
    const response = await net.fetch(`${String(baseUrl).replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: `${userPrompt}

[定向样本补充约束]
本次任务用于采集S2模型正样本，契约优先级高于叙事扩张：
1. 全部输出总长度控制在4200个非空白字符以内；超过即视为无效样本。
2. 必须完整覆盖全部3个场景后立即输出【正文交接】。
3. 【正文交接】中必须包含FACT_LOCK：和NEW_FACT：两个区块；NEW_FACT没有新增时写"NEW_FACT：无"。
4. 禁止输出任何分析、计划、解释或额外章节。`
          }
        ],
        temperature: 0.85,
        max_tokens: 8192,
        stream: false
      })
    })
    const responseText = await response.text()
    if (!response.ok) {
      return { ok: false, status: response.status, message: responseText.slice(0, 500) }
    }
    let parsed
    try {
      parsed = JSON.parse(responseText)
    } catch (error) {
      return { ok: false, status: response.status, message: `invalid JSON response: ${error.message}` }
    }
    const output = parsed?.choices?.[0]?.message?.content
    if (typeof output !== 'string' || !output.trim()) {
      return { ok: false, status: response.status, message: 'response has no non-empty message content' }
    }
    return {
      ok: true,
      status: response.status,
      output,
      usage: parsed?.usage ? {
        promptTokens: parsed.usage.prompt_tokens,
        completionTokens: parsed.usage.completion_tokens,
        totalTokens: parsed.usage.total_tokens
      } : null,
      preview: previewChars > 0 ? output.slice(-previewChars) : undefined
    }
  } catch (error) {
    const aborted = error?.name === 'AbortError'
    return { ok: false, message: aborted ? `request timeout after ${requestTimeoutMs}ms` : error.message }
  } finally {
    clearTimeout(timeout)
  }
}

function appendCorpusRecords(records) {
  const sourceBackup = fs.existsSync(sourcePath) ? fs.readFileSync(sourcePath, 'utf8') : null
  const labelBackup = fs.existsSync(labelPath) ? fs.readFileSync(labelPath, 'utf8') : null
  const sourceDir = path.dirname(sourcePath)
  fs.mkdirSync(sourceDir, { recursive: true })
  try {
    for (const record of records) {
      fs.appendFileSync(sourcePath, `${JSON.stringify(record.source)}\n`, 'utf8')
      fs.appendFileSync(labelPath, `${JSON.stringify(record.label)}\n`, 'utf8')
    }
  } catch (error) {
    if (sourceBackup === null) fs.rmSync(sourcePath, { force: true })
    else fs.writeFileSync(sourcePath, sourceBackup, 'utf8')
    if (labelBackup === null) fs.rmSync(labelPath, { force: true })
    else fs.writeFileSync(labelPath, labelBackup, 'utf8')
    throw error
  }
}

async function main() {
  if (decryptOnly) {
    decryptProviderKey()
    console.log(JSON.stringify({ phase: 'decrypt-only', ok: true, providerId, model }))
    return
  }
  const startedAt = Date.now()
  console.log(JSON.stringify({
    phase: 'start',
    ok: true,
    providerId,
    model,
    requestCount,
    minSuccessCount,
    requestTimeoutMs,
    wordsPerChapter
  }))

  const { provider, key } = decryptProviderKey()
  const systemPrompt = fs.readFileSync(templatePath, 'utf8').replaceAll('{{wordsPerChapter}}', String(wordsPerChapter))
  if (systemPrompt.includes('{{')) throw new Error('S2 template still contains an unresolved placeholder')

  const existingLabels = parseJsonlFile(labelPath)
  const existingIds = new Set(existingLabels.map(record => record.id))
  const accepted = []
  const attempts = []

  let requestSequence = 0
  for (let variantIndex = 0; variantIndex < requestCount; variantIndex += 1) {
    let validationErrors = []
    for (let retryIndex = 0; retryIndex <= retriesPerVariant; retryIndex += 1) {
      requestSequence += 1
      const attemptId = `directed-${new Date().toISOString().replace(/[-:.TZ]/g, '')}-${requestSequence}`
      const userPrompt = buildUserPrompt(variantIndex, validationErrors)
      console.log(JSON.stringify({ phase: 'request', ok: true, attempt: requestSequence, variant: variantIndex + 1, retry: retryIndex, requestCount }))
      const result = await requestModelOutput({ key, baseUrl: provider.baseUrl, systemPrompt, userPrompt, attempt: requestSequence })
      const validation = result.ok ? validateS2Output(result.output) : null
      const attemptRecord = {
        attemptId,
        ok: Boolean(result.ok && validation?.valid),
        status: result.status ?? null,
        usage: result.usage ?? null,
        validationErrors: validation?.errors ?? [result.message || 'request failed'],
        preview: result.preview
      }
      attempts.push(attemptRecord)
      console.log(JSON.stringify({ phase: 'response', ...attemptRecord }))
      if (!attemptRecord.ok) {
        validationErrors = attemptRecord.validationErrors
        continue
      }

      const id = sha256(result.output)
      if (existingIds.has(id)) {
        attempts[attempts.length - 1].ok = false
        attempts[attempts.length - 1].validationErrors = ['duplicate sample id']
        validationErrors = attempts[attempts.length - 1].validationErrors
        continue
      }
      existingIds.add(id)
      accepted.push({
        id,
        output: result.output,
        charCount: validation.compactCount,
        attemptId
      })
      break
    }
  }

  if (accepted.length < minSuccessCount) {
    throw new Error(`accepted sample count below minimum: ${accepted.length}/${minSuccessCount}`)
  }

  const timestamp = Date.now()
  const records = accepted.map(sample => ({
    id: sample.id,
    source: {
      id: sample.id,
      provider: providerId,
      model,
      timestamp,
      pipelineLayer: 'body',
      generationStep: 'KAI-S2',
      skillTemplateVersion: 'folder:KAI-S2',
      labelSource: 'directed-generation',
      attemptId: sample.attemptId,
      charCount: sample.charCount,
      text: sample.output
    },
    label: {
      id: sample.id,
      label: 'model-positive',
      labelSource: 'directed-generation',
      authorization: 'confirmed',
      provider: providerId,
      model,
      generationStep: 'KAI-S2',
      attemptId: sample.attemptId,
      charCount: sample.charCount
    }
  }))
  appendCorpusRecords(records)

  console.log(JSON.stringify({
    phase: 'complete',
    ok: true,
    providerId,
    model,
    acceptedCount: accepted.length,
    minSuccessCount,
    requestedCount: requestCount,
    attempts,
    sourcePath,
    labelPath,
    elapsedMs: Date.now() - startedAt
  }, null, 2))
}

app.whenReady().then(async () => {
  try {
    await main()
  } catch (error) {
    console.error(JSON.stringify({ phase: 'error', ok: false, message: error.message }))
    process.exitCode = 1
  } finally {
    app.quit()
  }
})
