const fs = require('fs')
const path = require('path')
const root = 'D:/codex/novel-workshop-vue3'

const experience = [
  '',
  '### P2 大纲文件导入闭环（2026-08-18 追加）',
  '',
  '| # | 错误/风险 | 根因 | 改正措施 | 避免再犯 |',
  '|---|---|---|---|---|',
  '| P2-1 | 只通过文件控件注入验证导入，未点击用户入口 | 只能证明解析函数可用，不能证明按钮可见、可用和入口连通 | 先检查按钮 DOM/尺寸/可用状态，再点击导入按钮后设置文件并检查编辑器、存储 | 文件导入必须覆盖“按钮→文件控件→解析→编辑器→项目存储”完整链路 |',
  '| P2-2 | 只测 TXT 就判定导入功能完成 | 客户反馈涉及文件类型，单一格式不能代表整个入口 | 同一真实入口覆盖 TXT、MD、RTF、DOCX，并检查 accept 和文案 | 任何文件类型反馈都必须按格式逐项验证，不能用一个格式外推 |',
  '| P2-3 | 验证器异常退出时可能留下导入内容 | 快照恢复只放在正常路径，异常路径没有 finally 清理 | 保存完整 storage 快照，并在 finally 中按键删除新增数据、恢复原数据；重载后再次确认无残留 | 所有写入存储的验证器必须有异常清理和重载复核 |',
  '',
  '**P2 行为验证证据**:',
  '1. 源文件启动器：start-electron.bat；CDP：127.0.0.1:9227。',
  '2. 证据报告：_audit/P2_outline_import_verify.json，16/16 PASS。',
  '3. 覆盖：大纲工作台打开、导入按钮可见可用、accept 约束、TXT/MD/RTF/DOCX 点击导入、编辑器更新、项目存储写入、重载后无验证残留。',
  '4. 截图：_audit/P2_outline_import_verify.png。',
  '5. 临时数据在验证器 finally 中恢复；未修改生产项目内容。',
  ''
].join('\\n')

const log = [
  '',
  '### P2 大纲文件导入闭环（2026-08-18）',
  '',
  '#### 客户问题',
  '',
  '客户反馈导入按钮无亮度、只能导入 TXT。检查后发现当前 Vue3 运行包的入口已声明 TXT/MD/RTF/DOCX，不能只凭按钮文案断言完成，必须实际走文件入口验证。',
  '',
  '#### 执行与验证',
  '',
  '1. 使用 taskkill /F /IM electron.exe 清理旧 Electron 进程，使用 start-electron.bat 启动源文件应用。',
  '2. CDP 真实打开大纲工作台，读取导入按钮 display、visibility、opacity、尺寸和 disabled 状态。',
  '3. 点击“从文件导入”后分别导入 TXT、MD、RTF、DOCX 样本。',
  '4. 检查编辑器文本特征、项目 storage 中 outlineText 完全一致，并在重载后确认没有测试残留。',
  '',
  '#### 结果',
  '',
  '- `_audit/P2_outline_import_verify.json`：16/16 PASS。',
  '- `_audit/P2_outline_import_verify.png`：运行界面截图证据。',
  '- TXT、MD、RTF、DOCX 均能经用户导入入口进入编辑器并写入项目存储。',
  '- 本轮未发现需要修改业务源码的 P2 缺陷；P2 完成，进入 P3 前不提前合并其他阶段。',
  ''
].join('\\n')

fs.appendFileSync(path.join(root, '_audit', '神意开发经验总结.md'), experience, 'utf8')
fs.appendFileSync(path.join(root, '_audit', 'DEV_LOG_2026-08-18.md'), log, 'utf8')
console.log('P2 documentation appended')
