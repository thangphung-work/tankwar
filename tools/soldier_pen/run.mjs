// Đo độ xuyên súng - người trên soldier_lab (headless, GPU). Cần dev server đang chạy (cổng PORT, mặc định 8080).
//   node tools/soldier_pen/run.mjs [vũ khí, mặc định atr]
import { spawn } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url)), port = 9484, prof = path.join(tmpdir(), 'soldier_pen_prof'), W = process.argv[2] || 'atr';
rmSync(prof, { recursive: true, force: true });   // Chrome cache file JS theo hồ sơ: không xoá thì đo bản cũ
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disk-cache-size=1',
  `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--window-size=900,900', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws;
for (let i = 0; i < 80; i++) { try { const pg = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.type === 'page'); if (pg) { ws = new WebSocket(pg.webSocketDebuggerUrl); break; } } catch {} await sleep(200); }   // break ngay: chờ thêm thì open bắn trước khi gắn onopen, treo vô hạn
await new Promise(r => ws.onopen = r);
let id = 0; const pend = new Map();
ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 900)); return r.result?.result?.value; };
try {
  await send('Page.navigate', { url: 'http://localhost:' + (process.env.PORT || 8080) + '/soldier_lab.html' });
  for (let i = 0; i < 900; i++) { const t = await ev('document.title'); if (t && t.startsWith('READY')) break; await sleep(100); }
  await ev(readFileSync(path.join(dir, 'pen.js'), 'utf8') + `;window.__W = ${JSON.stringify(W)};0`);
  const r = await ev(readFileSync(path.join(dir, 'sweep.js'), 'utf8'));
  for (const [k, v] of Object.entries(r)) console.log(k, JSON.stringify(v));
} finally { ws.close(); chrome.kill(); }
