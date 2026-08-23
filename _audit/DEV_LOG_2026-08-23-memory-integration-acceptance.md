# 记忆板块整合验收日志（2026-08-23）

## 实际验证

- 使用 `start-electron.bat` 启动源文件 Electron，页面为 `file:///D:/codex/novel-workshop-vue3/dist-renderer/index.html`。
- 加载项目 `P7-8隔离验证`，从章节树打开 `林舟在雨夜发现一枚旧钥匙。`。
- 编辑器真实增加“记忆验收标记”，点击保存后正文保持，提取记忆按钮可用。
- 真实点击提取记忆，出现记忆变更预览，返回 6 条实体/世界观变更；确认写入后预览关闭。
- 记忆面板显示林舟、旧钥匙、北辰纹章、旧钟楼及两条世界观。
- JSON `C:\Users\凯瑞\Documents\神意助手数据\wa_project_p1787414333932.json` 核对：entities=4、world=2、extractionCount=3、pending=0；正文包含“记忆验收标记”。
- 真实取消预览后，预览关闭且正文仍为 45 字。
- 杀 Electron 后用 `start-electron.bat` 重启，重新加载同一项目，正文恢复。

## 状态

- 主成功链路：PASS
- 记忆面板同步：PASS
- JSON 目标/非目标字段本轮核对：PASS
- 取消预览：PASS
- 逐条拒绝/锁定：UNVERIFIED，本轮重复抽取没有产生可审核变更项
- 断网/超时/非法 JSON：UNVERIFIED，本轮未执行网络破坏模拟
- 重启恢复：PASS

## 本轮追加验收（同日续测）

- 超时修复复测：PASS。源文件 Electron 页面真实点击“提取记忆”，约 40 秒后出现 7 条变更预览，无错误提示；正文保存长度为 74 字。
- 逐条拒绝：PASS。第一条真实从“拒绝”切换为“恢复”，确认写入后预览关闭；被拒条目未作为本次变更写入，其他条目仍可进入合并流程。
- 字段锁定保护：PASS。对“雾松台”点击“锁定”后确认写入，项目 JSON 中该实体存在 `lockedFields: ["description","status","notes"]`。
- 空正文异常路径：PASS。清空编辑器后“提取记忆”按钮处于 disabled；脚本中止未改变应用数据，随后恢复正文并保存，正文长度为 79 字，提取按钮恢复可用。
- 项目 JSON 差异核对：PASS。`wa_project_p1787414333932.json` 仍保留 `bookWordCount/chapters/volumes/settings/outlineChat` 等业务字段；记忆结构包含 `categories/entities/events/foreshadowing/history/items/meta/relations/version/world`；本轮检查 `volumes=1`、`settings=0`、`outlineChat=0`，未发现这些非记忆字段被覆盖。
- 非法 JSON：UNVERIFIED。本轮未伪造供应商响应，也未能让真实供应商稳定返回非法 JSON。
- 断网/强制超时：UNVERIFIED。供应商错误注入未执行；应用代码已有错误提示和 loading 收束路径，但不能以代码存在代替真实回归证据。
- 构建：`npm run build:vue` PASS，输出 `175 modules transformed`、`built in 3.01s`。`npm run type-check` 仍被仓库既有全局 `electronAPI` 类型声明及其他既有类型错误阻断，未归因于本轮两处记忆超时改动。
- 构建后重启：BLOCKED。按要求杀进程后，`start-electron.bat`/直接 Electron 启动在当前执行环境被 `cmd` 输入重定向限制拦截，新的 `9227` CDP 未恢复；未将其标记为应用功能通过。

## 重启阻断复核

- 根因：直接调用 Electron 时将应用路径和 CDP 参数混用，且 `start-electron.bat` 内部含 `pause`，嵌套 `cmd` 调用受到当前执行环境输入重定向限制；这不是记忆业务代码故障。
- 修正载体：使用项目本地 `npx electron --remote-debugging-port=9227 --remote-allow-origins=* --no-sandbox --disable-gpu .` 启动源文件 Electron。
- 新鲜证据：终端输出 `DevTools listening on ws://127.0.0.1:9227/devtools/browser/...`；`/json` 返回 `title=神意助手`、`url=file:///D:/codex/novel-workshop-vue3/dist-renderer/index.html`。
- 重启后真实页面核验：CDP 读取到 `#editor-content` 和 `#btn-extract-memory`；项目按钮可打开，项目列表显示 `P7-8隔离验证`，重新加载后章节树显示“林舟在雨夜发现一枚旧钥匙。”。
- 结论修正：此前的 `BLOCKED` 只适用于失败的启动载体；源文件 Electron 的重启与页面恢复已重新取得证据。非法 JSON 仍为 `UNVERIFIED`。

## 异常路径收尾复测（同日）

- 根因定位：`AiServiceError(kind=json)` 在 `callAi` 中先落入通用网络错误分支，随后又进入 3 次心跳恢复，因此非法 JSON 的 loading 长时间不收束。
- 最小修复：`src/services/aiService.ts` 对 `kind=json` 立即终止重试循环，并跳过 heartbeat；网络/超时错误仍保留原有重试与断点恢复。
- 构建：`npm run build:vue`，输出 `175 modules transformed`、`built in 805ms`。
- 源文件 Electron 重启：先 `taskkill /F /IM electron.exe /T`，再通过 `npx electron --remote-debugging-port=9227 ... .` 启动，CDP 端口 9227 可连接。
- 非法 JSON 真实 UI：从 `#tree-body` 点击章节，再点击 `#btn-extract-memory`；受控响应为非法 JSON，请求命中 4 次（抽取两次尝试，每次含一次 JSON 修复请求）；3 秒内 `loading=0`，`.editor-memory-error` 为“记忆抽取失败：JSON 解析失败，已重试一次仍无法解析。正文已保存。”，预览无记忆条目，正文保留。
- 网络失败真实 UI：受控请求 `route.abort('failed')`，真实点击提取；请求命中 2 次，按钮在请求中 disabled，点击“取消”后预览 DOM 消失，编辑器正文长度为 64，正文未丢失。
- 项目 JSON 差异复核：`C:/Users/凯瑞/Documents/神意助手数据/wa_project_p1787414333932.json` 读取到 `volumes=1`、`settings=0`、`outlineChat=0`、`entities=11`、`world=2`、`pending=null`；非法 JSON 与网络失败均未新增记忆。
- 本轮结论：异常路径回归 PASS；项目 JSON 差异核对 PASS。截图未保留，遵循本次任务临时证据清理规则。

## 最后冲刺验收（2026-08-23）

- P3 源文件 Electron 全应用入口回归：PASS。真实 CDP 核验主页、项目入口、章节树、编辑器、右侧对话、记忆面板、生成流水线和仪表盘均可达；流水线关闭按钮真实关闭覆盖层，关闭后其他面板可打开。
- P3 边界：本轮未执行真实供应商生成请求，因此不把“入口可达”扩大写成完整生成链 PASS。
- P4 最新安装包构建：PASS。`npm run build` 输出 `175 modules transformed`，生成 `dist/神意助手-Setup-3.2.1.exe`，大小 `86,064,808` bytes，时间 `2026/8/23 08:04:22`。
- P4 安装版启动：PASS。启动 `dist/win-unpacked/神意助手.exe` 后取得 4 个神意助手进程；客户数据文件仍存在。
- P4 边界：安装版未开放 CDP，本轮没有把进程启动扩大为安装版 DOM 深度交互 PASS。
- P5：本轮提交范围只包含明确相关的 AIService 修复和正式经验/日志/报告，不混入历史未提交改动、旧构建资产或临时验证文件。
