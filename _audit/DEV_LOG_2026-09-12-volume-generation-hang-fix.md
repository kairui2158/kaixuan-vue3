# 2026-09-12 卷纲生成挂死根因修复与 3.38.3 发布

## 项目功能

按 `PROPOSAL_2026-09-12_VOLUME_GENERATION_HANG_ROOT_CAUSE_FIX.md` 完成 3.38.2 卷纲生成挂死事故的根因修复，并发布 3.38.3 安装版。

## 用途

- 修复卷纲层 folder chain 在 16384 token reasoning-only 长流下的 UI 挂死，消除每个 chunk 全量过滤、截尾、滚动造成的近似平方级渲染压力。
- 将空正文后的静默直出重试变成用户可见、可取消、可导出的结构化过程，用户不再面对 8 分钟无反馈等待。
- 以 G1-G6 发布矩阵重建交付门，防止“功能测试通过”伪装成“发布压力与失败路径通过”。

## 根因

1. 模型层：`glm-5.3-sp` 在 S2 将 16384 completion tokens 全部消耗在 reasoning，正文为空；首次约 294 秒空正文，直出重试又约 240 秒空正文，重启可复现。
2. 应用执行层：`realSkillExecutor` 对 `reasoning_exhausted/empty` 的直出重试原本没有 UI、runTrace 与用户提示，形成静默二次长等待。
3. 渲染层：`aiService` 的流式回调语义为累计全文，每个 chunk 都触发 thinking 标签全量过滤；`PipelinePanel` 再全量过滤、截尾 500 字、更新响应式数组并滚动。长 reasoning 流近似 O(n²)。
4. 发布验证层：3.38.2 验证了产物有效性与状态一致性，但没有覆盖长流性能、真实 UI 长任务与安装版体感，因此单测绿灯但生产挂死。

## 修复点

1. 流式过滤改为增量流式状态机：跨块 thinking 标签保留尾部缓冲，请求结束统一 flush，`onChunk/onReasoning` 输出新增文本；相关实现位于 [aiService.ts](../src/services/aiService.ts:254)。
2. 流水线渲染改为 delta 累积 + `requestAnimationFrame` 节流合并，预览固定维护最新 500 字，滚动只在节流点执行，成功、取消、异常路径都强制 flush；实现位于 [PipelinePanel.vue](../src/components/pipeline/PipelinePanel.vue:1073)。
3. 直出重试可见化：执行器发出 `generation-invalid`、`direct-retry-start`、`direct-retry-finished` 结构化事件，流水线转成进度提示并进入运行记录；实现位于 [realSkillExecutor.ts](../src/services/realSkillExecutor.ts:609)。
4. 渲染进程资源观测：主进程记录长任务期间的 CPU、内存与流式回调压力，并输出 `renderer-pressure-high` 诊断；实现位于 [main.js](../electron/main.js:45)。
5. 发布门固化：新增 G2/G3 压力与失败路径 E2E、三入口 G4 E2E；`SHENYI_E2E_INSTALLED_EXE` 支持安装版实测，脚本位于 [verify-release-gate-g2-g3-e2e.mjs](../scripts/verify-release-gate-g2-g3-e2e.mjs:288) 与 [verify-release-gate-g4-three-entry-e2e.mjs](../scripts/verify-release-gate-g4-three-entry-e2e.mjs:9)。

## G1-G6 验证矩阵

| 门 | 内容 | 结果 | 关键证据 |
|---|---|---|---|
| G1 功能回归 | `npm run type-check`；`npx vitest run src/services/aiService.spec.ts src/services/providerTools.spec.ts src/stores/runTrace.spec.ts`；`npm run build:vue` | PASS | type-check 无错误；`3 passed / 102 tests passed`；Vue 构建成功 |
| G2 压力基准 | 2048 个 delta、约 131k reasoning 字符的长 reasoning-only 流 | PASS | UI 最大无响应窗口 `< 500ms`；run 记录 `generation-invalid`、`direct-retry-start`、`direct-retry-finished`；物理记录保留 reasoning |
| G3 失败路径 | timeout、用户取消、连续失败、空正文直出重试 | PASS | timeout/连续失败终态 failed；取消终态 canceled 且无 running API；空正文触发一次直出重试并给出“思考耗尽输出预算”解释 |
| G4 真实 UI | 源 Electron 三入口真实操作；3.38.3 安装版静默安装后同脚本实测 | PASS | 源与安装版均输出 `===== RELEASE GATE G4 THREE-ENTRY E2E PASSED =====`；主页、大纲工作台、流水线 folder chain 的流式、取消、重试、导出断言全部通过 |
| G5 版本封装 | 版本升级、构建、NSIS 配置、产物元数据与哈希 | PASS | `package.json`/`package-lock.json` 均为 `3.38.3`；`latest.yml` 为 `3.38.3`；`oneClick: false`、`allowToChangeInstallationDirectory: true`；SHA256 见下 |
| G6 文档闭环 | 本日志、经验 v4 规则回写、主索引登记 | PASS | 本文件、`神意开发经验总结_v4.md` §3/§6 新规则、`DEV_LOG_MASTER_INDEX.md` 新增 195/196 |

## 3.38.3 产物

- 安装包：`dist/神意助手-Setup-3.38.3.exe`
- 大小：`130,361,729 bytes`
- SHA256：`4DEF6210DD3607B38C2EC34151513988193E9799EDE2133F48F6B9861B0012A5`
- 签名状态：未签名
- G4 验证脚本修正：
  - `SHENYI_E2E_INSTALLED_EXE` 支持直接指向已安装版 `神意助手.exe`。
  - outline 取消导出断言补充 `sessionSnapshot: true`。
  - 流水线 folder skill 断言改为 `displaySkillName()` 的实际输出 `G4卷纲文件夹技能（文件夹）`。
  - 以上是验证脚本与产品语义不同步，不是产品缺陷。

## 安装版实测结论

1. 3.38.3 静默安装到临时目录并启动已安装的 `神意助手.exe`，G4 三入口全量通过：主页、大纲工作台、流水线 folder chain。
2. 首次验证沿用旧 profile 时，请求混入了历史会话文本；删除专用 profile 后用干净状态完整重跑，仍然全部通过。
3. 启动时出现的 `wa_project_p1788106336488`、`wa_project_p1788267167001` 存储损坏恢复日志来自 8 月 30 日和 9 月 1 日历史记录，属于既有用户数据状态提示，不是 3.38.3 新增缺陷，也不是封装问题。
4. 临时安装目录与 `_data/release-gate-g4-three-entry-profile` 已清理，未保留本轮验证残留。

## 已验证与未验证

- 已验证：G1 功能回归、G2 长流压力、G3 失败路径、G4 源与安装版三入口真实 UI、G5 封装元数据与哈希、G6 文档闭环。
- 未验证：真实外部供应商的 16384 token reasoning-only 挂死复现。G2-G4 使用可控 mock provider 驱动同形态长流与失败路径，这是为了避免消耗用户供应商额度并保证场景可复现；如客户实测再次遇到同类现象，请导出 run trace 交回。

## 收尾

1. `package.json` 与 `package-lock.json` 版本统一为 `3.38.3`。
2. `dist` 仅保留 3.38.3 安装 exe 与 blockmap。
3. 测试 profile 清理后用目录扫描复核；无未关闭进程。
