const fs = require("fs");
const file = "D:/codex/novel-workshop-vue3/src/components/settings/ApiSettings.vue";
let c = fs.readFileSync(file, "utf8");

c = c.replace(
  '<div id="provider-list-view" class="">',
  '<div id="provider-list-view" class="provider-list">'
);

fs.writeFileSync(file, c, "utf8");
console.log("A2B DONE");
