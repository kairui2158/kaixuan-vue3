# 开发日志：真 SKILL 双方案融合落地

**日期**：2026-09-07  
**方案**：`_audit/REAL_SKILL_FUSION_EXECUTION_PLAN.md`  
**状态**：开发与自动化验证完成，等待用户实操验收；本任务不升版本、不封装

## 功能与用途

本次将“真 SKILL 底座方案”和“真 SKILL 升级方案”融合成一条执行链，让应用支持文件夹形式的标准 SKILL：

- 文件夹 SKILL 可导入、持久化、重启恢复，并支持路径失效提示与重新选择。
- SKILL 文件夹内可携带 `template.md`、`meta.json`、`script.js`、`samples.txt`、`schema.json`。
- `preProcess -> API -> postProcess` 真实执行，Agent 的 systemPrompt、model、temperature、maxTokens 全部进入请求。
- 支持动态模板、multi-pass、schema 重试、智能样本、composite 组合编排。
- 全局 API 预算与单 SKILL 限额生效，超限 BLOCKED，不再静默烧请求。
- 去AI味、生成流水线、主页共创三条消费路径统一通过 router 接入，folder 失败不伪装成功。

## 主要改动

| 模块 | 文件 | 内容 |
|------|------|------|
| Electron IPC | `electron/ipc/skill-loader.js` | 文件夹读取、列表、脚本沙箱执行 |
| preload | `electron/preload.js` | 暴露 skillLoadFolder / skillListFolders / skillExecuteScript |
| 主进程 | `electron/main.js` | 注册 skill-loader |
| 类型与 store | `src/stores/skill.ts` | 新增 format/folderPath 持久化字段 |
| 导入导出 | `src/services/configExchange/` | JSON 与 Markdown 兼容新字段 |
| 设置页 | `src/components/settings/SkillSettings.vue` | 文件夹导入、路径状态、能力标签 |
| 加载缓存 | `src/services/realSkillLoader.ts` | IPC 加载与 mtime 缓存 |
| 预算 | `src/services/apiCallBudget.ts` | 全局预算 + 单 SKILL 限额 + 调用记录 |
| 执行器 | `src/services/realSkillExecutor.ts` | single/multi-pass/schema retry/smart samples |
| 编排器 | `src/services/skillOrchestrator.ts` | composite 顺序编排、深度限制、循环检测 |
| 路由 | `src/services/skillRouter.ts` | text/folder 统一分流，失败抛错携带结果 |
| 共创引擎 | `src/services/workspaceSkillEngine.ts` | folder 接入上下文、Agent、预算与失败断点 |
| 去AI味 | `src/composables/useDeAi.ts` | Agent 参数真实传入，三模式统一执行入口 |
| 流水线 | `src/components/pipeline/PipelinePanel.vue` | folder 分流接入，保留原进度与取消链路 |
| 主页共创 | `src/components/chat/ChatPanel.vue` | folder 技能进入共创消息流 |
| 大纲工作台 | `src/components/common/OutlineWorkspace.vue` | 共用 workspaceSkillEngine folder 能力 |

## 关键修复

1. **SKILL.md 路径归一化**：设置页导入时把 `...\SKILL.md` 归一化为父目录，首次导入不再误报“缺少 SKILL.md”。
2. **compose folder 丢失**：`combineComposeTemplate()` 现在保留 folder 技能对象，compose 混合 folder 不再退回 text 路径。
3. **探针假失败**：修正 `wa_ctx_` 存储键、`max_tokens` 协议字段、folder-minimal 成功夹具选择三处断言。
4. **失败可见**：folder failed/blocked、composite BLOCKED、schema degraded 均进入日志与 UI 状态，不伪装成功。

## 验证证据

| 验证 | 结果 | 证据 |
|------|------|------|
| TypeScript | 通过 | `npm run type-check` |
| 服务测试 | 通过 | `npm run test:services` |
| 构建验证 | 通过 | `npm run build:vue` |
| 设置页导入/重启/失效恢复 | 通过 | `_audit/tmp/cdp_probe_real_skill.cjs` + 源 Electron |
| multi-pass UI | 通过 | `_audit/tmp/real-skill-generation-multi-pass-evidence.json` |
| composite UI | 通过 | `_audit/tmp/real-skill-generation-composite-evidence.json` |
| folder-full / mixed / retry UI | 通过 | `_audit/tmp/real-skill-remaining-*.json` |
| 主页共创 Agent 参数与上下文 | 通过 | `_audit/tmp/real-skill-remaining-coCreation-evidence.json` |
| 动态模板 | 服务级通过 | `src/services/realSkillExecutor.spec.ts:172-180` |

## 验证边界

- V13 动态模板只有服务级测试证据，无源 Electron UI 专项探针；按计划验收门“进入 system message + 测试证明”核销。
- F6.4 用户实操六条路径尚未执行：设置页导入、重启确认、去AI味、流水线、主页共创、多轮/重试/组合状态展示。
- 用户实操验收通过前，不升级版本号、不封装。
