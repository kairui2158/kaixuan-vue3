# API 直写协议成熟化执行方案（V1）

日期：2026-09-19  
方案成熟度：半成熟（协议设计成熟，可执行；三项放行断点必须在对应阶段验收，见“放行断点”）  
证据来源：`RESEARCH_2026-09-19_API_DIRECT_WRITE_PROTOCOL_MATURITY_V1.md` Round 1-20；所有行号均为本轮本机核验。

## 1. 问题定义

本次事故不是“某次写坏了”，而是四个协议层断点同时存在：

1. `editor.write` 只校验 required 字段，非法 `operation`/`position` 会被 cast 或 fallback 成合法值。
2. `insert + target` 的语义未定义，执行器忽略 target，实际写入位置依赖光标。
3. 下一轮请求只保留聊天文本，上一轮工具调用、写入结果、权限拒绝全部丢失。
4. 权限按轮动态计算，但模型看不到 actualToolSurface、上一轮写入事实和权限变化原因。

继续补丁式修复会违反 M12/M16/M18：每次只修触发入口，其他入口保留旧假设。本方案改为先收口协议，再恢复上下文连续性，最后用负向验证矩阵证明。

## 2. 分阶段执行计划

### Phase 1：协议单源与严格校验（最高优先级）

1. 扩展 `skillValidation.ts` 的 `JsonSchema` 支持 `additionalProperties`，校验器同步支持“未知字段拒绝”。
2. 新建 `src/services/editorEditSemantics.ts`：
   - 单源导出 operation、position、legacy 别名、组合规则、错误码。
   - 组合矩阵：`insert` 允许 cursor/selection_start/selection_end/end，禁止 target；`replace_selection` 仅允许 selection_start/selection_end，禁止 target；`replace_match/delete/rewrite` 必须有唯一 target；`append` 禁止 position 与 target。
3. `editorTools.ts` 的 `inputSchema` 补 enum、类型、additionalProperties，并接入共享 `validateSkillInput`；保留现有中文错误与 retryable 语义。
4. `editorEditProtocol.ts`、`outlineProposal.ts`、`OutlineWorkspace.vue` 三处枚举全部改为消费共享定义；`replace_section/rewrite_section` 只允许在共享 normalize 层一次性迁移，迁移结果必须写入 trace。
5. 修正错误码：工具未在 actualToolSurface 中暴露时返回 `tool_not_found`，只有“工具存在但当前意图无权限”才返回 `permission_denied`。

通过标准：
- 非法 operation/position、insert+target、append+target、replace_selection+end、未知字段全部返回结构化 `invalid_input`。
- `rg "insert_after|replace_section|rewrite_section"` 只剩共享定义与测试；生产入口零旧枚举残留。
- 现有 `editorTools.spec.ts`、`workspaceSkillEngine.spec.ts` 全部通过。

### Phase 2：写入失败反馈成熟化

1. 定义 `write_failed` 错误码表：`invalid_input`、`missing_field`、`ambiguous_target`、`target_not_found`、`version_changed`、`locked`、`permission_denied`、`duplicate_write_blocked`。
2. 失败 tool result 采用 Aider 模式：返回非法值、合法枚举、相近 target 候选、已成功批次 batchId，并明确“成功批次不要重发，只修正失败项”。
3. `outlineIntegrity/hash` 校验失败必须把失败原因回给模型，不能只回滚加日志。
4. 保留现有重复写入 guard，不重写已验证的单请求 tool loop。

通过标准：
- 每类错误都有模型可读修正指引；trace 与 UI 展示同一错误码。
- 模拟“目标多命中/目标缺失/锁定”时，工具结果中包含候选或明确修正动作。

### Phase 3：跨轮写入审计与权限透明化

1. aiService 输出 compact tool history：每个工具对保留 `toolCallId + toolName + 参数摘要 + result 摘要`；重试/失败批次声明 canonical 规则，取最新终态。
2. `getChatContextMessages()` 注入上一轮写入审计，不进聊天文本，不改变用户可见消息流。
3. 每轮 system context 注入：当前意图、actualToolSurface、上一轮写入事实、权限变化原因；数据必须来自 `dialogueToolSurface` 的同一份计算结果。
4. 摘要层设长度上限并防滚雪球；run trace 仍保存完整工具现场，上下文只放摘要。
5. 孤儿 tool_call/tool_result 检测：出现孤儿直接记录错误事件，禁止静默丢弃。

通过标准：
- 连续两轮请求的第二轮请求体中能看到第一轮工具对摘要（含成功、拒绝、参数错误三类）。
- system 描述的工具面与 provider request、run trace 的 actualToolSurface 三者逐项一致。
- 长文档多轮场景下上下文摘要长度不随轮次线性膨胀。

### Phase 4：意图路由成熟化

1. `chainIntentRouter` 从全局关键词分数改为每意图类别独立权重与阈值。
2. 为 analyze/edit/generate/discuss 各建正负样本评估集；每次词库变更必须输出阈值校准报告。
3. `discuss` 不再被 edit 关键词闸门拦截：解释、补充、质疑、说明设计目的属于 discuss 正样本。
4. 显式 fallback：未命中时返回可解释的 no-match 状态，不允许静默进入全链。

通过标准：
- 评估集输出 precision/recall；discuss 负样本（明确写入指令）不被误路由。
- 本次事故中的“解释钩子设计目的”类文本必须命中 discuss。
- 词库变更无评估报告时 CI/验证脚本失败。

### Phase 5：验证矩阵与门禁固化

1. E2E 增加非法枚举、非法组合、未知字段、类型错误四类负向路径，并断言编辑器内容不变。
2. 增加跨轮用例：第一轮写入成功/失败/拒权，第二轮请求必须携带对应工具对摘要。
3. 增加权限一致性断言：system 描述、actualToolSurface、provider request 三者逐项一致。
4. `.dependency-cruiser.cjs` 新增规则：禁止 UI 绕过 `dialogueToolSurface/createEditorTools` 构造直写工具面；禁止生产代码直接定义 editor operation 枚举。
5. editor 协议增加 `protocolVersion`；run trace 记录协议版本；旧 trace 只读兼容。

通过标准：
- 全部新增 E2E 原始输出通过；现有 E2E 无回归。
- 门禁规则加入日常验证命令并在本轮执行通过。

## 3. 执行顺序与风险控制

顺序固定为 Phase 1 → 2 → 3 → 4 → 5。理由：没有严格协议时先做上下文注入，会把非法工具调用也注入下一轮；没有上下文连续性时先调路由阈值，无法解释权限变化；验证矩阵必须最后覆盖全部新行为。

每阶段完成后执行 M17 回头看：diff 全量归因、生产入口 rg 盘点、同款逻辑双面扫描、trace/DiagLogger/DEV_LOG 同步、验证证据属于本轮。

## 4. 不做的事

- 不重写已验证的单请求 tool loop、收敛请求、本地摘要兜底。
- 不把 run trace 全量注入上下文。
- 不在 prompt 层另写一份权限描述或工具面描述。
- 不保留三套编辑操作枚举并行。

## 5. 放行断点

1. Phase 1 的 `additionalProperties` 收口不能破坏 folder skill 既有输入兼容；若出现兼容破坏，先加迁移提示再拒绝。
2. Phase 3 的 compact tool history 需要先在 mock provider 下验证长度上限，再接真实 API，避免长文档滚雪球回归。
3. Phase 4 的路由阈值必须先跑评估集并输出报告，禁止手调阈值直接上线。

## 6. 最终成熟度

- 执行器/工具层：Phase 1-2 后可达到成熟。
- 应用方案/交互闭环：Phase 3 后可达到成熟。
- 实现接线：当前不成熟；Phase 1 完成三处收口与门禁后视为成熟。
- 验证标准：当前半成熟；Phase 5 完成负向与跨轮矩阵后视为成熟。

在上述 Phase 全部通过前，本方案整体结论保持“半成熟”；未开始执行，等待审核。
