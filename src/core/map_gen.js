/**
 * BỘ SINH BẢN ĐỒ NGẪU NHIÊN THEO SEED (dữ liệu thuần, không phụ thuộc Three.js)
 * - Cùng (loại map, seed) -> cùng một bản đồ trên mọi máy (đồng bộ nhiều người chơi chỉ cần gửi seed)
 * - Chạy trước khi vào trận (trong lúc ghép trận) để khi vào là có ngay
 *
 * Kết quả: lưới độ cao + mặt phủ (đường / nước / bê tông), mạng đường A* bám địa hình (có ổ gà, gợn sóng),
 * sông hồ, vị trí boong-ke, nhà cửa, cây, bụi, đá, cầu và mặt trời theo giờ trong ngày.
 * Quy ước tọa độ giống game: bản đồ SIZE x SIZE (16200) tâm tại gốc, phe XANH ở z dương, phe ĐỎ ở z âm.
 * - prefetch(loại, seed): sinh trong luồng phụ (Web Worker) lúc chờ ghép trận -> get() sau đó lấy ngay từ bộ nhớ đệm,
 *   luồng chính chỉ còn dựng hình 3D. Luồng phụ chạy chính mã nguồn hàm MapGenFactory (không cần tải thêm tệp).
 */
// Toàn bộ module nằm trong 1 hàm tự chứa (không dùng biến ngoài) -> MapGenFactory.toString() dựng được luồng phụ
function MapGenFactory() {
  const SIZE = 16200;
  const RES = 672;                 // số ô lưới mỗi cạnh (~24 đơn vị / ô: bản đồ gấp đôi, giữ số đỉnh vừa sức máy)
  const HALF = SIZE / 2;
  const CELL = SIZE / RES;
  const OUTER_EXT = 17400;         // nửa cạnh vùng cảnh nền ngoài bản đồ (xem Backdrop); >= HALF + tầm nhìn camera (9000)
  // Bố cục gốc thiết kế cho bản đồ 3600: K giãn khoảng cách giữa các điểm chiến thuật, AREA nhân số lượng vật thể
  // (giữ mật độ cây / đá / làng như cũ); kích thước từng vật thể, đồi, đường... giữ nguyên
  const K = SIZE / 3600, AREA = K * K;
  const O0 = HALF - 1800;          // cảnh ngoài bản đồ (vành núi, bờ biển, đảo xa) dời ra theo mép bản đồ
  const RIM_WALL = 650;            // tường giữ xe vô hình nằm trên sườn vành núi: cách chân núi bấy nhiêu (spg.js)

  // Điểm chiến thuật cố định của luật chơi
  const CAPTURE = [{ x: -800 * K, z: 0 }, { x: 0, z: 0 }, { x: 800 * K, z: 0 }];
  const SPAWN = { blue: { z0: 800 * K, z1: 1180 * K }, red: { z0: -1180 * K, z1: -800 * K }, halfX: 430 * K };
  // Bố cục "3 cứ điểm trên 3 đồi" (hình tam giác): trục xuyên qua của 3 khoang lệch nhau đúng 120° (B dọc trục z,
  // A -30°, C 210°) -> 3 trục gặp nhau giữa tam giác, miệng +1 của cả 3 hầm cùng nhìn vào khu công trình ở giữa.
  // angle: hướng trục xuyên qua của khoang (cos -> x, sin -> z); hill: độ cao đỉnh đồi so với nền xung quanh
  const STRONGHOLD_SITES = [
    // giãn rộng (A, C lùi về phía xanh, B lùi về phía đỏ, chân đồi vẫn ngoài khu xuất kích) chừa chỗ cho công trình ở giữa
    { id: 'A', x: -620 * K, z: 330 * K, angle: -Math.PI / 6, hill: 72 },
    { id: 'B', x: 0, z: -400 * K, angle: Math.PI / 2, hill: 96 },
    { id: 'C', x: 620 * K, z: 330 * K, angle: Math.PI * 7 / 6, hill: 58 }
  ];
  // LỐI VÀO CỬA HẦM CỨ ĐIỂM (hệ cục bộ cứ điểm: f dọc trục xuyên qua tính ra từ tâm, r ngang; 8 đơn vị = 1 m).
  // Khớp Strongholds.S (strongholds.js): END = HB + RUN = 206 là mép cuối sân bê tông giữa 2 tường cánh.
  //  - sân phễu bê tông (hardstand) dài APRON = 13 m: miệng rộng HW0 (phủ cả chân 2 tường cánh, ~46 m) thu dần kiểu
  //    loa kèn về cổ NECK (nửa rộng 3,75 m -> mặt bê tông 7,5 m)
  //  - đường vào ROAD_W = 6,5 m (2 làn xe quân sự 3,5-3,7 m) chạy THẲNG theo trục hầm STRAIGHT = 19 m từ cổ phễu ra tới
  //    điểm nhập APP; mọi tuyến A* tới miệng hầm đó đều dồn về APP rồi nhập chung một đường vào
  const PORTAL = { END: 206, APRON: 104, NECK: 30, HW0: 184.2, STRAIGHT: 152, ROAD_W: 52 };
  PORTAL.NECK_F = PORTAL.END + PORTAL.APRON;          // 310
  PORTAL.APP = PORTAL.NECK_F + PORTAL.STRAIGHT;       // 462
  // nửa bề rộng mặt bê tông sân phễu tại |f| (loa kèn: loe gắt sát miệng hầm, gần cổ gần như song song)
  const portalHalf = af => {
    const u = Math.max(0, Math.min(1, (af - PORTAL.END) / PORTAL.APRON));
    return PORTAL.NECK + (PORTAL.HW0 - PORTAL.NECK) * Math.pow(1 - u, 2.2);
  };
  // CÔNG TRÌNH BỐI CẢNH lớn ở giữa 3 cứ điểm (landmarks.js + src/gameplay/landmarks/*.js dựng hình): mỗi bản đồ 1 công
  // trình cố định (MAP_LANDMARK) — đảo / sông hồ: căn cứ tên lửa hạt nhân, sa mạc: trận địa phòng không, thành phố: trạm
  // biến áp cao thế, rừng: hầm vũ khí sinh học, cao nguyên: đài điều khiển radar vệ tinh.
  // Đặt tại trọng tâm tam giác A B C; mặt trước nhìn về cứ điểm B. angle: hướng mặt trước (cos -> x, sin -> z);
  // hu / hv: nửa dài mặt bằng san nền theo trục trước-sau / ngang
  // (8 đơn vị = 1 m: căn cứ hầm phóng 80 x 130 m, hầm sinh học 50 x 40 m, trận địa 48 x 48 m)
  const LANDMARK_SITE = {
    x: Math.round(STRONGHOLD_SITES.reduce((a, c) => a + c.x, 0) / 3),
    z: Math.round(STRONGHOLD_SITES.reduce((a, c) => a + c.z, 0) / 3),
    angle: -Math.PI / 2
  };
  const LANDMARK_KINDS = {
    // căn cứ hầm phóng tên lửa hạt nhân
    nuke: { hu: 320, hv: 520, back: 60 },
    // hầm nghiên cứu vũ khí sinh học
    bio: { hu: 300, hv: 470, back: 50 },
    // trận địa tên lửa phòng không
    sam: { hu: 320, hv: 520, back: 60 },
    // trung tâm năng lượng nguyên tử (lò nhiệt hạch tokamak)
    power: { hu: 320, hv: 520, back: 60 },
    // đài điều khiển radar vệ tinh
    radar: { hu: 320, hv: 520, back: 60 }
  };
  // DANH MỤC XE DÂN SỰ — nguồn duy nhất để rải xe trên bản đồ. Phải nằm trong MapGenFactory: luồng phụ (Blob) và
  // server (worker_threads) chỉ chạy đúng mã nguồn file này, rải xe theo cùng rng -> mọi máy cùng 1 bộ xe.
  // Thêm mẫu xe mới: thêm 1 dòng ở đây + dựng model cùng id (props.js CAR / CivilCars); chưa có model thì vẽ tạm bằng sedan.
  //   w: độ phổ biến; size: small | mid | large (ngõ hẹp nhiều xe nhỏ, bãi / phố lớn nhiều xe to);
  //   tags: work (khu kho xưởng), taxi (đại lộ / trung tâm), fixedColor (màu sơn theo mẫu, không lấy bảng màu)
  const CAR_CATALOG = [
    { id: 'sedan', w: 3.0, size: 'mid' },
    { id: 'hatch', w: 2.0, size: 'small' },
    { id: 'suv', w: 1.2, size: 'large' },
    { id: 'van', w: 0.8, size: 'large', tags: ['work'] },
    { id: 'pickup', w: 0.8, size: 'large', tags: ['work'] },
    { id: 'taxi', w: 0.5, size: 'mid', tags: ['taxi', 'fixedColor'] }
  ];
  const CAR_COLORS = 12;      // số màu trong bảng màu sơn (props.js CAR_COL)
  const CAR_KINDS_MAX = 8;    // tối đa số mẫu xe trong 1 bản đồ: mỗi mẫu là 1 bộ hình riêng (lệnh vẽ, bộ nhớ) -> giới hạn khi N lớn
  // hệ số theo chỗ đặt xe (ctx: cls phố / use ô đất / lot bãi đỗ)
  const carCtxK = (c, ctx) => {
    let k = 1;
    const tags = c.tags || [];
    if (ctx.cls === 'local' || ctx.cls === 'alley') k *= c.size === 'small' ? 1.6 : c.size === 'large' ? 0.55 : 1;
    if (ctx.cls === 'avenue' && tags.includes('taxi')) k *= 2.5;
    if (ctx.use === 'industrial') k *= tags.includes('work') ? 3 : 0.7;
    if (ctx.use === 'suburb') k *= c.size === 'large' ? 1.5 : 1;
    if ((ctx.use === 'suburb' || ctx.use === 'industrial') && tags.includes('taxi')) k *= 0.2;
    return k;
  };
  // bảng mẫu xe của 1 bản đồ: rút không lặp theo trọng số, tối đa CAR_KINDS_MAX mẫu
  const carPalette = (rng) => {
    const pool = CAR_CATALOG.slice(), out = [];
    while (pool.length && out.length < CAR_KINDS_MAX) {
      let t = rng() * pool.reduce((a, c) => a + c.w, 0), i = 0;
      while (i < pool.length - 1 && (t -= pool[i].w) > 0) i++;
      out.push(pool.splice(i, 1)[0]);
    }
    return out;
  };
  // 1 xe: mẫu theo trọng số x ngữ cảnh, màu, seed biến thể riêng (bụi / gỉ / hư hại) — đúng 3 lần rng mỗi xe
  const pickCar = (rng, palette, ctx) => {
    let tot = 0;
    const ws = palette.map(c => { const v = c.w * carCtxK(c, ctx || {}); tot += v; return v; });
    let t = rng() * tot, i = 0;
    while (i < ws.length - 1 && (t -= ws[i]) > 0) i++;
    const c = palette[i], color = Math.floor(rng() * CAR_COLORS), seed = (rng() * 4294967296) >>> 0;
    return { kind: c.id, color: (c.tags || []).includes('fixedColor') ? -1 : color, seed };
  };

  const MAP_LANDMARK = { RIVER_LAKE: 'nuke', DESERT: 'sam', URBAN: 'power', JUNGLE: 'bio', HIGHLAND: 'radar' };
  let landmarkKind = null;          // null = theo seed; đặt cố định để thử (setLandmark)
  const LM_BLEND = 100;            // dải chuyển tiếp từ mặt bằng san nền ra địa hình tự nhiên
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
      // gradient 4 góc viết thẳng (không tạo hàm con mỗi lần gọi: hàm này chạy hàng chục triệu lần mỗi bản đồ)
      const p0 = perm[xi], p1 = perm[xi + 1];
      const h00 = perm[p0 + yi] % 12, h10 = perm[p1 + yi] % 12, h01 = perm[p0 + yi + 1] % 12, h11 = perm[p1 + yi + 1] % 12;
      const n00 = GX[h00] * xf + GY[h00] * yf, n10 = GX[h10] * (xf - 1) + GY[h10] * yf;
      const n01 = GX[h01] * xf + GY[h01] * (yf - 1), n11 = GX[h11] * (xf - 1) + GY[h11] * (yf - 1);
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
  // light = true: chỉ dựng phần rẻ (tham số theo seed, vành núi, dáng sông) để lấy các hàm tra cứu outer.heightAt /
  // rimFoot / river.near — dùng khi nhận bản đồ sinh trong luồng phụ (hydrate), không tính lưới độ cao / đường / vật thể
  function generate(type, seed, light = false) {
    type = BIOME[type] ? type : 'DESERT';
    seed = (seed >>> 0) || 1;
    const B = BIOME[type];
    const SH = layout === 'STRONGHOLDS';
    const CAP = SH ? STRONGHOLD_SITES.map(c => ({ x: c.x, z: c.z })) : CAPTURE;
    const keyR = SH ? 345 : 110;   // bán kính cấm đặt cây / nhà / đá quanh cứ điểm
    // Công trình bối cảnh (chỉ bố cục 3 cứ điểm): G (cốt san nền) tính sau khi tìm tuyến đường, trước khi khắc đường
    const lmKind = LANDMARK_KINDS[landmarkKind] ? landmarkKind : MAP_LANDMARK[type];
    // back: lùi tâm công trình ra sau (xa cứ điểm B mà mặt trước nhìn về) cho mặt bằng lớn không lấn chân đồi B
    const lmFx = Math.cos(LANDMARK_SITE.angle), lmFz = Math.sin(LANDMARK_SITE.angle), lmBack = LANDMARK_KINDS[lmKind].back || 0;
    const landmarks = SH ? [landmarkDetail(Object.assign({ kind: lmKind }, LANDMARK_SITE, LANDMARK_KINDS[lmKind],
      { x: LANDMARK_SITE.x - lmFx * lmBack, z: LANDMARK_SITE.z - lmFz * lmBack, fx: lmFx, fz: lmFz }))] : [];
    // khoảng cách ra ngoài mặt bằng san nền (hình chữ nhật xoay, 0 = bên trong)
    const lmOut = (L, x, z) => {
      const dx = x - L.x, dz = z - L.z;
      return Math.hypot(Math.max(0, Math.abs(dx * L.fx + dz * L.fz) - L.hu), Math.max(0, Math.abs(-dx * L.fz + dz * L.fx) - L.hv));
    };
    let rng = mulberry32(seed ^ hashStr(type));
    const noise = makeNoise(rng);
    const noise2 = makeNoise(rng);
    const R = (a, b) => a + rng() * (b - a);
    // Mỗi giai đoạn đặt vật thể dùng chuỗi ngẫu nhiên riêng (rng / R / pick đổi theo): một nhánh rẽ khác đi ở giai đoạn
    // này (kể cả do sai số dấu phẩy động giữa các trình duyệt) không kéo lệch dây chuyền mọi thứ sinh sau nó
    const stage = name => { rng = mulberry32((seed ^ hashStr(type + ':' + name)) >>> 0); };
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
        // nền phố không trũng dưới mực nước kênh (đô thị có mặt nước khi có kênh đào: chỗ đất < 0,1 thành vũng ngập)
        h = Math.max(4, h);
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
    for (const L of landmarks) KEYS.push([L.x, L.z, Math.hypot(L.hu, L.hv) + LM_BLEND + 200]);
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
    // CHÂN VÀNH NÚI = ranh giới thung lũng chiến trường: hình dạng ngẫu nhiên tự nhiên mỗi map (không tròn, không vuông):
    // lượn sóng nhiều tầng trên toạ độ bị bẻ cong + mũi núi lấn sâu ở chỗ ngẫu nhiên. Không lấn vào cứ điểm / khu xuất
    // kích, không chạm mép giữ xe.
    // Phần lượn sóng chỉ phụ thuộc HƯỚNG nhìn từ tâm (toạ độ bẻ cong = d * hàm của hướng) -> tính sẵn thành bảng theo
    // góc; rimFoot được gọi cho mọi đỉnh lưới + mọi lần đặt vật nên không tính lại 6 lần nhiễu mỗi lần gọi
    const RFN = 8192, RFT = new Float32Array(RFN + 1);
    for (let a = 0; a <= RFN; a++) {
      const t = a / RFN * Math.PI * 2, x = Math.cos(t), z = Math.sin(t);
      // bẻ cong toạ độ trước khi lấy nhiễu: đường chân núi méo theo vùng, không toả đều từ tâm
      const wx = x + 0.45 * on(x * 0.9 + 4.4, z * 0.9 - 2.2), wz = z + 0.45 * on(x * 0.9 - 7.1, z * 0.9 + 1.3);
      // bán kính nền như nhau mọi hướng (không bám khung vuông), hình dạng do nhiễu quyết định; nền đủ nhỏ để
      // phần lồi ra ít khi chạm giới hạn mép (chỗ đó bị ép phẳng thành cạnh thẳng)
      // vài mũi núi lấn sâu vào lòng thung lũng ở chỗ ngẫu nhiên (mỗi map khác nhau)
      RFT[a] = HALF * 0.79 + 340 * angN(wx, wz, 1.3, 11.3) + 210 * angN(wx, wz, 3.1, 3.1) + 80 * angN(wx, wz, 7.3, 5.5)
        - 1100 * Math.pow(Math.max(0, angN(wx, wz, 2.4, 6.6) - 0.08), 1.3);
    }
    function rimFoot(x, z) {
      const u = (Math.atan2(z, x) / (Math.PI * 2) + 1) % 1;
      const ur = u * RFN, ir = Math.floor(ur), fr = ur - ir;
      let f = RFT[ir] + (RFT[ir + 1] - RFT[ir]) * fr + 18 * on(x * 0.004 + 2, z * 0.004);
      // không lấn vào cứ điểm / khu xuất kích: max mềm với bán kính tối thiểu theo hướng (bảng keyMin)
      const uk = u * 720, ik = Math.floor(uk) % 720, fk = uk - Math.floor(uk);
      const minA = KM[ik] * (1 - fk) + KM[(ik + 1) % 720] * fk;
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

    if (!light) for (let iz = 0; iz < N; iz++) {
      for (let ix = 0; ix < N; ix++) {
        heights[iz * N + ix] = baseHeight(-HALF + ix * CELL, -HALF + iz * CELL);
      }
    }
    const H = (x, z) => sampleH(heights, x, z);

    // 1b. BA NGỌN ĐỒI CỨ ĐIỂM: đỉnh bằng phẳng (cốt nền G) rộng ~200, sườn thoải xe leo được, chân đồi lượn sóng tự nhiên
    const strongholds = [];
    if (SH && !light) {
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
            if (d0 > 940) continue;
            const ang = Math.atan2(dz, dx);
            // sống đồi thoải chạy dọc trục hầm ra mỗi miệng: đỉnh bằng kéo dài tới ~48 m theo trục (đường vào thẳng, gần
            // như bằng phẳng trước cửa hầm), sườn dọc trục thoải hơn -> đường lên đồi men theo sống đồi về điểm nhập
            const ca = Math.cos(c.angle), sa = Math.sin(c.angle), fA = Math.abs(dx * ca + dz * sa), rA = Math.abs(-dx * sa + dz * ca);
            const ax = Math.exp(-(rA / 180) * (rA / 180)) * smooth(150, 300, fA);
            const d = d0 * (1 - 0.25 * ax) * (1 + (1 - 0.8 * ax) * (0.16 * Math.sin(ang * 3 + c.G) + 0.1 * noise(Math.cos(ang) * 1.7 + c.x * 0.01, Math.sin(ang) * 1.7)));
            // sườn đồi phía giáp mặt bằng công trình ở giữa thoải dần ra (không lấn vào mặt bằng)
            const k = (1 - smooth(290, 680, d)) * (landmarks.length ? smooth(10, 220, lmOut(landmarks[0], x, z)) : 1);
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
      // hồ đầu nguồn: ngay dưới chân vành núi phía thượng nguồn (dò từ giữa thung lũng ra tới chân núi trên tuyến sông)
      let zSrc = -dir * HALF * 0.45;   // sông dài ít nhất ~nửa thung lũng; lỡ gặp mũi núi thì hồ nằm trong thung lũng sông xẻ qua núi
      while (Math.abs(zSrc) < HALF * 0.85 && Math.hypot(cx, zSrc) < rimFoot(cx, zSrc) - 120) zSrc -= dir * 20;
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
        // ngang tầm các cứ điểm: không lấn lên đồi cứ điểm, không chạm chân vành núi phía ngoài (chuyển mềm theo z;
        // ra khỏi tầm đó sông uốn tự do trong thung lũng xẻ núi)
        const w = 1 - smooth(1500, 1900, Math.abs(z));
        if (w > 0 && !o) {
          const inner = 1040 * K, hw = halfW(z), outer = Math.sqrt(Math.max(0, (rimFoot(x, z) - hw - 170) ** 2 - z * z));
          const xc = sg * Math.max(inner, Math.min(Math.max(inner, outer), Math.abs(x)));
          x += (xc - x) * w;
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
      // d / hw: khoảng cách & nửa bề rộng sông đã tra sẵn (vòng lặp lưới tra 1 lần dùng chung) — bỏ trống thì tự tra
      riverCut = (x, z, h, d, hw) => {
        if (d === undefined) ({ d, hw } = river.near(x, z));
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
        const L = { x: (k ? 1 : -1) * R(900, 1350) * K, z: (k ? -1 : 1) * R(420, 720) * K, r: R(150, 230) };
        // hồ nằm trọn trong lòng thung lũng (không vắt qua chân vành núi)
        const lim = rimFoot(L.x, L.z) - L.r - 220, d = Math.hypot(L.x, L.z);
        if (d > lim) { L.x *= lim / d; L.z *= lim / d; }
        lakes.push(L);
      }
      lakes.push(srcLake);
      if (!light) for (let iz = 0; iz < N; iz++) {
        for (let ix = 0; ix < N; ix++) {
          const x = -HALF + ix * CELL, z = -HALF + iz * CELL;
          const { d, hw } = river.near(x, z);
          let carve = null;
          const cut = riverCut(x, z, heights[iz * N + ix], d, hw);
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
    // độ cao cảnh nền tại điểm bất kỳ (kể cả ngoài bản đồ): cùng công thức với lưới trong bản đồ -> nối liền ở mép
    const heightAt = (x, z) => riverCut ? riverCut(x, z, baseHeight(x, z)) : baseHeight(x, z);
    if (light) return { rimFoot, heightAt, riverNear: river ? river.near : null };
    // kênh đào đô thị (thẳng theo trục U của lưới phố): khoảng cách vuông góc tới tim kênh
    const canals = [];
    const canalDist = (x, z) => {
      let d = Infinity;
      for (const c of canals) if (Math.abs(-x * Math.sin(c.rot) + z * Math.cos(c.rot)) < c.vEnd) d = Math.min(d, Math.abs(x * Math.cos(c.rot) + z * Math.sin(c.rot) - c.a));
      return d;
    };
    const isWater = (x, z) => river ? (((n) => n.d < n.hw)(river.near(x, z)) || lakes.some(L => Math.hypot(x - L.x, z - L.z) < L.r) || H(x, z) < 1.2)
      : canals.length ? canalDist(x, z) < canals[0].hw + 4 : false;
    // cao độ bờ kênh phía gần điểm (x, z) — đường qua cầu bám cao độ bờ, không tụt xuống lòng kênh; -Infinity nếu xa kênh
    const canalBankH = (x, z) => {
      for (const c of canals) {
        const ca = Math.cos(c.rot), sa = Math.sin(c.rot), u = x * ca + z * sa, v = -x * sa + z * ca;
        if (Math.abs(v) > c.vEnd + 24 || Math.abs(u - c.a) > c.hw + 40) continue;
        const ub = c.a + (u >= c.a ? 1 : -1) * (c.hw + 48);
        return H(ub * ca - v * sa, ub * sa + v * ca);
      }
      return -Infinity;
    };

    // 3. MẠNG ĐƯỜNG
    const roads = [];
    const bridges = [];
    // Đường vào cửa hầm cứ điểm: đoạn thẳng theo trục hầm từ điểm nhập APP tới dưới cổ sân phễu (sân bê tông phủ lên
    // phần cuối). portal: { id, sg } để vẽ vai đường sỏi / rãnh thoát nước & nhận diện ở terrain.js
    const portalAxis = (c, sg) => ({ ux: Math.cos(c.angle) * sg, uz: Math.sin(c.angle) * sg });
    const portalApp = (c, sg) => { const a = portalAxis(c, sg); return { x: c.x + a.ux * PORTAL.APP, z: c.z + a.uz * PORTAL.APP }; };
    const portalRoad = (c, sg, kind) => {
      const a = portalAxis(c, sg), f0 = PORTAL.APP, f1 = PORTAL.NECK_F - 1, n = Math.ceil((f0 - f1) / 14);
      const pts = [];
      for (let i = 0; i <= n; i++) { const f = f0 + (f1 - f0) * i / n; pts.push([c.x + a.ux * f, c.z + a.uz * f]); }
      const rd = { pts, width: PORTAL.ROAD_W, kind, access: true, portal: { id: c.id, sg } };
      roads.push(rd);
      return rd;
    };
    // Vùng cấm tuyến A* quanh cứ điểm (ụ đất, sân phễu, đoạn đường thẳng vào cửa): đường không bò qua đồi cứ điểm và
    // chỉ được tới miệng hầm từ PHÍA NGOÀI điểm nhập (không đi song song chồng lên đường vào)
    const portalBlocked = (x, z, gcell) => {
      for (const c of strongholds) {
        const dx = x - c.x, dz = z - c.z, ca = Math.cos(c.angle), sa = Math.sin(c.angle);
        const f = Math.abs(dx * ca + dz * sa), r = Math.abs(-dx * sa + dz * ca);
        if (f < PORTAL.APP - gcell * 1.5 && r < 250) return true;
        if (f < PORTAL.APP - gcell * 0.3 && r < gcell * 0.9) return true;
      }
      return false;
    };
    if (type === 'URBAN') {
      // ĐÔ THỊ: lưới phố PHÂN CẤP theo bề rộng thật (8 đơn vị = 1 m), ô phố 55-130 m, các trục phố hơi lệch góc nhau
      // (không song song tăm tắp); 1 kênh đào chạy dọc 1 cánh (Bắc - Nam) có cầu ở đại lộ / phố chính, phố thường cụt ở bờ
      // kênh. Kênh dừng (cống ngầm) cách khu xuất kích 2 phe ~500, quá đó trục kênh là phố chính. Toạ độ (u, v) = lưới xoay góc rot; trục U: u = a + b·v (chạy dọc v), trục V: v = a + b·u
      const rot = R(-0.12, 0.12), cr = Math.cos(rot), sr = Math.sin(rot);
      const tf = (u, v) => [u * cr - v * sr, u * sr + v * cr];
      const EXT = 1560 * K;
      // cw: bề rộng lòng đường, walk: vỉa hè mỗi bên, lanes: số làn kẻ vạch, r: bán kính bo bó vỉa góc phố
      const URB = {
        avenue: { cw: 120, walk: 32, lanes: 4, r: 64 },   // đại lộ: 15 m, 4 làn, vỉa hè 4 m
        main: { cw: 76, walk: 24, lanes: 2, r: 48 },      // phố chính: 9,5 m, vỉa hè 3 m
        local: { cw: 52, walk: 16, lanes: 2, r: 36 },     // phố thường: 6,5 m, vỉa hè 2 m
        canal: { cw: 150, walk: 28, lanes: 0, r: 0 }      // kênh: mặt nước 19 m, kè + lối dạo bờ kênh 3,5 m mỗi bên
      };
      const mkLines = () => {
        const L = [{ a: R(-50, 50), cls: 'avenue' }];
        for (const dir of [1, -1]) {
          let q = L[0].a, n = 0;
          for (;;) {
            const gap = R(880, 1320), nx = q + dir * gap;
            if (Math.abs(nx) > EXT) break;
            if (gap > 1040) L.push({ a: q + dir * gap * R(0.44, 0.56), cls: 'local' });   // chia đôi khoảng rộng
            n++;
            L.push({ a: nx, cls: n % 3 === 0 ? 'avenue' : 'main' });   // cứ 3 phố chính có 1 đại lộ vành đai
            q = nx;
          }
        }
        L.sort((p, q) => p.a - q.a);
        for (const l of L) l.b = l.cls === 'avenue' ? 0 : R(-0.012, 0.012);
        return L;
      };
      const lu = mkLines(), lv = mkLines();
      // kênh đào: thay 1 trục U (không phải đại lộ) ở cánh ngẫu nhiên, cách tâm 1350-1850 (ngoài mặt bằng công trình giữa)
      const want = (rng() < 0.5 ? -1 : 1) * R(1350, 1850);
      let ci = -1;
      lu.forEach((l, i) => { if (l.cls !== 'avenue' && (ci < 0 || Math.abs(l.a - want) < Math.abs(lu[ci].a - want))) ci = i; });
      const canalL = lu[ci];
      canalL.cls = 'canal'; canalL.b = 0;
      const CH = URB.canal.cw / 2, VEND = SPAWN.blue.z0 - 500;
      canals.push({ a: canalL.a, hw: CH, quay: URB.canal.walk, rot, vEnd: VEND, pts: [tf(canalL.a, -VEND), tf(canalL.a, VEND)] });
      // ô phố cạnh trục kênh: đoạn có kênh dùng bề rộng kênh, quá 2 đầu kênh là phố chính
      const clsAt = (L, v0, v1) => L.cls !== 'canal' ? L.cls : (v1 > -VEND && v0 < VEND ? 'canal' : 'main');
      // đường theo trục: trục U lấy mẫu theo v, trục V lấy mẫu theo u (mỗi 14 đơn vị)
      const mkRoad = (L, alongV) => {
        const C = URB[L.cls], pts = [];
        for (let s = -EXT; s <= EXT; s += 14) pts.push(alongV ? tf(L.a + L.b * s, s) : tf(s, L.a + L.b * s));
        return { pts, width: C.cw, kind: 'asphalt', cls: L.cls, walk: C.walk, lanes: C.lanes };
      };
      for (const L of lu) {
        if (L.cls !== 'canal') { roads.push(mkRoad(L, true)); continue; }
        // 2 đoạn phố chính nối tiếp trục kênh quá 2 đầu kênh
        const rd = mkRoad(Object.assign({}, L, { cls: 'main' }), true), M = URB.main.cw / 2 + URB.main.walk;
        for (const part of [rd.pts.filter(p => -p[0] * sr + p[1] * cr < -VEND - M), rd.pts.filter(p => -p[0] * sr + p[1] * cr > VEND + M)])
          if (part.length >= 2) roads.push(Object.assign({}, rd, { pts: part }));
      }
      for (const L of lv) {
        const rd = mkRoad(L, false);
        // chỗ cắt kênh: u của giao điểm (trục V: v = a + b·u, kênh u = canalL.a)
        const uc = canalL.a, vc = L.a + L.b * uc, [bx, bz] = tf(uc, vc);
        if (Math.abs(vc) > VEND + 40) { roads.push(rd); continue; }   // ngoài đoạn có kênh
        if (L.cls === 'avenue' || L.cls === 'main') {
          const dx = cr - L.b * sr, dz = sr + L.b * cr;   // hướng tuyến trong toạ độ thế giới
          bridges.push({ x: bx, z: bz, angle: Math.atan2(dx, dz), length: 2 * (CH + URB.canal.walk) + 24, width: rd.width + Math.round(rd.walk * 1.5), walk: Math.round(rd.walk * 0.75), lanes: rd.lanes, urban: true });
          roads.push(rd);
        } else {
          // phố thường cụt ở bờ kênh (dừng ở mép lối dạo)
          const cut = CH + URB.canal.walk + 6, a = [], b = [];
          for (const p of rd.pts) { const u = p[0] * cr + p[1] * sr; (u < uc - cut ? a : u > uc + cut ? b : null)?.push(p); }
          for (const part of [a, b]) if (part.length >= 2) roads.push(Object.assign({}, rd, { pts: part }));
        }
      }
      // ô phố: tứ giác giữa 2 trục U + 2 trục V. curb = mép bó vỉa (mép lòng đường), lot = mép trong vỉa hè (đất xây dựng)
      const xUV = (L, s, M, t) => {
        const a = L.a + s * Math.sqrt(1 + L.b * L.b), c = M.a + t * Math.sqrt(1 + M.b * M.b);
        const u = (a + L.b * c) / (1 - L.b * M.b);
        return tf(u, c + M.b * u);
      };
      const offC = L => URB[L.cls].cw / 2, offL = L => URB[L.cls].cw / 2 + URB[L.cls].walk;
      // đồi cứ điểm (sườn tới ~680 từ tâm): không lát phố / xây ô phố trên sườn dốc, chỉ có đường nối lên miệng hầm
      const nearSH = (x, z) => SH && (portalBlocked(x, z, 0) || strongholds.some(c => Math.hypot(x - c.x, z - c.z) < 720));
      const inSpawn = (x, z) => Math.abs(x) < SPAWN.halfX + 40 && ((z > SPAWN.blue.z0 - 40 && z < SPAWN.blue.z1 + 40) || (z > SPAWN.red.z0 - 40 && z < SPAWN.red.z1 + 40));
      const blocks = [];
      for (let i = 0; i < lu.length - 1; i++) for (let j = 0; j < lv.length - 1; j++) {
        const vS = lv[j].a, vN = lv[j + 1].a;
        const W = Object.assign({}, lu[i], { cls: clsAt(lu[i], vS, vN) }), E = Object.assign({}, lu[i + 1], { cls: clsAt(lu[i + 1], vS, vN) }), S = lv[j], N = lv[j + 1];
        const quad = off => [xUV(W, off(W), S, off(S)), xUV(E, -off(E), S, off(S)), xUV(E, -off(E), N, -off(N)), xUV(W, off(W), N, -off(N))];
        const curb = quad(offC), lot = quad(offL);
        const cx = (curb[0][0] + curb[1][0] + curb[2][0] + curb[3][0]) / 4, cz = (curb[0][1] + curb[1][1] + curb[2][1] + curb[3][1]) / 4;
        const probe = curb.concat(curb.map((p, k) => [(p[0] + curb[(k + 1) % 4][0]) / 2, (p[1] + curb[(k + 1) % 4][1]) / 2]), [[cx, cz]]);
        if (probe.some(p => Math.hypot(p[0], p[1]) > rimFoot(p[0], p[1]) - 50 || nearSH(p[0], p[1]))) continue;
        if (landmarks.some(L => probe.some(p => lmOut(L, p[0], p[1]) < 60) || lmOut(L, cx, cz) < 700)) continue;
        const side = [S.cls, E.cls, N.cls, W.cls];
        const len = k => Math.hypot(curb[(k + 1) % 4][0] - curb[k][0], curb[(k + 1) % 4][1] - curb[k][1]);
        // góc k nằm giữa cạnh k-1 và cạnh k: bo theo phố nhỏ hơn trong 2 phố
        const r = [0, 1, 2, 3].map(k => {
          const a = URB[side[(k + 3) % 4]].r, b = URB[side[k]].r;
          return Math.min(a && b ? Math.min(a, b) : (a || b), 0.3 * Math.min(len(k), len((k + 3) % 4)));
        });
        blocks.push({ curb, lot, side, walk: side.map(c => URB[c].walk), r, cx, cz, use: null, spawn: probe.some(p => inSpawn(p[0], p[1])) });
      }
      // Phân khu theo vị trí: trung tâm cao ốc (cbd), vành giữa hỗn hợp nhà ống / shophouse / chung cư (mixed), ngoại vi
      // biệt thự (suburb), 2 cánh Đông Tây có khu kho xưởng (industrial). Rồi các lô đặc biệt: công viên, quảng trường,
      // trường học, nhà thờ, chợ, bệnh viện, bãi đỗ xe, cây xăng ở góc phố lớn
      for (const B of blocks) {
        if (B.use) continue;
        const d = Math.hypot(B.cx, B.cz), n = fbm(noise2, B.cx * 0.0004 + 3.1, B.cz * 0.0004 - 1.7, 2);
        B.use = d < 1900 ? 'cbd' : (Math.abs(B.cx) > 3600 && d > 3000 && n > 0.12) ? 'industrial' : d > 4700 ? 'suburb' : 'mixed';
      }
      // chọn ngẫu nhiên n ô thoả điều kiện, chưa làm lô đặc biệt
      const pickBlocks = (n, ok) => {
        const C = blocks.filter(B => ok(B) && !B.special), out = [];
        for (let k = 0; k < n && C.length; k++) { const B = C.splice(Math.floor(rng() * C.length), 1)[0]; B.special = true; out.push(B); }
        return out;
      };
      for (const B of pickBlocks(Math.round(blocks.length * 0.08), B => B.use !== 'industrial' && !B.spawn)) B.use = 'park';
      for (const B of pickBlocks(2, B => B.use === 'cbd')) B.use = 'plaza';
      for (const [use, n, from] of [['school', 4, ['mixed', 'suburb']], ['church', 2, ['mixed', 'suburb']], ['market', 2, ['mixed']],
        ['hospital', 1, ['mixed', 'cbd']], ['parking', 3, ['cbd', 'mixed']]])
        for (const B of pickBlocks(n, B => from.includes(B.use) && !B.spawn)) B.use = use;
      // cây xăng: góc ô phố giáp 2 phố có ít nhất 1 phố lớn (khu hỗn hợp / ngoại vi / kho xưởng)
      for (const B of pickBlocks(5, B => ['mixed', 'suburb', 'industrial'].includes(B.use) && B.side.some(c => c === 'avenue' || c === 'main'))) {
        const ks = [0, 1, 2, 3].filter(k => [B.side[k], B.side[(k + 3) % 4]].some(c => c === 'avenue' || c === 'main') && B.side[k] !== 'canal' && B.side[(k + 3) % 4] !== 'canal');
        if (ks.length) B.gas = ks[Math.floor(rng() * ks.length)];
        B.special = false;   // phần còn lại của ô vẫn xây như thường
      }
      // NGÕ: ô hỗn hợp lớn có 1 ngõ 3 m xuyên giữa (nối 2 phố đối diện, dọc trục dài), không vỉa hè / vạch kẻ
      for (const B of blocks) {
        if (B.use !== 'mixed') continue;
        const L = B.lot, l0 = Math.hypot(L[1][0] - L[0][0], L[1][1] - L[0][1]), l1 = Math.hypot(L[2][0] - L[1][0], L[2][1] - L[1][1]);
        if (Math.min(l0, l1) < 560) continue;
        const k = l0 >= l1 ? 1 : 0;   // ngõ nối trung điểm cạnh k và cạnh k + 2 (chạy song song cạnh dài)
        const t = R(0.4, 0.6), C = B.curb;
        const a = [lerp(C[k][0], C[k + 1][0], t), lerp(C[k][1], C[k + 1][1], t)], b = [lerp(C[(k + 3) % 4][0], C[k + 2][0], t), lerp(C[(k + 3) % 4][1], C[k + 2][1], t)];
        const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 14), pts = [];
        for (let i = 0; i <= n; i++) pts.push([lerp(a[0], b[0], i / n), lerp(a[1], b[1], i / n)]);
        roads.push({ pts, width: 24, kind: 'asphalt', cls: 'alley', walk: 0, lanes: 0 });
        B.alley = { k, t };
      }
      roads.urbanGrid = { lu, lv, rot, URB, blocks, canal: canalL };
      // Cắt bỏ đoạn phố ngoài lòng thung lũng (lưới phố trải tới ±1560K, xa hơn chân vành núi: trước đây ~1/3 mặt đường
      // nhựa bò lên sườn núi, dốc dựng) và đoạn xuyên đồi cứ điểm (mặt đường nhựa lộ qua sân bê tông / chui dưới ụ đất)
      {
        const ug = roads.urbanGrid, keep = [];
        const nearSH = (x, z) => SH && (portalBlocked(x, z, 0) || strongholds.some(c => Math.hypot(x - c.x, z - c.z) < 700));
        const cut = (x, z) => Math.hypot(x, z) > rimFoot(x, z) - 30 || nearSH(x, z);
        for (const rd of roads) {
          let run = [];
          const flush = () => { if (run.length >= 2) keep.push(Object.assign({}, rd, { pts: run })); run = []; };
          for (const p of rd.pts) { if (cut(p[0], p[1])) flush(); else run.push(p); }
          flush();
        }
        roads.length = 0; roads.push(...keep); roads.urbanGrid = ug;
        for (let k = bridges.length - 1; k >= 0; k--) {
          const b = bridges[k];
          if (b.urban && (cut(b.x, b.z) || !keep.some(rd => rd.pts.some(p => Math.hypot(p[0] - b.x, p[1] - b.z) < 30)))) bridges.splice(k, 1);
        }
      }
      if (SH) {
        // mỗi miệng hầm có đường vào thẳng theo trục + đoạn nối ra phố gần nhất
        const grid = roads.slice();
        for (const c of strongholds) for (const sg of [1, -1]) {
          portalRoad(c, sg, 'asphalt');
          const A = portalApp(c, sg), ax = portalAxis(c, sg);
          // điểm phố phía ngoài để nối, nối bằng đoạn thẳng xuất phát theo trục: ưu tiên phía trước miệng hầm (dọc sống
          // đồi thoải) và phạt nặng điểm làm đường nối dốc quá ~12% (đổ ngang sườn đồi cứ điểm dốc tới 40%)
          let best = null, bd = Infinity;
          const hA = H(A.x, A.z);
          for (const rd of grid) for (const p of rd.pts) {
            const dx = p[0] - A.x, dz = p[1] - A.z, d = Math.hypot(dx, dz);
            if (d > 1600) continue;
            const fw = (dx * ax.ux + dz * ax.uz) / (d || 1), grade = Math.abs(H(p[0], p[1]) - hA) / (d || 1);
            const score = d * (1.3 - 0.3 * fw) * (1 + 8 * Math.max(0, grade - 0.12));
            if (score < bd) { bd = score; best = p; }
          }
          if (best && Math.hypot(best[0] - A.x, best[1] - A.z) > 20) {
            const B2 = [A.x + ax.ux * 40, A.z + ax.uz * 40];
            const pts = [];
            const add = (a, b) => { const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 14)); for (let i = pts.length ? 1 : 0; i <= n; i++) pts.push([lerp(a[0], b[0], i / n), lerp(a[1], b[1], i / n)]); };
            add([A.x - ax.ux * 40, A.z - ax.uz * 40], B2);
            add(B2, best);
            roads.push({ pts: resample(chaikin(chaikin(pts)), 14), width: 44, kind: 'asphalt', access: true, portalLink: true, cls: 'main', walk: 0, lanes: 2 });
          }
        }
      }
    } else {
      // Tìm đường A* trên lưới thô: ưu tiên chỗ thoải, tránh nước, tận dụng đường có sẵn (tạo ngã ba tự nhiên)
      const G = Math.round(72 * K), gc = SIZE / G;
      const gh = new Float32Array((G + 1) * (G + 1));
      for (let j = 0; j <= G; j++) for (let i = 0; i <= G; i++) gh[j * (G + 1) + i] = H(-HALF + i * gc, -HALF + j * gc);
      // hệ số uốn lượn tự nhiên theo ô (tính sẵn 1 lần thay vì gọi nhiễu cho mỗi cạnh A* duyệt qua)
      const wig = new Float64Array((G + 1) * (G + 1));
      for (let j = 0; j <= G; j++) for (let i = 0; i <= G; i++) wig[j * (G + 1) + i] = 1 + 0.25 * (noise2(i * 0.35, j * 0.35) + 1);
      // bộ nhớ A* theo trạng thái (ô x 8 hướng), cấp 1 lần dùng lại cho mọi tuyến; 8 hướng xếp theo góc (nấc 45°)
      const A_G = new Float32Array((G + 1) * (G + 1) * 8), A_CAME = new Int32Array(A_G.length), A_CLOSED = new Uint8Array(A_G.length);
      const DIR8 = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
      const roadCell = new Uint8Array((G + 1) * (G + 1));
      const waterCell = new Uint8Array((G + 1) * (G + 1));
      if (river) for (let j = 0; j <= G; j++) for (let i = 0; i <= G; i++) if (isWater(-HALF + i * gc, -HALF + j * gc)) waterCell[j * (G + 1) + i] = 1;
      const toCell = (x, z) => [Math.round((x + HALF) / gc), Math.round((z + HALF) / gc)];
      const lmCell = new Uint8Array((G + 1) * (G + 1));
      if (landmarks.length) for (let j = 0; j <= G; j++) for (let i = 0; i <= G; i++) {
        if (landmarks.some(L => lmOut(L, -HALF + i * gc, -HALF + j * gc) < 64)) lmCell[j * (G + 1) + i] = 1;
      }
      // ô cấm quanh cứ điểm (xem portalBlocked); ô đích luôn được phép
      const shCell = new Uint8Array((G + 1) * (G + 1));
      if (SH) for (let j = 0; j <= G; j++) for (let i = 0; i <= G; i++) if (portalBlocked(-HALF + i * gc, -HALF + j * gc, gc)) shCell[j * (G + 1) + i] = 1;
      // tail / head: các điểm nối thêm sau đích / trước điểm đầu (trước khi bo cong) -> tuyến nhập tiếp tuyến vào đường vào cửa hầm
      const route = (a, b, w, kind, noReuse = false, tail = null, head = null) => {
        const [sx, sz] = toCell(a.x, a.z), [ex, ez] = toCell(b.x, b.z);
        const W = G + 1, idx = (i, j) => j * W + i;
        // ước lượng không vượt chi phí thật (đi chung đường cũ rẻ còn 0.55 / đơn vị) -> A* tìm đúng tuyến rẻ nhất, các
        // tuyến nhập vào đường có sẵn như ý đồ thay vì chạy song song
        const hk = noReuse ? gc : gc * 0.55;
        const heur = (i, j) => Math.hypot(i - ex, j - ez) * hk;
        // Trạng thái = (ô, hướng vừa đi tới). turn = số nấc 45° được rẻ mỗi bước: 1 -> khúc quay đầu leo dốc cần >= 3 ô
        // (~150), 2 nhánh khúc cua tay áo không nằm sát nhau thành vách giữa 2 mặt đường lệch cao độ; 4 = tự do (dự phòng)
        const search = turn => {
          A_G.fill(Infinity); A_CAME.fill(-1); A_CLOSED.fill(0);
          const open = new MinHeap(), s0 = idx(sx, sz) * 8;
          for (let d = 0; d < 8; d++) { A_G[s0 + d] = 0; open.push(0, s0 + d); }
          while (open.size) {
            const st = open.pop();
            if (A_CLOSED[st]) continue;
            A_CLOSED[st] = 1;
            const cur = st >> 3, dir = st & 7, ci = cur % W, cj = (cur / W) | 0;
            if (ci === ex && cj === ez) return st;
            for (let dt = -turn; dt <= turn; dt++) {
              const nd = (dir + dt + 8) & 7, di = DIR8[nd][0], dj = DIR8[nd][1];
              const ni = ci + di, nj = cj + dj;
              if (ni < 2 || nj < 2 || ni > G - 2 || nj > G - 2) continue;
              const n = idx(ni, nj);
              if (lmCell[n]) continue;               // mặt bằng công trình: đường đi vòng
              if (shCell[n] && !(ni === ex && nj === ez)) continue;   // đồi cứ điểm / đường vào cửa hầm
              const len = (di && dj ? Math.SQRT2 : 1) * gc;
              const slope = Math.abs(gh[n] - gh[cur]) / len;
              let c = len * (1 + slope * slope * 260 + slope * 8);
              if (waterCell[n]) c += 260;            // vượt sông -> cầu (đắt hơn đi bộ, nhưng không vòng quá xa)
              if (roadCell[n] && !noReuse) c *= 0.55; // đi chung đường cũ
              c *= wig[n];                           // uốn lượn tự nhiên
              const gs = A_G[st] + c, ns = n * 8 + nd;
              if (gs < A_G[ns]) { A_G[ns] = gs; A_CAME[ns] = st; open.push(gs + heur(ni, nj), ns); }
            }
          }
          return -1;
        };
        let goal = search(1);
        if (goal < 0) goal = search(4);
        if (goal < 0) {
          console.warn(`[MapGen] ${type} #${seed}: không tìm được đường (${Math.round(a.x)}, ${Math.round(a.z)}) -> (${Math.round(b.x)}, ${Math.round(b.z)})`);
          return;
        }
        const path = [];
        for (let st = goal; st !== -1; st = A_CAME[st]) {
          const c = st >> 3;
          path.push([-HALF + (c % W) * gc, -HALF + ((c / W) | 0) * gc]); roadCell[c] = 1;
        }
        path.reverse();
        path[0] = [a.x, a.z];
        path[path.length - 1] = [b.x, b.z];
        if (tail) for (const q of tail) path.push(q);
        if (head) path.unshift(...head);
        // Bo cong Chaikin + chia lại mỗi ~14 đơn vị
        let sm = path;
        for (let k = 0; k < 3; k++) sm = chaikin(sm);
        const pts = resample(sm, 14);
        roads.push({ pts, width: w, kind });
      };
      const B0 = bases.blue, R0 = bases.red;
      const sideA = rng() < 0.5;
      if (SH) {
        // Đường lên đồi dẫn tới 2 miệng xuyên qua của mỗi cứ điểm. Mỗi miệng hầm: 1 đường vào thẳng theo trục hầm (rộng
        // 6,5 m) từ điểm nhập APP tới cổ sân phễu bê tông; mọi tuyến tới miệng đó dồn về APP (A* đi chung đường cũ rẻ hơn
        // -> các tuyến nhập nhau từ sớm), đoạn cuối nối tiếp tuyến vào đường vào (không cắm chéo, không chạy song song)
        const [cA, cB, cC] = strongholds;
        for (const c of strongholds) for (const sg of [1, -1]) portalRoad(c, sg, B.roadKind);
        const mouth = (c, sg) => portalApp(c, sg);
        const tailOf = (c, sg) => { const a = portalAxis(c, sg), A = portalApp(c, sg); return [[A.x - a.ux * 35, A.z - a.uz * 35], [A.x - a.ux * 70, A.z - a.uz * 70]]; };
        const toMouth = (from, c, sg, w, head) => route(from, mouth(c, sg), w, B.roadKind, false, tailOf(c, sg), head);
        toMouth(B0, cB, 1, 36);
        toMouth(R0, cB, -1, 36);
        toMouth(mouth(cA, 1), cB, 1, 32, tailOf(cA, 1).reverse());
        toMouth(mouth(cC, 1), cB, 1, 32, tailOf(cC, 1).reverse());
        toMouth(B0, cA, -1, 28);
        toMouth(B0, cC, -1, 28);
        toMouth(R0, cA, -1, 26);
        toMouth(R0, cC, -1, 26);
        // đường nhánh từ ngay mép khu đất (trước cổng) nhập vào mạng đường (đi chung đường cũ -> nhập vào tuyến gần nhất);
        // đánh dấu access: không bị đẩy / cắt khi né mặt bằng công trình -> nối liền tới cổng
        for (const L of landmarks) {
          // đoạn thẳng từ mép khu đất ra khỏi vùng cấm đường (A* không xuất phát được từ trong vùng cấm), rồi tìm đường
          const D = 110, a = { x: L.x + L.fx * L.hu, z: L.z + L.fz * L.hu }, b = { x: L.x + L.fx * (L.hu + D), z: L.z + L.fz * (L.hu + D) };
          const pts = [];
          for (let t = 0; t <= D; t += 14) pts.push([a.x + L.fx * t, a.z + L.fz * t]);
          pts.push([b.x, b.z]);
          const n0 = roads.length;
          roads.push({ pts, width: 24, kind: B.roadKind });
          toMouth(b, cB, 1, 24);
          for (let i = n0; i < roads.length; i++) roads[i].access = true;
        }
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
        stage('crossings');
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

    // 3b. Đường không chạy xuyên mặt bằng công trình bối cảnh. Đường tìm theo A* đã đi vòng; đoạn bo cong lấn vào sát
    //     mặt bằng được đẩy ra ngoài mép (đường vẫn liền mạch). Lưới phố đô thị: cắt bỏ đoạn nằm trong (phố cụt tại rào)
    if (landmarks.length && type !== 'URBAN') {
      for (const rd of roads) {
        if (rd.access) continue;
        const m = rd.width / 2 + 14;
        for (const p of rd.pts) for (const L of landmarks) {
          const dx = p[0] - L.x, dz = p[1] - L.z, f = dx * L.fx + dz * L.fz, r = -dx * L.fz + dz * L.fx;
          const pf = L.hu + m - Math.abs(f), pr = L.hv + m - Math.abs(r);
          if (pf <= 0 || pr <= 0) continue;
          let nf = f, nr = r;
          if (pf < pr) nf = Math.sign(f || 1) * (L.hu + m); else nr = Math.sign(r || 1) * (L.hv + m);
          p[0] = L.x + L.fx * nf - L.fz * nr; p[1] = L.z + L.fz * nf + L.fx * nr;
        }
      }
    }
    if (landmarks.length && type === 'URBAN') {
      const keep = [];
      for (const rd of roads) {
        let run = [];
        const flush = () => { if (run.length >= 2) keep.push(Object.assign({}, rd, { pts: run })); run = []; };
        for (const p of rd.pts) {
          if (landmarks.some(L => lmOut(L, p[0], p[1]) < rd.width / 2 + 6)) flush(); else run.push(p);
        }
        flush();
      }
      if (keep.length !== roads.length || keep.some((r, i) => r.pts !== roads[i].pts)) {
        const ug = roads.urbanGrid;
        roads.length = 0; roads.push(...keep);
        if (ug) roads.urbanGrid = ug;
      }
    }

    // 3b'. KÊNH ĐÀO ĐÔ THỊ: lòng kênh đáy -12 (nước sâu ~1,5 m), lòng kênh sâu hết tới chân tường kè (hw), sườn đất (1 ô lưới)
    //      nằm SAU tường, dưới mặt lát lối dạo (streetscape + terrain.canalQuayAt giữ cao độ bờ) -> tường kè đứng lộ hẳn ra mặt nước,
    //      không còn bãi đất dốc trước chân tường; 2 đầu kênh cắt thẳng (cống ngầm)
    for (const c of canals) {
      const ca = Math.cos(c.rot), sa = Math.sin(c.rot);
      for (let j = 0; j <= RES; j++) for (let i = 0; i <= RES; i++) {
        const x = -HALF + i * CELL, z = -HALF + j * CELL, v = -x * sa + z * ca, d = Math.abs(x * ca + z * sa - c.a);
        if (Math.abs(v) > c.vEnd + 24 || d > c.hw + 8) continue;
        const k = j * N + i, e = 1 - smooth(c.vEnd - 12, c.vEnd + 12, Math.abs(v));
        const bed = lerp(heights[k], -12, (1 - smooth(c.hw - 4, c.hw + 16, d)) * e);
        if (bed < heights[k]) heights[k] = bed;
        if (heights[k] < 0) surface[k] = 2;
      }
    }

    // 3c. CÔNG TRÌNH BỐI CẢNH: san phẳng mặt bằng (cốt G = trung bình địa hình trong mặt bằng, đào chỗ cao đắp chỗ thấp,
    //     ta-luy thoải ra ngoài) TRƯỚC khi khắc đường -> đường ra cổng / đường men theo mép khu đất bám đúng mặt ta-luy.
    //     Ta-luy dài theo độ chênh đào đắp (như lối vào cửa hầm): chênh nhiều thì vuốt dài hơn, không dốc dựng ở cổng
    const LM_SLOPE = 4, LM_DH = 120;    // ta-luy dài thêm 4 đơn vị cho mỗi đơn vị chênh cao (tính tới chênh 120): dốc <= ~26%
    for (const L of landmarks) {
      let sum = 0, n = 0;
      for (let a = -L.hu; a <= L.hu; a += 24) for (let b = -L.hv; b <= L.hv; b += 24) {
        sum += H(L.x + L.fx * a - L.fz * b, L.z + L.fz * a + L.fx * b); n++;
      }
      L.G = Math.round(sum / n * 10) / 10;
      const Rr = Math.hypot(L.hu, L.hv) + LM_BLEND + LM_SLOPE * LM_DH + 30;
      const i0 = Math.max(0, Math.floor((L.x - Rr + HALF) / CELL)), i1 = Math.min(RES, Math.ceil((L.x + Rr + HALF) / CELL));
      const j0 = Math.max(0, Math.floor((L.z - Rr + HALF) / CELL)), j1 = Math.min(RES, Math.ceil((L.z + Rr + HALF) / CELL));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const k = j * N + i, dh = Math.min(LM_DH, Math.abs(heights[k] - L.G));
        const w = 1 - smooth(0, LM_BLEND + LM_SLOPE * dh, lmOut(L, -HALF + i * CELL, -HALF + j * CELL));
        if (w > 0) heights[k] = lerp(heights[k], L.G, w);
      }
    }

    // 4. KHẮC ĐƯỜNG VÀO ĐỊA HÌNH: nền đường phẳng có độ dốc thoải + gồ ghề (ổ gà, gợn sóng, lún vệt bánh)
    const roadIndex = makeRoadIndex(roads), nearestRoad = roadIndex.nearest;
    // Cao độ dọc tuyến: lấy theo địa hình rồi làm trơn để dốc thoải. Đoạn nằm trên / sát đường đã có (nhập vào, đi
    // chung, cắt ngang ở ngã tư) lấy theo cao độ của đường đó -> ngã ba / ngã tư liền mặt, không thành bậc
    // (trước đây mỗi đường làm trơn riêng, ô đất theo đường gần nhất -> bậc tới ~2 m chỗ hai đường gặp nhau)
    const PIN_SH = type === 'URBAN' ? 6 : 26;
    roads.forEach((rd, ri) => {
      const n = rd.pts.length, hs = new Float64Array(n), tg = new Float64Array(n), pin = new Float64Array(n), hwN = rd.width / 2;
      for (let i = 0; i < n; i++) {
        const p = rd.pts[i];
        hs[i] = canals.length ? Math.max(H(p[0], p[1]), canalBankH(p[0], p[1])) : H(p[0], p[1]);
        const nr = ri ? nearestRoad(p[0], p[1], 26 + hwN + PIN_SH) : null;   // chỉ mục mới có các đường trước nó
        if (nr) {
          const hwE = nr.road.width / 2;
          pin[i] = 1 - smooth(hwE, hwE + hwN + PIN_SH, nr.d);
          tg[i] = nr.h;
          hs[i] = lerp(hs[i], tg[i], pin[i]);
        }
      }
      const sm = new Float64Array(n);
      for (let pass = 0; pass < 3; pass++) {
        for (let i = 0; i < n; i++) {
          let s = 0;
          for (let k = -6; k <= 6; k++) s += hs[Math.max(0, Math.min(n - 1, i + k))];
          sm[i] = s / 13;
        }
        for (let i = 0; i < n; i++) hs[i] = pin[i] > 0 ? lerp(sm[i], tg[i], pin[i]) : sm[i];
      }
      rd.heights = Array.from(hs, h => Math.max(h, river ? 1.5 : -Infinity));
      roadIndex.add(ri);
    });
    // Khắc: quét từng đoạn đường, chỉ chạm các ô trong dải mặt đường + lề của chính đường đó (trước đây tra đường gần
    // nhất cho cả ~450 nghìn đỉnh lưới). Mỗi ô giữ nhánh gần nhất + nhánh gần nhì KHÁC (đường khác, hoặc cùng đường
    // nhưng xa dọc tuyến: 2 nhánh khúc cua tay áo leo đồi nằm sát nhau) -> ô giữa 2 nhánh lệch cao độ pha cao độ cả hai
    // thành ta-luy liền, không còn vách dựng ở ranh giới "nhánh nào gần hơn"
    {
      const NN = N * N, shoulder = type === 'URBAN' ? 6 : 26;
      const cD = new Float32Array(NN).fill(Infinity), cR = new Int32Array(NN), cT = new Float32Array(NN), cH = new Float32Array(NN);
      const cD2 = new Float32Array(NN).fill(Infinity), cR2 = new Int32Array(NN), cT2 = new Float32Array(NN), cH2 = new Float32Array(NN);
      const other = (ra, ta, rb, tb) => ra !== rb || Math.abs(ta - tb) > 8;
      roads.forEach((rd, ri) => {
        const P = rd.pts, band = rd.width / 2 + shoulder;
        for (let pi = 0; pi < P.length - 1; pi++) {
          const a = P[pi], b = P[pi + 1];
          const i0 = Math.max(0, Math.ceil((Math.min(a[0], b[0]) - band + HALF) / CELL)), i1 = Math.min(RES, Math.floor((Math.max(a[0], b[0]) + band + HALF) / CELL));
          const j0 = Math.max(0, Math.ceil((Math.min(a[1], b[1]) - band + HALF) / CELL)), j1 = Math.min(RES, Math.floor((Math.max(a[1], b[1]) + band + HALF) / CELL));
          for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
            const k = j * N + i, r = segDist(-HALF + i * CELL, -HALF + j * CELL, a[0], a[1], b[0], b[1]);
            if (r.d > band) continue;
            const d = r.d, t = pi + r.t, h = lerp(rd.heights[pi], rd.heights[pi + 1], r.t);
            if (d < cD[k]) {
              // nhánh gần nhất cũ thành nhánh gần nhì nếu nó là nhánh khác
              if (cD[k] !== Infinity && other(cR[k], cT[k], ri, t)) { cD2[k] = cD[k]; cR2[k] = cR[k]; cT2[k] = cT[k]; cH2[k] = cH[k]; }
              cD[k] = d; cR[k] = ri; cT[k] = t; cH[k] = h;
            } else if (d < cD2[k] && other(cR[k], cT[k], ri, t)) { cD2[k] = d; cR2[k] = ri; cT2[k] = t; cH2[k] = h; }
          }
        }
      });
      for (let i = 0; i < NN; i++) {
        const d = cD[i];
        if (d === Infinity || (surface[i] === 2 && bridges.length)) continue;
        const rd = roads[cR[i]], hw = rd.width / 2, x = -HALF + (i % N) * CELL, z = -HALF + Math.floor(i / N) * CELL;
        const blend = 1 - smooth(hw * 0.8, hw + shoulder, d);
        // pha nhánh gần nhì: 50/50 ngay ranh giới (liền mạch), hết hẳn khi xa hơn nhánh gần nhất 1 nửa bề rộng đường
        const h2w = cD2[i] === Infinity ? 0 : 0.5 * (1 - smooth(0, hw, cD2[i] - d));
        const hRoad = lerp(cH[i], cH2[i], h2w);
        // Mặt đường gồ ghề theo loại: đường đất / bùn có ổ gà sâu & lún vệt bánh, sỏi đá lởm chởm, nhựa có ổ gà nhỏ
        const kind = rd.kind;
        const pot = Math.max(0, noise2(x * 0.045, z * 0.045) - 0.35) * (kind === 'asphalt' ? 1.4 : kind === 'mud' ? 4.2 : 3.0);
        const wash = Math.sin(cT[i] * (kind === 'gravel' ? 2.6 : 1.7)) * (kind === 'asphalt' ? 0.08 : 0.35);
        const rut = (kind === 'asphalt') ? 0 : -0.45 * Math.max(0, Math.cos((d / hw) * Math.PI * 2.2));
        const target = hRoad - pot + wash + rut + (kind === 'asphalt' ? 0.1 : -0.25);
        heights[i] = lerp(heights[i], target, blend);
        if (d < hw) surface[i] = 1;
      }
    }
    // CÔNG TRÌNH BỐI CẢNH: đắp ụ đất phủ hầm sinh học / kè đất quanh bệ phóng phòng không... trên mặt bằng đã san (3c)
    for (const L of landmarks) {
      const Rr = Math.hypot(L.hu, L.hv) + 30;
      const i0 = Math.max(0, Math.floor((L.x - Rr + HALF) / CELL)), i1 = Math.min(RES, Math.ceil((L.x + Rr + HALF) / CELL));
      const j0 = Math.max(0, Math.floor((L.z - Rr + HALF) / CELL)), j1 = Math.min(RES, Math.ceil((L.z + Rr + HALF) / CELL));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = -HALF + i * CELL, z = -HALF + j * CELL, k = j * N + i;
        const dx = x - L.x, dz = z - L.z, f = dx * L.fx + dz * L.fz, r = -dx * L.fz + dz * L.fx;
        const add = landmarkMound(L, f, r);
        if (add > 0) heights[k] += add + (L.silo ? 0 : noise(x * 0.03, z * 0.03) * 1.6 * Math.min(1, add / 20));
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
    // LỐI VÀO CỬA HẦM: san nền theo trắc dọc thiết kế (không còn bám mặt đồi lồi lõm):
    //  - sân phễu bê tông: gần như phẳng, dốc nhẹ ra ngoài (<= 0,6 m trên 13 m) để nước mặt chảy XA cửa hầm
    //  - đường vào: nền đào / đắp theo đường cong trơn (Hermite) từ cổ phễu xuống tới chỗ gặp lại địa hình tự nhiên sau
    //    điểm nhập; mặt cắt ngang phẳng, ta-luy đào / đắp hai bên ~1:2
    //  - 2 rãnh thoát nước nông (~0,25 m) hai bên đường vào, chạy từ cổ phễu xuôi dốc ra ngoài
    for (const c of strongholds) {
      const ca = Math.cos(c.angle), sa = Math.sin(c.angle), FE = PORTAL.APP + 90, Rr = FE + 40;
      const i0 = Math.max(0, Math.floor((c.x - Rr + HALF) / CELL)), i1 = Math.min(RES, Math.ceil((c.x + Rr + HALF) / CELL));
      const j0 = Math.max(0, Math.floor((c.z - Rr + HALF) / CELL)), j1 = Math.min(RES, Math.ceil((c.z + Rr + HALF) / CELL));
      const hw = PORTAL.ROAD_W / 2;
      // trắc dọc mỗi miệng hầm: h(f) tính từ tâm cứ điểm ra ngoài
      const prof = [1, -1].map(sg => {
        const at = (f, r) => H(c.x + ca * sg * f - sa * r, c.z + sa * sg * f + ca * r);
        const hT = (at(FE, -14) + at(FE, 0) + at(FE, 14)) / 3;
        const s1 = Math.max(-0.35, Math.min(0.35, (at(FE + 30, 0) - at(FE - 30, 0)) / 60));
        const dN = Math.max(0, Math.min(5, (c.G - hT) * 0.1));
        const L = FE - PORTAL.NECK_F, p0 = c.G - dN, m0 = -dN * 1.5 / PORTAL.APRON;
        return f => {
          if (f <= PORTAL.END) return c.G;
          if (f <= PORTAL.NECK_F) return c.G - dN * Math.pow((f - PORTAL.END) / PORTAL.APRON, 1.5);
          const t = Math.min(1, (f - PORTAL.NECK_F) / L), t2 = t * t, t3 = t2 * t;
          return (2 * t3 - 3 * t2 + 1) * p0 + (t3 - 2 * t2 + t) * L * m0 + (-2 * t3 + 3 * t2) * hT + (t3 - t2) * L * s1;
        };
      });
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = -HALF + i * CELL, z = -HALF + j * CELL, dx = x - c.x, dz = z - c.z;
        const f0 = dx * ca + dz * sa, f = Math.abs(f0), r = Math.abs(-dx * sa + dz * ca);
        if (f < PORTAL.END - 6 || f > FE || r > PORTAL.HW0 + 80) continue;
        const k = j * N + i, tgt = prof[f0 >= 0 ? 0 : 1](f);
        // mặt bằng phẳng: lòng sân phễu (+ lề) / lòng đường + rãnh; ra ngoài là ta-luy dài theo độ chênh đào đắp
        const flat = Math.max(portalHalf(Math.min(f, PORTAL.NECK_F)) + 6, hw + 18);
        const bank = 24 + 2.2 * Math.abs(heights[k] - tgt);
        const w = (1 - smooth(flat, flat + bank, r)) * (1 - smooth(PORTAL.APP, FE, f));
        if (w > 0) heights[k] = lerp(heights[k], tgt, w);
        if (f > PORTAL.NECK_F - 18 && r > hw && r < hw + 30) {
          const dd = (r - hw - 14) / 5.5;
          heights[k] -= 2.1 * Math.exp(-dd * dd) * smooth(PORTAL.NECK_F - 18, PORTAL.NECK_F + 10, f) * (1 - smooth(PORTAL.APP, FE, f));
        }
      }
    }
    // Đô thị: nền vỉa hè / sân bê tông giữa các tòa nhà
    if (type === 'URBAN') for (let i = 0; i < surface.length; i++) if (surface[i] === 0) surface[i] = 3;

    // 5. ĐẶT VẬT THỂ (Poisson-disk + điều kiện)
    // chỗ đã chiếm {x,z,r}: lưới ô OCC, mỗi vật ghi vào mọi ô khung bao của nó phủ -> freeOf chỉ xét vài ô quanh điểm
    // (trước đây quét cả danh sách hàng nghìn vật cho mỗi cây)
    const OCC = 160, OCN = Math.ceil(SIZE / OCC) + 1;
    const occGrid = new Array(OCN * OCN);
    const occCell = v => Math.max(0, Math.min(OCN - 1, Math.floor((v + HALF) / OCC)));
    const occupied = {
      push(o) {
        for (let j = occCell(o.z - o.r), j1 = occCell(o.z + o.r); j <= j1; j++)
          for (let i = occCell(o.x - o.r), i1 = occCell(o.x + o.r); i <= i1; i++) (occGrid[j * OCN + i] || (occGrid[j * OCN + i] = [])).push(o);
      }
    };
    const freeOf = (x, z, r) => {
      for (let j = occCell(z - r), j1 = occCell(z + r); j <= j1; j++)
        for (let i = occCell(x - r), i1 = occCell(x + r); i <= i1; i++) {
          const L = occGrid[j * OCN + i];
          if (L) for (const o of L) if (!(Math.hypot(o.x - x, o.z - z) > o.r + r)) return false;
        }
      return true;
    };
    function clearOfKeys(x, z, r) {
      if (Math.hypot(x, z) > rimFoot(x, z) - 90 - r) return false;   // chỉ trong lòng thung lũng (trước chân vành núi)
      for (const L of landmarks) if (lmOut(L, x, z) < r + 34) return false;
      for (const c of CAP) if (Math.hypot(x - c.x, z - c.z) < keyR + r) return false;
      if (Math.abs(x) < SPAWN.halfX + r && ((z > SPAWN.blue.z0 - r && z < SPAWN.blue.z1 + r) || (z > SPAWN.red.z0 - r && z < SPAWN.red.z1 + r))) return false;
      return true;
    }
    // xa đường vào cửa hầm / đoạn nối ra phố (đô thị: nhà xếp theo ô phố, không tự né các đường này)
    const portalRoads = roads.filter(rd => rd.portal || rd.portalLink);
    const portalClear = (x, z, r) => {
      for (const rd of portalRoads) for (let i = 0; i < rd.pts.length - 1; i++) {
        const a = rd.pts[i], b = rd.pts[i + 1];
        if (segDist(x, z, a[0], a[1], b[0], b[1]).d < rd.width / 2 + r + 10) return false;
      }
      return true;
    };
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
    // đô thị thêm: canopies (mái che cây xăng), lamps (đèn đường), signals (đèn giao thông), poles (cột điện + dây),
    // cars (xe con đỗ), busStops (nhà chờ xe buýt), crossings (vạch qua đường + vạch dừng), footbridges (cầu vượt bộ hành),
    // junctions (mảng nhựa lòng ngã tư)
    const props = { fences: [], fields: [], wrecks: [], sandbags: [], pits: [], canopies: [], lamps: [], signals: [], poles: [], cars: [], busStops: [], crossings: [], footbridges: [], junctions: [] };
    const urbanTrees = [], urbanCars = [], ghostCars = [];   // cây / xe đỗ trong lô (công viên, sân vườn, bãi xe) — gom vào trees / props.cars sau
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
      stage('pits');
      const bySide = [];
      for (const side of [1, -1]) {
        const want = SH ? 3 : 4, mine = [];
        for (let t = 0; t < 300 && mine.length < want; t++) {
          const x = R(-1150, 1150) * K, z = side * R(260, 820) * K;
          if (!clearOfKeys(x, z, 70) || !roadClear(x, z, 56) || !freeOf(x, z, 60) || isWater(x, z) || slopeAt(x, z) > 0.22) continue;
          // đáy hào phải cao hơn mặt nước (bản đồ có sông / hồ) -> không bị ngập: đất thấp thì đào nông hơn, ụ đất đắp
          // cao hơn bù lại (tổng che chắn đáy hào -> đỉnh ụ vẫn 17 = ~2,1 m, xe vẫn chỉ lộ tháp pháo)
          let depth = 10, berm = 7;
          if (river || lakes.length) {
            depth = Math.min(10, H(x, z) - 4);
            if (depth < 5) continue;
            berm = 17 - depth;
          }
          if (mine.some(q => Math.hypot(q.x - x, q.z - z) < 260)) continue;
          // ưu tiên gò / sống đất (cao hơn vòng xung quanh)
          let ring = 0;
          for (let k = 0; k < 8; k++) ring += H(x + Math.cos(k * 0.785) * 140, z + Math.sin(k * 0.785) * 140);
          if (H(x, z) - ring / 8 < -4 && rng() < 0.75) continue;
          const tx = x * 0.4 + R(-200, 200), tz = -side * 500 * K;
          mine.push({ x, z, angle: Math.atan2(tz - z, tx - x), w: 46, l: 60, depth, berm, side: side > 0 ? 'BLUE' : 'RED' });
        }
        bySide.push(mine);
      }
      // hai phe cùng số hào (phe nào tìm được ít chỗ hơn thì phe kia bỏ bớt)
      const nPit = Math.min(bySide[0].length, bySide[1].length);
      for (const mine of bySide) for (const P of mine.slice(0, nPit)) { props.pits.push(P); occupied.push({ x: P.x, z: P.z, r: 56 }); }
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
      const g = roads.urbanGrid, big = c => c === 'avenue' || c === 'main', RANK = { avenue: 3, main: 2, local: 1, canal: 0 };
      // nhà quay mặt ra phố: trục x cục bộ dọc mặt tiền (w), trục z cục bộ vào sâu trong ô (d); không xét chồng lấn giữa
      // các nhà cùng ô (nhà liền vách), chỉ né cứ điểm / khu xuất kích / đường vào cửa hầm
      const put = (x, z, w, d, floors, angle, kind) => {
        if (w < 24 || d < 24 || !clearOfKeys(x, z, Math.min(w, d) * 0.5) || !portalClear(x, z, Math.hypot(w, d) * 0.5)) return false;
        buildings.push({ x, z, w, d, floors, angle, kind });
        occupied.push({ x, z, r: Math.min(w, d) * 0.5 });
        return true;
      };
      for (const B of g.blocks) {
        const L = B.lot, use = B.use;
        const cx = (L[0][0] + L[1][0] + L[2][0] + L[3][0]) / 4, cz = (L[0][1] + L[1][1] + L[2][1] + L[3][1]) / 4;
        // cạnh k của mép đất xây dựng: gốc A, hướng t, pháp tuyến n hướng vào trong ô, dài len, bề ngang ô across
        const E = [0, 1, 2, 3].map(k => {
          const A = L[k], Q = L[(k + 1) % 4], len = Math.hypot(Q[0] - A[0], Q[1] - A[1]), tx = (Q[0] - A[0]) / len, tz = (Q[1] - A[1]) / len;
          let nx = -tz, nz = tx;
          if ((cx - A[0]) * nx + (cz - A[1]) * nz < 0) { nx = -nx; nz = -nz; }
          return { A, tx, tz, nx, nz, len, ang: Math.atan2(nx, nz), cls: B.side[k], k };
        });
        for (const e of E) {
          const o = E[(e.k + 2) % 4], mx = e.A[0] + e.tx * e.len / 2, mz = e.A[1] + e.tz * e.len / 2;
          e.across = Math.abs((mx - o.A[0]) * o.nx + (mz - o.A[1]) * o.nz);
        }
        const at = (e, s, q) => [e.A[0] + e.tx * s + e.nx * q, e.A[1] + e.tz * s + e.nz * q];
        const putE = (e, s, q, w, d, floors, kind) => { const [x, z] = at(e, s, q); return put(x, z, w, d, floors, e.ang, kind); };
        // mặt trước = cạnh giáp phố lớn nhất (cổng trường, mặt tiền nhà thờ / chợ / bệnh viện)
        const front = E.slice().sort((a, b) => RANK[b.cls] - RANK[a.cls] || b.len - a.len)[0], back = E[(front.k + 2) % 4];
        const wall = (e, s0, s1, q, kind, gate) => {   // tường rào dọc cạnh e (chừa cổng rộng 2*gate ở giữa nếu có)
          const seg = (a, b) => { const p = at(e, a, q), r = at(e, b, q); props.fences.push({ x0: p[0], z0: p[1], x1: r[0], z1: r[1], kind }); };
          if (gate) { const m = (s0 + s1) / 2; seg(s0, m - gate); seg(m + gate, s1); } else seg(s0, s1);
        };
        const fenceAll = (kind, gateEdge) => { for (const e of E) wall(e, 6, e.len - 6, 6, kind, e === gateEdge ? 40 : 0); };
        const scatterTrees = (n, margin, kinds) => {
          for (let i = 0; i < n; i++) {
            const e = E[0], s = R(margin, e.len - margin), q = R(margin, e.across - margin), [x, z] = at(e, s, q);
            urbanTrees.push({ x, z, kind: kinds[Math.floor(rng() * kinds.length)] });
          }
        };

        if (use === 'park' || use === 'plaza') {
          // công viên: cây rải dày + vài cây lá kim; quảng trường: hàng cây quanh mép, giữa lát đá trống
          if (use === 'park') scatterTrees(Math.round(front.len * front.across / 22000), 22, ['broadleaf', 'broadleaf', 'plane', 'cypress']);
          else for (const e of E) for (let s = 40; s < e.len - 40; s += 110) { const [x, z] = at(e, s, 26); urbanTrees.push({ x, z, kind: 'plane' }); }
          continue;
        }
        if (use === 'parking') {
          // bãi đỗ xe: hàng chỗ đỗ vuông góc mép trước (rộng 2,75 m, sâu 5 m), lối đi giữa các hàng
          for (let q = 40; q < front.across - 30; q += 96) for (let s = 24; s < front.len - 24; s += 22) {
            if (rng() > 0.72) continue;
            const [x, z] = at(front, s, q);
            urbanCars.push({ x, z, angle: front.ang + (rng() < 0.5 ? 0 : Math.PI), lot: true, use });
          }
          fenceAll('hedge', front);
          continue;
        }
        if (use === 'school') {
          // trường học: dãy nhà chính 3-4 tầng dọc mép sau + 1 dãy cánh, sân trường ở giữa, tường rào + cổng ở mặt trước
          const d0 = Math.min(110, back.across * 0.35), wing = E[(front.k + 1) % 4];
          putE(back, back.len / 2, 20 + d0 / 2, back.len * 0.78, d0, Math.floor(R(3, 5)), 'school');
          putE(wing, wing.len * 0.42, 20 + 46, Math.max(60, wing.len - d0 - 140) * 0.8, 88, 3, 'school');
          fenceAll('stone', front);
          scatterTrees(6, 60, ['broadleaf']);
          continue;
        }
        if (use === 'church') {
          // nhà thờ: gian chính mái dốc chạy vào sâu trong ô (nóc dọc trục chính), tháp chuông ở mặt trước, sân + tường thấp
          const nave = Math.min(260, front.across - 160), wN = R(100, 120);
          const [x, z] = at(front, front.len / 2, 100 + nave / 2);
          put(x, z, nave, wN, 2, Math.atan2(-front.nz, front.nx), 'church');
          putE(front, front.len / 2, 100 - 32, 64, 64, 5, 'tower');
          fenceAll('stone', front);
          scatterTrees(8, 40, ['cypress', 'broadleaf']);
          continue;
        }
        if (use === 'market') {
          // chợ: nhà lồng mái vòm lớn, dãy shophouse phía sau
          const dM = Math.min(front.across * 0.5, 300);
          putE(front, front.len / 2, 36 + dM / 2, front.len * 0.72, dM, 1, 'market');
          for (let s = 30; s < back.len - 70; s += R(60, 90)) putE(back, s + 32, 60, R(56, 70), Math.min(120, back.across - dM - 90), Math.floor(R(3, 5)), 'shop');
          continue;
        }
        if (use === 'hospital') {
          // bệnh viện: khối chính 6-9 tầng phía sau, khối cánh, sân đỗ xe phía trước
          const dB = Math.min(140, back.across * 0.38), wing = E[(front.k + 1) % 4];
          putE(back, back.len / 2, 20 + dB / 2, back.len * 0.7, dB, Math.floor(R(6, 10)), 'hospital');
          putE(wing, wing.len * 0.45, 20 + 50, Math.min(220, wing.len - dB - 160), 100, Math.floor(R(4, 6)), 'hospital');
          for (let s = 40; s < front.len - 40; s += 22) if (rng() < 0.6) { const [x, z] = at(front, s, 40); urbanCars.push({ x, z, angle: front.ang, lot: true, use }); }
          continue;
        }
        if (use === 'industrial') {
          // kho xưởng: 1-2 nhà kho mái dốc tôn lớn + nhà điều hành nhỏ, tường rào bao quanh, cổng ở mặt trước
          const e = front.len >= E[(front.k + 1) % 4].len ? front : E[(front.k + 1) % 4], o = E[(e.k + 2) % 4];
          const d1 = Math.min(e.across * 0.42, R(170, 280));
          putE(o, o.len / 2, 30 + d1 / 2, Math.min(o.len * 0.8, R(260, 460)), d1, 1, 'warehouse');
          if (e.across - d1 > 300) { const d2 = Math.min(e.across - d1 - 140, R(150, 230)); putE(e, e.len * R(0.55, 0.65), 50 + d2 / 2, Math.min(e.len * 0.55, R(200, 340)), d2, 1, 'warehouse'); }
          putE(e, R(80, 120), 40 + 36, R(96, 128), 72, Math.floor(R(2, 4)), 'office');
          fenceAll('stone', front);
          continue;
        }
        if (use === 'suburb') {
          // biệt thự / nhà vườn 2-3 tầng mái dốc, lùi vào sân trước, cách nhau có vườn, hàng rào cây trước nhà, cây sau vườn
          for (const e of E) {
            const back2 = Math.min(e.across / 2 - 8, 170);
            for (let s = 60 + R(0, 30); s < e.len - 110;) {
              const f = R(84, 112), d = Math.min(R(72, 96), back2 - 40), sb = R(28, 44);
              if (d < 50) break;
              if (putE(e, s + f / 2, sb + d / 2, f, d, rng() < 0.6 ? 2 : 3, 'villa')) {
                wall(e, s - 10, s + f + 10, 6, 'hedge', 14);
                if (rng() < 0.8) { const [x, z] = at(e, s + R(10, f - 10), sb + d + R(18, 30)); urbanTrees.push({ x, z, kind: 'broadleaf' }); }
              }
              s += f + R(28, 50);
            }
          }
          continue;
        }
        // HỖN HỢP / TRUNG TÂM: nhà xây kín chu vi ô (liền vách), nhà góc ở 4 góc, sân trong / ngõ ở giữa (vài cây)
        const cbd = use === 'cbd';
        if (front.across > 380) scatterTrees(Math.floor(R(1, 4)), 170, ['broadleaf', 'broadleaf', 'cypress']);
        const D = E.map(e => Math.max(60, Math.min(e.across / 2 - 6, cbd ? R(140, 200) : big(e.cls) ? R(120, 150) : R(100, 132))));
        if (B.alley) {   // dãy nhà song song ngõ không lấn ra ngõ
          const ka = B.alley.k, la = E[ka].len;
          D[(ka + 3) % 4] = Math.min(D[(ka + 3) % 4], B.alley.t * la - 20);
          D[(ka + 1) % 4] = Math.min(D[(ka + 1) % 4], (1 - B.alley.t) * la - 20);
        }
        const gasK = B.gas === undefined ? -1 : B.gas, GW = 230, GD = 200;
        if (gasK >= 0) {
          // cây xăng ở góc gasK (giữa cạnh gasK-1 và gasK): mái che cột bơm + ki-ốt bán hàng phía sau
          const e = E[gasK];
          const [x, z] = at(e, 24 + 75, 24 + 50);
          props.canopies.push({ x, z, angle: e.ang, w: 150, d: 100 });
          putE(e, 24 + 75, 24 + 100 + 24 + 30, 80, 60, 1, 'shop');
        }
        for (let k = 0; k < 4; k++) {
          const e = E[k], kp = (k + 3) % 4;
          // nhà góc ở góc k (giữa cạnh k-1 và cạnh k): mặt tiền ra cả 2 phố
          if (k !== gasK) {
            const fl = cbd ? Math.floor(R(10, 20)) : Math.floor(R(4, 9));
            putE(e, D[kp] / 2, D[k] / 2, D[kp], D[k], fl, cbd ? 'office' : rng() < 0.75 ? 'shop' : 'apartment');
          }
          let s = k === gasK ? GW : D[kp];
          const s1 = e.len - ((k + 1) % 4 === gasK ? GD : D[(k + 1) % 4]);
          // khe ngõ trên cạnh ngõ cắt qua
          const gap = B.alley && (B.alley.k === k || (B.alley.k + 2) % 4 === k) ? (B.alley.k === k ? B.alley.t : 1 - B.alley.t) * e.len : -1e9;
          while (s1 - s > 30) {
            let f, kind, fl, d = D[k];
            if (cbd) {
              f = R(160, 280); kind = rng() < 0.7 ? 'office' : 'apartment'; fl = Math.floor(R(8, 17));
            } else if (big(e.cls)) {
              if (rng() < 0.25) { f = R(200, 320); kind = 'apartment'; fl = Math.floor(R(6, 11)); }
              else { f = R(56, 96); kind = 'shop'; fl = Math.floor(R(3, 8)); }
            } else {
              f = rng() < 0.6 ? R(34, 40) : R(64, 72); kind = 'tube'; fl = Math.floor(R(3, 7)); d = D[k] * R(0.85, 1);
            }
            f = Math.min(f, s1 - s);
            if (s + f > gap - 16 && s < gap + 16) { s = gap + 16; continue; }   // chừa lối ngõ
            if (f < 30) break;
            if (rng() < 0.07) kind = 'ruin';
            if (!(cbd && rng() < 0.2)) putE(e, s + f / 2, d / 2, f - 0.6, d, fl, kind);   // trung tâm: chừa khoảng sân giữa các cao ốc
            s += f + (cbd ? R(30, 80) : 0);
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
      stage('villages');
      const nVill = Math.round((B.villages + (type === 'DESERT' ? 1 : 2)) * AREA);
      // làng đặt vào nửa (xanh z > 0 / đỏ z < 0) đang ít nhà hơn: đường phân bố lệch (2 cứ điểm A, C nằm nửa xanh, đường
      // phe đỏ cũng vòng sang đó) nên chọn ngẫu nhiên theo đường thì nhà cửa che chắn dồn hết về một phe
      const housesOn = { 1: 0, '-1': 0 };
      for (let v = 0, tries = 0; v < nVill && tries < 300; tries++) {
        const rd = roads[Math.floor(rng() * roads.length)];
        if (!rd) break;
        if (rd.pts.length < 6) continue;
        const want = housesOn[1] <= housesOn[-1] ? 1 : -1;
        let i0 = Math.floor(R(0.15, 0.85) * rd.pts.length);
        for (let k = 0; k < 6 && (rd.pts[i0][1] > 0 ? 1 : -1) !== want; k++) i0 = Math.floor(R(0.15, 0.85) * rd.pts.length);
        const p = rd.pts[i0];
        if ((p[1] > 0 ? 1 : -1) !== want) continue;
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
        housesOn[want] += placed;
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
      stage('hangars');
      for (const side of [1, -1]) {
        for (let k = 0; k < 3; k++) {
          const x = R(-700, 700) * K, z = side * R(1240, 1420) * K;
          const w = R(130, 180), d = R(90, 120);
          if (!freeOf(x, z, 110) || !roadClear(x, z, 70) || Math.hypot(x, z) > rimFoot(x, z) - 160) continue;   // không lên sườn núi
          buildings.push({ x, z, w, d, floors: 1, angle: 0, kind: 'hangar' });
          occupied.push({ x, z, r: 110 });
        }
      }
    }

    // 5c. Đá tảng (cụm)
    stage('rocks');
    const rocks = [];
    const clusterN = Math.max(4, Math.floor(B.rocks * AREA / 7));
    // số lần thử theo số cụm cần đặt (giới hạn cũ 400 lần có từ bản đồ nhỏ: HIGHLAND cần 405 cụm không bao giờ đủ)
    for (let c = 0, tries = 0; c < clusterN && tries < clusterN * 12; tries++) {
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
      stage('wrecks');
      const nW = Math.round((type === 'URBAN' ? 8 : Math.floor(R(7, 11))) * AREA);
      for (let t = 0, n = 0; n < nW && t < nW * 8; t++) {
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
    stage('bushes');
    const bushes = sample(type === 'URBAN' ? 0 : Math.round(B.bushes * AREA), 260, 3000 * AREA, (x, z) => {
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
    stage('trees');
    let attempts = 0;
    const nTrees = type === 'URBAN' ? 0 : Math.round(B.trees * AREA);   // đô thị: cây vỉa hè / công viên đặt ở 5e
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
    stage('forests');
    const forests = [];
    const NSTAND = Math.round(({ DESERT: 1, URBAN: 0, JUNGLE: 6, HIGHLAND: 5, RIVER_LAKE: 4 }[type] || 3) * AREA);
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

    // 5e. ĐỒ VẬT ĐƯỜNG PHỐ (đô thị): đèn đường + cây vỉa hè dọc phố lớn, cột điện + dây dọc phố thường, xe con đỗ sát bó
    //     vỉa, nhà chờ xe buýt trên đại lộ, đèn giao thông ở góc ngã tư phố lớn, vạch qua đường + vạch dừng, cầu vượt bộ
    //     hành qua đại lộ. Chỉ đặt trên vỉa hè có thật (trong ô phố còn giữ) và xa ngã tư / cầu
    if (type === 'URBAN' && roads.urbanGrid) {
      stage('street');
      const g = roads.urbanGrid, U = g.URB, cr = Math.cos(g.rot), sr = Math.sin(g.rot), RANK = { avenue: 3, main: 2, local: 1, alley: 0, canal: 0 };
      const VEND = canals.length ? canals[0].vEnd : Infinity;
      // ô phố theo lưới băm -> tra nhanh điểm nằm trên vỉa hè (trong mép bó vỉa, ngoài mép đất xây dựng)
      const inQuad = (Q, x, z) => {
        let sgn = 0;
        for (let k = 0; k < 4; k++) {
          const a = Q[k], b = Q[(k + 1) % 4], c = (b[0] - a[0]) * (z - a[1]) - (b[1] - a[1]) * (x - a[0]);
          if (c !== 0) { if (sgn && Math.sign(c) !== sgn) return false; sgn = Math.sign(c); }
        }
        return true;
      };
      const BH = 512, bHash = new Map();
      for (const B of g.blocks) {
        const xs = B.curb.map(p => p[0]), zs = B.curb.map(p => p[1]);
        for (let j = Math.floor(Math.min(...zs) / BH); j <= Math.floor(Math.max(...zs) / BH); j++)
          for (let i = Math.floor(Math.min(...xs) / BH); i <= Math.floor(Math.max(...xs) / BH); i++) {
            const k = i * 4096 + j; if (!bHash.has(k)) bHash.set(k, []); bHash.get(k).push(B);
          }
      }
      const onWalk = (x, z) => (bHash.get(Math.floor(x / BH) * 4096 + Math.floor(z / BH)) || []).some(B => inQuad(B.curb, x, z) && !inQuad(B.lot, x, z));
      // các trục: hướng dọc tuyến (thế giới), pháp tuyến trái, giao điểm với các trục kia (tham số s dọc tuyến + hạng phố kia)
      const clsOf = (L, v) => L.cls !== 'canal' ? L.cls : Math.abs(v) < VEND ? 'canal' : 'main';
      const lines = [];
      for (const [list, other, isU] of [[g.lu, g.lv, true], [g.lv, g.lu, false]]) for (const L of list) {
        const du = isU ? L.b : 1, dv = isU ? 1 : L.b, n = Math.hypot(du, dv);
        const dx = (du * cr - dv * sr) / n, dz = (du * sr + dv * cr) / n;
        const P = s => { const u = isU ? L.a + L.b * s : s, v = isU ? s : L.a + L.b * s; return [u * cr - v * sr, u * sr + v * cr]; };
        const X = other.map(M => {
          // giao điểm: trục U (u = a + b v) với trục V (v = c + d u)
          const A = isU ? L : M, Bv = isU ? M : L, u = (A.a + A.b * Bv.a) / (1 - A.b * Bv.b), v = Bv.a + Bv.b * u;
          return { s: isU ? v : u, cls: isU ? M.cls : clsOf(M, v), selfCls: isU ? clsOf(L, v) : L.cls };
        });
        lines.push({ L, isU, dx, dz, nx: -dz, nz: dx, P, X, ang: Math.atan2(dx, dz) });
      }
      const EXT = 1560 * K;
      const nearX = (ln, s, pad) => ln.X.some(x => Math.abs(s - x.s) < U[x.cls].cw / 2 + U[x.cls].walk + pad);
      const onRoad = (x, z, cls) => { const nr = nearestRoad(x, z, 10); return nr && nr.road.cls === cls; };
      const along = (ln, sp, phase, fn) => { for (let s = -EXT + phase; s < EXT; s += sp) fn(s); };
      const lampAt = [];
      for (const ln of lines) {
        const cls = ln.L.cls;
        if (cls === 'canal') continue;
        const C = U[cls], p0 = (s, side, off) => { const c = ln.P(s); return [c[0] + ln.nx * side * off, c[1] + ln.nz * side * off]; };
        if (cls === 'avenue' || cls === 'main') {
          // đèn đường 2 bên, cách 35-37 m, cần đèn vươn ra lòng đường; cây vỉa hè xen giữa 2 cột đèn
          const sp = cls === 'avenue' ? 280 : 296, ph = R(0, sp);
          along(ln, sp, ph, s => {
            if (nearX(ln, s, 14) || !onRoad(...ln.P(s), cls)) return;
            for (const side of [1, -1]) {
              const [x, z] = p0(s, side, C.cw / 2 + 6);
              if (!onWalk(x, z)) continue;
              props.lamps.push({ x, z, angle: Math.atan2(-ln.nx * side, -ln.nz * side), double: false });
              lampAt.push([x, z]);
            }
          });
          along(ln, sp / 2, ph + sp / 4, s => {
            if (nearX(ln, s, 30) || !onRoad(...ln.P(s), cls)) return;
            for (const side of [1, -1]) {
              const [x, z] = p0(s, side, C.cw / 2 + Math.min(14, C.walk * 0.5));
              if (onWalk(x, z)) urbanTrees.push({ x, z, kind: 'plane', street: true });
            }
          });
        }
        if (cls === 'local') {
          // cột điện bê tông 1 bên phố (mép trong vỉa hè), dây điện võng nối các cột liên tiếp
          const side = rng() < 0.5 ? 1 : -1;
          let prev = -1, prevS = -1e9;
          along(ln, R(250, 290), R(0, 250), s => {
            if (nearX(ln, s, 10) || !onRoad(...ln.P(s), cls)) return;
            const [x, z] = p0(s, side, C.cw / 2 + C.walk - 3);
            if (!onWalk(x, z)) { prev = -1; return; }
            props.poles.push({ x, z, angle: ln.ang, link: s - prevS < 330 ? prev : -1 });
            prev = props.poles.length - 1; prevS = s;
          });
        }
        if (cls === 'local' || cls === 'main') {
          // xe con đỗ dọc bó vỉa (chiều xe theo chiều lưu thông bên phải), thưa dần ở phố chính
          const fill = cls === 'local' ? 0.17 : 0.11;
          along(ln, 48, R(0, 48), s => {
            if (nearX(ln, s, 44) || !onRoad(...ln.P(s), cls)) return;
            for (const side of [1, -1]) {
              if (rng() > fill) continue;
              const [x, z] = p0(s, side, C.cw / 2 - 10), [wx, wz] = p0(s, side, C.cw / 2 + 4);
              if (!onWalk(wx, wz) || !freeOf(x, z, 12) || !clearOfKeys(x, z, 0)) continue;
              urbanCars.push({ x, z, angle: side > 0 ? ln.ang + Math.PI : ln.ang, cls });
            }
          });
        }
        {
          // THÀNH PHỐ MA: xe bị bỏ lại giữa lòng đường khi dân chạy loạn — lẻ tẻ chéo làn, có chỗ dồn cả đoạn tắc (xe nối
          // đuôi lệch hàng), có xe húc nhau / leo nửa lên vỉa hè. Chừa ngã tư & cầu; tối thiểu 1 làn còn lọt xe tăng
          // (xe lệch hẳn sang 1 nửa lòng đường)
          const rate = cls === 'avenue' ? 0.2 : cls === 'main' ? 0.15 : 0.09, half = C.cw / 2;
          const nearBridge = (x, z) => bridges.some(b => Math.hypot(b.x - x, b.z - z) < b.length / 2 + 40);
          const put = (s, side, off, ang) => {
            const [x, z] = p0(s, side, off);
            if (nearX(ln, s, 30) || !onRoad(...ln.P(s), cls) || nearBridge(x, z) || !freeOf(x, z, 10) || !clearOfKeys(x, z, 0)) return false;
            if (ghostCars.some(c => Math.hypot(c.x - x, c.z - z) < 30)) return false;
            const c = { x, z, angle: ang, cls };
            ghostCars.push(c); urbanCars.push(c);
            return true;
          };
          along(ln, 64, R(0, 64), s => {
            if (rng() > rate) return;
            const side = rng() < 0.5 ? 1 : -1, dir = side > 0 ? ln.ang + Math.PI : ln.ang;   // theo chiều làn bên phải
            const r = rng();
            if (r < 0.5) {
              // xe lẻ: dừng lệch làn, mũi xe chéo
              put(s, side, R(8, half - 12), dir + R(-0.45, 0.45) + (rng() < 0.1 ? Math.PI : 0));
            } else if (r < 0.75 && cls !== 'local') {
              // đoạn tắc: 2-5 xe nối đuôi trong 1 làn, lệch nhau, khoảng cách không đều
              const n = 2 + Math.floor(rng() * 4), sg = side > 0 ? -1 : 1;
              for (let k = 0, ss = s; k < n; k++, ss += sg * R(40, 56)) put(ss, side, R(14, half - 18), dir + R(-0.22, 0.22));
            } else if (r < 0.88) {
              // 2 xe húc nhau giữa đường: xe sau đâm vào hông / đuôi xe trước, cả 2 xoay lệch
              const a = dir + R(-0.6, 0.6);
              if (put(s, side, R(10, half - 14), a)) put(s + (side > 0 ? -1 : 1) * R(32, 38), side, R(6, half - 10), a + R(-0.9, 0.9));
            } else {
              // xe leo nửa lên vỉa hè (đỗ vội / lao lên tránh)
              put(s, side, half + R(-2, 4), dir + R(-0.35, 0.35) * (rng() < 0.5 ? 1 : -1));
            }
          });
        }
        if (cls === 'avenue') {
          // nhà chờ xe buýt 2 bên so le, cách nhau ~600 m
          along(ln, R(560, 700), R(0, 300), s => {
            if (nearX(ln, s, 70) || !onRoad(...ln.P(s), cls)) return;
            const side = rng() < 0.5 ? 1 : -1, [x, z] = p0(s, side, C.cw / 2 + C.walk * 0.55);
            if (onWalk(x, z) && !lampAt.some(q => Math.hypot(q[0] - x, q[1] - z) < 40)) props.busStops.push({ x, z, angle: Math.atan2(ln.nx * side, ln.nz * side) });
          });
        }
        // VẠCH QUA ĐƯỜNG + VẠCH DỪNG ở mỗi nhánh của ngã tư có phố chính / đại lộ
        for (const X of ln.X) {
          if (X.cls === 'canal' || X.selfCls === 'canal' || (Math.min(RANK[X.cls], RANK[cls]) < 2 && Math.max(RANK[X.cls], RANK[cls]) < 3)) continue;
          for (const sg of [1, -1]) {
            const s = X.s + sg * (U[X.cls].cw / 2 + U[X.cls].walk + 6 + 14), c = ln.P(s);
            if (!onRoad(c[0], c[1], cls)) continue;
            props.crossings.push({ x: c[0], z: c[1], angle: ln.ang, w: C.cw, d: 28 });
            // vạch dừng: nửa lòng đường phía xe đi tới ngã tư (lưu thông bên phải)
            const s2 = s + sg * 26, c2 = ln.P(s2), o = -sg * C.cw / 4;
            props.crossings.push({ x: c2[0] + ln.nx * o, z: c2[1] + ln.nz * o, angle: ln.ang, w: C.cw / 2 - 4, d: 4, stop: true });
          }
        }
      }
      // NGÃ TƯ: hình bình hành nhựa trơn (không vạch) phủ lòng ngã tư + phần góc bo; vỉa hè (cao hơn) che phần thừa
      for (const ln of lines) {
        if (!ln.isU || ln.L.cls === 'canal') continue;
        for (let j = 0; j < g.lv.length; j++) {
          const X = ln.X[j], M = lines.find(o => !o.isU && o.L === g.lv[j]), c = ln.P(X.s);
          if (X.cls === 'canal' || !onRoad(c[0], c[1], ln.L.cls) || !nearestRoad(c[0], c[1], 6)) continue;
          const A = U[ln.L.cls], Bc = U[X.cls], rr = Math.max(A.r, Bc.r);
          // l1: bề dài dọc trục U (= bề ngang phố V + 2 bán kính bo), l2: dọc trục V
          // h1 / h2: nửa bề rộng lòng phố V / phố U (mép bó vỉa), w1 / w2: vỉa hè 2 phố -> terrain vát góc mảng nhựa (không lòi vào lô)
          props.junctions.push({ x: c[0], z: c[1], a1: ln.ang, a2: M.ang, l1: Bc.cw + 2 * rr, l2: A.cw + 2 * rr, h1: Bc.cw / 2, h2: A.cw / 2, w1: Bc.walk, w2: A.walk });
        }
      }
      // ĐÈN GIAO THÔNG: cột ở góc bó vỉa của ô phố tại ngã tư có ít nhất 1 phố lớn, cần đèn vươn ra phố cạnh k
      for (const B of g.blocks) for (let k = 0; k < 4; k++) {
        const ca = B.side[(k + 3) % 4], cb = B.side[k];
        if (ca === 'canal' || cb === 'canal' || Math.min(RANK[ca], RANK[cb]) < 2) continue;   // chỉ ngã tư 2 phố lớn
        const p = B.curb[k], q = B.curb[(k + 1) % 4], ex = q[0] - p[0], ez = q[1] - p[1], el = Math.hypot(ex, ez) || 1;
        let nx = ez / el, nz = -ex / el;   // pháp tuyến cạnh k hướng ra phố
        if ((B.cx - p[0]) * nx + (B.cz - p[1]) * nz > 0) { nx = -nx; nz = -nz; }
        const ix = B.cx - p[0], iz = B.cz - p[1], il = Math.hypot(ix, iz) || 1;
        props.signals.push({ x: p[0] + ix / il * 14, z: p[1] + iz / il * 14, angle: Math.atan2(nx, nz) });
      }
      // CẦU VƯỢT BỘ HÀNH: tối đa 3 cái, giữa các đoạn đại lộ dài, 2 đầu cầu thang đặt trên vỉa hè
      {
        const cand = [];
        for (const ln of lines) {
          if (ln.L.cls !== 'avenue') continue;
          const xs = ln.X.map(x => x.s).sort((a, b) => a - b);
          for (let i = 0; i < xs.length - 1; i++) {
            const s = (xs[i] + xs[i + 1]) / 2, c = ln.P(s), C = U.avenue;
            if (xs[i + 1] - xs[i] < 720 || !onRoad(c[0], c[1], 'avenue')) continue;
            const a = [c[0] + ln.nx * (C.cw / 2 + 16), c[1] + ln.nz * (C.cw / 2 + 16)], b = [c[0] - ln.nx * (C.cw / 2 + 16), c[1] - ln.nz * (C.cw / 2 + 16)];
            if (onWalk(a[0], a[1]) && onWalk(b[0], b[1])) cand.push({ x: c[0], z: c[1], angle: ln.ang, span: C.cw + 32 });
          }
        }
        for (let n = 0; n < 3 && cand.length; n++) props.footbridges.push(cand.splice(Math.floor(rng() * cand.length), 1)[0]);
      }
      // cây (vỉa hè, công viên, sân vườn) + xe đỗ (phố + bãi) vào danh sách chung
      // mẫu xe theo danh mục (CAR_CATALOG): bảng mẫu của bản đồ -> chọn theo ngữ cảnh chỗ đặt; carKinds: các mẫu thực
      // có mặt -> phía vẽ chỉ dựng hình những mẫu này
      const palette = carPalette(rng), kinds = new Set();
      for (const c of urbanCars) {
        const p = pickCar(rng, palette, { cls: c.cls, use: c.use, lot: c.lot });
        kinds.add(p.kind);
        props.cars.push({ x: c.x, z: c.z, angle: c.angle + R(-0.03, 0.03), kind: p.kind, color: p.color, seed: p.seed });
      }
      props.carKinds = [...kinds];
      for (const t of urbanTrees) {
        if (!clearOfKeys(t.x, t.z, 4) || isWater(t.x, t.z) || (!t.street && !freeOf(t.x, t.z, 4))) continue;
        trees.push({ x: t.x, z: t.z, kind: t.kind, s: t.street ? R(0.85, 1.1) : R(0.8, 1.3), rot: R(0, 6.28) });
      }
    }

    // 6. MẶT TRỜI THEO GIỜ TRONG NGÀY
    stage('sun');
    const tod = pick(rng, ['morning', 'noon', 'afternoon', 'afternoon', 'golden']);
    const elevDeg = { morning: R(20, 32), noon: R(52, 66), afternoon: R(34, 46), golden: R(12, 19) }[tod];
    const sun = { timeOfDay: tod, elevation: elevDeg * Math.PI / 180, azimuth: R(0, Math.PI * 2) };

    const ms = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
    return {
      type, seed, size: SIZE, res: RES, cell: CELL, heights, surface,
      bases, capture: CAP, roads, river, lakes, canals, blocks: roads.urbanGrid ? roads.urbanGrid.blocks : [], bridges, bunkers, strongholds, landmarks, layout, buildings, rocks, bushes, trees, forests, props, sun,
      genMs: Math.round(ms),
      sig: mapSig(heights, [trees, rocks, bushes, buildings, props.wrecks, props.pits, props.cars, props.lamps], roads),
      outer: { rimFoot, wall: RIM_WALL, sea: OUT.sea, seaLevel: OUT.sea ? 0.2 : null, ext: OUTER_EXT, heightAt },
      // tra cứu nhanh mặt đường cho động lực học xe
      roadAt(x, z) {
        const nr = nearestRoad(x, z, 60);
        return nr && nr.d < nr.road.width / 2 ? nr.road : null;
      },
      nearestRoad
    };
  }

  // ---------------------------------------------------------------------------
  // CÔNG TRÌNH BỐI CẢNH: thông số cố định từng loại (dùng chung cho khắc địa hình ở đây và dựng hình ở landmarks.js)
  // Hệ toạ độ cục bộ: f theo hướng mặt trước (angle), r vuông góc (-sin, cos), cao độ tính từ cốt san nền G
  // ---------------------------------------------------------------------------
  function landmarkDetail(L) {
    const D = { nuke: detailNuke, bio: detailBio, sam: detailSam, power: detailPower, radar: detailRadar }[L.kind];
    if (D) D(L);
    return L;
  }
  // Độ cao đắp thêm trên cốt san nền tại (f, r)
  // ụ đất chống xe vòng quanh mép khu đất (mọi căn cứ), chừa cổng ở giữa cạnh trước
  const PERIM_BERM = { h: 12, w: 11, inset: 11, gate: 52 };
  function perimBerm(L, f, r) {
    const Bm = PERIM_BERM, dIn = Math.min(L.hu - Math.abs(f), L.hv - Math.abs(r));
    if (dIn <= 0 || (f > 0 && Math.abs(r) < Bm.gate && L.hu - f < Bm.inset + Bm.w * 2)) return 0;
    return Bm.h * (1 - smooth(0, Bm.w, Math.abs(dIn - Bm.inset)));
  }
  function landmarkMound(L, f, r) {
    return Math.max(landmarkMoundCore(L, f, r), perimBerm(L, f, r));
  }
  function landmarkMoundCore(L, f, r) {
    const M = { nuke: moundNuke, bio: moundBio, sam: moundSam, power: moundPower, radar: moundRadar }[L.kind];
    return M ? M(L, f, r) : 0;
  }

  // ===== CĂN CỨ HẦM PHÓNG TÊN LỬA HẠT NHÂN (đảo / sông hồ) =====
  function detailNuke(L) {
    // gò silo (kiểu Titan II): mặt bằng bệ bê tông nửa cỡ hf x hr cao h (4 m) trên gò đất, ta-luy run; giếng phóng
    // bán kính shaft và 2 ống xả (tâm, nửa cỡ) khoét xuyên gò xuống tới cốt sân
    // lcc: gò đất phủ trung tâm điều khiển phóng ngầm (nửa cỡ hf x hr, cao h, ta-luy run 3 phía), mặt tiền +f thẳng đứng
    // berm: ụ đất chống xe dọc mép khu đất (cao, rộng, cách mép), chừa cổng |r| < gate ở cạnh trước
    L.silo = { f: -30, r: 0, hf: 100, hr: 84, h: 32, run: 76, shaft: 32, vents: [[-56, -60, 17, 11], [56, -60, 17, 11]],
      lcc: { f: -150, r: -270, hf: 60, hr: 56, h: 48, run: 30 }, berm: { h: 12, w: 11, inset: 11, gate: 52 } };   // ụ đất sát mép (0..22), chừa dải phẳng trước rào ngoài cho hàng nhím thép
  }
  function moundNuke(L, f, r) {
    const S = L.silo, df = f - S.f, dr = r - S.r;
    const d = Math.hypot(Math.max(0, Math.abs(df) - S.hf), Math.max(0, Math.abs(dr) - S.hr));
    let h = S.h * (1 - smooth(0, S.run, d));
    // dải chuyển cao độ quanh lỗ khoét nằm khuất dưới bệ bê tông (ngoài thành giếng / thành ống xả)
    h *= smooth(S.shaft + 8, S.shaft + 20, Math.hypot(df, dr));
    for (const [vf, vr, hf, hr] of S.vents) h *= smooth(4, 14, Math.hypot(Math.max(0, Math.abs(df - vf) - hf), Math.max(0, Math.abs(dr - vr) - hr)));
    // gò trung tâm điều khiển: cắt thẳng ở mặt tiền (dải chuyển cao độ nằm trong bề dày tường mặt tiền / tường cánh)
    const C = S.lcc, pf = f - C.f, pr = r - C.r;
    if (pf < C.hf - 22) h = Math.max(h, C.h * (1 - smooth(0, C.run, Math.hypot(Math.max(0, -pf - C.hf), Math.max(0, Math.abs(pr) - C.hr)))));
    return h;
  }

  // ===== HẦM NGHIÊN CỨU VŨ KHÍ SINH HỌC (rừng rậm) =====
  function detailBio(L) {
    // ụ đất phủ hầm: vòm vuông bo tròn tâm fc, bán trục af / ar, cao h (9.5 m); sân trước khoét vào ụ rộng 2 * cut,
    // vách sau sân là tường mặt tiền (mặt trong tại face), 2 bên là tường chắn đất
    L.mound = { fc: -80, af: 150, ar: 200, h: 72, cut: 80, face: 10 };
  }
  function moundBio(L, f, r) {
    const M = L.mound, u = (f - M.fc) / M.af, v = r / M.ar;
    const d = Math.pow(Math.pow(Math.abs(u), 6) + Math.pow(Math.abs(v), 6), 1 / 6);
    if (d >= 1) return 0;
    // sân trước khoét vào ụ, lòng hầm khoét sâu ra sau mặt tiền (khe cửa hé không lộ mặt đất): dải chuyển cao độ khuất sau tường mặt tiền
    const notch = smooth(M.face - 34, M.face - 22, f) * (1 - smooth(M.cut - 6, M.cut + 6, Math.abs(r)));
    return M.h * (1 - smooth(0.68, 1, d)) * (1 - notch);
  }

  // ===== TRẬN ĐỊA TÊN LỬA PHÒNG KHÔNG (sa mạc) =====
  function detailSam(L) {
    // Tiểu đoàn tên lửa S-125 Pechora (bố trí theo trận địa thật), toạ độ cục bộ f (trước, về cổng) / r (ngang):
    // - 4 bệ phóng 5P73 (mỗi bệ 4 tên lửa) quanh trạm radar dẫn bắn ở giữa, mỗi bệ nằm trong kè đất móng ngựa cao 2.25 m,
    //   miệng kè quay vào giữa (đường xe nạp đạn), tên lửa chĩa ra ngoài
    L.launchers = [0, 1, 2, 3].map(k => { const a = Math.PI / 4 + k * Math.PI / 2, f = Math.cos(a) * 175, r = Math.sin(a) * 300; return { f, r, az: Math.atan2(r, f) }; });
    L.berm = { r: 46, w: 14, h: 18, gap: 0.7 };
    // - gò đặt cột ăng-ten SNR-125 (UNV): mặt bằng vuông bo nửa cỡ hf x hr, cao h (2.75 m), ta-luy run, dốc lên xe phía +f
    L.unv = { f: 0, r: 0, hf: 36, hr: 34, h: 22, run: 26, ramp: { hw: 16, len: 46 } };
    // - hầm chỉ huy (KP) và kho tên lửa 2 vòm: ụ đất phủ, mặt tiền +f cắt thẳng (tường bê tông ở f + hf)
    L.kp = { f: -180, r: 0, hf: 36, hr: 46, h: 36, run: 30 };
    L.store = { f: -172, r: -366, hf: 44, hr: 58, h: 38, run: 28, doors: [-338, -394] };
    // - gò radar cảnh giới P-18: mặt tròn bán kính R cao h, dốc lên xe phía -r (về đường ngang r = 300)
    L.p18 = { f: -150, r: 380, R: 34, h: 20, run: 32, ramp: { hw: 16, len: 44 } };
    // - ụ chữ U che xe / thiết bị: tâm, hướng miệng a, nửa dài lòng hl (theo a), nửa rộng lòng hw, cao h, bề dày w
    //   (2 cabin điều khiển UNK cạnh gò radar, trạm phát điện 5E96, 2 ụ xe ở bãi xe trái)
    L.revs = [
      { f: -4, r: 112, a: Math.PI / 2, hl: 30, hw: 14, h: 16, w: 14 },
      { f: -4, r: -112, a: -Math.PI / 2, hl: 30, hw: 14, h: 16, w: 14 },
      { f: 130, r: -365, a: Math.PI / 2, hl: 40, hw: 56, h: 20, w: 16 },
      { f: -30, r: 352, a: -Math.PI / 2, hl: 36, hw: 14, h: 15, w: 12 },
      { f: 24, r: 352, a: -Math.PI / 2, hl: 36, hw: 14, h: 15, w: 12 }
    ];
    // - bờ bao kho dầu (kín 4 phía, chừa lối vào phía đường +r rộng 2 * gate)
    L.bund = { f: 10, r: -380, a: Math.PI / 2, hl: 44, hw: 36, h: 10, w: 16, gate: 12 };
    // - hố pháo ZU-23-2 tròn: [f, r, hướng lối vào]; bán kính lòng 20, bờ cao 1.25 m
    L.pits = [[46, 238, Math.PI], [46, -238, Math.PI], [-214, 150, 0], [-214, -150, 0]];
  }
  function moundSam(L, f, r) {
    const B = L.berm;
    let h = 0;
    for (const P of L.launchers) {
      const df = f - P.f, dr = r - P.r, d = Math.hypot(df, dr);
      const ring = 1 - smooth(0, B.w, Math.abs(d - B.r));
      if (ring <= 0) continue;
      // miệng kè quay về tâm trận địa (ngược hướng phóng)
      const open = Math.atan2(dr, df) - (P.az + Math.PI);
      const da = Math.abs(Math.atan2(Math.sin(open), Math.cos(open)));
      h = Math.max(h, B.h * ring * smooth(B.gap, B.gap + 0.35, da));
    }
    // mặt cắt bờ đất: 0 trong lòng (d <= 0), đỉnh tại d = c, chân ngoài tại d = 2c
    const wall = (d, c) => d <= 0 ? 0 : 1 - smooth(0, c, Math.abs(d - c));
    // gò radar dẫn bắn + dốc lên xe phía +f
    {
      const U = L.unv, pf = f - U.f, pr = r - U.r;
      h = Math.max(h, U.h * (1 - smooth(0, U.run, Math.hypot(Math.max(0, Math.abs(pf) - U.hf), Math.max(0, Math.abs(pr) - U.hr)))));
      const t = (pf - U.hf) / U.ramp.len;
      if (t > -0.2 && t < 1) h = Math.max(h, U.h * Math.min(1, 1 - t) * (1 - smooth(U.ramp.hw, U.ramp.hw + 14, Math.abs(pr))));
    }
    // ụ đất phủ hầm chỉ huy / kho tên lửa: mặt tiền +f cắt thẳng (dải chuyển cao độ khuất sau tường mặt tiền dày 14)
    for (const C of [L.kp, L.store]) {
      const pf = f - C.f, pr = r - C.r;
      if (pf < C.hf - 22) h = Math.max(h, C.h * (1 - smooth(0, C.run, Math.hypot(Math.max(0, -pf - C.hf), Math.max(0, Math.abs(pr) - C.hr)))));
    }
    // gò radar cảnh giới + dốc phía -r
    {
      const Q = L.p18, pf = f - Q.f, pr = r - Q.r;
      h = Math.max(h, Q.h * (1 - smooth(0, Q.run, Math.max(0, Math.hypot(pf, pr) - Q.R))));
      const t = (-pr - Q.R + 4) / Q.ramp.len;
      if (t > -0.2 && t < 1) h = Math.max(h, Q.h * Math.min(1, 1 - t) * (1 - smooth(Q.ramp.hw, Q.ramp.hw + 14, Math.abs(pf))));
    }
    // ụ chữ U (miệng mở hướng a, 2 cánh vuốt thấp dần ra phía miệng) + bờ bao kho dầu (kín, chừa lối vào)
    for (const R of L.revs.concat([L.bund])) {
      const df = f - R.f, dr = r - R.r, c = Math.cos(R.a), s = Math.sin(R.a), u = df * c + dr * s, v = -df * s + dr * c;
      const cw = R.w * 0.55;
      if (R.gate) {
        const d = Math.hypot(Math.max(0, Math.abs(u) - R.hl), Math.max(0, Math.abs(v) - R.hw));
        h = Math.max(h, R.h * wall(d, cw) * (u > R.hl ? smooth(R.gate, R.gate + 8, Math.abs(v)) : 1));
      } else {
        const d = Math.hypot(Math.max(0, -u - R.hl), Math.max(0, Math.abs(v) - R.hw));
        h = Math.max(h, R.h * wall(d, cw) * (1 - smooth(R.hl - 6, R.hl + R.w, u)));
      }
    }
    // hố pháo phòng không tròn, chừa lối vào
    for (const [pf0, pr0, a] of L.pits) {
      const df = f - pf0, dr = r - pr0, d = Math.hypot(df, dr) - 20;
      if (d > 20) continue;
      const da = Math.abs(Math.atan2(Math.sin(Math.atan2(dr, df) - a), Math.cos(Math.atan2(dr, df) - a)));
      h = Math.max(h, 10 * wall(d, 9) * smooth(0.35, 0.6, da));
    }
    return h;
  }

  // ===== TRUNG TÂM NĂNG LƯỢNG NGUYÊN TỬ (thành phố) =====
  function detailPower(L) {
    // tổ hợp lò nhiệt hạch: mọi nhà dựng nổi trên sân bê tông; chỉ đắp thêm đê đất tròn quanh bồn nước chữa cháy
    // (tâm f/r, bán kính đỉnh R, nửa rộng chân w, cao h 1.6 m)
    L.bund = { f: 190, r: 412, R: 14, w: 6, h: 9 };
  }
  function moundPower(L, f, r) {
    const B = L.bund, d = Math.hypot(f - B.f, r - B.r);
    return B.h * (1 - smooth(0, B.w, Math.abs(d - B.R)));
  }

  // ===== ĐÀI ĐIỀU KHIỂN RADAR VỆ TINH (cao nguyên) =====
  function detailRadar(L) {
    // trạm điều khiển / bám vệ tinh trên cao nguyên: mặt bằng san 2 cấp — nền trên (terrace) cao h (3.5 m) phía sau
    // đặt cụm ăng-ten (chảo 18 m, 2 radome), mặt trước giữ bằng tường chắn đất bê tông (mặt trong tại f1, chân tường
    // nhô tới f1 + 26), lưng và 2 đầu là ta-luy đất thoải run; đường dốc lên nền trên chạy dọc chân tường (tâm rf, nửa
    // rộng rw, từ r = r1 xuống tới cốt sân tại r = rEnd). Chảo / nhà điều hành / trạm phát điện... ở nền dưới
    L.terrace = { f0: -200, f1: -68, r0: -370, r1: 150, h: 28, run: 46, rf: -84, rw: 16, rEnd: 330, cut: 18 };
  }
  function moundRadar(L, f, r) {
    const T = L.terrace;
    // nền trên + ta-luy lưng / 2 đầu (mặt trước không có ta-luy: tường chắn)
    const d = Math.hypot(Math.max(0, T.f0 - f), Math.max(0, T.r0 - r, r - T.r1));
    let h = T.h * (1 - smooth(0, T.run, d));
    // đường dốc: cao độ giảm tuyến tính từ mép nền trên (r1) tới rEnd, vai đường đắp đất thoải phía sau
    if (r > T.r1 - 10 && r < T.rEnd + 10) {
      const k = Math.max(0, Math.min(1, 1 - (r - T.r1) / (T.rEnd - T.r1)));
      const side = 1 - smooth(T.rw, T.rw + 26, Math.abs(f - T.rf));
      h = Math.max(h, T.h * k * side);
    }
    // cắt thẳng ở tường chắn: dải chuyển cao độ nằm trong bề dày tường (mặt trong f1, chân tường f1 + 26)
    return h * (1 - smooth(T.f1, T.f1 + T.cut, f));
  }

  // ---------------------------------------------------------------------------
  // HÌNH HỌC PHỤ TRỢ
  // ---------------------------------------------------------------------------
  function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
  // Chỉ mục đường: ô băm HB, mỗi đoạn (pi -> pi+1) ghi vào mọi ô khung bao của đoạn phủ -> nearest(x, z, maxD) quét
  // đúng các ô trong bán kính maxD (trước đây cố định 3x3 ô = 64 nên bỏ sót đường khi maxD lớn hơn). add(ri) thêm dần
  // từng đường (cao độ đường sau bám theo đường trước), addAll() khi dựng lại bản đồ nhận từ luồng phụ
  function makeRoadIndex(roads) {
    const HB = 64, hash = new Map(), hkey = (i, j) => i * 100003 + j;
    const add = ri => {
      const P = roads[ri].pts;
      for (let pi = 0; pi < P.length; pi++) {
        const a = P[pi], b = P[Math.min(P.length - 1, pi + 1)];
        const i0 = Math.floor((Math.min(a[0], b[0]) + HALF) / HB), i1 = Math.floor((Math.max(a[0], b[0]) + HALF) / HB);
        const j0 = Math.floor((Math.min(a[1], b[1]) + HALF) / HB), j1 = Math.floor((Math.max(a[1], b[1]) + HALF) / HB);
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const k = hkey(i, j);
          if (!hash.has(k)) hash.set(k, []);
          hash.get(k).push(ri, pi);
        }
      }
    };
    // đoạn đường gần nhất trong bán kính maxD (đặt vật thể & tra cứu mặt đường khi xe chạy)
    const nearest = (x, z, maxD) => {
      const i0 = Math.floor((x - maxD + HALF) / HB), i1 = Math.floor((x + maxD + HALF) / HB);
      const j0 = Math.floor((z - maxD + HALF) / HB), j1 = Math.floor((z + maxD + HALF) / HB);
      let bd = maxD, bRd = null, bH = 0, bT = 0;
      for (let cj = j0; cj <= j1; cj++) for (let ci = i0; ci <= i1; ci++) {
        const list = hash.get(hkey(ci, cj));
        if (!list) continue;
        for (let q = 0; q < list.length; q += 2) {
          const rd = roads[list[q]], pi = list[q + 1];
          const a = rd.pts[pi], b = rd.pts[Math.min(rd.pts.length - 1, pi + 1)];
          const r = segDist(x, z, a[0], a[1], b[0], b[1]);
          if (r.d < bd) { bd = r.d; bRd = rd; bH = lerp(rd.heights[pi], rd.heights[Math.min(rd.pts.length - 1, pi + 1)], r.t); bT = pi + r.t; }
        }
      }
      return bRd ? { road: bRd, d: bd, h: bH, t: bT } : null;
    };
    return { add, nearest, addAll() { for (let ri = 0; ri < roads.length; ri++) add(ri); return this; } };
  }
  // Chữ ký bản đồ: băm độ cao lưới thưa + số lượng & toạ độ làm tròn của vật thể. Máy khách gửi kèm khi khai báo trận,
  // máy chủ so với bản tự sinh -> phát hiện máy sinh lệch bản đồ (cùng seed nhưng trình duyệt tính dấu phẩy động khác)
  function mapSig(heights, lists, roads) {
    let h = 2166136261;
    const add = v => { h = Math.imul(h ^ (v | 0), 16777619); };
    const N = RES + 1;
    for (let j = 0; j < N; j += 16) for (let i = 0; i < N; i += 16) add(Math.round(heights[j * N + i]));
    for (const L of lists) { add(L.length); for (const o of L) { add(Math.round(o.x)); add(Math.round(o.z)); } }
    add(roads.length);
    for (const r of roads) add(r.pts.length);
    return (h >>> 0).toString(16).padStart(8, '0');
  }
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
  // trả về object dùng chung (không cấp phát: gọi hàng triệu lần) -> người gọi đọc .d / .t ngay, không giữ lại
  const SEG = { d: 0, t: 0 };
  function segDist(px, pz, ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az;
    const L = dx * dx + dz * dz;
    const t = L > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L)) : 0;
    SEG.d = Math.hypot(px - (ax + dx * t), pz - (az + dz * t)); SEG.t = t;
    return SEG;
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
  const cacheKey = (type, seed) => type + ':' + (seed >>> 0) + ':' + layout + ':' + (landmarkKind || '');
  const cachePut = (key, m) => { if (cache.size > 4) cache.delete(cache.keys().next().value); cache.set(key, m); };
  function get(type, seed) {
    const fullKey = cacheKey(type, seed) + (testField ? ':field' : '');
    if (!cache.has(fullKey)) {
      const m = generate(type, seed);
      if (testField) applyTestField(m);
      cachePut(fullKey, m);
    }
    return cache.get(fullKey);
  }

  // ---------------------------------------------------------------------------
  // ĐỒNG TRỐNG CHO PHÒNG THỬ ĐẠN (range_lab.js, setTestField(true)): chọn vùng tròn ít dốc, không sông hồ, xa cứ điểm /
  // căn cứ; san phẳng bán kính r (dải chuyển tiếp blend ra địa hình tự nhiên) và dọn sạch cây / nhà / đá / bụi trong vùng.
  // Đường đi qua (nếu có) vẫn giữ, nằm phẳng trên mặt đồng. Kết quả: map.testField = { x, z, r, h }
  // ---------------------------------------------------------------------------
  let testField = null;
  function applyTestField(m) {
    const R = testField.r, BL = testField.blend, N = m.res + 1, C = m.cell, H = m.size / 2;
    const idx = (x, z) => Math.max(0, Math.min(N - 1, Math.round((z + H) / C))) * N + Math.max(0, Math.min(N - 1, Math.round((x + H) / C)));
    const avoid = [].concat(m.strongholds || [], m.landmarks || [], m.bases ? [m.bases.blue, m.bases.red] : []);
    const lim = H - R - BL - 900, RR = (R + BL) * (R + BL);
    let best = null;
    for (let cx = -lim; cx <= lim; cx += 400) for (let cz = -lim; cz <= lim; cz += 400) {
      if (avoid.some(p => Math.hypot(p.x - cx, p.z - cz) < R + BL + 450)) continue;
      let water = 0, road = 0, sum = 0, sq = 0, n = 0;
      for (let z = cz - R - BL; z <= cz + R + BL; z += C * 2) for (let x = cx - R - BL; x <= cx + R + BL; x += C * 2) {
        const dx = x - cx, dz = z - cz;
        if (dx * dx + dz * dz > RR) continue;
        const i = idx(x, z), s = m.surface[i], h = m.heights[i];
        if (s === 2) water++; else if (s === 1) road++;
        sum += h; sq += h * h; n++;
      }
      const mean = sum / n, sd = Math.sqrt(Math.max(0, sq / n - mean * mean));
      const score = water * 1000 + road * 2 + sd * 3;
      if (!best || score < best.score) best = { x: cx, z: cz, score };
    }
    if (!best) return;
    const cx = best.x, cz = best.z;
    // cao độ mặt đồng: trung bình phần lõi
    let sum = 0, n = 0;
    for (let z = cz - R; z <= cz + R; z += C) for (let x = cx - R; x <= cx + R; x += C) {
      if (Math.hypot(x - cx, z - cz) > R) continue;
      sum += m.heights[idx(x, z)]; n++;
    }
    const h0 = n ? sum / n : 0;
    const i0 = Math.max(0, Math.floor((cx - R - BL + H) / C)), i1 = Math.min(N - 1, Math.ceil((cx + R + BL + H) / C));
    const j0 = Math.max(0, Math.floor((cz - R - BL + H) / C)), j1 = Math.min(N - 1, Math.ceil((cz + R + BL + H) / C));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const d = Math.hypot(i * C - H - cx, j * C - H - cz);
      if (d >= R + BL) continue;
      const k = 1 - smooth(R, R + BL, d), at = j * N + i;
      m.heights[at] = lerp(m.heights[at], h0, k);
      if (k > 0.5 && m.surface[at] === 3) m.surface[at] = 0;   // nền bê tông đô thị -> đất tự nhiên
    }
    const pad = R + 80, out = o => Math.hypot(o.x - cx, o.z - cz) > pad + (o.r || o.radius || (o.w ? Math.max(o.w, o.d || 0) / 2 : 0));
    for (const k of ['trees', 'rocks', 'bushes', 'buildings', 'bunkers', 'props', 'forests']) if (Array.isArray(m[k])) m[k] = m[k].filter(out);
    m.testField = { x: cx, z: cz, r: R, h: h0 };
  }
  function setTestField(on) { testField = on ? { r: 1000, blend: 350 } : null; }

  function setLandmark(k) { landmarkKind = LANDMARK_KINDS[k] ? k : null; }
  function setLayout(l) { layout = l === 'STRONGHOLDS' ? 'STRONGHOLDS' : 'CLASSIC'; }
  // ---------------------------------------------------------------------------
  // SINH TRONG LUỒNG PHỤ: luồng phụ gửi về dữ liệu thuần (bỏ các hàm tra cứu), luồng chính gắn lại các hàm đó (hydrate):
  // outer.heightAt / rimFoot / river.near dựng lại bằng generate(..., light) (chỉ phần rẻ theo seed), tra đường dựng lại
  // chỉ mục từ roads
  // ---------------------------------------------------------------------------
  function toPlain(m) {
    const o = Object.assign({}, m);
    delete o.roadAt; delete o.nearestRoad;
    o.outer = Object.assign({}, m.outer); delete o.outer.rimFoot; delete o.outer.heightAt;
    if (m.river) { o.river = Object.assign({}, m.river); delete o.river.near; }
    return o;
  }
  function hydrate(m, lay, lmk) {
    const L0 = layout, K0 = landmarkKind;
    layout = lay; landmarkKind = lmk;
    let ctx;
    try { ctx = generate(m.type, m.seed, true); } finally { layout = L0; landmarkKind = K0; }
    m.outer.rimFoot = ctx.rimFoot; m.outer.heightAt = ctx.heightAt;
    if (m.river) m.river.near = ctx.riverNear;
    const nearestRoad = makeRoadIndex(m.roads).addAll().nearest;
    m.nearestRoad = nearestRoad;
    m.roadAt = (x, z) => { const nr = nearestRoad(x, z, 60); return nr && nr.d < nr.road.width / 2 ? nr.road : null; };
    return m;
  }
  let workerURL = null;
  const pending = new Map();
  function prefetch(type, seed) {
    const key = cacheKey(type, seed);
    if (cache.has(key)) return Promise.resolve(true);
    if (pending.has(key)) return pending.get(key);
    if (testField || typeof Worker === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined') return Promise.resolve(false);
    const lay = layout, lmk = landmarkKind;
    const p = new Promise(resolve => {
      let w;
      try {
        if (!workerURL) {
          // gọi thẳng biểu thức hàm (không dựa vào tên: bản build rút gọn đổi tên MapGenFactory)
          const src = 'const MapGen = (' + MapGenFactory.toString() + ')();\n' +
            'onmessage = e => { const d = e.data; let m;\n' +
            '  try { MapGen.setLayout(d.layout); MapGen.setLandmark(d.landmark); m = MapGen.generate(d.type, d.seed); }\n' +
            '  catch (err) { postMessage({ error: String(err && err.stack || err) }); return; }\n' +
            '  postMessage({ map: MapGen.toPlain(m) }, [m.heights.buffer, m.surface.buffer]); };\n';
          workerURL = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
        }
        w = new Worker(workerURL);
      } catch (e) { resolve(false); return; }
      const done = ok => { try { w.terminate(); } catch (e) { /* bỏ qua */ } pending.delete(key); resolve(ok); };
      w.onmessage = e => {
        const d = e.data;
        if (!d || !d.map) { console.warn('[MapGen] Luồng phụ lỗi, sẽ sinh trên luồng chính:', d && d.error); done(false); return; }
        try { if (!cache.has(key)) cachePut(key, hydrate(d.map, lay, lmk)); done(true); }
        catch (err) { console.warn('[MapGen] Không nhận được bản đồ từ luồng phụ:', err); done(false); }
      };
      w.onerror = e => { console.warn('[MapGen] Luồng phụ lỗi, sẽ sinh trên luồng chính:', e && e.message); if (e && e.preventDefault) e.preventDefault(); done(false); };
      w.postMessage({ type, seed, layout: lay, landmark: lmk });
    });
    pending.set(key, p);
    return p;
  }

  return { generate, get, prefetch, toPlain, hydrate, setLayout, setTestField, getLayout: () => layout, STRONGHOLD_SITES, PORTAL, portalHalf, LANDMARK_SITE, CAR_CATALOG, setLandmark, landmarkMound, mulberry32, makeNoise, fbm, ridged, sampleH, SIZE, HALF, RES, CELL, OUTER_EXT, CAPTURE, BIOME, randomSeed: () => (Math.random() * 4294967296) >>> 0 };
}
const MapGen = MapGenFactory();

if (typeof window !== 'undefined') window.MapGen = MapGen;
