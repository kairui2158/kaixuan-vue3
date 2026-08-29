# DEV LOG 2026-08-27 P2 章节执行包

## 目标

建立玄武 L4 到凯旋正文层的正式章节执行包，消除正文入口的散落 prompt 拼接，同时保持正文和 metadata 的边界。

## 修改

- 新增 `src/services/chapterExecutionPackage.ts`：定义 `ChapterExecutionPackage`、构造器和 prompt 渲染器。
- 新增 `src/services/chapterExecutionPackage.spec.ts`：覆盖完整字段、缺省字段、稳定序列化和正文 prompt 渲染。
- 修改 `src/components/pipeline/PipelinePanel.vue:736-737,2250-2275`：正文生成前构造并保存 `chapterExecutionPackage`，再由执行包生成 prompt。

## 验证

- focused 测试：8/8。
- 既有服务测试：44/44。
- `npm run type-check`：通过。
- `npm run build:vue`：178 modules transformed，构建成功。
- Electron/CDP：真实存储写入、读取、杀进程重启、再次读取均确认执行包存在；正文保持独立；隔离验证键已清理。

## 经验

代码存在不等于生成链路已证明。没有客户 API 时，只能验证真实 renderer、存储桥和重启恢复，不能声称真实 API 正文已通过。
