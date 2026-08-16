const fs = require('fs');
const path = 'D:/codex/novel-workshop-vue3/src/services/pipeline-manager.js';
let content = fs.readFileSync(path, 'utf8');

if (content.includes('App.prototype._addSettingsItem')) {
  console.log('_addSettingsItem already exists, skipping');
} else {
  const append = `

// --- Ported from panels.js ---

App.prototype._addSettingsItem = function(cat) {
  var self = this;
  var container = document.getElementById("sc-items-list");
  var html = "<div class=\\"sc-item-form\\"><h4>\\u65b0\\u589e\\u6761\\u76ee<\/h4><div class=\\"form-group\\"><label>\\u540d\\u79f0<\/label><input id=\\"sci-name\\" placeholder=\\"\\u6761\\u76ee\\u540d\\u79f0\\"><\/div><div class=\\"form-group\\"><label>\\u89e6\\u53d1\\u5173\\u952e\\u8bcd\\uff08\\u9017\\u53f7\\u5206\\u9694\\uff09<\/label><input id=\\"sci-trigger-keys\\" placeholder=\\"\\u5982: \\u5f20\\u4e09, \\u5f20\\u4e09\\u51fa\\u573a\\"><\/div><div id=\\"sci-attrs\\"><div class=\\"sc-attr-row\\"><input placeholder=\\"\\u5c5e\\u6027\\u540d\\" class=\\"sci-attr-key\\"><input placeholder=\\"\\u5c5e\\u6027\\u503c\\" class=\\"sci-attr-val\\"><button class=\\"btn-sm btn-secondary sc-attr-rm\\" style=\\"display:none\\">-<\/button><\/div><\/div><button class=\\"btn-sm btn-secondary\\" id=\\"btn-add-attr\\">+ \\u6dfb\\u52a0\\u5c5e\\u6027<\/button><div class=\\"form-actions\\"><button class=\\"btn-primary\\" id=\\"btn-save-item\\">\\u4fdd\\u5b58<\/button><button class=\\"btn-secondary\\" id=\\"btn-cancel-item\\">\\u53d6\\u6d88<\/button><\/div><\/div>";
  container.insertAdjacentHTML("afterbegin", html);
  container.querySelector(".sc-attr-row:first-child .sc-attr-rm").classList.remove("visible");
  document.getElementById("btn-add-item").disabled = true;
  document.getElementById("btn-add-attr").addEventListener("click", function() {
    var row = document.createElement("div");
    row.className = "sc-attr-row";
    row.innerHTML = "<input placeholder=\\"\\u5c5e\\u6027\\u540d\\" class=\\"sci-attr-key\\"><input placeholder=\\"\\u5c5e\\u6027\\u503c\\" class=\\"sci-attr-val\\"><button class=\\"btn-sm btn-secondary sc-attr-rm\\">-<\/button>";
    document.getElementById("sci-attrs").appendChild(row);
    row.querySelector(".sc-attr-rm").addEventListener("click", function() { row.remove(); });
  });
  document.getElementById("btn-save-item").addEventListener("click", function() { self._saveSettingsItem(cat, -1); });
  document.getElementById("btn-cancel-item").addEventListener("click", function() { self.renderSettingsItems(cat); });
}

App.prototype.addSelectedSkills = function(skills) {
  var self = this;
  document.querySelectorAll("#ow-skill-suggestions input:checked").forEach(function(cb) {
    var s = skills[parseInt(cb.dataset.idx)];
    if (!SkillManager.nameExists(s.name)) {
      SkillManager.create({name:s.name,description:s.description,category:s.category||"\\u5927\\u7eb2\\u4e13\\u5c5e",injectMode:s.injectMode||"system_prefix",template:s.template||"",bindTarget:{type:"project",id:self.currentProjectId||""}});
    }
  });
  self.renderBoundSkills();
}
`;
  content = content + append;
  fs.writeFileSync(path, content, 'utf8');
  console.log('Appended 2 functions to pipeline-manager.js');
}
