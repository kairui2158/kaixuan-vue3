# 包体积与依赖关系优化报告

生成时间：2026-09-06 13:42（Asia/Shanghai）

## 结论

- 本轮完成低风险拆包：设置面板 7 个子页与记忆面板 4 个 G6 视图改为按需加载。
- 主包从 `2,445.45 kB` 降至 `873.53 kB`，gzip 从 `741.11 kB` 降至 `284.36 kB`，降幅约 61.7%。
- G6 库拆为独立 `G6Canvas` chunk（`1,409.18 kB` / gzip `404.68 kB`），只在打开对应记忆视图时加载。
- 7 个设置子页拆为独立小 chunk，最大 `20.76 kB`，只在点击对应设置标签时加载。
- G6 行为验收全量回归通过：`allStepsOk=true`，运行时错误为空。

## 修改内容

| 文件 | 修改 |
| --- | --- |
| `src/components/settings/SettingsModal.vue` | `ApiSettings`、`SkillSettings`、`AgentSettings`、`AppearanceSettings`、`DeAiSettings`、`DiagLogPanel`、`McpSettings` 改为 `defineAsyncComponent` |
| `src/components/common/MemoryPanel.vue` | `RelationGraph`、`GraphAnalysis`、`MindMap`、`TimelineView` 改为 `defineAsyncComponent` |

## 构建产物对账

| 指标 | 优化前 | 优化后 |
| --- | ---: | ---: |
| 主包 JS | `2,445.45 kB` | `873.53 kB` |
| 主包 gzip | `741.11 kB` | `284.36 kB` |
| 主 CSS | `258.88 kB` | `204.81 kB` |
| G6 chunk | 0（并入主包） | `1,409.18 kB` / gzip `404.68 kB` |
| 设置子页 chunk | 0（并入主包） | `5.08`–`20.76 kB` |

关键构建输出：

```text
dist-renderer/assets/index-Ofs9n2O_.js   873.53 kB │ gzip: 284.36 kB
dist-renderer/assets/G6Canvas-C9sjzP6U.js 1,409.18 kB │ gzip: 404.68 kB
dist-renderer/assets/SkillSettings-B0w6gAhX.js 20.76 kB │ gzip: 7.54 kB
dist-renderer/assets/McpSettings-_z0_hI6b.js 5.08 kB │ gzip: 2.22 kB
✓ built in 2.55s
```

## 回归验证

| 验证 | 结果 | 关键输出 |
| --- | --- | --- |
| G6 行为探针 | PASS | `allStepsOk=true`；`runtimeErrors=[]`；四视图渲染、悬停、点击、拖拽、框选、来源跳转、空态、关闭重开全部通过 |
| G6 单元测试 | PASS | `Test Files  1 passed (1)`；`Tests  4 passed (4)` |
| 服务测试 | PASS | `Test Files  3 passed (3)`；`Tests  78 passed (78)` |
| 类型检查 | PASS | `vue-tsc --noEmit`，无错误 |
| 构建 | PASS | `✓ 1589 modules transformed`；主构建 `✓ built in 2.55s`；协议构建 `✓ built in 48ms` |
| Diff 检查 | PASS | `git diff --check` exit 0，无 whitespace error |

## 风险与行为说明

- 设置面板与记忆视图首次点击时会短暂异步加载；本机文件加载下延迟极低，G6 探针未出现等待失败。
- 本轮只做组件级按需加载，不改业务逻辑、不改接口、不新增依赖、不动循环依赖结构。
- 剩余 `INEFFECTIVE_DYNAMIC_IMPORT` 与 `configLoader: 'native'` 警告仍为非阻塞项；如需彻底清零，需要另行处理 `aiService` / `provider` / `executionLog` 的依赖关系与 Vite 配置加载方式。
