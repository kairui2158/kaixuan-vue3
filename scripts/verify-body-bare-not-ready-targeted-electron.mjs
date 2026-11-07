import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { Readable } from 'node:stream'
import { execFileSync, spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import defaultPaths from '../electron/defaultPaths.js'

const ROOT = path.resolve(process.cwd())
const SCRIPT_NAME = 'verify-body-bare-not-ready-targeted-electron.mjs'
const LIVE_MODE = process.env.SHENYI_BODY_NOT_READY_LIVE === '1'
const ELECTRON_EXE = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = Number(process.env.SHENYI_BODY_NOT_READY_CDP_PORT || 9387)
const PROFILE = LIVE_MODE
  ? path.join(ROOT, '_data', 'body-not-ready-targeted-live-profile')
  : path.join(ROOT, '_data', 'body-not-ready-targeted-profile')
const EVIDENCE_ROOT = path.join(ROOT, '_audit', 'verification-body-bare-not-ready-targeted')
const RUN_LOG_PATH = path.join(EVIDENCE_ROOT, 'electron-run.log')
const PROJECT_ID = 'body-not-ready-targeted-ui'
const VOLUME_ID = 'vol-not-ready-targeted'
const CHAPTER_ID = 'ch-not-ready-targeted'
const CHAPTER_WORDS = 2000
const NOT_READY_TEXT = '[NOT-READY] 交接输入不可恢复：归一化后仍缺字段：场景分段、场景字数、场景施工卡'
const S1_SKELETON = [
  '【本章骨架说明】',
  'narrativeReason：骨架可施工',
  '本章按四场推进：第一场建立物理目标，第二场读取信息，第三场暴露威胁，第四场完成不可逆选择。',
  '',
  '【正文交接】',
  '章节：第1章 纸条',
  'POV：王芳',
  'chapterIntent：发现纸条→读取地址→决定是否送出',
  '场景类型：场景1：受限行动；场景2：对白；场景3：观察；场景4：动作',
  '对白排布：场景1：无对话对象：登记自言；场景2：出声；场景3：无对话对象：观测记录；场景4：出声',
  '场景分段：场景1：段1-段6；场景2：段7-段12；场景3：段13-段18；场景4：段19-段24',
  '场景字数：场景1：500；场景2：500；场景3：500；场景4：500',
  '场景施工卡：场景1：句号密度≤44/千字；段落中位≤55字；身体词≤19/千字；物件/空间替代≥2处；场景2：句号密度≤44/千字；段落中位≤55字；身体词≤19/千字；物件/空间替代≥2处；场景3：句号密度≤44/千字；段落中位≤55字；身体词≤19/千字；物件/空间替代≥2处；场景4：句号密度≤44/千字；段落中位≤55字；身体词≤19/千字；物件/空间替代≥2处',
  '已完成场景：场景1至场景4',
  '未完成场景：无',
  '来源覆盖状态：已覆盖全部剧情点',
  '角色状态变化：王芳从被动发现纸条变为主动决定是否寄出纸条',
  '章末状态：王芳把地址抄进航海日志，把原件放回灯座',
  '下一章必须使用：纸条地址与王芳未向同伴说明的隐瞒',
  '目标字数：2000',
  '生成下限：1600',
  '场景总数：4',
  '事件增量：王芳确认纸条地址，识别追踪者，最终把原件放回灯座',
  'narrativeStatus：ready',
  'narrativeReason：骨架可施工',
  'stateChangingScenes：场景1（信息：未知地址→确认地址）；场景2（关系：独自隐瞒→获得同伴协助）；场景3（威胁：无追踪迹象→确认有人跟踪）；场景4（身体：迟疑→稳定行动）',
  'FACT_LOCK：人物状态=王芳决定暂缓寄出纸条；位置=灯塔底层；伤势=无；持有物=纸条与航海日志；时间点=风暴夜；关键数字=三次红闪；新增事实=纸条上有港口地址；钩子兑现状态=未兑现',
  'NEW_FACT：王芳确认纸条地址但暂缓寄出',
].join('\n')

const DEFAULT_USER_DATA_DIR = path.join(
  process.env.APPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Roaming'),
  'shenyi-assistant'
)
const REAL_USER_DATA_DIR = process.env.SHENYI_REAL_USER_DATA_DIR
  ? path.resolve(process.env.SHENYI_REAL_USER_DATA_DIR)
  : defaultPaths.getUserDataDir(DEFAULT_USER_DATA_DIR)
const REAL_PROVIDER_CONFIG_PATH = process.env.SHENYI_REAL_PROVIDER_CONFIG
  ? path.resolve(process.env.SHENYI_REAL_PROVIDER_CONFIG)
  : path.join(defaultPaths.getDataRoot(path.join(process.env.USERPROFILE || '', 'Documents')), 'wa_providers.json')
const LIVE_PROVIDER_NAME = process.env.SHENYI_BODY_NOT_READY_LIVE_PROVIDER || '全局'
const LIVE_MODEL_NAME = process.env.SHENYI_BODY_NOT_READY_LIVE_MODEL || 'glm-5.2'

const BODY_PARAGRAPHS = [
  '王芳在灯塔底层按下铜钮，盐雾顺着铁栏滑进掌心。红色信标每闪一次，旧航线图就在桌上轻颤一回。她把潮湿的袖口压住纸条边缘，不让风把它卷走。',
  '楼梯间的海水声像旧账本被慢慢翻动。铜壳灯罩里积着灰，却仍把她的影子钉在斑驳墙上。远处货轮拖长鸣笛，声音被雨幕压成一道低哑的痕。',
  '纸条边缘被潮气咬出毛边，字迹却仍清楚。她没有立刻念出那串地址，只先用指尖沿笔画走了一遍。灯座下的裂纹停在一道旧刻痕旁，像有人曾把秘密压进铁里。',
  '第三次红闪落下时，她终于承认自己在怕。风从百叶缝里挤进来，把纸条掀起一角又放下。她把呼吸放慢，数着塔身深处传来的机械回声。',
  '航海日志摊在角落，上一页还留着未干墨迹。她拿起炭笔，在空白处抄下前半串地址。笔画很轻，仿佛怕纸上那道旧折痕会忽然醒来。',
  '塔外雨线斜成密集的网，打湿了半扇玻璃。她把纸条举到灯前，确认地址末尾有两个相似数字。楼梯上方忽然传来一声木料轻响，她立刻停笔。',
  '她朝楼梯上方低声询问了一声。空塔把声音撞出回音，半开的门后只挂着一件旧雨衣，水珠顺着下摆滴进铁盆。她仍旧等到第三次滴落，才继续抄写地址。',
  '同伴从楼梯探身下来，手里提着备用灯。她把纸条转向光，只露出地址前四位。两人没有多话，却同时看向通往码头的铁门。',
  '“如果这是港口仓库，就去查旧航班。”同伴说。王芳点头，把后半串地址记进航海日志。备用灯照亮纸上那道折痕，也照亮她眼底尚未退去的疑虑。',
  '铁盆里的水纹渐渐平了，钟表声重新变得清楚。她把地址拆成两组，一组交给同伴，一组留在自己手心。这个分法像把风险暂时切成两半，谁也不必独自扛完。',
  '备用灯的光越过栏杆，落在墙上一幅褪色航线图。他们找到那条被红笔划过的旧航道，坐标附近标着三处锚点。王芳用炭笔圈住最靠南的一处，那里离纸条地址最近。',
  '同伴忽然指向窗外，雨幕里有一道车灯正沿堤岸慢行。车灯没有开远光，却在每座仓库前短暂停留。王芳把纸条折进内袋，两人同时退到百叶阴影后。',
  '车灯停在第三座仓库外，引擎声没有熄灭。她透过叶缝看见一个人影下车，手里举着一张纸。那姿势像在核对地址，又像在等塔里的回应。',
  '追踪者的靴底踩过积水，声音一下一下靠近灯塔。同伴把手电关掉，把备用灯塞进木箱。王芳听见自己的心跳压过雨声，却仍稳稳按住航海日志。',
  '来人没有敲门，只把一张新纸条塞进门缝。纸上没有署名，只有一句“旧航班已取消”。王芳没有去捡，先用镜片反射灯影，观察门缝外的手是否离开。',
  '靴声转向堤岸，积水声渐渐被风吞掉。她拾起新纸条，发现纸角有相同的红蜡封。两张纸条放在一起，像同一只手写下的两个阶段。',
  '同伴低声说仓库今夜无人值守。王芳摇头，把旧地址重新抄到航海日志最后一页。她不愿把一次警告当成结束，尤其那辆车仍在雨里没有离开。',
  '灯塔机械声忽然加快，红色信标连闪三次。她认出这是老管理员留下的警示节拍。楼下铁门被风撞了一下，门闩仍在，但链环已经松动。',
  '她抓起灯座旁的短撬棍，示意同伴守住楼梯口。雨声里混进金属摩擦，像有人正在解开仓库外的锁链。王芳把两串地址并排写在掌心大小的纸片上。',
  '旧航班档案就压在航线图后的木匣里。她抽出登记册，翻到三年前的一页。那一页的出发港和纸条地址吻合，收货人栏却被墨线划掉。',
  '被划掉的收货人旁有一个简写，与追踪者车上的标志相同。王芳把登记册拍下，交给同伴保管。这个证据比地址更重，也更危险。',
  '“我们得分开走。”她终于开口。同伴皱眉，却还是接过登记册，把备用灯留给她。两条路在雨幕外分岔，一条去码头，一条回仓库。',
  '王芳没有立刻选择路线。她把原件放回灯座夹层，只带走抄件和登记册照片。追踪者要的也许是纸条本身，那么灯座就该继续替她保守秘密。',
  '红色信标恢复均匀闪烁，机械声重新变得沉稳。她最后看了一眼航海日志上的新地址，把炭笔收进胸袋。风仍在塔外盘旋，但她已经知道下一步该落在哪里。',
  '楼梯口的湿气顺着台阶往上爬，把铁锈味压进每一次呼吸。王芳回到航线图前，用炭笔把三处锚点之间的距离标成短线。数字不会替她判断，但能把陌生的水域拆成可以丈量的路。',
  '木匣角落压着一张旧照片，边角被海水浸出黄痕。照片里灯塔还没装新灯，几个穿雨衣的人站在堤上。她把照片翻过来，背面只写着日期，却和登记册上的航班日期前后相连。',
  '同伴在楼下喊了一声，说仓库方向的雨声变了。她走到百叶旁，看见那辆车终于熄了灯，雨幕只剩堤岸尽头一点灰影。没有引擎声，不代表没有等待，她把这一点也写进航海日志。',
  '桌面上的水珠沿着裂缝汇成细流，浸湿了登记册的一角。她用干布吸掉水痕，把重要那页夹进防水袋。纸上的证据不能替她冒险，却能让下一次追问有地方落脚。',
  '防水袋被她塞进贴身口袋，边缘硌着肋骨，却比任何安慰都实在。她回到灯座旁，检查夹层的铜扣是否扣紧。潮气从石缝里渗出来，在金属表面凝成一层薄薄的雾。',
  '航海日志合上时，封面压出一声钝响。王芳把炭笔横放在页面切口，确保下次翻开就能看见新地址。楼梯下的铁门又晃了一下，她抬眼确认门闩，才把注意力放回桌面的航线图。',
  '航线图上的三处锚点像三个沉默的问号。她用炭笔把最南端那处圈了两遍，又在旁边记下仓库编号。地图不会承认危险，可这些短线已经把危险放进可检查的范围里。',
  '雨声退成细密的背景，灯塔内部只剩机械节拍和纸页摩擦。王芳把旧照片压在登记册照片下方，两张纸上的日期刚好形成一条可疑的线。她把登记册照片翻进防水袋，目光停在通往仓库的铁门上。',
]

function buildBodyReply() {
  return [
    BODY_PARAGRAPHS.join('\n\n'),
    '【正文交接】',
    '章节：第1章 纸条',
    'POV：王芳',
    'chapterIntent：发现纸条→读取地址→决定是否送出',
    '场景类型：场景1：受限行动；场景2：对白；场景3：观察；场景4：动作',
    '对白排布：场景1：无对话对象：登记自言；场景2：出声；场景3：无对话对象：观测记录；场景4：出声',
    '场景分段：场景1：段1-段6；场景2：段7-段12；场景3：段13-段18；场景4：段19-段24',
    '场景字数：场景1：500；场景2：500；场景3：500；场景4：500',
    '场景施工卡：场景1：句号密度≤44/千字；段落中位≤55字；身体词≤19/千字；物件/空间替代≥2处；场景2：句号密度≤44/千字；段落中位≤55字；身体词≤19/千字；物件/空间替代≥2处；场景3：句号密度≤44/千字；段落中位≤55字；身体词≤19/千字；物件/空间替代≥2处；场景4：句号密度≤44/千字；段落中位≤55字；身体词≤19/千字；物件/空间替代≥2处',
    '已完成场景：场景1至场景4',
    '未完成场景：无',
    '来源覆盖状态：已覆盖全部剧情点',
    '角色状态变化：王芳从被动发现纸条变为主动决定是否寄出纸条',
    '章末状态：王芳把地址抄进航海日志，把原件放回灯座',
    '下一章必须使用：纸条地址与王芳未向同伴说明的隐瞒',
    '目标字数：2000',
    '生成下限：1600',
    '场景总数：4',
    '事件增量：王芳确认纸条地址，识别追踪者，最终把原件放回灯座',
    'narrativeStatus：ready',
    'narrativeReason：正文按骨架完成两次状态推进',
    'stateChangingScenes：场景1（信息：未知地址→确认地址）；场景2（关系：独自隐瞒→获得同伴协助）；场景3（威胁：无追踪迹象→确认有人跟踪）；场景4（身体：迟疑→稳定行动）',
    'FACT_LOCK：人物状态=王芳决定暂缓寄出纸条；位置=灯塔底层；伤势=无；持有物=纸条与航海日志；时间点=风暴夜；关键数字=三次红闪；新增事实=纸条上有港口地址；钩子兑现状态=未兑现',
    'NEW_FACT：王芳确认纸条地址但暂缓寄出',
    '【正文交接结束】',
    '【来源覆盖】',
    'H1-01',
    '【来源覆盖结束】',
  ].join('\n\n')
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function flattenMessageContent(content) {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content.map(part => flattenMessageContent(part?.text ?? part)).join('\n')
  if (content && typeof content === 'object') {
    return flattenMessageContent(content.text ?? content.content ?? '')
  }
  return String(content || '')
}

function requestMessages(parsed) {
  return (parsed.messages || []).map(message => ({
    role: String(message?.role || ''),
    content: flattenMessageContent(message?.content),
  }))
}

function writeJson(name, value) {
  fs.mkdirSync(EVIDENCE_ROOT, { recursive: true })
  fs.writeFileSync(path.join(EVIDENCE_ROOT, name), JSON.stringify(value, null, 2), 'utf8')
  return path.join(EVIDENCE_ROOT, name)
}

function writeRunLog(step, value) {
  fs.mkdirSync(EVIDENCE_ROOT, { recursive: true })
  const body = typeof value === 'string' ? value : JSON.stringify(value)
  fs.appendFileSync(RUN_LOG_PATH, `[${new Date().toISOString()}] ${step} ${body}\n`, 'utf8')
}

function assertFreshRenderer() {
  const indexHtml = fs.readFileSync(path.join(ROOT, 'dist-renderer', 'index.html'), 'utf8')
  const bundles = [...indexHtml.matchAll(/assets\/[^"']+\.js/g)].map(match => match[0])
  assert(bundles.length > 0, 'dist-renderer/index.html references a production bundle')
  const assetRoot = path.join(ROOT, 'dist-renderer', 'assets')
  const sourceFiles = []
  const collect = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) collect(full)
      else if (/\.(vue|ts|js|mjs)$/.test(entry.name)) sourceFiles.push(full)
    }
  }
  collect(path.join(ROOT, 'src'))
  const newestSourceMs = Math.max(...sourceFiles.map(file => fs.statSync(file).mtimeMs))
  const stale = bundles.filter(name => fs.statSync(path.join(ROOT, 'dist-renderer', name)).mtimeMs < newestSourceMs)
  assert.equal(stale.length, 0, `renderer is stale; rebuild with npm run build:vue. stale=${stale.join(',')}`)
}

function providerConfig(requestCounts) {
  const providers = Object.entries(LAYER_PROVIDERS).map(([layer, id]) => ({
    id,
    name: `${layer}通道供应商`,
    baseUrl: `http://127.0.0.1:${requestCounts.port}/v1`,
    apiKey: `local-${layer}`,
    models: [`${layer}-model`],
    selectedModel: `${layer}-model`,
    temperature: 0.1,
    maxTokens: 8192,
    contextWindowTokens: 128000,
    purpose: ['generate'],
    providerType: 'openai-compatible',
    streamMode: true,
  }))
  return {
    providers,
    generateProvider: providers[0]?.id || null,
    verifyProvider: null,
    detectProvider: null,
    pipelineLayerProviders: {},
  }
}

const LAYER_PROVIDERS = {
  settings: 'provider-settings',
  volumes: 'provider-volumes',
  chapters: 'provider-chapters',
  body: 'provider-body',
}

function liveProviderConfig(proxyBaseUrl, apiKey) {
  assert(LIVE_MODE, 'liveProviderConfig only runs in live mode')
  assert(String(apiKey || '').length > 20, 'live provider key is usable; value is never logged')
  const providers = Object.entries(LAYER_PROVIDERS).map(([layer, id]) => ({
    id,
    name: `live-${layer}通道供应商`,
    baseUrl: proxyBaseUrl,
    apiKey,
    models: [LIVE_MODEL_NAME],
    selectedModel: LIVE_MODEL_NAME,
    temperature: 0.1,
    maxTokens: 8192,
    contextWindowTokens: 128000,
    purpose: ['generate'],
    providerType: 'openai-compatible',
    streamMode: true,
  }))
  return {
    providers,
    generateProvider: providers[0]?.id || null,
    verifyProvider: null,
    detectProvider: null,
    pipelineLayerProviders: {},
  }
}

async function startNotReadyProxy({ targetBaseUrl, apiKey }) {
  assert(LIVE_MODE, 'startNotReadyProxy only runs in live mode')
  const requests = []
  let s1PostCount = 0
  let s2PostCount = 0
  const server = http.createServer((request, response) => {
    const chunks = []
    request.on('data', chunk => chunks.push(chunk))
    request.on('end', () => {
      const body = Buffer.concat(chunks)
      let parsed = {}
      try { parsed = JSON.parse(body) } catch {}
      const requestMessageList = requestMessages(parsed)
      const userText = requestMessageList.filter(message => message.role === 'user')
        .map(message => message.content).join('\n')
      const promptText = requestMessageList.map(message => message.content).join('\n')
      const isS1 = promptText.includes('把当前章节材料转成正文场景骨架')
      const isS2 = promptText.includes('上一步骨架包含场景区块')
      const isS3 = promptText.includes('语言层打磨')
      const layer = isS1 || isS2 || isS3 ? 'body' : null
      const record = {
        at: new Date().toISOString(),
        url: request.url,
        method: request.method,
        model: parsed.model || null,
        wantsStream: parsed.stream === true,
        isS1,
        isS2,
        isS3,
        userPreview: userText.slice(0, 300),
      }
      requests.push(record)
      writeRunLog('proxy-request', record)
      if (request.method === 'GET' && request.url.replace(/^\/+/, '') === 'v1/models') {
        record.status = 200
        record.proxyResponder = 'models-fixture'
        response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
        response.end(JSON.stringify({ object: 'list', data: [{ id: LIVE_MODEL_NAME, object: 'model' }] }))
        return
      }
      if (request.method === 'POST' && layer === 'body' && isS1) {
        s1PostCount += 1
        record.intercepted = false
        record.proxyResponder = 's1-skeleton'
        record.s1PostCount = s1PostCount
        sendReply(parsed, response, S1_SKELETON)
        return
      }
      if (request.method === 'POST' && layer === 'body' && isS2) {
        s2PostCount += 1
        if (s2PostCount === 1) {
          record.intercepted = true
          record.proxyResponder = 'bare-not-ready'
          const reply = NOT_READY_TEXT
          sendReply(parsed, response, reply)
          return
        }
        record.intercepted = false
        record.proxyResponder = 'live-upstream'
      }
      const upstreamUrl = new URL(request.url, targetBaseUrl)
      const headers = { ...request.headers }
      delete headers.host
      delete headers.connection
      headers.authorization = `Bearer ${apiKey}`
      fetch(upstreamUrl, {
        method: request.method,
        headers,
        body: ['GET', 'HEAD'].includes(request.method) ? undefined : body,
      }).then(upstream => {
        record.status = upstream.status
        response.writeHead(upstream.status, Object.fromEntries(upstream.headers))
        if (!upstream.body) {
          response.end()
          return
        }
        Readable.fromWeb(upstream.body).pipe(response)
      }).catch(error => {
        record.error = String(error?.message || error)
        response.writeHead(502, { 'content-type': 'application/json; charset=utf-8' })
        response.end(JSON.stringify({ error: 'live proxy upstream failure' }))
      })
    })
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  return {
    port: server.address().port,
    baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
    requests: () => requests.map(item => ({ ...item })),
    close: () => new Promise(resolve => server.close(() => resolve())),
  }
}

function sendReply(parsed, response, reply) {
  if (parsed.stream === true) {
    response.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8' })
    response.write(`data: ${JSON.stringify({ choices: [{ delta: { role: 'assistant', content: reply } }] })}\n\n`)
    response.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } })}\n\n`)
    response.end('data: [DONE]\n\n')
    return
  }
  response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify({
    choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: reply } }],
  }))
}

function decryptLiveProviderKeyOnce() {
  assert(LIVE_MODE, 'decryptLiveProviderKeyOnce only runs in live mode')
  assert(fs.existsSync(REAL_PROVIDER_CONFIG_PATH),
    `live provider config exists: ${REAL_PROVIDER_CONFIG_PATH}; no new key is entered by this verifier`)
  const config = JSON.parse(fs.readFileSync(REAL_PROVIDER_CONFIG_PATH, 'utf8'))
  const selected = findSelectedLiveProvider(config)
    || (config.providers || []).find(item => item?.id === config.generateProvider)
  assert(selected, `configured real provider found: ${LIVE_PROVIDER_NAME}`)
  const keyState = String(selected.apiKey || '').startsWith('enc:') ? 'encrypted' : 'plaintext'
  assert.equal(keyState, 'encrypted', 'live provider key is DPAPI-protected in the real application profile')
  const script = path.join(ROOT, 'scripts', 'decrypt-provider-key.cjs')
  const result = execFileSync(ELECTRON_EXE, [
    script,
    '--config', REAL_PROVIDER_CONFIG_PATH,
    '--id', selected.id,
    '--user-data', REAL_USER_DATA_DIR,
    '--decrypt',
  ], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 30_000,
    windowsHide: true,
  })
  const lines = String(result).split('\n').filter(line => line.trim())
  const payload = JSON.parse(lines[lines.length - 1])
  assert.equal(payload.result, 'ok', `provider key bridge helper succeeds: ${payload.message || payload.result}`)
  assert.equal(payload.keyState, 'decrypted', 'provider key bridge decrypts under the real userData profile')
  assert(Number(payload.keyLength) > 20, `provider key bridge returns a usable key, got ${payload.keyLength} chars`)
  return { sourceKeyState: keyState, keyLength: payload.keyLength, apiKey: payload.apiKey }
}

function findSelectedLiveProvider(config) {
  const providers = config.providers || []
  return providers.find(item => item?.id === LIVE_PROVIDER_NAME)
    || providers.find(item => item?.name === LIVE_PROVIDER_NAME)
}

function readLiveTargetBaseUrl(config) {
  const selected = findSelectedLiveProvider(config)
    || (config.providers || []).find(item => item?.id === config.generateProvider)
  assert(selected?.baseUrl, 'configured real provider exposes a base URL')
  return selected.baseUrl
}

async function startLocalProviders() {
  const requests = []
  let port = 0
  let s2PostCount = 0
  const server = http.createServer((request, response) => {
    const chunks = []
    request.on('data', chunk => chunks.push(chunk))
    request.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8')
      let parsed = {}
      try { parsed = JSON.parse(body) } catch {}
      const apiKey = String(request.headers.authorization || '')
      const layer = Object.entries(LAYER_PROVIDERS).find(([layerName]) => apiKey.includes(`local-${layerName}`))?.[0] || null
      const requestMessageList = requestMessages(parsed)
      const userContent = requestMessageList.filter(message => message.role === 'user')
        .map(message => message.content).join('\n')
      const promptText = requestMessageList.map(message => message.content).join('\n')
      const isS1 = promptText.includes('把当前章节材料转成正文场景骨架')
      const isS2 = promptText.includes('上一步骨架包含场景区块')
      const isS3 = promptText.includes('语言层打磨')
      const record = {
        at: new Date().toISOString(),
        url: request.url,
        apiKey,
        layer,
        model: parsed.model || null,
        wantsStream: parsed.stream === true,
        isS1,
        isS2,
        isS3,
        userPreview: userContent.slice(0, 300),
      }
      requests.push(record)
      writeRunLog('provider-request', record)
      if (request.method === 'POST' && isS1) {
        record.intercepted = false
        record.proxyResponder = 's1-skeleton'
        sendReply(parsed, response, S1_SKELETON)
        return
      }
      if (request.method === 'POST' && isS2) {
        s2PostCount += 1
        if (s2PostCount === 1) {
          record.intercepted = true
          record.proxyResponder = 'bare-not-ready'
          const reply = NOT_READY_TEXT
          if (parsed.stream === true) {
            response.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8' })
            response.write(`data: ${JSON.stringify({ choices: [{ delta: { role: 'assistant', content: reply } }] })}\n\n`)
            response.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } })}\n\n`)
            response.end('data: [DONE]\n\n')
          } else {
            response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
            response.end(JSON.stringify({
              choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: reply } }],
            }))
          }
          return
        }
        record.intercepted = false
      }
      const reply = /请从下面第/.test(userContent)
        ? JSON.stringify({ entities: [], relations: [], events: [], world: [], foreshadowing: [] })
        : layer === 'volumes'
        ? JSON.stringify([{
          name: '第二卷 航线',
          outline: '王芳确认航线与纸条之间的关系。',
          summary: '航线确认。',
          allocatedWords: 12000,
          readerExpectations: '确认航线。',
          mainPlotLine: '纸条推动航线。',
          unlockMilestone: '航线确认。',
          forbiddenFinalCards: [],
          contractRisk: 'contract_safe',
        }])
        : layer === 'chapters'
          ? JSON.stringify([{ title: '第2章 航线', plot: '王芳确认纸条。', summary: '确认纸条。' }])
          : buildBodyReply()
      if (parsed.stream === true) {
        response.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8' })
        response.write(`data: ${JSON.stringify({ choices: [{ delta: { role: 'assistant', content: reply } }] })}\n\n`)
        response.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } })}\n\n`)
        response.end('data: [DONE]\n\n')
        return
      }
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      response.end(JSON.stringify({
        choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: reply } }],
      }))
    })
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  port = server.address().port
  return {
    port,
    requests: () => requests.map(item => ({ ...item })),
    close: () => new Promise(resolve => server.close(() => resolve())),
  }
}

let electronProcess = null

function startElectron() {
  electronProcess = spawn(ELECTRON_EXE, [
    '.',
    `--remote-debugging-port=${CDP_PORT}`,
    '--remote-allow-origins=*',
    `--user-data-dir=${PROFILE}`,
  ], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      SHENYI_ALLOW_TEST_ISOLATION: '1',
      SHENYI_DATA_DIR: path.join(PROFILE, 'app-data'),
      SHENYI_TEST_USER_DATA_DIR: path.join(PROFILE, 'app-data'),
    },
    windowsHide: false,
  })
  electronProcess.stdout.on('data', data => writeRunLog('electron:stdout', String(data).slice(0, 2000)))
  electronProcess.stderr.on('data', data => writeRunLog('electron:stderr', String(data).slice(0, 2000)))
}

function stopElectron() {
  if (!electronProcess?.pid) return
  try {
    execFileSync('taskkill', ['/PID', String(electronProcess.pid), '/T', '/F'], { stdio: 'ignore' })
  } catch {}
  electronProcess = null
}

async function waitForCdp() {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)
      if (response.ok) return true
    } catch {}
    await sleep(500)
  }
  return false
}

async function connectPage(browser) {
  let page = null
  for (let index = 0; index < 24 && !page; index++) {
    page = browser.contexts()
      .flatMap(context => context.pages())
      .find(item => !item.url().startsWith('devtools://')) || null
    if (!page) await sleep(500)
  }
  assert(page, 'renderer page reachable over CDP')
  return page
}

async function closeProjectModal(page) {
  await page.evaluate(() => {
    document.querySelector('.project-modal-content .btn-close')?.click()
  })
  await sleep(300)
}

async function reloadApp(page) {
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#app', { timeout: 20_000 })
  await page.waitForFunction(() => {
    const store = window.__pinia?._s?.get('provider')
    return Boolean(store?.providers?.length)
  }, null, { timeout: 20_000 })
  await sleep(200)
  await closeProjectModal(page)
}

function buildFolderSkillEntries() {
  const specs = [
    { id: 'kaixuan-s1-folder', name: 'S1骨架', folder: 'kaixuan-s1' },
    { id: 'kaixuan-s2-folder', name: 'S2正文', folder: 'kaixuan-s2' },
    { id: 'kaixuan-s3-folder', name: 'S3打磨', folder: 'kaixuan-s3' },
  ]
  return specs.map(spec => ({
    id: spec.id,
    name: spec.name,
    format: 'folder',
    folderPath: path.join('D:', 'codex', '玄武规划SKILL', '凯旋-正文层', spec.folder).replace(/\\/g, '/'),
    template: '',
    category: '',
    executionMode: 'chain',
    outputFormat: 'text',
    validationRules: [],
    splitSize: 0,
    meta: {
      deai: {
        contractVersion: 2,
        generation: 'off',
        finalStepDetection: 'off',
        conflictPolicy: 'report',
        guidanceOwnership: 'app',
        overlaps: [],
      },
    },
  }))
}

async function seedApplication(page, providers) {
  await page.evaluate(async ({ providers, projectId, volumeId, chapterId, chapterWords, autoExtractMemory, folderSkills }) => {
    await window.electronAPI.storageWrite('wa_lastProjectId', projectId)
    await window.electronAPI.storageWrite('wa_providers', providers)
    await window.electronAPI.storageWrite('wa_settings', { autoExtractMemory })
    await window.electronAPI.storageWrite('wa_skills', {
      skills: folderSkills,
      pipelineSkills: [],
      deAiSkills: [],
    })
    await window.electronAPI.storageWrite(`wa_project_${projectId}`, {
      schemaVersion: 3,
      projectName: '正文裸阻断targeted路由验证',
      outlineText: '# 正文裸阻断targeted路由验证\n## 剧情单元 H1-01 纸条\n章节范围：第 1 章\n- 王芳在楼梯间发现纸条。\n- 章节分两场：第一场取出纸条，第二场读取纸条并发现地址。\n- 每场目标约300字。\n- 每场场景施工卡固定为：句号密度≤44/千字；段落中位≤55字；身体词≤19/千字；物件/空间替代≥2处。',
      outlineLocked: true,
      outlineLockedText: '# 正文裸阻断targeted路由验证\n## 剧情单元 H1-01 纸条\n章节范围：第 1 章\n- 王芳在楼梯间发现纸条。\n- 章节分两场：第一场取出纸条，第二场读取纸条并发现地址。\n- 每场目标约300字。\n- 每场场景施工卡固定为：句号密度≤44/千字；段落中位≤55字；身体词≤19/千字；物件/空间替代≥2处。',
      bookWordCount: 24000,
      volumesConfirmed: true,
      pipelineConfig: { volumeCount: 2, volumeWords: 12000, chapterWords },
      chaptersConfirmed: true,
      settingsGenerated: true,
      settings: [],
      styleProfile: null,
      volumes: [{
        id: volumeId,
        name: '第一卷 纸条',
        index: 0,
        outline: '王芳在灯塔发现纸条。',
        summary: '第一场取出纸条，第二场读取纸条并发现地址。每场约300字，施工卡固定：句号密度≤44/千字；段落中位≤55字；身体词≤19/千字；物件/空间替代≥2处。',
        allocatedWords: 12000,
        suggestedWords: 12000,
        wordsPerChapter: chapterWords,
        chapterCount: 2,
        confirmed: true,
        locked: true,
        isBound: true,
        bodyGenerated: false,
      }],
      chapters: {
        [volumeId]: [{
          id: chapterId,
          title: '第1章 纸条',
          index: 0,
          plot: '第一场取出纸条，第二场读取纸条并发现地址。',
          summary: '第一场取出纸条，第二场读取纸条并发现地址。每场约300字，施工卡固定：句号密度≤44/千字；段落中位≤55字；身体词≤19/千字；物件/空间替代≥2处。',
          confirmed: true,
          pipelineGenerated: true,
          unitId: 'H1-01',
        }],
      },
      settingBindings: {},
      settingsCollection: { categories: [], items: {} },
      memories: {},
      memoryBlacklist: [],
      aiNaming: null,
      outlineChat: [],
      chat: [],
      editorTabs: [],
    })
    await window.electronAPI.storageWrite('wa_pipeline_step_config', {
      agents: { 0: '', 1: '', 2: '', 3: '', 4: '' },
      skills: { 0: [], 1: [], 2: [], 3: [], 4: folderSkills.map(s => s.id) },
      modes: { 0: 'compose', 1: 'compose', 2: 'compose', 3: 'compose', 4: 'chain' },
      skillAgents: {},
    })
    await window.electronAPI.storageRemove('wa_pipeline_breakpoint')
  }, {
    providers,
    projectId: PROJECT_ID,
    volumeId: VOLUME_ID,
    chapterId: CHAPTER_ID,
    chapterWords: CHAPTER_WORDS,
    autoExtractMemory: !LIVE_MODE,
    folderSkills: buildFolderSkillEntries(),
  })
  await reloadApp(page)
}

async function waitForBodyTerminal(page, timeoutMs =
  Number(process.env.SHENYI_BODY_NOT_READY_WAIT_MS || 1_200_000)) {
  const deadline = Date.now() + timeoutMs
  let snapshot = null
  while (Date.now() < deadline) {
    snapshot = await page.evaluate(() => {
      const store = window.__pinia?._s?.get('pipeline')
      return {
        runs: (store?.runs || []).filter(run => run.layer === 'body'),
      }
    })
    const terminal = snapshot.runs.findLast(run => run.status === 'succeeded' || run.status === 'failed')
    if (terminal) return terminal
    await sleep(1000)
  }
  throw new Error(`body run did not reach a terminal state within ${timeoutMs}ms: ${JSON.stringify(snapshot?.runs)}`)
}

async function exportTraceEvidence(page, runId, fileName) {
  const result = await page.evaluate(async ({ wantedRunId }) => {
    const trace = window.__pinia?._s?.get('runTrace')
    const run = [...(trace?.runs || [])].find(item => item.pipelineRunId === wantedRunId)
    return run ? JSON.parse(JSON.stringify(run)) : null
  }, { wantedRunId: runId })
  assert(result, `trace run exists for pipeline run ${runId}`)
  writeJson(fileName, result)
  return result
}

async function selectPipelineStep(page, stepIndex) {
  await page.locator('#pl-steps .pl-step').nth(stepIndex).click()
  await page.waitForSelector(`#pl-step-${stepIndex + 1}-content`, { state: 'visible' })
}

async function main() {
  if (fs.existsSync(EVIDENCE_ROOT)) fs.rmSync(EVIDENCE_ROOT, { recursive: true, force: true })
  fs.mkdirSync(EVIDENCE_ROOT, { recursive: true })
  fs.rmSync(PROFILE, { recursive: true, force: true })
  assertFreshRenderer()

  let liveBridge = null
  let notReadyProxy = null
  let localProviders = null
  let providers = null

  if (LIVE_MODE) {
    liveBridge = decryptLiveProviderKeyOnce()
    const liveConfig = JSON.parse(fs.readFileSync(REAL_PROVIDER_CONFIG_PATH, 'utf8'))
    notReadyProxy = await startNotReadyProxy({
      targetBaseUrl: readLiveTargetBaseUrl(liveConfig),
      apiKey: liveBridge.apiKey,
    })
    liveBridge = { ...liveBridge, proxyBaseUrl: notReadyProxy.baseUrl }
    console.log(`[MODE] live supplier via not-ready proxy: ${notReadyProxy.baseUrl}`)
    console.log(`[LIVE KEY] keyLength=${liveBridge.keyLength}, sourceKeyState=${liveBridge.sourceKeyState}; value intentionally not logged`)
  } else {
    localProviders = await startLocalProviders()
    providers = providerConfig({ port: localProviders.port })
    console.log('[MODE] mock local providers')
  }

  startElectron()
  let browser = null
  let bodyRun = null
  let bodyTrace = null
  let attemptEvents = []
  let validatedEvent = null

  try {
    assert(await waitForCdp(), 'Electron CDP reachable')
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
    const page = await connectPage(browser)
    if (LIVE_MODE) {
      providers = liveProviderConfig(liveBridge.proxyBaseUrl, liveBridge.apiKey)
    }
    await seedApplication(page, providers)

    await page.click('#btn-pipeline')
    await page.waitForSelector('#pipeline-panel', { timeout: 20_000 })
    await selectPipelineStep(page, 4)
    await page.click('#btn-primary-gen-body')
    await sleep(500)

    bodyRun = await waitForBodyTerminal(page)
    const proxyBridge = LIVE_MODE ? notReadyProxy : localProviders
    bodyTrace = await exportTraceEvidence(page, bodyRun.runId, 'body-trace.json')

    // --- Assertions: bare NOT-READY was detected ---
    const blockEvents = (bodyTrace.events || [])
      .filter(event => event.type === 'chapter-narrative-not-ready')
    assert(blockEvents.length > 0,
      'trace records chapter-narrative-not-ready for the bare [NOT-READY] response')
    let blockDetail = blockEvents[0].detail
    if (typeof blockDetail === 'string') {
      try { blockDetail = JSON.parse(blockDetail) } catch { blockDetail = { raw: blockDetail } }
    }
    blockDetail = blockDetail || {}
    const retryableInBodyLayer = blockDetail.retryableInBodyLayer !== undefined
      ? blockDetail.retryableInBodyLayer
      : /targeted/.test(String(blockDetail.guidance || blockDetail.raw || ''))
    assert.equal(retryableInBodyLayer, true,
      'block event explicitly routes the declared narrative failure to body-layer targeted repair')
    assert(String(blockDetail.gap || '').includes('交接输入不可恢复'),
      'block gap carries the NOT-READY reason from SKILL')

    // --- Assertions: first attempt failed, repair scope became targeted ---
    attemptEvents = (bodyTrace.events || [])
      .filter(event => event.type === 'body-artifact-attempt')
      .map(event => {
        try { return JSON.parse(String(event.detail || '{}')) } catch { return { raw: event.detail } }
      })
    assert(attemptEvents.length >= 2,
      `at least two body-artifact-attempt events exist (original + targeted repair); got ${attemptEvents.length}`)
    const firstAttempt = attemptEvents.find(item => item.repairAttempt === 0)
    assert(firstAttempt, 'first attempt (repairAttempt=0) is recorded')
    assert.notEqual(firstAttempt.status, 'complete',
      `first attempt does not pass validation; got status=${firstAttempt.status}`)
    const targetedAttempt = attemptEvents.find(item => item.repairScope === 'targeted')
    assert(targetedAttempt,
      `at least one attempt has repairScope=targeted; got ${attemptEvents.map(a => a.repairScope)}`)
    const fullChainAttempt = attemptEvents.find(item => item.repairScope === 'full_chain')
    assert(!fullChainAttempt,
      'no attempt uses full_chain scope when handoffNotReady routes to targeted')

    // --- Assertions: physical requests ---
    const proxyRequests = proxyBridge.requests().filter(item => item.method === 'POST')
    if (LIVE_MODE) {
      const interceptedS2 = proxyRequests.filter(item => item.isS2 && item.intercepted === true)
      const passedS2 = proxyRequests.filter(item => item.isS2 && item.intercepted === false)
      assert(interceptedS2.length === 1,
        `exactly one S2 request is intercepted with bare NOT-READY; got ${interceptedS2.length}`)
      assert(passedS2.length >= 1,
        `at least one S2 request reaches the real supplier for targeted repair; got ${passedS2.length}`)
      const allIntercepted = proxyRequests.filter(item => item.intercepted === true)
      assert(allIntercepted.length === 1,
        `only the first S2 request is intercepted; total intercepted=${allIntercepted.length}`)
    }

    // --- Assertions: terminal state ---
    assert.equal(bodyRun.status, 'succeeded',
      `body run succeeds after targeted repair; got status=${bodyRun.status}, error=${bodyRun.error || ''}`)

    const validatedEvents = (bodyTrace.events || [])
      .filter(event => event.type === 'body-artifact-validated')
    validatedEvent = validatedEvents.length > 0 ? JSON.parse(String(validatedEvents[0].detail || '{}')) : null
    assert(validatedEvents.length > 0, 'body-artifact-validated event exists (run succeeded)')

    // --- Assertions: targeted repair's generatorStepIndex ---
    if (targetedAttempt.requestFingerprint) {
      assert(Number(targetedAttempt.requestFingerprint.physicalRequests) > 0,
        `targeted attempt has physical requests; got ${targetedAttempt.requestFingerprint.physicalRequests}`)
    }

    // --- Trace assertions: generator index was identified ---
    const resolvedIndexEvents = (bodyTrace.events || [])
      .filter(event => event.type === 'body-generator-step-resume-restored'
        || event.type === 'body-generator-step-unresolved')
    assert(!resolvedIndexEvents.some(event => event.type === 'body-generator-step-unresolved'),
      'no body-generator-step-unresolved error event (generator step was identified)')

    writeJson('proxy-requests.json', proxyRequests)
    writeJson('report.json', {
      script: SCRIPT_NAME,
      at: new Date().toISOString(),
      result: 'PASS',
      mode: LIVE_MODE ? 'live-bare-not-ready-targeted' : 'mock-bare-not-ready-targeted',
      bodyRun: {
        status: bodyRun.status,
        runId: bodyRun.runId,
        error: bodyRun.error || null,
      },
      attempts: attemptEvents.map(item => ({
        attemptId: item.attemptId,
        repairAttempt: item.repairAttempt,
        repairScope: item.repairScope,
        status: item.status,
        wordCount: item.wordCount,
        targetWords: item.targetWords,
        ratio: item.ratio,
        errors: (item.errors || []).slice(0, 3),
      })),
      blockEvent: blockDetail,
      validated: validatedEvent,
      proxyRequests: LIVE_MODE ? {
        total: proxyRequests.length,
        interceptedS2: proxyRequests.filter(r => r.intercepted === true).length,
        passedS2: proxyRequests.filter(r => r.isS2 && r.intercepted === false).length,
      } : { total: proxyRequests.length },
      live: LIVE_MODE ? {
        credentialSource: REAL_PROVIDER_CONFIG_PATH,
        sourceKeyState: liveBridge.sourceKeyState,
        keyLength: liveBridge.keyLength,
        model: LIVE_MODEL_NAME,
      } : null,
    })
    console.log(`[PASS] bare NOT-READY detected, targeted scope applied, no full_chain, body succeeded; mode=${LIVE_MODE ? 'live' : 'mock'}; attempts=${attemptEvents.length}`)
  } catch (error) {
    if (bodyRun) {
      writeRunLog('failure-diagnostics', {
        bodyRun: JSON.parse(JSON.stringify(bodyRun)),
        attemptCount: attemptEvents.length,
        attemptScopes: attemptEvents.map(a => ({ repairAttempt: a.repairAttempt, repairScope: a.repairScope, status: a.status })),
      })
    }
    throw error
  } finally {
    if (browser) await browser.close().catch(() => {})
    stopElectron()
    await localProviders?.close()
    await notReadyProxy?.close()
  }
}

main().catch(error => {
  console.error(`[FAIL] ${SCRIPT_NAME}: ${error?.stack || error}`)
  process.exitCode = 1
})
