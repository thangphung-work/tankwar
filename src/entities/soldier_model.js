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
  const ARM_UP = 2.28, ARM_FORE = 2.02;   // TÂM KHỚP tới tâm khớp, người 1,78 m: vai-khuỷu 30 cm, khuỷu-cổ tay 25 cm (32 / 27 cm là số đo bề mặt từ mỏm vai, dùng làm khớp thì tay dài ra)
  const HAND_S = 1.07;
  // Tỉ lệ người 1,78 m: hai mỏm cùng vai cách khoảng 38 cm, ngang vai phủ áo khoảng 50 cm.
  // Cụm cũ vẫn còn dáng lực sĩ (ngực ngang, chỏm vai và tay cùng nở), đặc biệt lộ rõ ở góc máy từ trên xuống.
  const CHEST_W = 0.94;
  // Áo dã chiến chỉ nới nhẹ quanh cơ delta; không biến cả bắp tay thành một ống tròn dày.
  const ARM_K = 0.84;
  // khớp vai cách giữa người ~18,6 cm (1,58 x CHEST_W); 1,68 cũ + tay áo raglan dày -> ngang vai ~53 cm, nhìn sau vai bè
  const DEG = Math.PI / 180;
  const SHOULDER_X = 1.64, SHOULDER_Y = 2.72;   // vòng 21: 2,72 đường vai cao, vuông; vòng 20: 2,60 thì đường cổ - tay dốc tuột, không có đầu vai (người dùng: lõm hẳn xuống); X nới cho lưng - vai rộng hơn
  // áo giáp: hạ VEST_DROP, đẩy ra trước-sau theo VEST_Z (ngực dày); tấm trước rộng 2,5, cong mép PLATE_BEND
  const VEST_DROP = 0.28, VEST_Z = 0.88, PLATE_BEND = 0.18, VEST_DZ = 1.08 * (VEST_Z - 0.84);

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

  // vân dệt găng: sợi nhỏ + gợn không đều, không có nếp gấp lớn (nếp to kéo trên tay thành mảng sáng tối mượt như nhựa)
  let GLOVE_N = null;
  function gloveNormal() {
    if (GLOVE_N) return GLOVE_N;
    const n = 128, H = new Float32Array(n * n);
    let seed = 29;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const N = new Float32Array(n * n); for (let i = 0; i < N.length; i++) N[i] = rnd();
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const weave = 0.35 * Math.sin(x * Math.PI / 2) * Math.sin(y * Math.PI / 2 + (x & 2 ? Math.PI / 2 : 0));
      const lump = (N[y * n + x] + N[y * n + ((x + 1) % n)] + N[((y + 1) % n) * n + x]) / 3;
      H[y * n + x] = weave + 0.6 * lump;
    }
    return (GLOVE_N = normalFromHeight(H, n, 1.2));
  }

  let GLOVE_T = null;
  function gloveTex() {
    if (GLOVE_T) return GLOVE_T;
    const n = 128, c = document.createElement('canvas'); c.width = c.height = n;
    const g = c.getContext('2d');
    let seed = 17;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    g.fillStyle = '#e4e4e4'; g.fillRect(0, 0, n, n);
    // mảng loang vẽ lặp qua mép (9 bản dời ±n): vẽ một lần thì mảng sát mép bị cắt thẳng, dán lên tay thành vết nối như vá; độ tương phản nhẹ
    for (let i = 0; i < 26; i++) {
      const x0 = rnd() * n, y0 = rnd() * n, r = 6 + rnd() * 22, light = rnd() < 0.45;
      for (const ox of [-n, 0, n]) for (const oy of [-n, 0, n]) {
        const x = x0 + ox, y = y0 + oy, gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, light ? 'rgba(255,255,255,0.14)' : 'rgba(40,36,30,0.08)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
      }
    }
    for (let i = 0; i < 900; i++) { const v = rnd() < 0.5 ? 255 : 30; g.fillStyle = `rgba(${v},${v},${v},${0.02 + rnd() * 0.025})`; g.fillRect(rnd() * n, rnd() * n, 1, 1 + rnd() * 2); }
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
      gear: { vest: 0x7a6a4e, vestD: 0x6e5e44, web2: 0x7a6a4c, pad: 0x6e6048, glove: 0x4a3f30, gloveP: 0x524636, gloveK: 0x372f23, helmD: 0x6a5a42, boot: 0x5a4834, velcro: 0x9a8a66, web: 0x8a7a58, deadVest: 0x6a5a40 } },
    JUNGLE: { camo: ['#4c5034', ['#383e26', '#5c623e', '#6c6a4a', '#24281a']], gaiter: ['#33372a', ['#363c26', '#5e623e']],
      gear: { vest: 0x343a28, vestD: 0x353c2a, web2: 0x3e4230, pad: 0x383c2e, glove: 0x23261c, gloveP: 0x2a2c21, gloveK: 0x1a1c15, helmD: 0x30362a, boot: 0x24221c, velcro: 0x6e6a4c, web: 0x5e5a40, deadVest: 0x34362a } },
    URBAN: { camo: ['#585850', ['#46463e', '#66645c', '#76746a', '#34342e']], gaiter: ['#3c3c38', ['#44443e', '#68665e']],
      gear: { vest: 0x3e3f3a, vestD: 0x40423b, web2: 0x45463f, pad: 0x3e3f39, glove: 0x242520, gloveP: 0x2b2b26, gloveK: 0x1b1b18, helmD: 0x3a3b36, boot: 0x24231f, velcro: 0x6a6860, web: 0x5e5c54, deadVest: 0x3a3a34 } },
    TEMPERATE: { camo: ['#5e5c44', ['#444830', '#6c6448', '#848062', '#2a2c20']], gaiter: ['#404032', ['#444832', '#706a4c']],
      gear: { vest: 0x3b3e30, vestD: 0x3c432d, web2: 0x4a4c36, pad: 0x3e4235, glove: 0x272a1f, gloveP: 0x2e3024, gloveK: 0x1d1f17, helmD: 0x343a28, boot: 0x27251e, velcro: 0x8a7a56, web: 0x80704f, deadVest: 0x3a3a2a } }
  };
  const BIOME_OF = { DESERT: 'DESERT', JUNGLE: 'JUNGLE', URBAN: 'URBAN', HIGHLAND: 'TEMPERATE', RIVER_LAKE: 'TEMPERATE' };
  let BIOME = 'TEMPERATE';
  // gọi trước khi dựng lính của trận (theo mapType của địa hình); lính dựng sau dùng bộ quân phục mới
  function setBiome(mapType) { BIOME = BIOME_OF[mapType] || BIOMES[mapType] && mapType || 'TEMPERATE'; WEAR_DUST.value.setHex(WEAR_DUST_OF[BIOME] || WEAR_DUST_OF.TEMPERATE); WEAR_MUD.value.setHex(WEAR_MUD_OF[BIOME] || WEAR_MUD_OF.TEMPERATE); return BIOME; }
  // ngả ấm (đỏ) / lạnh (xanh) rất nhẹ để hai phe khác nhau khi nhìn gần mà vẫn hợp môi trường
  const tintHex = (h, red) => {
    const v = typeof h === 'string' ? parseInt(h.slice(1), 16) : h, k = red ? [1.05, 1.0, 0.93] : [0.97, 1.0, 1.03];
    const c = [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((x, i) => Math.min(255, Math.round(x * k[i])));
    return typeof h === 'string' ? '#' + c.map(x => x.toString(16).padStart(2, '0')).join('') : (c[0] << 16) | (c[1] << 8) | c[2];
  };

  // bộ vật liệu riêng cho kíp lái (crew = true): kíp lái vẽ ở lượt trong suốt sau lòng hố lỗ nóc; bộ binh dùng bộ đục (nhanh hơn)
  const UNI_TINT = 0xb8b4a6, GLOVE_DARK = 0.52;
  function getMaterials(team, crew) {
    const key = team + '|' + BIOME + (crew ? '|crew' : '');
    if (MATS[key]) return MATS[key];
    const red = team === 'RED', BIO = BIOMES[BIOME], GR = {};
    for (const k in BIO.gear) GR[k] = tintHex(BIO.gear[k], red);
    const std = (o) => new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.92, metalness: 0 }, o));
    // vải rằn ri (normalMap: null): lưới sợi đã in trong màu; fabricNormal có nếp gấp lớn, trải theo UV ~4 đv / ô thành vệt chéo và mảng tối loang trên đùi, mông
    const cloth = (o) => std(Object.assign({ normalMap: fabricNormal(), normalScale: new THREE.Vector2(0.7, 0.7) }, o));
    const matte = (o) => { const m = std(Object.assign({ roughness: 1 }, o)); m.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n  reflectedLight.directSpecular = vec3(0.0); reflectedLight.indirectSpecular = vec3(0.0);'); }; m.customProgramCacheKey = () => 'soldierMatte'; return m; };
    const camo = camoTex(tintHex(BIO.camo[0], red), BIO.camo[1].map(h => tintHex(h, red)));
    // găng cùng màu quân phục, chỉ sậm hơn: lấy màu trung bình thật của tấm rằn ri (đúng cách shader đọc ảnh) x màu vải uni, chia độ sáng ảnh găng rồi nhân k
    const gloveColor = (() => {
      const C = camo.image, d = C.getContext('2d').getImageData(0, 0, C.width, C.height).data, srgb = camo.encoding === THREE.sRGBEncoding, dec = v => srgb ? Math.pow(v / 255, 2.2) : v / 255;
      const m = [0, 0, 0]; let n = 0;
      for (let i = 0; i < d.length; i += 4 * 37) { m[0] += dec(d[i]); m[1] += dec(d[i + 1]); m[2] += dec(d[i + 2]); n++; }
      const U = new THREE.Color(UNI_TINT), G = Math.pow(0xe4 / 255, 2.2);
      return k => new THREE.Color(m[0] / n * U.r / G * k, m[1] / n * U.g / G * k, m[2] / n * U.b / G * k);
    })();

    return (MATS[key] = {
      // vải quân phục thật phản xạ ~15-25% (vải ô-liu / cát): nhân màu ~0,72, ngả ấm nhẹ để dưới nắng không thành màu phấn
      uni: cloth({ normalMap: null, color: UNI_TINT, map: (() => { const t = camo.clone(); t.needsUpdate = true; t.repeat.set(2.2, 2.2); return t; })() }),
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
      // găng tối màu, mờ hẳn (không ánh, không vân nổi bắt sáng): che bớt chỗ nối ngón / lòng bàn tay, như găng chiến thuật đen thật
      // cùng mô hình sáng với vải áo (Lambert thiếu ánh môi trường: phía khuất nắng tối hẳn so với tay áo), chỉ cắt thành phần gương: không loáng như găng cao su
      glove: matte({ color: gloveColor(GLOVE_DARK), map: gloveTex() }),   // 0,55: vân dệt đều nổi thành vảy rắn trên ngón   // vải găng mờ hẳn, không ánh
      gloveP: matte({ color: gloveColor(GLOVE_DARK * 1.15), map: gloveTex() }),
      knuck: std({ color: 0x171714, roughness: 0.82 }),
      gloveK: matte({ color: gloveColor(GLOVE_DARK * 0.8), map: gloveTex() }),
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
      // chỉ may cùng tông vải, chỉ sẫm hơn chút (bóng rãnh chỉ); ×0,34 cũ gần đen -> đường may thành nét mực kẻ lên quần
      seam: std({ color: new THREE.Color(tintHex(BIO.camo[0], red)).multiplyScalar(0.66).getHex(), roughness: 1 }),
      headset: std({ color: 0x242620, roughness: 0.82 }),
      dust: std({ color: red ? 0x6b5135 : 0x62583e, alphaMap: grimeTex(), transparent: true, opacity: 0.48, roughness: 1, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }),
      soot: std({ color: 0x211d18, alphaMap: grimeTex(), transparent: true, opacity: 0.34, roughness: 1, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }),
      lip: std({ color: 0x9a6a52 }),
      dead: cloth({ normalMap: null, map: (() => { const t = camo.clone(); t.needsUpdate = true; t.repeat.set(2.2, 2.2); return t; })(), color: 0x9a7f78 }),
      soak: std({ color: 0x150504, alphaMap: soakTex(), transparent: true, opacity: 0.88, roughness: 0.6, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3 }),
      // bộ ngụy trang cỏ: màu từng dải nằm ở màu đỉnh (ghillieGeo), hai mặt vì dải vải mỏng xoắn lật cả hai phía
      ghillie: std({ vertexColors: true, side: THREE.DoubleSide, roughness: 1 }),
      medCross: std({ color: 0x8c2a24, roughness: 0.85 }),   // chữ thập đỏ trên túi y tế
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

  const HEL_R = 1.16, HEL_S = [0.97, 0.95, 1.05], HEL_Y = 0.9;
  const step = (x, a, b) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const helRim = (phi) => {
    const f = Math.abs(Math.atan2(Math.sin(phi), Math.cos(phi)));
    // +0,12 ở trán: mép trước nằm trên đỉnh kính (GG top ~ y đầu 0,88), vỏ to ra thì vành không đè kính
    return -0.12 + 0.12 * (1 - step(f, 0.55, 0.95)) - 0.02 * f + 0.2 * step(f, 0.78, 0.98) - 0.03 * Math.sin(Math.max(0, Math.min(1, (f - 0.98) / 1.12)) * Math.PI) - 0.92 * step(f, 1.68, 2.02);
  };
  const squareK = (phi) => { const c = Math.abs(Math.cos(phi)), sn = Math.abs(Math.sin(phi)); return Math.pow(Math.pow(c, 2.6) + Math.pow(sn, 2.6), -1 / 2.6) * 0.93; };
  // mép mũ thu vào ôm đầu ít thôi, phía sau gần như không thu: vỏ đứng cách gáy một khe ~ độ dày đệm (0,18 cũ ở gáy thì mép mũ dán sát đầu)
  const helTuck = (d, phi = 0) => (0.06 - 0.045 * Math.max(0, -Math.cos(phi))) * Math.pow(Math.max(0, 1 - Math.max(0, d) / 0.55), 2);
  // vách sau / hai bên sau: dưới y0 không cụp theo quả cầu mà đổ gần thẳng xuống (mũ thật), mép sau đứng cách khăn trùm đầu ~ một độ dày mũ
  // (cụp theo cầu thì khăn đâm xuyên vỏ ở gáy)
  const HEL_TH = 0.15, HEL_Y0 = -0.4, HEL_RR0 = Math.sqrt(HEL_R * HEL_R - HEL_Y0 * HEL_Y0);
  const helFlare = (y, phi) => {
    if (y >= HEL_Y0) return 1;
    const f = Math.abs(Math.atan2(Math.sin(phi), Math.cos(phi))), w = step(f, 1.75, 2.3);
    if (w <= 0) return 1;
    const s = Math.sqrt(Math.max(1e-4, HEL_R * HEL_R - y * y)), d = HEL_Y0 - y, wall = HEL_RR0 - (-HEL_Y0 / HEL_RR0) * d + 0.5 * d * d;   // nối tiếp tuyến với cầu rồi cong dần về gần thẳng đứng ở mép gáy
    return 1 + w * Math.max(0, wall / s - 1);
  };

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
      const ff = helFlare(y, phi);
      x *= ff; z *= ff;
      const fl = -helTuck(y - rim, phi);
      p.setXYZ(i, x * HEL_S[0] * (1 + fl), (y > 0.8 ? 0.8 + (y - 0.8) * 0.85 : y) * HEL_S[1], z * HEL_S[2] * (1 + fl));
    }
    g.computeVertexNormals();
    return (GEO.helmet = g);
  }

  // mặt trong vỏ mũ: lùi theo pháp tuyến một độ dày HEL_TH, đảo chiều tam giác -> nhìn từ dưới gáy thấy thành mũ dày chứ không phải tấm giấy
  function helmetInnerGeo() {
    if (GEO.helmetIn) return GEO.helmetIn;
    // lùi theo hướng vào tâm mũ (nửa dưới chỉ lùi ngang để mép trong ngang mép ngoài), KHÔNG theo pháp tuyến lưới:
    // ở mép khoét tai / đỉnh bị ép dồn xuống mép, pháp tuyến lệch -> vỏ trong đâm xuyên ra ngoài thành mảnh tối lởm chởm
    const g = helmetGeo().clone(), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), yy = Math.max(0, y), L = Math.hypot(x, yy, z) || 1;
      p.setXYZ(i, x - x / L * HEL_TH, y - yy / L * HEL_TH, z - z / L * HEL_TH);
    }
    const idx = g.index.array;
    for (let t = 0; t < idx.length; t += 3) { const a = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = a; }
    g.computeVertexNormals();
    return (GEO.helmetIn = g);
  }

  function helPt(phi, y, off = 0) {
    const rr = Math.sqrt(Math.max(0, HEL_R * HEL_R - y * y)) * helFlare(y, phi);
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
    return (GEO[key] = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(([f, y]) => helPt(f, y, off).p)), Math.min(96, pts.length * 8), r, 4, false));
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

  function strapGeo(curve, w, t, key, core = V(0, 2.6, 0), N = 24) {
    if (GEO[key]) return GEO[key];
    const pos = [], idx = [];
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
      P.setZ(i, torsoDepth(P.getZ(i) * 0.655 * torsoFlat(P.getX(i), P.getY(i)) * topFull(P.getX(i), P.getY(i) - 0.22), P.getY(i)) * 1.015);
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
    const yB = 3.3 - 0.04 * bk, yT0 = 3.72 - 0.13 * bk + 0.08 * Math.pow(Math.abs(Math.sin(f)), 1.5) + wrinkle;   // sau gáy thấp, không dựng như hộp
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
        + 0.0 * Gn(y - yc + 0.17, 0.1) * Gn(ax - 1.25, 0.16)                     // rãnh delta-ngực: bỏ (dưới áo không thấy, cộng với vải vai trước bị dồn khi ôm súng thành chỗ lõm)
        - 0.09 * Gn(y - 2.85, 0.35) * Gn(ax - 0.55, 0.5) * (1 - Gn(x, 0.12) * 0.3)   // khối cơ ngực đầy, rãnh giữa ức nhẹ
        + 0.09 * Math.pow(Math.min(1, ax / 1.45), 2) * Gn(y - 2.5, 0.8);          // lồng ngực cong tròn theo chiều ngang (không phẳng như tấm ván)
    }
    // lưng trên qua lớp áo: cơ thang là mặt dốc tròn rộng từ gáy xuống giữa lưng, không gờ (bắt đầu đột ngột ở y 2,95 + gai bả vai cũ -> gờ cứng như xương lộ)
    // Lưng trên và bả vai sau: khối cơ bả vai và cơ thang nở nang đầy đặn, dày dặn
    const scapula = 0.065 * Gn(ax - 0.98, 0.45) * Gn(y - 2.6, 0.55);   // bả vai + cơ dưới gai đầy (0,04 cũ: sau vai lõm)
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
  const backSlope = (x, y) => 1 - 0.16 * sm((y - 2.5) / 1.05) * (0.55 + 0.45 * sm((1.3 - Math.abs(x)) / 0.6));
  // Giữ hàm riêng vì các mặt phụ/đường may cùng gọi nó, nhưng không còn bơm dày hai đầu vai như bản cũ.
  const topFull = (x, y) => { const q = Math.min(1, Math.abs(x) / Math.max(0.3, lerpTab(TORSO_PROF, y) * 1.02)); 
    // lồng ngực ngang nách là hộp bo tròn, sát nách vẫn dày (elip mỏng dần về 0 nên chỏm tay nhô thành bậc so với thân, trông như gắn rời)
    const by = sm((y - 1.5) / 0.7) * sm((3.2 - y) / 0.5), ell = Math.sqrt(Math.max(0.03, 1 - q * q)), sup = Math.cbrt(Math.max(0, 1 - q * q * q)), box = 1 + by * (Math.min(1.08, sup / ell) - 1);
    return box * (1 - 0.05 * sm((y - 2.5) / 0.5) * sm((3.55 - y) / 0.4) * Math.pow(q, 1.4)); };
  // Thân tiện tròn: rộng ngang thêm bao nhiêu thì dày trước-sau thêm bấy nhiêu -> ngực phồng như thùng phuy, xuyên qua tấm giáp.
  // Ngực thật dẹt: ép mềm độ dày về dưới mặt trong tấm giáp, bề ngang giữ nguyên; vùng cổ áo (y cao) không đổi.
  const torsoDepth = (z, y) => {
    // Thân trên và lưng người lính dày dặn, cơ bả vai nở nang
    // Cơ bả vai chỉ tạo độ lồi nông; 0,14 cũ cộng đều lên cả lưng trên làm thành một thành trụ thẳng đứng.
    const shoulderBackPad = (z > 0 && y > 2.1) ? 0.035 * sm((y - 2.1) / 0.6) * sm((3.65 - y) / 0.4) : 0;
    // bụng dưới giáp: thu eo (bề ngang) làm thân tiện tròn mỏng theo; bù độ dày trước-sau đoạn lộ giữa mép giáp và thắt lưng (không thì thắt eo ong)
    const belly = Math.exp(-Math.pow((y - 0.15) / 0.6, 2)) * (z < 0 ? 0.14 : 0.07);
    z *= 1 + belly;
    const Z0 = 0.76 + 0.8 * belly + 0.05 * sm((y + 0.3) / 0.6) - 0.06 * sm((y - 1.0) / 0.9) + (z < 0 ? 0.11 : 0.05) * sm((y - 0.9) / 1.0) * sm((3.05 - y) / 0.45) + 0.6 * shoulderBackPad;   // ngực đầy hơn lưng, thoải lên xương đòn
    const a = Math.abs(z);
    if (a <= Z0) return z;
    const k = 0.96;
    return Math.sign(z) * (a + (Z0 + 0.08 * (1 - Math.exp(-(a - Z0) / 0.08)) - a) * k);
  };
  // Ngang nách (y 2,3-2,7) từng phồng 1,92: sườn thân lòi ra dưới chỏm vai thành khối thứ hai, vai trông như độn bông.
  // khối vai + cơ thang nằm ngay trên thân áo, cao và rộng bao trọn khớp vai: tay giơ lên vẫn liền vào khối này, thoải từ cổ ra đầu vai
  // nội suy cong qua các mốc: nối thẳng thì mỗi mốc là một nếp gãy, thành vệt sáng tối ngang trên vai
  const smoothProf = (T) => { const o = []; for (let i = 0; i < T.length - 1; i++) { const a = T[Math.max(0, i - 1)], b = T[i], c = T[i + 1], d = T[Math.min(T.length - 1, i + 2)]; for (let k = 0; k < 6; k++) { const u = k / 6, cr = (j) => 0.5 * (2 * b[j] + (c[j] - a[j]) * u + (2 * a[j] - 5 * b[j] + 4 * c[j] - d[j]) * u * u + (3 * b[j] - a[j] - 3 * c[j] + d[j]) * u * u * u); o.push([cr(0), cr(1)]); } } o.push(T[T.length - 1]); return o; };
  // Eo ~84 cm chu vi kể cả áo (1,2 cũ chỉ 76 cm: thắt eo ong, bụng mỏng); thắt ngay trên mào chậu rồi nở dần theo lồng ngực và cơ lưng rộng tới nách: dáng chữ V.
  // Bản cũ 1,38 ở eo -> sườn gần thẳng đứng từ thắt lưng tới nách, thân + đai giáp quấn quanh trông như thùng phuy.
  const TORSO_PROF = smoothProf([[1.37, -0.25], [1.38, 0.45], [1.42, 1.05], [1.49, 1.65], [1.58, 2.2], [1.6, 2.6], [1.6, 2.86], [1.53, 3.06], [1.37, 3.2], [1.04, 3.34], [0.66, 3.47], [0.44, 3.53]]);
  // ---------- ỐNG TAY ÁO LIỀN MẢNH (bộ binh, lưới skinned) ----------
  // Một mặt vải từ nách qua đầu vai, bắp tay, khuỷu tới cổ tay (trước là 3 khối chồng ở vai + 2 khúc tay nối ở khuỷu, trơn như bóng).
  // Bám 3 xương: ngực -> cánh tay quanh mũ vai (khớp cầu), cánh tay -> cẳng tay quanh khuỷu. Có nếp vải thật trong lưới: nếp kéo từ
  // nách, xoắn chéo dọc tay, xếp ngấn mặt trong khuỷu, gom trên cổ tay; khe nếp tô tối vào màu đỉnh để đọc rõ cả ở xa.
  // S: khớp vai, D: trục tay buông (hệ root, tư thế gốc).
  // Chỏm tay áo là vòm delta dốc, không phải bán cầu: đỉnh vai ngắn, nở dần xuống 1/3 trên cánh tay rồi thu nhẹ.
  // Bắp tay gần như đều từ dưới cơ delta tới trên khuỷu (cơ nhị đầu / tam đầu), không thon nhọn như củ cà rốt (0,575 -> 0,45 cũ:
  // nhìn từ sau vai to bè rồi thót về khuỷu thành một cục tròn). Cẳng tay nở dưới khuỷu (cơ cánh tay quay): chu vi kể cả vải ~31 cm,
  // 27 cm cũ thì bắp to cẳng gầy như que, tay trông dài. To nhất ở cơ delta rồi thon dần về khuỷu (giữa bắp to hơn đầu vai thì thành quả trám, người dùng chê).
  // Vòng 17: vải ôm thân, vai thuôn liền xuống tay (0,545-0,55 cũ ở cơ delta + lớp đắp dày -> vai tròn như quả bóng, người dùng chê 'to đùng')
  // Vòng 21: cơ delta nổi khối, thót nhẹ ở chỗ bám (y ~1): tay áo to đều từ vai xuống thì vai thũng (người dùng chê). Đo chu vi kể cả vải: delta 40, bắp 36, cẳng 30, cổ tay 19 cm (bắp 33 thì cẳng tay gần bằng bắp tay: như Popeye)
  const SLEEVE_PROF = [[0, -0.38], [0.18, -0.35], [0.34, -0.28], [0.43, -0.16], [0.535, 0], [0.55, 0.2], [0.535, 0.42], [0.5, 0.72], [0.475, 0.98], [0.475, 1.25], [0.49, 1.55], [0.49, 1.9], [0.48, 2.22], [0.46, 2.5], [0.475, 2.85], [0.47, 3.15], [0.44, 3.5], [0.39, 3.85], [0.33, 4.2], [0.305, 4.27], [0, 4.28]];
  const TRICEPS = 0.06;
  const DELT_LONG = 0.018;   // 0,04: đoạn 30% trên bắp tay phình 44 cm, lồi hơn cả đầu vai
  const BACK_WEB = 0.54;   // mặt sau nách vẫn đủ giãn khi ôm súng nhưng không kéo cả vai sau thành một túi tròn
  // nếp nách sau (cơ xô): đoạn vòng gốc giữa nách và lưng hạ thấp, vải vai sau bám xuống lưng -> giơ tay ra là một gờ liền xuống lưng, không thành cục tròn
  const LAT_DROP = 0.6, LAT_FOLLOW = 0.55, PEC_FOLLOW = 0.4;
  const BACK_FIX_W = 0.26, BACK_FIX_Y = 0.78;   // corrective bone chỉ chống lõm nách; quá mạnh sẽ vun delta sau thành quả cầu khi đưa tay ra trước
  const RING_Y = 2.79, RING_H = 0.62, RING_IN = 0.75;   // gốc raglan lên gần chân cổ; bề mặt sau đó dốc xuống mỏm vai thay vì bắt đầu trên phần thân rộng
  // đường may raglan trên mặt thân: tại độ cao y, phía trước (back=false) / sau, trả cos góc ngang của đường may (x / R thân); null nếu ngoài tầm vòng
  const RING_SEAM = (() => {
    const T = [[], []];
    for (let k = 0; k <= 180; k++) for (const b of [0, 1]) {
      const ph = (b ? 0 : Math.PI) + Math.PI * k / 180, sn = Math.sin(ph), lat = Math.pow(Math.max(0, sn) * Math.max(0, Math.cos(ph)) * 2, 1.5);
      T[b].push([RING_Y - RING_H * Math.cos(ph) - LAT_DROP * lat, Math.cos(RING_IN * Math.abs(sn))]);
    }
    return (y, back) => { let c = null; const L = T[back ? 1 : 0]; for (let k = 0; k < L.length - 1; k++) { const a = L[k], b = L[k + 1]; if ((y - a[0]) * (y - b[0]) <= 0 && a[0] !== b[0]) { const t = (y - a[0]) / (b[0] - a[0]), cc = a[1] + (b[1] - a[1]) * t; c = c == null ? cc : Math.min(c, cc); } } return c; };
  })();
  const SHOULDER_T0 = 0.34, SHOULDER_T1 = 0.38;   // tiếp tuyến ngắn: vải ôm xương đòn/delta, không phồng thành nửa cầu giữa thân và cánh tay
  const SLEEVE_R = y => ARM_K * (1 - 0.06 * sm((y - 3.7) / 0.4)) * (1 + 0.012 * Math.exp(-Math.pow((y - 0.55) / 0.55, 2))) * (1 - 0.05 * sm((y - 2.3) / 0.4));   // thu riêng chỏm delta, giữ bắp tay/cẳng tay đủ khối; cổ tay áo ôm găng
  function sleeveGeo(chest, clav, up, fore, upS, fix, fixB, s, S, D, fromChest) {
    const Ox = V(1, s * 0.06, 0).normalize(), YE = 2.55, SEG = 36, C1 = SEG + 1, Gs = (v, k) => Math.exp(-(v / k) * (v / k));
    // hồ sơ & nếp vải khai báo theo tay chuẩn 2,55 / 2,15; co về chiều dài xương thật, mũ vai giữ nguyên
    const yReal = y => y <= 0.4 ? y : y <= YE ? 0.4 + (y - 0.4) * (ARM_UP - 0.4) / (YE - 0.4) : ARM_UP + (y - YE) * ARM_FORE / 2.15;
    const fold = (y, ci, sn, ph) => {
      const front = sm(0.1 - sn), inner = sm(ci + 0.2);
      const pit = 0.026 * Gs(y - 0.72, 0.42) * inner * Math.sin(y * 9 + ph * 3);                                      // nếp kéo từ nách
      const arm = 0.014 * sm((y - 0.7) / 0.4) * sm((2.25 - y) / 0.35) * Math.sin(y * 6.5 + ph * 2 + 1.1 * Math.sin(y * 2.1));  // xoắn chéo bắp tay
      const elb = 0.024 * Gs(y - YE, 0.4) * (0.25 + 0.75 * front) * Math.sin(y * 15 + ph * 1.5 + 0.8 * Math.sin(ph * 2));      // xếp ngấn khuỷu
      const frm = 0.012 * sm((y - 3.0) / 0.3) * sm((4.0 - y) / 0.3) * Math.sin(y * 7 - ph * 2 + 0.9 * Math.sin(y * 1.7));      // xoắn cẳng tay
      const wri = 0.018 * Gs(y - 4.02, 0.2) * Math.sin(y * 20 + ph * 3);                                                 // gom trên cổ tay
      return pit + arm + elb + frm + wri + 0.007 * Math.sin(ph * 5 + y * 6);
    };
    const surf = (y, ph) => {
      const r = lerpTab(SLEEVE_PROF, y) * SLEEVE_R(y), ci = Math.cos(ph), sn = Math.sin(ph);
      const cx = s * 0.03 * Gs(y - 0.4, 0.5);
      // Mặt cắt trước-sau mỏng hơn ngang tay, rõ nhất ở chỏm vai; bỏ silhouette “quả bóng” khi nhìn nghiêng.
      const ez = (0.88 + 0.08 * sm((0.7 - y) / 0.9) + 0.16 * sm((y - 0.9) / 0.7) - 0.1 * sm((y - 2.05) / 0.45) + 0.04 * sm((y - 2.7) / 0.4)) * (1 - 0.08 * sm((y - 3.5) / 0.6));   // bắp tay người sâu trước-sau hơn ngang tay; khuỷu ngược lại (lồi cầu); cổ tay dẹt
      const ex = 1 - 0.05 * sm((y - 0.9) / 0.6) * sm((2.4 - y) / 0.35);
      // mỏm khuỷu (đầu xương trụ) đội vải ở mặt sau: gập tay vẫn ra góc nhọn, không thành đầu tròn như cục bông
      const olec = 0.075 * Gs(y - YE - 0.04, 0.17) * Math.pow(Math.max(0, sn), 3);
      // cơ delta trước + sau kéo dài xuống ~40% bắp tay (bám tới ấn delta), thoải vào bắp tay chứ không dừng cụt ở đầu vai
      // cơ tam đầu: mặt sau bắp tay đầy từ dưới vai sau, thoải dần về khuỷu (khớp với lớp đắp sau vai ở đoạn nối, không thành bậc lõm)
      const tri = TRICEPS * sm(sn / 0.5) * sm((y + 0.2) / 0.3) * sm((2.25 - y) / 1.1);
      const deltL = DELT_LONG * sm((y - 0.05) / 0.2) * sm((1.3 - y) / 0.8) * (sm(sn / 0.45) + sm(-sn / 0.45));
      // cơ nhị đầu (mặt trước, giữa-dưới bắp tay) và khối cơ cánh tay quay (ngoài-trước, ngay dưới khuỷu): tay có khối thay vì ống trơn
      const bic = 0.035 * sm(-sn / 0.5) * Gs(y - 1.55, 0.55), bra = 0.035 * Gs(y - 2.95, 0.38) * sm(-ci - sn);
      const f = r > 0.1 ? fold(y, ci, sn, ph) * Math.min(1, r / 0.3) : 0, R = r + f + olec + deltL + tri + bic + bra;
      // mặt cắt bắp tay hơi vuông (siêu elip): vai và bắp tay khối khoẻ, không tròn như ống; về khuỷu thì tròn lại
      const sq = 1 - 0.14 * sm((y + 0.1) / 0.4) * sm((2.1 - y) / 0.4), cq = Math.sign(ci) * Math.pow(Math.abs(ci), sq), snq = Math.sign(sn) * Math.pow(Math.abs(sn), sq);
      const P = S.clone().addScaledVector(D, yReal(y)).addScaledVector(Ox, cx - s * cq * R * ex).addScaledVector(V(0, 0, 1), snq * R * ez);
      P.fold = f;
      return P;
    };
    // VAI LIỀN THÂN: tay áo không cắm vào thân như quả cầu mà mọc ra từ một vòng nằm đúng trên mặt áo. Từ vòng đó (tiếp tuyến với mặt thân)
    // tới bắp tay (tiếp tuyến với trục tay) là một đường cong trơn: thân, vai, tay là một mặt, đường cong tự tạo khối cơ vai.
    // vòng gốc trùm lên tới đỉnh vai (mỏm cùng vai ~3,1): cơ delta là của tay áo, giơ tay thì đầu vai đi theo.
    // Vòng cũ 2,1-2,9 nằm trên sườn: đầu vai là góc thân áo đứng yên, tay giơ lên trông như ống cắm vào sườn.
    const yr0 = ph => 0.85 + BACK_WEB * sm(Math.sin(ph) / 0.7 + 0.15);
    const SH_CORNER = 0.09;   // gợi đầu vai (mỏm cùng vai); 0,008 thì vai dốc tuột, 0,17 thì thành bè vuông
    const SH_PAD_TOP = 0.04, SH_PAD_BACK = 0.014, SH_PAD_FRONT = 0.010;   // lớp áo mỏng theo giải phẫu; độ đầy chính đến từ bề mặt delta chứ không phải đệm cầu
    const YA = 0.2, NV = 24;   // đường cong dừng ở vòng rộng nhất của cơ vai (giữ nguyên độ rộng đầu vai), từ đó xuống là tay áo
    const ring = (ph) => {
      const sn = Math.sin(ph), lat = Math.pow(Math.max(0, sn) * Math.max(0, Math.cos(ph)) * 2, 1.5), y = RING_Y - RING_H * Math.cos(ph) - LAT_DROP * lat, R = lerpTab(TORSO_PROF, y) * 1.02, x = s * R * Math.cos(RING_IN * Math.abs(sn)), side = sn < 0 ? -1 : 1;
      const z = torsoSurfZ(x, y, side) * sm(Math.abs(sn) / 0.2);
      const dR = (lerpTab(TORSO_PROF, y + 0.03) - lerpTab(TORSO_PROF, y - 0.03)) * 1.02 / 0.06;
      const N0 = V(x / CHEST_W, -R * dR, z * 2.2).normalize();
      return { P: fromChest(V(x, y, z).addScaledVector(N0, -0.035 - 0.04 * lat)), N: N0 };   // đoạn cơ xô chìm sâu hơn: nếp vải sườn thân gợn ±0,03
    };
    const rows = [], rowN = [];
    for (let i = 0; i < NV; i++) {
      const v = i / NV, v2 = v * v, v3 = v2 * v, h00 = 2 * v3 - 3 * v2 + 1, h10 = v3 - 2 * v2 + v, h01 = -2 * v3 + 3 * v2, h11 = v3 - v2, row = [];
      for (let j = 0; j <= SEG; j++) {
        const ph = j / SEG * Math.PI * 2, T = ring(ph), Pa = surf(YA, ph), dA = Pa.clone().sub(T.P), L = dA.length();
        const t0 = dA.clone().addScaledVector(T.N, -dA.dot(T.N)).normalize().multiplyScalar(L * SHOULDER_T0), t1 = D.clone().multiplyScalar(L * SHOULDER_T1);
        const Q = V(0, 0, 0).addScaledVector(T.P, h00).addScaledVector(t0, h10).addScaledVector(Pa, h01).addScaledVector(t1, h11);
        // độ dày cơ dưới vải: đỉnh vai (cơ thang) và vai sau (bả vai, delta sau) đắp dày; trước vai mỏng đi (ụ tròn trước vai khi ôm súng)
        { const cph = Math.cos(ph), sph = Math.sin(ph), bump = Math.sin(Math.PI * Math.min(1, v * 1.15));
          // đầu vai vuông: đắp cao dồn về phía ngoài (gần mỏm cùng vai) -> đường vai ngang rồi bẻ góc xuống tay, không dốc tròn từ cổ
          const corner = sm((v - 0.15) / 0.45) * sm((1.05 - v) / 0.32) * sm(-cph / 0.95);
          // gộp kiểu max mềm (chuẩn p = 3), không cộng thẳng: đỉnh vai + góc vuông + sau vai chồng nhau ở đường chéo sau-trên thành u phồng giữa cầu vai
          const pTop = bump * SH_PAD_TOP * sm(-cph / 0.8) + SH_CORNER * corner, pBack = sm(v / 0.4) * (1 - 0.62 * sm((v - 0.55) / 0.45)) * SH_PAD_BACK * sm(sph / 0.6) * (0.6 + 0.4 * sm((cph + 0.6) / 0.8));   // không tắt về 0 ở chỗ nối: còn ~0,07 chảy vào cơ tam đầu
          const pFront = bump * SH_PAD_FRONT * sm(-sph / 0.6) * (0.6 + 0.4 * sm((cph + 0.6) / 0.8));
          Q.addScaledVector(T.N, Math.cbrt(pTop * pTop * pTop + pBack * pBack * pBack + pFront * pFront * pFront)); }
        Q.fold = 0; row.push(Q);
        if (i === 0) rowN.push(T.N);
      }
      rows.push({ pts: row, v });
    }
    const armYs = [];
    for (let y = YA; y < 4.2; y += 0.065) armYs.push(y);
    armYs.push(4.22, 4.25, 4.27, 4.28);
    for (const y of armYs) { const row = []; for (let j = 0; j <= SEG; j++) row.push(surf(y, j / SEG * Math.PI * 2)); rows.push({ pts: row, y }); }
    const pos = [], uv = [], col = [], A = [], Bn = [], Wt = [], Cw = [], Cb = [], Dw = [], Db = [], idx = [];
    let arc = 0;
    rows.forEach((R, i) => {
      if (i) { let d = 0; for (let j = 0; j < SEG; j++) d += R.pts[j].distanceTo(rows[i - 1].pts[j]); arc += d / SEG; }
      let per = 0; for (let j = 0; j < SEG; j++) per += R.pts[j].distanceTo(R.pts[j + 1]);
      for (let j = 0; j <= SEG; j++) {
        const P = R.pts[j], ph = j / SEG * Math.PI * 2, ci = Math.cos(ph), y = R.y == null ? YA : R.y;
        pos.push(P.x, P.y, P.z);
        uv.push(0.3 + (j / SEG - 0.5) * per * 0.12, arc * 0.12);   // theo độ dài thật: hoa văn không bị kéo khi vòng thu từ thân về tay
        const ao = Math.max(0.5, 1 - 5.5 * Math.max(0, -P.fold - 0.002) + 1.2 * Math.max(0, P.fold)) * (1 - 0.12 * sm(ci) * Gs(y - 0.8, 0.8));
        col.push(Math.min(1.04, ao), Math.min(1.04, ao), Math.min(1.04, ao));
        // da chuyển dần: ngực -> xương đòn -> chỏm vai (chỉ đổi hướng) -> cánh tay (vặn trải dọc bắp tay) -> cẳng tay
        // mặt trước đoạn nối theo thêm khớp sửa hình: đẩy ra khi tay đưa trước, không gập thành mép
        // xương thứ ba: trước vai theo khớp sửa hình (fix); sau-dưới nách (cơ xô) theo thẳng cánh tay (upS) để vải giãn căng từ lưng tới bắp tay,
        // chỉ theo ngực + xương đòn (45% góc giơ) thì giơ tay ra là nếp gập ở nách sau
        const snp = Math.sin(ph);
        // xương thứ tư: nếp nách trước (cơ ngực) theo một phần cánh tay -> ôm súng tay chéo trước ngực không gập lõm ở vai trước
        if (snp < 0) { const pecW = sm(-snp / 0.5) * sm((Math.cos(ph) + 0.3) / 0.6); Db.push(3); Dw.push(PEC_FOLLOW * pecW * (R.y == null ? sm(R.v / 0.7) : sm((yr0(ph) - y) / 0.4))); }
        // mặt sau vai: tay vươn trước / chéo ngực thì vải sau vai trộn tuyến tính ngực -> xương đòn bị kéo theo dây cung thành túi lõm sau chỏm vai;
        // xương sửa hình sau (fixB, theo ngực, lùi ra sau theo độ vươn tay) đẩy vải ra lại
        else { Db.push(6); Dw.push(BACK_FIX_W * sm(snp / 0.45) * (R.y == null ? sm(R.v / 0.4) : sm((BACK_FIX_Y - y) / 0.45))); }
        if (snp < 0) { Cb.push(5); Cw.push(0.26 * sm(-snp / 0.6) * (R.y == null ? sm(R.v / 0.8) * (1 - 0.45 * sm((R.v - 0.66) / 0.34)) : sm((0.78 - y) / 0.58))); }   // corrective trước vai tắt trước chỏm delta để tránh vun thành cục khi ôm súng
        else { const latW = sm(snp / 0.5) * sm((Math.cos(ph) + 0.3) / 0.6); Cb.push(3); Cw.push(LAT_FOLLOW * latW * (R.y == null ? sm(R.v / 0.7) : sm((yr0(ph) - y) / 0.4))); }
        if (R.y == null) { A.push(4); Bn.push(0); Wt.push(sm(R.v)); }
        else {
          // mặt sau + nách giãn dài hơn (cơ delta sau, cơ lưng rộng căng từ lưng sang bắp tay): tay đưa ra trước không tạo rãnh sâu giữa đầu tay và lưng
          const yr = 0.85 + BACK_WEB * sm(Math.sin(ph) / 0.7 + 0.15);   // 1,3 cũ: nửa trên bắp tay bám xương đòn (chỉ theo 45% góc nâng) -> tay đưa ra là đoạn trên còn chúc xuống, gập thành cục u ở vai
          if (y < yr) { A.push(0); Bn.push(3); Wt.push(Math.pow(sm((y - YA) / (yr - YA)), 1 + 0.6 * sm(Math.sin(ph) / 0.7))); }
          else if (y < 2.1) { A.push(3); Bn.push(1); Wt.push(sm((y - yr) / (2.1 - yr))); }
          else { const bH = 0.24 - 0.14 * sm(Math.sin(ph) / 0.7); A.push(1); Bn.push(2); Wt.push(sm((y - YE + bH) / (2 * bH))); }   // dải trộn khuỷu hẹp: gập tay ra mỏm khuỷu, không thành quả bóng tròn (0,76 cũ)
        }
      }
    });
    for (let i = 0; i < rows.length - 1; i++) for (let j = 0; j < SEG; j++) { const a = i * C1 + j, b = a + C1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx); g.computeVertexNormals();
    const k = 40 * C1 + Math.round(SEG / 2), N = g.attributes.normal;   // kiểm chiều mặt: mặt ngoài cánh tay phải quay ra ngoài
    if (N.getX(k) * s < 0) { for (let t = 0; t < idx.length; t += 3) { const q = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = q; } g.setIndex(idx); g.computeVertexNormals(); }
    weldNormals(g);
    // vòng gốc mang pháp tuyến của thân áo: không có đường sáng tối ở chỗ nối
    for (let i = 0; i < 6; i++) for (let j = 0; j <= SEG; j++) {
      const q = i * C1 + j, w = 1 - i / 6, n = rowN[j], gx = N.getX(q) + (n.x - N.getX(q)) * w, gy = N.getY(q) + (n.y - N.getY(q)) * w, gz = N.getZ(q) + (n.z - N.getZ(q)) * w, m = Math.hypot(gx, gy, gz) || 1;
      N.setXYZ(q, gx / m, gy / m, gz / m);
    }
    g.userData.blend = { bones: [clav, up, fore, upS, chest, fix, fixB], a: new Uint8Array(A), b: new Uint8Array(Bn), w: new Float32Array(Wt), c: 5, cb: new Uint8Array(Cb), cw: new Float32Array(Cw), d: 3, db: new Uint8Array(Db), dw: new Float32Array(Dw) };
    return g;
  }

  const TORSO_UNDER_SLEEVE = 0.08;
  function torsoGeo() {
    if (GEO.torso) return GEO.torso;
    // đáy áo kết thúc ngay dưới thắt lưng, thu nhỏ hơn cạp quần (áo bỏ trong quần) — trước thòng tới -1,45 thành ống đáy
    // phẳng chụp ngoài quần: gờ ngang cắt qua bụng dưới như mặc váy ngắn ngoài quần
    const prof = [[0.0, -0.8], [1.22, -0.8], [1.3, -0.6], ...TORSO_PROF, [0.0, 3.56]];
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
      const ao = Math.max(0.55, 1 - 7 * Math.max(0, -f)) * (1 - 0.1 * sm((ax - 1.15) / 0.5) * Gy(y - 2.35, 0.55));
      col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = ao;
    }
    // phần thân nằm trong đường may raglan lún vào: vải tay áo (vai, bả vai, nếp nách sau) luôn phủ ngoài.
    // Không lún thì giơ tay ra mặt lưng đứng yên trùm lên mép tay áo thành bậc, vai sau như cục tròn tách khỏi lưng.
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i), ax = Math.abs(x), cr = RING_SEAM(y, z > 0);
      if (cr == null) continue;
      const w = sm((ax / (lerpTab(TORSO_PROF, Math.min(3.5, y)) * 1.02) - cr - 0.05) / 0.12);   // lùi vào trong đường may: mép tay áo vẫn chìm dưới thân
      if (w <= 0) continue;
      const r = Math.hypot(x, z) || 1, k = 1 - TORSO_UNDER_SLEEVE * w / r;
      P.setX(i, x * k); P.setZ(i, z * k);
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
    const g = new THREE.LatheGeometry(SHAFT_PROF.map(q => new THREE.Vector2(q[0], q[1])), 20), p = g.attributes.position;
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
    const NU = 22, NA = mode === 'upper' || mode === 'toe' ? 14 : 12, pos = [], idx = [], u0 = mode === 'toe' ? 0.68 : 0, N = Math.round(NU * (1 - u0));
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
      return (GEO[key] = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.concat(back), true), 48, 0.016, 3, true));
    }
    if (kind === 'lugs') {
      const list = [];
      for (let z = 0.38; z > -1.56; z -= 0.2) {
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
    gripR: V(0, -0.32, 0.1), gripL: V(0, 0.2, -1.5),   // nắm gần ổ đạn: súng kéo sát người nên tay đỡ không duỗi thẳng
    axisR: V(0, 0.98, 0.2).normalize(), axisL: V(0, 0, -1), palmKR: 0.75,   // cổ tay gập ~40° (trục theo đúng độ nghiêng báng cho ~80°, gần giới hạn khớp)
    palmR: V(-1, 0, 0), palmL: V(0, 1, 0),
    elbowR: V(2.6, -0.35, 1.0), elbowL: V(-2.35, 0.45, -0.4),   // khuỷu phải chếch xuống ~45° (thế bắn hiện đại); (3, 0,9) cũ nâng ngang vai kiểu cánh gà, nhìn từ sau bắp tay thành khúc giò nằm ngang
    elbowReadyR: V(2.2, -1.6, 1.2), elbowReadyL: V(-2.65, 0.05, -0.2),
    readySlideL: 0.28, butt: V(0, 0.18, 2.55),
    yawL: 0.7   // ốp súng nằm chéo trong lòng bàn tay đỡ tới ~40°: ngón cái song song nòng thì khuỷu nào cũng phải vặn cẳng tay ~135° (người thật tối đa ~90°)
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

  // tấm mặt bên có lỗ khoét thật (holes: danh sách đa giác toạ độ z, y): nhìn nghiêng thấy thành lỗ, thấy bóng trong lỗ
  function holedPlate(key, pts, holes, T, bev = 0.012) {
    if (GEO[key]) return GEO[key];
    const sh = new THREE.Shape();
    pts.forEach((q, i) => (i ? sh.lineTo(q[0], q[1]) : sh.moveTo(q[0], q[1])));
    for (const h of holes) { const P = new THREE.Path(); h.forEach((q, i) => (i ? P.lineTo(q[0], q[1]) : P.moveTo(q[0], q[1]))); sh.holes.push(P); }
    const g = new THREE.ExtrudeGeometry(sh, { depth: Math.max(0.001, T - 2 * bev), bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 1, curveSegments: 2 });
    g.translate(0, 0, -(T - 2 * bev) / 2);
    g.rotateY(-Math.PI / 2);
    g.computeVertexNormals();
    return (GEO[key] = g);
  }
  // lỗ chữ nhật vát góc, tâm (z, y)
  const chamRect = (z, y, w, h, c = 0.04) => [[z - w / 2 + c, y - h / 2], [z + w / 2 - c, y - h / 2], [z + w / 2, y - h / 2 + c], [z + w / 2, y + h / 2 - c], [z + w / 2 - c, y + h / 2], [z - w / 2 + c, y + h / 2], [z - w / 2, y + h / 2 - c], [z - w / 2, y - h / 2 + c]];

  // bo tròn góc đa giác (bán kính r, tự thu nhỏ theo cạnh ngắn): súng thật đúc / phay không có góc sắc
  function roundPoly(pts, r, seg = 3) {
    const n = pts.length, out = [];
    for (let i = 0; i < n; i++) {
      const P = pts[i], A = pts[(i + n - 1) % n], B = pts[(i + 1) % n];
      const la = Math.hypot(A[0] - P[0], A[1] - P[1]), lb = Math.hypot(B[0] - P[0], B[1] - P[1]), d = Math.min(r, la * 0.45, lb * 0.45);
      const a = [P[0] + (A[0] - P[0]) / la * d, P[1] + (A[1] - P[1]) / la * d], b = [P[0] + (B[0] - P[0]) / lb * d, P[1] + (B[1] - P[1]) / lb * d];
      for (let k = 0; k <= seg; k++) { const t = k / seg, u = 1 - t; out.push([u * u * a[0] + 2 * u * t * P[0] + t * t * b[0], u * u * a[1] + 2 * u * t * P[1] + t * t * b[1]]); }
    }
    return out;
  }
  // vỏ cong cắt theo cung (a0..a1 rad, r0 trong, r1 ngoài), đùn dọc +z từ gốc: làm thật độ dày áo nòng
  function arcShell(key, r0, r1, a0, a1, len) {
    if (GEO[key]) return GEO[key];
    const sh = new THREE.Shape(), N = 10;
    for (let k = 0; k <= N; k++) { const a = a0 + (a1 - a0) * k / N, x = Math.cos(a) * r1, y = Math.sin(a) * r1; k ? sh.lineTo(x, y) : sh.moveTo(x, y); }
    for (let k = N; k >= 0; k--) { const a = a0 + (a1 - a0) * k / N; sh.lineTo(Math.cos(a) * r0, Math.sin(a) * r0); }
    const g = new THREE.ExtrudeGeometry(sh, { depth: len, bevelEnabled: false, curveSegments: 2 });
    g.computeVertexNormals();
    return (GEO[key] = g);
  }
  // vòng tròn dày, đùn dọc +z từ gốc
  function ringGeo(key, r0, r1, len) {
    if (GEO[key]) return GEO[key];
    const sh = new THREE.Shape(); sh.absarc(0, 0, r1, 0, Math.PI * 2, false);
    const h = new THREE.Path(); h.absarc(0, 0, r0, 0, Math.PI * 2, true); sh.holes.push(h);
    const g = new THREE.ExtrudeGeometry(sh, { depth: len, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 1, curveSegments: 14 });
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
    const chg = new THREE.Group(); g.add(chg);   // tay kéo khoá nòng: xương riêng để kéo được khi nạp băng rỗng
    add(chg, rbox(0.3, 0.06, 0.12), gun, 0, 0.47, 0.42);
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
    const magG = new THREE.Group(); g.add(magG);   // băng đạn: xương riêng để tay rút / lắp được
    add(magG, sideGeo('rMag', [[-0.64, -0.42], [-1.18, -0.42], [-1.35, -0.95, -1.62, -1.42], [-1.08, -1.58], [-0.9, -1.0, -0.64, -0.42]], 0.24, 0.04, true), fde, 0, 0, 0);
    for (let k = 0; k < 3; k++) add(magG, rbox(0.255, 0.04, 0.42), fde, 0, -0.7 - k * 0.16, -0.95 - k * 0.07, 0.2 + k * 0.08, 0, 0);
    add(magG, sideGeo('rMagB', [[-1.04, -1.5], [-1.66, -1.36], [-1.72, -1.5], [-1.1, -1.66]], 0.27, 0.03), poly, 0, 0, 0);
    // ốp lót tay bát giác có rãnh M-LOK + ray trên
    const hg = add(g, new THREE.CylinderGeometry(0.21, 0.21, 2.25, 8), gun, 0, B, -2.55, Math.PI / 2, 0, 0); hg.rotation.y = Math.PI / 8;
    for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) add(g, rbox(0.03, 0.09, 0.3), dark, sx * 0.2, B, -1.9 - k * 0.45);
    for (let k = 0; k < 4; k++) add(g, rbox(0.1, 0.03, 0.3), dark, 0, B - 0.2, -1.9 - k * 0.45);
    add(g, rbox(0.2, 0.06, 2.2), gun, 0, 0.47, -2.55);
    for (let k = 0; k < 15; k++) add(g, rbox(0.22, 0.035, 0.07), gun, 0, 0.515, -1.5 - k * 0.145);
    // nòng, khối trích khí, đầu ngắm gập, loa che lửa
    // tổng dài ~89 cm (nòng 11,5", 98 cm cũ dài hơn súng thật): miệng loa che lửa ở RIFLE_MUZZLE_Z
    tubeX(0.058, 0.62, -3.96, gun, 10);
    add(g, rbox(0.17, 0.2, 0.18), gun, 0, B + 0.02, -3.82);
    tubeX(0.08, 0.06, -4.13, gun);
    const fh = tubeX(0.085, 0.4, -4.35, gun, 6);
    for (let k = 0; k < 3; k++) add(g, rbox(0.02, 0.06, 0.24), dark, Math.cos(k * 2.1) * 0.085, B + Math.sin(k * 2.1) * 0.085, -4.4, 0, 0, k * 2.1);
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
    g.userData.rifle = { mag: magG, chg };
    g.scale.setScalar(0.92);
    return g;
  }

  // ---------- SÚNG PHÓNG LỰU Ổ QUAY 6 VIÊN 40 MM (vũ khí chính bộ binh) ----------
  // Lựu 40x46 mm sơ tốc thấp, đạn nổ lõm-mảnh (HEDP ~65 mm thép: thủng xe bọc thép nhẹ, nóc / đuôi / sườn mỏng xe tăng,
  // phá kính ngắm, xích, đồ gắn ngoài) — bắn theo Grenade40 của game. Dài ~72 cm.
  // Kết cấu như súng ổ quay thật: KHUNG CHỮ C ôm ổ đạn (thanh trên có ray, tấm đỡ nòng trước, thanh dưới, khối cò sau),
  // ổ đạn khía rãnh có miệng 6 buồng + nắp lò xo sau, ốp ray vuông quanh nòng (tay đỡ), báng rút có tì má, báng cầm khía ngón.
  // Cùng hệ trục với súng trường (gốc tại báng cầm, nòng -z, trục ngắm y 0.78, báng vai z 2.55) để dùng chung thế cầm.
  const GL_VFG_Y = -0.42, GL_VFG_Z = -1.78;   // tâm tay nắm đứng dưới ốp (hệ súng, cụm trước fr), sát tấm đỡ nòng: xa hơn thì thế hạ súng tay trái duỗi thẳng
  const GL = {
    gripR: V(0, -0.32, 0.1), gripL: V(0, GL_VFG_Y, GL_VFG_Z),   // tay trái nắm tay nắm đứng: ngón cái lên, lòng tay áp mặt trái tay nắm
    axisR: V(0, 0.98, 0.2).normalize(), axisL: V(0, 1, 0), palmKR: 0.75,   // cổ tay gập ~40° (trục theo đúng độ nghiêng báng cho ~80°, gần giới hạn khớp)
    palmR: V(-1, 0, 0), palmL: V(1, 0, 0),
    elbowR: V(2.6, -0.35, 1.0), elbowL: V(-3.1, -0.2, -0.2),   // khuỷu trái choãi ra ngoài sườn
    elbowReadyR: V(2.2, -1.6, 1.2), elbowReadyL: V(-3.3, -0.6, 0),
    readySlideL: 0, butt: V(0, 0.18, 2.55),   // tay nắm đứng: tay trái không trượt dọc ốp
    yawL: 0.4
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
  // viên lựu 40 mm: trục +y (đầu đạn), gốc giữa thân, đáy vỏ y -0,38. Dùng chung lưới với băng đạn đeo người
  const GL_HINGE = V(-0.18, 0.22, -1.36), GL_OPEN = 0.72, GL_DRUM_Z = -0.68, GL_CH_R = 0.36, GL_ROUND_Z = 0.1;
  const gl40Case = () => lathe('gl40Case', [[0, -0.38], [0.162, -0.38], [0.162, -0.34], [0.15, -0.33], [0.15, -0.02], [0.13, 0], [0, 0]], 14);
  const gl40Head = () => lathe('gl40Head', [[0, -0.02], [0.152, -0.02], [0.154, 0.1], [0.146, 0.18], [0.12, 0.27], [0.085, 0.33], [0.062, 0.37], [0.058, 0.38], [0, 0.38]], 14);
  function glRound(M, add) {
    const r = new THREE.Group();
    const alu = M.glAlu || (M.glAlu = new THREE.MeshStandardMaterial({ color: 0x5f5c4c, roughness: 0.5, metalness: 0.55 }));
    const head = M.glPaint || (M.glPaint = new THREE.MeshStandardMaterial({ color: 0x3a3d2e, roughness: 0.68, metalness: 0.3 }));
    add(r, gl40Case(), alu, 0, 0, 0).userData.lod0Only = true;   // ở xa đạn chìm trong ổ, không thấy
    add(r, gl40Head(), head, 0, 0, 0).userData.lod0Only = true;
    return r;
  }
  function buildGL(M, add) {
    const g = new THREE.Group();
    const steel = M.glSteel || (M.glSteel = new THREE.MeshStandardMaterial({ color: 0x2c2d2b, roughness: 0.42, metalness: 0.6 }));
    const park = M.glPark || (M.glPark = new THREE.MeshStandardMaterial({ color: 0x1f201e, roughness: 0.62, metalness: 0.35 }));   // thép phốt phát mờ
    const od = M.glOD || (M.glOD = new THREE.MeshStandardMaterial({ color: 0x2f3226, roughness: 0.82, metalness: 0.05 }));          // polymer rêu sẫm
    const paint = M.glPaint || (M.glPaint = new THREE.MeshStandardMaterial({ color: 0x3a3d2e, roughness: 0.68, metalness: 0.3 }));  // sơn ô-liu bạc trên ổ đạn
    const rub = M.gunD || (M.gunD = new THREE.MeshStandardMaterial({ color: 0x0b0b0a, roughness: 0.7 }));
    const B = 0.22, DY = B - 0.36;                                     // trục nòng / tâm ổ đạn (buồng trên cùng thẳng nòng)
    const tubeZ = (r, l, z, mat, y = B, seg = 18, x = 0, parent = g) => add(parent, new THREE.CylinderGeometry(r, r, l, seg), mat, x, y, z, Math.PI / 2, 0, 0);

    // ---- KHUNG CHỮ C ôm ổ đạn ----
    add(g, sideGeo('gl2Top', [[0.62, 0.38], [-1.52, 0.38], [-1.52, 0.56], [0.5, 0.56], [0.62, 0.5]], 0.34, 0.04), park, 0, 0, 0);        // thanh trên
    for (let k = 0; k < 13; k++) add(g, rbox(0.3, 0.05, 0.08), park, 0, 0.6, 0.48 - k * 0.15);                                          // răng ray
    // CỤM TRƯỚC (tấm đỡ, nòng, ốp, ổ đạn) xoay quanh chốt bản lề GL_HINGE để lộ đáy buồng đạn khi nạp; khung sau + báng đứng yên.
    // hinge, fr, drum, từng viên đạn là Group nên thành xương khi bake. fr giữ toạ độ hệ súng cho dễ đặt chi tiết.
    const hinge = new THREE.Group(); hinge.position.copy(GL_HINGE); g.add(hinge);
    const fr = new THREE.Group(); fr.position.copy(GL_HINGE).negate(); hinge.add(fr);
    add(fr, sideGeo('gl2Front', [[-1.2, 0.4], [-1.52, 0.4], [-1.52, -0.66], [-1.36, -0.78], [-1.2, -0.7]], 0.4, 0.05), park, 0, 0, 0);     // tấm đỡ nòng
    add(g, sideGeo('gl2Bot', [[-0.12, -0.7], [-1.3, -0.7], [-1.3, -0.82], [-0.12, -0.82]], 0.22, 0.03), park, 0, 0, 0);                  // thanh dưới
    add(g, sideGeo('gl2Rear', [[0.62, 0.42], [-0.16, 0.42], [-0.16, -0.62], [0.05, -0.74], [0.26, -0.3], [0.62, -0.12]], 0.36, 0.05), park, 0, 0, 0);   // khối cò
    add(fr, new THREE.CylinderGeometry(0.07, 0.07, 0.42, 10), steel, 0.19, DY, -1.36, 0, 0, Math.PI / 2);                                 // chốt trục ổ
    add(g, rbox(0.06, 0.16, 0.24), steel, 0.2, 0.18, 0.1);                                                                              // lẫy mở khung: trên khối sau, trong tầm ngón cái tay cầm

    // ---- Ổ ĐẠN ----
    const drum = new THREE.Group(); drum.position.set(0, DY, GL_DRUM_Z); fr.add(drum);
    add(drum, drumGeo(), paint, 0, 0, 0);
    const rounds = [];
    for (let k = 0; k < 6; k++) {
      const a = k / 6 * Math.PI * 2 + Math.PI / 2, cx = Math.cos(a) * GL_CH_R, cy = Math.sin(a) * GL_CH_R;
      add(drum, new THREE.CylinderGeometry(0.175, 0.175, 0.03, 16), rub, cx, cy, 0.455, Math.PI / 2, 0, 0);                            // miệng buồng (đáy ổ)
      add(drum, new THREE.TorusGeometry(0.175, 0.022, 6, 16), steel, cx, cy, 0.465);
      const r = glRound(M, add); r.position.set(cx, cy, GL_ROUND_Z); r.rotation.x = -Math.PI / 2; drum.add(r); rounds.push(r);
    }
    add(drum, new THREE.CylinderGeometry(0.1, 0.1, 0.05, 12), steel, 0, 0, 0.47, Math.PI / 2, 0, 0);                                    // đầu trục ổ
    add(drum, new THREE.SphereGeometry(0.38, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), paint, 0, 0, -0.46, -Math.PI / 2, 0, 0).scale.set(1, 0.15, 1);   // hộp lò xo mặt trước
    add(drum, new THREE.TorusGeometry(0.43, 0.025, 6, 28), steel, 0, 0, -0.46);
    // viên đạn đang cầm trên tay: bình thường giấu trong ốp, lúc nạp holdRifleBlend mới đặt ra ngoài
    const hRound = glRound(M, add); hRound.position.set(0, B, -2.1); hRound.rotation.x = -Math.PI / 2; g.add(hRound);
    g.userData.gl = { hinge, fr, drum, rounds, hRound };

    // ---- NÒNG + ỐP RAY VUÔNG (tay đỡ) ----
    tubeZ(0.19, 1.95, -2.5, steel, B, 18, 0, fr);
    tubeZ(0.215, 0.14, -3.42, steel, B, 18, 0, fr);                                                                                                   // vành miệng nòng
    add(fr, new THREE.CircleGeometry(0.155, 18), rub, 0, B, -3.5, 0, Math.PI, 0);
    add(fr, rbox(0.5, 0.5, 1.25), od, 0, B, -2.12);                                                                                       // ốp ray
    for (const [rx, ry, rz] of [[0, 0.28, 0], [0, -0.28, 0], [0.28, 0, Math.PI / 2], [-0.28, 0, Math.PI / 2]]) {
      for (let k = 0; k < 7; k++) add(fr, rbox(0.2, 0.05, 0.08), park, rx, B + ry, -1.6 - k * 0.17, 0, 0, rz);                             // ray 4 mặt
    }
    for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) add(fr, rbox(0.02, 0.18, 0.22), rub, sx * 0.255, B - 0.02, -1.78 - k * 0.32);       // khe thoát nhiệt
    // TAY NẮM ĐỨNG dưới ốp (như súng phóng lựu ổ quay thật): chỗ tay trái nắm. Không có nó thì tay đỡ chỉ còn mép trước ổ đạn, cổ tay bẻ ngoặt
    add(fr, rbox(0.24, 0.08, 0.38), park, 0, B - 0.29, GL_VFG_Z);                                                                      // đế kẹp ray
    add(fr, new THREE.CylinderGeometry(0.125, 0.14, 0.62, 12), od, 0, GL_VFG_Y, GL_VFG_Z);
    for (let k = 0; k < 3; k++) add(fr, new THREE.TorusGeometry(0.128, 0.018, 4, 12), od, 0, GL_VFG_Y + 0.15 - k * 0.15, GL_VFG_Z, Math.PI / 2, 0, 0).userData.lod0Only = true;   // gờ ngón
    add(fr, new THREE.CylinderGeometry(0.16, 0.15, 0.06, 12), rub, 0, GL_VFG_Y - 0.33, GL_VFG_Z);                                      // nắp đáy

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
    for (const z of [-0.9, 1.85]) add(g, new THREE.TorusGeometry(0.07, 0.018, 4, 10), steel, z > 0 ? 0.2 : 0.14, z > 0 ? 0.1 : -0.76, z, 0, Math.PI / 2, 0);
    const sl = new THREE.CatmullRomCurve3([V(0.16, -0.78, -0.9), V(0.34, -1.2, -0.4), V(0.34, -1.2, 0.6), V(0.22, 0.1, 1.85)]);
    add(g, strapGeo(sl, 0.12, 0.025, 'gl2Sling', V(0, 1.2, -0.3)), M.web2, 0, 0, 0);
    const F0 = fieldMats(M);
    tapeWrap(g, add, F0.tape, 0, B + 0.02, 0.72, 1.0, 0.125, 1);              // băng keo ống báng
    tapeWrap(fr, add, F0.cord, 0, B, -2.85, -3.15, 0.2, 2);                   // dây dù quấn nòng: thuộc cụm trước, mở khung thì đi theo nòng
    add(g, rbox(0.3, 0.36, 0.3), F0.tape, 0, 0.42, 1.55);                     // băng keo quấn cổ báng
    g.scale.setScalar(0.92);
    return g;
  }

  // ---------- VŨ KHÍ HỖ TRỢ: ỐNG PHÓNG CHỐNG TĂNG + CỐI 60 MM ----------
  // Báng cầm dùng chung mặt cắt với súng phóng lựu (cùng chỗ nắm tay phải); cùng hệ trục: gốc tại báng cầm, nòng / ống -z.
  const PISTOL_GRIP = [[0.42, -0.1], [0.06, -0.1], [0.12, -0.3], [0.16, -0.36, 0.22, -0.44], [0.26, -0.55, 0.32, -0.64], [0.36, -0.93], [0.74, -0.95], [0.8, -0.82], [0.62, -0.42]];
  function pistolGrip(g, add, mat, park, steel) {
    add(g, sideGeo('gl2Grip', PISTOL_GRIP, 0.26, 0.05, true), mat, 0, -0.02, 0.02);
    add(g, new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(0, -0.12, 0.06), V(0, -0.38, 0.02), V(0, -0.42, -0.24), V(0, -0.36, -0.46), V(0, -0.2, -0.5)]), 14, 0.032, 6, false), park, 0, 0, 0);   // vành cò
    add(g, new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(0, -0.12, -0.2), V(0, -0.24, -0.24), V(0, -0.32, -0.18)]), 8, 0.028, 6, false), steel, 0, 0, 0);   // cò
  }
  const probesOf = (list) => list.map(q => [V(q[0], q[1], q[2]), q[3]]);
  const lathe = (key, prof, seg = 20) => GEO[key] || (GEO[key] = new THREE.LatheGeometry(prof.map(q => new THREE.Vector2(q[0], q[1])), seg));
  // đầu đạn chống tăng 85 mm kiểu PG-7 (trục +y, gốc tại chân cổ đạn): cổ nối động cơ Ø40, côn đuôi, đoạn trụ Ø85, mũi nón thẳng cạnh tới mũ ngòi.
  // Điểm lặp ở mỗi chỗ gãy: pháp tuyến không làm mượt qua mép, giữ cạnh sắc (profile cong đều trước đây trông như quả thoi)
  const rocketHeadGeo = () => lathe('rpgHead4', [[0, 0], [0.16, 0], [0.16, 0.16], [0.16, 0.16], [0.343, 0.62], [0.343, 0.62], [0.343, 1.05], [0.343, 1.05], [0.098, 2.23]], 32);
  const rocketMats = (M) => ({
    head: M.rpgHead3 || (M.rpgHead3 = new THREE.MeshStandardMaterial({ color: 0x34362a, roughness: 0.66, metalness: 0.15 })),   // sơn ô-liu bán mờ
    fuse: M.rpgFuse3 || (M.rpgFuse3 = new THREE.MeshStandardMaterial({ color: 0x4a4b42, roughness: 0.5, metalness: 0.5 })),    // nhôm mũ ngòi
    seam: M.rpgSeam || (M.rpgSeam = new THREE.MeshStandardMaterial({ color: 0x2b2d22, roughness: 0.6, metalness: 0.3 }))        // đai nối
  });
  // đầu đạn + đai nối thân + mũ ngòi; đặt theo trục dir (mặc định +y)
  function addRocketHead(parent, add, M, x, y, z, rx = 0, ry = 0, rz = 0) {
    const R = rocketMats(M);
    add(parent, rocketHeadGeo(), R.head, x, y, z, rx, ry, rz);
    const e = new THREE.Euler(rx, ry, rz), up = V(0, 1, 0).applyEuler(e), at = (d) => [x + up.x * d, y + up.y * d, z + up.z * d];
    add(parent, GEO.rpgSeam || (GEO.rpgSeam = new THREE.CylinderGeometry(0.351, 0.351, 0.03, 32, 1, true)), R.seam, ...at(0.64), rx, ry, rz);   // đường nối đoạn trụ - côn đuôi
    add(parent, lathe('rpgNose', [[0, 2.23], [0.098, 2.23], [0.098, 2.27], [0.082, 2.33], [0.05, 2.375], [0, 2.39]], 18), R.fuse, x, y, z, rx, ry, rz);   // mũ ngòi áp điện
    add(parent, GEO.rpgMotor || (GEO.rpgMotor = new THREE.CylinderGeometry(0.17, 0.17, 0.08, 20)), R.seam, ...at(0.12), rx, ry, rz);   // vòng nối động cơ
  }
  // nắp nhựa + chốt an toàn che ngòi áp điện: chỉ rút khi đạn đã nằm trong ống
  function addRocketCap(parent, add, M, x, y, z, rx = 0, ry = 0, rz = 0) {
    const cm = M.rpgCap || (M.rpgCap = new THREE.MeshStandardMaterial({ color: 0x2a2b22, roughness: 0.72, metalness: 0.02 }));
    add(parent, lathe('rpgCapG', [[0.152, 2.03], [0.146, 2.12], [0.13, 2.28], [0.1, 2.42], [0, 2.47]], 18), cm, x, y, z, rx, ry, rz);
  }

  // ---------- ỐNG PHÓNG CHỐNG TĂNG VÁC VAI (kiểu RPG) ----------
  // Ống thép Ø40 mm dài ~95 cm, đầu đạn 85 mm lắp sẵn chìa trước miệng ống; ốp gỗ cách nhiệt chỗ tay đỡ và chỗ tì vai,
  // buồng đốt phình sau báng cầm, loa phụt loe phía sau; kính ngắm quang bắt bên trái ống. Trục ống y RPG_B.
  // Bắn từ vai phải: mặt dưới ốp gỗ sau đặt lên đỉnh vai (pocket riêng, súng trường tì hốc vai), tay trái nắm ốp gỗ trước.
  const RPG_B = 0.86;
  const RPG_SIGHT = { x: -0.8, y: RPG_B + 0.56, z: -0.75 };   // tâm thân kính, trục quang đi qua x, y
  const RPG_SHOULDER_Z = 1.65;   // 1,05 cũ: tay cầm sát vai 13 cm, khuỷu gập 150-160°
  const RPG_MOTOR = 2.0;         // động cơ phía sau đầu đạn, vừa trong ba lô (cao 2,1) và trong ống
  const RPG = {
    // tay phải: tâm báng cầm thật (PISTOL_GRIP, giữa mép trước - mép sau ở nửa dưới), trục theo đúng độ nghiêng báng (đầu báng ngả về trước).
    // Điểm cũ (0, -0,32, 0,1) nằm ở mép trước sát vành cò, trục nghiêng ngược ~28°: bàn tay đúc dáng nắm không ôm được báng, trông như xoè tay cạnh báng.
    // tay trái: tay cầm đứng dưới ray ốp trước (RPG_FOREGRIP). Nắm thẳng ống Ø 6,4 cm thì bàn tay đúc dáng nắm cán nhỏ phải dựng đứng ôm hông ống
    gripR: V(0, -0.62, 0.51), gripL: V(0, RPG_B - 0.72, -1.55),
    axisR: V(0, 0.932, -0.362).normalize(), axisL: V(0, 1, 0), palmKR: 0.75,
    palmR: V(-1, 0, 0), palmL: V(1, 0, 0),
    elbowR: V(2.6, -0.8, 1.0), elbowL: V(-2.4, -0.4, -0.4),
    elbowReadyR: V(2.2, -1.6, 1.2), elbowReadyL: V(-2.65, -0.1, -0.2),
    readySlideL: 0, butt: V(0, RPG_B - 0.25, RPG_SHOULDER_Z), pocket: V(1.2, 3.66, -0.15),
    // đường ngắm riêng: mắt phải đặt sau thị kính (cách ~6 cm), đầu nhìn dọc ống và nghiêng nhẹ về phía ống áp má
    sight: { eye: V(RPG_SIGHT.x, RPG_SIGHT.y, RPG_SIGHT.z + 0.655 + 0.5), roll: -0.2 },
    readyLock: 1,   // thế sẵn sàng = vác vai: ống vẫn tì đỉnh vai, chỉ chúc nòng (cầm chúc như súng trường thì loa phụt dựng trước mặt)
    probes: probesOf([[0, RPG_B - 0.72, -1.55, 0.16], [0, RPG_B, -0.6, 0.22], [0, RPG_B, -1.6, 0.24], [0, RPG_B, -2.6, 0.18], [0, RPG_B, -3.6, 0.34], [0, -0.55, -0.25, 0.14]])
  };
  function buildRPG(M, add) {
    const g = new THREE.Group(), B = RPG_B;
    const steel = M.glSteel || (M.glSteel = new THREE.MeshStandardMaterial({ color: 0x2c2d2b, roughness: 0.42, metalness: 0.6 }));
    const park = M.glPark || (M.glPark = new THREE.MeshStandardMaterial({ color: 0x1f201e, roughness: 0.62, metalness: 0.35 }));
    const rub = M.gunD || (M.gunD = new THREE.MeshStandardMaterial({ color: 0x0b0b0a, roughness: 0.7 }));
    const poly = M.wPoly || (M.wPoly = new THREE.MeshStandardMaterial({ color: 0x191a17, roughness: 0.78, metalness: 0.05 }));    // polymer đen mờ
    const rgr = M.wRgr || (M.wRgr = new THREE.MeshStandardMaterial({ color: 0x34372b, roughness: 0.8, metalness: 0.05 }));        // polymer xanh rêu sẫm
    const inner = M.wIn || (M.wIn = new THREE.MeshStandardMaterial({ color: 0x0d0d0c, roughness: 0.9, side: THREE.BackSide }));   // lòng ống / loa nhìn từ trong
    const tubeZ = (r0, r1, l, z, mat, y = B, seg = 20, x = 0, open = false) => add(g, new THREE.CylinderGeometry(r0, r1, l, seg, 1, open), mat, x, y, z, -Math.PI / 2, 0, 0);   // r0 = đầu trước
    const rail = (x, y, z, len, rz = 0) => {                                                                                       // ray Picatinny: đế + răng
      add(g, rbox(0.17, 0.05, len), park, x, y, z, 0, 0, rz);
      const n = Math.floor(len / 0.105), ox = -Math.sin(rz) * 0.04, oy = Math.cos(rz) * 0.04;
      for (let k = 0; k < n; k++) add(g, rbox(0.19, 0.035, 0.055), park, x + ox, y + oy, z - len / 2 + 0.06 + k * 0.105, 0, 0, rz);
    };

    // ---- ỐNG phốt phát + vành gia cường miệng ----
    tubeZ(0.15, 0.15, 6.1, 0.35, park);                                      // ống z -2,7 .. 3,4
    tubeZ(0.19, 0.19, 0.2, -2.62, steel);                                    // vành miệng
    for (let k = 0; k < 4; k++) add(g, rbox(0.05, 0.05, 0.12), rub, Math.cos(k * Math.PI / 2 + 0.785) * 0.19, B + Math.sin(k * Math.PI / 2 + 0.785) * 0.19, -2.68);   // khía vành
    for (const z of [-2.35, 2.2, 3.05]) tubeZ(0.165, 0.165, 0.06, z, steel); // đai hàn ống
    // ---- ỐP TAY TRƯỚC: polymer bát giác, ray 3 mặt, khe thoát nhiệt ----
    add(g, new THREE.CylinderGeometry(0.255, 0.255, 1.36, 8), rgr, 0, B, -1.32, -Math.PI / 2, Math.PI / 8, 0);
    rail(0, B + 0.27, -1.32, 1.3);
    rail(0, B - 0.27, -1.32, 0.8, Math.PI);
    // TAY CẦM ĐỨNG kẹp ray dưới (RPG-7 cải tiến có ray): đế kẹp + thân có rãnh ngón + nắp đáy
    add(g, rbox(0.22, 0.09, 0.34), poly, 0, B - 0.36, -1.55);
    add(g, new THREE.CylinderGeometry(0.135, 0.15, 0.78, 12), poly, 0, B - 0.79, -1.55);
    for (let k = 0; k < 3; k++) add(g, new THREE.TorusGeometry(0.142, 0.018, 5, 14), rub, 0, B - 0.62 - k * 0.17, -1.55, Math.PI / 2, 0, 0);
    add(g, new THREE.CylinderGeometry(0.165, 0.165, 0.05, 12), park, 0, B - 1.2, -1.55);
    rail(0.27, B, -1.55, 0.6, -Math.PI / 2);
    for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) add(g, rbox(0.03, 0.09, 0.2), rub, sx * 0.24, B + 0.1, -1.85 + k * 0.27, 0, 0, -sx * 0.4);
    add(g, rbox(0.12, 0.18, 0.1), poly, 0, B + 0.38, -1.88);                // đầu ngắm cơ gập
    add(g, rbox(0.035, 0.12, 0.035), steel, 0, B + 0.52, -1.88);
    // ---- KHỐI CÒ: hộp polymer vát + báng cầm kiểu súng trường ----
    add(g, sideGeo('rpgRx2', [[0.72, B - 0.12], [-0.42, B - 0.12], [-0.42, 0.42], [-0.2, 0.1], [-0.2, -0.06], [0.46, -0.06], [0.62, 0.14], [0.72, 0.42]], 0.26, 0.04), park, 0, 0, 0);
    pistolGrip(g, add, poly, park, steel);
    for (const sx of [-1, 1]) {
      add(g, rbox(0.02, 0.3, 0.62), poly, sx * 0.135, 0.3, 0.14);            // tấm ốp lõm hai bên
      for (let k = 0; k < 5; k++) add(g, rbox(0.016, 0.22, 0.03), rub, sx * 0.148, 0.3, -0.06 + k * 0.1);   // gân chống trượt
      for (const z of [-0.26, 0.56]) add(g, new THREE.CylinderGeometry(0.035, 0.035, 0.02, 10), steel, sx * 0.135, 0.58, z, 0, 0, Math.PI / 2);   // đầu chốt
    }
    add(g, rbox(0.05, 0.08, 0.2), steel, 0.16, 0.56, 0.14);                  // cần an toàn
    // ---- BUỒNG ĐỐT phình + vòng tản nhiệt ----
    tubeZ(0.21, 0.21, 0.48, 0.3, park);
    for (let k = 0; k < 5; k++) tubeZ(0.235, 0.235, 0.035, 0.1 + k * 0.1, steel);
    // ---- ỐP TÌ VAI: polymer có gân cao su + đệm má ----
    add(g, new THREE.CylinderGeometry(0.255, 0.255, 1.3, 8), rgr, 0, B, 1.22, -Math.PI / 2, Math.PI / 8, 0);
    for (let k = 0; k < 6; k++) add(g, new THREE.CylinderGeometry(0.262, 0.262, 0.07, 8, 1, true), rub, 0, B, 0.72 + k * 0.2, -Math.PI / 2, Math.PI / 8, 0);
    add(g, rbox(0.14, 0.12, 0.9), rub, -0.17, B + 0.22, 1.25);               // đệm tì má
    // ---- LOA PHỤT: côn thép + vành gia cường + lòng tối ----
    tubeZ(0.16, 0.33, 1.0, 3.9, park, B, 24, 0, true);
    tubeZ(0.155, 0.32, 0.98, 3.9, inner, B, 24, 0, true);
    tubeZ(0.35, 0.35, 0.08, 4.38, steel, B, 24, 0, true);
    tubeZ(0.18, 0.18, 0.12, 3.42, steel);
    // ---- KÍNH NGẮM QUANG hộp bên trái trên giá kẹp: lệch trái ~10 cm để đầu nằm cạnh ống, thị kính ngay trên báng cầm ----
    const SX = RPG_SIGHT.x, SY = RPG_SIGHT.y, SZ = RPG_SIGHT.z;
    add(g, rbox(0.06, 0.34, 0.9), park, -0.2, B + 0.06, SZ);                 // ray kẹp bên
    add(g, rbox(-SX - 0.16, 0.1, 0.42), park, (SX - 0.2) / 2, SY - 0.3, SZ);  // giá vươn sang trái
    add(g, rbox(0.16, 0.14, 0.5), park, SX, SY - 0.22, SZ);                  // đế nâng
    add(g, rbox(0.22, 0.28, 0.82), poly, SX, SY - 0.02, SZ);                 // thân kính
    tubeZ(0.13, 0.13, 0.3, SZ - 0.52, poly, SY, 20, SX);                     // ống vật kính + loa che
    tubeZ(0.115, 0.13, 0.26, SZ + 0.52, rub, SY, 20, SX);                    // chụp mắt cao su
    add(g, new THREE.CircleGeometry(0.105, 18), M.lens, SX, SY, SZ - 0.675, 0, Math.PI, 0);
    add(g, new THREE.CircleGeometry(0.09, 18), M.lens, SX, SY, SZ + 0.655);
    add(g, new THREE.CylinderGeometry(0.075, 0.075, 0.1, 12), park, SX, SY + 0.17, SZ);   // núm tầm
    add(g, new THREE.CylinderGeometry(0.075, 0.075, 0.1, 12), park, SX - 0.14, SY - 0.02, SZ, 0, 0, Math.PI / 2);   // núm hướng
    add(g, rbox(0.04, 0.08, 0.16), steel, SX - 0.115, SY - 0.14, SZ + 0.25); // công tắc chiếu sáng vạch
    // ---- ĐẦU ĐẠN lắp sẵn ----
    // nhóm riêng (một xương): bắn xong thu đầu đạn lại, nạp xong hiện về (figure.rpgEmpty)
    const rk = new THREE.Group(); g.add(rk); g.userData.rocket = rk;
    addRocketHead(rk, add, M, 0, B, -2.6, -Math.PI / 2, 0, 0);
    const rkCap = new THREE.Group(); rk.add(rkCap); rk.userData.cap = rkCap;
    addRocketCap(rkCap, add, M, 0, B, -2.6, -Math.PI / 2, 0, 0);
    // búa ngoài bên phải khối cò, trong tầm ngón cái tay cầm báng; xương riêng, gốc tại trục búa, rotation.x > 0 ngả về sau
    const rpgHm = new THREE.Group(); rpgHm.position.set(0.17, 0.3, 0.58); g.add(rpgHm); g.userData.rpgHammer = rpgHm;
    add(rpgHm, rbox(0.045, 0.3, 0.075), steel, 0, 0.13, 0);
    add(rpgHm, rbox(0.055, 0.05, 0.15), steel, 0, 0.285, 0.045);
    add(g, new THREE.CylinderGeometry(0.045, 0.045, 0.06, 10), park, 0.17, 0.3, 0.58, 0, 0, Math.PI / 2);
    // động cơ + đuôi cánh gập: nằm khuất trong ống, chỉ lộ lúc tay rút đạn khỏi ba lô và đẩy vào miệng ống (trình tự RPG_RELOAD)
    { const Rm = rocketMats(M);
      add(rk, GEO.rpgTail || (GEO.rpgTail = new THREE.CylinderGeometry(0.13, 0.13, RPG_MOTOR, 14)), Rm.seam, 0, B, -2.6 + RPG_MOTOR / 2, -Math.PI / 2, 0, 0);
      for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.4; add(rk, GEO.rpgFin || (GEO.rpgFin = new THREE.BoxGeometry(0.02, 0.05, 0.62)), Rm.fuse, Math.cos(a) * 0.135, B + Math.sin(a) * 0.135, -2.6 + RPG_MOTOR - 0.34, 0, 0, a); } }
    // ---- khoen QD + dây đeo bản rộng ----
    for (const z of [-2.0, 1.95]) add(g, new THREE.TorusGeometry(0.075, 0.02, 5, 12), steel, 0.24, B - 0.22, z, 0, Math.PI / 2, 0);
    const sl = new THREE.CatmullRomCurve3([V(0.26, B - 0.24, -2.0), V(0.3, 0.35, -1.1), V(0.3, 0.2, 0.9), V(0.26, B - 0.24, 1.95)]);
    add(g, strapGeo(sl, 0.17, 0.03, 'rpgSling3', V(0, 1.6, 0)), M.web2, 0, 0, 0);
    const F0 = fieldMats(M);
    tapeWrap(g, add, F0.tape, 0, B, 2.35, 2.95, 0.17, 1);                    // băng keo sau ống
    tapeWrap(g, add, F0.cord, 0, B, -2.1, -2.45, 0.165, 2);                  // dây dù quấn trước ốp tay
    tapeWrap(g, add, M.pouch, 0, B, 2.98, 3.3, 0.175, 3);                    // vải rằn cách nhiệt tay đỡ sau
    ragStrips(g, add, F0.jute, 0, B, 3.0, 3.28, 0.18, 3, 0.7);
    add(g, new THREE.CylinderGeometry(0.135, 0.135, 0.03, 16), rub, SX + 0.17, SY + 0.12, SZ - 0.72, 1.0, 0, 0);   // nắp vật kính lật
    return g;
  }

  // ---------- UAV CẢM TỬ MANG VÁC (cỡ lính vác được kiểu Switchblade 300 / Hero-30: ống ~68 cm x 10,5 cm, nhỏ hơn ống trên nóc xe; thân UAV = KamiUAV.INF_SCALE) ----------
  // Gốc ống tại đáy (đầu đặt đất), nòng -z. Mang 3 ống dựng đứng trên khung lưng, miệng ống ngang vai. Phóng như thật: quỳ, tháo một
  // ống khỏi ba lô, đặt xuống đất trước gối phải, bung chân chống cho ống ngóc ~40°, rút tay về cầm máy điều khiển, bấm phóng từ
  // máy (không ai đứng sau / cầm ống lúc phóng); ống rỗng bỏ lại.
  const KAMI_L = 5.4, KAMI_R = 0.42, KAMI_EL = 0.7, KAMI_LEG_L = 2.9;
  const KAMI = {
    base: V(2.9, FOOT_Y + 0.5, 0.2),       // đáy ống khi đặt đất (hệ gốc nhân vật): cạnh gối phải đang quỳ, thân ống chếch ra trước trong tầm tay (vai ~7,5 đv trên đất, tay với ~4,9)
    via: V(3.4, 1.4, -0.6),                 // đường đưa ống từ sau lưng vòng qua vai phải xuống đất
    gripTop: V(0, 0, -3.6), gripMid: V(0, 0, -1.5), gripArm: V(0.56, 0.05, -3.2), gripHold: V(0, 0, -4.0),
    elbowR: V(2.6, -0.6, 0.3), elbowL: V(-1.8, -1.4, -0.4), elbowReach: V(1.6, 2.2, -1.2),   // với qua vai: khuỷu giơ cao trước mặt
    pad: V(0, 1.0, -1.36), padHold: V(0, 2.5, -3.5), padGrip: V(1.3, -0.45, -0.08), padRack: V(0, -0.98, -0.18), padRackAx: V(1, 0, 0), padRackPalm: V(0, 0.7, 0.7), padRackElbowR: V(3.4, 0.4, -1.8), padElbowR: V(4.8, -0.5, 0.3), padElbowL: V(-4.8, -0.5, 0.3),   // máy điều khiển: trong giá ngực / cầm trước ngực như máy tính bảng: hai tay ôm mép dưới, cẳng tay chạy dọc mép máy, khuỷu buông sát sườn
    kneeRest: V(-1.05, -3.88, -3.1), padTilt: 0.55, padHintK: 6, padScale: 0.82, lean: [-0.06, -0.07, -0.34]   // nhìn xuống máy: cúi nhẹ từ hông, khom lưng trên, gập cổ vừa phải (dồn hết vào cổ thì gập gắt, ngồi thẳng đơ)
  };
  // một lượt phóng (giây): với ra sau lưng -> rút ống -> chống đáy -> gạt bung chân -> hạ ống -> mở khoá -> rút máy điều khiển, cầm chắc,
  // nhìn màn hình -> bấm phóng từ máy
  const KAMI_SEQ = { grab: 0.8, plant: 1.7, flip: 2.45, set: 2.95, arm: 3.4, launch: 4.95, end: 5.5 };
  const KAMI_LEG_GRIP = 0.12, KAMI_EL_PLANT = 1.12;   // góc ống lúc chống đáy, chưa bung chân
  const kamiSeg = (t, a, b) => sm((t - a) / (b - a));
  function buildKamiTube(M, add, legsOn = true) {
    const g = new THREE.Group();
    const od = M.kamiTubeOD || (M.kamiTubeOD = new THREE.MeshStandardMaterial({ color: 0x3d4030, roughness: 0.74, metalness: 0.06 }));
    const dk = M.kamiDk || (M.kamiDk = new THREE.MeshStandardMaterial({ color: 0x23251f, roughness: 0.6, metalness: 0.3 }));
    const rub = M.kamiPadRub || (M.kamiPadRub = new THREE.MeshStandardMaterial({ color: 0x191a17, roughness: 0.92, metalness: 0 }));
    const label = M.kamiLabel || (M.kamiLabel = new THREE.MeshStandardMaterial({ color: 0x9a927a, roughness: 0.85, metalness: 0 }));
    const R = KAMI_R, ax = (geo, mat) => add(g, geo, mat, 0, 0, 0, -Math.PI / 2, 0, 0);   // lathe trục +y -> nòng -z, gốc tại đáy
    // thân composite: gờ gia cường đúc liền; chân cao su; nắp cao su lõm giữa có quai kéo; vạch vàng khoang đầu nổ
    ax(lathe('kamiTubeBody', [[R - 0.01, 0.28], [R, 0.32], [R, 1.44], [R + 0.014, 1.47], [R + 0.014, 1.6], [R, 1.63], [R, 3.72], [R + 0.014, 3.75], [R + 0.014, 3.88], [R, 3.91], [R, 5.04]], 28), od);
    ax(lathe('kamiTubeBoot', [[0, 0], [R - 0.05, 0], [R + 0.035, 0.05], [R + 0.045, 0.1], [R + 0.045, 0.3], [R + 0.01, 0.36]], 28), rub);
    ax(lathe('kamiTubeCap', [[R - 0.01, 5.0], [R + 0.03, 5.04], [R + 0.04, 5.08], [R + 0.04, 5.26], [R + 0.01, 5.34], [R - 0.1, 5.39], [R - 0.15, 5.36], [0, 5.36]], 28), rub);
    ax(lathe('kamiTubeBand', [[R + 0.004, 4.5], [R + 0.004, 4.62]], 28), M.band);
    add(g, rbox(0.42, 0.1, 0.03), M.web2, 0, 0, -KAMI_L + 0.02);                  // quai kéo nắp
    add(g, rbox(0.1, 0.1, 0.05), rub, 0.2, 0, -KAMI_L + 0.02);
    // nhãn lô đạn trên thân, lệch góc khỏi đường dây
    const LA = 0.75, lx = Math.cos(LA) * (R + 0.002), ly = Math.sin(LA) * (R + 0.002);
    add(g, rbox(0.015, 0.3, 0.72), label, lx, ly, -2.55, 0, 0, LA);
    for (const dy of [-0.06, 0.02, 0.1]) add(g, rbox(0.012, 0.022, 0.56), dk, lx + 0.008 * Math.cos(LA) - dy * Math.sin(LA), ly + 0.008 * Math.sin(LA) + dy * Math.cos(LA), -2.55, 0, 0, LA);
    // máng dây + giắc tròn có chốt an toàn khuyên vàng (tay phải tháo chốt lúc mở khoá)
    add(g, rbox(0.045, 0.08, 2.4), rub, R + 0.012, 0, -2.0);
    add(g, new THREE.CylinderGeometry(0.1, 0.11, 0.1, 14), rub, R + 0.03, 0, -3.25, 0, 0, Math.PI / 2);
    add(g, new THREE.TorusGeometry(0.062, 0.014, 6, 14), M.band, R + 0.1, 0.11, -3.25, 0, Math.PI / 2, 0);
    // đai vải ôm ống khi đeo trên lưng, khoá nhựa
    for (const z of [-1.1, -3.45]) {
      ax(new THREE.CylinderGeometry(R + 0.022, R + 0.022, 0.2, 28, 1, true).translate(0, -z, 0), M.web2);
      add(g, rbox(0.08, 0.2, 0.28), rub, R + 0.05, -0.16, z);
    }
    const legs = [];
    add(g, rbox(0.74, 0.1, 0.2), dk, 0, -R + 0.03, -4.1);                          // gối bản lề chân chống
    if (legsOn) for (const sx of [-1, 1]) {
      const leg = new THREE.Group(); leg.position.set(sx * 0.26, -R - 0.03, -4.1); leg.userData.sx = sx;
      add(leg, new THREE.CylinderGeometry(0.055, 0.05, KAMI_LEG_L, 10), dk, 0, -KAMI_LEG_L / 2, 0);
      add(leg, new THREE.CylinderGeometry(0.075, 0.075, 0.16, 10), rub, 0, -0.1, 0, 0, 0, Math.PI / 2);   // khớp
      const foot = new THREE.Group(); foot.position.set(0, -KAMI_LEG_L, 0); leg.add(foot); leg.userData.foot = foot;
      add(foot, rbox(0.28, 0.05, 0.34), rub, 0, 0, 0);                               // đế chân
      leg.userData.fold = new THREE.Quaternion().setFromUnitVectors(V(0, -1, 0), V(0, -0.045, 1).normalize());
      leg.quaternion.copy(leg.userData.fold);
      g.add(leg); legs.push(leg);
    }
    g.userData.kami = { legs };
    return g;
  }

  // ---------- ĐỒ DÃ CHIẾN gắn lên vũ khí: băng keo quấn, vải ngụy trang, dải vải, dây cột ----------
  const fieldMats = (M) => ({
    tape: M.wTape || (M.wTape = new THREE.MeshStandardMaterial({ color: 0x3b3c2d, roughness: 0.96, metalness: 0 })),   // băng keo vải ô-liu
    jute: M.wJute || (M.wJute = new THREE.MeshStandardMaterial({ color: 0x7a6c4a, roughness: 1, metalness: 0 })),      // dải bố
    cord: M.wCord || (M.wCord = new THREE.MeshStandardMaterial({ color: 0x4a4636, roughness: 0.95, metalness: 0 }))    // dây dù
  });
  // quấn băng quanh trục z: nhiều vòng hơi lệch góc + đuôi băng thừa thả ra (vòng đều tăm tắp trông như chi tiết đúc)
  function tapeWrap(g, add, mat, x, y, z0, z1, r, seed = 1) {
    const n = Math.max(2, Math.round(Math.abs(z1 - z0) / 0.1));
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n, tilt = Math.sin(seed * 3.7 + k * 2.3) * 0.07, dr = 0.004 * (k % 2);
      add(g, new THREE.CylinderGeometry(r + dr, r + dr, Math.abs(z1 - z0) / n * 1.15, 14, 1, true), mat, x, y, z0 + (z1 - z0) * t, -Math.PI / 2 + tilt, 0, Math.sin(seed + k) * 0.05);
    }
    add(g, rbox(0.1, 0.012, 0.26), mat, x + Math.sin(seed) * r * 0.5, y - r - 0.01, z1 + 0.08, 0.5, 0, 0.3);
  }
  // dải vải thả rủ dọc thân, xé hình khối dài cho đỡ lộ
  function ragStrips(g, add, mat, x, y, z0, z1, r, n, seed = 1) {
    for (let k = 0; k < n; k++) {
      const a = (k * 2.4 + seed) % (Math.PI * 2), z = z0 + (z1 - z0) * ((k + 0.5) / n), L = 0.35 + 0.3 * Math.abs(Math.sin(seed + k * 1.7));
      add(g, rbox(0.1, L, 0.016), mat, x + Math.cos(a) * r, y + Math.sin(a) * r * 0.7 - L * 0.4, z, Math.sin(k * 1.3) * 0.25, a, Math.sin(k * 2.1) * 0.22);
    }
  }
  function cordLoop(g, add, mat, x, y, z, r, n = 3) {
    for (let k = 0; k < n; k++) add(g, new THREE.TorusGeometry(r, 0.012, 5, 18), mat, x, y, z + (k - (n - 1) / 2) * 0.03, 0, Math.sin(k * 2) * 0.05, 0);
  }

  // ---------- SÚNG BẮN TỈA HẠNG NẶNG CHỐNG TĂNG (đạn 20 mm, dài ~1,9 m, ~25 kg) ----------
  // Lên đạn tay (khoá nòng trượt-xoay, kéo sau mỗi phát), băng 5 viên đạn lớn, nòng rất dày + đầu giảm giật 3 buồng, hộp khoá khối thép, báng giảm chấn đệm vai lớn, kính tầm xa, chân chống khoẻ.
  // Quá nặng để bắn đứng: di chuyển thì vác trên vai phải (nòng dốc lên phía sau, một tay giữ báng cầm), bắn thì NẰM SẤP trên chân chống.
  // Gốc tại báng cầm, nòng -z như súng trường.
  const ATR_BORE = 0.36, ATR_LEG_Z = -5.2, ATR_LEG_L = 2.0, ATR_SIGHT_Y = 1.3, ATR_EYE_Z = 1.1;
  const ATR = {
    gripR: V(0, -0.32, 0.1), gripL: V(0, -0.74, 2.08),   // tay trái ôm chân sau dưới báng, chỉnh độ cao như xạ thủ nằm thật (ốp tay quá xa tầm với)
    axisR: V(0, 0.98, 0.2).normalize(), axisL: V(0, 1, 0), palmKR: 0.75,
    palmR: V(-1, 0, 0), palmL: V(1, 0, 0),
    elbowR: V(2.6, 0.8, -2.0), elbowL: V(-1.9, 2.4, -2.4), elbowCarry: V(2.1, -0.6, -0.8),
    butt: V(0, 0.1, 2.75), pocket: V(0.99, 3.3, -0.8),                       // đệm báng tì hốc vai khi nằm bắn (x 0,77 / z -0,6 cũ: báng nằm dưới cổ, lưới cổ + cằm lún ~1,8 cm vào đuôi báng)
    // vác: báng cầm nghiêng theo súng nên cẳng tay đi chúc xuống bàn tay, khuỷu luôn cao hơn cổ tay (tay duỗi ngang / khuỳnh ra): nắm tay ngả ~26° quanh báng + gợi ý khuỷu mạnh để khuỷu thả xuống sát sườn
    kneelDir: V(0.15, 1, 0.15), kneelMagDir: V(-1, 0, 0), kneelButt: V(1.8, 0.15, -2.8), kneelBody: [-0.3, -0.12, -0.03, -0.12], kneelShL: V(0, 0, 0), kneelAt: V(0, -0.1, 2.84), gripKneelR: V(0, 1.0, -2.4), elbowKneelR: V(3.0, -0.2, -0.6), elbowKneelL: V(-2.6, 0.6, -2.6),   // quỳ thay băng (hệ gốc): súng đứng trên đế báng trước - phải, băng chĩa trái; tay phải nắm mặt trên hộp khoá (quai xách ngang vai: khuỷu gập ~60°, lưới khuỷu sụp). kneelShL 0: dời khớp vai vào thân thì lưới vai dẹt lõm
    hipPocket: V(1.4, 2.2, 1.0), hipPitch: -0.35, hipYaw: 0.8, hipRate: 2.4, elbowHipR: V(2.6, 0.9, 1.6), elbowHipL: V(-2.2, 0.0, -1.2),   // thế thay băng đứng (hệ ngực): báng kẹp nách phải, súng chéo trước ngực, nòng chúc trước - trái. Dò lưới: súng dài 1,4 m, băng cách báng ~60 cm nên chỉ thế chéo này cho tay trái với tới với khuỷu gập (vai -> băng ≤ 3,4 đv)
    axisCarryR: V(0, 0.98, -0.25).normalize(), carryHint: 30, carryPitch: 0.55, carryYaw: 0.25, carryRoll: 0, carryShL: 0.25, carryAt: V(0, 0.04, -3.0), carryPocket: V(1.55, 3.4, -0.1),               // chỗ ốp tay tì đỉnh vai khi vác
    // vác: ốp tay tì vai phải, báng chúc xuống phía trước. Nhìn thẳng từ trước thân súng che phần lớn cánh tay phải: đánh đổi để băng đạn không chìm trong ngực
    // điểm tì = mặt dưới ốp tay (carryAt y 0,04 = đáy áo nòng) đặt trên đỉnh vai (carryPocket ~ đỉnh cầu vai 3,35). Dốc 0,55: dốc 0,7 thì hộp khoá trước vai chúc vào ngực,
    // nâng điểm tì cho khỏi lún thì súng lơ lửng cạnh mũ, chỉ tay đỡ (đo bằng đỉnh áo sát mặt súng: tools/soldier_pen)
    // hướng 0,25, lăn 0 (cũ 1,1 / 0,6): vác dọc vai phải; vắt chéo ngực thì đáy băng đạn chìm ~18 cm trong lồng ngực (quét lưới đo lún hai chiều, không có góc lăn nào cứu được thế chéo)
    gripCarryL: V(0, 0, 0.4), axisCarryL: V(0, 0, -1), palmCarryL: V(0.5, -0.87, 0), elbowCarryL: V(-2.6, -1.6, -0.6)   // súng ~25 kg nên vác bằng hai tay: tay trái vòng qua ngực nắm ngay sau báng cầm, vai trái đưa trước carryShL (z 1,4 cũ xa quá tầm tay khi súng vác dọc vai). Đỡ đế băng thì khuỷu nâng, cẳng tay vặn ~130°
  };
  const ATR_CASE = [[0, -0.32], [0.105, -0.32], [0.105, -0.29], [0.088, -0.27], [0.088, -0.25], [0.105, -0.23], [0.1, 0.18], [0.085, 0.23], [0.085, 0.3], [0, 0.3]], ATR_TIP = [[0, 0.26], [0.08, 0.26], [0.08, 0.42], [0.06, 0.6], [0.03, 0.72], [0.012, 0.78], [0, 0.78]];   // đạn 20×82: vỏ đồng 7,8 cm Ø 2,6 cm + đầu đạn Ø 2 cm, dài 13,8 cm vừa lòng băng (z -0,99..-2,1). Mặt cắt đi từ dưới lên
  // vật liệu thân súng / băng đạn (dùng chung: băng rơi có thể dựng khi chưa có súng nào)
  const atrMats = M => ({
    steel: M.glSteel || (M.glSteel = new THREE.MeshStandardMaterial({ color: 0x2c2d2b, roughness: 0.42, metalness: 0.6 })),
    park: M.glPark || (M.glPark = new THREE.MeshStandardMaterial({ color: 0x1f201e, roughness: 0.62, metalness: 0.35 })),
    rub: M.gunD || (M.gunD = new THREE.MeshStandardMaterial({ color: 0x0b0b0a, roughness: 0.7 })),
    gm: M.wGun || (M.wGun = new THREE.MeshStandardMaterial({ color: 0x3e3f3a, roughness: 0.56, metalness: 0.5 })),
    brass0: M.wBrass || (M.wBrass = new THREE.MeshStandardMaterial({ color: 0x6a5a30, roughness: 0.48, metalness: 0.7 })),
    tip0: M.wTip || (M.wTip = new THREE.MeshStandardMaterial({ color: 0x26271f, roughness: 0.55, metalness: 0.5 }))
  });
  // băng 5 viên, toạ độ theo súng. o.empty: băng rỗng; o.gm / o.body: vật liệu thay cho băng rời (không qua lớp phong hoá của lính)
  function atrMagParts(M, add, G, o = {}) {
    const A = atrMats(M), { steel, park, rub, brass0, tip0 } = A, gm = o.gm || A.gm, bodyMat = o.body || null, empty = !!o.empty;
    add(G, sideGeo('atrMag2', [[-0.95, -0.06], [-2.07, -0.06], [-2.1, -0.36], [-2.13, -1.18], [-2.09, -1.22], [-1.01, -1.22], [-0.97, -1.18], [-0.93, -0.36]], 0.46, 0.035), bodyMat || gm, 0, 0, 0);
    for (const sx of [-1, 1]) {
      for (const y of [-0.62, -0.96]) add(G, rbox(0.03, 0.13, 0.78), gm, sx * 0.232, y, -1.62);
      add(G, rbox(0.012, 0.015, 0.8), park, sx * 0.246, -0.79, -1.62);      // đường hằn giữa hai gân
    }
    add(G, rbox(0.42, 0.92, 0.05), gm, 0, -0.72, -2.13, 0.03, 0, 0);        // sống bụng
    add(G, rbox(0.42, 0.92, 0.05), gm, 0, -0.72, -0.97, -0.03, 0, 0);       // sống lưng, tay nắm
    // ô đếm đạn: khe tối, thấy đít đạn đồng bên trong, số dập cạnh mỗi lỗ
    add(G, rbox(0.02, 0.68, 0.14), rub, -0.228, -0.74, -1.14);
    for (let k = 0; k < 5; k++) {
      add(G, new THREE.CylinderGeometry(0.038, 0.038, 0.02, 10), empty ? rub : brass0, -0.238, -0.48 - k * 0.13, -1.14, 0, 0, Math.PI / 2);
      add(G, rbox(0.006, 0.02, 0.06), steel, -0.235, -0.48 - k * 0.13, -1.26);
    }
    // đế băng: tấm tháo được, gờ bao quanh thân, chốt bấm, dải vải kéo khâu vào đế
    add(G, rbox(0.54, 0.075, 1.22), park, 0, -1.26, -1.53);
    add(G, rbox(0.5, 0.03, 1.12), steel, 0, -1.3, -1.53);
    add(G, new THREE.CylinderGeometry(0.05, 0.05, 0.03, 10), rub, 0, -1.32, -1.9);
    // quai kéo: dải vải khâu dưới đế, vòng qua mép sau đế rồi áp lên lưng băng (tấm dựng thẳng xuống trông như que sắt thò ra)
    add(G, strapGeo(new THREE.CatmullRomCurve3([V(0, -1.335, -1.2), V(0, -1.35, -0.92), V(0, -1.3, -0.8), V(0, -1.2, -0.78), V(0, -1.12, -0.9)]), 0.18, 0.035, 'atrMagPull', V(0, -1.0, -0.86), 16), M.web2, 0, 0, 0);
    add(G, rbox(0.485, 0.13, 1.2), fieldMats(M).tape, 0, -0.5, -1.53);      // băng keo giữ băng đạn khỏi lạch cạch, ghi dấu loại đạn
    // miệng băng: hai môi cong giữ viên trên cùng
    for (const sx of [-1, 1]) {
      add(G, rbox(0.035, 0.1, 0.84), steel, sx * 0.205, -0.05, -1.45, 0, 0, -sx * 0.5);
      add(G, rbox(0.035, 0.05, 0.84), steel, sx * 0.15, 0, -1.45);
    }
    if (empty) add(G, rbox(0.3, 0.03, 0.9), rub, 0, -0.1, -1.45);              // đế đẩy đạn nhô lên khi hết đạn
    else {
      add(G, lathe('atrCase', ATR_CASE, 12), brass0, 0, -0.04, -1.32, -Math.PI / 2, 0, 0);   // viên trên cùng lộ giữa hai môi
      add(G, lathe('atrTip', ATR_TIP, 12), tip0, 0, -0.04, -1.32, -Math.PI / 2, 0, 0);
    }
  }
  // băng rỗng rơi xuống đất: đúng hình băng trên súng, sơn vẽ sẵn lên kết cấu vì vật rời không có lớp phong hoá. Gốc ở giữa băng
  let ATR_DROP_TEX = null;
  function atrMagProp(M) {
    if (!ATR_DROP_TEX) {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const x = c.getContext('2d'); let sd = 7; const rd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
      x.fillStyle = '#403d2c'; x.fillRect(0, 0, 128, 128);
      // sơn phun tay: mảng mềm mép, tương phản thấp (mép cứng trông như hoạt hình)
      for (let k = 0; k < 14; k++) { const a = rd() * 128, b = rd() * 128, r = 9 + rd() * 16, g = x.createRadialGradient(a, b, r * 0.35, a, b, r); g.addColorStop(0, 'rgba(92,82,60,0.9)'); g.addColorStop(1, 'rgba(92,82,60,0)'); x.fillStyle = g; x.fillRect(a - r, b - r, r * 2, r * 2); }
      x.fillStyle = 'rgba(46,46,42,0.75)';
      for (let k = 0; k < 30; k++) { x.beginPath(); x.ellipse(rd() * 128, rd() * 128, 0.5 + rd() * 1.7, 0.4 + rd() * 0.9, rd() * 3, 0, 7); x.fill(); }
      ATR_DROP_TEX = new THREE.CanvasTexture(c); ATR_DROP_TEX.wrapS = ATR_DROP_TEX.wrapT = THREE.RepeatWrapping; ATR_DROP_TEX.minFilter = THREE.LinearFilter;
    }
    const body = M.wMagDrop || (M.wMagDrop = new THREE.MeshStandardMaterial({ map: ATR_DROP_TEX, roughness: 0.82, metalness: 0.1 }));
    const gm = M.wMagDropC || (M.wMagDropC = new THREE.MeshStandardMaterial({ color: 0x4b4634, roughness: 0.82, metalness: 0.1 }));
    const add = (par, geo, mat, x, y, z, rx, ry, rz) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); if (rx || ry || rz) m.rotation.set(rx || 0, ry || 0, rz || 0); m.castShadow = true; par.add(m); return m; };
    const root = new THREE.Group(), G = new THREE.Group(); G.position.set(0, 0.66, 1.52); root.add(G);
    atrMagParts(M, add, G, { empty: true, gm, body });
    return root;
  }

  function buildATR(M, add) {
    const g = new THREE.Group(), B = ATR_BORE;
    const steel = M.glSteel || (M.glSteel = new THREE.MeshStandardMaterial({ color: 0x2c2d2b, roughness: 0.42, metalness: 0.6 }));
    const park = M.glPark || (M.glPark = new THREE.MeshStandardMaterial({ color: 0x1f201e, roughness: 0.62, metalness: 0.35 }));
    const rub = M.gunD || (M.gunD = new THREE.MeshStandardMaterial({ color: 0x0b0b0a, roughness: 0.7 }));
    const poly = M.wPoly || (M.wPoly = new THREE.MeshStandardMaterial({ color: 0x191a17, roughness: 0.78, metalness: 0.05 }));
    const rgr = M.wRgr || (M.wRgr = new THREE.MeshStandardMaterial({ color: 0x34372b, roughness: 0.8, metalness: 0.05 }));
    const tubeZ = (r0, r1, l, z, mat, y = B, seg = 22, x = 0) => add(g, new THREE.CylinderGeometry(r0, r1, l, seg), mat, x, y, z, -Math.PI / 2, 0, 0);

    // ---- HỘP KHOÁ khối thép + ray ngắm + tay kéo khoá lớn ----
    const gm = M.wGun || (M.wGun = new THREE.MeshStandardMaterial({ color: 0x3e3f3a, roughness: 0.56, metalness: 0.5 }));   // thép phốt phát xám: dưới nắng thấy khối, thấy đường gia công (đen tuyền thành mảng phẳng)
    // lõi tối bên trong, ngoài là hai tấm thép có lỗ khoét: cửa văng vỏ đạn + khe tay kéo bên phải, lỗ giảm nặng hai bên
    const RX = roundPoly([[0.75, 0.62], [0.42, 0.84], [-2.5, 0.84], [-2.5, -0.02], [-1.6, -0.16], [0.3, -0.16], [0.75, 0.14]], 0.14);
    const slot = (z, y, w, h) => roundPoly(chamRect(z, y, w, h, 0.001), h * 0.45, 2);
    add(g, sideGeo('atrRx5', RX, 0.5, 0.03), park, 0, 0, 0);
    add(g, holedPlate('atrRxL3', RX, [slot(-1.25, 0.52, 2.1, 0.13), slot(-1.25, 0.2, 2.1, 0.13)], 0.07, 0.02), gm, -0.285, 0, 0);
    add(g, holedPlate('atrRxR3', RX, [slot(-1.8, 0.52, 0.76, 0.13), slot(-1.8, 0.2, 0.76, 0.13), roundPoly(chamRect(-0.6, 0.44, 1.2, 0.44, 0.001), 0.09, 2), slot(0.39, 0.51, 0.66, 0.11)], 0.07, 0.02), gm, 0.285, 0, 0);
    for (const sx of [-1, 1]) add(g, new THREE.CylinderGeometry(0.09, 0.09, 2.9, 10), gm, sx * 0.25, 0.74, -1.02, Math.PI / 2, 0, 0);   // vai tròn dọc mép trên
    tubeZ(0.34, 0.52, 0.42, -2.68, gm);                                         // cổ côn nối thân vuông sang áo nòng tròn
    for (const sx of [-1, 1]) add(g, rbox(0.03, 0.04, 2.3), park, sx * 0.326, -0.02, -0.9);   // đường ghép thân trên / thân dưới
    for (const sx of [-1, 1]) {
      add(g, rbox(0.03, 0.09, 3.05), park, sx * 0.325, 0.74, -0.88);          // gờ nắp hộp khoá
      add(g, rbox(0.03, 0.05, 2.0), rub, sx * 0.327, 0.1, -1.05);             // rãnh phay dưới
      for (let k = 0; k < 6; k++) add(g, new THREE.CylinderGeometry(0.03, 0.03, 0.022, 8), steel, sx * 0.327, 0.74, 0.5 - k * 0.55, 0, 0, Math.PI / 2);   // đinh tán nắp
    }
    add(g, rbox(0.012, 0.16, 0.46), steel, -0.326, 0.13, 0.2);                // bảng số hiệu
    add(g, rbox(0.012, 0.03, 0.34), rub, -0.333, 0.17, 0.2);
    add(g, rbox(0.012, 0.03, 0.26), rub, -0.333, 0.1, 0.18);
    add(g, rbox(0.3, 0.06, 3.2), park, 0, 0.87, -0.9);
    for (let k = 0; k < 28; k++) add(g, rbox(0.33, 0.04, 0.06), park, 0, 0.92, 0.55 - k * 0.112);
    const bolt = new THREE.Group(); g.add(bolt);   // khoá nòng + tay khoá: xương riêng, nâng / kéo / đẩy / hạ bằng tay sau mỗi phát
    add(bolt, rbox(0.03, 0.4, 1.16), steel, 0.235, 0.44, -0.6);                // bệ khoá nhìn qua cửa văng, lùi theo phát bắn
    add(bolt, rbox(0.012, 0.09, 0.9), rub, 0.253, 0.5, -0.6);                  // rãnh phay trên bệ khoá
    add(bolt, rbox(0.014, 0.1, 0.16), park, 0.254, 0.36, -1.0);                // móc đẩy vỏ
    add(bolt, new THREE.CylinderGeometry(0.055, 0.055, 0.46, 10), steel, 0.46, 0.51, 0.08, 0, 0, Math.PI / 2);   // cần tay kéo
    add(bolt, new THREE.CylinderGeometry(0.125, 0.125, 0.3, 14), park, 0.8, 0.51, 0.08, 0, 0, Math.PI / 2);      // núm lớn, nắm được khi đeo găng
    for (const x of [0.71, 0.8, 0.89]) add(bolt, new THREE.CylinderGeometry(0.132, 0.132, 0.024, 14), rub, x, 0.51, 0.08, 0, 0, Math.PI / 2);   // khía núm
    for (const z of [-2.3, 0.45]) for (const sx of [-1, 1]) add(g, new THREE.CylinderGeometry(0.05, 0.05, 0.02, 10), steel, sx * 0.325, 0.68, z, 0, 0, Math.PI / 2);   // đầu chốt lớn
    // ---- BÁNG CẦM + BĂNG 5 VIÊN đạn lớn ----
    pistolGrip(g, add, poly, park, steel);
    // ổ băng: thành thép ôm 1/3 trên của băng, miệng loe để đút băng khi không nhìn
    for (const sx of [-1, 1]) add(g, rbox(0.05, 0.46, 1.36), gm, sx * 0.295, -0.28, -1.52);
    for (const z of [-2.2, -0.86]) add(g, rbox(0.64, 0.46, 0.06), gm, 0, -0.28, z);
    add(g, rbox(0.74, 0.05, 1.48), park, 0, -0.5, -1.52);                      // vành loe miệng ổ
    for (const sx of [-1, 1]) add(g, rbox(0.02, 0.1, 0.9), park, sx * 0.325, -0.26, -1.52);   // gân cứng thành ổ
    add(g, rbox(0.14, 0.2, 0.16), steel, 0, -0.24, -0.78);                     // lẫy băng lớn, bóp được khi đeo găng
    add(g, rbox(0.2, 0.3, 0.05), steel, 0, -0.56, -2.3, 0.14, 0, 0);           // tay gạt nhả băng kiểu lá trước miệng ổ: ngón cái bấm khi tay nắm mặt trước băng
    add(g, rbox(0.3, 0.05, 0.1), park, 0, -0.42, -2.26);                       // bản lề tay gạt
    add(g, new THREE.CylinderGeometry(0.03, 0.03, 0.2, 8), steel, 0, -0.14, -0.78, 0, 0, Math.PI / 2);
    // băng thép dập một hàng 5 viên: thành có gân, lỗ đếm đạn, đế tháo được có quai kéo; xương riêng để rút ra
    const magG = new THREE.Group(); g.add(magG);
    // thân: tôn dập, sống lưng và sống bụng nổi, hai gân ép dọc cùng màu (lồi lên chứ không dán)
    atrMagParts(M, add, magG);
    // ---- BÁNG giảm chấn: khung polymer, đệm má, ống giảm giật đôi, đệm vai lớn, chân sau gập ----
    tubeZ(0.19, 0.19, 1.8, 1.55, gm, ATR_BORE);                                // ống giảm giật thẳng trục nòng: lực lùi đi thẳng vào vai
    add(g, holedPlate('atrStock4', roundPoly([[0.72, 0.56], [2.35, 0.56], [2.35, -0.56], [2.05, -0.62], [1.7, -0.3], [1.05, -0.16], [0.72, -0.12]], 0.16), [roundPoly([[1.15, 0.1], [2.12, 0.1], [2.12, -0.32], [1.78, -0.1]], 0.08, 2)], 0.34, 0.05), poly, 0, 0, 0);
    add(g, sideGeo('atrCheek', roundPoly([[1.08, 0.76], [2.14, 0.76], [2.14, 0.9], [1.5, 0.94], [1.08, 0.88]], 0.05), 0.32, 0.05), poly, 0, 0, 0);   // đệm má chỉnh cao
    for (const z of [1.28, 1.92]) add(g, new THREE.CylinderGeometry(0.04, 0.04, 0.26, 8), steel, 0, 0.66, z);
    add(g, sideGeo('atrPad', roundPoly([[2.6, 0.74], [2.84, 0.72], [2.84, -0.56], [2.6, -0.58]], 0.16), 0.5, 0.06), rub, 0, 0, 0);   // đệm vai cao su bo tròn
    for (let k = 0; k < 5; k++) add(g, rbox(0.5, 0.025, 0.03), poly, 0, -0.38 + k * 0.24, 2.85);   // rãnh chống trượt
    add(g, sideGeo('atrPadB', roundPoly([[2.54, 0.74], [2.6, 0.74], [2.6, -0.58], [2.54, -0.58]], 0.03), 0.54, 0.02), park, 0, 0, 0);   // tấm đế
    add(g, rbox(0.12, 0.62, 0.14), park, 0, -0.84, 2.1, -0.16, 0, 0);          // chân sau
    add(g, new THREE.CylinderGeometry(0.1, 0.07, 0.12, 10), rub, 0, -1.18, 2.04);
    // ---- ÁO NÒNG thép đục lỗ lớn: nhìn xuyên thấy nòng, gió làm mát; quai xách phía trên điểm cân bằng ----
    const JZ0 = -7.2, JZ1 = -2.55, JL = JZ1 - JZ0, JR = 0.32;   // áo nòng Ø 8 cm
    for (const [k, a0, a1] of [['T', 0.42, Math.PI - 0.42], ['B', Math.PI + 0.42, Math.PI * 2 - 0.42]]) add(g, arcShell('atrJk' + k, JR - 0.05, JR, a0, a1, JL), gm, 0, B, JZ0);
    for (let k = 0; k <= 7; k++) add(g, ringGeo('atrJkR', JR - 0.05, JR, 0.15), gm, 0, B, JZ0 + k * (JL - 0.15) / 7);   // các vòng ngăn tạo hàng cửa thoát nhiệt
    tubeZ(0.24, 0.32, 0.26, JZ0 - 0.12, gm);                                    // đầu áo nòng vuốt côn vào nòng
    tubeZ(0.21, 0.21, 2.8, -3.9, steel);                                       // đoạn nòng trong áo
    add(g, rbox(0.2, 0.05, 1.6), gm, 0, B + JR + 0.02, -4.2);                  // đế quai xách
    add(g, new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(0, 0.71, -3.6), V(0, 1.0, -3.8), V(0, 1.0, -4.6), V(0, 0.71, -4.8)]), 12, 0.05, 8, false), poly, 0, 0, 0);
    // ---- NÒNG RẤT DÀY có rãnh + ĐẦU GIẢM GIẬT 3 BUỒNG ----
    tubeZ(0.17, 0.21, 5.6, -8.0, steel);                                       // z -10,8 .. -5,2
    tubeZ(0.24, 0.24, 0.34, -5.3, park);
    tubeZ(0.2, 0.2, 0.16, -8.0, park);                                       // vòng kẹp giữa nòng
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + 0.26; add(g, rbox(0.04, 0.03, 2.3), rub, Math.cos(a) * 0.183, B + Math.sin(a) * 0.183, -6.6, 0, 0, a - Math.PI / 2); add(g, rbox(0.035, 0.025, 2.3), rub, Math.cos(a) * 0.165, B + Math.sin(a) * 0.165, -9.4, 0, 0, a - Math.PI / 2); }
    tubeZ(0.26, 0.26, 0.24, -10.9, park);
    const soot = M.wSoot || (M.wSoot = new THREE.MeshStandardMaterial({ color: 0x2b2a27, roughness: 0.74, metalness: 0.35 }));   // muội thuốc đen xỉn
    // hãm nòng 3 buồng: các vách cách nhau hở thật, nối bằng hai thanh trên dưới, nhìn xuyên qua được
    // thân liền một khối, thành dày, hai hàng 3 cửa xả dọc hai bên; lõi tối bên trong nên nhìn vào cửa thấy sâu
    const BZ0 = -12.32, BZ1 = -11.02, BL = BZ1 - BZ0, BR = 0.29;   // Ø 7,2 cm
    tubeZ(0.14, 0.14, BL, (BZ0 + BZ1) / 2, rub);
    for (const [k, a0, a1] of [['T', 0.62, Math.PI - 0.62], ['B', Math.PI + 0.62, Math.PI * 2 - 0.62]]) add(g, arcShell('atrBrk' + k, 0.16, BR, a0, a1, BL), soot, 0, B, BZ0);
    for (const z of [-12.32, -11.86, -11.4, -11.1]) add(g, ringGeo('atrBrkR', 0.16, BR - 0.012, z === -11.1 ? 0.08 : 0.17), soot, 0, B, z);
    tubeZ(0.23, BR, 0.1, BZ0 - 0.05, soot);                                 // mặt trước vát
    tubeZ(BR, 0.26, 0.18, BZ1 + 0.09, soot);                                 // vai nối về nòng
    add(g, new THREE.CircleGeometry(0.13, 18), rub, 0, B, -12.43, 0, Math.PI, 0);
    // ---- KÍNH NGẮM TẦM XA cỡ lớn ----
    const SY = ATR_SIGHT_Y, SZ = -0.75;
    tubeZ(0.14, 0.14, 2.4, SZ, poly, SY);
    tubeZ(0.27, 0.14, 0.6, SZ - 1.45, poly, SY, 26);
    tubeZ(0.27, 0.27, 0.4, SZ - 1.95, poly, SY, 26);                           // đầu kính
    tubeZ(0.17, 0.15, 0.72, ATR_EYE_Z - 0.36, poly, SY);                        // thị kính
    tubeZ(0.185, 0.185, 0.08, ATR_EYE_Z - 0.04, rub, SY);                      // chụp mắt
    add(g, new THREE.CircleGeometry(0.24, 22), M.lens, 0, SY, SZ - 2.16, 0, Math.PI, 0);
    add(g, new THREE.CircleGeometry(0.14, 18), M.lens, 0, SY, ATR_EYE_Z + 0.005);
    // NGÀM VÒNG trên ray (mặt răng ray y 0,94, rộng 0,33): đế kẹp ngồi trên răng, hai má ôm mép ray, bu lông ngang + ốc bên trái; cổ nối lên vòng ôm ống kính,
    // nắp vòng 4 vít. Khối hộp mảnh cũ (0,32 x 0,24, đáy hở ray ~5 mm) trông như ống kính cắm trên hai cọc
    const RAIL_TOP = 0.94, RING_R = 0.2, RING_Y0 = SY - RING_R;
    for (const z of [SZ - 0.85, SZ + 0.65]) {
      add(g, new THREE.CylinderGeometry(RING_R, RING_R, 0.26, 20), park, 0, SY, z, -Math.PI / 2, 0, 0);   // vòng kính
      add(g, rbox(0.44, 0.03, 0.27), steel, 0, SY, z);                                                     // đường ghép nắp vòng
      for (const sx of [-1, 1]) for (const dz of [-0.07, 0.07]) add(g, new THREE.CylinderGeometry(0.028, 0.028, 0.05, 8), steel, sx * (RING_R + 0.01), SY + 0.06, z + dz, 0, 0, Math.PI / 2);   // vít nắp
      add(g, rbox(0.26, RING_Y0 - RAIL_TOP - 0.08 + 0.04, 0.24), park, 0, (RING_Y0 + RAIL_TOP + 0.08) / 2, z);   // cổ nối đế -> vòng (lẹm vào vòng 0,04)
      add(g, rbox(0.44, 0.1, 0.3), park, 0, RAIL_TOP + 0.05, z);                                           // đế kẹp ngồi trên răng ray
      for (const sx of [-1, 1]) add(g, rbox(0.06, 0.16, 0.3), park, sx * 0.2, RAIL_TOP - 0.06, z);          // má kẹp ôm mép ray
      add(g, new THREE.CylinderGeometry(0.035, 0.035, 0.5, 8), steel, 0, RAIL_TOP - 0.08, z, 0, 0, Math.PI / 2);   // bu lông ngang qua rãnh ray
      add(g, new THREE.CylinderGeometry(0.065, 0.065, 0.06, 6), steel, -0.26, RAIL_TOP - 0.08, z, 0, 0, Math.PI / 2);   // ốc kẹp (bên trái, tay phải không vướng tay kéo khoá)
    }
    // yên kính: khối to hơn thân ống chỗ gắn núm (núm cắm thẳng lên ống Ø 0,28 thì nhìn như hộp tròn lơ lửng phía trên)
    tubeZ(0.2, 0.2, 0.42, SZ, park, SY, 20);
    add(g, rbox(0.3, 0.1, 0.34), park, 0, SY + 0.19, SZ);                                   // bệ núm tầm
    add(g, rbox(0.1, 0.3, 0.34), park, 0.19, SY, SZ);                                       // bệ núm hướng
    add(g, new THREE.CylinderGeometry(0.12, 0.12, 0.18, 16), park, 0, SY + 0.32, SZ);       // núm tầm
    add(g, new THREE.CylinderGeometry(0.12, 0.12, 0.18, 16), park, 0.32, SY, SZ, 0, 0, Math.PI / 2);   // núm hướng
    // ---- CHÂN CHỐNG KHOẺ: xương riêng, gập dọc nòng khi vác, dựng xuống đất khi bắn ----
    add(g, ringGeo('atrBipRing', 0.32, 0.4, 0.34), park, 0, B, ATR_LEG_Z - 0.17);   // đai kẹp ôm áo nòng
    add(g, sideGeo('atrBipYoke', roundPoly([[ATR_LEG_Z + 0.2, -0.04], [ATR_LEG_Z - 0.2, -0.04], [ATR_LEG_Z - 0.17, -0.34], [ATR_LEG_Z + 0.17, -0.34]], 0.05), 0.72, 0.03), park, 0, 0, 0);   // giá chữ U nối đai với hai khớp chân
    add(g, new THREE.CylinderGeometry(0.05, 0.05, 0.84, 10), steel, 0, B - 0.6, ATR_LEG_Z, 0, 0, Math.PI / 2);   // trục bản lề xuyên giá
    const legs = [-1, 1].map(sx => {
      const leg = new THREE.Group(), L = ATR_LEG_L;
      leg.position.set(sx * 0.27, B - 0.6, ATR_LEG_Z);
      add(leg, new THREE.CylinderGeometry(0.11, 0.11, 0.2, 12), park, 0, 0, 0, 0, 0, Math.PI / 2);   // khớp chân ôm trục
      add(leg, new THREE.CylinderGeometry(0.08, 0.08, L * 0.56, 12), park, 0, -L * 0.28, 0);
      add(leg, new THREE.CylinderGeometry(0.06, 0.06, L * 0.44, 12), steel, 0, -L * 0.78, 0);
      add(leg, new THREE.CylinderGeometry(0.095, 0.095, 0.1, 12), steel, 0, -L * 0.56, 0);
      add(leg, rbox(0.3, 0.05, 0.42), rub, 0, -L, 0);                          // bàn chân rộng chống lún
      leg.userData.sx = sx;
      leg.userData.fold = new THREE.Quaternion().setFromUnitVectors(V(0, -1, 0), V(sx * 0.03, 0.04, -1).normalize());
      leg.quaternion.copy(leg.userData.fold);
      g.add(leg);
      return leg;
    });
    // ---- khoen + dây đeo bản rộng ----
    for (const z of [-4.6, 2.0]) add(g, new THREE.TorusGeometry(0.09, 0.024, 5, 12), steel, -0.4, z < 0 ? B - 0.1 : 0.05, z, 0, Math.PI / 2, 0);
    const sl = new THREE.CatmullRomCurve3([V(-0.4, B - 0.12, -4.6), V(-0.4, -0.12, -2.8), V(-0.4, -0.26, 0.4), V(-0.26, -0.04, 2.0)]);
    add(g, strapGeo(sl, 0.13, 0.03, 'atrSling3', V(1, 0, 0)), M.web2, 0, 0, 0);   // dây đeo bên trái: bên phải vướng tay cò và tay kéo khoá
    add(g, rbox(0.2, 0.09, 0.04), M.knuck, -0.41, -0.17, -1.6, 0, Math.PI / 2, 0);   // khoá chỉnh dây
    add(g, rbox(0.03, 0.1, 0.3), M.web2, -0.42, -0.22, -1.3, 0.1, 0, 0);         // đuôi dây thừa
    // nắp lật đầu kính: vòng ôm đầu kính + bản lề trên đỉnh; nắp mở ~170°, đứng gần thẳng phía trên ống kính (đĩa mỏng lơ lửng không bản lề trông như lưỡi dao)
    {
      const HY = ATR_SIGHT_Y + 0.305, HZ = -3.0, th = 2.95, c = Math.cos(th), s = Math.sin(th);
      const rot = (y, z) => [HY + y * c - z * s, HZ + y * s + z * c];
      add(g, ringGeo('atrCapCollar', 0.268, 0.305, 0.1), poly, 0, ATR_SIGHT_Y, -2.98);
      add(g, rbox(0.16, 0.07, 0.1), poly, 0, HY, HZ + 0.02);                             // bản lề
      add(g, new THREE.CylinderGeometry(0.025, 0.025, 0.2, 8), steel, 0, HY + 0.02, HZ, 0, 0, Math.PI / 2);
      const [ly, lz] = rot(-0.305, -0.015), [ty, tz] = rot(-0.64, -0.015);
      add(g, new THREE.CylinderGeometry(0.31, 0.31, 0.05, 24), poly, 0, ly, lz, Math.PI / 2 + th, 0, 0);   // nắp
      add(g, rbox(0.15, 0.06, 0.045), poly, 0, ty, tz, th, 0, 0);                        // tai lật
    }
    // ---- ĐỒ DÃ CHIẾN, cái nào cũng có lý do: vải che loá đầu kính, giẻ phá dáng nòng, băng keo chỗ nắm, dây cột quai xách ----
    const F0 = fieldMats(M), SY2 = ATR_SIGHT_Y;
    tapeWrap(g, add, M.pouch, 0, SY2, -2.52, -2.88, 0.285, 2);
    for (const z of [-2.55, -2.85]) add(g, new THREE.CylinderGeometry(0.292, 0.292, 0.04, 18, 1, true), F0.cord, 0, SY2, z, -Math.PI / 2, 0, 0);
    tapeWrap(g, add, F0.tape, 0, SY2, -0.15, 0.15, 0.152, 3);
    tapeWrap(g, add, F0.tape, 0, ATR_BORE, 0.85, 1.25, 0.2, 4);                // quấn ống giảm giật chỗ tì má khi nóng
    tapeWrap(g, add, M.pouch, 0, ATR_BORE, -9.05, -9.6, 0.27, 5);              // vải quấn nòng, giẻ phá dáng
    tapeWrap(g, add, F0.cord, 0, ATR_BORE, -9.05, -9.12, 0.285, 6);
    ragStrips(g, add, F0.jute, 0, ATR_BORE, -9.05, -9.6, 0.28, 4, 2.9);
    for (const z of [-5.75, -6.3]) add(g, new THREE.CylinderGeometry(0.392, 0.392, 0.04, 18, 1, true), F0.cord, 0, B, z, -Math.PI / 2, 0, 0);   // dây cột bó giẻ quanh áo nòng
    ragStrips(g, add, F0.jute, 0, B, -5.8, -6.25, 0.4, 5, 1.3);
    ragStrips(g, add, M.pouch, 0, B, -5.85, -6.2, 0.41, 3, 4.1);
    g.userData.atr = { legs, mag: magG, bolt };
    return g;
  }

  // ---------- ĐỒ ĐEO THEO VŨ KHÍ (gắn chest, toạ độ sau khi đã dồn áo giáp) ----------
  // quai vai của ba lô: từ mép trên ba lô vắt qua đỉnh vai xuống tấm ngực
  function packStraps(M, add, chest, key, x0, y0, z0) {
    for (const sx of [-1, 1]) {
      const c = new THREE.CatmullRomCurve3([V(sx * x0, y0, z0), V(sx * 0.8, 3.2, 1.02), V(sx * 0.88, 3.5, 0.45), V(sx * 0.9, 3.52, -0.3), V(sx * 0.84, 3.15, -0.88), V(sx * 0.66, 2.7, -1.2), V(sx * 0.6, 2.25, -1.25)]);
      add(chest, strapGeo(c, 0.3, 0.06, key + sx, V(sx * 0.3, 2.4, 0), 40), M.web2, 0, 0, 0);
      add(chest, rbox(0.2, 0.12, 0.06), M.knuck, sx * 0.62, 2.45, -1.28);   // khoá chỉnh quai
    }
  }
  // Súng phóng lựu: BĂNG ĐẠN LỰU 40 mm đeo chéo từ vai trái xuống hông phải, vòng qua lưng; đạn cài trong vòng chun mặt trước
  // đặt một viên lên dây tại vị trí u (0..1 quanh vòng dây): nằm ngang bản dây, đuôi lệch về một mép như băng đạn thật
  const GL_BELT_PULL = 0.55, _bP = V(0, 0, 0), _bT = V(0, 0, 0), _bO = V(0, 0, 0), _bS = V(0, 0, 0), _bN = V(0, 0, 0), _bY = V(0, 1, 0);
  const GL_BELT_SEG = 16, GL_BELT_TAB = 128, _bD = V(0, 0, 0), _bQ = new THREE.Quaternion(), _bA = new THREE.Quaternion();
  function glBeltTable(B) {
    B.tab = [];
    for (let i = 0; i < GL_BELT_TAB; i++) {
      const u = i / GL_BELT_TAB, P = B.curve.getPointAt(u), Tn = B.curve.getTangentAt(u), O = P.clone().sub(B.core).normalize();
      const Sd = V(0, 0, 0).crossVectors(Tn, O).normalize();
      B.tab.push({ P, T: Tn, O, S: Sd, N: V(0, 0, 0).crossVectors(Sd, Tn).normalize() });
    }
  }
  // Viên đạn là ống cứng ~9,5 cm nằm ngang dây; người cong (vai, sườn, hông) nên đặt vuông góc tâm thì mũi chìa ra 3-7 cm.
  // Bảng theo vị trí trên dây (64 mẫu, đo khe hai đầu viên bằng tia trên lính dựng không bake, làm mượt): nghiêng quanh dây cho viên nằm áp người,
  // ấn vào lớp vải một chút. Đổi đường dây trong glKit hay hình áo / giáp thì phải đo lại (scratchpad phiên c2b41e45 belt9.js).
  const GL_BELT_TILT = [-0.1, 0.03, 0.12, 0.08, 0.01, -0.02, -0.02, 0.02, 0.09, 0.06, -0.04, -0.07, -0.04, -0.04, -0.1, -0.06, 0.15, 0.4, 0.4, 0.4, 0.4, 0.33, 0.32, 0.37, 0.35, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.39, 0.34, 0.35, 0.4, 0.4, 0.4, 0.4, 0.4, 0.34, 0.3, 0.23, 0.17, 0.18, 0.16, 0.1, 0.05, 0.03, 0.01, -0.01, -0.03, -0.06, -0.01, 0.13, 0.16, 0.08, 0.08, 0.12, 0.12, 0.12, 0.15, 0.15, 0.03, -0.1];
  const GL_BELT_SINK = [0, 0.017, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.027, 0, 0, 0, 0, 0.001, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.003, 0];
  const _bA2 = new THREE.Quaternion();
  function glBeltPlace(B, r, u) {
    u -= Math.floor(u);
    const x = u * GL_BELT_TAB, i = Math.floor(x) % GL_BELT_TAB, f = x - Math.floor(x), a = B.tab[i], b = B.tab[(i + 1) % GL_BELT_TAB];
    const y = u * 64, j = Math.floor(y) % 64, g = y - Math.floor(y), j2 = (j + 1) % 64;
    const tilt = GL_BELT_TILT[j] + (GL_BELT_TILT[j2] - GL_BELT_TILT[j]) * g, sink = GL_BELT_SINK[j] + (GL_BELT_SINK[j2] - GL_BELT_SINK[j]) * g;
    r.position.copy(a.P).lerp(b.P, f).addScaledVector(a.N, B.T / 2 + 0.15 - sink).addScaledVector(a.S, 0.04);
    r.quaternion.setFromUnitVectors(_bY, a.S).premultiply(_bA2.setFromAxisAngle(a.T, tilt));   // dương: mũi đạn vào phía người
    return a;
  }
  // dây vải: bản mỏng, mép cụp ôm người, chùng dần về phía hông, gợn nhẹ giữa các vòng đạn; không còn là một vòng đúc đều tăm tắp
  // ống vải bọc đạn: tiện tròn rồi làm nhăn (vải không căng đều: phồng lệch, hai nếp ngang, mép miệng hơi méo), 3 biến thể
  function gl40SleeveGeo(v) {
    const key = 'gl40Sleeve' + v;
    if (GEO[key]) return GEO[key];
    const g = lathe('gl40SleeveBase', [[0.17, -0.2], [0.181, -0.185], [0.186, -0.1], [0.188, 0], [0.186, 0.1], [0.18, 0.18], [0.174, 0.2], [0.158, 0.2], [0.158, -0.2], [0.17, -0.2]], 20).clone();
    const p = g.attributes.position, ph = v * 2.1;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), r = Math.hypot(x, z);
      if (r < 0.16) continue;   // mặt trong giữ nguyên, khỏi chọc vào đạn
      const a = Math.atan2(z, x);
      const k = 1 + 0.035 * Math.sin(3 * a + ph + 4 * y) + 0.02 * Math.sin(5 * a - ph)
        - 0.03 * Math.exp(-Math.pow((y + 0.06 + 0.02 * v) / 0.025, 2)) * (0.6 + 0.4 * Math.sin(2 * a + ph))
        - 0.025 * Math.exp(-Math.pow((y - 0.09) / 0.02, 2)) * (0.5 + 0.5 * Math.cos(a - ph));
      p.setX(i, x * k); p.setZ(i, z * k); p.setY(i, y + (Math.abs(y) > 0.18 ? 0.008 * Math.sin(2 * a + ph) : 0));
    }
    g.computeVertexNormals();
    return (GEO[key] = g);
  }
  function glSoftStrap(curve, core, w, t, N, L) {
    if (GEO.glStrapSoft) return GEO.glStrapSoft;
    const g = strapGeo(curve, w, t, 'glBandolier2', core, N).clone(), p = g.attributes.position, nv = p.count;
    const A = new Uint8Array(nv), Bb = new Uint8Array(nv), Wt = new Float32Array(nv), loops = Math.round(L / 0.335), TAU = Math.PI * 2;
    for (let i = 0; i <= N; i++) {
      const u = i / N, P = curve.getPointAt(u), Tn = curve.getTangentAt(u), O = P.clone().sub(core).normalize(), Sd = V(0, 0, 0).crossVectors(Tn, O).normalize(), Nr = V(0, 0, 0).crossVectors(Sd, Tn).normalize();
      const lat = 0.035 * Math.sin(TAU * u * 5 + 1) + 0.018 * Math.sin(TAU * u * 11 + 2), pucker = 0.016 * Math.sin(TAU * u * loops), sag = 0.07 * Math.pow(Math.sin(Math.PI * u), 2);
      for (let k = 0; k < 4; k++) {
        const v = i * 4 + k, e = (k === 0 || k === 3) ? -1 : 1;   // thứ tự 4 góc mặt cắt: -1,-1 / 1,-1 / 1,1 / -1,1
        const wave = 0.012 * Math.sin(TAU * u * 17 + e * 1.4);       // hai mép lượn lệch nhau: vải, không phải tấm cứng
        p.setXYZ(v,
          p.getX(v) + Sd.x * lat + Nr.x * (pucker + wave - 0.02),
          p.getY(v) + Sd.y * lat + Nr.y * (pucker + wave - 0.02) - sag,
          p.getZ(v) + Sd.z * lat + Nr.z * (pucker + wave - 0.02));
        const q = u * GL_BELT_SEG, q0 = Math.floor(q);
        A[v] = q0 % GL_BELT_SEG; Bb[v] = (q0 + 1) % GL_BELT_SEG; Wt[v] = q - q0;
      }
    }
    g.computeVertexNormals();
    g.userData.softBlend = { a: A, b: Bb, w: Wt };
    return (GEO.glStrapSoft = g);
  }
  function glKit(M, add, chest) {
    // điểm đặt sát mặt ngoài giáp / túi đo trên mô hình (+0,05): mặt trước -1,17..-1,33, lưng 1,25..1,33, đỉnh vai x 1 ~ y 3,34
    const pts = [V(-1.0, 3.4, -0.1), V(-0.95, 3.05, -0.97), V(-0.55, 2.4, -1.22), V(0.0, 1.75, -1.24), V(0.5, 1.1, -1.38), V(0.98, 0.55, -1.02), V(1.3, 0.3, -0.55),
      V(1.5, 0.3, 0.1), V(1.22, 0.5, 0.95), V(0.4, 1.3, 1.33), V(-0.5, 2.3, 1.36), V(-0.95, 3.0, 1.08)];
    const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal'), core = V(0, 1.8, 0.05), T = 0.04;
    const segs = [];
    for (let i = 0; i < GL_BELT_SEG; i++) { const b = new THREE.Group(); chest.add(b); segs.push(b); }
    const strap = glSoftStrap(curve, core, 0.56, T, 160, curve.getLength()).clone();
    strap.userData.blend = Object.assign({ bones: segs }, GEO.glStrapSoft.userData.softBlend);
    add(chest, strap, M.glPouch0 || (M.glPouch0 = new THREE.MeshStandardMaterial({ color: M.web2.color.clone().multiplyScalar(0.72), roughness: 1, metalness: 0 })), 0, 0, 0).userData.fabric = true;
    const alu = M.glAlu || (M.glAlu = new THREE.MeshStandardMaterial({ color: 0x5f5c4c, roughness: 0.5, metalness: 0.55 }));
    const head = M.glPaint || (M.glPaint = new THREE.MeshStandardMaterial({ color: 0x3a3d2e, roughness: 0.68, metalness: 0.3 }));
    const caseG = gl40Case(), headG = gl40Head();
    const bandG = GEO.gl40Band || (GEO.gl40Band = new THREE.CylinderGeometry(0.157, 0.157, 0.035, 14, 1, true));
    // vải dù dệt dày, xỉn: màu dây nhân 0,72 như vải quân phục (màu trơn dưới nắng lab ra xám phấn như nhựa), ba sắc phai / mới / bẩn xen nhau
    // (màu trơn nên bake dồn vào màu đỉnh, không thêm lượt vẽ); viền gập mép sẫm hơn
    const pc = M.web2.color, pouch = [1, 0.86, 1.1].map((k, i) => M['glPouch' + i] || (M['glPouch' + i] = new THREE.MeshStandardMaterial({ color: pc.clone().multiplyScalar(0.72 * k).lerp(new THREE.Color(0x6b5f48), i === 2 ? 0.12 : 0), roughness: 1, metalness: 0 })));
    const hemM = M.glPouchHem || (M.glPouchHem = new THREE.MeshStandardMaterial({ color: pc.clone().multiplyScalar(0.5), roughness: 1, metalness: 0 }));
    const sleeves = [0, 1, 2].map(v => gl40SleeveGeo(v)), hemG = lathe('gl40Hem', [[0.19, -0.016], [0.192, 0.016], [0.17, 0.016], [0.17, -0.016], [0.19, -0.016]], 16);
    // đạn đeo cả trước ngực lẫn sau lưng: mỗi viên một xương, chạy được dọc dây khi kéo băng (glBeltPlace). Nửa đầu = phía trước, nửa sau = sau lưng
    const L = curve.getLength(), B = chest.userData.glBelt = { curve, core, T, slots: [], segs, u: 0 };
    glBeltTable(B);
    for (const off of [0, GL_BELT_PULL < 1 ? 1 - GL_BELT_PULL : 0]) for (let d = 0.1 * L; d < 0.44 * L; d += 0.335) {
      const r = new THREE.Group(); chest.add(r);
      r.userData.u0 = d / L + off;
      const v = (r.userData.u0 * 97 | 0) % 3;
      add(r, sleeves[v], pouch[(v + Math.floor(d * 5)) % 3], 0, -0.18, 0).userData.fabric = true;   // vỏ y -0,38..0, ống vải phủ -0,38..0,02
      add(r, hemG, hemM, 0, 0.005, 0).userData.fabric = true;
      const ammo = new THREE.Group(); r.add(ammo); r.userData.ammo = ammo;
      for (const [geo, mat, y] of [[caseG, alu, 0], [headG, head, 0], [bandG, M.band, 0.08]]) add(ammo, geo, mat, 0, y, 0);
      glBeltPlace(B, r, r.userData.u0);
      B.slots.push(r);
    }
  }
  // Ống phóng chống tăng: BA LÔ 3 ĐẠN sau lưng. Một túi vải liền ba múi may chung (không phải ba ống rời), lưng phẳng áp giáp; đai nén ngang vắt qua đỉnh múi;
  // cổ túi rút dây quanh đuôi đầu đạn, phần thân côn của đạn chìa khỏi miệng như ba lô đạn thật.
  // túi đạn chỉ ôm thanh thuốc phóng Ø ~4 cm (+ đệm vải); đầu đạn 85 mm to hơn miệng túi nên nằm hẳn bên trên. A / D / BACK: bán kính ngang / trước / sau của ống
  const RPG_BAG = { DX: 0.76, A: 0.25, D: 0.25, BACK: 0.23, X: 1.22 };
  // độ ngả từng ống (rad, + = ngọn ngả sang trái): gần song song như ba lô thật, đầu đạn Ø 85 mm vừa lọt khoảng cách ống (xoè 0,3 rad bị chê "toè loe").
  // Quả giữa nằm sau gáy: tay với qua đỉnh vai, khuỷu giơ cao ngoài đầu (gripCost spec.over), không bẻ tay ra sau lưng
  const RPG_FAN = [0.07, 0.0, -0.07];
  // điểm (x, y) hệ ngực của ống k ở độ cao h tính từ đáy túi yB
  const rpgFanPt = (k, h, yB) => { const a = RPG_FAN[k], x0 = (k - 1) * RPG_BAG.DX; return [x0 - h * Math.sin(a), yB + h * Math.cos(a)]; };
  function rpgFanGeo(g, k, yB, Z) { const x0 = (k - 1) * RPG_BAG.DX; return g.translate(-x0, -yB, -Z).rotateZ(RPG_FAN[k]).translate(x0, yB, Z); }
  // MỘT ỐNG TÚI (vải cordura dày) ôm thanh thuốc phóng của một quả: đáy bo tròn, thân phồng nhẹ phần dưới, đai nén thắt eo, miệng rút dây nhăn dúm
  // thắt quanh cổ đạn. Ba ống may cách nhau trên tấm lưng (lộ tấm lưng giữa các ống); mặt lưng ép phẳng. sd: hạt nếp vải riêng từng ống
  function rpgPocketGeo(k, Y, Z, H, straps, sd) {
    const key = 'rpgPocket' + k;
    if (GEO[key]) return GEO[key];
    const B = RPG_BAG, NU = 40, NV = 26, W = NU + 1, pos = [], uv = [], idx = [], x0 = (k - 1) * B.DX;
    for (let j = 0; j <= NV; j++) {
      const v = j / NV, y = Y + H * (v - 0.5);
      const bot = v < 0.13 ? Math.sqrt(1 - Math.pow(1 - v / 0.13, 2)) : 1;                  // đáy bo
      const neck = v > 0.84 ? 1 - 0.26 * Math.pow((v - 0.84) / 0.16, 1.6) : 1;              // miệng túi thu vào ôm cổ đạn
      const sag = 1 + 0.045 * Math.exp(-Math.pow((v - 0.3) / 0.22, 2));                   // đạn nặng dồn xuống đáy
      let pinch = 0; for (const ys of straps) pinch += 0.035 * Math.exp(-Math.pow((y - ys) / 0.09, 2));
      let arc = 0, px = 0, pz = 0;
      for (let i = 0; i <= NU; i++) {
        const t = (i % NU) / NU * Math.PI * 2, ct = Math.cos(t), st = Math.sin(t);
        const front = st > 0, rz = front ? B.D : B.BACK * Math.pow(Math.abs(st), 0.35) / Math.max(1e-3, Math.abs(st)) * Math.abs(st);   // lưng ép phẳng
        let r = (0.82 + 0.18 * bot) * neck * sag - (front ? pinch : 0);
        // nếp vải: gợn dọc nhỏ, nhăn dúm ở miệng rút dây, nếp ngang mềm phần dưới
        r += 0.022 * Math.sin(t * 5 + v * 6 + sd) + 0.013 * Math.sin(t * 9 - v * 13 + sd * 2.3);
        r += 0.07 * Math.sin(t * 11 + sd * 1.7) * Math.pow(Math.max(0, (v - 0.8) / 0.2), 2);
        r += 0.02 * Math.sin(v * 31 + t * 2 + sd) * Math.exp(-Math.pow((v - 0.22) / 0.15, 2));
        const qx = x0 - ct * B.A * r, qz = st * rz * r;
        if (i) arc += Math.hypot(qx - px, qz - pz);
        px = qx; pz = qz;
        pos.push(qx, y, Z + qz); uv.push(arc * 0.42 + k * 0.37, y * 0.42);
      }
    }
    for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) { const a = j * W + i, b = a + 1, c2 = a + W, d = c2 + 1; idx.push(a, b, c2, b, d, c2); }
    const bt = pos.length / 3; pos.push(x0, Y - H / 2 - 0.015, Z); uv.push(0.3, 0.3);
    for (let i = 0; i < NU; i++) idx.push(bt, i + 1, i);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const n = g.attributes.normal;   // hàn pháp tuyến mép nối vòng
    for (let j = 0; j <= NV; j++) {
      const a = j * W, b = a + NU, q = V(n.getX(a) + n.getX(b), n.getY(a) + n.getY(b), n.getZ(a) + n.getZ(b)).normalize();
      n.setXYZ(a, q.x, q.y, q.z); n.setXYZ(b, q.x, q.y, q.z);
    }
    return (GEO[key] = rpgFanGeo(g, k, Y - H / 2, Z));
  }
  // viền may (băng viền vải gập mép) quanh đáy / miệng ống: vòng dẹt theo đúng mặt cắt ống
  function rpgPocketHem(k, y, r, Z, yB) {
    const key = 'rpgHem' + k + '_' + y.toFixed(2);
    if (GEO[key]) return GEO[key];
    const B = RPG_BAG, x0 = (k - 1) * B.DX, pts = [];
    for (let i = 0; i <= 32; i++) { const t = i / 32 * Math.PI * 2, st = Math.sin(t); pts.push(V(x0 + Math.cos(t) * B.A * r, y, Z + (st > 0 ? st * B.D : st * B.BACK) * r)); }
    return (GEO[key] = rpgFanGeo(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 40, 0.016, 5, true), k, yB, Z));
  }
  function rpgKit(M, add, chest) {
    const Z = 1.8, Y = 1.45, H = 2.1, TOP = Y + H / 2, straps = [Y - 0.52, Y + 0.42], F0 = fieldMats(M);
    add(chest, rbox(2.2, H, 0.24), M.vestD, 0, Y, Z - 0.38);                  // tấm lưng ba lô
    for (let k = 0; k < 3; k++) {
      add(chest, rpgPocketGeo(k, Y, Z, H, straps, k * 2.1 + 0.7), M.pouch, 0, 0, 0);
      add(chest, rpgPocketHem(k, Y - H / 2 + 0.11, 1.0, Z, Y - H / 2), M.web2, 0, 0, 0);          // viền đáy
      add(chest, rpgPocketHem(k, Y + H / 2 - 0.2, 0.95, Z, Y - H / 2), M.web2, 0, 0, 0);          // viền miệng
    }
    add(chest, rbox(0.5, 0.05, 0.035), M.web2, 0, TOP + 0.04, Z - 0.38);       // quai xách
    const collar = lathe('rpgCollar2', [[0.2, 0], [0.19, 0.05], [0.175, 0.11], [0.17, 0.16], [0.18, 0.19]], 18);   // miệng rút dây thắt quanh cổ đạn (Ø đầu đạn > Ø miệng túi)
    // đạn cắm theo trục ống (xoè RPG_FAN), sâu cạn khác nhau một chút
    const yB = Y - H / 2, ring = GEO.rpgRing || (GEO.rpgRing = new THREE.TorusGeometry(0.185, 0.014, 5, 18).rotateX(Math.PI / 2));
    [[0.02, 0.022], [0.07, 0.012], [-0.04, 0.026]].forEach(([dy, rx], k) => {
      const rz = RPG_FAN[k], [mx, my] = rpgFanPt(k, H, yB), [rxP, ryP] = rpgFanPt(k, H + 0.1, yB), [bx, by] = rpgFanPt(k, H - 0.13 + dy, yB);
      add(chest, collar, M.pouch, mx, my, Z, 0, 0, rz);                         // cổ túi rút lại ôm đuôi đạn
      add(chest, ring, F0.cord, rxP, ryP, Z, 0, 0, rz);                         // dây rút
      add(chest, rbox(0.026, 0.24, 0.016), F0.cord, mx + 0.11, my - 0.02, Z + 0.17, 0.4, 0, 0.25 + rz);   // đuôi dây rút
      // mỗi quả một nhóm (một xương): rút khỏi ba lô thì thu về ~0 (rpgBagShow). at: gốc đầu đạn, dir: trục ống (hệ ngực)
      const slot = new THREE.Group(); chest.add(slot);
      slot.userData.at = V(bx, by, Z); slot.userData.dir = V(-Math.sin(rz), Math.cos(rz), 0);
      (chest.userData.rpgSlots || (chest.userData.rpgSlots = [])).push(slot);
      addRocketHead(slot, add, M, bx, by, Z, rx, 0, rz);
      addRocketCap(slot, add, M, bx, by, Z, rx, 0, rz);
    });
    straps.forEach((y, k) => {
      const cx = [0, 1, 2].map(j => rpgFanPt(j, y - (Y - H / 2), Y - H / 2)[0]), [c0, c1, c2] = cx;
      const c = new THREE.CatmullRomCurve3([[c0 - 0.24, -0.22], [c0 - 0.28, 0.0], [c0 - 0.23, 0.16], [c0 - 0.12, 0.25], [c0, 0.275], [(c0 + c1) / 2, 0.245], [c1, 0.275], [(c1 + c2) / 2, 0.245], [c2, 0.275], [c2 + 0.12, 0.25], [c2 + 0.23, 0.16], [c2 + 0.28, 0.0], [c2 + 0.24, -0.22]].map(q => V(q[0], y, Z + q[1])), false, 'centripetal');
      add(chest, strapGeo(c, 0.13, 0.024, 'rpgBagStrap' + k, V(0, y, Z - 0.4), 56), M.web2, 0, 0, 0);          // đai nén
      add(chest, rbox(0.17, 0.15, 0.04), M.knuck, c2, y, Z + 0.3);             // khoá đai trên mặt ống phải
      add(chest, rbox(0.1, 0.38, 0.012), M.web2, c2 + 0.1, y - 0.22, Z + 0.29, 0.06, 0, 0.12);    // đuôi đai thừa
    });
    packStraps(M, add, chest, 'rpgPackStrap', 0.6, TOP - 0.1, Z - 0.45);
  }


  // Súng bắn tỉa chống tăng: BAO ĐẠN đeo hông trái, dây chéo qua vai phải; 3 băng 5 viên dự phòng đứng trong bao, lộ viên đạn 20 mm trên cùng
  const ATR_BAG = { x: -1.72, y: -0.2, z: 0.4, w: 1.18, h: 1.3, d: 1.86 };
  const ATR_POUCH_ARC = V(-0.7, 0, -1.0);
  const ATR_POUCH_ELBOW = V(-3.7, 0.6, -1.0), ATR_REACH_MIN = 3.0, _mgK4 = V(0, 0, 0), _mgK5 = V(0, 0, 0), _mgK6 = V(0, 0, 0), _mgK1 = V(0, 0, 0), _mgK2 = V(0, 0, 0), _mgK3 = V(0, 0, 0), _mgY = V(0, 1, 0), _mgQ1 = new THREE.Quaternion(), _mgQ2 = new THREE.Quaternion(), _mgQ3 = new THREE.Quaternion(), _mgQ4 = new THREE.Quaternion(), _mgQ5 = new THREE.Quaternion(), _mgX = V(0, 0, 0), _mgC = V(0, 0, 0), _mgD = V(0, 0, 0), _mgE2 = V(0, 0, 0), _mgF = V(0, 0, 0), _mgM = new THREE.Matrix4(), _mgMB = new THREE.Matrix4(), ATR_KNEEL_POUCH = V(-1.0, -0.2, -0.8), ATR_KNEEL_BUMP = 0.5, ATR_KNEEL_LIFT = 0, _mgV2 = V(0, 0, 0);
  const ATR_KNEEL_TILT = -1.5;   // quỳ thay băng: góc xoay băng (quanh trục x súng) lúc mang tới / về bao: băng đứng, đế xuống   // gợi ý khuỷu trái lúc mang băng tới / về bao hông (hệ ngực)   // đường tay băng <-> bao hông trái phồng ra trước - trái (hệ ngực)
  function atrKit(M, add, chest) {
    const B = ATR_BAG, top = B.y + B.h / 2, park = M.glPark || (M.glPark = new THREE.MeshStandardMaterial({ color: 0x1f201e, roughness: 0.62, metalness: 0.35 }));
    const mats = atrMats(M), brass = mats.brass0, tip = mats.tip0;
    add(chest, rbox(B.w, B.h, B.d), M.pouch, B.x, B.y, B.z);
    add(chest, rbox(B.w + 0.03, 0.1, B.d + 0.03), M.vestD, B.x, top - 0.05, B.z);                 // viền miệng bao
    add(chest, rbox(0.05, 0.6, B.d - 0.12), M.vestD, B.x - B.w / 2 - 0.2, top - 0.2, B.z, 0, 0, -0.62);   // nắp bật ra ngoài, rủ xuống
    for (const dz of [-0.58, 0.58]) {
      add(chest, rbox(0.03, B.h - 0.08, 0.14), M.web2, B.x - B.w / 2 - 0.01, B.y, B.z + dz);      // đai dọc
      add(chest, rbox(0.05, 0.16, 0.2), M.knuck, B.x - B.w / 2 - 0.02, B.y + 0.26, B.z + dz);     // khoá đai
    }
    add(chest, rbox(0.16, 0.56, 1.0), M.pouch, B.x - B.w / 2 - 0.08, B.y - 0.34, B.z);            // túi phụ mặt ngoài
    add(chest, rbox(0.18, 0.1, 1.02), M.vestD, B.x - B.w / 2 - 0.08, B.y - 0.09, B.z);
    for (const dz of [-0.6, 0, 0.6]) {
      const y = top + 0.02, z = B.z + dz;
      add(chest, rbox(1.0, 0.34, 0.44), mats.gm, B.x, y - 0.1, z);                                // thân băng đạn chìa khỏi miệng bao
      for (const sz of [-1, 1]) {
        add(chest, rbox(0.72, 0.1, 0.03), mats.gm, B.x - 0.08, y - 0.14, z + sz * 0.225);         // gân dập
        add(chest, rbox(0.8, 0.09, 0.035), mats.steel, B.x + 0.02, y + 0.07, z + sz * 0.17, sz * 0.5, 0, 0);   // môi băng
      }
      add(chest, lathe('atrCase', ATR_CASE, 12), brass, B.x + 0.02, y + 0.13, z, 0, 0, Math.PI / 2).scale.set(1, 0.75, 1);   // viên trên cùng nằm dọc băng
      add(chest, lathe('atrTip', ATR_TIP, 12), tip, B.x + 0.02, y + 0.13, z, 0, 0, Math.PI / 2).scale.set(1, 0.75, 1);
    }
    const strap = new THREE.CatmullRomCurve3([V(B.x + 0.3, top - 0.1, B.z - 0.75), V(-1.2, 0.95, -0.95), V(-0.5, 1.45, -1.32), V(0.5, 2.5, -1.22), V(0.98, 3.1, -0.95), V(1.02, 3.46, -0.1), V(0.95, 3.05, 1.08), V(0.3, 2.2, 1.38), V(-0.7, 1.35, 1.38), V(B.x + 0.3, top - 0.1, B.z + 0.75)]);
    add(chest, strapGeo(strap, 0.34, 0.05, 'atrBagStrap', V(0, 1.8, 0.05), 120), M.web2, 0, 0, 0);
    for (const dz of [-0.75, 0.75]) add(chest, rbox(0.1, 0.16, 0.22), M.knuck, B.x + 0.3, top - 0.05, B.z + dz);   // khoen móc dây
  }
  // TRẠM ĐIỀU KHIỂN TÁC CHIẾN (rộng ~41 cm, màn hình ~20 cm): vỏ polymer đúc liền, 2 báng cầm gập được dưới lưng máy, mặt trước +z (màn hình), mặt lưng -z (pin, tản nhiệt)
  const KAMI_ANT_FOLD = Math.PI / 2, KAMI_ANT_OPEN = -0.22, KAMI_STICK = { x: 1.46, y: -0.3 }, KAMI_GRIP = { x: 1.4, y: 0.02, z: -0.12, open: 0 };
  const kamiNoise = (t, a, b) => Math.sin(t * a) * 0.6 + Math.sin(t * b + 1.3) * 0.4;
  let KAMI_FEED = null;
  function kamiFeed() {
    if (KAMI_FEED) return KAMI_FEED;
    const cv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    // ảnh nhiệt mặt đất: nền xám lục, mảng đất / bóng cây, vài đường mòn; lặp liền mép vì texture trôi
    const a = cv(256, 256), g = a.getContext('2d');
    g.fillStyle = '#3b463d'; g.fillRect(0, 0, 256, 256);
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 150; i++) {
      const x = rnd() * 256, y = rnd() * 256, r = 5 + rnd() * 26, v = 38 + Math.floor(rnd() * 80);
      g.fillStyle = 'rgba(' + v + ',' + (v + 10) + ',' + (v + 3) + ',0.5)';
      for (const dx of [-256, 0, 256]) for (const dy of [-256, 0, 256]) { g.beginPath(); g.arc(x + dx, y + dy, r, 0, 6.3); g.fill(); }
    }
    g.strokeStyle = 'rgba(190,200,185,0.5)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, 60); g.bezierCurveTo(90, 20, 150, 120, 256, 60); g.moveTo(90, 0); g.bezierCurveTo(50, 90, 140, 170, 90, 256); g.stroke();
    const map = new THREE.CanvasTexture(a); map.wrapS = map.wrapT = THREE.RepeatWrapping; map.repeat.set(0.55, 0.37);
    // vạch ngắm + số liệu bay
    const b = cv(256, 170), h = b.getContext('2d');
    h.strokeStyle = h.fillStyle = 'rgba(190,255,200,0.92)'; h.lineWidth = 1.5;
    h.beginPath(); h.moveTo(128, 62); h.lineTo(128, 78); h.moveTo(128, 92); h.lineTo(128, 108); h.moveTo(98, 85); h.lineTo(120, 85); h.moveTo(136, 85); h.lineTo(158, 85); h.stroke();
    for (const [x, y, sx, sy] of [[86, 52, 1, 1], [170, 52, -1, 1], [86, 118, 1, -1], [170, 118, -1, -1]]) { h.beginPath(); h.moveTo(x + sx * 12, y); h.lineTo(x, y); h.lineTo(x, y + sy * 12); h.stroke(); }
    h.beginPath(); for (let i = 0; i <= 10; i++) { const y = 30 + i * 11, w = i % 5 === 0 ? 12 : 6; h.moveTo(14, y); h.lineTo(14 + w, y); h.moveTo(242, y); h.lineTo(242 - w, y); } h.stroke();
    h.font = '11px monospace'; h.fillText('ALT 214', 34, 22); h.fillText('RNG 1.84', 164, 22); h.fillText('BAT 87', 34, 160); h.fillText('LINK OK', 164, 160);
    h.fillStyle = '#ff3b30'; h.beginPath(); h.arc(20, 18, 4, 0, 6.3); h.fill();
    const over = new THREE.CanvasTexture(b);
    KAMI_FEED = {
      map,
      feed: new THREE.MeshBasicMaterial({ map, toneMapped: false }),
      over: new THREE.MeshBasicMaterial({ map: over, transparent: true, depthWrite: false, toneMapped: false }),
      geo: new THREE.PlaneGeometry(1.42, 0.96)
    };
    return KAMI_FEED;
  }
  function kamiScreen(pad, on) {
    let S = pad.userData.screen;
    if (!S) {
      if (!on || typeof document === 'undefined') return;
      const K = kamiFeed();
      S = pad.userData.screen = new THREE.Group(); S.position.set(0, 0.13, 0.208);
      S.add(new THREE.Mesh(K.geo, K.feed));
      const o = new THREE.Mesh(K.geo, K.over); o.position.z = 0.004; o.renderOrder = 3; S.add(o);
      pad.add(S);
    }
    S.visible = on;
    if (on) { const t = performance.now() / 1000; KAMI_FEED.map.offset.set(t * 0.012 + 0.05 * Math.sin(t * 0.21), t * 0.03); }
  }
  function buildKamiPad(M, add) {
    const pad = new THREE.Group();
    const shell = M.kamiPadShell || (M.kamiPadShell = new THREE.MeshStandardMaterial({ color: 0x34362a, roughness: 0.78, metalness: 0.04 }));
    const rub = M.kamiPadRub || (M.kamiPadRub = new THREE.MeshStandardMaterial({ color: 0x191a17, roughness: 0.92, metalness: 0 }));
    const sticks = []; pad.userData.sticks = sticks;
    const W = 1.64, H = 0.88, C = 0.22;
    const zCyl = (r0, r1, l, x, y, z, mat, seg = 16) => add(pad, new THREE.CylinderGeometry(r0, r1, l, seg), mat, x, y, z, Math.PI / 2, 0, 0);
    if (!GEO.kamiPadBody) {
      const s = new THREE.Shape();
      s.moveTo(-W + C, -H); s.lineTo(W - C, -H); s.quadraticCurveTo(W, -H, W, -H + C);
      s.lineTo(W, H - C); s.quadraticCurveTo(W, H, W - C, H); s.lineTo(-W + C, H);
      s.quadraticCurveTo(-W, H, -W, H - C); s.lineTo(-W, -H + C); s.quadraticCurveTo(-W, -H, -W + C, -H);
      GEO.kamiPadBody = new THREE.ExtrudeGeometry(s, { depth: 0.26, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.035, bevelSegments: 2, curveSegments: 6 }).translate(0, 0, -0.13);
    }
    add(pad, GEO.kamiPadBody, shell, 0, 0, 0);
    // ốp cao su: 4 góc tròn + nẹp trên / dưới
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      // ốp góc bám đúng đường viền vỏ, dày hơn vỏ một chút
      const key = 'kamiPadCorner' + sx + sy;
      if (!GEO[key]) {
        const o = 0.055, X = W + o, Y = H + o, L = 0.5, c = new THREE.Shape();
        c.moveTo(sx * (X - L), sy * Y); c.lineTo(sx * (X - C), sy * Y); c.quadraticCurveTo(sx * X, sy * Y, sx * X, sy * (Y - C));
        c.lineTo(sx * X, sy * (Y - L)); c.lineTo(sx * (X - 0.14), sy * (Y - L)); c.lineTo(sx * (X - L), sy * (Y - 0.14)); c.closePath();
        GEO[key] = new THREE.ExtrudeGeometry(c, { depth: 0.34, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.02, bevelSegments: 2, curveSegments: 6 }).translate(0, 0, -0.17);
      }
      add(pad, GEO[key], rub, 0, 0, 0);
    }
    for (const y of [-H - 0.01, H + 0.01]) add(pad, rbox(2.2, 0.07, 0.3), rub, 0, y, 0);
    for (const sx of [-1, 1]) add(pad, rbox(0.05, 0.86, 0.3), rub, sx * (W + 0.02), -0.05, 0);   // đệm cao su hai mép
    // báng cầm: mỗi báng một xương, gập phẳng vào lưng máy khi treo, bung chếch xuống khi cầm (cổ tay thẳng, cẳng tay nằm ngang)
    const grips = [];
    for (const sx of [-1, 1]) {
      add(pad, rbox(0.3, 0.2, 0.1), rub, sx * KAMI_GRIP.x, KAMI_GRIP.y, KAMI_GRIP.z);   // gối bản lề
      const gr = new THREE.Group(); gr.position.set(sx * KAMI_GRIP.x, KAMI_GRIP.y, KAMI_GRIP.z); pad.add(gr); grips.push(gr);
      add(gr, new THREE.CylinderGeometry(0.135, 0.15, 1.0, 14), rub, 0, -0.52, 0);
      add(gr, new THREE.CylinderGeometry(0.185, 0.165, 0.09, 14), rub, 0, -1.04, 0);   // chặn đáy báng
      add(gr, rbox(0.1, 0.72, 0.05), M.web2, 0, -0.52, 0.14);                        // lót chống trượt
    }
    pad.userData.grips = grips;
    // mặt trước: viền + màn hình, chụp che nắng gập, hàng phím + nắp công tắc kích nổ, cần lái và phím hai bên
    add(pad, rbox(1.6, 1.14, 0.05), rub, 0, 0.13, 0.17);
    add(pad, rbox(1.46, 1.0, 0.02), M.lens, 0, 0.13, 0.195);
    add(pad, rbox(1.6, 0.035, 0.22), rub, 0, 0.73, 0.26, -0.2, 0, 0);
    for (const x of [-0.62, -0.38, 0.38, 0.62]) add(pad, rbox(0.17, 0.09, 0.05), rub, x, -0.66, 0.17);
    for (const x of [-0.11, 0.11]) add(pad, rbox(0.03, 0.17, 0.11), M.band, x, -0.66, 0.2);
    add(pad, rbox(0.1, 0.1, 0.05), rub, 0, -0.66, 0.17);
    for (const sx of [-1, 1]) {
      const x = sx * 0.98;
      zCyl(0.09, 0.1, 0.07, sx * 0.96, -0.3, 0.19, rub, 16);         // núm xoay camera
      zCyl(0.15, 0.15, 0.03, sx * KAMI_STICK.x, KAMI_STICK.y, 0.19, rub, 20);       // hốc cần lái
      const stick = new THREE.Group(); stick.position.set(sx * KAMI_STICK.x, KAMI_STICK.y, 0.19); pad.add(stick); sticks.push(stick);
      add(stick, new THREE.CylinderGeometry(0.035, 0.045, 0.14, 10), rub, 0, 0, 0.05, Math.PI / 2, 0, 0);
      add(stick, new THREE.CylinderGeometry(0.09, 0.08, 0.05, 14), rub, 0, 0, 0.13, Math.PI / 2, 0, 0);
      for (const y of [0.56, 0.36, 0.16]) add(pad, rbox(0.14, 0.09, 0.05), rub, x, y, 0.17);
    }
    // mặt lưng: pin + 2 chốt, nhãn, tản nhiệt, khoen treo
    add(pad, rbox(1.72, 0.84, 0.1), rub, 0, -0.26, -0.19);
    add(pad, rbox(1.56, 0.68, 0.03), shell, 0, -0.26, -0.24);
    for (const x of [-0.55, 0.55]) add(pad, rbox(0.26, 0.09, 0.05), M.knuck, x, 0.11, -0.22);
    for (let i = 0; i < 5; i++) add(pad, rbox(1.2, 0.035, 0.02), rub, 0, -0.5 + i * 0.12, -0.26);
    for (let i = 0; i < 11; i++) add(pad, rbox(0.04, 0.34, 0.08), shell, -0.9 + i * 0.18, 0.5, -0.19);
    for (const x of [-0.95, 0.95]) add(pad, rbox(0.22, 0.05, 0.12), M.knuck, x, H + 0.05, -0.08);
    // ăng-ten lá gập được: bản lề + lá cao su; mỗi lá một xương, cất thì nằm dọc mép trên (KAMI_ANT_FOLD), dùng thì dựng lên
    const ants = [];
    for (const sx of [-1, 1]) {
      add(pad, new THREE.CylinderGeometry(0.06, 0.06, 0.18, 10), rub, sx * 1.2, H + 0.05, 0.05, 0, 0, Math.PI / 2);
      const ant = new THREE.Group(); ant.position.set(sx * 1.2, H + 0.05, 0.05); ant.userData.sx = sx; ant.rotation.z = sx * KAMI_ANT_FOLD;
      add(ant, rbox(0.2, 0.72, 0.06), rub, 0, 0.36, 0);
      pad.add(ant); ants.push(ant);
    }
    pad.userData.ants = ants;
    return pad;
  }

  // UAV cảm tử: 3 ống dựng đứng ôm sát khung lưng (mỗi ống một xương: rút ra thì mất khỏi lưng) + máy điều khiển trong túi ngực
  function kamiKit(M, add, chest) {
    const Z = 1.72, Y = 1.35, TZ = Z + 0.22, TX = 0.94;
    const cloth = M.kamiBagCloth || (M.kamiBagCloth = new THREE.MeshStandardMaterial({ color: 0x5d5340, roughness: 0.95, metalness: 0 }));
    const bind = M.kamiBagBind || (M.kamiBagBind = new THREE.MeshStandardMaterial({ color: 0x3d3729, roughness: 0.95, metalness: 0 }));
    // tấm lưng đệm vải có viền may + dây gài; ống giữ bằng đai vải của từng ống
    const PY = Y - 0.82, PH = 3.84;
    add(chest, rbox(2.9, PH, 0.2), cloth, 0, PY, Z - 0.34);
    for (const x of [-1.44, 1.44]) add(chest, rbox(0.07, PH + 0.02, 0.23), bind, x, PY, Z - 0.34);
    add(chest, rbox(2.9, 0.07, 0.23), bind, 0, PY + PH / 2, Z - 0.34);
    for (const y of [-0.6, 0.1, 0.8, 1.5]) add(chest, rbox(2.5, 0.09, 0.02), M.web2, 0, y, Z - 0.23);
    add(chest, rbox(2.9, 0.07, 0.23), bind, 0, PY - PH / 2, Z - 0.34);
    const tubes = [];
    for (const x of [0, -TX, TX]) {   // rút từ cuối mảng: ống bên phải trước, ống giữa sau cùng
      const t = buildKamiTube(M, add, true); t.position.set(x, Y - 2.95, TZ); t.rotation.set(Math.PI / 2, 0, Math.PI * 0.75);   // đáy dưới, miệng lên trên; chân xếp + giắc quay ra sau
      chest.add(t);
      tubes.push(t);
    }
    chest.userData.kamiTubes = tubes;
    // giá gắn trên giáp: máy treo DỌC úp màn hình vào ngực (ngang thì chắn đường tay), 2 ngàm kẹp giữ; rút máy ra thì giá ở lại
    // máy đã thu nhỏ (KAMI.padScale): giá vừa khít máy, đặt cao trên ngực, đáy giá trên thắt lưng (thấp hơn thì quỳ / ngồi là đùi đâm xuyên)
    // đệm mỏng ~2 cm (RZ0 mặt giáp -> RZ1); máy tì lên mặt ngoài, chụp che nắng + cần lái lún vào đệm
    const RY = KAMI.pad.y, RH = 2.3, RZ0 = -1.04, RZ1 = -1.2, RD = RZ0 - RZ1, RC = (RZ0 + RZ1) / 2;
    add(chest, rbox(1.56, RH, RD), cloth, 0, RY, RC);
    add(chest, rbox(1.5, 0.6, 0.16), cloth, 0, RY - RH / 2 + 0.3, RZ0 + 0.06);   // mặt giáp phía dưới lùi vào (~-0,9): chêm cho khỏi hở
    for (const x of [-0.8, 0.8]) add(chest, rbox(0.07, RH + 0.02, RD + 0.02), bind, x, RY, RC);
    for (const x of [-0.42, 0.42]) add(chest, rbox(0.15, RH - 0.24, 0.03), M.web2, x, RY, RZ1 - 0.01);
    for (const x of [-0.56, 0.56]) {
      add(chest, rbox(0.15, 0.6, 0.04), M.web2, x, RY + RH / 2 + 0.22, -1.08, 0.32, 0, 0);        // đai nối lên quai vai
      add(chest, rbox(0.15, 0.5, 0.04), M.web2, x, RY - RH / 2 - 0.2, -1.04, -0.3, 0, 0);       // đai nối xuống thắt lưng
    }
    // ngàm kẹp ôm hai đầu máy: xương riêng, rút máy ra thì thu sát khối đệm
    const clips = new THREE.Group(); clips.position.set(0, 0, RZ1); chest.add(clips); chest.userData.kamiClips = clips;
    const PE = 1.64 * KAMI.padScale + 0.09;   // nửa chiều dài máy treo dọc + khe ngàm
    const CD = RZ1 - KAMI.pad.z + 0.31 * KAMI.padScale;   // từ mặt đệm tới mặt ngoài máy (báng gập)
    for (const y of [RY - PE, RY + PE]) {
      add(clips, rbox(0.7, 0.1, CD), bind, 0, y, -CD / 2);
      add(clips, rbox(0.7, 0.3, 0.06), bind, 0, y + (y < RY ? 0.1 : -0.1), -CD - 0.03);
    }
    const pad = buildKamiPad(M, add); pad.position.copy(KAMI.pad); pad.scale.setScalar(KAMI.padScale); chest.add(pad);
    chest.userData.kamiPad = pad;
    packStraps(M, add, chest, 'kamiPackStrap', 0.6, Y + 0.85, Z - 0.42);
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
  // Thắt lưng bộ binh đeo đè lên cạp quần: đường viền lấy từ mặt quần thật (mặt cắt quần là siêu elip + mông, elip thường để góc quần chọc xuyên đai)
  const BELT_Y = -0.66, BELT_N = 72;
  function beltFit() {
    if (GEO.beltFit) return GEO.beltFit;
    const P = [];
    for (let i = 0; i < BELT_N; i++) {
      const t = i / BELT_N * 2, side = t < 1 ? 1 : -1, u = t < 1 ? t : 2 - t, a = Math.PI * (u - 0.8 * Math.sin(2 * Math.PI * u) / (2 * Math.PI)), surf = GEO['pantsSurf' + side];
      let best = null, bd = -1;   // bản đai cứng: lấy chỗ nhô nhất trong bề cao đai, không lượn theo mông
      for (let k = 0; k <= 6; k++) { const Q = surf(BELT_Y - 0.235 + 0.47 * k / 6, Math.PI - side * a), d = Q.x * Q.x + Q.z * Q.z; if (d > bd) { bd = d; best = Q; } }
      P.push([best.x, best.z]);
    }
    const pts = P.map((q, i) => {
      const a = P[(i + BELT_N - 2) % BELT_N], b = P[(i + BELT_N - 1) % BELT_N], c = P[(i + 1) % BELT_N], d = P[(i + 2) % BELT_N];
      const x = (a[0] + b[0] + q[0] + c[0] + d[0]) / 5, z = (a[1] + b[1] + q[1] + c[1] + d[1]) / 5;
      let nx = c[1] - b[1], nz = b[0] - c[0]; const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
      if (nx * x + nz * z < 0) { nx = -nx; nz = -nz; }
      return { x, z, nx, nz };
    });
    return (GEO.beltFit = pts);
  }
  // điểm trên đường viền đai theo góc a (quy ước beltPouch: 0 giữa bụng, PI/2 hông +x)
  function beltAt(a) {
    const tx = Math.sin(a), tz = -Math.cos(a); let best = null, bd = -2;
    for (const p of beltFit()) { const l = Math.hypot(p.x, p.z) || 1, d = (p.x * tx + p.z * tz) / l; if (d > bd) { bd = d; best = p; } }
    return best;
  }
  // rows: [dy so với tâm đai, độ nổi khỏi mặt quần] từ dưới lên
  function beltSkin(kind, rows) {
    const key = 'beltSkin_' + kind;
    if (GEO[key]) return GEO[key];
    const F = beltFit(), pos = [], uv = [], idx = [], W = rows.length;
    for (let i = 0; i <= BELT_N; i++) for (let k = 0; k < W; k++) {
      const p = F[i % BELT_N];
      pos.push(p.x + p.nx * rows[k][1], rows[k][0], p.z + p.nz * rows[k][1]); uv.push(i / BELT_N, k / (W - 1));
    }
    for (let i = 0; i < BELT_N; i++) for (let k = 0; k < W - 1; k++) { const q = i * W + k, r = q + W, u = q + 1, v = r + 1; idx.push(q, u, r, r, u, v); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    const m = W >> 1, N = g.attributes.normal, p0 = F[0];   // kiểm chiều mặt tại hàng giữa
    if (N.getX(m) * p0.nx + N.getZ(m) * p0.nz < 0) { for (let t = 0; t < idx.length; t += 3) { const q = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = q; } g.setIndex(idx); g.computeVertexNormals(); }
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
    // kim loại cần cảnh để phản chiếu: không có thì súng, khoá đen kịt như mảng bóng
    if (o.metalness > 0.3) { o.envMap = metalEnv(); o.envMapIntensity = 0.55; }
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
  // PHONG HOÁ VŨ KHÍ + ĐỒ ĐEO (chỉ lưới bậc gần): thuộc tính đỉnh `wear` (0 quân phục, người; 1 vũ khí) quyết định mức.
  // Toạ độ / pháp tuyến lấy từ tư thế gốc nên vết bẩn dính chặt vào vật khi cử động. Mòn mép tính theo độ cong bề mặt (đạo hàm pháp tuyến / đạo hàm vị trí),
  // không phụ thuộc cự ly nhìn; bụi bám mặt hướng lên và thành mảng, màu theo chiến trường.
  const WEAR_DUST = { value: new THREE.Color(0x8a7a5c) }, WEAR_MUD = { value: new THREE.Color(0x3d3522) };   // bùn phải tối hơn quân phục mọi chiến trường, cùng tông thì không thấy bẩn
  const WEAR_MUD_OF = { DESERT: 0x54452f, JUNGLE: 0x3b3620, URBAN: 0x4b4840, TEMPERATE: 0x443a26 };
  const WEAR_DUST_OF = { DESERT: 0xa08a62, JUNGLE: 0x4f4a30, URBAN: 0x77746c, TEMPERATE: 0x6f6346 };
  const WEAR_VERT = 'attribute float wear;\nvarying vec4 vWearQ;\nvarying vec3 vWearN;\nvarying vec4 vG0;\nvarying vec4 vG1;\nvarying vec4 vG2;\nvarying vec3 vSoil;';
  const WEAR_FRAG = `varying vec4 vWearQ;\nvarying vec3 vWearN;\nvarying vec4 vG0;\nvarying vec4 vG1;\nvarying vec4 vG2;\nvarying vec3 vSoil;\nuniform vec3 wearDust;\n#define vWear vWearQ.w\n#define vWearP vWearQ.xyz
float wH(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float wN(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(wH(i), wH(i + vec3(1,0,0)), f.x), mix(wH(i + vec3(0,1,0)), wH(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(wH(i + vec3(0,0,1)), wH(i + vec3(1,0,1)), f.x), mix(wH(i + vec3(0,1,1)), wH(i + vec3(1,1,1)), f.x), f.y), f.z); }`;
  const WEAR_APPLY = `if (vWear > 0.01) {
    vec3 wN0 = normalize(vWearN);
    float big = wN(vWearP * 1.7) * 0.65 + wN(vWearP * 4.3) * 0.35, fine = wN(vWearP * 11.0) * 0.6 + wN(vWearP * 27.0) * 0.4;
    float curv = length(fwidth(wN0)) / max(length(fwidth(vWearP)), 1e-4);
    float edge = smoothstep(5.0, 20.0, curv) * smoothstep(0.34, 0.62, fine * 0.7 + big * 0.3);
    float scr = smoothstep(0.78, 0.86, wN(vec3(vWearP.x * 34.0, vWearP.y * 34.0, vWearP.z * 2.2))) * smoothstep(0.45, 0.7, big);
    if (vWear > 1.05) {
      // súng sơn rằn phun tay ngoài chiến trường: mảng sơn mềm mép, chỗ tay cầm / va chạm bong ra thành mảng lộ phốt phát
      vec3 pq = vWearP * vec3(0.9, 0.9, 0.55);
      float pc = wN(pq + 3.1) * 0.7 + wN(pq * 2.3) * 0.3, chip = smoothstep(0.6, 0.7, fine * 0.55 + big * 0.45);
      vec3 paint = mix(vec3(0.2, 0.19, 0.13), vec3(0.41, 0.35, 0.25), smoothstep(0.46, 0.54, pc));
      float pk = 0.9 * (1.0 - chip);
      diffuseColor.rgb = mix(diffuseColor.rgb, paint, pk);
      metalnessFactor *= 1.0 - pk;
      roughnessFactor = mix(roughnessFactor, 0.84, pk);
    }
    diffuseColor.rgb *= mix(1.0, 0.66 + 0.62 * big, min(vWear, 1.0));
    float up = smoothstep(0.1, 0.85, wN0.y), dust = min(vWear, 1.2) * clamp(smoothstep(0.46, 0.8, big * 0.75 + fine * 0.25) * 0.28 + up * (0.14 + 0.44 * fine), 0.0, 0.72);
    diffuseColor.rgb = mix(diffuseColor.rgb, wearDust, dust);
    roughnessFactor = mix(roughnessFactor, 0.95, dust);
    metalnessFactor *= 1.0 - dust;
    float bare = min(vWear, 1.0) * clamp(edge * 0.85 + scr * 0.5, 0.0, 1.0) * (1.0 - dust * 0.6);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.37, 0.36, 0.33), bare);
    metalnessFactor = mix(metalnessFactor, 0.8, bare);
    roughnessFactor = mix(roughnessFactor, 0.38, bare);
  } else if (vWear < -0.01) {
    // VẢI ĐÃ QUA CHIẾN TRƯỜNG: mức bẩn từng vùng do lính tích luỹ (updateGrime): nằm thì bẩn bụng, quỳ bẩn gối, đi nhiều bẩn ống quần
    float K = -vWear; vec3 q = vWearP, wN1 = normalize(vWearN), base = diffuseColor.rgb;
    float big = wN(q * 0.9) * 0.55 + wN(q * 2.6) * 0.45, mid = wN(q * 6.0) * 0.6 + wN(q * 15.0) * 0.4, fine = wN(q * 31.0) * 0.55 + wN(q * 71.0) * 0.45;
    float side = step(1.55, abs(q.x));
    float low = (1.0 - smoothstep(-8.6, -2.6, q.y + (big - 0.5) * 3.0)) * vG1.x;
    float sole = (1.0 - smoothstep(-8.62, -8.2, q.y + (fine - 0.5) * 0.3)) * clamp(vG1.x * 2.0, 0.0, 1.0);
    float knee = exp(-pow((q.y + 4.8) / 1.2, 2.0)) * smoothstep(0.3, -0.4, q.z) * vG1.y;
    float front = smoothstep(0.25, -0.5, wN1.z) * smoothstep(-6.0, -2.0, q.y) * smoothstep(3.6, 1.4, q.y) * vG1.z;
    float forearm = side * smoothstep(1.2, -1.5, q.y) * vG1.w;
    float elbow = side * exp(-pow((q.y - 0.4) / 1.0, 2.0)) * vG1.w;
    float seat = smoothstep(0.1, 0.7, wN1.z) * exp(-pow((q.y + 1.8) / 1.2, 2.0)) * vG2.x;
    float up = smoothstep(0.3, 0.95, wN1.y) * vG0.w;
    float zone = clamp(low * 1.3 + knee * 1.5 + front * 1.4 + forearm + elbow * 1.3 + seat * 1.3 + up * 0.3, 0.0, 1.0);
    float age = vG0.w;
    float lum = dot(base, vec3(0.3, 0.59, 0.11));
    base = mix(base, vec3(lum), 0.2 * K * age);                                                                   // nắng + giặt: rằn ri bạc đi
    base *= mix(1.0, 0.84 + 0.2 * big, K * age);                                                                  // ố sẫm chung
    float stain = smoothstep(0.48, 0.7, big * 0.7 + mid * 0.3) * (0.5 * age + 0.5 * zone);
    base = mix(base, mix(base * 0.66, vSoil * 1.25, 0.35), stain * K * 0.6);                                      // vết bẩn lớn, vẫn thấy vân rằn bên dưới
    float mudA = zone * smoothstep(0.44, 0.66, mid * 0.82 + fine * 0.18 + zone * 0.1);                            // thành mảng rời, giữa các mảng còn thấy rằn ri
    base = mix(base, mix(vSoil * 1.25, vSoil * 0.85, fine), mudA * K * 0.74);
    float spl = smoothstep(0.76, 0.82, wN(q * 22.0 + big * 3.0)) * clamp(low * 1.4 + front * 0.6 + forearm * 0.5, 0.0, 1.0);
    base = mix(base, vSoil * 0.7, spl * K * 0.85);                                                                // đất bắn tung
    // GIÀY: thân giày + gấu quần phủ bụi đất từ mũi lên cổ giày; đế là đất nén sẫm lốm đốm, gai cao su lộ ra chỗ mòn (màu đất sáng đều thì đế ngửa lên nắng trông như đế be của giày mới)
    float bootA = (1.0 - smoothstep(-8.1, -6.9, q.y + (big - 0.5) * 0.9)) * clamp(vG1.x * 1.3, 0.0, 1.0);
    base = mix(base, mix(wearDust, vSoil * 1.1, smoothstep(0.35, 0.65, mid)), bootA * K * (0.3 + 0.45 * smoothstep(0.38, 0.62, mid * 0.7 + fine * 0.3)));
    base = mix(base, mix(vSoil * 0.5, mix(vSoil * 0.72, wearDust * 0.7, 0.28), smoothstep(0.25, 0.8, mid * 0.75 + fine * 0.25)), sole * K * 0.9);   // hơi ngả màu bụi từng map; tương phản thấp, vệt to: chênh nhiều hoặc theo nhiễu mịn thì thành hoa văn rằn ri số
    base = mix(base, diffuseColor.rgb * 0.8, sole * K * smoothstep(0.6, 0.78, mid) * 0.7);
    float dustA = clamp(up * smoothstep(0.4, 0.7, mid) * 0.36, 0.0, 0.5) * (1.0 - clamp(low * 1.3, 0.0, 1.0));
    base = mix(base, wearDust, dustA * K);                                                                        // bụi khô đọng mặt trên
    diffuseColor.rgb = base;
    float caked = clamp(mudA + spl + dustA + sole + bootA * 0.5, 0.0, 1.0) * K;
    roughnessFactor = mix(roughnessFactor, 1.0, caked);
    metalnessFactor *= 1.0 - caked * 0.85;
  }
  if (vWear < 0.9 && abs(vWear) > 0.01) {
    // ƯỚT: sẫm và bóng tới mực đã ngập, khô dần theo vG0.y; vệt bùn ở mức nước cao nhất ở lại vĩnh viễn
    vec3 wQ2 = vWearP, wN2 = normalize(vWearN);
    float m2 = wN(wQ2 * 7.0) * 0.6 + wN(wQ2 * 19.0) * 0.4;
    float wetA = 1.0 - smoothstep(vG0.x - 0.22, vG0.x + 0.22, wQ2.y + (m2 - 0.5) * 0.55);
    wetA = max(wetA, smoothstep(0.15, -0.35, wN2.z) * vG2.y);                                                     // nằm trong nước: ướt cả mặt trước
    wetA *= vG0.y;
    diffuseColor.rgb *= mix(1.0, 0.5, wetA);
    roughnessFactor = mix(roughnessFactor, 0.3, wetA * 0.85);
    float below = 1.0 - smoothstep(vG0.z - 0.08, vG0.z + 0.08, wQ2.y + (m2 - 0.5) * 0.3);
    float line = exp(-pow((wQ2.y + (m2 - 0.5) * 0.3 - vG0.z) / 0.09, 2.0)) * smoothstep(0.3, 0.6, m2);
    diffuseColor.rgb = mix(diffuseColor.rgb, vSoil * 0.95, clamp(below * 0.24 * smoothstep(0.32, 0.7, m2) + line * 0.62, 0.0, 1.0));
  }`;
  function fillMat(m) {
    if (!m.isMeshStandardMaterial || m.userData.soldierFill) return m;
    m.userData.soldierFill = true;
    const wearOn = m !== LOD_SOLID && m !== LOD_FAR;
    if (wearOn) { m.defines = Object.assign(m.defines || {}, { USE_WEAR: 1 }); m.extensions = Object.assign(m.extensions || {}, { derivatives: true }); }
    m.onBeforeCompile = (sh) => {
      sh.uniforms.soldierFill = SOLDIER_FILL;
      sh.uniforms.wearDust = WEAR_DUST;
      sh.vertexShader = '#ifdef USE_WEAR\n' + WEAR_VERT + '\n#endif\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n#ifdef USE_WEAR\nvWearQ = vec4(position, wear); vWearN = normal;\n#if defined(USE_SKINNING) && defined(BONE_TEXTURE)\nmat4 gm = getBoneMatrix(float(boneTextureSize * boneTextureSize / 4) - 1.0);\nvG0 = gm[0]; vG1 = gm[1]; vG2 = gm[2]; vSoil = gm[3].xyz;\n#else\nvG0 = vec4(-100.0, 0.0, -100.0, 0.8); vG1 = vec4(0.5); vG2 = vec4(0.4, 0.0, 0.0, 0.0); vSoil = vec3(0.22, 0.18, 0.12);\n#endif\n#endif');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float soldierFill;\n#ifdef USE_WEAR\n' + WEAR_FRAG + '\n#endif')
        .replace('#include <normal_fragment_begin>', '#ifdef USE_WEAR\n' + WEAR_APPLY + '\n#endif\n#include <normal_fragment_begin>')
        .replace('#include <aomap_fragment>', 'reflectedLight.indirectDiffuse *= soldierFill;\n#include <aomap_fragment>');
    };
    m.needsUpdate = true;
    return m;
  }
  const BAKE_CACHE = new Map(), LOD_CELL = [0.022, 0.19, 0.36, 0.26];   // bậc 1, bậc 2, lưới đổ bóng
  let LOD_SOLID = null, LOD_FAR = null, LOD_SHADOW = null;
  const lodMats = () => {
    if (LOD_FAR) return;
    // hai mặt: lưới gộp có cả mảnh vẽ hai mặt (kính, dải vải); một mặt thì kính bị cắt bỏ, lộ da phía sau thành mảng hồng
    LOD_SOLID = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0.05, skinning: true, side: THREE.DoubleSide });
    LOD_FAR = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, skinning: true, side: THREE.DoubleSide });
    LOD_SHADOW = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, skinning: true });
  };
  // Gộp đỉnh theo ô lưới (không trộn đỉnh khác xương; keepFacing tách theo hướng pháp tuyến để giữ mép vật mỏng).
  // parts: gộp riêng từng mảnh nguồn với ô riêng (p.cell), không bao giờ nhập đỉnh hai mảnh khác nhau, bỏ mảnh không có cell
  // -> chi tiết mỏng không dính vào thân / rách như khi gộp cả khối bằng một ô to
  function clusterGeo(g, cell, keepFacing, parts) {
    const P = g.attributes.position.array, N = g.attributes.normal.array, U = g.attributes.uv.array, C = g.attributes.color ? g.attributes.color.array : null;
    const SI = g.attributes.skinIndex.array, SW = g.attributes.skinWeight.array, I = g.index.array, n = P.length / 3, WR = g.attributes.wear ? g.attributes.wear.array : null;
    const remap = new Int32Array(n).fill(-1), sum = [], tri = [];
    const list = parts || [{ ov: 0, n, oi: 0, cnt: I.length, cell }];
    for (const part of list) {
      const pc = part.cell;
      const facing = keepFacing && (!parts || part.a < pc * 1.5);   // khối tròn to không cần tách mặt (tốn gấp đôi đỉnh), chỉ tấm mỏng 2 mặt mới cần
      if (!pc) continue;
      const ids = new Map();
      for (let i = part.ov; i < part.ov + part.n; i++) {
        const i3 = i * 3, i4 = i * 4, ix = Math.floor(P[i3] / pc) + 512, iy = Math.floor(P[i3 + 1] / pc) + 512, iz = Math.floor(P[i3 + 2] / pc) + 512;
        const face = facing ? (N[i3] > 0 ? 1 : 0) + (N[i3 + 1] > 0 ? 2 : 0) + (N[i3 + 2] > 0 ? 4 : 0) : 0;
        const wk = Math.round(SW[i4 + 1] * 3), key = ((((ix * 1024 + iy) * 1024 + iz) * 8 + face) * 64 + SI[i4]) * 256 + (wk ? SI[i4 + 1] * 4 + wk : 0);
        let id = ids.get(key);
        if (id === undefined) { id = sum.length; ids.set(key, id); sum.push({ i, k: 0, x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0, r: 0, gc: 0, b: 0 }); }
        const q = sum[id]; q.k++; q.x += P[i3]; q.y += P[i3 + 1]; q.z += P[i3 + 2]; q.nx += N[i3]; q.ny += N[i3 + 1]; q.nz += N[i3 + 2];
        if (C) { q.r += C[i3]; q.gc += C[i3 + 1]; q.b += C[i3 + 2]; }
        remap[i] = id;
      }
      for (let t = part.oi; t < part.oi + part.cnt; t += 3) { const a = remap[I[t]], b = remap[I[t + 1]], c = remap[I[t + 2]]; if (a !== b && b !== c && a !== c) tri.push(a, b, c); }
    }
    const m = sum.length, wr = WR ? new Float32Array(m) : null, pos = new Float32Array(m * 3), nor = new Float32Array(m * 3), uv = new Float32Array(m * 2), col = C ? new Float32Array(m * 3) : null, si = new Uint16Array(m * 4), sw = new Float32Array(m * 4);
    sum.forEach((q, j) => {
      const j3 = j * 3, j4 = j * 4, o = q.i, l = Math.hypot(q.nx, q.ny, q.nz);
      pos[j3] = q.x / q.k; pos[j3 + 1] = q.y / q.k; pos[j3 + 2] = q.z / q.k;
      if (l > 1e-3) { nor[j3] = q.nx / l; nor[j3 + 1] = q.ny / l; nor[j3 + 2] = q.nz / l; } else { nor[j3] = N[o * 3]; nor[j3 + 1] = N[o * 3 + 1]; nor[j3 + 2] = N[o * 3 + 2]; }
      uv[j * 2] = U[o * 2]; uv[j * 2 + 1] = U[o * 2 + 1];
      if (wr) wr[j] = WR[o];
      if (C) { col[j3] = q.r / q.k; col[j3 + 1] = q.gc / q.k; col[j3 + 2] = q.b / q.k; }
      for (let k = 0; k < 4; k++) { si[j4 + k] = SI[o * 4 + k]; sw[j4 + k] = SW[o * 4 + k]; }
    });
    const o = new THREE.BufferGeometry();
    o.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    o.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    o.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    if (col) o.setAttribute('color', new THREE.BufferAttribute(col, 3));
    o.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    o.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    if (wr) o.setAttribute('wear', new THREE.BufferAttribute(wr, 1));
    o.setIndex(new THREE.BufferAttribute(m > 65535 ? new Uint32Array(tri) : new Uint16Array(tri), 1));
    return o;
  }
  // Số đo một mảnh nguồn trong lưới gộp: c = cạnh dài nhất, s = diện tích / c (~ bề ngang: dải, ống mảnh thì nhỏ dù dài)
  function partStats(pos, idx, p) {
    let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9, area = 0;
    for (let i = p.ov; i < p.ov + p.n; i++) {
      const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z;
    }
    for (let t = p.oi; t < p.oi + p.cnt; t += 3) {
      const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
      const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2], vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
      area += 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
    }
    p.c = Math.max(x1 - x0, y1 - y0, z1 - z0, 1e-3);
    p.a = Math.min(x1 - x0, y1 - y0, z1 - z0);
    p.s = area / p.c;
    p.tris = p.cnt / 3;
    return p;
  }
  // Chính sách từng bậc: mảnh nhỏ thì bỏ hẳn, mảnh còn lại gộp với ô tỉ lệ bề ngang của nó
  const LOD_POLICY = {
    near:   { minC: 0.32, minS: 0.34, cheap: 40, k: 0.3, c0: 0.07, c1: 0.36, sz: 0.22 },
    far:    { minC: 1.1,  minS: 0.9,  cheap: 14, k: 0.4, c0: 0.2, c1: 0.8, sz: 0.17, far: true },
    shadow: { minC: 1.0,  minS: 0.8,  cheap: 14, k: 0.14, c0: 0.09, c1: 0.3, sz: 0.5, far: true }   // ô to (0,2-0,7, ~1000 đỉnh): bóng tự đổ thành mảng đa giác trên vai, nhìn như vết lõm
  };
  const partsFor = (parts, pol) => parts.map(p => Object.assign({}, p, {
    cell: p.lod0 || (pol.far && p.noFar) || (!p.keep && (p.c < pol.minC || (p.s < pol.minS && p.tris > pol.cheap))) ? 0 : p.keep ? 0.1 : Math.max(pol.c0, Math.min(pol.c1, p.s * pol.k, p.c * pol.sz))   // sz: vật nhỏ tròn (mũ, đầu) vẫn đủ vài ô, không nát
  }));
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
    // ở 25-80 m chỉ vải chính (thân, quần) cần rằn ri; giữ riêng hai lưới này, còn lại đổ màu đỉnh một lượt vẽ
    const bigMap = e => e.mat.map && e.geo.index.count > 60000;
    const near = list.map(e => ({ geo: clusterGeo(e.geo, 0, true, partsFor(e.parts, LOD_POLICY.near)), mat: e.mat, renderOrder: e.renderOrder, userData: e.userData, big: bigMap(e) }));
    const solids = near.filter(e => !e.big), lod1 = near.filter(e => e.big).map(e => { lodBounds(e.geo); return e; });
    if (solids.length) lod1.push({ geo: lodBounds(mergeColored(solids)), mat: LOD_SOLID, renderOrder: solids[0].renderOrder, userData: solids[0].userData });
    const ro = list[0].renderOrder, ud = list[0].userData;
    // gộp mọi bucket làm một, dời chỉ số mảnh theo vị trí trong lưới gộp
    const all = mergeColored(list.map(e => ({ geo: e.geo, mat: e.mat }))), allParts = [];
    { let ov = 0, oi = 0; for (const e of list) { for (const p of e.parts) allParts.push(Object.assign({}, p, { ov: p.ov + ov, oi: p.oi + oi })); ov += e.geo.attributes.position.count; oi += e.geo.index.count; } }
    const far = lodBounds(clusterGeo(all, 0, true, partsFor(allParts, LOD_POLICY.far)));
    const caster = lodBounds(clusterGeo(all, 0, false, partsFor(allParts, LOD_POLICY.shadow)));
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

  // KÍP XE DÙNG LƯỚI BỘ BINH: vật liệu lính dùng chung là đục, còn kíp xe phải vẽ ở lượt trong suốt (sau khi lòng hố lỗ nóc xoá độ sâu, xem recon_marten) nên có bản riêng.
  // Dò trúng đạn đi qua khối dò của vehicle_crew: tia không duyệt lưới skinned (mỗi lần cả trăm nghìn tam giác), các vòng lặp hiệu ứng xe cũng bỏ qua (isFxDecal).
  const CREW_MATS = new WeakMap(), CREW_DEAD = new WeakMap();
  const noRay = () => {};
  function crewMatOf(m0) {
    let m = CREW_MATS.get(m0);
    if (m) return m;
    m = m0.clone();
    m.defines = Object.assign({}, m0.defines); m.extensions = m0.extensions; m.onBeforeCompile = m0.onBeforeCompile; m.customProgramCacheKey = m0.customProgramCacheKey;
    m.userData = Object.assign({}, m0.userData);
    m.skinning = true; m.transparent = true; m.opacity = 1;
    CREW_MATS.set(m0, m);
    return m;
  }
  function crewSkinMats(L) {
    for (const lv of L.levels) for (const o of lv) {
      if (o.isSkinnedMesh) { o.material = crewMatOf(o.material); o.raycast = noRay; }
      o.userData.isFxDecal = true;
    }
    L.caster.raycast = noRay; L.caster.userData.isFxDecal = true;
  }
  // tử trận: vật liệu lính dùng chung nên đổi cả bộ sang bản thẫm màu của riêng người này
  function setCrewDead(F, on) {
    const L = F && F.lod;
    if (!L) return;
    for (const lv of L.levels) for (const o of lv) {
      if (!o.isSkinnedMesh) continue;
      if (on && !o.userData.liveMat) {
        o.userData.liveMat = o.material;
        let d = CREW_DEAD.get(o.material);
        if (!d) {
          d = crewMatOf(o.material).clone();
          d.defines = Object.assign({}, o.material.defines); d.extensions = o.material.extensions; d.onBeforeCompile = o.material.onBeforeCompile; d.customProgramCacheKey = o.material.customProgramCacheKey;
          d.userData = Object.assign({}, o.material.userData); d.skinning = true; d.transparent = true; d.opacity = 1;
          d.color.multiply(new THREE.Color(0.5, 0.45, 0.43));
          CREW_DEAD.set(o.material, d);
        }
        o.material = d;
      } else if (!on && o.userData.liveMat) { o.material = o.userData.liveMat; o.userData.liveMat = null; }
    }
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
    // vật liệu dùng chung giữa các lính nên trạng thái bẩn / ướt riêng đi qua ô cuối kết cấu xương (mỗi lính một kết cấu, khỏi tách vật liệu, thêm lượt vẽ)
    skeleton.grime = new Float32Array(16);
    const skelUpdate = skeleton.update;
    skeleton.update = function () { skelUpdate.call(this); const a = this.boneMatrices; if (this.boneTexture && a.length >= (bones.length + 1) * 16) a.set(this.grime, a.length - 16); };
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
      return { cur: 0, levels: [L0, E.lods.lod1.map(e => skinMesh(e, 1)), E.lods.lod2.map(e => skinMesh(e, 2))], caster, skeleton };
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
      const si = new Uint16Array(nv * 4), sw = new Float32Array(nv * 4), idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni), wearA = new Float32Array(nv);
      let ov = 0, oi = 0;
      const parts = [];
      for (const m of B.list) {
        const g = m.geometry, P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv, C = g.attributes.color, n = P.count;
        const M4 = rel(m), bi = boneIdx.get(m.parent) || 0, c0 = m.material.color, BL = g.userData.blend;
        const bl = BL ? BL.bones.map(b => boneIdx.get(b) || 0) : null;
        nm.getNormalMatrix(M4);
        if (m.userData.wear) wearA.fill(m.userData.wear, ov, ov + n);
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
          if (bl) { const o4 = (ov + i) * 4; si[o4] = bl[BL.a[i]]; si[o4 + 1] = bl[BL.b[i]]; sw[o4] = 1 - BL.w[i]; sw[o4 + 1] = BL.w[i]; if (BL.c) { const cw = BL.cw[i]; si[o4 + 2] = bl[BL.cb ? BL.cb[i] : BL.c]; sw[o4] *= 1 - cw; sw[o4 + 1] *= 1 - cw; sw[o4 + 2] = cw; } if (BL.dw) { const dw = BL.dw[i]; if (dw > 0) { si[o4 + 3] = bl[BL.db ? BL.db[i] : BL.d]; for (let q = 0; q < 3; q++) sw[o4 + q] *= 1 - dw; sw[o4 + 3] = dw; } } }
          else { si[(ov + i) * 4] = bi; sw[(ov + i) * 4] = 1; }
        }
        const flip = M4.determinant() < 0, cnt = g.index ? g.index.count : n;
        for (let i = 0; i < cnt; i += 3) {
          const a = g.index ? g.index.getX(i) : i, b = g.index ? g.index.getX(i + 1) : i + 1, c = g.index ? g.index.getX(i + 2) : i + 2;
          idx[oi + i] = ov + a; idx[oi + i + 1] = ov + (flip ? c : b); idx[oi + i + 2] = ov + (flip ? b : c);
        }
        parts.push(partStats(pos, idx, { ov, n, oi, cnt, lod0: !!m.userData.lod0Only, keep: !!m.userData.lodKeep, noFar: !!m.userData.lodNoFar }));
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
      geo.setAttribute('wear', new THREE.BufferAttribute(wearA, 1));
      geo.setIndex(new THREE.BufferAttribute(idx, 1));
      geo.computeBoundingSphere();
      geo.boundingSphere.radius += 4;            // tay / chân vung ra khỏi tư thế gốc: nới hình cầu cắt khung nhìn
      const mat = solid ? skinBucketMat(k, [...B.mats]) : k;
      mat.skinning = true;   // three r128: vật liệu phải bật cờ skinning (bộ vật liệu bộ binh tách khỏi kíp lái nên không ảnh hưởng xe)
      geo.userData.shared = true;
      fresh.push({ geo, parts, mat, renderOrder: B.list[0].renderOrder, userData: Object.assign({}, B.list[0].userData, { merged: B.list.length }) });
    }
    const lods0 = buildLods(fresh);
    for (const e of fresh) { const g2 = clusterGeo(e.geo, LOD_CELL[0], true); lodBounds(g2); e.geo = g2; }
    const E = { list: fresh, lods: lods0, bones: bones.length };
    if (F.cacheKey) BAKE_CACHE.set(F.cacheKey, E);
    return finish(E);
  }

  // ---------- BỘ NGỤY TRANG CỎ (ghillie) ----------
  // Đúng cấu tạo đồ thật: bộ đồ lưới mắt thoi (ghillieNet), búi cỏ giả buộc vào mắt lưới thành từng đám, giữa các đám lộ lưới + quân
  // phục. Búi có ba lớp theo cự ly: lá mảnh (chỉ bậc gần), lá thô (tới bậc vừa), lá thô thưa (bậc xa + bóng). Màu đi thành mảng lớn
  // (đay khô, ô-liu, đất) như bộ đồ thật buộc theo từng đám, không rắc đều từng sợi.
  const GHILLIE_PAL = {
    TEMPERATE: [0x4c5030, 0x5c5c3a, 0x6e6a46, 0x7e7652, 0x94896a, 0x5a4e36],
    JUNGLE: [0x3a4428, 0x48502e, 0x565a36, 0x68653f, 0x7c7650, 0x4e4630],
    DESERT: [0x84704c, 0x98825a, 0xa48e66, 0xae9a72, 0xbca882, 0x928c62],
    URBAN: [0x3e3e34, 0x4a4b40, 0x56554a, 0x625f50, 0x6e6a58, 0x4c463a]
  };
  // anchors: [{ p, n (pháp tuyến ra ngoài), len, w, out, down }]; grav: hướng trọng lực trong hệ của xương mang dải
  function ghillieGeo(key, team, anchors, grav, seed, layer) {
    const fine = layer === true, mid = layer === 1;
    const ck = 'gh|' + key + (fine ? '|f|' : mid ? '|c|' : '|x|') + BIOME + '|' + team;
    if (GEO[ck]) return GEO[ck];
    let s = seed >>> 0;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const pal = (GHILLIE_PAL[BIOME] || GHILLIE_PAL.TEMPERATE).map(h => new THREE.Color(tintHex(h, team === 'RED')));
    const pos = [], col = [], nor = [], idx = [], wgt = [], g = grav.clone().normalize();
    const d = V(), base = V(), side = V(), p = V(), tmp = V(), nn = V(), c = new THREE.Color();
    const o1 = rnd() * 9, o2 = rnd() * 9;
    const patch = (q) => 0.5 + 0.5 * Math.sin(q.x * 1.9 + o1 + Math.sin(q.y * 1.3 + o2) * 1.4) * Math.cos(q.z * 1.7 + q.y * 0.9 + o2);
    anchors.forEach((a, ai) => {
      if (!fine && !mid && ai % 2) return;   // bậc xa lấy 1/4 số búi, bậc vừa lấy phần còn lại: hai lớp không chồng nhau
      const pv = Math.max(0, Math.min(0.999, patch(a.p) + (rnd() - 0.5) * 0.4)) * (pal.length - 1), pi = Math.floor(pv);
      // độ dày của bộ đồ: búi đứng cách người theo tầng (lưới buộc chồng nhiều lớp); tầng ngoài sáng, tầng trong tối (khuất nắng)
      const lk = a.lk == null ? 1 : a.lk, lift0 = Math.pow(rnd(), 0.8), lift = lk * lift0 * (fine ? 0.1 : mid ? 0.08 : 0.06), layerK = lk ? 0.72 + 0.5 * lift0 * (fine ? 1 : 0.5) : 1;
      base.copy(a.n).multiplyScalar(fine ? a.out * 1.7 : a.out * 0.9).addScaledVector(g, fine ? a.down * 0.65 : a.down).add(tmp.set(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(0.5)).normalize();
      const threads = fine ? (a.few ? 3 : 4 + Math.floor(rnd() * 3)) : mid ? 3 : 2;
      const blotch = 0.78 + 0.4 * patch(tmp.copy(a.p).multiplyScalar(1.7));   // cả búi đậm nhạt theo đám: bộ đồ thật không sáng đều
      for (let th = 0; th < threads; th++) {
        c.copy(pal[pi]).lerp(pal[pi + 1], pv - pi);
        const bleach = fine && rnd() < 0.18 ? 0.45 : 0, sh = (0.72 + rnd() * 0.45) * blotch;   // vài sợi bạc nắng
        const spread = fine ? 0.85 : mid ? 0.7 : 0.5;
        d.copy(base).add(tmp.set(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(spread)).normalize();
        // mặt sợi quay ra ngoài người (lệch ít): nhìn từ ngoài luôn thấy mặt trước nên không bị lật pháp tuyến (đốm đen), và phủ kín hơn với ít sợi hơn
        side.crossVectors(a.n, d);
        if (side.lengthSq() < 1e-4) side.set(1, 0, 0).cross(d);
        side.normalize().applyAxisAngle(d, (rnd() - 0.5) * 1.3);
        const L = a.len * (fine ? 0.75 + rnd() * rnd() * 1.05 : 1 + rnd() * 0.35);
        const SEG = fine && L > 0.45 ? 3 : 2;
        const W = fine ? 0.05 + rnd() * 0.07 : a.w * (mid ? 0.36 + rnd() * 0.26 : 1 + rnd() * 0.45);
        const bend = fine ? 0.34 + rnd() * 0.42 : 0.45, frizz = fine ? 0.26 : 0.1;
        const i0 = pos.length / 3;
        p.copy(a.p).addScaledVector(a.n, lift);
        nn.copy(a.n).multiplyScalar(0.8).addScaledVector(g, -0.35).add(tmp.set(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(0.3)).normalize();
        for (let k = 0; k <= SEG; k++) {
          const t = k / SEG, hw = W * (1 - t * 0.7) / 2;
          if (k === SEG) pos.push(p.x, p.y, p.z);   // đầu sợi nhọn: 1 đỉnh
          else pos.push(p.x + side.x * hw, p.y + side.y * hw, p.z + side.z * hw, p.x - side.x * hw, p.y - side.y * hw, p.z - side.z * hw);
          // gốc búi khuất trong lớp sợi nên tối; lớp lót tối hơn lớp ngoài. Pháp tuyến theo khối người, không theo mặt sợi: cả đám sáng tối mềm như sợi tơi
          const f = sh * layerK * (fine ? 0.42 + 0.62 * t : 0.55 + 0.25 * t);
          const r = c.r + (pal[4].r - c.r) * bleach * t, gg = c.g + (pal[4].g - c.g) * bleach * t, bl = c.b + (pal[4].b - c.b) * bleach * t;
          const w = fine ? t : t * 0.7;
          for (let q = 0; q < (k === SEG ? 1 : 2); q++) { col.push(r * f, gg * f, bl * f); nor.push(nn.x, nn.y, nn.z); wgt.push(w); }
          d.addScaledVector(g, bend).add(tmp.set(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(frizz)).normalize();
          p.addScaledVector(d, L / SEG);
        }
        for (let k = 0; k < SEG; k++) { const i = i0 + k * 2; idx.push(i, i + 1, i + 2); if (k < SEG - 1) idx.push(i + 1, i + 3, i + 2); }
      }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
    geo.setIndex(idx);
    geo.userData.shared = true;
    geo.userData.swayW = new Float32Array(wgt);
    return (GEO[ck] = geo);
  }
  // Ngụy trang súng: búi đay buộc rải theo mặt thân súng (lấy mẫu trên lưới thật nên hợp mọi loại súng). Chỉ gắn vào phần đứng yên so
  // với nhóm mang nó (thân súng, cụm nòng); chừa đầu nòng, đuôi báng, mặt trên chỗ kính ngắm để vẫn ngắm + bắn được
  function ghilliePoints(meshes, team, count, zMin, zMax, topY, seed, free) {
    let s = seed >>> 0;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const tris = [], a = V(), b = V(), c = V(), e1 = V(), e2 = V(), n = V();
    let area = 0;
    for (const m of meshes) {
      const P = m.geometry.attributes.position, I = m.geometry.index;
      m.updateMatrix();
      const cnt = I ? I.count : P.count;
      for (let i = 0; i + 2 < cnt; i += 3) {
        const ia = I ? I.getX(i) : i, ib = I ? I.getX(i + 1) : i + 1, ic = I ? I.getX(i + 2) : i + 2;
        a.fromBufferAttribute(P, ia).applyMatrix4(m.matrix); b.fromBufferAttribute(P, ib).applyMatrix4(m.matrix); c.fromBufferAttribute(P, ic).applyMatrix4(m.matrix);
        n.crossVectors(e1.subVectors(b, a), e2.subVectors(c, a));
        const ar = n.length() / 2;
        if (ar < 1e-5) continue;
        area += ar; tris.push({ ar: area, a: a.clone(), b: b.clone(), c: c.clone(), n: n.clone().normalize() });
      }
    }
    const A = [];
    if (!tris.length) return A;
    for (let i = 0, guard = 0; i < count && guard < count * 60; guard++) {
      const q = rnd() * area; let lo = 0, hi = tris.length - 1;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (tris[mid].ar < q) lo = mid + 1; else hi = mid; }
      const T = tris[lo]; let u = rnd(), v = rnd();
      if (u + v > 1) { u = 1 - u; v = 1 - v; }
      const p = T.a.clone().addScaledVector(e1.subVectors(T.b, T.a), u).addScaledVector(e2.subVectors(T.c, T.a), v);
      if (!free) {
        if (p.z < zMin || p.z > zMax || p.y > topY || Math.abs(T.n.z) > 0.7) continue;
        if (Math.floor((p.z - zMin) / (zMax - zMin) * 10) !== i % 10) continue;   // chia đều 10 đoạn dọc súng: khối to không hút hết búi
      }
      A.push({ p, n: T.n, len: 0.24 + rnd() * 0.24, w: 0.1, out: 1, down: 0.3, lk: 0, few: true });
      i++;
    }
    return A;
  }
  // Lưới đan giữa các điểm buộc trên vật không có dạng ống (súng, tấm đeo): mỗi điểm nối 2 điểm gần nhất nên dây bám theo hình thật của vật
  function ghillieLinks(key, team, A) {
    const ck = 'ghl|' + key + '|' + BIOME + '|' + team;
    if (GEO[ck]) return GEO[ck];
    const pal = (GHILLIE_PAL[BIOME] || GHILLIE_PAL.TEMPERATE).map(h => new THREE.Color(tintHex(h, team === 'RED')));
    const pos = [], col = [], nor = [], idx = [], d = V(), side = V(), a0 = V(), b0 = V(), seen = new Set();
    A.forEach((a, i) => {
      const near = [];
      A.forEach((b, j) => { if (j !== i) { const q = a.p.distanceToSquared(b.p); if (q < 0.36) near.push([q, j]); } });
      near.sort((x, y) => x[0] - y[0]);
      for (const [, j] of near.slice(0, 2)) {
        const k = Math.min(i, j) * 100000 + Math.max(i, j);
        if (seen.has(k)) continue;
        seen.add(k);
        const b = A[j];
        a0.copy(a.p).addScaledVector(a.n, 0.02); b0.copy(b.p).addScaledVector(b.n, 0.02);
        d.subVectors(b0, a0); side.crossVectors(a.n, d).normalize().multiplyScalar(0.012);
        if (!Number.isFinite(side.x)) continue;
        const i0 = pos.length / 3, f = 0.4;
        pos.push(a0.x + side.x, a0.y + side.y, a0.z + side.z, a0.x - side.x, a0.y - side.y, a0.z - side.z, b0.x + side.x, b0.y + side.y, b0.z + side.z, b0.x - side.x, b0.y - side.y, b0.z - side.z);
        for (let q = 0; q < 4; q++) { col.push(pal[0].r * f, pal[0].g * f, pal[0].b * f); nor.push(a.n.x, a.n.y, a.n.z); }
        idx.push(i0, i0 + 1, i0 + 2, i0 + 1, i0 + 3, i0 + 2);
      }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
    geo.setIndex(idx);
    geo.userData.shared = true;
    return (GEO[ck] = geo);
  }
  // Gắn búi + lưới đan lên một nhóm lưới của vật (đã lấy mẫu A; A rỗng nghĩa là đã có sẵn trong bộ nhớ đệm)
  function ghillieDress(P, key, team, A, seed, M, add) {
    // trọng lực theo tư thế lúc dựng, trong hệ của vật: ống UAV đeo dựng đứng có trục "xuống" là +z, lấy -y cứng thì sợi chĩa ngang / dựng ngược
    P.updateWorldMatrix(true, false);
    const G = V(0, -1, 0).applyQuaternion(P.getWorldQuaternion(new THREE.Quaternion()).invert());
    const n = add(P, ghillieLinks(key, team, A), M.ghillie, 0, 0, 0); n.userData.wear = 0.3; n.userData.lod0Only = true;
    ghillieAdd(P, ghillieGeo(key, team, A, G, seed, true), ghillieGeo(key, team, A, G, seed + 1, 1), ghillieGeo(key, team, A, G, seed + 2, 2), M, add);
  }
  // Tấm đeo to của bộ đồ vũ khí (tấm lưng mang ống UAV...): không có lưới áo trùm được thì buộc thẳng lên tấm
  function ghillieKit(team, weapon, chest, kitMeshes, M, add) {
    const L = kitMeshes.filter(m => m.parent === chest && m.isMesh && !m.material.transparent && !m.userData.lod0Only && (() => {
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      const q = m.geometry.boundingBox.getSize(V()); return [q.x, q.y, q.z].sort((a, b) => b - a)[1] > 1.2;
    })());
    const key = 'kit|' + weapon, seed = 777;
    if (L.length) ghillieDress(chest, key, team, GEO['gh|' + key + '|f|' + BIOME + '|' + team] ? [] : ghilliePoints(L, team, 90, 0, 0, 0, seed, true), seed, M, add);
    // ống UAV sau lưng: mỗi ống buộc lưới + búi riêng nên rút ống nào thì đồ ngụy trang đi theo ống đó; chừa hai đầu ống
    if (weapon !== 'kami') return;
    // chỉ các ống: máy điều khiển, ngàm kẹp cũng là nhóm con của ngực, mà mọi ống dùng chung 1 hình cỏ 'kitTube' -> búi dài theo ống chĩa ra trước ngực
    for (const t of chest.userData.kamiTubes || []) {
      const T = t.children.filter(o => o.isMesh && !o.material.transparent && !o.userData.lod0Only);
      if (!T.length) continue;
      const box = new THREE.Box3(), q = new THREE.Box3();
      for (const m of T) { if (!m.geometry.boundingBox) m.geometry.computeBoundingBox(); m.updateMatrix(); q.copy(m.geometry.boundingBox).applyMatrix4(m.matrix); box.union(q); }
      const len = box.max.z - box.min.z, k = 'kitTube', sd = 781, have = GEO['gh|' + k + '|f|' + BIOME + '|' + team];
      // búi dài, đủ sợi như trên áo (búi ngắn 3 sợi kiểu súng thì ống trơ trọi, đứng xa như không có cỏ)
      const A = have ? [] : ghilliePoints(T, team, 240,box.min.z + len * 0.1, box.max.z - len * 0.1, 99, sd).map(a => Object.assign(a, { len: a.len * 1.5, few: false, out: 0.7, down: 0.6 }));
      ghillieDress(t, k, team, A, sd, M, add);
    }
  }
  function ghillieGun(team, weapon, gun, M, add, sign) {
    const parts = new Map(), box = new THREE.Box3(), gl = gun.userData.gl;
    for (const P of gl ? [gun, gl.fr, gl.drum] : [gun]) {
      const L = P.children.filter(o => o.isMesh && !o.material.transparent && !o.userData.lod0Only);
      if (L.length) parts.set(P, L);
    }
    box.makeEmpty();
    gun.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(gun.matrixWorld).invert(), tmp = new THREE.Box3();
    for (const L of parts.values()) for (const m of L) { if (!m.geometry.boundingBox) m.geometry.computeBoundingBox(); tmp.copy(m.geometry.boundingBox).applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld)); box.union(tmp); }
    const len = box.max.z - box.min.z, zMin = box.min.z + len * 0.07, zMax = box.max.z - len * 0.04, topY = box.min.y + (box.max.y - box.min.y) * 0.72;
    let i = 0;
    for (const [P, L] of parts) {
      i++;
      const shift = P === gun ? null : new THREE.Matrix4().multiplyMatrices(inv, P.matrixWorld);
      const sh = shift ? shift.elements : null;
      const dz = sh ? sh[14] : 0, dy = sh ? sh[13] : 0;   // cụm con chỉ dời (không xoay lúc dựng): đổi ngưỡng sang hệ của nó
      const key = 'gun|' + weapon + '|' + i, seed = 909 + i * 7;
      const A = GEO['gh|' + key + '|f|' + BIOME + '|' + team] ? [] : ghilliePoints(L, team, !gl ? 200 : P === gl.drum ? 30 : 110, zMin - dz, zMax - dz, topY - dy, seed);
      ghillieDress(P, key, team, A, seed, M, add);
    }
  }
  // sợi mảnh: chỉ bậc gần; sợi thô: bậc vừa (giảm lưới làm sợi vỡ thành mảnh vụn nên giữ nguyên); sợi thưa: tới bậc xa + bóng đổ
  function ghillieAdd(parent, fine, under, far, M, add) {
    const f = add(parent, fine, M.ghillie, 0, 0, 0); f.userData.wear = 0.3; f.userData.lod0Only = true;
    const u = add(parent, under, M.ghillie, 0, 0, 0); u.userData.wear = 0.3; u.userData.lodKeep = true; u.userData.lodNoFar = true;
    const x = add(parent, far, M.ghillie, 0, 0, 0); x.userData.wear = 0.3; x.userData.lodKeep = true;
  }
  // Lưới mang búi đung đưa: gốc sợi bám xương thân, ngọn bám xương treo (ghillieSim). Lưới dùng chung nên gán lại xương mỗi lính
  function ghillieSway(geo, body, swing) {
    const c = new THREE.BufferGeometry(), w = geo.userData.swayW, n = w.length;
    c.attributes = geo.attributes; c.index = geo.index;   // dùng chung dữ liệu đỉnh: 1 lưới gắn 2 tay / 2 chân, xương treo mỗi bên một khác
    c.userData.shared = true;
    c.userData.blend = { bones: [body, swing], a: new Uint8Array(n), b: new Uint8Array(n).fill(1), w };
    return c;
  }
  // Áo choàng, váy, búi ở tay + chân treo trên xương riêng: lắc theo đà người + gió nhẹ, tay chân nâng lên hay người nghiêng thì
  // ngọn sợi vẫn ngả về phía trọng lực. Mỗi cụm 1 lò xo góc, chỉ chạy ở bậc gần. s = 1 sợi treo về phía -y của xương, -1 về +y (cánh tay)
  const _gW = V(0, 0, 0);
  function ghillieSim(F, C) {
    const dt = F._dtA || 0;
    if (F.lod && F.lod.cur !== 0) {
      if (!C.rest) { C.rest = true; C.p = null; for (const q of C.list) { q.x = q.z = q.vx = q.vz = 0; q.bone.rotation.set(0, 0, 0); } }
      return;
    }
    if (dt <= 0) return;
    C.rest = false; C.t += dt;
    F.chest.getWorldPosition(_sP);
    if (C.p) { _sV.copy(_sP).sub(C.p).divideScalar(dt); _gW.copy(_sV).sub(C.pv).divideScalar(dt).clampLength(0, 140); C.pv.copy(_sV); C.p.copy(_sP); }
    else { C.p = _sP.clone(); C.pv = V(0, 0, 0); _gW.set(0, 0, 0); }
    const wx = Math.sin(C.t * 0.83 + C.seed) * 0.014 + Math.sin(C.t * 2.3 + C.seed * 2) * 0.006, wz = Math.sin(C.t * 0.61 + C.seed * 3) * 0.012;
    const n = Math.max(1, Math.ceil(dt / 0.012)), h = dt / n;
    for (const q of C.list) {
      q.body.getWorldQuaternion(_bQ).invert();
      _sA.copy(_gW).applyQuaternion(_bQ);
      _sG.set(0, -1, 0).applyQuaternion(_bQ);
      const L = q.lim, tx = q.s * Math.max(-L, Math.min(L, 0.0009 * _sA.z - _sG.z * q.tilt)) + wx * q.wind, tz = q.s * Math.max(-L, Math.min(L, -0.0009 * _sA.x + _sG.x * q.tilt)) + wz * q.wind;
      const k = q.wn * q.wn, c = 2 * q.zeta * q.wn;
      for (let i = 0; i < n; i++) {
        q.vx += (k * (tx - q.x) - c * q.vx) * h; q.x += q.vx * h;
        q.vz += (k * (tz - q.z) - c * q.vz) * h; q.z += q.vz * h;
      }
      q.bone.rotation.set(q.x, 0, q.z);
    }
  }
  // Lưới nền của bộ đồ: sợi dây đan mắt thoi ôm theo mặt S(u, v) -> { p, n } (null = chừa, vd. vùng mặt). u vòng quanh, v dọc bộ phận.
  // Trả về lưới dây + các mắt lưới: búi cỏ chỉ được buộc vào mắt lưới
  function ghillieNet(key, team, S, nu, nv, seed) {
    const ck = 'ghn|' + key + '|' + BIOME + '|' + team;
    if (GEO[ck]) return GEO[ck];
    let s = seed >>> 0;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const pal = (GHILLIE_PAL[BIOME] || GHILLIE_PAL.TEMPERATE).map(h => new THREE.Color(tintHex(h, team === 'RED')));
    const pos = [], col = [], nor = [], idx = [], knots = [], side = V(), d = V(), W = 0.03;
    const uOf = (r, c) => (c + (r % 2) * 0.5) / nu;
    const jit = (r, c, o) => { const h = Math.sin(r * 12.9898 + ((c % nu) + nu) % nu * 78.233 + o + seed) * 43758.5453; return h - Math.floor(h) - 0.5; };
    const at = (r, c) => { const P = S(((uOf(r, c) + jit(r, c, 1) * 0.3 / nu) % 1 + 1) % 1, Math.max(0, Math.min(1, r / (nv - 1) + jit(r, c, 2) * 0.3 / (nv - 1)))); return P; };
    const lift = (P, o) => P.p.clone().addScaledVector(P.n, o);
    const link = (A, B, ua, ub) => {
      const um = (ua + ub) / 2, vm = (A.v + B.v) / 2, Pm = S(((um % 1) + 1) % 1, vm);
      if (!Pm) return;
      const P = [lift(A, 0.03), lift(Pm, 0.012), lift(B, 0.03)], N = [A.n, Pm.n, B.n], f = 0.4 + rnd() * 0.18, i0 = pos.length / 3;
      for (let k = 0; k < 3; k++) {
        d.subVectors(P[Math.min(2, k + 1)], P[Math.max(0, k - 1)]);
        side.crossVectors(N[k], d).normalize().multiplyScalar(W / 2);
        pos.push(P[k].x + side.x, P[k].y + side.y, P[k].z + side.z, P[k].x - side.x, P[k].y - side.y, P[k].z - side.z);
        for (let q = 0; q < 2; q++) { col.push(pal[0].r * f, pal[0].g * f, pal[0].b * f); nor.push(N[k].x, N[k].y, N[k].z); }
      }
      for (let k = 0; k < 2; k++) { const i = i0 + k * 2; idx.push(i, i + 1, i + 2, i + 1, i + 3, i + 2); }
    };
    for (let r = 0; r < nv; r++) for (let c = 0; c < nu; c++) {
      const A = at(r, c);
      if (!A) continue;
      A.v = r / (nv - 1);
      knots.push(A);
      if (r === nv - 1) continue;
      for (const dc of r % 2 ? [0, 1] : [-1, 0]) {   // mắt thoi: mỗi mắt nối 2 mắt hàng dưới
        const B = at(r + 1, c + dc);
        if (!B) continue;
        B.v = (r + 1) / (nv - 1);
        link(A, B, uOf(r, c), uOf(r + 1, c + dc));
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
    geo.setIndex(idx);
    geo.userData.shared = true;
    return (GEO[ck] = { geo, knots });
  }
  // Các bộ phận (toạ độ theo hệ xương mang cụm; mặt trước người là -z). Mỗi bộ phận: [cỏ mảnh, cỏ thô, cỏ thưa] + .net lưới nền
  function ghillieParts(team, kitKey, backOut, frontKit, hull) {
    const R = (seed) => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
    const parts = {}, TAU = Math.PI * 2;
    // buộc búi vào mắt lưới theo từng đám: chỗ dày chỗ thưa, giữa các đám lộ lưới + quân phục như bộ đồ buộc tay
    const part = (name, key, S, nu, nv, grav, seed, spec) => {
      const N = ghillieNet(key, team, S, nu, nv, seed + 9), r = R(seed), o1 = r() * 9, o2 = r() * 9, A = [];
      for (const k of N.knots) {
        const q = 0.5 + 0.5 * Math.sin(k.p.x * 2.3 + o1) * Math.cos(k.p.y * 1.9 + k.p.z * 1.7 + o2);
        const a = spec(k, r);
        if (r() > (a && a.dens != null ? a.dens : 0.62 + q * q * 0.6)) continue;   // vẫn dày mỏng theo đám nhưng chỗ thưa nhất cũng còn ~2/3 mắt lưới có búi
        if (a) A.push(Object.assign({ p: k.p, n: k.n, w: 0.22 }, a));
      }
      const G = [ghillieGeo(key, team, A, grav, seed, true), ghillieGeo(key, team, A, grav, seed + 1, 1), ghillieGeo(key, team, A, grav, seed + 2, 2)];
      G.net = N.geo;
      parts[name] = G;
    };
    const down = V(0, -1, 0), up = V(0, 1, 0);
    // mũ: lưới trùm vỏ mũ, búi ngắn; gáy rủ vừa qua cổ; chừa vùng kính + mặt
    part('head', 'head', (u, v) => {
      const phi = (u - 0.5) * TAU, y = 0.3 + v * 0.85;
      if (Math.cos(phi) > 0.55 && y < 0.82) return null;
      return helPt(phi, y, 0.03);
    }, 18, 7, down, 101, (k, r) => {
      const fr = -k.n.z, low = k.v < 0.45;
      return { len: fr > 0.4 ? 0.24 : 0.32 + (fr < -0.3 && low ? 0.42 : 0) + r() * 0.12, out: low ? 0.55 : 0.8, down: low ? 0.95 : 0.65, lk: 0.3, dens: fr < -0.3 && low ? 1 : 0.6 };
    });
    // tấm che gáy buộc dưới vành mũ: rủ quanh gáy + hai bên cổ xuống tới vai (theo đầu khi ngoảnh), phía trước chừa hàm + mặt
    part('hood', 'hood', (u, v) => {
      const a = u * TAU, fr = Math.cos(a);
      if (fr > 0.2) return null;
      const y = 0.22 - v * 0.8, rx = 0.84 + v * 0.06, rz = 0.86 + v * 0.06;
      return { p: V(Math.sin(a) * rx, y, -0.05 - fr * rz), n: V(Math.sin(a) / rx, 0.15, -fr / rz).normalize() };
    }, 16, 5, down, 111, (k, r) => ({ len: 0.55 + r() * 0.3, out: 0.2, down: 1.3, lk: 0.2, dens: 1 }));
    // áo: lưới liền từ thắt lưng lên vai tới cổ, phía lưng trùm ra ngoài đồ đeo theo vũ khí (ba lô đạn RPG, hộp đạn...); trước ngực chừa băng đạn
    part('chest', 'chest|' + kitKey, (u, v) => {
      const a = u * TAU, y = 0.1 + v * 3.7, k = Math.max(0, (y - 2.5) / 1.3), rx = 1.66 - 0.85 * k * k, rz = (1.64 + 0.14 * Math.cos(a)) * (1 - 0.48 * k * k);
      let x = Math.sin(a) * rx, z0 = -Math.cos(a) * rz;
      if (hull && hull.chest) { const h = hull.chest(x, y, z0); x *= h; z0 *= h; }   // trùm ra ngoài túi đạn, bộ đàm, giá máy: đồ đeo nằm dưới lưới
      const zb = z0 > 0 && backOut ? backOut(x, y) + 0.06 : -9;
      if (Math.abs(x) > 1.5 && y > 2.5) return null;   // khớp vai: để lưới tay lo, tay đưa ra trước thì lưới áo không còn gì để ôm
      // lưới trùm ra ngoài đồ đeo sát lưng; vật nhô quá xa (dây đạn vắt qua vai...) thì lưới đi dưới, kẻo mắt lưới văng khỏi người
      return { p: V(x, y, zb > z0 && zb - z0 < 0.8 ? zb : z0), n: V(Math.sin(a) / rx, k * 0.9, -Math.cos(a) / rz).normalize() };
    }, 32, 12, down, 202, (k, r) => {
      const front = k.p.z < -0.3 && k.p.y < 3.1;
      if (front && frontKit && frontKit(k.p.x, k.p.y)) return null;
      // vai + gáy: sợi nằm rủ theo vai xuống lưng / ngực như tấm choàng, không dựng ngược lên thành bờm
      if (k.p.y > 2.9) return k.p.z < -0.3 ? { len: 0.38 + r() * 0.2, out: 0.3, down: 1.3, lk: 0.2, dens: 0.7 } : { len: 0.65 + r() * 0.35, out: 0.3, down: 1.2, lk: 0.4 };
      return front ? { len: 0.45 + r() * 0.3, out: 0.8, down: 0.8, lk: 0.55 } : { len: 0.6 + r() * 0.4, out: 0.8, down: 0.8 };
    });
    // khăn trùm cổ: lưới ôm sát khăn quàng từ đỉnh vai lên dưới vành mũ, kín gáy + hai bên, phía trước chỉ chừa cằm + mặt; sợi rủ dọc
    // theo cổ xuống vai (xoè ngang ra thì thành vòng bờm quanh cổ, giữa vòng với mũ lộ khăn trơn)
    part('cowl', 'cowl', (u, v) => {
      const a = u * TAU, y = 3.35 + v * 0.9, fr = Math.cos(a);
      if (fr > 0.3) return null;   // trước cổ chỉ có mép áo: chồng thêm lớp trùm thì dưới cằm thành bộ râu dày
      const rx = 0.84 - v * 0.08, rz = (fr > 0 ? 0.62 : 0.86) - v * 0.06;
      return { p: V(Math.sin(a) * rx, y, -fr * rz), n: V(Math.sin(a) / rx, 0.25, -fr / rz).normalize() };
    }, 20, 6, down, 212, (k, r) => ({ len: 0.5 + r() * 0.3, out: 0.22, down: 1.3, lk: 0.25, dens: 0.95 }));
    part('hips', 'hips|' + (hull ? hull.key : '-'), (u, v) => {
      const a = u * TAU;
      let x = Math.sin(a) * 1.54, y = -0.1 - v * 1.15, z = -Math.cos(a) * 1.3;
      if (hull && hull.hips) { const h = hull.hips(x, y, z); x *= h; z *= h; }   // túi thắt lưng, túi y tế nằm dưới lưới
      return { p: V(x, y, z), n: V(Math.sin(a), 0, -Math.cos(a)) };
    }, 28, 5, down, 303, (k, r) => ({ len: 0.6 + r() * 0.35, out: 0.8, down: 0.85 }));
    // tay (hệ xương: +y dọc tay từ vai xuống): tới gần cổ tay, chừa bàn tay cầm súng
    const limb = (rx0, rx1, rz0, rz1, y0, y1) => (u, v) => {
      const t = u * TAU, n = V(Math.cos(t), 0, Math.sin(t));
      return { p: V(n.x * (rx0 + (rx1 - rx0) * v), y0 + (y1 - y0) * v, n.z * (rz0 + (rz1 - rz0) * v)), n };
    };
    part('arm', 'arm', limb(0.72, 0.46, 0.7, 0.44, -0.32, 2), 11, 8, up, 404, (k, r) => ({ len: 0.42 + r() * 0.2, out: 0.85, down: 0.65, lk: 0.5 }));
    // chỏm vai: vòm lưới úp lên khớp vai theo xương cánh tay (lưới áo phải chừa vai cho tay cử động, giơ súng thì lộ cả mảng vai trơn)
    part('delt', 'delt', (u, v) => {
      const t = u * TAU, g = 0.45 + v * 1.1, n = V(Math.cos(t) * Math.sin(g), -Math.cos(g), Math.sin(t) * Math.sin(g));
      return { p: V(n.x * 0.8, 0.3 + n.y * 0.78, n.z * 0.78), n };
    }, 12, 5, up, 424, (k, r) => ({ len: 0.5 + r() * 0.25, out: 0.6, down: 0.9, lk: 0.4, dens: 0.9 }));
    part('fore', 'fore', limb(0.42, 0.34, 0.42, 0.34, 0.1, ARM_FORE - 0.35), 9, 6, up, 414, (k, r) => ({ len: 0.32 + r() * 0.12, out: 0.85, down: 0.6, lk: 0.3 }));
    // chân: đùi + bắp chân, thon dần xuống cổ giày
    for (const sx of [-1, 1]) {
      part('leg' + sx, 'leg' + sx, limb(0.86, 0.64, 0.96, 0.7, -0.2, -2.8), 15, 9, down, 505 + sx, (k, r) => ({ len: 0.55 + r() * 0.3, out: 0.8, down: 0.8 }));
      part('shin' + sx, 'shin' + sx, limb(0.62, 0.46, 0.68, 0.5, -0.15, -2.4), 12, 8, down, 515 + sx, (k, r) => ({ len: 0.42 + r() * 0.2, out: 0.8, down: 0.8 }));
    }
    return parts;
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
        // đùi (elip) -> ống chân (tròn + bắp chân) phải trộn dần qua gối: đổi thẳng ở 1 vòng thì sau khoeo thành gờ ngang rõ như xà cạp đeo ngoài, mọi tư thế đều thấy
        const kX = sm((kneeW.y + 0.42 - y) / 0.62);
        const P = kX <= 0 ? section(y, ph) : kX >= 1 ? shinPt(y, ph) : section(y, ph).lerp(shinPt(y, ph), kX);
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
        const mid = sm(ax / 0.6), below = sm((CROTCH_Y - y) / 0.3), wLeg = sm((s0 - y) / (0.45 + 0.4 * back)) * (mid + (1 - mid) * below), hK = 0.31 + 0.2 * sm(c / 0.7), wKnee = sm((kneeW.y + 0.01 + hK - y) / (2 * hK));   // dải trộn sau khoeo rộng hơn trước gối: hẹp thì co gối là mép cắt ngang sắc
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
    GEO['pantsSurf' + sx] = surf;   // beltFit đo mặt quần
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
        const [y, a, lf = lift] = fn(i / N), [y2, a2] = fn(Math.min(1, (i + 0.5) / N)), [y3, a3] = fn(Math.max(0, (i - 0.5) / N));
        const ph = PA(a), P = surf(y, ph), n = nrm(y, ph), side = surf(y2, PA(a2)).sub(surf(y3, PA(a3))).cross(n).normalize();
        vert(T, y, ph, P.clone().addScaledVector(n, lf - 0.012).addScaledVector(side, w / 2), 0);
        vert(T, y, ph, P.clone().addScaledVector(n, lf + 0.006), 0);
        vert(T, y, ph, P.clone().addScaledVector(n, lf - 0.012).addScaledVector(side, -w / 2), 0);
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
    for (const a of [0.42, 1.5, 2.5]) patch(C, a - 0.075, a + 0.075, -0.62, -0.93, 0.03, 0.31, 4, 8);   // đỉa: thắt lưng đè lên, chỉ lộ đáy đỉa dưới mép đai
                        // nẹp khoá quần (một bên, như quần thật)
    pocket(2.5, 3.0, -1.3, -2.1, 0.018, 0.035, 0.25, 0.042, true);                    // túi sau: giữa múi mông (x ~0,35..1; a 2,14..2,84 cũ lệch ra sát hông)
    pocket(0.74, 1.72, -2.86, -3.66, 0.028, 0.1, 0.3, 0.065, true, -0.04, true);       // túi hộp đùi, lệch ra trước, xếp ly; cách giáp gối (đỉnh giáp ~-3,9)
    const kn = kneeW.y;
    pocket(1.02, 1.95, kn - 1.28, kn - 1.95, 0.02, 0.05, 0.2, 0.04, false);            // túi cẳng chân
    kneeArmor(kn);              // giáp gối may liền: lớp vải đúp, đệm luồn bên trong
    for (const dy of [0.16, -0.02]) seam(S, t => [kn + dy, Math.PI - 0.7 + 1.4 * t], 12, 0.02);   // đường chiết sau khoeo
    patch(C, -Math.PI, Math.PI, yBot + 0.24, yBot + 0.03, 0.02, 0.06, 40, 2, true, true);   // cổ chân bó
    patch(S, 1.5, 1.72, yBot + 0.17, yBot + 0.06, 0.04, 0, 4, 2);                      // quai dán cổ chân
    seam(S, t => [WB + (0 - 0) - 0.008, t * Math.PI], 30, 0.02);                      // đường may chân cạp
    // nẹp khoá thật ~3 cm, dài ~16 cm, may một bên: nếp gập nổi ở đường giữa, vải mỏng dần rồi chìm vào mặt quần tại đường chỉ đôi chữ J.
    // Cũ: mép ngoài nổi + đáy cụt nên thành tấm dán như cái túi; bề ngang đo theo x thật vì pe() rất dốc quanh a = 0 (a 0,19 đã rộng ~5,5 cm)
    if (sx > 0) {
      const FLY_T = -0.82, FLY_B = -2.04, FLY_W = 0.24, FLY_H = 0.02, NX = 6, NT = 28;
      const flyAt = t => {   // t 0..1 dọc mép nẹp -> [y, bề ngang, v]; đoạn cuối là cung tròn về đường giữa
        const th = (t - 0.55) / 0.45 * Math.PI / 2, v = t < 0.55 ? t / 0.55 * 0.62 : 0.62 + 0.38 * Math.sin(th);
        return [FLY_T + (FLY_B - FLY_T) * v, t < 0.55 ? FLY_W : FLY_W * Math.cos(th), v];
      };
      const aAt = (x, y) => { let lo = 0, hi = 1.2; for (let i = 0; i < 18; i++) { const m = (lo + hi) / 2; if (Math.abs(surf(y, PA(m)).x) < x) lo = m; else hi = m; } return x > 0 ? hi : 0; };
      const flyLift = (x, e, v) => FLY_H * (1 - 0.9 * (e > 0 ? x / e : 0)) * (1 - sm((v - 0.62) / 0.38));
      const base = C.n;
      for (let j = 0; j <= NT; j++) for (let i = -1; i <= NX; i++) {
        const [y, e, v] = flyAt(j / NT), x = e * Math.max(0, i) / NX, ph = PA(aAt(x, y));   // i = -1: vách nếp gập cắm xuống mặt quần ở đường giữa
        const l = i < 0 ? -0.012 : -0.012 + (flyLift(x, e, v) + 0.012) * sm((e - x) / 0.012);
        vert(C, y, ph, surf(y, ph).addScaledVector(nrm(y, ph), l), 0);
      }
      stitch(C, base, NX + 2, NT + 1, nrm(-1.4, PA(0.08)));
      for (const d of [0.03, 0.062]) seam(S, t => { const [y, e, v] = flyAt(t), x = Math.max(0, e - d); return [y, aAt(x, y), flyLift(x, e, v) + 0.002]; }, NT, 0, 0.008);   // chỉ đôi chữ J
      seam(S, t => { const [y, e, v] = flyAt(t); return [y, 0, flyLift(0, e, v) + 0.002]; }, NT, 0, 0.012);   // nếp gập
      seam(S, line(FLY_B, 0, -2.6, 0), 10, 0.008, 0.012);   // đường giữa từ cuối nẹp tới đáy quần (một đường: 2 nửa lệch ±0,004 rad tách thành đường đôi)
    }
                           // chữ Y: mép miếng đáy quần
                            // đường chỉ đôi                      // đường giữa bụng tới đáy quần
    // miệng túi chéo trước: từ chân cạp xuống đường may hông như quần thật (cũ: khoá 3 đường + con trượt treo giữa hông, không dính vào đâu)
    seam(C, line(-0.83, 0.55, -1.72, 1.42), 14, 0.014, 0.07);                           // nẹp miệng túi
    seam(S, line(-0.83, 0.53, -1.7, 1.4), 14, 0.016, 0.012);                            // khe miệng túi
    seam(S, line(-0.85, 0.6, -1.74, 1.46), 14, 0.012, 0.008);                           // chỉ nẹp
    seam(S, line(-0.82, Math.PI / 2, -2.78, Math.PI / 2), 22, 0.018);                 // đường may hông (khuất dưới túi hộp)
    seam(S, line(-3.72, Math.PI / 2, kneeW.y - 1.2, Math.PI / 2), 24, 0.018);
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
  const HAND_UV = 2.2;   // mật độ vân găng chung cho lòng bàn tay + ngón (lệch nhau thì mỗi mảnh như may từ miếng vải khác)
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
  function fingerGeo(key, pts, rw, rt, joints, taper = 0) {   // taper: gốc to hơn bao nhiêu (ngón cái liền vào mô cái)
    if (GEO[key]) return GEO[key];
    const c = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.32), ROW = 28, SD = 12, pos = [], uv = [], idx = [], cen = [], Z = V(0, 0, 1);
    const cl = c.getLength(), cp = Math.PI * (rw + rt);   // chiều dài / chu vi thật: vân vải cùng mật độ với lòng bàn tay (HAND_UV đv vân / đv)
    for (let i = 0; i <= ROW; i++) {
      const t = i / ROW, C = c.getPoint(t), T = c.getTangent(t), Nn = V().crossVectors(T, Z).normalize(), B = V().crossVectors(Nn, T).normalize();
      const e = t > 0.88 ? Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.88) / 0.12, 2))) : 1;
      // Ngón người thu dần qua từng đốt; khớp chỉ lồi nhẹ rồi lõm ngay sau khớp. Giữ bán kính gần như đều làm ngón giống ống cao su.
      let bulge = 1 - 0.14 * sm((t - 0.08) / 0.82);
      for (const q of joints) bulge += 0.028 * Math.exp(-Math.pow((t - q) / 0.052, 2)) - 0.012 * Math.exp(-Math.pow((t - q - 0.075) / 0.04, 2));
      const tb = 1 + taper * Math.pow(1 - t, 2), w = rw * bulge * e * tb, h = rt * bulge * e * tb;
      for (let j = 0; j <= SD; j++) {
        const a = j / SD * Math.PI * 2, ca = Math.cos(a) * w, sa = Math.sin(a) * h;
        pos.push(C.x + B.x * ca + Nn.x * sa, C.y + B.y * ca + Nn.y * sa, C.z + B.z * ca + Nn.z * sa);
        uv.push(j / SD * cp * HAND_UV, t * cl * HAND_UV); cen.push(C);
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
    const ROW = 22, SD = 24, Y0 = -0.14, Y1 = 0.6, pos = [], uv = [], idx = [], Gs = (v, k) => Math.exp(-(v / k) * (v / k)), pe = 2 / 2.7, PER = 1.4;   // PER: chu vi mặt cắt giữa bàn tay
    for (let i = 0; i <= ROW; i++) {
      const y = Y0 + (Y1 - Y0) * i / ROW, t = c01(y / 0.46), top = y > 0.46 ? Math.sqrt(Math.max(0, 1 - Math.pow((y - 0.46) / (Y1 - 0.46), 2))) : 1;
      const W = (0.19 + 0.12 * sm(t)) * (0.74 + 0.26 * top), Tk = (0.09 + 0.017 * sm(t)) * top;
      for (let j = 0; j <= SD; j++) {
        const a = Math.PI + j / SD * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);   // mép nối lưới nằm trong lòng bàn tay: để ở mu thì thành sọc sáng tối dọc giữa mu
        let x = 0.015 + Tk * Math.sign(ca) * Math.pow(Math.abs(ca), pe), z = W * Math.sign(sa) * Math.pow(Math.abs(sa), pe);
        const zs = z * s, palm = sm(-ca / 0.35);
        z *= zs > 0 ? 1.035 : 0.98;                                      // bờ quay (phía ngón cái) rộng hơn bờ trụ một chút
        x -= 0.12 * palm * Gs(y - 0.13, 0.17) * Gs(zs - 0.16, 0.13);        // mô cái: gò thịt dày dưới gốc ngón cái
        x -= 0.075 * palm * Gs(y - 0.16, 0.2) * Gs(zs + 0.18, 0.11);        // mô út
        x -= 0.035 * palm * Gs(y - 0.43, 0.08) * (1 - Math.min(1, Math.abs(zs) / 0.36));   // đệm thịt dưới gốc bốn ngón
        const zn = zs / 0.33;
        const dorsal = sm(ca / 0.3), kn = Gs(zs - 0.205, 0.045) + Gs(zs - 0.07, 0.042) + Gs(zs + 0.07, 0.042) + Gs(zs + 0.205, 0.04);
        const tendon = Gs(zs - 0.07, 0.03) + Gs(zs + 0.07, 0.03) + 0.65 * Gs(zs + 0.2, 0.028);
        x += dorsal * (0.03 * (1 - zn * zn) + 0.012 * Gs(y - 0.4, 0.14) + 0.018 * Gs(y - 0.485, 0.065) * kn + 0.005 * sm(y / 0.2) * sm((0.5 - y) / 0.15) * tendon);   // vòm mu, bốn khớp bàn-ngón và gân duỗi nông
        x += 0.016 * palm * Gs(y - 0.32, 0.17) * Gs(zs + 0.015, 0.14);     // hõm lòng bàn tay giữa mô cái và mô út
        x -= 0.032 * zn * zn * sm(y / 0.3);                                  // cả bàn tay hơi khum: hai mép cong về phía lòng
        z += s * 0.085 * sm(zs / 0.2) * Gs(y - 0.2, 0.13);                   // hổ khẩu: thịt nối gốc ngón cái sang mép bàn tay
        const yy = y - 0.1 * sm((y - 0.25) / 0.2) * Math.pow((zs + 0.05) / 0.33, 2);   // vòm đốt ngón
        pos.push(x, yy, z); uv.push(j / SD * PER * HAND_UV, y * HAND_UV);
      }
    }
    for (let i = 0; i < ROW; i++) for (let j = 0; j < SD; j++) { const a = i * (SD + 1) + j, b = a + SD + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    return (GEO[key] = handFix(g, k => V(0.02, pos[k * 3 + 1], 0)));
  }
  function buildHand(hand, M, s, add, trigger, thumbBone) {
    add(hand, palmGeo(s), M.glove, 0, 0, 0);
    const GC = HAND_GC;
    let fingP = hand, freeP = null, fx = 0, fy = 0;
    if (thumbBone) { fingP = new THREE.Group(); fx = 0.03; fy = 0.42; fingP.position.set(fx, fy, 0); hand.add(fingP); hand.userData.fingers = fingP; freeP = new THREE.Group(); freeP.position.set(fx, fy, 0); hand.add(freeP); hand.userData.fingersFree = freeP; }
    for (let f = 0; f < 4; f++) {
      const z = s * [0.21, 0.07, -0.07, -0.205][f], k = [0.98, 1.07, 1.0, 0.8][f], rw = [0.068, 0.071, 0.067, 0.056][f], rt = rw * 0.82;
      const th0 = [0.2, 0.27, 0.17, 0.02][f], R = 0.2 + rt + 0.006, L = [0.27 * k, 0.17 * k, 0.13 * k];
      const At = (th, zz) => V(GC[0] + Math.cos(th) * R, GC[1] + Math.sin(th) * R, zz);
      const trig = trigger && f === 0;
      let J;
      if (trig) {
        // ngón trỏ tay phải duỗi dọc thân súng, ngoài vành cò (kỷ luật ngón tay) thay vì nắm cùng ba ngón kia
        J = [V(-0.01, 0.53, z), V(-0.035, 0.8, 0.16), V(-0.055, 0.97, 0.13), V(-0.08, 1.08, 0.11)];   // nằm ngang dọc thân súng, ngay trên vành cò
      } else {
        let th = th0; J = [At(th, z)];
        for (let j = 0; j < 3; j++) { th += 2 * Math.asin(Math.min(0.99, L[j] / (2 * R))); J.push(At(th, z * (1 - 0.05 * (j + 1)))); }
      }
      const mid = (a, b) => a.clone().lerp(b, 0.5);
      const ptsOf = J => [V(0.03, 0.38, z * 0.92), J[0], mid(J[0], J[1]), J[1], mid(J[1], J[2]), J[2], mid(J[2], J[3]), J[3]];
      // găng liền một lớp vải: không dán đệm cầu rời (khác màu/độ bóng làm tay trông chắp vá)
      if (trig) {
        // ngón trỏ cò có thêm bản co nắm như ba ngón kia (nắm núm khoá, tay cầm...): hai bản là hai xương, đổi nhau bằng tỉ lệ (setTrigCurl)
        const gT = new THREE.Group(), gC = new THREE.Group(); fingP.add(gT); fingP.add(gC);   // cả hai tỉ lệ 1 lúc dựng / bake (bake lúc 0,001 thì ma trận gắn xương suy biến); buildFigure ẩn bản co sau bake
        let th = th0; const Jc = [At(th, z)];
        for (let j = 0; j < 3; j++) { th += 2 * Math.asin(Math.min(0.99, L[j] / (2 * R))); Jc.push(At(th, z * (1 - 0.05 * (j + 1)))); }
        add(gT, fingerGeo('fg' + s + f + 't', ptsOf(J), rw, rt, [0.15, 0.44, 0.72]), M.glove, -fx, -fy, 0);
        add(gC, fingerGeo('fg' + s + f, ptsOf(Jc), rw, rt, [0.15, 0.44, 0.72]), M.glove, -fx, -fy, 0);
        hand.userData.trigIdx = [gT, gC];
      } else add(fingP, fingerGeo('fg' + s + f, ptsOf(J), rw, rt, [0.15, 0.44, 0.72]), M.glove, -fx, -fy, 0);
      if (freeP) {
        // bộ ngón thả lỏng: cùng khớp gốc, các đốt cong dần và cong hơn từ ngón trỏ tới ngón út (dáng nắm chỉ mở ra vẫn là cái móc: đốt nào cũng cong như nhau)
        const bend = [[0.3, 0.38, 0.47, 0.56][f], [0.36, 0.46, 0.54, 0.6][f], [0.18, 0.24, 0.28, 0.32][f]];
        let al = 0; const Q = [V(0.058, J[0].y + 0.015, z)];   // gốc ngón ngang mặt mu bàn tay (khớp J[0] của dáng nắm nằm thấp hơn ~1 cm: ngón như mọc từ dưới một cái túi)
        for (let j = 0; j < 3; j++) { al += bend[j]; Q.push(Q[j].clone().add(V(-Math.sin(al) * L[j] * 1.1, Math.cos(al) * L[j] * 1.1, z * 0.012))); }
        add(freeP, fingerGeo('fgF2' + s + f, [V(0.0, 0.3, z * 0.9), Q[0], mid(Q[0], Q[1]), Q[1], mid(Q[1], Q[2]), Q[2], mid(Q[2], Q[3]), Q[3]], rw * 1.04, rt * 1.04, [0.3, 0.55, 0.78]), M.glove, -fx, -fy, 0);
      }
    }
    // ngón cái: gốc chìm trong mô cái, vòng qua phía đối diện cán
    let thumbP = hand, tx = 0, ty = 0, tz = 0;
    if (thumbBone) {
      // ngón cái cử động được: gốc xương ở mô cái (đặt lên cần lái, xem kamiThumb)
      thumbP = new THREE.Group(); thumbP.position.set(0, 0.06, s * 0.17); hand.add(thumbP); hand.userData.thumb = thumbP;
      tx = 0; ty = -0.06; tz = -s * 0.17;
    }
    // tay xoè được (có xương ngón cái): theo giải phẫu: gốc chìm trong mô cái, đốt bàn chìa chếch ra ngoài, đốt 1 thẳng, đốt cuối cong vào lòng bàn tay; đầu ngón tới ngang gốc ngón trỏ
    if (thumbBone) add(thumbP, fingerGeo('fgT3' + s, [V(0.0, 0.1, s * 0.12), V(-0.05, 0.2, s * 0.21), V(-0.1, 0.29, s * 0.29), V(-0.165, 0.38, s * 0.345), V(-0.225, 0.45, s * 0.35), V(-0.3, 0.52, s * 0.3)], 0.066, 0.056, [0.62, 0.8], 0.3), M.glove, tx, ty, tz);
    else add(thumbP, fingerGeo('fgT2' + s, [V(0.03, -0.02, s * 0.115), V(-0.045, 0.15, s * 0.24), V(-0.15, 0.31, s * 0.315), V(-0.255, 0.405, s * 0.32), V(-0.36, 0.455, s * 0.285)], 0.074, 0.06, [0.44, 0.74], 0.55), M.glove, tx, ty, tz);   // ngón cái đối diện lòng bàn tay, gốc chìm trong mô cái rồi thu rõ qua khớp liên đốt
  }

  // ---------- TẠO HÌNH NHÂN VẬT BINH SĨ ĐẦY ĐỦ ----------
  function buildFigure(team, options = {}) {
    // options.skin: kíp xe dựng đúng như bộ binh (vải liền, lưới skinned, LOD), chỉ khác vật liệu vẽ lượt trong suốt (crewSkinMats) và không cầm súng
    const crew = (options.role || 'infantry') !== 'infantry' && !options.skin;
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
    const gear = options.gear || {}, gearRanges = [];
    const gearStart = (key) => { if (gear[key] === false) gearRanges.push([meshes.length, -1]); };
    const gearEnd = (key) => { if (gear[key] === false) gearRanges[gearRanges.length - 1][1] = meshes.length; };

    const add = (parent, geo, mat, x, y, z, rx, ry, rz) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      if (rx || ry || rz) m.rotation.set(rx || 0, ry || 0, rz || 0);
      m.castShadow = true; m.receiveShadow = true;
      parent.add(m); meshes.push(m);
      return m;
    };

    const beltPouch = (a, y, w, h, d, mat = M.pouch) => {
      if (oneCloth) {   // bám đường viền đai thật, quay theo pháp tuyến đai
        const b = beltAt(a), ry = Math.atan2(b.nx, b.nz), o = 0.085 + d * 0.5;
        const m = add(hips, rbox(w, h, d), mat, b.x + b.nx * o, y, b.z + b.nz * o, 0, ry, 0);
        add(hips, rbox(w * 0.88, h * 0.72, 0.03), M.web2, b.x + b.nx * 0.09, y, b.z + b.nz * 0.09, 0, ry, 0);
        return m;
      }
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
          onFoot(bootPanel('bMud' + sd, (u, v) => { const z = zOf(u); return footPt(z, tOf(lerp1(-0.5, 0.08 + 0.5 * sm(1 - u * 1.6), v)), 'upper'); }, footRef, 0.016, 20, 4), toeMat);
          // nẹp xỏ dây trên mu
          onFoot(bootPanel('bEyeF' + sd, (u, v) => footPt(lerp1(-0.14, -0.72, u), Math.PI / 2 - sd * lerp1(0.28, 0.56, v), 'upper'), footRef, 0.018, 8, 3), toeMat);
          // nẹp xỏ dây trên cổ
          onShaft(bootPanel('bEyeS' + sd, (u, v) => shaftPt(lerp1(-0.08, 0.98, u), sd * lerp1(0.26, 0.56, v)), shaftRef, 0.02, 12, 3), toeMat);
          // mảng vải bên cổ giày + chỉ may
          onShaft(bootPanel('bNyl' + sd, (u, v) => shaftPt(lerp1(0.36, 1.04, u), sd * lerp1(0.62, Math.PI - 0.28, v)), shaftRef, 0.014, 8, 12), nylon);
          onShaft(bootTube('bStS' + sd, [0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => { const a = sd * lerp1(0.62, Math.PI - 0.28, i / 8), Q = shaftPt(0.385, a); return Q.addScaledVector(V(Q.x, 0, Q.z).normalize(), 0.011); }), 0.007), M.strap);
          // khoen dây
          for (let k = 0; k < 5; k++) {
            const y = 0.04 + k * 0.2, a = sd * 0.42, Q = shaftPt(y, a), out = V(Q.x, 0, Q.z).normalize();
            const m = add(knee, new THREE.CylinderGeometry(0.03, 0.03, 0.02, 6), M.knuck, Q.x + out.x * 0.024, Q.y - SHIN_L, Q.z + out.z * 0.024 + 0.03);
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
        onShaft(bootPanel('bHeel', (u, v) => shaftPt(lerp1(-0.5, 0.36 - 0.14 * Math.pow(Math.abs(v * 2 - 1), 2), u), Math.PI + lerp1(-0.95, 0.95, v)), shaftRef, 0.018, 8, 12), toeMat);
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
    const beltBone = oneCloth ? hips : torso;
    if (oneCloth) {
      // đeo đè lên cạp quần, gắn khung chậu (cũ: cao hơn cạp, gắn thân, đỉa quần thò trơ bên dưới). Mép trên gập vào áo để không hở lòng đai
      add(hips, beltSkin('edge', [[-0.235, 0.035], [-0.235, 0.07], [0.235, 0.07], [0.235, 0.035], [0.235, -0.1]]), lowerStrap, 0, BELT_Y, 0);
      add(hips, beltSkin('band', [[-0.21, 0.05], [-0.21, 0.07], [-0.19, 0.085], [0.19, 0.085], [0.21, 0.07], [0.21, 0.05]]), lowerWeb, 0, BELT_Y, 0);
      for (const s of [-1, 1]) for (const a of [0.62, 1.0, 1.4, 1.8, 2.2, 2.6]) for (const dy of [-0.085, 0.085]) {   // hai hàng khe MOLLE
        const b = beltAt(s * a);
        add(hips, rbox(0.2, 0.04, 0.012), lowerStrap, b.x + b.nx * 0.084, BELT_Y + dy, b.z + b.nz * 0.084, 0, Math.atan2(b.nx, b.nz), 0);
      }
      const fz = beltAt(0).z - 0.085;   // khoá: đế dây -> khung -> lưỡi, mỗi lớp nổi hơn lớp dưới (trước đây chồng cùng mặt nên nhấp nháy)
      add(hips, rbox(0.5, 0.36, 0.03), lowerStrap, 0, BELT_Y, fz - 0.01);
      add(hips, rbox(0.42, 0.3, 0.05), lowerKnuck, 0, BELT_Y, fz - 0.03);
      add(hips, rbox(0.1, 0.2, 0.03), lowerWeb, 0, BELT_Y, fz - 0.06);
    } else {
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
    }
    const waistR = beltPouch(0.96, oneCloth ? -0.7 : -0.32, 0.52, 0.58, 0.4, lowerPouch);
    const waistL = beltPouch(-1.72, oneCloth ? -0.68 : -0.3, 0.46, 0.62, 0.38, lowerPouch);
    for (const [m, w, h, d] of [[waistR, 0.52, 0.58, 0.4], [waistL, 0.46, 0.62, 0.38]]) {
      const ry = m.rotation.y, out = V(Math.sin(ry), 0, Math.cos(ry)), p = m.position.clone().addScaledVector(out, d * 0.52);
      add(beltBone, rbox(w * 0.9, h * 0.24, 0.08), M.vestD, p.x, m.position.y + h * 0.3, p.z, 0, ry, 0.08);
      add(beltBone, rbox(0.09, h * 0.3, 0.03), M.vestD, p.x, m.position.y + h * 0.04, p.z, 0, ry, 0);   // quai cài nắp ngắn cùng màu túi (dải đen dài cũ trông như khe hở)
    }

    // mép trên tấm giáp ngay dưới hõm ức (~144 cm), mép dưới trên rốn; VEST_Z đẩy cả cụm ra theo ngực dày
    // tấm lưng cong vừa phải: -0,26 cũ cùng đai sườn tiện tròn khép thành một ống, nhìn từ sau-trên như nắp thùng phuy
    const BACK_BEND = -0.15;
    const sideIn = (x, y) => -Math.sign(x) * 0.13 * sm((Math.abs(x) - 1.3) / 0.3) * sm((2.6 - y) / 0.6);
    const afterVest = [];
    const vestFrom = meshes.length;
    add(chest, plateGeo(2.5, 2.62, 0.2, PLATE_BEND), M.vest, 0, 1.95, -1.08, -0.08);
    add(chest, plateGeo(2.54, 2.8, 0.2, BACK_BEND), M.vest, 0, 1.9, 1.1, 0.05);          // lưng cùng cỡ tấm với ngực (tấm cũ rộng hơn cả vai)
    add(chest, plateBindGeo(2.5, 2.62, 0.2, PLATE_BEND), M.vestB, 0, 1.95, -1.08, -0.08);
    add(chest, plateBindGeo(2.54, 2.8, 0.2, BACK_BEND), M.vestB, 0, 1.9, 1.1, 0.05);

    // vải quanh eo bám hai đoạn cột sống (bụng theo thắt lưng, ngực theo lồng ngực), gập lưng không gãy khúc
    add(chest, spineCloth0(cummerbundGeo()), M.vest, 0, 0.22, 0).scale.z = 0.9;

    for (const sx of [-1, 1]) {
      // QUAI VAI tính thẳng trên mặt áo thật (torsoSurfZ), cách đều theo pháp tuyến; hai đầu luồn vào mép trên tấm giáp.
      // Hệ cuối = hệ ngực; cộng 0.22 + VEST_DROP vì cả cụm giáp bị hạ ở vòng lặp cuối.
      const base = [], NS = 14, lift = 0.22 + VEST_DROP, CLEAR = 0.046;
      for (let k = 0; k < NS; k++) {
        const u = -1 + 2 * k / (NS - 1), x = sx * (0.62 + 0.26 * (1 - u * u));
        let yTop = 3.86; while (yTop > 2.6 && lerpTab(TORSO_PROF, yTop) * 1.02 < Math.abs(x)) yTop -= 0.005;
        const y = yTop - (yTop - (u < 0 ? 2.72 : 2.98)) * Math.pow(Math.abs(u), 1.8);
        base.push(V(x, y, torsoSurfZ(x, y, u < 0 ? -1 : 1)));
      }
      const nrms = base.map((q, k) => {
        const a = base[Math.max(0, k - 1)], b = base[Math.min(NS - 1, k + 1)], ty = b.y - a.y, tz = b.z - a.z, l = Math.hypot(ty, tz) || 1;
        let ny = -tz / l, nz = ty / l;
        if (ny * (q.y - 2.2) + nz * q.z < 0) { ny = -ny; nz = -nz; }
        return [ny, nz];
      });
      const pts = [V(sx * 0.62, 2.62 + lift, -1.02)];
      base.forEach((q, k) => pts.push(V(q.x, q.y + nrms[k][0] * CLEAR + lift, q.z + nrms[k][1] * CLEAR)));
      pts.push(V(sx * 0.62, 2.92 + lift, 1.02));
      add(chest, padStrapGeo(new THREE.CatmullRomCurve3(pts), 0.3, 0.075, 'shoulder' + sx, V(sx * 0.05, 2.55 + lift, 0)), M.vestD, 0, 0, 0);   // tâm lệch vào trong -> quai nằm nghiêng ôm dốc vai
      // ống túi nước chạy men theo mặt quai vai phải (trước đây nổi lơ lửng cách vai như quai xách)
      if (sx > 0) {
        const tp = base.map((q, k) => V(q.x + 0.05, q.y + nrms[k][0] * (CLEAR + 0.055) + lift, q.z + nrms[k][1] * (CLEAR + 0.055)));
        add(chest, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(tp.concat(V(0.73, 2.9 + lift, 1.06))), 30, 0.024, 6, false), M.strap, 0, 0, 0);
      }
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
    gearStart('radio');
    // BỘ ĐÀM CHIẾN THUẬT trong túi vải hở miệng bên sườn trái (toạ độ thật; rp đổi sang hệ trước khi vòng lặp dồn áo giáp co lại)
    {
      // túi đeo lùi về nửa sau sườn (vị trí thật trên đai bụng): tay buông đi phía trước túi, không xuyên qua máy
      const RZ = 0.72, rp = (x, y, z) => [x / 0.955, y + 0.22, (z + RZ) / 0.84];
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
      const tq = (x, y, z) => V(x, y + 0.22, z + RZ);   // điểm bám vào máy: lùi theo túi
      add(chest, new THREE.TubeGeometry(new THREE.CatmullRomCurve3([tq(-1.9, 2.14, 0.28), tq(-1.93, 2.55, 0.5), tp(-1.9, 3.05, 0.92), tp(-1.76, 3.55, 1.2)]), 22, 0.012, 5, false), M.strap, 0, 0, 0);   // anten mảnh
      // cáp xoắn lò xo từ đáy túi vòng qua sườn lên PTT
      const path = new THREE.CatmullRomCurve3([tq(-1.72, 1.9, -0.18), tp(-1.72, 2.0, -0.3), tp(-1.5, 2.2, -0.9), tp(-1.15, 2.42, -1.08), tp(-0.76, 2.56, -1.16)]);
      const pts = [], COILS = 34, N = COILS * 8, q = V(), up = V(0, 1, 0), a1 = V(), a2 = V();
      for (let i = 0; i <= N; i++) {
        const t = i / N, P = path.getPointAt(t), Tn = path.getTangentAt(t);
        a1.crossVectors(Tn, up).normalize(); a2.crossVectors(a1, Tn).normalize();
        const k = sm(t / 0.05) * sm((1 - t) / 0.05), th = i / 8 * Math.PI * 2;
        pts.push(P.clone().addScaledVector(a1, Math.cos(th) * 0.035 * k).addScaledVector(a2, Math.sin(th) * 0.035 * k));
      }
      add(chest, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), N, 0.009, 4, false), M.strap, 0, 0, 0);
    }
    gearEnd('radio');
    add(chest, rbox(0.72, 0.76, 0.5), M.pouch, 1.65, 1.35, 0.04, 0, Math.PI / 2, -0.03);
    add(chest, rbox(0.6, 0.24, 0.13), M.vestD, 1.93, 1.58, 0.04, 0, Math.PI / 2, -0.08);
    add(chest, rbox(0.1, 0.48, 0.08), M.strap, 1.94, 1.34, 0.04, 0, Math.PI / 2, 0);
    // mặt lưng: để lộ đai MOLLE của vỏ giáp, một túi nước dẹt treo trên đai (bản cũ: 2 khối rằn ri chồng nhau che hết tấm lưng)
    gearStart('backPanel');
    // TẤM LƯNG GẮN KHOÁ KÉO (túi nước / túi hành chính): phủ gần hết tấm lưng như giáp thật (bản cũ 1,3 x 1,5 trên tấm 2,54 x 2,8 trông bé tí),
    // cong ôm theo tấm lưng (hộp phẳng thì hở khe ở hai mép)
    {
      const bend = (g, b, hw) => { g = g.clone(); const P = g.attributes.position; for (let i = 0; i < P.count; i++) P.setZ(i, P.getZ(i) + b * Math.pow(P.getX(i) / hw, 2)); g.computeVertexNormals(); return g; };
      const BW = 2.1, BH = 2.05, BY = 1.86, BZ = 1.38, BB = BACK_BEND * 0.92;
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
    gearEnd('backPanel');
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

    for (const fn of afterVest) fn();

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

    gearStart('pouches');
    for (const x of [-0.84, -0.28, 0.28, 0.84]) onVest(rbox(0.56, 0.9, 0.1), M.pouch, x, 1.1, 0.1);
    // lính UAV: giá máy điều khiển chiếm giữa ngực, bỏ 3 túi đạn (không thì giá phải độn dày ~4 cm để trùm túi)
    for (const x of options.weapon === 'kami' ? [] : [-0.46, 0, 0.46]) {
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
    gearEnd('pouches');

    if (!oneCloth) for (const sx of [-1, 1]) add(chest, GEO.shoulder || (GEO.shoulder = clothUV(new THREE.SphereGeometry(0.56, 20, 14))), M.uni, sx * 1.56, 2.74, 0).scale.set(1.08, 0.8, 1.18);
    // cổ áo là mảnh vải may rời: rằn ri sẫm hơn thân + đường may tối ở chân cổ (cùng màu, không đường nối thì trông liền với vai)
    const collarMeshes = [add(chest, collarGeo(), M.uniC, 0, 0, 0)];
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
    collarMeshes.push(add(chest, collarBindGeo(), M.vestD, 0, 0, 0));   // băng viền mép cổ áo màu sẫm
    // DÂY CHUYỀN THẺ TÊN: xích bi vòng quanh cổ áo, thả xuống trước ngực, 2 thẻ thép bo góc chồng lệch (thẻ thật 5 x 2,9 cm)
    const tagMeshes = [];
    if ((options.role || 'infantry') === 'infantry' && gear.tags !== false) {
      const steel = M.dogtag || (M.dogtag = new THREE.MeshStandardMaterial({ color: 0xb4b5b0, metalness: 0.85, roughness: 0.34, envMap: metalEnv(), envMapIntensity: 0.65 }));
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
        const hole = new THREE.Path(); hole.absarc(0, h - 0.045, 0.017, 0, Math.PI * 2, true); sh.holes.push(hole);   // lỗ xỏ khoen ở đầu thẻ
        const g = new THREE.ExtrudeGeometry(sh, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.006, bevelSegments: 1 }); g.translate(0, -h, -0.006); return g; })());
      // Thẻ TREO từ lỗ ở đầu thẻ ngay đáy xích, rồi TỰA lên mặt ngực: ngực dốc ra sau ~20-28° về phía cổ (chestSlope + khối ngực),
      // nên thẻ nghiêng đáy ra trước. Góc = góc nhỏ nhất mà cả thân thẻ nằm trước mặt áo (ngực lồi -> chạm 1 điểm, đầu thẻ hơi tách như thật).
      // Trước đây đặt thẻ theo mặt áo ở y 2,78 + nghiêng ngược chiều: đầu thẻ chìa ~2 cm trước xích (xích không qua khoen), đáy lún vào ngực.
      const yC = TY + 0.095, L = 0.4, HOLE = 0.045;
      for (const [dx, rz, gap] of [[-0.012, 0.07, 0.022], [0.012, -0.11, 0.042]]) {   // thẻ sau sát áo, thẻ trước chồng lên thẻ sau
        const yR = yC - 0.013, yH = yR - 0.026;                                             // khoen ôm xích ở mép trên, lỗ thẻ ở mép dưới khoen
        const zH = torsoFrontZ(dx, yH) - gap;
        let a = 0;
        for (; a < 1.2; a += 0.01) {
          let ok = true;
          for (let s = 0; s <= L - HOLE + 1e-6 && ok; s += 0.025) if (zH - s * Math.sin(a) > torsoFrontZ(dx - s * Math.sin(rz), yH - s * Math.cos(a)) - gap) ok = false;
          if (ok) break;
        }
        const off = V(0, -HOLE, 0).applyEuler(new THREE.Euler(a, 0, rz));                 // lỗ thẻ trong hệ thẻ (đỉnh thẻ ở y 0)
        tagMeshes.push(add(chest, tagGeo, steel, dx - off.x, yH - off.y, zH - off.z, a, 0, rz));
        // khoen dựng theo trục y-z, xỏ qua lỗ thẻ; xích luồn qua mép trên khoen
        const zR = (zH + torsoFrontZ(dx, yC) - 0.025) / 2;                                   // giữa lỗ thẻ và xích để khoen ôm cả hai
        tagMeshes.push(add(chest, new THREE.TorusGeometry(0.03, 0.006, 5, 14), steel, dx, yR, zR, 0, Math.PI / 2, 0));
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
      for (let i = 0; i < n; i++) w[i] = 0.9 * sm((P.getY(i) - 3.22) / 0.72);
      g.userData.blend = { bones: [chest, head], a: new Uint8Array(n), b: new Uint8Array(n).fill(1), w };
      neckMesh.geometry = g;
      // mép trên cổ áo đi theo đầu một phần: đầu đưa ra trước khi ngắm thì cổ áo nghiêng theo, gáy không lộ lòng cổ áo rỗng
      for (const cm of collarMeshes) {
        const g0c = cm.geometry, Pc = g0c.attributes.position, nc = Pc.count, gc = new THREE.BufferGeometry(), wc = new Float32Array(nc);
        if (g0c.index) gc.setIndex(g0c.index);
        for (const k in g0c.attributes) gc.setAttribute(k, g0c.attributes[k]);
        for (let i = 0; i < nc; i++) wc[i] = 0.62 * sm((Pc.getY(i) - 3.34) / 0.3);
        gc.userData.blend = { bones: [chest, head], a: new Uint8Array(nc), b: new Uint8Array(nc).fill(1), w: wc };
        cm.geometry = gc;
      }
    }

    add(head, faceGeo(), M.skinV, 0, 0.72, 0);
    // tai nằm gọn dưới chụp tai liên lạc (khỏi lộ mảng da cạnh chụp)
    for (const sx of [-1, 1]) add(head, earGeo(), M.skin, sx * 0.76, 0.64, 0.07, 0, sx * 0.2, 0).scale.set(sx * 0.8, 0.8, 0.8);
    const gaiterMesh = add(head, gaiterGeo(), M.gaiter, 0, 0.0, 0);
    if (oneCloth) {   // khăn: mép dưới bám ngực, tới hàm mới bám hẳn đầu. Gắn cứng vào đầu thì lúc cúi, phần dưới trục xoay đầu văng ra sau gáy thành gờ gãy
      const g0 = gaiterMesh.geometry, P = g0.attributes.position, n = P.count, g = new THREE.BufferGeometry(), w = new Float32Array(n);
      g.setIndex(g0.index); for (const k in g0.attributes) g.setAttribute(k, g0.attributes[k]);
      for (let i = 0; i < n; i++) w[i] = sm((P.getY(i) + 0.85) / 0.95);
      g.userData.blend = { bones: [chest, head], a: new Uint8Array(n), b: new Uint8Array(n).fill(1), w };
      gaiterMesh.geometry = g;
    }
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

    gearStart('goggles');
    add(head, goggleLensGeo(), M.visor, 0, 0, 0).userData.lodKeep = true;   // dải dài mỏng nhưng là mảng tối dễ thấy nhất trên mặt
    add(head, goggleFrameGeo(), M.frame, 0, 0, 0);
    gearEnd('goggles');
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
    add(head, helmetInnerGeo(), M.helmD, 0, HEL_Y, 0.07).userData.lod0Only = true;   // chỉ thấy khi nhìn gần từ dưới gáy
    add(head, new THREE.TorusGeometry(0.93 * HEL_R / 1.12, 0.028, 5, 28), M.strap, 0, 1.36, 0.07, Math.PI / 2 - 0.08).scale.set(0.98, 1.06, 1);
    const flush = (geo, mat, phi, y, off) => {
      const h = helPt(phi, y, off), m = add(head, geo, mat, h.p.x, h.p.y, h.p.z);
      m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(h.t, V().crossVectors(h.n, h.t), h.n));
      return m;
    };
    {
      const edge = [];
      for (let k = 0; k <= 72; k++) { const f = k / 72 * Math.PI * 2; edge.push([f, helRim(f) + 0.015]); }
      add(head, helLine(edge, -HEL_TH / 2 + 0.006, HEL_TH / 2 + 0.006), M.trim, 0, 0, 0);   // viền bịt kín mép giữa vỏ ngoài và vỏ trong
    }
    add(head, helRibbon('brim', -0.9, 0.9, f => helRim(f) - 0.01, f => helRim(f) + 0.1, 0.035, 0.03), M.shell, 0, 0, 0);
    for (const sx of [-1, 1]) {
      const fa = 0.92, fb = 2.25, F = f => sx * f;
      const lo = f => helRim(f) + 0.1, hi = f => helRim(f) + 0.44;
      const ribbon = (key, f0, f1, l, h, off, th) => add(head, helRibbon(key + sx, F(f0) < F(f1) ? F(f0) : F(f1), F(f0) < F(f1) ? F(f1) : F(f0), l, h, off, th), M.shell, 0, 0, 0);
      ribbon('arc', fa, fb, lo, hi, 0.02, 0.07);
      ribbon('arcSlot', fa + 0.05, fb - 0.05, f => helRim(f) + 0.33, f => helRim(f) + 0.37, 0.09, 0.012).material = M.knuck;
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
      let upBind = null, dirBind = null;
      const upS = new THREE.Group(), fix = new THREE.Group(), fixB = new THREE.Group();
      if (oneCloth) {
        // tay buông làm tư thế gốc của xương (đủ để một đỉnh vải có toạ độ đúng theo cả ngực lẫn cánh tay)
        root.updateMatrixWorld(true);
        const invR = new THREE.Matrix4().copy(root.matrixWorld).invert();
        const S0 = V(s * SHOULDER_X, SHOULDER_Y, 0).applyMatrix4(chest.matrixWorld).applyMatrix4(invR), D0 = V(s * 0.06, -1, 0).normalize();
        const E0 = S0.clone().addScaledVector(D0, ARM_UP);
        aim(up, S0, E0, V(s, 0, 0.3));
        upBind = up.quaternion.clone(); upS.position.copy(up.position); upS.quaternion.copy(upBind); root.add(upS); fix.position.copy(up.position); fix.quaternion.copy(upBind); root.add(fix);
        fixB.position.set(s * SHOULDER_X, SHOULDER_Y, 0); chest.add(fixB);
        dirBind = D0.clone();
        aim(fore, E0, E0.clone().addScaledVector(D0, ARM_FORE), V(s, 0, 0.3));
        root.updateMatrixWorld(true);
        const mC = new THREE.Matrix4().copy(chest.matrixWorld);
        const g = sleeveGeo(chest, clav, up, fore, upS, fix, fixB, s, S0, D0, q => q.applyMatrix4(mC).applyMatrix4(invR));
        add(root, g, M.uniV, 0, 0, 0);
        // đường may nách bỏ: lớp phủ vai đã che chỗ nối, chỉ lòi qua lớp phủ thành vết nứt
        // túi + phù hiệu cong ôm theo tay áo, không còn tấm phẳng dán lên
        add(pocket, patchGeo(0.51 * ARM_K, Math.PI / 2, 1.1, 0.62, 0.035), M.uniS, 0, 1.2, 0);   // bán kính theo mặt tay áo thật ở y 1,2: to hơn là túi hở, góc túi chìa ra như gai
        add(pocket, patchGeo(0.55 * ARM_K, Math.PI / 2, 0.62, 0.28, 0.012), M.patch, 0, 1.22, 0);
        add(pocket, patchGeo(0.56 * ARM_K, Math.PI / 2, 1.12, 0.12, 0.016), M.vestD, 0, 0.93, 0);
      } else {
        add(up, limbGeo('up'), M.uni, 0, 0, 0);
        add(pocket, rbox(0.12, 0.72, 0.58), M.uniS, 0.5, 0.95, 0);
        add(pocket, rbox(0.05, 0.42, 0.44), M.patch, 0.57, 0.98, 0);
        add(pocket, rbox(0.03, 0.03, 0.56), M.strap, 0.57, 0.62, 0, 0.35, 0, 0);
        add(up, new THREE.TorusGeometry(0.5, 0.012, 4, 20), M.helmD, 0, 0.2, 0, Math.PI / 2 + 0.25, 0, 0);
      }

      if (!oneCloth) add(fore, limbGeo('fore'), M.uni, 0, 0, 0);
      // tay áo liền: vải từ khuỷu tới fore y≈0,23 trộn giữa cánh tay trên & cẳng tay (co lại khi gập) -> đệm gắn cứng cẳng tay phải nằm dưới dải trộn, không thì gập tay là đệm lơ lửng ngoài vải
      const padY = oneCloth ? 0.45 : 0.22;
      add(fore, patchGeo(oneCloth ? 0.5 * ARM_K : 0.49, Math.PI / 2, 1.7, 0.46, 0.07), M.pad, 0, padY, 0);
      if (!oneCloth) add(fore, new THREE.CylinderGeometry(0.53, 0.53, 0.06, 18, 1, true), M.strap, 0, padY + 0.24, 0).scale.set(1, 1, 0.92);
      add(fore, cuffGeo(), M.uni, 0, ARM_FORE - 0.47, 0).scale.setScalar(oneCloth ? ARM_K * 0.88 : 1);
      add(fore, rbox(oneCloth ? 0.05 : 0.1, oneCloth ? 0.14 : 0.18, oneCloth ? 0.24 : 0.3), M.uniS, oneCloth ? 0.3 * ARM_K * 0.94 : 0.33, ARM_FORE - 0.32, 0);   // quai dán cổ tay nằm sát, không chìa ra

      // cổ găng gắn CẲNG TAY, luồn trong ống tay áo: gắn bàn tay thì cổ tay gập là ống cứng chìa ra khỏi tay áo; cổ tay là khớp cầu tròn che khe khi gập
      add(fore, new THREE.CylinderGeometry(oneCloth ? 0.235 : 0.37, oneCloth ? 0.21 : 0.35, 0.52, 14, 1, true), M.glove, 0, ARM_FORE - 0.16 + (oneCloth ? 0 : 0.1), 0).scale.set(1, 1, 0.84);   // kíp lái: ống tay to hơn, cổ găng trùm ra ngoài
      add(hand, new THREE.SphereGeometry(0.18, 16, 10), M.glove, 0, 0, 0).scale.set(0.72, 1, 1.08);   // cổ tay dẹt trước-sau, rộng theo trụ-quay; tránh khớp cầu tròn như cổ tay búp bê
      add(fore, rbox(0.04, 0.17, 0.34), M.glove, 0.235, ARM_FORE - 0.06, 0);
      add(fore, rbox(0.04, 0.11, 0.09), M.knuck, 0.255, ARM_FORE - 0.06, s * 0.13);
      buildHand(hand, M, s, add, !crew && s > 0 && options.weapon !== false && options.weapon !== 'gl' && options.weapon !== 'kami', options.weapon === 'kami');   // súng phóng lựu: ổ đạn tròn chắn đường ngón trỏ duỗi, nắm cùng các ngón kia
      for (const m of hand.userData.segs || []) meshes.push(m);
      hand.scale.setScalar(HAND_S);

      const delt = oneCloth ? null : add(root, deltGeo(), M.uni, 0, 0, 0);
      return { s, up, fore, hand, pocket, delt, clav, upBind, upS, fix, fixB, dirBind, sh: V(s * SHOULDER_X, SHOULDER_Y, 0) };
    });

    const role = options.role || 'infantry';
    // vũ khí cầm tay: options.weapon = khoá trong WEAPONS ('rifle'...), true = 'rifle', false = tay không; mặc định bộ binh cầm súng trường
    // Súng trường là cấu hình mặc định của lính thường. Súng phóng lựu là vũ khí chuyên biệt,
    // phải được gán rõ bằng options.weapon = 'gl' (nếu mọi người đều cầm GL, đội hình vừa
    // sai biên chế vừa có silhouette nặng đầu, che gần hết ngực/mặt ở góc nhìn chính diện).
    const weapon = options.weapon === undefined ? (role === 'infantry' ? 'rifle' : null) : options.weapon === true ? 'rifle' : (options.weapon || null);
    let rifle = null, kitRange = null;
    if (weapon && WEAPONS[weapon]) {
      const from = meshes.length;
      rifle = WEAPONS[weapon].build(M, add);
      torso.add(rifle);
      rifle.userData.probes = WEAPONS[weapon]._probes || (WEAPONS[weapon]._probes = autoProbes(rifle));
      const gunEnd = meshes.length;
      if (WEAPONS[weapon].kit && options.kit !== false && !crew) WEAPONS[weapon].kit(M, add, chest);
      kitRange = [gunEnd, meshes.length];
      for (let i = from; i < meshes.length; i++) meshes[i].userData.wear = WEAPONS[weapon].painted && WEAPONS[weapon].painted(M, meshes[i].material) ? 1.3 : i < gunEnd ? 1 : meshes[i].userData.fabric ? -0.7 : 0.6;   // đồ vải: bẩn như túi, không mòn mép kim loại
      for (let i = from; i < meshes.length; i++) meshes[i].castShadow = true;
    }
    // bộ y tế (gear.medkit): túi cứu thương ở thắt lưng, chếch sau hông phải
    if (gear.medkit && role === 'infantry' && !crew && !isHatch) {
      const from = meshes.length, a = 2.35, r = 0.5 * 0.42;
      medkitPouch(M, add, torso, Math.sin(a) * (1.43 + r), -0.32, -Math.cos(a) * (0.96 + r), Math.PI - a);
      for (let i = from; i < meshes.length; i++) meshes[i].userData.wear = 0.6;
    }
    // bộ ngụy trang cỏ (gear.ghillie): lớp búi sợi phủ mũ, vai, lưng, hông, bắp tay, đùi, bắp chân — mỗi cụm bám đúng xương nên đi, quỳ, ngắm vẫn ôm người
    if (gear.ghillie && role === 'infantry' && !crew && !isHatch) {
      // độ nhô sau lưng của đồ đeo theo vũ khí (hệ ngực, lưới ô 0,3): lớp tua lưng trùm ra ngoài
      let backOut = null, frontKit = null;
      if (kitRange && kitRange[1] > kitRange[0]) {
        root.updateMatrixWorld(true);
        const inv = new THREE.Matrix4().copy(chest.matrixWorld).invert(), M4 = new THREE.Matrix4(), v = V(), cell = new Map(), front = new Set();
        for (let i = kitRange[0]; i < kitRange[1]; i++) {
          const m = meshes[i], P = m.geometry.attributes.position;
          M4.multiplyMatrices(inv, m.matrixWorld);
          for (let j = 0; j < P.count; j++) {
            v.fromBufferAttribute(P, j).applyMatrix4(M4);
            if (v.z < -0.6) front.add(Math.round(v.x / 0.3) * 1000 + Math.round(v.y / 0.3));
            if (v.z < 0.6) continue;
            const k = Math.round(v.x / 0.3) * 1000 + Math.round(v.y / 0.3);
            if (!(cell.get(k) >= v.z)) cell.set(k, v.z);
          }
        }
        // sợi rủ xuống nên chừa cả phần ngay trên đồ đeo
        frontKit = (x, y) => { const i0 = Math.round(x / 0.3), j0 = Math.round(y / 0.3); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 2; b++) if (front.has((i0 + a) * 1000 + j0 - b)) return true; return false; };
        backOut = (x, y) => { let z = -9; const i0 = Math.round(x / 0.3), j0 = Math.round(y / 0.3); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const c = cell.get((i0 + a) * 1000 + j0 + b); if (c > z) z = c; } return z; };
      }
      // vỏ ngoài của đồ đeo quanh người theo từng hệ xương (ô 1/48 vòng x 0,25 cao): bán kính xa nhất của đồ trong ô, lưới áo cỏ đẩy ra phủ lên
      const NOT_GEAR = new Set([M.uni, M.uniC, M.uniS, M.gaiter, M.dogtag, M.skin, M.skinV].filter(Boolean)), AS = Math.PI * 2 / 48;
      const hullOf = (frame, from) => {
        root.updateMatrixWorld(true);
        const inv = new THREE.Matrix4().copy(frame.matrixWorld).invert(), M4 = new THREE.Matrix4(), v = V(), cell = new Map();
        for (const m of from.children) {
          if (!m.isMesh || NOT_GEAR.has(m.material) || m.material.transparent || m.material === M.ghillie) continue;
          const P = m.geometry.attributes.position;
          M4.multiplyMatrices(inv, m.matrixWorld);
          for (let j = 0; j < P.count; j++) {
            v.fromBufferAttribute(P, j).applyMatrix4(M4);
            const k = (((Math.round(Math.atan2(v.x, -v.z) / AS) % 48) + 48) % 48) * 1000 + Math.round(v.y / 0.25), r = Math.hypot(v.x, v.z);
            if (!(cell.get(k) >= r)) cell.set(k, r);
          }
        }
        return (x, y, z) => {
          const r0 = Math.hypot(x, z), a0 = Math.round(Math.atan2(x, -z) / AS), j0 = Math.round(y / 0.25);
          let rm = 0;
          for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const c = cell.get((((a0 + a) % 48) + 48) % 48 * 1000 + j0 + b); if (c > rm) rm = c; }
          const need = rm + 0.09;
          return r0 > 1e-3 && need > r0 && need - r0 < 0.75 ? need / r0 : 1;   // vật nhô quá xa (ống, giá lưng) đã có búi riêng, lưới áo không văng theo
        };
      };
      const gearKey = (weapon || '-') + (gear.medkit ? '|mk' : '');
      const GP = ghillieParts(team, gearKey + (backOut ? '|k' : ''), backOut, frontKit, { chest: hullOf(chest, chest), hips: hullOf(hips, torso), key: gearKey });
      const sim = [];
      // xương treo sợi: lim góc tối đa, tilt mức ngả theo trọng lực, wind mức ăn gió
      const swingOf = (parent, x, y, z, o) => {
        const bone = new THREE.Group(); bone.position.set(x, y, z); parent.add(bone);
        sim.push(Object.assign({ bone, body: parent, x: 0, z: 0, vx: 0, vz: 0, s: 1, lim: 0.28, tilt: 0.5, wind: 0.6, wn: 9, zeta: 0.28 }, o));
        return bone;
      };
      const gh = (parent, set, swing) => {
        const [fine, under, far] = set;
        if (set.net) { const n = add(parent, set.net, M.ghillie, 0, 0, 0); n.userData.wear = 0.3; n.userData.lod0Only = true; }
        if (swing) ghillieAdd(parent, ghillieSway(fine, parent, swing), ghillieSway(under, parent, swing), ghillieSway(far, parent, swing), M, add);
        else ghillieAdd(parent, fine, under, far, M, add);
      };
      gh(head, GP.head);
      gh(head, GP.hood);
      gh(chest, GP.cowl);
      gh(chest, GP.chest, swingOf(chest, 0, 3.4, 0.5, { lim: 0.22, tilt: 0.35, wind: 1, wn: 6.5, zeta: 0.2 }));
      gh(hips, GP.hips, swingOf(hips, 0, 0, 0.4, { lim: 0.22, tilt: 0.35, wind: 1, wn: 8.5, zeta: 0.24 }));
      if (rifle && options.gunCamo !== false) ghillieGun(team, weapon, rifle, M, add);
      if (kitRange && kitRange[1] > kitRange[0]) ghillieKit(team, weapon, chest, meshes.slice(kitRange[0], kitRange[1]), M, add);
      for (const a of arms) {
        gh(a.up, GP.arm, swingOf(a.up, 0, 0, 0, { s: -1, lim: 0.25 }));
        gh(a.up, GP.delt);
        gh(a.fore, GP.fore, swingOf(a.fore, 0, 0, 0, { s: -1, lim: 0.25 }));
      }
      for (const L of legs) {
        gh(L.leg, GP['leg' + L.sx], swingOf(L.leg, 0, -0.2, 0, {}));
        gh(L.knee, GP['shin' + L.sx], swingOf(L.knee, 0, -0.15, 0, {}));
      }
      chest.userData.ghCape = { t: 0, seed: Math.random() * 6.28, rest: false, p: null, pv: null, list: sim };
    }
    // mức bẩn theo vật liệu (lính bộ binh): quân phục, giày, găng bẩn đủ; giáp, túi ít hơn; mũ, khăn ít nhất; mặt, kính, tóc giữ nguyên
    const dirtClean = new Set([M.glove, M.skin, M.skinV, M.lens, M.visor, M.frame, M.hair, M.lip, M.dust, M.soot, M.dead, M.deadVest, M.soak]);
    const dirtHelm = new Set([M.helm, M.helmD, M.gaiter, M.headset, M.velcro, M.patch]);
    const dirtGear = new Set([M.vest, M.vestB, M.vestD, M.pouch, M.web, M.web2, M.webD, M.strap, M.mag, M.tq, M.pad]);
    for (const m of meshes) {
      if (!crew && !m.userData.wear && !dirtClean.has(m.material)) m.userData.wear = dirtHelm.has(m.material) ? -0.6 : dirtGear.has(m.material) ? -0.85 : -1;
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
    for (let r = gearRanges.length - 1; r >= 0; r--) { const [a, b] = gearRanges[r]; for (const m of meshes.splice(a, b - a)) if (m.parent) m.parent.remove(m); }
    // soi hình khối (trang thử): chỉ giữ các mảnh có vật liệu trong options.keepMats, vd ['uni','uniV','skin'] để bỏ giáp / đồ đeo
    if (options.keepMats) { const ks = new Set(options.keepMats.map(k => M[k])); for (let i = meshes.length - 1; i >= 0; i--) if (!ks.has(meshes[i].material)) { const m = meshes.splice(i, 1)[0]; if (m.parent) m.parent.remove(m); } }
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
      // khung bao của lưới skinned tính theo dáng đứng: nằm sấp / quỳ đặt cối thì đầu và súng ra xa khỏi đó, nhìn gần bị cắt nhầm (mất mũ, mặt).
      // Vũ khí có thế cầm riêng: nới khung bao đủ cả dáng nằm + nòng dài (geometry dùng chung nên đặt một lần là đủ)
      if (WEAPONS[weapon] && WEAPONS[weapon].hold) root.traverse(o => { if (o.isSkinnedMesh) o.geometry.boundingSphere = new THREE.Sphere(V(0, -2, -4), 20); });
    }

    for (const a of arms) { const T = a.hand && a.hand.userData.trigIdx; if (T) { T[1].scale.setScalar(0.001); a._trigCurl = false; } }   // ngón trỏ mặc định duỗi ngoài vành cò
    if (options.skin && lod) crewSkinMats(lod);
    const soak = [[Math.PI - 0.62, 1.2, 1.37, 0.05, 1.3], [-Math.PI / 2 - 0.5, 0.95, 1.41, 0.35, 1.1]].map(([t0, len, r, y, h]) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r + 0.02, h, 14, 1, true, t0, len), M.soak);
      m.position.set(0, y, 0); m.scale.set(1, 1, 0.655);
      m.renderOrder = (options.renderOrder || 12) + 0.5;
      m.visible = false; m.userData.crewRole = role;
      chest.add(m);
      return m;
    });
    // bộ binh: vết trên ngực nằm dưới áo giáp, không thấy -> mỗi đùi + mỗi bắp tay có sẵn một vết thấm vải, hiện đúng chỗ bị thương (markWound)
    const woundMarks = {};
    if (!crew && legs.length) {
      const patch = (par, site, r0, r1, h, th, len, y, sx2, sz2) => {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, 12, 1, true, th - len / 2, len), M.soak);
        m.position.set(0, y, 0); m.scale.set(sx2, 1, sz2);
        m.renderOrder = (options.renderOrder || 12) + 0.5;
        m.visible = false; m.userData.crewRole = role;
        par.add(m); woundMarks[site] = m;
      };
      legs.forEach((L, i) => patch(L.leg, i ? 'legR' : 'legL', 0.815, 0.775, 1.0, Math.PI + (i ? 1 : -1) * 0.25, 1.7, -0.75, 0.97, 1.18));
      arms.forEach((A, i) => { if (A.upS) patch(A.upS, i ? 'armR' : 'armL', 0.535, 0.525, 0.8, (i ? 1 : -1) * Math.PI / 2, 1.9, 1.0, 1, 0.94); });
    }

    return {
      root, torso, hips, chest, head, arms, legs, meshes, M, soak, woundMarks, lod, spine: oneCloth, rifle, weapon: rifle ? weapon : null, grime: lod && lod.skeleton ? newGrime(lod.skeleton) : null,
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
  const ARM_ROLL_MAX = 1.05, _rlQ = new THREE.Quaternion(), _rlQ2 = new THREE.Quaternion();
  const CLAV_FOLLOW = 0.45, _cq = new THREE.Quaternion(), _rq = new THREE.Quaternion(), _clq = new THREE.Quaternion();
  const HAND_FLIP_HYST = 0.35;
  function solveArm(F, arm, targetW, poleL, gripAxisW, gripPalmW = null, palmK = 0.32, freePole = false) {   // freePole: theo đúng pole, bỏ chặn khuỷu qua giữa thân (armGuard giữ nghiệm khung trước)
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
          // ngón hướng về cánh tay thì lật, có trễ: lật đúng ở 0 thì tích vô hướng dao động quanh đó làm cổ tay nhảy 1,2 đv (2 x tầm bàn tay) trong 1 khung
          const dY = wantY.dot(ref) * (arm._hySign || 1);
          if (dY < -HAND_FLIP_HYST || (arm._hySign == null && dY < 0) || F._snap && dY < 0) arm._hySign = -(arm._hySign || 1);
          else if (arm._hySign == null) arm._hySign = 1;
          wantY.multiplyScalar(arm._hySign);
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
      d = Math.max(elbowMinD(a, b), Math.min(a + b - 0.12, d));
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
      if (!freePole && lateral.lengthSq() > 1e-6) {
        lateral.normalize();
        const sideK = pv.dot(lateral);
        if (sideK < 0.08) pv.addScaledVector(lateral, 0.08 - sideK).normalize();
      }
      E = S.clone().addScaledVector(dir, a * cosA).addScaledVector(pv, a * sinA);
    };
    solveJoint();
    if (axG) { handFrame(G.clone().sub(E).normalize()); solveJoint(); }

    poseArm(F, arm, S, E, Tc, pv, HB);
  }

  // đặt xương cánh tay, xương đòn, cẳng tay, bàn tay theo nghiệm (hệ root)
  const _gD2 = V(0, 0, 0), _gD3 = V(0, 0, 0), _gD4 = V(0, 0, 0), FIX_K = 0.22, FIX_BK = 0.6;   // 1: túi lõm đầy nhưng thế ngắm vai phải phồng cục
  function poseArm(F, arm, S, E, Tc, pv, HB) {
    aim(arm.up, S, E, pv);
    if (arm.clav && arm.upBind) {
      arm.clav.position.copy(arm.sh);
      // xoay đủ (cả vặn quanh trục tay) so với tư thế gốc, trong hệ ngực: chỉ lấy hướng tay thì bỏ sót phần vặn -> vải bắp tay xoắn phình
      _cq.copy(F.torso.quaternion).multiply(F.chest.quaternion).invert();
      _gD2.copy(E).sub(S).normalize();
      arm.upS.position.copy(S);
      arm.upS.quaternion.setFromUnitVectors(arm.dirBind, _gD2).multiply(arm.upBind);
      // up (vặn theo hướng khuỷu) và upS (quay ngắn nhất từ tư thế gốc) lệch quá nhiều quanh trục tay thì lưới hoà giữa hai xương thắt lại giữa bắp tay (giơ tay qua vai lệch tới 180°, lật 347° trong một khung).
      // Chỉ trong lúc nạp RPG (động tác giơ tay qua vai): giữ độ lệch trong ARM_ROLL_MAX, đổi dần; xong thì trả dần về như cũ. Súng khác có lúc lệch quá 60° và dáng vai đã chỉnh theo đó, không đụng tới
      // + thay băng súng bắn tỉa (đứng / quỳ / nằm): đo lệch 100-180°, lật 360° trong một khung -> vai áo méo, bắp tay như mọc từ trước ngực
      const rlOn = !!(F.rpgState && F.rpgState.t != null) || !!(F.atrState && F.atrState.t != null) || !!F._atrKL;
      if (rlOn || arm._rollS != null) {
        _rlQ.copy(arm.up.quaternion).multiply(_rlQ2.copy(arm.upS.quaternion).invert());
        if (_rlQ.w < 0) { _rlQ.set(-_rlQ.x, -_rlQ.y, -_rlQ.z, -_rlQ.w); }
        const rlA = 2 * Math.atan2(_rlQ.x * _gD2.x + _rlQ.y * _gD2.y + _rlQ.z * _gD2.z, _rlQ.w), rlT = rlOn ? Math.max(-ARM_ROLL_MAX, Math.min(ARM_ROLL_MAX, rlA)) : rlA, rlS = 3.6 * (F._dtA || 0.016);
        const rlN = arm._rollS == null || F._snap ? rlT : arm._rollS + Math.max(-rlS, Math.min(rlS, rlT - arm._rollS));
        if (Math.abs(rlA - rlN) > 1e-4) arm.upS.quaternion.premultiply(_rlQ.setFromAxisAngle(_gD2, rlA - rlN));
        arm._rollS = !rlOn && Math.abs(rlA - rlN) < 0.01 ? null : rlN;
      }
      // khớp sửa hình: lệch theo hướng tay vung, tỉ lệ với góc vung
      arm.fix.quaternion.copy(arm.upS.quaternion);
      _gD3.copy(_gD2).sub(arm.dirBind);
      arm.fix.position.copy(S).addScaledVector(_gD3, FIX_K);
      // sửa hình sau vai: độ vươn trước (và chéo vào giữa ngực) của tay tính trong hệ ngực -> lùi vải sau vai ra sau
      if (arm.fixB) { _gD4.copy(_gD2).applyQuaternion(_cq); const reach = Math.min(1, Math.max(0, -_gD4.z) + 0.5 * Math.max(0, -arm.s * _gD4.x)); arm.fixB.position.set(arm.s * SHOULDER_X, SHOULDER_Y, reach * FIX_BK); }
      _clq.copy(_cq).multiply(arm.upS.quaternion).multiply(_rq.copy(arm.upBind).invert());
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
      wristClamp(arm, S, E, Tc);
    } else {
      aim(arm.hand, Tc, Tc.clone().addScaledVector(Tc.clone().sub(E).normalize(), 1), V(arm.s, 0, 0));
    }
  }

  // CHẶN CỔ TAY sau bộ giải: bộ giải chỉ phạt, khi vật cầm buộc thì vẫn ra cổ tay gập ngược 170° (đốt ngón quay về khuỷu).
  // Xoay bàn tay quanh cổ tay về mép tầm khớp (elip gập / ngửa / nghiêng), rồi bớt sấp ngửa quá 115°. Vị trí cổ tay giữ nguyên.
  const WR_LIM = { flex: 85 * DEG, ext: 75 * DEG, uln: 45 * DEG, rad: 30 * DEG, twist: 115 * DEG };   // sấp ngửa người ~90°: bộ giải phạt từ 90°, chặn cứng chỉ phần quá 115° (chặn sớm thì bàn tay xoay khỏi cán súng)
  const _wF = V(0, 0, 0), _wX = V(0, 0, 0), _wY = V(0, 0, 0), _wZ = V(0, 0, 0), _wU = V(0, 0, 0), _wO = V(0, 0, 0), _wA = V(0, 0, 0), _wQ = new THREE.Quaternion();
  function wristClamp(arm, S, E, Tc) {
    const q = arm.hand.quaternion, s = arm.s;
    _wF.copy(Tc).sub(E).normalize();
    _wX.set(1, 0, 0).applyQuaternion(q); _wY.set(0, 1, 0).applyQuaternion(q); _wZ.set(0, 0, 1).applyQuaternion(q);
    // hướng cẳng tay trong hệ bàn tay: góc gập (quanh mu) và nghiêng (về phía ngón cái) của ĐỐT NGÓN so với cẳng tay
    const fx = _wF.dot(_wX), fy = _wF.dot(_wY), fz = _wF.dot(_wZ) * s;
    const lim = Math.atan2(Math.hypot(fx, fz), fy);   // tổng góc lệch
    if (lim > 0.02) {
      const az = Math.atan2(fz, fx), cx = Math.cos(az), cz = Math.sin(az);
      const Lx = fx > 0 ? WR_LIM.flex : WR_LIM.ext, Lz = fz > 0 ? WR_LIM.uln : WR_LIM.rad;
      const Lm = 1 / Math.sqrt((cx / Lx) * (cx / Lx) + (cz / Lz) * (cz / Lz));   // giới hạn elip theo hướng lệch
      if (lim > Lm) {
        // quay bàn tay quanh trục vuông góc (đốt ngón -> cẳng tay) đúng phần vượt
        _wA.crossVectors(_wY, _wF); const l = _wA.length();
        if (l > 1e-5) { q.premultiply(_wQ.setFromAxisAngle(_wA.multiplyScalar(1 / l), lim - Lm)); jwClip('cổ tay ' + (s < 0 ? 'trái' : 'phải') + ' gập', lim * R2D); }
        else if (fy < 0) { q.premultiply(_wQ.setFromAxisAngle(_wX, Math.PI - Lm)); jwClip('cổ tay ' + (s < 0 ? 'trái' : 'phải') + ' gập', 180); }
      }
    }
    // sấp / ngửa: mu bàn tay quanh trục cẳng tay so với tư thế bắt tay (mu hướng ra ngoài)
    const fl = Math.acos(Math.max(-1, Math.min(1, _wU.copy(S).sub(E).normalize().dot(_wF)))) * R2D;
    if (fl < 145) {
      _wU.copy(S).sub(E); _wU.addScaledVector(_wF, -_wU.dot(_wF)).normalize();
      _wO.crossVectors(_wF, _wU).multiplyScalar(s);
      _wX.set(1, 0, 0).applyQuaternion(q);
      const pr = Math.atan2(_wX.dot(_wU), _wX.dot(_wO));
      // xoay quanh +f một góc th: với tay phải (O = f x U) góc pr giảm th, tay trái tăng th -> th = phần vượt * s
      if (Math.abs(pr) > WR_LIM.twist) { const ex = pr - Math.sign(pr) * WR_LIM.twist; q.premultiply(_wQ.setFromAxisAngle(_wF, ex * s)); jwClip('cẳng tay ' + (s < 0 ? 'trái' : 'phải') + (pr > 0 ? ' úp' : ' ngửa'), Math.abs(pr) * R2D); }
    }
  }

  // ---------- BỘ GIẢI CẦM NẮM CÓ GIỚI HẠN KHỚP ----------
  // Vật chỉ khai báo chỗ cầm (điểm, trục cán, phía lòng bàn tay, độ xoay cho phép, gợi ý khuỷu). Bộ giải tự tìm:
  //   theta: bàn tay xoay quanh trục cán; phi: khuỷu xoay quanh đường vai - cổ tay,
  // sao cho cổ tay, cẳng tay, khuỷu nằm trong tầm người thật. Hàm phạt = 1 ở giới hạn thoải mái của khớp (độ):
  const JOINT = { flex: 65, ext: 55, ulnar: 30, radial: 18, twist: 85 };
  const _gS = V(0, 0, 0), _gG = V(0, 0, 0), _gZ = V(0, 0, 0), _gY0 = V(0, 0, 0), _gX0 = V(0, 0, 0), _gY = V(0, 0, 0), _gX = V(0, 0, 0), _gT = V(0, 0, 0), _gD = V(0, 0, 0),
    _gE1 = V(0, 0, 0), _gE2 = V(0, 0, 0), _gH = V(0, 0, 0), _gEl = V(0, 0, 0), _gF = V(0, 0, 0), _gU = V(0, 0, 0), _gTh = V(0, 0, 0), _gTc = V(0, 0, 0), _gC = V(0, 0, 0), _gM = new THREE.Matrix4(), _gI = new THREE.Matrix4();
  // chi phí của một nghiệm; tính bằng số, không cấp phát: chạy vài chục lần mỗi khung
  let _gLift = 0;   // 0..1: động tác với ra sau lưng / qua vai (spec.lift) được nhấc khuỷu cao hơn vai; cầm súng giữ 0
  // _gOver 0..1 (spec.over): với qua đỉnh vai ra sau lưng (rút đạn ba lô như rút tên trong ống tên) -> khuỷu PHẢI giơ cao và ở phía ngoài đầu.
  // Thiếu ràng buộc này bộ giải chọn được nghiệm bẻ ngược bắp tay ra sau - xuống, khuỷu chui vào ba lô / vắt sau gáy (vai người không làm được)
  // _gPack (spec.pack): hộp ba lô hệ ngực { x, y0, y1, z0, z1 }, khuỷu và cẳng tay không xuyên qua
  let _gOver = 0, _gPack = null;
  const _gZw = V(0, 0, 0);
  function packPen(p) {
    const B = _gPack, ax = Math.abs(p.x);
    if (ax > B.x || p.y < B.y0 || p.y > B.y1 || p.z < B.z0 || p.z > B.z1) return 0;
    return 3 + 10 * Math.min(B.x - ax, p.y - B.y0, B.y1 - p.y, p.z - B.z0, B.z1 - p.z);
  }
  function gripCost(arm, theta, phi, range, hintK, a, b, psi = 0) {
    const ct = Math.cos(theta), st = Math.sin(theta);
    _gY.copy(_gY0).multiplyScalar(ct).addScaledVector(_gX0, st);
    _gX.crossVectors(_gY, _gZ);
    // psi: cán không song song ngón cái mà nằm chéo qua lòng bàn tay (nắm ốp súng: ngón cái dọc mép trái, cán chéo từ gốc ngón trỏ xuống mô út).
    // Quay đốt ngón và ngón cái quanh mu bàn tay; mu (x) giữ nguyên
    if (psi) { const cp = Math.cos(psi), sp = Math.sin(psi); _gZw.copy(_gZ).multiplyScalar(cp).addScaledVector(_gY, -sp); _gY.multiplyScalar(cp).addScaledVector(_gZ, sp); }
    else _gZw.copy(_gZ);
    _gT.copy(_gG).addScaledVector(_gY, -0.48 * HAND_S).addScaledVector(_gX, 0.3 * HAND_S);
    _gD.copy(_gT).sub(_gS);
    let d = _gD.length(), c = 0;
    if (d < 1e-5) return 1e6;
    _gD.multiplyScalar(1 / d);
    const dMax = a + b - 0.12, dMin = elbowMinD(a, b), dSoft = elbowMinD(a, b, ELBOW_ACTIVE);
    if (d > dMax) { c += 40 * (d - dMax) * (d - dMax) + 4 * (d - dMax); d = dMax; } else if (d < dMin) { c += 20 * (dMin - d); d = dMin; }
    if (d < dSoft) c += 0.6 * (dSoft - d) / Math.max(1e-3, dSoft - dMin);   // ưu tiên thế không gập quá tầm tự nhiên
    const cosA = (a * a + d * d - b * b) / (2 * a * d), sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
    // cơ sở quanh đường vai - cổ tay: phi = 0 khuỷu thẳng xuống đất
    _gE1.set(0, -1, 0).addScaledVector(_gD, _gD.y);
    if (_gE1.lengthSq() < 1e-5) _gE1.set(arm.s, 0, 0).addScaledVector(_gD, -_gD.x * arm.s);
    _gE1.normalize(); _gE2.crossVectors(_gD, _gE1);
    const cp = Math.cos(phi), sp = Math.sin(phi), s = arm.s;
    _gH.copy(_gE1).multiplyScalar(cp).addScaledVector(_gE2, sp);
    _gEl.copy(_gS).addScaledVector(_gD, a * cosA).addScaledVector(_gH, a * sinA);
    _gTc.copy(_gS).addScaledVector(_gD, d);
    _gF.copy(_gTc).sub(_gEl).multiplyScalar(1 / b);
    // cổ tay trong hệ bàn tay: x mu, y ra đốt ngón, z * s phía ngón cái
    const fx = _gF.dot(_gX), fy = _gF.dot(_gY), fz = _gF.dot(_gZw) * s;
    if (fy < 0.05) c += 6 * (0.05 - fy) + 3;
    const flex = Math.atan2(fx, Math.max(0.02, fy)) * 57.3, dev = Math.atan2(fz, Math.max(0.02, fy)) * 57.3;
    const nf = flex / (flex > 0 ? JOINT.flex : JOINT.ext), nd = dev / (dev > 0 ? JOINT.ulnar : JOINT.radial);
    c += nf * nf + nd * nd;
    // quá tầm thì phạt dốc: bậc 2 nhẹ, bộ giải chấp nhận cổ tay gập 89° (bảng tầm khớp đo được) để đổi lấy khuỷu đẹp hơn chút
    const of = Math.abs(nf) - 1.05, od = Math.abs(nd) - 1.05;
    if (of > 0) c += 12 * of * of + 2 * of;
    if (od > 0) c += 12 * od * od + 2 * od;
    // cẳng tay vặn: ngón cái so với hướng về phía bắp tay (tư thế bắt tay = 0)
    _gU.copy(_gS).sub(_gEl); _gU.addScaledVector(_gF, -_gU.dot(_gF));
    _gTh.copy(_gZw).multiplyScalar(s).addScaledVector(_gF, -s * _gZw.dot(_gF));
    const lu = _gU.length(), lt = _gTh.length();
    if (lu > 1e-4 && lt > 1e-4) {
      const dotUT = Math.max(-1, Math.min(1, _gU.dot(_gTh) / (lu * lt))), tw = Math.acos(dotUT) * 57.3 / JOINT.twist;
      c += 0.6 * tw * tw;
      if (tw > 1.06) c += 10 * (tw - 1.06) * (tw - 1.06) + 2 * (tw - 1.06);   // cẳng tay sấp / ngửa quá ~90°: khuỷu đổi chỗ (người thật xoay cả vai), không vặn cổ tay
    }
    // bàn tay lệch khỏi phía cầm khai báo
    const nt = theta / range; c += 0.5 * nt * nt + (psi ? 0.35 * (psi / 0.6) * (psi / 0.6) : 0);
    // gợi ý khuỷu của vật / tư thế (ý đồ: khuỷu hạ thấp hay mở cánh gà)
    if (hintK > 0) c += hintK * (1 - _gH.dot(_gC));
    // vai: khuỷu không nhấc quá vai, không vòng ra sau lưng hay chéo qua thân (hệ ngực)
    _gU.copy(_gEl).applyMatrix4(_gI); _gF.copy(_gS).applyMatrix4(_gI);
    const up = (_gU.y - _gF.y) / a, back = (_gU.z - _gF.z) / a, across = -(_gU.x - _gF.x) * s / a;
    const upT = 0.15 + 0.95 * _gLift, backT = 0.45 + 0.4 * _gLift;
    if (up > upT) c += 40 * (up - upT) * (up - upT) + 8 * (up - upT);
    if (back > backT) c += 10 * (back - backT) * (back - backT);
    if (across > 0.25) c += 10 * (across - 0.25) * (across - 0.25) + (across > 0.55 ? 30 * (across - 0.55) * (across - 0.55) : 0);   // khuỷu vắt chéo qua giữa ngực quá ~50°: vai người không khép được
    if (_gOver > 0) {
      if (up < 0.35) c += _gOver * (25 * (0.35 - up) * (0.35 - up) + 6 * (0.35 - up));
      if (across > 0.1) c += _gOver * 40 * (across - 0.1) * (across - 0.1);
    }
    if (_gPack) c += packPen(_gU);
    // khuỷu không đâm vào thân (hệ ngực)
    const ex = Math.abs(_gU.x) / 1.75, ez = _gU.z / 1.1;
    if (_gU.y > -0.6 && _gU.y < 3.4) { const q = ex * ex + ez * ez; if (q < 1) c += 6 * (1 - q); }
    // cẳng tay và cổ tay cũng không chui qua thân (có giáp, túi phía trước)
    for (let i = 1; i <= 3; i++) {
      _gU.copy(_gEl).lerp(_gTc, i / 3).applyMatrix4(_gI);
      if (_gU.y < -0.6 || _gU.y > 3.4) continue;
      const fx2 = _gU.x / 1.8, fz2 = _gU.z / (_gU.z < 0 ? 1.55 : 1.35), q = fx2 * fx2 + fz2 * fz2;
      if (q < 1) c += 5 * (1 - q);
      if (_gPack) c += packPen(_gU);
    }
    return c;
  }
  /**
   * Cầm một điểm trên vật. spec: { axis, palm (hướng lòng bàn tay, hệ thế giới), range (rad, độ xoay cho phép), elbow (điểm gợi ý hệ ngực), hintK }
   * Tìm toàn bộ khi chưa có nghiệm, sau đó chỉ tinh chỉnh quanh nghiệm cũ để tay không nhảy.
   */
  const ZERO1 = [0];
  function gripSolve(F, arm, targetW, spec) {
    const a = ARM_UP, b = ARM_FORE, range = spec.range == null ? 0.8 : spec.range, hintK = spec.hintK == null ? 0.5 : spec.hintK;
    _gLift = spec.lift || 0; _gOver = spec.over || 0; _gPack = spec.pack || null;
    _gM.copy(F.root.matrixWorld).invert();
    _gI.copy(F.chest.matrixWorld).invert().multiply(F.root.matrixWorld);
    _gS.copy(arm.sh); F.chest.localToWorld(_gS); F.root.worldToLocal(_gS);
    _gG.copy(targetW); F.root.worldToLocal(_gG);
    const frame = (sign) => {
    _gZ.copy(spec.axis).transformDirection(_gM).multiplyScalar((arm.s < 0 ? -1 : 1) * sign).normalize();
    if (spec.palm) {
      _gX0.copy(spec.palm).transformDirection(_gM); _gX0.addScaledVector(_gZ, -_gX0.dot(_gZ)).normalize();   // hướng lòng bàn tay vuông góc trục
      _gY0.crossVectors(_gX0, _gZ).normalize();   // lòng bàn tay là -x của tay: y = lòng x z
    } else {
      _gY0.copy(_gG).sub(_gS); _gY0.addScaledVector(_gZ, -_gY0.dot(_gZ)).normalize();
    }
    _gX0.crossVectors(_gY0, _gZ);
    };
    if (spec.elbow) { _gC.copy(spec.elbow); F.chest.localToWorld(_gC); F.root.worldToLocal(_gC); _gC.sub(_gS); } else _gC.set(arm.s, -1.2, 0.4);
    _gC.normalize();
    const st = arm._grip && !F._snap ? arm._grip : (arm._grip = { theta: 0, phi: arm.s * 0.5, sign: 1, fresh: true, psi: 0 }), hint = hintK;
    const yM = spec.yaw || 0, PS = yM ? [-yM, -yM / 2, 0, yM / 2, yM] : ZERO1;
    if (!yM) st.psi = 0;
    if (arm._gripKey !== spec.key) { st.fresh = true; arm._gripKey = spec.key; }   // đổi vật cầm: tìm lại từ đầu
    frame(st.sign);
    let bt = st.theta, bp = st.phi, best = 1e9;
    // spec.ease: đổi vật cầm giữa động tác: giữ nghiệm cũ rồi trôi tới nghiệm mới, không nhảy cả khuỷu trong một khung
    const ease = spec.ease && !spec.frozen && !F._snap && st.fresh && st.cost != null, t0 = st.theta, p0 = st.phi;
    if (st.fresh || F._snap) {
      st.sign = 1;
      let bs = 0;
      for (const sign of spec.flip ? [1, -1] : [1]) {
        frame(sign);
        for (const ps of PS) for (let i = -4; i <= 4; i++) for (let j = 0; j < 24; j++) {
          const th = i / 4 * range * 1.4, ph = j / 24 * Math.PI * 2, c = gripCost(arm, th, ph, range, hint, a, b, ps);
          if (c < best) { best = c; bt = th; bp = ph; bs = ps; st.sign = sign; }
        }
      }
      frame(st.sign);
      for (let k = yM ? -2 : 0; k <= (yM ? 2 : 0); k++) for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) {
        const th = bt + i * 0.04, ph = bp + j * 0.05, ps = Math.max(-yM, Math.min(yM, bs + k * 0.06)), c = gripCost(arm, th, ph, range, hint, a, b, ps);
        if (c < best) { best = c; st.t2 = th; st.p2 = ph; st.s2 = ps; }
      }
      if (st.t2 != null) { bt = st.t2; bp = st.p2; bs = st.s2 || 0; }
      st.theta = bt; st.phi = bp; st.psi = bs; st.fresh = false;
      if (ease) {
        // khuỷu đi vòng phía ít vướng hơn (so chi phí tại điểm giữa hai chiều); quá nửa vòng thì qua điểm giữa kẻo chiều bị gói lại
        let dp = Math.atan2(Math.sin(bp - p0), Math.cos(bp - p0));
        const alt = dp - Math.sign(dp) * Math.PI * 2, mid = (d) => gripCost(arm, (t0 + bt) / 2, p0 + d / 2, range, hint, a, b, st.psi);
        if (Math.abs(dp) > 1.2 && mid(alt) < mid(dp)) dp = alt;
        const leg = (p, then) => { gripCost(arm, bt, p, range, hint, a, b, st.psi); return { t: bt, p, h: _gH.clone(), rate: 0.25, then }; };
        const end = leg(p0 + dp);
        st.goal = Math.abs(dp) > 2.6 ? leg(p0 + dp / 2, end) : end;
        st.theta = t0; st.phi = p0;
      }
    } else if (!spec.frozen) {
      // spec.stay: cơ sở phi suy biến khi cổ tay ngay trên đỉnh vai (cơ sở quay nhanh, khuỷu vọt 3 đv trong một khung): tính lại phi theo hướng khuỷu thật của khung trước
      if (spec.stay && st.lastH) {
        gripCost(arm, st.theta, st.phi, range, hint, a, b, st.psi);
        st.phi = Math.atan2(st.lastH.dot(_gE2), st.lastH.dot(_gE1));
        for (let g = st.goal; g; g = g.then) if (g.h) g.p = Math.atan2(g.h.dot(_gE2), g.h.dot(_gE1));
      }
      // dò lại toàn bộ thưa thớt: vật xoay / bung báng sau lúc nắm (máy điều khiển rút khỏi giá) thì nghiệm cũ kẹt ở cực tiểu xấu:
      // cầm ngược chiều, bàn tay vặn quanh cán, khuỷu bè cánh gà. Nghiệm mới tốt hơn hẳn thì chuyển sang (cùng chiều: trôi dần; đổi chiều: nhảy)
      // spec.stay: động tác liền một mạch (với ra sau lưng): không đổi nghiệm giữa chừng, đổi lúc tay đã sau lưng thì góc khuỷu quét qua đầu hoặc tụt xuống
      if ((st.n = (st.n || 0) + 1) % (spec.track ? 4 : 12) === 0 && st.cost > 1 && !spec.stay) {
        let gb = 1e9, gt = 0, gp = 0, gs = st.sign, gq = st.psi;
        for (const sign of spec.flip ? [1, -1] : [1]) {
          frame(sign);
          for (const ps of PS) for (let i = -4; i <= 4; i++) for (let j = 0; j < 24; j++) {
            const th = i / 4 * range * 1.4, ph = j / 24 * Math.PI * 2, c = gripCost(arm, th, ph, range, hint, a, b, ps);
            if (c < gb) { gb = c; gt = th; gp = ph; gs = sign; gq = ps; }
          }
        }
        if (gb < st.cost * 0.75 - 0.25) { if (gs !== st.sign) { st.sign = gs; st.theta = gt; st.phi = gp; st.psi = gq; st.goal = null; } else st.goal = { t: gt, p: gp, s: gq }; }
        frame(st.sign);
      }
      let bs = st.psi;
      if (st.goal) {
        bt = st.goal.t; bp = st.goal.p; if (st.goal.s != null) bs = st.goal.s;
        if (Math.abs(bt - st.theta) < 0.03 && Math.abs(Math.atan2(Math.sin(bp - st.phi), Math.cos(bp - st.phi))) < 0.03) st.goal = st.goal.then || null;
        // spec.track: vật cầm đang chạy (máy rút khỏi giá, xoay ra): đích dò thưa vài khung trước đã lệch, bám nghiệm cục bộ nếu tốt hơn bước trôi về đích
        // (không thì tay trôi về nghiệm cũ, chi phí vọt ~50, cổ tay gập ~80°)
        if (spec.track && st.goal && !st.goal.rate) {
          const gp = Math.atan2(Math.sin(bp - st.phi), Math.cos(bp - st.phi));
          const cg = gripCost(arm, st.theta + (bt - st.theta) * 0.12, st.phi + gp * 0.12, range, hint, a, b, st.psi + (bs - st.psi) * 0.12);
          let lb = 1e9, lt = 0, lp = 0, ls = 0;
          for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
            const c = gripCost(arm, st.theta + i * 0.05, st.phi + j * 0.07, range, hint, a, b, st.psi);
            if (c < lb) { lb = c; lt = st.theta + i * 0.05; lp = st.phi + j * 0.07; ls = st.psi; }
          }
          if (lb < cg) { st.goal = null; bt = lt; bp = lp; bs = ls; }
        }
      } else {
        // tinh chỉnh quanh nghiệm cũ, đổi dần (tay nặng, không giật)
        for (let k = yM ? -1 : 0; k <= (yM ? 1 : 0); k++) for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
          const th = st.theta + i * 0.05, ph = st.phi + j * 0.07, ps = Math.max(-yM, Math.min(yM, st.psi + k * 0.05)), c = gripCost(arm, th, ph, range, hint, a, b, ps);
          if (c < best) { best = c; bt = th; bp = ph; bs = ps; }
        }
      }
      const rate = st.goal ? st.goal.rate || 0.12 : 0.35;   // chuyển sang nghiệm dò lại: trôi chậm, không vụt tay
      // đoạn trôi theo spec.ease: chặn tốc độ quay (trôi kiểu mũ thì bước đầu vọt cả khuỷu)
      const cap = st.goal && st.goal.rate ? 0.12 : 1e9;
      st.theta += Math.max(-cap, Math.min(cap, (bt - st.theta) * rate));
      let dp = bp - st.phi; dp = Math.atan2(Math.sin(dp), Math.cos(dp));
      st.phi += Math.max(-cap, Math.min(cap, dp * rate));
      st.psi += Math.max(-0.04, Math.min(0.04, (bs - st.psi) * rate));
    }
    st.cost = gripCost(arm, st.theta, st.phi, range, hint, a, b, st.psi);
    st.lastH = spec.stay ? _gH.clone() : null;
    // gripCost để lại nghiệm cuối trong các biến tạm: dựng xương từ đó
    const hz = _gZw.clone(), hy = _gY.clone(), hx = _gX.clone();
    poseArm(F, arm, _gS.clone(), _gEl.clone(), _gTc.clone(), _gH.clone(), { hx, hy, hz });
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
    gripSolve(F, arm, anchor.position, { axis: anchor.axis, palm: anchor.palm, range: anchor.range == null ? 1.2 : anchor.range, elbow: anchor.poleHint || defaultPole || null, hintK: anchor.hintK == null ? 1.2 : anchor.hintK, flip: anchor.flip !== false && !anchor.palm, key: 'anchor' });
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

  // VÙNG TRÚNG ĐẠN BÁM XƯƠNG: mỗi phần cơ thể là một viên thuốc (đoạn a-b bán kính r, toạ độ thế giới) gắn vào xương nên nằm, quỳ,
  // ngồi xe, vung tay đều đúng chỗ. Trong trận: ballistics lọc bằng hộp quanh người (hitAABB) rồi dò từng viên (segHit) -> vùng trúng.
  // zone: head | chest | belly | arm | leg (bảng sát thương theo vùng: SoldierEngine.WOUND.ZONE)
  // Kích thước đo theo lưới áo + giáp (1 đv = 12,5 cm): thân hai viên song song cho mặt cắt bè ngang 40 cm, dày 25 cm
  const _hpS = V(0, 0, 0);
  function hitParts(F) {
    let P = F._hitP;
    if (!P) { P = F._hitP = []; for (let i = 0; i < 24; i++) P.push({ zone: '', a: V(0, 0, 0), b: V(0, 0, 0), r: 0 }); }
    F.root.getWorldScale(_hpS);
    const sc = _hpS.y;
    let i = 0;
    const set = (zone, A, ax, ay, az, B, bx, by, bz, r) => { const p = P[i++]; p.zone = zone; p.a.set(ax, ay, az).applyMatrix4(A.matrixWorld); p.b.set(bx, by, bz).applyMatrix4(B.matrixWorld); p.r = r * sc; };
    set('head', F.head, 0, 0.72, 0, F.head, 0, 0.72, 0, 0.95);
    for (const sx of [-1, 1]) set('chest', F.chest, sx * 0.6, 1.25, 0, F.chest, sx * 0.6, 2.5, 0, 1.0);
    for (const sx of [-1, 1]) set('belly', F.torso, sx * 0.5, -0.35, 0, F.torso, sx * 0.5, 0.65, 0, 0.95);
    for (const sx of [-1, 1]) set('belly', F.hips, sx * 0.45, -1.6, 0.05, F.hips, sx * 0.45, -0.9, 0.05, 0.95);
    for (const A of F.arms) {
      set('arm', A.up, 0, 0, 0, A.fore, 0, 0, 0, 0.55);
      set('arm', A.fore, 0, 0, 0, A.hand, 0, 0, 0, 0.45);
      set('arm', A.hand, 0, 0.1, 0, A.hand, 0, 0.75, 0, 0.33);
    }
    for (const L of F.legs) {
      set('leg', L.leg, 0, 0, 0, L.knee, 0, 0, 0, 0.7);
      set('leg', L.knee, 0, 0, 0, L.ankle, 0, 0, 0, 0.55);
      set('leg', L.ankle, 0, -0.4, 0.25, L.ankle, 0, -0.4, -1.15, 0.38);
    }
    P.length = i;
    return P;
  }
  // tia (gốc ro, hướng đơn vị rd) cắt viên thuốc a-b bán kính r: khoảng cách tới điểm vào, -1 nếu trượt (gốc nằm trong thì 0)
  const _cBA = V(0, 0, 0), _cOA = V(0, 0, 0), _cOC = V(0, 0, 0);
  function rayCapsule(ro, rd, a, b, r) {
    _cBA.subVectors(b, a); _cOA.subVectors(ro, a);
    const baba = _cBA.dot(_cBA), bard = _cBA.dot(rd), baoa = _cBA.dot(_cOA), rdoa = rd.dot(_cOA), oaoa = _cOA.dot(_cOA);
    // gốc tia nằm trong viên thuốc
    const hIn = baba > 1e-9 ? Math.max(0, Math.min(1, baoa / baba)) : 0;
    if (_cOC.copy(a).addScaledVector(_cBA, hIn).distanceToSquared(ro) <= r * r) return 0;
    let best = -1;
    const A = baba - bard * bard;
    if (baba > 1e-9 && A > 1e-9) {   // thân trụ
      const B = baba * rdoa - baoa * bard, C = baba * oaoa - baoa * baoa - r * r * baba, h = B * B - A * C;
      if (h >= 0) { const t = (-B - Math.sqrt(h)) / A, y = baoa + t * bard; if (t >= 0 && y > 0 && y < baba) best = t; }
    }
    for (const c of baba > 1e-9 ? [a, b] : [a]) {   // hai chỏm cầu
      _cOC.subVectors(ro, c);
      const bb = rd.dot(_cOC), cc = _cOC.dot(_cOC) - r * r, h = bb * bb - cc;
      if (h >= 0) { const t = -bb - Math.sqrt(h); if (t >= 0 && (best < 0 || t < best)) best = t; }
    }
    return best;
  }
  // đoạn đạn bay (x0..z1, thế giới) cắt người: { t: 0..1 trên đoạn, zone, point } hoặc null
  const _sgO = V(0, 0, 0), _sgD = V(0, 0, 0);
  function segHit(F, x0, y0, z0, x1, y1, z1) {
    if (!F || !F.root || !F.legs) return null;
    F.root.updateMatrixWorld(true);
    _sgO.set(x0, y0, z0); _sgD.set(x1 - x0, y1 - y0, z1 - z0);
    const L = _sgD.length();
    if (L < 1e-6) return null;
    _sgD.multiplyScalar(1 / L);
    let best = Infinity, zone = null;
    for (const p of hitParts(F)) {
      const t = rayCapsule(_sgO, _sgD, p.a, p.b, p.r);
      if (t >= 0 && t <= L && t < best) { best = t; zone = p.zone; }
    }
    if (!zone) return null;
    const point = _sgO.clone().addScaledVector(_sgD, best);
    // trúng thân mà đúng ô tấm giáp trước / sau (tấm sứ 30 x 33 cm, hệ ngực: |x| <= 1,25, y 0,14..2,76, như khối cứng súng - giáp bodyPush): tấm đỡ
    if (zone === 'chest' || zone === 'belly') {
      const c = F.chest.worldToLocal(point.clone());
      if (Math.abs(c.x) <= PLATE_HIT.x && c.y >= PLATE_HIT.y0 && c.y <= PLATE_HIT.y1 && Math.abs(c.z) >= PLATE_HIT.z) zone = 'plate';
    }
    return { t: best / L, zone, point };
  }
  const PLATE_HIT = { x: 1.25, y0: 0.14, y1: 2.76, z: 0.45 };
  // hộp bao các viên thuốc trong hệ đơn vị (gốc ox, oy, oz; quay theo hướng thân ang, cùng phép đổi của Strongholds.segUnitBox) + lề pad
  function hitAABB(F, ox, oy, oz, ang, pad = 0, out = {}) {
    const c = Math.cos(ang || 0), s = Math.sin(ang || 0);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const p of hitParts(F)) for (const q of [p.a, p.b]) {
      const dx = q.x - ox, dz = q.z - oz, lx = dx * c - dz * s, ly = q.y - oy, lz = dx * s + dz * c, r = p.r + pad;
      if (lx - r < x0) x0 = lx - r; if (lx + r > x1) x1 = lx + r;
      if (ly - r < y0) y0 = ly - r; if (ly + r > y1) y1 = ly + r;
      if (lz - r < z0) z0 = lz - r; if (lz + r > z1) z1 = lz + r;
    }
    out.minX = x0; out.maxX = x1; out.minY = y0; out.maxY = y1; out.minZ = z0; out.maxZ = z1;
    return out;
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
  // Điểm tiếp xúc phải nằm trên đáy lưới đế thật. bootProf('sole') đặt đáy
  // cao hơn tâm quy ước ANKLE_H 0,05 đv; dùng -ANKLE_H như trước tạo một
  // "đế ảo" thấp hơn giày, khiến phần giày nhìn thấy lơ lửng trên mặt đất.
  const SOLE_Y = -ANKLE_H + 0.05;
  const SOLE = [V(0, SOLE_Y, 0.45), V(0, SOLE_Y, -0.3), V(0, SOLE_Y, -1.05), V(0, SOLE_Y, -1.45)];

  function setLeg(L, hip, knee, foot, splay = 0.035) {
    L.leg.rotation.set(hip, 0, L.sx * splay);
    L.knee.rotation.set(knee, 0, 0);
    L.ankle.rotation.set(foot - hip - knee, 0, 0);
  }

  // hạ / nâng cả thân để đế giày thấp nhất chạm đúng FOOT_Y (hệ root) — chân luôn bám đất ở mọi tư thế
  // ĐI NHỜ XE: súng đeo chéo sau lưng (hệ torso), tay rời súng đặt lên đùi / bám xe (F.stow, F.climb.hands). Lúc ngắm thì tay kéo súng về lại
  const SLING = {
    gl: { p: V(0.15, 0.75, 2.45), r: [1.25, 0, 0.5] },
    rpg: { p: V(0.3, 0.2, 3.15), r: [1.3, 0, 0.42] },
    atr: { p: V(0.25, 0.9, 2.7), r: [1.28, 0, 0.42] },
    rifle: { p: V(0.15, 0.75, 2.2), r: [1.25, 0, 0.5] }
  };
  const _stE = new THREE.Euler(), _stQ = new THREE.Quaternion(), _stH = V(0, 0, 0), _stT = V(0, 0, 0), _stS = V(0, 0, 0);
  function stowArms(F, dt, out) {
    const stowW = F.stow && !F._atrKL;   // quỳ thay băng súng bắn tỉa: đứng dậy hẳn rồi mới đeo súng (đang quỳ mà kéo súng về lưng thì khuỷu nhảy lúc bàn giao)
    const sk = F._stowK = F._snap ? (stowW ? 1 : 0) : c01((F._stowK || 0) + (stowW ? dt : -dt) * 3.5), C = F.climb, ck = C ? C.handK : 0;
    if (sk <= 0 && ck <= 0) return;
    const e = sk * sk * (3 - 2 * sk), R = F.rifle, B = SLING[F.weapon], Gb = F.grab, gk = F._grabK || 0, seatK = F._seatK || 0;
    if (R && B && e > 0) {
      _stE.set(B.r[0], B.r[1], B.r[2], 'YXZ'); _stQ.setFromEuler(_stE);
      R.position.lerp(B.p, e); R.quaternion.slerp(_stQ, e);
    }
    F.root.updateMatrixWorld(true);
    const inv = _inv(F.root);
    for (const arm of F.arms) {
      const i = arm.s < 0 ? 0 : 1, L = F.legs[i], sw = i ? out.aR : out.aL, bend = out.aBend;
      arm.hand.getWorldPosition(_stH);
      // đùi (+ -z của đùi là mặt trên khi đùi gập ra trước): bàn tay đặt gần gối; bám xe thì theo điểm xe giao
      // đứng / đi (đeo súng sau lưng): tay buông, đánh theo bước như swingArms; ngồi thì đặt lên đùi
      F.chest.localToWorld(_stT.set(arm.s * (1.75 - bend * 0.25), -1.25 + bend * 1.6 + Math.abs(sw) * 0.35, 0.05 - sw * (1.5 + bend)));
      if (seatK > 0) _stT.lerp(L.leg.localToWorld(_stS.set(0, -THIGH_L * 0.68, -1.0)), seatK);
      if (gk > 0 && Gb && (Gb.side < 0) === (arm.s < 0)) _stT.lerp(Gb.frame.localToWorld(_stS.copy(Gb.p)), gk);
      if (ck > 0) _stT.lerp(C.frame.localToWorld(C.hands[i].clone()), ck);
      _stH.lerp(_stT, Math.max(e, ck));
      // khuỷu nối từ chỗ khuỷu của thế cầm súng (hold vừa đặt) sang gợi ý thế đeo: dùng ngay gợi ý đeo thì khuỷu nhảy ~2,6 đv trong một khung lúc súng rời lưng / về lưng
      const stP = F.chest.localToWorld(V(arm.s * 2.6, -0.6, 2.4)).applyMatrix4(inv);
      if (e < 1 && !seatK && !gk && !ck) stP.lerp(arm.fore.position, 1 - e);
      solveArm(F, arm, _stH, stP, null);
    }
  }
  const SEAT_HIP = 1.05;   // khớp hông cao hơn mặt ngồi (đv): bề dày mông
  const SEAT_POSE = { hip: 1.4, splay: 0.14, knee: 1.5, ankle: 0.15 };
  // BÁM ĐẤT TỪNG BÀN CHÂN (F.groundIK = [độ cao mặt đất dưới từng chân so với gốc người, hệ root], SoldierEngine đặt):
  // hông hạ theo chân thấp, chân cao gập gối (IK hai đoạn đùi - cẳng), bàn chân giữ hướng cũ. Không có thì cả hai chân đặt
  // ở cùng độ cao gốc người -> đứng mép vỉa hè / sườn dốc một chân chìm xuống đất
  const _ftH = V(0, 0, 0), _ftK = V(0, 0, 0), _ftA = V(0, 0, 0), _ftT = V(0, 0, 0), _ftQ = new THREE.Quaternion(), _ftQ2 = new THREE.Quaternion(), _ftQA = new THREE.Quaternion();
  function legLift(F, L, d) {
    if (d < 1e-3) return;
    F.root.updateMatrixWorld(true);
    L.ankle.getWorldQuaternion(_ftQA);
    L.leg.getWorldPosition(_ftH); L.knee.getWorldPosition(_ftK); L.ankle.getWorldPosition(_ftA);
    const a = _ftH.distanceTo(_ftK), b = _ftK.distanceTo(_ftA), ws = F.root.scale.y || 1;
    _ftT.copy(_ftA); _ftT.y += d * ws;
    const cosI = (D) => Math.max(-1, Math.min(1, (a * a + b * b - D * D) / (2 * a * b)));
    // gối gập quá 135° thì bậc quá cao so với chân: dừng ở 135°, bàn chân chạm lún vào mép bậc một chút (gối 169° trông như gãy)
    const D0 = _ftH.distanceTo(_ftA), D = Math.max(Math.sqrt(a * a + b * b - 2 * a * b * Math.cos(Math.PI - LEG_KNEE_MAX)), Math.min(_ftH.distanceTo(_ftT), (a + b) * 0.985));
    L.knee.rotation.x -= Math.acos(cosI(D0)) - Math.acos(cosI(D));   // gối gập thêm (rotation.x < 0 là gập)
    L.knee.updateMatrixWorld(true);
    L.ankle.getWorldPosition(_ftA);
    // xoay đùi quanh khớp hông để cổ chân tới đúng điểm cần
    _ftQ.setFromUnitVectors(_ftA.sub(_ftH).normalize(), _ftT.sub(_ftH).normalize());   // xoay trong không gian
    L.leg.getWorldQuaternion(_ftQ2);
    _ftQ.multiply(_ftQ2);                                                           // hướng đùi mới trong không gian
    L.leg.parent.getWorldQuaternion(_ftQ2);
    L.leg.quaternion.copy(_ftQ2.invert().multiply(_ftQ));
    L.leg.updateMatrixWorld(true);
    // bàn chân giữ nguyên hướng trong không gian (không bị nghiêng theo đùi / gối mới), trong tầm cổ chân:
    // ống chân đổ tới nhiều mà bàn chân vẫn phẳng thì cổ chân gập mu tới 139° -> nhón bằng đầu bàn chân lên mép bậc
    L.knee.getWorldQuaternion(_ftQ2);
    L.ankle.quaternion.copy(_ftQ2.invert().multiply(_ftQA));
    legRomClamp(L);
    L.ankle.updateMatrixWorld(true);
  }
  // giữ hông (duỗi), cổ chân (gập mu / duỗi) trong tầm người sau các bước đặt xương bằng quaternion (bám đất, khoá bàn chân)
  const LEG_KNEE_MAX = 135 * DEG, LEG_HIP_EXT = 30 * DEG, LEG_HIP_FLEX = 125 * DEG, LEG_ANK_UP = 28 * DEG, LEG_ANK_DOWN = 48 * DEG, _lrV = V(0, 0, 0), _lrQ = new THREE.Quaternion(), _lrX = V(1, 0, 0);
  function legRomClamp(L) {
    _lrV.set(0, -1, 0).applyQuaternion(L.leg.quaternion);   // hướng đùi trong hệ hông
    const ext = -Math.atan2(-_lrV.z, -_lrV.y);
    if (ext > LEG_HIP_EXT) { L.leg.quaternion.premultiply(_lrQ.setFromAxisAngle(_lrX, ext - LEG_HIP_EXT)); jwClip('hông ' + (L.sx < 0 ? 'trái' : 'phải') + ' duỗi', ext / DEG); }
    else if (-ext > LEG_HIP_FLEX) { L.leg.quaternion.premultiply(_lrQ.setFromAxisAngle(_lrX, LEG_HIP_FLEX + ext)); jwClip('hông ' + (L.sx < 0 ? 'trái' : 'phải') + ' gập', -ext / DEG); }
    _lrV.set(0, 0, -1).applyQuaternion(L.ankle.quaternion);   // mũi chân trong hệ cẳng chân
    const up = Math.atan2(_lrV.y, -_lrV.z);
    if (up > LEG_ANK_UP) { L.ankle.quaternion.premultiply(_lrQ.setFromAxisAngle(_lrX, LEG_ANK_UP - up)); jwClip('cổ chân ' + (L.sx < 0 ? 'trái' : 'phải') + ' gập mu', up / DEG); }
    else if (up < -LEG_ANK_DOWN) { L.ankle.quaternion.premultiply(_lrQ.setFromAxisAngle(_lrX, -LEG_ANK_DOWN - up)); jwClip('cổ chân ' + (L.sx < 0 ? 'trái' : 'phải') + ' duỗi', -up / DEG); }
  }
  function groundFeet(F) {
    const g = F.groundIK;
    if (!g || F.seated || (F._proneK || 0) > 0.3 || F.isDead) return;
    // Min trơn: khi chân thấp đổi bên, hông không đổi vận tốc đột ngột. Sai số tối đa
    // 0,25 cm ở đúng điểm hai chân bằng nhau, nhỏ hơn độ dày đế nhưng bỏ được cú nấc.
    const gd = g[0] - g[1], base = 0.5 * (g[0] + g[1] - Math.sqrt(gd * gd + 0.04 * 0.04));
    if (Math.abs(base) > 1e-3) { F.hips.position.y += base; F.torso.position.y += base; F.root.updateMatrixWorld(true); }
    F.legs.forEach((L, i) => legLift(F, L, g[i] - base));
  }
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
    const target = FOOT_Y - minY + lift, dt = F._dtA || 0;
    // Giảm chấn hai chiều. Cho phép sai số tối đa 0,06 đv (7,5 mm) trong vài khung để
    // pha bay của chạy không bật hông tức thời; nhỏ hơn độ dày đế nên không lộ xuyên đất.
    if (F._snap || !dt || F._plantY == null) F._plantY = target;
    else {
      const tau = target > F._plantY ? 0.035 : 0.055;
      F._plantY += (target - F._plantY) * (1 - Math.exp(-dt / tau));
      // Khi cả hai chân đang bay, không kẹp sai số theo mặt đất: kẹp ở đây chính là
      // nguyên nhân tạo một bước nhảy vận tốc hông giữa pha bay của chạy.
      if (lift <= 1e-3) F._plantY = Math.max(target - 0.06, Math.min(target + 0.10, F._plantY));
    }
    const dy = F._plantY;
    F.hips.position.y += dy; F.torso.position.y += dy;
    F.root.updateMatrixWorld(true);
  }

  // súng (hệ torso) + hai tay nắm súng
  const RIFLE_POSE = {
    low: { p: V(0.55, 1.35, -2.0), r: [-0.42, 0.45, 0.3] },
    // sẵn sàng chiến đấu (low ready): báng tì hốc vai, nòng chúc ~35° ra trước-xuống, nâng lên ngắm chỉ trong tích tắc
    ready: { p: V(-0.3, 1.55, -2.1), r: [-0.58, 0.52, 0.12] },   // nòng ~32° xuống so với đất (đã bù độ đổ người), chéo thân ~17°
    port: { p: V(0.45, 1.7, -1.9), r: [-0.05, 0.85, 0.55] },
    // giải bằng ràng buộc trên chính mô hình (probe): mép dưới đệm báng tì hốc vai phải ngoài tấm giáp (nhún vai), nòng chĩa
    // thẳng trước; đầu đưa ra trước / sang phải + cúi nghiêng áp má để mắt phải nằm đúng trục kính ngắm (lệch ~1 mm)
    aim: { p: V(-0.151, 3.658, -2.968), r: [0.1, 0.5, 0.0] },
    // thả lỏng khi không có địch (F.relax): hạ súng thấp trước hông, nòng chúc xuống đất, tay trùng
    relax: { p: V(0.75, 0.75, -1.8), r: [-0.8, 0.55, 0.35] }
  };
  // Bảng vũ khí bộ binh: build (dựng lưới, gốc tại tay cầm chính, nòng -z), grip (điểm nắm tay phải / trái + trục cán, hệ vũ khí),
  // poses (thế cầm trong hệ torso: low = súng chúc thấp, port = chéo ngực khi chạy, aim = tì vai ngắm).
  // Thêm vũ khí mới (súng bắn tỉa, ống phóng chống tăng vác vai, súng phóng lựu, ống cối...) = thêm một mục với đủ 3 thế cầm.
  // kit: đồ đeo đi kèm vũ khí (băng đạn, ba lô đạn), dựng lên chest sau khi đã dồn áo giáp.
  const WEAPONS = {
    gl: { build: buildGL, grip: GL, poses: RIFLE_POSE, kit: glKit, recoil: 2.2, recoilEnv: true, name: 'Súng phóng lựu 40 mm ổ quay 6 viên', ammo: 'gl40' },
    rifle: { build: buildRifle, grip: RIFLE, poses: RIFLE_POSE },
    rpg: { build: buildRPG, grip: RPG, poses: Object.assign({}, RIFLE_POSE, { ready: { p: V(0.9, 2.6, -1.2), r: [-0.22, 0.3, 0.0] } }), kit: rpgKit, recoil: 1.7, name: 'Ống phóng chống tăng 85 mm', ammo: 'rpg85' },
    // cối có thế cầm riêng (hold): vác vai khi di chuyển, đặt đế xuống đất khi bắn. fire: thân cúi về nòng lúc quỳ bắn; không bắn đứng
    // súng bắn tỉa chống tăng: vác vai khi di chuyển, nằm sấp trên chân chống khi bắn (prone = góc đổ của hông + độ cao thân)
    atr: {
      recoil: 2.6, recoilEnv: true, painted: (M, m) => m === M.wGun || m === M.glPark || m === M.wPoly, build: buildATR, grip: ATR, poses: RIFLE_POSE, kit: atrKit, hold: holdATR, pose: atrPose, mass: 25, stance: 'aim', prone: { hipX: -1.5, y: FOOT_Y + 1.08, neck: -1.0, headX: 0.15, headLift: 0.08 }, name: 'Súng bắn tỉa hạng nặng chống tăng', ammo: 'atr',
      fire: { tRx: 0.14, tRy: 0, tRz: 0, pRy: 0, pRz: 0, px: 0, chRx: 0.18, chRy: 0, chRz: 0, hRx: 0.85, hRy: 0, hRz: -0.1, lH: 0.02, lHz: 0.1, lHy: 0.22, lK: 0.1, lA: -0.8, lAy: 0, rH: 0.02, rHz: 0.14, rHy: -0.22, rK: 0.1, rA: -0.8, rAy: 0, shLy: 0, shLz: 0, shRy: 0, shRz: 0, lift: 0 }
    },
    // UAV cảm tử: không cầm vũ khí lúc đi (ống trên lưng); phóng ở thế quỳ theo trình tự riêng (hold + pose)
    kami: { build: buildKamiTube, grip: KAMI, poses: RIFLE_POSE, kit: kamiKit, hold: holdKami, keepStance: kamiStance, pose: kamiPose, noCheek: true, name: 'UAV cảm tử', ammo: 'kami' },
  };
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
  // hh + fz chọn để đùi đưa ra sau được khi đẩy đất (đi: đùi -10..29°, gối 11..52°, cổ chân -12..15°): hông thấp, vòng bước lệch trước thì chân sau không qua khỏi thân
  // duty: tỉ lệ chu kỳ chân chạm đất; S: sải cả chu kỳ (đv) = speed * cycle; hh: độ cao khớp hông trên đất (gối luôn chùng, trọng tâm thấp, đi chắc);
  // bob: biên độ nhấp nhô; clear: độ nhấc bàn chân; pitch: góc bàn chân theo % chu kỳ (+ hếch mũi)
  const GAITS = {
    walk: {
      cycle: 1.06, speed: 8.4, duty: 0.62, hh: 7.14, fz: 0.9, aMax: 0.26, aOff: -0.2, bob: 0.08, clear: 0.3, lean: -0.12, yaw: 4, roll: 1.8, shift: 0.14, wide: -0.012, toeOut: 0.12, arm: 0.9, armBend: 0.15, gun: 'ready', spine: 0.03, spineA: 0.025,
      twist: 8, sway: 3.4, nod: 2.6, sh: 0.1, shY: 0.07, gs: 0.05, gb: 0.06, gRoll: 2.2, scan: 0.3,
      pitch: periodic([[0, 14], [7, 0], [34, 0], [50, -16], [62, -48], [72, -36], [84, -6], [94, 10]])
    },
    // đi tuần chiến thuật: thấp người, thân đổ trước, bước lướt êm, súng sẵn sàng
    patrol: {
      cycle: 1.3, speed: 6.05, duty: 0.66, hh: 6.86, fz: 1.3, aMax: 0.38, aOff: -0.16, bob: 0.06, clear: 0.26, lean: -0.26, yaw: 3, roll: 1.2, shift: 0.10, wide: 0.0, toeOut: 0.14, arm: 0.6, armBend: 0.3, gun: 'ready', spine: 0.04, spineA: 0.015,
      twist: 5, sway: 2.4, nod: 1.8, sh: 0.06, shY: 0.04, gs: 0.03, gb: 0.03, gRoll: 1.4, scan: 0.5,
      pitch: periodic([[0, 8], [8, 0], [42, 0], [56, -15], [66, -40], [76, -28], [88, -2], [96, 6]])
    },
    // chạy mang trang bị: đổ người, sải nặng, đạp đất mạnh; thân thấp nhất giữa pha trụ, cao nhất lúc bay
    run: {
      cycle: 0.74, speed: 19, duty: 0.38, hh: 6.8, bob: -0.2, clear: 2.4, fz: 1.8, aMax: 0.52, aOff: -0.06, lean: -0.5, yaw: 8, roll: 2.8, shift: 0.08, wide: -0.02, toeOut: 0.08, arm: 1.6, armBend: 1.05, gun: 'ready', spine: 0.06, spineA: -0.035,
      twist: 13, sway: 4.5, nod: 3.4, sh: 0.2, shY: 0.13, gs: 0.2, gb: 0.15, gRoll: 7, scan: 0.1,
      pitch: periodic([[0, 6], [6, 0], [22, -12], [38, -58], [52, -70], [70, -62], [88, -22], [96, 0]])
    }
  };
  // tốc độ tiến (đv/giây): đúng bằng tốc độ lùi của chân trụ trong quỹ đạo nên game dời gốc theo số này thì bàn chân không trượt
  const SPINE_MID_Y = 1.1;
  // khuỷu: tự gập được ~145°, bị ép tối đa ~160°. Biên cứng 160°: RPG cầm rất sát vai (151-160°), chặn 145° thì bàn tay trượt khỏi tay cầm.
  const ELBOW_ACTIVE = 145 * D2R, ELBOW_PASSIVE = 160 * D2R;
  const elbowMinD = (a, b, flex = ELBOW_PASSIVE) => Math.sqrt(a * a + b * b + 2 * a * b * Math.cos(flex));
  const GAIT_SPEED = { walk: GAITS.walk.speed, patrol: GAITS.patrol.speed, run: GAITS.run.speed };

  // nhiễu mượt nhỏ cho cử động sống (lắc người, liếc mắt)
  const wob = (t, a, b, c) => Math.sin(t * a) * 0.5 + Math.sin(t * b + 1.3) * 0.3 + Math.sin(t * c + 2.1) * 0.2;

  const POSE_KEYS = ['lH', 'lHz', 'lHy', 'lK', 'lA', 'rH', 'rHz', 'rHy', 'rK', 'rA', 'px', 'pRy', 'pRz', 'lift', 'tRx', 'tRy', 'tRz',
    'chRx', 'chRy', 'chRz', 'gx', 'gy', 'gz', 'gRoll', 'shLy', 'shLz', 'shRy', 'shRz', 'hRx', 'hRy', 'hRz', 'gLow', 'gPort', 'gAim', 'gReady', 'gYaw', 'gPitch', 'aL', 'aR', 'aBend', 'elb', 'lAy', 'rAy', 'lAz', 'rAz'];
  const newPose = () => { const o = {}; for (const k of POSE_KEYS) o[k] = 0; return o; };

  // điểm thấp nhất của đế (so với cổ chân) khi bàn chân nghiêng th
  // TẦM KHỚP NGƯỜI THẬT (rad): chặn mềm gần biên, không khựng. Áp cho mọi dáng ở applyPose; quỹ đạo chân được lọc trước để hiếm khi chạm biên.
  // cột sống tính từng đoạn (thắt lưng / ngực), đầu tính so với ngực.
  const ROM = {
    hipX: [-0.5, 2.1], hipZ: [-0.6, 0.7], hipY: [-0.75, 0.75], knee: [0, 2.45], ankleX: [-0.87, 0.52], ankleY: [-0.5, 0.5], ankleZ: [-0.4, 0.4],
    spineX: [-0.75, 0.35], spineY: [-0.65, 0.65], spineZ: [-0.45, 0.45], chestX: [-0.65, 0.3], chestY: [-0.65, 0.65], chestZ: [-0.45, 0.45],
    headX: [-0.9, 0.9], headY: [-1.25, 1.25], headZ: [-0.6, 0.6]
  };
  const softLim = (v, L, m = 0.08) => {
    const a = L[0], b = L[1];
    if (v > b - m) return b - m * Math.exp(-(v - b + m) / m);
    if (v < a + m) return a + m * Math.exp((v - a - m) / m);
    return v;
  };
  const soleLow = th => { const c = Math.cos(th), sn = Math.sin(th); let m = Infinity; for (const P of SOLE) m = Math.min(m, P.y * c - P.z * sn); return m; };
  // vị trí cổ chân (z trước âm, y so với đất) và góc bàn chân tại pha p của chân
  const SOLE_TIP_TH = -Math.atan2(SOLE[3].y - SOLE[2].y, SOLE[2].z - SOLE[3].z);   // nhấc gót quá góc này thì đầu mũi giày chạm đất thay cho bầu bàn chân
  // sk: hệ số sải (0 = dậm chân tại chỗ khi xoay người), thk: hệ số góc bàn chân (bước ngang / tại chỗ ít lăn gót - mũi)
  function footPath(G, p, sk = 1, thk = 1) {
    p -= Math.floor(p);
    const S = G.speed * G.cycle * sk, b = G.duty;
    const stance = (q) => {
      const th = G.pitch(q) * thk, c = Math.cos(th), sn = Math.sin(th);
      // Lăn gót -> bầu -> mũi trong một dải ~7°. Đổi thẳng chỉ số SOLE làm vận tốc
      // cổ chân gãy đúng lúc chạm đất dù vị trí nhìn gần như liên tục.
      const hk = sm((th - 0.015) / 0.12), tk = sm((-th - 0.015) / 0.12);
      let pz = SOLE[2].z + (SOLE[3].z - SOLE[2].z) * tk;
      pz += (SOLE[0].z - pz) * hk;
      // fz: dời cả vòng bước ra sau hông -> hông vượt trước bàn chân trụ, cả người đổ trước (chỉ đổ thân trên thì hông ngồi lùi như ngồi xổm)
      return { z: S * (q - b / 2) + (G.fz || 0) + pz - (SOLE_Y * sn + pz * c), y: -soleLow(th), th };   // điểm tựa lăn liên tục và đứng yên so với đất
    };
    if (p < b) return stance(p);
    const A = stance(b), B = stance(0), u = (p - b) / (1 - b), u2 = u * u, u3 = u2 * u;
    // Hermite: rời đất và tiếp đất với đúng vận tốc chân trụ (không giật khi đổi pha)
    const m = S * (1 - b);
    const z = (2 * u3 - 3 * u2 + 1) * A.z + (u3 - 2 * u2 + u) * m + (-2 * u3 + 3 * u2) * B.z + (u3 - u2) * m;
    // đỉnh nhấc chân sớm (~38% pha vung); u^0.72 cũ có độ dốc vô hạn lúc rời đất -> bàn chân giật lên
    const th = G.pitch(p) * thk, arc = Math.pow(Math.sin(Math.PI * (u + 0.51 * u * (1 - u))), 1.3);
    const y = A.y + (B.y - A.y) * u + G.clear * arc;
    // khe hở chống lún mũi giày: tăng dần từ 0 (khe cố định 0,015 làm bàn chân nhảy cóc lúc rời / chạm đất)
    const floor = -soleLow(th) + 0.015 * Math.sin(Math.PI * u), d = y - floor, band = 0.035;
    // Max đa thức liên tục đạo hàm trong dải hẹp, tránh bàn chân khựng khi cung vung
    // vừa chạm giới hạn chống lún mũi giày.
    const yy = Math.abs(d) >= band ? Math.max(y, floor) : Math.max(y, floor) + (band - Math.abs(d)) ** 2 / (4 * band);
    return { z, y: yy, th };
  }
  const LEG_MAX = THIGH_L + SHIN_L - 0.02, LEG_SOFT = 0.12;
  const softReach = h => h <= LEG_MAX - LEG_SOFT ? h : LEG_MAX - LEG_SOFT * Math.exp(-(h - LEG_MAX + LEG_SOFT) / LEG_SOFT);
  // góc hông / gối / cổ chân của một chân tại pha ph, bàn chân ở f
  function legAngles(G, ph, f) {
    const Hy = G.hh + G.bob * Math.cos(4 * Math.PI * (ph - G.duty / 2)), dy = Hy - f.y, x = f.x || 0, d = softReach(Math.hypot(f.z, dy, x));
    const K = Math.PI - Math.acos(Math.max(-1, Math.min(1, (THIGH_L * THIGH_L + SHIN_L * SHIN_L - d * d) / (2 * THIGH_L * SHIN_L))));
    if (!x) {
      const al = Math.atan2(-f.z, dy), be = Math.acos(c01((THIGH_L * THIGH_L + d * d - SHIN_L * SHIN_L) / (2 * THIGH_L * d))), H = al + be;
      return { H, K, A: f.th - H + K, Z: 0 };
    }
    // bàn chân lệch ngang (bước ngang / chéo): đùi dạng Z trước, gập X sau, đúng thứ tự Euler 'YXZ' của đùi
    const a = THIGH_L + SHIN_L * Math.cos(K), b = SHIN_L * Math.sin(K), Z = Math.asin(Math.max(-0.95, Math.min(0.95, x / a)));
    const H = wrapPi(Math.atan2(f.z, -dy) - Math.atan2(b, -a * Math.cos(Z)));
    return { H, K, A: f.th - H + K, Z };
  }
  const wrapPi = a => a - 2 * Math.PI * Math.floor((a + Math.PI) / (2 * Math.PI));
  // Góc bàn chân khai báo tay không biết gối / hông đang ở đâu, nên cổ chân suy ra có thể vượt tầm (chạy từng hếch 59°). Lọc trước một lần:
  // cổ chân quá giới hạn thì đổi góc bàn chân; chân trụ tự nhấc gót sớm hơn đúng như người thật. Gần lúc rời đất ép duỗi mũi (đạp đất).
  function limitGaitAnkles(G) {
    const N = 240, tab = new Float64Array(N), next = new Float64Array(N), b = G.duty;
    for (let i = 0; i < N; i++) tab[i] = G.pitch(i / N);
    G.pitch = (ph) => { ph -= Math.floor(ph); const x = ph * N, i = Math.floor(x) % N, u = x - Math.floor(x); return tab[i] + (tab[(i + 1) % N] - tab[i]) * u; };
    for (let it = 0; it < 40; it++) {
      for (let i = 0; i < N; i++) {
        const p = i / N, A = legAngles(G, p, footPath(G, p)).A;
        const off = sm((p - (b - 0.1)) / 0.08) * sm((b + 0.14 - p) / 0.1), hi = G.aMax + (G.aOff - G.aMax) * off;
        next[i] = tab[i] + 0.3 * (Math.min(hi, Math.max(-0.6, A)) - A);
      }
      for (let i = 0; i < N; i++) tab[i] = 0.25 * next[(i + N - 1) % N] + 0.5 * next[i] + 0.25 * next[(i + 1) % N];
    }
  }
  for (const m in GAITS) limitGaitAnkles(GAITS[m]);
  // rho: hướng bước so với mặt hông (rad, + = sang phải), sk: hệ số sải (0 = dậm tại chỗ)
  function gaitPose(o, G, ph, rho = 0, sk = 1) {
    let low = Infinity;
    const cr = Math.cos(rho), sr = Math.sin(rho), thk = 0.35 + 0.65 * sk * Math.abs(cr);
    for (const L of [0, 1]) {
      const key = L ? 'r' : 'l', sx = L ? 1 : -1, f = footPath(G, ph + L * 0.5, sk, thk);
      // quay vòng bước quanh tâm (fz) theo hướng bước: bàn chân trụ lùi ngược hướng đi, kể cả đi ngang / chéo
      if (rho) { const s = f.z - G.fz; f.x = -s * sr; f.z = G.fz + s * cr; }
      // duỗi chân giới hạn mềm: cắt cứng ở chiều dài chân làm gối đang duỗi nhanh thì khựng đứng ngay trước khi gót chạm đất
      const { H, K, A, Z } = legAngles(G, ph + L * 0.5, f);
      o[key + 'H'] = H; o[key + 'K'] = K; o[key + 'A'] = A; o[key + 'Az'] = -Z;   // cổ chân lật ngược độ dạng đùi: đế giày vẫn áp phẳng
      // xoè mũi chân chủ yếu ở cổ chân: xoay cả đùi ra ngoài thì lúc gập gối cẳng chân quặt vào, bàn chân vung bắt chéo đường giữa (chân chữ X)
      o[key + 'Hz'] = G.wide + 0.045 * sm((K - 0.25) / 0.6) + sx * Z; o[key + 'Hy'] = -sx * G.toeOut * 0.25; o[key + 'Ay'] = -sx * G.toeOut * 0.75;   // chân vung dạng nhẹ theo độ gập gối: bàn chân đi thẳng, không quặt vào đường giữa
      low = Math.min(low, f.y + soleLow(f.th));
    }
    o.lift = Math.max(0, low);                    // pha bay: chân không chạm đất
    const c = Math.cos(2 * Math.PI * ph), s2 = Math.sin(2 * Math.PI * ph);
    o.pRy = -G.yaw * D2R * c;                    // hông bên chân bước ra trước xoay theo
    o.pRz = -G.roll * D2R * s2;                  // hông bên chân đang vung hạ xuống
    o.px = -G.shift * s2;                        // khung chậu dồn sang chân trụ
    // THÂN TRÊN: bụng xoay ít, ngực xoay nhiều ngược hông; thân đổ về chân trụ; mỗi lần chân chạm đất ngực gập nhẹ rồi ngẩng lại (đỡ tải);
    // đầu giữ thăng bằng, quan sát chậm hai bên; hai vai đưa trước / sau và nhấp xuống theo chân trụ
    const hit = q => { const d = (((ph - q) % 0.5) + 0.5) % 0.5; return Math.exp(-d / 0.11) * sm(d / 0.035) * sm((0.5 - d) / 0.08); };   // xung đỡ tải vào/ra êm, không gãy ở biên nửa chu kỳ
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
    o.shLy = -G.shY * 0.5 * (1 - s2) + 0.3 * G.shY; o.shRy = -G.shY * 0.5 * (1 + s2) + 0.3 * G.shY;   // hạ vai bên chân trụ bằng sin liên tục, không bật tại điểm đổi bên
    o.aL = Math.sin(2 * Math.PI * (ph + 0.5) - 0.3) * G.arm; o.aR = -o.aL; o.aBend = G.armBend;
    o.gLow = G.gun === 'low' ? 1 : 0; o.gPort = G.gun === 'port' ? 1 : 0; o.gReady = G.gun === 'ready' ? 1 : 0; o.elb = o.gReady * 0.7;   // khuỷu mở ra ngoài, không kẹp sườn
    // súng nặng: trễ nhịp ~0,1 chu kỳ so với thân, lắc ngang theo bước, nòng vẫn giữ hướng và quét theo mắt
    const lag = 2 * Math.PI * (ph - 0.1);
    if (G.gun) { o.shLz *= 0.3; o.shRz *= 0.3; }   // vai không đánh trước / sau theo bước khi hai tay ôm súng
    o.gx = G.gs * Math.sin(lag); o.gy = -G.gb * Math.cos(2 * lag); o.gz = 0.5 * G.gb * Math.sin(2 * lag); o.gRoll = G.gRoll * D2R * Math.sin(lag);
    o.gYaw = -0.8 * o.tRy + 0.35 * scan + 0.4 * G.gs * Math.cos(lag); o.gPitch = 0.5 * G.nod * D2R * hit(0.08);
  }

  // BƯỚC DỪNG: lúc hãm mà vẫn theo chu kỳ bước thì nhịp chậm lại còn độ dài bước giữ nguyên (chạy quay chậm, chân vung treo giữa trời khi người đã đứng).
  // Ở đây bàn chân có chỗ thật: chân trụ đứng yên trên đất (lùi theo thân), chân vung đặt xuống chỗ mà khi thân trượt hết đà v^2/2a thì nó về đúng vị trí đứng; chân kia bước lên nếu còn lệch.
  // F.wantStop, F.stopFrom, F.moveV, F.stopA, F.stopTo do engine đặt; kíp lái không đặt nên không chạy nhánh này.
  const legFK = (o, k) => { const H = o[k + 'H'], K = o[k + 'K']; return { z: -(THIGH_L * Math.sin(H) + SHIN_L * Math.sin(H - K)), dy: THIGH_L * Math.cos(H) + SHIN_L * Math.cos(H - K), th: o[k + 'A'] + H - K }; };
  const STOP_KEYS = ['l', 'r'], STOP_REACH = THIGH_L + SHIN_L - 0.08;
  function stopPlanner(F, out, dt, bk, gaitW) {
    let S = F._stp;
    if (F._snap || (F.lod && F.lod.cur > 1)) { F._stp = null; return; }
    if (!S) {
      if (!F.wantStop || !(F.stopFrom > 2)) return;
      const d = newPose();
      if (F.stopTo === 'aim') aimPose(d, 0, false); else idlePose(d, 0);
      const fk = STOP_KEYS.map(k => legFK(out, k)), dk = STOP_KEYS.map(k => legFK(d, k));
      const hy = out.lift + Math.max(...fk.map(f => f.dy - soleLow(f.th)));
      S = F._stp = { w: 1, T: 0, hy, lift: out.lift, hd: Math.max(...dk.map(f => f.dy - soleLow(f.th))), done: false, feet: fk.map((f, i) => {
        const y = hy - f.dy, air = y + soleLow(f.th) > 0.06, D = dk[i];
        return { z: f.z, y, th: f.th, dz: D.z, dth: D.th, n: 0, t: air ? 0 : null, dur: air ? 0.2 : 0, z0: f.z, y0: y, th0: f.th };
      }) };
    }
    const v = Math.max(0, F.moveV || 0), a = F.stopA || 52, r = v * v / (2 * a);
    S.T += dt; S.lift *= Math.exp(-dt / 0.05);
    S.hy += (S.hd - 0.9 * bk - S.hy) * (1 - Math.exp(-dt / 0.08));
    for (const f of S.feet) {
      if (f.t === null) { f.z += v * dt; f.th *= Math.exp(-dt / 0.18); f.y = -soleLow(f.th); continue; }   // hạ gót từ từ: chân đang kiễng đạp đất mà hạ nhanh thì cổ chân tụt, gối bật thẳng trong 1 khung
      f.t += dt;
      const u = Math.min(1, f.t / f.dur), e = u * u * (3 - 2 * u), left = Math.max(0, f.dur - f.t), vl = Math.max(0, v - a * left);
      const z1 = Math.max(f.dz - vl * vl / (2 * a), -Math.sqrt(Math.max(0, STOP_REACH * STOP_REACH - S.hy * S.hy)));
      f.z = f.z0 + (z1 - f.z0) * e; f.th = f.th0 + (f.dth - f.th0) * e;
      const yl = -soleLow(f.th);
      f.y = Math.max(yl, f.y0 + (yl - f.y0) * e + (Math.abs(z1 - f.z0) > 1 ? 0.35 * Math.sin(Math.PI * u) : 0));
      if (u >= 1) { f.t = null; f.y = yl; f.n++; }
    }
    const busy = S.feet.some(f => f.t !== null);
    if (!busy) {
      let best = null, be = 0.45;
      for (const f of S.feet) {
        if (f.n >= 2) continue;
        const over = Math.hypot(f.z, S.hy - f.y) > STOP_REACH - 0.1, err = over ? 9 : Math.abs(f.z + r - f.dz);
        if (err > be) { be = err; best = f; }
      }
      if (best) { best.t = 0; best.z0 = best.z; best.y0 = best.y; best.th0 = best.th; best.dur = Math.max(0.13, Math.min(0.26, 0.13 + 0.02 * Math.abs(best.z + r - best.dz))); }
      else if (v < 0.3 && (gaitW < 0.05 || S.T > 1.2)) S.done = true;
    }
    const cancel = !F.wantStop && (F.moveV || 0) > 1.5;
    S.w += ((S.done || cancel ? 0 : 1) - S.w) * (1 - Math.exp(-dt / 0.1));
    if ((S.done || cancel) && S.w < 0.01) { F._stp = null; return; }
    STOP_KEYS.forEach((k, i) => {
      const f = S.feet[i], dy = S.hy - f.y, d = Math.min(THIGH_L + SHIN_L - 0.02, Math.hypot(f.z, dy));
      const al = Math.atan2(-f.z, dy), be = Math.acos(c01((THIGH_L * THIGH_L + d * d - SHIN_L * SHIN_L) / (2 * THIGH_L * d)));
      const K = Math.PI - Math.acos(Math.max(-1, Math.min(1, (THIGH_L * THIGH_L + SHIN_L * SHIN_L - d * d) / (2 * THIGH_L * SHIN_L)))), H = al + be;
      out[k + 'H'] += (H - out[k + 'H']) * S.w; out[k + 'K'] += (K - out[k + 'K']) * S.w; out[k + 'A'] += (f.th - H + K - out[k + 'A']) * S.w;
    });
    out.lift += (S.lift - out.lift) * S.w;
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

  // Ngắm: lưng trên gập nhẹ về súng, nên cổ chỉ phải cúi ~45°. Đầu đặt theo góc quanh gốc cổ, chiều dài cổ gần như giữ nguyên.
  // (Trước đây dời thẳng đầu ra trước 10 cm trong hệ ngực: cổ giãn dài 32%, cúi tới 74°, quá tầm người.)
  const AIM_SHOULDER_BACK = 0.22;   // ngực gập đưa vai ra trước: vai phải lùi lại để báng vẫn tì đúng hốc vai
  const AIM_CHEST_RX = -0.18, AIM_HEAD_RX = -0.24 - AIM_CHEST_RX;
  const NECK_BASE_Y = 3.46;
  // chỉnh đầu (hệ ngực) để tâm thấu kính kính bảo hộ, chỗ mắt thật, nằm đúng trục ngắm y 0,78; đo bằng eye4.js
  const AIM_EYE_FIX = [-0.197, 0.184, 0.159];
  const AIM_NECK = (() => {
    const ca = Math.cos(-AIM_CHEST_RX), sa = Math.sin(-AIM_CHEST_RX), y0 = 3.678 - SPINE_MID_Y, z0 = -0.762;   // vị trí đầu cũ quy về hệ ngực đã gập, quanh khớp giữa lưng
    const y = y0 * ca - z0 * sa + SPINE_MID_Y - NECK_BASE_Y + AIM_EYE_FIX[1], z = y0 * sa + z0 * ca - 0.04 + AIM_EYE_FIX[2], x = 0.429 + AIM_EYE_FIX[0], len = Math.hypot(x, y, z);
    return { len, fwd: Math.atan2(-z, y), side: Math.asin(x / len) };
  })();
  const AIM_NECK_FLAT = (() => { const y = 3.678 - NECK_BASE_Y, z = -0.762 - 0.04, x = 0.429, len = Math.hypot(x, y, z); return { len, fwd: Math.atan2(-z, y), side: Math.asin(x / len) }; })();
  // vũ khí có kính lệch khỏi trục (grip.sight): đầu tính từ chính đường ngắm thay vì công thức cổ của súng trường
  const SIGHT_EYE = V(0.3, 0.66, -0.95), SIGHT_Z = V(0, 0, 1), _sgQ = new THREE.Quaternion(), _sgC = new THREE.Quaternion(), _sgR = new THREE.Quaternion(), _sgP = V(0, 0, 0), _sgE = V(0, 0, 0);
  const _hlD = V(0, 0, 0), _hlQ = new THREE.Quaternion();
  function headOnSight(F, sg, k) {
    F.root.updateMatrixWorld(true);
    const R = F.rifle, H = F.head;
    _sgQ.copy(F.chest.getWorldQuaternion(_sgC)).conjugate().multiply(R.getWorldQuaternion(_sgC)).multiply(_sgR.setFromAxisAngle(SIGHT_Z, sg.roll));
    H.quaternion.slerp(_sgQ, k);
    F.chest.worldToLocal(R.localToWorld(_sgP.copy(sg.eye)));
    H.position.lerp(_sgP.sub(_sgE.copy(SIGHT_EYE).multiply(H.scale).applyQuaternion(H.quaternion)), k);
  }
  function aimPose(o, t, kneel) {
    // thế bắn: chân trái trước, trọng tâm dồn trước; súng rung nhẹ theo nhịp thở & mạch (giữ thở)
    if (kneel) {
      o.lH = 1.62; o.lK = 1.62; o.lA = 0.0; o.lHz = 0.18; o.lHy = 0;
      o.rH = 0.08; o.rK = 1.81; o.rA = 0.25; o.rHz = 0.06; o.rHy = 0;   // gối sau chạm đất, mũi giày gập tì đất (thế quỳ bắn); cổ chân -81° cũ quá tầm người
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
    o.hRx = AIM_HEAD_RX; o.hRy = 0.04; o.hRz = -0.2; o.chRx = AIM_CHEST_RX;
    o.aBend = 0.15;
  }

  // QUỲ NGHỈ (F.kneelRest, engine đặt khi yên ắng): chân giữ thế quỳ, thân trên từ thế ngắm về thế sẵn sàng; k 0..1
  function kneelRestPose(o, k, t) {
    const K = 1 - k, br = Math.sin(t * 1.55);
    o.gAim *= K; o.gReady += k; o.elb += k;
    o.tRy += (-0.16 + 0.015 * wob(t, 0.19, 0.41, 0.83) - o.tRy) * k; o.tRx += (-0.1 + 0.006 * wob(t, 0.37, 0.61, 1.13) - o.tRx) * k;
    o.chRx += (0.02 - 0.012 * br - o.chRx) * k;
    o.hRx += (-0.02 + 0.02 * wob(t, 0.23, 0.47, 0.11) - o.hRx) * k; o.hRy += (0.16 + 0.12 * wob(t, 0.17, 0.29, 0.07) - o.hRy) * k; o.hRz *= K;
    o.shLy += 0.018 * br * k; o.shRy += 0.018 * br * k;
  }

  const SPINE_LOW = -0.75, SPINE_MID = SPINE_MID_Y, _sp = V(0, 0, 0);
  const LUMBAR_TWIST = 32 * DEG;
  function applyPose(F, o) {
    if (_jwOn) jwRaw(F, o);
    const [L, R] = F.legs;
    for (const [Lg, k] of [[L, 'l'], [R, 'r']]) {
      // dạng / khép chân bù lại độ dồn hông để bàn chân đứng yên trên đất
      Lg.leg.rotation.set(softLim(o[k + 'H'], ROM.hipX), softLim(o[k + 'Hy'], ROM.hipY), softLim(Lg.sx * o[k + 'Hz'] - o.px / 6.9, ROM.hipZ), 'YXZ');
      Lg.knee.rotation.set(-Math.min(o[k + 'K'], ROM.knee[1]), 0, 0);   // gối là bản lề, IK không bao giờ cho gập ngược
      Lg.ankle.rotation.set(softLim(o[k + 'A'], ROM.ankleX), softLim(o[k + 'Ay'], ROM.ankleY), softLim(o[k + 'Az'], ROM.ankleZ));
    }
    F.hips.position.set(o.px, 0, 0); F.torso.position.set(o.px * 0.85, 0, 0);
    // vặn lưng dưới tính so với hông (thân trên và hông là hai nhánh của gốc): quay người khi đang quỳ từng vặn tới 56°, người chỉ ~30°
    const tYaw = softLim(o.tRy, ROM.spineY), rel = tYaw - o.pRy, relC = Math.max(-LUMBAR_TWIST, Math.min(LUMBAR_TWIST, rel));
    if (rel !== relC) jwClip('lưng dưới vặn', Math.abs(rel) * R2D);
    F.hips.rotation.set(0, o.pRy + (rel - relC), o.pRz, 'YXZ');
    F.torso.rotation.set(softLim(o.tRx, ROM.spineX), tYaw, softLim(o.tRz, ROM.spineZ), 'YXZ');
    F.chest.rotation.set(softLim(o.chRx, ROM.chestX), softLim(o.chRy, ROM.chestY), softLim(o.chRz, ROM.chestZ), 'YXZ');   // ngực vặn trên bụng: thân không còn một khối cứng
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
      const zs = ax < Rr ? torsoSurfZ(x, y, -1) - r : 0;
      if (ax < Rr && p.z > zs) out.z = Math.min(out.z, zs - p.z);
      // mép giáp, mép túi vát dần về mặt áo: mép dựng đứng thì báng vừa nhô qua mép là lực đẩy mất 0,3 đv trong 1 khung, súng và hai khuỷu giật 14-18°
      const yb = 0.14, yt = 2.76, edge = (lo, hi, w) => sm((y - lo) / w) * sm((hi - y) / w);   // tấm giáp trước (sau khi hạ VEST_DROP)
      const eP = edge(yb - r, yt + r, 0.35) * sm((1.3 - ax) / 0.25);
      if (eP > 0) { const zp = zs + (-1.04 * VEST_Z / 0.96 - 0.12 + PLATE_BEND * (x / 1.25) * (x / 1.25) - r - zs) * eP; if (p.z > zp) out.z = Math.min(out.z, zp - p.z); }
      const eQ = edge(0.2 - r, 1.1 + r, 0.3) * sm((0.8 - ax) / 0.2);
      if (eQ > 0) { const zq = zs + (-1.5 - r - zs) * eQ; if (p.z > zq) out.z = Math.min(out.z, zq - p.z); }   // túi đạn trước bụng
    }
    // vùng tránh thu dần theo mức ngắm: cắt thẳng ở aimK 0,5 thì súng nhảy một phát, hai khuỷu giật 14-18° trong 1 khung
    const clearK = 1 - sm((aimK - 0.15) / 0.6);
    const belt = clearK > 0 && F.chest.userData.glBelt;
    if (belt) {
      if (!belt.zone) {
        belt.zone = [];
        for (let i = 0; i <= 14; i++) {
          const u = 0.1 + 0.34 * i / 14;
          belt.curve.getPointAt(u, _bP); _bO.copy(_bP).sub(belt.core).normalize();
          belt.zone.push(_bP.clone().addScaledVector(_bO, belt.T / 2 + 0.16));
        }
      }
      const Rb = (0.21 + r) * clearK;
      for (const q of belt.zone) {
        _tmpP.copy(p).sub(q); const d = _tmpP.length();
        if (d < Rb && d > 1e-4) { const k = (Rb - d) / d; if (Rb - d > out.length()) out.copy(_tmpP.multiplyScalar(k)); }
      }
    }
    if (clearK > 0) for (const arm of F.arms) {   // chỏm vai (thế ngắm: báng cố ý tì vào hõm vai, bỏ qua)
      _tmpP.copy(p).sub(arm.sh); const d = _tmpP.length(), Rs = (0.62 + r) * clearK;
      if (d < Rs && d > 1e-4) { const k = (Rs - d) / d; if (Math.abs(_tmpP.x * k) + Math.abs(_tmpP.y * k) + Math.abs(_tmpP.z * k) > out.length()) out.copy(_tmpP.multiplyScalar(k)); }
    }
    // bắp tay (capsule vai -> khuỷu khung trước, hệ ngực; rifleCollide đặt): đuôi báng đi / chạy cắm vào cơ delta khi chỉ có cầu chỏm vai
    if (clearK > 0 && F._armCaps) for (const c of F._armCaps) {
      _tmpP.copy(p).sub(c.a); const t = Math.max(0, Math.min(1, _tmpP.dot(c.d) / c.L2));
      _tmpP.copy(c.a).addScaledVector(c.d, t); _tmpP.subVectors(p, _tmpP);
      const d = _tmpP.length(), Rs = (ARM_CAP_R + r) * clearK;
      if (d < Rs && d > 1e-4) out.addScaledVector(_tmpP, (Rs - d) / d);   // cộng, không lấy lớn nhất: báng kẹt giữa ngực và bắp tay thì hai lực giành nhau, súng lắc qua lại giữa các vòng
    }
    return out;
  }
  // vector (thế giới) đẩy một điểm ra khỏi thân, giáp, túi; dùng cho vật bất kỳ đang cầm
  function bodyClear(F, pW, r = 0.12) {
    F.root.updateMatrixWorld(true);
    const c = F.chest.worldToLocal(pW.clone()), o = bodyPush(F, c, r, V(0, 0, 0), 1), a = F.chest.localToWorld(c.clone().add(o));
    return a.sub(pW);
  }
  const ARM_CAP_R = 0.42;
  function rifleCollide(F, R, aimK = 0) {
    if (F.weapon == null && !F.rifle) return;
    F.root.updateMatrixWorld(true);
    // tay chưa giải khung này: khuỷu là của khung trước (tay bám súng nên đổi chậm)
    const caps = F._armCapsBuf || (F._armCapsBuf = F.arms.map(() => ({ a: V(0, 0, 0), d: V(0, 0, 0), L2: 1 })));
    F.arms.forEach((arm, i) => { const c = caps[i]; c.a.copy(arm.sh); F.chest.worldToLocal(arm.fore.getWorldPosition(c.d)); c.d.sub(c.a); c.L2 = Math.max(1e-4, c.d.lengthSq()); });
    F._armCaps = caps;
    // ngực gập về súng khi ngắm là chủ ý (báng tì hốc vai): dò va chạm như thân chưa gập, kẻo súng bị đẩy khỏi đường ngắm
    const flexA = AIM_CHEST_RX * c01(aimK) * (F._aimFlex || 0), flexS = Math.sin(flexA), flexC = Math.cos(flexA);
    const Gb = WEAPONS[F.weapon] && WEAPONS[F.weapon].grip, padZ = Gb && Gb.butt && R.userData.probes ? Gb.butt.z - 0.35 : null, padK = 1 - sm(aimK / 0.6);
    for (let it = 0; it < 3; it++) {
      if (it) R.updateMatrixWorld(true);   // chỉ súng đổi chỗ, khỏi cập nhật lại cả người
      let best = 0; _push.set(0, 0, 0);
      for (const [q, r] of R.userData.probes || (WEAPONS[F.weapon] && WEAPONS[F.weapon].grip.probes) || RIFLE_PROBES) {   // điểm dò tự động phủ cả đuôi báng: RIFLE_PROBES chỉ tới z 2,5, đuôi báng (tới 3,2) lún vào vai ~8 cm
        _pw.copy(q); R.localToWorld(_pw); _pc.copy(_pw); F.chest.worldToLocal(_pc);
        if (flexS) { const yy = _pc.y - SPINE_MID_Y, zz = _pc.z; _pc.y = SPINE_MID_Y + yy * flexC - zz * flexS; _pc.z = yy * flexS + zz * flexC; }
        const o = bodyPush(F, _pc, r, _tmpP.clone(), aimK);
        if (padZ != null && q.z > padZ) o.multiplyScalar(padK);   // đệm báng cố ý tì hõm vai khi ngắm: không đẩy súng khỏi vai
        const L = o.length();
        if (L > best) { best = L; _push.copy(o); }
      }
      if (best < 1e-3) break;
      if (flexS) { const yy = _push.y, zz = _push.z; _push.y = yy * flexC + zz * flexS; _push.z = -yy * flexS + zz * flexC; }
      // đổi vector đẩy từ hệ ngực sang hệ cha của súng (torso)
      _pw.set(0, 0, 0); F.chest.localToWorld(_pw); _pc.copy(_push); F.chest.localToWorld(_pc); _pc.sub(_pw);
      _pw.copy(R.parent.getWorldPosition(V(0, 0, 0))); _pc.add(_pw); R.parent.worldToLocal(_pc);
      R.position.addScaledVector(_pc, 1.05);
    }
    F._armCaps = null;
  }

  // ĐIỂM DÒ TỰ ĐỘNG: cắt lưới vật cầm thành lát dọc trục (z hệ súng), mỗi lát lấy điểm cực theo 8 hướng trong mặt cắt (bao lồi thô), lùi vào r.
  // Vật dài (ATR 1,9 m) đặt tay vài điểm thì áo lọt qua khe giữa hai điểm; tính một lần mỗi loại vũ khí, trước khi gộp lưới
  function autoProbes(R, step = 0.7, r = 0.07) {
    R.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(R.matrixWorld).invert(), m4 = new THREE.Matrix4(), p = V(0, 0, 0), sl = new Map();
    const each = (fn) => R.traverse(m => {
      if (!m.isMesh || !m.visible || !m.geometry.attributes.position || m.scale.x < 0.01) return;
      m4.multiplyMatrices(inv, m.matrixWorld);
      const P = m.geometry.attributes.position;
      for (let i = 0; i < P.count; i++) fn(p.fromBufferAttribute(P, i).applyMatrix4(m4));
    });
    // hai lát mỏng ở hai đầu vật (đuôi báng, đầu nòng): mặt đầu không phải điểm cực xy của lát 0,7 nên lọt mất, đuôi báng súng trường lún vào vai không ai đẩy
    let z0 = 1e9, z1 = -1e9; each(q => { z0 = Math.min(z0, q.z); z1 = Math.max(z1, q.z); });
    const END = 0.15;
    each(p => {
      const k = p.z > z1 - END ? 'end' : p.z < z0 + END ? 'start' : Math.round(p.z / step); let s = sl.get(k);
      if (!s) sl.set(k, s = Array.from({ length: 8 }, () => ({ d: -1e9, x: 0, y: 0, z: 0 })));
      for (let j = 0; j < 8; j++) { const a = j * Math.PI / 4, d = p.x * Math.cos(a) + p.y * Math.sin(a); if (d > s[j].d) { s[j].d = d; s[j].x = p.x; s[j].y = p.y; s[j].z = p.z; } }
    });
    const out = [], com = V(0, 0, 0); let area = 0;
    for (const [k, s] of sl) {
      let cx = 0, cy = 0; for (const q of s) { cx += q.x / 8; cy += q.y / 8; }
      const A = Number.isInteger(k) ? (s[0].d + s[4].d) * (s[2].d + s[6].d) : 0; area += A; com.x += cx * A; com.y += cy * A; com.z += (A ? k * step : 0) * A;   // lát đầu mút chỉ để dò, không tính khối   // trọng tâm: mỗi lát nặng theo diện tích mặt cắt
      for (const q of s) {
        const dx = cx - q.x, dy = cy - q.y, L = Math.hypot(dx, dy), rr = Math.min(r, L), u = L > 1e-4 ? rr / L : 0;
        const pt = V(q.x + dx * u, q.y + dy * u, q.z);   // z thật của đỉnh cực: z tâm lát thì điểm dò ở đầu / đuôi vật lệch ra ngoài vật tới nửa bước
        if (!out.some(o => o[0].distanceToSquared(pt) < 0.0144)) out.push([pt, rr]);
      }
    }
    out.com = com.multiplyScalar(1 / (area || 1));
    return out;
  }

  // VÁC / ĐỠ VẬT DÀI: vật tì một điểm (ốp tay trên đỉnh vai). Lún vào ngực thì XOAY quanh điểm tì cho thân súng nhấc khỏi người, phần còn lún
  // (chính chỗ tì) mới tịnh tiến. Tịnh tiến cả khẩu như rifleCollide thì vật dài hoặc bay khỏi vai, hoặc đầu kia vẫn lún.
  // Thêm cầu đầu (mũ): kính ngắm không đi xuyên má / gáy. Tay giải IK sau bước này nên bám theo vật.
  const _cA = V(0, 0, 0), _cP = V(0, 0, 0), _cC = V(0, 0, 0), _cO = V(0, 0, 0), _cH = V(0, 0, 0), _cTq = V(0, 0, 0), _cX = V(0, 0, 0), _cBest = V(0, 0, 0);
  const _cMi = new THREE.Matrix4(), _cMc = new THREE.Matrix4(), _cQ = new THREE.Quaternion(), _cQ0 = new THREE.Quaternion(), _cP0 = V(0, 0, 0);
  const _cQI = new THREE.Quaternion(), _cQ1 = new THREE.Quaternion();
  const PIVOT_RATE = 14, HEAD_CLEAR = 0.78, PIVOT_TURN = 0.25;   // trần góc xoay: lún sâu hơn thế này là lỗi đặt tư thế gốc, xoay to cho hết lún thì súng văng ngang khỏi vai
  function pivotCollide(F, R, probes, pivot, k = 1) {
    if (!probes) return;
    const P = R.parent;
    F.root.updateMatrixWorld(true);
    _cMi.copy(F.chest.matrixWorld).invert().multiply(P.matrixWorld);   // hệ cha súng (torso) -> hệ ngực (ngực có co giãn CHEST_W)
    _cMc.copy(_cMi).invert();
    _cH.set(0, 0.72, 0); F.head.localToWorld(_cH); P.worldToLocal(_cH);
    _cQ0.copy(R.quaternion); _cP0.copy(R.position);
    let turned = 0;
    if (k > 0.01) for (let it = 0; it < 6; it++) {
      R.updateMatrix();
      _cA.copy(pivot).applyMatrix4(R.matrix);
      _cTq.set(0, 0, 0); let I = 0, best = 0;
      for (const [q, r] of probes) {
        _cP.copy(q).applyMatrix4(R.matrix);
        _cC.copy(_cP).applyMatrix4(_cMi);
        bodyPush(F, _cC, r, _cO, 0);
        _cO.add(_cC).applyMatrix4(_cMc).sub(_cP);   // vector đẩy về hệ torso
        _cX.copy(_cP).sub(_cH); const dh = _cX.length(), lim = HEAD_CLEAR + r;
        if (dh < lim && dh > 1e-4 && lim - dh > _cO.length()) _cO.copy(_cX).multiplyScalar((lim - dh) / dh);
        const L = _cO.length();
        if (L < 1e-4) continue;
        if (L > best) { best = L; _cBest.copy(_cO); }
        _cX.copy(_cP).sub(_cA); I += _cX.lengthSq(); _cTq.add(_cX.cross(_cO));
      }
      if (best < 1e-3) break;
      // 4 lượt đầu xoay quanh điểm tì (mô-men của các lực đẩy), tổng góc giới hạn PIVOT_TURN; sau đó đẩy tịnh tiến phần còn lún
      const w = it < 4 && I > 1e-6 ? Math.min(_cTq.length() / I, 0.1, PIVOT_TURN - turned) : 0;
      if (w > 1e-4) {
        turned += w;
        _cQ.setFromAxisAngle(_cTq.normalize(), w);
        R.quaternion.premultiply(_cQ);
        R.position.sub(_cA).applyQuaternion(_cQ).add(_cA);
      } else R.position.addScaledVector(_cBest, 1.05);
    }
    // lọc theo thời gian phần HIỆU CHỈNH (không lọc tư thế): súng quét qua người lúc chuyển thế thì điểm tiếp xúc đổi từng khung, áp thẳng là súng rung 1-2 đv / khung
    const S = F._pc || (F._pc = { q: new THREE.Quaternion(), t: V(0, 0, 0) }), a = F._snap ? 1 : 1 - Math.exp(-(F._dtA || 0.016) * PIVOT_RATE);
    _cQ.copy(R.quaternion).multiply(_cQ1.copy(_cQ0).invert()).slerp(_cQI, 1 - k);
    _cX.copy(R.position).sub(_cP0).multiplyScalar(k);
    S.q.slerp(_cQ, a); S.t.lerp(_cX, a);
    R.quaternion.copy(_cQ0).premultiply(S.q); R.position.copy(_cP0).add(S.t);
  }

  // ---- NẠP SÚNG PHÓNG LỰU: engine (Soldier.stepReload) giữ trình tự và đặt F.glState; ở đây chỉ dựng hình theo số đó ----
  const GL_RELOAD_POSE = {
    load: { p: V(0.55, 1.05, -1.75), r: [-0.5, 0.42, 0.3] },
    tip: { p: V(0.45, 1.5, -1.9), r: [0.75, 0.3, 0.1] }
  };
  // cúi nhìn ổ đạn chủ yếu bằng thắt lưng + ngực, cổ chỉ gập phần còn lại (gập hết ở cổ thì lộ cả gáy dài)
  const GL_RELOAD_BODY = { tRx: -0.2, tRy: 0.1, chRx: -0.17, hRx: -0.2, hRy: -0.12 };
  const GL_DRAW = 0.4;   // quãng rút đạn khỏi vòng vải
  const GL_CHEST_ELBOW = V(-2.5, 0.75, -0.75);   // khuỷu trái khi tay lên ngực (hệ ngực): dưới và hơi trước vai
  // Đường giật theo thời gian của súng đạn áp suất thấp: thúc vai trong ~30 ms, trôi về rồi nhún nhẹ qua điểm cân bằng. k: 1 lúc mới bắn -> 0 hết
  const recoilEnv = (k) => { const u = 1 - k, e = Math.max(0, u - 0.06); return glSm(0.15 + u / 0.06) * Math.exp(-5.5 * e) * Math.cos(6 * e); };
  const _glQ3 = new THREE.Quaternion(), _glE = new THREE.Euler(), _glQ = new THREE.Quaternion(), _glQ2 = new THREE.Quaternion(), _glV = V(0, 0, 0), _glV2 = V(0, 0, 0), _glV3 = V(0, 0, 0), _glBack = V(0, 0, 0), _glX = V(1, 0, 0);
  _glQ2.setFromAxisAngle(_glX, -Math.PI / 2);
  const glSm = (x) => { const t = c01(x); return t * t * (3 - 2 * t); };
  // bản lề, ổ đạn, các viên trong buồng (buồng trống: thu xương về ~0; vỏ đang tuột: trượt ra sau)
  // Dây mềm: hai lò xo (nhanh, chậm) theo gia tốc ngực + trọng lực khi người nghiêng. Vai giữ dây nên không lệch, càng về hông càng rũ;
  // hai lò xo trộn khác nhau dọc dây để đoạn trước đoạn sau không lắc cùng một nhịp. Ở xa không thấy: chỉ cập nhật khi kéo băng.
  const _sP = V(0, 0, 0), _sV = V(0, 0, 0), _sA = V(0, 0, 0), _sG = V(0, 0, 0), _sE = V(0, 0, 0);
  const glBeltW = (u) => Math.pow(Math.sin(Math.PI * (u - Math.floor(u))), 1.5);
  function glBeltDisp(B, u, tab, out) {
    const q = 0.5 + 0.5 * Math.sin(Math.PI * 4 * u), w = glBeltW(u);
    out.copy(B.sim.x).multiplyScalar(1 - q).addScaledVector(B.sim.y, q).multiplyScalar(w);
    const n = out.dot(tab.O);
    if (n < 0) out.addScaledVector(tab.O, -0.8 * n);   // người chặn: dây không lún vào thân
    return out;
  }
  function glBeltSim(F, B, S) {
    const near = !F.lod || F.lod.cur === 0, dt = F._dtA || 0;
    const X = B.sim || (B.sim = { x: V(0, 0, 0), vx: V(0, 0, 0), y: V(0, 0, 0), vy: V(0, 0, 0), p: null, pv: V(0, 0, 0), rest: false });
    if (near && dt > 0) {
      F.chest.getWorldPosition(_sP);
      if (X.p) { _sV.copy(_sP).sub(X.p).divideScalar(dt); _sA.copy(_sV).sub(X.pv).divideScalar(dt).clampLength(0, 260); X.pv.copy(_sV); X.p.copy(_sP); }
      else { X.p = _sP.clone(); _sA.set(0, 0, 0); }
      F.chest.getWorldQuaternion(_bQ).invert();
      _sA.applyQuaternion(_bQ);
      _sG.set(0, -1, 0).applyQuaternion(_bQ); _sG.y += 1;   // đứng thẳng thì 0
      // kéo băng: tay giật dây xuống theo từng nhịp
      let pull = 0;
      if (S.stage === 'belt') { const ph = Math.min(0.999, S.f) * 3, q = ph - Math.floor(ph); pull = q < 0.7 ? glSm(q / 0.7) : 1 - glSm((q - 0.7) / 0.3); }
      _sE.copy(_sG).multiplyScalar(0.55); _sE.y -= 0.14 * pull;
      const n = Math.max(1, Math.ceil(dt / 0.008)), h = dt / n;
      for (let i = 0; i < n; i++) {
        for (const [p, v, wn, z] of [[X.x, X.vx, 12, 0.2], [X.y, X.vy, 6.5, 0.16]]) {
          v.addScaledVector(p, -wn * wn * h).addScaledVector(_sE, wn * wn * h).addScaledVector(v, -2 * z * wn * h).addScaledVector(_sA, -0.55 * h);
          p.addScaledVector(v, h).clampLength(0, 0.5);
        }
      }
    }
    // dây vắt qua vai trái: áo ở vai đi theo xương đòn khi tay cầm súng (lệch 3-8 cm so với ngực), nên đoạn dây quanh vai cũng phải theo, không thì lúc lơ lửng lúc lún vào người
    const Lc = near && F.arms && F.arms[0] && F.arms[0].clav, sh0 = Lc && (F.arms[0].sh0 || B.sh0 || (B.sh0 = Lc.position.clone()));
    let clavMoved = false;
    if (Lc) {
      const Q = B.clQ || (B.clQ = new THREE.Quaternion()), P0 = B.clP || (B.clP = V(0, 0, 0));
      _sP.copy(sh0).applyQuaternion(Lc.quaternion); _sP.subVectors(Lc.position, _sP);   // điểm p theo xương đòn: P0 + Q p
      clavMoved = _sP.distanceToSquared(P0) > 1e-6 || Math.abs(Q.dot(Lc.quaternion)) < 0.999999;
      P0.copy(_sP); Q.copy(Lc.quaternion);
    } else if (B.clP) { clavMoved = B.clP.lengthSq() > 0; B.clP.set(0, 0, 0); B.clQ.identity(); }
    // cộng phần dời theo xương đòn vào out tại điểm p (hệ ngực), mạnh nhất ở đỉnh vai, hết ở giữa ngực / lưng
    const onClav = (p, u, out) => { if (!B.clP) return out; const k = 0.85 * (1 - glSm(Math.min(u, 1 - u) / 0.2)); if (k <= 0) return out; _sE.copy(p).applyQuaternion(B.clQ).add(B.clP).sub(p); return out.addScaledVector(_sE, k); };
    const moving = near && (X.x.lengthSq() + X.y.lengthSq() + X.vx.lengthSq() + X.vy.lengthSq() > 1e-6);
    if (!moving && !clavMoved && B.u === S.belt && X.rest) return;
    X.rest = !moving; B.u = S.belt;
    if (!near) { X.x.set(0, 0, 0); X.y.set(0, 0, 0); X.vx.set(0, 0, 0); X.vy.set(0, 0, 0); }
    B.segs.forEach((b, i) => { const u = i / GL_BELT_SEG, a = B.tab[Math.floor(u * GL_BELT_TAB)]; onClav(a.P, u, glBeltDisp(B, u, a, b.position)); });
    B.slots.forEach((r, i) => {
      const u = r.userData.u0 + S.belt, a = glBeltPlace(B, r, u), uu = u - Math.floor(u);
      onClav(r.position, uu, r.position);
      r.position.add(glBeltDisp(B, uu, a, _bD));
      // mỗi viên đeo lệch một chút, lắc quanh dây theo đà: viên nhét tay, không xếp như máy
      const flop = ((i * 7) % 5 - 2) * 0.035 + (_bD.x + _bD.z) * 0.9 * (i % 2 ? 1 : 0.7);
      r.quaternion.premultiply(_bA.setFromAxisAngle(a.T, flop));
    });
  }
  function glBeltUpdate(F, S) {
    const B = F.chest.userData.glBelt;
    if (!B) return;
    glBeltSim(F, B, S);    if (B.taken !== S.taken) { B.taken = S.taken; B.slots.forEach((r, i) => r.userData.ammo.scale.setScalar(i < S.taken ? 0.001 : 1)); }
    // viên đang rút trượt dọc trục ra khỏi vòng vải; hết công đoạn thì trả về chỗ (nó đã ẩn)
    const cur = B.slots[S.slot];
    if (B.drawn && B.drawn !== cur) B.drawn.userData.ammo.position.y = 0;
    if (cur) { cur.userData.ammo.position.y = -S.draw * GL_DRAW; B.drawn = cur; }   // rút theo phía đuôi đạn, tay nắm ở đó
  }
  function glMech(P, S) {
    P.hinge.rotation.y = -GL_OPEN * S.gate;
    P.drum.rotation.z = S.drum;
    for (let i = 0; i < 6; i++) {
      const c = S.cham[i], r = P.rounds[i];
      r.scale.setScalar(c ? 1 : 0.001);
      r.position.z = GL_ROUND_Z + (c === 2 ? S.ej[i] * 0.7 : 0);
    }
  }
  // tâm viên đạn tại miệng buồng k (thế giới), u = 0 nằm trong buồng, u > 0 lùi ra sau theo trục buồng
  function glChamberPoint(P, k, u, out) {
    const a = k / 6 * Math.PI * 2 + Math.PI / 2;
    return P.drum.localToWorld(out.set(Math.cos(a) * GL_CH_R, Math.sin(a) * GL_CH_R, GL_ROUND_Z + u));
  }
  // tay trái theo từng công đoạn. Trả true nếu đã tự giải tay (không dùng điểm nắm ốp)
  function glReloadHand(F, R, P, S, arm, elbow) {
    const st = S.stage;
    P.hRound.scale.setScalar(0.001);
    if (st !== 'load' && st !== 'wind' && st !== 'close' && st !== 'belt' && st !== 'turn') return false;
    R.updateMatrixWorld(true);
    const frozen = F.lod && F.lod.cur > 1;
    _glBack.set(0, 0, 1).transformDirection(P.drum.matrixWorld);
    const fore = P.fr.localToWorld(_glV3.copy(GL.gripL)), hand = _glV;
    const handBehind = 0.6, handAxis = _glBack.clone().negate();   // nắm đuôi đạn: bàn tay cách tâm viên về phía sau, ngón không xuyên qua viên đạn
    const palm = V(0, 1, 0).transformDirection(R.matrixWorld);
    const front = V(0, 0, -1).transformDirection(F.chest.matrixWorld);   // hướng ra trước ngực
    const belt = F.chest.userData.glBelt;
    let elbowK = 0.7, elbowAt = elbow;
    // điểm nắm trên dây (kéo băng): tay trái ở trước ngực, u tăng là kéo xuống
    const strap = (u, o) => { belt.curve.getPointAt(u, o); _bO.copy(o).sub(belt.core).normalize(); return F.chest.localToWorld(o.addScaledVector(_bO, 0.16)); };
    const mouth = k => glChamberPoint(P, k, 0, V(0, 0, 0)).addScaledVector(_glBack, handBehind);
    // tay với lên ngực: khuỷu giữ thấp, lòng bàn tay úp vào người (khuỷu chìa ngang vai là tư thế không ai dùng); e 0..1 trộn với thế cầm đang có
    const across = V(-1, 0, 0).transformDirection(F.chest.matrixWorld);
    const onChest = e => { palm.lerp(front.clone().negate(), e).normalize(); handAxis.lerp(across, e).normalize(); elbowAt = elbow.clone().lerp(GL_CHEST_ELBOW, e); elbowK = 0.7 + 3 * e; };
    if (st === 'belt' && belt) {
      // 3 nhịp: nắm dây trên ngực, giật xuống bụng, thả tay lên nắm lại
      const ph = Math.min(0.999, S.f) * 3, q = ph - Math.floor(ph), pull = q < 0.7 ? glSm(q / 0.7) : 1 - glSm((q - 0.7) / 0.3);
      hand.copy(strap(0.16 + 0.2 * pull, V(0, 0, 0)));
      const prev = S.first && !S.turned ? fore.clone() : mouth(S.load);
      if (S.f < 0.1) hand.lerp(prev, 1 - glSm(S.f / 0.1));
      onChest(glSm(S.f / 0.1));
    } else if (st === 'turn') {
      // đặt tay lên đuôi buồng cần nạp, buồng quay tới đâu tay theo tới đó
      hand.copy(S.afterBelt && belt ? strap(0.16, V(0, 0, 0)) : fore).lerp(mouth(S.load), glSm(S.f / 0.38));
    } else if (st === 'load') {
      const slot = belt && belt.slots[S.slot];
      const pouch = slot ? slot.userData.ammo.getWorldPosition(V(0, 0, 0)) : F.chest.localToWorld(V(0.05, 1.75, -1.62));
      const f = S.f, ready = 1.0, seated = glChamberPoint(P, S.load, 0, V(0, 0, 0));
      const lineup = seated.clone().addScaledVector(_glBack, ready);
      // đi lấy đạn (từ ốp với viên đầu, từ miệng buồng với các viên sau) -> rút khỏi băng -> đưa tới sau miệng buồng -> đẩy vào -> vặn ổ sang buồng kế
      const start = S.first && S.turned ? mouth(S.load) : S.afterBelt && belt ? strap(0.16, V(0, 0, 0)) : S.first ? fore.clone() : mouth((S.load + 5) % 6);
      const tail = slot ? V(0, -1, 0).transformDirection(slot.userData.ammo.matrixWorld) : _glBack.clone();
      const grab = pouch.clone().addScaledVector(tail, handBehind);
      if (f < 0.42) {
        // tay đi vòng trước ngực, không đâm xuyên súng / giáp
        const e = glSm(f / 0.3);
        if (f < 0.3) hand.copy(start).lerp(grab, e).addScaledVector(front, 0.3 * Math.sin(e * Math.PI)); else hand.copy(grab);
        onChest(glSm(f / 0.2));
      } else if (f < 0.84) {
        const e = glSm((f - 0.42) / 0.26), c = f < 0.68 ? pouch.clone().lerp(lineup, e).addScaledVector(front, 0.16 * Math.sin(e * Math.PI)) : lineup.clone().lerp(seated, Math.pow(c01((f - 0.68) / 0.14), 1.6));
        const turn = glSm((f - 0.42) / 0.22), back = tail.clone().lerp(_glBack, turn).normalize();   // viên còn nằm theo dây, xoay dần cho thẳng trục buồng
        hand.copy(c).addScaledVector(back, handBehind);
        handAxis.copy(back).negate();
        onChest(1 - glSm((f - 0.42) / 0.2));
        P.hRound.scale.setScalar(1);
        R.worldToLocal(P.hRound.position.copy(c));
        P.hRound.quaternion.copy(P.hinge.quaternion).multiply(_glQ2);
        if (slot && turn < 1) {
          slot.userData.ammo.getWorldQuaternion(_glQ);
          R.getWorldQuaternion(_glQ3).invert().multiply(_glQ);
          P.hRound.quaternion.slerp(_glQ3, 1 - turn);
        }
      } else hand.copy(seated).addScaledVector(_glBack, handBehind);   // viên đã vào: tay còn trên đuôi nó, đi cùng ổ khi vặn
    } else {
      // lên dây: bàn tay ôm hông ổ đạn, vặn theo đúng phần ổ quay rồi nhả về vặn tiếp; khép khung: đẩy cụm trước về bằng tay đỡ trên ốp
      const cy = GL_HINGE.y - 0.36, rim = a => P.fr.localToWorld(V(Math.cos(a) * 0.64, cy + Math.sin(a) * 0.64, GL_DRUM_Z));
      if (st === 'wind') {
        const on = rim(Math.PI - S.strokeA / 2 + S.strokeA * S.stroke);
        palm.copy(P.fr.localToWorld(V(0, cy, GL_DRUM_Z))).sub(on).normalize();   // lòng bàn tay úp vào tâm ổ
        hand.copy(mouth(S.load)).lerp(on, glSm(S.f / 0.16));
      } else hand.copy(rim(Math.PI)).lerp(fore, glSm(S.f / 0.45));
    }
    gripSolve(F, arm, hand, { axis: handAxis, palm, range: 1.0, elbow: elbowAt, hintK: elbowK, key: 'glRl', frozen });
    return true;
  }

  // ---- THAY BĂNG ĐẠN SÚNG TRƯỜNG: engine (Soldier.stepMagSwap) đếm giờ và đặt F.magState = { t, T, empty, k }; ở đây chỉ dựng hình theo số đó ----
  // Tay phải giữ báng cầm suốt. Tay trái: rút băng cũ, cất túi (còn đạn) hoặc thả rơi (hết đạn), lấy băng mới ở túi trước bụng, lắp, vỗ đáy; băng rỗng thì kéo thêm khoá nòng.
  const MAG_SWAP = { tac: 2.8, empty: 3.3, reach: [0.12, 0.42], pull: [0.42, 0.68], stow: [0.68, 1.05], grab: [1.05, 1.25], bring: [1.25, 1.8], seat: [1.8, 2.05], slap: [2.05, 2.2], back: [2.2, 2.5], chgPull: [2.5, 2.72], chgRel: [2.72, 2.82], chgBack: [2.82, 3.1], pullLen: 1.2 };
  const MAG_POSE = { p: V(0.42, 2, -1.2), r: [-0.3, 0.7, 0.42] };   // súng ôm sát ngực, nòng chếch sang trái và chúc xuống, ổ băng ngả về tay trái và mắt; dò bằng đo khoảng cách cổ tay - đáy băng (tay với tới suốt động tác)
  const MAG_BODY = { tRx: -0.1, chRx: -0.1, hRx: -0.3, hRy: 0.16 };
  const MAG_BASE = V(0, -1.6, -1.38), MAG_DIR = V(0, -0.905, -0.425), MAG_POUCH = V(-0.42, 0.72, -1.72), MAG_CHG = V(-0.14, 0.47, 0.42);
  const magSm = (t, r) => { const x = c01((t - r[0]) / (r[1] - r[0])); return x * x * (3 - 2 * x); };
  const _mgV = V(0, 0, 0), _mgA = V(0, 0, 0), _mgB = V(0, 0, 0), _mgE = new THREE.Euler();
  // đặt băng theo độ dời mo (hệ súng), xoay quanh đáy băng để lúc lắc không văng xa theo gốc xương
  function magPlace(P, mo, tilt, show) {
    P.mag.scale.setScalar(show ? 1 : 0.001);
    P.mag.rotation.set(tilt, 0, 0);
    _mgV.copy(MAG_BASE).applyEuler(_mgE.set(tilt, 0, 0));
    P.mag.position.copy(mo).add(MAG_BASE).sub(_mgV);
  }
  function magSwapHand(F, R, S, arm, elbow) {
    const P = R.userData.rifle, t = S.t, M = MAG_SWAP, hand = V(0, 0, 0), mo = V(0, 0, 0);
    let tilt = 0, show = true;
    R.updateMatrixWorld(true);
    const local = (out, v) => R.localToWorld(out.copy(v));
    const fore = local(V(0, 0, 0), RIFLE.gripL), base0 = local(V(0, 0, 0), MAG_BASE);
    const pulled = MAG_DIR.clone().multiplyScalar(M.pullLen), ready = MAG_DIR.clone().multiplyScalar(0.9);
    const pouch = F.chest.localToWorld(MAG_POUCH.clone()), pouchUp = F.chest.localToWorld(_mgA.copy(MAG_POUCH).add(_mgB.set(0, 0.55, -0.1)).clone());
    const inHand = () => { R.worldToLocal(mo.copy(hand)).sub(MAG_BASE); };
    let solve = true;
    if (t < M.reach[0]) solve = false;
    else if (t < M.reach[1]) hand.copy(fore).lerp(base0, magSm(t, M.reach));
    else if (t < M.pull[1]) { mo.copy(pulled).multiplyScalar(magSm(t, M.pull)); R.localToWorld(hand.copy(MAG_BASE).add(mo)); }
    else if (t < M.stow[1]) {
      const e = magSm(t, M.stow);
      R.localToWorld(hand.copy(MAG_BASE).add(pulled)); hand.lerp(pouchUp, e);
      if (S.empty) show = false; else { inHand(); tilt = 0.5 * e; show = e < 0.9; }
    } else if (t < M.grab[1]) {
      const e = magSm(t, M.grab);
      hand.copy(pouchUp).lerp(pouch, Math.sin(e * Math.PI));   // thọc tay vào túi rồi rút lên
      inHand(); tilt = 0.5; show = e > 0.5;
    } else if (t < M.bring[1]) {
      const e = magSm(t, M.bring);
      R.localToWorld(hand.copy(MAG_BASE).add(ready)); hand.lerp(pouchUp, 1 - e);
      inHand(); tilt = 0.5 * (1 - e);
    } else if (t < M.seat[1]) { mo.copy(ready).multiplyScalar(1 - magSm(t, M.seat)); R.localToWorld(hand.copy(MAG_BASE).add(mo)); }
    else if (t < M.slap[1]) {
      // vỗ đáy băng: tay rời xuống một chút rồi đập lên
      const q = c01((t - M.slap[0]) / (M.slap[1] - M.slap[0]));
      hand.copy(base0).addScaledVector(_mgA.copy(MAG_DIR).transformDirection(R.matrixWorld), 0.28 * Math.sin(q * Math.PI));
    } else if (!S.empty) {
      if (t < M.back[1]) hand.copy(base0).lerp(fore, magSm(t, M.back)); else solve = false;
    } else {
      const c0 = local(V(0, 0, 0), MAG_CHG), pb = 0.55 * (magSm(t, M.chgPull) - magSm(t, M.chgRel));
      P.chg.position.z = pb;
      const c1 = c0.clone().addScaledVector(_mgA.set(0, 0, 1).transformDirection(R.matrixWorld), pb);
      if (t < M.back[1]) hand.copy(base0).lerp(c0, magSm(t, M.back));
      else if (t < M.chgRel[1]) hand.copy(c1);
      else if (t < M.chgBack[1]) hand.copy(c0).lerp(fore, magSm(t, M.chgBack));
      else solve = false;
    }
    if (S.empty && t >= M.chgBack[1]) P.chg.position.z = 0;
    magPlace(P, mo, tilt, show);
    if (!solve) return false;
    // bàn tay ôm đáy băng từ dưới; lúc kéo khoá nòng thì quay mu tay lên, ngón móc về sau
    const onChg = S.empty && t >= M.back[0] && t < M.chgRel[1];
    const axis = (onChg ? V(1, 0, 0.25) : V(0, -0.1, -1)).normalize().transformDirection(R.matrixWorld), palm = (onChg ? V(0, -1, 0) : V(0.35, 0.93, 0)).transformDirection(R.matrixWorld);
    gripSolve(F, arm, hand, { axis, palm, range: 1.0, elbow, hintK: 0.7, key: 'magRl', frozen: F.lod && F.lod.cur > 1 });
    return true;
  }

  // ---- NẠP ỐNG PHÓNG RPG: engine (Soldier.stepRpgReload) đếm giờ, đặt F.rpgState = { t, T, k, left }; ở đây chỉ dựng hình theo số đó ----
  // Một mình nạp: bắn xong giữ ống trên vai một nhịp cho khói tan rồi mới hạ. Tay phải giữ báng cầm, hạ ống chếch trước ngực, loa phụt sang ngoài chân phải.
  // Tay trái với qua vai trái, xé nắp ba lô, rút đạn thẳng lên, đưa vòng ngoài vai về trước, xoay đạn thẳng trục ống, đẩy động cơ tới đáy; vặn đạn cho gờ lọt ngàm miệng ống,
  // trượt tay lên mũi rút nắp ngòi rồi hất đi; về ốp tay, ngón cái kéo búa, đưa ống lên vai.
  // 6,5 s cũ bị chê lề mề: bớt chờ giữa các động tác, giữ đủ bước
  const RPG_RELOAD = { T: 4.7, lower: [0.3, 0.7], reach: [0.5, 1.05], flap: 0.95, grab: [1.05, 1.2], lift: [1.2, 1.75], over: [1.75, 2.2], align: [2.2, 2.35], insert: [2.35, 2.85], seat: [2.85, 2.95], twist: [2.95, 3.1], capReach: [3.12, 3.3], capPull: [3.3, 3.42], capToss: 3.52, back: [3.52, 3.8], cock: [3.8, 3.95], raise: [4.0, 4.62], land: 4.6 };
  // thế nạp (r: [ngóc, xoay ngang, lăn]): báng cầm trước hông phải, ống dựng chéo dốc ~60° tì vào ngực, loa phụt cạnh đùi phải, miệng ống trước vai trái ngang cằm.
  // Ống ~7 kg chìa gần ngang (ngóc 31° cũ) chỉ một tay nắm báng trông "phản trọng lực"; dựng dốc thì sức nặng dồn dọc cẳng tay và tì người
  // gL, rL: tay phải nạp thì lật đối xứng (tay trái giữ tay cầm trước ở hông trái, miệng ống nghiêng sang phải): ống vẫn mọc từ hông phải thì cẳng tay phải nằm dọc đè lên đầu đạn
  const RPG_LOAD = { grip: V(0.85, -0.5, -1.75), r: [0.9, 1.05, 0], gL: V(-1.1, 0.0, -2.3), rL: [0.9, -0.95, 0] };   // tay giữ cách vai đủ xa, khuỷu mở ~100° (gập chặt thì tay áo phồng méo)
  // RPG_HOLD_G / RPG_HOLD_I: chỗ nắm tính từ gốc đầu đạn lúc rút khỏi túi (phần mũi, nhô trên vai) / lúc đẩy vào ống (đoạn to, gần cổ để tay với tới). RPG_INS: đuôi đạn vừa tới miệng ống
  const RPG_HOLD_G = 1.85, RPG_HOLD_I = 1.1, RPG_P0 = V(0, RPG_B, -2.6), RPG_INS = RPG_MOTOR + 0.12;
  const RPG_NOSE = V(0, 0, -1), _rpQ2 = new THREE.Quaternion(), _rpQ3 = new THREE.Quaternion();
  const _rpLook0 = V(0, 3.6, -8);
  const RPG_ELBOW_IN = V(-3.4, 2.4, -1.7);   // gợi ý khuỷu lúc đẩy đạn (hệ ngực, tay trái; tay phải lật x)
  const RPG_PACK = { x: 1.35, y0: -0.2, y1: 2.6, z0: 1.0, z1: 2.3 };   // hộp ba lô đạn (hệ ngực) cho gripCost
  const RPG_TWIST = 0.62, RPG_HAMMER = 0.95, RPG_CAP_Z = -2.6 - 2.3;   // RPG_TWIST: đạn vào ống lệch ngàm, vặn về 0 lúc lọt gờ; RPG_CAP_Z: tâm nắp ngòi hệ súng
  function rpgBagShow(F, n) {
    const L = F.chest.userData.rpgSlots;
    if (!L || F._rpgBagN === n) return;
    F._rpgBagN = n;
    L.forEach((s, i) => s.scale.setScalar(i >= L.length - n ? 1 : 0.001));
  }
  // đặt đạn sao cho điểm nắm trùng bàn tay, mũi đạn theo hướng noseW (thế giới)
  function rpgRocketInHand(R, rk, handW, noseW, roll, hold) {
    R.getWorldQuaternion(_rpQ2).invert();
    const nL = noseW.clone().applyQuaternion(_rpQ2).normalize();
    rk.quaternion.setFromUnitVectors(RPG_NOSE, nL);
    if (roll) rk.quaternion.multiply(_rpQ3.setFromAxisAngle(RPG_NOSE, roll));   // vặn quanh trục đạn; vị trí bù ở dưới theo RPG_P0 nên trục đạn đứng yên
    const hL = R.worldToLocal(handW.clone()).addScaledVector(nL, -hold);
    rk.position.copy(hL).sub(_mgV.copy(RPG_P0).applyQuaternion(rk.quaternion));
    rk.scale.setScalar(1);
  }
  // quả đang nạp nằm lệch phải trong ba lô: tay PHẢI lấy (vòng qua vai phải, đối xứng với tay trái lấy quả trái), tay trái giữ ốp tay trước.
  // Tay trái với quả phải phải vòng sau gáy, khuỷu giơ qua đầu: lưới tay áo phình, người dùng chê "tay người đâu xoay được tầm đó"
  function rpgSlotAt(F, S) {
    const L = F.chest.userData.rpgSlots || [], sl = L[Math.max(0, L.length - (S.left === undefined ? 3 : S.left))];
    return sl ? sl.userData.at : V(-RPG_BAG.DX, 2.37, 1.8);
  }
  function rpgSlotDir(F, S) {
    const L = F.chest.userData.rpgSlots || [], sl = L[Math.max(0, L.length - (S.left === undefined ? 3 : S.left))];
    return sl && sl.userData.dir ? sl.userData.dir : V(0, 1, 0);
  }
  const rpgRightHand = (F, S) => rpgSlotAt(F, S).x > 0.5 * RPG_BAG.DX;
  function rpgReloadHand(F, R, S, arm, elbow, rh = false) {
    const t = S.t, M = RPG_RELOAD, rk = R.userData.rocket, ch = F.chest, L = ch.userData.rpgSlots || [];
    const m = rh ? -1 : 1, Vm = (x, y, z) => V(x * m, y, z);   // tay phải: mọi điểm / hướng hệ ngực lật trái - phải
    F._rpgRH = rh;
    F._rpgDirty = true;
    R.updateMatrixWorld(true);
    const held = t >= M.grab[1] && t < M.twist[1], cap = rk.userData.cap;
    const left = S.left === undefined ? 3 : S.left;
    rpgBagShow(F, Math.max(0, left - (t >= M.grab[1] ? 1 : 0)));
    const at = rpgSlotAt(F, S);
    // eUp: điểm gợi ý khuỷu (hệ ngực). Quả trái: khuỷu chĩa ngang ra sau, không lên quá vai (với túi bên ba lô); quả phải: khuỷu chĩa trước - lên để tay vòng sau gáy
    // u theo chỗ nắm (gốc đạn + trục ống), không theo đáy túi: ống xoè làm quả giữa nghiêng hẳn sang trái
    // H: chỗ nắm tính từ gốc đầu đạn. Rút khỏi túi: nắm phần mũi (RPG_HOLD_G) nhô trên vai; xoay về trước thì tay trượt xuống đoạn to (RPG_HOLD_I) để đẩy vào ống
    const sDir = rpgSlotDir(F, S), u = c01((m * (at.x + sDir.x * 1.05) / RPG_BAG.DX + 1) / 2), H = RPG_HOLD_I + (RPG_HOLD_G - RPG_HOLD_I) * (1 - magSm(t, M.over)), eUp = Vm(-2.5 + 0.6 * u, 4.5 + 0.4 * u, -1.4);   // với qua đỉnh vai: khuỷu chĩa trước - lên vừa phải, khớp hướng lòng tay palmBag (ôm thân đạn từ phía ngoài)
    const upW = sDir.clone().transformDirection(ch.matrixWorld), axW = V(0, 0, -1).transformDirection(R.matrixWorld);   // upW: trục ống túi (rút đạn ra theo trục)
    // RÚT ĐẠN: kéo lên một đoạn rồi đạn nghiêng dần sang trái ra ngoài sau lưng (thân động cơ tì miệng túi làm điểm xoay), sau đó mới vòng về trước bên hông vai.
    // Kéo thẳng hết 25 cm động cơ thì tay phải giơ lên trời, vai bị kéo giãn phình; nghiêng qua đỉnh vai thì thân đạn cắt vào vai (miệng túi thấp hơn vai).
    // sOut: đoạn đã rút; gốc đầu đạn ban đầu nằm dưới miệng túi 0,13
    const mouth = ch.localToWorld(at.clone().addScaledVector(sDir, 0.13)), dirT = Vm(-0.8, 0.5, 0.15).normalize().transformDirection(ch.matrixWorld), OUT = RPG_MOTOR + 0.15;
    const pull = (sOut) => { const k = magSm(sOut, [0.3, OUT]), d = upW.clone().lerp(dirT, k).normalize(); return [mouth.clone().addScaledVector(d, sOut - 0.13 + H), d]; };
    const [bag] = pull(0), [lifted, liftDir] = pull(OUT), over = ch.localToWorld(Vm(-4.0, 4.0, -1.0));
    // đường với: ra trước ngực rồi vòng lên ngoài vai (đi thẳng thì nắm tay lọt vào cơ vai, khuỷu quay vọt)
    const wpFront = ch.localToWorld(Vm(-2.5, 3.8, -3.0)), wpUp = ch.localToWorld(Vm(-3.0, 6.2, 0.2));
    const palmBag = Vm(1 - u, 0, u).normalize().transformDirection(ch.matrixWorld);
    const onTube = (d) => R.localToWorld(V(0, RPG_B, -2.6 - H - d));
    const fore = R.localToWorld((rh ? RPG.gripR : RPG.gripL).clone()), hand0 = onTube(RPG_INS + 0.15);   // tay về lại chỗ cầm của nó
    const bez = (a, c, b, e) => a.clone().multiplyScalar((1 - e) * (1 - e)).addScaledVector(c, 2 * e * (1 - e)).addScaledVector(b, e * e);
    // đẩy đạn: khuỷu chĩa ra ngoài, cẳng tay cắt ngang trục đạn; lòng tay kiểu bắt tay (ngón cái về mũi đạn), vuông góc cả trục đạn lẫn cẳng tay.
    // Lòng tay cố định theo mặt trên ống thì ống dựng dốc làm tay vòng ra phía xa, cẳng tay nằm dọc đè lên đầu đạn
    const eIn = RPG_ELBOW_IN.clone(); eIn.x *= m;
    const eInW = ch.localToWorld(eIn.clone()), palmIn = (h) => { const f = h.clone().sub(eInW).normalize(); return (rh ? axW.clone().cross(f) : f.cross(axW)).normalize(); };
    let hand = null, nose = upW.clone(), axis = upW.clone(), palm = Vm(1, 0, 0).transformDirection(ch.matrixWorld), roll = 0;
    if (t < M.reach[0]) { /* tay còn trên ốp */ }
    else if (t < M.reach[1]) { const e = magSm(t, M.reach); { const q = 1 - e; hand = fore.clone().multiplyScalar(q * q * q).addScaledVector(wpFront, 3 * q * q * e).addScaledVector(wpUp, 3 * q * e * e).addScaledVector(bag, e * e * e); } axis = (rh ? RPG.axisR : RPG.axisL).clone().transformDirection(R.matrixWorld).lerp(upW, e).normalize(); palm = V(m, 0, 0).transformDirection(R.matrixWorld).lerp(palmBag, e).normalize(); }   // bắt đầu đúng trục + lòng tay của chỗ cầm, khỏi giật cổ tay
    else if (t < M.grab[1]) { hand = bag; palm = palmBag; }
    else if (t < M.lift[1]) { const P = pull(OUT * magSm(t, M.lift)); hand = P[0]; nose = P[1]; axis = nose; palm = palmBag; }
    else if (t < M.over[1]) {
      // đuôi đạn chìa ra ngoài vai lúc xoay về trước, không quét qua người
      const e = magSm(t, M.over), bump = Math.sin(e * Math.PI);
      hand = bez(lifted, over, hand0, e); palm = palmBag.clone();
      nose = liftDir.clone().multiplyScalar(1 - e).addScaledVector(axW, e).addScaledVector(Vm(1, 0, 0).transformDirection(ch.matrixWorld), 0.3 * bump).normalize();
      axis = nose; palm.lerp(palmIn(hand), e).normalize();
    } else if (t < M.twist[1]) {
      const d = t < M.align[1] ? RPG_INS + 0.15 : t < M.insert[1] ? (RPG_INS + 0.15) * (1 - 0.92 * magSm(t, M.insert)) : t < M.seat[1] ? (RPG_INS + 0.15) * 0.08 * (1 - magSm(t, M.seat)) : 0;
      hand = onTube(d); nose = axW; axis = axW; palm = palmIn(hand);
      // chưa lọt ngàm: bàn tay + đạn lệch một góc, cuối hành trình vặn về đúng khấc
      roll = RPG_TWIST * (1 - magSm(t, M.twist)) * magSm(t, M.align);
      palm.applyAxisAngle(axW, -roll);
    } else if (t < M.back[1]) {
      // rút nắp ngòi: tay trượt dọc đầu đạn tới mũi, giật thẳng ra trước, hất ra phía tay đang làm; về chỗ cầm
      const noseP = R.localToWorld(V(0, RPG_B, RPG_CAP_Z)), head = onTube(0), left = Vm(-1, -0.25, -0.2).normalize().transformDirection(R.matrixWorld);
      const pull = noseP.clone().addScaledVector(axW, 0.34), flung = pull.clone().addScaledVector(left, 0.85).addScaledVector(axW, 0.15);
      axis = axW; palm = palmIn(noseP);
      if (t < M.capReach[1]) hand = head.lerp(noseP, magSm(t, M.capReach));
      else if (t < M.capPull[1]) hand = noseP.lerp(pull, magSm(t, M.capPull));
      else if (t < M.capToss) { hand = pull.lerp(flung, magSm(t, [M.capPull[1], M.capToss])); palm.lerp(left.clone().negate(), 0.6 * magSm(t, [M.capPull[1], M.capToss])).normalize(); }
      else {
        // về chỗ cầm: lòng tay và trục nắm chuyển dần sang của tay cầm, khỏi giật lúc đổi về gripSolve của súng
        const e = magSm(t, M.back); hand = flung.lerp(fore, e);
        palm.lerp(left.clone().negate(), 0.6).normalize().lerp(V(m, 0, 0).transformDirection(R.matrixWorld), e).normalize();   // nối tiếp hướng lòng tay cuối pha hất nắp
        axis = axW.clone().lerp((rh ? RPG.axisR : RPG.axisL).clone().transformDirection(R.matrixWorld), e).normalize();
      }
    }
    if (held && hand) rpgRocketInHand(R, rk, hand, nose, roll, H);
    else if (t >= M.twist[1]) { rk.position.set(0, 0, 0); rk.quaternion.identity(); rk.scale.setScalar(1); }
    else { rk.position.set(0, 0, 0); rk.quaternion.identity(); rk.scale.setScalar(0.001); }
    // nắp theo tay từ lúc giật, hất đi thì thu về (engine thả một nắp thật xuống đất cùng lúc)
    if (cap) {
      if (t >= M.capToss) cap.scale.setScalar(0.001);
      else {
        cap.scale.setScalar(1);
        if (t >= M.capPull[0] && hand) cap.position.copy(R.worldToLocal(hand.clone())).sub(_mgV.set(0, RPG_B, RPG_CAP_Z)); else cap.position.set(0, 0, 0);
      }
    }
    // đầu nhìn đúng việc tay đang làm (hệ ngực, animateMotion đổi ra góc cổ): lúc với sau lưng thì liếc nhẹ về vai đó, đạn ra trước mới dõi theo, đẩy đạn nhìn miệng ống, kéo búa nhìn báng
    const lookW = t < M.over[0] + 0.15 || t >= M.cock[1] ? null : t < M.align[0] ? hand : t < M.capReach[0] ? R.localToWorld(V(0, RPG_B, -2.6)) : t < M.capToss ? hand : R.localToWorld(V(0.17, 0.3, 0.58));
    (F._rpgLook || (F._rpgLook = V(0, 0, 0))).copy(lookW ? ch.worldToLocal(lookW.clone()) : t < M.over[0] + 0.15 && t >= M.reach[0] ? Vm(-2.6, 4.0, -6) : V(0, 3.6, -8));
    if (!hand) return false;
    if (rh && t < M.reach[0]) return false;
    // HƯỚNG NẮM theo khuỷu thật của khung trước, trong tầm khớp (bắt ngón cái chĩa cố định về mũi đạn thì cẳng tay vặn tới 180°, tay áo xoắn như dây thừng; khớp thật ~85°).
    // Với qua vai rút đạn: ngón cái về đuôi đạn như rút tên trong ống đeo lưng; đưa ra trước: xoay dần qua hướng trung tính về mũi đạn
    if (t >= M.reach[0]) {
      const Ew = arm.fore.getWorldPosition(V(0, 0, 0)), f = hand.clone().sub(Ew).normalize(), U = arm.up.getWorldPosition(V(0, 0, 0)).sub(Ew);
      U.addScaledVector(f, -U.dot(f)).normalize();
      const q2 = (a, b, q) => a.clone().multiplyScalar((1 - q) * (1 - q)).addScaledVector(U, 2 * q * (1 - q)).addScaledVector(b, q * q);
      let A, w = 1;
      if (t < M.reach[1]) { w = magSm(t, M.reach); A = q2((rh ? RPG.axisR : RPG.axisL).clone().transformDirection(R.matrixWorld), upW.clone().negate(), w); }
      else if (t < M.lift[1]) A = nose.clone().negate();
      else if (t < M.over[1]) A = q2(liftDir.clone().negate(), axW, magSm(t, M.over));
      else if (t < M.back[0]) A = axW.clone();
      else { A = axis.clone(); w = 1 - magSm(t, [M.back[0] + 0.55 * (M.back[1] - M.back[0]), M.back[1]]); }   // giữ cổ tay thuận theo cẳng tay tới gần chỗ cầm mới đổi sang hướng nắm của nó
      A.addScaledVector(f, -0.6 * A.dot(f)).normalize();   // bớt phần dọc cẳng tay: cổ tay khỏi gập quá tầm
      const cU = A.dot(U), CM = 0.17;                      // cos 80°: ngón cái lệch hướng trung tính tối đa 80°
      if (cU < CM) { A.addScaledVector(U, -cU).normalize().multiplyScalar(Math.sqrt(1 - CM * CM)).addScaledVector(U, CM); }
      const pF = (rh ? A.clone().cross(f) : f.clone().cross(A)).normalize();
      if (roll) pF.applyAxisAngle(axW, -roll);
      axis = w < 1 ? axis.clone().lerp(A, w).normalize() : A; palm = w < 1 ? palm.clone().lerp(pF, w).normalize() : pF;
    }
    // khuỷu: từ thế cầm súng giơ dần lên khi với ra sau lưng, hạ lại lúc đưa đạn về trước
    // gợi ý khuỷu ra sau có hiệu lực ngay khung đầu của động tác: lần dò đầu (đổi key) chọn đúng nghiệm khuỷu cao rồi bám theo (stay).
    // Tăng dần thì lần dò đầu chọn nghiệm khuỷu chĩa xuống (cẳng tay dựng ngược sau bả vai), đổi nghiệm giữa chừng thì khuỷu quét qua đầu
    const up = t >= M.reach[0] ? 1 - magSm(t, [M.over[0], M.over[0] + 0.6 * (M.over[1] - M.over[0])]) : 0;
    const kIn = magSm(t, M.over) * (1 - magSm(t, M.back));
    gripSolve(F, arm, hand, { axis, palm, range: 1.0, elbow: elbow.clone().lerp(eIn, kIn).lerp(eUp, up), hintK: 0.7 + 1.5 * up + 1.3 * kIn, lift: up, over: up, pack: RPG_PACK, stay: true, ease: true, key: 'rpgRl', frozen: F.lod && F.lod.cur > 1 });
    return true;
  }

  // súng: pha trộn các thế cầm (thấp / chéo ngực / ngắm) theo trọng số, cộng rung nhỏ
const _gp = V(0, 0, 0);
  function holdRifleBlend(F, o) {
    const R = F.rifle, Wd = WEAPONS[F.weapon] || WEAPONS.rifle, Gp = Wd.grip, W = o.gLow + o.gPort + o.gAim + o.gReady + (o.gRelax || 0) || 1;
    _gp.set(0, 0, 0); let rx = 0, ry = 0, rz = 0;
    for (const [k, w] of [['low', o.gLow], ['port', o.gPort], ['aim', o.gAim], ['ready', o.gReady], ['relax', o.gRelax || 0]]) {
      if (!w) continue;
      const P = Wd.poses[k] || RIFLE_POSE[k];
      _gp.addScaledVector(P.p, w / W); rx += P.r[0] * w / W; ry += P.r[1] * w / W; rz += P.r[2] * w / W;
    }
    R.visible = true; R.scale.setScalar(1);
    const rpS = R.userData.rocket && F.rpgState && F.rpgState.t != null ? F.rpgState : null;
    if (R.userData.rocket && !rpS) {
      const rk = R.userData.rocket;
      if (F._rpgDirty) { rk.position.set(0, 0, 0); rk.quaternion.identity(); F._rpgDirty = false; }
      rk.scale.setScalar(F.rpgEmpty ? 0.001 : 1);
      if (rk.userData.cap && rk.userData.cap.scale.x > 0.01) rk.userData.cap.scale.setScalar(0.001);
      rpgBagShow(F, F.rpgState && F.rpgState.left !== undefined ? F.rpgState.left : 3);
    }
    R.position.copy(_gp);
    // búa: bắn xong sập, nạp thì nằm yên tới lúc ngón cái kéo (vượt lố nhẹ qua lẫy rồi tựa lại)
    if (R.userData.rpgHammer) {
      let hk = F.rpgEmpty ? 0 : 1;
      if (rpS) { const e = c01((rpS.t - RPG_RELOAD.cock[0]) / (RPG_RELOAD.cock[1] - RPG_RELOAD.cock[0])); hk = e < 0.7 ? 1.12 * glSm(e / 0.7) : 1.12 - 0.12 * glSm((e - 0.7) / 0.3); }
      R.userData.rpgHammer.rotation.x = RPG_HAMMER * hk;
    }
    // súng là con của torso: người đổ trước khi đi / chạy thì nòng chúc theo (36° -> 52° khi chạy, tay trái duỗi thẳng với xuống).
    // Bù độ nghiêng thân để góc nòng so với đất giữ nguyên ở mọi dáng; thế ngắm đã khoá báng nên không bù.
    const lean = (o.tRx + 0.6 * o.chRx) * (1 - o.gAim / W);
    R.rotation.set(rx + o.gPitch - lean, ry + o.gYaw, rz + o.gRoll, 'YXZ');
    // Khóa đệm báng vào hõm vai phải khi nâng súng. Trước đây chỉ hai bàn tay có IK,
    // còn báng hoàn toàn dựa vào tọa độ pose nên ở thế ngắm cách vai tới ~1.2 đơn vị (~15 cm).
    // Low-ready không khóa để người lính còn hạ súng tự nhiên; ready khóa mềm, aim khóa cứng.
    const buttLock = c01((o.gAim + (Gp.readyLock != null ? Gp.readyLock : 0.2) * o.gReady) / W);   // đi / đứng: báng hạ dưới vai, súng sát người nên bắp tay không nhô trước ngực
    if (buttLock > 0 && Gp.butt) {
      F.root.updateMatrixWorld(true);
      const butt = R.localToWorld(Gp.butt.clone());
      // Hõm báng nằm ở phần trên cơ ngực/đầu vai, không phải tâm khớp vai.
      const pocketL = Gp.pocket ? Gp.pocket.clone() : V(1.1, 3.0 + 0.45 * c01(o.gAim / W), -0.62);
      // ngực gập về súng khi ngắm: quy hốc vai về như thân chưa gập, súng và đường ngắm đứng yên
      const fA = Gp.sight ? 0 : -AIM_CHEST_RX * c01(o.gAim / W) * (F._aimFlex || 0);
      if (fA) { const yy = pocketL.y - SPINE_MID_Y, zz = pocketL.z, cF = Math.cos(fA), sF = Math.sin(fA); pocketL.y = SPINE_MID_Y + yy * cF - zz * sF; pocketL.z = yy * sF + zz * cF; }
      const pocket = F.chest.localToWorld(pocketL);   // ngắm: báng đặt cao ngang xương đòn (như xạ thủ thật), đầu chỉ cúi nhẹ áp má   // trên mặt áo (z -0,15 cũ lún sâu trong vai, chỉ ẩn nhờ tay áo che)
      const delta = F.torso.worldToLocal(pocket).sub(F.torso.worldToLocal(butt));
      R.position.addScaledVector(delta, buttLock);
    }
    const glS = F.glState, glP = glS && R.userData.gl;
    if (glP) { glMech(glP, glS); glBeltUpdate(F, glS); }
    if (F.chest && F.chest.userData.ghCape) ghillieSim(F, F.chest.userData.ghCape);
    if (glP && glS.k > 0) {
      // hạ súng về thế nạp (báng kẹp nách, nòng chúc xuống cho đáy ổ ngửa lên); đoạn dốc vỏ thì hất nòng lên
      const A = GL_RELOAD_POSE.load, B = GL_RELOAD_POSE.tip, tp = glS.tip;
      _glE.set(A.r[0] + (B.r[0] - A.r[0]) * tp, A.r[1] + (B.r[1] - A.r[1]) * tp, A.r[2] + (B.r[2] - A.r[2]) * tp, 'YXZ');
      R.quaternion.slerp(_glQ.setFromEuler(_glE), glS.k);
      R.position.lerp(_glV.copy(A.p).lerp(B.p, tp), glS.k);
      // súng không đứng im: nhấc ổ đạn lên đón tay lúc đưa đạn / vặn dây, rung theo cú va của khung và đạn
      const st0 = glS.stage, want = (st0 === 'load' && glS.f > 0.42) || st0 === 'turn' || st0 === 'wind' ? 1 : 0;
      glS.meet += (want - glS.meet) * Math.min(1, (F._dtA || 0.016) * 6);
      R.position.y += 0.14 * glS.meet * glS.k; R.position.x -= 0.1 * glS.meet * glS.k;
      R.position.z += (1.2 * glS.jp + 0.28 * glS.flick) * glS.k; R.position.y += 0.16 * glS.flick * glS.k;
      R.rotateX((0.6 * glS.jp + 0.26 * glS.flick) * glS.k);   // hất vỏ: nòng giật lên thêm ~15°
    }
    if (rpS && rpS.k > 0) {
      // hạ ống về thế nạp: đặt theo điểm tay đang giữ ống để tay đó khỏi phải với
      const rpLH = rpgRightHand(F, rpS), rL = rpLH ? RPG_LOAD.rL : RPG_LOAD.r;
      _glE.set(rL[0], rL[1], rL[2], 'YXZ');
      R.quaternion.slerp(_glQ.setFromEuler(_glE), rpS.k);
      R.position.lerp(_glV.copy(rpLH ? Gp.gripL : Gp.gripR).applyEuler(_glE).negate().add(rpLH ? RPG_LOAD.gL : RPG_LOAD.grip), rpS.k);
      // tay phải đỡ đối lực: ống lùi theo lúc đẩy đạn, giật khẽ khi đạn chạm đáy, nhích theo cú giật nắp, nảy khi kéo búa; ngóc miệng ống đón đuôi đạn
      const t = rpS.t, M = RPG_RELOAD, axZ = _glV.set(0, 0, -1).applyQuaternion(R.quaternion);
      R.position.addScaledVector(axZ, (-0.14 * magSm(t, M.insert) * (1 - magSm(t, M.twist)) - 0.16 * atrJolt(t, M.seat[1] - 0.03, 0.2) + 0.1 * atrJolt(t, M.capPull[0], 0.2)) * rpS.k);
      R.position.y -= 0.07 * atrJolt(t, M.cock[0] + 0.1, 0.24) * rpS.k;
      R.rotateX(0.12 * magSm(t, M.over) * (1 - magSm(t, M.insert)) * rpS.k);
    }
    if (rpS && rpS.t >= RPG_RELOAD.land) R.position.y -= 0.1 * atrJolt(rpS.t, RPG_RELOAD.land, 0.32);   // ống đặt lên vai, đệm nén rồi nảy lại
    const msS = F.magState && F.magState.t != null && R.userData.rifle ? F.magState : null;
    if (msS) {
      _glE.set(MAG_POSE.r[0], MAG_POSE.r[1], MAG_POSE.r[2], 'YXZ');
      R.quaternion.slerp(_glQ.setFromEuler(_glE), msS.k);
      R.position.lerp(MAG_POSE.p, msS.k);
    } else if (R.userData.rifle && F._magDirty) { const P = R.userData.rifle; P.mag.position.set(0, 0, 0); P.mag.rotation.set(0, 0, 0); P.mag.scale.setScalar(1); P.chg.position.z = 0; }
    F._magDirty = !!msS;
    R.position.x += o.gx; R.position.y += o.gy; R.position.z += o.gz;     // súng nặng trễ nhịp so với thân
    if (!F.lod || F.lod.cur < 2) rifleCollide(F, R, o.gAim / W);   // ở xa không thấy, khỏi tốn CPU
    F.root.updateMatrixWorld(true);
    const ax = (v) => v ? v.clone().transformDirection(R.matrixWorld) : null;
    const rr = F.arms[1], ll = F.arms[0], ka = (o.gAim + 0.7 * o.gReady) / W;
    if (!ll.sh0) { ll.sh0 = ll.sh.clone(); rr.sh0 = rr.sh.clone(); }
    ll.sh.copy(ll.sh0); rr.sh.copy(rr.sh0);
    // bả vai trượt ra trước khi đưa tay tới (khoảng 4 cm): vai đứng yên một chỗ thì vải sau vai võng thành rãnh sâu giữa bả vai và chỏm vai. RPG thì tay phải cầm sát vai, không vươn: đẩy vai tới làm khuỷu gập quá tầm
    const kA = o.gAim / W; const kR = o.gReady / W; ll.sh.z -= 0.18 * kA + 0.26 * ka + 0.18 * kR; if (F.weapon !== 'rpg') rr.sh.z -= 0.3 * ka; ll.sh.x += 0.06 * kA; rr.sh.y += 0.08 * kA; rr.sh.z += AIM_SHOULDER_BACK * kA * (F._aimFlex || 0);   // vai trái chỉ đưa trước khi tì má ngắm (thế sẵn sàng dùng chung 0,55 cũ -> vai dồn trước cả lúc đi)     // ngắm: co vai trái ra trước, nhún vai phải đỡ báng
    ll.sh.y += o.shLy; ll.sh.z += o.shLz; rr.sh.y += o.shRy; rr.sh.z += o.shRz;   // vai đưa trước / sau, nhấp theo bước
    // Điểm khuỷu là dữ liệu của từng vũ khí: súng nặng/rộng có thể mở khuỷu hơn, súng ngắn giữ sát sườn hơn.
    // Nội suy theo ready thay vì đẩy pole ra hàng chục centimet như công thức cũ, tránh nghiệm IK lật/gãy tay.
    const eK = c01(o.elb);
    const eR = (Gp.elbowR || V(2.75, 0.9, 0.75)).clone().lerp(Gp.elbowReadyR || V(3.1, 0.45, 0.45), eK);
    const eL = (Gp.elbowL || V(-2.35, 0.45, -0.4)).clone().lerp(Gp.elbowReadyL || V(-2.65, 0.05, -0.2), eK);
    // kéo búa: cổ tay phải lật về sau đưa ngón cái tới búa
    const rpCk = rpS ? atrJolt(rpS.t, RPG_RELOAD.cock[0] - 0.06, 0.3) : 0;
    const rpRH = !!rpS && rpgRightHand(F, rpS);
    if (!(rpRH && rpgReloadHand(F, R, rpS, rr, eR, true))) gripSolve(F, rr, R.localToWorld(Gp.gripR.clone()), { axis: rpCk ? ax(Gp.axisR).addScaledVector(ax(_gp.set(0.3, 0, 0.5)), 0.5 * rpCk).normalize() : ax(Gp.axisR), palm: ax(Gp.palmR), range: 0.45, elbow: eR, hintK: 1.1 + 1.3 * kA, ease: !!rpS, key: 'gun', frozen: F.lod && F.lod.cur > 1 });   // báng cầm quyết định hướng tay phải: ngón về đầu súng, cổ tay gập bù
    // Thế sẵn sàng: tay đỡ trượt nhẹ về sau trên ốp; lượng trượt do từng vũ khí khai báo.
    if (glP && glS.k > 0 && glReloadHand(F, R, glP, glS, ll, eL)) return;
    if (msS && magSwapHand(F, R, msS, ll, eL)) return;
    if (rpS && !rpRH && rpgReloadHand(F, R, rpS, ll, eL)) return;
    gripSolve(F, ll, (glP ? glP.fr : R).localToWorld(Gp.gripL.clone().add(_gp.set(0, 0, (Gp.readySlideL || 0) * kR))), { axis: ax(Gp.axisL), palm: ax(Gp.palmL), range: 1.0, yaw: Gp.yawL || 0, elbow: eL, hintK: 0.6, ease: !!rpS, key: 'gun', frozen: F.lod && F.lod.cur > 1 });
  }

  // ---- THAY BĂNG SÚNG BẮN TỈA: engine (Soldier.stepAtrReload) đếm giờ, đặt F.atrState = { t, T, empty }; ở đây chỉ dựng hình theo số đó ----
  // Súng giữ nguyên thế. Tay trái: với băng, bóp lẫy, rút; còn đạn thì cất vào bao hông trái, hết đạn thì thả rơi; lấy băng mới, móc mũi băng vào ổ rồi đẩy, vỗ đáy.
  // Băng rỗng: khoá nòng đang để mở sau viên cuối, tay phải rời báng cầm, đẩy khoá tới lấy viên đầu rồi hạ tay khoá.
  const ATR_RELOAD = { tac: 4.15, empty: 5.25, reach: [0.1, 0.55], press: [0.55, 0.72], pull: [0.72, 1.05], stow: [1.05, 1.5], grab: [1.5, 1.85], bring: [1.85, 2.6], seat: [2.6, 2.92], slap: [2.92, 3.1], tug: [3.1, 3.3], back: [3.3, 3.85], bReach: [3.3, 3.68], bPull: [3.68, 4.04], bRel: [4.16, 4.22], bBack: [4.38, 4.92], boltLen: 0.62, pullLen: 0.8 };
  // LÊN ĐẠN TAY sau mỗi phát (engine Soldier.stepAtrCycle đếm giờ, đặt F.atrCycle = { t, empty }): tay phải rời báng cầm, nắm núm, nâng tay khoá (nhả vấu khoá),
  // kéo hết về sau (vỏ đạn văng ra cửa bên phải), đẩy tới (tước viên kế từ băng vào buồng), hạ tay khoá rồi về báng. Viên cuối: kéo về rồi để khoá mở, chờ thay băng.
  const ATR_CYCLE = { T: 1.48, Te: 1.12, reach: [0.26, 0.5], lift: [0.5, 0.6], pull: [0.6, 0.8], eject: 0.74, push: [0.9, 1.06], lock: [1.06, 1.15], back: [1.17, 1.48], backE: [0.84, 1.12] };
  const ATR_BOLT_ROT = 0.62, ATR_BOLT_PIV = 0.51;   // tay khoá xoay quanh trục khoá (ngang tầm cần tay kéo) ~36° khi mở: núm còn thấp hơn ống kính
  function atrBoltSet(P, z, rot) {
    const a = rot * ATR_BOLT_ROT;
    P.bolt.rotation.set(0, 0, a);
    P.bolt.position.set(ATR_BOLT_PIV * Math.sin(a), ATR_BOLT_PIV * (1 - Math.cos(a)), z);
  }
  // điểm nắm tay trên tay khoá (giữa chân núm, hơi vào phía cần) theo độ kéo z và độ nâng rot
  const ATR_KNOB_X = 0.72, atrKnob = (out, z, rot) => { const a = rot * ATR_BOLT_ROT; return out.set(ATR_KNOB_X * Math.cos(a), ATR_BOLT_PIV + ATR_KNOB_X * Math.sin(a), ATR_BOLT.z + z); };
  // xung nhỏ 0..1..0 quanh mốc t0 (cú vỗ băng, khoá đóng làm súng giật khẽ)
  const atrJolt = (t, t0, d) => (t < t0 || t > t0 + d ? 0 : Math.sin((t - t0) / d * Math.PI));
  const ATR_MAG_BASE = V(0, -1.3, -1.53), ATR_MAG_GRIP = V(0, -0.78, -2.58), ATR_MAG_GRIP_P = V(0, -1.5, -1.53), ATR_MAG_GRIP_K = V(-0.5, -0.75, -1.53), ATR_MAG_CATCH_K = V(-0.45, -0.45, -1.2), ATR_MAG_C = V(0, -0.7, -1.53), _mgG = V(0, 0, 0), ATR_MAG_DIR = V(0, -0.998, -0.06), ATR_BOLT = V(0.8, 0.51, 0.08), ATR_MAG_LATCH = V(0, -0.3, -0.92);
  // tay phải nắm núm khoá: nắm tay ôm cần + chân núm từ phía sau-trên (lòng tay úp chếch ra trước), núm thò ngoài nắm tay; trục / lòng tay khai báo
  // trong hệ khoá nòng nên xoay theo tay khoá. Dò gripCost trên lính nằm bắn: hướng này phạt ~0,7 khi cho nhấc khuỷu (lift); úp tay thẳng từ trên xuống
  // thì cổ tay bẻ quá tầm (phạt 30-40, nhìn như cái vuốt). w: 1 ở núm, 0 về báng; trục / lòng tay đổi dần theo w để cổ tay không lật trong một khung
  const ATR_KNOB_AXIS = V(-1, 0, 0), ATR_KNOB_PALM = V(0, -1, -1).normalize();
  function atrBoltGrip(F, R, rr, hand, rot, w, frozen) {
    setTrigCurl(rr, w > 0.35);
    const e = _mgE.set(0, 0, rot * ATR_BOLT_ROT);
    const axis = ATR_KNOB_AXIS.clone().applyEuler(e).lerp(ATR.axisR, 1 - w).normalize().transformDirection(R.matrixWorld);
    const palm = ATR_KNOB_PALM.clone().applyEuler(e).lerp(ATR.palmR, 1 - w).normalize().transformDirection(R.matrixWorld);
    gripSolve(F, rr, hand, { axis, palm, range: 0.8, elbow: ATR.elbowR, hintK: 0.3, lift: w, ease: true, key: 'atrBolt', frozen });
    armGuard(F, rr, hand, axis, palm);
  }
  // ngón trỏ tay phải: duỗi ngoài vành cò (mặc định) hay co nắm cùng ba ngón kia
  function setTrigCurl(arm, on) {
    const T = arm && arm.hand && arm.hand.userData.trigIdx;
    if (!T || !!arm._trigCurl === on) return;
    arm._trigCurl = on; T[0].scale.setScalar(on ? 0.001 : 1); T[1].scale.setScalar(on ? 1 : 0.001);
  }
  // tay phải làm khoá nòng sau phát bắn; trả về bit 2 khi tay đang rời báng
  function atrCycleHand(F, R, P, rr, C) {
    const M = ATR_CYCLE, t = C.t, len = ATR_RELOAD.boltLen, back = C.empty ? M.backE : M.back;
    const rot = magSm(t, M.lift) * (C.empty ? 1 : 1 - magSm(t, M.lock)), z = len * (magSm(t, M.pull) - (C.empty ? 0 : magSm(t, M.push)));
    atrBoltSet(P, z, rot);
    if (t < M.reach[0] || t >= back[1]) { setTrigCurl(rr, false); return 0; }
    R.updateMatrixWorld(true);
    const g0 = R.localToWorld(ATR.gripR.clone()), knob = R.localToWorld(atrKnob(V(0, 0, 0), z, rot)), hand = V(0, 0, 0);
    const w = t < M.reach[1] ? magSm(t, M.reach) : t < back[0] ? 1 : 1 - magSm(t, back);
    hand.copy(g0).lerp(knob, w);
    atrBoltGrip(F, R, rr, hand, rot, w, F.lod && F.lod.cur > 1);
    return 2;
  }
  function atrMagPlace(P, mo, tilt, show) {
    P.mag.scale.setScalar(show ? 1 : 0.001);
    P.mag.rotation.set(tilt, 0, 0);
    _mgV.copy(ATR_MAG_BASE).applyEuler(_mgE.set(tilt, 0, 0));
    P.mag.position.copy(mo).add(ATR_MAG_BASE).sub(_mgV);
  }
  // đặt băng / khoá nòng; trả về bit: 1 tay trái đã giải, 2 tay phải đã giải
  const ATR_KNEEL_ELB_HINT = 6, ATR_HAND_SPEED = 33, ATR_ELBOW_SPEED = 24, _alP = V(0, 0, 0), _alD = V(0, 0, 0), _alW = V(0, 0, 0), _alE = V(0, 0, 0), _alT = V(0, 0, 0);   // đv / giây (~4,7 và 3,4 m/s), trên tay người khi thao tác
  // TRẦN TỐC ĐỘ TAY (hệ ngực), chạy sau mọi bộ giải: đổi giữa bộ giải nắm và IK hai đoạn, đổi điểm nắm thì nghiệm lệch nhau, cổ tay / khuỷu nhảy 2-3 đv trong 1 khung.
  // Không vượt trần thì không làm gì; vượt thì giải lại với khuỷu và cổ tay đã chặn, tay đuổi kịp sau vài khung. Súng đang giật thì bỏ qua: tay phải đi theo cú giật
  function armGuard(F, arm, target, axis, palm) {
    if (F.lod && F.lod.cur > 1) { arm._gP = null; return; }
    F.root.updateMatrixWorld(true);
    const P = arm._gP || (arm._gP = { w: V(0, 0, 0), e: V(0, 0, 0), on: false, t: 0 }), dt = F._dtA || 0.016;
    if (P.on && !(F._tPrev - P.t > 0 && F._tPrev - P.t < 1.5 * dt + 1e-4)) P.on = false;   // khung trước không qua đây (tay do bộ giải khác đặt): mốc cũ đã lỗi thời
    F.chest.worldToLocal(arm.hand.getWorldPosition(_alW)); F.chest.worldToLocal(arm.fore.getWorldPosition(_alE));
    if (P.on && !F._snap && !(F.recoil && Math.abs(recoilEnv(F.recoil)) > 0.01)) {
      const stepW = ATR_HAND_SPEED * dt, stepE = ATR_ELBOW_SPEED * dt, dW = _alD.copy(_alW).sub(P.w).length(), dE = _alP.copy(_alE).sub(P.e).length();
      if (dW > stepW || dE > stepE) {
        if (dW > stepW) _alW.copy(P.w).addScaledVector(_alD, stepW / dW);
        if (dE > stepE) _alE.copy(P.e).addScaledVector(_alP, stepE / dE);
        const pole = F.root.worldToLocal(F.chest.localToWorld(_alP.copy(_alE)));
        solveArm(F, arm, target, pole, axis, palm, 1, true);
        F.root.updateMatrixWorld(true);
        // khung tay của solveArm lệch điểm nắm một đoạn cố định: bù vào đích để cổ tay tới đúng chỗ đã chặn
        F.chest.worldToLocal(arm.hand.getWorldPosition(_alT));
        _alT.subVectors(_alW, _alT); F.chest.worldToLocal(_alD.copy(target)).add(_alT);
        solveArm(F, arm, F.chest.localToWorld(_alD), pole, axis, palm, 1, true);
        F.root.updateMatrixWorld(true);
        F.chest.worldToLocal(arm.hand.getWorldPosition(_alW)); F.chest.worldToLocal(arm.fore.getWorldPosition(_alE));
      }
    }
    P.w.copy(_alW); P.e.copy(_alE); P.on = true; P.t = F._tPrev;
  }
  function atrReloadHands(F, R, P, ll, rr, rest, elbowL) {
    const M = ATR_RELOAD, S = F.atrState, act = !!S && S.t != null, len = M.boltLen;
    if (!act) {
      if (F._atrDirty) { P.mag.position.set(0, 0, 0); P.mag.rotation.set(0, 0, 0); P.mag.scale.setScalar(1); F._atrDirty = false; }
      const C = F.atrCycle;
      if (C && C.t != null) return atrCycleHand(F, R, P, rr, C);
      setTrigCurl(rr, false);
      atrBoltSet(P, F.atrOpen ? len : 0, F.atrOpen ? 1 : 0);   // lên đạn tay: phát bắn không làm khoá chạy; viên cuối thì khoá để mở
      return 0;
    }
    F._atrDirty = true;
    // chỗ nắm băng: đứng thì lòng tay áp mặt trước thân băng; nằm / quỳ (súng dựng, đế băng chĩa sang trái) thì tay không với tới mặt trước (hụt ~1,5 đv, nắm tay lọt vào băng) -> đỡ dưới đế
    const kP = F._proneG || 0, kKn = F._atrKneelE || 0, MG = _mgG.copy(ATR_MAG_GRIP).lerp(ATR_MAG_GRIP_P, kP).lerp(ATR_MAG_GRIP_K, kKn);   // quỳ (súng dựng, băng chĩa trái): mặt phẳng lớn của băng (-x súng) quay về người -> lòng tay áp mặt đó, ngón ôm mép. Nắm từ trên mặt trước thì khuỷu giơ cao hơn vai, tay treo lủng lẳng; nắm sống lưng thì tay duỗi thẳng vẫn hụt
    const t = S.t, frozen = F.lod && F.lod.cur > 1, hand = V(0, 0, 0), mo = V(0, 0, 0), local = (out, v) => R.localToWorld(out.copy(v));
    let tilt = 0, roll = 0, show = true, flags = 0, magHeld = false;
    R.updateMatrixWorld(true);
    const base0 = local(V(0, 0, 0), MG), latch = local(V(0, 0, 0), ATR_MAG_LATCH).lerp(local(_mgB, ATR_MAG_CATCH_K), kKn), pulled = ATR_MAG_DIR.clone().multiplyScalar(M.pullLen).add(_mgB.set(0, 0, -ATR_KNEEL_LIFT * (F._atrKneelE || 0))), ready = ATR_MAG_DIR.clone().multiplyScalar(0.7).add(_mgA.set(0, 0, 0.32 - ATR_KNEEL_LIFT * (F._atrKneelE || 0)));   // quỳ (súng dựng): rút băng ra rồi nhấc lên (về phía đầu nòng), ổ băng ngang tầm đùi trái nên rút thẳng ra thì băng chui vào đùi
    // miệng bao hông trái: bàn tay thọc xuống bao (toạ độ đồ đeo, xem atrKit)
    // quỳ: đường tay tới bao đi thấp, vòng ra ngoài - trước (đi vồng lên thì nắm tay sát vai ~1,4 đv, khuỷu gập 38°, cẳng tay ép vào bắp tay)
    // quỳ: với mép trước - trên của bao (tâm bao lệch sau hông: tay bẻ ra sau, luồn sát sườn)
    const pouch = F.chest.localToWorld(V(ATR_BAG.x - 0.3 * kKn, ATR_BAG.y + 0.2 + 0.35 * kKn, ATR_BAG.z - 0.75 * kKn)), pouchUp = F.chest.localToWorld(V(ATR_BAG.x + 0.1 + ATR_KNEEL_POUCH.x * kKn, ATR_BAG.y + 1.05 + ATR_KNEEL_POUCH.y * kKn, ATR_BAG.z - 0.2 + ATR_KNEEL_POUCH.z * kKn));
    const bumpY = 1 - (1 - ATR_KNEEL_BUMP) * kKn, shW = F.chest.localToWorld(_mgV2.copy(ll.sh));
    // nắm tay cách vai ≥ ATR_REACH_MIN (khuỷu không gập chặt dưới ~70-80°: lưới khuỷu sụp)
    const keepReach = (k = 1) => { _mgA.copy(hand).sub(shW); const d = _mgA.length(); if (d < ATR_REACH_MIN && d > 1e-4) hand.copy(shW).addScaledVector(_mgA, (d + (ATR_REACH_MIN - d) * k) / d); };   // k: mạnh dần giữa đường, 0 ở hai đầu (khớp với pha kề bên, kẻo đích tay nhảy)
    const inHand = (k = 1) => { keepReach(k * (1 - kKn)); R.worldToLocal(mo.copy(hand)).sub(MG); };
    // quỳ: cất / lấy băng: băng đứng thẳng, đế xuống, mặt trước (chỗ tay nắm) quay ra trước. Đặt theo tâm băng (xc, yc, zc hệ ngực) -> điểm nắm
    const pH = (xc, yc, zc, out) => F.chest.localToWorld(out.set(xc, yc, zc).add(_mgK4.copy(MG).sub(ATR_MAG_C)));   // băng mang theo hướng ngực (trục băng = trục ngực): tay = tâm băng + lệch chỗ nắm
    const B0 = ATR_BAG, mouthY = B0.y + B0.h / 2, pOut = pH(B0.x - 0.8, mouthY + 0.6, 0.1 - 0.4, _mgK1), pEnt = pH(B0.x, mouthY + 0.35, 0.1, _mgK2), pIn = pH(B0.x, mouthY - 0.4, 0.1, _mgK3);
    if (t >= M.reach[0] && t < M.back[1]) {
      flags |= 1;
      if (t < M.reach[1]) { const e = magSm(t, M.reach); hand.copy(rest).lerp(latch, e).addScaledVector(_mgA.set(0, 0, 1).transformDirection(R.matrixWorld), 0.75 * Math.sin(e * Math.PI)); }   // vòng ra sau băng tới lẫy, đi thẳng thì cắt qua thân băng
      else if (t < M.press[1]) { const e = magSm(t, M.press); hand.copy(latch).lerp(base0, e).addScaledVector(_mgA.copy(ATR_MAG_DIR).transformDirection(R.matrixWorld), (1 - kKn) * Math.sin(e * Math.PI)); mo.set(0, 0, 0); }   // lẫy sau băng -> mặt trước: vòng dưới đế
      else if (t < M.pull[1]) { const pk = c01((t - M.pull[0]) / (M.pull[1] - M.pull[0])); mo.copy(pulled).multiplyScalar(pk * pk * (0.4 + 0.6 * pk));   // băng nặng: rít ra chậm rồi tuột nhanh
        R.localToWorld(hand.copy(MG).add(mo)); tilt = 0.12 * magSm(t, M.pull); }
      else if (t < M.stow[1]) {
        const e = magSm(t, M.stow);
        R.localToWorld(hand.copy(MG).add(pulled)); hand.lerp(pouchUp, e); hand.y += 0.5 * bumpY * Math.sin(e * Math.PI); hand.add(_mgA.copy(ATR_POUCH_ARC).transformDirection(F.chest.matrixWorld).multiplyScalar(ATR_POUCH_ARC.length() * Math.sin(e * Math.PI)));   // vòng ra trước - trái bụng, đi thẳng thì cẳng tay cắt qua bụng
        if (kKn > 0) {   // ra ngoài bao -> vào miệng bao -> ấn xuống
          if (e < 0.6) R.localToWorld(_mgA.copy(MG).add(pulled)).lerp(pOut, glSm(e / 0.6)); else if (e < 0.8) _mgA.copy(pOut).lerp(pEnt, glSm((e - 0.6) / 0.2)); else _mgA.copy(pEnt).lerp(pIn, glSm((e - 0.8) / 0.2));
          hand.lerp(_mgA, kKn);
        }
        const kr = Math.sin(e * Math.PI * 0.5); if (S.empty) { show = false; keepReach(kr); } else { inHand(kr); tilt = 0.12 + 0.5 * e; show = e < (kKn > 0.5 ? 0.995 : 0.92); }   // quỳ: chỉ tắt hình khi băng đã nằm trong bao
      } else if (t < M.grab[1]) {
        const e = magSm(t, M.grab);
        hand.copy(pouchUp).lerp(pouch, Math.sin(e * Math.PI));
        if (kKn > 0) { _mgA.copy(pIn).lerp(pEnt, glSm((e - 0.3) / 0.7)); hand.lerp(_mgA, kKn); }
        inHand(); tilt = 0.62; show = e > (kKn > 0.5 ? 0.3 : 0.5);
      } else if (t < M.bring[1]) {
        const e = magSm(t, M.bring);
        R.localToWorld(hand.copy(MG).add(ready)); hand.lerp(pouchUp, 1 - e); hand.y += 0.6 * bumpY * Math.sin(e * Math.PI); hand.add(_mgA.copy(ATR_POUCH_ARC).transformDirection(F.chest.matrixWorld).multiplyScalar(ATR_POUCH_ARC.length() * Math.sin(e * Math.PI)));
        if (kKn > 0) {
          if (e < 0.2) _mgA.copy(pEnt).lerp(pOut, glSm(e / 0.2)); else R.localToWorld(_mgA.copy(MG).add(ready)).lerp(pOut, 1 - glSm((e - 0.2) / 0.8));
          hand.lerp(_mgA, kKn);
        }
        inHand(Math.cos(e * Math.PI * 0.5)); tilt = 0.62 - 0.4 * e; roll = 0.35 * Math.sin(e * Math.PI);
      } else if (t < M.seat[1]) {
        const e = magSm(t, M.seat);
        mo.copy(ready).multiplyScalar(1 - e); tilt = 0.22 * (1 - e);   // móc mũi băng vào ổ rồi xoay thẳng
        R.localToWorld(hand.copy(MG).add(mo));
      } else if (t < M.slap[1]) {
        const q = c01((t - M.slap[0]) / (M.slap[1] - M.slap[0]));
        hand.copy(base0).lerp(local(_mgB, ATR_MAG_BASE), sm(q / 0.35)).addScaledVector(_mgA.copy(ATR_MAG_DIR).transformDirection(R.matrixWorld), 0.34 * Math.sin(q * Math.PI));   // trượt từ thân băng xuống đế rồi mới đập
        if (kKn > 0) hand.lerp(base0, kKn * (1 - glSm(q / 0.35)));   // từ chỗ nắm trượt tới đế rồi mới vỗ
      } else if (t < M.tug[1]) {
        // giật thử băng: kéo khẽ xuống, băng không ra là đã khoá
        const q = c01((t - M.tug[0]) / (M.tug[1] - M.tug[0]));
        hand.copy(local(_mgB, ATR_MAG_BASE)).lerp(base0, sm(q / 0.5)).addScaledVector(_mgA.copy(ATR_MAG_DIR).transformDirection(R.matrixWorld), 0.09 * Math.sin(q * Math.PI));
        if (kKn > 0) hand.lerp(local(_mgB, ATR_MAG_BASE), kKn * (1 - glSm(q / 0.35)));
      } else { const e = magSm(t, M.back); hand.copy(base0).lerp(rest, e); hand.addScaledVector(_mgA.set(0, 0, -1).lerp(ATR_MAG_DIR, Math.max(kP, kKn)).normalize().transformDirection(R.matrixWorld), 0.5 * Math.sin(e * Math.PI)); }   // về chỗ giữ dưới đế: vòng ra trước thân băng
      const byLatch = t < M.reach[1];
      // lòng tay áp mặt trước thân băng, ngón ôm hai bên suốt lúc rút / đưa / đẩy vào ổ (tâm nắm giữa thân băng rộng 0,5 thì nắm tay xuyên qua: ~175 khung mỗi lần thay;
      // đỡ dưới đế thì súng hạ hông làm tay duỗi thẳng xuống thắt lưng)
      const sK = t < M.slap[0] || t >= M.tug[1] ? 0 : t < M.slap[1] ? magSm(t, [M.slap[0], M.slap[0] + 0.35 * (M.slap[1] - M.slap[0])]) : 1 - magSm(t, [M.tug[0], M.tug[0] + 0.5 * (M.tug[1] - M.tug[0])]);   // úp tay đập đế: chuyển dần, đổi thẳng thì cổ tay xoay 90° trong 1 khung
      // quỳ: ngón cái chĩa về ổ băng, lòng tay áp mặt trước băng (+z súng), như lúc đứng
      const pK = V(0, 0, 1).lerp(_mgK5.set(1, 0, 0), kKn);   // quỳ: lòng tay áp mặt phẳng lớn của băng (+x súng, từ phía người)
      const axis = (byLatch ? V(0, 0.2, -1).lerp(_mgB.set(0, 0, 1), kKn) : V(0, 1, 0).lerp(_mgB.set(0, 0, 1), Math.max(kP, kKn)).lerp(_mgB.set(0, -0.1, -1), sK)).clone().normalize().transformDirection(R.matrixWorld), palm = (byLatch ? V(0.7, 0.7, 0).lerp(pK, kKn) : pK.lerp(_mgB.set(0, 1, 0), kP).lerp(_mgB.set(0.35, 0.93, 0), sK)).clone().normalize().transformDirection(R.matrixWorld);
      // xa súng (mang băng tới / về bao hông trái): hướng cầm theo người (băng chúc xuống, lòng tay vào hông), khuỷu ra ngoài - sau.
      // Giữ hướng nắm theo súng dựng thì cổ tay vặn, khuỷu trôi vào giữa ngực rồi bộ giải đổi nghiệm (nhảy ~3 đv trong một khung)
      const away = t < M.stow[0] || t >= M.bring[1] ? 0 : t < M.stow[1] ? magSm(t, M.stow) : t < M.grab[1] ? 1 : 1 - magSm(t, M.bring);
      let elb = elbowL, hk = 0.7 + ATR_KNEEL_ELB_HINT * kKn * (t < M.stow[0] ? 1 : 1 - magSm(t, M.stow));   // quỳ rút băng: gợi ý 0,7 thì bộ giải giơ khuỷu ngang cằm cho cổ tay đỡ gập, sang pha cất băng khuỷu rơi 2,3 đv trong 1 khung
      // bộ giải nắm bám khuỷu IK của khung trước, nhạt dần ~0,3 s sau khi IK thôi: lúc trả lại đã cùng nghiệm, không nhảy
      F._atrAwayK = away > 0 ? 1 : Math.max(0, (F._atrAwayK || 0) - (F._dtA || 0.016) * 3.5);
      if (F._atrAwayE && F._atrAwayK > 0) { elb = elbowL.clone().lerp(F._atrAwayE, 0.85 * F._atrAwayK); hk += 6 * F._atrAwayK; }
      if (away > 0) {
        elb = elb.clone().lerp(ATR_POUCH_ELBOW, away * 0.15); hk += 2.3 * away;
      }
      // bàn tay nắm đế băng theo đúng hướng băng (băng xoay quanh trục x súng một góc tilt): đặt tay theo cẳng tay còn băng theo súng thì nắm tay lệch lên thân băng
      // quỳ: giữa đường băng xoay đứng theo người (đế xuống, mặt trước quay ra trước): theo súng dựng thì băng nằm ngang, đâm vào hông
      const sE = t < M.stow[0] || t >= M.bring[1] ? 0 : t < M.stow[1] ? magSm(t, [M.stow[0], M.stow[0] + 0.55 * (M.stow[1] - M.stow[0])]) : t < M.grab[1] ? 1 : 1 - magSm(t, [M.bring[0] + 0.2 * (M.bring[1] - M.bring[0]), M.bring[0] + 0.75 * (M.bring[1] - M.bring[0])]);
      _mgQ1.setFromEuler(_mgE.set(tilt, 0, 0));
      R.getWorldQuaternion(_mgQ3);
      if (kKn * sE > 0) { F.chest.getWorldQuaternion(_mgQ2).premultiply(_mgQ5.copy(_mgQ3).invert()); _mgQ1.slerp(_mgQ2, kKn * sE); }
      _mgQ2.copy(_mgQ3).multiply(_mgQ1).multiply(_mgQ5.copy(_mgQ3).invert());
      axis.applyQuaternion(_mgQ2); palm.applyQuaternion(_mgQ2);
      magHeld = kKn > 0 && t >= M.pull[0] && t < M.seat[1];
      // trần tốc độ đích tay (hệ ngực): đường tay sát vai thì keepReach đẩy đích sang phía đối diện, nhảy ~2 đv / khung
      const stepH = ATR_HAND_SPEED * (F._dtA || 0.016);
      _alP.copy(hand); F.chest.worldToLocal(_alP);
      if (F._atrHP && !F._snap) { _alD.copy(_alP).sub(F._atrHP); const L = _alD.length(); if (L > stepH) { _alP.copy(F._atrHP).addScaledVector(_alD, stepH / L); F.chest.localToWorld(hand.copy(_alP)); } }
      (F._atrHP || (F._atrHP = V(0, 0, 0))).copy(_alP);
      gripSolve(F, ll, hand, { axis, palm, range: 1, elbow: elb, hintK: hk, ease: true, key: 'atrMag', frozen });
      // mang băng tới / về bao: chỉ cần tay tới đúng chỗ -> IK hai đoạn, khuỷu nối từ nghiệm cầm nắm sang ra ngoài - sau
      // (bộ giải có ràng buộc hướng nắm không có nghiệm tốt sát bao hông: tay tụt sau đích ~1,2 đv, cẳng tay lọt bụng, khuỷu nhảy)
      // IK chạy tiếp ~0,3 s sau pha mang băng (F._atrAwayK nhạt dần), khuỷu dịch dần từ chỗ IK về nghiệm cầm nắm: tắt ngay thì khuỷu nhảy ~2 đv (IK đang giơ khuỷu ngang vai, bộ giải nắm chọn khuỷu khép)
      // quỳ, thao tác ở ổ băng: khuỷu đặt theo gợi ý cố định elbowL (ra ngoài - trước), không để bộ giải nắm tự chọn: nó khép khuỷu trước bụng, cẳng tay lấn bụng ~0,66 đv
      const wK = kKn * (1 - away);
      if ((away > 0 || (F._atrAwayK > 0 && F._atrAwayE) || wK > 0) && !frozen) {
        F.root.updateMatrixWorld(true);
        // gốc gợi ý khuỷu: quỳ thì điểm cố định elbowL (khuỷu nghiệm bộ giải nắm nằm sát bụng ~0,1 đv lúc tay về ổ băng)
        const gE = ll.fore.getWorldPosition(_mgA).lerp(F.chest.localToWorld(_mgK6.copy(elbowL)), kKn);
        let eW = gE;
        if (away > 0) { const wa = c01(away * 2.5), w = wa * wa * (3 - 2 * wa); eW = gE.lerp(F.chest.localToWorld(_mgB.copy(ATR_POUCH_ELBOW)), w); }
        else if (F._atrAwayK > 0 && F._atrAwayE) { const k = F._atrAwayK * F._atrAwayK * (3 - 2 * F._atrAwayK); eW = gE.lerp(F.chest.localToWorld(_mgB.copy(F._atrAwayE)), k); }
        if (wK > 0) eW.lerp(F.chest.localToWorld(_mgB.copy(elbowL)), wK * (1 - (F._atrAwayK || 0)));
        solveArm(F, ll, hand, F.root.worldToLocal(eW.clone()), axis, palm, 1);   // hướng nắm theo băng, đích là tâm nắm
        if (away > 0) { F.root.updateMatrixWorld(true); (F._atrAwayE || (F._atrAwayE = V(0, 0, 0))).copy(F.chest.worldToLocal(ll.fore.getWorldPosition(_mgA))); }
      } else if (!(F._atrAwayK > 0)) F._atrAwayE = null;
      armGuard(F, ll, hand, axis, palm);
    } else F._atrHP = null;
    atrMagPlace(P, mo, tilt, show);
    P.mag.rotation.z = roll;
    // quỳ: băng theo đúng tay: điểm nắm của băng trùng đích tay, hướng _mgQ1 (cùng hướng dùng đặt bàn tay)
    if (magHeld) { P.mag.quaternion.copy(_mgQ1); P.mag.position.copy(R.worldToLocal(_mgA.copy(hand))).sub(_mgB.copy(MG).applyQuaternion(_mgQ1)); }
    // khoá nòng
    // băng rỗng: khoá đã để mở sau viên cuối; băng mới vào thì đẩy khoá tới (tước viên đầu vào buồng) rồi hạ tay khoá
    let bz = 0, br = 0;
    if (S.empty) { bz = len * (1 - magSm(t, M.bPull)); br = 1 - magSm(t, [M.bRel[0], M.bRel[0] + 0.1]); }
    atrBoltSet(P, bz, br);
    setTrigCurl(rr, false);
    if (S.empty && t >= M.bReach[0] && t < M.bBack[1]) {
      flags |= 2;
      const g0 = local(V(0, 0, 0), ATR.gripR), back = local(V(0, 0, 0), atrKnob(_mgA, bz, br));
      const w = t < M.bReach[1] ? magSm(t, M.bReach) : t < M.bBack[0] ? 1 : 1 - magSm(t, M.bBack);
      hand.copy(g0).lerp(back, w);
      atrBoltGrip(F, R, rr, hand, br, w, frozen);
    }
    return flags;
  }

  // súng bắn tỉa chống tăng: vác vai <-> nằm bắn trên chân chống (súng khoá ngang theo hệ gốc, đệm báng tì hốc vai)
  // biến tạm dùng chung cho các thế cầm vũ khí riêng (súng bắn tỉa, UAV cảm tử)
  const _mq = new THREE.Quaternion(), _mq2 = new THREE.Quaternion(), _mp = V(0, 0, 0), _mE = new THREE.Euler();
  // NẰM XUỐNG THEO TRÌNH TỰ (súng bắn tỉa), tiến độ k tuyến tính theo thời gian; đứng dậy chạy ngược lại. th: góc đổ hông (âm = đổ trước).
  // k .3 quỳ một gối -> .42 chân trước co gót thu về (gối gập sâu: chân duỗi giữa chừng thì mũi giày chống cả người bật lên như nhảy) -> .55 hai gối + tay trái chống đất
  // (đùi dựng đứng, thân ngang: vai thấp tới tầm tay) -> .78 hạ hông, chân duỗi dần ra sau như chống đẩy -> 1 bụng nằm trên đất, súng lên chân chống
  const PRONE_DOWN_T = 1.05, PRONE_UP_T = 0.9;
  const PRONE_AT = [0.3, 0.42, 0.55, 0.78, 1];
  const PRONE_KEYS = {
    th: [-0.1, -0.6, -1.2, -1.38, -1.5],
    lH: [1.62, 1.35, 1.3, 0.4, 0.02], lK: [1.62, 2.35, 2.0, 0.7, 0.1], lA: [0, 0.3, 0.4, -0.3, -0.8], lHz: [0.18, 0.15, 0.12, 0.1, 0.1], lHy: [0, 0, 0, 0.1, 0.22],
    rH: [0.08, 0.68, 1.22, 0.3, 0.02], rK: [1.81, 1.9, 2.0, 0.55, 0.1], rA: [0.25, 0.3, 0.4, -0.35, -0.8], rHz: [0.06, 0.08, 0.1, 0.12, 0.14], rHy: [0, 0, 0, -0.1, -0.22],
    tRx: [-0.2, -0.3, -0.3, -0.05, 0.14], chRx: [-0.1, -0.2, -0.2, 0, 0.18], hRx: [0.1, 0.45, 0.75, 0.85, 0.85]
  };
  function proneKey(key, k) {
    const T = PRONE_KEYS[key], A = PRONE_AT;
    if (k <= A[0]) return T[0];
    let i = 0; while (i < A.length - 2 && k > A[i + 1]) i++;
    const h = A[i + 1] - A[i], u = (k - A[i]) / h, u2 = u * u, u3 = u2 * u;
    const m0 = i > 0 ? (T[i + 1] - T[i - 1]) / (A[i + 1] - A[i - 1]) * h : 0, m1 = i < A.length - 2 ? (T[i + 2] - T[i]) / (A[i + 2] - A[i]) * h : 0;   // nhanh chậm liền mạch qua các khoá, dừng êm ở hai đầu
    return (2 * u3 - 3 * u2 + 1) * T[i] + (u3 - 2 * u2 + u) * m0 + (3 * u2 - 2 * u3) * T[i + 1] + (u3 - u2) * m1;
  }
  // NẰM SẤP VỚI SÚNG KHÁC (F.prone, engine đặt theo tư thế 'prone'): thân + chân theo cùng trình tự, tay vẫn cầm súng của mình, chống khuỷu ngẩng ngực.
  // y: bụng trên đất; neck / headX: ngửa cổ nhìn trước như súng bắn tỉa; crawl: biên độ hông / gối / nhịp (chu kỳ một bước bò, giây) khi bò
  const PRONE_BODY = { lH: 1, lK: 1, lA: 1, lHz: 1, lHy: 1, rH: 1, rK: 1, rA: 1, rHz: 1, rHy: 1, tRx: 1, chRx: 1, hRx: 1 };
  const PRONE_GEN = { y: FOOT_Y + 1.08, neck: -1.0, headX: 0.15, crawlH: 0.32, crawlK: 0.55, crawlRz: 0.06, crawlCyc: 1.3 };
  function pronePose(o, fire, k, gate) {
    const w = sm(k / 0.3) * gate;
    if (w <= 0) return;
    for (const key in fire) o[key] += ((PRONE_KEYS[key] ? proneKey(key, k) : fire[key]) - o[key]) * w;
  }
  // súng từ vai (nòng ra sau) xoay gần 180° lên chân chống (nòng ra trước). Slerp tự chọn đường ngắn: quanh 180° chỉ lệch chút là đảo chiều, súng nhảy 0,9 đv trong 1 khung
  // -> giữ nguyên một chiều suốt động tác (qua phía nòng chĩa lên, không quét xuống đất)
  const _aD = new THREE.Quaternion(), _aT = new THREE.Quaternion(), _aV = V(0, 0, 0);
  function atrSwing(F, q, to, u, key = '_atrD') {
    _aD.copy(q).invert().multiply(to);
    const axisLen = Math.hypot(_aD.x, _aD.y, _aD.z);
    if (axisLen < 1e-5) { q.copy(to); return; }
    const muzzleY = (sign) => { const ang = 2 * Math.atan2(sign * axisLen, sign * _aD.w) * 0.5, s0 = Math.sin(ang * 0.5) / axisLen; _aT.set(_aD.x * s0 * sign, _aD.y * s0 * sign, _aD.z * s0 * sign, Math.cos(ang * 0.5)); return _aV.set(0, 0, -1).applyQuaternion(_aT).applyQuaternion(q).y; };
    let sign = 1;
    const D0 = F[key];
    if (D0) { if (_aD.x * D0.x + _aD.y * D0.y + _aD.z * D0.z + _aD.w * D0.w < 0) sign = -1; }
    else if (muzzleY(-1) > muzzleY(1)) sign = -1;
    _aD.set(_aD.x * sign, _aD.y * sign, _aD.z * sign, _aD.w * sign);
    (F[key] || (F[key] = new THREE.Quaternion())).copy(_aD);
    const ang = 2 * Math.atan2(axisLen, _aD.w), sn = Math.sin(ang * u * 0.5) / axisLen;
    // trục (x, y, z) đã mang dấu của sign, góc đo trong (0, 2π) theo chiều đó
    _aT.set(_aD.x * sn, _aD.y * sn, _aD.z * sn, Math.cos(ang * u * 0.5));
    q.multiply(_aT);
  }
  const _kgA = V(0, 0, 0), _kgB = V(0, 0, 0), _kgM = V(0, 0, 0), _kgD = V(0, 0, 0), _kgX = V(0, 0, 0), _kgY = V(0, 0, 0), _kgZ = V(0, 0, 0), _kgMat = new THREE.Matrix4(), _kgL = V(0, 0, 0);
  // TRỌNG LƯỢNG VẬT VÁC. Người: trọng tâm súng (đo khung trước, hệ ngực) lệch phải + ra trước thì thân trên ngả ngược lại, vai chịu tải trĩu xuống; góc suy từ cân bằng mô-men
  // (mSúng x cánh tay đòn = mThânTrên x H x góc), BODY_BAL phần còn lại do hông / chân gánh. Súng: lò xo tắt dần quanh điểm tì, bị gia tốc thân kích: nhịp bước làm báng nảy, quay người thì súng trễ theo
  const BODY_UP_KG = 50, BODY_UP_H = 3, BODY_BAL = 0.35, BODY_LEAN_MAX = 0.1, SW_W = 9, SW_Z = 0.35, SW_GY = 0.28, SW_GF = 0.05, SW_MAX = 0.09;
  const _bW = V(0, 0, 0);
  function atrPose(F, o, dt) {
    const R = F.rifle, Wd = WEAPONS[F.weapon], pr = R && R.userData.probes, com = pr && pr.com;
    if (!com) return;
    const L = F._load || (F._load = { x: 0, z: 0, y0: null, vy: 0, yaw0: null, wy: 0, sp0: 0, p: 0, vp: 0, y: 0, vyw: 0, dip: 0 });
    const c = (1 - sm((o.gAim || 0) / 0.5)) * (1 - (F._atrKneelE || 0));   // gác chân chống / chống đất thì đất đỡ súng
    _bW.copy(com); R.localToWorld(_bW); F.chest.worldToLocal(_bW);
    const a = F._snap ? 1 : 1 - Math.exp(-dt * 6);
    L.x += (_bW.x - L.x) * a; L.z += (_bW.z - L.z) * a;
    const K = Wd.mass / (BODY_UP_KG * BODY_UP_H) * BODY_BAL * c, cl = v => Math.max(-BODY_LEAN_MAX, Math.min(BODY_LEAN_MAX, v));
    const side = cl(K * L.x), back = cl(-K * L.z);
    o.tRz += 0.6 * side; o.chRz += 0.4 * side;     // +z: đỉnh ngả về -x (trái), súng bên phải
    o.tRx += 0.6 * back; o.chRx += 0.4 * back;     // +x: ngả ra sau, súng phía trước
    L.dip = 0.08 * c; o.shRy -= L.dip;
    F.chest.getWorldPosition(_bW);
    const yaw = F.root.rotation.y, sp = F.gaitSpeed || 0;
    if (F._snap || L.y0 == null || !(dt > 1e-4) || dt > 0.05) { L.p = L.vp = L.y = L.vyw = L.vy = L.wy = 0; }
    else {
      const vy = (_bW.y - L.y0) / dt, ay = Math.max(-80, Math.min(80, (vy - L.vy) / dt)); L.vy = vy;
      let dy = yaw - L.yaw0; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      const wy = dy / dt, ayw = Math.max(-12, Math.min(12, (wy - L.wy) / dt)); L.wy = wy;
      const af = Math.max(-40, Math.min(40, (sp - L.sp0) / dt));
      L.vp += (-SW_W * SW_W * L.p - 2 * SW_Z * SW_W * L.vp - SW_GY * ay - SW_GF * af) * dt; L.p = Math.max(-SW_MAX, Math.min(SW_MAX, L.p + L.vp * dt));
      L.vyw += (-SW_W * SW_W * L.y - 2 * SW_Z * SW_W * L.vyw - ayw) * dt; L.y = Math.max(-SW_MAX, Math.min(SW_MAX, L.y + L.vyw * dt));
    }
    L.y0 = _bW.y; L.yaw0 = yaw; L.sp0 = sp;
  }
  function holdATR(F, o) {
    const R = F.rifle, G = ATR, kF = F._proneG || 0, parts = R.userData.atr;
    R.visible = true; R.scale.setScalar(1);
    F.root.updateMatrixWorld(true);
    const lean = o.tRx + 0.6 * o.chRx + (F._proneTh || 0);
    R.rotation.set(G.carryPitch, Math.PI + G.carryYaw + o.gYaw, G.carryRoll + o.gRoll, 'YXZ');
    R.quaternion.premultiply(_mq.setFromAxisAngle(_mp.set(1, 0, 0), -(o.gPitch + lean) * (1 - kF)));   // bù quanh trục ngang của thân (súng vác chéo: quay quanh trục súng thì chạy là súng nằm ngang qua vai)   // người đổ trước thì đầu nòng phía sau tự dốc lên: bù để góc so với đất không đổi
    const cp = F.torso.worldToLocal(F.chest.localToWorld(G.carryPocket.clone()));
    R.position.copy(cp).sub(_mp.copy(G.carryAt).applyQuaternion(R.quaternion));
    R.position.x += o.gx * 0.3; R.position.y += o.gy * 0.3; R.position.z += o.gz * 0.3;
    // THAY BĂNG KHI ĐỨNG: hạ súng khỏi vai xuống ngang hông, nòng chúc trước - trái, báng kẹp sườn phải: băng nằm trước bụng, tay trái với tới khuỷu thấp.
    // Thay băng ngay trên vai thì băng sát ngực phải, tay trái phải giơ ngang vắt qua ngực (vai áo phồng, người dùng chê "tay cầm kiểu quái gì")
    // quỳ thay băng (animateMotion đặt F._atrKneel): chốt tới khi đứng hẳn dậy để súng theo người lên xuống
    const crW = (F._mw && F._mw.crouch) || 0;
    if (F._atrKneel) F._atrKL = 1; else if (!(crW > 0.02)) F._atrKL = 0;
    const kK = F._atrKL ? c01(crW) : 0, kKe = F._atrKneelE = kK * kK * (3 - 2 * kK);
    const hipOn = !!(F.atrState && F.atrState.t != null) && !(kF > 0.02) && !F._atrKL, kH0 = F._atrHip || 0;
    const kH = F._atrHip = F._snap ? (hipOn ? 1 : 0) : c01(kH0 + (hipOn ? 1 : -1) * (F._dtA || 0.016) * G.hipRate), kHe = kH * kH * (3 - 2 * kH);
    if (kHe > 0) {
      F.torso.getWorldQuaternion(_mq).invert();
      F.root.getWorldQuaternion(_mq2);
      _mq.multiply(_mq2).multiply(_mq2.setFromEuler(_mE.set(G.hipPitch, o.gYaw + G.hipYaw, 0)));
      atrSwing(F, R.quaternion, _mq, kHe, '_atrDH');
      const hp = F.torso.worldToLocal(F.chest.localToWorld(G.hipPocket.clone())).sub(_mp.copy(G.butt).applyQuaternion(_mq));
      R.position.lerp(hp, kHe);
    } else F._atrDH = null;
    // QUỲ THAY BĂNG: quỳ gối phải, đế báng chống đất trước gối phải, súng dựng gần thẳng ngả về vai phải, băng chĩa sang trái ngang thắt lưng trước bụng;
    // tay phải nắm quai xách giữ súng đứng (sức nặng xuống đất), tay trái thay băng khuỷu gập. Nằm dọc đùi thì súng 1,4 m thò báng vào bụng
    if (kKe > 0) {
      // hướng nòng / băng theo hệ ngực: thân cúi thì đầu súng ngả theo (dựng thẳng theo đất thì nửa trên súng lấn vào ngực đang đổ tới); đế báng bám đất nên cúi càng sâu súng càng nhô lên gần vai
      const m = _kgM.copy(G.kneelDir).normalize(), d = _kgD.copy(G.kneelMagDir); d.addScaledVector(m, -d.dot(m)).normalize();
      _kgY.copy(d).negate(); _kgZ.copy(m).negate(); _kgX.crossVectors(_kgY, _kgZ);
      _mq.setFromRotationMatrix(_kgMat.makeBasis(_kgX, _kgY, _kgZ));
      // súng đứng trên đất: hướng theo hệ gốc người (đế báng cũng cố định hệ gốc); người cúi / vặn lên súng. Theo hệ ngực thì ngực quỳ đã đổ ~40°, súng chúi ra xa người
      F.root.getWorldQuaternion(_mq2); _mq.premultiply(_mq2); F.torso.getWorldQuaternion(_mq2).invert(); _mq.premultiply(_mq2);
      atrSwing(F, R.quaternion, _mq, kKe, '_atrDK');
      // đế báng: x, z trước người (hệ ngực), độ cao bám mặt đất (hệ gốc)
      // đế báng cố định trên đất (hệ gốc người): người cúi / vặn tới thì vai lại gần băng; đặt theo hệ ngực thì súng trượt ra xa theo người
      const at = _kgB.set(G.kneelButt.x, FOOT_Y + G.kneelButt.y, G.kneelButt.z);
      const kp = F.torso.worldToLocal(F.root.localToWorld(at)).sub(_mp.copy(G.kneelAt).applyQuaternion(_mq));
      R.position.lerp(kp, kKe);
    } else F._atrDK = null;
    // tay phải lên quai xách sau khi súng rời hẳn lưng (lúc tay còn do stowArms đặt mà đích chạy dọc thân súng thì khuỷu nhảy ~1,5 đv khi bàn giao)
    if (!F._atrKL) F._atrKRg = 0; else if (!((F._stowK || 0) > 0.01)) F._atrKRg = 1;   // chốt: đứng dậy về lưng thì tay vẫn ở quai, stowArms đưa tay đi
    const kKR = kKe * (F._atrKRg ? 1 : c01(1 - 2.5 * (F._stowK || 0)));
    const kG = Math.max(kF, kHe, kKe);   // hướng nắm theo súng xuôi (ngắm / hạ hông / gác đùi) hay vác ngược
    if (!(kF > 0)) F._atrD = null;
    if (kF > 0) {
      F.torso.getWorldQuaternion(_mq).invert();
      F.root.getWorldQuaternion(_mq2);
      _mq.multiply(_mq2).multiply(_mq2.setFromEuler(_mE.set(0.015 + o.gPitch, o.gYaw, 0)));
      atrSwing(F, R.quaternion, _mq, kF);
      const pk = F.torso.worldToLocal(F.chest.localToWorld(G.pocket.clone()));
      pk.sub(_mp.copy(G.butt).applyQuaternion(_mq));
      R.position.lerp(pk, kF);
    }
    // thay băng khi nằm: lăn súng sang phải, nhấc nhẹ để băng rút chếch ra phía tay trái, không cắm xuống đất
    const rlS = F.atrState;
    if (rlS && rlS.t != null && kF > 0) {
      const e = magSm(rlS.t, [0.1, 0.5]) * (1 - magSm(rlS.t, [rlS.T - 0.5, rlS.T - 0.1])) * kF;
      R.rotateZ(-0.62 * e); R.position.y += 0.28 * e;
      R.translateZ(0.5 * e);   // kéo súng về sát người để tay trái với tới băng (0,8 cũ: đế báng lún ~8 cm vào ngực; tay trái vốn duỗi hết cỡ, kéo ít hơn 0,5 thì hụt băng)
      const M = ATR_RELOAD, j = atrJolt(rlS.t, M.seat[1] - 0.06, 0.12) * 0.5 + atrJolt(rlS.t, M.slap[0] + 0.08, 0.1) + (rlS.empty ? atrJolt(rlS.t, M.bRel[0] + 0.03, 0.14) * 1.3 : 0);
      if (j) { R.rotateX(0.014 * j); R.position.y += 0.05 * j; R.translateZ(0.05 * j); }
    }
    // phát bắn: báng thúc lùi vào vai, đầu nòng nảy, chân chống bật theo
    const rc = kF * (F.recoil ? recoilEnv(F.recoil) : 0);
    if (Math.abs(rc) > 0.005) { R.translateZ(0.62 * rc); R.rotateX(0.012 * rc); R.position.y += 0.02 * Math.max(0, rc); }
    // vác / hạ hông: súng là toạ độ cứng, thân súng lún vào giáp ngực + kính ngắm sát má -> xoay quanh chỗ tì (ốp tay trên vai / báng kẹp nách)
    _kgL.copy(G.carryAt).lerp(G.butt, kHe).lerp(G.kneelAt, kKe);   // quỳ: súng đứng trên đế báng, nghiêng quanh chỗ chạm đất
    const Lw = F._load, wS = (1 - kF) * (1 - kKe), wC = 1 - kF;
    if (Lw && wS > 0.01) {   // trước bước chống lún: súng nảy gặp người thì người chặn lại
      R.position.y -= Lw.dip * wS;   // vai trĩu kéo chỗ tì xuống theo
      _kgA.copy(_kgL).applyQuaternion(R.quaternion).add(R.position);
      _mq2.setFromEuler(_mE.set(Lw.p * wS, Lw.y * wS, 0));
      R.quaternion.premultiply(_mq2); R.position.sub(_kgA).applyQuaternion(_mq2).add(_kgA);
    }
    if (!F.lod || F.lod.cur < 2) pivotCollide(F, R, R.userData.probes, _kgL, wC);
    F.root.updateMatrixWorld(true);
    // chân chống: tính hướng để đế chân chạm đúng mặt đất
    for (const leg of parts.legs) {
      const pw = F.root.worldToLocal(leg.getWorldPosition(V(0, 0, 0))), dy = Math.max(0.2, pw.y - FOOT_Y - 0.03), sp = leg.userData.sx * 0.6;
      const fw = Math.sqrt(Math.max(0.01, ATR_LEG_L * ATR_LEG_L - dy * dy - sp * sp));
      const open = _mq2.setFromUnitVectors(V(0, -1, 0), V(sp, -dy, -fw).normalize());
      leg.quaternion.copy(leg.userData.fold).slerp(open, kF);
    }
    F.root.updateMatrixWorld(true);
    const rr = F.arms[1], ll = F.arms[0], frozen = F.lod && F.lod.cur > 1, ax = (v) => v.clone().transformDirection(R.matrixWorld);
    if (!ll.sh0) { ll.sh0 = ll.sh.clone(); rr.sh0 = rr.sh.clone(); }
    ll.sh.copy(ll.sh0); rr.sh.copy(rr.sh0);
    ll.sh.y += o.shLy; ll.sh.z += o.shLz - 0.3 * kF - G.carryShL * (1 - kF) * (1 - kHe) * (1 - kKe); rr.sh.y += o.shRy + 0.08 * kF; rr.sh.z += o.shRz;
    if (rlS && rlS.t != null) ll.sh.z -= 0.75 * kF * magSm(rlS.t, [0.1, 0.5]) * (1 - magSm(rlS.t, [rlS.T - 0.9, rlS.T - 0.4]));   // vai trái đưa tới
    if (kKe > 0) ll.sh.addScaledVector(G.kneelShL, kKe);   // quỳ thay băng: bả vai trái hạ + đưa tới (~5 cm) với xuống băng ngang thắt lưng
    const onBipod0 = kF > 0.5, rl = atrReloadHands(F, R, parts, ll, rr, R.localToWorld(G.gripCarryL.clone().lerp(G.gripL, kF)), onBipod0 ? V(-1.9, 1.2, -1.8) : G.elbowCarryL.clone().lerp(G.elbowHipL, kHe).lerp(G.elbowKneelL, kKe));
    if (!(rl & 2)) {
      const tR = R.localToWorld(G.gripR.clone().lerp(G.gripKneelR, kKR)), aR = ax(G.axisCarryR.clone().lerp(G.axisR, kG).lerp(_kgL.set(0, 0, -1), kKR).normalize()), pR = ax(V(Math.cos(Math.PI * kG), 0, Math.sin(Math.PI * kG)).lerp(_kgA.set(0, -1, 0), kKR).normalize());
      gripSolve(F, rr, tR, { axis: aR, palm: pR, range: 0.45, elbow: G.elbowCarry.clone().lerp(G.elbowHipR, kHe).lerp(G.elbowKneelR, kKe).lerp(G.elbowR, kF), hintK: G.carryHint + (1.1 - G.carryHint) * kG, ease: true, key: 'atr', stay: o.gAim > 0 && o.gAim < 1, frozen });   // stay: đang nằm xuống không dò lại nghiệm: súng đang xoay, đổi nghiệm giữa chừng là khuỷu lật 45° trong 1 khung   // vác ngược (nòng ra sau): lòng tay phải quay ngược so với lúc bắn (+x -> -x hệ súng). Giữ -x thì lòng tay chĩa ra ngoài, tay duỗi đơ hoặc khuỳnh khuỷu
      armGuard(F, rr, tR, aR, pR);
    }
    const onBipod = kF > 0.5;
    if (!(rl & 1)) {
      const tL = R.localToWorld(G.gripCarryL.clone().lerp(G.gripL, kF)), aL = ax(G.axisCarryL.clone().lerp(G.axisL, kF).normalize()), pL = ax(G.palmCarryL.clone().lerp(G.palmL, kF).normalize()), hk = F._proneHand || 0;
      // lúc đổ người xuống: tay trái rời súng chống đất trước mặt (hệ root, chốt lúc bắt đầu chống để bàn tay đứng yên trên đất), tay phải vẫn giữ súng
      if (hk > 0) {
        if (!F._phT) { const Sp = F.root.worldToLocal(F.chest.localToWorld(ll.sh.clone())); F._phT = V(Sp.x + 0.15, FOOT_Y + 0.2, Sp.z - 3.9); }
        tL.lerp(F.root.localToWorld(F._phT.clone()), hk);
        aL.lerp(_mp.set(1, 0, 0).transformDirection(F.root.matrixWorld), hk).normalize();
        pL.lerp(_mp.set(0, -1, 0).transformDirection(F.root.matrixWorld), hk).normalize();
      } else F._phT = null;
      gripSolve(F, ll, tL, { axis: aL, palm: pL, range: hk > 0.5 ? 0.3 : 1.0, elbow: G.elbowCarryL.clone().lerp(G.elbowHipL, kHe).lerp(G.elbowKneelL, kKe).lerp(G.elbowL, kF), hintK: 12 + (0.8 - 12) * kF, ease: true, key: 'atr', stay: o.gAim > 0 && o.gAim < 1, frozen });
      armGuard(F, ll, tL, aL, pL);
    }   // nội suy theo kF, lòng bàn tay trái chuyển dần (palmCarryL ngửa -> palmL): đổi thẳng ở 0,5 thì khuỷu giật 30-38° trong 1 khung
  }

  // UAV cảm tử. F.kamiSeq: giây trong một lượt phóng (null = không), F.kamiLeft: số ống còn trên lưng, F.kamiCtl: đang lái UAV
  // (quỳ, hai tay cầm máy điều khiển, cúi nhìn màn hình)
  const _kq = new THREE.Quaternion(), _kq2 = new THREE.Quaternion(), _kA = V(0, 0, 0), _kB = V(0, 0, 0), _kS = V(0, 0, 0);
  function kamiStance(F, type) { return F.kamiSeq != null || F.kamiCtl ? 'crouch' : type; }
  function kamiPose(F, o, dt) {
    if (F.kamiSeq == null && !F.kamiCtl) { o.shLy = o.shLz = o.shRy = o.shRz = 0; }   // tay rảnh: hai vai cân, không đưa vai trái ra trước như cầm súng
    // không cầm súng: bỏ góc cố định của thế súng (thân vặn, đầu bù xoay / áp má), thay bằng dáng người rảnh tay: đầu hơi nghiêng,
    // đảo nhìn chậm; đứng nghỉ thì dồn trọng tâm sang chân trái, gối phải chùng, hông và vai lệch (đứng thẳng đối xứng trông như ma-nơ-canh)
    const free = F.kamiSeq == null && !F.kamiCtl ? 1 : 0, tI = F._kIdT = (F._kIdT || 0) + dt;
    o.hRy = 0.3 * kamiNoise(tI, 0.11, 0.27) * free; o.hRz = 0.035 + 0.02 * kamiNoise(tI, 0.19, 0.41); o.tRy = -0.05 + 0.05 * kamiNoise(tI, 0.08, 0.21); o.hRx *= 0.35;
    const iw = (F._mw && F._mw.idle || 0) * free;
    o.px += 0.09 * iw; o.pRz += 0.035 * iw; o.tRz -= 0.03 * iw; o.chRz += 0.02 * iw; o.rK += 0.14 * iw; o.rH += 0.04 * iw; o.shRy -= 0.05 * iw;
    // quỳ rảnh tay: đổ người về trước một chút để tay trái tì được lên gối trái đang dựng (holdKami)
    const restTo = (F._mw && F._mw.crouch || 0) > 0.5 && F.kamiSeq == null && !F.kamiCtl ? 1 : 0, r0 = F._kRest || 0;
    const kRest = F._kRest = F._snap ? restTo : r0 + Math.max(-dt * 2.5, Math.min(dt * 2.5, restTo - r0));
    o.tRx -= 0.17 * kRest; o.chRx += 0.07 * kRest; o.hRx += 0.16 * kRest;   // ngực mở, đầu ngẩng nhìn trước (khom cả lưng + cổ thì trông khép nép)   // không cầm súng: bỏ thế áp má ngắm (đầu ngoảnh / nghiêng, thân vặn) thừa hưởng từ dáng súng; trình tự phóng tự cộng góc của nó bên dưới
    // tiến đều (không hàm mũ): 0..0,5 tay với tới máy trên giá, 0,5..1 nhấc máy ra trước mặt (holdKami)
    const kTo = (F.kamiCtl || (F.kamiSeq != null && F.kamiSeq > KAMI_SEQ.arm)) ? 1 : 0, k0 = F._kamiCtlK || 0;
    const k = F._kamiCtlK = F._snap ? kTo : k0 + Math.max(-dt * 1.4, Math.min(dt * 1.4, kTo - k0));
    // bỏ thế quỳ ngắm súng (thân vặn, đầu áp má): thân thẳng, đầu cúi nhìn màn hình
    o.tRy *= 1 - k; o.tRx += (KAMI.lean[0] - o.tRx) * k; o.chRx += (KAMI.lean[1] - o.chRx) * k; o.hRx += (KAMI.lean[2] - o.hRx) * k; o.hRy *= 1 - k; o.hRz *= 1 - k;
    const T = F._kamiT = (F._kamiT || 0) + dt;
    const I = F.kamiIn, kS = F._snap ? 1 : Math.min(1, dt * 9);
    F._kTurn = (F._kTurn || 0) + ((I ? I.turn : 0.7 * kamiNoise(T, 1.3, 2.7)) - (F._kTurn || 0)) * kS;
    F._kPitch = (F._kPitch || 0) + ((I ? I.pitch : 0.6 * kamiNoise(T, 1.7, 3.1)) - (F._kPitch || 0)) * kS;
    F._kBoost = (F._kBoost || 0) + ((I ? (I.boost ? 1 : 0) : 0.25 + 0.25 * kamiNoise(T, 0.5, 1.1)) - (F._kBoost || 0)) * kS;
    o.tRz -= 0.05 * k * F._kTurn; o.tRx += 0.03 * k * F._kPitch;   // bất giác nghiêng người theo tay lái
    o.hRy += 0.07 * k * kamiNoise(T, 0.5, 1.3); o.hRx += 0.05 * k * kamiNoise(T, 0.9, 0.31);
    const t = F.kamiSeq;
    if (t == null) return;
    const S = KAMI_SEQ;
    const tw = kamiSeg(t, 0, 0.35) * (1 - kamiSeg(t, S.grab + 0.05, S.grab + 0.45));   // với tay phải ra sau lưng: vặn ngực, nghiêng vai
    o.chRy -= 0.42 * tw; o.tRy -= 0.2 * tw; o.hRy -= 0.35 * tw; o.chRz += 0.08 * tw;
    const down = kamiSeg(t, S.grab + 0.2, S.set) * (1 - kamiSeg(t, S.set + 0.2, S.arm + 0.3));   // cúi đặt ống xuống đất, nhìn ống
    o.tRx -= 0.3 * down; o.chRx -= 0.1 * down; o.hRx -= 0.22 * down; o.tRy -= 0.24 * down; o.tRz -= 0.16 * down;
    const flipK = kamiSeg(t, S.plant - 0.15, S.plant + 0.15) * (1 - kamiSeg(t, S.flip, S.flip + 0.3));   // tay trái gạt chân chống: đưa vai trái xuống, ra trước
    o.shLz -= 0.5 * flipK; o.shLy -= 0.25 * flipK; o.tRx -= 0.08 * flipK; o.tRy -= 0.1 * flipK;
    const armK = kamiSeg(t, S.set - 0.3, S.set) * (1 - kamiSeg(t, S.arm - 0.1, S.arm + 0.2));   // chúi người + đưa vai phải ra rút chốt an toàn trên ống
    o.tRx -= 0.1 * armK; o.chRx -= 0.06 * armK; o.tRy -= 0.2 * armK; o.chRy -= 0.22 * armK; o.shRz -= 0.5 * armK; o.shRy -= 0.25 * armK;
    const f = t - S.launch;
    if (f > 0) { const j = Math.exp(-f * 8); o.hRy += 0.22 * j; o.tRx += 0.05 * j; }   // khí nén phụt cạnh người: quay mặt tránh
  }
  // tiến một lượt: cb('grab' | 'set' | 'arm' | 'launch' | 'end')
  function stepKamiSeq(F, dt, cb) {
    if (F.kamiSeq == null) return;
    const t0 = F.kamiSeq, t1 = t0 + dt;
    F.kamiSeq = t1;
    for (const ev of ['grab', 'set', 'arm', 'launch']) if (t0 < KAMI_SEQ[ev] && t1 >= KAMI_SEQ[ev]) cb(ev);
    if (t1 >= KAMI_SEQ.end) { F.kamiSeq = null; cb('end'); }
  }
  // ống đang đặt đất: miệng ống + hướng phóng (thế giới), và vị trí / hướng cả ống để bỏ lại ống rỗng
  function kamiTubeWorld(F) {
    F.root.updateMatrixWorld(true);
    _kq.setFromEuler(_mE.set(KAMI_EL, 0, 0));
    const dir = V(0, 0, -1).applyQuaternion(_kq).transformDirection(F.root.matrixWorld);
    const base = F.root.localToWorld(KAMI.base.clone());
    F.root.getWorldQuaternion(_kq2);
    // ống rỗng: gạt sang bên phải, nằm trên đất; mỗi ống một chỗ để phóng liên tiếp tại chỗ không chồng lên nhau
    const nLeft = F.kamiLeft === undefined ? 0 : F.kamiLeft;
    const dropBase = F.root.localToWorld(V(4.1 + nLeft * 2.4, FOOT_Y + KAMI_R + 0.02, -0.6 - nLeft * 1.1));
    const dropQuat = _kq2.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -0.55 + nLeft * 0.16, 0)));
    return { pos: base.clone().addScaledVector(dir, KAMI_L + 0.4 * F.root.scale.x), dir, base, quat: _kq2.clone().multiply(_kq), len: KAMI_L, dropBase, dropQuat };
  }
  // đặt ngón cái lên núm cần lái: xoay xương ngón từ dáng nắm về hướng núm, duỗi vừa đủ (chặn trong tầm ngón thật)
  const KAMI_THUMB_DIR = V(-0.3, 0.46, 0.13), KAMI_THUMB_L = 0.56, KAMI_FREE_CURL = 0.35;   // tay rảnh: ngón khum nhẹ thả lỏng, không duỗi thẳng đơ
  function kamiThumb(arm, stick, kc, relax) {
    const th = arm.hand.userData.thumb;
    if (!th) return;
    const k = kamiSeg(kc, 0.6, 1);
    // tay rảnh: ngón cái khép về phía ngón trỏ, không chĩa ra
    const rest = _kq2.setFromEuler(_mE.set(0, -arm.s * 0.14 * relax, 0));   // tay thả lỏng: ngón cái chìa ra trước lòng bàn tay, đầu ngón hướng vào đốt giữa ngón trỏ (ép thẳng dọc mép ngón trỏ trông như tay gỗ)
    if (k <= 0) { th.quaternion.copy(rest); th.scale.setScalar(1); return; }
    const p = arm.hand.worldToLocal(stick.localToWorld(V(0, 0, 0.15))).sub(th.position);
    const d = p.length(), dir0 = V(KAMI_THUMB_DIR.x, KAMI_THUMB_DIR.y, KAMI_THUMB_DIR.z * arm.s).normalize();
    th.quaternion.copy(rest).slerp(_kq.setFromUnitVectors(dir0, p.normalize()), k);
    th.scale.setScalar(1 + (Math.min(1.12, d / KAMI_THUMB_L) - 1) * k);
    arm.thumbGap = d - KAMI_THUMB_L * 1.12;
  }
  // ống rỗng bỏ lại: gốc tại đáy, nòng -z, miệng hở thấy lòng ống
  function kamiEmptyGeo() {
    const r = KAMI_R;
    return GEO.kamiEmpty || (GEO.kamiEmpty = new THREE.LatheGeometry([[0, 0], [r + 0.03, 0], [r + 0.045, 0.1], [r + 0.045, 0.3], [r, 0.36], [r, 5.06], [r + 0.03, 5.1], [r + 0.03, 5.28], [r - 0.05, 5.3], [r - 0.05, 0.4], [0, 0.4]].map(q => new THREE.Vector2(q[0], q[1])), 24).rotateX(-Math.PI / 2));
  }
  const ARM_EASE_BONES = ['up', 'upS', 'fix', 'clav', 'fore', 'hand', 'delt'];
  function armSnap(arm, out) {
    out = out || ARM_EASE_BONES.map(() => [V(), new THREE.Quaternion(), V()]);
    ARM_EASE_BONES.forEach((n, i) => { const b = arm[n]; if (b) { out[i][0].copy(b.position); out[i][1].copy(b.quaternion); out[i][2].copy(b.scale); } });
    return out;
  }
  function armEase(arm, prev, k) {
    ARM_EASE_BONES.forEach((n, i) => { const b = arm[n], p = prev[i]; if (!b) return; b.position.lerpVectors(p[0], b.position, k); b.scale.lerpVectors(p[2], b.scale, k); _kq.copy(b.quaternion); b.quaternion.copy(p[1]).slerp(_kq, k); });
  }
  function holdKami(F, o) {
    const R = F.rifle, G = KAMI, S = KAMI_SEQ, t = F.kamiSeq, parts = R.userData.kami, frozen = F.lod && F.lod.cur > 1;
    const tubes = F.chest.userData.kamiTubes, pad = F.chest.userData.kamiPad;
    const left = F.kamiLeft === undefined ? 3 : F.kamiLeft;
    const inHand = t != null && t >= S.grab && t < S.end;
    F.root.updateMatrixWorld(true);
    // ống trên lưng: đúng số ống còn lại (ống đang cầm đã trừ ra từ lúc rút)
    if (tubes) tubes.forEach((tb, i) => tb.scale.setScalar(i < left ? 1 : 0.001));
    const rr = F.arms[1], ll = F.arms[0];
    if (!ll.sh0) { ll.sh0 = ll.sh.clone(); rr.sh0 = rr.sh.clone(); }
    ll.sh.copy(ll.sh0); rr.sh.copy(rr.sh0);
    ll.sh.y += o.shLy; ll.sh.z += o.shLz; rr.sh.y += o.shRy; rr.sh.z += o.shRz;
    // máy điều khiển: từ túi ngực ra trước mặt
    // tay chạm máy trên giá trước (kH), rồi máy mới rời giá theo tay (kc); máy không tự bay ra
    const kH = kamiSeg(F._kamiCtlK || 0, 0, 0.45), kc = kamiSeg(F._kamiCtlK || 0, 0.58, 1);   // giữa hai đoạn: tay đã nắm, ngón bấu mép máy rồi mới rút (~0,1 s)
    if (pad) {
      pad.position.copy(G.pad).lerp(G.padHold, kc);
      const kT = F._kamiT || 0, kO = kamiSeg(kc, 0.45, 1);
      pad.rotation.set(-G.padTilt * kO - 0.05 * kO * (F._kPitch || 0) + 0.015 * kO * kamiNoise(kT, 0.8, 0.37), 0, -0.09 * kO * (F._kTurn || 0) + (Math.PI / 2) * (1 - kamiSeg(kc, 0.1, 0.75)));
      if (pad.userData.grips) for (const gr of pad.userData.grips) gr.rotation.x = KAMI_GRIP.open * kamiSeg(kc, 0.35, 0.9);
      if (F.chest.userData.kamiClips) F.chest.userData.kamiClips.scale.z = 1 - 0.9 * kamiSeg(kc, 0.1, 0.5);
      const sk = pad.userData.sticks;
      // cần phải: rẽ + ngóc chúc; cần trái: lực đẩy (Shift đẩy cần lên)
      if (sk) { sk[1].rotation.set(-0.38 * kO * (F._kPitch || 0), 0.38 * kO * (F._kTurn || 0), 0); sk[0].rotation.set(-0.38 * kO * (F._kBoost || 0), 0, 0); }
      kamiScreen(pad, kO > 0.5 && !(F.lod && F.lod.cur > 1));
      
      const kAnt = kamiSeg(kc, 0.55, 1);
      if (pad.userData.ants) for (const a of pad.userData.ants) a.rotation.z = a.userData.sx * (KAMI_ANT_FOLD + (KAMI_ANT_OPEN - KAMI_ANT_FOLD) * kAnt);
      pad.updateMatrixWorld(true);
    }
    if (!inHand) { R.scale.setScalar(0.001); R.position.set(0, 0, 0); }
    else {
      R.visible = true; R.scale.setScalar(1);
      // đích: ống nằm trên đất, ngóc KAMI_EL; đầu: ống trên lưng (ống thứ `left`, vừa rút ra)
      F.root.getWorldQuaternion(_kq2);
      const elNow = KAMI_EL_PLANT + (KAMI_EL - KAMI_EL_PLANT) * kamiSeg(t, S.flip, S.set);   // chống đáy dốc, bung chân rồi mới hạ ống
      const qEnd = _kq2.clone().multiply(_kq.setFromEuler(_mE.set(elNow, 0, 0)));
      const pEnd = F.root.localToWorld(G.base.clone());
      const src = tubes && tubes[Math.min(tubes.length - 1, left)];
      const u = kamiSeg(t, S.grab, S.plant);
      let pW, qW;
      if (src && u < 1) {
        src.updateMatrixWorld(true);
        const p0 = src.getWorldPosition(V(0, 0, 0)), q0 = src.getWorldQuaternion(new THREE.Quaternion());
        const via = F.root.localToWorld(G.via.clone()), a = 1 - u;
        pW = p0.multiplyScalar(a * a).addScaledVector(via, 2 * a * u).addScaledVector(pEnd, u * u);
        qW = q0.slerp(qEnd, u);
      } else { pW = pEnd; qW = qEnd; }
      F.torso.getWorldQuaternion(_kq).invert();
      R.quaternion.copy(_kq).multiply(qW);
      R.position.copy(F.torso.worldToLocal(pW));
      F.root.updateMatrixWorld(true);
      // tay trái gạt chân từ dáng xếp ra dáng chống; hướng + độ dài tính theo tư thế cuối (ống ngóc KAMI_EL, đế chạm đất), chân không co giãn lúc bung
      const kL = kamiSeg(t, S.plant + 0.15, S.flip);
      const qEl = new THREE.Quaternion().setFromEuler(new THREE.Euler(KAMI_EL, 0, 0)), qElInv = qEl.clone().invert();
      for (const leg of parts.legs) {
        const pv = leg.position.clone().applyQuaternion(qEl).add(G.base), dy = Math.max(0.2, pv.y - FOOT_Y - 0.03);
        const d = V(leg.userData.sx * 0.72, -dy, -0.14 * dy), len = d.length();   // -z: phía miệng ống
        const dirL = d.normalize().applyQuaternion(qElInv);
        leg.quaternion.copy(leg.userData.fold).slerp(new THREE.Quaternion().setFromUnitVectors(V(0, -1, 0), dirL), kL);
        leg.scale.set(1, len / KAMI_LEG_L, 1);
        const ft = leg.userData.foot;
        if (ft) { ft.quaternion.identity().slerp(qEl.clone().multiply(leg.quaternion).invert(), kL); ft.scale.set(1, KAMI_LEG_L / len, 1); }
      }
      F.root.updateMatrixWorld(true);
    }
    const axT = V(0, 0, -1).transformDirection(R.matrixWorld);
    const palmR = V(-0.9, -0.42, 0).transformDirection(R.matrixWorld), palmL = V(0.9, -0.42, 0).transformDirection(R.matrixWorld);
    // tay khi không cầm gì (bắp tay phải hở khỏi túi đeo hai sườn áo giáp, không ép sát thân): buông thả lỏng hơi trước đùi (khuỷu chùng, hai tay lệch nhau chút), vung theo bước (ra trước nhiều, ra sau ít: khuỷu lùi sau thì đâm vào túi bộ đàm bên sườn);
    // quỳ thì cẳng tay trái gác lên gối trái đang dựng, bàn tay thả lỏng trước gối; tay phải buông dọc đùi phải (vắt chéo sang đùi trái thì cẳng tay xuyên bụng)
    const MW = F._mw || {}, gaitW = c01((MW.walk || 0) + (MW.patrol || 0) + (MW.run || 0));
    const mv = Math.max(c01(Math.abs(F.moveV || 0) / 10), gaitW), sw = 0.5 * Math.sin((F._ph || 0) * Math.PI * 2) * mv;
    const kneelK = c01(MW.crouch || 0) * (1 - (F._proneK || 0));
    const freeR = F.chest.localToWorld(V(2.5, -2.2 + Math.abs(sw) * 0.5, -0.8 + sw * (sw > 0 ? 1.0 : 3.0))).lerp(F.root.localToWorld(V(2.75, -4.3, -0.7)), kneelK);
    const freeL = F.chest.localToWorld(V(-2.45, -2.15 + Math.abs(sw) * 0.5, -0.95 - sw * (sw > 0 ? 3.0 : 1.0))).lerp(F.root.localToWorld(G.kneeRest), kneelK);
    // trên giá máy treo dọc: hai tay nắm hai mép dài (hệ máy ±y); xoay máy ra thì điểm nắm trượt dần về góc dưới (padGrip)
    // trên giá lòng bàn tay quay vào mép dọc, ngón khum bấu qua mép ra mặt ngoài (mặt trong tì đệm, ngón không luồn ra sau được); hướng tay cũng trượt dần theo gK
    const gK = kamiSeg(kc, 0, 0.75), gR = G.padRack.clone().lerp(G.padGrip, gK), gL = V(G.padRack.x, -G.padRack.y, G.padRack.z).lerp(V(-G.padGrip.x, G.padGrip.y, G.padGrip.z), gK);
    const padR = pad ? pad.localToWorld(gR) : freeR, padL = pad ? pad.localToWorld(gL) : freeL;
    // như cầm máy tính bảng: lòng bàn tay áp mặt lưng máy, ngón duỗi chếch lên dọc lưng máy, ngón cái vòng qua mép lên cần lái; cẳng tay chạy xuôi theo mặt máy về khuỷu
    // trộn trong hệ thế giới: hướng lúc nắm trên giá cố định theo ngực (máy treo dọc: hệ máy xoay Rz 90°), hướng cầm theo máy; trộn trong hệ máy thì lúc máy xoay trục nắm lệch ngang, cổ tay gập ~80°
    const pDir = (rack, hold) => V(-rack.y, rack.x, rack.z).transformDirection(F.chest.matrixWorld).lerp(hold.clone().transformDirection(pad.matrixWorld), gK).normalize();
    const RA = G.padRackAx, RP = G.padRackPalm;
    const padAxR = pad ? pDir(RA, V(0.42, 0.91, 0).normalize()) : axT, padAxL = pad ? pDir(V(RA.x, -RA.y, RA.z), V(-0.42, 0.91, 0).normalize()) : axT;
    const padPalmR = pad ? pDir(RP, V(0, 0, 1)) : null, padPalmL = pad ? pDir(V(RP.x, -RP.y, RP.z), V(0, 0, 1)) : null;
    let tR = freeR.clone().lerp(padR, kH), tL = freeL.clone().lerp(padL, kH), aR = null, aL = null, gripR = kH > 0.5, gripL = kH > 0.5, reach = false;
    let wR = 1, wL = 1;   // trọng số chuyển từ thế cầm ống sang thế cầm máy: hướng tay, lòng bàn tay, khuỷu trộn dần (đổi phắt thì cổ tay giật một khung)
    if (t != null) {
      if (t < S.grab) {
        // với tay phải qua vai tới miệng ống trên lưng
        const src = tubes && tubes[Math.min(tubes.length - 1, Math.max(0, left - 1))];
        // như rút tên khỏi ống: khuỷu giơ lên ngang tai, nắm dọc theo thân ống, lòng bàn tay úp vào ống phía sau vai
        if (src) { src.updateMatrixWorld(true); tR = tR.lerp(src.localToWorld(_kS.set(0, 0, -KAMI_L + 0.4)).clone(), kamiSeg(t, 0, S.grab - 0.08)); aR = V(0, 0, -1).transformDirection(src.matrixWorld); }
        else aR = V(0, 1, 0).transformDirection(F.chest.matrixWorld);
        gripR = true; reach = true;
      } else if (t < S.end) {
        const hold = R.localToWorld(G.gripHold.clone()), top = R.localToWorld(G.gripTop.clone()), arm = R.localToWorld(G.gripArm.clone()), mid = R.localToWorld(G.gripMid.clone());
        // tay phải: cầm gần miệng ống khi mang -> hộp kích hoạt khi mở khoá / phóng -> về máy điều khiển
        wR = kamiSeg(t, S.arm - 0.05, S.arm + 0.28); wL = kamiSeg(t, S.set + 0.1, S.arm + 0.3);
        tR = top.lerp(arm, kamiSeg(t, S.set - 0.15, S.set + 0.15)).lerp(padR, wR);
        // tay trái: đỡ giữa ống khi đưa xuống, giữ ống lúc phóng, rồi cầm máy điều khiển
        const legL = parts.legs[0], onLeg = legL ? legL.localToWorld(_kS.set(0, -KAMI_LEG_L * KAMI_LEG_GRIP, 0)).clone() : mid;
        tL = freeL.clone().lerp(mid, kamiSeg(t, S.grab + 0.1, S.grab + 0.5)).lerp(onLeg, kamiSeg(t, S.plant - 0.1, S.plant + 0.15)).lerp(hold, kamiSeg(t, S.flip - 0.05, S.flip + 0.25)).lerp(padL, wL);
        // đi vòng ra trước ngực: nội suy thẳng từ ống dưới đất lên giá thì bàn tay cắt qua đùi, chui dưới đáy máy
        const bow = V(0, 0.2, -1).transformDirection(F.chest.matrixWorld).multiplyScalar(F.root.scale.x);
        tR.addScaledVector(bow, 1.1 * Math.sin(Math.PI * wR)); tL.addScaledVector(bow, 1.1 * Math.sin(Math.PI * wL));
        aR = wR > 0.5 ? null : axT; aL = wL > 0.5 ? null : axT; gripR = gripL = true;
      }
    }
    const pole = (s) => F.chest.localToWorld(V(s * 2.6, -0.5, 3.2)).applyMatrix4(_inv(F.root));
    const thumbFwd = s => V(-s * 0.47, 0.12, -1).lerp(s < 0 ? V(0.85, 0.1, -0.5) : V(-0.47, 0.12, -1), kneelK).normalize().transformDirection(F.root.matrixWorld);   // quỳ: bàn tay trái rủ trước gối, ngón cái quay vào trong   // tay buông: ngón cái chĩa trước và xoay vào trong ~25° như tay người thả lỏng (chĩa thẳng thì nhìn chính diện chỉ thấy cạnh bàn tay); tính theo gốc người vì ngực đứng hơi xoay, theo ngực thì hai tay lệch nhau
    const padMove = (kH > 0 && kH < 1) || (kc > 0 && kc < 1);   // máy / điểm nắm đang chạy: bộ giải bám sát (spec.track)
    // bàn tay xoay về hướng nắm ngay nửa đầu quãng đưa tay (trộn đều suốt quãng thì giữa đường lòng tay ngửa lên như xin)
    const oR = kamiSeg(wR, 0, 0.55), oL = kamiSeg(wL, 0, 0.55);
    // khuỷu: nắm máy trên giá thì choãi ra ngoài + ra trước (padRackElbowR), xoay máy ra thì về khuỷu của thế cầm; dùng chung padElbow (z +0,8) thì khuỷu lùi sau thân, áp sườn
    const padElR = G.padRackElbowR.clone().lerp(G.padElbowR, gK), padElL = V(-G.padRackElbowR.x, G.padRackElbowR.y, G.padRackElbowR.z).lerp(G.padElbowL, gK);
    const mixR = (a, b) => oR >= 1 ? b : a.clone().lerp(b, oR).normalize(), mixL = (a, b) => oL >= 1 ? b : a.clone().lerp(b, oL).normalize();
    if (gripR) gripSolve(F, rr, tR, { axis: reach ? aR : mixR(axT, padAxR), palm: reach ? V(0.15, -0.25, 1).transformDirection(F.chest.matrixWorld) : mixR(palmR, padPalmR || V(-1, 0, 0).transformDirection(F.chest.matrixWorld)), range: 0.9, elbow: reach ? G.elbowReach : G.elbowR.clone().lerp(padElR, wR), hintK: reach ? 2.5 : (0.8 + (G.padHintK - 0.8) * wR), key: reach ? 'kamiReach' : aR ? 'kami' : 'kamiPad', flip: !!aR, track: !reach && (padMove || wR < 1), frozen });   // máy: luôn cầm xuôi chiều báng (cho lật thì lúc máy còn xoay trên giá bộ giải chọn cầm ngược, lật tay giữa chừng)
    else solveArm(F, rr, tR, pole(1), thumbFwd(1));
    if (gripL) gripSolve(F, ll, tL, { axis: mixL(axT, padAxL), palm: mixL(palmL, padPalmL || V(1, 0, 0).transformDirection(F.chest.matrixWorld)), range: 0.9, elbow: G.elbowL.clone().lerp(padElL, wL), hintK: (0.8 + (G.padHintK - 0.8) * wL), key: aL ? 'kami' : 'kamiPad', flip: !!aL, track: padMove || wL < 1, frozen });
    else if (kneelK > 0.5) gripSolve(F, ll, tL, { axis: V(1, 0, 0).transformDirection(F.root.matrixWorld), palm: V(0, -1, 0.15).normalize().transformDirection(F.root.matrixWorld), range: 0.5, elbow: V(-4.2, -0.2, 0.3), hintK: 3, key: 'kamiKnee', frozen });   // lòng bàn tay úp lên đầu gối, ngón rủ qua gối về trước
    else solveArm(F, ll, tL, pole(-1), thumbFwd(-1));
    // đổi giữa tay buông (solveArm) và tay nắm (gripSolve) thì mặt phẳng khuỷu khác hẳn: khuỷu nhảy ~30 cm trong một khung -> trôi dần từ tư thế khung trước
    for (const [A, g] of [[rr, gripR ? (reach ? 3 : aR ? 2 : 1) : 0], [ll, gripL ? (aL ? 2 : 1) : kneelK > 0.5 ? 4 : 0]]) {
      if (A._kGrip !== undefined && A._kGrip !== g && !F._snap) A._kEase = 1;
      A._kGrip = g;
      if (A._kEase > 0.02 && A._kPrev) { armEase(A, A._kPrev, 0.25); A._kEase *= 0.75; }
      A._kPrev = armSnap(A, A._kPrev);
    }
    const fS = F._snap ? 1 : 0.18;
    // máy còn trên giá / đang xoay ra: ngón khum bấu mép (gK < 0,5); đã cầm như máy tính bảng thì ngón duỗi
    const onPadR = gripR && !aR && !reach && (kH < 0.85 || gK > 0.5), onPadL = gripL && !aL && (kH < 0.85 || gK > 0.5);   // đỡ lưng máy: ngón duỗi áp mặt lưng, không khum thành nắm đấm
    // đang đưa tay tới máy (chưa chạm): ngón khum nhẹ thả lỏng (0,62: dáng mở, cong ~0,2), không duỗi thẳng đơ
    const goR = gripR && !reach && !aR && (wR < 1 || kH < 0.85) && gK < 0.5, goL = gripL && !aL && (wL < 1 || kH < 0.85) && gK < 0.5;
    F._fingR = (F._fingR || 0) + ((gripR && !onPadR ? 0 : goR ? 0.62 : 1) - (F._fingR || 0)) * fS; F._fingL = (F._fingL || 0) + ((gripL && !onPadL ? 0 : goL ? 0.62 : 1) - (F._fingL || 0)) * fS;
    F._thR = (F._thR || 0) + ((gripR ? 0 : 1) - (F._thR || 0)) * fS; F._thL = (F._thL || 0) + ((gripL ? 0 : 1) - (F._thL || 0)) * fS;
    for (const [A, k] of [[rr, F._fingR], [ll, F._fingL]]) if (A.hand.userData.fingers) { const g = A.hand.userData.fingers, r = A.hand.userData.fingersFree, on = k > 0.5; g.rotation.z = -0.5 * k; r.rotation.z = 0.5 * (1 - k) + KAMI_FREE_CURL * k * (F.kamiSeq == null && !F.kamiCtl ? 1 : 0); g.scale.setScalar(on ? 0.001 : 1); r.scale.setScalar(on ? 1 : 0.001); }   // hai dáng ngón đổi nhau giữa lúc nắm / mở, lúc đó hai bên đã gần trùng
    if (pad && pad.userData.sticks) { F.root.updateMatrixWorld(true); kamiThumb(rr, pad.userData.sticks[1], kc, F._thR); kamiThumb(ll, pad.userData.sticks[0], kc, F._thL); }
  }

  // Túi y tế ~13 x 11 x 6 cm: thân, nắp gập, khóa, chữ thập nổi mặt ngoài (+z hệ túi). Dùng chung cho lính và ảnh thẻ (equipment_thumbs.html)
  function medkitPouch(M, add, parent, x, y, z, ry) {
    const ca = Math.cos(ry), sa = Math.sin(ry);
    const part = (geo, mat, lx, ly, lz) => add(parent, geo, mat, x + lx * ca + lz * sa, y + ly, z - lx * sa + lz * ca, 0, ry, 0);
    part(rbox(1.0, 0.9, 0.5), M.pouch, 0, 0, 0);
    part(rbox(1.04, 0.3, 0.54), M.web2, 0, 0.34, 0.01);
    part(rbox(0.1, 0.34, 0.03), M.strap, 0, 0.3, 0.28);
    part(rbox(0.36, 0.11, 0.03), M.medCross, 0, -0.11, 0.26);
    part(rbox(0.11, 0.36, 0.03), M.medCross, 0, -0.11, 0.26);
  }

  // SƠ CỨU. F.aidT: giây trong một lượt (null = không; engine tiến thời gian và quyết khi nào dừng), F.aidSite: chỗ đang băng ('legL' 'legR' 'armL' 'armR').
  // Quỳ, đặt súng xuống đất, rút ống tiêm ở túi ngực chích vào đùi, rút cuộn băng quấn quanh vết thương, cầm súng lên. Băng ở lại. Chỉ là động tác: máu không hồi
  const AID_SEQ = { gun: 0.85, free: 1.2, grab: 1.7, over: 2.3, jab: 2.45, out: 3.1, pack: 3.7, wrap: 5.9, tie: 6.2, back: 6.7, end: 7.5 };
  // mốc tiếng (giây, tên trong playGL)
  const AID_SFX = [[0.55, 'cloth'], [1.45, 'aidRip'], [2.45, 'aidJab'], [3.45, 'aidPack'], [3.95, 'aidWrap'], [4.75, 'aidWrap'], [5.5, 'aidWrap'], [5.95, 'aidTie'], [7.0, 'cloth']];
  // mặt cắt thật đo trên lưới: giữa đùi elip ±0,74 / ±0,92 (phía trên pha xương hông nên lệch tâm); bắp tay ±0,48 / ±0,44 quanh trục xương upS
  const AID_SPOT = { leg: { y: -1.3, sx: 0.97, sz: 1.2, r0: 0.83, r1: 0.81, h: 0.5, turns: 3, amp: 0.022 }, arm: { y: 1.0, sx: 1, sz: 0.94, r0: 0.5, r1: 0.49, h: 0.42, turns: 2.5, amp: 0.016 } };
  const _bnA = V(0, 0, 0), _bnB = V(0, 0, 0);
  // băng quấn: các vòng vải xếp chéo chồng mép lên nhau, nổi thành gờ xoắn
  function bandGeo(S) {
    const R = 20, C = 40, pos = [], idx = [];
    for (let i = 0; i <= R; i++) for (let j = 0; j <= C; j++) {
      const u = i / R, a = j / C * Math.PI * 2, layer = Math.pow(Math.abs(Math.sin(Math.PI * (u * S.turns - j / C))), 0.5), edge = Math.min(1, Math.min(u, 1 - u) / 0.08);
      const r = S.r0 + (S.r1 - S.r0) * u + S.amp * layer * edge - 0.012 * (1 - edge);
      pos.push(r * Math.sin(a), S.h / 2 - u * S.h, r * Math.cos(a));
    }
    for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) { const a = i * (C + 1) + j, b = a + C + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    const N = g.attributes.normal;   // nối đường ghép hai đầu vòng
    for (let i = 0; i <= R; i++) { const a = i * (C + 1), b = a + C; _bnA.fromBufferAttribute(N, a).add(_bnB.fromBufferAttribute(N, b)).normalize(); N.setXYZ(a, _bnA.x, _bnA.y, _bnA.z); N.setXYZ(b, _bnA.x, _bnA.y, _bnA.z); }
    return g;
  }
  let AID_ASSET = null;
  function aidAsset() {
    if (AID_ASSET) return AID_ASSET;
    const std = o => new THREE.MeshStandardMaterial(o);
    const inj = new THREE.CylinderGeometry(0.15, 0.15, 1.0, 10), cap = new THREE.CylinderGeometry(0.15, 0.13, 0.1, 10), roll = new THREE.CylinderGeometry(0.2, 0.2, 0.55, 12);
    inj.rotateX(Math.PI / 2); cap.rotateX(Math.PI / 2); roll.rotateX(Math.PI / 2);
    return (AID_ASSET = {
      inj, cap, roll, band: { leg: bandGeo(AID_SPOT.leg), arm: bandGeo(AID_SPOT.arm) },
      olive: std({ color: 0x4c5a35, roughness: 0.7 }), steel: std({ color: 0xa8acb0, roughness: 0.35, metalness: 0.8 }), gauze: std({ color: 0x8f8a72, roughness: 1 })
    });
  }
  const aidSide = site => site[3] === 'L' ? -1 : 1;
  const aidLeg = (F, sx) => F.legs[sx < 0 ? 0 : 1];
  const aidArm = (F, sx) => F.arms[sx < 0 ? 0 : 1];
  const aidBone = (F, site) => site[0] === 'l' ? aidLeg(F, aidSide(site)).leg : aidArm(F, aidSide(site)).upS;
  function aidProps(F) {
    if (F._aid) return F._aid;
    const A = aidAsset(), mk = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.visible = false; return m; };
    const inj = mk(A.inj, A.olive), cap = new THREE.Mesh(A.cap, A.steel), roll = mk(A.roll, A.gauze);
    cap.position.z = 0.55; inj.add(cap);
    return (F._aid = { inj, roll, bands: {} });
  }
  // băng của một chỗ (dựng khi cần): vòng vải + vết máu thấm ra sau khi quấn xong
  function aidBand(F, site) {
    const P = aidProps(F);
    if (P.bands[site]) return P.bands[site];
    const leg = site[0] === 'l', S = leg ? AID_SPOT.leg : AID_SPOT.arm, A = aidAsset(), bone = aidBone(F, site), sx = aidSide(site);
    const band = new THREE.Mesh(A.band[leg ? 'leg' : 'arm'], A.gauze);
    band.position.y = S.y; band.scale.set(S.sx, 0.01, S.sz); band.visible = false; bone.add(band);
    const th = leg ? Math.PI + sx * 0.45 : sx * Math.PI / 2;
    const stain = new THREE.Mesh(new THREE.CylinderGeometry(S.r0 + S.amp + 0.012, S.r1 + S.amp + 0.012, S.h * 0.62, 10, 1, true, th - 0.42, 0.84), F.M.soak);
    stain.position.y = S.y; stain.scale.set(S.sx, 1, S.sz); stain.renderOrder = 2.5; stain.visible = false; bone.add(stain);
    return (P.bands[site] = { band, stain, S, wrapped: 0 });
  }
  // vết máu thấm vải ở đúng chỗ bị thương
  function markWound(F, site) { const m = F.woundMarks && F.woundMarks[site]; if (m) m.visible = true; }
  // thân trên: rời thế ngắm, cúi nhìn vết thương; tư thế quỳ do animateMotion chọn
  function aidPose(F, o, dt) {
    const on = F.aidT != null, k0 = F._aidK || 0;
    let k = F._snap ? (on ? 1 : 0) : k0 + ((on ? 1 : 0) - k0) * (1 - Math.exp(-dt * (on ? 5 : 9)));   // hàm mũ: lính xa cập nhật thưa cũng không nhảy
    if (k < 1e-3) k = 0;
    F._aidK = k;
    if (!k) return;
    const K = 1 - k, site = F.aidSite || 'legR', sx = aidSide(site), leg = site[0] === 'l';
    o.gAim *= K; o.gLow *= K; o.gPort *= K; o.gReady = o.gReady * K + k; o.elb *= K; o.gPitch *= K; o.gYaw *= K; o.gRoll *= K;
    o.tRx -= (leg ? 0.36 : 0.16) * k; o.chRx -= 0.12 * k; o.hRx -= (leg ? 0.36 : 0.26) * k; o.tRy -= sx * (leg ? 0.2 : 0.1) * k; o.hRy -= sx * (leg ? 0.3 : 0.62) * k;
  }
  // tay + súng: gọi sau hàm cầm súng của vũ khí, nên tay đang ở đúng chỗ nắm súng; dời súng thì tay đi theo. Đích là TÂM NẮM của bàn tay (ngón cong quanh trục z bàn tay)
  const _aGC = V(HAND_GC[0], HAND_GC[1], 0);
  function aidHands(F) {
    const k = F._aidK || 0;
    if (!k) return;
    const P = aidProps(F), S = AID_SEQ, on = F.aidT != null, t = on ? (F._aidTL = F.aidT) : (F._aidTL || 0), site = F.aidSite || 'legR';
    const R = F.rifle, hasGun = !!R && R.scale.x > 0.5, sx = aidSide(site), isLeg = site[0] === 'l';
    // bị thương tay phải thì tay trái làm hết; tay bị thương đặt yên trên đùi
    const doer = !isLeg && sx > 0 ? F.arms[0] : F.arms[1], other = doer === F.arms[0] ? F.arms[1] : F.arms[0], B = aidBand(F, site), bone = aidBone(F, site);
    const jabSx = isLeg ? sx : doer.s, jabLeg = aidLeg(F, jabSx).leg;
    if (P.inj.parent !== doer.hand) {
      doer.hand.add(P.inj); doer.hand.add(P.roll);
      P.inj.position.copy(_aGC); P.roll.position.copy(_aGC); P.inj.rotation.y = doer.s < 0 ? Math.PI : 0;
    }
    F.root.updateMatrixWorld(true);
    const handP = A => A.hand.localToWorld(_aGC.clone()), handA = A => V(0, 0, A.s).transformDirection(A.hand.matrixWorld);
    const hD = handP(doer), hO = handP(other), aD = handA(doer), aO = handA(other);
    const gunE = kamiSeg(t, 0.15, S.gun) * (1 - kamiSeg(t, S.back, S.end - 0.1)) * k, wK = kamiSeg(t, S.gun, S.free) * (1 - kamiSeg(t, S.tie, S.back)) * k;
    if (hasGun && gunE > 0) {
      const q0 = R.getWorldQuaternion(new THREE.Quaternion()).invert();
      R.worldToLocal(hD); R.worldToLocal(hO); aD.applyQuaternion(q0); aO.applyQuaternion(q0);
      // súng nằm nghiêng trên đất, bên phải trước đầu gối
      const yaw = F.root.rotation.y, side = V(Math.cos(yaw), 0, -Math.sin(yaw)), fwd = V(-Math.sin(yaw), 0, -Math.cos(yaw));
      const p = F.root.localToWorld(V(2.5, FOOT_Y, -2.4));
      p.y += 0.32 * F.root.scale.y;
      const X = V(0, 1, 0), Z = side.clone().multiplyScalar(-0.45).addScaledVector(fwd, -0.9).normalize(), Y = V().crossVectors(Z, X);
      const qW = new THREE.Quaternion().setFromRotationMatrix(_m.makeBasis(X, Y, Z));
      F.torso.getWorldQuaternion(_kq).invert();
      R.quaternion.slerp(_kq.multiply(qW), gunE);
      R.position.lerp(F.torso.worldToLocal(p), gunE);
      F.root.updateMatrixWorld(true);
      R.localToWorld(hD); R.localToWorld(hO);
      const q1 = R.getWorldQuaternion(new THREE.Quaternion());
      aD.applyQuaternion(q1); aO.applyQuaternion(q1);
    }
    if (on && t >= S.pack) {
      B.wrapped = Math.max(B.wrapped, kamiSeg(t, S.pack, S.wrap));
      B.band.visible = true; B.band.scale.y = Math.max(0.01, B.wrapped);
      B.stain.visible = B.wrapped >= 1;
    }
    P.inj.visible = on && t >= S.grab && t < S.out + 0.1;
    P.roll.visible = on && t >= S.pack && t < S.tie;
    if (!(wK > 0) && !(hasGun && gunE > 0)) return;
    const U = F.chest.localToWorld(V(0, 1, 0)).sub(F.chest.localToWorld(V(0, 0, 0))).normalize();
    // điểm trên mặt đùi tiêm / quanh vết thương; a: góc quanh trục xương, r: tính từ trục
    const LS = AID_SPOT.leg, AS = AID_SPOT.arm, onJab = (a, r) => jabLeg.localToWorld(V(r * Math.sin(a) * LS.sx, LS.y, r * Math.cos(a) * LS.sz));
    const onSite = (a, r) => bone.localToWorld(isLeg ? V(r * Math.sin(a) * LS.sx, LS.y, r * Math.cos(a) * LS.sz) : V(r * Math.sin(a) * AS.sx, AS.y, r * Math.cos(a) * AS.sz));
    const a0 = Math.PI + jabSx * 0.45, away = onJab(a0, 2.2), press = onJab(a0, 1.34), toLeg = onJab(0, 0).sub(press).normalize();
    const siteAx = V(0, 1, 0).transformDirection(bone.matrixWorld), jabAx = V(0, 1, 0).transformDirection(jabLeg.matrixWorld);
    const pD = F.chest.localToWorld(V(doer.s * 0.9, -0.6, -1.5)), pO = F.chest.localToWorld(V(other.s * 0.9, -0.6, -1.5));
    const w = (t - S.pack) * 3.4, wrapK = kamiSeg(t, S.pack, S.pack + 0.3) * (1 - kamiSeg(t, S.wrap - 0.15, S.wrap)), tieK = kamiSeg(t, S.wrap - 0.15, S.wrap);
    const a1 = isLeg ? Math.PI + sx * 0.45 : sx * Math.PI / 2 + sx * 0.5, rW = isLeg ? 1.22 : 0.86, tie = onSite(a1, isLeg ? 1.16 : 0.8);
    const toInj = kamiSeg(t, S.grab, S.over) * (1 - kamiSeg(t, S.out, S.pack - 0.15));
    const tD = pD.clone().lerp(away, kamiSeg(t, S.grab, S.over)).lerp(press, kamiSeg(t, S.over, S.jab)).lerp(away, kamiSeg(t, S.out - 0.25, S.out)).lerp(pD, kamiSeg(t, S.out, S.pack - 0.15)).lerp(onSite(a1 + (isLeg ? 1.5 : 1.7) * Math.sin(w), rW), wrapK).lerp(tie, tieK);
    const axD = U.clone().lerp(toLeg, toInj).lerp(siteAx, Math.max(wrapK, tieK)).normalize();
    // tay kia: chân bị thương thì giữ đùi, phụ quấn; tay bị thương thì đặt yên trên đùi cùng bên
    let tO, axO;
    if (isLeg) {
      tO = onSite(a1 - sx * 1.1, 1.2).lerp(pO, kamiSeg(t, S.out, S.pack - 0.25) * (1 - wrapK)).lerp(onSite(a1 - 1.5 * Math.sin(w), rW), wrapK).lerp(tie, tieK);
      axO = jabAx.clone().lerp(U, kamiSeg(t, S.out, S.pack - 0.25) * (1 - wrapK)).lerp(siteAx, Math.max(wrapK, tieK)).normalize();
    } else {
      const rest = aidLeg(F, sx).leg;
      tO = rest.localToWorld(V(sx * 0.15, -1.9, -1.15)); axO = V(1, 0, 0).transformDirection(rest.matrixWorld).multiplyScalar(sx);
    }
    const pole = s => F.chest.localToWorld(V(s * 2.4, -0.5, 3.0)).applyMatrix4(_inv(F.root));
    solveArm(F, doer, hD.lerp(tD, wK), pole(doer.s), aD.lerp(axD, wK).normalize());
    solveArm(F, other, hO.lerp(tO, wK), pole(other.s), aO.lerp(axO, wK).normalize());
  }
  // làm nóng shader máu + đồ sơ cứu (game.prewarmEffects, huỷ vật liệu sau khi xong): lần bị thương đầu tiên giữa trận khỏi khựng
  function warmMaterials() {
    const std = o => new THREE.MeshStandardMaterial(o);
    return [std({ color: 0x2a0405, alphaMap: bloodTex(), transparent: true, opacity: 0.85, roughness: 0.34, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }), std({ color: 0x8f8a72, roughness: 1 }), std({ color: 0xa8acb0, roughness: 0.35, metalness: 0.8 })];
  }
  // lính chết: thu đồ trên tay, băng ở lại. Hồi sinh / hồi đầy máu (clearAll): tháo băng, xoá vết máu
  function aidReset(F, clearAll) {
    F.aidT = null; F._aidK = 0;
    const P = F._aid;
    if (P) { P.inj.visible = false; P.roll.visible = false; }
    if (!clearAll) return;
    F.limp = 0;
    if (P) for (const k in P.bands) { const B = P.bands[k]; B.wrapped = 0; B.band.visible = false; B.stain.visible = false; }
    if (F.woundMarks) for (const k in F.woundMarks) F.woundMarks[k].visible = false;
  }

  // ---------- BẨN / ƯỚT RIÊNG TỪNG LÍNH ----------
  // Đơn vị thời gian: giây. Vào trận đồ đã cũ, bẩn vừa (GRIME_ISSUE); càng đánh càng bẩn. Ướt khô dần trong ~90 giây, vệt bùn ở mức nước cao nhất ở lại.
  const GRIME_ISSUE = { age: 1, low: 0.78, knee: 0.72, front: 0.5, side: 0.62, seat: 0.55 };   // lính vào trận đã qua nhiều ngày ngoài chiến trường: đừng trông như đồ mới phát
  const GRIME_NEW = { age: 0, low: 0, knee: 0, front: 0, side: 0, seat: 0 };
  const WET_DRY_S = 90;
  function syncGrime(G) {
    const a = G.skeleton.grime;
    a[0] = G.wetY; a[1] = G.wetK; a[2] = G.mudLine; a[3] = G.age;
    a[4] = G.low; a[5] = G.knee; a[6] = G.front; a[7] = G.side;
    a[8] = G.seat; a[9] = G.wetFront; a[10] = 0; a[11] = 0;
    a[12] = G.soil.r; a[13] = G.soil.g; a[14] = G.soil.b; a[15] = 1;
  }
  function newGrime(skeleton) {
    const G = Object.assign({ skeleton, wetY: FOOT_Y - 2, wetK: 0, mudLine: FOOT_Y - 2, wetFront: 0, soil: WEAR_MUD.value.clone() }, GRIME_ISSUE);
    syncGrime(G);
    return G;
  }
  // kiểu 'new' = đồ mới tinh, 'issue' = đồ đã dùng (mặc định khi vào trận)
  function resetGrime(F, kind = 'issue') {
    const G = F && F.grime; if (!G) return;
    Object.assign(G, kind === 'new' ? GRIME_NEW : GRIME_ISSUE, { wetY: FOOT_Y - 2, wetK: 0, mudLine: FOOT_Y - 2, wetFront: 0 });
    G.soil.copy(WEAR_MUD.value);
    syncGrime(G);
  }
  const _soilC = new THREE.Color();
  /**
   * Tích luỹ bẩn / ướt theo việc lính vừa làm. Gọi mỗi lượt cập nhật lính.
   * env: { depth: nước sâu tại chân (đơn vị thế giới), speed: tốc độ di chuyển, soil: màu đất nơi đang đứng (số hex, tuỳ chọn) }
   */
  function updateGrime(F, dt, env = {}) {
    const G = F && F.grime; if (!G || !(dt > 0)) return;
    const scale = F.root.scale.y || 1, depth = (env.depth || 0) / scale, speed = (env.speed || 0) / scale;
    const W = F._mw || {}, prone = F._proneK || 0, kneel = Math.max(W.crouch || 0, F._morK || 0) * (1 - prone);
    const inWater = depth > 0.05;
    const add = (k, rate, cap = 1) => { if (G[k] < cap) G[k] = Math.min(cap, G[k] + rate * dt); };
    // màu đất dính dần theo chỗ đang tiếp xúc; lội nước thì là bùn sẫm
    let touch = 0;
    if (prone > 0.5) {
      const r = inWater ? 0.22 : 0.09;                     // nằm đất: đầy sau ~11 giây; nằm bùn nước nhanh hơn
      add('front', r); add('knee', r * 0.9); add('side', r * 0.8); add('low', r * 0.5);
      touch = 1;
    } else if (kneel > 0.5) {
      add('knee', inWater ? 0.1 : 0.045); add('low', 0.012); add('seat', 0.008);
      touch = 0.6;
    }
    if (speed > 0.5) {
      const run = Math.min(1, speed / 14);
      add('low', (0.002 + 0.008 * run) * (inWater ? 5 : 1), inWater ? 1 : 0.85);   // đi lâu bùn đất bắn dần lên ống quần
      add('side', 0.0012 * run, 0.7);
      touch = Math.max(touch, 0.25);
    }
    add('age', 0.0006);
    if (touch) { _soilC.setHex(inWater ? 0x2e2a1c : env.soil != null ? env.soil : WEAR_MUD.value.getHex()); G.soil.lerp(_soilC, Math.min(1, dt * 0.4 * touch)); }
    // nước: thấm tới mực đang ngập (quỳ, nằm thì ngập cao hơn trên thân)
    if (inWater) {
      const lift = prone > 0.5 ? 1 + depth * 1.3 : kneel > 0.5 ? 2.4 + depth : 0;
      const y = FOOT_Y + depth + lift;
      if (G.wetK < 0.15) G.wetY = y; else G.wetY = Math.max(G.wetY, y);    // khô gần hết rồi lội lại: tính mực mới
      G.wetK = Math.min(1, G.wetK + dt * 2);
      if (y > G.mudLine) G.mudLine = y;                                    // vệt bùn cao nhất: không mất đi
      if (prone > 0.5) G.wetFront = Math.min(1, G.wetFront + dt * 1.5);
    } else {
      G.wetK = Math.max(0, G.wetK - dt / WET_DRY_S);
      G.wetFront = Math.max(0, G.wetFront - dt / WET_DRY_S);
    }
    syncGrime(G);
  }

  // ---------- ĐỨNG YÊN LÂU: ĐẦU QUAY CẢNH GIỚI ----------
  // Đứng / quỳ không ngắm quá ~2,5 giây: đầu quay chậm sang một bên, dừng nhìn, rồi đổi bên (cổ 72%, ngực 28%); có việc là thôi ngay.
  // ĐỨNG CHỜ LÂU (đứng / quỳ yên, không ngắm): sau ~2,5 s liếc hai bên 30-60° (đầu + ngực); đứng lâu hơn thì:
  // - thỉnh thoảng xoay hẳn người nhìn ra sau 85-145° (F.idleTurn, engine bật cho lính không do người chơi điều khiển): xoay gốc người
  //   quanh hướng engine, khoá chân giữ bàn chân trên đất rồi engine cho dậm chân xoay theo; nhìn đủ rồi quay về hướng canh
  // - dồn trọng tâm sang một chân, chân kia chùng gối, hông bên đó trễ xuống (đứng "nghỉ chân"), đổi chân sau 6-14 s
  // - quỳ nghỉ (F.kneelRest): thay xoay người bằng ngoái qua vai
  // - chỉnh lại súng: nhấc + xoay khẩu trong tay, cúi liếc xuống súng
  // Có địch / di chuyển / ngắm thì bỏ hết, người quay về hướng engine nhanh.
  function scanIdle(F, out, dt, type) {
    const S = F._scan || (F._scan = { still: 0, k: 0, yaw: 0, pit: 0, tgt: 0, tp: 0, hold: 0, sign: 1, n: Math.random() * 100,
      cnt: 0, next: 3, B: 0, Bv: 0, Bt: 0, ws: 0, wv: 0, wsT: 5 + 4 * Math.random(), gT: 9 + 8 * Math.random(), gU: -1 });
    const r = (v) => { const x = Math.sin(S.n * v) * 43758.5453; return x - Math.floor(x); };
    // dậm chân xoay (engine đặt motion = walk + F.inPlace) vẫn là đứng chờ
    const rest = (type === 'idle' || type === 'crouch' || F.inPlace) && out.gAim < 0.05 && !F.aimBlend && (F.gaitSpeed || 0) < 0.5;
    const stand = type === 'idle' || F.inPlace;
    S.still = rest ? S.still + dt : 0;
    const want = rest && S.still > 2.5;
    S.k += ((want ? 1 : 0) - S.k) * (1 - Math.exp(-dt / (want ? 1.1 : 0.22)));
    if (want) {
      S.hold -= dt;
      if (S.hold <= 0) {
        S.n += 1; S.sign = -S.sign; S.cnt++;
        if (S.Bt === 0 && F.footLock && F.idleTurn && stand && S.still > 7 && S.cnt >= S.next) {
          S.bSide = -(S.bSide || -1); S.sign = S.bSide;   // xoay người luân phiên hai phía
          S.Bt = S.sign * (1.5 + r(5.3));          // xoay người 85-145°, đầu ngó thêm một chút cùng phía
          S.tgt = S.sign * (0.25 + 0.3 * r(12.9));
          S.tp = -0.04 + 0.1 * r(78.2);
          S.hold = 3.2 + 2.5 * r(37.7) + Math.abs(S.Bt) / 0.75;   // tính từ lúc xoay xong
          S.next = S.cnt + 3 + Math.floor(3 * r(2.2));
        } else if (type === 'crouch' && S.still > 7 && S.cnt >= S.next) {
          // đang quỳ: không xoay gốc (thành bàn xoay trên đầu gối), ngoái qua vai 70-85°
          S.Bt = 0;
          S.tgt = S.sign * (1.25 + 0.25 * r(5.3));
          S.tp = -0.02 + 0.08 * r(78.2);
          S.hold = 1.8 + 1.5 * r(37.7);
          S.next = S.cnt + 3 + Math.floor(3 * r(2.2));
        } else {
          S.Bt = 0;
          S.tgt = S.sign * (0.5 + 0.55 * r(12.9));   // 30-60° về mỗi bên
          S.tp = -0.05 + 0.14 * r(78.2);
          S.hold = 1.4 + 2.4 * r(37.7) + (S.B !== 0 ? 1.2 : 0);   // vừa quay người về thì nhìn lâu hơn
        }
      }
    } else S.Bt = 0;
    const kt = 1 - Math.exp(-dt / 0.42);
    S.yaw += (S.tgt - S.yaw) * kt; S.pit += (S.tp - S.pit) * kt;
    if (S.k > 1e-3) {
      out.hRy += S.yaw * 0.72 * S.k; out.chRy += S.yaw * 0.28 * S.k; out.hRx += S.pit * S.k; out.gYaw += S.yaw * 0.06 * S.k;
    }
    // xoay người: lò xo tắt tới hạn (ω 2,6), trần 0,9 rad/s (vừa nhịp dậm chân, nhanh hơn thì chân trụ bị kéo); thôi chờ thì về nhanh, trần 4,5 rad/s
    if (!F.footLock || F._snap || F.isDead) { S.B = S.Bv = S.Bt = 0; }
    else {
      const calm = want && F.idleTurn;   // có lệnh đi / địch (engine tắt idleTurn) thì quay về ngay, kể cả lúc đang dậm chân xoay
      if (!calm) S.Bt = 0;
      const vmax = calm ? 0.9 : 4.5, w2 = calm ? 6.8 : 40, c = calm ? 5.2 : 12.6;
      // bước nhỏ: lính xa cập nhật thưa (dt tới 0,25 s), một bước lớn thì lò xo dao động
      for (let n = Math.ceil(dt / 0.02), h = dt / Math.max(1, n), i = 0; i < n; i++) {
        S.Bv += (w2 * (S.Bt - S.B) - c * S.Bv) * h;
        S.Bv = Math.max(-vmax, Math.min(vmax, S.Bv)); S.B += S.Bv * h;
      }
      if (S.Bt === 0 && Math.abs(S.B) < 1e-3 && Math.abs(S.Bv) < 1e-3) S.B = S.Bv = 0;
    }
    F._bodyB = S.B;   // SoldierEngine.applyTransform cộng vào hướng gốc, kể cả khung không chạy động tác
    // nghỉ chân: dồn trọng tâm sang chân s, chân kia chùng gối (gập hông + cổ chân đủ để đế vẫn chạm đất, gót hơi nhấc)
    const settle = want && type === 'idle' && !F.inPlace && S.still > 4;
    if (settle) { S.wsT -= dt; if (S.wsT <= 0) { S.n += 1; S.ws = S.ws ? (r(3.7) < 0.35 ? 0 : -S.ws) : (r(4.1) < 0.5 ? -1 : 1); S.wsT = 6 + 8 * r(8.3); } }
    S.wv += ((settle ? S.ws : 0) - S.wv) * (1 - Math.exp(-dt / 0.75));
    if (Math.abs(S.wv) > 1e-3) {
      const v = Math.abs(S.wv), sd = Math.sign(S.wv), k = sd > 0 ? 'l' : 'r';   // sd > 0: dồn sang chân phải, chân trái chùng
      out.px += 0.42 * S.wv;   // hông dạt ~5 cm về chân trụ (8 đv = 1 m)
      out[k + 'K'] += 0.36 * v; out[k + 'H'] += 0.15 * v; out[k + 'A'] += 0.13 * v;   // dK - dH giữ đế phẳng, bớt 0,08 cho gót nhấc
      out.pRz += 0.09 * S.wv; out.tRz -= 0.07 * S.wv; out.hRz -= 0.03 * S.wv;
    }
    // chỉnh súng: 0,8 s nhấc khẩu, xoay nhẹ trong tay rồi đặt lại; mắt liếc xuống súng
    if (want && (type === 'idle' || type === 'crouch')) { S.gT -= dt; if (S.gT <= 0 && S.gU < 0) { S.gU = 0; S.n += 1; S.gT = 10 + 14 * r(6.6); } }
    if (S.gU >= 0) {
      S.gU += dt / 0.8;
      if (S.gU >= 1 || !rest) S.gU = -1;
      else { const p = Math.sin(Math.PI * S.gU), p2 = Math.sin(2 * Math.PI * S.gU); out.gy += 0.5 * p; out.gz -= 0.18 * p; out.gRoll += 0.28 * p2; out.gPitch += 0.12 * p; out.hRx += 0.26 * p * S.k; }
    }
  }

  /**
   * Chuyển động toàn thân: đường cong khớp thật + pha trộn mượt giữa các trạng thái.
   * type: 'idle' | 'walk' | 'patrol' | 'run' | 'aim' | 'crouch'. Gọi mỗi khung với thời gian tuyệt đối (giây).
   * F._snap = true: nhảy thẳng tới tư thế (không pha trộn) — dùng khi chụp ảnh / dựng sẵn.
   * Sau khi gọi, F.gaitSpeed = tốc độ tiến (đv/giây) khớp sải chân để dời gốc nhân vật.
   */
  // HƯỚNG BƯỚC (F.moveDir: hướng đi so với mặt, rad, + = sang phải, null = đứng; SoldierEngine đặt theo quãng đường thật).
  // Đi ngang / chéo / lùi chéo khi thân trên vẫn ngắm: hông xoay về phía bước (tối đa ~46°), phần còn lại chân bước lệch ngang trong hệ hông.
  // Lệch quá ~110° thì đổi sang nhánh lùi (pha chạy ngược); trễ 70..110° để đi ngang không lật qua lại giữa hai nhánh.
  const STRAFE_YAW = 0.6, STRAFE_YAW_MAX = 0.8;
  function stepDir(F, dt) {
    const md = F.moveDir, stop = F._stp && !F._stp.done;
    let back = !!F._sBack;
    if (md != null && !stop) { const a = Math.abs(md); if (!back && a > 1.92) back = true; else if (back && a < 1.22) back = false; }
    F._sBack = back; F._gaitDir = back ? -1 : 1;
    const v = md == null || stop ? 0 : back ? wrapPi(md - Math.PI) : md;
    const Y = Math.max(-STRAFE_YAW_MAX, Math.min(STRAFE_YAW_MAX, v * STRAFE_YAW)), k = F._snap ? 1 : 1 - Math.exp(-dt / 0.12);
    F._sYaw = (F._sYaw || 0) + (Y - (F._sYaw || 0)) * k;
    F._sRho = (F._sRho || 0) + (v - Y - (F._sRho || 0)) * k;
    // dậm chân xoay tại chỗ (F.inPlace): sải về 0, chân nhấc lên đặt xuống tại chỗ
    // bắt đầu dậm xoay từ thế đứng: nhảy pha để chân lệch hướng nhiều nhất nhấc lên ngay (chờ hết pha trụ thì chân kia bị kéo xoay trên đất)
    let gw = 0; for (const m in GAITS) gw += (F._mw && F._mw[m]) || 0;
    if (F.inPlace && !F._ipWas && gw < 0.3 && F._fy) { const i = Math.abs(F._fy[1]) > Math.abs(F._fy[0]) ? 1 : 0; F._ph = Math.floor(F._ph || 0) + 0.6 - 0.5 * i + (i ? 1 : 0); }
    F._ipWas = !!F.inPlace;
    // từ thế đứng vào dậm tại chỗ thì sải 0 ngay (chưa bước); đang có bước dở thì giảm dần kẻo bàn chân giật; engine báo đứng yên (moveDir null) thì giữ 0 tới lúc đi thật
    const skT = F.inPlace || (F.footLock && F.moveDir == null) ? 0 : 1;
    F._sk = F._snap ? skT : F.inPlace && gw < 0.3 ? 0 : (F._sk ?? 1) + (skT - (F._sk ?? 1)) * (1 - Math.exp(-dt / 0.1));
  }
  // KHOÁ BÀN CHÂN KHI XOAY (F.footLock, SoldierEngine bật): gốc người quay thì bàn chân đang trụ giữ hướng cũ trên đất (xoay ở khớp hông),
  // chân nhấc lên mới quay theo; khung chậu nằm giữa hai bàn chân, thân trên vặn theo gốc. Engine cho dậm chân xoay khi lệch > ~26°.
  // Đang bước đi thật thì chân bám hông như cũ (hông trễ nhẹ khi ôm cua). Quá ~34° thì chân trụ bị kéo xoay trên bàn chân.
  function footLock(F, out, dt, gw, type, duty = 0.62) {
    const ry = F.root.rotation.y, d = F._ry0 == null ? 0 : wrapPi(ry - F._ry0), fy = F._fy || (F._fy = [0, 0]);
    F._ry0 = ry;
    if (!F.footLock || F._snap || F.seated || F.isDead || F.climb || (F._proneK || 0) > 0.3) { fy[0] = fy[1] = 0; return (F._legLag = 0); }
    const mv = gw * (F._sk ?? 1) / 0.05 + (type === 'crouch' ? 2.5 : 0);
    for (let i = 0; i < 2; i++) {
      const p = F._ph + i * 0.5 - Math.floor(F._ph + i * 0.5), swing = gw > 0.3 ? sm((p - duty) / 0.055) : 0;   // duty thật của walk/patrol/run; chạy rời đất từ 0,38 chứ không chờ 0,62
      fy[i] = Math.max(-0.6, Math.min(0.6, (fy[i] - d) * Math.exp(-dt * (mv + swing / 0.065))));
    }
    const P = 0.5 * (fy[0] + fy[1]);
    out.pRy += P; out.lHy += fy[0] - P; out.rHy += fy[1] - P;
    return (F._legLag = Math.abs(fy[0]) > Math.abs(fy[1]) ? fy[0] : fy[1]);
  }

  function animateMotion(F, type = 'idle', time = 0, speed = 1) {
    if (!F || !F.legs) return;
    const Wd0 = WEAPONS[F.weapon] || {}, Wfire = Wd0.fire;
    if (Wd0.keepStance) type = Wd0.keepStance(F, type);
    if (Wfire && (type === 'aim' || type === 'crouch')) type = Wd0.stance;   // cối chỉ bắn quỳ, súng bắn tỉa chống tăng chỉ bắn nằm
    let proneWant = 0;
    if (Wd0.prone && (type === 'aim' || F.prone)) { proneWant = 1; type = 'idle'; }   // súng bắn tỉa: nằm theo trình tự (PRONE_KEYS), chân và thân xuất phát từ dáng đang đứng, không qua thế ngắm đứng
    if (F.aidT != null) { type = 'crouch'; proneWant = 0; }   // sơ cứu: quỳ, kể cả súng chỉ bắn nằm
    // thay băng súng bắn tỉa ~25 kg khi đang đứng: quỳ một gối, gác súng lên đùi (holdATR, F._atrKneel). Ôm súng lơ lửng trước người mà thay băng là phi lý
    F._atrKneel = !!(Wd0.prone && F.atrState && F.atrState.t != null && !proneWant && type === 'idle' && !((F._proneK || 0) > 0.05));
    if (F._atrKneel) type = 'crouch';
    const t = time * speed;
    // Lính xa được cập nhật thưa tới 1/8 khung. Giới hạn 0.1 cũ làm chu kỳ chân chậm hơn
    // chuyển động tịnh tiến, nên nhân vật xa trượt chân rõ rệt.
    const dt = F._tPrev === undefined ? 0 : Math.max(0, Math.min(0.25, t - F._tPrev));
    F._tPrev = t; F._dtA = dt;
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
    // khập khiễng (F.limp 0..1, F.limpSx bên đau): chân đau trụ thật nhanh, dồn thời gian sang chân lành
    const lpK = (F.limp || 0) * Math.min(1, gw), lpPh0 = (F.limpSx || 1) < 0 ? 0 : 0.5;
    const lpWarp = lpK ? 1 + 0.45 * lpK * Math.cos(2 * Math.PI * ((F._ph || 0) - lpPh0 - 0.25)) : 1;
    F._lpWarp = lpWarp;   // engine nhân vào quãng bước: thân nhanh chậm theo nhịp, chân trụ khỏi trượt
    stepDir(F, dt);
    if (F._snap) F._ph = t / cyc; else F._ph = (F._ph || 0) + (F._gaitDir || 1) * dt / cyc * lpWarp * (F.gaitRate || 1);

    // hạ súng chậm (~0,8 s), thấy địch thì đưa lên nhanh (~0,2 s); vũ khí có thế cầm riêng và lúc sơ cứu giữ nguyên
    const krT = F.kneelRest && !Wd0.hold && !Wd0.pose && !Wd0.fire && F.aidT == null && !F._aidK ? 1 : 0;
    const kr0 = F._kneelK = F._snap ? krT : c01((F._kneelK || 0) + (krT ? dt * 1.25 : -dt * 5)), krest = kr0 * kr0 * (3 - 2 * kr0);
    const out = F._pose || (F._pose = newPose()), tmp = F._tmpPose || (F._tmpPose = newPose());
    for (const key of POSE_KEYS) out[key] = 0;
    let wsum = 0;
    for (const m in W) {
      const w = W[m]; if (!w) continue;
      for (const key of POSE_KEYS) tmp[key] = 0;
      if (GAITS[m]) gaitPose(tmp, GAITS[m], F._ph, F._sRho, F._sk);
      else if (m === 'idle') idlePose(tmp, t);
      else { aimPose(tmp, t, m === 'crouch'); if (m === 'crouch' && krest > 1e-3) kneelRestPose(tmp, krest, t); }
      for (const key of POSE_KEYS) out[key] += tmp[key] * w;
      wsum += w;
    }
    if (wsum > 0) for (const key of POSE_KEYS) out[key] /= wsum;
    out.pRy -= F._sYaw * Math.min(1, gw);   // hông quay về hướng bước (rotation.y dương = quay trái); thân trên là nhánh riêng nên vẫn ngắm thẳng
    let duty = 0, dutyW = 0;
    for (const m in GAITS) if (W[m]) { duty += GAITS[m].duty * W[m]; dutyW += W[m]; }
    footLock(F, out, dt, Math.min(1, gw), type, dutyW ? duty / dutyW : 0.62);
    if (lpK) {
      // chân đau: chỉ cứng gối lúc VUNG (đang trụ mà duỗi thêm thì chân dài ra, plantFeet đẩy hông lên, chân lành lơ lửng); bước vội lên chân đau ở lpWarp,
      // lúc trụ lên chân đau thì hông sụt, thân đổ sang che đau
      const c = F.limpSx < 0 ? 'l' : 'r', K0 = out[c + 'K'], H0 = out[c + 'H'], K1 = K0 * (1 - 0.42 * lpK * sm((K0 - 0.45) / 0.5));
      if (K1 !== K0) {
        // gối cứng thì chân dài ra: chỉnh góc hông giữ nguyên độ cao cổ chân (bàn chân chúc xuống đất thì plantFeet đẩy cả người lên, chân lành lơ lửng)
        const dy = THIGH_L * Math.cos(H0) + SHIN_L * Math.cos(H0 - K0), a1 = Math.atan2(SHIN_L * Math.sin(K1), THIGH_L + SHIN_L * Math.cos(K1)), d1 = Math.hypot(THIGH_L + SHIN_L * Math.cos(K1), SHIN_L * Math.sin(K1));
        const H1 = Math.acos(Math.min(1, dy / d1)) + a1;
        out[c + 'K'] = K1; out[c + 'H'] = H1; out[c + 'A'] += (K1 - K0) - (H1 - H0);
      }
      const st = Math.max(0, Math.sin(2 * Math.PI * (F._ph - lpPh0)));
      out.tRz += -F.limpSx * 0.13 * lpK * st; out.hRz += F.limpSx * 0.05 * lpK * st; out.tRx -= 0.06 * lpK * st; out.pRz += -F.limpSx * 0.05 * lpK * st;
    }
    // thân trên về thế ngắm trong khi chân vẫn bước; ngẩng / cúi chia đều cho thắt lưng, ngực, súng để đường ngắm không lệch
    const ak = Wd0.prone ? 0 : F.aimBlend || 0;
    if (Wd0.prone) {
      // nằm xuống / đứng dậy tốn thời gian thật, bất kể ngắm nhanh cỡ nào: súng, chân, camera, khoá bắn đều đi theo tiến độ này
      const want = F.aidT == null && (proneWant || (F.aimBlend || 0) > 0.5) ? 1 : 0;
      const nS = F._proneS = F._snap ? want : c01((F._proneS || 0) + (want ? dt / PRONE_DOWN_T : -dt / PRONE_UP_T));
      const K = 1 - nS;
      out.gAim = nS; out.gLow *= K; out.gPort *= K; out.gReady *= K; out.elb *= K;
    }
    if (ak > 0) {
      const K = 1 - ak;
      out.gAim += (1 - out.gAim) * ak; out.gLow *= K; out.gPort *= K; out.gReady *= K; out.elb *= K;
      out.tRy += (-0.5 - out.tRy) * ak; out.tRx += (-0.1 - out.tRx) * ak; out.tRz *= K; out.chRx += (AIM_CHEST_RX - out.chRx) * ak; out.chRy *= K; out.chRz *= K;
      out.hRx += (AIM_HEAD_RX - out.hRx) * ak; out.hRy += (0.04 - out.hRy) * ak; out.hRz += (-0.2 - out.hRz) * ak;
      out.shLz *= K; out.shRz *= K; out.gx *= K; out.gy *= K; out.gz *= K; out.gRoll *= K; out.gYaw *= K;
    }
    // NẰM SẤP VỚI SÚNG KHÁC (F.prone): tiến độ theo thời gian như súng bắn tỉa. Nằm là chĩa súng trước mặt (thế ngắm), thân + chân theo PRONE_KEYS
    const gpT = F.prone && !Wd0.prone && F.aidT == null && !F.seated ? 1 : 0;
    const gpS = F._gpS = F._snap ? gpT : c01((F._gpS || 0) + (gpT ? dt / PRONE_DOWN_T : -dt / PRONE_UP_T));
    if (gpS > 0) {
      const g = sm(gpS / 0.5), K = 1 - g;
      out.gAim += (1 - out.gAim) * g; out.gLow *= K; out.gPort *= K; out.gReady *= K; out.elb *= K;
      out.tRy *= 1 - 0.8 * g; out.tRz *= K; out.chRy *= K; out.chRz *= K; out.shLz *= K; out.shRz *= K; out.gx *= K; out.gy *= K; out.gz *= K; out.gRoll *= K;
      pronePose(out, PRONE_BODY, gpS, 1);
      // bò: hai gối co lên so le theo nhịp, hông lắc theo chân đang co
      const mv = Math.min(1, gw) * sm((gpS - 0.85) / 0.15);
      F._crPh = (F._crPh || 0) + (mv > 0.05 ? dt / PRONE_GEN.crawlCyc * (F.gaitRate || 1) : 0);
      if (mv > 0) {
        const s = Math.sin(2 * Math.PI * F._crPh), sl = Math.max(0, s) * mv, sr = Math.max(0, -s) * mv;
        out.lH += PRONE_GEN.crawlH * sl; out.lK += PRONE_GEN.crawlK * sl; out.lHz += 0.2 * sl;
        out.rH += PRONE_GEN.crawlH * sr; out.rK += PRONE_GEN.crawlK * sr; out.rHz += 0.2 * sr;
        out.tRz += PRONE_GEN.crawlRz * s * mv;
      }
      // súng là con của thân: thân đổ trước bao nhiêu (so với thế ngắm đứng, tRx -0,1) thì ngóc súng lên bấy nhiêu, nòng giữ ngang theo đất
      out.gPitch -= (proneKey('th', gpS) * sm(gpS / 0.3) + out.tRx + 0.1) * g;
    }
    if (F.aimPitch) {
      // nằm bắn: thân áp đất, chỉ súng ngóc theo góc; đứng thì chia đều cho thắt lưng, ngực, súng
      if ((WEAPONS[F.weapon] || {}).prone) out.gPitch += F.aimPitch;
      else { const tK = 0.5 * (1 - gpS); out.tRx += tK * F.aimPitch; out.chRx += tK * F.aimPitch; out.gPitch += (1 - 2 * tK) * F.aimPitch; }
    }
    if (F.recoil) {
      const Wr = WEAPONS[F.weapon], rc = (Wr && Wr.recoilEnv ? recoilEnv(F.recoil) : F.recoil) * ((Wr && Wr.recoil) || 1);
      if (Wr && Wr.recoilEnv) out.chRy -= 0.016 * rc;   // súng thúc vai phải nên ngực xoay theo
      out.gPitch += 0.05 * rc * (Wr && Wr.prone ? 0.08 : 1); out.gz += 0.16 * rc; out.tRx += 0.012 * rc; out.hRx += 0.01 * rc;   // đạn nặng thúc vai đẩy cả thân ngả theo
    }
    // nạp đạn: rời thế ngắm, cúi nhìn ổ đạn; súng đặt riêng trong holdRifleBlend
    const glS = F.glState;
    if (glS && glS.k > 0) {
      const K = 1 - glS.k;
      out.gAim *= K; out.gLow *= K; out.gPort *= K; out.gReady = out.gReady * K + glS.k; out.elb *= K; out.gPitch *= K; out.gYaw *= K; out.gRoll *= K;
      out.tRx += (GL_RELOAD_BODY.tRx - out.tRx) * glS.k; out.tRy += (GL_RELOAD_BODY.tRy - out.tRy) * glS.k; out.chRx += (GL_RELOAD_BODY.chRx - out.chRx) * glS.k;
      // mắt theo tay: lúc với băng đạn thì nhìn lên ngực trái, còn lại nhìn ổ đạn
      const toBelt = glS.stage === 'belt' || (glS.stage === 'load' && glS.f > 0.04 && glS.f < 0.4) ? 1 : 0;
      glS.look += (toBelt - glS.look) * Math.min(1, (F._dtA || 0.016) * 9);
      out.hRx += (GL_RELOAD_BODY.hRx - 0.06 * glS.look - out.hRx) * glS.k; out.hRy += (GL_RELOAD_BODY.hRy + 0.3 * glS.look - out.hRy) * glS.k; out.hRz *= K;
    }
    // kiệt sức đứng nghỉ (F.slump 0..1 do SoldierEngine đặt): gập người ra trước thở, súng hạ thấp, ngẩng đầu vẫn nhìn phía trước
    const sl = F.slump || 0;
    if (sl > 0.01) {
      const K = 1 - sl;
      out.gAim *= K; out.gPort *= K; out.gLow = out.gLow * K + sl;
      out.tRx += -0.34 * sl; out.chRx += -0.08 * sl; out.hRx += 0.3 * sl;
    }
    const msB = F.magState;
    if (msB) msB.k = msB.t == null ? 0 : glSm(msB.t / 0.28) * (1 - glSm((msB.t - (msB.T - 0.3)) / 0.3));
    if (msB && msB.k > 0) {
      const K = 1 - msB.k;
      out.gAim *= K; out.gLow *= K; out.gPort *= K; out.gReady = out.gReady * K + msB.k; out.elb *= K; out.gPitch *= K; out.gYaw *= K; out.gRoll *= K;
      out.tRx += MAG_BODY.tRx * msB.k; out.chRx += MAG_BODY.chRx * msB.k; out.hRx += (MAG_BODY.hRx - out.hRx) * msB.k; out.hRy += (MAG_BODY.hRy - out.hRy) * msB.k; out.hRz *= K;
    }
    const rpB = F.rpgState;
    if (rpB) rpB.k = rpB.t == null ? 0 : glSm((rpB.t - RPG_RELOAD.lower[0]) / (RPG_RELOAD.lower[1] - RPG_RELOAD.lower[0])) * (1 - glSm((rpB.t - RPG_RELOAD.raise[0]) / (RPG_RELOAD.raise[1] - RPG_RELOAD.raise[0])));
    if (rpB && rpB.k > 0) {
      const K = 1 - rpB.k, R0 = RPG_RELOAD, tw = magSm(rpB.t, [R0.reach[0], R0.grab[0]]) * (1 - magSm(rpB.t, [R0.lift[1], R0.align[0]]));   // vặn vai trái ra sau để với ba lô; hết phần với thì quay về ống
      out.gAim *= K; out.gLow *= K; out.gPort *= K; out.gReady = out.gReady * K + rpB.k; out.elb *= K; out.gPitch *= K; out.gYaw *= K; out.gRoll *= K;
      const rhS = rpgRightHand(F, rpB) ? -1 : 1;   // tay phải lấy đạn: vặn vai phải ra sau, ngoái về vai phải
      out.tRx += -0.08 * rpB.k; out.chRx += -0.04 * rpB.k; out.tRy += 0.12 * tw * rpB.k * rhS; out.chRy += 0.3 * tw * rpB.k * rhS;
      // đẩy đạn: vai bên tay đang đẩy đè tới (chỉ vặn ngực, không gật thân)
      const pu = magSm(rpB.t, R0.insert) * (1 - magSm(rpB.t, R0.twist));
      out.chRy += 0.07 * pu * rpB.k * rhS;
      // đầu quay tới điểm nhìn F._rpgLook (rpgReloadHand đặt), giới hạn tầm cổ, lọc mượt: góc cộng theo pha làm đầu quay không liên quan việc tay đang làm
      const lk = F._rpgLook || _rpLook0, Hd = F._rpgHd || (F._rpgHd = { x: -0.1, y: 0 }), a = F._snap ? 1 : 1 - Math.exp(-dt * 6), hMax = F._snap ? 9 : 3.2 * dt;   // cổ quay tối đa ~180°/s
      const lx = lk.x, ly = lk.y - 3.6, lz = lk.z, lh = Math.hypot(lx, lz) || 1e-3;
      Hd.y += Math.max(-hMax, Math.min(hMax, (Math.max(-0.85, Math.min(0.85, Math.atan2(-lx, -lz))) - Hd.y) * a)); Hd.x += Math.max(-hMax, Math.min(hMax, (Math.max(-0.6, Math.min(0.4, Math.atan2(ly, lh))) - Hd.x) * a));
      out.hRx += (Hd.x - out.hRx) * rpB.k; out.hRy += (Hd.y - out.hRy) * rpB.k; out.hRz *= K;
    }
    // PHANH (F.brake 0..1, engine đặt theo mức hãm tốc): thân ngả sau chống đà, gối khuỵu hấp thụ, đầu giữ nhìn trước;
    // súng nặng có quán tính: lò xo tắt dần văng tới trước khi hãm rồi lắc về lúc đứng lại
    const bT = c01(F.brake || 0), b0 = F._brk || 0;
    const bk = F._brk = F._snap ? bT : b0 + (bT - b0) * (1 - Math.exp(-dt / (bT > b0 ? 0.06 : 0.3)));
    if (bk > 1e-3) {
      const ka = 1 - out.gAim;
      out.tRx += 0.62 * bk * ka; out.chRx += 0.06 * bk * ka; out.hRx -= 0.45 * bk * ka;
      for (const s of ['l', 'r']) { out[s + 'H'] += 0.24 * bk; out[s + 'K'] += 0.46 * bk; out[s + 'A'] += 0.22 * bk; }   // chân chống ra trước, gối khuỵu; giữ góc bàn chân: dA = dK - dH
    }
    // BỨT TỐC (F.surge 0..1): đổ người tới để đẩy trọng tâm ra trước bàn chân. VÀO CUA (F.bank -1..1, + = cua trái): nghiêng vào trong chống lực văng.
    { const kf = F._snap ? 1 : 1 - Math.exp(-dt / 0.12), ka = 1 - out.gAim;
      const su = F._sur = (F._sur || 0) + (c01(F.surge || 0) - (F._sur || 0)) * kf, ba = F._bnk = (F._bnk || 0) + ((F.bank || 0) - (F._bnk || 0)) * kf;
      out.tRx -= 0.2 * su * ka; out.hRx += 0.14 * su * ka; out.tRz += 0.14 * ba * ka; out.hRz -= 0.1 * ba * ka; }
    // KHỰNG KHI TẤM GIÁP ĐỠ ĐẠN (F.flinch 1 -> 0, engine đặt; F.flinchDir +1 trúng trước: ngửa ra sau, -1 trúng sau: chúi tới): thân giật, gối chùng, súng nảy
    if (F.flinch > 0) {
      const e = F.flinch * F.flinch * (3 - 2 * F.flinch), dr = F.flinchDir || 1;
      out.tRx += 0.2 * e * dr; out.chRx += 0.14 * e * dr; out.hRx -= 0.12 * e * dr; out.gPitch += 0.07 * e; out.lK += 0.16 * e; out.rK += 0.16 * e;
      F.flinch = F._snap ? 0 : Math.max(0, F.flinch - dt * 2.4);
    }
    let gaitW = 0; for (const m in GAITS) gaitW += W[m] || 0;
    stopPlanner(F, out, dt, bk, gaitW);
    const gs = F._gunSpring || (F._gunSpring = { x: 0, v: 0 }), gTarget = 0.6 * bT;   // bám tín hiệu gốc: bám bk (hồi chậm) thì súng trôi về, không lắc lại
    if (F._snap) { gs.x = gTarget; gs.v = 0; }
    else for (let n = Math.ceil(dt / 0.008), h = dt / Math.max(1, n), i = 0; i < n; i++) {   // ω 13 rad/s, ζ 0,32: vượt lố rồi lắc nhẹ 1-2 nhịp
      gs.v += (-169 * (gs.x - gTarget) - 8.3 * gs.v) * h; gs.x += gs.v * h;
    }
    if (Math.abs(gs.x) > 1e-4) { const ka = 1 - out.gAim; out.gz -= gs.x * ka; out.gy -= 0.25 * gs.x * ka; out.gPitch -= 0.22 * gs.x * ka; }
    // hướng quan sát riêng (F.lookYaw, rad, + = sang trái): vặn thân trên + đầu (súng trong hệ thân quay theo) — tổ bộ binh
    // mỗi người canh một hướng khi di chuyển; ngắm bắn thì đầu đã khoá vào kính nên chỉ vặn thân
    if (F.lookYaw) {
      // nạp RPG: mắt và thân dành cho việc nạp, thôi canh hướng (cộng đè làm đầu lệch tới 60° khỏi chỗ tay đang làm)
      const ly = F.lookYaw * (1 - 0.7 * out.gAim) * (rpB ? 1 - rpB.k : 1) * (1 - (F._atrBusy || 0));
      out.tRy += ly * 0.6; out.pRy += ly * 0.15; out.hRy += ly * 0.4 * (1 - out.gAim);
    }

    // nằm sấp / cối không áp má: không gập ngực về súng (ngực nằm trên đất, tay nạp đạn)
    const Wdf = WEAPONS[F.weapon] || {}; F._aimFlex = Wdf.prone || Wdf.noCheek ? 0 : 1;
    if (!F._aimFlex) { out.chRx -= AIM_CHEST_RX * out.gAim; out.hRx += AIM_CHEST_RX * out.gAim; }
    // nạp RPG: mắt dành cho việc nạp, bỏ liếc quanh khi đứng yên (cộng đè tới ~35° làm đầu quay lung tung, ngực + ống lắc theo)
    F._atrBusy = (F._atrBusy || 0) + ((F.atrState && F.atrState.t != null ? 1 : 0) - (F._atrBusy || 0)) * Math.min(1, dt * 6);
    const rpK = Math.max(rpB ? rpB.k : 0, F._atrBusy), sH = out.hRy, sX = out.hRx, sC = out.chRy, sG = out.gYaw;
    scanIdle(F, out, dt, type);
    if (rpK > 0) { out.hRy += (sH - out.hRy) * rpK; out.hRx += (sX - out.hRx) * rpK; out.chRy += (sC - out.chRy) * rpK; out.gYaw += (sG - out.gYaw) * rpK; }
    if (Wfire) {
      if (Wd0.prone) pronePose(out, Wfire, out.gAim, 1 - (F._aidK || 0));
      else for (const key in Wfire) out[key] += (Wfire[key] - out[key]) * out.gAim * (1 - (F._aidK || 0));
    }
    if (Wd0.pose) Wd0.pose(F, out, dt);
    if (F.aidT != null || F._aidK) aidPose(F, out, dt);
    // trèo lên / nhảy xuống xe (F.climb, vehicle_ride.js): chân + thân theo dáng trèo, cùng bước plantFeet nên bàn chân thấp nhất vẫn ở gốc người
    if (F.climb && F.climb.k > 0) { const C = F.climb, P = C.pose; for (const key in P) out[key] += (P[key] - out[key]) * C.k; }
    // thả lỏng: đổi thế cầm súng sang relax, trừ phần đang ngắm
    { const rt = F.relax && type !== 'crouch' ? 1 : 0, rk = F._relaxK = F._snap ? rt : c01((F._relaxK || 0) + (rt ? dt * 1.8 : -dt * 5));
      const e = rk * rk * (3 - 2 * rk) * (1 - out.gAim), K = 1 - e;
      out.gLow *= K; out.gPort *= K; out.gReady *= K; out.elb *= K; out.gRelax = e; }
    // ngồi xe đang chạy: nghiêng người về phía tay đang bám (F.grab, tay giải ở stowArms)
    { const Gb = F.grab, gt = Gb && Gb.on && F.seated ? 1 : 0, gk = F._grabK = F._snap ? gt : c01((F._grabK || 0) + (gt ? dt : -dt) * 4);
      if (gk > 0 && Gb) { const e = gk * gk * (3 - 2 * gk) * Gb.lean * -Gb.side; out.tRz += e * 0.68; out.chRz += e * 0.32; } }
    // quỳ thay băng súng bắn tỉa: cúi người tới súng dựng trước gối phải, vặn vai trái tới để tay trái với băng khuỷu gập (thẳng lưng thì băng ngoài tầm tay, tay duỗi đơ)
    const kAK = F._atrKneelE || 0;
    if (kAK > 0) { const B = ATR.kneelBody; out.tRx += B[0] * kAK; out.chRx += B[1] * kAK; out.tRy += B[2] * kAK; out.chRy += B[3] * kAK; }
    applyPose(F, out);
    plantFeet(F, out.lift);
    groundFeet(F);
    // NGỒI TRÊN XE (F.seated, InfantryMatch đặt): hạ mông xuống mặt ngồi (y = FOOT_Y của root), đùi gập ra trước, cẳng chân thả qua mép
    { const sk = F._seatK = F._snap ? (F.seated ? 1 : 0) : c01((F._seatK || 0) + (F.seated ? dt : -dt) * 4);
      if (sk > 0) {
        const e = sk * sk * (3 - 2 * sk), fy = F.legs[0].leg.position.y, dy = (FOOT_Y + SEAT_HIP - (F.hips.position.y + fy)) * e;
        F.hips.position.y += dy; F.torso.position.y += dy;
        for (const L of F.legs) {
          L.leg.rotation.x += (SEAT_POSE.hip - L.leg.rotation.x) * e;
          L.leg.rotation.z += (L.sx * SEAT_POSE.splay - L.leg.rotation.z) * e;
          L.knee.rotation.x += (-SEAT_POSE.knee - L.knee.rotation.x) * e;
          L.ankle.rotation.x += (SEAT_POSE.ankle - L.ankle.rotation.x) * e;
        }
        F.root.updateMatrixWorld(true);
      }
    }
    const pkA = Wd0.prone ? c01(out.gAim) : gpS, PRd = Wd0.prone || PRONE_GEN;
    F._proneK = pkA;
    F._proneG = F._proneHand = F._proneTh = 0;
    if (pkA > 0) {
      // NẰM SẤP: đổ hông + thân về trước quanh đúng khớp thắt lưng, đặt bụng xuống đất
      // fire.tRx là góc cột sống so với hông (còn trong giới hạn khớp ROM); cả người đổ theo góc khoá th chứ cột sống không gập 90°
      const k = pkA, th = proneKey('th', k) * sm(k / 0.3), y0 = F.hips.position.y;
      F._proneTh = th; F._proneG = sm((k - 0.55) / 0.42); F._proneHand = sm((k - 0.12) / 0.42) * (1 - sm((k - 0.74) / 0.2));
      F.hips.rotation.x = th;
      const rcBody = F.recoil && Wd0.recoilEnv ? 0.3 * recoilEnv(F.recoil) * k : 0;   // đạn nặng đẩy cả người trượt lùi trên đất rồi hoàn lại
      F.hips.position.z += rcBody;
      F.torso.rotation.x += th;
      _sp.set(0, SPINE_LOW, 0).applyEuler(F.hips.rotation);
      const px = F.torso.position.x, py = y0 + _sp.y, pz = _sp.z;
      _sp.set(0, SPINE_LOW, 0).applyEuler(F.torso.rotation);
      F.torso.position.set(px, py - _sp.y, pz - _sp.z + rcBody);
      // gối, mũi giày chạm đất thật ở từng pha; khoá cuối bụng nằm trên đất (prone.y)
      plantFeet(F, out.lift);
      const dy = (PRd.y - F.hips.position.y) * sm((k - 0.8) / 0.2);
      F.hips.position.y += dy; F.torso.position.y += dy;
      F.root.updateMatrixWorld(true);
    }
    F.gaitSpeed = Object.keys(GAIT_SPEED).reduce((a, m) => a + (W[m] || 0) * GAIT_SPEED[m], 0) * (F.gaitRate || 1) * (F._sk ?? 1);
    // tay đang bám vật khác: cất súng. Súng đã gộp vào lưới skinned nên visible = false không có tác dụng (súng đứng yên giữa không trung), phải thu xương về ~0
    if (F._customArmsIK) { if (F.rifle) { F.rifle.visible = false; F.rifle.scale.setScalar(0.001); } return; }
    if (F.rifle) (WEAPONS[F.weapon] && WEAPONS[F.weapon].hold || holdRifleBlend)(F, out);
    else swingArms(F, [out.aL, out.aR], out.aBend);
    stowArms(F, dt, out);
    if (F._aidK) aidHands(F);
    // thay băng súng bắn tỉa: rời mắt khỏi kính, cúi ngó xuống băng / bao đạn bên trái
    const arS = F.atrState;
    if (arS && arS.t != null && !F.lod?.cur) {
      const M = ATR_RELOAD, e = magSm(arS.t, [0.05, 0.45]) * (1 - magSm(arS.t, [M.back[0] + (arS.empty ? 0.5 : 0), M.back[0] + (arS.empty ? 1.3 : 0.6)])), bag = Math.sin(magSm(arS.t, [M.stow[0], M.grab[1]]) * Math.PI) * (1 - magSm(arS.t, M.bring));
      out.hRy += (0.42 + 0.3 * bag) * e; out.hRx += 0.3 * e;
      // quỳ thay băng: mắt theo tay trái (băng / bao đạn), lọc mượt, giới hạn tầm cổ
      const kE = F._atrKneelE || 0;
      if (kE > 0) {
        const h = F.chest.worldToLocal(F.arms[0].hand.localToWorld(_kgL.set(-0.3, 0.48, 0))).sub(F.head.position), lh = Math.hypot(h.x, h.z) || 1e-3;
        const Hd = F._atrHd || (F._atrHd = { x: out.hRx, y: out.hRy }), mx = F._snap ? 9 : 3.0 * dt, a = F._snap ? 1 : 1 - Math.exp(-dt * 7);
        // cổ chỉ cúi ~30° (ngực đã cúi theo kneelBody, mắt liếc phần còn lại): cúi hết bằng cổ trông như gãy cổ
        Hd.y += Math.max(-mx, Math.min(mx, (Math.max(-0.75, Math.min(0.75, Math.atan2(-h.x, -h.z))) - Hd.y) * a));
        Hd.x += Math.max(-mx, Math.min(mx, (Math.max(-0.52, Math.min(0.25, Math.atan2(h.y, lh))) - Hd.x) * a));
        out.hRy += (Hd.y - out.hRy) * kE; out.hRx += (Hd.x - out.hRx) * kE; out.hRz *= 1 - kE;
      } else F._atrHd = null;
    }
    F.head.rotation.set(softLim(out.hRx, ROM.headX), softLim(out.hRy, ROM.headY), softLim(out.hRz, ROM.headZ), 'YXZ');
    // ngắm: đưa cổ ra trước & hạ đầu áp má vào báng (mặc áo giáp, mắt mới tới được trục kính ngắm)
    const pkH = Wd0.prone ? sm((out.gAim - 0.72) / 0.28) : out.gAim;   // đang nằm xuống chưa áp má: kính còn ở xa, kéo đầu theo thì cổ giãn
    const hb = F._headBase || (F._headBase = F.head.position.clone()), gA = Wd0.noCheek ? 0 : pkH;   // cối không áp má
    // Hạ mắt phải đúng trục kính (đo trên mô hình: bản cũ lệch vuông góc ~0.57 đơn vị ≈ 7 cm).
    const nk = F._aimFlex ? AIM_NECK : AIM_NECK_FLAT, nkL = hb.y - NECK_BASE_Y, nkLen = nkL + (nk.len - nkL) * gA, nkF = nk.fwd * gA, nkS = nk.side * gA;
    F.head.position.set(hb.x + nkLen * Math.sin(nkS), NECK_BASE_Y + nkLen * Math.cos(nkS) * Math.cos(nkF), hb.z - nkLen * Math.cos(nkS) * Math.sin(nkF));
    if (Wd0.prone || gpS > 0) {   // nằm sấp: ngửa cổ nhìn trước, hạ đầu áp má vào báng
      const PRh = Wd0.prone || PRONE_GEN, hk = Wd0.prone ? pkH : sm((gpS - 0.72) / 0.28);
      F.head.rotation.x += PRh.headX * hk; F.head.position.z -= PRh.neck * hk;
      // cằm tì trên đuôi báng: nhấc đầu theo hướng lên của súng (hệ ngực), mắt cao hơn trục kính vài mm thay vì hàm lún vào báng
      if (PRh.headLift && F.rifle && pkH > 0) {
        F.root.updateMatrixWorld(true);
        _hlD.set(0, 1, 0).transformDirection(F.rifle.matrixWorld).applyQuaternion(F.chest.getWorldQuaternion(_hlQ).invert());
        F.head.position.addScaledVector(_hlD, PRh.headLift * pkH);
      }
    }
    if (F.rifle && Wd0.grip && Wd0.grip.sight && gA > 0) headOnSight(F, Wd0.grip.sight, gA);
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

  // giọt máu rơi theo người bị thương: vòng 96 vệt nhỏ dùng chung lưới + vật liệu (cùng kiểu vật liệu vũng máu -> không thêm shader)
  let DROPS = null;
  function bloodDrop(parent, x, y, z, s = 1) {
    if (!parent) return;
    if (!DROPS || DROPS.parent !== parent) {
      if (DROPS) DROPS.list.forEach(m => m.parent && m.parent.remove(m));
      const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
      const mat = new THREE.MeshStandardMaterial({ color: 0x2a0405, alphaMap: bloodTex(), transparent: true, opacity: 0.85, roughness: 0.34, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
      DROPS = { parent, geo, mat, list: [], i: 0 };
    }
    let m = DROPS.list[DROPS.i];
    if (!m) { m = new THREE.Mesh(DROPS.geo, DROPS.mat); m.receiveShadow = true; m.renderOrder = 1; DROPS.list[DROPS.i] = m; parent.add(m); }
    DROPS.i = (DROPS.i + 1) % 96;
    m.position.set(x, y + 0.04, z); m.rotation.y = Math.random() * 6.28;
    m.scale.set(s, 1, s * (0.7 + Math.random() * 0.3));
    m.visible = true;
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
      for (const A of F.arms) if (A.sh0) A.sh.copy(A.sh0);
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

  // ---------- GIÁM SÁT TẦM KHỚP (chỉ dev: có window.devLog, hoặc trang thử đặt window.__JOINT_WATCH) ----------
  // Đo góc thật sau khi dựng xong khung, theo giải phẫu người trưởng thành (AAOS). Quá tầm thì ghi nhãn 'joint' vào logs/dev/*.log kèm súng + động tác, để biết hiệu ứng nào cần sửa.
  // VƯỢT: góc thật trên xương vượt tầm (tay do IK giải chỉ có phí phạt, không chặn cứng). BỊ CẮT: động tác xin quá tầm, applyPose chặn mềm lại nên hình không sai nhưng sai ý đồ.
  // SoldierModel.jointReport() trả bảng tổng hợp, jointReset() xoá.
  const HUMAN_ROM = {
    elbow: 150, shoulderExt: 60, shoulderCross: 50, humIn: 100, humOut: 90, forearmPron: 90, forearmSup: 90, wristFlex: 80, wristExt: 70, wristUlnar: 60, wristRadial: 30,   // nghiêng trụ 35° + 25° bàn tay ôm chéo cán: hệ bàn tay lấy trục cán làm trục ngón cái
    wristBroken: 90,
    hipFlex: 125, hipExt: 30, hipAbd: 45, hipAdd: 30, hipRot: 45, knee: 145, ankleUp: 30, ankleDown: 50,
    lumbarFlex: 50, lumbarExt: 25, lumbarTwist: 32, lumbarSide: 25, thoraxFlex: 40, thoraxExt: 25, thoraxTwist: 35, thoraxSide: 25, trunkTwist: 55,
    neckFlex: 60, neckExt: 65, neckTurn: 80, neckSide: 45, neckShift: 6
  };
  const _jw = { stats: new Map(), lastLog: 0 };
  let _jwOn = false;
  const R2D = 180 / Math.PI;
  const _jA = V(0, 0, 0), _jB = V(0, 0, 0), _jC = V(0, 0, 0), _jD = V(0, 0, 0), _jE = V(0, 0, 0), _jQ = new THREE.Quaternion(), _jQ2 = new THREE.Quaternion(), _jDn = V(0, -1, 0), _jFw = V(0, 0, -1);
  let _jwF = null;
  function jwClip(name, deg) { if (_jwOn && _jwF && deg > 0) jwHit(_jwF, 'BỊ CẮT', name, deg, 0, '°', jwState(_jwF, 'chặn')); }
  function jwState(F, type) {
    if (F.rpgState && F.rpgState.t != null) return 'nạp RPG t=' + F.rpgState.t.toFixed(1);
    if (F.atrState && F.atrState.t != null) return 'thay băng ATR t=' + F.atrState.t.toFixed(1);
    if (F.glState && F.glState.k > 0) return 'nạp phóng lựu';
    if (F.magState && F.magState.t != null) return 'thay băng t=' + F.magState.t.toFixed(1);
    if (F.kamiSeq != null) return 'phóng UAV t=' + F.kamiSeq.toFixed(1);
    if (F.kamiCtl) return 'lái UAV';
    if (F.aidT != null) return 'sơ cứu';
    if (F.climb && F.climb.k > 0) return 'trèo xe';
    if (F.seated) return 'ngồi xe';
    const pS = F._proneS || 0;
    if (pS > 0) return pS < 1 ? 'nằm xuống/đứng dậy' : 'nằm bắn';
    const edge = F.groundIK && Math.abs(F.groundIK[0] - F.groundIK[1]) > 1 ? ' (mép bậc)' : '';   // hai chân lệch độ cao > 12 cm: góc lớn là do bám đất, không phải do dáng đi
    return ((F.aimBlend || 0) > 0.5 ? 'ngắm' : type) + edge;
  }
  function jwHit(F, kind, name, val, lim, unit, state) {
    const key = kind + '|' + (F.weapon || '-') + '|' + state.replace(/ t=.*/, '') + '|' + name;
    let r = _jw.stats.get(key);
    if (!r) _jw.stats.set(key, r = { kind, weapon: F.weapon || '-', state: state.replace(/ t=.*/, ''), joint: name, lim, max: val, frames: 0, logged: -1e9, t: 0 });
    r.frames++; if (val > r.max) r.max = val;
    const now = performance.now();
    if (val > r.logged + 3 && now - r.t > 500) {
      r.logged = val; r.t = now;
      const msg = kind + ' ' + name + ' ' + val.toFixed(0) + unit + ' > ' + lim + unit + ' | súng ' + (F.weapon || '-') + ' | ' + state;
      if (window.devLog) window.devLog('joint', msg);
    }
  }
  // động tác xin quá tầm (trước khi softLim cắt): hình vẫn đúng nhưng đường cong hiệu ứng cần sửa lại
  function jwRaw(F, o) {
    const st = jwState(F, 'động tác');
    const chk = (name, v, L) => { const d = v * R2D, lo = L[0] * R2D, hi = L[1] * R2D; if (d > hi + 1) jwHit(F, 'BỊ CẮT', name, d, Math.round(hi), '°', st); else if (d < lo - 1) jwHit(F, 'BỊ CẮT', name, -d, Math.round(-lo), '°', st); };
    for (const [k, n] of [['l', 'trái'], ['r', 'phải']]) {
      chk('hông ' + n, o[k + 'H'], ROM.hipX); chk('gối ' + n, o[k + 'K'], ROM.knee); chk('cổ chân ' + n, o[k + 'A'], ROM.ankleX);
    }
    chk('lưng dưới gập', o.tRx, ROM.spineX); chk('ngực gập', o.chRx, ROM.chestX); chk('ngực vặn', o.chRy, ROM.chestY); chk('cổ gập', o.hRx, ROM.headX); chk('cổ quay', o.hRy, ROM.headY);
  }
  function jointWatch(F, type) {
    if (F.isDead || F.dead || (F.lod && F.lod.cur >= 2) || !F.arms || !F.chest || !F.torso || !F.hips || !F.head) return;
    const st = jwState(F, type), hit = (name, v, lim, unit = '°') => { if (v > lim) jwHit(F, 'VƯỢT', name, v, lim, unit, st); }, H = HUMAN_ROM;
    _jQ.copy(F.torso.quaternion).multiply(F.chest.quaternion).invert();   // root -> ngực
    for (const arm of F.arms) {
      if (!arm.up || !arm.fore || !arm.hand) continue;
      const n = arm.s < 0 ? 'trái' : 'phải', s = arm.s;
      _jA.copy(arm.up.position); _jB.copy(arm.fore.position); _jC.copy(arm.hand.position);
      const d = _jD.copy(_jB).sub(_jA).normalize(), f = _jE.copy(_jC).sub(_jB).normalize();
      const flex = Math.acos(Math.max(-1, Math.min(1, d.dot(f)))) * R2D;
      hit('khuỷu ' + n + ' gập', flex, H.elbow);
      // vai trong hệ ngực
      const dc = d.clone().applyQuaternion(_jQ), fc = f.clone().applyQuaternion(_jQ);
      hit('vai ' + n + ' ra sau', Math.asin(Math.max(0, Math.min(1, dc.z))) * R2D, H.shoulderExt);
      hit('vai ' + n + ' chéo ngực', Math.asin(Math.max(0, Math.min(1, -dc.x * s))) * R2D, H.shoulderCross);
      const elev = Math.acos(Math.max(-1, Math.min(1, -dc.y))) * R2D;
      if (flex > 45 && elev < 60 && dc.z < 0.25) {   // xoay trong / ngoài cánh tay: so hướng cẳng tay với hướng trước đã nhấc cùng cánh tay. Chỉ đo khi tay thấp, không vòng ra sau: ngoài vùng này mốc (quay ngắn nhất từ tay buông) lệch, ra số sai tới 180°
        _jQ2.setFromUnitVectors(_jDn, dc);
        const fr = _jFw.clone().applyQuaternion(_jQ2), fp = fc.clone().addScaledVector(dc, -fc.dot(dc));
        if (fp.lengthSq() > 1e-4) { fp.normalize(); const a = Math.atan2(fr.clone().cross(fp).dot(dc), fr.dot(fp)) * R2D, inR = -a * s; hit('vai ' + n + ' xoay trong', inR, H.humIn); hit('vai ' + n + ' xoay ngoài', -inR, H.humOut); }
      }
      // cổ tay trong hệ bàn tay (x mu, y ra đốt ngón, z * s phía ngón cái), cùng công thức gripCost
      const q = arm.hand.quaternion, hx = V(1, 0, 0).applyQuaternion(q), hy = V(0, 1, 0).applyQuaternion(q), hz = V(0, 0, 1).applyQuaternion(q);
      const fx = f.dot(hx), fy = f.dot(hy), fz = f.dot(hz) * s;
      const wf = Math.atan2(fx, Math.max(0.02, fy)) * R2D, wd = Math.atan2(fz, Math.max(0.02, fy)) * R2D;
      hit('cổ tay ' + n + ' gập', wf, H.wristFlex); hit('cổ tay ' + n + ' ngửa', -wf, H.wristExt); hit('cổ tay ' + n + ' nghiêng trụ', wd, H.wristUlnar); hit('cổ tay ' + n + ' nghiêng quay', -wd, H.wristRadial);
      // gấp quá 90° so với cẳng tay (đốt ngón quay về phía khuỷu): atan2 trên bão hoà ở 89, phải đo riêng
      hit('cổ tay ' + n + ' gãy', Math.acos(Math.max(-1, Math.min(1, fy))) * R2D, H.wristBroken);
      // sấp / ngửa cẳng tay: đo bằng mu bàn tay quanh trục cẳng tay. Không đo bằng ngón cái: cầm cán dọc súng thì trục cán gần song song cẳng tay, ra số vô nghĩa
      // (tư thế bắt tay = 0: mu tay hướng ra ngoài; úp tay: mu lên phía bắp tay, ngửa tay: mu xuống)
      if (flex > 35) {   // khuỷu gần thẳng thì sấp ngửa cẳng tay và xoay cánh tay không phân biệt được (mốc phía vai suy biến)
        const U = _jA.copy(arm.up.position).sub(_jB); U.addScaledVector(f, -U.dot(f)); U.normalize();
        const out = f.clone().cross(U).multiplyScalar(s), pr = Math.atan2(hx.dot(U), hx.dot(out)) * R2D;
        hit('cẳng tay ' + n + ' úp', pr, H.forearmPron); hit('cẳng tay ' + n + ' ngửa', -pr, H.forearmSup);
      }
    }
    // đo bằng vectơ: khoá chân (footLock) đặt xương bằng quaternion nên Euler có thể lật sang nghiệm khác (x đảo, y z ±180°)
    for (const L of F.legs) {
      const n = L.sx < 0 ? 'trái' : 'phải', sx = L.sx, q = L.leg.quaternion;
      const t = _jA.set(0, -1, 0).applyQuaternion(q);   // hướng đùi trong hệ hông
      const flexH = Math.atan2(-t.z, -t.y) * R2D, abd = Math.asin(Math.max(-1, Math.min(1, t.x * sx))) * R2D;
      hit('hông ' + n + ' gập', flexH, H.hipFlex); hit('hông ' + n + ' duỗi', -flexH, H.hipExt); hit('hông ' + n + ' dạng', abd, H.hipAbd); hit('hông ' + n + ' khép', -abd, H.hipAdd);
      // xoay đùi: phần xoay quanh chính trục đùi của khớp hông
      _jQ2.setFromUnitVectors(_jDn, t).invert().multiply(q);
      { const w0 = _jQ2.w < 0 ? -1 : 1; hit('hông ' + n + ' xoay', Math.abs(2 * Math.atan2(_jQ2.y * w0, _jQ2.w * w0) * R2D), H.hipRot); }
      const k = _jB.set(0, -1, 0).applyQuaternion(L.knee.quaternion), kf = Math.atan2(-k.z, -k.y) * R2D;   // cẳng chân trong hệ đùi: gập ra sau là z dương
      hit('gối ' + n + ' gập', -kf, H.knee);
      const toe = _jC.set(0, 0, -1).applyQuaternion(L.ankle.quaternion), af = Math.atan2(toe.y, -toe.z) * R2D;   // mũi chân trong hệ cẳng chân
      hit('cổ chân ' + n + ' gập mu', af, H.ankleUp); hit('cổ chân ' + n + ' duỗi', -af, H.ankleDown);
    }
    // cột sống: torso so với hông (nằm sấp cả hai cùng đổ, chỉ tính phần lệch nhau)
    const hp = F.hips.rotation, to = F.torso.rotation, ch = F.chest.rotation, tx = (to.x - hp.x) * R2D, ty = (to.y - hp.y) * R2D, tz = (to.z - hp.z) * R2D;
    hit('lưng dưới gập', -tx, H.lumbarFlex); hit('lưng dưới ngửa', tx, H.lumbarExt); hit('lưng dưới vặn', Math.abs(ty), H.lumbarTwist); hit('lưng dưới nghiêng', Math.abs(tz), H.lumbarSide);
    hit('ngực gập', -ch.x * R2D, H.thoraxFlex); hit('ngực ngửa', ch.x * R2D, H.thoraxExt); hit('ngực vặn', Math.abs(ch.y) * R2D, H.thoraxTwist); hit('ngực nghiêng', Math.abs(ch.z) * R2D, H.thoraxSide);
    hit('cả thân vặn', Math.abs(ty + ch.y * R2D), H.trunkTwist);
    const hd = F.head.rotation;
    hit('cổ cúi', -hd.x * R2D, H.neckFlex); hit('cổ ngửa', hd.x * R2D, H.neckExt); hit('cổ quay', Math.abs(hd.y) * R2D, H.neckTurn); hit('cổ nghiêng', Math.abs(hd.z) * R2D, H.neckSide);
    if (F._headBase) {   // đầu lệch khỏi tầm cổ: độ dài từ gốc cổ so với lúc đứng thẳng, đổi ra cm (1 đv = 12,5 cm)
      const L0 = F._headBase.y - NECK_BASE_Y, Ln = Math.hypot(F.head.position.x, F.head.position.y - NECK_BASE_Y, F.head.position.z), dL = (Ln - L0) * 12.5;
      hit('cổ giãn', dL, H.neckShift, 'cm'); hit('cổ co', -dL, H.neckShift, 'cm');
    }
  }
  function animateMotionWatched(F, type, time, speed) {
    _jwOn = typeof window !== 'undefined' && !!(window.devLog || window.__JOINT_WATCH) && !!F; _jwF = F;
    animateMotion(F, type, time, speed);
    if (_jwOn && F.legs) jointWatch(F, type);
    _jwOn = false; _jwF = null;
  }
  function jointReport() {
    return [..._jw.stats.values()].map(r => ({ kind: r.kind, weapon: r.weapon, state: r.state, joint: r.joint, max: +r.max.toFixed(1), lim: r.lim, frames: r.frames })).sort((a, b) => (b.max / b.lim) - (a.max / a.lim));
  }
  function jointReset() { _jw.stats.clear(); }

  return {
    hitParts,
    segHit,
    hitAABB,
    jointReport,
    jointReset,
    HUMAN_ROM,
    buildFigure,
    setCasualty,
    bloodDrop,
    AID_SEQ,
    medkitPouch,
    AID_SFX,
    markWound,
    warmMaterials,
    aidReset,
    animateMotion: animateMotionWatched,
    solveArm,
    gripSolve,
    bodyClear,
    aim,
    createGripAnchor,
    attachHandToAnchor,
    sampleTrajectory,
    applyBreathing,
    applyInertia,
    lookAt,
    updateGrime,
    resetGrime,
    getHitboxes,
    plantFeet,
    GAITS,
    GAIT_SPEED,
    WEAPONS,
    KAMI_SEQ,
    KAMI_L,
    buildKamiPad,
    kamiEmptyGeo,
    KAMI_R,
    stepKamiSeq,
    kamiTubeWorld,
    setCrewDead,
    MAG_SWAP,
    RPG_RELOAD,
    RPG_LOAD,
    bodyPush,
    recoilEnv,
    ATR_RELOAD,
    ATR_CYCLE,
    dustColor: () => WEAR_DUST.value,
    atrMagProp,
    MAG_POSE,
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
