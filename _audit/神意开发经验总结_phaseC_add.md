### 错误类型 H：Phase C 新增

| # | 错误操作 | 根因 | 改正措施 | 避免再犯 |
|---|---------|------|---------|---------|
| H1 | 验证脚本未切换到技能标签页就查找编辑按钮 | 认为设置弹窗打开后默认显示技能标签页，实际默认是 API 标签页 | 在打开设置后增加 `#tab-skill` 点击，切换到技能标签页 | 所有验证脚本必须模拟真实用户操作路径，不能跳步 |
| H2 | 保存按钮选择器用通用选择器失效 | 认为 `.sf-edit-form .btn-primary` 能匹配到所有保存按钮，实际模板中没有 `sf-edit-form` 类 | 改用精确的 `#btn-save-skill` ID 选择器 | 表单中的按钮优先用 ID 选择器，不用通用 class 选择器 |
| H3 | 关闭按钮选择器用 `.modal-close` 失效 | 多个弹窗共用 `.modal-close` 类，但 SettingsModal 的关闭按钮 ID 是 `#btn-close-settings` | 改用 `#btn-close-settings` | 弹窗关闭按钮用唯一 ID，不用通用类名 |

## 错误快照追加（Phase C）

| 日期 | 错误 | 影响 | 修复方式 |
|------|------|------|---------|
| 08-17 | 验证脚本未切换到技能标签页 | 4 项 Phase C 验证失败（自定义变量UI/持久化） | 增加 `#tab-skill` 点击导航 |
| 08-17 | 保存按钮选择器不匹配 | 无法保存自定义变量，持久化验证失败 | 改为 `#btn-save-skill` ID 选择器 |

### 错误类型 I：P10-P12 验证阶段新增

| # | 错误操作 | 根因 | 改正措施 | 避免再犯 |
|---|---------|------|---------|---------|
| I1 | 验证脚本选择器使用错误ID | 假设的ID（如#btn-project、#btn-outline）与实际DOM（#btn-open-project、#btn-outline-workspace）不匹配 | 先运行诊断脚本获取实际DOM ID列表，再写验证脚本 | 验证脚本前必须先用诊断脚本扫描所有ID，确认选择器正确 |
| I2 | 流水线面板在DOM中但offsetParent为null导致click()失效 | 面板使用absolute定位，offsetParent为null | 使用page.evaluate触发click或force:true | 对overlay类面板，使用evaluate触发点击而非Playwright click |
| I3 | 未检查pipeline-panel的实际class和样式就断言其不存在 | 只检查了querySelector，没检查display/visibility/zIndex | 增加getComputedStyle检查 | 面板存在性验证必须同时检查：DOM存在、display、visibility、zIndex |
| I4 | 报告生成滞后于验证执行 | 验证结果在内存中，未及时写入文件 | 验证完成后立即写入报告JSON | 每个验证阶段完成后立即生成报告文件，不等到最后 |

### 错误快照追加（P10-P12）

| 日期 | 错误 | 影响 | 修复方式 |
|------|------|------|---------|
| 08-19 | 验证脚本选择器使用#btn-project而非#btn-open-project | 项目按钮点击失败 | 修正为#btn-open-project |
| 08-19 | 未检查pipeline-panel的computed style | 误判流水线不存在 | 增加getComputedStyle检查，确认display:flex,visibility:visible |
| 08-19 | 验证脚本超时（120s） | 全链路验证被中断 | 增加3s超时限制，失败时继续下一项 |

### 错误类型 J：脚本态 Promise 与启动器生命周期

| # | 错误操作 | 根因 | 改正措施 | 避免再犯 |
|---|---------|------|---------|---------|
| J1 | `page.evaluate` 里直接引用 `window.electronAPI.storageRead(...)` 后把返回值拼进键名 | Electron bridge 返回 Promise，脚本没有 `await`，实际键名变成 `[object Promise]` | evaluate 内统一声明 `async`，所有 bridge 调用都 `await`；断言必须同时核对应用状态与数据内容 | 写脚本前先识别每个 API 的返回类型；持久化断言必须读真实业务字段，不能只看脚本不报错 |
| J2 | 用 Ctrl+C 结束 `start-electron.bat` 会话 | 启动器 PTY 会话和 Electron 进程树存在父子关系，结束会话会把 Electron 连带带走 | 启动器用管道 stdin 执行后让它自然退出；验证脚本只主动 `process.exit(0)`；杀应用单独执行进程清理 | 启动器会话不是普通可随意中断的命令；每次切换会话前先确认 Electron/CDP 仍存活 |
| J3 | 选择器歧义导致下拉命中错误控件 | `#pl-step-4-content select` 会同时匹配智能体和卷下拉 | 关键业务下拉补稳定业务 id，如 `#pl-ch-volume-select` | 复杂步骤面板内的同名控件优先补唯一 ID，再写验证选择器 |
