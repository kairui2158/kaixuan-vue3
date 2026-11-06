# SKILL REPORT 2026-11-06: 凯旋正文层 kaixuan-s1 agent.md 脱钩诊断

## 目的

应用侧只读诊断，不改 SKILL 目录。本报告回答方案 P2-C 的问题：folder SKILL 目录内的 `agent.md` 声明与 `script.js` 校验器之间是否存在脱钩，以及应用侧是否感知该脱钩。

## 取证事实

### 文件位置与时间戳

| 文件 | 路径 | 大小 | mtime |
|---|---|---|---|
| S1 agent 声明 | `D:/codex/玄武规划SKILL/凯旋-正文层/agent_kai_xuan_s1_scene.agent.md` | 3795B | 2026-11-04 |
| S2 agent 声明 | `D:/codex/玄武规划SKILL/凯旋-正文层/agent_kai_xuan_s2_prose.agent.md` | 1308B | 2026-11-03 |
| S3 agent 声明 | `D:/codex/玄武规划SKILL/凯旋-正文层/agent_kai_xuan_s3_polish.agent.md` | 1753B | 2026-11-03 |
| S1 脚本 | `D:/codex/玄武规划SKILL/凯旋-正文层/kaixuan-s1/script.js` | 11150B | 2026-11-06 09:26 |

三个 agent 声明文件位于正文层父目录（`凯旋-正文层/`），不在各步骤包目录（`kaixuan-s1/` 等）内。这与方案 V1 中"agent.md 在包目录内"的原始描述不符——方案取证时路径判断过时，本报告以实际磁盘位置为准。

### S1 script.js 当前校验器清单（2026-11-06 09:26 版本）

`kaixuan-s1/script.js`（11150B）包含完整校验器：

1. `checkWordContract` — 字数契约
2. `checkHandoff` — 正文交接协议
3. `checkStateLedger` — 状态账本
4. `checkSceneStructure` — 场景结构
5. `checkNotReady` — NOT-READY 判定
6. `checkConstructionCards` — 施工卡
7. `checkSceneWordContract` — 场景字数
8. `checkDialogueLayout` — 对白排版

方案 V1 中"精简版只剩 checkSceneStructure/checkHandoff/checkNotReady 三个检查"的判断已过时。2026-11-06 09:26 的 script.js 是完整版校验器，与方案取证时（11-06 07:46-07:51 期间的精简版）是不同磁盘状态。

### 应用侧加载行为

应用通过 `realSkillLoader.loadRealSkill()` 加载 folder SKILL。加载入口（`realSkillLoader.ts`）只读包目录内的 `meta.json`、`template.md`、`script.js` 等标准文件，不读取父目录或包目录内的任何 `*.agent.md` 文件。

`rg -n "agent" src/services` 搜索结果显示应用消费 agent 信息的方式：
- `realSkillExecutor.ts:769-776`：合并 `pkg.meta.agent`（meta.json 内的 agent 字段，用于模型/温度等运行参数默认值）。
- `skill-loader.js:9`：`OPTIONAL_FILES` 不含 agent.md。
- `skill-package.js:42-45`：只检查 `meta.agent` 是否 deprecated，不读取 agent.md。
- `useConfigExchange.ts:108-181`：`.agent.md` 导入导出是独立的 Agent 配置通道，与 folder SKILL 运行链无关。

结论：应用加载 folder SKILL 时**不读取 agent.md**；agent.md 内的阈值合同不进入应用执行链。

## 脱钩判定

### 物理脱钩

agent.md 在父目录、script.js 在包目录，两个文件不在同一 folder SKILL 包内。folder SKILL 的包边界以 `meta.json` 所在目录为准，agent.md 在包外。

### 语义脱钩风险

SKILL 作者在 agent.md 中声明的阈值合同（如事件密度、字数比、段落中位等）与应用加载的 script.js 校验器行为之间没有一致性保证：

1. agent.md 阈值修改后 script.js 校验器可能未同步更新，或反之。
2. 应用侧无法感知这种不一致，因为它不读 agent.md。
3. 只有 SKILL 层自检时才能发现两个文件的合同冲突。

### 当前实际状态

当前 script.js 已恢复完整校验器（2026-11-06 09:26），不再是方案取证时的精简版。因此当前时点 agent.md 与 script.js 的语义合同是否一致，需要 SKILL 层自行对账，应用侧无法代判。

## 建议（SKILL 层执行，应用侧不越界）

1. SKILL 层统一 agent.md 与 script.js 的阈值合同：修改任一文件时必须同步另一文件，或把阈值统一写在一个文件里让另一文件引用。
2. 如果 agent.md 的声明需要进入运行链，建议把 agent 声明移入各步骤包目录内（如 `kaixuan-s1/agent.md`），并让 `skill-loader.js` 的 `OPTIONAL_FILES` 包含它；这一改动归 SKILL 层决策，应用侧只配合。
3. 应用侧不需要为此新增代码。当前行为（不读 agent.md）是 G0.13 最小必要性的正确体现：agent.md 是 SKILL 内部协作文件，不是应用运行契约。

## 应用侧结论

本轮 P2-C 交付完成：应用侧已核实 agent.md 不参与 folder SKILL 运行加载，脱钩风险归 SKILL 层管理，应用侧无需修改。方案 V1 中"精简版 script.js 只剩三个校验器"的描述已过时，本报告以 2026-11-06 09:26 的实际磁盘状态为准。
