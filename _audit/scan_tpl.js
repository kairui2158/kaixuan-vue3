const fs=require("fs"),path=require("path");
const D="D:\\codex\\novel-workshop-vue3";
const gc=fs.readFileSync(D+"\\src\\styles\\global.css","utf8");
const tc=fs.readFileSync(D+"\\src\\styles\\tokens.css","utf8");
function cls(c){const s=new Set(),r=/\.([a-zA-Z_][\w-]*)/g;let m;while(m=r.exec(c))s.add(m[1]);return s}
const ga=new Set([...cls(gc),...cls(tc)]);
function tpl(f){const c=fs.readFileSync(f,"utf8"),t=c.match(/<template>([\s\S]*?)<\/template>/);if(!t)return[];const s=new Set(),r=/class="([^"]+)"/g;let m;while(m=r.exec(t[1]))m[1].split(/\s+/).forEach(x=>{const v=x.trim();if(v&&!v.includes("{")&&!v.includes("}"))s.add(v)});const r2=/:class="([^"]+)"/g;while(m=r2.exec(t[1])){const r3=/["']([a-zA-Z_][\w-]*)["']/g;let m2;while(m2=r3.exec(m[1]))s.add(m2[1])}return [...s]}
function scp(f){const c=fs.readFileSync(f,"utf8"),s=c.match(/<style[^>]*>([\s\S]*?)<\/style>/);return s?[...cls(s[1])]:[]}
const res=[];
function walk(d){fs.readdirSync(d).forEach(f=>{const p=path.join(d,f),s=fs.statSync(p);if(s.isDirectory())walk(p);else if(f.endsWith(".vue")){const t=tpl(p),sc=new Set(scp(p)),ms=t.filter(x=>!ga.has(x)&&!sc.has(x));if(ms.length)res.push({f:path.relative(D,p),ms})}})}
walk(D+"\\src\\components");
fs.writeFileSync(D+"\\_audit\\template_class_gaps.json",JSON.stringify(res,null,2));
console.log(JSON.stringify(res,null,2));
console.log("Files with gaps:",res.length,"Total missing:",res.reduce((s,r)=>s+r.ms.length,0));
