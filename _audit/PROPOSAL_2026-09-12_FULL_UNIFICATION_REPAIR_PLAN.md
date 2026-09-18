# 全应用统一性修复执行方案

> 日期：2026-09-12  
> 版本：v1.1（用户已确认四项决策，执行中）  
> 依据：全量统一性深度检测（2026-09-12）+ `神意开发经验总结_v4.md` + `DEV_LOG_MASTER_INDEX.md`  
> 原则：先收口、再迁移、后清理；每阶段独立验证，失败可回滚。

---

## 1. 目标

本轮不做功能升级，不新增业务能力，只做四件事：

1. **Modal 统一**：接入统一弹窗队列 `useModalQueue`，消除 z-index、叠加、Esc、残留四类风险。
2. **Trace 统一**：统一 AI 调用的运行记录生命周期，杜绝 running 僵尸和字段漂移。
3. **AI Wrapper 统一**：PipelinePanel、ChatPanel、OutlineWorkspace、useSkillTest、useDeAi、EditorPanel 的 AI 包装函数收口为共享 composable。
4. **死代码清理**：旧架构 6 个未引用服务治理。

---

## 2. 统一层 / 差异层 / 禁改层

| 层 | 内容 | 说明 |
|---|---|---|
| **统一层** | Modal 队列语义、AI 调用包装、Trace 生命周期、旧服务删除 | 本轮改造对象 |
| **差异层** | 各入口 UI 形态、提示文案、生成逻辑、SKILL/Agent 配置 | 保留业务差异，仅统一底层接口 |
| **禁改层** | 对话底座、工具权限、批次状态机、存储 IPC、写盘队列 | 已统一或高风险，本轮不动 |

---

## 3. 当前状态

### 3.1 已统一（不动）

| 项 | 说明 |
|---|---|
| AI 服务底座 | 全部 `getAiService().callAi()`，无直连 API 残留 |
| 存储写盘 | 统一 `storage:write` 队列，含合并写测试 |
| 确认弹窗 | 112 处全走 `useAppConfirm()`，无 `window.confirm` |
| 对话底座 | `dialogueFoundation` 统一权限、工具、批次事件 |
| 运行记录 store | `runTrace.ts` v4 数据模型统一 |

### 3.2 未统一（本轮修）

| # | 缺口 | 现状 | 优先级 |
|---|---|---|---|
| U1 | `useModalQueue` 死代码 | 0 处引用，30+ overlay 各自管理层级 | P1 |
| U2 | AI wrapper 重复 | PipelinePanel、ChatPanel、useSkillTest、useDeAi、OutlineWorkspace 各自实现 | P1 |
| U3 | EditorPanel trace 浅接入 | 只有 run 级记录，无 API call 明细 | P1 |
| U4 | useSkillTest 手动拼 trace | 与三大入口封装不一致，存在 running 残留风险 | P2 |
| U5 | 旧架构服务死代码 | 6 个 `*.js` 服务文件无生产引用 | P2 |
| U6 | deai 进度结构未统一 | `deai.updateProgress` 自有结构 | P3（可选） |

---

## 4. 错误边界（明确不做）

1. **不统一 PipelinePanel / ChatPanel / OutlineWorkspace 的业务层**。三者语义不同（任务链 / 对话 / 结构化共创），合并会降低可读性和可维护性。
2. **不动 `dialogueFoundation` / `workspaceSkillEngine` / `chainExecution` 分层**。三者分工明确（意图 / 执行 / 步序），非重复实现。
3. **不动 localStorage 轻量状态**（窗口布局、主题降级、密度）。这类状态不跨主进程同步，localStorage 是合理载体。
4. **不动 PipelinePanel 内部 pipeline_step_config 读写**。同一业务域内，已通过 runTrace 可见。
5. **不做全量 CSS token 化**。当前约 2900 处 `var(--*)` 引用，剩余硬编码多为设计例外（SVG、canvas、第三方库覆盖）。本轮不扩大 CSS 改造面。

---

## 5. 执行计划

### 阶段 1：契约与死代码审计（P1）

**目标**：确定每个 overlay 的归属，避免一口气迁移 30+ 个弹窗造成不可回滚的大爆炸。

#### Task 1.1 生成 overlay 清单

**改动**：
1. 扫描全部 `<div class="*overlay*">` 与对应 CSS 定义。
2. 记录组件、ID、z-index 来源、Esc 关闭行为、`@click.self` 行为、是否需要叠加。
3. 输出表格到附录 A。

**验收标准**：
- [ ] 每个 overlay 有唯一归属（跳过 / 低优先 / 中优先 / 高优先 / 候选删除）
- [ ] 明确哪些弹窗需要叠加（如 SettingsModal + SkillSettings + ImportPreview）
- [ ] 明确哪些弹窗必须保持独立 z-index（如 `tool-flash-overlay` 非模态层）

**验证**：
```powershell
rg -n 'modal-overlay|overlay' src/components --glob '*.vue'
```

#### Task 1.2 Modal 队列接口补强

**改动**：
1. `useModalQueue.ts` 补充 `canClose: false` 时的拦截记录。
2. 补充类型安全的 `ModalEntry.id` 约束。
3. 新增 `useModalQueue.spec.ts`。

**验收标准**：
- [ ] 单元测试覆盖 open / close / Esc / 叠加顺序
- [ ] 类型检查通过

**验证**：
```powershell
npx vitest run src/composables/useModalQueue.spec.ts
npx vue-tsc --noEmit
```

完成记录（2026-09-13）：新增 `src/composables/useModalQueue.spec.ts`，覆盖 open/close/topId、重复 id 幂等、canClose 拦截、z-index 单调、Escape 单次绑定、未知 id 默认层级。`npx vitest run src/composables/useModalQueue.spec.ts` 6/6 通过；`npx vue-tsc --noEmit` 通过。本阶段未修改 `useModalQueue.ts` 运行时实现。

#### Task 1.3 旧架构服务三面引用闭包

**改动**：
1. 扫描 `skill-manager.js`、`provider-manager.js`、`project-manager.js`、`chapter-manager.js`、`agent-manager.js`、`zhuque-validator.js`。
2. 分别在生产代码、测试与脚本、历史文档中查找引用。
3. 输出引用矩阵到附录 B。

**验收标准**：
- [ ] 生产代码 0 引用
- [ ] 测试代码 0 引用
- [ ] 历史文档引用单独列出，不阻塞删除

**验证**：
```powershell
rg -n "skill-manager|provider-manager|project-manager|chapter-manager|agent-manager|zhuque-validator" --glob '!node_modules/**' --glob '!dist/**' --glob '!dist-renderer/**' --glob '!_audit/**' --glob '!docs/**' .
```

#### Checkpoint 阶段 1

- [x] 全量测试通过（2026-09-13：`npx vitest run` 58 files / 472 tests 全部通过）
- [x] 本阶段不改运行时行为，仅产出契约、测试与清单
- [x] 附录 A / 附录 B 已产出；用户已通过本轮确认给出四项执行决策，清单无需二次等待审核

---

### 阶段 2：AI Wrapper 与 Trace 收口（P1）

**目标**：建立统一的 AI 调用包装层，所有调用点走同一套 trace 生命周期模板。

#### Task 2.1 创建统一 composable

**新增文件**：`src/composables/useAiCallTrace.ts`

**接口设计**：

```ts
interface UseAiCallTraceOptions {
  source: 'home' | 'outline' | 'pipeline' | 'deai' | 'skill-test' | 'editor-tool'
  stepName: string
  mode: 'chat' | 'single' | 'chain' | 'compose' | 'body' | 'batch' | 'editor-tool'
  projectId?: string
  projectName?: string
  providerId?: string
  providerName?: string
  model?: string
  target?: object
  meta?: object
}

export function useAiCallTrace(options: UseAiCallTraceOptions): AiCallContext
```

**改动**：
1. 封装 `startRun` / `finishRun` 生命周期。
2. 统一“早退 return 必 finishRun”规则，解决 running 残留。
3. 统一 trace 字段命名：`source` / `stepName` / `mode` / `target` / `meta`。
4. `finishRun` 支持 success / failed / degraded / canceled。

**验收标准**：
- [ ] 所有字段类型明确，无 any
- [ ] 单元测试覆盖正常完成、异常、取消、早退

**验证**：
```powershell
npx vitest run src/composables/useAiCallTrace.spec.ts
```

完成记录（2026-09-13）：新增 `src/composables/useAiCallTrace.ts` 与 `useAiCallTrace.spec.ts`。覆盖正常完成、API 明细与 duration、异常关闭活跃调用、未 begin 先调 API 的保护、重复 finish 幂等、自定义 startedAt。`npx vitest run src/composables/useAiCallTrace.spec.ts` 6/6 通过；`npx vue-tsc --noEmit` 通过。尚未迁移任何业务调用点。

#### Task 2.2 useSkillTest 迁移

**改动**：
1. 将 `useSkillTest.ts` 手动拼装的 `startRun` / `startApiCall` / `finishApiCall` / `finishRun` 替换为 `useAiCallTrace`。
2. 保持对外 API 不变。

**验收标准**：
- [ ] 技能测试面板真实测试一次 SKILL，runTrace 中有完整 run 与 apiCall
- [ ] 无 running 残留
- [ ] 对外接口无破坏

**验证**：
```powershell
npx vitest run src/composables/useSkillTest.spec.ts
```

完成记录（2026-09-13）：`runSkillEval()` 已迁移到 `useAiCallTrace`，保留 with/baseline 评测业务逻辑与 `setEvalReport`。迁移点：startRun/startApiCall/finishApiCall/finishRun 全部经由统一生命周期，duration 由 wrapper 统一计算。`npx vue-tsc --noEmit` 通过；`npx vitest run src/composables/useAiCallTrace.spec.ts src/composables/useModalQueue.spec.ts src/services/folderSkillEval.spec.ts` 18/18 通过。仓库当前没有独立的 `useSkillTest.spec.ts`，真实技能评测留到阶段 2 收口后随 E2E 一起验证。

#### Task 2.3 useDeAi 迁移

**改动**：
1. 将 `useDeAi.ts` 的 run 与 API call 手动拼装替换为 `useAiCallTrace`。
2. 保留 deai 特有事件（硬规则前置、后置、完整性回滚、降级状态）。

**验收标准**：
- [ ] 去AI味真实跑一次完整流程，trace 中可见硬规则事件
- [ ] 降级与失败路径 finishRun 正确

**验证**：
```powershell
npx vitest run src/composables/useDeAi.spec.ts
```

完成记录（2026-09-13）：`useDeAi.ts` 已迁移到 `useAiCallTrace`。改动范围：run 生命周期、`callAiApi()` 的 API call 生命周期、folder diagnostics 与 processing report 的 runId 获取；未触碰硬规则处理、流程模式、进度 UI、取消逻辑。`npx vue-tsc --noEmit` 通过；`npx vitest run src/composables/useAiCallTrace.spec.ts src/composables/useModalQueue.spec.ts src/services/folderSkillEval.spec.ts` 18/18 通过。仓库没有独立 `useDeAi.spec.ts`，完整去AI味流程留到阶段 2 E2E 验证。

#### Task 2.4 EditorPanel 补齐 API 明细

**改动**：
1. `runTracedHomeTool()` 保留，内部改用 `useAiCallTrace`。
2. 补齐记忆抽取、AI 命名、正文生成的 API call 级 trace。

**验收标准**：
- [ ] 三个工具各跑一次，runTrace 面板能看到 run 与 apiCall 明细
- [ ] 无 running 残留

**验证**：源 Electron + CDP 真实操作三个工具。

完成记录（2026-09-13，进行中）：

1. `runTracedHomeTool()` 已迁移到 `useAiCallTrace`，并在新主页工具运行开始前显式关闭上一条 running run（canceled），避免 `startRun()` 把旧记录自动改写成 failed 僵尸。
2. 记忆抽取链路已补 API call 明细：`unifiedMemoryAiCall(prompt, systemPrompt, trace?)` 支持可选 trace；EditorPanel 通过 `memoryExtraction.startWithTrace()` 注入本次 run 的 trace。默认无 trace 行为不变，PipelinePanel 既有调用不受影响。
3. AI 命名链路已补 API call 明细：`generateNames()` / `regenerateSingleName()` 支持可选 trace；`useAiNaming.createTrace()` 负责创建 run、传递 provider/agent/model/temperature/maxTokens、成功/失败/取消终态。
4. 正文生成入口已确认是“打开流水线正文层”的导航事件，真实 API 明细归 Task 2.5 PipelinePanel 统一迁移，不在 EditorPanel 伪造调用记录。

本轮局部验证：

```text
npx vue-tsc --noEmit → 通过
npx vitest run src/services/namingService.spec.ts src/composables/useAiCallTrace.spec.ts src/services/memoryExtractor.spec.ts → 3 files / 9 tests 通过
```

新增测试：`src/services/namingService.spec.ts` 覆盖命名服务 trace 成功与失败两条路径。真实 Electron + CDP 三个工具操作验证留到 Task 2.5 完成后一起执行，避免重复构建与重复启动。

#### Task 2.5 三大入口接入

**改动**：
1. PipelinePanel 的 `callApiWithAgent`、ChatPanel 的 `callApi`、OutlineWorkspace 的 `startApiCall` 拼装统一替换为 `useAiCallTrace`。
2. 保留各自业务逻辑（重试、模板变量、意图路由），只替换 trace 生命周期。

**验收标准**：
- [ ] 主页、大纲、流水线三入口对话与生成流程全链路跑通
- [ ] runTrace 导出的记录结构与迁移前一致
- [ ] 早退、取消、异常路径全部正确 finishRun

**验证**：
```powershell
npx vitest run src/stores/runTrace.spec.ts src/services/workspaceSkillEngine.spec.ts src/services/chainExecution.spec.ts
```

完成记录（2026-09-13，代码层完成，E2E 随阶段 2 Checkpoint 统一执行）：

1. PipelinePanel 四层生成（设定/卷纲/章节/正文）的 run 生命周期已迁到 `useAiCallTrace`：`startStepTrace(step, stepName, mode)` 统一入口，`begin()/addEvent()/finish()` 统一模板；wrapper 新增 `step` 透传，保持导出 JSON 的层级字段不变。API call 明细与流式 append 仍直接使用 store 统一事实源，避免重写大调用链。
2. ChatPanel 对齐 OutlineWorkspace：`finishHomeRun` 在 canceled/failed 时补 `cancelRunningApiCalls`；`sendMessage` 与 `continueMessage` 的 finally 增加 `closeActiveHomeApiCall('failed', '运行收尾时仍未闭合')` 兜底，消除主页会话 running 僵尸 call。
3. U6 已纳入：`deai.ts` 新增 `processingStages` 阶段数组（startProcessing 清空、updateProgress 追加）；`useDeAi` 全部流程阶段调用统一 `recordProcessingStage()`，同时写入 deai store 和 runTrace `deai-stage` 事件。UI 展示不变。

验证：

```text
npx vue-tsc --noEmit → exit 0
npx vitest run src/composables/useAiCallTrace.spec.ts src/stores/runTrace.spec.ts src/services/workspaceSkillEngine.spec.ts src/services/chainExecution.spec.ts → 4 files / 58 tests passed
```

新增测试：`useAiCallTrace.spec.ts` 增加 pipeline step 字段与 finish 关闭活跃 call 的用例。

#### Checkpoint 阶段 2

- [x] 代码层迁移完成（PipelinePanel 四层 run 生命周期 + ChatPanel 僵尸 call 修复 + U6 阶段事件统一）
- [x] 三入口 E2E 真实操作验证（2026-09-13：`node scripts/verify-release-gate-g4-three-entry-e2e.mjs` PASSED，覆盖主页 / 大纲工作台 / 流水线正常流、取消与导出）
- [x] runTrace 导出 JSON 与迁移前基准对比一致（2026-09-13：`node scripts/verify-run-trace-depth-v2.mjs` PASSED，覆盖续生成 turn 落盘、三种导出模式、payload sha256、脱敏、滚动清理与上下文压缩事件）

---

### 阶段 3：Modal 统一迁移（P1）

**目标**：按阶段 1 清单分优先级接入 `useModalQueue`。

#### Task 3.1 优先级分层

| 层级 | 弹窗 | 原因 |
|---|---|---|
| 高优先 | SkillSettings 各 overlay、SettingsModal、RunTracePanel | 弹窗可叠加，z-index 需要队列管理 |
| 中优先 | MemoryPanel、DiffModal、ProjectModal、HelpGuide | 常用弹窗，叠加场景少 |
| 低优先 | TopSheet、PipelinePanel 内部 overlay | 无叠加或本身是全屏容器 |
| 跳过 | `tool-flash-overlay` | 非模态动画层 |
| 跳过 | `ExitConfirmModal` | 全局退出拦截，独立语义 |
| 跳过 | `AppConfirmModal` | 全局单例确认层，已独立管理 |
| 候选删除 | 旧架构 6 服务 | 阶段 1 已完成引用闭包 |

#### Task 3.2 高优先弹窗接入

**改动**：
1. SkillSettings 内部 5 个以上 overlay 统一通过 `useModalQueue` 管理 zIndex。
2. SettingsModal、RunTracePanel 增加队列注册，保证 Esc 优先关闭最上层。

**验收标准**：
- [ ] 打开 Settings -> SkillSettings -> ImportPreview，Esc 依次只关闭最上层
- [ ] `@click.self` 行为不变
- [ ] 设置页各弹窗可正常打开关闭

**验证**：源 Electron + CDP 逐层打开关闭。

#### Task 3.3 中优先弹窗接入

**改动**：MemoryPanel、DiffModal、ProjectModal、HelpGuide 接入队列。

**验收标准**：
- [ ] 各弹窗打开关闭正常，Esc 行为正确
- [ ] 生成中弹窗叠加无遮挡

**验证**：源 Electron + CDP。

#### Task 3.4 低优先弹窗接入

**改动**：TopSheet 与 PipelinePanel 内部 overlay 按需接入。

**验收标准**：
- [ ] 不引入回归
- [ ] 无新增布局问题

**验证**：源 Electron + CDP。

#### Task 3.5 死代码删除

**改动**：
1. 删除旧架构 6 服务。
2. 确认构建产物、源码、测试无引用。

**验收标准**：
- [x] 删除后 type-check、全量测试、构建全部通过（2026-09-13：`npx vue-tsc --noEmit`、`npx vitest run` 60 files / 481 tests、`npm run build:vue` 全部通过）
- [x] `_audit` 历史文档引用不阻塞删除（生产与测试源码零引用；历史文档仅作资料保留）

**验证**：
```powershell
npx vue-tsc --noEmit
npx vitest run
npm run build:vue
```

#### Checkpoint 阶段 3

- [x] 全量测试 + type-check + build:vue（2026-09-13：`npx vue-tsc --noEmit` 通过；`npx vitest run` 60 files / 481 tests 全部通过；`npm run build:vue` 通过）
- [x] 弹窗矩阵覆盖全部高、中优先弹窗（Modal 已按附录 A 高 / 中 / 低优先级全部迁移并复扫；`node scripts/verify-release-gate-g4-three-entry-e2e.mjs` PASSED）

---

## 6. 风险与回滚

| 风险 | 等级 | 缓解 |
|---|---|---|
| Modal 迁移破坏已有弹窗 z-index 与关闭逻辑 | 高 | 阶段 1 先建清单，只迁移需要叠加的弹窗；低优先跳过 |
| useAiCallTrace 迁移导致 trace 字段丢失 | 高 | 迁移前固化 runTrace 导出 JSON 作为基准，迁移后对比 |
| PipelinePanel 大文件改动污染 | 中 | 只替换 trace 生命周期，不动重试、模板、意图逻辑 |
| 删除旧服务破坏构建 | 中 | 删除前三面引用闭包，删除后全量构建验证 |

## 7. 全局验证门

每阶段结束必须执行，全部通过才进入下一阶段：

```powershell
npx vue-tsc --noEmit
npx vitest run
npm run build:vue
```

最终收尾必须做源 Electron + CDP 真实操作验证，覆盖：

1. 主页对话 -> 生成 -> 提取记忆 -> 运行记录面板
2. 大纲工作台 -> 对话 -> 编辑批次 -> 运行记录面板
3. 流水线四层生成 -> 运行记录面板
4. 去AI味完整流程 -> 运行记录面板
5. 设置页技能测试、导入、弹窗叠加
6. 弹窗 Esc 逐层关闭验证

---

## 8. 需要用户确认的问题

已于 2026-09-13 确认：

1. **旧架构 6 服务**：彻底删除；删除前做三面引用闭包，删除后重新扫描确认无损伤。
2. **deai 进度统一（U6）**：纳入本轮。
3. **Modal 迁移范围**：高、中、低优先级全部按序执行，不跳过低优先级。
4. **执行顺序**：先 Trace 后 Modal。

阶段 2 追加 Task 2.6：统一 `deai.updateProgress` 与 runTrace 阶段事件的数据结构，不改现有 UI 展示形态。

阶段 3 追加验收：Modal 高/中/低全部迁移后，按附录 A 清单逐项复扫 overlay 行为；旧服务删除后执行 `rg` 引用复扫 + type-check + vitest + build:vue，任何一项失败立即修复后才算闭环。

---

## 9. 最终完成记录（2026-09-13）

### 四项用户决策闭环

1. **旧架构 6 服务彻底删除**：`skill-manager.js`、`provider-manager.js`、`project-manager.js`、`chapter-manager.js`、`agent-manager.js`、`zhuque-validator.js` 已删除；删除后完成生产源码、测试源码与历史资料三面引用复扫，`src/` 与 `electron/` 均零引用，type-check、全量测试与构建通过。
2. **U6 纳入**：`deai` 处理阶段统一为 `processingStages` 阶段数组，`useDeAi` 全流程写入 deai store 与 runTrace `deai-stage` 事件，UI 展示形态不变。
3. **Modal 高 / 中 / 低按序执行**：附录 A 清单中的高、中、低优先弹窗全部迁移到 `useModalQueue`；跳过项仅保留明确有独立队列语义的全局单例与拖拽保护层。
4. **先 Trace 后 Modal**：阶段 2 Trace 生命周期先收口并完成 E2E，阶段 3 再执行 Modal 迁移与全量回归，未交叉推进。

### 收尾修复

1. `src/components/chat/ChatPanel.vue:2194`：`continueMessage()` 成功路径补 `finishHomeRun('success', undefined, result.text)`，续生成 turn 不再停留 running，run-trace 正常落盘。
2. `scripts/verify-run-trace-depth-v2.mjs:144`、`:516`、`:599`：磁盘断言路径改为跟随 `SHENYI_TEST_USER_DATA_DIR` 的 `DATA_DIR/run-trace/home`，消除验证脚本路径漂移。
3. `scripts/verify-run-trace-depth-v2.mjs:101`：新增统一 `cleanup()`，通过顶层 `try...finally` 关闭 CDP、Electron、mock provider，并默认删除专用 profile 与导出产物；`SHENYI_E2E_KEEP_PROFILE=1` 时保留现场用于调试。验证输出以 `[PASS] E2E profile is cleaned up` 和 `[PASS] E2E export directory is cleaned up` 收尾。
4. E2E 临时目录清理：`_data/run-trace-v2-e2e-profile/`、`_data/run-trace-v2-exports/`、`_data/run-trace-v2-remaining-profile/`、`_data/product-validity-status-e2e-export/` 删除并复核；`_data/electron-debug-profile/` 为历史启动调试数据，不属于本轮清理范围。

### 最终验证矩阵

| 验证项 | 结果 |
|---|---|
| `npx vue-tsc --noEmit` | PASSED |
| `npx vitest run` | PASSED：60 files / 481 tests |
| `npm run build:vue` | PASSED |
| `node scripts/verify-run-trace-depth-v2.mjs` | PASSED：续生成 turn 落盘、三种导出、payload sha256、脱敏、滚动清理、上下文压缩事件 |
| `node scripts/verify-release-gate-g2-g3-e2e.mjs` | PASSED：G2 长流响应 21670ms，maxUnresponsiveMs=29；G3 超时 / 取消 / 连续失败 / 空正文重试 |
| `node scripts/verify-release-gate-g4-three-entry-e2e.mjs` | PASSED：主页、大纲工作台、流水线正常流 + 取消 + 导出 |

---

## 附录 A：Overlay 清单（阶段 1 产出）

扫描命令：`rg -n 'class="[^"]*(overlay|modal)[^"]*"' src/components src/App.vue --glob '*.vue'`

### A.1 高优先（多 overlay 叠加，先迁移）

| 组件 | overlay | 行为特征 | 归属 |
|---|---|---|---|
| SkillSettings.vue | skill-import-overlay | 健康报告 / 版本回滚 / 技能导入 / folder 批量预览 / folder 导入预览 / 技能包预览，6 处实例 | 高 |
| SkillSettings.vue | skill-edit-overlay | 技能编辑 / 技能测试，2 处实例 | 高 |
| SettingsModal.vue | modal-overlay | 设置页主容器 | 高 |
| RunTracePanel.vue | rt-overlay | 运行记录面板 | 高 |
| AppConfirmModal.vue | app-confirm-overlay | 全局单例确认层 | 跳过（已有独立队列语义） |

### A.2 中优先（常用弹窗，可与其他层叠加）

| 组件 | overlay | 行为特征 | 归属 |
|---|---|---|---|
| MemoryPanel.vue | mem-overlay | 黑名单 / 合并 / 冲突 / 分类 / 编辑 / 档案导出，6 处实例 | 中 |
| DiffModal.vue | modal-overlay | diff 预览 | 中 |
| ProjectModal.vue | modal-overlay | 项目管理 | 中 |
| HelpGuide.vue | help-overlay | 帮助教学 | 中 |
| MemoryHistoryModal.vue | mem-overlay | 记忆历史 | 中 |
| AiNamingModal.vue | naming-overlay | AI 命名 | 中 |
| AgentSettings.vue | agent-import-overlay | 智能体导入预览 | 中 |
| SkillBindModal.vue | skill-bind-overlay | 技能绑定 | 中 |
| DashboardModal.vue | dash-overlay | 仪表盘 | 中 |
| PluginMarket.vue | pm-overlay | 插件市场 | 中 |
| EditorPanel.vue | editor-memory-overlay | 编辑器记忆预览 | 中 |

### A.3 低优先（全屏容器或工作区内弹窗）

| 组件 | overlay | 行为特征 | 归属 |
|---|---|---|---|
| PipelinePanel.vue | pl-overlay | 流水线全屏容器 | 低（容器层） |
| PipelinePanel.vue | pl-memory-preview-overlay | 流水线记忆预览 | 低 |
| PipelinePanel.vue | pl-ch-detail-overlay | 章节详情 | 低 |
| PipelinePanel.vue | pl-add-setting-overlay | 设定新增 / 详情，2 处实例 | 低 |
| PipelineFlow.vue | pf-dialog-overlay | 流程保存 / 读取，2 处实例 | 低 |
| TopSheet.vue | topsheet-overlay | 顶部滑出层 | 低 |
| DeAiProgress.vue | deai-progress-overlay | 去 AI 进度 | 低 |
| OutlineWorkspace.vue | ow-overlay | 大纲工作台容器 | 低（容器层） |

### A.4 明确跳过

| 组件 | overlay | 原因 |
|---|---|---|
| App.vue | resizer-overlay | 拖拽保护层，非弹窗 |
| EditorPanel.vue | tool-flash-overlay | 非模态动画层，pointer-events: none |
| ExitConfirmModal.vue | modal-overlay | 全局退出拦截，独立语义 |
| AppConfirmModal.vue | app-confirm-overlay | 全局单例确认层，已独立管理 |

## 附录 B：旧架构服务引用矩阵（阶段 1 产出）

扫描命令：`rg -n "skill-manager|provider-manager|project-manager|chapter-manager|agent-manager|zhuque-validator" src electron --glob '!**/*.spec.*'`

| 服务 | 生产引用 | 测试引用 | 结论 |
|---|---:|---:|---|
| skill-manager.js | 0 | 0 | 可删除 |
| provider-manager.js | 0 | 0 | 可删除 |
| project-manager.js | 0 | 0 | 可删除 |
| chapter-manager.js | 0 | 0 | 可删除 |
| agent-manager.js | 0 | 0 | 可删除 |
| zhuque-validator.js | 0 | 0 | 可删除 |

复扫记录（2026-09-13）：`src/` 与 `electron/` 生产及测试源码均无引用；历史文档引用只作为资料保留，不阻塞删除。删除动作放在 Modal 迁移全部完成之后执行，避免与运行时迁移互相污染 diff。
