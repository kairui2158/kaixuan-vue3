var fs=require("fs");
var path=require("path");
var PROJECT_ROOT=path.resolve(__dirname,"..");
var SCAN_EXTENSIONS=[".js",".html",".css"];
var SKIP_DIRS=["node_modules",".git","BACKUP","test_evidence","tests","analysis","lessons","memory",".agents",".codex","scripts"];
var RESIDUE_KEYWORDS=["sk-IuR4","temp_","demo_","example_","old_","backup_","待删除","占位数据","示例数据"];
function scanDir(dir){var r=[];try{var e=fs.readdirSync(dir,{withFileTypes:true})}catch(x){return r}for(var i=0;i<e.length;i++){var f=path.join(dir,e[i].name);if(e[i].isDirectory()){if(SKIP_DIRS.indexOf(e[i].name)>=0)continue;r=r.concat(scanDir(f))}else{var ext=path.extname(e[i].name);if(SCAN_EXTENSIONS.indexOf(ext)>=0)r.push(f)}}return r}
function scanFile(fp){var c=fs.readFileSync(fp,"utf8");var ln=c.split("\n");var rel=path.relative(PROJECT_ROOT,fp);var iss={residue:[],ui:[],state:[],api:[]};
for(var i=0;i<ln.length;i++){
  var line=ln[i];var loc=rel+":"+(i+1);var trimmed=line.trim();
  if(trimmed.indexOf("//")===0)continue;
  for(var k=0;k<RESIDUE_KEYWORDS.length;k++){
    if(line.indexOf(RESIDUE_KEYWORDS[k])>=0){
      if(rel.indexOf("gate")>=0||rel.indexOf("GATE")>=0)continue;
      iss.residue.push(loc+" kw="+RESIDUE_KEYWORDS[k]);
    }
  }
  if(line.indexOf("innerHTML")>=0&&line.indexOf("+")>=0&&line.indexOf("_escHtml")<0&&line.indexOf("escape")<0){
    if(/innerHTML\s*=.*\+.*\.(name|title|content|value|text)\b/.test(line)){iss.ui.push(loc+" raw innerHTML")}
  }
  if(/[\ufffd]/.test(line)&&line.indexOf("charset")<0){iss.ui.push(loc+" mojibake")}
  if(/isLocked\s*[:=]\s*true/.test(line)||/isComplete\s*[:=]\s*true/.test(line)){iss.state.push(loc+" locked/complete=true")}
  if(/catch\s*\(/.test(line)){var cb=ln.slice(i,Math.min(i+5,ln.length)).join(" ");if(cb.indexOf("console.log")>=0&&cb.indexOf("throw")<0&&cb.indexOf("_toast")<0&&cb.indexOf("showToast")<0&&cb.indexOf("reject")<0){iss.api.push(loc+" catch-only-console.log")}}
}
return iss}
function main(){
  console.log("[GATE] Scanning...");
  var files=scanDir(PROJECT_ROOT);
  console.log("[GATE] "+files.length+" files");
  var aR=[],aU=[],aS=[],aA=[];
  for(var i=0;i<files.length;i++){var iss=scanFile(files[i]);aR=aR.concat(iss.residue);aU=aU.concat(iss.ui);aS=aS.concat(iss.state);aA=aA.concat(iss.api)}
  var rules={version:"1.0",generatedAt:new Date().toISOString(),rules:{data_residue:aR,ui_anomalies:aU,state_inconsistency:aS,api_error_handling:aA}};
  fs.writeFileSync(path.join(PROJECT_ROOT,"GATE_RULES.json"),JSON.stringify(rules,null,2),"utf8");
  console.log("[GATE] Done. residue="+aR.length+" ui="+aU.length+" state="+aS.length+" api="+aA.length);
}
main();
