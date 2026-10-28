/**
 * CỨ ĐIỂM BÊ TÔNG CỐT THÉP DƯỚI Ụ ĐẤT (thay cho boong-ke móng ngựa cũ)
 *
 * - Khoang bê tông dạng xuyên qua (2 đầu đều mở) chôn dưới ụ đất trên đỉnh đồi, đủ chỗ 2 xe đứng song song
 * - Lòng khoang võng xuống (sàn thấp hơn cốt nền 1.75 m): thân xe nằm khuất, chỉ tháp pháo cao hơn mặt đất
 * - Hai đầu có tường cánh loe rộng -> nòng pháo quét được góc rộng mà không chạm tường
 * - Tường bên / sàn / ụ đất không bị phá; mái (bê tông 3,25 m dưới 1 m đất) & tường cánh chỉ sập khi bị dội rất nhiều đạn
 *   lớn vào một chỗ (lựu pháo 155 ~80 phát một ô mái). Che chắn theo HÌNH KHỐI THẬT: mái / tường / gờ chặn đạn & mảnh văng;
 *   đạn bắn thẳng qua miệng hầm mở trúng xe bên trong, quả nổ trong lòng hầm / trước miệng hầm tới được phần xe nhìn thấy nó
 *   (exposure với điểm nổ). Ô mái sập đè lên xe bên dưới.
 * - Nòng pháo không thể xuyên qua bê tông / ụ đất: tháp dừng ở mép tường, nòng tự hạ khi chạm trần
 *
 * Hệ tọa độ cục bộ mỗi cứ điểm: f dọc trục xuyên qua (hướng angle), r vuông góc, y tính từ cốt nền G.
 * Tỉ lệ ~8 đơn vị = 1 mét (giống các xe).
 */
const Strongholds = (() => {
  const S = {
    HB: 96,        // nửa chiều dài khoang có mái (24 m tổng: xe lùi sâu trong hầm hoặc tiến ra sát miệng)
    WI: 96,        // nửa bề rộng lòng khoang (24 m: 3 xe tăng hoặc 2 pháo tự hành song song, nòng quét rộng)
    TW: 28,        // tường bên dày 3.5 m
    D: 20,         // sàn hạ thấp 2.5 m so với cốt nền (xe nằm khuất sâu hơn)
    CEIL: 30,      // đáy mái cao hơn cốt nền 3.75 m (thông thủy 5.75 m tính từ sàn)
    ROOF: 26,      // mái bê tông cốt thép dày 3.25 m
    COVER: 8,      // lớp đất phủ trên mái
    LIP: 4,        // gờ mặt tiền nhô trên lớp đất
    RAMP: 104,     // dốc lên / xuống ở mỗi đầu: mặt dốc chéo thẳng 13 m, hạ 2.5 m (~11°), kết thúc ngay trước đầu tường cánh
    RAMP_EASE: 0.06, // bo rất ngắn (~0.8 m) ở chân / đỉnh dốc cho xe khỏi giật; còn lại thẳng tuyệt đối
    SPLAY: 0.62,   // độ loe tường cánh (dr / df)
    WING_T: 18,    // tường cánh dày 2.25 m
    RUN: 110,      // chân ta-luy ụ đất
    BEAM: 6,       // dầm trần cao 0.75 m
    BEAMS_F: [-64, -32, 0, 32, 64],
    SLOT_R: 44,    // khoảng cách ngang giữa các chỗ đứng (3 xe tăng: -44 / 0 / +44)
    SLOT_SPG: 40,  // 2 pháo tự hành: -40 / +40
    HAUNCH: 20,    // vát nách góc trần - tường bên 2.5 m (miệng hầm hình thang, góc trong vát 45°)
    LIP_T: 10,     // bề dày gờ mặt tiền 1.25 m
    LIP_BEVEL: 7,  // vát chéo mép trên gờ mặt tiền 0.9 m
    BEVEL: 3.5,    // vát cạnh nắp hầm
    WING_BEVEL: 9  // vát chéo mép trong đỉnh tường cánh 1.1 m (nửa bề dày tường)
  };
  S.WO = S.WI + S.TW;
  S.CREST = S.CEIL + S.ROOF + S.COVER;
  S.TOP = S.CREST + S.LIP;
  // VÁT CHÉO MIỆNG HẦM: mép mái phía trên 2 cửa hầm (trong phạm vi lòng hầm, giữa 2 góc vát nách) cắt xiên ~60°, bắt đầu
  // lùi vào trong CH đơn vị từ mặt tiền, lên tới đỉnh gờ -> pháo trong hầm nâng nòng cao hơn bắn ra ngoài (vẫn được mái che
  // phía trên). Mặt cắt (f, y): đường thẳng từ (HB - CH, CEIL) tới (HB, TOP)
  S.CH = 22;
  S.CHK = (S.TOP - S.CEIL) / S.CH;
  S.CH_R = S.WI - S.HAUNCH;   // nửa bề rộng phần vát (phía ngoài: mái gác trên góc vát nách & tường bên giữ mặt tiền đứng)
  S.RAMP_END = S.HB + S.RAMP;
  S.ZONE_END = S.HB + 74;   // vùng chiếm cờ: khoang + đoạn đầu dốc (giữ nguyên cỡ cũ khi dốc dài ra)
  S.END = S.HB + S.RUN;
  S.REACH = Math.hypot(S.END + 12, S.WO + S.RUN + 12);   // bán kính bao toàn bộ công trình
  // Sân phễu bê tông trước mỗi miệng hầm (thông số gốc ở MapGen.PORTAL — map_gen san nền theo đúng hình này)
  const PORTAL = (typeof MapGen !== 'undefined' && MapGen.PORTAL) || { END: 206, APRON: 104, NECK: 30, HW0: 184.2, STRAIGHT: 152, ROAD_W: 52, NECK_F: 310, APP: 462 };
  const portalHalf = (typeof MapGen !== 'undefined' && MapGen.portalHalf) || (af => {
    const u = Math.max(0, Math.min(1, (af - PORTAL.END) / PORTAL.APRON));
    return PORTAL.NECK + (PORTAL.HW0 - PORTAL.NECK) * Math.pow(1 - u, 2.2);
  });
  // (af, ar) nằm trên sân phễu (ngoài mép cuối sân giữa 2 tường cánh)
  const onApron = (af, ar, pad = 0) => af > S.END && af <= PORTAL.NECK_F + pad && ar < portalHalf(af) + 3 + pad;

  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const smooth = t => { t = clamp01(t); return t * t * (3 - 2 * t); };

  // Nửa bề rộng lòng kênh xe chạy tại |f| (trong khoang = WI, ngoài khoang loe dần theo tường cánh)
  const cutHalf = af => af <= S.HB ? S.WI : S.WI + (af - S.HB) * S.SPLAY;
  // Cao độ sàn / dốc (so với cốt nền)
  // dốc chéo thẳng, chỉ bo parabol rất ngắn ở 2 mép (không gãy góc ở chân / đỉnh dốc)
  const rampK = t => {
    const b = S.RAMP_EASE, k = 1 / (2 * b * (1 - b));
    t = clamp01(t);
    return t < b ? t * t * k : t > 1 - b ? 1 - (1 - t) * (1 - t) * k : (t - b / 2) / (1 - b);
  };
  // độ vát mép tường cánh: nhỏ lại ở đoạn tường thấp gần chân ụ (tường cao t - b)
  const wingBevel = (t, b) => Math.min(S.WING_BEVEL, Math.max(0, t - b - 1) * 0.6);
  const floorY = af => af <= S.HB ? -S.D : af >= S.RAMP_END ? 0 : -S.D * (1 - rampK((af - S.HB) / S.RAMP));
  const inCut = (af, ar) => ar < cutHalf(af);
  // đáy mái tại |f| trong phần vát miệng hầm (CEIL nếu chưa tới chỗ vát)
  const chamY = af => af <= S.HB - S.CH ? S.CEIL : S.CEIL + (af - (S.HB - S.CH)) * S.CHK;
  // Cao độ mặt trên nóc mái nhìn thấy (so với cốt nền) theo |f|, |r|: lớp đất phủ, nắp hầm bê tông (chóp cụt vát 4 phía,
  // khớp hình dựng ở buildOne) và gờ mặt tiền 2 đầu (mặt trên phẳng rồi vát 45° ra ngoài)
  function roofTopY(af, ar) {
    let y = af <= S.HB - S.LIP_T + 0.5 ? S.CREST + 0.3 : -Infinity;   // lớp đất phủ chỉ trải tới mặt trong gờ mặt tiền
    const f0 = S.HB - 7, r0 = S.WI - 2, f1 = f0 - S.BEVEL, r1 = r0 - S.BEVEL, y0 = S.CREST - 2, y1 = S.CREST + 2.2;
    if (af <= f0 && ar <= r0) {
      const t = Math.max(0, (af - f1) / S.BEVEL, (ar - r1) / S.BEVEL);
      y = Math.max(y, y1 - t * (y1 - y0));
    }
    const fi = S.HB - S.LIP_T, lb = S.LIP_BEVEL;
    if (af >= fi && af <= S.HB) {
      const yl = af <= S.HB - lb ? S.TOP : S.TOP - (af - (S.HB - lb));
      // phần giữa bị mặt vát cắt: ngoài chỗ mặt vát vượt lên khỏi mép gờ thì không còn gì
      if (!(ar < S.CH_R && chamY(af) >= yl)) y = Math.max(y, yl);
    }
    return y;
  }
  // Khoảng cách ra ngoài lõi (khối mái + tường bên) trên mặt bằng
  const coreDist = (af, ar) => Math.hypot(Math.max(0, af - S.HB), Math.max(0, ar - S.WO));
  // Nhiễu giá trị 2D mượt (băm theo ô lưới nguyên) — dùng cho bề mặt ụ đất
  function hash2(i, j) { let h = (i * 374761393 + j * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  function vnoise(x, y) {
    const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const a = hash2(i, j), b = hash2(i + 1, j), c = hash2(i, j + 1), d = hash2(i + 1, j + 1);
    return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
  }
  // Mặt ụ đất (so với cốt nền); null = ngoài chân ta-luy
  // Đỉnh tường cánh: đường xiên THẲNG từ mép mái (cốt đỉnh ụ) xuống chân ụ đất (so với cốt nền)
  const wingLine = af => S.CREST * clamp01(1 - (af - S.HB) / S.RUN);
  const WING_BLEND = 36;   // dải đất sát mặt ngoài tường cánh được nắn theo đường xiên thẳng của đỉnh tường
  function moundH(f, r) {
    const af = Math.abs(f), ar = Math.abs(r);
    const d = coreDist(af, ar);
    let h = null;
    if (d < S.RUN) {
      const t = d / S.RUN;
      // mô đất lồi lõm ngẫu nhiên mềm (không dùng sin: sin tạo gợn sóng đều -> sọc kẻ khi nắng chiếu)
      const bump = (vnoise(f / 38, r / 38) - 0.5) * 3.2 * (4 * t * (1 - t)) + (vnoise(f / 13 + 7.3, r / 13 - 2.1) - 0.5) * 0.9 * t;
      h = S.CREST * (1 - smooth(t)) + bump;
    }
    // sát tường cánh: mặt đất hạ / đắp dần về đường xiên thẳng (đất ôm khít đỉnh tường, không lộ / vùi tường)
    if (af > S.HB && af < S.END) {
      const w = 1 - smooth((ar - cutHalf(af) - S.WING_T) / WING_BLEND);
      if (w > 0) {
        const base = h === null ? 0 : h, v = base + (wingLine(af) - base) * w;
        return h === null && v <= 0.05 ? null : v;
      }
    }
    return h;
  }
  // Khoảng cách tới lõi tại đó ụ đất còn cao 5 (xe không leo được phía trong)
  const D_SOLID = (() => { let lo = 0, hi = S.RUN; for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (S.CREST * (1 - smooth(m / S.RUN)) > 5) lo = m; else hi = m; } return lo; })();

  // ===========================================================================
  // VẬT LIỆU: bê tông đổ khuôn ván, sàn bê tông có vệt xích, đất cỏ ụ đất
  // ===========================================================================
  const TEX = {};
  function rngOf(seed) {
    let a = seed >>> 0;
    return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  // canvas vẽ xong rồi đọc lại từng điểm ảnh (getImageData): vẽ bằng CPU luôn — canvas GPU phải chờ đọc ngược ~0,2 s / ảnh
  const RD = { willReadFrequently: true };
  function blotches(g, rnd, n, w, h, colFn, r0, r1) {
    for (let i = 0; i < n; i++) {
      const x = rnd() * w, y = rnd() * h, r = r0 + rnd() * (r1 - r0);
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      const c = colFn(rnd);
      gr.addColorStop(0, c); gr.addColorStop(1, c.replace(/[\d.]+\)$/, '0)'));
      g.fillStyle = gr;
      for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) { g.save(); g.translate(ox, oy); g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fill(); g.restore(); }
    }
  }

  // Bê tông đổ khuôn ván: 1 ô texture = 64 x 64 đơn vị (8 m); tấm ván 2 m x 1 m, lỗ ty giằng, vệt nước chảy, mảng loang
  function concreteMaps() {
    if (TEX.conc) return TEX.conc;
    const N = 512, rnd = rngOf(9127);
    const c = canvas(N, N), g = c.getContext('2d', RD);
    const b = canvas(N, N), gb = b.getContext('2d', RD);
    g.fillStyle = '#9d998f'; g.fillRect(0, 0, N, N);
    gb.fillStyle = '#808080'; gb.fillRect(0, 0, N, N);
    blotches(g, rnd, 60, N, N, r => `rgba(${r() < 0.5 ? '120,116,108' : '188,184,174'},${0.12 + r() * 0.16})`, 20, 90);
    blotches(g, rnd, 26, N, N, () => 'rgba(140,128,104,0.12)', 30, 110);   // ố vàng
    // hạt cát / lỗ khí li ti
    const img = g.getImageData(0, 0, N, N), d = img.data;
    const imb = gb.getImageData(0, 0, N, N), db = imb.data;
    for (let i = 0; i < N * N; i++) {
      const n = (rnd() - 0.5) * 22;
      d[i * 4] += n; d[i * 4 + 1] += n; d[i * 4 + 2] += n;
      db[i * 4] = db[i * 4 + 1] = db[i * 4 + 2] = 128 + n * 2.2;
      if (rnd() < 0.004) { d[i * 4] -= 50; d[i * 4 + 1] -= 50; d[i * 4 + 2] -= 50; db[i * 4] = db[i * 4 + 1] = db[i * 4 + 2] = 40; }
    }
    g.putImageData(img, 0, 0); gb.putImageData(imb, 0, 0);
    // Mạch ván khuôn (2 m x 1 m) + lỗ ty giằng
    const pw = 128, ph = 64;
    for (let y = 0; y <= N; y += ph) {
      g.fillStyle = 'rgba(70,68,62,0.55)'; g.fillRect(0, y - 1, N, 2);
      g.fillStyle = 'rgba(230,226,216,0.25)'; g.fillRect(0, y + 1, N, 1);
      gb.fillStyle = '#3a3a3a'; gb.fillRect(0, y - 1, N, 2);
      const off = ((y / ph) % 2) * pw / 2;
      for (let x = off; x <= N + pw; x += pw) {
        g.fillStyle = 'rgba(70,68,62,0.45)'; g.fillRect((x % (N + 1)) - 1, y, 2, ph);
        gb.fillStyle = '#404040'; gb.fillRect((x % (N + 1)) - 1, y, 2, ph);
        for (const hx of [x + pw * 0.25, x + pw * 0.75]) {
          const hxx = hx % N, hy = y + ph / 2;
          g.fillStyle = 'rgba(60,58,54,0.85)'; g.beginPath(); g.arc(hxx, hy, 3.2, 0, 6.2832); g.fill();
          g.strokeStyle = 'rgba(200,196,186,0.5)'; g.lineWidth = 1; g.beginPath(); g.arc(hxx, hy, 4.6, 0, 6.2832); g.stroke();
          gb.fillStyle = '#1e1e1e'; gb.beginPath(); gb.arc(hxx, hy, 3.2, 0, 6.2832); gb.fill();
        }
      }
    }
    // Vân gỗ ván khuôn in trên mặt bê tông
    g.globalAlpha = 0.07;
    for (let y = 0; y < N; y += 3) { g.fillStyle = rnd() < 0.5 ? '#5a5650' : '#d8d4ca'; g.fillRect(0, y, N, 1 + (rnd() < 0.3)); }
    g.globalAlpha = 1;
    // Vệt nước mưa chảy xuống (đậm phía trên, nhạt dần)
    for (let i = 0; i < 38; i++) {
      const x = rnd() * N, w = 3 + rnd() * 14, y0 = Math.floor(rnd() * 8) * ph, len = 60 + rnd() * 220;
      const gr = g.createLinearGradient(0, y0, 0, y0 + len);
      gr.addColorStop(0, `rgba(58,56,50,${0.18 + rnd() * 0.2})`); gr.addColorStop(1, 'rgba(58,56,50,0)');
      g.fillStyle = gr; g.fillRect(x, y0, w, len);
      if (x + w > N) g.fillRect(x - N, y0, w, len);
    }
    // Rỗ tổ ong / sứt mẻ nhỏ
    for (let i = 0; i < 40; i++) {
      const x = rnd() * N, y = rnd() * N, r = 1.5 + rnd() * 4;
      g.fillStyle = 'rgba(80,78,72,0.6)'; g.beginPath(); g.ellipse(x, y, r, r * (0.5 + rnd() * 0.5), rnd() * 3, 0, 6.2832); g.fill();
      gb.fillStyle = '#2a2a2a'; gb.beginPath(); gb.ellipse(x, y, r, r * 0.7, 0, 0, 6.2832); gb.fill();
    }
    const map = new THREE.CanvasTexture(c), bump = new THREE.CanvasTexture(b);
    for (const t of [map, bump]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; }
    return (TEX.conc = { map, bump });
  }

  // Sàn / dốc bê tông: mạch co giãn 6 m, vệt xích xe dọc trục, vết dầu
  function floorMaps() {
    if (TEX.floor) return TEX.floor;
    const N = 512, rnd = rngOf(5531);
    const c = canvas(N, N), g = c.getContext('2d', RD);
    g.fillStyle = '#8f8b82'; g.fillRect(0, 0, N, N);
    blotches(g, rnd, 50, N, N, r => `rgba(${r() < 0.6 ? '96,92,84' : '160,156,146'},${0.12 + r() * 0.18})`, 18, 80);
    const img = g.getImageData(0, 0, N, N), d = img.data;
    for (let i = 0; i < N * N; i++) { const n = (rnd() - 0.5) * 26; d[i * 4] += n; d[i * 4 + 1] += n; d[i * 4 + 2] += n; }
    g.putImageData(img, 0, 0);
    // vệt xích 2 làn xe (trục u = dọc khoang)
    for (const lane of [0.25, 0.75]) {
      for (const side of [-1, 1]) {
        const y = (lane + side * 0.055) * N;
        const gr = g.createLinearGradient(0, y - 14, 0, y + 14);
        gr.addColorStop(0, 'rgba(40,38,34,0)'); gr.addColorStop(0.5, 'rgba(40,38,34,0.42)'); gr.addColorStop(1, 'rgba(40,38,34,0)');
        g.fillStyle = gr; g.fillRect(0, y - 14, N, 28);
        g.fillStyle = 'rgba(30,28,26,0.25)';
        for (let x = 0; x < N; x += 7) g.fillRect(x, y - 9, 3, 18);
      }
    }
    // mạch co giãn
    g.fillStyle = 'rgba(40,38,34,0.7)'; g.fillRect(0, 0, N, 2); g.fillRect(0, 0, 2, N); g.fillRect(N / 2 - 1, 0, 2, N);
    // vết dầu
    blotches(g, rnd, 8, N, N, () => 'rgba(25,22,20,0.35)', 8, 26);
    const map = new THREE.CanvasTexture(c);
    map.wrapS = map.wrapT = THREE.RepeatWrapping; map.anisotropy = 8;
    return (TEX.floor = map);
  }

  const EARTH = {
    DESERT: { grass: [150, 138, 92], dirt: [178, 142, 98], toe: [206, 174, 128] },
    URBAN: { grass: [92, 110, 60], dirt: [118, 102, 78], toe: [120, 118, 112] },
    JUNGLE: { grass: [56, 84, 36], dirt: [90, 72, 48], toe: [58, 80, 36] },
    HIGHLAND: { grass: [94, 108, 58], dirt: [116, 102, 76], toe: [106, 112, 64] },
    RIVER_LAKE: { grass: [84, 112, 52], dirt: [110, 94, 66], toe: [94, 118, 56] }
  };
  // Đất phủ cỏ: 1 ô = 32 đơn vị; màu sắc lấy từ vertex color nên texture gần như trung tính
  function earthMap() {
    if (TEX.earth) return TEX.earth;
    const N = 256, rnd = rngOf(771);
    const c = canvas(N, N), g = c.getContext('2d');
    g.fillStyle = '#b4b4b4'; g.fillRect(0, 0, N, N);
    blotches(g, rnd, 40, N, N, r => `rgba(${r() < 0.5 ? '120,110,96' : '210,214,196'},${0.15 + r() * 0.2})`, 8, 36);
    for (let i = 0; i < 2600; i++) {   // ngọn cỏ
      const x = rnd() * N, y = rnd() * N, l = 3 + rnd() * 6, a = -1.57 + (rnd() - 0.5) * 1.1, s = 0.75 + rnd() * 0.5;
      g.strokeStyle = `rgba(${150 * s | 0},${190 * s | 0},${130 * s | 0},${0.35 + rnd() * 0.4})`; g.lineWidth = 1;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
    for (let i = 0; i < 260; i++) { const s = 1 + rnd() * 2.4; g.fillStyle = `rgba(${rnd() < 0.5 ? '96,86,72' : '200,190,170'},0.55)`; g.fillRect(rnd() * N, rnd() * N, s, s); } // sỏi
    const map = new THREE.CanvasTexture(c);
    map.wrapS = map.wrapT = THREE.RepeatWrapping; map.anisotropy = 8;
    return (TEX.earth = map);
  }

  // Sơn cũ bong tróc + bám bẩn: phủ vệt bẩn tối loang lổ rồi khoét mảng tróc (trong suốt -> lộ bê tông bên dưới)
  function agePaint(g, rnd, x0, y0, w, h, chips, dirt) {
    g.save();
    g.beginPath(); g.rect(x0, y0, w, h); g.clip();
    g.globalCompositeOperation = 'source-atop';
    for (let i = 0; i < dirt; i++) {
      const x = x0 + rnd() * w, y = y0 + rnd() * h, r = 4 + rnd() * 22;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      const a = 0.12 + rnd() * 0.22;
      gr.addColorStop(0, `rgba(70,62,48,${a})`); gr.addColorStop(1, 'rgba(70,62,48,0)');
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // bạc màu nắng mưa: phủ mờ xám
    g.fillStyle = 'rgba(150,146,136,0.18)'; g.fillRect(x0, y0, w, h);
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < chips; i++) {
      const x = x0 + rnd() * w, y = y0 + rnd() * h, r = 0.8 + Math.pow(rnd(), 2.2) * 9;
      g.fillStyle = `rgba(0,0,0,${0.55 + rnd() * 0.45})`;
      g.beginPath(); g.ellipse(x, y, r, r * (0.4 + rnd() * 0.6), rnd() * 3.14, 0, 6.2832); g.fill();
    }
    // vết xước / mòn dài
    g.lineWidth = 1.2;
    for (let i = 0; i < chips / 8; i++) {
      const x = x0 + rnd() * w, y = y0 + rnd() * h, a = rnd() * 6.28, l = 6 + rnd() * 26;
      g.strokeStyle = `rgba(0,0,0,${0.5 + rnd() * 0.5})`;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
    g.restore();
  }
  // Atlas chi tiết lối vào: hàng 0 sọc vàng đen cũ, hàng 1 sơn trắng mòn (vạch dừng), hàng 2 nắp lưới thép rãnh thu nước
  function portalPaintTex() {
    if (TEX.portalPaint) return TEX.portalPaint;
    const W = 256, RH = 64, c = canvas(W, RH * 3), g = c.getContext('2d'), rnd = rngOf(4417);
    // hàng 0: sọc chéo vàng đen (chu kỳ 64 px -> lặp khít theo u)
    g.fillStyle = '#c4a03e'; g.fillRect(0, 0, W, RH);
    g.fillStyle = '#23211d';
    for (let x = -RH; x < W + RH; x += 64) { g.beginPath(); g.moveTo(x, RH); g.lineTo(x + 32, RH); g.lineTo(x + 32 + RH, 0); g.lineTo(x + RH, 0); g.closePath(); g.fill(); }
    agePaint(g, rnd, 0, 0, W, RH, 260, 40);
    // hàng 1: sơn trắng
    g.fillStyle = '#d6d3c8'; g.fillRect(0, RH, W, RH);
    agePaint(g, rnd, 0, RH, W, RH, 320, 46);
    // hàng 2: khung thép góc (trên / dưới) + thanh lưới dọc (khe tối sâu) + 2 thanh giằng ngang; gỉ loang
    const y2 = RH * 2;
    g.fillStyle = '#0d0c0b'; g.fillRect(0, y2, W, RH);
    for (let x = 0; x < W; x += 8) {
      const gr = g.createLinearGradient(x, 0, x + 3, 0);
      gr.addColorStop(0, '#6d6a64'); gr.addColorStop(1, '#3e3b37');
      g.fillStyle = gr; g.fillRect(x, y2 + 6, 3, RH - 12);
    }
    g.fillStyle = '#4a4741';
    for (const yy of [y2 + 22, y2 + 41]) g.fillRect(0, yy, W, 2);
    g.fillStyle = '#5c5953'; g.fillRect(0, y2, W, 6); g.fillRect(0, y2 + RH - 6, W, 6);
    g.fillStyle = 'rgba(20,18,16,0.6)'; g.fillRect(0, y2 + 5, W, 1); g.fillRect(0, y2 + RH - 6, W, 1);
    g.save(); g.beginPath(); g.rect(0, y2, W, RH); g.clip();
    for (let i = 0; i < 46; i++) {
      const x = rnd() * W, y = y2 + rnd() * RH, r = 4 + rnd() * 16, gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(120,62,26,${0.25 + rnd() * 0.3})`); gr.addColorStop(1, 'rgba(120,62,26,0)');
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // lá khô / đất kẹt trong khe lưới
    for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(${90 + rnd() * 40 | 0},${70 + rnd() * 30 | 0},${40 + rnd() * 20 | 0},0.8)`; g.fillRect(rnd() * W, y2 + 8 + rnd() * (RH - 16), 2 + rnd() * 5, 1 + rnd() * 2); }
    g.restore();
    const t = new THREE.CanvasTexture(c);
    t.wrapS = THREE.RepeatWrapping; t.anisotropy = 8;
    return (TEX.portalPaint = t);
  }
  function letterTexture(ch) {
    const c = canvas(256, 256), g = c.getContext('2d');
    g.fillStyle = 'rgba(0,0,0,0)'; g.fillRect(0, 0, 256, 256);
    g.font = 'bold 200px Arial Black, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    // sơn vàng cũ đã bạc màu (không còn vàng tươi mới sơn), bám bẩn, bong tróc từng mảng
    g.fillStyle = 'rgba(204,176,84,0.86)'; g.fillText(ch, 128, 140);
    const rnd = rngOf(ch.charCodeAt(0) * 31);
    agePaint(g, rnd, 0, 0, 256, 256, 520, 70);
    // vệt nước mưa chảy dọc làm sơn mờ thành sọc
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 26; i++) { const x = rnd() * 256, w = 2 + rnd() * 7, gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.3 + rnd() * 0.5, `rgba(0,0,0,${0.15 + rnd() * 0.3})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x, 0, w, 256); }
    g.globalCompositeOperation = 'source-over';
    const t = new THREE.CanvasTexture(c);
    t.anisotropy = 4;
    return t;
  }

  // ===========================================================================
  // DỰNG HÌNH: gom mọi mặt cùng vật liệu vào 1 BufferGeometry
  // ===========================================================================
  // ===========================================================================
  // BÊ TÔNG BÁM BỤI CÁT CỦA MÔI TRƯỜNG: không có công trình dã chiến nào sạch tinh với ranh giới cắt thẳng tắp —
  //  - sàn / dốc: cát (bùn, bụi tuỳ bản đồ) lấn vào từ mép giáp đất & ụ đất, viền lồi lõm, vệt cát gió thổi lấm tấm
  //  - chân tường: bụi cát bắn / bám cao ~1-2,5 m, mép loang lổ
  //  - mặt ngửa (đỉnh tường cánh, nóc hầm, gờ mặt tiền): cát đọng thành mảng; mặt vát giữ ít; tường đứng gần sạch;
  //    mặt úp (trần, dầm) gần như không bám
  //  - màng bụi mỏng + vệt bẩn lem nhem theo hướng mặt: mảng loang trên mặt ngửa, vệt nước mưa chảy dọc trên tường đứng
  // Nhiễu theo toạ độ thế giới (không lặp theo ô texture); mức độ & màu theo bản đồ
  //  - RÊU / ĐỊA Y mọc nơi nước đọng: đỉnh tường, chân tường (vùng nước mưa hắt ~0,5-1 m), dọc mạch ván khuôn, mặt khuất
  //    nắng; vệt nước mưa đen chảy từ gờ mặt tiền / đỉnh tường; vài vết nứt rỉ sắt (cốt thép) hoặc kết tủa vôi trắng;
  //    mép vát sứt lộ cốt liệu. Mức độ theo bản đồ: rừng / sông hồ rêu xanh dày, cao nguyên địa y + rêu, đô thị bụi bẩn
  //    + ít rêu, sa mạc gần như không (chỉ bám cát bụi)
  //  - NẮP HẦM: đất từ ụ trôi lên mép tấm, cỏ dại mọc ở mạch co giãn & vết nứt, vệt vũng nước khô, rêu ở mép
  //  - LÒNG HẦM ẨM: vũng nước đọng trên sàn hạ thấp (bóng loáng phản chiếu trời ở miệng hầm), chân tường thấm ẩm sẫm màu,
  //    vệt nước rỉ chảy từ mạch trần, vôi kết tủa dọc dầm trần
  // ===========================================================================
  const GRIME = {
    DESERT: { c: [0.8, 0.67, 0.48], k: 1.0, moss: [0.45, 0.44, 0.3], mk: 0.04, lich: [0.72, 0.66, 0.52], lk: 0.1, wet: 0.16, weed: 0.12 },
    HIGHLAND: { c: [0.6, 0.55, 0.45], k: 0.75, moss: [0.31, 0.36, 0.17], mk: 0.55, lich: [0.74, 0.73, 0.58], lk: 0.75, wet: 0.7, weed: 0.7 },
    RIVER_LAKE: { c: [0.52, 0.45, 0.34], k: 0.7, moss: [0.23, 0.33, 0.12], mk: 0.85, lich: [0.66, 0.68, 0.5], lk: 0.35, wet: 0.95, weed: 0.9 },
    JUNGLE: { c: [0.4, 0.32, 0.22], k: 0.7, moss: [0.17, 0.29, 0.08], mk: 1.0, lich: [0.6, 0.64, 0.46], lk: 0.25, wet: 1.0, weed: 1.0 },
    URBAN: { c: [0.6, 0.58, 0.54], k: 0.6, moss: [0.28, 0.32, 0.17], mk: 0.35, lich: [0.7, 0.7, 0.62], lk: 0.25, wet: 0.6, weed: 0.5 }
  };
  // ===========================================================================
  // HỐ ĐẠN THẬT TRÊN BÊ TÔNG CỨ ĐIỂM
  //  Mặt tường là mặt phẳng lớn -> không khoét lưới được: shader tường (và vết dán trên tường) bỏ điểm ảnh trong viền hố
  //  răng cưa, phía sau đặt 1 "lòng chảo" 3D sâu thật (được chiếu sáng, đổ bóng) + cốt thép gỉ lộ ra ở hố lớn.
  //  Hố gần nhau cùng mặt dồn lại: rộng & sâu dần. Chỉ hình ảnh — va chạm, cứ điểm vẫn nguyên (hố tối đa ~0,9 m
  //  trong tường dày ~3,5 m). Toạ độ & hạt giống lấy từ điểm trúng (gói ENV_HIT) -> mọi máy khoét giống hệt nhau
  // ===========================================================================
  const MAX_HOLES = 96;
  const HOLE_U = {
    uHoleP: { value: Array.from({ length: MAX_HOLES }, () => new THREE.Vector4()) },   // tâm (mặt tường) + bán kính
    uHoleN: { value: Array.from({ length: MAX_HOLES }, () => new THREE.Vector4()) },   // pháp tuyến + hạt giống viền
    uHoleCount: { value: 0 }
  };
  // viền hố răng cưa (tỉ lệ theo bán kính) — JS & GLSL dùng đúng một công thức
  const holeRim = (a, s) => 0.9 + 0.06 * Math.sin(3 * a + s) + 0.06 * Math.sin(7 * a + s * 1.7) + 0.04 * Math.sin(11 * a + s * 2.3) + 0.03 * Math.sin(17 * a + s * 3.1);
  const HOLE_GLSL = `uniform vec4 uHoleP[${MAX_HOLES}]; uniform vec4 uHoleN[${MAX_HOLES}]; uniform int uHoleCount;
varying vec3 vHoleWP; varying vec3 vHoleWN;
bool shInHole(vec3 wp, vec3 wn) {
  for (int i = 0; i < ${MAX_HOLES}; i++) {
    if (i >= uHoleCount) break;
    vec4 P = uHoleP[i]; vec4 N = uHoleN[i];
    vec3 d = wp - P.xyz;
    float dn = dot(d, N.xyz);
    if (abs(dn) > 0.9 || dot(wn, N.xyz) < 0.6) continue;
    vec3 q = d - N.xyz * dn;
    float l = length(q);
    if (l > P.w * 1.2) continue;
    vec3 t = abs(N.y) > 0.9 ? vec3(1.0, 0.0, 0.0) : normalize(vec3(N.z, 0.0, -N.x));
    vec3 b = cross(N.xyz, t);
    float a = atan(dot(q, b), dot(q, t));
    if (l < P.w * (0.9 + 0.06 * sin(3.0 * a + N.w) + 0.06 * sin(7.0 * a + N.w * 1.7) + 0.04 * sin(11.0 * a + N.w * 2.3) + 0.03 * sin(17.0 * a + N.w * 3.1))) return true;
  }
  return false;
}
`;
  // Vật liệu (tường bê tông cứ điểm, vết dán trên tường) bỏ điểm ảnh nằm trong lỗ hố đạn & vùng mái đã sập
  // (đánh dấu bằng WeakSet chứ không qua userData: vật liệu clone() chép cả userData -> bản sao bị bỏ qua)
  const HOLE_MATS = new WeakSet();
  function holeDiscard(mat) {
    if (!mat || HOLE_MATS.has(mat)) return mat;
    HOLE_MATS.add(mat);
    const prev = mat.onBeforeCompile, pk = mat.customProgramCacheKey();
    mat.onBeforeCompile = (sh, r) => {
      if (prev) prev.call(mat, sh, r);
      Object.assign(sh.uniforms, HOLE_U, CUT_U);
      sh.vertexShader = 'varying vec3 vHoleWP;\nvarying vec3 vHoleWN;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
  { vec4 hp = vec4(transformed, 1.0); vec3 hn = objectNormal;
  #ifdef USE_INSTANCING
    hp = instanceMatrix * hp; hn = mat3(instanceMatrix) * hn;
  #endif
    vHoleWP = (modelMatrix * hp).xyz; vHoleWN = normalize(mat3(modelMatrix) * hn); }`);
      sh.fragmentShader = HOLE_GLSL + CUT_GLSL + sh.fragmentShader.replace('void main() {', 'void main() {\n  if (shInHole(vHoleWP, vHoleWN) || shInCut(vHoleWP)) discard;');
    };
    mat.customProgramCacheKey = () => pk + '|holes2';
    mat.needsUpdate = true;
    return mat;
  }
  // [bán kính, độ sâu] hố theo loại đạn trên bê tông cường độ cao: hố đục đanh gọn, không bị toét rộng
  const CRATER = {
    // 30mm nổ-mảnh: mỗi phát mẻ ~20 cm sâu ~9 cm; dồn vào hố cũ thì sâu thêm (xem addCrater)
    SCOUT_BULLET: [0.65, 0.25], INCENDIARY_HMG: [0.65, 0.25], MG762: [0.45, 0.15], INCENDIARY: [1.4, 0.7], GATLING_BULLET: [1.5, 0.75],
    // đạn xuyên / đầu nổ lõm: miệng nhỏ đanh gọn, lõi khoan hẹp sâu vào bê tông mác cao
    AP: [1.0, 5.2], RPG: [1.3, 4.4], ANTI_TANK_MISSILE: [1.6, 5.5],
    CLUSTER_SUBMUNITION: [1.7, 0.8], CLUSTER: [2.6, 1.1], NORMAL: [3.4, 1.5], HE: [4.8, 2.1]
  };

  // ===========================================================================
  // SẬP MÁI CỨ ĐIỂM: mái chia 18 ô (6 nhịp dọc giữa các dầm × 3 dải ngang), mỗi ô có "máu". Bắn mặt tiền / trần / đỉnh ụ,
  // sóng nổ lân cận bào mòn dần; hết máu -> ô mái (kèm lớp đất phủ, gờ mặt tiền phía trên) sập xuống lòng hầm.
  //  - Va chạm & che chắn đổi theo: đạn rơi lọt xuống lòng hầm, xe dưới ô sập không còn được mái che, xe đậu trên nóc rơi xuống
  //  - Hình ảnh: shader mái / đất phủ / vết dán bỏ điểm ảnh trong vùng sập (mép răng cưa), mép bê tông gãy lởm chởm + đất phủ,
  //    cốt thép đứt thõng xuống, đống đổ nát dưới sàn, bụi mù lúc sập
  //  Đồng bộ: máu ô cộng dồn theo gói ENV_HIT (mọi máy như nhau) + chuỗi trạng thái môi trường cho máy vào giữa trận
  // ===========================================================================
  const MAX_CUTS = 90;   // 3 cứ điểm x (18 ô mái + 12 đoạn tường cánh)
  const CUT_U = {
    uCutA: { value: Array.from({ length: MAX_CUTS }, () => new THREE.Vector4()) },   // tâm x, z, y0, y1
    uCutB: { value: Array.from({ length: MAX_CUTS }, () => new THREE.Vector4()) },   // trục f (x, z), trục r (x, z)
    uCutC: { value: Array.from({ length: MAX_CUTS }, () => new THREE.Vector4()) },   // nửa dài f, nửa rộng r, hạt giống
    uCutCount: { value: 0 }
  };
  // mép vùng sập lấn ra răng cưa 0..5 đơn vị (JS & GLSL cùng công thức) -> các ô sập kề nhau chồng lên nhau, không sót khe
  const cutJag = (s, seed) => 2.5 + 1.3 * Math.sin(0.17 * s + seed) + 0.8 * Math.sin(0.43 * s + 1.9 * seed) + 0.35 * Math.sin(1.1 * s + 2.7 * seed);
  const CUT_GLSL = `uniform vec4 uCutA[${MAX_CUTS}]; uniform vec4 uCutB[${MAX_CUTS}]; uniform vec4 uCutC[${MAX_CUTS}]; uniform int uCutCount;
float shJag(float s, float sd) { return 2.5 + 1.3 * sin(0.17 * s + sd) + 0.8 * sin(0.43 * s + 1.9 * sd) + 0.35 * sin(1.1 * s + 2.7 * sd); }
bool shInCut(vec3 wp) {
  for (int i = 0; i < ${MAX_CUTS}; i++) {
    if (i >= uCutCount) break;
    vec4 A = uCutA[i];
    if (wp.y < A.z || wp.y > A.w) continue;
    vec4 B = uCutB[i]; vec4 C = uCutC[i];
    vec2 d = wp.xz - A.xy;
    float lf = dot(d, B.xy), lr = dot(d, B.zw);
    if (abs(lf) > C.x + 5.0 || abs(lr) > C.y + 5.0) continue;
    if (lf < C.x + shJag(lr, C.z) && lf > -C.x - shJag(lr, C.z + 1.3) && lr < C.y + shJag(lf, C.z + 2.6) && lr > -C.y - shJag(lf, C.z + 3.9)) return true;
  }
  return false;
}
`;
  // vật liệu đổ bóng của mái / đất phủ: bỏ phần đã sập (không thì lòng hầm dưới lỗ sập vẫn tối như còn mái)
  function cutDepthMat() {
    const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, CUT_U);
      sh.vertexShader = 'varying vec3 vCutWP;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
  vCutWP = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
      sh.fragmentShader = CUT_GLSL + 'varying vec3 vCutWP;\n' + sh.fragmentShader.replace('void main() {', 'void main() {\n  if (shInCut(vCutWP)) discard;');
    };
    m.customProgramCacheKey = () => 'shCutDepth1';
    return m;
  }
  // biên các ô mái theo f (giữa các dầm) & theo r (dải ngoài dừng trước góc vát nách: phần mái gác trên tường còn lại)
  const PANEL_F = [-96, -64, -32, 0, 32, 64, 96];
  const PANEL_R = [-70, -32, 32, 70];
  // các tầng mặt vỡ theo bề dày bản mái (tỉ lệ ROOF)
  const FR_LV = [0, 0.18, 0.36, 0.55, 0.74, 1];
  // máu ô mái theo số phát pháo tăng nổ thường (= 1) trúng thẳng mặt bê tông. Bản mái bê tông cốt thép dày 3,25 m dưới 1 m đất:
  // đạn 120 mm nổ chạm chỉ bóc hố ~25-35 cm mỗi phát (công thức phá vật cản FM 5-34) — sập cả ô 4 x 5 m cần đục thủng nhiều chỗ
  // qua 3 m bê tông: hàng trăm phát 120 mm; lựu pháo 155 dội tập trung ~70-90 phát trúng nóc một ô (đất phủ đỡ bớt).
  // Trước đây 15-20 (sập sau ~20 phát 120 mm / ~10 phát 155) — mỏng như một bản sàn nhà
  const PANEL_HP = [120, 160, 160, 160, 160, 120];
  // TƯỜNG CÁNH (tường chắn đất bê tông cốt thép dày 2,25 m loe 2 bên mỗi đầu hầm, đất đắp phía sau): đoạn gần miệng hầm cao,
  // dày đất đỡ nhất, đoạn cuối thấp
  const WING_SEG = 3, WING_HP = [176, 128, 80], SLUMP_IN = 14;
  const PANEL_DMG = {
    // Bê tông dày 2,25-3,25 m: đạn súng 12,7 / 7,62 chỉ rỗ mặt, không làm yếu kết cấu; 30 mm nổ mảnh chỉ mẻ ~10 cm mỗi phát
    // (hàng chục nghìn phát mới sập một đoạn tường cánh — thực tế là không thể). Đạn xuyên / đầu nổ lõm chỉ khoan lỗ hầm hẹp
    // (APFSDS ~2 m, RPG ~0,9 m, tên lửa ~1,7 m bê tông) — gần như không làm sập; lựu 40 mm / bom con (vài chục gam thuốc nổ)
    // chỉ bóc vài cm. Trước đây 30 mm sập tường cánh sau ~330 phát, lựu 40 mm phá bằng 1/4 đạn 120 mm
    SCOUT_BULLET: 0, INCENDIARY_HMG: 0, MG762: 0, INCENDIARY: 0.003, GATLING_BULLET: 0.004, AP: 0.05, RPG: 0.1, ANTI_TANK_MISSILE: 0.2,
    CLUSTER_SUBMUNITION: 0.05, CLUSTER: 0.4, NORMAL: 1.0, HE: 1.5
  };

  // opts: { shadeDir: [x, z] hướng nắng nằm ngang (mặt quay ngược hướng này là mặt khuất nắng) }
  // Mực nước ngập lòng hầm khi mưa (cao độ cục bộ; -999 = không ngập) — dùng chung mọi cứ điểm, xem setFlood
  const FLOOD_L = { value: -999 };
  function weatherMat(mat, kind, mapType, opts = {}) {
    const G = GRIME[mapType] || GRIME.HIGHLAND;
    const E = EARTH[mapType] || EARTH.HIGHLAND;
    const floor = kind === 'floor';
    const sd = opts.shadeDir || [0.6, 0.8];
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uSand = { value: new THREE.Vector3(...G.c) };
      sh.uniforms.uSandK = { value: G.k };
      sh.uniforms.uShDim = { value: new THREE.Vector4(S.HB, S.CEIL, S.END, S.WI) };
      sh.uniforms.uMoss = { value: new THREE.Vector3(...G.moss) };
      sh.uniforms.uLich = { value: new THREE.Vector3(...G.lich) };
      sh.uniforms.uWK = { value: new THREE.Vector4(G.mk, G.lk, G.wet, G.weed) };
      sh.uniforms.uSoil = { value: new THREE.Vector3(E.dirt[0] / 255 * 0.95, E.dirt[1] / 255 * 0.95, E.dirt[2] / 255 * 0.95) };
      sh.uniforms.uShadeDir = { value: new THREE.Vector2(sd[0], sd[1]).normalize() };
      sh.uniforms.uFloodL = FLOOD_L;
      // nắp hầm: nửa dài mặt trên theo f, theo r, cao độ đỉnh ụ, bước mạch co giãn
      sh.uniforms.uPad = { value: new THREE.Vector4(S.HB - 7 - S.BEVEL, S.WI - 2 - S.BEVEL, S.CREST, (S.HB - 7 - S.BEVEL) / 2) };
      sh.vertexShader = 'attribute float aFloorY;\nattribute float aSand;\nattribute float aTopY;\nvarying vec3 vShWP;\nvarying vec3 vShWN;\nvarying vec3 vShLP;\nvarying float vShLY, vShFY, vShSand, vShTY;\n' +
        sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
  vShWP = (modelMatrix * vec4(transformed, 1.0)).xyz;
  vShWN = normalize(mat3(modelMatrix) * objectNormal);
  vShLY = transformed.y; vShFY = aFloorY; vShSand = aSand; vShTY = aTopY; vShLP = transformed;`);
      sh.fragmentShader = `uniform vec3 uSand; uniform float uSandK; uniform vec4 uShDim;
uniform vec3 uMoss; uniform vec3 uLich; uniform vec4 uWK; uniform vec3 uSoil; uniform vec2 uShadeDir; uniform vec4 uPad; uniform float uFloodL;
varying vec3 vShWP; varying vec3 vShWN; varying vec3 vShLP; varying float vShLY, vShFY, vShSand, vShTY;
float shH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float shN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(shH(i), shH(i + vec2(1.0, 0.0)), f.x), mix(shH(i + vec2(0.0, 1.0)), shH(i + vec2(1.0, 1.0)), f.x), f.y); }
` + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
  float shWet = 0.0;
  {
    vec2 q = vShWP.xz;
    float n1 = shN(q * 0.035), n2 = shN(q * 0.13 + 7.1), n3 = shN(q * 0.6 + 3.7), n4 = shN(q * 2.3 + 1.3);
    float fb = n1 * 0.5 + n2 * 0.3 + n3 * 0.14 + n4 * 0.06;
    float up = clamp(vShWN.y, 0.0, 1.0), down = clamp(-vShWN.y, 0.0, 1.0);
    float af = abs(vShLP.x);
    // dưới mái che (lòng hầm)
    float uT = (1.0 - smoothstep(uShDim.x - 6.0, uShDim.x + 22.0, af)) * (1.0 - step(uShDim.y + 0.5, vShLP.y));
    // Bụi cát đọng theo HƯỚNG MẶT (không cào bằng): mặt ngửa hứng nhiều nhất; mặt vát ~45° cát trượt đi, chỉ còn
    // lớp mỏng & vệt đọng ở chân vát; tường đứng chỉ bẩn ở chân + vệt nước mưa chảy dọc; mặt úp (trần, dầm) gần như sạch
    float flatK = smoothstep(0.82, 0.97, up);                 // mặt gần nằm ngang
    float slopeK = smoothstep(0.3, 0.75, up) * (1.0 - flatK); // mặt vát
    float wallK = 1.0 - smoothstep(0.15, 0.45, up) - down;    // mặt đứng
    vec2 tw = normalize(vec2(-vShWN.z, vShWN.x) + 1e-4);
    // toạ độ phẳng theo mặt: mặt ngửa dùng (x, z), mặt đứng dùng (dọc mặt tường, cao độ) -> vân rêu / vết không bị kéo sọc
    vec2 qs = mix(q, vec2(dot(q, tw), vShWP.y), clamp(1.0 - up, 0.0, 1.0) * (1.0 - down));
    float sand;
    ${floor ? `// cát lấn từ mép vào (mép lồi lõm theo nhiễu nhiều tầng) + vệt cát gió thổi lấm tấm, dày hơn gần mép
    sand = smoothstep(0.42, 0.62, vShSand * 0.95 + (fb - 0.5) * 0.9);
    sand = max(sand, smoothstep(0.55, 0.9, n2 * 0.6 + n4 * 0.4) * 0.4 * (0.25 + vShSand));` : `// bụi cát bám chân tường (cao ~1-2,5 m, mép loang), mặt úp thì không
    float hb0 = vShLY - vShFY;
    sand = (1.0 - smoothstep(0.0, 6.0 + fb * 14.0, hb0)) * (0.4 + 0.45 * n3) * (1.0 - down);
    // mặt ngửa: cát đọng thành mảng; mặt vát: chỉ lớp mỏng loang, dày hơn ở chỗ thấp của mặt vát (cát trượt xuống đọng lại)
    sand = max(sand, flatK * smoothstep(0.5, 0.64, fb * 0.75 + n2 * 0.25 + (n4 - 0.5) * 0.12) * 0.85);
    sand = max(sand, slopeK * smoothstep(0.55, 0.75, fb + n4 * 0.15) * 0.35);`}
    sand *= uSandK;
    // màng bụi mỏng: phủ mặt ngửa, ít trên mặt vát, rất ít trên tường đứng, gần như không dưới trần
    float film = (0.04 + 0.1 * smoothstep(0.3, 0.8, fb)) * uSandK * (0.2 + 0.8 * up) * (1.0 - 0.8 * down);
    diffuseColor.rgb = mix(diffuseColor.rgb, uSand * (0.86 + 0.26 * n4), clamp(film + sand, 0.0, 0.95));
    // vệt bẩn: mặt ngửa / vát loang lổ thành mảng (bùn khô, dầu); tường đứng thành VỆT DỌC nước mưa cuốn bụi chảy xuống
    // (nhiễu kéo dài theo phương đứng, toạ độ ngang dọc theo mặt tường)
    float st = shN(vec2(dot(q, tw) * 0.45, vShWP.y * 0.025)) * 0.7 + shN(vec2(dot(q, tw) * 1.6, vShWP.y * 0.06) + 9.0) * 0.3;
    float blot = smoothstep(0.55, 0.85, n2 * 0.7 + n1 * 0.3) * 0.16 + smoothstep(0.72, 0.95, n3) * 0.08;
    float streak = smoothstep(0.58, 0.85, st) * 0.13;
    float grime = mix(blot * (1.0 - 0.5 * slopeK), streak, clamp(wallK, 0.0, 1.0)) * (1.0 - 0.7 * down);
    diffuseColor.rgb *= 1.0 - grime * (1.0 - clamp(sand, 0.0, 1.0));
    ${floor ? `// NƯỚC ĐỌNG: lòng hầm có sàn hạ thấp 2,5 m + chân dốc là chỗ trũng nhất -> vũng nước phẳng (bóng loáng, sẫm), quầng
    // ẩm sẫm quanh vũng, nhiều hơn sát chân tường bên; bản đồ khô chỉ còn vệt bùn khô viền vũng. Ngoài trời (sân / phễu)
    // vài vũng nhỏ sau mưa ở chỗ trũng (bản đồ ẩm)
    {
      float tun = 1.0 - smoothstep(uShDim.x + 6.0, uShDim.x + 34.0, af);
      float arr = abs(vShLP.z) / uShDim.w;
      float pn = shN(q * 0.02 + 3.1) * 0.55 + shN(q * 0.065 + 8.0) * 0.3 + shN(q * 0.27 + 1.0) * 0.15;
      float dry = 0.42 * (1.0 - uWK.z);
      float lvl = pn + 0.2 * smoothstep(0.55, 0.97, arr) + 0.08 * smoothstep(uShDim.x - 30.0, uShDim.x + 10.0, af);
      float pud = smoothstep(0.58, 0.61, lvl - dry) * (1.0 - smoothstep(uShDim.x + 2.0, uShDim.x + 12.0, af));   // nước chỉ đọng chỗ sàn phẳng, không trên mặt dốc
      float damp = smoothstep(0.36, 0.55, lvl - dry) * tun;
      float stain = smoothstep(0.5, 0.53, lvl) * (1.0 - smoothstep(0.54, 0.6, lvl)) * tun * (0.12 + 0.18 * (1.0 - uWK.z));
      // (vũng ngoài trời đã bỏ: phản chiếu trời quang dưới nắng ra mảng trắng như tuyết — nước chỉ đọng trong lòng hầm)
      float pudO = 0.0;
      diffuseColor.rgb *= 1.0 - 0.3 * damp - stain;
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.4 + vec3(0.012, 0.016, 0.02), max(pud, pudO) * 0.85);
      shWet = max(max(damp * 0.55, pud), pudO);
    }` : `{
      float hb = vShLY - vShFY;            // cao hơn mặt sàn / đất dưới chân
      float below = vShTY - vShLY;         // thấp hơn mép đỉnh tường / gờ
      float pad = step(uPad.z - 2.6, vShLP.y) * step(0.3, up) * (1.0 - step(uPad.z + 3.0, vShLP.y)) * step(abs(vShLP.x), uPad.x + 3.8);   // không tính gờ mặt tiền
      vec2 nh = normalize(vShWN.xz + 1e-4);
      float shadeSide = clamp(-dot(nh, uShadeDir), 0.0, 1.0) * (1.0 - up) * (1.0 - down);
      // mạch ván khuôn (tấm 2 m x 1 m) lấy từ uv texture bê tông
      float fv = fract(vUv.y * 8.0), du = fract((vUv.x - mod(floor(vUv.y * 8.0), 2.0) * 0.125) * 4.0);
      float jd = min(min(fv, 1.0 - fv), 2.0 * min(du, 1.0 - du));
      float joint = (1.0 - smoothstep(0.015, 0.09 + 0.08 * n3, jd)) * clamp(wallK, 0.0, 1.0);
      float m1 = shN(qs * 0.05 + 11.0), m2 = shN(qs * 0.21 + 4.0), m3 = shN(qs * 0.9 + 2.0);
      float mn = m1 * 0.5 + m2 * 0.33 + m3 * 0.17;
      float wk = clamp(wallK, 0.0, 1.0);
      // độ ẩm: vùng nước hắt chân tường, ngay dưới mép đỉnh, mặt ngửa / vát đọng nước, mạch, vệt chảy, mặt khuất nắng
      float splash = (1.0 - smoothstep(2.0 + 4.0 * m2, 6.0 + 7.0 * m1, hb)) * wk;
      float topZone = (1.0 - smoothstep(0.0, 5.0 + 9.0 * m2, below)) * wk;
      float rainSt = smoothstep(0.5, 0.82, st) * (1.0 - smoothstep(0.0, 22.0 + 46.0 * st, below)) * wk * (1.0 - uT);
      float moist = splash * 0.95 + (flatK * 0.8 + slopeK * 0.55) * (1.0 - pad * 0.4) + joint * 0.7 + topZone * 0.45 + rainSt * 0.5 + shadeSide * 0.35;
      float lightK = mix(1.0, 0.18, uT);   // rêu cần ánh sáng: sâu trong lòng hầm gần như không mọc
      float moss = smoothstep(0.62, 0.95, moist * (0.45 + 0.85 * mn)) * uWK.x * lightK * (1.0 - down);
      moss = max(moss, smoothstep(0.7, 0.9, mn) * uWK.x * 0.35 * (flatK + slopeK) * lightK);
      vec3 mossC = uMoss * (0.7 + 0.6 * m3) * (1.0 + 0.25 * (n4 - 0.5));
      // vệt nước mưa đen chảy từ gờ mặt tiền / đỉnh tường xuống (sa mạc nhạt hơn)
      diffuseColor.rgb *= 1.0 - rainSt * 0.3 * (0.35 + 0.65 * uWK.z);
      diffuseColor.rgb = mix(diffuseColor.rgb, mossC, clamp(moss, 0.0, 0.92));
      // địa y: đốm tròn loang nhạt trên mặt phơi nắng (đỉnh tường, mặt tiền, nắp hầm)
      float lc = shN(qs * 0.55 + 21.0) * 0.65 + shN(qs * 1.9 + 3.0) * 0.35;
      float lich = smoothstep(0.66, 0.72, lc) * uWK.y * (1.0 - uT) * (1.0 - down) * (0.35 + 0.65 * (1.0 - moss));
      diffuseColor.rgb = mix(diffuseColor.rgb, uLich * (0.85 + 0.3 * m3), lich * 0.7);
      // mép vát / gờ sứt mẻ lộ cốt liệu
      float sp = smoothstep(0.74, 0.8, shN(qs * 0.3 + 7.7)) * clamp(slopeK + topZone * 0.6, 0.0, 1.0);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.6, 0.58, 0.54) * (0.65 + 0.6 * shN(qs * 3.1)), sp * 0.7);
      // vài vết nứt: rỉ sắt cốt thép (nâu cam) hoặc kết tủa vôi trắng chảy xuống từ vết nứt
      if (wk > 0.5) {
        vec2 cs = vec2(20.0, 28.0), cc = floor(qs / cs);
        float hc = shH(cc + vec2(17.3, 5.1));
        if (hc > 0.86) {
          vec2 lc2 = qs - (cc + vec2(0.2 + 0.6 * fract(hc * 7.13), 0.82)) * cs;
          float wob = (shN(vec2(lc2.y * 0.35, hc * 40.0)) - 0.5) * 1.6;
          float wdt = 0.6 + 1.4 * fract(hc * 13.7), len = 7.0 + 16.0 * fract(hc * 3.31);
          float run = (1.0 - smoothstep(wdt * 0.3, wdt, abs(lc2.x + wob) / (1.0 + 0.6 * max(0.0, -lc2.y) / len))) * (1.0 - step(0.5, lc2.y)) * (1.0 - smoothstep(len * 0.4, len, -lc2.y));
          float crack = (1.0 - smoothstep(0.1, 0.32, abs(lc2.x + wob * 1.8))) * (1.0 - smoothstep(2.0, 5.5, abs(lc2.y - 1.5)));
          crack = max(crack, (1.0 - smoothstep(0.1, 0.3, abs(lc2.y - 1.5 + (shN(vec2(lc2.x * 0.4, hc * 9.0)) - 0.5) * 2.0))) * (1.0 - smoothstep(2.0, 7.0, abs(lc2.x))));
          diffuseColor.rgb *= 1.0 - crack * 0.5;
          if (hc > 0.93) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.45, 0.24, 0.11) * (0.8 + 0.4 * n4), run * 0.6);
          else diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.88, 0.87, 0.82), run * 0.45 * (0.6 + 0.4 * n3));
        }
      }
      // LÒNG HẦM ẨM: chân tường thấm ẩm, vệt nước rỉ từ mạch trần chảy xuống, mảng ẩm trên trần; vôi trắng dọc dầm trần
      float dampLow = (1.0 - smoothstep(5.0 + 10.0 * m1, 12.0 + 18.0 * m2, hb)) * wk;
      float seepSt = shN(vec2(dot(q, tw) * 0.6, vShWP.y * 0.04) + 31.0);
      float seep = smoothstep(0.55, 0.78, seepSt) * (1.0 - smoothstep(0.0, 14.0 + 30.0 * seepSt, below)) * wk;
      float ceilD = down * smoothstep(0.45, 0.7, n2 * 0.6 + n1 * 0.4);
      float wetW = clamp(max(max(dampLow, seep), ceilD * 0.8), 0.0, 1.0) * uT * uWK.z;
      wetW = max(wetW, splash * 0.3 * uWK.z * (1.0 - uT));
      diffuseColor.rgb *= 1.0 - 0.34 * wetW;
      float nb = abs(fract(vShLP.x / 32.0 + 0.5) - 0.5) * 32.0;   // khoảng cách tới dầm trần gần nhất (dầm cách 4 m)
      float cal = down * uT * (1.0 - smoothstep(3.5, 9.0, nb)) * smoothstep(0.5, 0.75, m2 * 0.7 + n4 * 0.3) * (0.3 + 0.7 * uWK.z);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.83, 0.82, 0.78), cal * 0.5);
      shWet = wetW;
      if (uFloodL > -900.0) {
        // HẦM NGẬP: chân tường dưới & sát mặt nước thấm ẩm sẫm (mao dẫn lên ~0,5-1 m, mép loang), vạch cặn bùn / váng
        // ngay trên mực nước (nước dao động để lại)
        float hw = vShLY - uFloodL;
        float wl = (1.0 - smoothstep(0.0, 4.0 + 5.0 * m2, hw)) * wk;
        float ln = (1.0 - smoothstep(0.0, 0.45, abs(hw - 0.9 - 0.7 * n3))) * wk;
        diffuseColor.rgb *= 1.0 - 0.4 * wl;
        diffuseColor.rgb = mix(diffuseColor.rgb, uSoil * 0.75, ln * 0.4);
        shWet = max(shWet, wl);
      }
      // NẮP HẦM: đất trôi từ ụ lên mép tấm, mạch co giãn & vết nứt sẫm có cỏ dại, vệt vũng nước khô, rêu ở mép
      if (pad > 0.5) {
        vec2 lp = vShLP.xz;
        float e = min(uPad.x - abs(lp.x), uPad.y - abs(lp.y));
        float edge = 1.0 - smoothstep(0.0, 16.0 + 26.0 * n2, e);
        float soil = smoothstep(0.3, 0.75, edge * 0.85 + (fb - 0.5) * 0.7 + (m2 - 0.5) * 0.3);
        vec2 jg = abs(fract(lp / uPad.w + 0.5) - 0.5) * uPad.w;
        float jt = 1.0 - smoothstep(0.3, 1.0, min(jg.x, jg.y));
        float ck = (1.0 - smoothstep(0.015, 0.04, abs(shN(lp * 0.045 + 4.0) - 0.5))) * smoothstep(0.35, 0.65, shN(lp * 0.02 + 1.0));
        float pz = shN(lp * 0.028 + 9.0) * 0.7 + shN(lp * 0.11 + 2.0) * 0.3;
        float ring = smoothstep(0.55, 0.58, pz) * (1.0 - smoothstep(0.6, 0.66, pz));
        diffuseColor.rgb *= 1.0 - 0.14 * ring - 0.07 * smoothstep(0.58, 0.7, pz) - 0.4 * jt - 0.35 * ck;
        diffuseColor.rgb = mix(diffuseColor.rgb, uSoil * (0.78 + 0.4 * n4), soil * 0.9);
        float weed = max(jt, ck) * smoothstep(0.4, 0.7, shN(lp * 0.3 + 2.0)) * uWK.w;
        weed = max(weed, soil * smoothstep(0.55, 0.8, shN(lp * 0.18 + 6.0)) * uWK.w);
        diffuseColor.rgb = mix(diffuseColor.rgb, uMoss * 1.25 * (0.7 + 0.6 * n3), clamp(weed, 0.0, 0.9));
        diffuseColor.rgb = mix(diffuseColor.rgb, mossC, edge * smoothstep(0.45, 0.75, mn) * uWK.x * 0.8);
      }
    }`}
  }`).replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  roughnessFactor = mix(roughnessFactor, ${floor ? '0.05' : '0.42'}, clamp(shWet, 0.0, 1.0));`).replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
  {
    // Trong lòng hầm (dưới mái) ánh trời chỉ lọt vào từ 2 đầu miệng hầm: càng vào sâu càng tối, trần & dầm còn tối hơn
    float af = abs(vShLP.x);
    float under = (1.0 - smoothstep(uShDim.x - 6.0, uShDim.x + 22.0, af)) * (1.0 - step(uShDim.y + 0.5, vShLP.y));
    float depthIn = clamp(1.0 - af / uShDim.x, 0.0, 1.0);
    float vis = mix(1.0, mix(0.55, 0.3, depthIn) * (1.0 - 0.25 * clamp(-vShWN.y, 0.0, 1.0)), under);
    reflectedLight.indirectDiffuse *= vis;
    reflectedLight.indirectSpecular *= vis${floor ? ' * mix(0.45, 2.6, clamp(shWet, 0.0, 1.0))' : ''};
  }`);
    };
    mat.customProgramCacheKey = () => 'shWeather5:' + kind;
    return mat;
  }
  // Thuộc tính cho shader bám bụi: aFloorY = cao độ mặt sàn / đất dưới chân đỉnh đó, aSand = mức cát lấn (sàn),
  // aTopY = cao độ mép đỉnh tường / gờ phía trên đỉnh đó (vệt nước mưa / nước rỉ chảy xuống từ đó)
  function addWeatherAttrs(geo, floorAt, sandAt, topAt) {
    const P = geo.attributes.position, n = P.count, fy = new Float32Array(n), sd = new Float32Array(n), ty = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      fy[i] = floorAt ? floorAt(x, y, z) : -1e4;
      sd[i] = sandAt ? sandAt(x, y, z) : 0;
      ty[i] = topAt ? topAt(x, y, z) : y + 1e3;
    }
    geo.setAttribute('aFloorY', new THREE.BufferAttribute(fy, 1));
    geo.setAttribute('aSand', new THREE.BufferAttribute(sd, 1));
    geo.setAttribute('aTopY', new THREE.BufferAttribute(ty, 1));
    return geo;
  }
  // Bầu trời phản chiếu cho vũng nước (cube map vẽ canvas, có mipmap: độ nhám chọn mức mờ)
  function envCube() {
    if (TEX.env) return TEX.env;
    const size = 32, sky = [150, 168, 186], hor = [182, 178, 166], gnd = [60, 56, 48];
    const col = dy => {
      const L = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
      return dy >= 0 ? L(hor, sky, Math.pow(Math.min(1, dy * 1.6), 0.7)) : L(hor, gnd, Math.min(1, Math.pow(-dy * 5, 0.6)));
    };
    const face = fn => {
      const c = canvas(size, size), g = c.getContext('2d'), img = g.createImageData(size, size);
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const u = (x + 0.5) / size * 2 - 1, v = (y + 0.5) / size * 2 - 1, k = (y * size + x) * 4, cc = col(fn(u, v));
        img.data[k] = cc[0]; img.data[k + 1] = cc[1]; img.data[k + 2] = cc[2]; img.data[k + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      return c;
    };
    const side = face((u, v) => -v / Math.hypot(1, u, v));
    const t = new THREE.CubeTexture([side, side, face(() => 1), face(() => -1), side, side]);
    t.needsUpdate = true;
    return (TEX.env = t);
  }

  class Builder {
    constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; this.i = []; }
    // Tứ giác a-b-c-d (ngược chiều kim đồng hồ khi nhìn từ phía pháp tuyến), uv theo đơn vị thế giới / scale
    quad(a, b, c, d, uvs, col) {
      const ux = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], vx = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
      let nx = ux[1] * vx[2] - ux[2] * vx[1], ny = ux[2] * vx[0] - ux[0] * vx[2], nz = ux[0] * vx[1] - ux[1] * vx[0];
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      const o = this.p.length / 3;
      for (const [v, t] of [[a, uvs[0]], [b, uvs[1]], [c, uvs[2]], [d, uvs[3]]]) {
        this.p.push(v[0], v[1], v[2]); this.n.push(nx, ny, nz); this.uv.push(t[0], t[1]);
        const k = col || 1; this.c.push(k, k, k);
      }
      this.i.push(o, o + 1, o + 2, o, o + 2, o + 3);
    }
    // Tứ giác với hệ số sáng riêng từng đỉnh (cols: 4 số)
    quadC(a, b, c, d, uvs, cols) {
      const o = this.p.length / 3;
      this.quad(a, b, c, d, uvs, 1);
      for (let k = 0; k < 4; k++) { const j = (o + k) * 3; this.c[j] = this.c[j + 1] = this.c[j + 2] = cols[k]; }
    }
    // Tứ giác quay mặt về hướng out (tự đảo thứ tự đỉnh nếu cần)
    quadOut(a, b, c, d, uvs, col, out) {
      const ux = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], vx = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
      const n = [ux[1] * vx[2] - ux[2] * vx[1], ux[2] * vx[0] - ux[0] * vx[2], ux[0] * vx[1] - ux[1] * vx[0]];
      if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] >= 0) this.quad(a, b, c, d, uvs, col);
      else this.quad(a, d, c, b, [uvs[0], uvs[3], uvs[2], uvs[1]], col);
    }
    /**
     * Lăng trụ: đa giác lồi 2D đùn theo trục. axis 'r': đỉnh (f, y), đùn r0..r1; axis 'f': đỉnh (r, y), đùn f0..f1.
     * skip: chỉ số cạnh bỏ qua (cạnh i nối đỉnh i -> i+1); caps: false = bỏ 2 mặt đầu; shade: hệ số sáng theo cạnh
     */
    prism(poly, axis, a0, a1, sc, skip = [], caps = true, shade = {}) {
      const P = (q, t) => axis === 'r' ? [q[0], q[1], t] : [t, q[1], q[0]];
      const n = poly.length;
      const cx = poly.reduce((s, q) => s + q[0], 0) / n, cy = poly.reduce((s, q) => s + q[1], 0) / n;
      let u = 0;
      for (let i = 0; i < n; i++) {
        const p = poly[i], q = poly[(i + 1) % n], len = Math.hypot(q[0] - p[0], q[1] - p[1]);
        if (!skip.includes(i)) {
          // pháp tuyến cạnh hướng ra xa tâm đa giác
          let ex = q[1] - p[1], ey = -(q[0] - p[0]);
          if (ex * ((p[0] + q[0]) / 2 - cx) + ey * ((p[1] + q[1]) / 2 - cy) < 0) { ex = -ex; ey = -ey; }
          const out = axis === 'r' ? [ex, ey, 0] : [0, ey, ex];
          this.quadOut(P(p, a0), P(q, a0), P(q, a1), P(p, a1), [[u / sc, a0 / sc], [(u + len) / sc, a0 / sc], [(u + len) / sc, a1 / sc], [u / sc, a1 / sc]], shade[i], out);
        }
        u += len;
      }
      if (!caps) return;
      for (const [t, sgn] of [[a0, -1], [a1, 1]]) {
        const out = axis === 'r' ? [0, 0, sgn] : [sgn, 0, 0];
        const uv = q => [q[0] / sc, q[1] / sc];
        for (let i = 1; i < n - 1; i++) this.quadOut(P(poly[0], t), P(poly[i], t), P(poly[i + 1], t), P(poly[i + 1], t), [uv(poly[0]), uv(poly[i]), uv(poly[i + 1]), uv(poly[i + 1])], shade.cap, out);
      }
    }
    // Hộp theo hệ cục bộ (x = f, y, z = r); bỏ mặt theo cờ skip {top,bottom,fp,fn,rp,rn}
    box(f0, f1, y0, y1, r0, r1, sc, skip = {}, shade = {}) {
      const U = v => v / sc;
      if (!skip.top) this.quad([f0, y1, r1], [f1, y1, r1], [f1, y1, r0], [f0, y1, r0], [[U(f0), U(r1)], [U(f1), U(r1)], [U(f1), U(r0)], [U(f0), U(r0)]], shade.top);
      if (!skip.bottom) this.quad([f0, y0, r0], [f1, y0, r0], [f1, y0, r1], [f0, y0, r1], [[U(f0), U(r0)], [U(f1), U(r0)], [U(f1), U(r1)], [U(f0), U(r1)]], shade.bottom);
      if (!skip.fp) this.quad([f1, y0, r1], [f1, y0, r0], [f1, y1, r0], [f1, y1, r1], [[U(-r1), U(y0)], [U(-r0), U(y0)], [U(-r0), U(y1)], [U(-r1), U(y1)]], shade.fp);
      if (!skip.fn) this.quad([f0, y0, r0], [f0, y0, r1], [f0, y1, r1], [f0, y1, r0], [[U(r0), U(y0)], [U(r1), U(y0)], [U(r1), U(y1)], [U(r0), U(y1)]], shade.fn);
      if (!skip.rp) this.quad([f0, y0, r1], [f1, y0, r1], [f1, y1, r1], [f0, y1, r1], [[U(f0), U(y0)], [U(f1), U(y0)], [U(f1), U(y1)], [U(f0), U(y1)]], shade.rp);
      if (!skip.rn) this.quad([f1, y0, r0], [f0, y0, r0], [f0, y1, r0], [f1, y1, r0], [[U(-f1), U(y0)], [U(-f0), U(y0)], [U(-f0), U(y1)], [U(-f1), U(y1)]], shade.rn);
    }
    build(shadeFn) {
      if (shadeFn) for (let i = 0; i < this.c.length; i += 3) { const k = shadeFn(this.p[i], this.p[i + 1], this.p[i + 2]); this.c[i] *= k; this.c[i + 1] *= k; this.c[i + 2] *= k; }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
      g.setIndex(this.i);
      g.computeBoundingSphere();
      return g;
    }
  }

  // ===========================================================================
  // XÁC XE TÀN TÍCH: hàng việc + bể dùng lại giữa các bản đồ trong phiên chơi
  // ===========================================================================
  // Chạy hết một hàng việc (việc trả false = gọi lại)
  function drainJobs(J) {
    while (J.length) { const f = J.shift(); if (f() === false) J.unshift(f); }
  }
  // Thế đặt thân xác: bám theo mặt dốc tại (P.x, P.z), quay theo P.angle
  function wreckBase(P, G, UP) {
    const gy = G(P.x, P.z), e = 10;
    const n = new THREE.Vector3(-(G(P.x + e, P.z) - G(P.x - e, P.z)) / (2 * e), 1, -(G(P.x, P.z + e) - G(P.x, P.z - e)) / (2 * e)).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(UP, n).multiply(new THREE.Quaternion().setFromAxisAngle(UP, P.angle));
    return new THREE.Matrix4().compose(new THREE.Vector3(P.x, gy - 0.2, P.z), q, new THREE.Vector3(1, 1, 1));
  }
  // Tháp bị thổi bay: nằm lật nghiêng trên đất cạnh thân (T = P.turret do map_gen chọn)
  function placeLooseTurret(tg, T, G) {
    tg.position.set(T.x, 0, T.z);
    tg.rotation.set(T.flip ? Math.PI * 0.88 : 0.22 * T.roll, T.yaw, T.flip ? 0.25 * T.roll : 0.5 * T.roll);
    tg.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(tg);
    if (!box.isEmpty()) tg.position.y += G(T.x, T.z) - box.min.y - 0.9;
  }
  // Mỗi xác tốn ~0,5 s dựng (mô hình + giả lập lựu pháo, đo 2026-10-28: 14 xác URBAN 7-13 s). Xác chưa bị bắn trong trận
  // giữ lại khi đổi bản đồ; bản đồ sau cần xác cùng loại xe / phe / kiểu bị hạ / còn-mất tháp thì đặt lại chỗ mới.
  // Hình dạng hư hại vốn không tất định giữa các máy (randomSurfaceHit dùng Math.random) nên dùng lại không làm lệch gì;
  // vật cản (boulders) vẫn theo P của bản đồ mới
  const WRECK_POOL = [];
  const WRECK_POOL_MAX = 28;
  const wreckKey = P => P.type + '|' + P.team + '|' + P.kill + '|' + (P.turret ? 1 : 0);
  function takePooledWreck(P) {
    const k = wreckKey(P), i = WRECK_POOL.findIndex(E => E.key === k);
    return i < 0 ? null : WRECK_POOL.splice(i, 1)[0];
  }
  function putPooledWreck(P, E) {
    E.key = wreckKey(P);
    WRECK_POOL.push(E);
    while (WRECK_POOL.length > WRECK_POOL_MAX) {
      const old = WRECK_POOL.shift();
      for (const root of [old.u.group, old.turret]) if (root) root.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) [].concat(o.material).forEach(m => m && m.dispose());
      });
    }
  }

  // ===========================================================================
  // TẬP HỢP CỨ ĐIỂM TRÊN BẢN ĐỒ
  // ===========================================================================
  class StrongholdSet {
    /**
     * @param parent  Group cha (nhóm địa hình)
     * @param list    [{ id:'A', x, z, angle, G }]  angle: hướng trục f trong mặt phẳng (cos -> x, sin -> z)
     * @param opts    { mapType, groundAt(x,z) }
     */
    constructor(parent, list, opts = {}) {
      this.group = new THREE.Group();
      this.group.name = 'strongholds';
      parent.add(this.group);
      // hố đạn trên bê tông (bản đồ mới: xoá hết)
      this.holes = [];
      HOLE_U.uHoleCount.value = 0;
      CUT_U.uCutCount.value = 0;
      FLOOD_L.value = -999;
      this.craterGroup = new THREE.Group();
      this.craterGroup.name = 'stronghold_craters';
      this.group.add(this.craterGroup);
      this.craterMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97, metalness: 0, flatShading: true, side: THREE.DoubleSide });
      this.rebarMat = new THREE.MeshStandardMaterial({ color: 0x4a2a17, roughness: 0.8, metalness: 0.45 });
      this.mapType = opts.mapType || 'HIGHLAND';
      // Màu ụ đất theo địa hình: dùng chung shader mặt đất (opts.groundMaterial) nếu có, không thì bảng màu EARTH
      this.groundMaterial = typeof opts.groundMaterial === 'function' ? opts.groundMaterial : null;
      this.worldSize = opts.worldSize || null;
      this.leafColors = opts.leafColors || null;
      // mặt đất địa hình (sân phễu bê tông bám theo) & hướng nắng nằm ngang (mặt khuất nắng ẩm, rêu nhiều hơn)
      this.groundAt = typeof opts.groundAt === 'function' ? opts.groundAt : null;
      this.boulders = opts.boulders || null;   // danh sách vật cản của địa hình: xác xe tàn tích chắn xe & đạn
      const sun = opts.sun;
      this.shadeDir = sun && isFinite(sun.azimuth) ? [Math.sin(sun.azimuth), Math.cos(sun.azimuth)] : [0.6, 0.8];
      this.deferWrecks = !!opts.deferWrecks;
      this.items = list.map(s => this.buildOne(s));
    }

    // Vật liệu đất giống mặt đất địa hình (null = không có -> dùng texture đất cỏ + bảng màu EARTH)
    groundMat(vertexColors) {
      if (!this.groundMaterial || !this.worldSize) return null;
      return this.groundMaterial({ vertexColors }) || null;
    }
    // uv theo tọa độ bản đồ (khớp lưới địa hình: ảnh màu nền phủ cả bản đồ)
    mapUV(x, z) { return [0.5 + x / this.worldSize[0], 0.5 - z / this.worldSize[1]]; }

    // ---------------------------------------------------------------- tra cứu
    local(K, x, z) {
      const dx = x - K.x, dz = z - K.z;
      return { f: dx * K.fx + dz * K.fz, r: dx * K.rx + dz * K.rz };
    }
    toWorld(K, f, r) { return { x: K.x + K.fx * f + K.rx * r, z: K.z + K.fz * f + K.rz * r }; }
    near(x, z, pad = 0) {
      for (const K of this.items) if (Math.abs(x - K.x) < S.REACH + pad && Math.abs(z - K.z) < S.REACH + pad) return K;
      return null;
    }

    // Độ cao cao nhất của mọi phần cứ điểm (ụ đất, mái, gờ, tường cánh) — chặn trên cho mô phỏng đường đạn
    maxTop() {
      let top = -Infinity;
      for (const K of this.items) top = Math.max(top, K.G + S.TOP + 6);
      return top;
    }

    // Mặt "đất" để đạn / hiệu ứng chạm: sàn kênh xe chạy hoặc đỉnh ụ đất (null = địa hình thường)
    surfaceAt(x, z) {
      for (const K of this.items) {
        if (Math.abs(x - K.x) > S.REACH || Math.abs(z - K.z) > S.REACH) continue;
        const L = this.local(K, x, z), af = Math.abs(L.f), ar = Math.abs(L.r);
        const sl = K.nWing ? this.slumpAt(K, L.f, L.r) : null;
        if (sl !== null) return K.G + sl;
        if (af <= S.END && inCut(af, ar)) return K.G + floorY(af);
        const h = moundH(L.f, L.r);
        if (h !== null && h > 0) return K.G + h;
      }
      return null;
    }

    // Mặt đất cho bánh xích / bánh xe: trong kênh (kể cả dải tường) = sàn; trên ụ đất / nắp hầm = mặt đất đắp
    // (xe leo được ụ theo khả năng leo dốc của từng loại xe — xem spg.js climbMax)
    // refY: độ cao hiện tại của xe — xe đang ở trên ụ / nắp hầm thì mặt mái phủ đất (phía trên khoang) là đất leo được
    vehicleFloorAt(x, z, refY) {
      for (const K of this.items) {
        if (Math.abs(x - K.x) > S.REACH || Math.abs(z - K.z) > S.REACH) continue;
        const L = this.local(K, x, z), af = Math.abs(L.f), ar = Math.abs(L.r);
        const h = moundH(L.f, L.r);
        // dốc đất sụt chỗ tường cánh vỡ: bánh xe đi theo mặt dốc (leo được hay không do giới hạn leo dốc của xe)
        const sl = K.nWing ? this.slumpAt(K, L.f, L.r) : null;
        if (sl !== null) return K.G + sl;
        const onTop = refY !== undefined && refY - K.G > 8;
        // đậu trên nóc đúng chỗ mái sập: rơi xuống lòng hầm
        if (onTop && K.nDown && this.cutAt(K, L.f, L.r)) return K.G + floorY(af);
        // Trên nóc mái: theo đúng mặt nhìn thấy — nắp hầm bê tông nhô trên lớp đất phủ, gờ mặt tiền ở 2 đầu (trước đây lấy
        // mặt đất phủ -> xe lún nửa bánh vào nắp hầm, chúi mũi vào gờ mặt tiền)
        if (onTop && af <= S.HB + 0.5 && ar <= S.WO + 2) { const rt = roofTopY(af, ar); return K.G + (rt > -1e6 ? rt : floorY(af)); }
        // Trên ụ: mọi điểm ngoài kênh hở (kể cả phần mái che phía trên khoang) là mặt đất đắp
        if (onTop && h !== null && !(inCut(af, ar) && af > S.HB)) return K.G + Math.max(0, h);
        if (af <= S.END + 6 && ar < cutHalf(af) + S.WING_T + 26) {
          // dải lề ngoài mặt trong tường cánh chỉ tính là sàn kênh cho xe đang ở dưới kênh (bánh xích quệt sát tường);
          // xe đi bên ngoài tường cánh (trên ụ / nền cao hơn sàn) thì theo mặt đất thật — trước đây bị hạ xuống sàn kênh,
          // xe chúi mũi lún xuống đất cạnh tường cánh
          if (ar >= cutHalf(af) && h !== null && refY !== undefined && refY - K.G > floorY(af) + 1.5) return K.G + Math.max(0, h);
          return K.G + floorY(af);
        }
        if (h !== null) return K.G + Math.max(0, h);
      }
      return null;
    }
    // Thông tin mặt đường khi xe chạy trong cứ điểm
    surfaceInfo(x, z) {
      for (const K of this.items) {
        if (Math.abs(x - K.x) > S.REACH || Math.abs(z - K.z) > S.REACH) continue;
        const L = this.local(K, x, z), af = Math.abs(L.f), ar = Math.abs(L.r);
        if (af <= S.END && inCut(af, ar)) {
          const inside = af <= S.HB;
          return { K, inside, name: inside ? `KHOANG CỨ ĐIỂM ${K.id} (MÁI BÊ TÔNG CHE)` : `DỐC BÊ TÔNG CỨ ĐIỂM ${K.id}` };
        }
      }
      // sân phễu bê tông trước cửa hầm (mặt đất thường, chỉ đổi loại mặt đường: ít bụi, ít xóc)
      for (const K of this.items) {
        const L = this.local(K, x, z), af = Math.abs(L.f), ar = Math.abs(L.r);
        if (af > PORTAL.NECK_F + 4 || ar > PORTAL.HW0 + 4) continue;
        if (onApron(af, ar)) return { K, inside: false, name: `SÂN BÊ TÔNG TRƯỚC CỬA HẦM ${K.id}` };
      }
      return null;
    }
    // Không đào hố bom trên ụ đất / sàn bê tông
    covers(x, z, pad = 0) {
      for (const K of this.items) {
        if (Math.abs(x - K.x) > S.REACH + pad || Math.abs(z - K.z) > S.REACH + pad) continue;
        const L = this.local(K, x, z), af = Math.abs(L.f), ar = Math.abs(L.r);
        if ((af <= S.END + pad && inCut(af, ar)) || coreDist(af, ar) < S.RUN + pad) return K;
      }
      // sân phễu bê tông: không cỏ mọc xuyên, không hố bom (ngoài tầm REACH theo trục)
      for (const K of this.items) {
        const L = this.local(K, x, z), af = Math.abs(L.f), ar = Math.abs(L.r);
        if (af > PORTAL.NECK_F + pad + 4 || ar > PORTAL.HW0 + pad + 4) continue;
        if (onApron(af, ar, pad)) return K;
      }
      return null;
    }

    // TRỜI MƯA: lòng hầm (sàn hạ thấp D, chỗ trũng nhất của kênh xe chạy — nước mưa từ 2 dốc chảy dồn vào) ngập nước
    // sâu `depth` đơn vị; mặt nước trải tới chỗ dốc nhô lên khỏi mặt nước, mép nước mờ dần theo độ sâu (Weather.floodMaterial)
    setFlood(depth, mat) {
      if (!(depth > 0) || !mat) return;
      const L = -S.D + Math.min(depth, S.D - 1);
      let fW = S.HB;
      while (fW < S.RAMP_END && floorY(fW) < L + 0.4) fW += 1;
      const rW = cutHalf(fW) + 2;
      const NF = 40, NR = 6;
      const pos = [], nrm = [], aS = [], idx = [];
      for (let j = 0; j <= NR; j++) for (let i = 0; i <= NF; i++) {
        const f = -fW + 2 * fW * i / NF, r = -rW + 2 * rW * j / NR;
        pos.push(f, L, r); nrm.push(0, 1, 0); aS.push(floorY(Math.abs(f)));
      }
      for (let j = 0; j < NR; j++) for (let i = 0; i < NF; i++) {
        const a = j * (NF + 1) + i, b = a + 1, c = a + NF + 1, d = c + 1;
        idx.push(a, b, c, b, d, c);
      }
      mat.userData.lvl.value.set(L, L);
      mat.userData.fill.value = 1;
      FLOOD_L.value = L;
      for (const K of this.items) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
        // độ cao đáy (thế giới) dưới từng đỉnh: mép nước trên dốc mờ dần, không lộ đường cắt thẳng
        geo.setAttribute('aS', new THREE.Float32BufferAttribute(aS.map(y => y + K.G), 1));
        geo.setIndex(idx);
        geo.computeBoundingSphere();
        const m = new THREE.Mesh(geo, mat);
        m.name = 'stronghold_flood';
        m.renderOrder = 3;
        m.receiveShadow = true;
        K.group.add(m);
        K.flood = { L, fW, mesh: m };
      }
    }
    // Mặt nước ngập lòng hầm tại (x, z) (null = không ngập / sàn cao hơn mặt nước)
    floodAt(x, z) {
      for (const K of this.items) {
        const F = K.flood;
        if (!F || Math.abs(x - K.x) > S.REACH || Math.abs(z - K.z) > S.REACH) continue;
        const Lc = this.local(K, x, z), af = Math.abs(Lc.f), ar = Math.abs(Lc.r);
        if (af < F.fW && inCut(af, ar) && floorY(af) < F.L - 0.2) return K.G + F.L;
      }
      return null;
    }

    // Điểm (x, y, z) nằm trong bê tông? (mái, tường bên, tường cánh). m: lề an toàn (kiểm tra nòng pháo)
    // Trả về { K, normal } hoặc null. Phần đất đắp do surfaceAt + kiểm tra chạm đất lo.
    concreteAt(x, y, z, m = 0) {
      for (const K of this.items) {
        if (Math.abs(x - K.x) > S.REACH || Math.abs(z - K.z) > S.REACH) continue;
        const L = this.local(K, x, z), af = Math.abs(L.f), ar = Math.abs(L.r), yy = y - K.G;
        if (yy > S.TOP + 1 || yy < -S.D - 4) continue;
        if (af <= S.HB + m) {
          if (ar > S.WO + 2) continue;
          // mái + dầm trần
          let ceil = S.CEIL - m;
          if (ar < S.WI) for (const bf of S.BEAMS_F) if (Math.abs(L.f - bf) < 3 + m) ceil = S.CEIL - S.BEAM - m;
          // vát nách góc trần - tường
          if (ar > S.WI - S.HAUNCH - m) ceil = Math.min(ceil, S.CEIL - S.HAUNCH + (S.WI - ar) - m);
          // vát chéo miệng hầm: đáy mái nâng dần ra tới mặt tiền
          const inCh = ar < S.CH_R + m && af > S.HB - S.CH - m;
          if (inCh) ceil = Math.max(ceil, chamY(af) - m);
          if (yy >= ceil) {
            if (K.nDown && this.cutAt(K, L.f, L.r)) continue;   // ô mái đã sập: trống
            // trúng mặt vát: pháp tuyến chếch xuống & ra ngoài
            if (inCh && yy < chamY(af) + 3) {
              const l = Math.hypot(S.CHK, 1), h = this.dirN(K, Math.sign(L.f), 0);
              return { K, normal: { nx: h.nx * S.CHK / l, ny: -1 / l, nz: h.nz * S.CHK / l } };
            }
            return { K, normal: af > S.HB - 3 ? this.dirN(K, Math.sign(L.f), 0) : null };
          }
          // tường bên
          if (ar >= S.WI - m && af <= S.HB) return { K, normal: this.dirN(K, 0, -Math.sign(L.r)) };
          continue;
        }
        if (af > S.END + 2) continue;
        // tường cánh loe
        const ch = cutHalf(af);
        if (ar >= ch - m && ar <= ch + S.WING_T && !(K.nWing && this.wingDownAt(K, L.f, L.r))) {
          // đỉnh tường xiên thẳng, mép trong vát chéo
          const top0 = Math.max(0.5, wingLine(af)) + 1.5;
          const top = top0 - Math.max(0, wingBevel(top0, floorY(af) - 2) - (ar - ch));
          if (yy <= top + m && yy >= floorY(af) - 3) {
            const sf = Math.sign(L.f), sr = Math.sign(L.r);
            const nl = Math.hypot(S.SPLAY, 1);
            return { K, normal: this.dirN(K, sf * S.SPLAY / nl, -sr / nl) };
          }
        }
      }
      return null;
    }
    dirN(K, nf, nr) { const nx = K.fx * nf + K.rx * nr, nz = K.fz * nf + K.rz * nr, l = Math.hypot(nx, nz) || 1; return { nx: nx / l, nz: nz / l }; }

    // Chất rắn bất kỳ (bê tông hoặc đất đắp / sàn) — dùng cho nòng pháo và quét đường đạn
    solidAt(x, y, z, m = 0) {
      const c = this.concreteAt(x, y, z, m);
      if (c) return { type: 'WALL', K: c.K, normal: c.normal };
      const s = this.surfaceAt(x, z);
      if (s !== null && y < s + m) return { type: 'GROUND' };
      return null;
    }

    // Quét đoạn bay của đạn (bước 2 đơn vị) -> điểm chạm đầu tiên vào cứ điểm
    segmentHit(x0, y0, z0, x1, y1, z1) {
      const mx = Math.min(x0, x1), Mx = Math.max(x0, x1), mz = Math.min(z0, z1), Mz = Math.max(z0, z1);
      let any = false;
      for (const K of this.items) if (Mx > K.x - S.REACH && mx < K.x + S.REACH && Mz > K.z - S.REACH && mz < K.z + S.REACH) { any = true; break; }
      if (!any) return null;
      const len = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
      const n = Math.max(1, Math.ceil(len / 2));
      const P = t => [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, z0 + (z1 - z0) * t];
      const solid = (q) => { if (this.concreteAt(q[0], q[1], q[2])) return true; const sf = this.surfaceAt(q[0], q[2]); return sf !== null && q[1] < sf; };
      for (let i = 1; i <= n; i++) {
        if (!solid(P(i / n))) continue;
        // Tinh chỉnh điểm chạm sát bề mặt (vết đạn / vết cháy nằm đúng trên mặt bê tông)
        let lo = (i - 1) / n, hi = i / n;
        for (let k = 0; k < 7; k++) { const m = (lo + hi) / 2; if (solid(P(m))) hi = m; else lo = m; }
        const tIn = Math.min(i / n, hi + 0.25 / Math.max(1, len));
        const [x, y, z] = P(tIn);
        const c = this.concreteAt(x, y, z);
        if (c) {
          // điểm dò lấn 0,25 đơn vị vào trong khối để đọc đúng mặt -> trả về điểm ngay mặt ngoài (nhích ra theo pháp tuyến),
          // không thì vết đạn / rỗ / muội nằm chìm sau mặt bê tông nhìn thấy (bắn vào cứ điểm như không để lại gì)
          const [sx, sy, sz] = P(lo), nn = c.normal;
          const o = nn ? 0.15 : 0;
          return { x: sx + (nn ? nn.nx * o : 0), y: sy + (nn && nn.ny ? nn.ny * o : 0), z: sz + (nn ? nn.nz * o : 0), type: 'WALL', normal: c.normal, K: c.K };
        }
        const sf = this.surfaceAt(x, z);
        return { x, y: sf !== null ? Math.max(y, sf - 0.2) : y, z, type: 'GROUND' };
      }
      return null;
    }

    // ---------------------------------------------------------------- sập mái
    // Ô mái chứa điểm (f, r) cục bộ đã sập chưa (dầm ranh giới 2 nhịp còn đứng khi nhịp bên kia chưa sập)
    cutAt(K, f, r) {
      if (!K.nDown || Math.abs(f) > S.HB + 2) return false;
      const j = r < PANEL_R[0] || r > PANEL_R[3] ? -1 : r < PANEL_R[1] ? 0 : r <= PANEL_R[2] ? 1 : 2;
      if (j < 0) return false;
      const i = Math.min(5, Math.max(0, Math.floor((f - PANEL_F[0]) / 32)));
      if (!K.panels[i * 3 + j].down) return false;
      for (const bf of S.BEAMS_F) {
        if (Math.abs(f - bf) >= 3.5) continue;
        const i2 = f < bf ? i + 1 : i - 1;
        if (i2 >= 0 && i2 <= 5 && !K.panels[i2 * 3 + j].down) return false;
      }
      return true;
    }
    cutAtWorld(x, y, z) {
      for (const K of this.items) {
        if (!K.nDown || Math.abs(x - K.x) > S.REACH || Math.abs(z - K.z) > S.REACH) continue;
        const yy = y - K.G;
        if (yy < S.CEIL - 3 || yy > S.TOP + 3) continue;
        const L = this.local(K, x, z);
        if (this.cutAt(K, L.f, L.r)) return K;
      }
      return null;
    }
    initWings(K) {
      K.wings = []; K.nWing = 0;
      const L = S.RUN / WING_SEG, ks = (K.id.charCodeAt(0) || 65) * 0.517;
      for (const sf of [-1, 1]) for (const sr of [-1, 1]) for (let s = 0; s < WING_SEG; s++) {
        K.wings.push({ sf, sr, s, a0: S.HB + s * L, a1: S.HB + (s + 1) * L, hp: WING_HP[s], max: WING_HP[s], down: false, seed: ks + K.wings.length * 1.91 });
      }
    }
    // đoạn tường cánh chứa điểm cục bộ (f, r) (null nếu ngoài phạm vi tường cánh)
    wingAt(K, f, r) {
      const af = Math.abs(f);
      if (!K.wings || af <= S.HB || af > S.END) return null;
      const s = Math.min(WING_SEG - 1, Math.floor((af - S.HB) / (S.RUN / WING_SEG)));
      return K.wings[((f < 0 ? 0 : 1) * 2 + (r < 0 ? 0 : 1)) * WING_SEG + s];
    }
    wingDownAt(K, f, r) { if (!K.nWing) return false; const w = this.wingAt(K, f, r); return !!(w && w.down); }
    // Dốc đất sụt chỗ đoạn tường cánh đã vỡ (cao độ cục bộ so với cốt nền), null nếu không phải chỗ đó: từ sàn kênh cách mép
    // tường SLUMP_IN lên tới đỉnh tường cũ ở mặt ngoài tường (đất ụ phía sau đổ xuống)
    slumpAt(K, f, r) {
      if (!K.nWing) return null;
      const af = Math.abs(f), ar = Math.abs(r);
      if (af <= S.HB || af > S.END) return null;
      const ch = cutHalf(af);
      if (ar < ch - SLUMP_IN || ar > ch + S.WING_T + 1) return null;
      if (!this.wingDownAt(K, f, r)) return null;
      const fl = floorY(af), top = Math.max(fl + 1, Math.max(0.5, wingLine(af)) + 1.5);
      const t = clamp01((ar - (ch - SLUMP_IN)) / (SLUMP_IN + S.WING_T));
      return fl + (top - fl) * Math.pow(t, 1.3);
    }
    initPanels(K) {
      this.initWings(K);
      K.panels = [];
      K.nDown = 0;
      const ks = (K.id.charCodeAt(0) || 65) * 0.731;
      for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) {
        const max = PANEL_HP[i];
        K.panels.push({ i, j, f0: PANEL_F[i], f1: PANEL_F[i + 1], r0: PANEL_R[j], r1: PANEL_R[j + 1], hp: max, max, down: false, seed: ks + (i * 3 + j) * 1.37 });
      }
    }
    /**
     * Phát trúng / vụ nổ bào mòn ô mái (gọi từ EnvDamage.damageAt trên mọi máy theo gói ENV_HIT). info: { t, nx, nz }.
     * blastR: bán kính sóng nổ của loại đạn. Trả về sự kiện sập [{ type: 'strongholdCollapse', id }]
     */
    damagePanels(x, y, z, ammo, heavy, info, fx, blastR) {
      const base = (PANEL_DMG[ammo] || 0) * (heavy ? 2.1 : 1);   // lựu pháo 155: x2,1 (cùng hệ số mọi bảng phá cảnh vật)
      const events = [];
      if (!base) return events;
      for (const K of this.items) {
        if (Math.abs(x - K.x) > S.REACH || Math.abs(z - K.z) > S.REACH) continue;
        const L = this.local(K, x, z), yy = y - K.G, af = Math.abs(L.f), ar = Math.abs(L.r);
        let direct = null, dk = 1;
        // trúng thẳng: mặt tiền / trần / nóc mái (bắn vào mặt trong tường bên thì không tính vào mái)
        const nr = info && (info.nx || info.nz) ? Math.abs(info.nx * K.rx + info.nz * K.rz) : 0;
        if (yy >= S.CEIL - S.BEAM - 1 && yy <= S.TOP + 6 && af <= S.HB + 3 && ar <= S.WO + 2 && nr < 0.7) {
          const rc = Math.max(PANEL_R[0] + 0.1, Math.min(PANEL_R[3] - 0.1, L.r));
          if (ar > PANEL_R[3]) dk = 0.5;   // phần mái gác trên tường bên: chỉ rung ô ngoài cùng
          const i = Math.min(5, Math.max(0, Math.floor((Math.max(-S.HB, Math.min(S.HB - 0.01, L.f)) - PANEL_F[0]) / 32)));
          const j = rc < PANEL_R[1] ? 0 : rc <= PANEL_R[2] ? 1 : 2;
          direct = K.panels[i * 3 + j];
          // nổ trên nóc: lớp đất phủ dày 1 m đỡ bớt
          // (đạn nổ: đất tơi hấp thụ một phần sóng nổ; đạn xuyên / nổ lõm: lớp đất 1 m làm tán luồng phụt, mất phần lớn sức)
          if (yy > S.CEIL + S.ROOF && af < S.HB - S.LIP_T) dk *= ammo === 'NORMAL' || ammo === 'HE' || ammo === 'CLUSTER' ? 0.6 : 0.35;
        }
        const R = Math.max(0, blastR || 0) * 1.3;
        for (const p of K.panels) {
          if (p.down) continue;
          let d = 0;
          if (p === direct) d = base * dk;
          else if (R > 0) {
            const fc = (p.f0 + p.f1) / 2, rc = (p.r0 + p.r1) / 2;
            const dxy = Math.hypot(Math.max(0, Math.abs(L.f - fc) - 16), Math.max(0, Math.abs(L.r - rc) - (p.r1 - p.r0) / 2));
            const dy = yy < S.CEIL ? S.CEIL - yy : yy > S.CREST ? yy - S.CREST : 0;
            const dd = Math.hypot(dxy, dy);
            if (dd < R) d = base * 0.22 * (1 - dd / R);
          }
          if (d <= 0) continue;
          p.hp -= d;
          if (p.hp <= 0) { this.collapsePanel(K, p, fx, false); events.push({ type: 'strongholdCollapse', id: K.id, K, p }); }
        }
        // TƯỜNG CÁNH: trúng thẳng mặt tường (phía kênh) ăn đủ, nổ gần ăn theo khoảng cách; nổ trên ụ đất phía sau tường chỉ
        // dội qua lớp đất (x0,3)
        const R2 = Math.max(0, blastR || 0) * 1.3;
        for (const w of K.wings || []) {
          if (w.down) continue;
          const sgn = Math.sign(L.f) === w.sf && Math.sign(L.r) === w.sr;
          let d = 0;
          const fa = Math.max(w.a0, Math.min(w.a1, af)), ch = cutHalf(fa);
          const dF = af < w.a0 ? w.a0 - af : af > w.a1 ? af - w.a1 : 0;
          const dR = ar < ch ? ch - ar : ar > ch + S.WING_T ? ar - ch - S.WING_T : 0;
          const top = Math.max(0.5, wingLine(fa)) + 1.5, fl = floorY(fa);
          const dY = yy > top ? yy - top : yy < fl ? fl - yy : 0;
          const dd = sgn ? Math.hypot(dF, dR, dY) : Infinity;
          if (dd < 3 && info && info.t === 'WALL') d = base;
          else if (R2 > 0 && dd < R2) d = base * 0.22 * (1 - dd / R2) * (ar > ch + S.WING_T ? 0.3 : 1);
          if (d <= 0) continue;
          w.hp -= d;
          if (w.hp <= 0) { this.collapseWing(K, w, fx, false); events.push({ type: 'strongholdWall', id: K.id }); }
        }
      }
      return events;
    }
    // Đoạn tường cánh vỡ toác: bỏ hình đoạn tường (vùng sập trong shader), đất ụ sụt thành dốc tràn vào kênh, bê tông vỡ +
    // cốt thép nằm ngổn ngang dưới chân, bụi mù. silent: áp trạng thái từ mạng (không bụi / tiếng)
    collapseWing(K, w, fx, silent) {
      if (w.down) return;
      w.down = true; w.hp = 0;
      K.nWing = (K.nWing || 0) + 1;
      this.syncCuts();
      // hố đạn trên đoạn tường vừa mất: bỏ
      const keep = [];
      for (const h of this.holes) {
        const Lh = this.local(K, h.p.x, h.p.z);
        if (this.wingAt(K, Lh.f, Lh.r) === w && Math.abs(Lh.r) > cutHalf(Math.abs(Lh.f)) - 3) { if (h.mesh) { this.craterGroup.remove(h.mesh); this.disposeCrater(h); } } else keep.push(h);
      }
      if (keep.length !== this.holes.length) { this.holes = keep; this.syncHoles(); }
      this.buildSlump(K, w);
      // gạch đá bê tông dưới chân đoạn tường (phía kênh)
      const am = (w.a0 + w.a1) / 2, rc = w.sr * (cutHalf(am) - 7);
      this.addRubble(K, { f0: w.sf * w.a0, f1: w.sf * w.a1, r0: rc - 6, r1: rc + 6, seed: w.seed });
      if (silent) return;
      const wp = this.toWorld(K, w.sf * am, w.sr * (cutHalf(am) + S.WING_T / 2)), yC = K.G + Math.max(2, wingLine(am) * 0.6);
      const rnd = (a, b) => a + Math.random() * (b - a);
      if (fx && fx.smoke) for (let k = 0; k < 26; k++) {
        const v = rnd(0.85, 1.05);
        fx.smoke.add({ x: wp.x + rnd(-16, 16), y: yC + rnd(-4, 14), z: wp.z + rnd(-16, 16), vx: rnd(-14, 14), vy: rnd(6, 26), vz: rnd(-14, 14),
          size: rnd(20, 34), grow: rnd(6, 10), drag: 0.6, grav: -0.6, life: rnd(10, 18), alpha: 0.7, fadeIn: 0.2, c0: [0.7 * v, 0.66 * v, 0.6 * v], cell: 2, delay: rnd(0, 0.4) });
      }
      if (fx && fx.hardRocks) for (let k = 0; k < 16; k++) {
        const a = Math.random() * 6.283, sp = rnd(10, 40);
        fx.hardRocks.add({ x: wp.x + rnd(-10, 10), y: yC + rnd(0, 10), z: wp.z + rnd(-10, 10), vx: Math.cos(a) * sp, vy: rnd(10, 35), vz: Math.sin(a) * sp, size: rnd(1.5, 4), life: rnd(3, 6), c: [0.5, 0.49, 0.46] });
      }
      if (typeof window !== 'undefined' && window.soundEngine && window.soundEngine.secondaryAt) window.soundEngine.secondaryAt('collapse', { x: wp.x, y: yC, z: wp.z }, 1.1, { mat: 'concrete', h: 30, floors: 1 });
    }
    // Dốc đất sụt (cùng hình với slumpAt): lưới dải dọc đoạn tường, mặt đất ụ màu đất đắp, gồ ghề nhẹ
    buildSlump(K, w) {
      const E = EARTH[this.mapType] || EARTH.HIGHLAND, NF = 8, NR = 6;
      const pos = [], col = [], idx = [];
      for (let i = 0; i <= NF; i++) {
        const af = w.a0 + (w.a1 - w.a0) * i / NF, ch = cutHalf(af);
        for (let j = 0; j <= NR; j++) {
          const ar = ch - SLUMP_IN + (SLUMP_IN + S.WING_T + 1) * j / NR;
          const h = this.slumpAt(K, w.sf * af, w.sr * ar);
          const n = (Math.sin(af * 0.37 + ar * 0.21 + w.seed) + Math.sin(af * 0.13 - ar * 0.41)) * 0.6 * (j > 0 && j < NR ? 1 : 0);
          const p = this.toWorld(K, w.sf * af, w.sr * ar);
          pos.push(p.x, K.G + (h !== null ? h : floorY(af)) + n, p.z);
          const k = 0.62 + 0.12 * Math.sin(af * 0.7 + ar);
          col.push(E.dirt[0] / 255 * k, E.dirt[1] / 255 * k, E.dirt[2] / 255 * k);
        }
      }
      for (let i = 0; i < NF; i++) for (let j = 0; j < NR; j++) {
        const a = i * (NR + 1) + j, b = a + NR + 1;
        if (w.sf * w.sr > 0) idx.push(a, b, a + 1, a + 1, b, b + 1); else idx.push(a, a + 1, b, a + 1, b + 1, b);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, this._slumpMat || (this._slumpMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, side: THREE.DoubleSide })));
      m.castShadow = true; m.receiveShadow = true;
      m.name = 'stronghold_slump';
      this.group.add(m);
      w.slumpMesh = m;
    }
    // Ô mái sập: va chạm / che chắn đổi ngay (cutAt), cập nhật vùng bỏ điểm ảnh, mép gãy, đống đổ nát, hố đạn trong vùng sập
    collapsePanel(K, p, fx, silent) {
      if (p.down) return;
      p.down = true; p.hp = 0;
      K.nDown++;
      this.syncCuts();
      // hố đạn khoét trên phần mái vừa sập: bỏ
      const keep = [];
      for (const h of this.holes) {
        if (this.cutAtWorld(h.p.x, h.p.y, h.p.z)) { if (h.mesh) { this.craterGroup.remove(h.mesh); this.disposeCrater(h); } } else keep.push(h);
      }
      if (keep.length !== this.holes.length) { this.holes = keep; this.syncHoles(); }
      // đèn trần trong nhịp sập rơi theo
      for (const m of K.lampMeshes || []) if (m.visible && this.cutAt(K, m.position.x, m.position.z)) m.visible = false;
      this.buildFractures(K);
      this.addRubble(K, p);
      if (silent) return;
      const fc = (p.f0 + p.f1) / 2, rc = (p.r0 + p.r1) / 2, w = this.toWorld(K, fc, rc), yC = K.G + S.CEIL;
      const rnd = (a, b) => a + Math.random() * (b - a);
      if (fx && fx.smoke) {
        // bụi bê tông cuộn ra 2 miệng hầm & phụt lên qua lỗ sập
        for (let k = 0; k < 34; k++) {
          const up = k < 16, v = rnd(0.85, 1.05);
          const px = w.x + K.fx * rnd(-16, 16) + K.rx * rnd(-20, 20), pz = w.z + K.fz * rnd(-16, 16) + K.rz * rnd(-20, 20);
          fx.smoke.add({ x: px, y: up ? yC + rnd(0, 30) : K.G - S.D + rnd(2, 10), z: pz,
            vx: up ? rnd(-6, 6) : K.fx * rnd(-40, 40), vy: up ? rnd(14, 34) : rnd(1, 6), vz: up ? rnd(-6, 6) : K.fz * rnd(-40, 40),
            size: rnd(26, 44), grow: rnd(6, 10), drag: 0.6, grav: -0.6, life: rnd(12, 22), alpha: 0.72, fadeIn: 0.2,
            c0: [0.7 * v, 0.68 * v, 0.64 * v], cell: 2, delay: rnd(0, 0.5) });
        }
      }
      if (fx && fx.hardRocks) {
        for (let k = 0; k < 18; k++) {
          const a = Math.random() * 6.283, sp = rnd(10, 40);
          fx.hardRocks.add({ x: w.x + rnd(-14, 14), y: yC + rnd(2, 20), z: w.z + rnd(-14, 14), vx: Math.cos(a) * sp, vy: rnd(10, 40), vz: Math.sin(a) * sp, size: rnd(1.5, 4), life: rnd(3, 6), c: [0.5, 0.49, 0.46] });
        }
      }
      if (typeof window !== 'undefined' && window.soundEngine && window.soundEngine.secondaryAt) window.soundEngine.secondaryAt('collapse', { x: w.x, y: yC, z: w.z }, 1.3, { mat: 'concrete', h: 40, floors: 1 });
    }
    // Danh sách vùng sập (mọi cứ điểm) -> uniform shader
    syncCuts() {
      const A = CUT_U.uCutA.value, B = CUT_U.uCutB.value, C = CUT_U.uCutC.value;
      let n = 0;
      for (const K of this.items) for (const p of K.panels || []) {
        if (!p.down || n >= MAX_CUTS) continue;
        const f0 = p.i === 0 ? -S.HB - 1.5 : p.f0, f1 = p.i === 5 ? S.HB + 1.5 : p.f1;
        const fc = (f0 + f1) / 2, rc = (p.r0 + p.r1) / 2, w = this.toWorld(K, fc, rc);
        A[n].set(w.x, w.z, K.G + S.CEIL - 2.2, K.G + S.TOP + 2);
        B[n].set(K.fx, K.fz, K.rx, K.rz);
        C[n].set((f1 - f0) / 2, (p.r1 - p.r0) / 2, p.seed, 0);
        n++;
      }
      // đoạn tường cánh đã vỡ: hộp quay theo hướng tường loe (dọc tường, ngang tường), cao từ dưới sàn tới trên đỉnh tường
      for (const K of this.items) for (const w of K.wings || []) {
        if (!w.down || n >= MAX_CUTS) continue;
        const am = (w.a0 + w.a1) / 2, rm = cutHalf(am) + S.WING_T / 2;
        const c = this.toWorld(K, w.sf * am, w.sr * rm);
        const ln = Math.hypot(1, S.SPLAY), df = w.sf / ln, dr = w.sr * S.SPLAY / ln;   // dọc tường (cục bộ f, r)
        const ux = K.fx * df + K.rx * dr, uz = K.fz * df + K.rz * dr;
        A[n].set(c.x, c.z, K.G + floorY(w.a1) - 4, K.G + Math.max(0.5, wingLine(w.a0)) + 4);
        B[n].set(ux, uz, -uz, ux);
        C[n].set((w.a1 - w.a0) / 2 * ln, S.WING_T / 2 - 1.5, w.seed, 0);
        n++;
      }
      CUT_U.uCutCount.value = n;
    }
    // Mép gãy quanh các ô sập (cạnh giáp ô còn nguyên / phần mái gác trên tường): vách bê tông lởm chởm từ đáy mái lên
    // tới mặt đất phủ (đầu hầm: tới đỉnh gờ mặt tiền), lớp đất phủ màu đất phía trên; cốt thép đứt thõng vào lỗ sập
    buildFractures(K) {
      if (K.fracMesh) { K.group.remove(K.fracMesh); K.fracMesh.geometry.dispose(); K.fracMesh = null; }
      const pos = [], col = [], idx = [];
      const E = EARTH[this.mapType] || EARTH.HIGHLAND, ec = [E.dirt[0] / 255 * 0.8, E.dirt[1] / 255 * 0.8, E.dirt[2] / 255 * 0.8];
      const P = (i, j) => (i < 0 || i > 5 || j < 0 || j > 2) ? null : K.panels[i * 3 + j];
      const quad = (a, b, c, d) => { idx.push(a, b, c, a, c, d); };
      // nhiễu khối 1D dọc cạnh (bước ~3,5 đơn vị) cho từng tầng mặt vỡ
      const hs = (i, l, sd) => { let k = (Math.imul(i, 374761393) + Math.imul(l, 668265263) + Math.floor(sd * 9973)) | 0; k = Math.imul(k ^ (k >>> 13), 1274126177); return ((k ^ (k >>> 16)) >>> 0) / 4294967296; };
      const chunk = (s, l, sd) => { const x = s / 3.5, i = Math.floor(x), t = x - i, u = t * t * (3 - 2 * t); return hs(i, l, sd) * (1 - u) + hs(i + 1, l, sd) * u; };
      const rebar = (x0, y0, z0, x1, y1, z1) => {
        // thanh thép: 2 dải chéo nhau (nhìn từ mọi phía đều thấy), màu gỉ
        const w = 0.13, b = pos.length / 3;
        pos.push(x0, y0 - w, z0, x1, y1 - w, z1, x1, y1 + w, z1, x0, y0 + w, z0);
        const dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz) || 1, ox = -dz / l * w, oz = dx / l * w;
        pos.push(x0 - ox, y0, z0 - oz, x1 - ox, y1, z1 - oz, x1 + ox, y1, z1 + oz, x0 + ox, y0, z0 + oz);
        for (let k = 0; k < 8; k++) col.push(0.3, 0.17, 0.09);
        quad(b, b + 1, b + 2, b + 3); quad(b + 4, b + 5, b + 6, b + 7);
      };
      for (const p of K.panels) {
        if (!p.down) continue;
        const f0 = p.i === 0 ? -S.HB - 1.5 : p.f0, f1 = p.i === 5 ? S.HB + 1.5 : p.f1;
        const fc = (f0 + f1) / 2, rc = (p.r0 + p.r1) / 2, hf = (f1 - f0) / 2, hr = (p.r1 - p.r0) / 2;
        // 4 cạnh: [trục chạy dọc cạnh, dấu, hạt giống, ô kề]
        const sides = [
          { alongR: true, sg: 1, sd: p.seed, nb: p.i === 5 ? 'open' : P(p.i + 1, p.j) },
          { alongR: true, sg: -1, sd: p.seed + 1.3, nb: p.i === 0 ? 'open' : P(p.i - 1, p.j) },
          { alongR: false, sg: 1, sd: p.seed + 2.6, nb: p.j === 2 ? 'wall' : P(p.i, p.j + 1) },
          { alongR: false, sg: -1, sd: p.seed + 3.9, nb: p.j === 0 ? 'wall' : P(p.i, p.j - 1) }
        ];
        let sd = (Math.floor(p.seed * 1e4) * 2654435761) >>> 0;
        const rnd = () => { sd = (Math.imul(sd, 1664525) + 1013904223) >>> 0; return sd / 4294967296; };
        for (const sdx of sides) {
          if (sdx.nb === 'open' || (sdx.nb !== 'wall' && sdx.nb.down)) continue;
          // đầu cạnh: kéo dài lấn vào phần mái còn nguyên (khuất trong khối) để khép góc với cạnh vuông góc
          const half = sdx.alongR ? hr : hf;
          const ext = (s) => { const q = sdx.alongR ? P(p.i, p.j + s) : P(p.i + s, p.j); return q && q !== 'wall' && q.down ? 0 : 5; };
          const s0 = -half - ext(-1), s1 = half + ext(1);
          const n = Math.max(2, Math.ceil((s1 - s0) / 2));
          const cols = [];
          for (let k = 0; k <= n; k++) {
            const s = s0 + (s1 - s0) * k / n;
            const off = (sdx.alongR ? hf : hr) + cutJag(s, sdx.sd);
            const fL = sdx.alongR ? fc + sdx.sg * off : fc + s, rL = sdx.alongR ? rc + s : rc + sdx.sg * off;
            const inLip = Math.abs(fL) > S.HB - S.LIP_T - 0.5;
            const top = inLip ? S.TOP : S.CREST + 0.3, roofTop = S.CEIL + S.ROOF;
            // phần vát miệng hầm: đáy mái nâng theo mặt vát; mặt vát vượt khỏi đỉnh thì cạnh này không còn bê tông
            const cb = Math.abs(rL) < S.CH_R ? chamY(Math.abs(fL)) : S.CEIL;
            if (cb >= top - 1.5) { cols.push(null); continue; }
            const ry = (y) => cb > S.CEIL ? cb + (y - S.CEIL) * (top - cb) / (top - S.CEIL) : y;
            // hướng vào lòng lỗ sập (để làm mặt vỡ lồi lõm)
            const inF = sdx.alongR ? -sdx.sg : 0, inR = sdx.alongR ? 0 : -sdx.sg;
            // mặt vỡ thành từng khối bậc lồi lõm (nhiễu liền mạch theo dọc cạnh, mỗi tầng một kiểu); mép dưới bản mái
            // lởm chởm mảng treo; đất phủ phía trên sụt thành mái dốc lùi vào trong
            const ys = [], outs = [], cs = [];
            const NL = FR_LV.length;
            for (let v = 0; v < NL; v++) {
              const ch = chunk(s, v, sdx.sd);
              let y = S.CEIL + S.ROOF * FR_LV[v], o = (ch - 0.5) * 3.8;
              if (v === 0) { y = S.CEIL - 0.3 - ch * 1.8; o = (ch - 0.5) * 1.5; }
              if (v === NL - 1) { y = inLip ? top - 1.5 - ch * 2.5 : roofTop; o = -1 - ch * 1.6; }
              ys.push(y); outs.push(o); cs.push(0.33 + (ch - 0.5) * 0.14 - (v === 0 ? 0.07 : 0));
            }
            if (!inLip) { ys.push(top); outs.push(-2.4 - chunk(s, 9, sdx.sd) * 2.4); cs.push(-1); }
            const c = [];
            for (let v = 0; v < ys.length; v++) {
              const lf = fL + inF * outs[v], lr = rL + inR * outs[v];
              pos.push(lf, ry(ys[v]), lr);
              const g = cs[v];
              col.push(...(g < 0 ? ec : [g, g * 0.97, g * 0.9]));
              c.push(pos.length / 3 - 1);
            }
            cols.push(c);
            // cốt thép 2 lớp (đáy & đỉnh bản mái) đứt, thõng vào lỗ sập
            if (rnd() < 0.5 && cb <= S.CEIL) {
              for (const yb of [S.CEIL + 0.8, roofTop - 0.8]) {
                if (rnd() < 0.4) continue;
                const len = 1.5 + rnd() * 4, droop = len * (0.25 + rnd() * 0.6);
                rebar(fL, yb, rL, fL + inF * len, yb - droop, rL + inR * len);
              }
            }
          }
          for (let k = 0; k < n; k++) if (cols[k] && cols[k + 1]) for (let v = 0; v < Math.min(cols[k].length, cols[k + 1].length) - 1; v++) quad(cols[k][v], cols[k + 1][v], cols[k + 1][v + 1], cols[k][v + 1]);
        }
      }
      if (!idx.length) return;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, this.craterMat);
      m.castShadow = true; m.receiveShadow = true;
      m.name = 'stronghold_fracture';
      K.group.add(m);
      K.fracMesh = m;
    }
    // Đống đổ nát dưới ô sập: tấm bê tông vỡ nằm nghiêng ngả chồng lên nhau, cục đất phủ rơi theo (thấp, xe vẫn đi qua được)
    addRubble(K, p) {
      if (!this.rubble) {
        const geo = new THREE.BoxGeometry(1, 1, 1, 2, 1, 2), P = geo.attributes.position;
        for (let i = 0; i < P.count; i++) {
          const x = P.getX(i), y = P.getY(i), z = P.getZ(i), h = Math.sin(x * 12.9 + z * 78.2 + y * 37.7) * 43758.5453;
          const j = (h - Math.floor(h) - 0.5) * 0.28;
          P.setXYZ(i, x * (1 + j), y * (1 + j * 0.6), z * (1 - j));
        }
        geo.computeVertexNormals();
        const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0, flatShading: true }), 900);
        im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(900 * 3).fill(1), 3);
        im.count = 0; im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false;
        im.name = 'stronghold_rubble';
        this.group.add(im);
        this.rubble = im;
      }
      const im = this.rubble;
      const E = EARTH[this.mapType] || EARTH.HIGHLAND;
      let sd = (Math.floor(p.seed * 7919) * 2654435761) >>> 0;
      const rnd = () => { sd = (Math.imul(sd, 1664525) + 1013904223) >>> 0; return sd / 4294967296; };
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), v = new THREE.Vector3();
      const fc = (p.f0 + p.f1) / 2, rc = (p.r0 + p.r1) / 2, hf = (p.f1 - p.f0) / 2 - 2, hr = (p.r1 - p.r0) / 2 - 2;
      for (let k = 0; k < 52 && im.count < 900; k++) {
        const earth = k >= 36;
        const u = (rnd() - 0.5) * 2, w = (rnd() - 0.5) * 2;
        const lf = fc + u * hf, lr = rc + w * hr, mid = 1 - Math.max(Math.abs(u), Math.abs(w));
        const fl = floorY(Math.abs(lf));
        const sx = earth ? 2 + rnd() * 4 : 3 + rnd() * 8, sy = earth ? 1 + rnd() * 1.6 : 1 + rnd() * 2.2, sz = earth ? 2 + rnd() * 4 : 3 + rnd() * 7;
        const wpos = this.toWorld(K, lf, lr);
        v.set(wpos.x, K.G + fl + sy * 0.3 + mid * rnd() * 3.5, wpos.z);
        e.set((rnd() - 0.5) * 0.7, rnd() * 6.283, (rnd() - 0.5) * 0.7);
        m.compose(v, q.setFromEuler(e), s.set(sx, sy, sz));
        im.setMatrixAt(im.count, m);
        const g = earth ? null : 0.3 + rnd() * 0.1;
        if (earth) im.instanceColor.setXYZ(im.count, E.dirt[0] / 255 * 0.7, E.dirt[1] / 255 * 0.7, E.dirt[2] / 255 * 0.7);
        else im.instanceColor.setXYZ(im.count, g, g * 0.97, g * 0.9);
        im.count++;
      }
      im.instanceMatrix.needsUpdate = true;
      im.instanceColor.needsUpdate = true;
    }
    // ĐỒNG BỘ (máy vào giữa trận): máu từng ô mái, 0 = đã sập
    stateString() {
      return this.items.map(K => K.id + ':' + (K.panels || []).map(p => Math.max(0, Math.round(p.hp * 10))).join(',')
        + '/' + (K.wings || []).map(w => Math.max(0, Math.round(w.hp * 10))).join(',')).join(';');
    }
    applyState(str, fx) {
      for (const part of String(str || '').split(';')) {
        const [id, both] = part.split(':');
        const K = this.items.find(k => k.id === id);
        if (!K || !both) continue;
        const [list, wl] = both.split('/');
        if (wl && K.wings) wl.split(',').forEach((v, n) => {
          const w = K.wings[n], hp = Number(v) / 10;
          if (!w || v === '' || !isFinite(hp)) return;
          if (hp <= 0) this.collapseWing(K, w, fx, true);
          else w.hp = Math.min(w.hp, hp);
        });
        list.split(',').forEach((v, n) => {
          const p = K.panels[n], hp = Number(v) / 10;
          if (!p || !isFinite(hp)) return;
          if (hp <= 0) this.collapsePanel(K, p, fx, true);
          else p.hp = Math.min(p.hp, hp);
        });
      }
    }

    // ---------------------------------------------------------------- hố đạn trên bê tông
    /**
     * Khoét / đào sâu hố tại điểm trúng (x, y, z: điểm ngay mặt ngoài bê tông, n: pháp tuyến mặt). room: khoảng trống tới
     * mép tường gần nhất (hố không lấn ra ngoài khoảng không). k: hệ số cỡ. Trả về hố.
     */
    addCrater(x, y, z, nx, ny, nz, ammo, heavy, room = Infinity, k = 1) {
      const C = CRATER[ammo];
      if (!C) return null;
      const nl = Math.hypot(nx, ny, nz) || 1;
      const n = new THREE.Vector3(nx / nl, ny / nl, nz / nl);
      const r = C[0] * (heavy ? 1.35 : 1) * k, d = C[1] * (heavy ? 1.4 : 1) * k;
      const maxR = Math.max(0.8, Math.min(15, room * 1.05)), maxD = 7;
      const blast = ammo === 'AP' || C[0] < 1.4 ? 0 : 1;
      const jet = ammo === 'AP' || ammo === 'RPG' || ammo === 'ANTI_TANK_MISSILE';
      const face = new THREE.Vector3(x, y, z).addScaledVector(n, -0.15);
      // hố cũ cùng mặt ở sát bên: dồn vào (rộng & sâu thêm)
      let best = null, bd = Infinity;
      for (const h of this.holes) {
        if (h.n.dot(n) < 0.85) continue;
        const q = face.clone().sub(h.p);
        if (Math.abs(q.dot(h.n)) > 1.5) continue;
        q.addScaledVector(h.n, -q.dot(h.n));
        const dd = q.length();
        if (dd < h.R * 0.8 + r * 0.5 && dd < bd) { best = h; bd = dd; }
      }
      if (best) {
        const h = best, w = (r * r) / (h.R * h.R + r * r) * 0.5;
        const q = face.clone().sub(h.p); q.addScaledVector(h.n, -q.dot(h.n));
        h.p.addScaledVector(q, w);
        h.maxR = Math.max(h.maxR, maxR);
        h.R = Math.min(h.maxR, Math.max(h.R, Math.sqrt(h.R * h.R + 0.45 * r * r), bd * (1 - w) + r * 0.7));
        h.D = Math.min(maxD, Math.max(h.D, d) + d * 0.35);
        h.blast = Math.max(h.blast, blast);
        h.jet = h.jet && jet;   // đạn nổ dồn vào lỗ khoan: thành hố chảo
        this.buildCrater(h);
        this.syncHoles();
        return h;
      }
      // hạt giống lấy từ toạ độ (như các vết khác) -> mọi máy có cùng hình hố
      const seed = (((Math.floor(x * 10) * 73856093) ^ (Math.floor(y * 10) * 19349663) ^ (Math.floor(z * 10) * 83492791)) >>> 0) % 100000 / 100000 * 6.283;
      const h = { p: face, n, R: Math.min(r, maxR), D: d, seed, maxR, blast, jet, mesh: null };
      if (this.holes.length >= MAX_HOLES) { const o = this.holes.shift(); if (o.mesh) { this.craterGroup.remove(o.mesh); this.disposeCrater(o); } }
      this.holes.push(h);
      this.buildCrater(h);
      this.syncHoles();
      return h;
    }
    // điểm (x, y, z) có nằm trong lòng hố nào trên mặt tường không (vết dán / rỗ không đặt lơ lửng trên lỗ)
    inHole(x, y, z, pad = 0) {
      for (const h of this.holes) {
        const q = new THREE.Vector3(x - h.p.x, y - h.p.y, z - h.p.z);
        if (Math.abs(q.dot(h.n)) > 1.5) continue;
        q.addScaledVector(h.n, -q.dot(h.n));
        if (q.length() < h.R * 0.8 + pad) return h;
      }
      return null;
    }
    syncHoles() {
      const P = HOLE_U.uHoleP.value, N = HOLE_U.uHoleN.value;
      this.holes.forEach((h, i) => { P[i].set(h.p.x, h.p.y, h.p.z, h.R); N[i].set(h.n.x, h.n.y, h.n.z, h.seed); });
      HOLE_U.uHoleCount.value = this.holes.length;
    }
    disposeCrater(h) {
      if (!h.mesh) return;
      h.mesh.traverse(o => { if (o.geometry) o.geometry.dispose(); });
      h.mesh = null;
    }
    // Lòng hố: lưới đĩa xuyên tâm, mép trùng viền lỗ (nhỉnh hơn chút, nằm ngay sau mặt tường); mặt vỡ lởm chởm theo nhiễu
    // liền mạch (mảng vỡ thành khối, không rối từng đỉnh); màu bê tông vỡ lộ cốt liệu, sâu thì tối dần, nổ thì ám khói;
    // hố lớn & sâu lộ cốt thép gỉ (lớp bảo vệ ~6 cm): thanh cong vênh, đứt gãy, chìa ra
    buildCrater(h) {
      if (h.mesh) { this.craterGroup.remove(h.mesh); this.disposeCrater(h); }
      const NS = 40, NR = 9, R = h.R, D = h.D;
      let sd = (Math.floor(h.seed * 1e5) * 2654435761) >>> 0;
      const rnd = () => { sd = (Math.imul(sd, 1664525) + 1013904223) >>> 0; return sd / 4294967296; };
      // nhiễu giá trị 2D liền mạch theo toạ độ trên mặt tường
      const hs = (i, j) => { let k = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.floor(h.seed * 9973)) | 0; k = Math.imul(k ^ (k >>> 13), 1274126177); return ((k ^ (k >>> 16)) >>> 0) / 4294967296; };
      const vn = (x, y) => {
        const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
        return (hs(i, j) * (1 - u) + hs(i + 1, j) * u) * (1 - v) + (hs(i, j + 1) * (1 - u) + hs(i + 1, j + 1) * u) * v;
      };
      const pos = [], col = [], idx = [];
      const push = (px, py, pz, depth01, rr, rim) => {
        pos.push(px, py, pz);
        // mép: gần màu mặt tường; vào trong: bê tông vỡ xám, tối dần xuống đáy, lốm đốm cốt liệu; muội khói ở lòng hố nổ
        let c = rim ? 0.42 : 0.47 - 0.27 * Math.pow(depth01, 0.8) + (vn(px * 3.1, py * 3.1) - 0.5) * 0.12;
        if (h.blast && !rim) c *= 0.6 + 0.4 * Math.min(1, rr * 1.25);
        col.push(c, c * 0.96, c * 0.88);
      };
      const depthAt = (x, y, r) => {
        // thành hố dốc gần đứng sát mép (bê tông vỡ giòn), đáy lòng chảo; mảng vỡ khối nhô / lõm theo nhiễu 2 tầng
        let base = Math.pow(Math.max(0, 1 - Math.pow(r, 3)), 0.55);
        // lỗ khoan của đạn xuyên / luồng nổ lõm: miệng bóc lở nông (~1/3 sâu), lõi hẹp sâu hoắm ở giữa
        if (h.jet) base = Math.max(0.35 * base, Math.exp(-Math.pow(r / 0.22, 2)));
        const n = (vn(x / 1.3, y / 1.3) - 0.5) * 0.55 + (vn(x / 0.55 + 7, y / 0.55) - 0.5) * 0.25;
        return -D * base * (1 + n) - 0.02;
      };
      push(0, 0, depthAt(0, 0, 0), 1, 0, false);
      for (let i = 1; i <= NR; i++) {
        const r = Math.pow(i / NR, 0.85);
        for (let j = 0; j < NS; j++) {
          const a = (j + (i % 2) * 0.5) / NS * Math.PI * 2;
          const rad = r * holeRim(a, h.seed) * R * 1.03;
          const x = Math.cos(a) * rad, y = Math.sin(a) * rad;
          const z = i === NR ? -0.06 : depthAt(x, y, r);
          push(x, y, z, Math.min(1, -z / Math.max(0.01, D)), r, i === NR);
        }
      }
      for (let j = 0; j < NS; j++) idx.push(0, 1 + j, 1 + (j + 1) % NS);
      for (let i = 1; i < NR; i++) {
        const a0 = 1 + (i - 1) * NS, a1 = 1 + i * NS;
        for (let j = 0; j < NS; j++) {
          const j1 = (j + 1) % NS;
          idx.push(a0 + j, a1 + j, a1 + j1, a0 + j, a1 + j1, a0 + j1);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      const grp = new THREE.Group();
      const bowl = new THREE.Mesh(g, this.craterMat);
      bowl.receiveShadow = true; bowl.castShadow = true;
      grp.add(bowl);
      // cốt thép lộ: lưới 2 lớp bước ~28 cm, lớp bảo vệ ~6 cm. Thanh bị nổ bẻ cong vênh ra ngoài, đứt khúc, nhiều thanh mất hẳn
      const cover = 0.5;
      if (D > cover + 0.5 && R > 2.2) {
        const reach = R * Math.cbrt(Math.max(0, 1 - Math.pow(cover / D, 1 / 0.55))) * 0.9;
        const step = 2.2, ph = rnd() * step;
        for (const [ax, dz] of [[0, cover], [1, cover + 0.24]]) {
          for (let s = -reach + ph; s < reach; s += step) {
            const L = Math.sqrt(Math.max(0, reach * reach - s * s));
            if (L < 0.6 || rnd() < 0.35) continue;
            // đứt: chỉ còn 1 khúc bám từ mép hố vào; nguyên: chạy suốt, võng / vênh nhẹ
            const broken = rnd() < 0.45;
            const len = broken ? L * (0.5 + rnd() * 0.6) : L * 2 * (0.85 + rnd() * 0.15);
            const off = broken ? (rnd() < 0.5 ? -1 : 1) * (L - len / 2) : 0;
            const bar = new THREE.Mesh(new THREE.BoxGeometry(ax ? 0.2 : len, ax ? len : 0.2, 0.2), this.rebarMat);
            bar.position.set(ax ? s : off, ax ? off : s, -dz + (broken ? 0.15 : 0));
            // khúc đứt vênh chĩa ra ngoài mặt tường; thanh nguyên cong nhẹ
            const tilt = (broken ? 0.25 + rnd() * 0.35 : (rnd() - 0.5) * 0.12) * (off >= 0 ? 1 : -1);
            if (ax) bar.rotation.x = -tilt; else bar.rotation.y = tilt;
            bar.rotation.z = (rnd() - 0.5) * 0.08;
            bar.castShadow = true;
            grp.add(bar);
          }
        }
      }
      // khung toạ độ: X = t, Y = b (trên mặt tường), Z = n (hướng ra ngoài)
      const n = h.n, t = Math.abs(n.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(n.z, 0, -n.x).normalize();
      const b = new THREE.Vector3().crossVectors(n, t);
      grp.matrix.makeBasis(t, b, n).setPosition(h.p);
      grp.matrixAutoUpdate = false;
      this.craterGroup.add(grp);
      h.mesh = grp;
    }

    // Đáy mái hầm (độ cao thế giới) phía trên điểm (x, z) nếu điểm nằm dưới mái còn nguyên (trong lòng hầm), null nếu không.
    // Lấy mức thấp nhất (đáy dầm trần) — vật bay trong hầm (drone) giữ thấp hơn mức này; phần vát miệng hầm cao dần ra cửa
    roofUnder(x, z) {
      for (const K of this.items) {
        if (Math.abs(x - K.x) > S.REACH || Math.abs(z - K.z) > S.REACH) continue;
        const L = this.local(K, x, z), af = Math.abs(L.f), ar = Math.abs(L.r);
        if (af > S.HB || ar >= S.WI) continue;
        if (K.nDown && this.cutAt(K, L.f, L.r)) continue;
        // dưới mái phẳng: thấp hơn đáy dầm trần; phần vát miệng hầm: theo mặt vát (cao dần ra cửa)
        const ch = ar < S.CH_R && af > S.HB - S.CH ? chamY(af) - 2 : S.CEIL - S.BEAM - 1;
        // top: mặt trên khối mái (lớp đất phủ; phần vát miệng hầm: đỉnh gờ mặt tiền) — điểm giữa y và top nằm trong bê tông
        // ox, oz: hướng ra miệng hầm gần nhất (khói dồn dưới trần chảy ra cửa)
        const sg = L.f >= 0 ? 1 : -1;
        return { K, y: K.G + Math.max(S.CEIL - S.BEAM - 1, ch), top: K.G + (ch > S.CEIL ? S.TOP : S.CREST), ox: K.fx * sg, oz: K.fz * sg };
      }
      return null;
    }
    // Điểm ngay ngoài miệng hầm gần nhất (so với điểm (x, z) trong lòng hầm K), cách mặt tiền 'out' đơn vị, sát sàn dốc
    mouthOut(K, x, z, out = 40) {
      const L = this.local(K, x, z), sg = L.f >= 0 ? 1 : -1;
      const r = Math.max(-S.WI + 24, Math.min(S.WI - 24, L.r)), f = sg * (S.HB + out);
      const w = this.toWorld(K, f, r);
      return { x: w.x, z: w.z, y: K.G + floorY(Math.abs(f)), sg };
    }

    // Nòng pháo (từ chốt nòng tới đầu nòng) có cắm vào bê tông / ụ đất không
    barrelBlocked(p0, p1) {
      if (!this.near(p1.x, p1.z, 70) && !this.near(p0.x, p0.z, 70)) return false;
      for (let i = 1; i <= 12; i++) {
        const t = 0.25 + 0.75 * i / 12;
        const x = p0.x + (p1.x - p0.x) * t, y = p0.y + (p1.y - p0.y) * t, z = p0.z + (p1.z - p0.z) * t;
        if (this.concreteAt(x, y + 1.2, z, 1.8)) return true;
        const s = this.surfaceAt(x, z);
        if (s !== null && y - 1.2 < s) {
          // Sàn bên trong kênh: chỉ chặn khi nòng thực sự chạm (cho phép hạ nòng sát dốc)
          return true;
        }
      }
      return false;
    }

    // ---------------------------------------------------------------- vùng bảo vệ
    protectedAt(x, y, z) {
      for (const K of this.items) {
        if (Math.abs(x - K.x) > S.HB + S.WI || Math.abs(z - K.z) > S.HB + S.WI) continue;
        const L = this.local(K, x, z), yy = y - K.G;
        // dưới ô mái đã sập: không còn được che
        if (Math.abs(L.f) <= S.HB && Math.abs(L.r) < S.WI && yy < S.CEIL + 1 && yy > -S.D - 12 && !(K.nDown && this.cutAt(K, L.f, L.r))) return K;
      }
      return null;
    }
    // Xe có thể đang nằm (một phần) trong khoang của cứ điểm nào
    shelterOf(unit) {
      for (const K of this.items) {
        if (Math.abs(unit.x - K.x) > S.HB + 90 || Math.abs(unit.z - K.z) > S.HB + 90) continue;
        const L = this.local(K, unit.x, unit.z);
        if (Math.abs(L.f) < S.HB + 70 && Math.abs(L.r) < S.WI + 20) return K;
      }
      return null;
    }
    // Tỉ lệ thân xe bị lộ (0 = khuất hoàn toàn, 1 = lộ hoàn toàn). Không có điểm nổ: phần nằm ngoài vùng mái che (giao diện,
    // nhật ký phòng thử). Có điểm nổ burst: phần thân xe NHÌN THẤY điểm nổ — đường thẳng không cắt bê tông / ụ đất / sàn của cứ
    // điểm: nổ trong lòng hầm hay trước miệng hầm thì mảnh văng & sóng nổ tới được phần xe hướng ra đó, nổ trên nóc mái / sau
    // tường thì bê tông chặn (trước đây xe nằm trọn dưới mái miễn nhiễm cả quả nổ ngay cạnh trong lòng hầm)
    exposure(unit, burst) {
      if (!this.shelterOf(unit)) return 1;
      const B = unitBox(unit);
      const c = Math.cos(unit.bodyAngle || 0), s = Math.sin(unit.bodyAngle || 0);
      let out = 0, n = 0;
      for (let ix = 0; ix <= 2; ix++) for (let iy = 0; iy <= 1; iy++) for (let iz = 0; iz <= 4; iz++) {
        const lx = B.minX + (B.maxX - B.minX) * (0.1 + 0.8 * ix / 2);
        const ly = B.minY + (B.maxY - B.minY) * (0.2 + 0.7 * iy);
        const lz = B.minZ + (B.maxZ - B.minZ) * (0.05 + 0.9 * iz / 4);
        const wx = unit.x + lx * c + lz * s, wz = unit.z - lx * s + lz * c, wy = (unit.y || 0) + ly;
        n++;
        if (burst ? !this.segmentHit(burst.x, burst.y, burst.z, wx, wy, wz) : !this.protectedAt(wx, wy, wz)) out++;
      }
      return out / n;
    }
    // Tỉ lệ thân xe nằm ngay dưới ô mái p (cứ điểm K) trong lòng hầm — xe bị bê tông + đất của ô vừa sập đè lên
    underPanel(unit, K, p) {
      const B = unitBox(unit);
      const c = Math.cos(unit.bodyAngle || 0), s = Math.sin(unit.bodyAngle || 0);
      let hit = 0, n = 0;
      for (let ix = 0; ix <= 2; ix++) for (let iz = 0; iz <= 4; iz++) {
        const lx = B.minX + (B.maxX - B.minX) * (0.1 + 0.8 * ix / 2), lz = B.minZ + (B.maxZ - B.minZ) * (0.05 + 0.9 * iz / 4);
        const wx = unit.x + lx * c + lz * s, wz = unit.z - lx * s + lz * c, yy = (unit.y || 0) + B.maxY - K.G;
        const L = this.local(K, wx, wz);
        n++;
        if (L.f >= p.f0 && L.f <= p.f1 && L.r >= p.r0 && L.r <= p.r1 && yy < S.CEIL + 1 && yy > -S.D - 12) hit++;
      }
      return hit / n;
    }

    // ---------------------------------------------------------------- va chạm xe
    /** Đẩy thân xe (hình chữ nhật xoay theo bodyAngle) ra khỏi tường / ụ đất. Trả về {x, z, hit} */
    collideVehicle(x, z, unit, radius = 16) {
      const K = this.near(x, z, 60);
      if (!K) return null;
      const B = unit ? unitBox(unit) : null;
      const hl = B ? Math.max(Math.abs(B.minZ), Math.abs(B.maxZ)) * 0.94 : radius, hw = B ? Math.max(Math.abs(B.minX), Math.abs(B.maxX)) * 0.94 : radius;
      const ang = unit ? unit.bodyAngle || 0 : 0;
      const fwx = -Math.sin(ang), fwz = -Math.cos(ang), rtx = Math.cos(ang), rtz = -Math.sin(ang);
      const pts = [[0, 0], [hl, hw], [hl, -hw], [-hl, hw], [-hl, -hw], [hl, 0], [-hl, 0], [0, hw], [0, -hw], [hl * 0.5, hw], [hl * 0.5, -hw], [-hl * 0.5, hw], [-hl * 0.5, -hw]];
      let hit = false;
      // Xe đang ở trên ụ đất / nắp hầm (cao hơn cốt nền): được chạy khắp mặt ụ, chỉ chặn mép rơi xuống kênh
      const onTop = unit && unit.y !== undefined && (unit.y - K.G) > 8;
      for (let it = 0; it < 4; it++) {
        const C = this.local(K, x, z);
        const centerIn = !onTop && Math.abs(C.r) < cutHalf(Math.abs(C.f));
        let best = null, bestLen = 0;
        for (const [a, b] of pts) {
          const px = x + fwx * a + rtx * b, pz = z + fwz * a + rtz * b;
          const L = this.local(K, px, pz), af = Math.abs(L.f), ar = Math.abs(L.r);
          if (onTop) {
            // Mép kênh hở (ngoài mái che) và đỉnh tường cánh: đẩy lùi về phía ụ / nắp hầm
            if (af <= S.HB - 2 || af > S.END) continue;
            const edge = cutHalf(af) + S.WING_T * 0.6;
            if (ar >= edge) continue;
            const pr = Math.sign(L.r || 1) * (edge + 0.6 - ar);
            const pf = ar < S.WO ? -Math.sign(L.f) * (af - (S.HB - 2) + 0.6) : Infinity;
            const cand = Math.abs(pf) < Math.abs(pr) ? [pf, 0] : [0, pr];
            const len = Math.hypot(cand[0], cand[1]);
            if (len > bestLen) { bestLen = len; best = cand; }
            continue;
          }
          if (inCut(af, ar) && af <= S.END + 40) continue;
          // đoạn tường cánh đã vỡ: không còn tường chặn (dốc đất sụt — xe leo được thì leo, xem vehicleFloorAt)
          if (K.nWing && af > S.HB && af < S.END && this.wingDownAt(K, L.f, L.r)) continue;
          // Ở ngoài kênh: ụ đất leo được (giới hạn dốc theo loại xe), chỉ tường cánh bê tông là chặn
          if (!centerIn && !(af > S.HB && af < S.END && ar < cutHalf(af) + S.WING_T)) continue;
          const wingBand = af > S.HB && af < S.END && ar < cutHalf(af) + S.WING_T;
          const d = coreDist(af, ar);
          if (!(d < D_SOLID || wingBand)) continue;
          let pf = 0, pr = 0;
          if (centerIn) {
            pr = Math.sign(L.r) * (cutHalf(af) - 0.6) - L.r;
          } else {
            // Chạm tường cánh từ phía ngoài: đẩy ngang ra khỏi dải tường (xe vẫn leo được ụ đất phía sau)
            pr = Math.sign(L.r || 1) * (cutHalf(af) + S.WING_T + 0.6 - ar);
          }
          const len = Math.hypot(pf, pr);
          if (len > bestLen) { bestLen = len; best = [pf, pr]; }
        }
        if (!best) break;
        hit = true;
        x += K.fx * best[0] + K.rx * best[1];
        z += K.fz * best[0] + K.rz * best[1];
      }
      return { x, z, hit };
    }

    // ---------------------------------------------------------------- dựng hình
    buildOne(s) {
      const a = s.angle || 0;
      const K = {
        id: s.id || '?', x: s.x, z: s.z, G: s.G, angle: a,
        fx: Math.cos(a), fz: Math.sin(a), rx: -Math.sin(a), rz: Math.cos(a)
      };
      this.initPanels(K);
      const grp = new THREE.Group();
      grp.name = 'stronghold_' + K.id;
      grp.position.set(K.x, K.G, K.z);
      grp.rotation.y = -a;          // trục X cục bộ = f, trục Z cục bộ = r
      this.group.add(grp);
      K.group = grp;

      const conc = concreteMaps();
      const concMat = new THREE.MeshStandardMaterial({ map: conc.map, bumpMap: conc.bump, bumpScale: 0.6, roughness: 0.93, metalness: 0.0, vertexColors: true });
      const floorMat = new THREE.MeshStandardMaterial({ map: floorMaps(), roughness: 0.9, metalness: 0.0, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      const SC = 64;   // 1 ô texture bê tông = 64 đơn vị

      // ---- Bê tông. C: tường bên + tường cánh (luôn đặc); Rf: mái, mặt tiền, dầm trần, nắp hầm (mờ đi khi nhìn xuyên vào hầm)
      const C = new Builder(), Rf = new Builder();
      const { HB, WI, WO, CEIL, ROOF, TOP, D } = S;
      // Mái (mặt dưới = trần khoang; mặt trên bị đất phủ)
      const HN = S.HAUNCH, BV = S.BEVEL, CR = S.CH_R;
      // Phần mái gác trên góc vát nách & tường bên (2 bên): khối hộp như cũ, mặt bên phía trong khép kín mép phần vát
      for (const sr of [-1, 1]) Rf.box(-HB, HB, CEIL, CEIL + ROOF, sr > 0 ? CR : -WO - 2, sr > 0 ? WO + 2 : -CR, SC, { top: true, fp: true, fn: true }, { bottom: 0.78 });
      // Phần mái giữa (trên lòng hầm): tiết diện vát chéo 2 đầu
      const fi0 = HB - S.LIP_T, yCh = chamY(fi0), fCh = HB - S.CH;
      Rf.prism([[-fCh, CEIL], [fCh, CEIL], [fi0, yCh], [fi0, CEIL + ROOF], [-fi0, CEIL + ROOF], [-fi0, yCh]], 'r', -CR, CR, SC, [2, 3, 4], false, { 0: 0.78, 1: 0.9, 5: 0.9 });
      // Mặt tiền 2 đầu (gờ dày nhô lên khỏi lớp đất)
      for (const sg of [-1, 1]) {
        // tiết diện (f, y): mặt tiền đứng, mép trên vát 45° lùi vào trong
        const fi = sg * (HB - S.LIP_T), fo = sg * HB, LB = S.LIP_BEVEL;
        for (const sr of [-1, 1]) Rf.prism([[fi, CEIL - 0.01], [fo, CEIL - 0.01], [fo, TOP - LB], [fo - sg * LB, TOP], [fi, TOP]], 'r', sr > 0 ? CR : -WO - 2, sr > 0 ? WO + 2 : -CR, SC, [0, 4], true, { 2: 1.1, 3: 1.04 });
        // phần giữa: gờ bị mặt vát cắt — mặt vát -> giao với mép vát trên gờ -> đỉnh gờ
        const fx = (S.TOP - LB + HB - S.CEIL + S.CHK * (HB - S.CH)) / (1 + S.CHK);   // giao mặt vát & mép vát 45° của gờ
        const yx = S.CEIL + (fx - (HB - S.CH)) * S.CHK;
        Rf.prism([[fi, chamY(HB - S.LIP_T)], [sg * fx, yx], [fo - sg * LB, TOP], [fi, TOP]], 'r', -CR, CR, SC, [3], true, { 0: 0.9, 1: 1.1, 2: 1.04 });
      }
      // Tường bên (chỉ mặt trong lộ ra)
      // Tường bên (mặt trong, đỉnh và mặt ngoài cắm sâu xuống nền)
      for (const sg of [-1, 1]) {
        const r0 = sg > 0 ? WI : -WO, r1 = sg > 0 ? WO : -WI;
        C.box(-HB, HB, -D - 2, S.CREST, r0, r1, SC, { bottom: true, fp: true, fn: true }, { rn: 0.82, rp: 0.82, top: 1.05 });
        // chân tường (gờ chống va)
        const k0 = sg > 0 ? WI - 1.4 : -WI, k1 = sg > 0 ? WI : -WI + 1.4;
        C.box(-HB, HB, -D - 0.5, -D + 3, k0, k1, SC, { bottom: true, fp: true, fn: true }, { top: 0.85, rn: 0.7, rp: 0.7 });
        // Vát nách góc trần - tường (tiết diện tam giác (r, y)), lộ ra thành góc vát của miệng hầm ở 2 đầu
        C.prism([[sg * WI, CEIL - HN], [sg * WI, CEIL + 0.01], [sg * (WI - HN), CEIL + 0.01]], 'f', -HB, HB, SC, [0, 1], true, { 2: 0.9, cap: 0.95 });
        // Mặt đầu hồi tường bên tại |f| = HB: bịt kín khoảng trống giữa tường cánh (r = 114) và tường bên (r = 124)
        for (const sf of [-1, 1]) {
          const fEnd = sf * HB;
          const rMin = sg > 0 ? cutHalf(HB) + S.WING_T : -WO;
          const rMax = sg > 0 ? WO : -(cutHalf(HB) + S.WING_T);
          if (rMax > rMin) {
            const outD = [sf, 0, 0];
            C.quadOut([fEnd, -D - 2, rMin], [fEnd, -D - 2, rMax], [fEnd, S.CREST, rMax], [fEnd, S.CREST, rMin],
              [[rMin / SC, (-D - 2) / SC], [rMax / SC, (-D - 2) / SC], [rMax / SC, S.CREST / SC], [rMin / SC, S.CREST / SC]], 0.88, outD);
          }
        }
      }
      // Dầm trần
      for (const bf of S.BEAMS_F) Rf.box(bf - 3, bf + 3, CEIL - S.BEAM, CEIL + 0.1, -WI, WI, SC, { top: true, rp: true, rn: true }, { bottom: 0.7, fp: 0.75, fn: 0.75 });
      // Nắp hầm: tấm bê tông lộ trên đỉnh ụ đất (sơn chữ cứ điểm, nhìn rõ từ trên cao) - trùm kín đỉnh tường bên và gờ mặt tiền
      {
        // cạnh vát nghiêng 4 phía (khối chóp cụt dẹt)
        const f0 = HB - S.LIP_T, r0 = WO, f1 = f0 - BV, r1 = r0 - BV, y0 = S.CREST - 0.6, y1 = S.CREST + 2.2;
        const A = [[-f0, y0, -r0], [f0, y0, -r0], [f0, y0, r0], [-f0, y0, r0]], T = [[-f1, y1, -r1], [f1, y1, -r1], [f1, y1, r1], [-f1, y1, r1]];
        const uvT = q => [q[0] / SC, q[2] / SC];
        Rf.quadOut(T[0], T[1], T[2], T[3], T.map(uvT), 1.08, [0, 1, 0]);
        for (let i = 0; i < 4; i++) {
          const j = (i + 1) % 4, mx = (A[i][0] + A[j][0]) / 2, mz = (A[i][2] + A[j][2]) / 2;
          const along = i % 2 === 0 ? q => q[0] : q => q[2];
          Rf.quadOut(A[i], A[j], T[j], T[i], [[along(A[i]) / SC, 0], [along(A[j]) / SC, 0], [along(T[j]) / SC, 6 / SC], [along(T[i]) / SC, 6 / SC]], 0.95, [mx, 1, mz]);
        }
      }
      // Tường cánh loe (mặt trong + đỉnh + mặt ngoài cắm sâu xuống đất + đầu tường), chạy từ mép mái ra tới chân ụ đất
      const step = 4;
      for (const sg of [-1, 1]) for (const sr of [-1, 1]) {
        for (let af = HB; af < S.END - 0.01; af += step) {
          const a0 = af, a1 = Math.min(S.END, af + step);
          const top = q => Math.max(0.5, wingLine(q)) + 1.5;
          const r0 = cutHalf(a0), r1 = cutHalf(a1);
          const b0 = floorY(a0) - 2, b1 = floorY(a1) - 2, t0 = top(a0), t1 = top(a1);
          const P = (q, r, y) => [sg * q, y, sr * r];
          const flip = sg * sr > 0;
          // Mặt trong
          const w0 = wingBevel(t0, b0), w1 = wingBevel(t1, b1), WB = Math.max(w0, w1);
          const A = P(a0, r0, b0), Bq = P(a1, r1, b1), Cq = P(a1, r1, t1 - w1), Dq = P(a0, r0, t0 - w0);
          const u0 = a0 / SC * 1.18, u1 = a1 / SC * 1.18;
          if (flip) C.quad(Bq, A, Dq, Cq, [[u1, b1 / SC], [u0, b0 / SC], [u0, t0 / SC], [u1, t1 / SC]], 0.9);
          else C.quad(A, Bq, Cq, Dq, [[u0, b0 / SC], [u1, b1 / SC], [u1, t1 / SC], [u0, t0 / SC]], 0.9);
          // Đỉnh tường (gờ)
          // Mép trong vát 45° rồi tới đỉnh tường (gờ)
          const T = S.WING_T;
          const Cb = P(a1, r1 + w1, t1), Db = P(a0, r0 + w0, t0);
          if (flip) C.quad(Cq, Dq, Db, Cb, [[u1, 0], [u0, 0], [u0, WB * 1.41 / SC], [u1, WB * 1.41 / SC]], 0.98);
          else C.quad(Dq, Cq, Cb, Db, [[u0, 0], [u1, 0], [u1, WB * 1.41 / SC], [u0, WB * 1.41 / SC]], 0.98);
          const E = P(a0, r0 + T, t0), F = P(a1, r1 + T, t1);
          if (flip) C.quad(Cb, Db, E, F, [[u1, 0], [u0, 0], [u0, T / SC], [u1, T / SC]], 1.05);
          else C.quad(Db, Cb, F, E, [[u0, 0], [u1, 0], [u1, T / SC], [u0, T / SC]], 1.05);
          // Mặt ngoài tường cánh: cắm thẳng đứng xuống sâu dưới mặt đất / cốt nền (không bao giờ hở khe nhìn xuyên qua)
          const gOut0 = Math.min(b0, -D - 12);
          const gOut1 = Math.min(b1, -D - 12);
          const Eo = P(a0, r0 + T, gOut0), Fo = P(a1, r1 + T, gOut1);
          if (flip) C.quad(E, F, Fo, Eo, [[u0, t0 / SC], [u1, t1 / SC], [u1, gOut1 / SC], [u0, gOut0 / SC]], 0.86);
          else C.quad(F, E, Eo, Fo, [[u1, t1 / SC], [u0, t0 / SC], [u0, gOut0 / SC], [u1, gOut1 / SC]], 0.86);
        }
        // Đầu tường cánh
        const ae = S.END, re = cutHalf(ae), te = 2.0, be = floorY(ae) - 2;
        const P = (r, y) => [sg * ae, y, sr * r];
        const flip = sg * sr > 0;
        // tiết diện đầu tường có góc vát chéo như đỉnh tường
        const WB = wingBevel(te, be), out = [sg, 0, 0], uv = (r, y) => [(r - re) / SC, y / SC];
        const e = [[re, be], [re + S.WING_T, be], [re + S.WING_T, te], [re + WB, te], [re, te - WB]];
        for (let i = 1; i < 4; i++) C.quadOut(P(...e[0]), P(...e[i]), P(...e[i + 1]), P(...e[i + 1]), [uv(...e[0]), uv(...e[i]), uv(...e[i + 1]), uv(...e[i + 1])], 0.95, out);
      }
      // Sân phễu bê tông trước 2 miệng hầm: bó vỉa / gờ mép (vào khối bê tông chung)
      const slabY = this.portalSlabFn(K);
      K.slabY = slabY;
      this.buildPortalKerbs(K, C, slabY, SC);
      // Chân tường / gầm khoang tối hơn (bóng che khuất), mép trên sáng hơn
      const wopt = { shadeDir: this.shadeDir };
      weatherMat(concMat, 'wall', this.mapType, wopt);
      holeDiscard(concMat);
      const concGeo = addWeatherAttrs(C.build((f, y) => y < CEIL - 0.5 ? 0.66 + 0.34 * smooth((y + D) / 30) : 1),
        (f, y, r) => Math.abs(f) > S.END + 0.5 ? slabY(f, r) : floorY(Math.abs(f)),
        null,
        // mép trên phía trên đỉnh đó: bó vỉa / tường cánh (đường xiên) / tường bên trong hầm (trần) / đỉnh ụ
        (f, y, r) => {
          const af = Math.abs(f);
          if (af > S.END + 0.5) return y + 0.5;
          if (af > HB + 0.5) return Math.max(0.5, wingLine(af)) + 1.5;
          return y < CEIL + 0.5 ? CEIL : S.CREST;
        });
      const concMesh = new THREE.Mesh(concGeo, concMat);
      concMesh.castShadow = true; concMesh.receiveShadow = true;
      grp.add(concMesh);
      // Nhóm mái: mờ đi khi cứ điểm nằm trong khung nhìn để thấy xe bên dưới (tường & ụ đất vẫn đặc)
      const roofGrp = new THREE.Group();
      roofGrp.name = 'stronghold_roof';
      grp.add(roofGrp);
      const roofMat = holeDiscard(weatherMat(concMat.clone(), 'wall', this.mapType, wopt));
      // nắp hầm & gờ mặt tiền nhô trên lớp đất phủ: bụi cát bám từ mặt đất phủ lên; mặt dưới mái / dầm trong khoang: theo sàn
      // mép trên: nắp hầm / gờ mặt tiền (vệt nước mưa chảy từ đỉnh gờ xuống lanh tô) / trần (dầm)
      const roofGeo = addWeatherAttrs(Rf.build((f, y) => y < CEIL + 0.5 ? 0.78 : 1), (f, y) => y > S.CREST - 4 ? S.CREST - 1 : floorY(Math.abs(f)),
        null, (f, y) => y > S.CREST - 4 ? S.CREST + 2.2 : (y > CEIL - 2 && Math.abs(f) > HB - S.LIP_T - 1 ? TOP : CEIL));
      const roofMesh = new THREE.Mesh(roofGeo, roofMat);
      roofMesh.castShadow = true; roofMesh.receiveShadow = true;
      roofMesh.customDepthMaterial = cutDepthMat();
      roofGrp.add(roofMesh);
      // Lớp đất phủ trên mái (ụ đất không phủ phần này để mái tách riêng được)
      const pal = EARTH[this.mapType] || EARTH.HIGHLAND;
      const coverGround = this.groundMat(false);
      const coverMat = coverGround || new THREE.MeshStandardMaterial({ map: earthMap(), roughness: 0.97, color: new THREE.Color(pal.grass[0] / 255 * 1.3, pal.grass[1] / 255 * 1.3, pal.grass[2] / 255 * 1.3) });
      const coverGeo = new THREE.PlaneGeometry((HB - S.LIP_T + 0.5) * 2, (WO + 0.5) * 2, 1, 1);
      coverGeo.rotateX(-Math.PI / 2);
      {
        const uv = coverGeo.attributes.uv, P = coverGeo.attributes.position;
        for (let i = 0; i < uv.count; i++) {
          if (coverGround) { const w = this.toWorld(K, P.getX(i), P.getZ(i)); uv.setXY(i, ...this.mapUV(w.x, w.z)); }
          else uv.setXY(i, uv.getX(i) * HB / 16, uv.getY(i) * WO / 16);
        }
      }
      const cover = new THREE.Mesh(coverGeo, holeDiscard(coverMat));
      cover.position.y = S.CREST + 0.3;
      cover.castShadow = true; cover.receiveShadow = true;
      cover.customDepthMaterial = cutDepthMat();
      roofGrp.add(cover);
      K.roofMeshes = [roofMesh, cover];

      // ---- Sàn khoang + dốc + sân bê tông giữa 2 tường cánh
      const Fb = new Builder();
      const fl = (af) => floorY(af) + 0.06;
      const FS = 96;
      for (let f = -S.END; f < S.END - 0.01; f += step) {
        const f1 = Math.min(S.END, f + step);
        const w0 = cutHalf(Math.abs(f)) + 1, w1 = cutHalf(Math.abs(f1)) + 1;
        for (let k = 0; k < 8; k++) {
          const s0 = -1 + k / 4, s1 = -1 + (k + 1) / 4;
          const A = [f, fl(Math.abs(f)), s0 * w0], Bq = [f1, fl(Math.abs(f1)), s0 * w1], Cq = [f1, fl(Math.abs(f1)), s1 * w1], Dq = [f, fl(Math.abs(f)), s1 * w0];
          Fb.quad(A, Dq, Cq, Bq, [[f / FS, s0 * w0 / FS], [f / FS, s1 * w0 / FS], [f1 / FS, s1 * w1 / FS], [f1 / FS, s0 * w1 / FS]], Math.abs(f) < HB ? 0.8 : 1);
        }
      }
      // sân phễu bê tông nối liền mép cuối sân (cùng vật liệu sàn -> mạch co giãn, vệt xích liền một mạch)
      this.buildPortalSlab(K, Fb, slabY, FS);
      weatherMat(floorMat, 'floor', this.mapType, wopt);
      // vũng nước trong lòng hầm phản chiếu trời ở miệng hầm (chỉ chỗ ướt: shader nhân phản chiếu theo độ ướt)
      floorMat.envMap = envCube(); floorMat.envMapIntensity = 0.6;
      // cát lấn: dọc hai mép giáp ụ đất / bó vỉa, cuối sân & cổ phễu (đất bánh xe kéo từ đường vào), trong lòng hầm ít hẳn
      const floorGeo = addWeatherAttrs(Fb.build(), null, (f, y, r) => {
        const af = Math.abs(f);
        if (af > S.END + 0.01) {
          const hw = portalHalf(af), u = (af - S.END) / PORTAL.APRON;
          const side = smooth((Math.abs(r) / hw - 0.72) / 0.28);
          return Math.max(side * 0.85, smooth((u - 0.6) / 0.4) * 0.62, 0.14 + 0.25 * smooth((Math.abs(r) - 40) / 80));
        }
        const w = cutHalf(af) + 1;
        const end = smooth((af - (S.RAMP_END - 40)) / (S.END - S.RAMP_END + 40));
        const side = smooth((Math.abs(r) / w - 0.62) / 0.38);
        const open = af > HB ? 1 : 0.35;
        // cuối sân không còn là mép tan vào cát (đã nối sân phễu): chỉ còn cát lấn ở 2 góc ngoài làn xe
        return Math.max(end * 0.5 * smooth((Math.abs(r) - 50) / 70), side * 0.8 * open, 0.12 * open);
      });
      const floorMesh = new THREE.Mesh(floorGeo, floorMat);
      floorMesh.receiveShadow = true;
      grp.add(floorMesh);
      // rãnh thu nước nắp lưới thép ngang miệng dốc, sơn cảnh báo đầu tường cánh, vạch dừng, cọc tiêu phản quang
      this.buildPortalDetails(K, grp, slabY);

      // ---- Ụ đất phủ cỏ (lưới cao độ cục bộ, khoét kênh xe chạy)
      const moundGrp = this.buildMound(K);
      grp.add(moundGrp);
      // Vật liệu làm mờ khi nhìn xuyên vào hầm: chỉ phần mái (tường, ụ đất giữ nguyên)
      K.fadeMats = [roofMat, coverMat];
      K.fade = 1;

      // ---- Đèn trần + biển chữ cứ điểm
      const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff1cc });
      const housingMat = new THREE.MeshStandardMaterial({ color: 0x3a3c3e, roughness: 0.6, metalness: 0.5 });
      K.fadeMats.push(lampMat, housingMat);
      K.lampMeshes = [];
      for (const lf of [-80, -48, -16, 16, 48, 80]) for (const lr of [-S.SLOT_R * 1.5, -S.SLOT_R * 0.5, S.SLOT_R * 0.5, S.SLOT_R * 1.5]) {
        const hsg = new THREE.Mesh(new THREE.BoxGeometry(7, 1.2, 2.2), housingMat);
        hsg.position.set(lf, CEIL - 0.6, lr); roofGrp.add(hsg); K.lampMeshes.push(hsg);
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(6, 0.3, 1.4), lampMat);
        lamp.position.set(lf, CEIL - 1.3, lr); roofGrp.add(lamp); K.lampMeshes.push(lamp);
      }
      // Không dùng PointLight: mỗi đèn thêm vào cảnh làm mọi vật liệu phải tính thêm 1 nguồn sáng trên từng điểm ảnh.
      // Lòng hầm đủ sáng nhờ ánh sáng môi trường; đèn trần là tấm tự phát sáng.
      const letter = letterTexture(K.id);
      for (const sg of [-1, 1]) {
        // chữ & vạch sơn trên mặt tiền: không sơn đè lên lỗ hố đạn
        const m = new THREE.Mesh(new THREE.PlaneGeometry(22, 22), holeDiscard(new THREE.MeshStandardMaterial({ map: letter, transparent: true, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })));
        // mặt vát miệng hầm: trục ngang theo r, trục dọc theo dốc mặt vát, pháp tuyến chếch xuống & ra ngoài
        const cl = Math.hypot(S.CHK, 1), cnf = S.CHK / cl, cny = -1 / cl;
        const onCh = (t, out) => {   // t: quãng dọc mặt vát từ mép dưới (đơn vị)
          const uf = 1 / cl, uy = S.CHK / cl;
          return new THREE.Vector3(sg * (HB - S.CH + uf * t + cnf * out), CEIL + uy * t + cny * out, 0);
        };
        const chBasis = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, -sg), new THREE.Vector3(-sg * cny, cnf, 0), new THREE.Vector3(sg * cnf, cny, 0));
        m.quaternion.setFromRotationMatrix(chBasis);
        m.position.copy(onCh(22, 0.1));
        roofGrp.add(m);
        K.fadeMats.push(m.material);
        // vạch sơn cảnh báo vàng đen dọc mép dưới mặt vát
        const stripe = new THREE.Mesh(new THREE.PlaneGeometry((WI - S.HAUNCH) * 2, 1.8), holeDiscard(new THREE.MeshStandardMaterial({ map: hazardTex(), roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })));
        stripe.quaternion.setFromRotationMatrix(chBasis);
        stripe.position.copy(onCh(1.4, 0.1));
        roofGrp.add(stripe);
        K.fadeMats.push(stripe.material);
      }
      // Chữ cứ điểm cỡ lớn sơn trên nắp hầm
      const roofLetterMat = holeDiscard(new THREE.MeshStandardMaterial({ map: letter, transparent: true, roughness: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
      const rl = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), roofLetterMat);
      rl.rotation.set(-Math.PI / 2, 0, K.angle);   // chân chữ luôn quay về phía nam bản đồ (đọc xuôi từ camera)
      rl.position.set(0, S.CREST + 2.3, 0);
      rl.renderOrder = 3;
      roofGrp.add(rl);
      K.roofLetter = rl;
      K.fadeMats.push(roofLetterMat);
      // Cột cờ trên nắp hầm
      this.buildFlag(K, grp);
      // Tàn tích trận đánh quanh đồi cứ điểm: xác xe bị hạ + hố bom (map_gen chọn chỗ theo hạt giống bản đồ)
      this.buildBattlefieldWrecks(K, s);
      return K;
    }

    // ---------------------------------------------------------------- lối vào cửa hầm (sân phễu bê tông)
    // Bố cục mỗi miệng hầm (8 đv = 1 m, |f| tính từ tâm cứ điểm):
    //  - |f| 200..206: rãnh thu nước ngang miệng dốc (nắp lưới thép 0,55 m) ngay trên đỉnh dốc xuống hầm
    //  - |f| 206..310: sân phễu bê tông 13 m, miệng rộng ~46 m (phủ cả chân 2 tường cánh) thu kiểu loa kèn về cổ 7,5 m;
    //    bó vỉa thấp 15 cm hai mép (vuốt thấp dần ở cổ), vạch dừng sơn trắng mòn trước cổ phễu
    //  - |f| 310..462: đường vào thẳng theo trục hầm 6,5 m (loại đường của bản đồ, map_gen), vai sỏi + rãnh thoát nước
    //    hai bên, cọc tiêu phản quang dọc vai đường
    groundLocal(K, f, r) {
      if (!this.groundAt) return 0;
      const w = this.toWorld(K, f, r);
      return this.groundAt(w.x, w.z) - K.G;
    }
    // Cao độ mặt sân phễu (hệ cục bộ, so với cốt nền) tại (f, r): bám mặt đất đã san phẳng (map_gen) + nâng 0,6 đv chống
    // z-fighting với mặt đất / mặt đường, bù chỗ nền lồi giữa 2 đỉnh lưới địa hình; sát mép cuối sân trùng đúng mặt sàn
    portalSlabFn(K) {
      const cache = new Map();
      const g = (f, r) => this.groundLocal(K, f, r);
      return (f, r) => {
        const key = Math.round(f * 4) * 100003 + Math.round(r * 4);
        const c = cache.get(key);
        if (c !== undefined) return c;
        const af = Math.abs(f);
        let v = 0.06;
        if (af > S.END) {
          const gy = g(f, r);
          let bulge = 0;
          for (const [uf, ur] of [[3, 0], [-3, 0], [0, 3], [0, -3]]) {
            const bm = g(f + uf, r + ur) - (gy + g(f + uf * 2, r + ur * 2)) / 2;
            if (bm > bulge) bulge = bm;
          }
          v = 0.06 + (gy + Math.min(bulge, 1.2) + 0.6 - 0.06) * smooth((af - S.END) / 12);
        }
        cache.set(key, v);
        return v;
      };
    }
    // Tấm sân phễu: lưới bám đất, uv nối tiếp sàn (mạch co giãn 6 m), màu đỉnh = vệt mòn bánh xích / dầu ở giữa làn
    buildPortalSlab(K, Fb, slabY, FS) {
      const st = 4, NA = 24;
      const wear = (f, r) => {
        const ar = Math.abs(r);
        const lane = Math.exp(-(((ar - 13) / 6) ** 2)) * 0.13 + Math.exp(-(((ar - 38) / 9) ** 2)) * 0.05;   // vệt xích: làn chính + làn phụ
        const oil = Math.exp(-((r / 4) ** 2)) * 0.06 + Math.exp(-((r / 30) ** 2)) * 0.05;                   // dầu nhỏ giọt giữa làn
        const spot = vnoise(f / 9 + 3.7, r / 9 - 1.3) > 0.78 ? 0.08 : 0;                                // vết dầu loang
        const edge = smooth((ar / portalHalf(Math.abs(f)) - 0.55) / 0.45) * 0.06;                       // mép ít xe qua: sáng hơn
        return 1 - lane - oil - spot + edge;
      };
      for (const sg of [-1, 1]) {
        for (let af = S.END; af < PORTAL.NECK_F - 0.01; af += st) {
          const a1 = Math.min(PORTAL.NECK_F, af + st);
          const w0 = portalHalf(af) - 1, w1 = portalHalf(a1) - 1;   // mép tấm nằm khuất dưới bó vỉa
          for (let k = 0; k < NA; k++) {
            const s0 = -1 + 2 * k / NA, s1 = -1 + 2 * (k + 1) / NA;
            const V = (a, s, w) => [sg * a, slabY(sg * a, s * w), s * w];
            const A = V(af, s0, w0), Bq = V(a1, s0, w1), Cq = V(a1, s1, w1), Dq = V(af, s1, w0);
            const uv = q => [q[0] / FS, q[2] / FS], cw = q => wear(q[0], q[2]);
            if (sg > 0) Fb.quadC(A, Dq, Cq, Bq, [uv(A), uv(Dq), uv(Cq), uv(Bq)], [cw(A), cw(Dq), cw(Cq), cw(Bq)]);
            else Fb.quadC(A, Bq, Cq, Dq, [uv(A), uv(Bq), uv(Cq), uv(Dq)], [cw(A), cw(Bq), cw(Cq), cw(Dq)]);
          }
        }
      }
    }
    // Bó vỉa bê tông thấp (15 cm, rộng 0,3 m, vát mép trên) chạy theo mép loa kèn, mặt ngoài cắm xuống đất che mép tấm sân
    buildPortalKerbs(K, C, slabY, SC) {
      const KH = 1.2, KW = 2.4, CH = 0.5, st = 4;
      const f0 = S.END + 1, f1 = PORTAL.NECK_F;
      const kh = af => KH * (1 - 0.9 * smooth((af - (f1 - 10)) / 10));   // cuối bó vỉa vuốt thấp dần nhập vai đường
      for (const sg of [-1, 1]) for (const sr of [-1, 1]) {
        const row = af => {
          const hw = portalHalf(af), rIn = hw - KW, rOut = hw + 0.3;
          const yIn = slabY(sg * af, sr * rIn);
          const top = Math.max(yIn, slabY(sg * af, sr * hw)) + kh(af);
          return { rIn, rOut, yIn, top, gOut: Math.min(yIn - 0.4, this.groundLocal(K, sg * af, sr * (rOut + 1.5))) - 1.0 };
        };
        const P = (af, r, y) => [sg * af, y, sr * r];
        const cap = (R, af, dir) => {
          const out = [dir * sg, 0, 0];
          C.quadOut(P(af, R.rIn, R.yIn - 0.2), P(af, R.rOut, R.gOut), P(af, R.rOut, R.top), P(af, R.rIn + CH, R.top), [[0, 0], [KW / SC, 0], [KW / SC, KH / SC], [0, KH / SC]], 0.9, out);
          C.quadOut(P(af, R.rIn, R.yIn - 0.2), P(af, R.rIn + CH, R.top), P(af, R.rIn, R.top - CH), P(af, R.rIn, R.top - CH), [[0, 0], [0, KH / SC], [0, KH / SC], [0, KH / SC]], 0.9, out);
        };
        let A = row(f0);
        cap(A, f0, -1);
        for (let af = f0; af < f1 - 0.01; af += st) {
          const a1 = Math.min(f1, af + st), B = row(a1);
          const u0 = af / SC, u1 = a1 / SC, h = KH / SC, wv = KW / SC;
          C.quadOut(P(af, A.rIn, A.yIn - 0.2), P(a1, B.rIn, B.yIn - 0.2), P(a1, B.rIn, B.top - CH), P(af, A.rIn, A.top - CH), [[u0, 0], [u1, 0], [u1, h], [u0, h]], 0.92, [0, 0, -sr]);
          C.quadOut(P(af, A.rIn, A.top - CH), P(a1, B.rIn, B.top - CH), P(a1, B.rIn + CH, B.top), P(af, A.rIn + CH, A.top), [[u0, h], [u1, h], [u1, h + 0.01], [u0, h + 0.01]], 1.0, [0, 1, -sr]);
          C.quadOut(P(af, A.rIn + CH, A.top), P(a1, B.rIn + CH, B.top), P(a1, B.rOut, B.top), P(af, A.rOut, A.top), [[u0, 0], [u1, 0], [u1, wv], [u0, wv]], 1.04, [0, 1, 0]);
          C.quadOut(P(af, A.rOut, A.top), P(a1, B.rOut, B.top), P(a1, B.rOut, B.gOut), P(af, A.rOut, A.gOut), [[u0, h], [u1, h], [u1, 0], [u0, 0]], 0.86, [0, 0, sr]);
          A = B;
        }
        cap(A, f1, 1);
      }
    }
    // Chi tiết rẻ (gộp hình, 2 lần vẽ / cứ điểm): rãnh thu nước nắp lưới thép, sơn sọc vàng đen đầu tường cánh, vạch
    // dừng trắng mòn trước cổ phễu (chung 1 texture atlas, sơn bong tróc bằng alphaTest); cọc tiêu phản quang
    buildPortalDetails(K, grp, slabY) {
      const Pt = new Builder(), out = [0, 1, 0];
      const row = i => [1 - i / 3 - 0.012, 1 - (i + 1) / 3 + 0.012];   // dải v của hàng i trong atlas
      for (const sg of [-1, 1]) {
        // rãnh thu nước ngang miệng dốc (trên đỉnh dốc, nước mặt sân không chảy xuống lòng hầm)
        {
          const fa = S.RAMP_END + 0.8, fb = S.RAMP_END + 5.2, rr = cutHalf(fb) - 0.6, y = floorY(fa) + 0.11, [v0, v1] = row(2);
          Pt.quadOut([sg * fa, y, -rr], [sg * fa, y, rr], [sg * fb, y, rr], [sg * fb, y, -rr], [[-rr / 16, v0], [rr / 16, v0], [rr / 16, v1], [-rr / 16, v1]], 1, out);
        }
        // vạch dừng trắng ngang cổ phễu
        {
          const fs = PORTAL.NECK_F - 20, w = portalHalf(fs + 1.6) - 4, [v0, v1] = row(1), n = 8;
          for (let k = 0; k < n; k++) {
            const r0 = -w + 2 * w * k / n, r1 = -w + 2 * w * (k + 1) / n;
            const Y = (f, r) => slabY(sg * f, r) + 0.05;
            Pt.quadOut([sg * (fs - 1.6), Y(fs - 1.6, r0), r0], [sg * (fs - 1.6), Y(fs - 1.6, r1), r1], [sg * (fs + 1.6), Y(fs + 1.6, r1), r1], [sg * (fs + 1.6), Y(fs + 1.6, r0), r0],
              [[r0 / 20, v0], [r1 / 20, v0], [r1 / 20, v1], [r0 / 20, v1]], 1, out);
          }
        }
        // sọc vàng đen trên đỉnh 6 m cuối tường cánh + mặt đầu tường
        for (const sr of [-1, 1]) {
          const [v0, v1] = row(0);
          const top = q => Math.max(0.5, wingLine(q)) + 1.5;
          for (let af = S.END - 48; af < S.END - 0.31; af += 4) {
            const a1 = Math.min(S.END - 0.3, af + 4);
            const e = q => { const t = top(q); return [cutHalf(q) + wingBevel(t, floorY(q) - 2) + 0.3, cutHalf(q) + S.WING_T - 0.3, t + 0.04]; };
            const E0 = e(af), E1 = e(a1);
            Pt.quadOut([sg * af, E0[2], sr * E0[0]], [sg * a1, E1[2], sr * E1[0]], [sg * a1, E1[2], sr * E1[1]], [sg * af, E0[2], sr * E0[1]],
              [[af / 14, v0], [a1 / 14, v0], [a1 / 14, v1], [af / 14, v1]], 1, out);
          }
          const re = cutHalf(S.END), fe = sg * (S.END + 0.05), WB = wingBevel(2.0, floorY(S.END) - 2);
          Pt.quadOut([fe, 0.14, sr * (re + WB)], [fe, 0.14, sr * (re + S.WING_T - 0.3)], [fe, 1.92, sr * (re + S.WING_T - 0.3)], [fe, 1.92, sr * (re + WB)],
            [[(re + WB) / 14, v0], [(re + S.WING_T) / 14, v0], [(re + S.WING_T) / 14, v1], [(re + WB) / 14, v1]], 1, [sg, 0, 0]);
        }
      }
      const paintMat = new THREE.MeshStandardMaterial({ map: portalPaintTex(), alphaTest: 0.45, roughness: 0.78, metalness: 0.12, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
      const paint = new THREE.Mesh(Pt.build(), paintMat);
      paint.receiveShadow = true;
      paint.name = 'stronghold_portal_paint';
      grp.add(paint);
      // Cọc tiêu: thân trắng, đai phản quang đỏ, chóp đen (0,18 x 0,18 x 1,1 m), dọc vai đường vào + 2 góc cổ phễu
      const Po = new Builder();
      const post = (f, r) => {
        const y0 = this.groundLocal(K, f, r) - 0.6, h = 0.7;
        for (const [a, b, col] of [[y0, y0 + 6.4, [0.86, 0.86, 0.82]], [y0 + 6.4, y0 + 7.8, [0.78, 0.1, 0.06]], [y0 + 7.8, y0 + 8.8, [0.12, 0.12, 0.12]]]) {
          const n0 = Po.c.length;
          Po.box(f - h, f + h, a, b, r - h, r + h, 8, { bottom: true });
          for (let i = n0; i < Po.c.length; i += 3) { Po.c[i] = col[0]; Po.c[i + 1] = col[1]; Po.c[i + 2] = col[2]; }
        }
      };
      for (const sg of [-1, 1]) for (const sr of [-1, 1]) {
        post(sg * (PORTAL.NECK_F - 3), sr * (portalHalf(PORTAL.NECK_F - 3) + 3.5));
        for (const d of [14, 62, 110]) post(sg * (PORTAL.NECK_F + d), sr * (PORTAL.ROAD_W / 2 + 4.5));
      }
      const posts = new THREE.Mesh(Po.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.0 }));
      posts.castShadow = true; posts.receiveShadow = true;
      posts.name = 'stronghold_portal_posts';
      grp.add(posts);
    }

    // ---------------------------------------------------------------- cờ chiếm cứ điểm
    buildFlag(K, grp) {
      const poleH = 82;
      const pole = new THREE.Group();
      pole.position.set(-S.HB + 18, S.CREST + 2, S.WI - 14);
      const steel = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.4, metalness: 0.75 });
      const base = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.8, 2.4, 12), new THREE.MeshStandardMaterial({ color: 0x7a7870, roughness: 0.9 }));
      base.position.y = 1.2; pole.add(base);
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.85, poleH, 10), steel);
      shaft.position.y = poleH / 2 + 2; shaft.castShadow = true; pole.add(shaft);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(1.4, 12, 8), new THREE.MeshStandardMaterial({ color: 0xd4b048, roughness: 0.35, metalness: 0.8 }));
      ball.position.y = poleH + 3; pole.add(ball);
      // Vải cờ: lưới 14 x 8 ô, gợn sóng theo gió
      const W = 36, H = 22;
      const geo = new THREE.PlaneGeometry(W, H, 14, 8);
      geo.translate(W / 2 + 0.8, -H / 2, 0);
      const cloth = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: flagTexture(null, K.id), side: THREE.DoubleSide, roughness: 0.85 }));
      cloth.castShadow = true;
      pole.add(cloth);
      grp.add(pole);
      K.flag = { pole, cloth, W, base0: geo.attributes.position.array.slice(), top: poleH + 1, bottom: 6 + H, t: Math.random() * 10, shown: undefined, h: 0 };
      K.capture = 0;          // -100 (đỏ) .. +100 (xanh)
      K.owner = null;
      this.setFlagHeight(K, 0);
    }

    // ---------------------------------------------------------------- tàn tích trận đánh quanh cứ điểm
    // Xác xe bị hạ từ trước trận: mô hình xe thật của game (TankModelBuilder.models — không có mô hình làm lại thì bỏ qua,
    // không dựng xe hộp thay thế) + hư hại thật (VehicleDamage.staticWreck) + vết đạn thật trên vỏ (ExplosionFX) và hố bom
    // lớn nhỏ trên sườn đồi. Vị trí / loại xe / kiểu bị hạ do map_gen chọn theo hạt giống bản đồ (s.wrecks, s.craters)
    buildBattlefieldWrecks(K, s) {
      K.wrecks = [];
      K.craterPlan = (s.craters || []).map(c => ({ c, rec: null }));
      if (typeof TankModelBuilder === 'undefined' || !TankModelBuilder.models) return;
      const G = (x, z) => this.groundAt ? this.groundAt(x, z) : K.G;
      if (!this.wreckRoot) {
        this.wreckRoot = new THREE.Group();
        this.wreckRoot.name = 'stronghold_wrecks';
        this.group.add(this.wreckRoot);
      }
      const UP = new THREE.Vector3(0, 1, 0);
      // [nửa dài thân, bán kính vật cản] theo loại xe
      const FOOT = { ALL_ROUNDER: [30, 14], GATLING: [28, 13], ARTILLERY: [36, 12], SCOUT: [20, 9] };
      // dựng lúc tải dưới nền (opts.deferWrecks): mỗi xác xe là 1 hàng việc nhỏ (dựng mô hình, từng phát lựu pháo giả lập,
      // hoàn tất), terrain gọi stepWrecks() trong ngân sách thời gian mỗi nhịp -> màn chờ không đứng hình cả chục giây
      (s.wrecks || []).forEach((P, i) => {
        const J = this.wreckJobs(K, P, i, G, UP, FOOT);
        if (this.deferWrecks) (this._wreckQueue = this._wreckQueue || []).push(J);
        else drainJobs(J);
      });
    }

    // Làm tiếp các việc dựng xác xe còn chờ: tối đa n việc, dừng sớm khi quá budgetMs; true = đã dựng hết
    stepWrecks(n = 1, budgetMs = Infinity) {
      const Q = this._wreckQueue, t0 = performance.now();
      while (Q && Q.length && n > 0) {
        const J = Q[0];
        if (!J.length) { Q.shift(); continue; }
        const f = J.shift();
        try { if (f() === false) J.unshift(f); } catch (err) { console.warn('[STRONGHOLD] wreck error:', err); J.length = 0; }
        n--;
        if (performance.now() - t0 > budgetMs) break;
      }
      while (Q && Q.length && !Q[0].length) Q.shift();
      return !Q || !Q.length;
    }

    // Hàng việc dựng 1 xác xe (việc trả false = gọi lại lần sau). Có xác cùng loại / phe / kiểu bị hạ còn nguyên trong bể
    // (bản đồ trước, chưa bị bắn) thì chỉ đặt lại chỗ — khỏi dựng mô hình + giả lập lựu pháo (~0,5 s mỗi xác)
    wreckJobs(K, P, i, G, UP, FOOT) {
      const jobs = [];
      if (!TankModelBuilder.models[P.type]) return jobs;
      let seed = P.seed >>> 0 || 1;
      const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
      const W = { u: null, P, rnd, K, ring: null, turret: null, marks: [], dressed: false };
      jobs.push(() => {
        // lấy từ bể lúc chạy việc (không phải lúc xếp hàng): bản đồ bị dọn trước khi tới lượt thì xác vẫn còn trong bể
        const E = takePooledWreck(P);
        if (E) { jobs.length = 0; this.reuseWreck(K, P, i, G, UP, FOOT, W, E); return; }
        const u = { id: 'sh_wreck_' + K.id + '_' + i, team: P.team, tankType: P.type, scene: this.wreckRoot };
        try { TankModelBuilder.buildModel(u); } catch (err) { console.warn('[STRONGHOLD] wreck model error:', err); jobs.length = 0; return; }
        W.u = u;
        if (u.hpGroup && u.hpGroup.parent) u.hpGroup.parent.remove(u.hpGroup);
        if (u.reactiveArmorMesh && u.reactiveArmorMesh.parent) u.reactiveArmorMesh.parent.remove(u.reactiveArmorMesh);
        // thân xe bám theo mặt dốc
        const base = wreckBase(P, G, UP);
        base.decompose(u.group.position, u.group.quaternion, u.group.scale);
        u.x = P.x; u.y = G(P.x, P.z); u.z = P.z; u.bodyAngle = P.angle;
        u.group.updateMatrixWorld(true);
        W.base = base;
        const tg = u.turretGroup;
        if (P.turret && tg) {
          // nổ kho đạn thổi bay tháp: tháp nằm lật nghiêng trên đất cạnh thân, lộ lỗ vòng tháp cháy đen
          W.ring = tg.getWorldPosition(new THREE.Vector3());
          W.ringBase = W.ring.clone().applyMatrix4(base.clone().invert());
          tg.parent.remove(tg);
          this.wreckRoot.add(tg);
          placeLooseTurret(tg, P.turret, G);
          u.fxWreck = { turret: tg };   // VehicleDamage: tháp đã rời thân (không gục / dò nòng trên thân)
          W.turret = tg;
        } else if (tg) {
          tg.rotation.y += P.tRot || 0;
        }
        if (typeof VehicleDamage !== 'undefined' && (VehicleDamage.staticWreckJobs || VehicleDamage.staticWreck)) {
          // từng phát lựu pháo giả lập là 1 việc riêng (~50 ms)
          let sub = null;
          try { sub = VehicleDamage.staticWreckJobs ? VehicleDamage.staticWreckJobs(u, { kill: P.kill, rnd }) : (VehicleDamage.staticWreck(u, { kill: P.kill, rnd }), null); }
          catch (err) { console.warn('[STRONGHOLD] wreck damage error:', err); }
          if (sub) jobs.unshift(() => {
            if (!sub.length) return;
            try { sub.shift()(); } catch (err) { console.warn('[STRONGHOLD] wreck damage error:', err); sub.length = 0; }
            return sub.length ? false : undefined;
          });
        }
      });
      jobs.push(() => {
        const u = W.u;
        if (!u) return;
        const tg = u.turretGroup;
        if (!P.turret && tg && tg.parent) this.seatTurret(u, tg);
        const R = (a, b) => a + rnd() * (b - a);
        // sơn cháy sém đen muội (như ExplosionFX.applyChar của xe bị hạ thật), tắt đèn / vải phe / chớp lửa nòng
        // cháy sém sẫm nhưng không đen thui: còn lờ mờ mảng sơn, muội, gỉ và chỗ móp (cháy rụi / nổ kho đạn sém nhất)
        const ch = { det: R(0.84, 0.93), burn: R(0.86, 0.95), blast: R(0.78, 0.88), crew: R(0.72, 0.82) }[P.kill] || 0.8, f = 1 - 0.84 * ch;
        const seen = new Set();
        const charObj = root => root.traverse(o => {
          if (!o.isMesh || o.userData.isFxDecal) return;
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of mats) {
            if (!m) continue;
            if (m.isMeshBasicMaterial) { if (m.transparent || (m.color && m.color.r + m.color.g + m.color.b > 1.2)) o.visible = false; continue; }
            if (seen.has(m)) continue;
            seen.add(m);
            if (m.emissive && m.emissiveIntensity > 0) m.emissiveIntensity = 0;
            if (m.blending === THREE.AdditiveBlending || (m.userData && m.userData.surface === 'glass') || !m.color) continue;
            m.color.setRGB(m.color.r * f + 0.03 * ch, m.color.g * f + 0.025 * ch, m.color.b * f + 0.02 * ch);
          }
          // chi tiết rất nhỏ không đổ bóng (như xe trong trận, spg.js)
          if (o.castShadow && !o.isInstancedMesh && o.geometry) {
            if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
            if (o.geometry.boundingSphere && o.geometry.boundingSphere.radius * Math.max(o.scale.x, o.scale.y, o.scale.z) < 1.6) o.castShadow = false;
          }
        });
        charObj(u.group);
        if (W.turret) charObj(W.turret);
        // thế thân sau hư hại (lún, nghiêng) so với thế đặt ban đầu -> đặt lại y hệt ở bản đồ khác (reuseWreck)
        u.group.updateMatrix();
        W.off = W.base.clone().invert().multiply(u.group.matrix);
        this.finishWreck(K, W, FOOT);
      });
      return jobs;
    }

    // Xác lấy từ bể: đặt thân theo dốc chỗ mới (giữ nguyên độ lún / nghiêng do hư hại), tháp văng đặt theo bản đồ mới.
    // Vết đạn trên vỏ đã gỡ lúc cất vào bể -> updateWreckFX dán lại theo hạt giống của xác ở chỗ mới
    reuseWreck(K, P, i, G, UP, FOOT, W, E) {
      const u = E.u;
      W.u = u; W.turret = E.turret; W.off = E.off; W.ringBase = E.ringBase;
      u.id = 'sh_wreck_' + K.id + '_' + i;
      u.scene = this.wreckRoot;
      const base = W.base = wreckBase(P, G, UP);
      base.clone().multiply(E.off).decompose(u.group.position, u.group.quaternion, u.group.scale);
      this.wreckRoot.add(u.group);
      u.x = P.x; u.y = G(P.x, P.z); u.z = P.z; u.bodyAngle = P.angle;
      u.group.updateMatrixWorld(true);
      W.ring = E.ringBase ? E.ringBase.clone().applyMatrix4(base) : null;
      if (W.turret) { this.wreckRoot.add(W.turret); placeLooseTurret(W.turret, P.turret, G); }
      this.finishWreck(K, W, FOOT);
    }

    finishWreck(K, W, FOOT) {
      const { u, P } = W;
      // khói bốc từ khoang máy (đuôi xe, +Z) / lỗ vòng tháp
      const sp = W.ring ? W.ring.clone() : u.group.localToWorld(new THREE.Vector3(0, 10, 12));
      W.sx = sp.x; W.sy = sp.y + 4; W.sz = sp.z;
      // vật cản: 3 vòng dọc trục thân + tháp văng
      const [half, rad] = FOOT[P.type] || FOOT.ALL_ROUNDER;
      const ax = Math.sin(P.angle), az = Math.cos(P.angle);
      if (this.boulders) {
        for (const k of [-0.55, 0, 0.55]) this.boulders.push({ x: P.x + ax * half * k, z: P.z + az * half * k, radius: rad, height: 13, wreck: true });
        if (P.turret) this.boulders.push({ x: P.turret.x, z: P.turret.z, radius: 10, height: 9, wreck: true });
      }
      K.wrecks.push(W);
    }

    // Trước khi dọn bản đồ (terrain.clearTerrain): xác chưa bị bắn trong trận cất vào bể cho bản đồ sau. Gỡ vết đạn dán
    // trên vỏ (bản ghi của ExplosionFX), mở khoá ma trận, tách khỏi cây cảnh -> không bị huỷ cùng bản đồ cũ
    releaseWrecks() {
      this._wreckQueue = null;
      const g = typeof window !== 'undefined' ? window.game : null;
      const fx = g && g.effectsManager && g.effectsManager.fx;
      for (const K of this.items) for (const W of K.wrecks || []) {
        const u = W.u;
        if (W.thawed || !u || !u.group || !W.off) continue;
        if (fx && fx.surfaceMarks && fx.removeSurfaceMark) {
          for (let k = fx.surfaceMarks.length - 1; k >= 0; k--) if (fx.surfaceMarks[k].unit === u) fx.removeSurfaceMark(k);
        }
        for (const root of [u.group, W.turret]) {
          if (!root) continue;
          root.traverse(o => { o.matrixAutoUpdate = true; });
          if (root.parent) root.parent.remove(root);
        }
        putPooledWreck(W.P, { u, turret: W.turret, off: W.off, ringBase: W.ringBase || null });
        W.u = null;
      }
      for (const K of this.items) if (K.wrecks) K.wrecks = K.wrecks.filter(W => W.u);
    }

    // Phát trúng ngẫu nhiên lên vỏ xác xe (từ ngoài vào, chếch xuống)
    // Nổ / đạn trúng xác tàn tích: chuỗi phá xác của VehicleDamage (móp, xé mảng vỏ, cong / gãy nòng, đứt xích, rã dần qua
    // các nấc tới nát bét). Xác đã khoá ma trận (dựng xong vết đạn) thì mở lại để bộ phận bị xô / sụp hiện đúng chỗ
    damageWrecks(x, y, z, ammo, heavy, fx) {
      if (typeof VehicleDamage === 'undefined' || !VehicleDamage.wreckBlastAt || !Number.isFinite(y)) return;
      const A = typeof Destructibles !== 'undefined' && Destructibles.ammoInfo ? Destructibles.ammoInfo(ammo, heavy) : { power: 1, radius: 20 };
      const reach = 60 + A.radius;
      for (const K of this.items) for (const W of K.wrecks || []) {
        if (!W.u || Math.abs(W.sx - x) > reach || Math.abs(W.sz - z) > reach) continue;
        if (!W.thawed) { W.thawed = true; W.u.group.traverse(o => { o.matrixAutoUpdate = true; }); }
        VehicleDamage.wreckBlastAt(W.u, x, y, z, A, ammo, heavy, fx);
      }
    }

    // Thân xác bị võng / sụp (VehicleDamage.crushHull) mà tháp giữ nguyên độ cao -> hở khe dưới tháp nhìn xuyên qua được.
    // Dò tia từ trên xuống quanh trục tháp: đáy tháp (lần trúng tháp cuối) tới nóc thân ngay dưới; hạ tháp theo khe nhỏ nhất
    // (tì lên chỗ nóc cao nhất)
    seatTurret(u, tg) {
      u.group.updateMatrixWorld(true);
      const hull = [];
      u.group.traverse(m => {
        if (!m.isMesh || !m.visible || m.userData.isFxDecal) return;
        for (let p = m; p; p = p.parent) if (p === tg) return;
        hull.push(m);
      });
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(tg.parent.getWorldQuaternion(new THREE.Quaternion()));
      const c = tg.getWorldPosition(new THREE.Vector3()), down = up.clone().negate();
      const t1 = new THREE.Vector3(1, 0, 0).applyQuaternion(tg.getWorldQuaternion(new THREE.Quaternion())), t2 = new THREE.Vector3().crossVectors(up, t1);
      const rc = new THREE.Raycaster();
      let gap = Infinity;
      for (const r of [0, 4, 7]) for (let a = 0; a < (r ? 8 : 1); a++) {
        const an = a / 8 * Math.PI * 2;
        const o = c.clone().addScaledVector(t1, Math.cos(an) * r).addScaledVector(t2, Math.sin(an) * r).addScaledVector(up, 30);
        rc.set(o, down); rc.far = 60;
        const ht = rc.intersectObject(tg, true).filter(h => h.object.visible && !h.object.userData.isFxDecal);
        if (!ht.length) continue;
        const bot = ht[ht.length - 1].distance;
        // lần trúng thân đầu tiên = mặt nóc (vòng bi thòng ăn vào nóc thì khe âm: tháp đã tì, không hạ)
        const hh = rc.intersectObjects(hull, false)[0];
        if (hh) gap = Math.min(gap, hh.distance - bot);
      }
      if (!(gap > 0.05 && gap < 6)) return;
      tg.position.addScaledVector(tg.parent.worldToLocal(c.clone().addScaledVector(down, gap)).sub(tg.parent.worldToLocal(c.clone())), 1);
      tg.updateMatrixWorld(true);
    }

    wreckHit(fx, W, top) {
      const { u, rnd } = W, R = (a, b) => a + rnd() * (b - a);
      for (let t = 0; t < 6; t++) {
        const a = rnd() * Math.PI * 2;
        const dir = top ? new THREE.Vector3(R(-0.3, 0.3), -1, R(-0.3, 0.3)).normalize() : new THREE.Vector3(Math.cos(a), R(-0.6, -0.05), Math.sin(a)).normalize();
        const target = u.group.localToWorld(new THREE.Vector3(R(-7, 7), R(5, 12), R(-20, 20)));
        const h = fx.hitUnitSurface(u, target.clone().addScaledVector(dir, -60), dir, 120);
        if (h) return h;
      }
      return null;
    }

    // Vết đạn trên xác xe (cần hệ hiệu ứng nên dựng khi trận chạy): lỗ xuyên + hố giáp + cháy sém, rỗ đạn nhỏ / mảnh
    // văng, muội cháy quanh nóc, than hồng âm ỉ (xác còn cháy), lỗ vòng tháp (tháp bị thổi bay). Mỗi vết dò mặt vỏ bằng
    // tia (mô hình xe thật nhiều chi tiết) -> xếp thành hàng việc, mỗi khung làm vài việc trong ngân sách thời gian
    wreckMarkJobs(fx, W) {
      const { u, rnd, P } = W, R = (a, b) => a + rnd() * (b - a);
      const keep = { unit: u, keep: true };
      const cool = rec => { if (rec) { rec.glow = 0; if (rec.mat && rec.mat.emissiveIntensity !== undefined) rec.mat.emissiveIntensity = 0; W.marks.push(rec); } return rec; };
      const add = (h, kind, size) => (h ? cool(fx.addSurfaceMark(h.point, h.normal, h.object, kind, size, keep)) : null);
      const jobs = [];
      if (W.ring && u.hullMainMesh) jobs.push(() => {
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(u.group.quaternion);
        const rc = new THREE.Raycaster(W.ring.clone().addScaledVector(up, 8), up.clone().negate(), 0, 20);
        const hit = rc.intersectObject(u.hullMainMesh, false)[0];
        cool(fx.addSurfaceMark(hit ? hit.point : W.ring.clone(), up, u.hullMainMesh, 'turretRing', { GATLING: 20, ARTILLERY: 19 }[P.type] || 22, keep));
      });
      const nPen = (P.kill === 'det' || P.kill === 'blast' ? 5 : 3) + Math.floor(rnd() * 3);
      for (let k = 0; k < nPen; k++) jobs.push(() => {
        const h = this.wreckHit(fx, W), big = rnd() < 0.5;
        add(h, 'penetration', big ? R(3.2, 3.8) : R(2.6, 3.1));
        add(h, 'armorCrater', big ? R(4.2, 4.8) : R(3.4, 4));
        if (rnd() < 0.65) add(h, 'scorch', R(5, 8));
      });
      // đạn nảy / nổ trên giáp không thủng
      for (let k = 0, n = 9 + Math.floor(rnd() * 5); k < n; k++) jobs.push(() => {
        const h = this.wreckHit(fx, W);
        add(h, 'armorCrater', R(3, 4.2));
        if (rnd() < 0.5) add(h, 'scorch', R(4, 6));
      });
      // rỗ đạn súng máy / mảnh văng
      for (let k = 0, n = 50 + Math.floor(rnd() * 25); k < n; k++) jobs.push(() => add(this.wreckHit(fx, W), rnd() < 0.6 ? 'steelDent' : 'heiSplash', R(1.4, 2.6)));
      // muội đen loang trên nóc (lửa cháy trong khoang trùm lên)
      for (let k = 0, n = P.kill === 'crew' ? 1 : 3; k < n; k++) jobs.push(() => add(this.wreckHit(fx, W, true), 'scorch', R(8, 13)));
      // xác còn cháy âm ỉ: than hồng lập lòe ở lỗ thủng
      if (P.kill === 'burn') for (let k = 0; k < 2; k++) jobs.push(() => {
        const g = add(this.wreckHit(fx, W, true), 'burnGlow', R(2.4, 3.4));
        if (g && g.mat) g.mat.emissiveIntensity = R(0.8, 1.3);
      });
      // xong: xác xe đứng yên, khóa ma trận (bớt tính lại cây mô hình mỗi khung)
      jobs.push(() => {
        const freeze = root => root.traverse(o => { o.updateMatrix(); o.matrixAutoUpdate = false; });
        if (!W.thawed) freeze(u.group);   // đã bị bắn (damageWrecks): bộ phận còn xô / sụp, không khoá
        if (W.turret) freeze(W.turret);
        W.dressed = true;
      });
      u.group.updateMatrixWorld(true);
      return jobs;
    }

    // Hố bom tàn tích: hố cố định (không bị hố mới thay chỗ), dựng lại nếu hệ hiệu ứng bị dọn (trận mới)
    placeBattleCrater(fx, C) {
      const c = C.c;
      const pal = fx.surfacePalette ? fx.surfacePalette(c.x, c.z, 'GROUND') : (fx.palette ? fx.palette('GROUND') : null);
      C.rec = fx.addCrater(c.x, c.z, c.R, pal, 1, { x: Math.cos(c.a), y: -1, z: Math.sin(c.a) }, 'NORMAL', { persistent: true, bowlDepth: c.d, rough: 0.6 }) || false;
    }

    // Đường ngắm (x1,z1)-(x2,z2) xuyên qua cột khói âm ỉ của xác xe tàn tích (TeamIntel): khói tụ quanh xác + dải khói
    // ngả theo gió. Ở sát nhau (< 60) vẫn nhận ra nhau
    smokeBlocks(x1, z1, x2, z2) {
      const dx = x2 - x1, dz = z2 - z1, L2 = dx * dx + dz * dz;
      if (L2 < 3600) return false;
      const w = (typeof window !== 'undefined' && window.game && window.game.ballistics && window.game.ballistics.wind) || null;
      const wl = w ? Math.hypot(w.vx || 0, w.vz || 0) : 0, ux = wl > 0.5 ? w.vx / wl : 0, uz = wl > 0.5 ? w.vz / wl : 0;
      const hit = (cx, cz, r) => {
        let k = ((cx - x1) * dx + (cz - z1) * dz) / L2;
        k = Math.max(0, Math.min(1, k));
        const px = x1 + dx * k - cx, pz = z1 + dz * k - cz;
        return px * px + pz * pz < r * r;
      };
      for (const K of this.items) for (const W of K.wrecks || []) {
        if (hit(W.sx, W.sz, 26)) return true;
        if (wl > 0.5 && hit(W.sx + ux * 45, W.sz + uz * 45, 30)) return true;
      }
      return false;
    }

    updateWreckFX(dt) {
      const fx = (window.game && window.game.effectsManager && window.game.effectsManager.fx) || null;
      if (!fx) return;
      // dựng dần tàn tích cần hệ hiệu ứng (tránh giật hình lúc vào trận): vết đạn trong ngân sách ~4 ms / khung, hố bom
      // mỗi khung một hố
      this._battleChk = (this._battleChk || 0) - dt;
      let busy = false;
      for (const K of this.items) {
        for (const W of K.wrecks || []) {
          if (W.dressed) continue;
          if (!fx.hitUnitSurface || !fx.addSurfaceMark) { W.dressed = true; continue; }
          // cây dò tia (BVH) của mô hình xác dựng trước lúc trình duyệt rảnh: trước đây dựng đồng bộ ngay trong việc dán
          // vết (mỗi lưới tới ~8 ms, vượt ngân sách 4 ms / khung -> khựng đầu trận). Hàng dựng còn việc thì chờ
          const RB = typeof window !== 'undefined' && window.RaycastBVH;
          if (RB && !W.bvhWarm) { W.bvhWarm = true; if (W.u && W.u.group) RB.warm(W.u.group); }
          if (RB && RB.stats().queued > 0) { busy = true; break; }
          if (!W.jobs) W.jobs = this.wreckMarkJobs(fx, W);
          const t0 = performance.now();
          while (W.jobs.length && performance.now() - t0 < 4) W.jobs.shift()();
          busy = true;
          break;
        }
        if (busy) break;
        for (const C of K.craterPlan || []) {
          if (C.rec === null || (C.rec && this._battleChk <= 0 && !fx.craters.includes(C.rec))) { if (fx.addCrater) this.placeBattleCrater(fx, C); busy = true; break; }
        }
        if (busy) break;
      }
      if (this._battleChk <= 0) this._battleChk = 3;
      if (!fx.smoke) return;

      this._wreckFxAcc = (this._wreckFxAcc || 0) + dt;
      if (this._wreckFxAcc < 0.1) return;
      this._wreckFxAcc = 0;
      const cam = window.game && window.game.camera;
      const wind = fx.windNow ? fx.windNow() : { x: 4, z: 2 };
      for (const K of this.items) {
        for (const W of K.wrecks || []) {
          const d = cam ? Math.hypot(cam.position.x - W.sx, cam.position.z - W.sz) : 0;
          if (d > 2600) continue;
          // khói âm ỉ dày cuộn thấp quanh xác rồi ngả theo gió: bông khói to, ít hạt, sống lâu — che tầm nhìn (smokeBlocks)
          if (Math.random() < (d < 1500 ? 0.3 : 0.12)) {
            const g = 0.07 + Math.random() * 0.06;
            fx.smoke.add({
              x: W.sx + (Math.random() - 0.5) * 8, y: W.sy, z: W.sz + (Math.random() - 0.5) * 8,
              vx: (wind.x || 0) * 0.7 + (Math.random() - 0.5) * 5, vy: 7 + Math.random() * 7, vz: (wind.z || 0) * 0.7 + (Math.random() - 0.5) * 5,
              size: 16 + Math.random() * 10, grow: 11, drag: 0.4, grav: -2.5, life: 12 + Math.random() * 5, alpha: 0.72, fadeIn: 0.3,
              c0: [g, g, g], c1: [g * 2.4, g * 2.3, g * 2.2], cell: 0
            });
          }
          // lửa le lói trong khoang (chỉ thấy khi lại gần)
          if (W.P.kill === 'burn' && fx.fire && d < 900 && Math.random() < 0.25) {
            fx.fire.add({
              x: W.sx + (Math.random() - 0.5) * 3, y: W.sy - 3, z: W.sz + (Math.random() - 0.5) * 3,
              vx: (Math.random() - 0.5) * 3, vy: 4 + Math.random() * 5, vz: (Math.random() - 0.5) * 3,
              size: 2.5 + Math.random() * 2, grow: 1.5, drag: 1.5, grav: -2, life: 0.45 + Math.random() * 0.35, alpha: 0.85, fadeIn: 0.02,
              c0: [1.0, 0.5, 0.1], c1: [0.55, 0.12, 0.02], cell: 1
            });
          }
        }
      }
    }
    setFlagHeight(K, k) {
      const F = K.flag;
      F.cloth.position.y = F.bottom + (F.top - F.bottom) * k;
    }
    // Xe đang đứng trong vùng chiếm (khoang + dốc ra vào)
    // Trạng thái cờ do chủ phòng gửi: [[id, tiến độ -100..100, chủ 'BLUE' | 'RED' | '']]
    applyCaptureState(list) {
      this.remoteCapture = true;
      for (const [id, cap, own] of list) {
        const K = this.items.find(k => k.id === id);
        if (!K) continue;
        K.capture = Math.max(-100, Math.min(100, Number(cap) || 0));
        const owner = own || null;
        if (owner !== K.owner) {
          const old = K.owner;
          K.owner = owner;
          if (this.onCapture) this.onCapture(K, owner, old);
        }
      }
    }

    inCaptureZone(K, x, z) {
      const L = this.local(K, x, z), af = Math.abs(L.f);
      return af < S.ZONE_END && Math.abs(L.r) < cutHalf(af) + 6;
    }

    /**
     * Chiếm cứ điểm: phe đông xe hơn trong khoang / dốc ra vào kéo tiến độ về phía mình; chiếm xong cờ phe mình tự kéo lên
     * đỉnh. Phe kia vào chiếm lại: cờ cũ hạ dần xuống, mất chủ thì cờ trắng dưới chân cột. Gọi mỗi khung hình.
     */
    updateCapture(units, dt) {
      for (const K of this.items) {
        let blue = 0, red = 0;
        for (const u of units || []) {
          if (!u || u.isDead) continue;
          if (Math.abs(u.x - K.x) > S.REACH || Math.abs(u.z - K.z) > S.REACH) continue;
          if (!this.inCaptureZone(K, u.x, u.z)) continue;
          if (u.team === 'BLUE') blue++; else if (u.team === 'RED') red++;
        }
        // Phe ĐÔNG XE HƠN trong vùng kéo cờ về phía mình (~10 s với hơn 1 xe, hơn 2+ xe nhanh gấp rưỡi);
        // hai phe bằng số xe: đứng yên. (Trước đây có mặt cả 2 phe là đóng băng hẳn: xe 2 phe cùng nấp trong hầm
        // bê tông, không ai bắn thủng được ai -> cứ điểm kẹt "tranh chấp" cả trận)
        const rate = 10;
        const net = blue - red;
        if (net > 0) K.capture = Math.min(100, K.capture + rate * (net > 1 ? 1.5 : 1) * dt);
        else if (net < 0) K.capture = Math.max(-100, K.capture - rate * (net < -1 ? 1.5 : 1) * dt);
        K.contested = !!(blue && red);
        K.blueIn = blue; K.redIn = red;
        let owner = K.owner;
        if (K.capture >= 100) owner = 'BLUE';
        else if (K.capture <= -100) owner = 'RED';
        else if ((owner === 'BLUE' && K.capture <= 0) || (owner === 'RED' && K.capture >= 0)) owner = null;
        // Chơi mạng, máy không phải chủ phòng: cờ vẫn kéo mượt tại chỗ nhưng ĐỔI CHỦ chỉ theo chủ phòng (applyCaptureState)
        if (this.remoteCapture) owner = K.owner;
        if (owner !== K.owner) {
          const old = K.owner;
          K.owner = owner;
          if (this.onCapture) this.onCapture(K, owner, old);
        }
        // Cờ trên cột theo CHỦ cứ điểm (không theo tiến độ chiếm dở):
        //  - đang bị phe kia chiếm: cờ chủ cũ hạ dần theo tiến độ; về 0 (mất chủ) thì cờ trắng nằm dưới chân cột
        //  - đang chiếm dở cứ điểm trống: cờ trắng vẫn nằm dưới chân cột
        //  - chiếm xong (đổi chủ): cờ phe mới tự kéo lên đỉnh (~2 s)
        //  Đổi cờ khác phe: hạ cờ cũ xuống chân cột trước rồi mới thay
        const F = K.flag, want = K.owner || null;
        let target = 0;
        if (want) target = Math.max(0, K.capture * (want === 'BLUE' ? 1 : -1)) / 100;
        if (want !== F.shown) {
          target = 0;
          if (F.h <= 0.02) {
            F.shown = want;
            F.cloth.material.map = flagTexture(want, K.id);
            F.cloth.material.needsUpdate = true;
          }
        }
        const dh = target - F.h;
        F.h += dh > 0 ? Math.min(dh, 0.45 * dt) : Math.max(dh, -0.8 * dt);
        this.setFlagHeight(K, F.h);
      }
      this.waveFlags(dt);
      this.updateWreckFX(dt);
    }
    waveFlags(dt) {
      const bw = (typeof window !== 'undefined' && window.game && window.game.ballistics && window.game.ballistics.wind);
      const gst = (typeof Weather !== 'undefined' && Weather.gust ? Weather.gust() : null);
      const wx = (bw ? bw.vx || 0 : 3.5) + (gst ? gst.x || 0 : 0);
      const wz = (bw ? bw.vz || 0 : 2.0) + (gst ? gst.z || 0 : 0);
      const windSpd = Math.hypot(wx, wz) || 4.0;
      const windAng = Math.atan2(wz, wx);
      const windNorm = Math.min(2.5, windSpd / 6.5);
      // cờ lớn (~4 m) vẫy chậm: sóng vải ~0,5-1,2 lần/giây (trước 3,6 + 4,8 x gió rad/s -> phần phật như quay nhanh)
      const freq = 2.0 + 2.2 * Math.min(1.6, windNorm);
      const waveAmp = 0.9 + 1.4 * Math.min(1.4, windNorm);
      const droop = Math.max(0.2, 2.2 * (1.15 - Math.min(1.0, windNorm * 1.1)));

      for (const K of this.items) {
        const F = K.flag;
        if (!F) continue;
        F.t += dt;

        // Lá cờ xoay xuôi theo hướng gió thổi (cứ điểm có góc xoay K.angle)
        const targetRotY = windAng - (K.angle || 0);
        let dAng = (targetRotY - F.cloth.rotation.y) % (Math.PI * 2);
        if (dAng > Math.PI) dAng -= Math.PI * 2;
        if (dAng < -Math.PI) dAng += Math.PI * 2;
        F.cloth.rotation.y += dAng * Math.min(1.0, dt * 4.0);

        const pos = F.cloth.geometry.attributes.position, a = pos.array, b = F.base0;
        for (let i = 0; i < a.length; i += 3) {
          const x = b[i], y = b[i + 1], k = Math.min(1.0, Math.max(0.0, x / F.W));
          const kWave = Math.pow(k, 1.2);
          const w1 = Math.sin(x * 0.22 - F.t * freq + y * 0.05) * (2.2 * waveAmp) * kWave;
          const w2 = Math.sin(x * 0.55 - F.t * (freq * 1.6) + y * 0.15) * (0.6 * waveAmp) * kWave;
          const w3 = Math.sin(x * 0.85 - F.t * (freq * 2.1)) * (0.35 * windNorm) * kWave;
          a[i + 2] = w1 + w2 + w3;
          a[i + 1] = y - kWave * kWave * droop + Math.sin(x * 0.3 - F.t * 2.4) * (0.35 * windNorm) * k;
          a[i] = x - Math.abs(a[i + 2]) * 0.12 * kWave;
        }
        pos.needsUpdate = true;
        F.cloth.geometry.computeVertexNormals();
      }
    }

    buildMound(K) {
      const st = 4;
      const F = Math.ceil((S.END + 12) / st) * st, R = Math.ceil((S.WO + S.RUN + 12) / st) * st;
      const nf = Math.round(2 * F / st) + 1, nr = Math.round(2 * R / st) + 1;
      const pal = EARTH[this.mapType] || EARTH.HIGHLAND;
      // Có shader mặt đất: ụ đất lấy đúng vật liệu địa hình (cỏ / đất / đá theo độ dốc như sườn đồi thật), màu đỉnh = trắng
      // (giữ thuộc tính màu đỉnh cho vết cháy sém, xem EnvDamage.scorchMound)
      const gMat = this.groundMat(true);
      // hệ số nhân màu mặt đất -> đất trơ (sa mạc: cát đã gần màu đất, chỉ sẫm nhẹ)
      const soilMul = this.mapType === 'DESERT' ? [0.98, 0.93, 0.86] : this.mapType === 'URBAN' ? [1.02, 0.88, 0.74] : [1.1, 0.86, 0.66];
      const pos = new Float32Array(nf * nr * 3), uv = new Float32Array(nf * nr * 2), col = new Float32Array(nf * nr * 3);
      const keep = new Uint8Array(nf * nr);
      const hAt = (f, r) => { const h = moundH(f, r); return h === null ? -1.2 : h; };
      for (let j = 0; j < nr; j++) for (let i = 0; i < nf; i++) {
        const f = -F + i * st, r = -R + j * st, k = j * nf + i;
        const af = Math.abs(f), ar = Math.abs(r);
        const h = hAt(f, r);
        pos[k * 3] = f; pos[k * 3 + 1] = h; pos[k * 3 + 2] = r;
        const w = { x: K.x + K.fx * f + K.rx * r, z: K.z + K.fz * f + K.rz * r };
        if (gMat) { const t = this.mapUV(w.x, w.z); uv[k * 2] = t[0]; uv[k * 2 + 1] = t[1]; }
        else { uv[k * 2] = w.x / 32; uv[k * 2 + 1] = w.z / 32; }
        // Bỏ đỉnh nằm trong kênh xe chạy (mép lưới răng cưa nằm khuất trong bề dày tường cánh)
        keep[k] = (af > S.HB - 2 && ar < cutHalf(Math.max(af, S.HB)) + S.WING_T * 0.5 && af < S.END + 6) ? 0 : 1;
        if (af < S.HB && ar < S.WO) keep[k] = 0;   // vùng mái: lớp đất phủ thuộc nhóm mái
        // dải đất trơ sát bê tông (chân mặt ngoài tường cánh, mép tấm mái): nước mưa từ bê tông chảy xuống xói, cỏ không
        // bén rễ -> đất lộ ra, mép lởm chởm
        let dW = Infinity;
        if (af > S.HB && af < S.END) dW = ar - cutHalf(af) - S.WING_T;
        if (af < S.HB + 4 && ar >= S.WO) dW = Math.min(dW, ar - S.WO);
        const bn = vnoise(f / 7 + 1.3, r / 7 - 4.1);
        const bare = dW < 0 ? 1 : clamp01(1 - (dW - 3 - 7 * bn) / (5 + 8 * vnoise(f / 23, r / 23))) * (0.55 + 0.45 * bn);
        if (gMat) {
          const m = soilMul;
          col[k * 3] = 1 + (m[0] - 1) * bare; col[k * 3 + 1] = 1 + (m[1] - 1) * bare; col[k * 3 + 2] = 1 + (m[2] - 1) * bare;
          continue;
        }
        // Màu: đỉnh / chỗ thoải xanh cỏ, sườn dốc lộ đất, chân ụ hòa vào nền
        const sl = Math.abs(hAt(f + 2, r) - hAt(f - 2, r)) / 4 + Math.abs(hAt(f, r + 2) - hAt(f, r - 2)) / 4;
        const blot = (vnoise(f / 60 + 3.1, r / 60 - 1.7) - 0.5) * 2.2;
        const dirt = clamp01((sl - 0.4) * 1.5 + 0.18 * blot);
        const toe = clamp01(1 - h / 8);
        const v = 0.96 + 0.05 * blot;
        for (let c = 0; c < 3; c++) {
          let x = pal.grass[c] + (pal.dirt[c] - pal.grass[c]) * Math.max(dirt, bare * 0.85);
          x = x + (pal.toe[c] - x) * toe * 0.7;
          col[k * 3 + c] = x / 255 * v * 1.35;
        }
      }
      const idx = [];
      for (let j = 0; j < nr - 1; j++) for (let i = 0; i < nf - 1; i++) {
        const a = j * nf + i, b = a + 1, c = a + nf, d = c + 1;
        if (!keep[a] || !keep[b] || !keep[c] || !keep[d]) continue;
        idx.push(a, c, b, b, c, d);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, gMat || new THREE.MeshStandardMaterial({ map: earthMap(), vertexColors: true, roughness: 0.97, metalness: 0 }));
      // màu đỉnh là hệ số nhân (1 = màu mặt đất) -> vết cháy sém cần bù để không quá đen
      if (gMat) g.userData.tintMul = true;
      // Ụ đất chỉ nhận bóng (tự đổ bóng lên chính nó gây sọc răng cưa trên mặt dốc thoải)
      m.castShadow = false; m.receiveShadow = true;
      m.name = 'stronghold_mound';
      // Bụi cỏ / cây bụi lúp xúp trên ụ đất
      const grp = new THREE.Group();
      grp.add(m);
      const rnd = rngOf((K.id.charCodeAt(0) || 65) * 977);
      const bushGeo = new THREE.IcosahedronGeometry(1, 0);
      const bp = bushGeo.attributes.position;
      for (let i = 0; i < bp.count; i++) bp.setY(i, Math.max(-0.2, bp.getY(i) * 0.65));
      bushGeo.computeVertexNormals();
      const nB = 46, nW = 28;
      const im = new THREE.InstancedMesh(bushGeo, new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true }), nB + nW);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
      let cnt = 0;
      for (let t = 0; t < 400 && cnt < nB; t++) {
        const f = (rnd() * 2 - 1) * (S.END + 4), r = (rnd() * 2 - 1) * (S.WO + S.RUN - 6);
        const af = Math.abs(f), ar = Math.abs(r);
        if (af > S.HB - 4 && ar < cutHalf(Math.max(af, S.HB)) + S.WING_T + 6) continue;
        if (af < S.HB + 6 && ar < S.WO + 6) continue;   // không mọc trên mái (mái mờ đi khi nhìn xuyên vào hầm)
        const h = moundH(f, r);
        if (h === null || h < 2) continue;
        const sc = 2.2 + rnd() * 3.2;
        e.set(0, rnd() * 6.28, 0);
        m4.compose(new THREE.Vector3(f, h - 0.4, r), q.setFromEuler(e), new THREE.Vector3(sc * (1 + rnd() * 0.6), sc * (0.6 + rnd() * 0.5), sc));
        im.setMatrixAt(cnt, m4);
        // bụi cùng màu lá với bụi cây trên địa hình của map
        const bc = this.leafColors ? new THREE.Color(this.leafColors[cnt & 1]) : new THREE.Color(pal.grass[0] / 255, pal.grass[1] / 255, pal.grass[2] / 255);
        im.setColorAt(cnt, bc.multiplyScalar(0.75 + rnd() * 0.4));
        cnt++;
      }
      // cỏ dại lúp xúp mọc sát chân mặt ngoài tường cánh (khe đất ẩm giáp bê tông)
      for (let t = 0; t < 200 && cnt < nB + nW; t++) {
        const af = S.HB + 10 + rnd() * (S.RUN - 24), sf = rnd() < 0.5 ? -1 : 1, sr = rnd() < 0.5 ? -1 : 1;
        const ar = cutHalf(af) + S.WING_T + 2.5 + rnd() * 7;
        const h = moundH(sf * af, sr * ar);
        if (h === null || h < 1.5) continue;
        const sc = 0.9 + rnd() * 1.3;
        e.set(0, rnd() * 6.28, 0);
        m4.compose(new THREE.Vector3(sf * af, h - 0.3, sr * ar), q.setFromEuler(e), new THREE.Vector3(sc * (1 + rnd() * 0.5), sc * (0.7 + rnd() * 0.6), sc));
        im.setMatrixAt(cnt, m4);
        const bc = this.leafColors ? new THREE.Color(this.leafColors[cnt & 1]) : new THREE.Color(pal.grass[0] / 255, pal.grass[1] / 255, pal.grass[2] / 255);
        im.setColorAt(cnt, bc.multiplyScalar(0.8 + rnd() * 0.45));
        cnt++;
      }
      im.count = cnt;
      im.castShadow = true; im.receiveShadow = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      grp.add(im);
      return grp;
    }

    // ---------------------------------------------------------------- vẽ bản đồ
    // style 'tac': ký hiệu công sự trên bản đồ tác chiến (nét mảnh, tông tối); mặc định: bản đồ nhỏ
    drawOnMap(ctx, P, sc, style) {
      const tac = style === 'tac';
      for (const K of this.items) {
        const pt = (f, r) => { const w = this.toWorld(K, f, r); return [P(w.x), P(w.z)]; };
        // chân ụ đất
        ctx.fillStyle = tac ? 'rgba(64, 78, 52, 0.55)' : 'rgba(92,104,60,0.75)';
        ctx.beginPath();
        const ring = [];
        for (let k = 0; k < 48; k++) {
          const a = k / 48 * 6.2832, cf = Math.cos(a), cr = Math.sin(a);
          // điểm trên biên lõi + RUN*0.6 theo hướng a
          const f = Math.sign(cf) * (S.HB + Math.abs(cf) * S.RUN * 0.6), r = Math.sign(cr) * (S.WO + Math.abs(cr) * S.RUN * 0.6);
          ring.push(pt(f, r));
        }
        ring.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
        ctx.closePath(); ctx.fill();
        if (tac) { ctx.strokeStyle = 'rgba(190, 200, 160, 0.45)'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]); }
        // sân phễu bê tông trước 2 miệng hầm
        ctx.fillStyle = tac ? 'rgba(40, 46, 50, 0.85)' : '#aaa69b';
        for (const sg of [-1, 1]) {
          ctx.beginPath();
          const fs = [];
          for (let f = S.END - 1; f <= PORTAL.NECK_F; f += 8) fs.push(f);
          fs.forEach((f, i) => { const p = pt(sg * f, portalHalf(f)); i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); });
          for (let i = fs.length - 1; i >= 0; i--) { const p = pt(sg * fs[i], -portalHalf(fs[i])); ctx.lineTo(p[0], p[1]); }
          ctx.closePath(); ctx.fill();
        }
        // kênh bê tông
        ctx.fillStyle = tac ? 'rgba(26, 32, 36, 0.92)' : '#b9b5aa';
        ctx.beginPath();
        const c1 = [pt(-S.END, -cutHalf(S.END)), pt(-S.HB, -S.WI), pt(S.HB, -S.WI), pt(S.END, -cutHalf(S.END)), pt(S.END, cutHalf(S.END)), pt(S.HB, S.WI), pt(-S.HB, S.WI), pt(-S.END, cutHalf(S.END))];
        c1.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
        ctx.closePath(); ctx.fill();
        if (tac) { ctx.strokeStyle = 'rgba(225, 228, 220, 0.75)'; ctx.lineWidth = 1.2; ctx.stroke(); }
        // mái
        ctx.fillStyle = tac ? 'rgba(12, 16, 20, 0.95)' : '#7e7a70';
        ctx.beginPath();
        [pt(-S.HB, -S.WO), pt(S.HB, -S.WO), pt(S.HB, S.WO), pt(-S.HB, S.WO)].forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
        ctx.closePath(); ctx.fill();
        if (tac) {
          // mái che: viền trắng + gạch chéo (ký hiệu công trình có nắp)
          ctx.strokeStyle = 'rgba(235, 238, 232, 0.85)'; ctx.lineWidth = 1.5; ctx.stroke();
          ctx.save(); ctx.clip(); ctx.strokeStyle = 'rgba(235, 238, 232, 0.18)'; ctx.lineWidth = 1; ctx.beginPath();
          const cx = P(K.x), cz = P(K.z), R = (S.HB + S.WO) * sc;
          for (let d = -R * 2; d < R * 2; d += 6) { ctx.moveTo(cx + d - R, cz - R); ctx.lineTo(cx + d + R, cz + R); }
          ctx.stroke(); ctx.restore();
          continue;
        }
        ctx.fillStyle = '#ffd34a'; ctx.font = `bold ${Math.max(10, 40 * sc) | 0}px Arial`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(K.id, P(K.x), P(K.z));
      }
    }

    // Xe người chơi vào khoang: mái, tường, ụ đất mờ dần để thấy xe bên dưới; ra ngoài thì hiện lại
    // Có xe (đang hiển thị) nằm dưới mái của cứ điểm K không
    occupiedVisible(K, units, except, any) {
      for (const u of units || []) {
        if (!u || u === except || u.isDead || !u.group || (!any && !u.group.visible)) continue;
        if (Math.abs(u.x - K.x) > S.REACH || Math.abs(u.z - K.z) > S.REACH) continue;
        const L = this.local(K, u.x, u.z);
        if (Math.abs(L.f) < S.HB + 24 && Math.abs(L.r) < S.WI + 12) return u;
      }
      return null;
    }

    /**
     * Làm mờ mái / ụ đất để thấy xe bên dưới khi:
     *  - xe người chơi đang ở trong khoang, hoặc
     *  - cứ điểm nằm trong tầm nhìn của xe người chơi và dưới mái có xe đang được nhìn thấy (địch đã lộ / đồng đội).
     * opts.sight: tầm nhìn của xe người chơi; opts.all: luôn nhìn xuyên (phòng thử nghiệm)
     */
    updateCutaway(unit, dt, units, opts = {}) {
      const sight = opts.sight || 520;
      for (const K of this.items) {
        let want = 1;
        const view = opts.view || unit;
        // Mái luôn đặc trong trận (xe mình vào hầm thì camera chuyển sang góc nhìn trong xe — game.blendInsideView;
        // nhìn xuyên mái thấy xe bên dưới trông giả). Chỉ phòng thử bật X-quang (opts.all) mới làm mờ để soi xe trong hầm
        // xe mình đang đứng trên nóc hầm này: mái phải đặc (đang đi trên nó)
        const onRoof = unit && (unit.y || 0) - K.G > S.CEIL + 10 && (() => { const L = this.local(K, unit.x, unit.z); return Math.abs(L.f) <= S.HB + 12 && Math.abs(L.r) <= S.WO + 12; })();
        if (opts.all && !onRoof && view && Math.hypot(K.x - view.x, K.z - view.z) < S.REACH + (opts.viewRadius || 560)) {
          if (units && this.occupiedVisible(K, units, unit, true)) want = 0.45;
        }
        const cast = want > 0.5;
        if (K.roofMeshes && K.roofMeshes[0].castShadow !== cast) for (const m of K.roofMeshes) m.castShadow = cast;
        if (Math.abs(K.fade - want) < 0.005) continue;
        K.fade += (want - K.fade) * Math.min(1, dt * 6);
        if (Math.abs(K.fade - want) < 0.01) K.fade = want;
        const tr = K.fade < 0.999;
        for (const m of K.fadeMats) {
          if (m.transparent !== tr) { m.transparent = tr; m.depthWrite = !tr; m.needsUpdate = true; }
          m.opacity = K.fade;
        }
      }
    }

    update() {}
  }

  // Vải cờ: màu phe + chữ cứ điểm (trung lập: cờ trắng)
  const FLAG_TEX = {};
  function flagTexture(team, id) {
    const key = (team || 'N') + id;
    if (FLAG_TEX[key]) return FLAG_TEX[key];
    const c = canvas(128, 80), g = c.getContext('2d');
    const base = team === 'BLUE' ? '#2867d6' : team === 'RED' ? '#cf2f28' : '#d9d6cc';
    g.fillStyle = base; g.fillRect(0, 0, 128, 80);
    if (team) {
      g.fillStyle = 'rgba(255,255,255,0.92)'; g.fillRect(0, 34, 128, 12);
      g.fillStyle = base; g.beginPath(); g.arc(44, 40, 21, 0, 6.2832); g.fill();
      g.strokeStyle = '#fff'; g.lineWidth = 4; g.stroke();
      g.fillStyle = '#fff'; g.font = 'bold 28px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(id, 44, 41);
    } else {
      g.strokeStyle = 'rgba(80,80,80,0.5)'; g.lineWidth = 2; g.strokeRect(3, 3, 122, 74);
    }
    // nếp vải
    for (let x = 0; x < 128; x += 16) { const gr = g.createLinearGradient(x, 0, x + 16, 0); gr.addColorStop(0, 'rgba(0,0,0,0.12)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.08)'); gr.addColorStop(1, 'rgba(0,0,0,0.12)'); g.fillStyle = gr; g.fillRect(x, 0, 16, 80); }
    const t = new THREE.CanvasTexture(c);
    return (FLAG_TEX[key] = t);
  }

  let _haz = null;
  function hazardTex() {
    if (_haz) return _haz;
    const c = canvas(256, 16), g = c.getContext('2d');
    g.fillStyle = '#c4a03e'; g.fillRect(0, 0, 256, 16);
    g.fillStyle = '#23211d';
    for (let x = -16; x < 272; x += 24) { g.beginPath(); g.moveTo(x, 16); g.lineTo(x + 12, 0); g.lineTo(x + 24, 0); g.lineTo(x + 12, 16); g.fill(); }
    // sơn cũ bạc màu, bám bẩn, sứt mẻ (vết tróc lộ màu bê tông)
    agePaint(g, rngOf(3301), 0, 0, 256, 16, 90, 18);
    g.globalCompositeOperation = 'destination-over'; g.fillStyle = '#8d8a82'; g.fillRect(0, 0, 256, 16); g.globalCompositeOperation = 'source-over';
    _haz = new THREE.CanvasTexture(c); _haz.wrapS = THREE.RepeatWrapping; _haz.repeat.set(4, 1);
    return _haz;
  }

  // ===========================================================================
  // HỘP BAO THÂN XE (không tính nòng pháo) trong hệ cục bộ của unit.group — tính 1 lần / xe
  // ===========================================================================
  function unitBox(unit) {
    if (unit._shBox && unit._shBoxGroup === unit.group) return unit._shBox;
    const box = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity };
    if (unit.group) {
      const savedRot = unit.group.rotation.y, savedPos = unit.group.position.clone();
      const tYaw = unit.turretGroup ? unit.turretGroup.rotation.y : 0;
      unit.group.rotation.y = 0; unit.group.position.set(0, 0, 0);
      if (unit.turretGroup) unit.turretGroup.rotation.y = 0;
      unit.group.updateMatrixWorld(true);
      const skip = new Set([unit.barrelPivot, unit.hpGroup, unit.hpBarMesh, unit.hpBgMesh, unit.reactiveArmorMesh].filter(Boolean));
      const v = new THREE.Vector3(), m = new THREE.Matrix4(), mi = new THREE.Matrix4();
      const add = (bb, mat) => {
        for (let k = 0; k < 8; k++) {
          v.set(k & 1 ? bb.max.x : bb.min.x, k & 2 ? bb.max.y : bb.min.y, k & 4 ? bb.max.z : bb.min.z).applyMatrix4(mat);
          if (v.x < box.minX) box.minX = v.x; if (v.x > box.maxX) box.maxX = v.x;
          if (v.y < box.minY) box.minY = v.y; if (v.y > box.maxY) box.maxY = v.y;
          if (v.z < box.minZ) box.minZ = v.z; if (v.z > box.maxZ) box.maxZ = v.z;
        }
      };
      const walk = (o) => {
        if (skip.has(o)) return;
        if (!o.visible) return;
        if (o.name === 'antennas' || (o.userData && o.userData.isAntenna)) return;
        if (o.isMesh && o.geometry && !o.userData.isFxDecal) {
          const mat = Array.isArray(o.material) ? o.material[0] : o.material;
          const fx = mat && (mat.blending === THREE.AdditiveBlending || (mat.transparent && mat.opacity < 0.2));
          if (!fx) {
            if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
            const bb = o.geometry.boundingBox;
            if (bb && isFinite(bb.min.x)) {
              if (o.isInstancedMesh) {
                const n = Math.min(o.count, 400);
                for (let i = 0; i < n; i++) { o.getMatrixAt(i, mi); m.multiplyMatrices(o.matrixWorld, mi); add(bb, m); }
              } else add(bb, o.matrixWorld);
            }
          }
        }
        for (const c of o.children) walk(c);
      };
      walk(unit.group);
      unit.group.rotation.y = savedRot; unit.group.position.copy(savedPos);
      if (unit.turretGroup) unit.turretGroup.rotation.y = tYaw;
      unit.group.updateMatrixWorld(true);
    }
    if (!isFinite(box.minX)) Object.assign(box, { minX: -16, maxX: 16, minY: 0, maxY: 28, minZ: -30, maxZ: 30 });
    // Không tính phần thấp hơn mặt đất (bóng / vệt) và ăng-ten mảnh phía trên
    box.minY = Math.max(box.minY, -2);
    box.maxY = Math.min(box.maxY, 40);
    unit._shBox = box; unit._shBoxGroup = unit.group;
    return box;
  }

  // Đoạn thẳng P0->P1 cắt hộp thân xe? Trả về t (0..1) điểm vào hoặc -1
  function segUnitBox(unit, x0, y0, z0, x1, y1, z1, pad = 1.5) {
    const B = unitBox(unit);
    const c = Math.cos(unit.bodyAngle || 0), s = Math.sin(unit.bodyAngle || 0);
    const toL = (x, y, z) => { const dx = x - unit.x, dz = z - unit.z; return [dx * c - dz * s, y - (unit.y || 0), dx * s + dz * c]; };
    const a = toL(x0, y0, z0), b = toL(x1, y1, z1);
    let t0 = 0, t1 = 1;
    const lo = [B.minX - pad, B.minY - pad, B.minZ - pad], hi = [B.maxX + pad, B.maxY + pad, B.maxZ + pad];
    for (let k = 0; k < 3; k++) {
      const d = b[k] - a[k];
      if (Math.abs(d) < 1e-9) { if (a[k] < lo[k] || a[k] > hi[k]) return -1; continue; }
      let ta = (lo[k] - a[k]) / d, tb = (hi[k] - a[k]) / d;
      if (ta > tb) { const t = ta; ta = tb; tb = t; }
      if (ta > t0) t0 = ta; if (tb < t1) t1 = tb;
      if (t0 > t1) return -1;
    }
    return t0;
  }

  // ===========================================================================
  // HẠ LƯỚI ĐỊA HÌNH DƯỚI KÊNH XE CHẠY (để mặt đất không trồi lên xuyên sàn / dốc)
  // ===========================================================================
  function carveHeights(heights, res, size, list) {
    const N = res + 1, cell = size / res, half = size / 2;
    for (const s of list) {
      const fx = Math.cos(s.angle), fz = Math.sin(s.angle), rx = -fz, rz = fx;
      const i0 = Math.max(0, Math.floor((s.x - S.REACH + half) / cell)), i1 = Math.min(res, Math.ceil((s.x + S.REACH + half) / cell));
      const j0 = Math.max(0, Math.floor((s.z - S.REACH + half) / cell)), j1 = Math.min(res, Math.ceil((s.z + S.REACH + half) / cell));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = -half + i * cell, z = -half + j * cell, dx = x - s.x, dz = z - s.z;
        const f = dx * fx + dz * fz, r = dx * rx + dz * rz, af = Math.abs(f), ar = Math.abs(r);
        // dải kênh + bề dày tường + 1 ô lưới đệm
        if (af <= S.END + cell && ar < cutHalf(Math.min(af, S.END)) + S.WING_T + cell * 1.2) {
          // Ngoài mép cuối sân (af > END) không còn sàn: đất chỉ cần thấp hơn mặt sân một chút. Trước đây ô lưới ngoài mép
          // (ô 16 đv) bị hạ theo cao độ đoạn dốc phía trong (-2..-3 đv) -> rãnh trũng thẳng tắp chạy ngang ngay sau mép sân,
          // nếp gãy tam giác lưới lộ thành vạch tối. Gần đỉnh dốc (đoạn cong lồi, đã cao gần bằng mặt sân) cũng bớt hạ dư
          const fy = floorY(Math.max(0, af - cell));
          // đoạn cuối dốc cong lồi & sân phẳng: dây cung của mặt dốc luôn nằm dưới mặt dốc -> chỉ cần thấp hơn mặt sàn tại
          // chính chỗ đó 0,4 đv (đất ngay dưới mép sân gần như sát mặt sàn: mép sân "tan" vào cát, xem weatherMat)
          const lim = af > S.END ? s.G - 0.3
            : af > S.RAMP_END - cell * 1.5 ? s.G + floorY(af) - 0.4
            : s.G + fy - (fy < -0.01 ? 3 : 0.3);
          const k = j * N + i;
          if (heights[k] > lim) heights[k] = lim;
        }
      }
    }
  }

  return { S, StrongholdSet, carveHeights, unitBox, segUnitBox, cutHalf, floorY, holeDiscard };
})();

if (typeof window !== 'undefined') window.Strongholds = Strongholds;
