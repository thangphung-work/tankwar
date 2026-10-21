/**
 * BỘ SINH BẢN ĐỒ NGẪU NHIÊN THEO SEED (dữ liệu thuần, không phụ thuộc Three.js)
 * - Cùng (loại map, seed) -> cùng một bản đồ trên mọi máy (đồng bộ nhiều người chơi chỉ cần gửi seed)
 * - Chạy trước khi vào trận (trong lúc ghép trận) để khi vào là có ngay
 *
 * Kết quả: lưới độ cao + mặt phủ (đường / nước / bê tông), mạng đường A* bám địa hình (có ổ gà, gợn sóng),
 * sông hồ, vị trí boong-ke, nhà cửa, cây, bụi, đá, cầu và mặt trời theo giờ trong ngày.
 * Quy ước tọa độ giống game: bản đồ SIZE x SIZE (5400) tâm tại gốc, phe XANH ở z dương, phe ĐỎ ở z âm.
 */
const MapGen = (() => {
  const SIZE = 5400;
  const RES = 336;                 // số ô lưới mỗi cạnh (~16 đơn vị / ô)
  const HALF = SIZE / 2;
  const CELL = SIZE / RES;
  const OUTER_EXT = 12000;         // nửa cạnh vùng cảnh nền ngoài bản đồ (xem Backdrop); >= HALF + tầm nhìn camera (9000)
  // Bố cục gốc thiết kế cho bản đồ 3600: K giãn khoảng cách giữa các điểm chiến thuật, AREA nhân số lượng vật thể
  // (giữ mật độ cây / đá / làng như cũ); kích thước từng vật thể, đồi, đường... giữ nguyên
  const K = SIZE / 3600, AREA = K * K;
  const O0 = HALF - 1800;          // cảnh ngoài bản đồ (vành núi, bờ biển, đảo xa) dời ra theo mép bản đồ
  const RIM_WALL = 650;            // tường giữ xe vô hình nằm trên sườn vành núi: cách chân núi bấy nhiêu (spg.js)

  // Điểm chiến thuật cố định của luật chơi
  const CAPTURE = [{ x: -800 * K, z: 0 }, { x: 0, z: 0 }, { x: 800 * K, z: 0 }];
  const SPAWN = { blue: { z0: 800 * K, z1: 1180 * K }, red: { z0: -1180 * K, z1: -800 * K }, halfX: 430 * K };
  // Bố cục "3 cứ điểm trên 3 đồi" (hình tam giác): A, C mở cửa theo trục ngang (x), B mở theo trục dọc (z).
  // angle: hướng trục xuyên qua của khoang (cos -> x, sin -> z); hill: độ cao đỉnh đồi so với nền xung quanh
  const STRONGHOLD_SITES = [
    { id: 'A', x: -620 * K, z: 220 * K, angle: 0, hill: 72 },
    { id: 'B', x: 0, z: -340 * K, angle: Math.PI / 2, hill: 96 },
    { id: 'C', x: 620 * K, z: 220 * K, angle: Math.PI, hill: 58 }
  ];
  let layout = 'STRONGHOLDS';   // 'CLASSIC' | 'STRONGHOLDS' — trận thật dùng 3 cứ điểm bê tông trên 3 đồi

  // ---------------------------------------------------------------------------
  // NGẪU NHIÊN CÓ SEED + NHIỄU GRADIENT 2D
  // ---------------------------------------------------------------------------
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  function makeNoise(rng) {
    const perm = new Uint8Array(512);
    const p = [];
    for (let i = 0; i < 256; i++) p.push(i);
    for (let i = 255; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
    for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
    const GX = [1, -1, 1, -1, 1, -1, 0, 0, 0.7071, -0.7071, 0.7071, -0.7071];
    const GY = [1, 1, -1, -1, 0, 0, 1, -1, 0.7071, 0.7071, -0.7071, -0.7071];
    const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
    return function (x, y) {
      const X = Math.floor(x), Y = Math.floor(y);
      const xf = x - X, yf = y - Y;
      const xi = X & 255, yi = Y & 255;
      const g = (ix, iy, dx, dy) => { const h = perm[perm[ix] + iy] % 12; return GX[h] * dx + GY[h] * dy; };
      const n00 = g(xi, yi, xf, yf), n10 = g(xi + 1, yi, xf - 1, yf);
      const n01 = g(xi, yi + 1, xf, yf - 1), n11 = g(xi + 1, yi + 1, xf - 1, yf - 1);
      const u = fade(xf), v = fade(yf);
      const a = n00 + u * (n10 - n00), b = n01 + u * (n11 - n01);
      return (a + v * (b - a)) * 1.414;
    };
  }
  function fbm(n, x, y, oct = 5, lac = 2.03, gain = 0.5) {
    let s = 0, a = 1, f = 1, norm = 0;
    for (let i = 0; i < oct; i++) { s += a * n(x * f + i * 17.1, y * f - i * 9.7); norm += a; a *= gain; f *= lac; }
    return s / norm;
  }
  function ridged(n, x, y, oct = 5) {
    let s = 0, a = 1, f = 1, norm = 0, w = 1;
    for (let i = 0; i < oct; i++) {
      let v = 1 - Math.abs(n(x * f + i * 31.7, y * f + i * 5.3));
      v *= v * w;
      w = Math.min(1, v * 1.6);
      s += a * v; norm += a; a *= 0.5; f *= 2.0;
    }
    return s / norm;
  }
  const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;

  // ---------------------------------------------------------------------------
  // THAM SỐ TỪNG LOẠI CHIẾN ĐỊA
  // ---------------------------------------------------------------------------
  // Cảnh bao quanh bản đồ: peak = độ cao vành núi, sea = đảo giữa biển (bờ biển nằm ngoài vành núi),
  // far = cảnh xa (đảo / núi đá vôi giữa biển / núi bàn / các dãy núi)
  const OUTER = {
    DESERT: { peak: 240, sea: false, far: 'mesa' },
    URBAN: { peak: 300, sea: true, far: 'isle' },
    JUNGLE: { peak: 430, sea: true, far: 'karst' },
    HIGHLAND: { peak: 620, sea: false, far: 'range' },
    RIVER_LAKE: { peak: 340, sea: true, far: 'isle' }
  };
  const BIOME = {
    DESERT: { roadKind: 'dirt', bunkers: 7, trees: 150, rocks: 70, bushes: 14, villages: 3, treeKinds: ['palm', 'palm', 'cactus', 'deadTree', 'acacia'] },
    URBAN: { roadKind: 'asphalt', bunkers: 5, trees: 220, rocks: 18, bushes: 10, villages: 0, treeKinds: ['broadleaf', 'broadleaf', 'cypress'] },
    JUNGLE: { roadKind: 'mud', bunkers: 5, trees: 1700, rocks: 40, bushes: 30, villages: 2, treeKinds: ['jungle', 'jungle', 'palm', 'broadleaf', 'jungle'] },
    HIGHLAND: { roadKind: 'gravel', bunkers: 6, trees: 760, rocks: 140, bushes: 14, villages: 2, treeKinds: ['pine', 'pine', 'pine', 'deadTree'] },
    RIVER_LAKE: { roadKind: 'dirt', bunkers: 5, trees: 650, rocks: 36, bushes: 18, villages: 3, treeKinds: ['broadleaf', 'broadleaf', 'cypress', 'willow'] }
  };

  // ---------------------------------------------------------------------------
  // SINH BẢN ĐỒ
  // ---------------------------------------------------------------------------
  function generate(type, seed) {
    type = BIOME[type] ? type : 'DESERT';
    seed = (seed >>> 0) || 1;
    const B = BIOME[type];
    const SH = layout === 'STRONGHOLDS';
    const CAP = SH ? STRONGHOLD_SITES.map(c => ({ x: c.x, z: c.z })) : CAPTURE;
    const keyR = SH ? 345 : 110;   // bán kính cấm đặt cây / nhà / đá quanh cứ điểm
    const rng = mulberry32(seed ^ hashStr(type));
    const noise = makeNoise(rng);
    const noise2 = makeNoise(rng);
    const R = (a, b) => a + rng() * (b - a);
    const N = RES + 1;
    const heights = new Float32Array(N * N);
    const surface = new Uint8Array(N * N);   // 0 tự nhiên, 1 đường, 2 nước, 3 nền bê tông đô thị
    const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());

    // Căn cứ hai phe (vị trí xuất kích lệch ngẫu nhiên)
    const bases = {
      blue: { x: R(-260, 260) * K, z: R(960, 1060) * K },
      red: { x: R(-260, 260) * K, z: R(-1060, -960) * K }
    };
    const keyPts = CAP.concat([bases.blue, bases.red]);

    // Hệ số làm phẳng quanh điểm chiến thuật & khu xuất kích
    function flattenAt(x, z) {
      let k = 1;
      for (const c of CAP) k = Math.min(k, smooth(90, 260, Math.hypot(x - c.x, z - c.z)));
      const sx = Math.max(0, Math.abs(x) - SPAWN.halfX);
      for (const zc of [1000 * K, -1000 * K]) {
        const sz = Math.max(0, Math.abs(z - zc) - 190 * K);
        k = Math.min(k, smooth(40, 220, Math.hypot(sx, sz)));
      }
      return k;
    }

    // Tham số ngẫu nhiên theo map
    const windA = R(0, Math.PI);
    const cw = Math.cos(windA), sw = Math.sin(windA);
    const ox = R(-1000, 1000), oz = R(-1000, 1000);
    let river = null;

    // 1. ĐỘ CAO NỀN
    function baseHeight(x, z) {
      const wx = x + 180 * fbm(noise2, (x + ox) * 0.0007, (z + oz) * 0.0007, 3);
      const wz = z + 180 * fbm(noise2, (x - oz) * 0.0007 + 40, (z + ox) * 0.0007, 3);
      const fl = flattenAt(x, z);
      let h;
      if (type === 'DESERT') {
        const u = wx * cw + wz * sw, v = -wx * sw + wz * cw;
        const field = smooth(-0.15, 0.35, fbm(noise, (x + ox) * 0.00055, (z + oz) * 0.00055, 3));
        let dune = Math.max(0, 1 - Math.abs(noise(u * 0.0042, v * 0.0016)));
        dune = Math.pow(dune, 2.6) * 34 * field;
        let ripples = fbm(noise, u * 0.012, v * 0.004, 2) * 3;
        // ngoài bản đồ (cảnh nền, lưới thưa): cồn cát lớn thay cho cồn nhỏ / gợn (tránh lấy mẫu thưa thành hoa văn lặp)
        const dFar = smooth(2500 + O0, 3300 + O0, Math.hypot(x, z));
        if (dFar > 0) {
          const big = Math.pow(Math.max(0, 1 - Math.abs(noise(u * 0.0011 + 3.3, v * 0.00045))), 2.2) * 70 * (0.4 + 0.6 * field);
          dune = lerp(dune, big, dFar); ripples *= 1 - dFar;
        }
        const mesaN = fbm(noise2, (x - ox) * 0.0010, (z - oz) * 0.0010, 4);
        const mesa = smooth(0.30, 0.38, mesaN) * 42 + smooth(0.38, 0.6, mesaN) * 6;
        h = 6 + fbm(noise, wx * 0.0012, wz * 0.0012, 4) * 8 + dune + ripples;
        h = h * lerp(0.35, 1, fl) + mesa * fl;
      } else if (type === 'URBAN') {
        h = 4 + fbm(noise, wx * 0.0006, wz * 0.0006, 3) * 7;
        h = lerp(4, h, 0.5 + 0.5 * fl);
      } else if (type === 'JUNGLE') {
        h = 10 + fbm(noise, wx * 0.0011, wz * 0.0011, 5) * 26 + ridged(noise2, wx * 0.0008, wz * 0.0008, 3) * 14;
        h = lerp(9, h, 0.25 + 0.75 * fl);
      } else if (type === 'HIGHLAND') {
        const m = ridged(noise, wx * 0.00062, wz * 0.00062, 6);
        h = Math.pow(m, 1.7) * 135 + fbm(noise2, wx * 0.0016, wz * 0.0016, 4) * 14 + 8;
        h = lerp(12 + fbm(noise2, x * 0.001, z * 0.001, 2) * 6, h, 0.12 + 0.88 * fl);
      } else {
        h = 8 + fbm(noise, wx * 0.0010, wz * 0.0010, 5) * 14;
        h = lerp(7, h, 0.4 + 0.6 * fl);
      }
      // Gồ ghề vi mô của mặt đất tự nhiên (đất đá lồi lõm, không phẳng lì)
      h += fbm(noise2, x * 0.03, z * 0.03, 2) * 0.9 + noise(x * 0.075, z * 0.075) * 0.35;
      // Vành núi bao quanh chiến trường (xe không ra được mép bản đồ) nối liền cảnh vật ngoài bản đồ
      h += rimRaise(x, z);
      return outerLand(x, z, h);
    }

    // 1a. VÀNH NÚI + CẢNH NGOÀI BẢN ĐỒ (dùng chung cho lưới trong bản đồ và cảnh nền bên ngoài -> mép nối liền).
    //     Nhiễu riêng theo seed -> không xáo trộn chuỗi ngẫu nhiên của phần trong bản đồ.
    const OUT = OUTER[type];
    const on = makeNoise(mulberry32((seed ^ 0x0b5e55ed) >>> 0));
    // nhiễu theo hướng (liền mạch quanh vòng tròn): mép vành núi / bờ biển lượn sóng thay vì tròn xoe
    const angN = (x, z, f, o) => { const d = Math.hypot(x, z) || 1; return on(x / d * f + o, z / d * f - o * 0.7); };
    const coastPhi = on(0.37, 9.1) * Math.PI * 2;   // hướng trục dài của đảo
    // Bán kính tối thiểu của lòng thung lũng theo hướng: đủ ôm đồi cứ điểm (+ chân đồi) và khu xuất kích hai phe theo
    // hướng đó; hướng trống thì núi được lấn vào tới ~0.56 nửa bản đồ
    const KEYS = [];
    for (const c of STRONGHOLD_SITES) KEYS.push([c.x, c.z, 820]);
    for (const zc of [(SPAWN.blue.z0 + SPAWN.blue.z1) / 2, (SPAWN.red.z0 + SPAWN.red.z1) / 2])
      for (const xc of [-SPAWN.halfX, 0, SPAWN.halfX]) KEYS.push([xc, zc, 360]);
    const KM = new Float32Array(720);
    for (let a = 0; a < 720; a++) {
      const t = a / 720 * Math.PI * 2, c = Math.cos(t), sn = Math.sin(t);
      let r = HALF * 0.56;
      for (const [kx, kz, kr] of KEYS) {
        const along = kx * c + kz * sn, across = Math.abs(-kx * sn + kz * c);
        if (across < kr) r = Math.max(r, along + Math.sqrt(kr * kr - across * across));
      }
      KM[a] = r;
    }
    // làm mượt bảng (không gãy góc ở mép tầm ảnh hưởng của từng điểm)
    for (let pass = 0; pass < 3; pass++) {
      const T0 = KM.slice();
      for (let a = 0; a < 720; a++) KM[a] = Math.max(T0[a], (T0[(a + 719) % 720] + T0[a] + T0[(a + 1) % 720]) / 3);
    }
    const keyMinAt = (x, z) => {
      const u = (Math.atan2(z, x) / (Math.PI * 2) + 1) % 1 * 720, i = Math.floor(u) % 720, f = u - Math.floor(u);
      return KM[i] * (1 - f) + KM[(i + 1) % 720] * f;
    };
    // CHÂN VÀNH NÚI = ranh giới thung lũng chiến trường: hình dạng ngẫu nhiên tự nhiên mỗi map (không tròn, không vuông):
    // lượn sóng nhiều tầng trên toạ độ bị bẻ cong + mũi núi lấn sâu ở chỗ ngẫu nhiên. Không lấn vào cứ điểm / khu xuất
    // kích, không chạm mép giữ xe
    function rimFoot(x, z) {
      const d = Math.hypot(x, z) || 1;
      // bẻ cong toạ độ trước khi lấy nhiễu: đường chân núi méo theo vùng, không toả đều từ tâm
      const wx = x + 0.45 * d * on(x / d * 0.9 + 4.4, z / d * 0.9 - 2.2), wz = z + 0.45 * d * on(x / d * 0.9 - 7.1, z / d * 0.9 + 1.3);
      // bán kính nền như nhau mọi hướng (không bám khung vuông), hình dạng do nhiễu quyết định; nền đủ nhỏ để
      // phần lồi ra ít khi chạm giới hạn mép (chỗ đó bị ép phẳng thành cạnh thẳng)
      let f = HALF * 0.79
        + 340 * angN(wx, wz, 1.3, 11.3) + 210 * angN(wx, wz, 3.1, 3.1) + 80 * angN(wx, wz, 7.3, 5.5) + 18 * on(x * 0.004 + 2, z * 0.004);
      // vài mũi núi lấn sâu vào lòng thung lũng ở chỗ ngẫu nhiên (mỗi map khác nhau)
      f -= 1100 * Math.pow(Math.max(0, angN(wx, wz, 2.4, 6.6) - 0.08), 1.3);
      // không lấn vào cứ điểm / khu xuất kích: max mềm với bán kính tối thiểu theo hướng (bảng keyMin)
      const minA = keyMinAt(x, z);
      f = minA + 90 * Math.log(Math.exp((f - minA) / 90) + 1);
      // cách mép giữ xe (±(HALF - 60)) ít nhất ~200 theo hướng này: min mềm, không gãy góc
      const lim = boxDist(x, z) - 200;
      return -120 * Math.log(Math.exp(-f / 120) + Math.exp(-lim / 120));
    }
    // khoảng cách từ tâm tới mép giữ xe (hình vuông ±(HALF - 60)) theo hướng (x, z)
    function boxDist(x, z) { return (HALF - 60) / Math.max(Math.abs(x), Math.abs(z), 1e-6) * Math.hypot(x, z); }
    // đồng bằng ven biển chỉ bắt đầu sau chân núi + 900 (ngoài tường giữ xe)
    function coastIn(x, z) { return rimFoot(x, z) + 900; }
    function rimRaise(x, z) {
      const d = Math.hypot(x, z), foot = rimFoot(x, z);
      const s = d - foot;
      if (s <= 0) return 0;
      // chân vành: sườn đều dốc ~0.6 như trước, lên cao thì thoải dần về đỉnh (không còn mặt nón thẳng đuột)
      const pk = OUT.peak * (0.8 + 0.5 * fbm(on, x * 0.0005 + 3, z * 0.0005, 3));
      // chân dốc mềm (độ dốc tăng dần từ 0) -> không có nếp gãy tròn nơi đồng bằng chạm chân núi
      const se = s * s / (s + 90);
      let r = pk * (1 - Math.exp(-se * 0.6 / pk));
      // sống núi, yên ngựa, khe suối: gồ ghề tăng dần khi lên cao
      r *= lerp(1, 0.35 + 1.25 * ridged(on, x * 0.0013, z * 0.0013, 5), smooth(60, 700, s));
      // qua đỉnh vành thì đổ xuống phía ngoài
      // đỉnh vành luôn ngoài tường giữ xe trên sườn núi (chân núi + WALL, xem spg.js): không leo qua núi xuống biển
      const crest = foot + 1250 + 230 * angN(x, z, 2.3, 5.7) + 150 * angN(x, z, 5.9, 1.9);
      return r * (1 - smooth(crest, crest + 1300, d));
    }
    function outerLand(x, z, h) {
      const d = Math.hypot(x, z);
      if (d < 2300 + O0) return h;
      if (OUT.sea) {
        // BỜ BIỂN: chân vành núi thoải xuống dải đồng ven biển có cồn cát thấp -> bãi cát dốc rất nhẹ ra mép nước
        // -> thềm nước nông -> đáy biển sâu. Đường bờ bị bẻ cong nhiều tầng (vịnh, mũi đất, bán đảo); có đoạn bãi rộng,
        // có đoạn núi đổ thẳng xuống biển thành vách đá không có bãi.
        const wx = x + 750 * fbm(on, x * 0.0003 + 1.7, z * 0.0003, 3), wz = z + 750 * fbm(on, x * 0.0003, z * 0.0003 + 9.1, 3);
        // đảo không tròn: bám dáng chân vành núi (vuông bo góc, lượn sóng) + kéo dài thành bầu dục theo hướng ngẫu nhiên
        const oval = 1 - 0.15 * (0.5 + 0.5 * Math.cos(2 * (Math.atan2(wz, wx) - coastPhi)));   // chỉ kéo dài ra, không thu vào
        const t = Math.hypot(wx, wz) * oval - (rimFoot(x, z) + 1950 + 520 * angN(wx, wz, 2.2, 2.2) + 260 * angN(wx, wz, 5.3, 7.7) + 90 * on(x * 0.0025 + 5, z * 0.0025));
        const bn = fbm(on, x * 0.0011 + 4, z * 0.0011 - 1, 2) + 0.3 * on(x * 0.004, z * 0.004 + 6);
        const bw = 18 + 340 * smooth(-0.3, 0.35, bn), pw = 50 + 280 * smooth(-0.2, 0.3, bn);
        let p;
        if (t >= 0) p = 0.2 - 6 * smooth(0, 60 + bw, t) - 32 * smooth(150, 900, t) + fbm(on, x * 0.001, z * 0.001, 2) * 6 * smooth(300, 900, t);
        else if (t > -bw) p = 0.2 + 4.2 * Math.pow(-t / bw, 1.3) + on(x * 0.03, z * 0.03) * 0.15;   // bãi cát
        else p = 4.4 + 9 * smooth(-bw, -bw - pw, t) + Math.max(0, on(x * 0.012 + 2, z * 0.012)) * 4 * smooth(-bw, -bw - 80, t);   // cồn cát, đồng cỏ ven biển
        h = lerp(h, p, smooth(-bw - pw - 120 - 450 * smooth(-0.3, 0.3, bn), -bw - pw, t) * smooth(coastIn(x, z), coastIn(x, z) + 350, d));
        if (d > 4500 + O0) {
          const fade = smooth(4500 + O0, 5300 + O0, d);
          if (OUT.far === 'karst') {
            // núi đá vôi dựng đứng nhô lên giữa biển (kiểu vịnh Hạ Long)
            // chỉ vài cụm (vịnh đá) chứ không rải khắp biển; mỗi khối đủ to để lưới cảnh nền xa vẫn dựng tròn trịa
            const cm = smooth(0.12, 0.4, fbm(on, x * 0.00022 + 3, z * 0.00022 - 8, 2));
            if (cm > 0) {
              const kv = on(x * 0.0011 + 9, z * 0.0011 - 4) + 0.3 * on(x * 0.004, z * 0.004);
              h = Math.max(h, -40 + smooth(0.28, 0.46, kv) * cm * (200 + 200 * fbm(on, x * 0.002, z * 0.002, 2)) * fade);
            }
          } else {
            // vài hòn đảo xa thưa thớt, sườn thoải xuống bãi
            const iv = fbm(on, x * 0.00021 + 7, z * 0.00021 - 2, 3) + 0.25 * on(x * 0.0011, z * 0.0011);
            const isl = smooth(0.3, 0.62, iv) * fade;
            if (isl > 0) {
              let hi = -40 + isl * (90 + 380 * ridged(on, x * 0.0009, z * 0.0009, 4));
              hi *= 0.3 + 0.7 * smooth(1.5, 14, Math.abs(hi - 0.2));   // ven mép nước thoải ra thành bãi
              h = Math.max(h, hi);
            }
          }
        }
      } else if (OUT.far === 'mesa') {
        // núi bàn sa mạc đỉnh bằng, vách dựng đứng nhô lên giữa biển cát
        const mv = fbm(on, x * 0.0005 + 2, z * 0.0005 - 6, 4);
        h += (smooth(0.18, 0.23, mv) * 150 + smooth(0.32, 0.36, mv) * 70) * smooth(3100 + O0, 3900 + O0, d);
      } else {
        // các dãy núi nối tiếp nhau tới chân trời
        // khối núi lớn nhỏ không đều: có dãy cao vút (đỉnh tuyết), có vùng đồi thấp / thung lũng rộng giữa các dãy
        const rv = ridged(on, x * 0.00028 + 4, z * 0.00028, 6) * 0.75 + ridged(on, x * 0.0009 - 2, z * 0.0009 + 5, 4) * 0.25;
        const amp = 300 + 1100 * smooth(-0.35, 0.45, fbm(on, x * 0.00016 + 8, z * 0.00016 - 3, 2));
        h += Math.pow(rv, 1.8) * amp * smooth(3200 + O0, 4600 + O0, d);
      }
      return h;
    }

    for (let iz = 0; iz < N; iz++) {
      for (let ix = 0; ix < N; ix++) {
        heights[iz * N + ix] = baseHeight(-HALF + ix * CELL, -HALF + iz * CELL);
      }
    }
    const H = (x, z) => sampleH(heights, x, z);

    // 1b. BA NGỌN ĐỒI CỨ ĐIỂM: đỉnh bằng phẳng (cốt nền G) rộng ~200, sườn thoải xe leo được, chân đồi lượn sóng tự nhiên
    const strongholds = [];
    if (SH) {
      for (const c of STRONGHOLD_SITES) {
        let base = 0, n = 0;
        for (let a = 0; a < 12; a++) { base += H(c.x + Math.cos(a * 0.5236) * 300, c.z + Math.sin(a * 0.5236) * 300); n++; }
        strongholds.push({ id: c.id, x: c.x, z: c.z, angle: c.angle, G: Math.round((base / n + c.hill) * 10) / 10 });
      }
      for (let iz = 0; iz < N; iz++) {
        for (let ix = 0; ix < N; ix++) {
          const x = -HALF + ix * CELL, z = -HALF + iz * CELL, i = iz * N + ix;
          for (const c of strongholds) {
            const dx = x - c.x, dz = z - c.z, d0 = Math.hypot(dx, dz);
            if (d0 > 820) continue;
            const ang = Math.atan2(dz, dx);
            const d = d0 * (1 + 0.16 * Math.sin(ang * 3 + c.G) + 0.1 * noise(Math.cos(ang) * 1.7 + c.x * 0.01, Math.sin(ang) * 1.7));
            const k = 1 - smooth(290, 680, d);
            if (k > 0) heights[i] = lerp(heights[i], c.G + (k < 0.98 ? noise(x * 0.02, z * 0.02) * 2.5 * (1 - k) : 0), k);
          }
        }
      }
    }

    // 2. SÔNG & HỒ (map sông hồ): sông bắt nguồn từ suối trong núi đổ xuống hồ dưới chân vành núi ở một đầu thung lũng,
    //    uốn khúc dọc một cánh chiến trường (Bắc - Nam) rồi qua khe núi ở đầu kia đổ ra biển. Càng về hạ lưu càng rộng,
    //    càng uốn mạnh. Vẫn chắn trọn một cánh -> cả hai phe đều phải qua cầu / bãi cạn khi đánh vòng cánh, không ngập cứ điểm
    const lakes = [];
    let riverCut = null;
    if (type === 'RIVER_LAKE') {
      const cx = (rng() < 0.5 ? -1 : 1) * (SH ? R(1120, 1220) : R(380, 420)) * K;
      const amp = R(60, 110), f1 = R(0.0016, 0.0026), ph = R(0, 6.28);
      // bộ số riêng cho dáng sông (không xáo trộn chuỗi ngẫu nhiên của phần sau)
      const rv = mulberry32((seed ^ 0x51ee7) >>> 0), RV = (a, b) => a + rv() * (b - a);
      const dir = rv() < 0.5 ? 1 : -1;              // chiều chảy theo z: nguồn ở phía -dir
      const sg = Math.sign(cx) || 1;
      const ph2 = RV(0, 6.28), f2 = f1 * RV(2.1, 2.7);
      // hồ đầu nguồn: dưới chân vành núi phía thượng nguồn (sông chảy suốt ít nhất ~0.6 chiều dài thung lũng)
      let zSrc = -dir * HALF * 0.6;
      while (Math.abs(zSrc) < HALF * 0.85 && Math.hypot(cx, zSrc) < rimFoot(cx, zSrc) - 260) zSrc -= dir * 20;
      const lakeR = RV(190, 250);
      const srcLake = { x: cx + RV(-60, 60), z: zSrc, r: lakeR, source: true };
      // bề rộng & biên độ uốn theo quãng đường xuôi dòng tính từ hồ
      const down = z => Math.max(0, (z - zSrc) * dir);
      const halfW = z => lerp(46, 84, smooth(0, 3200, down(z)));
      const riverX = z => {
        const t = down(z), A = lerp(60, 1.9 * amp + 30, smooth(0, 2400, t));
        // ngoài mép bản đồ (qua khe núi ra biển) uốn khúc mạnh dần
        const o = smooth(HALF + 100, HALF + 1100, Math.abs(z));
        let x = cx + A * (Math.sin(z * f1 * 1.25 + ph) + 0.35 * Math.sin(z * f2 + ph2)) + fbm(noise, 7.3, z * 0.0012, 3) * 60 * (1 + 4 * o)
          + o * 650 * Math.sin((Math.abs(z) - HALF - 100) * 0.0019 + ph * 2) * Math.sign(z);
        // trong thung lũng: không lấn lên đồi cứ điểm, không chạm chân vành núi phía ngoài
        if (!o) {
          const inner = 1040 * K, hw = halfW(z), outer = Math.sqrt(Math.max(0, (rimFoot(x, z) - hw - 170) ** 2 - z * z));
          x = sg * Math.max(inner, Math.min(Math.max(inner, outer), Math.abs(x)));
        }
        return x;
      };
      // từ hồ xuôi về hạ lưu: trong bản đồ (pts) và kéo dài qua khe núi ra biển (far, cảnh nền dùng chung); [x, z, nửa bề rộng]
      const pts = [], far = [];
      const zEnd = dir * OUTER_EXT;
      for (let z = zSrc; dir > 0 ? z <= zEnd : z >= zEnd; z += 40 * dir) {
        const q = [riverX(z), z, halfW(z)];
        far.push(q);
        if (Math.abs(z) <= HALF + 100) pts.push(q);
      }
      if (dir < 0) { pts.reverse(); far.reverse(); }   // giữ thứ tự tăng dần theo z
      // suối nhỏ từ trong núi đổ xuống hồ (khe hẹp xẻ sườn núi)
      const inA = -dir * Math.PI / 2 + RV(-0.6, 0.6) + (sg > 0 ? 0.25 : -0.25) * dir;
      const inlet = [];
      for (let k = 0; k <= 22; k++) {
        const r = lakeR * 0.6 + k * 40, wob = Math.sin(k * 0.55 + ph2) * 30;
        inlet.push([srcLake.x + Math.cos(inA) * r - Math.sin(inA) * wob, srcLake.z + Math.sin(inA) * r + Math.cos(inA) * wob, lerp(15, 7, k / 22)]);
      }
      river = { pts, width: 2 * 84, inlet, source: srcLake, dir };
      const zLo = far[0][1], zHi = far[far.length - 1][1];
      // khoảng cách tới đường sông (nửa bề rộng nội suy theo đoạn gần nhất); không cấp phát (gọi hàng trăm nghìn lần)
      const NR = { d: Infinity, hw: 0 };
      const nearOn = (P, i0, i1, x, z) => {
        let best = Infinity, hw = 0;
        for (let i = i0; i < i1; i++) {
          const a = P[i], b = P[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], L = dx * dx + dz * dz;
          const t = L > 0 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L)) : 0;
          const ex = a[0] + dx * t - x, ez = a[1] + dz * t - z, d2 = ex * ex + ez * ez;
          if (d2 < best) { best = d2; hw = a[2] + (b[2] - a[2]) * t; }
        }
        NR.d = Math.sqrt(best); NR.hw = hw;
        return NR;
      };
      river.near = (x, z) => {
        // trong bản đồ sông lệch khỏi cx tối đa ~400 (+ thung lũng 1134); ra ngoài khe núi uốn xa hơn
        if (z < zLo - 1300 || z > zHi + 1300 || Math.abs(x - cx) > (Math.abs(z) < HALF ? 1600 : 2700)) { NR.d = Infinity; NR.hw = 0; return NR; }
        const i0 = Math.max(0, Math.floor((z - zLo - 1200) / 40)), i1 = Math.min(far.length - 1, Math.ceil((z - zLo + 1200) / 40));
        if (i1 <= i0) { NR.d = Infinity; NR.hw = 0; return NR; }
        return nearOn(far, i0, i1, x, z);
      };
      riverCut = (x, z, h) => {
        const { d, hw } = river.near(x, z);
        // vành núi hạ thấp thành thung lũng rộng hai bên sông (bãi bồi ven sông, sườn thoải dần lên núi)
        if (d < hw + 1050) {
          const rr = rimRaise(x, z);
          if (rr > 0) h = Math.max(Math.min(h, 7), h - rr * (1 - smooth(hw + 60, hw + 1050, d)));
        }
        if (d < hw + 120) h = Math.min(h, d < hw ? lerp(-12, -2.5, smooth(0, hw, d)) : lerp(-2, h, smooth(hw, hw + 120, d)));
        // suối đầu nguồn: khe hẹp xẻ sườn núi, lòng suối nông
        if (Math.hypot(x - srcLake.x, z - srcLake.z) < 1400) {
          const di = nearOn(inlet, 0, inlet.length - 1, x, z);
          if (di.d < 320) {
          const rr = rimRaise(x, z);
          if (rr > 0) h = Math.max(Math.min(h, 6), h - rr * 0.9 * (1 - smooth(di.hw + 20, di.hw + 320, di.d)));
          if (di.d < di.hw + 40) h = Math.min(h, di.d < di.hw ? lerp(-3, -0.6, smooth(0, di.hw, di.d)) : lerp(-0.4, h, smooth(di.hw, di.hw + 40, di.d)));
          }
        }
        return h;
      };
      for (let k = 0; k < 2; k++) {
        lakes.push({ x: (k ? 1 : -1) * R(900, 1350) * K, z: (k ? -1 : 1) * R(420, 720) * K, r: R(150, 230) });
      }
      lakes.push(srcLake);
      for (let iz = 0; iz < N; iz++) {
        for (let ix = 0; ix < N; ix++) {
          const x = -HALF + ix * CELL, z = -HALF + iz * CELL;
          const { d, hw } = river.near(x, z);
          let carve = null;
          const cut = riverCut(x, z, heights[iz * N + ix]);
          if (d < hw + 120) carve = cut;
          else heights[iz * N + ix] = cut;   // thung lũng xẻ vành núi
          for (const L of lakes) {
            const dl = Math.hypot(x - L.x, z - L.z) + fbm(noise2, x * 0.006, z * 0.006, 2) * 40;
            if (dl < L.r + 90) {
              const bed = dl < L.r ? lerp(-10, -2.5, smooth(0, L.r, dl)) : lerp(-2, heights[iz * N + ix], smooth(L.r, L.r + 90, dl));
              carve = carve === null ? bed : Math.min(carve, bed);
            }
          }
          if (carve !== null) {
            heights[iz * N + ix] = Math.min(heights[iz * N + ix], carve);
            if (carve < 0) surface[iz * N + ix] = 2;
          }
        }
      }
    }
    // nước = lòng sông / hồ hoặc dải bờ ngập nông (đất thấp hơn mặt nước + ~1 đơn vị): không đặt nhà / cây / đá ở đó
    // (trước đây nhà đầu cầu đứng chân dưới nước vì bờ thoải ra ngoài bề rộng lòng sông)
    const isWater = (x, z) => river ? (((n) => n.d < n.hw)(river.near(x, z)) || lakes.some(L => Math.hypot(x - L.x, z - L.z) < L.r) || H(x, z) < 1.2) : false;

    // 3. MẠNG ĐƯỜNG
    const roads = [];
    const bridges = [];
    if (type === 'URBAN') {
      // Lưới phố không đều, xoay nhẹ cả lưới; đại lộ chính chạy qua 3 cứ điểm
      const rot = R(-0.12, 0.12), cr = Math.cos(rot), sr = Math.sin(rot);
      const tf = (u, v) => [u * cr - v * sr, u * sr + v * cr];
      const lines = [];
      let u = -1500 * K;
      while (u <= 1500 * K) { lines.push(u); u += R(240, 360); }
      const linesV = [];
      let v = -1500 * K;
      while (v <= 1500 * K) { linesV.push(v); v += R(240, 360); }
      if (!linesV.some(q => Math.abs(q) < 60)) linesV.push(0);
      const seg = (a, b, w, kind) => {
        const pts = [];
        const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 14);
        for (let i = 0; i <= n; i++) pts.push([lerp(a[0], b[0], i / n), lerp(a[1], b[1], i / n)]);
        roads.push({ pts, width: w, kind });
      };
      for (const q of lines) seg(tf(q, -1560 * K), tf(q, 1560 * K), Math.abs(q) < 140 ? 44 : 32, 'asphalt');
      for (const q of linesV) seg(tf(-1560 * K, q), tf(1560 * K, q), Math.abs(q) < 60 ? 52 : 32, 'asphalt');
      roads.urbanGrid = { lines, linesV, rot };
    } else {
      // Tìm đường A* trên lưới thô: ưu tiên chỗ thoải, tránh nước, tận dụng đường có sẵn (tạo ngã ba tự nhiên)
      const G = Math.round(72 * K), gc = SIZE / G;
      const gh = new Float32Array((G + 1) * (G + 1));
      for (let j = 0; j <= G; j++) for (let i = 0; i <= G; i++) gh[j * (G + 1) + i] = H(-HALF + i * gc, -HALF + j * gc);
      const roadCell = new Uint8Array((G + 1) * (G + 1));
      const waterCell = new Uint8Array((G + 1) * (G + 1));
      if (river) for (let j = 0; j <= G; j++) for (let i = 0; i <= G; i++) if (isWater(-HALF + i * gc, -HALF + j * gc)) waterCell[j * (G + 1) + i] = 1;
      const toCell = (x, z) => [Math.round((x + HALF) / gc), Math.round((z + HALF) / gc)];
      const route = (a, b, w, kind, noReuse = false) => {
        const [sx, sz] = toCell(a.x, a.z), [ex, ez] = toCell(b.x, b.z);
        const W = G + 1, idx = (i, j) => j * W + i;
        const gScore = new Float32Array(W * W).fill(Infinity), came = new Int32Array(W * W).fill(-1);
        const open = new MinHeap();
        open.push(0, idx(sx, sz));
        gScore[idx(sx, sz)] = 0;
        const heur = (i, j) => Math.hypot(i - ex, j - ez) * gc;
        const closed = new Uint8Array(W * W);
        while (open.size) {
          const cur = open.pop();
          if (closed[cur]) continue;
          closed[cur] = 1;
          const ci = cur % W, cj = (cur / W) | 0;
          if (ci === ex && cj === ez) break;
          for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
            if (!di && !dj) continue;
            const ni = ci + di, nj = cj + dj;
            if (ni < 2 || nj < 2 || ni > G - 2 || nj > G - 2) continue;
            const n = idx(ni, nj);
            const len = Math.hypot(di, dj) * gc;
            const slope = Math.abs(gh[n] - gh[cur]) / len;
            let c = len * (1 + slope * slope * 260 + slope * 8);
            if (waterCell[n]) c += 260;            // vượt sông -> cầu (đắt hơn đi bộ, nhưng không vòng quá xa)
            if (roadCell[n] && !noReuse) c *= 0.55; // đi chung đường cũ
            c *= 1 + 0.25 * (noise2(ni * 0.35, nj * 0.35) + 1);  // uốn lượn tự nhiên
            const gs = gScore[cur] + c;
            if (gs < gScore[n]) { gScore[n] = gs; came[n] = cur; open.push(gs + heur(ni, nj), n); }
          }
        }
        const path = [];
        let c = idx(ex, ez);
        if (came[c] === -1 && c !== idx(sx, sz)) return;
        while (c !== -1) { path.push([-HALF + (c % W) * gc, -HALF + ((c / W) | 0) * gc]); roadCell[c] = 1; c = came[c]; }
        path.reverse();
        path[0] = [a.x, a.z];
        path[path.length - 1] = [b.x, b.z];
        // Bo cong Chaikin + chia lại mỗi ~14 đơn vị
        let sm = path;
        for (let k = 0; k < 3; k++) sm = chaikin(sm);
        const pts = resample(sm, 14);
        roads.push({ pts, width: w, kind });
      };
      const B0 = bases.blue, R0 = bases.red;
      const sideA = rng() < 0.5;
      if (SH) {
        // Đường lên đồi dẫn tới 2 miệng xuyên qua của mỗi cứ điểm
        const mouth = (c, sg) => ({ x: c.x + Math.cos(c.angle) * sg * 258, z: c.z + Math.sin(c.angle) * sg * 258 });
        const [cA, cB, cC] = strongholds;
        route(B0, mouth(cB, 1), 36, B.roadKind);
        route(R0, mouth(cB, -1), 36, B.roadKind);
        route(mouth(cA, 1), mouth(cB, 1), 32, B.roadKind);
        route(mouth(cC, 1), mouth(cB, 1), 32, B.roadKind);
        route(B0, mouth(cA, -1), 28, B.roadKind);
        route(B0, mouth(cC, -1), 28, B.roadKind);
        route(R0, mouth(cA, -1), 26, B.roadKind);
        route(R0, mouth(cC, -1), 26, B.roadKind);
      } else {
      route(B0, CAPTURE[1], 36, B.roadKind);
      route(R0, CAPTURE[1], 36, B.roadKind);
      route(CAPTURE[0], CAPTURE[1], 34, B.roadKind);
      route(CAPTURE[1], CAPTURE[2], 34, B.roadKind);
      route(B0, sideA ? CAPTURE[0] : CAPTURE[2], 28, B.roadKind);
      route(R0, sideA ? CAPTURE[2] : CAPTURE[0], 28, B.roadKind);
      if (rng() < 0.7) route(B0, sideA ? CAPTURE[2] : CAPTURE[0], 26, B.roadKind);
      if (rng() < 0.7) route(R0, sideA ? CAPTURE[0] : CAPTURE[2], 26, B.roadKind);
      }
      // Sông: bảo đảm có thêm các tuyến vượt sông ở hai cánh (mỗi phe một cây cầu gần mình)
      if (river) {
        for (const zc of [R(520, 760) * K, -R(520, 760) * K]) {
          let rx = 0, bd = Infinity;
          for (const p of river.pts) { const d = Math.abs(p[1] - zc); if (d < bd) { bd = d; rx = p[0]; } }
          route({ x: rx - 330, z: zc + R(-60, 60) }, { x: rx + 330, z: zc + R(-60, 60) }, 30, B.roadKind, true);
        }
      }
      // Cầu nơi đường vượt sông
      if (river) {
        for (const rd of roads) {
          let inW = -1;
          for (let i = 0; i < rd.pts.length; i++) {
            const w = isWater(rd.pts[i][0], rd.pts[i][1]);
            if (w && inW < 0) inW = i;
            if (!w && inW >= 0) {
              const a = rd.pts[Math.max(0, inW - 3)], b = rd.pts[Math.min(rd.pts.length - 1, i + 2)];
              const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
              if (len > 40 && !bridges.some(q => Math.hypot(q.x - (a[0] + b[0]) / 2, q.z - (a[1] + b[1]) / 2) < 120)) {
                bridges.push({ x: (a[0] + b[0]) / 2, z: (a[1] + b[1]) / 2, angle: Math.atan2(b[0] - a[0], b[1] - a[1]), length: len + 40, width: rd.width + 18 });
              }
              inW = -1;
            }
          }
        }
      }
    }

    if (river) {
      // 2b. CỒN CÁT / BÃI CẠN NGANG SÔNG: 2-3 chỗ lòng sông nông xe lội qua được (nước ~0.2 m), giữa thường nhô
      //     một cồn cát khô; dải cạn chéo theo dòng chảy như bãi bồi thật. Bộ số ngẫu nhiên riêng -> không làm xô
      //     lệch thứ tự ngẫu nhiên của đường / nhà / cây phía sau (bản đồ cũ giữ nguyên, chỉ thêm cồn)
      const fr = mulberry32(seed ^ 0x51c0a7);
      const FR = (a, b) => a + fr() * (b - a);
      const nF = fr() < 0.5 ? 2 : 3;
      river.fords = [];
      const hw = river.width / 2;
      // vị trí dọc sông: tránh xa mọi cây cầu (không ai cần lội ngay cạnh cầu) và cách nhau đủ xa
      const zsel = [];
      for (let t = 0; t < 60 && zsel.length < nF; t++) {
        const zf = FR(-HALF * 0.62, HALF * 0.62);
        if (bridges.some(b => Math.abs(b.z - zf) < 280) || zsel.some(z => Math.abs(z - zf) < 420)) continue;
        zsel.push(zf);
      }
      for (const zf of zsel) {
        let xc = river.pts[0][0], bd = Infinity;
        for (const p of river.pts) { const dd = Math.abs(p[1] - zf); if (dd < bd) { bd = dd; xc = p[0]; } }
        river.fords.push({ x: xc, z: zf, len: FR(80, 125), skew: FR(-0.55, 0.55), isle: fr() < 0.8 ? FR(1.0, 2.2) : 0, off: FR(-0.25, 0.25) * hw, seed: FR(0, 100) });
      }
      for (const F of river.fords) {
        for (let iz = 0; iz < N; iz++) {
          const z = -HALF + iz * CELL;
          if (Math.abs(z - F.z) > F.len + hw) continue;
          for (let ix = 0; ix < N; ix++) {
            const x = -HALF + ix * CELL, i = iz * N + ix;
            if (Math.abs(x - F.x) > hw + 60) continue;
            const along = (z - F.z) - F.skew * (x - F.x) + noise2(x * 0.01 + F.seed, z * 0.01) * 18;
            const f = 1 - smooth(F.len * 0.4, F.len, Math.abs(along));
            if (f <= 0) continue;
            // dải cạn ~0.2 m nước, gợn sóng cát nhỏ; giữa dòng nhô cồn cát khô (thuôn theo dòng chảy)
            const across = Math.abs(x - F.x - F.off);
            const isle = F.isle * (1 - smooth(hw * 0.12, hw * 0.55, across)) * (1 - smooth(F.len * 0.15, F.len * 0.55, Math.abs(along)));
            const target = -1.4 + isle * 1.4 + noise(x * 0.05 + F.seed, z * 0.05) * 0.35;
            if (target > heights[i]) heights[i] = lerp(heights[i], target, f);
          }
        }
      }
    }

    // 4. KHẮC ĐƯỜNG VÀO ĐỊA HÌNH: nền đường phẳng có độ dốc thoải + gồ ghề (ổ gà, gợn sóng, lún vệt bánh)
    const roadHash = new Map();
    const HB = 64;
    const hkey = (i, j) => i * 100003 + j;
    roads.forEach((rd, ri) => {
      // Cao độ dọc tuyến: lấy theo địa hình rồi làm trơn để dốc thoải
      const hs = rd.pts.map(p => H(p[0], p[1]));
      const sm = hs.slice();
      for (let pass = 0; pass < 3; pass++) {
        for (let i = 0; i < hs.length; i++) {
          let s = 0, n = 0;
          for (let k = -6; k <= 6; k++) { const q = hs[Math.max(0, Math.min(hs.length - 1, i + k))]; s += q; n++; }
          sm[i] = s / n;
        }
        for (let i = 0; i < hs.length; i++) hs[i] = sm[i];
      }
      rd.heights = hs.map(h => Math.max(h, river ? 1.5 : -Infinity));
      rd.pts.forEach((p, pi) => {
        const k = hkey(Math.floor((p[0] + HALF) / HB), Math.floor((p[1] + HALF) / HB));
        if (!roadHash.has(k)) roadHash.set(k, []);
        roadHash.get(k).push([ri, pi]);
      });
    });
    // Tìm đoạn đường gần nhất (dùng chung cho khắc địa hình & tra cứu mặt đường)
    function nearestRoad(x, z, maxD) {
      const ci = Math.floor((x + HALF) / HB), cj = Math.floor((z + HALF) / HB);
      let best = null, bd = maxD;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const list = roadHash.get(hkey(ci + di, cj + dj));
        if (!list) continue;
        for (const [ri, pi] of list) {
          const rd = roads[ri];
          const a = rd.pts[pi], b = rd.pts[Math.min(rd.pts.length - 1, pi + 1)];
          const r = segDist(x, z, a[0], a[1], b[0], b[1]);
          if (r.d < bd) { bd = r.d; best = { road: rd, d: r.d, h: lerp(rd.heights[pi], rd.heights[Math.min(rd.pts.length - 1, pi + 1)], r.t), t: pi + r.t }; }
        }
      }
      return best;
    }
    for (let iz = 0; iz < N; iz++) {
      for (let ix = 0; ix < N; ix++) {
        const x = -HALF + ix * CELL, z = -HALF + iz * CELL;
        const nr = nearestRoad(x, z, 70);
        if (!nr) continue;
        const hw = nr.road.width / 2;
        const shoulder = type === 'URBAN' ? 6 : 26;
        if (nr.d > hw + shoulder) continue;
        const i = iz * N + ix;
        if (surface[i] === 2 && bridges.length) continue;
        const blend = 1 - smooth(hw * 0.8, hw + shoulder, nr.d);
        // Mặt đường gồ ghề theo loại: đường đất / bùn có ổ gà sâu & lún vệt bánh, sỏi đá lởm chởm, nhựa có ổ gà nhỏ
        const kind = nr.road.kind;
        const pot = Math.max(0, noise2(x * 0.045, z * 0.045) - 0.35) * (kind === 'asphalt' ? 1.4 : kind === 'mud' ? 4.2 : 3.0);
        const wash = Math.sin(nr.t * (kind === 'gravel' ? 2.6 : 1.7)) * (kind === 'asphalt' ? 0.08 : 0.35);
        const rut = (kind === 'asphalt') ? 0 : -0.45 * Math.max(0, Math.cos((nr.d / hw) * Math.PI * 2.2));
        const target = nr.h - pot + wash + rut + (kind === 'asphalt' ? 0.1 : -0.25);
        heights[i] = lerp(heights[i], target, blend);
        if (nr.d < hw) surface[i] = 1;
      }
    }
    // Đỉnh đồi cứ điểm: trả lại mặt bằng phẳng tuyệt đối (đường lên đồi có thể đã khắc lệch)
    for (const c of strongholds) {
      for (let iz = 0; iz < N; iz++) {
        const z = -HALF + iz * CELL;
        if (Math.abs(z - c.z) > 360) continue;
        for (let ix = 0; ix < N; ix++) {
          const x = -HALF + ix * CELL, d = Math.hypot(x - c.x, z - c.z);
          if (d > 350) continue;
          const i = iz * N + ix;
          heights[i] = lerp(heights[i], c.G, 1 - smooth(270, 345, d));
        }
      }
    }
    // Đô thị: nền vỉa hè / sân bê tông giữa các tòa nhà
    if (type === 'URBAN') for (let i = 0; i < surface.length; i++) if (surface[i] === 0) surface[i] = 3;

    // 5. ĐẶT VẬT THỂ (Poisson-disk + điều kiện)
    const occupied = [];  // {x,z,r}
    const freeOf = (x, z, r) => occupied.every(o => Math.hypot(o.x - x, o.z - z) > o.r + r);
    function clearOfKeys(x, z, r) {
      if (Math.hypot(x, z) > rimFoot(x, z) - 90 - r) return false;   // chỉ trong lòng thung lũng (trước chân vành núi)
      for (const c of CAP) if (Math.hypot(x - c.x, z - c.z) < keyR + r) return false;
      if (Math.abs(x) < SPAWN.halfX + r && ((z > SPAWN.blue.z0 - r && z < SPAWN.blue.z1 + r) || (z > SPAWN.red.z0 - r && z < SPAWN.red.z1 + r))) return false;
      return true;
    }
    const roadClear = (x, z, r) => { const nr = nearestRoad(x, z, r + 60); return !nr || nr.d > nr.road.width / 2 + r + 4; };
    const slopeAt = (x, z) => {
      const e = 12;
      return Math.hypot(H(x + e, z) - H(x - e, z), H(x, z + e) - H(x, z - e)) / (2 * e);
    };
    function sample(count, minD, tries, accept) {
      const out = [];
      let t = 0;
      while (out.length < count && t < tries) {
        t++;
        const x = R(-HALF * 0.86, HALF * 0.86), z = R(-HALF * 0.86, HALF * 0.86);
        if (out.some(o => Math.hypot(o.x - x, o.z - z) < minD)) continue;
        const r = accept(x, z);
        if (r) out.push(Object.assign({ x, z }, r === true ? {} : r));
      }
      return out;
    }

    // 5a. Boong-ke móng ngựa cũ đã bỏ: điểm tựa phòng thủ giờ là các cứ điểm bê tông dưới ụ đất (strongholds)
    const bunkers = [];
    for (const c of strongholds) occupied.push({ x: c.x, z: c.z, r: 330 });

    // 5a'. CÔNG TRÌNH PHỤ / VẬT CẢN (props.js dựng hình): hàng rào, ruộng, xác xe, bao cát, hào ẩn xe
    const props = { fences: [], fields: [], wrecks: [], sandbags: [], pits: [] };
    // Hào ẩn xe (hull-down): hố đào sâu ~1.3 m, ụ đất đắp phía trước & 2 bên, dốc lên xuống phía sau.
    // Xe đỗ trong hào chỉ lộ tháp pháo về phía trước. Đặt trên chỗ đất cao của mỗi bên, quay mặt về phía địch.
    function carvePit(P) {
      const ca = Math.cos(P.angle), sa = Math.sin(P.angle), N = RES + 1, Rr = Math.hypot(P.w, P.l) / 2 + 60;
      const i0 = Math.max(0, Math.floor((P.x - Rr + HALF) / CELL)), i1 = Math.min(RES, Math.ceil((P.x + Rr + HALF) / CELL));
      const j0 = Math.max(0, Math.floor((P.z - Rr + HALF) / CELL)), j1 = Math.min(RES, Math.ceil((P.z + Rr + HALF) / CELL));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const dx = -HALF + i * CELL - P.x, dz = -HALF + j * CELL - P.z;
        const f = dx * ca + dz * sa, r = -dx * sa + dz * ca, ar = Math.abs(r);
        const inR = 1 - smooth(P.w / 2 - 4, P.w / 2 + 12, ar);
        const dig = P.depth * inR * smooth(-P.l / 2 - 34, -P.l / 2 + 4, f) * (1 - smooth(P.l / 2 - 6, P.l / 2 + 8, f));
        const bermF = Math.exp(-((f - P.l / 2 - 14) ** 2) / 200) * (1 - smooth(P.w / 2 + 4, P.w / 2 + 30, ar));
        const bermS = Math.exp(-((ar - P.w / 2 - 14) ** 2) / 200) * smooth(-P.l / 2 - 6, -P.l / 2 + 22, f) * (1 - smooth(P.l / 2 + 10, P.l / 2 + 34, f));
        heights[j * N + i] += P.berm * Math.max(bermF, bermS * 0.75) - dig;
      }
    }
    if (type !== 'URBAN') {
      for (const side of [1, -1]) {
        const want = SH ? 3 : 4, mine = [];
        for (let t = 0; t < 90 && mine.length < want; t++) {
          const x = R(-1150, 1150) * K, z = side * R(260, 820) * K;
          if (!clearOfKeys(x, z, 70) || !roadClear(x, z, 56) || !freeOf(x, z, 60) || isWater(x, z) || slopeAt(x, z) > 0.22) continue;
          // đáy hào phải cao hơn mặt nước (bản đồ có sông / hồ) -> không bị ngập
          if ((river || lakes.length) && H(x, z) < 15) continue;
          if (props.pits.some(q => Math.hypot(q.x - x, q.z - z) < 260)) continue;
          // ưu tiên gò / sống đất (cao hơn vòng xung quanh)
          let ring = 0;
          for (let k = 0; k < 8; k++) ring += H(x + Math.cos(k * 0.785) * 140, z + Math.sin(k * 0.785) * 140);
          if (H(x, z) - ring / 8 < -4 && rng() < 0.75) continue;
          const tx = x * 0.4 + R(-200, 200), tz = -side * 500 * K;
          const P = { x, z, angle: Math.atan2(tz - z, tx - x), w: 46, l: 60, depth: 10, berm: 7, side: side > 0 ? 'BLUE' : 'RED' };
          mine.push(P); props.pits.push(P);
          occupied.push({ x, z, r: 56 });
        }
      }
      for (const P of props.pits) {
        carvePit(P);
        // bao cát trên mép ụ phía trước (cong theo 3 đoạn)
        const ca = Math.cos(P.angle), sa = Math.sin(P.angle), w = (f, r) => [P.x + ca * f - sa * r, P.z + sa * f + ca * r];
        const f0 = P.l / 2 + 8;
        const pts = [w(f0 - 16, -P.w / 2 - 6), w(f0, -P.w / 4), w(f0 + 2, P.w / 4), w(f0 - 16, P.w / 2 + 6)];
        for (let k = 0; k < 3; k++) props.sandbags.push({ x0: pts[k][0], z0: pts[k][1], x1: pts[k + 1][0], z1: pts[k + 1][1], layers: 2 });
      }
    }

    // 5b. Nhà cửa
    const buildings = [];
    if (type === 'URBAN') {
      // Bộ sinh số riêng cho nhà phố: chỉnh cách xếp nhà sau này không làm lệch phần sinh sau (cây, đá, giờ trong ngày...)
      const rng = mulberry32((seed ^ hashStr('URBAN_BLD')) >>> 0), R = (a, b) => a + rng() * (b - a);
      const g = roads.urbanGrid;
      const cr = Math.cos(g.rot), sr = Math.sin(g.rot);
      const tf = (u, v) => [u * cr - v * sr, u * sr + v * cr];
      const us = g.lines.slice().sort((a, b) => a - b), vs = g.linesV.slice().sort((a, b) => a - b);
      for (let i = 0; i < us.length - 1; i++) {
        for (let j = 0; j < vs.length - 1; j++) {
          const u0 = us[i] + 26, u1 = us[i + 1] - 26, v0 = vs[j] + 26, v1 = vs[j + 1] - 26;
          if (u1 - u0 < 50 || v1 - v0 < 50) continue;
          const [cx, cz] = tf((u0 + u1) / 2, (v0 + v1) / 2);
          if (!clearOfKeys(cx, cz, 30)) {
            // Ô phố có cứ điểm / khu xuất kích: thành quảng trường / công viên
            continue;
          }
          if (rng() < 0.12) continue; // ô trống: bãi đất / công viên
          // Ô phố thật rộng 25-40 m: phần lớn là 1 công trình lớn (chung cư dài, cao ốc, khối nhà phố) hoặc 1-2 dãy
          // nhà ống liền vách quay mặt ra đường; chỉ ô rất rộng mới chia 2 lô
          const splitU = (u1 - u0) > 250 && rng() < 0.4, splitV = (v1 - v0) > 250 && rng() < 0.4;
          const lotsU = splitU ? [[u0, (u0 + u1) / 2 - 10], [(u0 + u1) / 2 + 10, u1]] : [[u0, u1]];
          const lotsV = splitV ? [[v0, (v0 + v1) / 2 - 10], [(v0 + v1) / 2 + 10, v1]] : [[v0, v1]];
          const central = Math.hypot(...tf((u0 + u1) / 2, (v0 + v1) / 2)) < 900 * K;
          const put = (pu, pv, w, d, floors, kind) => {
            const [bx, bz] = tf(pu, pv);
            if (!clearOfKeys(bx, bz, Math.max(w, d) * 0.5) || !freeOf(bx, bz, Math.max(w, d) * 0.5)) return false;
            buildings.push({ x: bx, z: bz, w, d, floors, angle: -g.rot, kind });
            return true;
          };
          for (const [a0, a1] of lotsU) for (const [b0, b1] of lotsV) {
            // trục dài của lô = u nếu (a1-a0) >= (b1-b0); hàm đổi chỗ để nhà luôn trải dọc trục dài
            const la = a1 - a0, lb = b1 - b0, alongU = la >= lb;
            const L0 = alongU ? a0 : b0, L1 = alongU ? a1 : b1, S0 = alongU ? b0 : a0, S1 = alongU ? b1 : a1;
            const at = (l, s) => alongU ? [l, s] : [s, l];
            const size = (wl, ws) => alongU ? [wl, ws] : [ws, wl];
            const LL = L1 - L0, SS = S1 - S0;
            const r = rng();
            if (r < 0.22 && SS > 170) {
              // Dãy nhà ống: mỗi căn rộng 1-2 khoang (~4-8 m), sâu 11-16 m, 3-6 tầng, liền vách, cao thấp lệch nhau
              // 2 dãy quay lưng vào nhau, mỗi dãy sát vỉa hè 1 bên đường
              const dep = Math.min(R(90, 130), (SS - 4) / 2);
              const rows = [S0 + dep / 2, S1 - dep / 2];
              for (const sc of rows) {
                let l = L0 + R(0, 10);
                while (l < L1 - 32) {
                  const wq = Math.min(L1 - l, rng() < 0.6 ? 32 : 64);   // mặt tiền 1-2 khoang nhà ống (4 / 8 m)
                  if (rng() < 0.08) { l += wq; continue; }                       // khe trống / lô chưa xây
                  const [pu, pv] = at(l + wq / 2, sc), [w, d] = size(wq - 0.6, dep * R(0.9, 1));
                  put(pu, pv, w, d, Math.floor(R(3, 7)), rng() < 0.08 ? 'ruin' : 'tube');
                  l += wq;
                }
              }
              occupied.push({ x: tf((u0 + u1) / 2, (v0 + v1) / 2)[0], z: tf((u0 + u1) / 2, (v0 + v1) / 2)[1], r: Math.max(la, lb) * 0.5 });
              continue;
            }
            let kind, floors, wl, ws;
            if (r < 0.22 + (central ? 0.24 : 0.12)) {
              kind = 'office'; floors = Math.floor(central ? R(8, 14) : R(6, 10));
              wl = Math.min(LL * R(0.6, 0.85), 200); ws = Math.min(SS * R(0.65, 0.9), 170);
            } else if (r < 0.64) {
              kind = 'apartment'; floors = Math.floor(R(5, 10));
              wl = Math.min(LL * R(0.84, 0.95), 320); ws = Math.min(SS * R(0.5, 0.75), 130);
            } else if (r < 0.89) {
              kind = 'shop'; floors = Math.floor(R(3, 7));
              wl = Math.min(LL * R(0.8, 0.93), 280); ws = Math.min(SS * R(0.6, 0.85), 180);
            } else {
              kind = 'ruin'; floors = Math.floor(R(3, 8));
              wl = Math.min(LL * R(0.7, 0.9), 260); ws = Math.min(SS * R(0.55, 0.8), 140);
            }
            const [pu, pv] = at((L0 + L1) / 2, (S0 + S1) / 2), [w, d] = size(wl, ws);
            if (put(pu, pv, w, d, floors, kind)) occupied.push({ x: tf(pu, pv)[0], z: tf(pu, pv)[1], r: Math.max(w, d) * 0.5 });
          }
        }
      }
    } else {
      // Làng / xóm dọc theo đường: nhà 2 bên đường (quay mặt ra đường), vườn rào phía sau, ruộng / bãi cỏ ngoài rìa
      const villageKind = { DESERT: 'mudbrick', JUNGLE: 'stilt', HIGHLAND: 'stone', RIVER_LAKE: 'farm' }[type];
      const fenceKind = { DESERT: 'mud', JUNGLE: 'bamboo', HIGHLAND: 'stone', RIVER_LAKE: 'wood' }[type] || 'wood';
      const borderKind = { DESERT: 'mud', JUNGLE: 'hedge', HIGHLAND: 'stone', RIVER_LAKE: 'hedge' }[type] || 'wood';
      const crops = { DESERT: ['dry'], JUNGLE: ['cassava', 'rice'], HIGHLAND: ['wheat', 'hay', 'wheat'], RIVER_LAKE: ['rice', 'rice', 'veg'] }[type] || ['veg'];
      // điểm cách điểm i0 một quãng d (có dấu) dọc đường + hướng tiếp tuyến theo chiều tăng chỉ số
      const along = (rd, i0, d) => {
        const P = rd.pts, dir = d >= 0 ? 1 : -1;
        let i = i0, rem = Math.abs(d);
        for (;;) {
          const j = i + dir;
          if (j < 0 || j >= P.length) return null;
          const L = Math.hypot(P[j][0] - P[i][0], P[j][1] - P[i][1]) || 1;
          if (rem <= L) {
            const t = rem / L;
            return { x: P[i][0] + (P[j][0] - P[i][0]) * t, z: P[i][1] + (P[j][1] - P[i][1]) * t, tx: (P[j][0] - P[i][0]) * dir / L, tz: (P[j][1] - P[i][1]) * dir / L };
          }
          rem -= L; i = j;
        }
      };
      const fenceRect = (cx, cz, tx, tz, hw, hd, kind, skipFront) => {
        // hình chữ nhật quay theo (tx, tz); cạnh "trước" (phía -n) chừa trống / chừa cổng
        const nx = -tz, nz = tx, c = (u, v) => [cx + tx * u + nx * v, cz + tz * u + nz * v];
        const A = c(-hw, -hd), B2 = c(hw, -hd), C2 = c(hw, hd), D2 = c(-hw, hd);
        const seg = (p, q) => props.fences.push({ x0: p[0], z0: p[1], x1: q[0], z1: q[1], kind });
        seg(B2, C2); seg(C2, D2); seg(D2, A);
        if (!skipFront) { const g1 = c(-6, -hd), g2 = c(6, -hd); seg(A, g1); seg(g2, B2); }   // cổng ở giữa cạnh trước
      };
      const nVill = Math.round((B.villages + (type === 'DESERT' ? 1 : 2)) * AREA);
      for (let v = 0, tries = 0; v < nVill && tries < 300; tries++) {
        const rd = roads[Math.floor(rng() * roads.length)];
        if (!rd) break;
        if (rd.pts.length < 6) continue;
        const i0 = Math.floor(R(0.15, 0.85) * rd.pts.length);
        const p = rd.pts[i0];
        if (!clearOfKeys(p[0], p[1], 120) || !freeOf(p[0], p[1], 150) || isWater(p[0], p[1])) continue;
        const span = R(220, 380);   // nhà thật to hơn -> làng trải dài hơn
        let placed = 0;
        for (let d = -span; d <= span; d += R(100, 140)) {
          const st = along(rd, i0, d);
          if (!st) continue;
          const nx = -st.tz, nz = st.tx;
          for (const sd of [1, -1]) {
            if (rng() > 0.78) continue;
            const w = R(64, 96), dd = R(52, 76), off = rd.width / 2 + R(14, 24) + dd / 2;
            const x = st.x + nx * sd * off, z = st.z + nz * sd * off;
            if (!roadClear(x, z, dd * 0.5 + 2) || !freeOf(x, z, Math.max(w, dd) * 0.55) || isWater(x, z) || slopeAt(x, z) > 0.28 || !clearOfKeys(x, z, 30)) continue;
            const ang = Math.atan2(nx * sd, nz * sd);   // nhà quay mặt ra đường
            buildings.push({ x, z, w, d: dd, floors: rng() < 0.25 ? 2 : 1, angle: ang, kind: rng() < 0.16 ? 'ruin' : villageKind });
            occupied.push({ x, z, r: Math.max(w, dd) * 0.6 });
            placed++;
            // vườn rào phía sau nhà
            if (rng() < 0.7) {
              const gd = R(40, 64), gw = w / 2 + R(4, 12), go = off + dd / 2 + 4 + gd / 2;
              const gx = st.x + nx * sd * go, gz = st.z + nz * sd * go;
              if (freeOf(gx, gz, Math.max(gw, gd / 2)) && !isWater(gx, gz) && roadClear(gx, gz, gd / 2) && clearOfKeys(gx, gz, 20)) {
                fenceRect(gx, gz, st.tx * sd, st.tz * sd, gw, gd / 2, fenceKind, true);
                occupied.push({ x: gx, z: gz, r: Math.max(gw, gd / 2) * 0.8 });
              }
            }
          }
        }
        if (placed < 2) continue;
        // ruộng phía ngoài làng (1-3 thửa), bờ là hàng rào / bờ rào cây / tường đá
        const st0 = along(rd, i0, 0);
        const nF = Math.floor(R(1, 4));
        for (let k = 0; k < nF; k++) {
          const sd = rng() < 0.5 ? 1 : -1, nx = -st0.tz * sd, nz = st0.tx * sd;
          const fw = R(110, 190), fd = R(80, 130), dd = R(-span * 0.7, span * 0.7);
          const st = along(rd, i0, dd) || st0;
          const off = rd.width / 2 + R(95, 130) + fd / 2;
          const x = st.x + nx * off, z = st.z + nz * off;
          const rr = Math.hypot(fw, fd) / 2;
          if (!freeOf(x, z, rr * 0.85) || !clearOfKeys(x, z, rr) || !roadClear(x, z, fd / 2) || isWater(x, z) || slopeAt(x, z) > 0.2) continue;
          if (isWater(x + st.tx * fw / 2, z + st.tz * fw / 2) || isWater(x - st.tx * fw / 2, z - st.tz * fw / 2)) continue;
          props.fields.push({ x, z, w: fw, d: fd, angle: Math.atan2(st.tz, st.tx), crop: pick(rng, crops) });
          fenceRect(x, z, st.tx * sd, st.tz * sd, fw / 2, fd / 2, borderKind, false);
          occupied.push({ x, z, r: rr * 0.9 });
        }
        // chốt bao cát 2 bên đường đầu làng
        if (rng() < 0.6) {
          const st = along(rd, i0, span + 24) || along(rd, i0, -span - 24);
          if (st) for (const sd of [1, -1]) {
            const nx = -st.tz * sd, nz = st.tx * sd, o = rd.width / 2 + 10;
            const ax = st.x + nx * o, az = st.z + nz * o;
            if (freeOf(ax, az, 14)) props.sandbags.push({ x0: ax - st.tx * 14, z0: az - st.tz * 14, x1: ax + st.tx * 14 + nx * 6, z1: az + st.tz * 14 + nz * 6, layers: 3 });
          }
        }
        v++;
      }
      // Kho / nhà chứa trong căn cứ phía sau khu xuất kích
      for (const side of [1, -1]) {
        for (let k = 0; k < 3; k++) {
          const x = R(-700, 700) * K, z = side * R(1240, 1420) * K;
          const w = R(130, 180), d = R(90, 120);
          if (!freeOf(x, z, 110) || !roadClear(x, z, 70)) continue;
          buildings.push({ x, z, w, d, floors: 1, angle: 0, kind: 'hangar' });
          occupied.push({ x, z, r: 110 });
        }
      }
    }

    // 5c. Đá tảng (cụm)
    const rocks = [];
    const clusterN = Math.max(4, Math.floor(B.rocks * AREA / 7));
    for (let c = 0, tries = 0; c < clusterN && tries < 400; tries++) {
      const cx = R(-1450, 1450) * K, cz = R(-1450, 1450) * K;
      if (!clearOfKeys(cx, cz, 60) || isWater(cx, cz) || !freeOf(cx, cz, 50)) continue;
      const n = Math.floor(R(3, 10));
      for (let k = 0; k < n; k++) {
        const a = R(0, 6.28), dd = R(0, 70);
        const x = cx + Math.cos(a) * dd, z = cz + Math.sin(a) * dd;
        const r = k === 0 ? R(12, 24) : R(3, 12);
        if (!roadClear(x, z, r) || !freeOf(x, z, r) || isWater(x, z)) continue;
        rocks.push({ x, z, r, h: r * R(0.7, 1.3), rot: R(0, 6.28), kind: type === 'HIGHLAND' ? 'granite' : type === 'DESERT' ? 'sandstone' : 'stone' });
        if (r > 9) occupied.push({ x, z, r });
      }
      c++;
    }

    // 5c'. Xác xe bỏ lại (xe tăng / xe tải / xe bọc thép cháy rụi): ven đường & giữa chiến trường
    {
      const nW = Math.round((type === 'URBAN' ? 8 : Math.floor(R(7, 11))) * AREA);
      for (let t = 0, n = 0; n < nW && t < 200; t++) {
        let x, z, ang;
        if (rng() < 0.6 && roads.length) {
          const rd = roads[Math.floor(rng() * roads.length)], i = Math.floor(R(0.1, 0.9) * (rd.pts.length - 1));
          const a = rd.pts[i], b = rd.pts[i + 1];
          if (!b) continue;
          const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, tx = (b[0] - a[0]) / L, tz = (b[1] - a[1]) / L, sd = rng() < 0.5 ? 1 : -1;
          const off = rd.width / 2 + R(10, 22);
          x = a[0] - tz * sd * off; z = a[1] + tx * sd * off; ang = Math.atan2(tz, tx) + R(-0.7, 0.7) + (rng() < 0.5 ? Math.PI : 0);
        } else {
          x = R(-1200, 1200) * K; z = R(-700, 700) * K; ang = R(0, 6.28);
        }
        if (!clearOfKeys(x, z, 30) || !freeOf(x, z, 20) || isWater(x, z) || slopeAt(x, z) > 0.35 || !roadClear(x, z, 8)) continue;
        props.wrecks.push({ x, z, angle: ang, kind: pick(rng, ['tank', 'tank', 'truck', 'apc']), tilt: R(-0.06, 0.06), roll: R(-0.08, 0.08), turretRot: R(-1.2, 1.2), smoke: rng() < 0.35 });
        occupied.push({ x, z, r: 20 });
        n++;
      }
    }

    // 5d. Bụi rậm (vùng ngụy trang) + cây
    const bushes = sample(Math.round(B.bushes * AREA), 260, 3000 * AREA, (x, z) => {
      const r = R(55, 90);
      if (!clearOfKeys(x, z, r * 0.6) || isWater(x, z) || !roadClear(x, z, r * 0.4)) return false;
      return { r };
    });
    const trees = [];
    const forestMask = (x, z) => fbm(noise2, (x + 333) * 0.0011, (z - 77) * 0.0011, 3);
    const treeOK = (x, z, r) => clearOfKeys(x, z, r) && roadClear(x, z, r + 2) && freeOf(x, z, r) && !isWater(x, z);
    // Cây trong bụi rậm
    for (const b of bushes) {
      const n = type === 'JUNGLE' ? 14 : type === 'DESERT' ? 4 : 7;
      for (let k = 0; k < n; k++) {
        const a = R(0, 6.28), dd = Math.sqrt(rng()) * b.r * 0.9;
        const x = b.x + Math.cos(a) * dd, z = b.z + Math.sin(a) * dd;
        if (!treeOK(x, z, 4)) continue;
        trees.push({ x, z, kind: pick(rng, B.treeKinds), s: R(0.8, 1.25), rot: R(0, 6.28) });
      }
    }
    // Cây phân bố theo mặt nạ rừng / ốc đảo / ven sông
    let attempts = 0;
    const nTrees = Math.round(B.trees * AREA);
    while (trees.length < nTrees && attempts < nTrees * 12) {
      attempts++;
      const x = R(-1560, 1560) * K, z = R(-1560, 1560) * K;
      let p;
      if (type === 'DESERT') {
        // Ốc đảo: cây cọ quanh trũng ẩm; xương rồng / cây khô rải rác
        p = smooth(0.25, 0.5, forestMask(x, z)) * 0.9 + 0.04;
      } else if (type === 'URBAN') {
        const nr = nearestRoad(x, z, 60);
        p = nr && nr.d > nr.road.width / 2 + 3 && nr.d < nr.road.width / 2 + 10 ? 0.5 : 0.01; // hàng cây vỉa hè
      } else if (type === 'RIVER_LAKE') {
        const rn = river ? river.near(x, z) : null, dr = rn ? rn.d - rn.hw : 1e9;
        p = (dr > 10 && dr < 140 ? 0.55 : 0) + smooth(0.1, 0.45, forestMask(x, z)) * 0.6;
      } else if (type === 'HIGHLAND') {
        const h = H(x, z);
        p = smooth(0.0, 0.35, forestMask(x, z)) * (h < 95 ? 1 : 0.25);
      } else {
        p = 0.25 + smooth(-0.2, 0.3, forestMask(x, z)) * 0.75;
      }
      if (rng() > p) continue;
      const kind = type === 'DESERT' ? (forestMask(x, z) > 0.3 ? 'palm' : pick(rng, ['cactus', 'deadTree', 'acacia', 'cactus'])) : pick(rng, B.treeKinds);
      if (!treeOK(x, z, kind === 'jungle' ? 5 : 3.5)) continue;
      if (slopeAt(x, z) > 0.75) continue;
      trees.push({ x, z, kind, s: R(0.75, 1.3), rot: R(0, 6.28) });
    }

    // 5b. KHOẢNH RỪNG RẬM: cây mọc dày (cách nhau ~16) -> che khuất tầm nhìn, thân cây chặn đạn.
    // Chỗ ẩn nấp / áp sát đánh úp; viền rừng méo tự nhiên, không đè đường / nhà / cứ điểm.
    const forests = [];
    const NSTAND = Math.round(({ DESERT: 1, URBAN: 1, JUNGLE: 6, HIGHLAND: 5, RIVER_LAKE: 4 }[type] || 3) * AREA);
    const standKinds = { DESERT: ['palm'], URBAN: ['broadleaf', 'broadleaf', 'cypress'], JUNGLE: ['jungle', 'jungle', 'broadleaf'],
      HIGHLAND: ['pine'], RIVER_LAKE: ['broadleaf', 'broadleaf', 'willow'] }[type] || B.treeKinds;
    for (let tries = 0; forests.length < NSTAND && tries < 400; tries++) {
      const cx = R(-1350, 1350) * K, cz = R(-1350, 1350) * K, r = type === 'DESERT' || type === 'URBAN' ? R(70, 100) : R(95, 150);
      if (isWater(cx, cz) || !clearOfKeys(cx, cz, r + 30) || slopeAt(cx, cz) > 0.45) continue;
      if (forests.some(f => Math.hypot(f.x - cx, f.z - cz) < f.r + r + 200)) continue;
      // viền méo: bán kính theo góc = r * (1 + tổng vài điều hòa pha ngẫu nhiên)
      const hm = [[2, R(0, 6.28), R(0.08, 0.18)], [3, R(0, 6.28), R(0.06, 0.14)], [5, R(0, 6.28), R(0.03, 0.08)]];
      const edge = a => 1 + hm.reduce((acc, h) => acc + Math.sin(a * h[0] + h[1]) * h[2], 0);
      const stretch = R(0.75, 1.3), rot = R(0, 3.14), cr = Math.cos(rot), sr = Math.sin(rot);
      const f = { x: cx, z: cz, r: r * Math.max(stretch, 1 / stretch) * 1.2, n: 0 };
      const step = 16;
      for (let gx = -r * 1.6; gx <= r * 1.6; gx += step) for (let gz = -r * 1.6; gz <= r * 1.6; gz += step) {
        const lx = gx + R(-6, 6), lz = gz + R(-6, 6);
        const ex = (lx * cr + lz * sr) / stretch, ez = (-lx * sr + lz * cr) * stretch;
        const dd = Math.hypot(ex, ez) / r;
        if (dd > edge(Math.atan2(ez, ex))) continue;
        if (dd > 0.75 && rng() < 0.35) continue;     // bìa rừng thưa dần
        const x = cx + lx, z = cz + lz;
        const kind = pick(rng, standKinds);
        if (!treeOK(x, z, kind === 'jungle' ? 5 : 4) || slopeAt(x, z) > 0.75) continue;
        trees.push({ x, z, kind, s: R(0.8, 1.3), rot: R(0, 6.28) });
        f.n++;
      }
      if (f.n > 20) forests.push(f);
    }

    // 6. MẶT TRỜI THEO GIỜ TRONG NGÀY
    const tod = pick(rng, ['morning', 'noon', 'afternoon', 'afternoon', 'golden']);
    const elevDeg = { morning: R(20, 32), noon: R(52, 66), afternoon: R(34, 46), golden: R(12, 19) }[tod];
    const sun = { timeOfDay: tod, elevation: elevDeg * Math.PI / 180, azimuth: R(0, Math.PI * 2) };

    const ms = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
    return {
      type, seed, size: SIZE, res: RES, cell: CELL, heights, surface,
      bases, capture: CAP, roads, river, lakes, bridges, bunkers, strongholds, layout, buildings, rocks, bushes, trees, forests, props, sun,
      genMs: Math.round(ms),
      // độ cao cảnh nền tại điểm bất kỳ (kể cả ngoài bản đồ): cùng công thức với lưới trong bản đồ -> nối liền ở mép
      outer: { rimFoot, wall: RIM_WALL, sea: OUT.sea, seaLevel: OUT.sea ? 0.2 : null, ext: OUTER_EXT, heightAt: (x, z) => riverCut ? riverCut(x, z, baseHeight(x, z)) : baseHeight(x, z) },
      // tra cứu nhanh mặt đường cho động lực học xe
      roadAt(x, z) {
        const nr = nearestRoad(x, z, 60);
        return nr && nr.d < nr.road.width / 2 ? nr.road : null;
      },
      nearestRoad
    };
  }

  // ---------------------------------------------------------------------------
  // HÌNH HỌC PHỤ TRỢ
  // ---------------------------------------------------------------------------
  function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
  // Hàng đợi ưu tiên nhị phân cho A*
  class MinHeap {
    constructor() { this.k = []; this.v = []; }
    get size() { return this.k.length; }
    push(key, val) {
      const k = this.k, v = this.v;
      let i = k.length;
      k.push(key); v.push(val);
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (k[p] <= key) break;
        k[i] = k[p]; v[i] = v[p]; i = p;
      }
      k[i] = key; v[i] = val;
    }
    pop() {
      const k = this.k, v = this.v;
      const top = v[0];
      const lk = k.pop(), lv = v.pop();
      if (k.length) {
        let i = 0;
        const n = k.length;
        for (;;) {
          let c = 2 * i + 1;
          if (c >= n) break;
          if (c + 1 < n && k[c + 1] < k[c]) c++;
          if (k[c] >= lk) break;
          k[i] = k[c]; v[i] = v[c]; i = c;
        }
        k[i] = lk; v[i] = lv;
      }
      return top;
    }
  }
  function segDist(px, pz, ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az;
    const L = dx * dx + dz * dz;
    const t = L > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L)) : 0;
    return { d: Math.hypot(px - (ax + dx * t), pz - (az + dz * t)), t };
  }
  function distToPolyline(pts, x, z) {
    let best = Infinity;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      if ((Math.abs(a[0] - x) > 400 && Math.abs(b[0] - x) > 400) || (Math.abs(a[1] - z) > 400 && Math.abs(b[1] - z) > 400)) continue;
      const d = segDist(x, z, a[0], a[1], b[0], b[1]).d;
      if (d < best) best = d;
    }
    return best;
  }
  function chaikin(pts) {
    if (pts.length < 3) return pts;
    const out = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
      out.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    out.push(pts[pts.length - 1]);
    return out;
  }
  function resample(pts, step) {
    const out = [pts[0]];
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      let a = out[out.length - 1];
      const b = pts[i];
      let d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      while (acc + d >= step) {
        const t = (step - acc) / d;
        a = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
        out.push(a);
        d = Math.hypot(b[0] - a[0], b[1] - a[1]);
        acc = 0;
      }
      acc += d;
    }
    const last = pts[pts.length - 1];
    if (Math.hypot(last[0] - out[out.length - 1][0], last[1] - out[out.length - 1][1]) > 2) out.push(last);
    return out;
  }
  function sampleH(heights, x, z) {
    const gx = (x + HALF) / CELL, gz = (z + HALF) / CELL;
    const ix = Math.max(0, Math.min(RES - 1, Math.floor(gx))), iz = Math.max(0, Math.min(RES - 1, Math.floor(gz)));
    const fx = Math.max(0, Math.min(1, gx - ix)), fz = Math.max(0, Math.min(1, gz - iz));
    const N = RES + 1;
    const h00 = heights[iz * N + ix], h10 = heights[iz * N + ix + 1], h01 = heights[(iz + 1) * N + ix], h11 = heights[(iz + 1) * N + ix + 1];
    return (h00 * (1 - fx) + h10 * fx) * (1 - fz) + (h01 * (1 - fx) + h11 * fx) * fz;
  }

  // Bộ nhớ đệm: sinh 1 lần cho mỗi (loại, seed), dùng lại khi vào trận
  const cache = new Map();
  function get(type, seed) {
    const key = type + ':' + (seed >>> 0) + ':' + layout;
    if (!cache.has(key)) {
      if (cache.size > 4) cache.delete(cache.keys().next().value);
      cache.set(key, generate(type, seed));
    }
    return cache.get(key);
  }

  function setLayout(l) { layout = l === 'STRONGHOLDS' ? 'STRONGHOLDS' : 'CLASSIC'; }
  return { generate, get, setLayout, getLayout: () => layout, STRONGHOLD_SITES, mulberry32, makeNoise, fbm, ridged, sampleH, SIZE, HALF, RES, CELL, OUTER_EXT, CAPTURE, BIOME, randomSeed: () => (Math.random() * 4294967296) >>> 0 };
})();

if (typeof window !== 'undefined') window.MapGen = MapGen;
