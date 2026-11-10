# TASK_LEDGER_2026-11-10_chapter-batch-input-button-sync-v1

## 背景

章节层“每次生成（章节数）”只做显示钳制，非法输入仍可保留在本地状态；批量生成入口用恒真的 `selectedVolumeChapterLocked` 作为就绪闸；旧按钮文案“生成本批章节”不能准确表达按配置章节数生成；持久化链路没有覆盖批量配置。用户确认 V1.1 方案并要求不引入预算系统、自动调度或新 UI 组件。

## 目标

1. 批量输入 1-20 归一化：0、负数钳到 1，小数去尾，21/100 钳到 20，空值/缺失/null 回默认 5。
2. 配置双写：项目级 `projectStore.pipelineConfig` 与流水线级 `pipelineStore.writeStepConfig` 同批持久化。
3. 按钮就绪态使用真实条件：绑定卷存在、章数大于 0、且当前卷没有章节生成任务。
4. 按钮文案迁移为“按设定章节数生成”，旧文案清零。
5. 不新增预算系统、自动调度或新 UI 组件。

## 改动

1. `src/services/chapterBatchPlanning.ts`
   - 新增 `normalizeChapterBatchSize()` 单源归一化。
   - `planChapterGeneration()` 使用同一函数，空值回默认 5。
2. `src/stores/project.ts`
   - `pipelineConfig` 增加可选 `chapterBatchSize`，默认 5。
   - 项目加载时单源归一化；项目重置恢复默认 5。
3. `src/components/pipeline/PipelinePanel.vue`
   - 输入框绑定 `@change="saveChapterBatchSize"`。
   - `saveVolumeConfig()` 双写项目配置与流水线配置。
   - 删除恒真 `selectedVolumeChapterLocked`，新增真实就绪态 `canStartChapters`。
   - 两个章节生成按钮改用 `canStartChapters`；文案迁移为“按设定章节数生成”。
   - mounted 与项目切换 watch 恢复并归一化 `chapterBatchSize`。
   - 章节生成入口从本地手写钳制改用同一归一化函数。
4. `src/services/chapterBatchPlanning.spec.ts`
   - 覆盖非法值、边界值、空值与批量计划归一化。
5. `src/services/chapterBatchModesWiring.spec.ts`
   - 锁定旧文案清零、新文案存在、真实就绪态、保存函数、归一化与双写接线。
6. `src/services/pipelineProgressReaders.spec.ts`
   - 续生成闸语义随 `canStartChapters` 迁移。
7. `src/components/pipeline/__tests__/deai-stage-guidance.integration.spec.ts`
   - 修正源码锁断言按 CRLF 检查，行为断言不变。
8. `src/services/chapterBatchOrchestrator.ts`
   - 修复既有 `unknown[]` 元素缩窄为 `{}` 导致的四处 `vue-tsc` 错误；仅补局部类型，不改运行逻辑。

## 验证

1. `npx vitest run src/services/chapterBatchPlanning.spec.ts src/services/chapterBatchModesWiring.spec.ts`：18/18 passed。
2. `npx vue-tsc --noEmit`：exit 0。
3. 旧语义检索：`selectedVolumeChapterLocked` 与 `生成本批章节` 在生产源码 0 命中。
4. `npx vitest run`：250 files / 2715 tests passed。
5. `npx vue-tsc --noEmit` 最终复跑：exit 0。

## 边界

1. 不修改卷纲层、正文层或设定层。
2. 不新增预算系统、自动调度、自动重试或新 UI 组件。
3. 不做 Electron 真实 GUI 手工烟测；以类型、全量服务回归和源码接线锁替代。
4. 不触碰用户既有验证产物、归档、备份与无关中文文档。

## 遗留

1. Electron 真实 GUI 手工烟测未执行，交由封装前或用户实测继续覆盖。
2. 章节数上限仍为既定 1-20，不扩展供应商 token 容量模型。

## 缺陷面枚举

| 枚举面 | 处置 |
|---|---|
| UI 显示钳制但状态污染 | 输入 change 与运行入口、持久化三处单源归一化 |
| 项目级与流水线级配置漂移 | 双写同一归一化值 |
| 按钮恒真假就绪 | 删除旧闸，绑定绑定卷/章数/运行态真实条件 |
| 旧文案语义误导 | 同批迁移旧按钮文案与测试守护 |
| 旧源码锁误判 CRLF | 更新断言为 CRLF，行为锁不变 |
| 既有类型门阻断 | 最小局部类型修复，不混入功能改动 |

## 结论

章节层批量输入、持久化、生成入口和按钮就绪态在同一语义下闭环；全量服务回归与类型检查通过，可以进入封装前检查。
