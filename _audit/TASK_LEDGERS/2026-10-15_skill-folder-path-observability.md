# 任务台账：folder SKILL 路径失效观测修复

## 1. 目标与原话

- 用户原话：那我们就运行记录的缺陷来制定完善的计划，通过这次运行记录事故再推断有无其他遗留面；确认。
- 目标行为：folder SKILL 绑定目录失效时，应用 fail-fast 且错误信息包含技能名、路径、原因和修复动作；不再产生误导性 `api-start`；静默文本回退升级为显式 trace 事件。

## 2. 门禁读证

- G0.3：本任务未做 Electron 真实 UI 验证，已如实登记，不以服务层测试冒充 UI 实测。
- G0.6：方案经用户确认后执行，并覆盖事故根因、观测语义、静默降级、全消费面。
- G0.12：登记任务台账。

## 3. 路由判定

- 加入：G0.3、G0.6、G0.12。
- 排除 G1.10 权限门：本任务不改变 API 直写授权语义。
- 排除 G1.19 性能门：本任务为诊断可观测性修复，不声明生成耗时优化。

## 4. 影响圈与作者反证

- 已改面：`realSkillTypes`、`realSkillLoader`、`skillRouter`、`pipelineSkillPreflight`（新增）、`PipelinePanel`、`workspaceSkillEngine`、`ChatPanel`、`OutlineWorkspace`、`useDeAi`、`folderSkillEval`、`folderSkillTest`、`realSkillExecutor`、`skillOrchestrator` 及相关测试。
- 高危假设一：“`api-start` 等于物理请求开始”。反证：本地加载失败也会先建调用记录，误导用户认为是供应商问题；本轮已把流水线调用记录移到加载成功后。
- 高危假设二：“folder SKILL 回退文本路径可以静默”。反证：用户会误以为 folder SKILL 生效；本轮新增 `onSkillFallback` 事件面。
- 高危假设三：“只修流水线即可”。反证：executor、orchestrator、eval、test、DeAi、首页、大纲工作台都消费同一失败形态；已逐面适配。

## 5. 停止条件

- 完成：结构化错误从 Electron IPC 到 UI/trace 全链路贯通；流水线预检 fail-fast；无误导 `api-start`；新旧语义无冲突并存；受影响测试与 type-check 通过。
- 失败：裸 `folder-not-found` 继续作为用户可见错误；加载失败仍产生 API 调用记录；workspace 文本回退无事件。

## 6. 执行证据

- `npm run type-check` → exit 0。
- `npx vitest run src/services/pipelineSkillPreflight.spec.ts src/services/skillRouter.spec.ts src/services/folderSkillEval.spec.ts src/services/folderSkillTest.spec.ts src/services/realSkillExecutor.spec.ts src/services/skillOrchestrator.spec.ts` → 6 files / 73 tests passed。
- `git diff --check` → 无 whitespace 错误（仅历史 CRLF 提示）。
- `rg "fallbackReason" src` → 剩余读取均为兼容字段或结构化优先路径，无未升级的失败面。
- Electron 级目录迁移实测：`node scripts/verify-skill-folder-not-found-electron.mjs` → `===== SKILL FOLDER NOT FOUND ELECTRON PASSED =====`。
  - 真实链路：真实 folder SKILL 目录 → 绑定卷纲层 → 可见 Electron → 真实 UI 确认大纲 → 目录迁移 → 点击 `AI生成全卷`。
  - run `run-1792078446143-14`：`failed`；`apiCallCount=0`；`physicalCallCount=0`；`generationRequestCount=0`；`postRelocationRequestCount=0`。
  - `skill-load-failed` 事件为 `error` 级，detail 含 `已迁移卷纲技能`、`folder-not-found`、绑定路径、`请到技能设置中重新选择该技能的文件夹`。
  - UI 进度条直接显示同一结构化错误；证据：[_audit/verification-skill-folder-not-found-electron/report.json](_audit/verification-skill-folder-not-found-electron/report.json)。
  - 测试口径说明：大纲确认阶段存在 1 次独立的风格分析请求，发生在目录迁移前；已按阶段拆分断言，迁移后请求数为 0。

## 7. 缺口清单

- 已补 Electron 真实目录迁移实测，见第 6 节；无未闭环缺陷。
- 版本号按决策保持 3.89.0，登记为 3.89.0 内观测缺陷修复。
