# 正文层内嵌降AI可视闭环方案 V6.2

版本：V6.2  
日期：2026-11-01  
状态：待用户确认，未执行  
目标应用版本：3.110.14 → 3.110.15

## 0. 核心需求

本轮要修的是同一个用户问题：

1. 正文层实测中，新版内嵌降AI必须能被用户看见并判断是否生效。
2. `guidanceOwnership=skill` 是正确的架构边界，不能为了图标回滚契约。
3. 可视状态必须与三个 SKILL 的真实契约一致，不允许一个徽章把混合状态压扁成单一状态。

V6.2 相比 V6.1 的关键升级：

- 从“单一四态徽章”改为“每 SKILL 投影 + 链级聚合”。
- 从“只修 UI”改为“投影函数、UI、验证器、旧文档语义、agent 路径”五面同批闭环。
- 从“新手册并存”改为“旧手册直接升级，不产生 V6.1 版并存语义”。
- 验证器禁止再用单一 fixture 冒充混合状态和 SKILL 接管真实分支。

## 1. V6.1 的漏洞与盲区

| # | V6.1 缺口 | 真实代码/trace 证据 | V6.2 修正 |
| --- | --- | --- | --- |
| 1 | 状态模型错误：假设整条正文链一个 owner | `runStepSkills` 每个 folder SKILL 独立读取 `meta.deai`，三份契约互不影响 | 投影按 `skillIndex` 输出数组；链级状态仅作摘要 |
| 2 | 事件形态遗漏：每步有两类 `deai-injection-policy` | 实测 trace 同一 skillIndex 有 projection 事件和 skill 消费事件；S2 retry 时还有重复 policy 事件 | 按 skillIndex 归组并取最新有效 policy；无效 detail 回落 unknown，不抛错 |
| 3 | 状态语义混淆：off 是配置关闭还是 SKILL 接管 | `resolveDeaiPromptForSkillStep` 中 `generation=off` 与 ownership 是两个维度 | 显式区分 app / skill / off / unknown / mixed；off 仅表示 generation 关闭 |
| 4 | 旧语义残留：手册承诺徽章只读 `deai-guidance-pack` | 现有手册第 10 节明确写“一律以 deai-guidance-pack 事件为准” | 不新建 V6.1 手册；直接升级现有手册，改为双事件对账语义 |
| 5 | 验证器盲区：只测应用注入路径 | `verify-deai-guidance-ui.mjs` 只 seed `deai-guidance-pack` | 新增 skill 接管、off、unknown、混合状态四个隔离 run |
| 6 | run 绑定弱：多 trace 可匹配同一 pipelineRunId | 现有 `deaiGuidanceTraceForRun` 只按 pipelineRunId 匹配 trace | 投影限定当前 displayed body run；多 trace 冲突时链级状态为 mixed |
| 7 | 重试后旧事件污染 | 111353 的 S2/S3 存在重复 policy 事件 | 每个 skillIndex 只取最新 policy；旧事件保留 trace 但不参与 UI 判定 |
| 8 | 预注入日志误导 | `PipelinePanel.vue:5840` 仍承诺“实际条数以 deai-guidance-pack 为准” | 同批改为“以 deai-injection-policy + deai-guidance-pack 对账” |

## 2. 设计裁决

### 2.1 不回滚契约

禁止：

- 删除或忽略 `guidanceOwnership=skill`。
- 静默继续注入应用指导包来“恢复图标”。
- 把 SKILL 模板方法论冒充应用指导包。
- 在投影层伪造 `deai-guidance-pack`。

理由：V5 的核心价值是“同一维度只有一个 owner”。SKILL 接管后应用退场是设计内行为，V6.2 只补可视闭环。

## 3. 执行条目

### Task 1 — 投影数据模型

新建纯函数模块 `src/services/deaiGuidanceDisplay.ts`：

```ts
type DeaiSkillGuidanceDisplay = {
  skillIndex: number
  skillId: string | null
  state: 'app' | 'skill' | 'off' | 'unknown'
  itemCount: number | null
  guidanceChars: number | null
  variant: 'methodology' | 'creative' | 'polish' | 'off' | null
  source: string | null
  warnings: string[]
}

type DeaiChainGuidanceDisplay = {
  state: 'app' | 'skill' | 'off' | 'unknown' | 'mixed'
  skills: DeaiSkillGuidanceDisplay[]
  observedCount: number
  itemCount: number | null
  guidanceChars: number | null
}
```

投影规则：

1. 以当前 displayed body run 关联的 trace 为唯一状态源，禁止跨 run 拼接状态。
2. 事件按 `skillIndex` 归组；无 skillIndex 的非链式事件归为 `unknown`，不得冒充链状态。
3. 每个 skillIndex 只取最新有效 `deai-injection-policy`；JSON 损坏回落 `unknown`。
4. `ownership=skill` 时返回 `state='skill'`，注入计数为 0。
5. `ownership=app` 时读取同 skillIndex 的 `deai-guidance-pack`；缺失时返回 `unknown`，不用 0 冒充已观测。
6. `generation=off` 时返回 `off`，不与 ownership 混译。
7. 链级状态：全部相同为该状态；存在 unknown 或状态不同时为 `mixed`。

### Task 2 — UI 升级

修改 `src/components/pipeline/PipelinePanel.vue`：

1. 删除 `displayedBodyDeaiGuidanceBadge` 对 `deai-guidance-pack` 单事件的依赖。
2. 新增链级徽章：
   - `app`：`方法指导 {totalItem}/{skillCount}步 · {guidanceChars}字符`
   - `skill`：`SKILL 方法指导接管 · 0注入`
   - `off`：`应用方法指导关闭`
   - `mixed`：`方法指导混合 · 展开查看`
   - `unknown`：`未观测到方法指导契约`
3. 反馈面板按 skill 显示：`S1 methodology · SKILL接管 0条/0字符`、`S2 creative · 6条/1180字符`。
4. 四种状态和混合状态都必须可见；`unknown` 不留空白。
5. 更新预注入日志，不再宣称只以 `deai-guidance-pack` 为准。

### Task 3 — 单元测试

新增 `src/services/deaiGuidanceDisplay.spec.ts`：

1. skill 接管：只有 policy 事件。
2. app 注入：policy + guidance-pack。
3. `generation=off`。
4. 无事件：unknown。
5. 混合状态：S1 skill、S2 app、S3 off。
6. retry 后新 policy 覆盖旧 policy。
7. JSON 损坏：不抛错，unknown。
8. 多 trace 同 pipelineRunId：不跨 trace 拼接。
9. 负向断言：`ownership=skill` 时禁止返回 guidance-pack 计数。

### Task 4 — Electron 真实 UI 验证器

升级 `scripts/verify-deai-guidance-ui.mjs`：

1. Run A：app 注入路径保留，作为已验证路径。
2. Run B：skill 接管，无 `deai-guidance-pack`，断言徽章与 S1/S2/S3 行显示接管。
3. Run C：`generation=off`。
4. Run D：无事件，断言 unknown 且不空白、不崩溃。
5. Run E：混合状态 S1 skill / S2 app / S3 off。
6. 每个隔离 run 独立 pipelineRunId/traceRunId，禁止跨 run 事件污染。
7. 断言真实点击正文页签后徽章/反馈可见。
8. 断言页面无相关 console/page error。
9. 启动前校验 `dist-renderer` 新鲜度，旧产物拒绝执行。
10. `finally` 清理 Electron 与临时 profile。

### Task 5 — 旧语义清零

1. 直接升级 `_audit/FOLDER_SKILL_DEAI_MENTOR_GUIDE_2026-11-01.md`：
   - 第 10 节改为“以 `deai-injection-policy` 判 owner，以 `deai-guidance-pack` 判 app 注入量”。
   - 新增每 SKILL 独立契约、混合状态、retry 覆盖规则。
   - 测试命令更新为 V6.2 命令。
2. 不新建 `..._V6_1.md` 或 `..._V6_2.md` 手册，避免双版本并存。
3. `rg` 反查“一律以 deai-guidance-pack 为准”必须清零。
4. 2026-10-29 契约参考文档保留，但加导航说明：运行语义以 2026-11-01 手册为准。
5. `PipelinePanel.vue:5840` 旧日志承诺同批更新。

### Task 6 — agent 路径对账

1. 当前 `rg "callApiWithAgentVariant\("` 显示无生产调用点，只登记结论。
2. 若确认死接口，作为独立后续清理项，不混入本 diff。
3. 若发现隐藏生产入口，必须补 `meta.deai` 传递与 policy 事件断言后再接线。
4. 禁止测试传 `null` 冒充真实 meta 消费。

### Task 7 — 台账、日志与收尾

新增：

- `_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-01_deai-guidance-visible-closure-v6-2.md`
- `_audit/DEV_LOG_2026-11-01_deai-guidance-visible-closure-v6-2.md`

收尾门禁：

1. `npm run build:vue`
2. `npx vitest run src/services/deaiGuidanceDisplay.spec.ts src/components/pipeline/__tests__/deai-injection-policy.spec.ts src/services/skillDeaiContract.spec.ts src/services/deaiChainVariantIntegration.spec.ts`
3. `node scripts/verify-deai-guidance-ui.mjs`
4. `rg` 旧语义清零。
5. `git diff` 逐行审。
6. 版本升级 3.110.15。
7. Git 提交：`feat(deai): render per-skill guidance ownership states`。
8. 台账七节全部落证。
9. 安装包、客户机实测、live API 质量效果不在本轮声明；B6 教学有效性保持 `provisional`。

## 4. 成熟度评估

执行器/工具层：成熟。纯函数 + 单一服务文件 + trace 结构不变。

应用方案/交互闭环：成熟。每 SKILL 可视 + 链级聚合，不回滚契约。

实现接线：成熟。已核对 PipelinePanel 现有徽章、反馈、事件源和 agent 路径。

验证标准：成熟。单元、混合状态、真实 Electron UI、旧语义清零、五态可达。

## 5. 明确不做

- 不改 `resolveDeaiPromptForSkillStep` 的退场行为。
- 不改 folder SKILL 模板与方法论内容。
- 不改手动降AI功能。
- 不做 live API 生成质量证明。
- 不把 `callApiWithAgentVariant` 死接口清理混入本 diff。

## 6. 用户确认点

1. 状态模型采用“每 SKILL 独立 + 链级 mixed”聚合，是否确认？
2. 旧手册直接升级，不另建 V6.1/V6.2 并存版本，是否确认？
3. `callApiWithAgentVariant` 若确认死接口，作为独立后续清理项，是否确认？

## 7. 反向质询

1. 为什么必须换状态模型？三个 folder SKILL 的 `meta.deai` 独立，单一状态会把混合契约压扁成错误显示。
2. 为什么不能伪造 `deai-guidance-pack`？那会把 SKILL 接管冒充应用注入，违反 G0.11。
3. 为什么不新建手册版本？同一语义禁止多处维护，直接升级现有手册，避免新旧并存。
4. 为什么 agent 路径只对账不修改？当前无生产调用点；混入死接口清理会扩大爆炸半径。
5. 效率是否变差？UI 投影只读已保存 trace，不进入请求链路，无额外 API 成本。
6. 是否宣称降AI效果？不宣称。质量效果仍受 B6 `provisional` 限制。
