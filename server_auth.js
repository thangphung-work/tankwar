/**
 * MÁY CHỦ "CÓ THẨM QUYỀN NHẸ" (authoritative-lite) cho phòng chuyển tiếp WebSocket.
 * Máy khách vẫn tự mô phỏng xe của mình (mượt, không trễ điều khiển), máy chủ chỉ làm những việc rẻ:
 *  1. LỌC TẦM NHÌN (chống hack nhìn xuyên): mỗi máy chỉ nhận vị trí xe địch mà phe mình đang thấy được
 *     (tầm nhìn từng loại xe, bụi rậm, rừng rậm che khuất, radar trinh sát, báo cáo vị trí, vừa nổ súng bị lộ).
 *     Xe địch khuất tầm -> máy đó không hề nhận được toạ độ (chỉ nhận dấu "đã khuất").
 *  2. KIỂM TRA SÁT THƯƠNG: kẻ bắn phải còn sống, do đúng máy chủ quyền gửi, trong tầm bắn, sát thương mỗi phát
 *     & tổng sát thương mỗi giây trong giới hạn, báo hạ gục phải khớp lượng máu máy chủ đang giữ.
 *  3. KIỂM TRA DI CHUYỂN: tốc độ vượt giới hạn loại xe -> máy chủ kéo vị trí lại (máy khác thấy vị trí hợp lệ).
 *  4. GIẢM BĂNG THÔNG 10v10: máy chủ gom trạng thái mọi xe mỗi 50 ms thành 1 gói NHỊ PHÂN / máy nhận (net_codec.js),
 *     chỉ gồm trường đã đổi so với cái máy đó đã có; xe ở rất xa gửi nửa tần số.
 *  5. CHỐNG SPAM: giới hạn số tin nhắn / giây mỗi kết nối.
 * Bản đồ rừng (che tầm nhìn) dựng bằng chính MapGen của game trong luồng phụ -> không chặn vòng lặp máy chủ.
 */
const fs = require('fs');
const path = require('path');
let Worker = null;
try { ({ Worker } = require('worker_threads')); } catch (e) { Worker = null; }

const SIGHT = { ALL_ROUNDER: 520, GATLING: 480, ARTILLERY: 620, SCOUT: 720 };   // khớp TeamIntel
const BASE_SPEED = { ALL_ROUNDER: 122, GATLING: 122, ARTILLERY: 122, SCOUT: 174 };   // = GameTiming.baseVehicleSpeed (70 / 70 / 70 / 100 km/h thật)
const MAX_HP = { ALL_ROUNDER: 3.5, GATLING: 3.0, ARTILLERY: 1.6, SCOUT: 1.8 };
const MAX_RANGE = { ARTILLERY: 3200 };      // tầm bắn tối đa + dư (đơn vị game)
const DEFAULT_RANGE = 2400;   // tên lửa dẫn hướng 2000 + mục tiêu chạy; đạn tăng bay quá tầm hiệu quả 1750
const RADAR_RANGE = 950;
const EQ_RADAR_RANGE = 600;   // radar lắp thêm (Equipment.EQ_RADAR_RANGE)
const MARGIN = 120;            // nới tầm nhìn: gửi sớm 1 chút để xe hiện ra mượt, không giật
const CLOSE = 260;             // xe ở rất gần luôn được gửi (va chạm, bắn mò cự ly gần)
const FOREST_DENSE = 10, FOREST_SPOT = 170, FOREST_LOS = 100, DC = 24;
// Bụi rậm chỉ thu ngắn tầm phát hiện (khớp TeamIntel.BUSH_SPOT = CLOSE, TeamIntel.BUSH_RADAR)
const BUSH_SPOT = 260, BUSH_RADAR = 0.7;
const REVEAL_MS = 4500;        // vừa nổ súng: lộ vị trí (bụi / rừng không che) — dài hơn thời gian lộ phía máy khách (tối đa 4 s)
const SPOT_MS = 4500;          // báo cáo vị trí của trinh sát
const FAR = 1500;              // xa hơn mức này: gửi nửa tần số
const MAX_HIT = 6;             // sát thương 1 gói DAMAGE = máu thực mất -> không thể vượt máu tối đa của xe (3.5 + thưởng hòm)
const DPS_CAP = 16;            // tổng sát thương 1 xe gây ra trong 1 s (lựu pháo / đạn chùm trúng nhiều xe cùng lúc)
const MSG_PER_SEC = 400;       // giới hạn tin nhắn / giây / kết nối
const F_BUSH = 1, F_GATLING = 4, F_DEAD = 8, F_CAMO = 16;
// Lưới ngụy trang đang che (xe đứng yên, chưa bắn, lưới không cháy): khớp Equipment.camoFactor / camoRadarFactor.
// Lưới bắt lửa / cháy hết -> máy chủ quyền tắt cờ F_CAMO -> máy chủ gửi vị trí ngay theo tầm nhìn thường.
const CAMO_SIGHT = 0.65, CAMO_RADAR = 0.6;
// Nhịp bắn tối đa (phát / giây) theo loại xe — rộng tay, chỉ bắt hack bắn nhanh lộ liễu
const FIRE_RATE = { GATLING: 40, SCOUT: 25, ALL_ROUNDER: 8, ARTILLERY: 6 };
// Sát thương phải đến sau một phát bắn thật của chính xe đó trong khoảng (đạn pháo bay lâu + bom con rơi)
const FIRE_WINDOW_MS = { ARTILLERY: 25000 };
const DEFAULT_FIRE_WINDOW_MS = 12000;
// Tin chỉ chủ phòng được gửi (đồng hồ trận, tỉ số, cờ, hòm tiếp tế, gió / bo, dấu vân tay công trình)
const HOST_ONLY = new Set(['MATCH', 'SUPPLY', 'WORLD', 'ENVSUM', 'ENVFIX']);
let accounts = null;
try { accounts = require('./server_accounts'); } catch (e) { accounts = null; }
const FIELDS = ['x', 'z', 'b', 'a', 'e', 's', 'h', 'f', 'm'];
const NetCodec = require('./src/core/net_codec.js');
const Equipment = require('./src/core/equipment.js');
const FLUSH_MS = 50;           // nhịp gom gói gửi đi (20 / giây, bằng nhịp gửi của máy khách)

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
      peer: typeof r.peer === 'string' ? r.peer : null,
      rd: r.rd ? 1 : 0,                     // xe lắp radar dò tìm (trang bị nâng cao)
      cm: r.cm ? 1 : 0                      // xe lắp lưới ngụy trang
    })),
    S: [],                 // trạng thái đầy đủ từng xe (lượng tử hóa như gói REMOTE_UNIT_SYNC)
    meta: [],              // { lastT, hpAuth, deadAt, revealUntil, dmg: [[t, amount]], tick }
    spotted: { BLUE: new Map(), RED: new Map() },   // xe -> hết hạn báo cáo
    vis: { BLUE: new Set(), RED: new Set() },
    sent: new Map(),       // máy nhận -> Map(xe -> trạng thái đã gửi | {hid:1})
    dirty: new Set(),      // xe có trạng thái mới chờ gửi ở nhịp tới
    uts: [],               // thời điểm mẫu của trạng thái mới nhất từng xe
    flushN: 0,
    dens: null,
    violations: new Map(),
    id: Math.random().toString(36).slice(2),   // nhận diện trận (tính thành tích tài khoản theo trận)
    lastHit: new Map(),                         // `${xe bị trúng}|${máy}` -> lúc gây sát thương hợp lệ gần nhất
    lastFireBy: new Map(),                      // máy -> lúc bắn gần nhất (kiểm tra ENV_HIT)
    kd: new Map()                               // xe -> { kills, deaths, damage } đã kiểm tra (xếp hạng top 3 K/D)
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
function meta(M, i) { return M.meta[i] || (M.meta[i] = { lastT: 0, hpAuth: null, deadAt: 0, revealUntil: 0, dmg: [], tick: 0, fires: [], lastFire: 0 }); }
function flag(M, client, why) {
  // đếm theo (máy, loại vi phạm) -> mỗi loại đều được ghi nhật ký lần đầu (rồi mỗi 50 lần)
  const key = client.id + '|' + why.replace(/[\d.]+/g, '#');
  const n = (M.violations.get(key) || 0) + 1;
  M.violations.set(key, n);
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
      // núp bụi chưa nổ súng: radar bắt được ở BUSH_RADAR bán kính, mắt thường trong BUSH_SPOT (+ MARGIN để hiện mượt)
      const bush = !revealed && (s.f & F_BUSH);
      // cờ ngụy trang chỉ tin khi xe có lắp lưới và thật sự đứng yên (chống gửi cờ giả để tàng hình khi chạy)
      const camo = !revealed && (s.f & F_CAMO) && e.cm && Math.abs(s.s || 0) / 10 < (BASE_SPEED[e.type] || 122) * 0.08;
      const rk = (bush ? BUSH_RADAR : 1) * (camo ? CAMO_RADAR : 1), sk = camo ? CAMO_SIGHT : 1;
      for (const u of mine) {
        const v = M.S[u.i], vx = v.x / 10, vz = v.z / 10, d = Math.hypot(ex - vx, ez - vz);
        if (d < CLOSE) { set.add(e.i); break; }
        if (u.type === 'SCOUT' && d < RADAR_RANGE * rk) { set.add(e.i); break; }
        if (u.rd && d < EQ_RADAR_RANGE * rk) { set.add(e.i); break; }
        if (d > (bush ? Math.min(SIGHT[u.type] * sk, BUSH_SPOT) : SIGHT[u.type] * sk) + MARGIN) continue;
        if (inForest && d > FOREST_SPOT + MARGIN) continue;
        if (M.dens && denseLength(M.dens, vx, vz, ex, ez, FOREST_LOS + 60) > FOREST_LOS + 60) continue;
        set.add(e.i); break;
      }
    }
    M.vis[team] = set;
  }
}

// ---------------------------------------------------------------------------
// GÓI TRẠNG THÁI XE: kiểm tra di chuyển & máu, gộp vào trạng thái máy chủ (gửi đi ở nhịp gom gói)
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
    // đạn liên thanh (6 nòng / súng máy) không gửi tin bắn từng viên: cờ "đang xả đạn" trong gói trạng thái = đang bắn
    if ((q.f & F_GATLING) && !dead) { m.lastFire = now; M.lastFireBy.set(client.id, now); }
    M.S[e.i] = q;
    M.uts[e.i] = typeof d.ts === 'number' && Math.abs(d.ts - now) < 5000 ? d.ts : now;   // thời điểm mẫu theo đồng hồ chủ quyền
    touched.push(e.i);
  }
  for (const i of touched) M.dirty.add(i);
}

// ---------------------------------------------------------------------------
// GOM GÓI THEO NHỊP: mỗi 50 ms gửi cho mỗi máy ĐÚNG 1 gói nhị phân gồm mọi xe vừa đổi mà máy đó được thấy
// (thay cho việc chuyển tiếp từng tin của từng người -> 10v10 giảm từ ~170 xuống 20 gói / giây / máy)
// ---------------------------------------------------------------------------
function flushRoom(room) {
  const M = room.match;
  if (!M || !M.dirty.size) return;
  const dirty = [...M.dirty];
  M.dirty.clear();
  M.flushN = (M.flushN || 0) + 1;
  const baseTs = Date.now();
  room.members.forEach((member, rid) => {
    const team = teamOfClient(M, rid);
    let sent = M.sent.get(rid);
    if (!sent) { sent = new Map(); M.sent.set(rid, sent); }
    // vị trí xe của máy nhận (để giảm tần số xe ở rất xa)
    let me = null;
    for (const r of M.roster) if (r.peer === rid && M.S[r.i]) { me = M.S[r.i]; break; }
    const out = [];
    for (const i of dirty) {
      const r = M.byIdx.get(i), q = M.S[i], last = sent.get(i);
      if (!r || !q || ownerOf(room, r) === rid) continue;          // không gửi lại xe của chính máy đó
      const visible = !team || r.team === team || M.vis[team].has(i);
      // xe địch vừa hồi sinh ngoài tầm nhìn: vẫn gửi 1 lần đủ trạng thái (vị trí căn cứ không bí mật) để máy kia biết
      // xe đã sống lại, rồi mới ẩn — nếu không máy kia thấy xe đó chết mãi
      const respawned = last && (last.f & F_DEAD) && !(q.f & F_DEAD);
      if (!visible && !respawned) {
        if (!last || !last.hid) { out.push({ i, hid: 1 }); sent.set(i, { hid: 1, f: last ? last.f : 0 }); }
        continue;
      }
      const isNew = !last || last.hid;
      // xe ở rất xa: nửa tần số (nhịp lẻ bỏ qua nếu không đổi trạng thái quan trọng)
      if (!isNew && me && (M.flushN & 1) && Math.hypot(q.x - me.x, q.z - me.z) / 10 > FAR && last.f === q.f && last.h === q.h) { M.dirty.add(i); continue; }
      const ent = { i, ts: M.uts[i] || baseTs, full: isNew, q: {} };
      for (const k of FIELDS) if (isNew || last[k] !== q[k]) ent.q[k] = q[k];
      out.push(ent);
      sent.set(i, q);
    }
    if (!out.length) return;
    const buf = NetCodec.encodeSnap(baseTs, out);
    if (member.sendFrame) member.sendFrame(0x2, Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength));
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
    // kẻ bắn đã chết: đạn bắn ra TRƯỚC khi chết vẫn bay tới & tính bình thường; chỉ chặn phát bắn SAU khi chết
    if (as && (as.f & F_DEAD) && am.lastFire > am.deadAt + 300) { flag(M, client, `xe ${d.a} đã chết vẫn gây sát thương`); return false; }
    if (as && vs) {
      const dist = Math.hypot(as.x - vs.x, as.z - vs.z) / 10, lim = MAX_RANGE[ar.type] || DEFAULT_RANGE;
      if (dist > lim) { flag(M, client, `sát thương ngoài tầm bắn (${Math.round(dist)} > ${lim})`); return false; }
    }
    if (amount > MAX_HIT) { flag(M, client, `1 phát ${amount.toFixed(2)} máu vượt giới hạn`); return false; }
    const win = FIRE_WINDOW_MS[ar.type] || DEFAULT_FIRE_WINDOW_MS;
    if (!am.lastFire || now - am.lastFire > win) { flag(M, client, `xe ${d.a} gây sát thương mà không bắn phát nào`); return false; }
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
  M.lastHit.set(d.v + '|' + client.id, now);
  // Thành tích tài khoản trong trận mạng: máy chủ tự đếm từ sát thương đã kiểm tra (không tin số máy khách báo)
  if (accounts && accounts.noteOnline) {
    const ar = typeof d.a === 'number' && d.a >= 0 ? M.byIdx.get(d.a) : null;
    const atkClient = ar && ar.peer ? room.members.get(ar.peer) : null;
    if (atkClient && atkClient.userId && !d.b) accounts.noteOnline(atkClient.userId, M.id, d.k ? 1 : 0, 0, amount);
    const vicClient = vr.peer ? room.members.get(vr.peer) : null;
    if (d.k && vicClient && vicClient.userId) accounts.noteOnline(vicClient.userId, M.id, 0, 1, 0);
  }
  noteKD(room, d, amount);
  return true;
}

// Top 3 K/D cả trận (mọi xe, kể cả xe máy) từ sát thương đã kiểm tra; mỗi lần có hạ gục: báo hạng cho tài khoản người chơi
function noteKD(room, d, amount) {
  const M = room.match;
  const st = (i) => M.kd.get(i) || (M.kd.set(i, { key: i, kills: 0, deaths: 0, damage: 0 }), M.kd.get(i));
  const ai = typeof d.a === 'number' && d.a >= 0 && d.a !== d.v ? d.a : -1;
  if (ai >= 0 && !d.b) st(ai).damage += amount;
  if (!d.k) return;
  st(d.v).deaths++;
  if (ai >= 0) st(ai).kills++;
  if (!accounts || !accounts.notePlace) return;
  const top = Equipment.rankKD([...M.kd.values()]);
  for (const r of M.roster) {
    const c = r.peer ? room.members.get(r.peer) : null;
    if (c && c.userId) accounts.notePlace(c.userId, M.id, top.findIndex(t => t.key === r.i) + 1);
  }
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

  if (msg.t === 'SNAP') return true;   // tên dành riêng cho gói máy chủ phát -> không chuyển tiếp tin giả mạo
  if (msg.t === '@match') {
    const d = msg.d || {};
    // chủ phòng (hoặc máy đầu tiên khi chưa có trận) khai báo trận: danh sách xe, bản đồ
    if (client.id === room.hostId || !room.match) initMatch(room, d, client.id);
    return true;
  }
  if (msg.t === '@match_end') { if (client.id === room.hostId) room.match = null; return true; }
  const M = room.match;
  if (!M || typeof msg.to === 'string') return false;
  if (HOST_ONLY.has(msg.t) && client.id !== room.hostId) { flag(M, client, `gửi ${msg.t} (chỉ chủ phòng được gửi)`); return true; }
  switch (msg.t) {
    case 'REMOTE_UNIT_SYNC':
      onUnitSync(room, client, msg);
      return true;
    case 'DAMAGE':
      return !validDamage(room, client, msg.d);    // không hợp lệ -> nuốt luôn, không chuyển tiếp
    case 'REMOTE_FIRE_EVENT': {
      const d = msg.d || {}, r = M.byIdx.get(d.i);
      if (!r || ownerOf(room, r) !== client.id) return true;   // bắn thay xe người khác
      const fm = meta(M, d.i);
      const st = M.S[d.i];
      if (st && (st.f & F_DEAD)) { flag(M, client, `xe ${d.i} đã chết vẫn bắn`); return true; }
      fm.fires = fm.fires.filter(t => now - t < 1000);
      if (fm.fires.length >= (FIRE_RATE[r.type] || 8)) { flag(M, client, `xe ${d.i} bắn quá nhanh (${fm.fires.length + 1} phát/giây)`); return true; }
      fm.fires.push(now);
      fm.lastFire = now;
      M.lastFireBy.set(client.id, now);
      fm.revealUntil = now + REVEAL_MS;
      return false;
    }
    case 'PARTS': {
      // hư hại bộ phận: máy vừa gây sát thương cho xe đó (3 s), hoặc vừa bắn (15 s) mà có xe của mình trong tầm bắn
      // của xe bị hỏng (phát trúng làm hỏng bộ phận nhưng không mất máu, vd súng máy bắn thủng lốp)
      const d = msg.d || {}, vr = M.byIdx.get(d.v), vs = M.S[d.v];
      if (!vr || (vs && (vs.f & F_DEAD))) return true;
      const hitAt = M.lastHit.get(d.v + '|' + client.id) || 0;
      let ok = now - hitAt <= 3000;
      if (!ok && vs && now - (M.lastFireBy.get(client.id) || 0) <= 15000) {
        ok = M.roster.some(r => ownerOf(room, r) === client.id && M.S[r.i] && !(M.S[r.i].f & F_DEAD) &&
          Math.hypot(M.S[r.i].x - vs.x, M.S[r.i].z - vs.z) / 10 <= (MAX_RANGE[r.type] || DEFAULT_RANGE));
      }
      if (!ok) { flag(M, client, `báo hỏng bộ phận xe ${d.v} khi không bắn trúng`); return true; }
      if (JSON.stringify(d.s || {}).length > 3000) return true;
      return false;
    }
    case 'ENV_HIT': {
      // phá công trình: máy gửi phải vừa bắn thật (chặn tự phá nhà / cây hàng loạt)
      const last = M.lastFireBy.get(client.id) || 0;
      if (now - last > 30000) { flag(M, client, 'báo phá công trình khi không bắn'); return true; }
      return false;
    }
    case 'SUPPLY': {
      // xe nhặt hòm hồi máu: cho phép máu tăng lại (máy chủ học lại lượng máu từ gói trạng thái kế tiếp)
      const d = msg.d || {};
      if ((d.e === 'take' || d.e === 'loot') && typeof d.u === 'number') meta(M, d.u).hpAuth = null;
      return false;
    }
    case 'LOCK': {
      // cảnh báo bị khóa: chỉ máy điều khiển xe đang khóa được báo
      const d = msg.d || {}, r = M.byIdx.get(d.i);
      if (!r || ownerOf(room, r) !== client.id) return true;
      return false;
    }
    case 'SMOKE': {
      // màn khói: chỉ máy điều khiển xe đó được phóng, tối đa 1 lần / 2,5 s
      const d = msg.d || {}, r = M.byIdx.get(d.i);
      if (!r || ownerOf(room, r) !== client.id) return true;
      const fm = meta(M, d.i);
      if (fm.smokeAt && now - fm.smokeAt < 2500) return true;
      fm.smokeAt = now;
      return false;
    }
    case 'DRONE': {
      // trạng thái drone trinh sát: chỉ máy điều khiển xe pháo đó
      const d = msg.d || {}, r = M.byIdx.get(d.i);
      if (!r || r.type !== 'ARTILLERY' || ownerOf(room, r) !== client.id) return true;
      return false;
    }
    case 'DRONE_HIT': {
      // phát trúng drone: máy điều khiển xe bắn, xe còn sống, vừa bắn thật
      const d = msg.d || {}, ar = M.byIdx.get(d.a), or = M.byIdx.get(d.o), as = M.S[d.a];
      if (!ar || !or || or.type !== 'ARTILLERY' || ar.team === or.team || ownerOf(room, ar) !== client.id) return true;
      if ((as && (as.f & F_DEAD)) || now - (M.lastFireBy.get(client.id) || 0) > 3000) { flag(M, client, `báo trúng drone xe ${d.o} khi không bắn`); return true; }
      if (!(d.d > 0) || d.d > 1000) return true;   // tối đa 1 lần thân drone / gói (chỉ đạn súng)
      return false;
    }
    case 'DRONE_DOWN': {
      const d = msg.d || {}, r = M.byIdx.get(d.o);
      if (!r || r.type !== 'ARTILLERY' || ownerOf(room, r) !== client.id) return true;
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

// nhịp tính tầm nhìn (5 / giây) & nhịp gom gói gửi đi (20 / giây)
function startTicker(rooms) {
  const t = setInterval(() => {
    const now = Date.now();
    rooms.forEach(room => { if (room.match) updateVisibility(room.match, now); });
  }, 200);
  const f = setInterval(() => { rooms.forEach(room => { if (room.match) flushRoom(room); }); }, FLUSH_MS);
  if (t.unref) t.unref();
  if (f.unref) f.unref();
}

module.exports = { handle, onLeave, startTicker, _test: { initMatch, updateVisibility, onUnitSync, flushRoom, validDamage, forestFor, densityAt } };
