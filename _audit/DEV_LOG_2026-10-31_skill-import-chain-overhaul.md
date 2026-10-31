# DEV_LOG 2026-10-31 技能/智能导入链路八步收口

## 1. 目标与结果

用户要求检查并修复应用设置里的技能/智能导入链路与接线，确保导入完整、导入后完全生效，并继续深入到每个关联环节不留死角。本任务按已批准的八步方案执行：

1. 统一 folder SKILL 记录构造器。
2. 版本列表、导出、回退以 Electron 技能库为定位源。
3. 配置协议升级 v3，完整携带 `meta/intents/resourceSummary/contextPolicy`，兼容 v2。
4. 流水线、大纲工作台、主页共创共享运行时磁盘元数据水合器。
5. ZIP 导出再安装关键字段与二进制资源等价。
6. 删除技能 store 旧语义死代码。
7. 健康检查补身份、版本、元数据、指纹维度。
8. 补测试矩阵并全量验证。

最终结果：六处入口（ZIP 安装、单文件夹导入、批量导入、配置 JSON/Markdown 导入导出、运行时消费、健康检查）收敛到同一事实源；配置协议升级到 skill JSON v3 / Skill Markdown `protocolVersion: 1`。

## 2. 关键修复

### 2.1 单一记录构造器

- 新增 `src/services/folderSkillRecordFactory.ts`。
- ZIP 安装、单文件夹导入、批量导入、版本回退、重新绑定全部改用 `buildFolderSkillRecord`。
- store overwrite 对 folder 记录执行整记录替换并保留非 folder 扩展字段，消除旧字段残留。

### 2.2 Electron 版本定位

- `electron/ipc/skill-package.js` 新增 `resolveSkillLibraryVersion` 与 `listVersionDirectories`，版本目录排序支持 prerelease。
- UI 不再拼路径，改为 `skillPackageListVersions` / `skillPackageResolveVersion` / `skillPackageExport(id, path, version)`。
- 版本回退使用 canonical record 整体替换。

### 2.3 协议 v3 与 Markdown 字段冲突修复

- Skill JSON 协议升级 v3，白名单与校验补 `resourceSummary/contextPolicy/meta/intents`。
- v2 文件可导入并给出 `版本 2 低于当前 3，已兼容导入` warning。
- 本轮收口审计发现 Markdown 的 `version` 同名字段冲突：协议版本与 folder 版本共用一个 key 时无法同时保留。修复为：
  - `protocolVersion`：Markdown 协议版本。
  - `version`：folder 技能包版本。
- 旧 Markdown 缺 `schema` 时继续按兼容解析。

### 2.4 运行时统一水合

- 新增 `src/services/realSkillLoader.ts:loadRuntimeFolderSkillMetadata`。
- 新增 `src/services/folderSkillRuntimeHydration.ts:hydrateRuntimeFolderTemplates`。
- 流水线、大纲工作台、主页共创在执行前统一刷新 folder template/meta/intents/contextPolicy；store 快照仅用于首屏，不再作为执行事实源。

### 2.5 ZIP 二进制保真与 CJS 测试钩子

- ZIP 读取改为 Buffer，安装写盘不再 UTF-8 化。
- ZIP 写入改为 store（method 0），与真实未压缩字节一致；旧实现把未压缩数据标记为 method 8。
- 导出改为全目录收集并写入 `skill-package.json`。
- 新增 `setSkillLibraryRoot` 测试钩子，测试用真实临时目录，不再 mock Electron。

### 2.6 死代码与健康检查

- 删除 `skill.ts` 中 legacy 数组分支与 `exportAllToJSON/importFromJSON`。
- `skillHealth` 补 fingerprint、loader warning、manifest id/name/version、intents、contextPolicy、evals 检查。
- 设置页健康报告传入 `sourceId` 与 `version`。

## 3. 验证

定向验证：

```text
npx vitest run electron/ipc/skill-package.spec.js src/services/folderSkillRecordFactory.spec.ts src/services/folderSkillRuntimeHydration.spec.ts src/services/configExchange.spec.ts src/services/skillHealth.spec.ts src/services/workspaceSkillEngine.spec.ts
Test Files  6 passed (6)
Tests  91 passed (91)
```

Markdown 冲突补修后定向复跑：

```text
npx vitest run src/services/configExchange.spec.ts
Test Files  1 passed (1)
Tests  25 passed (25)
```

全量验证、构建与封装结果见本日志第 5 节执行后追加记录。

## 4. 经验回写

经验文件升级 `v9.8.4 -> v9.8.5`，新增 G1.25「同一语义多入口与 CJS 测试替身」：

- 多入口禁止手写同语义构造器；导入、安装、回退、绑定、导出必须收敛单源。
- CJS Electron 模块优先用显式测试钩子控制根目录，不用 ESM mock 语义纠缠。
- ZIP method 标记必须与真实压缩行为一致。
- 协议版本字段不得与业务字段同名。

## 5. 发布记录

版本升级 `3.110.11 -> 3.110.12`，执行全量测试、类型检查、构建封装与 git 提交。执行结果见下方登记。

实际执行结果：

```text
npm run type-check
vue-tsc --noEmit
→ exit 0，无类型错误输出

npx vitest run
Test Files  233 passed (233)
Tests  2491 passed (2491)
Duration  70.52s

npm run build
→ Vite 两段构建完成
→ electron-builder 打包完成
→ dist/神意助手-Setup-3.110.12.exe 生成成功，大小 231,647,289 bytes
→ dist/神意助手-Setup-3.110.12.exe.blockmap 生成成功
```

发布清理：`dist/神意助手-Setup-3.110.11.exe` 与对应 `.blockmap` 已删除，仅保留本次 `3.110.12` 安装产物与历史 `3.110.6` 归档产物。

边界登记：真实 Electron 窗口中的设置页导入/导出/回退鼠标路径仍为 `untested`，以任务台账第 7 节口径为准；本轮验证依据为类型检查、全量单测与生产构建，不把自动化结果冒充真实 UI 验证。
