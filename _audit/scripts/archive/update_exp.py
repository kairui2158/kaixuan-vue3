c = open('_audit/神意开发经验总结.md', 'r', encoding='utf-8').read()
new_errors = """
### 错误类型 I：Phase D 新增

| # | 错误操作 | 根因 | 改正措施 | 避免再犯 |
|---|---------|------|---------|---------|
| I1 | Python 脚本用 `or` 替代 JS 的 `||` | 混淆了 Python 和 JS 语法 | 写 JS 代码时必须用 `||`，不能用 `or` | 写 JS 代码前确认语法正确 |
| I2 | 多次运行替换脚本导致函数重复包裹 | 没检查文件当前状态就重复运行脚本 | 修改后必须 git diff 确认只改了一次，多次运行前先 git checkout 恢复 | 同一文件只改一次，多次运行前先恢复 |
| I3 | execLogStore 在模板中使用但未在 script setup 中 import/store 调用 | 模板用了 execLogStore.logs 但没写 `const execLogStore = useExecutionLogStore()` | 在 script setup 中补全 import 和 store 调用 | 模板中使用的 store 变量必须在 script setup 中显式声明 |
| I4 | 执行日志面板点击后不显示（v-if 条件不满足） | 模板中 `v-if="showExecLog"` 但 store 变量未定义导致渲染错误 | 补全 store 定义后 panel 正常显示 | 先验证 store 已注册，再验证 UI 渲染 |

## 错误快照追加（Phase D）

| 日期 | 错误 | 影响 | 修复方式 |
|------|------|------|---------|
| 08-17 | runStepSkills 替换脚本被多次运行 | 函数重复包裹，编译失败 | git checkout 恢复后一次性完成 |
| 08-17 | 执行日志 store 未在 script setup 中调用 | store 未注册，面板不显示 | 补全 useExecutionLogStore() 调用 |
"""
c = c.replace('## 错误快照追加（Phase C）', new_errors + '## 错误快照追加（Phase C）')
open('_audit/神意开发经验总结.md', 'w', encoding='utf-8').write(c)
print('OK')
