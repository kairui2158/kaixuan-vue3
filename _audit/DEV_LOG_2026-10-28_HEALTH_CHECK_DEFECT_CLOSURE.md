# DEV_LOG 2026-10-28 健康检查缺陷与风险闭环

## 1. 目标

处理健康检查暴露的缺陷与风险：验证器销毁证据、用途按钮无法取消、IPC `An object could not be cloned`、依赖漏洞，以及需要登记的工具链与安全策略风险。核心要求是按经验文件诚实闭环，不把相邻入口修复冒充根因修复。

## 2. 根因与实现

### 2.1 IPC clone 事故

第一轮判断为 storage/crypto IPC 携带 reactive proxy，随后在 `electron/preload.js` 的 `storageWrite`、`safe:encrypt`、`safe:decrypt` 加了 cloneable snapshot。复跑 Electron 直写矩阵后报错仍存在，证明该判断只覆盖相邻入口，不是根因。

继续解析报错堆栈 chunk 偏移后定位到 outline journal flush：`outlineJournalApply(projectId, commands, options)` 的 commands 长期驻留在渲染层 journal 队列中，队列对象来自 Vue/Pinia reactive 状态，跨 IPC 时被结构化克隆拒绝。

最终修复：

- 新增 `src/utils/cloneableSnapshot.ts`：`structuredClone` 优先，失败时退到 JSON snapshot，与持久化格式一致。
- `src/stores/project.ts`：`queueOutlineJournalCommand` 入队前调用 `toCloneableSnapshot(command)`，保证队列内从入队起就是 plain object。
- `electron/preload.js`：outline journal apply/migrate/restore、storageWrite、encrypt/decrypt 统一过 cloneable snapshot。
- `src/main.ts`：浏览器 shim 的 `storageWrite` 同步接单源快照。
- `src/stores/project.spec.ts`：新增 reactive 状态 append/update 后 flush 的 `structuredClone(commands)` 守卫。

### 2.2 用途按钮取消

`setGenerateProvider/setVerifyProvider/setDetectProvider` 原来只接受 string，UI 取消传空字符串会形成哨兵值。本轮 setter 接受 `string | null` 并归一 `id || null`，`ApiSettings.vue` 取消分支传 null，避免空字符串进入持久化和通道解析。

### 2.3 验证器证据保护

`verify-pipeline-provider-channel-electron.mjs` 原来启动即 `rmSync(EVIDENCE_ROOT)`，会把已提交证据一并销毁。本轮改为 `archiveEvidenceRoot()`：默认清理前可按 KEEP 开关归档到时间戳目录；本轮用 `SHENYI_KEEP_EVIDENCE_ARCHIVE=1` 实测归档生效。

### 2.4 依赖

- `dompurify` `^3.4.14` → `^3.4.17`（critical 修复）。
- `vue` `^3.5.41` → `^3.5.44`（连带修复 `@vue/server-renderer` high）。
- `sharp` 相关 2 个 high 属传递依赖，需要 breaking 升级，本轮登记不修，不伪装成已解决。

## 3. 验证

- 定向：5 files / 37 tests passed（project、cloneableSnapshot、provider、ApiSettings、storage IPC）。
- 类型：`npm run type-check` exit 0。
- 构建：`npm run build:vue` 成功。
- Electron 直写矩阵：wire-openai / wire-anthropic / wire-gemini / wire-azure 全 PASS，各 requestCount=2，clone 报错 0。这是本轮 clone 根因修复的核心验收。
- 通道矩阵：`verify:provider-channel-electron` PASS，`mode=mock-four-layer-providers`，`requests=3`。
- 归档双证：`SHENYI_KEEP_EVIDENCE_ARCHIVE=1` 重跑 PASS，生成 `_audit/verification-pipeline-provider-channel-archive/2026-10-28T09-37-20-814Z/`。
- 全量：`npm run test:services` 221 files / 2384 tests 全过。
- 生产接线：`npm run verify:production-wiring` 无违规（541 modules）。

## 4. 教训回写

经验文件 v9.6.6 → v9.6.7，G1.5 追加判则：

- IPC 边界所有传对象/数组的 invoke 通道必须统一走 cloneable snapshot 单源，禁止各入口手写复制的序列化逻辑。
- 修 clone 类错误必须先解报错堆栈与 chunk 偏移定位真实调用链；第一轮 storage/crypto 补丁属于相邻入口猜测，复跑仍红后必须继续下钻，禁止把局部补丁声明为根因修复。

## 5. 封装

- 版本：3.110.4 → 3.110.5（`package.json`、`package-lock.json`）。
- 构建：`npm run build` exit 0。
- 安装包：`dist/神意助手-Setup-3.110.5.exe`，231,643,280 bytes，SHA256 `054883A592791119247A957240C68903B1D2017F81131E52B0867E36FF710333`。
- `dist/latest.yml` version 3.110.5；exe FileVersion/ProductVersion 3.110.5。
- 旧 3.110.4 安装包与 blockmap 已清理，dist 只保留 3.110.5 一套。

## 6. 诚实边界

- 本轮未新增 live API 真实请求；clone 与通道行为由 mock Electron 矩阵验证，直写矩阵使用本地 mock 供应商协议，不冒充 live。
- sharp 2 个 high、Electron `no-sandbox`、stylelint/Biome 门禁接入为登记未修项。
- 未执行 NSIS 人工安装路径核验；本轮核验安装包产物、版本、latest.yml 与 SHA256。

## 7. 台账

`_audit/TASK_LEDGERS/TASK_LEDGER_2026-10-28_HEALTH_CHECK_DEFECT_CLOSURE.md`
