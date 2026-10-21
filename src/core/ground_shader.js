/**
 * SHADER MẶT ĐẤT CHÂN THỰC (thay cho 1 ảnh màu phủ toàn bản đồ)
 * - 4 lớp vật liệu sinh thủ tục theo từng loại chiến địa: nền chính (cỏ / cát / bê tông), đất, đá, sỏi
 * - Trộn theo độ dốc thật của mặt đất (sườn dốc lộ đá), nhiễu tầng lớn (mảng đất trống, bãi sỏi), độ ẩm ven nước (bùn)
 * - Mỗi lớp lấy mẫu ở 2 tỉ lệ & lệch hướng (không lộ ô lặp); đá chiếu 3 phía (vách dốc không bị kéo giãn)
 * - Gồ ghề bề mặt (bump) theo độ cao của chính lớp vật liệu đang hiện
 * - Ảnh màu cũ của bản đồ (paintGround) chỉ còn dùng pha màu tầng lớn: vệt ẩm, thảm thực vật, nền đường
 * - Bóng mây trôi: dùng chung cho mọi vật (SkySystem.installCloudShadows), không còn riêng mặt đất
 */
const GroundShader = (() => {
  const TEX = {};
  const uTime = { value: 0 };

  // ---------------------------------------------------------------------------
  // TIỆN ÍCH VẼ TEXTURE LẶP LIỀN MẠCH
  // ---------------------------------------------------------------------------
  function rngOf(seed) {
    let a = seed >>> 0;
    return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const N = 512;
  function canvas() { const c = document.createElement('canvas'); c.width = c.height = N; return c; }
  // vẽ lặp quanh mép để texture nối liền khi lặp lại
  function wrapDraw(g, x, y, r, fn) {
    for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) {
      if (x + ox + r < 0 || x + ox - r > N || y + oy + r < 0 || y + oy - r > N) continue;
      fn(x + ox, y + oy);
    }
  }
  const rgb = (c, k = 1, a = 1) => `rgba(${Math.max(0, Math.min(255, c[0] * k)) | 0},${Math.max(0, Math.min(255, c[1] * k)) | 0},${Math.max(0, Math.min(255, c[2] * k)) | 0},${a})`;
  function blotches(g, rnd, n, col, r0, r1, a0, a1, kMin = 0.75, kMax = 1.2) {
    for (let i = 0; i < n; i++) {
      const x = rnd() * N, y = rnd() * N, r = r0 + rnd() * (r1 - r0), k = kMin + rnd() * (kMax - kMin), a = a0 + rnd() * (a1 - a0);
      wrapDraw(g, x, y, r, (px, py) => {
        const gr = g.createRadialGradient(px, py, 0, px, py, r);
        gr.addColorStop(0, rgb(col, k, a)); gr.addColorStop(1, rgb(col, k, 0));
        g.fillStyle = gr; g.beginPath(); g.arc(px, py, r, 0, 6.2832); g.fill();
      });
    }
  }
  // nhiễu hạt từng điểm ảnh
  function grain(g, rnd, amt, sat = 0) {
    const img = g.getImageData(0, 0, N, N), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (rnd() - 0.5) * amt, c = (rnd() - 0.5) * sat;
      d[i] += n + c; d[i + 1] += n; d[i + 2] += n - c;
    }
    g.putImageData(img, 0, 0);
  }

  // ---------------------------------------------------------------------------
  // CÁC LỚP VẬT LIỆU
  // ---------------------------------------------------------------------------
  function grassTex(base, dry, seed) {
    const c = canvas(), g = c.getContext('2d'), rnd = rngOf(seed);
    g.fillStyle = rgb(base); g.fillRect(0, 0, N, N);
    blotches(g, rnd, 70, base, 20, 90, 0.25, 0.55, 0.7, 1.25);
    blotches(g, rnd, 26, dry, 24, 80, 0.2, 0.45);
    blotches(g, rnd, 40, [base[0] * 0.55, base[1] * 0.5, base[2] * 0.45], 6, 22, 0.35, 0.6);   // hõm tối giữa các khóm cỏ
    grain(g, rnd, 26, 10);
    // ngọn cỏ: nét ngắn nhiều sắc độ, nghiêng ngẫu nhiên; ngọn sáng phía trên, chân tối
    for (let i = 0; i < 16000; i++) {
      const x = rnd() * N, y = rnd() * N, L = 2.5 + rnd() * 6, a = -1.57 + (rnd() - 0.5) * 1.3;
      const isDry = rnd() < 0.16, k = 0.7 + rnd() * 0.65;
      const col = isDry ? dry : base;
      const x2 = x + Math.cos(a) * L, y2 = y + Math.sin(a) * L;
      wrapDraw(g, x, y, L, (px, py) => {
        g.strokeStyle = rgb(col, k * 0.6, 0.55); g.lineWidth = 1.4;
        g.beginPath(); g.moveTo(px, py); g.lineTo(px + (x2 - x) * 0.5, py + (y2 - y) * 0.5); g.stroke();
        g.strokeStyle = rgb(col, k * 1.15, 0.8); g.lineWidth = 0.9;
        g.beginPath(); g.moveTo(px + (x2 - x) * 0.35, py + (y2 - y) * 0.35); g.lineTo(px + (x2 - x), py + (y2 - y)); g.stroke();
      });
    }
    // vài bông cỏ dại / hoa nhỏ
    for (let i = 0; i < 90; i++) {
      const x = rnd() * N, y = rnd() * N;
      g.fillStyle = rnd() < 0.5 ? 'rgba(220,210,150,0.4)' : 'rgba(230,228,215,0.3)';
      g.fillRect(x, y, 1.6, 1.6);
    }
    return c;
  }
  function dirtTex(base, seed) {
    const c = canvas(), g = c.getContext('2d'), rnd = rngOf(seed);
    g.fillStyle = rgb(base); g.fillRect(0, 0, N, N);
    blotches(g, rnd, 80, base, 14, 70, 0.3, 0.6, 0.72, 1.22);
    grain(g, rnd, 30, 8);
    // cục đất: sáng phía trên (nắng), tối phía dưới (bóng)
    for (let i = 0; i < 1400; i++) {
      const x = rnd() * N, y = rnd() * N, r = 1.2 + rnd() * 4.2, k = 0.8 + rnd() * 0.4;
      wrapDraw(g, x, y, r + 2, (px, py) => {
        g.fillStyle = rgb(base, 0.55, 0.55); g.beginPath(); g.ellipse(px + 0.8, py + 1.2, r, r * 0.75, 0, 0, 6.2832); g.fill();
        g.fillStyle = rgb(base, k * 1.12, 0.9); g.beginPath(); g.ellipse(px, py, r, r * 0.72, 0, 0, 6.2832); g.fill();
      });
    }
    // sỏi nhỏ
    for (let i = 0; i < 700; i++) {
      const x = rnd() * N, y = rnd() * N, r = 0.8 + rnd() * 2;
      g.fillStyle = rgb([150, 145, 135], 0.7 + rnd() * 0.5, 0.8); g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fill();
    }
    // vết nứt khô
    g.strokeStyle = rgb(base, 0.45, 0.5); g.lineWidth = 1;
    for (let i = 0; i < 26; i++) {
      let x = rnd() * N, y = rnd() * N;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 6; k++) { x += (rnd() - 0.5) * 30; y += (rnd() - 0.5) * 30; g.lineTo(x, y); }
      g.stroke();
    }
    return c;
  }
  function rockTex(base, lichen, seed) {
    const c = canvas(), g = c.getContext('2d'), rnd = rngOf(seed);
    g.fillStyle = rgb(base); g.fillRect(0, 0, N, N);
    blotches(g, rnd, 60, base, 30, 130, 0.35, 0.7, 0.65, 1.3);
    // vân lớp đá trầm tích
    for (let i = 0; i < 22; i++) {
      const y0 = rnd() * N, amp = 6 + rnd() * 16, m = 1 + Math.floor(rnd() * 3), w = 2 + rnd() * 8, k = 0.7 + rnd() * 0.5;
      g.strokeStyle = rgb(base, k, 0.35); g.lineWidth = w;
      for (const oy of [-N, 0, N]) {
        g.beginPath();
        for (let x = 0; x <= N; x += 8) { const y = y0 + oy + Math.sin(x / N * 6.2832 * m + i) * amp; x === 0 ? g.moveTo(x, y) : g.lineTo(x, y); }
        g.stroke();
      }
    }
    grain(g, rnd, 36, 4);
    // khe nứt sâu
    for (let i = 0; i < 40; i++) {
      let x = rnd() * N, y = rnd() * N;
      const pts = [[x, y]];
      for (let k = 0; k < 7; k++) { x += (rnd() - 0.5) * 40; y += (rnd() - 0.5) * 40; pts.push([x, y]); }
      for (const [ox, oy] of [[0, 0], [1.2, 1.2]]) {
        g.strokeStyle = ox ? rgb(base, 1.3, 0.35) : rgb(base, 0.35, 0.75); g.lineWidth = ox ? 0.8 : 1.4;
        g.beginPath(); pts.forEach((p, j) => j ? g.lineTo(p[0] + ox, p[1] + oy) : g.moveTo(p[0] + ox, p[1] + oy)); g.stroke();
      }
    }
    // địa y / rêu bám
    blotches(g, rnd, 50, lichen, 3, 14, 0.3, 0.6);
    return c;
  }
  function fineTex(base, seed, sandy) {
    const c = canvas(), g = c.getContext('2d'), rnd = rngOf(seed);
    g.fillStyle = rgb(base); g.fillRect(0, 0, N, N);
    blotches(g, rnd, 50, base, 12, 60, 0.3, 0.55, 0.8, 1.18);
    if (sandy) {
      // gợn cát theo gió
      for (let y = 0; y < N; y += 5 + rnd() * 3) {
        g.strokeStyle = rgb(base, 0.82, 0.35); g.lineWidth = 1.4;
        g.beginPath();
        for (let x = 0; x <= N; x += 8) { const yy = y + Math.sin(x * 0.045 + y * 0.3) * 2.2; x ? g.lineTo(x, yy) : g.moveTo(x, yy); }
        g.stroke();
      }
      grain(g, rnd, 22, 6);
    } else {
      grain(g, rnd, 20, 6);
      for (let i = 0; i < 5200; i++) {
        const x = rnd() * N, y = rnd() * N, r = 0.6 + rnd() * 1.9, k = 0.6 + rnd() * 0.7;
        g.fillStyle = rgb(base, 0.5, 0.5); g.beginPath(); g.arc(x + 0.6, y + 0.7, r, 0, 6.2832); g.fill();
        g.fillStyle = rgb(base, k * 1.1, 0.95); g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fill();
      }
    }
    return c;
  }
  // Hạt cát mịn đẳng hướng (không vân, không nét vẽ): nhiễu nhiều tầng biên độ nhỏ + hạt khoáng sẫm / thạch anh sáng
  // lấm tấm. Độ tương phản thấp -> lặp lại không lộ khuôn; gợn cát & mô cát do shader dựng thành hình khối (nhận nắng)
  function sandGrainTex(base, seed) {
    const c = canvas(), g = c.getContext('2d'), rnd = rngOf(seed);
    const img = g.createImageData(N, N), d = img.data;
    const oct = [[4, 0.35], [16, 0.3], [64, 0.22], [256, 0.13]].map(([cells, amp]) => {
      const v = new Float32Array(cells * cells); for (let i = 0; i < v.length; i++) v[i] = rnd() - 0.5;
      return { cells, amp, v };
    });
    const sm = t => t * t * (3 - 2 * t);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let n = 0;
      for (const o of oct) {
        const fx = x / N * o.cells, fy = y / N * o.cells, ix = Math.floor(fx), iy = Math.floor(fy), tx = sm(fx - ix), ty = sm(fy - iy);
        const at = (i, j) => o.v[((j % o.cells + o.cells) % o.cells) * o.cells + ((i % o.cells + o.cells) % o.cells)];
        n += ((at(ix, iy) * (1 - tx) + at(ix + 1, iy) * tx) * (1 - ty) + (at(ix, iy + 1) * (1 - tx) + at(ix + 1, iy + 1) * tx) * ty) * o.amp;
      }
      const k = (y * N + x) * 4, f = 1 + n * 0.22 + (rnd() - 0.5) * 0.07;
      d[k] = base[0] * f; d[k + 1] = base[1] * f; d[k + 2] = base[2] * (f * 0.98 + 0.02); d[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    // hạt khoáng sẫm (magnetit, mảnh đá) và thạch anh sáng: 1-2 điểm ảnh, thưa
    for (let i = 0; i < 2600; i++) {
      const x = rnd() * N, y = rnd() * N, dark = rnd() < 0.55, k = dark ? 0.55 + rnd() * 0.25 : 1.12 + rnd() * 0.12;
      g.fillStyle = rgb(base, k, 0.55 + rnd() * 0.35); g.fillRect(x, y, rnd() < 0.7 ? 1 : 1.6, 1);
    }
    return c;
  }
  // Nhiễu giá trị nhiều tầng, lặp liền theo ô N (dùng cho ảnh hạt mịn)
  function octaves(rnd, specs) {
    const L = specs.map(([cells, amp]) => {
      const v = new Float32Array(cells * cells); for (let i = 0; i < v.length; i++) v[i] = rnd() - 0.5;
      return { cells, amp, v };
    });
    const sm = t => t * t * (3 - 2 * t);
    return (x, y) => {
      let n = 0;
      for (const o of L) {
        const fx = x / N * o.cells, fy = y / N * o.cells, ix = Math.floor(fx), iy = Math.floor(fy), tx = sm(fx - ix), ty = sm(fy - iy);
        const at = (i, j) => o.v[((j % o.cells + o.cells) % o.cells) * o.cells + ((i % o.cells + o.cells) % o.cells)];
        n += ((at(ix, iy) * (1 - tx) + at(ix + 1, iy) * tx) * (1 - ty) + (at(ix, iy + 1) * (1 - tx) + at(ix + 1, iy + 1) * tx) * ty) * o.amp;
      }
      return n;
    };
  }
  // Nền cỏ nhìn từ xa vài chục mét: hạt mịn đẳng hướng ít tương phản, pha xanh <-> khô / lá mục theo mảng nhỏ, lấm tấm
  // đất lộ kẽ cỏ & ngọn cỏ khô. Không vẽ nét cỏ (nét vẽ lặp lại thành "thảm nỉ"); khóm cỏ nổi khối do shader dựng
  function grassGrainTex(base, alt, soil, seed, altAmt = 0.45) {
    const c = canvas(), g = c.getContext('2d'), rnd = rngOf(seed);
    const img = g.createImageData(N, N), d = img.data;
    const lumN = octaves(rnd, [[4, 0.3], [16, 0.3], [64, 0.25], [256, 0.15]]), hueN = octaves(rnd, [[8, 0.5], [32, 0.35], [128, 0.15]]);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const m = Math.max(0, Math.min(1, 0.5 + hueN(x, y) * 1.6)) * altAmt, f = 1 + lumN(x, y) * 0.26 + (rnd() - 0.5) * 0.06;
      const k = (y * N + x) * 4;
      for (let ch = 0; ch < 3; ch++) d[k + ch] = (base[ch] + (alt[ch] - base[ch]) * m) * f;
      d[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    for (let i = 0; i < 3400; i++) { g.fillStyle = rgb(soil, 0.55 + rnd() * 0.3, 0.45 + rnd() * 0.35); g.fillRect(rnd() * N, rnd() * N, 1, 1); }
    for (let i = 0; i < 2200; i++) { g.fillStyle = rgb(alt, 1.05 + rnd() * 0.15, 0.4 + rnd() * 0.3); g.fillRect(rnd() * N, rnd() * N, 1, rnd() < 0.5 ? 1 : 2); }
    return c;
  }
  function concreteTex(base, seed) {
    const c = canvas(), g = c.getContext('2d'), rnd = rngOf(seed);
    g.fillStyle = rgb(base); g.fillRect(0, 0, N, N);
    blotches(g, rnd, 70, base, 16, 80, 0.25, 0.55, 0.72, 1.2);
    grain(g, rnd, 24, 3);
    // không vẽ khe tấm bê tông thẳng hàng trong ô lặp (in thành lưới đều khắp bản đồ) — vá / nứt / nắp cống do shader rải theo vị trí
    for (let i = 0; i < 30; i++) {
      let x = rnd() * N, y = rnd() * N; g.strokeStyle = rgb(base, 0.45, 0.6); g.lineWidth = 0.9;
      g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (rnd() - 0.5) * 28; y += (rnd() - 0.5) * 28; g.lineTo(x, y); } g.stroke();
    }
    blotches(g, rnd, 30, [70, 90, 50], 3, 10, 0.25, 0.5);   // rêu cỏ mọc khe
    return c;
  }

  const BIOMES = {
    HIGHLAND: { base: () => grassTex([86, 94, 58], [138, 126, 82], 11), dirt: () => dirtTex([98, 86, 70], 12), rock: () => rockTex([102, 99, 93], [136, 136, 84], 13), fine: () => fineTex([104, 98, 86], 14, false) },
    RIVER_LAKE: { base: () => grassTex([80, 96, 50], [132, 126, 76], 21), dirt: () => dirtTex([96, 84, 64], 22), rock: () => rockTex([104, 100, 90], [104, 122, 66], 23), fine: () => fineTex([134, 125, 100], 24, true) },
    JUNGLE: { base: () => grassTex([56, 72, 38], [96, 90, 50], 31), dirt: () => dirtTex([84, 70, 52], 32), rock: () => rockTex([100, 96, 84], [80, 110, 60], 33), fine: () => fineTex([82, 72, 50], 34, false) },
    DESERT: { base: () => fineTex([206, 172, 124], 41, true), dirt: () => dirtTex([178, 140, 98], 42), rock: () => rockTex([164, 128, 96], [190, 160, 110], 43), fine: () => grassTex([150, 140, 92], [176, 160, 110], 44) },
    URBAN: { base: () => concreteTex([106, 105, 100], 51), dirt: () => dirtTex([110, 100, 84], 52), rock: () => rockTex([112, 108, 102], [90, 100, 70], 53), fine: () => grassTex([88, 98, 60], [140, 130, 84], 54) }
  };

  function layers(mapType) {
    const key = BIOMES[mapType] ? mapType : 'HIGHLAND';
    if (TEX[key]) return TEX[key];
    const mk = cv => { const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t; };
    const B = BIOMES[key];
    TEX[key] = { base: mk(B.base()), dirt: mk(B.dirt()), rock: mk(B.rock()), fine: mk(B.fine()) };
    if (key === 'DESERT') TEX[key].grain = mk(sandGrainTex([206, 172, 124], 45));
    // cỏ: hạt mịn (xanh <-> khô / lá mục); đất: hạt đất mịn — sỏi, cục đất nổi khối do shader dựng
    const GRASS = {
      HIGHLAND: [[84, 92, 58], [136, 124, 82], 0.45],
      RIVER_LAKE: [[80, 90, 54], [128, 122, 78], 0.4],
      JUNGLE: [[58, 68, 40], [92, 76, 50], 0.55]
    }[key];
    const SOIL = { HIGHLAND: [98, 86, 70], RIVER_LAKE: [96, 84, 64], JUNGLE: [76, 63, 47], DESERT: [178, 140, 98], URBAN: [110, 100, 84] }[key];
    if (GRASS) TEX[key].grain = mk(grassGrainTex(GRASS[0], GRASS[1], SOIL, 61, GRASS[2]));
    TEX[key].soil = mk(sandGrainTex(SOIL, 62));
    return TEX[key];
  }

  // Nhiễu tầng lớn lặp liền (R, G, B: 3 kênh nhiễu độc lập) cho mặt nạ trộn lớp & bóng mây
  function noiseTex() {
    if (TEX.noise) return TEX.noise;
    const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d'), img = g.createImageData(S, S), d = img.data;
    // Nhiễu gradient tuần hoàn (chu kỳ = số ô), 4 tầng — không lộ lưới vuông như nhiễu giá trị
    const perlin = (seed, cells) => {
      const rnd = rngOf(seed), gx = new Float32Array(cells * cells), gy = new Float32Array(cells * cells);
      for (let i = 0; i < gx.length; i++) { const a = rnd() * Math.PI * 2; gx[i] = Math.cos(a); gy[i] = Math.sin(a); }
      const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
      return (x, y) => {
        const fx0 = x / S * cells, fy0 = y / S * cells, ix = Math.floor(fx0), iy = Math.floor(fy0), fx = fx0 - ix, fy = fy0 - iy;
        const dot = (i, j, dx, dy) => { const k = (((j % cells) + cells) % cells) * cells + (((i % cells) + cells) % cells); return gx[k] * dx + gy[k] * dy; };
        const u = fade(fx), v = fade(fy);
        const n00 = dot(ix, iy, fx, fy), n10 = dot(ix + 1, iy, fx - 1, fy), n01 = dot(ix, iy + 1, fx, fy - 1), n11 = dot(ix + 1, iy + 1, fx - 1, fy - 1);
        return (n00 + (n10 - n00) * u) * (1 - v) + (n01 + (n11 - n01) * u) * v;   // ~[-0.7, 0.7]
      };
    };
    const ch = [0, 1, 2].map(c3 => [perlin(11 + c3 * 7, 4), perlin(12 + c3 * 7, 8), perlin(13 + c3 * 7, 16), perlin(14 + c3 * 7, 32)]);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const k = (y * S + x) * 4;
      for (let c3 = 0; c3 < 3; c3++) {
        const f = ch[c3];
        const n = f[0](x, y) * 0.5 + f[1](x, y) * 0.27 + f[2](x, y) * 0.15 + f[3](x, y) * 0.08;
        d[k + c3] = Math.max(0, Math.min(255, (0.5 + n * 0.95) * 255));
      }
      d[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return (TEX.noise = t);
  }

  // Màu trung bình của ảnh nền cũ -> dùng để lấy "độ lệch màu" tầng lớn
  function averageColor(cv) {
    if (cv._gAvg) return cv._gAvg.clone();
    const g = cv.getContext('2d'), S = 48, img = g.getImageData(0, 0, cv.width, cv.height).data;
    let r = 0, gg = 0, b = 0, n = 0;
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const x = Math.floor((i + 0.5) / S * cv.width), y = Math.floor((j + 0.5) / S * cv.height), k = (y * cv.width + x) * 4;
      r += img[k]; gg += img[k + 1]; b += img[k + 2]; n++;
    }
    cv._gAvg = new THREE.Vector3(r / n / 255, gg / n / 255, b / n / 255);
    return cv._gAvg.clone();
  }

  /**
   * Bản đồ pháp tuyến mượt của địa hình (1024², ~3.5 đơn vị/điểm) dựng từ lưới độ cao bằng nội suy bậc ba.
   * Dùng cho ánh sáng & độ dốc thay cho pháp tuyến nội suy theo tam giác (vốn in hình lưới ô vuông lên mặt đất).
   */
  function bakeNormals(T) {
    if (T._gBake && T._gBake.map === T.map) return T._gBake;
    const N = Math.min(2048, Math.round(T.width / 3600 * 4) * 256), size = T.width, half = size / 2, S = T.segments, NN = S + 1, H = T.heightData, cell = size / S, px = size / N;
    const cr = (p0, p1, p2, p3, t) => p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
    const hv = (i, j) => H[Math.max(0, Math.min(S, j)) * NN + Math.max(0, Math.min(S, i))];
    const W = N + 2, hb = new Float32Array(W * W);
    for (let j = -1; j <= N; j++) for (let i = -1; i <= N; i++) {
      const gx = (i + 0.5) * px / cell, gz = (j + 0.5) * px / cell, ix = Math.floor(gx), iz = Math.floor(gz), fx = gx - ix, fz = gz - iz;
      const r0 = cr(hv(ix - 1, iz - 1), hv(ix, iz - 1), hv(ix + 1, iz - 1), hv(ix + 2, iz - 1), fx);
      const r1 = cr(hv(ix - 1, iz), hv(ix, iz), hv(ix + 1, iz), hv(ix + 2, iz), fx);
      const r2 = cr(hv(ix - 1, iz + 1), hv(ix, iz + 1), hv(ix + 1, iz + 1), hv(ix + 2, iz + 1), fx);
      const r3 = cr(hv(ix - 1, iz + 2), hv(ix, iz + 2), hv(ix + 1, iz + 2), hv(ix + 2, iz + 2), fx);
      hb[(j + 1) * W + (i + 1)] = cr(r0, r1, r2, r3, fz);
    }
    const data = new Uint8Array(N * N * 4), ny = new Float32Array(N * N);
    // Độ lõm / lồi của địa hình (kênh alpha): hõm trũng giữ ẩm -> cỏ xanh đậm, tối hơn; gờ lồi khô -> vàng nhạt hơn.
    // Đo ở 2 tầm (~18 m và ~6 m) -> mặt đất có "địa mạo" thật thay vì phủ một màu đều như thảm.
    const hAt = (i, j) => hb[(Math.max(-1, Math.min(N, j)) + 1) * W + Math.max(-1, Math.min(N, i)) + 1];
    const cavOf = (i, j, r) => ((hAt(i - r, j) + hAt(i + r, j) + hAt(i, j - r) + hAt(i, j + r)) * 0.25 - hAt(i, j)) / (r * px);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const dx = (hb[(j + 1) * W + i + 2] - hb[(j + 1) * W + i]) / (2 * px), dz = (hb[(j + 2) * W + i + 1] - hb[j * W + i + 1]) / (2 * px);
      const l = Math.hypot(dx, 1, dz), nx = -dx / l, nyy = 1 / l, nz = -dz / l, k = (j * N + i) * 4;
      data[k] = (nx * 0.5 + 0.5) * 255; data[k + 1] = (nyy * 0.5 + 0.5) * 255; data[k + 2] = (nz * 0.5 + 0.5) * 255;
      const cav = cavOf(i, j, 40) * 0.6 + cavOf(i, j, 14) * 0.4;
      data[k + 3] = Math.max(0, Math.min(255, 128 + cav * 420));
      ny[j * N + i] = nyy;
    }
    const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
    tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.needsUpdate = true;
    // độ dốc (1 - ny) tại điểm thế giới, nội suy song tuyến — dùng cho lớp cỏ / đá 3D cho khớp với shader
    const slopeAt = (x, z) => {
      const fx = Math.max(0, Math.min(N - 1.001, (x + half) / px - 0.5)), fz = Math.max(0, Math.min(N - 1.001, (z + half) / px - 0.5));
      const i = fx | 0, j = fz | 0, tx = fx - i, tz = fz - j, a = j * N + i;
      return 1 - ((ny[a] * (1 - tx) + ny[a + 1] * tx) * (1 - tz) + (ny[a + N] * (1 - tx) + ny[a + N + 1] * tx) * tz);
    };
    T._gBake = { map: T.map, tex, slopeAt, size, half };
    return T._gBake;
  }

  /**
   * Gắn shader lên vật liệu mặt đất (MeshStandardMaterial có map = ảnh màu bản đồ cũ)
   * opts: { mapType, macroCanvas, water, ownNormals }
   * ownNormals: dùng pháp tuyến của chính lưới (công trình đắp đất nằm trên địa hình, vd ụ đất cứ điểm)
   *   thay cho pháp tuyến nướng sẵn của địa hình -> cùng màu / vật liệu với mặt đất nhưng sáng tối theo hình khối riêng
   */
  function apply(mat, opts) {
    const L = layers(opts.mapType);
    const noise = noiseTex();
    const avg = opts.macroCanvas ? averageColor(opts.macroCanvas) : new THREE.Vector3(0.5, 0.5, 0.5);
    mat.extensions = Object.assign({}, mat.extensions || {}, { derivatives: true });
    const desert = opts.mapType === 'DESERT', urban = opts.mapType === 'URBAN';
    const bake = opts.terrain ? bakeNormals(opts.terrain) : null;
    // Hướng gió (vuông góc với đỉnh gợn cát): lệch ~20° so với hướng nắng của bản đồ -> gợn luôn có mặt sáng / mặt khuất
    // rõ ràng (nắng song song với đỉnh gợn thì gợn gần như vô hình)
    const sunD = opts.terrain && opts.terrain.atmosphere && opts.terrain.atmosphere.sunDir;
    const windA = sunD ? Math.atan2(sunD.z, sunD.x) + 0.35 : 0.65;
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, {
        gBase: { value: L.base }, gDirt: { value: L.dirt }, gRock: { value: L.rock }, gFine: { value: L.fine },
        gNoise: { value: noise }, gMacroAvg: { value: avg }, gTime: uTime, gWaterLvl: { value: opts.waterLvl !== undefined ? opts.waterLvl : opts.water ? 2.5 : -999 },
        gNrm: { value: bake ? bake.tex : null }, gTerr: { value: new THREE.Vector2(bake ? bake.half : 1800, bake ? bake.size : 3600) },
        gGrain: { value: L.grain || null }, gWindA: { value: windA }, gSoil: { value: L.soil || null }
      });
      // độ che khuất quanh chân nhà (Destructibles.buildingInfo, cùng object -> cập nhật khi dựng nhà xong)
      const BI = typeof Destructibles !== 'undefined' && Destructibles.buildingInfo;
      sh.uniforms.gBldOcc = BI ? BI.uBldOcc : { value: null };
      sh.uniforms.gBldGrid = BI ? BI.uBldGrid : { value: new THREE.Vector4(0, 0, 0, 0) };
      sh.vertexShader = 'varying vec3 vGW;\nvarying vec3 vGN;\n' + sh.vertexShader.replace(
        '#include <project_vertex>',
        '#include <project_vertex>\n  vGW = (modelMatrix * vec4(transformed, 1.0)).xyz;\n  vGN = normalize(mat3(modelMatrix) * objectNormal);'
      );
      sh.fragmentShader = `uniform sampler2D gBase, gDirt, gRock, gFine, gNoise, gNrm, gBldOcc;
uniform vec2 gTerr;
uniform vec4 gBldGrid;
#if __VERSION__ >= 300
#define GTEXG(s, uv, dx, dy) textureGrad(s, uv, dx, dy)
#else
#define GTEXG(s, uv, dx, dy) texture2D(s, uv)
#endif
// Phá lặp texture: mỗi vùng lấy ảnh với độ lệch ngẫu nhiên khác nhau, chuyển tiếp mượt giữa các vùng
// (không còn một khuôn mẫu in đi in lại theo chu kỳ)
vec4 noTile(sampler2D samp, vec2 uv, float seed) {
  float k = texture2D(gNoise, 0.0045 * uv + seed).r;
  vec2 dx = dFdx(uv), dy = dFdy(uv);
  float l = k * 8.0, f = fract(l), ia = floor(l), ib = ia + 1.0;
  vec2 offa = sin(vec2(3.0, 7.0) * ia + seed * 11.0), offb = sin(vec2(3.0, 7.0) * ib + seed * 11.0);
  vec4 ca = GTEXG(samp, uv + offa, dx, dy), cb = GTEXG(samp, uv + offb, dx, dy);
  float dd = dot(ca.rgb - cb.rgb, vec3(1.0));
  return mix(ca, cb, smoothstep(0.2, 0.8, f - 0.1 * dd));
}
// loang lổ mô đất cỡ vừa (dùng cả cho màu lẫn độ lồi lõm)
float gMotF(vec2 p) {
  vec2 a = mat2(0.94, 0.342, -0.342, 0.94) * p, b = mat2(0.866, -0.5, 0.5, 0.866) * p;
  return noTile(gNoise, a / 26.0 + 0.13, 0.31).g * 0.6 + noTile(gNoise, b / 9.0 + 0.71, 0.77).r * 0.4;
}
uniform vec3 gMacroAvg;
uniform float gTime, gWaterLvl;
varying vec3 vGW;
varying vec3 vGN;
vec3 g2(sampler2D t, vec2 p, float s) {
  // 2 tỉ lệ + lệch hướng: phá vỡ ô lặp
  vec3 a = noTile(t, p / s, 0.0).rgb;
  vec2 q = mat2(0.8, -0.6, 0.6, 0.8) * p;
  vec3 b = noTile(t, q / (s * 3.7) + 0.37, 0.53).rgb;
  return mix(a, b, 0.38) * vec3(1.0);
}
float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
uniform sampler2D gSoil;
vec2 gHs2(vec2 p) { p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
// Ụ nổi khối rải ngẫu nhiên theo ô (khóm cỏ, hòn sỏi, cục đất): mỗi ô một ụ lệch vị trí, cỡ & cao riêng; dens = tỉ lệ ô có ụ.
// Dựng theo vị trí thế giới -> không lặp khuôn. Mờ dần khi một ô nhỏ hơn ~4-10 điểm ảnh (không lấp lánh ở xa)
float gBumps(vec2 p, float cell, float dens) {
  vec2 q = p / cell, b = floor(q), f = fract(q);
  float h = 0.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 o = vec2(float(i), float(j)), r = gHs2(b + o);
    if (fract(r.x * 13.7 + r.y * 3.1) > dens) continue;
    vec2 d = o + 0.2 + r * 0.6 - f;
    float rad = 0.4 + 0.3 * fract(r.x * 7.13);
    float k = max(0.0, 1.0 - dot(d, d) / (rad * rad));
    h = max(h, k * k * (0.55 + 0.45 * r.y));
  }
  return h * (1.0 - smoothstep(0.1, 0.25, max(fwidth(q.x), fwidth(q.y))));
}
${desert ? `// ---- CÁT SA MẠC: nền gần như một màu (hạt mịn, đổi sắc nhẹ theo mảng lớn); cái mắt thấy là ÁNH SÁNG trên gợn cát
uniform sampler2D gGrain;
uniform float gWindA;
// Pha gợn cát: một hướng gió chính, đỉnh gợn gần song song, chỉ uốn nhẹ. Méo miền phải êm (độ dốc của độ lệch << 1),
// nếu không đỉnh gợn gập ngược thành vòng khép kín như vân tay / vân gỗ. Nhiễu lấy ở mip thô (bias) để bỏ tầng tần số cao.
// Độ cao mặt đất quanh điểm đang tô (đặt trong main): gợn cát uốn theo sườn đụn — đỉnh gợn xoay dần theo đường đồng mức
vec2 gRipP0, gRipHG; float gRipH0;
float gRipPh(vec2 p) {
  vec2 d = vec2(cos(gWindA), sin(gWindA));
  vec2 w1 = texture2D(gNoise, p / 1200.0 + 0.11, 2.0).rg - 0.5;     // hướng gió đổi chậm theo vùng (~±6°)
  vec3 w2 = texture2D(gNoise, p / 260.0 + 0.57, 2.0).rgb - 0.5;     // đỉnh gợn lượn nhẹ + bước gợn dãn / nén ~10%
  vec2 q = p + w1 * 16.0 + w2.rg * 5.0;
  float hgt = gRipH0 + dot(p - gRipP0, gRipHG);
  // bước gợn ~2 đơn vị (~25 cm, như gợn cát gió thật); độ cao địa hình lệch pha -> gợn bẻ theo sườn đụn (độ dốc pha luôn > 0, không gập)
  return dot(q, d) / 2.0 + w2.b * 1.8 + hgt * 0.3;
}
// hệ gợn thứ 2 (đợt gió khác, lệch ~30°, bước dài hơn ~35%) — mỗi vùng cát mang một hệ gợn riêng, không phủ một kiểu khắp bản đồ
float gRipPh2(vec2 p) {
  vec2 d = vec2(cos(gWindA + 0.52), sin(gWindA + 0.52));
  vec3 w2 = texture2D(gNoise, p / 230.0 + 0.29, 2.0).rgb - 0.5;
  vec2 q = p + w2.rg * 5.0;
  return dot(q, d) / 2.7 + w2.b * 1.6 + (gRipH0 + dot(p - gRipP0, gRipHG)) * 0.3;
}
// gợn đứt đoạn / rẽ nhánh chữ Y dày (mỗi 1-3 m): dọc đường lệch, đỉnh gợn chuyển sang hàng lệch nửa bước; đỉnh cao thấp dọc chiều dài
float gRipAsym(float t) { return smoothstep(0.0, 0.72, t) * (1.0 - smoothstep(0.72, 1.0, t)); }
float gRipY(vec3 jm, float ph) {
  float y = mix(gRipAsym(fract(ph)), gRipAsym(fract(ph + 0.5)), smoothstep(0.46, 0.54, jm.r));
  return y * (0.35 + 0.65 * smoothstep(0.28, 0.62, jm.g)) * (0.7 + 0.3 * jm.b);
}
// một hệ gợn: gần = sóng bất đối xứng có chữ Y; xa dần = sóng sin mượt rồi tắt sớm (gợn < ~12 điểm ảnh thì không còn vẽ),
// ở tầm camera trận mặt cát xa trông mịn như thật thay vì phủ sọc li ti đều tăm tắp
float gRipOne(vec3 jm, float ph) {
  float fw = fwidth(ph);
  return mix(gRipY(jm, ph), 0.5 - 0.5 * cos(6.2832 * fract(ph)), smoothstep(0.02, 0.06, fw)) * (1.0 - smoothstep(0.05, 0.11, fw));
}
// Độ cao gợn 0..1: sườn đón gió thoải (70%), sườn khuất gió dốc (30%); có vạt cát phẳng không gợn; mờ dần khi
// một gợn nhỏ hơn ~3-5 điểm ảnh (ở xa) để không sinh vân nhiễu / răng cưa
float gRip(vec2 p) {
  vec3 jm = texture2D(gNoise, p / 46.0 + 0.37, 0.5).rgb;
  vec3 zn = texture2D(gNoise, p / 380.0 + 0.83, 1.0).rgb;
  // vùng hệ gợn 1 / hệ gợn 2 (ranh giới uốn lượn vài chục mét)
  float reg = smoothstep(0.42, 0.58, zn.b);
  float h = mix(gRipOne(jm, gRipPh(p)), gRipOne(jm.gbr, gRipPh2(p)), reg);
  // vạt cát phẳng (cát nén / vừa bị gió san) xen vạt gợn rõ, 2 tầng cỡ -> mỗi chỗ một khác
  float field = smoothstep(0.36, 0.6, zn.g * 0.65 + texture2D(gNoise, p / 95.0 + 0.21, 1.0).r * 0.35);
  return h * (0.25 + 0.75 * field);
}
` : ''}${urban ? `// ---- NỀN PHỐ: lát ngẫu nhiên theo ô (mỗi ô ~23 m lấy một mảnh ảnh lệch + xoay bất kỳ, biên ô uốn lượn, giữ độ tương phản)
vec2 gH2(vec2 p) { p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
vec3 gStoch(sampler2D t, vec2 wp, float cellM, float texM) {
  vec2 p = wp / cellM + (texture2D(gNoise, wp / 610.0 + 0.19).rg - 0.5) * 0.9;
  vec2 b = floor(p - 0.5), f = fract(p - 0.5);
  vec2 w = smoothstep(0.22, 0.78, f);
  vec2 uv = wp / texM, dx = dFdx(uv), dy = dFdy(uv);
  vec3 mean = texture2D(t, vec2(0.5), 12.0).rgb, acc = vec3(0.0); float ws = 0.0;
  for (int j = 0; j < 2; j++) for (int i = 0; i < 2; i++) {
    vec2 c = b + vec2(float(i), float(j)), h = gH2(c);
    float a = h.x * 6.2832, cs = cos(a), sn = sin(a);
    mat2 R = mat2(cs, -sn, sn, cs);
    float wi = (i == 0 ? 1.0 - w.x : w.x) * (j == 0 ? 1.0 - w.y : w.y);
    acc += (GTEXG(t, R * uv + h * 7.31, R * dx, R * dy).rgb - mean) * wi; ws += wi * wi;
  }
  return mean + acc / sqrt(max(ws, 1e-3));
}
// vá nhựa / vết dầu / nắp cống: rải theo lưới ô có hash (mỗi ô một vị trí, cỡ, góc riêng; phần lớn ô bỏ trống)
float gBoxM(vec2 q, vec2 hs, float aa) { vec2 d = abs(q) - hs; return 1.0 - smoothstep(-aa, aa, max(d.x, d.y)); }
vec3 gUrbanDetail(vec2 wp, vec3 col) {
  float aa = max(fwidth(wp.x), 0.02) * 1.2;
  // mảng vá nhựa chữ nhật (2 lưới khác cỡ, lệch nhau)
  for (int k = 0; k < 2; k++) {
    float S = k == 0 ? 17.0 : 29.0;
    vec2 q0 = wp + (k == 0 ? vec2(3.1, 7.7) : vec2(-11.3, 5.2));
    vec2 id = floor(q0 / S), h = gH2(id + float(k) * 17.0), h2 = gH2(id + 41.7 + float(k));
    if (h.x < (k == 0 ? 0.16 : 0.2)) {
      float a = (h2.x - 0.5) * 0.5 + (h.y < 0.5 ? 0.0 : 1.5708), cs = cos(a), sn = sin(a);
      vec2 q = mat2(cs, -sn, sn, cs) * (q0 - (id + 0.3 + h2 * 0.4) * S);
      vec2 hs = vec2(1.6, 0.9) + h2.yx * vec2(k == 0 ? 4.5 : 8.0, k == 0 ? 1.6 : 2.6);
      float m = gBoxM(q, hs, aa), e = gBoxM(q, hs + 0.12, aa) - m;
      float fresh = h.y;                                  // vá mới: sẫm, mịn; vá cũ: gần màu nền
      col = mix(col, col * mix(0.93, 0.76, fresh) * vec3(0.98, 0.99, 1.02), m);
      col *= 1.0 - e * 0.25;                              // mạch nhựa đường quanh mép vá
    }
  }
  // vết dầu / vệt bẩn loang
  {
    vec2 id = floor(wp / 11.0), h = gH2(id + 7.3);
    float n = texture2D(gNoise, wp / 7.0).r;
    if (h.x < 0.22) {
      vec2 d = wp - (id + 0.2 + gH2(id + 3.1) * 0.6) * 11.0;
      float r = 0.7 + h.y * 1.8;
      float m = 1.0 - smoothstep(r * 0.4, r * (1.1 + n * 0.6), length(d * vec2(1.0, 0.7 + h.y * 0.6)));
      col *= 1.0 - m * 0.32;
    }
  }
  // nắp cống / hố ga gang tròn (Ø ~1 m) có viền bê tông
  {
    vec2 id = floor(wp / 37.0), h = gH2(id + 91.1);
    if (h.x < 0.3) {
      float d = length(wp - (id + 0.25 + gH2(id + 5.9) * 0.5) * 37.0);
      float lid = 1.0 - smoothstep(0.5 - aa, 0.5 + aa, d), ring = (1.0 - smoothstep(0.75 - aa, 0.75 + aa, d)) - lid;
      col = mix(col, vec3(0.2, 0.2, 0.21) * (0.9 + 0.2 * fract(d * 9.0)), lid);
      col = mix(col, col * 1.12, ring);
    }
  }
  return col;
}
` : ''}${desert || urban ? '' : `uniform sampler2D gGrain;
// Mặt thảm cỏ: khóm cỏ thấp hình dạng bất thường (ụ ngẫu nhiên bị nhiễu bẻ méo, cao thấp không đều) + gồ ghề lăn tăn
// của ngọn cỏ (nhiễu mịn, ở xa mipmap tự làm phẳng -> không lấp lánh)
float gTuftH(vec2 p) {
  float b = gBumps(p, 2.2, 0.75) * (0.5 + 0.9 * texture2D(gNoise, p / 2.9 + 0.5).r);
  return b + (texture2D(gNoise, p / 1.4 + 0.2).g - 0.5) * 0.45;
}
`}` + sh.fragmentShader
        .replace('#include <map_fragment>', `
  vec2 wp = vGW.xz;
  // pháp tuyến mượt nướng sẵn (không theo tam giác lưới địa hình)
  vec4 nTex = texture2D(gNrm, (vGW.xz + gTerr.x) / gTerr.y);
  vec3 nrm = ${opts.ownNormals ? 'normalize(vGN)' : 'normalize(nTex.xyz * 2.0 - 1.0)'};
  // độ lõm (+) / lồi (-) của địa hình
  // ngoài mép bản đồ (cảnh nền Backdrop) không còn ảnh nướng sẵn: độ lõm / sắc tầng lớn trung tính dần
  float gInMap = 1.0 - smoothstep(gTerr.x, gTerr.x + 260.0, max(abs(vGW.x), abs(vGW.z)));
  float cav = (nTex.a * 2.0 - 1.0) * gInMap;
  float gWet = smoothstep(0.0, 0.45, cav), gDryR = smoothstep(0.0, 0.45, -cav);
  float slope = 1.0 - clamp(nrm.y, 0.0, 1.0);
  vec2 wr1 = mat2(0.866, -0.5, 0.5, 0.866) * wp, wr2 = mat2(0.423, -0.906, 0.906, 0.423) * wp, wr3 = mat2(0.94, 0.342, -0.342, 0.94) * wp;
  vec3 nz = texture2D(gNoise, wr1 / 1100.0).rgb;
  vec3 nz2 = texture2D(gNoise, wr2 / 260.0 + 0.5).rgb;
  // đất: hạt đất mịn ít tương phản 2 tỉ lệ (cục đất / sỏi nổi khối dựng ở pháp tuyến, không vẽ sẵn sáng tối)
  vec3 soMean = texture2D(gSoil, vec2(0.5), 12.0).rgb;
  vec3 cSoil = soMean + (noTile(gSoil, wp / 8.0, 0.29).rgb - soMean) + (noTile(gSoil, wr1 / 35.0 + 0.4, 0.71).rgb - soMean) * 0.6;
  cSoil *= 0.94 + 0.12 * texture2D(gNoise, wr3 / 60.0 + 0.15).g;
  float gTuft0 = 0.0, wBare = 0.0;
  ${urban ? `// nền phố: lát ngẫu nhiên 2 tỉ lệ (ô 23 m / 140 m, góc khác nhau) -> không còn khuôn 46 m in đi in lại
  vec3 cBase = mix(gStoch(gBase, wp, 23.0, 46.0), gStoch(gBase, mat2(0.8, -0.6, 0.6, 0.8) * wp + 517.0, 140.0, 170.0), 0.34);
  {
    // mảng nhựa sẫm / bê tông bạc màu cỡ 60-200 m + độ mòn tầng vừa (không đều như sơn một lớp)
    vec3 uz = texture2D(gNoise, wr3 / 520.0 + 0.61).rgb;
    float asph = smoothstep(0.36, 0.66, uz.r * 0.7 + nz2.g * 0.3);
    cBase *= mix(vec3(1.1, 1.09, 1.07), vec3(0.83, 0.84, 0.86), asph);
    cBase *= 0.9 + 0.2 * smoothstep(0.25, 0.75, uz.b);
    // vết nứt ngoằn ngoèo theo đường đồng mức của nhiễu (không theo lưới), chỉ ở vùng mặt đường cũ
    float cn = texture2D(gNoise, wr2 / 95.0 + 0.33).g;
    float crk = 1.0 - smoothstep(0.0, fwidth(cn) * 1.3 + 0.0015, abs(cn - 0.5));
    cBase *= 1.0 - crk * 0.4 * smoothstep(0.45, 0.7, uz.g);
    // sân bê tông đổ theo tấm ~4.5 m: mỗi tấm lệch màu nhẹ (mẻ đổ / độ mòn khác nhau), mạch co giãn mảnh sẫm giữa các tấm
    {
      vec2 sp = wp / 36.0, sid = floor(sp), sf = fract(sp), hs = gH2(sid + 3.7);
      cBase *= (0.955 + 0.09 * hs.x) * vec3(1.0, 1.0 - 0.01 * hs.y, 1.0 - 0.02 * hs.y);
      float aaJ = max(fwidth(sp.x), fwidth(sp.y));
      vec2 dj = min(sf, 1.0 - sf);
      float joint = (1.0 - smoothstep(0.005, 0.005 + aaJ * 1.5, min(dj.x, dj.y))) * (1.0 - smoothstep(0.03, 0.08, aaJ));
      cBase *= 1.0 - joint * 0.32;
    }
    cBase = gUrbanDetail(wp, cBase);
  }` : desert ? `// cát: màu trung bình + hạt mịn 2 tỉ lệ (độ tương phản thấp), sắc cát đổi rất nhẹ theo mảng trăm mét
  vec3 sMean = texture2D(gGrain, vec2(0.5), 12.0).rgb;
  vec3 cBase = sMean + (noTile(gGrain, wp / 7.0, 0.41).rgb - sMean) + (noTile(gGrain, wr2 / 37.0 + 0.2, 0.63).rgb - sMean) * 0.5;
  cBase *= mix(vec3(1.035, 1.0, 0.95), vec3(0.965, 0.985, 1.03), smoothstep(0.3, 0.7, texture2D(gNoise, wr3 / 900.0 + 0.4).r));
  cBase *= 0.94 + 0.12 * texture2D(gNoise, wr1 / 170.0 + 0.2).g;   // mảng cát sáng (mới bồi) / sẫm (hạt thô đọng) vài chục mét
  // gợn cát: đỉnh gợn hạt thô sáng hơn chút, rãnh gợn đọng hạt mịn sẫm hơn (phần chính là bóng / nắng ở pháp tuyến)
  gRipP0 = wp; gRipH0 = vGW.y; gRipHG = -nrm.xz / max(nrm.y, 0.35);
  float gRip0 = gRip(wp);
  cBase *= 0.98 + 0.045 * gRip0;
  {
    // vệt cát dài xuôi gió (cát bay đọng thành dải sáng / sẫm dài vài chục mét) — chi tiết còn đọc được khi gợn đã mờ ở xa
    vec2 dW = vec2(cos(gWindA), sin(gWindA));
    float st = texture2D(gNoise, vec2(dot(wp, dW) / 700.0, dot(wp, vec2(-dW.y, dW.x)) / 60.0) + 0.71).b;
    cBase *= 0.95 + 0.1 * smoothstep(0.3, 0.7, st);
  }` : `// cỏ: hạt mịn ít tương phản 2 tỉ lệ; khóm cỏ nổi khối (kẽ khóm lộ đất sẫm); vạt đất trụi nhỏ lấm tấm
  vec3 gMean = texture2D(gGrain, vec2(0.5), 12.0).rgb;
  vec3 cBase = gMean + (noTile(gGrain, wp / 9.0, 0.41).rgb - gMean) + (noTile(gGrain, wr2 / 43.0 + 0.2, 0.63).rgb - gMean) * 0.6;
  gTuft0 = gTuftH(wp);
  cBase = mix(cSoil * ${opts.mapType === 'JUNGLE' ? '0.8' : '0.9'}, cBase, 0.86 + 0.14 * smoothstep(-0.1, 0.35, gTuft0));
  cBase *= 1.0 + 0.05 * clamp(gTuft0, 0.0, 1.0) * vec3(1.0, 1.0, 0.85);
  wBare = smoothstep(0.6, 0.8, texture2D(gNoise, wr1 / 13.0 + 0.37).r * 0.65 + texture2D(gNoise, wr2 / 4.5 + 0.1).g * 0.35) * ${opts.mapType === 'JUNGLE' ? '0.85' : '0.5'};
  cBase = mix(cBase, cSoil, wBare);`}
  ${desert || urban ? '' : `// cỏ khô / cỏ xanh xen kẽ theo mảng lớn (đồng cỏ thật không đều màu)
  float dryM = smoothstep(0.38, 0.72, nz2.b * 0.6 + nz.g * 0.4);
  cBase *= mix(vec3(1.0), vec3(1.12, 1.03, 0.8), dryM * 0.7);`}
  vec3 cDirt = cSoil;
  float gPeb0 = gBumps(wp, 1.3, 0.45);   // sỏi / cục đất trên lớp đất
  vec3 cFine = g2(gFine, wp, 34.0);
  // đá: chiếu 3 phía theo pháp tuyến (vách dốc không bị kéo giãn)
  vec3 bw = pow(abs(nrm), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
  vec3 cRock = noTile(gRock, vGW.zy / 52.0, 0.21).rgb * bw.x + g2(gRock, wp, 52.0) * bw.y + noTile(gRock, vGW.xy / 52.0, 0.67).rgb * bw.z;
  // mặt nạ trộn: độ dốc -> đá; nhiễu tầng lớn -> mảng đất trống / bãi sỏi; ven nước -> bùn đất
  float wDirt = smoothstep(0.5, 0.82, nz.r * 0.55 + nz2.g * 0.45 + (nz2.b - 0.5) * 0.2) * 0.85;
  wDirt = max(wDirt, smoothstep(gWaterLvl + 6.0, gWaterLvl, vGW.y) * 0.85);
  wDirt = max(wDirt, smoothstep(0.1, 0.3, slope) * 0.75);            // sườn vừa dốc: đất trơ trước khi lộ đá
  float wFine = smoothstep(0.6, 0.78, nz.g + (nz2.b - 0.5) * 0.3) * ${desert || urban ? '0.75' : '0.6'};
  float wRock = smoothstep(${desert ? '0.3, 0.52' : '0.2, 0.42'}, slope + (nz2.r - 0.5) * 0.14);
  // trộn theo "độ cao" của từng lớp: chỗ chuyển tiếp lởm chởm tự nhiên thay vì mờ đều
  float hB = lum(cBase), hD = lum(cDirt), hF = lum(cFine), hR = lum(cRock);
  vec3 col = cBase; float hh = hB;
  float t1 = clamp((wFine - 0.5) * 1.8 + (hF - hh) * 1.6 + 0.5, 0.0, 1.0) * smoothstep(0.0, 0.15, wFine); col = mix(col, cFine, t1); hh = mix(hh, hF, t1);
  float t2 = clamp((wDirt - 0.5) * 1.8 + (hD - hh) * 1.6 + 0.5, 0.0, 1.0) * smoothstep(0.0, 0.15, wDirt); col = mix(col, cDirt, t2); hh = mix(hh, hD, t2);
  float t3 = clamp((wRock - 0.5) * 2.2 + (hR - hh) * 2.0 + 0.5, 0.0, 1.0) * smoothstep(0.0, 0.12, wRock); col = mix(col, cRock, t3); hh = mix(hh, hR, t3);
  col *= 1.0 + 0.07 * gPeb0 * t2 * (1.0 - t3);
  // bãi cát / cồn cát sát mặt nước (map sông hồ): dải thấp sát nước; phủ ở CUỐI (sau mọi lớp loang của cỏ) cho mịn
  float gSand = smoothstep(gWaterLvl + 1.4, gWaterLvl - 1.2, vGW.y) * smoothstep(gWaterLvl - 6.0, gWaterLvl - 3.6, vGW.y) * (1.0 - t3);
  // pha màu tầng lớn từ ảnh nền cũ (thảm thực vật, vệt ẩm, nền đường, đáy sông)
  vec3 macro = texture2D(map, vUv, 3.0).rgb;   // bản mờ: chỉ lấy sắc độ tầng lớn, không lộ điểm ảnh
  vec3 tint = clamp(macro / max(gMacroAvg, vec3(0.05)), vec3(0.5), vec3(1.7));
  col *= mix(vec3(1.0), tint, 0.35 * gInMap);
  // thay đổi sắc độ nhẹ tầng rất lớn (đồng cỏ không đều màu)
  col *= 0.9 + 0.2 * nz.b;
  // ĐỊA MẠO: hõm trũng giữ ẩm (xanh đậm / tối), gờ lồi khô nắng (vàng nhạt) — như ảnh chụp thật từ trên cao
  col *= mix(vec3(1.0), ${desert ? 'vec3(0.9, 0.87, 0.82)' : urban ? 'vec3(0.88, 0.88, 0.86)' : 'vec3(0.74, 0.85, 0.7)'}, gWet)
       * mix(vec3(1.0), ${desert ? 'vec3(1.06, 1.05, 1.02)' : urban ? 'vec3(1.04, 1.04, 1.03)' : 'vec3(1.12, 1.02, 0.82)'}, gDryR);
  ${desert || urban ? '' : `// mảng cỏ tốt / cỏ úa cỡ ~50 m (đổi cả sắc độ, không chỉ độ sáng) — còn đọc được từ camera trên cao
  float pv = smoothstep(0.32, 0.68, texture2D(gNoise, wr3 / 420.0 + 0.27).g);
  col *= mix(vec3(0.84, 0.93, 0.8), vec3(1.09, 1.0, 0.84), pv);`}
  // loang lổ cỡ vừa (khóm cỏ / vạt đất 2-6 m) — chi tiết còn đọc được từ camera trên cao
  float mot = gMotF(wp);
  col *= ${desert ? '0.95 + 0.1 * mot' : urban ? '0.95 + 0.1 * mot' : '0.88 + 0.24 * mot'};   // cát / bê tông: chỉ loang rất nhẹ
  ${desert || urban ? '' : `// đồng cỏ thật nhìn từ xa ngả xanh ô-liu dịu, không xanh chói như sân golf (bản đồ sáng nắng dễ bị chói màu nhất)
  col = mix(vec3(lum(col)), col, ${opts.mapType === 'RIVER_LAKE' ? '0.74' : opts.mapType === 'JUNGLE' ? '0.88' : '0.92'});`}
  ${urban ? `// đồi quanh thành phố (vành núi + cảnh nền ngoài bản đồ) phủ cỏ: chuyển dần theo đường vuông bo góc lượn sóng
  // (bám chân vành núi: theo trục gần, theo đường chéo xa), không thành vòng tròn
  float gRd = mix(length(vGW.xz), max(abs(vGW.x), abs(vGW.z)), 0.5) + 420.0 * (texture2D(gNoise, wp / 1700.0 + 0.21).g - 0.5);
  col *= mix(vec3(1.0), vec3(0.8, 0.97, 0.68), smoothstep(gTerr.x * 0.8, gTerr.x * 0.8 + 650.0, gRd));` : ''}
  if (gSand > 0.001) {
    // cát bồi mịn: một sắc cát, hạt li ti tương phản rất thấp (mờ dần ở xa), đổi sắc nhẹ theo mảng vài chục mét;
    // mép nước / phần ngập nông sẫm ướt dần, bờ cao khô sáng hơn; không vệt, không đốm
    float gD = max(fwidth(wp.x), fwidth(wp.y));
    float sg = (texture2D(gNoise, wr1 / 2.3 + 0.17).r - 0.5) * (1.0 - smoothstep(0.08, 0.3, gD))
             + (texture2D(gNoise, wr2 / 7.5 + 0.61).g - 0.5) * 0.6 * (1.0 - smoothstep(0.3, 1.0, gD));
    // loang nhẹ cỡ vài chục mét (chỗ cát mịn sáng, chỗ lẫn phù sa sẫm hơn) — tương phản thấp, không thành đốm
    float sv = texture2D(gNoise, wr3 / 95.0 + 0.4).b * 0.6 + texture2D(gNoise, wr1 / 31.0 + 0.8).g * 0.4;
    vec3 cSand = mix(vec3(0.47, 0.43, 0.35), vec3(0.55, 0.5, 0.4), smoothstep(0.25, 0.75, sv)) * (1.0 + sg * 0.06);
    float yW = vGW.y - (gWaterLvl - 2.3);                                                     // độ cao so với mặt nước
    cSand *= mix(vec3(0.62, 0.62, 0.64), vec3(1.0), smoothstep(-0.6, 0.15, yW));              // ngập: ướt sẫm
    cSand *= mix(0.84, 1.0, smoothstep(0.15, 1.5, yW));                                        // sát mép nước: cát ẩm
    cSand *= mix(1.0, 1.06, smoothstep(1.2, 3.0, yW));                                         // bờ cao: khô sáng hơn
    col = mix(col, cSand, smoothstep(0.0, 0.6, gSand));
  }
  diffuseColor.rgb *= col;

`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  {
    // pháp tuyến mượt + mô đất lồi lõm tính bằng hiệu số trên mặt phẳng thế giới (không phụ thuộc tam giác / điểm ảnh)
    float m0 = gMotF(wp), mx = gMotF(wp + vec2(1.8, 0.0)), mz = gMotF(wp + vec2(0.0, 1.8));
    float fadeB = clamp(1.0 - length(vViewPosition) / 1800.0, 0.3, 1.0);
    vec3 nW = normalize(nrm - vec3(mx - m0, 0.0, mz - m0) * ${desert ? '0.9' : urban ? '0.25' : '1.8'} * fadeB * (1.0 - 0.92 * smoothstep(0.0, 0.6, gSand)));
    {
      // khóm cỏ (cao ~0.55 đơn vị) và sỏi / cục đất (~0.25) nổi khối: bước sai phân >= cỡ 1 điểm ảnh trên mặt đất
      float e = max(0.35, max(fwidth(wp.x), fwidth(wp.y)));
      ${desert || urban ? '' : `float tx = gTuftH(wp + vec2(e, 0.0)), tz = gTuftH(wp + vec2(0.0, e));
      nW = normalize(nW - vec3(tx - gTuft0, 0.0, tz - gTuft0) * (0.3 / e) * (1.0 - wBare) * (1.0 - max(t2, t3)) * (1.0 - smoothstep(0.0, 0.6, gSand)));`}
      float px = gBumps(wp + vec2(e, 0.0), 1.3, 0.45), pz = gBumps(wp + vec2(0.0, e), 1.3, 0.45);
      nW = normalize(nW - vec3(px - gPeb0, 0.0, pz - gPeb0) * (0.25 / e) * t2 * (1.0 - t3) * (1.0 - smoothstep(0.0, 0.6, gSand)));
    }
    ${desert ? `// gợn cát nổi khối: cao ~0.3 đơn vị (~4 cm), sườn đón gió ~8°, sườn khuất ~18°; chỉ trên lớp cát nền,
    // nhạt dần trên sườn cồn dốc (cát trượt phẳng) và nơi lộ đất / đá
    {
      // bước sai phân không nhỏ hơn cỡ 1 điểm ảnh trên mặt đất: ở xa là đạo hàm đã làm mượt, không lấy mẫu thưa
      float e = max(0.45, max(fwidth(wp.x), fwidth(wp.y))), rx = gRip(wp + vec2(e, 0.0)), rz = gRip(wp + vec2(0.0, e));
      float k = 0.2 / e * (1.0 - smoothstep(0.18, 0.4, slope)) * (1.0 - max(t2, t3));
      nW = normalize(nW - vec3(rx - gRip0, 0.0, rz - gRip0) * k);
    }` : ''}
    normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
  }`)
        .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
  // (bóng mây trôi: tính chung cho mọi vật liệu trong chunk chiếu sáng, xem SkySystem.installCloudShadows)
  reflectedLight.indirectDiffuse *= 1.0 - gWet * 0.3;   // hõm khuất ánh trời
  // sát chân tường nhà: ánh trời bị tường che một nửa bầu trời -> mặt đất tối dần vào chân tường (bóng tiếp xúc)
  if (gBldGrid.z > 0.0) {
    vec2 bu = (vGW.xz - gBldGrid.xy) * gBldGrid.zw;
    if (bu.x > 0.0 && bu.y > 0.0 && bu.x < 1.0 && bu.y < 1.0) {
      float gOcc = texture2D(gBldOcc, bu).r;
      reflectedLight.indirectDiffuse *= 1.0 - 0.6 * gOcc;
      reflectedLight.directDiffuse *= 1.0 - 0.15 * gOcc;
    }
  }`);
    };
    mat.customProgramCacheKey = () => 'groundPBR11:' + (opts.mapType || '') + (opts.ownNormals ? ':own' : '');
    mat.needsUpdate = true;
    return mat;
  }

  function tick(dt) { uTime.value += dt; }

  // Đọc nhiễu trên CPU (khớp texture2D(gNoise, uv) trong shader, kể cả lật trục V của CanvasTexture) -> rải cỏ / đá đúng mặt nạ
  function noiseSampler() {
    const t = noiseTex(), c = t.image, S = c.width, d = c.getContext('2d').getImageData(0, 0, S, S).data;
    return (u, v) => {
      const fx = (((u % 1) + 1) % 1) * S - 0.5, fy = (1 - (((v % 1) + 1) % 1)) * S - 0.5;
      const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
      const at = (x, y, ch) => d[((((y % S) + S) % S) * S + (((x % S) + S) % S)) * 4 + ch] / 255;
      const out = [0, 0, 0];
      for (let ch = 0; ch < 3; ch++) {
        out[ch] = (at(x0, y0, ch) * (1 - tx) + at(x0 + 1, y0, ch) * tx) * (1 - ty) + (at(x0, y0 + 1, ch) * (1 - tx) + at(x0 + 1, y0 + 1, ch) * tx) * ty;
      }
      return out;
    };
  }

  return { apply, tick, layers, noiseSampler, bakeNormals, time: uTime };
})();

if (typeof window !== 'undefined') window.GroundShader = GroundShader;
