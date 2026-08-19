# P0 — 客户反馈对账表（重建，2026-08-19）

启用时间：2026-08-19
状态：13 项全部登记，按 P1→P12 顺序逐项亲自执行验证
规则引用：
- J15 原生对话框阻塞验证 → 原生窗口需 CDP 句柄 + 控件识别 + 截图三类证据
- J16 构建警告逐条审计
- J17 复用旧脚本前必须核对当前选择器与 store 字段
- J18 真实 API 与受控响应证据必须分开标注
- C1 修复必须闭环：store → UI → DOM → 持久化 → 下游
- C2 构建 → 杀进程 → 重启 → 验证，缺一不可
- C3 旧证据归零，本轮证据必须本轮产生
- C4 一次只修一个闭环，不批量改无关功能

Git：`538675e`（P5 提交，本周期从头验证不沿用结论）
构建：`npx vite build` 通过（151 modules，built in 1.38s）
启动器：`start-electron.bat`（CDP 9227）
数据目录：`%USERPROFILE%\Documents\神意助手数据`

---

| # | 问题 | 本周期现状 | 证据位置 | 结论 |
|---|------|-----------|---------|------|
| 1 | 项目管理无法全部删除，存在占位项目 | 本轮 CDP 实测通过：全删→空列表→新建→再删→重启无占位，无旧/新格式键残留 | `_audit/tmp/p1_verify_result.json` + `p1_*.png` | ✅ PASS |
| 2 | 大纲文件导入按钮无亮度、仅 TXT | 本轮 CDP 实测：按钮可见有亮度；TXT/MD/RTF/DOCX stored/DOCX deflate + 2 个真实 Word .docx 全部导入成功，编辑器/store/项目存储同步；.doc 中文拒绝 | `_audit/tmp/p2_verify_result.json` + `p2_*.png` | ✅ PASS |
| 3 | 大纲 AI 共创未连通 API | 本轮 CDP 实测：真实 API 200×2；回复 OK；复制/替换/插入/重生成全 PASS；Pinia outlineChat 与项目存储 outlineChat 均=2 且一致 | `_audit/tmp/p3_verify_result.json` + `p3_chat_reply.png` + `p3_chat_regenerate.png` + `p3_chat_final.png` | ✅ PASS |
| 4 | 锁定后跳转流水线大纲层+按钮重复 | 本轮 CDP 实测通过：锁定→自动跳转流水线大纲层；大纲层仅 1 个动作按钮 btn-pl-confirm-outline；填 66 万字后确认按钮解除禁用；确认后 currentStep=1、bookWordCountChars=660000、设定层显示 全书已确认字数：66 万字；项目存储 outlineLocked=true、bookWordCount=660000；测试项目已清理并恢复原数据 | _audit/tmp/p4_verify_result.json + p4_*.png | ✅ PASS |
| 5 | 设定层无 API 滚动/进度条 | 本轮 CDP 实测通过：点击 AI 设定生成后反馈面板即时可见，进度 10→100，API 日志 4 条完整，动态生成 12 个分类、33 个设定项，一键绑定到全局 isBound=true，确认/保存后 currentStep=2、settingsGenerated=true，项目存储 settingsCollection+settingsGenerated 完整；测试项目已清理并恢复原数据 | _audit/tmp/p5_verify_result.json + p5_*.png | ✅ PASS |
| 6 | 卷纲层无卷框内滚动 | 待实测 AI生成全卷/逐卷、卷框 API 日志与进度 | P6 验证结果 | 待验证 |
| 7 | 卷纲层无字数联动 | 待实测大纲字数→卷数自动分配 | P6 验证结果 | 待验证 |
| 8 | 卷框无保存/删除 | 待实测每卷锁定/删除及章节清理 | P6 验证结果 | 待验证 |
| 9 | 卷纲层按钮冗余 | 底部按钮当前为 AI生成全卷/逐卷生成/确认完成下一步，待实测行为 | P6 验证结果 | 待验证 |
| 10 | 章节层无生成时无章节框 | 待实测选中锁定卷+单章字数→章节数计算→生成→剧情点 | P7 验证结果 | 待验证 |
| 11 | 章节层字数→章节数联动 | 待实测章节数与章节树/存储同步 | P7 验证结果 | 待验证 |
| 12 | 正文层生成→编辑器 | 待实测生成→跳转主页编辑器→插入/保存/tab/章节树同步 | P8 验证结果 | 待验证 |
| 13 | SKILL 模式只留串行/并行 | 各层模式当前为 compose=并行、chain=串行，待确认执行语义并清废弃入口 | P9 验证结果 | 待验证 |

---

## 执行纪律

1. 顺序执行 P1→P2→P3→P4→P5→P6→P7→P8→P8.5→P9→P10→P11→P12。
2. 每阶段：读取源码与规则 → 画出闭环 → 先删旧规格再写唯一新规格 → 构建 → 杀进程 → start-electron.bat → CDP 真实操作 → DOM/store/持久化/下游检查 → 截图+日志 → 更新对账表/经验/DEV_LOG → Git 提交推送。
3. 任何“完成”必须有本轮命令输出、截图、store/DOM/存储证据；缺证据不写完成。
4. 每阶段最多连续两次同类失败，之后停止该路径并更换工具或实现方式。
5. 临时项目验证脚本必须在 finally 中清理测试项目并恢复原项目。
