# DEV LOG 2026-09-15 Outline Trace Recursive Repair

> 任务名：Outline Trace 多轮递归修复  
> 口语关键词：大纲运行记录、直写确认、链式递归修复、3.44.0 封装  
> 方案：`_audit/PROPOSAL_2026-09-15_OUTLINE_TRACE_RECURSIVE_REPAIR.md`  
> 状态：代码与验证已闭环，本文为最终对账记录。

## 根因与修复

1. **P0：生产 bundle TDZ 崩溃**  
   - 首轮 E2E 阻塞在阶段 2，renderer 报错为压缩后的 `Cannot access 'P' before initialization`。  
   - 还原后定位 `P` 为 `toolCallSummary`：`ChatPanel.vue` 中 `finishHomeApiCall()` 在引用后才声明该 `const`，生产压缩暴露为运行时 TDZ。  
   - 修复：把 `const toolCallSummary = result.toolCalls?.length ...` 上移到首次 `finishHomeApiCall()` 调用前。  
   - 证据：`vue-tsc --noEmit` 先报 `TS2448`，调整声明后返回 0 error；修复位置见 `src/components/chat/ChatPanel.vue:2196-2205`。
2. **P0/P1：方案内直写解析与权限语义调整**  
   - 合法批次解析不再被概率意图单独拦截；`discuss/analyze` 可通过提案工具进入预览，但不能直接 `editor.write`。  
   - 服务层权限门保持不变，与 M9 修订后的“禁直写、可提案”语义一致。  
   - 批次死亡路径补结构化 blocked 诊断与真实 reason；`toolSurface` 与 `intent` 进入 trace。
3. **工具交换协议**  
   - 强制工具交换使用非流式 JSON 交换，避免 SSE 语义与批次确认链路分叉。  
   - `aiService.spec.ts` 中 5 个旧 SSE mock 修正为普通 JSON `tool_calls`，全量服务测试回到绿色。
4. **运行记录与文档**  
   - 方案 P0/P1 全部实施；ContextPack 去重、续生成快照瘦身按第三轮研磨降级为 P2，本轮未实施，已在方案中保留后续项。

## 已验证项

| 门 | 命令 | 结果 |
|---|---|---|
| 类型检查 | `npm run type-check` | 0 error |
| 服务测试 | `npm run test:services` | 15 files / 216 tests passed |
| 前端构建 | `npm run build:vue` | passed |
| 阶段 2 E2E | `node scripts/verify-dialogue-foundation-stage2.mjs` | 20/20 PASS（main workspace 与 outline workspace） |
| 安装包构建 | `npm run build` | 生成 `dist/神意助手-Setup-3.44.0.exe` |
| 安装级烟测 | `node scripts/verify-installer-3-44-0-smoke.mjs` | PASS：静默安装、主页/设置三页/大纲工作台渲染、截图防伪、asar 版本 3.44.0、静默卸载 |
| 安装级 15 场景直写 E2E | `node scripts/verify-api-direct-write-v2-e2e.mjs`（安装版 exe） | 15/15 PASS：空编辑器插入、替换回滚、多目标拒绝、版本变更保护、大文档直写、流式跟随、discuss 降级、锁定态、流水线隔离、兼容 JSON、trace 导出、诊断覆盖 |

发布产物复核：

- `package.json` 与 lockfile 根版本：`3.44.0`。  
- `builder-effective-config.yaml`：`oneClick: false`，`allowToChangeInstallationDirectory: true`，NSIS 自定义安装可用。  
- `3.44.0.exe` SHA256：`AB252AB54A94996BE7BB8A5267C883824503E9118DF8E1C318B70DEA449E5700`。  
- 临时探针与调试脚本 `.tmp-debug-stage2-state.mjs`、`.tmp-capture-stage2-stack.mjs`、`scripts/debug-stage2-ui.mjs` 已删除；`aiService.ts` 中 storageWrite 调试探针已移除。
- 安装级烟测证据：`_audit/verification-outline-trace-recursive-repair-3-44-0/installer-smoke-result.json` 与 5 张截图。  
- 安装级直写 E2E 证据：`_audit/verification-api-direct-write-v2/e2e-result.json`（15 screenshots）、`diag-coverage.json`（renderer/main 双侧 120/120，missingInMain 为空）。

## 未验证项 / 客户实操重点

1. 本轮验证脚本覆盖大纲与主页两条工作区，已补安装级真实安装/卸载与 15 场景直写 E2E；**仍未做真实客户供应商的全链人工实操**，交付后重点验证：  
   - 大纲工作台长素材 → 生成合法批次 → 输入“确认”→ 预览 → 写入 → undo。  
   - 主页编辑器同款链路。  
   - `discuss` 只读聊天不误写，提案仍可预览。  
   - 运行记录中批次 blocked / applied / rejected reason 完整可见。
2. P2 两项未做：ContextPack 长会话去重、续生成快照瘦身。

## 方法论入档（2026-09-15）

本轮 Outline Trace 修复经验已提炼为经验文件 v5.3 的 **M12 多轮正推/反推研磨门禁**：非平凡修复必须完成目标倒推、爆炸半径矩阵、正推验证、反推验证和优先级证据化修订；同款逻辑分叉 2 处以上时必须抽共享函数收口，不得只做入口点修。

出处对账：

- 目标倒推与爆炸半径矩阵来自 `PROPOSAL_2026-09-15_OUTLINE_TRACE_RECURSIVE_REPAIR.md` 的反推审计。
- 正推/反推双验证与解析门解耦、ContextPack 按入口分治、批准词 pending 信号等修订来自第三轮研磨。
- ContextPack 去重与续生成快照瘦身因反推证据证明不阻塞本轮，降级为 P2 后续项，这正是“优先级证据化修订”的落地案例。
