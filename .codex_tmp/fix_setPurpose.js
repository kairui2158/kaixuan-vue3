const fs = require('fs');
const f = 'D:/codex/novel-workshop-vue3/src/components/settings/ApiSettings.vue';
let c = fs.readFileSync(f, 'utf8');
const old = `function setPurpose(id: string, purpose: string) {
  if (purpose === 'generate') {
    if (providerStore.verifyProvider === id) {
      providerStore.setVerifyProvider('')
    }
    providerStore.setGenerateProvider(id)
  } else {
    if (providerStore.generateProvider === id) {
      providerStore.setGenerateProvider('')
    }
    providerStore.setVerifyProvider(id)
  }
}`;
const replacement = `function setPurpose(id: string, purpose: string) {
  if (purpose === 'generate') {
    if (providerStore.verifyProvider === id) {
      providerStore.setVerifyProvider('')
    }
    const prevGen = providerStore.generateProvider
    providerStore.setGenerateProvider(id)
    if (prevGen && prevGen !== id && !providerStore.verifyProvider) {
      providerStore.setVerifyProvider(prevGen)
    }
  } else {
    if (providerStore.generateProvider === id) {
      providerStore.setGenerateProvider('')
    }
    const prevVer = providerStore.verifyProvider
    providerStore.setVerifyProvider(id)
    if (prevVer && prevVer !== id && !providerStore.generateProvider) {
      providerStore.setGenerateProvider(prevVer)
    }
  }
}`;
if (c.indexOf(old) === -1) {
  console.log('[ERR] Old text not found');
  process.exit(1);
}
c = c.replace(old, replacement);
fs.writeFileSync(f, c, 'utf8');
console.log('[OK] setPurpose patched');
