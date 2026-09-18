# DEV LOG 2026-09-09: 意图路由 V2 升级 — jieba + TF-IDF + Cosine 三层管线

## 版本
3.32.0（待封装）

## 背景
3.31.0 的 V1 关键词意图分类器准确率仅 50-60%，SKILL 调试方反馈「分析请求跑完全链路」问题未根治。社区深度调研后确定 @node-rs/jieba + TF-IDF + Cosine 方案为最优平衡点。

## 修改内容

### 1. 安装依赖
- @node-rs/jieba ^2.0.2：N-API 预编译 Windows x64-msvc 二进制（~2.5MB .node + 5MB dict.txt + 6MB idf.txt）
- @node-rs/jieba-wasm32-wasi ^2.0.2：浏览器 WASM 降级（~1.9MB）

### 2. chainIntentRouter.ts 重写
- 分词层：Jieba.withDict(dict).cut() 懒加载 + 降级到字符级 bigram
- 向量层：TF-IDF 引擎（computeTF -> idfCache -> L2归一化）
- 分类层：Cosine 相似度 + 置信度计算（best/(best+second)）
- 示例库：每意图 30-33 条，共 123 条中文写作领域示例
- initIntentRouter()：异步初始化，预计算意图 TF-IDF 向量矩阵
- classifyChainIntent()：V2 分类器，V1 关键词方案保留为 fallback
- inferIntentsFromContent()：从 SKILL 名称+template 推断意图，阈值 0.05
- 停用词表 49 个

### 3. main.ts 应用入口
- 新增 import { initIntentRouter } 并在 app.mount() 前异步调用（fire-and-forget）

### 4. jieba API 修正
- 原代码 mod.cut 错误：@node-rs/jieba 导出的是 Jieba 类，不是顶层 cut 函数
- 改为 Jieba.withDict(dict) 创建实例后调用 jieba.cut(text, hmm)

### 5. 铁律写入
- AGENTS.md S9：从 5 行松散段落改为 7 条硬约束 + 触发条件 + 强制自检流程
- 神意开发经验总结_v3.md S6 第14条：扩成完整铁律描述

## 不修改清单
- workspaceSkillEngine.ts chain 循环结构不变
- compose 模式所有代码路径不变
- 生成流水线四层 chain/compose 逻辑不变
- 5个回调系统不变
- chainBreakpoint / chainExecution / skillValidation / apiCallBudget 不变

## 验证结果

### S5.1 意图分类测试：10/10 PASS
| 输入 | 期望 | 实际 | 置信度 |
|------|------|------|--------|
| 审核大纲看看缺什么 | analyze | analyze | 0.855 |
| 这个故事引擎能不能撑住长篇 | analyze | analyze | 0.574 |
| 把主角的背景改一下 | edit | edit | 0.519 |
| 替换第二卷的开场方式 | edit | edit | 0.766 |
| 生成一个完整大纲 | generate | generate | 0.861 |
| 帮我起草卷纲 | generate | generate | 0.996 |
| 讨论一下主角应该用什么视角 | discuss | discuss | 0.857 |
| 你觉得这个设定会不会太复杂 | discuss | discuss | 0.734 |
| 帮我看看这个角色有没有魅力 | analyze | analyze | 0.560 |
| 我们商量一下第二卷的走向 | discuss | discuss | 0.890 |

### S5.2 SKILL 推断测试：4/4 PASS
| SKILL | 期望包含 | 实际推断 |
|-------|---------|---------|
| S0-构思共创师 | discuss,generate | [discuss,generate] |
| S1-大纲诊断师 | analyze | [analyze,edit,generate] |
| S2-大纲编辑指令师 | edit | [edit,analyze,generate] |
| S3-主编落地 | generate | [generate,analyze] |

### S5.3 性能测试：PASS
- 单次分类平均延迟：0.025ms
- 最大延迟：1.343ms
- 初始化时间：<100ms（jieba 词典加载）
- 内存占用增量：<5MB

### S5.4 回归验证：PASS
- compose 模式不受影响（不走意图过滤）
- 生成流水线四层不受影响（不走 chain 意图过滤）
- chain 中断机制不受影响（意图过滤在前，中断检查在中）
- 5个回调系统不受影响

## 经验回写
- 经验文件 V3 S6 第14条已扩为完整铁律描述
- AGENTS.md S9 已改为铁律·不可绕过
