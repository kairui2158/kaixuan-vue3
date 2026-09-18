# Folder 协议成熟化社区调研报告（2026-09-10）

## 结论

我们的 folder skill 是“能跑的私有 1.0”，不是社区意义上的成熟协议。它自己定义了六文件白名单、必须存在 `template.md`、私有 `preProcess/postProcess` hook，能服务当前应用，但与官方 Agent Skills 生态不兼容，第三方技能包里的 `references/`、`assets/`、`scripts/` 会被静默丢弃。

成熟协议的共识是四件事：**任意资源文件 + SKILL.md 唯一入口；渐进式披露；可控的加载流程；宽容验证**。这四件我们一件都没有完整实现。我们的加载流程不采用社区 token 预算，也不做成本削减：技能激活时完整读取 `SKILL.md` 与其声明的资源，加载策略只服务正确性；此外我们缺技能评测闭环，这是 SKILL 调试方最需要、社区已经标准化的能力。

本轮只做调研，不改代码。完整证据日志见 `_audit/research-cache/folder-protocol-2026-09-10/research-log.md`。

## 证据来源

| 来源 | 性质 | 关键证据 |
| --- | --- | --- |
| `agentskills/agentskills` | Agent Skills 官方规范 | `docs/specification.mdx:12,28-32,218`；`docs/client-implementation/adding-skills-support.mdx:81-155,192,279`；`docs/skill-creation/using-scripts.mdx:227-298` |
| `openai/codex` | 官方宿主实现 | `codex-rs/skills/src/parser.rs:46-98`；`loader/mod.rs:31-32`；`loader/discovery.rs:17-116`；`ext/skills/src/render.rs:25-404,1156-1182`；`catalog_prompt.rs`；`tools/read.rs/list.rs` |
| `anthropics/skills` | 官方技能与包结构 | `.claude-plugin/marketplace.json:13-41`；`template/SKILL.md`；`skills/skill-creator/SKILL.md:145-241,394-404` |
| `obra/superpowers` | 跨宿主技能工程方法论 | `skills/writing-skills/SKILL.md:18-45,146-156,461-480,552-582`；`docs/porting-to-a-new-harness.md:33-53,83-118,169-298,827` |
| 本应用 | 当前协议状态 | `electron/ipc/skill-loader.js:6-7,130-156`；`src/services/realSkillLoader.ts:37-59`；`src/services/realSkillExecutor.ts:13-15,298-317`；`src/stores/skill.ts:61-66` |

四个社区来源均为真实克隆，缓存于 `_audit/research-cache/folder-protocol-2026-09-10/`。`openai/codex` 在 Windows 长路径 checkout 失败，证据用 `git show HEAD:<file>` 从对象库读取。

## 横向对比

| 维度 | 官方规范 | openai/codex | anthropics/skills | superpowers | 我们当前 |
| --- | --- | --- | --- | --- | --- |
| 目录结构 | `SKILL.md` 必需，任意子目录/文件 | 递归扫描，深度 6，目录数 2000 | 插件显式声明技能路径列表 | 技能目录共享给多宿主 | 六文件白名单，不扫子目录 |
| 必需文件 | 仅 `SKILL.md` | 同规范 | 同规范 | 同规范 | `SKILL.md + template.md` |
| 元数据 | name/description 必填，metadata 任意扩展 | 同规范 + short-description，YAML 可修复 | 模板极简：name + description | 只强调触发描述 | 私有 schema，缺文件即失败 |
| 解析容错 | 坏 YAML 先修复，完全坏才跳过 | frontmatter 自动修复 | 官方技能本身规范 | 对 description 写法有实验结论 | meta/schema JSON 解析失败直接失败 |
| 渐进披露 | 元数据 -> 指令 -> 资源三层 | 目录工具 + 按需读取 + 分页 | 技能目录 + 激活读取 | 技能正文按需读取 | 无，一次性加载 |
| 加载策略 | 推荐正文 <5000 tokens | 上下文比例预算，超限截断/省略并报告 | 未强调 | 通过 description 控制触发 | 当前仅模板全量；定稿方案为激活后完整读取，无预算无削减 |
| 激活方式 | `<skill_content>` 结构化包裹 | 目录提示 + `skills.read` | 激活工具描述注入 | 文件读取或技能工具 | 模板直接进执行器 |
| 脚本协议 | 非交互、结构化输出、退出码 | 权限不扩大回合沙箱 | 技能内含 scripts | 工具映射按宿主适配 | 私有 `script.js` + hook 字段白名单 |
| 冲突处理 | 确定策略 + warning | path 规则优先 name | 插件路径显式声明 | 技能正文不改，映射适配 | id 加 `folder:` 前缀共存 |
| 评测 | 未强制 | 影子选择器实验 | skill-creator 完整 eval 闭环 | RED-GREEN-REFACTOR | 无 |

## 关键差距

### P0：生态兼容

官方规范允许任意子目录与文件，我们只认六个文件名。这直接导致第三方技能包导入后“看起来成功，实际资源丢了”。证据对照：`docs/specification.mdx:12,218` vs `electron/ipc/skill-loader.js:6-7,142`。

### P0：渐进式披露与完整加载

Codex 的做法是先给模型一个低成本目录，激活后按需读正文和资源，超预算时截断 description、轮转分配、省略并报告（`render.rs:319-404`）。我们是一次性把模板塞进执行器，技能数量一多，上下文成本和注意力稀释都会失控。

我们的取舍：**不引入 token 预算，不做成本削减，不做截断、省略、分页或中断**。小说创作是文字场景，上下文就是生产资料，不为省钱或省 token 削弱它。加载策略的唯一目的是正确性：选中技能前只展示元数据用于选择；技能被选中后，完整读取 `SKILL.md` 正文和其声明的全部资源，再进入执行。

### P1：解析宽容度

社区普遍选择“尽量修复、警告、继续”，完全不可解析才跳过。Codex 甚至有 `repair_frontmatter_scalar_fields`。我们当前 `meta.json/schema.json` 解析失败直接 fail，对第三方包不友好。

### P1：hook 协议正式化

`preProcess/postProcess` 是我们的私有扩展，可以保留，但必须补四件事，这些正是卷纲 SKILL 反馈过的问题：

1. `template.md` 在 folder 模式下的执行权必须明确，不能再让流水线 base template 静默优先。
2. `postProcess.issues` 必须有阻断、重试、诊断语义，不能被忽略。
3. `usage` 与 API 记录必须逐技能落库，chain 中每个 SKILL 一条完整 API 记录。
4. `fromCache` 必须改名并定义为 `folderPackageCache`，避免被误解为生成结果缓存。

### P1：技能包结构

Anthropic 的 `marketplace.json` 用显式路径列表声明一个包内多个技能。这比“扫目录猜技能”可靠，适合我们的“技能包导入”演进方向。

### P2：评测闭环

skill-creator 的流程是：测试用例 -> with-skill 与 baseline 同轮跑 -> assertions -> `grading.json`（text/passed/evidence）-> benchmark 聚合 -> 用户反馈 -> 迭代。superpowers 进一步要求“没有失败基线就不写技能”。我们目前只有运行日志，没有可比对照、没有 pass_rate、没有触发准确率。

## 成熟化改造建议

### 第一阶段：兼容与观测（先做）

1. 保留六文件作为兼容层，但新增资源扫描：记录全部子目录文件清单，不预读内容。
2. `SKILL.md` 成为唯一硬入口；`template.md` 缺失时降级为“用 SKILL.md 正文 + 元数据”，不再直接失败。
3. `meta.json/schema.json` 解析失败改为 warning + 跳过该可选文件，导入仍成功。
4. 落实四项协议修正：模板执行权、`postProcess.issues` 语义、逐技能 API 记录、`fromCache` 改名。
5. 导入预览显示“已识别文件 / 被忽略文件 / 警告”，让用户看见真实包结构。

### 第二阶段：渐进披露（完整加载版）

1. 技能目录只渲染 name、description、资源清单摘要。
2. 技能激活时完整读取 `SKILL.md` 正文。
3. 技能激活时完整读取其声明的全部资源文件，不做分页、截断或抽样。
4. 不设置 token 预算，不做超限截断、自动省略、分页或执行中断。

### 第三阶段：脚本协议与技能包

1. `script.js` 保留私有 hook，同时兼容社区脚本约定：非交互、结构化输出、stdout/stderr 分离、有意义退出码。
2. 引入技能包 manifest，显式声明技能路径、版本、兼容范围。
3. 冲突规则固化为“包内显式声明优先，路径规则覆盖名称规则，冲突必须 warning”。

### 第四阶段：评测闭环

1. 建立 `evals/evals.json` 测试用例格式。
2. 每个用例跑 with-skill 与 baseline 两份输出。
3. assertions 先做本地可判定项：结构完整、禁词命中、字数区间、目标文件引用。
4. 生成 `grading.json` 与 benchmark 汇总，接入现有运行记录面板。

## 验收标准

1. 导入官方规范示例技能（含 `references/`、`assets/`、`scripts/`）不丢文件，导入预览能完整列出。
2. `template.md` 缺失、`meta.json` 坏 JSON、frontmatter 带未加引号冒号，三类输入都能导入成功并给出 warning。
3. folder chain 每个技能有独立 API 记录：status、responseText、duration、usage。
4. 技能目录只包含元数据与资源摘要用于选择；技能激活后 `SKILL.md` 正文与全部声明资源完整进入执行；无预算、无截断、无 omission、无分页、无执行中断。
5. `postProcess.issues` 会在运行记录中呈现阻断/非阻断语义。
6. 至少一个真实技能完成 with/without 对照评测并输出 benchmark。

## 风险与取舍

- 渐进披露会改变现有执行链路的时序，必须先在运行记录里加观测，再切换行为；本轮明确不采用 token 预算，也不做成本削减，避免预算机制引发隐性中断。
- 官方规范没有 `template.md` 概念，我们的模板机制要明确定位为“宿主私有扩展”，不能冒充社区标准。
- 评测闭环会消耗 API 费用，建议默认只对用户明确标记“调试中”的技能开启。
