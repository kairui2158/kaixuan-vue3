# DEV_LOG 2026-09-24：真实大纲 10 轮 API 直写组合实测

## 结论

使用客户提供的真实文件 `C:\Users\凯瑞\Desktop\测试\《绿潮》大纲总纲.md`（74,841 字符 / 207,309 字节，SHA-256 `7df4e2ad70836e42558cefa1f3af8849a4ed728e34ec16855a35c7bc8f924ac4`）在大纲工作台完成 10 轮 Electron 级真实 UI 组合测试。

口径采用用户确认的“10 轮，每轮同一批次完成 4 类项目”：每轮一个 `editor.write` 批次包含 5 条命令，覆盖补写、修改、删除、整节移动重排、半角标点转全角。10 轮合计 40 条真实编辑命令，全部通过。

## 验证过程

1. 真实文件导入大纲工作台，断言导入后长度与源文件一致，不截断。
2. 进入大纲共创 API 对话，每轮输入混合指令；mock 供应商先返回 `editor.write` 原生工具调用，再返回正文。
3. 每轮断言：
   - 文档保持长文档策略，`editor.document_map` 与 `editor.read_range` 均在工具面。
   - 意图为 `edit`，`editor.write` 为 write policy。
   - 逻辑 API call 关闭且带 `editor.write` surface；工具调用状态 `success`。
   - 每轮恰好 1 条 `edit-task-task-finished` 事件，direct 路径不出现任务条。
   - 编辑器最终内容与“移动 + 标点替换”的期望值逐字符一致。
   - 系统提示不出现“本轮未开放写入工具 / editor.write”的权限否认文案。
4. 导出 chat 会话 run trace，断言 10 turns、10 个逻辑 API call、20 个 physicalCalls、10 个 EditTask 完成事件。

## 本轮修正的验证脚本问题（非产品缺陷）

1. 第 10 轮复用第 1 轮已转换的半角标点段作为 target，触发产品正确的 `target_not_found` 原子拦截。修复为按当前文档状态选择 target；本轮标点段若已全角化，下一轮复用时先取全角版本，幂等转换。
2. 运行记录导出旧口径要求 10 个独立 run，但产品已按“chat 会话聚合”设计，连续对话归入 1 个 run。断言改为校验会话完整度：10 turns / 10 逻辑 API / 20 physicalCalls / 10 EditTask 事件。
3. physicalCalls 才是每个 turn 的两次真实物理请求（工具轮 + 正文轮）；逻辑 apiCalls 按 turn 聚合是设计行为，不应误报为“丢失一半调用”。

## 证据

- 验证脚本：`scripts/verify-api-direct-write-real-outline-10r.mjs`
- 执行结果：`REAL OUTLINE API DIRECT WRITE 10R E2E PASSED`
- 汇总报告：`_audit/verification-real-outline-10r/real-outline-10r-report.json`
- 导出 trace：`_audit/verification-real-outline-10r/run-trace-session-01.json`
- 截图：`_audit/verification-real-outline-10r/00-real-outline-imported.png`、`round-01-combined.png` 至 `round-10-combined.png`、`11-final-real-outline-state.png`

## 复现

```powershell
node scripts/verify-api-direct-write-real-outline-10r.mjs
```
