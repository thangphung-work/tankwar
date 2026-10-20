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
    const rnd = (i) => hash2(i, kind === 'wall' ? 17 : 29, 13);
    if (kind === 'wall') {
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
    add(x, y, z, nx, ny, nz, size) {
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
      float c = cos(iRot), s = sin(iRot);
      vec2 p = position.xy * iSize;
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
    blastPush(x, y, z, R, minAge = 0.2) {
      for (const p of this.parts) {
        if (p.delay > 0 || p.t < minAge) continue;
        const dx = p.x - x, dy = p.y - y, dz = p.z - z;
        const d = Math.hypot(dx, dy, dz);
        if (d > R || d < 1e-3) continue;
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

  const ROCK_G = 98, ROCK_VK = Math.sqrt(98 / 160);
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
              r.life = r.t + (r.restLife || rand(40, 60));
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
  // HỒ SƠ VỤ NỔ THEO LOẠI ĐẠN
  // ===========================================================================
  const PROFILES = {
    NORMAL: { kind: 'blast', size: 1.65, fire: 1.6, dirt: 1.6, crater: 17, depth: 0.75, sparks: 1.4, linger: 0.4 },
    HE: { kind: 'blast', size: 2.5, fire: 2.4, dirt: 2.4, crater: 26, depth: 1.3, sparks: 2.0, linger: 1.6 },
    AP: { kind: 'kinetic', size: 0.85, fire: 0, dirt: 1.4, crater: 0, sparks: 2.0, linger: 0 },
    CLUSTER: { kind: 'blast', size: 1.8, fire: 1.7, dirt: 1.6, crater: 18, depth: 0.85, sparks: 1.4, linger: 0.5 },
    CLUSTER_SUBMUNITION: { kind: 'bomblet', size: 0.65, fire: 1.0, dirt: 0.8, crater: 6.5, depth: 0.4, sparks: 1.3, linger: 0 },
    RPG: { kind: 'heat', size: 1.1, fire: 1.3, dirt: 0.7, crater: 8, depth: 0.6, sparks: 1.8, linger: 0.6 },
    // đầu nổ lõm kép ~4-5 kg thuốc nổ (RPG-7 ~0,7 kg): chớp & khói lớn hơn hẳn RPG, hố nông (luồng phụt dồn về một điểm)
    ANTI_TANK_MISSILE: { kind: 'heat', size: 1.9, fire: 1.8, dirt: 1.0, crater: 10, depth: 0.65, sparks: 2.4, linger: 0.5 },
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
  // bán kính quy chuẩn của (px, pz) trong elip h (1 = đúng mép)
  const holeQ = (h, px, pz) => {
    let dx = px - h.x, dz = pz - h.z;
    if (h.ratio && h.ratio < 0.995) { const c = Math.cos(h.ang), sn = Math.sin(h.ang), a = dx * c + dz * sn; dz = (-dx * sn + dz * c) / h.ratio; dx = a; }
    return Math.sqrt(dx * dx + dz * dz) / h.r;
  };
  // (px, pz) nằm trong lỗ khoét elip h { x, z, r, ratio, ang }
  const inHoleEll = (h, px, pz) => {
    let dx = px - h.x, dz = pz - h.z;
    if (h.ratio && h.ratio < 0.995) { const c = Math.cos(h.ang), sn = Math.sin(h.ang), a = dx * c + dz * sn; dz = (-dx * sn + dz * c) / h.ratio; dx = a; }
    return dx * dx + dz * dz < h.r * h.r;
  };
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
      if (kind === 'burnGlow') {
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
      const m = new THREE.Mesh(this._markGeo, mat);
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
      parent.add(m);
      const rec = { mesh: m, mat, unit: opts.unit || null, t: 0, glow: (kind === 'penetration' || kind === 'turretRing') ? 2.2 : 0 };
      if (kind === 'turretRing') rec.decay = 6;   // thép quanh vòng tháp nguội dần (đỏ rực vài giây rồi sẫm lại)
      this.surfaceMarks.push(rec);
      while (this.surfaceMarks.length > 550) this.removeSurfaceMark(0);
      return rec;
    },

    removeSurfaceMark(i) {
      const r = this.surfaceMarks[i];
      if (r.mesh.parent) r.mesh.parent.remove(r.mesh);
      r.mat.dispose();
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
            size: rand(1, 2.2), grow: -1, drag: 0.8, grav: 120, life: rand(0.25, 0.6), alpha: 1, fadeIn: 0.005,
            c0: [1, 0.9, 0.6], c1: [1, 0.5, 0.15], cell: 3
          });
        }
        // Vết đạn sượt: đạn nhỏ để lại vệt cào lõm ngắn sáng thép; đạn lớn cày rãnh dài hơn
        if (hit.object && isWall) {
          // Bê tông không có vệt cày kim loại: đạn sượt chỉ bóc một mảng sứt nông, hơi thuôn theo hướng đạn
          this.addSurfaceMark(p, n, hit.object, 'concreteHole', (prof.micro ? (ammoType === 'SCOUT_BULLET' ? 1.8 : 2.4) : 3.6), { tangent: d, stretch: 1.25, keepWidth: true });
        } else if (hit.object) {
          if (prof.micro) this.addSurfaceMark(p, n, hit.object, 'bulletDent', ammoType === 'SCOUT_BULLET' ? 1.4 : 2.0, { tangent: d, stretch: 1.9, unit: hit.unit });
          else this.addSurfaceMark(p, n, hit.object, 'ricochet', 4.2, { tangent: d, stretch: 2.2, unit: hit.unit });
        }
        return { ricochet: true };
      }

      // Nổ / xuyên tại đúng điểm chạm (hiệu ứng bật ra theo pháp tuyến bề mặt)
      this.spawn(p.x, p.y, p.z, ammoType, hit.hitType, Object.assign({}, opts, { dir: { x: d.x, y: d.y, z: d.z }, normal: n, noWallMark: !!(isWall && hit.object) }));
      if (hit.object && isVehicle) {
        if (prof.kind === 'kinetic' || prof.kind === 'heat') {
          this.addSurfaceMark(p, n, hit.object, 'penetration', prof.kind === 'kinetic' ? 3.0 : 3.8, { unit: hit.unit });
          this.addSurfaceMark(p, n, hit.object, 'armorCrater', prof.kind === 'kinetic' ? 3.8 : 4.6, { unit: hit.unit });
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
          } else if (armorCls === 'heavy' || (armorCls === 'medium' && ammoType === 'SCOUT_BULLET')) {
            // Giáp dày: đạn vỡ vụn trên bề mặt -> vết lõm tróc sơn, không thủng
            this.addSurfaceMark(p, n, hit.object, 'bulletDent', ammoType === 'SCOUT_BULLET' ? 1.5 : 2.2, { unit: hit.unit });
          } else {
            // Giáp nhẹ / thân xe tải: thủng lỗ (30mm khoét to hơn 12.7mm)
            const holeSz = ammoType === 'SCOUT_BULLET' ? 1.8 : (armorCls === 'medium' ? 2.2 : 2.8);
            this.addSurfaceMark(p, n, hit.object, 'metalHole', holeSz, { unit: hit.unit });
          }
        } else {
          // Đạn pháo nổ thường / HE / Đạn chùm: Hố lõm giáp thép biến dạng 3D chân thực, vừa vặn khung giáp xe (3.8 - 4.8 đơn vị)
          const craterSz = (prof.size || 1) * (opts.heavy ? 4.8 : 3.8);
          this.addSurfaceMark(p, n, hit.object, 'armorCrater', craterSz, { unit: hit.unit });
          if (hit.unit) this.addFragmentPocks({ point: p, normal: n }, hit.unit, 6, 2.0 * (prof.size || 1));
        }
        if (hit.unit) this.trackVehicle(hit.unit);
      } else if (hit.object && isWall) {
        if (prof.micro) this.addSurfaceMark(p, n, hit.object, 'concreteHole', ammoType === 'SCOUT_BULLET' ? 2.8 : 3.8);
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
      const fresh = !!(L && (src === 'DIRECT_HIT' || src === 'SHELL' || (src !== 'BURN' && src !== 'ZONE' && (!L.at || Date.now() - L.at < 8000))));
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
        if (mode === 'ammo') { K.instant = 'det'; K.tossP = 0.6; }
        else if (mode === 'blast') { if (R < 0.55) { K.instant = 'det'; K.tossP = 0.6; } else if (R < 0.85) later('det', 2, 6, 0.4); }
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
      this.spawnDust(ring.x, this.groundAt(ring.x, ring.z), ring.z, fb, PROFILES.HE, this.palette('GROUND'), false);
      this.launchFrags(W, ring, { ALL_ROUNDER: 12, ARTILLERY: 14, GATLING: 9, SCOUT: 6 }[type] || 10, 1, false);
      W.torch = { ph: Math.random() * 10, t0: W.t, dur: { ALL_ROUNDER: rand(2.5, 4), ARTILLERY: rand(3.5, 5), GATLING: rand(1.5, 2.5), SCOUT: rand(1, 1.8) }[type] || 2, scale: { ALL_ROUNDER: 1, ARTILLERY: 1.15, GATLING: 0.75, SCOUT: 0.55 }[type] || 1 };
      W.char = Math.max(W.char || 0, 0.5); W.charT = Math.min(W.charT || 5, 6); W.charMax = 1;
      this.applyChar(u);
      // Tháp pháo bị hất văng theo hướng đạn nổ và quán tính (pháo tự hành nặng hơn nên bay thấp & gần hơn,
      // xe trinh sát chỉ bật trạm vũ khí nhẹ). Nổ trễ: khí nổ đẩy thẳng lên, hướng đạn ít còn ý nghĩa
      const tossK = { ARTILLERY: 1.2, SCOUT: 0.3 }[type] || 1;
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
        // cột lửa liền từ miệng tấm xả áp: hạt sinh dọc thân cột (không chỉ ở đáy) để không đứt quãng, đỉnh ~7-9 m
        const n = Math.round(4 + 5 * k);
        for (let j = 0; j < n; j++) {
          const h = Math.pow(Math.random(), 1.4) * 55 * k;
          this.fire.add({
            x: p.x + rand(-1, 1) * (1 + h / 30), y: p.y + h, z: p.z + rand(-1, 1) * (1 + h / 30), vx: rand(-5, 5), vy: rand(70, 120) * (0.5 + 0.5 * k), vz: rand(-5, 5),
            size: rand(3.5, 5.5) * (0.6 + 0.4 * k) * (1 + h / 60), grow: 5, drag: 2, grav: -4, life: rand(0.14, 0.28), alpha: 1, fadeIn: 0.015,
            c0: [1, 0.78, 0.4], c1: [0.95, 0.32, 0.05], cell: 1, floor: false
          });
        }
        if (Math.random() < 0.5) {
          const g = rand(0.06, 0.12);
          this.smoke.add({
            x: p.x + rand(-2, 2), y: p.y + 50 * k + 6, z: p.z + rand(-2, 2), vx: rand(-4, 4), vy: rand(30, 45) * k + 12, vz: rand(-4, 4),
            size: rand(6, 9), grow: 8, drag: 0.7, grav: -4, life: rand(3, 5), alpha: 0.65, fadeIn: 0.15,
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
          this.streaks.add({ x: P.x, y: P.y, z: P.z, vx: (N.x + rand(-0.6, 0.6)) * sp, vy: (N.y + rand(0.1, 0.9)) * sp, vz: (N.z + rand(-0.6, 0.6)) * sp, drag: 1.4, grav: 120, life: rand(0.18, 0.4), tail: rand(0.025, 0.045) });
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

      // Vận tốc ngang mạnh mẽ từ 22 đến 42 m/s để tháp pháo bay xa khỏi thân xe
      const latSpeed = rand(22, 42) * tossK;
      const worldVx = blastDirX * latSpeed + (Math.random() - 0.5) * 8;
      const worldVy = rand(55, 85) * (0.75 + 0.25 * tossK); // Tung lên cao 20 - 45m
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
        const pt = ring.clone();
        pt.y -= 0.1;
        this.addSurfaceMark(pt, new THREE.Vector3(0, 1, 0), hull, 'turretRing', { GATLING: 20, ARTILLERY: 19, SCOUT: 6 }[type] || 22, { unit: u });
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
                  this.streaks.add({ x: ring.x + jx, y: ring.y + 2, z: ring.z + jz, vx: Math.cos(a) * sp * 0.6, vy: rand(40, 140), vz: Math.sin(a) * sp * 0.6, drag: 1.4, grav: 120, life: rand(0.25, 0.5), tail: rand(0.03, 0.05) });
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
          // Mất áp thủy lực: nòng gục dần xuống (tháp còn trên xe)
          const droop = { ALL_ROUNDER: -0.05, GATLING: -0.05 }[type];
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
  // SÓNG XUNG KÍCH: vỏ cầu khí nén giãn nở cực nhanh (sáng ở viền, trong suốt ở giữa)
  // ---------------------------------------------------------------------------
  class ShockLayer {
    constructor(scene) {
      this.scene = scene;
      this.items = [];
      this.geo = new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.55);
      this.ringGeo = new THREE.RingGeometry(0.86, 1, 48);
      this.ringGeo.rotateX(-Math.PI / 2);
    }
    mat() {
      return new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
        uniforms: { op: { value: 1 }, tint: { value: new THREE.Color(0.86, 0.84, 0.8) } },
        vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
        fragmentShader: 'uniform float op; uniform vec3 tint; varying vec3 vN; varying vec3 vV; void main(){ float f = 1.0 - abs(dot(vN, vV)); f = pow(f, 4.0); gl_FragColor = vec4(tint, f * op * 0.22); }'
      });
    }
    add(x, y, z, R, dur) {
      const m = new THREE.Mesh(this.geo, this.mat());
      m.position.set(x, y, z);
      m.renderOrder = 7;
      this.scene.add(m);
      const rm = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: 0xf2e8d8, transparent: true, opacity: 0.35, depthWrite: false }));
      rm.position.set(x, y + 0.4, z);
      rm.renderOrder = 7;
      this.scene.add(rm);
      this.items.push({ m, rm, t: 0, R, dur });
    }
    update(dt) {
      for (let i = this.items.length - 1; i >= 0; i--) {
        const it = this.items[i];
        it.t += dt;
        const p = it.t / it.dur;
        if (p >= 1) {
          this.scene.remove(it.m); this.scene.remove(it.rm);
          it.m.material.dispose(); it.rm.material.dispose();
          this.items.splice(i, 1);
          continue;
        }
        // Giãn nở nhanh rồi chậm dần (sóng nổ suy giảm theo khoảng cách)
        const r = it.R * (1 - Math.pow(1 - p, 2.2));
        it.m.scale.setScalar(Math.max(0.1, r));
        it.m.material.uniforms.op.value = (1 - p) * (1 - p);
        it.m.visible = p < 0.6;
        it.rm.scale.setScalar(Math.max(0.1, r * 1.02));
        it.rm.material.opacity = 0.14 * (1 - p);
      }
    }
    clear() { for (const it of this.items) { this.scene.remove(it.m); this.scene.remove(it.rm); } this.items.length = 0; }
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
      this.fire = new ParticleLayer(scene, 1400, true);
      this.rocks = new RockLayer(scene, 360, 0x7d6a52);       // đất đá (màu theo bản đồ)
      this.hardRocks = new RockLayer(scene, 200, 0x6e6c68);   // bê tông / mảnh kim loại
      this.streaks = new StreakLayer(scene, 900);              // vệt mảnh thép nóng bay
      this.shocks = new ShockLayer(scene);                     // vỏ sóng xung kích
      this.ripples = [];                                       // gợn sóng mặt nước
      this.sabots = [];
      this.groundHoles = new HoleLayer(scene, 500, 'ground');
      this.wallHoles = new HoleLayer(scene, 300, 'wall');
      this.craters = [];
      this.wallMarks = [];
      this.emitters = [];
      this.lights = [];
      this.maxCraters = 48;
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
    surfacePalette(x, z, hitType) {
      const base = this.palette(hitType);
      const t = this.terrainOf();
      const mk = (o) => Object.assign({ dustK: 1, smokeK: 0.55, linger: 1, fire: 1, wet: false }, o);
      if (!t || hitType !== 'GROUND') return mk(base);
      const sc = (c, k) => [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)];
      const SS = t.strongholdSet;
      if (SS && SS.surfaceInfo && SS.surfaceInfo(x, z)) return mk(Object.assign({}, CONCRETE, { dustK: 0.9, smokeK: 0.6, fire: 0.05 }));
      const road = t.map && t.map.roadAt ? t.map.roadAt(x, z) : null;
      if (road && road.kind === 'asphalt') {
        return mk({ soil: [0.2, 0.2, 0.21], dark: [0.07, 0.07, 0.075], dust: [0.52, 0.51, 0.49], rock: [0.17, 0.17, 0.18], dustK: 0.7, smokeK: 0.45, fire: 0.08 });
      }
      const hasWater = !!(t.map && (t.map.river || (t.map.lakes && t.map.lakes.length)));
      if (hasWater && t.groundAtRaw && t.groundAtRaw(x, z) < 2.6) {
        // bãi bùn sát mép nước: bùn ướt sẫm văng thành cục, gần như không có mây bụi, không bén lửa
        return mk({ soil: sc(base.soil, 0.62), dark: sc(base.dark, 0.7), dust: sc(base.dust, 0.72), rock: sc(base.rock, 0.8), dustK: 0.35, smokeK: 0.4, linger: 0.4, fire: 0.03, wet: true });
      }
      const G = (px, pz) => t.getElevationAt(px, pz), e = 6;
      const slope = Math.hypot(G(x + e, z) - G(x - e, z), G(x, z + e) - G(x, z - e)) / (2 * e);
      if (slope > 0.45) {
        // sườn đá: đá vụn & bụi đá xám, ít đất
        return mk({ soil: sc(base.rock, 0.82), dark: sc(base.rock, 0.42), dust: sc(base.rock, 1.35), rock: base.rock, dustK: 0.8, smokeK: 0.5, fire: 0.08 });
      }
      if (road) return mk({ soil: sc(base.soil, 1.12), dark: sc(base.dark, 1.25), dust: sc(base.dust, 1.05), rock: base.rock, dustK: 1.25, smokeK: 0.65, fire: 0.2 });
      switch (t.mapType) {
        case 'DESERT':   // cát khô: cột cát vàng (không đen), mây bụi lớn bay lâu
          return mk({ soil: [0.62, 0.5, 0.35], dark: [0.42, 0.33, 0.22], dust: [0.78, 0.68, 0.52], rock: base.rock, dustK: 1.45, smokeK: 0.75, linger: 1.5, fire: 0.12 });
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
        this.spawnAirburst(x, y, z, s);
        return;
      }
      if (prof.kind === 'kinetic') {
        this.spawnKineticImpact(x, py, z, ground, s, prof, pal, dx, dz, isWall || isVehicle, nx, nz, isVehicle, dirVec);
        // đạn xuyên động năng găm đất: rãnh cày dài nông theo hướng bay (hệ hố cộng dồn, không thuốc nổ -> không muội)
        if (!isWall && !isVehicle && !opts.noCrater) this.addCrater(x, z, 4, pal, 0.6, dirVec, 'AP', opts);
        if (isWall && wallInfo && !precise && !envMarks) this.addWallMark(x, y, z, wallInfo, 7);
        return;
      }
      if (prof.kind === 'heat') this.spawnHeatJet(x, py, z, s, dx, dz, nx, nz);
      if (prof.kind === 'incendiary') this.spawnIncendiarySplash(x, py, z, s);

      this.spawnFlash(x, py + 3 * s, z, s * (opts.flashK || 1), prof);
      // Đạn nổ phá chạm đất / tường: thuốc nổ cháy hết trong vài phần trăm giây -> chỉ chớp lửa ngắn, nhỏ; cái thấy rõ là cột
      // đất đá & mây bụi. Quả cầu lửa lớn chỉ khi trúng xe (nhiên liệu, đạn dược) hoặc đạn cháy / tên lửa
      const groundBurst = !isVehicle && prof.kind === 'blast';
      if (prof.fire > 0.1 && prof.kind !== 'heat') this.spawnFireball(x, py, z, s, prof, nx, nz, dirVec, groundBurst);
      if (!isVehicle) this.spawnEjecta(x, py, z, s, prof, pal, isWall, nx, nz, dirVec);
      if (!isVehicle && !isWall && !prof.micro && (prof.kind === 'blast' || prof.kind === 'bomblet')) this.spawnSoilJets(x, py, z, s, prof, pal, dirVec);
      this.spawnDust(x, ground, z, s, prof, pal, isWall, dirVec);
      this.spawnSmokeColumn(x, py, z, s, prof, isVehicle || prof.kind === 'heat', pal);
      this.spawnSparks(x, py, z, s, prof, isVehicle || isWall || prof.kind === 'bomblet', nx, nz);

      // Hiệu ứng mảnh văng của vỏ đạn kim loại (cho đạn pháo, HE, CLUSTER, HEAT, v.v.)
      if (!prof.micro && prof.kind !== 'kinetic') {
        this.spawnShrapnel(x, py, z, s, prof, opts, dirVec, isWall, isVehicle);
        // Sóng xung kích: vỏ khí nén giãn nở + vòng bụi bị thổi bạt sát mặt đất
        if (prof.kind === 'blast' || prof.kind === 'bomblet' || prof.kind === 'heat') {
          const R = (prof.kind === 'bomblet' ? 22 : prof.kind === 'heat' ? 26 : 36) * s * (opts.heavy ? 1.5 : 1);
          this.shocks.add(x, py, z, R, 0.16 + 0.03 * s);
          this.smoke.blastPush(x, py, z, R * 2.2);
          const gyS = this.groundAt(x, z);
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
        else if (!isWall && !isVehicle && !opts.noHoles) {
          // vết đạn trên đất theo loại đạn (12.7mm lỗ nhỏ, 30mm nổ-mảnh cháy sém hình sao, đạn cháy loang) — cộng dồn theo ô
          if (!(tEnv && tEnv.envDamage && tEnv.envDamage.groundHit(x, z, ammoType, dirVec))) this.groundHoles.add(x, ground + 0.3, z, 0, 1, 0, hs * 1.6);
        }
        if (!isWall && !isVehicle) this.spawnBulletSpray(x, ground, z, dx, dz, pal, ammoType === 'SCOUT_BULLET' ? 0.7 : 1);
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
      const nn = gb ? Math.round(n * 0.5) : n, spr = gb ? 7 : 4;
      for (let i = 0; i < nn; i++) {
        // Màu khói tro xám ấm (TNT/RDX pháo binh) thay vì đen kịt như bóng cao su
        const g = rand(0.28, 0.42);
        const tk = tintK * rand(0.75, 1.1);
        this.smoke.add({
          x: x + rand(-spr, spr) * s, y: y + rand(3, 11) * s, z: z + rand(-spr, spr) * s,
          vx: rand(-6, 6) * Math.sqrt(s), vy: rand(gb ? 10 : 15, gb ? 48 : 36) * Math.sqrt(s), vz: rand(-6, 6) * Math.sqrt(s),
          size: rand(6.5, 12) * s, grow: 11 * s, drag: 0.85, grav: -4.5,
          life: rand(4.5, 7.5) * (prof.micro ? 0.4 : 1), alpha: gb ? 0.42 : 0.52, fadeIn: 0.25,
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
          size: rand(1.2, 2.8), grow: -1.5, drag: 0.9, grav: 140,
          life: rand(0.35, 0.9), alpha: 1, fadeIn: 0.01, c0: [1, 0.85, 0.5], c1: [1, 0.45, 0.15], cell: 3
        });
      }
    }

    // --- Đạn chùm nổ THẤP SÁT MẶT ĐẤT: chớp + cụm khói thuốc nổ xám đen, sóng nổ thổi vòng bụi bên dưới,
    //     mảnh văng găm xuống đất thành loạt cột bụi nhỏ + vết lỗ (bom con nổ dồn dập sau đó) ---
    spawnAirburst(x, y, z, s) {
      const ground = this.groundAt(x, z);
      const h = Math.max(8, y - ground);
      const pal = this.palette('GROUND');
      this.fire.add({ x, y, z, vx: 0, vy: 0, vz: 0, size: 60 * s, grow: 80 * s, life: 0.09, alpha: 1, fadeIn: 0.004, c0: [1, 0.96, 0.85], cell: 3, floor: false });
      this.fire.add({ x, y, z, vx: 0, vy: 0, vz: 0, size: 34 * s, grow: 50 * s, life: 0.22, alpha: 0.9, fadeIn: 0.005, c0: [1, 0.72, 0.38], c1: [0.6, 0.25, 0.08], cell: 1, floor: false });
      // Sóng nổ chạm đất: vòng bụi quét rộng ngay bên dưới
      const shockDelay = h / 420;
      for (let i = 0; i < 22; i++) {
        const a = (i / 22) * Math.PI * 2 + rand(-0.15, 0.15);
        const sp = rand(95, 150) * s;
        this.smoke.add({
          x, y: ground + 1.5, z, vx: Math.cos(a) * sp, vy: rand(1, 4), vz: Math.sin(a) * sp,
          size: rand(6, 9) * s, grow: 22 * s, drag: 2.8, life: rand(1.1, 1.6), alpha: 0.45, c0: pal.dust, cell: 2, delay: shockDelay
        });
      }
      // Mảnh văng găm xuống đất: loạt cột bụi nhỏ + lỗ trên diện rộng
      const radius = 30 + h * 1.6;
      for (let i = 0; i < 36; i++) {
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * radius;
        const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
        const gy = this.groundAt(px, pz);
        const delay = Math.hypot(r, h) / 650;
        this.smoke.add({
          x: px, y: gy + 1, z: pz, vx: rand(-4, 4), vy: rand(10, 26), vz: rand(-4, 4),
          size: rand(2.5, 4.5), grow: 7, drag: 1.6, grav: 18, life: rand(0.9, 1.6), alpha: 0.6, fadeIn: 0.02,
          c0: mix(pal.dust, 0.85), cell: 0, delay
        });
        if (Math.random() < 0.3) {
          this.fire.add({ x: px, y: gy + 1, z: pz, vx: 0, vy: 0, vz: 0, size: 4, grow: 10, life: 0.05, alpha: 1, c0: [1, 0.85, 0.5], cell: 3, delay, floor: false });
        }
        if (Math.random() < 0.6) this.groundHoles.add(px, gy + 0.3, pz, 0, 1, 0, rand(1.6, 2.8));
      }
      // Cụm khói thuốc nổ xám đen lơ lửng tại điểm nổ
      for (let i = 0; i < 14; i++) {
        const a = Math.random() * Math.PI * 2, e = rand(-0.6, 0.8), sp = rand(18, 55) * s;
        const g = rand(0.22, 0.36);
        this.smoke.add({
          x, y, z, vx: Math.cos(a) * Math.cos(e) * sp, vy: Math.sin(e) * sp, vz: Math.sin(a) * Math.cos(e) * sp,
          size: rand(10, 18) * s, grow: 12 * s, drag: 2.2, grav: -1,
          life: rand(3.5, 6), alpha: 0.55, fadeIn: 0.05, c0: [g, g, g * 0.97], cell: Math.random() < 0.5 ? 0 : 2, floor: false
        });
      }
      for (let i = 0; i < 26; i++) {
        const a = Math.random() * Math.PI * 2, sp = rand(80, 200);
        this.fire.add({
          x, y, z, vx: Math.cos(a) * sp * 0.7, vy: -rand(40, 160), vz: Math.sin(a) * sp * 0.7,
          size: rand(1.4, 2.6), grow: -1, drag: 0.6, grav: 120, life: rand(0.4, 0.9), alpha: 1, fadeIn: 0.01,
          c0: [1, 0.85, 0.5], c1: [1, 0.4, 0.12], cell: 3
        });
      }
      this.addLight(x, y, z, 1.3 * s, 0.25);
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
          this.fire.add({ x, y, z, vx: nx * sp + rand(-25, 25), vy: rand(10, 50), vz: nz * sp + rand(-25, 25), size: rand(0.9, 1.6), grow: -0.5, drag: 1.2, grav: 120, life: rand(0.25, 0.5), alpha: 1, fadeIn: 0.004, c0: [1, 0.9, 0.6], c1: [1, 0.45, 0.1], cell: 3 });
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
          size: rand(2.5, 4.5), grow: -0.5, drag: 0.8, grav: 110, life: rand(0.8, 1.6), alpha: 1, fadeIn: 0.01,
          c0: [1, 0.8, 0.4], c1: [1, 0.35, 0.08], cell: 1
        });
      }
    }

    // Đạn nhỏ găm đất: tia đất tóe theo hướng bay
    spawnBulletSpray(x, ground, z, dx, dz, pal, k) {
      for (let i = 0; i < 5; i++) {
        const spread = rand(-0.5, 0.5);
        const cx = dx * Math.cos(spread) - dz * Math.sin(spread);
        const cz = dx * Math.sin(spread) + dz * Math.cos(spread);
        const sp = rand(30, 80) * k;
        this.smoke.add({
          x, y: ground + 1, z, vx: cx * sp, vy: rand(18, 45) * k, vz: cz * sp,
          size: rand(1.6, 3) * k, grow: 4, drag: 1.4, grav: 70, life: rand(0.5, 0.9), alpha: 0.85, fadeIn: 0.01,
          c0: mix(pal.dark, 1.6), c1: mix(pal.soil, 1), cell: 0
        });
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
      this.craters.push({ group, mats, geos, t: 0, life: rand(85, 115) });
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
        this.streaks.add({ x: p.x, y: p.y, z: p.z, vx: dd.x * sp, vy: dd.y * sp, vz: dd.z * sp, drag: 1.1, grav: 90, life: rand(0.25, 0.6), tail: rand(0.03, 0.06) });
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
      const k = micro ? 0.12 : (prof.size || 1) * (heavy ? 1.7 : 1) / 1.65;
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
      if (!micro) { this.shocks.add(x, y, z, 30 * k, 0.25); this.smoke.blastPush(x, y, z, 50 * k); }
      this.addWaterWaves(x, y, z, k, micro, shallow);
      if (this.onSound) this.onSound({ x, y, z }, 'GROUND', micro ? ammoType : 'CLUSTER_SUBMUNITION');
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
    spawnShrapnel(x, y, z, s, prof, opts, dirVec, isWall, isVehicle) {
      const isHeavy = !!(opts.heavy || prof.kind === 'he');
      const ground = this.groundAt(x, z);
      const pal = this.palette(isWall ? 'WALL' : 'GROUND');

      // 1. Mảnh thép nóng đỏ rực rỡ xé gió siêu thanh (Incandescent shrapnel tracers)
      const tracerCount = Math.round((isHeavy ? 36 : 22) * Math.pow(s, 0.7));
      for (let i = 0; i < tracerCount; i++) {
        const a = Math.random() * Math.PI * 2;
        const elev = rand(0.08, 0.85); // góc văng từ sát mặt đất tới 50 độ
        const sp = rand(160, 360) * Math.sqrt(s);
        const cosE = Math.cos(elev);
        const vx = Math.cos(a) * cosE * sp;
        const vy = Math.sin(elev) * sp;
        const vz = Math.sin(a) * cosE * sp;

        // Mảnh thép nóng xé gió: vệt sáng kéo dài theo vận tốc, cắm xuống đất tung bụi
        this.streaks.add({
          x: x + (Math.random() - 0.5) * 2, y: y + rand(0.5, 2.5), z: z + (Math.random() - 0.5) * 2,
          vx: vx * 1.1, vy: vy * 0.9, vz: vz * 1.1, drag: 1.8, grav: rand(110, 170), life: rand(0.22, 0.5), tail: rand(0.02, 0.04)
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

      // 3. Vết găm đất và cột bụi mảnh văng cắm xuống địa hình xung quanh
      if (!isWall && !isVehicle) {
        const hitZoneRadius = (22 + 20 * s) * (isHeavy ? 1.4 : 1.0);
        const groundHits = Math.round((isHeavy ? 24 : 14) * Math.pow(s, 0.5));
        for (let i = 0; i < groundHits; i++) {
          const a = Math.random() * Math.PI * 2;
          const r = rand(10, hitZoneRadius);
          const px = x + Math.cos(a) * r;
          const pz = z + Math.sin(a) * r;
          const gy = this.groundAt(px, pz);
          const delay = r / (rand(260, 360) * Math.sqrt(s));

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
      const S = Math.max(x1 - x0, z1 - z0), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      const ox = cx - S / 2, oz = cz - S / 2;
      const maxRa = Math.max(...blasts.map(b => b.ra));
      // ô lưới / điểm ảnh texture mỗi cạnh (~1 điểm ảnh / 5-8 cm); hố cỡ lớn dựng một lần (phòng thử) truyền độ phân giải riêng
      const M = opts.gridN || (maxRa > 8 ? 60 : maxRa > 4 || blasts.some(b => b.kind === 'gouge') ? 48 : 36);
      const TS = opts.texSize || (maxRa > 8 ? 160 : maxRa > 4 ? 128 : 96);

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
        if (rho < 1) exc = -b.d * (1 - rho * rho * Math.pow(rho, 0.2));
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
        const rim = rimK * b.rimH * dirB * Math.exp(-Math.pow((rho - 1.02) / (rho < 1.02 ? 0.13 : 0.4), 2));
        const blanket = rho > 1 ? b.rimH * 0.35 * dirE * ray * Math.exp(-(rho - 1) / 1.1) : 0;
        const lump = (tnoise(px * b._ln + b.seed, pz * b._ln) - 0.5) * b.d * 0.22 * Math.exp(-(rho - 1.05) * (rho - 1.05) * 4);
        out.exc = exc;
        out.dep = Math.max(0, rim + blanket + lump + rough);
        out.rho = rho; out.ca = ca;
        out.ej = rho > 0.9 ? dirE * ray * Math.exp(-(rho - 1) / 1.25) * Math.min(1, (rho - 0.9) * 6) : 0;
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
        const px = ox + S * i / M, pz = oz + S * j / M, k = j * N1 + i;
        sample(px, pz, r0);
        Hgrid[k] = r0.H;
        pos[k * 3] = px - cx; pos[k * 3 + 1] = base(px, pz) + r0.H + 0.04; pos[k * 3 + 2] = pz - cz;
        uv[k * 2] = i / M; uv[k * 2 + 1] = 1 - j / M;
      }
      const idx = new Uint16Array(M * M * 6);
      for (let j = 0, q = 0; j < M; j++) for (let i = 0; i < M; i++, q += 6) {
        const a = j * N1 + i, b = a + 1, c = a + N1, d = c + 1;
        idx[q] = a; idx[q + 1] = c; idx[q + 2] = b; idx[q + 3] = b; idx[q + 4] = c; idx[q + 5] = d;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.setIndex(new THREE.BufferAttribute(idx, 1));
      geo.computeVertexNormals();

      // Lỗ khoét mặt đất khớp đường mép lòng hố (nơi lòng hố cắt mặt đất, đo trên lưới độ cao): elip xoay theo hướng bay,
      // BAO TRỌN vùng lõm dưới mặt đất. Lỗ nhỏ hơn lòng hố thì mặt đất phẳng che mất phần vách trên -> lộ một vành đất phẳng
      // sáng giữa miệng hố và lòng hố. Phần lỗ khoét lố ra ngoài vùng lõm nằm dưới gờ đất (lưới hố cao hơn mặt đất, tô đặc)
      // nên không lộ gì.
      const Hg = (px, pz) => {
        const gi = Math.max(0, Math.min(M, Math.round((px - ox) / S * M))), gj = Math.max(0, Math.min(M, Math.round((pz - oz) / S * M)));
        return Hgrid[gj * N1 + gi];
      };
      const cellU = S / M;
      const holeE = [];
      for (const b of blasts.slice(-4)) {
        const hx = b.x + b.fx * b.shift, hz = b.z + b.fz * b.shift;
        if (Hg(hx, hz) > -0.3) continue;
        // tia đo từ tâm hố tới chỗ lưới hố nhô lên ngang mặt đất; dừng ở rìa lòng hố CỦA CHÍNH phát này (không chạy sang
        // lòng hố bên cạnh trong cụm — hố đó có lỗ khoét riêng)
        const own = (dx, dz) => {
          const a = dx * b.fx + dz * b.fz, l = -dx * b.fz + dz * b.fx;
          return Math.hypot(a / (b.A * (a > 0 ? 1.12 : 0.88)), l / b.B);
        };
        const NR = 48, la = new Float32Array(NR), ll = new Float32Array(NR);
        let aMin = Infinity, aMax = -Infinity, lMin = Infinity, lMax = -Infinity;
        for (let q = 0; q < NR; q++) {
          const an = q / NR * Math.PI * 2, ca = Math.cos(an), sa = Math.sin(an);
          const ux = b.fx * ca - b.fz * sa, uz = b.fz * ca + b.fx * sa;
          let r = 0;
          for (;;) {
            const rn = r + cellU * 0.25, dx = ux * rn, dz = uz * rn;
            if (own(dx, dz) > 1.35 || Hg(hx + dx, hz + dz) >= -0.03) break;
            r = rn;
          }
          la[q] = ca * r; ll[q] = sa * r;
          aMin = Math.min(aMin, la[q]); aMax = Math.max(aMax, la[q]); lMin = Math.min(lMin, ll[q]); lMax = Math.max(lMax, ll[q]);
        }
        // elip bao: tâm & bán trục theo khung bao vùng lõm (dọc / ngang hướng bay), rồi nới tới khi chứa mọi điểm mép đo được
        const ac = (aMax + aMin) / 2, lc = (lMax + lMin) / 2, a0 = (aMax - aMin) / 2, l0 = (lMax - lMin) / 2;
        if (a0 < cellU || l0 < cellU) continue;
        let k = 1;
        for (let q = 0; q < NR; q++) k = Math.max(k, Math.hypot((la[q] - ac) / a0, (ll[q] - lc) / l0));
        const pad = 1.02, padU = cellU * 0.6;   // bù chỗ lưới nội suy giữa các tia đo
        const ea = a0 * k * pad + padU, eb = l0 * k * pad + padU;
        const big = Math.max(ea, eb), small = Math.min(ea, eb);
        const ang = ea >= eb ? Math.atan2(b.fz, b.fx) : Math.atan2(b.fz, b.fx) + Math.PI / 2;
        const ex = hx + b.fx * ac - b.fz * lc, ez = hz + b.fz * ac + b.fx * lc;
        holeE.push({ x: ex, z: ez, r: big, ratio: small / big, ang, exact: true });
      }
      const holeC = holeE;   // (tên cũ) danh sách lỗ khoét: x, z, r = bán trục lớn, ratio, ang

      // ---- 2. TEXTURE MÀU + ĐỘ TRONG riêng cho cụm hố ----
      const cvs = document.createElement('canvas');
      cvs.width = cvs.height = TS;
      const g2 = cvs.getContext('2d');
      const img = g2.createImageData(TS, TS);
      const sub = [P.soil[0] * 0.7 + P.dark[0] * 0.3, P.soil[1] * 0.7 + P.dark[1] * 0.3, P.soil[2] * 0.7 + P.dark[2] * 0.3];
      const soot = [0.15, 0.13, 0.11];
      const r1 = {};
      // mảng loang (đất vón, muội, tia đất văng thưa) to theo cỡ hố: hố lớn mà giữ cỡ mảng của hố nhỏ thì hoa văn lặp dày đặc
      const nsc = Math.max(1, maxRa / 12);
      // trong lỗ khoét mặt đất: lưới hố phải đặc hoàn toàn (không thì nhìn xuyên qua chỗ đất đã bị khoét)
      // nới thêm vài điểm ảnh: lọc texture (mipmap) làm nhoè độ trong ở sát mép -> lộ nền trời qua chỗ đất đã khoét
      // -> đặc hẳn tới quá mép lỗ vài điểm ảnh, rồi mờ dần (không cắt thành một đường elip cứng)
      const txU = S / TS;
      const holeFill = (px, pz) => {
        let f = 0;
        for (const h of holeE) {
          const q = holeQ(h, px, pz) * h.r;          // khoảng cách quy về trục lớn
          f = Math.max(f, 1 - smooth(h.r + txU * 5 + h.r * 0.03, h.r + txU * 5 + h.r * 0.2, q));
        }
        return f;
      };
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
      // màu ước lượng của mặt đất quanh hố (giữa đất cái & bụi mặt) để chỗ ép đặc không thành quầng sáng / sẫm
      const gnd = [(P.soil[0] + P.dust[0]) * 0.5, (P.soil[1] + P.dust[1]) * 0.5, (P.soil[2] + P.dust[2]) * 0.5];
      for (let j = 0; j < TS; j++) for (let i = 0; i < TS; i++) {
        const px = ox + S * (i + 0.5) / TS, pz = oz + S * (j + 0.5) / TS;
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
        let alpha = r1.inBowl > 0 || r1.fresh ? 1 : clamp01((r1.ej - 0.1 - (cnoise(px * 0.55 / nsc + 3, pz * 0.55 / nsc, 12) - 0.5) * 0.5) * 2.4);
        alpha = Math.max(alpha, clamp01(sk * 1.6) * 0.85);
        const aN = alpha;
        if (alpha < 1) alpha = Math.max(alpha, holeFill(px, pz));
        // gờ / lớp đất văng đắp cao hẳn lên là đất đặc: không để bán trong suốt (nhìn xuyên gờ thấy mặt đất phẳng phía sau,
        // hoặc xuyên xuống lỗ khoét của lòng hố ra nền trời)
        if (alpha < 1 && r1.H > 0.12) alpha = Math.max(alpha, clamp01((r1.H - 0.12) / 0.45));
        // chỗ bị ép đặc mà vốn gần như không có đất văng: ngả về màu bụi mặt đất (không thành mảng đất sẫm có mép)
        if (alpha > aN) { const gp = (alpha - aN) * 0.45; r += (gnd[0] - r) * gp; g += (gnd[1] - g) * gp; b += (gnd[2] - b) * gp; }
        const ex = Math.min(i, j, TS - 1 - i, TS - 1 - j) / (TS * 0.06);
        alpha *= clamp01(ex);
        const q = (j * TS + i) * 4;
        img.data[q] = clamp01(r * v) * 255; img.data[q + 1] = clamp01(g * v) * 255; img.data[q + 2] = clamp01(b * v) * 255;
        img.data[q + 3] = alpha * 255;
      }
      g2.putImageData(img, 0, 0);
      // Vết mảnh văng: đạn nổ phá vỡ vỏ thép bắn mảnh rạch đất thành những vệt mảnh toả ra; với ngòi nổ chạm, phần lớn mảnh
      // bay ngang hai bên hướng bay ("side spray") -> 2 cánh vệt mảnh, hơi chếch về phía pháo bắn (dấu hiệu đoán hướng pháo)
      const toTex = (px, pz) => [(px - ox) / S * TS, (pz - oz) / S * TS];
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
            g2.strokeStyle = `rgba(52,44,36,${(0.08 + rnd(k * 7 + q + 2500) * 0.16) * fade})`;
            g2.lineWidth = Math.max(0.5, (0.15 + rnd(k * 7 + q + 2900) * 0.3) * pxPerU);
            g2.lineCap = 'round';
            g2.beginPath(); g2.moveTo(ax, az); g2.lineTo(bx2, bz2); g2.stroke();
            r += len + b.ra * (0.1 + rnd(k * 7 + q + 3100) * 0.45);
            q++;
          }
          // lỗ mảnh găm cuối vệt
          if (rnd(k + 3300) < 0.45) { const [hx, hz] = toTex(b.x + wx * r, b.z + wz * r); g2.fillStyle = 'rgba(40,32,24,0.35)'; g2.beginPath(); g2.arc(hx, hz, Math.max(0.6, 0.22 * pxPerU), 0, 6.283); g2.fill(); }
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
          g2.fillStyle = `rgba(${rgb(lt ? P.rock : P.dark, lt ? 0.85 : 1.25)},${0.35 + hash2(k, b.seed, 59) * 0.35})`;
          g2.beginPath(); g2.arc(px, pz, Math.max(0.6, sz), 0, 6.283); g2.fill();
        }
      }
      // Vết nứt căng quanh miệng hố: chấn động làm mặt đất nứt thành những đường gãy khúc vòng quanh gờ, vài vết toả ra
      for (const b of blasts) {
        if (!(b.rough > 0) || b.kind === 'gouge') continue;
        const rnd = (k) => hash2(k, b.seed, 83);
        const n = Math.round((4 + b.ra * 0.12) * b.rough);
        g2.lineCap = 'round'; g2.lineJoin = 'round';
        for (let k = 0; k < n; k++) {
          const radial = rnd(k * 9) < 0.3;
          let ang = rnd(k * 9 + 1) * 6.283, rr = (radial ? 1.05 : 1.15 + rnd(k * 9 + 2) * 0.55);
          const len = radial ? 0.25 + rnd(k * 9 + 3) * 0.45 : 0.25 + rnd(k * 9 + 3) * 0.6;   // bán kính / radian
          const steps = 7 + Math.floor(rnd(k * 9 + 4) * 6);
          g2.strokeStyle = `rgba(38,30,22,${0.22 + rnd(k * 9 + 5) * 0.22})`;
          g2.lineWidth = Math.max(0.6, (0.08 + rnd(k * 9 + 6) * 0.12) * pxPerU);
          g2.beginPath();
          for (let q = 0; q <= steps; q++) {
            const jit = (hash2(k * 31 + q, b.seed, 89) - 0.5);
            const a2 = ang + (radial ? jit * 0.06 : len * q / steps + jit * 0.03);
            const r2 = (rr + (radial ? len * q / steps : jit * 0.04)) * b.ra;
            const [tx, tz] = toTex(b.x + Math.cos(a2) * r2, b.z + Math.sin(a2) * r2);
            if (q === 0) g2.moveTo(tx, tz); else g2.lineTo(tx, tz);
          }
          g2.stroke();
        }
      }
      // Texture dạng dữ liệu thô (không nhân sẵn độ trong): canvas lưu màu đã nhân alpha nên điểm ảnh trong suốt mất màu
      // (thành đen) -> lọc / mipmap kéo mép lớp đất văng thành viền tối loang lổ. Giữ màu đất ở cả chỗ trong suốt.
      const data = new Uint8Array(g2.getImageData(0, 0, TS, TS).data);
      const src = img.data;
      // điểm ảnh không bị nét vẽ (vệt mảnh, sỏi) chạm vào: lấy lại màu gốc chính xác (canvas làm tròn màu ở chỗ độ trong
      // thấp -> viền loang lổ quanh mép lớp đất văng)
      for (let q = 0; q < TS * TS * 4; q += 4) if (data[q + 3] === src[q + 3]) { data[q] = src[q]; data[q + 1] = src[q + 1]; data[q + 2] = src[q + 2]; }
      // độ trong gốc (trước khi bị đục chỗ lỗ khoét của hố khác, xem punchCrater)
      const alpha0 = new Uint8Array(TS * TS);
      for (let q = 0; q < TS * TS; q++) alpha0[q] = data[q * 4 + 3];
      const tex = new THREE.DataTexture(data, TS, TS, THREE.RGBAFormat);
      tex.flipY = true;               // hàng 0 = mép z nhỏ, như canvas
      tex.magFilter = THREE.LinearFilter;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.generateMipmaps = true;
      tex.anisotropy = 4;
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.needsUpdate = true;
      const mat = new THREE.MeshStandardMaterial({
        map: tex, roughness: 1.0, metalness: 0, transparent: true, alphaTest: 0.02,
        polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3
      });
      const group = new THREE.Group();
      group.position.set(cx, 0, cz);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);

      // ---- 3. KHOÉT LỖ MẶT ĐẤT để lòng hố lộ ra + hạ lưới độ cao vật lý (xe chạy qua sụt xuống hố) ----
      // Hết chỗ lỗ khoét trong shader: bỏ hẳn hố cũ nhất (mất lỗ mà còn hố -> mặt đất phẳng che lòng hố, xe vẫn sụt hố vô hình)
      while (ExplosionFX.groundHoleCount() + holeC.length > ExplosionFX.MAX_GROUND_HOLES) {
        const oi = this.craters.findIndex(c => !c.persistent && c.holeSlots);
        if (oi < 0) break;
        this.removeDecal(this.craters, oi);
      }
      const holes = holeE.map(h => ExplosionFX.addGroundHole(h.x, h.z, h.r, h.ratio, h.ang, h.exact));
      let def = null;
      if (t && t.heightData && t.segments && !opts.noDeform) {
        const Sg = t.segments, Ng = Sg + 1, cell = t.width / Sg;
        const H0 = this.heightOrig(t);
        const i0 = Math.max(0, Math.floor((x0 + t.width / 2) / cell)), i1 = Math.min(Sg, Math.ceil((x1 + t.width / 2) / cell));
        const j0 = Math.max(0, Math.floor((z0 + t.depth / 2) / cell)), j1 = Math.min(Sg, Math.ceil((z1 + t.depth / 2) / cell));
        const dIdx = [], dVal = [];
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const wx = -t.width / 2 + i * cell, wz = -t.depth / 2 + j * cell;
          const gi = Math.round((wx - ox) / S * M), gj = Math.round((wz - oz) / S * M);
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
        const gi = Math.max(0, Math.min(M, Math.round((px - ox) / S * M))), gj = Math.max(0, Math.min(M, Math.round((pz - oz) / S * M)));
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
        group, mats: [mat, ...clodMats, ...rockMats], geos: [geo], texs: [tex], t: 0,
        life: opts.persistent ? 1e12 : 1e9,          // hố nổ tồn tại suốt trận (cộng dồn), chỉ cũ nhất bị thay khi quá nhiều
        holeSlot: holes[0], holeSlots: holes, persistent: !!opts.persistent, blasts,
        params: { x: blasts[blasts.length - 1].x, z: blasts[blasts.length - 1].z, R: maxRa, effR: maxRa, bowlD: deepest, heavy: blasts.some(b => b.heavy) },
        // mặt hố nhìn thấy (lưới Hgrid + đất nguyên thuỷ) cho craterSurfaceAt; phần lưới vật lý đã hạ (def) để trả lại khi xoá
        surf: { ox, oz, S, M, Hgrid, holeC, base, x0, x1, z0, z1 }, def,
        data, alpha0, TS
      };
      this.craters.push(rec);
      while (this.craters.length > this.maxCraters) {
        const oi = this.craters.findIndex(c => !c.persistent);
        if (oi < 0) break;
        this.removeDecal(this.craters, oi);
      }
      this.repunchAround(rec.surf, null);
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
        const gx = (x - s.ox) / s.S * s.M, gz = (z - s.oz) / s.S * s.M;
        if (gx < 0 || gz < 0 || gx > s.M || gz > s.M) continue;
        const i = Math.min(s.M - 1, Math.floor(gx)), j = Math.min(s.M - 1, Math.floor(gz)), fx = gx - i, fz = gz - j, N1 = s.M + 1;
        const G = s.Hgrid, k = j * N1 + i;
        const H = (G[k] * (1 - fx) + G[k + 1] * fx) * (1 - fz) + (G[k + N1] * (1 - fx) + G[k + N1 + 1] * fx) * fz;
        const y = s.base(x, z) + H + 0.04;
        let inH = false;
        for (const h of s.holeC) {
          let dx = x - h.x, dz = z - h.z;
          if (h.ratio && h.ratio < 0.995) { const c = Math.cos(h.ang), sn = Math.sin(h.ang), a = dx * c + dz * sn; dz = (-dx * sn + dz * c) / h.ratio; dx = a; }
          if (dx * dx + dz * dz < h.r * h.r * (h.exact ? 1 : 0.81)) { inH = true; break; }
        }
        if (inH) bowl = bowl === null ? y : Math.min(bowl, y);
        else if (H > 0.02) rim = rim === null ? y : Math.max(rim, y);
      }
      if (bowl !== null) return bowl;
      if (g === undefined) return rim;
      return rim === null ? g : Math.max(rim, g);
    }
    surfaceAt(x, z) { return this.craterSurfaceAt(x, z, this.groundAt(x, z)); }
    // Báo địa hình: mặt đất trong hình chữ nhật vừa đổi (hố mới / hố bị xoá) -> các hệ vật thể đặt lại độ cao
    groundChanged(x0, z0, x1, z1) {
      const t = this.terrainOf();
      // đá vụn / cục đất đã nằm yên trong vùng: rơi xuống lòng hố mới (hoặc nổi lên khi hố bị lấp)
      this.rocks.reground(x0, z0, x1, z1, this._surfFn);
      this.hardRocks.reground(x0, z0, x1, z1, this._surfFn);
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
      this.wallMarks.push({ group: m, mats: [mat], geos: [geo], t: 0, life: rand(100, 140) });
      while (this.wallMarks.length > this.maxWallMarks) this.removeDecal(this.wallMarks, 0);
    }

    // Gỡ mọi vết đạn / vết nứt / lỗ thủng quanh một điểm (phần tường / nhà mang vết đó đã vỡ rơi mất)
    removeMarksNear(x, y, z, r) {
      const p = new THREE.Vector3();
      for (let i = this.wallMarks.length - 1; i >= 0; i--) {
        this.wallMarks[i].group.getWorldPosition(p);
        if (p.distanceToSquared(new THREE.Vector3(x, y, z)) < r * r) this.removeDecal(this.wallMarks, i);
      }
      if (this.wallHoles) this.wallHoles.removeNear(x, y, z, r);
      if (this.surfaceMarks) {
        for (let i = this.surfaceMarks.length - 1; i >= 0; i--) {
          const rec = this.surfaceMarks[i];
          if (rec.unit) continue;
          rec.mesh.getWorldPosition(p);
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
        d._surfGone = s;
        d.surf = null;
        if (!quiet) this.groundChanged(s.x0, s.z0, s.x1, s.z1);
      }
      const ds = d.surf || d._surfGone;
      if (d.texs) d.texs.forEach(tx => tx.dispose());
      this.scene.remove(d.group);
      d.mats.forEach(m => m.dispose());
      d.geos.forEach(g => g.dispose());
      list.splice(i, 1);
      if (ds && list === this.craters && !quiet) this.repunchAround(ds, null);
    }

    // Lớp đất văng gần trong suốt của một hố nằm ngang mặt đất nguyên thuỷ; chỗ nó chồng lên lòng hố KHÁC (đất đã bị khoét)
    // nó vẫn ghi chiều sâu -> che mất lòng hố kia, nhìn xuyên ra trời. Đục trong hẳn texture của hố tại lỗ khoét của các hố
    // khác (hố cố định của phòng thử là một phần mặt đất: không đục các hố khác theo nó, nhưng nó bị đục theo hố mới)
    punchCrater(c) {
      const s = c.surf;
      if (!s || !c.alpha0 || !c.data) return;
      const T = c.TS, holes = [];
      for (const d of this.craters) {
        if (d === c || d.persistent || !d.surf || !d.surf.holeC.length) continue;
        const o = d.surf;
        if (o.x1 < s.x0 || o.x0 > s.x1 || o.z1 < s.z0 || o.z0 > s.z1) continue;
        for (const h of o.holeC) holes.push(h);
      }
      if (!holes.length && !c.punched) return;
      const A = c.data;
      for (let q = 0; q < T * T; q++) A[q * 4 + 3] = c.alpha0[q];
      let n = 0;
      for (const h of holes) {
        const i0 = Math.max(0, Math.floor((h.x - h.r - s.ox) / s.S * T)), i1 = Math.min(T - 1, Math.ceil((h.x + h.r - s.ox) / s.S * T));
        const j0 = Math.max(0, Math.floor((h.z - h.r - s.oz) / s.S * T)), j1 = Math.min(T - 1, Math.ceil((h.z + h.r - s.oz) / s.S * T));
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const px = s.ox + s.S * (i + 0.5) / T, pz = s.oz + s.S * (j + 0.5) / T;
          if (!inHoleEll(h, px, pz)) continue;
          if (!c.persistent && s.holeC.some(o => inHoleEll(o, px, pz))) continue;   // lòng hố của chính nó
          A[(j * T + i) * 4 + 3] = 0; n++;
        }
      }
      c.punched = n > 0;
      if (c.texs && c.texs[0]) c.texs[0].needsUpdate = true;
    }
    // Đục lại mọi hố có vùng chồng lên vùng s (hố mới / hố vừa xoá)
    repunchAround(s, skip) {
      for (const c of this.craters) {
        if (c === skip || !c.surf) continue;
        const o = c.surf;
        if (o.x1 < s.x0 || o.x0 > s.x1 || o.z1 < s.z0 || o.z0 > s.z1) continue;
        this.punchCrater(c);
      }
    }

    // ===========================================================================
    // CẬP NHẬT MỖI KHUNG HÌNH
    // ===========================================================================
    update(dt) {
      if (!(dt > 0)) return;
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
      this.fire.update(dt, this.groundAt);
      this.updateVehicles(dt);
      this.updateSurfaceMarks(dt);
      this.rocks.update(dt, this._surfFn);        // mảnh rơi nằm trên mặt NHÌN THẤY (lòng hố sâu hơn lưới vật lý)
      this.hardRocks.update(dt, this._surfFn);
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
      this.fire.parts.length = 0;
      this.rocks.rocks.length = 0;
      this.hardRocks.rocks.length = 0;
      this.hardRocks.update(0.001, null);
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
      this.wallHoles.clear();
      this.smoke.update(0.001, null);
      this.signal.update(0.001, null);
      this.fire.update(0.001, null);
      this.rocks.update(0.001, null);
    }
  }

  Object.assign(ExplosionFX.prototype, DamageMixin);

  // Dò tia theo đường bay vào mô hình xe để lấy đúng điểm chạm + pháp tuyến bề mặt
  // ---------------------------------------------------------------------------
  // LỖ KHOÉT MẶT ĐẤT CHO HỐ BOM: shader mặt đất bỏ điểm ảnh trong các vòng tròn hố đang tồn tại,
  // để lưới lòng chảo (thấp hơn mặt đất) lộ ra -> hố lõm thật sự thay vì vết vẽ phẳng
  // ---------------------------------------------------------------------------
  const MAX_HOLES = 48;
  const holeList = [];
  const holeU = { value: Array.from({ length: MAX_HOLES }, () => new THREE.Vector4(0, 0, 0, 0)) };
  const holeN = { value: 0 };
  function syncHoles() {
    for (let i = 0; i < MAX_HOLES; i++) {
      const h = holeList[i];
      if (h) holeU.value[i].set(h.x, h.z, h.exact ? -h.r : h.r, h.w || 1); else holeU.value[i].set(0, 0, 0, 0);
    }
    holeN.value = Math.min(MAX_HOLES, holeList.length);
  }
  // Lỗ tròn (ratio = 1) hoặc elip: r = bán trục lớn theo hướng angle, ratio = bán trục nhỏ / lớn. Elip mã hoá vào w:
  // w = 2 + floor(ratio·1000) + phần lẻ (angle / 2π) — w = 1 là lỗ tròn kiểu cũ
  // exact = true: khoét đúng đường viền elip (không co vào, không méo mép) — dùng cho hố đã đo khớp lòng chảo
  ExplosionFX.addGroundHole = function (x, z, r, ratio = 1, angle = 0, exact = false) {
    const h = { x, z, r, exact: !!exact };
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
  ExplosionFX.clearGroundHoles = function () { holeList.length = 0; syncHoles(); };
  ExplosionFX.groundHoleCount = () => holeList.length;
  ExplosionFX.MAX_GROUND_HOLES = MAX_HOLES;
  // Gắn cơ chế khoét lỗ vào vật liệu mặt đất (giữ nguyên onBeforeCompile sẵn có của vật liệu)
  ExplosionFX.installGroundHoles = function (mat) {
    if (!mat || mat.userData.groundHoles) return;
    mat.userData.groundHoles = true;
    const prev = mat.onBeforeCompile;
    const prevKey = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : null;
    mat.onBeforeCompile = (sh, r) => {
      if (prev) prev(sh, r);
      sh.uniforms.groundHoles = holeU;
      sh.uniforms.groundHoleCount = holeN;
      sh.vertexShader = 'varying vec2 vHoleXZ;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n  vHoleXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
      sh.fragmentShader = 'varying vec2 vHoleXZ;\nuniform vec4 groundHoles[' + MAX_HOLES + '];\nuniform int groundHoleCount;\n' + sh.fragmentShader.replace(
        'void main() {',
        `void main() {
          for (int hi = 0; hi < ${MAX_HOLES}; hi++) {
            if (hi >= groundHoleCount) break;
            vec4 gh = groundHoles[hi];
            vec2 dd = vHoleXZ - gh.xy;
            if (gh.w >= 2.0) {
              // lỗ elip (hố dài do đạn bắn xiên / rãnh cày): đưa về toạ độ trục elip rồi giãn trục nhỏ
              float an0 = fract(gh.w) * 6.2831853, rat = max(0.05, (floor(gh.w) - 2.0) / 1000.0);
              vec2 ax = vec2(cos(an0), sin(an0));
              dd = vec2(dot(dd, ax), dot(dd, vec2(-ax.y, ax.x)) / rat);
            }
            float r2 = dot(dd, dd);
            float gr = abs(gh.z);
            if (r2 > gr * gr * 1.05) continue;
            float rr = gr;
            if (gh.z > 0.0) {
              // mép hố lồi lõm tự nhiên (mỗi hố một kiểu theo vị trí), không tròn vành vạnh
              float sd = gh.x * 0.137 + gh.y * 0.071;
              float an = atan(dd.y, dd.x);
              rr = gr * (0.9 + 0.06 * sin(an * 5.0 + sd) + 0.04 * sin(an * 11.0 + sd * 2.3) + 0.02 * sin(an * 23.0 - sd));
            }
            if (r2 < rr * rr) discard;
          }`);
    };
    mat.customProgramCacheKey = () => (prevKey ? prevKey() : '') + '|holes';
    mat.needsUpdate = true;
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
