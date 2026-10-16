# 任务台账：正文层四漏整改收口

## 1. 目标与原话

用户确认执行四漏整改方案；本轮收口目标是把 D1-D6 全部修复、验证、登记，并完成经验回写、版本升级、清理与提交。

最终可感知行为：正文生成短稿失败后，targeted 修复只重跑 S2/S3，不再重复 S1；运行记录可对账当前运行包；终步打磨师高重合不再误报 warning；四漏有强制台账与经验门禁。

## 2. 门禁读证

- G0.3 诚实闭环：完成声明必须区分已验证、未验证与边界。
- G0.5 回头看：收尾前逐项对账台账、diff、证据与生产入口。
- G0.10 新旧并存清零：旧 `escalationFinalStep` 形态反查为 0。
- G0.11 真实交互冒充禁令：Electron 验证真实点击生成入口。
- G0.12 门禁执行台账：本文件为执行凭证。
- G1.5 验证器自身质量：断言锚点、样稿职责差异、manifest 对账均按本轮 v8.13 补充执行。
- G1.17 执行者自盲区：验证器自盲区与状态生命周期对账。
- G2.9 终稿与流水线：targeted 修复、attempt 账本、断点 owner 生命周期契约。

## 3. 路由判定

加入：G0.1、G0.3、G0.4、G0.5、G0.8、G0.9、G0.10、G0.11、G0.12、G1.1、G1.4、G1.5、G1.7、G1.8、G1.11、G1.12、G1.17、G2.9。

排除：

- G1.18 本地确定性路径：本轮无 local-transform 修改。
- G1.19 耗时观测：本轮不做性能优化，不使用耗时账本做决策。
- G2.11 供应商软错误：本轮无供应商协议改动。

## 4. 影响圈与作者反证

打算改：正文 attempt 执行规划、断点 stepOutputs、echo warning 单源、build manifest、run trace fingerprint、验证器与测试、四漏文档、经验文件、版本号。

可能碰到：其他链式层调用 `runStepSkills`、工作台 echo 展示、Electron 验证器、dist-renderer 新鲜度。

作者反证：

- 假设一：targeted 可直接复用断点产物。证伪结果成立：断点成功清理后产物消失，必须改为 attempt 闭包回传。
- 假设二：终步豁免只要升级路径修即可。证伪结果成立：主链仍无条件 warn，必须抽公共函数。
- 假设三：验证器天然正确。证伪结果成立：旧字符串锚点与无差异 S3 样稿都会制造假结论。

## 5. 停止条件

- D1-D6 在四漏台账均登记三层证据。
- 全量服务测试、type-check、build、真实 Electron 验证全部通过。
- DEV_LOG、经验文件、索引、版本号、lockfile 完成。
- 工作区无无关临时产物；提交后工作区干净。

## 6. 执行证据

- 全量服务测试：170 files / 1978 tests passed。
- `npm run type-check`：通过。
- `npm run build:vue`：通过。
- `node scripts/verify-owner-breakpoint-closure-electron.mjs`：PASSED。
- Electron 证据：`_audit/verification-owner-breakpoint-closure-electron/`。
- attempt 账本：`none / too_short / 4字 / 3请求` → `targeted / complete / 2000字 / 2请求`。
- 首链 S1 计数：1；targeted 生成请求包含 S1 产物；无 artifact-missing 降级。

## 7. 缺口清单

- Electron 使用本地 OpenAI-compatible provider，非外部 live 供应商矩阵。
- SKILL 层 S1 模板字数契约问题已转达，应用侧只保证注入点单次。
- 原始 021335 trace 未做逐 token 回放器；以同语义 Electron 复刻覆盖核心路径。
- 既有 build warning（chunk 超限、`vite.protocols.config.mts` 的 `__dirname`）为登记项，本轮不修。
