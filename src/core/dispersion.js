/**
 * ĐỘ TẢN MÁT ĐẠN (độ chụm) — áp dụng như nhau cho người chơi và bot, cho mọi phát bắn.
 *
 * Mỗi phát: hướng đạn lệch ngẫu nhiên quanh hướng nòng một góc (phân bố chuẩn, σ tính bằng mrad = 1/1000 rad,
 * ~1 mil) -> sai lệch tại mục tiêu tăng tuyến tính theo cự ly; sơ tốc cũng dao động nhẹ (lựu pháo: lệch dọc tầm lớn).
 *
 * Số liệu gốc là σ THẬT (khẩu + đạn + kíp ngắm, mrad) nhân SCALE: thân xe trong game dựng theo 8 đv/m nhưng cự ly bị
 * nén 0.5 đv/m (game_timing.js) -> một chiếc xe ở cự ly game X trông to như ở cự ly thật 16·X. Nhân σ với 16 thì tỉ lệ
 * trúng theo cự ly giống ngoài đời. Lựu pháo dùng tỉ lệ riêng (σ theo % cự ly), xem ARTY_LOB.
 *
 * Độ tản mát tức thời tăng khi xe đang chạy, tháp đang quay, ngay sau khi bắn (súng liên thanh nở dần theo loạt);
 * giảm khi đứng yên ngắm lâu; lựu pháo phải hạ chân chống; vỡ kính ngắm pháo thủ / hỏng pháo thì kém chụm hơn.
 *
 * ĐỒNG BỘ NHIỀU NGƯỜI CHƠI: phát pháo / tên lửa gửi kèm vận tốc thật sau tản mát (REMOTE_FIRE_EVENT `v`) nên mọi máy
 * thấy cùng một đường bay. Đạn liên thanh không gửi từng viên (chỉ cờ bắn) -> lấy số ngẫu nhiên theo hạt giống
 * (mã xe, số loạt, số thứ tự viên trong loạt): các máy rải cùng một chùm. Sát thương đạn liên thanh vẫn do máy chủ quyền tính.
 */
const Dispersion = (() => {
  const SCALE = (typeof GameTiming !== 'undefined') ? GameTiming.UNITS_PER_M / GameTiming.rangeScale : 16;

  // σ thật (mrad) theo khóa đạn GameTiming.roundKey; mv = σ sơ tốc (tỉ lệ); bloom = độ nở sau mỗi phát
  // (cộng vào hệ số nhân, hết dần theo bloomDecay mỗi giây), bloomMax = trần độ nở
  const PROFILE = {
    TANK_AP:          { mil: 0.30, mv: 0.0010, bloom: 0.5, bloomMax: 0.5, bloomDecay: 0.6 },   // APFSDS nòng trơn 120: rất chụm
    TANK_NORMAL:      { mil: 0.40, mv: 0.0015, bloom: 0.5, bloomMax: 0.5, bloomDecay: 0.6 },   // HEAT
    TANK_HE:          { mil: 0.45, mv: 0.0015, bloom: 0.5, bloomMax: 0.5, bloomDecay: 0.6 },
    GATLING_BULLET:   { mil: 1.2, mv: 0.004, bloom: 0.02, bloomMax: 0.6, bloomDecay: 0.4 },  // 30 mm 6 nòng: tản rộng, nở theo loạt
    INCENDIARY:       { mil: 1.2, mv: 0.004, bloom: 0.02, bloomMax: 0.6, bloomDecay: 0.4 },
    SCOUT_BULLET:     { mil: 1.9, mv: 0.005, bloom: 0.1, bloomMax: 1.2, bloomDecay: 0.7 },   // súng máy 12.7 mm trên giá
    SCOUT_INCENDIARY: { mil: 1.9, mv: 0.005, bloom: 0.1, bloomMax: 1.2, bloomDecay: 0.7 },
    RPG:              { mil: 3.0, mv: 0.010, bloom: 0, bloomMax: 0, bloomDecay: 1 },
    ANTI_TANK_MISSILE:{ mil: 0.06, mv: 0, bloom: 0, bloomMax: 0, bloomDecay: 1 },               // dẫn đường: gần như không tản
    ARTY_DIRECT:      { mil: 0.55, mv: 0.0020, bloom: 0.4, bloomMax: 0.4, bloomDecay: 0.5 },  // lựu pháo hạ nòng bắn thẳng
    CLUSTER_SUBMUNITION: { mil: 0, mv: 0, bloom: 0, bloomMax: 0, bloomDecay: 1 }
  };
  // Lựu pháo bắn cầu vồng: σ hướng (mrad, đã theo tỉ lệ game) và σ sơ tốc — tầm ~ v² nên lệch dọc ≈ 2·mv·cự ly,
  // lệch ngang ≈ defl·cự ly -> vùng rơi là hình bầu dục dài theo hướng bắn
  const ARTY_LOB = { defl: 5, el: 1.0, mv: 0.012, bloom: 0.3, bloomMax: 0.3, bloomDecay: 0.4 };

  // BẮN CÀNG XA CÀNG KÉM CHỤM HƠN TỈ LỆ THUẬN: ngoài độ lệch góc (sai lệch tại đích tăng đều theo cự ly), đạn bay càng lâu
  // càng chịu thêm sai số khí tượng (gió giật, mật độ / nhiệt độ không khí dọc đường bay), nhiệt độ thuốc phóng, sai số đo
  // cự ly... -> σ nhân thêm (1 + grow·(cự ly / ref)²). Ở tầm bắn hiệu quả tối đa (ref): σ x (1 + grow).
  // Đạn liên thanh không áp dụng (độ tản mát theo loạt đã lớn, không biết trước cự ly từng viên).
  const RANGE_GROW = { ARTY_LOB: 1.0, ARTY_DIRECT: 0.6, GUN: 0.6 };

  // ảnh hưởng của chuyển động thân xe theo dòng xe (pháo tăng có ổn định pháo 2 trục -> ít bị ảnh hưởng nhất)
  const MOVE = { ALL_ROUNDER: 1.1, GATLING: 1.0, SCOUT: 1.5, ARTILLERY: 2.5 };
  const TURN_K = 0.025, TURN_MAX = 1.0;      // tháp quay 40°/s -> +100%
  const SETTLE_T = 2.0, SETTLE_GAIN = 0.22;  // đứng yên, nòng không đổi hướng 2 s -> chụm hơn 22%

  // ---------- số ngẫu nhiên theo hạt giống ----------
  function hashStr(s) {
    s = String(s);
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gauss(r) {
    const u = Math.max(1e-9, r()), v = r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function stateOf(u) {
    if (!u._disp) u._disp = { bloom: 0, rate: 0, still: 0, az: u.azimuth || 0, el: u.elevation || 0, body: u.bodyAngle || 0, burst: 0, shots: 0 };
    return u._disp;
  }
  const wrap180 = d => ((d % 360) + 540) % 360 - 180;

  /** Gọi mỗi khung hình cho mỗi xe (spg.update): đo tốc độ quay tháp / thân, thời gian đứng ngắm, độ nở giảm dần */
  function track(u, dt) {
    if (!u || !(dt > 0)) return;
    const S = stateOf(u);
    const dAz = Math.abs(wrap180((u.azimuth || 0) - S.az));
    const dEl = Math.abs((u.elevation || 0) - S.el);
    const dBody = Math.abs(wrap180(((u.bodyAngle || 0) - S.body) * 180 / Math.PI));
    S.az = u.azimuth || 0; S.el = u.elevation || 0; S.body = u.bodyAngle || 0;
    // tháp quay (độ/giây) + nòng nâng hạ + thân xe xoay (ổn định pháo bù được phần lớn); lọc mượt ~0.25 s
    const inst = Math.min(200, (dAz + dEl * 0.6 + dBody * 0.25) / dt);
    const k = Math.min(1, dt / 0.25);
    S.rate += (inst - S.rate) * k;
    const sp = Math.abs(u.speed || 0) / Math.max(1, u.baseMaxSpeed || 100);
    if (sp < 0.04 && S.rate < 3) S.still += dt; else S.still = 0;
    const P = profileFor(u, u.selectedAmmo, u.elevation);
    S.bloom = Math.max(0, S.bloom - dt * (P.bloomDecay || 1));
  }

  /** Bảng σ cho loại đạn của xe; elevation để phân biệt lựu pháo bắn cầu vồng / hạ nòng bắn thẳng */
  function profileFor(u, ammo, elevation) {
    const type = u && u.tankType;
    let a = ammo || 'NORMAL';
    if (type === 'GATLING' && a !== 'INCENDIARY') a = 'GATLING_BULLET';
    if (type === 'SCOUT' && a !== 'INCENDIARY' && a !== 'ANTI_TANK_MISSILE' && a !== 'RPG') a = 'SCOUT_BULLET';
    const key = typeof GameTiming !== 'undefined' ? GameTiming.roundKey(a, type) : 'TANK_NORMAL';
    if (key === 'ARTY') {
      const AD = typeof BallisticsSystem3D !== 'undefined' ? BallisticsSystem3D.ARTY_DIRECT : null;
      return (elevation !== undefined && elevation <= ((AD && AD.elMax) || 15) + 3) ? PROFILE.ARTY_DIRECT : ARTY_LOB;
    }
    return PROFILE[key] || PROFILE.TANK_NORMAL;
  }

  /** Hệ số nhân độ tản mát hiện tại của xe (1 = đứng yên vừa dừng tay) */
  function multiplier(u) {
    if (!u) return 1;
    const S = stateOf(u);
    let m = 1;
    const sp = Math.min(1.3, Math.abs(u.speed || 0) / Math.max(1, u.baseMaxSpeed || 100));
    m *= 1 + (MOVE[u.tankType] || 1.2) * sp;
    m *= 1 + Math.min(TURN_MAX, S.rate * TURN_K);
    m *= 1 + S.bloom;
    m *= 1 - SETTLE_GAIN * Math.min(1, S.still / SETTLE_T);
    if (u.tankType === 'ARTILLERY' && !u.isDeployed) m *= 1.8;   // chưa hạ chân chống: cả xe giật nảy theo phát bắn
    const d = u.dmg;
    if (d && d.lost && d.lost.has && d.lost.has('opticGunner')) m *= 1.7;   // vỡ kính ngắm pháo thủ: ngắm qua kính dự phòng
    if (d && d.gun) m *= 1.25;                                               // pháo / súng bị bắn trúng, cong lệch
    return m;
  }

  /**
   * σ hiện tại cho phát bắn tiếp theo: { lat, vert } (rad) và mv (tỉ lệ sơ tốc), lob = lựu pháo cầu vồng
   */
  function sigma(u, ammo, elevation, range) {
    const a = ammo !== undefined ? ammo : (u && u.selectedAmmo), el = elevation !== undefined ? elevation : (u && u.elevation);
    const P = profileFor(u, a, el);
    const m = multiplier(u);
    const r = rangeMul(u, a, P, range);
    if (P === ARTY_LOB) return { lat: P.defl * 1e-3 * m * r, vert: P.el * 1e-3 * m * r, mv: P.mv * m * r, lob: true, mul: m, rmul: r };
    const s = P.mil * SCALE * 1e-3 * m * r;
    return { lat: s, vert: s, mv: P.mv * m * r, lob: false, mul: m, rmul: r };
  }

  /** Hệ số kém chụm thêm theo cự ly bắn (1 ở sát nòng, 1 + grow ở tầm hiệu quả tối đa của loại đạn) */
  function rangeMul(u, ammo, P, range) {
    if (!(range > 0)) return 1;
    let grow = 0, ref = 0;
    if (P === ARTY_LOB) { grow = RANGE_GROW.ARTY_LOB; ref = typeof GameTiming !== 'undefined' ? GameTiming.round('HE', 'ARTILLERY').eff : 2700; }
    else if (P === PROFILE.ARTY_DIRECT) { grow = RANGE_GROW.ARTY_DIRECT; ref = typeof BallisticsSystem3D !== 'undefined' ? BallisticsSystem3D.ARTY_DIRECT.max : 800; }
    else if (P === PROFILE.TANK_AP || P === PROFILE.TANK_NORMAL || P === PROFILE.TANK_HE) { grow = RANGE_GROW.GUN; ref = typeof GameTiming !== 'undefined' ? GameTiming.round(ammo || 'NORMAL', u && u.tankType).eff : 1500; }
    if (!grow || !(ref > 0)) return 1;
    const k = Math.min(1.5, range / ref);
    return 1 + grow * k * k;
  }

  /**
   * Bán kính vùng trúng dự kiến (đơn vị game, ~2σ: 9/10 phát rơi trong vùng) ở cự ly dist — cho vòng ngắm trên HUD.
   * along: theo hướng bắn, cross: ngang.
   */
  function ring(u, dist, ammo, elevation) {
    const s = sigma(u, ammo, elevation, dist);
    const cross = 2 * s.lat * dist;
    // lựu pháo cầu vồng: tầm ~ v² -> lệch dọc ≈ 2·σv·cự ly
    const along = s.lob ? 2 * Math.hypot(2 * s.mv * dist, s.vert * dist) : cross;
    return { along, cross, mul: s.mul, rmul: s.rmul, lob: s.lob };
  }

  /**
   * Làm lệch vector vận tốc đầu nòng của một phát bắn (gọi trong fireShell3D, trước khi tạo viên đạn).
   * range: cự ly tới điểm rơi dự kiến (bắn càng xa càng kém chụm). Trả về { vx, vy, vz }. Cập nhật độ nở sau phát bắn.
   */
  function perturb(u, ammo, elevation, vx, vy, vz, stream, range) {
    if (!u) return { vx, vy, vz };
    const S = stateOf(u);
    const P = profileFor(u, ammo, elevation);
    const s = sigma(u, ammo, elevation, stream ? 0 : range);
    // hạt giống: đạn liên thanh = (mã xe, số loạt, viên thứ mấy) để mọi máy rải cùng chùm; pháo: đếm phát của xe
    // (vận tốc thật được gửi kèm phát bắn nên máy khác không cần tự tính lại)
    let seed;
    if (stream) {
      if ((u._beltIdx || 0) <= 1) S.burst++;
      // mã xe chung giữa các máy = số thứ tự trong đội hình trận (netId); chơi đơn dùng id
      const key = u.netId !== undefined ? 'n' + u.netId : u.id;
      seed = hashStr(key) ^ Math.imul(S.burst, 0x9E3779B1) ^ Math.imul(u._beltIdx || 0, 0x85EBCA77);
    } else {
      seed = hashStr(u.id) ^ Math.imul(++S.shots, 0xC2B2AE3D) ^ ((Math.random() * 4294967296) >>> 0);
    }
    const r = rng(seed >>> 0);
    const sp = Math.hypot(vx, vy, vz);
    if (sp < 1e-6) return { vx, vy, vz };
    let dx = vx / sp, dy = vy / sp, dz = vz / sp;
    // hệ trục quanh hướng bắn: phải (nằm ngang) và lên (vuông góc)
    let rx = -dz, rz = dx;
    const rl = Math.hypot(rx, rz) || 1;
    rx /= rl; rz /= rl;
    const ux = -rz * dy, uy = rz * dx - rx * dz, uz = rx * dy;
    const a = gauss(r) * s.lat, b = gauss(r) * s.vert;
    dx += rx * a + ux * b; dy += uy * b; dz += rz * a + uz * b;
    const dl = Math.hypot(dx, dy, dz) || 1;
    const nsp = sp * (1 + gauss(r) * s.mv);
    S.bloom = Math.min(P.bloomMax || 0, S.bloom + (P.bloom || 0));
    return { vx: dx / dl * nsp, vy: dy / dl * nsp, vz: dz / dl * nsp };
  }

  return { SCALE, PROFILE, ARTY_LOB, RANGE_GROW, track, sigma, ring, multiplier, perturb, profileFor, rangeMul };
})();

if (typeof window !== 'undefined') window.Dispersion = Dispersion;
if (typeof module !== 'undefined') module.exports = Dispersion;
