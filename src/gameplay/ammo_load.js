// =====================================================================================================================
// CƠ SỐ ĐẠN MỖI LẦN XUẤT KÍCH (AmmoLoad)
// Trước đây đạn thường của pháo, băng 30mm, hộp súng máy / lựu / rocket xe trinh sát và hộp vũ khí trên bệ nóc tháp thay
// mãi không hết. Giờ mỗi lần xuất kích xe mang theo một cơ số lớn (gần như xe thật), bắn hết thì phải tiếp tế:
//   - hòm tiếp tế ĐẠN / TỔNG HỢP (SupplyManager.takeCrate) và hòm thả dù: nạp bù một phần lớn cơ số
//   - đứng yên cạnh xe đồng đội (cả 2 xe dừng, không vừa bắn / vừa trúng đạn): kíp xe chuyền đạn sang, khá nhanh
//   - tự hồi rất chậm (kíp xe gom đạn rời / lật kho phụ trong khoang) — chỉ để xe không bao giờ "chết đứng" hẳn
// Đạn đặc chủng (xuyên phá / nổ mạnh / đạn chùm / đạn cháy / tên lửa) vẫn đếm riêng như cũ (Equipment.startLife).
// Bộ đếm chỉ chạy trên máy điều khiển xe (xe người chơi / bot của chủ phòng); xe bản sao mạng (u._netProxy) bắn theo gói
// tin như cũ, không bị chặn. Phòng thử (trường bắn / stronghold lab / freecam) không giới hạn.
// "reserve" = số viên / quả mang theo NGOÀI băng / hộp đang lắp trên súng; với pháo nòng đơn là tổng số quả đạn thường
// trong khoang (kể cả quả đang nạp).
// =====================================================================================================================
const AmmoLoad = (() => {
  // n: cơ số mang theo · step: 1 lượt tiếp tế (quả / viên) · trickle: giây tự hồi 1 step · ally: giây nhận 1 step khi
  // đứng cạnh đồng đội · unit: đơn vị hiển thị
  const MAIN = {
    ALL_ROUNDER: { n: 36, step: 1, trickle: 30, ally: 2.5, unit: 'quả', name: 'đạn pháo 120mm' },
    ARTILLERY:   { n: 30, step: 1, trickle: 36, ally: 3.0, unit: 'quả', name: 'đạn lựu pháo 155mm' },
    GATLING:     { n: 1500, step: 300, trickle: 75, ally: 10, unit: 'viên', name: 'đạn 30mm' }
  };
  // xe trinh sát: theo vũ khí đang lắp trên chân đế (số hộp / dây dự trữ ngoài hộp trên súng)
  const SCOUT = {
    mg:     { boxes: 5, trickle: 70, ally: 9, unit: 'viên', name: 'đạn 12.7mm' },
    agl:    { boxes: 3, trickle: 80, ally: 10, unit: 'quả', name: 'lựu 40mm' },
    rocket: { boxes: 2, trickle: 90, ally: 12, unit: 'quả', name: 'rocket' }
  };
  // vũ khí trên bệ nóc tháp (DroneAir.roofCfg): số hộp dự trữ; tên lửa đột nóc: thêm 1 cặp, kíp xe ra lắp ống mới
  const ROOF = {
    rcws: { boxes: 4, trickle: 90, ally: 9, unit: 'viên', name: 'đạn 7.62mm' },
    agl:  { boxes: 3, trickle: 90, ally: 10, unit: 'quả', name: 'lựu 40mm' },
    atgm: { boxes: 1, trickle: 120, ally: 15, step: 1, reload: 14, unit: 'quả', name: 'tên lửa đột nóc' }
  };
  const ALLY_R = 55;            // khoảng cách 2 xe để chuyền đạn
  const STILL = 3;              // tốc độ coi như đứng yên
  const QUIET_FIRE = 3;         // giây không bắn trước khi chuyền đạn
  const QUIET_HIT = 5;          // giây không trúng đạn trước khi chuyền đạn

  const isLab = () => typeof window !== 'undefined' && !!(window.RANGE_LAB || window.STRONGHOLD_LAB || window.FREECAM_LAB
    || (typeof location !== 'undefined' && location.search && location.search.includes('lab=')));
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
  const log = (msg, kind) => { const g = typeof window !== 'undefined' && window.game; if (g && g.addCombatLog) g.addCombatLog(msg, kind); };
  const refreshHud = () => { const g = typeof window !== 'undefined' && window.game; if (g && g.updateAmmoUI) { try { g.updateAmmoUI(); } catch (e) { /* bỏ qua */ } } };

  // dựng bộ đếm cho xe (gọi lười trong update: lúc này súng / bệ nóc / hòm băng mua thêm đã lắp xong)
  function init(u) {
    const L = { slots: {}, ally: null };
    let m = MAIN[u.tankType];
    if (u.tankType === 'SCOUT') {
      const k = (u.mainGun && SCOUT[u.mainGun.kind]) ? u.mainGun.kind : 'mg', S = SCOUT[k], box = Math.max(1, u.gatlingMagMax || 100);
      m = { n: S.boxes * box, step: box, trickle: S.trickle, ally: S.ally, unit: S.unit, name: S.name };
    }
    if (m) L.slots.main = { ...m, left: m.n, acc: 0, warned: false };
    if (u.rcwsGun) {
      const kind = u.roofWeapon && ROOF[u.roofWeapon] ? u.roofWeapon : 'rcws', R = ROOF[kind];
      const box = Math.max(1, (typeof DroneAir !== 'undefined' && DroneAir.roofCfg) ? DroneAir.roofCfg(u).mag : 200);
      const step = R.step || box;
      L.slots.roof = { n: R.boxes * box, step, trickle: R.trickle, ally: R.ally, unit: R.unit, name: R.name, reload: R.reload || 0,
        left: R.boxes * box, acc: 0, warned: false };
    }
    u._load = L;
    return L;
  }

  const tracks = u => !!(u && u._load && !u._netProxy);
  const slot = (u, k) => (tracks(u) ? u._load.slots[k] : null);
  /** Cơ số còn (ngoài băng đang lắp). Xe không đếm: Infinity */
  function left(u, k) { const s = slot(u, k); return s ? s.left : Infinity; }
  function max(u, k) { const s = slot(u, k); return s ? s.n : Infinity; }
  function frac(u, k) { const s = slot(u, k); return s ? s.left / Math.max(1, s.n) : 1; }

  /** Rút n viên / quả từ cơ số; trả về số rút được (xe không đếm: luôn đủ n) */
  function take(u, k, n) {
    if (!(n > 0)) return 0;
    const s = slot(u, k);
    if (!s) return n;
    const got = Math.max(0, Math.min(n, Math.floor(s.left)));
    s.left -= got;
    if (got > 0) u._load.shotT = now();   // bóp cò lúc đã hết đạn không tính là vừa bắn (vẫn nhận chuyền đạn được)
    if (u.isPlayer) {
      if (s.left <= 0) dryNote(u, k);
      else if (!s.warned && s.left <= s.n * 0.25) {
        s.warned = true;
        log(`[[alert-triangle]] Cơ số ${s.name} còn ${Math.floor(s.left)} ${s.unit} (~25%) — tìm hòm đạn hoặc dừng cạnh xe đồng đội để nhận đạn`, 'alert');
      }
    }
    return got;
  }
  /** Trả lại cơ số (hộp tháo ra còn đạn cất vào khoang) — không chặn trần: khoang đầy vẫn nhét lại được hộp dở, ngay sau
   *  đó hộp mới được rút ra (fillMag) */
  function give(u, k, n) {
    const s = slot(u, k);
    if (!s || !(n > 0)) return;
    s.left += n;
    if (s.left > s.n * 0.3) s.warned = false;
  }
  // báo hết cơ số (giãn ~6 s / lần)
  function dryNote(u, k) {
    const s = slot(u, k);
    if (!s || !u.isPlayer) return;
    const t = now();
    if (t - (s.dryT || -99) < 6) return;
    s.dryT = t;
    log(`[[alert-octagon]] HẾT CƠ SỐ ${s.name.toUpperCase()} — nhặt hòm ĐẠN / TỔNG HỢP, dừng cạnh xe đồng đội để chuyền đạn, hoặc chờ kíp xe gom đạn rời (~1 ${s.step > 1 ? 'hộp' : s.unit} / ${s.trickle} s)`, 'alert');
  }
  /** Nạp hộp mới cho súng băng / hộp (xe 6 nòng, trinh sát): hộp cũ còn bao nhiêu cất lại vào khoang, rút hộp đầy */
  function fillMag(u, cur, magMax) {
    if (!tracks(u) || !u._load.slots.main) return magMax;
    give(u, 'main', Math.max(0, cur || 0));
    return take(u, 'main', magMax);
  }
  /** Bệ nóc tháp thay hộp xong: số viên trong hộp mới */
  function fillRoof(u, magMax) {
    if (!tracks(u) || !u._load.slots.roof) return magMax;
    return take(u, 'roof', magMax);
  }
  /** Bệ nóc: hết hộp mà cơ số còn -> có nên bắt đầu thay hộp (gọi khi S.mag <= 0, S.reload <= 0) */
  function roofCanReload(u) { const s = slot(u, 'roof'); return !!s && s.left > 0; }
  function roofReloadTime(u, base) { const s = slot(u, 'roof'); return base > 0 ? base : (s && s.reload) || 12; }

  /**
   * Tiếp tế từ hòm: nạp bù phần cơ số (frac của cơ số đầy) cho mọi ô. Trả về câu mô tả ngắn cho nhật ký (rỗng nếu xe
   * không đếm / đã đầy)
   */
  function resupply(u, fr, opts = {}) {
    if (!tracks(u)) return '';
    const parts = [];
    for (const k in u._load.slots) {
      const s = u._load.slots[k];
      const add = Math.min(s.n - s.left, Math.ceil(s.n * fr));
      if (add <= 0) continue;
      s.left += add;
      if (s.left > s.n * 0.3) s.warned = false;
      parts.push(`+${add} ${s.unit} ${s.name}`);
    }
    // bệ nóc / súng băng đang rỗng vì hết cơ số: nạp ngay
    kick(u);
    if (parts.length && !opts.silent) refreshHud();
    return parts.join(', ');
  }
  // vừa có đạn mà súng / bệ đang rỗng: cho kíp xe bắt đầu thay hộp
  function kick(u) {
    const S = u._rcws;
    if (S && u._load.slots.roof && S.mag <= 0 && !(S.reload > 0) && u._load.slots.roof.left > 0) {
      const R = typeof DroneAir !== 'undefined' && DroneAir.roofCfg ? DroneAir.roofCfg(u) : null;
      S.reload = roofReloadTime(u, R ? R.reload : 0);
    }
  }

  // hồi theo từng lượt nguyên (1 quả pháo / 1 hộp băng) — không nhỏ giọt vài viên làm kíp xe thay hộp lẻ liên tục
  function step(u, s, k, dt, period) {
    if (s.left >= s.n) { s.acc = 0; return false; }
    s.acc += dt / period;
    if (s.acc < 1) return false;
    s.acc -= 1;
    const add = Math.min(s.n - s.left, s.step);
    const wasDry = s.left <= 0;
    s.left += add;
    if (s.left > s.n * 0.3) s.warned = false;
    if (wasDry) kick(u);
    return true;
  }

  // đồng đội gần nhất đang dừng (chuyền đạn được)
  function allyFor(u, units, t) {
    if (Math.abs(u.speed || 0) > STILL) return null;
    if (t - (u._load.shotT || -99) < QUIET_FIRE) return null;
    if (t - (u._lastHitAt || -99000) / 1000 < QUIET_HIT) return null;
    let best = null, bd = ALLY_R * ALLY_R;
    for (const o of units) {
      if (!o || o === u || o.isDead || o.team !== u.team || Math.abs(o.speed || 0) > STILL) continue;
      const dx = o.x - u.x, dz = o.z - u.z, d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  /** Mỗi khung hình (game.js): dựng bộ đếm lười, tự hồi chậm, chuyền đạn khi đứng cạnh đồng đội */
  function update(dt, game) {
    if (!(dt > 0) || !game || !game.units || isLab()) return;
    const t = now();
    for (const u of game.units) {
      if (!u || u.isDead || u._netProxy) continue;
      const L = u._load || init(u);
      let changed = false;
      // điểm tiếp tế hậu phương phe mình (supply_depot.js): dừng hẳn trong vùng -> nạp nhanh nhất; không thì chuyền đạn
      // cạnh đồng đội; không nữa thì tự hồi chậm
      const DP = typeof SupplyDepot !== 'undefined' ? SupplyDepot : null;
      const inDepot = DP && Math.abs(u.speed || 0) <= DP.STILL ? DP.at(game, u) : null;
      const depot = inDepot && t - (L.shotT || -99) >= 1.5 ? inDepot : null;
      const ally = depot ? null : allyFor(u, game.units, t);
      const src = depot || ally;
      let need = false;
      for (const k in L.slots) {
        const s = L.slots[k];
        if (s.left < s.n) need = true;
        changed = step(u, s, k, dt, depot ? s.ally / DP.RATE : ally ? s.ally : s.trickle) || changed;
      }
      // báo người chơi lúc bắt đầu / xong nạp đạn
      if (u.isPlayer) {
        if (src && need && L.ally !== src) log(depot ? '[[package]] Điểm tiếp tế: kíp hậu cần đang chất đạn lên xe — giữ xe đứng yên'
          : `[[package]] Đang nhận đạn chuyền từ ${ally.name || 'xe đồng đội'} — giữ xe đứng yên`, 'tip');
        if (L.ally && !need && L.ally === src) log('[[check]] Đã nạp đầy cơ số đạn', 'tip');
        if (changed) refreshHud();
      }
      L.ally = src && need ? src : null;
      L.depot = !!depot;
    }
  }

  /** Xe hồi sinh: cơ số đầy lại (dựng lại lười ở khung tới) */
  function reset(u) { if (u) u._load = null; }

  /** Chữ ngắn cho HUD: "+1500" (cơ số ngoài băng), rỗng nếu xe không đếm */
  function hud(u, k) {
    const s = slot(u, k);
    return s ? Math.floor(s.left) : null;
  }

  return { MAIN, SCOUT, ROOF, init, reset, tracks, left, max, frac, take, give, fillMag, fillRoof, roofCanReload, roofReloadTime,
    resupply, update, dryNote, hud };
})();
if (typeof window !== 'undefined') window.AmmoLoad = AmmoLoad;
