const fs = require('fs');
const path = require('path');

function read(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch(e) { return null; }
}

const base = 'D:/codex/novel-workshop-vue3/src';
const oldBase = 'C:/Users/凯瑞/Documents/New project 2';
const oldHtml = read(path.join(oldBase, 'renderer.html'));

// ChapterTree.vue full template
const ct = read(path.join(base, 'components/sidebar/ChapterTree.vue'));
if (ct) {
  console.log('=== ChapterTree.vue template section ===');
  const tplStart = ct.indexOf('<template>');
  const tplEnd = ct.indexOf('</template>');
  if (tplStart >= 0 && tplEnd >= 0) {
    const tpl = ct.substring(tplStart, tplEnd + 11);
    console.log(tpl);
  }
  
  console.log('\n=== ChapterTree.vue script (first 3000 chars) ===');
  const scrStart = ct.indexOf('<script');
  if (scrStart >= 0) {
    console.log(ct.substring(scrStart, scrStart + 3000));
  }
}

// Old arch: extract project-modal, new-project-modal, volume-modal HTML
if (oldHtml) {
  console.log('\n=== Old arch: project-modal ===');
  const pmStart = oldHtml.indexOf('id="project-modal"');
  if (pmStart >= 0) {
    // Find the closing div - count divs
    let depth = 0;
    let i = pmStart;
    while (i < oldHtml.length) {
      if (oldHtml.substring(i, i+4) === '<div') depth++;
      if (oldHtml.substring(i, i+6) === '</div>') depth--;
      if (depth === 0 && i > pmStart) break;
      i++;
    }
    console.log(oldHtml.substring(pmStart, i + 6));
  }
  
  console.log('\n=== Old arch: new-project-modal ===');
  const npmStart = oldHtml.indexOf('id="new-project-modal"');
  if (npmStart >= 0) {
    let depth = 0;
    let i = npmStart;
    while (i < oldHtml.length) {
      if (oldHtml.substring(i, i+4) === '<div') depth++;
      if (oldHtml.substring(i, i+6) === '</div>') depth--;
      if (depth === 0 && i > npmStart) break;
      i++;
    }
    console.log(oldHtml.substring(npmStart, i + 6));
  }
  
  console.log('\n=== Old arch: volume-modal ===');
  const vmStart = oldHtml.indexOf('id="volume-modal"');
  if (vmStart >= 0) {
    let depth = 0;
    let i = vmStart;
    while (i < oldHtml.length) {
      if (oldHtml.substring(i, i+4) === '<div') depth++;
      if (oldHtml.substring(i, i+6) === '</div>') depth--;
      if (depth === 0 && i > vmStart) break;
      i++;
    }
    console.log(oldHtml.substring(vmStart, i + 6));
  }
}

// Old arch: context-menu and skill-bind-modal
if (oldHtml) {
  console.log('\n=== Old arch: context-menu ===');
  const cmStart = oldHtml.indexOf('id="context-menu"');
  if (cmStart >= 0) {
    console.log(oldHtml.substring(cmStart, cmStart + 500));
  }
  console.log('\n=== Old arch: skill-bind-modal ===');
  const sbmStart = oldHtml.indexOf('id="skill-bind-modal"');
  if (sbmStart >= 0) {
    let depth = 0;
    let i = sbmStart;
    while (i < oldHtml.length) {
      if (oldHtml.substring(i, i+4) === '<div') depth++;
      if (oldHtml.substring(i, i+6) === '</div>') depth--;
      if (depth === 0 && i > sbmStart) break;
      i++;
    }
    console.log(oldHtml.substring(sbmStart, i + 6));
  }
}

// Old arch: statusbar
if (oldHtml) {
  console.log('\n=== Old arch: statusbar ===');
  const sbStart = oldHtml.indexOf('id="statusbar"');
  if (sbStart >= 0) {
    console.log(oldHtml.substring(sbStart, sbStart + 300));
  }
}

// Old arch: find-replace-bar
if (oldHtml) {
  console.log('\n=== Old arch: find-replace-bar ===');
  const frbStart = oldHtml.indexOf('id="find-replace-bar"');
  if (frbStart >= 0) {
    console.log(oldHtml.substring(frbStart, frbStart + 600));
  }
}

// Old arch: chat-context-bar
if (oldHtml) {
  console.log('\n=== Old arch: chat-context-bar ===');
  const ccbStart = oldHtml.indexOf('id="chat-context-bar"');
  if (ccbStart >= 0) {
    console.log(oldHtml.substring(ccbStart, ccbStart + 200));
  }
}

// Old arch: skill-area
if (oldHtml) {
  console.log('\n=== Old arch: skill-area ===');
  const saStart = oldHtml.indexOf('id="skill-area"');
  if (saStart >= 0) {
    console.log(oldHtml.substring(saStart, saStart + 600));
  }
}

// Old arch: dashboard modal
if (oldHtml) {
  console.log('\n=== Old arch: dashboard ===');
  const dbStart = oldHtml.indexOf('id="dashboard-modal"');
  if (dbStart >= 0) {
    let depth = 0;
    let i = dbStart;
    while (i < oldHtml.length) {
      if (oldHtml.substring(i, i+4) === '<div') depth++;
      if (oldHtml.substring(i, i+6) === '</div>') depth--;
      if (depth === 0 && i > dbStart) break;
      i++;
    }
    console.log(oldHtml.substring(dbStart, i + 6));
  } else {
    console.log('Not found: dashboard-modal');
    // Search for dashboard
    const dStart = oldHtml.indexOf('dashboard');
    if (dStart >= 0) console.log('Found dashboard at:', dStart, oldHtml.substring(dStart, dStart+100));
  }
}

// Old arch: panel-backdrop
if (oldHtml) {
  console.log('\n=== Old arch: panel-backdrop ===');
  const pbStart = oldHtml.indexOf('panel-backdrop');
  if (pbStart >= 0) {
    console.log(oldHtml.substring(pbStart, pbStart + 200));
  } else {
    console.log('Not found: panel-backdrop');
  }
}

// Old arch: token-bar
if (oldHtml) {
  console.log('\n=== Old arch: token-bar ===');
  const tbStart = oldHtml.indexOf('id="token-bar"');
  if (tbStart >= 0) {
    console.log(oldHtml.substring(tbStart, tbStart + 200));
  }
}

// Old arch: input-hint
if (oldHtml) {
  console.log('\n=== Old arch: input-hint ===');
  const ihStart = oldHtml.indexOf('class="input-hint"');
  if (ihStart >= 0) {
    console.log(oldHtml.substring(ihStart, ihStart + 300));
  }
}

// Old arch: editor-mode-badge
if (oldHtml) {
  console.log('\n=== Old arch: editor-mode-badge ===');
  const embStart = oldHtml.indexOf('id="editor-mode-badge"');
  if (embStart >= 0) {
    console.log(oldHtml.substring(embStart, embStart + 100));
  }
}

// Old arch: agent-select-chat
if (oldHtml) {
  console.log('\n=== Old arch: agent-select-chat ===');
  const ascStart = oldHtml.indexOf('id="agent-select-chat"');
  if (ascStart >= 0) {
    console.log(oldHtml.substring(ascStart, ascStart + 200));
  }
}

// Old arch: model-select-chat
if (oldHtml) {
  console.log('\n=== Old arch: model-select-chat ===');
  const mscStart = oldHtml.indexOf('id="model-select-chat"');
  if (mscStart >= 0) {
    console.log(oldHtml.substring(mscStart, mscStart + 200));
  }
}

// Old arch: chat-context-bar content
if (oldHtml) {
  console.log('\n=== Old arch: chat-context-bar content ===');
  const ccbStart = oldHtml.indexOf('id="chat-context-bar"');
  if (ccbStart >= 0) {
    console.log(oldHtml.substring(ccbStart, ccbStart + 200));
  }
}

// Old arch: config-status
if (oldHtml) {
  console.log('\n=== Old arch: config-status ===');
  const csStart = oldHtml.indexOf('id="config-status"');
  if (csStart >= 0) {
    console.log(oldHtml.substring(csStart, csStart + 200));
  }
}

// Old arch: char-count
if (oldHtml) {
  console.log('\n=== Old arch: char-count ===');
  const ccStart = oldHtml.indexOf('id="char-count"');
  if (ccStart >= 0) {
    console.log(oldHtml.substring(ccStart, ccStart + 100));
  }
}

// Old arch: token-count
if (oldHtml) {
  console.log('\n=== Old arch: token-count ===');
  const tcStart = oldHtml.indexOf('id="token-count"');
  if (tcStart >= 0) {
    console.log(oldHtml.substring(tcStart, tcStart + 100));
  }
}

// Old arch: export-dropdown
if (oldHtml) {
  console.log('\n=== Old arch: export-dropdown ===');
  const edStart = oldHtml.indexOf('id="export-dropdown"');
  if (edStart >= 0) {
    console.log(oldHtml.substring(edStart, edStart + 300));
  }
}

// Old arch: messages-container
if (oldHtml) {
  console.log('\n=== Old arch: messages-container ===');
  const mcStart = oldHtml.indexOf('id="messages-container"');
  if (mcStart >= 0) {
    console.log(oldHtml.substring(mcStart, mcStart + 300));
  }
}

// Old arch: messages-list
if (oldHtml) {
  console.log('\n=== Old arch: messages-list ===');
  const mlStart = oldHtml.indexOf('id="messages-list"');
  if (mlStart >= 0) {
    console.log(oldHtml.substring(mlStart, mlStart + 300));
  }
}

// Old arch: chat-empty-state
if (oldHtml) {
  console.log('\n=== Old arch: chat-empty-state ===');
  const cesStart = oldHtml.indexOf('id="chat-empty-state"');
  if (cesStart >= 0) {
    console.log(oldHtml.substring(cesStart, cesStart + 300));
  }
}

// Old arch: tree-body
if (oldHtml) {
  console.log('\n=== Old arch: tree-body ===');
  const tbStart = oldHtml.indexOf('id="tree-body"');
  if (tbStart >= 0) {
    console.log(oldHtml.substring(tbStart, tbStart + 300));
  }
}

// Old arch: current-project-name
if (oldHtml) {
  console.log('\n=== Old arch: current-project-name ===');
  const cpnStart = oldHtml.indexOf('id="current-project-name"');
  if (cpnStart >= 0) {
    console.log(oldHtml.substring(cpnStart, cpnStart + 100));
  }
}

// Old arch: btn-tree-gen
if (oldHtml) {
  console.log('\n=== Old arch: btn-tree-gen ===');
  const btgStart = oldHtml.indexOf('id="btn-tree-gen"');
  if (btgStart >= 0) {
    console.log(oldHtml.substring(btgStart, btgStart + 200));
  }
}

// Old arch: btn-open-project
if (oldHtml) {
  console.log('\n=== Old arch: btn-open-project ===');
  const bopStart = oldHtml.indexOf('id="btn-open-project"');
  if (bopStart >= 0) {
    console.log(oldHtml.substring(bopStart, bopStart + 200));
  }
}

// Old arch: resizer-chapter
if (oldHtml) {
  console.log('\n=== Old arch: resizer-chapter ===');
  const rcStart = oldHtml.indexOf('id="resizer-chapter"');
  if (rcStart >= 0) {
    console.log(oldHtml.substring(rcStart, rcStart + 100));
  }
}

// Old arch: resizer-editor-chat
if (oldHtml) {
  console.log('\n=== Old arch: resizer-editor-chat ===');
  const recStart = oldHtml.indexOf('id="resizer-editor-chat"');
  if (recStart >= 0) {
    console.log(oldHtml.substring(recStart, recStart + 100));
  }
}

// Old arch: theme-toggle-btn
if (oldHtml) {
  console.log('\n=== Old arch: theme-toggle-btn ===');
  const ttbStart = oldHtml.indexOf('id="theme-toggle-btn"');
  if (ttbStart >= 0) {
    console.log(oldHtml.substring(ttbStart, ttbStart + 200));
  }
}

// Old arch: btn-dashboard
if (oldHtml) {
  console.log('\n=== Old arch: btn-dashboard ===');
  const bdStart = oldHtml.indexOf('id="btn-dashboard"');
  if (bdStart >= 0) {
    console.log(oldHtml.substring(bdStart, bdStart + 200));
  }
}

// Old arch: word-count (editor)
if (oldHtml) {
  console.log('\n=== Old arch: word-count (editor) ===');
  const wcStart = oldHtml.indexOf('id="word-count"');
  if (wcStart >= 0) {
    console.log(oldHtml.substring(wcStart, wcStart + 100));
  }
}

// Old arch: editor-title
if (oldHtml) {
  console.log('\n=== Old arch: editor-title ===');
  const etStart = oldHtml.indexOf('id="editor-title"');
  if (etStart >= 0) {
    console.log(oldHtml.substring(etStart, etStart + 100));
  }
}

// Old arch: editor-content
if (oldHtml) {
  console.log('\n=== Old arch: editor-content ===');
  const ecStart = oldHtml.indexOf('id="editor-content"');
  if (ecStart >= 0) {
    console.log(oldHtml.substring(ecStart, ecStart + 200));
  }
}

// Old arch: find-input
if (oldHtml) {
  console.log('\n=== Old arch: find-input ===');
  const fiStart = oldHtml.indexOf('id="find-input"');
  if (fiStart >= 0) {
    console.log(oldHtml.substring(fiStart, fiStart + 100));
  }
}

// Old arch: replace-input
if (oldHtml) {
  console.log('\n=== Old arch: replace-input ===');
  const riStart = oldHtml.indexOf('id="replace-input"');
  if (riStart >= 0) {
    console.log(oldHtml.substring(riStart, riStart + 100));
  }
}

// Old arch: find-count
if (oldHtml) {
  console.log('\n=== Old arch: find-count ===');
  const fcStart = oldHtml.indexOf('id="find-count"');
  if (fcStart >= 0) {
    console.log(oldHtml.substring(fcStart, fcStart + 100));
  }
}

// Old arch: status-cursor
if (oldHtml) {
  console.log('\n=== Old arch: status-cursor ===');
  const scStart = oldHtml.indexOf('id="status-cursor"');
  if (scStart >= 0) {
    console.log(oldHtml.substring(scStart, scStart + 100));
  }
}

// Old arch: status-connection
if (oldHtml) {
  console.log('\n=== Old arch: status-connection ===');
  const scnStart = oldHtml.indexOf('id="status-connection"');
  if (scnStart >= 0) {
    console.log(oldHtml.substring(scnStart, scnStart + 100));
  }
}

// Old arch: status-model
if (oldHtml) {
  console.log('\n=== Old arch: status-model ===');
  const smStart = oldHtml.indexOf('id="status-model"');
  if (smStart >= 0) {
    console.log(oldHtml.substring(smStart, smStart + 100));
  }
}

// Old arch: status-chapter
if (oldHtml) {
  console.log('\n=== Old arch: status-chapter ===');
  const schStart = oldHtml.indexOf('id="status-chapter"');
  if (schStart >= 0) {
    console.log(oldHtml.substring(schStart, schStart + 100));
  }
}

// Old arch: status-words
if (oldHtml) {
  console.log('\n=== Old arch: status-words ===');
  const swStart = oldHtml.indexOf('id="status-words"');
  if (swStart >= 0) {
    console.log(oldHtml.substring(swStart, swStart + 100));
  }
}
