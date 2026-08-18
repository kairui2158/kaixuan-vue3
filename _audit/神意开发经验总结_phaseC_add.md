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
