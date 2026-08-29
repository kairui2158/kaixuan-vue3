# DEV_LOG 2026-08-22 P7-2：chain 断点续跑

## 目标

验证并修复生成流水线 chain 模式的断点续跑：每个 Skill 成功后保存中间结果；后续 Skill 失败后保留断点；Electron 强制退出并重启后从失败 Skill 继续；全部成功后清除断点。

## 根因

`pipeline` store 原本只在初始化时读取 `pipeline_breakpoint`。Electron 持久化数据与项目/流水线打开时序不一致时，chain 执行使用的内存断点可能是旧值，导致从第一个 Skill 重新执行。

## 实现

- `src/stores/pipeline.ts`
  - 增加 `refreshBreakpoint()`，在执行前重新读取当前项目持久化断点。
  - 同步恢复 `breakpoint` 与章节进度。
- `src/components/pipeline/PipelinePanel.vue`
  - chain 入口调用 `pipelineStore.refreshBreakpoint()`。
  - 按 `projectId`、`step` 和 `lastSuccessChainIndex` 计算恢复起点。
  - 恢复 `lastOutput` 为下一 Skill 的上下文。
  - 每个 Skill 成功后保存断点；全部成功后清除断点。

## 行为验证记录

1. 通过真实流水线 UI 选择两个设定层 Skill，并把模式设为 `chain/串行`。
2. 受控 API 让第一个 Skill 返回 `P7_2_STEP1_OK`，第二个 Skill 返回 HTTP 503 并进入重试。
3. 失败时断点为：

```json
{
  "step": 1,
  "projectId": "proj-1787385731254",
  "lastSuccessChainIndex": 0,
  "lastOutput": "P7_2_STEP1_OK",
  "volumeIndex": 0
}
```

4. 执行 `taskkill /F /IM electron.exe /T` 后，重新启动并读取同一项目断点，断点仍存在。
5. 恢复请求计数为 `1`，请求对应第二个 Skill；第一 Skill 未再次请求；第二 Skill 请求包含第一 Skill 的输出。
6. chain 成功完成后 `generationStatus` 为 `done`，`breakpoint` 为 `null`。

## 构建

执行 `npm run build`，原始输出包含：

```text
175 modules transformed.
✓ built in 4.99s
electron-builder version=25.1.8
building block map
```

## 证据边界

- 本轮证明应用层对受控 HTTP 503 的断点保存、跨进程恢复、跳过已成功 Skill 和成功后清除逻辑。
- 不证明供应商网络稳定性。
- 本轮只验证设定层双 Skill chain，不替代章节层、多卷章节补充生成的专项断点验证。
- 收尾阶段尝试调用 `start-electron.bat` 时，当前命令载体返回“系统找不到文件”，因此本轮收尾启动器复核记为环境阻塞，不冒充通过。

## 收尾

- P7-2 临时 `p7-2-*.cjs` 脚本已删除；`_audit/tmp` 中未保留本轮临时脚本。
- Electron 进程已执行强制清理，最终核验为无残留。
- P7-3 只列计划，不在本轮执行。
