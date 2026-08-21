import { chromium } from 'playwright';
const [,, path, out, y] = process.argv;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1500, height: 1150 }, deviceScaleFactor: 1 });
const p = await ctx.newPage();
p.on('pageerror', e => console.log('PAGE-ERROR:', e.message));
await p.goto('http://127.0.0.1:3000/login', { waitUntil: 'load' });
const r = await p.evaluate(async () => {
  const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'demo@ranklogicsupertool.com', password: 'supertool-demo' }) });
  return res.status;
});
console.log('login:', r);
const nav = await p.goto('http://127.0.0.1:3000' + path, { waitUntil: 'load', timeout: 40000 });
console.log(path, '->', nav.status());
if (y) await p.evaluate(yy => window.scrollTo(0, Number(yy)), y);
await p.waitForTimeout(1000);
await p.screenshot({ path: out });
await b.close();
