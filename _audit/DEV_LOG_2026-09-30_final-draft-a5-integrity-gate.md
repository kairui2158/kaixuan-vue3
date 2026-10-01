# 2026-09-30 终稿完整性门与 S1M 停滞证据

## 结论

1. S1M 第 17/20 段停滞是供应商吞吐劣化，不是应用空转、工具循环或上下文滚雪球。证据：Electron 可响应、状态 `streaming`、API 调用停在 18 次（1 次规划 + 17 次分段）、每段输入规模相近、无续生成触发。前 16 段完成 818,912 字；第 17 段从 08:46:17 起超过 91 分钟未完成，手动停止。
2. S100 暴露的是应用层结构完整性门缺陷：模型复读 `## 第3卷 第12节：终稿节点212` 并输出残缺副本，终稿标题数 239 / 源文 238。原 `validateFinalDraft` 只查段落数下限，无法识别非逐字大块复读。

## 本轮修复

范围：仅 `finalDraftService` 与其 spec，未触碰其他链路。

1. 分段 prompt 注入标题边界：只允许输出本段源文包含的标题，衔接尾巴与其他分段标题禁止输出。
2. 新增 `leaf_body_integrity_lost` 校验：
   - 仅当源文存在 Markdown 标题时启用；无标题文档不启用，避免误杀自由终稿。
   - 按标题切块，块内再按空行拆段落；标点/空白归一化后比较 multiset，避免标点整理误伤。
   - 缺失或新增叶子均报 issue；段级重试一次，仍失败则 `task_failed`，不写编辑器。

## 验证

1. 定向测试：`npx vitest run src/services/finalDraftService.spec.ts src/services/finalDraftRunner.spec.ts` → 50/50 通过。
2. S100 真实缺陷离线复现：用 S100 `source.md` + `home-after.md` 喂入新校验，返回 `valid: false`，`leaf_body_integrity_lost`，源文叶子 951 / 终稿叶子 954，新增 3。
3. 全量回归：`npx vitest run` → 120 个文件 / 1257 条测试全部通过。
4. `npm run type-check` → exit 0。

## 未完成

1. S100 Electron 真实 API 复测未启动；本轮只完成离线缺陷复现与服务层验证。
2. S1M Phase B（停滞检测 + 用户动作）、Phase C（分段 checkpoint 跨进程恢复）、Phase D（自适应分段/换路续跑）未实现。
3. 本轮 S1M 停止后，已完成 16 段产物仍不可恢复续跑，这是当前最大用户侧风险。
