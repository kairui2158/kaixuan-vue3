# DEV LOG 2026-08-27：P7 内容/叙事完整性边界

## 根因

旧卷纲校验只检查名称和内容，旧章节校验只检查标题和剧情点；补充生成只按数量和标题筛选，空剧情点和批次内重复项仍可能进入项目。应用也没有能力仅凭字符串证明伏笔回收或人物状态连续，因此本阶段不能把语义质量强行塞进字段校验。

## 修改

- 新增 `src/services/narrativeValidation.ts`：统一卷纲/章节结构校验和补充批次筛选。
- 新增 `src/services/narrativeValidation.spec.ts`：覆盖数量缺口、必填字段、重复项和补充过滤。
- `PipelinePanel.vue` 的卷纲/章节校验改走统一服务；章节 API 批次只接受完整且去重的条目。

## 验证

- focused：23/23。
- service tests：44/44。
- type-check：通过。
- build:vue：通过。
- 源文件 Electron/CDP 页面与隔离 storage：通过，隔离键已清理。

## 留痕边界

没有客户 API 配置，未声称真实事件覆盖、伏笔回收、角色状态连续或场景落实已经通过；这些保留给最终客户 API 实测和人工/规则复核。
