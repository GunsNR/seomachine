#!/usr/bin/env node
/*
 * palette.mjs — pull a working colour palette out of design screenshots.
 *
 *   node palette.mjs <image> [image ...] [--n 12] [--out dir]
 *
 * Writes <out>/palette.json, <out>/palette.md and <out>/swatches.png.
 * Works on PNG, JPEG and WebP (pasted screenshots, captured tiles, downloaded
 * case-study frames). No npm packages and no Python imaging library: the images
 * are decoded by headless Chromium and clustered in OKLab, where distances track
 * what the eye sees, so near-identical greys collapse into one swatch.
 */
import {spawn, execSync} from 'node:child_process';
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';

const a=process.argv.slice(2);
const opt=(k,d)=>{const i=a.indexOf('--'+k);return i>=0?a[i+1]:d};
const N=Number(opt('n',12)), OUT=opt('out','design-ref');
const files=a.filter((x,i)=>!x.startsWith('--')&&!(i>0&&a[i-1].startsWith('--'))&&fs.existsSync(x));
if(!files.length){console.error('usage: node palette.mjs <image> [image ...] [--n 12] [--out dir]');process.exit(2)}
fs.mkdirSync(OUT,{recursive:true});

function findChrome(){
  if(process.env.CHROME&&fs.existsSync(process.env.CHROME)) return process.env.CHROME;
  for(const r of ['/opt/pw-browsers',path.join(os.homedir(),'.cache/ms-playwright')]){ if(!fs.existsSync(r)) continue;
    for(const d of fs.readdirSync(r).sort().reverse()) for(const c of ['chrome-linux/chrome','chrome-linux64/chrome']){
      const p=path.join(r,d,c); if(fs.existsSync(p)) return p}}
  for(const n of ['chromium','chromium-browser','google-chrome']){try{const p=execSync('command -v '+n,{stdio:['ignore','pipe','ignore']}).toString().trim();if(p)return p}catch{}}
  return null;
}
const chrome=findChrome(); if(!chrome){console.error('No Chromium found. Set CHROME=...');process.exit(3)}
const port=9800+Math.floor(Math.random()*150);
const proc=spawn(chrome,['--headless=new','--no-sandbox','--disable-gpu','--remote-debugging-port='+port,
  '--user-data-dir='+fs.mkdtempSync(path.join(os.tmpdir(),'dpal-')),'about:blank'],{stdio:'ignore'});
let t=null; for(let i=0;i<40&&!t;i++){await new Promise(r=>setTimeout(r,250));
  try{t=(await (await fetch('http://127.0.0.1:'+port+'/json/list')).json()).find(x=>x.type==='page')}catch{}}
if(!t){proc.kill();console.error('Chromium did not start.');process.exit(3)}
const ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise(r=>ws.addEventListener('open',r));
let id=0; const pend=new Map();
ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id)}});
const send=(method,params={})=>new Promise(r=>{const i=++id;pend.set(i,r);ws.send(JSON.stringify({id:i,method,params}))});
const ev=async x=>{const r=await send('Runtime.evaluate',{expression:x,returnByValue:true,awaitPromise:true});
  if(r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description||'eval failed'); return r.result?.result?.value};

const mime=f=>({'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif'})[path.extname(f).toLowerCase()]||'image/png';
const counts={};
for(const f of files){
  const url='data:'+mime(f)+';base64,'+fs.readFileSync(f).toString('base64');
  const bucket=await ev(`new Promise((res,rej)=>{const im=new Image();im.onload=()=>{
    const s=Math.min(1,260/Math.max(im.width,im.height)); const w=Math.max(1,Math.round(im.width*s)),h=Math.max(1,Math.round(im.height*s));
    const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');x.drawImage(im,0,0,w,h);
    const d=x.getImageData(0,0,w,h).data; const b={};
    for(let i=0;i<d.length;i+=4){ if(d[i+3]<200)continue; const k=(d[i]>>3)<<10|(d[i+1]>>3)<<5|(d[i+2]>>3); b[k]=(b[k]||0)+1 }
    res(b)};im.onerror=()=>rej('decode failed');im.src=${JSON.stringify(url)}})`).catch(e=>{console.error('skip '+f+': '+e.message);return null});
  if(bucket) for(const k in bucket) counts[k]=(counts[k]||0)+bucket[k];
}

/* ---- OKLab clustering ---- */
const lin=c=>{c/=255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4};
function oklab([r,g,b]){r=lin(r);g=lin(g);b=lin(b);
  const l=Math.cbrt(.4122214708*r+.5363325363*g+.0514459929*b),m=Math.cbrt(.2119034982*r+.6806995451*g+.1073969566*b),
        s=Math.cbrt(.0883024619*r+.2817188376*g+.6299787005*b);
  return [.2104542553*l+.7936177850*m-.0040720468*s,1.9779984951*l-2.4285922050*m+.4505937099*s,.0259040371*l+.7827717662*m-.8086757660*s]}
const total=Object.values(counts).reduce((x,y)=>x+y,0);
let clusters=Object.entries(counts).map(([k,n])=>{k=+k;const rgb=[((k>>10)&31)*8+4,((k>>5)&31)*8+4,(k&31)*8+4];return {rgb,n,lab:oklab(rgb)}})
  .sort((x,y)=>y.n-x.n).slice(0,600);
const dist=(p,q)=>Math.hypot(p[0]-q[0],(p[1]-q[1])*1.4,(p[2]-q[2])*1.4);
/* 0.018 keeps #FFFFFF apart from #F2F4F3 and one pastel tint apart from the next;
   pastel-heavy designs (wellness, recovery, kids) live on exactly those differences. */
const MERGE=Number(opt('merge',0.018));
for(let changed=true;changed;){changed=false;
  outer: for(let i=0;i<clusters.length;i++) for(let j=i+1;j<clusters.length;j++){
    if(dist(clusters[i].lab,clusters[j].lab)<MERGE){const A=clusters[i],B=clusters[j],n=A.n+B.n;
      A.rgb=A.rgb.map((v,k)=>(v*A.n+B.rgb[k]*B.n)/n); A.n=n; A.lab=oklab(A.rgb); clusters.splice(j,1); changed=true; break outer}}}
clusters.sort((x,y)=>y.n-x.n);
const hex=c=>'#'+c.map(v=>Math.round(Math.max(0,Math.min(255,v))).toString(16).padStart(2,'0')).join('').toUpperCase();
const lum=([r,g,b])=>.2126*lin(r)+.7152*lin(g)+.0722*lin(b);
const contrast=(p,q)=>{const a=lum(p),b=lum(q);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
/* Text and icon edges are blends of two big colours (ink over background). A small
   cluster lying on the line between two large ones is an edge, not a design colour. */
const big=clusters.slice(0,8);
const segDist=(c,A,B)=>{const ab=A.map((v,k)=>B[k]-v), ac=c.map((v,k)=>v-A[k]);
  const t=Math.max(0,Math.min(1,ab.reduce((s,v,k)=>s+v*ac[k],0)/(ab.reduce((s,v)=>s+v*v,0)||1)));
  return dist(c,A.map((v,k)=>v+ab[k]*t))};
const isBlend=c=>c.n/total<0.015 && big.some((A,i)=>big.some((B,j)=>j>i&&A!==c&&B!==c&&segDist(c.lab,A.lab,B.lab)<0.012));
const chromaOf=c=>Math.hypot(c.lab[1],c.lab[2]);
const kept=clusters.filter(c=>!isBlend(c));
/* Neutrals and surfaces by share; accents by salience — a button colour covers
   little of a screen but defines the brand, so small vivid clusters are kept. */
const neutralsC=kept.filter(c=>chromaOf(c)<0.03&&c.n/total>=0.004).slice(0,Math.ceil(N/2));
const tintsC=kept.filter(c=>chromaOf(c)>=0.012&&chromaOf(c)<0.06&&c.lab[0]>0.85&&c.n/total>=0.004);
const accentsC=kept.filter(c=>chromaOf(c)>=0.06&&c.n/total>=0.0005);
const pick=[...new Set([...neutralsC,...tintsC,...accentsC])].slice(0,N+6);
let top=pick.map(c=>({hex:hex(c.rgb),rgb:c.rgb.map(Math.round),share:+(c.n/total*100).toFixed(2),
  L:+c.lab[0].toFixed(3),chroma:+chromaOf(c).toFixed(3),
  kind:chromaOf(c)>=0.06?'accent':(c.lab[0]>0.85&&chromaOf(c)>=0.012?'tint':'neutral')}));

/* ---- role guesses: a starting point to confirm by eye, not a verdict ---- */
const neutral=top.filter(c=>c.kind==='neutral'), vivid=top.filter(c=>c.kind==='accent'), tints=top.filter(c=>c.kind==='tint');
const byL=[...neutral].sort((x,y)=>y.L-x.L);
const roles={};
if(byL.length){roles.background=byL.slice().sort((x,y)=>y.share-x.share).find(c=>c.L>0.85)?.hex||byL[0].hex;
  roles.surface=byL[0].hex; roles.ink=byL[byL.length-1].hex;
  const mid=byL.find(c=>c.L>0.45&&c.L<0.75); if(mid) roles.muted=mid.hex}
vivid.sort((x,y)=>y.share-x.share).forEach((c,i)=>{roles[i===0?'accent':'accent'+(i+1)]=c.hex});
tints.sort((x,y)=>y.share-x.share).forEach((c,i)=>{roles['tint'+(i+1)]=c.hex});
const inkRGB=(top.find(c=>c.hex===roles.ink)||{rgb:[0,0,0]}).rgb, bgRGB=(top.find(c=>c.hex===roles.background)||{rgb:[255,255,255]}).rgb;
top=top.map(c=>({...c,contrastOnBackground:+contrast(c.rgb,bgRGB).toFixed(2),contrastWithInk:+contrast(c.rgb,inkRGB).toFixed(2)}));

fs.writeFileSync(path.join(OUT,'palette.json'),JSON.stringify({sources:files,roles,colors:top},null,2));
const md=['# Extracted palette','',`From ${files.length} image(s). Roles are guesses from lightness and saturation — confirm them by eye against the screens.`,'',
  '| Hex | Kind | Share | Lightness | Chroma | Contrast on bg | Guessed role |','|---|---|---|---|---|---|---|',
  ...top.map(c=>`| \`${c.hex}\` | ${c.kind} | ${c.share}% | ${c.L} | ${c.chroma} | ${c.contrastOnBackground}:1 | ${Object.entries(roles).filter(([,h])=>h===c.hex).map(([r])=>r).join(', ')} |`)].join('\n');
fs.writeFileSync(path.join(OUT,'palette.md'),md);

/* ---- swatch sheet, so the palette can be checked visually ---- */
const cards=top.map(c=>`<div class="s"><i style="background:${c.hex}"></i><b>${c.hex}</b><small>${c.share}% · ${Object.entries(roles).filter(([,h])=>h===c.hex).map(([r])=>r).join(', ')||'—'}</small></div>`).join('');
await ev(`document.documentElement.innerHTML=${JSON.stringify('<head><style>body{margin:0;padding:24px;font:13px system-ui;background:#fff;color:#111}'+
  '.g{display:grid;grid-template-columns:repeat(6,1fr);gap:12px}.s{border:1px solid #ddd;border-radius:10px;overflow:hidden}'+
  '.s i{display:block;height:84px}.s b{display:block;padding:8px 10px 0;font:600 13px ui-monospace,monospace}.s small{display:block;padding:2px 10px 10px;color:#555}</style></head><body><div class="g">'+cards+'</div></body>')};1`);
await send('Emulation.setDeviceMetricsOverride',{width:960,height:Math.ceil(top.length/6)*150+48,deviceScaleFactor:1,mobile:false});
await new Promise(r=>setTimeout(r,300));
const shot=await send('Page.captureScreenshot',{format:'png'});
fs.writeFileSync(path.join(OUT,'swatches.png'),Buffer.from(shot.result.data,'base64'));
console.log(`${top.length} colours → ${OUT}/palette.json, palette.md, swatches.png`);
console.log('roles (guessed): '+Object.entries(roles).map(([r,h])=>r+'='+h).join('  '));
proc.kill(); process.exit(0);
