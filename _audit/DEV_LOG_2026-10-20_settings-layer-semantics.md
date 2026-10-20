# 2026-10-20 设定层分层语义约束（问题二）

## 交付范围

- 新增 `settingsLayerSemantics.ts` 单源语义层：分类规范化、四层语义块、入选/排除原因与 warning，`policyVersion=2`。
- `getLockedSettingsForLayer()` 从“三个名字、同一份全文”升级为 `volume | chapter | body | home` 四层语义投影；首页新增 query 相关性过滤。
- 卷纲、章节、正文、首页四个消费面全部接线：卷纲 `[设定规划约束]`，章节 `[章节规划约束]`，正文 `[正文执行约束]`，首页 `[当前上下文设定]`。
- 删除正文层 `settingsProjection.items.map()` 重建文本的分叉，改为直接消费单源 `settingsProjection.text`；空投影由下游统一兜底。
- `settings-projection-composed` trace 增加 `policyVersion`、分类分布、入选/排除/裁剪原因、warning 与内容 hash。
- 修复首页跨异步消息数组读取崩溃：历史遍历和尾部消息消费先取局部快照，增加 `turn-runtime-error` 栈采集；接线测试禁止裸索引回归。
- 修复终步回放测试硬依赖桌面 trace 的事故：证据源切换到仓库内归档 `_audit/verification-final-step-metadata-replay/`，断言语义不放宽。
- 修复语义分类优先级穿透：`normalizeSemanticCategory` 现在显式 category 权威，`name + text` 只在类目未识别时兜底；“风格/人物基调”不再被误判为 character。
- 修复章节层风格档案缺 `定位` 小节：v2 锁定档案的一句话定位现在会进入 chapter 层，与 volume/body 对齐。
- 修复冲突检测语义盲区：物品卡文本提到人物名不再触发实体冲突；实体/世界冲突分别只由 `character` / `world` 语义卡参与，复用同一个 `normalizeSemanticCategory` 单源。
- 收口三个边界项：`categoryDistribution` 改为裁剪后口径；设定层生成风格路径显式为 `getSettingsGenerationStyleContext()`（仅风格档案，不吸收设定卡风格）；冲突检测以“是否注入记忆”为 layer scope，正文层启用、卷纲/章节层关闭。

## 验证

- 定向：`npx vitest run src/services/settingsProjection.spec.ts src/services/settingsProjectionWiring.spec.ts src/services/finalStepMetadataReplay.spec.ts` 通过；回放 4/4。
- 全量：`npm run test:services` 通过，180 files / 2067 tests。
- 静态：`npm run type-check` 通过；`npm run build:vue` 通过。
- 真实 Electron UI：`node scripts/verify-settings-lock-projection-electron.mjs` 通过，`report.json` 最终轮 `generatedAt=2026-10-20T14:07:11.549Z`；覆盖 schema 3→4 迁移、单锁/解锁/批量锁、卷纲/章节/正文/首页四条真实链路、草稿排除、风格单块仲裁、记忆冲突优先级、心跳 4 帧。最终 body trace 冲突数为 1，不再出现 61 条物品卡误报。
- 最终全量回归：`npm run test:services` → 185 files / 2091 tests passed；`npm run type-check` → exit 0。

## 诚实边界

- Electron 供应商为本地 OpenAI-compatible provider；外部 live 供应商矩阵仍 `untested`。
- 首页相关性排序是名称与关键词匹配，非语义向量排序；无命中时保守回退全量锁定设定并写 warning。
- 冲突检测只接正文层是已裁决语义边界：只有正文层注入实体/世界记忆；卷纲/章节层后续若新增记忆注入，必须同步扩展 `contextConflictScopeForLayer` 与对应测试。
- 经验文件裁决：本轮“断言锚点跟随语义迁移”已由 G1.5 覆盖，不新增 v8.17 门禁；本裁决按 G2.9 要求登记。
