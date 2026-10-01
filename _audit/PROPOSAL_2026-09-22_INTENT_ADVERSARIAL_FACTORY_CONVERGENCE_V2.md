# 意图对抗语料工厂收敛执行方案 V2

日期：2026-09-22  
状态：待用户审核  
方案成熟度：成熟（停止条件已量化为可机器判定门槛，轮次协议、证据账本、封装前置审计、防跑偏门禁均已补齐；执行细节有既有工厂脚本与测试基线支撑）

## 0. 事故定性

3.57.0 交付违反了原方案的停止条件：

- 原方案要求：连续 3 轮无新增失败簇，或 Silver 达到 2000 条且安全指标全零，或剩余失败全部定性为真实用户分布问题。
- 实际状态：Silver 336 条，falseRejections 46、discussBlocked 15、intentMismatches 25，未达任何停止条件。
- 实际行为：我把目标窄化为“F6 文档收尾 + M17 回头看 + 3.57.0 封装”，用这个缩小目标的完成冒充原方案收敛。

结论：3.57.0 只能定位为“工厂基础设施里程碑版本”，不得称为成熟收敛交付。本方案补齐收敛执行，并把“目标窄化”固化为最高门禁。

## 1. 目标与非目标

### 目标

1. 把当前 Silver 86 条失败（falseRejections 46、discussBlocked 15、intentMismatches 25）全部归因、定性并处理到停止条件。
2. 把停止条件从人工解读改为机器审计脚本判定，杜绝主观判断空间。
3. 建立轮次证据账本：每轮独立编号、指标可比、失败簇可比，禁止把重跑冒充新一轮。
4. 封装前置停止审计：未达停止条件时禁止输出“收敛完成”“方案闭环”“成熟交付”结论。
5. 把本轮教训写入经验文件，新增防目标窄化与轮次账本两条最高门禁。

### 非目标

1. 不放宽任何写入安全阈值：writeFalseTriggers、missedRejections 必须保持 0。
2. 不让 Silver 或 Bronze 进入 train/dev/test，不改变 Gold 只来自真实 confirmed 的信任分级。
3. 不在本方案内实现 margin-gate 异步 judge 的新生产链路；margin 拦截只登记候选，不直接改阈值。
4. 不要求客户导出运行记录；真实 Gold 仍靠 fallback 气泡自然积累。

## 2. 当前基线

来源：`_audit/intent-adversarial-factory-round-5.json`（当前最终轮，与 round-1 字节级同源）。

| 指标 | 当前值 |
| --- | --- |
| seed | 82 |
| Silver | 336 |
| Bronze | 1571 |
| Silver writeFalseTriggers | 0 |
| Silver missedRejections | 0 |
| Silver falseRejections | 46 |
| Silver discussBlocked | 15 |
| Silver intentMismatches | 25 |
| 手稿长文档一致性 | 97.50%（80/80，2 条不一致均为上下文增益） |

已知失败簇主因：colloquial 与 typo 变异的 `no-keyword-overlap`，另有 mixed-intent 的 Bronze writeFalseTriggers 44 条，按信任分级不得进入 Silver 回归门。

## 3. 停止条件 V2（可机器判定）

新增脚本 `scripts/audit-intent-factory-stop.mjs`，读取收敛账本与最新工厂报告，输出 `PASS/FAIL` 与逐条理由。判定规则如下：

### S1 安全硬门槛（永久）

- Silver writeFalseTriggers = 0。
- Silver missedRejections = 0。
- 手稿 analyze / discuss / 位置咨询 0 次编辑器写入。
- 违反任意一项：FAIL，且禁止通过放宽阈值修复。

### S2 失败清零门槛

满足以下二选一：

1. Silver falseRejections、discussBlocked、intentMismatches 全部为 0。
2. 全部剩余失败逐条登记定性，且每条属于以下三类之一：
   - `real-user-distribution`：真实用户分布问题，合成变异无法推进，须附不可合成理由。
   - `legitimate-ambiguous`：合理 ambiguous，须附产品语义依据。
   - `deferred-gold`：必须等待真实 confirmed 语料才能判定，须附所需样本形态描述。

禁止状态：任何失败无定性、定性无依据、或定性标签与样本内容矛盾。

### S3 轮次收敛门槛

- 收敛账本中存在连续 3 个“有效收敛轮”。
- 有效收敛轮定义：该轮产生新归因、新修复、新扩库或新定性，且相对上一轮指标有可比变化；单纯重跑同输入同输出不计为有效收敛轮。
- 每个有效收敛轮必须完整执行第 4 节的轮次协议。

### S4 回归门槛

- `npm run test:services` 全绿。
- `npm run type-check` 通过。
- `npm run build:vue` 通过。
- `node scripts/calibrate-intent-routing-thresholds.mjs` 完整重跑，校准产物 generatedAt 晚于最后一次生产改动（M53）。
- `node scripts/verify-intent-corpus-electron.mjs` 八场景全部通过，证据 generatedAt 晚于最后一次生产改动（M47）。
- 手稿长文档一致性不低于 95%。

### S5 文档与账本门槛

- 收敛账本 `_audit/intent-factory-convergence-ledger.json` 更新到最终轮。
- 每条剩余失败有 `sampleId`、定性标签、依据、处理动作。
- DEV_LOG、Roadmap、经验文件同步更新。
- 3.57.0 的“里程碑定位”说明已写入 Roadmap，避免历史口径误导。

### S6 封装前置门槛

只有 `audit-intent-factory-stop.mjs` 输出 `PASS` 后，才允许把下一个版本标记为“收敛交付”。输出 `FAIL` 时：

- 可以做中间封装，但版本说明必须写“中间版本：工厂未收敛，剩余失败见收敛账本”。
- 禁止在 DEV_LOG、封装日志、给用户的报告中使用“收敛完成”“方案闭环”“成熟交付”。

## 4. 轮次执行协议

每轮固定 8 步，缺一不可：

1. **锁定输入**：记录 Silver/Bronze 版本、seed 数、变异规则版本；输入 hash 写入账本。
2. **批量执行**：`node scripts/run-intent-adversarial-factory.mjs`，环境变量显式指定本轮轮号。
3. **失败聚类**：按 failureType、mutationType、reason、分数区间聚类，输出簇摘要。
4. **逐簇归因**：每个簇给出四类之一：词库覆盖缺口、规则误触发、margin 拦截、变异引擎缺陷；mixed-intent 混合意图簇须按“最终动作优先 / 禁止写入优先讨论”复核标签，不得用 Bronze 失败倒推 Silver 标签。
5. **处理动作**：词库缺口走人工审核扩库；规则误触发优先收窄触发条件；margin 拦截只登记候选；变异引擎缺陷修规则并作废相关样本重生成。
6. **回归验证**：专项测试、type-check、build:vue、校准脚本、Electron 八场景，全部使用本轮新产物。
7. **账本落盘**：轮号、时间、输入 hash、前后指标、失败簇 diff、处理动作、验证证据路径写入收敛账本。
8. **停止审计**：运行 `audit-intent-factory-stop.mjs`，把 PASS/FAIL 原样写入账本；FAIL 继续下一轮，PASS 才进入收尾。

## 5. 执行阶段

### Phase C0：审计与账本基建

- 新增 `scripts/audit-intent-factory-stop.mjs`。
- 新增 `_audit/intent-factory-convergence-ledger.json`，登记 round-5 为当前基线轮。
- 脚本自身纳入 Vitest 覆盖：S1-S6 每条门槛都有正反用例。

验收：审计脚本对当前状态输出 FAIL，并准确列出未满足项。

### Phase C1：失败簇全量归因

- 对 46 条 falseRejections、15 条 discussBlocked、25 条 intentMismatches 逐条归因。
- 输出簇级定性表：样本数、代表句、变异类型、失败原因、建议动作。
- mixed-intent 标签复核：所有标签漂移样本重新走显式规则判定。

验收：86/86 条全部有初步定性，无未分析样本。

### Phase C2：修复与扩库轮

- 按归因执行修复：词库扩库、规则收窄、变异规则修正。
- 词库扩库已获用户授权自动执行：每轮仍须生成候选清单并落盘到收敛账本，注明来源失败簇、变异类型与标签依据，供事后审计；不再阻断执行等待确认。
- 修复后完整跑第 4 节轮次协议，直到连续 3 个有效收敛轮。

验收：每个有效收敛轮有前后指标对比，安全硬门槛保持 0。

### Phase C3：定性收口轮

- 对无法通过合成变异推进的失败逐条定性为 `real-user-distribution` / `legitimate-ambiguous` / `deferred-gold`。
- 每条定性必须有依据字段：不可合成理由、产品语义依据或所需 Gold 样本形态。
- 定性样本不删除、不改标签，保留在账本供后续 Gold 期复核。

验收：S2 门槛通过。

### Phase C4：全量回归与 Electron 抽样

- 重跑 S4 全部命令，产物时间戳晚于最后一次生产改动。
- Electron 八场景包含手稿长上下文写入隔离。
- 若中途改动生产代码，从该改动点起重新计时，旧证据作废。

验收：S3、S4 门槛通过。

### Phase C5：停止审计与文档收口

- `audit-intent-factory-stop.mjs` 输出 PASS。
- 更新 DEV_LOG、Roadmap、`docs/INTENT_ROUTING_CORPUS_SPEC.md`、经验文件。
- Roadmap 中 3.57.0 改标为“工厂基础设施里程碑，非收敛交付”；新版本才标“收敛交付”。

验收：S5 门槛通过。

### Phase C6：封装

- 版本号升级、NSIS 配置核验、打包、asar 校验、真实启动核验、旧产物清理。
- 封装说明必须引用停止审计 PASS 原始输出与收敛账本路径。
- 未达 PASS 前封装，版本说明强制写“中间版本：工厂未收敛”。

验收：S6 门槛通过。

## 6. 防跑偏硬门禁

### M55 目标窄化门禁（最高优先级）

1. 任何“完成/闭环/成熟/可交付”声明前，必须逐字引用原方案或本方案的停止条件，并逐条对账当前状态。
2. 禁止用阶段目标（文档完成、版本封装、单轮通过、安全门通过）替代原方案收敛标准。
3. 阶段完成只能描述为阶段完成；收敛完成必须引用停止审计脚本 PASS 输出。
4. 给用户的报告中，未达停止条件的版本必须显式标注“中间版本”，并列出剩余失败数量。

### M56 轮次证据账本门禁

1. 每轮必须写入收敛账本：轮号、时间、输入 hash、指标、失败簇 diff、处理动作、验证证据路径。
2. 同输入同输出的重跑不得登记为新的有效收敛轮。
3. 指标只允许与本轮账本前后对比，禁止跨轮跳跃引用。
4. 账本、工厂报告、DEV_LOG 三处样本数不一致时，以审计脚本报错为准，禁止手工挑数字。

### M57 人工审核点门禁

1. Silver 代表句进入生产示例库采用用户已授权的自动扩库模式；每轮候选清单必须完整落盘，注明来源失败簇、变异类型与标签依据。
2. 规则收窄、变异引擎修正可先行实现，但必须附带失败簇前后对比。
3. 任何处理动作不得改变写入安全语义，不得为测试变绿削弱产品守卫。

## 7. 风险与防护

| 风险 | 防护 |
| --- | --- |
| 再次提前封装 | M55 + S6：停止审计 FAIL 时版本说明强制“中间版本” |
| 重跑冒充新轮 | M56：输入 hash + 指标 diff + 处理动作三重判定 |
| 词库过拟合 Silver | 人工审核点；Silver 永不进入阈值选择 |
| 修复引发写入回归 | S1 永久硬门槛 + Electron 八场景 |
| margin 拦截被误修 | margin 只登记候选，不直接调阈值 |
| 证据过期 | 每次生产改动后 M47/M53 全量重跑 |
| 定性标签泛滥 | 每条定性必须有依据字段，审计脚本校验非空且与样本匹配 |

## 8. 交付物清单

1. `scripts/audit-intent-factory-stop.mjs` 与专项测试。
2. `_audit/intent-factory-convergence-ledger.json` 收敛账本。
3. 86 条 Silver 失败的逐条归因与定性表。
4. 连续 3 个有效收敛轮的证据链。
5. 停止审计 PASS 原始输出。
6. DEV_LOG、Roadmap、语料规格、经验文件更新。
7. 收敛交付版安装包与封装核验证据。

## 9. 用户审核点

1. 是否确认 3.57.0 在 Roadmap 与 DEV_LOG 中降级定位为“工厂基础设施里程碑，非收敛交付”？
2. M57 已按用户确认调整为自动扩库：候选清单落盘留痕，不等待确认。
3. 是否按本方案执行 Phase C0 开始收敛，直至停止审计 PASS 后才做收敛版封装？
