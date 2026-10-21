/**
 * HỆ THỐNG HIỆU ỨNG NỔ CHÂN THỰC (Explosion FX)
 *
 * - Hạt billboard dùng texture thủ tục (khói cuộn có sáng tối, lửa rối, bụi xơ, tia lửa),
 *   render bằng InstancedBufferGeometry + shader: hàng nghìn hạt chỉ 2 lần vẽ (khói thường + lửa cộng sáng)
 * - Trình tự vụ nổ: chớp sáng + đèn thật -> cầu lửa sẫm dần thành khói -> cột đất đen hất tung rồi rơi
 *   -> vòng bụi quét sát đất -> đám bụi lơ lửng + cột khói bốc cao -> lửa âm ỉ (đạn nổ mạnh / đạn cháy)
 * - Đất đá văng: hòn đá 3D hình dạng ngẫu nhiên, có vật lý rơi - nảy - lăn trên địa hình
 * - Hố đạn: vành đất 3D nổi quanh miệng hố + lòng hố đổ bóng giả độ sâu + vệt đất phóng xạ + cháy sém
 * - Trúng tường / công trình: vết nứt vỡ cháy sém dán lên mặt tường + mảnh bê tông + bụi xám
 *
 * API: new ExplosionFX(scene, terrainProvider) ; spawn(x, y, z, ammoType, hitType, opts) ; update(dt)
 */

(function () {
  // ===========================================================================
  // NOISE & TEXTURE THỦ TỤC
  // ===========================================================================
  function hash2(x, y, seed) {
    let h = (x * 374761393 + y * 668265263 + seed * 982451653) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  }
  function vnoise(x, y, seed) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
    const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, oct, seed) {
    let s = 0, a = 0.5, n = 0;
    for (let i = 0; i < oct; i++) {
      s += vnoise(x, y, seed + i * 17) * a;
      n += a;
      a *= 0.5;
      x *= 2.03;
      y *= 2.03;
    }
    return s / n;
  }
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const smooth = (e0, e1, x) => {
    const t = clamp01((x - e0) / (e1 - e0));
    return t * t * (3 - 2 * t);
  };

  // Atlas 2x2: [0] khói cuộn, [1] lửa, [2] bụi xơ, [3] tia lửa / chớp
  let ATLAS = null;
  function getAtlas() {
    if (ATLAS || typeof document === 'undefined') return ATLAS;
    const size = 512, cell = 256;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(size, size);
    const put = (px, py, r, g, b, a) => {
      const i = (py * size + px) * 4;
      img.data[i] = r * 255; img.data[i + 1] = g * 255; img.data[i + 2] = b * 255; img.data[i + 3] = clamp01(a) * 255;
    };
    for (let cy = 0; cy < 2; cy++) {
      for (let cx = 0; cx < 2; cx++) {
        const kind = cy * 2 + cx;
        for (let y = 0; y < cell; y++) {
          for (let x = 0; x < cell; x++) {
            const u = (x / (cell - 1)) * 2 - 1, v = (y / (cell - 1)) * 2 - 1;
            const r = Math.hypot(u, v);
            let R = 1, G = 1, B = 1, A = 0;
            if (kind === 0) {
              // Khói thể tích xốp mềm gồm nhiều búp khói con (cumulus lobes) lồng nhau, không bao giờ bị tròn đơn điệu
              const r0 = r / 0.82;
              const r1 = Math.hypot(u + 0.22, v - 0.16) / 0.58;
              const r2 = Math.hypot(u - 0.24, v - 0.12) / 0.54;
              const r3 = Math.hypot(u + 0.16, v + 0.22) / 0.50;
              const r4 = Math.hypot(u - 0.18, v + 0.20) / 0.52;

              const p0 = Math.max(0, 1 - r0 * r0);
              const p1 = Math.max(0, 1 - r1 * r1);
              const p2 = Math.max(0, 1 - r2 * r2);
              const p3 = Math.max(0, 1 - r3 * r3);
              const p4 = Math.max(0, 1 - r4 * r4);
              const basePuff = p0 * p0 * 0.88 + p1 * p1 * 0.65 + p2 * p2 * 0.62 + p3 * p3 * 0.55 + p4 * p4 * 0.52;

              // Nhiễu FBM cuộn xoáy thô + mịn tạo thớ khói tơi xốp
              const nRough = fbm(u * 2.8 + 3.1, v * 2.8 + 1.2, 4, 11);
              const nFine = fbm(u * 6.8 + 7.4, v * 6.8 + 5.1, 3, 29);
              const density = basePuff * (0.55 + 0.45 * nRough) * (0.8 + 0.25 * nFine);

              // Viền ngoài tiêu biến mềm mại hoàn toàn trước r = 0.96
              const edgeMask = smooth(0.96, 0.45, r);
              A = clamp01(density * 1.65 * edgeMask);

              // Đổ bóng thể tích 3D: hướng sáng từ trên chếch nhẹ, tạo búp sáng và hốc tối
              const ny = v * 0.55 + (nRough - 0.5) * 0.4;
              const nx = u * 0.45 + (nFine - 0.5) * 0.25;
              const lit = clamp01(0.66 - ny * 0.42 - nx * 0.22 + (nRough - 0.5) * 0.2);
              R = G = B = lit;
            } else if (kind === 1) {
              const n = fbm(u * 3.4 + 9, v * 3.4 + 4, 5, 23);
              const core = smooth(0.95, 0.0, r + (n - 0.5) * 0.7);
              const k = core * core;
              R = 1.0;
              G = clamp01(0.25 + 0.75 * k + 0.15 * n);
              B = clamp01(0.05 + 0.75 * k * k);
              A = core * (0.6 + 0.4 * n);
            } else if (kind === 2) {
              // Bụi đất mờ xơ xốp, viền mềm hòa vào không khí
              const r0 = r / 0.88;
              const p0 = Math.max(0, 1 - r0 * r0);
              const n = fbm(u * 2.5 + 7, v * 2.5 + 2, 5, 37);
              const edgeMask = smooth(0.94, 0.35, r);
              A = clamp01(p0 * p0 * (0.45 + 0.55 * n) * 1.5 * edgeMask);
              R = G = B = clamp01(0.82 + (n - 0.5) * 0.25);
            } else {
              const ang = Math.atan2(v, u);
              const glow = Math.exp(-r * r * 7);
              const rays = Math.pow(Math.abs(Math.cos(ang * 3)), 40) * Math.exp(-r * 2.6) * 0.7;
              A = clamp01(glow + rays);
              R = 1; G = clamp01(0.85 + glow * 0.15); B = clamp01(0.55 + glow * 0.45);
            }
            put(cx * cell + x, cy * cell + y, R, G, B, A);
          }
        }
      }
    }
    ctx.putImageData(img, 0, 0);
    ATLAS = new THREE.CanvasTexture(canvas);
    ATLAS.flipY = false;
    return ATLAS;
  }

  // Bảng màu đất đá theo bản đồ
  const PALETTES = {
    DESERT: { soil: [0.45, 0.35, 0.23], dark: [0.17, 0.12, 0.08], dust: [0.72, 0.62, 0.47], rock: [0.5, 0.42, 0.33] },
    URBAN: { soil: [0.32, 0.31, 0.3], dark: [0.09, 0.09, 0.1], dust: [0.64, 0.63, 0.61], rock: [0.52, 0.51, 0.5] },
    JUNGLE: { soil: [0.27, 0.2, 0.13], dark: [0.08, 0.06, 0.04], dust: [0.47, 0.42, 0.32], rock: [0.32, 0.27, 0.2] },
    HIGHLAND: { soil: [0.38, 0.34, 0.28], dark: [0.12, 0.1, 0.08], dust: [0.62, 0.58, 0.51], rock: [0.5, 0.48, 0.44] },
    RIVER_LAKE: { soil: [0.3, 0.26, 0.19], dark: [0.1, 0.08, 0.06], dust: [0.55, 0.5, 0.4], rock: [0.42, 0.4, 0.36] }
  };
  const CONCRETE = { soil: [0.46, 0.45, 0.43], dark: [0.1, 0.1, 0.1], dust: [0.72, 0.71, 0.68], rock: [0.46, 0.45, 0.42] };

  // ===========================================================================
  // TEXTURE HỐ ĐẠN 3D & RÃNH CÀY: QUẠT ĐẤT ĐÁ BẤT ĐỐI XỨNG & TIA NỨT ÁP LỰC
  // ===========================================================================
  const CRATER_TEX = {};
  const GOUGE_TEX = {};
  let CRATER_NORMAL = null;

  function getCraterTexture(palName, variant = 0, kind = 'blast') {
    const key = palName + '_' + variant + '_' + kind;
    if (CRATER_TEX[key] || typeof document === 'undefined') return CRATER_TEX[key];
    const pal = PALETTES[palName] || PALETTES.DESERT;
    const size = 512, c = size / 2;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(size, size);
    const sd = variant * 31 + (kind === 'heat' ? 7 : kind === 'cluster' ? 13 : 0);
    // Mức cháy xém: thuốc nổ trong đất để lại muội nâu sẫm loang lổ ở lòng hố (không đen tuyền)
    const scorchK = kind === 'heat' ? 0.55 : kind === 'cluster' ? 0.5 : 0.7;
    const soot = [0.07, 0.06, 0.05];
    const sub = [pal.soil[0] * 0.72 + pal.dark[0] * 0.28, pal.soil[1] * 0.72 + pal.dark[1] * 0.28, pal.soil[2] * 0.72 + pal.dark[2] * 0.28];
    const loose = [pal.soil[0] * 0.8 + pal.dust[0] * 0.2, pal.soil[1] * 0.8 + pal.dust[1] * 0.2, pal.soil[2] * 0.8 + pal.dust[2] * 0.2];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = (x - c) / c, v = (y - c) / c;   // +v: hướng đạn bay tới
        const idx = (y * size + x) * 4;
        // Biên dạng bị làm méo bằng nhiễu miền (domain warp) -> mép hố lồi lõm tự nhiên, không tròn đều
        const wu = u + (fbm(u * 2.2 + sd, v * 2.2, 3, 51) - 0.5) * 0.22;
        const wv = v + (fbm(u * 2.2, v * 2.2 + sd, 3, 53) - 0.5) * 0.22;
        const d = Math.hypot(wu, wv) * (1 - v * 0.12);
        if (d > 1.02) { img.data[idx + 3] = 0; continue; }
        const nLo = fbm(u * 3.5 + sd, v * 3.5, 4, 61);
        const nHi = fbm(u * 18 + sd, v * 18, 3, 67);
        const nClump = fbm(u * 9 + sd, v * 9 + 3, 3, 71);
        // Màu nền: đất tơi mới xới (gờ) -> đất cái ẩm sẫm (lòng hố)
        const wBowl = 1 - smooth(0.28, 0.5, d);
        let r = loose[0] + (sub[0] - loose[0]) * wBowl;
        let g = loose[1] + (sub[1] - loose[1]) * wBowl;
        let b = loose[2] + (sub[2] - loose[2]) * wBowl;
        // Đất vón cục trên gờ: sáng tối lổn nhổn theo cục đất
        const clump = (nClump - 0.5) * 0.5 * smooth(0.3, 0.55, d) * (1 - smooth(0.75, 0.95, d));
        const tone = 1 + (nLo - 0.5) * 0.28 + (nHi - 0.5) * 0.22 + clump;
        r *= tone; g *= tone; b *= tone;
        // Muội cháy loang lổ ở lòng hố, tan dần ra gờ
        const wS = (1 - smooth(0.12, 0.5, d)) * clamp01(0.45 + (nLo - 0.5) * 1.6) * scorchK;
        r += (soot[0] - r) * wS; g += (soot[1] - g) * wS; b += (soot[2] - b) * wS;
        // Đất văng phủ ra ngoài thành từng mảng (không phải vệt quạt), phía trước nhiều hơn
        let alpha = 1;
        if (d > 0.6) {
          const fwd = 0.75 + Math.max(0, v) * 0.6;
          const mask = clamp01((fbm(u * 5 + sd, v * 5 + 9, 4, 79) - 0.62 + (1 - d) * 0.9 * fwd) * 3);
          alpha = mask * (1 - smooth(0.85, 1.02, d)) + (1 - smooth(0.6, 0.72, d)) * (1 - mask);
          const dustK = smooth(0.7, 1.0, d) * 0.3;
          r += (pal.dust[0] - r) * dustK; g += (pal.dust[1] - g) * dustK; b += (pal.dust[2] - b) * dustK;
        }
        img.data[idx] = clamp01(r) * 255;
        img.data[idx + 1] = clamp01(g) * 255;
        img.data[idx + 2] = clamp01(b) * 255;
        img.data[idx + 3] = clamp01(alpha) * 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    // Sỏi đá & cục đất nhỏ lấm tấm trên gờ và vùng đất văng
    const rgb = (col, k = 1) => `${Math.round(clamp01(col[0] * k) * 255)},${Math.round(clamp01(col[1] * k) * 255)},${Math.round(clamp01(col[2] * k) * 255)}`;
    const rnd = (i) => hash2(i, variant * 47 + 13, 11);
    for (let i = 0; i < 140; i++) {
      const ang = rnd(i) * Math.PI * 2, dist = c * (0.42 + Math.pow(rnd(i + 300), 1.5) * 0.45);
      const px = c + Math.cos(ang) * dist, py = c + Math.sin(ang) * dist * (Math.sin(ang) > 0 ? 1.1 : 0.9);
      const rr = 0.8 + rnd(i + 600) * 2.4;
      const lt = rnd(i + 900) > 0.5;
      ctx.fillStyle = `rgba(${rgb(lt ? pal.rock : pal.dark, lt ? 1.05 : 1.3)},${0.5 + rnd(i + 1200) * 0.4})`;
      ctx.beginPath();
      for (let k = 0; k < 5; k++) { const a = k / 5 * 6.283 + rnd(i * 7 + k) * 0.8, q = rr * (0.6 + rnd(i * 11 + k) * 0.6); k ? ctx.lineTo(px + Math.cos(a) * q, py + Math.sin(a) * q) : ctx.moveTo(px + Math.cos(a) * q, py + Math.sin(a) * q); }
      ctx.closePath(); ctx.fill();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = 4;
    CRATER_TEX[key] = tex;
    return tex;
  }

  // Texture rãnh cày dành riêng cho đạn xuyên giáp APFSDS (Kinetic Trench)
  function getGougeTexture(palName) {
    if (GOUGE_TEX[palName] || typeof document === 'undefined') return GOUGE_TEX[palName];
    const pal = PALETTES[palName] || PALETTES.DESERT;
    const size = 512, w = 512, h = 256;
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    const rgb = (col, k = 1) => `${Math.round(clamp01(col[0] * k) * 255)},${Math.round(clamp01(col[1] * k) * 255)},${Math.round(clamp01(col[2] * k) * 255)}`;

    // Rãnh cày kim loại cọ xát dọc theo trục X (từ trái qua phải)
    const cy = h / 2;
    for (let i = 0; i < 45; i++) {
      const yOff = (hash2(i, 11, 7) - 0.5) * h * 0.32;
      const py = cy + yOff;
      const x0 = w * (0.05 + hash2(i, 23, 13) * 0.15);
      const x1 = w * (0.75 + hash2(i, 47, 17) * 0.22);
      ctx.strokeStyle = `rgba(${rgb(hash2(i, 5, 2) > 0.4 ? pal.dark : pal.soil, 0.9)},${0.35 + hash2(i, 77, 9) * 0.45})`;
      ctx.lineWidth = 2.5 + hash2(i, 91, 3) * 6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x0, py);
      ctx.lineTo(x1, py + (hash2(i, 13, 5) - 0.5) * 8);
      ctx.stroke();
    }

    // Cuối rãnh (bên phải): Hố cắm sâu hoắm nơi mũi tên đạn găm vào đất
    ctx.fillStyle = `rgba(${rgb(pal.dark, 0.4)},0.95)`;
    ctx.beginPath();
    ctx.ellipse(w * 0.82, cy, w * 0.12, h * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();

    // Đất sỏi vụn văng 2 bên luống đất
    for (let i = 0; i < 220; i++) {
      const px = w * (0.1 + hash2(i, 301, 19) * 0.85);
      const side = (hash2(i, 401, 23) > 0.5 ? 1 : -1);
      const py = cy + side * h * (0.15 + Math.pow(hash2(i, 501, 29), 0.7) * 0.32);
      ctx.fillStyle = `rgba(${rgb(pal.soil, 1.2)},${0.3 + hash2(i, 601, 31) * 0.5})`;
      ctx.beginPath();
      ctx.arc(px, py, 1.0 + hash2(i, 701, 37) * 2.8, 0, Math.PI * 2);
      ctx.fill();
    }

    const tex = new THREE.CanvasTexture(canvas);
    GOUGE_TEX[palName] = tex;
    return tex;
  }

  // Normal map hố đạn: gờ đất nổi cao phía trước + lòng chảo dốc đứng + rãnh nứt áp suất
  function getCraterNormalMap(kind = 'blast') {
    if (CRATER_NORMAL || typeof document === 'undefined') return CRATER_NORMAL;
    const size = 256;
    const H = (u, v) => {
      const dist = Math.hypot(u, v);
      // Gờ đùn cao rõ rệt ở phía trước (+V)
      const asymDist = dist * (1.0 - v * 0.28);
      const n = (fbm(u * 6.5, v * 6.5, 3, 91) - 0.5) * 0.14;
      if (asymDist < 0.36) {
        return -(1.0 - Math.pow(asymDist / 0.36, 1.6)) * 0.75 + n;
      }
      if (asymDist < 0.72) {
        const t = (asymDist - 0.36) / 0.36;
        const forwardBoost = 1.0 + Math.max(0, v) * 0.8;
        return 0.45 * Math.sin(Math.PI * t) * forwardBoost + n;
      }
      return n * 0.4;
    };
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(size, size);
    const e = 2 / size;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = (x / (size - 1)) * 2 - 1, v = (y / (size - 1)) * 2 - 1;
        const dx = (H(u + e, v) - H(u - e, v)) / (2 * e);
        const dy = (H(u, v + e) - H(u, v - e)) / (2 * e);
        let nx = -dx * 0.45, ny = dy * 0.45, nz = 1;
        const l = Math.hypot(nx, ny, nz);
        nx /= l; ny /= l; nz /= l;
        const i = (y * size + x) * 4;
        img.data[i] = (nx * 0.5 + 0.5) * 255;
        img.data[i + 1] = (ny * 0.5 + 0.5) * 255;
        img.data[i + 2] = (nz * 0.5 + 0.5) * 255;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    CRATER_NORMAL = new THREE.CanvasTexture(canvas);
    return CRATER_NORMAL;
  }

  // Lỗ đạn nhỏ: [ground] vết lõm có đất bắn tóe, [wall] lỗ đạn sâu có bê tông sứt quanh
  const HOLE_TEX = {};
  function getHoleTexture(kind) {
    if (HOLE_TEX[kind] || typeof document === 'undefined') return HOLE_TEX[kind];
    const size = 128, c = size / 2;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const rnd = (i) => hash2(i, kind === 'wall' ? 17 : kind === 'frag' ? 41 : 29, 13);
    if (kind === 'frag') {
      // Vết mảnh văng găm tường: miếng vữa / bê tông bị bóc méo mó, lộ lớp vật liệu mới sáng hơn mặt sơn (nhuộm theo vật
      // liệu bằng màu instance), lòng sứt hơi tối, tâm chỉ là hõm nhỏ (không thủng như lỗ đạn), vài vết nứt chân chim
      const pts = [];
      const n = 11;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + (rnd(i) - 0.5) * 0.5;
        const r = c * (0.32 + rnd(i + 20) * 0.38);
        pts.push([c + Math.cos(a) * r, c + Math.sin(a) * r]);
      }
      const poly = (k) => { ctx.beginPath(); pts.forEach(([x, y], i) => { const X = c + (x - c) * k, Y = c + (y - c) * k; i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }); ctx.closePath(); };
      // quầng bụi mờ quanh vết
      const g0 = ctx.createRadialGradient(c, c, c * 0.3, c, c, c * 0.95);
      g0.addColorStop(0, 'rgba(120,115,108,0.28)');
      g0.addColorStop(1, 'rgba(120,115,108,0)');
      ctx.fillStyle = g0; ctx.fillRect(0, 0, size, size);
      // miếng bóc: sáng (vật liệu mới lộ), mép sẫm nhẹ
      poly(1); ctx.fillStyle = 'rgba(176,170,160,0.95)'; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(60,55,50,0.7)'; ctx.stroke();
      // lòng sứt tối dần vào tâm (bóng đổ trong hõm: thứ làm vết đọc được từ xa)
      const g1 = ctx.createRadialGradient(c, c, 0, c, c, c * 0.5);
      g1.addColorStop(0, 'rgba(38,34,30,0.95)');
      g1.addColorStop(0.6, 'rgba(80,74,68,0.6)');
      g1.addColorStop(1, 'rgba(110,104,96,0)');
      poly(0.75); ctx.fillStyle = g1; ctx.fill();
      // sạn li ti
      for (let i = 0; i < 26; i++) {
        const a = rnd(i + 60) * Math.PI * 2, r = c * rnd(i + 90) * 0.5;
        ctx.fillStyle = `rgba(${rnd(i + 5) < 0.5 ? '60,55,50' : '235,230,220'},${0.4 + rnd(i + 7) * 0.4})`;
        ctx.fillRect(c + Math.cos(a) * r, c + Math.sin(a) * r, 1 + rnd(i + 3) * 2, 1 + rnd(i + 4) * 2);
      }
      // nứt chân chim
      ctx.strokeStyle = 'rgba(40,36,32,0.55)'; ctx.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        const a = rnd(i + 300) * Math.PI * 2, r0 = c * 0.55, r1 = c * (0.75 + rnd(i + 310) * 0.2);
        ctx.beginPath();
        ctx.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0);
        ctx.lineTo(c + Math.cos(a + 0.15) * (r0 + r1) / 2, c + Math.sin(a + 0.15) * (r0 + r1) / 2);
        ctx.lineTo(c + Math.cos(a - 0.05) * r1, c + Math.sin(a - 0.05) * r1);
        ctx.stroke();
      }
    } else if (kind === 'wall') {
      const g = ctx.createRadialGradient(c, c, 2, c, c, c * 0.9);
      g.addColorStop(0, 'rgba(20,18,16,0.9)');
      g.addColorStop(0.45, 'rgba(60,56,52,0.35)');
      g.addColorStop(1, 'rgba(60,56,52,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
      // Vành bê tông sứt sáng
      for (let i = 0; i < 40; i++) {
        const a = rnd(i) * Math.PI * 2, r = c * (0.18 + rnd(i + 50) * 0.22);
        ctx.fillStyle = `rgba(175,172,165,${0.35 + rnd(i + 90) * 0.4})`;
        ctx.fillRect(c + Math.cos(a) * r, c + Math.sin(a) * r, 1 + rnd(i + 7) * 3, 1 + rnd(i + 9) * 3);
      }
      ctx.strokeStyle = 'rgba(15,15,15,0.7)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 6; i++) {
        const a = rnd(i + 200) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(c + Math.cos(a) * c * 0.15, c + Math.sin(a) * c * 0.15);
        ctx.lineTo(c + Math.cos(a + 0.2) * c * (0.4 + rnd(i) * 0.3), c + Math.sin(a + 0.2) * c * (0.4 + rnd(i) * 0.3));
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(4,4,4,1)';
      ctx.beginPath();
      ctx.arc(c, c, c * 0.13, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Đất bắn tóe hình tia + hõm tối ở tâm
      for (let i = 0; i < 24; i++) {
        const a = rnd(i) * Math.PI * 2, r1 = c * (0.45 + rnd(i + 40) * 0.5);
        ctx.strokeStyle = `rgba(40,30,20,${0.25 + rnd(i + 80) * 0.3})`;
        ctx.lineWidth = 1 + rnd(i + 3) * 3;
        ctx.beginPath();
        ctx.moveTo(c, c);
        ctx.lineTo(c + Math.cos(a) * r1, c + Math.sin(a) * r1);
        ctx.stroke();
      }
      const g = ctx.createRadialGradient(c, c, 1, c, c, c * 0.5);
      g.addColorStop(0, 'rgba(10,8,6,0.95)');
      g.addColorStop(1, 'rgba(30,22,15,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
    }
    HOLE_TEX[kind] = new THREE.CanvasTexture(canvas);
    return HOLE_TEX[kind];
  }

  // Lớp lỗ đạn: InstancedMesh vòng lặp (lỗ cũ nhất được thay khi đầy) -> hàng trăm lỗ đạn chỉ 1 lần vẽ
  const HOLE_WHITE = new THREE.Color(1, 1, 1);
  class HoleLayer {
    constructor(scene, max, kind) {
      this.max = max;
      this.next = 0;
      this.total = 0;
      const mat = new THREE.MeshLambertMaterial({
        map: getHoleTexture(kind), transparent: true, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6
      });
      this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, max);
      // lớp có màu từng vết: tạo sẵn bảng màu đủ sức chứa (setColorAt của three r128 tạo bảng theo mesh.count — lúc đó
      // đang là 0 -> bảng rỗng, cả lớp không vẽ được)
      if (kind === 'frag') this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3).fill(1), 3);
      this.mesh.count = 0;
      this.mesh.frustumCulled = false;
      this.mesh.renderOrder = 3;
      scene.add(this.mesh);
      this._m = new THREE.Matrix4();
      this._q = new THREE.Quaternion();
      this._q2 = new THREE.Quaternion();
      this._p = new THREE.Vector3();
      this._s = new THREE.Vector3();
      this._z = new THREE.Vector3(0, 0, 1);
    }
    add(x, y, z, nx, ny, nz, size, color = null) {
      // màu nhuộm từng vết (vết mảnh văng theo vật liệu tường); lớp nào đã dùng màu thì vết không màu nhận màu trắng
      if (this.mesh.instanceColor) {
        this.mesh.setColorAt(this.next, color || HOLE_WHITE);
        this.mesh.instanceColor.needsUpdate = true;
      }
      this._q.setFromUnitVectors(this._z, new THREE.Vector3(nx, ny, nz).normalize());
      this._q2.setFromAxisAngle(this._z, Math.random() * Math.PI * 2);
      this._q.multiply(this._q2);
      this._p.set(x + nx * 0.4, y + ny * 0.4, z + nz * 0.4);
      this._s.set(size, size, 1);
      this._m.compose(this._p, this._q, this._s);
      this.mesh.setMatrixAt(this.next, this._m);
      (this.pos || (this.pos = new Float32Array(this.max * 3))).set([this._p.x, this._p.y, this._p.z], this.next * 3);
      this.next = (this.next + 1) % this.max;
      this.total = Math.min(this.max, this.total + 1);
      this.mesh.count = this.total;
      this.mesh.instanceMatrix.needsUpdate = true;
    }
    // Xóa các lỗ trong bán kính (khối tường / mảng nhà chứa lỗ đã vỡ mất)
    removeNear(x, y, z, r) {
      if (!this.pos) return;
      const Z = new THREE.Matrix4().makeScale(0, 0, 0);
      let any = false;
      for (let i = 0; i < this.total; i++) {
        const dx = this.pos[i * 3] - x, dy = this.pos[i * 3 + 1] - y, dz = this.pos[i * 3 + 2] - z;
        if (dx * dx + dy * dy + dz * dz < r * r) { this.mesh.setMatrixAt(i, Z); this.pos[i * 3 + 1] = -1e6; any = true; }
      }
      if (any) this.mesh.instanceMatrix.needsUpdate = true;
    }
    clear() {
      this.next = 0; this.total = 0; this.mesh.count = 0;
    }
  }

  // ===========================================================================
  // VẾT ĐẠN NHỎ TRÊN ĐẤT (12.7mm / 30mm nổ-mảnh / 30mm đạn cháy / lỗ mảnh văng)
  //  - Không vẽ màu đè lên đất: shader NHÂN màu mặt đất bên dưới (blend dst*src) -> vết luôn hợp màu cát / đất / cỏ,
  //    chỗ tối là bóng lòng hố & đất ẩm lật lên, không phải hình sao mực đen.
  //  - Kênh texture: R = độ tối (1 = giữ nguyên đất), G = đất văng (pha màu đất lật theo vật liệu), B = độ cao (0.5 = phẳng),
  //    A = phủ. Độ cao -> pháp tuyến -> sườn hố / vành đất quay lưng với mặt trời tối đi theo hướng nắng thật.
  //  - 4 biến thể mỗi loại (atlas 2x2) để loạt đạn không thành hàng con dấu giống hệt nhau. Trục +u = hướng đạn bay.
  // ===========================================================================
  const BM_SIZE = 512, BM_CELL = 256;
  const BM_TEX = {};
  const BM_DARK = { pock: [0.1, 0.08, 0.06], hei: [0.15, 0.115, 0.085], burn: [0.17, 0.085, 0.05] };
  const BM_RELIEF = { pock: 7, hei: 8, burn: 6 };
  // Lỗ mảnh văng HEI: danh sách cố định mỗi biến thể (dồn về phía trước theo hướng bay)
  function bmFragPits(variant, n) {
    const pits = [];
    for (let i = 0; i < n; i++) {
      const h1 = hash2(i, variant, 71), h2 = hash2(i, variant, 72), h3 = hash2(i, variant, 73), h4 = hash2(i, variant, 74);
      // góc: nửa số mảnh dồn ±70° quanh hướng bay, còn lại rải đều
      const a = h1 < 0.55 ? (h2 - 0.5) * 2.4 : h2 * Math.PI * 2;
      const r = 0.3 + Math.sqrt(h3) * 0.62;
      pits.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, dx: Math.cos(a), dy: Math.sin(a), pr: 0.007 + h4 * 0.012, len: 0.012 + hash2(i, variant, 75) * 0.035 });
    }
    return pits;
  }
  function getBulletMarkAtlas(kind) {
    if (BM_TEX[kind]) return BM_TEX[kind];
    const data = new Uint8Array(BM_SIZE * BM_SIZE * 4);
    // nhiễu giá trị liền mạch (không dùng bảng nhiễu lặp 64 ô: bảng đó không tuần hoàn -> lộ đường nối thẳng)
    const N = (x, y, s) => vnoise(x, y, s | 0);
    // nhiễu theo góc liền mạch: lấy mẫu trên vòng tròn bán kính R (không có đường nối ở ±180°)
    const AN = (th, R, s) => vnoise(Math.cos(th) * R + 50, Math.sin(th) * R + 50, s | 0);
    // hạt đất / cát vón nhỏ (~4-6 px), mật độ 0..1 -> tỉ lệ diện tích phủ hạt
    const grains = (u, v, dens, s) => {
      if (dens <= 0.01) return 0;
      const g = vnoise(u * 95 + 7, v * 95 + 3, s | 0) * 0.75 + vnoise(u * 190, v * 190, (s | 0) + 1) * 0.25;
      const th = 1 - Math.min(1, dens) * 0.62;
      return smooth(th, th + 0.07, g);
    };
    for (let variant = 0; variant < 4; variant++) {
      const ox = (variant % 2) * BM_CELL, oy = Math.floor(variant / 2) * BM_CELL;
      const sd = variant * 31 + (kind === 'hei' ? 101 : kind === 'burn' ? 211 : 7);
      const pits = kind === 'hei' ? bmFragPits(variant, 32) : kind === 'burn' ? bmFragPits(variant + 9, 10) : null;
      for (let py = 0; py < BM_CELL; py++) {
        for (let px = 0; px < BM_CELL; px++) {
          const u = (px + 0.5) / BM_CELL * 2 - 1, v = (py + 0.5) / BM_CELL * 2 - 1;
          const R0 = Math.hypot(u, v);
          let d = 1, e = 0, h = 0;
          if (R0 > 0.99) { const i = ((oy + py) * BM_SIZE + ox + px) * 4; data[i] = 255; data[i + 1] = 0; data[i + 2] = 128; data[i + 3] = 0; continue; }
          const mid = fbm(u * 9 + sd, v * 9 - sd, 2, sd + 2);
          if (kind === 'pock') {
            // 12.7mm cắm vào cát / đất: lỗ phễu nhỏ lệch về phía sau, cát hất thành quạt hạt về phía trước (thưa dần,
            // có tia), vành gồ ở mép phễu phía trước, lòng phễu là cát ẩm sẫm hơn & chìm trong bóng
            const du = u, r = Math.hypot(du * 0.82, v), th = Math.atan2(v, du), c = Math.cos(th);
            const rF = 0.24 * (0.85 + 0.3 * AN(th, 1.3, sd));
            const rH = 0.08 * (0.85 + 0.3 * AN(th, 1.6, sd + 3));
            const k = Math.max(0, 1 - r / rF);
            // lòng phễu là hố 3D thật (BulletHoleLayer): vết chỉ thêm chút ẩm sẫm, không vẽ giả độ sâu nữa
            h -= 0.12 * Math.pow(k, 1.4);
            d *= 1 - 0.2 * Math.pow(k, 0.7);
            if (r < rH) d = Math.min(d, 0.55 + 0.25 * r / rH);
            const rim = Math.exp(-Math.pow((r - rF * 1.05) / 0.07, 2)) * (0.5 + 0.5 * Math.max(0, c));
            h += 0.28 * rim * (0.7 + 0.6 * mid);
            const rays = AN(th, 9, sd + 5) * 0.65 + AN(th, 22, sd + 6) * 0.35;
            const ext = 0.42 + 0.5 * Math.pow(Math.max(0, c), 1.3) * (0.5 + 0.8 * rays);
            const fan = 1 - smooth(rF * 0.9, ext, r);
            // đất / cát bị đẩy dồn lên ngay mép miệng hố: không để vòng đất sạch quanh lỗ
            const dens = fan * (0.45 + 0.9 * rays) + 0.5 * Math.exp(-Math.pow((r - rF) / 0.09, 2));
            const g = grains(u, v, dens, sd + 9);
            e = Math.max(e, fan * 0.5 * (0.6 + 0.8 * mid) + g * 0.35);
            d *= (1 - 0.22 * g - 0.07 * fan) * (1 - 0.14 * rim);
            h += 0.025 * g + 0.04 * fan;
          } else if (kind === 'hei') {
            // 30mm nổ-mảnh: hố nổ nhỏ có vành đất, lòng hố đất lật + muội nổ loang lổ (dồn về phía trước),
            // hạt đất văng quanh vành, rỗ lỗ mảnh văng rải xa kèm vệt cày ngắn
            const du = u, r = Math.hypot(du * 0.88, v), th = Math.atan2(v, du), c = Math.cos(th);
            const rc = 0.24 * (0.88 + 0.28 * AN(th, 1.5, sd));
            const k = Math.max(0, 1 - (r / rc) * (r / rc));
            h -= 0.15 * k;
            d *= 1 - 0.3 * Math.pow(k, 0.6);
            e = Math.max(e, 0.4 * Math.min(1, k * 2));
            const rim = Math.exp(-Math.pow((r - rc * 1.02) / 0.075, 2)) * (0.6 + 0.4 * Math.max(0, c));
            h += 0.2 * rim * (0.65 + 0.7 * mid);
            d *= 1 - 0.12 * rim;
            const sootR = 0.55 * (0.7 + 0.6 * AN(th, 2.4, sd + 11)) * (1 + 0.25 * c);
            const sN = fbm(u * 6 + sd, v * 6, 4, sd + 12);
            const soot = (1 - smooth(rc * 0.5, sootR, r)) * smooth(0.3, 0.68, sN);
            d *= 1 - 0.36 * soot;
            const rays = AN(th, 9, sd + 5) * 0.65 + AN(th, 22, sd + 6) * 0.35;
            const ejD = (1 - smooth(rc * 0.9, rc * (2.3 + 0.9 * Math.max(0, c)), r)) * (0.5 + 0.8 * rays) * (r > rc * 0.9 ? 1 : 0.3);
            const g = grains(u, v, ejD, sd + 9);
            e = Math.max(e, ejD * 0.45 + g * 0.3);
            d *= 1 - 0.2 * g;
            h += 0.03 * g + 0.05 * ejD;
          } else {
            // 30mm đạn cháy: hố nông, vệt cháy xém nâu đỏ loang lổ
            const du = u, r = Math.hypot(du * 0.9, v), th = Math.atan2(v, du), c = Math.cos(th);
            const rc = 0.2 * (0.85 + 0.3 * AN(th, 1.5, sd));
            const k = Math.max(0, 1 - (r / rc) * (r / rc));
            h -= 0.12 * k; d *= 1 - 0.35 * Math.pow(k, 0.6);
            const rim = Math.exp(-Math.pow((r - rc) / 0.06, 2));
            h += 0.22 * rim * (0.7 + 0.6 * mid);
            const burnR = 0.66 * (0.65 + 0.7 * AN(th, 2.6, sd + 7)) * (1 + 0.2 * c);
            const bN = fbm(u * 7 + sd, v * 7, 4, sd + 14);
            const burn = (1 - smooth(rc * 0.5, burnR, r)) * smooth(0.3, 0.66, bN);
            d *= 1 - 0.5 * burn;
            const g = grains(u, v, (1 - smooth(rc, rc * 2, r)) * 0.7, sd + 9);
            e = Math.max(e, g * 0.35); h += 0.02 * g;
          }
          if (pits && R0 > 0.26) {
            for (const p of pits) {
              const qx = u - p.x, qy = v - p.y;
              const along = qx * p.dx + qy * p.dy, side = qx * p.dy - qy * p.dx;
              // lỗ mảnh + vệt cày ngắn phía ngoài (mảnh bay ra xa tâm)
              const pit = Math.exp(-(qx * qx + qy * qy) / (p.pr * p.pr));
              const sl = along > 0 ? Math.exp(-Math.pow(along / p.len, 2) - Math.pow(side / (p.pr * 0.45), 2)) : 0;
              if (pit < 0.01 && sl < 0.01) continue;
              d *= 1 - 0.5 * pit - 0.2 * sl;
              h -= 0.05 * pit;
            }
          }
          const a = 1 - smooth(0.82, 0.98, R0);
          const i = ((oy + py) * BM_SIZE + ox + px) * 4;
          data[i] = Math.round(clamp01(d) * 255);
          data[i + 1] = Math.round(clamp01(e) * 255);
          data[i + 2] = Math.round(clamp01(0.5 + h * 0.5) * 255);
          data[i + 3] = Math.round(a * 255);
        }
      }
    }
    const tex = new THREE.DataTexture(data, BM_SIZE, BM_SIZE, THREE.RGBAFormat);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.needsUpdate = true;
    BM_TEX[kind] = tex;
    return tex;
  }

  // Hướng nắng thật (lấy từ DirectionalLight của cảnh) cho mọi vết đạn
  const BM_SUN = { value: new THREE.Vector3(-0.38, 0.8, -0.42).normalize() };
  const BM_SUN_CACHE = new WeakMap();
  function bmTrackSun(renderer, scene) {
    let L = BM_SUN_CACHE.get(scene);
    if (L === undefined) {
      L = null;
      scene.traverse(o => { if (!L && o.isDirectionalLight) L = o; });
      BM_SUN_CACHE.set(scene, L);
    }
    if (L) {
      const t = L.target ? L.target.position : null;
      BM_SUN.value.set(L.position.x - (t ? t.x : 0), L.position.y - (t ? t.y : 0), L.position.z - (t ? t.z : 0));
      if (BM_SUN.value.lengthSq() > 1e-6) BM_SUN.value.normalize();
    }
  }
  const BM_VERT = `
    attribute vec2 iMark;
    varying vec2 vUv; varying vec2 vOff; varying float vPow; varying vec3 vTint; varying vec3 vT; varying vec3 vB; varying vec3 vN; varying float vFogD;
    void main() {
      // ô atlas tính ở đỉnh & làm tròn: nội suy varying ra 1.99999 thay vì 2 -> mod() chọn nhầm ô, rơi mất từng hàng điểm ảnh
      float vr = floor(iMark.x + 0.5);
      vUv = uv; vOff = vec2(mod(vr, 2.0), floor(vr * 0.5 + 0.25)) * 0.5; vPow = iMark.y;
      #ifdef USE_INSTANCING_COLOR
        vTint = instanceColor;
      #else
        vTint = vec3(1.0);
      #endif
      mat4 m = modelMatrix;
      #ifdef USE_INSTANCING
        m = modelMatrix * instanceMatrix;
      #endif
      vT = normalize(mat3(m) * vec3(1.0, 0.0, 0.0) + 1e-6);
      vB = normalize(mat3(m) * vec3(0.0, 1.0, 0.0) + 1e-6);
      vN = normalize(mat3(m) * vec3(0.0, 0.0, 1.0) + 1e-6);
      vec4 mv = viewMatrix * m * vec4(position, 1.0);
      vFogD = -mv.z;
      gl_Position = projectionMatrix * mv;
    }`;
  const BM_FRAG = `
    uniform sampler2D map; uniform vec3 uDark; uniform vec3 uSun; uniform float uRelief;
    uniform vec3 fogColor; uniform float fogDensity; uniform float fogNear; uniform float fogFar;
    varying vec2 vUv; varying vec2 vOff; varying float vPow; varying vec3 vTint; varying vec3 vT; varying vec3 vB; varying vec3 vN; varying float vFogD;
    void main() {
      vec2 uv = vOff + clamp(vUv, 0.01, 0.99) * 0.5;
      vec4 t = texture2D(map, uv);
      float s = 1.5 / ${BM_SIZE}.0;
      float hx = texture2D(map, uv - vec2(s, 0.0)).b - texture2D(map, uv + vec2(s, 0.0)).b;
      float hy = texture2D(map, uv - vec2(0.0, s)).b - texture2D(map, uv + vec2(0.0, s)).b;
      vec3 nl = normalize(vec3(hx * uRelief, hy * uRelief, 1.0));
      vec3 nw = normalize(vT * nl.x + vB * nl.y + vN * nl.z);
      float lit0 = 0.6 + max(dot(vN, uSun), 0.0);
      float relief = clamp((0.6 + max(dot(nw, uSun), 0.0)) / lit0, 0.5, 1.0);
      float d = pow(t.r, vPow);
      vec3 m = mix(uDark, vec3(1.0), d);
      m *= mix(vec3(1.0), vTint, t.g) * relief;
      m = mix(vec3(1.0), m, t.a);
      // ngoài vết: bỏ hẳn điểm ảnh (không tốn hoà màu, các quad chồng nhau không lộ viền)
      if (t.a < 0.004 || dot(abs(m - 1.0), vec3(1.0)) < 0.006) discard;
      #ifdef USE_FOG
        #ifdef FOG_EXP2
          float ff = 1.0 - exp(-fogDensity * fogDensity * vFogD * vFogD);
        #else
          float ff = smoothstep(fogNear, fogFar, vFogD);
        #endif
        m = mix(m, vec3(1.0), clamp(ff, 0.0, 1.0));
      #endif
      gl_FragColor = vec4(clamp(m, 0.0, 1.0), 1.0);
    }`;
  const BM_MAT = {};
  function getBulletMarkMaterial(kind) {
    if (BM_MAT[kind]) return BM_MAT[kind];
    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        map: { value: null }, uDark: { value: new THREE.Vector3() }, uRelief: { value: 6 }
      }]),
      vertexShader: BM_VERT, fragmentShader: BM_FRAG,
      transparent: true, depthWrite: false, fog: true,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
      blendSrc: THREE.DstColorFactor, blendDst: THREE.ZeroFactor,
      polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5
    });
    mat.uniforms.map.value = getBulletMarkAtlas(kind);
    mat.uniforms.uDark.value.fromArray(BM_DARK[kind] || BM_DARK.pock);
    mat.uniforms.uRelief.value = BM_RELIEF[kind] || 6;
    mat.uniforms.uSun = BM_SUN;
    BM_MAT[kind] = mat;
    return mat;
  }
  /** InstancedMesh vết đạn trên đất: instanceColor = màu đất lật (theo vật liệu), iMark = (biến thể 0-3, độ đậm >= 1) */
  function makeBulletMarkMesh(kind, cap) {
    const geo = new THREE.PlaneGeometry(1, 1);
    const mark = new THREE.InstancedBufferAttribute(new Float32Array(cap * 2), 2);
    for (let i = 0; i < cap; i++) mark.setXY(i, 0, 1);
    geo.setAttribute('iMark', mark);
    const im = new THREE.InstancedMesh(geo, getBulletMarkMaterial(kind), cap);
    im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
    im.count = 0; im.frustumCulled = false; im.renderOrder = 3;
    im.onBeforeRender = bmTrackSun;
    im.userData.isFxDecal = true;
    return im;
  }
  // Màu đất lật / hất lên (tỉ lệ so với mặt đất) theo vật liệu điểm chạm: cát lật sẫm & đậm màu hơn, đất cỏ lộ đất nâu
  function bulletMarkTint(pal) {
    if (!pal || !pal.soil || !pal.dust) return [0.84, 0.79, 0.72];
    const k = (i) => Math.max(0.35, Math.min(1.05, 1 - 0.75 * (1 - pal.soil[i] / Math.max(0.05, pal.dust[i]))));
    return [k(0), k(1), k(2)];
  }

  // Cỡ hố đạn khi cắm thẳng đứng: [bán kính miệng, độ sâu] (đơn vị game, 8 = 1 m) theo loại đạn & vật liệu.
  // Cát khô sụt thành phễu rộng nông (góc nghỉ ~33°); đất chặt lỗ nhỏ & sâu; bùn lún sâu, miệng toác; nhựa đường / đá / bê tông
  // chỉ mẻ một lớp nông. 30mm nổ-mảnh khoét hố nổ ~20-25 cm, sâu ~10 cm trên đất.
  const HOLE_SIZE = {
    SCOUT_BULLET: { sand: [0.55, 0.32], soil: [0.36, 0.5], mud: [0.5, 0.6], asphalt: [0.28, 0.13], rock: [0.22, 0.07], hard: [0.24, 0.08] },
    GATLING_BULLET: { sand: [1.35, 0.7], soil: [1.0, 0.85], mud: [1.2, 0.95], asphalt: [0.8, 0.24], rock: [0.6, 0.14], hard: [0.65, 0.16] },
    INCENDIARY: { sand: [1.1, 0.55], soil: [0.85, 0.65], mud: [1.0, 0.7], asphalt: [0.65, 0.2], rock: [0.5, 0.12], hard: [0.55, 0.14] }
  };
  // Màu lớp vật liệu lộ ra trong lòng hố, NHÂN với màu mặt đất (>1 = sáng hơn mặt): cát ẩm sẫm, đất nâu dưới thảm cỏ,
  // bùn đen, đá dăm xám sáng dưới lớp nhựa đường đen, đá / bê tông vỡ tươi màu sáng
  function holeTint(mat, mapType, ammo) {
    let t;
    if (mat === 'sand') t = [0.82, 0.76, 0.68];
    else if (mat === 'mud') t = [0.5, 0.46, 0.42];
    else if (mat === 'asphalt') t = [1.55, 1.53, 1.48];
    else if (mat === 'rock') t = [1.25, 1.22, 1.18];
    else if (mat === 'hard') t = [1.2, 1.18, 1.12];
    else if (mapType === 'URBAN') t = [0.72, 0.7, 0.68];
    else if (mapType === 'DESERT') t = [0.74, 0.66, 0.58];
    else t = [0.9, 0.66, 0.6];        // cỏ: lớp đất nâu bên dưới lộ ra
    if (ammo === 'GATLING_BULLET') t = [t[0] * 0.78, t[1] * 0.75, t[2] * 0.73];        // muội nổ trong lòng hố
    else if (ammo === 'INCENDIARY') t = [t[0] * 0.62, t[1] * 0.5, t[2] * 0.44];        // cháy xém
    return t;
  }
  /**
   * Hình hố theo góc đạn tới (độ, so với mặt đất) & vật liệu:
   *  - đạn thường: >= 55° phễu tròn; 20-55° hố trứng dài dần, sâu nhất về phía trước; < 20° rãnh cày dài nông;
   *    12.7mm < 15° trên nhựa đường / đá / bê tông: nảy đi (ricochet), chỉ để vệt cào nông
   *  - đạn nổ (30mm): hố do vụ nổ nên ít phụ thuộc góc; < 35° hố hơi dài về phía trước
   */
  function holeSpec(ammo, mat, theta) {
    const S = (HOLE_SIZE[ammo] || HOLE_SIZE.SCOUT_BULLET)[mat] || (HOLE_SIZE[ammo] || HOLE_SIZE.SCOUT_BULLET).soil;
    const R = S[0] * rand(0.85, 1.15), D = S[1] * rand(0.85, 1.15);
    const explosive = ammo === 'GATLING_BULLET' || ammo === 'INCENDIARY';
    const hardSurf = mat === 'asphalt' || mat === 'rock' || mat === 'hard';
    if (explosive) {
      if (theta >= 35) return { arch: 'round', len: 2 * R, wid: 2 * R, depth: D, ric: false };
      const k = (35 - theta) / 35;
      return { arch: 'oblique', len: 2 * R * (1 + 0.6 * k), wid: 2 * R * (1 - 0.1 * k), depth: D * (1 - 0.2 * k), ric: false };
    }
    if (hardSurf && theta < 15) return { arch: 'groove', len: 2 * R * 3.2, wid: 2 * R * 0.45, depth: D * 0.25, ric: true };
    if (theta >= 55) return { arch: 'round', len: 2 * R, wid: 2 * R, depth: D, ric: false };
    if (theta >= 20) {
      const k = (55 - theta) / 35;
      return { arch: 'oblique', len: 2 * R * (1 + k), wid: 2 * R * (1 - 0.25 * k), depth: D * (1 - 0.25 * k), ric: false };
    }
    const k = (20 - theta) / 20;
    return { arch: 'groove', len: 2 * R * (2.1 + 1.2 * k), wid: 2 * R * (0.7 - 0.25 * k), depth: D * (0.6 - 0.35 * k), ric: false };
  }

  // Lớp vết đạn trên đất dùng khi bản đồ không có hệ EnvDamage (phòng thử hiệu ứng): vòng lặp theo loại vết
  class GroundMarkLayer {
    constructor(scene, cap = 400) {
      this.scene = scene; this.cap = cap; this.layers = {};
      this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._q2 = new THREE.Quaternion();
      this._p = new THREE.Vector3(); this._s = new THREE.Vector3(); this._n = new THREE.Vector3(); this._z = new THREE.Vector3(0, 0, 1);
    }
    layer(kind) {
      let L = this.layers[kind];
      if (!L) {
        const im = makeBulletMarkMesh(kind, this.cap);
        this.scene.add(im);
        L = this.layers[kind] = { im, next: 0, total: 0 };
      }
      return L;
    }
    // Tương thích HoleLayer cũ (lỗ mảnh văng): lỗ phễu nhỏ hướng ngẫu nhiên
    add(x, y, z, nx, ny, nz, size) { this.mark('pock', x, y, z, { nx, ny, nz, size: size * 0.75, rot: Math.random() * 6.283 }); }
    /** o: { nx, ny, nz, size, rot (trục +u theo hướng bay), stretch, tint:[r,g,b], strength } */
    mark(kind, x, y, z, o = {}) {
      const L = this.layer(kind);
      const n = this._n.set(o.nx || 0, o.ny === undefined ? 1 : o.ny, o.nz || 0).normalize();
      this._q.setFromUnitVectors(this._z, n);
      this._q2.setFromAxisAngle(this._z, o.rot !== undefined ? o.rot : Math.random() * 6.283);
      this._q.multiply(this._q2);
      this._p.set(x + n.x * 0.12, y + n.y * 0.12, z + n.z * 0.12);
      const sz = o.size || 3;
      this._s.set(sz * (o.stretch || 1), sz, 1);
      this._m.compose(this._p, this._q, this._s);
      const i = L.next;
      L.im.setMatrixAt(i, this._m);
      const t = o.tint || [0.84, 0.79, 0.72];
      L.im.instanceColor.setXYZ(i, t[0], t[1], t[2]);
      L.im.geometry.attributes.iMark.setXY(i, Math.floor(Math.random() * 4), o.strength || 1);
      L.next = (L.next + 1) % this.cap;
      L.total = Math.min(this.cap, L.total + 1);
      L.im.count = L.total;
      L.im.instanceMatrix.needsUpdate = true;
      L.im.instanceColor.needsUpdate = true;
      L.im.geometry.attributes.iMark.needsUpdate = true;
    }
    clear() { for (const k in this.layers) { const L = this.layers[k]; L.next = 0; L.total = 0; L.im.count = 0; } }
  }

  // ===========================================================================
  // HỐ ĐẠN 3D THẬT TRÊN ĐẤT
  //  Lòng hố là lưới 3D nằm DƯỚI mặt đất. Để nhìn thấy nó:
  //   1) "nắp" hố (đúng hình miệng hố) vẽ sau mặt đất: không tô màu, chỉ đánh dấu stencil ở những điểm ảnh miệng hố
  //      thực sự nhìn thấy (xe / vật cản đứng trước thì phép thử độ sâu loại nắp -> không khoét xuyên qua xe). Stencil = 255 (cửa kính xe vỡ dùng 1..250)
  //   2) lòng hố vẽ bỏ qua độ sâu nhưng CHỈ trong vùng stencil đó, rồi xoá stencil. Lòng hố là mặt lồi nhìn từ trên
  //      -> mỗi điểm ảnh chỉ có đúng 1 mặt trước, không cần sắp thứ tự.
  //  Màu: lòng hố NHÂN màu mặt đất đã vẽ sẵn ở điểm ảnh đó (blend 2x: dst*src*2) -> luôn khớp cát / cỏ / đất / nhựa đường,
  //  rồi đổ bóng theo pháp tuyến thật của vách hố + tự che nắng (vách phía nắng che đáy hố) + tối dần theo độ sâu
  //  + màu lớp vật liệu bên dưới (cát ẩm, đất nâu dưới cỏ, đá dăm sáng dưới nhựa đường...).
  //  Hình dạng: trục +X = hướng đạn bay. c = độ lệch tâm (0: phễu tròn đạn cắm đứng; 0.3: hố trứng đạn xiên, sâu nhất
  //  phía trước; 0.55: rãnh cày đạn lướt). Bề mặt y = q - 1 với q lồi -> mặt lồi.
  // ===========================================================================
  const HOLE_ARCH = { round: 0, oblique: 0.3, groove: 0.55 };
  function buildHoleGeos(c, NR = 5, NS = 18) {
    const pos = [], ha = [], idx = [], cpos = [], cidx = [];
    const aUp = 1 + c, aDn = 1 - c;
    pos.push(c, -1, 0); ha.push(aDn);
    for (let k = 1; k <= NR; k++) {
      const t = k / NR;
      for (let s = 0; s < NS; s++) {
        const ph = s / NS * Math.PI * 2, cs = Math.cos(ph), sn = Math.sin(ph), a = cs < 0 ? aUp : aDn;
        pos.push(c + t * a * cs, k === NR ? 0 : t * t - 1, t * sn); ha.push(a);
      }
    }
    const V = (k, s) => k === 0 ? 0 : 1 + (k - 1) * NS + (s % NS);
    for (let s = 0; s < NS; s++) idx.push(0, V(1, s + 1), V(1, s));
    for (let k = 1; k < NR; k++) for (let s = 0; s < NS; s++) {
      idx.push(V(k, s), V(k, s + 1), V(k + 1, s + 1));
      idx.push(V(k, s), V(k + 1, s + 1), V(k + 1, s));
    }
    // nắp miệng hố: quạt tam giác trên đúng vòng mép của lòng hố
    cpos.push(c, 0, 0);
    for (let s = 0; s < NS; s++) { const o = (1 + (NR - 1) * NS + s) * 3; cpos.push(pos[o], 0, pos[o + 2]); }
    for (let s = 0; s < NS; s++) cidx.push(0, 1 + ((s + 1) % NS), 1 + s);
    const mk = (p, ix) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setIndex(ix); return g; };
    const bowl = mk(pos, idx), cap = mk(cpos, cidx);
    bowl.setAttribute('hA', new THREE.Float32BufferAttribute(ha, 1));
    // mặt trước phải hướng lên (+Y): kiểm tra tam giác đầu, đảo nếu ngược
    const fix = (g) => {
      const P = g.attributes.position, I = g.index.array;
      const a = new THREE.Vector3().fromBufferAttribute(P, I[0]), b = new THREE.Vector3().fromBufferAttribute(P, I[1]), d = new THREE.Vector3().fromBufferAttribute(P, I[2]);
      const n = b.sub(a).cross(d.sub(a));
      if (n.y < 0) for (let i = 0; i < I.length; i += 3) { const t = I[i + 1]; I[i + 1] = I[i + 2]; I[i + 2] = t; }
    };
    fix(bowl); fix(cap);
    return { bowl, cap };
  }
  const HOLE_LIGHT = { amb: { value: 0.8 }, sun: { value: 1.3 } };
  function holeTrackLights(renderer, scene) {
    bmTrackSun(renderer, scene);
    let L = HOLE_LIGHT_CACHE.get(scene);
    if (L === undefined) {
      L = { amb: [], dir: null };
      scene.traverse(o => { if (o.isAmbientLight || o.isHemisphereLight) L.amb.push(o); else if (!L.dir && o.isDirectionalLight) L.dir = o; });
      HOLE_LIGHT_CACHE.set(scene, L);
    }
    let a = 0;
    for (const o of L.amb) a += o.intensity * (o.isHemisphereLight ? 0.75 : 1);
    HOLE_LIGHT.amb.value = Math.max(0.15, a);
    HOLE_LIGHT.sun.value = L.dir ? L.dir.intensity : 1;
  }
  const HOLE_LIGHT_CACHE = new WeakMap();
  const HOLE_VERT = `
    attribute float hA;
    varying vec3 vL; varying vec3 vS; varying float vA; varying vec3 vTint; varying vec3 vT; varying vec3 vB; varying vec3 vN; varying float vFogD;
    void main() {
      mat4 m = modelMatrix * instanceMatrix;
      vec3 c0 = (modelMatrix * vec4(instanceMatrix[0].xyz, 0.0)).xyz, c1 = (modelMatrix * vec4(instanceMatrix[1].xyz, 0.0)).xyz, c2 = (modelMatrix * vec4(instanceMatrix[2].xyz, 0.0)).xyz;
      vS = vec3(length(c0), length(c1), length(c2)) + 1e-6;
      vT = c0 / vS.x; vB = c1 / vS.y; vN = c2 / vS.z;
      vL = position; vA = hA;
      #ifdef USE_INSTANCING_COLOR
        vTint = instanceColor;
      #else
        vTint = vec3(1.0);
      #endif
      vec4 mv = viewMatrix * m * vec4(position, 1.0);
      vFogD = -mv.z;
      gl_Position = projectionMatrix * mv;
      // hố ở xa (> ~140 m) chỉ còn vài điểm ảnh, vết phẳng trên đất đã đủ -> bỏ vẽ (giữ được hàng nghìn hố cả trận)
      if (distance((m * vec4(0.0, 0.0, 0.0, 1.0)).xyz, cameraPosition) > 1100.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    }`;
  const HOLE_FRAG = `
    uniform vec3 uSun; uniform float uAmb; uniform float uSunI; uniform float uC;
    uniform vec3 fogColor; uniform float fogDensity; uniform float fogNear; uniform float fogFar;
    varying vec3 vL; varying vec3 vS; varying float vA; varying vec3 vTint; varying vec3 vT; varying vec3 vB; varying vec3 vN; varying float vFogD;
    // độ sâu bề mặt lòng hố (đơn vị cục bộ, y = q - 1) tại (x, z) cục bộ
    float holeQ(vec2 p) { float a = p.x < uC ? 1.0 + uC : 1.0 - uC; float dx = (p.x - uC) / a; return dx * dx + p.y * p.y; }
    void main() {
      float a = vL.x < uC ? 1.0 + uC : 1.0 - uC;
      // pháp tuyến giải tích của y = ((x-c)/a)^2 + z^2 - 1 sau khi co giãn theo (dài, sâu, rộng) của từng hố
      float gx = 2.0 * (vL.x - uC) / (a * a) * vS.y / vS.x, gz = 2.0 * vL.z * vS.y / vS.z;
      vec3 nl = normalize(vec3(-gx, 1.0, -gz));
      // các cột ma trận: T = trục x (hướng bay), B = pháp tuyến mặt đất (y), N = trục z
      vec3 nw = normalize(vT * nl.x + vB * nl.y + vN * nl.z);
      vec3 Ll = vec3(dot(uSun, vT), dot(uSun, vB), dot(uSun, vN));      // hướng nắng trong hệ cục bộ đã co giãn
      // tự che nắng: dò theo tia nắng xem có chui vào lòng đất quanh miệng hố không
      vec3 P = vL * vS;
      float vis = 1.0, st = max(vS.x, vS.z) * 0.32;
      for (int i = 1; i <= 7; i++) {
        vec3 Q = P + Ll * (st * float(i));
        vec2 q2 = vec2(Q.x / vS.x, Q.z / vS.z);
        float q = holeQ(q2);
        if (q < 1.0 && Q.y / vS.y < q - 1.0 - 0.02) vis -= 0.2;
        if (q >= 1.0 && Q.y < 0.0) vis -= 0.2;
      }
      vis = clamp(vis, 0.0, 1.0);
      float dn = clamp(-vL.y, 0.0, 1.0);
      float lit = uAmb * (1.0 - 0.45 * dn * dn) + uSunI * max(dot(nw, uSun), 0.0) * vis;
      float lit0 = uAmb + uSunI * max(dot(vB, uSun), 0.0);
      vec3 f = mix(vec3(1.0), vTint, smoothstep(0.0, 0.45, dn)) * (lit / lit0);
      #ifdef USE_FOG
        #ifdef FOG_EXP2
          float ff = 1.0 - exp(-fogDensity * fogDensity * vFogD * vFogD);
        #else
          float ff = smoothstep(fogNear, fogFar, vFogD);
        #endif
        f = mix(f, vec3(1.0), clamp(ff, 0.0, 1.0));
      #endif
      gl_FragColor = vec4(clamp(f, 0.0, 2.0) * 0.5, 1.0);
    }`;
  const CAP_VERT = `
    void main() {
      mat4 m = modelMatrix * instanceMatrix;
      gl_Position = projectionMatrix * viewMatrix * m * vec4(position, 1.0);
      if (distance((m * vec4(0.0, 0.0, 0.0, 1.0)).xyz, cameraPosition) > 1100.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    }`;
  const CAP_FRAG = `void main() { gl_FragColor = vec4(0.0); }`;

  class BulletHoleLayer {
    constructor(scene, cap = 450) {
      this.scene = scene; this.cap = cap; this.L = {};
      this._m = new THREE.Matrix4(); this._x = new THREE.Vector3(); this._y = new THREE.Vector3(); this._z = new THREE.Vector3();
      for (const name in HOLE_ARCH) {
        const c = HOLE_ARCH[name], G = buildHoleGeos(c);
        const capMat = new THREE.ShaderMaterial({
          vertexShader: CAP_VERT, fragmentShader: CAP_FRAG,
          colorWrite: false, depthWrite: false, depthTest: true,
          polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -6,
          stencilWrite: true, stencilRef: 255, stencilFunc: THREE.AlwaysStencilFunc,
          stencilZPass: THREE.ReplaceStencilOp, stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp
        });
        const bowlMat = new THREE.ShaderMaterial({
          uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uC: { value: c } }]),
          vertexShader: HOLE_VERT, fragmentShader: HOLE_FRAG, fog: true,
          depthWrite: true, depthTest: true, depthFunc: THREE.AlwaysDepth,
          blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.DstColorFactor, blendDst: THREE.SrcColorFactor,
          stencilWrite: true, stencilRef: 255, stencilFunc: THREE.EqualStencilFunc,
          stencilZPass: THREE.ZeroStencilOp, stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.ZeroStencilOp
        });
        bowlMat.uniforms.uSun = BM_SUN; bowlMat.uniforms.uAmb = HOLE_LIGHT.amb; bowlMat.uniforms.uSunI = HOLE_LIGHT.sun;
        const capIm = new THREE.InstancedMesh(G.cap, capMat, cap);
        const bowlIm = new THREE.InstancedMesh(G.bowl, bowlMat, cap);
        bowlIm.instanceMatrix = capIm.instanceMatrix;     // chung ma trận: nắp & lòng hố luôn khớp nhau
        bowlIm.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
        // sau mặt đất & xe (renderOrder 0) -> vật đứng trước hố đã có độ sâu, nắp không khoét xuyên qua
        capIm.renderOrder = 1; bowlIm.renderOrder = 2;
        for (const im of [capIm, bowlIm]) { im.count = 0; im.frustumCulled = false; im.userData.isFxDecal = true; scene.add(im); }
        bowlIm.onBeforeRender = holeTrackLights;
        this.L[name] = { capIm, bowlIm, next: 0, total: 0, pos: new Float32Array(cap * 2), map: new Map(), key: new Array(cap).fill(null), grow: new Float32Array(cap) };
      }
    }
    /**
     * x,y,z: tâm miệng hố trên mặt đất; n: pháp tuyến mặt đất; fx,fz: hướng bay ngang; arch: round|oblique|groove;
     * len / wid: dài & rộng miệng hố, depth: độ sâu (đơn vị game); tint: màu lớp vật liệu dưới mặt (nhân với màu mặt đất)
     */
    add(arch, x, y, z, n, fx, fz, len, wid, depth, tint) {
      const L = this.L[arch] || this.L.round;
      // đạn rơi trúng hố cũ: khoét hố đó rộng & sâu thêm (tối đa ~1,45 lần) thay vì đè thêm hố mới -> loạt đạn dồn một chỗ
      // không chiếm hết chỗ giữ hố, hố trên cả bản đồ tồn tại lâu hơn
      const cs = len < 1.6 ? 0.9 : 1.8;
      const key = (len < 1.6 ? 's' : 'b') + Math.round(x / cs) + ',' + Math.round(z / cs);
      const j = L.map.get(key);
      if (j !== undefined && L.key[j] === key) {
        const g = L.grow[j];
        if (g < 1.45) {
          const k = Math.min(1.45, g * 1.1) / g, kd = Math.sqrt(k);
          L.grow[j] = g * k;
          L.capIm.getMatrixAt(j, this._m);
          const e = this._m.elements;
          e[0] *= k; e[1] *= k; e[2] *= k; e[4] *= kd; e[5] *= kd; e[6] *= kd; e[8] *= k; e[9] *= k; e[10] *= k;
          L.capIm.setMatrixAt(j, this._m);
          L.capIm.instanceMatrix.needsUpdate = true;
        }
        return;
      }
      const Y = this._y.set(n.x, n.y, n.z).normalize();
      const X = this._x.set(fx, 0, fz);
      X.addScaledVector(Y, -X.dot(Y));
      if (X.lengthSq() < 1e-6) X.set(1, 0, 0).addScaledVector(Y, -Y.x);
      X.normalize();
      const Z = this._z.crossVectors(X, Y).normalize();
      const lift = 0.06;
      this._m.set(
        X.x * len * 0.5, Y.x * depth, Z.x * wid * 0.5, x + Y.x * lift,
        X.y * len * 0.5, Y.y * depth, Z.y * wid * 0.5, y + Y.y * lift,
        X.z * len * 0.5, Y.z * depth, Z.z * wid * 0.5, z + Y.z * lift,
        0, 0, 0, 1);
      const i = L.next;
      L.capIm.setMatrixAt(i, this._m);
      L.bowlIm.instanceColor.setXYZ(i, tint[0], tint[1], tint[2]);
      L.pos[i * 2] = x; L.pos[i * 2 + 1] = z;
      if (L.key[i] && L.map.get(L.key[i]) === i) L.map.delete(L.key[i]);
      L.key[i] = key; L.map.set(key, i); L.grow[i] = 1;
      L.next = (L.next + 1) % this.cap;
      L.total = Math.min(this.cap, L.total + 1);
      L.capIm.count = L.bowlIm.count = L.total;
      L.capIm.instanceMatrix.needsUpdate = true;
      L.bowlIm.instanceColor.needsUpdate = true;
    }
    // mặt đất trong vùng vừa đổi (hố pháo mới / hố bị lấp): bỏ các hố đạn nhỏ ở đó (đã bị đất đá vùi / thổi bay)
    removeIn(x0, z0, x1, z1) {
      const Z = new THREE.Matrix4().makeScale(0, 0, 0);
      for (const k in this.L) {
        const L = this.L[k];
        let any = false;
        for (let i = 0; i < L.total; i++) {
          const x = L.pos[i * 2], z = L.pos[i * 2 + 1];
          if (x >= x0 && x <= x1 && z >= z0 && z <= z1) { L.capIm.setMatrixAt(i, Z); L.pos[i * 2] = 1e9; if (L.key[i] && L.map.get(L.key[i]) === i) L.map.delete(L.key[i]); L.key[i] = null; any = true; }
        }
        if (any) L.capIm.instanceMatrix.needsUpdate = true;
      }
    }
    clear() { for (const k in this.L) { const L = this.L[k]; L.next = 0; L.total = 0; L.capIm.count = L.bowlIm.count = 0; L.map.clear(); L.key.fill(null); } }
  }

  // ===========================================================================
  // VẾT ĐẠN NHỎ TRÊN BỀ MẶT CỨNG (vẽ từng điểm ảnh, có bản đồ pháp tuyến, nhiều biến thể)
  //  steelDent   12.7mm vào giáp dày: hõm nhỏ thép trần sáng, sơn tróc nham nhở quanh, vệt chì / đồng bắn tỏa
  //  steelHole   12.7mm thủng thép mỏng: lỗ tròn đen mép cánh hoa lật vào, vòng tróc sơn lộ thép
  //  heiSplash   30mm nổ trên giáp dày: hố cày nông, muội nổ loang, rỗ mảnh văng, sơn cháy rộp
  //  heiHole     30mm thủng giáp nhẹ: lỗ rách lởm chởm, mép thép lật, muội, rỗ mảnh
  //  concretePit đạn vào bê tông / đá: hố mẻ màu bê tông tươi SÁNG hơn mặt tường, đá dăm lộ ra, lỗ tối ở tâm, nứt chân chim mảnh,
  //              bụi xi măng phủ quanh;  concretePitHE: thêm muội nổ
  //  woodHole    đạn vào thân cây: gỗ tươi màu sáng lộ ra kéo dài theo thớ dọc, vỏ cây rách lật, dằm gỗ, lỗ tối
  //  cactusHole  đạn vào xương rồng: thịt xanh nhạt ướt, lỗ sẫm, nhựa chảy xuống
  // ===========================================================================
  const PIT_TEX = {};
  function getPitTex(kind, variant = 0) {
    const key = kind + variant;
    if (PIT_TEX[key]) return PIT_TEX[key];
    const S = 128, data = new Uint8Array(S * S * 4), nd = new Uint8Array(S * S * 4), H = new Float32Array(S * S);
    const sd = variant * 37 + kind.length * 11 + kind.charCodeAt(0);
    const AN = (th, R, s) => vnoise(Math.cos(th) * R + 50, Math.sin(th) * R + 50, s | 0);
    const N = (x, y, s) => vnoise(x, y, s | 0);
    // lỗ rỗ mảnh văng (30mm)
    const pits = [];
    if (kind === 'heiSplash' || kind === 'heiHole' || kind === 'concretePitHE') for (let i = 0; i < 22; i++) {
      const a = hash2(i, sd, 3) * 6.283, r = 0.3 + Math.sqrt(hash2(i, sd, 4)) * 0.6;
      pits.push([Math.cos(a) * r, Math.sin(a) * r, 0.012 + hash2(i, sd, 5) * 0.02]);
    }
    // nứt chân chim (bê tông): đường gãy khúc từ mép hố
    const cracks = [];
    if (kind.startsWith('concrete')) for (let k = 0; k < 5; k++) {
      let a = hash2(k, sd, 9) * 6.283, x = Math.cos(a) * 0.22, y = Math.sin(a) * 0.22;
      const pts = [[x, y]];
      for (let s = 0; s < 6; s++) { a += (hash2(k * 7 + s, sd, 10) - 0.5) * 0.9; const l = 0.05 + hash2(k * 7 + s, sd, 11) * 0.06; x += Math.cos(a) * l; y += Math.sin(a) * l; pts.push([x, y]); }
      cracks.push(pts);
    }
    const segD = (px, py, ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))); return Math.hypot(px - ax - dx * t, py - ay - dy * t); };
    for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
      const u = (px + 0.5) / S * 2 - 1, v = (py + 0.5) / S * 2 - 1, R0 = Math.hypot(u, v), th = Math.atan2(v, u);
      let col = [0, 0, 0], a = 0, h = 0;
      // phủ lớp màu c độ phủ al lên trên (alpha thẳng, không bị pha đen ở chỗ trong suốt)
      const put = (c, al) => {
        const k = Math.max(0, Math.min(1, al)), na = a + (1 - a) * k;
        if (na <= 1e-5) return;
        const wo = a * (1 - k) / na, wn = k / na;
        col = [col[0] * wo + c[0] * wn, col[1] * wo + c[1] * wn, col[2] * wo + c[2] * wn]; a = na;
      };
      const fine = N(u * 40 + sd, v * 40, sd + 1), mid = fbm(u * 6 + sd, v * 6, 3, sd + 2);
      if (kind === 'steelDent' || kind === 'steelHole') {
        const hole = kind === 'steelHole';
        const rc = (hole ? 0.1 : 0.15) * (0.9 + 0.2 * AN(th, 1.5, sd));
        // vệt chì / đồng bắn tỏa mờ (không phải quầng muội)
        const splash = (1 - smooth(0.2, 0.62, R0)) * (0.4 + 0.6 * AN(th, 7, sd + 3));
        put([0.42, 0.41, 0.4], splash * 0.35);
        // sơn tróc: mảng thép trần xỉn, mép nham nhở
        const chipR = (hole ? 0.27 : 0.33) * (0.7 + 0.6 * AN(th, 3, sd + 4)) + (fine - 0.5) * 0.05;
        if (R0 < chipR) { put([0.5 + 0.08 * mid, 0.5 + 0.08 * mid, 0.48 + 0.07 * mid], 0.92); h += 0.04; }
        else if (R0 < chipR + 0.025) put([0.22, 0.21, 0.19], 0.55);   // mép sơn bong bóng tối
        if (hole) {
          // cánh hoa thép lật vào trong + lỗ đen
          const pet = 0.5 + 0.5 * Math.cos(th * 6 + AN(th, 2, sd) * 4);
          if (R0 < rc * 1.6) { put([0.66, 0.65, 0.62], 0.95); h -= 0.35 * (1 - R0 / (rc * 1.6)); }
          if (R0 < rc * (0.95 + 0.25 * pet)) { put([0.02, 0.02, 0.02], 1); h = -1; }
        } else {
          // hõm thép sáng bóng, đáy có vệt chì xám
          if (R0 < rc) { const k = 1 - (R0 / rc) * (R0 / rc); put([0.68, 0.67, 0.64], 0.95); h -= 0.8 * k; if (R0 < rc * 0.45) put([0.36, 0.35, 0.34], 0.8); }
          h += 0.25 * Math.exp(-Math.pow((R0 - rc * 1.1) / 0.03, 2));
        }
      } else if (kind === 'heiSplash' || kind === 'heiHole') {
        const hole = kind === 'heiHole';
        const sootR = 0.62 * (0.7 + 0.6 * AN(th, 2.5, sd + 5));
        const soot = (1 - smooth(0.12, sootR, R0)) * smooth(0.3, 0.7, mid);
        put([0.06, 0.055, 0.05], Math.min(1, soot * 1.1));
        const burnR = 0.36 * (0.75 + 0.5 * AN(th, 3, sd + 6));
        if (R0 < burnR) put([0.28, 0.24, 0.2], 0.55 * (1 - R0 / burnR));      // sơn cháy rộp nâu
        const rc = (hole ? 0.17 : 0.16) * (0.85 + 0.3 * AN(th, 2, sd));
        if (R0 < rc * 1.5) { put([0.27, 0.255, 0.24], 0.9); h -= 0.18 * (1 - R0 / (rc * 1.5)); }   // thép cháy xém xỉn, không bóng
        if (hole) {
          const jag = rc * (0.9 + 0.35 * AN(th, 6, sd + 7));
          if (R0 < jag) { put([0.015, 0.015, 0.015], 1); h = -1; }
        } else if (R0 < rc) { put([0.4, 0.38, 0.35], 0.9); h -= 0.35 * (1 - (R0 / rc) * (R0 / rc)); }
      } else if (kind === 'concretePit' || kind === 'concretePitHE') {
        // bụi xi măng phủ mờ (sáng hơn)
        put([0.86, 0.85, 0.82], (1 - smooth(0.25, 0.85, R0)) * 0.3 * (0.6 + 0.4 * mid));
        if (kind === 'concretePitHE') { const sR = 0.6 * (0.7 + 0.6 * AN(th, 2.5, sd + 5)); put([0.1, 0.095, 0.09], (1 - smooth(0.15, sR, R0)) * smooth(0.3, 0.7, mid) * 0.75); }
        for (const pts of cracks) {
          let dmin = 9;
          for (let s = 1; s < pts.length; s++) dmin = Math.min(dmin, segD(u, v, pts[s - 1][0], pts[s - 1][1], pts[s][0], pts[s][1]));
          if (dmin < 0.012) { put([0.25, 0.24, 0.23], 0.7 * (1 - dmin / 0.012)); h -= 0.08; }
        }
        const rc = (kind === 'concretePitHE' ? 0.34 : 0.3) * (0.7 + 0.6 * AN(th, 3, sd)) + (fine - 0.5) * 0.04;
        if (R0 < rc) {
          const k = 1 - R0 / rc;
          // bê tông tươi lộ ra: sáng, đá dăm lốm đốm
          const agg = smooth(0.62, 0.7, N(u * 22 + sd, v * 22, sd + 8));
          const c0 = 0.74 - 0.25 * k;
          put([c0 - 0.18 * agg, c0 - 0.19 * agg, c0 - 0.2 * agg + 0.02], 0.97);
          h -= 0.7 * Math.pow(k, 0.8);
        }
        if (R0 < 0.07) { put([0.12, 0.115, 0.11], 0.95); h = -1; }
      } else if (kind === 'woodHole' || kind === 'cactusHole') {
        // trục v = dọc thân cây (đặt decal theo hướng thẳng đứng): kéo dài theo thớ gỗ
        const cactus = kind === 'cactusHole';
        const ex = cactus ? 0.24 : 0.12, ey = cactus ? 0.28 : 0.46;
        // gỗ: mép rách theo thớ dọc (răng cưa theo hàng ngang u, không phải cánh hoa theo góc)
        const e = Math.hypot(u / ex, v / ey) + (cactus ? (AN(th, 4, sd) - 0.5) * 0.3 : (N(u * 30 + sd, 0.5, sd + 3) - 0.5) * 0.45 * Math.abs(v / ey)) + (fine - 0.5) * 0.1;
        if (cactus) {
          if (v < 0 && Math.abs(u + 0.03 * Math.sin(v * 9)) < 0.03 && v > -0.8 * (0.5 + 0.5 * hash2(1, sd, 2))) put([0.35, 0.42, 0.18], 0.6);   // nhựa chảy xuống
          if (e < 1.15) put([0.25, 0.32, 0.14], 0.7);
          if (e < 1) { put([0.62, 0.74, 0.44], 0.95); h -= 0.4 * (1 - e); }
          if (e < 0.32) { put([0.16, 0.2, 0.08], 1); h = -1; }
        } else {
          // vỏ cây rách lật quanh mép (sẫm), dằm gỗ nhọn hai đầu theo thớ dọc
          if (e < 1.18) { put([0.15, 0.1, 0.065], 0.7); h += 0.15; }
          const grain = 0.5 + 0.5 * Math.sin(u * 90 + N(u * 6, v * 2, sd) * 6);
          if (e < 1) { put([0.78 - 0.1 * grain, 0.64 - 0.09 * grain, 0.45 - 0.07 * grain], 0.97); h -= 0.35 * (1 - e); }
          const spl = Math.abs(u) < 0.05 * (1 - Math.abs(v) / 0.62) && Math.abs(v) > ey * 0.7 && Math.abs(v) < 0.62 && hash2(Math.floor(u * 40), sd, 7) > 0.4;
          if (spl) { put([0.82, 0.7, 0.5], 0.9); h += 0.2; }
          if (Math.hypot(u / 0.045, v / 0.09) < 1) { put([0.07, 0.05, 0.03], 1); h = -1; }
        }
      }
      // ô chỉ trong suốt hoàn toàn trước mép texture
      a *= 1 - smooth(0.88, 0.99, R0);
      for (const p of pits) {
        const dd = Math.hypot(u - p[0], v - p[1]);
        if (dd < p[2] * 1.8) { const k = 1 - dd / (p[2] * 1.8); put(dd < p[2] ? [0.08, 0.075, 0.07] : [0.55, 0.53, 0.5], 0.85 * Math.min(1, k * 3)); h -= 0.3 * k; }
      }
      const i = (py * S + px) * 4;
      data[i] = col[0] * 255; data[i + 1] = col[1] * 255; data[i + 2] = col[2] * 255; data[i + 3] = a * 255;
      H[py * S + px] = h;
    }
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const hx = H[y * S + Math.min(S - 1, x + 1)] - H[y * S + Math.max(0, x - 1)];
      const hy = H[Math.min(S - 1, y + 1) * S + x] - H[Math.max(0, y - 1) * S + x];
      let nx = -hx * 4, ny = -hy * 4, nz = 1;
      const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      const i = (y * S + x) * 4;
      nd[i] = (nx * 0.5 + 0.5) * 255; nd[i + 1] = (ny * 0.5 + 0.5) * 255; nd[i + 2] = (nz * 0.5 + 0.5) * 255; nd[i + 3] = 255;
    }
    const mk = (d) => { const t = new THREE.DataTexture(d, S, S, THREE.RGBAFormat); t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true; return t; };
    const out = { map: mk(data), normal: mk(nd) };
    PIT_TEX[key] = out;
    return out;
  }
  const PIT_KINDS = { steelDent: 1, steelHole: 1, heiSplash: 1, heiHole: 1, concretePit: 1, concretePitHE: 1, woodHole: 1, cactusHole: 1 };
  const PIT_MAT = {};
  // Vật liệu dùng chung theo loại + biến thể (hàng trăm vết đạn không tạo hàng trăm vật liệu)
  function getPitMaterial(kind, variant) {
    const key = kind + variant;
    if (PIT_MAT[key]) return PIT_MAT[key];
    const T = getPitTex(kind, variant);
    const metal = kind.startsWith('steel'), sooty = kind.startsWith('hei');
    const m = new THREE.MeshStandardMaterial({
      map: T.map, normalMap: T.normal, normalScale: new THREE.Vector2(sooty ? 0.8 : 1.4, sooty ? 0.8 : 1.4),
      roughness: metal ? 0.5 : sooty ? 0.85 : kind === 'cactusHole' ? 0.45 : 0.92, metalness: metal ? 0.55 : sooty ? 0.15 : 0,
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8
    });
    m.userData.shared = true;
    PIT_MAT[key] = m;
    return m;
  }

  // Lớp vết đạn trên bề mặt không gắn được vào lưới (tường lặp instanced, thân cây): mỗi loại 3 biến thể, 1 lần vẽ mỗi biến thể
  class PitLayer {
    constructor(scene, kind, cap = 240) {
      this.layers = [];
      this.cap = cap;
      for (let v = 0; v < 3; v++) {
        const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), getPitMaterial(kind, v), cap);
        im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);   // sắc vật liệu tường (bê tông / gạch mộc...)
        im.count = 0; im.frustumCulled = false; im.renderOrder = 4; im.userData.isFxDecal = true;
        scene.add(im);
        this.layers.push({ im, next: 0, total: 0, pos: new Float32Array(cap * 3), tag: new Array(cap).fill(null) });
      }
      this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._p = new THREE.Vector3();
      this._x = new THREE.Vector3(); this._y = new THREE.Vector3(); this._z = new THREE.Vector3();
    }
    /** p: điểm, n: pháp tuyến, size, up: hướng trục dọc của vết (null = ngẫu nhiên), tag: vật mang vết (cây) */
    add(p, n, size, up = null, tag = null, stretch = 1, tint = null) {
      const L = this.layers[Math.floor(Math.random() * this.layers.length)];
      const Z = this._z.set(n.x, n.y, n.z).normalize();
      const Y = this._y;
      if (up) Y.set(up.x, up.y, up.z); else { const a = Math.random() * 6.283; Y.set(Math.cos(a), Math.sin(a), 0.3); }
      Y.addScaledVector(Z, -Y.dot(Z));
      if (Y.lengthSq() < 1e-6) Y.set(0, 0, 1).addScaledVector(Z, -Z.z);
      Y.normalize();
      const X = this._x.crossVectors(Y, Z).normalize();
      this._m.makeBasis(X.multiplyScalar(size), Y.multiplyScalar(size * stretch), Z);
      this._m.setPosition(p.x + n.x * 0.12, p.y + n.y * 0.12, p.z + n.z * 0.12);
      const i = L.next;
      L.im.setMatrixAt(i, this._m);
      L.im.instanceColor.setXYZ(i, tint ? tint[0] : 1, tint ? tint[1] : 1, tint ? tint[2] : 1);
      L.im.instanceColor.needsUpdate = true;
      L.pos[i * 3] = p.x; L.pos[i * 3 + 1] = p.y; L.pos[i * 3 + 2] = p.z; L.tag[i] = tag;
      L.next = (L.next + 1) % this.cap; L.total = Math.min(this.cap, L.total + 1); L.im.count = L.total;
      L.im.instanceMatrix.needsUpdate = true;
    }
    removeWhere(fn) {
      const Z = new THREE.Matrix4().makeScale(0, 0, 0);
      for (const L of this.layers) {
        let any = false;
        for (let i = 0; i < L.total; i++) if (L.pos[i * 3 + 1] > -1e8 && fn(L.pos[i * 3], L.pos[i * 3 + 1], L.pos[i * 3 + 2], L.tag[i])) { L.im.setMatrixAt(i, Z); L.pos[i * 3 + 1] = -1e9; L.tag[i] = null; any = true; }
        if (any) L.im.instanceMatrix.needsUpdate = true;
      }
    }
    removeNear(x, y, z, r) { this.removeWhere((px, py, pz) => (px - x) ** 2 + (py - y) ** 2 + (pz - z) ** 2 < r * r); }
    clear() { for (const L of this.layers) { L.next = 0; L.total = 0; L.im.count = 0; L.tag.fill(null); } }
  }

  // Texture vết nổ trên bê tông (đạn nổ / nổ lõm không xuyên): muội khói loang không đều, hố sứt hình đa giác méo
  // màu bê tông vỡ (xám tươi hơn mặt tường chút, không trắng), lòng hố sẫm có đá dăm, vài vết nứt ngắn từ miệng hố.
  // Viền ngoài trong suốt hoàn toàn -> không lộ hình vuông / quầng giấy.
  const WALL_TEX = [];
  function getWallTexture(variant) {
    if (WALL_TEX[variant] || typeof document === 'undefined') return WALL_TEX[variant];
    const size = 256, c = size / 2;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const rnd = (i) => hash2(i, variant * 17 + 5, 11);
    // 1. Muội khói: nhiều đốm mờ chồng nhau, lệch tâm ngẫu nhiên, đậm ở giữa và tan hết trước mép texture
    for (let i = 0; i < 22; i++) {
      const a = rnd(i) * Math.PI * 2, rr = c * (0.08 + rnd(i + 10) * 0.42);
      const px = c + Math.cos(a) * rr, py = c + Math.sin(a) * rr * 0.85;
      const rad = c * (0.18 + rnd(i + 20) * 0.26) * (1 - rr / c * 0.5);
      const g = ctx.createRadialGradient(px, py, 0, px, py, rad);
      g.addColorStop(0, `rgba(30, 27, 24, ${0.1 + rnd(i + 30) * 0.12})`);
      g.addColorStop(1, 'rgba(30, 27, 24, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(px - rad, py - rad, rad * 2, rad * 2);
    }
    // Đường viền đa giác méo quanh tâm
    const blob = (r0, jit, n, seed) => {
      const pts = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + (rnd(seed + i * 3) - 0.5) * 0.35;
        const r = r0 * (1 - jit + rnd(seed + i * 7) * jit * 2) * (rnd(seed + i * 11) < 0.15 ? 1.3 : 1);
        pts.push([c + Math.cos(a) * r, c + Math.sin(a) * r]);
      }
      ctx.beginPath();
      pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
      ctx.closePath();
    };
    // 2. Vài vết nứt ngắn tỏa từ miệng hố (mảnh, gãy khúc nhẹ, mờ dần, không chạm mép texture)
    ctx.lineCap = 'round';
    const nCrack = 4 + Math.floor(rnd(1) * 4);
    for (let i = 0; i < nCrack; i++) {
      let a = rnd(i * 5 + 40) * Math.PI * 2, x = c + Math.cos(a) * c * 0.22, y = c + Math.sin(a) * c * 0.22;
      const len = c * (0.18 + rnd(i * 5 + 41) * 0.3), steps = 6;
      for (let k = 0; k < steps; k++) {
        a += (rnd(i * 31 + k) - 0.5) * 0.7;
        const nx = x + Math.cos(a) * len / steps, ny = y + Math.sin(a) * len / steps;
        ctx.strokeStyle = `rgba(28, 25, 22, ${0.75 * (1 - k / steps)})`;
        ctx.lineWidth = Math.max(0.6, 1.8 * (1 - k / steps));
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(nx, ny); ctx.stroke();
        x = nx; y = ny;
      }
    }
    // 3. Hố sứt: bê tông vỡ lộ cốt liệu (xám tươi), mép gãy có viền tối
    blob(c * 0.3, 0.28, 15, 100);
    ctx.fillStyle = 'rgba(150, 146, 138, 0.95)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(55, 51, 46, 0.6)'; ctx.lineWidth = 1.5; ctx.stroke();
    for (let i = 0; i < 70; i++) {
      const a = rnd(i + 130) * Math.PI * 2, r = c * Math.sqrt(rnd(i + 190)) * 0.28;
      const v = 90 + Math.floor(rnd(i + 220) * 80);
      ctx.fillStyle = `rgba(${v}, ${v - 4}, ${v - 9}, 0.85)`;
      ctx.fillRect(c + Math.cos(a) * r, c + Math.sin(a) * r, 1 + rnd(i) * 3, 1 + rnd(i + 7) * 2.5);
    }
    // 4. Lòng hố sâu hơn: bóng tối dần vào tâm, đáy sẫm méo
    const gIn = ctx.createRadialGradient(c, c, 0, c, c, c * 0.24);
    gIn.addColorStop(0, 'rgba(40, 37, 34, 0.75)');
    gIn.addColorStop(1, 'rgba(40, 37, 34, 0)');
    ctx.fillStyle = gIn;
    ctx.fillRect(0, 0, size, size);
    blob(c * 0.1, 0.35, 10, 300);
    ctx.fillStyle = 'rgba(26, 24, 22, 0.9)';
    ctx.fill();
    // 5. Vụn bê tông bám quanh miệng hố (ít, nhỏ)
    for (let i = 0; i < 30; i++) {
      const a = rnd(i + 400) * Math.PI * 2, r = c * (0.3 + rnd(i + 450) * 0.2);
      const v = 120 + Math.floor(rnd(i + 470) * 50);
      ctx.fillStyle = `rgba(${v}, ${v - 3}, ${v - 8}, ${0.4 + rnd(i + 490) * 0.4})`;
      ctx.fillRect(c + Math.cos(a) * r, c + Math.sin(a) * r, 1 + rnd(i + 500) * 2, 1 + rnd(i + 510) * 2);
    }
    const t = new THREE.CanvasTexture(canvas);
    WALL_TEX[variant] = t;
    return t;
  }

  // ===========================================================================
  // HỆ THỐNG HẠT BILLBOARD TRÊN GPU
  // ===========================================================================
  const VERT = `
    attribute vec3 iPos;
    attribute float iSize;
    attribute vec3 iColor;
    attribute float iAlpha;
    attribute float iRot;
    attribute float iCell;
    varying vec2 vUv;
    varying vec3 vColor;
    varying float vAlpha;
    #include <fog_pars_vertex>
    void main() {
      vec4 mvPosition = modelViewMatrix * vec4(iPos, 1.0);
      // Kéo tấm hạt dọc tia nhìn về phía camera ~1/3 cỡ hạt (vị trí & cỡ trên màn hình giữ nguyên): tấm phẳng không cắt
      // ngang vỏ xe / mặt đất thành đường mép thẳng sắc ngay cạnh chỗ khói bốc (không có bản đồ độ sâu để làm mờ mềm thật)
      float dist = -mvPosition.z;
      float pull = min(iSize * 0.35, max(0.0, dist - 2.0));
      float kz = dist > 0.0 ? (dist - pull) / dist : 1.0;
      mvPosition.xyz *= kz;
      float c = cos(iRot), s = sin(iRot);
      vec2 p = position.xy * iSize * kz;
      mvPosition.xy += vec2(c * p.x - s * p.y, s * p.x + c * p.y);
      gl_Position = projectionMatrix * mvPosition;
      vec2 cellOff = vec2(mod(iCell, 2.0), floor(iCell / 2.0)) * 0.5;
      vUv = cellOff + (position.xy + 0.5) * 0.5;
      vColor = iColor;
      vAlpha = iAlpha;
      #include <fog_vertex>
    }`;
  const FRAG = `
    uniform sampler2D map;
    varying vec2 vUv;
    varying vec3 vColor;
    varying float vAlpha;
    #include <fog_pars_fragment>
    void main() {
      vec4 t = texture2D(map, vUv);
      float a = t.a * vAlpha;
      if (a < 0.004) discard;
      gl_FragColor = vec4(t.rgb * vColor, a);
      #include <fog_fragment>
    }`;

  class ParticleLayer {
    constructor(scene, max, additive) {
      this.max = max;
      this.parts = [];
      const g = new THREE.InstancedBufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
      g.setIndex([0, 1, 2, 0, 2, 3]);
      const mk = (n) => {
        const a = new THREE.InstancedBufferAttribute(new Float32Array(max * n), n);
        a.setUsage(THREE.DynamicDrawUsage);
        return a;
      };
      this.aPos = mk(3); this.aSize = mk(1); this.aColor = mk(3); this.aAlpha = mk(1); this.aRot = mk(1); this.aCell = mk(1);
      g.setAttribute('iPos', this.aPos);
      g.setAttribute('iSize', this.aSize);
      g.setAttribute('iColor', this.aColor);
      g.setAttribute('iAlpha', this.aAlpha);
      g.setAttribute('iRot', this.aRot);
      g.setAttribute('iCell', this.aCell);
      g.instanceCount = 0;
      const mat = new THREE.ShaderMaterial({
        uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: null } }]),
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        fog: true
      });
      mat.uniforms.map.value = getAtlas();
      this.mesh = new THREE.Mesh(g, mat);
      this.mesh.frustumCulled = false;
      this.mesh.renderOrder = additive ? 11 : 10;
      scene.add(this.mesh);
      this.geo = g;
    }

    /**
     * p: { x,y,z, vx,vy,vz, size, grow, drag, grav, life, alpha, fadeIn, c0:[r,g,b], c1:[r,g,b], cell, rot, rotV, delay, floor, ax, az }
     */
    add(p) {
      // Bể đầy: thay một hạt trong 1/4 cũ nhất (mảng giữ thứ tự theo tuổi) thay vì bỏ hạt mới
      // -> khói tên lửa / vụ nổ mới vẫn hiện khi chiến trường đang mù mịt khói
      let slot = -1;
      if (this.parts.length >= this.max) {
        this._evict = ((this._evict || 0) + 1) % Math.max(1, this.max >> 2);
        slot = this._evict;
      }
      p.t = 0;
      p.rot = p.rot !== undefined ? p.rot : Math.random() * Math.PI * 2;
      p.rotV = p.rotV !== undefined ? p.rotV : (Math.random() - 0.5) * 0.8;
      p.fadeIn = p.fadeIn || 0.04;
      p.delay = p.delay || 0;
      p.c1 = p.c1 || p.c0;
      if (slot >= 0) this.parts[slot] = p;
      else this.parts.push(p);
    }

    // Sóng xung kích quét qua khói / bụi cũ: đẩy bạt ra ngoài, làm loãng & tan nhanh hơn
    // Đẩy khói / bụi trong bán kính R. r0..r1: chỉ đẩy hạt nằm trong vành đó (sóng xung kích gọi mỗi khung
    // với vành mặt sóng vừa quét qua -> hạt xa bị đẩy muộn hơn, đúng lúc sóng tới)
    blastPush(x, y, z, R, minAge = 0.2, r0 = 0, r1 = R) {
      for (const p of this.parts) {
        if (p.delay > 0 || p.t < minAge) continue;
        const dx = p.x - x, dy = p.y - y, dz = p.z - z;
        const d = Math.hypot(dx, dy, dz);
        if (d > r1 || d > R || d < 1e-3 || (r0 > 0 && d <= r0)) continue;
        const k = 1 - d / R;
        const disp = R * 0.4 * k;                       // quãng bị đẩy (đơn vị game)
        const sp = disp * Math.max(0.6, p.drag || 0);   // vận tốc cần để lực cản dừng lại đúng quãng đó
        p.vx += dx / d * sp; p.vy += (dy / d * 0.5 + 0.25) * sp; p.vz += dz / d * sp;
        p.alpha *= 1 - 0.45 * k;
        p.size *= 1 + 0.3 * k;
        if (k > 0.5) p.life = Math.max(p.t + 0.6, p.t + (p.life - p.t) * (1 - 0.5 * k));
      }
    }

    update(dt, groundAt) {
      const P = this.parts;
      let n = 0;
      for (let i = 0; i < P.length; i++) {
        const p = P[i];
        if (p.delay > 0) {
          p.delay -= dt;
          P[n++] = p;
          continue;
        }
        p.t += dt;
        if (p.t >= p.life) continue;
        const dr = Math.exp(-(p.drag || 0) * dt);
        p.vx *= dr; p.vy *= dr; p.vz *= dr;
        p.vy -= (p.grav || 0) * dt;
        if (p.ax !== undefined) { p.vx += p.ax * dt; p.vz += p.az * dt; }   // gió đẩy ngang liên tục (khói tín hiệu bạt theo gió)
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        p.size += (p.grow || 0) * dt;
        p.rot += p.rotV * dt;
        if (p.floor !== false && groundAt) {
          const gy = groundAt(p.x, p.z) + p.size * 0.22;
          if (p.y < gy) { p.y = gy; if (p.vy < 0) p.vy *= -0.15; }
        }
        P[n++] = p;
      }
      P.length = n;

      const pos = this.aPos.array, sz = this.aSize.array, col = this.aColor.array, al = this.aAlpha.array, ro = this.aRot.array, ce = this.aCell.array;
      let k = 0;
      for (let i = 0; i < n; i++) {
        const p = P[i];
        if (p.delay > 0) continue;
        const r = p.t / p.life;
        const a = p.t < p.fadeIn ? p.alpha * (p.t / p.fadeIn) : p.alpha * Math.pow(1 - (p.t - p.fadeIn) / (p.life - p.fadeIn), p.fadePow || 1.3);
        pos[k * 3] = p.x; pos[k * 3 + 1] = p.y; pos[k * 3 + 2] = p.z;
        sz[k] = p.size;
        const cr = Math.min(1, r * (p.colorRate || 1));
        col[k * 3] = p.c0[0] + (p.c1[0] - p.c0[0]) * cr;
        col[k * 3 + 1] = p.c0[1] + (p.c1[1] - p.c0[1]) * cr;
        col[k * 3 + 2] = p.c0[2] + (p.c1[2] - p.c0[2]) * cr;
        al[k] = Math.max(0, a);
        ro[k] = p.rot;
        ce[k] = p.cell;
        k++;
      }
      this.geo.instanceCount = k;
      for (const a of [this.aPos, this.aSize, this.aColor, this.aAlpha, this.aRot, this.aCell]) a.needsUpdate = true;
    }
  }

  // ===========================================================================
  // ĐẤT ĐÁ VĂNG: HÒN ĐÁ 3D CÓ VẬT LÝ RƠI - NẢY - LĂN
  // ===========================================================================
  function makeRockGeometry() {
    // Chia mịn 1 cấp (80 mặt) rồi làm méo: mảnh vụn sần sùi, góc cạnh không đều, không thành khối xúc xắc 20 mặt
    const g = new THREE.IcosahedronGeometry(1, 1);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      // Lệch theo vị trí -> các mặt dùng chung đỉnh vẫn khít nhau; nhiễu lớn tạo mặt vỡ phẳng nghiêng, nhiễu nhỏ làm sần
      const h1 = hash2(Math.round(x * 100), Math.round(y * 100) + Math.round(z * 100) * 7, 3);
      const h2 = hash2(Math.round(x * 3), Math.round(y * 3) + Math.round(z * 3) * 5, 9);
      const k = 0.6 + h2 * 0.45 + h1 * 0.25;
      pos.setXYZ(i, x * k * 1.1, y * k * 0.7, z * k);
    }
    g.computeVertexNormals();
    return g;
  }

  // Trọng lực thật theo tỉ lệ thế giới (8 đơn vị = 1 m -> 9,81 m/s² = 78,5 đv/s², như đường đạn trong ballistics.js):
  // tia lửa, tàn cháy, đất đá văng đều rơi theo cùng một trọng lực (trước đây 98-140, rơi nhanh gấp 1,25-1,8 lần)
  const GRAV = 78.5;
  const ROCK_G = GRAV, ROCK_VK = Math.sqrt(GRAV / 160);
  class RockLayer {
    constructor(scene, max, color = 0x8a7a63) {
      this.max = max;
      this.rocks = [];
      // Màu riêng từng mảnh (đất / bê tông / thép) qua instanceColor; material trắng
      const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0.02, flatShading: true });
      this.material = mat;
      this.base = new THREE.Color(color);
      this.mesh = new THREE.InstancedMesh(makeRockGeometry(), mat, max);
      this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3).fill(1), 3);
      this.mesh.count = 0;
      this.mesh.castShadow = true;
      this.mesh.receiveShadow = true;
      this.mesh.frustumCulled = false;
      scene.add(this.mesh);
      this._m = new THREE.Matrix4();
      this._q = new THREE.Quaternion();
      this._e = new THREE.Euler();
      this._p = new THREE.Vector3();
      this._s = new THREE.Vector3();
      this._c = new THREE.Color();
    }

    add(r) {
      if (this.rocks.length >= this.max) {
        // Đầy: thay viên đã nằm yên lâu nhất (không bỏ mảnh mới đang bay)
        const i = this.rocks.findIndex(q => q.resting);
        if (i < 0) return;
        this.rocks.splice(i, 1);
      }
      r.t = 0;
      // Trọng lực thật ~78 đơn vị/s² (8 đơn vị = 1 m), dùng 98 (×1,25) cho mảnh có "trọng lượng" trên màn hình. Lời gọi
      // vẫn truyền vận tốc theo trọng lực cũ 160 -> thu vận tốc √(98/160) để giữ nguyên tầm văng / độ cao, chỉ thời gian
      // bay dài ra như thật (trước đây mảnh rơi nhanh gấp đôi thực tế, trông nhẹ như đồ chơi)
      r.vx *= ROCK_VK; r.vy *= ROCK_VK; r.vz *= ROCK_VK;
      r.rx = Math.random() * 6; r.ry = Math.random() * 6; r.rz = Math.random() * 6;
      r.wx = (Math.random() - 0.5) * 14; r.wy = (Math.random() - 0.5) * 14; r.wz = (Math.random() - 0.5) * 14;
      r.resting = false;
      this.rocks.push(r);
    }

    // Mặt đất dưới vùng (x0..x1, z0..z1) vừa đổi: mảnh đang nằm yên hạ / nâng theo mặt mới
    reground(x0, z0, x1, z1, groundAt) {
      for (const r of this.rocks) {
        if (!r.resting || r.x < x0 || r.x > x1 || r.z < z0 || r.z > z1) continue;
        r.y = groundAt(r.x, r.z) + r.size * 0.6;
      }
    }

    update(dt, groundAt) {
      const R = this.rocks;
      let n = 0;
      for (let i = 0; i < R.length; i++) {
        const r = R[i];
        r.t += dt;
        if (r.t >= r.life) continue;
        if (!r.resting) {
          r.vy -= ROCK_G * dt;
          r.x += r.vx * dt; r.y += r.vy * dt; r.z += r.vz * dt;
          r.rx += r.wx * dt; r.ry += r.wy * dt; r.rz += r.wz * dt;
          const gy = (groundAt ? groundAt(r.x, r.z) : 0) + r.size * 0.6;
          if (r.y < gy) {
            r.y = gy;
            if (Math.abs(r.vy) < 12 * ROCK_VK) {
              r.resting = true;
              // Mảnh đã rơi nằm yên trên đất: lưu lại lâu (đá, bê tông vụn, mảnh kim loại vương vãi)
              r.life = r.t + (r.restLife || rand(300, 480));   // nằm lại 5-8 phút (bể đầy thì mảnh nằm lâu nhất bị thay)
            } else {
              r.vy = -r.vy * 0.32;
              r.vx *= 0.55; r.vz *= 0.55;
              r.wx *= 0.6; r.wy *= 0.6; r.wz *= 0.6;
            }
          }
        }
        R[n++] = r;
      }
      R.length = n;
      for (let i = 0; i < n; i++) {
        const r = R[i];
        // Hết hạn: lún dần vào cát / bụi phủ (không teo nhỏ biến mất đột ngột)
        const fade = Math.min(1, (r.life - r.t) / 3);
        const shrink = r.resting ? 1 : Math.min(1, (r.life - r.t) / 0.8);
        this._e.set(r.rx, r.ry, r.rz);
        this._q.setFromEuler(this._e);
        this._p.set(r.x, r.y - (r.resting ? (1 - fade) * r.size * 1.3 : 0), r.z);
        this._s.setScalar(r.size * shrink);
        this._m.compose(this._p, this._q, this._s);
        this.mesh.setMatrixAt(i, this._m);
        if (r.c) this._c.setRGB(r.c[0], r.c[1], r.c[2]); else this._c.copy(r.base || this.base);
        this.mesh.setColorAt(i, this._c);
      }
      this.mesh.count = n;
      this.mesh.instanceMatrix.needsUpdate = true;
      this.mesh.instanceColor.needsUpdate = true;
    }
  }

  // ===========================================================================
  // MẢNH KÍNH VỠ: tấm mỏng sắc cạnh, trong & bóng (loé sáng khi lật dưới nắng), cản gió lớn nên bay lả, rơi chậm hơn đá;
  // chạm đất / sàn thì vỡ vụn nằm phẳng lấp lánh (không nảy như đá). Khác hẳn mảnh bê tông (khối đặc, nhám, đục)
  // ===========================================================================
  function makeShardGeometry() {
    // tam giác dài nhọn hơi lệch, 2 mặt (tấm kính dày ~5 mm coi như phẳng)
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.45, 0, -0.5, 0.55, 0, -0.2, -0.05, 0, 0.75], 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
    return g;
  }
  class GlassLayer {
    constructor(scene, max) {
      this.max = max;
      this.parts = [];
      // kính gần như trong suốt: thấy nền phía sau, chỉ sáng & ngả xanh hơn một chút (phản chiếu trời, kể cả trong bóng râm);
      // phản xạ gương mạnh: mảnh lật đúng góc nắng thì loé trắng. Màu tối sẽ làm nền sẫm đi -> trông như sạn, không như kính
      const mat = new THREE.MeshPhongMaterial({ color: 0xd2e8ec, emissive: 0x22343a, specular: 0xffffff, shininess: 70, transparent: true, opacity: 0.44, side: THREE.DoubleSide, depthWrite: false });
      this.mesh = new THREE.InstancedMesh(makeShardGeometry(), mat, max);
      this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3).fill(1), 3);
      this.mesh.count = 0;
      this.mesh.frustumCulled = false;
      this.mesh.renderOrder = 3;
      scene.add(this.mesh);
      this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler();
      this._p = new THREE.Vector3(); this._s = new THREE.Vector3(); this._c = new THREE.Color(); this._n = new THREE.Vector3();
      this.sun = new THREE.Vector3(0.45, 0.8, 0.4).normalize();
    }
    // r: { x, y, z, vx, vy, vz, size, floor? (độ cao sàn phòng: mảnh bay vào trong nhà nằm lại trên sàn), life? }
    add(r) {
      if (this.parts.length >= this.max) {
        const i = this.parts.findIndex(q => q.resting);
        if (i < 0) return;
        this.parts.splice(i, 1);
      }
      r.t = 0; r.resting = false;
      r.life = r.life || rand(30, 45);
      r.ax = rand(0.5, 1.4); r.az = rand(0.5, 1.4);   // tỉ lệ 2 cạnh: mảnh dài / mảnh bè
      r.rx = Math.random() * 6; r.ry = Math.random() * 6; r.rz = Math.random() * 6;
      r.wx = rand(-18, 18); r.wy = rand(-10, 10); r.wz = rand(-18, 18);   // tấm mỏng lật nhanh
      r.ph = Math.random() * 6.283;
      const g = rand(0.85, 1.05);
      r.c = [0.9 * g, 1.0 * g, 1.0 * g];   // kính thường ngả xanh lục nhạt
      this.parts.push(r);
    }
    reground(x0, z0, x1, z1, groundAt) {
      for (const r of this.parts) if (r.resting && r.floor === undefined && r.x >= x0 && r.x <= x1 && r.z >= z0 && r.z <= z1) r.y = groundAt(r.x, r.z) + 0.06;
    }
    update(dt, groundAt) {
      const P = this.parts;
      let n = 0;
      for (let i = 0; i < P.length; i++) {
        const r = P[i];
        r.t += dt;
        if (r.t >= r.life) continue;
        if (!r.resting) {
          // cản không khí lớn (tấm mỏng): vận tốc ngang tắt nhanh, rơi tới vận tốc giới hạn rồi lả xuống
          const k = Math.exp(-1.6 * dt);
          r.vx *= k; r.vz *= k;
          r.vy = Math.max(r.vy - ROCK_G * dt, -45);
          r.x += r.vx * dt; r.y += r.vy * dt; r.z += r.vz * dt;
          r.rx += r.wx * dt; r.ry += r.wy * dt; r.rz += r.wz * dt;
          const gy = r.floor !== undefined ? r.floor : (groundAt ? groundAt(r.x, r.z) : 0);
          if (r.y < gy + 0.06 && r.vy < 0) {
            // vỡ vụn khi chạm: nằm phẳng, nhỏ lại, xoay ngẫu nhiên trên mặt phẳng
            r.y = gy + 0.06; r.resting = true;
            r.rx = rand(-0.3, 0.3); r.rz = rand(-0.3, 0.3);
            r.size *= rand(0.55, 0.8);
            r.life = r.t + rand(25, 40);
          }
        }
        P[n++] = r;
      }
      P.length = n;
      for (let i = 0; i < n; i++) {
        const r = P[i];
        const fade = Math.min(1, (r.life - r.t) / 2);
        this._e.set(r.rx, r.ry, r.rz);
        this._q.setFromEuler(this._e);
        this._p.set(r.x, r.y, r.z);
        this._s.set(r.size * r.ax * fade, r.size, r.size * r.az * fade);
        this._m.compose(this._p, this._q, this._s);
        this.mesh.setMatrixAt(i, this._m);
        // loé sáng: mặt mảnh quay đúng về phía nắng (mảnh đang lật thì chớp liên tục, mảnh nằm trên đất thỉnh thoảng
        // lấp lánh như khi người nhìn / nắng đổi góc) -> kính đọc ra là kính chứ không phải sạn xám
        const d = Math.abs(this._n.set(0, 1, 0).applyQuaternion(this._q).dot(this.sun));
        const tw = r.resting ? Math.pow(Math.max(0, Math.sin(r.t * 2.3 + r.ph)), 10) : 1;
        const gl = 1 + 1.6 * Math.pow(d, 24) * tw;
        this._c.setRGB(Math.min(2.4, r.c[0] * gl), Math.min(2.4, r.c[1] * gl), Math.min(2.4, r.c[2] * gl));
        this.mesh.setColorAt(i, this._c);
      }
      this.mesh.count = n;
      this.mesh.instanceMatrix.needsUpdate = true;
      this.mesh.instanceColor.needsUpdate = true;
    }
  }

  // ===========================================================================
  // HỒ SƠ VỤ NỔ THEO LOẠI ĐẠN
  // ===========================================================================
  // charge: khối thuốc nổ (kg) -> cỡ sóng xung kích. Bán kính sóng thấy được ứng với khoảng cách quy đổi
  // Z = R / W^(1/3) ~ 8 m/kg^(1/3) (áp suất dư ~15 kPa, nổ sát đất): 1,5 kg -> ~9 m, 6,6 kg -> ~15 m
  const SHOCK_R_PER_KG3 = 8 * 8;   // 8 m/kg^(1/3) x 8 đơn vị game / m
  const PROFILES = {
    NORMAL: { kind: 'blast', charge: 1.5, size: 1.65, fire: 1.6, dirt: 1.6, crater: 17, depth: 0.75, sparks: 1.4, linger: 0.4 },
    HE: { kind: 'blast', charge: 2.2, size: 2.5, fire: 2.4, dirt: 2.4, crater: 26, depth: 1.3, sparks: 2.0, linger: 1.6 },
    AP: { kind: 'kinetic', size: 0.85, fire: 0, dirt: 1.4, crater: 0, sparks: 2.0, linger: 0 },
    CLUSTER: { kind: 'blast', charge: 1.6, size: 1.8, fire: 1.7, dirt: 1.6, crater: 18, depth: 0.85, sparks: 1.4, linger: 0.5 },
    CLUSTER_SUBMUNITION: { kind: 'bomblet', charge: 0.03, size: 0.65, fire: 1.0, dirt: 0.8, crater: 6.5, depth: 0.4, sparks: 1.3, linger: 0 },
    RPG: { kind: 'heat', charge: 0.7, size: 1.1, fire: 1.3, dirt: 0.7, crater: 8, depth: 0.6, sparks: 1.8, linger: 0.6 },
    // đầu nổ lõm kép ~4-5 kg thuốc nổ (RPG-7 ~0,7 kg): chớp & khói lớn hơn hẳn RPG, hố nông (luồng phụt dồn về một điểm)
    ANTI_TANK_MISSILE: { kind: 'heat', charge: 4.5, size: 1.9, fire: 1.8, dirt: 1.0, crater: 10, depth: 0.65, sparks: 2.4, linger: 0.5 },
    GATLING_BULLET: { kind: 'bullet', size: 0.16, fire: 0.5, dirt: 0.5, crater: 0, sparks: 0.5, linger: 0, micro: true },
    SCOUT_BULLET: { kind: 'bullet', size: 0.13, fire: 0.25, dirt: 0.45, crater: 0, sparks: 0.5, linger: 0, micro: true },
    INCENDIARY: { kind: 'incendiary', size: 0.17, fire: 1.0, dirt: 0.3, crater: 0, sparks: 1.0, linger: 0.6, micro: true }
  };

  // Cỡ hố nổ thật trên đất (đơn vị game, 8 = 1 m) với ngòi nổ chạm: ra = bán kính lòng hố, da = độ sâu khi rơi thẳng đứng,
  // jet = độ sâu lỗ luồng phụt của đầu nổ lõm. Bán kính ~ khối thuốc nổ^(1/3)
  const CRATER_SPEC = {
    NORMAL: { ra: 9.5, da: 4.2, kind: 'blast' },              // 120mm đa năng ~1,5 kg -> hố ~2,4 m
    HE: { ra: 10.5, da: 4.8, kind: 'blast' },                 // 120mm nổ phá ~2,2 kg -> ~2,6 m, sâu ~0,6 m
    HE155: { ra: 15, da: 7, kind: 'blast' },                  // 155mm ~6,6 kg -> ~3,8 m, sâu ~0,9 m
    CLUSTER: { ra: 7, da: 2.6, kind: 'blast' },
    CLUSTER_SUBMUNITION: { ra: 2.6, da: 1.1, kind: 'cluster' },   // đạn con vài chục gam -> ~0,6 m
    RPG: { ra: 3.4, da: 1.1, jet: 5, kind: 'heat' },
    ANTI_TANK_MISSILE: { ra: 4.6, da: 1.5, jet: 8, kind: 'heat' },  // luồng phụt khoan sâu ~1 m vào đất
    AP: { ra: 6.2, da: 4.5, kind: 'gouge' }                     // mũi tên xuyên giáp cày rãnh ~4 m, rộng ~0,6 m, sâu ~0,3 m
  };
  // Nhiễu nhanh cho hố nổ: bảng nhiễu giá trị 64x64 tính sẵn (lặp tuần hoàn), nội suy song tuyến — dựng hố hàng chục nghìn
  // điểm ảnh mỗi lần nổ, băm số học từng điểm quá chậm (~0,1-0,3 s / hố)
  const NT = 64, NTILE = new Float32Array(NT * NT);
  // nhiễu giá trị LẶP KHÍT (lưới bọc vòng theo chu kỳ bảng) -> không có đường nối mỗi 64 đơn vị nhiễu (lộ rõ trên hố lớn)
  const vnoiseP = (x, y, seed, P) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const x0 = ((xi % P) + P) % P, y0 = ((yi % P) + P) % P, x1 = (x0 + 1) % P, y1 = (y0 + 1) % P;
    const a = hash2(x0, y0, seed), b = hash2(x1, y0, seed), c = hash2(x0, y1, seed), d = hash2(x1, y1, seed);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  for (let j = 0; j < NT; j++) for (let i = 0; i < NT; i++) {
    const f = (vnoiseP(i / 8, j / 8, 5, 8) * 0.5 + vnoiseP(i / 4, j / 4, 22, 16) * 0.25) / 0.75;
    NTILE[j * NT + i] = (f - 0.5) * 1.8 + 0.5;
  }
  const tnoise = (x, y) => {
    const xf = x - Math.floor(x), yf = y - Math.floor(y);
    const xi = Math.floor(x) & (NT - 1), yi = Math.floor(y) & (NT - 1), x1 = (xi + 1) & (NT - 1), y1 = (yi + 1) & (NT - 1);
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = NTILE[yi * NT + xi], b = NTILE[yi * NT + x1], c = NTILE[y1 * NT + xi], d = NTILE[y1 * NT + x1];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  let CLOD_GEO = null;
  const cnoise = (x, y, s) => tnoise(x * 0.9 + s * 7.31, y * 0.9 + s * 3.17) * 0.65 + tnoise(x * 2.1 + s * 1.7, y * 2.1 - s * 2.9) * 0.35;

  const rand = (a, b) => a + Math.random() * (b - a);
  const mix = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
  const REGISTRY = new WeakMap(); // scene -> ExplosionFX (mỗi scene một hệ thống: trận đấu, phòng xem, phòng thử)

  // ===========================================================================
  // VẾT ĐẠN GẮN LÊN BỀ MẶT (xe, tường) THEO ĐÚNG ĐIỂM CHẠM & PHÁP TUYẾN
  // ===========================================================================
  const MARK_TEX = {};
  function getMarkTexture(kind) {
    if (MARK_TEX[kind] || typeof document === 'undefined') return MARK_TEX[kind];
    const size = 128, c = size / 2;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const rnd = (i) => hash2(i, kind.length * 7 + 1, 21);
    if (kind === 'penetration' || kind === 'penetrationGlow') {
      const glow = kind === 'penetrationGlow';
      if (!glow) {
        // Muội cháy loang lổ không đều (vài đám chồng lệch tâm), không phải đĩa đen tròn
        for (let i = 0; i < 6; i++) {
          const ox = c + (rnd(i + 300) - 0.5) * c * 0.5, oy = c + (rnd(i + 310) - 0.5) * c * 0.5;
          const g = ctx.createRadialGradient(ox, oy, 2, ox, oy, c * (0.35 + rnd(i + 320) * 0.4));
          g.addColorStop(0, `rgba(18,15,12,${0.35 + rnd(i + 330) * 0.2})`);
          g.addColorStop(1, 'rgba(25,22,20,0)');
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, size, size);
        }
        // Mép thép bị xé lật ra ngoài: hình sao lởm chởm màu thép trần sáng xỉn
        const star = (r0, r1, n, seed) => {
          ctx.beginPath();
          for (let i = 0; i <= n; i++) {
            const a = (i / n) * Math.PI * 2 + (rnd(i + seed) - 0.5) * 0.3;
            const r = c * (i % 2 ? r0 : r1) * (0.75 + rnd(i * 3 + seed) * 0.5);
            const x = c + Math.cos(a) * r, y = c + Math.sin(a) * r;
            i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
          }
          ctx.closePath();
        };
        ctx.fillStyle = 'rgba(118,112,104,0.9)';
        star(0.2, 0.34, 14, 400); ctx.fill();
        ctx.fillStyle = 'rgba(70,64,58,0.95)';
        star(0.15, 0.24, 12, 500); ctx.fill();
        // Lỗ thủng méo, cạnh sắc
        ctx.fillStyle = 'rgba(3,3,3,1)';
        star(0.09, 0.15, 10, 600); ctx.fill();
        // Vết nứt tỏa từ lỗ
        ctx.strokeStyle = 'rgba(15,13,11,0.75)'; ctx.lineWidth = 1;
        for (let i = 0; i < 5; i++) {
          let a = rnd(i + 700) * Math.PI * 2, r = c * 0.15;
          ctx.beginPath(); ctx.moveTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
          for (let k = 0; k < 3; k++) { a += (rnd(i * 5 + k + 720) - 0.5) * 0.6; r += c * 0.08; ctx.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r); }
          ctx.stroke();
        }
      } else {
        // Viền nóng đỏ quanh lỗ thủng (bản đồ phát sáng)
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, size, size);
        const g = ctx.createRadialGradient(c, c, c * 0.1, c, c, c * 0.36);
        g.addColorStop(0, 'rgba(0,0,0,1)');
        g.addColorStop(0.35, 'rgba(255,190,90,1)');
        g.addColorStop(1, 'rgba(0,0,0,1)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, size, size);
      }
    } else if (kind === 'turretRing') {
      // Lỗ vòng tháp bị hất tung: lòng tối sâu, mép thép rách lởm chởm, cháy sém quanh miệng
      const g = ctx.createRadialGradient(c, c, c * 0.5, c, c, c);
      g.addColorStop(0, 'rgba(12,10,9,0.95)');
      g.addColorStop(1, 'rgba(15,13,11,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = 'rgba(3,3,3,1)';
      ctx.beginPath();
      for (let i = 0; i < 28; i++) {
        const a = (i / 28) * Math.PI * 2, r = c * (0.58 + rnd(i) * 0.1);
        if (i === 0) ctx.moveTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
        else ctx.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(70,66,60,0.9)';
      ctx.lineWidth = 2;
      ctx.stroke();
    } else if (kind === 'turretRingGlow') {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, size, size);
      const g = ctx.createRadialGradient(c, c, c * 0.5, c, c, c * 0.72);
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(0.45, 'rgba(255,150,60,1)');
      g.addColorStop(1, 'rgba(0,0,0,1)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
    } else if (kind === 'scorch') {
      // Vệt muội khói cháy xém: tiêu biến mềm mại dần về 0 ở rìa (không tràn khung)
      const g = ctx.createRadialGradient(c, c, 2, c, c, c * 0.72);
      g.addColorStop(0, 'rgba(12, 10, 9, 0.78)');
      g.addColorStop(0.45, 'rgba(25, 22, 20, 0.38)');
      g.addColorStop(0.82, 'rgba(25, 22, 20, 0)');
      g.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
      for (let i = 0; i < 35; i++) {
        const a = rnd(i) * Math.PI * 2, r = c * Math.pow(rnd(i + 70), 0.7) * 0.68;
        ctx.fillStyle = `rgba(15, 13, 11, ${0.18 + rnd(i + 140) * 0.28})`;
        ctx.beginPath();
        ctx.arc(c + Math.cos(a) * r, c + Math.sin(a) * r, 0.6 + rnd(i + 210) * 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (kind === 'armorCrater') {
      // Hố lõm giáp thép biến dạng 3D do đạn pháo va đập cực mạnh:
      // - Lòng chảo lõm sâu có bóng đổ 3D thể tích
      // - Gờ thép bị nén đội phồng lên, tróc sơn lộ kim loại sáng bạc
      // - Muội khói cháy xém ôm gọn quanh hố, tiêu biến mềm mại không tràn khung
      const gSmoke = ctx.createRadialGradient(c, c, c * 0.25, c, c, c * 0.78);
      gSmoke.addColorStop(0, 'rgba(15, 13, 11, 0.88)');
      gSmoke.addColorStop(0.5, 'rgba(32, 28, 25, 0.42)');
      gSmoke.addColorStop(0.85, 'rgba(25, 22, 20, 0)');
      gSmoke.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = gSmoke;
      ctx.fillRect(0, 0, size, size);

      // Vành gờ thép bị ép đội phồng lên (Raised Rim), tróc lớp sơn ngoài để lộ cốt thép màu sáng bạc
      ctx.beginPath();
      const rimSteps = 24;
      for (let i = 0; i <= rimSteps; i++) {
        const a = (i / rimSteps) * Math.PI * 2;
        const r = c * (0.42 + rnd(i * 3 + 20) * 0.12 + (i % 2 === 0 ? 0.04 : -0.03));
        const px = c + Math.cos(a) * r, py = c + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      // Đổ bóng 3D chiaroscuro: nửa trên đón sáng (kim loại sáng bạc), nửa dưới tối hơn
      const rimGrad = ctx.createLinearGradient(c, c - c * 0.5, c, c + c * 0.5);
      rimGrad.addColorStop(0, 'rgba(238, 234, 225, 0.96)');
      rimGrad.addColorStop(0.5, 'rgba(180, 175, 168, 0.92)');
      rimGrad.addColorStop(1, 'rgba(105, 100, 92, 0.88)');
      ctx.fillStyle = rimGrad;
      ctx.fill();

      // Viền bóng đổ mép ngoài của gờ thép
      ctx.strokeStyle = 'rgba(50, 46, 42, 0.85)';
      ctx.lineWidth = 1.8;
      ctx.stroke();

      // Lòng chảo hố va đập lõm sâu (Concave Dent Cavity)
      ctx.beginPath();
      ctx.arc(c, c, c * 0.32, 0, Math.PI * 2);
      // Đổ bóng khoét lõm 3D: nửa trên là bóng tối sâu hoắm trong lòng hố, nửa dưới sáng nhẹ do phản xạ đáy hố
      const cavityGrad = ctx.createLinearGradient(c, c - c * 0.32, c, c + c * 0.32);
      cavityGrad.addColorStop(0, 'rgba(5, 4, 3, 0.98)');     // Bóng tối sâu trên vách lõm
      cavityGrad.addColorStop(0.65, 'rgba(16, 14, 12, 0.95)'); // Đáy hố sẫm màu
      cavityGrad.addColorStop(1, 'rgba(52, 48, 44, 0.9)');    // Mép đáy đón sáng hắt nhẹ
      ctx.fillStyle = cavityGrad;
      ctx.fill();

      // Tâm điểm va đập cực hạn (lõi nén nứt vỡ)
      ctx.fillStyle = 'rgba(2, 2, 2, 1.0)';
      ctx.beginPath();
      ctx.arc(c, c, c * 0.14, 0, Math.PI * 2);
      ctx.fill();

      // Các tia nứt biến dạng kim loại vi mô từ miệng hố tỏa ra
      ctx.strokeStyle = 'rgba(20, 18, 16, 0.85)';
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 6; i++) {
        const a = rnd(i * 5 + 7) * Math.PI * 2;
        const r1 = c * 0.28, r2 = c * (0.46 + rnd(i + 12) * 0.1);
        ctx.beginPath();
        ctx.moveTo(c + Math.cos(a) * r1, c + Math.sin(a) * r1);
        ctx.lineTo(c + Math.cos(a) * r2, c + Math.sin(a) * r2);
        ctx.stroke();
      }
    } else if (kind === 'metalHole') {
      // Đạn súng máy / 30mm khoét sâu vào thép: lõi đen sâu + vành gờ thép bị xé rách sáng chói + muội khói cháy sém
      const gSmoke = ctx.createRadialGradient(c, c, c * 0.18, c, c, c * 0.95);
      gSmoke.addColorStop(0, 'rgba(20, 18, 16, 0.85)');
      gSmoke.addColorStop(0.45, 'rgba(45, 42, 38, 0.45)');
      gSmoke.addColorStop(1, 'rgba(30, 28, 25, 0)');
      ctx.fillStyle = gSmoke;
      ctx.fillRect(0, 0, size, size);

      // Vành gờ thép bị xé rách, tróc sơn màu bạc sáng chói
      ctx.fillStyle = 'rgba(235, 230, 222, 0.95)';
      ctx.beginPath();
      const spallSteps = 16;
      for (let i = 0; i <= spallSteps; i++) {
        const a = (i / spallSteps) * Math.PI * 2;
        const r = c * (0.35 + rnd(i * 3 + 15) * 0.16 + (i % 2 === 0 ? 0.05 : -0.04));
        const px = c + Math.cos(a) * r, py = c + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();

      // Viền bóng đổ kim loại mép trong
      ctx.strokeStyle = 'rgba(75, 70, 65, 0.9)';
      ctx.lineWidth = 2.0;
      ctx.stroke();

      // Lõi hố đạn nổ khoét sâu tối sẫm (lỗ thủng đạn găm)
      ctx.fillStyle = 'rgba(8, 7, 6, 1.0)';
      ctx.beginPath();
      ctx.arc(c, c, c * 0.22, 0, Math.PI * 2);
      ctx.fill();

      // Điểm tâm kim loại nóng chảy
      ctx.fillStyle = 'rgba(255, 140, 50, 0.6)';
      ctx.beginPath();
      ctx.arc(c, c, c * 0.08, 0, Math.PI * 2);
      ctx.fill();
    } else if (kind === 'bulletDent') {
      // Đạn nhỏ đập vào giáp dày: không thủng, chỉ lõm nông + tróc sơn lộ thép sáng + muội đạn quanh
      const g = ctx.createRadialGradient(c, c, c * 0.1, c, c, c * 0.95);
      g.addColorStop(0, 'rgba(30,27,24,0.7)');
      g.addColorStop(0.45, 'rgba(38,34,30,0.32)');
      g.addColorStop(1, 'rgba(40,36,32,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
      // Sơn tróc lộ thép xám xỉn (không sáng trắng), mép tróc nham nhở không tròn đều
      ctx.fillStyle = 'rgba(112,108,100,0.75)';
      ctx.beginPath();
      for (let i = 0; i <= 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const r = c * (0.16 + rnd(i * 5 + 3) * 0.13);
        const px = c + Math.cos(a) * r, py = c + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      // Lòng lõm: bóng tối một phía, sáng một phía (cảm giác lõm vào)
      const gd = ctx.createLinearGradient(c - c * 0.2, c - c * 0.2, c + c * 0.2, c + c * 0.2);
      gd.addColorStop(0, 'rgba(34,32,30,0.95)');
      gd.addColorStop(1, 'rgba(96,92,86,0.95)');
      ctx.fillStyle = gd;
      ctx.beginPath();
      ctx.arc(c, c, c * 0.15, 0, Math.PI * 2);
      ctx.fill();
      // Vụn chì / đồng bám lại
      ctx.fillStyle = 'rgba(150,110,70,0.6)';
      ctx.beginPath();
      ctx.arc(c + 2, c + 1, c * 0.05, 0, Math.PI * 2);
      ctx.fill();
    } else if (kind === 'glassCrack') {
      // Kính chống đạn trúng đạn: lõm trắng ở tâm + vết nứt hình mạng nhện tỏa ra + vòng nứt đồng tâm
      ctx.lineCap = 'round';
      ctx.fillStyle = 'rgba(235,240,240,0.9)';
      ctx.beginPath();
      ctx.arc(c, c, c * 0.09, 0, Math.PI * 2);
      ctx.fill();
      const spokes = 11;
      const ends = [];
      for (let i = 0; i < spokes; i++) {
        const a = (i / spokes) * Math.PI * 2 + rnd(i) * 0.4;
        const len = c * (0.55 + rnd(i + 20) * 0.42);
        ctx.strokeStyle = `rgba(230,236,238,${0.55 + rnd(i + 40) * 0.35})`;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(c, c);
        let x = c, y = c;
        const steps = 4;
        for (let k = 1; k <= steps; k++) {
          const aa = a + (rnd(i * 7 + k) - 0.5) * 0.35;
          x = c + Math.cos(aa) * len * (k / steps);
          y = c + Math.sin(aa) * len * (k / steps);
          ctx.lineTo(x, y);
        }
        ctx.stroke();
        ends.push(a);
      }
      for (const rr of [0.22, 0.38, 0.56]) {
        ctx.strokeStyle = 'rgba(225,232,235,0.45)';
        ctx.lineWidth = 1;
        for (let i = 0; i < spokes; i++) {
          if (rnd(i + rr * 100) < 0.35) continue;
          const a0 = ends[i], a1 = ends[(i + 1) % spokes] + (i === spokes - 1 ? Math.PI * 2 : 0);
          const r = c * rr * (0.9 + rnd(i + 70) * 0.2);
          ctx.beginPath();
          ctx.moveTo(c + Math.cos(a0) * r, c + Math.sin(a0) * r);
          ctx.lineTo(c + Math.cos(a1) * r * 1.05, c + Math.sin(a1) * r * 1.05);
          ctx.stroke();
        }
      }
    } else if (kind === 'ricochet') {
      // Vệt cày sáng của đạn nảy (kéo dài theo trục Y)
      const g = ctx.createLinearGradient(0, 0, 0, size);
      g.addColorStop(0, 'rgba(200,198,190,0)');
      g.addColorStop(0.25, 'rgba(230,228,220,0.95)');
      g.addColorStop(1, 'rgba(120,118,112,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(c - 7, 4);
      ctx.lineTo(c + 7, 4);
      ctx.lineTo(c + 3, size - 4);
      ctx.lineTo(c - 3, size - 4);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(15,13,11,0.75)';
      ctx.fillRect(c - 1.5, 8, 3, size * 0.75);
    }
    MARK_TEX[kind] = new THREE.CanvasTexture(canvas);
    return MARK_TEX[kind];
  }

  // Bản đồ pháp tuyến cho vết đạn trên giáp: lõm lòng chảo có gờ đẩy lên (đạn nổ), lỗ thủng xé cánh hoa (xuyên),
  // vết lõm nông (đạn nhỏ trên giáp dày) -> nhìn rõ chiều sâu dưới ánh nắng thay vì hình vẽ phẳng
  const MARK_NRM = {};
  function getMarkNormal(kind) {
    if (MARK_NRM[kind] || typeof document === 'undefined') return MARK_NRM[kind];
    const N = 128, c = N / 2;
    const H = new Float32Array(N * N);
    const petals = 5 + Math.floor(Math.random() * 3);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const dx = (x - c) / c, dy = (y - c) / c, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
      let h = 0;
      if (kind === 'armorCrater') {
        // lòng chảo sâu + gờ kim loại bị đẩy lồi quanh miệng
        h = r < 0.62 ? -(1 - Math.pow(r / 0.62, 2)) * 1.0 : (r < 0.85 ? Math.sin((r - 0.62) / 0.23 * Math.PI) * 0.22 : 0);
        h += Math.sin(a * 7 + r * 9) * 0.04 * (r < 0.8 ? 1 : 0);
      } else if (kind === 'penetration' || kind === 'metalHole') {
        // lỗ xuyên: lòng hố sâu thẳng + các cánh thép xé toạc lật ra ngoài
        const hole = kind === 'penetration' ? 0.16 : 0.22;
        if (r < hole) h = -1.3;
        else if (r < 0.62) {
          const pet = Math.pow(Math.abs(Math.cos(a * petals * 0.5)), 3);
          h = (0.35 + 0.35 * pet) * Math.sin((r - hole) / (0.62 - hole) * Math.PI) - 0.25 * (1 - (r - hole) / (0.62 - hole));
        }
      } else if (kind === 'bulletDent') {
        h = r < 0.42 ? -(1 - Math.pow(r / 0.42, 2)) * 0.6 : (r < 0.55 ? Math.sin((r - 0.42) / 0.13 * Math.PI) * 0.12 : 0);
      }
      H[y * N + x] = h;
    }
    const cv = document.createElement('canvas');
    cv.width = cv.height = N;
    const g = cv.getContext('2d');
    const img = g.createImageData(N, N);
    const k = 3.2;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const hx = H[y * N + Math.min(N - 1, x + 1)] - H[y * N + Math.max(0, x - 1)];
      const hy = H[Math.min(N - 1, y + 1) * N + x] - H[Math.max(0, y - 1) * N + x];
      let nx = -hx * k, ny = hy * k, nz = 1;
      const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      const i = (y * N + x) * 4;
      img.data[i] = (nx * 0.5 + 0.5) * 255; img.data[i + 1] = (ny * 0.5 + 0.5) * 255; img.data[i + 2] = (nz * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    MARK_NRM[kind] = new THREE.CanvasTexture(cv);
    return MARK_NRM[kind];
  }

  // Điểm khoang động cơ (hệ tọa độ group của xe) để bốc khói / cháy khi hư hại
  const ENGINE_POINT = {
    ALL_ROUNDER: [0, 13.6, 21], GATLING: [6, 15.2, -9], ARTILLERY: [0, 18, -15], SCOUT: [0, 12.2, -14]
  };
  const TURRET_RING = {
    ALL_ROUNDER: [0, 13, -1.5], GATLING: [0, 14.5, 5], ARTILLERY: [0, 13, 17], SCOUT: [0, 16.5, 3.4]
  };
  // Xe cabin kín: khoang cháy từ bên trong -> lửa phụt ra qua các ô kính vỡ / nắp nóc, liếm ngược lên dọc thành xe
  // (không phải cụm lửa lơ lửng trên nóc). p = tâm ô mở, n = pháp tuyến ra ngoài (hệ chassisGroup: bám theo thân lún / nghiêng).
  // Mức cháy: eng = khoang máy, cab = cabin lái tách rời tháp (lửa lan từ máy / tháp sang), mặc định = khoang kíp (ring)
  const CAB_OPENINGS = {
    // Xe pháo 6x6: cabin lái bọc giáp phía trước (kính chắn gió 2 tấm, kính cửa lớn + nhỏ hai bên, cửa nóc)
    ARTILLERY: [
      { p: [-4.85, 18.65, -35.55], n: [0, 0.4, -0.92], cab: true }, { p: [4.85, 18.65, -35.55], n: [0, 0.4, -0.92], cab: true },
      { p: [-10.7, 18.0, -28.6], n: [-1, 0.05, 0], cab: true }, { p: [10.7, 18.0, -28.6], n: [1, 0.05, 0], cab: true },
      { p: [-10.7, 18.6, -22.4], n: [-1, 0.05, 0], cab: true }, { p: [10.7, 18.6, -22.4], n: [1, 0.05, 0], cab: true },
      { p: [-4.6, 22.8, -27.0], n: [0, 1, 0], roof: true, cab: true }
    ],
    SCOUT: [
      { p: [-3.5, 13.4, -7.85], n: [0, 0.4, -0.92] }, { p: [3.5, 13.4, -7.85], n: [0, 0.4, -0.92] },
      { p: [-7.9, 13.6, -3.7], n: [-1, 0.05, 0] }, { p: [7.9, 13.6, -3.7], n: [1, 0.05, 0] },
      { p: [-7.9, 13.6, 3.7], n: [-1, 0.05, 0] }, { p: [7.9, 13.6, 3.7], n: [1, 0.05, 0] },
      { p: [0, 15.5, 2.6], n: [0, 1, 0], roof: true },
      // khoang máy phía trước: lửa lọt qua khe nắp capo & lưới tản nhiệt (mức cháy theo khoang máy)
      { p: [-2.8, 11.1, -14.5], n: [0, 1, 0], eng: true }, { p: [2.8, 11.3, -12.5], n: [0, 1, 0], eng: true },
      { p: [0, 8.8, -18.9], n: [0, 0.25, -0.97], eng: true }
    ]
  };
  const CAB_CENTER = { SCOUT: [0, 13.2, 0] };
  const CAB_ONLY = { SCOUT: true };

  const DamageMixin = {
    /**
     * Gắn vết đạn lên bề mặt bị bắn: point/normal theo hệ thế giới, object = vật bị tia chạm.
     * kind: penetration | scorch | metalHole | ricochet | concreteHole
     */
    fitMarkSize(point, normal, object, size) {
      const n = normal.clone().normalize();
      const t1 = new THREE.Vector3().crossVectors(n, Math.abs(n.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize();
      const t2 = new THREE.Vector3().crossVectors(n, t1);
      const rc = this._fitRay || (this._fitRay = new THREE.Raycaster());
      const o = new THREE.Vector3(), dir = n.clone().negate();
      for (const sc of [1, 0.6, 0.36, 0.22]) {
        const half = size * sc * 0.42;
        let ok = true;
        for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          o.copy(point).addScaledVector(t1, a * half).addScaledVector(t2, b * half).addScaledVector(n, half + 0.4);
          rc.set(o, dir); rc.far = half * 2 + 1;
          const h = rc.intersectObject(object, false)[0];
          if (!h || Math.abs(h.point.clone().sub(point).dot(n)) > half * 0.22 + 0.06) { ok = false; break; }
        }
        if (ok) return size * sc;
      }
      return 0;
    },

    addSurfaceMark(point, normal, object, kind, size, opts = {}) {
      if (!object) return null;
      const parent = object.isInstancedMesh ? (object.parent || object) : object;
      parent.updateMatrixWorld(true);
      // Vết phẳng phải nằm khít bề mặt: trên mặt cong / chi tiết nhỏ (nòng pháo, ống, mép giáp) thu nhỏ lại, không lơ lửng
      if (kind !== 'turretRing' && !opts.noFit && object.isMesh && normal) {
        size = this.fitMarkSize(point, normal, object, size);
        if (size <= 0) return null;
      }
      if (!this._markGeo) this._markGeo = new THREE.PlaneGeometry(1, 1);
      let mat;
      if (PIT_KINDS[kind]) {
        mat = getPitMaterial(kind, Math.floor(Math.random() * 3));
      } else if (kind === 'burnGlow') {
        mat = new THREE.MeshStandardMaterial({
          map: getMarkTexture('scorch'), emissive: 0xff4a0a, emissiveMap: getMarkTexture('penetrationGlow'), emissiveIntensity: 2.4,
          roughness: 0.8, metalness: 0.4, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8
        });
      } else if (kind === 'penetration' || kind === 'turretRing') {
        const ring = kind === 'turretRing';
        mat = new THREE.MeshStandardMaterial({
          map: getMarkTexture(ring ? 'turretRing' : 'penetration'), emissive: 0xff5a10,
          normalMap: ring ? null : getMarkNormal('penetration'), normalScale: new THREE.Vector2(1.6, 1.6),
          emissiveMap: getMarkTexture(ring ? 'turretRingGlow' : 'penetrationGlow'),
          emissiveIntensity: 2.2, roughness: 0.9, metalness: 0.2, transparent: true, depthWrite: false,
          polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8
        });
      } else if (kind === 'glassCrack') {
        mat = new THREE.MeshStandardMaterial({
          map: getMarkTexture(kind), roughness: 0.2, metalness: 0.3, transparent: true, depthWrite: false,
          polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8
        });
      } else if (kind === 'armorCrater' || kind === 'metalHole' || kind === 'bulletDent') {
        mat = new THREE.MeshStandardMaterial({
          map: getMarkTexture(kind), roughness: kind === 'bulletDent' ? 0.7 : 0.45, metalness: kind === 'bulletDent' ? 0.35 : 0.7, transparent: true, depthWrite: false,
          normalMap: getMarkNormal(kind), normalScale: new THREE.Vector2(kind === 'bulletDent' ? 1.2 : 1.8, kind === 'bulletDent' ? 1.2 : 1.8),
          polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8
        });
      } else {
        const tex = kind === 'concreteHole' ? getHoleTexture('wall') : kind === 'concreteBlast' ? getWallTexture(Math.floor(Math.random() * 4)) : getMarkTexture(kind);
        mat = new THREE.MeshStandardMaterial({
          map: tex, roughness: kind.startsWith('concrete') ? 0.95 : 0.85, metalness: kind.startsWith('concrete') ? 0 : 0.15, transparent: true, depthWrite: false,
          polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8
        });
      }
      // vết đạn nhỏ (PIT_KINDS): gộp vào InstancedMesh theo (bộ phận mang vết, vật liệu) -> hàng nghìn vết vẫn ít lần vẽ
      const batched = !!PIT_KINDS[kind];
      const m = batched ? (this._markTmp || (this._markTmp = new THREE.Object3D())) : new THREE.Mesh(this._markGeo, mat);
      m.userData.isFxDecal = true;
      m.renderOrder = 4;
      const n = new THREE.Vector3(normal.x, normal.y, normal.z).normalize();
      const qW = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
      if (opts.tangent) {
        // Xoay vệt theo hướng đạn sượt trên bề mặt
        const yAxis = new THREE.Vector3(0, 1, 0).applyQuaternion(qW);
        const t = opts.tangent.clone().addScaledVector(n, -opts.tangent.dot(n)).normalize();
        const ang = Math.atan2(new THREE.Vector3().crossVectors(yAxis, t).dot(n), yAxis.dot(t));
        qW.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), ang));
      } else {
        qW.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.random() * Math.PI * 2));
      }
      const pq = new THREE.Quaternion();
      parent.getWorldQuaternion(pq);
      const ws = new THREE.Vector3();
      parent.getWorldScale(ws);
      m.quaternion.copy(pq.invert().multiply(qW));
      // Tăng khoảng cách offset lên 0.15 đơn vị theo pháp tuyến để triệt tiêu hoàn toàn z-fighting
      const local = parent.worldToLocal(new THREE.Vector3(point.x, point.y, point.z).addScaledVector(n, 0.15));
      m.position.copy(local);
      const sx = opts.stretch && !opts.keepWidth ? size * 0.35 : size, sy = opts.stretch ? size * opts.stretch : size;
      m.scale.set(sx / (ws.x || 1), sy / (ws.y || 1), 1);
      if (batched) return this.addBatchedMark(parent, mat, m, opts.unit || null);
      parent.add(m);
      const rec = { mesh: m, mat, unit: opts.unit || null, t: 0, glow: (kind === 'penetration' || kind === 'turretRing') ? 2.2 : 0 };
      if (kind === 'turretRing') rec.decay = 6;   // thép quanh vòng tháp nguội dần (đỏ rực vài giây rồi sẫm lại)
      this.surfaceMarks.push(rec);
      // vết lớn (mỗi vết 1 lưới + vật liệu riêng: thủng pháo, hố giáp, cháy sém...) giữ tối đa ~450, vết đạn nhỏ gộp tối đa ~4000
      this._meshMarks = (this._meshMarks || 0) + 1;
      if (this._meshMarks > 450) { const oi = this.surfaceMarks.findIndex(r => !r.batch); if (oi >= 0) this.removeSurfaceMark(oi); }
      while (this.surfaceMarks.length > 4500) this.removeSurfaceMark(0);
      return rec;
    },

    addBatchedMark(parent, mat, tf, unit) {
      const bs = parent.userData.pitBatches || (parent.userData.pitBatches = {});
      let B = bs[mat.uuid];
      if (!B) {
        const cap = 64, Z = new THREE.Matrix4().makeScale(0, 0, 0);
        const im = new THREE.InstancedMesh(this._markGeo, mat, cap);
        for (let i = 0; i < cap; i++) im.setMatrixAt(i, Z);
        im.renderOrder = 4; im.frustumCulled = false; im.castShadow = false; im.userData.isFxDecal = true;
        parent.add(im);
        B = bs[mat.uuid] = { im, cap, free: [], next: 0, owner: new Array(cap).fill(null), order: [] };
      }
      let slot;
      if (B.free.length) slot = B.free.pop();
      else if (B.next < B.cap) slot = B.next++;
      else {
        // bộ phận này đã đầy vết cùng loại: thay vết cũ nhất trên chính bộ phận đó
        const oi = this.surfaceMarks.indexOf(B.owner[B.order[0]]);
        if (oi >= 0) this.removeSurfaceMark(oi); else { B.free.push(B.order.shift()); }
        slot = B.free.pop();
      }
      tf.updateMatrix();
      B.im.setMatrixAt(slot, tf.matrix);
      B.im.instanceMatrix.needsUpdate = true;
      const rec = { batch: B, slot, mat, unit, t: 0, glow: 0 };
      B.owner[slot] = rec; B.order.push(slot);
      this.surfaceMarks.push(rec);
      while (this.surfaceMarks.length > 4500) this.removeSurfaceMark(0);
      return rec;
    },

    // vị trí thế giới của một vết (lưới riêng hoặc 1 ô trong InstancedMesh gộp)
    markWorldPos(r, out) {
      if (!r.batch) return r.mesh.getWorldPosition(out);
      const t = this._mwp || (this._mwp = new THREE.Matrix4());
      r.batch.im.getMatrixAt(r.slot, t);
      r.batch.im.updateMatrixWorld(true);
      return out.setFromMatrixPosition(t).applyMatrix4(r.batch.im.matrixWorld);
    },

    removeSurfaceMark(i) {
      const r = this.surfaceMarks[i];
      if (r.batch) {
        const B = r.batch;
        B.im.setMatrixAt(r.slot, this._zeroM || (this._zeroM = new THREE.Matrix4().makeScale(0, 0, 0)));
        B.im.instanceMatrix.needsUpdate = true;
        B.owner[r.slot] = null; B.free.push(r.slot);
        const oi = B.order.indexOf(r.slot); if (oi >= 0) B.order.splice(oi, 1);
      } else {
        if (r.mesh.parent) r.mesh.parent.remove(r.mesh);
        if (!(r.mat.userData && r.mat.userData.shared)) r.mat.dispose();
        this._meshMarks = Math.max(0, (this._meshMarks || 0) - 1);
      }
      this.surfaceMarks.splice(i, 1);
    },

    updateSurfaceMarks(dt) {
      for (const r of this.surfaceMarks) {
        if (r.glow > 0) {
          r.t += dt;
          // Viền thủng nguội dần: đỏ rực -> đỏ sẫm -> tắt trong ~7 giây
          r.mat.emissiveIntensity = Math.max(0, r.glow * Math.exp(-r.t / (r.decay || 2.2)));
          if (r.mat.emissiveIntensity < 0.01) { r.mat.emissiveIntensity = 0; r.glow = 0; }
        }
      }
    },

    /**
     * Va chạm có hướng: quyết định nảy / thủng theo góc chạm, đặt vết đạn đúng chỗ.
     * hit = { point, normal, object, unit, hitType }, dir = vận tốc đạn (THREE.Vector3)
     */
    impactSurface(ammoType, hit, dir, opts = {}) {
      const prof = PROFILES[ammoType] || PROFILES.NORMAL;
      const d = dir.clone().normalize();
      const n = new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z).normalize();
      if (n.dot(d) > 0) n.negate();
      const cosI = -d.dot(n); // 1 = vuông góc, 0 = sượt
      const p = hit.point;
      const isVehicle = hit.hitType === 'DIRECT_HIT';
      const isWall = hit.hitType === 'WALL' || hit.hitType === 'BUILDING' || hit.hitType === 'BOULDER';
      const kinetic = prof.kind === 'kinetic' || prof.kind === 'bullet' || prof.kind === 'incendiary';
      // Chất liệu & cấp giáp tại điểm chạm: giáp dày làm đạn nhỏ nảy / lõm; giáp nhẹ & xe tải bị thủng
      const hm = hit.object ? (Array.isArray(hit.object.material) ? hit.object.material[0] : hit.object.material) : null;
      const surface = (hm && hm.userData && hm.userData.surface) || 'metal';
      const armorCls = isVehicle && hit.unit ? ({ ALL_ROUNDER: 'heavy', GATLING: 'medium', ARTILLERY: 'soft', SCOUT: 'light' }[hit.unit.tankType] || 'medium') : null;
      let ricochetThreshold = isVehicle ? 0.16 : (prof.kind === 'kinetic' ? 0.26 : 0.38);
      if (isVehicle && prof.micro && surface === 'metal') {
        // Đạn súng máy / 30mm gặp giáp nghiêng của xe tăng: góc chạm dưới ~55-65° là bật ra
        ricochetThreshold = armorCls === 'heavy' ? (ammoType === 'SCOUT_BULLET' ? 0.62 : 0.5) : armorCls === 'medium' ? 0.4 : 0.2;
      }
      const ricochet = kinetic && (isVehicle || isWall) && surface !== 'glass' && surface !== 'rubber' && surface !== 'cloth' && cosI < ricochetThreshold;

      if (ricochet) {
        // Đạn nảy: vệt cày sáng dọc hướng sượt + tia lửa văng theo hướng phản xạ
        const r = d.clone().addScaledVector(n, -2 * d.dot(n));
        this.fire.add({ x: p.x, y: p.y, z: p.z, vx: 0, vy: 0, vz: 0, size: prof.micro ? 6 : 14, grow: 20, life: 0.05, alpha: 1, fadeIn: 0.003, c0: [1, 0.95, 0.85], cell: 3, floor: false });
        const count = prof.micro ? 8 : 26;
        if (prof.kind === 'kinetic') this.spallCone(p, r, 34, { spread: 0.3, speed: 1.1 });
        for (let i = 0; i < count; i++) {
          const sp = rand(80, 260);
          this.fire.add({
            x: p.x, y: p.y, z: p.z, vx: r.x * sp + rand(-30, 30), vy: r.y * sp + rand(-10, 40), vz: r.z * sp + rand(-30, 30),
            size: rand(1, 2.2), grow: -1, drag: 0.8, grav: GRAV, life: rand(0.25, 0.6), alpha: 1, fadeIn: 0.005,
            c0: [1, 0.9, 0.6], c1: [1, 0.5, 0.15], cell: 3
          });
        }
        // Vết đạn sượt: đạn nhỏ để lại vệt cào lõm ngắn sáng thép; đạn lớn cày rãnh dài hơn
        if (hit.object && isWall) {
          // Bê tông không có vệt cày kim loại: đạn sượt chỉ bóc một mảng sứt nông, hơi thuôn theo hướng đạn
          this.addSurfaceMark(p, n, hit.object, prof.micro ? 'concretePit' : 'concreteHole', (prof.micro ? (ammoType === 'SCOUT_BULLET' ? 1.8 : 2.4) : 3.6), { tangent: d, stretch: 1.25, keepWidth: true });
        } else if (hit.object) {
          if (prof.micro) this.addSurfaceMark(p, n, hit.object, 'steelDent', ammoType === 'SCOUT_BULLET' ? 1.3 : 1.9, { tangent: d, stretch: 1.9, unit: hit.unit });
          else this.addSurfaceMark(p, n, hit.object, 'ricochet', 4.2, { tangent: d, stretch: 2.2, unit: hit.unit });
        }
        return { ricochet: true };
      }

      // Đạn nhỏ trúng xe / tường: hiệu ứng riêng theo vật liệu (tia lửa thép, bụi bê tông...) thay vì vụ nổ pháo thu nhỏ
      const lightArmor = !(armorCls === 'heavy' || (armorCls === 'medium' && ammoType === 'SCOUT_BULLET'));
      if (prof.micro && (isVehicle || isWall)) {
        const sk = isVehicle ? (surface === 'glass' || surface === 'rubber' || surface === 'cloth' ? surface : 'steel')
          : hit.hitType === 'BUILDING' ? 'plaster' : hit.hitType === 'BOULDER' ? 'rock' : 'concrete';
        this.spawnBulletSurfaceImpact(p, n, d, ammoType, sk, { pen: isVehicle && lightArmor });
      } else {
        // Nổ / xuyên tại đúng điểm chạm (hiệu ứng bật ra theo pháp tuyến bề mặt)
        this.spawn(p.x, p.y, p.z, ammoType, hit.hitType, Object.assign({}, opts, { dir: { x: d.x, y: d.y, z: d.z }, normal: n, noWallMark: !!(isWall && hit.object) }));
      }
      if (hit.object && isVehicle) {
        if (prof.kind === 'kinetic' || prof.kind === 'heat') {
          this.addSurfaceMark(p, n, hit.object, 'penetration', prof.kind === 'kinetic' ? 3.0 : 3.8, { unit: hit.unit });
          this.addSurfaceMark(p, n, hit.object, 'armorCrater', prof.kind === 'kinetic' ? 3.8 : 4.6, { unit: hit.unit });
        } else if (prof.kind === 'bomblet') {
          // Bom con DPICM là đầu nổ lõm nhỏ (lót đồng ~40 mm) + vỏ thép phá mảnh: luồng phụt khoan một lỗ nhỏ qua nóc /
          // sàn sau động cơ (giáp mỏng), quanh lỗ cháy sém, vỏ bom con tung mảnh găm lấm tấm. Không ép lõm cả mảng giáp
          // như đạn nổ phá cỡ lớn (trước đây dán hố lõm 2,5 đơn vị)
          this.addSurfaceMark(p, n, hit.object, 'penetration', 1.6, { unit: hit.unit });
          this.addSurfaceMark(p, n, hit.object, 'scorch', 3.2, { unit: hit.unit });
          if (hit.unit) this.addFragmentPocks({ point: p, normal: n }, hit.unit, 10, 1.6);
        } else if (prof.micro) {
          if (ammoType === 'INCENDIARY' && surface === 'metal') {
            const g = this.addSurfaceMark(p, n, hit.object, 'burnGlow', rand(2.6, 3.6), { unit: hit.unit });
            if (g) { g.glow = 2.4; g.decay = 2.8; }
            this.emitters.push({ x: p.x, z: p.z, y: p.y, t: 0, dur: rand(2.5, 4.5), acc: 0, rate: 10, size: 1.4 });
          }
          if (surface === 'glass') {
            // Kính chống đạn: nứt mạng nhện, không thủng
            this.addSurfaceMark(p, n, hit.object, 'glassCrack', ammoType === 'SCOUT_BULLET' ? 1.8 : 2.4, { unit: hit.unit });
          } else if (surface === 'rubber') {
            // Lốp / đệm cao su: vết rách nhỏ (bánh quay nên không dán decal lên mặt lốp)
          } else if (surface === 'cloth') {
            this.addSurfaceMark(p, n, hit.object, 'scorch', 1.6, { unit: hit.unit });
          } else if (!lightArmor) {
            // Giáp dày: 12.7mm vỡ vụn trên mặt thép -> hõm nhỏ tróc sơn (~3 cm, vùng tróc ~15 cm); 30mm nổ trên mặt giáp ->
            // hố cày nông + muội nổ + rỗ mảnh văng, không thủng
            if (ammoType === 'SCOUT_BULLET') this.addSurfaceMark(p, n, hit.object, 'steelDent', 1.3, { unit: hit.unit });
            else this.addSurfaceMark(p, n, hit.object, 'heiSplash', 3.4, { unit: hit.unit });
          } else {
            // Giáp nhẹ / thân xe tải: thủng lỗ (12.7mm lỗ tròn gọn; 30mm lỗ rách lởm chởm + muội + rỗ mảnh)
            if (ammoType === 'SCOUT_BULLET') this.addSurfaceMark(p, n, hit.object, 'steelHole', 1.4, { unit: hit.unit });
            else this.addSurfaceMark(p, n, hit.object, 'heiHole', armorCls === 'medium' ? 2.8 : 3.2, { unit: hit.unit });
          }
        } else {
          // Đạn pháo nổ thường / HE / Đạn chùm: Hố lõm giáp thép biến dạng 3D chân thực, vừa vặn khung giáp xe (3.8 - 4.8 đơn vị)
          const craterSz = (prof.size || 1) * (opts.heavy ? 4.8 : 3.8);
          this.addSurfaceMark(p, n, hit.object, 'armorCrater', craterSz, { unit: hit.unit });
          if (hit.unit) this.addFragmentPocks({ point: p, normal: n }, hit.unit, 6, 2.0 * (prof.size || 1));
        }
        if (hit.unit) this.trackVehicle(hit.unit);
      } else if (hit.object && isWall) {
        if (prof.micro) {
          const sm = ammoType === 'SCOUT_BULLET';
          // khối tường lặp (instanced) không dán vết con được -> lớp vết đạn tường trong không gian thế giới
          const ok = !hit.object.isInstancedMesh && this.addSurfaceMark(p, n, hit.object, sm ? 'concretePit' : 'concretePitHE', sm ? 2.4 : 3.6);
          if (!ok) (sm ? this.wallPits.s : this.wallPits.he).add(p, n, sm ? 2.3 : 3.4);
        }
        else if (prof.kind === 'kinetic') {
          this.addSurfaceMark(p, n, hit.object, 'concreteHole', 5.5);
          // Mũi tên xuyên thủng tường: lõi urani vỡ vụn bốc cháy + bê tông phụt ra phía sau tường
          const exit = p.clone().addScaledVector(d, opts.wallThick || 7);
          this.spallCone(exit, d, 46, { spread: 0.42, dust: [0.72, 0.7, 0.66] });
          this.spallCone(p, n, 12, { spread: 0.7, speed: 0.5, dust: [0.72, 0.7, 0.66] });
        } else {
          // Đạn nổ / nổ lõm trên bê tông: hố sứt + muội khói dán khít mặt khối bị chạm (tự co lại khi gần mép khối,
          // không chìa ra ngoài không khí qua chỗ tường đã vỡ)
          const s = (prof.size || 1) * (opts.heavy ? 1.5 : 1);
          this.addSurfaceMark(p, n, hit.object, 'concreteBlast', (prof.kind === 'heat' ? 4.5 : 6.5) * Math.pow(s, 0.6));
          // Đầu nổ lõm: luồng kim loại nóng chảy xuyên thủng tường, phụt sáng ra mặt sau kèm bê tông vỡ
          if (prof.kind === 'heat' && !opts.noPierce) this.heatPierce(p, d, opts.wallThick || 7, { power: ammoType === 'ANTI_TANK_MISSILE' ? 1.25 : 1 });
        }
      }
      return { ricochet: false };
    },

    // ---------------------------------------------------------------------------
    // HƯ HẠI XE: khói khoang máy -> cháy -> nổ tung, tháp pháo bị hất văng, kho đạn nổ dây chuyền, xác cháy
    // ---------------------------------------------------------------------------
    trackVehicle(u) {
      if (!u || !u.group) return;
      if (!this.vehicles.includes(u)) {
        this.vehicles.push(u);
        u.damageFxByEngine = true;
      }
    },

    vehicleLocalToWorld(u, local) {
      u.group.updateMatrixWorld(true);
      return new THREE.Vector3(local[0], local[1], local[2]).applyMatrix4(u.group.matrixWorld);
    },

    /**
     * Kiểu xe chết theo phát kết liễu (vùng trúng / loại đạn / cấu tạo xe) — ngoài đời mỗi kiểu trông & nghe khác hẳn:
     *  - 'ammo'  : trúng kho đạn. Tăng (đạn trong hốc sau tháp có tấm xả áp): lửa phụt thẳng đứng như mỏ hàn từ nóc
     *              hậu tháp vài giây, tháp KHÔNG bay ('vent'); kho đạn ở thân / pháo tự hành / xe nhẹ: kích nổ ngay ('det')
     *  - 'crew'  : xuyên khoang kíp lái: chớp lửa + mảnh phụt ra lỗ xuyên, khói tuôn từ nắp, lửa bén dần; vài giây sau
     *              lửa có thể lan tới kho đạn -> kích nổ / xả áp TRỄ (hoặc cháy rụi không nổ)
     *  - 'engine': trúng khoang máy: dầu bốc cháy "phừng" ở khoang máy, khói đen dầu, ít khi lan tới kho đạn
     *  - 'fuel'  : trúng thùng nhiên liệu: quả cầu lửa dầu
     *  - 'blast' : đạn nổ phá / lựu pháo: nóc ép lõm, dễ kích nổ đạn
     *  - 'burn'  : cháy tới chết: lửa đã ăn vào trong, kho đạn sắp nổ
     * Trả về { mode, instant: 'det'|'vent'|null, delayed: 'det'|'vent'|null, cookAt (s), tossP, point, dir }
     */
    killInfo(u) {
      const type = u.tankType || 'ALL_ROUNDER';
      const d = u.dmg || null, L = d && d.last;
      const src = u._killSource || null;
      // Máy có quyền gọi takeDamage ngay sau onDirectHit / onSplash: phát trúng cuối CHÍNH LÀ phát kết liễu.
      // Máy khác (xe chết qua đồng bộ mạng) chỉ có phát trúng hiển thị -> coi là còn mới nếu trong vài giây
      const fresh = !!(L && (src === 'DIRECT_HIT' || src === 'SHELL' || (src !== 'BURN' && src !== 'ZONE' && src !== 'WATER' && (!L.at || Date.now() - L.at < 8000))));
      let mode = 'crew';
      if (src === 'BURN' || (!fresh && d && d.fires && d.fires.length)) mode = 'burn';
      else if (fresh && L.splash) mode = (L.cls === 'blast' || L.cls === 'heat') ? 'blast' : 'crew';
      else if (fresh && (L.zone === 'ammo' || L.tag === 'ammoBoxes')) mode = 'ammo';
      else if (fresh && L.tag === 'fuelTank') mode = 'fuel';
      else if (fresh && L.zone === 'engine') mode = 'engine';
      else if (fresh && L.cls === 'blast' && L.heavy) mode = 'blast';
      // Xe tăng: phát xuyên vào nửa sau tháp = hốc chứa đạn; pháo tự hành: buồng pháo chứa đạn + liều phóng
      let bustle = false;
      if (fresh && !L.splash && L.onTurret && L.pen && u.turretGroup && L.point && type === 'ALL_ROUNDER') {
        u.turretGroup.updateMatrixWorld(true);
        if (u.turretGroup.worldToLocal(L.point.clone()).z > 6) { mode = 'ammo'; bustle = true; }
      }
      if (fresh && mode === 'ammo' && L.onTurret && type === 'ALL_ROUNDER') bustle = true;
      if (fresh && !L.splash && L.onTurret && L.pen && type === 'ARTILLERY' && mode === 'crew') mode = 'ammo';
      const K = { mode, type, instant: null, delayed: null, cookAt: Infinity, tossP: 0, point: fresh ? L.point : null, dir: fresh && L.dir ? L.dir : null };
      const R = Math.random();
      // Xác xe chỉ còn ~10 s trước khi xe hồi sinh (game.respawnWaitPenalty): mọi diễn biến trễ phải xảy ra trong ~8,5 s
      const later = (kind, a, b, tossP = 0) => { K.delayed = kind; K.cookAt = rand(a, b); K.tossP = tossP; };
      if (type === 'ALL_ROUNDER') {
        if (mode === 'ammo') { if (bustle) K.instant = 'vent'; else { K.instant = 'det'; K.tossP = 0.85; } }
        else if (mode === 'crew' || mode === 'fuel') { if (R < 0.3) later('det', 2.5, 7, 0.7); else if (R < 0.55) later('vent', 4, 8.5); }
        else if (mode === 'engine') { if (R < 0.15) later('vent', 6, 9); }
        else if (mode === 'blast') { if (R < 0.35) later('det', 0.4, 2.5, 0.6); else if (R < 0.6) later('vent', 2, 6); }
        else if (mode === 'burn') { if (R < 0.5) later('vent', 1, 4); else if (R < 0.7) later('det', 1, 4, 0.6); }
      } else if (type === 'ARTILLERY') {
        // Pháo tự hành bánh lốp: đạn 155 + liều phóng trong buồng pháo sau xe, cabin & máy ở đầu xe
        if (mode === 'ammo') { K.instant = 'det'; K.tossP = 0.35; }
        else if (mode === 'blast') { if (R < 0.55) { K.instant = 'det'; K.tossP = 0.35; } else if (R < 0.85) later('det', 2, 6, 0.4); }
        else if (mode === 'burn') later('det', 0.5, 3, 0.5);
        else if (mode === 'fuel') { if (R < 0.45) later('det', 4, 8, 0.4); }
        else if (R < (mode === 'engine' ? 0.3 : 0.35)) later('det', 4, 8.5, 0.5);
      } else if (type === 'GATLING') {
        // Đạn 30mm trong tháp & thân: kích nổ thành tràng lụp bụp, quả cầu lửa vừa
        if (mode === 'ammo') { K.instant = 'det'; K.tossP = 0.3; }
        else if (mode === 'blast') { if (R < 0.5) { K.instant = 'det'; K.tossP = 0.3; } else later('det', 2, 5, 0.2); }
        else if (mode === 'burn') later('det', 0.5, 3, 0.2);
        else if (mode === 'engine') { if (R < 0.3) later('det', 5, 8.5, 0.15); }
        else if (fresh && L.onTurret) { if (R < 0.55) later('det', 1, 4, 0.15); }
        else if (R < 0.45) later('det', 3, 8, 0.15);
      } else {
        // Xe trinh sát: không có kho đạn pháo — đạn 12.7 trong thùng + bình nhiên liệu
        if (mode === 'ammo' || mode === 'blast') { K.instant = 'det'; K.tossP = 0.3; }
        else if (mode === 'burn' || mode === 'fuel') later('det', 0.5, 4, 0.2);
        else if (mode === 'engine') { if (R < 0.25) later('det', 6, 8.5, 0.2); }
        else if (R < 0.5) later('det', 2, 7, 0.2);
      }
      // Lớp lót chống mảnh (trang bị): mảnh vỡ ít bắn vào cơ số đạn -> kho đạn khó kích nổ hơn
      // (nổ ngay -> thường chỉ phụt lửa / cháy âm ỉ; nổ muộn -> nhiều khi không nổ)
      if (typeof Equipment !== 'undefined' && Equipment.has && Equipment.has(u, 'spall')) {
        if (K.instant === 'det' && mode !== 'ammo' && Math.random() < 0.45) { K.instant = null; later('vent', 2, 6); }
        else if (K.delayed === 'det' && Math.random() < 0.45) {
          if (Math.random() < 0.5) { K.delayed = 'vent'; } else { K.delayed = null; K.cookAt = Infinity; K.tossP = 0; }
        }
      }
      return K;
    },

    // Điểm kho đạn (hệ thế giới): trong tháp nếu tháp còn trên xe, không thì khoang hở vòng tháp
    ammoPoint(u) {
      const type = u.tankType || 'ALL_ROUNDER';
      if (u.turretGroup && !(u.fxWreck && u.fxWreck.turret) && u.turretGroup.visible) {
        const off = { ARTILLERY: [0, 6, 9], ALL_ROUNDER: [0, 4, 7], GATLING: [0, 4, 3], SCOUT: [0, 1.5, 0] }[type] || [0, 4, 4];
        u.turretGroup.updateMatrixWorld(true);
        return u.turretGroup.localToWorld(new THREE.Vector3(off[0], off[1], off[2]));
      }
      return this.vehicleLocalToWorld(u, TURRET_RING[type] || TURRET_RING.ALL_ROUNDER);
    },

    onVehicleDestroyed(u, impactVel, hitPoint) {
      if (!u || !u.group || u.fxDestroyed) return;
      this.trackVehicle(u);
      u.fxDestroyed = true;
      const type = u.tankType || 'ALL_ROUNDER';
      const K = this.killInfo(u);
      // Hướng đạn & điểm trúng của phát kết liễu (tháp văng theo quán tính đạn, không ngẫu nhiên)
      if (!impactVel && K.dir) impactVel = K.dir.clone().normalize().multiplyScalar(40);
      if (!hitPoint && K.point) hitPoint = K.point.clone();
      // Xác xe: vỡ kính, văng / xẹp lốp, vặn méo khung, bung phụ kiện (hệ thống hư hại bộ phận)
      if (typeof VehicleDamage !== 'undefined' && VehicleDamage.onDestroyed) VehicleDamage.onDestroyed(u, this, K);
      const W = u.fxWreck = { t: 0, K, cookOff: rand(3.5, 6), nextBang: 0.3, turret: null, impactVel, hitPoint, cookAt: K.cookAt, char: 0, charT: 0 };
      // Lớp sơn cháy sém dần theo đám cháy (không đen thui ngay lập tức) — lưu màu gốc để hồi sinh khôi phục
      W.charMats = [];
      u.group.traverse(o => {
        if (!o.isMesh || o.userData.isFxDecal) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach(m => {
          if (!m || !m.color || m.isMeshBasicMaterial || m.blending === THREE.AdditiveBlending) return;
          if (m.userData && m.userData.surface === 'glass') return;   // kính đã chuyển sang kính rạn vỡ (hệ hư hại tự quản màu)
          if (!m.userData.fxOrigColor) m.userData.fxOrigColor = m.color.clone();
          if (!W.charMats.includes(m)) W.charMats.push(m);
        });
      });
      // [mức sém ban đầu, thời hằng sém (s), mức tối đa]: nổ kho đạn -> muội đen phủ ngay; cháy trong -> sém dần
      // (muội khói + sơn phồng cháy phải đủ rõ sau 1-2 s để người chơi nhận ra xe đã bị hạ dù vỏ còn nguyên)
      const CH = { det: [0.5, 5, 1], vent: [0.25, 15, 0.7], crew: [0.22, 10, 1], fuel: [0.3, 8, 1], engine: [0.16, 14, 1], blast: [0.35, 8, 1], burn: [0.35, 8, 1] };
      const ch = CH[K.instant === 'det' ? 'det' : K.instant === 'vent' ? 'vent' : K.mode] || CH.crew;
      W.char = ch[0]; W.charT = ch[1]; W.charMax = ch[2];
      this.applyChar(u);

      const snd = window.soundEngine && window.soundEngine.playVehicleDestroyed ? window.soundEngine : null;
      if (K.instant === 'det') {
        this.detonateWreck(u, false);
      } else if (K.instant === 'vent') {
        this.startVent(u);
      } else {
        // Không nổ ngay: chớp lửa trong khoang phụt ra lỗ xuyên / dầu bốc cháy ở khoang máy
        const eng = this.vehicleLocalToWorld(u, ENGINE_POINT[type] || ENGINE_POINT.ALL_ROUNDER);
        if (K.mode === 'engine' || K.mode === 'fuel') {
          const p = K.mode === 'fuel' && K.point ? K.point : eng;
          this.spawnFireball(p.x, p.y + 3, p.z, K.mode === 'fuel' ? 1.0 : 0.7, PROFILES.NORMAL, 0, 0);
          if (snd) snd.playVehicleDestroyed(type, p, 'fuel');
        } else {
          const p = K.point || this.ammoPoint(u);
          const out = K.dir ? K.dir.clone().normalize().negate() : new THREE.Vector3(0, 1, 0);
          // Mảnh vỡ + lửa phụt ngược ra lỗ xuyên (áp suất trong khoang), rồi khói xám trắng tuôn ra
          for (let k = 0; k < 14; k++) {
            this.fire.add({
              x: p.x, y: p.y, z: p.z, vx: out.x * rand(20, 60) + rand(-10, 10), vy: out.y * rand(20, 60) + rand(4, 22), vz: out.z * rand(20, 60) + rand(-10, 10),
              size: rand(1.6, 3.4), grow: 4, drag: 3, grav: -6, life: rand(0.15, 0.35), alpha: 1, fadeIn: 0.01, c0: [1, 0.85, 0.5], c1: [0.85, 0.3, 0.06], cell: 1, floor: false
            });
          }
          this.spawnSparks(p.x, p.y, p.z, 0.8, { sparks: 1.4 }, true, out.x, out.z);
          if (snd) snd.playVehicleDestroyed(type, p, K.mode === 'burn' ? 'fuel' : 'crew');
        }
      }
    },

    // Kho đạn / nhiên liệu kích nổ (ngay khi bị hạ, hoặc trễ khi lửa lan tới)
    detonateWreck(u, delayed) {
      const W = u.fxWreck;
      if (!W || W.detonated) return;
      W.detonated = true;
      W.cookStart = W.t;
      const type = u.tankType || 'ALL_ROUNDER';
      const K = W.K || {};
      const ring = this.ammoPoint(u);
      if (delayed && typeof VehicleDamage !== 'undefined' && VehicleDamage.onDetonate) VehicleDamage.onDetonate(u, this);
      // Xe trinh sát không có kho đạn pháo: chỉ nổ bình nhiên liệu / thùng đạn súng máy -> quả cầu lửa nhỏ hơn
      const light = type === 'SCOUT';
      const fb = { ALL_ROUNDER: 1.6, ARTILLERY: 1.8, GATLING: 1.25, SCOUT: 0.9 }[type] || 1.4;
      // Tiếng nổ thứ cấp riêng của từng loại xe (kho đạn kích nổ / liều phóng cháy phụt / bình xăng bốc cháy)
      if (window.soundEngine && window.soundEngine.playVehicleDestroyed) window.soundEngine.playVehicleDestroyed(type, ring, 'det');
      // chớp nổ trong khoang kín bị thân xe che phần lớn: nhỏ hơn hẳn đạn HE nổ ngoài trời (trước đây trắng xóa cả cảnh)
      this.spawn(ring.x, ring.y + 4, ring.z, light ? 'NORMAL' : 'HE', 'DIRECT_HIT', { heavy: false, flashK: 0.45 });
      this.spawnFireball(ring.x, ring.y + 8, ring.z, fb, light ? PROFILES.NORMAL : PROFILES.HE, 0, 0);
      // Khối thuốc phóng bùng cháy: cột lửa cuộn vọt thẳng lên (khí nổ thoát qua nóc / vòng tháp), chớp sáng mạnh,
      // mảnh cháy văng vòng cung kéo khói, rồi lửa còn phụt thành cột vài giây (W.torch)
      this.addLight(ring.x, ring.y + 10, ring.z, Math.min(1.0, fb * 0.6), 0.4);
      for (let i = 0; i < Math.round(14 * fb); i++) {
        const h = Math.random();
        this.fire.add({
          x: ring.x + rand(-3, 3) * fb, y: ring.y + 4 + h * 10 * fb, z: ring.z + rand(-3, 3) * fb, vx: rand(-10, 10), vy: rand(70, 150) * (0.6 + 0.4 * fb), vz: rand(-10, 10),
          size: rand(9, 16) * fb, grow: 14 * fb, drag: 2.4, grav: -10, life: rand(0.55, 1.05), alpha: 0.95, fadeIn: 0.02, fadePow: 1.4,
          c0: [1, 0.8, 0.45], c1: [0.6, 0.18, 0.04], cell: 1, floor: false
        });
      }
      for (let i = 0; i < 6; i++) {
        const g = rand(0.05, 0.1);
        this.smoke.add({
          x: ring.x + rand(-4, 4), y: ring.y + 18 * fb + rand(0, 10), z: ring.z + rand(-4, 4), vx: rand(-8, 8), vy: rand(40, 70) * fb, vz: rand(-8, 8),
          size: rand(12, 18) * fb, grow: 12, drag: 1.0, grav: -4, life: rand(4, 6), alpha: 0.8, fadeIn: 0.15,
          c0: [g, g, g], c1: [g * 2.3, g * 2.2, g * 2.1], cell: 0, floor: false
        });
      }
      // nổ trong khoang kín: khí nổ thoát lên qua nóc / vòng tháp, chỉ sức ép lọt ra gầm thổi bụi (không cuốn mù cả
      // cảnh như quả đạn HE nổ ngoài trời)
      this.spawnDust(ring.x, this.groundAt(ring.x, ring.z), ring.z, fb * 0.45, PROFILES.HE, this.palette('GROUND'), false);
      this.launchFrags(W, ring, { ALL_ROUNDER: 12, ARTILLERY: 14, GATLING: 9, SCOUT: 6 }[type] || 10, 1, false);
      W.torch = { ph: Math.random() * 10, t0: W.t, dur: { ALL_ROUNDER: rand(2.5, 4), ARTILLERY: rand(3.5, 5), GATLING: rand(1.5, 2.5), SCOUT: rand(1, 1.8) }[type] || 2, scale: { ALL_ROUNDER: 1, ARTILLERY: 1.15, GATLING: 0.75, SCOUT: 0.55 }[type] || 1 };
      W.char = Math.max(W.char || 0, 0.5); W.charT = Math.min(W.charT || 5, 6); W.charMax = 1;
      this.applyChar(u);
      // Tháp pháo bị hất văng theo hướng đạn nổ và quán tính (pháo tự hành nặng hơn nên bay thấp & gần hơn,
      // xe trinh sát chỉ bật trạm vũ khí nhẹ). Nổ trễ: khí nổ đẩy thẳng lên, hướng đạn ít còn ý nghĩa
      const tossK = { ARTILLERY: 0.7, SCOUT: 0.3 }[type] || 1;
      if (u.turretGroup && Math.random() < (K.tossP || 0)) this.tossTurret(u, delayed ? null : W.impactVel, delayed ? null : W.hitPoint, tossK);
      // Vài lỗ xuyên + vết cháy trên sườn xe (mảnh văng từ trong ra)
      for (let k = 0; k < 3; k++) {
        const a = Math.random() * Math.PI * 2;
        const dir = new THREE.Vector3(Math.cos(a), -0.15, Math.sin(a));
        const from = this.vehicleLocalToWorld(u, [0, 9, 0]).addScaledVector(dir, 40);
        const h = this.hitUnitSurface(u, from, dir.clone().negate(), 60);
        const onTurret = h && u.turretGroup && (h.object.parent === u.turretGroup || h.object.parent === u.barrelPivot || h.object.parent === u.barrelGroup);
        if (h && !onTurret) {
          this.addSurfaceMark(h.point, h.normal, h.object, 'penetration', 2.8, { unit: u });
          this.addSurfaceMark(h.point, h.normal, h.object, 'scorch', 7, { unit: u });
        }
      }
    },

    // Màu sơn cháy sém theo W.char (0 nguyên màu -> 1 đen muội), từ màu gốc đã lưu
    applyChar(u) {
      const W = u.fxWreck;
      if (!W || !W.charMats) return;
      const c = Math.max(0, Math.min(1, W.char || 0)), f = 1 - 0.84 * c;
      for (const m of W.charMats) {
        const o = m.userData && m.userData.fxOrigColor;
        if (o) m.color.setRGB(o.r * f + 0.03 * c, o.g * f + 0.025 * c, o.b * f + 0.02 * c);
      }
    },

    // Mức lửa (0..1) ở khoang tháp / nắp (ring) và khoang máy (eng) theo kiểu chết & thời gian
    wreckFireLevels(u, W) {
      const K = W.K || {}, t = W.t;
      const ramp = (a, b) => Math.max(0, Math.min(1, (t - a) / Math.max(0.01, b - a)));
      if (W.detonated) return { ring: Math.min(1, 0.6 + (t - W.cookStart)), eng: 1 };
      let ring, eng;
      switch (K.mode) {
        case 'engine': eng = 0.35 + 0.65 * ramp(0, 4); ring = 0.7 * ramp(6, 10); break;     // lửa khoang máy lan dần lên
        case 'fuel': eng = 0.5 + 0.5 * ramp(0, 3); ring = ramp(1, 6); break;
        case 'blast': case 'burn': ring = 0.5 + 0.5 * ramp(0, 2.5); eng = 0.4 + 0.6 * ramp(0, 4); break;
        case 'ammo': ring = 0; eng = 0; break;                                                  // xả áp: khoang kíp lái kín, không cháy lan
        default: ring = 0.12 + 0.88 * ramp(0.6, 6); eng = ramp(4, 9);                          // xuyên khoang kíp lái: lửa bén dần
      }
      if (W.vent) {
        const end = W.vent.t0 + W.vent.dur;
        if (t < end) ring = Math.min(ring, 0.15);
        else if (K.mode === 'ammo') ring = 0.25 * Math.max(0, 1 - (t - end) / 40);             // hốc đạn cháy âm ỉ rồi tắt
      }
      return { ring, eng };
    },

    // Hốc đạn sau tháp xả áp (xe tăng): tấm xả áp trên nóc bật tung, đạn cháy phụt lửa thẳng lên vài giây — tháp ở lại
    startVent(u) {
      const W = u.fxWreck;
      if (!W || W.vent || W.detonated) return;
      W.cookStart = W.t;
      W.vent = { t0: W.t, dur: rand(4, 6.5), pts: null, lastT: W.t };
      const t = u.turretGroup;
      if (t && !W.turret) {
        const b = this.turretBodyBox(u, t);
        if (!b.isEmpty()) {
          const hx = Math.max(2, (b.max.x - b.min.x) * 0.2);
          W.vent.pts = [new THREE.Vector3(-hx, b.max.y - 0.3, b.max.z - 4), new THREE.Vector3(hx, b.max.y - 0.3, b.max.z - 4)];
        }
      }
      const p = this.ventPoint(u, W, 0);
      this.spawnFireball(p.x, p.y + 6, p.z, 0.7, PROFILES.NORMAL, 0, 0);
      this.spawnSparks(p.x, p.y + 1, p.z, 1, { sparks: 1.6 }, true, 0, 0);
      // tấm xả áp trên nóc hốc đạn bị áp suất thổi bật thẳng lên (mỗi miệng xả một tấm), rơi lại quanh xe
      if (W.vent.pts && typeof VehicleDamage !== 'undefined' && VehicleDamage.spawnChunks) {
        const up = new THREE.Vector3(0, 1, 0);
        for (let i = 0; i < 2; i++) VehicleDamage.spawnChunks(u, this.ventPoint(u, W, i).add(new THREE.Vector3(0, 0.6, 0)), up, 1, 3.2, 180, null);
      }
      W.char = Math.max(W.char || 0, 0.15);
      this.applyChar(u);
      if (window.soundEngine && window.soundEngine.playVehicleDestroyed) window.soundEngine.playVehicleDestroyed(u.tankType || 'ALL_ROUNDER', p, 'vent', W.vent.dur);
    },

    ventPoint(u, W, i) {
      if (W.vent && W.vent.pts && u.turretGroup && !W.turret) {
        u.turretGroup.updateMatrixWorld(true);
        return u.turretGroup.localToWorld(W.vent.pts[i].clone());
      }
      return this.ammoPoint(u);
    },

    emitVent(u, W) {
      const V = W.vent;
      if (W.t - V.lastT < 0.033) return;
      V.lastT = W.t;
      const a = (W.t - V.t0) / V.dur;
      // bùng mạnh ngay (áp suất đầu cao), duy trì, lụi dần cuối; chập chờn
      let k = a < 0.08 ? 0.6 + 5 * a : a < 0.65 ? 1 : Math.max(0, 1 - (a - 0.65) / 0.35);
      k *= 0.8 + 0.4 * Math.random();
      for (let i = 0; i < 2; i++) {
        const p = this.ventPoint(u, W, i);
        // cột lửa thuốc phóng gầm thét từ miệng tấm xả áp: lõi trắng vàng đặc ở gốc, loe & đỏ dần lên cao, đỉnh ~8-10 m
        // (hạt to, chồng lên nhau, sinh dọc thân cột -> một khối lửa liền, không phải tia lấm tấm như pháo hoa)
        const n = Math.round(7 + 9 * k);
        for (let j = 0; j < n; j++) {
          const f = Math.pow(Math.random(), 1.5), h = f * 70 * k;
          const w = 0.9 + 2.6 * f;
          this.fire.add({
            x: p.x + rand(-1, 1) * w, y: p.y + h, z: p.z + rand(-1, 1) * w, vx: rand(-5, 5), vy: rand(90, 140) * (0.5 + 0.5 * k), vz: rand(-5, 5),
            size: rand(5.5, 8.5) * (0.6 + 0.4 * k) * (1 + f * 1.1), grow: 7, drag: 2, grav: -4, life: rand(0.16, 0.32), alpha: 1, fadeIn: 0.015,
            c0: f < 0.25 ? [1, 0.8, 0.45] : [1, 0.58, 0.2], c1: f < 0.55 ? [0.9, 0.26, 0.04] : [0.45, 0.1, 0.02], cell: 1, floor: false
          });
        }
        // khói đen thuốc phóng cuộn quanh nửa trên cột lửa rồi bốc thành cột
        for (let j = 0; j < 3; j++) {
          if (Math.random() > 0.6) continue;
          const g = rand(0.04, 0.09);
          this.smoke.add({
            x: p.x + rand(-4, 4), y: p.y + 70 * k * rand(0.3, 1) + 4, z: p.z + rand(-3, 3), vx: rand(-4, 4), vy: rand(30, 45) * k + 12, vz: rand(-4, 4),
            size: rand(8, 12), grow: 9, drag: 0.7, grav: -4, life: rand(3.5, 5.5), alpha: 0.75, fadeIn: 0.15,
            c0: [g, g, g], c1: [g * 2.3, g * 2.2, g * 2.1], cell: 0, floor: false
          });
        }
      }
    },

    // Thuốc phóng cháy sau kích nổ: ngọn lửa cuộn dữ dội từ khoang hở — dày đặc ở gốc, loe rộng & uốn lắc theo
    // chiều cao (rối khí, gió), ngọn tối đỏ rồi hóa khói đen dầu. Hạt dồn về gốc, to và chồng lên nhau -> khối lửa liền,
    // không thành cột đốm cách quãng. k = cường độ 0..1, ph = pha lắc (thời gian)
    emitJet(p, k, scale = 1, ph = 0) {
      const H = 40 * k * scale;                                   // chiều cao ngọn lửa (~5 m với xe tăng)
      const swayX = Math.sin(ph * 1.7) * 0.18 + Math.sin(ph * 4.3 + 1.1) * 0.07;
      const swayZ = Math.cos(ph * 1.3 + 0.6) * 0.15 + Math.sin(ph * 3.7) * 0.06;
      const n = Math.round((5 + 7 * k) * scale);
      for (let j = 0; j < n; j++) {
        const f = Math.pow(Math.random(), 1.9);                   // phần lớn hạt ở thấp: gốc lửa đặc
        const h = f * H;
        const wdt = (2.2 + 4.5 * f) * scale;                      // loe ra theo chiều cao
        this.fire.add({
          x: p.x + rand(-1, 1) * wdt + swayX * h, y: p.y + 1 + h, z: p.z + rand(-1, 1) * wdt + swayZ * h,
          vx: rand(-5, 5) + swayX * 40, vy: rand(28, 55) * (0.6 + 0.4 * k), vz: rand(-5, 5) + swayZ * 40,
          size: rand(8, 13) * scale * (0.65 + 0.35 * k) * (1 + f * 0.9), grow: 4, drag: 2, grav: -10, life: rand(0.2, 0.36), alpha: 0.95, fadeIn: 0.02,
          c0: f < 0.35 ? [1, 0.86, 0.55] : [1, 0.66, 0.28], c1: f < 0.6 ? [0.95, 0.32, 0.05] : [0.55, 0.12, 0.02], cell: 1, floor: false
        });
      }
      // khói đen dầu sinh ngay tại ngọn lửa, nối liền vào cột khói
      for (let j = 0; j < 2; j++) {
        if (Math.random() > 0.55 + 0.35 * k) continue;
        const g = rand(0.04, 0.09);
        this.smoke.add({
          x: p.x + rand(-3, 3) * scale + swayX * H, y: p.y + H * rand(0.75, 1.05) + 2, z: p.z + rand(-3, 3) * scale + swayZ * H,
          vx: rand(-4, 4) + swayX * 30, vy: rand(26, 42) * (0.6 + 0.4 * k), vz: rand(-4, 4) + swayZ * 30,
          size: rand(9, 13) * scale, grow: 10, drag: 0.7, grav: -4, life: rand(3.5, 5.5), alpha: 0.78, fadeIn: 0.1,
          c0: [g, g, g], c1: [g * 2.3, g * 2.2, g * 2.1], cell: 0, floor: false
        });
      }
    },

    // Điểm / hướng trong hệ thân xe (chassisGroup, đã gồm lún & nghiêng của xác) -> thế giới
    chassisToWorld(u, p) {
      const cg = u.chassisGroup || u.group;
      cg.updateMatrixWorld(true);
      return new THREE.Vector3(p[0], p[1], p[2]).applyMatrix4(cg.matrixWorld);
    },
    chassisDirToWorld(u, n) {
      return new THREE.Vector3(n[0], n[1], n[2]).transformDirection((u.chassisGroup || u.group).matrixWorld);
    },

    // Cabin kín cháy từ trong: mỗi ô kính vỡ / nắp nóc phụt lưỡi lửa ra ngoài rồi bị lực nổi uốn ngược lên, liếm dọc
    // thành xe; miệng ô cửa rực cam (lòng cabin đang cháy); khói đen cuộn ra từ chính ô cửa. Lốp cao su bén lửa sau vài giây.
    emitCabFire(u, W, cab, fl, burn) {
      // cabin lái tách khỏi khoang chiến đấu: bén lửa chậm hơn, lan từ khoang máy / tháp sang
      const cabLv = Math.max(fl.ring, fl.eng) * Math.min(1, 0.35 + W.t / 6);
      if (Math.max(fl.ring, fl.eng) > 0.06) {
        for (const o of cab) {
          const lv = o.eng ? fl.eng : o.cab ? cabLv : fl.ring;
          if (lv < 0.06 || Math.random() > 0.3 + 0.7 * lv) continue;
          const s = burn * (0.45 + 0.55 * lv);
          const P = this.chassisToWorld(u, o.p), N = this.chassisDirToWorld(u, o.n);
          const nF = 1 + (Math.random() < lv ? 1 : 0) + (o.roof && Math.random() < lv ? 1 : 0);
          for (let j = 0; j < nF; j++) {
            const out = rand(6, 16) * (0.6 + 0.4 * lv);
            this.fire.add({
              x: P.x + rand(-1.1, 1.1), y: P.y + rand(-0.8, 0.8), z: P.z + rand(-1.1, 1.1),
              vx: N.x * out + rand(-2, 2), vy: N.y * out + rand(4, 12), vz: N.z * out + rand(-2, 2),
              size: rand(3.2, 5.4) * s * (o.roof ? 1.3 : 1), grow: 2.5, drag: 2.4, grav: -34, life: rand(0.32, 0.58), alpha: 0.95, fadeIn: 0.03,
              c0: [1, 0.8, 0.42], c1: [0.85, 0.24, 0.03], cell: 1, floor: false
            });
          }
          // miệng ô cửa rực sáng (lửa trong cabin)
          if (Math.random() < 0.7) {
            this.fire.add({
              x: P.x - N.x * 0.4, y: P.y - N.y * 0.4, z: P.z - N.z * 0.4, vx: 0, vy: 1, vz: 0,
              size: rand(3, 4.2) * (0.6 + 0.4 * lv), grow: 0, life: rand(0.14, 0.24), alpha: 0.85, fadeIn: 0.03,
              c0: [1, 0.62, 0.22], c1: [0.75, 0.18, 0.02], cell: 1, floor: false
            });
          }
          if (Math.random() < 0.25 + 0.35 * lv) {
            const g = lv > 0.45 ? rand(0.04, 0.09) : rand(0.14, 0.26) - lv * 0.15;
            this.smoke.add({
              x: P.x + N.x * 2.5, y: P.y + 3 + N.y * 2, z: P.z + N.z * 2.5, vx: N.x * 4 + rand(-2, 2), vy: rand(14, 24) * (0.6 + 0.4 * lv), vz: N.z * 4 + rand(-2, 2),
              size: rand(5, 8) * (0.6 + 0.4 * lv), grow: 8, drag: 0.6, grav: -5, life: rand(3.5, 5.5), alpha: 0.5 + 0.25 * lv, fadeIn: 0.12,
              c0: [g, g, g], c1: [g * 2.4, g * 2.3, g * 2.2], cell: 0, floor: false
            });
          }
        }
      }
      // Lốp cao su bén lửa sau ~3 s: lửa thấp liếm quanh bánh, khói đen đặc quánh
      const ws = u.wheelSet;
      const tireLv = Math.min(1, Math.max(0, (W.t - 3) / 5)) * Math.max(fl.ring, fl.eng) * burn;
      if (ws && tireLv > 0.05) {
        const cg = u.chassisGroup || u.group;
        cg.updateMatrixWorld(true);
        ws.positions.forEach((wp, i) => {
          if ((ws.gone && ws.gone[i]) || Math.random() > 0.2 + 0.6 * tireLv) return;
          const sx = Math.sign(wp.x) || 1, R = ws.radius || 4, kr = R / 3.8;
          const P = cg.localToWorld(new THREE.Vector3(wp.x + sx * R * rand(0.15, 0.36), wp.y + R * rand(-0.25, 0.4), wp.z + R * rand(-0.6, 0.6)));
          // bánh to (xe tải 6x6) cháy rộng hơn: nhiều lưỡi lửa, to theo bán kính bánh
          for (let j = kr > 1.2 ? 2 : 1; j > 0; j--) {
            this.fire.add({
              x: P.x, y: P.y + (j - 1) * R * 0.3, z: P.z + (j - 1) * R * rand(-0.4, 0.4), vx: rand(-1.5, 1.5), vy: rand(6, 14) * Math.sqrt(kr), vz: rand(-1.5, 1.5),
              size: rand(2.4, 4) * (0.5 + 0.5 * tireLv) * kr, grow: 1.5, drag: 2, grav: -22, life: rand(0.28, 0.5), alpha: 0.9, fadeIn: 0.03,
              c0: [1, 0.72, 0.3], c1: [0.8, 0.2, 0.02], cell: 1, floor: false
            });
          }
          if (Math.random() < 0.5) {
            const g = rand(0.025, 0.06);
            this.smoke.add({
              x: P.x, y: P.y + 2.5, z: P.z, vx: rand(-2, 2), vy: rand(10, 18), vz: rand(-2, 2),
              size: rand(4, 6.5), grow: 7, drag: 0.6, grav: -5, life: rand(4, 6), alpha: 0.7 * tireLv, fadeIn: 0.12,
              c0: [g, g, g], c1: [g * 2.4, g * 2.3, g * 2.2], cell: 0, floor: false
            });
          }
        });
      }
    },

    // Đạn súng máy trong cabin cháy nổ: chớp sáng ngắn ở một ô cửa + vài vệt mảnh / đầu đạn phóng ra theo hướng ô cửa.
    // Một lần duy nhất: động cơ tên lửa chống tăng trong ống phóng bắt lửa (W.motor)
    cabCookBang(u, W, cab) {
      const o = cab[(Math.random() * cab.length) | 0];
      const P = this.chassisToWorld(u, o.p), N = this.chassisDirToWorld(u, o.n);
      this.fire.add({ x: P.x + N.x * 0.6, y: P.y + N.y * 0.6, z: P.z + N.z * 0.6, vx: 0, vy: 0, vz: 0, size: rand(2.6, 4.2), grow: 14, life: 0.06, alpha: 1, fadeIn: 0.004, c0: [1, 0.95, 0.75], cell: 3, floor: false });
      if (this.streaks) {
        const nq = 1 + ((Math.random() * 3) | 0);
        for (let q = 0; q < nq; q++) {
          const sp = rand(60, 140);
          this.streaks.add({ x: P.x, y: P.y, z: P.z, vx: (N.x + rand(-0.6, 0.6)) * sp, vy: (N.y + rand(0.1, 0.9)) * sp, vz: (N.z + rand(-0.6, 0.6)) * sp, drag: 1.4, grav: GRAV, life: rand(0.18, 0.4), tail: rand(0.025, 0.045) });
        }
      }
      if (Math.random() < 0.3) {
        const g = rand(0.35, 0.5);
        this.smoke.add({ x: P.x + N.x * 1.5, y: P.y + 1, z: P.z + N.z * 1.5, vx: N.x * 6, vy: rand(6, 12), vz: N.z * 6, size: rand(2, 3.2), grow: 6, drag: 1.2, grav: -3, life: rand(0.8, 1.4), alpha: 0.35, fadeIn: 0.02, c0: [g, g, g], c1: [g * 1.3, g * 1.3, g * 1.25], cell: 0, floor: false });
      }
      if (W.bangs === 7 && !W.motor && u.turretGroup && !W.turret) {
        const a = Math.random() * Math.PI * 2;
        W.motor = { t0: W.t, dur: rand(1.2, 2.0), dir: new THREE.Vector3(Math.cos(a), rand(0.05, 0.25), Math.sin(a)).normalize() };
        const p = this.ammoPoint(u);
        this.addLight(p.x, p.y + 2, p.z, 0.6, 0.25);
        if (window.soundEngine && window.soundEngine.secondaryAt) window.soundEngine.secondaryAt('flare', p, 0.7);
      }
      if (window.soundEngine && window.soundEngine.secondaryAt) window.soundEngine.secondaryAt('cookoffSmall', P, 0.5);
      else if (window.soundEngine && this.onSound) this.onSound(P, 'DIRECT_HIT', 'CLUSTER_SUBMUNITION');
    },

    // Luồng phụt động cơ tên lửa: lõi trắng vàng hẹp, dài, vọt nhanh; khói trắng xám kéo theo
    emitMotor(u, W) {
      const M = W.motor, p = this.ammoPoint(u), d = M.dir;
      const a = (W.t - M.t0) / M.dur;
      const k = (a < 0.15 ? 0.6 + a / 0.15 * 0.4 : 1 - Math.max(0, a - 0.7) / 0.3) * (0.85 + 0.3 * Math.random());
      for (let j = 0; j < 4; j++) {
        const sp = rand(110, 190) * k, off = rand(0, 1.5);
        this.fire.add({
          x: p.x + d.x * off, y: p.y + 0.8 + d.y * off, z: p.z + d.z * off, vx: d.x * sp + rand(-6, 6), vy: d.y * sp + rand(-4, 6), vz: d.z * sp + rand(-6, 6),
          size: rand(1.6, 2.6), grow: 9, drag: 3, grav: -6, life: rand(0.1, 0.2), alpha: 1, fadeIn: 0.005,
          c0: [1, 0.95, 0.78], c1: [1, 0.55, 0.12], cell: 1, floor: false
        });
      }
      if (Math.random() < 0.7) {
        const g = rand(0.55, 0.72), off = rand(8, 22) * k;
        this.smoke.add({
          x: p.x + d.x * off, y: p.y + 1 + d.y * off, z: p.z + d.z * off, vx: d.x * 25 * k + rand(-3, 3), vy: rand(4, 10), vz: d.z * 25 * k + rand(-3, 3),
          size: rand(3, 5), grow: 7, drag: 1.4, grav: -3, life: rand(1.6, 2.6), alpha: 0.45, fadeIn: 0.04,
          c0: [g, g, g], c1: [g * 1.05, g * 1.04, g], cell: 0, floor: false
        });
      }
    },

    // Lửa bùng "phừng": lưỡi lửa lớn vọt cao + cuộn khói đen dày + lóe sáng + tiếng phừng
    // spread: độ loang ngang (xe nhỏ cabin kín: lửa bùng từ trong cabin, gọn hơn)
    wreckFlare(p, k, spread = 1) {
      const n = Math.round((6 + 10 * k) * (0.6 + 0.4 * spread));
      for (let i = 0; i < n; i++) {
        this.fire.add({
          x: p.x + rand(-5, 5) * spread, y: p.y + rand(0, 3), z: p.z + rand(-5, 5) * spread, vx: rand(-8, 8) * spread, vy: rand(55, 105) * (0.6 + 0.4 * k) * (0.55 + 0.45 * spread), vz: rand(-8, 8) * spread,
          size: rand(8, 15) * (0.6 + 0.4 * k) * (0.6 + 0.4 * spread), grow: 4, drag: 1.6, grav: -12, life: rand(0.45, 0.85), alpha: 0.95, fadeIn: 0.03,
          c0: [1, 0.78, 0.4], c1: [0.75, 0.2, 0.03], cell: 1, floor: false
        });
      }
      for (let i = 0; i < 3; i++) {
        const g = rand(0.04, 0.08);
        this.smoke.add({
          x: p.x + rand(-4, 4), y: p.y + 22 + rand(0, 8), z: p.z + rand(-4, 4), vx: rand(-5, 5), vy: rand(30, 48), vz: rand(-5, 5),
          size: rand(11, 16), grow: 10, drag: 0.7, grav: -4, life: rand(4, 6), alpha: 0.8, fadeIn: 0.15,
          c0: [g, g, g], c1: [g * 2.3, g * 2.2, g * 2.1], cell: 0, floor: false
        });
      }
      if (k > 0.45) this.addLight(p.x, p.y + 8, p.z, 0.7 * k, 0.4);
      if (window.soundEngine && window.soundEngine.secondaryAt) window.soundEngine.secondaryAt('flare', p, k);
    },

    // Mảnh cháy (vỏ thép, đạn, liều phóng đang cháy) văng vòng cung, kéo vệt khói; up = chỉ văng lên (xả áp)
    launchFrags(W, p, n, k = 1, up = false) {
      W.frags = W.frags || [];
      for (let i = 0; i < n && W.frags.length < 40; i++) {
        const a = Math.random() * Math.PI * 2, sp = (up ? rand(5, 20) : rand(30, 90)) * k;
        W.frags.push({ x: p.x, y: p.y, z: p.z, vx: Math.cos(a) * sp, vy: rand(50, 130) * k * (up ? 1.4 : 1), vz: Math.sin(a) * sp, t: 0, ground: false, gl: rand(3, 7), sz: rand(0.7, 1.3) });
      }
    },

    updateFrags(W, dt) {
      for (let i = W.frags.length - 1; i >= 0; i--) {
        const f = W.frags[i];
        f.t += dt;
        if (!f.ground) {
          f.vy -= 98 * dt;
          const kd = Math.exp(-0.25 * dt);
          f.vx *= kd; f.vz *= kd;
          f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt;
          const gy = this.groundAt(f.x, f.z);
          if (f.y <= gy + 0.5) { f.y = gy + 0.5; f.ground = true; f.t = 0; }
          // đầu mảnh cháy sáng + vệt khói xám đen phía sau
          this.fire.add({ x: f.x, y: f.y, z: f.z, vx: 0, vy: 2, vz: 0, size: rand(1.8, 3) * f.sz, grow: -3, life: rand(0.15, 0.3), alpha: 1, fadeIn: 0.005, c0: [1, 0.8, 0.45], c1: [0.9, 0.3, 0.05], cell: 1, floor: false });
          // vệt khói liền: rải các cụm khói dọc quãng vừa bay (cách nhau ~2 đơn vị), nở nhanh để không lộ thành chuỗi hạt
          // (theo quãng đường: 1 cụm / 3,5 đơn vị — giữ ngân sách hạt khói khi nhiều mảnh cùng bay)
          // vệt mảnh: sợi khói xơ nhỏ dày đặc (cách ~0.45 lần cỡ hạt) -> dải liền, mờ & tan nhanh; chỉ khi còn bay nhanh
          const step = Math.sqrt(f.vx * f.vx + f.vy * f.vy + f.vz * f.vz) * dt;
          const gap = 2.0 * f.sz;
          f.acc = (f.acc || 0) + step;
          const m = f.t < 1.3 ? Math.min(6, Math.floor(f.acc / gap)) : 0;
          f.acc -= Math.floor(f.acc / gap) * gap;
          for (let q = 0; q < m; q++) {
            const b = q / Math.max(1, m), g = rand(0.12, 0.2);
            this.smoke.add({ x: f.x - f.vx * dt * b, y: f.y - f.vy * dt * b, z: f.z - f.vz * dt * b, vx: rand(-1.2, 1.2), vy: rand(2, 5), vz: rand(-1.2, 1.2), size: rand(2.6, 3.4) * f.sz, grow: 7, drag: 0.9, grav: -2, life: rand(0.7, 1.15), alpha: 0.3, fadeIn: 0.03, c0: [g, g, g], c1: [g * 1.8, g * 1.75, g * 1.7], cell: 2, rot: Math.random() * 6.28, floor: false });
          }
        } else {
          // rơi xuống đất: cháy âm ỉ vài giây
          if (f.t > f.gl) { W.frags.splice(i, 1); continue; }
          if (Math.random() < 0.35) this.fire.add({ x: f.x + rand(-0.6, 0.6), y: f.y, z: f.z + rand(-0.6, 0.6), vx: 0, vy: rand(5, 10), vz: 0, size: rand(1.5, 2.6) * f.sz * (1 - f.t / f.gl * 0.6), grow: -2, life: rand(0.25, 0.45), alpha: 0.9, fadeIn: 0.02, c0: [1, 0.66, 0.26], c1: [0.7, 0.16, 0.02], cell: 1, floor: false });
          if (Math.random() < 0.15) {
            const g = rand(0.15, 0.25);
            this.smoke.add({ x: f.x, y: f.y + 1, z: f.z, vx: rand(-1, 1), vy: rand(5, 9), vz: rand(-1, 1), size: rand(2.5, 4), grow: 5, drag: 0.6, grav: -3, life: rand(1.5, 2.5), alpha: 0.45, fadeIn: 0.1, c0: [g, g, g], c1: [g * 1.8, g * 1.75, g * 1.7], cell: 0, floor: false });
          }
        }
      }
    },

    // Hất văng tháp pháo (kho đạn nổ / phát trúng mạnh vào xác xe)
    tossTurret(u, impactVel, hitPoint, tossK = 1) {
      const t = u.turretGroup;
      if (!t || !u.fxWreck || u.fxWreck.turret) return false;
      const type = u.tankType || 'ALL_ROUNDER';
      const ring = this.vehicleLocalToWorld(u, TURRET_RING[type] || TURRET_RING.ALL_ROUNDER);
      t.userData.fxBasePos = t.userData.fxBasePos || t.position.clone();
      t.userData.fxBaseRot = t.userData.fxBaseRot || t.rotation.clone();

      // Biến dạng nòng pháo: chốt nâng hạ bị thổi gãy gục hoặc quẹo góc (góc dương = ngóc lên; nòng mất chốt thì
      // gục / lệch ít, không chổng ngược lên trời)
      if (u.barrelPivot) {
        if (!u.barrelPivot.userData.fxBaseRot) u.barrelPivot.userData.fxBaseRot = u.barrelPivot.rotation.clone();
        u.barrelPivot.rotation.x = rand(-0.14, 0.22);
        u.barrelPivot.rotation.z = (Math.random() - 0.5) * 0.45;
      }

      // Vector hướng nổ hất tháp pháo mang quán tính đạn
      let hDirX = 0, hDirZ = 0;
      if (impactVel && Math.hypot(impactVel.x, impactVel.z) > 1) {
        const vLen = Math.hypot(impactVel.x, impactVel.z);
        hDirX = impactVel.x / vLen;
        hDirZ = impactVel.z / vLen;
      } else if (hitPoint) {
        const wp = u.group.position;
        const dx = wp.x - hitPoint.x, dz = wp.z - hitPoint.z;
        const dLen = Math.hypot(dx, dz) || 1;
        hDirX = dx / dLen;
        hDirZ = dz / dLen;
      } else {
        const a = Math.random() * Math.PI * 2;
        hDirX = Math.cos(a);
        hDirZ = Math.sin(a);
      }

      // Xe pháo tự hành: cụm pháo dài nằm dọc sàn xe tải, khí nổ thoát hai bên sườn (cabin trước, càng sau chắn) ->
      // hất chủ yếu sang ngang; hất dọc xe thì cụm pháo rơi đè lên chính cabin / sàn xe
      if (type === 'ARTILLERY') {
        const rx = new THREE.Vector3(1, 0, 0).applyQuaternion(u.group.quaternion);
        const side = Math.sign(hDirX * rx.x + hDirZ * rx.z) || (Math.random() < 0.5 ? -1 : 1);
        const bx = rx.x * side * 0.9 + hDirX * 0.35, bz = rx.z * side * 0.9 + hDirZ * 0.35;
        const bl = Math.hypot(bx, bz) || 1;
        hDirX = bx / bl; hDirZ = bz / bl;
      }

      // Độ phân kỳ góc nổ ngẫu nhiên
      const devAng = (Math.random() - 0.5) * (type === 'ARTILLERY' ? 0.4 : 0.75);
      const blastDirX = hDirX * Math.cos(devAng) - hDirZ * Math.sin(devAng);
      const blastDirZ = hDirX * Math.sin(devAng) + hDirZ * Math.cos(devAng);

      // Vận tốc ngang 22-42 đv/s (~3-5 m/s): tháp rơi cách thân xe vài mét
      const latSpeed = rand(22, 42) * tossK;
      const worldVx = blastDirX * latSpeed + (Math.random() - 0.5) * 8;
      // tung lên: xe tăng ~4-9 m (8 đơn vị = 1 m, g = 78,5 đv/s²), cụm pháo nặng / trạm vũ khí nhẹ thấp hơn
      const worldVy = rand(70, 105) * (0.7 + 0.3 * tossK);
      const worldVz = blastDirZ * latSpeed + (Math.random() - 0.5) * 8;

      // Chuyển vector vận tốc thế giới sang hệ local của xe (u.group)
      const qInv = u.group.quaternion.clone().invert();
      const localV = new THREE.Vector3(worldVx, worldVy, worldVz).applyQuaternion(qInv);

      // Kịch bản tư thế tiếp đất: cắm nòng tựa cát, nghiêng sườn, lật ngửa bụng, hoặc nằm sấp
      const rScen = Math.random();
      // Tư thế ban đầu khi chạm đất; sau đó tháp tự lật / ngả theo trọng lực tới thế nằm vững (settleTurret)
      const scenario = rScen < 0.36 ? 'TILTED_SIDE' : rScen < 0.68 ? 'UPSIDE_DOWN' : 'FLAT_BASE';

      // Tháp rời khỏi khung xe: chuyển sang hệ u.group (giữ nguyên tư thế thế giới) — còn là con của khung thì khung xác
      // xe lún / nghiêng / bị ép bẹp về sau sẽ kéo theo cả tháp đang nằm cách xa vài chục đơn vị
      if (t.parent && t.parent !== u.group) {
        t.userData.fxParent = t.parent;
        u.group.updateMatrixWorld(true);
        u.group.attach(t);
      }

      const T = u.fxWreck.turret = {
        v: localV,
        w: new THREE.Vector3(rand(-3.2, 3.2), rand(-4.0, 4.0), rand(-3.2, 3.2)),
        landed: false,
        scenario: scenario,
        box: this.turretBodyBox(u, t),
        barrel: this.barrelSamplePoints(u, t),
        hullBox: u.hullMainMesh ? this.localBoxOf(u.hullMainMesh, t.parent) : null
      };
      T.pts = this.getTurretContactPoints(u, t, T);

      // Lỗ vòng tháp cháy đen trên thân xe (thân lộ ra khi tháp bay mất)
      const hull = u.hullMainMesh;
      if (hull) {
        // Nóc thân xác xe có thể đã bị ép bẹp / phồng (trúng đạn tiếp trước khi tháp văng): dò mặt nóc thật tại vòng tháp
        // theo trục đứng của xe, không đặt cứng ở độ cao gốc (vết cháy lơ lửng trên nóc đã sụp)
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(u.group.getWorldQuaternion(new THREE.Quaternion()));
        const rc = this._ringRay || (this._ringRay = new THREE.Raycaster());
        rc.set(ring.clone().addScaledVector(up, 8), up.clone().negate());
        rc.far = 20;
        hull.updateMatrixWorld(true);
        const top = rc.intersectObject(hull, false)[0];
        const pt = top ? top.point.clone() : ring.clone().addScaledVector(up, -0.1);
        this.addSurfaceMark(pt, up, hull, 'turretRing', { GATLING: 20, ARTILLERY: 19, SCOUT: 6 }[type] || 22, { unit: u });
        this.emitters.push({ x: pt.x, z: pt.z, y: pt.y, t: 0, dur: rand(14, 20), acc: 0, rate: 16, size: 5 });
      }
      return true;
    },

    // Hộp bao của các mesh thuộc `root`, biểu diễn trong hệ tọa độ của `space`
    localBoxOf(root, space, exclude = null) {
      const box = new THREE.Box3();
      root.updateMatrixWorld(true);
      space.updateMatrixWorld(true);
      const inv = new THREE.Matrix4().copy(space.matrixWorld).invert();
      const m = new THREE.Matrix4();
      root.traverse(o => {
        if (!o.isMesh || o.isInstancedMesh || o.userData.isFxDecal || !o.geometry) return;
        if (exclude) { let a = o; while (a && a !== root) { if (a === exclude) return; a = a.parent; } }
        const mt = Array.isArray(o.material) ? o.material[0] : o.material;
        if (mt && (mt.blending === THREE.AdditiveBlending || mt.isMeshBasicMaterial)) return;
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        m.multiplyMatrices(inv, o.matrixWorld);
        box.union(o.geometry.boundingBox.clone().applyMatrix4(m));
      });
      return box;
    },

    // Hộp bao thân tháp (đã loại bỏ ăng-ten quá cao để tránh kênh tháp)
    turretBodyBox(u, t) {
      const box = this.localBoxOf(t, t, u.barrelPivot || null);
      if (!box.isEmpty()) box.max.y = Math.min(box.max.y, box.min.y + 9.5);
      return box;
    },

    // Thu thập các điểm giới hạn hình học của cả CỤM THÁP PHÁO VÀ NÒNG PHÁO
    getTurretContactPoints(u, tg, T) {
      const pts = [];
      const b = T.box;

      // 1. Tám đỉnh bao quanh thân tháp
      if (b && !b.isEmpty()) {
        for (let i = 0; i < 8; i++) {
          pts.push(new THREE.Vector3(
            i & 1 ? b.max.x : b.min.x,
            i & 2 ? b.max.y : b.min.y,
            i & 4 ? b.max.z : b.min.z
          ));
        }
        // Thêm 8 điểm quanh vành bi đáy tháp pháo (y = b.min.y) để đáy tròn không bao giờ bị cắt chìm vào cát
        const ringR = Math.min(Math.abs(b.max.x - b.min.x) * 0.45, 10.5);
        const ringY = b.min.y;
        for (let a = 0; a < 8; a++) {
          const ang = (a / 8) * Math.PI * 2;
          pts.push(new THREE.Vector3(Math.cos(ang) * ringR, ringY, Math.sin(ang) * ringR));
        }
      } else {
        pts.push(new THREE.Vector3(-10, 0, -12), new THREE.Vector3(10, 0, -12),
                 new THREE.Vector3(-10, 7, 15), new THREE.Vector3(10, 7, 15));
      }

      // 2. Cụm nòng pháo: lấy mẫu từ hình học thật của nòng (nòng đã bị uốn cong thì đường thẳng chốt -> miệng nòng sai lệch)
      if (u.barrelPivot && T.barrel) {
        pts.push(u.barrelPivot.position.clone());
        for (const p of T.barrel.pts) pts.push(p.clone());
        pts.push(T.barrel.muzzle.clone(), T.barrel.muzzle.clone());
      } else if (u.barrelPivot) {
        const pivotPos = u.barrelPivot.position.clone();
        pts.push(pivotPos.clone());

        const muzzleInTurret = this.muzzleInTurret(u);

        // Bán kính nòng pháo trung bình
        const barrelR = 1.6;
        // Các điểm kiểm tra phân đoạn dọc theo thân nòng
        for (let s = 1; s <= 4; s++) {
          const frac = s / 4;
          const pt = new THREE.Vector3().lerpVectors(pivotPos, muzzleInTurret, frac);
          pts.push(pt.clone());
          pts.push(new THREE.Vector3(pt.x, pt.y - barrelR, pt.z));
          pts.push(new THREE.Vector3(pt.x, pt.y + barrelR, pt.z));
          pts.push(new THREE.Vector3(pt.x - barrelR, pt.y, pt.z));
          pts.push(new THREE.Vector3(pt.x + barrelR, pt.y, pt.z));
        }
        // Điểm xa nhất ở miệng nòng
        pts.push(muzzleInTurret.clone());
        pts.push(new THREE.Vector3(muzzleInTurret.x, muzzleInTurret.y - barrelR, muzzleInTurret.z));
      }

      return pts;
    },

    // Vị trí miệng nòng trong hệ tọa độ của turretGroup
    muzzleInTurret(u) {
      // Fallback chiều dài nòng nếu thiếu muzzleTipLocal
      const p = u.muzzleTipLocal ? u.muzzleTipLocal.clone() : new THREE.Vector3(0, 0, -55);
      if (u.muzzleTipLocal && u.barrelGroup && u.barrelGroup.parent === u.barrelPivot) {
        u.barrelGroup.updateMatrix();
        p.applyMatrix4(u.barrelGroup.matrix);
      }
      u.barrelPivot.updateMatrix();
      return p.applyMatrix4(u.barrelPivot.matrix);
    },

    // Mẫu điểm của nòng theo đúng hình học hiện tại (kể cả nòng đã bị uốn cong), trong hệ tọa độ tháp: chia nòng thành
    // các khúc ~2 đơn vị dọc trục chốt -> miệng nòng, mỗi khúc giữ 6 đỉnh cực trị theo ±x / ±y / ±z của tháp
    barrelSamplePoints(u, t) {
      const bp = u.barrelPivot;
      if (!bp) return null;
      t.updateMatrixWorld(true);
      const inv = new THREE.Matrix4().copy(t.matrixWorld).invert(), M = new THREE.Matrix4(), v = new THREE.Vector3(), r = new THREE.Vector3();
      const piv = bp.position.clone(), tip = this.muzzleInTurret(u);
      const axis = tip.clone().sub(piv);
      const L = axis.length() || 1;
      axis.divideScalar(L);
      const nb = Math.max(4, Math.ceil(L / 2)), bins = [];
      bp.traverse(o => {
        if (!o.isMesh || o.isInstancedMesh || o.userData.isFxDecal || !o.geometry || !o.geometry.attributes.position) return;
        const mt = Array.isArray(o.material) ? o.material[0] : o.material;
        if (mt && (mt.blending === THREE.AdditiveBlending || mt.isMeshBasicMaterial)) return;
        M.multiplyMatrices(inv, o.matrixWorld);
        const pa = o.geometry.attributes.position, step = Math.max(1, Math.floor(pa.count / 4000));
        for (let i = 0; i < pa.count; i += step) {
          v.fromBufferAttribute(pa, i).applyMatrix4(M);
          const k = Math.max(0, Math.min(nb - 1, Math.floor(r.copy(v).sub(piv).dot(axis) / L * nb)));
          const P = bins[k] || (bins[k] = [v.clone(), v.clone(), v.clone(), v.clone(), v.clone(), v.clone()]);
          if (v.x < P[0].x) P[0].copy(v); if (v.x > P[1].x) P[1].copy(v);
          if (v.y < P[2].y) P[2].copy(v); if (v.y > P[3].y) P[3].copy(v);
          if (v.z < P[4].z) P[4].copy(v); if (v.z > P[5].z) P[5].copy(v);
        }
      });
      const pts = [];
      let muzzle = tip, far = -Infinity;
      bins.forEach(P => { for (const p of P) { pts.push(p); const sd = r.copy(p).sub(piv).dot(axis); if (sd > far) { far = sd; muzzle = p; } } });
      return pts.length ? { pts, muzzle: muzzle.clone() } : null;
    },

    // Khoảng hở thấp nhất giữa tháp (tư thế q, vị trí pos trong hệ cha) và mặt đỡ: mặt đất, hoặc nóc thân xác xe nếu điểm
    // nằm trên hình chiếu thân xe. Âm = đang ngập
    turretFloorClear(tg, T, q, pos, noHull = false) {
      const PW = tg.parent.matrixWorld, PI = T._pInv || (T._pInv = new THREE.Matrix4());
      PI.copy(PW).invert();
      const v = new THREE.Vector3(), w = new THREE.Vector3(), H = T.hullBox, hasH = !!(H && !H.isEmpty());
      let mn = Infinity;
      for (const p of T.pts) {
        v.copy(p).applyQuaternion(q).add(pos);
        w.set(v.x, 0, v.z).applyMatrix4(PW);
        let fl = w.set(w.x, this.groundAt(w.x, w.z), w.z).applyMatrix4(PI).y;
        if (hasH && !noHull && v.x > H.min.x && v.x < H.max.x && v.z > H.min.z && v.z < H.max.z) fl = Math.max(fl, H.max.y);
        mn = Math.min(mn, v.y - fl);
      }
      return mn;
    },

    // Lưới điểm dày phủ thân tháp + dọc nòng (bước <= 3 đơn vị) để xét chồng lên thân xe: điểm thưa thì góc thân xe lọt giữa
    turretHullCheckPoints(u, T) {
      const pts = [], b = T.box;
      if (b && !b.isEmpty()) {
        const n = v => Math.max(1, Math.ceil(v / 3));
        const nx = n(b.max.x - b.min.x), ny = n(b.max.y - b.min.y), nz = n(b.max.z - b.min.z);
        for (let i = 0; i <= nx; i++) for (let j = 0; j <= ny; j++) for (let k = 0; k <= nz; k++) {
          pts.push(new THREE.Vector3(b.min.x + (b.max.x - b.min.x) * i / nx, b.min.y + (b.max.y - b.min.y) * j / ny, b.min.z + (b.max.z - b.min.z) * k / nz));
        }
      }
      if (u.barrelPivot && T.barrel) {
        for (const p of T.barrel.pts) pts.push(p.clone());
      } else if (u.barrelPivot) {
        const piv = u.barrelPivot.position, mz = this.muzzleInTurret(u), R = 1.6;
        const steps = Math.max(1, Math.ceil(piv.distanceTo(mz) / 2));
        for (let s = 0; s <= steps; s++) {
          const p = new THREE.Vector3().lerpVectors(piv, mz, s / steps);
          // tháp lật nghiêng / ngửa thì bề dày nòng theo mọi trục của tháp đều có thể thành phương ngang
          pts.push(p, new THREE.Vector3(p.x + R, p.y, p.z), new THREE.Vector3(p.x - R, p.y, p.z), new THREE.Vector3(p.x, p.y + R, p.z),
            new THREE.Vector3(p.x, p.y - R, p.z), new THREE.Vector3(p.x, p.y, p.z + R), new THREE.Vector3(p.x, p.y, p.z - R));
        }
      }
      return pts;
    },

    // Đặt tháp đã xoay: không đè thân xe, tính toán độ cao chuẩn xác để cả thân tháp VÀ nòng pháo tựa trên mặt đất
    placeLandedTurret(u, tg, T) {
      // Điểm tựa của cả thân tháp VÀ nòng pháo (nòng dài gấp đôi thân tháp nên phải tính vào khi tránh thân xe)
      const contactPts = this.getTurretContactPoints(u, tg, T);
      const isLawnDart = (T.scenario === 'LAWN_DART');

      // Có điểm nào (thân tháp / nòng) nằm trong hình chiếu thân xe trên mặt đất không
      const H = T.hullBox, hasH = !!(H && !H.isEmpty()), pad = 1.0;
      const hcx = hasH ? (H.min.x + H.max.x) / 2 : 0, hcz = hasH ? (H.min.z + H.max.z) / 2 : 0;
      const tmp = new THREE.Vector3();
      const hullPts = hasH ? this.turretHullCheckPoints(u, T) : [];
      const hitsHull = (q, x, z) => {
        if (!hasH) return false;
        for (const p of hullPts) {
          tmp.copy(p).applyQuaternion(q);
          const wx = x + tmp.x, wz = z + tmp.z;
          if (wx > H.min.x - pad && wx < H.max.x + pad && wz > H.min.z - pad && wz < H.max.z + pad) return true;
        }
        return false;
      };
      const outward = (x, z) => {
        let ox = x - hcx, oz = z - hcz;
        const ol = Math.hypot(ox, oz);
        if (ol < 1e-3) { const a = Math.random() * Math.PI * 2; return [Math.cos(a), Math.sin(a)]; }
        return [ox / ol, oz / ol];
      };

      let px = tg.position.x, pz = tg.position.z;

      // 1. Nòng chĩa vào thân xe -> tháp xoay quanh trục đứng cho nòng chĩa ra ngoài (không để nòng cắm xuyên thân)
      if (u.barrelPivot && hitsHull(tg.quaternion, px, pz)) {
        const bd = (T.barrel ? T.barrel.muzzle : contactPts[contactPts.length - 2]).clone().sub(u.barrelPivot.position).applyQuaternion(tg.quaternion);
        const bl = Math.hypot(bd.x, bd.z);
        const [ox, oz] = outward(px, pz);
        if (bl > 1 && (bd.x * ox + bd.z * oz) / bl < 0.5) {
          const yaw = Math.atan2(ox, oz) - Math.atan2(bd.x, bd.z) + rand(-0.6, 0.6);
          tg.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw));
        }
      }

      tg.parent.updateMatrixWorld(true);
      const parentMatrix = tg.parent.matrixWorld;
      const parentInv = new THREE.Matrix4().copy(parentMatrix).invert();

      // Tháp lật / ngả khi nằm yên có thể đưa nòng quay lại đè thân xe -> kiểm tra lại, đẩy tiếp ra ngoài
      for (let attempt = 0; attempt < 4; attempt++) {
        const q = tg.quaternion.clone();

        // 2. Đẩy ra xa thân xe tới khi cả thân tháp lẫn nòng không chồng lên thân xe
        if (hitsHull(q, px, pz)) {
          const [ox, oz] = outward(px, pz);
          for (let s = 0; s < 240 && hitsHull(q, px, pz); s++) { px += ox * 0.5; pz += oz * 0.5; }
        }

        // 3. Tính toán độ cao tiếp đất chuẩn xác: đảm bảo không có điểm nào của thân tháp hay nòng pháo bị chui xuống đất
        let maxRequiredPosY = -Infinity;
        for (let i = 0; i < contactPts.length; i++) {
          const pt = contactPts[i];
          const ptRot = pt.clone().applyQuaternion(q);

          // Tọa độ thế giới của điểm tại vị trí mặt bằng (px, pz)
          const worldPt = new THREE.Vector3(px + ptRot.x, 0, pz + ptRot.z).applyMatrix4(parentMatrix);
          const gy = this.groundAt(worldPt.x, worldPt.z);

          // Mức lún tự nhiên vào cát: thân tháp & nòng pháo lún nhẹ 0.12 đơn vị; đầu nòng cắm thì ngập nhẹ 0.8 đơn vị
          let embed = 0.12;
          if (isLawnDart && i >= contactPts.length - 2) {
            embed = 0.8;
          }

          // Điểm thế giới mong muốn nằm ngay trên mặt đất (hoặc lún nhẹ embed)
          const targetWorldPt = new THREE.Vector3(worldPt.x, gy - embed, worldPt.z);
          // Chuyển về hệ tọa độ của tg.parent
          const localTarget = targetWorldPt.applyMatrix4(parentInv);

          // Độ cao tg.position.y cần thiết để điểm này không bị chìm xuống đất
          const reqPosY = localTarget.y - ptRot.y;
          if (reqPosY > maxRequiredPosY) {
            maxRequiredPosY = reqPosY;
          }
        }

        if (!isFinite(maxRequiredPosY)) {
          maxRequiredPosY = 0;
        }

        tg.position.set(px, maxRequiredPosY, pz);
        tg.updateMatrixWorld(true);
        // lần cuối: giữ tư thế đã nằm yên, chỉ đẩy ra + đặt độ cao (không lật lại kẻo nòng quay vào thân xe)
        if (isLawnDart || attempt === 3) break;
        this.settleTurret(u, tg, T, contactPts);
        if (!hitsHull(tg.quaternion, tg.position.x, tg.position.z)) break;
        px = tg.position.x; pz = tg.position.z;
      }
    },

    // Thả tháp nằm yên theo trọng lực: lật quanh điểm / cạnh tiếp đất thấp nhất cho tới khi
    // tựa vững trên >= 3 điểm và trọng tâm nằm trong đa giác tựa (không còn kênh / lơ lửng trên 1 điểm)
    settleTurret(u, tg, T, pts) {
      const parent = tg.parent;
      parent.updateMatrixWorld(true);
      const PW = parent.matrixWorld, PI = new THREE.Matrix4().copy(PW).invert();
      const b = T.box;
      const com = (b && !b.isEmpty()) ? b.getCenter(new THREE.Vector3()) : new THREE.Vector3(0, 3, 0);
      // nòng pháo kéo trọng tâm ra phía trước một chút
      if (u.barrelPivot) com.lerp(u.barrelPivot.position.clone().add(new THREE.Vector3(0, 0, -14)), 0.12);
      const groundLocal = (x, z) => {
        const w = new THREE.Vector3(x, 0, z).applyMatrix4(PW);
        return new THREE.Vector3(w.x, this.groundAt(w.x, w.z), w.z).applyMatrix4(PI).y;
      };
      const q = tg.quaternion.clone(), pos = tg.position.clone();
      const P = new Array(pts.length);
      const tmpQ = new THREE.Quaternion();
      // Nòng dài & nặng chĩa dốc lên trời (tháp dựng đứng trên mặt sau / mặt hông) hoặc chống xuống đất: về tĩnh học
      // vẫn "đứng được" nhưng đà rơi + nòng nặng làm khối tháp đổ ngả về phía nòng -> nòng nằm xuống đất.
      // Xoay tháp quanh trục ngang vuông góc nòng cho nòng gần nằm ngang rồi tìm thế nằm yên lại
      const muzzle = pts.length >= 2 && u.barrelPivot ? pts[pts.length - 2] : null;
      const barrelSteep = () => {
        if (!muzzle) return null;
        const bd = muzzle.clone().sub(u.barrelPivot.position).applyQuaternion(q);
        const L = bd.length();
        return L > 4 && Math.abs(bd.y) / L > 0.5 ? bd.divideScalar(L) : null;
      };
      for (let pass = 0; pass < 2; pass++) {
      if (pass === 1) {
        const f = barrelSteep();
        if (!f) break;
        const hz = Math.hypot(f.x, f.z) > 0.05 ? new THREE.Vector3(f.x, 0, f.z).normalize() : new THREE.Vector3(Math.cos(Math.random() * 6.28), 0, Math.sin(Math.random() * 6.28));
        const axis = new THREE.Vector3().crossVectors(f, hz);
        if (axis.lengthSq() < 1e-6) break;
        q.premultiply(tmpQ.setFromAxisAngle(axis.normalize(), Math.acos(Math.max(-1, Math.min(1, f.dot(hz)))) - rand(0.04, 0.16)));
        // khối tháp đổ về phía nòng: trọng tâm dịch theo
        pos.x += hz.x * rand(3, 6); pos.z += hz.z * rand(3, 6);
      }
      for (let it = 0; it < 140; it++) {
        // Vị trí các điểm & độ ngập dưới đất
        let minD = Infinity;
        for (let i = 0; i < pts.length; i++) {
          const w = pts[i].clone().applyQuaternion(q).add(pos);
          w.d = w.y - groundLocal(w.x, w.z);
          P[i] = w;
          if (w.d < minD) minD = w.d;
        }
        pos.y -= minD; for (const w of P) { w.y -= minD; w.d -= minD; }
        const C = com.clone().applyQuaternion(q).add(pos);
        const contacts = P.filter(w => w.d < 0.35);
        if (contacts.length >= 3) {
          // trọng tâm có nằm trong bao lồi các điểm tựa (mặt phẳng ngang) không
          const hull = convexHull2D(contacts);
          const edge = hull.length >= 3 ? outsideEdge(hull, C.x, C.z) : null;
          if (hull.length >= 3 && !edge) break;
          if (edge) { rotateAbout(edge[0], edge[1]); continue; }
        }
        if (contacts.length >= 2) {
          // lật quanh đường nối 2 điểm tựa xa nhau nhất
          let a = contacts[0], bb = contacts[1], best = -1;
          for (let i = 0; i < contacts.length; i++) for (let j = i + 1; j < contacts.length; j++) {
            const d = Math.hypot(contacts[i].x - contacts[j].x, contacts[i].z - contacts[j].z);
            if (d > best) { best = d; a = contacts[i]; bb = contacts[j]; }
          }
          // 2 điểm tựa trùng nhau (vd. miệng nòng) -> coi như tựa 1 điểm, tránh trục quay độ dài 0 làm méo quaternion
          rotateAbout(a, best > 0.05 ? bb : null);
        } else {
          const c0 = contacts[0];
          rotateAbout(c0, null);
        }
      }
      }
      // bước lật cuối có thể ấn mép tháp xuống đất: nâng lại cho điểm thấp nhất chỉ lún nhẹ (như lúc đặt độ cao)
      {
        let minD = Infinity;
        for (let i = 0; i < pts.length; i++) {
          const w = pts[i].clone().applyQuaternion(q).add(pos);
          minD = Math.min(minD, w.y - groundLocal(w.x, w.z));
        }
        if (isFinite(minD)) pos.y -= minD + 0.12;
      }
      tg.quaternion.copy(q);
      tg.position.copy(pos);
      tg.updateMatrixWorld(true);

      function rotateAbout(a, bb) {
        const C = com.clone().applyQuaternion(q).add(pos);
        let axis;
        if (bb) {
          axis = new THREE.Vector3(bb.x - a.x, bb.y - a.y, bb.z - a.z).normalize();
        } else {
          const h = new THREE.Vector3(C.x - a.x, 0, C.z - a.z);
          if (h.lengthSq() < 1e-6) h.set(1, 0, 0);
          axis = new THREE.Vector3(0, -1, 0).cross(h).normalize().negate();
        }
        // chọn chiều quay làm trọng tâm hạ xuống
        const r = new THREE.Vector3(C.x - a.x, C.y - a.y, C.z - a.z);
        const step = 0.05;
        const test = r.clone().applyQuaternion(tmpQ.setFromAxisAngle(axis, step));
        const sign = test.y < r.y ? 1 : -1;
        tmpQ.setFromAxisAngle(axis, step * sign);
        const piv = new THREE.Vector3(a.x, a.y, a.z);
        pos.sub(piv).applyQuaternion(tmpQ).add(piv);
        q.premultiply(tmpQ).normalize();
      }
      function convexHull2D(list) {
        const pts2 = list.map(w => [w.x, w.z]).sort((m, n) => m[0] - n[0] || m[1] - n[1]);
        const cross = (o, a2, b2) => (a2[0] - o[0]) * (b2[1] - o[1]) - (a2[1] - o[1]) * (b2[0] - o[0]);
        const lower = [], upper = [];
        for (const p2 of pts2) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p2) <= 0) lower.pop(); lower.push(p2); }
        for (let i = pts2.length - 1; i >= 0; i--) { const p2 = pts2[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p2) <= 0) upper.pop(); upper.push(p2); }
        upper.pop(); lower.pop();
        const hull = lower.concat(upper);
        return hull.map(h => list.find(w => w.x === h[0] && w.z === h[1]));
      }
      function outsideEdge(hull, x, z) {
        for (let i = 0; i < hull.length; i++) {
          const a2 = hull[i], b2 = hull[(i + 1) % hull.length];
          const cr = (b2.x - a2.x) * (z - a2.z) - (b2.z - a2.z) * (x - a2.x);
          if (cr < -0.05) return [a2, b2];
        }
        return null;
      }
    },

    restoreVehicle(u) {
      if (typeof VehicleDamage !== 'undefined' && VehicleDamage.reset) VehicleDamage.reset(u);
      u.fxDestroyed = false;
      u.fxWreck = null;
      u._killSource = null;
      u.group.traverse(o => {
        if (!o.isMesh) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach(m => {
          if (m && m.userData && m.userData.fxOrigColor) {
            m.color.copy(m.userData.fxOrigColor);
            delete m.userData.fxOrigColor;
          }
        });
      });
      const t = u.turretGroup;
      if (t && t.userData.fxParent) {
        t.userData.fxParent.add(t);
        delete t.userData.fxParent;
      }
      if (t && t.userData.fxBasePos) {
        t.position.copy(t.userData.fxBasePos);
        t.rotation.order = 'XYZ';
        t.rotation.copy(t.userData.fxBaseRot);
        delete t.userData.fxBasePos;
        delete t.userData.fxBaseRot;
      }
      if (u.barrelPivot && u.barrelPivot.userData.fxBaseRot) {
        u.barrelPivot.rotation.copy(u.barrelPivot.userData.fxBaseRot);
        delete u.barrelPivot.userData.fxBaseRot;
      }
      if (u.barrelPivot) delete u.barrelPivot.userData.minElev;
      for (let i = this.surfaceMarks.length - 1; i >= 0; i--) {
        if (this.surfaceMarks[i].unit === u) this.removeSurfaceMark(i);
      }
    },

    updateVehicles(dt) {
      for (let i = this.vehicles.length - 1; i >= 0; i--) {
        const u = this.vehicles[i];
        if (!u.group || !u.group.parent) { this.vehicles.splice(i, 1); continue; }
        const type = u.tankType || 'ALL_ROUNDER';
        const ratio = u.maxHp ? Math.max(0, u.hp / u.maxHp) : 1;

        // Xe đã được hồi sinh -> khôi phục
        if (u.fxDestroyed && !u.isDead) { this.restoreVehicle(u); }
        if (!u.isDead && ratio >= 0.999 && !(u.dmg && u.dmg.engine)) { u.damageFxByEngine = false; this.vehicles.splice(i, 1); continue; }
        if (u.isDead && !u.fxDestroyed) this.onVehicleDestroyed(u, u.lastHitDir || null, u.lastHitPoint || null);

        const eng = this.vehicleLocalToWorld(u, ENGINE_POINT[type] || ENGINE_POINT.ALL_ROUNDER);
        u.fxEmit = (u.fxEmit || 0) + dt;

        if (u.isDead && u.fxWreck) {
          const W = u.fxWreck;
          W.t += dt;
          // Tháp pháo bay lên, lộn vòng rồi rơi theo vật lý góc đạn thực tế
          if (W.turret && !W.turret.landed && u.turretGroup) {
            const tg = u.turretGroup, T = W.turret;
            T.v.y -= 140 * dt;
            tg.position.addScaledVector(T.v, dt);
            tg.rotation.x += T.w.x * dt;
            tg.rotation.y += T.w.y * dt;
            tg.rotation.z += T.w.z * dt;

            // Tính vị trí thế giới của tháp pháo
            const turretWPos = new THREE.Vector3();
            tg.getWorldPosition(turretWPos);

            // Điểm thấp nhất của tháp / nòng chạm mặt đất (theo địa hình thật, hoặc nóc thân xác xe) -> chốt tư thế
            // tiếp đất hợp lệ. Đặt đúng chỗ chạm, không để tháp đã ngập xuống dốc / còn lơ lửng
            // vừa bật khỏi vòng bi (~0.15 s đầu) đế tháp còn quệt mép nóc thân: chưa xét va nóc thân
            T.age = (T.age || 0) + dt;
            const clear = this.turretFloorClear(tg, T, tg.quaternion, tg.position, T.age < 0.15);
            if (clear < 0 && T.v.y >= 0) {
              // còn đang bay lên mà nòng lộn vòng đập xuống đất / nóc thân: nảy ra (đảo chiều xoay, mất bớt đà ngang)
              tg.position.y -= clear;
              T.w.multiplyScalar(-0.45);
              T.v.x *= 0.7; T.v.z *= 0.7;
            } else if (clear <= 0) {
              tg.position.y -= clear;
              T.landed = true;
              const q0 = tg.quaternion.clone(), p0 = tg.position.clone();
              this.placeLandedTurret(u, tg, T);
              // Khối thép đập xuống móp đất đúng chỗ nằm cuối -> đặt lại để tháp tựa vào lòng hố (không lơ lửng trên hố)
              tg.updateMatrixWorld(true);
              const restW = tg.getWorldPosition(new THREE.Vector3());
              if (this.addCrater && Math.hypot(restW.x - u.group.position.x, restW.z - u.group.position.z) >= 12) {
                this.addCrater(restW.x, restW.z, 5.5, this.palette('GROUND'), 0.35, null, 'DENT');
                this.placeLandedTurret(u, tg, T);
              }
              // Tư thế cuối (tựa vững >= 3 điểm) -> diễn hoạt: lăn / trượt / ngả dần về tư thế đó (lâu hơn nếu bị đẩy xa)
              const slide = Math.hypot(tg.position.x - p0.x, tg.position.z - p0.z);
              T.settle = { q0, p0, q1: tg.quaternion.clone(), p1: tg.position.clone(), t: 0, dur: 0.55 + Math.min(1.2, slide / 70) };
              tg.quaternion.copy(q0); tg.position.copy(p0);
              tg.getWorldPosition(turretWPos);
              const landGy = this.groundAt(turretWPos.x, turretWPos.z);

              if (window.soundEngine && window.soundEngine.secondaryAt) window.soundEngine.secondaryAt('turretLand', turretWPos);
              // Sinh sóng chấn động bụi đất và mảnh đá văng khi khối thép đập xuống
              this.spawnDust(turretWPos.x, landGy, turretWPos.z, 1.4, PROFILES.HE, this.palette('GROUND'), false);
              this.spawnSparks(turretWPos.x, landGy + 1, turretWPos.z, 1.2, { sparks: 1.5 }, true, 0, 0);

              // Nếu cắm nòng, sinh thêm bụi đất chấn động tại điểm miệng nòng cắm xuống cát
              if (T.scenario === 'LAWN_DART' && u.barrelPivot) {
                const muzzleLocal = (u.muzzleTipLocal ? u.muzzleTipLocal.clone() : new THREE.Vector3(0, 0, -55));
                if (u.barrelGroup && u.barrelGroup.parent === u.barrelPivot) {
                  muzzleLocal.applyEuler(u.barrelGroup.rotation).add(u.barrelGroup.position);
                }
                muzzleLocal.applyEuler(u.barrelPivot.rotation).add(u.barrelPivot.position);
                muzzleLocal.applyEuler(tg.rotation).add(tg.position);
                const muzzleWPos = muzzleLocal.applyMatrix4(tg.parent.matrixWorld);
                const mGy = this.groundAt(muzzleWPos.x, muzzleWPos.z);
                this.spawnDust(muzzleWPos.x, mGy, muzzleWPos.z, 0.9, PROFILES.HE, this.palette('GROUND'), false);
                this.spawnSparks(muzzleWPos.x, mGy + 0.5, muzzleWPos.z, 0.8, { sparks: 1.0 }, true, 0, 0);
              }
            }
          }
          if (W.turret && W.turret.landed && W.turret.settle && W.turret.settle.t < 1 && u.turretGroup) {
            const S = W.turret.settle, tg = u.turretGroup;
            S.t = Math.min(1, S.t + dt / (S.dur || 0.55));
            const kr = S.t * S.t * (3 - 2 * S.t);                     // lật / ngả / trượt về thế nằm
            tg.position.lerpVectors(S.p0, S.p1, kr);
            tg.quaternion.copy(S.q0).slerp(S.q1, kr);
            // tư thế xen giữa không được ngập đất / xuyên thân xe: nâng lên vừa chạm (lăn qua mép thân thay vì cắt xuyên)
            if (S.t < 1) { const c = this.turretFloorClear(tg, W.turret, tg.quaternion, tg.position); if (c < 0) tg.position.y -= c; }
          }
          // Lửa lan tới kho đạn: kích nổ / xả áp TRỄ vài giây sau khi xe bị hạ
          if (!W.cookFired && W.t >= W.cookAt) {
            W.cookFired = true;
            if (W.K && W.K.delayed === 'vent') this.startVent(u);
            else this.detonateWreck(u, true);
          }
          // Hốc đạn sau tháp xả áp: luồng lửa phụt thẳng đứng từ nóc hậu tháp
          if (W.vent && W.t < W.vent.t0 + W.vent.dur) this.emitVent(u, W);
          // Kho đạn nổ dây chuyền: lửa phụt lên từ đúng khoang chứa đạn (tháp pháo nếu còn trên xe / khoang hở khi tháp đã văng)
          let ring = this.ammoPoint(u);
          // Xe trinh sát không có kho đạn pháo: chỉ nổ một lần (bình nhiên liệu / thùng đạn súng máy)
          // Kho đạn cháy nổ: xe tăng / pháo tự hành nổ đạn pháo lớn (ít, chậm, uy lực);
          // xe 6 nòng (đạn 30mm) & xe trinh sát (đạn 12.7mm) nổ lụp bụp nhỏ nhưng dồn dập, kéo dài
          // Xả áp: đạn trong hốc nổ lách tách liên hồi nhưng lửa / mảnh phụt lên qua tấm xả áp, không nổ tung xe
          const small = type === 'GATLING' || type === 'SCOUT';
          const venting = !!(W.vent && !W.detonated);
          const maxBangs = type === 'SCOUT' ? 22 : type === 'GATLING' ? 60 : venting ? 14 : 8;
          const cookDur = small ? W.cookOff + 4 : venting ? W.vent.dur : W.cookOff;
          if (venting) ring = this.ventPoint(u, W, Math.random() < 0.5 ? 0 : 1);
          if (W.cookStart !== undefined && W.t > W.cookStart + 0.3 && W.t < W.cookStart + cookDur && (W.bangs || 0) < maxBangs) {
            W.nextBang -= dt;
            while (W.nextBang <= 0 && (W.bangs || 0) < maxBangs) {
              W.bangs = (W.bangs || 0) + 1;
              // nổ thành tràng: lúc dồn dập, lúc ngắt quãng
              W.nextBang += small ? (Math.random() < 0.7 ? rand(0.03, 0.09) : rand(0.2, 0.55)) : venting ? rand(0.12, 0.5) : rand(0.25, 0.9);
              if (CAB_ONLY[type]) { this.cabCookBang(u, W, CAB_OPENINGS[type]); continue; }
              const jx = venting ? 0 : rand(-3, 3), jz = venting ? 0 : rand(-3, 3);
              const n = small ? 3 : venting ? 5 : 10;
              for (let k = 0; k < n; k++) {
                this.fire.add({
                  x: ring.x + jx + rand(-1, 1), y: ring.y + 2, z: ring.z + jz + rand(-1, 1),
                  vx: rand(-14, 14) * (small ? 1.6 : 1), vy: small ? rand(20, 70) : rand(70, 150), vz: rand(-14, 14) * (small ? 1.6 : 1),
                  size: small ? rand(1.5, 3) : rand(5, 9), grow: small ? 3 : 8, drag: 2.5, grav: -4,
                  life: small ? rand(0.12, 0.25) : rand(0.3, 0.6), alpha: 1, fadeIn: 0.01, c0: [1, 0.88, 0.55], c1: [0.8, 0.3, 0.06], cell: 1, floor: false
                });
              }
              this.spawnSparks(ring.x + jx, ring.y + 2, ring.z + jz, small ? 0.45 : 1, { sparks: small ? 0.8 : 1.2 }, true, 0, 0);
              if (!small) {
                // đạn lớn bắt lửa: phụt lửa + văng mảnh cháy, lóe sáng
                this.launchFrags(W, new THREE.Vector3(ring.x + jx, ring.y + 2, ring.z + jz), venting ? 1 : 2, venting ? 0.5 : 0.8, venting);
                if (W.bangs % 2) this.addLight(ring.x, ring.y + 5, ring.z, 0.8, 0.16);
              } else if (this.streaks) {
                // đạn 30 / 12.7 nổ: đầu đạn, vỏ đạn bắn tóe thành vệt sáng
                for (let q = 0; q < 3; q++) {
                  const a = Math.random() * Math.PI * 2, sp = rand(70, 150);
                  this.streaks.add({ x: ring.x + jx, y: ring.y + 2, z: ring.z + jz, vx: Math.cos(a) * sp * 0.6, vy: rand(40, 140), vz: Math.sin(a) * sp * 0.6, drag: 1.4, grav: GRAV, life: rand(0.25, 0.5), tail: rand(0.03, 0.05) });
                }
              }
              if (window.soundEngine && window.soundEngine.secondaryAt) window.soundEngine.secondaryAt(small ? 'cookoffSmall' : 'cookoff', ring, small ? (type === 'GATLING' ? 0.75 : 0.55) : 0.9);
              else if (window.soundEngine && this.onSound) this.onSound(ring, 'DIRECT_HIT', 'CLUSTER_SUBMUNITION');
            }
          }
          // Xác xe cháy: lửa bén dần theo kiểu chết (xuyên khoang kíp lái: lửa từ nắp / vòng tháp; trúng máy: lửa
          // khoang máy rồi mới lan; nổ kho đạn: cháy dữ dội ngay) + cột khói. Lửa còn yếu thì khói xám, cháy to thì khói đen dầu
          const fl = this.wreckFireLevels(u, W);
          const burnAge = W.t - (W.detonated ? W.cookStart : 0);
          const burn = Math.max(0.3, 1 - burnAge / 28);
          // Sơn cháy sém dần (nhanh hơn khi lửa to)
          W.charAcc = (W.charAcc || 0) + dt;
          if (W.charAcc >= 0.2 && W.char < (W.charMax || 1) - 0.004) {
            const heat = 0.35 + 0.65 * Math.max(fl.ring, fl.eng);
            W.char += ((W.charMax || 1) - W.char) * (1 - Math.exp(-W.charAcc * heat / Math.max(1, W.charT)));
            W.charAcc = 0;
            this.applyChar(u);
          }
          // Mất áp thủy lực: nòng gục dần xuống tới góc hạ tối đa của giá pháo (tháp còn trên xe) — dấu hiệu dễ nhận
          // nhất của xe tăng đã chết; guardBarrel chặn không cho nòng cắm xuống đất / vào nóc thân
          const droop = { ALL_ROUNDER: -0.13, GATLING: -0.1 }[type];
          if (droop !== undefined && !W.turret && u.barrelPivot && W.t > 0.8) {
            const bp = u.barrelPivot;
            // không gục quá mức làm nòng cắm xuống đất / vào nóc thân (dốc phía trước, xác lún)
            if (!W.droopGuard) { W.droopGuard = true; if (typeof VehicleDamage !== 'undefined' && VehicleDamage.guardBarrel) VehicleDamage.guardBarrel(u); }
            const target = Math.max(droop, bp.userData.minElev !== undefined ? bp.userData.minElev : -Infinity);
            if (Math.abs(bp.rotation.x - target) > 0.002) {
              if (!bp.userData.fxBaseRot) bp.userData.fxBaseRot = bp.rotation.clone();
              bp.rotation.x += (target - bp.rotation.x) * Math.min(1, dt * 0.9);
            }
          }
          // Tiếng lửa cháy rừng rực trên xác xe: nguồn âm liên tục (báo 2 lần/giây), to dần khi lửa bén, nhỏ dần khi lửa tàn, tắt sau ~45 s
          const fireMax = Math.max(fl.ring, fl.eng);
          W.fireSnd = (W.fireSnd || 0) - dt;
          if (W.fireSnd <= 0 && burnAge < 45 && fireMax > 0.08 && window.soundEngine) {
            W.fireSnd = 0.5;
            const kf = (0.5 + burn * 0.9) * Math.min(1, 0.25 + fireMax);
            const fp = fl.eng > fl.ring ? eng : ring;
            if (window.soundEngine.fireSource) window.soundEngine.fireSource(u, fp, kf);
            else if (window.soundEngine.secondaryAt) window.soundEngine.secondaryAt('vehFire', fp, kf);
          }
          const fireScale = { ALL_ROUNDER: 1, ARTILLERY: 1, GATLING: 0.9, SCOUT: 0.75 }[type] || 1;
          const ringPos = this.vehicleLocalToWorld(u, TURRET_RING[type] || TURRET_RING.ALL_ROUNDER);
          // Lửa bùng "phừng" từng đợt (dầu / đạn / cao su bén lửa, gió thổi): lưỡi lửa vọt cao + khói đen cuộn + tiếng phừng
          W.flareT = (W.flareT === undefined ? rand(0.6, 1.6) : W.flareT) - dt;
          if (W.flareT <= 0) {
            W.flareT = rand(0.9, 2.6);
            const flareAt = CAB_CENTER[type] ? this.vehicleLocalToWorld(u, CAB_CENTER[type]) : ringPos;
            if (fireMax > 0.3) this.wreckFlare(fl.eng > fl.ring ? eng : flareAt, fireMax * burn * fireScale, CAB_CENTER[type] ? 0.55 : 1);
          }
          // Mảnh cháy văng ra từ vụ nổ: bay vòng cung kéo vệt khói, rơi xuống đất cháy âm ỉ
          if (W.frags && W.frags.length) this.updateFrags(W, dt);
          // Sau kích nổ: thuốc phóng còn lại cháy phụt thành cột lửa khỏi khoang (vòng tháp hở / nắp tháp)
          if (W.torch && W.t < W.torch.t0 + W.torch.dur && W.t - (W.torch.lastT || -1) >= 0.033) {
            const a = (W.t - W.torch.t0) / W.torch.dur;
            W.torch.lastT = W.t;
            this.emitJet(this.ammoPoint(u), (a < 0.6 ? 1 : 1 - (a - 0.6) / 0.4) * (0.8 + 0.4 * Math.random()), W.torch.scale, W.t + (W.torch.ph || 0));
          }
          // Lỗ nắp tháp / nắp lái bị thổi bật: lửa phụt ra theo cột lửa chính rồi còn khói đen tuôn từ lỗ nắp
          if (typeof VehicleDamage !== 'undefined' && VehicleDamage.hatchHoles && W.t - (W.hatchT || -1) >= 0.05) {
            W.hatchT = W.t;
            const holes = VehicleDamage.hatchHoles(u);
            if (holes.length) {
              const age = W.t - (W.detonated ? W.cookStart : 0);
              const jetDur = W.torch ? W.torch.dur + 1.5 : 0;
              for (const h of holes) {
                if (W.detonated && age < jetDur) this.emitJet(h.p, (1 - age / jetDur) * (0.7 + 0.4 * Math.random()), 0.42, W.t * 1.3 + h.p.x);
                else if (Math.random() < (W.detonated ? 0.5 : 0.25) * Math.max(0.15, 1 - W.t / 40)) {
                  // khói từ khoang qua lỗ nắp (kíp lái mở nắp thoát: khói xám nhạt, sau nổ: khói đen dầu)
                  const g = W.detonated ? rand(0.05, 0.1) : rand(0.18, 0.28);
                  this.smoke.add({
                    x: h.p.x + rand(-0.8, 0.8), y: h.p.y + 1.5, z: h.p.z + rand(-0.8, 0.8), vx: rand(-3, 3), vy: rand(18, 30), vz: rand(-3, 3),
                    size: rand(3.5, 5.5), grow: 6, drag: 0.8, grav: -4, life: rand(2.5, 4), alpha: W.detonated ? 0.7 : 0.45, fadeIn: 0.12,
                    c0: [g, g, g], c1: [g * 1.8, g * 1.75, g * 1.7], cell: 0, floor: false
                  });
                }
              }
            }
          }
          // Động cơ tên lửa chống tăng trong ống phóng bắt lửa: luồng lửa trắng phụt ngang vài giây kèm vệt khói
          if (W.motor && W.t < W.motor.t0 + W.motor.dur && W.t - (W.motor.lastT || -1) >= 0.033) {
            W.motor.lastT = W.t;
            this.emitMotor(u, W);
          }
          if (u.fxEmit > 0.05) {
            u.fxEmit = 0;
            const cab = CAB_OPENINGS[type];
            // xe cabin kín: lửa khoang người đi ra qua ô cửa (emitCabFire), không đặt nguồn lửa giữa nóc;
            // xe pháo: cabin lái cháy qua ô cửa, tháp pháo & khoang máy vẫn dùng nguồn lửa chung
            const srcs = CAB_ONLY[type] ? [] : [[eng, fl.eng], [ringPos, fl.ring]];
            if (cab) this.emitCabFire(u, W, cab, fl, burn);
            if (u.dmg && u.dmg.fires) for (const f of u.dmg.fires) srcs.push([this.vehicleLocalToWorld(u, [f.x, f.y, f.z]), cab ? 0.45 : 0.8]);
            for (const [src, lv] of srcs) {
              if (lv < 0.04) continue;
              if (lv > 0.12) {
                // Lưỡi lửa: gốc to, bốc nhanh lên nhờ khí nóng (grav âm = lực nổi), vuốt nhỏ dần ở ngọn -> cao 2-5 m;
                // nền than đỏ rực sát chỗ cháy. Lửa to (lv cao) thì liếm dày, nhiều lưỡi hơn
                const s0 = burn * (0.35 + 0.65 * lv) * fireScale;
                const nF = 1 + (Math.random() < lv ? 1 : 0) + (Math.random() < lv * 0.6 ? 1 : 0);
                for (let j = 0; j < nF; j++) {
                  this.fire.add({
                    x: src.x + rand(-4, 4) * (0.4 + lv), y: src.y + rand(0, 2), z: src.z + rand(-4, 4) * (0.4 + lv), vx: rand(-4, 4), vy: rand(26, 52) * (0.5 + 0.5 * lv), vz: rand(-4, 4),
                    size: rand(6, 11) * s0, grow: -4, drag: 1.1, grav: -14, life: rand(0.45, 0.85), alpha: 0.95, fadeIn: 0.04,
                    c0: [1, 0.74, 0.34], c1: [0.78, 0.2, 0.03], cell: 1, floor: false
                  });
                }
                if (Math.random() < 0.6) {
                  this.fire.add({
                    x: src.x + rand(-3, 3) * lv, y: src.y + 0.5, z: src.z + rand(-3, 3) * lv, vx: rand(-2, 2), vy: rand(4, 10), vz: rand(-2, 2),
                    size: rand(7, 10) * s0, grow: -2, life: rand(0.3, 0.5), alpha: 0.9, fadeIn: 0.03,
                    c0: [1, 0.55, 0.18], c1: [0.6, 0.12, 0.02], cell: 1, floor: false
                  });
                }
              }
              if (Math.random() < 0.45 + 0.55 * lv) {
                // khói: lửa nhỏ / âm ỉ -> xám nhạt; lửa dầu to -> đen đặc
                const g = lv > 0.5 ? rand(0.05, 0.1) : rand(0.16, 0.3) - lv * 0.18;
                this.smoke.add({
                  x: src.x + rand(-3, 3), y: src.y + 6, z: src.z + rand(-3, 3), vx: rand(-4, 4), vy: rand(18, 30) * (0.6 + 0.4 * lv), vz: rand(-4, 4),
                  size: rand(8, 12) * (0.55 + 0.45 * lv), grow: 9, drag: 0.5, grav: -4, life: rand(4, 6.5), alpha: 0.5 + 0.2 * lv, fadeIn: 0.2,
                  c0: [g, g, g], c1: [g * 2.4, g * 2.3, g * 2.2], cell: 0, floor: false
                });
              }
            }
          }
          continue;
        }

        // Đám cháy tại đúng chỗ trúng đạn (lỗ xuyên, bình xăng, kho đạn) — cháy bám theo xe
        if (!u.isDead && u.dmg && u.dmg.fires && u.dmg.fires.length && u.fxEmit > 0.045) {
          for (const f of u.dmg.fires) {
            const fp = this.vehicleLocalToWorld(u, [f.x, f.y, f.z]);
            const fade = Math.max(0.3, 1 - f.t / f.life) * f.k;
            this.fire.add({
              x: fp.x + rand(-1.5, 1.5), y: fp.y + 0.5, z: fp.z + rand(-1.5, 1.5), vx: rand(-2, 2), vy: rand(10, 20), vz: rand(-2, 2),
              size: rand(2.5, 5) * fade, grow: -1.5, life: rand(0.3, 0.55), alpha: 0.95, fadeIn: 0.03, c0: [1, 0.72, 0.3], c1: [0.8, 0.22, 0.04], cell: 1, floor: false
            });
            if (Math.random() < 0.6) {
              const g = rand(0.06, 0.12);
              this.smoke.add({ x: fp.x, y: fp.y + 3, z: fp.z, vx: rand(-3, 3), vy: rand(12, 22), vz: rand(-3, 3), size: rand(4, 7) * fade, grow: 7, drag: 0.6, grav: -3, life: rand(2.5, 4), alpha: 0.6, fadeIn: 0.15, c0: [g, g, g], c1: [g * 2.4, g * 2.3, g * 2.2], cell: 0, floor: false });
            }
          }
        }

        // Còn sống nhưng hư hại: khói khoang máy (hoặc động cơ trúng đạn), máu thấp thì bốc cháy
        const engDmg = (u.dmg && u.dmg.engine) || 0;
        if (ratio < 0.6 || engDmg) {
          const severity = Math.max((0.6 - ratio) / 0.6, engDmg >= 2 ? 0.75 : engDmg ? 0.4 : 0);
          const interval = 0.16 - severity * 0.1;
          if (u.fxEmit > interval) {
            u.fxEmit = 0;
            const g = 0.32 - severity * 0.24;
            this.smoke.add({
              x: eng.x + rand(-3, 3), y: eng.y + 1, z: eng.z + rand(-3, 3), vx: rand(-3, 3), vy: rand(12, 22), vz: rand(-3, 3),
              size: rand(4, 7) * (0.7 + severity), grow: 7, drag: 0.6, grav: -3, life: rand(2.5, 4), alpha: 0.6, fadeIn: 0.15,
              c0: [g, g, g], c1: [g * 1.8 + 0.1, g * 1.8 + 0.1, g * 1.75 + 0.1], cell: 0, floor: false
            });
            if (ratio < 0.3) {
              this.fire.add({
                x: eng.x + rand(-2.5, 2.5), y: eng.y + 0.5, z: eng.z + rand(-2.5, 2.5), vx: rand(-2, 2), vy: rand(10, 18), vz: rand(-2, 2),
                size: rand(3, 5.5), grow: -2, life: rand(0.35, 0.6), alpha: 0.95, fadeIn: 0.04,
                c0: [1, 0.75, 0.35], c1: [0.8, 0.25, 0.05], cell: 1, floor: false
              });
            }
          }
        }
      }
    }
  };

  // ---------------------------------------------------------------------------
  // VỆT MẢNH VĂNG: mảnh thép nóng bay siêu thanh vẽ thành vệt sáng kéo dài theo vận tốc
  // ---------------------------------------------------------------------------
  class StreakLayer {
    constructor(scene, max) {
      this.max = max;
      this.items = [];
      this.pos = new Float32Array(max * 6);
      this.col = new Float32Array(max * 6);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
      g.setDrawRange(0, 0);
      this.mesh = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      this.mesh.frustumCulled = false;
      this.mesh.renderOrder = 6;
      scene.add(this.mesh);
    }
    add(o) {
      if (this.items.length >= this.max) this.items.shift();
      o.t = 0;
      this.items.push(o);
    }
    update(dt, groundAt, onLand) {
      const L = this.items;
      let n = 0;
      for (let i = 0; i < L.length; i++) {
        const f = L[i];
        f.t += dt;
        if (f.t > f.life) continue;
        f.vy -= (f.grav || 120) * dt;
        const k = Math.exp(-(f.drag || 0.4) * dt);
        f.vx *= k; f.vy *= k; f.vz *= k;
        f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt;
        const gy = groundAt ? groundAt(f.x, f.z) : 0;
        if (f.y < gy) { if (onLand) onLand(f.x, gy, f.z); continue; }
        L[n++] = f;
      }
      L.length = n;
      for (let i = 0; i < n; i++) {
        const f = L[i];
        const tl = f.tail || 0.035;
        const heat = 1 - f.t / f.life;
        const o = i * 6;
        this.pos[o] = f.x; this.pos[o + 1] = f.y; this.pos[o + 2] = f.z;
        this.pos[o + 3] = f.x - f.vx * tl; this.pos[o + 4] = f.y - f.vy * tl; this.pos[o + 5] = f.z - f.vz * tl;
        // Đầu vệt trắng vàng nóng, đuôi cam đỏ mờ dần
        this.col[o] = 1; this.col[o + 1] = 0.85 * heat + 0.25; this.col[o + 2] = 0.5 * heat * heat;
        this.col[o + 3] = 0.7 * heat; this.col[o + 4] = 0.22 * heat; this.col[o + 5] = 0.02;
      }
      this.mesh.geometry.setDrawRange(0, n * 2);
      this.mesh.geometry.attributes.position.needsUpdate = true;
      this.mesh.geometry.attributes.color.needsUpdate = true;
    }
    clear() { this.items.length = 0; this.mesh.geometry.setDrawRange(0, 0); }
  }

  // ---------------------------------------------------------------------------
  // SÓNG XUNG KÍCH
  // - Mặt sóng thật lan nhanh hơn tốc độ âm thanh rồi chậm dần về ~343 m/s nhưng KHÔNG dừng lại (chỉ yếu dần).
  //   Thứ giãn ra rồi dừng là đám khí nổ, không phải sóng. Ở đây mặt sóng được làm chậm ~4-5 lần cho mắt kịp thấy
  //   (sóng thật quét qua 7 m chỉ trong ~20 ms, chưa tới 2 khung hình) nhưng giữ đúng dáng: nhanh lúc đầu,
  //   chậm dần về một tốc độ cố định rồi tắt dần khi vẫn đang lan.
  // - Không khí khô bị nén gần như vô hình: cái mắt thấy là cảnh phía sau bị KHÚC XẠ (méo như hơi nóng), dày nhất
  //   ở viền vỏ cầu. Vỏ cầu lấy ảnh khung hình đã vẽ rồi lệch toạ độ theo pháp tuyến. Máy yếu: vỏ mờ sáng viền.
  // - Hình cầu đầy đủ: phần chìm dưới đất / khuất sau tường bị chính đất, tường che (thử độ sâu) -> nổ chạm đất
  //   thấy nửa cầu, nổ trên tường thấy nửa cầu hướng ra ngoài mặt tường, trúng xe thấy gần cả cầu.
  // - Khói / bụi cũ chỉ bị thổi bạt khi mặt sóng quét tới (kể cả đoạn sóng đã mờ hẳn, tới bán kính đẩy pushR).
  // ---------------------------------------------------------------------------
  const SHOCK_VIS_SPEED = 700;   // tốc độ lan trung bình của phần nhìn thấy (đơn vị game/s, ~88 m/s: chậm ~4-5 lần)
  const SHOCK_TAIL_V = 0.6;      // tốc độ cuối / (R/dur): mặt sóng chậm dần về mức này rồi giữ nguyên, không dừng

  class ShockLayer {
    constructor(scene, pushLayer) {
      this.scene = scene;
      this.push = pushLayer || null;
      this.items = [];
      this.geo = new THREE.SphereGeometry(1, 36, 18);                                              // cầu đầy đủ
      this.capGeo = new THREE.SphereGeometry(1, 36, 12, 0, Math.PI * 2, 0, Math.PI * 0.55);        // nửa cầu (mặt nước không che)
      this.ringGeo = new THREE.RingGeometry(0.86, 1, 48);
      this.ringGeo.rotateX(-Math.PI / 2);
      // Uniform dùng chung mọi vỏ sóng: ảnh khung hình chụp giữa lúc vẽ + kích thước bộ đệm vẽ
      this.uScene = { value: null };
      this.uRes = { value: new THREE.Vector2(1, 1) };
      this.uUse = { value: 0 };
      this._sz = new THREE.Vector2();
      this._org = new THREE.Vector2(0, 0);
      this._capFrame = -1;
      this._capRenderer = null;
      this.noCopy = false;
      this._capture = (renderer) => this.capture(renderer);
    }

    // Có làm khúc xạ không: tắt ở mức đồ hoạ "Thấp" hoặc khi máy không chụp được khung hình
    wantRefraction() {
      if (this.noCopy) return false;
      const gm = typeof window !== 'undefined' ? window.GameMenu : null;
      const S = gm && gm.settings;
      return !(S && S.gfx === 'low');
    }

    // Gọi ngay trước khi vẽ vỏ sóng (vật trong suốt, sau mọi vật đặc): chép khung hình đang vẽ sang kết cấu,
    // mỗi khung một lần cho mọi vỏ sóng
    capture(renderer) {
      if (!this.uUse.value || this.noCopy) return;
      if (renderer.getRenderTarget && renderer.getRenderTarget() !== null) return;   // đang vẽ vào bộ đệm khác (bản đồ nhỏ...)
      const frame = renderer.info && renderer.info.render ? renderer.info.render.frame : -2;
      if (frame === this._capFrame && renderer === this._capRenderer) return;
      this._capFrame = frame; this._capRenderer = renderer;
      try {
        renderer.getDrawingBufferSize(this._sz);
        const w = Math.max(1, Math.floor(this._sz.x)), h = Math.max(1, Math.floor(this._sz.y));
        let tex = this.uScene.value;
        if (!tex || tex.image.width !== w || tex.image.height !== h) {
          if (tex) tex.dispose();
          // RGB: bộ đệm màn hình không có kênh alpha (alpha: false) -> chép RGBA sẽ lỗi
          tex = new THREE.DataTexture(null, w, h, THREE.RGBFormat);
          tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter;
          tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
          tex.generateMipmaps = false;
          tex.needsUpdate = true;   // cấp vùng nhớ GPU trước khi chép vào
          this.uScene.value = tex;
        }
        this.uRes.value.set(w, h);
        renderer.copyFramebufferToTexture(this._org, tex);
      } catch (e) {
        this.noCopy = true; this.uUse.value = 0;   // máy không hỗ trợ -> quay về vỏ mờ sáng viền
      }
    }

    mat() {
      return new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
        uniforms: {
          op: { value: 1 }, rad: { value: 1 }, tint: { value: new THREE.Color(0.86, 0.84, 0.8) },
          tScene: this.uScene, res: this.uRes, useScene: this.uUse
        },
        vertexShader: 'varying vec3 vN; varying vec3 vV; varying float vD; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vD = max(1.0, -mv.z); gl_Position = projectionMatrix * mv; }',
        fragmentShader: [
          'uniform float op; uniform float rad; uniform vec3 tint; uniform sampler2D tScene; uniform vec2 res; uniform float useScene;',
          'varying vec3 vN; varying vec3 vV; varying float vD;',
          'void main(){',
          '  float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));',
          '  if (useScene < 0.5) { gl_FragColor = vec4(tint, pow(f, 4.0) * op * 0.22); return; }',
          // Vỏ khí nén mỏng: tia nhìn đi dọc vỏ càng dài (sát viền) càng bị bẻ mạnh
          '  float rim = pow(f, 3.0);',
          // Độ lệch trên màn hình ~ cỡ góc nhìn của quả cầu (xa thì nhỏ), có trần để nổ sát mặt không méo quá đà
          '  float amp = min(0.018, 0.06 * rad / vD) * op;',
          '  vec2 uv = gl_FragCoord.xy / res;',
          '  vec2 off = normalize(vN.xy + 1e-5) * rim * amp; off.x *= res.y / res.x;',
          '  vec3 col = texture2D(tScene, clamp(uv - off, 0.001, 0.999)).rgb;',
          '  col += tint * rim * op * 0.05;',   // khí nén + bụi mịn làm sáng nhẹ viền
          '  gl_FragColor = vec4(col, smoothstep(0.0, 0.2, rim) * op);',
          '}'
        ].join('\n')
      });
    }

    /**
     * R: bán kính phần nhìn thấy (đơn vị game). opts.ground: cao độ mặt đất dưới tâm nổ; opts.pushR: bán kính
     * mặt sóng còn thổi bạt khói (mặc định 2,2R); opts.hemi: vẽ nửa cầu (mặt nước không che phần dưới);
     * opts.dur: thời gian phần nhìn thấy (mặc định theo R: bán kính lớn lan lâu hơn, như sóng thật)
     */
    add(x, y, z, R, opts = {}) {
      if (typeof opts === 'number') opts = { dur: opts };
      this.uUse.value = this.wantRefraction() ? 1 : 0;
      const dur = opts.dur || Math.max(0.06, R / SHOCK_VIS_SPEED);
      const m = new THREE.Mesh(opts.hemi ? this.capGeo : this.geo, this.mat());
      m.position.set(x, y, z);
      m.renderOrder = 7;
      m.scale.setScalar(0.1);
      m.onBeforeRender = this._capture;
      this.scene.add(m);
      // Vòng bụi mỏng sát đất nơi mặt sóng chạm đất (chỉ khi nổ đủ thấp)
      const gy = opts.ground !== undefined ? opts.ground : y;
      let rm = null;
      if (y - gy < R * 0.5) {
        rm = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: 0xf2e8d8, transparent: true, opacity: 0, depthWrite: false }));
        rm.position.set(x, gy + 0.4, z);
        rm.renderOrder = 7;
        rm.scale.setScalar(0.1);
        this.scene.add(rm);
      }
      this.items.push({ m, rm, x, y, z, t: 0, R, dur, h: Math.max(0, y - gy), front: 0, pushR: opts.pushR !== undefined ? opts.pushR : R * 2.2 });
    }

    // Bán kính mặt sóng theo p = t / dur: nhanh lúc đầu, chậm dần về SHOCK_TAIL_V * R/dur rồi lan đều (không dừng)
    frontAt(R, p) {
      if (p <= 1) return R * ((1 - SHOCK_TAIL_V) * (1 - Math.pow(1 - p, 3)) + SHOCK_TAIL_V * p);
      return R * (1 + SHOCK_TAIL_V * (p - 1));
    }

    removeItem(i) {
      const it = this.items[i];
      if (it.m) { this.scene.remove(it.m); it.m.material.dispose(); }
      if (it.rm) { this.scene.remove(it.rm); it.rm.material.dispose(); }
      this.items.splice(i, 1);
    }

    update(dt) {
      for (let i = this.items.length - 1; i >= 0; i--) {
        const it = this.items[i];
        it.t += dt;
        const p = it.t / it.dur;
        const r = this.frontAt(it.R, p);
        // Thổi bạt khói / bụi có sẵn đúng lúc mặt sóng quét qua (bỏ qua khói của chính vụ nổ này)
        if (this.push && it.pushR > 0 && it.front < it.pushR) {
          this.push.blastPush(it.x, it.y, it.z, it.pushR, it.t + 0.2, it.front, Math.min(r, it.pushR));
        }
        it.front = r;
        if (p < 1) {
          const fade = Math.pow(1 - p, 1.5);   // yếu dần khi lan ra
          it.m.scale.setScalar(Math.max(0.1, r));
          it.m.material.uniforms.op.value = fade;
          it.m.material.uniforms.rad.value = r;
          if (it.rm) {
            // vòng giao giữa mặt cầu và mặt đất: rộng ra khi sóng lan xuống tới đất
            const rg = Math.sqrt(Math.max(0, r * r - it.h * it.h));
            it.rm.visible = rg > 0.5;
            it.rm.scale.setScalar(Math.max(0.1, rg * 1.02));
            it.rm.material.opacity = 0.14 * fade;
          }
        } else if (it.m) {
          // phần nhìn thấy đã tắt; mặt sóng vẫn lan tiếp (vô hình) để thổi khói xa
          this.scene.remove(it.m); it.m.material.dispose(); it.m = null;
          if (it.rm) { this.scene.remove(it.rm); it.rm.material.dispose(); it.rm = null; }
        }
        if (p >= 1 && (!this.push || it.pushR <= 0 || r >= it.pushR)) this.removeItem(i);
      }
    }
    clear() { while (this.items.length) this.removeItem(this.items.length - 1); }
  }

  class ExplosionFX {
    /**
     * terrainProvider: () => terrain (có getElevationAt, checkHorseshoeCollision, mapType)
     */
    constructor(scene, terrainProvider) {
      this.scene = scene;
      this.terrainOf = terrainProvider;
      this.smoke = new ParticleLayer(scene, 2600, false);
      // Khói tín hiệu của hòm tiếp tế (SupplyManager.emitSignalSmoke): bể riêng để khói trận đánh dày không đẩy mất cột khói vàng
      this.signal = new ParticleLayer(scene, 640, false);
      // Màn khói của ống phóng lựu đạn khói (Equipment.SmokeField): bể riêng — tường khói dày không đẩy mất khói trận đánh
      this.screen = new ParticleLayer(scene, 1800, false);
      this.fire = new ParticleLayer(scene, 1400, true);
      this.rocks = new RockLayer(scene, 360, 0x7d6a52);       // đất đá (màu theo bản đồ)
      this.hardRocks = new RockLayer(scene, 200, 0x6e6c68);   // bê tông / mảnh kim loại
      this.bits = new RockLayer(scene, 600, 0x7d6a52);        // vụn nhỏ do đạn súng (cục đất, vụn bê tông, dằm gỗ): bể riêng, không đẩy mất đất đá của đạn pháo
      this.glass = new GlassLayer(scene, 700);                // mảnh kính cửa sổ vỡ
      this.streaks = new StreakLayer(scene, 900);              // vệt mảnh thép nóng bay
      this.shocks = new ShockLayer(scene, this.smoke);         // sóng xung kích (khúc xạ + thổi bạt khói khi mặt sóng tới)
      this.ripples = [];                                       // gợn sóng mặt nước
      this.sabots = [];
      this.groundHoles = new GroundMarkLayer(scene, 1500);   // vết đạn trên đất khi bản đồ không có EnvDamage (phòng thử)
      this.bulletHoles = new BulletHoleLayer(scene, 1200);         // hố đạn 3D khoét vào mặt đất
      this.wallPits = { s: new PitLayer(scene, 'concretePit', 1500), he: new PitLayer(scene, 'concretePitHE', 800) };  // vết đạn tường / đá
      this.treePits = { wood: new PitLayer(scene, 'woodHole', 600), cactus: new PitLayer(scene, 'cactusHole', 200) };   // vết đạn thân cây
      this.wallHoles = new HoleLayer(scene, 300, 'wall');
      this.fragHoles = new HoleLayer(scene, 2400, 'frag');   // vết mảnh văng găm tường nhà (destructibles.js)
      this.craters = [];
      this.wallMarks = [];
      this.emitters = [];
      this.lights = [];
      this.maxCraters = 80;
      this.maxWallMarks = 40;
      this.surfaceMarks = [];
      this.vehicles = [];
      this.onSound = null;
      REGISTRY.set(scene, this);
      this.groundAt = (x, z) => {
        const t = this.terrainOf();
        return t && t.getElevationAt ? t.getElevationAt(x, z) : 0;
      };
      this._surfFn = (x, z) => this.surfaceAt(x, z);
    }

    palette(hitType) {
      if (hitType === 'WALL' || hitType === 'BUILDING' || hitType === 'BOULDER') return CONCRETE;
      const t = this.terrainOf();
      return PALETTES[(t && t.mapType) || 'DESERT'] || PALETTES.DESERT;
    }

    /**
     * Vật liệu mặt đất ĐÚNG tại điểm nổ (không chỉ theo bản đồ): màu đất / bụi văng, lượng bụi (dustK), bụi lơ lửng lâu
     * bao nhiêu (linger), khói pha màu bụi mặt đất bao nhiêu (smokeK), có bén lửa cháy lây lất không (fire), ướt (wet).
     * Đạn nổ trên cát khô: mây bụi vàng nhạt lớn, lơ lửng lâu; đất cỏ: cột đất nâu sẫm; bùn ven sông: bùn đen văng, ít bụi;
     * đường nhựa: mảnh nhựa đen + bụi xám; sườn đá: đá vụn & bụi đá xám; bê tông: bụi xi măng sáng.
     */
    /**
     * Kính một ô cửa vỡ: (x, y, z) tâm ô cửa, (nx, nz) pháp tuyến mặt ngoài tường. o: { n số mảnh, w / h cỡ ô cửa,
     * out: tỉ lệ mảnh văng ra ngoài (nổ ngoài nhà: sóng nổ thổi phần lớn kính VÀO trong phòng; nổ trong phòng: ra ngoài),
     * speed: hệ số sức đẩy, floor: độ cao sàn phòng (mảnh bay vào trong nằm lại trên sàn) }
     */
    glassBurst(x, y, z, nx, nz, o = {}) {
      const n = o.n || 12, w = o.w || 6, h = o.h || 6, out = o.out !== undefined ? o.out : 0.3, sp = o.speed || 1;
      const ax = -nz, az = nx;
      for (let i = 0; i < n; i++) {
        const a = rand(-0.5, 0.5) * w, b = rand(-0.5, 0.5) * h;
        const outward = Math.random() < out, sg = outward ? 1 : -1;
        // ~1/4 số mảnh chỉ rời khung rơi xuống ngay dưới cửa, còn lại bị sóng nổ đẩy đi
        const drop = Math.random() < 0.25, v = drop ? rand(1, 6) : rand(18, 60) * sp;
        this.glass.add({
          x: x + ax * a + nx * sg * 0.4, y: y + b, z: z + az * a + nz * sg * 0.4,
          vx: nx * sg * v + ax * rand(-0.35, 0.35) * v, vy: rand(-0.1, 0.35) * v, vz: nz * sg * v + az * rand(-0.35, 0.35) * v,
          size: rand(0.25, 0.95) * (Math.random() < 0.15 ? 1.8 : 1), floor: outward ? undefined : o.floor
        });
      }
    }
    surfacePalette(x, z, hitType) {
      const base = this.palette(hitType);
      const t = this.terrainOf();
      const mk = (o) => Object.assign({ dustK: 1, smokeK: 0.55, linger: 1, fire: 1, wet: false }, o);
      // tường / nhà / boong-ke / tảng đá bê tông không có gì bén lửa: không để lại lửa cháy âm ỉ dưới chân tường
      // (trước đây mặc định fire = 1 như cỏ khô -> HE trúng tường gần như lần nào cũng để lại vài đám lửa trên cát)
      if (hitType === 'WALL' || hitType === 'BUILDING' || hitType === 'BOULDER') return mk(Object.assign({}, base, { fire: 0.04 }));
      if (!t || hitType !== 'GROUND') return mk(base);
      const sc = (c, k) => [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)];
      const SS = t.strongholdSet;
      if (SS && SS.surfaceInfo && SS.surfaceInfo(x, z)) return mk(Object.assign({}, CONCRETE, { dustK: 0.9, smokeK: 0.6, fire: 0.05, mat: 'hard' }));
      const road = t.map && t.map.roadAt ? t.map.roadAt(x, z) : null;
      if (road && road.kind === 'asphalt') {
        return mk({ soil: [0.2, 0.2, 0.21], dark: [0.07, 0.07, 0.075], dust: [0.52, 0.51, 0.49], rock: [0.17, 0.17, 0.18], dustK: 0.7, smokeK: 0.45, fire: 0.08, mat: 'asphalt' });
      }
      const hasWater = !!(t.map && (t.map.river || (t.map.lakes && t.map.lakes.length)));
      if (hasWater && t.groundAtRaw && t.groundAtRaw(x, z) < 2.6) {
        // bãi bùn sát mép nước: bùn ướt sẫm văng thành cục, gần như không có mây bụi, không bén lửa
        return mk({ soil: sc(base.soil, 0.62), dark: sc(base.dark, 0.7), dust: sc(base.dust, 0.72), rock: sc(base.rock, 0.8), dustK: 0.35, smokeK: 0.4, linger: 0.4, fire: 0.03, wet: true, mat: 'mud' });
      }
      const G = (px, pz) => t.getElevationAt(px, pz), e = 6;
      const slope = Math.hypot(G(x + e, z) - G(x - e, z), G(x, z + e) - G(x, z - e)) / (2 * e);
      if (slope > 0.45) {
        // sườn đá: đá vụn & bụi đá xám, ít đất
        return mk({ soil: sc(base.rock, 0.82), dark: sc(base.rock, 0.42), dust: sc(base.rock, 1.35), rock: base.rock, dustK: 0.8, smokeK: 0.5, fire: 0.08, mat: 'rock' });
      }
      if (road) return mk({ soil: sc(base.soil, 1.12), dark: sc(base.dark, 1.25), dust: sc(base.dust, 1.05), rock: base.rock, dustK: 1.25, smokeK: 0.65, fire: 0.2 });
      switch (t.mapType) {
        case 'DESERT':   // cát khô: cột cát vàng (không đen), mây bụi lớn bay lâu
          return mk({ soil: [0.62, 0.5, 0.35], dark: [0.42, 0.33, 0.22], dust: [0.78, 0.68, 0.52], rock: base.rock, dustK: 1.45, smokeK: 0.75, linger: 1.5, fire: 0.12, mat: 'sand' });
        case 'URBAN':    // sân bê tông / đất nện trong phố
          return mk({ soil: [0.42, 0.41, 0.39], dark: [0.15, 0.15, 0.15], dust: [0.68, 0.67, 0.64], rock: [0.5, 0.49, 0.47], dustK: 0.9, smokeK: 0.6, fire: 0.2 });
        case 'JUNGLE':   // đất mùn ẩm dưới tán rừng: cục đất sẫm, ít bụi
          return mk(Object.assign({}, base, { dustK: 0.6, smokeK: 0.45, linger: 0.7, fire: 0.12 }));
        case 'RIVER_LAKE':
          return mk(Object.assign({}, base, { dustK: 0.8, smokeK: 0.5, fire: 0.2 }));
        default:         // đồng cỏ cao nguyên: đất nâu, cỏ khô dễ bén lửa
          return mk(Object.assign({}, base, { dustK: 0.95, smokeK: 0.55, fire: 0.3 }));
      }
    }

    spawn(x, y, z, ammoType = 'NORMAL', hitType = 'GROUND', opts = {}) {
      const prof = PROFILES[ammoType] || PROFILES.NORMAL;
      const rp = this.palette('GROUND').rock;
      this.rocks.base.setRGB(rp[0], rp[1], rp[2]);
      const heavy = opts.heavy ? 1.65 : 1.0;
      const s = prof.size * heavy;
      const ground = this.groundAt(x, z);
      const isWall = hitType === 'WALL' || hitType === 'BUILDING' || hitType === 'BOULDER';
      const isVehicle = hitType === 'DIRECT_HIT';
      const isAir = hitType === 'AIRBURST';
      const py = Math.max(y, ground + 0.5);
      const pal = this.surfacePalette(x, z, hitType);
      const precise = !!opts.normal;
      const wallInfo = isWall ? (precise ? { nx: opts.normal.x, nz: opts.normal.z } : this.findWallNormal(x, y, z)) : null;
      // Trúng tường / xe: hiệu ứng bật ngược ra phía ngoài bề mặt
      const nx = precise && (isWall || isVehicle) ? opts.normal.x : (wallInfo ? wallInfo.nx : 0);
      const nz = precise && (isWall || isVehicle) ? opts.normal.z : (wallInfo ? wallInfo.nz : 0);

      // Hướng bay của đạn (3D) cho các kiểu nổ có hướng
      let dx = 0, dz = -1, dy = -0.7;
      let hasDir = false;
      if (opts.dir && (opts.dir.x !== undefined || opts.dir.y !== undefined || opts.dir.z !== undefined)) {
        const lx = opts.dir.x || 0;
        const ly = opts.dir.y !== undefined ? opts.dir.y : -0.7;
        const lz = opts.dir.z || 0;
        const len = Math.hypot(lx, ly, lz) || 1;
        dx = lx / len; dy = ly / len; dz = lz / len;
        hasDir = true;
      } else {
        const a = Math.random() * Math.PI * 2;
        dx = Math.cos(a) * 0.7; dy = -0.7; dz = Math.sin(a) * 0.7;
      }
      const dirVec = { x: dx, y: dy, z: dz, hasDir };
      // Bê tông cứ điểm / đá tảng: vết đạn tích tụ do EnvDamage vẽ (đồng bộ ENV_HIT) -> không dán thêm vết tạm ở đây
      const tEnv = this.terrainOf();
      // Nhà: lỗ thủng / vành bóc lở / muội khói khoét thẳng vào hình tường (Destructibles) -> không dán vết tạm
      const envMarks = isWall && (hitType === 'BUILDING' || !!(tEnv && tEnv.envDamage && (hitType === 'BOULDER' || (tEnv.strongholdSet && tEnv.strongholdSet.covers(x, z, 8)))));

      if (isAir) {
        this.spawnAirburst(x, y, z, s, dirVec.hasDir ? dirVec : null);
        return;
      }
      if (hitType === 'AIR') {
        // Nổ giữa không trung (tên lửa hết tầm tự hủy): chớp, cầu lửa nhỏ, khói, tia lửa & mảnh văng —
        // không đất đá, không bụi mặt đất, không hố (trước đây đào hố ngay dưới đất dù quả nổ ở trên cao)
        this.spawnFlash(x, y, z, s, prof);
        this.spawnFireball(x, y, z, s, prof, 0, 0, dirVec, false);
        this.spawnSmokeColumn(x, y, z, s, prof, true, null);
        this.spawnSparks(x, y, z, s, prof, false, 0, 0);
        if (!prof.micro) this.spawnShrapnel(x, y, z, s, prof, opts, dirVec, false, false);
        return;
      }
      if (prof.kind === 'kinetic') {
        this.spawnKineticImpact(x, py, z, ground, s, prof, pal, dx, dz, isWall || isVehicle, nx, nz, isVehicle, dirVec);
        // đạn xuyên động năng găm đất: rãnh cày dài nông theo hướng bay (hệ hố cộng dồn, không thuốc nổ -> không muội)
        if (!isWall && !isVehicle && !opts.noCrater) this.addCrater(x, z, 4, pal, 0.6, dirVec, 'AP', opts);
        if (isWall && wallInfo && !precise && !envMarks) this.addWallMark(x, y, z, wallInfo, 7);
        return;
      }
      // Đạn nhỏ trúng tường / đá / thân cây / bao cát / xe (khi không dò được điểm chạm trên mô hình): hiệu ứng theo vật liệu
      if (prof.micro && (isWall || isVehicle || hitType === 'TREE' || hitType === 'SANDBAG')) {
        const D = new THREE.Vector3(dx, dy, dz);
        const big = ammoType !== 'SCOUT_BULLET';
        if (hitType === 'SANDBAG') {
          // bao cát: cát tóe ra tại chỗ trúng, không khoét hố xuống đất
          const sandPal = Object.assign({}, PALETTES.DESERT, { mat: 'sand', dustK: 1, linger: 1, fire: 0, wet: false });
          this.spawnBulletGroundImpact(x, y, z, ammoType, sandPal, dirVec, Object.assign({}, opts, { noHoles: true }), null, y);
          return;
        }
        if (hitType === 'TREE') {
          this.treeBulletHit(x, y, z, D, ammoType, opts);
          return;
        }
        let N;
        if (precise) N = new THREE.Vector3(opts.normal.x, opts.normal.y || 0, opts.normal.z);
        else if (wallInfo) N = new THREE.Vector3(wallInfo.nx, 0, wallInfo.nz);
        else N = D.clone().negate();
        if (N.lengthSq() < 1e-6) N.set(0, 1, 0);
        N.normalize();
        const P = new THREE.Vector3(x, y, z);
        const sk = isVehicle ? 'steel' : hitType === 'BUILDING' ? 'plaster' : hitType === 'BOULDER' ? 'rock' : 'concrete';
        this.spawnBulletSurfaceImpact(P, N, D, ammoType, sk, {});
        // vết đạn tường bê tông / đá (nhà & cứ điểm có hệ vết riêng khoét thẳng vào hình tường)
        if (isWall && !envMarks && !opts.noWallMark) (big ? this.wallPits.he : this.wallPits.s).add(P, N, big ? 3.4 : 2.3);
        return;
      }
      // Đạn nhỏ găm đất (12.7mm / 30mm): hiệu ứng riêng đúng cỡ đạn & vật liệu (không dùng bộ nổ pháo thu nhỏ)
      if (prof.micro && !isWall && !isVehicle) {
        this.spawnBulletGroundImpact(x, ground, z, ammoType, pal, dirVec, opts, tEnv, y);
        return;
      }
      if (prof.kind === 'heat') this.spawnHeatJet(x, py, z, s, dx, dz, nx, nz);
      if (prof.kind === 'incendiary') this.spawnIncendiarySplash(x, py, z, s);

      this.spawnFlash(x, py + 3 * s, z, s * (opts.flashK || 1), prof);
      // Đạn nổ phá chạm đất / tường: thuốc nổ cháy hết trong vài phần trăm giây -> chỉ chớp lửa ngắn, nhỏ; cái thấy rõ là cột
      // đất đá & mây bụi. Quả cầu lửa lớn chỉ khi trúng xe (nhiên liệu, đạn dược) hoặc đạn cháy / tên lửa
      const groundBurst = !isVehicle && (prof.kind === 'blast' || prof.kind === 'bomblet');
      if (prof.fire > 0.1 && prof.kind !== 'heat') this.spawnFireball(x, py, z, s, prof, nx, nz, dirVec, groundBurst);
      if (!isVehicle) this.spawnEjecta(x, py, z, s, prof, pal, isWall, nx, nz, dirVec);
      if (!isVehicle && !isWall && !prof.micro && (prof.kind === 'blast' || prof.kind === 'bomblet')) this.spawnSoilJets(x, py, z, s, prof, pal, dirVec);
      this.spawnDust(x, ground, z, s, prof, pal, isWall, dirVec);
      this.spawnSmokeColumn(x, py, z, s, prof, isVehicle || prof.kind === 'heat', pal);
      this.spawnSparks(x, py, z, s, prof, isVehicle || isWall || prof.kind === 'bomblet', nx, nz);

      // Hiệu ứng mảnh văng của vỏ đạn kim loại (cho đạn pháo, HE, CLUSTER, HEAT, v.v.)
      if (!prof.micro && prof.kind !== 'kinetic') {
        this.spawnShrapnel(x, py, z, s, prof, opts, dirVec, isWall, isVehicle, ammoType, nx, nz);
        // Sóng xung kích: vỏ khí nén giãn nở + vòng bụi bị thổi bạt sát mặt đất
        if (prof.kind === 'blast' || prof.kind === 'bomblet' || prof.kind === 'heat') {
          // Luật tỉ lệ nổ (Hopkinson-Cranz): cùng áp suất ở khoảng cách ~ khối thuốc nổ^(1/3)
          const W = (prof.charge || 1) * (opts.heavy ? 3 : 1);   // 155mm ~6,6 kg = 3 lần HE 120mm
          const R = SHOCK_R_PER_KG3 * Math.cbrt(W);
          const gyS = this.groundAt(x, z);
          this.shocks.add(x, py, z, R, { ground: gyS });   // khói cũ bị thổi bạt khi mặt sóng quét tới (ShockLayer)
          if (py - gyS < R * 0.5) {
            const pal2 = this.palette(isWall ? 'WALL' : 'GROUND');
            for (let i = 0; i < 28; i++) {
              const a = (i / 28) * 6.283 + rand(-0.08, 0.08), sp = rand(220, 340) * Math.sqrt(s);
              this.smoke.add({ x: x + Math.cos(a) * 3, y: gyS + 0.8, z: z + Math.sin(a) * 3, vx: Math.cos(a) * sp, vy: rand(1, 5), vz: Math.sin(a) * sp,
                size: rand(2.5, 4.5) * Math.sqrt(s), grow: 9 * s, drag: 5.5, grav: 0, life: rand(0.9, 1.5), alpha: 0.35, fadeIn: 0.01, c0: pal2.dust, cell: 2 });
            }
          }
        }
      }

      if (isVehicle) this.spawnMetalFragments(x, py, z, s);
      if (!prof.micro && !isWall && !isVehicle && !isAir && prof.crater > 0 && !opts.noCrater) {
        this.addCrater(x, z, prof.crater * (opts.heavy ? 1.6 : 1), pal, (prof.depth || 0.6) * (opts.heavy ? 1.4 : 1), dirVec, ammoType, opts);
      }
      if (isWall && wallInfo && !prof.micro && !envMarks && !opts.noWallMark) this.addWallMark(x, y, z, wallInfo, 6.5 * Math.pow(s, 0.6));
      if (prof.micro) {
        // Lỗ đạn đúng kích cỡ: 30mm lớn hơn súng máy
        const hs = ammoType === 'SCOUT_BULLET' ? rand(1.8, 2.6) : rand(2.6, 3.8);
        if (isWall && wallInfo && !precise && !envMarks) this.wallHoles.add(x, Math.max(y, ground + 2), z, wallInfo.nx, 0, wallInfo.nz, hs * 0.8);
      }

      if (!prof.micro && prof.kind !== 'kinetic' && this.unitsProvider) this.markNearbyVehicles(x, py, z, s, prof, opts);

      // lửa cháy lây lất sau nổ: cỏ khô bén lửa, cát / đá / nhựa đường / bùn ướt thì gần như không
      const lingerChance = prof.linger * (isVehicle ? 1 : (pal.fire !== undefined ? pal.fire : 1)) + (isVehicle ? 0.6 : 0);
      if (lingerChance > 0 && Math.random() < lingerChance) {
        const fires = prof.micro ? 1 : Math.round(rand(2, 4) * Math.min(1.5, s));
        for (let i = 0; i < fires; i++) {
          this.emitters.push({
            x: x + rand(-8, 8) * s, z: z + rand(-8, 8) * s, y: ground,
            t: 0, dur: prof.micro ? rand(0.6, 1.2) : rand(3, 7), acc: 0,
            rate: prof.micro ? 10 : 14, size: (prof.micro ? 1.6 : rand(3, 5)) * Math.max(0.6, s)
          });
        }
      }
    }

    // --- 1. Chớp sáng + đèn thật ---
    spawnFlash(x, y, z, s, prof) {
      this.fire.add({ x, y, z, vx: 0, vy: 0, vz: 0, size: 46 * s, grow: 60 * s, life: prof.micro ? 0.06 : 0.1, alpha: 1, fadeIn: 0.005, c0: [1, 0.95, 0.8], cell: 3, floor: false });
      this.fire.add({ x, y, z, vx: 0, vy: 0, vz: 0, size: 30 * s, grow: 40 * s, life: prof.micro ? 0.08 : 0.16, alpha: 0.9, fadeIn: 0.005, c0: [1, 0.75, 0.4], cell: 1, floor: false });
      if (!prof.micro && typeof SpgFXPool !== 'undefined' && SpgFXPool.muzzleLight) {
        const l = SpgFXPool.muzzleLight(this.scene);
        if (l) {
          l.position.set(x, y + 10 * s, z);
          l.color.setRGB(1, 0.62, 0.32);
          l.distance = 300 * s;
          this.lights.push({ l, t: 0, life: 0.32, peak: 7 * Math.sqrt(s) });
        }
      }
    }

    // --- 2. Cầu lửa bùng lên rồi sẫm thành khói, mang quán tính góc đến ---
    spawnFireball(x, y, z, s, prof, nx, nz, dirVec, groundBurst = false) {
      // groundBurst: nổ phá chạm đất — chớp lửa ngắn & nhỏ (thật: vài chục ms), không phải quả cầu lửa điện ảnh
      const gk = groundBurst ? 0.55 : 1;
      const n = Math.round((prof.micro ? 2 : 9) * prof.fire * Math.min(1.6, s + 0.3) * gk);
      const fwd = dirVec ? Math.hypot(dirVec.x, dirVec.z) : 0;
      const fDirX = fwd > 0.05 ? dirVec.x / fwd : 0;
      const fDirZ = fwd > 0.05 ? dirVec.z / fwd : 0;
      const flatness = dirVec ? Math.max(0, 1 - Math.abs(dirVec.y !== undefined ? dirVec.y : -0.7)) : 0;

      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = rand(14, 46) * s;
        // Quả cầu lửa bị hất dồn về phía trước theo hướng đạn bay
        const fBoost = flatness * sp * (1.1 + Math.random() * 1.5);
        this.fire.add({
          x: x + rand(-3, 3) * s, y: y + rand(1, 5) * s, z: z + rand(-3, 3) * s,
          vx: Math.cos(a) * sp + nx * 30 * s + fDirX * fBoost,
          vy: rand(10, 34) * s + Math.max(0, -(dirVec ? dirVec.y : -0.7)) * 12 * s,
          vz: Math.sin(a) * sp + nz * 30 * s + fDirZ * fBoost,
          size: rand(9, 17) * s * (groundBurst ? 0.72 : 1), grow: 26 * s * (groundBurst ? 0.7 : 1), drag: 3.2, grav: -6,
          life: rand(0.35, 0.75) * (prof.micro ? 0.5 : 1) * (groundBurst ? 0.42 : 1), alpha: 0.95, fadeIn: 0.02, fadePow: 1.6,
          c0: [1, 0.85, 0.55], c1: [0.55, 0.2, 0.06], cell: 1, floor: false
        });
      }
    }

    // --- 3. Cột đất đen hất tung + đất đá 3D văng tạo thành quạt hình nón theo góc tới ---
    spawnEjecta(x, y, z, s, prof, pal, isWall, nx, nz, dirVec) {
      const n = Math.round((prof.micro ? 3 : 20) * prof.dirt * Math.min(1.7, s + 0.2));
      const fwd = dirVec ? Math.hypot(dirVec.x, dirVec.z) : 0;
      const fDirX = fwd > 0.05 ? dirVec.x / fwd : 0;
      const fDirZ = fwd > 0.05 ? dirVec.z / fwd : 0;
      const flatness = (!isWall && dirVec) ? Math.max(0, 1 - Math.abs(dirVec.y !== undefined ? dirVec.y : -0.7)) : 0;

      for (let i = 0; i < n; i++) {
        const spread = rand(4, 26) * s;
        const up = rand(55, 135) * Math.sqrt(s) * (prof.micro ? 0.5 : 1);
        let vx, vz;
        if (!isWall && fwd > 0.05 && Math.random() < 0.75) {
          // 75% lượng đất bị tống mạnh về phía trước theo hướng bay của viên đạn
          const ang = (Math.random() - 0.5) * 1.5;
          const forwardSp = (spread + 35 * flatness) * (1.1 + Math.random() * 0.9);
          vx = (fDirX * Math.cos(ang) - fDirZ * Math.sin(ang)) * forwardSp;
          vz = (fDirX * Math.sin(ang) + fDirZ * Math.cos(ang)) * forwardSp;
        } else {
          const a = Math.random() * Math.PI * 2;
          vx = Math.cos(a) * spread + nx * up * 0.7;
          vz = Math.sin(a) * spread + nz * up * 0.7;
        }
        this.smoke.add({
          x: x + rand(-3, 3) * s, y: y + rand(0, 3) * s, z: z + rand(-3, 3) * s,
          vx: vx, vy: isWall ? up * 0.45 : (up * (0.8 + flatness * 0.4)), vz: vz,
          size: rand(6, 12) * s, grow: 11 * s, drag: 1.1, grav: 75,
          life: rand(1.3, 2.4) * (prof.micro ? 0.6 : 1), alpha: 0.88, fadeIn: 0.03,
          c0: mix(pal.dark, rand(1.2, 1.9)), c1: mix(pal.soil, 1.05), colorRate: 1.4, cell: 0
        });
      }

      const rocks = Math.round((prof.micro ? 0.6 : 6) * prof.dirt * Math.min(1.5, s + 0.2));
      for (let i = 0; i < rocks; i++) {
        if (prof.micro && Math.random() > 0.6) continue;
        const sp = rand(10, 38) * Math.sqrt(s);
        const tone = rand(0.75, 1.25);
        const base = Math.random() < 0.55 ? pal.rock : pal.soil;
        let rvx, rvz;
        if (!isWall && fwd > 0.05 && Math.random() < 0.8) {
          // Đất đá 3D bị xúc tung bạt mạnh về phía trước theo quán tính
          const ang = (Math.random() - 0.5) * 1.4;
          const rockSp = sp * (1.0 + flatness * 0.7);
          rvx = (fDirX * Math.cos(ang) - fDirZ * Math.sin(ang)) * rockSp;
          rvz = (fDirX * Math.sin(ang) + fDirZ * Math.cos(ang)) * rockSp;
        } else {
          const a = Math.random() * Math.PI * 2;
          rvx = Math.cos(a) * sp + nx * 35 * Math.sqrt(s);
          rvz = Math.sin(a) * sp + nz * 35 * Math.sqrt(s);
        }
        (isWall ? this.hardRocks : this.rocks).add({
          x: x + rand(-2, 2) * s, y: y + rand(1, 3), z: z + rand(-2, 2) * s,
          vx: rvx, vy: rand(35, 85) * Math.sqrt(s) * (0.75 + flatness * 0.3), vz: rvz,
          size: rand(0.35, 1.5) * Math.pow(s, 0.55) * (prof.micro ? 0.6 : 1), life: rand(3, 5),
          c: [base[0] * tone, base[1] * tone, base[2] * tone]
        });
      }
    }

    // --- 3b. Tia đất phụt: đạn pháo nổ trên đất hất đất thành vài cột / tia riêng rẽ vọt lên dốc đứng rồi rơi xuống
    //     (dấu hiệu dễ nhận nhất trong ảnh / phim thật), dồn về phía trước khi đạn rơi xiên. Mỗi tia = chuỗi hạt cùng
    //     hướng, hạt sau chậm dần -> thành vệt cột đất. Màu theo vật liệu mặt đất (cát vàng, đất nâu, bùn đen, đá xám)
    spawnSoilJets(x, y, z, s, prof, pal, dirVec) {
      const sc = (c, k) => [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)];
      const nJ = Math.round(rand(5, 8) * Math.min(1.3, 0.35 + s * 0.4) * (prof.kind === 'bomblet' ? 0.5 : 1));
      const fwd = dirVec ? Math.hypot(dirVec.x, dirVec.z) : 0;
      const fdx = fwd > 0.05 ? dirVec.x / fwd : 0, fdz = fwd > 0.05 ? dirVec.z / fwd : 0;
      const flat = dirVec ? Math.max(0, 1 - Math.abs(dirVec.y !== undefined ? dirVec.y : -0.7)) : 0;
      const wetK = pal.wet ? 0.8 : 1;
      for (let j = 0; j < nJ; j++) {
        let a = Math.random() * 6.2832;
        if (fwd > 0.05 && flat > 0.15 && Math.random() < 0.6) a = Math.atan2(fdz, fdx) + (Math.random() - 0.5) * 1.6;
        const el = rand(0.95, 1.4) - flat * 0.3;                    // ~55-80° so với mặt đất
        const V = rand(120, 220) * Math.sqrt(s) * wetK;
        const hx = Math.cos(a) * Math.cos(el), hy = Math.sin(el), hz = Math.sin(a) * Math.cos(el);
        const tone = rand(0.8, 1.05);
        for (let k = 0; k < 10; k++) {
          // hạt sau chậm hơn chút & to dần -> các hạt chồng lên nhau thành một vệt cột đất liền, không thành chuỗi hạt
          const f = 1 - k * 0.05;
          this.smoke.add({
            x: x + rand(-1, 1) * s, y: y + 1, z: z + rand(-1, 1) * s,
            vx: hx * V * f, vy: hy * V * f, vz: hz * V * f,
            size: rand(3, 5.5) * Math.sqrt(s) * (1 + k * 0.08), grow: 8 * s, drag: 0.9, grav: 85,
            life: rand(1.1, 1.8), alpha: 0.62 - k * 0.03, fadeIn: 0.02,
            c0: sc(pal.soil, tone), c1: sc(pal.dust, 0.95), colorRate: 1.1, cell: 2, delay: k * 0.01
          });
        }
      }
    }

    // --- 4. Vòng bụi quét sát đất + đám bụi lơ lửng cuốn theo góc đến ---
    spawnDust(x, ground, z, s, prof, pal, isWall, dirVec) {
      // lượng bụi & thời gian bụi lơ lửng theo vật liệu: cát khô nhiều & lâu, bùn ướt gần như không; bụi trôi chậm theo gió
      const dK = pal.dustK !== undefined ? pal.dustK : 1, lK = pal.linger !== undefined ? pal.linger : 1;
      const W = typeof window !== 'undefined' && window.game && window.game.ballistics && window.game.ballistics.wind;
      const wax = W ? Math.max(-6, Math.min(6, (W.vx || 0) * 0.4)) : 0, waz = W ? Math.max(-6, Math.min(6, (W.vz || 0) * 0.4)) : 0;
      const ring = Math.round((prof.micro ? 3 : 16) * Math.min(1.6, s + 0.2) * Math.min(1.3, dK));
      const fwd = dirVec ? Math.hypot(dirVec.x, dirVec.z) : 0;
      const fDirX = fwd > 0.05 ? dirVec.x / fwd : 0;
      const fDirZ = fwd > 0.05 ? dirVec.z / fwd : 0;
      const flatness = (!isWall && dirVec) ? Math.max(0, 1 - Math.abs(dirVec.y !== undefined ? dirVec.y : -0.7)) : 0;

      for (let i = 0; i < ring; i++) {
        const a = (i / ring) * Math.PI * 2 + rand(-0.2, 0.2);
        const sp = rand(80, 130) * s;
        const fSp = flatness * sp * (0.8 + Math.random() * 0.9);
        this.smoke.add({
          x, y: ground + 1.5, z,
          vx: Math.cos(a) * sp * 0.7 + fDirX * fSp,
          vy: rand(1, 4),
          vz: Math.sin(a) * sp * 0.7 + fDirZ * fSp,
          size: rand(5, 8) * s, grow: 20 * s, drag: 3.2, life: rand(0.8, 1.3), alpha: 0.42,
          c0: pal.dust, cell: 2
        });
      }
      const cloud = Math.round((prof.micro ? 2 : 13) * Math.min(1.6, s + 0.2) * dK);
      for (let i = 0; i < cloud; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = rand(20, 65) * s;
        const fSp = flatness * sp * (0.9 + Math.random() * 1.1);
        this.smoke.add({
          x: x + rand(-4, 4) * s, y: ground + rand(2, 8) * s, z: z + rand(-4, 4) * s,
          vx: Math.cos(a) * sp * 0.6 + fDirX * fSp,
          vy: rand(2, 10),
          vz: Math.sin(a) * sp * 0.6 + fDirZ * fSp,
          size: rand(11, 19) * s, grow: 9 * s, drag: 1.5, grav: -1.5,
          life: rand(3, 5.5) * (prof.micro ? 0.4 : 1) * (prof.micro ? 1 : lK), alpha: isWall ? 0.55 : 0.5, fadeIn: 0.15,
          c0: mix(pal.dust, rand(0.85, 1.05)), cell: Math.random() < 0.5 ? 0 : 2, delay: rand(0, 0.12)
        });
      }
      // màn bụi mịn sát đất còn lơ lửng sau khi cột đất rơi hết, trôi chậm theo gió rồi tan (cát khô lâu nhất)
      if (!prof.micro && !isWall && dK > 0.5) {
        const haze = Math.round(6 * Math.min(1.6, s + 0.2) * dK);
        for (let i = 0; i < haze; i++) {
          const a = Math.random() * Math.PI * 2, r = rand(4, 22) * s;
          this.smoke.add({
            x: x + Math.cos(a) * r, y: ground + rand(3, 9) * s, z: z + Math.sin(a) * r,
            vx: Math.cos(a) * rand(4, 12), vy: rand(0.5, 3), vz: Math.sin(a) * rand(4, 12), ax: wax, az: waz,
            size: rand(16, 26) * s, grow: 5 * s, drag: 0.6, grav: -0.4,
            life: rand(7, 12) * lK, alpha: 0.26, fadeIn: 1.2, fadePow: 1.1,
            c0: mix(pal.dust, rand(0.9, 1.05)), cell: 2, delay: rand(0.4, 1.4)
          });
        }
      }
    }

    // --- 5. Cột khói cuộn bốc cao ---
    spawnSmokeColumn(x, y, z, s, prof, isVehicle, pal = null) {
      const n = Math.round((prof.micro ? 2 : 14) * Math.max(0.4, prof.fire) * Math.min(1.6, s + 0.2) * (isVehicle ? 1.5 : 1));
      // Nổ trên đất: đám mây bốc lên phần lớn là BỤI của chính mặt đất trộn khí thuốc nổ -> pha màu bụi mặt đất
      // (cát: vàng xám; đất: nâu xám; bê tông: xám sáng). Cháy xe / tên lửa: giữ khói tro xám sẫm
      const tintK = pal && !isVehicle ? (pal.smokeK !== undefined ? pal.smokeK : 0.55) : 0;
      const lerp3 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
      // nổ trên đất: khí thuốc nổ chỉ là lõi sẫm mỏng giữa cột bụi -> ít hạt hơn, rải rộng & kéo cao thành cột (không thành
      // một quả bóng xám đặc), pha màu bụi đậm hơn
      const gb = tintK > 0;
      // Bom con (vài chục gam thuốc nổ): chỉ một cụm khói bụi nhỏ, tan trong 2-3 s — trước đây vẫn bốc thành cột khói
      // cao 5-7 s như một đám cháy
      const bomb = prof.kind === 'bomblet';
      const lifeK = bomb ? 0.4 : 1, upK = bomb ? 0.45 : 1;
      const nn = Math.round((gb ? n * 0.5 : n) * (bomb ? 0.6 : 1)), spr = gb ? 7 : 4;
      for (let i = 0; i < nn; i++) {
        // Màu khói tro xám ấm (TNT/RDX pháo binh) thay vì đen kịt như bóng cao su
        const g = rand(0.28, 0.42);
        const tk = tintK * rand(0.75, 1.1);
        this.smoke.add({
          x: x + rand(-spr, spr) * s, y: y + rand(3, 11) * s, z: z + rand(-spr, spr) * s,
          vx: rand(-6, 6) * Math.sqrt(s), vy: rand(gb ? 10 : 15, gb ? 48 : 36) * Math.sqrt(s) * upK, vz: rand(-6, 6) * Math.sqrt(s),
          size: rand(6.5, 12) * s, grow: 11 * s, drag: 0.85, grav: bomb ? -1.5 : -4.5,
          life: rand(4.5, 7.5) * (prof.micro ? 0.4 : 1) * lifeK, alpha: gb ? 0.42 : 0.52, fadeIn: bomb ? 0.08 : 0.25,
          rot: Math.random() * Math.PI * 2, rotV: (Math.random() - 0.5) * 1.2,
          c0: lerp3([g, g * 0.96, g * 0.92], tintK ? [pal.dust[0] * 0.75, pal.dust[1] * 0.75, pal.dust[2] * 0.75] : [g, g, g], tk),
          c1: lerp3([Math.min(0.85, g * 1.65), Math.min(0.83, g * 1.6), Math.min(0.8, g * 1.55)], tintK ? [pal.dust[0] * 0.95, pal.dust[1] * 0.95, pal.dust[2] * 0.95] : [g, g, g], tk),
          cell: 0, delay: rand(0.08, 0.42), floor: false
        });
      }
    }

    // --- 6. Tia lửa bắn tung ---
    spawnSparks(x, y, z, s, prof, hard, nx, nz) {
      const n = Math.round((prof.micro ? 4 : 14) * prof.sparks * (hard ? 1.6 : 1) * Math.min(1.4, s + 0.4));
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = rand(60, 190) * Math.sqrt(s);
        this.fire.add({
          x, y: y + 1, z,
          vx: Math.cos(a) * sp * 0.8 + nx * sp * 0.6, vy: rand(30, 150) * Math.sqrt(s), vz: Math.sin(a) * sp * 0.8 + nz * sp * 0.6,
          size: rand(1.2, 2.8), grow: -1.5, drag: 0.9, grav: GRAV,
          life: rand(0.35, 0.9), alpha: 1, fadeIn: 0.01, c0: [1, 0.85, 0.5], c1: [1, 0.45, 0.15], cell: 3
        });
      }
    }

    // --- Đạn chùm (đạn chở hàng DPICM) tách vỏ trên không. Ngoài đời KHÔNG phải một vụ nổ phá: ngòi hẹn giờ kích liều đẩy
    //     nhỏ (thuốc đen) thổi bật đáy đạn, bom con tuôn ra phía trước; vỏ đạn rỗng bay tiếp. Thấy: chớp cam nhỏ, cụm khói
    //     thuốc đen xám trắng trôi theo hướng bay, đáy đạn & vài mảnh tàn lửa rơi xuống. Không có sóng nổ quét mặt đất, không
    //     mưa mảnh văng găm đất (trước đây vẽ như đạn nổ phá trên không: chớp lớn, vòng bụi, 36 cột bụi mảnh văng) ---
    spawnAirburst(x, y, z, s, dirVec = null) {
      const k = Math.sqrt(s);
      const dvx = dirVec ? dirVec.x : 0, dvz = dirVec ? dirVec.z : 0;
      this.fire.add({ x, y, z, vx: 0, vy: 0, vz: 0, size: 14 * k, grow: 30 * k, life: 0.05, alpha: 1, fadeIn: 0.003, c0: [1, 0.9, 0.7], cell: 3, floor: false });
      this.fire.add({ x, y, z, vx: dvx * 40, vy: 0, vz: dvz * 40, size: 9 * k, grow: 18 * k, life: 0.14, alpha: 0.85, fadeIn: 0.005, c0: [1, 0.6, 0.25], c1: [0.5, 0.2, 0.06], cell: 1, floor: false });
      // khói thuốc đen: xám nhạt, trôi theo quán tính đạn mẹ rồi chậm lại
      for (let i = 0; i < 10; i++) {
        const g = rand(0.55, 0.7);
        this.smoke.add({
          x: x + rand(-2, 2), y: y + rand(-2, 2), z: z + rand(-2, 2),
          vx: dvx * rand(30, 70) + rand(-8, 8), vy: rand(-4, 6), vz: dvz * rand(30, 70) + rand(-8, 8),
          size: rand(5, 9) * k, grow: 9 * k, drag: 2.4, grav: -1.5,
          life: rand(2.5, 4), alpha: 0.5, fadeIn: 0.03, c0: [g, g, g * 0.97], cell: Math.random() < 0.5 ? 0 : 2, floor: false
        });
      }
      // tàn liều đẩy + đáy đạn / mảnh nắp rơi xuống
      for (let i = 0; i < 8; i++) {
        const a = Math.random() * Math.PI * 2, sp = rand(15, 50);
        this.fire.add({
          x, y, z, vx: Math.cos(a) * sp + dvx * 30, vy: rand(-20, 15), vz: Math.sin(a) * sp + dvz * 30,
          size: rand(1, 1.8), grow: -0.6, drag: 0.8, grav: GRAV, life: rand(0.4, 0.8), alpha: 1, fadeIn: 0.01,
          c0: [1, 0.75, 0.4], c1: [0.9, 0.35, 0.1], cell: 3
        });
      }
      this.addLight(x, y, z, 0.5 * k, 0.12);
    }

    // --- Đạn xuyên giáp lõi URANI NGHÈO: không thuốc nổ nhưng urani tự bốc cháy khi va chạm ---
    //     chớp trắng gắt, mảnh urani cháy sáng rực văng theo hướng bay (rơi xuống vẫn cháy),
    //     mây bụi oxit urani trắng xám, đất xé thành rãnh dài
    spawnKineticImpact(x, y, z, ground, s, prof, pal, dx, dz, hard, nx, nz, vehicle, dirVec) {
      if (vehicle) {
        // APFSDS xuyên giáp xe: chớp trắng gắt tại lỗ vào, ít tia lửa bắn ngược (kim loại nóng chảy), luồng mảnh vỡ
        // chính đi THEO hướng đạn vào trong xe (lọt ra phía bên kia nếu xuyên qua), khói oxit urani trắng xám
        const dv = dirVec ? new THREE.Vector3(dirVec.x, dirVec.y || 0, dirVec.z).normalize() : new THREE.Vector3(dx, 0, dz);
        this.fire.add({ x, y, z, vx: 0, vy: 0, vz: 0, size: 26, grow: 50, life: 0.07, alpha: 1, fadeIn: 0.003, c0: [1, 0.98, 0.92], cell: 3, floor: false });
        this.addLight(x, y + 2, z, 0.8, 0.14);
        for (let i = 0; i < 7; i++) {
          const sp = rand(40, 110);
          this.fire.add({ x, y, z, vx: nx * sp + rand(-25, 25), vy: rand(10, 50), vz: nz * sp + rand(-25, 25), size: rand(0.9, 1.6), grow: -0.5, drag: 1.2, grav: GRAV, life: rand(0.25, 0.5), alpha: 1, fadeIn: 0.004, c0: [1, 0.9, 0.6], c1: [1, 0.45, 0.1], cell: 3 });
        }
        this.spallCone(new THREE.Vector3(x, y, z).addScaledVector(dv, 3), dv, 18, { spread: 0.35, speed: 0.8 });
        for (let i = 0; i < 4; i++) {
          const g = rand(0.8, 0.9);
          this.smoke.add({ x: x + rand(-1, 1), y: y + rand(0, 2), z: z + rand(-1, 1), vx: nx * rand(3, 9), vy: rand(4, 10), vz: nz * rand(3, 9), size: rand(5, 9), grow: 7, drag: 1.3, grav: -2, life: rand(1.6, 2.6), alpha: 0.42, fadeIn: 0.05, c0: [g, g, g * 0.97], cell: 2, floor: false });
        }
        this.spawnSparks(x, y, z, 0.8, { sparks: 1.4, micro: false }, true, nx, nz);
        return;
      }
      const fx = hard ? nx : dx, fz = hard ? nz : dz;
      this.fire.add({ x, y: y + 2, z, vx: 0, vy: 0, vz: 0, size: hard ? 44 : 30, grow: 60, life: 0.08, alpha: 1, fadeIn: 0.003, c0: [1, 0.98, 0.92], cell: 3, floor: false });
      this.addLight(x, y + 6, z, hard ? 1.0 : 0.6, 0.18);
      const frag = hard ? 34 : 22;
      for (let i = 0; i < frag; i++) {
        const spread = rand(-0.7, 0.7);
        const cx = fx * Math.cos(spread) - fz * Math.sin(spread);
        const cz = fx * Math.sin(spread) + fz * Math.cos(spread);
        const sp = rand(50, 190);
        this.fire.add({
          x, y: y + 1.5, z, vx: cx * sp, vy: rand(15, 95), vz: cz * sp,
          size: rand(1.6, 3.4), grow: -0.3, drag: 0.45, grav: 85, life: rand(0.9, 1.9), alpha: 1, fadeIn: 0.01, fadePow: 0.8,
          c0: [1, 0.97, 0.85], c1: [1, 0.48, 0.12], colorRate: 0.8, cell: 3
        });
      }
      for (let i = 0; i < (hard ? 12 : 9); i++) {
        const g = rand(0.78, 0.9);
        this.smoke.add({
          x: x + fx * rand(0, 14), y: y + rand(2, 6), z: z + fz * rand(0, 14),
          vx: fx * rand(4, 18) + rand(-5, 5), vy: rand(6, 16), vz: fz * rand(4, 18) + rand(-5, 5),
          size: rand(8, 14), grow: 10, drag: 1.1, grav: -2.5, life: rand(3, 5), alpha: 0.5, fadeIn: 0.08,
          c0: [g, g, g * 0.97], cell: Math.random() < 0.5 ? 2 : 0, delay: rand(0.02, 0.2), floor: false
        });
      }
      for (let i = 0; i < 2; i++) {
        const k = rand(8, 30);
        this.emitters.push({ x: x + fx * k, z: z + fz * k, y: ground, t: 0, dur: rand(1.2, 2.4), acc: 0, rate: 8, size: 1.3 });
      }
      // Chớp va chạm nhỏ, trắng gắt (ma sát kim loại)
      this.fire.add({ x, y: y + 1, z, vx: 0, vy: 0, vz: 0, size: 16, grow: 30, life: 0.06, alpha: 1, fadeIn: 0.003, c0: [1, 0.95, 0.85], cell: 3, floor: false });
      if (hard) {
        this.spawnSparks(x, y, z, 1.2, { sparks: 3, micro: false }, true, nx, nz);
      } else {
        this.spawnSparks(x, y, z, 0.8, { sparks: 0.8, micro: false }, false, dx, dz);
      }
      // Tia đất tung về phía trước, góc thấp, kéo dài theo hướng bay
      const n = hard ? 8 : 22;
      for (let i = 0; i < n; i++) {
        const spread = rand(-0.35, 0.35);
        const cx = dx * Math.cos(spread) - dz * Math.sin(spread);
        const cz = dx * Math.sin(spread) + dz * Math.cos(spread);
        const sp = rand(60, 170);
        this.smoke.add({
          x: x + dx * rand(0, 10), y: ground + 2, z: z + dz * rand(0, 10),
          vx: cx * sp + (hard ? nx * 60 : 0), vy: rand(25, 75), vz: cz * sp + (hard ? nz * 60 : 0),
          size: rand(4, 8), grow: 9, drag: 1.6, grav: 70, life: rand(1.0, 1.8), alpha: 0.85, fadeIn: 0.02,
          c0: mix(hard ? CONCRETE.dust : pal.dark, hard ? 1 : 1.7), c1: mix(hard ? CONCRETE.dust : pal.soil, 1), cell: 0
        });
      }
      for (let i = 0; i < (hard ? 6 : 12); i++) {
        const spread = rand(-0.5, 0.5);
        const cx = dx * Math.cos(spread) - dz * Math.sin(spread);
        const cz = dx * Math.sin(spread) + dz * Math.cos(spread);
        const sp = rand(40, 120);
        const base = hard ? CONCRETE.rock : (Math.random() < 0.5 ? pal.rock : pal.soil);
        const tone = rand(0.8, 1.2);
        (hard ? this.hardRocks : this.rocks).add({
          x: x + dx * 4, y: ground + 1.5, z: z + dz * 4, vx: cx * sp, vy: rand(25, 80), vz: cz * sp,
          size: rand(0.4, 1.3), life: rand(4, 6), c: [base[0] * tone, base[1] * tone, base[2] * tone]
        });
      }
      // Bụi mỏng bám theo rãnh
      for (let i = 0; i < 7; i++) {
        const k = rand(0, 26);
        this.smoke.add({
          x: x + dx * k, y: ground + 2, z: z + dz * k, vx: rand(-6, 6), vy: rand(2, 6), vz: rand(-6, 6),
          size: rand(8, 13), grow: 6, drag: 1.2, grav: -1, life: rand(2.5, 4), alpha: 0.4, fadeIn: 0.1,
          c0: hard ? CONCRETE.dust : pal.dust, cell: 2, delay: rand(0, 0.15)
        });
      }
    }

    // --- Đầu nổ lõm (HEAT): chớp trắng chói + luồng phụt nóng chảy thẳng theo hướng bay + khói đen đặc ---
    spawnHeatJet(x, y, z, s, dx, dz, nx, nz) {
      this.fire.add({ x, y: y + 2, z, vx: 0, vy: 0, vz: 0, size: 54 * s, grow: 70 * s, life: 0.07, alpha: 1, fadeIn: 0.003, c0: [1, 1, 0.95], cell: 3, floor: false });
      const jx = nx || dx, jz = nz || dz;
      for (let i = 0; i < 16; i++) {
        const k = rand(0.2, 1);
        const sp = rand(120, 260) * k;
        this.fire.add({
          x, y: y + 2, z, vx: jx * sp + rand(-12, 12), vy: rand(4, 30), vz: jz * sp + rand(-12, 12),
          size: rand(5, 10) * s, grow: 10 * s, drag: 4, life: rand(0.18, 0.35), alpha: 1, fadeIn: 0.01, fadePow: 1.8,
          c0: [1, 0.92, 0.7], c1: [1, 0.45, 0.12], cell: 1, floor: false
        });
      }
      for (let i = 0; i < 10; i++) {
        const g = rand(0.06, 0.12);
        this.smoke.add({
          x: x + rand(-3, 3), y: y + rand(2, 6), z: z + rand(-3, 3),
          vx: jx * rand(5, 25) + rand(-8, 8), vy: rand(12, 30), vz: jz * rand(5, 25) + rand(-8, 8),
          size: rand(9, 14) * s, grow: 10 * s, drag: 1, grav: -4, life: rand(3, 5), alpha: 0.75, fadeIn: 0.05,
          c0: [g, g * 0.95, g * 0.9], c1: [g * 2.2, g * 2.1, g * 2], cell: 0, floor: false
        });
      }
    }

    // --- Đạn cháy: tàn cháy văng ra, rơi xuống còn cháy thêm ---
    spawnIncendiarySplash(x, y, z, s) {
      for (let i = 0; i < 9; i++) {
        const a = Math.random() * Math.PI * 2, sp = rand(20, 60);
        this.fire.add({
          x, y: y + 1, z, vx: Math.cos(a) * sp, vy: rand(20, 55), vz: Math.sin(a) * sp,
          size: rand(2.5, 4.5), grow: -0.5, drag: 0.8, grav: GRAV, life: rand(0.8, 1.6), alpha: 1, fadeIn: 0.01,
          c0: [1, 0.8, 0.4], c1: [1, 0.35, 0.08], cell: 1
        });
      }
    }

    /**
     * Đạn nhỏ găm đất. Thật ngoài đời:
     *  - 12.7mm (đạn thường, không nổ): KHÔNG chớp lửa, không tia lửa trên đất mềm. Cát / đất bị hất thành một chùm hạt
     *    phụt lên chếch về phía trước theo góc đạn tới (đạn bay càng xiên chùm càng ngả về trước), vài hạt to rơi lả tả,
     *    một làn bụi mỏng tan nhanh. Trên đá / bê tông thì ngược lại: tóe tia lửa + vụn đá xám, ít bụi.
     *  - 30mm nổ-mảnh (HEI): chớp nổ rất ngắn, khói thuốc nổ xám nâu quyện bụi bốc lên, cột cát nhỏ, mảnh văng rạch
     *    thành những tia sáng ngắn sát đất và làm bụi bật lên lấm tấm quanh điểm nổ.
     *  - 30mm đạn cháy: chớp cam, tàn lửa tóe, khói trắng xám của chất cháy, có thể bén cỏ khô.
     * Vật liệu (cát / đất / bùn / nhựa đường / đá) quyết định màu, lượng bụi, có cục đất 3D hay không.
     */
    spawnBulletGroundImpact(x, ground, z, ammoType, pal, dirVec, opts = {}, tEnv = null, hitY = ground) {
      const hei = ammoType === 'GATLING_BULLET', inc = ammoType === 'INCENDIARY', big = hei || inc;
      const mat = pal.mat || 'soil';
      const hard = mat === 'rock' || mat === 'hard', wet = !!pal.wet, sand = mat === 'sand';
      const dK = Math.min(1.5, pal.dustK !== undefined ? pal.dustK : 1), lK = pal.linger !== undefined ? pal.linger : 1;
      const sc = (c, k) => [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)];
      const W = typeof window !== 'undefined' && window.game && window.game.ballistics && window.game.ballistics.wind;
      const wax = W ? Math.max(-6, Math.min(6, (W.vx || 0) * 0.4)) : 0, waz = W ? Math.max(-6, Math.min(6, (W.vz || 0) * 0.4)) : 0;

      // hướng bay ngang & độ xiên (fl = 1: lướt sát đất, 0: cắm thẳng đứng)
      let fx = 0, fz = 0, fl = 0;
      if (dirVec && dirVec.hasDir) {
        const h = Math.hypot(dirVec.x, dirVec.z);
        if (h > 0.02) { fx = dirVec.x / h; fz = dirVec.z / h; fl = h / (Math.hypot(h, dirVec.y) || 1); }
      }
      if (!fl) { const a = Math.random() * 6.283; fx = Math.cos(a); fz = Math.sin(a); }
      // trục chùm hạt: ngả về trước theo độ xiên, đạn cắm đứng thì phụt gần thẳng lên
      const jl = Math.hypot(fl * 0.95, 0.65 + (1 - fl) * 0.7);
      const jx = fx * fl * 0.95 / jl, jy = (0.65 + (1 - fl) * 0.7) / jl, jz = fz * fl * 0.95 / jl;
      const sx = -fz, sz = fx;   // trục ngang
      const cone = (spread) => {
        // hướng ngẫu nhiên trong nón quanh trục chùm hạt
        const a = (Math.random() - 0.5) * 2 * spread, b = (Math.random() - 0.5) * 2 * spread;
        let vx = jx + sx * a + fx * b * 0.5, vy = jy + b * 0.6, vz = jz + sz * a + fz * b * 0.5;
        const l = Math.hypot(vx, vy, vz) || 1;
        return [vx / l, Math.max(0.12, vy / l), vz / l];
      };
      const y0 = ground + 0.25;
      const k = big ? 1.45 : 1;
      // Ngân sách hạt khi xả loạt (30mm bắn 30 phát/s): các vệt tóe chồng lên nhau, bớt hạt mỗi phát để không đẩy mất
      // khói / bụi khác của trận đánh khỏi bể hạt. hr ~ số phát trong ~0,5 s gần nhất
      const now = this._clock || 0;
      this._bhRate = (this._bhRate || 0) * Math.exp(-(now - (this._bhT || 0)) * 2) + 1;
      this._bhT = now;
      const q = Math.min(1, 5 / this._bhRate);
      const nq = (n) => { const v = n * q, f = Math.floor(v); return f + (Math.random() < v - f ? 1 : 0); };

      // góc đạn tới so với mặt đất (độ): quyết định hố tròn / hố trứng / rãnh cày / nảy đi
      const theta = dirVec && dirVec.hasDir ? Math.asin(Math.min(1, Math.max(0, -dirVec.y))) * 57.3 : 70;
      const spec = holeSpec(ammoType, mat, theta);

      // 0. Hố đạn 3D khoét vào mặt đất (không đặt trên mặt cầu / vật nổi trên đất)
      const onBridge = !!(tEnv && tEnv.envDamage && tEnv.envDamage.bridges && tEnv.envDamage.bridges.at && tEnv.envDamage.bridges.at(x, z));
      const sy = this.surfaceAt(x, z);
      if (!opts.noHoles && !onBridge && Math.abs(hitY - sy) < 2.5 && this.bulletHoles) {
        const e = 0.6, gx = this.surfaceAt(x + e, z) - this.surfaceAt(x - e, z), gz = this.surfaceAt(x, z + e) - this.surfaceAt(x, z - e);
        const n = { x: -gx / (2 * e), y: 1, z: -gz / (2 * e) };
        // tâm hố lệch về phía trước theo độ lệch tâm của dạng hố -> mép sau miệng hố đúng chỗ đạn chạm đất
        const sh = HOLE_ARCH[spec.arch] * spec.len * 0.5 * (fl ? 1 : 0);
        const hx = x + fx * sh, hz = z + fz * sh;
        const t = this.terrainOf();
        this.bulletHoles.add(spec.arch, hx, this.surfaceAt(hx, hz), hz, n, fx, fz, spec.len, spec.wid, spec.depth,
          holeTint(mat, t && t.mapType, ammoType));
      }

      // 1. Vết đạn trên đất (cộng dồn theo ô nếu có EnvDamage)
      if (!opts.noHoles) {
        const tint = bulletMarkTint(pal);
        const done = tEnv && tEnv.envDamage && tEnv.envDamage.groundHit(x, z, ammoType, dirVec, tint);
        if (!done) {
          const kind = inc ? 'burn' : hei ? 'hei' : 'pock';
          const size = (kind === 'hei' ? 6.5 : kind === 'burn' ? 5.5 : 2.6) * rand(0.9, 1.15);
          const stretch = 1 + fl * (kind === 'pock' ? 0.8 : 0.35);
          this.groundHoles.mark(kind, x, ground, z, { size, stretch, rot: fl ? Math.atan2(-fz, fx) : Math.random() * 6.283, tint });
        }
      }

      // 2. Chớp nổ / tia lửa
      if (big) {
        const c0 = inc ? [1, 0.78, 0.45] : [1, 0.93, 0.78];
        this.fire.add({ x, y: y0 + 1.2, z, vx: 0, vy: 0, vz: 0, size: rand(4.5, 6), grow: 28, life: 0.045, alpha: 1, fadeIn: 0.003, c0, cell: 3, floor: false });
        this.fire.add({ x: x + fx * 0.8, y: y0 + 1.4, z: z + fz * 0.8, vx: jx * 14, vy: jy * 14, vz: jz * 14, size: rand(2.6, 3.6), grow: 12, drag: 4, life: inc ? 0.16 : 0.09, alpha: 0.95, fadeIn: 0.004, c0: [1, 0.72, 0.36], c1: [0.6, 0.24, 0.07], cell: 1, floor: false });
        // mảnh vỏ đạn văng sát đất: vệt sáng rất ngắn, dồn về phía trước
        const nF = nq(hei ? 5 : 3);
        for (let i = 0; i < nF; i++) {
          let a = Math.random() * 6.283;
          if (fl > 0.2 && Math.random() < 0.65) a = Math.atan2(fz, fx) + (Math.random() - 0.5) * 2.2;
          const el = rand(0.04, 0.45), sp = rand(160, 300);
          this.streaks.add({ x, y: y0 + 0.8, z, vx: Math.cos(a) * Math.cos(el) * sp, vy: Math.sin(el) * sp, vz: Math.sin(a) * Math.cos(el) * sp, life: rand(0.05, 0.12), grav: 60, drag: 2.5, tail: 0.018 });
        }
        if (inc) this.spawnIncendiarySplash(x, y0 + 0.5, z, 0.17);
      } else if (hard) {
        // 12.7mm vào đá: tóe tia lửa (thép / chì cọ đá), không có chớp nổ
        for (let i = 0; i < 5; i++) {
          const d = cone(0.9), sp = rand(60, 140);
          this.fire.add({ x, y: y0 + 0.4, z, vx: d[0] * sp, vy: d[1] * sp * 0.7, vz: d[2] * sp, size: rand(0.5, 0.9), grow: -0.6, drag: 1.2, grav: 90, life: rand(0.12, 0.3), alpha: 1, fadeIn: 0.004, c0: [1, 0.9, 0.6], c1: [1, 0.5, 0.15], cell: 3 });
        }
      }

      // 3. Chùm hạt cát / đất phụt lên (cái mắt nhận ra đầu tiên): hạt nhỏ, đặc, rơi theo trọng lực thật rồi nằm lại
      const lerpC = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
      const grainCol = hard ? sc(pal.rock, 1.05) : wet ? sc(pal.dark, 1.5) : sand ? lerpC(pal.soil, pal.dust, 0.45) : sc(pal.soil, 0.9);
      const nG = nq((big ? 22 : 16) * (wet ? 0.8 : 1));
      for (let i = 0; i < nG; i++) {
        const wide = Math.random() < 0.25;
        const d = wide ? [Math.cos(i * 2.4) * 0.6, rand(0.45, 0.9), Math.sin(i * 2.4) * 0.6] : cone(0.38);
        const sp = (wide ? rand(10, 26) : rand(22, 58)) * k * (wet ? 0.75 : 1) * (hard ? 1.2 : 1);
        const tone = rand(0.72, 1.08);
        this.smoke.add({
          x: x + rand(-0.4, 0.4), y: y0 + 0.3, z: z + rand(-0.4, 0.4), vx: d[0] * sp, vy: d[1] * sp, vz: d[2] * sp,
          size: rand(0.22, 0.55) * (wet ? 1.5 : 1) * (big ? 1.15 : 1), grow: 0.05, drag: 0.5, grav: 78,
          life: rand(0.75, 1.35), alpha: 1, fadeIn: 0.004, fadePow: 0.45,
          c0: sc(grainCol, tone), cell: 2, rotV: 0
        });
      }
      // 4. Cột cát: chuỗi hạt cùng hướng, hạt sau chậm & to dần -> một vệt cột liền (không phải chấm rời)
      if (!hard) {
        const nJ = big ? nq(1.6) : (q > 0.5 ? 1 : nq(1.5 * q));
        for (let j = 0; j < nJ; j++) {
          const d = cone(0.18), V = rand(32, 52) * k * (wet ? 0.7 : 1);
          for (let q = 0; q < 12; q++) {
            const f = 1 - q * 0.045;
            this.smoke.add({
              x: x + rand(-0.2, 0.2), y: y0 + 0.3, z: z + rand(-0.2, 0.2), vx: d[0] * V * f, vy: d[1] * V * f, vz: d[2] * V * f,
              size: (1.0 + q * 0.13) * k, grow: 3.4 * k, drag: 1.1, grav: 72,
              life: rand(0.5, 0.8), alpha: (wet ? 0.6 : 0.46) - q * 0.02, fadeIn: 0.01,
              c0: sc(pal.soil, rand(0.85, 1.0)), c1: sc(pal.dust, 0.95), colorRate: 1.2, cell: 2, delay: q * 0.006
            });
          }
        }
      }
      // 5. Làn bụi: cát khô nhiều & lâu, bùn ướt gần như không; trôi theo gió
      const nD = wet ? 0 : nq((big ? 3 : 2) * dK + (sand ? 1 : 0));
      for (let i = 0; i < nD; i++) {
        const a = Math.random() * 6.283, r = rand(0, 1.2) * k;
        this.smoke.add({
          x: x + Math.cos(a) * r + fx * rand(0, 2), y: y0 + rand(0.6, 1.6), z: z + Math.sin(a) * r + fz * rand(0, 2),
          vx: fx * fl * rand(4, 10) + Math.cos(a) * 2, vy: rand(0.5, 2.5), vz: fz * fl * rand(4, 10) + Math.sin(a) * 2, ax: wax, az: waz,
          size: rand(1.4, 2.4) * k, grow: rand(2.5, 4.5) * k, drag: 1.3, grav: -0.2,
          life: rand(1.2, 2.2) * lK * (big ? 1.3 : 1), alpha: (hard ? 0.22 : 0.3) * Math.min(1, dK), fadeIn: 0.06, fadePow: 1.2,
          c0: sc(pal.dust, rand(0.92, 1.05)), cell: 2, delay: rand(0.02, 0.09)
        });
      }
      // 6. 30mm: khói thuốc nổ xám nâu quyện bụi + vòng bụi thổi bạt sát đất + bụi bật lên chỗ mảnh găm đất
      if (big) {
        for (let i = 0, nS = Math.max(1, nq(3)); i < nS; i++) {
          const g = inc ? rand(0.62, 0.74) : rand(0.34, 0.44);
          const base = inc ? [g, g * 0.98, g * 0.95] : [g * 1.05, g * 0.98, g * 0.9];
          const mixK = inc ? 0.2 : 0.6;
          const c0 = [base[0] + (pal.dust[0] * 0.8 - base[0]) * mixK, base[1] + (pal.dust[1] * 0.8 - base[1]) * mixK, base[2] + (pal.dust[2] * 0.8 - base[2]) * mixK];
          this.smoke.add({
            x: x + rand(-0.8, 0.8) + fx * rand(0, 1.5), y: y0 + rand(1, 2.2), z: z + rand(-0.8, 0.8) + fz * rand(0, 1.5),
            vx: fx * fl * rand(3, 9) + rand(-2, 2), vy: rand(2.5, 6), vz: fz * fl * rand(3, 9) + rand(-2, 2), ax: wax, az: waz,
            size: rand(1.5, 2.4), grow: rand(3, 4.5), drag: 1.7, grav: -0.8,
            life: rand(1.4, 2.4), alpha: 0.3, fadeIn: 0.05, fadePow: 1.4,
            rot: Math.random() * 6.283, rotV: (Math.random() - 0.5) * 1.4,
            c0, c1: sc(c0, 1.25), cell: 0, delay: rand(0, 0.05), floor: false
          });
        }
        if (!wet) {
          for (let i = 0, nR = nq(6); i < nR; i++) {
            const a = (i / nR) * 6.283 + rand(-0.3, 0.3), sp = rand(22, 38);
            this.smoke.add({
              x, y: y0 + 0.5, z, vx: Math.cos(a) * sp + fx * fl * 10, vy: rand(1, 3), vz: Math.sin(a) * sp + fz * fl * 10,
              size: rand(1.2, 2), grow: 5, drag: 3.4, life: rand(0.7, 1.1), alpha: 0.26 * Math.min(1, dK), fadeIn: 0.01,
              c0: sc(pal.dust, 0.95), cell: 2
            });
          }
        }
        const nK = nq(hei ? 5 : 3);
        for (let i = 0; i < nK; i++) {
          let a = Math.random() * 6.283;
          if (fl > 0.2 && Math.random() < 0.6) a = Math.atan2(fz, fx) + (Math.random() - 0.5) * 2;
          const r = rand(5, 17), px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r, gy = this.groundAt(px, pz);
          this.smoke.add({
            x: px, y: gy + 0.4, z: pz, vx: Math.cos(a) * rand(2, 6), vy: rand(8, 16), vz: Math.sin(a) * rand(2, 6),
            size: rand(0.5, 0.9), grow: 2.4, drag: 1.6, grav: 45, life: rand(0.4, 0.75), alpha: wet ? 0.35 : 0.55, fadeIn: 0.01,
            c0: wet ? sc(pal.dark, 1.6) : sc(pal.dust, 0.9), cell: 2, delay: rand(0.005, 0.03)
          });
        }
      }
      // 7. Cục đất / vụn đá 3D: đất & bùn có cục, cát khô hiếm (cát rời không vón), đá & nhựa đường ra vụn sắc
      const nC = hard ? 3 : mat === 'asphalt' ? 2 : wet ? 3 : sand ? (Math.random() < 0.3 ? 1 : 0) : 2;
      for (let i = 0, n3 = nq(nC * (big ? 1.5 : 1)); i < n3; i++) {
        const d = cone(0.6), sp = rand(18, 42) * k;
        const base = hard || mat === 'asphalt' ? pal.rock : wet ? pal.dark : pal.soil;
        const tone = rand(0.75, 1.1);
        this.rocks.add({
          x: x + rand(-0.3, 0.3), y: y0 + 0.5, z: z + rand(-0.3, 0.3),
          vx: d[0] * sp / ROCK_VK, vy: d[1] * sp / ROCK_VK, vz: d[2] * sp / ROCK_VK,
          size: rand(0.1, 0.26) * (big ? 1.3 : 1), life: rand(3, 4), restLife: rand(150, 300),
          c: [base[0] * tone, base[1] * tone, base[2] * tone]
        });
      }
      // 8. Đạn cháy: có thể bén cỏ khô (cát / đá / bùn gần như không)
      if (inc && Math.random() < 0.6 * (pal.fire !== undefined ? pal.fire : 1)) {
        this.emitters.push({ x: x + rand(-1, 1), z: z + rand(-1, 1), y: ground, t: 0, dur: rand(0.6, 1.2), acc: 0, rate: 10, size: 1.6 * 0.6 });
      }
    }

    /**
     * Đạn nhỏ găm vào thân cây (game: TREE). Tìm cây trúng (opts.tree hoặc cây gần nhất), dò đúng mặt thân cây đang hiện để
     * dán vết (thân cây thuôn nhỏ dần theo chiều cao), hiệu ứng dằm gỗ / vỏ cây / lá rụng theo loại cây.
     */
    treeBulletHit(x, y, z, D, ammoType, opts = {}) {
      const T = this.terrainOf(), tf = opts.treeField || (T && T.trees);
      let it = opts.tree || null;
      if (!it && tf && tf.near) {
        let best = 1e9;
        for (const c of tf.near(x, z, 14)) { const dd = Math.abs(Math.hypot(c.x - x, c.z - z) - (c.trunkR || 0)); if (dd < best) { best = dd; it = c; } }
      }
      const P = new THREE.Vector3(x, y, z);
      let N = opts.normal ? new THREE.Vector3(opts.normal.x, opts.normal.y || 0, opts.normal.z) : null;
      if (it) N = new THREE.Vector3(x - it.x, 0, z - it.z);
      if (!N || N.lengthSq() < 1e-6) N = new THREE.Vector3(-D.x, 0, -D.z);
      N.normalize();
      // dò tia vào đúng thân cây (instance của cây này) từ phía ngoài vào
      const mesh = it && it.V && it.V.trunk && it.V.trunk.mesh;
      if (mesh) {
        const rc = this._rcTree || (this._rcTree = new THREE.Raycaster());
        const R = (it.trunkR || 2) + 6;
        rc.set(new THREE.Vector3(it.x + N.x * R, y, it.z + N.z * R), N.clone().negate());
        rc.far = R + 2;
        mesh.updateMatrixWorld(true);
        const h = rc.intersectObject(mesh, false).find(q => q.instanceId === it.ti);
        if (h) {
          P.copy(h.point);
          if (h.face) {
            const im = new THREE.Matrix4();
            mesh.getMatrixAt(it.ti, im);
            const nw = h.face.normal.clone().transformDirection(new THREE.Matrix4().multiplyMatrices(mesh.matrixWorld, im));
            if (nw.dot(N) > 0.2) N.copy(nw).normalize();
          }
        }
      }
      const info = it && it.V && it.V.info ? it.V.info : {};
      const cactus = info.barkKind === 'cactus' || (it && it.kind === 'cactus');
      const LEAF = { broad: [0.3, 0.42, 0.16], needle: [0.2, 0.3, 0.14], frond: [0.36, 0.44, 0.18], jungle: [0.22, 0.36, 0.12], dry: [0.5, 0.44, 0.22] };
      const BARK = { oak: [0.26, 0.19, 0.13], pine: [0.32, 0.2, 0.12], palm: [0.42, 0.34, 0.24], dead: [0.36, 0.32, 0.28] };
      this.spawnBulletSurfaceImpact(P, N, D, ammoType, cactus ? 'cactus' : 'wood', {
        bark: BARK[info.barkKind], leaf: info.crownKind && LEAF[info.crownKind],
        crownY: it ? it.y + it.height * 0.78 : null, crownR: it ? Math.max(3, it.height * 0.16) : 5, cx: it && it.x, cz: it && it.z
      });
      const big = ammoType !== 'SCOUT_BULLET';
      (cactus ? this.treePits.cactus : this.treePits.wood).add(P, N, (cactus ? 1.5 : 1.6) * (big ? 1.5 : 1), { x: 0, y: 1, z: 0 }, it);
    }

    /**
     * Đạn nhỏ (12.7mm / 30mm) trúng bề mặt KHÔNG phải đất. Ngoài đời:
     *  - steel (giáp xe): đạn thép / chì đập vào thép tóe chùm tia lửa ngắn văng theo hướng phản xạ + chớp nhỏ + chút bụi sơn
     *    xám; không có bụi đất, không văng cục kim loại. 30mm nổ-mảnh: chớp nổ, cầu lửa nhỏ, khói thuốc nổ xám đen, mảnh văng
     *    rạch thành vệt sáng sát bề mặt.
     *  - glass: kính vụn lấp lánh rơi; rubber: vụn cao su đen; cloth (lưới ngụy trang): vụn lá / sợi bay phất phơ
     *  - concrete / rock: bụi xi măng (đá) xám sáng phụt ra như đám mây + vụn bê tông văng; lõi thép đạn chỉ tóe vài tia lửa
     *  - plaster (tường nhà): bụi vữa, không tia lửa (vụn tường do hệ phá nhà tự văng)
     *  - wood (thân cây): dằm gỗ tươi màu sáng + mảnh vỏ cây sẫm văng ra, mùn gỗ bay, vài chiếc lá rụng từ tán; không tia lửa
     *  - cactus: thịt xương rồng xanh nhạt & nhựa văng tóe
     */
    spawnBulletSurfaceImpact(p, n, d, ammoType, surf, opts = {}) {
      const hei = ammoType === 'GATLING_BULLET', inc = ammoType === 'INCENDIARY', big = hei || inc;
      const now = this._clock || 0;
      this._bhRate = (this._bhRate || 0) * Math.exp(-(now - (this._bhT || 0)) * 2) + 1;
      this._bhT = now;
      const q = Math.min(1, 5 / this._bhRate);
      const nq = (v) => { const x = v * q, f = Math.floor(x); return f + (Math.random() < x - f ? 1 : 0); };
      const N = new THREE.Vector3(n.x, n.y, n.z).normalize();
      const D = new THREE.Vector3(d.x, d.y, d.z).normalize();
      if (N.dot(D) > 0) N.negate();
      const R = D.clone().addScaledVector(N, -2 * D.dot(N));               // hướng phản xạ
      const T1 = new THREE.Vector3().crossVectors(N, Math.abs(N.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize();
      const T2 = new THREE.Vector3().crossVectors(N, T1);
      // hướng ngẫu nhiên quanh trục ax (trộn pháp tuyến), độ toả spread
      const cone = (ax, spread) => {
        const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * spread;
        const v = ax.clone().addScaledVector(T1, Math.cos(a) * r).addScaledVector(T2, Math.sin(a) * r).normalize();
        if (v.dot(N) < 0.05) v.addScaledVector(N, 0.1 - v.dot(N)).normalize();
        return v;
      };
      const out = (k) => N.clone().multiplyScalar(k).add(R.clone().multiplyScalar(1 - k)).normalize();
      const x = p.x + N.x * 0.3, y = p.y + N.y * 0.3, z = p.z + N.z * 0.3;
      const sc = (c, k) => [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)];
      const W = typeof window !== 'undefined' && window.game && window.game.ballistics && window.game.ballistics.wind;
      const wax = W ? Math.max(-6, Math.min(6, (W.vx || 0) * 0.4)) : 0, waz = W ? Math.max(-6, Math.min(6, (W.vz || 0) * 0.4)) : 0;
      const grains = (n0, col, s0, s1, v0, v1, axis, spread, grav = 78, life = [0.4, 0.8], drag = 0.6) => {
        for (let i = 0, nn = nq(n0); i < nn; i++) {
          const v = cone(axis, spread), sp = rand(v0, v1);
          this.smoke.add({ x, y, z, vx: v.x * sp, vy: v.y * sp, vz: v.z * sp, size: rand(s0, s1), grow: 0.05, drag, grav,
            life: rand(life[0], life[1]), alpha: 1, fadeIn: 0.004, fadePow: 0.5, c0: sc(col, rand(0.8, 1.1)), cell: 2, rotV: 0 });
        }
      };
      const puff = (n0, col, s0, s1, v0, v1, axis, spread, life, alpha, grow = 3, drag = 2.2, grav = -0.5, cell = 2) => {
        for (let i = 0, nn = Math.max(1, nq(n0)); i < nn; i++) {
          const v = cone(axis, spread), sp = rand(v0, v1);
          this.smoke.add({ x: x + rand(-0.3, 0.3), y: y + rand(-0.3, 0.3), z: z + rand(-0.3, 0.3), vx: v.x * sp, vy: v.y * sp, vz: v.z * sp, ax: wax, az: waz,
            size: rand(s0, s1), grow, drag, grav, life: rand(life[0], life[1]), alpha, fadeIn: 0.02, fadePow: 1.3,
            c0: sc(col, rand(0.92, 1.05)), cell, delay: rand(0, 0.03), floor: false });
        }
      };
      const sparks = (n0, s0, s1, v0, v1, axis, spread, life = [0.1, 0.3]) => {
        for (let i = 0, nn = nq(n0); i < nn; i++) {
          const v = cone(axis, spread), sp = rand(v0, v1);
          if (i % 2) this.streaks.add({ x, y, z, vx: v.x * sp, vy: v.y * sp, vz: v.z * sp, life: rand(life[0], life[1]) * 0.7, grav: 90, drag: 1.5, tail: 0.012 });
          else this.fire.add({ x, y, z, vx: v.x * sp, vy: v.y * sp, vz: v.z * sp, size: rand(s0, s1), grow: -0.5, drag: 1.4, grav: 90,
            life: rand(life[0], life[1]), alpha: 1, fadeIn: 0.003, c0: [1, 0.9, 0.62], c1: [1, 0.5, 0.15], cell: 3 });
        }
      };
      const flash = (s, life, c0 = [1, 0.93, 0.78]) => this.fire.add({ x, y, z, vx: 0, vy: 0, vz: 0, size: s, grow: s * 4, life, alpha: 1, fadeIn: 0.003, c0, cell: 3, floor: false });
      const heiBurst = (smokeCol) => {
        flash(inc ? 4.5 : 5.5, 0.05, inc ? [1, 0.78, 0.45] : [1, 0.94, 0.8]);
        for (let i = 0; i < 2; i++) {
          const v = out(0.7);
          this.fire.add({ x, y, z, vx: v.x * 12, vy: v.y * 12, vz: v.z * 12, size: rand(1.8, 2.6), grow: 9, drag: 4, life: inc ? 0.16 : rand(0.07, 0.11),
            alpha: 0.95, fadeIn: 0.004, c0: [1, 0.72, 0.36], c1: [0.55, 0.22, 0.06], cell: 1, floor: false });
        }
        // khói thuốc nổ: xám đen (đạn nổ) / trắng xám (chất cháy)
        puff(3, inc ? [0.66, 0.65, 0.62] : smokeCol, 1.4, 2.2, 3, 8, N, 0.6, [1.2, 2.2], 0.42, 4, 1.6, -1.5, 0);
        // mảnh vỏ đạn: vệt sáng ngắn bay toả sát bề mặt
        for (let i = 0, nn = nq(6); i < nn; i++) {
          const a = Math.random() * 6.283, v = T1.clone().multiplyScalar(Math.cos(a)).addScaledVector(T2, Math.sin(a)).addScaledVector(N, rand(0.1, 0.6)).normalize(), sp = rand(180, 320);
          this.streaks.add({ x, y, z, vx: v.x * sp, vy: v.y * sp, vz: v.z * sp, life: rand(0.05, 0.11), grav: 60, drag: 2.5, tail: 0.016 });
        }
        if (inc) this.spawnIncendiarySplash(x, y, z, 0.17);
      };

      if (surf === 'steel') {
        if (big) { heiBurst([0.22, 0.21, 0.2]); sparks(8, 0.4, 0.8, 80, 200, out(0.4), 0.8); }
        else {
          // chớp va đập rất ngắn + chùm tia lửa văng theo hướng phản xạ (giáp dày nhiều tia, thép mỏng bị xuyên ít tia hơn)
          flash(opts.pen ? 1.6 : 2.4, 0.035);
          sparks(opts.pen ? 6 : 14, 0.3, 0.65, 60, 210, out(0.35), 0.75, [0.08, 0.3]);
        }
        puff(big ? 2 : 1, [0.55, 0.54, 0.5], 0.7, 1.3, 2, 6, N, 0.5, [0.5, 0.9], 0.3, 2.5);
      } else if (surf === 'glass') {
        flash(1.2, 0.03, [0.9, 0.95, 1]);
        grains(10, [0.86, 0.9, 0.93], 0.15, 0.3, 15, 45, out(0.6), 0.9, 78, [0.5, 0.9]);
        if (big) heiBurst([0.25, 0.24, 0.23]);
      } else if (surf === 'rubber') {
        grains(6, [0.08, 0.08, 0.08], 0.18, 0.35, 15, 40, out(0.6), 0.8);
        puff(1, [0.5, 0.48, 0.45], 0.8, 1.2, 2, 5, N, 0.5, [0.5, 0.9], 0.25);
        if (big) heiBurst([0.2, 0.19, 0.18]);
      } else if (surf === 'cloth') {
        // lưới ngụy trang: vụn lá vải bay phất phơ, rơi chậm
        for (let i = 0, nn = nq(7); i < nn; i++) {
          const v = cone(out(0.6), 0.9), sp = rand(8, 25), g = Math.random();
          this.smoke.add({ x, y, z, vx: v.x * sp, vy: v.y * sp + 4, vz: v.z * sp, size: rand(0.25, 0.5), grow: 0, drag: 3, grav: 14,
            life: rand(1.2, 2.2), alpha: 1, fadeIn: 0.01, fadePow: 0.6, c0: g < 0.5 ? [0.3, 0.36, 0.16] : [0.5, 0.42, 0.26], cell: 2 });
        }
        if (big) heiBurst([0.22, 0.21, 0.2]);
      } else if (surf === 'concrete' || surf === 'rock' || surf === 'plaster') {
        const dust = opts.dust || (surf === 'rock' ? [0.78, 0.76, 0.72] : [0.95, 0.94, 0.9]);
        const chip = opts.chip || (surf === 'rock' ? [0.56, 0.54, 0.5] : [0.72, 0.71, 0.68]);
        if (big) heiBurst(sc(dust, 0.35));
        if (surf === 'plaster') {
          // tường nhà: bụi vữa & vụn gạch do hệ phá nhà (Destructibles) tự tạo theo vật liệu tường -> chỉ thêm ít vụn nhỏ
          grains(4, chip, 0.12, 0.25, 35, 80, out(0.6), 0.7, 78, [0.5, 0.9]);
          return;
        }
        if (!big) {
          // lõi thép đạn đập đá / bê tông: vài tia lửa nhỏ, chớp rất ngắn
          flash(1.4, 0.03);
          sparks(surf === 'rock' ? 5 : 3, 0.3, 0.55, 60, 160, out(0.4), 0.7, [0.06, 0.18]);
        }
        // bụi xi măng / bụi đá phụt thành đám theo pháp tuyến rồi nở to, trôi theo gió
        puff(big ? 7 : 5, dust, big ? 2.0 : 1.4, big ? 3.2 : 2.4, 12, 34, out(0.75), 0.55, [1.0, 2.0], 0.55, big ? 5 : 3.6, 2.4, 6);
        // vụn bê tông / đá văng nhanh rồi rơi
        grains(big ? 14 : 8, chip, 0.12, 0.3, 35, 95, out(0.6), 0.7, 78, [0.5, 1.0]);
        for (let i = 0, nn = nq(big ? 3 : 1.5); i < nn; i++) {
          const v = cone(out(0.6), 0.7), sp = rand(30, 60);
          this.bits.add({ x, y, z, vx: v.x * sp / ROCK_VK, vy: v.y * sp / ROCK_VK, vz: v.z * sp / ROCK_VK, size: rand(0.1, 0.24), life: 3, restLife: rand(150, 300), c: sc(chip, rand(0.85, 1.1)) });
        }
      } else if (surf === 'wood' || surf === 'cactus') {
        const cactus = surf === 'cactus';
        if (big) heiBurst([0.24, 0.22, 0.2]);
        if (cactus) {
          grains(12, [0.5, 0.64, 0.32], 0.18, 0.38, 15, 55, out(0.6), 0.75, 78, [0.4, 0.8]);
          puff(1, [0.62, 0.72, 0.5], 0.8, 1.2, 3, 8, N, 0.5, [0.4, 0.7], 0.3);
        } else {
          // dằm gỗ tươi (sáng) bay nhanh, mảnh vỏ cây (sẫm) to & chậm hơn, mùn gỗ mịn bay lơ lửng
          grains(big ? 14 : 9, [0.82, 0.7, 0.5], 0.12, 0.26, 35, 90, out(0.55), 0.6, 78, [0.5, 0.9]);
          grains(big ? 6 : 4, opts.bark || [0.26, 0.19, 0.13], 0.25, 0.45, 15, 40, out(0.7), 0.8, 78, [0.6, 1.0], 1.2);
          puff(big ? 3 : 2, [0.7, 0.6, 0.45], 0.8, 1.4, 4, 12, out(0.7), 0.5, [0.7, 1.3], 0.35, 2.6);
          for (let i = 0, nn = nq(big ? 2 : 1); i < nn; i++) {
            const v = cone(out(0.6), 0.6), sp = rand(25, 50);
            this.bits.add({ x, y, z, vx: v.x * sp / ROCK_VK, vy: v.y * sp / ROCK_VK, vz: v.z * sp / ROCK_VK, size: rand(0.08, 0.18), life: 3, restLife: rand(150, 300), c: [0.78, 0.64, 0.44] });
          }
        }
        // thân cây rung: vài chiếc lá rụng lả tả từ tán (rơi chậm, đung đưa)
        if (opts.crownY && opts.leaf && Math.random() < (big ? 0.9 : 0.6)) {
          for (let i = 0, nn = big ? 4 : 2; i < nn; i++) {
            const a = Math.random() * 6.283, r = rand(1, opts.crownR || 6);
            this.smoke.add({ x: (opts.cx || p.x) + Math.cos(a) * r, y: opts.crownY + rand(-2, 2), z: (opts.cz || p.z) + Math.sin(a) * r,
              vx: rand(-2, 2), vy: rand(-1, 0), vz: rand(-2, 2), ax: wax * 0.6 + rand(-1.5, 1.5), az: waz * 0.6 + rand(-1.5, 1.5),
              size: rand(0.35, 0.6), grow: 0, drag: 2.8, grav: 6, life: rand(4, 7), alpha: 1, fadeIn: 0.2, fadePow: 0.5,
              c0: sc(opts.leaf, rand(0.8, 1.15)), cell: 2, delay: rand(0.05, 0.5), rotV: rand(-3, 3) });
          }
        }
      }
    }

    // Dò tia từ điểm A theo hướng dir vào mô hình xe, bỏ qua thanh máu / hiệu ứng / vết đạn
    hitUnitSurface(u, origin, dir, far) {
      const rc = this._rc2 || (this._rc2 = new THREE.Raycaster());
      rc.set(origin, dir);
      rc.far = far;
      u.group.updateMatrixWorld(true);
      for (const h of rc.intersectObject(u.group, true)) {
        const o = h.object;
        if (!o.visible || o.userData.isFxDecal || o === u.hpBarMesh || o === u.hpBgMesh || o === u.reactiveArmorMesh) continue;
        const m = Array.isArray(o.material) ? o.material[0] : o.material;
        if (m && (m.blending === THREE.AdditiveBlending || m.isMeshBasicMaterial)) continue;
        const n = h.face ? h.face.normal.clone().transformDirection(o.matrixWorld) : dir.clone().negate();
        if (n.dot(dir) > 0) n.negate();
        return { point: h.point, normal: n, object: o, distance: h.distance, faceIndex: h.faceIndex, instanceId: h.instanceId };
      }
      return null;
    }

    // Vết mảnh văng rỗ quanh một điểm trên bề mặt
    addFragmentPocks(hit, u, count, spread) {
      const n = hit.normal.clone().normalize();
      const t1 = new THREE.Vector3(0, 1, 0).cross(n);
      if (t1.lengthSq() < 1e-4) t1.set(1, 0, 0);
      t1.normalize();
      const t2 = new THREE.Vector3().crossVectors(n, t1);
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spread;
        const p = hit.point.clone().addScaledVector(t1, Math.cos(a) * r).addScaledVector(t2, Math.sin(a) * r);
        // Dò lại để vết rỗ nằm trên bề mặt thật (không lơ lửng ở mép)
        const again = this.hitUnitSurface(u, p.clone().addScaledVector(n, 3), n.clone().negate(), 6);
        if (again) this.addSurfaceMark(again.point, again.normal, again.object, 'metalHole', rand(0.5, 1.1), { unit: u });
      }
    }

    markNearbyVehicles(x, y, z, s, prof, opts) {
      const units = this.unitsProvider() || [];
      const R = (prof.kind === 'blast' ? 42 : 26) * s * (opts.heavy ? 1.3 : 1);
      const origin = new THREE.Vector3(x, y + 2, z);
      for (const u of units) {
        if (!u || !u.group || !u.group.visible) continue;
        const ux = u.group.position.x, uz = u.group.position.z;
        const d2 = Math.hypot(ux - x, uz - z);
        if (d2 > R + 25) continue;
        const target = new THREE.Vector3(ux, u.group.position.y + 8, uz);
        const dir = target.clone().sub(origin);
        const len = dir.length();
        if (len < 1e-3) continue;
        dir.divideScalar(len);
        const hit = this.hitUnitSurface(u, origin, dir, len + 20);
        if (!hit || hit.distance > R) continue;
        const k = 1 - hit.distance / R;
        if (k > 0.25) this.addSurfaceMark(hit.point, hit.normal, hit.object, 'scorch', (6 + 10 * k) * s, { unit: u });
        this.addFragmentPocks(hit, u, Math.round(3 + 9 * k), 3 + 5 * s);
        this.trackVehicle(u);
      }
    }

    // Phóng tên lửa từ ống: chớp nhỏ ở miệng ống, luồng phụt ngược + khói trắng dày phía sau ống
    missileLaunch(tip, dir, rear) {
      this.fire.add({ x: tip.x, y: tip.y, z: tip.z, vx: dir.x * 30, vy: dir.y * 30, vz: dir.z * 30, size: 6, grow: 20, life: 0.08, alpha: 1, fadeIn: 0.004, c0: [1, 0.9, 0.7], cell: 3, floor: false });
      const back = dir.clone().negate();
      for (let i = 0; i < 10; i++) {
        const sp = rand(60, 140);
        this.fire.add({
          x: rear.x, y: rear.y, z: rear.z, vx: back.x * sp + rand(-10, 10), vy: back.y * sp + rand(-4, 10), vz: back.z * sp + rand(-10, 10),
          size: rand(3, 5), grow: 14, drag: 4, life: rand(0.12, 0.25), alpha: 1, fadeIn: 0.005, c0: [1, 0.85, 0.55], c1: [1, 0.4, 0.1], cell: 1, floor: false
        });
      }
      for (let i = 0; i < 14; i++) {
        const sp = rand(20, 90);
        const g = rand(0.8, 0.92);
        this.smoke.add({
          x: rear.x, y: rear.y, z: rear.z, vx: back.x * sp + rand(-12, 12), vy: back.y * sp + rand(0, 10), vz: back.z * sp + rand(-12, 12),
          size: rand(4, 7), grow: 9, drag: 2.2, grav: -2, life: rand(2, 3.5), alpha: 0.55, fadeIn: 0.03, c0: [g, g, g], cell: Math.random() < 0.5 ? 0 : 2
        });
      }
    }

    // Vệt khói / lửa đuôi đạn đang bay (hỗ trợ nội suy đoạn đường để khói tên lửa liền mạch, dày đặc và cuộn trào)
    // info: { travel (quãng đã bay), tracer (viên vạch đường), burnedOut (RPG hết nhiên liệu), guided (tên lửa có điều khiển) }
    trail(x, y, z, ammoType, prevX, prevY, prevZ, info = {}) {
      if ((ammoType === 'RPG' || ammoType === 'ANTI_TANK_MISSILE') && info.burnedOut) return;   // bay quán tính: hết khói
      // Tên lửa có điều khiển qua pha phóng / tăng tốc (~15 m đầu): động cơ hành trình cháy sạch -> khói mỏng lấm tấm
      if ((ammoType === 'RPG' || ammoType === 'ANTI_TANK_MISSILE') && info.guided && (info.travel || 0) > 120) {
        const hasPrev = prevX !== undefined;
        const dx = hasPrev ? x - prevX : 0, dy = hasPrev ? y - prevY : 0, dz = hasPrev ? z - prevZ : 0;
        const dist = Math.hypot(dx, dy, dz);
        const steps = hasPrev && dist > 0.1 ? Math.min(8, Math.max(1, Math.ceil(dist / 7.5))) : 1;
        for (let i = 0; i < steps; i++) {
          const t = steps === 1 ? 1 : (i + 0.5) / steps;
          const g = rand(0.86, 0.95);
          this.smoke.add({
            x: (hasPrev ? prevX + dx * t : x) + rand(-0.3, 0.3), y: (hasPrev ? prevY + dy * t : y) + rand(-0.3, 0.3), z: (hasPrev ? prevZ + dz * t : z) + rand(-0.3, 0.3),
            vx: rand(-0.8, 0.8), vy: rand(0.4, 1.4), vz: rand(-0.8, 0.8),
            size: rand(1.4, 2.2), grow: rand(3.5, 5.5), drag: 1.4, grav: -0.4, life: rand(0.9, 1.5),
            alpha: 0.26, fadeIn: 0.03, fadePow: 1.2, c0: [g, g, g], cell: 0, floor: false
          });
        }
        return;
      }
      if (ammoType === 'RPG' || ammoType === 'ANTI_TANK_MISSILE') {
        const hasPrev = prevX !== undefined && prevY !== undefined && prevZ !== undefined;
        const dx = hasPrev ? (x - prevX) : 0;
        const dy = hasPrev ? (y - prevY) : 0;
        const dz = hasPrev ? (z - prevZ) : 0;
        const dist = Math.hypot(dx, dy, dz);

        // Bước rải hạt dày đặc (2.8 đơn vị): các hạt khói đường kính 5-8 gối đè lên nhau, tạo dải khói đặc quánh liên tục
        const stepDist = 2.8;
        const steps = (hasPrev && dist > 0.1) ? Math.min(24, Math.max(1, Math.ceil(dist / stepDist))) : 1;
        const invSteps = 1 / steps;

        // Vector hướng bay chuẩn hóa (để tống luồng khói phụt ngược lại phía sau ống xả)
        const fLen = dist || 1;
        const backX = -dx / fLen;
        const backY = -dy / fLen;
        const backZ = -dz / fLen;

        for (let i = 0; i < steps; i++) {
          const t = steps === 1 ? 1 : (i + 0.5) * invSteps;
          // Nội suy vị trí dọc theo quãng đường bay từ điểm trước đến điểm hiện tại
          const px = hasPrev ? (prevX + dx * t) : x;
          const py = hasPrev ? (prevY + dy * t) : y;
          const pz = hasPrev ? (prevZ + dz * t) : z;

          // Độ loang nhẹ vuông góc với trục bay để dải khói có độ xốp và gợn sóng tự nhiên
          const jitter = 0.55;
          const jx = (Math.random() - 0.5) * jitter;
          const jy = (Math.random() - 0.5) * jitter;
          const jz = (Math.random() - 0.5) * jitter;

          // Tông màu khói: khói động cơ tên lửa nhiên liệu rắn màu xám trắng đặc quện
          const g = rand(0.82, 0.92);
          const isNearTail = t >= 0.8;
          const col = isNearTail ? [g * 1.05, g * 0.98, g * 0.88] : [g, g, g];

          this.smoke.add({
            x: px + jx,
            y: py + jy,
            z: pz + jz,
            // Luồng phụt tống ra sau và bốc nhẹ lên trời do nhiệt lượng
            vx: backX * rand(2.0, 5.0) + rand(-1.2, 1.2),
            vy: backY * rand(1.0, 3.0) + rand(0.8, 2.4),
            vz: backZ * rand(2.0, 5.0) + rand(-1.2, 1.2),
            size: rand(2.5, 3.8),
            grow: rand(6.5, 9.5),
            drag: 1.4,
            grav: -0.6, // Nhiệt độ khói ấm làm bốc nhẹ lên trên
            life: rand(1.8, 2.8),
            alpha: 0.68,
            fadeIn: 0.03,
            fadePow: 1.2,
            c0: col,
            cell: 0, // Dùng cell khói thể tích 3D mềm mại
            floor: false
          });

          // Ở ngay sát loa phụt: thêm đốm lửa phụt rực sáng nối liền đuôi tên lửa vào dải khói
          if (isNearTail && Math.random() < 0.6 && this.fire) {
            this.fire.add({
              x: px + backX * 1.2,
              y: py + backY * 1.2,
              z: pz + backZ * 1.2,
              vx: backX * rand(4, 8),
              vy: backY * rand(4, 8) + rand(0, 1),
              vz: backZ * rand(4, 8),
              size: rand(1.6, 2.4),
              grow: 1.5,
              drag: 2.5,
              grav: 0,
              life: rand(0.06, 0.12),
              alpha: 0.85,
              fadeIn: 0.01,
              c0: [1.0, 0.75, 0.3],
              cell: 1,
              floor: false
            });
          }
        }
      } else if (ammoType === 'INCENDIARY') {
        // Đạn cháy: vệt đỏ rực trên mô hình + tàn lửa đỏ rơi rớt dọc đường bay (chỉ viên vạch đường đang cháy)
        if (info.tracer !== false && Math.random() < 0.5) this.fire.add({ x, y, z, vx: rand(-4, 4), vy: rand(-3, 3), vz: rand(-4, 4), size: rand(0.5, 0.9), grow: -0.3, drag: 2, grav: 30, life: rand(0.15, 0.35), alpha: 1, fadeIn: 0.005, c0: [1, 0.45, 0.12], c1: [0.7, 0.08, 0.02], cell: 1, floor: false });
      } else if (ammoType === 'GATLING_BULLET' || ammoType === 'SCOUT_BULLET') {
        // Đạn nhỏ: vệt vạch đường đã có trên mô hình, không cần khói
      } else {
        // Đạn pháo: vệt khói mờ của ống vạch đường / bộ tăng tầm
        const hasPrev = prevX !== undefined && prevY !== undefined && prevZ !== undefined;
        const dist = hasPrev ? Math.hypot(x - prevX, y - prevY, z - prevZ) : 0;
        const steps = (hasPrev && dist > 6.0) ? Math.min(4, Math.max(1, Math.ceil(dist / 5.5))) : 1;
        const dx = hasPrev ? (x - prevX) : 0;
        const dy = hasPrev ? (y - prevY) : 0;
        const dz = hasPrev ? (z - prevZ) : 0;

        for (let i = 0; i < steps; i++) {
          const t = steps === 1 ? 1 : (i + 0.5) / steps;
          this.smoke.add({
            x: hasPrev ? (prevX + dx * t) : x,
            y: hasPrev ? (prevY + dy * t) : y,
            z: hasPrev ? (prevZ + dz * t) : z,
            vx: 0, vy: rand(0.5, 2), vz: 0, size: rand(1.6, 2.6), grow: 3.5, drag: 1, grav: -0.5,
            life: rand(0.6, 1.0), alpha: ammoType === 'CLUSTER' ? 0.4 : 0.22, fadeIn: 0.03, c0: [0.82, 0.8, 0.76], cell: 2, floor: false
          });
        }
      }
    }

    addLight(x, y, z, s, life) {
      if (typeof SpgFXPool === 'undefined' || !SpgFXPool.muzzleLight) return;
      const l = SpgFXPool.muzzleLight(this.scene);
      if (!l) return;
      l.position.set(x, y, z);
      l.color.setRGB(1, 0.62, 0.32);
      l.distance = 300 * s;
      this.lights.push({ l, t: 0, life, peak: 7 * Math.sqrt(s) });
    }

    // Rãnh cày của đạn động năng APFSDS: rãnh hào hẹp kéo dài theo hướng bay + 2 luống đất đùn cao 2 bên + ụ đất chắn cuối rãnh + khối đất đá 3D
    addGouge(x, z, dx, dz, len = 28, pal) {
      const t = this.terrainOf();
      if (t && t.noCraterAt && t.noCraterAt(x, z)) return;
      const palName = (t && t.mapType && PALETTES[t.mapType]) ? t.mapType : 'DESERT';
      const actualPal = pal || PALETTES[palName] || PALETTES.DESERT;

      // Hướng bay trên mặt đất và hướng vuông góc ngang
      const fwdLen = Math.hypot(dx, dz) || 1;
      const fx = dx / fwdLen, fz = dz / fwdLen;
      const sx = -fz, sz = fx; // vector vuông góc sang ngang

      const group = new THREE.Group();
      // Điểm tâm rãnh dịch về giữa chiều dài cày
      const midX = x + fx * len * 0.45;
      const midZ = z + fz * len * 0.45;
      group.position.set(midX, 0, midZ);

      // 1. Lưới 3D rãnh cày: 24 phân đoạn dọc x 10 dải ngang
      const xSegs = 24, zSegs = 10;
      const halfW = 2.4; // nửa bề rộng rãnh (~4.8m)
      const positions = [];
      const normals = [];
      const colors = [];
      const uvs = [];
      const indices = [];

      for (let i = 0; i <= xSegs; i++) {
        const u = i / xSegs; // 0 (điểm bắt đầu tiếp xúc) -> 1 (hố cắm cuối rãnh)
        const fDist = (u - 0.5) * len; // khoảng cách tương đối dọc rãnh

        for (let j = 0; j <= zSegs; j++) {
          const v = (j / zSegs) * 2 - 1; // -1 (mép trái) -> 0 (lòng rãnh) -> +1 (mép phải)
          const sDist = v * halfW;

          const wx = midX + fx * fDist + sx * sDist;
          const wz = midZ + fz * fDist + sz * sDist;
          const gy = this.groundAt(wx, wz);

          // Nhiễu bề mặt đất
          const n = (hash2(Math.round(wx * 2), Math.round(wz * 2), 17) - 0.5) * 0.15;

          // Độ cao:
          // Lòng rãnh (|v| < 0.25): khoét sâu xuống
          // Hai bên luống đất (0.25 <= |v| <= 0.75): đùn cao vồng lên 0.6m - 1.2m
          // Mép ngoài (|v| > 0.75): thoái dần về mặt đất
          let relY = 0.05;
          const absV = Math.abs(v);
          if (absV < 0.25) {
            // Lòng rãnh cày sâu: tăng dần độ sâu về cuối rãnh
            relY = 0.08 - (1 - absV / 0.25) * 0.3 * (0.3 + u * 0.7) + n;
          } else if (absV < 0.75) {
            // Luống đất đùn cao 2 bên sườn rãnh
            const tLip = (absV - 0.25) / 0.5;
            const lipPeak = (0.55 + u * 0.65) * (1 + n * 0.4);
            relY = 0.1 + Math.sin(Math.PI * tLip) * lipPeak;
          } else {
            // Sườn ngoài thoải về mặt đất
            const tOut = (absV - 0.75) / 0.25;
            relY = 0.08 + (1 - tOut) * 0.12;
          }

          // Cuối rãnh (u > 0.82): Đất bị ủi dồn lại thành ụ chắn cao phía trước
          if (u > 0.82 && absV < 0.6) {
            const endBump = Math.sin((u - 0.82) / 0.18 * Math.PI) * 0.95;
            relY += endBump;
          }

          positions.push(fx * fDist + sx * sDist, gy + relY, fz * fDist + sz * sDist);
          normals.push(0, 1, 0);
          uvs.push(u, (v + 1) * 0.5);

          // Màu sắc đỉnh: lòng rãnh sẫm màu đất sâu, bờ luống màu đất tươi xới
          const isCore = absV < 0.3;
          const kCol = isCore ? 0.65 : (1.15 + (1 - absV) * 0.35);
          colors.push(actualPal.soil[0] * kCol, actualPal.soil[1] * kCol, actualPal.soil[2] * kCol);
        }
      }

      for (let i = 0; i < xSegs; i++) {
        for (let j = 0; j < zSegs; j++) {
          const a = i * (zSegs + 1) + j;
          const b = (i + 1) * (zSegs + 1) + j;
          const c = (i + 1) * (zSegs + 1) + (j + 1);
          const d = i * (zSegs + 1) + (j + 1);
          indices.push(a, b, d);
          indices.push(b, c, d);
        }
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(indices);
      geo.computeVertexNormals();

      const mat = new THREE.MeshStandardMaterial({
        map: getGougeTexture(palName),
        vertexColors: true,
        roughness: 0.95,
        metalness: 0.05,
        transparent: true,
        polygonOffset: true,
        polygonOffsetFactor: -3,
        polygonOffsetUnits: -3
      });

      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);

      // 2. Thêm 10-14 khối đất đá 3D thật văng dọc 2 mép rãnh
      const clodGeo = new THREE.DodecahedronGeometry(1, 0);
      const clodMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(actualPal.soil[0] * 0.85, actualPal.soil[1] * 0.85, actualPal.soil[2] * 0.85),
        roughness: 0.95,
        metalness: 0.05
      });
      const geos = [geo, clodGeo];
      const mats = [mat, clodMat];

      for (let k = 0; k < 12; k++) {
        const uClod = 0.2 + (k / 12) * 0.75;
        const sideClod = (k % 2 === 0 ? 1 : -1) * (halfW * 0.55 + rand(0.2, 1.2));
        const fD = (uClod - 0.5) * len;
        const cX = fx * fD + sx * sideClod;
        const cZ = fz * fD + sz * sideClod;
        const wX = midX + cX, wZ = midZ + cZ;
        const cY = this.groundAt(wX, wZ) + 0.35;

        const cMesh = new THREE.Mesh(clodGeo, clodMat);
        const cs = rand(0.35, 0.75) * (uClod > 0.7 ? 1.4 : 1.0);
        cMesh.scale.set(cs, cs * rand(0.5, 0.9), cs);
        cMesh.position.set(cX, cY, cZ);
        cMesh.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
        cMesh.castShadow = true;
        cMesh.receiveShadow = true;
        group.add(cMesh);
      }

      this.scene.add(group);
      this.craters.push({ group, mats, geos, t: 0, life: Infinity });   // giữ cả trận; quá maxCraters thì hố cũ nhất bị lấp
      while (this.craters.length > this.maxCraters) {
        const oi = this.craters.findIndex(c => !c.persistent);
        if (oi < 0) break;
        this.removeDecal(this.craters, oi);
      }
    }

    // --- Tách guốc đạn APFSDS: 3 mảnh guốc nhôm bung khỏi mũi tên urani, lộn vòng văng ngang rồi rơi ---
    sabotDiscard(x, y, z, vx, vy, vz) {
      const v = new THREE.Vector3(vx, vy, vz);
      const speed = v.length() || 1;
      const f = v.clone().divideScalar(speed);
      const side = new THREE.Vector3().crossVectors(f, new THREE.Vector3(0, 1, 0));
      if (side.lengthSq() < 1e-4) side.set(1, 0, 0);
      side.normalize();
      const up = new THREE.Vector3().crossVectors(side, f).normalize();
      if (!this._sabotGeo) {
        // Mảnh guốc: 1/3 vỏ trụ + gờ đẩy phía trước
        const g = new THREE.CylinderGeometry(0.62, 0.62, 3.4, 10, 1, true, 0, Math.PI * 2 / 3 - 0.12);
        g.rotateX(Math.PI / 2);
        this._sabotGeo = g;
        this._sabotMat = new THREE.MeshStandardMaterial({ color: 0x9da3a6, roughness: 0.45, metalness: 0.7, side: THREE.DoubleSide });
        this._scoopGeo = new THREE.CylinderGeometry(0.64, 0.64, 0.35, 10, 1, false, 0, Math.PI * 2 / 3 - 0.12);
        this._scoopGeo.rotateX(Math.PI / 2);
        this._scoopGeo.translate(0, 0, -1.5);
      }
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2;
        const radial = side.clone().multiplyScalar(Math.cos(a)).addScaledVector(up, Math.sin(a));
        const grp = new THREE.Group();
        const shell = new THREE.Mesh(this._sabotGeo, this._sabotMat);
        const scoop = new THREE.Mesh(this._scoopGeo, this._sabotMat);
        shell.castShadow = scoop.castShadow = true;
        grp.add(shell); grp.add(scoop);
        grp.position.set(x, y, z).addScaledVector(radial, 0.3);
        grp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), f);
        grp.rotateZ(a);
        this.scene.add(grp);
        const lateral = rand(28, 48);
        this.sabots.push({
          mesh: grp,
          v: f.clone().multiplyScalar(Math.min(260, speed * rand(0.05, 0.08))).addScaledVector(radial, lateral),
          w: new THREE.Vector3(rand(-14, 14), rand(-14, 14), rand(-14, 14)),
          t: 0, life: rand(4, 6), resting: false
        });
      }
      // Khí nòng làm bung guốc đạn: làn khói nhỏ quanh điểm tách
      for (let i = 0; i < 5; i++) {
        this.smoke.add({
          x: x + f.x * rand(4, 14), y: y + f.y * rand(4, 14), z: z + f.z * rand(4, 14),
          vx: rand(-8, 8), vy: rand(2, 8), vz: rand(-8, 8), size: rand(3, 6), grow: 8, drag: 2, grav: -1,
          life: rand(0.8, 1.4), alpha: 0.35, fadeIn: 0.02, c0: [0.85, 0.84, 0.8], cell: 2, floor: false
        });
      }
    }

    updateSabots(dt) {
      for (let i = this.sabots.length - 1; i >= 0; i--) {
        const sb = this.sabots[i];
        sb.t += dt;
        if (sb.t > sb.life) { this.scene.remove(sb.mesh); this.sabots.splice(i, 1); continue; }
        if (!sb.resting) {
          // Lực cản rất lớn: guốc đạn nhẹ, mặt cản to -> mất tốc nhanh
          const drag = Math.exp(-4.2 * dt);
          sb.v.multiplyScalar(drag);
          sb.v.y -= 160 * dt;
          sb.mesh.position.addScaledVector(sb.v, dt);
          sb.mesh.rotation.x += sb.w.x * dt; sb.mesh.rotation.y += sb.w.y * dt; sb.mesh.rotation.z += sb.w.z * dt;
          const gy = this.groundAt(sb.mesh.position.x, sb.mesh.position.z) + 0.5;
          if (sb.mesh.position.y < gy) {
            sb.mesh.position.y = gy;
            if (Math.abs(sb.v.y) < 15) { sb.resting = true; }
            else { sb.v.y *= -0.3; sb.v.x *= 0.5; sb.v.z *= 0.5; sb.w.multiplyScalar(0.5); }
          }
        }
      }
    }

    // Trúng xe: mảnh kim loại sẫm văng ra
    spawnMetalFragments(x, y, z, s) {
      for (let i = 0; i < 5; i++) {
        const a = Math.random() * Math.PI * 2, sp = rand(20, 55) * Math.sqrt(s);
        const g = rand(0.12, 0.25);
        this.hardRocks.add({
          x, y: y + 2, z, vx: Math.cos(a) * sp, vy: rand(40, 100), vz: Math.sin(a) * sp,
          size: rand(0.4, 1.1) * Math.pow(s, 0.5), life: rand(3, 5), c: [g, g, g * 1.05]
        });
      }
    }

    // --- Chùm mảnh văng hình nón: lõi urani vỡ nóng đỏ + vụn vật liệu phụt ra phía sau vật bị xuyên / theo hướng nảy ---
    spallCone(p, dir, count, opts = {}) {
      const d = dir.clone().normalize();
      let u = new THREE.Vector3().crossVectors(d, new THREE.Vector3(0, 1, 0));
      if (u.lengthSq() < 1e-4) u.set(1, 0, 0);
      u.normalize();
      const v = new THREE.Vector3().crossVectors(u, d).normalize();
      const spread = opts.spread || 0.38;
      for (let i = 0; i < count; i++) {
        const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * spread;
        const dd = d.clone().addScaledVector(u, Math.cos(a) * r).addScaledVector(v, Math.sin(a) * r).normalize();
        const sp = rand(220, 520) * (opts.speed || 1);
        this.streaks.add({ x: p.x, y: p.y, z: p.z, vx: dd.x * sp, vy: dd.y * sp, vz: dd.z * sp, drag: 1.1, grav: GRAV, life: rand(0.25, 0.6), tail: rand(0.03, 0.06) });
      }
      // Chớp sáng trắng tại điểm thoát + vụn vật liệu & bụi phụt theo hướng xuyên
      this.fire.add({ x: p.x, y: p.y, z: p.z, vx: d.x * 20, vy: d.y * 20, vz: d.z * 20, size: 7, grow: 16, life: 0.07, alpha: 1, fadeIn: 0.003, c0: [1, 0.95, 0.85], cell: 3, floor: false });
      if (opts.dust) {
        for (let i = 0; i < 10; i++) {
          const sp = rand(40, 120);
          this.smoke.add({ x: p.x, y: p.y, z: p.z, vx: d.x * sp + rand(-12, 12), vy: d.y * sp + rand(-4, 10), vz: d.z * sp + rand(-12, 12),
            size: rand(3, 6), grow: 9, drag: 2.4, grav: 10, life: rand(1.4, 2.6), alpha: 0.6, fadeIn: 0.02, c0: opts.dust, cell: 2 });
        }
        for (let i = 0; i < 4; i++) {
          const sp = rand(60, 160);
          this.hardRocks.add({ x: p.x, y: p.y, z: p.z, vx: d.x * sp + rand(-15, 15), vy: d.y * sp + rand(0, 30), vz: d.z * sp + rand(-15, 15), size: rand(0.4, 1.0), life: rand(3, 5), c: [0.47, 0.46, 0.43] });
        }
      }
    }

    // --- Luồng xuyên nổ lõm (RPG / tên lửa chống tăng) đâm thủng tường / vách: tia kim loại nóng trắng chói lao từ
    //     điểm chạm xuyên qua bề dày tường rồi phụt tiếp ra sau ~5-9 m, chớp sáng + bê tông vỡ phụt ở mặt sau,
    //     miệng lỗ ra còn đỏ rực một lúc. entry: điểm chạm mặt trước, dir: hướng bay, thick: bề dày tường (đơn vị game)
    heatPierce(entry, dir, thick = 7, opts = {}) {
      const d = dir.clone().normalize();
      const k = opts.power || 1;
      const exit = entry.clone().addScaledVector(d, thick);
      if (!this.jetBeams) this.jetBeams = [];
      if (!ExplosionFX._jetGeo) {
        ExplosionFX._jetGeo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true).translate(0, 0.5, 0);
      }
      const mk = (color, op) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false });
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
      // lõi trắng chói + quầng vàng cam rộng hơn
      for (const [r, col, op] of [[0.32, 0xfff6e0, 1], [1.05, 0xffa040, 0.55]]) {
        const m = new THREE.Mesh(ExplosionFX._jetGeo, mk(col, op));
        m.position.copy(entry);
        m.quaternion.copy(q);
        m.scale.set(r * k, 0.01, r * k);
        m.renderOrder = 7;
        m.frustumCulled = false;
        this.scene.add(m);
        this.jetBeams.push({ m, r: r * k, op, t: 0, len: thick + rand(42, 70) * k, speed: rand(2400, 3200), life: rand(0.16, 0.22) });
      }
      // tia mảnh kim loại nóng chạy dọc theo luồng, toả hẹp ra phía sau tường
      let u = new THREE.Vector3().crossVectors(d, new THREE.Vector3(0, 1, 0));
      if (u.lengthSq() < 1e-4) u.set(1, 0, 0);
      u.normalize();
      const v = new THREE.Vector3().crossVectors(u, d).normalize();
      for (let i = 0; i < Math.round(18 * k); i++) {
        const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * 0.12;
        const dd = d.clone().addScaledVector(u, Math.cos(a) * r).addScaledVector(v, Math.sin(a) * r).normalize();
        const sp = rand(900, 1700);
        this.streaks.add({ x: exit.x, y: exit.y, z: exit.z, vx: dd.x * sp, vy: dd.y * sp, vz: dd.z * sp, drag: 3, grav: 30, life: rand(0.12, 0.3), tail: rand(0.02, 0.035) });
      }
      // mặt sau: chớp sáng, bê tông vỡ & bụi phụt theo hướng xuyên (nón rộng hơn đạn động năng), mảnh bê tông văng
      this.fire.add({ x: exit.x, y: exit.y, z: exit.z, vx: d.x * 40, vy: d.y * 40, vz: d.z * 40, size: 12 * k, grow: 30, life: 0.09, alpha: 1, fadeIn: 0.003, c0: [1, 0.97, 0.88], cell: 3, floor: false });
      for (let i = 0; i < 8; i++) {
        const sp = rand(60, 200);
        this.fire.add({ x: exit.x, y: exit.y, z: exit.z, vx: d.x * sp + rand(-20, 20), vy: d.y * sp + rand(-10, 20), vz: d.z * sp + rand(-20, 20),
          size: rand(3, 6) * k, grow: 8, drag: 3, life: rand(0.15, 0.3), alpha: 1, fadeIn: 0.01, fadePow: 1.6, c0: [1, 0.85, 0.5], c1: [1, 0.4, 0.1], cell: 1, floor: false });
      }
      if (!opts.noSpall) this.spallCone(exit, d, Math.round(34 * k), { spread: 0.55, speed: 0.8, dust: [0.72, 0.7, 0.66] });
      // miệng lỗ ra đỏ rực vài giây (kim loại nóng chảy bám thành lỗ) + khói mỏng
      this.emitters.push({ x: exit.x, y: exit.y - 0.5, z: exit.z, t: 0, dur: rand(1.2, 2), acc: 0, rate: 7, size: 1.1 });
      this.addLight(exit.x, exit.y, exit.z, 1.6 * k, 0.12);
    }
    updateJetBeams(dt) {
      const L = this.jetBeams;
      for (let i = L.length - 1; i >= 0; i--) {
        const b = L[i];
        b.t += dt;
        if (b.t >= b.life) {
          this.scene.remove(b.m);
          b.m.material.dispose();
          L.splice(i, 1);
          continue;
        }
        // mũi luồng lao đi rất nhanh rồi cả luồng tắt dần, mảnh lại
        const len = Math.min(b.len, b.speed * b.t);
        const f = 1 - b.t / b.life;
        b.m.scale.set(b.r * (0.4 + 0.6 * f), Math.max(0.01, len), b.r * (0.4 + 0.6 * f));
        b.m.material.opacity = b.op * f * f;
      }
    }

    // --- Đạn nổ dưới mặt nước: vòm nước phồng -> cột nước trắng xóa vọt cao rồi đổ xuống, sóng mù lan, gợn sóng ---
    waterBurst(x, y, z, ammoType = 'NORMAL', heavy = false, depth = 6) {
      const prof = PROFILES[ammoType] || PROFILES.NORMAL;
      const micro = !!prof.micro;
      // bom con ~30-40 g thuốc nổ (cỡ đầu đạn 30mm): cột nước vài mét, không phải gần 9 m như trước
      const k = micro ? 0.12 : prof.kind === 'bomblet' ? 0.12 : (prof.size || 1) * (heavy ? 1.7 : 1) / 1.65;
      const shallow = depth < 3.5;
      const W = [0.9, 0.94, 0.97], M = [0.55, 0.5, 0.4];
      const col = () => (shallow && Math.random() < 0.35 ? M : W);
      // Vòm nước phồng lên mặt nước (khí nổ đẩy nước lên trước khi phá vỡ mặt nước)
      for (let i = 0; i < Math.round(10 * k) + 2; i++) {
        const a = Math.random() * 6.283, r = rand(0, 6) * k;
        this.smoke.add({ x: x + Math.cos(a) * r, y: y + 0.5, z: z + Math.sin(a) * r, vx: Math.cos(a) * 20 * k, vy: rand(20, 45) * Math.sqrt(k), vz: Math.sin(a) * 20 * k,
          size: rand(8, 14) * Math.sqrt(k), grow: 10 * k, drag: 3, grav: 60, life: rand(0.5, 0.9), alpha: 0.85, fadeIn: 0.01, c0: [0.82, 0.88, 0.9], cell: 2 });
      }
      // Cột nước chính: nhiều lớp phun thẳng đứng, đỉnh xòe ra rồi rơi xuống như mưa
      const H = (micro ? 28 : 110) * Math.sqrt(k);
      const nCol = micro ? 6 : Math.round(60 * Math.min(2.2, k)) + 10;
      for (let i = 0; i < nCol; i++) {
        const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * 5 * Math.sqrt(k);
        const vy = Math.sqrt(2 * 160 * H) * rand(0.45, 1.0);
        const spread = rand(4, 16) * Math.sqrt(k) * (vy / 180 > 0.8 ? 1.4 : 1);
        this.smoke.add({ x: x + Math.cos(a) * r, y: y + rand(0, 2), z: z + Math.sin(a) * r,
          vx: Math.cos(a) * spread, vy, vz: Math.sin(a) * spread,
          size: rand(4, 8) * Math.sqrt(k), grow: 7 * Math.sqrt(k), drag: 0.6, grav: 160, life: rand(2.2, 3.6), alpha: 0.9, fadeIn: 0.01, c0: col(), cell: 2, delay: rand(0, 0.08) });
      }
      // Tán nước xòe ngang ở đỉnh & bụi nước bắn chéo
      for (let i = 0; i < (micro ? 6 : Math.round(30 * Math.min(2, k))); i++) {
        const a = Math.random() * 6.283, sp = rand(30, 90) * Math.sqrt(k), el = rand(0.5, 1.2);
        this.smoke.add({ x, y: y + 1, z, vx: Math.cos(a) * sp * Math.cos(el), vy: sp * Math.sin(el) * 2.2, vz: Math.sin(a) * sp * Math.cos(el),
          size: rand(2, 4) * Math.sqrt(k), grow: 3, drag: 1.4, grav: 170, life: rand(1.2, 2.2), alpha: 0.75, fadeIn: 0.01, c0: col(), cell: 2 });
      }
      // Sóng mù chân cột (base surge) lan ngang sát mặt nước
      if (!micro) {
        for (let i = 0; i < Math.round(26 * Math.min(2, k)); i++) {
          const a = (i / 26) * 6.283 + rand(-0.1, 0.1), sp = rand(60, 120) * Math.sqrt(k);
          this.smoke.add({ x, y: y + 2, z, vx: Math.cos(a) * sp, vy: rand(2, 10), vz: Math.sin(a) * sp,
            size: rand(8, 14) * Math.sqrt(k), grow: 14 * Math.sqrt(k), drag: 1.4, grav: -1, life: rand(3, 4.5), alpha: 0.5, fadeIn: 0.15, c0: [0.86, 0.9, 0.92], cell: 0, delay: rand(0.4, 0.8) });
        }
      }
      // Gợn sóng loang tròn trên mặt nước
      for (let w = 0; w < (micro ? 1 : 3); w++) {
        const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), new THREE.MeshBasicMaterial({ color: 0xe8f2f4, transparent: true, opacity: 0.5, depthWrite: false }));
        m.geometry.rotateX(-Math.PI / 2);
        m.position.set(x, y + 0.15, z);
        this.scene.add(m);
        this.ripples.push({ m, t: -w * 0.35, r0: 2 * k + 1, speed: (micro ? 10 : 34) * Math.sqrt(k), life: micro ? 1.2 : 3.2, op: micro ? 0.35 : 0.55 });
      }
      if (!micro) this.shocks.add(x, y, z, 30 * k, { ground: y, hemi: true, pushR: 50 * k });
      this.addWaterWaves(x, y, z, k, micro, shallow);
      // Không phát tiếng ở đây: bên gọi đã phát tiếng nổ mặt nước đúng loại đạn (game.js: playExplosionAtDistance 'WATER';
      // nhịp cầu rơi: 'splashBig'). Trước đây phát thêm một tiếng bom con nổ trên ĐẤT cho mọi phát rơi xuống nước
    }

    // Đoàn sóng lan tròn từ tâm nổ: biên độ giảm theo khoảng cách & thời gian, đỉnh sóng có bọt,
    // được chiếu sáng theo độ dốc mặt sóng; ngoài đoàn sóng hoàn toàn trong suốt (không lộ viền đĩa)
    addWaterWaves(x, y, z, k, micro, shallow) {
      this.waves = this.waves || [];
      while (this.waves.length > 10) { const o = this.waves.shift(); this.scene.remove(o.m); o.m.geometry.dispose(); o.m.material.dispose(); if (o.foam) { this.scene.remove(o.foam.m); o.foam.m.material.dispose(); } }
      const Rmax = (micro ? 30 : 190) * Math.sqrt(Math.max(0.3, k));
      const geo = new THREE.CircleGeometry(Rmax, micro ? 48 : 96);
      // vòng tròn đặc nhiều vòng đồng tâm để sóng mịn: thay bằng lưới ring nhiều phân đoạn
      const ring = new THREE.RingGeometry(0.4, Rmax, micro ? 48 : 128, micro ? 14 : 40);
      geo.dispose();
      ring.rotateX(-Math.PI / 2);
      // Mặt nạ mặt nước: sóng chỉ lan trên nước, tắt dần khi chạm bờ
      const T = this.terrainOf && this.terrainOf();
      const rp = ring.attributes.position;
      const wet = new Float32Array(rp.count).fill(1);
      if (T && T.waterSurfaceAt) for (let i = 0; i < rp.count; i++) { const ws = T.waterSurfaceAt(x + rp.getX(i), z + rp.getZ(i)); wet[i] = (ws === null || ws === undefined || ws < y - 3) ? 0 : 1; }
      ring.setAttribute('aWet', new THREE.BufferAttribute(wet, 1));
      const lam = (micro ? 2.6 : 11) * Math.sqrt(Math.max(0.3, k));
      const mat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false,
        uniforms: {
          uFront: { value: 0 }, uLam: { value: lam }, uAmp: { value: 0 }, uFade: { value: 0 }, uR0: { value: Rmax * 0.15 },
          uDeep: { value: new THREE.Color(shallow ? 0x6f7a62 : 0x3f6670) }, uLight: { value: new THREE.Color(0xbfd6da) },
          uSun: { value: new THREE.Vector3(-0.45, 0.75, 0.4).normalize() }
        },
        vertexShader: `
          uniform float uFront, uLam, uAmp, uR0;
          attribute float aWet;
          varying float vH, vEnv, vSlope, vWet; varying vec2 vDir;
          float wave(float r, out float env) {
            float u = r - uFront;
            env = u > 0.0 ? exp(-(u * u) / (uLam * uLam * 0.6)) : exp(u / (uLam * 2.6));
            env *= smoothstep(0.0, uLam * 0.8, r);
            return uAmp * env * sqrt(uR0 / (uR0 + r)) * cos(6.2832 * u / uLam);
          }
          void main() {
            vec3 p = position;
            float r = length(p.xz);
            float e1, e2;
            float h = wave(r, vEnv) * aWet;
            float h2 = wave(r + 0.4, e2) * aWet;
            vWet = aWet;
            vSlope = (h2 - h) / 0.4;
            vDir = r > 0.001 ? p.xz / r : vec2(1.0, 0.0);
            vH = uAmp > 0.001 ? h / uAmp : 0.0;
            p.y += h;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          }`,
        fragmentShader: `
          uniform vec3 uDeep, uLight, uSun; uniform float uFade;
          varying float vH, vEnv, vSlope, vWet; varying vec2 vDir;
          void main() {
            if (vWet < 0.5) discard;
            vec3 n = normalize(vec3(-vSlope * vDir.x, 1.0, -vSlope * vDir.y));
            float dif = clamp(dot(n, uSun), 0.0, 1.0);
            float spec = pow(clamp(dot(reflect(-uSun, n), vec3(0.0, 1.0, 0.0)), 0.0, 1.0), 24.0);
            vec3 c = mix(uDeep, uLight, 0.25 + 0.55 * dif) + spec * 0.35;
            float foam = smoothstep(0.45, 0.95, vH) * smoothstep(0.15, 0.6, vEnv);
            c = mix(c, vec3(0.94, 0.96, 0.97), foam * 0.85);
            float a = clamp(vEnv * 1.4, 0.0, 1.0) * uFade * (0.55 + 0.4 * foam + 0.3 * abs(vSlope));
            gl_FragColor = vec4(c, a);
          }`
      });
      const m = new THREE.Mesh(ring, mat);
      m.position.set(x, y + 0.12, z);
      m.renderOrder = 3;
      m.frustumCulled = false;
      this.scene.add(m);
      const W = { m, t: 0, life: micro ? 1.6 : 6, A: (micro ? 0.35 : 3.2) * Math.sqrt(Math.max(0.3, k)), c: (micro ? 16 : 46) * Math.sqrt(Math.max(0.3, k)) };
      if (!micro) {
        // Vệt bọt trắng đục loang ở tâm sau khi cột nước đổ xuống
        if (!this._foamTex && typeof document !== 'undefined') {
          const c = document.createElement('canvas'); c.width = c.height = 128;
          const g = c.getContext('2d');
          for (let i = 0; i < 260; i++) {
            const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * 58;
            g.fillStyle = `rgba(245,248,250,${0.05 + Math.random() * 0.18})`;
            g.beginPath(); g.arc(64 + Math.cos(a) * r, 64 + Math.sin(a) * r, 2 + Math.random() * 7, 0, 6.283); g.fill();
          }
          const grd = g.createRadialGradient(64, 64, 10, 64, 64, 64);
          grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(0.75, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(0,0,0,1)');
          g.globalCompositeOperation = 'destination-out'; g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
          this._foamTex = new THREE.CanvasTexture(c);
        }
        const fm = new THREE.Mesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: this._foamTex || null, transparent: true, opacity: 0, depthWrite: false }));
        fm.position.set(x, y + 0.16, z);
        fm.renderOrder = 4;
        this.scene.add(fm);
        W.foam = { m: fm, r0: 6 * Math.sqrt(k), g: 14 * Math.sqrt(k) };
      }
      this.waves.push(W);
    }

    // --- Hiệu ứng mảnh văng của vỏ đạn kim loại (mảnh thép nóng đỏ xé gió, mảnh vỏ 3D, vết găm đất) ---
    spawnShrapnel(x, y, z, s, prof, opts, dirVec, isWall, isVehicle, ammoType = 'NORMAL', wnx = 0, wnz = 0) {
      const isHeavy = !!(opts.heavy || prof === PROFILES.HE);
      const ground = this.groundAt(x, z);
      const pal = this.palette(isWall ? 'WALL' : 'GROUND');
      const BP = typeof BlastPhysics !== 'undefined' ? BlastPhysics : null;
      const bs = BP ? BP.spec(ammoType, !!opts.heavy) : null;
      // Hướng mảnh: vành vuông góc thân đạn (side spray) khớp với cách tính sát thương (BlastPhysics.sampleSpray).
      // Đạn rơi dốc -> vành ngang toả đều; bay là là -> hai cánh trái / phải. Đầu nổ lõm, bom con: toả gần đều.
      const axis = bs && bs.spray && dirVec && dirVec.hasDir ? dirVec : null;
      const pick = () => BP ? BP.sampleSpray(axis) : (() => { const a = Math.random() * 6.283, e = rand(0.08, 0.85); return { x: Math.cos(a) * Math.cos(e), y: Math.sin(e), z: Math.sin(a) * Math.cos(e) }; })();
      const wallLen = Math.hypot(wnx, wnz);
      // Mảnh thật bay 1-2 km/s (quét qua 30 m trong ~20 ms). Ở đây làm chậm ~5 lần như sóng xung kích nhưng vẫn
      // nhanh hơn mặt sóng -> mảnh cắm đất TRƯỚC khi sóng tới, như ngoài đời
      const FRAG_V = 2400;

      // 1. Mảnh thép nóng đỏ xé gió (chỉ vẽ mảnh bay lên / ngang; mảnh lao xuống đất cắm ngay sát tâm nổ)
      const tracerCount = Math.round((isHeavy ? 36 : 22) * Math.pow(s, 0.7));
      for (let i = 0; i < tracerCount; i++) {
        let t = pick();
        if (!isVehicle && t.y < -0.12) continue;                                   // lao thẳng vào đất
        if (isWall && wallLen > 0.1 && (t.x * wnx + t.z * wnz) / wallLen < -0.1) continue;   // lao vào tường
        const sp = rand(0.75, 1.25) * FRAG_V;
        this.streaks.add({
          x: x + (Math.random() - 0.5) * 2, y: y + rand(0.5, 2.5), z: z + (Math.random() - 0.5) * 2,
          vx: t.x * sp, vy: Math.max(t.y, -0.05) * sp, vz: t.z * sp,
          drag: rand(2.2, 3.2), grav: 78, life: rand(0.18, 0.34), tail: rand(0.008, 0.016)
        });
      }

      // 2. Mảnh vỏ đạn kim loại sắc nhọn 3D (Casing fragments)
      const chunkCount = Math.round((isHeavy ? 9 : 5) * Math.pow(s, 0.5));
      for (let i = 0; i < chunkCount; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = rand(30, 85) * Math.sqrt(s);
        const elev = rand(0.15, 0.95);
        const cosE = Math.cos(elev);
        const g = rand(0.12, 0.28);
        this.hardRocks.add({
          x: x + (Math.random() - 0.5) * 1.5,
          y: y + rand(1, 3),
          z: z + (Math.random() - 0.5) * 1.5,
          vx: Math.cos(a) * cosE * sp,
          vy: Math.sin(elev) * sp * 1.1,
          vz: Math.sin(a) * cosE * sp,
          size: rand(0.35, 0.85) * Math.pow(s, 0.45),
          life: rand(3.5, 6),
          c: [g, g * 0.96, g * 0.92] // kim loại xỉn màu thép
        });
      }

      // 3. Vết găm đất và cột bụi mảnh văng cắm xuống địa hình xung quanh. Mật độ ~1/r^2 (rải log theo bán kính),
      //    hướng theo vành mảnh (đạn bay là là: hai dải bụi hai bên đường bay), cắm gần như cùng lúc
      if (!isWall && !isVehicle) {
        const hitZoneRadius = bs ? bs.rmax * 0.5 * (BP ? BP.U : 8) : (22 + 20 * s) * (isHeavy ? 1.4 : 1.0);
        const rMin = 6;
        const groundHits = Math.round((isHeavy ? 30 : 16) * Math.pow(s, 0.5));
        for (let i = 0; i < groundHits; i++) {
          let t = pick();
          for (let k = 0; k < 4 && Math.hypot(t.x, t.z) < Math.random(); k++) t = pick();   // mảnh dựng đứng không cắm xa
          const hl = Math.hypot(t.x, t.z) || 1;
          const r = rMin * Math.pow(hitZoneRadius / rMin, Math.random());
          const px = x + t.x / hl * r;
          const pz = z + t.z / hl * r;
          const gy = this.groundAt(px, pz);
          const delay = r / (FRAG_V * rand(0.75, 1.25));

          // Cột bụi đất li ti bốc lên tại điểm mảnh cắm
          this.smoke.add({
            x: px, y: gy + 0.8, z: pz,
            vx: rand(-3, 3), vy: rand(8, 20), vz: rand(-3, 3),
            size: rand(2, 4.2), grow: 5, drag: 1.8, grav: 14,
            life: rand(0.8, 1.5), alpha: 0.55, fadeIn: 0.02,
            c0: mix(pal.dust, 0.88), cell: 0, delay
          });

          // Tia chớp ma sát nhỏ khi mảnh thép cắm mạnh xuống đất
          if (Math.random() < 0.35) {
            this.fire.add({
              x: px, y: gy + 0.8, z: pz,
              vx: 0, vy: 0, vz: 0,
              size: 3.5, grow: 6, life: 0.06, alpha: 1,
              c0: [1, 0.88, 0.5], cell: 3, delay, floor: false
            });
          }

          // Lỗ găm đất do mảnh đạn
          if (Math.random() < 0.65) {
            this.groundHoles.add(px, gy + 0.25, pz, 0, 1, 0, rand(1.2, 2.4));
          }
        }
      }
    }

    // --- 7. Hố nổ: TRƯỜNG ĐỘ CAO CỘNG DỒN ---
    // Mỗi cụm hố là một lưới độ cao vuông phủ cả hố lẫn vùng đất văng. Mỗi phát nổ (blast) khoét lòng hố tính từ MẶT HIỆN
    // TẠI (nổ trúng đáy hố cũ -> sâu thêm nhưng kém dần), rồi đắp gờ đất + lớp đất văng mỏng lên xung quanh (lấp một phần hố
    // cũ bên cạnh) -> nhiều phát chồng thành hố kép / hố chuỗi méo mó như chiến trường thật, không phải một vòng tròn to dần.
    // Cỡ hố theo khối thuốc nổ thật (bán kính hố ~ khối thuốc nổ^(1/3), đạn kích nổ khi chạm đất): 155mm ~6,6 kg -> hố
    // ~3,5-4 m sâu ~0,9 m; 120mm ~2 kg -> ~2,5 m; đạn con chùm vài chục gam -> ~0,6 m. Hình dạng theo góc rơi:
    //  - rơi dốc (pháo, > 60°): hố tròn, đất văng đều, vết mảnh văng toả thành 2 cánh hai bên hơi chếch về phía pháo bắn
    //  - góc vừa: hố bầu dục dọc hướng bay, chỗ sâu nhất lệch về phía trước, gờ & đất văng dồn về phía trước
    //  - bắn là là (< 20°): hố nông dài như vết cày, đất văng thành quạt phía trước, phía sau gần như không có
    //  - đầu nổ lõm (tên lửa, RPG): hố nông nhỏ + lỗ luồng phụt hẹp sâu hoắm ở giữa, muội đen sạm quanh miệng
    addCrater(x, z, R, pal, depth = 0.6, dirVec = null, ammoType = 'NORMAL', opts = {}) {
      // Ụ đất & sàn bê tông của cứ điểm không bị khoét hố
      const tc = this.terrainOf();
      if (tc && tc.noCraterAt && tc.noCraterAt(x, z)) return null;
      const heavy = !!(opts.heavy || ammoType === 'HE155');
      const spec = CRATER_SPEC[heavy && ammoType === 'HE' ? 'HE155' : ammoType];
      // Hố dùng thông số riêng (phòng thử: hố / ao cố định; tháp pháo rơi đập đất): cỡ theo R truyền vào
      const custom = opts.persistent || !spec;
      const ra = custom ? R * 0.55 : spec.ra * (0.92 + Math.random() * 0.16);
      const da = custom ? (opts.bowlDepth !== undefined ? opts.bowlDepth : R * 0.45 * depth) : spec.da * (0.9 + Math.random() * 0.2);
      const kind = custom ? 'blast' : spec.kind;
      // Góc rơi & hướng bay ngang
      let fx = 0, fz = -1, sinT = 0.85;
      if (dirVec && (dirVec.x || dirVec.z || dirVec.y)) {
        const L = Math.hypot(dirVec.x || 0, dirVec.y !== undefined ? dirVec.y : -0.7, dirVec.z || 0) || 1;
        const hx = (dirVec.x || 0) / L, hz = (dirVec.z || 0) / L, hy = (dirVec.y !== undefined ? dirVec.y : -0.7) / L;
        const h = Math.hypot(hx, hz);
        if (h > 0.02) { fx = hx / h; fz = hz / h; }
        sinT = Math.max(0.05, Math.min(1, -hy));
      } else {
        const a = Math.random() * Math.PI * 2;
        fx = Math.cos(a); fz = Math.sin(a);
      }
      if (custom) sinT = 1;
      const e = kind === 'gouge' ? 4.5 + 2.5 * (1 - sinT) : 1 + 1.1 * Math.pow(1 - sinT, 1.6);   // độ thuôn dài theo hướng bay
      const d = da * (0.45 + 0.55 * sinT);                          // bắn là là: hố nông
      const blast = {
        x, z, fx, fz, sinT, ra, d, kind, heavy,
        A: ra * Math.sqrt(e), B: ra / Math.sqrt(e),
        shift: 0.3 * ra * Math.sqrt(e) * (1 - sinT),
        rimH: d * (kind === 'heat' ? 0.16 : kind === 'cluster' ? 0.22 : kind === 'gouge' ? 0.4 : 0.3) * (custom && opts.persistent ? 0.6 : 1),
        jet: kind === 'heat' ? spec.jet * (0.4 + 0.6 * sinT) : 0,
        seed: (Math.floor(Math.abs(x * 13.37 + z * 7.13)) % 997) + 1,
        frag: kind === 'blast' && !custom ? 1 : kind === 'cluster' ? 0.5 : 0,
        // độ "thô" của hố: rãnh xói, vách sụt, đáy gồ ghề, gờ vón cục, lớp đất phân tầng, vết nứt (0 = chảo trơn)
        rough: opts.rough !== undefined ? opts.rough : kind === 'gouge' ? 0.3 : 0.55
      };
      // Nổ trùng / sát hố cũ: gộp vào cụm đó (một hoặc nhiều cụm), dựng lại cả cụm theo thứ tự các phát nổ
      let blasts = [blast];
      if (!opts.persistent) {
        for (let i = this.craters.length - 1; i >= 0; i--) {
          const c = this.craters[i];
          if (c.persistent || !c.blasts) continue;
          // gờ hố rộng tới ~1,35 bán kính: hai hố gần hơn thế mà không gộp thì gờ / lòng hố đè nhau, lộ đường nối
          const near = c.blasts.some(b => Math.hypot(b.x - x, b.z - z) < (b.A + blast.A) * 1.45);
          if (!near) continue;
          blasts = c.blasts.concat(blasts);
          this.removeDecal(this.craters, i, true);   // cụm mới dựng lại ngay, báo mặt đất đổi một lần
        }
        if (blasts.length > 14) blasts = blasts.slice(blasts.length - 14);
      }
      return this.buildCraterCluster(blasts, pal, opts);
    }

    buildCraterCluster(blasts, pal, opts = {}) {
      const t = this.terrainOf();
      const palName = (t && t.mapType && PALETTES[t.mapType]) ? t.mapType : 'DESERT';
      const P = pal || PALETTES[palName] || PALETTES.DESERT;
      // Mặt đất NGUYÊN THUỶ (chưa bị khoét): lưới độ cao vật lý đã bị hạ ở các hố cũ, dùng nó sẽ khoét sâu gấp đôi khi dựng lại
      const base = this.rawGroundFn(t);
      // Vùng phủ: hố + gờ + đất văng (~4 bán kính hố)
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const b of blasts) {
        const r = Math.max(b.A, b.B) * (b.kind === 'gouge' ? 1.9 : 4.2) + b.shift;   // rãnh cày: đất hất 2 bên, không văng xa
        x0 = Math.min(x0, b.x - r); x1 = Math.max(x1, b.x + r); z0 = Math.min(z0, b.z - r); z1 = Math.max(z1, b.z + r);
      }
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      // Lưới hố xoay theo hướng rãnh cày AP mới nhất (vách rãnh dài song song đường lưới -> không răng cưa); hố thường: không xoay.
      // Toạ độ lưới (gu, gv) = toạ độ thế giới quanh (cx, cz) xoay đi góc rãnh; ox, oz = góc lưới trong hệ đó
      const lastGouge = blasts.filter(b => b.kind === 'gouge').pop();
      const gAng = lastGouge ? Math.atan2(lastGouge.fz, lastGouge.fx) : 0, gc = Math.cos(gAng), gs = Math.sin(gAng);
      let S = Math.max(x1 - x0, z1 - z0);
      if (lastGouge) {
        S = 0;
        for (const b of blasts) {
          const r = Math.max(b.A, b.B) * (b.kind === 'gouge' ? 1.9 : 4.2) + b.shift;
          const du = (b.x - cx) * gc + (b.z - cz) * gs, dv = -(b.x - cx) * gs + (b.z - cz) * gc;
          S = Math.max(S, 2 * (Math.abs(du) + r), 2 * (Math.abs(dv) + r));
        }
      }
      const ox = -S / 2, oz = -S / 2;
      const toGU = (px, pz) => (px - cx) * gc + (pz - cz) * gs, toGV = (px, pz) => -(px - cx) * gs + (pz - cz) * gc;
      const fromG = (u, v) => [cx + u * gc - v * gs, cz + u * gs + v * gc];
      const maxRa = Math.max(...blasts.map(b => b.ra));
      // ô lưới mỗi cạnh. Rãnh cày AP hẹp & sâu: lưới mịn hơn
      const M = opts.gridN || (lastGouge ? 96 : maxRa > 8 ? 84 : maxRa > 4 ? 64 : 48);
      const TS = opts.texSize || (maxRa > 8 ? 192 : maxRa > 4 ? 144 : 112);         // điểm ảnh texture mỗi cạnh (~1 điểm ảnh / 5-8 cm)

      // ---- hàm đánh giá một phát nổ tại (x,z): trả về phần khoét (≤ 0) và phần đắp (≥ 0) + thông tin tô màu ----
      const evalBlast = (b, px, pz, out) => {
        const bx = b.x + b.fx * b.shift, bz = b.z + b.fz * b.shift;
        const dx = px - bx, dz = pz - bz;
        out.jet = 0;
        if (dx * dx + dz * dz > b._far) { out.exc = 0; out.dep = 0; out.rho = 9; out.ca = 0; out.ej = 0; out.scorch = 0; out.gul = 0; out.fan = 0; out.talus = 0; out.wall = 0; return out; }
        const a = dx * b.fx + dz * b.fz, l = -dx * b.fz + dz * b.fx;
        const an = a / (b.A * (a > 0 ? 1.12 : 0.88)), bn = l / b.B;
        let rho = Math.hypot(an, bn);
        const ca = rho > 1e-6 ? an / rho : 1, sa = rho > 1e-6 ? bn / rho : 0;
        // mép hố lồi lõm tự nhiên, mỗi hố một kiểu (bảng theo góc, tính sẵn khi tạo hố)
        let af = (Math.atan2(sa, ca) / 6.2832 + 0.5) * 64, ai = Math.floor(af);
        af -= ai; ai &= 63;
        const wob = b.wob[ai] + (b.wob[ai + 1] - b.wob[ai]) * af;
        rho *= 1 + wob;
        const shallow = 1 - b.sinT;
        const dirB = Math.max(0.3, 1 + 0.75 * shallow * ca);
        // đất văng: bắn là là -> quạt về phía trước, phía sau gần như trống; tia đất văng không đều theo góc
        const dirE = 1 + shallow * (Math.max(0, 0.2 + ca) * 1.8 - 1);
        const ray = b.ray[ai] + (b.ray[ai + 1] - b.ray[ai]) * af;
        let exc = 0;
        // rãnh cày AP: vách bo tròn vào mép (dốc về 0 ở mép) — rãnh hẹp & sâu, gãy dốc đột ngột ở mép thành răng cưa trên lưới
        if (rho < 1) exc = b.kind === 'gouge' ? -b.d * Math.pow(1 - rho * rho, 1.3) : -b.d * (1 - rho * rho * Math.pow(rho, 0.2));
        let rimK = 1, rough = 0;
        out.gul = 0; out.fan = 0; out.talus = 0; out.wall = 0;
        if (b.rough && rho < 1.6) {
          const R = b.rough;
          // rãnh xói dọc vách: đất cát tuột theo những khe hẹp từ miệng xuống lưng chừng vách, đẩy thành quạt cát ở chân rãnh
          let gf = (Math.atan2(sa, ca) / 6.2832 + 0.5) * 256, gi = Math.floor(gf);
          gf -= gi; gi &= 255;
          const g = b.gul[gi] + (b.gul[gi + 1] - b.gul[gi]) * gf, lo = b.gll[gi];
          const m = smooth(lo, lo + 0.18, rho) * (1 - smooth(1.02, 1.16, rho));
          const fan = g * Math.exp(-Math.pow((rho - lo + 0.06) / 0.11, 2));
          if (rho < 1) exc -= g * m * b.d * 0.13 * R;
          else rimK = 1 - g * m * 0.75 * R;
          // khối vách sụt thành bậc / gờ lưng chừng vách ở vài đoạn
          const sl = b.slm[ai] + (b.slm[ai + 1] - b.slm[ai]) * af;
          if (rho < 1) {
            exc += fan * b.d * 0.07 * R + sl * b.d * 0.1 * R * Math.exp(-Math.pow((rho - 0.64) / 0.1, 2));
            // đáy hố gồ ghề: đất đá tuột xuống, cục đất vỡ
            const hn = tnoise(px * b._hn + b.seed * 1.3, pz * b._hn - b.seed) - 0.5;
            exc += hn * b.d * 0.09 * R * (1 - smooth(0.45, 0.8, rho));
            exc = Math.min(exc, -0.02);
          }
          // gờ đất vón thành khối, không phải một vành đều
          const rn = tnoise(px * b._rn - b.seed * 0.7, pz * b._rn + b.seed * 2.1) - 0.5;
          rough = rn * b.rimH * 0.7 * R * Math.exp(-Math.pow((rho - 1.12) / 0.22, 2));
          out.gul = g * m; out.fan = fan * (rho < 1 ? 1 : 0);
          out.talus = Math.exp(-Math.pow((rho - 0.42) / 0.14, 2));
          out.wall = smooth(0.38, 0.62, rho) * (1 - smooth(0.98, 1.08, rho));
        }
        if (b.jet) {
          // lỗ luồng phụt: hẹp, sâu, kéo dài theo hướng bay khi bắn xiên
          const ja = ((px - b.x) * b.fx + (pz - b.z) * b.fz) / (b.ra * 0.2 * (1 + 2.2 * shallow));
          const jb = (-(px - b.x) * b.fz + (pz - b.z) * b.fx) / (b.ra * 0.2);
          const rj = Math.hypot(ja, jb);
          if (rj < 1) exc -= b.jet * Math.pow(1 - rj * rj, 0.7);
          out.jet = Math.max(out.jet, Math.exp(-rj * rj / 3));
        }
        // rãnh cày AP hẹp: tính theo bán trục ngang (nhỏ) nên gờ phải rộng hơn theo rho, không thì thành sống đất sắc lẹm
        // (rộng chưa tới một ô lưới) -> vách rãnh răng cưa
        const rimW = b.kind === 'gouge' ? 1.9 : 1;
        const rim = rimK * b.rimH * dirB * Math.exp(-Math.pow((rho - 1.02) / ((rho < 1.02 ? 0.24 : 0.48) * rimW), 2));
        const blanket = rho > 1 ? b.rimH * 0.35 * dirE * ray * Math.exp(-(rho - 1) / 1.1) : 0;
        const lump = (tnoise(px * b._ln + b.seed, pz * b._ln) - 0.5) * b.d * 0.22 * Math.exp(-(rho - 1.05) * (rho - 1.05) * 4);
        out.exc = exc;
        out.dep = Math.max(0, rim + blanket + lump + rough);
        out.rho = rho; out.ca = ca;
        // tan hẳn trước biên vùng tính (~3,9 bán kính hố phía trước): bắn xiên đất văng dồn mạnh về trước, không tắt dần thì bị
        // cắt cụt ở biên thành mảng đất mép sắc như miếng dán
        out.ej = rho > 0.9 ? dirE * ray * Math.exp(-(rho - 1) / 1.25) * Math.min(1, (rho - 0.9) * 6) * (1 - smooth(1.8, 3.6, rho)) : 0;
        out.scorch = b.kind === 'gouge' ? 0 : Math.exp(-rho * rho / 0.5625) * (b.kind === 'heat' ? 0.55 : 0.4);
        return out;
      };
      for (const b of blasts) {
        b._far = Math.pow(Math.max(b.A, b.B) * 4.3 + b.shift, 2);
        b._ln = 0.4 / Math.max(1, b.ra / 12);   // cục đất gồ trên gờ to theo cỡ hố (hố lớn không lởm chởm gai nhọn)
        b._hn = 32 / Math.max(4, b.ra);          // đáy gồ ghề: mảng ~1/4 bán kính hố
        b._rn = 55 / Math.max(4, b.ra);          // gờ vón cục: khối ~1/7 bán kính hố
        if (b.rough === undefined) b.rough = 0.55;
        if (!b.gul) {
          // bảng rãnh xói theo góc (256 ô): vài khe hẹp ngẫu nhiên, mỗi khe một bề rộng / độ dài; bảng vách sụt (64 ô)
          b.gul = new Float32Array(257); b.gll = new Float32Array(257).fill(0.5); b.slm = new Float32Array(65);
          const rnd = (k) => hash2(k, b.seed, 61);
          const n = Math.round(7 + 9 * b.rough + rnd(1) * 5);
          for (let q = 0; q < n; q++) {
            const c = rnd(q * 5 + 10) * 256, w = 1.2 + rnd(q * 5 + 11) * 3.2, dep = 0.45 + rnd(q * 5 + 12) * 0.55, lo = 0.3 + rnd(q * 5 + 13) * 0.4;
            for (let k = Math.floor(c - w * 2); k <= Math.ceil(c + w * 2); k++) {
              const kk = ((k % 256) + 256) % 256, v = dep * Math.max(0, 1 - Math.pow((k - c) / w, 2));
              if (v > b.gul[kk]) { b.gul[kk] = v; b.gll[kk] = lo; }
            }
          }
          b.gul[256] = b.gul[0]; b.gll[256] = b.gll[0];
          for (let k = 0; k <= 64; k++) {
            const an = (k / 64 - 0.5) * 6.2832;
            b.slm[k] = smooth(0.58, 0.8, cnoise(Math.cos(an) * 2.4 + b.seed * 1.9, Math.sin(an) * 2.4 + 5, b.seed + 21));
          }
        }
        if (b.wob) continue;
        b.wob = new Float32Array(65); b.ray = new Float32Array(65);
        for (let k = 0; k <= 64; k++) {
          const an = (k / 64 - 0.5) * 6.2832, ca = Math.cos(an), sa = Math.sin(an);
          const R = b.rough || 0;
          // mép hố méo: thêm sóng góc tần số cao khi hố "thô" (miệng hố khấc, lẹm chỗ vách sụt)
          b.wob[k] = (cnoise(ca * 1.7 + b.seed, sa * 1.7, b.seed) - 0.5) * 0.24 * (1 + 0.5 * R) + (cnoise(ca * 4.5 + b.seed, sa * 4.5 + 3, b.seed + 5) - 0.5) * 0.1 * (1 + R)
            + (cnoise(ca * 9 + b.seed * 0.3, sa * 9 - 7, b.seed + 13) - 0.5) * 0.07 * R;
          // tia đất văng: thêm các vệt tia hẹp toả ra (hố thô)
          const streak = Math.pow(clamp01(cnoise(ca * 11 + b.seed * 1.1, sa * 11 + 4, b.seed + 17)), 2.2);
          b.ray[k] = (0.35 + 0.9 * Math.pow(clamp01(cnoise(ca * 3.2 + b.seed * 0.7, sa * 3.2 + 11, b.seed + 9)), 1.6)) * (1 - 0.35 * R + 1.1 * R * streak);
        }
      }
      // độ cao tại tâm từng phát ngay trước khi nó nổ (nổ vào đáy hố cũ khoét tiếp từ đó)
      const tmp = { exc: 0, dep: 0, rho: 0, ca: 0, ej: 0, scorch: 0, jet: 0 };
      const heightAt = (px, pz, n) => {
        let H = 0;
        for (let i = 0; i < n; i++) {
          const b = blasts[i];
          tmp.jet = 0;
          evalBlast(b, px, pz, tmp);
          if (tmp.exc < 0) H = Math.min(H, b._hc + tmp.exc * b._k);
          H += tmp.dep;
        }
        return H;
      };
      const deepest = Math.max(...blasts.map(b => b.d + b.jet));
      blasts.forEach((b, i) => {
        const h = Math.min(0, heightAt(b.x + b.fx * b.shift, b.z + b.fz * b.shift, i));
        b._hc = Math.max(h * 0.85, -deepest * 1.6);       // đáy càng sâu, nổ tiếp càng khó hất đất lên khỏi hố
        b._k = h < -0.25 * b.d ? 0.6 : 1;
      });
      // ---- một lượt tính đầy đủ cho mỗi điểm: độ cao + các lớp màu ----
      const o = { exc: 0, dep: 0, rho: 0, ca: 0, ej: 0, scorch: 0, jet: 0 };
      const sample = (px, pz, res) => {
        let H = 0, ej = 0, scorch = 0, jet = 0, fresh = 0, inBowl = 0, gul = 0, fan = 0, talus = 0, wall = 0;
        for (let i = 0; i < blasts.length; i++) {
          const b = blasts[i];
          o.jet = 0;
          evalBlast(b, px, pz, o);
          if (o.exc < 0) {
            const Hc = b._hc + o.exc * b._k;
            if (Hc < H) { H = Hc; fresh = 1; ej *= 0.2; }   // mặt vừa bị khoét: đất cái mới lộ ra, lớp đất văng cũ bị hất đi
            inBowl = Math.max(inBowl, 1 - o.rho);
            fan = Math.max(fan, o.fan); talus = Math.max(talus, o.talus); wall = Math.max(wall, o.wall);
          }
          gul = Math.max(gul, o.gul);
          H += o.dep;
          ej = ej + o.ej * (1 - ej * 0.5);
          scorch = Math.max(scorch, o.scorch * (1 - inBowl * 0.2));
          jet = Math.max(jet, o.jet);
        }
        res.H = H; res.ej = ej; res.scorch = scorch; res.jet = jet; res.fresh = fresh; res.inBowl = inBowl;
        res.gul = gul; res.fan = fan; res.talus = talus; res.wall = wall;
        return res;
      };

      // ---- 1. LƯỚI ĐỘ CAO ----
      const N1 = M + 1, pos = new Float32Array(N1 * N1 * 3), uv = new Float32Array(N1 * N1 * 2);
      const r0 = {};
      const Hgrid = new Float32Array(N1 * N1);
      for (let j = 0; j <= M; j++) for (let i = 0; i <= M; i++) {
        const [px, pz] = fromG(ox + S * i / M, oz + S * j / M), k = j * N1 + i;
        sample(px, pz, r0);
        Hgrid[k] = r0.H;
        pos[k * 3] = px - cx; pos[k * 3 + 1] = base(px, pz) + r0.H + 0.04; pos[k * 3 + 2] = pz - cz;
        uv[k * 2] = i / M; uv[k * 2 + 1] = 1 - j / M;
      }
      const idx = new Uint16Array(M * M * 6);
      for (let j = 0, q = 0; j < M; j++) for (let i = 0; i < M; i++, q += 6) {
        const a = j * N1 + i, b = a + 1, c = a + N1, d = c + 1;
        // cắt ô theo đường chéo ít chênh độ cao hơn: vách dốc chạy chéo lưới không bị răng cưa (cùng chiều quay mặt)
        if (Math.abs(Hgrid[a] - Hgrid[d]) < Math.abs(Hgrid[b] - Hgrid[c])) {
          idx[q] = a; idx[q + 1] = c; idx[q + 2] = d; idx[q + 3] = a; idx[q + 4] = d; idx[q + 5] = b;
        } else {
          idx[q] = a; idx[q + 1] = c; idx[q + 2] = b; idx[q + 3] = b; idx[q + 4] = c; idx[q + 5] = d;
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.setIndex(new THREE.BufferAttribute(idx, 1));
      geo.computeVertexNormals();

      // Lỗ khoét mặt đất BAO TRỌN lòng hố (tới chỗ lòng hố cắt mặt đất, đo trên lưới độ cao, cộng một chút ra gờ): elip xoay
      // theo hướng bay. Lỗ nhỏ hơn lòng hố thì mặt đất phẳng che phần trên vách hố -> lộ "bậc thềm" phẳng trong gờ và mép cắt
      // răng cưa ("hố trong hố"). Mép lỗ nằm dưới gờ đất (mặt hố cao hơn mặt đất, vẽ đặc) nên không nhìn thấy
      const Hg = (px, pz) => {
        const gi = Math.max(0, Math.min(M, Math.round((toGU(px, pz) - ox) / S * M))), gj = Math.max(0, Math.min(M, Math.round((toGV(px, pz) - oz) / S * M)));
        return Hgrid[gj * N1 + gi];
      };
      const cellU = S / M;
      const holeE = [];
      // khoảng cách chuẩn hoá từ (px,pz) tới lỗ h (< 1 = trong lỗ), như holeQ trong shader
      const qOf = (h, px, pz) => {
        const dx = px - h.x, dz = pz - h.z, c = Math.cos(h.ang), sn = Math.sin(h.ang);
        return Math.hypot(dx * c + dz * sn, (-dx * sn + dz * c) / h.ratio) / h.r;
      };
      // mỗi phát nổ một lỗ, phát mới nhất trước, tối đa OWN_HOLES lỗ / cụm; phát có lòng hố đã nằm gọn trong lỗ của phát khác thì thôi.
      // Phát không có lỗ: mặt đất phẳng đè lên lòng hố của nó
      for (let bi = blasts.length - 1; bi >= 0 && holeE.length < OWN_HOLES; bi--) {
        const b = blasts[bi];
        const hx = b.x + b.fx * b.shift, hz = b.z + b.fz * b.shift;
        if (Hg(hx, hz) > -0.3) continue;
        const covered = (px, pz) => holeE.some(h => qOf(h, px, pz) < 0.9);
        const pa = b.A * 0.8, pb = b.B * 0.8;
        if (covered(hx, hz) && covered(hx + b.fx * pa, hz + b.fz * pa) && covered(hx - b.fx * pa, hz - b.fz * pa) &&
          covered(hx - b.fz * pb, hz + b.fx * pb) && covered(hx + b.fz * pb, hz - b.fx * pb)) continue;
        const rMax = Math.max(b.A, b.B) * 2.2;
        const reach = (qx, qz, ang) => {
          const ux = b.fx * Math.cos(ang) - b.fz * Math.sin(ang), uz = b.fz * Math.cos(ang) + b.fx * Math.sin(ang);
          let r = 0;
          while (r < rMax && Hg(qx + ux * (r + cellU * 0.5), qz + uz * (r + cellU * 0.5)) < 0) r += cellU * 0.5;
          return r + cellU * 0.75;
        };
        // lòng hố lệch (bắn xiên: phía trước dài hơn phía sau) -> đặt tâm elip vào giữa hai mép trước / sau cho ôm sát
        const fw = reach(hx, hz, 0), bk = reach(hx, hz, Math.PI), off = (fw - bk) / 2;
        const qx = hx + b.fx * off, qz = hz + b.fz * off;
        const ra = (fw + bk) / 2, rb = Math.max(reach(qx, qz, Math.PI / 2), reach(qx, qz, -Math.PI / 2));
        if (ra < cellU * 2.5 || rb < cellU * 2.5) continue;
        // giãn elip cho tới khi chứa mọi hướng (mép hố lồi lõm), không quá 1,35 lần
        let k = 1;
        for (let q = 1; q < 24; q++) {
          const an = q / 24 * Math.PI * 2, c = Math.cos(an), s2 = Math.sin(an);
          const re = 1 / Math.sqrt((c / ra) ** 2 + (s2 / rb) ** 2);
          k = Math.max(k, reach(qx, qz, an) / re);
        }
        k = Math.min(k, 1.35);
        const big = Math.min(rMax, Math.max(ra, rb) * k), small = Math.min(rMax, Math.min(ra, rb) * k);
        const ang = ra >= rb ? Math.atan2(b.fz, b.fx) : Math.atan2(b.fz, b.fx) + Math.PI / 2;
        holeE.push({ x: qx, z: qz, r: big, ratio: small / big, ang });
      }
      // khoảng cách chuẩn hoá tới lỗ gần nhất của cụm (< 1 = trong lỗ), như holeQ trong shader
      const holeQ = (px, pz) => {
        let q = 1e9;
        for (const h of holeE) q = Math.min(q, qOf(h, px, pz));
        return q;
      };
      const holeC = holeE;   // (tên cũ) danh sách lỗ khoét: x, z, r = bán trục lớn, ratio, ang

      // ---- 2. TEXTURE MÀU + ĐỘ TRONG riêng cho cụm hố ----
      // Độ trong để ở texture riêng (alphaMap, ảnh xám), texture màu luôn đặc: canvas lưu màu nhân sẵn độ trong, chỗ gần như trong
      // suốt mất hết màu -> khi shader ép vẽ đặc quanh lỗ (xem installCraterHoles) lộ ra điểm ảnh nhiễu sặc sỡ
      const cvs = document.createElement('canvas'), cvsA = document.createElement('canvas');
      cvs.width = cvs.height = cvsA.width = cvsA.height = TS;
      const g2 = cvs.getContext('2d'), gA = cvsA.getContext('2d');
      const img = g2.createImageData(TS, TS), imgA = gA.createImageData(TS, TS);
      const sub = [P.soil[0] * 0.7 + P.dark[0] * 0.3, P.soil[1] * 0.7 + P.dark[1] * 0.3, P.soil[2] * 0.7 + P.dark[2] * 0.3];
      const soot = [0.15, 0.13, 0.11];
      const r1 = {};
      // mảng loang (đất vón, muội, tia đất văng thưa) to theo cỡ hố: hố lớn mà giữ cỡ mảng của hố nhỏ thì hoa văn lặp dày đặc
      const nsc = Math.max(1, maxRa / 12);
      const Rr = Math.max(...blasts.map(b => b.rough || 0));
      // lớp đất phân tầng lộ trên vách hố (độ sâu thật dưới mặt đất, 8 đơn vị = 1 m): cát mặt sáng, đất thịt nâu đỏ,
      // vỉa vôi / đá ong nhạt, sét chặt sẫm...
      const LAY = [[0, [1.13, 1.1, 1.04]], [2.2, [0.97, 0.83, 0.7]], [5.4, [1.2, 1.16, 1.08]], [6.4, [0.86, 0.77, 0.68]],
        [12, [1.1, 1.05, 0.97]], [13, [0.8, 0.74, 0.69]], [21, [0.93, 0.87, 0.79]], [29, [0.74, 0.7, 0.66]]];
      const layTint = (z, out) => {
        let k = 0;
        while (k < LAY.length - 1 && z > LAY[k + 1][0]) k++;
        const c0 = LAY[k][1], nx = LAY[k + 1];
        const t = nx ? smooth(nx[0] - 0.5, nx[0] + 0.5, z) : 0, c1 = nx ? nx[1] : c0;
        out[0] = c0[0] + (c1[0] - c0[0]) * t; out[1] = c0[1] + (c1[1] - c0[1]) * t; out[2] = c0[2] + (c1[2] - c0[2]) * t;
        return out;
      };
      const tint = [1, 1, 1];
      for (let j = 0; j < TS; j++) for (let i = 0; i < TS; i++) {
        const [px, pz] = fromG(ox + S * (i + 0.5) / TS, oz + S * (j + 0.5) / TS);
        sample(px, pz, r1);
        const grain = 0.86 + 0.28 * cnoise(px * 1.9, pz * 1.9, 3) + (cnoise(px * 6, pz * 6, 4) - 0.5) * 0.14;
        const clump = cnoise(px * 0.7 / nsc, pz * 0.7 / nsc, 6);
        // đất cái mới lộ / mới văng: sẫm & ẩm hơn mặt đất (lớp mặt khô bạc màu bị hất đi)
        let r = sub[0] * grain, g = sub[1] * grain, b = sub[2] * grain;
        // lòng hố: càng sâu càng ẩm tối (không đen kịt — ánh trời vẫn chiếu xuống đáy)
        const deep = clamp01(-r1.H / Math.max(1, deepest));
        // vách trong lòng hố: đất ẩm vừa lộ sẫm hơn mặt đất ngay từ mép (không thì vách dốc hứng nắng sáng thành viền trắng)
        const wet = (r1.H < -0.05 ? 0.8 : 1) - 0.24 * deep;
        r *= wet; g *= wet; b *= wet;
        // lớp đất văng mỏng phủ bụi mặt -> sáng hơn, ngả màu bụi ở rìa
        const thin = r1.fresh ? 0 : clamp01(1 - r1.ej * 1.4);
        r += (P.dust[0] - r) * thin * 0.12; g += (P.dust[1] - g) * thin * 0.12; b += (P.dust[2] - b) * thin * 0.12;
        // muội thuốc nổ loang lổ quanh tâm nổ, đặc nhất ở miệng lỗ luồng phụt
        const sk = clamp01(r1.scorch * (0.55 + 0.9 * cnoise(px * 0.9 / nsc + 7, pz * 0.9 / nsc, 8)) + r1.jet * 0.75);
        r += (soot[0] - r) * sk; g += (soot[1] - g) * sk; b += (soot[2] - b) * sk;
        if (Rr > 0 && r1.H < 0) {
          // vách: các lớp đất phân tầng, ranh giới lượn sóng
          const wz = -r1.H + (tnoise(px * 0.25 + 11, pz * 0.25) - 0.5) * 2.6 + (tnoise(px * 1.1, pz * 1.1 - 5) - 0.5) * 0.8;
          layTint(wz, tint);
          const w = r1.wall * Rr * 0.8 * (1 - sk);
          r *= 1 + (tint[0] - 1) * w; g *= 1 + (tint[1] - 1) * w; b *= 1 + (tint[2] - 1) * w;
          // rãnh xói sẫm & ẩm; quạt cát tơi sáng ở chân rãnh và vành cát tuột quanh chân vách
          const gk = 1 - 0.2 * r1.gul * Rr;
          r *= gk; g *= gk; b *= gk;
          const sand = clamp01(r1.fan * 0.32 + r1.talus * 0.2 * (0.4 + 0.9 * cnoise(px * 0.8 + 3, pz * 0.8, 15))) * Rr * (1 - sk);
          r += (P.dust[0] * 0.92 - r) * sand; g += (P.dust[1] * 0.92 - g) * sand; b += (P.dust[2] * 0.92 - b) * sand;
        }
        // cục đất vón: điểm sáng tối lấm tấm
        const v = 1 + 0.12 * smooth(0.66, 0.78, clump) - 0.14 * (1 - smooth(0.18, 0.3, clump));
        // độ trong: lòng hố & gờ đặc; đất văng thưa dần theo tia ra ngoài, mép lưới tan hẳn vào mặt đất
        // gờ đất đắp dày -> đặc (gờ nửa trong suốt để lộ mặt đất bên dưới trông như vách giấy)
        let alpha = r1.inBowl > 0 || r1.fresh ? 1 : clamp01((r1.ej - 0.1 - (cnoise(px * 0.55 / nsc + 3, pz * 0.55 / nsc, 12) - 0.5) * 0.5) * 2.4);
        alpha = Math.max(alpha, clamp01(sk * 1.6) * 0.85, clamp01((r1.H - 0.3) / 0.3));
        // gần lỗ khoét: chỗ nào lưới hố nhô trên mặt đất phải đặc — nhìn xiên, tia nhìn qua gờ nửa trong suốt chui xuống dưới
        // gờ, gặp chỗ mặt đất đã bị khoét -> lộ trời. Xa lỗ thì đất văng vẫn loang lổ như cũ
        if (alpha < 1 && holeE.length) alpha = Math.max(alpha, clamp01((r1.H - 0.02) / 0.12) * (1 - smooth(1.7, 2.6, holeQ(px, pz))));
        const ex = Math.min(i, j, TS - 1 - i, TS - 1 - j) / (TS * 0.06);
        alpha *= clamp01(ex);
        const q = (j * TS + i) * 4;
        img.data[q] = clamp01(r * v) * 255; img.data[q + 1] = clamp01(g * v) * 255; img.data[q + 2] = clamp01(b * v) * 255;
        img.data[q + 3] = 255;
        imgA.data[q] = imgA.data[q + 1] = imgA.data[q + 2] = alpha * 255; imgA.data[q + 3] = 255;
      }
      g2.putImageData(img, 0, 0);
      gA.putImageData(imgA, 0, 0);
      // vẽ vết lên cả hai: màu (hoà vào màu đất) + độ trong (trắng cùng độ đậm -> cộng dồn độ đặc như vẽ chồng lên nền trong suốt)
      const mark = (rgbStr, a, draw) => {
        g2.strokeStyle = g2.fillStyle = `rgba(${rgbStr},${a})`; draw(g2);
        gA.strokeStyle = gA.fillStyle = `rgba(255,255,255,${a})`; draw(gA);
      };
      // Vết mảnh văng: đạn nổ phá vỡ vỏ thép bắn mảnh rạch đất thành những vệt mảnh toả ra; với ngòi nổ chạm, phần lớn mảnh
      // bay ngang hai bên hướng bay ("side spray") -> 2 cánh vệt mảnh, hơi chếch về phía pháo bắn (dấu hiệu đoán hướng pháo)
      const toTex = (px, pz) => [(toGU(px, pz) - ox) / S * TS, (toGV(px, pz) - oz) / S * TS];
      const pxPerU = TS / S;
      for (const b of blasts) {
        if (!b.frag) continue;
        const n = Math.round((b.heavy ? 46 : 28) * b.frag);
        const rnd = (k) => hash2(k, b.seed, 37);
        for (let k = 0; k < n; k++) {
          const lobe = rnd(k) < 0.72;
          const side = rnd(k + 500) < 0.5 ? 1 : -1;
          // góc so với hướng bay (0 = phía trước): 2 cánh ở ~±105° (chếch về phía sau), còn lại rải đều
          const ang = lobe ? side * (1.83 + (rnd(k + 900) - 0.5) * 1.1 * (0.5 + 0.5 * b.sinT)) : rnd(k + 1300) * 6.283;
          const ca = Math.cos(ang), sa = Math.sin(ang);
          const wx = b.fx * ca - b.fz * sa, wz = b.fz * ca + b.fx * sa;
          // mảnh rạch đất thành từng vết ngắn đứt quãng (mảnh nảy lên rồi lại cắm xuống), đậm gần hố, nhạt dần ra xa
          let r = b.ra * (1.05 + rnd(k + 1700) * 0.5);
          const rEnd = b.ra * (1.6 + Math.pow(rnd(k + 2100), 0.8) * (lobe ? 2.6 : 1.4));
          let q = 0;
          while (r < rEnd && q < 5) {
            const len = b.ra * (0.12 + rnd(k * 7 + q + 2300) * 0.35), wob = (rnd(k * 7 + q + 2700) - 0.5) * 0.12;
            const c2 = Math.cos(ang + wob), s2 = Math.sin(ang + wob);
            const ux = b.fx * c2 - b.fz * s2, uz = b.fz * c2 + b.fx * s2;
            const [ax, az] = toTex(b.x + wx * r, b.z + wz * r), [bx2, bz2] = toTex(b.x + wx * r + ux * len, b.z + wz * r + uz * len);
            const fade = 1 - (r - b.ra) / (rEnd - b.ra + 1e-3) * 0.6;
            const lw = Math.max(0.5, (0.15 + rnd(k * 7 + q + 2900) * 0.3) * pxPerU);
            mark('52,44,36', (0.08 + rnd(k * 7 + q + 2500) * 0.16) * fade, (g) => {
              g.lineWidth = lw; g.lineCap = 'round';
              g.beginPath(); g.moveTo(ax, az); g.lineTo(bx2, bz2); g.stroke();
            });
            r += len + b.ra * (0.1 + rnd(k * 7 + q + 3100) * 0.45);
            q++;
          }
          // lỗ mảnh găm cuối vệt
          if (rnd(k + 3300) < 0.45) {
            const [hx, hz] = toTex(b.x + wx * r, b.z + wz * r);
            mark('40,32,24', 0.35, (g) => { g.beginPath(); g.arc(hx, hz, Math.max(0.6, 0.22 * pxPerU), 0, 6.283); g.fill(); });
          }
        }
      }
      // sỏi đá & cục đất nhỏ văng lấm tấm trên gờ và vùng đất văng
      const rgb = (c, k) => `${Math.round(clamp01(c[0] * k) * 255)},${Math.round(clamp01(c[1] * k) * 255)},${Math.round(clamp01(c[2] * k) * 255)}`;
      for (const b of blasts) {
        if (b.kind === 'gouge') continue;
        const n = Math.round(24 + b.ra * 4);
        for (let k = 0; k < n; k++) {
          // sỏi văng rải thưa dần từ ngoài gờ (theo elip của hố), không dồn thành vòng sáng đúng miệng hố
          const ang = hash2(k, b.seed, 41) * 6.283, ca = Math.cos(ang), sa = Math.sin(ang);
          const t = 1.25 + Math.pow(hash2(k, b.seed, 43), 0.8) * 2.6;
          const wx = b.fx * ca * b.A - b.fz * sa * b.B, wz = b.fz * ca * b.A + b.fx * sa * b.B;
          const [px, pz] = toTex(b.x + wx * t, b.z + wz * t);
          const sz = (0.1 + hash2(k, b.seed, 47) * 0.3) * pxPerU;
          const lt = hash2(k, b.seed, 53) < 0.35;
          mark(rgb(lt ? P.rock : P.dark, lt ? 0.85 : 1.25), 0.35 + hash2(k, b.seed, 59) * 0.35, (g) => { g.beginPath(); g.arc(px, pz, Math.max(0.6, sz), 0, 6.283); g.fill(); });
        }
      }
      // Vết nứt căng quanh miệng hố: chấn động làm mặt đất nứt thành những đường gãy khúc vòng quanh gờ, vài vết toả ra
      for (const b of blasts) {
        if (!(b.rough > 0) || b.kind === 'gouge') continue;
        const rnd = (k) => hash2(k, b.seed, 83);
        const n = Math.round((4 + b.ra * 0.12) * b.rough);
        for (let k = 0; k < n; k++) {
          const radial = rnd(k * 9) < 0.3;
          let ang = rnd(k * 9 + 1) * 6.283, rr = (radial ? 1.05 : 1.15 + rnd(k * 9 + 2) * 0.55);
          const len = radial ? 0.25 + rnd(k * 9 + 3) * 0.45 : 0.25 + rnd(k * 9 + 3) * 0.6;   // bán kính / radian
          const steps = 7 + Math.floor(rnd(k * 9 + 4) * 6);
          const lw = Math.max(0.6, (0.08 + rnd(k * 9 + 6) * 0.12) * pxPerU), pts = [];
          for (let q = 0; q <= steps; q++) {
            const jit = (hash2(k * 31 + q, b.seed, 89) - 0.5);
            const a2 = ang + (radial ? jit * 0.06 : len * q / steps + jit * 0.03);
            const r2 = (rr + (radial ? len * q / steps : jit * 0.04)) * b.ra;
            pts.push(toTex(b.x + Math.cos(a2) * r2, b.z + Math.sin(a2) * r2));
          }
          mark('38,30,22', 0.22 + rnd(k * 9 + 5) * 0.22, (g) => {
            g.lineWidth = lw; g.lineCap = 'round'; g.lineJoin = 'round';
            g.beginPath(); pts.forEach(([tx, tz], q) => q ? g.lineTo(tx, tz) : g.moveTo(tx, tz)); g.stroke();
          });
        }
      }
      const tex = new THREE.CanvasTexture(cvs), texA = new THREE.CanvasTexture(cvsA);
      for (const tx of [tex, texA]) { tx.anisotropy = 4; tx.wrapS = tx.wrapT = THREE.ClampToEdgeWrapping; }
      // Hai lớp vẽ chung lưới & texture: LÕI đặc (lòng hố, gờ, đất văng dày — ghi độ sâu như vật thể đặc) + VIỀN đất văng mỏng
      // nửa trong suốt (không ghi độ sâu). Một lớp trong suốt có ghi độ sâu thì đất văng mỏng của hố này che mất lòng hố khác
      // ở gần (nhìn xuyên xuống trời)
      const matOpts = { map: tex, alphaMap: texA, roughness: 1.0, metalness: 0, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 };
      const mat = new THREE.MeshStandardMaterial(Object.assign({ alphaTest: CRATER_CORE_ALPHA }, matOpts));
      const matF = new THREE.MeshStandardMaterial(Object.assign({ transparent: true, depthWrite: false, alphaTest: 0.02 }, matOpts));
      const group = new THREE.Group();
      group.position.set(cx, 0, cz);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      const meshF = new THREE.Mesh(geo, matF);
      meshF.receiveShadow = true;
      group.add(meshF);

      // ---- 3. KHOÉT LỖ MẶT ĐẤT để lòng hố lộ ra + hạ lưới độ cao vật lý (xe chạy qua sụt xuống hố) ----
      // Hết chỗ lỗ khoét trong shader: bỏ hẳn hố cũ nhất (mất lỗ mà còn hố -> mặt đất phẳng che lòng hố, xe vẫn sụt hố vô hình)
      while (ExplosionFX.groundHoleCount() + holeC.length > ExplosionFX.MAX_GROUND_HOLES) {
        const oi = this.craters.findIndex(c => !c.persistent && c.holeSlots);
        if (oi < 0) break;
        this.removeDecal(this.craters, oi);
      }
      const holes = holeE.map(h => ExplosionFX.addGroundHole(h.x, h.z, h.r, h.ratio, h.ang));
      ExplosionFX.installCraterHoles(mat, holes, false);
      ExplosionFX.installCraterHoles(matF, holes, true);
      let def = null;
      if (t && t.heightData && t.segments && !opts.noDeform) {
        const Sg = t.segments, Ng = Sg + 1, cell = t.width / Sg;
        const H0 = this.heightOrig(t);
        const i0 = Math.max(0, Math.floor((x0 + t.width / 2) / cell)), i1 = Math.min(Sg, Math.ceil((x1 + t.width / 2) / cell));
        const j0 = Math.max(0, Math.floor((z0 + t.depth / 2) / cell)), j1 = Math.min(Sg, Math.ceil((z1 + t.depth / 2) / cell));
        const dIdx = [], dVal = [];
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const wx = -t.width / 2 + i * cell, wz = -t.depth / 2 + j * cell;
          const gi = Math.round((toGU(wx, wz) - ox) / S * M), gj = Math.round((toGV(wx, wz) - oz) / S * M);
          if (gi < 0 || gj < 0 || gi > M || gj > M) continue;
          const h = Hgrid[gj * N1 + gi];
          if (h >= -0.05) continue;
          const k = j * Ng + i;
          // thoải hơn hình thật một chút (xe vẫn bò ra được), không bao giờ nâng đất lên
          const v = H0[k] + h * 0.75;
          t.heightData[k] = Math.min(t.heightData[k], v);
          dIdx.push(k); dVal.push(v);
        }
        // nhớ phần lưới vật lý hố này đã hạ -> xoá hố thì trả lại mặt đất (không để hố vô hình dưới mặt đất phẳng)
        if (dIdx.length) def = { idx: Int32Array.from(dIdx), val: Float32Array.from(dVal) };
      }

      // ---- 4. Cục đất vón 3D lăn trong lòng hố & văng trên gờ (phía trước nhiều hơn khi bắn xiên) ----
      const clodGeo = CLOD_GEO || (CLOD_GEO = makeRockGeometry());   // dùng chung, không giải phóng theo hố
      const clodMats = [0.8, 0.66, 0.54].map(k => new THREE.MeshStandardMaterial({
        color: new THREE.Color(sub[0] * k * 1.1, sub[1] * k * 1.1, sub[2] * k * 1.1), roughness: 1, metalness: 0
      }));
      const Hat = (px, pz) => {
        const gi = Math.max(0, Math.min(M, Math.round((toGU(px, pz) - ox) / S * M))), gj = Math.max(0, Math.min(M, Math.round((toGV(px, pz) - oz) / S * M)));
        return Hgrid[gj * N1 + gi];
      };
      let ci = 0;
      for (const b of blasts) {
        const n = Math.round(3 + b.ra * 0.45);
        for (let k = 0; k < n; k++) {
          const fwd = Math.random() < 0.3 + 0.4 * (1 - b.sinT);
          const ang = fwd ? Math.atan2(b.fz, b.fx) + (Math.random() - 0.5) * 2 : Math.random() * 6.283;
          const rr = b.ra * (Math.random() < 0.25 ? rand(0.2, 0.6) : rand(0.95, 1.8));
          const px = b.x + Math.cos(ang) * rr, pz = b.z + Math.sin(ang) * rr;
          const sz = Math.min(b.ra * rand(0.05, 0.14), rand(2.2, 4.8));   // cục đất ≤ ~0,6 m dù hố to cỡ nào
          const m = new THREE.Mesh(clodGeo, clodMats[(ci++) % clodMats.length]);
          m.scale.set(sz * rand(0.8, 1.3), sz * rand(0.45, 0.75), sz * rand(0.8, 1.3));
          m.position.set(px - cx, base(px, pz) + Hat(px, pz) + sz * 0.2, pz - cz);
          m.rotation.set(rand(-0.4, 0.4), rand(0, 6.28), rand(-0.4, 0.4));
          m.castShadow = sz > 0.6;
          m.receiveShadow = true;
          group.add(m);
        }
      }
      // Hố thô: cục đất vỡ & đá lẫn trong đất lăn xuống đọng ở chân vách / đáy, đá văng nằm trên gờ
      const rockMats = (Rr > 0 && P.rock) ? [0.78, 0.6].map(k => new THREE.MeshStandardMaterial({
        color: new THREE.Color(P.rock[0] * k, P.rock[1] * k, P.rock[2] * k), roughness: 0.95, metalness: 0, flatShading: true
      })) : [];
      for (const b of blasts) {
        if (!(b.rough > 0) || b.kind === 'gouge') continue;
        const n = Math.round((2 + b.ra * 0.35) * b.rough);
        for (let k = 0; k < n; k++) {
          const ang = Math.random() * 6.283, onRim = Math.random() < 0.35;
          const rr = b.ra * (onRim ? rand(1.0, 1.5) : rand(0.25, 0.6));
          const px = b.x + Math.cos(ang) * rr, pz = b.z + Math.sin(ang) * rr;
          const sz = Math.min(b.ra * rand(0.03, 0.1), rand(1.2, onRim ? 4 : 6.5));
          const isRock = Math.random() < 0.45;
          const m = new THREE.Mesh(clodGeo, isRock ? rockMats[k % rockMats.length] : clodMats[(ci++) % clodMats.length]);
          m.scale.set(sz * rand(0.7, 1.4), sz * rand(0.5, 0.95), sz * rand(0.7, 1.4));
          m.position.set(px - cx, base(px, pz) + Hat(px, pz) + sz * 0.12, pz - cz);   // lún một nửa vào đất
          m.rotation.set(rand(-0.6, 0.6), rand(0, 6.28), rand(-0.6, 0.6));
          m.castShadow = sz > 0.6;
          m.receiveShadow = true;
          group.add(m);
        }
      }

      this.scene.add(group);
      const rec = {
        group, mats: [mat, matF, ...clodMats, ...rockMats], geos: [geo], texs: [tex, texA], t: 0,
        life: opts.persistent ? 1e12 : 1e9,          // hố nổ tồn tại suốt trận (cộng dồn), chỉ cũ nhất bị thay khi quá nhiều
        holeSlot: holes[0], holeSlots: holes, persistent: !!opts.persistent, blasts,
        params: { x: blasts[blasts.length - 1].x, z: blasts[blasts.length - 1].z, R: maxRa, effR: maxRa, bowlD: deepest, heavy: blasts.some(b => b.heavy) },
        // mặt hố nhìn thấy (lưới Hgrid + đất nguyên thuỷ) cho craterSurfaceAt; phần lưới vật lý đã hạ (def) để trả lại khi xoá
        surf: { ox, oz, cx, cz, gc, gs, S, M, Hgrid, holeC, base, x0, x1, z0, z1 }, def
      };
      this.craters.push(rec);
      while (this.craters.length > this.maxCraters) {
        const oi = this.craters.findIndex(c => !c.persistent);
        if (oi < 0) break;
        this.removeDecal(this.craters, oi);
      }
      // cây, đá tảng, đá vụn, xác xe, rào, bao cát... trong vùng hố tự hạ xuống lòng hố / gờ đất mới
      this.groundChanged(x0, z0, x1, z1);
      return rec;
    }

    // Mặt đất NHÌN THẤY trong vùng hố bom (lòng hố sâu hơn lưới vật lý ~25%; gờ đất đắp cao hơn mặt đất). null = ngoài mọi hố
    // g: độ cao mặt đất thường tại đó (nếu có) -> trả luôn mặt đất cuối cùng (lòng hố / max(gờ, đất) / đất)
    craterSurfaceAt(x, z, g) {
      let bowl = null, rim = null;
      for (let q = 0; q < this.craters.length; q++) {
        const s = this.craters[q].surf;
        if (!s || x < s.x0 || x > s.x1 || z < s.z0 || z > s.z1) continue;
        const lx = (x - s.cx) * s.gc + (z - s.cz) * s.gs, lz = -(x - s.cx) * s.gs + (z - s.cz) * s.gc;
        const gx = (lx - s.ox) / s.S * s.M, gz = (lz - s.oz) / s.S * s.M;
        if (gx < 0 || gz < 0 || gx > s.M || gz > s.M) continue;
        const i = Math.min(s.M - 1, Math.floor(gx)), j = Math.min(s.M - 1, Math.floor(gz)), fx = gx - i, fz = gz - j, N1 = s.M + 1;
        const G = s.Hgrid, k = j * N1 + i;
        const H = (G[k] * (1 - fx) + G[k + 1] * fx) * (1 - fz) + (G[k + N1] * (1 - fx) + G[k + N1 + 1] * fx) * fz;
        const y = s.base(x, z) + H + 0.04;
        let inH = false;
        for (const h of s.holeC) {
          let dx = x - h.x, dz = z - h.z;
          if (h.ratio && h.ratio < 0.995) { const c = Math.cos(h.ang), sn = Math.sin(h.ang), a = dx * c + dz * sn; dz = (-dx * sn + dz * c) / h.ratio; dx = a; }
          if (dx * dx + dz * dz < h.r * h.r) { inH = true; break; }
        }
        if (inH) bowl = bowl === null ? y : Math.min(bowl, y);
        else if (H > 0.02) rim = rim === null ? y : Math.max(rim, y);
      }
      if (bowl !== null) return bowl;
      if (g === undefined) return rim;
      return rim === null ? g : Math.max(rim, g);
    }
    surfaceAt(x, z) { return this.craterSurfaceAt(x, z, this.groundAt(x, z)); }
    // Có hố nào (vùng lòng hố + gờ, không tính lớp đất văng mỏng phía xa) chạm hình vuông bán kính r quanh (x, z)
    cratersNear(x, z, r) {
      for (let q = 0; q < this.craters.length; q++) {
        const c = this.craters[q], s = c.surf;
        if (!s || !c.blasts) continue;
        for (const b of c.blasts) {
          const e = Math.max(b.A, b.B) * 1.6 + b.shift + r;
          if (Math.abs(x - b.x) < e && Math.abs(z - b.z) < e) return true;
        }
      }
      return false;
    }
    // Báo địa hình: mặt đất trong hình chữ nhật vừa đổi (hố mới / hố bị xoá) -> các hệ vật thể đặt lại độ cao
    groundChanged(x0, z0, x1, z1) {
      const t = this.terrainOf();
      // đá vụn / cục đất đã nằm yên trong vùng: rơi xuống lòng hố mới (hoặc nổi lên khi hố bị lấp)
      this.rocks.reground(x0, z0, x1, z1, this._surfFn);
      this.bits.reground(x0, z0, x1, z1, this._surfFn);
      this.hardRocks.reground(x0, z0, x1, z1, this._surfFn);
      if (this.bulletHoles) this.bulletHoles.removeIn(x0, z0, x1, z1);
      this.glass.reground(x0, z0, x1, z1, this._surfFn);
      if (t && t.onGroundChanged) t.onGroundChanged(x0, z0, x1, z1);
    }
    // Trả lưới độ cao vật lý về như trước khi có hố d (các hố còn lại chồng lên vùng đó được áp lại)
    restoreCraterHeights(d) {
      const t = this.terrainOf();
      if (!d.def || !t || !t.heightData || !t._heightOrig) return;
      const H = t.heightData, H0 = t._heightOrig, I = d.def.idx;
      const touched = new Set();
      for (let q = 0; q < I.length; q++) { H[I[q]] = H0[I[q]]; touched.add(I[q]); }
      for (const c of this.craters) {
        if (c === d || !c.def) continue;
        const ci = c.def.idx, cv = c.def.val;
        for (let q = 0; q < ci.length; q++) if (touched.has(ci[q]) && cv[q] < H[ci[q]]) H[ci[q]] = cv[q];
      }
    }

    // Độ cao mặt đất nguyên thuỷ (trước mọi hố nổ) — bản sao lưới độ cao chụp lần đầu có hố
    heightOrig(t) {
      if (!t._heightOrig || t._heightOrig.length !== t.heightData.length) t._heightOrig = Float32Array.from(t.heightData);
      return t._heightOrig;
    }
    rawGroundFn(t) {
      if (!t || !t.heightData || !t.segments) return (x, z) => this.groundAt(x, z);
      const H0 = this.heightOrig(t), Sg = t.segments, N = Sg + 1;
      return (x, z) => {
        const gx = ((x + t.width / 2) / t.width) * Sg, gz = ((z + t.depth / 2) / t.depth) * Sg;
        const ix = Math.max(0, Math.min(Sg - 1, Math.floor(gx))), iz = Math.max(0, Math.min(Sg - 1, Math.floor(gz)));
        const fx = Math.max(0, Math.min(1, gx - ix)), fz = Math.max(0, Math.min(1, gz - iz));
        const i = iz * N + ix;
        if (fx + fz <= 1) return H0[i] + (H0[i + 1] - H0[i]) * fx + (H0[i + N] - H0[i]) * fz;
        return H0[i + N + 1] + (H0[i + N] - H0[i + N + 1]) * (1 - fx) + (H0[i + 1] - H0[i + N + 1]) * (1 - fz);
      };
    }

    // --- 8. Vết nứt vỡ trên tường ---
    findWallNormal(x, y, z) {
      const t = this.terrainOf();
      if (!t || !t.checkHorseshoeCollision) return null;
      const hit = t.checkHorseshoeCollision(x, y, z);
      // Cứ điểm bê tông: pháp tuyến đúng mặt tường (mặt trong / tường cánh / mặt tiền); trần & mái không dán vết
      if (hit && hit.hit && hit.stronghold) return hit.normal || null;
      let cx = null, cz = null, blk = null;
      if (hit && hit.hit) {
        if (hit.obstacle) { cx = hit.obstacle.x; cz = hit.obstacle.z; }
        else if (hit.fort && hit.fort.wallBlocks) {
          let best = null, bd = Infinity;
          for (const b of hit.fort.wallBlocks) {
            const d = Math.hypot(x - b.x, z - b.z);
            if (d < bd) { bd = d; best = b; }
          }
          if (best) { cx = best.x; cz = best.z; blk = best; }
        }
      }
      if (cx === null) return null;
      let nx = x - cx, nz = z - cz;
      const l = Math.hypot(nx, nz) || 1;
      return { nx: nx / l, nz: nz / l, block: blk };
    }

    addWallMark(x, y, z, info, size) {
      // Vết dán phẳng không được chìa ra ngoài khối tường còn lại (khối đã vỡ / cụt thấp hơn điểm nổ thì thôi)
      const b = info.block;
      if (b) {
        if (!b.alive || y > b.y1 + 0.5) return;
        size = Math.min(size, b.len * 0.8, (b.y1 - b.y0) * 0.8);
      }
      const mat = new THREE.MeshLambertMaterial({
        map: getWallTexture(Math.floor(Math.random() * 4)), transparent: true, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4
      });
      const geo = new THREE.PlaneGeometry(size, size);
      const m = new THREE.Mesh(geo, mat);
      const n = new THREE.Vector3(info.nx, 0, info.nz);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
      m.rotateZ(Math.random() * Math.PI * 2);
      m.position.set(x + info.nx * 0.6, Math.max(y, this.groundAt(x, z) + size * 0.3), z + info.nz * 0.6);
      m.renderOrder = 2;
      this.scene.add(m);
      this.wallMarks.push({ group: m, mats: [mat], geos: [geo], t: 0, life: Infinity });
      while (this.wallMarks.length > this.maxWallMarks) this.removeDecal(this.wallMarks, 0);
    }

    // Gỡ mọi vết đạn / vết nứt / lỗ thủng quanh một điểm (phần tường / nhà mang vết đó đã vỡ rơi mất)
    /** Vết đạn nhỏ trên tường nhà (Destructibles gọi): p, n thế giới; he: 30mm; tint: màu lớp vật liệu lộ ra (bê tông / gạch mộc / gỗ) */
    addWallPit(p, n, he, tint) {
      const k = tint ? [Math.min(1, tint[0] / 0.82), Math.min(1, tint[1] / 0.82), Math.min(1, tint[2] / 0.82)] : null;
      (he ? this.wallPits.he : this.wallPits.s).add(p, n, he ? 3.2 : 2.2, null, null, 1, k);
    }
    // Bỏ các vết trên xe u nằm trong hộp (thế giới): khối giáp / gạch ERA vừa bung khỏi xe không để vết lơ lửng tại chỗ
    removeUnitMarksIn(u, box) {
      const p = new THREE.Vector3();
      for (let i = this.surfaceMarks.length - 1; i >= 0; i--) {
        const rec = this.surfaceMarks[i];
        if (rec.unit !== u) continue;
        this.markWorldPos(rec, p);
        if (box.containsPoint(p)) this.removeSurfaceMark(i);
      }
    }
    removeMarksNear(x, y, z, r) {
      const p = new THREE.Vector3();
      for (let i = this.wallMarks.length - 1; i >= 0; i--) {
        this.wallMarks[i].group.getWorldPosition(p);
        if (p.distanceToSquared(new THREE.Vector3(x, y, z)) < r * r) this.removeDecal(this.wallMarks, i);
      }
      if (this.wallHoles) this.wallHoles.removeNear(x, y, z, r);
      if (this.wallPits) { this.wallPits.s.removeNear(x, y, z, r); this.wallPits.he.removeNear(x, y, z, r); }
      if (this.fragHoles) this.fragHoles.removeNear(x, y, z, r);
      if (this.surfaceMarks) {
        for (let i = this.surfaceMarks.length - 1; i >= 0; i--) {
          const rec = this.surfaceMarks[i];
          if (rec.unit) continue;
          this.markWorldPos(rec, p);
          if (Math.abs(p.x - x) < r && Math.abs(p.y - y) < r && Math.abs(p.z - z) < r) this.removeSurfaceMark(i);
        }
      }
    }

    removeDecal(list, i, quiet) {
      const d = list[i];
      if (d.holeSlots) d.holeSlots.forEach(h => ExplosionFX.removeGroundHole(h));
      else if (d.holeSlot) ExplosionFX.removeGroundHole(d.holeSlot);
      // hố bom: trả lưới độ cao vật lý + báo vật thể nổi lên lại mặt đất (quiet: gộp cụm, hố mới dựng lại ngay)
      if (d.def) this.restoreCraterHeights(d);
      if (d.surf) {
        const s = d.surf;
        d.surf = null;
        if (!quiet) this.groundChanged(s.x0, s.z0, s.x1, s.z1);
      }
      if (d.texs) d.texs.forEach(tx => tx.dispose());
      this.scene.remove(d.group);
      d.mats.forEach(m => m.dispose());
      d.geos.forEach(g => g.dispose());
      list.splice(i, 1);
    }

    // ===========================================================================
    // CẬP NHẬT MỖI KHUNG HÌNH
    // ===========================================================================
    update(dt) {
      if (!(dt > 0)) return;
      this._clock = (this._clock || 0) + dt;
      // cây bị quật đổ / cháy rụi: bỏ vết đạn còn dính trên thân (không lơ lửng giữa không trung)
      if ((this._treeChk = (this._treeChk || 0) + dt) > 0.5) {
        this._treeChk = 0;
        const gone = (x, y, z, it) => !!(it && (it.fallen || it.state === 'gone' || it.state === 'fallen'));
        this.treePits.wood.removeWhere(gone); this.treePits.cactus.removeWhere(gone);
      }
      dt = Math.min(dt, 0.05);
      if (this.jetBeams && this.jetBeams.length) this.updateJetBeams(dt);

      // Lửa âm ỉ tại chỗ: liên tục nhả ngọn lửa nhỏ + khói
      for (let i = this.emitters.length - 1; i >= 0; i--) {
        const e = this.emitters[i];
        e.t += dt;
        if (e.t > e.dur) { this.emitters.splice(i, 1); continue; }
        const strength = 1 - Math.max(0, (e.t - e.dur * 0.6) / (e.dur * 0.4));
        e.acc += dt * e.rate * strength;
        while (e.acc >= 1) {
          e.acc -= 1;
          this.fire.add({
            x: e.x + rand(-1, 1) * e.size * 0.4, y: e.y + e.size * 0.3, z: e.z + rand(-1, 1) * e.size * 0.4,
            vx: rand(-2, 2), vy: rand(8, 16), vz: rand(-2, 2), size: e.size * rand(0.8, 1.3), grow: -e.size * 0.6,
            life: rand(0.35, 0.6), alpha: 0.9, fadeIn: 0.05, c0: [1, 0.75, 0.35], c1: [0.8, 0.25, 0.05], cell: 1, floor: false
          });
          if (Math.random() < 0.35) {
            const g = rand(0.1, 0.18);
            this.smoke.add({
              x: e.x, y: e.y + e.size, z: e.z, vx: rand(-3, 3), vy: rand(10, 18), vz: rand(-3, 3),
              size: e.size * 1.6, grow: e.size * 1.2, drag: 0.4, grav: -3, life: rand(2, 3.5), alpha: 0.45, fadeIn: 0.2,
              c0: [g, g, g], c1: [g * 2, g * 2, g * 1.9], cell: 0, floor: false
            });
          }
        }
      }

      for (let i = this.lights.length - 1; i >= 0; i--) {
        const L = this.lights[i];
        L.t += dt;
        const k = 1 - L.t / L.life;
        L.l.intensity = Math.max(0, L.peak * k * k);
        if (L.t >= L.life) { L.l.intensity = 0; this.lights.splice(i, 1); }
      }

      this.smoke.update(dt, this.groundAt);
      this.signal.update(dt, null);
      this.screen.update(dt, this.groundAt);
      this.fire.update(dt, this.groundAt);
      this.updateVehicles(dt);
      this.updateSurfaceMarks(dt);
      this.rocks.update(dt, this._surfFn);        // mảnh rơi nằm trên mặt NHÌN THẤY (lòng hố sâu hơn lưới vật lý)
      this.hardRocks.update(dt, this._surfFn);
      this.bits.update(dt, this._surfFn);
      this.glass.update(dt, this._surfFn);
      // Mảnh văng cắm xuống đất tung bụi nhỏ
      this.streaks.update(dt, this.groundAt, (x, y, z) => {
        if (Math.random() < 0.35) this.smoke.add({ x, y: y + 0.3, z, vx: rand(-4, 4), vy: rand(4, 12), vz: rand(-4, 4), size: rand(1.2, 2.4), grow: 3, drag: 2, grav: 30, life: rand(0.5, 1.0), alpha: 0.5, fadeIn: 0.02, c0: this.palette('GROUND').dust, cell: 2 });
      });
      this.shocks.update(dt);
      for (let i = this.ripples.length - 1; i >= 0; i--) {
        const r = this.ripples[i];
        r.t += dt;
        const sc = r.r0 + r.t * r.speed;
        r.m.scale.set(sc, 1, sc);
        r.m.material.opacity = Math.max(0, r.op * (1 - r.t / r.life));
        if (r.t > r.life) { this.scene.remove(r.m); r.m.material.dispose(); this.ripples.splice(i, 1); }
      }
      // Sóng nước lan tròn (đoàn sóng có đỉnh bọt trắng, chỉ hiện ở chỗ có sóng)
      if (this.waves) for (let i = this.waves.length - 1; i >= 0; i--) {
        const w = this.waves[i];
        w.t += dt;
        const U = w.m.material.uniforms;
        U.uFront.value = w.c * w.t;
        U.uAmp.value = w.A * Math.exp(-w.t / (w.life * 0.5));
        U.uFade.value = Math.min(1, w.t / 0.15) * Math.max(0, 1 - w.t / w.life);
        if (w.foam) { const f = w.foam; const sc = f.r0 + Math.sqrt(w.t) * f.g; f.m.scale.set(sc, 1, sc); f.m.material.opacity = 0.75 * Math.min(1, w.t / 0.6) * Math.max(0, 1 - w.t / (w.life * 1.1)); }
        if (w.t > w.life) { this.scene.remove(w.m); w.m.geometry.dispose(); w.m.material.dispose(); if (w.foam) { this.scene.remove(w.foam.m); w.foam.m.geometry.dispose(); w.foam.m.material.dispose(); } this.waves.splice(i, 1); }
      }
      this.updateSabots(dt);

      // Hố đạn / vết tường mờ dần cuối đời
      for (const list of [this.craters, this.wallMarks]) {
        for (let i = list.length - 1; i >= 0; i--) {
          const d = list[i];
          d.t += dt;
          const fade = Math.min(1, (d.life - d.t) / 10);
          if (fade <= 0) { this.removeDecal(list, i); continue; }
          if (fade < 1) d.mats.forEach(m => { m.opacity = fade; });
        }
      }
    }

    clear() {
      this.smoke.parts.length = 0;
      this.signal.parts.length = 0;
      this.screen.parts.length = 0;
      this.fire.parts.length = 0;
      this.rocks.rocks.length = 0;
      this.hardRocks.rocks.length = 0;
      this.hardRocks.update(0.001, null);
      this.bits.rocks.length = 0;
      this.bits.update(0.001, null);
      this.glass.parts.length = 0;
      this.glass.update(0.001, null);
      if (this.streaks) this.streaks.clear();
      if (this.shocks) this.shocks.clear();
      if (this.jetBeams) { for (const b of this.jetBeams) { this.scene.remove(b.m); b.m.material.dispose(); } this.jetBeams.length = 0; }
      this.sabots.forEach(sb => this.scene.remove(sb.mesh));
      this.sabots.length = 0;
      this.emitters.length = 0;
      this.lights.forEach(L => { L.l.intensity = 0; });
      this.lights.length = 0;
      while (this.craters.length) this.removeDecal(this.craters, 0);
      while (this.wallMarks.length) this.removeDecal(this.wallMarks, 0);
      while (this.surfaceMarks.length) this.removeSurfaceMark(0);
      this.groundHoles.clear();
      this.bulletHoles.clear();
      this.wallHoles.clear();
      for (const L of [this.wallPits.s, this.wallPits.he, this.treePits.wood, this.treePits.cactus]) L.clear();
      if (this.fragHoles) this.fragHoles.clear();
      this.smoke.update(0.001, null);
      this.signal.update(0.001, null);
      this.screen.update(0.001, null);
      this.fire.update(0.001, null);
      this.rocks.update(0.001, null);
    }
    /**
     * Gắn lại các lớp hiệu ứng thường trực vào cảnh (game dọn sạch scene.children khi chơi lại / rời trận -> nếu không
     * gắn lại thì từ trận sau khói, lửa, đất đá, hố & vết đạn đều không hiện)
     */
    reattach() {
      const add = (o) => { if (o && o.parent !== this.scene) this.scene.add(o); };
      for (const L of [this.smoke, this.signal, this.screen, this.fire, this.rocks, this.hardRocks, this.bits, this.streaks, this.wallHoles]) add(L && L.mesh);
      for (const k in this.groundHoles.layers) add(this.groundHoles.layers[k].im);
      for (const k in this.bulletHoles.L) { add(this.bulletHoles.L[k].capIm); add(this.bulletHoles.L[k].bowlIm); }
      for (const P of [this.wallPits.s, this.wallPits.he, this.treePits.wood, this.treePits.cactus]) for (const L of P.layers) add(L.im);
    }
  }

  Object.assign(ExplosionFX.prototype, DamageMixin);

  // Dò tia theo đường bay vào mô hình xe để lấy đúng điểm chạm + pháp tuyến bề mặt
  // ---------------------------------------------------------------------------
  // LỖ KHOÉT MẶT ĐẤT CHO HỐ BOM: shader mặt đất bỏ điểm ảnh trong các vòng tròn hố đang tồn tại,
  // để lưới lòng chảo (thấp hơn mặt đất) lộ ra -> hố lõm thật sự thay vì vết vẽ phẳng
  // ---------------------------------------------------------------------------
  const MAX_HOLES = 80;   // số lỗ khoét mặt đất cùng lúc (mỗi hố pháo 1-vài lỗ); mảng uniform trong shader mặt đất
  const holeList = [];
  const holeU = { value: Array.from({ length: MAX_HOLES }, () => new THREE.Vector4(0, 0, 0, 0)) };
  const holeN = { value: 0 };
  function syncHoles() {
    for (let i = 0; i < MAX_HOLES; i++) {
      const h = holeList[i];
      if (h) holeU.value[i].set(h.x, h.z, h.r, h.w || 1); else holeU.value[i].set(0, 0, 0, 0);
    }
    holeN.value = Math.min(MAX_HOLES, holeList.length);
  }
  // Lỗ tròn (ratio = 1) hoặc elip: r = bán trục lớn theo hướng angle, ratio = bán trục nhỏ / lớn. Elip mã hoá vào w:
  // w = 2 + floor(ratio·1000) + phần lẻ (angle / 2π) — w = 1 là lỗ tròn kiểu cũ
  ExplosionFX.addGroundHole = function (x, z, r, ratio = 1, angle = 0) {
    const h = { x, z, r };
    if (ratio < 0.995) { const a = ((angle / (Math.PI * 2)) % 1 + 1) % 1; h.w = 2 + Math.floor(Math.max(0.05, ratio) * 1000) + a * 0.999; }
    holeList.push(h);
    while (holeList.length > MAX_HOLES) holeList.shift();
    syncHoles();
    return h;
  };
  ExplosionFX.removeGroundHole = function (h) {
    const i = holeList.indexOf(h);
    if (i >= 0) { holeList.splice(i, 1); syncHoles(); }
  };
  // Vết đạn nhỏ trên đất dùng chung với EnvDamage (vết cộng dồn theo ô)
  ExplosionFX.bulletMarkMesh = makeBulletMarkMesh;
  // texture vết đạn bề mặt cứng (EnvDamage dùng cho rỗ bê tông cứ điểm)
  ExplosionFX._pitTex = getPitTex;
  ExplosionFX.clearGroundHoles = function () { holeList.length = 0; syncHoles(); };
  ExplosionFX.groundHoleCount = () => holeList.length;
  ExplosionFX.MAX_GROUND_HOLES = MAX_HOLES;
  // GLSL dùng chung: khoảng cách chuẩn hoá tới lỗ gần nhất (< 1 = trong lỗ). Lỗ elip (hố dài do đạn bắn xiên / rãnh cày):
  // đưa về toạ độ trục elip rồi giãn trục nhỏ
  const HOLE_GLSL = `varying vec2 vHoleXZ;
float holeQ(vec2 p, vec4 gh) {
  vec2 dd = p - gh.xy;
  if (gh.w >= 2.0) {
    float an0 = fract(gh.w) * 6.2831853, rat = max(0.05, (floor(gh.w) - 2.0) / 1000.0);
    vec2 ax = vec2(cos(an0), sin(an0));
    dd = vec2(dot(dd, ax), dot(dd, vec2(-ax.y, ax.x)) / rat);
  }
  return length(dd) / max(gh.z, 1e-3);
}
`;
  // Gắn vào vật liệu (giữ nguyên onBeforeCompile sẵn có): truyền toạ độ xz thế giới sang fragment + hàm holeQ
  function patchHoles(mat, key, uniforms, frag) {
    const prev = mat.onBeforeCompile;
    const prevKey = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : null;
    mat.onBeforeCompile = (sh, r) => {
      if (prev) prev(sh, r);
      Object.assign(sh.uniforms, uniforms);
      sh.vertexShader = 'varying vec2 vHoleXZ;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n  vHoleXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
      sh.fragmentShader = HOLE_GLSL + frag(sh.fragmentShader);
    };
    mat.customProgramCacheKey = () => (prevKey ? prevKey() : '') + key;
    mat.needsUpdate = true;
  }
  // Mặt đất: bỏ điểm ảnh trong lỗ. Mép lỗ nằm khuất dưới gờ đất của lưới hố (hình lồi lõm của hố do lưới hố đảm nhận)
  ExplosionFX.installGroundHoles = function (mat) {
    if (!mat || mat.userData.groundHoles) return;
    mat.userData.groundHoles = true;
    patchHoles(mat, '|holes', { groundHoles: holeU, groundHoleCount: holeN }, (f) =>
      `uniform vec4 groundHoles[${MAX_HOLES}];\nuniform int groundHoleCount;\n` + f.replace('void main() {', `void main() {
  for (int hi = 0; hi < ${MAX_HOLES}; hi++) {
    if (hi >= groundHoleCount) break;
    if (holeQ(vHoleXZ, groundHoles[hi]) < 1.0) discard;
  }`));
  };
  // Lưới hố (lõi đặc & viền mờ, xem buildCraterCluster):
  //  - trong các lỗ CỦA CHÍNH hố này & vành quanh lỗ phải đặc (mặt đất ở đó đã bị bỏ -> nửa trong suốt là nhìn xuyên xuống trời).
  //    Làm ngay trong shader vì nhìn xiên card đồ hoạ lấy bản texture thu nhỏ, độ đặc ở mép lỗ bị pha với vùng trong suốt bên ngoài
  //  - phần nằm trong lỗ của hố KHÁC thì bỏ: đất ở đó đã bị phát nổ sau hất đi, không thì thành tấm che lòng hố đó
  //  - lõi giữ điểm ảnh có độ đặc >= CRATER_CORE_ALPHA (alphaTest), viền giữ phần còn lại
  const OWN_HOLES = 8;   // mỗi cụm hố khoét tối đa 8 lỗ (xem buildCraterCluster)
  const CRATER_CORE_ALPHA = 0.9;
  ExplosionFX.installCraterHoles = function (mat, holes, fringe) {
    if (!mat || mat.userData.craterHoles) return;
    mat.userData.craterHoles = true;
    const own = Array.from({ length: OWN_HOLES }, (_, i) => {
      const h = holes[i];
      return h ? new THREE.Vector4(h.x, h.z, h.r, h.w || 1) : new THREE.Vector4(0, 0, 0, 0);
    });
    patchHoles(mat, fringe ? '|craterFringe' : '|craterCore', { craterHoles: { value: own }, groundHoles: holeU, groundHoleCount: holeN }, (f) =>
      `uniform vec4 craterHoles[${OWN_HOLES}];\nuniform vec4 groundHoles[${MAX_HOLES}];\nuniform int groundHoleCount;\n` +
      f.replace('#include <alphatest_fragment>', `float hq = 1e9;
  for (int hi = 0; hi < ${OWN_HOLES}; hi++) if (craterHoles[hi].z > 0.0) hq = min(hq, holeQ(vHoleXZ, craterHoles[hi]));
  if (hq >= 1.0) for (int hi = 0; hi < ${MAX_HOLES}; hi++) {
    if (hi >= groundHoleCount) break;
    if (holeQ(vHoleXZ, groundHoles[hi]) < 1.0) discard;
  }
  diffuseColor.a = max(diffuseColor.a, 1.0 - smoothstep(1.15, 1.45, hq));
  ${fringe ? `if (diffuseColor.a >= ${CRATER_CORE_ALPHA.toFixed(2)}) discard;` : ''}
#include <alphatest_fragment>`));
  };

  ExplosionFX.prototype.raycastUnit = function (unit, shell) {
    if (!unit || !unit.group) return null;
    const v = new THREE.Vector3(shell.vx || 0, shell.vy || 0, shell.vz || 0);
    if (v.lengthSq() < 1e-6) v.set(0, -1, 0);
    v.normalize();
    const origin = new THREE.Vector3(shell.x, shell.y, shell.z).addScaledVector(v, -45);
    const rc = this._rc || (this._rc = new THREE.Raycaster());
    rc.set(origin, v);
    rc.far = 140;
    unit.group.updateMatrixWorld(true);
    const hits = rc.intersectObject(unit.group, true);
    for (const h of hits) {
      const o = h.object;
      if (!o.visible || o.userData.isFxDecal || o === unit.hpBarMesh || o === unit.hpBgMesh || o === unit.reactiveArmorMesh) continue;
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      if (m && (m.blending === THREE.AdditiveBlending || m.isMeshBasicMaterial)) continue;
      const n = h.face ? h.face.normal.clone().transformDirection(o.matrixWorld) : new THREE.Vector3(0, 1, 0);
      return { point: h.point, normal: n, object: o, unit, hitType: 'DIRECT_HIT', faceIndex: h.faceIndex, instanceId: h.instanceId };
    }
    // Không chạm hình học (va chạm cầu bao) -> lấy điểm hiện tại, pháp tuyến hướng ra khỏi tâm xe
    const n = new THREE.Vector3(shell.x - unit.x, 0, shell.z - unit.z);
    if (n.lengthSq() < 1e-4) n.set(0, 1, 0);
    return { point: new THREE.Vector3(shell.x, shell.y, shell.z), normal: n.normalize(), object: unit.hullMainMesh || null, unit, hitType: 'DIRECT_HIT' };
  };

  // Hố bom của vụ nổ do máy khác báo về (ENV_HIT): đào đúng điểm nổ chuẩn, cùng thông số như spawn()
  ExplosionFX.prototype.syncCrater = function (x, y, z, ammoType, heavy, dir) {
    const prof = PROFILES[ammoType] || PROFILES.NORMAL;
    if (prof.micro || !(prof.crater > 0)) return;
    const l = Math.hypot(dir.x || 0, dir.y || 0, dir.z || 0) || 1;
    const dv = { x: (dir.x || 0) / l, y: (dir.y || -1) / l, z: (dir.z || 0) / l, hasDir: true };
    this.addCrater(x, z, prof.crater * (heavy ? 1.6 : 1), this.palette('GROUND'), (prof.depth || 0.6) * (heavy ? 1.4 : 1), dv, ammoType, { heavy });
  };

  ExplosionFX.forScene = (scene) => REGISTRY.get(scene) || null;

  if (typeof window !== 'undefined') window.ExplosionFX = ExplosionFX;
})();
