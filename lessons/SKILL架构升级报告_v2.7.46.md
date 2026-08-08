# SKILL 架构升级报告 v2.7.46

生成日期: 2026-08-05
版本: v2.7.45 -> v2.7.46 (代码完成，待CDP验证)

## 一、升级概述

解决三个核心缺陷：变量替换9/10路径失效、Markdown空头支票、无代码逻辑能力。
按阶段3-2-1顺序实现，做一步检3次验证。

## 二、改动清单

### 新增文件
| 文件 | 行数 | 说明 |
|------|------|------|
| js/skill-template-engine.js | 142 | 脚本沙箱+变量替换一体化引擎 |

### 修改文件
| 文件 | 改动点 | 说明 |
|------|--------|------|
| renderer.html | L761 | 加载 skill-template-engine.js |
| renderer.html | L346 | 编辑器增加预览容器 |
| renderer_v2.js | L4301-4360 | 新增 _buildSkillContext + _renderSkillTemplate |
| renderer_v2.js | L640,642,884,1759,1801,1804,2273,2317,2845,4417 | 10处调用点全替换 |
| renderer_v2.js | L2693,2696-2730 | Markdown实时预览 _initSkillTemplatePreview |
| style.css | L6144-6170 | 双栏布局+预览样式 |

## 三、阶段3：SKILL脚本能力

### 沙箱安全设计
- 拦截16个危险API：require/process/fs/window/document/global/module/exports等
- 执行方式：new Function() + use strict + 受限作用域
- 脚本通过 output.push() 输出，拼入prompt

### 变量场景
| 场景 | 变量 |
|------|------|
| volume | outlineContent, volumeCount, wordsPerVolume, novelTitle, styleTags, pacingParams |
| chapter | volumeOutline, chapterCount, wordsPerChapter, styleTags, pacingParams, novelTitle |
| body | chapterTitle, chapterSummary, prevChapterSummary, characters, novelTitle, chapterPlot |
| deai | selectedText |
| dialogue | selectedText, novelTitle, outlineContent, chapterSummary, characters, chapterTitle |

### 验证（做一步检3）
1. node --check 语法通过
2. 142行文件完整
3. 6项功能测试全通过：变量替换/脚本执行/安全拦截/纯文本兼容/hasScripts

## 四、阶段2：Markdown编辑器+预览

- HTML: textarea外层增加sf-template-wrapper + sf-template-preview
- CSS: flex双栏布局，支持h1-h3/code/pre/table/blockquote/列表，变量高亮，响应式
- JS: _initSkillTemplatePreview() 绑定input事件，marked实时渲染，script块展示，变量高亮
- 验证：node --check通过，CSS花括号平衡1384/1384

## 五、阶段1：变量替换引擎

在阶段3中一体化完成。10条路径全部接入_renderSkillTemplate。

## 六、引用的经验教训

| 教训 | 引用方式 |
|------|----------|
| 教训1.1 | 做一步检3次 |
| 教训2.2 | 10处调用点全部替换不遗漏 |
| 规则13 | 用Node.js fs处理中文源文件 |
| 规则15 | CSS花括号平衡检查 |
| 规则19 | CSS先搜后改 |
| 教训#77 | 禁止node -e复杂引号，用独立.js脚本 |

## 七、待完成项

| 项目 | 状态 |
|------|------|
| CDP行为验证 | 未完成（应用未运行） |
| 封装v2.7.46 | 未完成（需CDP验证后） |
| 临时文件清理 | _patch_remaining.js, test_engine.js 待清理 |

### CDP验证清单
1. 打开SKILL编辑器，输入Markdown，右侧预览实时渲染
2. 写{{novelTitle}}，预览中变量高亮
3. 写<script>output.push('test')</script>，预览中显示script块
4. 生成卷纲，检查API请求中变量已替换
5. 去AI味执行，检查selectedText已替换
6. 安全测试：require('fs')被拦截

## 八、总结

| 能力 | 升级前 | 升级后 |
|------|--------|--------|
| 变量替换 | 仅测试面板7个变量 | 10条路径全覆盖，按场景注入 |
| Markdown预览 | 无 | 实时双栏预览，变量高亮 |
| 脚本逻辑 | 不支持 | 沙箱执行，支持条件/循环/计算 |
| 安全性 | N/A | 16个危险API拦截 |
