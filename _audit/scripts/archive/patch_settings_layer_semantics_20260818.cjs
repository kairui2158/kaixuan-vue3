const fs = require('fs');
const file = 'src/components/pipeline/PipelinePanel.vue';
let text = fs.readFileSync(file, 'utf8');
const replacements = [
  ['}async function genSettings() {\n  if (!projectStore.outlineText) return', '}\n\nasync function genSettings() {\n  if (!projectStore.hasOutline || !projectStore.outlineLocked) return'],
  ['pipelineStore.updateProgress(10, "AI生成设定中")', 'pipelineStore.updateProgress(10, "正在读取已确认大纲并生成设定")'],
  ['const prompt = "[大纲]\\n" + projectStore.outlineText + "\\n\\n请基于此大纲，生成世界观设定。输出JSON数组，每项含name/category/attrsText字段。"', 'const prompt = "[已确认大纲]\\n" + projectStore.outlineText + "\\n\\n请基于这份已确认的大纲，提取并生成设定项。根据内容自动分配category；没有合适分类时使用设定类。输出JSON数组，每项含name/category/attrsText字段。"']
];
for (const [from, to] of replacements) {
  if (!text.includes(from)) throw new Error('missing replacement: ' + from.slice(0, 50));
  text = text.replace(from, to);
}
fs.writeFileSync(file, text, 'utf8');
console.log('updated settings generation semantics');
