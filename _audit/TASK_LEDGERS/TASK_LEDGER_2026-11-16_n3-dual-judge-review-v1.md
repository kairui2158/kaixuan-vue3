# TASK LEDGER — N3 Panel/orchestrator 双裁判复审

## 1. 目标与原话

用户批准 N3 独立对账方案，并要求最后把实现接线收尾至成熟。目标是复核卷纲/章节生成期修复裁判与持久化前终审的职责边界，修复已证实的字段语义漂移，并用跨层真值测试固化，不删除任一层防线。

## 2. 门禁读证

- G0.3 诚实闭环、G0.6 方案成熟度、G0.12 台账：最小影响圈、逐项证据、缺口如实登记。
- G0.13 最小必要性：只对齐一个已证实字段链，不抽共享校验器，不统一错误文案。
- G1.3 同款逻辑统一：卷纲字数统一为 `allocatedWords ?? suggestedWords`。
- G1.14 DEFECT-SWEEP：生产消费点、测试消费点、章节面板防线均已反查。
- G1.30 方案对账：代码、测试、注释、台账、版本封装逐项回填。

## 3. 路由判定

加入：字段级对账、持久化语义对齐、跨层真值矩阵、职责注释、全量回归、版本封装。

排除：共享校验器抽象，因重叠面不足且会造成跨层耦合；错误文案重构，因当前错误名是面内约定且重命名不属于缺陷修复；章节层对齐，因 Panel 跨批次全集检查是单批 orchestrator 不具备的刻意防线。

## 4. 影响圈与作者反证

影响圈：`narrativeValidation.ts` 的卷纲字数判定、`narrativeValidation.spec.ts`、Panel 两个入口注释、卷/章 orchestrator 入口注释、版本与交付证据。

作者反证：

1. “Panel 只是重复裁判”不成立：章节 Panel 有 collected 全集重复与总台账数量检查，卷纲 Panel 阻止畸形数据进入持久化。
2. “还有隐藏消费点”不成立：全仓检索显示 `validateVolumeStructure` / `validateChapterStructure` 生产消费仅 Panel，测试消费仅同层 spec。
3. “`allocatedWords` 与 `suggestedWords` 同为 0 会误报”不成立：`??` 只跳过 `null/undefined`，0 保持为有效非负整数。

## 5. 停止条件

完成：字段矩阵落成；唯一漂移修复；跨层正反向用例通过；角色语义固化；全量测试/type/build/wiring PASS；3.128.4 封装与台账闭环。

失败或回滚条件：任一防线被删除、现有文案外部契约断裂、测试或打包失败、发现非负整数语义引入编辑器误拦。

## 6. 执行证据

- 审计矩阵：orchestrator 消费 `allocatedWords ?? suggestedWords` 且要求非负整数；旧 Panel 只查 `suggestedWords < 0`；持久化面优先写入 `allocatedWords`，构成合法分配加负建议被误拦的真实漂移。
- 修复：`src/services/narrativeValidation.ts:34-47` 改为消费同一字段链并判定非负整数。
- 守护：`src/services/narrativeValidation.spec.ts:19-37` 锁定正反向真值。
- 固化：Panel 入口标注持久化终审职责；卷/章 orchestrator 入口标注生成期修复职责。
- 定向验证：`npx vitest run src/services/narrativeValidation.spec.ts src/services/volumeGenerationContract.spec.ts src/services/chapterGenerationContract.spec.ts` → 3 files / 44 tests PASS。
- 全量服务测试：`npm run test:services` → 253 files / 2785 tests PASS。
- 静态与构建：`npm run type-check` PASS；`npm run build:vue` PASS；`npm run verify:production-wiring` PASS（593 modules，no violations）。

## 7. 缺口与 DEFECT-SWEEP

缺陷面枚举：卷纲字段链漂移已修复；章节跨批次防线保留；两层命名差异保留；无旧协议残留；无共享状态和第三裁判。

3.128.4 完整封装已执行：`npm run build` PASS；`npm run verify:packaging` 裁决 PASS。安装包 `dist/神意助手-Setup-3.128.4.exe`，SHA-256 `06eb1f23821df371416ddab3a8fd0b47b330b6a85bbec25458673126ae30f0a9`，rendererFiles 87，electronAPI methods 94，证据 `_audit/verification-packaging-3.128.4/packaging-evidence.json`。验证脚本 finally 阶段 `electronApp.close` 15 秒超时，但应用已输出 `PACKAGING 3.128.4 VERIFICATION PASSED`，命令退出码 0；该收尾超时登记为观测项，不改判封装结果。

[DEFECT-SWEEP] 已完成生产消费点、同款 sibling 校验、旧协议、链式字段四面枚举；除已修字段链外无新增阻断缺陷。
