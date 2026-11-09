# 任务台账：卷纲层续写自检守卫与预算单源 V1

## 1. 目标与原话

- 用户确认 V1.0 五个默认裁决点并要求开始执行。
- 最终行为：续写调用返回 SKILL 自检注释时不得把注释合并进卷纲产物；SKILL 声明“协议终点”后保留原候选并将运行恢复为成功；direct-retry 不再重复消耗预算；postProcess usage/_perf 保持已有能力并有回归。

## 2. 门禁读证

- G0.1/G0.3：目标对齐与诚实闭环（`_audit/神意开发经验总结_v9.md:8`、`:14`）。
- G0.4/G0.5：修复前复读 DEV_LOG 与经验，收尾回头看（`:44`、`:52`）。
- G0.7/G0.9/G0.10：正反推、影响圈、旧双扣账本语义同批退役（`:68`、`:84`、`:92`）。
- G0.12/G0.13：台账硬闸与最小必要性（`:114`、`:134`）。
- G1.1/G1.4/G1.5/G1.11/G1.12：精准编辑、分层验证、验证器契约、测试与封装（`:146`、`:176`、`:192`、`:274`、`:282`）。
- G2.9：流水线/终稿链路、终态与预算语义（`:552`）。

## 3. 路由判定

- 加入：续写产物守卫、预算单源、观测码、executor 回归、旧账本断言迁移、升版封装。
- 排除：SKILL 磁盘包修复，因为用户明确 SKILL 层不归应用改动；本轮只用 trace 提供的应用侧职责证据。
- 排除：新 UI、调度器、预算系统、协议扩展，因为 G0.13 判定非必需且已批方案明确最小实现。

## 4. 影响圈与作者反证

- 打算改：`realSkillExecutor.ts` 续写分支与 `callAiOnce` 预算；executor/folderSkillTest 测试；版本、台账、DEV_LOG、构建产物。
- 可能碰到：所有 folder SKILL 的续写路径、run 级预算快照、降级诊断统计、封装核验。
- 最可能错的假设：清 `finishReason` 就足以让运行成功。证伪结果：测试发现 `generation-truncated` 降级码仍保留，已补充“SKILL 自检协议终点”时移除截断降级，并把该行为写入回归。

## 5. 停止条件

- 成功：定向与全量服务测试通过；type-check 通过；build 产物存在；verify:packaging 通过；trace 复现文本被负向断言；旧双扣断言迁移为 used=1。
- 失败：任一生产代码行为未覆盖、旧语义在现役执行路径命中、或封装核验失败。

## 6. 执行证据

- 修复：`realSkillExecutor.ts` 新增 `isContinuationSelfCheckText`，续写自检不合并、保留原候选、清 `finishReason=stop`，移除同链截断降级，写入 `continuation-self-check-skipped` warning。
- 预算：删除 `callAiOnce` 内 direct-retry 的第二次 `tryConsume`，保留 attempt 起点单次扣费；`folderSkillTest` 旧断言从 used=2 迁移为 used=1。
- 定向验证：`npx vitest run src/services/realSkillExecutor.spec.ts` → 78/78 passed；`folderSkillTest.spec.ts` → 3/3 passed。
- 全量验证：`npm run type-check` → exit 0；`npm run test:services` 首轮 2692/2693，唯一失败即旧 used=2 断言；迁移后定向 3/3。
- A4：`realSkillExecutor.spec.ts:1498` 与 `:1521` 已覆盖 usage 透传、合法 `_perf` 保留和 malformed `_perf` 丢弃；本轮未改生产代码。

## 7. 缺口清单与缺陷面枚举

- 缺陷面枚举：源码执行路径、续写有效性分类、诊断降级统计、预算快照、folderSkillTest、打包入口、运行 trace 消费、A4 postProcess 白名单，共 8 面。
- 命中处置：源码续写路径、诊断降级统计、预算快照、folderSkillTest 已修或补测；A4 白名单已确认有测试；打包入口与 trace 消费由本文件验证命令覆盖。
- 未执行：真实 Electron UI 手工实测未执行，只登记为 untested 边界；本轮没有新增 UI 入口，服务层回归覆盖应用协议行为。
- 已登记边界：真实外部供应商不重复调用；SKILL 层不修；若新 SKILL 自检文案变更，应通过现有 trace 复核并在应用侧最小扩展。
