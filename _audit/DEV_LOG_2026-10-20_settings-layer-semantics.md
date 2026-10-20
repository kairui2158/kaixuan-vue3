# 2026-10-20 设定层分层语义约束（问题二）

## 交付范围

- 新增 `settingsLayerSemantics.ts` 单源语义层：分类规范化、四层语义块、入选/排除原因与 warning，`policyVersion=2`。
- `getLockedSettingsForLayer()` 从“三个名字、同一份全文”升级为 `volume | chapter | body | home` 四层语义投影；首页新增 query 相关性过滤。
- 卷纲、章节、正文、首页四个消费面全部接线：卷纲 `[设定规划约束]`，章节 `[章节规划约束]`，正文 `[正文执行约束]`，首页 `[当前上下文设定]`。
- 删除正文层 `settingsProjection.items.map()` 重建文本的分叉，改为直接消费单源 `settingsProjection.text`；空投影由下游统一兜底。
- `settings-projection-composed` trace 增加 `policyVersion`、分类分布、入选/排除/裁剪原因、warning 与内容 hash。
- 修复首页跨异步消息数组读取崩溃：历史遍历和尾部消息消费先取局部快照，增加 `turn-runtime-error` 栈采集；接线测试禁止裸索引回归。
- 修复终步回放测试硬依赖桌面 trace 的事故：证据源切换到仓库内归档 `_audit/verification-final-step-metadata-replay/`，断言语义不放宽。

## 验证

- 定向：`npx vitest run src/services/settingsProjection.spec.ts src/services/settingsProjectionWiring.spec.ts src/services/finalStepMetadataReplay.spec.ts` 通过；回放 4/4。
- 全量：`npm run test:services` 通过，180 files / 2067 tests。
- 静态：`npm run type-check` 通过；`npm run build:vue` 通过。
- 真实 Electron UI：`node scripts/verify-settings-lock-projection-electron.mjs` 通过，`report.json` 最终轮 `generatedAt=2026-10-20T12:14:20.949Z`；覆盖 schema 3→4 迁移、单锁/解锁/批量锁、卷纲/章节/正文/首页四条真实链路、草稿排除、心跳 4 帧。

## 诚实边界

- Electron 供应商为本地 OpenAI-compatible provider；外部 live 供应商矩阵仍 `untested`。
- 首页相关性排序是名称与关键词匹配，非语义向量排序；无命中时保守回退全量锁定设定并写 warning。
- `trimmedReasons` 预算裁剪链路尚未触发实现场景，登记为后续项。
- 版本保持 3.100.0，未升版、未打包，等待问题二用户验收。
