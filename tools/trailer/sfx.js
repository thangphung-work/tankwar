/**
 * XUẤT ÂM THANH TRAILER (tools/trailer/sfx.js): node tools/trailer/sfx.js <thư mục ra>
 * Mở sfx.html trong Chrome ẩn, dựng từng tiếng bằng OfflineAudioContext, lưu <tên>.wav (48 kHz, stereo).
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const OUT = path.resolve(process.argv[2] || 'sfx');
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const chrome = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe')].find(p => fs.existsSync(p));

(async () => {
  const port = 9900 + Math.floor(Math.random() * 90);
  const udd = fs.mkdtempSync(path.join(os.tmpdir(), 'tankwar-sfx-'));
  const ch = spawn(chrome, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${udd}`, '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
  try {
    let list = null;
    for (let i = 0; i < 100 && !list; i++) { try { list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); } catch (e) { await sleep(200); } }
    const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
    await new Promise(r => ws.onopen = r);
    let id = 0; const wait = new Map();
    ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && wait.has(d.id)) { wait.get(d.id)(d.result || d); wait.delete(d.id); } };
    const send = (method, params = {}) => new Promise(r => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
    const ev = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.value;
    await send('Page.navigate', { url: 'file:///' + path.join(__dirname, 'sfx.html').replace(/\\/g, '/') });
    for (let k = 0; k < 50; k++) { if (await ev('document.title') === 'OK') break; await sleep(100); }
    for (const name of await ev('window.SFX_NAMES')) {
      const b64 = await ev(`renderSfx(${JSON.stringify(name)})`);
      fs.writeFileSync(path.join(OUT, name + '.wav'), Buffer.from(b64, 'base64'));
      console.log('[SFX]', name);
    }
  } finally { try { ch.kill(); } catch (e) { /* bỏ qua */ } }
})();
