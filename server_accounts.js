/**
 * TÀI KHOẢN NGƯỜI CHƠI (tên đăng nhập + mật khẩu, không xác minh email)
 * - Lưu bằng SQLite có sẵn trong Node (node:sqlite, Node >= 22.13): một tệp data/accounts.db, chế độ WAL.
 *   Mỗi thay đổi chỉ ghi vài dòng (không ghi lại cả kho như tệp JSON) -> nhẹ dù có hàng trăm nghìn tài khoản.
 * - Mật khẩu băm bằng scrypt + muối ngẫu nhiên riêng từng tài khoản (máy chủ không lưu mật khẩu gốc).
 * - Đăng nhập cấp mã phiên ngẫu nhiên 256 bit (chỉ lưu bản băm SHA-256 của mã), hạn 30 ngày.
 * - Chặn dò mật khẩu: sai quá 8 lần / 10 phút theo (IP, tên) -> khóa tạm; tối đa 10 tài khoản mới / giờ / IP.
 * - Kết quả trận do máy khách gửi: máy chủ giới hạn giá trị hợp lý & tối thiểu 45 giây / trận rồi tự tính kinh nghiệm, cấp bậc.
 * - Sao lưu tự động mỗi ngày (VACUUM INTO) vào data/backup/, giữ 7 bản gần nhất.
 * - Lần chạy đầu: tự nhập dữ liệu từ data/accounts.json cũ (nếu có), rồi đổi tên tệp cũ thành accounts.json.migrated.
 *
 * BẢNG
 *   users       1 dòng / người: tên, mật khẩu băm, kinh nghiệm, xe & bản đồ chọn gần nhất, tùy chỉnh
 *   user_stats  tổng cộng dồn theo (người, xe): trận, thắng, thua, hòa, hạ gục, bị hạ, sát thương, lượt bắn, thời gian
 *   matches     mỗi trận 1 dòng, chỉ ghi thêm (lịch sử)
 *   sessions    phiên đăng nhập (bản băm mã phiên)
 *
 * API (JSON):
 *   POST /api/register      { username, password }          -> { token, profile }
 *   POST /api/login         { username, password }          -> { token, profile }
 *   POST /api/logout        (Authorization: Bearer <token>)
 *   GET  /api/me                                            -> { profile }
 *   GET  /api/leaderboard                                   -> { top: [{ displayName, rankText, xp, ... }] }
 *   POST /api/profile       { displayName?, lastTank?, lastMap?, settings? } -> { profile }
 *   POST /api/password      { oldPassword, newPassword }    -> { ok }
 *   POST /api/match-result  { result, kills, deaths, damage, shots, tankType, mapType, durationSec, ammoUsed?, kdPlace? } -> { profile, gained, silver, kdPlace, kdBonus }
 *   POST /api/shop/buy      { tank, item } (mô-đun / đạn cao cấp) | { tank, ammo, n } (mua lẻ n viên; { packs } kiểu cũ vẫn nhận) -> { profile }
 *   POST /api/shop/sell     { tank, ammo, n } (trả lại n viên trong kho, hoàn đúng giá) -> { profile }
 *   POST /api/loadout       { tank, m: [mô-đun], a: { loại đạn: số viên mang thêm } } -> { profile }
 *   POST /api/ad/start      { tank, item } (đồ nâng cao) -> { token, sec }: bắt đầu xem quảng cáo
 *   POST /api/shop/claim    { tank, item, token } -> { profile }: xem đủ thời lượng thì nhận đồ (lưu vào owned, tự lắp nếu còn ô)
 *
 * CỬA HÀNG (danh mục & giá ở src/core/equipment.js, dùng chung với trò chơi): tiền "Bạc" nhận sau mỗi trận,
 *   tài khoản mới được tặng Equipment.START_SILVER. Mua bán ghi trong 1 giao dịch (trừ tiền chỉ khi đủ tiền).
 *   owned       đồ đã mua theo (người, xe, mã) — mô-đun & đạn cao cấp, mua 1 lần dùng mãi
 *   ammo_stock  kho đạn mua thêm theo (người, xe, loại đạn) — tiêu hao khi bắn trong trận
 *   loadouts    bộ trang bị đang lắp từng xe (JSON đã kiểm tra)
 *   purchases   nhật ký mua, chỉ ghi thêm
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Equipment = require('./src/core/equipment.js');

const DATA_DIR = process.env.ACCOUNTS_DIR ? path.resolve(process.env.ACCOUNTS_DIR) : path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'accounts.db');
const LEGACY_JSON = path.join(DATA_DIR, 'accounts.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backup');
const SESSION_DAYS = 30;
const MAX_BODY = 16 * 1024;
const TANKS = ['ALL_ROUNDER', 'GATLING', 'ARTILLERY', 'SCOUT'];
const MAPS = ['DESERT', 'URBAN', 'JUNGLE', 'HIGHLAND', 'RIVER_LAKE'];
// Cấp bậc: mỗi quân hàm 3 cấp
const RANKS = ['Binh nhì', 'Binh nhất', 'Hạ sĩ', 'Trung sĩ', 'Thượng sĩ', 'Thiếu úy', 'Trung úy', 'Thượng úy', 'Đại úy',
  'Thiếu tá', 'Trung tá', 'Thượng tá', 'Đại tá', 'Thiếu tướng', 'Trung tướng', 'Thượng tướng', 'Đại tướng'];

// ---------------------------------------------------------------------------
// MỞ CƠ SỞ DỮ LIỆU
// ---------------------------------------------------------------------------
let db = null, Q = null;
function openDb() {
  let DatabaseSync;
  // node:sqlite còn gắn nhãn "thử nghiệm" -> nuốt riêng dòng cảnh báo của nó cho nhật ký máy chủ gọn
  const emit = process.emitWarning;
  process.emitWarning = function (w, ...rest) { if (String(w && w.message || w).includes('SQLite')) return; return emit.call(process, w, ...rest); };
  try { ({ DatabaseSync } = require('node:sqlite')); }
  catch (e) { console.error('[ACC] Node này chưa có SQLite (cần Node >= 22.13). Tài khoản tạm tắt.'); return false; }
  finally { process.emitWarning = emit; }

  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new DatabaseSync(DB_FILE);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 3000;
    PRAGMA cache_size = -32000;      -- 32 MB trang dữ liệu nóng giữ trong RAM
    PRAGMA mmap_size = 268435456;    -- đọc qua ánh xạ bộ nhớ (tối đa 256 MB)
    PRAGMA temp_store = MEMORY;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      display_name TEXT NOT NULL,
      pass_salt TEXT NOT NULL,
      pass_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_login INTEGER NOT NULL,
      xp INTEGER NOT NULL DEFAULT 0,
      last_tank TEXT NOT NULL DEFAULT 'ALL_ROUNDER',
      last_map TEXT NOT NULL DEFAULT 'DESERT',
      settings TEXT NOT NULL DEFAULT '{}',
      last_result_at INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS users_xp ON users (xp DESC);
    CREATE TABLE IF NOT EXISTS user_stats (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tank TEXT NOT NULL,
      matches INTEGER NOT NULL DEFAULT 0, wins INTEGER NOT NULL DEFAULT 0, losses INTEGER NOT NULL DEFAULT 0, draws INTEGER NOT NULL DEFAULT 0,
      kills INTEGER NOT NULL DEFAULT 0, deaths INTEGER NOT NULL DEFAULT 0, damage REAL NOT NULL DEFAULT 0,
      shots INTEGER NOT NULL DEFAULT 0, play_sec INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, tank)
    ) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS matches (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      ended_at INTEGER NOT NULL,
      result TEXT NOT NULL, tank TEXT NOT NULL, map TEXT,
      kills INTEGER NOT NULL, deaths INTEGER NOT NULL, damage REAL NOT NULL, duration INTEGER NOT NULL, xp INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS matches_user_time ON matches (user_id, ended_at DESC);
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    ) WITHOUT ROWID;
    CREATE INDEX IF NOT EXISTS sessions_exp ON sessions (expires_at);
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS owned (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tank TEXT NOT NULL, item TEXT NOT NULL, at INTEGER NOT NULL,
      PRIMARY KEY (user_id, tank, item)
    ) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS ammo_stock (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tank TEXT NOT NULL, ammo TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, tank, ammo)
    ) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS loadouts (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tank TEXT NOT NULL, data TEXT NOT NULL,
      PRIMARY KEY (user_id, tank)
    ) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS purchases (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      at INTEGER NOT NULL, tank TEXT NOT NULL, item TEXT NOT NULL, qty INTEGER NOT NULL, cost INTEGER NOT NULL
    );
  `);
  // Ví Bạc (thêm cột cho CSDL cũ; tài khoản cũ cũng nhận quà khởi đầu)
  if (!db.prepare('PRAGMA table_info(users)').all().some(c => c.name === 'silver')) {
    db.exec(`ALTER TABLE users ADD COLUMN silver INTEGER NOT NULL DEFAULT ${Equipment.START_SILVER}`);
  }
  const P = (sql) => db.prepare(sql);
  Q = {
    userByName: P('SELECT * FROM users WHERE username = ?'),
    userById: P('SELECT * FROM users WHERE id = ?'),
    insertUser: P(`INSERT INTO users (username, display_name, pass_salt, pass_hash, created_at, last_login) VALUES (?, ?, ?, ?, ?, ?)`),
    touchLogin: P('UPDATE users SET last_login = ? WHERE id = ?'),
    setProfile: P('UPDATE users SET display_name = ?, last_tank = ?, last_map = ?, settings = ? WHERE id = ?'),
    setPassword: P('UPDATE users SET pass_salt = ?, pass_hash = ? WHERE id = ?'),
    addXp: P('UPDATE users SET xp = xp + ?, last_result_at = ? WHERE id = ?'),
    statsOf: P('SELECT * FROM user_stats WHERE user_id = ?'),
    addStats: P(`INSERT INTO user_stats (user_id, tank, matches, wins, losses, draws, kills, deaths, damage, shots, play_sec)
                 VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT (user_id, tank) DO UPDATE SET matches = matches + 1, wins = wins + excluded.wins, losses = losses + excluded.losses,
                   draws = draws + excluded.draws, kills = kills + excluded.kills, deaths = deaths + excluded.deaths,
                   damage = damage + excluded.damage, shots = shots + excluded.shots, play_sec = play_sec + excluded.play_sec`),
    addMatch: P(`INSERT INTO matches (user_id, ended_at, result, tank, map, kills, deaths, damage, duration, xp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    recent: P('SELECT ended_at, result, tank, map, kills, deaths, damage, duration, xp FROM matches WHERE user_id = ? ORDER BY ended_at DESC LIMIT 10'),
    top: P('SELECT id, display_name, xp FROM users ORDER BY xp DESC LIMIT 20'),
    sessionGet: P('SELECT user_id, expires_at FROM sessions WHERE token_hash = ?'),
    sessionAdd: P('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)'),
    sessionDel: P('DELETE FROM sessions WHERE token_hash = ?'),
    sessionDelOthers: P('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?'),
    sessionPurge: P('DELETE FROM sessions WHERE expires_at < ?'),
    countUsers: P('SELECT COUNT(*) AS n FROM users'),
    metaGet: P('SELECT value FROM meta WHERE key = ?'),
    metaSet: P('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value'),
    ownedOf: P('SELECT tank, item FROM owned WHERE user_id = ?'),
    ownedHas: P('SELECT 1 AS x FROM owned WHERE user_id = ? AND tank = ? AND item = ?'),
    addOwned: P('INSERT OR IGNORE INTO owned (user_id, tank, item, at) VALUES (?, ?, ?, ?)'),
    stockOf: P('SELECT tank, ammo, n FROM ammo_stock WHERE user_id = ? AND n > 0'),
    addStock: P(`INSERT INTO ammo_stock (user_id, tank, ammo, n) VALUES (?, ?, ?, ?)
                 ON CONFLICT (user_id, tank, ammo) DO UPDATE SET n = n + excluded.n`),
    useStock: P('UPDATE ammo_stock SET n = MAX(0, n - ?) WHERE user_id = ? AND tank = ? AND ammo = ?'),
    stockGet: P('SELECT n FROM ammo_stock WHERE user_id = ? AND tank = ? AND ammo = ?'),
    // trừ kho chỉ khi còn đủ (không bao giờ âm)
    takeStock: P('UPDATE ammo_stock SET n = n - ? WHERE user_id = ? AND tank = ? AND ammo = ? AND n >= ?'),
    loadoutsOf: P('SELECT tank, data FROM loadouts WHERE user_id = ?'),
    loadoutGet: P('SELECT data FROM loadouts WHERE user_id = ? AND tank = ?'),
    setLoadout: P('INSERT INTO loadouts (user_id, tank, data) VALUES (?, ?, ?) ON CONFLICT (user_id, tank) DO UPDATE SET data = excluded.data'),
    spend: P('UPDATE users SET silver = silver - ? WHERE id = ? AND silver >= ?'),
    addSilver: P('UPDATE users SET silver = silver + ? WHERE id = ?'),
    addPurchase: P('INSERT INTO purchases (user_id, at, tank, item, qty, cost) VALUES (?, ?, ?, ?, ?, ?)')
  };
  migrateLegacyJson();
  Q.sessionPurge.run(Date.now());
  console.log(`[ACC] SQLite ${path.basename(DB_FILE)}: ${Q.countUsers.get().n} tài khoản`);
  return true;
}

// chạy fn trong 1 giao dịch (lỗi -> hoàn tác toàn bộ)
function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { try { db.exec('ROLLBACK'); } catch (e2) {} throw e; }
}

// Nhập dữ liệu từ bản lưu JSON cũ (accounts.json) sang SQLite — chỉ 1 lần
function migrateLegacyJson() {
  if (!fs.existsSync(LEGACY_JSON) || Q.countUsers.get().n > 0) return;
  let o;
  try { o = JSON.parse(fs.readFileSync(LEGACY_JSON, 'utf8')); } catch (e) { console.error('[ACC] accounts.json hỏng, bỏ qua nhập:', e.message); return; }
  const users = (o && o.users) || {};
  let n = 0;
  tx(() => {
    const idOf = {};
    for (const key in users) {
      const u = users[key];
      const r = Q.insertUser.run(u.username, u.displayName || u.username, u.salt, u.hash, u.createdAt || Date.now(), u.lastLogin || Date.now());
      const id = Number(r.lastInsertRowid);
      idOf[key] = id;
      Q.setProfile.run(u.displayName || u.username, u.lastTank || 'ALL_ROUNDER', u.lastMap || 'DESERT', JSON.stringify(u.settings || {}), id);
      db.prepare('UPDATE users SET xp = ?, last_result_at = ? WHERE id = ?').run(u.xp || 0, u.lastResultAt || 0, id);
      for (const h of u.history || []) {
        Q.addMatch.run(id, h.t || 0, h.result || 'loss', h.tank || 'ALL_ROUNDER', h.map || null, h.kills || 0, h.deaths || 0, h.damage || 0, h.dur || 0, h.xp || 0);
      }
      // tổng cộng dồn: phần theo từng xe lấy từ byTank, phần còn lại (trận cũ không rõ xe) dồn vào xe đầu tiên
      const S = u.stats || {}, BT = S.byTank || {};
      const tanks = Object.keys(BT);
      if (!tanks.length && S.matches) tanks.push(u.lastTank || 'ALL_ROUNDER');
      tanks.forEach((t, i) => {
        const T = BT[t] || { matches: S.matches || 0, wins: S.wins || 0, kills: S.kills || 0 };
        const first = i === 0;
        db.prepare(`INSERT INTO user_stats (user_id, tank, matches, wins, losses, draws, kills, deaths, damage, shots, play_sec) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(id, t, T.matches || 0, T.wins || 0,
            first ? Math.max(0, (S.losses || 0)) : 0, first ? (S.draws || 0) : 0,
            T.kills || 0, first ? (S.deaths || 0) : 0, first ? (S.damage || 0) : 0, first ? (S.shots || 0) : 0, first ? (S.playSec || 0) : 0);
      });
      n++;
    }
    for (const th in o.sessions || {}) {
      const s = o.sessions[th];
      if (idOf[s.u] && s.exp > Date.now()) Q.sessionAdd.run(th, idOf[s.u], s.exp);
    }
  });
  fs.renameSync(LEGACY_JSON, LEGACY_JSON + '.migrated');
  console.log(`[ACC] Đã chuyển ${n} tài khoản từ accounts.json sang SQLite`);
}

// Sao lưu: bản chụp nhất quán của CSDL (không cần dừng máy chủ), giữ 7 bản
function backupIfDue() {
  if (!db) return;
  const last = Number((Q.metaGet.get('last_backup') || {}).value || 0);
  if (Date.now() - last < 24 * 3600e3) return;
  try {
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const d = new Date(), stamp = d.toISOString().slice(0, 10) + '_' + String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0');
    const file = path.join(BACKUP_DIR, `accounts-${stamp}.db`);
    if (fs.existsSync(file)) fs.unlinkSync(file);
    db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
    Q.metaSet.run('last_backup', String(Date.now()));
    const old = fs.readdirSync(BACKUP_DIR).filter(f => /^accounts-.*\.db$/.test(f)).sort();
    while (old.length > 7) fs.unlinkSync(path.join(BACKUP_DIR, old.shift()));
    console.log('[ACC] Đã sao lưu', path.basename(file));
  } catch (e) { console.error('[ACC] Sao lưu lỗi:', e.message); }
}

// ---------------------------------------------------------------------------
// MẬT KHẨU & PHIÊN
// ---------------------------------------------------------------------------
// scrypt chạy trong luồng nền của Node -> đăng nhập không làm khựng các trận đang chạy
function hashPassword(pw, saltHex) {
  const salt = saltHex ? Buffer.from(saltHex, 'hex') : crypto.randomBytes(16);
  return new Promise((resolve, reject) => crypto.scrypt(pw, salt, 64, { N: 16384, r: 8, p: 1 }, (err, hash) =>
    err ? reject(err) : resolve({ salt: salt.toString('hex'), hash: hash.toString('hex') })));
}
async function checkPassword(pw, u) {
  const h = await hashPassword(pw, u.pass_salt);
  const a = Buffer.from(h.hash, 'hex'), b = Buffer.from(u.pass_hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
function newSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  Q.sessionAdd.run(sha(token), userId, Date.now() + SESSION_DAYS * 864e5);
  return token;
}
function userFromReq(req) {
  const m = /^Bearer\s+([A-Za-z0-9_\-]{20,100})$/.exec(String(req.headers.authorization || ''));
  if (!m) return null;
  const th = sha(m[1]);
  const s = Q.sessionGet.get(th);
  if (!s || s.expires_at < Date.now()) return null;
  const u = Q.userById.get(s.user_id);
  return u ? { u, tokenHash: th } : null;
}

// chống dò mật khẩu
const fails = new Map();   // `${ip}|${key}` -> { n, t }
function tooMany(ip, key) {
  const f = fails.get(ip + '|' + key);
  return !!(f && Date.now() - f.t < 10 * 60e3 && f.n >= 8);
}
function noteFail(ip, key) {
  const k = ip + '|' + key, f = fails.get(k);
  if (!f || Date.now() - f.t > 10 * 60e3) fails.set(k, { n: 1, t: Date.now() });
  else f.n++;
  if (fails.size > 5000) fails.clear();
}
// chống tạo tài khoản hàng loạt: tối đa 10 tài khoản / giờ / IP
const regs = new Map();
function regAllowed(ip) {
  const r = regs.get(ip);
  if (!r || Date.now() - r.t > 3600e3) { regs.set(ip, { n: 1, t: Date.now() }); return true; }
  return ++r.n <= 10;
}

// ---------------------------------------------------------------------------
// HỒ SƠ & CẤP BẬC
// ---------------------------------------------------------------------------
function xpForLevel(L) { return 150 + L * 100; }   // điểm cần để lên từ cấp L -> L+1
function levelInfo(xp) {
  let L = 1, rest = xp;
  while (rest >= xpForLevel(L) && L < RANKS.length * 3) { rest -= xpForLevel(L); L++; }
  const ri = Math.min(RANKS.length - 1, Math.floor((L - 1) / 3));
  return { level: L, rank: RANKS[ri], tier: ((L - 1) % 3) + 1, xpInLevel: rest, xpToNext: xpForLevel(L) };
}
function publicProfile(u) {
  const li = levelInfo(u.xp);
  const stats = { matches: 0, wins: 0, losses: 0, draws: 0, kills: 0, deaths: 0, damage: 0, shots: 0, playSec: 0, byTank: {} };
  for (const r of Q.statsOf.all(u.id)) {
    stats.matches += r.matches; stats.wins += r.wins; stats.losses += r.losses; stats.draws += r.draws;
    stats.kills += r.kills; stats.deaths += r.deaths; stats.damage += r.damage; stats.shots += r.shots; stats.playSec += r.play_sec;
    stats.byTank[r.tank] = { matches: r.matches, wins: r.wins, kills: r.kills };
  }
  stats.damage = Math.round(stats.damage * 10) / 10;
  let settings = {};
  try { settings = JSON.parse(u.settings || '{}'); } catch (e) {}
  // lịch sử: cũ -> mới (giống định dạng cũ cho giao diện)
  const history = Q.recent.all(u.id).reverse().map(h => ({ t: h.ended_at, result: h.result, kills: h.kills, deaths: h.deaths,
    damage: h.damage, tank: h.tank, map: h.map, dur: h.duration, xp: h.xp }));
  // Kho đồ: đã mua, kho đạn, bộ trang bị từng xe
  const owned = {}, stock = {}, loadouts = {};
  for (const r of Q.ownedOf.all(u.id)) (owned[r.tank] || (owned[r.tank] = [])).push(r.item);
  for (const r of Q.stockOf.all(u.id)) (stock[r.tank] || (stock[r.tank] = {}))[r.ammo] = r.n;
  for (const r of Q.loadoutsOf.all(u.id)) { try { loadouts[r.tank] = JSON.parse(r.data); } catch (e) {} }
  return {
    silver: u.silver | 0, armory: { owned, stock, loadouts },
    username: u.username, displayName: u.display_name, createdAt: u.created_at,
    xp: u.xp, level: li.level, rank: li.rank, tier: li.tier, rankText: `${li.rank} Cấp ${li.tier}`, xpInLevel: li.xpInLevel, xpToNext: li.xpToNext,
    lastTank: u.last_tank, lastMap: u.last_map, settings, stats, history
  };
}

// Thành tích trận mạng do máy chủ tự đếm (server_auth.js gọi): giới hạn số máy khách tự báo khi lưu kết quả
const adPending = new Map();   // userId -> { tank, id, token, at }: phiên xem quảng cáo đang chạy (nhận đồ nâng cao)
const AD_SEC = 15;             // thời lượng quảng cáo tối thiểu (giây)
const online = new Map();   // userId -> { mk (mã trận), kills, deaths, damage, at }
function noteOnline(userId, matchKey, kills, deaths, damage) {
  const now = Date.now();
  let o = online.get(userId);
  if (!o || o.mk !== matchKey || now - o.at > 30 * 60e3) o = { mk: matchKey, kills: 0, deaths: 0, damage: 0, at: now };
  o.kills += kills; o.deaths += deaths; o.damage += damage; o.at = now;
  online.set(userId, o);
  if (online.size > 20000) online.clear();
}
// Hạng K/D trong trận mạng (server_auth.js tính từ số liệu đã kiểm tra): 1-3 = top 3, 0 = ngoài top
function notePlace(userId, matchKey, place) {
  const o = online.get(userId);
  if (o && o.mk === matchKey) o.place = place;
  else if (place) { noteOnline(userId, matchKey, 0, 0, 0); online.get(userId).place = place; }
}
function userIdFromToken(token) {
  if (!db || typeof token !== 'string' || !/^[A-Za-z0-9_\-]{20,100}$/.test(token)) return null;
  const s = Q.sessionGet.get(sha(token));
  return s && s.expires_at > Date.now() ? s.user_id : null;
}

// Bảng xếp hạng: ai cũng xem, ít thay đổi -> giữ sẵn kết quả 30 s (mọi người dùng chung 1 lần truy vấn)
let topCache = null, topAt = 0;
function leaderboard() {
  if (topCache && Date.now() - topAt < 30e3) return topCache;
  topCache = Q.top.all().map((r, i) => { const li = levelInfo(r.xp); return { place: i + 1, displayName: r.display_name, xp: r.xp, level: li.level, rankText: `${li.rank} Cấp ${li.tier}` }; });
  topAt = Date.now();
  return topCache;
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------
function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > MAX_BODY) { reject(new Error('too big')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}
const clampN = (v, lo, hi) => { v = Number(v); return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : lo; };
const USER_RE = /^[A-Za-z0-9_]{3,20}$/;
function cleanName(s) {
  // tên hiển thị: chữ (kể cả tiếng Việt), số, khoảng trắng, _ - . ; 2–24 ký tự
  const t = String(s || '').normalize('NFC').replace(/[^\p{L}\p{N} _\-.]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 24);
  return t.length >= 2 ? t : null;
}

// Kho đạn mua thêm mỗi loại: tối đa 10 lần số viên mang theo một lần xuất kích
const stockCap = (A) => A.max * 10;

// Bộ trang bị hợp lệ: đồ cơ bản (miễn phí) hoặc đồ nâng cao đã nhận / đã mua, lắp được trên xe, đủ ô từng nhóm
function cleanLoadout(userId, tank, b) {
  const k = Equipment.sanitize({ m: b && b.m, a: b && b.a }, tank);
  k.m = k.m.filter(id => Equipment.isFree(id) || Q.ownedHas.get(userId, tank, id));
  delete k.p;
  return k;
}

async function handle(req, res) {
  if (!db) return send(res, 503, { error: 'Máy chủ chưa bật tài khoản' });
  const url = String(req.url || '').split('?')[0];
  const ip = req.socket.remoteAddress || '?';
  try {
    if (req.method === 'GET' && url === '/api/me') {
      const a = userFromReq(req);
      return a ? send(res, 200, { profile: publicProfile(a.u) }) : send(res, 401, { error: 'Phiên đăng nhập đã hết hạn' });
    }
    if (req.method === 'GET' && url === '/api/leaderboard') {
      return send(res, 200, { top: leaderboard() });
    }
    if (req.method !== 'POST') return send(res, 405, { error: 'Sai phương thức' });
    const b = await readBody(req);

    if (url === '/api/register') {
      const username = String(b.username || '').trim(), pw = String(b.password || '');
      if (!USER_RE.test(username)) return send(res, 400, { error: 'Tên đăng nhập 3–20 ký tự, chỉ gồm chữ không dấu, số và dấu _' });
      if (pw.length < 6 || pw.length > 72) return send(res, 400, { error: 'Mật khẩu từ 6 đến 72 ký tự' });
      if (Q.userByName.get(username)) return send(res, 409, { error: 'Tên đăng nhập đã có người dùng' });
      if (!regAllowed(ip)) return send(res, 429, { error: 'Tạo quá nhiều tài khoản, thử lại sau' });
      const h = await hashPassword(pw);
      let id;
      try {
        const now = Date.now();
        id = Number(Q.insertUser.run(username, username, h.salt, h.hash, now, now).lastInsertRowid);
      } catch (e) {
        // UNIQUE: ai đó vừa đăng ký trùng tên trong lúc đang băm mật khẩu
        if (/UNIQUE/i.test(e.message)) return send(res, 409, { error: 'Tên đăng nhập đã có người dùng' });
        throw e;
      }
      const token = newSession(id);
      console.log(`[ACC] Tài khoản mới: ${username}`);
      return send(res, 200, { token, profile: publicProfile(Q.userById.get(id)) });
    }
    if (url === '/api/login') {
      const name = String(b.username || '').trim(), key = name.toLowerCase(), pw = String(b.password || '');
      if (tooMany(ip, key)) return send(res, 429, { error: 'Sai quá nhiều lần, thử lại sau 10 phút' });
      const u = USER_RE.test(name) ? Q.userByName.get(name) : null;
      if (!u || !(await checkPassword(pw, u))) { noteFail(ip, key); return send(res, 401, { error: 'Sai tên đăng nhập hoặc mật khẩu' }); }
      fails.delete(ip + '|' + key);
      Q.touchLogin.run(Date.now(), u.id);
      const token = newSession(u.id);
      return send(res, 200, { token, profile: publicProfile(u) });
    }

    const a = userFromReq(req);
    if (!a) return send(res, 401, { error: 'Chưa đăng nhập' });
    const u = a.u;

    if (url === '/api/logout') {
      Q.sessionDel.run(a.tokenHash);
      return send(res, 200, { ok: true });
    }
    if (url === '/api/profile') {
      let name = u.display_name, tank = u.last_tank, map = u.last_map, settings = u.settings;
      if (b.displayName !== undefined) {
        const n = cleanName(b.displayName);
        if (!n) return send(res, 400, { error: 'Tên hiển thị 2–24 ký tự' });
        name = n;
      }
      if (TANKS.includes(b.lastTank)) tank = b.lastTank;
      if (MAPS.includes(b.lastMap)) map = b.lastMap;
      if (b.settings && typeof b.settings === 'object') {
        const s = JSON.stringify(b.settings);
        if (s.length <= 2048) settings = s;
      }
      Q.setProfile.run(name, tank, map, settings, u.id);
      return send(res, 200, { profile: publicProfile(Q.userById.get(u.id)) });
    }
    if (url === '/api/password') {
      if (!(await checkPassword(String(b.oldPassword || ''), u))) return send(res, 401, { error: 'Mật khẩu cũ không đúng' });
      const pw = String(b.newPassword || '');
      if (pw.length < 6 || pw.length > 72) return send(res, 400, { error: 'Mật khẩu từ 6 đến 72 ký tự' });
      const h = await hashPassword(pw);
      tx(() => {
        Q.setPassword.run(h.salt, h.hash, u.id);
        Q.sessionDelOthers.run(u.id, a.tokenHash);   // đăng xuất mọi thiết bị khác
      });
      return send(res, 200, { ok: true });
    }
    if (url === '/api/shop/buy') {
      const tank = String(b.tank || '');
      if (!TANKS.includes(tank)) return send(res, 400, { error: 'Xe không hợp lệ' });
      const now = Date.now();
      if (b.item !== undefined) {
        const id = String(b.item);
        const price = Equipment.priceOf(id);
        if (!price || !Equipment.compatible(id, tank)) return send(res, 400, { error: 'Xe này không lắp được món đó' });
        if (Q.ownedHas.get(u.id, tank, id)) return send(res, 409, { error: 'Bạn đã có món này cho xe này rồi' });
        const ok = tx(() => {
          if (Number(Q.spend.run(price, u.id, price).changes) !== 1) return false;
          Q.addOwned.run(u.id, tank, id, now);
          Q.addPurchase.run(u.id, now, tank, id, 1, price);
          // mô-đun mới: tự lắp vào ô trống
          if (Equipment.MODULES[id]) {
            let cur = {};
            try { cur = JSON.parse((Q.loadoutGet.get(u.id, tank) || {}).data || '{}'); } catch (e) {}
            const k = cleanLoadout(u.id, tank, cur);
            if (k.m.length < Equipment.SLOTS && !k.m.includes(id)) { k.m.push(id); Q.setLoadout.run(u.id, tank, JSON.stringify(k)); }
          }
          return true;
        });
        if (!ok) return send(res, 402, { error: 'Không đủ Bạc' });
        return send(res, 200, { profile: publicProfile(Q.userById.get(u.id)) });
      }
      const ammo = String(b.ammo || ''), A = (Equipment.AMMO_SHOP[tank] || {})[ammo];
      if (!A) return send(res, 400, { error: 'Loại đạn không hợp lệ' });
      // mua lẻ từng viên (n), hoặc theo gói kiểu cũ (packs). Kho mỗi loại tối đa STOCK_CAP viên.
      const qty = b.n !== undefined ? Math.round(clampN(b.n, 1, 100)) : Math.round(clampN(b.packs, 1, 20)) * A.pack;
      const cost = qty * A.price, cap = stockCap(A);
      const r = tx(() => {
        const have = (Q.stockGet.get(u.id, tank, ammo) || {}).n || 0;
        if (have + qty > cap) return 'cap';
        if (Number(Q.spend.run(cost, u.id, cost).changes) !== 1) return 'silver';
        Q.addStock.run(u.id, tank, ammo, qty);
        Q.addPurchase.run(u.id, now, tank, 'ammo:' + ammo, qty, cost);
        return 'ok';
      });
      if (r === 'cap') return send(res, 409, { error: `Kho ${A.name.toLowerCase()} tối đa ${cap} viên` });
      if (r !== 'ok') return send(res, 402, { error: 'Không đủ Bạc' });
      return send(res, 200, { profile: publicProfile(Q.userById.get(u.id)) });
    }
    // ---- TRẢ LẠI ĐẠN MUA THÊM (bấm nhầm / đổi ý): trừ kho nếu còn đủ, hoàn đúng giá đã trả ----
    if (url === '/api/shop/sell') {
      const tank = String(b.tank || '');
      if (!TANKS.includes(tank)) return send(res, 400, { error: 'Xe không hợp lệ' });
      const ammo = String(b.ammo || ''), A = (Equipment.AMMO_SHOP[tank] || {})[ammo];
      if (!A) return send(res, 400, { error: 'Loại đạn không hợp lệ' });
      const qty = Math.round(clampN(b.n, 1, 100)), refund = qty * A.price, now = Date.now();
      const ok = tx(() => {
        if (Number(Q.takeStock.run(qty, u.id, tank, ammo, qty).changes) !== 1) return false;
        Q.addSilver.run(refund, u.id);
        Q.addPurchase.run(u.id, now, tank, 'ammo:' + ammo, -qty, -refund);
        return true;
      });
      if (!ok) return send(res, 409, { error: 'Trong kho không còn đủ đạn để trả lại' });
      return send(res, 200, { profile: publicProfile(Q.userById.get(u.id)) });
    }
    // ---- NHẬN ĐỒ NÂNG CAO BẰNG XEM QUẢNG CÁO ----
    // 1) /api/ad/start { tank, item } -> { token, sec }: máy chủ ghi lúc bắt đầu xem
    // 2) /api/shop/claim { tank, item, token }: chỉ nhận khi đã qua đủ thời lượng quảng cáo kể từ lúc bắt đầu
    // (khi gắn mạng quảng cáo thật: thay bước 2 bằng xác minh phía máy chủ của nhà cung cấp quảng cáo)
    if (url === '/api/ad/start' || url === '/api/shop/claim') {
      const tank = String(b.tank || ''), id = String(b.item || '');
      if (!TANKS.includes(tank)) return send(res, 400, { error: 'Xe không hợp lệ' });
      const it = Equipment.MODULES[id] || Equipment.PREMIUM[id];
      if (!it || !it.adv || !Equipment.compatible(id, tank)) return send(res, 400, { error: 'Món này không cần nhận / xe này không lắp được' });
      if (Q.ownedHas.get(u.id, tank, id)) return send(res, 409, { error: 'Bạn đã có món này cho xe này rồi' });
      const now = Date.now();
      if (url === '/api/ad/start') {
        const token = crypto.randomBytes(12).toString('hex');
        adPending.set(u.id, { tank, id, token, at: now });
        return send(res, 200, { token, sec: AD_SEC });
      }
      const p = adPending.get(u.id);
      if (!p || p.token !== String(b.token || '') || p.tank !== tank || p.id !== id) return send(res, 400, { error: 'Phiên xem quảng cáo không hợp lệ, thử lại' });
      if (now - p.at < (AD_SEC - 1.5) * 1000) return send(res, 400, { error: 'Chưa xem hết quảng cáo' });
      if (now - p.at > 15 * 60e3) { adPending.delete(u.id); return send(res, 400, { error: 'Phiên xem quảng cáo đã hết hạn' }); }
      adPending.delete(u.id);
      tx(() => {
        Q.addOwned.run(u.id, tank, id, now);
        Q.addPurchase.run(u.id, now, tank, id, 1, 0);
        // mô-đun vừa nhận: tự lắp nếu nhóm còn ô trống
        if (Equipment.MODULES[id]) {
          let cur = {};
          try { cur = JSON.parse((Q.loadoutGet.get(u.id, tank) || {}).data || '{}'); } catch (e) {}
          const k = cleanLoadout(u.id, tank, Object.assign({}, cur, { m: (cur.m || []).concat([id]) }));
          Q.setLoadout.run(u.id, tank, JSON.stringify(k));
        }
      });
      return send(res, 200, { profile: publicProfile(Q.userById.get(u.id)) });
    }
    if (url === '/api/loadout') {
      const tank = String(b.tank || '');
      if (!TANKS.includes(tank)) return send(res, 400, { error: 'Xe không hợp lệ' });
      Q.setLoadout.run(u.id, tank, JSON.stringify(cleanLoadout(u.id, tank, b)));
      return send(res, 200, { profile: publicProfile(Q.userById.get(u.id)) });
    }
    if (url === '/api/match-result') {
      const now = Date.now(), dur = clampN(b.durationSec, 0, 1800);
      if (dur < 45) return send(res, 400, { error: 'Trận quá ngắn, không tính' });
      const result = ['win', 'loss', 'draw'].includes(b.result) ? b.result : 'loss';
      // giới hạn sát thực tế theo thời lượng trận (10 phút: tối đa 25 hạ gục, sát thương ~ số hạ gục x máu xe dày nhất + phần lẻ)
      let kills = Math.round(clampN(b.kills, 0, Math.min(25, dur / 24 + 1)));
      let deaths = Math.round(clampN(b.deaths, 0, 60));
      let damage = Math.round(clampN(b.damage, 0, Math.min(kills * 3.5 + 25, dur * 0.12 + 8)) * 10) / 10;
      let shots = Math.round(clampN(b.shots, 0, dur * 3));
      // vừa chơi trận mạng: không vượt quá số máy chủ đã tự đếm
      const o = online.get(u.id);
      let verified = false;
      // hạng K/D trong trận (1-3 = top 3): trận mạng lấy theo máy chủ xếp, trận đánh máy lấy theo máy khách báo
      let kdPlace = Math.round(clampN(b.kdPlace, 0, 3));
      if (o && now - o.at < 15 * 60e3) {
        verified = true;
        kills = Math.min(kills, o.kills);
        damage = Math.min(damage, Math.round((o.damage + 0.5) * 10) / 10);
        deaths = Math.max(deaths, o.deaths);
        kdPlace = o.place || 0;
        online.delete(u.id);
      }
      if (kills < 1) kdPlace = 0;
      const kdBonus = kdPlace ? Equipment.KD_BONUS[kdPlace - 1] : null;
      const tank = TANKS.includes(b.tankType) ? b.tankType : 'ALL_ROUNDER';
      const map = MAPS.includes(b.mapType) ? b.mapType : null;
      const gained = Math.round(40 + (result === 'win' ? 100 : result === 'draw' ? 50 : 0) + kills * 30 + damage * 8 + Math.min(dur, 900) / 15) + (kdBonus ? kdBonus.xp : 0);
      const before = levelInfo(u.xp).level;
      const silver = Equipment.silverFor(result, kills, damage, dur) + (kdBonus ? kdBonus.silver : 0);
      // kiểm tra nhịp gửi + ghi 3 bảng trong cùng 1 giao dịch (đọc lại last_result_at bên trong -> không ghi trùng)
      const ok = tx(() => {
        const cur = Q.userById.get(u.id);
        if (now - cur.last_result_at < 40e3) return false;
        Q.addMatch.run(u.id, now, result, tank, map, kills, deaths, damage, Math.round(dur), gained);
        Q.addStats.run(u.id, tank, result === 'win' ? 1 : 0, result === 'loss' ? 1 : 0, result === 'draw' ? 1 : 0, kills, deaths, damage, shots, Math.round(dur));
        Q.addXp.run(gained, now, u.id);
        Q.addSilver.run(silver, u.id);
        // đạn mua thêm đã bắn trong trận: trừ kho (không âm)
        const used = b.ammoUsed && typeof b.ammoUsed === 'object' ? b.ammoUsed : {};
        for (const ammo in Equipment.AMMO_SHOP[tank] || {}) {
          const n = Math.round(clampN(used[ammo], 0, 5000));
          if (n > 0) Q.useStock.run(n, u.id, tank, ammo);
        }
        return true;
      });
      if (!ok) return send(res, 429, { error: 'Kết quả trận đã được ghi' });
      const p = publicProfile(Q.userById.get(u.id));
      return send(res, 200, { profile: p, gained, silver, levelUp: p.level > before, verified, kdPlace, kdBonus });
    }
    return send(res, 404, { error: 'Không có API này' });
  } catch (e) {
    if (!(e instanceof SyntaxError) && e.message !== 'too big') console.error('[ACC] Lỗi xử lý', url, e.message);
    return send(res, 400, { error: 'Yêu cầu không hợp lệ' });
  }
}

// ---------------------------------------------------------------------------
if (openDb()) {
  backupIfDue();
  // mỗi giờ: dọn phiên hết hạn, sao lưu nếu đã quá 1 ngày
  setInterval(() => { try { Q.sessionPurge.run(Date.now()); backupIfDue(); } catch (e) {} }, 3600e3).unref();
  const closeDb = () => { try { db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); db.close(); } catch (e) {} };
  process.on('SIGINT', () => { closeDb(); process.exit(0); });
  process.on('SIGTERM', () => { closeDb(); process.exit(0); });
}
module.exports = { handle, DATA_DIR, levelInfo, noteOnline, notePlace, userIdFromToken };
