# PROPOSAL 2026-11-09 - POSTPROCESS USAGE INJECTION V1

## 1. 结论

本方案只执行一项已批准的应用侧改动：把 postProcess 物理调用的 `NormalizedUsage` 透传给 folder SKILL，并把 SKILL 返回的非阻断 `_perf` 观测字段保留到 report 与 trace。这解决的是"性能归因只有事后翻 trace、SKILL 无法即时拿到模型 usage 事实"的问题。

`deai-model-profile` 继续冻结，零代码改动。`DEAI_MODEL_PROFILE_RELEASED` 保持 `false`；统计账本不得升级为 prompt 注入。本方案不注入任何写作方法论，不改终态，不新增用户交互。

## 2. 背景与问题

### 2.1 当前链路

- `src/services/realSkillExecutor.ts:1331-1332` 当前传入的是 `candidateOutput` 字符串：
  - `const postInput = candidateOutput;`
  - `const postResult = await executeHook(pkg.script, 'postProcess', candidateOutput, diagnostics)`
- `src/services/realSkillExecutor.ts:1314` 的 `apiMeta` 已经读取 `result.usage`，说明同一作用域内规范 usage 已可用。
- postProcess 调用点位于函数级 `usage` 赋值之前，因此不能传函数级 `usage` 变量；必须传 `result.usage`。
- `src/services/realSkillExecutor.ts:42` 的 `ALLOWED_POST_FIELDS` 没有 `_perf`，folder SKILL 返回该字段时会被丢弃并记录 `hook-field-ignored`。
- `RealSkillPostProcessReport` 与 `RunTraceFolderDiagnostic.postProcessReport` 都没有 perf 字段。

### 2.2 SKILL 消费端已经存在

正文层 S1 已有消费逻辑：

- `D:/codex/玄武规划SKILL/凯旋-正文层/kaixuan-s1/script.js:460-470` 读取 `payload.usage.outputTokens` 与 `payload.usage.reasoningOutputTokens`。
- 当 reasoning/output 比例大于 `0.70` 时返回 `_perf = { warning, ratio, blocking: false }`。
- 这只是观测警告，不进入 issues，不触发重试，不改变终态。

## 3. 修复目标与边界

### 3.1 目标

1. postProcess payload 改为 `{ output: candidateOutput, usage: result.usage }`。
2. `_perf` 进入 postProcess 白名单。
3. report 与 trace 保留一个可选 `perf` 结构。
4. `_perf` 仅作为 informational 观测，不产生 issue，不阻断，不改 run 终态。
5. deai-model-profile 冻结不动。

### 3.2 非目标

- 不把 usage 注入 prompt。
- 不基于 usage 做预算拦截、自动降档或供应商切换。
- 不把 reasoning 占比变成应用侧质量裁判。
- 不修改 SKILL 脚本与 SKILL 指导手册。
- 不恢复旧内嵌改稿降 AI 语义。
- 不改动 worker 协议；payload 本身按现协议透传。

## 4. 精确改动清单

### 4.1 `src/services/realSkillExecutor.ts`

1. 第 42 行附近：
   - `ALLOWED_POST_FIELDS` 增加字符串 `'perf'` 或兼容 SKILL 实际返回的 `'_perf'`。
   - 采用 `'_perf'` 作为唯一入口，避免公开两层字段名。
2. 第 1331-1332 行：
   - `postInput` 保持为最终验收用的 `candidateOutput` 字符串。
   - executeHook payload 改为 `{ output: candidateOutput, usage: result.usage }`。
3. 第 1347-1356 行 report 构建处：
   - 从 `postResult.fields._perf` 提取。
   - 必须类型守卫：`warning` 是非空字符串，`ratio` 是有限数值，`blocking === false`。
   - 合规时 report 增加可选字段 `perf`。
   - 不合规或缺失时不写入 report，不打扰正常链路。

### 4.2 `src/services/realSkillTypes.ts`

在 `RealSkillPostProcessReport` 中新增：

```ts
perf?: {
  warning: string
  ratio: number
  blocking: false
}
```

不修改 `WorkspaceSkillRunMetaPostProcess`，因为当前没有消费点，不得制造未接线字段。

### 4.3 `src/stores/runTrace.ts`

在 `RunTraceFolderDiagnostic.postProcessReport` 中新增同名可选 `perf` 字段，只做类型和透传。不新增独立 trace 事件，不放大 payload，不重复存正文。

## 5. 已审计兼容性

### 5.1 folder SKILL 兼容面

| 位置 | 结论 |
|---|---|
| 正文层 S1 `kaixuan-s1/script.js:460-470` | 直接消费 `payload.usage`，是本方案目标消费者 |
| 正文层 S2/S3 | 使用对象兼容的 output 取值方式，usage 不消费时无影响 |
| 卷纲层、章节层、设定层 postProcess | 同样兼容对象 payload，不改 SKILL |
| `realS2ProtectedContract.integration.spec.ts:24-38` | mock 直调 hook，S2 兼容对象，无需改 |
| `electron/ipc/skill-script-worker.js:140-157` | 只执行 hook 并透传结构化结果，不约束 payload 形态 |

### 5.2 UI 展示面

- `ChatPanel.vue:2680-2717` 与 `OutlineWorkspace.vue:5597-5635` 只读 report 的既有字段，新增可选字段零破坏。
- `PipelinePanel.vue:1661-1663` 当前直接读取 report，新增可选字段零破坏。
- 本阶段不在 UI 增加展示控件；trace 可见即可。

### 5.3 测试破坏面

`src/services/realSkillExecutor.spec.ts` 中以下 10 处 postProcess mock 以字符串比较接收值，改为对象后必须同步适配：

1. 第 1120 行
2. 第 1162 行
3. 第 1199 行
4. 第 1237 行
5. 第 1289 行
6. 第 1345 行
7. 第 1428 行
8. 第 1479 行
9. 第 1548 行（执行期发现的方案外残余）
10. 第 2351 行

适配方式统一为进入 hook 后解构 `({ output, usage })` 或使用等价对象访问，不改变测试断言语义。真实 SKILL 已兼容对象，因此只修应用测试面。

## 6. 防过度设计五问

1. **解决什么真实问题？** SKILL postProcess 拿不到模型 usage，reasoning 占比等性能事实只能事后由人工翻 trace。
2. **是否有更小实现？** 有，就是透传 usage 和保留 `_perf`。本次硬门禁：不加预算系统、不加自动调度、不加 UI；后续任何需求不得借本方案顺带扩展这三类能力。
3. **是否新增语义裁判？** 否。`_perf` 不进 issues，不改终态，不触发重试。
4. **是否引起新旧语义纠缠？** 否。旧字符串 payload 是接口形态，不是旧降 AI 改稿语义；本方案也不注入任何提示词。
5. **退役面是否清零？** 本方案不新建旧协议兼容层。deai-model-profile 冻结常量继续生效，统计升级仍被门禁阻断。

## 7. 执行与验证矩阵

### 7.1 实施顺序

1. 类型面：`realSkillTypes.ts`。
2. trace 面：`runTrace.ts`。
3. 执行面：`realSkillExecutor.ts` 的白名单、payload、report 回填。
4. 同步 10 处 spec。
5. 新增最小回归用例。

### 7.2 新增回归用例

至少覆盖：

1. S1 型 postProcess 收到 `usage.outputTokens` 与 `usage.reasoningOutputTokens`，比例超过 `0.70` 时返回 `_perf`。
2. 应用 report 出现 `perf = { warning, ratio, blocking: false }`。
3. run 终态仍为成功，issues 数量不因 `_perf` 增加。
4. usage 缺失或 `_perf` 结构非法时不写 `perf`，正常输出通过。
5. 比例不超过阈值时无 `perf`。

### 7.3 必跑验证

1. `npm run test:services`
2. `npm run type-check`
3. `node scripts/tests/skill-script-worker.spec.cjs`

worker 协议测试不在 npm scripts 中，须手动执行；本轮不改 worker，只验证 IPC 链路未被破坏。

### 7.4 GATE

完成声明必须包含：

- 验证命令完整输出截断。
- 改动文件与行号。
- 新旧行为对比。
- `DEFECT-SWEEP` 台账：本次发现但明确不在本方案处理的问题。
- deai-model-profile 冻结声明。

## 8. 风险与止损

| 风险 | 控制措施 |
|---|---|
| 老 SKILL 假定 payload 是字符串 | 已审计当前接入 folder 层均兼容对象；应用 spec 同步适配 |
| usage 字段缺失 | SKILL 已做空值守卫，应用也不构造非法 `_perf` |
| `_perf` 被误当质量缺陷 | 不进 issues，不降级，不改终态，report 与 trace 仅观测 |
| 数据膨胀 | 只保留 warning、ratio、blocking 三个标量，不复制 usage 全量对象 |
| 方案扩张 | 冻结 deai-model-profile，禁止本次顺带解锁 |

## 9. 版本与提交边界

当前分支：`codex/direct-write-negative-verification`。  
当前 HEAD：`1e384d781b3d996fd73bc9c6051562407bd545e0`。  
当前应用版本：`3.118.0`。

批准后只提交本方案相关源码、测试、方案文档与后续验证证据。不提交也不回退用户既有脏文件，包括 `_audit/verification-pipeline-provider-channel-live/` 下的修改文件与 `_audit/verification-body-bare-not-ready-targeted/body-trace.json` 未跟踪文件。
