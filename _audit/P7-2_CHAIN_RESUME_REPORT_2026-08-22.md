# P7-2 Chain 断点续跑报告

日期：2026-08-22

## 结论

**P7-2：PASS（应用层受控故障恢复闭环）**

## 勾选清单

- [x] 双 Skill chain 配置通过流水线 UI 建立。
- [x] 第一个 Skill 成功后保存 `lastSuccessChainIndex` 和 `lastOutput`。
- [x] 后续 Skill 受控 HTTP 503 失败时保留断点。
- [x] Electron 强制退出后断点仍在本地存储。
- [x] 重启恢复时只调用失败的后续 Skill，不重复成功 Skill。
- [x] 上一步输出传给恢复执行的 Skill。
- [x] 全部成功后断点清除。
- [x] `npm run build` 构建与 Electron 打包完成。
- [ ] 本轮收尾阶段的 `start-electron.bat` 再启动复核：环境阻塞，命令载体返回“系统找不到文件”。核心恢复验证已有前一轮新鲜 Electron/CDP 证据。
- [x] 本轮规则已追加经验文件。
- [x] 本轮开发日志已生成。

## 代码证据

- `src/stores/pipeline.ts:79`：`refreshBreakpoint()` 从 Electron 持久化重新读取断点。
- `src/stores/pipeline.ts:176`：store 暴露 `refreshBreakpoint`。
- `src/components/pipeline/PipelinePanel.vue:1679`：chain 开始前刷新断点。
- `src/components/pipeline/PipelinePanel.vue:1681-1691`：按项目和 Skill 索引恢复起点及 `prevResponse`。
- `src/components/pipeline/PipelinePanel.vue:1732`：每个成功 Skill 保存断点。
- `src/components/pipeline/PipelinePanel.vue:1940-1945`：失败时提示保留断点和下一恢复步骤。

## 实测证据

失败阶段断点：`step=1, projectId=proj-1787385731254, lastSuccessChainIndex=0, lastOutput=P7_2_STEP1_OK`。

重启恢复阶段：`callCount=1, resumedFromPreviousOutput=true, firstBodyMentionsFirstSkill=false, generationStatus=done, breakpoint=null`。

这组证据说明恢复从第二个 Skill 开始，第一 Skill 没有重复执行，并在链成功后清除断点。

## 边界

本报告只覆盖设定层双 Skill chain 和受控 HTTP 503。供应商实际网络稳定性、章节层 40 章长链、章节补充生成与多卷断点隔离不在本轮 PASS 范围内。

## 交付物

- 经验：`_audit/神意开发经验总结.md`
- 日志：`_audit/DEV_LOG_2026-08-22-P7-2-chain-resume.md`
- 报告：`_audit/P7-2_CHAIN_RESUME_REPORT_2026-08-22.md`
