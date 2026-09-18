# 开发日志：API 直写权限门收尾补验

日期：2026-09-14  
版本：3.42.2  
方案：`PROPOSAL_2026-09-14_DIRECT_WRITE_PERMISSION_AND_TRACE_REPAIR.md`

## 断点

上一轮 15 场景 E2E 通过 1-11 后在场景 12 中断：兼容供应商首次请求带工具返回 `tools unsupported`，降级重试返回纯 JSON `editor.write`，但 UI 等待“兼容模式直写”提示超时，编辑器未变化。

## 根因

`请用兼容供应商直写` 不在显式写入祈使规则里，被归一为 `discuss`。服务层权限门按 v5.1 设计拒绝写入，所以编辑器保持原状，也不会产出 `compatibility_write=true`。

本次不是放宽权限门，而是补齐显式直写意图词库；`discuss/analyze` 的只读保护继续生效。

## 修复

1. `chainIntentRouter.ts` 的显式写入祈使规则补充：`直写`、`直接写入`、`直接修改`、`直接替换`、`直接追加`。
2. `routeChainIntent()` 接入同一规则，避免 `classifyChainIntent()` 与 `routeChainIntent()` 两套入口语义分叉。
3. `chainIntentRouter.spec.ts` 同时守护路由与服务分类：显式直写必须进入 `edit`。

## 验证

1. `npx vitest run src/services/chainIntentRouter.spec.ts`：9 tests passed。
2. `npm run type-check`：exit 0。
3. 按 M6/规则 70 执行 `npx vite build` + `npx vite build --config vite.protocols.config.mts`，确认验证新渲染产物。
4. `node scripts/verify-api-direct-write-v2-e2e.mjs`：场景 12 前后两轮都是 `#1 带 tools`、`#2 no tools`，兼容 JSON 直写成功；输出 `API DIRECT WRITE V2 E2E PASSED`。
5. `npm run test:services -- --run`：15 files / 216 tests passed。

## 收尾

版本升级到 3.42.2 并重新封装。临时 E2E profile 和导出目录由脚本自动清理；`_audit/cdp-probe.mjs` 按收尾清单删除。

## 安装版复验（3.42.2）

1. 静默安装 `dist/神意助手-Setup-3.42.2.exe` 成功。
2. `node scripts/verify-installer-3-42-2-direct-write.mjs`：15 场景 / 15 张截图全部 PASS，诊断覆盖面 renderer/main 双侧一致，最终输出 `INSTALLED 3.42.2 DIRECT WRITE PASSED`，安装目录清理成功。
3. 期间发现旧安装版脚本仍写死 `14`，与实际 15 场景契约不同步；已同步为 15 后完整重跑，确认产品本身没有回归。
4. `node scripts/verify-installer-3-42-2-smoke.mjs`：真实安装路径 smoke 通过，最终输出 `===== INSTALLED 3.42.2 SMOKE PASSED =====`；随后静默卸载成功，安装目录与 profile 均输出 `[CLEANUP] ... removed: true`。
5. 清理复核：3.42.0/3.42.1 旧安装包及旧 blockmap 已删除，`installer-3-42-2-install` 与 `installer-3-42-2-profile` 不存在，脚本名同步为 `verify-installer-3-42-2-smoke.mjs`。

## 经验更新

`神意开发经验总结_v5.md` 新增 M11 意图语义单源门禁：权限相关的显式意图规则必须由 `classifyChainIntent()` 与 `routeChainIntent()` 共享，并通过单测与真实 UI E2E 双层覆盖。
