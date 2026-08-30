# 存储加固 + 全量弹窗替换 + 3.9.0 收尾日志

## 范围
FIX_PLAN_2026-08-30_STORAGE_AND_P5_OPT 阶段 A-F：A1/A2 存储数据安全双修、B1-B4 数据一致性四修、C1-C3 视觉三修、D1-D5 五个优化项、E0-E5 35 处原生 confirm/alert 全量替换为应用内弹窗、F 回归验证与版本发布。

## 关键修复
1. **E-S 存储并发写缺陷**（E 探针期间发现的真实 bug）：并发 `storage:write` 共享同一 `.tmp` 路径，交错时短写截断后长写 fd 续写产生"前缀+旧尾"JSON 残留。修复：每键写队列串行化（`writeQueues` Map）+ 每次写唯一 tmp 文件名（`electron/ipc/storage.js`）。20 轮并发探针全过、0 `.tmp` 残留。
2. **统一弹窗基建**：`src/composables/useAppConfirm.ts`（Promise 化 confirm/alert，队列化）+ `src/components/common/AppConfirmModal.vue`（Enter/Esc、危险红键、modal-nested），挂载于 `App.vue`。
3. **35 处原生弹窗全量替换**：ChapterTree(2)、ProjectModal(2)、MemoryPanel(15)、EditorPanel(4)、ChatPanel(1)、AiNamingModal(3)、AppearanceSettings(7)、OutlineWorkspace(1)。`rg window.confirm|window.alert` 在 src 内归零（`useMemoryExtraction.ts:107` 同名 async 函数为白名单）。

## F 阶段回归证据（2026-08-31 实测）
1. `npx vitest run` 111/111 全绿；`npm run build:vue` 成功；type-check 0 错误。
2. `_audit/tmp/p8_smoke.cjs` 8 步全绿（allStepsOk: true）；其 runtimeErrors 中存储损坏记录经核实为 8 月 30 日（存储修复提交前）的历史日志，非新增。
3. 存储探针：并发双写 20/20 pass；promise 探针 `isPromise:true`；write-failure 探针返回 `{ok:true, failedKeys:[]}`（失败走返回值不抛异常，A1 生效）；list 探针补测 `isPromise:true` + 真实 key 列表；clearcurrent 探针通过（收藏/历史/命名清零）。
4. **三段式真实操作**（`_audit/tmp/f_realops_a/b/c.cjs`，两次真实杀进程重启）：
   - A 段：建"F阶段验证项目"，标记值 4321，`saveProject()` 返回 `{ok:true, failedKeys:[]}`。
   - B 段：重启后项目在列表、名称与标记值恢复；全量导出 39 key；对项目 JSON 制造真实磁盘损坏。
   - C 段：重启后损坏文件从 `.bak` 恢复（`storage-corruption.log` 新增 `restored=yes`，key=wa_project_p1788106336488），`readBackValid:true`；导入 39 key 0 失败；探针项目删除后 0 残留。
5. 探针残留清理：B4 遗留 10 个 `b4_probe_key_*`/`wa_test_*` key 已删除，复核 0 残留。

## 版本与记录
1. 版本号 3.8.3 → 3.9.0（P0 数据安全修复按改动等级升 minor；package.json 与 package-lock 同步）。
2. 经验已回写 `_audit/神意开发经验总结.md`：原子写盘四步模式、monkey-patch 返回值验证法、`javascriptDialogOpening` 归零验证铁律、三段式真实操作探针、脚本载体教训。

## 封装交付（2026-08-31 00:20）
1. `npm run build`（vite build + electron-builder --win NSIS）exit:0；vite 202 模块转换，仅既有 INEFFECTIVE_DYNAMIC_IMPORT / 大 chunk 警告（非阻断）。
2. 产物：`dist/神意助手-Setup-3.9.0.exe`，96,907,105 字节（约 92.4 MB）。
3. SHA256：`CC1A710E84AE0B69B6A7117EC57EEA23E52D86B546E7119C92BBC5D5425B787C`。
4. 未配置签名信息，signtool 跳过（与 3.8.0 一致的既有边界）。
