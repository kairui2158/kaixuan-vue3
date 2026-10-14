# 任务台账：reasoning-only 卡流语义重试

## 1. 目标与原话

- 用户原话：开始执行；回头看+修复；你卡住了么；把中断的继续执行；有遗漏和未闭环的么；把未闭环的闭环了。
- 目标行为：reasoning-only 流被稳定识别为 `reasoning_only_stalled`，第一次发生时协议感知重试，第二次终态失败；run trace 记录完整证据；可见 Electron 真实 UI 验证完整通过；完成版本升级、提交与封装。
- 交付物：watchdog、一次性语义重试、协议识别修正、trace 诊断字段、测试注入链路、Electron 验证器与 deep payload 解引用、DEV_LOG、台账、3.88.0 封装。

## 2. 门禁读证

- G0.3：区分单测、Electron、打包验证，不用 mock 冒充真实 UI。
- G0.5：收尾逐行审 diff，重点检查旧内联正文断言是否残留。
- G0.8：清理一次性 profile、旧安装包与 blockmap。
- G0.11：Electron 验证必须真实启动、真实点击、真实 provider 请求、真实落盘。
- G0.12：七节台账完整。
- G1.13：Electron 使用独立 profile、`SHENYI_DATA_DIR`、可见窗口与超时守卫。

## 3. 路由判定

- 加入：G0.3、G0.5、G0.8、G0.11、G0.12、G1.13。
- 排除 G1.10 权限门：本任务不改变 API 直写授权语义。
- 排除 G1.19 性能门：本任务解决卡流收敛与可观测，不声明整体生成耗时优化。

## 4. 影响圈与作者反证

- 已改面：`aiService`、`providerProtocols`、`realSkillExecutor`、`PipelinePanel`、`runTrace`、`vite.config.mts`、`env.d.ts`、专项测试、Electron 验证器。
- 可能被误伤面：slow-stream-tolerant 请求、普通网络超时、reasoning 模式本就为 off 的请求。
- 高危假设一：“reasoning 到达即健康”。反证：reasoning 只证明连接活着，不证明任务会产出正文；必须有 body/tool-progress 判定。
- 高危假设二：“失败后继续物理重试即可”。反证：同一语义形态重试大概率复现卡流；必须先切换语义（禁思考或提高输出预算）。
- 高危假设三：“run trace 找不到正文就是产品丢正文”。反证：deep 导出按契约外置 payload；必须解引用后判断。

## 5. 停止条件

- 完成：专项测试通过；type-check 通过；15 秒 override 的 renderer build 通过；可见 Electron 验证完整输出 PASS；临时 profile 清理；版本升至 3.88.0；完整 NSIS build 与打包核验通过；提交后工作区干净。
- 失败：reasoning-only 流仍悬挂到整轮超时；第二次卡流继续重试；成功 physical call 缺正文证据；Electron 验证用 mock 冒充；旧 3.87.0 安装包残留；任一验证命令 exit 非 0。

## 6. 执行证据

- 专项：`npm run test:services -- src/services/aiService.spec.ts` → 1 file / 171 tests passed。
- `npm run type-check` → exit 0。
- `$env:SHENYI_BODY_ABSENT_TIMEOUT_MS='15000'; npm run build:vue` → exit 0。
- Electron：`node scripts/verify-reasoning-only-stall-electron.mjs` → `===== REASONING ONLY STALL ELECTRON PASSED =====`；2 次物理请求，`reasoning_only_stalled` → `thinking_disabled`，1 卷持久化。证据：[_audit/verification-reasoning-only-stall-electron/report.json](_audit/verification-reasoning-only-stall-electron/report.json)。
- 打包与提交证据见 DEV_LOG 封装节。

## 7. 缺口清单

- 本轮 Electron 只覆盖 OpenAI-compatible provider；Anthropic/Gemini 等 live 形态未纳入真实 UI 证据面。
- `max_tokens_raised` 已有单测，无独立 Electron 双协议实测。
- Vite 既有 chunk 体积与 `__dirname` warning 属历史配置项，不在本任务修改。
