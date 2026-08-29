# 玄武/凯旋应用层升级 P1 对账报告

日期：2026-08-27
范围：正文与 generation metadata 分离。未修改 P2-P8 的 chain、Agent、schema、断点状态机。

## 闭环

API 原始输出 → `parseGenerationResult` → `chapter.body` / `chapter.generationMetadata` → 项目 JSON → `insert-text` → 主编辑器。

## 修改与证据

| 项目 | 文件/函数 | 结果 | 证据 |
|---|---|---|---|
| 新增结果模型 | `src/services/generationResult.ts:1-49` / `parseGenerationResult` | 顶层 `{body, metadata}` 信封拆分；旧纯文本兼容；只过滤 thinking 标签，不删除普通 `[]`/`【】` | focused Vitest 5/5 |
| focused 测试 | `src/services/generationResult.spec.ts:1-46` | 纯文本、JSON 信封、代码围栏、thinking、非法信封均覆盖 | `Test Files 1 passed; Tests 5 passed` |
| 正文入口 | `src/components/pipeline/PipelinePanel.vue:2248-2262` / `genBody` | `body` 写入章节、章节管理器和编辑器事件；metadata 写入 `chapter.generationMetadata`，不进入正文 | 代码 diff + CDP |
| 项目持久化 | `src/stores/project.ts:174-181` | `chapters` 整体 `toPlain` 保存；章节级 metadata 随项目 JSON 保存，旧项目无字段时保持兼容 | 现有保存/加载结构审计 |
| 真实事件边界 | `src/App.vue:206-225` / `handleInsertText` | Electron/CDP 注入正文后编辑器实际得到纯正文；页面无 `sourceRefs` | `output/playwright/p1-insert-boundary-after-wait.png` |

## 原始验证输出

```text
npx vitest run src/services/generationResult.spec.ts
Test Files  1 passed (1)
Tests       5 passed (5)

npm run test:services
Test Files  2 passed (2)
Tests       44 passed (44)

npm run type-check
> vue-tsc --noEmit

npm run build:vue
vite v8.2.1 building client environment for production...
177 modules transformed.
✓ built in 1.33s

Electron/CDP:
{"value":"正文段落一。\n正文段落二。","tabs":2,"bodyHasMetadata":false,"active":null}
```

## 边界与未冒充项

- 当前 Electron 项目没有打开客户项目，也没有配置本轮可用的真实生成请求，因此没有伪造 API 生成结果或写入客户数据。
- 本阶段证明的是结果解析、正文写入边界和真实编辑器事件边界；真实 API 返回结构化信封的端到端样本纳入 P8。
- Vite 原有 native loader、无效动态导入、大 chunk 警告保持原样，属于 P0 基线风险。

## P1 勾选

- [x] 结果模型与纯文本兼容策略
- [x] metadata 不进入 `chapter.body`
- [x] 编辑器事件只传正文
- [x] 章节对象可随项目 JSON 保存 metadata
- [x] focused 测试、全服务测试、类型检查、构建
- [x] Electron/CDP 真实边界验证
- [ ] 客户真实 API 结构化响应端到端验证（P8）

P1 状态：**已完成本阶段代码闭环；真实 API 样本验证明确延期到 P8，不把它写成已完成。**
