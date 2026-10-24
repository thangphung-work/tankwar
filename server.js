const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const crypto = require('crypto');
// Lọc tầm nhìn / kiểm tra sát thương & di chuyển trong trận (xem server_auth.js)
const auth = require('./server_auth');
// Tài khoản người chơi (đăng ký / đăng nhập / lưu hồ sơ) — xem server_accounts.js
const accounts = require('./server_accounts');
// Chế độ phát triển: tự áp dụng thay đổi khi lưu tệp (npm run dev) — xem server_dev.js
const dev = require('./server_dev');

// Danh sách cổng ưu tiên
const PORTS = process.env.PORT ? [Number(process.env.PORT)] : [3000, 8080, 8000, 5000, 8888];
let portIndex = 0;

// Bảng ánh xạ định dạng tệp (MIME types)
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf'
};

const ROOT_DIR = __dirname;

function serveFile(req, res) {
  let reqPath;
  try {
    reqPath = decodeURI(req.url.split('?')[0]);
  } catch (e) {
    // URL mã hóa sai định dạng: trả lỗi thay vì làm sập máy chủ
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('400 Đường dẫn không hợp lệ');
    return;
  }
  if (reqPath === '/' || reqPath === '') {
    reqPath = '/index.html';
  }
  // Bản phát hành (npm run build): trang chính dùng dist/index.html (JS/CSS đã gộp, nén, đánh hash)
  if (reqPath === '/index.html' && !dev.enabled && fs.existsSync(path.join(ROOT_DIR, 'dist', 'index.html'))) {
    reqPath = '/dist/index.html';
  }

  const filePath = path.normalize(path.join(ROOT_DIR, reqPath));

  // Bảo vệ bảo mật: Không cho phép truy cập ra ngoài thư mục dự án, không lộ dữ liệu tài khoản (data/)
  if (!filePath.startsWith(ROOT_DIR) || filePath.toLowerCase().startsWith(accounts.DATA_DIR.toLowerCase())) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Không có quyền truy cập');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Không tìm thấy tệp: ' + reqPath);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    // Cache phía trình duyệt:
    // - ETag/Last-Modified theo kích thước + thời điểm sửa -> tải lại chỉ tốn 304 (không gửi lại nội dung)
    // - Đường dẫn có ?v=... (đã đánh phiên bản) -> giữ 1 năm, đổi v là trình duyệt tải bản mới
    // - Ảnh/âm thanh/phông chữ chưa đánh phiên bản -> giữ 1 ngày rồi hỏi lại bằng ETag
    // - HTML/JS/CSS chưa đánh phiên bản -> luôn hỏi lại (no-cache) để không kẹt bản cũ
    const etag = `W/"${stats.size.toString(16)}-${Math.floor(stats.mtimeMs).toString(16)}"`;
    const lastModified = stats.mtime.toUTCString();
    const versioned = /[?&]v=/.test(req.url);
    const isStaticMedia = /^\.(png|jpe?g|gif|svg|ico|webp|wav|mp3|ogg|m4a|woff2?|ttf)$/.test(ext);
    const cacheControl = dev.enabled ? 'no-cache'
      : versioned ? 'public, max-age=31536000, immutable'
      : isStaticMedia ? 'public, max-age=86400'
      : 'no-cache';
    const headers = {
      'Content-Type': contentType,
      'Cache-Control': cacheControl,
      'ETag': etag,
      'Last-Modified': lastModified,
      'Access-Control-Allow-Origin': '*'
    };

    // Dev: trang HTML luôn được dựng lại (chèn script dev, đánh phiên bản theo thời điểm sửa tệp)
    if (dev.enabled && ext === '.html') {
      fs.readFile(filePath, 'utf8', (readErr, html) => {
        if (readErr) { res.writeHead(500); res.end(); return; }
        const body = Buffer.from(dev.transformHtml(filePath, html));
        res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-store', 'Content-Length': body.length });
        res.end(req.method === 'HEAD' ? undefined : body);
      });
      return;
    }

    const inm = req.headers['if-none-match'];
    const ims = req.headers['if-modified-since'];
    const notModified = inm
      ? inm.split(',').some(t => t.trim() === etag || t.trim() === '*')
      : (ims && Math.floor(stats.mtimeMs / 1000) <= Math.floor(Date.parse(ims) / 1000));
    if (notModified) {
      res.writeHead(304, headers);
      res.end();
      return;
    }

    headers['Content-Length'] = stats.size;
    res.writeHead(200, headers);
    if (req.method === 'HEAD') { res.end(); return; }

    const readStream = fs.createReadStream(filePath);
    readStream.pipe(res);
  });
}

// ======================================================
// MÁY CHỦ WEBSOCKET TỰ VIẾT THEO RFC 6455 (KHÔNG DÙNG THƯ VIỆN NGOÀI)
// Phòng chuyển tiếp (room relay) cho chế độ nhiều người chơi tại đường dẫn /ws:
// - Cấp mã định danh cho từng máy khách, giữ danh sách thành viên phòng
// - Chuyển tiếp tin nhắn tới các thành viên khác (hoặc tới 1 người theo "to")
// - Báo vào/rời phòng, chọn chủ phòng (người vào sớm nhất), bầu lại khi chủ phòng rời
// - Phòng đã khóa (đang trong trận) -> người mới tự được xếp sang phòng kế tiếp
// ======================================================
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const WS_PATH = '/ws';
const WS_MAX_PAYLOAD = 1024 * 1024;   // Tối đa 1MB mỗi tin nhắn (kể cả ghép mảnh)
const WS_MAX_ROOM_SIZE = 20;          // 20 vị trí chiến đấu (10 vs 10)
const WS_PING_INTERVAL = 15000;       // Ping kiểm tra kết nối sống mỗi 15 giây

const wsRooms = new Map();            // tên phòng -> { name, members: Map(id -> client), hostId, locked }
const wsClients = new Set();          // Mọi kết nối đang mở (kể cả chưa vào phòng)
let wsNextClientId = 1;

class WsClient {
  constructor(socket) {
    this.socket = socket;
    this.id = 'c' + (wsNextClientId++).toString(36) + crypto.randomBytes(2).toString('hex');
    this.name = '';
    this.room = null;
    this.buffer = Buffer.alloc(0);
    this.fragments = null;   // Các mảnh của tin nhắn bị phân mảnh (FIN = 0)
    this.fragOpcode = 0;
    this.fragSize = 0;
    this.alive = true;
    this.closed = false;
  }

  // Ghép khung (frame) gửi đi: máy chủ không che mặt nạ, độ dài 7 / 16 / 64 bit
  sendFrame(opcode, payload) {
    if (this.closed || this.socket.destroyed) return;
    const len = payload.length;
    let header;
    if (len < 126) {
      header = Buffer.alloc(2);
      header[1] = len;
    } else if (len < 65536) {
      header = Buffer.alloc(4);
      header[1] = 126;
      header.writeUInt16BE(len, 2);
    } else {
      header = Buffer.alloc(10);
      header[1] = 127;
      header.writeUInt32BE(Math.floor(len / 0x100000000), 2);
      header.writeUInt32BE(len >>> 0, 6);
    }
    header[0] = 0x80 | (opcode & 0x0f);
    try {
      this.socket.write(Buffer.concat([header, payload]));
    } catch (e) {}
  }

  sendText(str) {
    this.sendFrame(0x1, Buffer.from(str, 'utf8'));
  }

  sendJSON(obj) {
    this.sendText(JSON.stringify(obj));
  }

  close(code = 1000, reason = '') {
    if (this.closed) return;
    const reasonBuf = Buffer.from(String(reason).slice(0, 100), 'utf8');
    const payload = Buffer.alloc(2 + reasonBuf.length);
    payload.writeUInt16BE(code, 0);
    reasonBuf.copy(payload, 2);
    this.sendFrame(0x8, payload);
    this.closed = true;
    try { this.socket.end(); } catch (e) {}
    setTimeout(() => { try { this.socket.destroy(); } catch (e) {} }, 1000).unref();
  }

  // Bộ đọc khung nhận về: hỗ trợ mặt nạ, độ dài 126/127, ghép mảnh, khung điều khiển xen giữa
  onData(chunk) {
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;
    while (!this.closed) {
      const buf = this.buffer;
      if (buf.length < 2) return;
      const b0 = buf[0];
      const b1 = buf[1];
      const fin = (b0 & 0x80) !== 0;
      const rsv = b0 & 0x70;
      const opcode = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f;
      let offset = 2;

      if (rsv !== 0) return this.close(1002, 'RSV bits');
      if (len === 126) {
        if (buf.length < 4) return;
        len = buf.readUInt16BE(2);
        offset = 4;
      } else if (len === 127) {
        if (buf.length < 10) return;
        const hi = buf.readUInt32BE(2);
        const lo = buf.readUInt32BE(6);
        if (hi > 0) return this.close(1009, 'Too big');
        len = lo;
        offset = 10;
      }
      // Theo RFC 6455: mọi khung từ máy khách bắt buộc phải che mặt nạ
      if (!masked) return this.close(1002, 'Unmasked frame');
      if (len > WS_MAX_PAYLOAD) return this.close(1009, 'Too big');
      if (buf.length < offset + 4 + len) return;

      const m0 = buf[offset], m1 = buf[offset + 1], m2 = buf[offset + 2], m3 = buf[offset + 3];
      offset += 4;
      const payload = Buffer.allocUnsafe(len);
      for (let i = 0; i < len; i++) {
        const mk = (i & 3) === 0 ? m0 : ((i & 3) === 1 ? m1 : ((i & 3) === 2 ? m2 : m3));
        payload[i] = buf[offset + i] ^ mk;
      }
      this.buffer = buf.length === offset + len ? Buffer.alloc(0) : buf.slice(offset + len);
      this.handleFrame(fin, opcode, payload);
    }
  }

  handleFrame(fin, opcode, payload) {
    // Khung điều khiển (close / ping / pong): không được phân mảnh, tối đa 125 byte
    if (opcode >= 0x8) {
      if (!fin || payload.length > 125) return this.close(1002, 'Bad control frame');
      if (opcode === 0x8) {
        let code = 1000;
        if (payload.length >= 2) code = payload.readUInt16BE(0);
        if (code < 1000 || code === 1005 || code === 1006 || code >= 5000) code = 1000;
        this.close(code);
        return;
      }
      if (opcode === 0x9) {
        this.sendFrame(0xA, payload); // Trả pong cùng nội dung
        return;
      }
      if (opcode === 0xA) {
        this.alive = true;
        return;
      }
      return this.close(1002, 'Unknown opcode');
    }

    // Khung tiếp nối của tin nhắn phân mảnh
    if (opcode === 0x0) {
      if (!this.fragments) return this.close(1002, 'Unexpected continuation');
      this.fragments.push(payload);
      this.fragSize += payload.length;
      if (this.fragSize > WS_MAX_PAYLOAD) return this.close(1009, 'Too big');
      if (fin) {
        const full = Buffer.concat(this.fragments);
        const op = this.fragOpcode;
        this.fragments = null;
        this.fragSize = 0;
        this.deliver(op, full);
      }
      return;
    }

    if (opcode === 0x1 || opcode === 0x2) {
      if (this.fragments) return this.close(1002, 'Interleaved message');
      if (!fin) {
        this.fragments = [payload];
        this.fragOpcode = opcode;
        this.fragSize = payload.length;
        return;
      }
      this.deliver(opcode, payload);
      return;
    }

    this.close(1002, 'Unknown opcode');
  }

  deliver(opcode, payload) {
    this.alive = true;
    if (opcode !== 0x1) return; // Giao thức game chỉ dùng tin nhắn văn bản JSON
    let msg = null;
    try {
      msg = JSON.parse(payload.toString('utf8'));
    } catch (e) {
      return;
    }
    if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') return;
    wsHandleMessage(this, msg);
  }
}

function wsSanitizeRoom(name) {
  const s = (typeof name === 'string' ? name : 'lobby').replace(/[^A-Za-z0-9_\-:.]/g, '').slice(0, 48);
  return s || 'lobby';
}

function wsSanitizeMap(m) {
  return typeof m === 'string' ? m.replace(/[^A-Z_]/g, '').slice(0, 20) : '';
}

function wsBroadcast(room, obj, exceptId) {
  const text = JSON.stringify(obj);
  room.members.forEach((member, id) => {
    if (id !== exceptId) member.sendText(text);
  });
}

const ipCountryCache = new Map();

function getClientIp(req, socket) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd && typeof fwd === 'string') {
    const first = fwd.split(',')[0].trim();
    if (first) return first;
  }
  return req.headers['x-real-ip'] || (socket && socket.remoteAddress) || '';
}

function detectCountry(req, ip) {
  const cfCountry = req.headers['cf-ipcountry'];
  if (cfCountry && typeof cfCountry === 'string' && cfCountry.length === 2 && cfCountry !== 'XX') {
    return cfCountry.toUpperCase();
  }
  const cleanIp = String(ip || '').replace(/^.*:/, '');
  if (ipCountryCache.has(cleanIp)) return ipCountryCache.get(cleanIp);
  if (!cleanIp || cleanIp === '1' || cleanIp === '127.0.0.1' || cleanIp.startsWith('192.168.') || cleanIp.startsWith('10.') || cleanIp.startsWith('172.')) {
    ipCountryCache.set(cleanIp, 'VN');
    return 'VN';
  }
  return 'VN';
}

function wsJoinRoom(client, baseName, name, token, skipList, prefMap, clientCountry) {
  if (client.room) wsLeaveRoom(client);
  client.name = typeof name === 'string' ? name.slice(0, 40) : '';
  if (clientCountry && typeof clientCountry === 'string' && clientCountry.length === 2) {
    client.country = clientCountry.toUpperCase();
  }
  const myCountry = client.country || 'VN';

  // gắn tài khoản (nếu đã đăng nhập) -> thành tích trận mạng do máy chủ tự đếm
  client.userId = accounts.userIdFromToken ? accounts.userIdFromToken(token) : null;
  // số liệu xếp phe (cấp / trận thắng / tổng trận) đọc từ CSDL -> chủ phòng chia phe theo số này, không theo máy khách tự khai
  let skill = null;
  try { skill = accounts.skillOf ? accounts.skillOf(client.userId) : null; } catch (e) { skill = null; }
  client.skill = skill;
  const base = wsSanitizeRoom(baseName);
  // Phòng khách vừa bị từ chối (ROOM_FULL / chủ phòng không phản hồi): bỏ qua để sang phòng kế tiếp
  const skip = new Set(Array.isArray(skipList) ? skipList.slice(0, 16).map(String) : []);

  // Ưu tiên phòng chờ đang mở (chưa khóa, còn chỗ) trong chuỗi base, base#2, base#3...
  const roomNameAt = (n) => (n === 1 ? base : base + '#' + n);
  const map = wsSanitizeMap(prefMap);
  const open = [];
  for (let n = 1; n < 1000; n++) {
    const existing = wsRooms.get(roomNameAt(n));
    if (existing && !existing.locked && !skip.has(existing.name) && existing.members.size < WS_MAX_ROOM_SIZE) open.push(existing);
  }

  // Thuật toán ưu tiên ghép trận:
  // 1. Cùng Quốc Gia (IP) + Cùng loại bản đồ
  // 2. Cùng Quốc Gia (IP) khác bản đồ
  // 3. Khác Quốc Gia nhưng cùng bản đồ
  // 4. Phòng mở bất kỳ còn chỗ
  let room = (map ? open.find(r => r.country === myCountry && r.mapType === map) : null)
    || open.find(r => r.country === myCountry)
    || (map ? open.find(r => r.mapType === map) : null)
    || open[0]
    || null;

  if (!room) {
    for (let n = 1; n < 1000; n++) {
      if (!wsRooms.has(roomNameAt(n))) {
        room = { name: roomNameAt(n), members: new Map(), hostId: null, locked: false, mapType: map, country: myCountry };
        wsRooms.set(room.name, room);
        break;
      }
    }
  }
  if (!room) return;

  const peers = [];
  room.members.forEach((m) => peers.push({ id: m.id, name: m.name, k: m.skill || null, country: m.country || 'VN' }));
  room.members.set(client.id, client);
  client.room = room;
  if (!room.hostId) room.hostId = client.id;

  client.sendJSON({ t: '@welcome', d: { id: client.id, room: room.name, hostId: room.hostId, peers, k: client.skill || null, country: myCountry, s: Date.now() } });
  wsBroadcast(room, { t: '@peer_join', d: { id: client.id, name: client.name, k: client.skill || null, country: myCountry } }, client.id);
}

function wsLeaveRoom(client) {
  const room = client.room;
  if (!room) return;
  client.room = null;
  room.members.delete(client.id);
  auth.onLeave(room, client.id);
  if (room.members.size === 0) {
    wsRooms.delete(room.name);
    return;
  }
  wsBroadcast(room, { t: '@peer_leave', d: { id: client.id } });
  // Chủ phòng rời đi: bầu thành viên vào sớm nhất còn lại làm chủ phòng mới
  if (room.hostId === client.id) {
    room.hostId = room.members.keys().next().value;
    wsBroadcast(room, { t: '@host', d: { id: room.hostId } });
  }
}

function wsHandleMessage(client, msg) {
  const d = (msg.d && typeof msg.d === 'object') ? msg.d : {};
  switch (msg.t) {
    case '@join':
      wsJoinRoom(client, d.room, d.name, d.tok, d.skip, d.map);
      return;
    case '@leave':
      wsLeaveRoom(client);
      return;
    case '@ping':
      // Đồng bộ đồng hồ: trả lại thời điểm gửi của máy khách + thời gian máy chủ
      client.sendJSON({ t: '@pong', d: { c: d.c, s: Date.now() } });
      return;
    case '@map':
      // Chủ phòng báo loại bản đồ đang chọn -> dùng để ghép người mới vào đúng phòng
      if (client.room && client.room.hostId === client.id) client.room.mapType = wsSanitizeMap(d.map);
      return;
    case '@lock':
    case '@unlock':
      if (client.room && client.room.hostId === client.id) {
        client.room.locked = (msg.t === '@lock');
      }
      return;
    default:
      break;
  }

  const room = client.room;
  if (!room) return;
  if (auth.handle(room, client, msg)) return;
  const out = JSON.stringify({ t: msg.t, f: client.id, d: msg.d === undefined ? null : msg.d });
  if (typeof msg.to === 'string') {
    const target = room.members.get(msg.to);
    if (target) target.sendText(out);
    return;
  }
  room.members.forEach((member, id) => {
    if (id !== client.id) member.sendText(out);
  });
}

function attachWebSocket(server) {
  auth.startTicker(wsRooms);
  server.on('upgrade', (req, socket, head) => {
    const urlPath = String(req.url || '').split('?')[0];
    if (urlPath !== WS_PATH) {
      socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    const key = req.headers['sec-websocket-key'];
    const upgrade = String(req.headers.upgrade || '').toLowerCase();
    const version = String(req.headers['sec-websocket-version'] || '');
    if (upgrade !== 'websocket' || !key || version !== '13') {
      socket.write('HTTP/1.1 400 Bad Request\r\nSec-WebSocket-Version: 13\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }

    const accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      'Sec-WebSocket-Accept: ' + accept + '\r\n\r\n'
    );
    socket.setNoDelay(true); // Tắt Nagle: gói nhỏ đi ngay, giảm trễ
    socket.setTimeout(0);

    const client = new WsClient(socket);
    wsClients.add(client);
    socket.on('data', (chunk) => client.onData(chunk));
    socket.on('error', () => {});
    // Socket của http.Server mặc định allowHalfOpen: máy khách ngắt đột ngột (FIN) phải tự đóng nốt chiều gửi,
    // nếu không 'close' không bao giờ phát và thành viên "ma" sẽ kẹt lại trong phòng
    socket.on('end', () => { try { socket.destroy(); } catch (e) {} });
    socket.on('close', () => {
      client.closed = true;
      wsClients.delete(client);
      wsLeaveRoom(client);
    });
    if (head && head.length) client.onData(head);
  });

  // Ping định kỳ: ngắt các kết nối không phản hồi pong
  const pingTimer = setInterval(() => {
    wsClients.forEach((client) => {
      if (!client.alive) {
        try { client.socket.destroy(); } catch (e) {}
        return;
      }
      client.alive = false;
      client.sendFrame(0x9, Buffer.alloc(0));
    });
  }, WS_PING_INTERVAL);
  pingTimer.unref();
}

function startServer(port) {
  const server = http.createServer((req, res) => {
    if (req.url === '/api/save-video' && req.method === 'POST') {
      const fileName = path.basename(req.headers['x-file-name'] || 'recon_briefing.webm');
      const chunks = [];
      req.on('data', chunk => chunks.push(chunk));
      req.on('end', () => {
        try {
          const buffer = Buffer.concat(chunks);
          const savePath = path.join(ROOT_DIR, 'assets', fileName);
          fs.writeFileSync(savePath, buffer);
          console.log('[SERVER] Đã lưu video trinh sát:', savePath, '(' + buffer.length + ' bytes)');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, name: fileName, size: buffer.length }));
        } catch (e) {
          res.writeHead(500); res.end(e.message);
        }
      });
      return;
    }
    if (req.url === '/api/save-screenshot' && req.method === 'POST') {
      console.log('[SERVER HIT] save-screenshot');
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const json = JSON.parse(body);
          const base64Data = json.data.replace(/^data:image\/\w+;base64,/, '');
          const buffer = Buffer.from(base64Data, 'base64');
          fs.writeFileSync('C:/Users/thang/.gemini/antigravity/brain/e2c61640-f3b5-407d-b528-65c64a891927/crater_screenshot.png', buffer);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, size: buffer.length }));
        } catch (e) {
          res.writeHead(500); res.end(e.message);
        }
      });
      return;
    }
    if (String(req.url || '').startsWith('/api/')) { accounts.handle(req, res); return; }
    if (dev.enabled && String(req.url || '').startsWith('/__dev/')) { dev.handle(req, res); return; }
    serveFile(req, res);
  });
  attachWebSocket(server);

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      portIndex++;
      if (portIndex < PORTS.length) {
        startServer(PORTS[portIndex]);
      } else {
        console.error('Không tìm thấy cổng mạng còn trống. Vui lòng thử lại sau.');
      }
    } else {
      console.error('Lỗi máy chủ:', err);
    }
  });

  server.listen(port, () => {
    const url = `http://localhost:${port}`;
    console.log('\n======================================================');
    console.log('   TACTICAL SPG COMMAND 3D - SERVER IS READY!');
    console.log(`   Running at: ${url}`);
    console.log(`   Multiplayer WebSocket: ws://localhost:${port}${WS_PATH}`);
    if (dev.enabled) console.log('   DEV MODE: hot reload ON (save a file -> browser updates)');
    console.log('   (Press Ctrl + C in this terminal to stop)');
    console.log('======================================================\n');
    if (dev.enabled) dev.startWatcher(accounts.DATA_DIR);

    // Tự động mở trình duyệt mặc định trên Windows (đặt NO_BROWSER=1 để tắt)
    if (process.env.NO_BROWSER) return;
    const openBrowser = () => {
      exec(`start ${url}`, (openErr) => {
        if (openErr) {
          console.log(`Please open your browser at: ${url}`);
        }
      });
    };
    // Dev: máy chủ khởi động lại liên tục -> chỉ mở trình duyệt khi chưa có tab nào kết nối lại
    if (dev.enabled) setTimeout(() => { if (dev.clientCount() === 0) openBrowser(); }, 1500);
    else openBrowser();
  });
}

startServer(PORTS[portIndex]);
