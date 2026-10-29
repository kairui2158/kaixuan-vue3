# DEV LOG：3.110.8 可交付封装收尾（2026-10-30）

## 背景

正文层内嵌降AI V3 缺口收口完成后，用户裁决进入可交付封装：版本升级、重新封装、清理旧产物并提交工作区。本轮收尾目标是把 3.110.8 做成可交付版本，并用封装核验脚本留下可复核证据。

## 交付

1. 版本对齐：`package.json` 与 `package-lock.json` 均升级为 `3.110.8`。
2. 测试锚点修正：`finalStepMetadataWiring.spec.ts` 的源代码锚点更新为 `finalStepRetry ?? { role: 'polish' as const, deaiDetection: 'on' as const }`。这是对齐当前实现的断言收紧，没有放宽负向断言。
3. 封装产物：`npm run build` 成功，产出 `dist/神意助手-Setup-3.110.8.exe` 与 `.blockmap`。
4. 封装核验：新增 `scripts/verify-packaging-3-110-8.mjs`，校验 asar 内版本、主进程入口、renderer 完整性、降AI契约 validator 打包、安装包 SHA256、真实启动、electronAPI 暴露与渲染文本。证据落盘 `_audit/verification-packaging-3-110-8/packaging-evidence.json`。
5. 旧产物清理：删除 `神意助手-Setup-3.110.7.exe`、`.blockmap`、`神意助手-Setup-3.110.6.exe.blockmap`。`神意助手-Setup-3.110.6.exe` 因文件安全描述符/所有者损坏无法删除，登记为环境边界。
6. 临时探针清理：删除一次性 CDP 探针 `_audit/tmp_verify_restore_ui.cjs`。

## 验证

- `npx vitest run` → 228 files / 2446 tests，0 failed。
- `npm run build` → 成功产出 3.110.8 安装包。
- `node scripts/verify-packaging-3-110-8.mjs` → `===== PACKAGING 3.110.8 VERIFICATION PASSED =====`。
- `Get-FileHash dist\神意助手-Setup-3.110.8.exe` → SHA256 `c56a4d229beba39d9553350a0313fcdfe97317042bee764a3720a7f0dffa086c`，与核验证据一致。
- `Test-Path _audit\tmp_verify_restore_ui.cjs` → `False`。

## 封装证据

- 安装包：`dist/神意助手-Setup-3.110.8.exe`
- 大小：231,642,286 bytes
- SHA256：`c56a4d229beba39d9553350a0313fcdfe97317042bee764a3720a7f0dffa086c`
- asar 版本：3.110.8
- renderer 文件数：86
- electronAPI 方法数：93
- 渲染文本长度：770 字符，无“无法加载/白屏”
- 核验结论：`verdict: pass`

## 边界

- `神意助手-Setup-3.110.6.exe` 仍存在于 `dist/`：该文件 stat 可读，但 unlink/rename/truncate/copy/icacls/takeown/Get-Acl 均返回 Access denied，所有者显示为空。判断为文件安全描述符损坏，需要用户在管理员 PowerShell 中手工执行 `takeown /f "D:\codex\novel-workshop-vue3\dist\神意助手-Setup-3.110.6.exe"`、`icacls "D:\codex\novel-workshop-vue3\dist\神意助手-Setup-3.110.6.exe" /reset` 后再删除。此边界不阻塞 3.110.8 交付与提交。
- Phase 10 降AI校准仍为 `provisional`；本轮不声称最终校准完成。
- 本轮 Electron 封装核验使用本地真实安装包与真实启动，但业务请求链路验证沿用 mock provider 证据，不声明 live 供应商结论。
