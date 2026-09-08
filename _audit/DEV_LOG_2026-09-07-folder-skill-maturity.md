# 2026-09-07 Folder SKILL 成熟度 Phase 7 总回归收尾

## 开发功能

- 完成 Folder SKILL 成熟度方案 Phase 7 收尾：重建 `dist-renderer`、重启源 Electron、真实 UI 验证统一诊断面板。
- 通过真实点击完成设置页技能测试闭环：技能卡片定位、测试弹窗打开、运行测试、诊断结果断言。
- 验证 Folder SKILL 测试的降级路径：`preProcess` 返回未知字段时，执行器发出 `hook-field-ignored` warning，最终状态为 `degraded`，请求照常完成。
- 核销上一轮阻塞判断：`SkillSettings` 异步组件 `nextSibling` 崩溃来自旧进程/旧页面残留，不是当前源码缺陷。

## 用途

统一诊断面板是 Folder SKILL 可观测性的最后一环。第三方 SKILL 出现字段不兼容、脚本失败、预算阻断时，用户不再只能看到一句笼统错误，而是能看到状态、诊断码、磁盘加载方式、API 预算和请求概览。本阶段证明该面板在设置页真实执行路径中可用，且降级语义与执行器一致。

## 验证证据

### 回归命令

- `npm run type-check`：通过，无输出错误。
- `npm run test:services`：13 个测试文件、138 个测试全部通过。
- `npm run build:vue`：主构建与 providerProtocols 构建均成功。

### 构建产物核验

`dist-renderer/assets/index-DwfjDS8m.js` 包含以下特征：

- `real-skill-diagnostics`
- `文件夹技能执行诊断`
- `复制诊断`
- `hook-field-ignored`

`SkillSettings-C4hgTu-L.js` 不包含上述特征是分包策略的正常结果：新版诊断组件已被静态打进主 chunk，不能以“独立 chunk 缺特征词”反推产物过期。

### 源 Electron 真实 UI 验证

验证载体：仓库内 `node_modules/electron/dist/electron.exe . --remote-debugging-port=9227`，页面 `file:///D:/codex/novel-workshop-vue3/dist-renderer/index.html`。

真实操作结果：

1. 点击设置按钮打开设置弹窗。
2. 点击技能标签页，异步组件正常渲染，未再出现 `nextSibling` 崩溃。
3. 通过 `skillLoadFolder` 加载测试 Folder SKILL 并写入 store，卡片显示“路径有效”。
4. 点击该技能卡片的“测试”按钮，`技能测试: 诊断面板验证技能` 弹窗打开。
5. 点击“运行测试”，断言结果：
   - `.real-skill-diagnostics` 存在。
   - 状态 class 为 `real-skill-diagnostics is-degraded`。
   - 状态文本为 `降级完成`。
   - 磁盘加载显示 `使用缓存`。
   - API 预算显示 `1/3`。
   - 诊断码为 `hook-field-ignored`。
   - 请求概览可展开。
   - 受控 mock 返回：`受控验证返回：诊断面板应展示为降级完成。`

## 根因记录

上一轮把 `SkillSettings-C4hgTu-L.js` 内没有新版诊断特征词判断为“构建产物落后”。本轮重建后该文件名与内容哈希未变，进一步核验发现新版 `RealSkillDiagnosticsPanel` 已被静态打进主 chunk；旧判断的真正问题是源 Electron 进程仍持有重建前已卸载的旧页面。重启源 Electron 后异步组件加载正常。

## 收尾

- 从 skill store 移除测试技能 `folder-diagnostic-panel-check`，确认 `_data/wa_skills.json` 不再包含该 ID 和名称。
- 停止 mock 供应商服务（node PID 38624）。
- 结束源 Electron 进程。
- 删除 `_audit/tmp/diagnostic-panel-skill/`。
- 删除 `_audit/tmp/run-diag-panel-ui-check.cjs`。
- 删除 `_audit/tmp/diag-panel-mock-server.cjs` 及其日志。
- 删除 `_audit/tmp/diagnostic-providers-backup.json`。
- `_data/wa_providers.json` 与清理前备份逐字节一致。

## 遗留边界

- 本轮只验证设置页技能测试入口的 degraded 路径；Phase 7 矩阵中的文本 SKILL、批量导入、chain/compose、主页共创、大纲工作台等场景此前已由各阶段日志单独验证，本轮未重复全量执行。
- 按用户指令，不升级版本号、不封装。
