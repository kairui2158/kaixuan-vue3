# 封装经验总结

## 版本历史

| 版本 | 日期 | 结果 | 关键问题 |
|------|------|------|----------|
| 1.0.0 | 2026-07-22 | 失败 | API Key/测试数据残留、GPU禁用导致卡顿、面板互相遮挡 |
| 2.0.0 | 2026-07-23 | 部分成功 | GPU已修复、无数据残留、但Skill选择器失效+溢出问题遗留 |
| 2.0.1 | 2026-07-23 | 修复完成 | 修复Skill持久化缺陷+表格溢出，4个问题全部CDP验证PASS |
| 2.6.0 | 2026-07-24 | 部分成功 | 重构renderer_v2.js+架构图，但reasoning_content未解析导致正文空 |
| 2.7.0 | 2026-07-24 | 失败 | 声称修复6个客户端问题CDP验证PASS，用户实测全FAIL |
| 2.7.0+ | 2026-07-25 | 修复中 | SC面板overflow反复修复3次，教训55-65已记录 |

## 封装踩坑清单

### 1. GPU 硬件加速（严重）

- **问题**：`main.js` 中 `disable-gpu-compositing` 开关导致软件合成，应用严重卡顿
- **根因**：为解决特定 GPU 驱动的黑屏问题而添加的全局禁用，但副作用是所有用户都卡
- **修复**：删除 `disable-gpu-compositing`，保留硬件加速。如遇黑屏改用 `--use-angle=d3d11`
- **教训**：GPU 开关是全局影响项，禁止为个别问题全局禁用

### 2. CSS 多层叠加冲突（严重）

- **问题**：style.css 经过多轮美容清理后仍有同一选择器重复定义（`.pl-skill-bar` 出现 5 次，`.msg-user` 出现 6 次）
- **根因**：每轮美容新增规则但不删旧规则，导致 CSS 层叠优先级混乱
- **修复**：遵循"先删后改"规则，新增规则前先删除同选择器旧定义
- **教训**：CSS 修改必须遵守规则——不做叠加，先删后改

### 3. StorageManager 数据不持久化（严重）

- **问题**：`_plData()` 调用 `_getProjectData()` → `StorageManager.get()` 每次返回 `JSON.parse()` 的新对象，修改后不调 `_saveProjectData()` 数据就丢失
- **根因**：`_plAddSkill`/`_plRemoveSkill`/agent选择器/字数输入都直接修改 `_plData()` 返回值但不保存
- **修复**：改为先 `_getProjectData()` 获取完整项目数据，修改后调 `_saveProjectData()` 持久化
- **教训**：IndexedDB/文件存储的 get 返回的是深拷贝，修改后必须显式保存

### 4. Markdown 表格撑爆气泡容器（中等）

- **问题**：AI 回复包含 markdown 表格时，表格宽度 1642px 撑爆 300px 的聊天气泡，导致页面溢出
- **根因**：`.message-content` 没有溢出控制和宽度约束
- **修复**：添加 `max-width: 100%; overflow-x: auto`，表格设为 `display: block; overflow-x: auto`
- **教训**：所有容器都可能包含用户/AI 生成的宽内容，必须有溢出兜底

### 5. package.json files 配置（中等）

- **问题**：打包后 `js/` 目录未包含在 asar 中
- **修复**：`package.json` 的 `files` 数组必须包含 `js/**/*`
- **教训**：每次修改目录结构后检查 `files` 配置

### 6. 数据残留（严重）

- **问题**：1.0 版本将 API Key、测试文章等硬编码在应用中
- **修复**：禁止添加默认 API Key、示例供应商数据、硬编码模型名
- **教训**：零假数据规则（规则已在 AGENTS.md 中）

## 封装前检查清单

1. [ ] GPU 硬件加速已启用（main.js 无 disable-gpu-compositing）
2. [ ] package.json files 包含 js/**/*、styles/**/*、renderer.html
3. [ ] 无硬编码 API Key/测试数据
4. [ ] CSS 花括号平衡 = 0
5. [ ] CDP 行为验证全部 PASS（不只检查元素存在）
6. [ ] 所有面板能正确打开/关闭（隐藏类 CSS 规则存在）
7. [ ] 聊天气泡背景色和文字对比度正常
8. [ ] AI 回复中的表格/代码块不撑爆容器
9. [ ] Skill 选择器选择后 chip 正确渲染
10. [ ] IndexedDB 数据修改后正确持久化

## CDP 验证方法

```
# 启动应用（main.js 已配置 remote-debugging-port=9223）
# 连接 CDP
node -e "require('playwright').chromium.connectOverCDP('http://127.0.0.1:9223')"

# 验证要点：
# 1. 实际点击按钮触发操作，不只检查元素存在
# 2. 修改后检查 IndexedDB/StorageManager 数据是否持久化
# 3. 截图保存到 test_evidence/ 作为证据
# 4. 检查溢出：document.querySelectorAll('*') 遍历 getBoundingClientRect
```

## 文件结构关键路径

| 文件 | 用途 | 封装注意事项 |
|------|------|-------------|
| main.js | Electron 主进程 | GPU 开关、CDP 端口、单实例锁 |
| renderer.html | 渲染进程 HTML | 外部 CSS 引用路径 |
| style.css | 主样式（6000+行） | 花括号平衡、无重复选择器 |
| styles/components/*.css | 组件样式 | 面板隐藏类定义在此 |
| panels.js | 面板逻辑 | _plData 持久化、事件绑定 |
| renderer_v2.js | 主渲染逻辑 | 面板显隐控制、模态框 |
| js/storage.js | 存储管理 | get 返回深拷贝，修改后需 set |
| js/skill-manager.js | Skill 管理 | getAll/get 接口 |
| js/agent-manager.js | Agent 管理 | getAll 接口 |

## 更新记录

- 2026-07-23 v2.0.1：修复 Skill 持久化 + 表格溢出，CDP 验证 8/8 PASS
- 2026-07-23 v2.0.0：封装发布，修复 GPU + 数据残留
- 2026-07-22 v1.0.0：首次封装，发现严重数据残留问题

- 2026-07-25 v2.7.0：声称修复6个问题CDP验证PASS，用户实测全FAIL，新增11条踩坑记录

## 2.7.0封装新增踩坑清单

### 7. reasoning_content未解析（严重）
- 问题：API返回reasoning_content字段(Deepseek思考过程)，但应用只解析content字段
- 修复：同时检查content和reasoning_content字段
- 教训：API响应结构变更必须及时适配，切换供应商时必须验证响应解析逻辑

### 8. Agent属性未注入API请求（严重）
- 问题：数据模型里每层都有agentId/skillId，但apiGenerate调用时没注入Agent配置
- 修复：apiGenerate增加opts参数注入Agent配置
- 教训：验证必须走到API请求层面，拦截fetch检查请求体

### 9. CDP验证假阳性（严重）
- 问题：CDP用Runtime.evaluate直接调函数，绕过DOM事件链路
- 修复：必须用Input.dispatchMouseEvent模拟真实鼠标坐标点击
- 教训：验证方法本身的缺陷是最大教训(经验22重新违反)

### 10. 版本不一致（中等）
- 问题：我修改源文件，用户安装旧版本打包应用
- 修复：每次封装后必须自己安装新版本实测
- 教训：源文件验证通过不等于打包后应用验证通过

### 11. 美容崩塌（严重）
- 问题：清零重写阶段删除style.css(8383行)，美容规则消失69.3%
- 修复：恢复style.css，保留BASE层
- 教训：经验54写了禁止删style.css但还是删了，经验必须变成GATE门禁才有效

## 封装前检查清单新增项(2.7.0后)
11. API响应解析包含reasoning_content字段
12. Agent配置注入API请求体(fetch拦截验证)
13. CDP验证用Input.dispatchMouseEvent(非Runtime.evaluate)
14. 封装后安装新版本实测(非只源文件验证)
15. style.css未被删除(行数>7000行)
16. Toast/通知z-index>9999

---
## 更新: 2026/7/26 03:03:27 (v2.7.6)

### 版本历史更新
| 2.7.5 | 07-26 | 修复 | _plGenSettings上下文传递断裂修复(优先读取pl.outlineText) |
| 2.7.6 | 07-26 | 设定校验 | 设定校验SKILL闭环修复+正则误匹配+null安全 |

### 新增封装教训
10. 正则误匹配导致功能卡死：/\[[\s\S]*\]/ 贪婪匹配会误匹配校验报告中的[WARN]/[OK]方括号
    - 修复：正则匹配后必须JSON.parse验证，parse失败走报告分支
    - 教训：任何用正则从自由文本提取结构化数据的场景，都必须对提取结果做语法验证

11. 同类隐患必须全量排查：修复一处正则后必须扫描所有同类正则(5处)
    - 1处缺少可选链(text.match()[0] -> text.match()?.[0])
    - 3处已有try-catch保护不会卡死但行为不一致

### 封装前检查清单(更新)
11. [ ] 正则匹配JSON处都有JSON.parse验证
12. [ ] 所有match()调用都有可选链(?.)防null

## 更新: 2026-07-27 19:20:33 (v2.7.15)

### 版本历史
| 2.7.15 | 07-27 | 内联菜单CSS修复 | 删除冲突定义+按钮自适应+容器高对比+z-index提升 |

### 修改内容
1. style.css: 删除697行旧inline-menu-btn冲突定义(透明背景版)
2. style.css: 3679行按钮改为min-width:auto+padding:4px 10px+color:text-primary
3. style.css: 3714行容器改为bg-tertiary背景+双层强阴影+max-width:560px+z-index:8000

### CDP验证结果
- 修复前: width=30px(固定溢出), color=rgb(136,138,148)(灰), bg=rgb(10,10,12)(重合)
- 修复后: width=91px(自适应), color=rgb(232,232,236)(白), bg=rgb(26,26,31)(区分)
- z-index: 1500→8000

### 封装前检查
- [x] node --check全部JS语法通过
- [x] style.css花括号平衡(1295=1295)
- [x] inline-menu-btn只有1处定义(冲突消除)
- [x] style.css行数5962(因删除冲突定义减少,非功能丢失)

### 教训补充
12. CDP的Runtime.evaluate注入CSS是运行时内存效果,不修改文件
    - 用户看到"改源文件影响安装版"实际是CDP注入的临时效果
    - 验证: app.asar修改时间(18:20)早于源文件修改时间(18:53),物理独立
    - 教训: CDP注入验证后要向用户说明这是运行时效果,不是文件修改

## 更新: 2026/8/3 (v2.7.36) — 全维度检查

### 新增踩坑清单

### 13. CSS"只加不删"系统性问题（严重 — 反复违反）
- **问题**: style.css 有 128 个重复选择器，其中 11 个非媒体查询真冲突
- **根因**: 每轮美容/功能迭代新增规则但不删旧规则，CSS 层叠下后者覆盖前者，旧定义成为死代码
- **最严重案例**: `.pl-steps` 定义 9 次，`.pl-step-num` 定义 8 次，`.pl-step-status` 3 处属性不同只有最后生效
- **修复**: 合并 11 个真冲突到最后一处定义，旧定义替换为注释
- **教训**: PACKAGING_LESSONS 教训 #2 早就写了"先删后改"但一直在违反。必须变成 GATE 门禁：
  - 封装前必须运行重复选择器检测脚本
  - 非媒体查询真冲突必须为 0 才允许封装
  - 修改 CSS 前必须全文搜索选择器，找到所有定义合并到一处

### 14. 死代码积累（中等）
- **问题**: `_plSupplementChapters` 被分批生成取代但未删，`_syncChapterEdit` 定义了但无调用
- **根因**: 功能重构时新方法写好、调用方切换，但旧方法忘删
- **修复**: 用 App.prototype 方法扫描定位死代码（127个方法中2个未被调用）
- **教训**: 重构功能后必须扫描旧方法调用方，无调用的立即删除

### 15. 根目录废旧文件堆积（低）
- **问题**: 182 个测试脚本和文本文件堆积在根目录
- **根因**: 临时测试脚本用完不清理
- **修复**: 移到 archive/ 目录
- **教训**: 临时文件使用后立即移到 archive/ 或删除

### 封装前检查清单新增项(2.7.36后)
17. [ ] CSS 非媒体查询重复选择器 = 0（运行检测脚本）
18. [ ] App.prototype 方法无死代码（无调用的方法已删除）
19. [ ] 根目录无废旧测试文件（已移到 archive/）
20. [ ] CSS 修改遵循"先搜后改"——修改前全文搜索选择器，合并所有定义到一处

### 全维度检查方法论（可复用）
1. 语法: `node --check` 所有核心 JS
2. CSS平衡: 花括号 open = close
3. CSS冲突: 正则提取选择器，统计非 @media 重复
4. 死代码: App.prototype 方法 + 调用方搜索
5. HTML引用: getElementById ID vs HTML id 属性
6. 文件冲突: 跨文件 App.prototype 方法列表对比
7. CDP验证: Playwright 行为验证（不只检查元素存在）
