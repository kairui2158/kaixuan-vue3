# DEV_LOG 2026-10-01 - 仓库大清理与长期改动归档

## 目标

清理 3.30-3.70 版本周期积累的未提交改动：有效代码、产品资产、开发日志与验证证据全部入库；可再生成或第三方原始缓存删除；修复 git 对象层残留，最终做到 tracked/untracked 无残留。

## 清理范围与处置

### 1. 应用代码与产品资产

- 归档 `src/`、`electron/`、`scripts/`、`resources/`、`docs/`、`STACK.md`、构建配置与依赖清单。
- 保留并入库 `resources/models/bge-small-zh-v1.5`（意图语义路由使用的本地 ONNX 模型，约 23MB）。
- 删除已废弃的根目录 `preload.js`，实际实现位于 `electron/preload.js`。
- 提交：`0764672 feat: 归档 3.30-3.70 应用代码、编辑器与终稿系统`，共 333 个文件，88842 行新增，4111 行删除。

### 2. 审计与验证证据

- 归档全部 `_audit/` DEV_LOG、PROPOSAL、RESEARCH、ROADMAP、fixtures、语料 JSON 与 verification 工件。
- 证据按项目门禁保留，作为后续方案回看、根因复盘和成熟度判断的原始依据。
- 提交：`39414c8 chore: 归档开发日志、方案、调研与验证证据`，共 701 个文件。

### 3. 第三方调研原始缓存

删除 5 处已整理报告之外的原始源码缓存，释放约 80MB：

- `_audit/agent-research/cache`
- `_audit/research-api-direct-write-100-closure-2026-09-23/cache`
- `_audit/research-editor-base-alignment-2026-09-24/cache`
- `_audit/research-editor-full-product-2026-09-24/cache`
- `_audit/research-editor-followup-features-2026-09-25/cache`

保留对应的 RESEARCH/DIGEST/SOURCES/rounds 记录，可追溯调研结论与证据来源。

### 4. 可再生成产物

- 删除 `dist/win-unpacked`（约 972MB），可通过 electron-builder 再生成。
- 保留 `dist/神意助手-Setup-3.70.0.exe`、blockmap、latest.yml 等安装包产物。

### 5. 嵌套 Git 仓库处置

`_audit/agent-research/work` 下的 aider、cherry、cline-current、codex、continue、langgraph、openhands、roo-current、vercel 是本地抓取的完整第三方仓库。它们最初以 gitlink 形式被误归档，且仓库没有 `.gitmodules`，跨机器克隆会得到无法拉取的空引用。

处置：从版本索引移除，本地文件保留。后续如需共享，应改为记录仓库 URL + commit SHA + 本地缓存路径，而不是提交 gitlink。
同时在 `.gitignore` 增加 `_audit/agent-research/work/`，使该本地调研缓存不再出现在未跟踪状态中；可入库的证据仍为 `candidates.json`、`selected.json`、rounds 记录与整理版报告。

### 6. 用户数据与敏感信息

- `_data/`、`.userdata/`、`dist/`、`node_modules/` 继续由 `.gitignore` 排除，不入库。
- 已扫描密钥形态：未发现真实 API key；历史 DEV_LOG 中仅存在第三方 baseUrl 与假示例 key。

## Git 对象层修复

清理前发现 `.git/objects` 中存在 20 个孤儿 `.idx`（无对应 pack）与 78 个 `tmp_obj_*` 临时对象。已执行：

1. `git fsck --full`：确认无 error/missing/corrupt。
2. `git gc --prune=now`：清理孤儿 idx 与临时对象；返回码 1 是 repack 试图清空空 multi-pack-index 所致，非仓库损坏。
3. `git multi-pack-index write`：重建 multi-pack-index 成功。
4. 复核 `git fsck --full`：仍为 0 error/missing/corrupt；剩余 dangling blob/tree 来自历史中断的 add/commit，不参与提交图，随后续 gc 逐步消散。

## 最终验证

- `git status --short`：无未提交、未归档的 tracked/untracked 残留。
- `git fsck --full`：0 error/missing/corrupt。
- `git log --oneline`：包含本次清理归档提交 `0764672`、`39414c8`、`b6704c4`、`c40e19b`。
