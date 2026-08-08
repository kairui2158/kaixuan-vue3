# 全应用深度审计报告 v2.7.58

## 审计范围
- renderer_v2.js (288KB)
- panels.js (75KB)
- js/pipeline-manager.js (123KB)
- js/de-ai.js (114KB)
- style.css (260KB)
- renderer.html (60KB)
- js/skill-engine.js (19KB)
- js/skill-validators.js (12KB)
- js/provider-manager.js (7.5KB)
- js/agent-manager.js (2.4KB)
- js/skill-manager.js (4.5KB)
- main.js (14KB)
- preload.js (1.8KB)

## 审计发现

### S1 严重 - 已修复
| # | 文件 | 行号 | 问题 | 状态 |
|---|------|------|------|------|
| 1 | renderer_v2.js | L195-197 | 3个连续空catch: _syncTreeToPipeline/_plPersist/lastSession保存失败静默吞掉 | 已修复: 添加console.warn+DiagLogger.warn |
| 2 | renderer_v2.js | L1297 | SkillManager.getAll()空catch导致技能列表加载失败无日志 | 已修复 |
| 3 | renderer_v2.js | L1312 | AgentManager.getAll()空catch导致智能体列表加载失败无日志 | 已修复 |

### S2 高 - 已修复
| # | 文件 | 问题 | 状态 |
|---|------|------|------|
| 4-17 | renderer_v2.js | 39个空catch块覆盖DeAI执行/供应商获取/SKILL加载/验证器调用等关键路径 | 全部修复: 添加console.warn+DiagLogger.warn |
| 18-19 | pipeline-manager.js | 12个空catch块覆盖模块加载/流水线执行 | 全部修复 |

### S3 中 - 记录待处理
| # | 文件 | 问题 | 状态 |
|---|------|------|------|
| 20 | style.css | 133个重复选择器(.pl-step 8x, #editor-content 5x等) | 记录: CSS去重脚本测试缩减56%过大已回退,需人工逐个审查 |

### S4 已确认正常
| # | 检查项 | 结论 |
|---|--------|------|
| 21 | 10个孤立按钮ID | 假阳性 - 在panels.js/pipeline-manager.js中有引用 |
| 22 | DeAI chain模式执行顺序 | S1->hardrule-mid->S2->hardrule-post (Fix D已生效) |
| 23 | DeAI温度分级 | S2使用verify低温,Fix B已生效 |
| 24 | DeAI风格样本注入 | 注入到S1(idx===0),Fix E已生效 |
| 25 | SKILL template位置 | 作为system message,Fix C已生效 |
| 26 | 验证供应商接入 | cross_model_check在3模式都有调用 |
| 27 | 流程预览按模式变化 | _updateFlowPreview有3分支 |
| 28 | 供应商用途下拉 | 选项为生成/验证,无detect |
| 29 | 供应商保存后更新去AI味 | L1953调用_updateVerifyProviderStatus |
| 30 | 3张模式卡片切换 | _selectDeAiMode正确切换 |

## 修复统计
- 空catch块修复: 51处 (renderer_v2.js:39 + pipeline-manager.js:12)
- CSS重复选择器: 133处记录待人工审查(脚本去重回退,缩减率56%不正常)
- 语法验证: node --check通过

## 审计方法
1. 正则扫描空catch块
2. 正则扫描CSS重复选择器
3. 逐行审查DeAI执行链路(chain/split-merge/multi-step)
4. 逐行审查供应商用途同步
5. 逐行审查流程预览动态更新
6. 逐行审查技能/智能体下拉填充
7. HTML按钮ID与JS引用交叉验证

## 教训
- 空catch块是日志覆盖面缺陷的根源,用户遇到问题时无任何日志可查
- CSS去重不能纯脚本处理,需要人工审查每个重复选择器的上下文(可能有media query内的合理重复)
