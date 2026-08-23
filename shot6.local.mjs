import { chromium } from 'playwright';
const out = process.argv[2];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const errs=[];
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:5210/?league=nfl', { waitUntil: 'networkidle' });
await p.waitForTimeout(2500);
await p.screenshot({ path: `${out}/nfl-scoreboard.png` });
console.log('NFL header:', (await p.locator('header').innerText()).replace(/\n/g,' | '));

const s = await b.newPage({ viewport: { width: 1440, height: 950 } });
s.on('pageerror',e=>errs.push(e.message));
await s.goto('http://localhost:5210/settings?league=nfl', { waitUntil: 'networkidle' });
await s.waitForTimeout(1200);
await s.screenshot({ path: `${out}/settings-nfl.png` });
console.log('settings URL:', await s.locator('code').first().innerText());
console.log('errors:', errs.length?errs:'none');
await b.close();
