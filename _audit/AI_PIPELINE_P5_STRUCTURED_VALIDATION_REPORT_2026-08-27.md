# AI 流水线 P5 结构化校验报告

日期：2026-08-27
阶段：P5
范围：Skill 的 outputFormat、inputSchema、outputSchema、validationRules、retryPolicy 消费

## 目标

在不执行任意脚本校验器、不改变旧文本 Skill 行为的前提下，将结构化约束集中到 Skill 调用边界：输入先校验，API 输出再校验，失败按有限次数重试，最终失败阻止后续链式步骤。

## 实现对照

| 项目 | 实现位置 | 状态 |
| --- | --- | --- |
| 声明式 JSON Schema 子集 | `src/services/skillValidation.ts:1-99` | 已实现 |
| 输入校验 | `PipelinePanel.vue:1240-1244,1262` | 已消费 |
| JSON 输出解析及输出校验 | `skillValidation.ts:83-110`、`PipelinePanel.vue:1246-1250` | 已消费 |
| `outputFormat=json` 默认一次修复重试 | `PipelinePanel.vue:1263-1269` | 已实现 |
| `retryPolicy.maxAttempts` 上限 5 | `skillValidation.ts:112-117` | 已实现 |
| 校验失败阻止后续 chain | `PipelinePanel.vue:1273-1281,1873-1881` | 已实现 |
| Skill 字段加载、保存、Markdown 导出 | `src/stores/skill.ts:45-86,109-135,153-183` | 已实现 |

## 本轮验证

### 1. 规则与边界测试

命令：

```text
npx vitest run src/services/skillValidation.spec.ts src/services/chainExecution.spec.ts src/services/chapterExecutionPackage.spec.ts src/services/generationResult.spec.ts src/services/skillAgentBinding.spec.ts
```

原始输出关键行：

```text
Test Files  5 passed (5)
Tests  17 passed (17)
```

覆盖输入缺字段、fenced JSON、输出 schema、JSON 解析失败、required 规则和非法 retry 限制。

### 2. 服务回归

命令：

```text
npm run test:services
```

原始输出关键行：

```text
Test Files  2 passed (2)
Tests  44 passed (44)
```

### 3. 类型检查

命令：`npm run type-check`

原始输出：

```text
> vue-tsc --noEmit
```

退出码为 0，无类型错误。

### 4. 构建

命令：`npm run build:vue`

原始输出关键行：

```text
vite v8.2.1 building client environment for production...
181 modules transformed.
dist-renderer/index.html  0.68 kB
✓ built in 1.67s
```

保留既有 `INEFFECTIVE_DYNAMIC_IMPORT` 和 bundle 大于 500 kB 警告，不在 P5 扩大范围处理。

### 5. 源文件 Electron/CDP 与持久化

启动命令：`cmd.exe /c start-electron.bat`

原始启动输出关键行：

```text
[OK] Electron found
[OK] dist-renderer found
[OK] Application started
DevTools listening on ws://127.0.0.1:9227/...
```

CDP 页面：`file:///D:/codex/novel-workshop-vue3/dist-renderer/index.html`，标题为 `神意助手`，`window.electronAPI` 存在，按钮数量 36。

同一隔离键的跨进程验证：

```text
[OK] pre-restart storage: {"skills":[{"id":"p5-restart","outputFormat":"json","inputSchema":{"type":"object","required":["outline"]},"outputSchema":{"type":"object","required":["chapters"]},"retryPolicy":{"maxAttempts":3}}]}
[OK] Electron terminated for restart probe
[OK] post-restart storage: {"skills":[{"id":"p5-restart","outputFormat":"json","inputSchema":{"type":"object","required":["outline"]},"outputSchema":{"type":"object","required":["chapters"]},"retryPolicy":{"maxAttempts":3}}]}
[OK] isolated probe cleanup: null
```

## 未覆盖边界

当前环境没有客户供应商/API 配置，因此本轮没有伪造 API 请求。以下需在客户配置存在时补验：

1. 真实请求计数是否按 retryPolicy 精确重试。
2. 重试请求的 prompt 是否被供应商实际收到。
3. 输出 schema 失败时 UI 日志和错误弹窗的具体展示。
4. 客户真实 Skill 配置在流水线 UI 中运行时的完整端到端结果。

这不是本地实现失败，而是外部配置缺失；P5 的规则服务、调用边界、阻断语义、构建和跨进程字段持久化已有本轮证据。

## 差异与清理

删除 `PipelinePanel.vue` 中已无引用的旧 `tryParseJson`，保留统一的 `skillValidation` 解析路径。`git diff --check` 对本阶段相关文件无空白错误。

## 结论

P5 本地实现与可验证闭环达到阶段标准，允许推进 P6。真实供应商行为列为客户 API 配置后的补验项，不得在交付报告中写成已完成网络验收。
