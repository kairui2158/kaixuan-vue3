# 2026-10-16 owner 断点生命周期事故复盘

## 事故现场

用户提交正文层运行记录 `run-trace-正文层-20261016-015556-deep`，并转达 SKILL 层七条证据链：三次正文修复 attempt 全部复用同一份旧产物，`wordCount: 2069`、`ratio: 0.5911`、`bodyPreview` 完全相同，且第 2、3 次 attempt 之间没有任何 `api-start`。供应商额度耗尽真实存在，但不是三次同文的直接原因。

## 根因

上一轮修复 `67b3ff3` 把 chain 断点写入从共享槽 `pipeline_breakpoint` 迁移到 owner 槽 `pipeline_breakpoint_owner_${ownerKey}`，但链成功终态仍调用无参 `clearBreakpoint()`，只清理共享槽。S3 成功断点永久残留在 owner 槽，`lastSuccessChainIndex = 2`。

修复循环随后再次调用 `runStepSkills`：读取 owner 槽命中残留断点，`getChainResumePoint` 计算 `legacyNext = 3`，`templates.length = 3`，for 循环零执行，直接 `return current` 返回断点中的 S3 旧产物。`targeted` 与 `full_chain` 两次修复都走这条路径，因此三次验收完全相同且零物理请求。

证据链：

- 写入 owner 槽：`src/stores/pipeline.ts` `saveBreakpoint()` 按 `data.ownerKey && data.kind !== 'chapters'` 选择槽位。
- 清理共享槽：`src/components/pipeline/PipelinePanel.vue:3390` `await pipelineStore.clearBreakpoint()` 无参调用。
- 读取 owner 槽：`src/components/pipeline/PipelinePanel.vue:2871` `refreshBreakpoint(checkpointOwnerKey)`。
- 恢复起点越界：`src/services/chainBreakpoint.ts:85-87` `legacyNext = lastSuccessChainIndex + 1`，未拒绝“已完成链”。
- 循环零执行：`src/components/pipeline/PipelinePanel.vue:2902` `for (let si = startSi; si < templates.length; si++)`。

## 我当时为什么看不见

### 方案盲区

方案目标写的是“断点按 owner 隔离”，但我只把“写入正确”当成了隔离完成。没有把 owner 槽当新状态面做四行生命周期对账：谁写入、谁读取、谁清理、终态后读取方如何拒绝旧状态。写入迁移了，清理仍停在旧语义，这属于半迁移。

### 验证盲区

上一轮 Electron 验证器把正文层 seed 成 `mode: compose`、无多个 SKILL，`runStepSkills` 根本没进 chain 分支。断言了两次物理请求和 attempt 台账，但那只证明 compose 下的修复有效，没有证明 chain 下的修复有效。验证矩阵没有覆盖 `{chain} × {成功终态后再次进入}`，而这条恰恰是本修复最可能失败的路径。

### 查账盲区

任务台账写了“无参 `clearBreakpoint()` 只在章节批次与 chain 成功终态”，把调用形态存在当成了语义正确。没有追问“无参清理实际删的是哪个槽”。如果按写入列、读取列、清理列三列对账，清理列的槽位键立刻对不上写入列，事故当时就能拦住。

## 用户提出的方向

用户明确指出三点：一是上一轮修复方案与验证需要诚实定责；二是验证盲区、方案盲区、查账盲区必须写进经验文件并设门禁；三是经验文件不能只总结应用问题，也必须总结我自己的问题。本复盘与 v8.11 门禁即按该方向落盘。

## 下次第一步

引入或迁移任何持久化状态时，先建四行生命周期对账表，再写代码；验证矩阵先填“成功终态后再次进入”这一格，再补 happy path；查账先对槽位键，再看调用形态。
