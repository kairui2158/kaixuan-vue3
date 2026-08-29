# 设定层 P4：动态分类导航

## 验证范围

- 无大纲时导航只保留“设定类”。
- 有大纲且存在解析分类时，导航使用项目 `settingsCollection.categories` 动态展开。
- 当前分类为空时自动选择第一个有内容的分类。

## 证据

- `settingNavigationCategories`：无大纲返回 `["设定类"]`；有大纲时返回 `设定类 + 项目分类`。
- `firstCategoryWithSettings` 与 watcher：当前分类为空或无效时选择首个有内容分类。
- CDP `P4_RUNTIME`：分类为 `设定类、角色、世界元素、科技、势力、阴谋、系统、法律、新增分类`；当前选中“角色”；显示 15 项设定。

## 结论

- P4：PASS。进入 P5。
