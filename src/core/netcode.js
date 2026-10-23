/**
 * Module Mạng Thời Gian Thực (Netcode) cho chế độ nhiều người chơi
 * - NetTransport: lớp truyền tin thống nhất
 *     + WebSocket ws(s)://<host>/ws khi trang chạy qua http(s) (server.js có sẵn phòng chuyển tiếp)
 *     + Dự phòng BroadcastChannel (các tab cùng trình duyệt) nếu không kết nối được WebSocket
 *     + Dự phòng chế độ độc lập (offline / solo) khi mở file:// trực tiếp
 *   Cùng một API: send, sendTo, on(type, fn), myId, hostId/isHost, getPeerList(), rtt/latency, now()
 * - Đồng bộ đồng hồ theo máy chủ (hoặc theo chủ phòng khi dùng BroadcastChannel) qua ping khứ hồi
 * - SnapshotBuffer: nội suy trạng thái xe từ xa (trễ ~100ms), ngoại suy tối đa 250ms khi gói đến muộn,
 *   hòa trộn sai số mượt mà thay vì giật vị trí (chỉ nhảy thẳng khi sai lệch quá lớn: hồi sinh / dịch chuyển)
 * - NetGameSync: gói trạng thái lượng tử hóa + gộp lô, sự kiện bắn có bù trễ, sát thương theo máy có chủ quyền,
 *   bot do chủ phòng điều khiển
 */
(function (global) {
  'use strict';

  // ==========================================
  // THAM SỐ MẠNG
  // ==========================================
  const NET_CONFIG = {
    WS_CONNECT_TIMEOUT_MS: 2500,   // Quá thời gian này chưa mở được WebSocket -> dùng BroadcastChannel
    BC_JOIN_WAIT_MS: 350,          // Thời gian chờ các tab khác chào lại trước khi bầu chủ phòng
    BC_HEARTBEAT_MS: 1000,         // Nhịp tim BroadcastChannel
    BC_PEER_TIMEOUT_MS: 3500,      // Không nghe thấy tab trong khoảng này -> coi như đã rời phòng
    PING_FAST_COUNT: 5,            // Số lần ping nhanh ban đầu để đồng hồ hội tụ nhanh
    PING_FAST_MS: 250,
    PING_MS: 2000,
    CLOCK_SAMPLES: 10,             // Giữ 10 mẫu ping gần nhất, lấy mẫu có RTT nhỏ nhất
    SEND_HZ: 20,                   // Tần số gửi trạng thái xe (20 gói/giây)
    KEYFRAME_EVERY: 20,            // Mỗi 20 nhịp (1 giây) gửi đầy đủ mọi trường
    INTERP_DELAY_MS: 100,          // Hiển thị xe từ xa trễ 100ms để luôn có 2 gói kẹp hai đầu
    INTERP_DELAY_MAX_MS: 350,      // Trễ hiển thị thích ứng tối đa khi máy gửi chậm / mạng giật (khoảng gói * 1.5 + 2 * jitter)
    EXTRAP_MAX_MS: 250,            // Ngoại suy (dead-reckoning) tối đa 250ms khi gói đến muộn
    CORRECTION_TAU_S: 0.15,        // Hằng số thời gian hòa trộn sai số (giảm e lần sau 150ms)
    SNAP_DISTANCE: 150,            // Sai lệch vị trí lớn hơn mức này -> nhảy thẳng (hồi sinh / dịch chuyển)
    MAX_LAG_COMP_MS: 400,          // Bù trễ đạn tối đa
    DAMAGE_GUARD_MS: 1500,         // Sau sự kiện sát thương, tạm bỏ qua máu/giáp ERA trong gói trạng thái
    RESPAWN_CONFIRM_MS: 1000,      // Gói "còn sống" phải mới hơn thời điểm chết ít nhất 1s mới hồi sinh bản sao
    WORLD_SYNC_MS: 1000,           // Chủ phòng gửi gió mỗi giây
    MATCH_SYNC_MS: 500,            // Chủ phòng gửi đồng hồ trận, tỉ số, cờ cứ điểm 2 lần / giây
    ENV_SUM_MS: 5000,              // Chủ phòng gửi "dấu vân tay" trạng thái công trình / cây mỗi 5 giây
    STALE_MS: 450                  // Bản sao không có gói mới quá lâu: vị trí chỉ là phỏng đoán -> không tính trúng đạn
  };

  // ==========================================
  // HÀM TIỆN ÍCH
  // ==========================================
  const TWO_PI = Math.PI * 2;

  function localNow() {
    if (typeof performance !== 'undefined' && performance.timeOrigin && typeof performance.now === 'function') {
      return performance.timeOrigin + performance.now();
    }
    return Date.now();
  }

  function randomId(len) {
    let s = '';
    while (s.length < len) s += Math.random().toString(36).substring(2);
    return s.substring(0, len);
  }

  // Sinh hạt giống bản đồ ngẫu nhiên 32-bit không dấu
  function randomSeed() {
    try {
      if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        const a = new Uint32Array(1);
        crypto.getRandomValues(a);
        return a[0] >>> 0;
      }
    } catch (e) {}
    return (Math.floor(Math.random() * 0x100000000)) >>> 0;
  }

  function wrapPi(a) {
    a = a % TWO_PI;
    if (a > Math.PI) a -= TWO_PI;
    else if (a < -Math.PI) a += TWO_PI;
    return a;
  }

  function wrap180(d) {
    d = d % 360;
    if (d > 180) d -= 360;
    else if (d < -180) d += 360;
    return d;
  }

  function norm360(d) {
    d = d % 360;
    return d < 0 ? d + 360 : d;
  }

  // Nội suy góc theo cung ngắn nhất
  function lerpAngleRad(a, b, t) { return a + wrapPi(b - a) * t; }
  function lerpAngleDeg(a, b, t) { return norm360(a + wrap180(b - a) * t); }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  const NetUtil = { localNow, randomId, randomSeed, wrapPi, wrap180, norm360, lerpAngleRad, lerpAngleDeg, clamp };

  // ==========================================
  // LỚP TRUYỀN TIN THỐNG NHẤT (WebSocket / BroadcastChannel / Offline)
  // ==========================================
  class NetTransport {
    constructor(options) {
      options = options || {};
      this.roomBase = options.room || 'spg_lobby';
      this.name = options.name || '';
      this.mode = 'connecting';      // 'connecting' | 'ws' | 'bc' | 'offline'
      this.ready = false;
      this.myId = null;
      this.hostId = null;
      this.roomName = null;
      this.peers = new Map();        // id -> { id, name, rtt, jt, lastSeen, locked }
      this.handlers = {};
      this.anyHandlers = [];
      this.rtt = 0;                  // Thời gian khứ hồi trung bình (ms)
      this.latency = 0;              // Ước lượng trễ một chiều (ms)
      this.clockOffset = 0;          // now() = đồng hồ cục bộ + clockOffset = đồng hồ máy chủ / chủ phòng
      this.clockSynced = false;
      this._clockSamples = [];
      this.locked = false;
      this.ws = null;
      this.bc = null;
      this._bcRoomIndex = 1;
      this._pingTimer = null;
      this._pingCount = 0;
      this._wsFailed = false;
      this.stats = { sent: 0, recv: 0, bytesOut: 0, bytesIn: 0 };
      this.traceLog = [];            // Nhật ký chẩn đoán ngắn (đổi chế độ, chủ phòng, lỗi kết nối)

      if (typeof window !== 'undefined' && window.addEventListener) {
        window.addEventListener('beforeunload', () => this._sayGoodbye());
      }
    }

    get isHost() { return !!this.myId && this.hostId === this.myId; }
    get isOnline() { return this.mode === 'ws' || this.mode === 'bc'; }

    // Đồng hồ chung (ms) đã hiệu chỉnh theo máy chủ / chủ phòng
    now() { return localNow() + this.clockOffset; }

    getPeerList() { return Array.from(this.peers.values()); }

    _trace(msg) {
      this.traceLog.push(Math.round(localNow() % 1e7) + ' ' + msg);
      if (this.traceLog.length > 60) this.traceLog.shift();
    }
    getPeerRtt(id) { const p = this.peers.get(id); return p && p.rtt ? p.rtt : 0; }
    // Số liệu xếp phe máy chủ xác nhận: { lv, w, m } | null (khách) | undefined (không có máy chủ xác nhận: BroadcastChannel / máy chủ cũ)
    getPeerSkill(id) {
      if (this.mode !== 'ws') return undefined;
      if (id === this.myId) return this.mySkill;
      const p = this.peers.get(id);
      return p ? p.k : undefined;
    }

    on(type, fn) {
      (this.handlers[type] = this.handlers[type] || []).push(fn);
      return () => this.off(type, fn);
    }

    off(type, fn) {
      const list = this.handlers[type];
      if (!list) return;
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    }

    onAny(fn) {
      this.anyHandlers.push(fn);
      return () => { const i = this.anyHandlers.indexOf(fn); if (i >= 0) this.anyHandlers.splice(i, 1); };
    }

    _emit(type, data, from) {
      const list = this.handlers[type];
      if (list) {
        list.slice().forEach(fn => {
          try { fn(data, from); } catch (e) { console.warn('[NET] Lỗi xử lý tin nhắn', type, e); }
        });
      }
      if (type.charAt(0) !== '$' && type.charAt(0) !== '@') {
        this.anyHandlers.slice().forEach(fn => {
          try { fn(type, data, from); } catch (e) { console.warn('[NET] Lỗi xử lý tin nhắn', type, e); }
        });
      }
    }

    // Chọn đường truyền theo môi trường chạy trang
    connect() {
      const proto = (typeof location !== 'undefined' && location.protocol) || 'file:';
      if ((proto === 'http:' || proto === 'https:') && typeof WebSocket !== 'undefined') {
        this._connectWs();
      } else if (proto !== 'file:' && typeof BroadcastChannel !== 'undefined') {
        this._connectBc(this.roomBase);
      } else {
        this.goOffline();
      }
    }

    // Mã đăng nhập tài khoản (nếu có) -> máy chủ tự ghi thành tích trận mạng cho đúng tài khoản
    _accountToken() {
      try { return localStorage.getItem('spg_account_token') || undefined; } catch (e) { return undefined; }
    }

    // Gửi tới mọi thành viên khác trong phòng
    send(type, data) {
      this._sendRaw({ t: type, d: data === undefined ? null : data });
    }

    // Gửi tới đúng 1 thành viên
    sendTo(id, type, data) {
      if (!id) return;
      if (id === this.myId) {
        // Gửi cho chính mình: xử lý trực tiếp (bất đồng bộ cho giống mạng thật)
        setTimeout(() => this._emit(type, data === undefined ? null : data, this.myId), 0);
        return;
      }
      this._sendRaw({ t: type, d: data === undefined ? null : data, to: id });
    }

    _sendRaw(msg) {
      if (this.mode === 'ws' && this.ws && this.ws.readyState === 1) {
        const text = JSON.stringify(msg);
        this.stats.sent++;
        this.stats.bytesOut += text.length;
        try { this.ws.send(text); } catch (e) {}
      } else if (this.mode === 'bc' && this.bc) {
        msg.f = this.myId;
        this.stats.sent++;
        try { this.bc.postMessage(msg); } catch (e) {}
      }
    }

    // Vào phòng: kèm phòng cần bỏ qua + loại bản đồ muốn chơi (máy chủ ưu tiên phòng cùng bản đồ)
    _sendJoin() {
      this._sendRaw({ t: '@join', d: { room: this.roomBase, name: this.name, tok: this._accountToken(), skip: this._skipRooms || [], map: this.prefMap || '' } });
    }

    // Loại bản đồ: trước khi vào phòng = bản đồ muốn chơi; chủ phòng = bản đồ của phòng (báo máy chủ)
    setMap(mapType) {
      this.prefMap = mapType || '';
      if (this.mode === 'ws' && this.isHost) this._sendRaw({ t: '@map', d: { map: this.prefMap } });
    }

    // Khóa phòng khi đang trong trận: người mới vào sẽ được xếp sang phòng khác
    lockRoom(flag) {
      this.locked = !!flag;
      if (this.mode === 'ws') this._sendRaw({ t: this.locked ? '@lock' : '@unlock', d: null });
      else if (this.mode === 'bc') this._bcHeartbeat();
    }

    // Rời phòng hiện tại và vào lại sảnh (dùng khi quay về sảnh sau trận)
    // skipRoom: tên phòng vừa bị từ chối -> máy chủ xếp sang phòng khác
    rejoin(skipRoom) {
      if (!this.isOnline) {
        if (this.mode === 'offline') setTimeout(() => this._emit('$ready', this._readyInfo(), this.myId), 0);
        return;
      }
      this.ready = false;
      this.locked = false;
      this.peers.clear();
      if (this.mode === 'ws') {
        this._sendRaw({ t: '@leave', d: null });
        if (skipRoom) { this._skipRooms = (this._skipRooms || []).concat(skipRoom).slice(-8); } else this._skipRooms = [];
        this._sendJoin();
      } else if (this.mode === 'bc') {
        this._bcClose();
        this._bcRoomIndex = 1;
        this._connectBc(this._bcRoomName(1));
      }
    }

    // Rời phòng hiện tại nhưng giữ kết nối (người chơi hủy tìm trận); rejoin() để vào lại
    leave() {
      if (!this.isOnline) return;
      this.ready = false;
      this.locked = false;
      this.peers.clear();
      if (this.mode === 'ws') this._sendRaw({ t: '@leave', d: null });
      else if (this.mode === 'bc') this._bcClose();
    }

    // Chuyển sang chế độ độc lập (không mạng)
    goOffline(reason) {
      this._trace('offline: ' + (reason || 'goOffline'));
      const wasOnline = this.isOnline;
      if (this.ws) { try { this.ws.onclose = null; this.ws.close(); } catch (e) {} this.ws = null; }
      if (this.bc) this._bcClose();
      this._stopPing();
      this.mode = 'offline';
      if (!this.myId) this.myId = 'p' + randomId(8);
      const leaving = Array.from(this.peers.keys());
      this.peers.clear();
      this.hostId = this.myId;
      this.roomName = null;
      if (wasOnline && this.ready) {
        leaving.forEach(id => this._emit('$peer_leave', { id }, id));
        this._emit('$host', { id: this.hostId }, this.myId);
      }
      this.ready = true;
      setTimeout(() => this._emit('$ready', this._readyInfo(), this.myId), 0);
    }

    _readyInfo() {
      return { id: this.myId, room: this.roomName, hostId: this.hostId, mode: this.mode, peers: this.getPeerList() };
    }

    // ---------- WEBSOCKET ----------
    _connectWs() {
      const url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
      let opened = false;
      let ws = null;
      try {
        ws = new WebSocket(url);
      } catch (e) {
        this._fallbackFromWs();
        return;
      }
      this.ws = ws;
      ws.binaryType = 'arraybuffer';   // gói trạng thái xe gom theo nhịp của máy chủ là nhị phân (net_codec.js)
      // Lưu ý: game dựng địa hình đồng bộ rất nặng ngay lúc tải trang -> bộ hẹn giờ có thể chạy TRƯỚC onopen
      // dù kết nối đã mở. Vì vậy kiểm tra readyState; còn đang kết nối thì chờ thêm (tối đa 3 lượt) rồi mới bỏ cuộc.
      let waits = 0;
      let failTimer = null;
      const checkConnect = () => {
        if (opened || ws.readyState === 1) return;
        if (ws.readyState === 0 && ++waits < 3) {
          failTimer = setTimeout(checkConnect, NET_CONFIG.WS_CONNECT_TIMEOUT_MS);
          return;
        }
        try { ws.onclose = null; ws.close(); } catch (e) {}
        this._trace('ws connect timeout, readyState=' + ws.readyState);
        this._fallbackFromWs();
      };
      failTimer = setTimeout(checkConnect, NET_CONFIG.WS_CONNECT_TIMEOUT_MS);

      ws.onopen = () => {
        opened = true;
        clearTimeout(failTimer);
        this._trace('ws open');
        this.mode = 'ws';
        this._skipRooms = [];
        this._sendJoin();
      };
      ws.onmessage = (ev) => this._onWsMessage(ev.data);
      ws.onerror = () => {};
      ws.onclose = () => {
        clearTimeout(failTimer);
        if (!opened) {
          this._fallbackFromWs();
          return;
        }
        console.warn('[NET] Mất kết nối WebSocket tới máy chủ. Chuyển sang chế độ độc lập.');
        this._emit('$close', {}, this.myId);
        this.ws = null;
        this.goOffline('ws closed');
      };
    }

    _fallbackFromWs() {
      if (this._wsFailed) return;
      this._wsFailed = true;
      this.ws = null;
      if (typeof BroadcastChannel !== 'undefined') {
        console.warn('[NET] Không kết nối được WebSocket /ws. Dự phòng BroadcastChannel (các tab cùng trình duyệt).');
        this._connectBc(this.roomBase);
      } else {
        this.goOffline();
      }
    }

    _onWsMessage(raw) {
      if (typeof raw !== 'string') {
        // Gói nhị phân từ máy chủ: trạng thái các xe trong 1 nhịp (đã kiểm tra chủ quyền & lọc tầm nhìn)
        this.stats.recv++;
        this.stats.bytesIn += raw.byteLength || 0;
        const snap = typeof NetCodec !== 'undefined' ? NetCodec.decode(raw) : null;
        if (snap) this._emit('SNAP', snap, '@server');
        return;
      }
      let msg = null;
      try { msg = JSON.parse(raw); } catch (e) { return; }
      if (!msg || typeof msg.t !== 'string') return;
      this.stats.recv++;
      this.stats.bytesIn += raw.length || 0;
      const d = msg.d || {};
      switch (msg.t) {
        case '@welcome': {
          this._trace('welcome id=' + d.id + ' room=' + d.room + ' host=' + d.hostId + ' peers=' + (d.peers || []).length);
          this.myId = d.id;
          this.roomName = d.room;
          this.hostId = d.hostId;
          this.peers.clear();
          // k = số liệu xếp phe máy chủ đọc từ tài khoản ({ lv, w, m } | null = khách); máy chủ cũ không gửi -> undefined
          this.mySkill = d.k;
          (d.peers || []).forEach(p => this.peers.set(p.id, { id: p.id, name: p.name, k: p.k, rtt: 0, lastSeen: localNow() }));
          if (!this.clockSynced && typeof d.s === 'number') this.clockOffset = d.s - localNow();
          this.ready = true;
          this._startPing();
          this._emit('$ready', this._readyInfo(), this.myId);
          return;
        }
        case '@peer_join':
          this.peers.set(d.id, { id: d.id, name: d.name, k: d.k, rtt: 0, lastSeen: localNow() });
          this._emit('$peer_join', d, d.id);
          return;
        case '@peer_leave':
          this.peers.delete(d.id);
          this._emit('$peer_leave', d, d.id);
          return;
        case '@host':
          this._trace('host -> ' + d.id);
          this.hostId = d.id;
          this._emit('$host', d, d.id);
          return;
        case '@pong':
          this._onPong(d);
          return;
        case '@hb': {
          const p = this.peers.get(msg.f);
          if (p) { p.rtt = d.rtt || 0; p.lastSeen = localNow(); }
          return;
        }
        default:
          this._emit(msg.t, msg.d, msg.f);
      }
    }

    // ---------- BROADCASTCHANNEL ----------
    _connectBc(roomName) {
      this.mode = 'bc';
      if (!this.myId) this.myId = 'p' + randomId(8);
      this.roomName = roomName;
      this.joinTime = localNow();
      this.hostId = null;
      this.peers.clear();
      try {
        this.bc = new BroadcastChannel('spg_net_v2:' + roomName);
      } catch (e) {
        this.bc = null;
        this.goOffline();
        return;
      }
      this.bc.onmessage = (ev) => this._onBcMessage(ev.data);
      this._sendRaw({ t: '@hello', d: { name: this.name, jt: this.joinTime } });
      clearTimeout(this._bcJoinTimer);
      this._bcJoinTimer = setTimeout(() => this._bcFinishJoin(), NET_CONFIG.BC_JOIN_WAIT_MS);
      clearInterval(this._bcHbTimer);
      this._bcHbTimer = setInterval(() => this._bcHeartbeat(), NET_CONFIG.BC_HEARTBEAT_MS);
    }

    _bcRoomName(idx) {
      return idx <= 1 ? this.roomBase : this.roomBase + '#' + idx;
    }

    _bcFinishJoin() {
      this._bcElectHost(false);
      const host = this.peers.get(this.hostId);
      if (host && host.locked) {
        // Phòng đang trong trận -> sang phòng kế tiếp (giống máy chủ WebSocket)
        this._bcClose();
        this._bcRoomIndex++;
        this._connectBc(this._bcRoomName(this._bcRoomIndex));
        return;
      }
      if (this.peers.size === 0 && this._bcRoomIndex < 8) {
        // Một mình trong phòng: có thể sảnh chờ thật đang ở phòng kế tiếp (phòng này vừa trống) -> dò trước
        this._bcProbeFrom(this._bcRoomIndex + 1, (foundIdx) => {
          if (foundIdx && this.mode === 'bc') {
            this._bcClose();
            this._bcRoomIndex = foundIdx;
            this._connectBc(this._bcRoomName(foundIdx));
          } else {
            this._bcSetReady();
          }
        });
        return;
      }
      this._bcSetReady();
    }

    _bcSetReady() {
      this.ready = true;
      this._startPing();
      this._emit('$ready', this._readyInfo(), this.myId);
    }

    // Dò phòng idx: có thành viên & chưa khóa -> vào phòng đó; có thành viên nhưng đã khóa -> dò tiếp; trống -> dừng
    _bcProbeFrom(idx, done) {
      if (idx > 8) { done(0); return; }
      let ch = null;
      try { ch = new BroadcastChannel('spg_net_v2:' + this._bcRoomName(idx)); } catch (e) { done(0); return; }
      let any = false, open = false;
      ch.onmessage = (ev) => {
        const m = ev.data;
        if (m && m.t === '@probe_ack') { any = true; if (!(m.d && m.d.lk)) open = true; }
      };
      try { ch.postMessage({ t: '@probe', f: this.myId, d: null }); } catch (e) {}
      setTimeout(() => {
        try { ch.close(); } catch (e) {}
        if (open) done(idx);
        else if (any) this._bcProbeFrom(idx + 1, done);
        else done(0);
      }, 250);
    }

    // Trạng thái khóa của phòng = trạng thái khóa của chủ phòng
    _roomLocked() {
      if (this.isHost) return this.locked;
      const host = this.peers.get(this.hostId);
      return !!(host && host.locked);
    }

    _bcClose() {
      clearTimeout(this._bcJoinTimer);
      clearInterval(this._bcHbTimer);
      if (this.bc) {
        try { this.bc.postMessage({ t: '@bye', f: this.myId, d: null }); } catch (e) {}
        try { this.bc.close(); } catch (e) {}
      }
      this.bc = null;
    }

    _bcHeartbeat() {
      if (this.mode !== 'bc' || !this.bc) return;
      this._sendRaw({ t: '@hb', d: { name: this.name, jt: this.joinTime, rtt: Math.round(this.rtt), lk: this.locked ? 1 : 0 } });
      // Loại bỏ các tab im lặng quá lâu (đóng tab đột ngột / treo)
      const now = localNow();
      const gone = [];
      this.peers.forEach((p, id) => { if (now - p.lastSeen > NET_CONFIG.BC_PEER_TIMEOUT_MS) gone.push(id); });
      gone.forEach(id => {
        this.peers.delete(id);
        if (this.ready) this._emit('$peer_leave', { id }, id);
      });
      if (gone.length) this._bcElectHost(true);
    }

    // Chủ phòng = thành viên vào phòng sớm nhất (hòa thì so mã định danh)
    _bcElectHost(emit) {
      let bestId = this.myId;
      let bestJt = this.joinTime;
      this.peers.forEach(p => {
        if (p.jt < bestJt || (p.jt === bestJt && p.id < bestId)) {
          bestJt = p.jt;
          bestId = p.id;
        }
      });
      const prev = this.hostId;
      this.hostId = bestId;
      if (emit && this.ready && prev !== bestId) this._emit('$host', { id: bestId }, bestId);
    }

    _bcUpsertPeer(id, d) {
      let p = this.peers.get(id);
      const isNew = !p;
      if (!p) {
        p = { id, name: '', rtt: 0, jt: Infinity, lastSeen: 0, locked: false };
        this.peers.set(id, p);
      }
      if (d) {
        if (typeof d.name === 'string') p.name = d.name;
        if (typeof d.jt === 'number') p.jt = d.jt;
        if (typeof d.rtt === 'number') p.rtt = d.rtt;
        if (d.lk !== undefined) p.locked = !!d.lk;
      }
      p.lastSeen = localNow();
      if (isNew && this.ready) {
        this._emit('$peer_join', { id, name: p.name }, id);
        this._bcElectHost(true);
      }
      return p;
    }

    _onBcMessage(m) {
      if (!m || typeof m.t !== 'string' || m.f === this.myId) return;
      if (m.to && m.to !== this.myId) return;
      this.stats.recv++;
      const d = m.d || {};
      switch (m.t) {
        case '@hello':
          this._bcUpsertPeer(m.f, d);
          this._sendRaw({ t: '@hello_ack', d: { name: this.name, jt: this.joinTime, lk: this.locked ? 1 : 0 }, to: m.f });
          return;
        case '@probe':
          if (this.ready) this._sendRaw({ t: '@probe_ack', d: { lk: this._roomLocked() ? 1 : 0 }, to: m.f });
          return;
        case '@hello_ack':
        case '@hb':
          this._bcUpsertPeer(m.f, d);
          return;
        case '@bye':
          if (this.peers.has(m.f)) {
            this.peers.delete(m.f);
            if (this.ready) this._emit('$peer_leave', { id: m.f }, m.f);
            this._bcElectHost(true);
          }
          return;
        case '@ping':
          this._sendRaw({ t: '@pong', d: { c: d.c, s: this.now() }, to: m.f });
          return;
        case '@pong':
          this._onPong(d);
          return;
        default:
          if (this.peers.has(m.f)) this.peers.get(m.f).lastSeen = localNow();
          this._emit(m.t, m.d, m.f);
      }
    }

    _sayGoodbye() {
      if (this.mode === 'bc') this._bcClose();
      else if (this.mode === 'ws' && this.ws) { try { this.ws.close(1000); } catch (e) {} }
    }

    // ---------- PING & ĐỒNG BỘ ĐỒNG HỒ ----------
    _startPing() {
      if (this._pingTimer) return;
      this._pingCount = 0;
      const tick = () => {
        this._sendPing();
        this._pingCount++;
        this._pingTimer = setTimeout(tick, this._pingCount < NET_CONFIG.PING_FAST_COUNT ? NET_CONFIG.PING_FAST_MS : NET_CONFIG.PING_MS);
      };
      tick();
    }

    _stopPing() {
      clearTimeout(this._pingTimer);
      this._pingTimer = null;
    }

    _sendPing() {
      const c = localNow();
      if (this.mode === 'ws') {
        this._sendRaw({ t: '@ping', d: { c } });
        if (this._pingCount % 3 === 0) this._sendRaw({ t: '@hb', d: { rtt: Math.round(this.rtt) } });
      } else if (this.mode === 'bc') {
        // Không có máy chủ: đồng bộ đồng hồ theo chủ phòng
        if (!this.isHost && this.hostId) this._sendRaw({ t: '@ping', d: { c }, to: this.hostId });
      }
    }

    // offset = thời gian máy chủ + RTT/2 - thời điểm nhận; chọn mẫu RTT nhỏ nhất (ít nhiễu hàng đợi nhất)
    _onPong(d) {
      if (!d || typeof d.c !== 'number' || typeof d.s !== 'number') return;
      const t3 = localNow();
      const rtt = Math.max(0, t3 - d.c);
      const offset = d.s + rtt / 2 - t3;
      this._clockSamples.push({ rtt, offset });
      if (this._clockSamples.length > NET_CONFIG.CLOCK_SAMPLES) this._clockSamples.shift();
      this.rtt = this.rtt ? (this.rtt * 0.8 + rtt * 0.2) : rtt;
      this.latency = this.rtt / 2;

      let best = this._clockSamples[0];
      for (const s of this._clockSamples) if (s.rtt < best.rtt) best = s;
      const diff = best.offset - this.clockOffset;
      if (!this.clockSynced || Math.abs(diff) > 250) {
        this.clockOffset = best.offset;
        this.clockSynced = true;
      } else {
        // Trượt dần đồng hồ để dòng thời gian nội suy không bị giật
        this.clockOffset += diff * 0.2;
      }
    }
  }

  // ==========================================
  // BỘ ĐỆM ẢNH CHỤP TRẠNG THÁI (SNAPSHOT INTERPOLATION)
  // Mỗi snapshot: { t (ms đồng hồ chung), x, z, b (bodyAngle rad), a (azimuth độ), e (elevation độ), s (speed) }
  // ==========================================
  class SnapshotBuffer {
    constructor() {
      this.snaps = [];
      this.vis = null;      // Trạng thái đang hiển thị (đã cộng sai số hòa trộn)
      this.lastRt = null;   // Thời điểm hiển thị của khung hình trước
      this.mode = 'none';
      this.avgInterval = 0; // Khoảng cách trung bình giữa các gói (ms)
      this.jitter = 0;      // Độ dao động khoảng cách gói (ms)
      this.delay = NET_CONFIG.INTERP_DELAY_MS;
    }

    // Trễ hiển thị thích ứng: luôn đủ để kẹp 2 gói kể cả khi máy gửi chạy chậm (vd 15 FPS -> gói ~66ms)
    renderDelay(dt) {
      const target = clamp(Math.max(NET_CONFIG.INTERP_DELAY_MS, this.avgInterval * 1.5 + this.jitter * 2),
        NET_CONFIG.INTERP_DELAY_MS, NET_CONFIG.INTERP_DELAY_MAX_MS);
      // Đổi dần để dòng thời gian hiển thị không bị giật
      this.delay += (target - this.delay) * Math.min(1, (dt || 0.016) * 2);
      return this.delay;
    }

    clear() {
      this.snaps.length = 0;
      this.vis = null;
      this.lastRt = null;
    }

    push(s) {
      const n = this.snaps.length;
      if (n && s.t <= this.snaps[n - 1].t) {
        if (s.t === this.snaps[n - 1].t) this.snaps[n - 1] = s;
        return; // Gói cũ đến muộn: bỏ qua
      }
      if (n) {
        const gap = s.t - this.snaps[n - 1].t;
        if (gap > 0 && gap < 1000) {
          this.avgInterval = this.avgInterval ? this.avgInterval * 0.9 + gap * 0.1 : gap;
          this.jitter = this.jitter * 0.9 + Math.abs(gap - this.avgInterval) * 0.1;
        }
      }
      this.snaps.push(s);
      if (this.snaps.length > 32) this.snaps.shift();
    }

    latest() { return this.snaps.length ? this.snaps[this.snaps.length - 1] : null; }

    // Lấy mẫu trạng thái tại thời điểm rt: nội suy giữa 2 gói, hoặc ngoại suy có giới hạn
    sample(rt, out) {
      const snaps = this.snaps;
      const n = snaps.length;
      if (!n) return null;
      out = out || {};
      if (n === 1 || rt <= snaps[0].t) {
        const s = rt <= snaps[0].t ? snaps[0] : snaps[n - 1];
        out.x = s.x; out.z = s.z; out.b = s.b; out.a = s.a; out.e = s.e; out.s = s.s;
        this.mode = 'hold';
        return out;
      }
      const last = snaps[n - 1];
      if (rt >= last.t) {
        // NGOẠI SUY: dùng vận tốc ước lượng từ 2 gói cuối, tối đa EXTRAP_MAX_MS rồi giữ nguyên
        const prev = snaps[n - 2];
        const span = last.t - prev.t;
        const dt = Math.min(rt - last.t, NET_CONFIG.EXTRAP_MAX_MS);
        if (span > 0 && span < 1000) {
          const k = dt / span;
          out.x = last.x + (last.x - prev.x) * k;
          out.z = last.z + (last.z - prev.z) * k;
          out.b = last.b + wrapPi(last.b - prev.b) * k;
          out.a = norm360(last.a + wrap180(last.a - prev.a) * k);
          out.e = last.e + (last.e - prev.e) * k;
          out.s = last.s;
        } else {
          out.x = last.x; out.z = last.z; out.b = last.b; out.a = last.a; out.e = last.e; out.s = last.s;
        }
        this.mode = 'extrap';
        return out;
      }
      // NỘI SUY: tìm 2 gói kẹp rt (duyệt từ cuối vì rt thường gần gói mới nhất)
      let i = n - 2;
      while (i > 0 && snaps[i].t > rt) i--;
      const s0 = snaps[i];
      const s1 = snaps[i + 1];
      const span = s1.t - s0.t;
      const t = span > 0 ? (rt - s0.t) / span : 1;
      out.x = s0.x + (s1.x - s0.x) * t;
      out.z = s0.z + (s1.z - s0.z) * t;
      out.b = lerpAngleRad(s0.b, s1.b, t);
      out.a = lerpAngleDeg(s0.a, s1.a, t);
      out.e = s0.e + (s1.e - s0.e) * t;
      out.s = s0.s + (s1.s - s0.s) * t;
      this.mode = 'interp';
      // Dọn các gói quá cũ (giữ lại 2 gói trước rt)
      if (i > 2) this.snaps.splice(0, i - 2);
      return out;
    }

    // Trạng thái hiển thị mượt: vis = mẫu(rt) + sai số; sai số = vis cũ - mẫu lại(rt cũ) với dữ liệu mới,
    // rồi giảm dần theo hàm mũ -> gói đến muộn được hòa trộn êm thay vì giật
    update(rt, dt) {
      if (!this.snaps.length) return null;
      // Lấy mẫu lại thời điểm hiển thị cũ bằng dữ liệu MỚI trước, rồi mới lấy mẫu thời điểm hiện tại
      const prevNow = (this.vis && this.lastRt !== null) ? this.sample(this.lastRt, this._tmpP || (this._tmpP = {})) : null;
      const target = this.sample(rt, this._tmpT || (this._tmpT = {}));
      if (!target) return null;
      let ex = 0, ez = 0, eb = 0, ea = 0, ee = 0;
      if (this.vis && prevNow) {
        ex = this.vis.x - prevNow.x;
        ez = this.vis.z - prevNow.z;
        eb = wrapPi(this.vis.b - prevNow.b);
        ea = wrap180(this.vis.a - prevNow.a);
        ee = this.vis.e - prevNow.e;
        if (Math.hypot(ex, ez) > NET_CONFIG.SNAP_DISTANCE) {
          ex = ez = eb = ea = ee = 0; // Sai lệch quá lớn: nhảy thẳng tới vị trí mới
        } else {
          const decay = Math.exp(-Math.max(0, dt) / NET_CONFIG.CORRECTION_TAU_S);
          ex *= decay; ez *= decay; eb *= decay; ea *= decay; ee *= decay;
        }
      }
      const vis = this.vis || (this.vis = {});
      vis.x = target.x + ex;
      vis.z = target.z + ez;
      vis.b = wrapPi(target.b + eb);
      vis.a = norm360(target.a + ea);
      vis.e = target.e + ee;
      vis.s = target.s;
      this.lastRt = rt;
      return vis;
    }
  }

  // ==========================================
  // BÙ TRỄ ĐẠN: CHO VIÊN ĐẠN BAY TRƯỚC MỘT ĐOẠN BẰNG ĐỘ TRỄ ĐO ĐƯỢC
  // Mô phỏng cùng công thức với BallisticsSystem3D.updateShells3D (gió, cản, trọng lực), không xét va chạm;
  // dừng sớm nếu sắp chạm đất / sắp nổ chùm / hết tầm để khung hình kế tiếp tự xử lý va chạm như thường.
  // ==========================================
  // Đoạn bay bù trễ (a -> b) chạm vật cản / thân xe? (cứ điểm, nhà, bao cát / đá / công sự, thân cây, hộp thân xe — đạn
  // ngòi cận đích: nới rộng quanh xe địch). Trước đây bù trễ tới 400 ms (~660 đv) không xét gì ngoài mặt đất / nước ->
  // đạn hiện ra phía sau tường / xuyên qua xe
  function shellPathBlocked(ballistics, s, ax, ay, az, bx, by, bz, terrain) {
    if (terrain) {
      if (terrain.strongholdSegmentHit && terrain.strongholdSegmentHit(ax, ay, az, bx, by, bz)) return true;
      if (terrain.buildingSegmentHit && terrain.buildingSegmentHit(ax, ay, az, bx, by, bz)) return true;
      if (ballistics.obstacleSegmentHit) {
        const ceil = terrain.shotCeiling ? terrain.shotCeiling() : Infinity;
        if (ballistics.obstacleSegmentHit(terrain, ax, ay, az, bx, by, bz, !!terrain.buildingSegmentHit, ceil)) return true;
      }
    }
    const veg = terrain && terrain.trees;
    if (veg && veg.trunkHit && veg.trunkHit(ax, ay, az, bx, by, bz)) return true;
    const units = ballistics._lastUnits;
    const SB = typeof Strongholds !== 'undefined' && Strongholds.segUnitBox;
    if (units && SB) {
      const BS = typeof BallisticsSystem3D !== 'undefined' ? BallisticsSystem3D : null;
      const prox = BS && BS.PROX_FUZE && BS.PROX_FUZE[s.ammoType] ? (BS.PROX_PAD_HEAVY || 24) : 0;
      for (const u of units) {
        if (!u || u.id === s.shooterId || u._netHidden || u._netStale) continue;
        if (u.isDead && !(u.dmg && u.group && u.group.visible)) continue;
        const pad = prox && !u.isDead && (!s.shooterTeam || u.team !== s.shooterTeam) ? prox : 1.0;
        if (SB(u, ax, ay, az, bx, by, bz, pad) >= 0) return true;
      }
    }
    return false;
  }

  function advanceShell(ballistics, s, seconds, terrain) {
    if (!ballistics || !s || !(seconds > 0)) return;
    const mult = ballistics.bulletSpeedMultiplier || 1;
    let remaining = seconds * mult;
    const maxStep = 0.006 * mult;
    const wind = ballistics.wind || { vx: 0, vz: 0 };
    // dò va chạm theo từng khúc ~24 đv (gộp nhiều bước nhỏ): khúc nào chạm vật cản / xe -> lùi về đầu khúc, dừng bù trễ để
    // vòng bay thật (updateShells3D) xử lý va chạm đúng chỗ
    const snap = () => ({ x: s.x, y: s.y, z: s.z, vx: s.vx, vy: s.vy, vz: s.vz, timeAlive: s.timeAlive, travel: s.travel });
    let chunk = snap();
    let blocked = false;
    while (remaining > 1e-6) {
      const h = Math.min(maxStep, remaining);
      remaining -= h;
      const save = snap();

      s.timeAlive = (s.timeAlive || 0) + h;
      // Cùng vật lý với BallisticsSystem3D: tên lửa dẫn hướng tự lái, đạn thường bay theo g / k riêng của phát bắn
      if (s.guide && ballistics.guideMissile) ballistics.guideMissile(s, h, ballistics._lastUnits || null, terrain);
      else if (ballistics.integrateFlight) ballistics.integrateFlight(s, h);
      else {
        s.vx += (wind.vx - s.vx) * ballistics.windDriftCoeff * h;
        s.vz += (wind.vz - s.vz) * ballistics.windDriftCoeff * h;
        const vMag = Math.hypot(s.vx, s.vy, s.vz);
        const drag = ballistics.dragCoeff * (s.dragMul || 1) * vMag * h;
        s.vx -= s.vx * drag;
        s.vy -= s.vy * drag;
        s.vz -= s.vz * drag;
        s.vy -= ballistics.gravity * h;
      }
      const px = s.x, py = s.y, pz = s.z;
      s.x += s.vx * h;
      s.y += s.vy * h;
      s.z += s.vz * h;
      s.travel = (s.travel || 0) + Math.hypot(s.x - px, s.y - py, s.z - pz);

      let stop = false;
      if (s.maxTravel && s.travel > s.maxTravel * 0.98) stop = true;
      if (terrain && typeof terrain.getElevationAt === 'function') {
        const g = terrain.getElevationAt(s.x, s.z);
        if (s.y <= g + 2) stop = true;
        // tới mặt nước: dừng bù trễ để vòng bay thật xử lý (đạn đâm xuống nước / nảy) giống máy bắn
        const wl = typeof terrain.waterSurfaceAt === 'function' ? terrain.waterSurfaceAt(s.x, s.z) : null;
        if (wl !== null && wl !== undefined && s.y <= wl + 2) stop = true;
        if (s.ammoType === 'CLUSTER' && s.vy < -12 && (s.y - g) <= 175) stop = true;
      }
      if (stop) {
        Object.assign(s, save);
        break;
      }
      const cdx = s.x - chunk.x, cdy = s.y - chunk.y, cdz = s.z - chunk.z;
      if (cdx * cdx + cdy * cdy + cdz * cdz >= 24 * 24) {
        if (shellPathBlocked(ballistics, s, chunk.x, chunk.y, chunk.z, s.x, s.y, s.z, terrain)) { Object.assign(s, chunk); blocked = true; break; }
        chunk = snap();
      }
    }
    // khúc cuối (hết thời gian bù / dừng vì sắp chạm đất) chưa dò
    if (!blocked && (s.x !== chunk.x || s.y !== chunk.y || s.z !== chunk.z) &&
        shellPathBlocked(ballistics, s, chunk.x, chunk.y, chunk.z, s.x, s.y, s.z, terrain)) Object.assign(s, chunk);
    if (s.mesh) s.mesh.position.set(s.x, s.y, s.z);
  }

  // ==========================================
  // ĐỒNG BỘ TRẬN ĐẤU (GẮN VÀO ArtilleryGame3D KHI XUẤT TRẬN)
  // Mô hình chủ quyền:
  //  - Mỗi xe có 1 máy chủ quyền (owner): xe người chơi -> máy của người đó; bot / xe của người đã thoát -> chủ phòng
  //  - Máy chủ quyền mô phỏng xe (lái, AI) và phát trạng thái; máy khác chỉ hiển thị nội suy (xe bản sao)
  //  - Sát thương do máy bắn quyết định (máy chủ quyền của xe bắn); nổ kho đạn / ngập nước do máy chủ quyền của xe bị trúng quyết định
  //  - Máy nhận áp dụng sự kiện DAMAGE, không tự tính sát thương cho đạn của máy khác
  // ==========================================
  const GUN_STREAM_AMMO = { GATLING_BULLET: 1, SCOUT_BULLET: 1, INCENDIARY: 1 }; // Đạn liên thanh: đồng bộ bằng cờ bắn
  const SRC_CODE = { DIRECT_HIT: 'D', SHELL: 'S', ZONE: 'Z', WATER: 'W' };
  const SRC_NAME = { D: 'DIRECT_HIT', S: 'SHELL', Z: 'ZONE', W: 'WATER' };
  const F_BUSH = 1, F_ERA = 2, F_GATLING = 4, F_DEAD = 8, F_CAMO = 16;

  class NetGameSync {
    static attach(game, net, slots) {
      if (!game) return null;
      if (game.netSync && typeof game.netSync.detach === 'function') game.netSync.detach();
      if (!net || !net.isOnline || !net.ready) return null;
      return new NetGameSync(game, net, slots);
    }

    constructor(game, net, slots) {
      this.game = game;
      this.net = net;
      this.detached = false;
      this.byNetId = [];
      this.buffers = [];
      this.known = {};          // Trạng thái lượng tử hóa đã biết theo xe (để ghép gói bỏ trường)
      this.lastSent = {};       // Trạng thái đã gửi lần trước theo xe
      this.tickAcc = 0;
      this.tickCount = 0;
      this.forceKeyframe = true;
      this.worldAcc = 0;
      this.pendingFires = [];
      this.pendingDamage = new Map();
      this._wShells = [];       // nhân chứng: đạn bản sao của xe khác -> khoảng cách gần nhất tới xe mình (witnessTick)
      this._wPend = [];         // nhân chứng: phát trúng xe mình chờ đối chiếu với đạn bản sao
      this._wAt = {};           // nhân chứng: lần ghi nhận gần nhất theo kẻ bắn (giãn cách báo cáo)
      this.pendingParts = new Set();   // xe vừa bị máy này bắn trúng -> gửi trạng thái hư hại bộ phận
      this.lastParts = {};             // bản tóm tắt bộ phận đã gửi gần nhất theo xe
      this.matchAcc = 0;
      this.envAcc = 0;
      this.envMismatch = 0;
      this._impactDepth = 0;
      this._applyingRemote = false;
      this._applyingRemoteFire = false;
      this._hitLogAt = 0;
      this._unsubs = [];

      (game.units || []).forEach((u, idx) => {
        u.netId = idx;
        this.byNetId[idx] = u;
        this.buffers[idx] = new SnapshotBuffer();
        this.wrapUnitDamage(u);
      });
      this.wrapBallistics(game.ballistics);
      this.wrapImpact(game);
      this.refreshOwnership();

      const sub = (type, fn) => this._unsubs.push(net.on(type, fn));
      sub('REMOTE_UNIT_SYNC', (d, from) => this.onUnitSync(d, from));
      // chỉ nhận gói gom nhịp do chính máy chủ phát (gói nhị phân), không nhận tin cùng tên do máy khác chuyển tiếp
      sub('SNAP', (d, from) => { if (from === '@server') this.onSnap(d); });
      sub('REMOTE_FIRE_EVENT', (d, from) => this.onRemoteFire(d, from));
      sub('DAMAGE', (d, from) => this.onDamage(d, from));
      sub('WORLD', (d, from) => this.onWorld(d, from));
      sub('SPOT', (d, from) => this.onSpot(d, from));
      sub('SMOKE', (d, from) => this.onSmoke(d, from));
      sub('DIG', (d, from) => this.onDig(d, from));
      sub('LOCK', (d, from) => this.onLock(d, from));
      sub('ENV_HIT', (d, from) => this.onEnvHit(d, from));
      sub('PARTS', (d, from) => this.onParts(d, from));
      sub('MATCH', (d, from) => this.onMatch(d, from));
      sub('SUPPLY', (d, from) => { if (from === this.net.hostId && !this.net.isHost && game.supplyManager && game.supplyManager.onNet) game.supplyManager.onNet(d); });
      // drone trinh sát của xe pháo: trạng thái / vị trí, phát trúng (máy người bắn báo), bị bắn hạ (drone_air.js)
      sub('DRONE', (d, from) => { if (game.onNetDrone) game.onNetDrone(d, from, this); });
      sub('DRONE_HIT', (d, from) => { if (game.onNetDroneHit) game.onNetDroneHit(d, from, this); });
      sub('DRONE_DOWN', (d, from) => { if (game.onNetDroneDown) game.onNetDroneDown(d, from, this); });
      sub('DRONE_LOCK', (d, from) => { if (game.onNetDroneLock) game.onNetDroneLock(d, from, this); });
      sub('AA_MG', (d, from) => { if (game.onNetAAmg) game.onNetAAmg(d, from, this); });
      sub('ENVSUM', (d, from) => this.onEnvSum(d, from));
      sub('ENVSTATE', (d, from) => this.onEnvState(d, from));
      sub('ENVFIX', (d, from) => this.onEnvFix(d, from));
      sub('$peer_join', () => { this.forceKeyframe = true; });
      sub('$peer_leave', () => { this.refreshOwnership(); this.forceKeyframe = true; });
      sub('$host', () => { this.refreshOwnership(); this.forceKeyframe = true; });

      game.netSync = this;
      if (typeof window !== 'undefined') window.netSync = this;
      // Mốc bắt đầu trận theo đồng hồ chung (đã đồng bộ với máy chủ) -> mọi máy cùng đồng hồ trận
      game.matchStartNet = this.net.now() - (Date.now() - (game.matchStartTime || Date.now()));
      this.wrapMatchEnd(game);
      // Khai báo trận cho máy chủ (lọc tầm nhìn chống hack nhìn xuyên, kiểm tra sát thương / tốc độ)
      try {
        const T = game.terrain;
        this.net.send('@match', {
          mapType: T ? T.mapType : '', seed: T ? (T.seed >>> 0) : 0,
          layout: (typeof MapGen !== 'undefined' && MapGen.getLayout) ? MapGen.getLayout() : 'CLASSIC',
          sig: T && T.map && T.map.sig ? T.map.sig : '',   // chữ ký bản đồ: máy chủ so với bản tự sinh, báo máy sinh lệch
          roster: this.byNetId.map((u, i) => ({ i, team: u.team, type: u.tankType, peer: u === game.player ? this.net.myId : (u.peerId || null),
            rd: (typeof Equipment !== 'undefined' && Equipment.has && u.tankType !== 'SCOUT' && Equipment.has(u, 'radar')) ? 1 : 0,   // radar lắp thêm: máy chủ mở rộng tầm nhìn
            cm: (typeof Equipment !== 'undefined' && Equipment.has && Equipment.has(u, 'camo')) ? 1 : 0 }))   // lưới ngụy trang (cờ F_CAMO chỉ được tin khi xe có lắp)
        });
      } catch (e) {}
      console.log(`[NET] Đồng bộ trận đấu (${net.mode}) | máy ${net.myId} | chủ phòng ${net.hostId} | ${this.byNetId.length} xe`);
    }

    detach() {
      if (!this.detached && this.net && this.net.isHost) { try { this.net.send('@match_end', {}); } catch (e) {} }
      this.detached = true;
      this._unsubs.forEach(fn => { try { fn(); } catch (e) {} });
      this._unsubs = [];
      if (this.game && this.game.netSync === this) this.game.netSync = null;
    }

    // ---------- CHỦ QUYỀN ----------
    ownerOf(unit) {
      const pid = unit && unit.peerId;
      if (pid && (pid === this.net.myId || this.net.peers.has(pid))) return pid;
      return this.net.hostId;
    }

    owns(unit) {
      if (!unit) return false;
      if (unit === this.game.player) return true;
      return this.ownerOf(unit) === this.net.myId;
    }

    refreshOwnership() {
      this.byNetId.forEach((u, idx) => {
        if (!u || u === this.game.player) return;
        const local = this.owns(u);
        const wasProxy = !!u._netProxy;
        u._netProxy = !local;
        // Xe bản sao không chạy AI (spg.js chỉ chạy AI khi !isPlayer && !isRemotePlayer)
        u.isRemotePlayer = !local;
        if (local && wasProxy) {
          // Vừa nhận quyền điều khiển (chủ phòng mới / người chơi thoát): AI tiếp quản từ trạng thái hiện tại
          u.isFiringGatling = false;
          this.buffers[idx].clear();
        } else if (!local && !wasProxy) {
          this.buffers[idx].clear();
        }
      });
    }

    // ---------- MÓC NỐI (WRAPPERS) ----------
    wrapUnitDamage(unit) {
      if (unit.__netDmgWrapped) return;
      const orig = unit.takeDamage;
      const game = this.game;
      unit.__netOrigTakeDamage = orig;
      unit.__netDmgWrapped = true;
      unit.takeDamage = function (amount, attacker, source) {
        const sync = game.netSync;
        if (!sync || sync.detached) return orig.apply(this, arguments);
        return sync.onLocalTakeDamage(this, orig, amount, attacker || null, source === undefined ? 'SHELL' : source);
      };
    }

    wrapBallistics(ballistics) {
      if (!ballistics || ballistics.__netWrapped) return;
      const orig = ballistics.fireShell3D;
      const game = this.game;
      ballistics.__netWrapped = true;
      ballistics.fireShell3D = function (shooter, azimuth, elevation, chargeLevel, ammoType) {
        const shell = orig.apply(this, arguments);
        const sync = game.netSync;
        if (sync && !sync.detached && shell && !sync._applyingRemoteFire) sync.noteLocalFire(shell, shooter, azimuth, elevation, chargeLevel);
        return shell;
      };
    }

    wrapImpact(game) {
      if (game.__netImpactWrapped) return;
      const orig = game.handleShellImpact;
      game.__netImpactWrapped = true;
      game.handleShellImpact = function () {
        const sync = this.netSync;
        if (!sync || sync.detached) return orig.apply(this, arguments);
        sync._impactDepth++;
        try {
          return orig.apply(this, arguments);
        } finally {
          sync._impactDepth--;
        }
      };
    }

    // Gọi từ handleShellImpact: true = đạn của máy khác -> chỉ hiển thị hiệu ứng, không tính sát thương
    skipShellDamage(shell, shooter) {
      if (!shell) return false;
      if (shell.netRemote) return true;
      if (shooter) return !this.owns(shooter);
      return false;
    }

    // ---------- SÁT THƯƠNG CÓ CHỦ QUYỀN ----------
    onLocalTakeDamage(unit, orig, amount, attacker, source) {
      if (this._applyingRemote) return orig.call(unit, amount, attacker, source);
      let auth;
      if (this._impactDepth > 0) auth = true;               // Trong vụ nổ do máy này có chủ quyền
      else if (attacker) auth = this.owns(attacker);
      else if (source === 'ZONE' || source === 'WATER') auth = this.owns(unit);   // Nổ kho đạn / ngập nước: máy chủ quyền của xe bị trúng
      else auth = true;                                     // Cháy âm ỉ: chỉ máy chủ quyền phát bắn mới châm lửa
      if (!auth) return { blocked: false, killed: false, prevHp: unit.hp, currentHp: unit.hp, netIgnored: true };

      const wasDead = unit.isDead;
      const prevHp = unit.hp;
      const res = orig.call(unit, amount, attacker, source);
      if (wasDead || !res || res.friendlyFire) return res;
      if (!res.blocked && !res.killed && res.currentHp === prevHp) return res; // Đang bất tử: không có gì để gửi
      unit._netLastDmgAt = this.net.now();
      if (res.killed) unit._netDeathAt = this.net.now();
      this.queueDamage(unit, attacker, Math.max(0, prevHp - res.currentHp), source, res, this._impactDepth > 0);
      return res;
    }

    queueDamage(victim, attacker, delta, source, res, inImpact) {
      if (victim.netId === undefined) return;
      const src = SRC_CODE[source] || 'S';
      const aid = (attacker && attacker.netId !== undefined) ? attacker.netId : -1;
      if (res.blocked || res.killed) {
        // Sự kiện quan trọng: gửi ngay (xả phần gộp trước để giữ thứ tự)
        this.flushDamage(victim.netId);
        this.net.send('DAMAGE', {
          v: victim.netId, a: aid, d: Math.round(delta * 1000), s: src,
          h: Math.round(Math.max(0, victim.hp) * 100), b: res.blocked ? 1 : 0, k: res.killed ? 1 : 0, o: (res.killed && inImpact) ? 1 : 0
        });
        return;
      }
      // Sát thương nhỏ liên tục (súng máy, cháy): gộp theo (xe bị trúng, kẻ bắn, nguồn) mỗi nhịp gửi
      const key = victim.netId + ':' + aid + ':' + src;
      const p = this.pendingDamage.get(key);
      if (p) {
        p.d += delta;
        p.h = victim.hp;
      } else {
        this.pendingDamage.set(key, { v: victim.netId, a: aid, s: src, d: delta, h: victim.hp });
      }
    }

    flushDamage(onlyVictim) {
      this.flushFires();   // tin "bắn" phải đi trước tin sát thương (máy chủ đối chiếu phát bắn thật)
      if (!this.pendingDamage.size) return;
      const done = [];
      this.pendingDamage.forEach((p, key) => {
        if (onlyVictim !== undefined && p.v !== onlyVictim) return;
        done.push(key);
        if (p.d <= 0) return;
        this.net.send('DAMAGE', { v: p.v, a: p.a, d: Math.round(p.d * 1000), s: p.s, h: Math.round(Math.max(0, p.h) * 100) });
      });
      done.forEach(k => this.pendingDamage.delete(k));
    }

    onDamage(d, from) {
      if (!d) return;
      const victim = this.byNetId[d.v];
      if (!victim) return;
      const attacker = (typeof d.a === 'number' && d.a >= 0) ? this.byNetId[d.a] : null;
      victim._netLastDmgAt = this.net.now();
      if (victim.isDead) return; // Đã bị phá hủy trên máy này (tránh áp 2 lần)

      const game = this.game;
      const orig = victim.__netOrigTakeDamage || (global.SPGUnit3D && global.SPGUnit3D.prototype.takeDamage);
      if (!orig) return;
      const source = SRC_NAME[d.s] || 'SHELL';
      const savedInv = victim.invulnerableTimer;
      let res = null;
      this._applyingRemote = true;
      try {
        victim.invulnerableTimer = 0; // Máy chủ quyền đã kiểm tra khiên bất tử
        if (d.b) {
          res = victim.hasReactiveArmor ? orig.call(victim, 0, null, 'SHELL') : { blocked: true, killed: false, currentHp: victim.hp };
        } else {
          const savedEra = victim.hasReactiveArmor;
          victim.hasReactiveArmor = false; // Máy chủ quyền đã quyết định không bị giáp ERA chặn
          const amt = d.k ? Math.max(0, victim.hp) + 1 : (d.d || 0) / 1000;
          res = orig.call(victim, amt, attacker, source);
          // Chỉ áp phần chênh lệch (không ghi đè máu tuyệt đối vì máy bắn có thể chưa biết sát thương của máy khác);
          // máu tuyệt đối hội tụ theo gói trạng thái của máy chủ quyền xe bị trúng
          if (!res.killed) victim.hasReactiveArmor = savedEra;
        }
      } finally {
        this._applyingRemote = false;
        if (!victim.isDead) victim.invulnerableTimer = savedInv;
      }
      if (!res) return;
      // nhân chứng: xe mình bị xe máy khác điều khiển bắn trúng -> lát nữa đối chiếu với đạn bản sao của xe đó
      if (attacker && victim === this.game.player && !this.owns(attacker) && (d.s === 'S' || d.s === 'D')) this.witnessHit(d.a, d.v);

      if (res.blocked) {
        if (typeof game.addCombatLog === 'function') {
          game.addCombatLog(`[[shield]] GIÁP PHẢN ỨNG NỔ CỦA ${victim.name} ĐÃ KÍCH NỔ CẢN PHÁ ĐẠN! KHÔNG MẤT MÁU!`, 'alert');
        }
      } else if (res.killed) {
        victim._netDeathAt = this.net.now();
        if (victim.isPlayer && typeof game.addCombatLog === 'function') {
          game.addCombatLog(`[[alert-triangle]] BỊ ${attacker ? attacker.name : 'ĐỊCH'} BẮN HẠ! PHÁ HỦY HOÀN TOÀN!`, 'alert');
        }
        if (d.o && typeof game.onUnitDestroyed === 'function') game.onUnitDestroyed(victim, attacker);
      } else if (victim.isPlayer && d.s !== 'Z') {
        const now = localNow();
        if (now - this._hitLogAt > 900 && typeof game.addCombatLog === 'function') {
          this._hitLogAt = now;
          game.addCombatLog(`[[alert-triangle]] BỊ BẮN TRÚNG (-${((d.d || 0) / 1000).toFixed(2)} MÁU)! CÒN ${victim.hp.toFixed(1)}/${victim.maxHp} MÁU!`, 'alert');
        }
      }
      if (typeof game.updateTeamScoreUI === 'function') game.updateTeamScoreUI();
    }

    // ---------- SỰ KIỆN BẮN (CÓ BÙ TRỄ) ----------
    noteLocalFire(shell, shooter, azimuth, elevation, chargeLevel) {
      if (!shell || shell._netQueued || shell.netRemote) return;
      if (!shooter || shooter.netId === undefined || !this.owns(shooter)) return;
      if (GUN_STREAM_AMMO[shell.ammoType]) return; // Đạn liên thanh đồng bộ qua cờ bắn trong gói trạng thái
      shell._netQueued = true;
      // Ghi lại tư thế đầu nòng ngay lúc bắn; các thuộc tính sát thương được đọc lúc xả hàng chờ (cuối khung hình)
      this.pendingFires.push({
        shell, shooter, ts: Math.round(this.net.now()),
        p: [shell.x, shell.y, shell.z], v: [shell.vx, shell.vy, shell.vz],
        az: azimuth, el: elevation, ch: chargeLevel
      });
    }

    netIdOfUnitId(id) {
      const u = this.byNetId.find(v => v && v.id === id);
      return u && u.netId !== undefined ? u.netId : undefined;
    }

    flushFires() {
      if (!this.pendingFires.length) return;
      const list = this.pendingFires;
      this.pendingFires = [];
      list.forEach(f => {
        const s = f.shell;
        this.net.send('REMOTE_FIRE_EVENT', {
          i: f.shooter.netId,
          ts: f.ts,
          am: s.ammoType,
          p: f.p.map(v => Math.round(v * 100)),
          v: f.v.map(v => Math.round(v * 100)),
          az: Math.round((f.az || 0) * 10),
          el: Math.round((f.el || 0) * 10),
          ch: f.ch || 1,
          dm: typeof s.damage === 'number' ? Math.round(s.damage * 1000) : undefined,
          h: s.isHeavyArty ? 1 : 0,
          at: s.isAntiTank ? 1 : 0,
          bs: typeof s.burstSeed === 'number' ? s.burstSeed >>> 0 : undefined,   // hạt giống nổ trên tán
          // tên lửa dẫn hướng: xe mục tiêu (netId) hoặc điểm ngắm -> máy khác lái tên lửa giống hệt
          tg: s.guide && s.guide.targetId ? this.netIdOfUnitId(s.guide.targetId) : undefined,
          // tên lửa đánh drone: xe chủ drone (netId) — máy khác dẫn theo đúng drone đó
          ad: s.guide && s.guide.airOwner !== undefined && s.guide.airOwner !== null ? this.netIdOfUnitId(s.guide.airOwner) : undefined,
          gp: s.guide && !s.guide.targetId && !(s.guide.airOwner !== undefined && s.guide.airOwner !== null) && s.guide.point ? [Math.round(s.guide.point.x), Math.round(s.guide.point.y), Math.round(s.guide.point.z)] : undefined,
          // tên lửa đột nóc từ bệ nóc tháp xe tăng (drone_air.fireRoofMissile): máy khác phóng từ đúng ống, phóng nguội + vồng cao
          tk: s.topMsl ? 1 : undefined
        });
      });
    }

    onRemoteFire(d, from) {
      if (!d || !d.p || !d.v) return;
      const unit = this.byNetId[d.i];
      if (!unit || this.owns(unit)) return;
      const ballistics = this.game.ballistics;
      if (!ballistics) return;
      const az = (d.az || 0) / 10;
      const el = (d.el || 0) / 10;
      const ammo = d.am || 'NORMAL';
      const px = d.p[0] / 100, py = d.p[1] / 100, pz = d.p[2] / 100;
      const vx = d.v[0] / 100, vy = d.v[1] / 100, vz = d.v[2] / 100;

      let shell = null;
      this._applyingRemoteFire = true;
      // vận tốc thật ghi đè ngay sau -> fireShell3D bỏ mô phỏng cự ly + tản mát (không làm lệch độ nở của xe bản sao)
      ballistics._remoteShot = true;
      // Tên lửa dẫn hướng: cùng mục tiêu / điểm ngắm như trên máy bắn
      if (d.ad !== undefined) {
        const ou = this.byNetId[d.ad];
        unit.missileTarget = ou ? { air: ou } : null;
      } else if (d.tg !== undefined || d.gp) {
        const tu = d.tg !== undefined ? this.byNetId[d.tg] : null;
        unit.missileTarget = tu ? { unit: tu } : (d.gp ? { point: { x: d.gp[0], y: d.gp[1], z: d.gp[2] } } : null);
      } else if (ammo === 'ANTI_TANK_MISSILE') unit.missileTarget = null;
      try {
        if (d.tk && !unit.isDead && this.game.fireRoofMissile) shell = this.game.fireRoofMissile(unit, true);
        else if (!unit.isDead) shell = this.refireOnProxy(unit, ammo, az, el, d.ch || 1);
        if (!shell) {
          // Dự phòng: tạo viên đạn trực tiếp từ tư thế đầu nòng gửi kèm (không có hiệu ứng khai hỏa)
          const dir = (typeof THREE !== 'undefined') ? new THREE.Vector3(vx, vy, vz).normalize() : null;
          unit._launchOverride = dir ? { position: new THREE.Vector3(px, py, pz), direction: dir } : null;
          try {
            shell = ballistics.fireShell3D(unit, az, el, d.ch || 1, ammo);
          } finally {
            unit._launchOverride = null;
          }
        }
      } catch (e) {
        console.warn('[NET] Không tái hiện được phát bắn từ xa:', e);
      } finally {
        this._applyingRemoteFire = false;
        ballistics._remoteShot = false;
      }
      if (!shell) return;
      this._wTrackNext = { a: d.i, art: unit.tankType === 'ARTILLERY' };
      if (d.tk && !shell.topMsl && this.game.roofMissileProfile) this.game.roofMissileProfile(shell);

      shell.netRemote = true;
      shell.ammoType = ammo;
      shell.isSpecialAmmo = ammo !== 'NORMAL';
      if (typeof d.dm === 'number') shell.damage = d.dm / 1000;
      shell.isHeavyArty = !!d.h;
      if (d.at) shell.isAntiTank = true;
      if (typeof d.bs === 'number') shell.burstSeed = d.bs >>> 0;
      shell.x = px; shell.y = py; shell.z = pz;
      shell.vx = vx; shell.vy = vy; shell.vz = vz;
      shell.timeAlive = 0;
      shell.travel = 0;

      // Bù trễ: đạn đã bay được (bây giờ - thời điểm bắn) trên máy của người bắn
      let lagMs = this.net.now() - (d.ts || 0);
      if (!(lagMs >= 0) || lagMs > 1500) lagMs = this.net.latency || 0; // Đồng hồ chưa đồng bộ: dùng trễ ước lượng
      lagMs = clamp(lagMs, 0, NET_CONFIG.MAX_LAG_COMP_MS);
      advanceShell(ballistics, shell, lagMs / 1000, this.game.terrain);
      if (this._wTrackNext) { this.witnessTrack(shell, this._wTrackNext.a, this._wTrackNext.art, { x: px, y: py, z: pz }); this._wTrackNext = null; }
      if (shell.mesh) {
        shell.mesh.position.set(shell.x, shell.y, shell.z);
        if (typeof THREE !== 'undefined') {
          const dir = new THREE.Vector3(shell.vx, shell.vy, shell.vz);
          if (dir.lengthSq() > 0.01) shell.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
        }
      }
    }

    // ---------- NHÂN CHỨNG CHÉO (chống bắn xuyên địa hình / "đạn ma") ----------
    // Mỗi phát bắn của máy khác đều có 1 viên đạn bản sao bay trên máy này (cùng vật lý, gió, địa hình). Máy khác báo bắn
    // trúng xe của máy này mà không viên bản sao nào của kẻ bắn bay tới gần (cắm vào đồi / nhà trên đường bay) -> báo
    // máy chủ 1 tin WITNESS nhỏ. Máy chủ chỉ đếm, đối chiếu với phát trúng nó đã kiểm tra, cần nhiều nhân chứng khác nhau
    // mới ghi nghi vấn (server_auth.js onWitness). Chi phí: vài phép tính / khung cho số đạn đang bay.
    // from: điểm đầu nòng (gói bắn) — đoạn từ đó tới vị trí sau bù trễ cũng tính (bù trễ có thể nhảy cả trăm đơn vị)
    witnessTrack(shell, a, art, from) {
      const P = this.game.player;
      if (!P) return;
      const w = { s: shell, a, art, t: localNow(), minD: Infinity, l: from || { x: shell.x, y: shell.y, z: shell.z } };
      this.witnessMeasure(w, P, shell);
      this._wShells.push(w);
      if (this._wShells.length > 200) this._wShells.shift();
    }
    // Khoảng cách gần nhất từ tâm xe mình tới ĐOẠN đạn bay từ lần đo trước tới điểm q (đạn nhanh đi cả trăm đơn vị / khung)
    witnessMeasure(w, P, q) {
      const T = this.game.terrain, l = w.l;
      const px = P.x, pz = P.z, py = (P.y !== undefined ? P.y : (T && T.getElevationAt ? T.getElevationAt(px, pz) : 0)) + 10;
      const dx = q.x - l.x, dy = q.y - l.y, dz = q.z - l.z, L2 = dx * dx + dy * dy + dz * dz;
      const k = L2 > 1e-6 ? clamp(((px - l.x) * dx + (py - l.y) * dy + (pz - l.z) * dz) / L2, 0, 1) : 0;
      const d = Math.hypot(l.x + dx * k - px, l.y + dy * k - py, l.z + dz * k - pz);
      if (d < w.minD) w.minD = d;
      w.l = { x: q.x, y: q.y, z: q.z };
    }
    witnessHit(a, v) {
      const t = localNow();
      if (t - (this._wAt[a] || 0) < 2000) return;   // gộp các phát trúng dồn dập của cùng kẻ bắn
      this._wAt[a] = t;
      this._wPend.push({ a, v, t });
    }
    witnessTick(dt) {
      const P = this.game.player, B = this.game.ballistics, t = localNow();
      if (P && B && this._wShells.length) {
        const live = new Set(B.activeShells || []), mul = (B.bulletSpeedMultiplier || 1) * Math.min(0.1, dt || 0.016) * 1.5;
        for (const w of this._wShells) {
          if (w.done) continue;
          const s = w.s;
          if (!live.has(s)) {
            // đạn vừa nổ / biến mất ở khung này: tính nốt đoạn bay cuối (theo vận tốc cuối, rộng tay 1,5 khung)
            w.done = true;
            this.witnessMeasure(w, P, { x: w.l.x + (s.vx || 0) * mul, y: w.l.y + (s.vy || 0) * mul, z: w.l.z + (s.vz || 0) * mul });
            continue;
          }
          this.witnessMeasure(w, P, s);
        }
      }
      while (this._wShells.length && t - this._wShells[0].t > 20000) this._wShells.shift();
      // chờ 2,5 s sau phát trúng (đạn bản sao đến muộn hơn theo độ trễ mạng) rồi mới xét
      for (let i = this._wPend.length - 1; i >= 0; i--) {
        const p = this._wPend[i];
        if (t - p.t < 2500) continue;
        this._wPend.splice(i, 1);
        const mine = this._wShells.filter(w => w.a === p.a && w.t >= p.t - 15000 && w.t <= p.t + 1500);
        if (!mine.length) continue;   // không có đạn bản sao để đối chiếu (gói bắn thiếu dữ liệu): không kết luận
        const best = Math.min(...mine.map(w => w.minD));
        // ngưỡng rộng tay: người bắn thấy xe mình trễ 0,1-0,35 s (+ ping) -> đạn bản sao bay tới chỗ xe mình đứng lúc trước;
        // xe nhanh nhất ~150 đv/s -> lệch tới ~80 đv. Chỉ bắt "đạn ma" rõ ràng (cắm đồi / nhà ở xa, bay lệch hẳn)
        if (best > (mine[0].art ? 220 : 130)) this.net.send('WITNESS', { a: p.a, v: p.v, d: Math.round(best) });
      }
    }

    // Cho xe bản sao khai hỏa thật (lửa đầu nòng, giật nòng, âm thanh, radar) với đúng loại đạn đã bắn
    refireOnProxy(unit, ammo, az, el, ch) {
      const ballistics = this.game.ballistics;
      const radar = this.game.radar;
      unit.azimuth = az;
      unit.elevation = el;
      unit.charge = ch;
      if (ammo === 'ANTI_TANK_MISSILE') {
        if (typeof unit.fireAntiTank !== 'function') return null;
        unit.antiTankCooldown = 0;
        unit.missileAmmoCount = Math.max(1, unit.missileAmmoCount || 0);
        return unit.fireAntiTank(ballistics, radar);
      }
      if (typeof unit.fire !== 'function') return null;
      const savedAmmo = unit.selectedAmmo;
      unit.reloadTimer = 0;
      if (unit.tankType === 'ARTILLERY') unit.isDeployed = true;
      if (ammo === 'CLUSTER') { unit.selectedAmmo = 'CLUSTER'; unit.clusterAmmoCount = Math.max(1, unit.clusterAmmoCount || 0); }
      else if (ammo === 'AP') { unit.selectedAmmo = 'AP'; unit.apAmmoCount = Math.max(1, unit.apAmmoCount || 0); }
      else if (ammo === 'HE') { unit.selectedAmmo = 'HE'; unit.heAmmoCount = Math.max(1, unit.heAmmoCount || 0); }
      else unit.selectedAmmo = 'NORMAL';
      let shell = null;
      try {
        shell = unit.fire(ballistics, radar);
      } finally {
        unit.selectedAmmo = savedAmmo;
      }
      return shell;
    }

    // ---------- GÓI TRẠNG THÁI (LƯỢNG TỬ HÓA + BỎ TRƯỜNG KHÔNG ĐỔI + GỘP LÔ) ----------
    quantize(u) {
      let f = 0;
      if (u.isInBush) f |= F_BUSH;
      if (u.hasReactiveArmor) f |= F_ERA;
      if (u.isFiringGatling) f |= F_GATLING;
      if (u.isDead) f |= F_DEAD;
      // lưới ngụy trang đang che (đứng yên, chưa bắn, lưới không cháy / chưa mất): máy chủ thu tầm nhìn của địch
      if (!u.isDead && typeof Equipment !== 'undefined' && Equipment.camoHidden && Equipment.camoHidden(u)) f |= F_CAMO;
      return {
        x: Math.round(u.x * 10),                         // 0.1 đơn vị
        z: Math.round(u.z * 10),
        b: Math.round(wrapPi(u.bodyAngle || 0) * 1000),  // 0.001 rad (~0.06°)
        a: Math.round(norm360(u.azimuth || 0) * 10),     // 0.1°
        e: Math.round((u.elevation || 0) * 10),          // 0.1°
        s: Math.round((u.speed || 0) * 10),
        h: Math.round(Math.max(0, u.hp || 0) * 100),
        f: f,
        m: u.selectedAmmo || ''
      };
    }

    sendStates() {
      const keyframe = this.forceKeyframe || (this.tickCount % NET_CONFIG.KEYFRAME_EVERY === 0);
      this.forceKeyframe = false;
      const entries = [];
      this.byNetId.forEach((u, idx) => {
        if (!u || !this.owns(u)) return;
        const q = this.quantize(u);
        const prev = this.lastSent[idx];
        const e = { i: idx };
        for (const k in q) {
          if (keyframe || !prev || prev[k] !== q[k]) e[k] = q[k];
        }
        this.lastSent[idx] = q;
        entries.push(e); // Xe không đổi gì vẫn gửi {i} để bên nhận biết xe vẫn đứng yên ở thời điểm này
      });
      if (!entries.length) return;
      this.net.send('REMOTE_UNIT_SYNC', { ts: Math.round(this.net.now()), k: keyframe ? 1 : 0, u: entries });
    }

    onUnitSync(d, from) {
      if (!d || !d.u) return;
      const now = this.net.now();
      let ts = d.ts;
      // Đồng hồ hai bên chưa khớp (vừa vào phòng): lấy thời điểm nhận trừ trễ ước lượng
      if (typeof ts !== 'number' || Math.abs(now - ts) > 1500) ts = now - (this.net.latency || 0);
      for (const e of d.u) {
        const idx = e.i;
        const unit = this.byNetId[idx];
        if (!unit || this.owns(unit)) continue;
        if (this.ownerOf(unit) !== from) continue; // Chỉ nhận trạng thái từ đúng máy chủ quyền
        // Máy chủ báo xe địch đã khuất tầm nhìn phe mình (không gửi toạ độ) -> ẩn hẳn, không bắn trúng bóng ma
        if (e.hid) { unit._netHidden = true; continue; }
        unit._netHidden = false;
        const base = this.known[idx];
        if (!base && !d.k) continue; // Chưa có gói đầy đủ: chờ khung khóa (keyframe)
        const q = Object.assign({}, base || {}, e);
        this.known[idx] = q;
        this.applyFlags(unit, q, ts);
        this.buffers[idx].push({ t: ts, x: q.x / 10, z: q.z / 10, b: q.b / 1000, a: q.a / 10, e: q.e / 10, s: q.s / 10 });
      }
    }

    // Gói gom theo nhịp của máy chủ (nhị phân): nhiều xe của nhiều chủ quyền trong 1 gói; máy chủ đã xác thực chủ quyền
    onSnap(d) {
      if (!d || !d.u) return;
      const now = this.net.now();
      for (const e of d.u) {
        const idx = e.i, unit = this.byNetId[idx];
        if (!unit || this.owns(unit)) continue;
        if (e.hid) { unit._netHidden = true; continue; }
        unit._netHidden = false;
        const base = this.known[idx];
        if (!base && !e.full) continue;
        const q = e.full ? Object.assign({}, e.q) : Object.assign({}, base, e.q);
        this.known[idx] = q;
        let ts = e.ts;
        if (typeof ts !== 'number' || Math.abs(now - ts) > 1500) ts = now - (this.net.latency || 0);
        this.applyFlags(unit, q, ts);
        this.buffers[idx].push({ t: ts, x: q.x / 10, z: q.z / 10, b: q.b / 1000, a: q.a / 10, e: q.e / 10, s: q.s / 10 });
      }
    }

    applyFlags(unit, q, ts) {
      const now = this.net.now();
      const guard = unit._netLastDmgAt && (now - unit._netLastDmgAt < NET_CONFIG.DAMAGE_GUARD_MS);
      const ownerDead = !!(q.f & F_DEAD);
      unit.isFiringGatling = !!(q.f & F_GATLING);
      if (q.m) unit.selectedAmmo = q.m;

      if (!ownerDead && unit.isDead) {
        // Máy chủ quyền báo xe đã hồi sinh: hồi sinh bản sao tại đúng vị trí của chủ quyền
        if (!unit._netDeathAt || ts - unit._netDeathAt > NET_CONFIG.RESPAWN_CONFIRM_MS) this.respawnProxy(unit, q);
        return;
      }
      if (ownerDead && !unit.isDead) {
        // Lỡ mất sự kiện tiêu diệt: sau một lúc vẫn lệch thì cho bản sao chết theo chủ quyền
        if (!unit._netOwnerDeadSince) unit._netOwnerDeadSince = now;
        else if (now - unit._netOwnerDeadSince > NET_CONFIG.DAMAGE_GUARD_MS) this.forceKillProxy(unit);
        return;
      }
      unit._netOwnerDeadSince = 0;
      if (unit.isDead || guard) return;
      unit.hasReactiveArmor = !!(q.f & F_ERA);
      const hp = q.h / 100;
      if (Math.abs(hp - unit.hp) > 0.02 && hp > 0) unit.hp = Math.min(unit.maxHp || hp, hp); // Lưới an toàn hội tụ máu
    }

    respawnProxy(unit, q) {
      if (typeof unit.respawn !== 'function') return;
      unit.respawn(q.x / 10, q.z / 10);
      unit.bodyAngle = q.b / 1000;
      const game = this.game;
      if (game.respawnQueue) {
        for (let i = game.respawnQueue.length - 1; i >= 0; i--) {
          if (game.respawnQueue[i].unit === unit) game.respawnQueue.splice(i, 1);
        }
      }
      this.buffers[unit.netId].clear();
      unit._netDeathAt = 0;
      if (typeof game.updateAliveCount === 'function') game.updateAliveCount();
      if (typeof game.updateTeamScoreUI === 'function') game.updateTeamScoreUI();
    }

    forceKillProxy(unit) {
      const orig = unit.__netOrigTakeDamage;
      if (!orig) return;
      this._applyingRemote = true;
      try {
        unit.invulnerableTimer = 0;
        unit.hasReactiveArmor = false;
        orig.call(unit, Math.max(0, unit.hp) + 1, null, 'ZONE');
      } finally {
        this._applyingRemote = false;
      }
      unit._netOwnerDeadSince = 0;
      unit._netDeathAt = this.net.now();
      if (typeof this.game.updateAliveCount === 'function') this.game.updateAliveCount();
    }

    // Chủ phòng phát gió để mọi máy cùng quỹ đạo đạn
    sendWorld() {
      const g = this.game;
      const w = g.ballistics && g.ballistics.wind;
      const r1 = v => Math.round((v || 0) * 10) / 10;
      const data = {};
      if (w) data.w = [r1(w.direction), r1(w.speed)];
      this.net.send('WORLD', data);
    }

    // ---------- BÁO VỊ TRÍ (xe trinh sát khóa mục tiêu trong vùng radar) ----------
    // Phá hủy cảnh vật: máy có chủ quyền với viên đạn gửi điểm nổ chuẩn + hạt giống ngẫu nhiên,
    // máy khác áp đúng sự kiện đó (tường vỡ / nhà sập / hố bom giống hệt nhau trên mọi máy)
    sendEnvHit(d) {
      if (this.detached || !d) return;
      this.flushFires();
      const q = v => Math.round(v * 10) / 10;
      const m = { x: q(d.x), y: q(d.y), z: q(d.z), a: d.a, h: d.h ? 1 : 0, t: d.t, s: d.s >>> 0, dx: q(d.dx), dy: q(d.dy), dz: q(d.dz), os: d.os ? 1 : 0 };
      if (typeof d.nx === 'number') { m.nx = Math.round(d.nx * 100) / 100; m.nz = Math.round(d.nz * 100) / 100; }   // pháp tuyến tường bê tông (vết đạn)
      if (typeof d.ny === 'number') m.ny = Math.round(d.ny * 100) / 100;                                              // trúng sàn / mái nhà
      if (d.c) m.c = 1;                                                                                                  // đạn cháy 12.7mm (không phải 30mm)
      this.net.send('ENV_HIT', m);
    }

    onEnvHit(d, from) {
      if (this.detached || !d || !this.game || typeof this.game.applyEnvDamage !== 'function') return;
      if (![d.x, d.y, d.z].every(Number.isFinite)) return;
      this.game.applyEnvDamage(d, true);
    }

    sendSpot(spotter, target) {
      if (this.detached || !spotter || !target || spotter.netId === undefined || target.netId === undefined) return;
      this.net.send('SPOT', { s: spotter.netId, t: target.netId });
    }

    // Màn khói (trang bị): máy điều khiển xe phóng -> mọi máy dựng cùng đám khói (che tầm nhìn như nhau).
    // m: bên ống phóng còn bắn (1 trái, 2 phải, 3 cả hai); k: xe đang bị khóa -> khói đa phổ cắt khóa trên mọi máy
    sendSmoke(unit, r) {
      if (this.detached || !unit || unit.netId === undefined || !r) return;
      this.net.send('SMOKE', { i: unit.netId, x: r.x, z: r.z, a: r.a, m: r.m || 3, k: r.k ? 1 : 0 });
    }
    // Xe 6 nòng ủi đất (game.js startDig / updateDig / endDig): o = 'f' lưỡi đang hạ (k: mức đắp, m: đang đẩy tới),
    // 'b' bờ / luống đất cố định, 'p' hào, 'e' nâng lưỡi (keep: ụ trước lưỡi ở lại tại x, z, a)
    sendDig(m) {
      const P = this.game && this.game.player;
      if (this.detached || !m || !P || P.netId === undefined) return;
      const q = v => Math.round(v * 10) / 10, q3 = v => Math.round(v * 1000) / 1000;
      const o = { i: P.netId, o: m.o };
      for (const k of ['x', 'z', 'L', 'W', 'H', 'r', 'd', 'e']) if (typeof m[k] === 'number') o[k] = q(m[k]);
      for (const k of ['a', 'ux', 'uz', 'k']) if (typeof m[k] === 'number') o[k] = q3(m[k]);
      for (const k of ['c', 'm', 'w', 'keep']) if (m[k] !== undefined) o[k] = m[k] | 0;
      this.net.send('DIG', o);
    }
    onDig(d, from) {
      if (this.detached || !d || !this.game || typeof this.game.onNetDig !== 'function') return;
      const u = this.byNetId[d.i];
      if (!u || this.ownerOf(u) !== from || u.tankType !== 'GATLING') return;
      const need = { f: [], b: ['x', 'z', 'a', 'L', 'W', 'H', 'k'], p: ['x', 'z', 'r', 'ux', 'uz', 'd', 'e'], e: d.keep ? ['x', 'z', 'a', 'k'] : [] }[d.o];
      if (!need || !need.every(k => Number.isFinite(d[k]))) return;
      if (d.o === 'b' && (d.L > 60 || d.W > 30 || d.H > 30)) return;
      if (d.o === 'p' && (d.r > 400 || d.d > 20 || d.e > 12)) return;
      this.game.onNetDig(u, d);
    }

    onSmoke(d, from) {
      if (this.detached || !d) return;
      const u = this.byNetId[d.i];
      if (!u || u.isDead || this.ownerOf(u) !== from) return;
      if (![d.x, d.z, d.a].every(Number.isFinite)) return;
      if (typeof global.Equipment !== 'undefined' && global.Equipment.deploySmoke) {
        const m = (d.m | 0) & 3 || 3;
        u.smokeLeft = Math.max(0, (u.smokeLeft || 0) - global.Equipment.smokeCount(m));
        global.Equipment.deploySmoke(this.game, u, { x: d.x, z: d.z, a: d.a, m, k: d.k === 1 });
      }
    }

    onSpot(d, from) {
      if (this.detached || !d) return;
      const spotter = this.byNetId[d.s], target = this.byNetId[d.t];
      if (!spotter || !target || spotter.isDead || target.isDead) return;
      // Chỉ nhận báo cáo từ máy đang điều khiển xe trinh sát đó
      if (this.ownerOf(spotter) !== from) return;
      if (typeof global.TeamIntel !== 'undefined') global.TeamIntel.report(spotter, target, true);
    }

    // Trạng thái khóa mục tiêu (tia laser đo xa / dẫn tên lửa chiếu vào xe địch): gửi khi đổi + nhắc lại mỗi 1.5 s
    // để máy của xe bị khóa hiện cảnh báo. m: 1 = khóa súng, 2 = khóa tên lửa
    sendLocks() {
      if (this.detached) return;
      const now = Date.now();
      if (!this._lockSent) this._lockSent = new Map();
      this.byNetId.forEach((u, idx) => {
        if (!u || !this.owns(u)) return;
        const L = u._lockOn;
        const T = L && now - L.at < 3500 ? this.byNetId.find(v => v && v.id === L.id) : null;
        const key = T && !u.isDead ? T.netId + ':' + L.m : '';
        const prev = this._lockSent.get(idx);
        if (!prev && !key) return;
        if (prev && prev.key === key && (!key || now - prev.t < 1500)) return;
        this._lockSent.set(idx, { key, t: now });
        this.net.send('LOCK', key ? { i: idx, t: T.netId, m: L.m } : { i: idx, t: -1, m: 0 });
      });
    }

    onLock(d, from) {
      if (this.detached || !d) return;
      const u = this.byNetId[d.i];
      if (!u || this.owns(u) || this.ownerOf(u) !== from) return;   // chỉ máy điều khiển xe đó được báo
      const T = d.t >= 0 ? this.byNetId[d.t] : null;
      u._lockOn = T ? { id: T.id, m: d.m === 2 ? 2 : 1, at: Date.now() } : null;
    }

    onWorld(d, from) {
      if (!d || this.net.isHost || from !== this.net.hostId) return;
      const g = this.game;
      const w = g.ballistics && g.ballistics.wind;
      if (w && d.w) {
        w.direction = d.w[0];
        w.speed = d.w[1];
        w.nextChange = 999; // Gió do chủ phòng quyết định
        if (typeof g.ballistics.updateWindVectors === 'function') g.ballistics.updateWindVectors();
      }
    }

    // ---------- VÒNG LẶP MỖI KHUNG HÌNH ----------
    // Gọi trước khi cập nhật các xe: gửi gói định kỳ + đặt tư thế nội suy cho xe bản sao
    preUpdate(dt) {
      if (this.detached) return;
      this.flushFires();
      this.tickAcc += dt;
      const interval = 1 / NET_CONFIG.SEND_HZ;
      if (this.tickAcc >= interval) {
        this.tickAcc = Math.min(this.tickAcc - interval, interval);
        this.tickCount++;
        this.sendStates();
        this.flushDamage();
        this.flushParts();   // sau gói sát thương (máy chủ cần thấy phát trúng trước khi nhận hư hại bộ phận)
        this.sendLocks();
      }
      if (this.net.isHost) {
        this.worldAcc += dt * 1000;
        if (this.worldAcc >= NET_CONFIG.WORLD_SYNC_MS) {
          this.worldAcc = 0;
          this.sendWorld();
        }
        this.matchAcc += dt * 1000;
        if (this.matchAcc >= NET_CONFIG.MATCH_SYNC_MS) { this.matchAcc = 0; if (!this.game.isGameOver) this.sendMatch(); }
        this.envAcc += dt * 1000;
        if (this.envAcc >= NET_CONFIG.ENV_SUM_MS) { this.envAcc = 0; this.sendEnvSum(); }
      }

      const now = this.net.now();
      this.byNetId.forEach((u, idx) => {
        if (!u) return;
        if (!u._netProxy || u.isDead) { u._netVis = null; return; }
        const buf = this.buffers[idx];
        const vis = buf.update(now - buf.renderDelay(dt), dt);
        u._netVis = vis;
        if (!vis) return;
        u.x = vis.x;
        u.z = vis.z;
        u.bodyAngle = vis.b;
        u.azimuth = vis.a;
        u.elevation = vis.e;
        u.speed = vis.s;
      });
    }

    // Gọi sau khi cập nhật các xe: ghi đè lại tư thế (update() tự tích phân vận tốc & đẩy va chạm)
    postUpdate(dt) {
      if (this.detached) return;
      const now = this.net.now();
      if (this.net.mode === 'ws') this.witnessTick(dt);
      this.byNetId.forEach((u, idx) => {
        if (!u) return;
        if (u.isDead && !u._netWasDead) { u._netDeathAt = now; this.lastParts[idx] = undefined; }
        if (!u.isDead && u._netWasDead) u._partsEpoch = now;   // đời xe mới: bỏ gói hư hại của đời trước
        u._netWasDead = u.isDead;
        if (u._netProxy && !u.isDead) {
          const sn = this.buffers[idx] && this.buffers[idx].snaps;
          const last = sn && sn.length ? sn[sn.length - 1].t : 0;
          u._netStale = !last || now - last > NET_CONFIG.STALE_MS;
        } else u._netStale = false;
        if (!u._netProxy || u.isDead || !u._netVis) return;
        const vis = u._netVis;
        u.x = vis.x;
        u.z = vis.z;
        u.bodyAngle = vis.b;
        if (u.group) {
          u.group.position.x = vis.x;
          u.group.position.z = vis.z;
          u.group.rotation.y = vis.b;
        }
      });
      // Xe bản sao bị hạ: chờ máy chủ quyền báo hồi sinh (gia hạn hàng chờ cục bộ để tránh hồi sinh sai chỗ)
      const q = this.game.respawnQueue;
      if (q) {
        for (const item of q) {
          if (item.unit && item.unit._netProxy && !item.netHold) {
            item.netHold = true;
            item.timer += 3;
            item.totalWait = (item.totalWait || item.timer) + 3;
          }
        }
      }
    }

    // ---------- HƯ HẠI BỘ PHẬN (máy có quyền với phát bắn gửi trạng thái, máy khác áp theo) ----------
    queueParts(u) {
      if (u && u.netId !== undefined && !u.isDead) this.pendingParts.add(u);
    }
    flushParts() {
      this.flushFires();
      if (!this.pendingParts.size || typeof VehicleDamage === 'undefined' || !VehicleDamage.digest) { this.pendingParts.clear(); return; }
      for (const u of this.pendingParts) {
        if (u.isDead) continue;
        const dg = VehicleDamage.digest(u), key = JSON.stringify(dg);
        if (this.lastParts[u.netId] === key) continue;
        this.lastParts[u.netId] = key;
        this.net.send('PARTS', { v: u.netId, s: dg, ts: Math.round(this.net.now()) });
      }
      this.pendingParts.clear();
    }
    onParts(d, from) {
      if (this.detached || !d || typeof VehicleDamage === 'undefined' || !VehicleDamage.applyDigest) return;
      const unit = this.byNetId[d.v];
      if (!unit || unit.isDead || !d.s) return;
      // gói của đời xe trước (trước khi hồi sinh) đến muộn: bỏ
      if (typeof d.ts === 'number' && unit._partsEpoch && d.ts < unit._partsEpoch) return;
      const fx = this.game.effectsManager && this.game.effectsManager.fx;
      const events = VehicleDamage.applyDigest(unit, d.s, fx, this.owns(unit));
      // trạng thái đã hội tụ: lần sau máy này bắn trúng sẽ gửi đúng phần chênh
      this.lastParts[d.v] = JSON.stringify(VehicleDamage.digest(unit));
      if (events.length && typeof this.game.reportVehicleDamage === 'function') this.game.reportVehicleDamage(unit, null, events);
    }

    // ---------- TRẬN ĐẤU: CHỦ PHÒNG LÀ NƠI DUY NHẤT QUYẾT ĐỊNH ĐỒNG HỒ, TỈ SỐ, CỜ CỨ ĐIỂM, KẾT QUẢ ----------
    isMatchAuthority() { return !!this.net.isHost; }
    matchState(end) {
      const g = this.game, d = {
        st: Math.round(g.matchStartNet || this.net.now()),
        k: [g.blueKills || 0, g.redKills || 0, g.blueDeaths || 0, g.redDeaths || 0]
      };
      const set = g.terrain && g.terrain.strongholdSet;
      if (set && set.items) {
        set.remoteCapture = false;   // máy này đang là chủ phòng (kể cả vừa được bầu lại): tự quyết định đổi chủ cờ
        d.sh = set.items.map(K => [K.id, Math.round((K.capture || 0) * 10) / 10, K.owner || '']);
      }
      const cpm = g.capturePointsManager;
      if (cpm && cpm.netState) d.cp = cpm.netState();   // đồng hồ giữ cứ điểm (thắng khi giữ đủ 60 s)
      if (end) d.end = end;
      return d;
    }
    sendMatch(end) {
      if (this.detached || !this.net.isHost) return;
      this.net.send('MATCH', this.matchState(end));
    }
    onMatch(d, from) {
      if (this.detached || !d || this.net.isHost || from !== this.net.hostId) return;
      const g = this.game;
      if (typeof d.st === 'number') {
        g.matchStartNet = d.st;
        g.matchStartTime = Date.now() - (this.net.now() - d.st);
      }
      if (Array.isArray(d.k)) {
        [g.blueKills, g.redKills, g.blueDeaths, g.redDeaths] = d.k;
        if (typeof g.updateTeamScoreUI === 'function') g.updateTeamScoreUI();
      }
      const set = g.terrain && g.terrain.strongholdSet;
      if (set && Array.isArray(d.sh) && set.applyCaptureState) set.applyCaptureState(d.sh);
      if (Array.isArray(d.cp) && g.capturePointsManager && g.capturePointsManager.applyNetState) g.capturePointsManager.applyNetState(d.cp);
      if (d.end && !g.isGameOver) {
        g._netEndFromHost = true;
        try {
          if (d.end.r === 'capture' && typeof g.finishMatchByCapture === 'function') g.finishMatchByCapture(d.end.w, d.end.cp);
          else if (typeof g.finishMatchByTime === 'function') g.finishMatchByTime();
        } finally { g._netEndFromHost = false; }
      }
    }
    // Chủ phòng kết thúc trận -> phát kết quả ngay (máy khác không tự kết thúc theo đồng hồ riêng)
    wrapMatchEnd(g) {
      if (!g || g._netEndWrapped) return;
      g._netEndWrapped = true;
      const wrap = (name, endOf) => {
        const orig = g[name];
        if (typeof orig !== 'function') return;
        g[name] = function (...args) {
          const ns = g.netSync;
          // máy không phải chủ phòng: chỉ kết thúc khi chủ phòng báo (trừ khi mất chủ phòng quá lâu — xem game.js)
          if (ns && !ns.detached && !ns.net.isHost && !g._netEndFromHost && !g._netEndFallback) return;
          const was = this.isGameOver;
          const out = orig.apply(this, args);
          if (!was && this.isGameOver && ns && !ns.detached && ns.net.isHost) ns.sendMatch(endOf.apply(this, args));
          return out;
        };
      };
      wrap('finishMatchByTime', () => ({ r: 'time' }));
      wrap('finishMatchByCapture', (w, cp) => ({ r: 'capture', w, cp }));
    }

    // ---------- CÔNG TRÌNH / CÂY: DẤU VÂN TAY TRẠNG THÁI & SỬA LỆCH (phá hủy chỉ cộng dồn -> lấy hợp) ----------
    envState() {
      const T = this.game.terrain;
      return T && T.envStateString ? T.envStateString() : '';
    }
    static hash(str) {
      let h = 0x811c9dc5;
      for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
      return h >>> 0;
    }
    sendEnvSum() {
      if (this.detached || !this.net.isHost) return;
      const st = this.envState();
      if (st) this.net.send('ENVSUM', { h: NetGameSync.hash(st) });
    }
    onEnvSum(d, from) {
      if (this.detached || !d || this.net.isHost || from !== this.net.hostId) return;
      const st = this.envState();
      if (!st) return;
      if (NetGameSync.hash(st) === d.h) { this.envMismatch = 0; return; }
      // lệch 2 lần liên tiếp (loại trừ sự kiện đang trên đường truyền) -> gửi trạng thái của mình cho chủ phòng gộp
      if (++this.envMismatch >= 2) {
        this.envMismatch = 0;
        this.net.sendTo(this.net.hostId, 'ENVSTATE', { s: st });
      }
    }
    onEnvState(d, from) {
      if (this.detached || !d || !this.net.isHost || typeof d.s !== 'string' || d.s.length > 200000) return;
      const T = this.game.terrain;
      if (!T || !T.applyEnvState) return;
      T.applyEnvState(d.s, this.game.effectsManager && this.game.effectsManager.fx);
      this.net.send('ENVFIX', { s: this.envState() });   // phát bản hợp nhất cho mọi máy
    }
    onEnvFix(d, from) {
      if (this.detached || !d || this.net.isHost || from !== this.net.hostId || typeof d.s !== 'string') return;
      const T = this.game.terrain;
      if (T && T.applyEnvState) T.applyEnvState(d.s, this.game.effectsManager && this.game.effectsManager.fx);
      this.envMismatch = 0;
    }

    // ---------- HÒM TIẾP TẾ (chủ phòng quyết định) ----------
    sendSupply(d) {
      if (!this.detached && this.net.isHost) this.net.send('SUPPLY', d);
    }

    getStats() {
      return {
        mode: this.net.mode, myId: this.net.myId, hostId: this.net.hostId, isHost: this.net.isHost,
        rtt: Math.round(this.net.rtt), clockOffset: Math.round(this.net.clockOffset),
        peers: this.net.getPeerList().map(p => ({ id: p.id, name: p.name, rtt: p.rtt })),
        proxies: this.byNetId.filter(u => u && u._netProxy).length,
        sent: this.net.stats.sent, recv: this.net.stats.recv
      };
    }
  }

  global.NET_CONFIG = NET_CONFIG;
  global.NetUtil = NetUtil;
  global.NetTransport = NetTransport;
  global.SnapshotBuffer = SnapshotBuffer;
  global.NetGameSync = NetGameSync;
  global.NetLagComp = { advanceShell };
})(typeof window !== 'undefined' ? window : globalThis);
