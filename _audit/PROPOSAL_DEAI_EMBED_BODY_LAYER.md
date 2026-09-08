# 降AI内嵌正文层 详细执行方案

> 日期：2026-09-05
> 状态：待审核
> 引用：开发经验V2 1改码纪律 / 3验证纪律 / 8 AI服务纪律
> 前置调研：`_audit/DEAI_COMMUNITY_RESEARCH.md`（7个社区项目爬取）
> 前置改动：`src/services/de-ai.js:2469` DEAI_METHODOLOGY_PROMPT 已从12条升级到17条

---

## 一、方案目标

将降AI能力从「生成后单独跑一遍」改为「生成时前置约束 + 生成后自动清洗」两步闭环，
使正文层一步到位产出低AI味正文，消除用户二次操作。

### 核心设计原则（用户确认）

1. **两层架构**：前置层（17条方法论注入 system prompt）+ 后处理层（本地硬规则自动清洗）
2. **不设深度处理按钮**：与主页编辑器降AI按钮重复，已删除
3. **不重复**：正文层管「生成时约束」，主页编辑器管「用户手动深度打磨」
4. **UI**：正文层 API 生成按钮旁显示「已内嵌降AI」标识，不需要任何按钮
5. **注入顺序**：Agent systemPrompt -> SKILL template -> 降AI方法论17条 -> 章节执行包（user prompt）
6. **后处理自动触发**：生成完成后本地 DeAiProcessor 自动跑（255禁用词+34禁用句式+句长修复等）

---

## 二、当前代码现状（源码核对结果）

### 2.1 降AI方法论已存在但未接入正文层

| 文件 | 行号 | 现状 |
|------|------|------|
| `src/services/de-ai.js` | 2469 | `DEAI_METHODOLOGY_PROMPT` 17条已写入 |
| `src/services/de-ai.js` | 2471 | 已 `export` |
| `src/components/pipeline/PipelinePanel.vue` | - | **未 import** DEAI_METHODOLOGY_PROMPT |
| `src/components/pipeline/PipelinePanel.vue` | 2078 | `callApiWithAgent` 构造 system prompt 时**无降AI注入** |

### 2.2 后处理 DeAiProcessor 已存在但未接入 genBody

| 文件 | 行号 | 现状 |
|------|------|------|
| `src/services/de-ai.js` | 2103 | `process(text, config)` 函数完整可用 |
| `src/components/pipeline/PipelinePanel.vue` | 2656 | `genBody()` 获取结果后**直接赋值** `bodyResult.value`，未跑 DeAiProcessor |
| `src/components/pipeline/PipelinePanel.vue` | 2707 | `bodyResult.value = generationResult.body` 此行需要后处理 |

### 2.3 system prompt 当前构造方式

`callApiWithAgent`（行2078）当前拼接逻辑：

```typescript
// 当前：SKILL template -> Agent systemPrompt
const skillPart = promptParts?.systemSkill ?? skillTemplate ?? ""
const agentPart = agentConfig?.systemPrompt || ""
const systemPrompt = [skillPart, agentPart].filter(Boolean).join("\n\n") || "你是专业小说创作助手。"
```

**问题**：无降AI方法论注入。正文层生成的 system prompt 完全不含降AI约束。

### 2.4 genBody 数据流

```
genBody()
  -> createChapterExecutionPackage(...)   // 构建章节执行包
  -> buildChapterExecutionPrompt(...)      // 构建 user prompt
  -> runStepSkills(4, prompt, ...)         // 调用 SKILL 链
    -> _runStepSkillsInner
      -> chain: callValidatedSkill -> callApiWithAgent -> aiService.callAi
      -> compose: callValidatedSkill -> callApiWithAgent -> aiService.callAi
  -> parseGenerationResult(rawResult)      // 解析返回
  -> bodyResult.value = generationResult.body  <- 【后处理插入点】
  -> ch.body = generationResult.body
  -> insertToEditor (dispatchEvent)
```

---

## 三、执行计划 P0-P6

### P0：import 引入（1文件，2行）

**文件**：`src/components/pipeline/PipelinePanel.vue`

**改动**：在 import 区（约行874-887附近）新增：

```typescript
import { DeAiProcessor, DEAI_METHODOLOGY_PROMPT } from "../../services/de-ai"
```

**经验引用**：S1 M1 影响圈声明 - 仅新增 import，不修改已有 import 行。

**验证方式**：`npx vue-tsc --noEmit` 类型检查通过。

---

### P1：前置层 system prompt 注入降AI方法论（1文件，约15行改动）

**文件**：`src/components/pipeline/PipelinePanel.vue`

**改动位置**：`callApiWithAgent` 函数（行2078-2106）

**改动逻辑**：在 system prompt 拼接时，当 `step === 4`（正文层），将 `DEAI_METHODOLOGY_PROMPT` 追加到 system prompt 末尾。

**改动前**：
```typescript
const systemPrompt = [skillPart, agentPart].filter(Boolean).join("\n\n") || "你是专业小说创作助手。"
```

**改动后**：
```typescript
// P1: 正文层注入降AI方法论
const deaiPrompt = step === 4 ? DEAI_METHODOLOGY_PROMPT : ""
const systemPrompt = [skillPart, agentPart, deaiPrompt].filter(Boolean).join("\n\n") || "你是专业小说创作助手。"
```

**注入顺序确认**：
- skillPart（SKILL template / compose 合并模板）
- agentPart（Agent systemPrompt）
- deaiPrompt（降AI方法论17条）

> 用户确认的注入顺序是 Agent -> SKILL -> 降AI -> 章节执行包。
> 章节执行包在 user prompt 中，已在 `buildChapterExecutionPrompt` 完成。
> system prompt 内 skillPart 和 agentPart 的先后不影响降AI方法论的位置
> 降AI方法论始终在 system prompt 末尾，作为生成约束的最后一道指令。

**经验引用**：
- S1 M1 影响圈声明 - 仅改 `callApiWithAgent` 一个函数，不改其他调用方。
- S1 通用规则5 - store 是唯一事实来源，降AI方法论是静态常量不涉及 store。
- S8 AI服务纪律 - 注入只改 system prompt 内容，不改 callAi 的参数结构。

**验证方式**：
1. `npx vue-tsc --noEmit` 类型检查
2. `npm run build:vue` 构建通过
3. 源 Electron 启动后，正文层生成时在 API 日志中确认 system prompt 含降AI方法论

---

### P2：后处理层 genBody 自动调用 DeAiProcessor（1文件，约20行改动）

**文件**：`src/components/pipeline/PipelinePanel.vue`

**改动位置**：`genBody` 函数（行2656-2730），具体在行2707附近

**改动逻辑**：在 `bodyResult.value = generationResult.body` 之前，对 body 文本跑 DeAiProcessor.process()，用清洗后的结果替换。

**改动前**：
```typescript
const generationResult = parseGenerationResult(rawResult)
bodyResult.value = generationResult.body
ch.body = generationResult.body
```

**改动后**：
```typescript
const generationResult = parseGenerationResult(rawResult)
// P2: 后处理层 - 自动降AI清洗
let finalBody = generationResult.body || ""
try {
  const deaiResult = DeAiProcessor.process(finalBody, null)
  if (deaiResult && deaiResult.text && deaiResult.text.length > 0) {
    bodyGenerationLogs.value.push(
      "降AI后处理完成：" +
      (deaiResult.stats?.total || 0) + " 处修正" +
      (deaiResult.detections?.length ? "，" + deaiResult.detections.length + " 项检测" : "")
    )
    finalBody = deaiResult.text
  }
} catch (deaiErr: any) {
  console.warn("[DEAI] post-process failed, using raw body:", deaiErr)
  bodyGenerationLogs.value.push("降AI后处理跳过：" + (deaiErr?.message || "未知错误"))
}
bodyResult.value = finalBody
ch.body = finalBody
```

**经验引用**：
- S1 通用规则3 - 一次一个闭环，改完构建验证再继续。
- S1 M3 diff 自审 - 每行能归入本次需求（降AI内嵌）。
- S3 验证纪律1 - 构建成功 不等于 功能完成，必须真实 Electron 验证。
- DeAiProcessor.process 有字数保护（小于75% 自动回退原文），不会破坏正文。

**验证方式**：
1. `npx vue-tsc --noEmit` 类型检查
2. `npm run build:vue` 构建通过
3. 源 Electron 启动，正文层生成后检查 `bodyGenerationLogs` 含「降AI后处理完成」
4. 对比生成前后文本：禁用词被替换、短句被合并

---

### P3：UI 标识 「已内嵌降AI」（1文件，约5行模板改动）

**文件**：`src/components/pipeline/PipelinePanel.vue`

**改动位置**：正文层按钮区（行688-692附近）

**改动前**：
```html
<button id="btn-pl-gen-body" class="btn-primary" @click="genBodyForSelected" :disabled="pipelineStore.isGenerating">
  {{ pipelineStore.isGenerating ? '生成中...' : 'AI生成正文' }}
</button>
```

**改动后**：
```html
<button id="btn-pl-gen-body" class="btn-primary" @click="genBodyForSelected" :disabled="pipelineStore.isGenerating">
  {{ pipelineStore.isGenerating ? '生成中...' : 'AI生成正文' }}
</button>
<span class="pl-deai-badge" title="本层已内嵌降AI方法论（17条前置约束 + 硬规则后处理），生成时自动执行">已内嵌降AI</span>
```

**CSS**：在 `<style>` 区新增样式：
```css
.pl-deai-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  font-size: 12px;
  color: var(--color-success, #4caf50);
  background: var(--color-success-surface, rgba(76,175,80,0.12));
  border-radius: 4px;
  white-space: nowrap;
}
```

**经验引用**：
- S5 UI 纪律1 - CSS 变量来自 tokens.css，但此处用 fallback 值避免 token 不存在时崩溃。
- S5 UI 纪律6 - 文字溢出验证逐按钮实测。
- S1 M4 隐藏状态保护 - badge 是纯展示，不涉及 v-show/v-if 状态控制。

**验证方式**：
1. `npm run build:vue` 构建通过
2. 源 Electron 启动，正文层可见「已内嵌降AI」标识
3. 标识不溢出、不换行、不遮挡其他按钮

---

### P4：compose 模式覆盖验证（读码确认，不改动）

**目的**：确认 compose 模式下降AI方法论也能注入。

**分析**：
compose 模式走 `callValidatedSkill`（行1592）-> `callApiWithAgent`（行2078）。
`callApiWithAgent` 是所有模式的统一入口，P1 的改动（`step === 4` 时注入）会覆盖 chain 和 compose 两种模式。

**不需要额外改动**。只需在验证阶段确认 compose 模式正文层也含降AI方法论。

**经验引用**：S3 验证纪律4 - 验证作用域不扩大，受控 mock 不能当真实 API 证据。

**验证方式**：
1. 读码确认 `callValidatedSkill` -> `callApiWithAgent` 调用链（已确认）
2. 真实 Electron 正文层 compose 模式生成，检查 system prompt 含降AI方法论

---

### P5：不破坏现有功能链路 回归检查（只读，不改代码）

**检查清单**：

| 检查项 | 方法 | 预期 |
|--------|------|------|
| 设定层(step=1)不受影响 | 读码确认 step === 4 条件 | 不注入降AI |
| 卷纲层(step=2)不受影响 | 同上 | 不注入降AI |
| 章节层(step=3)不受影响 | 同上 | 不注入降AI |
| 正文层 chain 模式 | 真实生成 | 注入降AI |
| 正文层 compose 模式 | 真实生成 | 注入降AI |
| DeAiProcessor 字数保护 | 读码确认 de-ai.js 行2410 | 小于75% 回退原文 |
| genBody 异常路径 | 读码确认 try-catch | DeAiProcessor 失败不阻塞正文写入 |
| 插入编辑器流程 | 确认 insertToEditor 用 finalBody | 正确 |
| 确认完成按钮 | 确认 confirmBodyWithMemory 用 finalBody | 正确 |
| bodyGenerationLogs | 确认降AI日志写入 | 用户可见 |

**经验引用**：
- S1 M1 影响圈声明 - 降AI注入只在 step===4 生效，不影响其他四层。
- S1 M3 diff 自审 - 每行改动归入「降AI内嵌」需求。
- S1 通用规则3 - 一次一个闭环。

**验证方式**：源 Electron 启动，逐层生成确认只有正文层含降AI。

---

### P6：源 Electron 真实验证 + 收尾

**验证步骤**（源 Electron，非安装版，非开发者模式）：

1. `npm run build:vue` 构建 renderer
2. 源 Electron 启动（`node_modules\electron\dist\electron.exe .`）
3. 打开流水线 -> 正文层
4. 确认「已内嵌降AI」标识可见
5. 配置好 API 供应商后生成正文
6. 检查 `bodyGenerationLogs` 含「降AI后处理完成：N 处修正」
7. 对比生成文本与无降AI文本：禁用词减少
8. 切换章节再生成，确认降AI每次都自动执行
9. 确认其他四层不受影响

**收尾**：
1. `git diff` 逐行审核
2. 提交：`feat: 降AI内嵌正文层 - 前置17条方法论+后处理自动清洗`
3. 更新开发经验文件V2
4. 更新开发日志
5. 升级版本号（minor）
6. 封装

**经验引用**：
- S3 验证纪律1 - 构建成功 不等于 功能完成
- S3 验证纪律3 - 没有证据的已完成 = 未完成
- S3 验证纪律17 - 源 Electron 不是 Vite 热更新载体，改动后必须先 build:vue
- S6 交付纪律 - 封装前工作区干净

---

## 四、影响范围矩阵

| 文件 | 改动类型 | 行数 | 风险 |
|------|----------|------|------|
| `src/components/pipeline/PipelinePanel.vue` | import 新增 | +1行 | 无 |
| `src/components/pipeline/PipelinePanel.vue` | callApiWithAgent 注入 | +2行 | 低 - 仅 step===4 |
| `src/components/pipeline/PipelinePanel.vue` | genBody 后处理 | +12行 | 低 - try-catch 保护 |
| `src/components/pipeline/PipelinePanel.vue` | UI badge | +1行 HTML + CSS | 无 |
| `src/services/de-ai.js` | 不改动 | 0 | 无 |
| 其他所有文件 | 不改动 | 0 | 无 |

**总改动量**：1个文件，约16行代码 + 5行CSS

---

## 五、不做的边界

1. **不改 de-ai.js** - 17条方法论已写入并验证
2. **不改其他四层** - 降AI只在正文层生效
3. **不加深度处理按钮** - 与主页编辑器重复
4. **不改主页编辑器的降AI功能** - 两者独立，互不干扰
5. **不改 SKILL 配置** - 降AI方法论是应用层注入，不是 SKILL 层职责
6. **不改 aiService.ts** - 只改 system prompt 内容，不改 callAi 参数结构

---

## 六、风险评估

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| DeAiProcessor 清洗后字数大幅减少 | 低 | 中 | de-ai.js 已有75%字数保护，低于阈值自动回退原文 |
| 降AI方法论导致 API 输出变差 | 低 | 中 | 方法论是肯定式约束（告诉怎么写），不是否定式禁止 |
| genBody 中 DeAiProcessor 抛异常 | 低 | 低 | try-catch 包裹，失败时用原文继续 |
| compose 模式下注入位置不对 | 低 | 低 | callApiWithAgent 是统一入口，chain/compose 都走它 |
| badge 样式溢出 | 低 | 低 | 用 inline-flex + white-space:nowrap |

---

## 七、铁律遵守

1. **不设 token 预算**（用户多次强调）
2. **目标模式需要用户决定时，用户未确定就取消目标模式等待**（本轮铁律）
3. **不允许网页测试/开发者模式/安装版验证**（必须源 Electron 启动）
4. **脚本要精准针对性**（S2 脚本纪律）
5. **先读代码再改**（S1 通用规则4）
6. **一次一个闭环**（S1 通用规则3）

---

## 八、执行顺序

```
P0 import 引入 -> 类型检查
P1 前置层注入 -> 构建
P2 后处理层注入 -> 构建
P3 UI 标识 -> 构建
P4 compose 覆盖确认 -> 读码
P5 回归检查 -> 读码
P6 源 Electron 真实验证 -> 收尾
```

每个 P 完成后构建验证，失败则修复再继续，不跳过。
