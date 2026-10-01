# DEV_LOG 2026-09-22 意图对抗工厂收敛 V2

## 目标

把意图对抗语料工厂从“基础设施可用”推进到“可停止审计的收敛交付”。收敛口径是可执行证据链：Silver 安全硬约束清零、连续有效轮满足、完整回归与文档账本通过；不宣称解决全部泛化路由问题。

## 门禁执行

- 执行前复读 `神意开发经验总结_v5.md`，适用 M51-M54；本轮补入 M55-M57。
- 遵守无预算约束：全程未创建 goal、未设置 token budget。
- 工厂扩库种子只进入 `INTENT_FACTORY_ACCRETION_SAMPLES`，未进入 `CHAIN_INTENT_EVAL_SPLITS`。

## 收敛过程

1. **round-12 真实扩库**：新增 8 条工厂种子，Silver 381 条中出现 1 条误配：`盘点第一卷还有哪些副笔没有回收` 期望 analyze、实际 edit。归因是 `盘点` 不在 analyze 词表，句子中的 `伏笔` 被写入目标层捕获。
2. **修复 round-12**：把 `盘点` 纳入只读分析动词，并在 `chainIntentRouter.spec.ts` 增加“带写入目标的盘点句仍为 analyze”回归。round-13 Silver 356/356 全零，手稿一致 100%。
3. **round-14 扩库**：新增 8 条时间线、动作细节、场景方案、情绪变化等种子，Silver 381/381 全零，手稿一致 100%。
4. **round-15 扩库**：新增 8 条身份设定、因果链、信息差、抉择对话等种子，暴露 2 条种子标签错误：`为旧灯塔（设定）补一段前史短稿` 期望 generate、实际 edit。产品语义中 `补一段` 表示插入编辑器内容，应属 edit；种子标签与产品语义冲突，不是路由缺陷。
5. **修复 round-15**：生成种子改为 `撰写一段前史短稿`，并新增 `在第二卷结尾补一段灯塔前史短稿` 编辑正样本。round-16 Silver 402/402 全零，手稿一致 100%。
6. **round-17 扩库**：新增 8 条守夜人、旧信、旧灯塔相关种子，标点变异暴露 1 条 falseRejection：`盘一盘` 变异后缺少 analyze 识别。该轮登记为失败发现轮。
7. **修复 round-17**：把 `盘一盘` 纳入 analyze 词表，复跑同输入集。round-18 Silver 419/419 全零，手稿一致 100%。
8. **round-19 扩库**：新增 8 条落款日期、重复描写、信息释放量、心理活动等种子，Silver 440/440 全零，手稿一致 100%。
9. **round-20 扩库**：新增 8 条对话顺序、环境细节、动机复盘、封闭空间冲突等种子，并补入 `复盘`（analyze）与 `草拟`（generate）词表。Silver 465/465 全零，手稿一致 100%。

## inputHash 事实

- round-12/13：`d18e53f232f2478c80d8a0af325d19fbfae921aa5896cb8e3b25b10c42ea51a6`，输入集相同；round-13 的变化来自路由行为修复，hash 不变。
- round-14：`f689da65bec7f05e99acb8543653df5b7d9fe1ed7e2cb3b11b995e56ff740c8f`。
- round-15：`3154bc2cf5d12ef632a4e805ee22a145bb7896e1b8045d13954516c2eb44469d`。
- round-16：`c557140bbc80a8fdf866c9742fb702be1c17cbd11a73eaf3862d5bbb6c912650`。
- round-17/18：`36f1c576556f1f5230500ba8f4d49c37d3ac8ac0df271c58dbaf485beab95c8a`，round-18 是行为修复轮，输入集与 round-17 相同。
- round-19：`2c90e5c687d3006e51ea8a6072e832c5278cada8eebfedae1fbcbf7863f867b5`。
- round-20：`f47190d7514fe3abcfe33255429ec5ac7bd4761e805f88fd708b6cc50f1f8f54`。
- 结论：inputHash 只证明输入集变化，不能作为收敛轮唯一身份；账本以“报告 + inputHash + 指标 + actions + evidence”组合登记。

## 有效轮登记

- 末尾连续有效轮为 round-18、round-19、round-20，均满足 Silver 五项失败指标全零。
- round-13、round-14、round-16 是早期有效轮；round-17 是失败发现轮，其暴露问题已在 round-18 闭环。
- S3 审计只看账本末尾连续 3 个 `effective=true` 轮，round-15/17 的失败轮会切断更早序列，不能拿 13/14/16 冒充末尾收敛序列。

## 验证

- 路由专项（round-20 后新鲜重跑）：`npx vitest run src/services/chainIntentRouter.spec.ts src/services/intentFactoryStopAudit.spec.ts`，44/44 通过。
- 全量服务测试（round-20 后新鲜重跑）：`npm run test:services`，79 个文件、769 个用例通过。
- 类型检查：`npm run type-check` 通过。
- 构建与 Electron 门禁：`npm run build:vue` 通过；`node scripts/verify-intent-corpus-electron.mjs` 八场景通过。
- 校准（round-20 后新鲜重跑）：`node scripts/calibrate-intent-routing-thresholds.mjs` 通过，dev 9/9，writeFalseTriggers=0，discussBlocked=0。

## 收尾

- 新增 `_audit/intent-factory-rounds-13-16.json` 作为轮次索引。
- 更新收敛账本、Roadmap、语料规格与经验文件。
- 停止审计以 `_audit/intent-factory-stop-audit.json` 输出为准；未 PASS 前禁止封装收敛版本。
- round-20 后停止审计结果：S1-S6 全部 PASS，剩余 Silver 失败 0，封装收敛版本解锁。

## 3.58.0 封装

- 版本：`package.json` 与 `package-lock.json` 升至 3.58.0。
- Roadmap 的 3.58.0 段落同步为“末尾连续有效轮 18/19/20”，不再引用被 round-15/17 失败轮切断的 13/14/16 旧序列。
- 收敛交付口径只指工厂收敛，不代表所有真实用户泛化问题永久解决；真实 confirmed 语料仍按 G1-G4 路线积累。
