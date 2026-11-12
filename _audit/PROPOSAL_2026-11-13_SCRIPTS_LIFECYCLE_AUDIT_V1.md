# PROPOSAL - 2026-11-13 - SCRIPTS LIFECYCLE AUDIT V1

> 上游依据：`_audit/REDUNDANCY_AUDIT_2026-11-12.md` 第 4 节 B1、`_audit/PROPOSAL_2026-11-12_REDUNDANCY_CLEANUP_V1.md` 第 9 节第 1 条。
> 本轮边界：只审计、只出清单与分级处置方案；不删除、不改产品代码。清单本体在清单 Phase（P0）生成。
> 裁决状态：D1-D5 已于 2026-11-13 全部按建议采纳；第 5 节自本行起为生效约束，不再是待定建议。
> 本方案为 V1 修订版：交接基线中"静默吞错 6 处/破坏性脚本 120 个"已复核修正为"455 处命中/115 个文件；破坏性关键词命中 123 个文件"。

## 0. 目标与非目标

目标：为 `scripts/` 195 个文件建立可审计、可分批执行的生命周期处置面，把"历史验证资产"与"仍承担交付验证职责的脚本"分开，最终减少无效资产与维护负担。

非目标：不处理 `_audit/` 1.53GB 证据库；不修改 folder SKILL；不新增脚本框架、调度器、UI 或预算系统；不把"没引用"当删除依据；本轮不执行删除。

## 1. 实证基线（2026-11-13 复核）

| 事实 | 数值 | 采集方式 |
| --- | --- | --- |
| `scripts/` 总文件 | 195（187 顶层 + lib/tests/tmp 子目录） | `Get-ChildItem scripts -Recurse -File` |
| git 追踪 | 193；`scripts/tmp/` 2 个被 .gitignore 排除 | `git ls-files scripts` |
| 外部入口引用 | 11 个 npm scripts、1 个 src spec `readFileSync`、6 个 doc/spec-only | `rg` 扫描 package.json/src/electron/docs |
| 无外部入口 | 175 | 同上（内部互调另行归链） |
| 静默吞错命中 | 455 处 / 115 个文件 | `rg "catch \{\}|\.catch\(\(\) => ''\)|SilentlyContinue" scripts --glob "!tmp/**"` |
| 破坏性操作命中 | 123 个文件（taskkill/Stop-Process/rmSync/unlinkSync/Remove-Item） | `rg -l` |
| 子进程/供应商脚本 | 120 个文件含 spawn/execFile/execSync；139 个含供应商/API/live 关键词 | `rg -l` |
| 最大脚本 | verify-pipeline-parallelism-electron.mjs 110KB | 文件枚举 |
| `_audit` 对照 | 14,703 文件 / 1.53GB；verification-* 181 目录 / 10,874 个已入库文件 | `Get-ChildItem` + `git ls-files` |
| 历史重复结论 | 0 组 SHA-256 逐字节重复（2026-11-12 审计） | 上轮冗余审计，P0 将重验 |

P0 执行时必须重跑上表全部命令；任一数值漂移先修清单，再谈处置。

## 2. 分类与处置总表

| 类别 | 数量基线 | 定义 | 处置 |
| --- | --- | --- | --- |
| Tier A | 12 | npm scripts 或 src/electron 直接引用 | 保留；禁止删除；列入长期回归资产 |
| Tier B | 6 | 仅文档/规格引用 | 保留并登记为规格资产；文档失效时先改规格再删脚本 |
| Tier C | 约 10 | 内部调用链成员（decrypt-provider-key.cjs、style-profile-p0 三件、deai lib/tests 等） | 按链整体裁决；只删链头视为闭包未闭环 |
| Tier D | 175 | 无外部入口 | 逐文件清单 + 按闭包分批裁决；允许归档替代删除 |
| Tier E | 2 | `scripts/tmp/`（redundancy-audit.mjs、verify-chapter-batch-ui-electron.mjs） | 按 G1.21 生命周期裁决：删除或 `_audit/scripts-lifecycle/archive/` 归档，必须二选一，禁止继续留任 |

分类是"入口证据"，不是存活判决。任何删除候选还必须过第 4 节 P1 的四问裁决。

## 3. 执行计划

### Phase P0：清单与仪器自证（唯一必做 Phase）

1. 产出 `_audit/scripts-lifecycle/INVENTORY_2026-11-13.csv`（不在 `scripts/` 内，避免清单自身成为第 196 个脚本）。清单文件名日期必须等于实际 P0 执行日期；执行日不同时按实际日期命名，并在台账登记基线漂移。
2. 列字段：path、sizeBytes、lastCommitDate、gitTracked、entryClass（npm/src-electron/doc-spec/internal-chain/none）、qualityFlags（catch-silent/destructive/subprocess/provider/no-timeout 等）、evidenceRefs、disposition（keep/retire/archive/fix-quality/decision-required）、reason。
3. 生成清单的审计脚本本身按 G1.5/G1.21 验收：行数必须等于实际文件数、解析失败必须非零退出、空统计必须失败；不允许 `.catch(() => '')` 类实现。
4. 输出只读摘要：Tier 计数、语义版本族、live-provider 含密钥嫌疑文件、`scripts/tmp` 处置建议；Tier B 六个文件与 Tier C 内部链必须逐个列名，P0 后不得遗留计数-only 结论。

### Phase P1：裁决前置（仍然不动文件）

1. 对 `scripts/tmp/` 两个文件给出"删除或归档"终态裁决与依据。
2. 对 Tier A/B/C 的 KEEP 例外做四问复核：当前交付门禁是否还依赖；是否有同语义第 3 次收敛机会；组合/供应商风险；删除或冻结收益。
3. 对 Tier D 输出批次划分：同语义版本族一批；每批 ≤20 文件；给出可独立 `git revert` 的批次编号。批次计划完成后构成 P2 启动前的第二道审批门；用户未批准批次计划不得进入 P2。
4. 对含密钥/供应商现场风险文件标注 `quarantine-only`：命中密钥痕迹只隔离，不做删除。
5. 仍承担交付验证的客观判据：脚本可从 npm scripts 或发布门禁文档在两跳内到达；否则登记 historical-only。D3/D4 按此判据分账，禁止凭主观印象修历史脚本。
6. 破坏性关键词命中只是初筛；P1 对 active 脚本逐行确认真实性并排除注释/文档误报，historical-only 只冻结不逐行审查。

### Phase P2：处置执行（用户批准清单后才启动）

1. 每批删除前：三面引用闭包复扫（生产、测试、历史资料）、同语义链头确认、`git tag scripts-lifecycle-<batch>`、SHA-256 全量对账后落盘到批次台账。
2. 删除完成条件：文件行数 == 哈希账本行数；`rg -n "<path>" package.json src electron docs` 零命中；`git diff --name-only` 只含 scripts/ 允许面。
3. 同批收口 npm 入口：删除底层脚本时，若存在对应 package.json 入口必须同 commit 移除（G0.10/G1.2）。
4. 归档路径：`_audit/scripts-lifecycle/archive/`，逐文件 SHA-256 校验；归档清单记录原路径、哈希、日期与 D1 裁决引用；证据目录原样保留，不移动。
5. 禁止一次性大面删除；任一批失败即停，修复批次定义后重新申请。
6. 每批完成即落批次台账（文件数、哈希行数、负向断言结果、tag 名）后继续下一批；任一批失败立即停；全部批次完成后汇总对账表并追加 DEV_LOG，交用户复核后 P2 才算闭环。

### Phase P3：质量修复与冻结（与删除分账）

1. 静默吞错族（115 文件 / 455 处）逐文件分类：修质量、历史冻结、随处置删除。禁止把历史验证器全部升格为"当前交付资产"后统一大改。
2. 破坏性操作守卫：只修 Tier A/B/C 与仍参与交付验证的脚本；历史-only 脚本登记冻结，不花维护预算复活。
3. live/超时/finally 语义缺陷（G1.5）同口径分批修复；每批 ≤8 文件，逐脚本全量重跑或显式声明 `historical-only`。
4. 质量修复与生命周期删除不得混入同一 commit。

## 4. 台账七节（G0.12）

1. 目标与原话：用户要求按经验文件门禁与执行纪律为冗余清理方案第 9 节后续项出详细方案；本轮只出方案。
2. 门禁读证：G0.1/G0.3/G0.4/G0.6/G0.7/G0.9/G0.12/G0.13、G1.2/G1.4/G1.5/G1.11/G1.14/G1.15/G1.17/G1.21/G1.30、G1.22（deai 校准脚本面）。
3. 路由判定：排除 G1.12/G1.13（本轮不封装、不 Electron 实测）；排除 G1.10（不改权限）；排除 G1.20（不新增预算）。
4. 影响圈：本轮只新增方案 + 台账；后续只允许触碰 scripts/、package.json scripts 段、docs 规格引用、审计台账与 DEV_LOG。
5. 停止条件：见第 6 节。
6. 执行证据：本节引用第 1 节实测命令结果；P0 后补清单生成命令与自证输出。
7. 缺口清单与缺陷面枚举：见任务台账第七节。

## 5. 裁决点

2026-11-13 用户裁决：D1-D5 全部按建议采纳；下表保留原始理由，作为生效约束。

| 裁决 | 建议 | 理由 |
| --- | --- | --- |
| D1 tmp 脚本 | 归档到 `_audit/scripts-lifecycle/archive/`，不直接删除 | redundancy-audit.mjs 是上轮审计方法载体；chapter UI 脚本可能成为批量验证样例；归档可保留可复用性且移出运行面 |
| D2 Tier D 清单 | 本轮列全 175 个，不按月分批出清单 | 分批出清单会把单一事实切成多份，后续对账更容易漏；只列清单不等于全删 |
| D3 静默吞错 | 分批修复 + 历史冻结分账，不做 115 文件一刀切 | G1.21 禁吞错，但把历史-only 脚本全量升格修复属于新增负担；分账能同时守住质量与最小必要性 |
| D4 破坏性脚本 | 只修仍承担交付验证的脚本；历史-only 冻结 | 守卫修复成本必须对应真实执行概率；冻结面单独可追溯 |
| D5 旧脚本清理策略 | Tier D 逐文件清单 + 按闭包分批裁决，不设"自动到期删除" | 时间不是引用证据；自动化到期删除违反最小必要性与可恢复要求 |

## 6. 停止条件

### 通过

1. P0 清单行数 == 实际文件数；未分类项为 0；审计脚本自身负向测试通过。
2. 每个删除候选有 entryClass、evidenceRefs、闭包路径与批次编号。
3. Tier A/B/C 每个成员可指出消费者；Tier D 每个成员有处置建议或 `decision-required`。
4. 每个处置批次有独立 revert 锚点、SHA-256 对账与三证验证命令。
5. 处置后 `rg` 负向断言为零命中，或命中项可证明是断言不存在而非执行残留。
6. 清单含 `gitTracked` 字段；Tier B 六文件与 Tier C 链逐个列名，无计数-only 遗留。
7. P0 清单日期与实际执行日期一致；规模或质量命中漂移已在台账登记并解释。
8. P0/P2/P3 每个完成点均已追加 DEV_LOG 条目，且批次计划在 P2 前获得用户批准。

### 失败

1. 任何阶段把"无 npm 引用"单独当删除依据。
2. 清单漏文件、静默吞解析错误，或用空值冒充统计。
3. 删除与质量修复混在同一 commit；历史 DEV_LOG 被改写。
4. `scripts/tmp/` 继续无生命周期地留任。
5. 归档/删除后哈希对账缺失。
6. 跳过批次计划审批直接执行 P2，或以初筛关键词直接定罪 active 脚本。

## 7. 方案成熟度结论（G0.6）

- 执行器/工具层：成熟。P0 只产出清单与自证，无产品运行路径。
- 应用方案/交互闭环：不适用（不触碰产品 UI）。
- 实现接线：成熟。本轮零产品代码改动；后续批次均在 scripts/ 闭包内。
- 验证标准：成熟。有仪器自证、负向断言、哈希对账、分批 revert 与停止条件。
- 总结论：**成熟且已生效；D1-D5 已采纳，P0 为当前唯一可执行 Phase；P2/P3 必须等待清单、批次计划审批与二次确认。**

## 8. 作者反证（G1.17）

1. 假设：交接基线可信。证伪：P0 重跑全部规模/引用/质量命令；已发现 6 处/120 个两个数字失真，P0 输出以实测为准。
2. 假设：Tier A/B/C 分类完整。证伪：动态字符串拼接、调用链、DOC_SPEC 引用可能漏扫；P0 用多模式 rg + git history 复核，未定论标 `decision-required`。
3. 假设：DEAI 校准 lib 可留。证伪：G1.22 校准数据未成熟时 lib/tests 可能属于未启用链路；P1 按"校准资产待启用"单独裁决，不默认 KEEP。
4. 假设：归档比删除安全。证伪：归档会延长仓库/工作区负担；D1 通过后按文件评估收益，不允许"全部归档"一刀切。
5. 假设：文档引用脚本仍被需要。证伪：Tier B 逐个找最近 DEV_LOG/TASK_LEDGER；若规格已废弃，先修规格同批再处置脚本。
6. 假设：批量删除不会破坏历史验证。证伪：删除前 git tag + SHA-256；历史验证证据在 `_audit/`，不依赖脚本本体执行。

## 9. 附录：清单契约

- 位置：`_audit/scripts-lifecycle/INVENTORY_2026-11-13.csv`；UTF-8、LF、含表头。
- disposition 枚举：`keep`、`retire`、`archive`、`fix-quality`、`quarantine-only`、`decision-required`。
- 每行必须有 reason；`decision-required` 必须写明缺什么证据。
- 清单是审计产物，不得被产品代码或 npm scripts 引用。
