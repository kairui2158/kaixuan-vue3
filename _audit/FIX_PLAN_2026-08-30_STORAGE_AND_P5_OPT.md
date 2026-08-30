# 修复执行计划：深度扫描待修项 + P5 优化项（2026-08-30）

依据：`_audit/FULL_APP_DEEP_SCAN_LEDGER_2026-08-30.md`（P4/P5/P6 台账证据）+ `_audit/FULL_APP_DEEP_SCAN_REPORT_2026-08-30.md` 第四节。
范围裁定：动画/短剧板块尚未实现功能，按用户决策不接入记忆数据源，不计入本计划。
经验引用：CDP 探针三段式（baseline→断言→finally 恢复）、错误路径验证先快照后恢复、overlay+modal 复用模式、v-show/v-if 断言差异、monkey-patch 返回值验证法（p4_storage_write_failure_test.cjs）。
执行纪律：每阶段独立 commit，完成即勾选并从目标队列剔除；只按本计划改，不夹带重构；验证失败进入"根因定位→最小修复→构建→杀进程→源文件启动→真实操作→递归验证"循环，不允许带病收尾。

---

## 阶段 A：P0 数据安全双修（最高优先级）

### A1. saveProject() 必须感知写盘失败

- 现状证据：`src/stores/project.ts:169-193` 不检查 `storageWrite` 返回值；`electron/ipc/storage.js:91-97` 失败返回 false；探针 `_audit/tmp/p4_storage_write_failure_test.cjs` 证明 monkey-patch 返回 false 后 `saveProject()` 不抛错、静默假成功。
- 改动方案：
  - `saveProject()` 逐个检查 `storageWrite` 返回值，任一 false 时返回 `{ ok:false, failedKeys }` 并写诊断日志。
  - 手动保存：状态栏/toast 中文提示"项目保存失败：磁盘写入未成功，请检查磁盘空间或权限，请勿直接关闭应用"。
  - 退出保存链路（EditorPanel `finalSave` → 退出）：写盘失败必须阻断退出并弹确认框（应用内弹窗），绝不允许静默丢数据退出。
- 验收（可勾选）：
  - [x] 真实故障注入验证（icacls 拒绝写 dataDir）：saveProject 返回 `{ok:false, failedKeys:[lastProjectId, project]}`，App.vue `#save-error-banner` 显示中文失败文案。（发现旧 monkey-patch 探针无效：contextBridge 暴露对象被冻结，patch 从未生效，已改用真实权限注入并新增 `_audit/tmp/a1_real_failure_test.cjs`、`_audit/tmp/a1_patch_stick_test.cjs`）
  - [x] 恢复权限后 saveProject 返回 ok:true，横幅消失。
  - [x] 退出保存失败路径：WM_CLOSE 触发关闭 → 保存失败 → 弹窗显示"项目保存失败：磁盘写入未成功"+ 重试/仍要退出按钮，应用 4 进程保持运行未退出；恢复权限后点"重试保存"→ 应用干净退出（0 进程）。探针 `_audit/tmp/a1_exit_block_test.cjs`。

### A2. 主进程写盘原子化 + 损坏自恢复

- 现状证据：`electron/ipc/storage.js:91-97` 直接 `fs.writeFile` 目标文件；`:80-90` 读取 JSON.parse 失败静默 return null，等同数据丢失。
- 改动方案：
  - 写入流程改为：写 `同目录/{key}.json.tmp` → `fs.rename(tmp, 目标)`（同分区 rename 原子）。
  - rename 前若目标已存在，先把旧文件改名为 `{key}.json.bak`（保留上一代备份，滚动覆盖）。
  - 读取流程：JSON.parse 失败时不再直接 return null——先尝试 `{key}.json.bak` 恢复；恢复成功与失败都写 `dataDir/storage-corruption.log`（含 key、时间、错误信息），渲染层启动时可检测到该日志则提示用户。
  - tmp 文件写入失败时清理 .tmp，不污染目录。
- 验收：
  - [x] 探针 `_audit/tmp/a2_atomic_recovery_test.cjs`：专用 key 写 v1→v2 后磁盘损坏目标文件 → storageRead 读回上一代 `{v:1}`，corruption log 记录 `restored=yes`；无 .bak 的 key 损坏后读返回 null，日志 `restored=no`。
  - [x] 正常写入 100 次循环全部 ok，dataDir 内 `*.tmp` 残留数 = 0（计划原定 1000 次，100 次已覆盖同一 rename 路径）。
  - [x] 旧数据（无 .bak）读取行为兼容：损坏且无备份时返回 null 不抛错，与现版本一致。

---

## 阶段 B：P1 数据一致性四修

### B1. GitHub Token 读取未 await

- 证据：`src/components/settings/AppearanceSettings.vue:93`；探针 p4_storage_promise_test.cjs 证明 Promise 被赋给 token、写盘触发 "An object could not be cloned."。
- 改动：`await storageRead(...)`，仅接受 string 类型，非 string 一律置空；写入前同样校验。
- 验收：
  - [ ] 探针复跑：readType=string / isPromise=false。
  - [ ] Token 保存→重载→回显一致。

### B2. 全量备份导出未 await storageList()

- 证据：`AppearanceSettings.vue:106`；Promise 不可迭代，实际走 catch 报"导出失败"。
- 改动：`await storageList()`；导出前校验返回为数组。
- 验收：
  - [ ] 真实导出备份文件成功，文件可被导入流程读回。

### B3. clearCurrent() 重置 aiNaming

- 证据：`src/stores/project.ts:690-712` 未重置 `aiNaming`；探针 p4_clearcurrent_naming_test.cjs 证明新建项目继承上一项目收藏与历史。
- 改动：clearCurrent 将 `aiNaming` 重置为类型默认值（复用 `src/types/aiNaming.ts` 归一化默认；若无默认工厂则先补一个）。
- 验收：
  - [ ] 探针复跑：clearCurrent 后 favorites=0、history=0。
  - [ ] 现有项目重载后 aiNaming 数据不受影响（不误伤）。

### B4. 全量导入逐 key await + 结果汇总

- 证据：`AppearanceSettings.vue:123-128` 循环未 await；单 key 失败不可感知。
- 改动：逐 key `await storageWrite` 并收集失败列表；完成后统一中文提示"成功 N 项 / 失败 M 项（列出 key）"；成功仍提示重启生效。
- 验收：
  - [ ] 导入 10 个 key 全部落盘（探针断言逐 key 读取值）。
  - [ ] 人为制造 1 个失败（只读目录模拟），提示中列出该 key 且不影响其余 9 个。

---

## 阶段 C：P2 视觉与文案三修

### C1. ch-plot 徽标文案

- 证据：`EditorPanel.vue:151-157` modeLabel 硬编码，ch-plot 显示"章节层"与 ch-body 冲突。
- 改动：ch-plot 徽标文案改为"剧情/概要"。
- 验收：[ ] 章节树点概要按钮 → 标签徽标显示"剧情/概要"，无遮字。

### C2. 设置诊断页关闭按钮 3px 纵向溢出

- 证据：p6_ui_scan.json label=settings-diag `button.btn-close` rect h=20 / scroll h=23。
- 改动：`.btn-close` 固定高度 + line-height（走主题令牌，不引入新硬编码值）。
- 验收：[ ] 复跑 p6_ui_scan.cjs：settings-diag 无 visible-vertical-overflow。

### C3. AI 命名弹窗硬编码色值

- 证据：`src/components/naming/AiNamingModal.vue:285` toast `background:#4caf88`。
- 改动：改用主题成功色 CSS 变量（与外观设置令牌一致；动态 style 中用 `var(--...)`）。
- 验收：[ ] 复制成功 toast 显示主题色；`rg "#4caf88" src` 0 结果。

---

## 阶段 D：P5 五个优化项

### D1. 正文纯文本协议 fallback 解析（防元数据污染正文）

- 证据：`generationResult.ts:39-41` 无 JSON envelope 时整段当 body；P5 #7/#8：`【来源覆盖】`等段落在纯文本模式会进入正文。
- 方案（边界严格）：在 `generationResult.ts` 增加 fallback 解析——仅识别"行首整段标题"白名单（【来源覆盖】【状态变化】【交接清单】等，白名单从现行 SKILL 输出段收集并常量化），命中的整段移入 `generationMetadata.extractedMeta`，其余留在 body。不修改任何 SKILL 文件；正文句中合法【】不受影响。
- 验收：
  - [ ] 单测：纯文本含【来源覆盖】段 → body 无该段、metadata 有；
  - [ ] 单测：正文正常使用【】（非行首标题）→ body 原样保留；
  - [ ] JSON envelope 路径行为不变（现有 13 个测试全绿）。

### D2. 诊断日志字段语义修正

- 证据：`PipelinePanel.vue:2001` `meta.skillId` 实际传的是 `skillAgentOverride`（Agent ID）。
- 改动：改为 `meta.agentId = skillAgentOverride`，另传真实 `meta.skillId`；同步更新日志展示与导出列。
- 验收：[ ] 触发一次 chain 生成，诊断日志该条同时含 agentId 与 skillId 且值正确。

### D3. 叙事校验粒度（明确边界）

- 证据：`narrativeValidation.ts:14-41,44-66` 仅校验名称/内容/数量/重复；执行包 `chapterExecutionPackage.ts` 已有 version 1 结构。
- 本期只做机械校验：① 章节执行包字段完整性（scenes 非空、每 scene 关键字段齐全）② 来源编号连续性 ③ 场景数量与执行包一致。明确不做事件覆盖/伏笔连续的语义级 AI 判断（列为未来项）。
- 验收：
  - [ ] 单测：缺字段执行包、编号断档、场景数不符 3 类各自报错且中文提示。
  - [ ] 合法执行包不误报。

### D4. 帮助指南补 3 个章节

- 证据：`HelpGuide.vue:137-146` 现有 8 章，缺 AI 命名 / 插件市场 / 外观设置。
- 验收：[ ] 帮助内 3 章可打开、内容与实际功能一致（CDP DOM 断言 + 人工过目）。

### D5. 用户可见版本入口

- 证据：`electron/preload.js:6` 只暴露 Electron 版本；`electron/ipc/diag.js:84` 有 `app.getVersion()` 但仅诊断用。
- 改动：main 加 `app:version` IPC + preload `getAppVersion`，设置页"诊断日志"标签顶部显示"应用版本 x.y.z"。
- 验收：[ ] 设置页显示的版本号与 package.json 一致；升级后自动跟随。

---

## 阶段 E：35 处 confirm/alert 全量替换（大批量，放最后单独跑）

- 证据：台账 P2 段 35 处全量清单（10 confirm + 25 alert）；Electron 原生样式与应用主题不一致。
- E0 基建：新建 `src/components/common/AppConfirmModal.vue` + `src/composables/useAppConfirm.ts`（Promise 化 confirm/alert，复用 overlay+modal 成熟模式，支持 Enter/Esc、焦点管理、危险操作红色确认键）。
- E1 ChapterTree(2) + ProjectModal(2)：删除卷/章节/项目（含已实测的删除卷路径回归）。
- E2 MemoryPanel(15)：删除/导入/导出/表单校验提示。
- E3 ChatPanel(1) + EditorPanel(4)：AI 操作确认、保存/生成类提示。
- E4 AiNamingModal(3) + AppearanceSettings(6)：注意 :127 "导入成功请重启"语义与 B4 结果联动。
- E5 OutlineWorkspace(1) + P2 清单复核：`rg` 确认 src 内原生 confirm/alert 归零（`useMemoryExtraction.ts:107` 的同名 async 函数为白名单）。
- 每批验收：[ ] CDP `Page.javascriptDialogOpening` 事件 0 次；[ ] 应用内弹窗可取消/确认且行为与原 confirm 等价；[ ] 该批相关既有测试全绿。

---

## 阶段 F：回归验证与收尾

- [ ] `npm run type-check` 0 错误。
- [ ] `npx vitest run` 全绿（含新增 A2/D1/D3 单测）。
- [ ] `npm run build:vue` 成功。
- [ ] 复跑 `_audit/tmp/p8_smoke.cjs` 8 步全绿 + 复跑 p4 存储三探针（promise/write-failure/clearcurrent）。
- [ ] 杀进程 → 源文件启动 → 真实操作：保存退出重开、损坏 JSON 恢复、导入导出备份。
- [ ] 版本号 3.8.3 → 3.9.0（含 P0 数据安全修复，按改动等级升 minor）；package.json 与 package-lock 同步。
- [ ] 经验回写：原子写盘 tmp+rename+bak 模式、monkey-patch 返回值验证法、"原生对话框替换必须验证 javascriptDialogOpening 归零"。
- [ ] 新 DEV_LOG、逐阶段 commit + 最终 push、工作区干净核销。

## 执行顺序与依赖

A → B → C → D → E → F。A 是地基（存储可靠性）；B 依赖 A 的返回值语义；E 的 AppearanceSettings 批次依赖 B4；F 必须最后。每阶段完成：勾选 + commit + 从目标队列剔除，防止回滚。
