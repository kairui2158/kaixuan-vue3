# TASK_LEDGER: body-final-ledger-v1-1

## 1. 目标
- 退役终步账本 `extractedMeta[N]` 与 `ledger_limit` 的 `- ` bullet 前缀，统一为 SKILL `checkHandoff` 可识别的无前缀固定行。
- 为生成流水线补接已有 `RealSkillPackage.fingerprint` 到既有 `RunTracePromptSnapshot.folderFingerprint`，不新增字段或账本。

## 2. 影响圈
- 已改：`src/services/chainExecution.ts`、`src/services/chainExecution.spec.ts`、`src/components/pipeline/PipelinePanel.vue`。
- 复核无影响：`src/services/finalStepMetadataReplay.spec.ts` 只校验账本内容，不锚 bullet 形态。
- 不改：SKILL 文件夹、候选保留策略、运行记录导出、历史 trace、`DEV_LOG_MASTER_INDEX.md` 既有用户改动。

## 3. 执行项与验收
- P0-1：`formatFinalStepLedger` 的 `extractedMeta` 展开行与截断尾行去前缀。
- P0-1 守护：终步账本测试同批迁移为无前缀正断言，并新增行首旧 bullet 负向断言。
- P1：流水线 `loadRealSkill` 成功且存在 fingerprint 时，用既有 `attachPromptSnapshot` 记录目录指纹；通过 `apiCallId` 挂回当前 API 调用。
- 验收：旧形态扫描清零、定向与全量服务测试通过、type-check 通过。

## 4. 门禁记录
- [x] G0.3 诚实闭环：本轮覆盖应用源码与运行记录结构；真实供应商正文链未重复调用，沿用方案已核对的运行证据，不冒充 live PASS。
- [x] G0.6 成熟度：采用 V1.1 已批准最小方案；不扩展信封、不新增 fingerprint 状态源。
- [x] G0.9 七面影响圈：生产格式器、生产流水线、测试契约、trace 快照、diff 面已复核。
- [x] G0.10 旧语义清零：现役执行面无 `- extractedMeta[` / `- ledger_limit:`；负向测试锁定旧行首形态。
- [x] G0.12 台账：本文件七节完整。
- [x] G0.13 最小必要性：复用 `folderFingerprint` 与 `attachPromptSnapshot`，零新增类型、配置或第二账本。
- [x] G1.4 验证真实性：mock 与类型验证为主；真实 SKILL 活体执行按方案边界不做假证。

## 3.1 路由判定
- 排除 G1.12：本轮不封装、不改版本号。
- 排除 G1.5：无真实供应商执行前置；P1 属补接线，已有 Electron/Trace 面继续按历史证据对账。

## 5. 证据
- Before：终步账本输出 `- extractedMeta[...]: ...`；SKILL 只认无前缀 `extractedMeta[0]: ...`，18 字段可假失败。
- After：`src/services/chainExecution.ts:163` 输出 `extractedMeta[index]: ...`；`:184` 输出 `ledger_limit: ...`。
- 测试：`src/services/chainExecution.spec.ts:151-152` 锚新形态并负向拒绝行首 `- extractedMeta`。
- P1：`src/components/pipeline/PipelinePanel.vue:3251-3261` 在 `loadRealSkill` 成功后写入 `folder-fingerprint` 快照；`src/stores/runTrace.ts:2101-2136` 既有挂载逻辑通过 `apiCallId` 关联。
- 挂载时机自查：快照最初挂载在 `startApiCall` 之前，`apiCallId` 为空导致无法关联 API 调用；已修正为 `startApiCall` 之后挂载并加 `traceCallId` 守卫。当前顺序 `PipelinePanel.vue:3251 -> 3267` 经 rg 复核成立。
- 导出边界补全：文本导出快照段新增 `目录指纹：file:hash` 行，未声明时输出 `-`；新增 prompt snapshot 导出契约测试锁定展示形态。
- 发布封装：`npm run build` 产出 `dist\神意助手-Setup-3.114.2.exe`；`npm run verify:packaging` 启动打包应用并通过 electronAPI/渲染壳检查，SHA256 `a8769d41...4b8f`。
- 定向验证：`npx vitest run src/services/chainExecution.spec.ts src/services/finalStepMetadataReplay.spec.ts` → `2 files / 29 tests passed`。
- 全量验证：`npm run test:services` → `247 files / 2661 tests passed`。
- 类型验证：`npm run type-check` → exit 0。
- 清零扫描：`rg -n -- "- extractedMeta\[|- ledger_limit:" src electron scripts` → `CLEAN: legacy bullet forms=0`。

## 6. 偏差与作者反证
- 风险：快照可能污染 prompt diff 对账。反证：复用同一 `apiCallId` 挂载路径，diff 仍按 calls 到 snapshots 的既有关联读取；P0 内容测试无回归。
- 风险：SKILL 目录缓存的 fingerprint 过期。反证：`loadRealSkill` 自带 5 秒 TTL 缓存与 loader 指纹归一化，本轮只接数据源，不改缓存语义。
- 盲区：真实链路导出 UI 是否展示快照没有新开验证；类型、diff 与既有导出测试已覆盖数据面，UI 展示状态为沿用既有行为。

## 7. 收尾
- [x] DEV_LOG 与总索引登记。
- [x] 旧形态清零、定向/全量测试、type-check。
- [x] 发布封装：重新封装完成且打包验证通过。
