# TASK LEDGER 2026-11-18 zero-usage guard v1

## 1. 目标与原话

- 用户确认执行：守卫收严 + fakeSuccess 终态短路 + 回归测试 + 打包交付。
- 最终可感知行为：网关零 usage 但返回合法信封或实质正文时不误杀，短兜底文案继续拒绝，重试耗尽后正文编排短路为供应商终态，产出 3.130.0 安装包。

## 2. 门禁读证

- G0.1/G0.3/G0.5/G0.6/G0.7/G0.8/G0.9/G0.12：`_audit/神意开发经验总结_v9.md` G0 层。
- G1.4-G1.13/G1.21：测试、验证、封装与临时脚本生命周期门禁。
- G2.9/G2.11：终稿流水线与供应商响应合同，`_audit/神意开发经验总结_v9.md:600-628`；本轮新增 usage 形态不得推翻内容合同条目。

## 3. 路由判定

- 纳入 G0.3/G0.12/G2.9/G2.11：本项是供应商合同与流水线终态行为。
- 排除 G0.11：Electron 打包校验只验证启动与壳层，不冒充用户业务操作。
- 排除 G1.16：本轮不是经验复盘型开发，只有单条新规则提炼。

## 4. 影响圈与作者反证

- 打算改：provider 响应分类、zero-usage 分支、fakeSuccess 终态、相关回归测试、版本、经验与日志。
- 可能碰到：流式 delta 聚合、供应商异常 usage、正文编排 terminalApiError 消费。
- 作者反证：若合法短正文被豁免会重新产生 fakeSuccess，用 1000 字符与 CJK 0.65 双门槛和信封合同收窄；若 executor 耗尽错误丢失 fakeSuccess 会继续重试，用双侧回归测试证伪。

## 5. 停止条件

- 全量服务、type-check、build:vue、electron-builder、verify:packaging 全部机器可判 PASS。
- fakeSuccess 保持拒绝旧语义测试、合法信封豁免测试、executor 单次调用与 terminalApiError 测试全部 PASS。

## 6. 执行证据

- 代码：`providerResponseContract.ts:89-100,111,129-146`；`aiService.ts:1399-1410,2525-2558`；`realSkillExecutor.ts:1768-1773`。
- 回归：`providerResponseContract.spec.ts:157-181`、`realSkillExecutor.spec.ts:131-173`。
- 全量：254 files / 2829 tests PASS；`vue-tsc --noEmit` PASS；trace 原始候选复现 usable；`verify:provider-channel-live` 6 requests PASS。
- 打包历史：3.130.0 首次安装包 SHA-256 `57c9e83ae215645a936c71336034caf541387bafb93e31068ebe9bdea838e10c`；`verify:packaging` 输出 `PACKAGING 3.130.0 VERIFICATION PASSED`，rendererFiles=87，electronAPI methods=94。
- 打包终态：3.130.1 安装包 SHA-256 `a0dd6b09c1296232d10e1fcc50920ffd016f0900691f22029a1f22e1d15b938e`；证据见 `_audit/verification-packaging-3.130.1/`。
- 经验：`_audit/神意开发经验总结_v9.md:625` 新增 G2.9 条目。

## 7. 缺口清单

- 残留清理缺口：`dist2/`、`dist4/`、`dist5/` 初次被系统级句柄锁定并登记为环境事件；最终定位到 Codex NodeService 进程 `ChatGPT.exe:20172`，只关闭三个 asar 文件句柄后全部删除，不影响提交、安装包或封装校验。3.129.0 旧安装包主文件与 blockmap 已删除。
- 缺陷面枚举：已排查 provider contract、stream normalization、zero-usage 分支、fakeSuccess executor 终态、terminalApiError 消费、回归语义、版本与打包校验；命中并修复 zero-usage 形态误杀与耗尽终态缺失。360 防护反复锁新建产物为环境事件，不改源码；临时 `rcedit-test.exe` 与临时探针已列入清理。
- V1.1 漏改登记：首版只收口 transport/stream 层，漏掉 terminal `classifyGenerationValidity`；trace `20261118-015557` 中坏 JSON 信封 10,115B / CJK 8,379、重试候选 5,121B / CJK 4,260 均被判 empty。已补 `generationValidity.ts` credible gate，新增坏信封与实质正文回归，全量 2829 tests PASS。补验纪律缺口：先补原始 trace 复现（002/007 usable）与真实供应商 live 通道（6 requests PASS），再升级 3.130.1 重新封装。
- 版本登记漏项：3.130.1 升级后 `package-lock.json` 仍停在 3.128.9；本轮由递归对账发现，已用 `npm install --package-lock-only` 同步，未引入依赖变化。
- G1.3 双实现登记：`aiService.ts` 的 `hasCredibleZeroUsageStreamContent` 与 `generationValidity.ts` 的 `hasCredibleZeroUsageArtifact` 重复维护 1000 字符 + CJK 0.65 + LHC 信封豁免阈值；功能当前一致，但后续阈值演进若只改一处会产生 transport 与 terminal 分类分叉。后续应提取单一共享判定函数并双路引用；本轮不改码，避免交付面扩大。
