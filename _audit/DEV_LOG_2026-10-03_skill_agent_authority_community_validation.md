# DEV LOG 2026-10-03 - SKILL/Agent 权限单源化社区验证

## Objective

验证 3.73.0 的 SKILL/Agent 权限单源化方案是否与业界成熟方向一致，寻找可吸取经验与剩余盲区。

## Scope

- 只做社区调研、源码取证与本地对账。
- 不修改生产代码。
- 不重新封装，不改变 3.73.0 交付状态。
- 不回滚、不清理既有未提交工作区改动。

## Research Evidence

- 报告：`_audit/RESEARCH_2026-10-03_SKILL_AGENT_AUTHORITY_COMMUNITY_VALIDATION.md`
- 源码缓存：`_audit/community-evidence/skill-agent-authority-2026-10-03/`
- 调研对象：OpenAI Agents Python、OpenAI Codex、Roo Code、Continue.dev、Aider、Cline、OpenHands、Google ADK。
- 证据标准：真实源码 + commit + file:line；README 不作为证据。

## Verification

- `git ls-remote https://github.com/google/adk-python.git HEAD` -> `e94c2e726a269e0f04e2e4b202f5c131c80c20de`，补齐 ADK 当前 HEAD 证据。
- 缓存 19 个源码文件到仓库证据目录，包含本轮新增的 ADK 3 个确认链路文件。
- 逐项核对 3.73.0 的授权结构、服务层守卫、SKILL adapter、双入口、测试契约与 Electron 验证产物。
- 核对 `_audit/verification-skill-agent-authority/summary.json`：4/4 cases、8/8 readonly turns、4/4 edit turns 全部通过。

## Findings

- 3.73.0 的“SKILL 只提供领域能力，写入授权由意图 + 操作类型 + 执行计划模式三元组单源决定”与 8 个社区项目的主流实现一致。
- 没有发现相反方向的成熟实践；当前权限模型不需要回滚或重构。
- 剩余差距为观测性与防御纵深：
  - R1：部分 trace `toolPolicy` 仍传授权 source 字符串，建议升级为结构化 `permissionDecision`。
  - R2：工具定义层可增加 `defaultToolPolicy` 静态元数据。
  - R3：未来若允许 SKILL 声明工具，必须默认 disabled，且不能覆盖三元组授权。
  - R4：可登记安全风险分级为观测增强。
  - R5：未来若引入跨轮确认，应采纳 ADK 的历史调用 ID、工具名、参数一致性校验。
- 不采纳项：Roo 的模式切换审批、Cline/ADK 的强制确认层、OpenHands 的 SKILL 直接携带工具。

## Deliverables

- 新增社区验证报告 1 份。
- 新增社区源码证据目录 1 个，19 个源码文件。
- 本开发日志 1 份，并登记到 DEV_LOG_MASTER_INDEX。
