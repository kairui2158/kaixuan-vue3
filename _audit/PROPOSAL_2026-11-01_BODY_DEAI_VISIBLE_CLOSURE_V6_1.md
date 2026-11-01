# 正文层内嵌降AI可视闭环方案 V6.1

版本：V6.1  
日期：2026-11-01  
状态：待确认，未执行  
目标应用：3.110.14 及其后续版本

## 0. 核心需求

用户在真实正文层实测中提出两个问题：

1. 三次运行中新版内嵌降AI是否真的起作用。
2. 为什么应用退场后，原来可见的“内嵌降AI”点亮图标消失了。

本方案只处理第 2 个问题的产品闭环：**当 SKILL 按契约接管方法指导时，应用必须继续给用户一个真实、可见、可对账的状态；不允许因为“不注入”而变成不可见。**

已核实的真实链路：

- 三份实测 trace 均有 `deai-injection-policy`，且 `guidanceOwnership=skill`。
- 同批 trace 的 `deai-guidance-pack=0`、`deai-prompt-variant=0`、`apiCalls.deaiPromptVariant=0`。
- 5/5/9 个 request payload 中应用指导包特征串全部 0 命中。
- 请求中存在的方法论内容来自 folder SKILL 模板本身。

结论：应用侧指导包在这三次运行中是零注入、零参与，这是 `guidanceOwnership=skill` 下的设计内退场，不是执行故障。

## 1. 研磨后的设计裁决

### 1.1 不回滚契约

禁止通过以下方式“恢复图标”：

- 删除 `guidanceOwnership=skill`。
- 静默忽略 SKILL 声明继续注入。
- 把 SKILL 模板内容冒充应用指导包。

理由：`guidanceOwnership` 是契约 v2 的核心边界。回滚它会把“同一维度只有一个 owner”重新变成两层打架，重演提示词冲突、重复教学和降AI规则互相挤压。

### 1.2 UI 状态源升级

现状：徽章与反馈面板只读 `deai-guidance-pack`。该事件只在应用注入时产生，因此 SKILL 接管后 UI 永远空白。

裁决：升级为双源读取，优先级如下：

1. 读取 `deai-injection-policy` 的 `policy.guidanceOwnership`。
2. `ownership=skill`：显示“SKILL 方法指导接管（0条 / 0字符应用注入）”。
3. `ownership=app`：继续读取 `deai-guidance-pack` 的实际条数与字符数。
4. 事件缺失或解析失败：显示“未观测到降AI注入状态”，不显示空字符串，不用旧文案冒充。
5. `generation=off`：显示“应用方法指导关闭（0条 / 0字符）”。

这个裁决把 UI 从“注入事件读取器”升级为“契约状态读取器”。用户不需要知道内部事件名，但必须知道当前是谁在负责方法指导。

## 2. 执行条目

### Task 1 — 指导状态投影函数

新建纯函数 `resolveDeaiGuidanceDisplay(runs, pipelineRunId)`，输出：

```ts
type DeaiGuidanceDisplay = {
  state: 'app' | 'skill' | 'off' | 'unknown'
  itemCount: number | null
  guidanceChars: number | null
  variant: string | null
  source: string | null
}
```

行为：

- 逐 run 反向遍历，优先匹配当前 body 层 run。
- `deai-injection-policy` 与 `deai-guidance-pack` 都要读，不允许只读一个。
- `policy.generation === 'off'` 时返回 `state='off'`。
- `guidanceOwnership === 'skill'` 时返回 `state='skill'`，计数为 0。
- `ownership=app` 时读取同 run 的 `deai-guidance-pack`。
- 无法解析或事件缺失时返回 `state='unknown'`，不抛错。

### Task 2 — UI 徽章与反馈面板升级

修改 `src/components/pipeline/PipelinePanel.vue`。

徽章文案：

- `app`：`方法指导 {itemCount}条 / {guidanceChars}字符`
- `skill`：`SKILL 方法指导接管`
- `off`：`应用方法指导关闭`
- `unknown`：`未观测到方法指导`

反馈面板文案：

- `app`：`降AI方法指导：{itemCount}条 / {guidanceChars}字符（informational-only，不改写正文、不改终态）`
- `skill`：`SKILL 已接管方法指导；应用 0条 / 0字符注入，只保留契约观测（不改写正文、不改终态）`
- `off`：`SKILL 已关闭应用方法指导注入（0条 / 0字符）`
- `unknown`：`本次运行未观测到方法指导契约事件；请导出 trace 对账`

渲染规则：

- 四种状态都必须渲染，不再依赖 `displayedBodyDeaiGuidanceBadge` 非空才显示。
- `skill` 与 `off` 使用现状提示样式，不使用警示红。
- 不得新增第二套“降AI状态”入口，只升级现有徽章与反馈面板。

### Task 3 — 真实分支单元测试

新增/升级 `deai-injection-policy.spec.ts`：

1. 只提供 `deai-injection-policy(ownership=skill)`，断言 UI 显示接管状态。
2. 提供 `policy(ownership=app)` + `deai-guidance-pack`，断言计数与字符数。
3. 提供 `generation=off`，断言关闭状态。
4. 不提供任何事件，断言 `unknown` 状态。
5. 契约事件 detail 损坏时，断言 UI 不崩溃且回落 `unknown`。

禁止：

- 禁止伪造 `deai-guidance-pack` 来测 `skill` 接管分支。
- 禁止只断言源码字符串，必须至少有一条直接消费投影函数的真实行为测试。

### Task 4 — Electron 真实 UI 验证器升级

升级 `scripts/verify-deai-guidance-ui.mjs`：

1. 保留现有应用注入路径验证。
2. 新增隔离 run A：只注入 `deai-injection-policy(ownership=skill)`，断言徽章显示“SKILL 方法指导接管”、反馈面板说明 0 条注入、不显示伪造的 `deai-guidance-pack`。
3. 新增隔离 run B：注入 `deai-injection-policy(generation=off)`，断言显示关闭状态。
4. 新增隔离 run C：只创建 run，不注入事件，断言 `unknown` 状态且 UI 不空白、不崩溃。
5. 断言真实点击流水线第 5 个步骤页签后徽章/反馈可见，页面无错误，`finally` 清理 Electron 与临时 profile。
6. 验证器启动前校验 `dist-renderer` 新鲜度，旧产物拒绝执行。

这一项是本方案的硬门禁。上一版脚本用 fixture 写入 `deai-guidance-pack` 验证徽章，却没有验证“SKILL 接管后无该事件”的真实分支，属于验证器盲区，必须在同一批次补齐。

### Task 5 — trace 观测补强

`guidanceOwnership=skill` 时，当前 folder 路径已有事件，但 agent 路径存在同类风险：`callApiWithAgentVariantOwned` 声明了 `skillDeaiMeta`，需要保证每次真实调用都传入并发射 `deai-injection-policy`。

执行要求：

1. 核对 agent 路径调用点，禁止空 meta 造成 `unknown`。
2. 所有调用路径必须有 `deai-injection-policy` 事件作为契约状态锚点。
3. 在集成测试中覆盖“agent 路径声明 `meta.deai` 并真实消费”的链路，禁止再用 `null` fixture 冒充。
4. trace 只保留结构化摘要，不新增提示词全文落盘。

### Task 6 — 声明手册升级（正文层必做）

新建 `_audit/FOLDER_SKILL_DEAI_MENTOR_GUIDE_2026-11-01_V6_1.md`。

必须包含：

1. `guidanceOwnership=skill` 的语义：应用零注入，不是故障；trace 有 `deai-injection-policy`，无 `deai-guidance-pack` 是预期。
2. UI 可见性说明：接管后应用显示“SKILL 方法指导接管”，不会显示应用包条数。
3. 责任边界：SKILL 负责叙事有效性与方法指导内容；应用负责契约、预算、trace、终态与可视状态。
4. 验证方法：SKILL 作者如何从 trace 确认接管生效、如何确认应用未注入、如何避免模板重复。
5. 迭代注意：SKILL 是活体，应用契约固定；SKILL 模板迭代时不要依赖应用指导包兜底。
6. 测试命令与验收标准，包括真实 deep trace 断言。

现有手册第 10 节“UI 徽章与反馈面板显示的实际条数、字符数，一律以 `deai-guidance-pack` 事件为准”需要更新为 V6.1 语义，避免文档继续承诺旧行为。

### Task 7 — 任务台账与开发日志

执行时必须新增：

- `_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-01_deai-guidance-visible-closure-v6-1.md`
- `_audit/DEV_LOG_2026-11-01_deai-guidance-visible-closure-v6-1.md`

台账按 G0.12 七节格式登记：

1. 目标与范围
2. 门禁读证
3. 路由判定
4. 实际改动
5. 停止条件
6. 验证证据
7. 缺口清单

日志必须登记：

- 引入点：V5 FINAL UI 只读 `deai-guidance-pack`，未覆盖 SKILL 接管分支。
- 根因：UI 数据源与契约状态源不一致。
- 验证盲区：fixture 伪造注入事件，测试只覆盖应用注入路径。
- 修复策略：不回滚契约，只补可视闭环。
- 回头看：源码、测试、验证器、手册、日志五面闭环。

### Task 8 — 影响圈与明确不改动面

打算修改：

- `src/components/pipeline/PipelinePanel.vue`
- `src/services/` 新增投影函数（具体文件名按现有命名风格落位）
- `src/components/pipeline/__tests__/deai-injection-policy.spec.ts`
- `scripts/verify-deai-guidance-ui.mjs`
- `_audit/FOLDER_SKILL_DEAI_MENTOR_GUIDE_2026-11-01_V6_1.md`
- `_audit/FOLDER_SKILL_DEAI_CONTRACT_GUIDE_2026-10-29.md`
- 新增 Task 7 两个台账/日志

明确不改动：

- `guidanceOwnership` 契约语义
- `resolveDeaiPromptForSkillStep` 的退场行为
- folder SKILL 模板与方法论内容
- 手动降AI功能（设置页、硬规则、深度修复、legacy-auto）
- 正文生成终态、合同验收、候选比选、重试策略
- 供应商并发与多任务流水线

## 3. 验证门

### 3.1 单元/集成测试

```powershell
npx vitest run src/components/pipeline/__tests__/deai-injection-policy.spec.ts src/services/skillDeaiContract.spec.ts src/services/deaiChainVariantIntegration.spec.ts
```

通过标准：

- `skill / app / off / unknown` 四态覆盖。
- 四态都有 UI 消费断言，不再只有源码字符串检查。
- agent 路径测试真实传入 `meta.deai`。

### 3.2 Electron 真实 UI 验证

```powershell
npm run build:vue
node scripts/verify-deai-guidance-ui.mjs
```

通过标准：

- 不伪造 `deai-guidance-pack` 的接管分支必须真实通过。
- `unknown` 分支必须可见且不崩溃。
- 页面无相关 console/page error。
- 验证器输出 badgeText 与实际状态。

### 3.3 真实 trace 反证

用 3.110.14 的三份真实 trace 做只读反证：

- `deai-injection-policy` 存在且 `guidanceOwnership=skill`。
- `deai-guidance-pack=0`。
- UI 状态应显示 SKILL 接管，而不是空白或旧徽章。

### 3.4 回头看

收尾前必须：

1. `git diff` 逐行过。
2. `rg` 反查 `deai-guidance-pack` 消费点，确认没有入口仍把“无事件”当正常空白。
3. 核对 `RETAINED_AUDIT_EVENT_TYPES` 保留两个事件。
4. 核对手册、测试、实现三方字段一致。
5. 清理临时脚本，工作区不得残留 `.tmp-*`。

## 4. 分阶段实施顺序

### Phase A — 合同与数据源（纯函数 + 测试）

1. Task 1 投影函数
2. Task 3 单元测试
3. Task 6 手册草稿

放行条件：四态纯函数测试全绿，测试断言不依赖伪造事件。

### Phase B — UI 接线（真实可见）

1. Task 2 徽章与反馈面板
2. Task 4 验证器升级

放行条件：Electron 真实 UI 验证通过，四态均可见。

### Phase C — trace 与 agent 路径补强

1. Task 5 agent 路径对账
2. 必要时补集成测试

放行条件：每条真实正文层调用路径都有契约状态锚点。

### Phase D — 文档与收尾

1. Task 6 手册定稿
2. Task 7 台账/日志
3. Task 8 影响圈对账
4. 清理、检查、准备版本升级

## 5. 版本与交付

1. 本方案执行后版本升级到 `3.110.15`。
2. `npm run build:vue` + Electron 打包。
3. 重新生成安装包并验证新鲜度。
4. 执行定向测试与真实 UI 验证。
5. 确认无缺口后 git 提交。
6. 提交信息：

```text
feat(deai): close body deai guidance visibility contract
```

## 6. 明确声明

本方案不宣称“应用内嵌降AI在这三次实测中有效”。事实是：这三次由 SKILL 模板接管，应用侧指导包零注入、零参与。任何有效性结论必须等同模型、同题材、同章节的配对数据，当前 B6 仍为 `provisional`。
