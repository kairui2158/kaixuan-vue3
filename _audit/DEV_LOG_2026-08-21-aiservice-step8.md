# 神意助手开发日志 — 2026-08-21 AIService Step 8 回归验证

## 任务
Step 8: 统一AI服务层回归验证 (V1-V7)

## 前置条件
- Step 1-7 已完成（API盘点→aiService实现→接入点替换→useAiRequest删除→多供应商UI→诊断日志集成）
- Git commit: 3d4a7b8

## 验证项与结果

| 编号 | 验证内容 | 结果 | 证据 |
|------|---------|------|------|
| V1 | useAiRequest已删除、callApi存在、生成+验证供应商都配置 | PASS | noUseAiRequest=true, callApiExists=true, generateProvider="全局", verifyProvider="去AI味专用", purposeIsArray=true |
| V2 | DeAiSettings面板显示验证供应商名称 | PASS | modalOpen=true, deaiTabActive=true, verifyProviderName="去AI味专用", verifyProviderStatusClass含"configured" |
| V3 | 多供应商同时启用 | PASS | activeCount=2, activeNames=["全局","去AI味专用"], bothActive=true |
| V4 | resolveProvider缺失验证供应商时抛中文错误 | PASS | errorMsg="未配置验证用途供应商，请在设置中添加并启用", hasClearMessage=true |
| V5 | fetchModels存在且生成供应商有模型 | PASS | hasFetchModels=true, generateModelCount=29, generateSelectedModel="deepseek-v4-pro" |
| V6 | DiagLogPanel元素齐全 | PASS | purposeFilter=true, exportBtn=true, refreshBtn=true, clearBtn=true, logList=true |
| V7 | 所有调用点验证 | PASS | hasCallApi=true, hasTrackApiCall=true, hasDiagRefresh=true, hasDiagExport=true |

**汇总：7/7 PASS**

## 验证脚本
- `_audit/cdp_step8_final.cjs` — CDP自动化验证脚本，覆盖V1-V7

## 验证截图
- `_audit/step8_final_verify.png`

## 根因分析（V2/V6初始失败原因）
初始运行V2/V6失败，根因是CDP脚本通过文本匹配搜索设置按钮失败（SidebarNav使用SVG图标，无文本），且设置弹窗的打开方式依赖`activePanel` ref而非简单的DOM click。修复方法：
1. 使用 `#btn-settings` ID选择器 + Playwright `click({force:true})` 打开设置弹窗
2. 通过 `window.__pinia._s.get('settings').activeTab = 'deai'` 切换标签页
3. V6复用V2已打开的弹窗，仅切换到diag标签

## V1初始pass判定bug
V1的`results.V1_pass`初始计算返回字符串而非布尔值（`&&`链最后一个truthy值），导致passCount统计错误。修复：用`!!()`包裹确保布尔值。

## V4修复
V4初始脚本通过修改`ps.providers[].purpose`数组来移除verify用途，但store的`getVerifyProvider()`实际读取`verifyProvider` ref（独立于purpose数组），所以错误路径未触发。修复：直接设置`ps.verifyProvider = null`来测试错误路径。

## 收尾动作
- [x] 更新经验文件
- [x] 写开发日志
- [ ] Git提交推送
- [ ] 清理临时脚本和证据文件

## 经验教训
1. CDP脚本打开设置弹窗必须用ID选择器`#btn-settings` + `click({force:true})`，不能用文本匹配
2. Pinia store的字段读取路径要确认：`getVerifyProvider()`读的是`verifyProvider` ref，不是`providers[].purpose`数组
3. `&&`链的返回值不一定是布尔值，验证脚本里的pass判定必须用`!!()`包裹
4. 设置弹窗打开后切换标签页只需设`settingsStore.activeTab`，不需要重新打开弹窗
