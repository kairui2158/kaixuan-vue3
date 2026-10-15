# DEV LOG: 大纲工作台创作风格锁定与全流水线同步（3.89.0）

## 交付状态

创作风格现在是项目级单一事实源：`project store.styleProfile` 持久化保存风格标签、五项节奏参数、自定义标签、AI 节奏快照、锁定态与来源。旧项目加载时获得未锁定空草稿；项目切换/新建/清空归零；锁定后只有风格卡片自己的解锁动作可以恢复编辑。

## 用户可见行为

1. 大纲工作台底部配置区和流水线设定层各有一张同源“创作风格”卡片。任一卡片在未锁定时编辑，另一张实时一致；锁定后两张卡片同时只读并显示“已锁定”。
2. 大纲工作台设定风格并锁定后，chain / plain 对话的系统提示词包含 `[创作风格约束（应用级，优先级高于普通建议）]`。未锁定草稿即使非空也不注入任何 prompt、模板变量或终稿约束。
3. 终稿整篇重构在创建任务时把风格编译为 constraints 快照；继续生成、当前段重试、检查点恢复都复用任务快照，不读取实时风格，避免分段风格漂移。
4. 本地确定性变换与大纲自动拆解不注入风格：前者不是模型创作，后者是信息抽取任务。runTrace 均记录 `injected:false` 与对应 reason。
5. 下游失效（大纲重编、设定/卷纲/章节/正文失效）不再清空风格。AI 大纲分析在未锁定时只作为草稿建议；锁定后永不覆盖。

## 流水线接线

- 设定层：prompt 追加 `[创作风格]` 块。
- 卷纲层：`buildVolumePrompt` 支持 `styleContext`，渲染 `[风格与节奏]`。
- 章节层：`[风格与节奏]` 数据源改为 store，仅锁定注入。
- 正文层：执行包 `styleContext` / `pacingContext` 数据源改为 store，仅锁定注入。
- SKILL 模板变量：流水线与大纲工作台模板上下文均只在锁定时提供 `styleTags` / `pacingParams`，否则为空。
- 风格只影响提示词与约束，不改变工具面、权限语义、意图路由或写入授权。

## 运行记录

- 每轮大纲对话记录 `style-profile` trace 事件：锁定态、是否注入、未注入 reason、风格标签与节奏参数。
- 本地变换记录 `local_transform` 豁免；自动拆解记录 `extraction_task` 豁免。
- 终稿 create / continue / retry_segment / resume 记录 `constraintsSource:'task_snapshot'` 与 `hasStyleConstraint`。
- chain 与 plain 路径先创建 run，再构建系统提示词，第一轮风格事件不会丢失。

## 验证

| 项 | 结果 |
|---|---|
| 单元 / 组件测试 | `npm run test:services`：162 files / 1912 tests passed |
| 类型 | `npm run type-check`：exit 0 |
| Renderer | `npm run build:vue`：exit 0 |
| 真实 Electron UI | `node scripts/verify-style-profile-electron.mjs`：exit 0，`===== STYLE PROFILE LOCK SYNC ELECTRON PASSED =====` |
| Electron 证据 | unlockedDraft：`injected:false, reason:'style_unlocked'`；lockedDraft：`injected:true`；localTransform：`exemption:true`；pipelineSync：tags/pacing/locked 全 true；persistence：风格与节奏落盘 |
| 新旧并存 | 旧本地 `styleTags` / `pacingParams` refs、`outlineAnalyzed` 反解 watch、失效清空逻辑全部清零 |

## 诚实边界

- 本轮 Electron 验证使用本地 OpenAI-compatible mock provider，不是外部 live 供应商；覆盖的是应用接线、锁定语义、trace 与同步行为。
- 未锁定草稿不注入的口径已覆盖 chain / plain / 终稿 / 模板变量 / 正文执行包；如未来新增模型出口，必须同批接入该口径。
- 风格锁是项目级数据，不做跨项目复制。

## 封装

- 版本：3.89.0
- 完整打包：`npm run build`
- 打包核验：`node scripts/verify-packaging-3-89-0.mjs`
- 证据：`_audit/verification-packaging-3-89-0/packaging-evidence.json`
- 安装包：`dist/神意助手-Setup-3.89.0.exe`，231,530,562 bytes，SHA256 `db3e9e10a772977314128d3fefde83a3106ce464436b5dbac476421cdfba34c7`
- 旧产物：3.88.0 安装包与 blockmap 已按清旧留新清理
