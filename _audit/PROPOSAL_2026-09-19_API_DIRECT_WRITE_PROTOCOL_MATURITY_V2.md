# API 直写协议成熟化执行方案（V2 下一阶段）

日期：2026-09-19  
方案成熟度：成熟（可执行；真实供应商 live 验证为外部放行断点，未执行前只能标记 untested）  
证据来源：`RESEARCH_2026-09-19_API_DIRECT_WRITE_PROTOCOL_MATURITY_V2.md` Round 1-25；V1 Phase 1-5 开发日志；本文本引用的行号均为本轮本机核验。

## 1. 问题定义

V1 已把协议语义、跨轮审计、意图路由和负向矩阵闭环。下一阶段的缺口不再是“工具能不能写”，而是系统能否在真实世界长期稳定：

1. **供应商能力是声明统一、验证分叉**：五类供应商只有 openai-compatible 有完整行为验证；DeepSeek/Azure 靠继承，Gemini 流式工具调用未验证。
2. **schema 校验器仍是入口补丁**：显式 `undefined` 靠解析层物理删除规避，第三方 folder skill schema 未被当作不可信输入处理。
3. **协议版本只有常量**：`EDITOR_EDIT_PROTOCOL_VERSION = 1` 没有版本协商、不支持错误、支持列表或迁移矩阵。
4. **长文档工具循环缺上限矩阵**：direct 普通对话、工具密集定位、folder chain、兼容 JSON 降级共享一个粗粒度上限，缺少取消、超时、usage 与配对完整性证据。
5. **验证分层不清**：mock 通过、协议仿真通过、真实供应商通过被混在同一句“闭环”里，导致交付声明失真。

继续只补触发路径会违反 M12/M26/M37。本方案的目标是把上述五个断点分别单源化，并用分层验证声明替代笼统“完成”。

## 2. M12 正反推研磨

### 目标倒推

用户最终可感知行为：

- 用户换任意已声明支持的供应商，直写工具仍按同一协议执行，失败时错误码与 trace 可判定是供应商协议问题还是工具问题。
- SKILL 制作方拿到 trace，可以看到 schema 归一化结果、工具轮上限、工具配对状态、协议版本、usage 与上下文压缩证据。
- 长文档多轮定位不会无限滚工具轮，也不会因上限触发后丢失已收集结果。

倒推改动点：

1. 供应商能力与协议行为矩阵单源化。
2. schema 归一化与校验单源化。
3. 协议版本协商与迁移单源化。
4. 工具循环策略矩阵单源化。
5. 验证脚本按“协议仿真 / live / 回归”分层。

### 爆炸半径矩阵

| 改动 | 直接影响 | 联动风险 | 防线 |
|---|---|---|---|
| 供应商能力矩阵 | providerTools、providerProtocols、aiService | DeepSeek/Azure 继承回归；Gemini 被误标支持 | 每供应商 fixture + 继承显式断言 |
| schema 硬化 | skillValidation、editorTools、workspaceSkillEngine、PipelinePanel | folder/pipeline 输入兼容破坏 | 四类消费方分层回归 + trace 记录归一化 |
| 协议版本机制 | editorEditSemantics、editorTools、runTrace、旧 trace 导出 | 历史事实被迁移改写 | 版本只记录不重写历史；旧 trace 只读兼容 |
| 工具循环矩阵 | aiService、conversationContextService、crossTurnToolAudit | 直写、folder、pipeline 三路径状态漂移 | 三路径分别 E2E + 孤儿调用反向断言 |
| 验证分层 | scripts、package.json、CI/验证命令 | 旧验证冒充新证据 | 新脚本断言五供应商全出现；live 默认关闭 |

### 正推验证

- 供应商矩阵：五类供应商各自的请求体、响应解析、工具结果回传均有 fixture；矩阵脚本失败条件是任一供应商缺 fixture 或断言失败。
- schema 硬化：显式 `undefined` 不再依赖解析层删除；未知字段拒绝；深度/循环引用/非法组合结构化失败；归一化结果进 trace。
- 协议版本：未知版本返回 `unsupported_protocol_version` + 支持列表；v1 请求保持可用；旧 trace 不被改写。
- 工具循环：普通 direct、工具密集 direct、folder chain、兼容 JSON 降级各自的上限、取消、收敛与终态进入 trace。

### 反推验证

- 只补 openai-compatible 够吗？不够，DeepSeek/Azure 继承同一实现，任何协议改动会三线联动；Gemini 是独立 wire format，必须独立 fixture。
- 只改校验器够吗？不够，`validateSkillInput` 有 pipeline、workspace skill、editor tool、测试契约四类消费方；未分层回归就是假安全。
- 只加版本字段够吗？不够，没有不支持错误与支持列表时，模型/旧 SKILL 的未知版本会退化成泛化 invalid_input。
- 只做 mock 够吗？不够，mock 只证明应用自身解析正确；真实供应商兼容必须显式 untested/live 分层，不能冒充。

### 优先级修订

执行顺序为 Phase 1 → 2 → 3 → 4 → 5。理由：没有能力矩阵先做流式/长文档会继续在错误假设上叠功能；没有 schema 硬化时版本机制会被非法输入污染；验证分层最后覆盖全部新行为。

## 3. 分阶段执行计划

### Phase 1：供应商能力规则与协议矩阵

1. 新建单源 `providerToolCapabilities`（或并入现有单源模块，不新增平行状态）：每个供应商声明 native tools、streaming tool calls、strict schema、tool result wire format、继承来源。
2. Gemini 流式 functionCall 在本轮明确登记 `unverified`，未实现前不得标支持；Anthropic 流式聚合只按已存在实现登记。
3. 为五类供应商建立协议 fixture：请求体、工具调用响应、第二轮工具结果回传。DeepSeek/Azure 必须显式断言继承 OpenAI 形状。
4. 新增 `scripts/verify-api-direct-write-provider-matrix.mjs`：默认协议仿真；脚本内置断言五类供应商全部出现，防止只测触发供应商。
5. live 层默认关闭。只有提供 `PROVIDER_LIVE_CONFIG` 时逐供应商执行真实调用，输出 pass/fail/untested。

通过标准：
- 矩阵脚本全部断言通过，报告中五供应商均有明确状态。
- live 未配置时输出 `untested`，不得出现“真实供应商已通过”的表述。

### Phase 2：schema 校验器硬化与不可信 schema 归一化

1. `skillValidation.ts` 修正字段存在语义：显式 `undefined` 视为字段不存在；`additionalProperties:false` 继续拒绝未知字段。
2. 增加 schema 自身校验：深度上限、循环引用检测、顶层非法结构、object/非 object 的 `additionalProperties` 规则。
3. 对第三方 folder `schema.json` 增加归一化层：不改变作者语义的前提下输出可执行 schema；发生归一化时写入 trace（归一化类型、原值、结果值）。
4. 分层回归四类消费方：pipeline skill 输入、workspace folder skill 输入、editor 工具输入、测试契约。

通过标准：
- 显式 `undefined`、未知字段、深度超限、循环引用、非法 schema 均结构化失败且可读。
- 既有 folder-minimal、folder-full、editor 工具、pipeline 输入测试全部通过。
- 归一化事件进入 run trace，SKILL 制作方可看到 schema 被如何处理。

### Phase 3：协议版本协商与迁移矩阵

1. `EDITOR_EDIT_PROTOCOL_VERSION` 保持 v1，不引入 v2 语义。
2. 工具 schema 描述 `protocolVersion`；执行器对未知/不兼容版本返回 `unsupported_protocol_version`，并携带支持列表。
3. 默认缺省策略必须由语料评估决定：模型未传版本时先按 v1 兼容解析，但 trace 记录 `protocolVersionDefaulted:true`；若评估集显示缺省导致高风险，再改为显式拒绝。
4. 旧 trace 只读兼容：读取历史不迁移、不改写事件语义；新 trace 只新增版本与协商结果字段。

通过标准：
- v1 请求行为不变；未知版本有结构化错误与支持列表。
- 旧 trace 导出/导入测试通过，历史事件不被迁移改写。
- 语料评估报告包含缺省版本策略结论。

### Phase 4：长文档工具循环与消息配对完整性

1. 建立工具循环策略矩阵：direct 普通对话、direct 工具密集、folder chain、兼容 JSON 降级各自声明 maxToolIterations、超时、取消、收敛与终态。
2. 每轮请求构造前执行工具配对审计：孤儿 tool call/tool result 记录错误事件；缺失结果只能生成带原因的占位失败，不得伪造成功。
3. 长文档压测记录：工具轮数、每轮 usage、上下文估算与 provider 实际 usage 偏差、审计摘要长度、truncated、orphanToolCallIds。
4. 无 usage 供应商走降级估算，并在 trace 标记 `usageUnavailable:true`。
5. 到达上限后保留已收集工具结果，收敛请求或本地摘要必须说明已执行与未完成部分。

通过标准：
- 十几万字大纲 + 多轮定位场景中，上限、取消、收敛路径均有 trace 证据。
- 第二轮请求无孤儿工具调用；压缩/重水合后的配对修复进入 trace。
- 上下文摘要长度不随轮次线性膨胀。

### Phase 5：验证分层、门禁与收尾

1. 验证声明固定四层：单元/协议仿真/mock E2E/live。每层输出独立报告，禁止互相冒充。
2. `.dependency-cruiser.cjs` 增加规则：生产代码不得绕过供应商能力单源；协议矩阵脚本不得只覆盖单一供应商。
3. 全量回归：type-check、vitest、build:vue、现有 V2 E2E、provider matrix、生产接线门禁、意图评估。
4. DEV_LOG、经验文件、主索引同步更新；若需交付客户，再走版本升级与封装流程。

通过标准：
- 全部命令原始输出通过；provider matrix 报告五供应商状态明确。
- 未执行 live 时，交付说明必须写“真实供应商矩阵未实测”。

## 4. 不做的事

- 不重写 V1 已闭环的协议语义、跨轮审计、意图路由与兼容 JSON 降级。
- 不在本轮引入 editor 协议 v2 语义。
- 不把 run trace 全量注入上下文。
- 不在 Gemini 流式工具调用未实现前标记支持。
- 不把 VCR 作为本轮必做项；若后续 live 需要协议回归，再按脱敏与原子回滚标准立项。

## 5. 放行断点

1. **真实供应商 live 矩阵**：需要用户提供 API key 或真实供应商配置。未执行前只能标记 untested，不影响协议仿真层实施。
2. **Gemini 流式工具调用**：本轮只登记现状，不实现新解析器。
3. **协议 v2**：本轮只建协商机制，不改语义。

## 6. 需用户确认的点

1. **真实供应商 live 矩阵**：本轮是否提供 API key/供应商配置。若暂不提供，Phase 1-5 可全部执行，但最终报告必须写明真实供应商矩阵 `untested`。
2. **协议缺省版本策略**：建议采用“未传版本按 v1 解析 + trace 记录 defaulted”，先保证兼容，语料评估显示高风险后再改显式拒绝。若你要求“未知版本一律拒绝”，Phase 3 的默认分支需改为严格模式。
3. **长文档压测数据**：默认用合成的 10 万/20 万字大纲构造工具密集场景，不消耗真实 API 配额；live 层只在用户另行放行时执行。
4. **Gemini 流式工具调用**：本轮只登记 `unverified` 并纳入矩阵展示，不实现新流式解析器。若你要求本轮实现，需要把 Phase 1 扩大为独立子阶段。

## 7. 分层成熟度结论

- 执行器/工具层：V1 已成熟；V2 Phase 2 后进一步抗不可信 schema。
- 应用方案/交互闭环：V1 已成熟；V2 Phase 1/3/4 后供应商、版本、长文档循环形成闭环。
- 实现接线：本方案执行并通过 Phase 1-5 验证后成熟；当前尚未开始写码。
- 验证标准：协议仿真层方案成熟；真实供应商层必须等 live 配置，未执行前为 untested。

整体结论：方案成熟，可执行；执行完成不等于真实供应商已验证，交付声明必须按验证分层如实标注。
