# 卷纲层 P3 开发日志：平铺 UI 重排

## 任务
卷纲层按设定层 UI 稿重排：删除层名标题、智能体/Skill选择/添加/模式合为一行、已选 SKILL 芯片独立一行、释放垂直空间。

## 根因
旧布局把智能体与模式一行、Skill 选择一行、标题一行，垂直空间被三层无实质信息内容占满；用户定稿要求平铺对齐设定层。

## 修改文件
- `src/components/pipeline/PipelinePanel.vue`：卷纲层模板重排（10 增 13 删），控制行 `#pl-volume-control-row` 使用 `.pl-settings-control-row`，芯片行挂 `.pl-selected-skills-row`。

## 验证
- CDP 真实 Electron 操作：新建项目 → 确认大纲进入卷纲层 → 布局断言 + Skill 添加/移除回归 + step config 持久化读取。
- 初跑 15/16：`layout:control-row-single-line` 失败，offsetTop 极差 6px。
- 复核：grid `align-items:center` 下标签(~20px)/下拉(34px)/按钮(28px) 高度不同，顶边必然不齐，截图确认视觉单行居中、无横向溢出（scrollWidth=clientWidth=1574）。判定为断言过严，非 UI 缺陷。
- 断言修正为比较垂直中心线（top + h/2），容差 4px → 重跑 **16/16 通过**。

## 证据
- `_audit/tmp/p3-evidence/01-volume-layout-with-skill.png`（添加 Skill 后视觉单行）
- `_audit/tmp/p3-evidence/02-volume-layout-final.png`（最终布局）
- `_audit/tmp/p3-evidence/p3-results.json`（16 项全 ok=true）

## 提交
- `8537485` feat(volume): P3 flat UI layout matching settings layer, verified 16/16 in Electron（已推送 origin/master）

## 经验
- 验证"单行"断言应比较垂直中心线而非顶边 offsetTop；grid 垂直居中时不同高度控件顶边天然不齐。
- CDP 脚本成功路径必须显式断开浏览器连接，否则 node 进程挂起（本轮以 Ctrl+C 收尾）。
