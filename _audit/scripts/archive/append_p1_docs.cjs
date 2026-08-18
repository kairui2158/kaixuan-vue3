const fs = require('fs')
const path = require('path')
const root = 'D:/codex/novel-workshop-vue3'

const experience = [
  '',
  '### P1 项目管理彻底删除闭环（2026-08-18 追加）',
  '',
  '| # | 错误/风险 | 根因 | 改正措施 | 避免再犯 |',
  '|---|---|---|---|---|',
  '| P1-1 | 只验证项目列表消失，就把“删除成功”当作完成 | 列表是局部 UI 证据，不能证明存储、当前状态和重载恢复都已清理 | 递进验证删除双格式存储键、列表即时移除、当前项目状态、章节树残留、重载后项目不复活 | 项目删除闭环必须覆盖“存储→store→章节树→重载”四层，不得只检查一行列表 |',
  '| P1-2 | 验证器把“删除最后一个临时项目”误写成“全局必须没有项目” | 测试夹具没有区分临时项目和用户原有项目，容易把真实项目误判成残留 | 断言只针对临时项目 ID；同时记录真实项目键数量，并验证 P1 临时项目不再出现 | 所有破坏性测试必须按测试 ID 精确断言，不能用全局数量替代对象级断言 |',
  '| P1-3 | 未验证重启后状态，无法排除 lastProjectId 复活路径 | 删除内存状态和持久化状态是两条路径 | 删除后清理项目指针，reload 后再次读取 storage、Pinia 和项目列表 | 涉及持久化的删除、切换、新建都必须增加 reload/restart 后复核 |',
  '',
  '**P1 行为验证证据**:',
  '1. 源文件启动器：start-electron.bat；CDP：127.0.0.1:9227。',
  '2. 证据报告：_audit/P1_project_delete_verify.json，8/8 PASS。',
  '3. 覆盖：同一项目新旧键去重；删除同时清理 wa_project_<id> 与 wa_project-<id>；列表即时移除；删除当前项目后 currentProjectId/projectName/outlineText 清空；章节树无残留；重载后 lastProjectId、当前项目和临时项目列表均不复活。',
  '4. 截图：_audit/P1_project_delete_verify.png。',
  '5. 临时项目只使用 p1_verify_* ID，验证结束后在 finally 中恢复原存储快照。',
  ''
].join('\n')

const log = [
  '',
  '### P1 项目管理彻底删除闭环（2026-08-18）',
  '',
  '#### 目标',
  '',
  '解决客户反馈“项目管理无法全部删除、存在项目占位无法删除”，并验证删除行为不是只停留在列表 UI。',
  '',
  '#### 验证顺序',
  '',
  '1. 使用 taskkill /F /IM electron.exe 清理旧进程。',
  '2. 使用源文件启动器 start-electron.bat 启动，确认 CDP 9227 监听。',
  '3. 通过项目管理真实界面加载临时项目列表，验证新旧存储键合并后同一项目只出现一条。',
  '4. 点击临时项目“删除”，确认弹窗后检查新键、旧键和列表。',
  '5. 删除当前临时项目，检查 Pinia 当前项目状态、章节树和流水线状态。',
  '6. reload 后重新检查 lastProjectId、项目存储键、当前项目和项目管理列表，确认不存在复活。',
  '',
  '#### 结果',
  '',
  '- 证据：_audit/P1_project_delete_verify.json，8/8 PASS。',
  '- 截图：_audit/P1_project_delete_verify.png。',
  '- 通过项：双键去重、双键清理、列表即时移除、项目指针清理、当前状态清空、章节树无残留、重载不复活、列表不显示已删除临时项目。',
  '- 真实用户项目未被删除；测试使用 p1_verify_* 临时 ID，并在验证器 finally 中恢复快照。',
  '- P1 完成；P2 及后续阶段尚未开始，不将其写成完成。',
  ''
].join('\n')

fs.appendFileSync(path.join(root, '_audit', '神意开发经验总结.md'), experience, 'utf8')
fs.appendFileSync(path.join(root, '_audit', 'DEV_LOG_2026-08-18.md'), log, 'utf8')
console.log('P1 documentation appended')
