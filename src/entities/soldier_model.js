/**
 * HỆ THỐNG MÔ HÌNH BINH SĨ & ĐỘNG HỌC CHUẨN HÓA (SoldierModel)
 *
 * Tách biệt hoàn toàn mô hình hình nhân chiến thuật để tái sử dụng cho:
 *  - Xạ thủ, lái xe, chỉ huy trên các phương tiện
 *  - Lính bộ binh, lính công binh, lính tuần tra căn cứ trong tương lai
 *
 * Tích hợp chuẩn hóa:
 *  1. Khung xương & tạo hình chi tiết (mũ, kính, giáp, quân phục, găng tay)
 *  2. Giải động học 2 khớp tay (vai - khuỷu - cổ tay) ôm bám điểm neo trên đồ vật chuyển động
 *  3. Quỹ đạo chuyển động tay mượt mà khi thao tác đồ vật (uốn cong không gian)
 *  4. Lực quán tính cơ thể & nhịp thở tự nhiên
 *  5. Hộp va chạm chuẩn phục vụ tính sát thương và che chắn
 */
const SoldierModel = (() => {
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const c01 = x => Math.max(0, Math.min(1, x));
  const sm = x => { x = c01(x); return x * x * (3 - 2 * x); };
  const UP = V(0, 1, 0);

  // Kích thước chuẩn cơ thể (8 đơn vị = 1 m trong thế giới game)
  const ARM_UP = 2.4, ARM_FORE = 2.02;   // TÂM KHỚP tới tâm khớp, người 1,78 m: vai-khuỷu 30 cm, khuỷu-cổ tay 25 cm (32 / 27 cm là số đo bề mặt từ mỏm vai, dùng làm khớp thì tay dài ra)
  const HAND_S = 1.12;
  // Tỉ lệ người 1,78 m: hai mỏm cùng vai cách khoảng 38 cm, ngang vai phủ áo khoảng 50 cm.
  // Cụm cũ vẫn còn dáng lực sĩ (ngực ngang, chỏm vai và tay cùng nở), đặc biệt lộ rõ ở góc máy từ trên xuống.
  const CHEST_W = 0.90;
  // Áo dã chiến chỉ nới nhẹ quanh cơ delta; không biến cả bắp tay thành một ống tròn dày.
  const ARM_K = 0.85;
  const SHOULDER_X = 1.68, SHOULDER_Y = 2.68;
  // áo giáp: hạ VEST_DROP, đẩy ra trước-sau theo VEST_Z (ngực dày); tấm trước rộng 2,5, cong mép PLATE_BEND
  const VEST_DROP = 0.28, VEST_Z = 0.96, PLATE_BEND = 0.18, VEST_DZ = 1.08 * (VEST_Z - 0.84);

  // ---------- HOA VĂN & VẬT LIỆU ----------
  const MATS = {};

  // Hoa văn rằn ri in vải: các lớp mảng hữu cơ cắt ngưỡng từ nhiễu fBm tuần hoàn (lặp liền mép) + uốn miền nhẹ -> mép mảng
  // mềm, lượn như vải in thật (bản cũ ghép đa giác viền sáng trông như chấm bi). Thêm lưới sợi chống rách, loang bạc màu.
  // base: màu nền; spots: [mảng lớn 1, mảng lớn 2, chi tiết sáng, nhánh tối] (2 phần tử: chỉ 2 lớp mảng)
  function camoTex(base, spots) {
    const n = 512, c = document.createElement('canvas'); c.width = c.height = n;
    const g = c.getContext('2d');
    const hex = (h) => { const v = parseInt(h.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
    // nhiễu giá trị tuần hoàn (chu kỳ = n): lưới L ô, nội suy mượt
    const noiseLayer = (L, seed) => {
      const grid = new Float32Array(L * L);
      let s = seed;
      for (let i = 0; i < L * L; i++) { s = (s * 16807) % 2147483647; grid[i] = s / 2147483647; }
      return (x, y) => {
        const fx = x / n * L, fy = y / n * L, i0 = Math.floor(fx), j0 = Math.floor(fy), tx = fx - i0, ty = fy - j0;
        const a = grid[((j0 % L + L) % L) * L + ((i0 % L + L) % L)], b = grid[((j0 % L + L) % L) * L + (((i0 + 1) % L + L) % L)];
        const cc = grid[(((j0 + 1) % L + L) % L) * L + ((i0 % L + L) % L)], d = grid[(((j0 + 1) % L + L) % L) * L + (((i0 + 1) % L + L) % L)];
        const ux = tx * tx * (3 - 2 * tx), uy = ty * ty * (3 - 2 * ty);
        return (a + (b - a) * ux) * (1 - uy) + (cc + (d - cc) * ux) * uy;
      };
    };
    const fbm = (L, seed) => {
      const o = [noiseLayer(L, seed), noiseLayer(L * 2, seed + 7), noiseLayer(L * 4, seed + 13), noiseLayer(L * 8, seed + 29)];
      return (x, y) => o[0](x, y) * 0.52 + o[1](x, y) * 0.27 + o[2](x, y) * 0.14 + o[3](x, y) * 0.07;
    };
    const warpA = fbm(4, 101), warpB = fbm(4, 202);
    // các lớp: [hàm nhiễu, ngưỡng, độ mềm mép, độ kéo dọc (mảng thuôn theo hướng vải)]
    // tương phản dịu (vải bạc nắng, có bụi): mảng gắt, mép sắc đọc như hoạt hình; hoa văn chỉ cần phá hình khối
    const pal0 = hex(base), pal = [pal0].concat(spots.map(hex).map(c => c.map((v, i) => pal0[i] + (v - pal0[i]) * 0.62)));
    const layers = spots.length >= 4
      ? [[fbm(9, 11), 0.53, 0.028], [fbm(11, 23), 0.56, 0.028], [fbm(30, 37), 0.63, 0.024], [fbm(19, 53), 0.63, 0.022]]
      : [[fbm(5, 11), 0.54, 0.02], [fbm(10, 23), 0.6, 0.015]];
    const img = g.createImageData(n, n), D = img.data;
    const mott = fbm(3, 307), grain = fbm(64, 401);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const wx = x + (warpA(x, y) - 0.5) * 42, wy = y + (warpB(x, y) - 0.5) * 42;
      let r = pal[0][0], gg = pal[0][1], b = pal[0][2];
      for (let k = 0; k < layers.length; k++) {
        const [f, th, soft] = layers[k], v = f(wx, wy * 2);
        const m = Math.max(0, Math.min(1, (v - th) / soft + 0.5));
        if (m > 0) { const p = pal[k + 1]; r += (p[0] - r) * m; gg += (p[1] - gg) * m; b += (p[2] - b) * m; }
      }
      // loang bạc màu / bám bẩn mảng lớn + hạt sợi
      const mo = (mott(x, y) - 0.5) * 0.16 + (grain(x, y) - 0.5) * 0.08;
      // lưới sợi chống rách (ripstop ~5 mm): vạch sáng rất nhẹ
      const rip = (x % 6 === 0 || y % 6 === 0) ? 0.035 : 0;
      const k2 = 1 + mo + rip, o = (y * n + x) * 4;
      D[o] = Math.min(255, r * k2); D[o + 1] = Math.min(255, gg * k2); D[o + 2] = Math.min(255, b * k2 * 0.98); D[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    return t;
  }

  // vải dệt kim trơn: nền một màu + sọc gân dệt dọc mảnh + loang sợi nhuộm (heather)
  const KNIT = {};
  function knitTex(col) {
    if (KNIT[col]) return KNIT[col];
    const n = 256, c = document.createElement('canvas'); c.width = c.height = n;
    const g = c.getContext('2d'), v = parseInt(col.slice(1), 16), base = [(v >> 16) & 255, (v >> 8) & 255, v & 255];
    const img = g.createImageData(n, n), D = img.data;
    let seed = 23; const rnd = () => { seed = seed * 16807 % 2147483647; return seed / 2147483647; };
    const blot = new Float32Array(n * n);
    for (let k = 0; k < 40; k++) { const cx = rnd() * n, cy = rnd() * n, r = 10 + rnd() * 30, a = (rnd() - 0.5) * 0.12; for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) { const d = Math.hypot(x, y) / r; if (d < 1) { const X = ((cx + x) % n + n) % n | 0, Y = ((cy + y) % n + n) % n | 0; blot[Y * n + X] += a * (1 - d * d); } } }
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const rib = (x % 4 < 2 ? 0.08 : -0.07) + (y % 3 === 0 ? 0.03 : 0);
      const k = 1 + rib + blot[y * n + x] + (rnd() - 0.5) * 0.08, o = (y * n + x) * 4;
      D[o] = Math.min(255, base[0] * k); D[o + 1] = Math.min(255, base[1] * k); D[o + 2] = Math.min(255, base[2] * k); D[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3); t.anisotropy = 8;
    return (KNIT[col] = t);
  }

  let FABRIC_N = null, LEATHER_N = null;
  function normalFromHeight(H, n, strength) {
    const c = document.createElement('canvas'); c.width = c.height = n;
    const g = c.getContext('2d'), img = g.createImageData(n, n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const h = (i, j) => H[((j + n) % n) * n + ((i + n) % n)];
      const dx = (h(x + 1, y) - h(x - 1, y)) * strength, dy = (h(x, y + 1) - h(x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1), o = (y * n + x) * 4;
      img.data[o] = (-dx / l * 0.5 + 0.5) * 255; img.data[o + 1] = (-dy / l * 0.5 + 0.5) * 255;
      img.data[o + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }

  function fabricNormal() {
    if (FABRIC_N) return FABRIC_N;
    const n = 128, H = new Float32Array(n * n);
    let seed = 11;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const folds = [];
    for (let i = 0; i < 9; i++) folds.push([rnd() * n, rnd() * n, rnd() * Math.PI, 6 + rnd() * 14, 0.5 + rnd()]);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      let h = 0.08 * Math.sin((x + y) * 1.6) * Math.sin((x - y) * 1.6);
      for (const [fx, fy, a, w, s] of folds) {
        let dx = x - fx, dy = y - fy;
        dx -= Math.round(dx / n) * n; dy -= Math.round(dy / n) * n;
        const across = dx * Math.cos(a) + dy * Math.sin(a), along = -dx * Math.sin(a) + dy * Math.cos(a);
        h += s * Math.exp(-(across * across) / (w * 0.6)) * Math.exp(-(along * along) / (w * w * 9));
      }
      H[y * n + x] = h;
    }
    return (FABRIC_N = normalFromHeight(H, n, 1.4));
  }

  // Vải Cordura của áo giáp: dệt sợi + hàng đai MOLLE thật (đai 1 inch cách 1 inch, may chặn dọc mỗi 1,5 inch).
  // Nhìn gần có khối nhờ pháp tuyến; ô tường màu xám nhân với màu áo theo môi trường nên chỉ cần dựng một lần.
  let CORDURA = null;
  function corduraMaps() {
    if (CORDURA) return CORDURA;
    const n = 512, H = new Float32Array(n * n), A = new Uint8ClampedArray(n * n * 4);
    const RP = Math.round(n * 0.4 / 2.9), RH = Math.round(RP * 0.5), CP = Math.round(n * 0.3 / 2.4);   // chu kỳ khít ảnh để lặp không lệch
    const rows = Math.round(n / RP), cols = Math.round(n / CP), rp = n / rows, cp = n / cols;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const weave = 0.05 * Math.sin(x * 1.57) * Math.sin(y * 1.57) + 0.03 * Math.sin((x + y) * 0.9);
      const ry = ((y % rp) + rp) % rp, cx = ((x % cp) + cp) % cp;
      const edge = Math.min(ry, RH - ry), inBand = ry < RH;
      const band = inBand ? Math.min(1, edge / 1.6) : 0;                     // mặt đai
      const tack = inBand && Math.min(cx, cp - cx) < 1.3 ? 1 : 0;            // đường may chặn: đai bị kéo tụt xuống vải nền
      const belly = inBand ? Math.sin(cx / cp * Math.PI) : 0;                // đai võng thành ô giữa hai đường may
      H[y * n + x] = weave + 1.6 * band * (0.55 + 0.45 * belly) * (tack ? 0.15 : 1) + (inBand ? 0.04 * Math.sin(y * 3.1) : 0);
      const shadow = !inBand && (ry - RH < 3 || rp - ry < 3) ? 0.82 : 1;     // khe tối sát mép đai
      const v = 236 * shadow * (inBand ? 1.04 : 0.92) * (tack ? 0.8 : 1) + 18 * weave * 10 * 0.1;
      const o = (y * n + x) * 4; A[o] = A[o + 1] = A[o + 2] = v; A[o + 3] = 255;
    }
    const c = document.createElement('canvas'); c.width = c.height = n;
    c.getContext('2d').putImageData(new ImageData(A, n, n), 0, 0);
    const map = new THREE.CanvasTexture(c);
    map.wrapS = map.wrapT = THREE.RepeatWrapping; map.anisotropy = 4;
    const nm = normalFromHeight(H, n, 1.6);
    nm.wrapS = nm.wrapT = THREE.RepeatWrapping; nm.anisotropy = 4;
    return (CORDURA = { map, nm });
  }

  function leatherNormal() {
    if (LEATHER_N) return LEATHER_N;
    const n = 64, H = new Float32Array(n * n);
    let seed = 5;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < n * n; i++) H[i] = rnd() * 0.35;
    return (LEATHER_N = normalFromHeight(H, n, 1.0));
  }

  let SOAK_T = null;
  function soakTex() {
    if (SOAK_T) return SOAK_T;
    const n = 128, c = document.createElement('canvas'); c.width = c.height = n;
    const g = c.getContext('2d');
    let seed = 47;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    g.fillStyle = '#000'; g.fillRect(0, 0, n, n);
    g.filter = 'blur(2px)';
    const blob = (x, y, r, a) => {
      const k = 14; g.fillStyle = `rgba(255,255,255,${a})`; g.beginPath();
      for (let i = 0; i <= k; i++) {
        const t = i / k * Math.PI * 2, rr = r * (0.6 + rnd() * 0.5);
        const X = x + Math.cos(t) * rr * 0.9, Y = y + Math.sin(t) * rr * 1.15;
        if (i) g.lineTo(X, Y); else g.moveTo(X, Y);
      }
      g.closePath(); g.fill();
    };
    blob(62, 50, 30, 0.7);
    for (let i = 0; i < 10; i++) blob(50 + rnd() * 28, 40 + rnd() * 50, 8 + rnd() * 14, 0.35);
    blob(64, 98, 12, 0.4);
    g.filter = 'none';
    for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(0,0,0,${0.1 + rnd() * 0.15})`; g.fillRect(rnd() * n, rnd() * n, 1, 2); }
    return (SOAK_T = new THREE.CanvasTexture(c));
  }

  let GLOVE_T = null;
  function gloveTex() {
    if (GLOVE_T) return GLOVE_T;
    const n = 128, c = document.createElement('canvas'); c.width = c.height = n;
    const g = c.getContext('2d');
    let seed = 17;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    g.fillStyle = '#e4e4e4'; g.fillRect(0, 0, n, n);
    for (let i = 0; i < 26; i++) {
      const x = rnd() * n, y = rnd() * n, r = 6 + rnd() * 22, light = rnd() < 0.45;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, light ? 'rgba(255,255,255,0.35)' : 'rgba(40,36,30,0.28)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (let i = 0; i < 900; i++) { const v = rnd() < 0.5 ? 255 : 30; g.fillStyle = `rgba(${v},${v},${v},${0.05 + rnd() * 0.07})`; g.fillRect(rnd() * n, rnd() * n, 1, 1 + rnd() * 2); }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (THREE.sRGBEncoding !== undefined) t.encoding = THREE.sRGBEncoding;
    return (GLOVE_T = t);
  }

  let LENS_T = null, GRIME_T = null;
  function grimeTex() {
    if (GRIME_T) return GRIME_T;
    const n = 128, c = document.createElement('canvas'); c.width = c.height = n;
    const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, n, n);
    let seed = 41; const rnd = () => { seed = seed * 16807 % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 24; i++) {
      const x = rnd() * n, y = rnd() * n, r = 5 + rnd() * 24, gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(255,255,255,${0.3 + rnd() * 0.55})`); gr.addColorStop(0.6, 'rgba(205,205,205,0.28)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    GRIME_T = new THREE.CanvasTexture(c); GRIME_T.wrapS = GRIME_T.wrapT = THREE.RepeatWrapping;
    return GRIME_T;
  }

  function lensTex() {
    if (LENS_T) return LENS_T;
    const c = document.createElement('canvas'); c.width = 64; c.height = 32;
    const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 32);
    gr.addColorStop(0, '#0d1418'); gr.addColorStop(0.55, '#24343c'); gr.addColorStop(1, '#3b4a4c');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 32);
    g.fillStyle = 'rgba(190,215,230,0.35)'; g.fillRect(0, 9, 64, 3);
    g.fillStyle = 'rgba(190,215,230,0.15)'; g.fillRect(0, 14, 64, 2);
    return (LENS_T = new THREE.CanvasTexture(c));
  }

  // QUÂN PHỤC THEO CHIẾN TRƯỜNG: quân đội thật đổi hoa văn / màu trang bị theo môi trường — một bộ màu cố định cho mọi bản
  // đồ thì ở bãi cỏ sẫm lính sáng gấp ~2 lần nền, ở sa mạc lại thành vệt tối (đo trên địa hình thật cùng ánh sáng game).
  // Mỗi môi trường: hoa văn (nền + 4 lớp mảng), khăn cổ, màu đồ trang bị. Phe phân biệt bằng phù hiệu + ngả ấm / lạnh nhẹ.
  const BIOMES = {
    DESERT: { camo: ['#b29e7a', ['#97805e', '#c4b08a', '#d0c09c', '#76603f']], gaiter: ['#6a5940', ['#94805e', '#c6b490']],
      gear: { vest: 0x7a6a4e, vestD: 0x6e5e44, web2: 0x7a6a4c, pad: 0x6e6048, glove: 0x6a5a44, gloveP: 0x7a6a52, gloveK: 0x4e4232, helmD: 0x6a5a42, boot: 0x5a4834, velcro: 0x9a8a66, web: 0x8a7a58, deadVest: 0x6a5a40 } },
    JUNGLE: { camo: ['#4c5034', ['#383e26', '#5c623e', '#6c6a4a', '#24281a']], gaiter: ['#33372a', ['#363c26', '#5e623e']],
      gear: { vest: 0x343a28, vestD: 0x353c2a, web2: 0x3e4230, pad: 0x383c2e, glove: 0x34382a, gloveP: 0x40402f, gloveK: 0x25271e, helmD: 0x30362a, boot: 0x24221c, velcro: 0x6e6a4c, web: 0x5e5a40, deadVest: 0x34362a } },
    URBAN: { camo: ['#585850', ['#46463e', '#66645c', '#76746a', '#34342e']], gaiter: ['#3c3c38', ['#44443e', '#68665e']],
      gear: { vest: 0x3e3f3a, vestD: 0x40423b, web2: 0x45463f, pad: 0x3e3f39, glove: 0x34352f, gloveP: 0x42423b, gloveK: 0x26261f, helmD: 0x3a3b36, boot: 0x24231f, velcro: 0x6a6860, web: 0x5e5c54, deadVest: 0x3a3a34 } },
    TEMPERATE: { camo: ['#5e5c44', ['#444830', '#6c6448', '#848062', '#2a2c20']], gaiter: ['#404032', ['#444832', '#706a4c']],
      gear: { vest: 0x3b3e30, vestD: 0x3c432d, web2: 0x4a4c36, pad: 0x3e4235, glove: 0x3a3e2e, gloveP: 0x4a4638, gloveK: 0x2a2c22, helmD: 0x343a28, boot: 0x27251e, velcro: 0x8a7a56, web: 0x80704f, deadVest: 0x3a3a2a } }
  };
  const BIOME_OF = { DESERT: 'DESERT', JUNGLE: 'JUNGLE', URBAN: 'URBAN', HIGHLAND: 'TEMPERATE', RIVER_LAKE: 'TEMPERATE' };
  let BIOME = 'TEMPERATE';
  // gọi trước khi dựng lính của trận (theo mapType của địa hình); lính dựng sau dùng bộ quân phục mới
  function setBiome(mapType) { BIOME = BIOME_OF[mapType] || BIOMES[mapType] && mapType || 'TEMPERATE'; return BIOME; }
  // ngả ấm (đỏ) / lạnh (xanh) rất nhẹ để hai phe khác nhau khi nhìn gần mà vẫn hợp môi trường
  const tintHex = (h, red) => {
    const v = typeof h === 'string' ? parseInt(h.slice(1), 16) : h, k = red ? [1.05, 1.0, 0.93] : [0.97, 1.0, 1.03];
    const c = [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((x, i) => Math.min(255, Math.round(x * k[i])));
    return typeof h === 'string' ? '#' + c.map(x => x.toString(16).padStart(2, '0')).join('') : (c[0] << 16) | (c[1] << 8) | c[2];
  };

  // bộ vật liệu riêng cho kíp lái (crew = true): kíp lái vẽ ở lượt trong suốt sau lòng hố lỗ nóc; bộ binh dùng bộ đục (nhanh hơn)
  function getMaterials(team, crew) {
    const key = team + '|' + BIOME + (crew ? '|crew' : '');
    if (MATS[key]) return MATS[key];
    const red = team === 'RED', BIO = BIOMES[BIOME], GR = {};
    for (const k in BIO.gear) GR[k] = tintHex(BIO.gear[k], red);
    const std = (o) => new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.92, metalness: 0 }, o));
    // vải rằn ri (normalMap: null): lưới sợi đã in trong màu; fabricNormal có nếp gấp lớn, trải theo UV ~4 đv / ô thành vệt chéo và mảng tối loang trên đùi, mông
    const cloth = (o) => std(Object.assign({ normalMap: fabricNormal(), normalScale: new THREE.Vector2(0.7, 0.7) }, o));
    const camo = camoTex(tintHex(BIO.camo[0], red), BIO.camo[1].map(h => tintHex(h, red)));

    return (MATS[key] = {
      // vải quân phục thật phản xạ ~15-25% (vải ô-liu / cát): nhân màu ~0,72, ngả ấm nhẹ để dưới nắng không thành màu phấn
      uni: cloth({ normalMap: null, color: 0xb8b4a6, map: (() => { const t = camo.clone(); t.needsUpdate = true; t.repeat.set(2.2, 2.2); return t; })() }),
      // cùng vải cho chi tiết khối hộp / chỏm cầu (UV theo đơn vị dài) — để túi không lấm tấm như miếng dán
      uniC: cloth({ color: 0x8d8a7e, map: (() => { const t = camo.clone(); t.needsUpdate = true; t.repeat.set(2.2, 2.2); return t; })() }),
      uniS: cloth({ normalMap: null, color: 0xb8b4a6, map: (() => { const t = camo.clone(); t.needsUpdate = true; t.repeat.set(0.3, 0.3); return t; })() }),
      vest: std({ color: GR.vest, roughness: 0.96, map: corduraMaps().map, normalMap: corduraMaps().nm, normalScale: new THREE.Vector2(0.9, 0.9) }),
      vestB: cloth({ color: new THREE.Color(GR.vest).multiplyScalar(0.62).getHex(), roughness: 0.95 }),
      pouch: cloth({ normalMap: null, color: 0xc4c0b2, map: (() => { const t = camo.clone(); t.needsUpdate = true; t.repeat.set(0.3, 0.3); return t; })(), roughness: 0.9 }),
      grenade: std({ color: 0x343a2b, roughness: 0.82 }),
      band: std({ color: 0x8c7a3c, roughness: 0.75 }),
      smoke: std({ color: 0x45483d, roughness: 0.84 }),
      helm: cloth({ map: (() => { const t = camo.clone(); t.needsUpdate = true; t.repeat.set(2, 1); return t; })(), color: 0xd0cab8, roughness: 0.96 }),
      helmD: std({ color: GR.helmD, roughness: 0.9 }),
      velcro: cloth({ color: GR.velcro, roughness: 1 }),
      skin: std({ color: 0x4c3a2f, roughness: 0.9 }),
      skinV: std({ color: 0xa69a92, vertexColors: true, roughness: 0.82 }),   // da mặt vùng thái dương: tông nâu trung tính, không cam chói dưới nắng
      glove: std({ color: GR.glove, map: gloveTex(), roughness: 0.9, normalMap: fabricNormal(), normalScale: new THREE.Vector2(0.8, 0.8) }),
      gloveP: std({ color: GR.gloveP, map: gloveTex(), roughness: 0.62, normalMap: leatherNormal(), normalScale: new THREE.Vector2(0.5, 0.5) }),
      knuck: std({ color: 0x171714, roughness: 0.82 }),
      gloveK: std({ color: GR.gloveK, map: gloveTex(), roughness: 0.7 }),
      pad: std({ color: GR.pad, roughness: 0.88, side: THREE.DoubleSide, normalMap: leatherNormal(), normalScale: new THREE.Vector2(0.3, 0.3) }),
      boot: std({ color: new THREE.Color(GR.boot).multiplyScalar(0.72).getHex(), roughness: 0.82 }),
      lens: std({ color: 0x1a2a33, roughness: 0.15, metalness: 0.6 }),
      visor: std({ map: lensTex(), roughness: 0.06, metalness: 0.55, side: THREE.DoubleSide }),
      frame: std({ color: 0x171816, roughness: 0.76 }),
      strap: std({ color: 0x1f1e1a }),
      hair: std({ color: 0x1e1813, roughness: 0.95, normalMap: leatherNormal(), normalScale: new THREE.Vector2(0.8, 0.8) }),
      vestD: cloth({ color: GR.vestD, roughness: 0.9, side: THREE.DoubleSide }),
      mag: std({ color: 0x1d1d1a, roughness: 0.82 }),
      patch: cloth({ color: red ? 0x5c3a30 : 0x35465a, roughness: 0.95 }),
      tq: std({ color: 0x1a1a18, roughness: 0.7 }),
      // khăn che mặt / quấn cổ: vải DỆT KIM trơn một màu (khác hẳn vải rằn ri của áo -> không nhập làm một với cổ áo)
      gaiter: cloth({ color: 0xffffff, map: knitTex(tintHex(BIO.gaiter[0], red)), roughness: 0.97, normalScale: new THREE.Vector2(0.35, 0.35), side: THREE.DoubleSide }),
      shell: std({ color: 0x6f6047, roughness: 0.82 }),
      trim: std({ color: 0x3a3428, roughness: 0.8 }),
      web: cloth({ color: GR.web, roughness: 0.9 }),
      web2: std({ color: GR.web2, roughness: 0.95, side: THREE.DoubleSide }),
      webD: std({ color: 0x5c4f38, roughness: 0.6 }),
      seam: std({ color: new THREE.Color(tintHex(BIO.camo[0], red)).multiplyScalar(0.34).getHex(), roughness: 1 }),
      headset: std({ color: 0x242620, roughness: 0.82 }),
      dust: std({ color: red ? 0x6b5135 : 0x62583e, alphaMap: grimeTex(), transparent: true, opacity: 0.48, roughness: 1, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }),
      soot: std({ color: 0x211d18, alphaMap: grimeTex(), transparent: true, opacity: 0.34, roughness: 1, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }),
      lip: std({ color: 0x9a6a52 }),
      dead: cloth({ normalMap: null, map: (() => { const t = camo.clone(); t.needsUpdate = true; t.repeat.set(2.2, 2.2); return t; })(), color: 0x9a7f78 }),
      soak: std({ color: 0x150504, alphaMap: soakTex(), transparent: true, opacity: 0.88, roughness: 0.6, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3 }),
      deadVest: cloth({ color: GR.deadVest, roughness: 0.9, side: THREE.DoubleSide })
    });
  }

  // ---------- BỘ NHỚ ĐỆM HÌNH HỌC (GEOMETRY CACHE) ----------
  const GEO = {};

  function capsule(r, len, key) {
    if (GEO[key]) return GEO[key];
    const pts = [];
    for (let i = 0; i <= 3; i++) { const a = -Math.PI / 2 + i / 3 * Math.PI / 2; pts.push(new THREE.Vector2(Math.cos(a) * r, r + Math.sin(a) * r)); }
    for (let i = 0; i <= 3; i++) { const a = i / 3 * Math.PI / 2; pts.push(new THREE.Vector2(Math.cos(a) * r, len - r + Math.sin(a) * r)); }
    return (GEO[key] = new THREE.LatheGeometry(pts, 12));
  }

  // UV vải theo đơn vị dài cho ống tròn xoay: đúng 1 ô quanh ống (không lộ mép nối), dọc ống như thân và quần. UV mặc định của
  // lathe nén 2,2 ô vào mỗi chi tiết nên tay áo dày hoa văn gấp ~2,3 lần thân, còn cổ tay / bắp vai bị kéo thành vệt
  function clothUV(g) {
    const P = g.attributes.position, U = g.attributes.uv;
    for (let i = 0; i < P.count; i++) U.setXY(i, U.getX(i) / 2.2, P.getY(i) * 0.14);
    return g;
  }

  function limbGeo(kind) {
    const key = 'limb_' + kind;
    if (GEO[key]) return GEO[key];
    const L = kind === 'up' ? ARM_UP : ARM_FORE;
    const prof = kind === 'up'
      ? [[0, -0.05], [0.36, -0.03], [0.5, 0.1], [0.54, 0.3], [0.54, 0.55], [0.51, 0.85], [0.5, 1.15], [0.47, 1.6], [0.42, 2.0], [0.42, 2.3], [0.32, 2.52], [0, 2.58]]
      : [[0, -0.3], [0.3, -0.25], [0.44, -0.05], [0.47, 0.35], [0.45, 0.8], [0.4, 1.3], [0.35, 1.7], [0.33, 2.0], [0.2, 2.12], [0, 2.14]];
    const thick = kind === 'up' ? 1.04 : 1.04;
    const g = new THREE.LatheGeometry(prof.map(q => new THREE.Vector2(q[0] * thick, q[1] * L / (kind === 'up' ? 2.3 : 2.15))), 16);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), r = Math.hypot(x, z);
      if (r < 1e-4) continue;
      const a = Math.atan2(z, x);
      const nearJ = kind === 'up' ? Math.max(0, (y - 1.4) / 1.0) : Math.max(0, 1 - y / 0.9);
      const w = (0.012 + 0.035 * nearJ) * Math.sin(y * 17 + Math.sin(a * 3) * 1.6) + 0.01 * Math.sin(a * 5 + y * 6);
      const k = (r + w) / r;
      p.setXYZ(i, x * k, y, z * k * 0.94);
    }
    g.computeVertexNormals();
    clothUV(g);
    return (GEO[key] = g);
  }

  function seg(parent, a, b, r, mat) {
    const d = b.clone().sub(a), L = d.length();
    const m = new THREE.Mesh(capsule(r, L + r * 2, 'sg' + r.toFixed(3) + '_' + L.toFixed(3)), mat);
    m.position.copy(a).addScaledVector(d, -r / L);
    m.quaternion.setFromUnitVectors(UP, d.multiplyScalar(1 / L));
    m.castShadow = true;
    parent.add(m);
    (parent.userData.segs || (parent.userData.segs = [])).push(m);
    return m;
  }

  function rbox(w, h, d) {
    const r = Math.min(0.07, Math.min(w, h, d) * 0.22), key = 'rb' + [w, h, d].map(v => v.toFixed(3)).join('_');
    if (GEO[key]) return GEO[key];
    const iw = w / 2 - r, ih = h / 2 - r, c = r * 0.6;
    const s = new THREE.Shape();
    s.moveTo(-iw + c, -ih); s.lineTo(iw - c, -ih); s.quadraticCurveTo(iw, -ih, iw, -ih + c);
    s.lineTo(iw, ih - c); s.quadraticCurveTo(iw, ih, iw - c, ih); s.lineTo(-iw + c, ih);
    s.quadraticCurveTo(-iw, ih, -iw, ih - c); s.lineTo(-iw, -ih + c); s.quadraticCurveTo(-iw, -ih, -iw + c, -ih);
    const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.001, d - 2 * r), bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: 2, curveSegments: 2 });
    g.translate(0, 0, -(d - 2 * r) / 2);
    return (GEO[key] = g);
  }

  // VỎ GIÁP: túi vải bọc tấm chống đạn (dáng SAPI: vát hai góc trên, bo góc dưới, cong theo ngực), mép gối tròn như vải căng ôm
  // tấm cứng. UV theo kích thước thật để hàng đai MOLLE của mọi mảng cùng cỡ (bản cũ: chiều mặt ngược + thiếu UV nên trơn lì).
  const PLATE_U = 2.4, PLATE_V = 2.9;
  const plateHalf = (y, hw, hh) => {
    const cut = 0.6, cutIn = 0.5, rb = 0.2, rt = 0.1;
    let a = hw;
    if (y > hh - cut) a -= cutIn * Math.pow((y - hh + cut) / cut, 1.35);
    if (y < -hh + rb) { const t = (-hh + rb - y) / rb; a -= rb * (1 - Math.sqrt(Math.max(0, 1 - t * t))); }
    if (y > hh - rt) { const t = (y - hh + rt) / rt; a -= rt * (1 - Math.sqrt(Math.max(0, 1 - t * t))); }
    return a;
  };
  function plateGeo(w, h, d, bend) {
    const key = 'pl' + [w, h, d, bend].join('_');
    if (GEO[key]) return GEO[key];
    const NX = 30, NY = 30, hw = w / 2, hh = h / 2, RIM = 0.1, pos = [], uv = [], idx = [], R = NX + 1, off = (NY + 1) * R;
    const dens = t => Math.sin(t * Math.PI / 2) * 0.5 + t * 0.5;     // -1..1, hàng dày hơn ở mép để bo tròn mịn
    for (const side of [-1, 1]) for (let j = 0; j <= NY; j++) {
      const y = hh * dens(j / NY * 2 - 1), ha = plateHalf(y, hw, hh);
      for (let i = 0; i <= NX; i++) {
        const x = ha * dens(i / NX * 2 - 1), e = Math.min(1, Math.min(ha - Math.abs(x), hh - Math.abs(y)) / RIM);
        pos.push(x, y, bend * (x / hw) * (x / hw) + side * d / 2 * Math.sqrt(Math.max(0, 1 - (1 - e) * (1 - e))));
        uv.push(x / PLATE_U + 0.5, y / PLATE_V + 0.5);
      }
    }
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      const a = j * R + i, b = a + R;
      idx.push(a, b, a + 1, a + 1, b, b + 1);                                  // mặt z âm
      idx.push(off + a, off + a + 1, off + b, off + a + 1, off + b + 1, off + b);   // mặt z dương
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return (GEO[key] = weldNormals(g));
  }

  const HEL_R = 1.12, HEL_S = [0.97, 0.95, 1.05], HEL_Y = 0.9;
  const step = (x, a, b) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const helRim = (phi) => {
    const f = Math.abs(Math.atan2(Math.sin(phi), Math.cos(phi)));
    return -0.12 - 0.02 * f + 0.2 * step(f, 0.78, 0.98) - 0.03 * Math.sin(Math.max(0, Math.min(1, (f - 0.98) / 1.12)) * Math.PI) - 0.92 * step(f, 1.68, 2.02);
  };
  const squareK = (phi) => { const c = Math.abs(Math.cos(phi)), sn = Math.abs(Math.sin(phi)); return Math.pow(Math.pow(c, 2.6) + Math.pow(sn, 2.6), -1 / 2.6) * 0.93; };
  const helTuck = (d, phi = 0) => (0.08 + 0.1 * Math.min(1, Math.max(0, 0.25 - Math.cos(phi)))) * Math.pow(Math.max(0, 1 - Math.max(0, d) / 0.55), 2);

  function helmetGeo() {
    if (GEO.helmet) return GEO.helmet;
    const g = new THREE.SphereGeometry(HEL_R, 36, 24, 0, Math.PI * 2, 0, Math.PI * 0.8), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const phi = Math.atan2(x, -z), rim = helRim(phi), sq = squareK(phi);
      x *= sq; z *= sq;
      if (y < rim) {
        const rr = Math.sqrt(Math.max(0, HEL_R * HEL_R - rim * rim)), h = Math.hypot(x, z) || 1;
        x = x / h * rr * sq; z = z / h * rr * sq; y = rim;
      }
      const fl = -helTuck(y - rim, phi);
      p.setXYZ(i, x * HEL_S[0] * (1 + fl), (y > 0.8 ? 0.8 + (y - 0.8) * 0.85 : y) * HEL_S[1], z * HEL_S[2] * (1 + fl));
    }
    g.computeVertexNormals();
    return (GEO.helmet = g);
  }

  function helPt(phi, y, off = 0) {
    const rr = Math.sqrt(Math.max(0, HEL_R * HEL_R - y * y));
    const yy = y > 0.8 ? 0.8 + (y - 0.8) * 0.85 : y;
    const sq = squareK(phi) * (1 - helTuck(y - helRim(phi), phi));
    const P = V(Math.sin(phi) * rr * sq * HEL_S[0], yy * HEL_S[1], -Math.cos(phi) * rr * sq * HEL_S[2]);
    const n = V(P.x / (HEL_S[0] * HEL_S[0]), P.y / (HEL_S[1] * HEL_S[1]), P.z / (HEL_S[2] * HEL_S[2])).normalize();
    const t = V(Math.cos(phi), 0, Math.sin(phi));
    t.addScaledVector(n, -t.dot(n)).normalize();
    P.addScaledVector(n, off).add(V(0, HEL_Y, 0.07));
    return { p: P, n, t };
  }

  function helLine(pts, off, r) {
    const key = 'hl' + JSON.stringify(pts) + off + r;
    if (GEO[key]) return GEO[key];
    return (GEO[key] = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(([f, y]) => helPt(f, y, off).p)), pts.length * 8, r, 4, false));
  }

  function helRibbon(key, f0, f1, lo, hi, off, th) {
    if (GEO[key]) return GEO[key];
    const N = 24, pos = [], idx = [];
    const ring = (f, k) => [helPt(f, lo(f), off + k).p, helPt(f, hi(f), off + k).p];
    for (let i = 0; i <= N; i++) {
      const f = f0 + (f1 - f0) * i / N;
      const [a0, b0] = ring(f, 0), [a1, b1] = ring(f, th);
      pos.push(a0.x, a0.y, a0.z, b0.x, b0.y, b0.z, a1.x, a1.y, a1.z, b1.x, b1.y, b1.z);
    }
    for (let i = 0; i < N; i++) {
      const o = i * 4, q = o + 4;
      idx.push(o + 2, q + 2, o + 3, o + 3, q + 2, q + 3);
      idx.push(o, o + 1, q, o + 1, q + 1, q);
      idx.push(o, q, o + 2, o + 2, q, q + 2);
      idx.push(o + 1, o + 3, q + 1, o + 3, q + 3, q + 1);
    }
    const e = N * 4;
    idx.push(0, 2, 1, 1, 2, 3, e, e + 1, e + 2, e + 1, e + 3, e + 2);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return (GEO[key] = g);
  }

  function strapGeo(curve, w, t, key, core = V(0, 2.6, 0)) {
    if (GEO[key]) return GEO[key];
    const N = 24, pos = [], idx = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N, P = curve.getPointAt(u), T = curve.getTangentAt(u);
      const out = P.clone().sub(core).normalize();
      const side = V().crossVectors(T, out).normalize(), nrm = V().crossVectors(side, T).normalize();
      for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const q = P.clone().addScaledVector(side, a * w / 2).addScaledVector(nrm, b * t / 2);
        pos.push(q.x, q.y, q.z);
      }
    }
    for (let i = 0; i < N; i++) for (let k = 0; k < 4; k++) {
      const a = i * 4 + k, b = i * 4 + (k + 1) % 4, c = a + 4, d = b + 4;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return (GEO[key] = g);
  }

  // băng viền vải bọc mép vỏ giáp: mỏng, cùng tông sẫm hơn (bản cũ: ống đen to như gioăng cao su)
  function plateBindGeo(w, h, d, bend) {
    const key = 'pb' + [w, h, d, bend].join('_');
    if (GEO[key]) return GEO[key];
    const hw = w / 2, hh = h / 2, ol = [], N = 40;
    for (let i = 0; i <= N; i++) { const y = -hh + 0.012 + (h - 0.024) * i / N; ol.push([plateHalf(y, hw, hh) - 0.012, y]); }
    for (let i = N; i >= 0; i--) { const y = -hh + 0.012 + (h - 0.024) * i / N; ol.push([-plateHalf(y, hw, hh) + 0.012, y]); }
    const pts = ol.map(q => V(q[0], q[1], bend * (q[0] / hw) * (q[0] / hw)));
    return (GEO[key] = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.2), 160, 0.042, 6, true));
  }

  // mảng đai ôm sườn (cummerbund) bám đúng mặt áo: thân lõm vào thành ụ phình, mép trên dưới bo; cùng lưới đai với vỏ giáp
  function cummerbundGeo() {
    if (GEO.cummer) return GEO.cummer;
    const Y0 = 0.3, Y1 = 1.88, prof = [];
    for (let k = 0; k <= 16; k++) {
      const y = Y0 + (Y1 - Y0) * k / 16, e = Math.min(1, Math.min(y - Y0, Y1 - y) / 0.05);
      prof.push(new THREE.Vector2(lerpTab(TORSO_PROF, y) * 1.02 + 0.02 + 0.055 * Math.sqrt(1 - (1 - e) * (1 - e)), y));
    }
    const g = new THREE.LatheGeometry(prof, 40), P = g.attributes.position, U = g.attributes.uv;
    for (let i = 0; i < P.count; i++) {
      U.setXY(i, U.getX(i) * 2 * Math.PI * 1.6 / PLATE_U, P.getY(i) / PLATE_V + 0.5 - 0.02);
      P.setZ(i, torsoDepth(P.getZ(i) * 0.655 * torsoFlat(P.getX(i), P.getY(i)), P.getY(i)) * 1.015);
      // đai sườn luồn sau tấm giáp trước (không thì mặt đai chồi trước mép tấm, viền tấm nổi như thanh rời)
      const x = P.getX(i), z = P.getZ(i), tuck = sm((1.5 - Math.abs(x)) / 0.22);
      if (z < 0 && tuck > 0) { const zin = (-1.08 * VEST_Z + 0.1 + PLATE_BEND * (x / 1.25) * (x / 1.25) + 0.03) / 0.9; if (z < zin) P.setZ(i, z + (zin - z) * tuck); }
    }
    g.computeVertexNormals();
    return (GEO.cummer = weldNormals(g));
  }

  const GG = { R: 1.06, Y: 0.66, W: 1.78, H: 0.44 };
  function ggWrap(u, v, off = 0) {
    const a = u / GG.R, r = GG.R + off - 0.3 * v * v - 0.05 * Math.pow(Math.abs(u), 3) + 0.06 * Math.exp(-(u / 0.4) * (u / 0.4));
    return V(Math.sin(a) * r * 0.95, GG.Y + v, -Math.cos(a) * r * 1.02);
  }

  const ggBottom = (u) => {
    const hw = GG.W / 2, x = Math.abs(u) / hw;
    const lobe = -GG.H / 2 * Math.sqrt(Math.max(0, 1 - Math.pow(Math.max(0, (x - 0.55) / 0.45), 2)));
    const nose = GG.H * 0.55 * Math.exp(-Math.pow(Math.abs(u) / 0.14, 2.2));
    return Math.min(GG.H / 2 - 0.04, lobe + nose);
  };

  function goggleLensGeo() {
    if (GEO.ggLens) return GEO.ggLens;
    const NU = 40, NV = 6, hw = GG.W / 2, pos = [], uv = [], idx = [];
    for (let i = 0; i <= NU; i++) {
      const u = -hw + 2 * hw * i / NU, vb = ggBottom(u), vt = GG.H / 2;
      for (let j = 0; j <= NV; j++) {
        const v = vb + (vt - vb) * j / NV, w = ggWrap(u, v);
        pos.push(w.x, w.y, w.z); uv.push(i / NU, (v + GG.H / 2) / GG.H);
      }
    }
    for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) {
      const a = i * (NV + 1) + j, b = a + NV + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return (GEO.ggLens = g);
  }

  function goggleFrameGeo() {
    if (GEO.ggFrame) return GEO.ggFrame;
    const hw = GG.W / 2, top = [];
    for (let i = 0; i <= 24; i++) { const u = -hw - 0.02 + (2 * hw + 0.04) * i / 24; top.push(ggWrap(u, GG.H / 2 + 0.03, 0.03)); }
    const geos = [strapGeo(new THREE.CatmullRomCurve3(top), 0.13, 0.05, 'ggBrow', V(0, GG.Y, 0.3))];
    const pad = [];
    for (let i = 0; i <= 12; i++) { const u = -0.17 + 0.34 * i / 12; pad.push(ggWrap(u, ggBottom(u) + 0.015, -0.02)); }
    geos.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pad), 16, 0.025, 5, false));
    return (GEO.ggFrame = mergeGeos(geos));
  }

  function mergeGeos(list) {
    let nv = 0, ni = 0;
    for (const g of list) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uvs = new Float32Array(nv * 2), idx = new Uint32Array(ni);
    let ov = 0, oi = 0;
    for (const g of list) {
      const c = g.attributes.position.count;
      pos.set(g.attributes.position.array, ov * 3); nor.set(g.attributes.normal.array, ov * 3);
      if (g.attributes.uv) uvs.set(g.attributes.uv.array, ov * 2);
      if (g.index) { for (let i = 0; i < g.index.count; i++) idx[oi + i] = g.index.array[i] + ov; oi += g.index.count; }
      else { for (let i = 0; i < c; i++) idx[oi + i] = ov + i; oi += c; }
      ov += c;
    }
    const m = new THREE.BufferGeometry();
    m.setAttribute('position', new THREE.BufferAttribute(pos, 3)); m.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); m.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    m.setIndex(new THREE.BufferAttribute(idx, 1));
    return m;
  }

  const FACE_LOW = 1.62;
  function faceGeo() {
    if (GEO.face) return GEO.face;
    const g = new THREE.SphereGeometry(0.9, 44, 34), p = g.attributes.position, col = [];
    const G2 = (a, s) => Math.exp(-(a / s) * (a / s));
    const skin = [0.43, 0.32, 0.26];   // da rám nắng, bớt bão hoà (0.5/0.35/0.26 cũ dưới nắng gắt thành cam chói)
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const yn = y / 0.9;
      x *= 0.84; y *= y < 0 ? FACE_LOW : 1.12;
      if (yn < 0) { const t = Math.pow(-yn, 1.5); x *= 1 - 0.22 * t - 0.04 * t * t; z *= 1 - 0.08 * t; }
      let c = skin.slice();
      if (z < 0) {
        const ax = Math.abs(x);
        z *= 0.97 + 0.03 * Math.min(1, ax / 0.6);
        z -= (0.1 + 0.12 * Math.max(0, Math.min(1, (0.1 - y) / 0.3))) * G2(x, 0.06) * G2(y + 0.12, 0.2);
        z -= 0.14 * G2(x, 0.075) * G2(y + 0.3, 0.075);
        z -= 0.09 * G2(ax - 0.1, 0.05) * G2(y + 0.34, 0.05);
        z += 0.05 * G2(ax - 0.17, 0.03) * G2(y + 0.31, 0.08);
        z += 0.03 * G2(ax - 0.08, 0.03) * G2(y + 0.36, 0.025);
        z += 0.015 * G2(x, 0.03) * G2(y + 0.36, 0.04);
        z -= 0.08 * G2(x, 0.19) * G2(y + 0.43, 0.04);
        z += 0.05 * G2(x, 0.18) * G2(y + 0.48, 0.012);
        z -= 0.075 * G2(x, 0.16) * G2(y + 0.53, 0.045);
        z += 0.04 * G2(ax - 0.21, 0.03) * G2(y + 0.48, 0.04);
        z += 0.04 * G2(ax - 0.27, 0.05) * G2(y + 0.3, 0.13);
        z += 0.035 * G2(x, 0.16) * G2(y + 0.64, 0.045);
        z -= 0.15 * G2(x, 0.36) * G2(y + 1.05, 0.16);
        z -= 0.08 * G2(x, 0.32) * G2(y + 0.72, 0.28);
        z += 0.03 * G2(x, 0.3) * G2(y + 1.3, 0.08);
        z -= 0.05 * G2(ax - 0.5, 0.12) * G2(y + 0.82, 0.16);
        z += 0.07 * G2(ax - 0.3, 0.14) * G2(y - 0.12, 0.1);
        z -= 0.05 * G2(ax - 0.28, 0.24) * G2(y - 0.27, 0.07);
        z -= 0.05 * G2(ax - 0.47, 0.15) * G2(y + 0.02, 0.13);
        z += 0.03 * G2(ax - 0.36, 0.1) * G2(y + 0.32, 0.12);
        const lip = G2(x, 0.19) * (G2(y + 0.42, 0.04) + G2(y + 0.52, 0.045));
        const beard = Math.min(1, Math.max(0, (-y - 0.4) * 2.2)) * (0.6 + 0.4 * Math.min(1, ax / 0.4)) * (1 - lip);
        const blush = G2(ax - 0.42, 0.18) * G2(y + 0.15, 0.15);
        const sock = G2(ax - 0.3, 0.15) * G2(y - 0.12, 0.1);
        c = [c[0] - 0.08 * lip - 0.2 * beard - 0.12 * sock + 0.04 * blush, c[1] - 0.15 * lip - 0.17 * beard - 0.12 * sock - 0.03 * blush, c[2] - 0.12 * lip - 0.1 * beard - 0.1 * sock - 0.03 * blush];
      } else {
        const beard = Math.min(1, Math.max(0, (-y - 0.4) * 2.2)) * Math.max(0, 1 - z / 0.5);
        c = [c[0] - 0.18 * beard, c[1] - 0.15 * beard, c[2] - 0.08 * beard];
      }
      const ao = 1 - 0.35 * Math.min(1, Math.max(0, (y - 0.05) / 0.35));
      p.setXYZ(i, x, y, z);
      col.push(c[0] * ao, c[1] * ao, c[2] * ao);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    return (GEO.face = g);
  }

  function hairGeo() {
    if (GEO.hair) return GEO.hair;
    const g = new THREE.SphereGeometry(0.9, 40, 30), p = g.attributes.position, keep = [];
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const yn = y / 0.9;
      x *= 0.84; y *= y < 0 ? FACE_LOW : 1.12;
      if (yn < 0) { const t = Math.pow(-yn, 1.5); x *= 1 - 0.22 * t - 0.04 * t * t; z *= 1 - 0.08 * t; }
      if (z < 0) z *= 0.9 + 0.1 * Math.min(1, Math.abs(x) / 0.6);
      const r = Math.hypot(x, z) || 1, k = (r + 0.025) / r;
      x *= k; z *= k; y += 0.02;
      p.setXYZ(i, x, y, z);
      const side = Math.abs(x) / (r || 1);
      const lim = z < 0 ? (side > 0.72 ? -0.2 : side > 0.55 ? 0.2 : 0.62) : -0.48 + 0.22 * Math.max(0, side - 0.6);
      keep.push(y > lim);
    }
    const idx = g.index.array, out = [];
    for (let t = 0; t < idx.length; t += 3) if (keep[idx[t]] && keep[idx[t + 1]] && keep[idx[t + 2]]) out.push(idx[t], idx[t + 1], idx[t + 2]);
    g.setIndex(out);
    g.computeVertexNormals();
    return (GEO.hair = g);
  }

  function neckGeo() {
    if (GEO.neck) return GEO.neck;
    // khăn quấn cổ: chân loe ra theo cơ thang, thân cổ đầy đặn, vải xếp chồng thành ngấn lệch không đều
    // chân cổ loe vừa phải (0.86 cũ: thành phễu / vạt áo choàng có mép sắc sau gáy)
    const prof = [[0.0, 3.2], [0.7, 3.22], [0.66, 3.32], [0.6, 3.44], [0.56, 3.56], [0.54, 3.68], [0.53, 3.8], [0.52, 3.92], [0.0, 3.94]];
    const g = new THREE.LatheGeometry(prof.map(q => new THREE.Vector2(q[0], q[1])), 36), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const a = Math.atan2(z, x), r = Math.hypot(x, z);
      if (r < 1e-4) continue;
      const h = Math.max(0, Math.min(1, (y - 3.25) / 0.65));
      const ph = y * 19 + 1.7 * Math.sin(a * 1.3 + 0.6) + 0.9 * Math.sin(a * 3.1);
      const fold = (0.022 + 0.02 * (1 - h)) * Math.pow(Math.abs(Math.sin(ph)), 0.6) * (0.6 + 0.4 * Math.sin(a * 2 + y * 5));
      // gáy: chân loe theo cơ thang, eo lõm nhẹ giữa cổ (đường cong cột sống cổ), trên đầy lại tới xương chẩm
      const back = z > 0 ? 0.9 + 0.16 * Math.pow(1 - h, 2) - 0.05 * Math.exp(-Math.pow((h - 0.55) / 0.25, 2)) : 0.92;               // gáy dày, cổ trước thon (yết hầu khuất trong khăn)
      const k = (r + fold) / r;
      x *= k; z *= k * 0.9 * back;
      z -= 0.16 * h;   // cổ nghiêng ra trước ~13° (ống đứng thẳng cũ: gáy phẳng như cột)
      p.setXYZ(i, x, y, z);
      g.attributes.uv.setXY(i, g.attributes.uv.getX(i) * 3.4 * 0.55, y * 0.55);
    }
    g.computeVertexNormals();
    weldNormals(g);
    return (GEO.neck = g);
  }

  const COLLAR_GAP = 0.55;
  function collarCurve(f) {
    const bk = (1 - Math.cos(f)) / 2;
    const wrinkle = (Math.sin(f * 3 + 0.45) * 0.02 + Math.sin(f * 7 + 1.1) * 0.012) * (0.45 + 0.55 * bk);   // mép vải lượn nhẹ, không phẳng cứng
    // cổ áo đứng cao hơn & đứng tách khỏi cổ (khe tạo bóng) — trước ôm sát cổ nên chìm vào khăn quấn cổ.
    // Hai đầu cổ phía trước (cổ đứng kéo khoá, mở một nửa): thấp dần, bo tròn xuống & hơi bẻ ra ngoài — không cắt phẳng như tường
    const endK = sm(Math.min(f - COLLAR_GAP, Math.PI * 2 - COLLAR_GAP - f) / 0.5);
    // mép cổ cao thêm ở hai bên: mặt vai dốc cao tới ~3,55 ở đó, cổ thấp thì chìm vào vai trông liền với thân
    const yB = 3.38 - 0.04 * bk, yT0 = 3.68 + 0.05 * bk + 0.11 * Math.pow(Math.abs(Math.sin(f)), 1.5) + wrinkle;
    return { bk, yB, yT: yB + (yT0 - yB) * (0.32 + 0.68 * endK), rB: 0.78 + 0.035 * bk, rT: 0.64 + 0.03 * bk + 0.1 * (1 - endK) + wrinkle * 0.6 };
  }
  const collarXZ = (f, r) => [Math.sin(f) * r, -Math.cos(f) * r * 0.86 + 0.08 - 0.13 * (1 - Math.cos(f)) / 2];   // sau gáy lùi theo lưng trên đã dốc (backSlope)

  function collarGeo() {
    if (GEO.collar) return GEO.collar;
    const NA = 44, K = 6, NS = 9, f0 = COLLAR_GAP, f1 = Math.PI * 2 - COLLAR_GAP;
    const pos = [], uv = [], idx = [];
    let NC = 0;
    for (let i = 0; i <= NA; i++) {
      const f = f0 + (f1 - f0) * i / NA, C = collarCurve(f);
      const dr = C.rT - C.rB, dy = C.yT - C.yB, L = Math.hypot(dr, dy), d = [dr / L, dy / L], n = [d[1], -d[0]];
      const quilt = 0.006 * Math.pow(Math.abs(Math.sin(f * 5)), 0.6), w = 0.04 + quilt, rho = 0.055 + quilt * 0.5, Lc = L - rho;
      const h = l => w + (rho - w) * sm((l - (Lc - 0.1)) / 0.1);
      const ct = [];
      for (let j = 0; j < K; j++) { const l = Lc * j / K; ct.push([C.rB + d[0] * l - n[0] * h(l), C.yB + d[1] * l - n[1] * h(l)]); }
      const cr = C.rB + d[0] * Lc, cy = C.yB + d[1] * Lc;
      for (let j = 0; j < NS; j++) { const t = Math.PI * j / (NS - 1); ct.push([cr - n[0] * rho * Math.cos(t) + d[0] * rho * Math.sin(t), cy - n[1] * rho * Math.cos(t) + d[1] * rho * Math.sin(t)]); }
      for (let j = K - 1; j >= 0; j--) { const l = Lc * j / K; ct.push([C.rB + d[0] * l + n[0] * h(l), C.yB + d[1] * l + n[1] * h(l)]); }
      const e = Math.min(1, Math.min(f - f0, f1 - f) / 0.1), sc = 0.45 + 0.55 * Math.sqrt(1 - (1 - e) * (1 - e));   // mép đầu cổ bo tròn, không thu về một điểm
      const mr = (C.rB + cr) / 2, my = (C.yB + cy) / 2;
      let arc = 0;
      ct.forEach((q, j) => {
        const r = mr + (q[0] - mr) * sc, y = my + (q[1] - my) * sc;
        if (j) arc += Math.hypot(q[0] - ct[j - 1][0], q[1] - ct[j - 1][1]);
        const [x, z] = collarXZ(f, r);
        pos.push(x, y, z);
        uv.push(f * 0.9 * 0.14, arc * 0.14);
      });
      NC = ct.length;
    }
    for (let i = 0; i < NA; i++) for (let j = 0; j < NC; j++) {
      const a = i * NC + j, b = a + NC, c = i * NC + (j + 1) % NC, dd = c + NC;
      idx.push(a, b, c, b, dd, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return (GEO.collar = g);
  }

  // mặt thân áo (torsoGeo: elip theo độ cao) — để đường may / khoá kéo bám đúng mặt áo
  // Vai thật không phải vành trên của một khối tiện tròn: lồng ngực đạt bề ngang lớn nhất dưới nách,
  // sau đó dốc qua mỏm cùng vai về cổ. Chỏm tay áo đảm nhiệm phần delta ngoài cùng.
  function torsoRAt(y) { return lerpTab(TORSO_PROF, y) * 1.02; }
  // MỐC GIẢI PHẪU dưới vải (độ dời z, âm = nhô ra trước): gờ xương đòn chạy gần ngang từ hõm ức ra mỏm vai, hõm ức giữa hai đầu xương đòn,
  // rãnh delta-ngực dưới đầu ngoài xương đòn, khối cơ ngực lớn dưới xương đòn; phía sau: cơ thang dày từ gáy xuống vai, gai bả vai
  const Gn = (v, k) => Math.exp(-(v / k) * (v / k));
  const anat = (x, y, side) => {
    const ax = Math.abs(x);
    if (side < 0) {
      const yc = 3.3 + 0.07 * sm((ax - 0.3) / 1.1) - 0.04 * Gn(ax - 0.35, 0.2);
      const along = sm((ax - 0.22) / 0.12) * sm((1.55 - ax) / 0.2);
      return -0.055 * Gn(y - yc, 0.08) * along                                // gờ xương đòn (~7 mm)
        + 0.035 * Gn(y - yc - 0.13, 0.07) * along * sm((ax - 0.45) / 0.2)        // hõm trên xương đòn
        + 0.035 * Gn(x, 0.13) * Gn(y - 3.42, 0.09)                               // hõm ức nông (qua áo chỉ thấy nhẹ)
        + 0.04 * Gn(y - yc + 0.17, 0.1) * Gn(ax - 1.25, 0.16)                    // rãnh delta-ngực
        - 0.09 * Gn(y - 2.85, 0.35) * Gn(ax - 0.55, 0.5) * (1 - Gn(x, 0.12) * 0.3)   // khối cơ ngực đầy, rãnh giữa ức nhẹ
        + 0.09 * Math.pow(Math.min(1, ax / 1.45), 2) * Gn(y - 2.5, 0.8);          // lồng ngực cong tròn theo chiều ngang (không phẳng như tấm ván)
    }
    // lưng trên qua lớp áo: cơ thang là mặt dốc tròn rộng từ gáy xuống giữa lưng, không gờ (bắt đầu đột ngột ở y 2,95 + gai bả vai cũ -> gờ cứng như xương lộ)
    // Lưng trên và bả vai sau: khối cơ bả vai và cơ thang nở nang đầy đặn, dày dặn
    const scapula = 0.04 * Gn(ax - 0.92, 0.45) * Gn(y - 2.72, 0.52);
    const trap = 0.035 * Gn(ax - 0.45, 0.4) * sm((y - 2.2) / 1.0) * sm((3.85 - y) / 0.35);
    return scapula + trap;
  };
  // mặt thân áo trước (side < 0) / sau (side > 0) đúng như torsoGeo, hệ ngực
  const torsoSurfZ = (x, y, side) => {
    const R = lerpTab(TORSO_PROF, y) * 1.02;
    let z = side * Math.sqrt(Math.max(0, R * R - x * x)) * 0.66 * torsoFlat(x, y) * topFull(x, y);
    z = torsoDepth(z, y);
    if (z > 0) return (z *= backSlope(x, y)) + z * (-0.11 * Math.exp(-Math.pow((y - 0.1) / 0.55, 2)) + 0.06 * Math.exp(-Math.pow((y - 2.1) / 0.6, 2))) + anat(x, y, 1);
    z -= 0.03 * Math.exp(-Math.pow((y - 2.6) / 0.4, 2)) * sm((1.3 - Math.abs(x)) / 0.45);
    return z * chestSlope(x, y) + anat(x, y, -1);
  };
  // mặt trước thân áo đúng như torsoGeo (ép dẹt, phồng vai, kẹp độ dày, đắp ngực) — elip trơn cũ lệch mặt áo -> nẹp khoá lơ lửng
  const torsoFrontZ = (x, y) => {
    const R = torsoRAt(y);
    let z = torsoDepth(-Math.sqrt(Math.max(0, R * R - x * x)) * 0.66 * torsoFlat(x, y) * topFull(x, y), y);
    z -= 0.03 * Math.exp(-Math.pow((y - 2.6) / 0.4, 2)) * sm((1.3 - Math.abs(x)) / 0.45);
    return z * chestSlope(x, y) + anat(x, y, -1);
  };
  // chỗ mặt ngoài cổ áo nhô khỏi thân tại góc f (u = phần chiều cao cổ, 0 chân .. 1 mép)
  function collarExit(f) {
    const C = collarCurve(f);
    for (let k = 0; k <= 40; k++) {
      const u = k / 40, y = C.yB + (C.yT - C.yB) * u, r = C.rB + (C.rT - C.rB) * u + 0.04, xz = collarXZ(f, r), R = torsoRAt(y);
      if ((xz[0] / R) * (xz[0] / R) + (xz[1] / (0.66 * R)) * (xz[1] / (0.66 * R)) >= 1) return { u, C };
    }
    return { u: 1, C };
  }
  // đường chỉ may mảnh chạy trên mặt cổ áo, ngay trên chân cổ (nằm trên hẳn vải nên liền mạch, không chìm nổi vào thân)
  function collarSeamGeo() {
    if (GEO.collarSeam) return GEO.collarSeam;
    const pts = [];
    for (let i = 0; i <= 64; i++) {
      const f = COLLAR_GAP + 0.05 + (Math.PI * 2 - 2 * COLLAR_GAP - 0.1) * i / 64, E = collarExit(f), C = E.C;
      const u = Math.min(0.92, E.u + 0.09), y = C.yB + (C.yT - C.yB) * u, r = C.rB + (C.rT - C.rB) * u + 0.052, xz = collarXZ(f, r);
      pts.push(V(xz[0], y, xz[1]));
    }
    return (GEO.collarSeam = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 110, 0.012, 4, false));
  }

  function collarBindGeo() {
    if (GEO.collarBind) return GEO.collarBind;
    const pts = [];
    // viền may nằm hẳn trên mép cổ (không lơ lửng), chạy gần tới hai đầu trước
    for (let i = 0; i <= 48; i++) {
      const f = COLLAR_GAP + 0.04 + (Math.PI * 2 - 2 * COLLAR_GAP - 0.08) * i / 48, C = collarCurve(f);
      const [x, z] = collarXZ(f, C.rT - 0.005);
      pts.push(V(x, C.yT - 0.012, z));
    }
    return (GEO.collarBind = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, 0.03, 6, false));
  }

  function earGeo() {
    if (GEO.ear) return GEO.ear;
    const g = new THREE.SphereGeometry(0.2, 14, 10), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      x *= 0.16; y *= 1.45; z *= 0.85;
      const r = Math.hypot(y / 0.29, z / 0.17);
      if (x > 0 && r < 0.75) x -= 0.025 * (1 - r / 0.75);
      if (y < -0.18) z *= 0.8;
      p.setXYZ(i, x, y, z);
    }
    g.computeVertexNormals();
    return (GEO.ear = g);
  }

  function gaiterGeo() {
    if (GEO.gaiter) return GEO.gaiter;
    const g = new THREE.SphereGeometry(0.9, 40, 30), p = g.attributes.position;
    const G2 = (a, s) => Math.exp(-(a / s) * (a / s)), keep = [];
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const yn = y / 0.9;
      x *= 0.84; y *= y < 0 ? FACE_LOW : 1.12;
      if (yn < 0) { const t = Math.pow(-yn, 1.5); x *= 1 - 0.13 * t - 0.03 * t * t; z *= 1 - 0.06 * t; }
      if (z < 0) {
        const ax = Math.abs(x);
        z *= 0.97 + 0.03 * Math.min(1, ax / 0.6);
        const tipY = -0.38, below = Math.max(0, tipY - y);
        z -= (0.15 + 0.07 * Math.max(0, Math.min(1, (0.0 - y) / 0.38))) * G2(x, 0.07) * G2(y + 0.16, 0.25);
        z -= 0.11 * G2(x, 0.08) * G2(y - tipY, 0.08);
        z -= 0.05 * G2(Math.abs(x) - 0.09, 0.06) * G2(y + 0.41, 0.06);
        z -= 0.12 * Math.exp(-below / 0.45) * G2(x, 0.11 + 0.35 * below) * (below > 0 ? 1 : G2(y - tipY, 0.08));
        z -= 0.26 * G2(x, 0.34) * G2(y + 1.08, 0.17);
        z -= 0.14 * G2(x, 0.34) * G2(y + 0.7, 0.26);
        z += 0.14 * G2(x, 0.4) * G2(y + 1.34, 0.1);
        z -= 0.06 * G2(Math.abs(x) - 0.45, 0.12) * G2(y + 0.9, 0.18);
      }
      const a = Math.atan2(z, x), r = Math.hypot(x, z) || 1;
      const off = 0.07 + 0.02 * Math.sin(y * 26 + Math.sin(a * 2) * 1.4) * Math.min(1, Math.max(0, -y - 0.3)) + 0.008 * Math.sin(a * 7 + y * 9);
      let k = (r + off) / r;
      // dưới gáy / hàm: không để elip đầu thót nhọn thành cổ ma-nơ-canh — giữ cổ đầy, loe ra chân cổ, gáy dày
      if (y < -0.5) {
        const lo = sm((-y - 0.5) / 0.35), flare = sm((-y - 1.05) / 0.42);
        const need = (0.6 + 0.1 * flare) * (z > 0 ? 1.04 : 0.95);
        const bunch = 0.035 * lo * Math.pow(Math.abs(Math.sin(y * 17 + 1.4 * Math.sin(a * 1.3) + 0.8 * Math.sin(a * 3))), 0.6);
        const rn = Math.max(r + off, r + off + (need - r - off) * lo) + bunch;
        k = rn / r;
      }
      x *= k; z *= k; y -= y < -1.2 ? 0.05 : 0;
      const cut = z < 0 ? -0.2 + 0.22 * Math.exp(-(x / 0.15) * (x / 0.15)) - 0.06 * Math.pow(Math.min(1, Math.abs(x) / 0.75), 3) : -0.3;
      const over = y > cut;
      if (over) y = cut;
      p.setXYZ(i, x, y + 0.72, z);
      g.attributes.uv.setXY(i, g.attributes.uv.getX(i) * 3.0 * 0.55, (y + 0.72) * 0.55);
      keep.push(!over || true);
    }
    const idx = g.index.array, out = [];
    for (let t = 0; t < idx.length; t += 3) if (keep[idx[t]] && keep[idx[t + 1]] && keep[idx[t + 2]]) out.push(idx[t], idx[t + 1], idx[t + 2]);
    g.setIndex(out);
    g.computeVertexNormals();
    weldNormals(g);
    return (GEO.gaiter = g);
  }

  // đỉnh vai người thật mỏng theo trước-sau (dải xương đòn - bả vai), không phải vòm tròn như thân tiện; vùng cổ (|x| nhỏ) giữ nguyên
  const torsoFlat = (x, y) => {
    const upper = sm((y - 1.85) / 0.75) * sm((3.55 - y) / 0.42);
    const lateral = sm((Math.abs(x) - 0.58) / 0.9);
    // Đai vai/bả vai là một bản cong mỏng theo trước-sau; ép mạnh dần ra phía nách để bỏ mặt cắt “ống trụ”.
    return 1 - 0.29 * upper * Math.pow(lateral, 1.25);
  };
  // ĐAI VAI nhìn từ trên là khối hộp bo tròn (xương đòn phía trước, bả vai phía sau) chứ không phải elip tiện tròn:
  // elip + ép dẹt làm đỉnh vai / ngực trên thành mái nhọn khi nhìn nghiêng. Phồng độ dày về phía hai vai ở vùng trên.
  // NGỰC TRÊN dốc ra sau từ giữa ức tới hõm ức (~25°), mạnh ở giữa, nhẹ dần ra vai; không thì mặt ngực đứng như tường rồi gập ngang thành bàn phẳng quanh cổ
  const chestSlope = (x, y) => 1 - 0.17 * sm((y - 2.75) / 0.9) * (0.6 + 0.4 * sm((1.2 - Math.abs(x)) / 0.7));   // 0,3 cũ: ngực lõm, chân cổ lún
  // LƯNG TRÊN tròn, dốc dần về gáy (lưng bị kẹp phẳng đứng rồi gập góc lên vai -> cứng như hộp)
  // LƯNG TRÊN & BẢ VAI SAU: Dày dặn, nở nang khỏe mạnh tự nhiên của người lính mang giáp
  // Giữ nguyên độ dày bả vai sau, không gọt xẹp tạo vết lõm yên ngựa trước ăng-ten
  const backSlope = (x, y) => 1 - 0.06 * sm((y - 3.4) / 0.5) * sm((1.0 - Math.abs(x)) / 0.6);
  // Giữ hàm riêng vì các mặt phụ/đường may cùng gọi nó, nhưng không còn bơm dày hai đầu vai như bản cũ.
  const topFull = (x, y) => { const q = Math.min(1, Math.abs(x) / Math.max(0.3, lerpTab(TORSO_PROF, y) * 1.02)); return 1 - 0.05 * sm((y - 2.5) / 0.5) * sm((3.55 - y) / 0.4) * Math.pow(q, 1.4); };
  // Thân tiện tròn: rộng ngang thêm bao nhiêu thì dày trước-sau thêm bấy nhiêu -> ngực phồng như thùng phuy, xuyên qua tấm giáp.
  // Ngực thật dẹt: ép mềm độ dày về dưới mặt trong tấm giáp, bề ngang giữ nguyên; vùng cổ áo (y cao) không đổi.
  const torsoDepth = (z, y) => {
    // Thân trên và lưng người lính dày dặn, cơ bả vai nở nang
    const a = Math.abs(z);
    // Cơ bả vai chỉ tạo độ lồi nông; 0,14 cũ cộng đều lên cả lưng trên làm thành một thành trụ thẳng đứng.
    const shoulderBackPad = (z > 0 && y > 2.1) ? 0.035 * sm((y - 2.1) / 0.6) * sm((3.65 - y) / 0.4) : 0;
    const Z0 = 0.78 + 0.1 * sm((y + 0.3) / 0.6) + 0.08 * sm((y - 0.9) / 1.0) * sm((2.75 - y) / 0.45) + shoulderBackPad;
    if (a <= Z0) return z;
    const k = 0.96;
    return Math.sign(z) * (a + (Z0 + 0.08 * (1 - Math.exp(-(a - Z0) / 0.08)) - a) * k);
  };
  // Ngang nách (y 2,3-2,7) từng phồng 1,92: sườn thân lòi ra dưới chỏm vai thành khối thứ hai, vai trông như độn bông.
  const TORSO_PROF = [[1.32, -0.25], [1.38, 0.55], [1.49, 1.6], [1.56, 2.3], [1.62, 2.72], [1.64, 2.92], [1.56, 3.13], [1.32, 3.3], [0.96, 3.46], [0.62, 3.62], [0.46, 3.86]];
  // ---------- ỐNG TAY ÁO LIỀN MẢNH (bộ binh, lưới skinned) ----------
  // Một mặt vải từ nách qua đầu vai, bắp tay, khuỷu tới cổ tay (trước là 3 khối chồng ở vai + 2 khúc tay nối ở khuỷu, trơn như bóng).
  // Bám 3 xương: ngực -> cánh tay quanh mũ vai (khớp cầu), cánh tay -> cẳng tay quanh khuỷu. Có nếp vải thật trong lưới: nếp kéo từ
  // nách, xoắn chéo dọc tay, xếp ngấn mặt trong khuỷu, gom trên cổ tay; khe nếp tô tối vào màu đỉnh để đọc rõ cả ở xa.
  // S: khớp vai, D: trục tay buông (hệ root, tư thế gốc). userData.seam: đường may nách (giao với thân áo, hệ ngực).
  // Chỏm tay áo là vòm delta dốc, không phải bán cầu: đỉnh vai ngắn, nở dần xuống 1/3 trên cánh tay rồi thu nhẹ.
  const SLEEVE_PROF = [[0, -0.38], [0.18, -0.35], [0.34, -0.28], [0.46, -0.16], [0.535, 0], [0.57, 0.2], [0.575, 0.42], [0.555, 0.72], [0.53, 0.98], [0.5, 1.25], [0.48, 1.55], [0.465, 1.9], [0.45, 2.22], [0.465, 2.5], [0.48, 2.9], [0.455, 3.35], [0.405, 3.85], [0.345, 4.2], [0.315, 4.27], [0, 4.28]];
  const CAP_IN = 0.08;
  const CAP_W0 = 0.4, CAP_W1 = 1.6;
  const SLEEVE_R = y => ARM_K * (1 - 0.06 * sm((y - 3.7) / 0.4)) * (1 - 0.06 * Math.exp(-Math.pow((y - 0.35) / 0.45, 2))) * (1 - 0.05 * sm((y - 2.3) / 0.4));   // cơ delta bớt phồng; cẳng tay thon   // cổ tay thu thêm (cổ tay áo ôm găng)
  function sleeveGeo(chest, up, fore, s, S, D, toChest) {
    const Ox = V(1, s * 0.06, 0).normalize(), YT = -0.42, YE = 2.55, SEG = 36, C1 = SEG + 1, Gs = (v, k) => Math.exp(-(v / k) * (v / k));
    // hồ sơ & nếp vải khai báo theo tay chuẩn 2,55 / 2,15; co về chiều dài xương thật, mũ vai giữ nguyên
    const yReal = y => y <= 0.4 ? y : y <= YE ? 0.4 + (y - 0.4) * (ARM_UP - 0.4) / (YE - 0.4) : ARM_UP + (y - YE) * ARM_FORE / 2.15;
    const fold = (y, ci, sn, ph) => {
      const front = sm(0.1 - sn), inner = sm(ci + 0.2);
      const pit = 0.034 * Gs(y - 0.72, 0.42) * inner * Math.sin(y * 9 + ph * 3);                                      // nếp kéo từ nách
      const arm = 0.02 * sm((y - 0.7) / 0.4) * sm((2.25 - y) / 0.35) * Math.sin(y * 6.5 + ph * 2 + 1.1 * Math.sin(y * 2.1));  // xoắn chéo bắp tay
      const elb = 0.05 * Gs(y - YE, 0.4) * (0.25 + 0.75 * front) * Math.sin(y * 15 + ph * 1.5 + 0.8 * Math.sin(ph * 2));      // xếp ngấn khuỷu
      const frm = 0.02 * sm((y - 3.0) / 0.3) * sm((4.0 - y) / 0.3) * Math.sin(y * 7 - ph * 2 + 0.9 * Math.sin(y * 1.7));      // xoắn cẳng tay
      const wri = 0.026 * Gs(y - 4.02, 0.2) * Math.sin(y * 20 + ph * 3);                                                 // gom trên cổ tay
      return pit + arm + elb + frm + wri + 0.007 * Math.sin(ph * 5 + y * 6);
    };
    const surf = (y, ph) => {
      const r = lerpTab(SLEEVE_PROF, y) * SLEEVE_R(y), ci = Math.cos(ph), sn = Math.sin(ph);
      const cx = s * (-CAP_IN * sm((0.3 - y) / 0.85) + 0.03 * Gs(y - 0.4, 0.5));   // chỏm lệch vào trong ít: phủ mỏm vai thân áo (lệch 0,4 thì chỏm lọt dưới thân, lộ bậc vai + cục delta riêng)
      // Mặt cắt trước-sau mỏng hơn ngang tay, rõ nhất ở chỏm vai; bỏ silhouette “quả bóng” khi nhìn nghiêng.
      const ez = (0.88 + 0.08 * sm((0.7 - y) / 0.9)) * (1 - 0.05 * sm((y - 2.9) / 0.6));
      const f = r > 0.1 ? fold(y, ci, sn, ph) * Math.min(1, r / 0.3) : 0, R = r + f;
      const P = S.clone().addScaledVector(D, yReal(y)).addScaledVector(Ox, cx - s * ci * R).addScaledVector(V(0, 0, 1), sn * R * ez);
      P.fold = f;
      return P;
    };
    const ys = [];
    for (let i = 0; i <= 16; i++) { const t = i / 16; ys.push(YT + (0.3 - YT) * t * t * 0.45 + (0.3 - YT) * t * 0.55); }   // mũ vai dày hàng
    for (let y = 0.345; y < 4.2; y += 0.065) ys.push(y);
    ys.push(4.22, 4.25, 4.27, 4.28);
    const pos = [], uv = [], col = [], A = [], Bn = [], Wt = [], idx = [];
    for (const y of ys) {
      for (let j = 0; j <= SEG; j++) {
        const ph = j / SEG * Math.PI * 2, P = surf(y, ph), ci = Math.cos(ph);   // ph = 0 quay vào thân: mép nối hoa văn giấu trong nách
        pos.push(P.x, P.y, P.z);
        // UV: hình trụ dọc tay; quanh đỉnh chỏm chuyển sang chiếu phẳng theo cung từ đỉnh (trụ thì hoa văn + vân vải chụm về đỉnh thành hình sao khi giơ tay)
        { const tc = sm((0.75 - y) / 0.75), rc = (y - YT) * 0.135; uv.push(j / SEG / 2.2 * (1 - tc) + tc * (0.23 + Math.sin(ph) * rc), y * 0.14 * (1 - tc) + tc * (0.04 + Math.cos(ph) * rc)); }
        // tối ở khe nếp + hõm nách + mặt trong cánh tay sát thân (bù phần ánh sáng thời gian thực không có)
        const ao = Math.max(0.5, 1 - 5.5 * Math.max(0, -P.fold - 0.002) + 1.2 * Math.max(0, P.fold)) * (1 - 0.3 * sm(ci) * Gs(y - 0.8, 0.8));
        col.push(Math.min(1.04, ao), Math.min(1.04, ao), Math.min(1.04, ao));
        if (y < 1.5) { A.push(0); Bn.push(1); Wt.push(sm((y + CAP_W0) / CAP_W1)); }   // mũ vai: nửa trên bám ngực (mỏm vai đứng yên), cơ delta giãn dần theo tay; theo tay hết thì chỏm lăn như quả bóng khi đưa tay ra trước
        else { A.push(1); Bn.push(2); Wt.push(sm((y - YE + 0.2) / 0.4)); }       // pha hẹp quanh khuỷu: gập tay không thót mảnh
      }
    }
    for (let i = 0; i < ys.length - 1; i++) for (let j = 0; j < SEG; j++) { const a = i * C1 + j, b = a + C1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx); g.computeVertexNormals();
    const k = 40 * C1 + Math.round(SEG / 2), N = g.attributes.normal;   // kiểm chiều mặt: mặt ngoài cánh tay phải quay ra ngoài
    if (N.getX(k) * s < 0) { for (let t = 0; t < idx.length; t += 3) { const q = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = q; } g.setIndex(idx); g.computeVertexNormals(); }
    weldNormals(g);
    g.userData.blend = { bones: [chest, up, fore], a: new Uint8Array(A), b: new Uint8Array(Bn), w: new Float32Array(Wt) };
    // đường may nách: trên mỗi kinh tuyến, từ mũ vai đi xuống tới chỗ vải ló khỏi thân áo
    const outside = q => { const R = lerpTab(TORSO_PROF, q.y) * 1.02, zk = 0.66 * torsoFlat(q.x, q.y) * topFull(q.x, q.y); return q.y > 3.86 || Math.hypot(q.x, q.z / zk) > R; };
    const seam = [];
    for (let j = 0; j < 72; j++) {
      const ph = j / 72 * Math.PI * 2;
      let q = null;
      for (let y = YT + 0.01; y < 2.0; y += 0.012) { q = toChest(surf(y, ph)); if (outside(q)) break; }
      seam.push(q);
    }
    g.userData.seam = seam.map((q, i) => { const a = seam[(i + 71) % 72], b = seam[(i + 1) % 72]; return q.clone().multiplyScalar(0.5).addScaledVector(a, 0.25).addScaledVector(b, 0.25); });
    return g;
  }

  function torsoGeo() {
    if (GEO.torso) return GEO.torso;
    // đáy áo kết thúc ngay dưới thắt lưng, thu nhỏ hơn cạp quần (áo bỏ trong quần) — trước thòng tới -1,45 thành ống đáy
    // phẳng chụp ngoài quần: gờ ngang cắt qua bụng dưới như mặc váy ngắn ngoài quần
    const prof = [[0.0, -0.8], [1.22, -0.8], [1.3, -0.6], [1.32, -0.25], [1.38, 0.55], [1.49, 1.6], [1.56, 2.3], [1.62, 2.72], [1.64, 2.92], [1.56, 3.13], [1.32, 3.3], [0.96, 3.46], [0.62, 3.62], [0.46, 3.86], [0.0, 3.9]];
    const fine = [];
    for (let i = 0; i < prof.length - 1; i++) {
      // chia theo độ dài cung, mịn hơn ở vai / cổ (chia theo y thì đỉnh vai gần nằm ngang chỉ có 2 hàng đỉnh: gãy góc, không nặn được xương đòn)
      const a = prof[i], b = prof[i + 1], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (a[1] > 2.5 ? 0.06 : 0.11)));
      for (let k = 0; k < n; k++) fine.push(new THREE.Vector2((a[0] + (b[0] - a[0]) * k / n) * 1.02, a[1] + (b[1] - a[1]) * k / n));
    }
    fine.push(new THREE.Vector2(0, prof[prof.length - 1][1]));
    const g = new THREE.LatheGeometry(fine, 72);   // đủ mịn để đường may / khoá kéo bám đúng mặt áo và có nếp vải hai bên sườn
    g.scale(1, 1, 0.66);
    const P = g.attributes.position, U = g.attributes.uv;
    for (let i = 0; i < P.count; i++) {
      U.setXY(i, U.getX(i) * 2 / 2.2, P.getY(i) * 0.14);   // 2 ô quanh thân như hipGeo, liền mép sau lưng
      const y0 = P.getY(i), x0 = P.getX(i);
      let z0 = torsoDepth(P.getZ(i) * torsoFlat(x0, y0) * topFull(x0, y0), y0);
      if (z0 < 0) { z0 -= 0.03 * Math.exp(-Math.pow((y0 - 2.6) / 0.4, 2)) * sm((1.3 - Math.abs(x0)) / 0.45); z0 *= chestSlope(x0, y0); }
      if (z0 > 0) z0 *= backSlope(x0, y0);
      const zA = anat(x0, y0, z0 < 0 ? -1 : 1) * sm(Math.abs(z0) / 0.3);   // mốc giải phẫu, tắt dần ở mép hông (đổi dấu trước / sau không nhảy bậc)
      // đường cong sống lưng: lõm thắt lưng, lưng trên hơi tròn (chỉ mặt sau)
      P.setZ(i, z0 + zA + (z0 > 0 ? (z0 / 1.0) * (-0.14 * Math.exp(-Math.pow((y0 - 0.2) / 0.62, 2)) + 0.075 * Math.exp(-Math.pow((y0 - 2.35) / 0.68, 2))) : 0));
    }
    // nếp kéo chéo từ nách xuống sườn (lộ giữa tay và áo giáp); hõm nách tối
    const col = new Float32Array(P.count * 3), Gy = (v, k) => Math.exp(-(v / k) * (v / k));
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i), ax = Math.abs(x), side = sm((ax - 1.0) / 0.45);
      const f = 0.032 * side * Gy(y - 1.95, 0.75) * Math.sin(y * 8.5 + z * 5.5 * Math.sign(x || 1) + 0.9 * Math.sin(z * 3 + y));
      P.setX(i, x + Math.sign(x) * f);
      const ao = Math.max(0.55, 1 - 7 * Math.max(0, -f)) * (1 - 0.34 * sm((ax - 1.15) / 0.5) * Gy(y - 2.35, 0.55));
      col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = ao;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    weldNormals(g);
    return (GEO.torso = g);
  }

  function cuffGeo() {
    if (GEO.cuff) return GEO.cuff;
    const prof = [[0.33, 0.0], [0.345, 0.14], [0.352, 0.26], [0.343, 0.31], [0.318, 0.335], [0.29, 0.32], [0.278, 0.28]];
    return (GEO.cuff = clothUV(new THREE.LatheGeometry(prof.map(q => new THREE.Vector2(q[0], q[1])), 16)));
  }

  // hàn pháp tuyến các đỉnh trùng vị trí (mép nối lưới tròn xoay / cầu): không lộ đường sáng-tối dọc mép nối
  function weldNormals(g) {
    const P = g.attributes.position, N = g.attributes.normal, map = new Map();
    for (let i = 0; i < P.count; i++) {
      const k = Math.round(P.getX(i) * 1e4) + ',' + Math.round(P.getY(i) * 1e4) + ',' + Math.round(P.getZ(i) * 1e4);
      (map.get(k) || map.set(k, []).get(k)).push(i);
    }
    for (const l of map.values()) {
      if (l.length < 2) continue;
      let x = 0, y = 0, z = 0;
      for (const i of l) { x += N.getX(i); y += N.getY(i); z += N.getZ(i); }
      const d = Math.hypot(x, y, z) || 1;
      for (const i of l) N.setXYZ(i, x / d, y / d, z / d);
    }
    N.needsUpdate = true;
    return g;
  }

  // ---------- THÂN DƯỚI: HÔNG, ĐÙI, ỐNG CHÂN, GIÀY ----------
  // Người thật ~1,8 m (8 đv = 1 m): khớp hông y -1.45, đùi 3.1, cẳng chân 3.05, mắt cá cao 0.72 trên đế giày
  const HIP_Y = -1.45, HIP_X = 0.7, THIGH_L = 3.32, SHIN_L = 3.22, ANKLE_H = 0.72;   // khớp hông ~92 cm, gối ~50 cm trên sàn
  const FOOT_Y = HIP_Y - THIGH_L - SHIN_L - ANKLE_H;

  // ống vải lathe treo xuống (y 0 -> -L), lệch trước/sau theo zOff(t) để có bắp chân / đùi trước
  function hangGeo(key, prof, L, zOff, wrinkle, tiles) {
    if (GEO[key]) return GEO[key];
    // làm dày mặt cắt theo chiều dọc (~3% chiều dài / hàng): khối phồng (mông, bắp chân, nếp gối) tròn mượt, không gãy thành vây nhọn
    const dense = [];
    for (let i = 0; i < prof.length - 1; i++) {
      const [r0, t0] = prof[i], [r1, t1] = prof[i + 1], n = Math.max(1, Math.ceil(Math.abs(t1 - t0) / 0.03));
      for (let k = 0; k < n; k++) dense.push([r0 + (r1 - r0) * k / n, t0 + (t1 - t0) * k / n]);
    }
    dense.push(prof[prof.length - 1]);
    // mặt cắt phải đi từ DƯỚI lên (y tăng) thì LatheGeometry mới quay mặt ra ngoài; liệt kê từ trên xuống là lưới lộn trái:
    // mặt ngoài vô hình, chỉ thấy mặt trong phía đối diện (ống quần / mông trông giả, nặn mặt sau không lên hình)
    dense.reverse();
    const g = new THREE.LatheGeometry(dense.map(q => new THREE.Vector2(q[0], -q[1] * L)), 28), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const r = Math.hypot(x, z), t = -y / L;
      if (r < 1e-4) continue;
      const a = Math.atan2(z, x);
      const w = wrinkle(t, a);
      const k = (r + w) / r;
      x *= k; z *= k;
      z += zOff(t, z / r);
      p.setXYZ(i, x, y, z);
      // u theo cột lưới tròn xoay (liên tục 0..1); atan2 nhảy cóc ở một bên ống -> một dải tam giác kéo trọn ô hoa văn (vệt khoá kéo dọc ống)
      g.attributes.uv.setXY(i, g.attributes.uv.getX(i) * tiles / 2.2, y * 0.14);   // cùng mật độ hoa văn với thân áo (~3,5 đv / ô)
    }
    g.computeVertexNormals();
    weldNormals(g);
    return (GEO[key] = g);
  }

  function hipGeo() {
    if (GEO.hip) return GEO.hip;
    // Khung chậu & đũng quần: lưới tham số chuẩn giải phẫu học, bề ngang nở rộng cân đối với giáp ngực
    // Mặt trước phẳng phiu có nẹp khóa quần, hai bên hông khoét vòm bẹn rộng đón bắp đùi to khỏe,
    // phía sau có cơ mông nở nang tròn trịa
    const rows = 28, cols = 56;
    const pos = [], uv = [], idx = [];
    const C1 = cols + 1;

    for (let i = 0; i <= rows; i++) {
      const v = i / rows;
      for (let j = 0; j <= cols; j++) {
        const ph = (j / cols) * Math.PI * 2;
        const c = Math.cos(ph); // 1 = sau (+z), -1 = trước (-z)
        const s = Math.sin(ph); // 1 = phải (+x), -1 = trái (-x)

        // Đường viền mép đáy bo theo bẹn. Mặt trước giữa háng được nâng nhẹ; bản cũ
        // kéo xuống -1.98 rồi nối bằng tam giác dài nên tạo một chữ V nhọn như mảnh vải rời.
        const frontLift = c < 0 ? 0.17 * Math.pow(Math.max(0, -c), 2) : 0;
        const yBot = -1.95 + 0.47 * (s * s) + (c > 0 ? 0.02 * c : -0.03 * Math.abs(c)) + frontLift;
        const yTop = -0.44;
        const y = yTop + v * (yBot - yTop);

        // Bề ngang hông: thắt lưng 1.44, nở rộng 1.50 ở ngang khớp chậu
        const rx = 1.44 + 0.08 * Math.sin(Math.PI * v) - 0.04 * v * v;
        let x = rx * s;

        let z = 0;
        if (c < 0) {
          // Phía trước: phẳng phiu, đứng form quân trang dã chiến dày dặn
          const frontRz = 0.96 * (1.0 - 0.05 * v);
          z = c * frontRz;
          if (Math.abs(x) < 0.24) {
            const flyPlacket = Math.cos((x / 0.24) * (Math.PI / 2));
            z -= 0.03 * flyPlacket * sm((0.85 - v) / 0.3);
          }
        } else {
          // Phía sau: hai múi cơ mông nở nang, cong tròn đều đặn
          const baseRz = 0.98;
          const peakV = 0.60;
          const uy = (v - peakV) / (v < peakV ? 0.55 : 0.38);
          const bumpY = Math.sqrt(Math.max(0, 1 - uy * uy));

          const ux = (Math.abs(x) - 0.50) / 0.58;
          const bumpX = Math.sqrt(Math.max(0, 1 - ux * ux));

          const cleft = Math.exp(-Math.pow(x / 0.13, 2));
          const sideFalloff = sm((c - 0.15) / 0.6);

          const gluteBulge = (0.30 * bumpX * bumpY - 0.08 * cleft * bumpY) * sideFalloff;
          z = c * (baseRz + gluteBulge);

          if (v > 0.8) {
            const tuck = sm((v - 0.8) / 0.2);
            z -= 0.06 * tuck * c;
          }
        }

        pos.push(x, y, z);
        uv.push((j / cols) * (2.0 / 2.2), y * 0.14);
      }
    }

    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const a = i * C1 + j;
        const b = a + C1;
        idx.push(a, b, a + 1);
        idx.push(a + 1, b, b + 1);
      }
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    weldNormals(g);
    return (GEO.hip = g);
  }

  // Mảnh đáy quần cong nối hai ống đùi ở mặt trước. Đây là một bề mặt dệt liên tục,
  // thay cho vài tam giác cực dài nối mép trước-ra-sau của hipGeo (nguyên nhân khe đen/V nhọn).
  function crotchGeo() {
    if (GEO.crotch) return GEO.crotch;
    const NY = 18, NX = 12, pos = [], uv = [], idx = [];
    for (let iy = 0; iy <= NY; iy++) {
      const v = iy / NY, ease = sm(v);
      const y = -1.18 - 0.98 * v;
      const w = 0.68 + (0.31 - 0.68) * ease;
      for (let ix = 0; ix <= NX; ix++) {
        const u = ix / NX * 2 - 1, x = u * w;
        // Phồng rất nhẹ ở giữa, chìm dần vào hai nếp bẹn; tuyệt đối không tạo codpiece.
        const center = 1 - u * u;
        const z = -0.925 + 0.055 * ease - 0.025 * (1 - center) - 0.012 * Math.cos(v * Math.PI * 2) * center;
        pos.push(x, y, z);
        uv.push((u * 0.5 + 0.5) * 0.32, y * 0.14);
      }
    }
    const C = NX + 1;
    for (let iy = 0; iy < NY; iy++) for (let ix = 0; ix < NX; ix++) {
      const a = iy * C + ix, b = a + C;
      // winding hướng ra mặt trước (-z)
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    weldNormals(g);
    return (GEO.crotch = g);
  }

  // mảng vải cong ôm ống (túi hộp đùi, nắp túi...): chỏm trụ bán kính r, tâm cung th (0 = +z sau, π/2 = +x), rộng dth,
  // cao h, phồng giữa bulge; UV theo đơn vị dài (dùng vải uniS)
  function patchGeo(r, th, dth, h, bulge) {
    const key = 'patch' + [r, th, dth, h, bulge].map(v => v.toFixed(3)).join('_');
    if (GEO[key]) return GEO[key];
    const g = new THREE.CylinderGeometry(1, 1, 1, 12, 6, true, th - dth / 2, dth), p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const a = Math.atan2(x, z), uu = Math.atan2(Math.sin(a - th), Math.cos(a - th)) / (dth / 2), vv = y * 2;
      const rr = r + bulge * Math.sqrt(Math.max(0, 1 - uu * uu)) * Math.sqrt(Math.max(0, 1 - vv * vv * 0.8));
      p.setXYZ(i, x * rr, y * h, z * rr);
      uv.setXY(i, uu * dth / 2 * r, y * h);
    }
    g.computeVertexNormals();
    return (GEO[key] = g);
  }

  // đệm cứng bo góc: lưới vuông ánh xạ sang hình gối tròn cạnh, ôm mặt trụ bán kính r quanh góc th; phồng giữa bulge
  function padGeo(r, th, dth, h, bulge) {
    const key = 'padG' + [r, th, dth, h, bulge].join('_');
    if (GEO[key]) return GEO[key];
    const NX = 14, NY = 12, pos = [], uv = [], idx = [];
    for (let j = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) {
      const a = i / NX * 2 - 1, b = j / NY * 2 - 1, k = 0.72;
      const u = a * (1 - k + k * Math.sqrt(1 - b * b / 2)), v = b * (1 - k + k * Math.sqrt(1 - a * a / 2));
      const e = Math.max(Math.abs(a), Math.abs(b)), rr = r + bulge * sm((1 - e) / 0.35), ang = th + u * dth / 2;
      pos.push(Math.sin(ang) * rr, v * h / 2, Math.cos(ang) * rr);
      uv.push(u * dth / 2 * r * 4, v * h / 2 * 4);
    }
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { const a = j * (NX + 1) + i, b = a + NX + 1; idx.push(a, a + 1, b, a + 1, b + 1, b); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return (GEO[key] = g);
  }

  // mảng vải gối: chỏm trụ cong phía trước gối, mép bo, gồ giữa (đệm bên trong)
  function kneePanelGeo() {
    if (GEO.kneeP) return GEO.kneeP;
    const g = new THREE.CylinderGeometry(1, 1, 1, 18, 8, true, Math.PI - 0.85, 1.7), p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const a = Math.atan2(x, z) - Math.PI, u = Math.atan2(Math.sin(a), Math.cos(a)) / 0.85;   // -1..1 ngang
      const bump = Math.sqrt(Math.max(0, 1 - u * u)) * Math.sqrt(Math.max(0, 1 - 4 * y * y));
      const r = 0.5 + 0.02 + 0.06 * bump;
      const Y = y * 0.78 - 0.1;
      p.setXYZ(i, x * r, Y, z * r + 0.02);
      uv.setXY(i, u * 0.43, Y);
    }
    g.computeVertexNormals();
    return (GEO.kneeP = g);
  }

  // cổ giày: thon ở mắt cá, nở nhẹ lên mép, viền đệm cổ; gốc tại mắt cá (hệ knee dịch -SHIN_L)
  const SHAFT_PROF = [[0.0, -0.5], [0.36, -0.5], [0.385, -0.35], [0.38, -0.12], [0.365, 0.08], [0.37, 0.35], [0.39, 0.65], [0.415, 0.9], [0.43, 1.04], [0.41, 1.1], [0.36, 1.08]];
  function shaftXform(x, y, z) {
    const heel = z > 0 ? 1 + 0.12 * Math.exp(-Math.pow((y + 0.2) / 0.3, 2)) : 1;   // ụ gót bọc xuống tới đế
    const fwd = z < 0 ? 0.22 * sm((0.45 - y) / 0.8) * Math.pow(Math.max(0, -z) / 0.4, 1.5) : 0;   // chân cổ phía trước đổ xuống nối vào mu
    return V(x * 0.92, y, z * 1.1 * heel - fwd);
  }
  // điểm trên mặt cổ giày: a = 0 giữa mặt trước, PI gót
  const shaftPt = (y, a) => {
    const t = SHAFT_PROF.slice(1).map(q => [q[0], q[1]]), r = lerpTab(t, y);
    return shaftXform(Math.sin(a) * r, y, -Math.cos(a) * r);
  };
  function bootShaftGeo() {
    if (GEO.bShaft) return GEO.bShaft;
    const g = new THREE.LatheGeometry(SHAFT_PROF.map(q => new THREE.Vector2(q[0], q[1])), 28), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const Q = shaftXform(p.getX(i), p.getY(i), p.getZ(i)); p.setXYZ(i, Q.x, Q.y, Q.z); }
    g.computeVertexNormals();
    return (GEO.bShaft = weldNormals(g));
  }

  // Đùi dã chiến to khỏe, cơ bắp: đầu trên là chỏm cầu vòm tròn đồng tâm quanh khớp hông (0, 0, 0), lồng trọn trong hốc bẹn
  // Phom quần dã chiến thụng dày dặn, bắp đùi nở nang cân đối hoàn hảo với áo giáp ngực
  const thighGeo = () => hangGeo('thigh',
    [[0, -0.145], [0.36, -0.12], [0.62, -0.08], [0.74, -0.04], [0.80, 0.0], [0.78, 0.18], [0.74, 0.40], [0.69, 0.60], [0.64, 0.80], [0.59, 0.94], [0.58, 1.0], [0.0, 1.02]], THIGH_L,
    (t, c) => (c < 0 ? -0.05 : 0.02) * Math.sin(Math.PI * Math.min(1, Math.max(0, t) * 1.1)),
    (t, a) => 0.012 * Math.sin(t * 16 + Math.sin(a * 2)), 1);

  // Cẳng chân dã chiến to khỏe: đầu trên có chỏm gối lồng trong ống đùi, bắp chân sau nở nang, cổ chân dày dặn
  const shinGeo = () => hangGeo('shin',
    [[0, -0.11], [0.38, -0.08], [0.50, -0.04], [0.56, 0.0], [0.54, 0.22], [0.50, 0.45], [0.46, 0.68], [0.42, 0.86], [0.0, 0.90]], SHIN_L,
    (t, c) => c > 0 ? 0.11 * c * Math.exp(-Math.pow((t - 0.28) / 0.16, 2)) : 0,
    (t, a) => 0.008 * Math.sin(t * 18 + Math.sin(a * 2)), 1);

  // giày: loft các mặt cắt siêu-elip từ gót (+z) tới mũi (-z), gốc tại mắt cá; cổ giày làm riêng theo ống chân
  // mặt cắt giày theo z (gót +z -> mũi -z): nửa bề ngang w, mép trên top, mép dưới bot; e = hệ số bo chỏm hai đầu
  const BOOT_Z0 = 0.46, BOOT_Z1 = -1.72;
  function bootProf(z, mode) {
    const Y0 = -ANKLE_H, u = c01((z - BOOT_Z0) / (BOOT_Z1 - BOOT_Z0));
    let w = 0.31 + 0.09 * Math.exp(-Math.pow((z + 0.95) / 0.45, 2)) + 0.03 * sm((-z - 0.2) / 0.6) - 0.03 * sm((z - 0.1) / 0.3);
    // mu giày dốc đều từ cổ chân xuống mũi (không phải đế phẳng + ống đứng), mũi bo tròn thấp
    const Yt = Y0 + 0.52, tt = c01((-z + 0.05) / 1.75);
    let top = Yt + (0.42 - Yt) * Math.pow(1 - tt, 1.3) - 0.05 * sm((-z - 1.2) / 0.5);
    top = Math.min(top, Y0 + 0.58 + 2.2 * (BOOT_Z0 - z));      // gót cong lên liền vào cổ giày, không chìa bậc vuông sau cổ
    let bot = Y0 + 0.17 + 0.05 * sm((-z - 1.35) / 0.3);
    if (mode === 'sole') {
      // đế dày, gót tách khối, lõm cung bàn chân, mũi đế hếch
      w += 0.022;
      const arch = sm((z + 0.86) / 0.16) * (1 - sm((z + 0.1) / 0.05));   // cung bàn chân: gót dừng thành bậc, mũi đế thoải
      top = Y0 + 0.21 + 0.05 * sm((-z - 1.4) / 0.25);
      bot = Y0 + 0.05 + 0.1 * arch + 0.1 * sm((-z - 1.45) / 0.25);
    }
    const zA = mode === 'sole' ? BOOT_Z0 : BOOT_Z0 - 0.03, zB = mode === 'sole' ? BOOT_Z1 : BOOT_Z1 + 0.05, uE = c01((z - zA) / (zB - zA));
    const eH = uE < 0.1 ? Math.sqrt(1 - Math.pow(1 - uE / 0.1, 2)) : 1, eT = uE > 0.8 ? Math.pow(Math.max(0, 1 - Math.pow((uE - 0.8) / 0.2, 2.6)), 1 / 2.6) : 1;   // mũi tù tròn như giày thật, không nhọn
    return { w, top, bot, e: eH * eT, u };
  }

  // loft các mặt cắt siêu-elip; mode: 'upper' thân giày | 'sole' đế | 'toe' mũi bọc (phủ nổi lên phần trước)
  function footPt(z, t, mode) {
    const sole = mode === 'sole' || mode === 'mid', se = (c, ex) => Math.sign(c) * Math.pow(Math.abs(c), ex);
    let { w, top, bot, e } = bootProf(z, sole ? 'sole' : 'upper');
    if (mode === 'toe') { w += 0.018; top += 0.018; }
    if (mode === 'mid') { w += 0.008; bot = top - 0.075; } else if (mode === 'sole') top -= 0.05;   // đế giữa sáng hơn nằm trên đế ngoài
    const mid = sole ? (top + bot) / 2 : bot + Math.min(0.2, (top - bot) * 0.3), up = top - mid, dn = mid - bot, c = Math.cos(t), sn = Math.sin(t);
    // quanh cổ chân (mặt cắt cao): thành đứng thẳng như giày thật; mũi giày (mặt cắt thấp): vồng tròn
    const tall = sole ? 0 : sm((up - 0.3) / 0.5);
    const x = w * e * se(c, sole ? 0.45 : sn < 0 ? 0.25 : 0.7 - 0.4 * tall) *   // nửa dưới vuông thành, ôm khít mép đế
       (sn > 0 && !sole ? 1 - 0.3 * (1 - tall) * sn * sn - 0.08 * tall * sn : 1);
    const y = mid + (sn > 0 ? up * se(sn, sole ? 0.5 : 1.25) * (sole ? 1 : e) : dn * se(sn, sole ? 0.2 : 0.35) * (sole ? 1 : Math.min(1, e * 3)));
    return V(x, y, z);
  }
  // loft các mặt cắt siêu-elip; mode: 'upper' thân giày | 'toe' mũi bọc | 'mid' đế giữa | 'sole' đế ngoài
  function bootGeo(mode) {
    const key = 'boot_' + mode;
    if (GEO[key]) return GEO[key];
    const NU = 36, NA = 18, pos = [], idx = [], u0 = mode === 'toe' ? 0.68 : 0, N = Math.round(NU * (1 - u0));
    for (let i = 0; i <= N; i++) {
      const u = u0 + (1 - u0) * i / N, z = BOOT_Z0 + (BOOT_Z1 - BOOT_Z0) * u;
      for (let k = 0; k < NA; k++) { const P = footPt(z, k / NA * Math.PI * 2, mode); pos.push(P.x, P.y, P.z); }
    }
    for (let i = 0; i < N; i++) for (let k = 0; k < NA; k++) {
      const a0 = i * NA + k, a1 = i * NA + (k + 1) % NA, b0 = a0 + NA, b1 = a1 + NA;
      idx.push(a0, b0, a1, a1, b0, b1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return (GEO[key] = g);
  }

  // mảnh ốp bám mặt: f(u, v) -> điểm trên mặt, nổi lift theo pháp tuyến, mép chìm xuống (lộ độ dày như da khâu chồng)
  function bootPanel(key, f, ref, lift, NU = 14, NV = 8) {
    if (GEO[key]) return GEO[key];
    const pos = [], idx = [], e = 0.02;
    const Lu = f(0, 0.5).distanceTo(f(1, 0.5)), Lv = f(0.5, 0).distanceTo(f(0.5, 1));
    for (let j = 0; j <= NV; j++) for (let i = 0; i <= NU; i++) {
      const u = i / NU, v = j / NV, P = f(u, v);
      const n = f(Math.min(1, u + e), v).sub(f(Math.max(0, u - e), v)).cross(f(u, Math.min(1, v + e)).sub(f(u, Math.max(0, v - e)))).normalize();
      if (n.dot(P.clone().sub(ref(P))) < 0) n.negate();
      const d = Math.min(Math.min(u, 1 - u) * Lu, Math.min(v, 1 - v) * Lv);
      P.addScaledVector(n, -0.01 + (lift + 0.01) * sm(d / 0.018));
      pos.push(P.x, P.y, P.z);
    }
    const a0 = V(pos[0], pos[1], pos[2]), a1 = V(pos[3], pos[4], pos[5]), b0 = V(pos[(NU + 1) * 3], pos[(NU + 1) * 3 + 1], pos[(NU + 1) * 3 + 2]);
    const mP = f(0.5, 0.5), mN = f(0.52, 0.5).sub(f(0.48, 0.5)).cross(f(0.5, 0.52).sub(f(0.5, 0.48)));
    const flip = (a1.clone().sub(a0).cross(b0.clone().sub(a0)).dot(mN) < 0) !== (mN.dot(mP.clone().sub(ref(mP))) < 0);
    for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
      const a = j * (NU + 1) + i, b = a + 1, c = a + NU + 1, d = c + 1;
      if (flip) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return (GEO[key] = g);
  }
  const footRef = P => V(0, -ANKLE_H + 0.2, P.z), shaftRef = P => V(0, P.y, 0);
  const lerp1 = (a, b, t) => a + (b - a) * t;
  function bootTube(key, pts, r) { return GEO[key] || (GEO[key] = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length * 4, r, 4, false)); }

  // đường chỉ may viền đế (welt) + gai đế răng cưa quanh mép + dây buộc trên mu giày — gộp 1 lưới mỗi loại
  function bootTrimGeo(kind) {
    const key = 'bootTrim_' + kind;
    if (GEO[key]) return GEO[key];
    const Y0 = -ANKLE_H;
    if (kind === 'welt') {
      const pts = [];
      for (let i = 1; i < 44; i++) {
        const z = BOOT_Z0 + (BOOT_Z1 - BOOT_Z0) * (0.5 - 0.5 * Math.cos(Math.PI * i / 44)), P = bootProf(z, 'upper');
        if (P.e > 0.02) pts.push(V(P.w * P.e + 0.012, bootProf(z, 'sole').top + 0.006, z));
      }
      const back = pts.slice().reverse().map(q => V(-q.x, q.y, q.z));
      return (GEO[key] = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.concat(back), true), 120, 0.016, 4, true));
    }
    if (kind === 'lugs') {
      const list = [];
      for (let z = 0.38; z > -1.56; z -= 0.14) {
        if (Math.abs(z + 0.42) < 0.2) continue;                                  // cung bàn chân không có gai
        const P = bootProf(z, 'sole'), W = P.w * P.e;
        if (P.e < 0.55) continue;
        for (const sx of [-1, 1]) for (const a of [0.68, 0.22]) {
          const b = new THREE.BoxGeometry(W * 0.38, 0.06, 0.085);
          b.translate(sx * a * W, P.bot - 0.02, z);
          list.push(b);
        }
      }
      return (GEO[key] = mergeGeos(list));
    }
    // dây buộc chéo trên mu giày + khoen
    const list = [], at = (sg, z, lift) => { const Q = footPt(z, Math.PI / 2 - sg * 0.4, 'upper'); Q.y += lift; return Q; };
    for (let k = 0; k < 3; k++) {
      const z0 = -0.24 - k * 0.14, z1 = z0 - 0.14;
      for (const sx of [-1, 1]) { const A = at(sx, z0, 0.03), B = at(-sx, z1, 0.03); list.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([A, A.clone().lerp(B, 0.5).setY((A.y + B.y) / 2 + 0.03), B]), 5, 0.017, 4, false)); }
    }
    return (GEO[key] = mergeGeos(list));
  }

  // ---------- SÚNG TRƯỜNG CẦM TAY (bộ binh) ----------
  // Gốc tại tay cầm súng; nòng chĩa -z. Điểm nắm: tay phải (0,0,0) trục cán ~ (0,-0.94,0.33), tay trái ốp lót (0,-0.08,-2.15) trục -z
  // gripL = tâm cuộn ngón nằm trên trục ốp lót tay (y 0,22, bán kính 0,21); y -0,08 cũ ở dưới ốp: ngón cuộn quanh khoảng trống, ốp đặt lên ngón như khay
  const RIFLE = {
    gripR: V(0, -0.32, 0.1), gripL: V(0, 0.2, -1.85),
    axisR: V(0, 0.94, -0.33).normalize(), axisL: V(0, 0, -1),
    palmR: V(-1, 0, 0), palmL: V(0, 1, 0),
    elbowR: V(2.75, 0.9, 0.75), elbowL: V(-2.35, 0.45, -0.4),
    elbowReadyR: V(3.1, 0.45, 0.45), elbowReadyL: V(-2.65, 0.05, -0.2),
    readySlideL: 0.28, butt: V(0, 0.18, 2.55)
  };
  // khối đùn từ mặt cắt cạnh (shape x = z súng, y = y), dày theo x súng, bo cạnh
  function sideGeo(key, pts, W, bev = 0.025, curve = false) {
    if (GEO[key]) return GEO[key];
    const sh = new THREE.Shape();
    pts.forEach((q, i) => {
      if (!i) sh.moveTo(q[0], q[1]);
      else if (q.length === 4) sh.quadraticCurveTo(q[0], q[1], q[2], q[3]);
      else sh.lineTo(q[0], q[1]);
    });
    const g = new THREE.ExtrudeGeometry(sh, { depth: Math.max(0.001, W - 2 * bev), bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 2, curveSegments: curve ? 8 : 4 });
    g.translate(0, 0, -(W - 2 * bev) / 2);
    g.rotateY(-Math.PI / 2);
    g.computeVertexNormals();
    return (GEO[key] = g);
  }

  function buildRifle(M, add) {
    const g = new THREE.Group();
    const gun = M.gun || (M.gun = new THREE.MeshStandardMaterial({ color: 0x1a1b19, roughness: 0.5, metalness: 0.5 }));
    const poly = M.gunP || (M.gunP = new THREE.MeshStandardMaterial({ color: 0x232320, roughness: 0.82, metalness: 0 }));
    const fde = M.gunT || (M.gunT = new THREE.MeshStandardMaterial({ color: 0x75664a, roughness: 0.85 }));
    const dark = M.gunD || (M.gunD = new THREE.MeshStandardMaterial({ color: 0x0b0b0a, roughness: 0.7 }));
    const B = 0.22, tubeX = (r, l, z, mat, seg = 12) => add(g, new THREE.CylinderGeometry(r, r, l, seg), mat, 0, B, z, Math.PI / 2, 0, 0);
    // thân trên: hộp khoá nòng + nắp cửa thoát vỏ + trợ lực khoá + tay kéo khoá nòng
    add(g, sideGeo('rUpper', [[0.42, 0.06], [-1.42, 0.06], [-1.42, 0.44], [0.3, 0.44], [0.42, 0.36]], 0.28, 0.03), gun, 0, 0, 0);
    add(g, rbox(0.04, 0.16, 0.5), dark, 0.15, 0.27, -0.5);
    add(g, new THREE.CylinderGeometry(0.06, 0.07, 0.18, 10), gun, 0.16, 0.3, 0.05, 0, 0, Math.PI / 2 - 0.3);
    add(g, rbox(0.3, 0.06, 0.12), gun, 0, 0.47, 0.42);
    // ray Picatinny trên nóc thân + răng ray
    add(g, rbox(0.2, 0.06, 1.75), gun, 0, 0.47, -0.52);
    for (let k = 0; k < 12; k++) add(g, rbox(0.22, 0.035, 0.07), gun, 0, 0.515, 0.25 - k * 0.14);
    // thân dưới: ổ băng đạn + vành cò + chốt an toàn
    add(g, sideGeo('rLower', [[0.42, 0.08], [0.42, -0.12], [0.05, -0.16], [-0.6, -0.16], [-0.62, -0.5], [-1.2, -0.5], [-1.24, -0.16], [-1.42, -0.06], [-1.42, 0.08]], 0.27, 0.03), gun, 0, 0, 0);
    add(g, new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(0, -0.14, 0.02), V(0, -0.36, 0.0), V(0, -0.4, -0.25), V(0, -0.36, -0.5), V(0, -0.2, -0.58)]), 12, 0.03, 5, false), gun, 0, 0, 0);
    add(g, rbox(0.03, 0.18, 0.05), dark, 0, -0.24, -0.22, 0.25, 0, 0);
    add(g, new THREE.CylinderGeometry(0.05, 0.05, 0.3, 8), gun, 0, -0.02, 0.08, 0, 0, Math.PI / 2);
    // báng cầm nghiêng (cao su sần)
    add(g, sideGeo('rGrip', [[0.4, -0.1], [0.04, -0.1], [0.22, -0.55], [0.36, -0.93], [0.72, -0.95], [0.78, -0.82], [0.62, -0.42]], 0.25, 0.05, true), poly, 0, 0, 0);
    // băng đạn cong (polymer màu cát)
    add(g, sideGeo('rMag', [[-0.64, -0.42], [-1.18, -0.42], [-1.35, -0.95, -1.62, -1.42], [-1.08, -1.58], [-0.9, -1.0, -0.64, -0.42]], 0.24, 0.04, true), fde, 0, 0, 0);
    for (let k = 0; k < 3; k++) add(g, rbox(0.255, 0.04, 0.42), fde, 0, -0.7 - k * 0.16, -0.95 - k * 0.07, 0.2 + k * 0.08, 0, 0);
    add(g, sideGeo('rMagB', [[-1.04, -1.5], [-1.66, -1.36], [-1.72, -1.5], [-1.1, -1.66]], 0.27, 0.03), poly, 0, 0, 0);
    // ốp lót tay bát giác có rãnh M-LOK + ray trên
    const hg = add(g, new THREE.CylinderGeometry(0.21, 0.21, 2.25, 8), gun, 0, B, -2.55, Math.PI / 2, 0, 0); hg.rotation.y = Math.PI / 8;
    for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) add(g, rbox(0.03, 0.09, 0.3), dark, sx * 0.2, B, -1.9 - k * 0.45);
    for (let k = 0; k < 4; k++) add(g, rbox(0.1, 0.03, 0.3), dark, 0, B - 0.2, -1.9 - k * 0.45);
    add(g, rbox(0.2, 0.06, 2.2), gun, 0, 0.47, -2.55);
    for (let k = 0; k < 15; k++) add(g, rbox(0.22, 0.035, 0.07), gun, 0, 0.515, -1.5 - k * 0.145);
    // nòng, khối trích khí, đầu ngắm gập, loa che lửa
    tubeX(0.058, 1.2, -4.25, gun, 10);
    add(g, rbox(0.17, 0.2, 0.18), gun, 0, B + 0.02, -3.82);
    tubeX(0.08, 0.06, -4.55, gun);
    const fh = tubeX(0.085, 0.4, -5.0, gun, 6);
    for (let k = 0; k < 3; k++) add(g, rbox(0.02, 0.06, 0.24), dark, Math.cos(k * 2.1) * 0.085, B + Math.sin(k * 2.1) * 0.085, -5.05, 0, 0, k * 2.1);
    add(g, sideGeo('rFsight', [[-3.3, 0.5], [-3.45, 0.5], [-3.43, 0.74], [-3.33, 0.74]], 0.18, 0.02), gun, 0, 0, 0);
    // ống báng + báng rút kiểu dốc + đệm cao su + khoen dây
    tubeX(0.115, 1.55, 1.15, gun);
    add(g, sideGeo('rStock', [[1.05, 0.42], [2.5, 0.45], [2.56, 0.41], [2.56, -0.24], [2.46, -0.27], [1.9, -0.06], [1.35, 0.06], [1.05, 0.08]], 0.24, 0.05), poly, 0, 0, 0);
    add(g, rbox(0.27, 0.74, 0.12), dark, 0, 0.1, 2.58);
    add(g, rbox(0.08, 0.2, 0.42), dark, 0, 0.0, 1.62);
    add(g, new THREE.TorusGeometry(0.07, 0.02, 4, 10), gun, 0.17, 0.2, 1.9, 0, Math.PI / 2, 0);
    // kính ngắm chấm đỏ trên đế nâng (trục ngắm y 0.78) + ốp che + nắp lật
    add(g, rbox(0.18, 0.14, 0.5), gun, 0, 0.6, -0.75);
    tubeX(0.13, 0.62, -0.75, gun, 16).position.y = 0.78;
    for (const z of [-1.08, -0.42]) { const r = add(g, new THREE.TorusGeometry(0.15, 0.035, 6, 16), gun, 0, 0.78, z); }
    add(g, rbox(0.06, 0.34, 0.06), gun, 0.15, 0.68, -1.08); add(g, rbox(0.06, 0.34, 0.06), gun, -0.15, 0.68, -1.08);
    add(g, rbox(0.1, 0.1, 0.14), gun, 0.18, 0.8, -0.75);
    add(g, new THREE.CylinderGeometry(0.06, 0.06, 0.12, 10), gun, 0, 0.96, -0.75);
    add(g, new THREE.CircleGeometry(0.12, 16), M.lens, 0, 0.78, -1.065, 0, Math.PI, 0);
    add(g, new THREE.CircleGeometry(0.12, 16), M.lens, 0, 0.78, -0.43, 0, 0, 0);
    // đầu ngắm sau gập
    add(g, sideGeo('rRsight', [[0.15, 0.5], [0.0, 0.5], [0.02, 0.68], [0.13, 0.68]], 0.2, 0.02), gun, 0, 0, 0);
    // dây đeo súng
    const sl = new THREE.CatmullRomCurve3([V(0.16, 0.1, -2.9), V(0.3, -0.9, -2.0), V(0.32, -1.2, 0.2), V(0.2, -0.1, 1.9)]);
    add(g, strapGeo(sl, 0.12, 0.025, 'rSling', V(0, 1.2, -0.3)), M.web2, 0, 0, 0);
    g.scale.setScalar(0.92);
    return g;
  }

  // ---------- SÚNG PHÓNG LỰU Ổ QUAY 6 VIÊN 40 MM (vũ khí chính bộ binh) ----------
  // Lựu 40x46 mm sơ tốc thấp, đạn nổ lõm-mảnh (HEDP ~65 mm thép: thủng xe bọc thép nhẹ, nóc / đuôi / sườn mỏng xe tăng,
  // phá kính ngắm, xích, đồ gắn ngoài) — bắn theo Grenade40 của game. Dài ~72 cm.
  // Kết cấu như súng ổ quay thật: KHUNG CHỮ C ôm ổ đạn (thanh trên có ray, tấm đỡ nòng trước, thanh dưới, khối cò sau),
  // ổ đạn khía rãnh có miệng 6 buồng + nắp lò xo sau, ốp ray vuông quanh nòng (tay đỡ), báng rút có tì má, báng cầm khía ngón.
  // Cùng hệ trục với súng trường (gốc tại báng cầm, nòng -z, trục ngắm y 0.78, báng vai z 2.55) để dùng chung thế cầm.
  const GL = {
    gripR: V(0, -0.32, 0.1), gripL: V(0, 0.2, -1.8),   // tâm cuộn ngón trên trục ốp vuông (y 0,22)
    axisR: V(0, 0.94, -0.33).normalize(), axisL: V(0, 0, -1),
    palmR: V(-1, 0, 0), palmL: V(0, 1, 0),
    elbowR: V(2.8, 0.85, 0.8), elbowL: V(-2.55, 0.35, -0.25),
    elbowReadyR: V(3.15, 0.4, 0.5), elbowReadyL: V(-2.8, -0.05, -0.05),
    readySlideL: 0.18, butt: V(0, 0.18, 2.55)
  };
  // mặt cắt ổ đạn: tròn có 6 rãnh khía lõm giữa các buồng (đùn dọc trục)
  function drumGeo() {
    if (GEO.glDrum) return GEO.glDrum;
    const sh = new THREE.Shape(), N = 96, R = 0.53;
    for (let i = 0; i <= N; i++) {
      const a = i / N * Math.PI * 2, k = Math.cos(a * 6 + Math.PI / 6);
      const r = R - 0.06 * Math.pow(Math.max(0, k), 6);                       // rãnh khía hẹp giữa hai buồng
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      if (!i) sh.moveTo(x, y); else sh.lineTo(x, y);
    }
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.84, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.03, bevelSegments: 2, curveSegments: 4 });
    g.translate(0, 0, -0.42);
    g.computeVertexNormals();
    return (GEO.glDrum = g);
  }
  function buildGL(M, add) {
    const g = new THREE.Group();
    const steel = M.glSteel || (M.glSteel = new THREE.MeshStandardMaterial({ color: 0x2c2d2b, roughness: 0.42, metalness: 0.6 }));
    const park = M.glPark || (M.glPark = new THREE.MeshStandardMaterial({ color: 0x1f201e, roughness: 0.62, metalness: 0.35 }));   // thép phốt phát mờ
    const od = M.glOD || (M.glOD = new THREE.MeshStandardMaterial({ color: 0x4d4f3c, roughness: 0.8, metalness: 0.05 }));          // nhựa ô-liu
    const paint = M.glPaint || (M.glPaint = new THREE.MeshStandardMaterial({ color: 0x5b5d45, roughness: 0.72, metalness: 0.2 }));  // sơn ô-liu bạc trên ổ đạn
    const rub = M.gunD || (M.gunD = new THREE.MeshStandardMaterial({ color: 0x0b0b0a, roughness: 0.7 }));
    const B = 0.22, DY = B - 0.36;                                     // trục nòng / tâm ổ đạn (buồng trên cùng thẳng nòng)
    const tubeZ = (r, l, z, mat, y = B, seg = 18, x = 0) => add(g, new THREE.CylinderGeometry(r, r, l, seg), mat, x, y, z, Math.PI / 2, 0, 0);

    // ---- KHUNG CHỮ C ôm ổ đạn ----
    add(g, sideGeo('gl2Top', [[0.62, 0.38], [-1.52, 0.38], [-1.52, 0.56], [0.5, 0.56], [0.62, 0.5]], 0.34, 0.04), park, 0, 0, 0);        // thanh trên
    for (let k = 0; k < 13; k++) add(g, rbox(0.3, 0.05, 0.08), park, 0, 0.6, 0.48 - k * 0.15);                                          // răng ray
    add(g, sideGeo('gl2Front', [[-1.2, 0.4], [-1.52, 0.4], [-1.52, -0.66], [-1.36, -0.78], [-1.2, -0.7]], 0.4, 0.05), park, 0, 0, 0);     // tấm đỡ nòng
    add(g, sideGeo('gl2Bot', [[-0.12, -0.7], [-1.3, -0.7], [-1.3, -0.82], [-0.12, -0.82]], 0.22, 0.03), park, 0, 0, 0);                  // thanh dưới
    add(g, sideGeo('gl2Rear', [[0.62, 0.42], [-0.16, 0.42], [-0.16, -0.62], [0.05, -0.74], [0.26, -0.3], [0.62, -0.12]], 0.36, 0.05), park, 0, 0, 0);   // khối cò
    add(g, new THREE.CylinderGeometry(0.07, 0.07, 0.42, 10), steel, 0.19, DY, -1.36, 0, 0, Math.PI / 2);                                  // chốt trục ổ
    add(g, rbox(0.06, 0.16, 0.24), steel, 0.2, 0.18, -1.36);                                                                            // lẫy mở khung

    // ---- Ổ ĐẠN ----
    add(g, drumGeo(), paint, 0, DY, -0.68);
    for (let k = 0; k < 6; k++) {
      const a = k / 6 * Math.PI * 2 + Math.PI / 2, cx = Math.cos(a) * 0.36, cy = DY + Math.sin(a) * 0.36;
      add(g, new THREE.CylinderGeometry(0.175, 0.175, 0.03, 16), rub, cx, cy, -1.13, Math.PI / 2, 0, 0);                              // miệng buồng
      add(g, new THREE.TorusGeometry(0.175, 0.022, 6, 16), steel, cx, cy, -1.12);
    }
    tubeZ(0.1, 0.12, -1.12, steel, DY);
    add(g, new THREE.SphereGeometry(0.38, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), paint, 0, DY, -0.2, Math.PI / 2, 0, 0).scale.set(1, 0.35, 1);   // nắp lò xo sau
    add(g, new THREE.TorusGeometry(0.43, 0.025, 6, 28), steel, 0, DY, -0.22);

    // ---- NÒNG + ỐP RAY VUÔNG (tay đỡ) ----
    tubeZ(0.19, 1.95, -2.5, steel);
    tubeZ(0.215, 0.14, -3.42, steel);                                                                                                   // vành miệng nòng
    add(g, new THREE.CircleGeometry(0.155, 18), rub, 0, B, -3.5, 0, Math.PI, 0);
    add(g, rbox(0.5, 0.5, 1.25), od, 0, B, -2.12);                                                                                       // ốp ray
    for (const [rx, ry, rz] of [[0, 0.28, 0], [0, -0.28, 0], [0.28, 0, Math.PI / 2], [-0.28, 0, Math.PI / 2]]) {
      for (let k = 0; k < 7; k++) add(g, rbox(0.2, 0.05, 0.08), park, rx, B + ry, -1.6 - k * 0.17, 0, 0, rz);                             // ray 4 mặt
    }
    for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) add(g, rbox(0.02, 0.18, 0.22), rub, sx * 0.255, B - 0.02, -1.78 - k * 0.32);       // khe thoát nhiệt

    // ---- BÁNG CẦM khía ngón + VÀNH CÒ + CÒ ----
    add(g, sideGeo('gl2Grip', [[0.42, -0.1], [0.06, -0.1], [0.12, -0.3], [0.16, -0.36, 0.22, -0.44], [0.26, -0.55, 0.32, -0.64], [0.36, -0.93], [0.74, -0.95], [0.8, -0.82], [0.62, -0.42]], 0.26, 0.05, true), od, 0, -0.02, 0.02);
    add(g, new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(0, -0.12, 0.06), V(0, -0.38, 0.02), V(0, -0.42, -0.24), V(0, -0.36, -0.46), V(0, -0.2, -0.5)]), 14, 0.032, 6, false), park, 0, 0, 0);
    add(g, new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(0, -0.12, -0.2), V(0, -0.24, -0.24), V(0, -0.32, -0.18)]), 8, 0.028, 6, false), steel, 0, 0, 0);
    add(g, rbox(0.04, 0.1, 0.16), steel, 0.19, 0.08, 0.2);                                                                               // chốt an toàn

    // ---- BÁNG RÚT: ống đệm + thân báng có tì má + đệm cao su ----
    tubeZ(0.11, 1.2, 1.2, park, B + 0.02, 14);
    add(g, sideGeo('gl2Stock', [[1.02, 0.36], [1.55, 0.4], [1.75, 0.52], [2.3, 0.54], [2.5, 0.46], [2.5, -0.34], [2.36, -0.36], [1.85, -0.1], [1.3, 0.04], [1.02, 0.1]], 0.27, 0.05, true), od, 0, 0, 0);
    add(g, rbox(0.03, 0.22, 0.5), rub, 0.14, 0.12, 1.9);                                                                                 // lỗ khoét giảm nặng
    add(g, rbox(0.3, 0.86, 0.12), rub, 0, 0.06, 2.55);                                                                                   // đệm cao su
    add(g, rbox(0.1, 0.1, 0.16), park, 0, -0.06, 1.3);                                                                                  // lẫy chỉnh báng

    // ---- KÍNH CHẤM ĐỎ (trục ngắm y 0.78) + loa che + thước ngắm gập ----
    add(g, rbox(0.22, 0.12, 0.5), park, 0, 0.66, -0.6);
    tubeZ(0.14, 0.58, -0.6, park, 0.8, 18);
    tubeZ(0.17, 0.2, -0.98, park, 0.8, 18);                                                                                            // loa che nắng
    add(g, new THREE.CircleGeometry(0.13, 16), M.lens, 0, 0.8, -1.085, 0, Math.PI, 0);
    add(g, new THREE.CircleGeometry(0.12, 16), M.lens, 0, 0.8, -0.3, 0, 0, 0);
    add(g, new THREE.CylinderGeometry(0.05, 0.05, 0.1, 10), park, 0.18, 0.82, -0.6, 0, 0, Math.PI / 2);                                 // núm chỉnh độ sáng
    // thước ngắm bậc thang GẬP nằm dọc mép trái ray, thấp hơn trục ngắm (dựng đứng chắn trước kính chấm đỏ — chỉ dựng khi bắn cầu vồng xa)
    add(g, rbox(0.05, 0.11, 0.44), park, -0.21, 0.6, -1.32);
    for (let k = 0; k < 4; k++) add(g, rbox(0.06, 0.012, 0.025), steel, -0.235, 0.6, -1.16 - k * 0.1);
    add(g, new THREE.CylinderGeometry(0.035, 0.035, 0.08, 8), steel, -0.2, 0.6, -1.08, 0, 0, Math.PI / 2);                            // chốt gập

    // ---- khoen dây + dây đeo ----
    for (const z of [-1.4, 1.85]) add(g, new THREE.TorusGeometry(0.07, 0.018, 4, 10), steel, 0.2, z > 0 ? 0.1 : -0.55, z, 0, Math.PI / 2, 0);
    const sl = new THREE.CatmullRomCurve3([V(0.22, -0.55, -1.4), V(0.34, -1.1, -0.6), V(0.34, -1.2, 0.6), V(0.22, 0.1, 1.85)]);
    add(g, strapGeo(sl, 0.12, 0.025, 'gl2Sling', V(0, 1.2, -0.3)), M.web2, 0, 0, 0);
    g.scale.setScalar(0.92);
    return g;
  }

  const BELT_Z = 0.7;
  function beltGeo(kind, prof) {
    const key = 'belt_' + kind;
    if (GEO[key]) return GEO[key];
    const g = new THREE.LatheGeometry(prof.map(q => new THREE.Vector2(q[0], q[1])), 40);
    g.scale(1, 1, BELT_Z);
    g.computeVertexNormals();
    return (GEO[key] = weldNormals(g));
  }

  // quai đệm vai: mặt cắt elip, hai đầu vát lọt vào mép giáp
  function padStrapGeo(curve, w, t, key, core) {
    if (GEO[key]) return GEO[key];
    const N = 28, K = 10, pos = [], uv = [], idx = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N, P = curve.getPointAt(u), T = curve.getTangentAt(u), out = P.clone().sub(core).normalize();
      const side = V().crossVectors(T, out).normalize(), nrm = V().crossVectors(side, T).normalize();
      const end = Math.min(1, Math.min(u, 1 - u) / 0.06), k = 0.55 + 0.45 * Math.sqrt(end);
      for (let j = 0; j < K; j++) {
        const a = j / K * Math.PI * 2, q = P.clone().addScaledVector(side, Math.cos(a) * w / 2 * k).addScaledVector(nrm, Math.sin(a) * t / 2 * k);
        pos.push(q.x, q.y, q.z); uv.push(j / K, u);
      }
    }
    for (let i = 0; i < N; i++) for (let j = 0; j < K; j++) {
      const a = i * K + j, b = a + K, c = i * K + (j + 1) % K, d = c + K;
      idx.push(a, c, b, c, d, b);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return (GEO[key] = g);
  }

  function deltGeo() {
    if (GEO.delt) return GEO.delt;
    // đầu vai thon dần vào trong tay áo và thân, không còn mép dày như một cục dán lên vai
    const prof = [[0.0, -0.08], [0.3, -0.07], [0.46, 0.02], [0.55, 0.16], [0.59, 0.36], [0.57, 0.6], [0.51, 0.85], [0.42, 1.02], [0.26, 1.1], [0.0, 1.12]];
    const g = new THREE.LatheGeometry(prof.map(q => new THREE.Vector2(q[0], q[1])), 24);
    g.scale(1, 1, 0.9);
    clothUV(g);
    weldNormals(g);
    return (GEO.delt = g);
  }

  // ---------- GỘP LƯỚI THEO KHỚP (chống lag) ----------
  // Hình người dựng từ ~440 mảnh nhỏ = ~440 lượt vẽ (×2 khi đổ bóng): 10 lính ~34 ms/khung, 30 lính ~175 ms trên RTX 4070.
  // Mọi mảnh gắn cứng vào cùng một nhóm khớp (Group: hông, ngực, đầu, đùi, cẳng, bàn chân, cánh tay, súng...) và cùng vật liệu
  // được gộp thành 1 lưới trong hệ của nhóm đó — hoạt cảnh chỉ xoay các nhóm nên hình dáng & chuyển động không đổi.
  // Giữ riêng: mảnh đổi tỉ lệ / ẩn hiện từng khung (delt, vệt máu thấm).
  function mergeMeshGeos(list, withColor) {
    let nv = 0, ni = 0;
    for (const m of list) { const g = m.geometry; nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), col = withColor ? new Float32Array(nv * 3) : null;
    const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
    const v = new THREE.Vector3(), nm = new THREE.Matrix3();
    let ov = 0, oi = 0;
    for (const m of list) {
      const g = m.geometry, P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv, C = g.attributes.color, n = P.count;
      m.updateMatrix();
      nm.getNormalMatrix(m.matrix);
      for (let i = 0; i < n; i++) {
        v.fromBufferAttribute(P, i).applyMatrix4(m.matrix); pos.set([v.x, v.y, v.z], (ov + i) * 3);
        if (N) { v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); nor.set([v.x, v.y, v.z], (ov + i) * 3); }
        if (U) { uv[(ov + i) * 2] = U.getX(i); uv[(ov + i) * 2 + 1] = U.getY(i); }
        if (col) { if (C) { col[(ov + i) * 3] = C.getX(i); col[(ov + i) * 3 + 1] = C.getY(i); col[(ov + i) * 3 + 2] = C.getZ(i); } else col.fill(1, (ov + i) * 3, (ov + i) * 3 + 3); }
      }
      const flip = m.matrix.determinant() < 0;   // tỉ lệ âm (tai đối xứng...) -> đảo chiều tam giác cho mặt ngoài vẫn quay ra
      const cnt = g.index ? g.index.count : n;
      for (let i = 0; i < cnt; i += 3) {
        const a = g.index ? g.index.getX(i) : i, b = g.index ? g.index.getX(i + 1) : i + 1, c = g.index ? g.index.getX(i + 2) : i + 2;
        idx[oi + i] = ov + a; idx[oi + i + 1] = ov + (flip ? c : b); idx[oi + i + 2] = ov + (flip ? b : c);
      }
      ov += n; oi += cnt;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.setIndex(new THREE.BufferAttribute(idx, 1));
    out.computeBoundingSphere();
    return out;
  }

  function bakeFigure(F, keep) {
    const groups = [];
    F.root.traverse(o => { if (o.isGroup) groups.push(o); });
    const out = [];
    for (const g of groups) {
      const byMat = new Map();
      for (const c of g.children) {
        if (!c.isMesh || c.isSkinnedMesh || keep.has(c)) continue;
        if (!c.visible) { out.push(c); continue; }
        if (!byMat.has(c.material)) byMat.set(c.material, []);
        byMat.get(c.material).push(c);
      }
      for (const [mat, list] of byMat) {
        if (list.length < 2) { out.push(list[0]); continue; }
        const m = new THREE.Mesh(mergeMeshGeos(list, !!mat.vertexColors), mat);
        m.castShadow = list.some(c => c.castShadow);
        m.receiveShadow = true;
        m.renderOrder = list[0].renderOrder;
        m.userData = Object.assign({}, list[0].userData, { merged: list.length });
        for (const c of list) g.remove(c);
        g.add(m);
        out.push(m);
      }
    }
    for (const m of keep) if (m.isMesh) out.push(m);
    F.meshes.length = 0;
    for (const m of out) F.meshes.push(m);
  }

  // GỘP CẢ NGƯỜI THÀNH LƯỚI SKINNED (bộ binh): các nhóm khớp sẵn có làm xương (Skeleton nhận Object3D bất kỳ), mỗi đỉnh
  // bám cứng 1 xương = nhóm chứa mảnh đó. Vật liệu màu trơn cùng kiểu bề mặt (cùng normalMap / mặt / kim loại) dồn thành
  // 1 vật liệu màu đỉnh -> ~20 lượt vẽ / người (bản dựng gốc ~440). Hoạt cảnh vẫn chỉ xoay các nhóm như cũ.
  // Lưu ý: tia bắn trúng (raycast) lên SkinnedMesh tính theo tư thế gốc -> trò chơi dùng getHitboxes() cho bộ binh.
  const SKIN_MATS = {};
  // ảnh phản chiếu nhỏ (trời sáng trên, chân trời sáng, đất nâu dưới) cho kim loại bóng: không có gì để phản chiếu thì thép trông như nhựa xám
  let _metalEnv = null;
  function metalEnv() {
    if (_metalEnv || typeof document === 'undefined') return _metalEnv;
    const face = (top, mid, bot) => { const c = document.createElement('canvas'); c.width = c.height = 16; const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 16);
      gr.addColorStop(0, top); gr.addColorStop(0.5, mid); gr.addColorStop(1, bot); g.fillStyle = gr; g.fillRect(0, 0, 16, 16); return c; };
    const side = face('#9fbad6', '#e8ecef', '#6b5a44');
    _metalEnv = new THREE.CubeTexture([side, side, face('#b7cfe6', '#b7cfe6', '#b7cfe6'), face('#55483a', '#55483a', '#55483a'), side, side]);
    _metalEnv.needsUpdate = true;
    return _metalEnv;
  }
  function skinBucketKey(mat) {
    if (mat.map || mat.vertexColors || mat.transparent || mat.alphaMap) return mat;          // vật liệu có ảnh / màu đỉnh riêng: giữ nguyên
    const metal = mat.metalness > 0.3 ? 'm' : 'd';
    const nm = mat.normalMap ? mat.normalMap.uuid : '-';
    return 'solid|' + metal + '|' + nm + '|' + mat.side;
  }
  function skinBucketMat(key, mats) {
    if (typeof key !== 'string') return key;
    if (SKIN_MATS[key]) return SKIN_MATS[key];
    const m0 = mats[0], avg = (f) => mats.reduce((a, m) => a + m[f], 0) / mats.length;
    const o = { vertexColors: true, roughness: avg('roughness'), metalness: avg('metalness'), side: m0.side };
    if (m0.normalMap) { o.normalMap = m0.normalMap; o.normalScale = m0.normalScale.clone(); }
    return (SKIN_MATS[key] = new THREE.MeshStandardMaterial(o));
  }

  // ---------- LOD BỘ BINH ----------
  // Lưới gộp của mỗi "mẫu lính" (phe + môi trường + vũ khí) chỉ tính một lần rồi dùng chung: lính nào cũng cùng cấu trúc xương.
  // Bậc 0: đủ chi tiết. Bậc 1: giản lược ~1,5 cm, gộp mọi mảng màu đặc thành một lượt vẽ. Bậc 2: ~3 cm, một lượt vẽ màu đỉnh, không ảnh.
  // Bóng: mọi bậc đổ bóng qua một lưới riêng cỡ bậc 1 (một lượt vẽ) không ghi màu, thay vì vẽ lại toàn bộ chi tiết trong lượt bóng.
  // ÁNH SÁNG PHỤ CHO LÍNH: màn hình của game nhận thẳng giá trị tuyến tính, còn màu quân phục phải tối để đứng trong nắng không chói
  // hơn nền -> mặt khuất nắng (chỉ có ánh trời) gần như đen trên nền cỏ sáng. Cơ thể người ngoài trời nhận nhiều ánh dội từ đất và
  // xung quanh hơn một mặt phẳng, nên chỉ khuếch đại phần ánh trời của vật liệu lính; phần nắng giữ nguyên, trời tối thì lính tối theo.
  const SOLDIER_FILL = { value: 1.7 };   // đo trên 5 bản đồ: mặt khuất từ ~1/4 lên ~1/3 độ sáng đất nắng; 2 trở lên thì lính trong bóng nhà sáng hơn nền
  function fillMat(m) {
    if (!m.isMeshStandardMaterial || m.userData.soldierFill) return m;
    m.userData.soldierFill = true;
    m.onBeforeCompile = (sh) => {
      sh.uniforms.soldierFill = SOLDIER_FILL;
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float soldierFill;')
        .replace('#include <aomap_fragment>', 'reflectedLight.indirectDiffuse *= soldierFill;\n#include <aomap_fragment>');
    };
    m.needsUpdate = true;
    return m;
  }
  const BAKE_CACHE = new Map(), LOD_CELL = [0.022, 0.19, 0.36, 0.26];   // bậc 1, bậc 2, lưới đổ bóng
  let LOD_SOLID = null, LOD_FAR = null, LOD_SHADOW = null;
  const lodMats = () => {
    if (LOD_FAR) return;
    LOD_SOLID = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0.05, skinning: true });
    LOD_FAR = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, skinning: true });
    LOD_SHADOW = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, skinning: true });
  };
  // Gộp đỉnh theo ô lưới (không trộn đỉnh khác xương; bậc gần còn tách theo hướng pháp tuyến để giữ mép vật mỏng)
  function clusterGeo(g, cell, keepFacing) {
    const P = g.attributes.position.array, N = g.attributes.normal.array, U = g.attributes.uv.array, C = g.attributes.color ? g.attributes.color.array : null;
    const SI = g.attributes.skinIndex.array, SW = g.attributes.skinWeight.array, I = g.index.array, n = P.length / 3;
    const ids = new Map(), remap = new Int32Array(n), sum = [];
    for (let i = 0; i < n; i++) {
      const i3 = i * 3, i4 = i * 4, ix = Math.floor(P[i3] / cell) + 512, iy = Math.floor(P[i3 + 1] / cell) + 512, iz = Math.floor(P[i3 + 2] / cell) + 512;
      const face = keepFacing ? (N[i3] > 0 ? 1 : 0) + (N[i3 + 1] > 0 ? 2 : 0) + (N[i3 + 2] > 0 ? 4 : 0) : 0;
      const wk = Math.round(SW[i4 + 1] * 3), key = ((((ix * 1024 + iy) * 1024 + iz) * 8 + face) * 64 + SI[i4]) * 256 + (wk ? SI[i4 + 1] * 4 + wk : 0);
      let id = ids.get(key);
      if (id === undefined) { id = sum.length; ids.set(key, id); sum.push({ i, k: 0, x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0, r: 0, gc: 0, b: 0 }); }
      const q = sum[id]; q.k++; q.x += P[i3]; q.y += P[i3 + 1]; q.z += P[i3 + 2]; q.nx += N[i3]; q.ny += N[i3 + 1]; q.nz += N[i3 + 2];
      if (C) { q.r += C[i3]; q.gc += C[i3 + 1]; q.b += C[i3 + 2]; }
      remap[i] = id;
    }
    const m = sum.length, pos = new Float32Array(m * 3), nor = new Float32Array(m * 3), uv = new Float32Array(m * 2), col = C ? new Float32Array(m * 3) : null, si = new Uint16Array(m * 4), sw = new Float32Array(m * 4);
    sum.forEach((q, j) => {
      const j3 = j * 3, j4 = j * 4, o = q.i, l = Math.hypot(q.nx, q.ny, q.nz);
      pos[j3] = q.x / q.k; pos[j3 + 1] = q.y / q.k; pos[j3 + 2] = q.z / q.k;
      if (l > 1e-3) { nor[j3] = q.nx / l; nor[j3 + 1] = q.ny / l; nor[j3 + 2] = q.nz / l; } else { nor[j3] = N[o * 3]; nor[j3 + 1] = N[o * 3 + 1]; nor[j3 + 2] = N[o * 3 + 2]; }
      uv[j * 2] = U[o * 2]; uv[j * 2 + 1] = U[o * 2 + 1];
      if (C) { col[j3] = q.r / q.k; col[j3 + 1] = q.gc / q.k; col[j3 + 2] = q.b / q.k; }
      for (let k = 0; k < 4; k++) { si[j4 + k] = SI[o * 4 + k]; sw[j4 + k] = SW[o * 4 + k]; }
    });
    const tri = [];
    for (let t = 0; t < I.length; t += 3) { const a = remap[I[t]], b = remap[I[t + 1]], c = remap[I[t + 2]]; if (a !== b && b !== c && a !== c) tri.push(a, b, c); }
    const o = new THREE.BufferGeometry();
    o.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    o.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    o.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    if (col) o.setAttribute('color', new THREE.BufferAttribute(col, 3));
    o.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    o.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    o.setIndex(new THREE.BufferAttribute(m > 65535 ? new Uint32Array(tri) : new Uint16Array(tri), 1));
    return o;
  }
  // màu trung bình của ảnh (rằn ri) cho bậc xa không dùng ảnh
  const TEX_AVG = new Map();
  function texAvg(t) {
    if (!t || !t.image) return [1, 1, 1];
    const id = t.image.uuid || t.image;
    if (TEX_AVG.has(id)) return TEX_AVG.get(id);
    const c = document.createElement('canvas'); c.width = c.height = 8;
    const x = c.getContext('2d'); x.drawImage(t.image, 0, 0, 8, 8);
    const d = x.getImageData(0, 0, 8, 8).data; let r = 0, g = 0, b = 0;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
    const v = [r / 16320, g / 16320, b / 16320];
    TEX_AVG.set(id, v);
    return v;
  }
  // gộp nhiều lưới thành một, màu vật liệu + ảnh trung bình đổ vào màu đỉnh
  function mergeColored(list) {
    let nv = 0, ni = 0;
    for (const e of list) { nv += e.geo.attributes.position.count; ni += e.geo.index.count; }
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), col = new Float32Array(nv * 3), si = new Uint16Array(nv * 4), sw = new Float32Array(nv * 4);
    const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
    let ov = 0, oi = 0;
    for (const e of list) {
      const g = e.geo, a = g.attributes, n = a.position.count, C = a.color ? a.color.array : null, M0 = e.mat, tex = M0.map ? texAvg(M0.map) : [1, 1, 1];
      const k = M0.vertexColors && !M0.map ? [1, 1, 1] : [M0.color.r * tex[0], M0.color.g * tex[1], M0.color.b * tex[2]];
      pos.set(a.position.array, ov * 3); nor.set(a.normal.array, ov * 3); uv.set(a.uv.array, ov * 2); si.set(a.skinIndex.array, ov * 4); sw.set(a.skinWeight.array, ov * 4);
      for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) col[(ov + i) * 3 + c] = (C ? C[i * 3 + c] : 1) * k[c];
      const I = g.index.array;
      for (let i = 0; i < I.length; i++) idx[oi + i] = ov + I[i];
      ov += n; oi += I.length;
    }
    const o = new THREE.BufferGeometry();
    o.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    o.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    o.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    o.setAttribute('color', new THREE.BufferAttribute(col, 3));
    o.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    o.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    o.setIndex(new THREE.BufferAttribute(idx, 1));
    return o;
  }
  const lodBounds = (g) => { g.computeBoundingSphere(); g.boundingSphere.radius += 4; g.userData.shared = true; return g; };
  function buildLods(list) {
    lodMats();
    const near = list.map(e => ({ geo: clusterGeo(e.geo, LOD_CELL[1], true), mat: e.mat, renderOrder: e.renderOrder, userData: e.userData }));
    const bigMap = e => e.mat.map && e.geo.index.count > 9000;   // ở 25-80 m chỉ vải chính cần rằn ri
    const solids = near.filter(e => !bigMap(e)), lod1 = near.filter(bigMap).map(e => { lodBounds(e.geo); return e; });
    if (solids.length) lod1.push({ geo: lodBounds(mergeColored(solids)), mat: LOD_SOLID, renderOrder: solids[0].renderOrder, userData: solids[0].userData });
    const ro = list[0].renderOrder, ud = list[0].userData;
    const coarse = (cell) => {
      const g = clusterGeo(mergeColored(list.map(e => ({ geo: e.geo, mat: e.mat }))), cell, false);
      g.computeVertexNormals();   // pháp tuyến trung bình theo ô lệch ở vật mỏng (vệt sáng dọc đường may)
      return lodBounds(g);
    };
    const far = coarse(LOD_CELL[2]), caster = coarse(LOD_CELL[3]);
    return { lod1, lod2: [{ geo: far, mat: LOD_FAR, renderOrder: ro, userData: ud }], caster: { geo: caster, mat: LOD_SHADOW, renderOrder: ro, userData: ud } };
  }
  // đổi bậc chi tiết của một lính (bộ binh); kíp lái / lưới không gộp thì bỏ qua
  function setLod(F, level) {
    const L = F && F.lod;
    if (!L || L.cur === level) return;
    for (const m of L.levels[L.cur]) m.visible = false;
    for (const m of L.levels[level]) m.visible = true;
    L.cur = level;
  }
  function setShadow(F, on) {
    if (F && F.lod) F.lod.caster.visible = !!on;
    else if (F) F.root.traverse(o => { if (o.isMesh) o.castShadow = !!on; });
  }

  function bakeSkinned(F, keep) {
    const root = F.root;
    root.updateMatrixWorld(true);
    const rootInv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const bones = [];
    root.traverse(o => { if (o.isGroup) bones.push(o); });
    const boneIdx = new Map(bones.map((b, i) => [b, i]));
    const rel = (o) => new THREE.Matrix4().multiplyMatrices(rootInv, o.matrixWorld);
    const skeleton = new THREE.Skeleton(bones, bones.map(b => rel(b).invert()));   // một khung xương dùng chung cho mọi lưới của người này
    const buckets = new Map(), out = [];
    const skinMesh = (e, level) => {
      const sm = new THREE.SkinnedMesh(e.geo, fillMat(e.mat));
      sm.castShadow = false;
      // nhận bóng (nhà, tán cây, xe, chính mình): thiếu cờ này lính đứng trong bóng toà nhà / dưới tán rừng vẫn sáng như ngoài nắng
      sm.receiveShadow = true;
      sm.renderOrder = e.renderOrder;
      sm.userData = Object.assign({}, e.userData);
      sm.visible = level === 0;
      root.add(sm);
      sm.bind(skeleton, new THREE.Matrix4());
      return sm;
    };
    const finish = (E) => {
      const L0 = E.list.map(e => skinMesh(e, 0));
      for (const m of L0) out.push(m);
      const caster = skinMesh(E.lods.caster, 0);
      caster.castShadow = true; caster.receiveShadow = false; caster.userData.lodCaster = true;
      // chỉ dùng cho lượt bóng: lượt hình gọi onBeforeRender còn lượt bóng thì không, nên tắt tạm dải vẽ để GPU khỏi xử lý thêm cả lưới
      caster.onBeforeRender = (r, sc, cam, g) => { g.drawRange.count = 0; };
      caster.onAfterRender = (r, sc, cam, g) => { g.drawRange.count = Infinity; };
      for (const m of keep) if (m.isMesh) out.push(m);
      F.meshes.length = 0;
      for (const m of out) F.meshes.push(m);
      // thẻ tên, khoen... chỉ hiện ở bậc gần (ở xa không thấy mà vẫn tốn lượt vẽ)
      for (const m of keep) if (m.isMesh && m.userData.nearOnly) L0.push(m);
      return { cur: 0, levels: [L0, E.lods.lod1.map(e => skinMesh(e, 1)), E.lods.lod2.map(e => skinMesh(e, 2))], caster };
    };
    const cached = F.cacheKey && BAKE_CACHE.get(F.cacheKey);
    if (cached && cached.bones === bones.length) {
      const old = [];
      root.traverse(c => { if (c.isMesh && !keep.has(c)) { if (c.visible) old.push(c); else out.push(c); } });
      for (const m of old) m.parent.remove(m);
      return finish(cached);
    }
    const fresh = [];
    root.traverse(c => {
      if (!c.isMesh || keep.has(c)) return;
      if (!c.visible) { out.push(c); return; }
      const k = skinBucketKey(c.material);
      if (!buckets.has(k)) buckets.set(k, { list: [], mats: new Set() });
      const B = buckets.get(k); B.list.push(c); B.mats.add(c.material);
    });
    const v = new THREE.Vector3(), nm = new THREE.Matrix3();
    for (const [k, B] of buckets) {
      const solid = typeof k === 'string', withCol = solid || !!k.vertexColors;
      let nv = 0, ni = 0;
      for (const m of B.list) { const g = m.geometry; nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
      const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), col = withCol ? new Float32Array(nv * 3) : null;
      const si = new Uint16Array(nv * 4), sw = new Float32Array(nv * 4), idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
      let ov = 0, oi = 0;
      for (const m of B.list) {
        const g = m.geometry, P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv, C = g.attributes.color, n = P.count;
        const M4 = rel(m), bi = boneIdx.get(m.parent) || 0, c0 = m.material.color, BL = g.userData.blend;
        const bl = BL ? BL.bones.map(b => boneIdx.get(b) || 0) : null;
        nm.getNormalMatrix(M4);
        for (let i = 0; i < n; i++) {
          const o3 = (ov + i) * 3;
          v.fromBufferAttribute(P, i).applyMatrix4(M4); pos[o3] = v.x; pos[o3 + 1] = v.y; pos[o3 + 2] = v.z;
          if (N) { v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); nor[o3] = v.x; nor[o3 + 1] = v.y; nor[o3 + 2] = v.z; }
          if (U) { uv[(ov + i) * 2] = U.getX(i); uv[(ov + i) * 2 + 1] = U.getY(i); }
          if (col) {
            if (solid) { col[o3] = c0.r; col[o3 + 1] = c0.g; col[o3 + 2] = c0.b; }
            else if (C) { col[o3] = C.getX(i); col[o3 + 1] = C.getY(i); col[o3 + 2] = C.getZ(i); }
            else { col[o3] = col[o3 + 1] = col[o3 + 2] = 1; }
          }
          if (bl) { const o4 = (ov + i) * 4; si[o4] = bl[BL.a[i]]; si[o4 + 1] = bl[BL.b[i]]; sw[o4] = 1 - BL.w[i]; sw[o4 + 1] = BL.w[i]; }
          else { si[(ov + i) * 4] = bi; sw[(ov + i) * 4] = 1; }
        }
        const flip = M4.determinant() < 0, cnt = g.index ? g.index.count : n;
        for (let i = 0; i < cnt; i += 3) {
          const a = g.index ? g.index.getX(i) : i, b = g.index ? g.index.getX(i + 1) : i + 1, c = g.index ? g.index.getX(i + 2) : i + 2;
          idx[oi + i] = ov + a; idx[oi + i + 1] = ov + (flip ? c : b); idx[oi + i + 2] = ov + (flip ? b : c);
        }
        ov += n; oi += cnt;
        m.parent.remove(m);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      if (col) geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
      geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
      geo.setIndex(new THREE.BufferAttribute(idx, 1));
      geo.computeBoundingSphere();
      geo.boundingSphere.radius += 4;            // tay / chân vung ra khỏi tư thế gốc: nới hình cầu cắt khung nhìn
      const mat = solid ? skinBucketMat(k, [...B.mats]) : k;
      mat.skinning = true;   // three r128: vật liệu phải bật cờ skinning (bộ vật liệu bộ binh tách khỏi kíp lái nên không ảnh hưởng xe)
      geo.userData.shared = true;
      fresh.push({ geo, mat, renderOrder: B.list[0].renderOrder, userData: Object.assign({}, B.list[0].userData, { merged: B.list.length }) });
    }
    const lods0 = buildLods(fresh);
    for (const e of fresh) { const g2 = clusterGeo(e.geo, LOD_CELL[0], true); lodBounds(g2); e.geo = g2; }
    const E = { list: fresh, lods: lods0, bones: bones.length };
    if (F.cacheKey) BAKE_CACHE.set(F.cacheKey, E);
    return finish(E);
  }

  // ---------- QUẦN LIỀN MẢNH (bộ binh, lưới skinned) ----------
  // Một mặt vải liên tục: nửa khung chậu (có mông) -> qua bẹn / nếp lằn mông chuyển dần thành ống đùi -> gối -> ống chân
  // (bắp chân) -> mép trong cổ giày. Mỗi đỉnh bám 2 xương pha trộn ở vùng khớp: hông<->đùi (mông theo khung chậu lâu hơn
  // bẹn), đùi<->cẳng quanh gối — gập chân thì vải co giãn mượt, không còn mép nối / nắp ống / túi xệ như 3 khối rời cũ.
  const lerpTab = (tab, t) => {   // tab: [[giá trị, t]...] t tăng dần
    if (t <= tab[0][1]) return tab[0][0];
    for (let i = 1; i < tab.length; i++) if (t <= tab[i][1]) { const a = tab[i - 1], b = tab[i], f = (t - a[1]) / (b[1] - a[1]); return a[0] + (b[0] - a[0]) * f; }
    return tab[tab.length - 1][0];
  };
  // số đo quần liền mảnh theo người thật (khác bản 3 khối cũ: hông thu hẹp để chui vào đùi, đùi phình để che hông -> bậc ở bẹn):
  // hông giữ rộng tới gần đáy quần, đỉnh đùi rộng bằng hông rồi thon dần tới gối
  const HIP_PROF = [[1.35, -0.85], [1.39, -1.0], [1.43, -1.25], [1.46, -1.55], [1.465, -1.75], [1.45, -2.0], [1.42, -2.3]];
  // đùi to rõ hơn bắp chân (0,7 -> 0,58 cũ: gối trở xuống bằng đùi, ống quần thẳng đuột)
  const THIGH_PROF = [[0.78, 0.08], [0.765, 0.2], [0.72, 0.42], [0.67, 0.65], [0.62, 0.85], [0.595, 0.96], [0.585, 1.0]];
  // mép ngoài đùi: đỉnh liền với hông quần (0,63 cũ hẹp hơn hông ~1,3 cm -> eo lõm ngay dưới hông rồi túi hộp phồng ra), thon dần về gối
  const THIGH_X = [[0.76, 0.08], [0.75, 0.2], [0.705, 0.42], [0.66, 0.65], [0.615, 0.85], [0.59, 0.96], [0.58, 1.0]];
  const SHIN_PROF = [[0.547, -0.02], [0.55, 0.04], [0.555, 0.2], [0.54, 0.34], [0.52, 0.5], [0.5, 0.6], [0.49, 0.685], [0.475, 0.71]];
  function pantsGeo(root, hips, L) {
    const sx = L.sx, Gs = (v, s) => Math.exp(-(v / s) * (v / s)), key = 'pants' + sx;
    // tư thế gốc của mọi lính như nhau nên dùng chung hình; chỉ xương là riêng từng người (bakeSkinned đọc ngay sau khi dựng)
    if (GEO[key]) { for (const k of ['', 'C', 'S']) GEO[key + k].userData.blend.bones = [hips, L.leg, L.knee]; return GEO[key]; }
    root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const toRoot = (o, x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(o.matrixWorld).applyMatrix4(inv);
    const kneeW = toRoot(L.knee, 0, 0, 0), hipW = toRoot(L.leg, 0, 0, 0);
    const yTop = -0.42, yBot = kneeW.y - SHIN_L + 0.95, SEG = 48, CROTCH_Y = -2.55;   // đáy quần ~79 cm (-2,82 cũ ~75 cm: hông dài, chân ngắn, đũng thõng)
    const rows = Math.ceil((yTop - yBot) / 0.075);
    const pos = [], uv = [], A = [], Bn = [], Wt = [];
    // MẶT CẮT DUY NHẤT từ cạp quần tới gối: mỗi độ cao chỉ có 1 hình (nửa trái / phải quanh tâm cx), các số đo là đường cong mượt theo y.
    // Hông và đùi không còn là 2 hình khác nhau đem trộn: trộn 2 hình lệch nhau làm hông phồng như tã, lõm dưới mông, nếp vặn ở háng.
    // Trên đáy quần tâm cx = 0: cả nửa người là một mặt liền, mép giữa khít nửa kia. Dưới đáy cx dời dần ra tâm đùi, khe hai chân mở từ đáy xuống.
    const tab = (T, t) => (lerpTab(T, t - 0.04) + lerpTab(T, t) + lerpTab(T, t + 0.04)) / 3;
    const HX = HIP_PROF.map(q => [q[0], -q[1]]);
    const FRONT = [[-0.87, 0.72], [-0.875, 1.2], [-0.87, 1.7], [-0.85, 2.1], [-0.82, 2.5]], BACK = [[0.86, 0.72], [0.87, 1.2], [0.91, 1.7], [0.93, 2.1], [0.92, 2.5]];
    const section = (y, ph) => {
      const c = Math.cos(ph), sd = Math.sin(ph) * sx, t = (hipW.y - y) / THIGH_L;
      const C = toRoot(L.leg, 0, y - hipW.y, 0), r = tab(THIGH_PROF, t), kz = 1.12 - 0.12 * sm((t - 0.45) / 0.55), z0 = Math.sin(Math.PI * Math.min(1, Math.max(0, t) * 1.1));
      const w = sm((-1.82 - y) / 0.7), split = sm((-2.47 - y) / 0.6), e = 0.72 + 0.13 * w + 0.15 * sm((t - 0.75) / 0.25), pe = v => Math.pow(Math.abs(v), e);
      const rx = tab(THIGH_X, t), hipX = tab(HX, -y), xo = hipX + (C.x * sx + rx - hipX) * w, cx = split * C.x * sx, xi = split * (0.012 + Math.max(0, C.x * sx - r * 0.88) * sm((-2.68 - y) / 0.7)), ro = xo - cx, ri = cx - xi;
      const fr = tab(FRONT, -y), bk = tab(BACK, -y), cz = 0.03 + (C.z - 0.03) * w;
      const zf = fr + (C.z - r * kz - 0.05 * z0 - fr) * w, zb = bk + (C.z + r * kz + 0.02 * z0 - bk) * w;
      const x = sd >= 0 ? cx + ro * pe(sd) : cx - ri * pe(sd);
      const eIn = 0.26 + (e - 0.26) * sm((-3.1 - y) / 1.0);
      let z = c < 0 ? cz + (zf - cz) * (sd < 0 ? Math.pow(Math.abs(c), eIn) : pe(c)) : cz + (zb - cz) * pe(c);
      // mông: 2 múi chuông mượt (hàm căn cũ có đầu mút dốc đứng thành gờ cứng), nhô ~4 cm so với mặt sau đùi; đỉnh ngang y -1,8, phía trên thoải dần vào thắt lưng,
      // phía dưới cong gọn vào nếp lằn; khe giữa tách 2 múi, tắt dần ra hông
      // đỉnh mông ~88 cm, phía dưới thoải dần liền vào mặt sau đùi (nếp lằn sâu thắt đột ngột -> trông xệ, gãy khúc)
      if (c > 0) z += sm(c / 0.55) * (0.3 * Gs(y + 1.9, y > -1.9 ? 1.25 : 0.72) * Gs(x - 0.62, 0.78) - 0.05 * Gs(x, 0.14) * Gs(y + 1.9, 0.6) - 0.01 * Gs(y + 2.48, 0.15) * Gs(x - 0.6, 0.6));
      // phía trước đáy quần hơi đầy (~1 cm), vải phủ mềm: mặt phẳng tuyệt đối trông như ma-nơ-canh
      if (c < 0) z -= 0.055 * Gs(x, 0.45) * Gs(y + 2.05, 0.38) * sm(-c / 0.4);   // 0,13 cũ: khối phồng, mặt dưới quay xuống thành mảng tối
      // CẤU TRÚC XƯƠNG CHẬU dưới vải: gai chậu trước nhô nhẹ ở góc bụng dưới, nếp bẹn chéo từ gai chậu xuống đáy quần, lõm hông ngay sau mấu chuyển
      if (c < 0) z -= 0.085 * Gs(x - 0.42, 0.34) * Gs(y + 2.5, y > -2.5 ? 0.42 : 0.5) * sm(-c / 0.35);
      const k = 1 - w;
      if (c < 0) {
        z -= 0.05 * k * Gs(x - 1.02, 0.2) * Gs(y + 1.05, 0.2) * sm(-c / 0.25);
        z += 0.01 * Gs(y - (-2.5 + 0.72 * x), 0.2) * sm((x - 0.4) / 0.25) * sm((1.2 - x) / 0.25) * sm(-c / 0.3);
      }
      const sideDent = 0.02 * k * Gs(y + 1.35, 0.3) * Math.exp(-Math.pow((c - 0.45) / 0.3, 2)) * Math.max(0, sd);
      const tU = c01((-2.2 - y) / 0.38), under = 0.6 * (1 - Math.sqrt(1 - tU * tU)) * Gs(x, 0.26);   // cung đáy quần chỉ uốn ở ~4 cm cuối (bắt đầu từ -1,98 thì mặt trước quay xuống từ sớm, thành mảng tối)
      z = cz + (z - cz) * (1 - under);
      const tuck = 1 - 0.12 * sm((y + 0.75) / 0.33);
      return new THREE.Vector3((x - sideDent) * sx * tuck, y, cz + (z - cz) * tuck);
    };
    const shinPt = (y, ph) => {
      const c = Math.cos(ph), s = Math.sin(ph);
      const t = (kneeW.y - y) / SHIN_L, r = lerpTab(SHIN_PROF.map(q => [q[0], q[1]]), t) * 1.06;
      const C = toRoot(L.knee, 0, y - kneeW.y, 0);
      const calf = c > 0 ? 0.07 * c * Gs(t - 0.26, 0.2) : 0.03 * c * Gs(t - 0.1, 0.1), hem = sm((t - 0.58) / 0.1);   // gấu quần lệch theo cổ giày, sâu hơn bề ngang
      return new THREE.Vector3(C.x + r * s, y, C.z + r * c + calf + hem * (0.04 + 0.03 * c));
    };
    const surf = (y, ph) => {
      const c = Math.cos(ph);
        const P = y > kneeW.y + 0.02 ? section(y, ph) : shinPt(y, ph);
        // NẾP VẢI (vải quần chiến đấu dày, rộng): không còn ống nhựa trơn
        const fr = Math.max(0, -c), bk = Math.max(0, c), ax = Math.abs(P.x);
        let wr = 0;
        // nếp vải chéo toả từ đáy quần lên phía hông (vải kéo khi đứng / bước), đậm gần đáy, nhạt dần
        wr += 0.014 * Math.sin(9 * (y + 2.55 - 0.85 * ax) + 0.6) * Gs(y + 2.35, 0.32) * fr * sm((ax - 0.12) / 0.2) * sm((1.0 - ax) / 0.3);                  // nếp chéo ở bẹn (vải kéo từ đáy quần)
                                      // vải dồn trên gối
        wr -= 0.025 * Gs(y - kneeW.y - 0.04, 0.15) * bk * (0.55 + 0.45 * Math.sin(ph * 6 + y * 3));    // ngấn sau khoeo
        wr += 0.012 * Math.sin(ph * 3 + y * 0.6 + sx) * Gs(y + 3.3, 0.9) * sm(ax / 0.3);                               // nếp dọc lùng thùng ở đùi
        wr += 0.012 * Math.sin(y * 16 + ph * 2) * Gs(y - yBot - 0.3, 0.3);                              // vải túm chồng trên cổ giày
        // nếp bẹn: đường lằn chéo từ đáy quần lên phía hông (mặt trước khung chậu không phẳng như tấm ván)
        if (c < 0) wr -= 0.012 * Gs(y - (-2.15 + 0.45 * ax), 0.2) * fr * sm((1.2 - ax) / 0.3) * sm((ax - 0.2) / 0.25);
        P.x += Math.sin(ph) * wr; P.z += c * wr;
      return P;
    };
    const skinW = (y, c, ax, A, Bn, Wt) => {
        // trọng số: mặt sau (mông) theo khung chậu tới thấp hơn, mặt trước (bẹn) chuyển sang đùi sớm
        // (phần dưới mông theo đùi nhiều hơn: gập hông thì nếp lằn mông giãn, không thòng thành túi dưới đùi khi quỳ)
        const back = (c + 1) / 2, s0 = -1.32 + (-1.6 + 1.32) * back;
        const mid = sm(ax / 0.6), below = sm((CROTCH_Y - y) / 0.3), wLeg = sm((s0 - y) / (0.45 + 0.4 * back)) * (mid + (1 - mid) * below), wKnee = sm((kneeW.y + 0.32 - y) / 0.62);
        if (wKnee > 0) { A.push(1); Bn.push(2); Wt.push(wKnee); }
        else { A.push(0); Bn.push(1); Wt.push(wLeg); }
    };
    for (let i = 0; i <= rows; i++) {
      const y = yTop - (yTop - yBot) * i / rows;
      // 1. Tính toán trước toạ độ 3D của toàn bộ vòng cắt
      const ringPts = [];
      for (let j = 0; j <= SEG; j++) {
        const ph = (j / SEG) * Math.PI * 2;
        ringPts.push(surf(y, ph));
      }
      // 2. Tính chiều dài cung thực tế giữa các điểm kế tiếp (Arc-length Parameterization)
      const arcLengths = [0];
      let totalLen = 0;
      for (let j = 1; j <= SEG; j++) {
        const d = ringPts[j].distanceTo(ringPts[j - 1]);
        totalLen += d;
        arcLengths.push(totalLen);
      }
      // Tỷ lệ chuẩn hoá UV theo chu vi vải thực tế -> hoa văn đều tăm tắp, không bị co kéo ở đũng quần
      const uFactor = (1.0 / 2.2) / Math.max(1e-4, totalLen);
      for (let j = 0; j <= SEG; j++) {
        const P = ringPts[j];
        pos.push(P.x, P.y, P.z);
        uv.push(arcLengths[j] * uFactor, y * 0.14);
        skinW(y, Math.cos((j / SEG) * Math.PI * 2), Math.abs(P.x), A, Bn, Wt);
      }
    }
    const idx = [], C1 = SEG + 1;
    for (let i = 0; i < rows; i++) for (let j = 0; j < SEG; j++) {
      const a = i * C1 + j, b = a + C1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    // kiểm chiều mặt: pháp tuyến phải hướng ra ngoài trục ống (tại giữa đùi, mặt sau)
    const k = Math.round(rows * 0.45) * C1, N = g.attributes.normal, P0 = g.attributes.position;
    const Cm = toRoot(L.leg, 0, P0.getY(k) - hipW.y, 0);
    if ((P0.getX(k) - Cm.x) * N.getX(k) + (P0.getZ(k) - Cm.z) * N.getZ(k) < 0) {
      for (let t = 0; t < idx.length; t += 3) { const q = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = q; }
      g.setIndex(idx); g.computeVertexNormals();
    }
    weldNormals(g);
    for (let i = 0; i <= rows; i++) for (const j of [0, SEG / 2, SEG]) {
      const o = i * C1 + j, y = P0.getY(o);
      if (y < CROTCH_Y + 0.05) continue;
      const ny = N.getY(o), nz = N.getZ(o), l = Math.hypot(ny, nz) || 1, cz = j === SEG / 2 ? -1 : 1;
      N.setXYZ(o, 0, ny / l, Math.abs(nz / l) * cz);
    }
    g.userData.blend = { bones: [hips, L.leg, L.knee], a: new Uint8Array(A), b: new Uint8Array(Bn), w: new Float32Array(Wt) };

    // CHI TIẾT MAY 3D bám mặt vải (không vẽ 2D): cạp, đỉa, nẹp khoá, túi sau, đường may. a = góc từ giữa bụng ra ngoài: 0 trước, PI/2 hông, PI sau
    const PA = a => Math.PI - sx * a;
    const nrm = (y, ph) => {
      const e = 0.02, P = surf(y, ph), n = surf(y, ph + e).sub(surf(y, ph - e)).cross(surf(y + e, ph).sub(surf(y - e, ph))).normalize();
      const ref = y > -2.5 ? new THREE.Vector3(sx * 0.3, y, 0.03) : toRoot(L.leg, 0, y - hipW.y, 0);
      if (n.dot(P.clone().sub(ref)) < 0) n.negate();
      return n;
    };
    const part = () => ({ pos: [], uv: [], idx: [], A: [], B: [], W: [], n: 0 });
    const vert = (T, y, ph, Q, shift) => {
      T.pos.push(Q.x, Q.y, Q.z); T.uv.push(ph / (Math.PI * 2) / 2.2 + shift, y * 0.14 + shift * 0.6);
      skinW(y, Math.cos(ph), Math.abs(Q.x), T.A, T.B, T.W); T.n++;
    };
    // nối lưới cols x rows đỉnh, tự chọn chiều tam giác theo pháp tuyến ra ngoài
    const stitch = (T, base, cols, rows2, nOut) => {
      const at = (i, j) => base + i + j * cols, p = k => new THREE.Vector3(T.pos[k * 3], T.pos[k * 3 + 1], T.pos[k * 3 + 2]);
      const ci = cols >> 1, cj = rows2 >> 1, a = p(at(ci - 1, cj - 1)), f = p(at(ci, cj - 1)).sub(a).cross(p(at(ci - 1, cj)).sub(a)).dot(nOut) < 0;
      for (let j = 0; j < rows2 - 1; j++) for (let i = 0; i < cols - 1; i++) {
        const q = at(i, j), r = at(i + 1, j), u = at(i, j + 1), v = at(i + 1, j + 1);
        if (f) T.idx.push(q, u, r, r, u, v); else T.idx.push(q, r, u, r, v, u);
      }
    };
    // mảng vải nổi: mép chìm xuống mặt quần (lộ độ dày), giữa nổi lift; open0 / open1: mép a0 / a1 không chìm (giáp đường giữa)
    const patch = (T, a0, a1, y0, y1, lift, shift, NA = 12, NY = 8, open0 = false, open1 = false) => {
      const base = T.n;
      for (let j = 0; j <= NY; j++) for (let i = 0; i <= NA; i++) {
        const a = a0 + (a1 - a0) * i / NA, y = y0 + (y1 - y0) * j / NY, ph = PA(a), P = surf(y, ph), n = nrm(y, ph);
        const da = Math.min(open0 ? 9 : i / NA, open1 ? 9 : 1 - i / NA) * Math.abs(a1 - a0) * 1.25, dv = Math.min(j, NY - j) / NY * Math.abs(y1 - y0);
        vert(T, y, ph, P.addScaledVector(n, -0.012 + (lift + 0.012) * sm(Math.min(da, dv) / 0.03)), shift);
      }
      stitch(T, base, NA + 1, NY + 1, nrm((y0 + y1) / 2, PA((a0 + a1) / 2)));
    };
    // đường may: gờ tam giác mảnh chạy theo đường (y, a)
    const seam = (T, fn, N, lift, w = 0.016) => {
      const base = T.n;
      for (let i = 0; i <= N; i++) {
        const [y, a] = fn(i / N), [y2, a2] = fn(Math.min(1, (i + 0.5) / N)), [y3, a3] = fn(Math.max(0, (i - 0.5) / N));
        const ph = PA(a), P = surf(y, ph), n = nrm(y, ph), side = surf(y2, PA(a2)).sub(surf(y3, PA(a3))).cross(n).normalize();
        vert(T, y, ph, P.clone().addScaledVector(n, lift - 0.012).addScaledVector(side, w / 2), 0);
        vert(T, y, ph, P.clone().addScaledVector(n, lift + 0.006), 0);
        vert(T, y, ph, P.clone().addScaledVector(n, lift - 0.012).addScaledVector(side, -w / 2), 0);
      }
      stitch(T, base, 3, N + 1, nrm(fn(0.5)[0], PA(fn(0.5)[1])));
    };
    const line = (y0, a0, y1, a1) => t => [y0 + (y1 - y0) * t, a0 + (a1 - a0) * t];
    const C = part(), S = part(), WT = -0.585, WB = -0.8;
    // túi đắp: thân phồng giữa (có đồ bên trong), mép khâu sát mặt quần; nắp đè lên, góc dưới vát, mép dưới nổi hẳn khỏi thân túi
    // giáp gối: dải vải gân xếp nếp trên gối (đáy chữ V), lớp vải đúp dài từ gối xuống giữa ống đồng có đệm bên trong
    const kneeArmor = (kn) => {
      const AH = 1.05, yV = u => kn + 0.3 + 0.2 * Math.abs(u);
      let base = C.n, NA = 18, NY = 44;
      for (let j = 0; j <= NY; j++) for (let i = 0; i <= NA; i++) {
        const u = i / NA * 2 - 1, v = j / NY, yB = yV(u), yT = kn + 0.98 - 0.06 * u * u, y = yB + (yT - yB) * v, ph = PA(u * AH), P = surf(y, ph), n = nrm(y, ph);
        const ed = sm(Math.min((1 - Math.abs(u)) * AH * 0.7, Math.min(v, 1 - v) * (yT - yB)) / 0.02), rib = 0.02 * (0.5 + 0.5 * Math.cos(v * Math.PI * 2 * 9));
        vert(C, y, ph, P.addScaledVector(n, -0.012 + (0.016 + 0.012 + rib) * ed), 0.12);
      }
      stitch(C, base, NA + 1, NY + 1, nrm(kn + 0.65, PA(0)));
      base = C.n; NA = 18; NY = 20;
      for (let j = 0; j <= NY; j++) for (let i = 0; i <= NA; i++) {
        const u = i / NA * 2 - 1, v = j / NY, yT = yV(u) - 0.02, yB = kn - 1.32 + 0.1 * u * u, y = yT + (yB - yT) * v, ph = PA(u * AH), P = surf(y, ph), n = nrm(y, ph);
        const ed = sm(Math.min((1 - Math.abs(u)) * AH * 0.7, Math.min(v, 1 - v) * (yT - yB)) / 0.02);
        const pad = 0.08 * Gs(y - kn + 0.12, 0.42) * Gs(u, 0.6);
        vert(C, y, ph, P.addScaledVector(n, -0.012 + (0.024 + 0.012 + pad) * ed), 0.2);
      }
      stitch(C, base, NA + 1, NY + 1, nrm(kn - 0.4, PA(0)));
      const a1 = AH - 0.04;                                                        // chỉ may: đường V trên, ngang đệm, hai mép
      seam(S, t => { const u = t * 2 - 1; return [yV(u) - 0.05, u * a1]; }, 16, 0.028, 0.012);
      seam(S, t => [kn - 0.62, (t * 2 - 1) * a1 * 0.9], 12, 0.03, 0.01);
      for (const sg of [-1, 1]) seam(S, t => [kn + 0.2 - 1.42 * t, sg * a1 * 0.98], 12, 0.028, 0.012);
    };
    const pocket = (a0, a1, yT, yB, lift, puff, flapH, flapLift, btn, tilt = 0, pleat = false) => {
      const am0 = (a0 + a1) / 2, ah = (a1 - a0) / 2, ym = (yT + yB) / 2, yh = (yT - yB) / 2, NA = 14, NY = 12, am = y => am0 + tilt * (y - ym);
      let base = C.n;
      for (let j = 0; j <= NY; j++) for (let i = 0; i <= NA; i++) {
        const u = i / NA * 2 - 1, v = j / NY * 2 - 1, y = ym - v * yh, ph = PA(am(y) + u * ah), P = surf(y, ph), n = nrm(y, ph);
        const ed = sm(Math.min((1 - Math.abs(u)) * ah * 1.2, (1 - Math.abs(v)) * yh) / 0.022), dome = (1 - u * u) * (1 - v * v);
        vert(C, y, ph, P.addScaledVector(n, -0.012 + (lift + 0.012 + puff * dome) * ed), 0);
      }
      stitch(C, base, NA + 1, NY + 1, nrm(ym, PA(am0)));
      const st = lift + 0.006, ai = ah - 0.03, yi = yB + 0.03;                       // chỉ may 3 cạnh thân túi
      seam(S, t => { const y = yT - (yT - yi) * t; return [y, am(y) - ai]; }, 10, st, 0.012);
      seam(S, t => { const y = yT - (yT - yi) * t; return [y, am(y) + ai]; }, 10, st, 0.012);
      seam(S, t => [yi, am(yi) - ai + 2 * ai * t], 10, st, 0.012);
      if (pleat) for (const u of [-0.72, 0.72]) seam(S, t => { const y = yT - (yT - yi) * t; return [y, am(y) + u * ah]; }, 10, lift + puff * 0.5, 0.012);   // nếp xếp ly hai bên: túi nở được
      if (!flapH) return;
      // nắp túi
      const fT = yT + 0.07, fB = yT - flapH, NF = 8, fa = ah * 1.05, hw = v => fa * (1 - 0.2 * sm((v - 0.68) / 0.32));
      base = C.n;
      for (let j = 0; j <= NF + 1; j++) for (let i = 0; i <= NA; i++) {
        const v = Math.min(1, j / NF), u = i / NA * 2 - 1, y = fT + (fB - fT) * v, ph = PA(am(y) + u * hw(v)), P = surf(y, ph), n = nrm(y, ph);
        const top = v * (fT - fB), side = (1 - Math.abs(u)) * hw(v) * 1.2, ed = sm(Math.min(top, side) / 0.02);
        const l = j > NF ? -0.012 : -0.012 + (flapLift + 0.012 + puff * 0.5 * (1 - u * u)) * ed;
        vert(C, y, ph, P.addScaledVector(n, l), 0.03);
      }
      stitch(C, base, NA + 1, NF + 2, nrm((fT + fB) / 2, PA(am0)));
      const fi = fB + 0.035, fs_ = flapLift + puff * 0.45 + 0.004;                   // chỉ may mép dưới nắp
      seam(S, t => [fi, am(fi) - hw(0.9) * 0.93 + 2 * hw(0.9) * 0.93 * t], 12, fs_, 0.012);
      if (btn) patch(S, am(fB) - 0.05, am(fB) + 0.05, fB + 0.11, fB + 0.03, flapLift + puff * 0.5 + 0.012, 0, 4, 3); // khuy nắp
    };
    patch(C, 0, Math.PI, WT, WB, 0.018, 0.09, 30, 4, true, true);                     // cạp quần
    for (const a of [0.42, 1.5, 2.5]) patch(C, a - 0.075, a + 0.075, -0.5, -0.92, 0.05, 0.31, 4, 8);   // đỉa luồn dây lưng
                        // nẹp khoá quần (một bên, như quần thật)
    pocket(2.14, 2.84, -1.36, -2.2, 0.018, 0.035, 0.27, 0.042, true);                 // túi sau
    pocket(0.74, 1.72, -3.08, -3.86, 0.028, 0.1, 0.3, 0.065, true, -0.04, true);       // túi hộp đùi, lệch ra trước, xếp ly
    const kn = kneeW.y;
    pocket(1.02, 1.95, kn - 1.28, kn - 1.95, 0.02, 0.05, 0.2, 0.04, false);            // túi cẳng chân
    kneeArmor(kn);              // giáp gối may liền: lớp vải đúp, đệm luồn bên trong
    seam(S, line(-3.1, 1.86, -3.72, 1.86), 10, 0.012, 0.04);                          // túi khoá kéo dọc hông đùi
    seam(S, line(-3.08, 1.8, -3.74, 1.8), 10, 0.012, 0.01);
    seam(S, line(-3.08, 1.92, -3.74, 1.92), 10, 0.012, 0.01);    // đường chiết trên gối
    for (const dy of [0.16, -0.02]) seam(S, t => [kn + dy, Math.PI - 0.7 + 1.4 * t], 12, 0.02);   // đường chiết sau khoeo
    patch(C, -Math.PI, Math.PI, yBot + 0.24, yBot + 0.03, 0.02, 0.06, 40, 2, true, true);   // cổ chân bó
    patch(S, 1.5, 1.72, yBot + 0.17, yBot + 0.06, 0.04, 0, 4, 2);                      // quai dán cổ chân
    seam(S, t => [WB + (0 - 0) - 0.008, t * Math.PI], 30, 0.02);                      // đường may chân cạp
    // nẹp khoá thật: dải vải nổi một bên ~3 cm, chỉ chữ J dài ~17 cm uốn về đường giữa (cũ: 2 đường thẳng sát nhau 0,5 cm chạy suốt tới đáy)
    if (sx > 0) {
      patch(C, 0, 0.19, -0.86, -2.1, 0.01, 0.02, 6, 12, true, false);
      seam(S, t => [-0.86 - 1.36 * t, t < 0.7 ? 0.2 : 0.2 * Math.cos((t - 0.7) / 0.3 * Math.PI / 2)], 24, 0.02, 0.011);
    }
    seam(S, line(-0.82, 0.004, -2.6, 0.004), 22, 0.008, 0.012);   // đường giữa trước tới đáy quần
                           // chữ Y: mép miếng đáy quần
                            // đường chỉ đôi                      // đường giữa bụng tới đáy quần
    seam(S, line(-1.06, 0.5, -1.82, 1.16), 12, 0.008, 0.05);                            // khoá thông hơi chéo ở hông
    seam(S, line(-1.03, 0.46, -1.8, 1.12), 12, 0.014, 0.012);
    seam(S, line(-1.09, 0.56, -1.84, 1.2), 12, 0.014, 0.012);
    patch(S, 1.1, 1.17, -1.8, -1.9, 0.03, 0, 3, 3);                                   // con trượt khoá                               // miệng túi chéo trước
    seam(S, line(-0.82, Math.PI / 2, -3.0, Math.PI / 2), 22, 0.018);                  // đường may hông (khuất dưới túi hộp)
    seam(S, line(-3.92, Math.PI / 2, kneeW.y - 1.2, Math.PI / 2), 24, 0.018);
    seam(S, line(kneeW.y - 2.0, Math.PI / 2, yBot + 0.22, Math.PI / 2), 6, 0.018);
    seam(S, line(-2.98, -Math.PI / 2, yBot + 0.22, -Math.PI / 2), 28, 0.016);         // đường may trong đùi
    seam(S, line(-1.24, Math.PI, -0.98, 1.95), 12, 0.012);                            // đường cầu mông
    seam(S, line(-0.82, Math.PI - 0.004, -2.6, Math.PI - 0.004), 22, 0.01, 0.014);
        // đường giữa mông
    const mkG = (T) => {
      const G = new THREE.BufferGeometry();
      G.setAttribute('position', new THREE.Float32BufferAttribute(T.pos, 3));
      G.setAttribute('uv', new THREE.Float32BufferAttribute(T.uv, 2));
      G.setIndex(T.idx);
      G.computeVertexNormals();
      G.userData.blend = { bones: [hips, L.leg, L.knee], a: new Uint8Array(T.A), b: new Uint8Array(T.B), w: new Float32Array(T.W) };
      return G;
    };
    GEO[key + 'C'] = mkG(C); GEO[key + 'S'] = mkG(S);
    return (GEO[key] = g);
  }

  // ---------- BÀN TAY ĐEO GĂNG CHIẾN THUẬT ----------
  // Hệ tay: gốc tại cổ tay, +y cổ tay -> đốt ngón, +x mu bàn tay, -x lòng bàn tay, +z*s phía ngón cái. Cán súng nằm dọc trục z qua HAND_GC.
  const HAND_GC = [-0.3, 0.48];
  function handFix(g, ref) {   // pháp tuyến + chiều tam giác ra ngoài
    g.computeVertexNormals();
    const P = g.attributes.position, N = g.attributes.normal, k = Math.floor(P.count / 2), r = ref(k);
    if ((P.getX(k) - r.x) * N.getX(k) + (P.getY(k) - r.y) * N.getY(k) + (P.getZ(k) - r.z) * N.getZ(k) < 0) {
      const I = g.index.array; for (let t = 0; t < I.length; t += 3) { const q = I[t + 1]; I[t + 1] = I[t + 2]; I[t + 2] = q; }
      g.computeVertexNormals();
    }
    return weldNormals(g);
  }
  // ngón: một ống liền theo đường cong qua các khớp, mặt cắt dẹt, phình nhẹ ở khớp, đầu ngón bo tròn
  function fingerGeo(key, pts, rw, rt, joints) {
    if (GEO[key]) return GEO[key];
    const c = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.32), ROW = 24, SD = 8, pos = [], uv = [], idx = [], cen = [], Z = V(0, 0, 1);
    for (let i = 0; i <= ROW; i++) {
      const t = i / ROW, C = c.getPoint(t), T = c.getTangent(t), Nn = V().crossVectors(T, Z).normalize(), B = V().crossVectors(Nn, T).normalize();
      const e = t > 0.88 ? Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.88) / 0.12, 2))) : 1;
      let bulge = 1 - 0.05 * sm(t / 0.2);
      for (const q of joints) bulge += 0.1 * Math.exp(-Math.pow((t - q) / 0.05, 2));
      const w = rw * bulge * e, h = rt * bulge * e;
      for (let j = 0; j <= SD; j++) {
        const a = j / SD * Math.PI * 2, ca = Math.cos(a) * w, sa = Math.sin(a) * h;
        pos.push(C.x + B.x * ca + Nn.x * sa, C.y + B.y * ca + Nn.y * sa, C.z + B.z * ca + Nn.z * sa);
        uv.push(j / SD * 0.12, t * 0.25); cen.push(C);
      }
    }
    for (let i = 0; i < ROW; i++) for (let j = 0; j < SD; j++) { const a = i * (SD + 1) + j, b = a + SD + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    return (GEO[key] = handFix(g, k => cen[k]));
  }
  // lòng + mu bàn tay liền khối: mặt cắt hộp bo tròn, rộng dần từ cổ tay tới đốt ngón, vòm đốt ngón (ngón giữa cao nhất), mô cái phía ngón cái, mô út phía đối diện
  function palmGeo(s) {
    const key = 'handPalm' + s;
    if (GEO[key]) return GEO[key];
    const ROW = 18, SD = 20, Y0 = -0.14, Y1 = 0.6, pos = [], uv = [], idx = [], Gs = (v, k) => Math.exp(-(v / k) * (v / k)), pe = 2 / 2.7;
    for (let i = 0; i <= ROW; i++) {
      const y = Y0 + (Y1 - Y0) * i / ROW, t = c01(y / 0.46), top = y > 0.46 ? Math.sqrt(Math.max(0, 1 - Math.pow((y - 0.46) / (Y1 - 0.46), 2))) : 1;
      const W = (0.19 + 0.125 * sm(t)) * (0.55 + 0.45 * top), Tk = (0.1 + 0.018 * sm(t)) * top;
      for (let j = 0; j <= SD; j++) {
        const a = j / SD * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
        let x = 0.02 + Tk * Math.sign(ca) * Math.pow(Math.abs(ca), pe), z = W * Math.sign(sa) * Math.pow(Math.abs(sa), pe);
        const zs = z * s, palm = sm(-ca / 0.35);
        x -= 0.075 * palm * Gs(y - 0.14, 0.17) * Gs(zs - 0.16, 0.13);       // mô cái
        x -= 0.04 * palm * Gs(y - 0.16, 0.2) * Gs(zs + 0.18, 0.11);         // mô út
        x += 0.018 * sm(ca / 0.3) * Gs(y - 0.4, 0.14) * (1 - Math.abs(zs) / 0.33);   // mu bàn tay hơi vồng
        const yy = y - 0.1 * sm((y - 0.25) / 0.2) * Math.pow((zs + 0.05) / 0.33, 2);   // vòm đốt ngón
        pos.push(x, yy, z); uv.push(j / SD * 0.2, y * 0.25);
      }
    }
    for (let i = 0; i < ROW; i++) for (let j = 0; j < SD; j++) { const a = i * (SD + 1) + j, b = a + SD + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    return (GEO[key] = handFix(g, k => V(0.02, pos[k * 3 + 1], 0)));
  }
  function buildHand(hand, M, s, add, trigger) {
    add(hand, palmGeo(s), M.glove, 0, 0, 0);
    add(hand, new THREE.SphereGeometry(1, 14, 10), M.gloveP, 0.112, 0.25, 0).scale.set(0.038, 0.19, 0.26);   // đệm mu bàn tay vồng theo mu, không phải tấm phẳng
    const GC = HAND_GC;
    for (let f = 0; f < 4; f++) {
      const z = s * [0.21, 0.07, -0.07, -0.205][f], k = [0.98, 1.07, 1.0, 0.8][f], rw = [0.072, 0.074, 0.07, 0.061][f], rt = rw * 0.92;
      const th0 = [0.2, 0.27, 0.17, 0.02][f], R = 0.2 + rt + 0.006, L = [0.27 * k, 0.17 * k, 0.13 * k];
      const At = (th, zz) => V(GC[0] + Math.cos(th) * R, GC[1] + Math.sin(th) * R, zz);
      const trig = trigger && f === 0;
      let J;
      if (trig) {
        // ngón trỏ tay phải duỗi dọc thân súng, ngoài vành cò (kỷ luật ngón tay) thay vì nắm cùng ba ngón kia
        J = [V(-0.01, 0.53, z), V(-0.035, 0.8, 0.29), V(-0.055, 0.97, 0.35), V(-0.08, 1.08, 0.39)];   // báng nghiêng ~20° nên ngón ngả về phía ngón cái mới nằm ngang dọc thân súng
      } else {
        let th = th0; J = [At(th, z)];
        for (let j = 0; j < 3; j++) { th += 2 * Math.asin(Math.min(0.99, L[j] / (2 * R))); J.push(At(th, z * (1 - 0.05 * (j + 1)))); }
      }
      const mid = (a, b) => a.clone().lerp(b, 0.5);
      const pts = [V(0.03, 0.38, z * 0.92), J[0], mid(J[0], J[1]), J[1], mid(J[1], J[2]), J[2], mid(J[2], J[3]), J[3]];
      add(hand, fingerGeo('fg' + s + f + (trig ? 't' : ''), pts, rw, rt, [0.15, 0.44, 0.72]), M.glove, 0, 0, 0);
      // đệm da đầu ngón
      const dir = J[3].clone().sub(J[2]).normalize(), o = J[3].clone().addScaledVector(dir, -0.045);
      const nIn = trig ? V(-1, 0, 0) : V(GC[0] - o.x, GC[1] - o.y, 0).normalize();
      add(hand, new THREE.SphereGeometry(1, 8, 6), M.gloveK, o.x + nIn.x * 0.018, o.y + nIn.y * 0.018, o.z).scale.set(rt * 0.9, rt * 0.9 + 0.012, rw * 0.92);
      // đệm cứng đốt ngón + đệm đốt giữa trên mặt lưng ngón
      const out = (Q, c) => { const v = trig ? V(1, -0.2, 0).normalize() : V(Q.x - GC[0], Q.y - GC[1], 0).normalize(); return { p: Q.clone().addScaledVector(v, c), a: Math.atan2(v.y, v.x) }; };
      const K = out(J[0], rt * 0.7), Pp = out(J[1], rt * 0.72);
      add(hand, new THREE.SphereGeometry(1, 10, 6), M.gloveK, K.p.x, K.p.y, K.p.z, 0, 0, K.a).scale.set(0.038, 0.062, rw * 0.98);
      add(hand, new THREE.SphereGeometry(1, 8, 6), M.gloveK, Pp.p.x, Pp.p.y, Pp.p.z, 0, 0, Pp.a).scale.set(0.022, 0.044, rw * 0.82);
    }
    // ngón cái: gốc chìm trong mô cái, vòng qua phía đối diện cán
    add(hand, fingerGeo('fgT' + s, [V(0.0, 0.06, s * 0.17), V(-0.07, 0.2, s * 0.27), V(-0.17, 0.32, s * 0.33), V(-0.28, 0.39, s * 0.335), V(-0.38, 0.42, s * 0.31)], 0.086, 0.074, [0.42, 0.72]), M.glove, 0, 0, 0);
    add(hand, new THREE.SphereGeometry(1, 8, 6), M.gloveK, -0.355, 0.41, s * 0.315).scale.set(0.072, 0.06, 0.076);
  }

  // ---------- TẠO HÌNH NHÂN VẬT BINH SĨ ĐẦY ĐỦ ----------
  function buildFigure(team, options = {}) {
    const crew = (options.role || 'infantry') !== 'infantry';
    const M = getMaterials(team, crew);
    const root = new THREE.Group();
    const torso = new THREE.Group();
    root.add(torso);
    const hips = new THREE.Group();
    root.add(hips);
    const chest = new THREE.Group();
    chest.scale.x = CHEST_W; chest.userData.baseScaleX = CHEST_W;
    torso.add(chest);
    const meshes = [];

    const add = (parent, geo, mat, x, y, z, rx, ry, rz) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      if (rx || ry || rz) m.rotation.set(rx || 0, ry || 0, rz || 0);
      m.castShadow = true; m.receiveShadow = true;
      parent.add(m); meshes.push(m);
      return m;
    };

    const beltPouch = (a, y, w, h, d, mat = M.pouch) => {
      const x = Math.sin(a) * (1.43 + d * 0.42), z = -Math.cos(a) * (0.96 + d * 0.42);
      const m = add(torso, rbox(w, h, d), mat, x, y, z, 0, Math.PI - a, 0);
      add(torso, rbox(w * 0.88, h * 0.72, 0.055), M.web2,
        Math.sin(a) * 1.445, y, -Math.cos(a) * 0.975, 0, Math.PI - a, 0);
      return m;
    };

    const red = team === 'RED';
    const isHatch = options.inHatch === true;
    const pantsMat = isHatch
      ? (M.lowerPants || (M.lowerPants = new THREE.MeshBasicMaterial({ color: red ? 0x221a14 : 0x181c15, side: THREE.DoubleSide, transparent: true, opacity: 0.65 })))
      : M.uni;
    const shinMat = isHatch
      ? (M.lowerShin || (M.lowerShin = new THREE.MeshBasicMaterial({ color: red ? 0x14100c : 0x0e110d, side: THREE.DoubleSide, transparent: true, opacity: 0.45 })))
      : M.uni;
    const padMat = isHatch
      ? (M.lowerPad || (M.lowerPad = new THREE.MeshBasicMaterial({ color: 0x10110e, side: THREE.DoubleSide, transparent: true, opacity: 0.55 })))
      : M.pad;
    const bootMat = isHatch
      ? (M.lowerBoot || (M.lowerBoot = new THREE.MeshBasicMaterial({ color: 0x070806, transparent: true, opacity: 0.3 })))
      : M.boot;

    const pocketMat = isHatch ? pantsMat : M.uniS;
    // Phần dưới chiến sĩ: Hông, đùi, cẳng chân đồng bộ chuẩn mực giải phẫu
    // Khung chậu bám hips, đùi bám leg, cẳng chân bám knee; gộp qua bakeSkinned thành 1 draw call siêu mượt
    // bộ binh: quần liền mảnh pha trộn 2 xương (pantsGeo, ghép sau khi có đủ khớp chân); kíp lái và bản soi từng mảnh không có skinning nên giữ khối rời
    const oneCloth = !crew && !isHatch && options.bake !== false && options.bake !== 'group';
    if (!oneCloth) {
      add(hips, hipGeo(), pantsMat, 0, 0, 0);
      add(hips, crotchGeo(), pantsMat, 0, 0, 0);
    }

    const legs = [];
    for (const sx of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(sx * HIP_X, HIP_Y, 0.06);
      leg.rotation.set(0, 0, sx * 0.035);
      hips.add(leg);

      if (!oneCloth) add(leg, thighGeo(), pantsMat, 0, 0, 0).scale.set(0.96, 1, 1.16); // mặt cắt elip: ngang vừa khít bẹn, sâu dầy dặn cơ bắp nhìn từ góc nghiêng
      // túi hộp bên đùi dã chiến + nắp + khuy ôm sát sườn đùi to
      // Bán kính phải bám đúng mặt đùi tại từng cao độ. Các giá trị 0.80/0.83 cũ lớn hơn
      // ống đùi 0.12–0.15 đơn vị, tạo một khe sáng khiến túi trông như lơ lửng.
      if (!oneCloth) {
        add(leg, patchGeo(0.69, sx * Math.PI / 2, 1.05, 0.95, 0.05), pocketMat, 0, -1.55, 0.02);
        add(leg, patchGeo(0.735, sx * Math.PI / 2, 1.12, 0.26, 0.022), pocketMat, 0, -1.08, 0.02);
        add(leg, rbox(0.04, 0.07, 0.14), M.knuck, sx * 0.755, -1.13, 0.02, 0, 0, 0);
      }
      if (!oneCloth) add(leg, patchGeo(0.82, Math.PI + sx * 0.35, 0.75, 0.5, 0.03), pocketMat, 0, -0.75, 0);

      const knee = new THREE.Group();
      knee.position.set(0, -THIGH_L, -0.03);
      leg.add(knee);
      // gối: mảng đệm gối chiến thuật bảo vệ che kín khe khớp khi gập
      if (!oneCloth) {
        add(knee, kneePanelGeo(), pocketMat, 0, 0, 0);
        add(knee, new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), padMat, 0, -0.3, -0.5, -Math.PI / 2, 0, 0).scale.set(0.32, 0.06, 0.16);
      }

      if (!oneCloth) {
        add(knee, shinGeo(), shinMat, 0, 0, 0).scale.set(1.02, 1, 1.10);
        // ống quần túm phồng trùm phủ cổ giày bốt: loại bỏ cảm giác que tăm cắm vào giày
        add(knee, new THREE.SphereGeometry(1, 18, 10), shinMat, 0, -SHIN_L + 1.1, 0.02).scale.set(0.48, 0.16, 0.52);
      }

      const ankle = new THREE.Group();
      ankle.position.set(0, -SHIN_L, 0.02);
      knee.add(ankle);
      const soleMat = isHatch ? bootMat : (M.sole || (M.sole = new THREE.MeshStandardMaterial({ color: 0x141210, roughness: 0.92 })));
      const toeMat = isHatch ? bootMat : (M.bootToe || (M.bootToe = new THREE.MeshStandardMaterial({ color: M.boot.color.clone().multiplyScalar(0.72), roughness: 0.68 })));
      const boot = add(ankle, bootGeo('upper'), bootMat, 0, 0, 0);
      add(ankle, bootGeo('toe'), toeMat, 0, 0, 0);                   // mũi bọc
      add(ankle, bootGeo('sole'), soleMat, 0, 0, 0);
      const shaft = add(knee, bootShaftGeo(), bootMat, 0, -SHIN_L, 0.03);   // cổ giày gắn ống chân: luôn ôm cổ chân khi bàn chân gập / duỗi
      if (!oneCloth) add(knee, new THREE.TorusGeometry(0.42, 0.045, 6, 22), bootMat, 0, -SHIN_L + 1.07, 0.03, Math.PI / 2, 0, 0).scale.set(0.92, 1.12, 1);
      if (!isHatch) {
        const midMat = M.bootMid || (M.bootMid = new THREE.MeshStandardMaterial({ color: M.boot.color.clone().multiplyScalar(0.5).add(new THREE.Color(0x0c0b09)), roughness: 0.88 }));
        const nylon = M.bootNylon || (M.bootNylon = new THREE.MeshStandardMaterial({ color: M.vestD.color.clone().multiplyScalar(0.5), roughness: 0.96 }));
        const onFoot = (geo, mat) => add(ankle, geo, mat, 0, 0, 0), onShaft = (geo, mat) => add(knee, geo, mat, 0, -SHIN_L, 0.03);
        onFoot(bootGeo('mid'), midMat);                               // đế giữa
        onFoot(bootTrimGeo('lugs'), soleMat);                          // gai đế
        onFoot(bootTrimGeo('welt'), soleMat);                          // viền đế
        onFoot(bootTrimGeo('laces'), M.strap);                         // dây trên mu
        const zOf = u => lerp1(BOOT_Z0 - 0.02, -1.08, u);
        for (const sd of [-1, 1]) {
          const tOf = t => (sd > 0 ? t : Math.PI - t);
          // dải da chắn bùn chạy quanh chân giày, cao dần về gót
          onFoot(bootPanel('bMud' + sd, (u, v) => { const z = zOf(u); return footPt(z, tOf(lerp1(-0.5, 0.08 + 0.5 * sm(1 - u * 1.6), v)), 'upper'); }, footRef, 0.016, 48, 8), toeMat);
          // nẹp xỏ dây trên mu
          onFoot(bootPanel('bEyeF' + sd, (u, v) => footPt(lerp1(-0.14, -0.72, u), Math.PI / 2 - sd * lerp1(0.28, 0.56, v), 'upper'), footRef, 0.018, 8, 3), toeMat);
          // nẹp xỏ dây trên cổ
          onShaft(bootPanel('bEyeS' + sd, (u, v) => shaftPt(lerp1(-0.08, 0.98, u), sd * lerp1(0.26, 0.56, v)), shaftRef, 0.02, 12, 3), toeMat);
          // mảng vải bên cổ giày + chỉ may
          onShaft(bootPanel('bNyl' + sd, (u, v) => shaftPt(lerp1(0.36, 1.04, u), sd * lerp1(0.62, Math.PI - 0.28, v)), shaftRef, 0.014, 12, 30), nylon);
          onShaft(bootTube('bStS' + sd, [0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => { const a = sd * lerp1(0.62, Math.PI - 0.28, i / 8), Q = shaftPt(0.385, a); return Q.addScaledVector(V(Q.x, 0, Q.z).normalize(), 0.018); }), 0.007), M.strap);
          // khoen dây
          for (let k = 0; k < 5; k++) {
            const y = 0.04 + k * 0.2, a = sd * 0.42, Q = shaftPt(y, a), out = V(Q.x, 0, Q.z).normalize();
            const m = add(knee, new THREE.CylinderGeometry(0.03, 0.03, 0.02, 8), M.knuck, Q.x + out.x * 0.024, Q.y - SHIN_L, Q.z + out.z * 0.024 + 0.03);
            m.quaternion.setFromUnitVectors(UP, out);
          }
          // dây chéo trên cổ
          for (let k = 0; k < 4; k++) {
            const A = shaftPt(0.04 + k * 0.2, sd * 0.42), B = shaftPt(0.24 + k * 0.2, -sd * 0.42), nA = V(A.x, 0, A.z).normalize(), nB = V(B.x, 0, B.z).normalize();
            A.addScaledVector(nA, 0.03); B.addScaledVector(nB, 0.03);
            const mid = A.clone().lerp(B, 0.5); mid.z -= 0.035;
            onShaft(bootTube('bLc' + sd + k, [A, mid, B], 0.015), M.strap);
          }
        }
        for (const zc of [-1.0, -1.04]) onFoot(bootTube('bToeS' + zc, [...Array(13).keys()].map(i => { const P = footPt(zc, 0.02 + (Math.PI - 0.04) * i / 12, 'toe'), n = V(P.x, P.y + ANKLE_H - 0.2, 0).normalize(); return P.addScaledVector(n, 0.006); }), 0.007), M.strap);
        // lưỡi gà, ụ gót, đường may sau gót
        onShaft(bootPanel('bTong', (u, v) => shaftPt(lerp1(-0.1, 0.96, u), lerp1(-0.28, 0.28, v)), shaftRef, 0.006, 10, 4), midMat);
        onShaft(bootPanel('bHeel', (u, v) => shaftPt(lerp1(-0.5, 0.36 - 0.14 * Math.pow(Math.abs(v * 2 - 1), 2), u), Math.PI + lerp1(-0.95, 0.95, v)), shaftRef, 0.018, 14, 30), toeMat);
        onShaft(bootPanel('bBack', (u, v) => shaftPt(lerp1(0.34, 1.02, u), Math.PI + lerp1(-0.12, 0.12, v)), shaftRef, 0.012, 8, 2), toeMat);
      }

      legs.push({ sx, leg, knee, ankle, boot });
    }
    if (oneCloth) for (const L of legs) {
      add(root, pantsGeo(root, hips, L), pantsMat, 0, 0, 0);
      add(root, GEO['pants' + L.sx + 'C'], pantsMat, 0, 0, 0);   // cạp, đỉa, nẹp khoá, túi sau
      add(root, GEO['pants' + L.sx + 'S'], M.seam, 0, 0, 0);     // đường may
    }

    const spineCloth0 = (g0) => {
      if (!oneCloth) return g0;
      const n = g0.attributes.position.count;
      if (!g0.userData.spineW) { const w = new Float32Array(n); for (let i = 0; i < n; i++) w[i] = sm((g0.attributes.position.getY(i) - 0.55) / 1.1); g0.userData.spineW = w; }
      const g = new THREE.BufferGeometry();
      g.setIndex(g0.index);
      for (const k in g0.attributes) g.setAttribute(k, g0.attributes[k]);
      g.userData.blend = { bones: [torso, chest], a: new Uint8Array(n), b: new Uint8Array(n).fill(1), w: g0.userData.spineW };
      return g;
    };
    if (oneCloth && !M.uniV) {
      // vải áo chính có nếp nhăn vừa từ pháp tuyến + màu đỉnh tối trong khe nếp (chỉ bộ binh: luôn qua bakeSkinned, đỉnh nào cũng có màu)
      M.uniV = M.uni.clone(); M.uniV.vertexColors = true;
      M.uniV.normalMap = fabricNormal(); M.uniV.normalScale = new THREE.Vector2(0.6, 0.6);
    }
    // xương đòn tạo sớm: vùng vai của thân áo cũng bám theo (cánh tay đưa ra trước thì cơ delta / mỏm vai trên thân kéo theo,
    // không còn chỏm tay áo lăn như quả bóng tách khỏi vai thân đứng yên)
    const clavs = [-1, 1].map(s => { const c = new THREE.Group(); c.position.set(s * SHOULDER_X, SHOULDER_Y, 0); chest.add(c); return c; });
    {
      const tg = spineCloth0(torsoGeo());
      if (oneCloth) {
        const P = tg.attributes.position, n = P.count, B = tg.userData.blend, a = new Uint8Array(n), b = new Uint8Array(n), w = new Float32Array(n);
        for (let i = 0; i < n; i++) {
          const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
          // Chỉ các đỉnh mặt trước (z < 0) theo xương đòn khi giơ tay.
          // Mặt sau lưng (z > 0) bám chắc vào khung lưng chest để bả vai sau không bị kéo lõm hóp vào trong!
          const frontK = sm(-z / 0.22);
          const k = sm((Math.abs(x) - 1.05) / 0.55) * sm((y - 1.95) / 0.65) * frontK;
          if (k > 0.01 && B.w[i] > 0.98) { a[i] = 1; b[i] = x < 0 ? 2 : 3; w[i] = 0.55 * k; }
          else { a[i] = B.a[i]; b[i] = B.b[i]; w[i] = B.w[i]; }
        }
        tg.userData.blend = { bones: [torso, chest, clavs[0], clavs[1]], a, b, w };
      }
      add(chest, tg, oneCloth ? M.uniV : M.uni, 0, 0, 0);
    }
    // tấm bụi / muội dán kênh trong suốt: chỉ kíp lái xe (nhìn qua nắp, xa); bộ binh nhìn nghiêng lộ mảng kính mờ lơ lửng
    if ((options.role || 'infantry') !== 'infantry') {
      add(chest, new THREE.PlaneGeometry(1.9, 1.3), M.dust, 0.08, 1.35, -1.405, 0.03, 0, 0.05);
      add(chest, new THREE.PlaneGeometry(1.8, 1.25), M.soot, -0.25, 2.25, -1.43, -0.05, 0, -0.08);
      add(chest, new THREE.PlaneGeometry(1.5, 1.4), M.dust, -0.08, 1.72, 1.72, 0, Math.PI, -0.04);
    }

    const lowerWeb = isHatch ? (M.lowerWeb || (M.lowerWeb = new THREE.MeshBasicMaterial({ color: 0x161814, side: THREE.DoubleSide, transparent: true, opacity: 0.65 }))) : M.web2;
    const lowerStrap = isHatch ? (M.lowerStrap || (M.lowerStrap = new THREE.MeshBasicMaterial({ color: 0x11120e, side: THREE.DoubleSide, transparent: true, opacity: 0.65 }))) : M.strap;
    const lowerKnuck = isHatch ? (M.lowerKnuck || (M.lowerKnuck = new THREE.MeshBasicMaterial({ color: 0x0e0f0c, transparent: true, opacity: 0.7 }))) : M.knuck;
    const lowerPouch = isHatch ? (M.lowerPouch || (M.lowerPouch = new THREE.MeshBasicMaterial({ color: red ? 0x241d16 : 0x1a1e16, side: THREE.DoubleSide, transparent: true, opacity: 0.65 }))) : M.pouch;

    // thắt lưng: bản vải có độ dày, mặt trong ép sát cạp quần (elip theo eo, không còn vòng trụ hở treo cách người)
    add(torso, beltGeo('band', [[1.36, -0.21], [1.4, -0.21], [1.42, -0.19], [1.42, 0.19], [1.4, 0.21], [1.36, 0.21]]), lowerWeb, 0, -0.38, 0);
    add(torso, beltGeo('edge', [[1.35, -0.235], [1.405, -0.235], [1.405, 0.235], [1.35, 0.235]]), lowerStrap, 0, -0.38, 0);
    for (let k = 0; k < 14; k++) {
      const a = k / 14 * Math.PI * 2;
      if (Math.abs(Math.sin(a)) > 0.95) continue;
      add(torso, rbox(0.2, 0.05, 0.03), lowerStrap, Math.cos(a) * 1.425, -0.38, Math.sin(a) * 1.425 * BELT_Z, 0, -a + Math.PI / 2, 0);
    }
    add(torso, rbox(0.42, 0.34, 0.08), lowerKnuck, 0, -0.38, -1.03);
    add(torso, rbox(0.16, 0.2, 0.04), lowerWeb, 0, -0.38, -1.08);
    add(torso, rbox(0.45, 0.32, 0.12), lowerStrap, 0, -0.38, -1.01);
    const waistR = beltPouch(0.96, -0.32, 0.52, 0.58, 0.4, lowerPouch);
    const waistL = beltPouch(-1.72, -0.3, 0.46, 0.62, 0.38, lowerPouch);
    for (const [m, a, w, h, d] of [[waistR, 0.96, 0.52, 0.58, 0.4], [waistL, -1.72, 0.46, 0.62, 0.38]]) {
      const out = V(Math.sin(a), 0, -Math.cos(a)), p = m.position.clone().addScaledVector(out, d * 0.52);
      add(torso, rbox(w * 0.9, h * 0.24, 0.08), M.vestD, p.x, m.position.y + h * 0.3, p.z, 0, Math.PI - a, 0.08);
      add(torso, rbox(0.09, h * 0.62, 0.06), M.strap, p.x, m.position.y, p.z, 0, Math.PI - a, 0);
    }

    // mép trên tấm giáp ngay dưới hõm ức (~144 cm), mép dưới trên rốn; VEST_Z đẩy cả cụm ra theo ngực dày
    const sideIn = (x, y) => -Math.sign(x) * 0.13 * sm((Math.abs(x) - 1.3) / 0.3) * sm((2.6 - y) / 0.6);
    const vestFrom = meshes.length;
    add(chest, plateGeo(2.5, 2.62, 0.2, PLATE_BEND), M.vest, 0, 1.95, -1.08, -0.08);
    add(chest, plateGeo(2.54, 2.8, 0.2, -0.26), M.vest, 0, 1.9, 1.1, 0.05);          // lưng cùng cỡ tấm với ngực (tấm cũ rộng hơn cả vai)
    add(chest, plateBindGeo(2.5, 2.62, 0.2, PLATE_BEND), M.vestB, 0, 1.95, -1.08, -0.08);
    add(chest, plateBindGeo(2.54, 2.8, 0.2, -0.26), M.vestB, 0, 1.9, 1.1, 0.05);

    // vải quanh eo bám hai đoạn cột sống (bụng theo thắt lưng, ngực theo lồng ngực), gập lưng không gãy khúc
    add(chest, spineCloth0(cummerbundGeo()), M.vest, 0, 0.22, 0).scale.z = 0.9;

    for (const sx of [-1, 1]) {
      // quai vai bám đúng mặt vai áo (elip torsoGeo); hai đầu lọt vào mép giáp trước / sau thay vì dải giấy dẹt cắt ngang ngực.
      // y cộng 0.22 vì cả cụm giáp bị hạ 0.22 ở vòng lặp cuối
      const TS = [[1.62, 2.72], [1.64, 2.92], [1.56, 3.13], [1.32, 3.3], [0.96, 3.46], [0.62, 3.62]];
      const shY = (x, z) => {
        const R = Math.hypot(x, z / 0.66) / 1.02;
        for (let i = 1; i < TS.length; i++) if (R >= TS[i][0]) { const a = TS[i - 1], b = TS[i]; return a[1] + (b[1] - a[1]) * (a[0] - R) / (a[0] - b[0]); }
        return TS[TS.length - 1][1];
      };
      const pts = [V(sx * 0.62, 3.1, -0.95)];
      for (const z of [-0.93, -0.8, -0.5, -0.2, 0.1, 0.4, 0.7, 0.9]) { const x = sx * (0.62 + 0.28 * (1 - z * z / 1.04)); pts.push(V(x, shY(x, z) + 0.27 + VEST_DROP * (1 - z * z), z * (1 + 0.15 * sm((Math.abs(z) - 0.4) / 0.5)))); }   // ngực / lưng dày hơn: quai nổi trên mặt áo
      pts.push(V(sx * 0.68, 3.2, 0.96));
      // đoạn quai xuống ngực / lưng áp vào mặt áo thật (elip giả định lệch: quai hở khỏi ngực dẹt, lơ lửng sau lưng)
      for (const q of pts) {
        const sd = Math.sign(q.z) || 1, zs = torsoSurfZ(q.x, q.y - 0.22 - VEST_DROP, sd) + sd * 0.055, k = sm((Math.abs(q.z) - 0.3) / 0.35);
        q.z += (zs - q.z) * k;
      }
      add(chest, padStrapGeo(new THREE.CatmullRomCurve3(pts), 0.3, 0.075, 'shoulder' + sx, V(sx * 0.05, 2.55, 0)), M.vestD, 0, 0, 0);   // tâm lệch vào trong -> quai nằm nghiêng ôm dốc vai
      { const cv = new THREE.CatmullRomCurve3(pts); let best = 0, bd = 9;
        for (let k = 0; k <= 40; k++) { const d = Math.abs(cv.getPoint(k / 40).z + 0.62); if (d < bd) { bd = d; best = k / 40; } }
        const bp = cv.getPoint(best), tg = cv.getTangent(best);
        add(chest, rbox(0.36, 0.1, 0.06), M.knuck, bp.x, bp.y + 0.05, bp.z, Math.atan2(-tg.y, -tg.z) - Math.PI / 2, 0, 0); }   // khoá điều chỉnh nằm trên mặt quai
      // ống túi nước chạy men theo mặt quai vai phải (trước đây nổi lơ lửng cách vai như quai xách)
      if (sx > 0) add(chest, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(q => V(q.x + 0.05, q.y + 0.085, q.z)).slice(0, -1).concat(V(0.73, 3.22 + VEST_DROP * 0.3, 1.09))), 30, 0.024, 6, false), M.strap, 0, 0, 0);
    }

    // bảng hành chính dán velcro sát mặt giáp: túi dẹt có khoá kéo + phù hiệu nhỏ (không phải khối dày dán cờ to)
    add(chest, rbox(1.3, 0.72, 0.075), M.vestD, 0, 2.6, -1.3, -0.08);
    add(chest, rbox(1.22, 0.022, 0.02), M.strap, 0, 2.29, -1.335, -0.08);
    add(chest, rbox(0.07, 0.09, 0.03), M.knuck, 0.46, 2.27, -1.34, -0.08);
    add(chest, rbox(0.82, 0.3, 0.018), M.velcro, 0, 2.7, -1.34, -0.08);
    add(chest, rbox(0.46, 0.2, 0.016), M.patch, -0.14, 2.7, -1.35, -0.08);
    for (const sx of [-1, 1]) {
      add(chest, rbox(0.2, 0.15, 0.05), M.knuck, sx * 0.65, 3.28, -1.26, -0.35);     // khoá tháo nhanh quai vai
      add(chest, rbox(0.1, 0.34, 0.02), M.vestB, sx * 0.65, 3.05, -1.285, -0.3);
    }
    // NÚT BỘ ĐÀM (PTT) kẹp trên ngực trái: hộp nhỏ, nút cao su tròn lớn có vành, kẹp sau lưng, đầu cắm cáp phía dưới
    {
      const tilt = -0.3, ny = Math.sin(0.3), nz = -Math.cos(0.3), px = -0.76, py = 2.98, pz = -1.34;
      const face = (d, dy = 0) => [px, py + ny * d + dy * Math.cos(0.3), pz + nz * d + dy * Math.sin(0.3)];
      add(chest, rbox(0.3, 0.38, 0.12), M.knuck, px, py, pz, tilt);
      add(chest, rbox(0.14, 0.3, 0.05), M.strap, px, py + 0.02, pz + 0.09, tilt);                                    // kẹp
      add(chest, new THREE.CylinderGeometry(0.105, 0.105, 0.025, 18), M.strap, ...face(0.07, 0.04), Math.PI / 2 + tilt, 0, 0);   // vành nút
      add(chest, new THREE.CylinderGeometry(0.085, 0.095, 0.045, 18), M.tq, ...face(0.095, 0.04), Math.PI / 2 + tilt, 0, 0);    // nút cao su
      add(chest, new THREE.CylinderGeometry(0.03, 0.03, 0.09, 8), M.strap, ...face(0.0, -0.22), tilt, 0, 0);          // đầu cắm cáp
    }
    // tai đai sườn cài vào mép giáp trước (vải dẹt cùng tông, không phải khối đen)
    for (const sx of [-1, 1]) add(chest, rbox(0.34, 0.5, 0.02), M.vestB, sx * 1.12, 1.25, -1.05, 0, sx * -0.95, 0);
    // BỘ ĐÀM CHIẾN THUẬT trong túi vải hở miệng bên sườn trái (toạ độ thật; rp đổi sang hệ trước khi vòng lặp dồn áo giáp co lại)
    {
      const rp = (x, y, z) => [x / 0.955, y + 0.22, z / 0.84];
      const body = M.radio || (M.radio = new THREE.MeshStandardMaterial({ color: 0x24251f, roughness: 0.58, metalness: 0.2 }));
      add(chest, rbox(0.4, 1.0, 0.68), M.pouch, ...rp(-1.85, 0.95, 0.1));                                              // túi
      add(chest, rbox(0.43, 0.07, 0.71), M.vestD, ...rp(-1.85, 1.44, 0.1));                                            // viền miệng túi
      for (const y of [0.62, 0.95, 1.25]) add(chest, rbox(0.43, 0.035, 0.71), M.strap, ...rp(-1.85, y, 0.1));          // dây chun
      add(chest, rbox(0.26, 0.98, 0.52), body, ...rp(-1.86, 1.5, 0.1));   // mặt ngoài máy lùi sau mặt túi (trùng mặt thì chồng lấp nhấp nháy)                                                  // thân máy
      const ox = -1.995;                                                                                                // mặt ngoài máy
      for (let k = 0; k < 4; k++) add(chest, rbox(0.018, 0.022, 0.42), M.knuck, ...rp(ox, 1.52 + k * 0.045, 0.1));     // lưới loa
      add(chest, rbox(0.014, 0.09, 0.24), M.lens, ...rp(ox, 1.8, 0.03));                                                // màn hình
      for (let k = 0; k < 3; k++) add(chest, rbox(0.022, 0.05, 0.05), M.knuck, ...rp(ox, 1.8, 0.2 + k * 0.0 + (k - 1) * 0.0 + k * 0.06 - 0.02));   // phím
      for (const sz of [-1, 1]) for (let k = 0; k < 5; k++) add(chest, rbox(0.24, 0.02, 0.018), M.knuck, ...rp(-1.9, 1.56 + k * 0.08, 0.1 + sz * 0.277));   // gờ tản nhiệt hông
      add(chest, rbox(0.32, 0.05, 0.56), body, ...rp(-1.9, 2.0, 0.1));                                                  // nắp trên
      add(chest, new THREE.CylinderGeometry(0.07, 0.075, 0.1, 14), M.knuck, ...rp(-1.9, 2.07, -0.06));                  // núm kênh
      add(chest, new THREE.CylinderGeometry(0.05, 0.05, 0.08, 12), M.knuck, ...rp(-1.9, 2.06, 0.1));                    // núm âm lượng
      add(chest, new THREE.CylinderGeometry(0.035, 0.055, 0.14, 10), M.knuck, ...rp(-1.9, 2.09, 0.28));                 // đầu nối anten
      // (lưới ống: vòng lặp chỉ dồn y -0.22 nên cộng 0.22, x / z để nguyên)
      const tp = (x, y, z) => V(x, y + 0.22, z);
      add(chest, new THREE.TubeGeometry(new THREE.CatmullRomCurve3([tp(-1.9, 2.14, 0.28), tp(-1.93, 2.55, 0.58), tp(-1.9, 3.05, 0.92), tp(-1.76, 3.55, 1.2)]), 22, 0.012, 5, false), M.strap, 0, 0, 0);   // anten mảnh
      // cáp xoắn lò xo từ đáy túi vòng qua sườn lên PTT
      const path = new THREE.CatmullRomCurve3([tp(-1.72, 1.9, -0.18), tp(-1.72, 2.0, -0.55), tp(-1.5, 2.2, -0.9), tp(-1.15, 2.42, -1.08), tp(-0.76, 2.56, -1.16)]);
      const pts = [], COILS = 34, N = COILS * 8, q = V(), up = V(0, 1, 0), a1 = V(), a2 = V();
      for (let i = 0; i <= N; i++) {
        const t = i / N, P = path.getPointAt(t), Tn = path.getTangentAt(t);
        a1.crossVectors(Tn, up).normalize(); a2.crossVectors(a1, Tn).normalize();
        const k = sm(t / 0.05) * sm((1 - t) / 0.05), th = i / 8 * Math.PI * 2;
        pts.push(P.clone().addScaledVector(a1, Math.cos(th) * 0.035 * k).addScaledVector(a2, Math.sin(th) * 0.035 * k));
      }
      add(chest, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), N, 0.009, 4, false), M.strap, 0, 0, 0);
    }
    add(chest, rbox(0.72, 0.76, 0.5), M.pouch, 1.65, 1.35, 0.04, 0, Math.PI / 2, -0.03);
    add(chest, rbox(0.6, 0.24, 0.13), M.vestD, 1.93, 1.58, 0.04, 0, Math.PI / 2, -0.08);
    add(chest, rbox(0.1, 0.48, 0.08), M.strap, 1.94, 1.34, 0.04, 0, Math.PI / 2, 0);
    // mặt lưng: để lộ đai MOLLE của vỏ giáp, một túi nước dẹt treo trên đai (bản cũ: 2 khối rằn ri chồng nhau che hết tấm lưng)
    // TẤM LƯNG GẮN KHOÁ KÉO (túi nước / túi hành chính): phủ gần hết tấm lưng như giáp thật (bản cũ 1,3 x 1,5 trên tấm 2,54 x 2,8 trông bé tí),
    // cong ôm theo tấm lưng (hộp phẳng thì hở khe ở hai mép)
    {
      const bend = (g, b, hw) => { g = g.clone(); const P = g.attributes.position; for (let i = 0; i < P.count; i++) P.setZ(i, P.getZ(i) + b * Math.pow(P.getX(i) / hw, 2)); g.computeVertexNormals(); return g; };
      const BW = 2.1, BH = 2.05, BY = 1.86, BZ = 1.38, BB = -0.24;
      add(chest, bend(new THREE.BoxGeometry(BW, BH, 0.28, 14, 3, 1), BB, BW / 2), M.pouch, 0, BY, BZ, 0.03);
      add(chest, bend(new THREE.BoxGeometry(BW - 0.06, 0.28, 0.1, 14, 1, 1), BB, BW / 2), M.vestD, 0, BY + BH / 2 - 0.12, BZ + 0.17, 0.08);   // nắp
      add(chest, bend(new THREE.BoxGeometry(BW - 0.3, 0.02, 0.016, 12, 1, 1), BB, BW / 2), M.strap, 0, BY + BH / 2 - 0.3, BZ + 0.15);        // khoá kéo
      for (const sx of [-1, 1]) {
        const ez = BZ + 0.15 + BB * Math.pow(0.62 / (BW / 2), 2);
        add(chest, rbox(0.12, BH - 0.2, 0.02), M.web2, sx * 0.62, BY - 0.05, ez, 0.03);     // đai nén
        add(chest, rbox(0.17, 0.1, 0.04), M.knuck, sx * 0.62, BY - 0.45, ez + 0.01, 0.03);
        add(chest, rbox(0.06, 0.04, 0.03), M.knuck, sx * 0.6, BY + BH / 2 - 0.3, BZ + 0.16);  // tay kéo khoá hai đầu
      }
    }
    add(chest, new THREE.TorusGeometry(0.25, 0.038, 8, 18, Math.PI), M.vestB, 0, 3.02, 1.28, 0.2);   // quai kéo thương binh bằng đai vải
    add(chest, rbox(0.96, 0.46, 0.3), M.pouch, 0, 0.72, 1.36);
    add(chest, rbox(0.9, 0.15, 0.08), M.vestD, 0, 0.9, 1.51, 0.12);
    add(chest, rbox(0.14, 0.26, 0.03), M.web2, 0, 0.8, 1.53);

    for (let i = vestFrom; i < meshes.length; i++) {
      const m = meshes[i];
      // tấm lưng giáp thật nằm cao hơn tấm ngực (mép trên ngang đỉnh bả vai): mặt lưng chỉ hạ 20%;
      // đẩy ra trước-sau bằng cộng (nhân thì túi treo sau lưng tách khỏi tấm)
      const z0 = m.position.z, back = sm((z0 - 0.5) / 0.3);
      m.position.y -= 0.22 + VEST_DROP * (1 - 0.8 * back);
      m.position.x *= 0.955;
      // thân thon dần từ nách xuống eo: đồ treo sườn (bộ đàm, túi) dời vào theo; ống (cáp, anten) dời từng đỉnh
      if (m.geometry.type === 'TubeGeometry') {
        const P = m.geometry.attributes.position;
        for (let k = 0; k < P.count; k++) P.setX(k, P.getX(k) + sideIn(P.getX(k) * 0.955, P.getY(k) - 0.22));
      } else m.position.x += sideIn(m.position.x, m.position.y);
      m.position.z = z0 * 0.84 + Math.sign(z0) * VEST_DZ * sm((Math.abs(z0) - 0.6) / 0.3);
      m.position.z -= 0.07 * sm((z0 - 1.25) / 0.1);   // túi treo lưng áp vào tấm lưng đã cong ôm người (mép túi phẳng hở khe)
    }

    const surf = (x, y) => {
      if (Math.abs(x) <= 1.15) {
        const k = x / 1.15;
        return { z: -1.0 - VEST_DZ + PLATE_BEND * k * k + 0.08 * (1.88 - y), ry: -Math.atan(2 * PLATE_BEND * x / (1.15 * 1.15)) };
      }
      const q = Math.min(0.97, Math.abs(x) / 1.61), r = Math.sqrt(1 - q * q);
      return { z: -(1.02 + VEST_DZ) * r, ry: -Math.atan(Math.sign(x) * (1.02 + VEST_DZ) * q / (1.61 * r)) };
    };

    const onVest = (geo, mat, x, y, d, lift = 0, rx = -0.05) => {
      const S = surf(x, y), o = d / 2 + lift;
      return add(chest, geo, mat, x - Math.sin(S.ry) * o, y - VEST_DROP, S.z - Math.cos(S.ry) * o, rx, S.ry, 0);
    };

    for (const x of [-0.84, -0.28, 0.28, 0.84]) onVest(rbox(0.56, 0.9, 0.1), M.pouch, x, 1.1, 0.1);
    for (const x of [-0.46, 0, 0.46]) {
      // Mặt trong túi ép sát carrier; lift 0.10 cũ tạo khe hở ~1,25 cm dưới túi.
      onVest(rbox(0.42, 0.8, 0.32), M.pouch, x, 1.12, 0.32, 0.015);
      onVest(rbox(0.34, 0.2, 0.18), M.mag, x, 1.58, 0.18, 0.15, -0.12);
      onVest(rbox(0.4, 0.045, 0.3), M.web2, x, 1.5, 0.3, 0.12, -0.08);
      onVest(rbox(0.08, 0.12, 0.04), M.strap, x, 1.44, 0.04, 0.42);
      onVest(rbox(0.42, 0.035, 0.03), M.strap, x, 0.76, 0.03, 0.41);
    }
    onVest(rbox(0.2, 0.7, 0.24), M.pouch, 0.88, 1.12, 0.24, 0.015);
    onVest(rbox(0.16, 0.14, 0.14), M.mag, 0.88, 1.5, 0.14, 0.15, -0.1);
    onVest(rbox(0.34, 0.5, 0.32), M.pouch, -0.9, 1.0, 0.32, 0.015);
    {
      const S = surf(-0.9, 1.3), o = 0.18;
      const gx = -0.9 - Math.sin(S.ry) * o, gz = S.z - Math.cos(S.ry) * o;
      add(chest, new THREE.SphereGeometry(0.17, 14, 10), M.grenade, gx, 1.32 - VEST_DROP, gz).scale.set(1, 1.15, 1);
      add(chest, new THREE.CylinderGeometry(0.173, 0.173, 0.025, 14), M.band, gx, 1.4 - VEST_DROP, gz);
      add(chest, new THREE.CylinderGeometry(0.06, 0.07, 0.12, 8), M.knuck, gx, 1.54 - VEST_DROP, gz);
      add(chest, new THREE.TorusGeometry(0.05, 0.013, 4, 10), M.knuck, gx + 0.07, 1.57 - VEST_DROP, gz - 0.06, 0, 0.6, 0);
    }
    onVest(new THREE.CylinderGeometry(0.12, 0.12, 0.46, 12), M.smoke, -1.4, 1.05, 0.24, 0, 0);
    onVest(new THREE.CylinderGeometry(0.055, 0.055, 0.1, 8), M.knuck, -1.4, 1.33, 0.24, 0, 0);
    onVest(rbox(0.26, 0.5, 0.06), M.strap, -1.4, 1.05, 0.06);

    if (!oneCloth) for (const sx of [-1, 1]) add(chest, GEO.shoulder || (GEO.shoulder = clothUV(new THREE.SphereGeometry(0.56, 20, 14))), M.uni, sx * 1.56, 2.74, 0).scale.set(1.08, 0.8, 1.18);
    // cổ áo là mảnh vải may rời: rằn ri sẫm hơn thân + đường may tối ở chân cổ (cùng màu, không đường nối thì trông liền với vai)
    add(chest, collarGeo(), M.uniC, 0, 0, 0);
    add(chest, collarSeamGeo(), M.strap, 0, 0, 0);
    // KHOÁ KÉO cổ áo mở một nửa: hai nẹp vải + răng khoá chụm hình chữ V từ hai đầu cổ xuống con chạy giữa ngực
    {
      const ZY = 3.13;
      for (const sx of [-1, 1]) {
        const f = COLLAR_GAP + 0.03, E = collarExit(f), C = E.C, y0 = C.yB + (C.yT - C.yB) * E.u, x0 = sx * Math.sin(f) * (C.rB + (C.rT - C.rB) * E.u + 0.04);
        const line = (off, lift) => { const pts = []; for (let k = 0; k <= 10; k++) { const t = k / 10, y = y0 + (ZY - y0) * t, x = (x0 + (sx * 0.012 - x0) * t) + sx * off * (1 - t * 0.6); pts.push(V(x, y, torsoFrontZ(x, y) - lift)); } return new THREE.CatmullRomCurve3(pts); };
        add(chest, strapGeo(line(0.03, 0.01), 0.055, 0.012, 'zipTape' + sx, V(0, 2.5, 0)), M.uniC, 0, 0, 0);   // nẹp vải
        add(chest, new THREE.TubeGeometry(line(0, 0.018), 18, 0.011, 4, false), M.strap, 0, 0, 0);              // răng khoá
      }
      const zz = torsoFrontZ(0, ZY);
      add(chest, rbox(0.075, 0.055, 0.035), M.knuck, 0, ZY, zz - 0.025, -0.45);                                    // con chạy
      add(chest, rbox(0.035, 0.13, 0.016), M.knuck, 0, ZY - 0.08, zz - 0.012, -0.5);                                // tay kéo
    }
    add(chest, collarBindGeo(), M.vestD, 0, 0, 0);   // băng viền mép cổ áo màu sẫm
    // DÂY CHUYỀN THẺ TÊN: xích bi vòng quanh cổ áo, thả xuống trước ngực, 2 thẻ thép bo góc chồng lệch (thẻ thật 5 x 2,9 cm)
    const tagMeshes = [];
    if ((options.role || 'infantry') === 'infantry') {
      const steel = M.dogtag || (M.dogtag = new THREE.MeshStandardMaterial({ color: 0xd2d3cf, metalness: 0.9, roughness: 0.22, envMap: metalEnv(), envMapIntensity: 1.1 }));
      const TY = 2.98, pts = [];
      for (let k = 0; k <= 48; k++) {
        const f = -Math.PI + (k / 48) * Math.PI * 2;                  // -PI..PI qua sau gáy, hai đầu ở trước
        const fr = Math.abs(f), front = sm((1.25 - fr) / 0.9);         // 1 ở giữa trước
        const [cx, cz] = collarXZ(Math.PI - fr, 0.74);
        let x = Math.sign(f) * Math.abs(cx), y = 3.62 - 0.2 * sm((2.0 - fr) / 1.2), z = cz;
        if (front > 0) {                                               // đoạn trước: rủ chữ U xuống thẻ, nằm trên mặt áo
          const t = front, yy = y + (TY + 0.095 - y) * t * t, xx = x * (1 - 0.92 * t);
          x = xx; y = yy; z = z + (torsoFrontZ(xx, yy) - 0.025 - z) * sm(t / 0.35);
        }
        pts.push(V(x, y, z));
      }
      tagMeshes.push(add(chest, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 90, 0.011, 4, true), steel, 0, 0, 0));
      const tagGeo = GEO.dogtag || (GEO.dogtag = (() => { const sh = new THREE.Shape(), w = 0.115, h = 0.2, r = 0.05;
        sh.moveTo(-w + r, -h); sh.lineTo(w - r, -h); sh.quadraticCurveTo(w, -h, w, -h + r); sh.lineTo(w, h - r); sh.quadraticCurveTo(w, h, w - r, h);
        sh.lineTo(-w + r, h); sh.quadraticCurveTo(-w, h, -w, h - r); sh.lineTo(-w, -h + r); sh.quadraticCurveTo(-w, -h, -w + r, -h);
        const g = new THREE.ExtrudeGeometry(sh, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.006, bevelSegments: 1 }); g.translate(0, -h, -0.006); return g; })());
      for (const [dx, dz, rz] of [[-0.03, 0, 0.06], [0.05, -0.018, -0.1]]) {
        const zt = torsoFrontZ(dx, TY - 0.2) - 0.03 + dz;
        tagMeshes.push(add(chest, tagGeo, steel, dx, TY + 0.13, zt, -0.18, 0, rz));
        // khoen xỏ qua lỗ đầu thẻ, xích luồn qua khoen
        tagMeshes.push(add(chest, new THREE.TorusGeometry(0.03, 0.006, 5, 14), steel, dx - 0.035 * Math.sin(rz), TY + 0.095, zt - 0.005, 0, Math.PI / 2, 0));
      }
    }
    const neckMesh = add(chest, neckGeo(), M.gaiter, 0, 0, 0.08);

    const head = new THREE.Group();
    head.position.set(0, 4.16, 0.04);
    head.scale.set(0.83 / CHEST_W, 0.83, 0.83);   // đầu ~23 cm cằm-đỉnh -> người ~7,5 đầu (0.92 cũ ~6,2 đầu: trông lùn, đầu to như trẻ con)
    chest.add(head);
    if (oneCloth) {   // khăn cổ: phần trên bám đầu (đầu cúi / đưa ra trước khi ngắm thì cổ co giãn theo, không lún qua nhau)
      const g0 = neckMesh.geometry, P = g0.attributes.position, n = P.count, g = new THREE.BufferGeometry(), w = new Float32Array(n);
      g.setIndex(g0.index); for (const k in g0.attributes) g.setAttribute(k, g0.attributes[k]);
      for (let i = 0; i < n; i++) w[i] = 0.85 * sm((P.getY(i) - 3.35) / 0.55);
      g.userData.blend = { bones: [chest, head], a: new Uint8Array(n), b: new Uint8Array(n).fill(1), w };
      neckMesh.geometry = g;
    }

    add(head, faceGeo(), M.skinV, 0, 0.72, 0);
    // tai nằm gọn dưới chụp tai liên lạc (khỏi lộ mảng da cạnh chụp)
    for (const sx of [-1, 1]) add(head, earGeo(), M.skin, sx * 0.76, 0.64, 0.07, 0, sx * 0.2, 0).scale.set(sx * 0.8, 0.8, 0.8);
    add(head, gaiterGeo(), M.gaiter, 0, 0.0, 0);
    // TAI NGHE LIÊN LẠC CHIẾN THUẬT (che tai): vỏ vòm oval cao hơn rộng + tấm ốp nổi + lỗ micro thu âm ngoài + 3 nút cao su +
    // núm âm lượng; đệm giả da đen; tay gá lên ray hông mũ (khớp xoay); cần mic mảnh có khớp, đầu mút chắn gió; cáp xuống cổ áo
    {
      const rub = M.knuck, shell = M.headset;
      const pad = M.hsPad || (M.hsPad = new THREE.MeshStandardMaterial({ color: 0x111110, roughness: 0.55, metalness: 0 }));
      const foam = M.hsFoam || (M.hsFoam = new THREE.MeshStandardMaterial({ color: 0x141413, roughness: 1 }));
      for (const sx of [-1, 1]) {
        const C = V(sx * 0.88, 0.56, 0.06), ax = sx;          // tâm chụp, trục ra ngoài theo x
        const at = (dx, dy, dz) => V(C.x + ax * dx, C.y + dy, C.z + dz);
        const rot = [0, 0, -ax * Math.PI / 2];                   // trục Y hình học -> trục x ra ngoài
        // đệm tai giả da (vòng oval sát đầu)
        let m = add(head, new THREE.TorusGeometry(0.3, 0.07, 10, 28), pad, C.x - ax * 0.04, C.y, C.z, 0, Math.PI / 2, 0); m.scale.set(1, 1.16, 0.9);
        // đế vỏ + vòm vỏ oval
        m = add(head, new THREE.CylinderGeometry(1, 1, 1, 28), shell, ...at(0.06, 0, 0).toArray(), ...rot); m.scale.set(0.33, 0.1, 0.39);
        m = add(head, new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), shell, ...at(0.1, 0, 0).toArray(), ...rot); m.scale.set(0.32, 0.16, 0.38);
        // tấm ốp nổi giữa mặt vòm + viền
        m = add(head, new THREE.CylinderGeometry(1, 1, 1, 24), shell, ...at(0.255, 0.03, 0.0).toArray(), ...rot); m.scale.set(0.2, 0.03, 0.24);
        m = add(head, new THREE.TorusGeometry(1, 0.08, 6, 24), rub, ...at(0.265, 0.03, 0).toArray(), 0, Math.PI / 2, 0); m.scale.set(0.2, 0.24, 0.2);
        // lỗ micro thu âm môi trường (lưới nhỏ phía trước-dưới)
        for (let k = 0; k < 5; k++) add(head, new THREE.CylinderGeometry(0.012, 0.012, 0.02, 6), rub, ...at(0.2, -0.14 + (k % 2) * 0.03, -0.2 + k * 0.025).toArray(), ...rot);
        // 3 nút cao su mép sau dưới + núm âm lượng trên
        for (let k = 0; k < 3; k++) add(head, new THREE.CylinderGeometry(0.035, 0.035, 0.05, 10), rub, ...at(0.14, -0.2 + k * 0.08, 0.26 - k * 0.03).toArray(), 0, 0, 0).rotation.x = Math.PI / 2;
        add(head, new THREE.CylinderGeometry(0.045, 0.045, 0.06, 12), rub, ...at(0.13, 0.33, -0.1).toArray());
        // tay gá: tấm cong từ đỉnh chụp lên ray hông mũ + khớp xoay
        const arm = new THREE.CatmullRomCurve3([at(0.08, 0.34, 0.02), at(0.1, 0.46, 0.02), at(0.07, 0.56, 0.01)]);
        add(head, strapGeo(arm, 0.1, 0.03, 'hsArm' + sx, V(0, 0.6, 0.06)), shell, 0, 0, 0);
        add(head, new THREE.CylinderGeometry(0.05, 0.05, 0.08, 10), rub, ...at(0.08, 0.36, 0.02).toArray(), ...rot);
        add(head, rbox(0.12, 0.08, 0.14), shell, ...at(0.06, 0.57, 0.01).toArray());
      }
      // cần mic (chụp trái): khớp xoay ở mép trước-dưới chụp -> thân mảnh lượn theo quai hàm -> đoạn uốn bọc cao su -> đầu mút xốp chắn gió trước khóe miệng
      const L0 = V(-0.94, 0.38, -0.16);
      add(head, new THREE.SphereGeometry(0.055, 10, 8), rub, L0.x, L0.y, L0.z);
      const boomPts = [
        L0,
        V(-0.88, 0.14, -0.44),
        V(-0.72, -0.16, -0.74),
        V(-0.48, -0.44, -0.96),
        V(-0.24, -0.56, -1.03)
      ];
      add(head, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(boomPts), 28, 0.018, 6, false), shell, 0, 0, 0);
      // đoạn uốn bọc cao su linh hoạt gần đầu mic
      const flexPts = [
        V(-0.54, -0.36, -0.88),
        V(-0.42, -0.48, -0.98),
        V(-0.28, -0.54, -1.02)
      ];
      add(head, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(flexPts), 8, 0.026, 6, false), rub, 0, 0, 0);
      // đầu mút xốp chắn gió oval đặt ngay trước khóe miệng
      const foamMesh = add(head, new THREE.SphereGeometry(1, 14, 10), foam, -0.22, -0.56, -1.03);
      foamMesh.scale.set(0.08, 0.065, 0.065);
      foamMesh.rotation.y = 0.25;
      // cáp từ đáy chụp trái chạy xuống cổ áo
      add(head, new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(-0.92, 0.2, 0.18), V(-0.86, -0.1, 0.28), V(-0.74, -0.45, 0.34), V(-0.6, -0.75, 0.3)]), 16, 0.022, 5, false), rub, 0, 0, 0);
    }
    add(head, hairGeo(), M.hair, 0, 0.72, 0.02);
    for (const sx of [-1, 1]) add(head, rbox(0.035, 0.16, 0.09), M.hair, sx * 0.735, 0.89, -0.08, 0, sx * 0.25, 0);

    add(head, goggleLensGeo(), M.visor, 0, 0, 0);
    add(head, goggleFrameGeo(), M.frame, 0, 0, 0);
    for (const sx of [-1, 1]) {
      const a = ggWrap(sx * (GG.W / 2 + 0.02), GG.H / 2 + 0.03, 0.03), b = V(sx * 0.89, 1.0, -0.1), c = V(sx * 0.94, 1.1, 0.15);
      const d = V(sx * 0.93, 0.98, 0.37), e2 = V(sx * 0.86, 0.7, 0.38);
      add(head, strapGeo(new THREE.CatmullRomCurve3([a, b, c, d, e2]), 0.07, 0.02, 'ggArm' + sx, V(0, 0.75, 0.1)), M.frame, 0, 0, 0);
    }
    {
      const band = [];
      for (let k = 0; k <= 20; k++) band.push([1.1 + k / 20 * (Math.PI * 2 - 2.2), 0.16]);
      add(head, strapGeo(new THREE.CatmullRomCurve3(band.map(([f, y]) => helPt(f, y, 0.025).p)), 0.16, 0.025, 'ggBand', V(0, 1.0, 0.1)), M.strap, 0, 0, 0);
    }
    for (const sx of [-1, 1]) {
      const jn = V(sx * 0.7, -0.22, -0.18), cup = V(sx * 0.22, -0.74, -0.5);
      const fr = helPt(sx * 1.05, helRim(sx * 1.05) + 0.02, 0.02).p, bk = helPt(sx * 2.35, helRim(sx * 2.35) + 0.02, 0.02).p;
      const HC = V(0, 0.45, 0.05), fl = (pts, k) => add(head, strapGeo(new THREE.CatmullRomCurve3(pts), 0.15, 0.022, k + sx, HC), M.web, 0, 0, 0);
      fl([fr, V(sx * 0.72, 0.3, -0.48), jn], 'csF');   // quai trước luồn sát má, khuất dưới mép trước chụp tai
      fl([bk, V(sx * 0.68, 0.2, 0.4), jn], 'csB');
      fl([jn, V(sx * 0.5, -0.5, -0.36), cup], 'csC');
      add(head, rbox(0.06, 0.2, 0.14), M.webD, sx * 0.74, 0.4, -0.5, 0, sx * 0.6, 0);
      add(head, rbox(0.06, 0.14, 0.22), M.webD, sx * 0.67, 0.08, 0.2, 0, sx * -0.9, 0);
      add(head, rbox(0.08, 0.18, 0.2), M.webD, jn.x, jn.y, jn.z, 0.3, sx * 0.9, 0);
    }
    add(head, rbox(0.55, 0.14, 0.3), M.web, 0, -0.78, -0.48, 0.7, 0, 0);
    for (const m of head.userData.segs || []) meshes.push(m);

    add(head, helmetGeo(), M.helm, 0, HEL_Y, 0.07);
    add(head, new THREE.TorusGeometry(0.93, 0.028, 5, 28), M.strap, 0, 1.36, 0.07, Math.PI / 2 - 0.08).scale.set(0.98, 1.06, 1);
    const flush = (geo, mat, phi, y, off) => {
      const h = helPt(phi, y, off), m = add(head, geo, mat, h.p.x, h.p.y, h.p.z);
      m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(h.t, V().crossVectors(h.n, h.t), h.n));
      return m;
    };
    {
      const edge = [];
      for (let k = 0; k <= 72; k++) { const f = k / 72 * Math.PI * 2; edge.push([f, helRim(f) + 0.015]); }
      add(head, helLine(edge, 0.012, 0.026), M.trim, 0, 0, 0);
    }
    add(head, helRibbon('brim', -0.9, 0.9, f => helRim(f) - 0.01, f => helRim(f) + 0.1, 0.035, 0.03), M.shell, 0, 0, 0);
    for (const sx of [-1, 1]) {
      const fa = 0.92, fb = 2.25, F = f => sx * f;
      const lo = f => helRim(f) + 0.1, hi = f => helRim(f) + 0.44;
      const ribbon = (key, f0, f1, l, h, off, th) => add(head, helRibbon(key + sx, F(f0) < F(f1) ? F(f0) : F(f1), F(f0) < F(f1) ? F(f1) : F(f0), l, h, off, th), M.shell, 0, 0, 0);
      ribbon('arc', fa, fb, lo, hi, 0.02, 0.07);
      ribbon('arcSlot', fa + 0.05, fb - 0.05, f => helRim(f) + 0.33, f => helRim(f) + 0.37, 0.09, 0.012).material = M.knuck;
      ribbon('arcWing', 0.72, fa + 0.02, f => helRim(f) + 0.05 + 0.1 * Math.max(0, (Math.abs(f) - 0.72) / 0.2), f => helRim(f) + 0.12 + 1.6 * Math.max(0, Math.abs(f) - 0.72), 0.02, 0.07);
      flush(rbox(0.12, 0.08, 0.02), M.knuck, F(0.8), helRim(F(0.8)) + 0.1, 0.095);
      for (const f of [1.25, 1.65, 2.0]) {
        flush(rbox(0.13, 0.1, 0.02), M.knuck, F(f), helRim(F(f)) + 0.21, 0.095);
        flush(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 8), M.knuck, F(f + 0.17), helRim(F(f + 0.17)) + 0.21, 0.1).rotation.x += Math.PI / 2;
      }
      flush(rbox(0.36, 0.32, 0.03), M.velcro, F(2.5), 0.4, 0.02);
      flush(rbox(0.13, 0.28, 0.04), M.web, F(2.5), 0.3, 0.05);
    }
    add(head, helLine([[0, 0.05], [0, 0.5], [0, 0.9], [0.0001, 1.0], [Math.PI, 0.9], [Math.PI, 0.4], [Math.PI, -0.25]], 0.01, 0.014), M.helmD, 0, 0, 0);
    add(head, helLine([[-Math.PI / 2, 0.28], [-Math.PI / 2, 0.7], [-Math.PI / 2, 1.0], [Math.PI / 2, 1.0], [Math.PI / 2, 0.7], [Math.PI / 2, 0.28]], 0.01, 0.014), M.helmD, 0, 0, 0);
    flush(rbox(0.56, 0.44, 0.08), M.strap, 0, 0.3, 0.03);
    for (const [dx, dy] of [[-0.18, 0.12], [0.18, 0.12], [0, -0.14]]) flush(new THREE.CylinderGeometry(0.035, 0.035, 0.04, 6), M.knuck, dx, 0.3 + dy, 0.08).rotation.x += Math.PI / 2;
    flush(rbox(0.3, 0.22, 0.2), M.knuck, 0, 0.2, 0.14);
    flush(rbox(0.06, 0.16, 0.06), M.strap, 0.12, 0.13, 0.24);
    flush(rbox(0.6, 0.38, 0.035), M.velcro, Math.PI, 0.35, 0.02);
    for (let r = 0; r < 3; r++) flush(rbox(0.5, 0.05, 0.02), M.strap, Math.PI, 0.25 + r * 0.1, 0.045);
    flush(rbox(0.46, 0.4, 0.03), M.velcro, Math.PI, 1.05, 0.0);

    // CÁNH TAY & BÀN TAY
    const arms = [-1, 1].map(s => {
      const up = new THREE.Group(), fore = new THREE.Group(), hand = new THREE.Group();
      root.add(up, fore, hand);
      const pocket = new THREE.Group();
      up.add(pocket);
      // XƯƠNG ĐÒN: gốc tại khớp vai (hệ ngực), đi theo arm.sh (đưa vai trước khi ngắm, nhún vai) và xoay CLAV_FOLLOW góc nâng tay.
      // Chỏm tay áo bám xương này thay vì ngực: dịch khớp vai mà chỏm đứng yên thì vải giãn thành cục u / gù ở vai.
      const clav = clavs[s < 0 ? 0 : 1];
      let upBind = null;
      if (oneCloth) {
        // tay buông làm tư thế gốc của xương (đủ để một đỉnh vải có toạ độ đúng theo cả ngực lẫn cánh tay)
        root.updateMatrixWorld(true);
        const invR = new THREE.Matrix4().copy(root.matrixWorld).invert(), invC = new THREE.Matrix4().copy(chest.matrixWorld).invert();
        const S0 = V(s * SHOULDER_X, SHOULDER_Y, 0).applyMatrix4(chest.matrixWorld).applyMatrix4(invR), D0 = V(s * 0.06, -1, 0).normalize();
        const E0 = S0.clone().addScaledVector(D0, ARM_UP);
        aim(up, S0, E0, V(s, 0, 0.3));
        upBind = up.quaternion.clone();
        aim(fore, E0, E0.clone().addScaledVector(D0, ARM_FORE), V(s, 0, 0.3));
        root.updateMatrixWorld(true);
        const g = sleeveGeo(clav, up, fore, s, S0, D0, q => q.clone().applyMatrix4(root.matrixWorld).applyMatrix4(invC));
        add(root, g, M.uniV, 0, 0, 0);
        { const sg = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(g.userData.seam, true), 72, 0.013, 4, true), n = sg.attributes.position.count;
          sg.userData.blend = { bones: [chest, clav], a: new Uint8Array(n), b: new Uint8Array(n).fill(1), w: new Float32Array(n).fill(0.7) };   // đường may nách nằm giữa vai thân và chỏm tay
          add(chest, sg, M.helmD, 0, 0, 0); }
        // túi + phù hiệu cong ôm theo tay áo, không còn tấm phẳng dán lên
        add(pocket, patchGeo(0.565 * ARM_K, Math.PI / 2, 1.1, 0.62, 0.035), M.uniS, 0, 1.2, 0);
        add(pocket, patchGeo(0.602 * ARM_K, Math.PI / 2, 0.62, 0.28, 0.012), M.patch, 0, 1.22, 0);
        add(pocket, patchGeo(0.615 * ARM_K, Math.PI / 2, 1.12, 0.12, 0.016), M.vestD, 0, 0.93, 0);
      } else {
        add(up, limbGeo('up'), M.uni, 0, 0, 0);
        add(pocket, rbox(0.12, 0.72, 0.58), M.uniS, 0.5, 0.95, 0);
        add(pocket, rbox(0.05, 0.42, 0.44), M.patch, 0.57, 0.98, 0);
        add(pocket, rbox(0.03, 0.03, 0.56), M.strap, 0.57, 0.62, 0, 0.35, 0, 0);
        add(up, new THREE.TorusGeometry(0.5, 0.012, 4, 20), M.helmD, 0, 0.2, 0, Math.PI / 2 + 0.25, 0, 0);
      }

      if (!oneCloth) add(fore, limbGeo('fore'), M.uni, 0, 0, 0);
      add(fore, patchGeo(oneCloth ? 0.5 * ARM_K : 0.49, Math.PI / 2, 1.7, 0.46, 0.07), M.pad, 0, 0.22, 0);
      add(fore, new THREE.CylinderGeometry(0.53, 0.53, 0.06, 18, 1, true), oneCloth ? M.vestB : M.strap, 0, 0.46, 0).scale.set(oneCloth ? ARM_K : 1, 1, 0.92 * (oneCloth ? ARM_K : 1));
      add(fore, cuffGeo(), M.uni, 0, ARM_FORE - 0.47, 0).scale.setScalar(oneCloth ? ARM_K * 0.94 : 1);
      add(fore, rbox(oneCloth ? 0.05 : 0.1, oneCloth ? 0.14 : 0.18, oneCloth ? 0.24 : 0.3), M.uniS, oneCloth ? 0.3 * ARM_K * 0.94 : 0.33, ARM_FORE - 0.32, 0);   // quai dán cổ tay nằm sát, không chìa ra

      // cổ găng gắn CẲNG TAY, luồn trong ống tay áo: gắn bàn tay thì cổ tay gập là ống cứng chìa ra khỏi tay áo; cổ tay là khớp cầu tròn che khe khi gập
      add(fore, new THREE.CylinderGeometry(0.235, 0.21, 0.52, 14, 1, true), M.glove, 0, ARM_FORE - 0.16, 0).scale.set(1, 1, 0.84);
      add(hand, new THREE.SphereGeometry(0.2, 14, 10), M.glove, 0, 0, 0).scale.set(0.92, 1, 1.1);
      add(fore, rbox(0.04, 0.17, 0.34), M.gloveP, 0.235, ARM_FORE - 0.06, 0);
      add(fore, rbox(0.04, 0.11, 0.09), M.knuck, 0.255, ARM_FORE - 0.06, s * 0.13);
      buildHand(hand, M, s, add, !crew && s > 0 && options.weapon !== false);
      for (const m of hand.userData.segs || []) meshes.push(m);
      hand.scale.setScalar(HAND_S);

      const delt = oneCloth ? null : add(root, deltGeo(), M.uni, 0, 0, 0);
      return { s, up, fore, hand, pocket, delt, clav, upBind, sh: V(s * SHOULDER_X, SHOULDER_Y, 0) };
    });

    const role = options.role || 'infantry';
    // vũ khí cầm tay: options.weapon = khoá trong WEAPONS ('rifle'...), true = 'rifle', false = tay không; mặc định bộ binh cầm súng trường
    // Súng trường là cấu hình mặc định của lính thường. Súng phóng lựu là vũ khí chuyên biệt,
    // phải được gán rõ bằng options.weapon = 'gl' (nếu mọi người đều cầm GL, đội hình vừa
    // sai biên chế vừa có silhouette nặng đầu, che gần hết ngực/mặt ở góc nhìn chính diện).
    const weapon = options.weapon === undefined ? (role === 'infantry' ? 'rifle' : null) : options.weapon === true ? 'rifle' : (options.weapon || null);
    let rifle = null;
    if (weapon && WEAPONS[weapon]) {
      const from = meshes.length;
      rifle = WEAPONS[weapon].build(M, add);
      torso.add(rifle);
      for (let i = from; i < meshes.length; i++) meshes[i].castShadow = true;
    }
    for (const m of meshes) {
      m.userData.crewRole = role;
      m.renderOrder = options.renderOrder || 12;
      if (crew && !m.material.transparent) { m.material.transparent = true; m.material.opacity = 1; }
    }
    if (crew && !M.dead.transparent) { M.dead.transparent = true; M.dead.opacity = 1; }
    // gộp lưới: bộ binh -> lưới skinned ~20 lượt vẽ; kíp lái -> gộp theo khớp (~100, giữ được ẩn / hiện từng cánh tay,
    // tia trúng đạn chính xác trên lưới). options.bake = false để soi từng mảnh khi chỉnh hình
    // thẻ tên giữ vật liệu kim loại riêng (gộp lưới thì bị trung bình độ bóng với chi tiết khác, mất ánh kim); xích + thẻ + khoen gộp một lượt vẽ, không đổ bóng
    if (tagMeshes.length) {
      if (!GEO.dogtagAll) {
        let nv = 0; const items = tagMeshes.map(m => { m.updateMatrix(); const g = m.geometry.index ? m.geometry : null, c = m.geometry.clone().applyMatrix4(m.matrix); nv += c.attributes.position.count; return c; });
        const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), idx = []; let ov = 0;
        for (const c of items) {
          const n = c.attributes.position.count; pos.set(c.attributes.position.array, ov * 3); nor.set(c.attributes.normal.array, ov * 3);
          if (c.index) for (const i of c.index.array) idx.push(ov + i); else for (let i = 0; i < n; i++) idx.push(ov + i);
          ov += n;
        }
        const G = new THREE.BufferGeometry();
        G.setAttribute('position', new THREE.BufferAttribute(pos, 3)); G.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); G.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        G.setIndex(idx); G.userData.shared = true; GEO.dogtagAll = G;
      }
      const mat = tagMeshes[0].material;
      for (const m of tagMeshes) { m.parent.remove(m); const k = meshes.indexOf(m); if (k >= 0) meshes.splice(k, 1); }
      const merged = add(chest, GEO.dogtagAll, mat, 0, 0, 0);
      merged.castShadow = false; merged.userData.nearOnly = true;
      tagMeshes.length = 0; tagMeshes.push(merged);
    }
    const keepM = new Set(arms.map(a => a.delt).filter(Boolean).concat(tagMeshes));
    let lod = null;
    if (options.bake === false) { /* giữ nguyên từng mảnh */ }
    else if (options.bake === 'group' || crew) bakeFigure({ root, meshes }, keepM);
    else {
      // ống vai (đổi tỉ lệ mỗi khung, giữ lưới thường) không được dùng chung vật liệu với lưới skinned: three r128 dùng chung
      // một shader cho mỗi vật liệu -> lưới skinned dùng nhầm shader không skinning (vải đứng yên ở tư thế gốc)
      for (const a of arms) if (a.delt) a.delt.material = M.uniDelt || (M.uniDelt = M.uni.clone());
      let cacheKey = null;
      try { cacheKey = team + '|' + BIOME + '|' + weapon + '|' + JSON.stringify(options); } catch (e) { /* tuỳ chọn không tuần tự hoá được: dựng riêng */ }
      lod = bakeSkinned({ root, meshes, cacheKey }, keepM);
    }

    const soak = [[Math.PI - 0.62, 1.2, 1.37, 0.05, 1.3], [-Math.PI / 2 - 0.5, 0.95, 1.41, 0.35, 1.1]].map(([t0, len, r, y, h]) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r + 0.02, h, 14, 1, true, t0, len), M.soak);
      m.position.set(0, y, 0); m.scale.set(1, 1, 0.655);
      m.renderOrder = (options.renderOrder || 12) + 0.5;
      m.visible = false; m.userData.crewRole = role;
      chest.add(m);
      return m;
    });

    return {
      root, torso, hips, chest, head, arms, legs, meshes, M, soak, lod, spine: oneCloth, rifle, weapon: rifle ? weapon : null,
      team,
      rise: 0, bend: 0, twist: 0, roll: 0, look: 0, lookP: 0,
      t: Math.random() * 10,
      isDead: false, isCharred: false,
      // Điểm mốc khớp chuẩn
      joints: {
        leftShoulder: arms[0].sh,
        rightShoulder: arms[1].sh,
        headBase: V(0, 4.16, 0.04),
        pelvisCenter: V(0, -1.15, 0.04)
      }
    };
  }

  // ---------- CHUẨN HÓA ĐỘNG HỌC CÁNH TAY & BÀN TAY (IK) ----------
  const _d = V(0, 0, 0), _x = V(0, 0, 0), _z = V(0, 0, 0), _m = new THREE.Matrix4();

  function aim(obj, from, to, xHint) {
    _d.subVectors(to, from);
    const L = _d.length();
    obj.position.copy(from);
    if (L < 1e-5) return;
    _d.multiplyScalar(1 / L);
    if (!xHint) { obj.quaternion.setFromUnitVectors(UP, _d); return; }
    _x.copy(xHint).addScaledVector(_d, -xHint.dot(_d));
    if (_x.lengthSq() < 1e-6) { obj.quaternion.setFromUnitVectors(UP, _d); return; }
    _x.normalize();
    _z.crossVectors(_x, _d);
    obj.quaternion.setFromRotationMatrix(_m.makeBasis(_x, _d, _z));
  }

  /**
   * Giải 2 khớp cánh tay (vai -> khuỷu -> bàn tay) bám vào mục tiêu
   * @param {Object} F - Thực thể binh sĩ (từ buildFigure)
   * @param {Object} arm - Cánh tay (F.arms[0] tay trái, F.arms[1] tay phải)
   * @param {THREE.Vector3} targetW - Vị trí điểm nắm tay trong thế giới
   * @param {THREE.Vector3} poleL - Điểm hướng khuỷu tay bẻ ra (hệ root của nhân vật)
   * @param {THREE.Vector3|null} gripAxisW - Trục cán cầm nắm trong thế giới (để xoay bàn tay chuẩn)
   * @param {THREE.Vector3|null} gripPalmW - Pháp tuyến lòng bàn tay mong muốn; khóa độ xoắn quanh cán cho từng loại vũ khí
   */
  // Xương đòn chỉ nhận một phần chuyển động cánh tay (nhịp vai-bả vai), không sao chép cả xoắn dọc của xương cánh tay.
  // 0,75 cũ làm chỏm vai quay gần như cánh tay nên tay áo phồng/xoắn khi đổi loại vũ khí.
  const CLAV_FOLLOW = 0.36, _cq = new THREE.Quaternion(), _rq = new THREE.Quaternion(), _clq = new THREE.Quaternion();
  function solveArm(F, arm, targetW, poleL, gripAxisW, gripPalmW = null, palmK = 0.32) {
    const S = F.chest.localToWorld(arm.sh.clone());
    F.root.worldToLocal(S);
    const G = F.root.worldToLocal(targetW.clone());
    const reach = G.clone().sub(S).normalize();

    let HB = null, T = G;
    const invRoot = new THREE.Matrix4().copy(F.root.matrixWorld).invert();
    const axG = gripAxisW ? gripAxisW.clone().transformDirection(invRoot).multiplyScalar(arm.s < 0 ? -1 : 1).normalize() : null;
    const palmG = gripPalmW ? gripPalmW.clone().transformDirection(invRoot).normalize() : null;
    // hướng bàn tay lấy từ ref: lượt đầu là vai -> điểm nắm, lượt hai là khuỷu -> điểm nắm (bàn tay nối tiếp cẳng tay, cổ tay không gập gắt, không hở khe với tay áo)
    const handFrame = (ref) => {
      const ax = axG;
      // trục cuộn ngón = TRỤC CÁN (ưu tiên tuyệt đối); hướng bàn tay = phần hướng vươn tay vuông góc với cán.
      // Cán gần song song hướng vươn (tay đỡ ốp nòng: vươn dọc theo nòng) -> nghiêng bàn tay lên ôm từ dưới-bên, ngón quấn
      // ngang qua nòng (trước đây hz bị ép vuông góc hướng vươn: ngón duỗi thẳng dọc nòng, bàn tay ngửa như đỡ hờ)
      const hz = ax.clone();
      const hy = ref.clone().addScaledVector(hz, -ref.dot(hz));
      const lp = hy.length();
      if (lp < 0.7) {
        const up = V(0, 1, 0).addScaledVector(hz, -hz.y), side = V().crossVectors(hz, V(0, 1, 0)).multiplyScalar(-arm.s);
        hy.addScaledVector(up.normalize(), (0.7 - lp) * 1.6).addScaledVector(side, (0.7 - lp) * 0.6);
      }
      hy.normalize();
      // Trục cán chỉ khóa được hai bậc tự do. Vector palm của từng điểm nắm khóa nốt độ xoắn quanh cán,
      // nhưng chỉ ảnh hưởng vừa phải để cổ tay vẫn nối thẳng với cẳng tay thay vì bị ép theo vũ khí 100%.
      if (palmG) {
        const px = palmG.clone().addScaledVector(hz, -palmG.dot(hz));
        if (px.lengthSq() > 1e-6) {
          px.normalize();
          const wantY = V().crossVectors(hz, px).normalize();
          if (wantY.dot(ref) < 0) wantY.multiplyScalar(-1);
          hy.multiplyScalar(1 - palmK).addScaledVector(wantY, palmK).normalize();
        }
      }
      const hx = V().crossVectors(hy, hz).normalize();
      HB = { hx, hy, hz };
      T = G.clone().addScaledVector(hy, -0.48 * HAND_S).addScaledVector(hx, 0.3 * HAND_S);
    };
    if (axG) handFrame(reach);
    const a = ARM_UP, b = ARM_FORE;
    let Tc, pv, E;
    const solveJoint = () => {
      const ST = T.clone().sub(S);
      let d = ST.length();
      const dir = d > 1e-5 ? ST.clone().multiplyScalar(1 / d) : V(0, -1, 0);
      // Luôn chừa một góc gập nhỏ ở khuỷu. Duỗi sát 180° làm tay khóa cứng và dễ lật mặt phẳng khuỷu
      // chỉ vì điểm nắm dịch vài milimét giữa hai pose/vũ khí.
      d = Math.max(Math.abs(a - b) + 0.08, Math.min(a + b - 0.12, d));
      Tc = S.clone().addScaledVector(dir, d);
      const cosA = (a * a + d * d - b * b) / (2 * a * d), sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
      pv = poleL.clone().sub(S);
      pv.addScaledVector(dir, -pv.dot(dir));
      if (pv.lengthSq() < 1e-6) pv.set(0, -1, 0);
      pv.normalize();
      // Khuỷu người không bẻ xuyên qua mặt phẳng giữa thân. Giữ một thành phần hướng ra ngoài làm nghiệm
      // liên tục khi nòng súng đi qua gần đường vai-cổ tay.
      const lateral = V(arm.s, -0.12, 0), ld = lateral.dot(dir);
      lateral.addScaledVector(dir, -ld);
      if (lateral.lengthSq() > 1e-6) {
        lateral.normalize();
        const sideK = pv.dot(lateral);
        if (sideK < 0.08) pv.addScaledVector(lateral, 0.08 - sideK).normalize();
      }
      E = S.clone().addScaledVector(dir, a * cosA).addScaledVector(pv, a * sinA);
    };
    solveJoint();
    if (axG) { handFrame(G.clone().sub(E).normalize()); solveJoint(); }

    aim(arm.up, S, E, pv);
    if (arm.clav && arm.upBind) {
      arm.clav.position.copy(arm.sh);
      // xoay đủ (cả vặn quanh trục tay) so với tư thế gốc, trong hệ ngực: chỉ lấy hướng tay thì bỏ sót phần vặn -> vải bắp tay xoắn phình
      _cq.copy(F.torso.quaternion).multiply(F.chest.quaternion).invert();
      _clq.copy(_cq).multiply(arm.up.quaternion).multiply(_rq.copy(arm.upBind).invert());
      arm.clav.quaternion.identity().slerp(_clq, CLAV_FOLLOW);
    }
    if (arm.delt) {
      const A = F.root.worldToLocal(F.chest.localToWorld(V(arm.s * 1.26, 2.88, 0.02)));
      const B = S.clone().addScaledVector(E.clone().sub(S).normalize(), 0.75);
      const dist = B.sub(A), L = dist.length();
      arm.delt.position.copy(A);
      arm.delt.quaternion.setFromUnitVectors(UP, dist.multiplyScalar(1 / Math.max(1e-4, L)));
      arm.delt.scale.set(1, Math.max(0.2, L), 1);
    }
    if (arm.pocket) {
      const lat = V(arm.s, 0.35, 0).applyQuaternion(arm.up.quaternion.clone().invert());
      arm.pocket.rotation.y = Math.atan2(-lat.z, lat.x);
    }
    aim(arm.fore, E, Tc, pv);
    if (HB) {
      arm.hand.position.copy(Tc);
      arm.hand.quaternion.setFromRotationMatrix(_m.makeBasis(HB.hx, HB.hy, HB.hz));
    } else {
      aim(arm.hand, Tc, Tc.clone().addScaledVector(Tc.clone().sub(E).normalize(), 1), V(arm.s, 0, 0));
    }
  }

  // ---------- CHUẨN HÓA ĐIỂM NEO CẦM NẮM (GRIP ANCHOR) ----------
  /**
   * Tạo cấu trúc điểm neo cầm nắm gắn liền trên các vật thể khác (vô-lăng, tay cầm súng, quai nắp, v.v.).
   * `palm` là tùy chọn để mã cũ chỉ có position/axis vẫn hoạt động; vũ khí mới nên khai báo đủ cả ba trục.
   */
  function createGripAnchor(options = {}) {
    return {
      position: options.position || V(0, 0, 0),
      axis: options.axis || V(0, 0, 1),
      palm: options.palm || null,
      poleHint: options.poleHint || null
    };
  }

  /**
   * Gán tay nhân vật bám dính vào một điểm neo bất kỳ
   */
  function attachHandToAnchor(F, armSide, anchor, defaultPole = null) {
    const arm = armSide === 'left' || armSide === -1 ? F.arms[0] : F.arms[1];
    const pole = anchor.poleHint || defaultPole || V(arm.s * 3.5, 1.2, -1.0);
    solveArm(F, arm, anchor.position, pole, anchor.axis, anchor.palm);
  }

  // ---------- CHUẨN HÓA QUỸ ĐẠO & CHUYỂN ĐỘNG NỘI SUY (TRAJECTORY) ----------
  /**
   * Lấy vị trí trên đường cong uốn tự nhiên giữa hai mốc (dùng cho tay vươn tới đồ vật)
   * @param {THREE.Vector3} start - Điểm xuất phát
   * @param {THREE.Vector3} end - Điểm đích
   * @param {number} t - Tiến độ từ 0 đến 1
   * @param {number} arcHeight - Độ vồng cao của đường cong
   * @param {THREE.Vector3|null} sideOffset - Độ uốn tránh chướng ngại vật sang ngang
   */
  function sampleTrajectory(start, end, t, arcHeight = 0.5, sideOffset = null) {
    const clampedT = c01(t);
    const smoothT = sm(clampedT);
    const pt = start.clone().lerp(end, smoothT);
    const curveLift = Math.sin(clampedT * Math.PI) * arcHeight;
    pt.y += curveLift;
    if (sideOffset) {
      pt.addScaledVector(sideOffset, Math.sin(clampedT * Math.PI));
    }
    return pt;
  }

  /**
   * Chuẩn hóa nhịp thở và cử động nhỏ của cơ thể
   */
  function applyBreathing(F, time, rate = 1.8, amplitude = 0.02) {
    // thở = ngực nâng / ưỡn rất nhẹ (~0,4°, ~2 mm) chứ không phóng to: phóng chest kéo theo đầu, mũ, giáp, khớp vai -> cả người phồng xẹp
    const cycle = Math.sin(time * rate), k = amplitude / 0.025;
    F.chest.scale.set(F.chest.userData.baseScaleX || 1, 1, 1);
    F.chest.rotation.x -= 0.007 * k * cycle;
    F.chest.position.y += 0.015 * k * cycle;
  }

  /**
   * Chuẩn hóa lực quán tính tác động lên người lính khi đổi hướng / dằn xóc
   */
  function applyInertia(F, accelVector, dt = 0.016) {
    if (!accelVector) return;
    const targetRoll = -accelVector.x * 0.08;
    const targetPitch = accelVector.z * 0.08;
    F.roll += (targetRoll - F.roll) * Math.min(1, dt * 10);
    F.bend += (targetPitch - F.bend) * Math.min(1, dt * 10);
    F.torso.rotation.z = F.roll;
    F.torso.rotation.x = F.bend;
  }

  /**
   * Điều khiển xoay hướng nhìn của đầu
   */
  function lookAt(F, targetW) {
    if (!F || !F.head || !F.chest) return;
    const headW = F.head.localToWorld(V(0, 0.72, 0));
    const toTarget = targetW.clone().sub(headW).normalize();
    const invChest = new THREE.Matrix4().copy(F.chest.matrixWorld).invert();
    const localDir = toTarget.transformDirection(invChest);
    // Giới hạn góc liếc tự nhiên của cổ người thật
    const yaw = Math.max(-0.65, Math.min(0.65, Math.atan2(-localDir.x, -localDir.z)));
    const pitch = Math.max(-0.35, Math.min(0.35, Math.asin(Math.max(-0.99, Math.min(0.99, localDir.y)))));
    F.head.rotation.y = THREE.MathUtils.lerp(F.head.rotation.y, yaw, 0.15);
    F.head.rotation.x = THREE.MathUtils.lerp(F.head.rotation.x, pitch, 0.15);
  }

  /**
   * Chuẩn hóa hộp va chạm bao quanh cơ thể để tính bắn trúng / vật lý
   */
  function getHitboxes(F) {
    return [
      { name: 'head', center: F.head.localToWorld(V(0, 0.72, 0)), radius: 0.86 },
      { name: 'chest', center: F.chest.localToWorld(V(0, 2.0, 0)), size: V(2.4, 2.2, 1.8) },
      { name: 'pelvis', center: F.hips.localToWorld(V(0, -1.15, 0.04)), size: V(2.6, 1.2, 2.0) }
    ];
  }

  
  /**
   * Mô phỏng các chu kỳ chuyển động cơ thể của người lính
   * @param {Object} F - Thực thể binh sĩ (từ buildFigure)
   * @param {string} type - 'idle' | 'walk' | 'run' | 'aim' | 'crouch'
   * @param {number} time - Thời gian (giây)
   * @param {number} speed - Hệ số tốc độ
   */
  // Quy ước góc: torso.rotation.x < 0 cúi người ra trước; leg.rotation.x > 0 đưa đùi ra trước (-z); knee.rotation.x < 0 gập gối (cẳng chân ra sau);
  // góc bàn chân so với đất = hông + gối + cổ chân (0 = đế phẳng, > 0 mũi giày hếch lên)
  const G = (x, s) => Math.exp(-(x / s) * (x / s));
  const wrapPI = a => Math.atan2(Math.sin(a), Math.cos(a));
  const _p = V(0, 0, 0), _q = V(0, 0, 0);
  const SOLE = [V(0, -ANKLE_H, 0.45), V(0, -ANKLE_H, -0.3), V(0, -ANKLE_H, -1.05), V(0, -ANKLE_H + 0.06, -1.45)];

  function setLeg(L, hip, knee, foot, splay = 0.035) {
    L.leg.rotation.set(hip, 0, L.sx * splay);
    L.knee.rotation.set(knee, 0, 0);
    L.ankle.rotation.set(foot - hip - knee, 0, 0);
  }

  // hạ / nâng cả thân để đế giày thấp nhất chạm đúng FOOT_Y (hệ root) — chân luôn bám đất ở mọi tư thế
  function plantFeet(F, lift = 0) {
    F.root.updateMatrixWorld(true);
    let minY = Infinity;
    for (const L of F.legs) {
      for (const s of SOLE) {
        _p.copy(s); L.ankle.localToWorld(_p); F.root.worldToLocal(_p);
        if (_p.y < minY) minY = _p.y;
      }
      _p.set(0, -0.1, -0.62); L.knee.localToWorld(_p); F.root.worldToLocal(_p);   // gối quỳ chạm đất
      if (_p.y < minY) minY = _p.y;
    }
    const dy = FOOT_Y - minY + lift;
    F.hips.position.y += dy; F.torso.position.y += dy;
    F.root.updateMatrixWorld(true);
  }

  // súng (hệ torso) + hai tay nắm súng
  const RIFLE_POSE = {
    low: { p: V(0.55, 1.35, -2.0), r: [-0.42, 0.45, 0.3] },
    // sẵn sàng chiến đấu (low ready): báng tì hốc vai, nòng chúc ~35° ra trước-xuống, nâng lên ngắm chỉ trong tích tắc
    ready: { p: V(-0.5, 1.85, -2.62), r: [-0.58, 0.52, 0.12] },   // nòng ~32° xuống so với đất (đã bù độ đổ người), chéo thân ~17°
    port: { p: V(0.45, 1.7, -1.9), r: [-0.05, 0.85, 0.55] },
    // giải bằng ràng buộc trên chính mô hình (probe): mép dưới đệm báng tì hốc vai phải ngoài tấm giáp (nhún vai), nòng chĩa
    // thẳng trước; đầu đưa ra trước / sang phải + cúi nghiêng áp má để mắt phải nằm đúng trục kính ngắm (lệch ~1 mm)
    aim: { p: V(-0.151, 3.658, -2.968), r: [0.1, 0.5, 0.0] }
  };
  // Bảng vũ khí bộ binh: build (dựng lưới, gốc tại tay cầm chính, nòng -z), grip (điểm nắm tay phải / trái + trục cán, hệ vũ khí),
  // poses (thế cầm trong hệ torso: low = súng chúc thấp, port = chéo ngực khi chạy, aim = tì vai ngắm).
  // Thêm vũ khí mới (súng bắn tỉa, ống phóng chống tăng vác vai, súng phóng lựu, ống cối...) = thêm một mục với đủ 3 thế cầm.
  const WEAPONS = { gl: { build: buildGL, grip: GL, poses: RIFLE_POSE, name: 'Súng phóng lựu 40 mm ổ quay 6 viên', ammo: 'gl40' }, rifle: { build: buildRifle, grip: RIFLE, poses: RIFLE_POSE } };
  const _im = new THREE.Matrix4();
  const _inv = (o) => _im.copy(o.matrixWorld).invert();

  // tay buông / vung theo nhịp bước (không cầm súng)
  function swingArms(F, swing, bend) {
    F.root.updateMatrixWorld(true);
    for (const arm of F.arms) {
      const sw = swing[arm.s < 0 ? 0 : 1];
      const T = F.chest.localToWorld(V(arm.s * (1.75 - bend * 0.25), -1.25 + bend * 1.6 + Math.abs(sw) * 0.35, 0.05 - sw * (1.5 + bend)));
      const pole = F.chest.localToWorld(V(arm.s * 2.4, -0.5, 3.0)).applyMatrix4(_inv(F.root));
      solveArm(F, arm, T, pole, null);
    }
  }

  // ---------- DÁNG ĐI / CHẠY THEO SỐ LIỆU SINH CƠ HỌC ----------
  // Góc khớp (độ) theo % chu kỳ bước, bắt đầu lúc gót chân trái chạm đất. Đi bộ: Winter (1991) / Perry; chạy: Novacheck (1998).
  // hip: gập hông (+ đùi ra trước), knee: gập gối, ankle: gập mu (+ mũi chân hếch lên).
  const D2R = Math.PI / 180;
  function periodic(keys) {
    const P = keys.map(k => k[0] / 100), Vv = keys.map(k => k[1] * D2R), n = keys.length;
    return (ph) => {
      ph -= Math.floor(ph);
      let i = n - 1;
      for (let j = 0; j < n; j++) if (P[j] <= ph) i = j;
      const i0 = (i - 1 + n) % n, i2 = (i + 1) % n, i3 = (i + 2) % n;
      const t0 = P[i], t1 = i + 1 < n ? P[i + 1] : P[0] + 1, u = (ph - t0) / Math.max(1e-6, t1 - t0);
      const a = Vv[i0], b = Vv[i], c = Vv[i2], d = Vv[i3];
      // Catmull-Rom (đường cong mượt đi qua các mốc)
      return 0.5 * ((2 * b) + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u * u * u);
    };
  }
  // Quỹ đạo thay vì đường cong góc khớp: mỗi dáng khai báo sải, hông, nhún; bàn chân bám đất đúng tốc độ tiến rồi giải 2 khớp ra góc hông / gối.
  // (Đường cong góc + kéo thân cho chân chạm đất làm thân nảy theo từng bước và hông lắc, trông như nhảy chân sáo.)
  // duty: tỉ lệ chu kỳ chân chạm đất; S: sải cả chu kỳ (đv) = speed * cycle; hh: độ cao khớp hông trên đất (gối luôn chùng, trọng tâm thấp, đi chắc);
  // bob: biên độ nhấp nhô; clear: độ nhấc bàn chân; pitch: góc bàn chân theo % chu kỳ (+ hếch mũi)
  const GAITS = {
    walk: {
      cycle: 1.06, speed: 8.4, duty: 0.62, hh: 6.97, bob: 0.18, clear: 0.3, lean: -0.12, yaw: 4, roll: 1.8, shift: 0.07, wide: -0.012, toeOut: 0.12, arm: 0.9, armBend: 0.15, gun: 'ready', spine: 0.03, spineA: 0.025,
      twist: 8, sway: 3.4, nod: 2.6, sh: 0.1, shY: 0.07, gs: 0.05, gb: 0.06, gRoll: 2.2, scan: 0.3,
      pitch: periodic([[0, 14], [7, 0], [34, 0], [50, -13], [62, -30], [72, -30], [84, -6], [94, 10]])
    },
    // đi tuần chiến thuật: thấp người, thân đổ trước, bước lướt êm, súng sẵn sàng
    patrol: {
      cycle: 1.3, speed: 6.05, duty: 0.66, hh: 6.72, bob: 0.06, clear: 0.26, lean: -0.26, yaw: 3, roll: 1.2, shift: 0.05, wide: 0.0, toeOut: 0.14, arm: 0.6, armBend: 0.3, gun: 'ready', spine: 0.04, spineA: 0.015,
      twist: 5, sway: 2.4, nod: 1.8, sh: 0.06, shY: 0.04, gs: 0.03, gb: 0.03, gRoll: 1.4, scan: 0.5,
      pitch: periodic([[0, 8], [8, 0], [42, 0], [56, -13], [66, -24], [76, -22], [88, -2], [96, 6]])
    },
    // chạy mang trang bị: đổ người, sải nặng, đạp đất mạnh; thân thấp nhất giữa pha trụ, cao nhất lúc bay
    run: {
      cycle: 0.74, speed: 19, duty: 0.38, hh: 6.42, bob: -0.2, clear: 1.25, lean: -0.36, yaw: 8, roll: 2.8, shift: 0.05, wide: -0.02, toeOut: 0.08, arm: 1.6, armBend: 1.05, gun: 'ready', spine: 0.06, spineA: -0.035,
      twist: 13, sway: 4.5, nod: 3.4, sh: 0.2, shY: 0.13, gs: 0.2, gb: 0.15, gRoll: 7, scan: 0.1,
      pitch: periodic([[0, 6], [6, 0], [22, -6], [38, -36], [52, -50], [70, -30], [88, -5], [96, 3]])
    }
  };
  // tốc độ tiến (đv/giây): đúng bằng tốc độ lùi của chân trụ trong quỹ đạo nên game dời gốc theo số này thì bàn chân không trượt
  const GAIT_SPEED = { walk: GAITS.walk.speed, patrol: GAITS.patrol.speed, run: GAITS.run.speed };

  // nhiễu mượt nhỏ cho cử động sống (lắc người, liếc mắt)
  const wob = (t, a, b, c) => Math.sin(t * a) * 0.5 + Math.sin(t * b + 1.3) * 0.3 + Math.sin(t * c + 2.1) * 0.2;

  const POSE_KEYS = ['lH', 'lHz', 'lHy', 'lK', 'lA', 'rH', 'rHz', 'rHy', 'rK', 'rA', 'px', 'pRy', 'pRz', 'lift', 'tRx', 'tRy', 'tRz',
    'chRx', 'chRy', 'chRz', 'gx', 'gy', 'gz', 'gRoll', 'shLy', 'shLz', 'shRy', 'shRz', 'hRx', 'hRy', 'hRz', 'gLow', 'gPort', 'gAim', 'gReady', 'gYaw', 'gPitch', 'aL', 'aR', 'aBend', 'elb', 'lAy', 'rAy'];
  const newPose = () => { const o = {}; for (const k of POSE_KEYS) o[k] = 0; return o; };

  // điểm thấp nhất của đế (so với cổ chân) khi bàn chân nghiêng th
  const soleLow = th => { const c = Math.cos(th), sn = Math.sin(th); let m = Infinity; for (const P of SOLE) m = Math.min(m, P.y * c - P.z * sn); return m; };
  // vị trí cổ chân (z trước âm, y so với đất) và góc bàn chân tại pha p của chân
  function footPath(G, p) {
    p -= Math.floor(p);
    const S = G.speed * G.cycle, b = G.duty;
    const stance = (q) => {
      const th = G.pitch(q), P = SOLE[th > 0 ? 0 : 2], c = Math.cos(th), sn = Math.sin(th);
      return { z: S * (q - b / 2) + P.z - (P.y * sn + P.z * c), y: -soleLow(th), th };   // điểm tựa (gót / mũi) đứng yên so với đất
    };
    if (p < b) return stance(p);
    const A = stance(b), B = stance(0), u = (p - b) / (1 - b), u2 = u * u, u3 = u2 * u;
    // Hermite: rời đất và tiếp đất với đúng vận tốc chân trụ (không giật khi đổi pha)
    const m = S * (1 - b);
    const z = (2 * u3 - 3 * u2 + 1) * A.z + (u3 - 2 * u2 + u) * m + (-2 * u3 + 3 * u2) * B.z + (u3 - u2) * m;
    const th = G.pitch(p), arc = Math.pow(Math.sin(Math.PI * Math.pow(u, 0.72)), 1.3);
    const y = A.y + (B.y - A.y) * u + G.clear * arc;
    return { z, y: Math.max(y, -soleLow(th) + 0.015), th };
  }
  function gaitPose(o, G, ph) {
    const Hy = G.hh + G.bob * Math.cos(4 * Math.PI * (ph - G.duty / 2));
    let low = Infinity;
    for (const L of [0, 1]) {
      const key = L ? 'r' : 'l', sx = L ? 1 : -1, f = footPath(G, ph + L * 0.5);
      const dy = Hy - f.y, d = Math.min(THIGH_L + SHIN_L - 0.02, Math.hypot(f.z, dy));
      const al = Math.atan2(-f.z, dy), be = Math.acos(c01((THIGH_L * THIGH_L + d * d - SHIN_L * SHIN_L) / (2 * THIGH_L * d)));
      const K = Math.PI - Math.acos(Math.max(-1, Math.min(1, (THIGH_L * THIGH_L + SHIN_L * SHIN_L - d * d) / (2 * THIGH_L * SHIN_L))));
      const H = al + be;
      o[key + 'H'] = H; o[key + 'K'] = K; o[key + 'A'] = f.th - H + K;
      // xoè mũi chân chủ yếu ở cổ chân: xoay cả đùi ra ngoài thì lúc gập gối cẳng chân quặt vào, bàn chân vung bắt chéo đường giữa (chân chữ X)
      o[key + 'Hz'] = G.wide + 0.045 * sm((K - 0.25) / 0.6); o[key + 'Hy'] = -sx * G.toeOut * 0.25;   // chân vung dạng nhẹ theo độ gập gối: bàn chân đi thẳng, không quặt vào đường giữa o[key + 'Ay'] = -sx * G.toeOut * 0.75;
      low = Math.min(low, f.y + soleLow(f.th));
    }
    o.lift = Math.max(0, low);                    // pha bay: chân không chạm đất
    const c = Math.cos(2 * Math.PI * ph), s2 = Math.sin(2 * Math.PI * ph);
    o.pRy = -G.yaw * D2R * c;                    // hông bên chân bước ra trước xoay theo
    o.pRz = -G.roll * D2R * s2;                  // hông bên chân đang vung hạ xuống
    o.px = -G.shift * s2;                        // khung chậu dồn sang chân trụ
    // THÂN TRÊN: bụng xoay ít, ngực xoay nhiều ngược hông; thân đổ về chân trụ; mỗi lần chân chạm đất ngực gập nhẹ rồi ngẩng lại (đỡ tải);
    // đầu giữ thăng bằng, quan sát chậm hai bên; hai vai đưa trước / sau và nhấp xuống theo chân trụ
    const hit = q => { const d = (((ph - q) % 0.5) + 0.5) % 0.5; return Math.exp(-d / 0.09) * sm(d / 0.02); };   // xung đỡ tải sau khi chân chạm đất
    const scan = G.scan * Math.sin(ph * 2 * Math.PI / 6.5) * (0.75 + 0.25 * Math.sin(ph * 2 * Math.PI / 2.9));
    o.tRy = 0.9 * G.yaw * D2R * c + 0.18 * scan;
    o.tRz = 0.5 * G.roll * D2R * s2;
    o.tRx = G.lean + 0.3 * G.nod * D2R * hit(0.02);
    o.chRy = G.twist * D2R * c + 0.14 * scan;
    o.chRz = G.sway * D2R * s2;
    // lưng trên hơi gù (mang giáp, súng trước ngực); duỗi ra khi đứng trên chân trụ, gập vào lúc hai chân chạm đất
    o.chRx = -G.spine + G.spineA * Math.cos(4 * Math.PI * (ph - G.duty / 2)) - G.nod * D2R * hit(0.04) + 0.008 * Math.sin(ph * 2 * Math.PI / 2.4);
    // hai tay ôm súng: vai giữ vuông về trước, hông xoay thay (vai vặn theo bước thì tay đỡ co duỗi 25-82° mỗi bước, như vung tay không)
    if (G.gun) { o.chRy *= 0.25; o.tRy *= 0.45; o.chRz *= 0.6; o.tRz *= 0.7; }
    o.hRy = -0.9 * (o.tRy + o.chRy) + scan; o.hRx = -0.75 * (G.lean + o.chRx); o.hRz = -0.8 * (o.tRz + o.chRz);
    o.shLz = G.sh * c; o.shRz = -G.sh * c;       // vai đối chiều chân cùng bên
    o.shLy = -G.shY * Math.max(0, s2 > 0 ? 0 : -s2) + 0.3 * G.shY; o.shRy = -G.shY * Math.max(0, s2) + 0.3 * G.shY;   // hạ vai bên chân trụ
    o.aL = Math.sin(2 * Math.PI * (ph + 0.5) - 0.3) * G.arm; o.aR = -o.aL; o.aBend = G.armBend;
    o.gLow = G.gun === 'low' ? 1 : 0; o.gPort = G.gun === 'port' ? 1 : 0; o.gReady = G.gun === 'ready' ? 1 : 0; o.elb = o.gReady * 0.7;   // khuỷu mở ra ngoài, không kẹp sườn
    // súng nặng: trễ nhịp ~0,1 chu kỳ so với thân, lắc ngang theo bước, nòng vẫn giữ hướng và quét theo mắt
    const lag = 2 * Math.PI * (ph - 0.1);
    if (G.gun) { o.shLz *= 0.3; o.shRz *= 0.3; }   // vai không đánh trước / sau theo bước khi hai tay ôm súng
    o.gx = G.gs * Math.sin(lag); o.gy = -G.gb * Math.cos(2 * lag); o.gz = 0.5 * G.gb * Math.sin(2 * lag); o.gRoll = G.gRoll * D2R * Math.sin(lag);
    o.gYaw = -0.8 * o.tRy + 0.35 * scan + 0.4 * G.gs * Math.cos(lag); o.gPitch = 0.5 * G.nod * D2R * hit(0.08);
  }

  function idlePose(o, t) {
    // THẾ ĐỨNG NGHỈ CÓ CẢNH GIỚI: báng tì vai mềm (ready), nòng chúc ~35°, khuỷu mở, chân rộng bằng vai, chân trái trước. Thế low cũ ôm súng ngang bụng, khuỷu kẹp sườn, chân khép -> trông rụt rè.
    // Như vậy nòng không vô tình chĩa ngang đồng đội, vai/cổ bớt cứng và silhouette đọc rõ hơn;
    // khi có mục tiêu, state aim vẫn đưa báng lên vai trong khoảng chuyển pose ~0,3 giây.
    const w = (Math.sin(t * 0.5) * 0.6 + Math.sin(t * 0.17) * 0.4) * 0.5;
    o.lH = 0.17 + 0.02 * w; o.lK = 0.16; o.lA = 0.035; o.lHz = 0.075; o.lHy = 0.05; o.lAy = 0.07;
    o.rH = -0.09 - 0.02 * w; o.rK = 0.14; o.rA = 0.035; o.rHz = 0.085; o.rHy = -0.15; o.rAy = -0.19;
    o.px = -0.035 + 0.045 * w;
    o.pRy = -0.14; o.pRz = 0.014 * w;
    o.tRx = -0.05 + 0.008 * wob(t, 0.37, 0.61, 1.13); o.tRy = -0.18 + 0.018 * wob(t, 0.19, 0.41, 0.83); o.tRz = -0.008 * w;
    // đầu nhìn thẳng trước (bù thân xoay), đảo mắt chậm quan sát
    o.hRy = 0.2 + 0.14 * wob(t, 0.17, 0.29, 0.07); o.hRx = -0.025 + 0.025 * wob(t, 0.23, 0.47, 0.11); o.hRz = 0.008 * w;
    o.gReady = 1; o.elb = 1; o.gYaw = 0.018 * wob(t, 0.27, 0.51, 0.9); o.gPitch = 0.012 * wob(t, 0.33, 0.71, 1.2);
    o.aBend = 0.15;
    const br = Math.sin(t * 1.55), look = wob(t, 0.21, 0.37, 0.09);
    o.chRx = 0.02 - 0.012 * br + 0.01 * wob(t, 0.31, 0.53, 1.1); o.chRy = 0.05 * look; o.chRz = 0.012 * w;
    o.hRy += 0.16 * look; o.gYaw += 0.05 * look;
    o.shLy = o.shRy = 0.018 * br; o.gy = 0.012 * br;
  }

  function aimPose(o, t, kneel) {
    // thế bắn: chân trái trước, trọng tâm dồn trước; súng rung nhẹ theo nhịp thở & mạch (giữ thở)
    if (kneel) {
      o.lH = 1.62; o.lK = 1.62; o.lA = 0.0; o.lHz = 0.18; o.lHy = 0;
      o.rH = 0.08; o.rK = 1.5; o.rA = -2.84 - 0.08 + 1.5; o.rHz = 0.06; o.rHy = 0;
      o.pRy = -0.2; o.tRx = -0.12;
    } else {
      o.lH = 0.3; o.lK = 0.3; o.lA = 0.0; o.lHz = 0.1; o.lHy = 0.15;
      o.rH = -0.2; o.rK = 0.14; o.rA = 0.06; o.rHz = 0.1; o.rHy = -0.5;
      o.pRy = -0.3; o.px = -0.12; o.tRx = -0.1;
    }
    o.tRy = -0.5;
    o.gAim = 1;
    o.gYaw = 0.006 * wob(t, 0.9, 1.7, 3.1); o.gPitch = 0.008 * Math.sin(t * 1.6) + 0.004 * wob(t, 1.1, 2.3, 4.7);
    // Áp má nhẹ vào báng; góc cũ cúi 31° và nghiêng 23° làm cổ gãy quặp.
    o.hRx = -0.24; o.hRy = 0.04; o.hRz = -0.2;
    o.aBend = 0.15;
  }

  const SPINE_LOW = -0.75, SPINE_MID = 1.1, _sp = V(0, 0, 0);
  function applyPose(F, o) {
    const [L, R] = F.legs;
    for (const [Lg, k] of [[L, 'l'], [R, 'r']]) {
      // dạng / khép chân bù lại độ dồn hông để bàn chân đứng yên trên đất
      Lg.leg.rotation.set(o[k + 'H'], o[k + 'Hy'], Lg.sx * o[k + 'Hz'] - o.px / 6.9, 'YXZ');
      Lg.knee.rotation.set(-o[k + 'K'], 0, 0);
      Lg.ankle.rotation.set(o[k + 'A'], o[k + 'Ay'], 0);
    }
    F.hips.position.set(o.px, 0, 0); F.torso.position.set(o.px * 0.85, 0, 0);
    F.hips.rotation.set(0, o.pRy, o.pRz, 'YXZ');
    F.torso.rotation.set(o.tRx, o.tRy, o.tRz, 'YXZ');
    F.chest.rotation.set(o.chRx, o.chRy, o.chRz, 'YXZ');   // ngực vặn trên bụng: thân không còn một khối cứng
    // Cột sống có hai khớp thật: thắt lưng (L5) và giữa lưng (T10). Hệ toạ độ của torso / chest gốc tại ngang rốn nên phải bù vị trí để
    // quay quanh đúng khớp; quay cả hai quanh gốc chung thì thân chỉ nghiêng như một tấm ván, lưng không bao giờ cong.
    if (F.spine) {
      _sp.set(0, SPINE_LOW, 0); F.torso.position.y += SPINE_LOW; _sp.applyEuler(F.torso.rotation); F.torso.position.x -= _sp.x; F.torso.position.y -= _sp.y; F.torso.position.z -= _sp.z;
      _sp.set(0, SPINE_MID, 0).applyEuler(F.chest.rotation); F.chest.position.set(-_sp.x, SPINE_MID - _sp.y, -_sp.z);
    }
  }

  // KHỐI CỨNG SÚNG - THÂN: tư thế chỉ là toạ độ, không có gì ngăn báng đâm vào ngực / vai. Mỗi khung dò các điểm dọc báng, ốp, băng đạn
  // (hệ súng, bán kính r) với mặt thân áo thật, tấm giáp + túi đạn trước ngực, chỏm hai vai; đẩy cả khẩu ra theo độ lún lớn nhất, lặp 3 lần.
  // Tay giải IK sau bước này nên bám theo súng đã đẩy.
  const RIFLE_PROBES = [[0, 0.3, 2.5, 0.08], [0, -0.18, 2.5, 0.08], [0, 0.25, 2.0, 0.1], [0, -0.05, 2.0, 0.1], [0, 0.2, 1.5, 0.1], [0, 0.15, 1.0, 0.1],
    [0, 0.12, 0.4, 0.12], [0, -0.55, -0.25, 0.14], [0, 0.05, -0.9, 0.1], [0, 0.05, -1.6, 0.09]].map(q => [V(q[0], q[1], q[2]), q[3]]);
  const _pw = V(0, 0, 0), _pc = V(0, 0, 0), _push = V(0, 0, 0), _tmpP = V(0, 0, 0);
  function bodyPush(F, p, r, out, aimK) {
    out.set(0, 0, 0);
    const x = p.x, y = p.y, ax = Math.abs(x);
    if (p.z < 0.3 && y > -0.4 && y < 3.6) {
      const Rr = lerpTab(TORSO_PROF, y) * 1.02;
      if (ax < Rr) { const zs = torsoSurfZ(x, y, -1) - r; if (p.z > zs) out.z = Math.min(out.z, zs - p.z); }
      const yb = 0.14, yt = 2.76;   // tấm giáp trước (sau khi hạ VEST_DROP)
      if (ax < 1.3 && y > yb - r && y < yt + r) { const zp = -1.04 * VEST_Z / 0.96 - 0.12 + PLATE_BEND * (x / 1.25) * (x / 1.25) - r; if (p.z > zp) out.z = Math.min(out.z, zp - p.z); }
      if (ax < 0.8 && y > 0.2 - r && y < 1.1 + r) { const zq = -1.5 - r; if (p.z > zq) out.z = Math.min(out.z, zq - p.z); }   // túi đạn trước bụng
    }
    if (aimK < 0.5) for (const arm of F.arms) {   // chỏm vai (thế ngắm: báng cố ý tì vào hõm vai, bỏ qua)
      _tmpP.copy(p).sub(arm.sh); const d = _tmpP.length(), Rs = 0.62 + r;
      if (d < Rs && d > 1e-4) { const k = (Rs - d) / d; if (Math.abs(_tmpP.x * k) + Math.abs(_tmpP.y * k) + Math.abs(_tmpP.z * k) > out.length()) out.copy(_tmpP.multiplyScalar(k)); }
    }
    return out;
  }
  function rifleCollide(F, R, aimK = 0) {
    if (F.weapon == null && !F.rifle) return;
    F.root.updateMatrixWorld(true);
    for (let it = 0; it < 3; it++) {
      if (it) R.updateMatrixWorld(true);   // chỉ súng đổi chỗ, khỏi cập nhật lại cả người
      let best = 0; _push.set(0, 0, 0);
      for (const [q, r] of RIFLE_PROBES) {
        _pw.copy(q); R.localToWorld(_pw); _pc.copy(_pw); F.chest.worldToLocal(_pc);
        const o = bodyPush(F, _pc, r, _tmpP.clone(), aimK), L = o.length();
        if (L > best) { best = L; _push.copy(o); }
      }
      if (best < 1e-3) return;
      // đổi vector đẩy từ hệ ngực sang hệ cha của súng (torso)
      _pw.set(0, 0, 0); F.chest.localToWorld(_pw); _pc.copy(_push); F.chest.localToWorld(_pc); _pc.sub(_pw);
      _pw.copy(R.parent.getWorldPosition(V(0, 0, 0))); _pc.add(_pw); R.parent.worldToLocal(_pc);
      R.position.addScaledVector(_pc, 1.05);
    }
  }

  // súng: pha trộn các thế cầm (thấp / chéo ngực / ngắm) theo trọng số, cộng rung nhỏ
  const _gp = V(0, 0, 0);
  function holdRifleBlend(F, o) {
    const R = F.rifle, Wd = WEAPONS[F.weapon] || WEAPONS.rifle, Gp = Wd.grip, W = o.gLow + o.gPort + o.gAim + o.gReady || 1;
    _gp.set(0, 0, 0); let rx = 0, ry = 0, rz = 0;
    for (const [k, w] of [['low', o.gLow], ['port', o.gPort], ['aim', o.gAim], ['ready', o.gReady]]) {
      if (!w) continue;
      const P = Wd.poses[k] || RIFLE_POSE[k];
      _gp.addScaledVector(P.p, w / W); rx += P.r[0] * w / W; ry += P.r[1] * w / W; rz += P.r[2] * w / W;
    }
    R.visible = true;
    R.position.copy(_gp);
    // súng là con của torso: người đổ trước khi đi / chạy thì nòng chúc theo (36° -> 52° khi chạy, tay trái duỗi thẳng với xuống).
    // Bù độ nghiêng thân để góc nòng so với đất giữ nguyên ở mọi dáng; thế ngắm đã khoá báng nên không bù.
    const lean = (o.tRx + 0.6 * o.chRx) * (1 - o.gAim / W);
    R.rotation.set(rx + o.gPitch - lean, ry + o.gYaw, rz + o.gRoll, 'YXZ');
    // Khóa đệm báng vào hõm vai phải khi nâng súng. Trước đây chỉ hai bàn tay có IK,
    // còn báng hoàn toàn dựa vào tọa độ pose nên ở thế ngắm cách vai tới ~1.2 đơn vị (~15 cm).
    // Low-ready không khóa để người lính còn hạ súng tự nhiên; ready khóa mềm, aim khóa cứng.
    const buttLock = c01((o.gAim + 0.72 * o.gReady) / W);
    if (buttLock > 0 && Gp.butt) {
      F.root.updateMatrixWorld(true);
      const butt = R.localToWorld(Gp.butt.clone());
      // Hõm báng nằm ở phần trên cơ ngực/đầu vai, không phải tâm khớp vai.
      const pocket = F.chest.localToWorld(V(1.1, 3.0 + 0.45 * c01(o.gAim / W), -0.62));   // ngắm: báng đặt cao ngang xương đòn (như xạ thủ thật), đầu chỉ cúi nhẹ áp má   // trên mặt áo (z -0,15 cũ lún sâu trong vai, chỉ ẩn nhờ tay áo che)
      const delta = F.torso.worldToLocal(pocket).sub(F.torso.worldToLocal(butt));
      R.position.addScaledVector(delta, buttLock);
    }
    R.position.x += o.gx; R.position.y += o.gy; R.position.z += o.gz;     // súng nặng trễ nhịp so với thân
    if (!F.lod || F.lod.cur < 2) rifleCollide(F, R, o.gAim / W);   // ở xa không thấy, khỏi tốn CPU
    F.root.updateMatrixWorld(true);
    const ax = (v) => v ? v.clone().transformDirection(R.matrixWorld) : null;
    const rr = F.arms[1], ll = F.arms[0], ka = (o.gAim + 0.7 * o.gReady) / W;
    if (!ll.sh0) { ll.sh0 = ll.sh.clone(); rr.sh0 = rr.sh.clone(); }
    ll.sh.copy(ll.sh0); rr.sh.copy(rr.sh0);
    const kA = o.gAim / W; const kR = o.gReady / W; ll.sh.z -= 0.18 * kA + 0.06 * ka + 0.18 * kR; ll.sh.x += 0.06 * kA; rr.sh.y += 0.08 * kA;   // vai trái chỉ đưa trước khi tì má ngắm (thế sẵn sàng dùng chung 0,55 cũ -> vai dồn trước cả lúc đi)     // ngắm: co vai trái ra trước, nhún vai phải đỡ báng
    ll.sh.y += o.shLy; ll.sh.z += o.shLz; rr.sh.y += o.shRy; rr.sh.z += o.shRz;   // vai đưa trước / sau, nhấp theo bước
    // Điểm khuỷu là dữ liệu của từng vũ khí: súng nặng/rộng có thể mở khuỷu hơn, súng ngắn giữ sát sườn hơn.
    // Nội suy theo ready thay vì đẩy pole ra hàng chục centimet như công thức cũ, tránh nghiệm IK lật/gãy tay.
    const eK = c01(o.elb);
    const eR = (Gp.elbowR || V(2.75, 0.9, 0.75)).clone().lerp(Gp.elbowReadyR || V(3.1, 0.45, 0.45), eK);
    const eL = (Gp.elbowL || V(-2.35, 0.45, -0.4)).clone().lerp(Gp.elbowReadyL || V(-2.65, 0.05, -0.2), eK);
    solveArm(F, rr, R.localToWorld(Gp.gripR.clone()), F.chest.localToWorld(eR).applyMatrix4(_inv(F.root)), ax(Gp.axisR), ax(Gp.palmR), 0.88);   // báng cầm quyết định hướng tay phải: ngón về đầu súng, cổ tay gập bù
    // Thế sẵn sàng: tay đỡ trượt nhẹ về sau trên ốp; lượng trượt do từng vũ khí khai báo.
    solveArm(F, ll, R.localToWorld(Gp.gripL.clone().add(_gp.set(0, 0, (Gp.readySlideL || 0) * kR))), F.chest.localToWorld(eL).applyMatrix4(_inv(F.root)), ax(Gp.axisL), ax(Gp.palmL));
  }

  /**
   * Chuyển động toàn thân: đường cong khớp thật + pha trộn mượt giữa các trạng thái.
   * type: 'idle' | 'walk' | 'patrol' | 'run' | 'aim' | 'crouch'. Gọi mỗi khung với thời gian tuyệt đối (giây).
   * F._snap = true: nhảy thẳng tới tư thế (không pha trộn) — dùng khi chụp ảnh / dựng sẵn.
   * Sau khi gọi, F.gaitSpeed = tốc độ tiến (đv/giây) khớp sải chân để dời gốc nhân vật.
   */
  function animateMotion(F, type = 'idle', time = 0, speed = 1) {
    if (!F || !F.legs) return;
    const t = time * speed;
    // Lính xa được cập nhật thưa tới 1/8 khung. Giới hạn 0.1 cũ làm chu kỳ chân chậm hơn
    // chuyển động tịnh tiến, nên nhân vật xa trượt chân rõ rệt.
    const dt = F._tPrev === undefined ? 0 : Math.max(0, Math.min(0.25, t - F._tPrev));
    F._tPrev = t;
    const W = F._mw || (F._mw = { idle: 1 });
    // trọng số các trạng thái tiến dần về trạng thái đang chọn (~0,3 s)
    const k = F._snap ? 1 : 1 - Math.exp(-dt / 0.28);
    for (const m of ['walk', 'patrol', 'run', 'idle', 'aim', 'crouch']) {
      const cur = W[m] || 0, target = m === type ? 1 : 0;
      W[m] = cur + (target - cur) * k;
      if (W[m] < 1e-3) W[m] = 0;
    }
    // pha bước tiến theo chu kỳ pha trộn của các dáng đi đang có trọng số
    let cyc = 0, gw = 0;
    for (const m in GAITS) if (W[m]) { cyc += GAITS[m].cycle * W[m]; gw += W[m]; }
    cyc = gw > 0 ? cyc / gw : 1.1;
    if (F._snap) F._ph = t / cyc; else F._ph = (F._ph || 0) + dt / cyc;

    const out = F._pose || (F._pose = newPose()), tmp = F._tmpPose || (F._tmpPose = newPose());
    for (const key of POSE_KEYS) out[key] = 0;
    let wsum = 0;
    for (const m in W) {
      const w = W[m]; if (!w) continue;
      for (const key of POSE_KEYS) tmp[key] = 0;
      if (GAITS[m]) gaitPose(tmp, GAITS[m], F._ph);
      else if (m === 'idle') idlePose(tmp, t);
      else aimPose(tmp, t, m === 'crouch');
      for (const key of POSE_KEYS) out[key] += tmp[key] * w;
      wsum += w;
    }
    if (wsum > 0) for (const key of POSE_KEYS) out[key] /= wsum;
    // hướng quan sát riêng (F.lookYaw, rad, + = sang trái): vặn thân trên + đầu (súng trong hệ thân quay theo) — tổ bộ binh
    // mỗi người canh một hướng khi di chuyển; ngắm bắn thì đầu đã khoá vào kính nên chỉ vặn thân
    if (F.lookYaw) {
      const ly = F.lookYaw * (1 - 0.7 * out.gAim);
      out.tRy += ly * 0.6; out.pRy += ly * 0.15; out.hRy += ly * 0.4 * (1 - out.gAim);
    }

    applyPose(F, out);
    plantFeet(F, out.lift);
    F.gaitSpeed = Object.keys(GAIT_SPEED).reduce((a, m) => a + (W[m] || 0) * GAIT_SPEED[m], 0);
    if (F._customArmsIK) { if (F.rifle) F.rifle.visible = false; return; }
    if (F.rifle) holdRifleBlend(F, out);
    else swingArms(F, [out.aL, out.aR], out.aBend);
    F.head.rotation.set(out.hRx, out.hRy, out.hRz, 'YXZ');
    // ngắm: đưa cổ ra trước & hạ đầu áp má vào báng (mặc áo giáp, mắt mới tới được trục kính ngắm)
    const hb = F._headBase || (F._headBase = F.head.position.clone()), gA = out.gAim;
    // Hạ mắt phải đúng trục kính (đo trên mô hình: bản cũ lệch vuông góc ~0.57 đơn vị ≈ 7 cm).
    F.head.position.set(hb.x + 0.507 * gA, hb.y - 0.546 * gA, hb.z - 0.529 * gA);   // hạ 0,84 cũ (10,5 cm): đầu lún vào khăn cổ
    F._headLocked = out.gAim > 0.5;
  }

  /**
   * Đặt trạng thái hy sinh (tử trận) chân thực cho người lính
   * @param {Object} F - Thực thể binh sĩ (từ buildFigure)
   * @param {boolean} isDead - true nếu hy sinh, false nếu phục hồi khỏe mạnh
   */
  // vũng máu: vệt loang mép mềm (hình cánh sao bằng đa giác cũ trông như mảnh giấy đỏ cắt)
  let BLOOD_T = null;
  function bloodTex() {
    if (BLOOD_T) return BLOOD_T;
    const n = 256, c = document.createElement('canvas'); c.width = c.height = n;
    const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, n, n);
    let seed = 73; const rnd = () => { seed = seed * 16807 % 2147483647; return seed / 2147483647; };
    g.filter = 'blur(9px)'; g.fillStyle = '#fff';
    const blob = (x, y, r) => { g.beginPath(); g.ellipse(x, y, r, r * (0.7 + rnd() * 0.3), rnd() * Math.PI, 0, Math.PI * 2); g.fill(); };
    blob(128, 128, 62); blob(98, 150, 38); blob(160, 106, 34);
    for (let i = 0; i < 16; i++) { const a = rnd() * Math.PI * 2, d = 40 + rnd() * 30; blob(128 + Math.cos(a) * d, 128 + Math.sin(a) * d * 0.8, 12 + rnd() * 18); }
    // cắt ngưỡng: mép vũng máu sắc vừa phải, lượn theo các vệt loang
    g.filter = 'none';
    const im = g.getImageData(0, 0, n, n), D = im.data;
    for (let i = 0; i < D.length; i += 4) { const v = Math.max(0, Math.min(255, (D[i] - 90) * 3.2)); D[i] = D[i + 1] = D[i + 2] = v; }
    g.putImageData(im, 0, 0);
    return (BLOOD_T = new THREE.CanvasTexture(c));
  }

  // đáy thật của hình trong hệ thế giới: lưới skinned phải tính qua xương (đỉnh gốc vẫn ở tư thế đứng)
  function figureMinY(F) {
    F.root.updateMatrixWorld(true);
    const v = V(0, 0, 0);
    let minY = Infinity;
    F.root.traverse(o => {
      if (!o.isMesh || !o.visible || !o.geometry.attributes.position) return;
      const P = o.geometry.attributes.position;
      for (let i = 0; i < P.count; i += 3) {
        if (o.isSkinnedMesh) o.boneTransform(i, v); else v.fromBufferAttribute(P, i);
        v.applyMatrix4(o.matrixWorld);
        if (v.y < minY) minY = v.y;
      }
    });
    return minY;
  }

  function setCasualty(F, isDead) {
    if (!F || !F.root) return;
    if (F.isDead === !!isDead && (isDead ? F._deadPosed : true)) return;
    F.isDead = !!isDead;
    for (const s of F.soak || []) s.visible = !!isDead;
    if (F._bloodPool) F._bloodPool.visible = !!isDead;

    if (!isDead) {
      // Phục hồi tư thế đứng thẳng tại chỗ cũ, nhặt lại súng; lượt animateMotion kế tiếp đặt lại các khớp
      F._deadPosed = false;
      const live = F._liveRoot;
      if (live) { F.root.position.copy(live.p); F.root.rotation.set(0, live.y, 0, 'YXZ'); F._liveRoot = null; }
      F.hips.rotation.set(0, 0, 0);
      F.torso.rotation.set(0, 0, 0);
      F.head.rotation.set(0, 0, 0);
      if (F._headBase) F.head.position.copy(F._headBase);
      if (F.rifle) { F.rifle.position.set(0, 0, 0); F.rifle.rotation.set(0, 0, 0); F.rifle.scale.setScalar(1); F.rifle.visible = true; }
      for (const L of F.legs) { L.leg.rotation.set(0, 0, 0); L.knee.rotation.set(0, 0, 0); L.ankle.rotation.set(0, 0, 0); }
      F.root.updateMatrixWorld(true);
      return;
    }

    // TƯ THẾ HY SINH: ngã sấp, nằm thật trên đất; tựa lên ngực (túi đạn) và đùi, mặt quay nghiêng
    F._deadPosed = true;
    F.root.updateMatrixWorld(true);
    const R = F.root, yaw = R.rotation.y;
    F._liveRoot = { p: R.position.clone(), y: yaw };
    const groundW = R.localToWorld(V(0, FOOT_Y, 0)).y, parentK = R.parent ? R.parent.getWorldScale(V(1, 1, 1)).y : 1;
    R.rotation.set(-Math.PI / 2 + 0.2, yaw, -0.07, 'YXZ');
    F.chest.rotation.set(0, 0, 0); F.chest.position.set(0, 0, 0);
    F.hips.rotation.set(0, 0.08, 0.03, 'YXZ');
    F.torso.rotation.set(-0.14, -0.1, 0.03, 'YXZ');
    // đầu gục xuống, áp má xuống đất
    const hb = F._headBase || (F._headBase = F.head.position.clone());
    F.head.position.set(hb.x, hb.y - 0.3, hb.z - 0.52);
    F.head.rotation.set(-0.32, 1.02, 0.12, 'YXZ');

    // chân: đặt theo hướng đùi trong hệ hông + xoay quanh trục đùi (đặt góc Euler từng trục không kiểm soát được gối chạm đất).
    // Đùi xoay ngoài để bàn chân ngả nghiêng trên đất (mũi giày không thể cắm xuống); gối gập góc âm theo quy ước
    const [Ll, Lr] = F.legs, DOWN = V(0, -1, 0);
    const layLeg = (L, dx, dy, dz, twist, knee, ankle) => {
      L.leg.quaternion.setFromUnitVectors(DOWN, V(dx, dy, dz).normalize()).multiply(new THREE.Quaternion().setFromAxisAngle(UP, twist));
      L.knee.rotation.set(-knee, 0, 0); L.ankle.rotation.set(-ankle, 0, 0);
    };
    layLeg(Ll, -0.58, -0.8, 0.0, 1.3, 0.95, 0.55);   // chân trái co, gối đưa ra ngoài
    layLeg(Lr, 0.22, -0.96, 0.06, -1.15, 0.12, 0.9);    // chân phải duỗi xuôi

    // hạ thân xuống đất; tay gập tạm về phía lưng, súng thu nhỏ tại chỗ: đáy lúc này chỉ tính ngực / đùi, không để khuỷu tay chống cả người lên
    F.root.updateMatrixWorld(true);
    const toRoot = (x, y, z) => F.root.worldToLocal(F.chest.localToWorld(V(x, y, z)));
    const [al, ar] = F.arms;
    for (const A of F.arms) {
      if (A.sh0) A.sh.copy(A.sh0);
      A.sh.z -= 0.2;
      solveArm(F, A, F.chest.localToWorld(V(A.s * 1.3, 2.0, 0)), toRoot(A.s * 1.3, 2.0, 4));
    }
    const G = F.rifle;
    if (G) { G.position.set(0, 1, 0); G.scale.setScalar(1e-4); }
    R.position.y += (groundW - figureMinY(F)) / parentK;
    F.root.updateMatrixWorld(true);

    // tay giải lại bằng IK để khớp vẫn liền (đặt góc trực tiếp làm cánh tay rời khỏi vai): tay phải xuôi theo thân, tay trái co lên cạnh đầu; bàn tay đặt trên đất
    const onGround = (x, y, z) => { const p = F.chest.localToWorld(V(x, y, z)); p.y = groundW + 0.42; return p; };
    solveArm(F, ar, onGround(2.15, -1.05, -1), toRoot(4.6, 1.1, -1.5));
    solveArm(F, al, onGround(-1.9, 4.0, -1), toRoot(-5.2, 2.6, -1.5));
    F.root.updateMatrixWorld(true);
    const dip = groundW - figureMinY(F);
    if (dip > 0) { R.position.y += dip / parentK; F.root.updateMatrixWorld(true); }

    // súng tuột tay, nằm nghiêng trên đất cạnh tay phải
    if (G) {
      G.scale.setScalar(1);
      const side = V(Math.cos(yaw), 0, -Math.sin(yaw)), fwd = V(Math.sin(yaw), 0, Math.cos(yaw));   // bên phải xác / hướng về chân
      const dir = fwd.clone().multiplyScalar(0.55).addScaledVector(side, -0.83).normalize();       // trục súng chéo ra ngoài thân
      const worldP = F.root.localToWorld(toRoot(0, 0, 0)).addScaledVector(side, 3.5).addScaledVector(fwd, -0.4);
      worldP.y = groundW + 0.32;
      const X = V(0, 1, 0), Z = dir, Y = V().crossVectors(Z, X);
      const qW = new THREE.Quaternion().setFromRotationMatrix(_m.makeBasis(X, Y, Z));
      const qT = new THREE.Quaternion(); F.torso.getWorldQuaternion(qT);
      G.quaternion.copy(qT.invert().multiply(qW));
      G.position.copy(F.torso.worldToLocal(worldP));
      const under = groundW - figureMinY(F);
      if (under > 0) { worldP.y += under; G.position.copy(F.torso.worldToLocal(worldP)); }
      F.root.updateMatrixWorld(true);
    }

    // vũng máu dưới ngực xác
    if (R.parent) {
      if (!F._bloodPool) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 6.4), new THREE.MeshStandardMaterial({
          color: 0x1c0304, alphaMap: bloodTex(), transparent: true, opacity: 0.9, roughness: 0.34, metalness: 0,
          depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4
        }));
        m.rotation.set(-Math.PI / 2, 0, 0, 'YXZ');
        m.receiveShadow = true;
        R.parent.add(m);
        F._bloodPool = m;
      }
      const C = F.chest.localToWorld(V(0.9, 1.0, -1.0));
      C.y = groundW + 0.03;
      F._bloodPool.position.copy(R.parent.worldToLocal(C));
      F._bloodPool.rotation.y = yaw + 0.6;
      F._bloodPool.visible = true;
    }
  }

  return {
    buildFigure,
    setCasualty,
    animateMotion,
    solveArm,
    aim,
    createGripAnchor,
    attachHandToAnchor,
    sampleTrajectory,
    applyBreathing,
    applyInertia,
    lookAt,
    getHitboxes,
    plantFeet,
    GAITS,
    GAIT_SPEED,
    WEAPONS,
    ARM_UP,
    ARM_FORE,
    HAND_S,
    FOOT_Y,
    getMaterials,
    setLod,
    setShadow,
    SOLDIER_FILL,
    setBiome,
    BIOMES
  };
})();

// Xuất biến toàn cục dùng chung cho toàn bộ dự án
if (typeof window !== 'undefined') {
  window.SoldierModel = SoldierModel;
}
