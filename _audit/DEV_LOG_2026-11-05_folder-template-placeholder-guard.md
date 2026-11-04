# 2026-11-05 folder 模板占位符注入守卫

## 目标

用户指出 SKILL 层的 `cleanChainInput` 不校验 `{{...}}` 占位符是否被应用替换，要求基于经验文件深度查找漏点和过度设计。审查确认根因在应用侧：`injectResolvedVariables` 只查"调用方提供的变量是否被模板用到"，不查"模板中的占位符是否被调用方提供了值"。本次实施最小修复：应用补反向占位符守卫并硬失败，五个有 preProcess 的 SKILL 补可见标记，设置页技能测试路径补齐代表性模板变量。

## 交付

- P0-A 应用硬闸：`src/services/realSkillExecutor.ts:640-648` 新增 `template-placeholder-unresolved` error 诊断；`src/services/realSkillExecutor.ts:815-823` 命中后直接返回 `status: failed`，阻止 API 调用发出。
- P0-A 回头看修正：初版仅在调用方传入非空 `templateVariables` 时执行扫描，零变量分支可穿透。已将 `injectResolvedVariables` 调用改为 `useFolderTemplate` 为真时无条件执行，并新增 spec 用例 `blocks execution when no template variables are provided at all` 覆盖。
- P0-B SKILL 可见标记：`kaixuan-s1/s2/s3`、`l2-s2`、`l4-s1` 的 `cleanChainInput` 或 preProcess 在链式输入中把字面 `{{var}}` 改写为 `[未替换占位符:var]`，让模型在应用闸失效时仍能看到注入失败信号。preProcess 无硬阻断通道（`executeHook` preProcess 只允许 `input/template/samples` 字段），硬失败由应用闸承担。
- P1 测试路径补齐：`src/services/folderSkillTest.ts:104-113` 传入 6 个代表性模板变量，设置页技能测试也走注入路径，暴露占位符缺口。
- 回归测试：`src/services/realSkillExecutor.spec.ts:1667-1690` 新增"模板含未提供变量 → failed + error 诊断 + API 不被调用"用例。
- 回归测试补齐：`src/services/realSkillExecutor.spec.ts:1692-1717` 新增"调用方完全未传 templateVariables → 同样阻断"负例用例。

## 交付收尾（2026-11-05）

- 版本升级：`3.114.0 → 3.114.1`（package.json + package-lock.json 同步）。
- 封装构建：`npm run build` → `dist\神意助手-Setup-3.114.1.exe`（首次构建遇 EBUSY 文件锁，等待 5 秒后重试成功）。
- 封装校验：`npm run verify:packaging` → PASS，`sha256=ec0a43d005bbc541c7e18452e7ffe85abfcee86fbff5739c95f40ff21a832a1f`，`rendererFiles=87`，`electronAPI methods=94`，证据文件 `_audit/verification-packaging-3.114.1/packaging-evidence.json`。
- Git 提交：`33aecafe fix(executor): block unresolved folder template placeholders before API dispatch`、`e06b9974 chore(release): version 3.114.1 with packaging verification`。

## 验证

- `npx vitest run src/services/realSkillExecutor.spec.ts --reporter=verbose` → `Tests 70 passed (70)`，其中新用例 `blocks execution when template placeholders are not provided` 通过。
- `npx vitest run src/services/skillRouter.spec.ts src/services/workspaceSkillEngine.spec.ts src/services/skillOrchestrator.spec.ts` → `Tests 68 passed (68)`。
- `npx vitest run src/services` → `Tests 2266 passed (2266)`，全量服务测试零回归。
- `npx vitest run src/services/folderSkillTest.spec.ts` → `Tests 3 passed (3)`。
- `npx tsc --noEmit` 报 7 个既有 `.vue` 模块声明错误（历史遗留），本轮改动无新增类型错误。

## 影响圈

生产入口四层 folder SKILL 链（PipelinePanel 主链 + compose + fallback）、设置页技能测试、SKILL 磁盘包、runTrace 诊断通道。未触碰 engine resolve 路径、`previousOutput` 别名群、SKILL 迭代策略。

## 缺口清单

本轮无登记缺口。SKILL 磁盘包改动未纳入应用 git（`D:/codex/玄武规划SKILL` 非 git 仓库），由用户 SKILL 工作流自行管理版本。
