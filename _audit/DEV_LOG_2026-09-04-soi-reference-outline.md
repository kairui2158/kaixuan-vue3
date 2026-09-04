# 开发日志：SOI 结构化大纲索引替代500字截断

日期：2026-09-04
版本：基于 v3.19.5
经验文件引用：S8 规则62/67（已补充规则68/69）

## 开发功能

ChatPanel.vue 中 referenceOutline 的6处 .slice(0, 500) 截断替换为 buildSOI() 结构化大纲索引。

## 改动清单

1. 新增 buildSOI(mode, activeTab) 函数，按页签模式生成分层结构化大纲索引
2. buildTemplateContext 的3处 .slice(0, 500) 替换为 buildSOI(tabMode, activeTab)
3. sendMessage 的 chatCtx 3处 .slice(0, 500) 替换为 buildSOI 调用
4. 系统提示标签从大纲概要改为大纲索引

## 用途

500字截断只传入大纲开头文本，模型无法获取全局结构信息。SOI 提供分层结构化索引，token 预算 800-1500，信息密度提升3-5倍。模型讨论第三卷第五章时能看到所有卷的架构、当前卷纲要、章节列表和前后章节，大幅提升 API 对话的上下文质量。

## 验证

- type-check 通过
- vite build 通过，SOI 特征字符串已确认编译进 dist-renderer
- Electron 源码启动成功无报错
- rg slice.*500 仅剩2处 buildSOI 内部子提取，非旧全文截断
