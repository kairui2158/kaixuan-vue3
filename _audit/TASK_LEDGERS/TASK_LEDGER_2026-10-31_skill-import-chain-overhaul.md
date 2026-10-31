# TASK_LEDGER_2026-10-31_skill-import-chain-overhaul

## 1. Objective

修复设置页技能/智能导入链路：folder SKILL 身份、协议、版本、运行时元数据、导入导出等价性、死代码与健康检查全链路收口，达到 ZIP 安装、单文件夹导入、批量导入、配置导入导出、运行时消费六处同一事实源。

硬性验收：

1. 三个 UI 入口构造的 folder 记录关键字段一致。
2. 版本导出/回退以 Electron 技能库为定位源，不靠字符串拼路径。
3. 协议 v3 完整携带 `meta/intents/resourceSummary/contextPolicy`，v2 旧文件可读且给出兼容诊断。
4. 流水线、大纲工作台、主页共创、健康检查共享磁盘元数据加载器。
5. ZIP 导出再安装关键字段与资源等价；二进制资源不被 UTF-8 文本写盘损坏。
6. 旧语义死代码删除，不能出现新旧双路径并存。
7. 测试矩阵覆盖红灯与绿灯路径，含 text+folder 同名绑定、持久化重载、三面真实消费。

## 2. Gate Evidence

- 经验文件：`_audit/神意开发经验总结_v9.md` 已读取，执行 G0.12 台账、G0.5 回头看、G1.3 全入口收口、G1.4/G1.5 验证分层、G2.13 SKILL 中立、G2.14 存储迁移。
- 技能：incremental-implementation、verification-gate 已读取并遵循。
- 基线：git HEAD `6e5dffe5a82c7f0dd522570d6328178e026d04e1`；开工时工作区干净。
- 关键读证：
  - `src/stores/skill.ts`: id 归一化、overwrite 残留字段、loadSkills 数组分支、importSkills 共享调用。
  - `src/composables/useSkillPackageInstall.ts`: ZIP 安装手写 folder 记录。
  - `src/components/settings/SkillSettings.vue`: 单文件夹导入、批量导入、版本回退手写逻辑。
  - `src/services/folderSkillBatchImport.ts`: 服务层第四份记录构造器。
  - `src/services/configExchange/*`: 协议白名单、类型、序列化/反序列化。
  - `electron/ipc/skill-package.js`: safeId、版本目录、版本列表、导出。
  - `electron/ipc/skill-loader.js`: folder 完整元数据加载源。
  - `src/services/skillRouter.ts`、`src/services/workspaceSkillEngine.ts`: 运行时 folder 消费面。
  - `src/composables/useConfigExchange.ts`: 协议导入导出调用点。

## 3. Routing Decision

采用已批准八步方案，按增量执行：

1. 统一 folder 记录构造器。
2. 版本闭环：列表、导出、回退统一 Electron 库定位；prerelease 纳入版本识别。
3. 协议 v3 与 v2 兼容。
4. 运行时元数据统一加载器。
5. 导入导出真实目录等价往返。
6. 死代码清零。
7. 健康检查补元数据维度。
8. 测试矩阵与全量验证。

## 4. Impact Circle And Author Counter-Evidence

影响文件：

- `src/stores/skill.ts`
- `src/composables/useSkillPackageInstall.ts`
- `src/composables/useConfigExchange.ts`
- `src/components/settings/SkillSettings.vue`
- `src/services/folderSkillBatchImport.ts`
- `src/services/configExchange/{types,validation,index,markdown}.ts`
- `src/services/skillHealth.ts`
- 新增统一记录构造器与运行时元数据加载器
- `electron/ipc/skill-package.js`
- 必要的 preload 暴露与类型声明
- 定向测试与全量测试

反证点：

- `skillStore.importSkills` 的调用点除三个 folder 入口外还有 `useConfigExchange.applySkillImport`，协议字段扩展不能只改 folder 路径。
- `workspaceSkillEngine` 的 folder 判定依赖 `format/folderPath`，记录构造器不能破坏这两个字段。
- 版本回退若只更新部分字段，会复现旧字段残留；必须整记录替换。
- ZIP 安装当前若按 UTF-8 写资源，二进制资源会损坏；必须改为二进制流复制。

## 5. Stop Conditions

- 任一增量后 type-check/test 失败且无法在当前增量内修复时停止扩散，先修当前增量。
- 发现新增共享调用点或旁路入口时，先补读证与影响面，再继续。
- 发现方案与真实架构冲突时，登记到缺口清单并回给用户裁决，不静默改需求。

## 6. Execution Evidence

### 6.1 八步执行对账

1. **统一 folder 记录构造器**：新增 `src/services/folderSkillRecordFactory.ts`。`buildFolderSkillRecord` 是唯一记录构造器；`buildFolderSkillId`/`parseFolderSkillId` 统一 `folder:` 命名空间。消费点：`src/composables/useSkillPackageInstall.ts:8`、`src/components/settings/SkillSettings.vue:481`、`src/services/folderSkillBatchImport.ts:2`。Before：四处手写记录，id、meta、intents、resourceSummary 漂移；After：同一函数生成 canonical record。测试：`src/services/folderSkillRecordFactory.spec.ts:23-75` 覆盖 id、canonical、fallback、坏 meta 容错。
2. **版本闭环**：`electron/ipc/skill-package.js:270-327` 新增 `listVersionDirectories`/`resolveSkillLibraryVersion`，prerelease 目录纳入排序；`SkillSettings.vue:716-779` 版本列表、导出、回退均用 Electron 库定位并整记录替换；`electron/preload.js:148-156` 暴露 `skillPackageResolveVersion` 与带 version 的 export。Before：UI 拼路径 `folderPath.replace(...)+version`；After：主进程解析绝对路径，导出可指定版本。
3. **协议 v3**：`src/services/configExchange/types.ts:4-13` 升级 skill JSON 协议 3；`index.ts:57-63,97-103,148-154` 序列化/回填 `resourceSummary/contextPolicy/meta/intents`；`markdown.ts:272-296` 同步序列化，`protocolVersion` 承载 Markdown 协议版本，业务 `version` 保留 folder 版本。v2 兼容 warning 见 `src/services/configExchange.spec.ts:231-233`。本轮补修 Markdown 同名字段冲突：Before `schema.version=1` 与 folder `version=1.2.0` 覆盖解析失败；After `protocolVersion` 与业务 `version` 分离，往返保留版本。
4. **运行时元数据统一加载器**：`src/services/realSkillLoader.ts:147-202` 新增 `loadRuntimeFolderSkillMetadata`；`src/services/folderSkillRuntimeHydration.ts:18-42` 统一水合 template/meta/intents/contextPolicy。三面真实消费：流水线 `PipelinePanel.vue:2479-2519`，大纲工作台 `OutlineWorkspace.vue:5131`，主页共创 `ChatPanel.vue:2465`。Before：仅流水线读取 template，其他面消费 store 旧快照；After：执行前三面同源刷新。
5. **导入导出等价往返**：`electron/ipc/skill-package.js:186-244,405-424` 新增二进制读取并按 Buffer 写盘；`collectSkillDirectoryFiles` 全目录导出；`createZipBuffer` 改为 store（method 0）。`skill-package.spec.js:54-112` 验证 ZIP 安装再导出二进制资源 byte-equal。测试钩子：`skill-package.js:14,281-292` `setSkillLibraryRoot` 绕开 CJS `require('electron')`，`skill-package.spec.js:43-50` 使用真实临时目录。
6. **死代码清零**：`src/stores/skill.ts:148-152` 删除 legacy 数组兼容分支；`src/stores/skill.ts:190-216` 删除 `exportAllToJSON`/`importFromJSON` 旧路径。`rg "exportAllToJSON|importFromJSON"` 仅剩 Agent 域 `agent.ts`，不属于本任务语义。
7. **健康检查补元数据维度**：`src/services/skillHealth.ts:95-146` 增加 fingerprint、loader warnings、manifest id/name/version、intents、contextPolicy、evals 诊断；`SkillSettings.vue:690-694` 传入 `sourceId`/`version`。测试：`skillHealth.spec.ts:81-106`。
8. **测试矩阵**：定向 `npx vitest run electron/ipc/skill-package.spec.js src/services/folderSkillRecordFactory.spec.ts src/services/folderSkillRuntimeHydration.spec.ts src/services/configExchange.spec.ts src/services/skillHealth.spec.ts src/services/workspaceSkillEngine.spec.ts` → `Test Files 6 passed (6) / Tests 91 passed (91)`。全量见 DEV_LOG。

### 6.2 本轮补修

- **发现**：收口审计时发现 Skill Markdown 原有字段 `version` 同时承载协议版本和 folder 版本。为满足协议 v3 保留 folder `version` 后，`serializeSkillMd` 产生重复 `version` key，解析把 `1.2.0` 当协议版本并失败。
- **修复**：协议 key 改为 `protocolVersion`，解析端优先用它校验协议；业务 `version` 原样进入 record。旧 Markdown 无 `schema/protocolVersion` 时仍走兼容 warning。测试 `configExchange.spec.ts:265-295` 扩展为 folder 元数据完整往返断言。

### 6.3 V2.1 旧语义退役与真实 UI 闭环

1. **store/导入面旧语义迁移**：`src/stores/skill.ts:181-190` 的 `loadSkills` 将旧 `chatHistory: latest/all` 归一为 `recent` 并落盘；`src/services/skillIdentity.ts` 新增 `normalizeContextPolicy` 单源。测试：`src/stores/skill.spec.ts`、`src/services/skillIdentity.spec.ts`。
2. **磁盘 SKILL 包语义权威化**：`src/services/skillHealth.ts` 对 folder 包内 `latest/all` 报 error，禁止旧语义再从导入面回流；`src/services/skillHealth.spec.ts` 覆盖正负向。
3. **运行时消费磁盘元数据**：`src/services/folderSkillRuntimeHydration.ts:18-42` 统一水合 template/meta/intents/contextPolicy；`ChatPanel.vue`、`OutlineWorkspace.vue`、`PipelinePanel.vue` 三面接入同一加载源，store 快照不再作为执行期事实。
4. **真实 Electron UI 验证**：新增 `scripts/verify-skill-context-policy-v21-electron.mjs`。验证器先按 URL 分流 `/models` JSON，再按 `stream:false` 分流非流式 chat JSON；请求账本区分模型列表与 chat completions。修复前复现 `Cannot read properties of null (reading 'json')`；修复后同命令复跑无 page error，并新增两次技能测试结果 `CONTEXT_POLICY_TEST_OK` 硬断言。
5. **验证证据**：`node scripts/verify-skill-context-policy-v21-electron.mjs` → `===== SKILL CONTEXT POLICY V2.1 ELECTRON PASSED =====`；报告 `_audit/verification-skill-context-policy-v21-electron/report.json` 记录 `persistedChatHistoryAfterLoad=recent`、`persistedChatHistoryAfterOverwrite=recent`、`chatCompletionRequestCount=2`、`oldTemplateSeen=true`、`newTemplateSeen=true`。物理请求原件见同目录 `provider-requests.json`。
6. **回归证据**：`npx vue-tsc --noEmit` exit 0；`npx vitest run` 首跑出现 `de-ai-v2.spec.ts` 20k 预算用例 319ms > 300ms 的并发性能波动，单文件复跑 14/14 通过，全量复跑 234 files / 2500 tests 全通过。该用例未修改阈值，未用放宽断言换取绿灯。

## 7. Gap List

1. **live 供应商/模型生成不适用**：本任务验证目标是本地 UI 导入、持久化、缓存失效与请求组装，使用本地真实 HTTP provider 证据；不涉及外部供应商差异面。
2. **`skillHealth` 旧 folder 包仍会产生 protocol/samples/intents 提示**：这是诊断行为而非缺陷，测试已锚定；本轮 UI 报告仅剩 samples/intents 提示与警告。
3. **工作区中 Agent 域 `agent.ts` 的 `exportAllToJSON`**：属于 Agent 导出语义，非技能导入链路残留，按影响圈不动。
