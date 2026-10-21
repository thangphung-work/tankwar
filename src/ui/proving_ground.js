/**
 * SÂN THỬ XE trong phòng xem xe (tank_inspector.js): lái thử / bắn thử trên nhiều kiểu địa hình.
 *
 * - 5 bãi: PHẲNG (trường bắn cũ) · ĐỒI DỐC · LỘI NƯỚC · SA MẠC · RỪNG & VẬT CẢN
 * - Mặt đất có độ cao + loại đất thật (cỏ, cát, bùn, sỏi, sườn đá, nước...) -> xe chạy đúng logic trong trận (spg.js):
 *   lún cát, ì bùn, leo dốc theo khả năng từng xe, lội nước (ngập sâu thì tụt máu dần), vệt xích, bụi.
 * - Vật thể rải rác dùng lại đúng lớp trong trận: cây (Destructibles.TreeField — húc đổ, bắn cháy),
 *   hàng rào / tường đá / bao cát / xác xe (Props.PropSet), đá tảng chắn xe & chắn đạn.
 * - Biển báo độ dốc / độ sâu nước để dễ đọc kết quả thử.
 * - Bệ trưng bày (tâm bãi) và tường thử bê tông luôn nằm trên khoảng đất phẳng ở giữa.
 *
 * Đơn vị: 8 đơn vị = 1 m. Mũi xe lúc mới vào nhìn về phía -z (tường thử ở z = -112).
 */
const ProvingGround = (() => {
  const PI = Math.PI;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const PAD_R = 165, PAD_BLEND = 215;   // vùng đất phẳng quanh bệ + tường thử; vật thể đặt ngoài PAD_BLEND
  const CELL = 6;                        // ô lưới mặt đất (đơn vị)

  // ---------------------------------------------------------------------------
  // NHIỄU & HÌNH KHỐI ĐỊA HÌNH
  // ---------------------------------------------------------------------------
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash2(ix, iz, s) {
    let h = (ix * 374761393 + iz * 668265263 + s * 2147483647) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function vnoise(x, z, s) {
    const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
    const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
    const a = hash2(ix, iz, s), b = hash2(ix + 1, iz, s), c = hash2(ix, iz + 1, s), d = hash2(ix + 1, iz + 1, s);
    return (a + (b - a) * ux) * (1 - uz) + (c + (d - c) * ux) * uz;
  }
  // nhiễu gợn [-1, 1], bước sóng chính ~ wl đơn vị
  function fbm(x, z, wl, s) {
    return (vnoise(x / wl, z / wl, s) * 0.6 + vnoise(x / (wl * 0.42), z / (wl * 0.42), s + 7) * 0.3 + vnoise(x / (wl * 0.17), z / (wl * 0.17), s + 13) * 0.1) * 2 - 1;
  }
  function segDist(px, pz, ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz;
    const t = L > 0 ? clamp(((px - ax) * dx + (pz - az) * dz) / L, 0, 1) : 0;
    return { d: Math.hypot(px - (ax + dx * t), pz - (az + dz * t)), t };
  }
  // gò tròn: cao h ở tâm, thoải dần về 0 ở bán kính r (dốc lớn nhất ~ h·π / 2r)
  function bump(x, z, cx, cz, r, h) {
    const d = Math.hypot(x - cx, z - cz);
    if (d >= r) return 0;
    const c = Math.cos(d / r * PI / 2);
    return h * c * c;
  }
  // sống đồi / hào dọc đoạn thẳng a-b, nửa bề ngang w (h âm = hào)
  function ridge(x, z, ax, az, bx, bz, w, h) {
    const d = segDist(x, z, ax, az, bx, bz).d;
    if (d >= w) return 0;
    const c = Math.cos(d / w * PI / 2);
    return h * c * c;
  }
  // đồi cát lưỡi liềm: elip dài theo hướng gió (ang), sườn khuất gió dốc hơn sườn đón gió
  function dune(x, z, cx, cz, len, wid, h, ang) {
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const dx = x - cx, dz = z - cz;
    let u = (dx * ca + dz * sa) / len, v = (-dx * sa + dz * ca) / wid;
    if (u > 0) u *= 1.9;   // sườn khuất gió
    v += 0.35 * u * u;     // cong hình lưỡi liềm
    const d = Math.hypot(u, v);
    if (d >= 1) return 0;
    const c = Math.cos(d * PI / 2);
    return h * c * c;
  }
  // dốc thử thẳng (lên -> mặt bằng -> xuống) chạy theo +z từ z0, bề ngang w, độ dốc grade (tan), cao rise
  function ramp(x, z, cx, z0, w, grade, rise, top) {
    const ax = Math.abs(x - cx), edge = 12;
    if (ax > w / 2 + edge) return 0;
    const side = ax <= w / 2 ? 1 : smooth(0, 1, 1 - (ax - w / 2) / edge);
    const L = rise / grade, u = z - z0;
    let h;
    if (u <= 0) return 0;
    if (u < L) h = u * grade;
    else if (u < L + top) h = rise;
    else if (u < 2 * L + top) h = rise - (u - L - top) * grade;
    else return 0;
    return h * side;
  }
  const deg = (tan) => Math.round(Math.atan(tan) * 180 / PI);

  // ---------------------------------------------------------------------------
  // LOẠI MẶT ĐẤT (thông số như terrain.js trong trận + màu vẽ)
  // ---------------------------------------------------------------------------
  const SURF = {
    PAD: { type: 'GRASS', speedMult: 1, bumpiness: 0.35, dustMult: 0.5, sinkY: 0, engineLoad: 1, name: 'BÃI THỬ (ĐẤT NỆN)', col: [0.27, 0.24, 0.19] },
    GRASS: { type: 'GRASS', speedMult: 0.95, bumpiness: 0.4, dustMult: 0.4, sinkY: -0.3, engineLoad: 1.0, name: 'BÃI CỎ VEN SÔNG', col: [0.27, 0.33, 0.16] },
    HIGHLAND: { type: 'GRASS', speedMult: 0.92, bumpiness: 0.6, dustMult: 0.55, sinkY: -0.2, engineLoad: 1.05, name: 'ĐỒNG CỎ ĐỒI NÚI', col: [0.36, 0.38, 0.2] },
    MOUNTAIN: { type: 'MOUNTAIN', speedMult: 0.5, bumpiness: 1.4, dustMult: 0.8, sinkY: 0, engineLoad: 0.95, name: 'SƯỜN DỐC ĐÁ', col: [0.42, 0.4, 0.36] },
    SAND: { type: 'SAND', speedMult: 0.86, bumpiness: 0.5, dustMult: 1.0, sinkY: -0.8, engineLoad: 1.18, name: 'CÁT SA MẠC (LÚN, BỤI MÙ)', col: [0.74, 0.6, 0.4] },
    JUNGLE: { type: 'JUNGLE_SOIL', speedMult: 0.88, bumpiness: 0.55, dustMult: 0.2, sinkY: -0.5, engineLoad: 1.1, name: 'ĐẤT MÙN RỪNG (RỄ CÂY, GỒ GHỀ)', col: [0.25, 0.22, 0.13] },
    MUD: { type: 'JUNGLE_SOIL', speedMult: 0.78, bumpiness: 0.65, dustMult: 0.1, sinkY: -0.7, engineLoad: 1.25, name: 'BÃI BÙN NHÃO (LÚN XÍCH)', col: [0.2, 0.16, 0.11] },
    dirt: { type: 'ROAD', speedMult: 1.08, bumpiness: 0.42, dustMult: 0.9, sinkY: -0.1, engineLoad: 0.92, name: 'ĐƯỜNG ĐẤT (LÚN VỆT BÁNH, Ổ GÀ)', col: [0.5, 0.4, 0.28] },
    gravel: { type: 'ROAD', speedMult: 1.05, bumpiness: 0.55, dustMult: 0.7, sinkY: 0, engineLoad: 0.95, name: 'ĐƯỜNG SỎI ĐÁ GỒ GHỀ', col: [0.47, 0.45, 0.41] },
    mud: { type: 'ROAD', speedMult: 0.94, bumpiness: 0.6, dustMult: 0.15, sinkY: -0.5, engineLoad: 1.15, name: 'ĐƯỜNG BÙN NHÃO', col: [0.3, 0.24, 0.17] },
    asphalt: { type: 'URBAN_ROAD', speedMult: 1.15, bumpiness: 0.12, dustMult: 0.25, sinkY: 0, engineLoad: 0.85, name: 'ĐƯỜNG NHỰA', col: [0.17, 0.17, 0.18] },
    URBAN: { type: 'ROAD', speedMult: 1.0, bumpiness: 0.3, dustMult: 0.6, sinkY: 0, engineLoad: 0.95, name: 'BÃI ĐẤT ĐÔ THỊ (GẠCH VỤN)', col: [0.37, 0.35, 0.32] }
  };

  // ---------------------------------------------------------------------------
  // CÁC BÃI THỬ
  // ---------------------------------------------------------------------------
  // Hàng bắn phía bắc (sau tường thử) để trống, cuối hàng có xác xe làm bia
  const inLane = (x, z) => Math.abs(x) < 75 && z < -150;
  const LANE_WRECKS = [
    { x: 8, z: -330, angle: 0.35, kind: 'tank', turretRot: 0.6 },
    { x: -26, z: -470, angle: -0.2, kind: 'truck', smoke: true }
  ];

  const PRESETS = {
    flat: {
      name: 'Phẳng', icon: 'target-arrow', mapType: 'HIGHLAND', R: 380, base: 'PAD', rings: true, flat: true,
      desc: 'Trường bắn phẳng như cũ: chỉ có tường thử'
    },

    hills: {
      name: 'Đồi dốc', icon: 'mountain', mapType: 'HIGHLAND', R: 560, base: 'HIGHLAND', seed: 11,
      desc: 'Dốc thử 3 cấp, gò thoải, đồi dốc, sống đồi, hào chống tăng, đá tảng',
      roads: [{ kind: 'gravel', width: 22, ring: 240 }],
      height(x, z) {
        let h = fbm(x, z, 140, 3) * 3;
        h += bump(x, z, 330, 40, 160, 38);                    // gò thoải phía đông
        h += bump(x, z, 260, -300, 95, 58);                   // đồi dốc đông bắc
        h += ridge(x, z, -300, -300, -330, 260, 75, 36);      // sống đồi phía tây
        h += ridge(x, z, -330, 345, -120, 385, 26, -13);      // hào chống tăng tây nam
        for (const r of this.ramps) h += ramp(x, z, r.x, r.z0, r.w, r.grade, r.rise, r.top);
        return h;
      },
      ramps: [
        { x: -10, z0: 262, w: 56, grade: 0.3, rise: 22, top: 26 },
        { x: 78, z0: 262, w: 56, grade: 0.6, rise: 22, top: 26 },
        { x: 166, z0: 262, w: 56, grade: 0.9, rise: 22, top: 26 }
      ],
      avoid(x, z) {
        if (this.ramps.some(r => Math.abs(x - r.x) < r.w / 2 + 22 && z > r.z0 - 20 && z < r.z0 + 2 * r.rise / r.grade + r.top + 20)) return true;
        return segDist(x, z, -330, 345, -120, 385).d < 40;
      },
      objects(rng, P) {
        const o = { rocks: [], trees: [], wrecks: [...LANE_WRECKS, { x: 360, z: 230, angle: 1.2, kind: 'apc', turretRot: 0.4 }], fences: [], sandbags: [], signs: [] };
        scatter(rng, P, 30, (x, z) => o.rocks.push({ x, z, r: 7 + rng() * 9, h: 6 + rng() * 10, rot: rng() * 6.28 }), 40);
        scatter(rng, P, 34, (x, z) => o.trees.push({ x, z, kind: rng() < 0.8 ? 'pine' : 'deadTree', s: 0.85 + rng() * 0.4, rot: rng() * 6.28 }), 26);
        for (const r of this.ramps) o.signs.push({ x: r.x - r.w / 2 - 14, z: r.z0 - 6, text: `DỐC ${deg(r.grade)}°`, sub: r.grade > 0.5 ? 'Pháo 6x6 không leo được' : 'Mọi xe leo được' });
        o.signs.push({ x: 330, z: 40 - 175, text: 'GÒ THOẢI ~20°' });
        o.signs.push({ x: 260 - 60, z: -300 + 110, text: 'ĐỒI DỐC ~44°', sub: 'Xe tăng sát giới hạn leo' });
        o.signs.push({ x: -230, z: 0, text: 'SỐNG ĐỒI ~37°' });
        o.signs.push({ x: -225, z: 300, text: 'HÀO CHỐNG TĂNG' });
        o.sandbags.push({ x0: -360, z0: 300, x1: -300, z1: 312, layers: 2 });
        return o;
      },
      surface(x, z, h, slope) { return slope > 0.42 ? 'MOUNTAIN' : 'HIGHLAND'; }
    },

    water: {
      name: 'Lội nước', icon: 'ripple', mapType: 'RIVER_LAKE', R: 560, base: 'GRASS', seed: 23, waterY: -1,
      desc: 'Sông cạn dần ra sâu (đo độ sâu lội), ao sâu, bãi bùn ven bờ',
      roads: [{ kind: 'dirt', width: 20, pts: [[0, 200], [0, 560]] }],
      riverZ(x) { return 340 + 26 * Math.sin(x / 140); },
      // đáy sông giữa dòng (âm): chỗ lội nông ở giữa, sâu dần sang hai bên
      bedDepth(x) { return 5 + 19 * smooth(40, 330, Math.abs(x)); },
      height(x, z) {
        let h = fbm(x, z, 120, 5) * 1.6;
        const d = Math.abs(z - this.riverZ(x));
        // bờ thoải xuống mép nước (-0.7), rồi lòng sông lõm xuống tới đáy giữa dòng
        if (d < 120) { const k = smooth(72, 120, d); h = h * k - 0.7 * (1 - k); }
        if (d < 72) { const c = Math.cos(d / 72 * PI / 2); h = h * (1 - c * c) - (this.bedDepth(x) - 0.3) * c * c; }
        // ao sâu tây bắc + bãi bùn quanh ao
        const dp = Math.hypot(x + 320, z + 250);
        if (dp < 120) { const c = Math.cos(dp / 120 * PI / 2); h = h * (1 - c * c) - 26 * c * c; }
        h += bump(x, z, 340, -60, 150, 20);                   // gò cao phía đông nhìn xuống sông
        return h;
      },
      avoid(x, z) { return Math.abs(z - this.riverZ(x)) < 95 || Math.hypot(x + 320, z + 250) < 140 || Math.abs(x) < 22 && z > 150; },
      objects(rng, P) {
        const o = { rocks: [], trees: [], wrecks: [...LANE_WRECKS, { x: 230, z: this.riverZ(230) + 6, angle: 1.4, kind: 'tank', turretRot: -0.8, tilt: 0.05 }], fences: [], sandbags: [], signs: [] };
        scatter(rng, P, 14, (x, z) => o.rocks.push({ x, z, r: 6 + rng() * 6, h: 5 + rng() * 6, rot: rng() * 6.28 }), 30);
        // cây ven sông & quanh ao
        for (let i = 0; i < 260 && o.trees.length < 46; i++) {
          const x = (rng() * 2 - 1) * P.R, side = rng() < 0.5 ? -1 : 1, z = this.riverZ(x) + side * (100 + rng() * 70);
          if (okSpot(P, x, z, 30) && !o.trees.some(t => Math.hypot(t.x - x, t.z - z) < 24)) o.trees.push({ x, z, kind: rng() < 0.45 ? 'willow' : rng() < 0.7 ? 'broadleaf' : 'cypress', s: 0.85 + rng() * 0.35, rot: rng() * 6.28 });
        }
        for (let k = 0; k < 14; k++) {
          const a = rng() * 6.28, r = 150 + rng() * 40, x = -320 + Math.cos(a) * r, z = -250 + Math.sin(a) * r;
          if (okSpot(P, x, z, 20)) o.trees.push({ x, z, kind: 'willow', s: 0.9 + rng() * 0.3, rot: rng() * 6.28 });
        }
        for (const x of [0, -150, 150, -290, 290]) {
          const m = Math.max(0, (-1 + this.bedDepth(x) - 0.3) / 8);   // mặt nước -1, đáy giữa dòng -(bedDepth - 0.3)
          o.signs.push({ x: x + 24, z: this.riverZ(x) - 112, text: `SÂU ~${m.toFixed(1)} m`, sub: x === 0 ? 'Chỗ lội nông' : null });
        }
        o.signs.push({ x: -320 + 50, z: -250 + 150, text: 'AO SÂU ~3 m' });
        return o;
      },
      surface(x, z, h) {
        const d = Math.abs(z - this.riverZ(x)), dp = Math.hypot(x + 320, z + 250);
        if ((d > 60 && d < 112) || (dp > 105 && dp < 150)) return 'MUD';
        return 'GRASS';
      }
    },

    desert: {
      name: 'Sa mạc', icon: 'sun', mapType: 'DESERT', R: 560, base: 'SAND', seed: 37, waterY: -1,
      desc: 'Đồi cát lún, đường đất, ốc đảo, xác xe, bao cát',
      roads: [{ kind: 'dirt', width: 22, ring: 250 }],
      dunes: [
        [300, 120, 120, 70, 22, 0.4], [-280, 180, 140, 80, 26, 0.5], [-330, -120, 110, 64, 18, 0.3], [180, 400, 130, 70, 24, 0.6],
        [-120, 420, 120, 66, 20, 0.45], [420, -120, 100, 60, 16, 0.2], [-430, 330, 100, 60, 18, 0.5], [230, -420, 90, 56, 14, 0.4]
      ],
      height(x, z) {
        let h = fbm(x, z, 90, 9) * 2 + Math.sin((x * 0.8 + z * 0.6) / 9) * 0.35;   // gợn cát
        for (const d of this.dunes) h += dune(x, z, d[0], d[1], d[2], d[3], d[4], d[5]);
        const dp = Math.hypot(x - 330, z + 270);   // ốc đảo
        if (dp < 64) { const c = Math.cos(dp / 64 * PI / 2); h = h * (1 - c) - 11 * c * c; }
        return h;
      },
      avoid(x, z) { return Math.hypot(x - 330, z + 270) < 72; },
      objects(rng, P) {
        const o = { rocks: [], trees: [], wrecks: [...LANE_WRECKS], fences: [], sandbags: [], signs: [] };
        for (const [x, z, a, kind] of [[-240, -300, 0.8, 'tank'], [380, 300, -0.6, 'truck'], [-60, 330, 2.1, 'apc'], [-420, 60, 1.0, 'tank']]) {
          o.wrecks.push({ x, z, angle: a, kind, turretRot: rng() * 2 - 1, smoke: rng() < 0.4, tilt: (rng() - 0.5) * 0.1 });
        }
        scatter(rng, P, 16, (x, z) => o.rocks.push({ x, z, r: 8 + rng() * 10, h: 6 + rng() * 10, rot: rng() * 6.28 }), 40);
        for (let k = 0; k < 11; k++) {
          const a = rng() * 6.28, r = 70 + rng() * 34, x = 330 + Math.cos(a) * r, z = -270 + Math.sin(a) * r;
          if (okSpot(P, x, z, 18)) o.trees.push({ x, z, kind: 'palm', s: 0.9 + rng() * 0.35, rot: rng() * 6.28 });
        }
        scatter(rng, P, 16, (x, z) => o.trees.push({ x, z, kind: rng() < 0.6 ? 'cactus' : 'acacia', s: 0.8 + rng() * 0.4, rot: rng() * 6.28 }), 24);
        // ụ bao cát: chốt chữ L
        for (const [x, z, a] of [[-200, -240, 0.3], [250, 200, -1.1], [-330, 240, 2.4], [120, -300, 0.9]]) {
          const ca = Math.cos(a), sa = Math.sin(a);
          o.sandbags.push({ x0: x - ca * 22, z0: z - sa * 22, x1: x + ca * 22, z1: z + sa * 22, layers: 3 });
          o.sandbags.push({ x0: x + ca * 22, z0: z + sa * 22, x1: x + ca * 22 - sa * 18, z1: z + sa * 22 + ca * 18, layers: 2 });
        }
        o.signs.push({ x: 330 - 82, z: -270 + 30, text: 'ỐC ĐẢO', sub: 'Nước sâu ~1.2 m' });
        o.signs.push({ x: 300 - 40, z: 120 - 95, text: 'ĐỒI CÁT' });
        return o;
      },
      surface() { return 'SAND'; }
    },

    forest: {
      name: 'Rừng & vật cản', icon: 'trees', mapType: 'JUNGLE', R: 560, base: 'JUNGLE', seed: 51,
      desc: 'Rừng rậm húc đổ được, hàng rào gỗ / tre / đá / đất / bờ cây, bao cát, xác xe, đường bùn',
      roads: [
        { kind: 'mud', width: 22, pts: [[200, 10], [330, 30], [450, 80], [560, 90]] },
        { kind: 'mud', width: 22, pts: [[-10, 205], [-30, 330], [-80, 450], [-90, 560]] }
      ],
      height(x, z) { return fbm(x, z, 110, 17) * 5 + bump(x, z, -150, -380, 120, 16); },
      avoid(x, z) { return false; },
      objects(rng, P) {
        const o = { rocks: [], trees: [], wrecks: [...LANE_WRECKS], fences: [], sandbags: [], signs: [] };
        const stand = (cx, cz, r, n, kinds) => {
          for (let i = 0; i < n * 8 && n > 0; i++) {
            const a = rng() * 6.28, d = Math.sqrt(rng()) * r, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
            if (!okSpot(P, x, z, 18) || o.trees.some(t => Math.hypot(t.x - x, t.z - z) < 15)) continue;
            o.trees.push({ x, z, kind: kinds[Math.floor(rng() * kinds.length)], s: 0.8 + rng() * 0.45, rot: rng() * 6.28 });
            n--;
          }
        };
        stand(-350, -20, 170, 95, ['jungle', 'jungle', 'broadleaf', 'palm']);   // rừng rậm phía tây
        stand(300, -300, 130, 50, ['jungle', 'broadleaf', 'jungle']);           // rừng đông bắc
        stand(-330, -400, 90, 18, ['palm', 'broadleaf']);
        // làng: sân rào gỗ (chừa cổng), rào tre, tường đá, tường đất, bờ rào cây
        const F = (kind, pts) => { for (let i = 0; i < pts.length - 1; i++) o.fences.push({ x0: pts[i][0], z0: pts[i][1], x1: pts[i + 1][0], z1: pts[i + 1][1], kind }); };
        F('wood', [[150, 300], [270, 300], [270, 420], [150, 420], [150, 380]]);
        F('bamboo', [[310, 250], [420, 330]]);
        F('stone', [[60, 470], [220, 500]]);
        F('mud', [[300, 450], [400, 380]]);
        F('hedge', [[-250, 300], [-150, 340], [-130, 420]]);
        o.sandbags.push({ x0: 150, z0: 250, x1: 230, z1: 250, layers: 2 }, { x0: -200, z0: 230, x1: -140, z1: 260, layers: 3 });
        for (const [x, z, a, kind] of [[380, 180, 0.5, 'apc'], [-180, 470, 1.9, 'tank'], [100, -260, -0.4, 'truck']]) o.wrecks.push({ x, z, angle: a, kind, turretRot: rng() * 2 - 1, smoke: rng() < 0.3 });
        scatter(rng, P, 12, (x, z) => o.rocks.push({ x, z, r: 6 + rng() * 7, h: 5 + rng() * 8, rot: rng() * 6.28 }), 30);
        o.signs.push({ x: 150 - 20, z: 300 - 26, text: 'RÀO GỖ', sub: 'Húc đổ / bắn đổ' });
        o.signs.push({ x: 60 - 16, z: 470 - 22, text: 'TƯỜNG ĐÁ' });
        o.signs.push({ x: -250 - 6, z: 300 - 30, text: 'BỜ RÀO CÂY' });
        o.signs.push({ x: -190, z: -60, text: 'RỪNG RẬM', sub: 'Xe húc đổ cây' });
        return o;
      },
      surface() { return 'JUNGLE'; }
    },

    // Nhà / boong-ke dùng đúng lớp trong trận (Destructibles.BuildingSet / BunkerSet): khoét lỗ, nứt, sập, đống đổ nát
    // xe bò lên được. Hai dãy nhà hai bên hàng bắn để bắn thẳng từ bệ; nút "Dựng lại" khôi phục mọi thứ đã phá.
    urban: {
      name: 'Đô thị', icon: 'building', mapType: 'URBAN', R: 560, base: 'URBAN', seed: 67,
      desc: 'Nhà phố, chung cư, văn phòng, nhà đổ nát, nhà kho, boong-ke — phá được như trong trận; bấm Dựng lại để khôi phục',
      roads: [
        { kind: 'asphalt', width: 26, ring: 250 },
        { kind: 'asphalt', width: 24, pts: [[0, -262], [0, -560]] },
        { kind: 'asphalt', width: 24, pts: [[262, 0], [560, 0]] },
        { kind: 'asphalt', width: 24, pts: [[-262, 0], [-560, 0]] }
      ],
      height(x, z) { return fbm(x, z, 120, 61) * 0.8; },
      avoid(x, z) { return false; },
      objects(rng, P) {
        const o = { rocks: [], trees: [], wrecks: [...LANE_WRECKS], fences: [], sandbags: [], signs: [], buildings: [], bunkers: [] };
        // mặt nhà quay về bệ xe (angle = góc xoay quanh trục đứng như map_gen)
        const B = (x, z, w, d, floors, kind) => o.buildings.push({ x, z, w, d, floors, kind, angle: -Math.atan2(x, z) });
        // dãy phố hai bên hàng bắn (bắn thẳng từ bệ)
        B(-140, -350, 56, 48, 3, 'shop');
        B(-140, -440, 34, 44, 3, 'tube');
        B(150, -360, 64, 54, 4, 'apartment');
        B(155, -465, 60, 50, 5, 'office');
        // quanh bãi: nhà đổ nát, nhà đá, nhà gạch đất, nhà ống, nhà kho
        B(340, 60, 56, 46, 2, 'ruin');
        B(345, 190, 36, 40, 2, 'tube');
        B(-345, 70, 52, 44, 2, 'farm');
        B(-350, -110, 44, 40, 1, 'stone');
        B(-330, 230, 46, 40, 1, 'mudbrick');
        B(0, 410, 84, 60, 1, 'hangar');
        B(390, -260, 58, 48, 3, 'ruin');
        // boong-ke bê tông quay cửa về bệ
        for (const [x, z] of [[240, 340], [-250, 350], [-390, -300]]) o.bunkers.push({ x, z, openAngle: Math.atan2(-z, -x) });
        // xác xe trên phố, bao cát chắn đường
        for (const [x, z, a, kind] of [[60, -300, 0.4, 'truck'], [300, -20, 1.6, 'apc'], [-300, -20, -1.4, 'tank'], [120, 330, 2.6, 'truck']]) {
          o.wrecks.push({ x, z, angle: a, kind, turretRot: rng() * 2 - 1, smoke: rng() < 0.35 });
        }
        o.sandbags.push({ x0: -95, z0: -300, x1: -95, z1: -250, layers: 3 }, { x0: 95, z0: -300, x1: 95, z1: -250, layers: 3 }, { x0: 250, z0: 270, x1: 300, z1: 300, layers: 2 });
        scatter(rng, P, 10, (x, z) => o.trees.push({ x, z, kind: rng() < 0.5 ? 'broadleaf' : 'deadTree', s: 0.8 + rng() * 0.35, rot: rng() * 6.28 }), 40);
        o.signs.push({ x: -100, z: -330, text: 'NHÀ PHỐ', sub: 'Bắn thủng tường, sập tầng' });
        o.signs.push({ x: 108, z: -335, text: 'CHUNG CƯ · VĂN PHÒNG' });
        o.signs.push({ x: 205, z: 300, text: 'BOONG-KE' });
        o.signs.push({ x: 40, z: 350, text: 'NHÀ KHO' });
        return o;
      },
      surface() { return 'URBAN'; }
    }
  };
  const ORDER = ['flat', 'hills', 'water', 'desert', 'forest', 'urban'];

  // Chỗ đặt vật thể hợp lệ: ngoài bãi phẳng giữa, trong vòng ụ đất, không trên hàng bắn / đường / chỗ cấm của bãi
  function okSpot(P, x, z, pad) {
    const r = Math.hypot(x, z);
    if (r < PAD_BLEND + pad * 0.5 || r > P.R - pad) return false;
    if (inLane(x, z)) return false;
    if (P.avoid && P.avoid(x, z)) return false;
    if (roadAt(P, x, z, pad * 0.6)) return false;
    return true;
  }
  function scatter(rng, P, n, put, pad) {
    const pts = [];
    for (let i = 0; i < n * 12 && pts.length < n; i++) {
      const a = rng() * PI * 2, r = PAD_BLEND + 30 + rng() * (P.R - PAD_BLEND - 50), x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!okSpot(P, x, z, pad) || pts.some(p => Math.hypot(p[0] - x, p[1] - z) < pad * 1.6)) continue;
      pts.push([x, z]);
      put(x, z);
    }
  }
  function roadAt(P, x, z, extra = 0) {
    for (const rd of P.roads || []) {
      const hw = rd.width / 2 + extra;
      if (rd.ring) { if (Math.abs(Math.hypot(x, z) - rd.ring) < hw) return rd; continue; }
      for (let i = 0; i < rd.pts.length - 1; i++) {
        const a = rd.pts[i], b = rd.pts[i + 1];
        if (segDist(x, z, a[0], a[1], b[0], b[1]).d < hw) return rd;
      }
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // HỌA TIẾT
  // ---------------------------------------------------------------------------
  let grainTex = null;
  function grain() {
    if (grainTex) return grainTex;
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d'), img = g.createImageData(256, 256);
    for (let i = 0; i < 256 * 256; i++) {
      const v = 214 + (Math.random() - 0.5) * 70;
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    grainTex = new THREE.CanvasTexture(c);
    grainTex.wrapS = grainTex.wrapT = THREE.RepeatWrapping;
    grainTex.repeat.set(90, 90);
    grainTex.anisotropy = 4;
    return grainTex;
  }
  function signTexture(text, sub) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 192;
    const g = c.getContext('2d');
    g.fillStyle = '#1b1f1a'; g.fillRect(0, 0, 512, 192);
    g.strokeStyle = '#e7a63a'; g.lineWidth = 10; g.strokeRect(5, 5, 502, 182);
    // sọc cảnh báo góc trái
    g.fillStyle = '#e7a63a';
    for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(14 + k * 22, 14); g.lineTo(26 + k * 22, 14); g.lineTo(14 + k * 22, 30); g.closePath(); g.fill(); }
    g.fillStyle = '#f3ead6'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `700 ${sub ? 64 : 72}px "Chakra Petch", "Segoe UI", sans-serif`;
    g.fillText(text, 256, sub ? 82 : 98, 470);
    if (sub) { g.fillStyle = '#e7a63a'; g.font = '600 34px "Chakra Petch", "Segoe UI", sans-serif'; g.fillText(sub, 256, 146, 470); }
    const t = new THREE.CanvasTexture(c);
    t.anisotropy = 4;
    return t;
  }

  // ---------------------------------------------------------------------------
  // SÂN THỬ
  // ---------------------------------------------------------------------------
  class Field {
    constructor(scene) {
      this.scene = scene;
      this.root = new THREE.Group();
      this.root.name = 'proving-ground';
      scene.add(this.root);
      this.id = null;
      this.boulders = [];     // đá tảng + xác xe: { x, z, radius, height } — chắn xe & chắn đạn
      this.own = [];          // geometry / material / texture do sân tự tạo (giải phóng khi đổi bãi)
    }

    get preset() { return PRESETS[this.id] || PRESETS.flat; }
    get R() { return this.preset.R; }
    get mapType() { return this.preset.mapType; }

    build(id) {
      if (!PRESETS[id]) id = 'flat';
      this.clear();
      this.id = id;
      const P = this.preset;
      const rng = mulberry32((P.seed || 1) * 7919 + 1);
      this.buildHeights(P);
      this.buildGround(P);
      if (P.waterY !== undefined) this.buildWater(P);
      if (P.rings) this.buildRings();
      this.buildBerm(P);
      if (P.objects) {
        const o = P.objects(rng, P);
        this.buildRocks(o.rocks || [], rng);
        this.buildTrees(o.trees || []);
        this.buildProps(o);
        this.buildStructures(o, P);
        this.buildSigns(o.signs || []);
      }
      this.root.updateMatrixWorld(true);
    }

    clear() {
      // nhà / boong-ke tự tạo hình khối & vật liệu riêng: giải phóng như terrain.clearTerrain (dựng lại nhiều lần không rò bộ nhớ)
      for (const S of [this.buildingSet, this.bunkerSet]) {
        if (!S || !S.group) continue;
        S.group.traverse(o => {
          if (o.geometry) o.geometry.dispose();
          if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose());
        });
      }
      while (this.root.children.length) this.root.remove(this.root.children[0]);
      for (const r of this.own) { try { r.dispose(); } catch (e) { /* bỏ qua */ } }
      this.own = [];
      this.boulders = [];
      this.trees = null;
      this.props = null;
      this.buildingSet = this.bunkerSet = null;
      this.H = null;
    }

    dispose() {
      this.clear();
      if (this.root.parent) this.root.parent.remove(this.root);
    }

    // ---- LƯỚI ĐỘ CAO (mặt đất vẽ và mặt đất xe chạy dùng chung một lưới -> bánh xe không lơ lửng / chìm)
    buildHeights(P) {
      const half = P.R + 110;
      const n = Math.ceil(half * 2 / CELL);
      this.half = n * CELL / 2;
      this.n = n;
      const N = n + 1, H = new Float32Array(N * N);
      for (let j = 0; j <= n; j++) {
        const z = -this.half + j * CELL;
        for (let i = 0; i <= n; i++) {
          const x = -this.half + i * CELL;
          H[j * N + i] = this.rawHeight(P, x, z);
        }
      }
      this.H = H;
    }
    rawHeight(P, x, z) {
      const r = Math.hypot(x, z);
      let h = 0;
      if (!P.flat && P.height) h = P.height(x, z) * smooth(PAD_R, PAD_BLEND, r);
      // ụ đất bao quanh bãi: chặn xe, hứng đạn bay quá tầm
      return h + 20 * smooth(P.R + 12, P.R + 70, r);
    }
    groundAt(x, z) {
      const H = this.H;
      if (!H) return 0;
      const n = this.n, N = n + 1;
      const gx = clamp((x + this.half) / CELL, 0, n - 1e-6), gz = clamp((z + this.half) / CELL, 0, n - 1e-6);
      const ix = Math.floor(gx), iz = Math.floor(gz), fx = gx - ix, fz = gz - iz;
      const i = iz * N + ix;
      // cùng cách chia tam giác như lưới vẽ (đường chéo b-c)
      if (fx + fz <= 1) return H[i] + (H[i + 1] - H[i]) * fx + (H[i + N] - H[i]) * fz;
      return H[i + N + 1] + (H[i + N] - H[i + N + 1]) * (1 - fx) + (H[i + 1] - H[i + N + 1]) * (1 - fz);
    }
    slopeAt(x, z) {
      const e = 8;
      return Math.hypot(this.groundAt(x + e, z) - this.groundAt(x - e, z), this.groundAt(x, z + e) - this.groundAt(x, z - e)) / (2 * e);
    }
    waterSurfaceAt(x, z) {
      const P = this.preset;
      if (P.waterY === undefined) return null;
      return this.groundAt(x, z) < P.waterY ? P.waterY : null;
    }
    surfaceKey(x, z) {
      const P = this.preset;
      const r = Math.hypot(x, z);
      if (r < PAD_R && !P.flat) return P.base;
      if (P.flat) return 'PAD';
      const rd = roadAt(P, x, z);
      if (rd) return rd.kind;
      const h = this.H ? this.groundAt(x, z) : 0, s = this.H ? this.slopeAt(x, z) : 0;
      if (r > P.R + 10) return 'MOUNTAIN';
      return P.surface ? P.surface(x, z, h, s) : P.base;
    }
    infoAt(x, z) {
      const elevation = this.groundAt(x, z);
      const ws = this.waterSurfaceAt(x, z);
      if (ws !== null && ws - elevation > 0.8) {
        const deep = ws - elevation > 6;
        return { type: 'WATER', speedMult: deep ? 0.4 : 0.6, elevation, friction: 0.7, bumpiness: 0.25, dustMult: 0.1, sinkY: deep ? -3 : -1.8, engineLoad: 1.6, name: deep ? 'LỘI NƯỚC SÂU (CHẬM, NGẬP XÍCH)' : 'LỘI NƯỚC NÔNG' };
      }
      const S = SURF[this.surfaceKey(x, z)] || SURF.PAD;
      return { type: S.type, speedMult: S.speedMult, elevation, friction: S.type === 'ROAD' || S.type === 'URBAN_ROAD' ? 0.95 : 0.88, bumpiness: S.bumpiness, dustMult: S.dustMult, sinkY: S.sinkY, engineLoad: S.engineLoad, name: S.name };
    }

    // ---- MẶT ĐẤT: lưới vuông, chỉ dựng các ô nằm trong vòng tròn (mép bãi tròn), màu theo loại đất + nhiễu + độ dốc
    buildGround(P) {
      const n = this.n, N = n + 1, half = this.half, H = this.H;
      const pos = new Float32Array(N * N * 3), col = new Float32Array(N * N * 3), uv = new Float32Array(N * N * 2);
      const waterY = P.waterY;
      for (let j = 0; j <= n; j++) {
        for (let i = 0; i <= n; i++) {
          const k = j * N + i, x = -half + i * CELL, z = -half + j * CELL, y = H[k];
          pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
          uv[k * 2] = i / n; uv[k * 2 + 1] = j / n;
          const key = this.surfaceKey(x, z);
          const S = SURF[key] || SURF.PAD;
          let c = S.col.slice();
          const nz = fbm(x, z, 60, 99) * 0.5 + 0.5, nz2 = vnoise(x / 9, z / 9, 41);
          let k1 = 0.84 + nz * 0.22 + (nz2 - 0.5) * 0.08;
          // cỏ loang lổ đất trần
          if (key === 'HIGHLAND' || key === 'GRASS') { const t = smooth(0.1, 0.5, fbm(x, z, 45, 77)) * 0.6; c = [c[0] * (1 + 0.22 * t), c[1] * (1 + 0.04 * t), c[2] * (1 + 0.14 * t)]; }
          // sườn dốc: lộ đá
          const s = this.slopeAt(x, z);
          if (key !== 'MOUNTAIN' && s > 0.3 && !P.flat) { const t = smooth(0.3, 0.6, s) * (key === 'SAND' ? 0.25 : 0.6); c = c.map((v, q) => v * (1 - t) + SURF.MOUNTAIN.col[q] * t); }
          // dưới nước: ướt sẫm dần theo độ sâu; mép nước ướt
          if (waterY !== undefined && y < waterY + 1.5) { const t = clamp((waterY + 1.5 - y) / 10, 0, 1); k1 *= 1 - 0.45 * t; c = [c[0] * (1 - 0.25 * t), c[1] * (1 - 0.15 * t), c[2] * (1 - 0.05 * t)]; }
          if (P.flat) k1 = 0.92 + (nz2 - 0.5) * 0.1;
          col[k * 3] = c[0] * k1; col[k * 3 + 1] = c[1] * k1; col[k * 3 + 2] = c[2] * k1;
        }
      }
      const idx = [];
      const lim = P.R + 105;
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          const x = -half + (i + 0.5) * CELL, z = -half + (j + 0.5) * CELL;
          if (x * x + z * z > lim * lim) continue;
          const a = j * N + i, b = a + 1, c = a + N, d = c + 1;
          idx.push(a, c, b, b, c, d);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      const tex = grain();
      tex.repeat.set(n / 3, n / 3);
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: tex, roughness: 1, metalness: 0 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.receiveShadow = true;
      mesh.position.y = -0.04;
      mesh.name = 'pg-ground';
      this.root.add(mesh);
      this.ground = mesh;
      this.own.push(geo, mat);
    }

    buildWater(P) {
      const geo = new THREE.CircleGeometry(P.R + 100, 96);
      geo.rotateX(-PI / 2);
      const mat = new THREE.MeshStandardMaterial({ color: 0x2f5a5e, transparent: true, opacity: 0.78, roughness: 0.12, metalness: 0.25, depthWrite: false });
      const m = new THREE.Mesh(geo, mat);
      m.position.y = P.waterY;
      m.renderOrder = 2;
      this.root.add(m);
      this.own.push(geo, mat);
    }

    // vạch cự ly mờ (bãi phẳng) để ước lượng khoảng cách nổ
    buildRings() {
      for (const r of [100, 200, 300]) {
        const geo = new THREE.RingGeometry(r - 0.6, r + 0.6, 96);
        const mat = new THREE.MeshBasicMaterial({ color: 0x6b5e45, transparent: true, opacity: 0.45, depthWrite: false });
        const ring = new THREE.Mesh(geo, mat);
        ring.rotation.x = -PI / 2;
        ring.position.y = 0.02;
        this.root.add(ring);
        this.own.push(geo, mat);
      }
    }

    // ụ đất bao quanh: không cần mesh riêng (nằm trong lưới mặt đất) — chỉ ghi chú vào biên va chạm
    buildBerm() { /* xem rawHeight + collide */ }

    buildRocks(list, rng) {
      if (!list.length) return;
      let map = null;
      try { if (typeof BattleTerrain3D !== 'undefined') map = BattleTerrain3D.prototype.rockTexture.call({ mapType: this.mapType }); } catch (e) { map = null; }
      const mat = new THREE.MeshStandardMaterial({ map, color: map ? 0xffffff : 0x77726a, roughness: 0.93, metalness: 0.02, flatShading: true });
      this.own.push(mat);
      const variants = [0, 1, 2].map(v => {
        const g0 = new THREE.IcosahedronGeometry(1, 1), g = g0.index ? g0.toNonIndexed() : g0;
        const p = g.attributes.position, seed = v * 13.7 + 1;
        for (let i = 0; i < p.count; i++) {
          const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
          const k = 1 + Math.sin(x * 3.1 + seed) * 0.18 + Math.sin(y * 4.3 + z * 2.2 + seed) * 0.14 + Math.sin(z * 5.7 - x * 1.3) * 0.1;
          p.setXYZ(i, x * k, Math.max(-0.35, y * k * 0.8), z * k);
        }
        g.computeVertexNormals();
        this.own.push(g);
        const im = new THREE.InstancedMesh(g, mat, list.length);
        im.count = 0; im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false;
        im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(list.length * 3).fill(1), 3);
        this.root.add(im);
        return im;
      });
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
      list.forEach((r, i) => {
        const im = variants[i % 3];
        // đặt theo chỗ thấp nhất dưới chân đá (trên sườn dốc không lơ lửng)
        let y = Infinity;
        for (let a = 0; a < 6.28; a += 1.05) y = Math.min(y, this.groundAt(r.x + Math.cos(a) * r.r * 0.7, r.z + Math.sin(a) * r.r * 0.7));
        y = Math.min(y, this.groundAt(r.x, r.z));
        e.set((rng() - 0.5) * 0.4, r.rot, (rng() - 0.5) * 0.4);
        m4.compose(new THREE.Vector3(r.x, y + r.h * 0.12, r.z), q.setFromEuler(e), new THREE.Vector3(r.r, r.h * 0.9, r.r * (0.75 + rng() * 0.4)));
        const k = im.count++;
        im.setMatrixAt(k, m4);
        im.setColorAt(k, new THREE.Color(1, 1, 1).multiplyScalar(0.74 + rng() * 0.26));
        this.boulders.push({ x: r.x, z: r.z, radius: r.r * 0.9, height: r.h * 0.8 + (y - this.groundAt(r.x, r.z)), rock: true });
      });
      variants.forEach(im => { im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; });
    }

    buildTrees(list) {
      if (!list.length || typeof Destructibles === 'undefined' || !Destructibles.TreeField) return;
      try {
        this.trees = new Destructibles.TreeField(this.root, list, (x, z) => this.groundAt(x, z));
      } catch (e) { console.warn('[Sân thử] Không dựng được cây', e); this.trees = null; }
    }

    // hàng rào / bao cát / xác xe: đúng lớp PropSet trong trận (cần nhóm cha, mặt đất, danh sách đá tảng)
    buildProps(o) {
      if (typeof Props === 'undefined' || !Props.PropSet) return;
      const data = { fences: o.fences || [], sandbags: o.sandbags || [], wrecks: (o.wrecks || []).map(w => Object.assign({ tilt: 0, roll: 0, turretRot: 0 }, w)), fields: [] };
      if (!data.fences.length && !data.sandbags.length && !data.wrecks.length) return;
      const T = { group: this.root, groundAtRaw: (x, z) => this.groundAt(x, z), surfaceAt: (x, z) => this.groundAt(x, z), boulders: this.boulders };
      try { this.props = new Props.PropSet(T, data); } catch (e) { console.warn('[Sân thử] Không dựng được hàng rào / xác xe', e); this.props = null; }
    }

    // nhà / boong-ke: đúng lớp trong trận, cùng hạt giống mỗi lần dựng (dựng lại ra y hệt)
    buildStructures(o, P) {
      if (typeof Destructibles === 'undefined') return;
      const ground = (x, z) => this.groundAt(x, z);
      Destructibles.withSeed(((P.seed || 1) * 104729) >>> 0, () => {
        try {
          if ((o.buildings || []).length) this.buildingSet = new Destructibles.BuildingSet(this.root, o.buildings, ground);
        } catch (e) { console.warn('[Sân thử] Không dựng được nhà', e); this.buildingSet = null; }
        try {
          if ((o.bunkers || []).length) this.bunkerSet = new Destructibles.BunkerSet(this.root, o.bunkers, ground);
        } catch (e) { console.warn('[Sân thử] Không dựng được boong-ke', e); this.bunkerSet = null; }
      });
    }

    // hộp va chạm xe của nhà (như terrain.vehicleObstacles): nhà sập thì chỉ còn mảng tường góc đứng chặn
    structureBoxes(x, z, unit, out) {
      const S = this.buildingSet;
      if (!S) return out;
      const reach = typeof VehicleCollision !== 'undefined' && unit ? VehicleCollision.reach(unit) : 60;
      for (const R of S.items) {
        const m = R.halfW + R.halfD + reach + 10;
        if (Math.abs(x - R.x) > m || Math.abs(z - R.z) > m) continue;
        if (R.collapsed) { if (R.rubbleWalls) for (const w of R.rubbleWalls) out.push(w); continue; }
        const box = R._pgBox || (R._pgBox = { cx: R.x, cz: R.z, ux: Math.cos(R.angle), uz: -Math.sin(R.angle), hu: R.halfW, hv: R.halfD, y0: 0, y1: 0 });
        box.y0 = (R.y || 0) - 20;
        box.y1 = (R.y || 0) + ((R.entry && R.entry.height) || 60);
        out.push(box);
      }
      return out;
    }
    // đống nhà sập / gốc tường boong-ke cho xích bò lên (như terrain.vehicleDebris)
    structureDebris(x, z, unit, out) {
      const r = 40 + Math.min(20, Math.abs((unit && unit.speed) || 0) * 0.1);
      if (this.buildingSet && this.buildingSet.vehicleDebris) this.buildingSet.vehicleDebris(x, z, r, out);
      if (this.bunkerSet && this.bunkerSet.S && typeof VehicleCollision !== 'undefined') VehicleCollision.blockDebris(this.bunkerSet.S, 0, x, z, r, out);
      return out;
    }

    buildSigns(list) {
      if (!list.length) return;
      const postGeo = new THREE.CylinderGeometry(0.45, 0.55, 12, 6);
      const boardGeo = new THREE.PlaneGeometry(24, 9);
      const postMat = new THREE.MeshStandardMaterial({ color: 0x4a4337, roughness: 0.9 });
      this.own.push(postGeo, boardGeo, postMat);
      for (const s of list) {
        const g = new THREE.Group();
        const y = this.groundAt(s.x, s.z);
        g.position.set(s.x, y, s.z);
        for (const dx of [-9, 9]) { const p = new THREE.Mesh(postGeo, postMat); p.position.set(dx, 6, 0); p.castShadow = true; g.add(p); }
        const tex = signTexture(s.text, s.sub);
        const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, side: THREE.DoubleSide });
        this.own.push(tex, mat);
        const b = new THREE.Mesh(boardGeo, mat);
        b.position.y = 13.5; b.castShadow = true;
        g.add(b);
        g.lookAt(0, y, 0);   // mặt biển quay về bệ xe
        this.root.add(g);
      }
    }

    // ---- TƯƠNG TÁC
    // Xe chạy: biên tròn của bãi + đá tảng / xác xe (đẩy ra ngoài vòng va chạm)
    collide(x0, z0, x1, z1, r) {
      let x = x1, z = z1, hit = false;
      const R = this.R, d = Math.hypot(x, z);
      if (d > R) { x *= R / d; z *= R / d; hit = true; }
      for (const b of this.boulders) {
        const dx = x - b.x, dz = z - b.z, m = b.radius + r * 0.8;
        if (Math.abs(dx) > m || Math.abs(dz) > m) continue;
        const dd = Math.hypot(dx, dz);
        if (dd < m && dd > 0.001) { x = b.x + dx * m / dd; z = b.z + dz * m / dd; hit = true; }
      }
      return { x, z, hit };
    }
    // Xe húc đổ cây / hàng rào, cán bẹp bao cát (như terrain.crushVegetation trong trận)
    crush(x, z, radius, vx, vz, fx) {
      if (this.trees) this.trees.crush(x, z, radius, vx, vz, fx);
      if (this.props && Math.hypot(vx, vz) >= 6) this.props.crush(x, z, radius, vx, vz, fx);
    }
    // Sóng nổ / đạn: cây rung / đổ / cháy, rào đổ, nhà thủng / sập, boong-ke vỡ (info như terrain.damageAt)
    damageAt(x, y, z, ammo, heavy, fx, info) {
      if (this.trees) this.trees.damageAt(x, y, z, ammo, heavy, fx);
      if (this.props) this.props.damageAt(x, y, z, ammo, heavy, fx);
      if (this.buildingSet) this.buildingSet.damageAt(x, y, z, ammo, heavy, fx, null, info || {});
      if (this.bunkerSet) this.bunkerSet.damageAt(x, y, z, ammo, heavy, fx);
    }
    // Đạn bay qua tán cây: lá rụng, cây rung
    passSegment(a, b, ammo, fx) {
      if (this.trees) this.trees.passSegment(a.x, a.y, a.z, b.x, b.y, b.z, ammo, fx);
    }
    // cam: vị trí camera; focus: xe đang lái (nhà che xe thì cắt mái / tường như trong trận)
    update(dt, fx, cam, focus) {
      if (this.trees) this.trees.update(dt, fx);
      if (this.props) this.props.update(dt, fx, cam || null);
      if (this.buildingSet) {
        this.buildingSet.update(dt, fx);
        if (cam && focus && this.buildingSet.setView) this.buildingSet.setView(cam, focus, dt);
      }
    }

    /**
     * Đường đạn đi từ a tới b (THREE.Vector3) chạm gì đầu tiên: thân cây, đá / xác xe, bao cát, mặt nước, mặt đất.
     * Trả về { point, normal, hitType } hoặc null.
     */
    segmentHit(a, b) {
      let best = null, bt = Infinity;
      const take = (t, hitType, normal, extra) => { if (t >= 0 && t <= 1 && t < bt) { bt = t; best = Object.assign({ t, hitType, normal }, extra || {}); } };
      // thân cây
      if (this.trees) {
        const h = this.trees.trunkHit(a.x, a.y, a.z, b.x, b.y, b.z);
        if (h) take(h.t, 'BOULDER', new THREE.Vector3(h.x - h.it.x, 0, h.z - h.it.z).normalize(), { tree: h.it });
      }
      // đá tảng / xác xe (trụ đứng)
      for (const r of this.boulders) {
        const minX = Math.min(a.x, b.x) - r.radius, maxX = Math.max(a.x, b.x) + r.radius;
        const minZ = Math.min(a.z, b.z) - r.radius, maxZ = Math.max(a.z, b.z) + r.radius;
        if (r.x < minX || r.x > maxX || r.z < minZ || r.z > maxZ) continue;
        const dx = b.x - a.x, dz = b.z - a.z, fx = a.x - r.x, fz = a.z - r.z;
        const qa = dx * dx + dz * dz, qb = 2 * (fx * dx + fz * dz), qc = fx * fx + fz * fz - r.radius * r.radius;
        let t;
        if (qc <= 0) t = 0;
        else {
          if (qa < 1e-9) continue;
          const disc = qb * qb - 4 * qa * qc;
          if (disc < 0) continue;
          t = (-qb - Math.sqrt(disc)) / (2 * qa);
        }
        if (t < 0 || t > 1) continue;
        const px = a.x + dx * t, pz = a.z + dz * t, py = a.y + (b.y - a.y) * t;
        const gy = this.groundAt(r.x, r.z);
        if (py > gy + r.height || py < gy - 2) continue;
        take(t, 'BOULDER', new THREE.Vector3(px - r.x, 0.3, pz - r.z).normalize());
      }
      // bao cát (kiểm tra điểm cuối đoạn — đoạn bay ngắn ~6 đơn vị)
      if (this.props && this.props.hitTest(b.x, b.y, b.z)) take(1, 'GROUND', new THREE.Vector3(a.x - b.x, 0, a.z - b.z).normalize(), { sandbag: true });
      // tường / sàn / mái nhà (pháp tuyến đúng mặt bị chạm)
      if (this.buildingSet) {
        const h = this.buildingSet.segmentHit(a.x, a.y, a.z, b.x, b.y, b.z);
        if (h) take(h.t, 'BUILDING', new THREE.Vector3(h.nx, h.ny, h.nz), { bn: { x: h.nx, y: h.ny, z: h.nz } });
      }
      // khối bê tông / mái boong-ke
      if (this.bunkerSet) {
        const h = this.bunkerSet.blocks(a.x, a.y, a.z, b.x, b.y, b.z);
        if (h) {
          const q = h.block;
          const t = q ? Destructibles.segCircleT(a.x, a.z, b.x, b.z, q.x, q.z, q.radius) : 1;
          take(t >= 0 ? t : 1, 'BUNKER', q ? new THREE.Vector3(a.x - q.x, 0.3, a.z - q.z).normalize() : new THREE.Vector3(0, 1, 0));
        }
      }
      // mặt nước
      const P = this.preset;
      if (P.waterY !== undefined && a.y > P.waterY && b.y <= P.waterY) {
        const t = (a.y - P.waterY) / (a.y - b.y);
        const px = a.x + (b.x - a.x) * t, pz = a.z + (b.z - a.z) * t;
        if (this.groundAt(px, pz) < P.waterY - 0.5) take(t, 'WATER', new THREE.Vector3(0, 1, 0));
      }
      // mặt đất
      const da = a.y - this.groundAt(a.x, a.z), db = b.y - this.groundAt(b.x, b.z);
      if (db <= 0) take(da > 0 ? da / (da - db) : 0, 'GROUND', null);
      if (!best) return null;
      const point = new THREE.Vector3().copy(a).lerp(b, best.t);
      if (best.hitType === 'GROUND') {
        point.y = this.groundAt(point.x, point.z);
        if (!best.normal) {
          const e = 3, gx = this.groundAt(point.x + e, point.z) - this.groundAt(point.x - e, point.z), gz = this.groundAt(point.x, point.z + e) - this.groundAt(point.x, point.z - e);
          best.normal = new THREE.Vector3(-gx, 2 * e, -gz).normalize();
        }
      }
      best.point = point;
      return best;
    }

    /**
     * Đối tượng "địa hình" cho spg.update() / ExplosionFX / Equipment (khói).
     * hooks: { boxes(x, z, unit), debris(x, z) } — vật cản thêm của phòng xem (tường thử).
     */
    makeTerrain(hooks) {
      const F = this;
      const VC = () => (typeof VehicleCollision !== 'undefined' ? VehicleCollision : null);
      const boxBuf = [], debrisBuf = [];
      const T = {
        get width() { return (F.R + 260) * 2; },
        get depth() { return (F.R + 260) * 2; },
        get mapType() { return F.mapType; },
        map: { roadAt: (x, z) => { const P = F.preset; const r = P.flat ? null : roadAt(P, x, z); return r ? { kind: r.kind, width: r.width } : null; } },
        getElevationAt: (x, z) => F.groundAt(x, z),
        getHeightAt: (x, z) => F.groundAt(x, z),
        groundAtRaw: (x, z) => F.groundAt(x, z),
        getTerrainInfoAt: (x, z) => F.infoAt(x, z),
        waterSurfaceAt: (x, z) => F.waterSurfaceAt(x, z),
        checkHorseshoeCollision: () => null,
        noCraterAt: (x, z) => Math.hypot(x, z) < 60,   // không khoét hố trên bệ trưng bày
        resolveVehicleCollision: (x0, z0, x1, z1, r, unit) => {
          const c = F.collide(x0, z0, x1, z1, r || 16);
          const boxes = unit ? T.vehicleObstacles(c.x, c.z, unit) : null;
          const V = VC();
          if (boxes && boxes.length && V) {
            const res = V.resolve(unit, x0, z0, c.x, c.z, boxes);
            return { x: res.x, z: res.z, hit: res.hit || c.hit };
          }
          return c;
        },
        // tường thử (hooks) + nhà của bãi
        vehicleObstacles: (x, z, unit) => {
          const own = hooks && hooks.boxes ? hooks.boxes(x, z, unit) : null;
          if (!F.buildingSet) return own;
          const out = boxBuf; out.length = 0;
          if (own) for (const b of own) out.push(b);
          return F.structureBoxes(x, z, unit, out);
        },
        vehicleDebris: (x, z, unit) => {
          const own = hooks && hooks.debris ? hooks.debris(x, z) : null;
          if (!F.buildingSet && !F.bunkerSet) return own;
          const out = debrisBuf; out.length = 0;
          if (own) for (const d of own) out.push(d);
          F.structureDebris(x, z, unit, out);
          return out.length ? out : null;
        },
        buildingSegmentHit: (x0, y0, z0, x1, y1, z1) => (F.buildingSet ? F.buildingSet.segmentHit(x0, y0, z0, x1, y1, z1) : null)
      };
      return T;
    }
  }

  return {
    Field,
    PRESETS,
    ORDER,
    list: () => ORDER.map(id => ({ id, name: PRESETS[id].name, icon: PRESETS[id].icon, desc: PRESETS[id].desc })),
    SURF
  };
})();

if (typeof window !== 'undefined') window.ProvingGround = ProvingGround;
