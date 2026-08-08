# 响应式管道重构 — 三线程接口约定

> 版本: 1.0 | 创建: 2026-07-26
> 目标: 将固定管道模式改为响应式管道模式

---

## 重构目标

1. 设定分类动态化：sc.items 从固定key对象改为动态数组，UI按实际category渲染
2. 大纲层增加全书字数绑定
3. 卷纲层增加自动生成按钮（根据字数智能分配卷数）
4. 章节层增加自动生成按钮（根据卷字数智能分配章节数）

---

## 线程分工

| 线程 | 文件 | 职责 |
|------|------|------|
| A | panels.js | 设定合集面板动态分类渲染+绑定适配 |
| B | renderer.html | UI新增元素（字数输入框、自动生成按钮） |
| C | pipeline-manager.js | 核心逻辑（字数绑定、自动生成、动态分类解析） |

---

## 接口约定（三线程必须严格遵守）

### 1. 大纲层新增 DOM ID

| DOM ID | 类型 | 位置 | 说明 |
|--------|------|------|------|
| pl-book-word-count | input[type=number] | Step 1 大纲区域 | 全书字数输入框，单位万字 |
| btn-pl-autogen-volumes | button | Step 3 卷纲区域 | 自动生成卷纲按钮 |
| btn-pl-autogen-chapters | button | Step 4 章节区域 | 自动生成章节按钮 |

### 2. 数据结构变更

#### 2.1 _pipeline 新增字段

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| bookWordCount | number | 0 | 全书字数（单位：字，非万字） |
| autoVolumeCount | number | 0 | 自动计算的建议卷数（0=未计算） |

#### 2.2 settingsCollection.items 结构变更

旧结构（固定key对象）:
{ characters: [], worldview: [], species: [], items: [] }

新结构（动态数组）:
[
  { category: "角色", items: [] },
  { category: "世界观", items: [] },
  { category: "势力", items: [] },
  ...
]

每个 item 结构不变:
{ id, name, attrs: {}, content: "", bound: false, boundTo: null, enabled: true }

### 3. 新增函数签名（pipeline-manager.js）

#### 3.1 _plConfirmOutline 修改
- 读取 pl-book-word-count 输入框值
- 转换为字数（输入框是万字单位，乘以10000）
- 写入 pl.bookWordCount
- persist

#### 3.2 _plAutoGenVolumes 新增
- 检查 pl.bookWordCount > 0
- 构造 prompt: 包含全书字数，要求API建议卷数和每卷字数分配
- 期望返回: [{name, outline, suggestedWords: number}]
- 调用 apiGenerate("volumes", ...)
- 解析后设置 pl.autoVolumeCount
- 渲染卷纲卡片
- 自动填充 pl-volume-count 输入框为建议卷数

#### 3.3 _plAutoGenChapters 新增
- 读取当前卷的 suggestedWords
- 构造 prompt: 包含本卷字数预算，要求API建议章节数
- 期望返回: [{title, plot, summary, suggestedWords: number}]
- 调用 apiGenerate("chapters", ...)

### 4. 设定分类映射规则变更（_plSaveSettings 修改）

旧逻辑: 根据 category 字符串匹配，映射到固定4个key
新逻辑: 直接使用 item.category 作为分类名，动态创建分类

### 5. panels.js 设定合集面板适配

#### 5.1 _scData 初始化变更
旧: sc.items = { characters: [], worldview: [], species: [], items: [] }
新: sc.items = [] (空数组，按需添加分类)

#### 5.2 分类标签渲染
旧: 固定4个按钮
新: 遍历 sc.items 数组，每个 {category, items} 生成一个标签按钮
新增分类时 push { category: "新分类", items: [] }

#### 5.3 绑定按钮适配
绑定逻辑不变，但读取分类时从 sc.items[i].items 遍历而非 sc.items[catKey]

---

## 经验教训（必须传达给子线程）

### 教训1: persist时序
任何修改 _plData() 返回对象后，必须立即 _plPersist(pl)，然后再调用任何依赖 _plData() 的函数。
错误顺序: modify -> call_check(reads stale) -> persist
正确顺序: modify -> persist -> call_check(reads fresh)

### 教训2: CRLF混合问题
项目文件存在 CRLF/LF/CR 混合换行符。修改时用正则匹配，不要假设统一换行。
含中文文件必须用 Node.js fs 修改，禁止 PowerShell Set-Content。

### 教训3: 不做叠加
修改时先删旧代码再写新代码，不要在旧代码旁边加新代码。
如果旧函数逻辑要改，直接替换整个函数体，不要在旁边加 if-else 分支。

### 教训4: 验证规则18
修改完成后不能用读代码判断通过。必须用 CDP 实际调用函数，验证：
- 操作 -> 预期行为 -> 实际结果 三元组
- 数据真的写入 IndexedDB
- 不只验证元素存在，验证功能能用

### 教训5: 429应对
子线程遇到429不要放弃，按 30s->60s->90s->...->240s 递增重试8次。
重试期间做不依赖API的本地工作。429解除后从断点继续。

### 教训6: 接口对齐
三线程并行修改不同文件，必须严格按本文档的 DOM ID 和数据结构约定执行。
任何一方偏离约定，整合时必然出问题。不确定时查本文档，不要自行发挥。

### 教训7: node --check
每次修改后立即运行 node --check 验证语法。语法不过禁止提交。

### 教训8: 规则23 先删后改
精准修复，禁止批量正则替换。修改前先删掉要替换的旧代码，再写入新代码。