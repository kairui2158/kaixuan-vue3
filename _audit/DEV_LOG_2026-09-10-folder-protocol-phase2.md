# 2026-09-10 Folder 协议成熟化第二阶段

## 开发功能

依据 `_audit/FOLDER_PROTOCOL_MATURITY_RESEARCH_2026-09-10.md` 执行第二阶段“正文与资源激活注入”。

1. `RealSkillPackage` 新增 `body` 字段，`skill-loader.js` 解析并返回 `SKILL.md` frontmatter 之后的完整正文。
2. `realSkillExecutor.ts` 的系统提示组装改为“智能体 -> SKILL.md 正文 -> template.md -> 全部资源 -> 后缀”；正文与模板内容相同时只注入一次。
3. folder 资源以 `[folder resource: 相对路径]` 标头完整注入真实 API 请求，无截断、无省略、无分页；符合本项目“上下文就是生产资料”的定稿决策。
4. `Skill` 接口新增 `resourceSummary`，设置页技能卡片、单个导入预览、批量导入预览显示“资源 N 个 / 警告 N 条”。
5. 新增 `scripts/verify-folder-resource-injection.mjs`：源 Electron + CDP + 本地 SSE mock 供应商，完整走“新建项目 -> 设置页导入 folder -> 主页选择技能 -> 发送请求 -> 校验 system prompt”的真实 UI 链路。

## 用途

第三方 folder SKILL 的 `SKILL.md` 正文不再只当作元数据描述，深层 `references/`、`assets/` 资源也不再在激活时静默丢失；SKILL 作者写在入口文档里的执行协议、约束和参考资料会完整进入模型上下文。导入前和导入后都能看到资源与警告摘要，方便第三方包作者自检。

## 验证

```text
npm run test:services
Test Files  15 passed (15)
Tests  167 passed (167)

npm run type-check
vue-tsc --noEmit
exit 0

npm run build:vue
vite build && vite build --config vite.protocols.config.mts
✓ built in 1.87s
✓ built in 27ms

node scripts/verify-folder-resource-injection.mjs
[PASS] 源 Electron CDP 启动 | port=9241
[PASS] 导入预览显示资源与警告
[PASS] 技能卡片显示资源摘要
[PASS] 真实 API 请求已捕获 | requests=1
[PASS] 请求仅 1 次 API 调用 | requests=1
[PASS] SKILL.md 正文完整注入 | systemLength=318
[PASS] template.md 独立完整注入 | systemLength=318
[PASS] 深层资源一完整注入
[PASS] 深层资源二完整注入
[VERDICT] PASS
```

验证脚本会备份并恢复 `wa_skills`、`wa_projects`、`wa_co_creation_config`、`wa_providers`、`wa_lastProjectId`、`wa_chat_*`，测试后清理探针 profile，并断言 `_data` 无探针残留。

## 遗留

第二阶段已闭环。方案第三至四阶段未在本轮执行：技能包 manifest、社区脚本约定兼容、with/baseline 评测闭环。下一轮建议先做 manifest 与脚本兼容，再建立可复现评测。
