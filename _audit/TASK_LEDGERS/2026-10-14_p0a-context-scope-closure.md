# 任务台账：P0-A 作用域上下文闭包收口

## 1. 目标与原话

- 用户指令：“确认执行下一个阶段”；方案阶段为 `PROPOSAL_2026-10-13_OH_STORY_ADOPTED_UPGRADE_PLAN.md` 的 P0-A。
- 目标行为：正文层不再把全书/全卷大纲整块塞入 prompt，而是构建“卷级常任 + 当前单元 + 当前章证据”的闭包；旧项目显式降级并留痕；闭包失败必须结构化终止。
- 交付物：`outlineContextScope` 服务、执行包 v2 闭包守卫、PipelinePanel 接线、记忆三档优先检索与 `context_scope` / `memory_context` trace 事件、Electron 验证器与证据、DEV_LOG、本台账、3.84.0 版本封装。

## 2. 门禁读证

- G0.1 目标对齐：实现覆盖方案 4.2 的段位契约、闭包构成、预算裁剪、显式降级与调用点改造。
- G0.3 诚实闭环：本轮保留“mock 供应商形态错误”和“测试正文低于质量门禁”两次验证器失败记录，不伪装成一次通过。
- G0.4 经验复读：沿用“验证器自身也是被测对象”和“真实默认协议优先”经验，先修验证器协议形态，再判定产品缺陷。
- G0.5 回头看：复跑后发现记忆裁剪不可观测，补 `memory_context` trace 事件；复跑 type-check 捕获拆函数作用域错误。
- G0.6 成熟度：实现、单测、Electron 实测为“成熟”；`unitId` 正则推断与闭包预算采样为登记边界。
- G0.11 真实交互：可见 Electron 窗口、真实 DOM 操作、真实 SSE HTTP provider，不用注入冒充用户。
- G0.12 七节台账：本文件。

## 3. 路由判定

- 加入：G0.1、G0.3、G0.4、G0.5、G0.6、G0.11、G0.12；实现阶段使用 G1.1-G1.7。
- 排除 G0.2：用户已明确无预算模式，未创建 goal，未设置 token 预算。
- 排除 G1.19：本任务验收是闭包正确性与可观测性，性能收益留给 before/after 账本。

## 4. 影响圈与作者反证

- 已改面：正文层执行包构建、卷纲段位解析、记忆检索优先级、正文 prompt、runTrace 事件、专项测试与 Electron 验证器。
- 可能被误伤面：旧项目无段位卷纲、无 unitId 章节、超预算闭包、记忆为空、SKILL 模板上下文。反证方式分别是 legacy Case、正例显式 unitId、裁剪单测、Electron 空 memory trace、模板上下文继续走 `memoryTextForPipeline`。
- 最可能错的假设：“供应商配置 `streamMode:false` 会让产品走非流式”。反证证据是真实请求体仍为 `stream:true`，因此验证器必须按默认流式协议响应。

## 5. 停止条件

- 完成：专项 31 条、全量 1837 条、type-check、build:vue、Electron 三 Case、NSIS build、版本 3.84.0、证据与台账收口、临时 profile 清理。
- 失败：任一命令 exit 非 0；闭包失败被静默全文回退；legacy 无痕降级；prompt 仍携带其他单元细节；Electron 使用注入冒充用户。

## 6. 执行证据

- 段位契约与闭包：`src/services/outlineContextScope.ts:1`；预算 `TARGET_BYTES/MAX_BYTES` 在同文件。
- 执行包 v2 禁回退：`src/services/chapterExecutionPackage.ts:134`。
- 正文层接线与失败终止：`src/components/pipeline/PipelinePanel.vue:4133`。
- `context_scope` 事件：`src/components/pipeline/PipelinePanel.vue:4170`。
- `memory_context` 事件：`src/components/pipeline/PipelinePanel.vue:4196`。
- 记忆三档优先级：`src/services/memoryRetriever.ts:72`。
- 专项测试：`src/services/outlineContextScope.spec.ts:1`、`src/services/memoryRetriever.spec.ts:1`、`src/services/chapterExecutionPackage.spec.ts:1`、`src/services/chapterContextScopeWiring.spec.ts:1`。
- Electron 证据：`_audit/verification-outline-context-scope-electron/report.json:1`；三 Case 分别为 `unit_closure_real_ui` success、`legacy_outline_records_explicit_fallback` success + `legacy_outline_no_scope`、`scoped_missing_unit_fails_without_silent_fallback` 结构化 `unit_not_found`。
- 关键命令：`node scripts/verify-outline-context-scope-electron.mjs` → `===== OUTLINE CONTEXT SCOPE ELECTRON PASSED =====`；`npm run test:services` → 154 files / 1837 tests passed；`npm run type-check` → exit 0；`npm run build:vue` → exit 0。

## 7. 缺口清单

- 章节缺 `unitId` 时仍用剧情文本正则推断，可能漏识别非标准单元编号；后续应由卷纲生成层显式写入 `chapter.unitId`。
- 闭包预算 12K/24K 是首版采样值，未做全量真实项目分布校准。
- 本轮 Electron 使用本地 SSE mock provider，不是外部 live 供应商；live 对账留给流水线整体 before/after 账本。

## 8. 封装证据

- 版本：`package.json:3`、`package-lock.json:3`、`package-lock.json:9` 均为 3.84.0。
- `npm run build`：exit 0；产物 `dist/神意助手-Setup-3.84.0.exe`，231,526,544 bytes，SHA256 `9F1353A9EB0697B5223FA8F9E75F1F8E2DC0BD2A8FDABBCC44AECDE629DB2AE9`。
- 旧 3.83.0 安装包与 blockmap 已删除，`dist` 只保留 3.84.0 当前产物。

## 9. 最终工作区口径

- 源码、测试、验证脚本、`_audit` 证据与文档全部属于 P0-A。
- `_data/outline-context-scope-profile` 一次性 Electron profile 已清理；保留验证脚本与证据目录供复跑和审计。
