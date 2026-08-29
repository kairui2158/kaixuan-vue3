# 目标续验记录（2026-08-26，第二轮）

## 目标范围

沿用现有 active 目标，未重建目标、未回滚已核销项目。仅处理剩余 P2/P4 外部行为边界，并完成本轮收尾。

## 本轮新鲜证据

- `npm run test:services`：`Test Files 2 passed (2)`，`Tests 44 passed (44)`。
- `npm run type-check`：退出码 `0`，无错误输出。
- `npm run build:vue`：`176 modules transformed`，`built in 1.56s`；保留 Vite native config、动态导入和 chunk size 警告。
- `start-electron.bat`：输出 `[OK] Electron found`、`[OK] dist-renderer found`、`[OK] Application started`；随后独立核对取得源文件 Electron 进程路径 `D:\\codex\\novel-workshop-vue3\\node_modules\\electron\\dist\\electron.exe`、`127.0.0.1:9227 LISTENING`，CDP 页面标题为“神意助手”，URL 为 `file:///D:/codex/novel-workshop-vue3/dist-renderer/index.html`。
- 设置页递归入口仍可达：`#btn-settings` → `#tab-api` → 首个供应商编辑；`#btn-fetch-models` 为 `count=1, visible=true, disabled=false`，测试连接按钮为 `count=1, visible=true`。本轮未点击真实网络按钮，避免无供应商条件下制造结果。
- 收尾命令：`taskkill /f /im electron.exe`，4 个源文件 Electron 进程均返回 `SUCCESS`。

## 外部边界结论

- P2 项目导入/合并/关闭重启恢复：`UNVERIFIED`。数据目录虽存在历史 `wa_project_*.json`，但没有本轮客户身份明确的导入前后配对快照，不能用历史文件推断客户恢复通过；未修改历史文件。
- P4 去 AI 味断网/HTTP/取消/重试/断点：`UNVERIFIED`。服务层错误分类和取消副作用已有定向测试，但本轮没有真实供应商在途请求，不能扩大为供应商运行时行为通过。

## 临时载体与工作区

- 本轮未新增临时探针、未写入项目数据、未触发原生文件选择器。
- 收尾后应复核 `_audit/tmp*`、Electron 进程和 `9227` 端口；不清理用户数据目录及他人/历史文件。

## 下一步前置条件

1. P2 需要客户提供可识别的项目 JSON 或由客户在界面完成一次导入，并保留导入前/后快照与重启后的读取结果。
2. P4 需要可控的真实供应商在途请求或客户现场复现，以取得失败位置、重试次数、断点起点和成功清理四段证据。

## 本轮续验（2026-08-26）

- `npm run test:services`：`Test Files 2 passed (2)`、`Tests 44 passed (44)`；Vite native config warning 原样保留。
- `npm run type-check`：退出码 0，无错误输出。
- `npm run build:vue`：`176 modules transformed`、`built in 3.95s`；仍有 native config、2 条 ineffective dynamic import、chunk 大于 500 kB、plugin timings 警告。
- 收尾环境核对：`audit_cjs=0`、`tmp_dirs=0`、`electron=0`、`port9227=0`。
- 本轮尝试使用 `start-electron.bat` 时，批处理异步启动未取得 Electron 进程或 9227 监听；随后一次 `cmd` 重定向调用被命令载体解析为“不是内部或外部命令”。这证明本轮启动载体未核销，不证明 P2/P4 业务失败；根据启动器重复失败规则停止继续触发。
- 当前数据目录仍有 3 个历史 `wa_project_*.json`，无客户身份明确的导入前后配对快照；未读取后改写、未删除、未注入测试项目。

## 本轮结论

- P2 项目导入/合并/落盘/关闭重启恢复：`UNVERIFIED`，等待客户样本或客户现场完成一次可配对导入。
- P4 去 AI 味真实断网/HTTP/在途取消/重试/断点续跑：`UNVERIFIED`，等待真实在途请求或客户现场复现。
- 服务测试、类型检查、构建均为工程门证据，不能替代上述两个真实行为门。

## 客户实操反馈项（交付标记）

- [ ] P2 客户实操反馈：请使用客户自己的项目 JSON 走“导入（合并）→核对差异→保存→关闭应用→重新打开”流程，回传导入前后文件、项目名称/记忆数量变化和重启恢复结果。
- [ ] P4 客户实操反馈：请使用真实供应商进行一次可观察的断网或 HTTP 失败/取消场景，回传失败步骤、重试次数、断点提示、继续起点以及成功后断点是否清除。
- 以上两项属于客户现场行为核销，不是代码缺失声明；客户反馈前保持 `UNVERIFIED`，不得改写为 PASS。

## 客户封装交付（2026-08-26）

- 封装命令：`npx electron-builder --win --config.directories.output=dist-client-3.2.1`
- 客户安装包：`D:\\codex\\novel-workshop-vue3\\dist-client-3.2.1\\神意助手-Setup-3.2.1.exe`
- 安装包大小：`90,965,890` bytes。
- SHA-256：`B5B42584E36304A4F621CCCD06854FB921DA3DC808B58C3A4E5740A7D77C5971`。
- 解包目录存在：`dist-client-3.2.1\\win-unpacked\\resources\\app.asar = True`。
- 封装过程警告：未配置代码签名证书，签名步骤跳过；不影响本地安装包生成，但客户系统可能显示未签名提示。
- 交付后环境：`electron=0`、产品进程 `0`、`port9227=0`、`tmp_dirs=0`。

### 客户实操反馈入口

1. P2：客户使用自己的项目 JSON 执行导入（合并）→核对差异→保存→关闭应用→重新打开，反馈项目名称、记忆数量和内容是否恢复。
2. P4：客户使用真实供应商执行一次失败/取消/重试场景，反馈失败步骤、重试次数、断点续跑起点及成功后断点清理结果。

本次交付不把 P2/P4 的客户实操结果预先标为通过。
