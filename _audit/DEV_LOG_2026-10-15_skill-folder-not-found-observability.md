# 2026-10-15 folder SKILL 路径失效观测修复

## 目标

folder SKILL 的绑定目录被移动或删除后，应用必须立即失败并给出可修复信息：技能名、原因、原绑定路径、修复动作。不允许把失败伪装成供应商请求失败，也不允许静默回退。

## 交付内容

- `realSkillTypes`：`RealSkillLoadResult` 新增结构化 `failure`（code、message、folderPath、action）。
- `realSkillLoader`：Electron IPC 失败响应包装为结构化 failure；桥不可用、路径缺失、目录不存在、加载异常均有明确修复指引。
- `skillRouter`：新增 `fallback` 结构与 `formatSkillFallback()`；旧 `fallbackReason` 仅兼容保留，读取面均改为结构化优先。
- 新增 `pipelineSkillPreflight`：生成步骤执行前预检 folder SKILL 目录，失败即 fail-fast，输出技能名、原因、路径、修复动作。
- `PipelinePanel`：预检失败写入 `skill-load-failed` error 事件和步骤日志；`startApiCall` 移到 SKILL 加载成功之后，消除误导性 `api-start`。
- `workspaceSkillEngine`：文本回退通过 `onSkillFallback` 显式暴露；`ChatPanel`、`OutlineWorkspace`、`useDeAi`、executor、orchestrator、eval、test 均消费结构化失败。

## Electron 级真实验证

命令：`node scripts/verify-skill-folder-not-found-electron.mjs` → `===== SKILL FOLDER NOT FOUND ELECTRON PASSED =====`

验证链路：

1. 创建真实 folder SKILL 目录并绑定到卷纲层。
2. 启动可见 Electron 窗口，通过真实 UI 完成大纲确认。
3. 迁移 SKILL 目录，模拟用户移动文件夹。
4. 通过真实 UI 点击 `AI生成全卷`。
5. 断言 run 终态、事件、UI 文案、provider 请求。

结果：run `run-1792078446143-14` 为 `failed`；`apiCallCount=0`；`physicalCallCount=0`；`generationRequestCount=0`；目录迁移后 provider 请求为 0。UI 直接显示：

```text
failed: 技能：已迁移卷纲技能
错误：folder-not-found SKILL 文件夹不存在或不是目录
路径：D:\codex\novel-workshop-vue3\_data\skill-folder-not-found-profile\skills\moved-volume-skill
请到技能设置中重新选择该技能的文件夹
```

证据：[_audit/verification-skill-folder-not-found-electron/report.json](_audit/verification-skill-folder-not-found-electron/report.json)

## 诚实边界

- 本轮解决的是“路径失效的观测与 fail-fast”，不改变 folder SKILL 的执行能力本身。
- Electron 验证使用本地 mock provider；其目的是证明“不发物理请求”，不是验证供应商行为。
- 大纲确认阶段有 1 次独立的风格分析请求，发生在目录迁移前，与卷纲生成分离；测试已按阶段拆分，未把它算作生成请求。
- 版本号保持 3.89.0；本任务按台账决策登记为 3.89.0 内观测缺陷修复。

## 台账

- 七节台账：[_audit/TASK_LEDGERS/2026-10-15_skill-folder-path-observability.md](_audit/TASK_LEDGERS/2026-10-15_skill-folder-path-observability.md)
