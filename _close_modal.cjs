const {chromium} = require("playwright");
(async()=>{
  const b = await chromium.connectOverCDP("http://localhost:9227");
  const p = b.contexts()[0].pages()[0];
  const closeBtn = await p.$(".project-modal-content .btn-close");
  if (closeBtn) { await closeBtn.click(); console.log("Closed"); } else { console.log("No modal found"); }
  await new Promise(r=>setTimeout(r,300));
  await b.close();
})();
