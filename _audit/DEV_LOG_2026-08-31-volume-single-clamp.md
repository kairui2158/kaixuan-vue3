# 开发日志：卷纲逐卷生成作用域修复与真实 Electron 闭环（2026-08-31）

## 问题

1. 客户使用"逐卷生成"，滚动日志显示模型已输出第三、四卷情节，等 20 分钟无进展。
2. 根因一：`genVolumes` 的 single 分支条件是 `mode === "single" && existingCount > 0`，卷列表为空时静默落入全量生成分支，prompt 变成"请生成 N 卷"。
3. 根因二：API 返回的卷数组不做数量钳制，模型违反"正好1项"时应用照单全收全部追加。
4. 衍生问题：逐卷生成从未有回归验证；代码里存在 `continue` 模式但 UI 没有任何入口。
5. 补充根因：新项目由大纲预建占位卷时，旧逻辑把“有名字但没有纲要/摘要”的占位卷当成上一卷记忆，导致逐卷请求可能跳过第 1 卷。

## 修复

1. 新增 `src/services/volumeGeneration.ts`：`buildVolumePrompt` 统一构造 auto/single/continue 三种 prompt；single 在 0 卷时明确请求"只生成第1卷"；continue 明确请求剩余卷区间并锚定上一卷记忆。
2. 新增 `clampGeneratedVolumes`：single 只保留第 1 项；continue 只保留（卷数 - 已有卷数）项；截断时在生成日志中明确提示"模型返回 X 项，已按模式截取前 Y 项"。
3. `PipelinePanel.vue` 的 `genVolumes` 改用服务函数；single/continue 模式追加写入不再要求 `existingCount > 0`。
4. 卷列表最后一卷的操作列新增"续生成"按钮（`btn-pl-continue-volume-i`）：仅当已有卷数 < 目标卷数时显示，点击以上一卷为记忆基准调用 continue 模式，保证逐卷生成的记忆链不断。
5. `package.json` 的 `test:services` 纳入 `volumeGeneration.spec.ts`。
6. `genVolumes` 的新增 `hasVolumeContent` 过滤：只有纲要或摘要非空的卷才计入上一卷记忆、已有卷数、剩余待分配字数和保留列表；占位卷不会被当作已生成卷，也不会覆盖第 1 卷请求。

## 验证

1. `npm run test:services`：3 个测试文件 55 个用例全部通过，含 10 个卷纲用例（空列表 single 请求第 1 卷、上一卷记忆锚定、continue 剩余区间、auto 全卷语义、single/continue/auto/空数组钳制、占位卷过滤）。
2. `npm run type-check` 通过。
3. `npx vite build` 通过，287 个模块转换成功。
4. 真实 Electron UI 回归：`node _audit/tmp/volume_single_ui_regression.mjs`，9 项全部 PASS：
   - 生成反馈为单一弹窗；
   - 逐卷请求命中第 1 卷；
   - 模型越界返回 3 项时硬钳制为 1 项；
   - “第一卷 契约觉醒”出现在 UI；
   - 第一卷出现续生成入口 `btn-pl-continue-volume-0`；
   - 续生成请求携带上一卷锚点；
   - 续生成补齐到 3 卷；
   - 第三卷出现在 UI；
   - 关闭重启后 3 卷持久化，第一卷内容仍在。
5. 证据文件：
   - 结果：`_audit/tmp/volume_single_ui_result.json`
   - 截图：`_audit/tmp/volume_single_ui_final.png`
   - 脚本：`_audit/tmp/volume_single_ui_regression.mjs`
