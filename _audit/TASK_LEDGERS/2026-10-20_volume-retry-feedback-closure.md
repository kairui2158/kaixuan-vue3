# 任务台账：卷纲层历史问题修复与 schema retry 反馈收口

## 1. 目标与原话

用户确认执行卷纲层历史问题修复方案，并要求按经验文件执行、硬证据门禁、禁止“登记不修”，完成后升版收尾。

最终可感知行为：非终步 schema retry 不再把候选全文回传给模型；每次 retry 的反馈构成进入 run trace；卷纲 folder 链请求不混入直连 JSON 协议；续卷上下文只携带 summary 与有界锚点；旧协议句式可被新旧两代清理规则剥离。

## 2. 门禁读证

- G0.3 诚实闭环：无 live 证据的行为登记 `untested`。
- G0.4 经验回写：收尾必须裁决经验文件是否升级。
- G0.5 回头看：收尾前对账历史登记项、diff、生产入口与验证证据。
- G0.10 新旧并存清零：旧 `buildSchemaRetryFeedback` 全文回传、旧协议注入路径必须清零。
- G0.12 门禁执行台账：本文件为执行凭证，七节不可空。
- G1.1 精准编辑：只改 schema retry 反馈、卷纲协议与观测接线。
- G1.4 验证分层：单测、全量、type-check、build 分层声明。
- G1.5 验证器自身质量：测试必须证明候选全文未回传且指标可见。
- G1.8 日志与观测同步：新回调与 trace 事件同批落地。
- G1.17 作者反证：对“删全文即安全”“folder 判定一处即可”等假设证伪。
- G1.19 请求体放大治理：retry 反馈与续卷上下文必须可度量、有界。
- G2.9 终稿与流水线：终步反馈契约不回退，非终步补齐同族约束。

## 3. 路由判定

加入：G0.3、G0.4、G0.5、G0.10、G0.12、G1.1、G1.4、G1.5、G1.8、G1.17、G1.19、G2.9。

排除：

- G1.18 本地确定性路径：本轮不改本地变换语义。
- G2.4 API 直写与 EditTask：本轮只涉及流水线 SKILL 执行器。
- G2.11 供应商软错误：本轮不改供应商错误分类与 reasoning 配置。

## 4. 影响圈与作者反证

打算改：`schemaRetryFeedback.ts`（新增）、`realSkillExecutor.ts`、`realSkillTypes.ts`、`skillRouter.ts`、`PipelinePanel.vue`、`volumeGeneration.ts`、`volumeBatchOrchestrator.ts` 及对应 spec。

可能碰到：正文/卷纲所有非终步 schema retry、终步 polish 反馈、folder 与 direct-json 双通道、续卷请求体、trace 事件 schema、历史事故回放测试。

作者反证：

- 假设一：retry 只要删掉候选全文即可。证伪：错误清单与定位锚点缺失时模型不知道修哪里，会凭空重写；必须保留错误前 10 条与最多 3 条锚点。
- 假设二：候选摘要可以无度量。证伪：无法证明全文确实被抑制；必须输出 `suppressedCandidateChars` 等指标。
- 假设三：终步与非终步可共用一套反馈。证伪：终步 polish 需要上游输入与失败指标，候选高重合是职责特征；本轮保持 `buildFinalStepSchemaRetryFeedback` 不动。
- 假设四：folder 判定只写在编排器即可。证伪：`buildVolumePrompt` 仍会生成直连 JSON 指令，必须从 PipelinePanel 传入 `outputProtocol` 并双入口分流。
- 假设五：续卷上下文保留上一卷 outline 可以靠模型自行取舍。证伪：这正是请求体滚动放大来源；必须 summary 优先且 outline 只留 240 字符锚点。

## 5. 停止条件

- 非终步 schema retry 请求不包含候选全文，反馈中有错误清单、锚点与有界摘要。
- trace 可见 `schema-retry-feedback-composed` 及五项指标。
- 终步 retry 反馈契约测试不回退。
- folder 链 prompt 不包含 `VOLUME_OUTPUT_PROTOCOL` / 直连数组输出指令；direct-json 通道保留 JSON 契约。
- 续卷请求只含 summary 与 240 字符锚点；多行旧协议句式可剥离。
- 定向、全量、type-check、build 全绿；无 live 验证面如实登记 `untested`。

## 6. 执行证据

- 反馈单源：`src/services/schemaRetryFeedback.ts:66`。错误 10 条上限、锚点 3 条 / 每条 200 字符、候选头尾 200 字符摘要与五项指标在单源函数内产出。
- 执行器接线：`src/services/realSkillExecutor.ts:1133-1135`、`:1199-1201` 两处非终步 retry 消费新模块并触发回调；`src/services/realSkillExecutor.ts:15` 引入单源；终步 `:1131`、`:1197` 保持 `buildFinalStepSchemaRetryFeedback`。
- 回调穿透：`src/services/realSkillTypes.ts:220`、`src/services/skillRouter.ts:53`、`:193`；trace 事件 `src/components/pipeline/PipelinePanel.vue:2229-2232`。
  - 验证：`npx vitest run src/services/schemaRetryFeedback.spec.ts` → exit 0，1 file / 3 tests。
- 执行器反证：`npx vitest run src/services/realSkillExecutor.spec.ts` → exit 0，1 file / 37 tests；原 6 处候选全文断言已反转为有界反馈断言，历史 `finalStepMetadataReplay.spec.ts` 保留旧 trace 事故证据，不伪装历史不存在。
- 卷纲协议分流：`src/components/pipeline/PipelinePanel.vue:4198` 单源判定 folder 链，`:4227`、`:4237-4238` 传入 `outputProtocol`；`src/services/volumeGeneration.ts:84` 按 `outputProtocol` 分流。
  - 验证：`npx vitest run src/services/volumeGeneration.spec.ts` → exit 0，1 file / 28 tests，覆盖 direct/folder 协议与 240 字符锚点。
- 旧协议剥离：`src/services/volumeBatchOrchestrator.ts:69`，`:101-102` 输出协议单源分流。
  - 验证：`npx vitest run src/services/volumeBatchOrchestrator.spec.ts` → exit 0，1 file / 28 tests，新增多行剥离用例。
- 定向合计：`npx vitest run src/services/schemaRetryFeedback.spec.ts src/services/realSkillExecutor.spec.ts src/services/volumeGeneration.spec.ts src/services/volumeBatchOrchestrator.spec.ts` → exit 0，4 files / 96 tests。
- 全量：`npx vitest run` → exit 0，178 files / 2055 tests。
- 类型与构建：`npm run type-check` → exit 0；`npm run build:vue` → exit 0，双产物齐备。
- 封装与启动核验：`npm run build` → exit 0；`node scripts/verify-packaging-3-100-0.mjs` → exit 0，真实启动 packaged app、`electronAPI=77`、renderer 可见文本通过，输出 `PACKAGING 3.100.0 VERIFICATION PASSED`。证据：`_audit/verification-packaging-3-100-0/packaging-evidence.json`，installer SHA256 `7339303075759fcf68eccd1dc5985b729c21ee8959cd07ccf19bab23fcc304ab`。
- 收口核验：`git diff --check` 无空白错误；`rg -n "3\.100\.0"` 确认 package/package-lock 双版本同步；旧 3.97.0 安装产物已清理。

## 7. 缺口清单

1. **新反馈的真实 live 效果未验证。** 单测证明请求体形态与指标，但未在真实供应商上观察 schema retry 后的收敛率变化，登记 `untested`；下一次 Electron + 真实 API run 必须断言 `schema-retry-feedback-composed` 事件存在且 `suppressedCandidateChars > 0`。
2. **`chainHandoff.reason` 缺口属 SKILL 层。** 应用 warning 观测已存在；需 SKILL 侧为 full 交付步骤声明 reason，本轮不越界修改 SKILL 元数据。
3. **reasoning per-step 配置化仍为登记项。** 当前 `reasoning: off` 仅在 `reasoning_only_stalled` 自动重试触发，尚未提供 SKILL/步骤级主动配置。
4. **`volumeRefText` 只处理卷纲摘要。** 若其他层仍存在上游产物全文滚动，需要按同一门禁逐层专项审计；本轮只修卷纲链实测缺口。
