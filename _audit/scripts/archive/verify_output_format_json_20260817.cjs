const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9227');
  const page = browser.contexts().flatMap((c) => c.pages()).find((p) => p.url().includes('dist-renderer/index.html'));
  if (!page) throw new Error('Electron page not found');
  const result = await page.evaluate(async () => {
    const app = document.querySelector('#app')?.__vue_app__;
    const pinia = app?.config.globalProperties?.$pinia;
    const project = pinia?._s.get('project');
    const pipeline = pinia?._s.get('pipeline');
    const skills = pinia?._s.get('skill');
    if (!project || !pipeline || !skills) throw new Error('Pinia stores not found');
    const original = {
      volumes: JSON.parse(JSON.stringify(project.volumes)),
      chapters: JSON.parse(JSON.stringify(project.chapters)),
      skillFormats: skills.skills.map((s) => ({ id: s.id, outputFormat: s.outputFormat })),
      fetch: window.fetch
    };
    const calls = [];
    let callNo = 0;
    try {
      if (!document.querySelector('#pipeline-panel')) {
        document.querySelector('#btn-pipeline')?.click();
        await new Promise((r) => setTimeout(r, 300));
      }
      pipeline.setStep(3);
      await new Promise((r) => setTimeout(r, 300));
      for (const s of skills.skills) s.outputFormat = 'json';
      project.$patch({
        volumes: [{ id: 'vol-test-json', name: 'JSON验证卷', outline: 'JSON输出验证', summary: '', suggestedWords: 3500, confirmed: false, locked: false }],
        chapters: {}
      });
      pipeline.clearBreakpoint();
      window.fetch = async (url, opts) => {
        if (!String(url).includes('/chat/completions')) return original.fetch(url, opts);
        callNo += 1;
        const body = JSON.parse(opts?.body || '{}');
        const prompt = body.messages?.find((m) => m.role === 'user')?.content || '';
        calls.push({ callNo, prompt });
        const content = callNo === 1 ? '这不是合法 JSON' : JSON.stringify([{ title: 'JSON验证章', plot: 'JSON解析通过' }]);
        return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      };
      document.querySelector('#btn-pl-gen-chapters')?.click();
      const deadline = Date.now() + 15000;
      while (pipeline.isGenerating && Date.now() < deadline) await new Promise((r) => setTimeout(r, 100));
      const vol = project.volumes[0];
      const chapters = project.chapters[vol.id] || [];
      return {
        passed: !pipeline.isGenerating && pipeline.generationStatus === 'done' && chapters.length === 1 && calls.length === 3,
        calls: calls.map((x) => ({ callNo: x.callNo, hasJsonRetryInstruction: /合法JSON/.test(x.prompt), prompt: x.prompt.slice(0, 220) })),
        chapterTitles: chapters.map((x) => x.title),
        finalStatus: pipeline.generationStatus,
        breakpointAfter: pipeline.breakpoint
      };
    } finally {
      window.fetch = original.fetch;
      project.$patch({ volumes: original.volumes, chapters: original.chapters });
      pipeline.$patch({ breakpoint: null, isGenerating: false, generationProgress: 0, generationStatus: '' });
      for (const old of original.skillFormats) {
        const current = skills.skills.find((s) => s.id === old.id);
        if (current) current.outputFormat = old.outputFormat;
      }
    }
  });
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
}

main().catch((err) => {
  console.error(err.stack || err);
  process.exitCode = 1;
}).finally(() => setTimeout(() => process.exit(process.exitCode || 0), 50));
