# 手册升级方案：从结构层到行为层

## 一、问题诊断

### 现有手册的深度

以T06事件层为例，现有手册有14个章节、15条行为契约(EC-01~EC-15)、15条迁移注意(M-01~M-15)、10条差异检测规则(R-01~R-10)。覆盖了：
- 事件绑定方式（3种）
- 事件分类清单（16个子节）
- 事件委托矩阵（9个容器）
- 行为契约（15条）
- 迁移注意（15条）

### 缺口（导致Fix10/Fix11的根因）

| 缺口 | Fix10案例 | Fix11案例 |
|------|-----------|-----------|
| 缺少函数级行为契约 | T06记录了gen-ch:_treeGenChapters(vid)，但没记录这个函数在Vue3里应该用emit还是window事件 | T06未记录lockOutline的行为契约 |
| 缺少通信方向标注 | 迁移注意M-03说"事件委托可用组件化替代"，但没说组件间导航用emit、跨树通信用window事件 | 不适用 |
| 缺少副作用清单 | 不适用 | T01数据层记录了lockOutline函数存在，但没记录它会自动创建默认卷的副作用 |
| 缺少验证用例 | EC-05只说"点击章节树按钮验证对应方法被调用"，没说"树生成按钮点击后pipeline面板应该打开" | 无验证用例 |

## 二、升级目标

从"记录有什么"升级到"记录怎么跑"。每个函数从记录3层升级到7层。

### 现有3层（结构层）
1. 函数名、选择器、源码位置
2. 事件类型、回调函数
3. 迁移注意（旧->新映射）

### 升级后7层（结构层+行为层）

| 层 | 名称 | 内容 | 示例（treeGen函数） |
|----|------|------|---------------------|
| L1 | 结构 | 函数名、选择器、源码位置 | treeGen(), ChapterTree.vue:treeGen(), 按钮文本"树生成" |
| L2 | 输入来源 | 数据从哪来：store/props/window事件/emit/DOM读取 | 点击事件@click，无输入参数 |
| L3 | 输出去向 | 结果到哪去：store写/emit/DOM操作/返回值 | emit('navigate','pipeline') -> App.vue handleNavigate |
| L4 | 副作用 | 改了什么状态（超出主要目的的状态变更） | 无副作用（只触发导航，不改数据） |
| L5 | 通信范式 | 全局直读/store响应式/emit通信/props下行 | emit通信（子->父），不用window事件 |
| L6 | 验证用例 | Playwright测试：输入->操作->期望行为 | 点击"树生成"按钮 -> pipeline面板可见 -> currentStep正确 |
| L7 | 跨组件依赖 | 哪些组件依赖此函数的行为 | App.vue的handleNavigate依赖此emit；pipelineStore.currentStep被设置 |

### 副作用清单格式（L4）

每个函数的副作用用三列记录：

| 函数 | 主要行为 | 副作用 | 风险等级 |
|------|----------|--------|----------|
| lockOutline() | 设置outlineLocked=true | 旧架构：自动创建默认卷（第一卷） | 高：干扰下游卷纲生成 |
| setOutline() | 保存大纲文本 | 无 | - |
| genChapters() | 生成章节数组 | 裁剪多余章节(splice) | 中：需确认totalChapters传入 |

## 三、分批策略（3批，按风险排序）

### 第一批：流水线链路（5个组件，最高风险）

| 组件 | 手册层级 | 函数数(估) | 已有Playwright测试 | 状态 |
|------|----------|-----------|-------------------|------|
| PipelinePanel.vue | T04交互流程层 | ~15 | test_pipeline_v2.js (37项) | 已验证 |
| ChapterTree.vue | T06事件层 | ~12 | test_p9_chapter_tree.js (48项) | 已验证 |
| OutlineWorkspace | T04交互流程层 | ~8 | test_pipeline_v2.js T4 | 已验证 |
| project store | T01数据层 | ~20 | 间接验证 | 待补 |
| pipeline store | T14状态机 | ~10 | 间接验证 | 待补 |

执行步骤（每个组件）：
1. 读旧架构源码，提取函数级行为
2. 读新架构Vue3源码，对比行为差异
3. 写7层行为契约
4. 写/补Playwright验证用例
5. 运行测试，标记VERIFIED/FAILED
6. 失败的修复后重测
7. 更新手册文件

### 第二批：去AI味链路（3个组件，中风险）

| 组件 | 手册层级 | 函数数(估) | 已有Playwright测试 | 状态 |
|------|----------|-----------|-------------------|------|
| DeAiSettings | T12配置层 | ~15 | test_p8_deai.js (23项) | 已验证 |
| deAiProcess | T09网络层 | ~10 | 间接验证 | 待补 |
| provider store | T01数据层 | ~12 | test_p6_provider.js (24项) | 已验证 |

### 第三批：剩余组件（低风险，已通过P3-P5验证）

| 组件 | 手册层级 | 已有测试 |
|------|----------|----------|
| EditorPanel | T05渲染层 | P3 (16项) |
| ChatPanel | T06事件层 | P4 (20项) |
| SettingsModal | T12配置层 | P5 (64项) |
| 其余组件 | 各层 | P10-P11 (72项) |

## 四、递归深度规范

### 手册层级递归

```
手册
  └── 23层（T01-T23）
       └── 每层N个组件
            └── 每个组件M个函数
                 └── 每个函数7层行为契约（L1-L7）
                      └── L6验证用例 = 1个Playwright测试
                           └── 测试有明确的PASS/FAIL标准
```

### 深度要求

- 每个函数必须有L1-L7全部7层
- L4副作用清单必须区分"主要行为"和"副作用"
- L5通信范式必须标注：emit(子->父) / props(父->子) / store(任意) / window(全局)
- L6验证用例必须可执行（Playwright脚本ID + 测试名）
- L7跨组件依赖必须列出所有依赖方

### 验证用例覆盖要求

| 验证类型 | 要求 | 示例 |
|----------|------|------|
| 正向验证 | 正常操作->期望行为 | 点击树生成->pipeline打开 |
| 副作用验证 | 操作后检查不应改变的状态 | lockOutline后检查volumes.length不变 |
| 通信方向验证 | 验证emit到达、store更新 | treeGen后检查App.vue收到navigate事件 |
| 边界验证 | 空输入/异常输入 | 无卷时点击生成->按钮disabled |

## 五、执行策略

### 工具使用

- 读源码：shell_command (rg/Select-String)
- 写手册：PowerShell here-string -> Set-Content（规则13）
- 写测试脚本：PowerShell here-string -> Set-Content（教训#81）
- 运行测试：node script.js
- 更新经验：Add-Content -> lessons/LESSONS.md

### 防空转协议

- 每个组件完成后写checkpoint
- 同一方法连续失败2次换路径
- 每个组件的7层契约写完立即跑Playwright验证
- 不允许只写契约不验证

### 质量门禁

每个组件升级完成的标志：
1. 7层行为契约全部填写
2. Playwright验证用例全部PASS
3. 副作用清单与测试结果一致
4. 通信范式标注与代码实际一致
5. checkpoint更新

## 六、产出文件结构

```
_audit/manual/
  T01_数据层.md                    # 升级后
  T02_调用链层.md
  ...
  T23_外部依赖层.md
  T24_INDEX.md                     # 索引更新
  behavioral_contracts/            # 新增目录
    pipeline_chain/                # 第一批
      PipelinePanel.md
      ChapterTree.md
      OutlineWorkspace.md
      project_store.md
      pipeline_store.md
    deai_chain/                    # 第二批
      DeAiSettings.md
      deAiProcess.md
      provider_store.md
    remaining/                     # 第三批
      ...
  behavioral_tests/                # 新增目录
    pipeline_chain/
      test_pipeline_v2.js          # 已有
      test_chapter_tree_v2.js      # 待写
      ...
    deai_chain/
      ...
```

## 七、时间估算

| 批次 | 组件数 | 函数数(估) | 验证用例数(估) |
|------|--------|-----------|---------------|
| 第一批 | 5 | ~65 | ~65 |
| 第二批 | 3 | ~37 | ~37 |
| 第三批 | ~10 | ~80 | ~80 |
| 合计 | ~18 | ~182 | ~182 |
