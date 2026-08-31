# 开发日志：卷纲逐卷生成作用域修复与续生成入口（2026-08-31）

## 问题

1. 客户使用"逐卷生成"，滚动日志显示模型已输出第三、四卷情节，等 20 分钟无进展。
2. 根因一：`genVolumes` 的 single 分支条件是 `mode === "single" && existingCount > 0`，卷列表为空时静默落入全量生成分支，prompt 变成"请生成 N 卷"。
3. 根因二：API 返回的卷数组不做数量钳制，模型违反"正好1项"时应用照单全收全部追加。
4. 衍生问题：逐卷生成从未有回归验证；代码里存在 `continue` 模式但 UI 没有任何入口。

## 修复

1. 新增 `src/services/volumeGeneration.ts`：`buildVolumePrompt` 统一构造 auto/single/continue 三种 prompt；single 在 0 卷时明确请求"只生成第1卷"；continue 明确请求剩余卷区间并锚定上一卷记忆。
2. 新增 `clampGeneratedVolumes`：single 只保留第 1 项；continue 只保留（卷数 - 已有卷数）项；截断时在生成日志中明确提示"模型返回 X 项，已按模式截取前 Y 项"。
3. `PipelinePanel.vue` 的 `genVolumes` 改用服务函数；single/continue 模式追加写入不再要求 `existingCount > 0`。
4. 卷列表最后一卷的操作列新增"续生成"按钮（`btn-pl-continue-volume-i`）：仅当已有卷数 < 目标卷数时显示，点击以上一卷为记忆基准调用 continue 模式，保证逐卷生成的记忆链不断。
5. `package.json` 的 `test:services` 纳入 `volumeGeneration.spec.ts`。

## 验证

1. `npm run test:services`：3 个测试文件 53 个用例全部通过（含新增 8 个卷纲用例：空列表 single 请求第1卷、上一卷记忆锚定、continue 剩余区间、auto 全卷语义、single/continue/auto/空数组钳制）。
2. `npm run type-check` 通过。
3. `npm run build:vue` 通过，287 个模块转换成功。
4. 边界说明：本次验证覆盖 prompt 构造、数量钳制与按钮渲染逻辑，未执行真实 API 调用的端到端逐卷生成，需客户实操或后续真实 API 回归确认。
