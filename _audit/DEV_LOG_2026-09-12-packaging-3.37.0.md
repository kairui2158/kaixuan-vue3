# 2026-09-12 3.37.0 版本封装日志

## 项目功能

将生成流水线 folder chain 单一所有权修复封装为 3.37.0 Windows 安装包，供客户实操验证。

## 用途

- 发布 text SKILL + folder SKILL 混合 chain 的单一所有权交付。
- 确认 folder 步骤的上一步输出通过 user prompt 恰好注入一次。
- 确认 folder `template.md` 拥有执行权，不被流水线 base template 静默接管。

## 执行过程

1. 使用 `npm version 3.37.0 --no-git-tag-version` 同步升级 `package.json` 与 `package-lock.json`。
2. `npm run type-check`：通过。
3. `npx vitest run`：55 个测试文件、432 个测试全部通过。
4. 三个 chain 单一所有权 E2E 串行验证通过：folder 流水线、文本流水线、大纲工作台。
5. `npm run build` 成功。期间 `rcedit` 报 `Unable to commit changes` 3 次，builder 自动重试后成功；无需沿用 3.36.0 的手动 `rcedit` 恢复流程。
6. 清理旧版安装包：删除 3.35.0、3.36.0 的 exe 与 blockmap。
7. 清理临时脚本 `scripts/cleanup-dist-3.37.0.ps1`。

## 产物

- 安装包：`dist/shenyi-assistant Setup 3.37.0.exe`
- 大小：`199,805,062 bytes`（约 `190.5 MB`）
- SHA256：`D914EAC743B83F4753C7CB1A7F2C8AD3BC9CD91A467A49C319C85DB8E0E82D92`
- Blockmap：`dist/shenyi-assistant Setup 3.37.0.exe.blockmap`
- `latest.yml`：`version: 3.37.0`
- `dist` 只保留 3.37.0 安装包、blockmap、`latest.yml`、`builder-debug.yml`、`builder-effective-config.yaml` 与 `win-unpacked` 目录。

## 验证结果

- `npm run type-check`：通过。
- `npx vitest run`：55 个测试文件、432 个测试全部通过。
- `node scripts/verify-pipeline-folder-chain-single-ownership.mjs`：通过。
- `node scripts/verify-pipeline-chain-single-ownership.mjs`：通过。
- `node scripts/verify-chain-single-ownership-e2e.mjs`：通过。
- `npm run build`：成功。
- `dist/win-unpacked/shenyi-assistant.exe` VersionInfo：`3.37.0`。
- asar 内 `package.json` 版本：`3.37.0`。
- `dist/latest.yml`：`version: 3.37.0`。
- 安装包 SHA256：`D914EAC743B83F4753C7CB1A7F2C8AD3BC9CD91A467A49C319C85DB8E0E82D92`。

## 收尾

- 旧版 3.35.0、3.36.0 安装包与 blockmap 已删除，避免客户误装旧版本。
- 临时清理脚本已删除，仓库不保留一次性封装脚本。
- 开发经验文件已升级为 `神意开发经验总结_v4.md`：09-09 至 09-12 日期型经验全部提炼归位，旧 v3 文件已删除。
