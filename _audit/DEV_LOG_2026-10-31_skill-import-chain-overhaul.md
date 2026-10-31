# DEV_LOG_2026-10-31_skill-import-chain-overhaul

## 目标

按用户确认的 V2.1 方案，收口设置页技能/智能导入链路，并完成 `chatHistory: latest/all` 旧语义退役：

1. store/导入面旧语义单源迁移为 `recent` 并落盘。
2. folder SKILL 磁盘包成为 contextPolicy 权威源，旧语义经体检报错阻断回流。
3. 流水线、大纲工作台、主页共创三面消费同一运行时水合源。
4. 真实 Electron UI 验证导入、覆盖导入、缓存失效与物理请求组装，不用单测替代用户入口。

## 交付内容

- 新增 `src/services/skillIdentity.ts`：`normalizeContextPolicy` 统一 store/导入面迁移语义。
- `src/stores/skill.ts:181-190`：`loadSkills` 迁移旧 `chatHistory` 并自动 `saveSkills()` 落盘。
- `src/services/skillHealth.ts`：folder 包内 `latest/all` 报 error；体检新增元数据维度。
- `src/services/folderSkillRuntimeHydration.ts`：三面运行时统一水合磁盘 template/meta/intents/contextPolicy。
- `ChatPanel.vue`、`OutlineWorkspace.vue`、`PipelinePanel.vue`：接入统一水合源。
- 配置导入导出协议升级 v3，`protocolVersion` 与 folder 业务 `version` 分离，v2 兼容 warning。
- folder 记录构造器、版本回退、ZIP 二进制导出安装等价收口。
- 新增真实 Electron UI 验证器 `scripts/verify-skill-context-policy-v21-electron.mjs`。

## 验证过程

1. `npm run build:vue` exit 0，renderer bundle 晚于源码，满足 `assertFreshRendererBuild()`。
2. `node scripts/verify-skill-context-policy-v21-electron.mjs`：
   - 第一轮暴露验证器自身缺口：本地 mock 对所有请求返回 SSE。`/models` GET 与 `stream:false` chat 都被喂成 SSE，应用非流式 `resp.json()` 解析得到 null，出现 `Cannot read properties of null (reading 'json')`。
   - 按 URL 分流 `/models` 后，剩余错误来自 `stream:false` 非流式 chat，继续按请求体分流为 JSON 响应。
   - 最终复跑输出 `===== SKILL CONTEXT POLICY V2.1 ELECTRON PASSED =====`，无 `[PAGE ERROR]`。技能测试从“只断言请求报告”加强为同时断言两次结果 `CONTEXT_POLICY_TEST_OK`。
3. `npx vue-tsc --noEmit` exit 0。
4. `npx vitest run` 首跑 `de-ai-v2.spec.ts > keeps detection and change-rate gates under the 20k-character budget` 失败，`319.2682 < 300` 断言不成立；该用例单文件复跑 14/14 通过，全量复跑 234 files / 2500 tests 全通过。判定为全量并发下的性能阈值波动，未修改产品与测试阈值。

## 证据

- UI 报告：`_audit/verification-skill-context-policy-v21-electron/report.json`
- 物理请求：`_audit/verification-skill-context-policy-v21-electron/provider-requests.json`
- 迁移后持久化：`persisted-skills-after-load.json`、`persisted-skills-after-overwrite.json`
- 界面终态：`final-state.png`
- 台账：`_audit/TASK_LEDGERS/TASK_LEDGER_2026-10-31_skill-import-chain-overhaul.md`

## 教训回写

- G0.10：旧语义退役必须同时清理 store、导入面、磁盘权威源与运行时消费面；本轮 `latest/all` 已全链路清零。
- G1.5：验证器自身也必须按请求协议分流 mock 响应，不能把“断言通过”当成完整成功；本轮把技能测试结果文本升级为硬断言。
- G1.25：folder 记录构造、协议版本字段、运行时水合均收敛单源，避免多入口漂移。
