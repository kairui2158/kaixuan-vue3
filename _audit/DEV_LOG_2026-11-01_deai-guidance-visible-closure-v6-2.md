# DEV LOG — 降AI可视闭环 V6.2

日期：2026-11-01  
版本：3.110.14 → 3.110.15  
台账：[_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-01_deai-guidance-visible-closure-v6-2.md](_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-01_deai-guidance-visible-closure-v6-2.md)

## 背景

用户实测 3.110.14 的三份 deep trace 后发现：正文层内嵌降AI没有任何可视状态。根因不是 SKILL 接管失败，而是 V5 UI 只消费 `deai-guidance-pack`；当 `guidanceOwnership=skill` 时应用注入按设计退场，该事件不存在，徽章随之消失。

## 交付

1. 新增纯函数 `src/services/deaiGuidanceDisplay.ts`：按 skillIndex 归组 policy/pack 双事件，输出每 SKILL 四态与链级五态；retry 取最新；JSON 损坏回落 unknown；SKILL 接管固定 0 注入；app 缺 pack 不用 0 冒充。
2. `PipelinePanel.vue` 替换旧 `deaiGuidanceTraceForRun`：只取当前 displayed body run 的 `mode=body` trace，逐 trace 投影后按状态合并；多 trace 冲突链级显示 mixed，技能级 unknown + warning。
3. UI 五态常显：
   - app：`方法指导 16/3步 · 3210字符`
   - skill：`SKILL 方法指导接管 · 0注入`
   - off：`应用方法指导关闭`
   - mixed：`方法指导混合 · 展开查看`
   - unknown：`未观测到方法指导契约`
4. 反馈面板按 S1/S2/S3 独立显示，不再把混合契约压扁成一个总数。
5. 验证器升级为五个隔离 run：A app、B skill 接管、C off、D unknown、E mixed；每个 run 独立 pipelineRunId/traceRunId，保留真实点击正文页签、dist 新鲜度校验与 finally 清理。
6. 手册升级为 v2：归属以 `deai-injection-policy` 判定，应用注入量以 `deai-guidance-pack` 判定；2026-10-29 契约手册保留为契约参考，并加导航说明。
7. 版本升级 3.110.15。
8. 收尾补漏：合并逻辑下沉为 `mergeDeaiChainGuidanceDisplays` 纯函数。无 trace 显示 unknown，不再误判 mixed；多 trace 冲突链级 mixed、技能级 unknown + `multi-trace-state-conflict`。该缺陷由逐行 diff 审查发现，并以 35→37 条测试完成红绿闭环。
9. 验证器自身修复：seed 函数改为序列化后进入页面上下文；每个 run 显式登记 `rememberTraceRunOwnership`，并执行 `finishRun` + `finishGeneration`，保证 displayed body run 切换真实生效。

## 验证

- 定向：4 files / 37 tests passed。
- 类型：`npm run type-check` exit 0。
- 全量：`npm run test:services` → 239 files / 2552 tests passed。
- Renderer 构建：`npm run build:vue` exit 0。
- 五态真实 Electron：`node scripts/verify-deai-guidance-ui.mjs` exit 0，A/B/C/D/E 全部 PASS，无相关 page/console error。
- 旧语义清零：`rg -n "deaiGuidanceTraceForRun|一律以 deai-guidance-pack 为准" src scripts electron` 仅命中负向断言。
- 安装包：`npm run build` exit 0，`dist/神意助手-Setup-3.110.15.exe` 231644738 bytes，asar 版本标记 3.110.15。

## 教训

这不是注入机制失效，而是“观测面只看注入结果”的显示契约缺口。`guidanceOwnership=skill` 的正确行为是 0 注入，UI 如果只绑定 pack 事件，就会把设计内退场误呈现为功能消失。观测面必须同时读取决策事件和结果事件，且状态模型必须与真实所有权粒度一致：本例是每 SKILL 独立，不是整链一个 owner。

第二条教训：验证器不能只证明“能看见”，还要证明“看见的是当前 run”。连续五态切换如果只注入数据而不闭合 run / 登记 ownership，UI 停留在旧态时验证器会把旧态误当新态通过，或把正确产品行为误判失败。验证器中的 run 生命周期必须与生产调用路径一致。
