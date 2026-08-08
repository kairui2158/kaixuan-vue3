# 技术栈

## 运行时
- Node.js v24.16.0
- Electron v33.0.0

## 前端
- 原生 HTML5
- 原生 CSS3（暗色主题，CSS 变量）
- 原生 JavaScript ES6+（class 语法，async/await，fetch API）

## 存储
- localStorage（设置持久化）

## API
- OpenAI 兼容 API（当前: openapi.cloud-ai.cn）

## 开发工具
- node --check（语法验证）
- GitHub CLI（版本管理）

## 禁止事项
1. 禁止使用任何前端框架（React/Vue/Angular）
2. 禁止引入 npm 依赖（保持单文件可运行）
3. 禁止使用批量正则替换修改代码
4. 禁止添加虚假默认 API Key 或示例数据
5. 禁止批量大修代码——每次只改一处，验证后再继续
6. 禁止使用 Python 脚本批量处理代码
7. 所有控制台输出使用 [OK]/[ERR]/[WARN] 纯文本标记
8. 修改前备份，修改后 node --check 验证

### 不调用对应SKILL直接操作
**禁止:** 写代码时不调用 vanilla-web/frontend-design，修复时不调用 webapp-testing/playwright
**原因:** 2026-07-03 发现直接手动操作导致编码问题、重复元素等低级错误
**替代:** 每次操作前先加载相关SKILL.md，按SKILL指导进行


## 已知陷阱
1. UTF-8 BOM (U+FEFF) 在源文件开头会导致 Electron 主进程语法错误，所有文件必须以无 BOM 的 UTF-8 编码保存。
