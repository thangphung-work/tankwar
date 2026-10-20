/**
 * CỨ ĐIỂM BÊ TÔNG CỐT THÉP DƯỚI Ụ ĐẤT (thay cho boong-ke móng ngựa cũ)
 *
 * - Khoang bê tông dạng xuyên qua (2 đầu đều mở) chôn dưới ụ đất trên đỉnh đồi, đủ chỗ 2 xe đứng song song
 * - Lòng khoang võng xuống (sàn thấp hơn cốt nền 1.75 m): thân xe nằm khuất, chỉ tháp pháo cao hơn mặt đất
 * - Hai đầu có tường cánh loe rộng -> nòng pháo quét được góc rộng mà không chạm tường
 * - Bê tông + ụ đất KHÔNG bị phá bởi đạn thường; xe nằm trong khoang có mái che không nhận sát thương.
 *   Phần xe thò ra khỏi mép mái (vùng bảo vệ) thì bị bắn trúng và mất máu bình thường.
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
    RAMP: 104,     // dốc lên / xuống ở mỗi đầu (13 m, hạ 2.5 m, dốc đều ~14°), kết thúc ngay trước đầu tường cánh
    RAMP_EASE: 0.25, // phần uốn mềm ở mỗi đầu dốc (còn lại dốc thẳng đều -> dốc nhất chỉ 1.33 lần dốc trung bình)
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
  S.RAMP_END = S.HB + S.RAMP;
  S.ZONE_END = S.HB + 74;   // vùng chiếm cờ: khoang + đoạn đầu dốc (giữ nguyên cỡ cũ khi dốc dài ra)
  S.END = S.HB + S.RUN;
  S.REACH = Math.hypot(S.END + 12, S.WO + S.RUN + 12);   // bán kính bao toàn bộ công trình

  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const smooth = t => { t = clamp01(t); return t * t * (3 - 2 * t); };

  // Nửa bề rộng lòng kênh xe chạy tại |f| (trong khoang = WI, ngoài khoang loe dần theo tường cánh)
  const cutHalf = af => af <= S.HB ? S.WI : S.WI + (af - S.HB) * S.SPLAY;
  // Cao độ sàn / dốc (so với cốt nền)
  // dốc thẳng đều, 2 đầu uốn parabol (không gãy góc ở chân / đỉnh dốc)
  const rampK = t => {
    const b = S.RAMP_EASE, k = 1 / (2 * b * (1 - b));
    t = clamp01(t);
    return t < b ? t * t * k : t > 1 - b ? 1 - (1 - t) * (1 - t) * k : (t - b / 2) / (1 - b);
  };
  // độ vát mép tường cánh: nhỏ lại ở đoạn tường thấp gần chân ụ (tường cao t - b)
  const wingBevel = (t, b) => Math.min(S.WING_BEVEL, Math.max(0, t - b - 1) * 0.6);
  const floorY = af => af <= S.HB ? -S.D : af >= S.RAMP_END ? 0 : -S.D * (1 - rampK((af - S.HB) / S.RAMP));
  const inCut = (af, ar) => ar < cutHalf(af);
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
    const c = canvas(N, N), g = c.getContext('2d');
    const b = canvas(N, N), gb = b.getContext('2d');
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
    const c = canvas(N, N), g = c.getContext('2d');
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

  function letterTexture(ch) {
    const c = canvas(256, 256), g = c.getContext('2d');
    g.fillStyle = 'rgba(0,0,0,0)'; g.fillRect(0, 0, 256, 256);
    g.font = 'bold 200px Arial Black, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(232,196,64,0.92)'; g.fillText(ch, 128, 140);
    // sơn bong tróc
    const rnd = rngOf(ch.charCodeAt(0) * 31);
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(0,0,0,${0.3 + rnd() * 0.7})`; g.beginPath(); g.arc(rnd() * 256, rnd() * 256, 1 + rnd() * 4, 0, 6.2832); g.fill(); }
    g.globalCompositeOperation = 'source-over';
    const t = new THREE.CanvasTexture(c);
    t.anisotropy = 4;
    return t;
  }

  // ===========================================================================
  // DỰNG HÌNH: gom mọi mặt cùng vật liệu vào 1 BufferGeometry
  // ===========================================================================
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
      this.mapType = opts.mapType || 'HIGHLAND';
      // Màu ụ đất theo địa hình: dùng chung shader mặt đất (opts.groundMaterial) nếu có, không thì bảng màu EARTH
      this.groundMaterial = typeof opts.groundMaterial === 'function' ? opts.groundMaterial : null;
      this.worldSize = opts.worldSize || null;
      this.leafColors = opts.leafColors || null;
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
        const onTop = refY !== undefined && refY - K.G > 8;
        // Trên ụ: mọi điểm ngoài kênh hở (kể cả phần mái che phía trên khoang) là mặt đất đắp
        if (onTop && h !== null && !(inCut(af, ar) && af > S.HB)) return K.G + Math.max(0, h);
        if (af <= S.END + 6 && ar < cutHalf(af) + S.WING_T + 26) return K.G + floorY(af);
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
      return null;
    }
    // Không đào hố bom trên ụ đất / sàn bê tông
    covers(x, z, pad = 0) {
      for (const K of this.items) {
        if (Math.abs(x - K.x) > S.REACH + pad || Math.abs(z - K.z) > S.REACH + pad) continue;
        const L = this.local(K, x, z), af = Math.abs(L.f), ar = Math.abs(L.r);
        if ((af <= S.END + pad && inCut(af, ar)) || coreDist(af, ar) < S.RUN + pad) return K;
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
          if (yy >= ceil) return { K, normal: af > S.HB - 3 ? this.dirN(K, Math.sign(L.f), 0) : null };
          // tường bên
          if (ar >= S.WI - m && af <= S.HB) return { K, normal: this.dirN(K, 0, -Math.sign(L.r)) };
          continue;
        }
        if (af > S.END + 2) continue;
        // tường cánh loe
        const ch = cutHalf(af);
        if (ar >= ch - m && ar <= ch + S.WING_T) {
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
        if (c) return { x, y, z, type: 'WALL', normal: c.normal, K: c.K };
        const sf = this.surfaceAt(x, z);
        return { x, y: sf !== null ? Math.max(y, sf - 0.2) : y, z, type: 'GROUND' };
      }
      return null;
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
        if (Math.abs(L.f) <= S.HB && Math.abs(L.r) < S.WI && yy < S.CEIL + 1 && yy > -S.D - 12) return K;
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
    // Tỉ lệ thân xe nằm ngoài vùng mái che (0 = khuất hoàn toàn, 1 = lộ hoàn toàn)
    exposure(unit) {
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
        if (!this.protectedAt(wx, wy, wz)) out++;
      }
      return out / n;
    }
    // Đạn đã lọt vào trong khoang (điểm P) theo hướng dir: lùi về điểm nó đi qua mép vùng bảo vệ (miệng khoang)
    entryPoint(K, P, dir) {
      const L = this.local(K, P.x, P.z);
      const df = -(dir.x * K.fx + dir.z * K.fz), dr = -(dir.x * K.rx + dir.z * K.rz), dy = -dir.y;
      let tMax = Infinity;
      const slab = (p, d, lo, hi) => { if (Math.abs(d) < 1e-6) return; const t = d > 0 ? (hi - p) / d : (lo - p) / d; if (t < tMax) tMax = Math.max(0, t); };
      slab(L.f, df, -S.HB, S.HB);
      slab(L.r, dr, -S.WI, S.WI);
      slab(P.y - K.G, dy, -S.D - 12, S.CEIL + 1);
      if (!isFinite(tMax)) tMax = 0;
      return { x: P.x - dir.x * tMax, y: P.y - dir.y * tMax, z: P.z - dir.z * tMax };
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
      Rf.box(-HB, HB, CEIL, CEIL + ROOF, -WO - 2, WO + 2, SC, { top: true, fp: true, fn: true }, { bottom: 0.78 });
      // Mặt tiền 2 đầu (gờ dày nhô lên khỏi lớp đất)
      const HN = S.HAUNCH, BV = S.BEVEL;
      for (const sg of [-1, 1]) {
        // tiết diện (f, y): mặt tiền đứng, mép trên vát 45° lùi vào trong
        const fi = sg * (HB - S.LIP_T), fo = sg * HB, LB = S.LIP_BEVEL;
        Rf.prism([[fi, CEIL - 0.01], [fo, CEIL - 0.01], [fo, TOP - LB], [fo - sg * LB, TOP], [fi, TOP]], 'r', -WO - 2, WO + 2, SC, [0, 4], true, { 2: 1.1, 3: 1.04 });
        // Mép vát dưới lanh tô (chỉ đoạn giữa 2 góc vát nách)
        Rf.box(sg > 0 ? HB - 1.2 : -HB, sg > 0 ? HB + 0.6 : -HB - 0.6, CEIL - 1.6, CEIL, -WI + HN, WI - HN, SC, { top: true }, { bottom: 0.7 });
      }
      // Tường bên (chỉ mặt trong lộ ra)
      for (const sg of [-1, 1]) {
        const r0 = sg > 0 ? WI : -WO, r1 = sg > 0 ? WO : -WI;
        C.box(-HB, HB, -D - 2, S.CREST, r0, r1, SC, { bottom: true, fp: true, fn: true, [sg > 0 ? 'rp' : 'rn']: true }, { rn: 0.82, rp: 0.82, top: 1.05 });
        // chân tường (gờ chống va)
        const k0 = sg > 0 ? WI - 1.4 : -WI, k1 = sg > 0 ? WI : -WI + 1.4;
        C.box(-HB, HB, -D - 0.5, -D + 3, k0, k1, SC, { bottom: true, fp: true, fn: true }, { top: 0.85, rn: 0.7, rp: 0.7 });
        // Vát nách góc trần - tường (tiết diện tam giác (r, y)), lộ ra thành góc vát của miệng hầm ở 2 đầu
        C.prism([[sg * WI, CEIL - HN], [sg * WI, CEIL + 0.01], [sg * (WI - HN), CEIL + 0.01]], 'f', -HB, HB, SC, [0, 1], true, { 2: 0.9, cap: 0.95 });
      }
      // Dầm trần
      for (const bf of S.BEAMS_F) Rf.box(bf - 3, bf + 3, CEIL - S.BEAM, CEIL + 0.1, -WI, WI, SC, { top: true, rp: true, rn: true }, { bottom: 0.7, fp: 0.75, fn: 0.75 });
      // Nắp hầm: tấm bê tông lộ trên đỉnh ụ đất (sơn chữ cứ điểm, nhìn rõ từ trên cao)
      {
        // cạnh vát nghiêng 4 phía (khối chóp cụt dẹt)
        const f0 = HB - 7, r0 = WI - 2, f1 = f0 - BV, r1 = r0 - BV, y0 = S.CREST - 2, y1 = S.CREST + 2.2;
        const A = [[-f0, y0, -r0], [f0, y0, -r0], [f0, y0, r0], [-f0, y0, r0]], T = [[-f1, y1, -r1], [f1, y1, -r1], [f1, y1, r1], [-f1, y1, r1]];
        const uvT = q => [q[0] / SC, q[2] / SC];
        Rf.quadOut(T[0], T[1], T[2], T[3], T.map(uvT), 1.08, [0, 1, 0]);
        for (let i = 0; i < 4; i++) {
          const j = (i + 1) % 4, mx = (A[i][0] + A[j][0]) / 2, mz = (A[i][2] + A[j][2]) / 2;
          const along = i % 2 === 0 ? q => q[0] : q => q[2];
          Rf.quadOut(A[i], A[j], T[j], T[i], [[along(A[i]) / SC, 0], [along(A[j]) / SC, 0], [along(T[j]) / SC, 6 / SC], [along(T[i]) / SC, 6 / SC]], 0.95, [mx, 1, mz]);
        }
      }
      // Tường cánh loe (mặt trong + đỉnh + đầu tường), chạy từ mép mái ra tới chân ụ đất
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
      // Chân tường / gầm khoang tối hơn (bóng che khuất), mép trên sáng hơn
      const concMesh = new THREE.Mesh(C.build((f, y) => y < CEIL - 0.5 ? 0.66 + 0.34 * smooth((y + D) / 30) : 1), concMat);
      concMesh.castShadow = true; concMesh.receiveShadow = true;
      grp.add(concMesh);
      // Nhóm mái: mờ đi khi cứ điểm nằm trong khung nhìn để thấy xe bên dưới (tường & ụ đất vẫn đặc)
      const roofGrp = new THREE.Group();
      roofGrp.name = 'stronghold_roof';
      grp.add(roofGrp);
      const roofMat = concMat.clone();
      const roofMesh = new THREE.Mesh(Rf.build((f, y) => y < CEIL + 0.5 ? 0.78 : 1), roofMat);
      roofMesh.castShadow = true; roofMesh.receiveShadow = true;
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
      const cover = new THREE.Mesh(coverGeo, coverMat);
      cover.position.y = S.CREST + 0.3;
      cover.castShadow = true; cover.receiveShadow = true;
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
      const floorMesh = new THREE.Mesh(Fb.build(), floorMat);
      floorMesh.receiveShadow = true;
      grp.add(floorMesh);

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
      for (const lf of [-80, -48, -16, 16, 48, 80]) for (const lr of [-S.SLOT_R * 1.5, -S.SLOT_R * 0.5, S.SLOT_R * 0.5, S.SLOT_R * 1.5]) {
        const hsg = new THREE.Mesh(new THREE.BoxGeometry(7, 1.2, 2.2), housingMat);
        hsg.position.set(lf, CEIL - 0.6, lr); roofGrp.add(hsg);
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(6, 0.3, 1.4), lampMat);
        lamp.position.set(lf, CEIL - 1.3, lr); roofGrp.add(lamp);
      }
      // Không dùng PointLight: mỗi đèn thêm vào cảnh làm mọi vật liệu phải tính thêm 1 nguồn sáng trên từng điểm ảnh.
      // Lòng hầm đủ sáng nhờ ánh sáng môi trường; đèn trần là tấm tự phát sáng.
      const letter = letterTexture(K.id);
      for (const sg of [-1, 1]) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(24, 24), new THREE.MeshStandardMaterial({ map: letter, transparent: true, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
        m.position.set(sg * (HB + 0.08), CEIL + (S.TOP - CEIL) / 2, 0);
        m.rotation.y = sg > 0 ? Math.PI / 2 : -Math.PI / 2;
        roofGrp.add(m);
        K.fadeMats.push(m.material);
        // vạch sơn cảnh báo vàng đen dưới lanh tô
        const stripe = new THREE.Mesh(new THREE.PlaneGeometry((WI - S.HAUNCH) * 2, 1.8), new THREE.MeshStandardMaterial({ map: hazardTex(), roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
        stripe.position.set(sg * (HB + 0.68), CEIL - 0.6, 0);
        stripe.rotation.y = sg > 0 ? Math.PI / 2 : -Math.PI / 2;
        roofGrp.add(stripe);
        K.fadeMats.push(stripe.material);
      }
      // Chữ cứ điểm cỡ lớn sơn trên nắp hầm
      const roofLetterMat = new THREE.MeshStandardMaterial({ map: letter, transparent: true, roughness: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
      const rl = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), roofLetterMat);
      rl.rotation.set(-Math.PI / 2, 0, K.angle);   // chân chữ luôn quay về phía nam bản đồ (đọc xuôi từ camera)
      rl.position.set(0, S.CREST + 2.3, 0);
      rl.renderOrder = 3;
      roofGrp.add(rl);
      K.roofLetter = rl;
      K.fadeMats.push(roofLetterMat);
      // Cột cờ trên nắp hầm
      this.buildFlag(K, grp);
      return K;
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
      K.flag = { pole, cloth, W, base0: geo.attributes.position.array.slice(), top: poleH + 1, bottom: 6 + H, t: Math.random() * 10, shown: undefined };
      K.capture = 0;          // -100 (đỏ) .. +100 (xanh)
      K.owner = null;
      this.setFlagHeight(K, 0);
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
     * Chiếm cứ điểm: xe một phe đứng trong khoang / dốc ra vào (không có xe địch) -> kéo cờ phe mình lên.
     * Phe kia vào chiếm lại: cờ cũ hạ dần xuống, đổi cờ và kéo lên. Gọi mỗi khung hình.
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
        const rate = 24;   // %/giây với 1 xe (~4 s kéo cờ lên đỉnh), 2 xe nhanh gấp rưỡi
        if (blue && !red) K.capture = Math.min(100, K.capture + rate * (blue > 1 ? 1.5 : 1) * dt);
        else if (red && !blue) K.capture = Math.max(-100, K.capture - rate * (red > 1 ? 1.5 : 1) * dt);
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
        // Cờ phe đang chiếm dở / đã chiếm, kéo cao theo tiến độ; về 0 thì cờ trắng nằm dưới chân cột
        const team = K.capture > 0.5 ? 'BLUE' : K.capture < -0.5 ? 'RED' : null;
        const F = K.flag;
        if (team !== F.shown) {
          F.shown = team;
          F.cloth.material.map = flagTexture(team, K.id);
          F.cloth.material.needsUpdate = true;
        }
        this.setFlagHeight(K, team ? Math.abs(K.capture) / 100 : 0);
      }
      this.waveFlags(dt);
    }
    waveFlags(dt) {
      for (const K of this.items) {
        const F = K.flag;
        if (!F) continue;
        F.t += dt;
        const pos = F.cloth.geometry.attributes.position, a = pos.array, b = F.base0;
        for (let i = 0; i < a.length; i += 3) {
          const x = b[i], y = b[i + 1], k = Math.min(1, x / F.W);
          a[i + 2] = Math.sin(x * 0.22 - F.t * 6.5 + y * 0.05) * 2.4 * k + Math.sin(x * 0.5 - F.t * 9) * 0.6 * k;
          a[i + 1] = y - k * k * 1.8 + Math.sin(x * 0.3 - F.t * 5) * 0.4 * k;
          a[i] = x - Math.abs(a[i + 2]) * 0.15;
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
        if (gMat) { col[k * 3] = col[k * 3 + 1] = col[k * 3 + 2] = 1; continue; }
        // Màu: đỉnh / chỗ thoải xanh cỏ, sườn dốc lộ đất, chân ụ hòa vào nền
        const sl = Math.abs(hAt(f + 2, r) - hAt(f - 2, r)) / 4 + Math.abs(hAt(f, r + 2) - hAt(f, r - 2)) / 4;
        const blot = (vnoise(f / 60 + 3.1, r / 60 - 1.7) - 0.5) * 2.2;
        const dirt = clamp01((sl - 0.4) * 1.5 + 0.18 * blot);
        const toe = clamp01(1 - h / 8);
        const v = 0.96 + 0.05 * blot;
        for (let c = 0; c < 3; c++) {
          let x = pal.grass[c] + (pal.dirt[c] - pal.grass[c]) * dirt;
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
      const nB = 46;
      const im = new THREE.InstancedMesh(bushGeo, new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true }), nB);
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
        if (view && Math.hypot(K.x - view.x, K.z - view.z) < S.REACH + (opts.viewRadius || 560)) {
          // mái đặc bình thường; chỉ mờ vừa (vẫn thấy rõ khối hầm) khi bên dưới có xe: xe mình hoặc xe đang được nhìn thấy
          const L = unit && !unit.isDead ? this.local(K, unit.x, unit.z) : null;
          const meInside = L && Math.abs(L.f) < S.HB + 24 && Math.abs(L.r) < S.WI + 12;
          if (meInside || (units && this.occupiedVisible(K, units, unit, !!opts.all))) want = 0.45;
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
    g.fillStyle = '#d8b030'; g.fillRect(0, 0, 256, 16);
    g.fillStyle = '#1c1c1c';
    for (let x = -16; x < 272; x += 24) { g.beginPath(); g.moveTo(x, 16); g.lineTo(x + 12, 0); g.lineTo(x + 24, 0); g.lineTo(x + 12, 16); g.fill(); }
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
          const fy = floorY(Math.max(0, af - cell));
          const lim = s.G + fy - (fy < -0.01 ? 3 : 0.3);
          const k = j * N + i;
          if (heights[k] > lim) heights[k] = lim;
        }
      }
    }
  }

  return { S, StrongholdSet, carveHeights, unitBox, segUnitBox, cutHalf, floorY };
})();

if (typeof window !== 'undefined') window.Strongholds = Strongholds;
