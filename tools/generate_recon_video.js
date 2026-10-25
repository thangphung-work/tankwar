/**
 * SCRIPT TỰ ĐỘNG SINH VIDEO FLYCAM 360 CĂN CỨ CHIẾN LƯỢC (tools/generate_recon_video.js)
 *
 * Cách chạy:
 *   node tools/generate_recon_video.js             (mặc định quay bản đồ URBAN - Nhà máy điện hạt nhân)
 *   node tools/generate_recon_video.js DESERT      (quay bản đồ chỉ định)
 *   node tools/generate_recon_video.js ALL         (tự động quay toàn bộ 5 bản đồ)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');

const ROOT_DIR = path.resolve(__dirname, '..');
const ASSETS_DIR = path.join(ROOT_DIR, 'assets');

const MAP_LIST = ['URBAN', 'DESERT', 'JUNGLE', 'HIGHLAND', 'RIVER_LAKE'];
const args = process.argv.slice(2).map(a => a.toUpperCase());
let targetMaps = [];

if (args.includes('ALL')) {
  targetMaps = [...MAP_LIST];
} else if (args.length > 0 && MAP_LIST.includes(args[0])) {
  targetMaps = [args[0]];
} else {
  targetMaps = ['URBAN'];
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf'
};

function findChromeExecutable() {
  const candidatePaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
    path.join(process.env.PROGRAMFILES || '', 'Google\\Chrome\\Application\\chrome.exe'),
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  ];

  for (const p of candidatePaths) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function createTempServer(port = 8765) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (req.url === '/api/save-video' && req.method === 'POST') {
        const fileName = path.basename(req.headers['x-file-name'] || 'recon_briefing.webm');
        const chunks = [];
        req.on('data', chunk => chunks.push(chunk));
        req.on('end', () => {
          try {
            const buffer = Buffer.concat(chunks);
            const savePath = path.join(ASSETS_DIR, fileName);
            fs.writeFileSync(savePath, buffer);
            console.log(`[RECORDER SERVER] Đã lưu video: ${fileName} (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, name: fileName, size: buffer.length }));
          } catch (e) {
            res.writeHead(500); res.end(e.message);
          }
        });
        return;
      }

      let reqPath = decodeURI(req.url.split('?')[0]);
      if (reqPath === '/' || reqPath === '') reqPath = '/index.html';
      const filePath = path.join(ROOT_DIR, reqPath);

      if (!filePath.startsWith(ROOT_DIR)) {
        res.writeHead(403); res.end(); return;
      }

      fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
          res.writeHead(404); res.end('Not Found'); return;
        }
        const ext = path.extname(filePath).toLowerCase();
        const mime = MIME_TYPES[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-cache' });
        fs.createReadStream(filePath).pipe(res);
      });
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        createTempServer(port + 1).then(resolve).catch(reject);
      } else {
        reject(err);
      }
    });

    server.listen(port, '127.0.0.1', () => {
      resolve({ server, port });
    });
  });
}

async function recordMap(chromePath, port, mapName) {
  console.log(`\n==================================================`);
  console.log(`[RECORDER] Bắt đầu quay Flycam 360 căn cứ chiến lược: ${mapName}`);
  console.log(`==================================================`);

  // Tour quay sẵn căn cứ -> A -> B -> C, phát trong màn chờ thay tour 3D đầu trận.
  const url = `http://127.0.0.1:${port}/tools/recon_recorder.html?map=${mapName}&dur=45.0&auto=1`;
  const fileName = `recon_${mapName.toLowerCase()}.webm`;
  const targetFilePath = path.join(ASSETS_DIR, fileName);

  const startTime = Date.now();

  const chromeArgs = [
    '--headless=new',
    `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'tankwar-recon-'))}`,
    `--app=${url}`,
    '--window-size=960,540',
    '--enable-webgl',
    '--enable-gpu-rasterization',
    '--ignore-gpu-blocklist',
    '--autoplay-policy=no-user-gesture-required',
    '--mute-audio',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--force-device-scale-factor=1'
  ];

  const browserProc = spawn(chromePath, chromeArgs, { stdio: 'ignore', windowsHide: true });

  return new Promise((resolve) => {
    let checkInterval = setInterval(() => {
      if (fs.existsSync(targetFilePath)) {
        const stats = fs.statSync(targetFilePath);
        if (stats.mtimeMs > startTime && stats.size > 20000) {
          clearInterval(checkInterval);
          clearTimeout(timeoutHandle);
          console.log(`[RECORDER] ✓ Hoàn tất bản đồ ${mapName} -> ${fileName} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);

          setTimeout(() => {
            try { browserProc.kill(); } catch (e) {}
            resolve(true);
          }, 800);
        }
      }
    }, 400);

    const timeoutHandle = setTimeout(() => {
      clearInterval(checkInterval);
      console.warn(`[RECORDER] Hết thời gian chờ quay bản đồ ${mapName}`);
      try { browserProc.kill(); } catch (e) {}
      resolve(false);
    }, 180000); // chờ dựng đủ cảnh trước khi quay; máy yếu có thể cần hơn 55 giây
  });
}

async function main() {
  const chromePath = findChromeExecutable();
  if (!chromePath) {
    console.error('Không tìm thấy trình duyệt Google Chrome trên hệ thống!');
    process.exit(1);
  }

  console.log(`[RECORDER] Trình duyệt sử dụng: ${chromePath}`);
  console.log(`[RECORDER] Danh sách bản đồ cần quay: ${targetMaps.join(', ')}`);

  const { server, port } = await createTempServer(8765);
  console.log(`[RECORDER] Máy chủ ghi hình hoạt động tại: http://127.0.0.1:${port}`);

  const failed = [];
  for (const mapName of targetMaps) {
    if (!await recordMap(chromePath, port, mapName)) failed.push(mapName);
  }

  const urbanPath = path.join(ASSETS_DIR, 'recon_urban.webm');
  const briefingPath = path.join(ASSETS_DIR, 'recon_briefing.webm');
  if (fs.existsSync(urbanPath)) {
    fs.copyFileSync(urbanPath, briefingPath);
  }

  if (failed.length) console.error('[RECORDER] Chưa xuất được: ' + failed.join(', '));
  else console.log(`\n[RECORDER] TẤT CẢ VIDEO FLYCAM CĂN CỨ ĐÃ HOÀN TẤT VÀ ĐƯỢC LƯU TẠI THƯ MỤC assets/`);

  server.close(() => {
    process.exit(failed.length ? 1 : 0);
  });
}

main().catch(err => {
  console.error('[RECORDER] Lỗi thực thi:', err);
  process.exit(1);
});
