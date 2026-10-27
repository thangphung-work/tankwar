// ======================================================
// CHẾ ĐỘ PHÁT TRIỂN (DEV) — TỰ ÁP DỤNG THAY ĐỔI KHI LƯU TỆP
// Bật bằng: npm run dev   (hoặc: node --watch server.js --dev / DEV=1)
// - Theo dõi tệp trong dự án; khi lưu:
//     + .css  -> thay stylesheet ngay trên trang, KHÔNG tải lại (giữ nguyên trận đang chơi)
//     + .js / ảnh / âm thanh / .html đang mở -> hiện nhãn "Có bản mới", bấm vào mới tải lại
// - Máy chủ khởi động lại (node --watch, khi sửa server*.js) -> cũng chỉ hiện nhãn, không tự tải lại
// - Trang HTML được chèn sẵn đoạn script /__dev/client.js, đổi ?v=... của tệp nội bộ
//   thành thời điểm sửa tệp -> không bao giờ dính bản cũ trong cache trình duyệt
// Chế độ thường (npm start) không chạy bất kỳ phần nào ở đây.
// ======================================================
const fs = require('fs');
const path = require('path');

const enabled = process.argv.includes('--dev') || process.env.DEV === '1';

const ROOT_DIR = __dirname;
const BOOT_ID = Date.now().toString(36);
// Chỉ báo các loại tệp trình duyệt dùng; bỏ qua .md, .bat, cơ sở dữ liệu...
const WATCH_EXT = /\.(html|js|css|json|png|jpe?g|gif|svg|ico|webp|wav|mp3|ogg|m4a|woff2?|ttf)$/i;
// Generated screenshots are outputs, not browser source assets. Watching them creates
// noisy change events and can cause pointless reloads while capture tools are running.
const IGNORE_DIRS = ['.git', 'node_modules', 'data', 'deploy', '.claude', 'shots', '_shots', 'logs'];
// Log khi thử game ở chế độ dev: mỗi lần mở trang = 1 tệp logs/dev/<thời điểm>_<trang>.log (lỗi console, số đo hiệu năng,
// cú khựng khung hình) -> lần sau debug đọc lại được. Chỉ giữ LOG_KEEP tệp mới nhất.
const LOG_DIR = path.join(ROOT_DIR, 'logs', 'dev');
const LOG_KEEP = 40;
const LOG_MAX_BODY = 1 << 20;
// Tệp chỉ chạy phía máy chủ: node --watch tự khởi động lại, tab tải lại theo BOOT_ID
const SERVER_ONLY = /^server[^/]*\.js$/i;
const DEBOUNCE_MS = 120;

const sseClients = new Set();
let pending = new Set();
let flushTimer = null;

function isIgnored(rel, dataDir) {
  const first = rel.split('/')[0];
  if (IGNORE_DIRS.includes(first)) return true;
  if (dataDir && path.join(ROOT_DIR, rel).toLowerCase().startsWith(dataDir.toLowerCase())) return true;
  return !WATCH_EXT.test(rel) || SERVER_ONLY.test(rel);
}

function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach(res => res.write(msg));
}

// Trình soạn thảo thường ghi 2-3 sự kiện cho 1 lần lưu -> gom lại trong DEBOUNCE_MS
function queueChange(rel) {
  pending.add(rel);
  clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    const files = [...pending];
    pending = new Set();
    console.log('[dev] Thay đổi: ' + files.join(', '));
    broadcast('change', { files, t: Date.now().toString(36) });
  }, DEBOUNCE_MS);
}

function startWatcher(dataDir) {
  const onEvent = (base) => (evt, filename) => {
    if (!filename) return;
    const rel = path.relative(ROOT_DIR, path.join(base, filename.toString())).split(path.sep).join('/');
    if (!isIgnored(rel, dataDir)) queueChange(rel);
  };
  try {
    // Windows/macOS và Node >= 20 trên Linux hỗ trợ theo dõi đệ quy
    fs.watch(ROOT_DIR, { recursive: true }, onEvent(ROOT_DIR));
  } catch (e) {
    // Node cũ trên Linux: theo dõi từng thư mục một
    const walk = (dir) => {
      fs.watch(dir, onEvent(dir));
      fs.readdirSync(dir, { withFileTypes: true }).forEach(d => {
        if (!d.isDirectory()) return;
        const sub = path.join(dir, d.name);
        if (!IGNORE_DIRS.includes(path.relative(ROOT_DIR, sub).split(path.sep)[0])) walk(sub);
      });
    };
    walk(ROOT_DIR);
  }
}

// Kênh Server-Sent Events: /__dev/events ; script phía trình duyệt: /__dev/client.js
function handle(req, res) {
  const url = req.url.split('?')[0];
  if (url === '/__dev/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      'Connection': 'keep-alive'
    });
    // retry: mất kết nối (máy chủ đang khởi động lại) -> thử lại sau 500ms
    res.write(`retry: 500\nevent: hello\ndata: ${JSON.stringify({ boot: BOOT_ID })}\n\n`);
    sseClients.add(res);
    const keepAlive = setInterval(() => res.write(': ping\n\n'), 25000);
    req.on('close', () => { clearInterval(keepAlive); sseClients.delete(res); });
    return;
  }
  if (url === '/__dev/log' && req.method === 'POST') {
    let body = '', size = 0;
    req.on('data', c => {
      size += c.length;
      if (size > LOG_MAX_BODY) { req.destroy(); return; }
      body += c;
    });
    req.on('end', () => {
      try {
        const d = JSON.parse(body);
        const sid = String(d.sid || '').replace(/[^\w.-]/g, '').slice(0, 80);
        const lines = Array.isArray(d.lines) ? d.lines.map(String) : [];
        if (sid && lines.length) {
          const file = path.join(LOG_DIR, sid + '.log');
          const isNew = !fs.existsSync(file);
          fs.mkdirSync(LOG_DIR, { recursive: true });
          fs.appendFileSync(file, lines.join('\n') + '\n');
          if (isNew) pruneLogs();
        }
      } catch (e) { /* gói hỏng: bỏ qua */ }
      res.writeHead(204, { 'Cache-Control': 'no-store' });
      res.end();
    });
    return;
  }
  if (url === '/__dev/client.js') {
    res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(CLIENT_JS);
    return;
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('404');
}

function pruneLogs() {
  try {
    const files = fs.readdirSync(LOG_DIR).filter(f => f.endsWith('.log'))
      .map(f => ({ f, t: fs.statSync(path.join(LOG_DIR, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    // headless (phiên thử tự động) và trình duyệt thật giữ riêng LOG_KEEP tệp: chạy thử hàng loạt không đẩy mất log người chơi
    [true, false].forEach(h => files.filter(x => x.f.includes('_headless') === h).slice(LOG_KEEP)
      .forEach(x => fs.unlinkSync(path.join(LOG_DIR, x.f))));
  } catch (e) { /* thư mục log chưa có / tệp đang mở */ }
}

// Đổi ?v=... của tệp nội bộ thành ?v=dev<mtime> và chèn script dev vào cuối trang
function transformHtml(filePath, html) {
  const dir = path.dirname(filePath);
  html = html.replace(/\b(src|href)=(["'])([^"'?#:]+)\?v=[^"'#]*\2/g, (m, attr, q, ref) => {
    try {
      const target = path.join(ref.startsWith('/') ? ROOT_DIR : dir, ref);
      const mtime = Math.floor(fs.statSync(target).mtimeMs).toString(36);
      return `${attr}=${q}${ref}?v=dev${mtime}${q}`;
    } catch (e) {
      return m;
    }
  });
  const tag = '<script src="/__dev/client.js"></script>';
  return /<\/body>/i.test(html) ? html.replace(/<\/body>(?![\s\S]*<\/body>)/i, tag + '\n</body>') : html + tag;
}

function clientCount() {
  return sseClients.size;
}

// ---------- Mã chạy trong trình duyệt ----------
const CLIENT_JS = `(function () {
  if (!window.EventSource) return;
  var boot = null;
  var here = decodeURI(location.pathname).replace(/^\\//, '') || 'index.html';
  var es = new EventSource('/__dev/events');
  // used() tra danh sách tệp đã nạp: mặc định trình duyệt chỉ giữ 250 mục, game nạp nhiều hơn
  try { performance.setResourceTimingBufferSize(20000); } catch (e) {}

  // ---- LOG RA TỆP: window.devLog(nhãn, nội dung) -> logs/dev/<sid>.log trên máy chủ dev (gửi theo lô mỗi 2 s)
  var p2 = function (n, w) { n = String(n); while (n.length < (w || 2)) n = '0' + n; return n; };
  var d0 = new Date();
  var sid = d0.getFullYear() + p2(d0.getMonth() + 1) + p2(d0.getDate()) + '-' + p2(d0.getHours()) + p2(d0.getMinutes()) + p2(d0.getSeconds()) +
    '_' + here.replace(/\\.html$/i, '').replace(/[^\\w-]/g, '') + (/Headless/.test(navigator.userAgent) ? '_headless' : '') +
    '_' + Math.random().toString(36).slice(2, 6);   // 2 tab mở cùng giây không ghi chung 1 tệp
  var logQ = [];
  function stamp() { var d = new Date(); return p2(d.getHours()) + ':' + p2(d.getMinutes()) + ':' + p2(d.getSeconds()) + '.' + p2(d.getMilliseconds(), 3); }
  function devLog(tag, msg) {
    if (logQ.length > 5000) return;   // trang kẹt vòng lặp lỗi: không làm phình bộ nhớ
    logQ.push('[' + stamp() + '] [' + tag + '] ' + msg);
  }
  function flushLog(beacon) {
    if (!logQ.length) return;
    var body = JSON.stringify({ sid: sid, lines: logQ });
    logQ = [];
    try {
      if (beacon && navigator.sendBeacon) navigator.sendBeacon('/__dev/log', new Blob([body], { type: 'application/json' }));
      else fetch('/__dev/log', { method: 'POST', body: body, headers: { 'Content-Type': 'application/json' }, keepalive: true }).catch(function () {});
    } catch (e) {}
  }
  window.devLog = devLog;
  setInterval(flushLog, 2000);
  addEventListener('pagehide', function () { devLog('page', 'đóng / tải lại trang'); flushLog(true); });
  devLog('page', location.href + ' · ' + innerWidth + 'x' + innerHeight + ' @' + devicePixelRatio + ' · ' + navigator.userAgent);
  var fmt = function (a) {
    return Array.prototype.map.call(a, function (x) {
      if (x instanceof Error) return x.stack || String(x);
      if (typeof x === 'object') { try { return JSON.stringify(x).slice(0, 500); } catch (e) { return String(x); } }
      return String(x);
    }).join(' ');
  };
  ['error', 'warn'].forEach(function (k) {
    var orig = console[k];
    console[k] = function () { devLog(k, fmt(arguments)); return orig.apply(console, arguments); };
  });
  addEventListener('error', function (e) {
    devLog('error', (e.error && e.error.stack) || (e.message + ' @ ' + e.filename + ':' + e.lineno));
  });
  addEventListener('unhandledrejection', function (e) {
    var r = e.reason;
    devLog('error', 'Promise: ' + ((r && r.stack) || r));
  });

  // Không bao giờ tự tải lại (máy lag, các agent sửa tệp liên tục) -> chỉ hiện nhãn "có bản mới", bấm vào mới tải lại.
  // CSS vẫn được thay nóng tại chỗ vì không làm mất trạng thái trang.
  var badge = null;
  function requestReload(why) {
    devLog('dev', why);
    console.info('[dev] ' + why + ' -> bấm nhãn "Có bản mới" để tải lại');
    if (!badge) {
      badge = document.createElement('button');
      badge.type = 'button';
      badge.textContent = 'Có bản mới · bấm để tải lại';
      badge.style.cssText = 'position:fixed;left:50%;top:6px;transform:translateX(-50%);z-index:99999;font:600 12px/1 Arial,sans-serif;' +
        'padding:6px 12px;border:1px solid rgba(231,166,58,.8);background:rgba(20,16,10,.85);color:#ffd9a0;cursor:pointer;border-radius:3px';
      badge.onclick = function () { location.reload(); };
      document.body.appendChild(badge);
    }
  }

  es.addEventListener('hello', function (e) {
    var d = JSON.parse(e.data);
    // Máy chủ vừa khởi động lại (sửa server*.js hoặc tệp dùng chung) -> tải lại cho đồng bộ
    if (boot && boot !== d.boot) { requestReload('Máy chủ khởi động lại'); return; }
    boot = d.boot;
    console.info('[dev] Hot reload đang bật');
  });

  // trang đã nạp tệp f chưa: thẻ <script> / <link> hoặc bất kỳ yêu cầu tải nào (ảnh, âm thanh, fetch)
  function used(f) {
    var hit = function (url) { try { return decodeURI(new URL(url, location.href).pathname).replace(/^\\//, '') === f; } catch (e) { return false; } };
    var els = document.querySelectorAll('script[src], link[href]');
    for (var i = 0; i < els.length; i++) if (hit(els[i].src || els[i].href)) return true;
    var rs = performance.getEntriesByType('resource');
    for (var j = 0; j < rs.length; j++) if (hit(rs[j].name)) return true;
    return false;
  }

  es.addEventListener('change', function (e) {
    var d = JSON.parse(e.data);
    var files = d.files.filter(function (f) {
      // Sửa trang HTML khác (vd. fx_lab.html) thì không làm phiền trang đang mở
      if (/\\.html$/i.test(f)) return f === here;
      // tệp trang này chưa từng nạp (script / ảnh / âm thanh của trang khác) -> bỏ qua
      return used(f);
    });
    if (!files.length) return;
    var css = files.filter(function (f) { return /\\.css$/i.test(f); });
    if (css.length === files.length && css.every(function (f) { return swapCss(f, d.t); })) {
      console.info('[dev] Đã áp dụng CSS: ' + css.join(', '));
      return;
    }
    requestReload('Thay đổi: ' + files.join(', '));
  });

  // Thay stylesheet bằng bản mới; chờ bản mới tải xong mới gỡ bản cũ để không bị nháy
  function swapCss(file, t) {
    var found = false;
    var links = document.querySelectorAll('link[rel="stylesheet"]');
    for (var i = 0; i < links.length; i++) {
      var link = links[i];
      var url = new URL(link.href, location.href);
      if (url.origin !== location.origin || decodeURI(url.pathname).replace(/^\\//, '') !== file) continue;
      found = true;
      var next = link.cloneNode();
      url.searchParams.set('v', 'dev' + t);
      next.href = url.href;
      next.onload = next.onerror = (function (old) { return function () { old.remove(); }; })(link);
      link.parentNode.insertBefore(next, link.nextSibling);
    }
    return found;
  }
})();
`;

module.exports = { enabled, handle, transformHtml, startWatcher, clientCount };
