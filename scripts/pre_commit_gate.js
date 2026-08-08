var {execSync}=require("child_process");
var fs=require("fs");
var path=require("path");
var PROJECT_ROOT=path.resolve(__dirname,"..");
var GATE_RULES_PATH=path.join(PROJECT_ROOT,"GATE_RULES.json");
var LOG_PATH=path.join(PROJECT_ROOT,"logs","gate.log");
var RESIDUE_KEYWORDS=["sk-IuR4","temp_","demo_","example_","old_","backup_","待删除","占位数据","示例数据"];
var LESSON55_STYLECSS_MIN_LINES=7000;
var LESSON57_FORBIDDEN_DELETE_FILES=["style.css","renderer.html","panels.js","renderer_v2.js"];
var LESSON64_TOAST_MIN_ZINDEX=9999;
function appendLog(msg){var ts=new Date().toISOString();var line="["+ts+"] "+msg+"\n";fs.appendFileSync(LOG_PATH,line,"utf8")}
function checkSource(){
  var errors=[];
  var files=[path.join(PROJECT_ROOT,"renderer_v2.js"),path.join(PROJECT_ROOT,"panels.js"),path.join(PROJECT_ROOT,"renderer.html")];
  var jsDir=path.join(PROJECT_ROOT,"js");
  if(fs.existsSync(jsDir)){var jsFiles=fs.readdirSync(jsDir);for(var i=0;i<jsFiles.length;i++){if(jsFiles[i].endsWith(".js"))files.push(path.join(jsDir,jsFiles[i]))}}
  for(var i=0;i<files.length;i++){
    if(!fs.existsSync(files[i]))continue;
    var c=fs.readFileSync(files[i],"utf8");
    var rel=path.relative(PROJECT_ROOT,files[i]);
    var lines=c.split("\n");
    for(var li=0;li<lines.length;li++){
      var line=lines[li];
      var trimmed=line.trim();
      if(trimmed.indexOf("//")===0)continue;
      for(var k=0;k<RESIDUE_KEYWORDS.length;k++){
        if(line.indexOf(RESIDUE_KEYWORDS[k])>=0){
          errors.push({file:rel,line:li+1,rule:"data_residue",detail:"keyword="+RESIDUE_KEYWORDS[k]});
        }
      }
      if(/[\ufffd]/.test(line)&&line.indexOf("charset")<0){
        errors.push({file:rel,line:li+1,rule:"ui_anomaly",detail:"mojibake character"});
      }
    }
  }
  return errors;
}
function checkLesson57StyleCssIntegrity(){
  var errors=[];
  var stylePath=path.join(PROJECT_ROOT,"style.css");
  if(!fs.existsSync(stylePath)){
    errors.push({file:"style.css",line:0,rule:"lesson57_stylecss_deleted",detail:"style.css was deleted - LESSON#57 violation: BASE layer must not be removed"});
    return errors;
  }
  var c=fs.readFileSync(stylePath,"utf8");
  var lineCount=c.split("\n").length;
  if(lineCount<LESSON55_STYLECSS_MIN_LINES){
    errors.push({file:"style.css",line:0,rule:"lesson57_stylecss_shrunk",detail:"style.css only "+lineCount+" lines (min "+LESSON55_STYLECSS_MIN_LINES+") - possible BASE layer deletion"});
  }
  return errors;
}
function checkRule19CssBraceBalance(){
  var errors=[];
  var stylePath=path.join(PROJECT_ROOT,"style.css");
  if(!fs.existsSync(stylePath))return errors;
  var c=fs.readFileSync(stylePath,"utf8");
  var depth=0,maxNest=0;
  for(var i=0;i<c.length;i++){if(c[i]==="{"){depth++;if(depth>maxNest)maxNest=depth}else if(c[i]==="}"){depth--}}
  if(depth!==0){
    errors.push({file:"style.css",line:0,rule:"rule19_brace_unbalanced",detail:"CSS brace depth="+depth+" (must be 0) - RULE19 violation"});
  }
  return errors;
}
function checkLesson64ToastZIndex(){
  var errors=[];
  var stylePath=path.join(PROJECT_ROOT,"style.css");
  if(!fs.existsSync(stylePath))return errors;
  var c=fs.readFileSync(stylePath,"utf8");
  var lines=c.split("\n");
  var inNotyf=false,hasZIndex=false,zValue=0,blockStart=0;
  for(var i=0;i<lines.length;i++){
    var l=lines[i];
    if(l.indexOf(".notyf")>=0||l.indexOf("#notyf")>=0){inNotyf=true;blockStart=i+1;hasZIndex=false;zValue=0}
    if(inNotyf){
      var m=l.match(/z-index\s*:\s*(\d+)/);
      if(m){hasZIndex=true;zValue=parseInt(m[1],10)}
      if(l.indexOf("}")>=0){
        if(hasZIndex&&zValue<LESSON64_TOAST_MIN_ZINDEX){
          errors.push({file:"style.css",line:blockStart,rule:"lesson64_toast_zindex",detail:"notyf z-index="+zValue+" < "+LESSON64_TOAST_MIN_ZINDEX+" - toast will be covered by modals"});
        }
        inNotyf=false;
      }
    }
  }
  return errors;
}
function checkLesson61NoDuplicateVerifyScripts(){
  var errors=[];
  var rootFiles=fs.readdirSync(PROJECT_ROOT);
  var verifyUis=rootFiles.filter(function(f){return /^verify_ui/.test(f)&&f.endsWith(".js")});
  if(verifyUis.length>1){
    errors.push({file:"root",line:0,rule:"lesson61_script_pileup",detail:"verify_ui*.js has "+verifyUis.length+" versions ("+verifyUis.join(", ")+") - LESSON#61: delete old versions before adding new"});
  }
  return errors;
}
function checkLesson58ReasoningContent(){
  var errors=[];
  var files=[path.join(PROJECT_ROOT,"renderer_v2.js"),path.join(PROJECT_ROOT,"panels.js")];
  var foundInApiGenerate=false;
  for(var i=0;i<files.length;i++){
    if(!fs.existsSync(files[i]))continue;
    var c=fs.readFileSync(files[i],"utf8");
    if(c.indexOf("apiGenerate")>=0&&c.indexOf("reasoning_content")>=0){
      foundInApiGenerate=true;
    }
  }
  if(!foundInApiGenerate){
    errors.push({file:"renderer_v2.js/panels.js",line:0,rule:"lesson58_reasoning_content",detail:"No file with apiGenerate definition parses reasoning_content - LESSON#58"});
  }
  return errors;
}
function checkLesson59AgentInjection(){
  var errors=[];
  var pPath=path.join(PROJECT_ROOT,"panels.js");
  if(!fs.existsSync(pPath))return errors;
  var c=fs.readFileSync(pPath,"utf8");
  var lines=c.split("\n");
  for(var i=0;i<lines.length;i++){
    var l=lines[i];
    if(l.indexOf("apiGenerate")>=0&&l.indexOf("function")<0&&l.indexOf("//")<0){
      var nextLine=i+1<lines.length?lines[i+1]:"";
      if(l.indexOf("opts")<0&&nextLine.indexOf("opts")<0&&l.indexOf("agentId")<0&&l.indexOf("skillId")<0){
        var rel=path.relative(PROJECT_ROOT,pPath);
        errors.push({file:rel,line:i+1,rule:"lesson59_agent_injection",detail:"apiGenerate call without opts/agentId/skillId - LESSON#59: data exists but execution doesn't use it"});
      }
    }
  }
  return errors;
}
function checkJsSyntaxNodeCheck(){
  var errors=[];
  var files=[path.join(PROJECT_ROOT,"renderer_v2.js"),path.join(PROJECT_ROOT,"panels.js"),path.join(PROJECT_ROOT,"main.js"),path.join(PROJECT_ROOT,"preload.js")];
  var jsDir=path.join(PROJECT_ROOT,"js");
  if(fs.existsSync(jsDir)){var jsFiles=fs.readdirSync(jsDir);for(var i=0;i<jsFiles.length;i++){if(jsFiles[i].endsWith(".js"))files.push(path.join(jsDir,jsFiles[i]))}}
  for(var i=0;i<files.length;i++){
    if(!fs.existsSync(files[i]))continue;
    var rel=path.relative(PROJECT_ROOT,files[i]);
    try{
      execSync("node --check \""+files[i]+"\"",{stdio:"pipe",timeout:10000});
    }catch(e){
      errors.push({file:rel,line:0,rule:"syntax_node_check",detail:"node --check failed"});
    }
  }
  return errors;
}
function checkBackupDirExists(){
  var errors=[];
  var bPath=path.join(PROJECT_ROOT,"BACKUP");
  if(!fs.existsSync(bPath)){
    errors.push({file:"BACKUP/",line:0,rule:"rule16_backup_missing",detail:"BACKUP/ directory not found - RULE16: must backup before any modification"});
  }
  return errors;
}
function checkUiAudit(){
  var errors=[];
  var auditPath=path.join(PROJECT_ROOT,"tests","scripts","audit_ui.js");
  if(!fs.existsSync(auditPath)){
    errors.push({file:"tests/scripts/audit_ui.js",line:0,rule:"audit_script_missing",detail:"UI audit script not found"});
    return errors;
  }
  try{
    var out=execSync("node \""+auditPath+"\"",{stdio:"pipe",timeout:30000,encoding:"utf8"});
    var lines=out.split("\n");
    var summary=lines.filter(function(l){return l.indexOf("AUDIT SUMMARY")>=0})[0];
    var failLine=lines.filter(function(l){return l.indexOf("Fail:")>=0})[0];
    if(failLine){
      var m=failLine.match(/Fail:\s*(\d+)/);
      if(m&&parseInt(m[1],10)>0){
        var failItems=lines.filter(function(l){return l.indexOf("[FAIL]")>=0});
        var detail=failItems.map(function(l){return l.replace(/\[FAIL\]\s*/,"").trim()}).join("; ");
        errors.push({file:"tests/scripts/audit_ui.js",line:0,rule:"ui_audit_fail",detail:"UI audit found "+m[1]+" missing handler(s): "+detail});
      }
    }
  }catch(e){
    var stderr=e.stderr?e.stderr.toString():"";
    var stdout=e.stdout?e.stdout.toString():"";
    var allOutput=stdout+"\n"+stderr;
    var failItems=allOutput.split("\n").filter(function(l){return l.indexOf("[FAIL]")>=0});
    if(failItems.length>0){
      var detail=failItems.map(function(l){return l.replace(/\[FAIL\]\s*/,"").trim()}).join("; ");
      errors.push({file:"tests/scripts/audit_ui.js",line:0,rule:"ui_audit_fail",detail:"UI audit found "+failItems.length+" missing handler(s): "+detail});
    }else{
      errors.push({file:"tests/scripts/audit_ui.js",line:0,rule:"ui_audit_error",detail:"UI audit script error: "+(e.message||"").substring(0,200)});
    }
  }
  return errors;
}
function checkGateRules(){var errors=[];if(!fs.existsSync(GATE_RULES_PATH)){errors.push({file:"GATE_RULES.json",line:0,rule:"gate_rules",detail:"GATE_RULES.json not found, run generate_gate_rules.js first"})}return errors}
function main(){
  console.log("[GATE] Pre-commit gate check starting...");
  if(!fs.existsSync(path.join(PROJECT_ROOT,"logs"))){fs.mkdirSync(path.join(PROJECT_ROOT,"logs"),{recursive:true})}
  appendLog("[GATE] Pre-commit check started");
  var errors=[];
  errors=errors.concat(checkGateRules());
  errors=errors.concat(checkSource());
  errors=errors.concat(checkLesson57StyleCssIntegrity());
  errors=errors.concat(checkRule19CssBraceBalance());
  errors=errors.concat(checkLesson64ToastZIndex());
  errors=errors.concat(checkLesson61NoDuplicateVerifyScripts());
  errors=errors.concat(checkLesson58ReasoningContent());
  errors=errors.concat(checkLesson59AgentInjection());
  errors=errors.concat(checkJsSyntaxNodeCheck());
  errors=errors.concat(checkBackupDirExists());
  errors=errors.concat(checkUiAudit());
  if(errors.length>0){
    console.log("[GATE] BLOCKED - "+errors.length+" issue(s) found");
    for(var i=0;i<errors.length;i++){var e=errors[i];console.log("  ["+e.rule+"] "+e.file+":"+e.line+" - "+e.detail);appendLog("[GATE] BLOCKED "+e.file+":"+e.line+" "+e.rule+" "+e.detail)}
    appendLog("[GATE] RESULT: BLOCKED ("+errors.length+" issues)");
    process.exit(1);
  }else{
    console.log("[GATE] PASS - No issues found");
    appendLog("[GATE] RESULT: PASS (0 issues)");
    process.exit(0);
  }
}
main();
