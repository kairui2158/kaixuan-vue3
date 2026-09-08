# 真 SKILL 五线融合最终方案（可执行版）

> 生成日期：2026-09-07  
> 状态：待用户审核，未执行任何代码改动  
> 底座文件：`_audit/REAL_SKILL_PLAN_SUPPLEMENTED.md`（8 个缺口补全后的基础真 SKILL 方案）  
> 原始方案：`_audit/REAL_SKILL_IMPLEMENTATION_PLAN.md`  
> 执行交接：`_audit/REAL_SKILL_HANDOFF.md`  
> 经验约束：`_audit/神意开发经验总结_v3.md`

---

## 0. 审核摘要

本方案不推翻基础真 SKILL 方案，而是把它作为不可绕过的底座，在其上叠加五条升级线：

| 升级线 | 目标 | 核心机制 | 默认状态 |
|--------|------|----------|----------|
| U1 动态模板 | preProcess 可按输入改写执行模板 | `api.setTemplate(text)` | 关闭，显式调用才生效 |
| U2 条件执行流 | 一个 SKILL 内部多轮执行 | `executionMode: "multi-pass"` + `passes[]` | 关闭，默认单次执行 |
| U3 Schema 驱动重试 | 输出不合格时自动反馈重试 | `postProcess` 返回 `{valid, errors}` | 关闭，默认不重试 |
| U4 SKILL 内组合 | 一个文件夹编排多个子 SKILL | 子文件夹 + `skillOrchestrator` | 关闭，仅识别声明的 composite |
| U5 样本智能选择 | 按内容相关性挑选风格样本 | `api.getSamples()` | 关闭，默认沿用现有样本注入 |

五条线共用三个公共约束，避免互相打架：

1. **统一返回协议**：所有 pre/post 钩子返回值先归一化，再进入执行器。
2. **两层执行模型**：`skillOrchestrator` 只负责组合编排，`realSkillExecutor` 只负责单个 SKILL 执行。
3. **全局 API 调用预算**：所有升级线共享同一个 `apiCallBudget`，默认最多 8 次 API 调用，超限停止并报告。

本方案遵守基础方案的 8 个缺口补全结论：三条消费路径（去AI味、生成流水线、主页共创）全覆盖，Agent 参数真正进入 API 请求，持久化、导入导出、路径失效、样本优先级、错误 fallback 全部保留。

---

## 1. 底座铁律（不可协商）

以下内容来自 `REAL_SKILL_PLAN_SUPPLEMENTED.md`，五条升级线不得削弱或绕过：

| 编号 | 铁律 | 本方案对应 |
|------|------|------------|
| B1 | `format` 默认 `text`，存量 SKILL 零影响 | 所有新能力只在 folder 路径内启用 |
| B2 | 三条消费路径全覆盖：useDeAi / PipelinePanel / ChatPanel | 统一走 `skillRouter`，避免三处复制逻辑 |
| B3 | Agent `systemPrompt/temperature/maxTokens/model` 必须进入 API 请求 | executor 调 `aiService.callAi` 时统一传入 |
| B4 | `format/folderPath` 必须在 store、JSON、Markdown 导入导出全链路持久化 | 步骤 S8/S13 覆盖 |
| B5 | 路径失效、脚本错误、schema 失败必须有 fallback，不允许崩溃 | fallback 表扩展到五条升级线 |
| B6 | `samples.txt` 优先于全局 `deai-samples.js` | U5 只改变“如何挑选”，不改变优先级 |
| B7 | 不新增 npm 依赖，沙箱只用 Node.js 内置 `vm` | 所有新模块零依赖 |
| B8 | 不修改核心链路文件 | 不修改清单见 §11.3 |

### 1.1 执行期铁律

1. 先读再改：修改任何文件前先读取当前源码。
2. 含中文文件使用 `apply_patch` 或 Node.js `fs` 写入，禁止 PowerShell ANSI 写入。
3. 每个步骤完成后立即语法检查与功能验证，禁止攒到最后统一验。
4. 渲染层改动后必须先 `npm run build:vue`，再源 Electron 启动验证。
5. 源 Electron 启动路径固定为 `node_modules\electron\dist\electron.exe . --remote-debugging-port=9227`。
6. CDP 探针使用 Node WebSocket 载体执行 JS 文件，禁止 PowerShell 内联复杂脚本。
7. 需要用户决策时必须等待用户决策，不允许被目标模式推进绕过。
8. 本方案当前状态是“待审核”，任何代码执行都必须等用户明确批准。

---

## 2. 社区调研与吸收结论

调研对象为本机真实存在的社区实现，不是概念性引用。

### 2.1 Codex 自带 SKILL 系统

路径：`C:/Users/凯瑞/.codex/skills/.system/`

吸收的机制：

| 机制 | 来源观察 | 本方案落地 |
|------|----------|------------|
| 文件夹即技能 | `SKILL.md` + `agents/` + `scripts/` + `references/` + `assets/` | 真 SKILL 文件夹结构保持一致 |
| 渐进式披露 | 先 name/description，再 body，再按需加载 references | `realSkillLoader` 只加载必需文件，子 SKILL 延迟加载 |
| 脚本作为工具 | scripts 目录提供可执行辅助 | `script.js` 在 vm 沙箱内执行 |
| 无强制 pre/post 钩子 | Codex 依赖 Agent 自行决定流程 | 我们保留钩子，因为应用需要确定性执行 |

没有照抄的部分：Codex 的 Agent 可以直接调用通用工具和文件系统；我们的 SKILL 脚本只暴露受限 API，不暴露 `require/fs/process`。

### 2.2 Superpowers 6.3.0

路径：`C:/Users/凯瑞/.codex/plugins/cache/openai-curated-remote/superpowers/6.3.0/skills/`

吸收的机制：

| 机制 | 来源观察 | 本方案落地 |
|------|----------|------------|
| 执行后审查 | subagent-driven-development：每个任务后做 spec + quality review | U3 的 postProcess 校验与修复循环 |
| 修复轮封顶 | 最多 5 轮，超限进入裁决 | 重试默认 3 次，预算默认 8 次 API |
| 状态裁决 | DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED | 执行状态模型映射为应用内中文状态 |
| 完成前验证 | verification-before-completion：无新鲜证据不得声称完成 | V1-V16 全部要求当轮证据 |

没有照抄的部分：Superpowers 的 "Rulings, not stalls" 允许执行者自行裁决继续推进；我们的经验规则明确要求用户决策点必须等待用户，因此所有涉及默认参数、UI 文案、执行开关的决策都列为 §13 的用户决策点。

### 2.3 skill-creator 规范

吸收：最小文件夹结构，禁止无意义占位文件。真 SKILL 只要求 `SKILL.md` 和 `template.md` 必填，其余文件可选。

### 2.4 项目源码核对结论

| 结论 | 源码位置 | 影响 |
|------|----------|------|
| `aiService.callAi` 已支持 `temperature/maxTokens/model` | `src/services/aiService.ts` 约 L80-84、L713-739 | executor 可直接传 Agent 参数，不改 aiService |
| 流水线已消费 Agent 参数 | `src/components/pipeline/PipelinePanel.vue` 约 L1997-2024 | U 线在流水线路由时沿用该链路 |
| 主页共创目前只有 agentPrompt 注入 | `src/components/chat/ChatPanel.vue` 约 L632、L1096 | folder 路径必须显式传 Agent 参数，避免只在流水线生效 |

---

## 3. 总体架构

```text
用户触发
  |
  v
skillRouter.isRealSkill(skill)
  |
  +-- format=text ----------------> 现有文本 SKILL 路径（完全不动）
  |
  +-- format=folder + folderPath -> loadRealSkill(folderPath)
                                      |
                                      v
                                  skillOrchestrator
                                  （仅 composite SKILL 启用）
                                      |
                                      v
                                  realSkillExecutor
                                  （单个 SKILL 的确定执行单元）
                                      |
                                      v
                                  apiCallBudget
                                  （全局 API 调用预算与日志）
```

职责边界：

| 模块 | 只负责 | 不负责 |
|------|--------|--------|
| `skillRouter` | 判断文本/folder、解析路径、统一入口 | 执行逻辑 |
| `skillOrchestrator` | composite 编排、子 SKILL 顺序、组合状态 | 单个 SKILL 内部 API 调用 |
| `realSkillExecutor` | 单 SKILL pre/process/post/retry | 跨 SKILL 编排 |
| `apiCallBudget` | 计数、限额、调用日志 | 业务判断 |

---

## 4. 统一协议（冲突 C1）

五条升级线最大的冲突是“每个钩子都想扩展返回值”。解决方式是先定义唯一协议，再让所有线消费这个协议。

### 4.1 preProcess 返回协议

```typescript
export interface PreProcessResult {
  /** 归一化后的输入文本；未返回时使用原始输入 */
  input?: string
  /** U1：动态覆盖 template.md */
  template?: string
  /** U2：多轮执行计划 */
  passes?: SkillPass[]
  /** U5：本轮要注入的样本 */
  samples?: string[]
}
```

兼容规则：

| script.js 返回值 | 归一化结果 |
|------------------|------------|
| `undefined` | `{}` |
| `string` | `{ input: value }` |
| object | 按字段白名单拷贝，未知字段忽略并写诊断日志 |
| throw | `{}`，记录 script error，继续执行 |

### 4.2 postProcess 返回协议

```typescript
export interface PostProcessResult {
  /** 是否通过校验；未返回时视为 true */
  valid?: boolean
  /** U3：失败原因，进入下一轮反馈 */
  errors?: string[]
  /** 后处理后的输出；未返回时保留当前输出 */
  output?: string
}
```

兼容规则与 preProcess 相同：`string` 归一化为 `{ output: value }`，`undefined` 归一化为 `{}`。

### 4.3 meta.json 扩展

```json
{
  "name": "白虎-S1A-事件核提取",
  "version": "1.1.0",
  "format": "folder",
  "executionMode": "single",
  "outputFormat": "text",
  "apiCallLimit": 3,
  "retryLimit": 2,
  "composite": false
}
```

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `executionMode` | `single` / `multi-pass` | `single` | U2 开关 |
| `apiCallLimit` | number | 未设置时用全局预算 | 单 SKILL 内部限额 |
| `retryLimit` | number | 0 | U3 内部重试上限，另受全局预算约束 |
| `composite` | boolean | false | U4 开关 |

版本策略：`meta.version` 只做展示与诊断，不做破坏性拦截；协议不认识的字段保留原文并记 warning，保证第三方 SKILL 向后兼容。

### 4.4 沙箱 API

基础 API（底座已有）：

| API | 说明 |
|-----|------|
| `api.log(msg)` | 写入执行日志 |
| `api.getContext()` | 返回 step、skillId、previousOutput、调用来源 |
| `api.setOutput(text)` | 直接覆盖最终输出 |
| `api.validate(text)` | 返回 `{valid, errors}`，仅作为脚本内部辅助 |

新增 API：

| API | 升级线 | 说明 |
|-----|--------|------|
| `api.setTemplate(text)` | U1 | 动态覆盖本轮 template |
| `api.getSamples(filter?)` | U5 | 返回过滤后的样本，最多 20 条 |

沙箱安全保持底座设计：不暴露 `require/fs/process/__dirname`，超时 5 秒，脚本只能通过 `api` 与外部通信。

---

## 5. U1 动态模板

### 5.1 解决的问题

同一个 SKILL 面对不同输入时，固定 template 会退化。例如：

| 输入类型 | 最优模板 |
|----------|----------|
| 对话密集段落 | 强调口语节奏、角色区分 |
| 战斗场面 | 强调动作链、空间关系 |
| 心理描写 | 强调内心逻辑、感官细节 |

静态 template 只能写成大而全的折中稿，模型注意力被稀释。

### 5.2 数据流

```text
原始输入
  |
  v
preProcess(input, ctx)
  |
  +-- return { template: "..." } --> 覆盖本轮 template.md
  |
  v
Agent systemPrompt + 动态 template
  |
  v
aiService.callAi
```

### 5.3 边界

1. 动态模板只影响当前这一次执行，不写回 `template.md`。
2. 覆盖后的模板长度上限 20000 字符，超限截断并记录 warning。
3. `setTemplate` 抛异常时回退原 template。
4. 动态模板进入 system message 的位置保持底座顺序：`Agent systemPrompt -> SKILL template`。
5. 诊断日志必须记录“模板被动态覆盖”，否则用户无法理解同一 SKILL 输出风格变化。

---

## 6. U2 条件执行流

### 6.1 解决的问题

部分任务天然是多轮的，例如“先提取事件，再重写，再自检”。如果都塞进一个 prompt，模型可能跳步；如果拆成三个 SKILL，用户配置成本上升。

### 6.2 开启方式

只有 `meta.executionMode === "multi-pass"` 才启用，默认 `single` 保持现状。

### 6.3 passes 协议

```typescript
export interface SkillPass {
  id: string
  label: string
  template?: string
  inputMode: 'original' | 'previous'
  injectSamples?: boolean
}
```

示例：

```javascript
module.exports.preProcess = function (input, ctx) {
  const denseDialog = (input.match(/["“]/g) || []).length > 20
  return {
    passes: [
      { id: 'extract', label: '事件提取', inputMode: 'original' },
      {
        id: 'rewrite',
        label: denseDialog ? '对话优先重写' : '叙述优先重写',
        inputMode: 'previous',
        injectSamples: true
      },
      { id: 'check', label: '自检', inputMode: 'previous' }
    ]
  }
}
```

### 6.4 执行规则

| 规则 | 取值 | 理由 |
|------|------|------|
| 最大 pass 数 | 5 | 对齐社区修复轮封顶思想，避免失控 |
| 输入来源 | `original` 或 `previous` | 支持渐进加工与回归检查 |
| pass 状态 | planned/running/done/failed/skipped | 用户可见，不允许失败被隐藏 |
| 预算 | 共享全局 API 预算 | 防止 multi-pass 吞掉全部调用 |
| 失败策略 | 当前 pass 失败即停止后续 pass | 不允许拿旧输出伪装成功 |

### 6.5 状态展示

进度事件格式：

```json
{
  "type": "real-skill:pass",
  "skillId": "xxx",
  "passId": "rewrite",
  "status": "running",
  "index": 2,
  "total": 3
}
```

UI 显示为“第 2/3 步：对话优先重写”，进入现有统一进度组件，不新增独立弹窗体系。

---

## 7. U3 Schema 驱动重试

### 7.1 解决的问题

当前输出质量依赖模型自觉。postProcess 可以做确定性检查，但检查失败后没有自动反馈通道，用户只能手工重跑。

### 7.2 校验来源

优先级：

1. `script.js` 的 `postProcess` 返回 `{valid, errors}`。
2. `schema.json` 做结构校验。
3. 两者都不存在时不重试，保持底座行为。

### 7.3 重试流程

```text
第 1 次调用
  |
  v
postProcess / schema 校验
  |
  +-- valid=true --> 输出
  |
  +-- valid=false
        |
        v
      注入反馈重试（最多 retryLimit，默认 2，总尝试不超过 3 次）
        |
        v
      仍失败 --> 输出最后一次结果 + 校验报告 + degraded 状态
```

反馈消息格式：

```text
[校验反馈]
上一版输出未通过校验，请修正以下问题后重新输出完整结果：
1. 事件核数量少于 5 条
2. 存在禁用句式：不是……而是……
```

### 7.4 渐进策略

| 尝试 | temperature | 说明 |
|------|-------------|------|
| 1 | Agent 配置值 | 正常执行 |
| 2 | Agent 配置值 | 只注入结构化反馈，避免过度扰动 |
| 3 | min(Agent 温度 + 0.05, 1.0) | 最后一次小幅升温，用于跳出重复失败 |

### 7.5 硬边界

1. 重试不是静默修复：每次失败都必须进入执行日志。
2. 达到上限后不允许标记为完全成功，必须显示“校验未通过，已保留最后一次输出”。
3. schema 校验只做确定性检查，不额外调用模型审查，避免成本翻倍。
4. 重试消耗全局 API 预算，预算不足时立即停止。

---

## 8. U4 SKILL 内组合

### 8.1 解决的问题

S1A/S1B/S1C 这类强相关流程需要共享上下文和统一状态。如果全部暴露给用户配置，配置复杂度上升；如果硬编码在应用里，第三方无法复用。

### 8.2 文件夹结构

```text
skills/
  白虎-S1-组合重写/
    SKILL.md
    template.md
    meta.json
    script.js
    children/
      S1A-事件核提取/
        SKILL.md
        template.md
        script.js
      S1B-结构重组/
        SKILL.md
        template.md
      S1C-语言重写/
        SKILL.md
        template.md
        samples.txt
```

### 8.3 编排协议

父 SKILL 的 `script.js` 可导出：

```javascript
module.exports.plan = function (input, ctx) {
  return {
    order: ['S1A-事件核提取', 'S1B-结构重组', 'S1C-语言重写'],
    mode: 'sequential'
  }
}

module.exports.afterStep = function (state, ctx) {
  if (state.stepId === 'S1A-事件核提取' && !state.output.includes('事件')) {
    return { action: 'retry', reason: '事件提取为空', maxRetries: 1 }
  }
  return { action: 'continue' }
}
```

`afterStep` 返回值：

| action | 说明 |
|--------|------|
| `continue` | 继续下一步 |
| `retry` | 重试当前子 SKILL，受预算限制 |
| `skip` | 跳过当前子 SKILL，状态记 skipped |
| `stop` | 停止后续步骤，状态记 failed |

### 8.4 状态模型

吸收社区 quality gate，但映射为应用内可展示状态：

| 内部值 | UI 中文 | 含义 |
|--------|---------|------|
| `DONE` | 完成 | 校验通过 |
| `DONE_WITH_CONCERNS` | 完成（有警告） | 输出可用但有非阻断问题 |
| `NEEDS_CONTEXT` | 需要补充信息 | 输入不足，应提示用户 |
| `BLOCKED` | 已阻断 | 预算耗尽、路径失效或硬校验失败 |

### 8.5 防失控规则

1. composite 嵌套深度最多 2 层，检测到循环依赖立即 BLOCKED。
2. 子 SKILL 默认串行；并行模式仅允许无 `previousOutput` 依赖时启用。
3. 父 SKILL 不直接调用 API，只编排；API 调用都发生在子 SKILL executor。
4. 子 SKILL 加载失败时整组 BLOCKED，不允许跳过失败子步骤后伪装成功。

---

## 9. U5 样本智能选择

### 9.1 解决的问题

底座方案已定义样本优先级，但“选哪几个”仍是固定切片。固定注入会让战斗段落拿到大量抒情样本，参考价值低。

### 9.2 选择流程

```text
样本池 = SKILL samples.txt（优先）或全局 deai-samples.js
  |
  v
preProcess 调 api.getSamples({ keyword, limit })
  |
  v
按关键词重叠度打分
  |
  v
返回 top N（默认 3，上限 5）
```

默认打分规则（纯本地，不调用 API）：

1. 提取输入文本高频实词，去除停用词。
2. 与样本文本计算词重合度。
3. 同分时保持样本原顺序，保证结果稳定。

### 9.3 注入边界

| 约束 | 取值 |
|------|------|
| 默认注入数量 | 3 |
| 最大注入数量 | 5 |
| 样本总字符预算 | 4000 字符 |
| 注入位置 | user message 顶部，`[style reference]` 标记 |
| S2/校验 pass | 默认不注入样本 |

---

## 10. 冲突与覆盖面闭环

| 冲突 | 解决方案 |
|------|----------|
| C1 多条线都扩展钩子返回值 | 统一 `PreProcessResult` / `PostProcessResult` |
| C2 编排与执行职责混杂 | `skillOrchestrator` 与 `realSkillExecutor` 分层 |
| C3 多线同时放大 API 调用 | 全局 `apiCallBudget`，默认 8 次 |
| C4 三条消费路径重复实现 | `skillRouter` 统一路由与 fallback |
| C5 第三方旧脚本兼容 | 返回值归一化，未知字段忽略并记日志 |
| C6 状态不可见 | 统一进度事件与四态质量状态 |
| C7 用户误配高风险能力 | U1-U5 全部默认关闭，只有 meta 显式声明才启用 |

覆盖面矩阵：

| 能力 | 去AI味 | 生成流水线 | 主页共创 |
|------|--------|------------|----------|
| folder 路由 | 是 | 是 | 是 |
| Agent 参数注入 | 是 | 是 | 是 |
| U1 动态模板 | 是 | 是 | 是 |
| U2 multi-pass | 是 | 是 | 是 |
| U3 schema 重试 | 是 | 是 | 是 |
| U4 composite | 是 | 是 | 是 |
| U5 样本选择 | 是 | 是 | 是 |
| 文本 SKILL 旧行为 | 不变 | 不变 | 不变 |

---

## 11. 执行步骤

### 11.1 阶段划分

建议按三个阶段执行，每阶段都有独立验收门，未通过不进入下一阶段：

| 阶段 | 内容 | 验收门 |
|------|------|--------|
| Phase 1 底座落地 | S1-S5、S7-S9、S13 | V1-V12 |
| Phase 2 单 SKILL 升级 | S4 扩展、S6、S10、S11、S12、S14 | V13-V15 |
| Phase 3 composite | S6 编排完整化、S10 状态 UI | V16 |

### 11.2 步骤清单

| 步骤 | 文件 | 类型 | 内容 | 验证 |
|------|------|------|------|------|
| S1 | `electron/ipc/skill-loader.js` | 新增 | IPC 加载文件夹、列出文件夹、vm 沙箱执行脚本 | IPC 返回结构正确，require 被拦截 |
| S2 | `electron/preload.js` | 修改 | 暴露 skillLoadFolder / skillListFolders / skillExecuteScript | 渲染层 API 非 undefined |
| S3 | `src/services/realSkillLoader.ts` | 新增 | 包加载、缓存、mtime 失效、子 SKILL 延迟加载 | 二次加载不重复 IPC |
| S4 | `src/services/realSkillExecutor.ts` | 新增 | 单 SKILL 执行、协议归一化、U1-U3、fallback | 测试 SKILL 全流程 |
| S5 | `src/services/apiCallBudget.ts` | 新增 | 全局预算、调用日志、超限阻断 | 预算耗尽返回 BLOCKED |
| S6 | `src/services/skillOrchestrator.ts` | 新增 | composite 编排、afterStep、状态汇总 | 三子 SKILL 顺序执行 |
| S7 | `src/services/skillRouter.ts` | 新增 | 三条路径共用的路由与降级 | 三处调用不再复制判断 |
| S8 | `src/stores/skill.ts` | 修改 | format/folderPath 持久化与导入映射 | 重启后字段仍在 |
| S9 | `src/composables/useDeAi.ts` | 修改 | 接入 skillRouter 与 Agent 参数 | 文本 SKILL 行为不变 |
| S10 | `src/components/settings/SkillSettings.vue` | 修改 | folder SKILL 管理、能力标签、诊断 | 导入后卡片可见 |
| S11 | `src/components/pipeline/PipelinePanel.vue` | 修改 | 3 处 getSkill 调用接入路由 | folder SKILL 可跑流水线 |
| S12 | `src/components/chat/ChatPanel.vue` | 修改 | 共创接入路由与 Agent 参数 | folder SKILL 可对话执行 |
| S13 | `src/services/configExchange/markdown.ts` | 修改 | format/folderPath 字段映射 | MD 导入字段不丢 |
| S14 | `_audit` 文档与开发日志 | 新增 | 协议文档、验证记录、经验回写 | 文档与实现一致 |

### 11.3 不修改清单

| 文件 | 理由 |
|------|------|
| `src/services/aiService.ts` | executor 直接调用现有 callAi 参数 |
| `src/services/chainExecution.ts` | 文本链 prompt 逻辑不变 |
| `src/services/de-ai.js` | 硬规则层不变 |
| `src/services/deai-samples.js` | 全局样本池不变 |
| `src/services/skillValidation.ts` | 现有文本 SKILL 校验不变 |
| `src/services/chainBreakpoint.ts` | 现有断点逻辑不变 |
| `src/services/agent-scheduler.ts` | Agent 调度容器不变 |
| `src/stores/deai.ts` | 去 AI 味 store 不变 |
| `src/stores/pipeline.ts` | 流水线 store 不变 |
| `src/stores/provider.ts` | 供应商 store 不变 |
| `electron/main.js` | 只允许新增一行 require |
| `electron/ipc/storage.js` | 存储层不变 |
| `package.json` | 不新增依赖 |

---

## 12. 验证矩阵

所有验证必须在当轮产生证据；历史结果、构建成功、类型检查通过都不能单独替代行为验证。

| 编号 | 验证项 | 方法 | 通过标准 |
|------|--------|------|----------|
| V1 | 文本 SKILL 不受影响 | 配置文本 SKILL 跑去AI味 | 输出与改动前一致 |
| V2 | folder SKILL 加载 | 导入文件夹 | 卡片正确显示，路径有效 |
| V3 | folder SKILL 执行 | 跑去AI味 | executor 被调用，输出正确 |
| V4 | preProcess 生效 | script.js 修改输入 | API 收到预处理文本 |
| V5 | postProcess 生效 | script.js 修改输出 | 最终输出被后处理 |
| V6 | SKILL 自带样本注入 | samples.txt 存在 | user message 包含该样本 |
| V7 | 全局样本回退 | samples.txt 不存在 | user message 包含全局样本 |
| V8 | 文本+folder 混用 | 混合链执行 | 链式完成，路由正确 |
| V9 | 沙箱安全 | 脚本尝试 require/fs/process | 被拦截且不崩溃 |
| V10 | 流水线覆盖 | folder SKILL 加入流水线 | pre/post 生效 |
| V11 | 共创覆盖 | folder SKILL 加入共创 | executor 被调用，Agent 参数进入请求 |
| V12 | 路径失效回退 | 重命名文件夹后执行 | 回退文本路径并提示 |
| V13 | U1 动态模板 | preProcess setTemplate | system message 使用动态模板 |
| V14 | U2 multi-pass | meta 开启 multi-pass | 按 passes 顺序执行并显示进度 |
| V15 | U3 重试 | postProcess 返回失败 | 最多重试到上限，状态非静默成功 |
| V16 | U4 composite | 三子 SKILL 组合 | 顺序执行、状态汇总、预算受控 |

补充验证要求：

1. `npm run build:vue` 成功只是前置条件，不是功能完成。
2. 源 Electron 启动后进行真实 UI 操作，禁止浏览器模式、开发者模式和安装版替代。
3. CDP 探针按经验文件三段式：前置快照、操作断言、恢复清理。
4. 若遇到 Electron 33 Runtime/DOM/Page 域假死，按经验规则降级为构建产物扫描 + type-check + vitest + build:vue，并把 UI 验证明确标为“待用户实测”，不得伪称已验证。
5. 每项验证保存截图、JSON 日志、时间戳三者之一以上，且能对应到具体步骤。

---

## 13. 用户决策点

以下参数在执行前需要用户确认；未确认时保持方案默认值，但不启动执行：

| 决策点 | 默认建议 | 影响 |
|--------|----------|------|
| 全局 API 预算 | 8 次 | 过低会截断 multi-pass/composite，过高增加成本 |
| U3 总尝试次数 | 3 次 | 影响失败输出耗时 |
| U2 最大 pass 数 | 5 | 影响长流程上限 |
| U4 嵌套深度 | 2 层 | 影响第三方组合复杂度 |
| U5 最大样本数 | 5 条 / 4000 字符 | 影响上下文长度 |
| 执行阶段 | Phase 1 先行 | 可选择一次性执行或分阶段验收 |

---

## 14. 风险与缓解

| 风险 | 等级 | 缓解 |
|------|------|------|
| 五线同时上线导致回归面过大 | 高 | 分三阶段验收，每阶段有硬门 |
| 第三方脚本返回值不兼容 | 中 | string/object/undefined 全归一化 |
| API 成本失控 | 高 | 全局预算 + 单 SKILL 限额 + 调用日志 |
| composite 死循环 | 高 | 深度 2、循环检测、预算阻断 |
| 动态模板注入恶意超长内容 | 中 | 20000 字符截断 + 诊断日志 |
| 状态失败被隐藏 | 高 | 四态状态模型，失败必须可见 |
| 共创路径 Agent 参数遗漏 | 中 | V11 专测请求参数 |
| CDP 环境假死造成假验证 | 中 | 按经验规则降级并如实标注 |

---

## 15. 经验文件 V2 引用

| 经验规则 | 本方案落实点 |
|----------|--------------|
| §1 M1 先查引用 | S7/S11/S12 修改前先 rg 引用 |
| §1 M2 禁止整文件重写 | 所有修改使用 apply_patch 精准编辑 |
| §2 规则 2 复杂脚本写 JS 文件 | 验证探针全部落盘执行 |
| §2 规则 18 源 Electron 完整路径 | 验证固定用 electron.exe |
| §3 规则 1 构建不等于功能 | V1-V16 要求行为证据 |
| §3 规则 17 先 build 再 UI 验证 | 渲染层改动后必须 build:vue |
| §3 规则 37 CDP 假死降级 | 明确降级路径与如实标注 |
| §3 规则 21 探针后核销状态 | finally 恢复项目与探针数据 |
| 用户决策铁律 | §13 决策点未确认不执行 |

---

## 16. 完成标准

本方案审核通过并执行后，只有同时满足以下条件才算完成：

1. V1-V16 全部通过，且每项有当轮证据。
2. 文本 SKILL 旧路径无行为变化。
3. 三条消费路径都能执行 folder SKILL，并且 Agent 参数真实进入请求。
4. U1-U5 均默认关闭，只有显式配置才启用。
5. 全局预算、重试上限、composite 深度限制全部生效。
6. 失败、降级、跳过、预算耗尽在 UI 与日志中可见。
7. 开发经验文件和开发日志完成回写。
8. 用户完成一次真实实操验收。

---

## 附录 A：完整示例

### A.1 multi-pass + 动态模板 + 样本选择

```javascript
module.exports.preProcess = function (input, ctx) {
  const isBattle = /剑|刀|冲|杀|血/.test(input)
  const samples = api.getSamples({ keyword: isBattle ? '战斗' : '抒情', limit: 3 })

  api.setTemplate(isBattle
    ? '你是战斗场面重写师。保持动作因果链清晰，禁止慢镜头堆砌。'
    : '你是叙述重写师。保持信息密度，禁止空洞抒情。')

  return {
    samples,
    passes: [
      { id: 'rewrite', label: isBattle ? '战斗重写' : '叙述重写', inputMode: 'original' },
      { id: 'check', label: '自检', inputMode: 'previous' }
    ]
  }
}

module.exports.postProcess = function (output, ctx) {
  const errors = []
  if (output.length < 200) errors.push('输出过短')
  if (/不是.+而是/.test(output)) errors.push('存在禁用句式')
  return { valid: errors.length === 0, errors, output }
}
```

### A.2 composite 编排

```javascript
module.exports.plan = function () {
  return {
    mode: 'sequential',
    order: ['S1A-事件核提取', 'S1B-结构重组', 'S1C-语言重写']
  }
}

module.exports.afterStep = function (state) {
  if (state.stepId === 'S1A-事件核提取' && state.output.trim() === '') {
    return { action: 'retry', reason: '事件提取为空', maxRetries: 1 }
  }
  return { action: 'continue' }
}
```

---

## 附录 B：当前状态声明

1. 本文档是审核稿，未修改任何应用源码。
2. 本方案未新增 npm 依赖。
3. 本方案不改变现有文本 SKILL、去AI味硬规则、Agent store、供应商协议。
4. 执行必须等待用户明确批准，并按 §11.1 阶段门推进。
