# 教训：后端方法加了但UI没补全（v2.7.48）

## 问题
伪SKILL到真SKILL升级中，provider-manager.js 新增了 purpose 字段（getVerifyProvider/getDetectProvider/setProviderPurpose），HTML 也加了 cfg-provider-purpose 下拉框，enterProviderEdit 也读取了 purpose 值，但 saveSettingsFromForm 里完全没有读取 purpose 变量，也没传给 ProviderManager.update/add。listProfiles 返回对象也没带 purpose 字段。renderProfileList 卡片也没显示 purpose 标签。

## 根因
1. 用多个临时 patch 脚本分步修改，每步只改一部分，没有一次性验证全链路
2. 交接摘要声称已修改但实际未落地（providerPurpose count=0）
3. 没有在改完后做完整的端到端验证

## 修复内容
1. provider-manager.js listProfiles 返回对象补 purpose 字段
2. renderer_v2.js saveSettingsFromForm 补 providerPurpose 变量读取
3. renderer_v2.js ProviderManager.update/add 调用补 purpose: providerPurpose
4. renderer_v2.js renderProfileList 卡片补 purpose badge 显示

## 验证方法
1. node --check 语法验证全部 PASS
2. 18项静态检查全部 PASS
3. CDP 运行时验证：刷新页面后下拉框存在、3个选项正确、purpose 字段正确传递

## 教训编号
#77: 后端方法加了但UI没补全
