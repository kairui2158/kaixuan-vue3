# `callApiWithAgentVariant` 死接口清理方案 V1

版本：V1  
日期：2026-11-02  
状态：待用户确认，未执行  
目标版本：3.110.15 → 3.110.16  
来源：V6.2 台账边界项，方案见 `_audit/PROPOSAL_2026-11-01_BODY_DEAI_VISIBLE_CLOSURE_V6_2.md` 第 5 节“明确不做”

## 0. 目标

只清理一个已确认的死接口：`PipelinePanel.vue` 内的 `callApiWithAgentVariant` 包装函数。

必须同时满足：

1. 生产调用面只有 `callApiWithAgentVariantOwned`，包装函数无任何调用方。
2. 降AI契约、trace、UI 五态行为不变。
3. 新增负向守护，防止未来重新引入无调用的兼容包装。
4. 不扩展为“顺手清理其他死代码”，避免爆炸半径扩大。

## 1. 现状与根因

### 1.1 现状

- 定义：`src/components/pipeline/PipelinePanel.vue:3810`，`callApiWithAgentVariant`。
- 唯一行为：转发到 `callApiWithAgentVariantOwned`。
- 唯一生产调用点：`src/components/pipeline/PipelinePanel.vue:3361`，调用的是 `Owned` 版本。
- 全仓调用面：`rg "callApiWithAgentVariant"` 仅命中定义、转发实现与 `Owned` 定义。
- 测试守护：`src/`、`scripts/`、`electron/` 下无 `callApiWithAgentVariant` 专项测试。

### 1.2 为什么会留下

V6.2 修的是“可视闭环”，方案第 5 节按爆炸半径把死接口清理裁决为后续项。这个裁决本身是对的：当时混入删除会扩大 V6.2 diff。现在的欠账是：后续项只写在台账里，没有独立闭环方案。

### 1.3 风险定性

P2，不是 P0/P1：

- 不参与运行时路径，不会改变生成、降AI、trace 行为。
- 无调用方，不会被用户触发。
- 12 参数转发链长，后续维护者容易误以为是兼容入口并重新接线。
- SKILL 层曾把“agent 路径未真实接线”列为质疑点，该包装保留会继续造成“似乎存在 agent 入口”的误读。

## 2. 门禁路由

加入：

- G0.1 目标对齐：只删死包装，不改 `Owned` 行为。
- G0.3 诚实闭环：删除后必须给出引用闭包证据，不得用 type-check 冒充。
- G0.5 回头看：收尾前全仓反查、定向测试、真实 Electron 验证。
- G0.8 收尾清理：diff 逐行审、无临时脚本、无新增遗留。
- G0.10 新旧并存清零：执行层只允许一个入口名。
- G0.12 台账七节：独立任务台账。
- G1.1 精准编辑：apply_patch 删除函数，不重写文件。
- G1.2 删除与引用闭包：生产、测试、脚本、历史资料四面搜索。
- G1.5 验证先行：先加负向测试并确认当前 RED，再删实现。
- G1.8 trace 契约：降AI事件语义不变。
- G1.21 脚本生命周期：复用现有验证器，不新增临时脚本。
- G2.13 SKILL/runtime：确认 folder SKILL 调用仍走 `Owned`，`meta.deai` 继续透传。

排除：

- G0.2 无预算铁律：用户未声明无预算。
- G0.11 真实交互冒充禁令：本轮无新增 UI 交互，复用既有验证器。
- G2.9 流水线业务门禁：不改流水线编排、契约、重试策略。
- G2.11 供应商门禁：不改 provider/model/profile 解析。

## 3. 影响圈

打算改：

- `src/components/pipeline/PipelinePanel.vue`：删除 `callApiWithAgentVariant` 包装函数。
- `src/components/pipeline/__tests__/deai-injection-policy.spec.ts`：新增死接口负向守护。
- `package.json`、`package-lock.json`：升版 3.110.16。
- `_audit/DEV_LOG_2026-11-02_callapi-agent-variant-dead-interface-closure.md`
- `_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-02_callapi-agent-variant-dead-interface-closure.md`
- `_audit/DEV_LOG_MASTER_INDEX.md`

可能碰到：

- 编译器是否会因未用函数报错或继续放行：以 type-check 为准。
- SKILL 层读取源码判断 agent 接口形态：删除后必须同步手册说明，避免他们继续按旧名对账。
- 版本与安装包：清理本身不改变行为，但按交付惯例升版封装。

明确不碰：

- `callApiWithAgentVariantOwned` 内部逻辑。
- `resolveDeaiProjection`、`emitDeaiInjectionPolicyTrace`、`buildDeaiGuidancePackTraceEvent`。
- `deaiGuidanceDisplay`、五态 UI、trace schema。
- 手动降AI功能。
- `callApiWithAgentTimeout`：历史已确认不存在，不重复处理。
- 其他未使用函数：只登记，不混入本轮。

## 4. 作者反证

| 假设 | 证伪方式 |
| --- | --- |
| 包装函数无生产调用方 | `rg -n "callApiWithAgentVariant" src scripts electron` 删除前后各跑一次；删除后只允许 `Owned` 命中 |
| 动态调用未被发现 | 检索去掉括号的裸函数名；搜索字符串模板、`window`、动态 import、eval 场景；当前无命中 |
| 测试不依赖包装名 | 定向测试删除前先加负向断言并确认 RED；删除后 GREEN |
| trace 行为不变 | 重跑 `node scripts/verify-deai-guidance-ui.mjs`，五态 A-E 全 PASS |
| 类型系统可捕捉误删 | `npm run type-check`；若 `Owned` 被误删会出现未定义引用 |
| 静态断言只查一个文件 | 负向断言扫描 `PipelinePanel.vue`；另用命令级 `rg` 全仓复核 |

## 5. 执行任务

### Task 1：负向守护先行

1. 在 `deai-injection-policy.spec.ts` 增加“死包装不得回潮”用例：
   - `pipelineSource` 不得包含 `async function callApiWithAgentVariant(`。
   - 必须包含 `async function callApiWithAgentVariantOwned(`。
   - 必须包含 `await callApiWithAgentVariantOwned(`。
   - 统计 `callApiWithAgentVariant` 出现次数，扣除 `Owned` 后必须为 0。
2. 先运行该用例，确认当前 RED。
3. RED 输出写入台账第 6 节。

### Task 2：删除死包装

1. 用 apply_patch 删除 `PipelinePanel.vue:3810-3812` 的包装函数。
2. 不改 `Owned` 函数名、参数、行为。
3. `git diff -- src/components/pipeline/PipelinePanel.vue` 逐行审，确认只删三行。

### Task 3：引用闭包清零

命令：

```powershell
rg -n "callApiWithAgentVariant" src scripts electron
```

通过条件：

- 输出只包含 `callApiWithAgentVariantOwned`。
- 不存在裸名 `callApiWithAgentVariant` 的非 `Owned` 命中。
- 测试文件中的负向断言允许保留。

### Task 4：行为回归

1. `npx vitest run src/components/pipeline/__tests__/deai-injection-policy.spec.ts src/services/deaiGuidanceDisplay.spec.ts src/services/skillDeaiContract.spec.ts src/services/deaiChainVariantIntegration.spec.ts`
2. `npm run type-check`
3. `node scripts/verify-deai-guidance-ui.mjs`
4. `npm run build:vue`
5. `npm run test:services`

停止条件：

- 任一命令失败即停止，不允许进入升版封装。
- Electron 五态任一 run 失败即判定清理破坏观测面。

### Task 5：文档与台账

1. DEV_LOG 写明：V6.2 后续项已收口、删除范围、验证证据、B6 仍 provisional。
2. 任务台账七节齐全，登记 RED/GREEN 证据。
3. 主索引登记 3.110.16。
4. SKILL 手册补充一句：agent 调用唯一生产入口是 `callApiWithAgentVariantOwned`，旧包装名已退役，防止 SKILL 层继续按旧名对账。

### Task 6：升版与封装

1. `package.json`、`package-lock.json` 升 3.110.16。
2. `npm run build`
3. 核验安装包 `dist/神意助手-Setup-3.110.16.exe` 与 asar 版本标记。
4. git 提交：`refactor(pipeline): remove dead agent variant wrapper`。

## 6. 验收矩阵

| 面 | 验收 |
| --- | --- |
| 生产源码 | 裸名执行层命中 0；`Owned` 保留且调用不变 |
| 测试 | 负向守护 GREEN；定向 4 files / 37+ tests 通过 |
| 类型 | `npm run type-check` exit 0 |
| 真实 UI | 五态 Electron A-E 全 PASS |
| 全量回归 | `npm run test:services` 0 failure |
| 构建 | `build:vue`、`build` exit 0 |
| 版本 | 3.110.16，安装包存在 |
| 文档 | DEV_LOG、台账七节、主索引、SKILL 手册同步 |
| Git | 单一功能提交；提交后 `git status --short` 干净 |

## 7. 风险与回退

| 风险 | 等级 | 处理 |
| --- | --- | --- |
| 动态引用漏检 | 低 | 裸名全仓搜索 + 负向断言 + type-check 三重验证 |
| 误删 `Owned` | 低 | diff 逐行审；只允许删除包装三行 |
| 验证器环境波动 | 中 | 按 V6.2 已验证命令重跑；失败先查 dist 新鲜度提示 |
| 版本封装耗时 | 低 | 清理无行为变化，但仍按完整交付门禁执行 |

回退策略：若任何验证失败，恢复包装函数三行，负向测试改为登记未完成，不允许带失败封装。

## 8. 决策点

1. 是否确认本方案只处理死包装，不扩展到其他死代码扫描？建议：是。
2. 是否确认升版 3.110.16 并封装？建议：是，保持客户可交付版本可追溯。
3. 是否确认把“其他死代码扫描”作为独立后续审计，不在本轮混入？建议：是。

## 9. 反向质询

1. 为什么不直接接线使用它？因为它无调用方；为了“用起来”而新增调用属于伪造需求，且会扩大行为面。
2. 为什么不连 `Owned` 一起改名？那会触碰 API 调用、trace、meta 传递与测试锚点，属于行为面变更，违背最小影响圈。
3. 为什么升版？客户安装包必须与源码状态一一对应；否则 3.110.15 会继续携带死代码，形成版本语义污染。
4. 为什么修改名不删 trace？trace 事件由 `Owned` 产生，删除包装不改变事件来源。
5. 为什么必须真实 Electron？防止“纯函数全绿但 UI 观测面被构建或接线破坏”的老问题回潮。

## 10. 成熟度

- 执行器/工具层：成熟。单一文件三行删除 + 一条负向测试。
- 应用方案：成熟。影响圈已闭包，无行为变更。
- 验证：成熟。RED/GREEN、type-check、全量、真实 Electron、构建、安装包全链路。
- 风险：低。失败条件机器可判定，回退路径明确。
