const fs = require('fs')

const root = 'D:/codex/novel-workshop-vue3'
const entries = [
  {
    file: `${root}/_audit/神意开发经验总结.md`,
    marker: '### P4 大纲工作台闭环收尾（2026-08-18）',
    text: `

### P4 大纲工作台闭环收尾（2026-08-18）

#### 目标

验证大纲工作台的真实用户闭环：打开工作台、载入当前项目大纲、自由编辑、保存到本地、确认并锁定、进入生成流水线，以及重载后的状态恢复。

#### 验证结果

1. 证据报告：\`_audit/P4_outline_workspace_verify.json\`，9/9 PASS。
2. 截图：\`_audit/P4_outline_workspace_verify.png\`。
3. 覆盖：工作台打开、编辑器载入项目内容、自由编辑、保存按钮可见可点击、确认后项目锁定、锁定后进入生成流水线、流水线读取同一份大纲、重载后大纲和锁定状态持久化。
4. 验证脚本：\`_audit/scripts/archive/p4_outline_workspace_verify.cjs\`。

#### 重要边界

本轮“保存到本地”通过真实按钮对应的 IPC 写入能力完成验证，报告中明确记录了临时文件写入成功；原生 Electron 保存对话框会阻塞 CDP，因此没有把“用户在原生对话框中选择路径并确认”写成已验证。以后涉及原生对话框时，必须把 IPC 能力证据、按钮触发证据和原生窗口操作证据分开记录，缺少任一层都不能声称完整通过。

#### 防止再犯

验证报告必须区分“功能实现存在”“网页 DOM 操作成功”“原生窗口操作成功”三种证据等级；CDP 无法可靠控制原生窗口时，不得用直接 IPC 或夹具调用冒充完整用户流程。P4 完成后才能进入 P5，不能因部分证据缺口擅自扩大结论。
`
  },
  {
    file: `${root}/_audit/DEV_LOG_2026-08-18.md`,
    marker: '## P4 大纲工作台闭环收尾',
    text: `

## P4 大纲工作台闭环收尾

### 本阶段目标

按客户反馈验证大纲工作台的完整行为闭环，不以“页面能打开”或“按钮存在”代替行为证据。

### 执行与证据

1. 读取经验总结后，确认本阶段只处理大纲工作台，不混入生成流水线或章节层遗留改动。
2. 使用已归档验证器 \`_audit/scripts/archive/p4_outline_workspace_verify.cjs\`，通过真实页面 DOM、Pinia/项目状态和重载路径递进检查。
3. 最终报告 \`_audit/P4_outline_workspace_verify.json\`：9/9 PASS。
4. 截图证据 \`_audit/P4_outline_workspace_verify.png\` 已保留。
5. 覆盖：打开工作台、载入大纲、自由编辑、保存按钮状态、确认锁定、跳转流水线、流水线读取同一大纲、重载持久化。

### 证据边界与纠偏

本轮保存到本地的可验证部分是按钮对应的 IPC 写入：临时文件实际存在且内容长度正确。原生 Electron 保存对话框会阻塞 CDP，因而没有把原生对话框中的路径选择和确认写成 PASS。今后报告必须分别记录网页层、IPC 层和原生窗口层证据，不能把直接 IPC 调用当作完整用户点击流程。

### 收尾状态

P4 行为闭环证据完成并归档；P4 文档回写完成。P5（编辑器与右侧对话框双向同步）是下一阶段，未在本日志中提前标记完成。
`
  }
]

for (const entry of entries) {
  const current = fs.readFileSync(entry.file, 'utf8')
  if (!current.includes(entry.marker)) {
    fs.appendFileSync(entry.file, entry.text, 'utf8')
    console.log(`APPENDED ${entry.file}`)
  } else {
    console.log(`ALREADY_PRESENT ${entry.file}`)
  }
}
