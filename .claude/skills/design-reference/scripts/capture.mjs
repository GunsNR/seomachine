#!/usr/bin/env node
/*
 * capture.mjs — render a design reference page (Behance, Dribbble, a live site)
 * in headless Chromium and save what a designer would look at:
 *
 *   out/tiles/tile-NN.png   the full page, cut into readable viewport-sized tiles
 *   out/images/NN.<ext>     every large image on the page, downloaded (case-study frames)
 *   out/manifest.json       title, image list, text headings, and any blocked hosts
 *
 * Usage:  node capture.mjs <url> [out-dir] [--width 1440] [--max-tiles 40]
 *
 * No npm packages: it drives Chromium over the DevTools protocol with Node's
 * built-in WebSocket (Node >= 22). It honours HTTPS_PROXY. It never works around
 * a network block — if the page or its image host is refused, it stops and
 * names the exact hosts that need allowing.
 */
import {spawn, execSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const args=process.argv.slice(2);
const url=args.find(a=>/^https?:\/\//.test(a));
if(!url){console.error('usage: node capture.mjs <url> [out-dir] [--width 1440] [--max-tiles 40]');process.exit(2)}
const outDir=args.find(a=>!a.startsWith('-')&&a!==url&&!/^\d+$/.test(a))||'design-ref';
const opt=(k,d)=>{const i=args.indexOf('--'+k);return i>=0?Number(args[i+1]):d};
const WIDTH=opt('width',1440), MAX_TILES=opt('max-tiles',40), VH=Math.round(WIDTH*0.66);

function findChrome(){
  if(process.env.CHROME&&fs.existsSync(process.env.CHROME)) return process.env.CHROME;
  const roots=['/opt/pw-browsers',path.join(os.homedir(),'.cache/ms-playwright')];
  for(const r of roots){ if(!fs.existsSync(r)) continue;
    for(const d of fs.readdirSync(r).sort().reverse()){
      for(const c of ['chrome-linux/chrome','chrome-linux64/chrome']){const p=path.join(r,d,c); if(fs.existsSync(p)) return p}
    }}
  for(const n of ['chromium','chromium-browser','google-chrome','google-chrome-stable']){
    try{const p=execSync('command -v '+n,{stdio:['ignore','pipe','ignore']}).toString().trim(); if(p) return p}catch{}
  }
  return null;
}
const chrome=findChrome();
if(!chrome){console.error('No Chromium found. Set CHROME=/path/to/chrome.');process.exit(3)}
if(typeof WebSocket==='undefined'){console.error('Node >= 22 is needed (built-in WebSocket).');process.exit(3)}

fs.mkdirSync(path.join(outDir,'tiles'),{recursive:true});
fs.mkdirSync(path.join(outDir,'images'),{recursive:true});
const port=9400+Math.floor(Math.random()*400);
const flags=['--headless=new','--no-sandbox','--disable-gpu','--hide-scrollbars','--remote-debugging-port='+port,
  '--user-data-dir='+fs.mkdtempSync(path.join(os.tmpdir(),'dref-')),'--window-size='+WIDTH+','+VH];
if(process.env.HTTPS_PROXY) flags.push('--proxy-server='+process.env.HTTPS_PROXY.replace(/^https?:\/\//,''));
const proc=spawn(chrome,[...flags,'about:blank'],{stdio:'ignore'});
const die=(msg,code=1)=>{try{proc.kill()}catch{} if(msg)console.error(msg); process.exit(code)};

let target=null;
for(let i=0;i<40&&!target;i++){await new Promise(r=>setTimeout(r,250));
  try{target=(await (await fetch('http://127.0.0.1:'+port+'/json/list')).json()).find(t=>t.type==='page')}catch{}}
if(!target) die('Chromium did not start.');
const ws=new WebSocket(target.webSocketDebuggerUrl); await new Promise(r=>ws.addEventListener('open',r));
let id=0; const pend=new Map(); const failed=new Map(); const docStatus={};
ws.addEventListener('message',e=>{const m=JSON.parse(e.data);
  if(m.method==='Network.loadingFailed'){const r=reqs.get(m.params.requestId); if(r){const h=new URL(r).host;
    failed.set(h,(failed.get(h)||new Set()).add(m.params.errorText))}}
  if(m.method==='Network.requestWillBeSent') reqs.set(m.params.requestId,m.params.request.url);
  if(m.method==='Network.responseReceived'&&m.params.type==='Document'&&!docStatus.code) docStatus.code=m.params.response.status;
  if(pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id)}});
const reqs=new Map();
const send=(method,params={})=>new Promise(r=>{const i=++id;pend.set(i,r);ws.send(JSON.stringify({id:i,method,params}))});
const ev=async x=>(await send('Runtime.evaluate',{expression:x,returnByValue:true,awaitPromise:true})).result?.result?.value;
const wait=ms=>new Promise(r=>setTimeout(r,ms));

await send('Network.enable'); await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride',{width:WIDTH,height:VH,deviceScaleFactor:1,mobile:false});
const nav=await send('Page.navigate',{url});
await wait(4000);
const pageHost=new URL(url).host;
/* Three different things can go wrong, and they need different answers:
   - the network policy refuses the host        -> report it; never route around it
   - Chromium does not trust the proxy's CA      -> run trust-proxy-ca.sh once
   - ERR_ABORTED on a redirect or prefetch       -> harmless; carry on           */
const hostErrs=[...(failed.get(pageHost)||[])];
const hard=e=>/TUNNEL|CERT_|PROXY|NAME_NOT_RESOLVED|CONNECTION_REFUSED|BLOCKED_BY/.test(e||'');
const navErr=nav.result?.errorText;
const why=(hard(navErr)&&navErr) || (!docStatus.code && hostErrs.find(hard)) || null;
if(why){
  const cert=/CERT_/.test(why);
  const report={url,blocked:true,kind:cert?'untrusted-proxy-ca':'network-policy',reason:why,blockedHosts:[...failed.keys()],
    advice:cert
      ? 'Chromium does not trust this environment\'s TLS proxy. Run scripts/trust-proxy-ca.sh once, then capture again.'
      : 'The environment network policy is refusing this host. Ask the person to allow it (or paste screenshots). Do not route around the block.'};
  fs.writeFileSync(path.join(outDir,'manifest.json'),JSON.stringify(report,null,2));
  if(cert) die('UNTRUSTED PROXY CERTIFICATE: '+pageHost+' — '+why+
    '\nRun: bash '+path.join(path.dirname(new URL(import.meta.url).pathname),'trust-proxy-ca.sh')+'  then capture again.',5);
  die('BLOCKED BY NETWORK POLICY: '+pageHost+' — '+why+'\nHosts that failed: '+[...failed.keys()].join(', ')+'\nSee '+path.join(outDir,'manifest.json'),4);
}
// scroll the whole page slowly so lazy-loaded case-study frames arrive
let last=0;
for(let i=0;i<120;i++){
  const h=await ev('Math.max(document.body.scrollHeight,document.documentElement.scrollHeight)');
  const y=await ev('window.scrollY+innerHeight');
  if(y>=h-2 && h===last) break;
  last=h; await ev('window.scrollBy(0,'+Math.round(VH*0.8)+')'); await wait(450);
}
await ev('window.scrollTo(0,0)'); await wait(800);

const info=await ev(`(()=>{
  const imgs=[...document.images].map(i=>{
    let best=i.currentSrc||i.src;
    if(i.srcset){const c=i.srcset.split(',').map(s=>s.trim().split(/\\s+/)).map(([u,w])=>({u,w:parseInt(w)||0})).sort((a,b)=>b.w-a.w);if(c[0]&&c[0].u)best=c[0].u}
    return {src:best,w:i.naturalWidth,h:i.naturalHeight,alt:i.alt||''};
  }).filter(i=>i.src&&!i.src.startsWith('data:')&&i.w>=500);
  const seen=new Set(); const uniq=imgs.filter(i=>!seen.has(i.src)&&seen.add(i.src));
  const heads=[...document.querySelectorAll('h1,h2,h3')].map(h=>h.textContent.trim()).filter(Boolean).slice(0,60);
  const text=(document.body.innerText||'').slice(0,6000);
  return {title:document.title, images:uniq, headings:heads, text,
          height:Math.max(document.body.scrollHeight,document.documentElement.scrollHeight)};
})()`);

// tiles
const tiles=Math.min(MAX_TILES,Math.ceil(info.height/VH));
for(let t=0;t<tiles;t++){
  await ev('window.scrollTo(0,'+(t*VH)+')'); await wait(350);
  const r=await send('Page.captureScreenshot',{format:'png'});
  fs.writeFileSync(path.join(outDir,'tiles','tile-'+String(t+1).padStart(2,'0')+'.png'),Buffer.from(r.result.data,'base64'));
}
// download the large images through the page (same cookies, same proxy)
const saved=[];
for(const [n,img] of info.images.entries()){
  const b64=await ev(`fetch(${JSON.stringify(img.src)}).then(r=>r.ok?r.blob():Promise.reject(r.status)).then(b=>new Promise(res=>{const f=new FileReader();f.onload=()=>res(f.result);f.readAsDataURL(b)})).catch(e=>'ERR:'+e)`);
  if(!b64||String(b64).startsWith('ERR:')){saved.push({...img,saved:null,error:String(b64)});continue}
  const m=String(b64).match(/^data:image\/([a-z0-9+]+);base64,(.*)$/);
  if(!m){saved.push({...img,saved:null,error:'not an image'});continue}
  const ext=m[1].replace('jpeg','jpg').replace('svg+xml','svg');
  const f=path.join('images',String(n+1).padStart(2,'0')+'.'+ext);
  fs.writeFileSync(path.join(outDir,f),Buffer.from(m[2],'base64')); saved.push({...img,saved:f});
}
const manifest={url,title:info.title,capturedAt:new Date().toISOString(),viewport:[WIDTH,VH],
  pageHeight:info.height,tiles,headings:info.headings,textSample:info.text,images:saved,
  blockedHosts:Object.fromEntries([...failed].map(([h,s])=>[h,[...s]]))};
fs.writeFileSync(path.join(outDir,'manifest.json'),JSON.stringify(manifest,null,2));
const got=saved.filter(s=>s.saved).length;
console.log(`captured ${tiles} tiles and ${got}/${saved.length} images → ${outDir}`);
if(Object.keys(manifest.blockedHosts).length) console.log('hosts with failed requests: '+Object.keys(manifest.blockedHosts).join(', ')+'  (see manifest.json)');
die(null,0);
