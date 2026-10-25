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
  // 672² đỉnh cộng normals/texture khiến main thread đứng hàng chục giây khi dựng mesh.
  // 192 vẫn đủ cho địa hình chiến thuật; va chạm dùng nội suy nên thế trận không đổi.
  const RES = 192;
  const HALF = SIZE / 2;
  const CELL = SIZE / RES;
  const OUTER_EXT = 17400;         // nửa cạnh vùng cảnh nền ngoài bản đồ (xem Backdrop); >= HALF + tầm nhìn camera (9000)
  // Bố cục gốc thiết kế cho bản đồ 3600: K giãn khoảng cách giữa các điểm chiến thuật, AREA nhân số lượng vật thể
  // (giữ mật độ cây / đá / làng như cũ); kích thước từng vật thể, đồi, đường... giữ nguyên
  // Không nhân mật độ đạo cụ theo toàn bộ diện tích 20,25 lần: phần lớn nằm ngoài tầm nhìn
  // và làm Urban tạo quá nhiều nhà/cây/xe trong một frame. Giữ trần 5x để còn độ hùng vĩ
  // nhưng đủ nhẹ cho trình duyệt dựng mà không báo "page isn't responding".
  const K = SIZE / 3600, AREA = 1;
  const O0 = HALF - 1800;          // cảnh ngoài bản đồ (vành núi, bờ biển, đảo xa) dời ra theo mép bản đồ
  const RIM_WALL = 650;            // tường giữ xe vô hình nằm trên sườn vành núi: cách chân núi bấy nhiêu (spg.js)

  // Điểm chiến thuật cố định của luật chơi
  const CAPTURE = [{ x: -800 * K, z: 0 }, { x: 0, z: 0 }, { x: 800 * K, z: 0 }];
  const SPAWN = { blue: { z0: 800 * K, z1: 1180 * K }, red: { z0: -1180 * K, z1: -800 * K }, halfX: 430 * K };
  // Các biến thể bố cục cứ điểm chiến thuật (được bốc ngẫu nhiên theo hạt giống bản đồ seed).
  // CÂN BẰNG HAI PHE (Xanh z > 0, Đỏ z < 0): mỗi bố cục có phép đối xứng sym đổi chỗ hai phe — 'mirror' soi gương qua
  // trục x (z -> -z), 'point' đối xứng qua tâm ((x, z) -> (-x, -z)). Phần luật chơi bất biến qua phép đó: vị trí cứ
  // điểm, công trình, căn cứ, chỗ xuất phát (game.js), cốt đỉnh đồi cứ điểm, hào ẩn xe, sơ đồ mạng đường. Địa hình và
  // vật thể vẫn ngẫu nhiên tự nhiên; bước cân bằng (5f) bù vật che cho phe thiếu trên từng hướng tiến / nửa map.
  // Công trình bối cảnh nằm trên trục giữa (z = 0), mặt trước nhìn ngang (±x): không chắn đường của riêng phe nào
  // (trước đây nó đứng chắn trước một phe). Bố cục 'point' chỉ có tâm là điểm bất biến (cứ điểm B đã chiếm) -> công
  // trình đặt trên trục giữa, lệch về một cánh (gần đều hai phe, không đối xứng tuyệt đối)
  const STRONGHOLD_LAYOUT_VARIANTS = [
    {
      name: 'FRONTLINE',
      label: 'TIỀN TUYẾN DÀN NGANG',
      desc: 'Ba cứ điểm dàn ngang ranh giới giữa bản đồ — hai phe cách đều, đua tốc độ chiếm đóng',
      sym: 'mirror',
      sites: [
        { id: 'A', x: -750 * K, z: 0, angle: Math.PI / 2, hill: 68 },
        { id: 'B', x: 0, z: 0, angle: Math.PI / 2, hill: 76 },
        { id: 'C', x: 750 * K, z: 0, angle: Math.PI / 2, hill: 68 }
      ],
      landmark: { x: 375 * K, z: 0, angle: Math.PI }
    },
    {
      name: 'DIAGONAL',
      label: 'GỌNG KÌM SO LE',
      desc: 'Cứ điểm A và C bố trí so le chéo cánh, cứ điểm B ở trung tâm làm tâm điểm tranh chấp',
      sym: 'point',
      sites: [
        { id: 'A', x: -660 * K, z: 350 * K, angle: -Math.PI / 4, hill: 72 },
        { id: 'B', x: 0, z: 0, angle: Math.PI / 2, hill: 80 },
        { id: 'C', x: 660 * K, z: -350 * K, angle: Math.PI * 3 / 4, hill: 72 }
      ],
      landmark: { x: 367 * K, z: 0, angle: Math.PI }
    },
    {
      // Pháo đài B trên đồi cao ở một cánh, nằm trên trục giữa -> cách đều hai phe; mỗi phe một tiền đồn gần nhà (A xanh,
      // C đỏ) ở cánh đối diện. (Bản cũ đặt B sát phe Đỏ, A + C sát phe Xanh: Đỏ tới mục tiêu gần nhất sớm hơn ~10 s.)
      name: 'FORTRESS',
      label: 'TAM GIÁC PHÁO ĐÀI',
      desc: 'Cứ điểm B nằm trên đỉnh đồi pháo đài cao khống chế một cánh thung lũng, mỗi phe một tiền đồn A / C gần nhà',
      sym: 'mirror',
      sites: [
        { id: 'A', x: 450 * K, z: 420 * K, angle: Math.PI / 4, hill: 66 },
        { id: 'B', x: -700 * K, z: 0, angle: Math.PI / 2, hill: 96 },
        { id: 'C', x: 450 * K, z: -420 * K, angle: -Math.PI / 4, hill: 66 }
      ],
      landmark: { x: 180 * K, z: 0, angle: Math.PI }
    }
  ];
  // phép đối xứng đổi phe: điểm / hướng (góc) qua sym
  const symPt = (sym, x, z) => sym === 'point' ? [-x, -z] : [x, -z];

  function pickStrongholdVariant(seed) {
    const s = ((seed >>> 0) ^ 0x7f4a7c15);
    const idx = Math.abs((s * 1103515245 + 12345) >>> 16) % STRONGHOLD_LAYOUT_VARIANTS.length;
    return STRONGHOLD_LAYOUT_VARIANTS[idx];
  }

  // Tương thích ngược: mẫu mặc định tam giác pháo đài
  const STRONGHOLD_SITES = STRONGHOLD_LAYOUT_VARIANTS[2].sites;
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
  const LANDMARK_SITE = STRONGHOLD_LAYOUT_VARIANTS[2].landmark;
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
    { id: 'dump', w: 1.3, size: 'large', tags: ['work'] },
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
    // sa mạc: cọ chỉ mọc quanh ốc đảo (xem 4b); ngoài đó keo gai / cây khô thưa thớt (sa mạc Bắc Phi - Trung Đông, không có xương rồng)
    DESERT: { roadKind: 'dirt', bunkers: 7, trees: 150, rocks: 70, bushes: 14, villages: 3, treeKinds: ['acacia', 'acacia', 'deadTree'] },
    URBAN: { roadKind: 'asphalt', bunkers: 5, trees: 220, rocks: 18, bushes: 10, villages: 0, treeKinds: ['broadleaf', 'broadleaf', 'cypress'] },
    JUNGLE: { roadKind: 'mud', bunkers: 5, trees: 780, rocks: 40, bushes: 24, villages: 2, treeKinds: ['jungle', 'jungle', 'palm', 'broadleaf', 'jungle'] },
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
    const variant = SH ? pickStrongholdVariant(seed) : null;
    // phép đối xứng đổi phe của bản đồ (xem STRONGHOLD_LAYOUT_VARIANTS); bố cục cũ CLASSIC: soi gương
    const SYM = variant ? variant.sym : 'mirror';
    const symP = (x, z) => symPt(SYM, x, z);
    // lật trái / phải theo seed (soi gương qua trục z, không đổi phe nào gần cứ điểm nào): pháo đài FORTRESS, công trình
    // lúc ở cánh Đông lúc ở cánh Tây
    const flipX = variant && ((seed >>> 3) & 1) ? -1 : 1;
    const flipSite = s => flipX > 0 ? s : Object.assign({}, s, { x: -s.x, angle: Math.PI - s.angle });
    const strongholdSites = variant ? variant.sites.map(flipSite) : STRONGHOLD_SITES;
    const landmarkSite = variant ? flipSite(variant.landmark) : LANDMARK_SITE;
    const layoutVariant = variant ? variant.name : 'CLASSIC';
    const layoutLabel = variant ? variant.label : 'TRUYỀN THỐNG';
    const layoutDesc = variant ? variant.desc : '';
    const CAP = SH ? strongholdSites.map(c => ({ x: c.x, z: c.z })) : CAPTURE;
    const keyR = SH ? 345 : 110;   // bán kính cấm đặt cây / nhà / đá quanh cứ điểm
    // Công trình bối cảnh: G (cốt san nền) tính sau khi tìm tuyến đường, trước khi khắc đường
    const lmKind = LANDMARK_KINDS[landmarkKind] ? landmarkKind : MAP_LANDMARK[type];
    const lmFx = Math.cos(landmarkSite.angle), lmFz = Math.sin(landmarkSite.angle), lmBack = LANDMARK_KINDS[lmKind].back || 0;
    const landmarks = SH ? [landmarkDetail(Object.assign({ kind: lmKind }, landmarkSite, LANDMARK_KINDS[lmKind],
      { x: landmarkSite.x - lmFx * lmBack, z: landmarkSite.z - lmFz * lmBack, fx: lmFx, fz: lmFz }))] : [];
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

    // Căn cứ hai phe (vị trí xuất kích lệch ngẫu nhiên): phe Đỏ là ảnh đối xứng của phe Xanh (vẫn rút đủ 4 số ngẫu
    // nhiên như trước để không xê dịch chuỗi ngẫu nhiên phía sau)
    const bases = { blue: { x: R(-260, 260) * K, z: R(960, 1060) * K } };
    R(); R();
    { const [x, z] = symP(bases.blue.x, bases.blue.z); bases.red = { x, z }; }
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

    // SA MẠC — ĐỤN CÁT NGANG GIÓ: gió thổi theo +u (hướng windA). Mặt cắt dọc gió bất đối xứng như đụn thật: sườn đón gió
    // thoải (~70% bước đụn, dốc dần lên đỉnh), đỉnh sắc, sườn khuất gió dốc (~25-30°) đổ về phía xuôi gió. Sống đụn đứt thành
    // từng khúc (độ cao đổi chậm dọc sống), hai đầu khúc thấp dần và lùi về phía xuôi gió -> dáng lưỡi liềm (sừng chĩa
    // xuôi gió). Bước đụn ~560 (~7 ô lưới 84) để lưới độ cao dựng được dáng đụn; gợn cát nhỏ do shader vẽ cùng hướng gió
    const DUNE_L = 560, DUNE_S = 0.71;
    function duneH(x, z) {
      const field = smooth(-0.15, 0.35, fbm(noise, (x + ox) * 0.00055, (z + oz) * 0.00055, 3));
      if (field <= 0) return 0;
      const wx = x + 180 * fbm(noise2, (x + ox) * 0.0007, (z + oz) * 0.0007, 3);
      const wz = z + 180 * fbm(noise2, (x - oz) * 0.0007 + 40, (z + ox) * 0.0007, 3);
      const u = wx * cw + wz * sw, v = -wx * sw + wz * cw;
      // độ cao khúc sống đụn: đổi chậm dọc sống (v), gần như không đổi qua bề ngang một đụn (u)
      const seg = smooth(-0.3, 0.3, noise(u * 0.0005 + 7.7, v * 0.0021 - 3.1));
      if (seg <= 0) return 0;
      const amp = field * seg * (0.8 + 0.4 * fbm(noise, u * 0.0004 - 2.3, v * 0.0009 + 5.1, 2));
      // sừng lưỡi liềm: khúc đụn thấp dần (hai đầu) thì đỉnh lùi xuôi gió; sống đụn uốn nhẹ theo chiều dọc
      const ph = (u - 160 * (1 - seg) + 90 * noise(v * 0.0013 + 1.9, u * 0.0003)) / DUNE_L;
      const t = ph - Math.floor(ph);
      const y = t < DUNE_S ? Math.pow(t / DUNE_S, 1.6) : Math.pow(1 - (t - DUNE_S) / (1 - DUNE_S), 1.25);
      return y * 50 * amp;
    }
    // SA MẠC — NÚI BÀN: thềm sa thạch đỉnh bằng, vách cao ~14 m (sau lọc chống răng cưa, trên lưới 84 thành vách dốc
    // ~0,8-1: xe nhẹ không leo thẳng lên), chân vách có sườn đá đổ (talus). Vài đoạn vách sạt thành dốc thoải = lối lên
    // đỉnh. n: giá trị nhiễu (đá tảng dồn về chân vách, ốc đảo / đụn cát tránh núi bàn)
    // Nhiễu tỉ lệ lớn, ít tầng: vài khối núi bàn rộng 1-2 km (~5% thung lũng) viền vách liền mạch; nhiễu nhiều tầng / tỉ lệ
    // nhỏ cho ra lốm đốm khối bé tí mà gần như toàn bộ là vách dốc
    const MESA = { h: 0, n: 0 }, MESA_T = 0.38;
    function mesaAt(x, z) {
      const n = fbm(noise2, (x - ox) * 0.0005, (z - oz) * 0.0005, 3);
      MESA.n = n; MESA.h = 0;
      if (n < MESA_T - 0.1) return MESA;
      const ramp = smooth(0.15, 0.5, noise2(x * 0.0021 + 4.1, z * 0.0021 - 8.3));
      const w = lerp(0.006, 0.05, ramp);
      MESA.h = smooth(MESA_T - w, MESA_T + w, n) * 110 + smooth(MESA_T - 0.085, MESA_T - 0.005, n) * 12 + smooth(MESA_T + 0.085, MESA_T + 0.285, n) * 8;
      return MESA;
    }

    // 1. ĐỘ CAO NỀN (địa hình ngẫu nhiên tự nhiên, không soi gương; công bằng hai phe do bước cân bằng sau khi sinh lo)
    function baseHeight(x, z) { return outerLand(x, z, baseRaw(x, z) + rimRaise(x, z)); }
    const mesaN = (x, z) => mesaAt(x, z).n;
    function baseRaw(x, z) {
      const wx = x + 180 * fbm(noise2, (x + ox) * 0.0007, (z + oz) * 0.0007, 3);
      const wz = z + 180 * fbm(noise2, (x - oz) * 0.0007 + 40, (z + ox) * 0.0007, 3);
      const fl = flattenAt(x, z);
      let h;
      if (type === 'DESERT') {
        const u = wx * cw + wz * sw, v = -wx * sw + wz * cw;
        // ngoài bản đồ (cảnh nền, lưới thưa): cồn cát lớn thay cho đụn nhỏ (tránh lấy mẫu thưa thành hoa văn lặp)
        const dFar = smooth(2500 + O0, 3300 + O0, Math.hypot(x, z));
        // lọc trước khi lấy mẫu: trung bình 5 điểm trong ô lưới (84) -> sườn khuất gió / vách núi bàn hẹp hơn 1 ô không
        // thành răng cưa (vách đứng lấy mẫu thẳng lên lưới thành dãy chóp tam giác dọc chân vách)
        const q = CELL * 0.3;
        const M = mesaAt(x, z), mN = M.n;
        let mH = M.h;
        if (dFar < 1 && mN > MESA_T - 0.16 && mN < MESA_T + 0.14) {
          // vách núi bàn: lọc lều 3x3 rộng ~1 ô (đường viền vách đi mượt giữa các đỉnh lưới, không thành bậc thang)
          const e = CELL * 0.5;
          mH *= 4;
          for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (dx || dz) mH += mesaAt(x + dx * e, z + dz * e).h * (dx && dz ? 1 : 2);
          mH /= 16;
        }
        let dune = 0;
        if (dFar < 1) dune = (duneH(x, z) * 2 + duneH(x + q, z + q) + duneH(x - q, z - q) + duneH(x + q, z - q) + duneH(x - q, z + q)) / 6;
        if (dFar > 0) {
          const field = smooth(-0.15, 0.35, fbm(noise, (x + ox) * 0.00055, (z + oz) * 0.00055, 3));
          const big = Math.pow(Math.max(0, 1 - Math.abs(noise(u * 0.0011 + 3.3, v * 0.00045))), 2.2) * 70 * (0.4 + 0.6 * field);
          dune = lerp(dune, big, dFar);
        }
        // đỉnh / chân vách núi bàn là đá: không có đụn cát
        dune *= 1 - smooth(MESA_T - 0.07, MESA_T - 0.02, mN);
        // nền cát cao ~20 (không trũng sát mực nước 0,2: shader tô bùn ướt ven nước ở dải độ cao < 8,5 — nước chỉ có ở ốc đảo)
        h = 20 + fbm(noise, wx * 0.0012, wz * 0.0012, 4) * 8 + dune;
        h = lerp(20, h, lerp(0.35, 1, fl)) + mH * fl;
      } else if (type === 'URBAN') {
        h = 4 + fbm(noise, wx * 0.0006, wz * 0.0006, 3) * 7;
        h = lerp(4, h, 0.5 + 0.5 * fl);
        // Sườn thung lũng ở 2 đầu khu vực xuất phát: nâng cao thoai thoải 18 - 24 m nhìn bao quát xuống thành phố
        const az = Math.abs(z);
        if (az > 620) {
          const slope = smooth(620, 1150, az);
          h += slope * slope * (20 + fbm(noise, wx * 0.001, wz * 0.001, 2) * 5);
        }
        // Nền đất chiến địa mấp mô tự nhiên do bom đạn cày xới ở khu đô thị
        h += fbm(noise2, x * 0.012, z * 0.012, 2) * 1.5;
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
      // (vành núi bao quanh chiến trường + cảnh ngoài bản đồ cộng ở baseHeight, sau bước đối xứng)
      return h;
    }

    // 1a. VÀNH NÚI + CẢNH NGOÀI BẢN ĐỒ (dùng chung cho lưới trong bản đồ và cảnh nền bên ngoài -> mép nối liền).
    //     Nhiễu riêng theo seed -> không xáo trộn chuỗi ngẫu nhiên của phần trong bản đồ.
    const OUT = OUTER[type];
    const on = makeNoise(mulberry32((seed ^ 0x0b5e55ed) >>> 0));
    // nhiễu theo hướng (liền mạch quanh vòng tròn): mép vành núi / bờ biển lượn sóng thay vì tròn xoe
    const angN = (x, z, f, o) => { const d = Math.hypot(x, z) || 1; return on(x / d * f + o, z / d * f - o * 0.7); };
    const coastPhi = on(0.37, 9.1) * Math.PI * 2;   // hướng trục dài của đảo
    // Bán kính tối thiểu của lòng thung lũng theo hướng: đủ ôm đồi cứ điểm (+ chân đồi) và khu xuất kích hai phe theo
    // hướng đó; hướng trống thì mũi núi được lấn vào tới ~0.48 nửa bản đồ
    const KEYS = [];
    for (const c of strongholdSites) KEYS.push([c.x, c.z, 820]);
    for (const L of landmarks) KEYS.push([L.x, L.z, Math.hypot(L.hu, L.hv) + LM_BLEND + 200]);
    // khu xuất kích: giữa + mép sau (mũi núi lấn sâu không được chạm phần sau khu xuất kích / kho căn cứ)
    for (const zc of [(SPAWN.blue.z0 + SPAWN.blue.z1) / 2, SPAWN.blue.z1, (SPAWN.red.z0 + SPAWN.red.z1) / 2, SPAWN.red.z0])
      for (const xc of [-SPAWN.halfX, 0, SPAWN.halfX]) KEYS.push([xc, zc, 360]);
    // sông hồ: sông chạy dọc một cánh (|x| ~1100-1220 K, chưa biết cánh nào lúc này) -> giữ cả hai cánh khỏi mũi núi để
    // dòng sông nằm trong lòng thung lũng, không bò lên chân núi
    if (type === 'RIVER_LAKE') for (const xs of [-1, 1]) for (const zc of [-1700, -600, 600, 1700]) KEYS.push([xs * 1170 * K, zc, 520]);
    const KM = new Float32Array(720);
    for (let a = 0; a < 720; a++) {
      const t = a / 720 * Math.PI * 2, c = Math.cos(t), sn = Math.sin(t);
      let r = HALF * 0.48;
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
    // bảng theo góc t (n ô / vòng) -> chỉ số của góc đối xứng đổi phe (soi gương: -t, qua tâm: t + π)
    const symIdx = (a, n) => SYM === 'point' ? (a + n / 2) % n : (n - a) % n;
    { const T0 = KM.slice(); for (let a = 0; a < 720; a++) KM[a] = Math.max(T0[a], T0[symIdx(a, 720)]); }
    // CHÂN VÀNH NÚI = ranh giới thung lũng chiến trường: hình dạng ngẫu nhiên tự nhiên mỗi map (không tròn, không vuông):
    // lượn sóng nhiều tầng trên toạ độ bị bẻ cong + mũi núi lấn sâu ở chỗ ngẫu nhiên. Không lấn vào cứ điểm / khu xuất
    // kích, không chạm mép giữ xe.
    // Phần lượn sóng chỉ phụ thuộc HƯỚNG nhìn từ tâm (toạ độ bẻ cong = d * hàm của hướng) -> tính sẵn thành bảng theo
    // góc; rimFoot được gọi cho mọi đỉnh lưới + mọi lần đặt vật nên không tính lại 6 lần nhiễu mỗi lần gọi
    // Dáng tổng thể theo seed (bộ số riêng, không xáo trộn phần khác). Trước đây chỉ có nhiễu lượn sóng ±5% quanh bán kính
    // cố định -> thung lũng mọi map gần như tròn xoe. Giờ: thuôn dài theo một trục ngẫu nhiên, 2-4 mũi núi (sống núi
    // nhọn dần vào trong) lấn sâu 1,3-2,7 km + 1-2 vịnh thung lũng ăn sâu vào núi ở hướng ngẫu nhiên, nhiễu lượn sóng mạnh hơn
    const rsh = mulberry32((seed ^ 0x2f6b1c55) >>> 0), RSH = (a, b) => a + rsh() * (b - a);
    const elong = RSH(0.05, 0.16), elongA = RSH(0, Math.PI);
    const lobes = [];   // [hướng, nửa bề rộng góc, độ sâu (âm = mũi núi lấn vào, dương = vịnh ăn ra)]
    for (let k = 0, n = 2 + Math.floor(rsh() * 3); k < n; k++) lobes.push([RSH(0, Math.PI * 2), RSH(0.09, 0.2), -RSH(1300, 2700)]);
    for (let k = 0, n = 1 + Math.floor(rsh() * 2); k < n; k++) lobes.push([RSH(0, Math.PI * 2), RSH(0.16, 0.34), RSH(450, 950)]);
    // ĐỘ CAO VÀNH NÚI THEO HƯỚNG: vành cao đều mọi phía làm lòng chiến trường thành đáy chảo kín (miệng núi lửa). Giờ cả
    // vùng nghiêng về một phía (một bên núi cao, bên đối diện chỉ còn dải đồi thấp) + 1-3 khe đèo rộng nơi vành núi hạ
    // gần hết -> nhìn ra được đồng bằng / biển cát / bờ biển bên ngoài. Tường giữ xe tính theo chân núi, không theo độ cao
    const tiltA = RSH(0, Math.PI * 2), tiltK = RSH(0.35, 0.6);
    const gaps = [];
    for (let k = 0, n = 1 + Math.floor(rsh() * 3); k < n; k++) gaps.push([RSH(0, Math.PI * 2), RSH(0.12, 0.3), RSH(0.6, 0.85)]);
    const RFN = 8192, RFT = new Float32Array(RFN + 1), RKT = new Float32Array(RFN + 1);
    for (let a = 0; a <= RFN; a++) {
      const t = a / RFN * Math.PI * 2, x = Math.cos(t), z = Math.sin(t);
      // bẻ cong toạ độ trước khi lấy nhiễu: đường chân núi méo theo vùng, không toả đều từ tâm
      const wx = x + 0.45 * on(x * 0.9 + 4.4, z * 0.9 - 2.2), wz = z + 0.45 * on(x * 0.9 - 7.1, z * 0.9 + 1.3);
      // bán kính nền như nhau mọi hướng (không bám khung vuông); nền đủ nhỏ để phần lồi ra ít khi chạm giới hạn mép
      // (chỗ đó bị ép phẳng thành cạnh thẳng)
      let r = HALF * 0.77 * (1 + elong * Math.cos(2 * (t - elongA)))
        + 560 * angN(wx, wz, 1.3, 11.3) + 330 * angN(wx, wz, 3.1, 3.1) + 150 * angN(wx, wz, 7.3, 5.5) + 60 * angN(wx, wz, 15.1, 2.7);
      // mũi núi / vịnh: chuông theo góc -> mũi núi thu hẹp dần về phía tâm như sống núi thật; tâm lệch nhẹ theo nhiễu
      // -> sống mũi núi cong, không thẳng tắp hướng tâm
      for (const [a0, w, d] of lobes) {
        let da = Math.abs(t - a0 - 0.06 * angN(wx, wz, 4.2, a0)) % (Math.PI * 2);
        da = Math.min(da, Math.PI * 2 - da) / w;
        r += d * Math.exp(-da * da);
      }
      RFT[a] = r;
      let k = (1 + tiltK * Math.cos(t - tiltA)) * (0.85 + 0.3 * (angN(wx, wz, 2.0, 8.8) + 0.5));
      for (const [a0, w, dep] of gaps) {
        let da = Math.abs(t - a0) % (Math.PI * 2);
        da = Math.min(da, Math.PI * 2 - da) / w;
        k *= 1 - dep * Math.exp(-da * da);
      }
      RKT[a] = Math.max(0.12, k);
    }
    // hệ số độ cao vành núi theo hướng nhìn từ tâm (bảng RKT)
    const rimK = (x, z) => {
      const ur = ((Math.atan2(z, x) / (Math.PI * 2) + 1) % 1) * RFN, ir = Math.floor(ur);
      return RKT[ir] + (RKT[ir + 1] - RKT[ir]) * (ur - ir);
    };
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
    function boxDist(x, z) { const m = Math.max(Math.abs(x), Math.abs(z)); return m < 1e-3 ? HALF - 60 : (HALF - 60) / m * Math.hypot(x, z); }
    // đồng bằng ven biển chỉ bắt đầu sau chân núi + 900 (ngoài tường giữ xe)
    function coastIn(x, z) { return rimFoot(x, z) + 900; }
    function rimRaise(x, z) {
      const d = Math.hypot(x, z), foot = rimFoot(x, z);
      const s = d - foot;
      if (s <= 0) return 0;
      // chân vành: sườn đều dốc ~0.6 như trước, lên cao thì thoải dần về đỉnh (không còn mặt nón thẳng đuột)
      const rk = rimK(x, z), pk = OUT.peak * (0.8 + 0.5 * fbm(on, x * 0.0005 + 3, z * 0.0005, 3)) * rk;
      // chân dốc mềm (độ dốc tăng dần từ 0) -> không có nếp gãy tròn nơi đồng bằng chạm chân núi. Đoạn vành thấp (đèo, phía
      // đồi thấp) sườn cũng thoải theo: gò thấp mà sườn dốc 0.6 thì thành một gờ mảnh chạy vòng như bờ đê
      // chân núi thoải dần ~300 (dải quạt bồi tích): chuyển từ đồng bằng sang sườn trong 1 ô lưới thì thành nếp gãy chạy
      // vòng quanh map, nhìn từ xa / nắng xiên thấy rõ như một đường kẻ
      const se = s * s / (s + 300);
      let r = pk * (1 - Math.exp(-se * 0.6 * (0.25 + 0.75 * Math.min(1, rk)) / pk));
      // sống núi, yên ngựa, khe suối: dải sống núi uốn lượn liên hoàn, đỉnh bo tròn tự nhiên, không nhọn hoắt thành chóp nón
      const rRidge1 = ridged(on, x * 0.00045 + 5.2, z * 0.00045 - 3.1, 4);
      const rRidge2 = fbm(on, x * 0.00085 - 1.7, z * 0.00085 + 4.2, 3);
      const rRidge = 0.62 + 0.62 * (1 - Math.exp(-rRidge1 * 2.2)) + 0.18 * (rRidge2 - 0.5);
      r *= lerp(1, rRidge, smooth(60, 700, s));
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
        // khối núi lớn nhỏ uốn lượn bề thế: có dãy cao vút, có vùng đồi thấp / thung lũng rộng giữa các dãy
        const rv1 = ridged(on, x * 0.00024 + 4, z * 0.00024, 5);
        const rv2 = ridged(on, x * 0.00055 - 2, z * 0.00055 + 5, 4);
        const massShape = (1 - Math.exp(-rv1 * 2.4)) * 0.72 + (1 - Math.exp(-rv2 * 2.0)) * 0.28;
        const amp = 350 + 950 * smooth(-0.35, 0.45, fbm(on, x * 0.00016 + 8, z * 0.00016 - 3, 2));
        h += massShape * amp * smooth(3200 + O0, 4600 + O0, d);
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
      for (const c of strongholdSites) {
        let base = 0, n = 0;
        for (let a = 0; a < 12; a++) { base += H(c.x + Math.cos(a * 0.5236) * 300, c.z + Math.sin(a * 0.5236) * 300); n++; }
        // đô thị: không đắp đồi giữa phố — chỉ một gò thấp ~3 m (cứ điểm bê tông dưới ụ đất trên quảng trường)
        const hill = type === 'URBAN' ? c.hill * 0.3 : c.hill;
        strongholds.push({ id: c.id, x: c.x, z: c.z, angle: c.angle, G: Math.round((base / n + hill) * 10) / 10 });
      }
      // CÂN BẰNG: cứ điểm và ảnh đối xứng đổi phe của nó (tiền đồn A <-> C) cùng cốt đỉnh đồi — lấy cái cao hơn để đồi
      // nào cũng cao ít nhất hill so với đất quanh nó (địa hình ngẫu nhiên: trước đây tiền đồn A cao 144, C chỉ 82)
      for (const c of strongholds) {
        const [px, pz] = symP(c.x, c.z), p = strongholds.find(q => Math.hypot(q.x - px, q.z - pz) < 1);
        if (p && p !== c) p.G = c.G = Math.max(c.G, p.G);
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
    // (hồ không cần sông: ao ốc đảo sa mạc, xem 4b)
    const isWater = (x, z) => river || lakes.length ? ((river && ((n) => n.d < n.hw)(river.near(x, z))) || lakes.some(L => Math.hypot(x - L.x, z - L.z) < L.r) || H(x, z) < 1.2)
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
      const EXT = Math.round(980 * K);
      // cw: bề rộng lòng đường, walk: vỉa hè mỗi bên, lanes: số làn kẻ vạch, r: bán kính bo bó vỉa góc phố
      const URB = {
        avenue: { cw: 120, walk: 32, lanes: 4, r: 64 },   // đại lộ: 15 m, 4 làn, vỉa hè 4 m
        main: { cw: 76, walk: 24, lanes: 2, r: 48 },      // phố chính: 9,5 m, vỉa hè 3 m
        local: { cw: 52, walk: 16, lanes: 2, r: 36 },     // phố thường: 6,5 m, vỉa hè 2 m
        canal: { cw: 150, walk: 28, lanes: 0, r: 0 }      // kênh: mặt nước 19 m, kè + lối dạo bờ kênh 3,5 m mỗi bên
      };
      // lưới phố trùm qua mọi cứ điểm (+ 1 dãy ô phía ngoài): trước đây lưới dừng ở ~±3000 -> tiền đồn A / C (±3375) nằm
      // giữa bãi cỏ ngoại ô. cov(axis): toạ độ lớn nhất của cứ điểm theo trục đó trong hệ (u, v) đã xoay
      const cov = ax => Math.max(2200, ...strongholdSites.map(c => Math.abs(ax ? -c.x * sr + c.z * cr : c.x * cr + c.z * sr) + 500));
      const mkLines = ax => {
        const L = [{ a: R(-50, 50), cls: 'avenue' }], need = cov(ax);
        for (const dir of [1, -1]) {
          let q = L[0].a, n = 0;
          for (;;) {
            const gap = R(1280, 1780), nx = q + dir * gap;
            // (bố cục cứ điểm: lưới vừa đủ trùm cứ điểm + 1 dãy ô — phố trải tới ±4400 mọi phía làm số nhà phải dựng gấp
            // đôi mà phần lớn nằm xa chỗ giao tranh)
            const ext = SH ? need : EXT;
            if (Math.abs(nx) > Math.min(ext + 1780, HALF * 0.85) || Math.abs(q) >= ext) break;
            // chia đôi khoảng rộng ở vùng giữa thành phố (bố cục cứ điểm: vùng hẹp hơn — mỗi ô thêm ~0,37 triệu tam giác vỉa
            // hè / bó vỉa; lõi ô đã có dãy nhà trong hẻm + ngõ xuyên)
            if (gap > 1520 && Math.abs(q) < (SH ? 1300 : 1800)) L.push({ a: q + dir * gap * R(0.44, 0.56), cls: 'local' });
            n++;
            L.push({ a: nx, cls: n % 3 === 0 ? 'avenue' : 'main' });   // cứ 3 phố chính có 1 đại lộ vành đai
            q = nx;
          }
        }
        L.sort((p, q) => p.a - q.a);
        for (const l of L) l.b = l.cls === 'avenue' ? 0 : R(-0.012, 0.012);
        return L;
      };
      const lu = mkLines(0), lv = mkLines(1);
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
      // Ô phố giáp cứ điểm / công trình bối cảnh vẫn giữ (trước đây bỏ cả ô 1300-1800 -> cứ điểm nằm giữa bãi trống, phố
      // không nhà chạy quanh): từng nhà tự né quảng trường quanh hầm (clearOfKeys) / khuôn viên công trình / đường vào cửa hầm
      const inSpawn = (x, z) => Math.abs(x) < SPAWN.halfX + 40 && ((z > SPAWN.blue.z0 - 40 && z < SPAWN.blue.z1 + 40) || (z > SPAWN.red.z0 - 40 && z < SPAWN.red.z1 + 40));
      const blocks = [];
      for (let i = 0; i < lu.length - 1; i++) for (let j = 0; j < lv.length - 1; j++) {
        const vS = lv[j].a, vN = lv[j + 1].a;
        const W = Object.assign({}, lu[i], { cls: clsAt(lu[i], vS, vN) }), E = Object.assign({}, lu[i + 1], { cls: clsAt(lu[i + 1], vS, vN) }), S = lv[j], N = lv[j + 1];
        const quad = off => [xUV(W, off(W), S, off(S)), xUV(E, -off(E), S, off(S)), xUV(E, -off(E), N, -off(N)), xUV(W, off(W), N, -off(N))];
        const curb = quad(offC), lot = quad(offL);
        const cx = (curb[0][0] + curb[1][0] + curb[2][0] + curb[3][0]) / 4, cz = (curb[0][1] + curb[1][1] + curb[2][1] + curb[3][1]) / 4;
        const probe = curb.concat(curb.map((p, k) => [(p[0] + curb[(k + 1) % 4][0]) / 2, (p[1] + curb[(k + 1) % 4][1]) / 2]), [[cx, cz]]);
        if (probe.some(p => Math.hypot(p[0], p[1]) > rimFoot(p[0], p[1]) - 50)) continue;
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
      // bán kính phân khu theo cỡ thật của thành phố (ô xa tâm nhất), không theo số cố định (thành phố thường chỉ tới
      // ~4500 nên trước đây khu biệt thự d > 4700 / kho xưởng |x| > 3600 gần như không bao giờ có)
      const Rc = Math.max(1, ...blocks.map(B => Math.hypot(B.cx, B.cz)));
      for (const B of blocks) {
        if (B.use) continue;
        const d = Math.hypot(B.cx, B.cz) / Rc, n = fbm(noise2, B.cx * 0.0004 + 3.1, B.cz * 0.0004 - 1.7, 2);
        const nearLm = landmarks.some(L => lmOut(L, B.cx, B.cz) < 680);
        B.use = nearLm ? 'industrial' : (d < 0.4 ? 'cbd' : (Math.abs(B.cx) / Rc > 0.7 && d > 0.62 && n > 0.05) ? 'industrial' : d > 0.8 ? 'suburb' : 'mixed');
      }
      // ô sát cứ điểm là khu phố hỗn hợp dày nhà (biệt thự / kho xưởng thưa -> cứ điểm lại trơ trọi giữa bãi)
      // (1300: cứ điểm B ở tâm nằm đúng ngã tư 2 đại lộ trung tâm, tâm 4 ô quanh nó cách ~960)
      const nearSHB = B => SH && strongholds.some(c => Math.hypot(c.x - B.cx, c.z - B.cz) < 1300);
      for (const B of blocks) if (nearSHB(B) && (B.use === 'suburb' || B.use === 'industrial') && !landmarks.some(L => lmOut(L, B.cx, B.cz) < 680)) B.use = 'mixed';
      // chọn ngẫu nhiên n ô thoả điều kiện, chưa làm lô đặc biệt
      const pickBlocks = (n, ok) => {
        const C = blocks.filter(B => ok(B) && !B.special), out = [];
        for (let k = 0; k < n && C.length; k++) { const B = C.splice(Math.floor(rng() * C.length), 1)[0]; B.special = true; out.push(B); }
        return out;
      };
      // ô sát cứ điểm không làm công viên / quảng trường / bãi đỗ xe (lô trống trải -> cứ điểm lại nằm giữa bãi trống)
      // số lô đặc biệt co theo số ô phố (thành phố nhỏ ~30 ô: trước đây trường / chợ / bệnh viện / bãi xe chiếm hết ô hỗn hợp)
      const nB = (max, f) => Math.max(1, Math.min(max, Math.round(blocks.length * f)));
      for (const B of pickBlocks(Math.round(blocks.length * 0.08), B => B.use !== 'industrial' && !B.spawn && !nearSHB(B))) B.use = 'park';
      for (const B of pickBlocks(2, B => B.use === 'cbd' && !nearSHB(B))) B.use = 'plaza';
      for (const [use, n, from] of [['school', nB(4, 0.08), ['mixed', 'suburb']], ['church', nB(2, 0.04), ['mixed', 'suburb']], ['market', nB(2, 0.04), ['mixed']],
        ['hospital', 1, ['mixed', 'cbd']], ['parking', nB(3, 0.06), ['cbd', 'mixed']]])
        for (const B of pickBlocks(n, B => from.includes(B.use) && !B.spawn && !nearSHB(B))) B.use = use;
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
        // hẻm xe hơi 5 m: xe tăng (rộng 2,75-4 m) luồn được qua giữa ô phố (trước đây ngõ 3 m — không xe nào lọt)
        roads.push({ pts, width: 40, kind: 'asphalt', cls: 'alley', walk: 0, lanes: 0 });
        B.alley = { k, t };
      }
      roads.urbanGrid = { lu, lv, rot, URB, blocks, canal: canalL };
      // Cắt bỏ đoạn phố ngoài lòng thung lũng (lưới phố trải tới ±1560K, xa hơn chân vành núi: trước đây ~1/3 mặt đường
      // nhựa bò lên sườn núi, dốc dựng) và đoạn xuyên đồi cứ điểm (mặt đường nhựa lộ qua sân bê tông / chui dưới ụ đất)
      {
        const ug = roads.urbanGrid, keep = [];
        // quảng trường quanh hầm (đỉnh gò bằng phẳng ~345) + đường vào cửa hầm: không có phố chạy qua
        const nearSH = (x, z) => SH && (portalBlocked(x, z, 0) || strongholds.some(c => Math.hypot(x - c.x, z - c.z) < 360));
        // phố chỉ có trong thành phố (giáp một ô phố, cách mép bó vỉa < 140): ngoài rìa không còn lưới phố trống không nhà;
        // đại lộ vẫn chạy tiếp ra ngoại ô làm đường trục
        const quadDist = (Q, x, z) => {
          let inside = true, d = Infinity;
          for (let k = 0; k < 4; k++) {
            const a = Q[k], b = Q[(k + 1) % 4], ex = b[0] - a[0], ez = b[1] - a[1], L2 = ex * ex + ez * ez || 1;
            if ((x - a[0]) * ez - (z - a[1]) * ex > 0) inside = false;
            const t = Math.max(0, Math.min(1, ((x - a[0]) * ex + (z - a[1]) * ez) / L2));
            d = Math.min(d, Math.hypot(a[0] + ex * t - x, a[1] + ez * t - z));
          }
          return inside ? 0 : d;
        };
        // (mép bó vỉa có thể quấn ngược chiều kim đồng hồ: điểm trong theo cả 2 chiều)
        const inCity = (x, z) => blocks.some(B => Math.hypot(B.cx - x, B.cz - z) < 1600 && Math.min(quadDist(B.curb, x, z), quadDist(B.curb.slice().reverse(), x, z)) < 140);
        const cut = (rd, x, z) => Math.hypot(x, z) > rimFoot(x, z) - 30 || nearSH(x, z) || (rd.cls !== 'avenue' && !inCity(x, z));
        for (const rd of roads) {
          let run = [];
          const flush = () => { if (run.length >= 2) keep.push(Object.assign({}, rd, { pts: run })); run = []; };
          for (const p of rd.pts) { if (cut(rd, p[0], p[1])) flush(); else run.push(p); }
          flush();
        }
        roads.length = 0; roads.push(...keep); roads.urbanGrid = ug;
        for (let k = bridges.length - 1; k >= 0; k--) {
          const b = bridges[k];
          if (b.urban && (cut({ cls: 'main' }, b.x, b.z) || !keep.some(rd => rd.pts.some(p => Math.hypot(p[0] - b.x, p[1] - b.z) < 30)))) bridges.splice(k, 1);
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
      // Tuyến đường đại lộ chính tiếp cận thẳng vào cổng căn cứ chiến lược (URBAN Landmark Access)
      if (landmarks.length) {
        const grid = roads.slice();
        for (const L of landmarks) {
          const G0 = [L.x + L.fx * L.hu, L.z + L.fz * L.hu];
          const D_straight = 120;
          const G1 = [L.x + L.fx * (L.hu + D_straight), L.z + L.fz * (L.hu + D_straight)];
          let best = null, bd = Infinity;
          for (const rd of grid) for (const p of rd.pts) {
            const dx = p[0] - G1[0], dz = p[1] - G1[1], d = Math.hypot(dx, dz);
            if (d > 2400) continue;
            const dot = (dx * L.fx + dz * L.fz) / (d || 1);
            const score = d * (1.2 - 0.4 * Math.max(0, dot));
            if (score < bd) { bd = score; best = p; }
          }
          const pts = [];
          const add = (a, b) => {
            const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 14));
            for (let i = pts.length ? 1 : 0; i <= n; i++) pts.push([lerp(a[0], b[0], i / n), lerp(a[1], b[1], i / n)]);
          };
          add(G0, G1);
          if (best && Math.hypot(best[0] - G1[0], best[1] - G1[1]) > 20) {
            const mid = [G1[0] + L.fx * 50, G1[1] + L.fz * 50];
            add(G1, mid);
            add(mid, best);
          }
          roads.push({
            pts: resample(chaikin(chaikin(pts)), 14),
            width: 44,
            kind: 'asphalt',
            access: true,
            landmarkLink: true,
            cls: 'avenue',
            walk: 8,
            lanes: 4
          });
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
              if (lmCell[n] && Math.hypot(ni - ex, nj - ez) > 6 && Math.hypot(ni - sx, nj - sz) > 6) continue; // mặt bằng công trình: đường đi vòng
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
        // Mạng đường CÙNG SƠ ĐỒ cho hai phe (sơ đồ bất biến qua phép đối xứng đổi phe), mỗi tuyến tự tìm theo địa hình
        // thật. Tìm xen kẽ Xanh - Đỏ: không phe nào được nhập vào đường của phe kia trước cả loạt
        const toMouth = (from, c, sg, w, head) => route(from, mouth(c, sg), w, B.roadKind, false, tailOf(c, sg), head);
        // miệng hầm của cứ điểm c gần điểm p hơn
        const sgNear = (c, p) => { const a = mouth(c, 1), b = mouth(c, -1); return Math.hypot(a.x - p.x, a.z - p.z) <= Math.hypot(b.x - p.x, b.z - p.z) ? 1 : -1; };
        const bB = sgNear(cB, B0), bR = sgNear(cB, R0);
        // căn cứ -> miệng hầm phía nhà của cả 3 cứ điểm; tiền đồn -> miệng hầm phía nhà của B (miệng tiền đồn quay về
        // phía B). Soi gương: A, C mỗi cái tự đối xứng -> cả 2 tiền đồn nối B ở cả 2 phía; qua tâm: A (Xanh) <-> C (Đỏ)
        toMouth(B0, cB, bB, 36); toMouth(R0, cB, bR, 36);
        for (const c of [cA, cC]) { toMouth(B0, c, sgNear(c, B0), 28); toMouth(R0, c, sgNear(c, R0), 28); }
        const links = SYM === 'point' ? [[cA, bB], [cC, bR]] : [[cA, bB], [cA, bR], [cC, bB], [cC, bR]];
        for (const [c, bm] of links) {
          // miệng tiền đồn phía cùng phe với miệng B (soi gương: A nối B phía Xanh bằng miệng phía Xanh của A)
          const tgt = mouth(cB, bm), sg = SYM === 'point' ? sgNear(c, cB) : sgNear(c, tgt);
          toMouth(mouth(c, sg), cB, bm, 32, tailOf(c, sg).reverse());
        }
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
          // cổng nối cả hai miệng hầm B (phía Xanh và phía Đỏ) -> không nghiêng về phe nào
          toMouth(b, cB, bB, 24); toMouth(b, cB, bR, 24);
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
        if (rd.access) { keep.push(rd); continue; }
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
        const add = L.silo ? nukeCoarse(L, f, r) : landmarkMound(L, f, r), nz = (a) => a > 0 && !L.silo ? noise(x * 0.03, z * 0.03) * 1.6 * Math.min(1, a / 20) : 0;
        // add < 0: hố hạ nền dưới sân khoét (hầm sinh học) — sàn thật là mặt sân bê tông (Landmarks surfaceAt)
        // gò hầm sinh học: nút nào bị hạ nền thì lưu phần bị hạ (gò chưa hạ - đã hạ) vào L.mound.orig [k, dh, ...] ->
        // nắp đất (landmarks/bio.js) dựng lại đúng mặt đất cũ, chỉ cắt đứng tại mép sân
        if (L.mound && L.mound.pf !== undefined) {
          const a0 = landmarkMound(L, f, r, 'orig');
          if (Math.abs(a0 - add) > 0.01) (L.mound.orig || (L.mound.orig = [])).push(k, a0 + nz(a0) - add - nz(add));
        }
        if (add) heights[k] += add + nz(add);
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
    // Đô thị: nền vỉa hè / sân bê tông giữa các tòa nhà — chỉ trong các ô phố (mép bó vỉa nới 40); ngoài thành phố là đất
    // tự nhiên (trước đây cả thung lũng lát bê tông tới chân núi). Ô phố là tứ giác lồi: điểm trong khi cùng phía mọi cạnh
    if (type === 'URBAN' && roads.urbanGrid) {
      for (const Bk of roads.urbanGrid.blocks) {
        const Q = Bk.curb, xs = Q.map(p => p[0]), zs = Q.map(p => p[1]), M = 40;
        const i0 = Math.max(0, Math.floor((Math.min(...xs) - M + HALF) / CELL)), i1 = Math.min(RES, Math.ceil((Math.max(...xs) + M + HALF) / CELL));
        const j0 = Math.max(0, Math.floor((Math.min(...zs) - M + HALF) / CELL)), j1 = Math.min(RES, Math.ceil((Math.max(...zs) + M + HALF) / CELL));
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const x = -HALF + i * CELL, z = -HALF + j * CELL, k = j * N + i;
          if (surface[k] !== 0) continue;
          let pos = 0, neg = 0;
          for (let e = 0; e < 4; e++) {
            const a = Q[e], b = Q[(e + 1) % 4], ex = b[0] - a[0], ez = b[1] - a[1], L = Math.hypot(ex, ez) || 1;
            const s = ((x - a[0]) * ez - (z - a[1]) * ex) / L;   // khoảng cách có dấu tới cạnh
            if (s > -M) pos++;
            if (s < M) neg++;
          }
          if (pos === 4 || neg === 4) surface[k] = 3;
        }
      }
    }

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
      // khu xuất kích chừa trống — trừ đô thị: xe xuất phát ở rìa ngoại ô (game.js), không ở khu này -> phố vẫn có nhà
      if (type !== 'URBAN' && Math.abs(x) < SPAWN.halfX + r && ((z > SPAWN.blue.z0 - r && z < SPAWN.blue.z1 + r) || (z > SPAWN.red.z0 - r && z < SPAWN.red.z1 + r))) return false;
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

    // 4b. ỐC ĐẢO (sa mạc): 1-3 ao nước ở chỗ trũng giữa các đụn (không trên núi bàn), xa cứ điểm / khu xuất kích, cách
    // đường một quãng (làng dựa vào ốc đảo nằm bên đường, xem 5b). Đào lòng chảo thoải xuống mặt nước (mực nước chung
    // 0,2), đáy ao sâu ~1 m, bờ méo tự nhiên. Ghi vào lakes -> mặt nước, lội nước, bản đồ chiến thuật dùng chung như hồ
    const oases = [];
    const OASIS_BANK = 280;
    if (type === 'DESERT') {
      stage('oasis');
      const nO = 1 + Math.floor(rng() * 2.6);
      const okSite = (x, z, r) => {
        if (!clearOfKeys(x, z, r + OASIS_BANK + 120) || mesaN(x, z) > MESA_T - 0.12) return null;
        const nr = nearestRoad(x, z, 1300);
        if (!nr || nr.d < r + OASIS_BANK + 70 || nr.road.portal || nr.road.access) return null;
        // đoạn đường gần ao phải đủ chỗ dựng làng (không sát cứ điểm / khu xuất kích / công trình)
        const rp = nr.road.pts[Math.min(nr.road.pts.length - 1, Math.round(nr.t))];
        return clearOfKeys(rp[0], rp[1], 200) ? nr : null;
      };
      const cand = [];
      for (let k = 0; k < 600; k++) {
        const x = R(-HALF, HALF) * 0.8, z = R(-HALF, HALF) * 0.8, r = R(110, 160);
        const nr = okSite(x, z, r);
        if (!nr) continue;
        let ring = 0;
        for (let a = 0; a < 12; a++) ring += H(x + Math.cos(a * 0.5236) * 480, z + Math.sin(a * 0.5236) * 480);
        // trũng hơn vùng xung quanh càng tốt, gần đường hơn một chút cũng tốt
        cand.push({ x, z, r, score: H(x, z) - ring / 12 + nr.d * 0.006 });
      }
      cand.sort((a, b) => a.score - b.score);
      for (const c of cand) {
        if (oases.length >= nO) break;
        if (oases.some(o => Math.hypot(o.x - c.x, o.z - c.z) < 2600)) continue;
        oases.push({ x: c.x, z: c.z, r: c.r });
      }
      for (const O of oases) {
        const Rr = O.r + OASIS_BANK + 50;
        const i0 = Math.max(0, Math.floor((O.x - Rr + HALF) / CELL)), i1 = Math.min(RES, Math.ceil((O.x + Rr + HALF) / CELL));
        const j0 = Math.max(0, Math.floor((O.z - Rr + HALF) / CELL)), j1 = Math.min(RES, Math.ceil((O.z + Rr + HALF) / CELL));
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const x = -HALF + i * CELL, z = -HALF + j * CELL, k = j * N + i;
          const dl = Math.hypot(x - O.x, z - O.z) + fbm(noise2, x * 0.006, z * 0.006, 2) * 40;
          if (dl > O.r + OASIS_BANK) continue;
          const bed = dl < O.r ? lerp(-8, -1.6, smooth(0, O.r, dl)) : lerp(-1.4, heights[k], smooth(O.r, O.r + OASIS_BANK, dl));
          if (bed < heights[k]) heights[k] = bed;
          if (heights[k] < 0.2) surface[k] = 2;
        }
        lakes.push({ x: O.x, z: O.z, r: O.r, oasis: true });
      }
    }
    // khoảng cách tới mép nước ốc đảo gần nhất (Infinity nếu không có)
    const oasisD = (x, z) => { let d = Infinity; for (const O of oases) d = Math.min(d, Math.hypot(x - O.x, z - O.z) - O.r); return d; };

    // 5a. Boong-ke móng ngựa cũ đã bỏ: điểm tựa phòng thủ giờ là các cứ điểm bê tông dưới ụ đất (strongholds)
    const bunkers = [];
    const wr = mulberry32((seed ^ 0x6b1d2e37) >>> 0), WR = (a, b) => a + wr() * (b - a);
    // 5a''. TÀN TÍCH TRẬN ĐÁNH QUANH CỨ ĐIỂM (strongholds.js dựng hình): xác xe bị hạ (mô hình xe thật + hư hại thật) và
    // hố bom lớn nhỏ trên sườn đồi. Bộ số ngẫu nhiên riêng theo hạt giống bản đồ -> mỗi bản đồ một kiểu, mọi máy giống
    // nhau, không làm lệch phần còn lại của bản đồ. Đặt trước nhà / đá / cây (các vật đó né tàn tích)
    if (strongholds.length) {
      // [loại xe, bán kính chiếm chỗ]: xe tăng Halberd, xe chi viện Hailstorm, pháo tự hành Arbalest, xe trinh sát Marten
      const KINDS = [['ALL_ROUNDER', 28], ['ALL_ROUNDER', 28], ['GATLING', 28], ['ARTILLERY', 34], ['SCOUT', 18]];
      const KILLS = ['det', 'det', 'burn', 'burn', 'crew', 'blast'];
      const inValley = (x, z, r) => {
        if (Math.hypot(x, z) > rimFoot(x, z) - 90 - r) return false;
        for (const L of landmarks) if (lmOut(L, x, z) < r + 34) return false;
        if (Math.abs(x) < SPAWN.halfX + r && ((z > SPAWN.blue.z0 - r && z < SPAWN.blue.z1 + r) || (z > SPAWN.red.z0 - r && z < SPAWN.red.z1 + r))) return false;
        return true;
      };
      for (const c of strongholds) {
        const ca = Math.cos(c.angle), sa = Math.sin(c.angle);
        const toW = (f, r) => [c.x + f * ca - r * sa, c.z + f * sa + r * ca];
        // ngoài khối hầm + sân phễu, không chắn đường thẳng vào cửa hầm, không lấn sang đồi cứ điểm khác
        const offCore = (f, r, rad) => !(Math.abs(f) < 230 + rad && Math.abs(r) < 140 + rad) && !(Math.abs(f) < PORTAL.APP + 40 && Math.abs(r) < 60 + rad);
        const farOthers = (x, z, rad) => strongholds.every(o => o === c || Math.hypot(x - o.x, z - o.z) > 360 + rad);
        const okAt = (x, z, rad, slope) => inValley(x, z, rad) && farOthers(x, z, rad) && !isWater(x, z) && slopeAt(x, z) < slope &&
          roadClear(x, z, rad * 0.6) && portalClear(x, z, rad * 0.6) && freeOf(x, z, rad);
        c.wrecks = []; c.craters = [];
        const nW = 4 + Math.floor(wr() * 3);
        for (let t = 0; c.wrecks.length < nW && t < nW * 40; t++) {
          const th = wr() * Math.PI * 2, dist = WR(290, 640);
          const f = Math.cos(th) * dist, r = Math.sin(th) * dist;
          const [type, rad] = pick(wr, KINDS);
          if (!offCore(f, r, rad)) continue;
          const [x, z] = toW(f, r);
          if (!okAt(x, z, rad, 0.3) || c.wrecks.some(w => Math.hypot(w.x - x, w.z - z) < 75)) continue;
          const kill = pick(wr, KILLS);
          // tháp văng (nổ kho đạn): rơi cách thân vài mét, phải nằm trên đất trống
          let turret = null;
          if (type !== 'SCOUT' && kill === 'det' && wr() < (type === 'ALL_ROUNDER' ? 0.6 : 0.35)) {
            const ta = wr() * Math.PI * 2, td = WR(30, 52), tx = x + Math.cos(ta) * td, tz = z + Math.sin(ta) * td;
            if (okAt(tx, tz, 12, 0.4) && inValley(tx, tz, 12)) turret = { x: Math.round(tx), z: Math.round(tz), yaw: WR(0, 6.28), roll: WR(-1, 1), flip: wr() < 0.3 };
          }
          c.wrecks.push({ x: Math.round(x), z: Math.round(z), angle: WR(0, 6.28), type, team: wr() < 0.5 ? 'BLUE' : 'RED', kill, turret, tRot: WR(-1.6, 1.6), seed: (wr() * 4294967296) >>> 0 });
          occupied.push({ x, z, r: rad });
          if (turret) occupied.push({ x: turret.x, z: turret.z, r: 12 });
        }
        // hố bom: 1-2 hố lớn (bom / lựu pháo cỡ lớn ~4-5 m) + vài hố nhỏ (lựu pháo / cối ~1,5-2,5 m)
        const nBig = 1 + Math.floor(wr() * 2), nC = nBig + 3 + Math.floor(wr() * 3);
        for (let t = 0; c.craters.length < nC && t < nC * 40; t++) {
          const big = c.craters.length < nBig;
          const th = wr() * Math.PI * 2, dist = WR(250, 660);
          const f = Math.cos(th) * dist, r = Math.sin(th) * dist;
          const R0 = big ? WR(58, 80) : WR(22, 40), rad = R0 * 0.7;
          if (!offCore(f, r, rad)) continue;
          const [x, z] = toW(f, r);
          // trong vòng ụ đất cứ điểm (occupied r 330 chưa ghi) hố vẫn được phép: chỉ né đường / nước / dốc gắt
          if (!okAt(x, z, rad, 0.4) || c.craters.some(q => Math.hypot(q.x - x, q.z - z) < (q.R + R0) * 0.9)) continue;
          c.craters.push({ x: Math.round(x), z: Math.round(z), R: Math.round(R0), d: Math.round((big ? WR(12, 16) : WR(5, 9)) * 10) / 10, a: Math.round(WR(0, 6.28) * 100) / 100 });
          occupied.push({ x, z, r: rad });
        }
      }
    }
    for (const c of strongholds) occupied.push({ x: c.x, z: c.z, r: 330 });

    // Hố bom chiến trường rải rác trên đường phố và quảng trường đô thị (bản đồ URBAN bị bom đạn tàn phá)
    if (type === 'URBAN' && strongholds.length > 0) {
      // quanh cứ điểm B (bố cục FORTRESS: B ở một cánh, không ở tâm bản đồ) — toạ độ thế giới
      const sh0 = strongholds.find(c => c.id === 'B') || strongholds[0];
      const nUrbanCraters = 22 + Math.floor(wr() * 10);
      for (let t = 0; t < nUrbanCraters * 30 && sh0.craters.length < 40; t++) {
        const uDist = WR(80, 880);
        const uAng = wr() * Math.PI * 2;
        const ux = sh0.x + Math.cos(uAng) * uDist;
        const uz = sh0.z + Math.sin(uAng) * uDist;
        if (isWater(ux, uz) || Math.hypot(ux, uz) > rimFoot(ux, uz) - 120) continue;
        if (Math.hypot(ux - sh0.x, uz - sh0.z) < 70) continue; // né lòng cứ điểm B
        const R0 = WR(26, 60);
        const d0 = WR(5, 12);
        if (sh0.craters.some(q => Math.hypot(q.x - ux, q.z - uz) < (q.R + R0) * 0.75)) continue;
        sh0.craters.push({
          x: Math.round(ux),
          z: Math.round(uz),
          R: Math.round(R0),
          d: Math.round(d0 * 10) / 10,
          a: Math.round(WR(0, 6.28) * 100) / 100
        });
      }
    }

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
          for (let q = 40; q < front.across - 30; q += 120) for (let s = 32; s < front.len - 32; s += 44) {
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
          D[(ka + 3) % 4] = Math.min(D[(ka + 3) % 4], B.alley.t * la - 28);
          D[(ka + 1) % 4] = Math.min(D[(ka + 1) % 4], (1 - B.alley.t) * la - 28);
        }
        const gasK = B.gas === undefined ? -1 : B.gas, GW = 230, GD = 200;
        if (gasK >= 0) {
          // cây xăng ở góc gasK (giữa cạnh gasK-1 và gasK): mái che cột bơm + ki-ốt bán hàng phía sau
          const e = E[gasK];
          const [x, z] = at(e, 24 + 75, 24 + 50);
          props.canopies.push({ x, z, angle: e.ang, w: 150, d: 100 });
          putE(e, 24 + 75, 24 + 100 + 24 + 30, 80, 60, 1, 'shop');
        }
        // KHUÔN VIÊN CAO ỐC: một số ô trung tâm / ô mặt đại lộ có mặt tiền chính là khuôn viên riêng thay vì nhà sát vỉa hè —
        // 1-2 cao ốc lùi vào 9-14 m sau sân trước lát đá (mặt sân dựng theo b.yard trong BuildingSet), dải cỏ + hàng cây sát mép
        // lô, rào cây xanh chừa cổng thẳng lối vào sảnh từng toà, bãi đỗ xe hai bên sân. 3 cạnh còn lại vẫn là nhà mặt phố
        // (chọn theo vị trí ô, không lấy số của rng chung -> các ô khác không đổi bố cục)
        const hY = ((Math.sin(cx * 0.0123 + cz * 0.0457) * 43758.5453) % 1 + 1) % 1;
        let yardK = -1;
        if (!B.alley && gasK < 0 && (cbd ? hY < 0.4 : big(front.cls) && hY < 0.22)) {
          const e = front, kp = (e.k + 3) % 4, kn = (e.k + 1) % 4;
          const sb = 72 + 40 * ((hY * 7.31) % 1), dT = Math.min(140 + 40 * ((hY * 3.77) % 1), e.across / 2 - sb - 40);
          const s0 = D[kp] + 40, s1 = e.len - D[kn] - 40;
          if (dT >= 100 && s1 - s0 > 200) {
            yardK = e.k;
            D[e.k] = sb + dT + 24;   // nhà mặt phố 2 cạnh bên dừng sau khuôn viên; lõi ô bắt đầu sau dãy cao ốc
            const gates = [];
            for (let s = s0 + R(0, 40); s1 - s > 170;) {
              const f = Math.min(R(170, 260), s1 - s), kind = cbd ? (rng() < 0.65 ? 'office' : 'apartment') : 'apartment';
              const fl = Math.floor(cbd ? R(12, 21) : R(9, 15));
              if (putE(e, s + f / 2, sb + dT / 2, f, dT, fl, kind)) {
                buildings[buildings.length - 1].yard = { f: sb };   // sân trước sâu sb: từ mặt nhà tới mép lô
                gates.push(s + f / 2);
                // bãi đỗ xe 2 bên sân (đỗ vuông góc mép lô, trên mặt sân lát)
                for (const side of [-1, 1]) for (let m = 0; m < 3; m++) {
                  if (rng() < 0.3) continue;
                  const [x, z] = at(e, s + f / 2 + side * (f / 2 + 16 + m * 20), 30 + (sb - 30) * 0.5);
                  urbanCars.push({ x, z, angle: e.ang + (rng() < 0.5 ? 0 : Math.PI), lot: true, use });
                }
              }
              s += f + R(150, 210);   // sân lát mỗi toà rộng hơn mặt nhà 9 m mỗi bên -> 2 sân kề nhau không chồng
            }
            // hàng cây trên dải cỏ sát mép lô (chừa trước cổng), rào cây xanh dọc mép lô chừa cổng rộng ~6,5 m
            for (let s = s0; s < s1; s += R(46, 64)) {
              if (gates.some(g => Math.abs(g - s) < 36)) continue;
              const [x, z] = at(e, s, 17);
              urbanTrees.push({ x, z, kind: rng() < 0.7 ? 'plane' : 'broadleaf' });
            }
            let a = s0 - 30;
            for (const gx of gates) { if (gx - 26 > a + 10) wall(e, a, gx - 26, 6, 'hedge'); a = gx + 26; }
            if (s1 + 30 > a + 10) wall(e, a, s1 + 30, 6, 'hedge');
          }
        }
        for (let k = 0; k < 4; k++) {
          const e = E[k], kp = (k + 3) % 4;
          if (k === yardK) continue;   // mặt tiền khuôn viên đã xếp ở trên (cả 2 góc giáp nó để trống làm sân vườn)
          // nhà góc ở góc k (giữa cạnh k-1 và cạnh k): mặt tiền ra cả 2 phố
          if (k !== gasK && kp !== yardK) {
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
        // LÕI Ô PHỐ: ô rộng 1300-1800 mà dãy nhà mặt phố chỉ sâu 100-200 -> giữa ô là bãi trống gần 1000. Xếp thêm các dãy
        // nhà trong hẻm (nhà ống / chung cư thấp; trung tâm: cao ốc), chừa hẻm 5,5 m giữa các dãy (xe tăng luồn được), vài
        // chỗ để sân trống có cây. Hệ trục theo cạnh có ngõ xuyên (nếu có) để chừa đúng lối ngõ
        // chỉ ở ô quanh cứ điểm (nơi giao tranh) và khu trung tâm: lấp cả thành phố làm số nhà / tam giác gấp đôi (đo:
        // 491 -> 1600 nhà, 26 -> 48 triệu tam giác mỗi khung)
        if (cbd || (SH && strongholds.some(c => Math.hypot(c.x - cx, c.z - cz) < 1500))) {
          const k = B.alley ? B.alley.k : front.k, e = E[k], LANE = 44;
          const s0 = D[(k + 3) % 4] + LANE, s1 = e.len - D[(k + 1) % 4] - LANE, q0 = D[k] + LANE, q1 = e.across - D[(k + 2) % 4] - LANE;
          const gapS = B.alley && B.alley.k === k ? B.alley.t * e.len : -1e9;
          // khối nhà trong lõi to (dãy nhà liền / chung cư thấp) & 1/3 chỗ để sân trống: đủ che chắn mà không nhân số nhà
          // lên quá nhiều (đô thị nặng nhất về số nhà phải dựng)
          for (let q = q0; q1 - q > 70;) {
            const d = Math.min(R(84, 124), q1 - q);
            for (let s = s0; s1 - s > 70;) {
              const w = Math.min(R(110, 170), s1 - s), sc = s + w / 2, qc = q + d / 2;
              if (Math.abs(sc - gapS) < w / 2 + 28) { s = gapS + 28 + 2; continue; }   // chừa ngõ xuyên
              const [x, z] = at(e, sc, qc);
              if (rng() < 0.33) { if (rng() < 0.6) urbanTrees.push({ x, z, kind: rng() < 0.7 ? 'broadleaf' : 'cypress' }); s += w + LANE; continue; }   // sân trống
              if (freeOf(x, z, Math.max(w, d) * 0.5 + 6)) {
                const kind = rng() < 0.08 ? 'ruin' : cbd ? (rng() < 0.6 ? 'office' : 'apartment') : (rng() < 0.6 ? 'tube' : rng() < 0.5 ? 'apartment' : 'shop');
                put(x, z, w, d, cbd ? Math.floor(R(6, 14)) : Math.floor(R(2, 6)), e.ang, kind);
              }
              s += w + LANE;
            }
            q += d + LANE;
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
      // sa mạc: làng đầu tiên mỗi ốc đảo nằm trên đoạn đường gần ao nhất (làng sa mạc sống nhờ nguồn nước), ruộng tưới
      // (mỗi ốc đảo một hàng chờ các điểm đường gần ao nhất: điểm đầu không xây được — sườn đụn dốc, vướng vật — thì thử điểm kế)
      const oasisQ = oases.map(O => {
        const q = [];
        for (const rd of roads) {
          if (rd.pts.length < 6 || rd.portal || rd.access) continue;
          for (let i = 3; i < rd.pts.length - 3; i += 3) { const d = Math.hypot(rd.pts[i][0] - O.x, rd.pts[i][1] - O.z); if (d < 1700) q.push({ rd, i0: i, d }); }
        }
        // các điểm thử cách nhau >= 240 (điểm sát nhau vướng cùng một vật cản)
        const out = [];
        for (const c of q.sort((a, b) => a.d - b.d)) {
          const p = c.rd.pts[c.i0];
          if (out.length < 10 && !out.some(o => Math.hypot(o.rd.pts[o.i0][0] - p[0], o.rd.pts[o.i0][1] - p[1]) < 240)) out.push(c);
        }
        return out;
      }).filter(q => q.length);
      for (let v = 0, tries = 0; v < nVill && tries < 300; tries++) {
        const ovQ = oasisQ[0] || null, ov = ovQ ? ovQ.shift() : null;
        if (ovQ && !ovQ.length) oasisQ.shift();
        const rd = ov ? ov.rd : roads[Math.floor(rng() * roads.length)];
        if (!rd) break;
        if (rd.pts.length < 6) continue;
        const want = housesOn[1] <= housesOn[-1] ? 1 : -1;
        let i0 = ov ? ov.i0 : Math.floor(R(0.15, 0.85) * rd.pts.length);
        if (!ov) for (let k = 0; k < 6 && (rd.pts[i0][1] > 0 ? 1 : -1) !== want; k++) i0 = Math.floor(R(0.15, 0.85) * rd.pts.length);
        const p = rd.pts[i0];
        if (!ov && (p[1] > 0 ? 1 : -1) !== want) continue;
        const vCrops = ov ? ['veg', 'veg', 'dry'] : crops;
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
          props.fields.push({ x, z, w: fw, d: fd, angle: Math.atan2(st.tz, st.tx), crop: pick(rng, vCrops) });
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
        if (ovQ && oasisQ[0] === ovQ) oasisQ.shift();   // ốc đảo này đã có làng
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
    for (let c = 0, tries = 0; c < clusterN && tries < clusterN * (type === 'DESERT' ? 40 : 12); tries++) {
      const cx = R(-1450, 1450) * K, cz = R(-1450, 1450) * K;
      if (!clearOfKeys(cx, cz, 60) || isWater(cx, cz) || !freeOf(cx, cz, 50)) continue;
      // sa mạc: đá sa thạch là đá vỡ từ vách núi bàn lăn xuống -> dồn ở sườn đá đổ chân vách, ít khi giữa biển cát / trên đỉnh
      if (type === 'DESERT') { const mn = mesaN(cx, cz); if (!(mn > MESA_T - 0.12 && mn < MESA_T - 0.005) && rng() > 0.15) continue; }
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
      const nW = Math.round((type === 'URBAN' ? 18 : Math.floor(R(7, 11))) * AREA);
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
        if (!clearOfKeys(x, z, 30) || !freeOf(x, z, 20) || isWater(x, z) || slopeAt(x, z) > 0.35 || !roadClear(x, z, 8) || strongholdSites.some(s => Math.hypot(x - s.x, z - s.z) < 380)) continue;
        props.wrecks.push({ x, z, angle: ang, kind: pick(rng, type === 'URBAN' ? ['tank', 'tank', 'tank', 'apc', 'dump'] : ['tank', 'tank', 'dump', 'apc']), tilt: R(-0.06, 0.06), roll: R(-0.08, 0.08), turretRot: R(-1.2, 1.2), smoke: rng() < 0.65 });
        occupied.push({ x, z, r: 20 });
        n++;
      }
    }

    // 5d. Bụi rậm (vùng ngụy trang) + cây
    stage('bushes');
    // ô lưới thuộc khu phố (sân / vỉa hè trong ô phố — xem nền bê tông đô thị ở trên)
    const inCityCell = (x, z) => type === 'URBAN' && surface[Math.round((z + HALF) / CELL) * N + Math.round((x + HALF) / CELL)] === 3;
    // đô thị: bụi rậm / bãi cỏ dại ở ngoại ô (ngoài khu phố)
    const bushes = sample(Math.round(B.bushes * AREA), 260, 3000 * AREA, (x, z) => {
      const r = R(55, 90);
      if (!clearOfKeys(x, z, r * 0.6) || isWater(x, z) || !roadClear(x, z, r * 0.4) || inCityCell(x, z)) return false;
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
        trees.push({ x, z, kind: type === 'DESERT' && oasisD(x, z) < 450 ? 'palm' : pick(rng, B.treeKinds), s: R(0.8, 1.25), rot: R(0, 6.28) });
      }
    }
    // Ốc đảo: rặng cọ quanh ao, dày sát mép nước, thưa dần ra rìa chảo trũng
    if (oases.length) {
      stage('oasisPalms');
      for (const O of oases) {
        const n = Math.round(R(40, 60) * O.r / 135);
        for (let k = 0, t = 0; k < n && t < n * 6; t++) {
          const a = R(0, 6.28), dd = O.r + 12 + Math.pow(rng(), 1.8) * 300;
          const x = O.x + Math.cos(a) * dd, z = O.z + Math.sin(a) * dd;
          if (!treeOK(x, z, 3.5) || slopeAt(x, z) > 0.4) continue;
          trees.push({ x, z, kind: 'palm', s: R(0.75, 1.3), rot: R(0, 6.28) });
          k++;
        }
      }
    }
    // Cây phân bố theo mặt nạ rừng / ốc đảo / ven sông
    stage('trees');
    let attempts = 0;
    // đô thị: thêm cây phòng hộ ven căn cứ + vỉa hè; sa mạc: cọ ốc đảo đã trồng, thêm ~45 cây lẻ ngoài ốc đảo
    const nTrees = type === 'URBAN' ? 280 : type === 'DESERT' ? trees.length + Math.round(B.trees * AREA * 0.3) : Math.round(B.trees * AREA);
    while (trees.length < nTrees && attempts < nTrees * 12) {
      attempts++;
      const x = R(-1560, 1560) * K, z = R(-1560, 1560) * K;
      let p;
      if (type === 'DESERT') {
        // ngoài ốc đảo (cọ đã trồng ở trên): keo gai / cây khô lẻ loi, mọc nhiều hơn ở chỗ trũng (lòng khe cạn giữ ẩm)
        p = 0.12 + 0.5 * smooth(0, -6, H(x, z) - H(x + 200, z) * 0.5 - H(x - 200, z) * 0.5);
      } else if (type === 'URBAN') {
        const nr = nearestRoad(x, z, 60);
        const nearLm = landmarks.some(L => { const o = lmOut(L, x, z); return o > 30 && o < 260; });
        p = nearLm ? 0.65 : (nr && nr.d > nr.road.width / 2 + 3 && nr.d < nr.road.width / 2 + 10 ? 0.5 : inCityCell(x, z) ? 0.03 : 0.1);
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
      const kind = type === 'DESERT' ? (oasisD(x, z) < 380 ? 'palm' : pick(rng, B.treeKinds)) : pick(rng, B.treeKinds);
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
      let cx = R(-1350, 1350) * K, cz = R(-1350, 1350) * K;
      const r = type === 'DESERT' || type === 'URBAN' ? R(70, 100) : R(95, 150);
      if (type === 'DESERT') {
        // vườn cọ dày chỉ có ở ốc đảo: bám một phía bờ ao
        if (!oases.length) break;
        const O = oases[Math.floor(rng() * oases.length)], a = R(0, 6.28), dd = O.r + r * R(0.7, 1.1);
        cx = O.x + Math.cos(a) * dd; cz = O.z + Math.sin(a) * dd;
      }
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

    // 5f. CÂN BẰNG VẬT CHE HAI PHE (địa hình / vật thể ngẫu nhiên, không soi gương): đo vật che trên từng hướng tiến vào
    // cứ điểm (hành lang ±400 từ chân cứ điểm ra 1800 về phía căn cứ) và trên mỗi nửa thung lũng, so với vùng tương ứng
    // của phe kia (ảnh qua phép đối xứng đổi phe). Bên thiếu quá ngưỡng được bù bằng cây / đá / xác xe / bụi rậm lấy mẫu
    // từ bên dư (không chép nhà / làng), đặt ở chỗ ngẫu nhiên trong vùng thiếu (không đặt đúng chỗ ảnh: map phải trông
    // ngẫu nhiên, không thành cụm soi gương). Hai nửa map: chuyển bớt từ nửa dư sang nửa thiếu (tổng số vật không phình ra). Đô thị: chỉ các hướng tiến vào
    // cứ điểm (nhà phố tính vào vật che), bù bằng xác xe cháy (không rải đá tảng giữa phố), tối đa 15 xác mỗi hướng
    const balance = [];
    if (SH) {
      stage('balance');
      const W = { tree: 1, rock: 1, wreck: 2, bush: 3, bld: 3 };
      const all = () => [].concat(trees.map(o => ['tree', o]), rocks.filter(o => o.r >= 6).map(o => ['rock', o]),
        props.wrecks.map(o => ['wreck', o]), bushes.map(o => ['bush', o]), buildings.map(o => ['bld', o]));
      const inValley = (x, z) => Math.hypot(x, z) < rimFoot(x, z) - 150;
      // vùng: in(x, z) thuộc vùng; sample() -> một điểm ngẫu nhiên trong vùng
      const corr = (c, b) => {
        const d = Math.hypot(b.x - c.x, b.z - c.z), ux = (b.x - c.x) / d, uz = (b.z - c.z) / d;
        return {
          in: (x, z) => { const f = (x - c.x) * ux + (z - c.z) * uz, r = Math.abs(-(x - c.x) * uz + (z - c.z) * ux); return f > keyR && f < 1800 && r < 400; },
          sample: () => { const f = R(keyR + 20, 1800), r = R(-400, 400); return [c.x + ux * f - uz * r, c.z + uz * f + ux * r]; }
        };
      };
      const half = sg => ({
        in: (x, z) => sg * z > 0 && inValley(x, z),
        sample: () => [R(-HALF, HALF) * 0.85, sg * R(0, HALF) * 0.85]
      });
      // cặp vùng tương ứng [tên, vùng phe Xanh, vùng phe Đỏ, chuyển bớt từ bên dư]
      const pairs = strongholds.map(c => {
        const [px, pz] = symP(c.x, c.z), p = strongholds.find(q => Math.hypot(q.x - px, q.z - pz) < 1) || c;
        return ['hướng ' + c.id, corr(c, bases.blue), corr(p, bases.red), false];
      });
      if (type !== 'URBAN') pairs.push(['nửa map', half(1), half(-1), true]);
      const sum = (inR, L) => L.reduce((s, [k, o]) => s + (inR(o.x, o.z) ? W[k] : 0), 0);
      const nearTree = (x, z, r) => trees.some(t => Math.abs(t.x - x) < r + 4 && Math.abs(t.z - z) < r + 4 && Math.hypot(t.x - x, t.z - z) < r + 4);
      // đặt bản sao vật o (loại k) tại (x, z), xoay ngẫu nhiên
      const place = (k, o, x, z) => {
        const rot = () => R(0, 6.28);
        if (k === 'tree') {
          if (!treeOK(x, z, 4) || slopeAt(x, z) > 0.75 || nearTree(x, z, 3)) return false;
          trees.push(Object.assign({}, o, { x, z, rot: rot() }));
        } else if (k === 'rock') {
          if (!clearOfKeys(x, z, o.r) || !roadClear(x, z, o.r) || !freeOf(x, z, o.r) || isWater(x, z) || nearTree(x, z, o.r)) return false;
          rocks.push(Object.assign({}, o, { x, z, rot: rot() }));
          if (o.r > 9) occupied.push({ x, z, r: o.r });
        } else if (k === 'wreck') {
          if (!clearOfKeys(x, z, 30) || !freeOf(x, z, 20) || isWater(x, z) || slopeAt(x, z) > 0.35 || !roadClear(x, z, 8) || nearTree(x, z, 16)) return false;
          props.wrecks.push(Object.assign({}, o, { x, z, angle: R(0, 6.28) }));
          occupied.push({ x, z, r: 20 });
        } else if (k === 'bush') {
          if (!clearOfKeys(x, z, o.r * 0.6) || isWater(x, z) || !roadClear(x, z, o.r * 0.4) || bushes.some(b => Math.hypot(b.x - x, b.z - z) < b.r + o.r)) return false;
          bushes.push({ x, z, r: o.r });
        } else return false;
        return true;
      };
      // cây trong khoảnh rừng rậm / quanh ốc đảo không bỏ bớt (thủng lỗ giữa rừng, ốc đảo trụi)
      const keep = (k, o) => k === 'bld' || (k === 'tree' && (forests.some(f => Math.hypot(o.x - f.x, o.z - f.z) < f.r) || oasisD(o.x, o.z) < 450));
      const shuffle = A => { for (let i = A.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [A[i], A[j]] = [A[j], A[i]]; } return A; };
      const tol = v => Math.max(3, 0.12 * v);
      for (const [name, RB, RR, move] of pairs) {
        const L = all(), b0 = sum(RB.in, L), r0 = sum(RR.in, L);
        let b = b0, r = r0, added = 0, removed = 0;
        if (Math.abs(b - r) > tol(Math.max(b, r))) {
          const blueRich = b > r, rich = blueRich ? RB : RR, poor = blueRich ? RR : RB;
          const src = shuffle(L.filter(([k, o]) => rich.in(o.x, o.z)));
          // nửa map: bỏ bớt bên dư về quá trung bình một chút
          if (move) {
            const target = (b + r) / 2 + tol((b + r) / 2) / 2, gone = new Set();
            for (const [k, o] of src) {
              if ((blueRich ? b : r) <= target) break;
              if (keep(k, o)) continue;
              gone.add(o); removed++;
              if (blueRich) b -= W[k]; else r -= W[k];
            }
            const drop = A => { for (let i = A.length - 1; i >= 0; i--) if (gone.has(A[i])) A.splice(i, 1); };
            drop(trees); drop(rocks); drop(props.wrecks); drop(bushes);
          }
          // bù: lần lượt lấy mẫu vật bên dư (lặp lại nguồn nếu cần), đặt chỗ ngẫu nhiên trong vùng thiếu. Nguồn là nhà (làng bên đường) hoặc hết nguồn -> vật che thay thế: đá tảng / xác xe
          const sub = () => type !== 'URBAN' && rng() < 0.5
            ? ['rock', { r: R(12, 22), h: 0, rot: 0, kind: type === 'HIGHLAND' ? 'granite' : type === 'DESERT' ? 'sandstone' : 'stone' }]
            : ['wreck', { kind: pick(rng, ['tank', 'tank', 'dump', 'apc']), angle: 0, tilt: R(-0.06, 0.06), roll: R(-0.08, 0.08), turretRot: R(-1.2, 1.2), smoke: rng() < 0.65 }];
          for (let n = 0, cap = 60 + src.length * 3; Math.abs(b - r) > tol(Math.max(b, r)) && n < cap && !(type === 'URBAN' && added >= 15); n++) {
            let [k, o] = src.length ? src[n % src.length] : sub();
            if (k === 'bld') [k, o] = sub();
            if (k === 'rock' && !o.h) o = Object.assign({}, o, { h: o.r * R(0.7, 1.3) });
            let x, z, ok = false;
            for (let t = 0; !ok && t < 6; t++) { [x, z] = poor.sample(); ok = poor.in(x, z) && place(k, o, x, z); }
            if (!ok) continue;
            if (blueRich) r += W[k]; else b += W[k];
            added++;
          }
        }
        balance.push({ name, blue: b0, red: r0, blueAfter: b, redAfter: r, added, removed });
      }
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
      const EXT = Math.round(980 * K);
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
          const sp = cls === 'avenue' ? 380 : 420, ph = R(0, sp);
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
          const fill = cls === 'local' ? 0.08 : 0.05;
          along(ln, 48, R(0, 48), s => {
            if (nearX(ln, s, 44) || !onRoad(...ln.P(s), cls)) return;
            for (const side of [1, -1]) {
              if (rng() > fill) continue;
              const [x, z] = p0(s, side, C.cw / 2 - 10), [wx, wz] = p0(s, side, C.cw / 2 + 4);
              if (urbanCars.length >= 260 || !onWalk(wx, wz) || !freeOf(x, z, 12) || !clearOfKeys(x, z, 0)) continue;
              urbanCars.push({ x, z, angle: side > 0 ? ln.ang + Math.PI : ln.ang, cls });
            }
          });
        }
        {
          // THÀNH PHỐ MA: xe bị bỏ lại giữa lòng đường khi dân chạy loạn — lẻ tẻ chéo làn, có chỗ dồn cả đoạn tắc (xe nối
          // đuôi lệch hàng), có xe húc nhau / leo nửa lên vỉa hè. Chừa ngã tư & cầu; tối thiểu 1 làn còn lọt xe tăng
          // (xe lệch hẳn sang 1 nửa lòng đường)
          const rate = cls === 'avenue' ? 0.11 : cls === 'main' ? 0.08 : 0.05, half = C.cw / 2;
          const nearBridge = (x, z) => bridges.some(b => Math.hypot(b.x - x, b.z - z) < b.length / 2 + 40);
          const put = (s, side, off, ang) => {
            const [x, z] = p0(s, side, off);
            if (urbanCars.length >= 260 || nearX(ln, s, 30) || !onRoad(...ln.P(s), cls) || nearBridge(x, z) || !freeOf(x, z, 10) || !clearOfKeys(x, z, 0)) return false;
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
    // Sa mạc: nắng xiên ~15-30° so với hướng gió (đỉnh đụn / gợn cát vuông góc gió) -> sườn đụn, gợn cát luôn có mặt sáng /
    // mặt khuất rõ (nắng song song đỉnh gợn thì gợn gần như vô hình). Hướng nắng ngang trong (x, z) = π/2 - azimuth
    if (type === 'DESERT') {
      const a = Math.PI / 2 - (windA + (sun.azimuth < Math.PI ? 1 : -1) * (0.26 + 0.26 * (sun.azimuth % 1))) + (sun.azimuth % 2 < 1 ? Math.PI : 0);
      sun.azimuth = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    }

    const ms = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
    return {
      type, seed, size: SIZE, res: RES, cell: CELL, heights, surface,
      // wind: hướng gió chính (rad, trong mặt x-z: (cos, sin)) — đụn cát sa mạc vuông góc với nó, shader gợn cát dùng chung
      wind: windA, oases,
      // báo cáo cân bằng vật che hai phe (5f): [{ name, blue, red, blueAfter, redAfter, added }]
      balance,
      // sym: phép đối xứng đổi phe ('mirror' z -> -z | 'point' (x, z) -> (-x, -z)): game.js đặt xe phe Đỏ lúc xuất trận
      // vào đúng ảnh vị trí xe phe Xanh
      sym: SYM,
      bases, capture: CAP, roads, river, lakes, canals, blocks: roads.urbanGrid ? roads.urbanGrid.blocks : [], bridges, bunkers, strongholds, landmarks, layout, layoutVariant, layoutLabel, layoutDesc, buildings, rocks, bushes, trees, forests, props, sun,
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
  // mode: chuyển cho hàm gò từng loại (moundBio: true = vách khoét đứng, 'orig' = gò chưa hạ nền, 'pit')
  function landmarkMound(L, f, r, mode) {
    const c = landmarkMoundCore(L, f, r, mode), b = perimBerm(L, f, r);
    return b > 0 ? Math.max(c, b) : c;   // giữ phần âm (hố hạ nền dưới sân khoét)
  }
  function landmarkMoundCore(L, f, r, mode) {
    const M = { nuke: moundNuke, bio: moundBio, sam: moundSam, power: moundPower, radar: moundRadar }[L.kind];
    return M ? M(L, f, r, mode) : 0;
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
  // Lưới thô (84 đv/ô) quanh mặt tiền trung tâm điều khiển: nút lưới sau mặt tiền cao 6 m nội suy thành dốc cỏ chạy xuyên
  // qua cửa chống nổ (đất lấp 2/3 cửa) -> hạ các nút đó xuống mức thấp nhất của gò thật trong 1 ô quanh nút (nội suy luôn
  // nằm dưới gò thật); nắp đất lưới mịn (landmarks.js, KINDS.nuke.surface) dựng lại gò, vách cắt đứng trong thân tường
  function nukeCoarse(L, f, r) {
    const h = landmarkMound(L, f, r), C = L.silo.lcc, fa = C.f + C.hf - 40, fb = C.f + C.hf + 30, ra = C.r - C.hr - C.run, rb = C.r + C.hr + C.run;
    if (f + CELL < fa || f - CELL > fb || r + CELL < ra || r - CELL > rb) return h;
    let m = h;
    for (let a = -CELL; a <= CELL; a += 6) for (let b = -CELL; b <= CELL; b += 6) m = Math.min(m, landmarkMound(L, f + a, r + b, 'cap'));
    return m;
  }
  // mode 'cap': hình gò thật cho nắp đất lưới mịn — vách cắt mặt tiền trung tâm điều khiển nằm trong thân tường mặt tiền
  function moundNuke(L, f, r, mode) {
    const S = L.silo, df = f - S.f, dr = r - S.r;
    const d = Math.hypot(Math.max(0, Math.abs(df) - S.hf), Math.max(0, Math.abs(dr) - S.hr));
    let h = S.h * (1 - smooth(0, S.run, d));
    // dải chuyển cao độ quanh lỗ khoét nằm khuất dưới bệ bê tông (ngoài thành giếng / thành ống xả)
    h *= smooth(S.shaft + 8, S.shaft + 20, Math.hypot(df, dr));
    for (const [vf, vr, hf, hr] of S.vents) h *= smooth(4, 14, Math.hypot(Math.max(0, Math.abs(df - vf) - hf), Math.max(0, Math.abs(dr - vr) - hr)));
    // gò trung tâm điều khiển: cắt thẳng ở mặt tiền (dải chuyển cao độ nằm trong bề dày tường mặt tiền / tường cánh)
    const C = S.lcc, pf = f - C.f, pr = r - C.r;
    if (pf < C.hf - (mode === 'cap' ? 8 : 22)) h = Math.max(h, C.h * (1 - smooth(0, C.run, Math.hypot(Math.max(0, -pf - C.hf), Math.max(0, Math.abs(pr) - C.hr)))));
    return h;
  }

  // ===== HẦM NGHIÊN CỨU VŨ KHÍ SINH HỌC (rừng rậm) =====
  function detailBio(L) {
    // ụ đất phủ hầm: vòm vuông bo tròn tâm fc, bán trục af / ar, cao h (9.5 m); sân trước khoét vào ụ rộng 2 * cut,
    // vách sau sân là tường mặt tiền (mặt trong tại face), 2 bên là tường chắn đất
    // sân khoét (lòng hầm sau cửa trong + sân trước): f > pf (sau cửa áp lực trong), |r| < pr (giữa thân 2 tường chắn
    // đất), tới pe (ngoài mũi gò); k: độ dốc mặt phẳng hạ nền quanh sân (xem moundBio)
    L.mound = { fc: -80, af: 150, ar: 200, h: 72, cut: 80, face: 10, pf: -8, pr: 76, pe: 110, k: 2.5 };
  }
  // exact: hình gò thật (vách khoét đứng tại mép sân) cho nắp đất lưới mịn của landmarks/bio.js
  // Không exact (lưới cao độ 84 đv/ô): vách khoét 12 đv không dựng được trên lưới thô -> mặt đất nội suy thành dốc cỏ
  // chạy xuyên qua cửa hầm. Thay bằng mặt phẳng dốc k quanh sân, cắt cốt 0 đúng tại mép sân (trong thân tường / sau cửa
  // trong) và sâu dần xuống dưới sân: nội suy tuyến tính giữ nguyên mặt phẳng, chỗ gò hạn trần (min) chỉ làm đất thấp hơn
  // -> đất không bao giờ trồi lên sân. Rãnh trũng do hạ nền quanh sân được nắp đất mịn che (bio.js), sàn xe = mặt sân.
  // Mặt hạ nền = k * (P(f) + Q(r)): tổng 2 hàm bậc nhất (phẳng trong từng góc phần tư; nếp gấp |r| = 0 và f = pe nằm sâu
  // dưới sân) — KHÔNG dùng min / max các mặt phẳng: hàm lồi ở góc sân, nội suy lưới bị đẩy lên trên sân
  // mode: true = gò thật (vách khoét đứng); 'pit' = P + Q (đv, < 0 trong vùng hạ nền); khác = cao độ cho lưới thô
  function moundBio(L, f, r, mode) {
    const M = L.mound, u = (f - M.fc) / M.af, v = r / M.ar;
    const d = Math.pow(Math.pow(Math.abs(u), 6) + Math.pow(Math.abs(v), 6), 1 / 6);
    const hm = d >= 1 ? 0 : M.h * (1 - smooth(0.68, 1, d));
    if (mode === true) return f > M.pf && f < M.pe && Math.abs(r) < M.pr ? 0 : hm;
    // gò cũ trên lưới thô (có vết khoét sân 12 đv — lưới không dựng được, nội suy thành dốc): mặt đất gốc mà nắp đất
    // dựng lại ở ngoài sân
    if (mode === 'orig') return hm * (1 - smooth(M.face - 34, M.face - 22, f) * (1 - smooth(M.cut - 6, M.cut + 6, Math.abs(r))));
    // P: sau cửa trong dương, trong sân âm, sâu nhất ở pe rồi nông dần về 0 tại 2 pe - pf (trước mũi gò)
    const pq = (f <= M.pe ? M.pf - f : M.pf - 2 * M.pe + f) + Math.abs(r) - M.pr;
    if (mode === 'pit') return pq;
    return Math.min(hm, M.k * pq);
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
  function has(type, seed) {
    return cache.has(cacheKey(type, seed) + (testField ? ':field' : ''));
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
      // Giữ lại độ lượn sóng nhấp nhô vi mô tự nhiên nhẹ để mặt đất không phẳng lì giả tạo
      const microRelief = (Math.sin(i * 0.38) * Math.cos(j * 0.34) * 0.28 + Math.sin(i * 0.16 + j * 0.2) * 0.32);
      m.heights[at] = lerp(m.heights[at], h0 + microRelief, k);
      if (k > 0.5 && m.surface[at] === 3) m.surface[at] = 0;   // nền bê tông đô thị -> đất tự nhiên
    }
    const pad = R + 80;
    const radiusOf = o => o.r || o.radius || (o.w ? Math.max(o.w, o.d || 0) / 2 : 0) || 0;
    // Phòng thử đồng trống không cần dựng nguyên cả bản đồ 5,4 km phía ngoài bãi. Giữ một
    // vành cảnh quan dày quanh bãi để đường chân trời vẫn tự nhiên, rồi thưa dần chi tiết
    // nhỏ ở xa. Hash theo tọa độ giúp kết quả ổn định, không làm lệch RNG đồng bộ của map.
    const density = { trees: 0.34, rocks: 0.3, bushes: 0.22, buildings: 0.72, bunkers: 0.7, props: 0.42, forests: 0.5 };
    const salt = { trees: 11, rocks: 23, bushes: 37, buildings: 41, bunkers: 53, props: 67, forests: 79 };
    const hash = (o, s) => {
      let h = (Math.imul(Math.round(o.x || 0), 73856093) ^ Math.imul(Math.round(o.z || 0), 19349663) ^ s) >>> 0;
      h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15;
      return (h >>> 0) / 4294967296;
    };
    for (const k of ['trees', 'rocks', 'bushes', 'buildings', 'bunkers', 'props', 'forests']) if (Array.isArray(m[k])) {
      m[k] = m[k].filter(o => {
        const d = Math.hypot((o.x || 0) - cx, (o.z || 0) - cz), r = radiusOf(o);
        if (d <= pad + r) return false;                 // lõi bãi thử phải sạch
        if (d > 2700 + r) return false;                 // đã có backdrop + sương che đường chân trời
        if (d < 1850 + r) return true;                  // vành cảnh gần giữ nguyên chi tiết
        return hash(o, salt[k]) < density[k];           // xa: giữ silhouette, thưa tiểu tiết
      });
    }
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
    const field = !!testField;
    const key = cacheKey(type, seed) + (field ? ':field' : '');
    if (cache.has(key)) return Promise.resolve(true);
    if (pending.has(key)) return pending.get(key);
    if (typeof Worker === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined') return Promise.resolve(false);
    const lay = layout, lmk = landmarkKind;
    const p = new Promise(resolve => {
      let w;
      try {
        if (!workerURL) {
          // gọi thẳng biểu thức hàm (không dựa vào tên: bản build rút gọn đổi tên MapGenFactory)
          const src = 'const MapGen = (' + MapGenFactory.toString() + ')();\n' +
            'onmessage = e => { const d = e.data; let m;\n' +
            '  try { MapGen.setLayout(d.layout); MapGen.setLandmark(d.landmark); MapGen.setTestField(!!d.field); m = d.field ? MapGen.get(d.type, d.seed) : MapGen.generate(d.type, d.seed); }\n' +
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
      w.postMessage({ type, seed, layout: lay, landmark: lmk, field });
    });
    pending.set(key, p);
    return p;
  }

  return { generate, get, has, prefetch, toPlain, hydrate, setLayout, setTestField, getLayout: () => layout, SPAWN, STRONGHOLD_SITES, STRONGHOLD_LAYOUT_VARIANTS, pickStrongholdVariant, PORTAL, portalHalf, LANDMARK_SITE, CAR_CATALOG, setLandmark, landmarkMound, moundBio, mulberry32, makeNoise, fbm, ridged, sampleH, SIZE, HALF, RES, CELL, OUTER_EXT, CAPTURE, BIOME, randomSeed: () => (Math.random() * 4294967296) >>> 0 };
}
const MapGen = MapGenFactory();

if (typeof window !== 'undefined') window.MapGen = MapGen;
