const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9227');
  const page = browser.contexts()[0].pages()[0];
  const state = await page.evaluate(() => {
    const pinia = document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia;
    const projectStore = pinia?._s.get('project');
    const bodyText = (document.body.innerText || '').slice(0, 1200);
    return {
      currentProjectId: projectStore?.currentProjectId,
      currentProjectName: projectStore?.currentProjectName,
      projectName: projectStore?.projectName,
      outlineTextLen: (projectStore?.outlineText || '').length,
      volumesCount: projectStore?.volumes?.length,
      chaptersKeys: projectStore?.chapters ? Object.keys(projectStore.chapters) : [],
      hasUnopenedText: bodyText.includes('未打开项目'),
      domProjectName: document.querySelector('#current-project-name .project-name, .tree-header .project-name')?.textContent?.trim() || '',
      treeHeaderText: document.querySelector('#current-project-name')?.textContent?.trim() || '',
      bodyStart: bodyText.slice(0, 300)
    };
  });
  console.log(JSON.stringify(state, null, 2));
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
