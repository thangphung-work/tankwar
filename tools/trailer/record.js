/**
 * QUAY CẢNH GAMEPLAY CHO TRAILER (tools/trailer/record.js)
 *
 *   node tools/trailer/record.js --map URBAN --seed 7 --sec 120 --preroll 40 --out <thư mục>
 *
 * - Máy chủ tĩnh riêng (cổng 8790+) phục vụ thư mục dự án, Chrome ẩn chạy GPU (ANGLE d3d11) điều khiển qua CDP.
 * - timewarp.js + director.js chèn vào trang trước mọi script game. Chờ dựng xong bản đồ, chạy "preroll" giây
 *   (không vẽ, không ghi) cho hai phe tiến vào giao tranh, rồi quay từng khung: __TW.frame() -> chụp màn hình JPEG
 *   -> đẩy thẳng vào ffmpeg. Hết giờ lấy dải âm thanh OfflineAudioContext -> WAV, ghép thành <out>/<tên>.mp4,
 *   kèm nhật ký sự kiện <tên>.events.json (số khung của mỗi phát bắn / phát trúng / xe bị hạ / cảnh).
 * - ffmpeg: biến môi trường FFMPEG hoặc gói ffmpeg-static.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const MAP = (arg('map', 'HIGHLAND')).toUpperCase();
const SEED = arg('seed', '20261027');
const SEC = parseFloat(arg('sec', '60'));
const PREROLL = parseFloat(arg('preroll', '40'));
const FPS = parseFloat(arg('fps', '30'));
const W = parseInt(arg('w', '1920'), 10), H = parseInt(arg('h', '1080'), 10);
const OUT = path.resolve(arg('out', path.join(ROOT, 'trailer_out', 'raw')));
const NAME = arg('name', `${MAP.toLowerCase()}_${SEED}`);
const EXTRA = arg('q', '');   // tham số URL thêm, vd "shots=shell,wreck&gfx=high"
const MUSIC_END = parseFloat(arg('music', '0'));   // >0: chỉ thu nhạc, giây chuyển sang hồi kèn kết
const FFMPEG = process.env.FFMPEG || (() => { try { return require('ffmpeg-static'); } catch (e) { return 'ffmpeg'; } })();
fs.mkdirSync(OUT, { recursive: true });

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.webm': 'video/webm', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };

function server(port) {
  return new Promise((resolve, reject) => {
    const s = http.createServer((req, res) => {
      if (req.method === 'POST' && req.url.startsWith('/__save')) {
        const name = path.basename(new URL(req.url, 'http://x').searchParams.get('name') || 'out.bin');
        const chunks = [];
        req.on('data', c => chunks.push(c));
        req.on('end', () => { fs.writeFileSync(path.join(OUT, name), Buffer.concat(chunks)); res.end('{"ok":true}'); });
        return;
      }
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p === '/') p = '/index.html';
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
      fs.stat(f, (err, st) => {
        if (err || !st.isFile()) { res.writeHead(404); res.end(); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
        fs.createReadStream(f).pipe(res);
      });
    });
    s.on('error', e => e.code === 'EADDRINUSE' ? server(port + 1).then(resolve, reject) : reject(e));
    s.listen(port, '127.0.0.1', () => resolve({ s, port }));
  });
}

function chromePath() {
  const c = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'];
  return c.find(p => fs.existsSync(p));
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function getJSON(url) { for (let i = 0; i < 100; i++) { try { const r = await fetch(url); return await r.json(); } catch (e) { await sleep(200); } } throw new Error('CDP không phản hồi'); }

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.wait = new Map(); this.on = {}; ws.onmessage = (m) => this.msg(JSON.parse(m.data)); }
  msg(d) {
    if (d.id && this.wait.has(d.id)) { const w = this.wait.get(d.id); this.wait.delete(d.id); d.error ? w.rej(new Error(JSON.stringify(d.error))) : w.res(d.result); }
    else if (d.method && this.on[d.method]) this.on[d.method](d.params);
  }
  send(method, params = {}) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method, params })); return new Promise((res, rej) => this.wait.set(id, { res, rej })); }
  async eval(expr, awaitPromise = false) {
    const r = await this.send('Runtime.evaluate', { expression: expr, awaitPromise, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception ? r.exceptionDetails.exception.description : r.exceptionDetails.text);
    return r.result.value;
  }
}

(async () => {
  const { s: srv, port } = await server(8790);
  const dbg = 9300 + Math.floor(Math.random() * 400);
  const udd = fs.mkdtempSync(path.join(os.tmpdir(), 'tankwar-trailer-'));
  const chrome = spawn(chromePath(), ['--headless=new', `--remote-debugging-port=${dbg}`, `--user-data-dir=${udd}`, `--window-size=${W},${H}`,
    '--use-angle=d3d11', '--enable-gpu', '--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--enable-webgl',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    '--autoplay-policy=no-user-gesture-required', '--mute-audio', '--force-device-scale-factor=1', '--no-first-run', 'about:blank'], { stdio: 'ignore', windowsHide: true });
  const kill = () => { try { chrome.kill(); } catch (e) { /* bỏ qua */ } try { srv.close(); } catch (e) { /* bỏ qua */ } };
  process.on('SIGINT', () => { kill(); process.exit(1); });

  try {
    const list = await getJSON(`http://127.0.0.1:${dbg}/json/list`);
    const page = list.find(t => t.type === 'page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
    const cdp = new CDP(ws);
    const logF = fs.createWriteStream(path.join(OUT, NAME + '.console.log'));
    cdp.on['Runtime.consoleAPICalled'] = (p) => { if (p.type === 'error' || p.type === 'warning') logF.write(`[${p.type}] ` + p.args.map(a => a.value !== undefined ? a.value : (a.description || '')).join(' ').slice(0, 600) + '\n'); };
    cdp.on['Runtime.exceptionThrown'] = (p) => logF.write('[exception] ' + (p.exceptionDetails.exception ? p.exceptionDetails.exception.description : p.exceptionDetails.text) + '\n');
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('Network.enable');
    await cdp.send('Network.setBlockedURLs', { urls: ['*googlesyndication*', '*doubleclick*', '*google-analytics*', '*googletagmanager*'] });
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
    const src = fs.readFileSync(path.join(__dirname, 'timewarp.js'), 'utf8') + '\n;\n' + fs.readFileSync(path.join(__dirname, 'director.js'), 'utf8');
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.devBusy = true;\n' + src });
    const asec = Math.ceil(SEC + 5);
    const url = `http://127.0.0.1:${port}/index.html?lab=trailer${MUSIC_END ? '&music=1' : ''}&map=${MAP}&seed=${SEED}&fps=${FPS}&asec=${asec}${EXTRA ? '&' + EXTRA : ''}`;
    console.log('[REC] mở', url);
    await cdp.send('Page.navigate', { url });

    // chờ dựng bản đồ + xuất trận
    const t0 = Date.now();
    let lastStage = '';
    for (;;) {
      await sleep(1000);
      let st = null;
      try { st = await cdp.eval('window.__TR ? JSON.stringify({s: __TR.state, st: __TR.stage, e: __TR.err}) : null'); } catch (e) { /* trang đang nạp */ }
      st = st && JSON.parse(st);
      if (st && st.e) throw new Error('Lỗi trong trang: ' + st.e);
      if (st && st.st !== lastStage) { lastStage = st.st; console.log(`[REC] ${Math.round((Date.now() - t0) / 1000)}s · ${st.s} · ${st.st}`); }
      if (st && st.s === 'ready') break;
      if (Date.now() - t0 > 900000) throw new Error('Quá 15 phút chưa dựng xong bản đồ');
    }
    if (MUSIC_END) {
      // chỉ thu nhạc: chủ đề sảnh từ mốc 0, tới MUSIC_END giây chuyển sang hồi kèn kết, thu thêm phần đuôi
      await cdp.eval('__TW.enter()');
      await cdp.eval('Promise.resolve(__TW.startAudio()).then(() => { __TR.musicStart(); return 1; })', true);
      const N = Math.round(SEC * FPS), endF = Math.round(MUSIC_END * FPS);
      for (let i = 0; i < N; i++) {
        if (i === endF) await cdp.eval(`__TR.musicEnd(${JSON.stringify(arg('stinger', 'victory'))})`);
        await cdp.eval('__TW.frame()', true);
      }
      await cdp.eval(`__TW.finishAudio().then(b => fetch('/__save?name=${NAME}.wav', { method: 'POST', body: b })).then(r => r.ok)`, true);
      console.log('[REC] XONG nhạc ->', path.join(OUT, NAME + '.wav'));
      return;
    }
    // vài giây thời gian thật cho shader biên dịch, rồi chuyển sang đồng hồ ảo
    await sleep(4000);
    await cdp.eval('__TW.enter()');
    // preroll: chạy logic không vẽ cho hai phe áp sát nhau
    const preN = Math.round(PREROLL * FPS);
    await cdp.eval('window.__origRender = game.render; game.render = function(){}; 1');
    const tp = Date.now();
    for (let i = 0; i < preN; i++) {
      await cdp.eval('__TW.frame()', true);
      if (i % 300 === 0) console.log(`[REC] preroll ${(i / FPS).toFixed(0)}/${PREROLL}s`);
    }
    await cdp.eval('game.render = window.__origRender; 1');
    console.log(`[REC] preroll xong ${((Date.now() - tp) / 1000).toFixed(0)}s thật`);
    // vài khung vẽ cho shader còn thiếu biên dịch trước khi ghi
    for (let i = 0; i < 20; i++) await cdp.eval('__TW.frame()', true);
    console.log('[REC] âm thanh bật:', await cdp.eval('Promise.resolve(__TW.startAudio()).then(() => { __TR.recFrame0 = __TW.frameN; return String(__TR.audioOn && __TR.audioOn()); })', true));
    // kịch bản cảnh dàn dựng (chạy trong trang theo đồng hồ ảo)
    const SCRIPT = arg('script', '');
    if (SCRIPT) { await cdp.eval(fs.readFileSync(path.resolve(ROOT, SCRIPT), 'utf8') + '\n;1'); console.log('[REC] chạy kịch bản', SCRIPT); }

    const vid = path.join(OUT, NAME + '.video.mp4');
    const ff = spawn(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '15', '-pix_fmt', 'yuv420p', vid], { stdio: ['pipe', 'inherit', 'inherit'] });
    const N = Math.round(SEC * FPS);
    const tr = Date.now();
    for (let i = 0; i < N; i++) {
      await cdp.eval('__TW.frame()', true);
      const shot = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 93, optimizeForSpeed: true, captureBeyondViewport: false });
      const buf = Buffer.from(shot.data, 'base64');
      if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
      if (i % 150 === 0) {
        const el = (Date.now() - tr) / 1000;
        console.log(`[REC] ${(i / FPS).toFixed(1)}/${SEC}s · ${(el / Math.max(1, i)).toFixed(2)} s/khung · còn ~${Math.round(el / Math.max(1, i) * (N - i) / 60)} phút`);
      }
    }
    ff.stdin.end();
    await new Promise(r => ff.on('close', r));
    console.log('[REC] video xong, lấy âm thanh…');
    const events = await cdp.eval('JSON.stringify({f0: __TR.recFrame0, fps: __TW.fps, log: __TR.log})');
    fs.writeFileSync(path.join(OUT, NAME + '.events.json'), events);
    await cdp.eval(`__TW.finishAudio().then(b => fetch('/__save?name=${NAME}.wav', { method: 'POST', body: b })).then(r => r.ok)`, true);
    const wav = path.join(OUT, NAME + '.wav'), final = path.join(OUT, NAME + '.mp4');
    await new Promise((r) => spawn(FFMPEG, ['-y', '-loglevel', 'error', '-i', vid, '-i', wav, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-shortest', final], { stdio: 'inherit' }).on('close', r));
    console.log('[REC] XONG ->', final, `(${((Date.now() - t0) / 60000).toFixed(1)} phút)`);
  } catch (e) {
    console.error('[REC] LỖI', e);
    process.exitCode = 1;
  } finally { kill(); }
})();
