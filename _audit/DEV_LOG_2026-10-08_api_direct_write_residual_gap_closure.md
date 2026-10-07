# 2026-10-08 API 直写残留缺口收口与 3.77.0

## 范围

- Phase 1：`documentTransformService` 删除校验改为逐项多重集对账；仅允许减少原本重复的片段，唯一正文片段必须一条不少。
- Phase 2：活动任务挂起期间补交互护栏；用户手动插入/修订会被 `rejectManualWriteWhenTaskActive` 明确阻止并引导恢复/取消任务，不放宽 `intent + writeAuthorization + active task` 授权。
- Phase 3：主页手动插入/修订统一到直写语义，删除 diff 预览路径与 `DiffModal.vue`，记录 `manual-inline-preview-removed`。
- Phase 4：SKILL 手册同步 3.77.0 与净化器语义：SKILL 只提供领域能力，执行协议与权限由应用单源管理。
- Phase 5：真实 live key（复用应用内默认配置）+ 真实 Electron UI 完成 6 步验证：修改、追加、删除、整节移动、本地确定性整理、局部倒序重排。
- 修复 step4 暴露的 heading move 语义缺陷：目的地是标题时按整个 section 边界处理，不再把标题当行内片段插入。
- 工具上下文压缩 live 证据收口：真实请求 payload 中出现 3 处 `_compacted`，与“保留最近 2 轮、失败与写入结果，压缩旧成功读取”的契约一致。

## 验证

- Live v3：`_audit/verification-api-direct-write-live-v3/verification-result.json`，`passed: true`，6/6 步通过；供应商为 openai-compatible `deepseek-v4-pro`。
- 工具上下文压缩：`_data/api-direct-write-live-v3-profile/documents-data/run-trace/outline/run-trace-outline-20261008-025057/payloads/` 中 `028-request.json`、`053-request.json`、`073-request.json` 含 `_compacted` 标记。
- 单测：`npm run test:services`，132 files / 1545 tests 全绿。
- 类型：`npm run type-check` 通过。
- 构建：`npm run build:vue` 通过；已知 warning 为 Node externals、chunk size、Vite native config，均为既有登记项。
- Electron：负路径验证、直写压测、provider wire matrix 通过。
- 打包：`npm run build` 生成 3.77.0 x64 NSIS 安装包；`node scripts/verify-packaging-3-77-0.mjs` 完成真实启动、asar 版本、renderer 新鲜度与 electronAPI 核验。
- 安全：仓库扫描无真实 `sk-` key；live key 只存在于应用本地配置。

## 版本与收尾

- 版本：3.77.0。
- 安装包：`dist/神意助手-Setup-3.77.0.exe`。
- 证据：`_audit/verification-packaging-3-77-0/packaging-evidence.json`。
- 台账：`_audit/TASK_LEDGERS/2026-10-08_api-direct-write-residual-gap-closure.md`。
- 清理：删除临时诊断目录；负路径证据目录按脚本默认自清理，不保留重复 Chromium profile。

## 客户重点复验

- 主页手动插入/修订不再弹 diff 预览，直接写入编辑器，可用编辑器撤销。
- 活动任务挂起时手动写入会被明确提示先恢复或取消任务。
- 加载 SKILL 后编辑请求仍走同一权限与工具面，运行记录可见 guidance 净化事件。
- “整理整篇文章”类请求应本地即时完成并出现 `local-transform-executed`。
- 整节移动到标题前后时，内容应落在该节整体边界，不再插进标题所在节内部。
