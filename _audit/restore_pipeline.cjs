const { execSync } = require('child_process');
const fs = require('fs');

const file = 'src/components/pipeline/PipelinePanel.vue';
const clean = execSync('git show HEAD:' + file, { encoding: 'utf8', cwd: process.cwd() });

// 1) Append split-merge / multi-step options to all 5 mode selects
const oldOpt = '<option value="chain">\u4e32\u884c\uff08\u591a\u6b21\u8c03\u7528\uff09</option>';
const newOpts = oldOpt + '\n                <option value="split-merge">\u62c6\u5206\u5408\u5e76\uff08\u5206\u5757\u5904\u7406\uff09</option>\n                <option value="multi-step">\u591a\u6b65\uff083-4\u6b65\u591a\u9636\u6bb5\uff09</option>';
let src = clean.split(oldOpt).join(newOpts);

// Count occurrences (should be 5)
const count = clean.split(oldOpt).length - 1;
console.log('mode option occurrences:', count);

// 2) Insert engine handling into runStepSkills before chain fallback
const marker = '  if (mode === "chain" && templates.length > 1) {';
if (!src.includes(marker)) throw new Error('marker not found');
const insertion = `  // Use SkillExecutionEngine for split-merge / multi-step
  if ((mode === "split-merge" || mode === "multi-step") && templates.length > 0) {
    const engine = (window as any).SkillExecutionEngine
    if (engine) {
      const aiRequest = async (opts: any) => {
        const provider = providerStore.getProvider("")
        const preferredProvider = providerStore.preferredGenerateProvider
        const activeProvider = provider || preferredProvider
        const model = activeProvider?.selectedModel || activeProvider?.models?.[0] || ""
        const sysMsg = opts.messages?.find((m: any) => m.role === "system")?.content || ""
        const userMsg = opts.messages?.find((m: any) => m.role === "user")?.content || ""
        const result = await providerStore.callApi(activeProvider?.id || "", model, [{ role: "system", content: sysMsg }, { role: "user", content: userMsg }])
        return { text: result }
      }
      const engineSkills = templates.map((t: any) => ({ name: t.name, template: t.template }))
      let result: any
      if (mode === "split-merge") {
        console.log("[PIPELINE] split-merge mode, step=" + step + " skills=" + engineSkills.length)
        result = await engine.splitMerge(prompt, engineSkills, { aiRequest, splitSize: 1000, stream: false })
      } else {
        console.log("[PIPELINE] multi-step mode, step=" + step + " skills=" + engineSkills.length)
        result = await engine.multiStep(prompt, engineSkills.slice(0, 4), { aiRequest, splitSize: 1500, stream: false })
      }
      return result?.text || prompt
    }
  }
`;
src = src.split(marker).join(insertion + marker);

// 3) Verify Chinese intact: the header should contain ?????
if (!src.includes('\u751f\u6210\u6d41\u6c34\u7ebf')) {
  throw new Error('Chinese header missing after patch - aborting');
}

fs.writeFileSync(file, src, 'utf8');
console.log('OK - patched and written as UTF-8');
