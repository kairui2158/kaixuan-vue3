const fs = require('fs')
const path = require('path')

const auditDir = path.join(process.cwd(), '_audit')
const lessonPath = fs.readdirSync(auditDir).map((name) => path.join(auditDir, name)).find((file) => path.basename(file) === '\u795e\u610f\u5f00\u53d1\u7ecf\u9a8c\u603b\u7ed3.md')
if (!lessonPath) throw new Error('经验文件不存在')

const addition = `

### 设定层分类导航与当前分类内容框拆分经验（2026-08-18 追加）

| # | 错误操作 | 根因 | 改正措施 | 避免再犯 |
|---|---------|------|---------|---------|
| J11 | 把动态设定分类导航放进设定内容框，导致分类按钮和当前分类内容视觉上混在同一个框内 | 把“分类选择区”和“当前分类编辑区”当成一个工作区容器，没有把用户确认的层级结构映射为独立 DOM 区域 | 删除旧左右栏容器的边框职责；分类导航作为独立横向导航渲染；新增 .pl-sc-content-frame，只包当前分类编辑器和该分类操作区 | 先画出并核对 DOM 层级：Agent/模式行 → Skill 行 → 独立分类导航 → 当前分类内容框 → 分类操作 → 底部全层操作；导航不得成为内容框后代 |
| J12 | 内容框没有只承载当前分类，切换分类时无法用结构证据证明显示的是所选分类 | 只检查页面是否出现分类按钮，没有验证点击后的标题、内容容器归属和边界关系 | CDP 逐个点击可见分类，读取当前标题、活动状态、内容框高度，并断言内容框不包含导航 | 每个动态导航都要验证“点击 → 活动状态 → 当前分类标题/内容变化 → 导航仍在框外”，不能只做静态截图 |

**本轮新增硬规则**:
1. 分类导航是独立结构，不得放进 .pl-sc-content-frame、卡片或滚动内容容器。
2. .pl-sc-content-frame 只负责当前分类的编辑内容与该分类底部操作；全层确认/保存必须位于内容框外的最底部。
3. “显示在页面上”不等于“结构正确”：必须同时检查 DOM 包含关系、实际坐标顺序、边框范围、点击后的状态变化。
4. 修改布局前先删除旧布局规格和旧容器职责，再建立唯一的新结构，禁止用额外覆盖层叠补救。
`

fs.appendFileSync(lessonPath, addition, 'utf8')
console.log(`appended: ${lessonPath}`)
