# P7-3 章节断点续跑报告

## 结论

**部分完成，不能交付为通过。**

## 对账结果

| 检查项 | 状态 | 证据/说明 |
|---|---|---|
| 章节断点数据结构 | 已实现 | `src/stores/pipeline.ts` 与 `src/components/pipeline/PipelinePanel.vue` |
| 项目+卷+目标章数隔离 | 已实现 | 章节生成匹配 `projectId`、`volumeId`、`total` |
| 批次成功后保存 | 已实现 | `saveChapterBreakpoint('progress')` |
| 失败阶段保存 | 已实现 | `retry-wait`、`failed`、`failed-validation` |
| 取消请求 | 已实现 | `AbortSignal` 接入章节 API |
| 手动章节不被覆盖 | 已实现 | 保留未标记 `pipelineGenerated` 的章节 |
| 断点不匹配不清空旧生成章节 | 已实现 | 现有生成章节先保留 |
| 真实 API 失败后保存断点 | 部分验证 | 受控链路曾保存 chain 断点，但未完成章节直接 API 场景 |
| 杀 Electron 后重启续跑 | 未核销 | 未取得第一批/失败/重启/续跑完整证据 |
| 补充生成联合断点 | 未核销 | 未取得真实章节结果和请求提示证据 |
| 最终清除断点并 done | 未核销 | 未完成完整重启续跑 |
| 隔离项目清理 | 已验证 | UI 删除后项目键和 lastProjectId 消失 |

## 工程验证

`npm run build:vue` 成功：Vite 输出 `175 modules transformed` 并生成 `dist-renderer`。

`npm run type-check` 未通过，错误分布在已有 `window.electronAPI` 声明、`MemoryPanel.vue`、`OutlineWorkspace.vue`、`PipelinePanel.vue` 等文件；本报告不将类型检查写成通过。

## 关键失败原因

验证脚本第一次继承了设定层 chain Skill 配置，第二个 Skill 未命中受控路由，导致验证停在设定层。随后隔离项目清理已通过 UI 完成，但重新创建隔离项目时 UI 前置未产生项目 ID。验证不得通过直接写 `wa_project_*` 或 `wa_pipeline_breakpoint` 来替代用户操作。

## 交付判定

P7-3：**部分通过/未核销**。实现不能替代真实行为证据。

## 续验收增补（2026-08-22）

- 本轮通过源文件启动器和 CDP 复验；生成供应商已启用，真实受控请求命中 `https://openapi.cloud-ai.cn/v1/chat/completions`。
- 验证仍被隐藏的设定层 chain Skill 截获，未进入章节层，因此章节失败保存、杀进程重启续跑、补充生成联合场景和最终清除断点仍为未核销。
- 通过项目管理 UI 清理本轮隔离项目，最终输出 `removed: 1`、`lastProjectId: null`、`breakpoint: null`。
- 结论保持：代码和构建已完成，但 P7-3 不得标记行为通过。
