# DEV LOG 2026-09-16 API 直写成熟化执行

> 任务：执行 `PROPOSAL_2026-09-16_API_DIRECT_WRITE_MATURE_PLAN.md`
> 基线版本：3.51.0
> 状态：已完成；3.52.0 安装包已封装并完成产物核验

## 目标语义

1. `discuss/analyze`：只读，可读取编辑器与大纲，可调用 `editor.reveal` 展示位置，不暴露写入工具。
2. `edit/generate`：暴露并执行 `editor.write`。
3. 短答复只有上一轮 assistant 提出明确待执行方案时才继承写入意图。
4. 删除确认预览链路：`editor.propose_edits`、`pending_user_confirmation`、待确认批次与确认按钮全链路清零。
5. 保留直写安全层：定位唯一、hash/版本校验、锁定只读、写入上限、undo、批次记录与回滚。

## Phase 0 记录

- 经验文件升级 v5.10：M9 改为直写语义，新增 M20-M23，规则 67 同步修订。
- Folder SKILL 规格 9.1 改为 `editor.write` 直写协议，删除 `pending_user_confirmation` 教学。

## Phase 1-4 记录

1. 确认预览链路删除：`editor.propose_edits`、`pending_user_confirmation`、待确认批次、确认按钮与相关测试契约全部清零；`src` 与 `scripts` 残留扫描为 0。
2. 意图路由单源化：写入语料、负样本、位置咨询样本与短答复承接样本进入统一语料集；`classifyChainIntent()` 与 `routeChainIntent()` 共享同一规则源，并补充准确率评估脚本。
3. tool-loop 状态机落地：reading、locating、write_pending、write_success、write_failed、permission_denied、write_limit、tool_missing、no_progress、loop_limit 区分呈现，并同步 API 对话框、runTrace 与诊断日志。
4. 三层记录对账：turn、API call、event 通过 `turnId + apiCallId + toolCallId` 关联；`actualToolSurface` 与真实请求工具面逐项一致。

## 执行中补修

1. SKILL 链路失败批次接线：`OutlineWorkspace.vue` 中 `createWorkspaceSkillAdapter().buildTools` 创建的 `createEditorTools` 原先没有传 `onFailedBatch/takeFailedBatch`，导致部分失败批次在 SKILL 路径无法“只重提失败条”。已补上，并复用组件级 `outlineFailedWriteBatch`。
2. E2E 页面选择器修复：`verify-outline-cocreation-stage2.mjs` 与 `stage2-skills.mjs` 原按 `url().includes('index.html')` 找页面，在 `--dev` 模式下会选中 DevTools。改为排除 `devtools://`，保证连接主页面。
3. 依赖补齐：`@node-rs/jieba` 的 browser 入口会 re-export `@node-rs/jieba-wasm32-wasi`；该包缺失时 Vite 预构建失败并用错误浮层盖住页面。已作为 devDependency 安装，并重启 Vite dev server 清理 `node_modules/.vite/deps` 缓存。

## 验证记录

全部在本轮真实源 Electron / Vite dev 环境执行，结论为通过：

1. `npm run type-check`：通过。
2. `npm run build:vue`：主 bundle 与 protocols bundle 均构建成功。
3. `npm run test:services`：69 个文件 / 602 个测试全部通过。
4. `node scripts/verify-outline-cocreation-stage2.mjs`：14 项全 PASS，覆盖部分失败批次重试合并（失败条目修正、成功条目保留、只重提失败命令）。
5. `node scripts/verify-outline-cocreation-stage2-skills.mjs`：全部 PASS，覆盖 discuss 只读工具面、edit 暴露 `editor.write`、工具循环直写大纲编辑器。
6. `node scripts/verify-outline-compose-folder-repair-v2.mjs`：全绿，覆盖 folder compose 恢复、意图路由 fallback、深度 trace 导出 36 个外部 payload 与 SHA256 校验。
7. 残留扫描：旧确认预览链路在 `src` 与 `scripts` 中命中 0。

环境收尾：Vite dev server 与源 Electron 重启后页面存在 `window.electronAPI`，无 Vite 错误浮层。

## 封装交付

1. 版本升级：`3.51.0 -> 3.52.0`。
2. 封装命令：`npm run build`，退出码 0。
3. 产物：`dist/神意助手-Setup-3.52.0.exe`，129,835,784 bytes，生成时间 `2026-09-16 07:38:29`。
4. SHA256：`68A09AC165CCBB8D64D3EF414A3B4712DC2ED34B468BD556F1C637D698AFA907`。
5. asar 内 `package.json` 版本：`3.52.0`。
6. NSIS 有效配置：`oneClick=false`、`allowToChangeInstallationDirectory=true`，客户可自选安装路径。
7. 旧 3.49.0、3.51.0 安装包已清理，`dist` 仅保留 3.48.0 与 3.52.0 两个产物。
- 客户复验重点：大纲工作台 SKILL 路径的部分失败批次重试、`editor.write` 直写、discuss 只读权限、tool-loop 阶段显示与运行记录三层对账。
