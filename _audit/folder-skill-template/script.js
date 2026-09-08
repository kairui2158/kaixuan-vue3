// Folder SKILL 脚本运行在隔离沙箱中：不能 require，也不能访问进程与目录环境。
// 钩子执行超时 5 秒；api.setTemplate 的动态模板最长 20000 字符。
module.exports = {
  // input 是本轮用户输入字符串；只能返回白名单字段。
  preProcess(input) {
    return { input: String(input || '').trim() }
  },
  // output 是模型输出字符串；返回 valid 时会跳过 schema.json。
  postProcess(output) {
    return { output: String(output || '').trim() }
  }
}
