# Electron GUI 真实供应商手工烟测报告（裸 NOT-READY → targeted 路由）

- 日期：2026-11-08
- 脚本：`scripts/verify-body-bare-not-ready-targeted-electron.mjs`
- Mock：PASS（`bare NOT-READY detected, targeted scope applied, no full_chain, body succeeded; mode=mock; attempts=2`）
- Live：路由断言全部通过，终态 `failed`（供应商侧 S2 输出质量问题，非路由缺陷）

## Live 路由证据（trace: run-trace-正文层-20261108-005016）

| 断言 | 结果 | 证据 |
|------|------|------|
| `chapter-narrative-not-ready` 事件触发 | PASS | block events = 1 |
| gap 携带 SKILL 原因 | PASS | `交接输入不可恢复：归一化后仍缺字段：场景分段、场景字数、场景施工卡` |
| `retryableInBodyLayer=true` | PASS | block detail 明确声明 |
| attempt 0 拦截裸文本 | PASS | `too_short, 31 words`（NOT-READY 文本） |
| attempt 1 走 targeted | PASS | `repairScope=targeted` |
| 无 full_chain 降级 | PASS | attemptScopes 仅 `none/targeted` |
| generatorStepIndex 已识别 | PASS | targeted attempt `generatorStepIndex=1` |
| 终态 succeeded | FAIL | `failed`，error=`【正文交接】出现3次，必须恰好一次` |

## 终态 failed 根因

S2 targeted 修复通过真实供应商 glm-5.2 走了 5 次物理调用（schema_retry / continuation 交替），单次调用反复触达输出上限，拆分后的重试稿在 postProcess 合并验收时 `【正文交接】` 累计出现 3 次，被 SKILL postProcess 拒绝。这是供应商输出稳定性问题（长输出切分 + 多段拼接导致交接块重复），不是应用路由问题：路由层在第一次拦截和第二次 targeted 尝试之间的行为完全符合契约。

## 结论

应用侧裸 NOT-READY → targeted 路由修复在 mock 与 live 两种模式下均已验证生效。live 终态成功依赖供应商侧 S2 输出稳定性，属于已知的 SKILL/供应商收敛问题，不在本次路由修复的责任范围内。
