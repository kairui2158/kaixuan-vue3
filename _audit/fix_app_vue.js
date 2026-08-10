const fs = require('fs');
const filePath = 'D:\\codex\\novel-workshop-vue3\\src\\App.vue';
let content = fs.readFileSync(filePath, 'utf8');
let changes = [];

// BUG-1: Delete duplicate MemoryPanel/PluginMarket/DashboardModal (lines 49-51)
const dupStr = `   <MemoryPanel v-if="activePanel==='memory'" @close="activePanel=''" />
   <PluginMarket v-if="showPluginMarket" @close="showPluginMarket=false" />
   <DashboardModal v-if="showDashboard" :stats="dashboardStats" @close="showDashboard=false" />`;
if (content.includes(dupStr)) {
  content = content.replace(dupStr, '');
  changes.push('BUG-1: Removed duplicate MemoryPanel/PluginMarket/DashboardModal');
} else {
  // Try without leading spaces variation
  const dupStr2 = `<MemoryPanel v-if="activePanel==='memory'" @close="activePanel=''" />
   <PluginMarket v-if="showPluginMarket" @close="showPluginMarket=false" />
   <DashboardModal v-if="showDashboard" :stats="dashboardStats" @close="showDashboard=false" />`;
  if (content.includes(dupStr2)) {
    content = content.replace(dupStr2, '');
    changes.push('BUG-1: Removed duplicate MemoryPanel/PluginMarket/DashboardModal');
  } else {
    changes.push('BUG-1: SKIP - pattern not found');
  }
}

// BUG-2: Add :stats to DashboardModal in the app-main overlay section
const dashOld = `<DashboardModal v-if="activePanel === 'dashboard'" @close="activePanel=''" />`;
const dashNew = `<DashboardModal v-if="activePanel === 'dashboard'" :stats="dashboardStats" @close="activePanel=''" />`;
if (content.includes(dashOld)) {
  content = content.replace(dashOld, dashNew);
  changes.push('BUG-2: Added :stats prop to DashboardModal');
} else {
  changes.push('BUG-2: SKIP - pattern not found or already fixed');
}

// BUG-1b: handleNavigate - remove showPluginMarket/showDashboard branches, use activePanel
const navOld = `function handleNavigate(panel: string) {
 if (panel === 'plugin-market') {
   showPluginMarket.value = !showPluginMarket.value
   return
 }
 if (panel === 'dashboard') {
   showDashboard.value = !showDashboard.value
   return
 }
 if (activePanel.value === panel) {
    activePanel.value = ''
  } else {
    activePanel.value = panel
  }
}`;
const navNew = `function handleNavigate(panel: string) {
  if (activePanel.value === panel) {
    activePanel.value = ''
  } else {
    activePanel.value = panel
  }
}`;
if (content.includes(navOld)) {
  content = content.replace(navOld, navNew);
  changes.push('BUG-1b: handleNavigate unified to activePanel');
} else {
  changes.push('BUG-1b: SKIP - pattern not found');
}

// BUG-1c: useShortcuts onOpenPluginMarket - use handleNavigate
const scOld = `  onOpenPluginMarket: () => showPluginMarket.value = true,`;
const scNew = `  onOpenPluginMarket: () => handleNavigate('plugin-market'),`;
if (content.includes(scOld)) {
  content = content.replace(scOld, scNew);
  changes.push('BUG-1c: useShortcuts onOpenPluginMarket uses handleNavigate');
} else {
  changes.push('BUG-1c: SKIP - pattern not found');
}

// BUG-1d: Remove showPluginMarket and showDashboard variable declarations
const varOld = `const showPluginMarket = ref(false)
const showDashboard = ref(false)
`;
if (content.includes(varOld)) {
  content = content.replace(varOld, '');
  changes.push('BUG-1d: Removed showPluginMarket/showDashboard declarations');
} else {
  changes.push('BUG-1d: SKIP - pattern not found');
}

// BUG-4: BreadcrumbBar home text - will be fixed in BreadcrumbBar.vue separately
changes.push('BUG-4: Will fix in BreadcrumbBar.vue separately');

// BUG-5: Move panel-backdrop outside app-body
const backdropOld = `       <div class="panel-backdrop" v-if="activePanel" @click="activePanel=''">`;
// This needs to move from inside app-body to inside main but outside app-body
// For now just note it - needs careful template restructuring
changes.push('BUG-5: panel-backdrop position - needs template restructuring');

// BUG-14: statusbar - add id and status-cursor span
const sbOld = `    <div class="statusbar">
      <span></span>
      <span>{{ providerStore.activeGenerateProvider ? '已连接' : '未连接' }}</span>
      <span>{{ selectedModel || '自动' }}</span>
      <span>{{ editorStore.activeTab?.title || '' }}</span>
      <span>字数: {{ editorStore.activeTab?.content?.length || 0 }}</span>
    </div>`;
const sbNew = `    <div id="statusbar" class="statusbar">
      <span id="status-cursor"></span>
      <span id="status-connection">{{ providerStore.activeGenerateProvider ? '已连接' : '未连接' }}</span>
      <span id="status-model">{{ selectedModel || '自动' }}</span>
      <span id="status-chapter">{{ editorStore.activeTab?.title || '' }}</span>
      <span id="status-words">字数: {{ editorStore.activeTab?.content?.length || 0 }}</span>
    </div>`;
if (content.includes(sbOld)) {
  content = content.replace(sbOld, sbNew);
  changes.push('BUG-14: statusbar got id and status-cursor span');
} else {
  changes.push('BUG-14: SKIP - pattern not found');
}

// BUG-15: Remove ContextMenu from App.vue (ChapterTree has its own internal ctx-menu)
const ctxOld = `    <ContextMenu :visible="ctxMenu.visible" :x="ctxMenu.x" :y="ctxMenu.y" :nodeId="ctxMenu.nodeId" :volumeId="ctxMenu.volumeId" @close="ctxMenu.visible=false" @action="handleCtxAction" />`;
if (content.includes(ctxOld)) {
  content = content.replace(ctxOld, '');
  changes.push('BUG-15: Removed duplicate ContextMenu from App.vue');
} else {
  changes.push('BUG-15: SKIP - pattern not found');
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('[OK] App.vue fixed');
changes.forEach(c => console.log('  - ' + c));
