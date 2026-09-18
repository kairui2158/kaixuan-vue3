# DEV LOG 2026-09-15 3.49.0 封装

> 任务名：状态审计 V2 补完交付
> 前置：3.48.0 内已修复等待确认误恢复与 Naming partial trace 事件失效
> 版本：3.48.0 → 3.49.0
> 状态：安装包已生成并完成封装级验证

## 交付内容

1. 等待用户确认恢复改为一次性登记：只有真实进入等待态的 run 才会在下一轮写入“等待用户确认已恢复”，普通连续对话不再制造虚假状态事件。
2. AI 命名部分有效结果（NamingStatus.partial）在关闭 run 前写入 `state-transition` 事件，SKILL 调试可见组件词汇与 runTrace 存储口径的映射证据。
3. 3.49.0 安装包交付客户实操。

## 封装验证

| 门 | 结果 |
|---|---|
| 版本号 | `package.json` / `package-lock.json` / asar 内 `package.json` 均为 3.49.0 |
| 构建产物 | `dist/神意助手-Setup-3.49.0.exe`，129,832,036 bytes |
| SHA256 | `874CE8773EC0A316FF68F40872ECA137C3982EED9CF937051428B288243EEA00` |
| NSIS 配置 | `oneClick: false`、`allowToChangeInstallationDirectory: true`、`include: build/installer.nsh` 完整保留 |
| 测试 | 69 files / 594 tests passed |
| 类型检查 | `npx vue-tsc --noEmit` 0 error |

## 客户复验重点

1. 安装 3.49.0 后，在大纲工作台连续普通对话，运行记录中不应出现“等待用户确认已恢复”；只有真实等待确认后的下一轮才出现。
2. AI 命名生成部分有效结果时，展开运行记录时间线应能看到 `NamingStatus：partial → RunTraceStatus degraded` 事件。
3. 安装器仍可选择自定义安装目录，并创建“神意助手”快捷方式。
