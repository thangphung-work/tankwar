/**
 * MÁY CHỦ "CÓ THẨM QUYỀN NHẸ" (authoritative-lite) cho phòng chuyển tiếp WebSocket.
 * Máy khách vẫn tự mô phỏng xe của mình (mượt, không trễ điều khiển), máy chủ chỉ làm những việc rẻ:
 *  1. LỌC TẦM NHÌN (chống hack nhìn xuyên): mỗi máy chỉ nhận vị trí xe địch mà phe mình đang thấy được
 *     (tầm nhìn từng loại xe, bụi rậm, rừng rậm che khuất, radar trinh sát, báo cáo vị trí, vừa nổ súng bị lộ).
 *     Xe địch khuất tầm -> máy đó không hề nhận được toạ độ (chỉ nhận dấu "đã khuất").
 *  2. KIỂM TRA SÁT THƯƠNG: kẻ bắn phải còn sống, do đúng máy chủ quyền gửi, trong tầm bắn, sát thương mỗi phát
 *     & tổng sát thương mỗi giây trong giới hạn, báo hạ gục phải khớp lượng máu máy chủ đang giữ.
 *  3. KIỂM TRA DI CHUYỂN: tốc độ vượt giới hạn loại xe -> máy chủ kéo vị trí lại (máy khác thấy vị trí hợp lệ).
 *  4. GIẢM BĂNG THÔNG 10v10: gửi theo hiệu số riêng cho từng máy nhận; xe ở rất xa gửi nửa tần số.
 *  5. CHỐNG SPAM: giới hạn số tin nhắn / giây mỗi kết nối.
 * Bản đồ rừng (che tầm nhìn) dựng bằng chính MapGen của game trong luồng phụ -> không chặn vòng lặp máy chủ.
 */
const fs = require('fs');
const path = require('path');
let Worker = null;
try { ({ Worker } = require('worker_threads')); } catch (e) { Worker = null; }

const SIGHT = { ALL_ROUNDER: 520, GATLING: 480, ARTILLERY: 420, SCOUT: 720 };   // khớp TeamIntel
const BASE_SPEED = { ALL_ROUNDER: 122, GATLING: 122, ARTILLERY: 122, SCOUT: 174 };   // = GameTiming.baseVehicleSpeed (70 / 70 / 70 / 100 km/h thật)
const MAX_HP = { ALL_ROUNDER: 3.5, GATLING: 3.0, ARTILLERY: 1.6, SCOUT: 1.8 };
const MAX_RANGE = { ARTILLERY: 3200 };      // tầm bắn tối đa + dư (đơn vị game)
const DEFAULT_RANGE = 2400;   // tên lửa dẫn hướng 2000 + mục tiêu chạy; đạn tăng bay quá tầm hiệu quả 1750
const RADAR_RANGE = 950;
const MARGIN = 120;            // nới tầm nhìn: gửi sớm 1 chút để xe hiện ra mượt, không giật
const CLOSE = 260;             // xe ở rất gần luôn được gửi (va chạm, bắn mò cự ly gần)
const FOREST_DENSE = 10, FOREST_SPOT = 170, FOREST_LOS = 100, DC = 24;
const REVEAL_MS = 4500;        // vừa nổ súng: lộ vị trí (bụi / rừng không che) — dài hơn thời gian lộ phía máy khách (tối đa 4 s)
const SPOT_MS = 4500;          // báo cáo vị trí của trinh sát
const FAR = 1500;              // xa hơn mức này: gửi nửa tần số
const MAX_HIT = 2.6;           // sát thương tối đa 1 gói DAMAGE (máu)
const DPS_CAP = 7;             // tổng sát thương 1 xe gây ra trong 1 s (đạn chùm trúng nhiều xe)
const MSG_PER_SEC = 400;       // giới hạn tin nhắn / giây / kết nối
const F_BUSH = 1, F_DEAD = 8;
const FIELDS = ['x', 'z', 'b', 'a', 'e', 's', 'h', 'f', 'm'];

// ---------------------------------------------------------------------------
// BẢN ĐỒ MẬT ĐỘ RỪNG (dựng trong luồng phụ từ MapGen)
// ---------------------------------------------------------------------------
const forestCache = new Map();       // `${type}|${seed}|${layout}` -> Promise<Map>
const WORKER_SRC = `
const { parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const src = fs.readFileSync(workerData.file, 'utf8');
const MapGen = new Function(src + '\\nreturn MapGen;')();
MapGen.setLayout(workerData.layout);
const m = MapGen.generate(workerData.type, workerData.seed);
const dens = {};
for (const t of m.trees) {
  const w = t.kind === 'cactus' ? 0 : t.kind === 'deadTree' ? 0.35 : 1;
  if (!w) continue;
  const k = Math.floor(t.x / ${DC}) * 100000 + Math.floor(t.z / ${DC});
  dens[k] = (dens[k] || 0) + w;
}
parentPort.postMessage(dens);
`;
function forestFor(type, seed, layout) {
  const key = type + '|' + seed + '|' + layout;
  if (forestCache.has(key)) return forestCache.get(key);
  const p = new Promise((resolve) => {
    if (!Worker) return resolve(null);
    try {
      const w = new Worker(WORKER_SRC, { eval: true, workerData: { file: path.join(__dirname, 'src', 'core', 'map_gen.js'), type, seed, layout } });
      w.once('message', (o) => { const m = new Map(); for (const k in o) m.set(Number(k), o[k]); resolve(m); w.terminate(); });
      w.once('error', (e) => { console.warn('[AUTH] Không dựng được bản đồ rừng:', e.message); resolve(null); });
    } catch (e) { resolve(null); }
  });
  forestCache.set(key, p);
  if (forestCache.size > 16) forestCache.delete(forestCache.keys().next().value);
  return p;
}
function densityAt(dens, x, z) {
  if (!dens) return 0;
  const i = Math.floor(x / DC), j = Math.floor(z / DC);
  let n = 0;
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) n += dens.get((i + a) * 100000 + j + b) || 0;
  return n;
}
function denseLength(dens, ax, az, bx, bz, limit) {
  if (!dens) return 0;
  const L = Math.hypot(bx - ax, bz - az), n = Math.ceil(L / 12);
  let acc = 0;
  for (let k = 0; k < n; k++) {
    const t = (k + 0.5) / n;
    if (densityAt(dens, ax + (bx - ax) * t, az + (bz - az) * t) >= FOREST_DENSE) { acc += L / n; if (acc > limit) return acc; }
  }
  return acc;
}

// ---------------------------------------------------------------------------
// TRẠNG THÁI TRẬN TRONG PHÒNG
// ---------------------------------------------------------------------------
function initMatch(room, d, fromId) {
  const roster = Array.isArray(d.roster) ? d.roster.slice(0, 64) : [];
  const M = {
    startedBy: fromId,
    mapType: String(d.mapType || 'DESERT').slice(0, 20),
    seed: d.seed >>> 0,
    layout: d.layout === 'STRONGHOLDS' ? 'STRONGHOLDS' : 'CLASSIC',
    roster: roster.map((r, i) => ({
      i: typeof r.i === 'number' ? r.i : i,
      team: r.team === 'RED' ? 'RED' : 'BLUE',
      type: SIGHT[r.type] ? r.type : 'ALL_ROUNDER',
      peer: typeof r.peer === 'string' ? r.peer : null
    })),
    S: [],                 // trạng thái đầy đủ từng xe (lượng tử hóa như gói REMOTE_UNIT_SYNC)
    meta: [],              // { lastT, hpAuth, deadAt, revealUntil, dmg: [[t, amount]], tick }
    spotted: { BLUE: new Map(), RED: new Map() },   // xe -> hết hạn báo cáo
    vis: { BLUE: new Set(), RED: new Set() },
    sent: new Map(),       // máy nhận -> Map(xe -> trạng thái đã gửi | {hid:1})
    dens: null,
    violations: new Map()
  };
  M.byIdx = new Map(M.roster.map(r => [r.i, r]));
  room.match = M;
  forestFor(M.mapType, M.seed, M.layout).then(dens => { if (room.match === M) M.dens = dens; });
  console.log(`[AUTH] Phòng ${room.name}: trận ${M.mapType} #${M.seed} (${M.layout}), ${M.roster.length} xe`);
}

function ownerOf(room, r) {
  if (r && r.peer && room.members.has(r.peer)) return r.peer;
  return room.hostId;
}
function teamOfClient(M, clientId) {
  for (const r of M.roster) if (r.peer === clientId) return r.team;
  return null;   // người xem / chưa có xe: nhận đầy đủ
}
function meta(M, i) { return M.meta[i] || (M.meta[i] = { lastT: 0, hpAuth: null, deadAt: 0, revealUntil: 0, dmg: [], tick: 0 }); }
function flag(M, client, why) {
  const n = (M.violations.get(client.id) || 0) + 1;
  M.violations.set(client.id, n);
  if (n === 1 || n % 50 === 0) console.warn(`[AUTH] Máy ${client.id} (${client.name || '?'}) vi phạm: ${why} (lần ${n})`);
}

// ---------------------------------------------------------------------------
// TẦM NHÌN THEO PHE (tính 5 lần / giây cho mỗi phòng)
// ---------------------------------------------------------------------------
function updateVisibility(M, now) {
  for (const team of ['BLUE', 'RED']) {
    const set = new Set();
    const mine = M.roster.filter(r => r.team === team && M.S[r.i] && !(M.S[r.i].f & F_DEAD));
    for (const e of M.roster) {
      if (e.team === team) continue;
      const s = M.S[e.i];
      if (!s) continue;
      if (s.f & F_DEAD) { set.add(e.i); continue; }
      const sp = M.spotted[team].get(e.i);
      if (sp && sp > now) { set.add(e.i); continue; }
      const ex = s.x / 10, ez = s.z / 10, m = meta(M, e.i), revealed = m.revealUntil > now;
      const inForest = !revealed && densityAt(M.dens, ex, ez) >= FOREST_DENSE;
      for (const u of mine) {
        const v = M.S[u.i], vx = v.x / 10, vz = v.z / 10, d = Math.hypot(ex - vx, ez - vz);
        if (d < CLOSE) { set.add(e.i); break; }
        if (u.type === 'SCOUT' && d < RADAR_RANGE) { set.add(e.i); break; }
        if (d > SIGHT[u.type] + MARGIN) continue;
        if (!revealed && (s.f & F_BUSH)) continue;
        if (inForest && d > FOREST_SPOT + MARGIN) continue;
        if (M.dens && denseLength(M.dens, vx, vz, ex, ez, FOREST_LOS + 60) > FOREST_LOS + 60) continue;
        set.add(e.i); break;
      }
    }
    M.vis[team] = set;
  }
}

// ---------------------------------------------------------------------------
// GÓI TRẠNG THÁI XE: kiểm tra di chuyển, rồi gửi riêng từng máy (lọc tầm nhìn + hiệu số)
// ---------------------------------------------------------------------------
function onUnitSync(room, client, msg) {
  const M = room.match, d = msg.d;
  if (!d || !Array.isArray(d.u)) return;
  const now = Date.now(), key = !!d.k;
  const touched = [];
  for (const e of d.u) {
    if (!e || typeof e.i !== 'number') continue;
    const r = M.byIdx.get(e.i);
    if (!r || ownerOf(room, r) !== client.id) continue;          // chỉ máy chủ quyền được báo trạng thái xe đó
    const prev = M.S[e.i];
    if (!prev && !key) continue;
    const q = Object.assign({}, prev || {}, e);
    delete q.i;
    for (const k of FIELDS) if (typeof q[k] !== 'number' && k !== 'm') q[k] = 0;
    const m = meta(M, e.i);
    const wasDead = prev ? !!(prev.f & F_DEAD) : true, dead = !!(q.f & F_DEAD);
    // tốc độ: vượt giới hạn (kể cả tăng tốc + vật phẩm tốc độ) -> kéo lại (hồi sinh thì được dịch chuyển)
    if (prev && !wasDead && !dead && m.lastT) {
      const dt = Math.max(0.05, (now - m.lastT) / 1000);
      const vmax = (BASE_SPEED[r.type] || 150) * 2.4 * 1.25 + 40;
      const dx = (q.x - prev.x) / 10, dz = (q.z - prev.z) / 10, dist = Math.hypot(dx, dz), lim = vmax * dt + 30;
      if (dist > lim) {
        q.x = Math.round(prev.x + dx / dist * lim * 10);
        q.z = Math.round(prev.z + dz / dist * lim * 10);
        flag(M, client, `xe ${e.i} chạy quá nhanh (${Math.round(dist / dt)} đv/s)`);
      }
    }
    // máu: không cao hơn lượng máu máy chủ biết (trừ khi vừa hồi sinh)
    if (dead && !wasDead) m.deadAt = now;
    if (wasDead && !dead) m.hpAuth = Math.min(q.h, Math.round((MAX_HP[r.type] || 3.5) * 100));
    else if (m.hpAuth !== null && q.h > m.hpAuth + 3) q.h = m.hpAuth;
    else if (m.hpAuth === null || q.h < m.hpAuth) m.hpAuth = q.h;
    m.lastT = now;
    m.tick++;
    M.S[e.i] = q;
    touched.push(e.i);
  }
  if (!touched.length) return;

  room.members.forEach((member, rid) => {
    if (rid === client.id) return;
    const team = teamOfClient(M, rid);
    let sent = M.sent.get(rid);
    if (!sent) { sent = new Map(); M.sent.set(rid, sent); }
    // vị trí xe của máy nhận (để giảm tần số xe ở xa)
    let me = null;
    for (const r of M.roster) if (r.peer === rid && M.S[r.i]) { me = M.S[r.i]; break; }
    const out = [];
    let full = false;
    for (const i of touched) {
      const r = M.byIdx.get(i), q = M.S[i], last = sent.get(i);
      const visible = !team || r.team === team || M.vis[team].has(i);
      if (!visible) {
        if (!last || !last.hid) { out.push({ i, hid: 1 }); sent.set(i, { hid: 1 }); }
        continue;
      }
      const isNew = !last || last.hid;
      if (!isNew && !key && me && (meta(M, i).tick & 1) && Math.hypot(q.x - me.x, q.z - me.z) / 10 > FAR && last.f === q.f && last.h === q.h) continue;
      const ent = { i };
      for (const k of FIELDS) if (isNew || key || last[k] !== q[k]) ent[k] = q[k];
      if (isNew) full = true;
      out.push(ent);
      sent.set(i, q);
    }
    if (!out.length) return;
    member.sendText(JSON.stringify({ t: 'REMOTE_UNIT_SYNC', f: client.id, d: { ts: d.ts, k: (key || full) ? 1 : 0, u: out } }));
  });
}

// ---------------------------------------------------------------------------
// KIỂM TRA SÁT THƯƠNG
// ---------------------------------------------------------------------------
function validDamage(room, client, d) {
  const M = room.match;
  if (!d || typeof d.v !== 'number') return false;
  const vr = M.byIdx.get(d.v);
  if (!vr) return false;
  const now = Date.now(), amount = Math.max(0, (d.d || 0) / 1000);
  if (typeof d.a === 'number' && d.a >= 0) {
    const ar = M.byIdx.get(d.a);
    if (!ar) return false;
    if (ownerOf(room, ar) !== client.id) { flag(M, client, `gửi sát thương thay xe ${d.a} của máy khác`); return false; }
    const as = M.S[d.a], vs = M.S[d.v], am = meta(M, d.a);
    // kẻ bắn đã chết quá 2 s (đạn bay muộn vẫn được tính trong 2 s)
    if (as && (as.f & F_DEAD) && now - am.deadAt > 2000) { flag(M, client, `xe ${d.a} đã chết vẫn gây sát thương`); return false; }
    if (as && vs) {
      const dist = Math.hypot(as.x - vs.x, as.z - vs.z) / 10, lim = MAX_RANGE[ar.type] || DEFAULT_RANGE;
      if (dist > lim) { flag(M, client, `sát thương ngoài tầm bắn (${Math.round(dist)} > ${lim})`); return false; }
    }
    if (amount > MAX_HIT) { flag(M, client, `1 phát ${amount.toFixed(2)} máu vượt giới hạn`); return false; }
    am.dmg = am.dmg.filter(x => now - x[0] < 1000);
    const sum = am.dmg.reduce((s, x) => s + x[1], 0);
    if (sum + amount > DPS_CAP) { flag(M, client, `xe ${d.a} gây ${(sum + amount).toFixed(1)} máu/giây`); return false; }
    am.dmg.push([now, amount]);
  } else {
    // sát thương môi trường (bo, cháy): chỉ máy chủ quyền của xe bị trúng hoặc chủ phòng
    if (client.id !== ownerOf(room, vr) && client.id !== room.hostId) return false;
    if (amount > MAX_HIT) return false;
  }
  // báo hạ gục phải khớp lượng máu máy chủ đang giữ
  const vm = meta(M, d.v);
  if (d.k && vm.hpAuth !== null && vm.hpAuth / 100 - amount > 0.12) { flag(M, client, `báo hạ gục xe ${d.v} khi còn ${(vm.hpAuth / 100).toFixed(2)} máu`); return false; }
  if (typeof d.h === 'number') vm.hpAuth = vm.hpAuth === null ? d.h : Math.min(vm.hpAuth, d.h);
  return true;
}

// ---------------------------------------------------------------------------
// ĐIỂM VÀO TỪ server.js
// ---------------------------------------------------------------------------
/** Trả true nếu tin nhắn đã được xử lý xong (không chuyển tiếp nguyên văn nữa) */
function handle(room, client, msg) {
  // chống spam
  const now = Date.now();
  if (!client._rate || now - client._rate.t > 1000) client._rate = { t: now, n: 0 };
  if (++client._rate.n > MSG_PER_SEC) return true;

  if (msg.t === '@match') {
    const d = msg.d || {};
    // chủ phòng (hoặc máy đầu tiên khi chưa có trận) khai báo trận: danh sách xe, bản đồ
    if (client.id === room.hostId || !room.match) initMatch(room, d, client.id);
    return true;
  }
  if (msg.t === '@match_end') { if (client.id === room.hostId) room.match = null; return true; }
  const M = room.match;
  if (!M || typeof msg.to === 'string') return false;
  switch (msg.t) {
    case 'REMOTE_UNIT_SYNC':
      onUnitSync(room, client, msg);
      return true;
    case 'DAMAGE':
      return !validDamage(room, client, msg.d);    // không hợp lệ -> nuốt luôn, không chuyển tiếp
    case 'REMOTE_FIRE_EVENT': {
      const d = msg.d || {}, r = M.byIdx.get(d.i);
      if (!r || ownerOf(room, r) !== client.id) return true;   // bắn thay xe người khác
      meta(M, d.i).revealUntil = now + REVEAL_MS;
      return false;
    }
    case 'SPOT': {
      const d = msg.d || {}, sr = M.byIdx.get(d.s), tr = M.byIdx.get(d.t);
      if (!sr || !tr || sr.type !== 'SCOUT' || ownerOf(room, sr) !== client.id) return true;
      M.spotted[sr.team].set(d.t, now + SPOT_MS);
      return false;
    }
    default:
      return false;
  }
}

function onLeave(room, clientId) {
  if (room.match) room.match.sent.delete(clientId);
}

// nhịp tính tầm nhìn
function startTicker(rooms) {
  const t = setInterval(() => {
    const now = Date.now();
    rooms.forEach(room => { if (room.match) updateVisibility(room.match, now); });
  }, 200);
  if (t.unref) t.unref();
}

module.exports = { handle, onLeave, startTicker, _test: { initMatch, updateVisibility, onUnitSync, validDamage, forestFor, densityAt } };
