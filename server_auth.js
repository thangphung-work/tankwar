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
const crypto = require('crypto');
let Worker = null;
try { ({ Worker } = require('worker_threads')); } catch (e) { Worker = null; }

const SIGHT = { ALL_ROUNDER: 520, GATLING: 520, ARTILLERY: 620, SCOUT: 720 };   // khớp TeamIntel
const BASE_SPEED = { ALL_ROUNDER: 122, GATLING: 113, ARTILLERY: 122, SCOUT: 148 };   // = GameTiming.baseVehicleSpeed (70 / 65 / 70 / 85 km/h thật)
const MAX_HP = { ALL_ROUNDER: 3.2, GATLING: 4.0, ARTILLERY: 2.2, SCOUT: 1.6 };
const MAX_RANGE = { ARTILLERY: 3200 };      // tầm bắn tối đa + dư (đơn vị game)
const DEFAULT_RANGE = 2400;   // tên lửa dẫn hướng 2000 + mục tiêu chạy; đạn tăng bay quá tầm hiệu quả 1750
const RADAR_RANGE = 950;
const EQ_RADAR_RANGE = 600;   // radar lắp thêm (Equipment.EQ_RADAR_RANGE)const EW_DETECT = 2400;        // dò phương xe đang phát sóng phá UAV (ew_jammer.js EWJammer.C.DETECT)
const MARGIN = 120;            // nới tầm nhìn: gửi sớm 1 chút để xe hiện ra mượt, không giật
const CLOSE = 260;             // xe ở rất gần luôn được gửi (va chạm, bắn mò cự ly gần)
const FOREST_DENSE = 10, FOREST_SPOT = 170, FOREST_LOS = 100, DC = 24;
// Bụi rậm chỉ thu ngắn tầm phát hiện, tùy loại xe (khớp TeamIntel.BUSH_COVER; BUSH_SPOT = CLOSE):
// trinh sát núp thật (mắt thường BUSH_SPOT, radar 40%), xe tăng / 6 nòng giảm tầm radar + đứng yên thì mắt thường phải vào
// gần hơn (still), pháo tự hành không núp được
const BUSH_SPOT = 260, BUSH_RADAR = 0.7, BUSH_STILL = 0.6;
const BUSH_COVER = { SCOUT: { spot: BUSH_SPOT, radar: 0.4 }, ALL_ROUNDER: { spot: 0, radar: BUSH_RADAR, still: BUSH_STILL }, GATLING: { spot: 0, radar: BUSH_RADAR, still: BUSH_STILL } };
// Drone trinh sát của xe pháo đang bay: soi thấy xe địch trong DRONE_SIGHT quanh hình chiếu drone (khớp TeamIntel.DRONE_SIGHT)
const DRONE_SIGHT = 420, DRONE_TTL_MS = 1500;
const REVEAL_MS = 4500;        // vừa nổ súng: lộ vị trí (bụi / rừng không che) — dài hơn thời gian lộ phía máy khách (tối đa 4 s)
const SPOT_MS = 4500;          // báo cáo vị trí của trinh sát
const FAR = 1500;              // xa hơn mức này: gửi nửa tần số
const MAX_HIT = 6;             // sát thương 1 gói DAMAGE = máu thực mất -> không thể vượt máu tối đa của xe (3.5 + thưởng hòm)
const DPS_CAP = 16;            // tổng sát thương 1 xe gây ra trong 1 s (lựu pháo / đạn chùm trúng nhiều xe cùng lúc)
const MSG_PER_SEC = 400;       // giới hạn tin nhắn / giây / kết nối
const F_BUSH = 1, F_GATLING = 4, F_DEAD = 8, F_CAMO = 16, F_CANOPY = 32;
// xe đỗ dưới tán cây còn lá (cờ F_CANOPY): drone địch chỉ thấy khi gần như ngay trên đầu (khớp TeamIntel.CANOPY_SPOT)
const CANOPY_SPOT = 120;
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
const TeamBalance = require('./src/core/team_balance.js');
const FLUSH_MS = 50;           // nhịp gom gói gửi đi (20 / giây, bằng nhịp gửi của máy khách)

// ---------------------------------------------------------------------------
// BẢN ĐỒ MẬT ĐỘ RỪNG (dựng trong luồng phụ từ MapGen)
// ---------------------------------------------------------------------------
const forestCache = new Map();       // `${type}|${seed}|${layout}` -> Promise<Map> (map.sig = chữ ký bản đồ MapGen)
const WORKER_SRC = `
const { parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const src = fs.readFileSync(workerData.file, 'utf8');
const MapGen = new Function(src + '\\nreturn MapGen;')();
MapGen.setLayout(workerData.layout);
const m = MapGen.generate(workerData.type, workerData.seed);
const dens = {};
for (const t of m.trees) {
  const w = t.kind === 'cactus' ? 0 : t.kind === 'deadTree' ? 0.35 : t.kind === 'plane' ? 0.5 : 1;   // plane: cây vỉa hè đô thị (đứng thưa thành hàng)
  if (!w) continue;
  const k = Math.floor(t.x / ${DC}) * 100000 + Math.floor(t.z / ${DC});
  dens[k] = (dens[k] || 0) + w;
}
// cứ điểm: vòng tròn BAO TRỌN vùng chiếm thật -> máy chủ đếm thời gian có mặt của mỗi phe, kiểm tra phe báo thắng do
// giữ cờ (endMatch). Cứ điểm bê tông (strongholds.js inCaptureZone): |f| < ZONE_END 170, |r| < cutHalf + 6 = 96 + loe 0.62
// -> góc xa nhất ~ hypot(170, 148) = 225 -> vòng 235. Bản đồ cũ: vòng 85 -> 100
const caps = m.strongholds && m.strongholds.length
  ? m.strongholds.map(c => ({ id: String(c.id), x: c.x, z: c.z, r: 235 }))
  : (m.capture || []).map((c, i) => ({ id: 'ABC'[i], x: c.x, z: c.z, r: 100 }));
// lưới độ cao gốc (dò đường ngắm qua đồi núi — khớp TeamIntel.terrainBlocked / elevK)
parentPort.postMessage({ dens, sig: m.sig, caps, heights: m.heights, res: m.res, size: m.size }, [m.heights.buffer]);
`;
function forestFor(type, seed, layout) {
  const key = type + '|' + seed + '|' + layout;
  if (forestCache.has(key)) return forestCache.get(key);
  const p = new Promise((resolve) => {
    if (!Worker) return resolve(null);
    try {
      const w = new Worker(WORKER_SRC, { eval: true, workerData: { file: path.join(__dirname, 'src', 'core', 'map_gen.js'), type, seed, layout } });
      w.once('message', (o) => {
        const m = new Map(); for (const k in o.dens) m.set(Number(k), o.dens[k]); m.sig = o.sig || null; m.caps = o.caps || null;
        m.H = o.heights && o.res ? { h: o.heights, res: o.res, half: o.size / 2, cell: o.size / o.res } : null;
        resolve(m); w.terminate();
      });
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
// ĐỊA HÌNH CHẮN TẦM NHÌN + ĐỨNG CAO NHÌN XA (khớp TeamIntel: EYE_H / TGT_H / LOS_STEP / LOS_END / ELEV_K / ELEV_MAX, cùng
// lưới map.heights, cùng các điểm dò). Máy chủ nới rộng hơn máy khách để luôn gửi đủ: đường ngắm cao hơn LOS_UP ở cả 2
// đầu + ngưỡng chắn LOS_UP (chỉ coi là bị chắn khi đất cao hơn đường ngắm của máy khách >= 2 x LOS_UP), chênh cao cộng
// thêm ELEV_SLACK khi tính tầm nhìn xa
const EYE_H = 18, TGT_H = 18, LOS_STEP = 42, LOS_END = 40, ELEV_K = 320, ELEV_MAX = 0.35;
const LOS_UP = 6, ELEV_SLACK = 4;
// = MapGen.sampleH (nội suy song tuyến lưới độ cao)
function sampleH(H, x, z) {
  const R = H.res, N = R + 1, gx = (x + H.half) / H.cell, gz = (z + H.half) / H.cell;
  const ix = Math.max(0, Math.min(R - 1, Math.floor(gx))), iz = Math.max(0, Math.min(R - 1, Math.floor(gz)));
  const fx = Math.max(0, Math.min(1, gx - ix)), fz = Math.max(0, Math.min(1, gz - iz)), h = H.h;
  const h00 = h[iz * N + ix], h10 = h[iz * N + ix + 1], h01 = h[(iz + 1) * N + ix], h11 = h[(iz + 1) * N + ix + 1];
  return (h00 * (1 - fx) + h10 * fx) * (1 - fz) + (h01 * (1 - fx) + h11 * fx) * fz;
}
function elevK(H, vx, vz, ex, ez) {
  if (!H) return 1 + ELEV_MAX;
  return 1 + Math.min(ELEV_MAX, Math.max(0, sampleH(H, vx, vz) - sampleH(H, ex, ez) + ELEV_SLACK) / ELEV_K);
}
function terrainBlocked(H, vx, vz, ex, ez) {
  if (!H) return false;
  const dx = ex - vx, dz = ez - vz, d = Math.hypot(dx, dz), ya = sampleH(H, vx, vz) + EYE_H + LOS_UP, yb = sampleH(H, ex, ez) + TGT_H + LOS_UP;
  for (let s = LOS_END; s < d - LOS_END; s += LOS_STEP) {
    const k = s / d;
    if (sampleH(H, vx + dx * k, vz + dz * k) > ya + (yb - ya) * k + LOS_UP) return true;
  }
  return false;
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
    drones: new Map(),     // xe pháo -> { x, z, until } drone đang bay
    vis: { BLUE: new Set(), RED: new Set() },
    sent: new Map(),       // máy nhận -> Map(xe -> trạng thái đã gửi | {hid:1})
    dirty: new Set(),      // xe có trạng thái mới chờ gửi ở nhịp tới
    uts: [],               // thời điểm mẫu của trạng thái mới nhất từng xe
    flushN: 0,
    dens: null,
    mapSig: null,                               // chữ ký bản đồ máy chủ tự sinh (MapGen) — so với chữ ký máy khách gửi
    clientSigs: new Map(),                      // máy -> chữ ký bản đồ máy đó gửi khi khai báo trận
    sigWarned: new Set(),                       // máy đã bị ghi cảnh báo lệch bản đồ (ghi 1 lần)
    violations: new Map(),
    id: Math.random().toString(36).slice(2),   // nhận diện trận (tính thành tích tài khoản theo trận)
    lastHit: new Map(),                         // `${xe bị trúng}|${máy}` -> lúc gây sát thương hợp lệ gần nhất
    lastFireBy: new Map(),                      // máy -> lúc bắn gần nhất (kiểm tra ENV_HIT)
    kd: new Map(),                              // xe -> { kills, deaths, damage } đã kiểm tra (xếp hạng top 3 K/D)
    teamKills: { BLUE: 0, RED: 0 },             // hạ gục theo phe (đã kiểm tra) -> kết quả trận hết giờ
    ended: false,
    stats: new Map(),                           // máy -> số liệu dò bất thường (noteFire / noteHit / reportSuspects)
    seenAt: { BLUE: new Map(), RED: new Map() }, // phe -> (xe địch -> lúc thấy gần nhất)
    t0: Date.now(),
    chain: '', chainN: 0,                       // chuỗi băm sự kiện đã kiểm tra (chainAdd)
    killLog: [],                                // [ms từ đầu trận, xe bắn, xe bị hạ] -> nhật ký trận (matches.log)
    caps: null,                                 // cứ điểm [{ id, x, z, r }] (luồng phụ dựng bản đồ trả về)
    capPresence: {},                            // id cứ điểm -> { BLUE: giây, RED: giây } có ít nhất 1 xe phe đó trong vòng
    capAt: 0                                    // lần đếm có mặt trước (ms)
  };
  // Phe + máy điều khiển của từng xe lấy theo đội hình máy chủ đã kiểm tra lúc xuất trận (vetLobby), không theo
  // danh sách chủ phòng tự khai (xe thứ i = slot thứ i: game tạo xe đúng thứ tự slot)
  const L = room.lobbySlots;
  if (L && L.length === M.roster.length) {
    for (const r of M.roster) {
      const s = L[r.i];
      if (!s) continue;
      if (r.team !== s.team || r.peer !== s.peer || r.rd !== s.rd || r.cm !== s.cm) flag(M, { id: fromId, name: '' }, `khai báo trận lệch đội hình đã kiểm tra (xe ${r.i})`);
      r.team = s.team; r.peer = s.peer; r.rd = s.rd; r.cm = s.cm;
    }
  }
  M.byIdx = new Map(M.roster.map(r => [r.i, r]));
  chainAdd(M, `M,${M.id},${M.mapType},${M.seed},${M.roster.map(r => r.team[0] + r.type[0] + (r.peer ? 'H' : 'B')).join('')}`);
  room.match = M;
  // mở sổ thành tích trận mạng cho mọi người chơi có tài khoản ngay từ đầu trận: kết quả gửi lên sau trận luôn được
  // đối chiếu với máy chủ (trước đây người không bắn trúng ai thì không có sổ -> tự báo thắng vẫn được tin)
  if (accounts && accounts.noteOnline) {
    for (const r of M.roster) {
      const c = r.peer ? room.members.get(r.peer) : null;
      if (c && c.userId) accounts.noteOnline(c.userId, M.id, 0, 0, 0);
    }
  }
  forestFor(M.mapType, M.seed, M.layout).then(dens => {
    if (room.match !== M) return;
    M.dens = dens;
    M.mapSig = dens ? dens.sig : null;
    M.caps = dens && dens.caps ? dens.caps : null;
    for (const [id, sig] of M.clientSigs) checkMapSig(room, M, id, sig);
  });
  console.log(`[AUTH] Phòng ${room.name}: trận ${M.mapType} #${M.seed} (${M.layout}), ${M.roster.length} xe`);
}

// Máy khách sinh bản đồ lệch máy chủ (cùng loại + seed nhưng khác chữ ký: trình duyệt tính dấu phẩy động khác, bản
// map_gen.js cũ trong bộ nhớ đệm...) -> cây / nhà / đường lệch, lọc tầm nhìn theo rừng của máy chủ sai với máy đó
function checkMapSig(room, M, clientId, sig) {
  M.clientSigs.set(clientId, sig);
  if (!M.mapSig || sig === M.mapSig || M.sigWarned.has(clientId)) return;
  M.sigWarned.add(clientId);
  console.warn(`[AUTH] Phòng ${room.name}: máy ${clientId} sinh bản đồ ${M.mapType} #${M.seed} lệch máy chủ (chữ ký ${sig} ≠ ${M.mapSig})`);
}

function ownerOf(room, r) {
  if (r && r.peer && room.members.has(r.peer)) return r.peer;
  return room.hostId;
}
function teamOfClient(M, clientId) {
  for (const r of M.roster) if (r.peer === clientId) return r.team;
  return null;   // người xem / chưa có xe: nhận đầy đủ
}
// Chuyển tin cho các máy cùng phe `team` (trừ máy gửi); người xem chưa có xe vẫn nhận
function sendTeam(room, M, team, fromId, msg) {
  const out = JSON.stringify({ t: msg.t, f: fromId, d: msg.d === undefined ? null : msg.d });
  room.members.forEach((member, id) => {
    if (id === fromId) return;
    const t = teamOfClient(M, id);
    if (!t || t === team) member.sendText(out);
  });
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
    const drones = [];
    for (const [i, dr] of M.drones) {
      if (dr.until < now) { M.drones.delete(i); continue; }
      const r = M.byIdx.get(i);
      if (r && r.team === team && M.S[i] && !(M.S[i].f & F_DEAD)) drones.push(dr);
    }
    for (const e of M.roster) {
      if (e.team === team) continue;
      const s = M.S[e.i];
      if (!s) continue;
      if (s.f & F_DEAD) { set.add(e.i); continue; }
      const sp = M.spotted[team].get(e.i);
      if (sp && sp > now) { set.add(e.i); continue; }
      const ex = s.x / 10, ez = s.z / 10, m = meta(M, e.i), revealed = m.revealUntil > now;
      // xe tăng đang phát sóng phá UAV: lộ với mọi xe địch trong tầm dò phương
      if (m.jamUntil > now && mine.some(u => Math.hypot(ex - M.S[u.i].x / 10, ez - M.S[u.i].z / 10) < EW_DETECT)) { set.add(e.i); continue; }
      const inForest = !revealed && densityAt(M.dens, ex, ez) >= FOREST_DENSE;
      // núp bụi chưa nổ súng: radar / mắt thường phải vào gần hơn tùy loại xe (BUSH_COVER; + MARGIN để hiện mượt)
      const bush = !revealed && (s.f & F_BUSH) ? BUSH_COVER[e.type] || null : null;
      // cờ ngụy trang chỉ tin khi xe có lắp lưới và thật sự đứng yên (chống gửi cờ giả để tàng hình khi chạy)
      const camo = !revealed && (s.f & F_CAMO) && e.cm && Math.abs(s.s || 0) / 10 < (BASE_SPEED[e.type] || 122) * 0.08;
      // xe to đứng yên trong bụi (dung sai 8% tốc độ tối đa như cờ ngụy trang): mắt thường phải vào gần hơn; lấy cái mạnh hơn
      // giữa bụi & lưới ngụy trang (khớp TeamIntel.seesDirect)
      const still = bush && bush.still && Math.abs(s.s || 0) / 10 < (BASE_SPEED[e.type] || 122) * 0.08 ? bush.still : 1;
      const rk = (bush ? bush.radar : 1) * (camo ? CAMO_RADAR : 1), sk = Math.min(still, camo ? CAMO_SIGHT : 1);
      // drone trinh sát phe mình soi từ trên xuống (bụi che trinh sát / rừng rậm che như mắt thường / tán cây che từ trên)
      const canopy = !revealed && (s.f & F_CANOPY);
      if (drones.some(dr => {
        const d = Math.hypot(ex - dr.x, ez - dr.z);
        return d < DRONE_SIGHT + MARGIN && !(bush && bush.spot && d > bush.spot + MARGIN) && !(inForest && d > FOREST_SPOT + MARGIN)
          && !(canopy && d > CANOPY_SPOT + MARGIN);
      })) { set.add(e.i); continue; }
      for (const u of mine) {
        const v = M.S[u.i], vx = v.x / 10, vz = v.z / 10, d = Math.hypot(ex - vx, ez - vz);
        if (d < CLOSE) { set.add(e.i); break; }
        if (u.type === 'SCOUT' && d < RADAR_RANGE * rk) { set.add(e.i); break; }
        if (u.rd && d < EQ_RADAR_RANGE * rk) { set.add(e.i); break; }
        const H = M.dens && M.dens.H, ek = elevK(H, vx, vz, ex, ez);   // đứng cao nhìn xa (khớp TeamIntel.elevK, nới thêm)
        if (d > (bush && bush.spot ? Math.min(SIGHT[u.type] * sk * ek, bush.spot) : SIGHT[u.type] * sk * ek) + MARGIN) continue;
        if (inForest && d > FOREST_SPOT + MARGIN) continue;
        if (M.dens && denseLength(M.dens, vx, vz, ex, ez, FOREST_LOS + 60) > FOREST_LOS + 60) continue;
        if (terrainBlocked(H, vx, vz, ex, ez)) continue;   // đồi núi chắn đường ngắm (nới hơn TeamIntel.terrainBlocked)
        set.add(e.i); break;
      }
    }
    M.vis[team] = set;
    const seen = M.seenAt[team];
    for (const i of set) seen.set(i, now);   // lúc phe này thấy xe i gần nhất (dò bắn trúng xe không nhìn thấy)
  }
}

// Thời gian có mặt ở cứ điểm (cùng nhịp tầm nhìn, 5 / giây): mỗi phe cộng dồn số giây có ít nhất 1 xe còn sống trong
// vòng bao cứ điểm. Không mô phỏng luật cờ (phe đông hơn kéo cờ, đồng hồ giữ...) — chỉ cần điều kiện CẦN để kiểm tra
// phe báo thắng do giữ cờ: giữ đủ 60 s thì phải có mặt ít nhất ngần ấy giây. 3 cứ điểm x 20 xe: ~60 phép tính / nhịp
function updateCapPresence(M, now) {
  const dt = M.capAt ? Math.min(1, (now - M.capAt) / 1000) : 0;
  M.capAt = now;
  if (!M.caps || !dt) return;
  for (const c of M.caps) {
    const P = M.capPresence[c.id] || (M.capPresence[c.id] = { BLUE: 0, RED: 0 });
    const inT = { BLUE: false, RED: false };
    for (const r of M.roster) {
      const s = M.S[r.i];
      if (!s || (s.f & F_DEAD) || inT[r.team]) continue;
      if (Math.hypot(s.x / 10 - c.x, s.z / 10 - c.z) <= c.r) inT[r.team] = true;
    }
    if (inT.BLUE) P.BLUE += dt;
    if (inT.RED) P.RED += dt;
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
  if (typeof d.a === 'number' && d.a >= 0) noteHit(room, client, d, now);
  chainAdd(M, `D,${now - M.t0},${typeof d.a === 'number' ? d.a : -1},${d.v},${Math.round(amount * 1000)},${d.k ? 1 : 0}`);
  return true;
}

// Chuỗi băm (kiểu sổ cái): mỗi sự kiện đã kiểm tra băm nối vào mã trước -> sửa / xóa 1 sự kiện bất kỳ trong nhật ký là
// lệch toàn bộ mã phía sau. Hết trận gửi mã cuối cho mọi người chơi giữ làm biên nhận (@receipt) -> máy chủ cũng không
// sửa lén được nhật ký trận đã phát biên nhận. SHA-256 vài micro giây / sự kiện.
function chainAdd(M, ev) {
  M.chain = crypto.createHash('sha256').update(M.chain + '|' + ev).digest('hex');
  M.chainN++;
}

// Báo cáo nhân chứng (netcode.js witnessTick): máy của xe bị trúng thấy mọi đạn bản sao của kẻ bắn đều không bay tới
// gần mà kẻ bắn vẫn báo trúng. Chỉ nhận khi: người báo đúng là người lái xe bị trúng, kẻ bắn là người chơi phe kia,
// và máy chủ vừa thật sự chấp nhận 1 phát trúng của kẻ bắn vào xe đó (không báo khống được). Mỗi người báo / kẻ bắn: 1 tin / 2 s
function onWitness(room, client, d) {
  const M = room.match, now = Date.now();
  if (!d || typeof d.a !== 'number' || typeof d.v !== 'number') return;
  const vr = M.byIdx.get(d.v), ar = M.byIdx.get(d.a);
  if (!vr || !ar || vr.peer !== client.id || !ar.peer || ar.peer === client.id || ar.team === vr.team) return;
  if (now - (M.lastHit.get(d.v + '|' + ar.peer) || 0) > 8000) return;
  const atk = room.members.get(ar.peer);
  if (!atk) return;
  const s = statOf(M, atk), key = client.id;
  s.witAt = s.witAt || new Map();
  if (now - (s.witAt.get(key) || 0) < 2000) return;
  s.witAt.set(key, now);
  s.wit = (s.wit || 0) + 1;
  (s.witBy || (s.witBy = new Set())).add(key);
  chainAdd(M, `W,${now - M.t0},${d.a},${d.v},${Math.max(-1, Math.min(99999, d.d | 0))}`);
}

// ---------------------------------------------------------------------------
// DÒ BẤT THƯỜNG (chỉ đếm, O(1) mỗi gói; hết trận mới xét): chỉ xe người chơi (bot do chủ phòng chạy không tính)
//  - trúng xe phe mình KHÔNG thấy (quá 3 s chưa thấy, trừ pháo tự hành bắn theo dấu / báo cáo) -> nghi hack nhìn xuyên
//  - xe tăng chính xác bất thường (tỉ lệ phát trúng / phát bắn) -> nghi hack ngắm
// Chỉ ghi nhật ký (data/suspects.log) để người quản trị xem lại, không tự cấm (tránh cấm nhầm người chơi giỏi)
// ---------------------------------------------------------------------------
const SUS = { HIDDEN_MS: 3000, HIDDEN_MIN: 6, HIDDEN_RATE: 0.35, AIM_MIN_SHOTS: 25, AIM_RATE: 0.85, WIT_MIN: 4, WIT_PEOPLE: 2, WIT_RATE: 0.25 };
function statOf(M, client) {
  let s = M.stats.get(client.id);
  if (!s) M.stats.set(client.id, s = { name: client.name || '', userId: client.userId || null, shots: 0, shotHits: 0, hits: 0, hidden: 0, pend: new Set() });
  return s;
}
function noteFire(room, client, r) {
  if (!r.peer || r.peer !== client.id) return;   // chỉ xe người chơi tự lái
  const s = statOf(room.match, client);
  if (r.type === 'ALL_ROUNDER') { s.shots++; s.pend.add(r.i); }
}
function noteHit(room, client, d, now) {
  const M = room.match, ar = M.byIdx.get(d.a);
  if (!ar || !ar.peer || ar.peer !== client.id) return;
  const s = statOf(M, client);
  s.hits++;
  if (ar.type !== 'ARTILLERY' && now - (M.seenAt[ar.team].get(d.v) || 0) > SUS.HIDDEN_MS) s.hidden++;
  if (s.pend.delete(d.a)) s.shotHits++;   // phát pháo chính đầu tiên trúng kể từ lần bắn trước
}
function reportSuspects(room, M) {
  const out = [];
  for (const [id, s] of M.stats) {
    const why = [];
    if (s.hidden >= SUS.HIDDEN_MIN && s.hidden / Math.max(1, s.hits) >= SUS.HIDDEN_RATE) why.push(`trúng ${s.hidden}/${s.hits} phát vào xe không nhìn thấy`);
    if (s.shots >= SUS.AIM_MIN_SHOTS && s.shotHits / s.shots >= SUS.AIM_RATE) why.push(`pháo chính trúng ${s.shotHits}/${s.shots} phát`);
    // nhân chứng chéo: nhiều người bị bắn KHÁC NHAU cùng thấy "đạn ma" (1 người hoặc 1 nhóm nhỏ không đủ để vu cáo)
    const wb = s.witBy ? s.witBy.size : 0;
    if ((s.wit || 0) >= SUS.WIT_MIN && wb >= SUS.WIT_PEOPLE && s.wit / Math.max(1, s.hits) >= SUS.WIT_RATE) why.push(`${s.wit} phát trúng mà đạn không bay tới (${wb} nhân chứng)`);
    if (!why.length) continue;
    console.warn(`[AUTH] Nghi gian lận: máy ${id} (${s.name}) — ${why.join('; ')}`);
    out.push(JSON.stringify({ t: Date.now(), room: room.name, match: M.id, map: M.mapType, client: id, user: s.userId, name: s.name,
      why, shots: s.shots, shotHits: s.shotHits, hits: s.hits, hidden: s.hidden, wit: s.wit || 0, witBy: s.witBy ? s.witBy.size : 0, chain: M.chain }));
  }
  if (out.length && accounts && accounts.DATA_DIR) fs.appendFile(path.join(accounts.DATA_DIR, 'suspects.log'), out.join('\n') + '\n', () => {});
}

// Hết trận (chủ phòng báo MATCH kèm end): máy chủ tự phân thắng thua cho từng tài khoản
//  - hết giờ: theo tỉ số hạ gục máy chủ tự đếm (M.teamKills), không theo tỉ số chủ phòng gửi
//  - giữ cứ điểm đủ 60 s: phe chủ phòng báo phải thật sự có mặt ở cứ điểm đó >= CAP_HOLD_MIN giây (updateCapPresence);
//    không đủ -> coi là báo khống, phân thắng thua theo tỉ số hạ gục như hết giờ
const CAP_HOLD_MIN = 48;   // 60 s giữ cờ, dung sai 20% (nhịp đếm 5 / giây, trễ gói trạng thái)
function capClaimOk(M, w, cpName) {
  if (!M.caps || !M.caps.length) return { ok: true, why: 'chưa có bản đồ cứ điểm' };   // luồng phụ chưa xong / lỗi: không kết luận
  const m = /([A-Z0-9]+)\s*$/.exec(String(cpName || ''));
  const P = (m && M.capPresence[m[1]]) || null;
  // không khớp tên cứ điểm: lấy cứ điểm phe đó có mặt lâu nhất (vẫn là điều kiện cần)
  const sec = P ? P[w] : Math.max(0, ...Object.values(M.capPresence).map(x => x[w] || 0));
  return { ok: sec >= CAP_HOLD_MIN, sec };
}
function endMatch(room, M, end) {
  if (M.ended) return;
  M.ended = true;
  let win = null;   // 'BLUE' | 'RED' | null = hòa
  const byKills = () => { const b = M.teamKills.BLUE, r = M.teamKills.RED; return b === r ? null : (b > r ? 'BLUE' : 'RED'); };
  if (end && end.r === 'capture') {
    const w = String(end.w || '').toUpperCase();
    const chk = (w === 'BLUE' || w === 'RED') ? capClaimOk(M, w, end.cp) : { ok: false, sec: 0 };
    if (chk.ok) win = w;
    else {
      const host = room.members.get(room.hostId);
      flag(M, host || { id: room.hostId, name: '' }, `báo phe ${w} thắng do giữ ${end.cp || 'cứ điểm'} nhưng chỉ có mặt ${(chk.sec || 0).toFixed(0)} s`);
      win = byKills();
    }
  } else win = byKills();
  if (accounts && accounts.noteResult) {
    for (const r of M.roster) {
      const c = r.peer ? room.members.get(r.peer) : null;
      if (c && c.userId) accounts.noteResult(c.userId, M.id, win === null ? 'draw' : (win === r.team ? 'win' : 'loss'));
    }
  }
  chainAdd(M, `E,${Date.now() - M.t0},${win || 'DRAW'},${M.teamKills.BLUE},${M.teamKills.RED}`);
  reportSuspects(room, M);
  // biên nhận trận cho mọi người chơi + nhật ký trận (1 dòng / trận: hạ gục, kết quả, mã chuỗi cuối)
  const receipt = { m: M.id, n: M.chainN, h: M.chain, w: win || 'DRAW', k: [M.teamKills.BLUE, M.teamKills.RED] };
  room.members.forEach(c => c.sendJSON({ t: '@receipt', d: receipt }));
  if (accounts && accounts.DATA_DIR) {
    const players = M.roster.filter(r => r.peer).map(r => { const c = room.members.get(r.peer); return { i: r.i, team: r.team, user: c ? c.userId || null : null, name: c ? c.name : '' }; });
    fs.appendFile(path.join(accounts.DATA_DIR, 'matches.log'), JSON.stringify({ t: Date.now(), room: room.name, match: M.id, map: M.mapType, seed: M.seed,
      win: receipt.w, kills: receipt.k, players, killLog: M.killLog, n: M.chainN, chain: M.chain }) + '\n', () => {});
  }
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
  M.killLog.push([Date.now() - M.t0, ai, d.v]);
  // tỉ số hạ gục theo phe (máy chủ tự đếm từ sát thương đã kiểm tra; bắn đồng đội không tính) -> phân thắng thua hết giờ
  const ar = ai >= 0 ? M.byIdx.get(ai) : null, vr = M.byIdx.get(d.v);
  if (ar && vr && ar.team !== vr.team) M.teamKills[ar.team]++;
  if (!accounts || !accounts.notePlace) return;
  const top = Equipment.rankKD([...M.kd.values()]);
  for (const r of M.roster) {
    const c = r.peer ? room.members.get(r.peer) : null;
    if (c && c.userId) accounts.notePlace(c.userId, M.id, top.findIndex(t => t.key === r.i) + 1);
  }
}

// ---------------------------------------------------------------------------
// KIỂM TRA ĐỘI HÌNH LÚC XUẤT TRẬN (START_COUNTDOWN / LAUNCH_GAME_NOW của chủ phòng)
// Chủ phòng là máy người chơi: tự chia phe + gửi trang bị của mọi người -> máy chủ kiểm tra 1 lần / lệnh, rẻ:
//  - điểm xếp phe: thay bằng số liệu máy chủ đọc từ tài khoản lúc vào phòng (client.skill), không tin số trong slot
//  - trang bị người chơi: lọc theo kho đồ thật (accounts.verifyKit), khách chỉ đồ miễn phí
//  - chia phe: chỉ KIỂM TRA (TeamBalance.check, vài trăm phép tính), sai mới tự chia lại (TeamBalance.improve)
// Sửa gì thì sửa thẳng vào gói đang chuyển tiếp cho khách + gửi '@slots' báo chủ phòng (chủ phòng chuẩn dùng bản sửa
// khi xuất trận); danh sách đã kiểm tra giữ ở room.lobbySlots để khai báo trận (@match) lấy phe theo đó
// ---------------------------------------------------------------------------
// So 2 bộ trang bị theo nội dung (thứ tự món / khóa không tính)
function kitKey(k) {
  if (!k) return '';
  const d = k.d ? Object.keys(k.d).sort().map(i => i + ':' + k.d[i].slice().sort().join(',')).join(';') : '';
  return [(k.m || []).slice().sort().join(','), (k.p || []).slice().sort().join(','),
    Object.keys(k.a || {}).sort().map(a => a + '=' + k.a[a]).join(','), d].join('|');
}
function vetLobby(room, client, d) {
  if (!d || !Array.isArray(d.slots) || d.slots.length > 20) return;
  const slots = d.slots.filter(s => s && typeof s === 'object');
  if (slots.length !== d.slots.length) return;
  const LF = { violations: room.lobbyFlags || (room.lobbyFlags = new Map()) };   // đếm vi phạm ở sảnh (như flag trong trận)
  let changed = false;
  const H = [];
  for (const s of slots) {
    s.team = s.team === 'RED' ? 'RED' : 'BLUE';
    if (!s.isHuman) continue;
    const m = typeof s.peerId === 'string' ? room.members.get(s.peerId) : null;
    // không còn trong phòng / mã lạ: coi như bot (không có máy nào được điều khiển xe đó)
    if (!m) { s.isHuman = false; s.peerId = null; s.kit = null; s.rating = null; changed = true; continue; }
    const r = TeamBalance.ratingOfSkill(m.skill || null);
    if (Math.abs((Number(s.rating) || 0) - r) > 1e-6) { s.rating = r; changed = true; }
    if (accounts && accounts.verifyKit) {
      let kit = null;
      try { kit = accounts.verifyKit(m.userId || null, s.tankType, s.kit); } catch (e) { kit = null; }
      if (kit) {
        if (kitKey(kit) !== kitKey(Equipment.sanitize(s.kit, s.tankType))) { flag(LF, m, `trang bị xe ${s.tankType} khác kho đồ tài khoản`); changed = true; }
        s.kit = kit;   // luôn chuyển tiếp bản đã kiểm tra (đã lọc mã lạ)
      }
    }
    H.push(s);
  }
  const w = H.map(s => s.rating), blue0 = H.map(s => s.team === 'BLUE');
  const ok = TeamBalance.check(w, blue0);
  if (!ok.ok) {
    flag(LF, client, `chia phe sai: ${ok.reason}`);
    TeamBalance.applySplit(slots, H, blue0, TeamBalance.improve(w, blue0));
    changed = true;
  }
  // Cờ radar lắp thêm / lưới ngụy trang (máy chủ dùng để lọc tầm nhìn) tính từ trang bị đã kiểm tra: người chơi theo kit
  // vừa lọc, bot theo đúng công thức game dựng trang bị bot (Equipment.botKit + hạt giống trận, game.js initEntitiesWithSlots)
  const seed = (Number(d.spawnSeed) || 0) >>> 0;
  const POOL = ['ALL_ROUNDER', 'GATLING', 'ARTILLERY', 'SCOUT'];
  room.lobbySlots = slots.map((s, idx) => {
    const tank = POOL.includes(s.tankType) ? s.tankType : POOL[idx % 4];
    const kit = Equipment.sanitize(s.isHuman ? s.kit : Equipment.botKit(tank, seededRandom((seed ^ (idx * 0x9e3779b1)) >>> 0)), tank);
    const has = id => kit.m.includes(id) || Equipment.builtin(tank, id);
    return { team: s.team, peer: s.isHuman ? s.peerId : null, rd: tank !== 'SCOUT' && has('radar') ? 1 : 0, cm: has('camo') ? 1 : 0 };
  });
  if (changed) client.sendJSON({ t: '@slots', d: { slots } });
}
// = ArtilleryGame3D.seededRandom (game.js): phải giống hệt để tính ra cùng bộ trang bị bot
function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
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

  if (msg.t === 'SNAP' || msg.t === '@slots' || msg.t === '@receipt') return true;   // tên dành riêng cho gói máy chủ phát -> không chuyển tiếp tin giả mạo
  if ((msg.t === 'START_COUNTDOWN' || msg.t === 'LAUNCH_GAME_NOW') && client.id === room.hostId && typeof msg.to !== 'string') {
    vetLobby(room, client, msg.d);
    return false;   // chuyển tiếp gói (đã sửa tại chỗ) cho cả phòng
  }
  if (msg.t === '@match') {
    const d = msg.d || {};
    // chủ phòng (hoặc máy đầu tiên khi chưa có trận) khai báo trận: danh sách xe, bản đồ
    if (client.id === room.hostId || !room.match) initMatch(room, d, client.id);
    if (room.match && typeof d.sig === 'string') checkMapSig(room, room.match, client.id, d.sig.slice(0, 16));
    return true;
  }
  if (msg.t === '@match_end') {
    if (client.id === room.hostId) {
      if (room.match && !room.match.ended) reportSuspects(room, room.match);   // rời trận giữa chừng: vẫn xét số liệu đã đếm
      room.match = null; room.lobbySlots = null;
    }
    return true;
  }
  const M = room.match;
  if (msg.t === 'WITNESS' && !M) return true;   // tin chỉ dành cho máy chủ: hết trận rồi thì bỏ, không chuyển tiếp
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
      noteFire(room, client, r);
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
    case 'WITNESS':
      onWitness(room, client, msg.d);
      return true;   // chỉ máy chủ đọc, không chuyển tiếp
    case 'MATCH': {
      // (HOST_ONLY ở trên: chỉ chủ phòng tới được đây) gói hết trận -> máy chủ tự phân thắng thua
      const d = msg.d || {};
      if (d.end) endMatch(room, M, d.end);
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
      const d = msg.d || {}, r = M.byIdx.get(d.i), st = M.S[d.i];
      if (!r || r.type !== 'ARTILLERY' || ownerOf(room, r) !== client.id) return true;
      // drone đang bay (s: 1 cất cánh / 2 bay / 3 bay về; x, z nhân 10): ghi vị trí để drone soi xe địch cho cả phe
      // (updateVisibility). Drone không bay quá xa xe (tầm tín hiệu) — xa hơn coi như không soi
      const up = d.s >= 1 && d.s <= 3 && Number.isFinite(d.x) && Number.isFinite(d.z);
      const dx = up ? d.x / 10 : 0, dz = up ? d.z / 10 : 0;
      if (up && st && !(st.f & F_DEAD) && Math.hypot(dx - st.x / 10, dz - st.z / 10) <= (MAX_RANGE.ARTILLERY || 3200) + 600) {
        M.drones.set(d.i, { x: dx, z: dz, until: now + DRONE_TTL_MS });
      } else M.drones.delete(d.i);
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
    case 'AA_MG': {
      // trạm súng phòng không xe tăng: chỉ máy điều khiển xe đó; đang bóp cò thì tính như vừa bắn (cho phát trúng drone)
      const d = msg.d || {}, r = M.byIdx.get(d.i), st = M.S[d.i];
      // trạm vũ khí / máy phá sóng trên chân đế mô-đun: xe tăng, xe 6 nòng (ô NÓC THÁP)
      if (!r || (r.type !== 'ALL_ROUNDER' && r.type !== 'GATLING') || ownerOf(room, r) !== client.id || (st && (st.f & F_DEAD))) return true;
      if (d.f) M.lastFireBy.set(client.id, now);
      // máy phá sóng chống UAV đang phát (trường j): địch dò phương thấy xe trong tầm EW_DETECT (updateVisibility)
      if (d.j !== undefined) meta(M, d.i).jamUntil = d.j ? now + 1300 : 0;
      // máy phá khóa radar xe 6 nòng đang phát (trường lj): cũng lộ vị trí như trên
      if (d.lj !== undefined) meta(M, d.i).jamUntil = d.lj ? now + 1300 : 0;
      return false;
    }
    case 'DRONE_LOCK': {
      // cảnh báo drone bị khóa: chỉ máy điều khiển xe đang khóa, xe phòng không còn sống, khóa drone của phe địch
      const d = msg.d || {}, ar = M.byIdx.get(d.a), or = M.byIdx.get(d.o), as = M.S[d.a];
      if (!ar || !or || or.type !== 'ARTILLERY' || ar.team === or.team || ownerOf(room, ar) !== client.id) return true;
      if (as && (as.f & F_DEAD)) return true;
      return false;
    }
    case 'DRONE_DOWN': {
      const d = msg.d || {}, r = M.byIdx.get(d.o);
      if (!r || r.type !== 'ARTILLERY' || ownerOf(room, r) !== client.id) return true;
      M.drones.delete(d.o);   // drone rơi: thôi soi
      return false;
    }
    case 'DIG': {
      // ủi ụ đất / đào hào: chỉ máy điều khiển xe 6 nòng đó
      const d = msg.d || {}, r = M.byIdx.get(d.i);
      if (!r || r.type !== 'GATLING' || ownerOf(room, r) !== client.id) return true;
      return false;
    }
    case 'SPOT': {
      const d = msg.d || {}, sr = M.byIdx.get(d.s), tr = M.byIdx.get(d.t);
      if (!sr || !tr || sr.type !== 'SCOUT' || ownerOf(room, sr) !== client.id) return true;
      M.spotted[sr.team].set(d.t, now + SPOT_MS);
      sendTeam(room, M, sr.team, client.id, msg);   // phe địch không được biết mình vừa bị trinh sát phát hiện
      return true;
    }
    case 'QCMD': {
      // lệnh nhanh bộ đàm (quick_comms.js): chỉ người lái xe đó, xe còn sống, tối đa 4 lệnh / 6 s, chỉ gửi cho phe mình
      const d = msg.d || {}, r = M.byIdx.get(d.i), st = r && M.S[d.i];
      if (!r || r.peer !== client.id || !st || (st.f & F_DEAD)) return true;
      if (!Number.isInteger(d.c) || d.c < 0 || d.c > 7) return true;
      if (d.x !== undefined && !(Number.isFinite(d.x) && Number.isFinite(d.z) && Math.abs(d.x) < 1e5 && Math.abs(d.z) < 1e5)) return true;
      const q = client._qcmd || (client._qcmd = []);
      while (q.length && now - q[0] > 6000) q.shift();
      if (q.length >= 4) return true;
      q.push(now);
      sendTeam(room, M, r.team, client.id, { t: 'QCMD', d: { i: d.i, c: d.c, x: d.x, z: d.z, t: Number.isInteger(d.t) ? d.t : undefined, o: typeof d.o === 'string' ? d.o.slice(0, 1) : undefined } });
      return true;
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
    rooms.forEach(room => { if (room.match) { updateVisibility(room.match, now); updateCapPresence(room.match, now); } });
  }, 200);
  const f = setInterval(() => { rooms.forEach(room => { if (room.match) flushRoom(room); }); }, FLUSH_MS);
  if (t.unref) t.unref();
  if (f.unref) f.unref();
}

module.exports = { handle, onLeave, startTicker, _test: { initMatch, updateVisibility, updateCapPresence, onUnitSync, flushRoom, validDamage, forestFor, densityAt } };
