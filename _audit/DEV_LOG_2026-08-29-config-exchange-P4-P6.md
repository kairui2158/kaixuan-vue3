# Agent/Skill Markdown 导入底座 P4-P6

日期：2026-08-29

## P4/P5 客户路径核销

客户在生产 Electron 设置页完成真实操作并反馈：

- 点击导入并选择真实 `.md` 文件。
- 页面出现导入预览，并识别为标准协议 Markdown。
- 确认导入成功。
- 关闭应用后重新启动，已导入内容仍然存在。
- 再次导入同一 Markdown，并选择覆盖，覆盖行为正常。

这组证据核销了此前缺失的客户路径：文件选择、预览、确认导入、持久化、重启恢复和明确覆盖。该证据来自客户真实操作，不伪装成自动化命令输出。

## P6 最终回归

- `npx vitest run`：12 个测试文件通过，99 个测试通过。
- `npm run type-check`：exit 0，无类型错误。
- `npm run build:vue`：exit 0，189 modules transformed，生成生产 `dist-renderer`。
- 构建保留已知 warning：Vite `INEFFECTIVE_DYNAMIC_IMPORT` 和单 chunk 超过 500 kB；不影响本次导入功能，但应作为性能技术债记录。
- 设置页解析、诊断、来源追踪、未知字段、冲突计划、取消清理由现有服务/组件测试覆盖。

## 结论

P0-P6 均已核销。Markdown 导入的标准协议识别、普通/半标准兼容解析、预览、默认跳过、明确覆盖、store 持久化和重启恢复具备代码与测试证据；生产 Electron 客户路径由客户实测核销。

仍不扩大结论：复杂第三方 YAML 的全部高级字段是否都能按其原语义消费，需按具体文件继续补充兼容映射；这不阻塞本次已核销的导入闭环。

## P6 生产启动补充

- [x] `taskkill /f /im electron.exe` 后使用 `start-electron.bat` 启动。
- [x] 启动输出确认 Electron、`dist-renderer` 和应用启动成功。
- [x] CDP `9227` 可连接；页面为生产 `file:///D:/codex/novel-workshop-vue3/dist-renderer/index.html`，标题为“神意助手”。
- [x] Playwright 通过 `connectOverCDP` 读取到 `domNodes: 389`、`electronAPI: true`，DOM 非空。
- [x] 本轮临时 CDP 脚本、截图和中间文件已清理，不作为项目交付物保留。

脚本经验：当前环境没有 `bash`，不能直接调用 Unix 包装器；项目存在 Playwright 依赖时使用 `chromium.connectOverCDP`。临时 CommonJS 脚本中 `require` 后必须加分号，且不能依赖未声明的 `ws` 包。

## 脚本失败复盘与可复用规程

| 失败现象 | 直接根因 | 本轮修正 | 后续固定规则 |
| --- | --- | --- | --- |
| `bash is not recognized` | Windows 当前 shell 没有 bash | 放弃 Unix 包装器，改用项目 Playwright | 先检查 shell；Windows 使用 `cmd.exe` 命令或 Node 验证文件 |
| `Cannot find module 'ws'` | 临时脚本依赖未安装 | 改用已存在的 `playwright` 包连接 CDP | 脚本写作前先查 `package.json`/`node_modules` |
| `require(...) is not a function` | `require` 后紧接 IIFE，缺少分号 | 增加分号并重跑 | 所有 CommonJS 临时脚本的 require 行显式加分号 |
| `tasklist /fi` 解析失败 | cmd 封装层对过滤参数处理不一致 | 以启动日志、CDP 和无过滤进程输出交叉核对 | 不用单条过滤命令作为 Electron 状态唯一证据 |
| 中文 `findstr` 定位失败 | 控制台编码/特殊字符解析 | 改用 ASCII 锚点和直接文件读取 | 中文文件定位优先 `rg`，不能把 findstr 失败当文件不存在 |

### 后续脚本执行检查表

- [ ] 目标、输入文件、输出证据路径已写在脚本开头。
- [ ] 运行时和依赖已实际探测，不依赖未确认的全局模块。
- [ ] 复杂 CDP 逻辑使用一次性 `.cjs`/`.mjs`，不使用长 `node -e`。
- [ ] 脚本只负责一个阶段；启动、操作、持久化、清理不混在一个黑盒里。
- [ ] 每个关键动作都有原始输出，失败时打印错误类型和发生阶段。
- [ ] CDP 连接已有 Electron 使用 `browser.disconnect()`。
- [ ] 原生文件选择器另行记录窗口状态和网页回调，不能用 filechooser 替代。
- [ ] 运行后删除本轮脚本、截图、fixture 和中间文件，并用目录命令复核为空。
- [ ] 最终报告区分“脚本失败”“验证载体阻断”“应用功能失败”和“客户实测通过”。

本轮第一次 CDP 临时脚本因 `ws` 不存在、第二次因缺少分号失败，均已改用项目 Playwright 重跑成功；这些是脚本载体问题，不是 Markdown 导入功能失败。经验已同步到根目录 `EXPERIENCE.md`，以后遇到同类任务必须先按上述检查表执行。

## 客户封装

- [x] 执行 `taskkill /f /im electron.exe` 后运行 `npm run build`。
- [x] Vite 生产构建成功，Electron Builder 完成 Windows x64 NSIS 封装。
- [x] 客户安装包：`dist/神意助手-Setup-3.3.1.exe`。
- [x] 安装包大小：`93013782` bytes。
- [x] SHA-256：`aeca0972e0728c0b76dfd9737ad2f3d7cb98c4471e28d9edb7e41ecd224d1709`。
- [x] 对应 blockmap：`dist/神意助手-Setup-3.3.1.exe.blockmap`。
- [ ] 代码签名：未配置证书，Electron Builder 明确记录 signing skipped；客户首次运行可能显示 Windows SmartScreen 提示。

封装命令中的已知非阻断 warning：Vite `INEFFECTIVE_DYNAMIC_IMPORT`、单 chunk 超过 500 kB；Electron Builder 无封装错误。安装包已生成，可交客户实操导入 Markdown、重启恢复和覆盖路径。
