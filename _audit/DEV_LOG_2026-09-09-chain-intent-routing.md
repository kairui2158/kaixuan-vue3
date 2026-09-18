# DEV LOG 2026-09-09: chain 模式意图路由与中断机制

## 版本
3.31.0

## 背景
SKILL 开发者反馈 chain 模式两个问题：
1. 运行记录只显示1次 API 调用，4个技能只记录了最后一个的 system prompt
2. 用户问分析请求却跑完全链路，缺少意图判断和中断机制

## 根因
- workspaceSkillEngine.ts 的 lastRunMeta 是 WeakMap，每次迭代覆盖前一个
- OutlineWorkspace.vue 的 startOutlineApiCall 只在 unWorkspaceSkills 返回后调用一次
- chain 循环无条件遍历所有 templates，没有意图过滤

## 修改文件
1. src/services/chainIntentRouter.ts（新建）— 意图分类器，关键词加正则匹配，零依赖
2. src/services/realSkillTypes.ts — RealSkillMeta 增加 intents?: string[]
3. src/services/workspaceSkillEngine.ts — 回调扩展（5个新回调）、chain 循环改造（意图过滤、中断检查、allMetas 数组、onBeforeSkill/onAfterSkill/onApiCallStart/onApiCallFinish 回调注入）
4. src/stores/skill.ts — Skill 接口增加 intents?: string[]，loadSkills 恢复和 importSkills 传递
5. src/components/common/OutlineWorkspace.vue — 注册 onApiCallStart/onApiCallFinish/onSkillSkipped/onBeforeSkill/onAfterSkill 回调，移除单次 startOutlineApiCall 调用
6. src/components/chat/ChatPanel.vue — 同步注册回调，getHomeSkillTemplates 传递 intents
7. src/components/settings/SkillSettings.vue — loadFolderSkill 和 confirmFolderBatchImport 从 meta.json 读取 intents
8. src/services/realSkillExecutor.ts — 类型导入修复

## 不修改文件
- chainBreakpoint.ts、chainExecution.ts、skillRouter.ts、skillValidation.ts、apiCallBudget.ts
- compose 模式所有代码路径
- 生成流水线四层 chain/compose 逻辑
- realSkillLoader.ts（meta 已透传）
- realSkillExecutor.ts executeRealSkill 函数本体

## 验证
- npm run build 成功，无编译错误
- 安装包生成：dist/神意助手-Setup-3.31.0.exe
- 源应用启动：npx electron . 正常

## 经验回写
- 经验文件 V3 追加 2026-09-09 chain 意图路由修复记录
- DEV_LOG 新建本文件
