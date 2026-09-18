# 2026-09-10 Folder 协议成熟化第三阶段

## 开发功能

依据 `_audit/FOLDER_PROTOCOL_MATURITY_RESEARCH_2026-09-10.md` 执行第三阶段“社区脚本约定兼容 + 技能包 manifest + 冲突规则固化”。

1. **skill.json manifest**：folder 包支持 `skill.json`；id/name/version 优先于 `SKILL.md` frontmatter；同 id 或同名冲突产生 `manifest-id-conflict` / `manifest-name-conflict` warning；坏 JSON 降级为 `manifest-invalid` warning，不再阻断导入。
2. **脚本桥协议**：`skill-script-worker.js` 修复 Electron `utilityProcess` 与 Node `worker_threads` 的 `parentPort` 消息协议差异，真实 Electron 桥恢复可用；`postProcess` 支持纯 stdout 结构化 JSON 输出；console/stdout/stderr 分别进入诊断通道并有条数与体积上限。
3. **冲突规则固化**：同一路径绑定到不同 folder id 时产生显式路径冲突 warning；批量扫描内重复 id 自动标记 `exists` 并提示按重复策略处理；单个与批量导入预览均传入现有 folder 记录做冲突判断。
4. **回归防线**：新增 `scripts/tests/skill-script-worker.spec.cjs`，同时覆盖 raw value 与 Electron `{ data: request }` 两种消息信封，防止 Node 单测再次掩盖真实 Electron 桥故障。

## 用途

第三方 folder SKILL 作者可以用 `skill.json` 声明稳定包元数据；脚本作者可以按社区常见约定在 postProcess 阶段输出结构化 JSON，不强制导出函数；用户导入重复路径或重复 id 时，应用会在预览阶段给出明确提示，而不是静默覆盖或导入后状态混乱。

## 验证

```text
npm run test:services
Test Files  15 passed (15)
Tests  172 passed (172)

node scripts/tests/skill-script-worker.spec.cjs
PASS skill-script-worker protocol

npm run type-check
vue-tsc --noEmit
exit 0

npm run build:vue
✓ built in 2.78s
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

源 Electron + CDP P0 脚本桥探针（完整 IPC 链路）
P0_PROBE_PASS normal=probe:ok escape=blocked:TypeError: Cannot read properties of undefined (reading 'pid') after-escape=main:alive
```

P0 探针通过渲染进程 `window.electronAPI.skillExecuteScript` 走完整 IPC 链路，覆盖正常钩子执行、VM 沙箱内 `process` 访问被阻断、逃逸尝试后主进程仍存活。

## 遗留

第三阶段已闭环。研究方案中的 with/baseline 评测闭环仍未执行，建议下一阶段作为独立任务立项，先定义可判定断言，再引入对照评测。
