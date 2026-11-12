# TASK_LEDGER - 2026-11-13 - scripts-lifecycle-audit-v1

## 1. 目标与原话

用户原话：

> 你这后续项根据经验文件门禁和执行纪律做一个详细的方案出来

上游合同：`PROPOSAL_2026-11-12_REDUNDANCY_CLEANUP_V1.md` 第 9 节第 1 条，`scripts/` lifecycle audit 独立方案；本轮只出方案，不执行删除。

最终可感知行为：产出成熟可执行的 scripts/ 生命周期审计方案，等待用户批准 P0 清单与 D1-D5。

本轮交付物：

1. `_audit/PROPOSAL_2026-11-13_SCRIPTS_LIFECYCLE_AUDIT_V1.md`
2. 本台账

## 2. 门禁读证

| Gate | 关键证据 | 适用 |
| --- | --- | --- |
| G0.1 | 经验 v10:20 目标对齐 | 方案锚定 scripts lifecycle |
| G0.3 | 经验 v10:36 诚实闭环 | 本轮只声明方案级，未声明执行闭环 |
| G0.4 | 经验 v10:44 门禁复读 | 已读 2026-11-12 DEV_LOG 与经验 v10.4.1 |
| G0.6 | 经验 v10:60 方案成熟度 | 方案第 7 节分层结论 |
| G0.7 | 经验 v10:68 正反推研磨 | 实证基线 + 作者反证 |
| G0.9 | 经验 v10:84 影响圈声明 | 方案第 4 节影响圈 |
| G0.12 | 经验 v10:114-131 台账七节 + DEFECT-SWEEP | 本文件 |
| G0.13 | 经验 v10:134 最小必要性 | 明确不加框架/预算/调度/UI |
| G1.2 | 经验 v10:154 删除引用闭包 | P2 删除前三面复扫 |
| G1.4 | 经验 v10:176 验证真实分层 | P0 只证明清单与统计能力，不冒充执行闭环 |
| G1.5 | 经验 v10:192 验证器自身质量 | 清单生成器自证与失败路径要求 |
| G1.11 | 经验 v10:274 测试契约同批更新 | 删除同批收口 npm 入口/规格引用 |
| G1.14 | 经验 v10:303 缺陷面枚举 | 第 7 节枚举清单 |
| G1.15 | 经验 v10:313 组件必要性评估 | Tier A-E 处置分级 |
| G1.17 | 经验 v10:335 执行者自盲区 | 方案第 8 节作者反证 |
| G1.21 | 经验 v10:396 脚本生命周期 | 主门禁；tmp 生命周期、质量修复分账 |
| G1.22 | 经验 v10:414 检测/评分校准 | deai 校准 lib/tests 不默认 KEEP |
| G1.30 | 经验 v10:501 方案语义复核 | 后续执行按方案逐项对账，不把产物存在当闭环 |

## 3. 路由判定

### 加入

1. G0.12 台账；本轮为非平凡方案任务。
2. G0.13 最小必要性：方案不做自动化调度、UI 或预算系统。
3. G1.2/G1.5/G1.11/G1.14/G1.21/G1.22：删除、清单仪器、测试契约、缺陷面、脚本生命周期与校准资产均落在方案面。

### 排除

| Gate | 排除理由 |
| --- | --- |
| G1.10 | 本轮不修改权限、认证或文件授权。 |
| G1.12/G1.13 | 本轮不封装、不执行 Electron 实测。 |
| G1.20 | 不新增预算；后续也不允许以清单为名引入预算系统。 |
| G1.24/G1.25 | 不修改共享测量或 CJS 测试执行路径；只审计脚本资产。 |

## 4. 影响圈与作者反证

### 本轮打算改

1. 新增方案 `_audit/PROPOSAL_2026-11-13_SCRIPTS_LIFECYCLE_AUDIT_V1.md`。
2. 新增台账 `_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-13_scripts-lifecycle-audit-v1.md`。

### 本轮可能碰到

1. 读取 `scripts/**`、`package.json`、`src/**`、`electron/**`、`docs/**` 与 `_audit` 历史证据。
2. 不写入任何上述读取对象。

### 后续方案允许触碰

1. `scripts/**`、`package.json` scripts 段、`docs` 规格引用。
2. `_audit/scripts-lifecycle/` 清单、批次台账、归档目录。
3. `_audit/TASK_LEDGERS/` 与 DEV_LOG。

### 作者反证

1. 交接摘要数字可能失真；实测修正为 455 处/115 文件与 123 个破坏性文件。
2. `Tier A=12` 按入口级扫描可能低估内部链；P0 用 entryClass + internal-chain 分列。
3. `scripts/tmp` 未追踪但仍在运行面；D1 建议归档，不是自动删除。
4. deai 校准 lib 可能是未启用资产；P1 单独按 G1.22 判定。
5. 文档引用不等于当前规格有效；Tier B 需找最近台账对账。
6. `_audit` 证据库与 scripts 生命周期不是同一边界；本轮明确不处理 1.53GB。

## 5. 停止条件

### 本轮通过

1. 方案与台账七节齐备。
2. 方案内关键数字全部来自当轮实测或明确标注上轮审计结论。
3. 只新增两份审计文件；无脚本/产品代码变更。

### 后续 P0 通过

1. `INVENTORY_2026-11-13.csv` 行数 == scripts 实际文件数。
2. 清单生成器负向测试证明解析失败/空统计会失败。
3. D1-D5 用户落定。
4. 无 `decision-required` 遗留未登记原因。

### 后续失败

1. 清单漏行、静默吞错或行数对不上。
2. 删除候选缺三面引用或闭包路径。
3. 任意批次缺 git tag/SHA-256/独立 revert 锚点。

## 6. 执行证据

### 基线命令与关键输出

1. 规模：`(Get-ChildItem scripts -Recurse -File).Count` = 195；`git ls-files scripts` = 193。
2. 入口引用：`rg "verify-deai-stage-guidance-electron" src electron package.json` 命中 `src/components/pipeline/__tests__/deai-stage-guidance.integration.spec.ts:22`；package.json 中 11 条 scripts 引用 scripts/。
3. 静默吞错：`rg -c` 汇总 455 处；`rg -l | Measure-Object` = 115 个文件。
4. 破坏性操作：`rg -l "taskkill|Stop-Process|rmSync|unlinkSync|Remove-Item" scripts --glob "!tmp/**"` = 123 个文件。
5. tmp：`Get-ChildItem scripts/tmp` = `redundancy-audit.mjs` 2942B、`verify-chapter-batch-ui-electron.mjs` 11524B；git check-ignore 确认排除。
6. `_audit` 对照：verification-* 181 目录、10,874 个已入库文件；总库 14,703 文件 / 约1.53GB。
7. 历史哈希：上轮冗余审计登记 0 组 SHA-256 逐字节重复；P0 必须重验，不直接继承结论。

### 证据边界

1. 本轮没有执行 P0 清单生成，因此不声明清单闭环。
2. 本轮没有跑 Electron/供应商验证，因此不声明任何运行时闭环。
3. "6 个 DOC_SPEC_ONLY" 为交接基线 + 上游方案语义，P0 必须逐个文件化复核。

## 7. 缺口清单与缺陷面枚举

### 已登记缺口

1. 未生成清单本体；本轮边界为方案。
2. Tier D 175 个文件的逐文件裁决未开始。
3. 455 处静默吞错只完成规模分类，未逐文件归因。
4. `scripts/tests/` 四个测试文件与 npm/package.json 主测试入口未完全对账，P0/P1 补。
5. deai 校准 lib/tests 的启用语义需按 G1.22 单独判定。
6. DOC_SPEC_ONLY 6 个文件待逐个文件化，当前只有分类数。

### 缺陷面枚举（G1.14）

| 枚举面 | 命中 | 处置 |
| --- | --- | --- |
| 分支/状态清理点 | 不适用：本轮不改代码 | 后续删除批次对账 git tag/SHA-256 |
| 同款 sibling | scripts 内同语义版本族、内部调用链 8 条 | P1 批次化 |
| 旧协议残留 | 455 处静默吞错 + 123 个破坏性操作文件 | P3 分账，不与删除混合 |
| 链式字段写入者/读取者 | npm → script → 内部链 → evidence | P0 清单 evidenceRefs + P1 四问 |
| 仪器自盲区 | 清单生成器可能吞错/漏行 | 方案 P0 强制负向测试 |
| 观测对象盲区 | tmp 脚本未追踪但仍运行 | D1 归档/删除二选一 |
| 历史证据边界 | `_audit` 1.53GB 不在本轮 | 明确非目标，避免误删证据 |
| 测试契约 | scripts/tests 4 个文件 + spec readFileSync | Tier A/C 分类，P0 复核 |
| 动态引用 | 动态字符串/调用链漏扫 | P0 多模式复扫 + decision-required |
| 校准未成熟资产 | deai lib/tests/candidates | P1 G1.22 单独裁决 |
| 删除/修复混淆 | 可能因贪图一次 commit 混账 | 方案禁止同 commit 混合 |
| 归档膨胀 | 归档可能变成二次堆积 | D1 逐文件收益评估，禁止一刀切 |

[DEFECT-SWEEP] 上表 12 项均已在方案 Phase 中给出处置路径；本轮无产品代码改动，不存在改动点回归冒充清零。

## 8. 结论

1. 方案已达到 P0 可批准状态；P2/P3 不随方案自动生效。
2. 交接摘要两处数字已在当轮复核中修正，并以方案第 1 节为准。
3. 等待用户裁决 D1-D5；裁决后先执行 P0，再进入 P1/P2/P3 分批闭环。

## 9. 裁决与修订记录（2026-11-13）

1. 用户裁决：D1-D5 全部按方案建议采纳；方案第 5 节转为生效约束。
2. 方案同步修订（apply_patch）：清单增加 gitTracked 字段与执行日期一致规则；Tier B/C 逐个列名；新增仍承担交付验证的客观判据；破坏性命中误报复核；批次计划第二审批门；每批对账表与 DEV_LOG 收口；归档清单字段。
3. 本轮边界不变：未触碰产品代码与 scripts/，未执行 P0。
4. 仍开放：P0 清单未生成；Tier C 计数在 P0 后转精确；本轮无运行时验证义务。

## 10. P0 执行证据（2026-11-13）

### 命令证据

1. `node _audit/scripts-lifecycle/negative-case.mjs` → exit 0；`NEGATIVE-PATH-HARNESS: PASS`。
2. `pwsh.exe -NoProfile -ExecutionPolicy Bypass -File _audit/scripts-lifecycle/build-inventory.ps1` → exit 0；`total=195 tracked=193 csvRows=195`。
3. `git diff --check` → exit 0。

### 产物

1. 清单：`_audit/scripts-lifecycle/INVENTORY_2026-11-13.csv`；SHA256 `09C59A654522CB03C30C9CC7C70AADDC81AF9BEEF367069849C92CF1F8A4053A`。
2. 证据摘要：`_audit/scripts-lifecycle/P0_EVIDENCE_2026-11-13.txt`。
3. 日志：`_audit/DEV_LOG_2026-11-13-scripts-lifecycle-p0.md`，并已登记 `DEV_LOG_MASTER_INDEX.md`。

### 实测分类与质量面

1. 分类：npm=11、src-electron=1、doc-spec=6、internal-chain=25、none=152；合计 195，未分类为 0。
2. Tier B 六文件：`calibrate-intent-routing-thresholds.mjs`、`run-intent-adversarial-factory.mjs`、`verify-app-confirm-layering.mjs`、`verify-design-fusion-legacy.mjs`、`verify-intent-corpus-electron.mjs`、`verify-outline-workspace.mjs`。
3. Tier C 25 成员按 CSV `entryClass=internal-chain` 与 `evidenceRefs` 逐个列名；包含 decrypt-provider-key、style-profile、deai 与 lib/tests 四族。
4. 质量初筛：catch-silent 116、destructive 124、subprocess 121、provider 99、live 19、no-timeout 69、secret-suspicion 61；SHA-256 重复组 0。
5. `scripts/tmp/` 两文件在 CSV 中均为 `decision-required`，等待 P1 按 D1 归档/删除终态裁决。

### 仪器修复与负向证明

1. 移除 builder 自测夹具内部清理，消除“先删证据后验证”的时序缺陷。
2. parentMap 空数组初始化，消除真实仓库因空父链导致 `ContainsKey($null)` 失败。
3. negative-case 改用 builder `runDate` 命名 CSV，消除 UTC/local 跨天假失败。

### 基线漂移登记

1. 静默吞错：方案旧口径 455/115；临时 `rg` 当前口径 449 lines/112 files；builder 多规则口径 116 files。P1 不继承旧数，以 CSV 为准。
2. 破坏性：方案旧口径 123 files 排除 tmp；builder 全 scripts 口径 124 files，差异仅 `scripts/tmp/verify-chapter-batch-ui-electron.mjs`。
3. secret-suspicion 61 是初筛，不等于真实泄密；P1 逐文件复核，已知含固定测试假键、脱敏断言与 safeStorage 字段名。

### 结论

P0 通过；P1 批次划分、P2 处置执行、P3 质量修复仍需用户另行批准。
