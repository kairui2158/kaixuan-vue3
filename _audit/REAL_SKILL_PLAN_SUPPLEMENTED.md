# 真 SKILL 方式 A — 补全方案（缺口/漏洞/遗漏修复）

> 生成日期: 2026-09-07
> 基础文件: _audit/REAL_SKILL_HANDOFF.md + _audit/REAL_SKILL_IMPLEMENTATION_PLAN.md
> 经验文件: _audit/神意开发经验总结_v3.md
> 状态: 待用户审核，不执行

---

## 零、补全动因

原方案经源码级核对后发现 8 个缺口，分 3 类：

| 类别 | 缺口编号 | 一句话描述 |
|------|---------|---------|
| 覆盖面 | G1 | 路由分支只加在 useDeAi.ts，流水线 PipelinePanel 和主页共创 ChatPanel 不支持文件夹 SKILL |
| 覆盖面 | G2 | skill.ts 的 loadSkills/saveSkills 不映射 format/folderPath，重启后丢失 |
| 覆盖面 | G3 | 导入导出 (exportSkillToMD/importFromJSON/importSkills) 不处理 format/folderPath |
| Agent | G4 | useDeAi.ts 的 getAgentConfig 获取了 Agent 但从未注入 systemPrompt/temperature/maxTokens |
| Agent | G5 | 方案未定义 Agent systemPrompt 与 template.md 的注入顺序 |
| 错误处理 | G6 | preProcess/postProcess 异常、script.js 语法错误、API 超时的 fallback 策略缺失 |
| 持久化 | G7 | folderPath 绝对/相对路径、持久化方式、路径失效处理未定义 |
| 语义 | G8 | samples.txt 与 deai-samples.js 的优先级和关系未定义 |

---

## 一、G1: 覆盖面补全 — 三条路由全接入

### 1.1 问题根源

原方案只在 `useDeAi.ts` 的 `processChain/processSplitMerge/processMultiStep` 里加 `isRealSkill()` 分支。但应用里有三条独立的 SKILL 消费路径：

| 路径 | 消费文件 | 当前取模板方式 | 原方案覆盖 |
|------|---------|---------------|-----------|
| 去AI味 | useDeAi.ts | `getSkillTemplate(skillId)` → `skill.template` | 是 |
| 主页共创 | ChatPanel.vue | `coCreation.config.skillIds` → 内部 callApiWithAgent | 否 |
| 生成流水线 | PipelinePanel.vue | `skillStore.getSkill(sid)` → `skill.template` | 否 |

如果用户在设置页导入一个文件夹 SKILL，然后把它加入流水线或共创，应用会取到 `skill.template`（空字符串或默认提示），静默走文本路径，不报错也不执行 preProcess/postProcess。

### 1.2 修复方案

#### 1.2.1 生成流水线 (PipelinePanel.vue)

在 PipelinePanel.vue 中所有 `skillStore.getSkill(sid)` 调用点（共 3 处：约 L1435、L1469、L3057）加分支：

```typescript
// 在获取 skill 后，判断 format
const s = skillStore.getSkill(sid)
if (s?.format === 'folder' && s?.folderPath) {
  // 走 realSkillExecutor
  const pkg = await loadRealSkill(s.folderPath)
  const result = await executeRealSkill(pkg, inputText, context, options)
  // result.output 进入下一步
} else {
  // 原有路径：s.template 作为 system prompt
}
```

**不修改 chainExecution.ts** — 它只负责 prompt 拼接，不直接消费 skill 对象。路由在调用 chainExecution 的上层（PipelinePanel.vue）做。

**不修改 agent-scheduler.ts** — Agent 调度容器不变，realSkillExecutor 内部调用 aiService.callAi() 时传入 agent 参数。

#### 1.2.2 主页共创 (ChatPanel.vue)

在 ChatPanel.vue 的 `selectedCoCreationSkills.value.length > 0` 分支（约 L836）加判断：

```typescript
if (selectedCoCreationSkills.value.length > 0) {
  const firstSkill = skillStore.getSkill(coCreation.config.skillIds[0])
  if (firstSkill?.format === 'folder' && firstSkill?.folderPath) {
    // 走 realSkillExecutor
    const pkg = await loadRealSkill(firstSkill.folderPath)
    const agent = agentStore.getAgent(coCreationAgentId.value)
    const result = await executeRealSkill(pkg, userInput, context, {
      injectSamples: true,
      sampleCount: 3,
      agent: agent || undefined
    })
    // result.output 进入消息流
  } else {
    // 原有 callApiWithAgent 路径
  }
}
```

#### 1.2.3 去AI味 (useDeAi.ts)

原方案的 3 个分支（processChain/processSplitMerge/processMultiStep）保留，但补充 Agent 注入（见 G4/G5）。

### 1.3 不修改清单更新

原方案的不修改清单中去掉 PipelinePanel.vue 和 ChatPanel.vue — 这两个文件现在需要修改。其余不修改清单不变。

---

## 二、G2: skill.ts 持久化补全

### 2.1 问题

`skill.ts` 的 `loadSkills()` 函数手动映射字段，但映射表里没有 `format` 和 `folderPath`。即使接口加了字段，重启后从 storage 读取时会丢失这两个字段，文件夹 SKILL 退化为文本 SKILL。

### 2.2 修复

在 `loadSkills()` 的 `data.map(function(s: any) {...})` 里加两个字段：

```typescript
format: s.format || 'text',
folderPath: s.folderPath || '',
```

在 `Skill` 接口里加（原方案步骤5已有）：
```typescript
format?: 'text' | 'folder'
folderPath?: string
```

### 2.3 影响分析

`saveSkills()` 用 `JSON.parse(JSON.stringify(skills.value))` 做深拷贝，已经会包含新字段，不需要改。`addSkill`/`updateSkill` 用 `Object.assign`/展开运算符，也会包含新字段。只有 `loadSkills` 的手动映射需要补。

---

## 三、G3: 导入导出兼容

### 3.1 问题

`exportSkillToMD` 用 `serializeSkillMd(toSkillRecord(s))` 序列化，`importFromJSON` 和 `importSkills` 手动构造 skill 对象，都不处理 format/folderPath。

### 3.2 修复

#### importFromJSON

在 push 到 skills.value 的对象里加：
```typescript
format: s.format || 'text',
folderPath: s.folderPath || '',
```

#### importSkills

`importSkills` 用 `Object.assign(current, skill)` 做覆盖，会自动包含新字段。但 push 新 skill 时也需要加。在 push 对象里加 format/folderPath。

#### exportSkillToMD

`toSkillRecord(s)` 是通用转换函数。如果 `Skill` 接口加了 format/folderPath，`toSkillRecord` 会自动包含。需要确认 `toSkillRecord` 是否做了白名单字段过滤。如果做了过滤，需要加 format/folderPath 到白名单。

#### Markdown 导入

Markdown 导入解析 YAML front matter 时，如果 YAML 里有 `format: folder` 和 `folderPath: /path/to/folder`，需要映射到 skill 对象。当前 Markdown 导入在 `configExchange/markdown.ts` 的 `parseSkillMd` 函数里，需要在该函数的字段映射表里加 format/folderPath。

---

## 四、G4+G5: Agent 注入补全

### 4.1 问题根源（源码级证据）

`useDeAi.ts` 第 48 行定义了 `getAgentConfig(agentId)`，但全文件搜索发现这个函数从未被 `processChain`/`processSplitMerge`/`processMultiStep` 调用。`cfg.agentId` 来自 `deAiStore.agentId`（第 330 行），传到 process 函数后没有被使用。

同时 `callAiApi(systemPrompt, userText, useVerify)` 只传了 messages（system + user），没有传 temperature/maxTokens/model — 这些 Agent 字段虽然存在于 `agent.ts` 接口里，但从未进入 API 请求。

### 4.2 修复方案

#### 4.2.1 useDeAi.ts 的 callAiApi 补全

修改 `callAiApi` 签名，增加 agent 参数：

```typescript
async function callAiApi(
  systemPrompt: string,
  userText: string,
  useVerify?: boolean,
  agent?: { systemPrompt?: string; temperature?: number; maxTokens?: number; model?: string }
): Promise<string> {
  // Agent systemPrompt 注入到 system message 前面
  const finalSystem = agent?.systemPrompt
    ? agent.systemPrompt + '\n\n' + systemPrompt
    : systemPrompt

  const messages = [
    { role: 'system', content: finalSystem },
    { role: 'user', content: userText }
  ]

  const result = await aiService.callAi({
    purpose,
    messages,
    stream: false,
    retry: true,
    temperature: agent?.temperature,
    maxTokens: agent?.maxTokens,
    model: agent?.model,
    meta: { source: 'useDeAi.callAiApi' }
  })
  return result.text || ''
}
```

#### 4.2.2 注入顺序定义

| 层级 | 注入顺序 | 理由 |
|------|---------|------|
| system message | Agent systemPrompt → SKILL template | Agent 是角色定位，SKILL 是任务指令。先定位角色再下达任务 |
| user message | 风格样本 → 用户文本 | 样本是参考，不是主输入 |

对于文件夹 SKILL：

| 层级 | 注入顺序 |
|------|---------|
| system message | Agent systemPrompt → template.md 内容 |
| user message | preProcess 处理后的文本（如果有 script.js）|

#### 4.2.3 process 函数里获取 Agent

在 `processChain`/`processSplitMerge`/`processMultiStep` 的开头加：

```typescript
const agent = getAgentConfig(cfg.agentId)
```

然后每次 `callAiApi` 调用传 agent：
```typescript
const s1Result = await callAiApi(s1Template, s1Input, false, agent || undefined)
```

#### 4.2.4 realSkillExecutor 的 Agent 注入

`realSkillExecutor.ts` 的 `executeRealSkill` 函数签名增加 `agent` 参数：

```typescript
export async function executeRealSkill(
  pkg: RealSkillPackage,
  input: string,
  context: any,
  options: {
    injectSamples?: boolean
    sampleCount?: number
    agent?: { systemPrompt?: string; temperature?: number; maxTokens?: number; model?: string }
  }
): Promise<{ output: string; valid: boolean; errors: string[]; fromCache: boolean }>
```

构建 messages 时：
```typescript
const systemContent = (options.agent?.systemPrompt || '')
  ? options.agent.systemPrompt + '\n\n' + pkg.template
  : pkg.template

const messages = [
  { role: 'system', content: systemContent },
  { role: 'user', content: processedInput }
]

const result = await aiService.callAi({
  purpose: 'rewrite',
  messages,
  stream: false,
  retry: true,
  temperature: options.agent?.temperature,
  maxTokens: options.agent?.maxTokens,
  model: options.agent?.model,
  meta: { source: 'realSkillExecutor' }
})
```

#### 4.2.5 温度和 maxTokens 生效范围

| 消费路径 | 温度/maxTokens 生效范围 |
|---------|---------------------|
| 去AI味 chain | 每个 SKILL 步骤独立生效（S1 和 S2 可以用不同 Agent）|
| 去AI味 split-merge | 每段并行调用共享同一个 Agent 配置 |
| 去AI味 multi-step | 每步独立生效 |
| 主页共创 | 整个对话共享（只有一个 Agent 选择器）|
| 生成流水线 | 每层独立（per-step Agent 绑定）|

---

## 五、G6: 错误处理与 Fallback 策略

### 5.1 策略表

| 异常场景 | Fallback 行为 | 用户可见反馈 |
|---------|-------------|-------------|
| folderPath 不存在/不可读 | 回退到文本路径（用 skill.template 或默认提示词）| Toast: "文件夹 SKILL 路径无效，已回退到文本模式" |
| meta.json 缺失或解析失败 | 回退到文本路径 | Toast: "SKILL 元数据缺失，已回退" |
| template.md 缺失 | 报错，不执行 | Toast: "SKILL 模板文件缺失" |
| script.js 语法错误 | 跳过 preProcess/postProcess，只用 template 调 API | Console warn + 继续执行 |
| preProcess 抛异常 | 用原始输入调 API，跳过 preProcess | Console warn + 继续执行 |
| postProcess 抛异常 | 用 API 原始输出，跳过 postProcess | Console warn + 继续执行 |
| API 超时/失败 | 走 aiService 现有 retry 策略（retry: true）| 现有错误提示 |
| vm 沙箱超时（5秒） | 跳过脚本，用原始输入/输出 | Console warn + 继续执行 |
| 风格样本加载失败 | 跳过样本注入，用纯文本 | 静默降级 |

### 5.2 实现位置

在 `realSkillExecutor.ts` 的 `executeRealSkill` 里：

```typescript
// preProcess
let processedInput = input
if (pkg.script) {
  try {
    const hooks = await skillExecuteScript(pkg.script, { step: 'preProcess', input, context })
    if (hooks?.preProcess) {
      try {
        processedInput = hooks.preProcess(input, context) || input
      } catch (e) {
        console.warn('[realSkill] preProcess failed:', e)
        // fallback: use original input
      }
    }
  } catch (e) {
    console.warn('[realSkill] script syntax error, skipping:', e)
    // fallback: skip all script hooks
  }
}

// API call (always executes)
const result = await aiService.callAi({ ... })

// postProcess
let finalOutput = result.text || ''
if (pkg.script && scriptLoaded) {
  try {
    const hooks = /* reuse from above */
    if (hooks?.postProcess) {
      try {
        finalOutput = hooks.postProcess(finalOutput, context) || finalOutput
      } catch (e) {
        console.warn('[realSkill] postProcess failed:', e)
        // fallback: use raw API output
      }
    }
  } catch {
    // already warned above
  }
```

### 5.3 realSkillLoader 的 fallback

```typescript
export async function loadRealSkill(folderPath: string): Promise<RealSkillPackage | null> {
  try {
    const pkg = await window.electronAPI.skillLoadFolder(folderPath)
    if (!pkg?.template) return null // template.md is mandatory
    cache.set(folderPath, pkg)
    return pkg
  } catch (e) {
    console.warn('[realSkillLoader] load failed:', e)
    return null // caller falls back to text path
  }
}
```

调用方判断：
```typescript
const pkg = await loadRealSkill(skill.folderPath)
if (!pkg) {
  // fallback to text path
  const template = skill.template || '你是专业的文本处理专家...'
  return callAiApi(template, input, false, agent)
}
```

---

## 六、G7: folderPath 持久化

### 6.1 路径策略

| 属性 | 决定 |
|------|------|
| 路径类型 | 绝对路径（Electron `dialog.showOpenDialog` 返回绝对路径）|
| 存储位置 | `skill.folderPath` 字段，随 skillStore 持久化到 `wa_skills.json` |
| 路径校验 | `loadRealSkill` 调用时实时校验路径是否存在，不校验保存时 |
| 路径失效 | `loadRealSkill` 返回 null，调用方回退到文本路径，UI 显示警告 |

### 6.2 UI 提示

在 SkillSettings.vue 的文件夹 SKILL 卡片上显示：
- 文件夹路径（可点击在系统文件管理器中打开）
- 路径状态指示器：绿色=有效，红色=无效

### 6.3 迁移场景

用户在另一台电脑上导入包含 folderPath 的 SKILL 配置时，路径几乎必然失效。处理：
- `loadRealSkill` 返回 null → 回退到文本路径
- SkillSettings.vue 显示红色路径指示器 + "重新选择文件夹" 按钮

---

## 七、G8: samples.txt 与 deai-samples.js 关系

### 7.1 优先级定义

``
SKILL 文件夹有 samples.txt
  → 用 SKILL 自带样本
  → 不查 deai-samples.js

SKILL 文件夹没有 samples.txt
  → 回退到 deai-samples.js（38 个样本）
  → 应用层选 2-3 个注入

文本 SKILL（format=text）
  → 永远用 deai-samples.js
  → 不涉及 samples.txt
``

### 7.2 注入逻辑

在 `realSkillExecutor.ts` 里：

```typescript
let samplesToInject: string[] = []
if (options.injectSamples) {
  if (pkg.samples && pkg.samples.length > 0) {
    // SKILL 自带样本优先
    samplesToInject = pkg.samples.slice(0, options.sampleCount || 3)
  } else {
    // 回退到全局样本库
    try {
      const allSamples = DeAiSamples.getAll()
      samplesToInject = allSamples.slice(0, options.sampleCount || 3)
    } catch {}
  }
}

if (samplesToInject.length > 0) {
  processedInput = '[style reference]\n' + samplesToInject.join('\n') + '\n\n--- text ---\n' + processedInput
}
```

---

## 八、更新后的执行步骤（完整版）

| 步骤 | 文件 | 类型 | 预估行数 | 验证方法 | 补全内容 |
|------|------|------|---------|---------|---------|
| 1 | electron/ipc/skill-loader.js | 新增 | ~120行 | IPC 调用确认返回 | 原方案不变 |
| 2 | electron/preload.js | 修改 | +12行 | console 确认方法 | 原方案不变 |
| 3 | src/services/realSkillLoader.ts | 新增 | ~50行 | mock IPC 确认缓存 | 加 fallback 返回 null |
| 4 | src/services/realSkillExecutor.ts | 新增 | ~120行 | 测试 SKILL 跑通 | 加 Agent 注入 + 错误处理 + samples 优先级 |
| 5 | src/stores/skill.ts | 修改 | +6行 | 重启后 format/folderPath 仍在 | 加 loadSkills 映射 + importFromJSON + importSkills |
| 6 | src/composables/useDeAi.ts | 修改 | +35行 | 文本走旧路径，文件夹走新路径 | 加 Agent 注入到 callAiApi |
| 7 | src/components/settings/SkillSettings.vue | 修改 | +40行 | 设置页显示管理 UI | 加路径状态指示器 |
| 8 | src/components/pipeline/PipelinePanel.vue | 修改 | +15行 | 文件夹 SKILL 在流水线可用 | **新增：3 处 getSkill 调用加分支** |
| 9 | src/components/chat/ChatPanel.vue | 修改 | +12行 | 文件夹 SKILL 在共创可用 | **新增：共创分支加 folder 路由** |
| 10 | src/services/configExchange/markdown.ts | 修改 | +4行 | MD 导入含 format 字段 | **新增：parseSkillMd 加 format/folderPath 映射** |
| 11 | 集成验证 | 验证 | - | 12 项验证矩阵 | 见 §九 |

### 8.1 更新后的不修改清单

原方案的 13 个不修改文件中，去掉 PipelinePanel.vue 和 ChatPanel.vue（现在需要修改）。其余不变：

| 文件 | 理由 |
|------|------|
| src/services/aiService.ts | realSkillExecutor 调用同一个 callAi() |
| src/services/chainExecution.ts | prompt 拼接逻辑不变 |
| src/services/de-ai.js | 硬规则层不变 |
| src/services/deai-samples.js | 38 个样本不变 |
| src/services/skillValidation.ts | schema 验证不变 |
| src/services/chainBreakpoint.ts | 断网续接不变 |
| src/services/agent-scheduler.ts | Agent 调度容器不变 |
| src/stores/deai.ts | 去 AI 味 store 不变 |
| src/stores/pipeline.ts | 流水线 store 不变 |
| src/stores/provider.ts | 供应商 store 不变 |
| electron/main.js | 主进程不变（只加一行 require） |
| electron/ipc/storage.js | 存储不变 |
| package.json | 不新增依赖 |

---

## 九、更新后的验证矩阵（12 项）

| 编号 | 验证项 | 方法 | 通过标准 |
|------|--------|------|----------|
| V1 | 文本 SKILL 不受影响 | 配置文本 SKILL 跑去AI味 | 结果与改动前一致 |
| V2 | 文件夹 SKILL 加载 | 导入文件夹 SKILL | 卡片正确显示，路径指示器绿色 |
| V3 | 文件夹 SKILL 去AI味执行 | 跑去AI味 | realSkillExecutor 被调用，输出正确 |
| V4 | preProcess 生效 | SKILL 带 script.js | 输入被预处理 |
| V5 | postProcess 生效 | SKILL 带 script.js | 输出被后处理/验证 |
| V6 | 风格样本注入（SKILL 自带）| SKILL 带 samples.txt | user message 包含 SKILL 样本 |
| V7 | 风格样本注入（全局回退）| SKILL 不带 samples.txt | user message 包含 deai-samples.js 样本 |
| V8 | 链式混用 | 文本+文件夹混用 | 链式调用正常完成 |
| V9 | 沙箱安全 | 脚本尝试 require | 被拦截，不崩溃 |
| V10 | **文件夹 SKILL 在流水线** | 把文件夹 SKILL 加入流水线并执行 | preProcess/postProcess 生效，输出正确 |
| V11 | **文件夹 SKILL 在共创** | 把文件夹 SKILL 加入共创并对话 | realSkillExecutor 被调用，Agent 注入正确 |
| V12 | **路径失效回退** | 删除/重命名文件夹后执行 | 回退文本路径，Toast 提示，不崩溃 |

### 9.1 验证方法

按经验文件 V2 §3 规则 1-3：
- 必须源 Electron 启动（`node_modules\.bin\electron .`），不用浏览器/开发者模式/安装版
- 必须构建后验证：`npm run build:vue` 后再启动（§3 规则 17）
- 必须真实操作 UI 后检查 store 变化和 DOM 响应
- 必须截图 + JSON 日志 + 时间戳
- 每项验证写 checkpoint，连续两轮纯文本=空转信号

---

## 十、改动量更新

| 模块 | 类型 | 预估行数 |
|------|------|----------|
| electron/ipc/skill-loader.js | 新增 | ~120 行 |
| electron/preload.js | 修改 | +12 行 |
| src/services/realSkillLoader.ts | 新增 | ~50 行 |
| src/services/realSkillExecutor.ts | 新增 | ~120 行 |
| src/stores/skill.ts | 修改 | +6 行 |
| src/composables/useDeAi.ts | 修改 | +35 行 |
| src/components/settings/SkillSettings.vue | 修改 | +40 行 |
| src/components/pipeline/PipelinePanel.vue | 修改 | +15 行 |
| src/components/chat/ChatPanel.vue | 修改 | +12 行 |
| src/services/configExchange/markdown.ts | 修改 | +4 行 |
| **合计** | | **~414 行** |

比原方案多 ~105 行，增量来自：
- Agent 注入逻辑（callAiApi 签名变更 + 3 处 process 函数传参）：+10 行
- 错误处理 try-catch（realSkillExecutor 内 4 处）：+20 行
- 流水线路由分支（PipelinePanel 3 处）：+15 行
- 共创路由分支（ChatPanel 1 处）：+12 行
- loadSkills 字段映射 + 导入导出兼容：+10 行
- samples 优先级逻辑：+8 行
- 路径状态指示器 UI：+10 行
- markdown.ts 字段映射：+4 行
- 验证矩阵从 8 项扩到 12 项

---

## 十一、与 Codex Agent 驱动模式的差距说明

| 维度 | Codex Agent 驱动 | 本方案（真 SKILL） | 差距 |
|------|----------------|-------------------|------|
| 工具调用 | Agent 可调用文件读写、搜索、执行命令等工具 | 无工具调用能力 | 2 代差距 |
| 多轮循环 | Agent 可多轮 Tool-Use 循环（最多 6 轮）| 单次 API 调用 + pre/post 钩子 | 1.5 代差距 |
| 脚本能力 | 无（Codex 靠工具调用） | 有（vm 沙箱 preProcess/postProcess）| 本方案此处领先 |
| 上下文管理 | 长期任务记忆、计划状态 | 依赖应用层现有上下文系统 | 依赖外部 |
| 安全模型 | 受控但不限制脚本 | vm 沙箱 + 无 require/fs | 本方案更严格 |

**结论**：本方案是合理的中间态。从「伪 SKILL（纯文本提示词）」到「Codex Agent 驱动（工具调用 + 多轮循环）」之间，本方案站在中间：有脚本能力但没有工具调用。未来升级到 Agent 驱动需要：
1. 在 realSkillExecutor 里增加 tool-use 消息协议
2. 在 vm 沙箱里暴露受限工具 API（读编辑器内容、搜索文本、定位段落）
3. 增加多轮循环逻辑（最多 N 轮，每轮可调工具）
4. 增加任务状态 UI（气泡内显示「我在读哪里、搜什么、准备改什么」）

---

## 十二、经验文件 V2 引用

本方案执行时必须遵守以下经验规则：

| 规则 | 内容 | 本方案对应 |
|------|------|-----------|
| §1 M1 | 改任何文件前用 rg 列出引用 | 步骤 8/9 改 PipelinePanel/ChatPanel 前先查引用 |
| §1 M2 | 禁止整文件重写 | 所有修改用 apply_patch 逐行编辑 |
| §1 通用规则 6 | saveConfig 不得重新赋值 config.value | realSkillExecutor 不碰 store 持久化 |
| §2 规则 2 | 复杂脚本写 .js 文件 | 验证脚本写 .js 文件执行 |
| §2 规则 18 | 源 Electron 启动用完整路径 | 验证用 node_modules\electron\dist\electron.exe |
| §3 规则 1 | 构建成功≠功能完成 | 必须 CDP/源启动验证 |
| §3 规则 17 | 改动 renderer 源码后先 build:vue | 验证前先 build |
| §5 规则 1 | tokens.css 是唯一变量来源 | 新增 CSS 用 token |
| §9 防回滚铁律 | 完成后不回滚 | 每步闭环后标记完成 |

---

## 十三、总结

本补全方案在原方案基础上：

1. **覆盖面从 1 条路扩展到 3 条路**：去AI味 + 生成流水线 + 主页共创
2. **Agent 注入从缺失到完整**：systemPrompt/temperature/maxTokens/model 真正进入 API 请求
3. **错误处理从空白到 9 种 fallback**：路径失效、脚本错误、API 超时都有降级策略
4. **持久化从缺失到完整**：loadSkills/importFromJSON/importSkills/markdown 全链路映射
5. **样本优先级从模糊到清晰**：SKILL 自带 > 全局回退
6. **验证矩阵从 8 项到 12 项**：新增流水线、共创、路径失效三个场景
7. **改动量从 ~309 行到 ~414 行**：增量来自补全的必要逻辑，不是过度设计
8. **与 Codex 差距明确**：本方案是中间态，未来可升级，不伪装成终态

*本补全方案待用户审核通过后，与原方案合并执行。*
