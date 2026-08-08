# 小说工坊 — 多线程架构修复计划 V1

> 制定时间: 2026-07-22
> 目标: 用多线程/Agent并行架构修复 P0 问题，避免单线程上下文压缩导致的循环和失忆
> 核心原则: 文件边界隔离、行为验证、先删后改、不积累

---

## 一、为什么换架构

### 16天踩坑总结
- 单线程下上下文不断膨胀 -> 被压缩 -> 丢失关键记忆 -> 循环重复
- 美容成果因清零重写误删 style.css 全部丢失
- 反复声称修好了但用户验证不行，因为只验证代码不验证行为
- 474次提交中大量是修了又坏、坏了又修的循环

### 多线程解决什么
- 每个线程上下文独立、干净，不会被其他任务污染
- 文件边界隔离，多个Agent不抢同一个文件
- 主线程专注协调和集成验证，不被细节淹没

---

## 二、线程架构设计

```
主线程（当前对话，我负责）
  |
  +-- 协调与决策：拆任务、派Agent、收集结果、向你汇报
  +-- 集成验证：所有Agent完成后，我做端到端验证
  |
  +-- Agent-1 流水线医生
  |     文件范围: panels.js（只改这个文件）
  |     任务: 修复生成流水线完整链路
  |
  +-- Agent-2 CSS重建师
  |     文件范围: style.css + styles/**（只改这些文件）
  |     任务: 恢复美容+修复面板可见性规则
  |
  +-- Agent-3 绑定修复师
  |     文件范围: renderer_v2.js（只改这个文件）
  |     任务: 修复设定合集绑定+API下拉+模态框互斥
  |
  +-- Agent-4 验证裁判（只读不改）
        文件范围: 只写 test_evidence/ 和报告文件
        任务: 每个Agent完成后做行为验证+截图
```

### 文件边界（铁律：不可越界）

| Agent | 可写文件 | 不可触碰 |
|:---|:---|:---|
| Agent-1 流水线 | panels.js | renderer_v2.js, style.css |
| Agent-2 CSS | style.css, styles/tokens.css, styles/components/*.css | *.js, *.html |
| Agent-3 绑定 | renderer_v2.js | panels.js, style.css |
| Agent-4 验证 | test_evidence/**, 报告.md | 所有源码文件 |
| 主线程 | renderer.html（仅集成时） | 各Agent负责的文件 |

### 并发控制
- 同时最多 2 个Agent并行（避免429）
- 优先级: Agent-1 + Agent-3 并行 -> 完成后 Agent-2 -> 最后 Agent-4 验证

---

## 三、P0问题修复方案

### P0-1: UI美容崩塌
**负责人**: Agent-2
**根因**: style.css 清零重写时被误删，git恢复后美容成果全部丢失。当前5763行/1115个!important，优化巅峰时8026行/436个!important。
**方案**:
1. 先备份当前 style.css 到 BACKUP/
2. 扫描 style.css 中缺失的布局规则（#panel-backdrop display:none、面板hidden类、html/body reset）
3. 逐模块补回美容规则（按钮->表单->面板->模态框->编辑器）
4. 每补一个模块，CDP验证渲染效果
5. !important 从1115个逐步降到500以下
**验证**: CDP截图对比修复前后，elementFromPoint确认无遮挡
**预计工作量**: 最大，这是重建不是修补

### P0-2: 主界面被遮挡
**负责人**: Agent-2（与P0-1一起修）
**根因**: #panel-backdrop 缺少 display:none 默认规则，覆盖整个视口拦截点击
**方案**:
1. app-layout.css 中 #panel-backdrop 添加 display:none; pointer-events:none
2. .visible 类添加 :not(*-hidden) guard
3. CDP elementFromPoint 测试 11个坐标点，全部应返回目标元素而非 #panel-backdrop
**验证**: 11/11坐标点命中正确元素

### P0-3: 生成流水线断裂
**负责人**: Agent-1
**根因**: 卷纲手动添加按钮失效、章节无法确认保存、正文无法识别章节
**方案**:
1. 定位 _plRenderVolumeCards 中手动添加按钮的 onclick 绑定
2. 定位 _plRenderChapterCards 中确认/保存按钮逻辑
3. 定位 _plPopulateChapterSelect 中章节识别逻辑
4. 逐个修复，每个修复后用 node --check 验证语法
5. CDP行为验证: 点击添加卷纲->验证新卷出现->点击添加章节->验证章节出现->点击确认->验证正文步骤可选章节
**验证**: 完整走通 大纲->设定->卷纲(手动+AI)->章节(手动+AI)->正文选择->正文生成 全链路
**经验吸取**: ERR-032(持久化)、ERR-033(ChapterManager返回null)、ERR-034(空状态无添加按钮)

### P0-4: 设定合集绑定失效
**负责人**: Agent-3
**根因**: _toggleScBind 函数可能因CSS遮挡导致按钮点击被拦截，或函数本身逻辑有误
**方案**:
1. 先确认是CSS遮挡问题（等Agent-2修完P0-2后再测）
2. 如果排除遮挡后仍失效，检查 _toggleScBind 的数据读写链路
3. 确认 _saveScBindTargets -> _getProjectData -> _saveProjectData 链路完整
4. CDP行为验证: 点击绑定按钮->按钮文字从绑定变已绑定->检查IndexedDB中bindTargets更新
**验证**: 16个绑定按钮全部可点击，点击后状态切换+数据持久化+流水线同步
**经验吸取**: ERR-032(_scData vs _getProjectData不一致)、CDP测试残留模态框阻塞

### P0-5: API模型下拉失效
**负责人**: Agent-3
**根因**: provider-edit-view 默认 hidden，用户无法进入编辑界面
**方案**:
1. 在供应商列表每项旁增加编辑入口按钮
2. 点击编辑按钮->移除 provider-edit-view 的 modal-hidden 类
3. 确认 btn-fetch-models 可见可点击
4. 确认模型列表正确填充到下拉框
**验证**: 打开设置->看到供应商列表->点编辑->看到获取模型按钮->点击->模型下拉出现选项
**经验吸取**: V5-005(provider-edit-view无入口)、经验55(设置面板打不开是API失效根因)

---

## 四、P1问题修复方案（P0完成后）

### P1-1: 章节树与流水线联动
**负责人**: Agent-1
- 修复新旧卷纲共存问题（生成前清空旧数据）
- 修复次级面板按钮失效（同步 ChapterManager 数据）

### P1-2: 模态框互斥
**负责人**: Agent-3
- 打开新模态框时自动关闭其他模态框

### P1-3: 插件市场打开异常
**负责人**: Agent-3
- showPluginMarket() 统一为 remove(modal-hidden) + add(visible)

### P1-4: memory-panel 类冲突
**负责人**: Agent-2
- .visible 选择器加 :not(.mem-hidden) guard

---

## 五、验证策略（规则18: 行为验证三铁律）

### 每个Agent完成后的验证清单

| 验证项 | 方法 | 标准 |
|:---|:---|:---|
| 语法检查 | node --check | 0 error |
| CSS花括号平衡 | 脚本扫描 | 深度=0 |
| 面板可见性 | CDP getBoundingClientRect | 非0x0 |
| 点击无遮挡 | CDP elementFromPoint | 命中目标元素 |
| 功能行为 | CDP 实际点击+检查结果 | 操作->预期->实际一致 |
| 数据持久化 | CDP 查 IndexedDB | 写入数据可读回 |
| 截图证据 | CDP captureScreenshot | 保存到 test_evidence/ |

### 集成验证（主线程负责）
所有Agent完成后，主线程执行端到端验证:
1. 启动应用 -> 截图默认界面
2. 打开大纲工作台 -> 导入大纲 -> 确认锁定
3. 打开设定合集 -> 添加设定 -> 点击绑定 -> 验证已绑定
4. 打开生成流水线 -> 大纲确认 -> 设定 -> 卷纲(手动+AI) -> 章节 -> 正文
5. 打开设置 -> 编辑供应商 -> 获取模型 -> 测试连接 -> 保存
6. 每步截图 + JSON日志 + 时间戳

### 失败处理
- 任何一项 FAIL -> 不进入下一步
- 记录到 lessons/ERROR_LOG.md
- 派回对应Agent修复
- 修复后重新验证该项

---

## 六、经验吸取清单（写入每个Agent的指令）

| # | 经验 | 如何避免 |
|:---|:---|:---|
| 1 | 只验证元素存在不验证功能正确 | 必须实际点击+检查结果 |
| 2 | CDP测试残留模态框阻塞用户交互 | 每次测试后closeAllPanels() |
| 3 | CSS清零重写误删核心文件 | 删除前检查HTML link引用 |
| 4 | _scData()与_getProjectData()数据不一致 | 统一用一个数据入口 |
| 5 | ChapterManager.createChapter返回null | 先同步volume到ChapterManager |
| 6 | apiGenerate catch返回null导致链路断 | catch改为throw |
| 7 | openTabs无限增长导致内存泄漏 | 限制20个上限 |
| 8 | CDP中.click()不触发onclick | 用dispatchEvent |
| 9 | PowerShell Set-Content破坏中文编码 | 用Node.js fs |
| 10 | 美容成果未提交git导致丢失 | 每完成一个模块立即提交 |

---

## 七、执行节奏

### 阶段A: 准备（主线程）
- [ ] 清理 BACKUP/ 到 <10 个文件
- [ ] 清理 scripts/ 一次性脚本
- [ ] 清理根目录测试脚本
- [ ] 备份当前所有核心文件
- [ ] 确认 Electron 可启动、CDP 可连接

### 阶段B: P0并行修复
- [ ] Agent-1 + Agent-3 并行启动（不冲突的文件）
- [ ] Agent-1: 修复 panels.js 流水线
- [ ] Agent-3: 修复 renderer_v2.js 绑定+API
- [ ] 两者完成后 -> Agent-2 启动: 修复 style.css 美容+可见性
- [ ] Agent-2 完成后 -> Agent-4 验证全部 P0

### 阶段C: P1修复
- [ ] Agent-1: 章节树联动
- [ ] Agent-3: 模态框互斥+插件市场
- [ ] Agent-2: memory-panel guard
- [ ] Agent-4: 验证全部 P1

### 阶段D: 集成验证（主线程）
- [ ] 端到端走通完整流程
- [ ] 每步截图保存
- [ ] 生成 FINAL_REPORT
- [ ] 提交 git

### 阶段E: 清理
- [ ] 删除测试残留
- [ ] 清理临时文件
- [ ] 整理报告文件

---

## 八、Agent调用透明报告模板

每次派发Agent时向用户报告:
```
[Agent派发] Agent-1 流水线医生
- 类型: Task subagent
- 任务: 修复生成流水线完整链路
- 可写文件: panels.js
- 不可触碰: renderer_v2.js, style.css
- 预计: 修复3个子问题
- 经验引用: ERR-032/033/034
- 验证方案: CDP行为验证全链路
```

---

## 九、约束与铁律

1. 不跨文件边界修改
2. 不做批量正则替换
3. 每次修改前备份
4. 含中文文件用 Node.js fs（不用PowerShell Set-Content）
5. 修改后 node --check 验证
6. CSS修改后检查花括号平衡
7. 声称PASS必须附截图+行为验证
8. 错误实时记录到 lessons/ERROR_LOG.md
9. 不用简化方法绕过超时
10. 每完成一个模块立即提交git
