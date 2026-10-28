# 2026-10-28 健康检查缺陷与风险闭环任务台账

## 1. 目标与原话

用户原话：「缺陷和风险根据经验文件教训然后进行修复和消除」。

最终可感知行为：健康检查发现的 P0/P1/P2 缺陷完成修复或显式登记；验证器不再销毁已提交证据；生成/验证/识别用途按钮可取消且不再产生空字符串哨兵；`An object could not be cloned` IPC 事故按真实根因（outline journal 携带 Vue reactive proxy 跨 IPC）修复，四供应商直写矩阵 clone 错误归零。

本轮交付物：cloneable snapshot 单源工具与 IPC 边界接线、outline journal 入队快照、用途 setter 空值守卫、证据归档策略、依赖升级（dompurify/vue）、新增测试、经验 v9.6.7 回写、DEV_LOG/索引、3.110.5 封装与仓库收口。

## 2. 门禁读证

读证文件：`_audit/神意开发经验总结_v9.md`（执行时 v9.6.6，收口升级 v9.6.7）。

- G0.3：mock、live、单测分层声明；clone 修复以 Electron 验证器真实报错归零为准，不用单测冒充真实链路。
- G0.4：执行前复读最新 DEV_LOG 与经验文件；执行后回写经验、DEV_LOG 与索引。
- G0.5：收尾前逐行审 diff，复核生产入口、验证器、测试、构建、封装和工作区。
- G0.8：旧 3.110.4 安装包与 blockmap 清理后复核 dist 只剩 3.110.5。
- G0.9：影响圈覆盖 preload、storage/crypto IPC、outline journal、设置页、provider store、浏览器 shim、测试、验证器、依赖与封装。
- G0.12：本台账七节齐全，并由 DEV_LOG 链接。
- G1.1：源码与文档逐行编辑；版本与 package-lock 同步。
- G1.5：验证器修改后完整重跑；证据目录启动前归档旧现场，KEEP 开关生效。
- G1.7：preload/渲染层改动后重建 Vue 产物，再跑 Electron 验证器。
- G1.12：版本、latest.yml、exe FileVersion、SHA256 核验后提交。

## 3. 路由判定

加入门禁：G0.1、G0.3、G0.4、G0.5、G0.8、G0.9、G0.12、G1.1、G1.5、G1.7、G1.12。

排除项及理由：

- G0.2：用户已明确不设预算，本轮不设 token、时间或轮次预算。
- G0.10：未删除链路或迁移执行语义，属于缺陷修复与防御加固，不涉及旧语义清零。
- G0.11：本轮无“用户可通过 UI 完成 X”的目标交互验证；按钮取消语义由组件测试与 Electron 验证链路覆盖。
- G2.x：未迁移数据根、未改 SKILL 协议，G2 领域门禁不适用。

## 4. 影响圈与作者反证

打算改的：`src/utils/cloneableSnapshot.ts`、`electron/preload.js`、`src/stores/project.ts`、`src/main.ts`、`src/stores/provider.ts`、`src/components/settings/ApiSettings.vue`、`scripts/verify-pipeline-provider-channel-electron.mjs`、相关 spec、依赖版本、审计文档。

可能碰到的：storage 读写、safe encrypt/decrypt、outline journal apply/migrate/restore、浏览器环境 shim、供应商用途取消、验证器证据留存、安装包体积与依赖解析。

作者反证：

1. 假设「storage/crypto 入口加 cloneableSnapshot 就能修 clone 报错」。证伪：修复后 Electron 直写矩阵仍复现 `An object could not be cloned`；继续解报错堆栈 chunk 偏移，定位到 outline journal flush 的 `outlineJournalApply(commands, options)`，证明第一轮是相邻入口猜测式补丁，不是根因。
2. 假设「preload 内统一快照即可」。证伪：journal 队列在渲染层长期保存对象，若入队时不做快照，用户继续在聊天状态产生响应式更新，队列内对象仍可能是 reactive proxy；因此 `queueOutlineJournalCommand` 必须在入队前落 plain snapshot。
3. 假设「用途取消传空字符串与 null 等价」。证伪：空字符串会进入持久化与通道解析，形成“看似未选但仍有哨兵值”的旧语义；本轮 setter 归一为 null，并用测试守护。
4. 假设「验证器清理证据目录只是小事」。证伪：证据目录已提交后仍被 `rmSync` 销毁，违反不可再生证据保护；改为时间戳归档并用 KEEP 开关验证。

## 5. 停止条件

1. `verify-api-direct-write-provider-wire-electron.mjs` 四供应商全 PASS，且 clone 报错为 0。
2. outline journal 在 reactive 聊天状态 append/update 后 flush，`structuredClone(commands)` 不抛错，replace 命令字段完整。
3. 生成/验证/识别取消后 store 为 null，不残留空字符串。
4. provider-channel 验证器 PASS；`SHENYI_KEEP_EVIDENCE_ARCHIVE=1` 时旧现场归档到时间戳目录。
5. 定向测试、全量服务测试、type-check、build、production wiring 全部通过。
6. 经验 v9.6.7、DEV_LOG、索引、台账、3.110.5 安装包、SHA256/latest.yml/exe 版本、干净工作区完成。

## 6. 执行证据

- 单源快照：`src/utils/cloneableSnapshot.ts:5`；IPC 接线 `electron/preload.js:3`、`electron/preload.js:19-29`、`electron/preload.js:41-62`。
- Journal 入队快照：`src/stores/project.ts:34`、`src/stores/project.ts:985-990`；reactive 守卫测试见 `src/stores/project.spec.ts`。
- 用途取消：`src/stores/provider.ts:194-208` 归一 `id || null`；`src/components/settings/ApiSettings.vue:399-408` 取消传 null。
- 证据归档：`scripts/verify-pipeline-provider-channel-electron.mjs:651-665`；归档现场 `_audit/verification-pipeline-provider-channel-archive/2026-10-28T09-37-20-814Z/`。
- 定向测试：`npx vitest run src/stores/project.spec.ts src/utils/cloneableSnapshot.spec.ts src/stores/provider.spec.ts src/components/settings/ApiSettings.spec.ts electron/ipc/storage.spec.js` → 5 files / 37 tests 全过。
- 类型与构建：`npm run type-check` exit 0；`npm run build:vue` 成功。
- 直写矩阵：`node scripts/verify-api-direct-write-provider-wire-electron.mjs` → wire-openai/anthropic/gemini/azure 全 PASS，各 requestCount=2，clone 错误 0。
- 通道矩阵：`npm run verify:provider-channel-electron` → PASS，`mode=mock-four-layer-providers`，`requests=3`。
- 全量测试：`npm run test:services` → 221 files / 2384 tests 全过。
- 生产接线：`npm run verify:production-wiring` → 无违规（541 modules）。
- 归档双证：`SHENYI_KEEP_EVIDENCE_ARCHIVE=1` 重跑 provider-channel 验证器 PASS，并生成上述时间戳归档目录。

## 7. 缺口清单

- 已修复：outline journal clone 根因、preload/storage/crypto IPC 边界快照、用途取消空字符串哨兵、验证器销毁证据问题、dompurify critical、vue/@vue/server-renderer high。
- 已登记未修：sharp 相关 2 个 high 属传递依赖，需要 breaking 升级链路，另行立项；Electron `no-sandbox` 策略、stylelint/Biome 门禁接入为健康检查遗留项，本轮未动。
- 诚实边界：本轮为 mock Electron 矩阵与本地验证，未新增 live API 真实请求；live 行为沿用已验证供应商链路，不冒充本轮 live 证据。
