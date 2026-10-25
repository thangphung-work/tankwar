/**
 * Bộ Công Cụ Dựng Hình Xe Thiết Giáp Chân Thực (Vehicle Kit)
 * Dùng chung cho mọi file model xe trong thư mục src/entities/tanks/
 *
 * - Texture sơn ngụy trang sinh thủ tục bằng noise tuần hoàn (tileable), có lớp bẩn, bụi, hạt sơn
 * - PartBatch: gom hàng trăm chi tiết nhỏ thành 1 mesh / 1 vật liệu để giảm draw call
 * - loft / sideProfile: dựng khối giáp vát đa diện từ mặt cắt (tháp pháo, thân xe, giáp nêm)
 * - TrackSystem: dải xích từng mắt xích thật (InstancedMesh) chạy vòng quanh bánh, có animation
 * - WheelSet: cụm bánh chịu tải / bánh dẫn hướng / bánh sao xoay đúng vận tốc dài
 *
 * Quy ước tọa độ: Y hướng lên, mũi xe hướng -Z, mặt đất tại y = 0 trong chassisGroup.
 */

const VehicleKit = (() => {
  const TEX_CACHE = {};
  const UV_SCALE = 1 / 30; // 1 ô texture sơn phủ 30 đơn vị (~3.7 mét): mảng ngụy trang cỡ 0.6-1.5 m như sơn thật

  // ---------------------------------------------------------------------------
  // NOISE TUẦN HOÀN (TILEABLE) CHO TEXTURE
  // ---------------------------------------------------------------------------
  function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function periodicNoise(period, seed) {
    const rnd = mulberry32(seed);
    const grid = new Float32Array(period * period);
    for (let i = 0; i < grid.length; i++) grid[i] = rnd();
    return (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y);
      const xf = x - xi, yf = y - yi;
      const x0 = ((xi % period) + period) % period, x1 = (x0 + 1) % period;
      const y0 = ((yi % period) + period) % period, y1 = (y0 + 1) % period;
      const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      const a = grid[y0 * period + x0], b = grid[y0 * period + x1];
      const c = grid[y1 * period + x0], d = grid[y1 * period + x1];
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    };
  }

  // fBm tuần hoàn: nx, ny trong [0, 1)
  function makeFbm(basePeriod, octaves, seed) {
    const layers = [];
    for (let o = 0; o < octaves; o++) {
      const p = basePeriod << o;
      layers.push({ p, fn: periodicNoise(p, seed + o * 101) });
    }
    return (nx, ny) => {
      let sum = 0, amp = 0.5, norm = 0;
      for (const l of layers) {
        sum += l.fn(nx * l.p, ny * l.p) * amp;
        norm += amp;
        amp *= 0.5;
      }
      return sum / norm;
    };
  }

  function hexToRgb(hex) {
    return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
  }

  // ---------------------------------------------------------------------------
  // SƠN NGỤY TRANG QUÂN SỰ (map + roughnessMap + bumpMap)
  // ---------------------------------------------------------------------------
  // Màu sơn đo theo mẫu sơn mờ quân sự thật: xanh ô-liu ngả xám, nâu đất, đen than (rừng);
  // cát CARC, nâu sô-cô-la, ô-liu khô (sa mạc). Màu thật khá tối & ít bão hòa -> dưới nắng
  // không bị xanh lá mạ / cam như đồ chơi. dust: màu bụi đất bám gầm & mặt ngang (shader sơn).
  const PAINT_SCHEMES = {
    WOODLAND: {
      base: 0x3d4531,
      patchA: { color: 0x503c2a, threshold: 0.55 },
      patchB: { color: 0x1c1d1a, threshold: 0.6 },
      dust: [0.50, 0.45, 0.36],
      seed: 11
    },
    DESERT: {
      base: 0x8a7555,
      patchA: { color: 0x634630, threshold: 0.56 },
      patchB: { color: 0x504e37, threshold: 0.62 },
      dust: [0.66, 0.58, 0.46],
      seed: 23
    }
  };

  const smooth01 = (e0, e1, x) => {
    const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  };

  function getPaintTextures(schemeName) {
    if (TEX_CACHE[schemeName]) return TEX_CACHE[schemeName];
    if (typeof document === 'undefined') return null;

    const scheme = PAINT_SCHEMES[schemeName] || PAINT_SCHEMES.WOODLAND;
    const size = 512;
    const mk = () => {
      const c = document.createElement('canvas');
      c.width = c.height = size;
      return c;
    };
    const colorCanvas = mk(), roughCanvas = mk(), bumpCanvas = mk();
    const cImg = colorCanvas.getContext('2d').createImageData(size, size);
    const rImg = roughCanvas.getContext('2d').createImageData(size, size);
    const bImg = bumpCanvas.getContext('2d').createImageData(size, size);

    const camoA = makeFbm(3, 5, scheme.seed);
    const camoB = makeFbm(4, 5, scheme.seed + 7);
    const warp = makeFbm(4, 3, scheme.seed + 13);
    const grime = makeFbm(2, 4, scheme.seed + 29);
    const grain = makeFbm(64, 2, scheme.seed + 41);
    const chips = makeFbm(32, 3, scheme.seed + 53);
    const blot = makeFbm(8, 3, scheme.seed + 61);
    const rnd = mulberry32(scheme.seed + 97);

    const base = hexToRgb(scheme.base);
    const pa = hexToRgb(scheme.patchA.color);
    const pb = hexToRgb(scheme.patchB.color);
    const primer = [74, 72, 64];      // lớp sơn lót / thép lộ ra ở chỗ tróc
    const col = [0, 0, 0];

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const nx = x / size, ny = y / size;
        // Uốn méo miền tọa độ để mảng sơn có viền hữu cơ như phun sơn bằng tay
        const w = (warp(nx, ny) - 0.5) * 0.12;
        const a = camoA(nx + w, ny - w);
        const b = camoB(nx - w, ny + w);

        // Viền mảng phun sơn: mép mềm ~1-2 cm (bụi sơn phun), không cắt sắc như decal
        const ka = smooth01(scheme.patchA.threshold - 0.008, scheme.patchA.threshold + 0.008, a);
        const kb = smooth01(scheme.patchB.threshold - 0.007, scheme.patchB.threshold + 0.007, b);
        for (let k = 0; k < 3; k++) {
          const v = base[k] + (pa[k] - base[k]) * ka;
          col[k] = v + (pb[k] - v) * kb;
        }

        const g = grime(nx, ny);
        const fine = grain(nx, ny);
        const bl = blot(nx, ny);
        // Sơn phai không đều (nắng, rửa xe) + hạt sơn mịn
        let shade = 0.9 + g * 0.18 + (fine - 0.5) * 0.08 + (bl - 0.5) * 0.07;
        // Vết tróc sơn nhỏ thành cụm (va quệt cành cây, đá văng) -> lộ lớp lót
        const ch = chips(nx, ny);
        const chip = smooth01(0.74, 0.79, ch * (0.75 + g * 0.5));
        // Chấm bùn khô lác đác
        const speck = rnd();
        const dirt = speck < 0.003 ? 0.4 : 0;

        const i = (y * size + x) * 4;
        for (let k = 0; k < 3; k++) {
          const dust = [118, 104, 84][k];
          let v = col[k] * shade;
          v = v + (primer[k] - v) * chip * 0.85;
          v = v * (1 - dirt) + dust * dirt;
          cImg.data[i + k] = Math.max(0, Math.min(255, v));
        }
        cImg.data[i + 3] = 255;

        // Sơn mờ quân sự: nhám cao, chỗ bạc màu nhám hơn, chỗ tróc (thép) bóng hơn
        const rough = Math.max(0, Math.min(255, (0.74 + g * 0.16 + (fine - 0.5) * 0.12 - chip * 0.25) * 255));
        rImg.data[i] = rImg.data[i + 1] = rImg.data[i + 2] = rough;
        rImg.data[i + 3] = 255;

        // Bề mặt thép đúc sần sùi + mép lõm của vết tróc
        const bump = 128 + (fine - 0.5) * 110 + (g - 0.5) * 40 - chip * 26;
        bImg.data[i] = bImg.data[i + 1] = bImg.data[i + 2] = Math.max(0, Math.min(255, bump));
        bImg.data[i + 3] = 255;
      }
    }

    colorCanvas.getContext('2d').putImageData(cImg, 0, 0);
    roughCanvas.getContext('2d').putImageData(rImg, 0, 0);
    bumpCanvas.getContext('2d').putImageData(bImg, 0, 0);

    const toTex = (canvas) => {
      const t = new THREE.CanvasTexture(canvas);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 4;
      return t;
    };
    TEX_CACHE[schemeName] = {
      map: toTex(colorCanvas),
      roughnessMap: toTex(roughCanvas),
      bumpMap: toTex(bumpCanvas),
      dust: scheme.dust
    };
    return TEX_CACHE[schemeName];
  }

  /**
   * Texture thời tiết dùng chung (đọc trong shader sơn, cùng UV hộp với lớp sơn, lặp dày hơn):
   * R: loang bụi tần số thấp, G: vệt chảy dọc (mưa cuốn bụi/dầu chảy xuống mặt đứng),
   * B: nhiễu mịn để phá đều mép mòn & cụm tróc sơn.
   */
  function getWeatherTexture() {
    if (TEX_CACHE.__weather) return TEX_CACHE.__weather;
    if (typeof document === 'undefined') return null;
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(size, size);
    const blot = makeFbm(4, 4, 71);
    const fineN = makeFbm(32, 3, 83);
    const streakX = makeFbm(16, 2, 91);   // dao động theo phương ngang -> vệt dọc
    const streakY = makeFbm(2, 2, 97);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const nx = x / size, ny = y / size;
        const p = (y * size + x) * 4;
        // Ảnh canvas: hàng y = 0 ở trên -> v của UV lớn ở trên; vệt kéo dài theo y
        const s = streakX(nx, ny * 0.06) * 0.75 + streakY(nx, ny) * 0.25;
        img.data[p] = Math.max(0, Math.min(255, blot(nx, ny) * 255));
        img.data[p + 1] = Math.max(0, Math.min(255, 128 + (s - 0.5) * 300));
        img.data[p + 2] = Math.max(0, Math.min(255, fineN(nx, ny) * 255));
        img.data[p + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    TEX_CACHE.__weather = t;
    return t;
  }

  /**
   * Texture vết chiến trường dùng chung (shader sơn đọc khi bật lớp battle, xem createMaterials):
   * A: R = bùn văng (cụm vết bắn từ bánh + giọt li ti + vệt chảy), G = muội khói / cháy sém, B = dầu loang chảy
   * B: R = vết thương sơn (≈0.5 xước / tróc lộ sơn lót, 1.0 lõi lỗ mảnh đạn lộ thép; shader đọc ở tần số cao hơn ~3.4 lần
 *    cho đúng cỡ lỗ 1-3 cm), G = vệt gỉ chảy, B = mặt nạ vùng hư hại tần số thấp (chỉ vài mảng xe dính mảnh / va quệt)
   * Vẽ bằng canvas 2D, mỗi hình vẽ lặp 9 bản lệch ±1 ô -> lặp liền mạch. Ảnh: hàng trên = phía trên mặt đứng.
   */
  function getBattleTextures() {
    if (TEX_CACHE.__battle) return TEX_CACHE.__battle;
    if (typeof document === 'undefined') return null;
    const S = 512;
    const rnd = mulberry32(4271);
    const R = (a, b) => a + (b - a) * rnd();
    const layer = () => {
      const c = document.createElement('canvas');
      c.width = c.height = S;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, S, S);
      return ctx;
    };
    const tiled = (ctx, fn) => {
      for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) {
        ctx.save();
        ctx.translate(dx, dy);
        fn(ctx);
        ctx.restore();
      }
    };
    // Vết loang mép răng cưa (bùn, dầu): đa giác bán kính dao động
    const blobPath = (r) => {
      const n = 12 + Math.floor(rnd() * 8), pts = [], ph = rnd() * 6.28, k = R(0.15, 0.35);
      for (let i = 0; i < n; i++) {
        const t = (i / n) * Math.PI * 2;
        pts.push([Math.cos(t), Math.sin(t), r * (1 - k + k * (Math.sin(t * 3 + ph) * 0.5 + 0.5) + R(-0.12, 0.12) * r / (r + 2))]);
      }
      return pts;
    };
    const fillBlob = (ctx, x, y, pts, sx = 1, ang = 0) => {
      const c = Math.cos(ang), s = Math.sin(ang);
      ctx.beginPath();
      pts.forEach(([px, py, r], i) => {
        const lx = px * r * sx, ly = py * r;
        const X = x + lx * c - ly * s, Y = y + lx * s + ly * c;
        if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y);
      });
      ctx.closePath();
      ctx.fill();
    };
    // Vệt chảy dọc xuống (dầu, bùn ướt, gỉ): dải thuôn có lắc nhẹ, mờ dần về cuối
    const drip = (ctx, x, y, len, w, a) => {
      const steps = Math.max(4, Math.floor(len / 3));
      let px = x;
      for (let i = 0; i < steps; i++) {
        const k = i / steps;
        const nx = px + R(-0.35, 0.35);
        ctx.strokeStyle = `rgba(255,255,255,${a * (1 - k * 0.85)})`;
        ctx.lineWidth = Math.max(0.6, w * (1 - k * 0.6));
        ctx.beginPath();
        ctx.moveTo(px, y + (len * i) / steps);
        ctx.lineTo(nx, y + (len * (i + 1)) / steps);
        ctx.stroke();
        px = nx;
      }
      return px;
    };

    // --- Bùn văng: cụm vết lớn + giọt bắn tỏa theo hướng văng (chủ yếu hắt lên & ra sau) + vệt chảy ---
    const mud = layer();
    mud.globalCompositeOperation = 'lighter';
    const mudShapes = [];
    for (let i = 0; i < 64; i++) {
      const x = R(0, S), y = R(0, S), r = R(4, 22) * (rnd() < 0.15 ? 1.6 : 1);
      const dir = -Math.PI / 2 + R(-1.3, 1.3);
      const shape = { x, y, r, a: R(0.45, 0.85), pts: blobPath(r), drops: [], drips: [] };
      const nd = 6 + Math.floor(rnd() * 34);
      for (let k = 0; k < nd; k++) {
        const dist = r * (0.8 + Math.pow(rnd(), 1.7) * 4.5);
        const ang = dir + R(-0.55, 0.55);
        const dr = Math.max(0.6, r * R(0.04, 0.28) * (1.4 - dist / (r * 5.3)));
        shape.drops.push({ x: x + Math.cos(ang) * dist, y: y + Math.sin(ang) * dist, pts: blobPath(dr), sx: R(1, 2.4), ang, a: R(0.5, 1) });
      }
      if (rnd() < 0.4) for (let k = 0; k < 1 + rnd() * 3; k++) shape.drips.push({ x: x + R(-r * 0.6, r * 0.6), y: y + r * R(0.3, 0.8), len: R(6, 30), w: R(1.2, 3.2) });
      mudShapes.push(shape);
    }
    tiled(mud, (ctx) => {
      for (const s of mudShapes) {
        ctx.fillStyle = `rgba(255,255,255,${s.a})`;
        fillBlob(ctx, s.x, s.y, s.pts);
        // lõi bùn dày giữa vết
        ctx.fillStyle = `rgba(255,255,255,${s.a * 0.5})`;
        fillBlob(ctx, s.x + R(-1, 1), s.y + R(-1, 1), s.pts, 0.55);
        for (const d of s.drops) {
          ctx.fillStyle = `rgba(255,255,255,${d.a})`;
          fillBlob(ctx, d.x, d.y, d.pts, d.sx, d.ang);
        }
        for (const d of s.drips) drip(ctx, d.x, d.y, d.len, d.w, 0.7);
      }
    });
    // giọt li ti rải đều
    const specks = [];
    for (let i = 0; i < 2600; i++) specks.push([R(0, S), R(0, S), R(0.5, 1.6), R(0.25, 0.8)]);
    tiled(mud, (ctx) => {
      for (const [x, y, r, a] of specks) {
        ctx.fillStyle = `rgba(255,255,255,${a})`;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // --- Muội khói / cháy sém: vài đám loang mềm, lưỡi muội liếm ngược lên trên ---
    const soot = layer();
    soot.globalCompositeOperation = 'lighter';
    const sootShapes = [];
    for (let i = 0; i < 4; i++) {
      const x = R(0, S), y = R(0, S), r = R(26, 60), puffs = [];
      for (let k = 0; k < 9; k++) puffs.push([x + R(-r, r) * 0.7, y + R(-r, r) * 0.5, r * R(0.3, 0.75), R(0.12, 0.3)]);
      for (let k = 0; k < 5; k++) {
        const len = r * R(0.8, 1.9);
        puffs.push([x + R(-r, r) * 0.5, y - len * 0.6, r * R(0.15, 0.3), R(0.08, 0.2), len]);
      }
      sootShapes.push(puffs);
    }
    tiled(soot, (ctx) => {
      for (const puffs of sootShapes) {
        for (const [x, y, r, a, len] of puffs) {
          ctx.save();
          ctx.translate(x, y);
          if (len) ctx.scale(1, len / r);
          const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
          g.addColorStop(0, `rgba(255,255,255,${a})`);
          g.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = g;
          ctx.fillRect(-r, -r, r * 2, r * 2);
          ctx.restore();
        }
      }
    });

    // --- Dầu / nhiên liệu loang: vũng nhỏ + vài dòng chảy dài xuống dưới ---
    const oil = layer();
    oil.globalCompositeOperation = 'lighter';
    const oilShapes = [];
    for (let i = 0; i < 7; i++) {
      const x = R(0, S), y = R(0, S), r = R(4, 13), drips = [];
      for (let k = 0; k < 2 + rnd() * 4; k++) drips.push([x + R(-r, r) * 0.8, y + r * 0.4, R(18, 90), R(1.4, 3.6)]);
      oilShapes.push({ x, y, pts: blobPath(r), drips });
    }
    tiled(oil, (ctx) => {
      for (const o of oilShapes) {
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        fillBlob(ctx, o.x, o.y, o.pts);
        for (const [x, y, len, w] of o.drips) {
          const ex = drip(ctx, x, y, len, w, 0.8);
          ctx.fillStyle = 'rgba(255,255,255,0.55)';
          ctx.beginPath();
          ctx.arc(ex, y + len, w * 0.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    });

    // --- Vết thương sơn: chùm lỗ mảnh đạn (lõi sẫm + viền tróc), xước cành cây / đá, sứt mẻ ---
    const scar = layer();
    scar.globalCompositeOperation = 'lighten';
    const rust = layer();
    rust.globalCompositeOperation = 'lighter';
    const pocks = [], scratches = [], chipsL = [], rustL = [];
    // Mảnh sơn tróc: đa giác góc cạnh nham nhở (bán kính từng đỉnh dao động mạnh) — vết tròn đều trông như chấm bi in lên
    const flakePath = (r) => {
      const n = 6 + Math.floor(rnd() * 6), pts = [], ph = rnd() * 6.28;
      for (let i = 0; i < n; i++) pts.push([Math.cos(ph + (i + R(-0.3, 0.3)) / n * 6.28), Math.sin(ph + (i + R(-0.3, 0.3)) / n * 6.28), r * R(0.45, 1.15)]);
      return pts;
    };
    // độ xám khác nhau -> shader (ngưỡng 0.3-0.48) cho vết đậm / mờ / gần như không thấy, không phải vết nào cũng rõ như nhau
    const grey = (a, b) => { const v = Math.round(R(a, b)); return `rgb(${v},${v},${v})`; };
    for (let c = 0; c < 7; c++) {
      const cx = R(0, S), cy = R(0, S), spread = R(20, 80), n = 3 + Math.floor(rnd() * 13);
      for (let k = 0; k < n; k++) {
        const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * spread, r = 0.8 + 2.6 * Math.pow(rnd(), 1.6);
        // lỗ mảnh: lõi rách lệch tâm + quầng sơn vỡ méo kéo dài theo hướng mảnh bay tới (không phải vòng tròn quanh lõi),
        // vài vụn tróc văng quanh; ~1/3 lỗ nhỏ không có quầng (mảnh xuyên gọn)
        const p = { x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d, r, core: flakePath(r * 0.6), csx: R(1, 1.5), ang: R(0, 6.28),
          halo: rnd() < 0.68 ? { pts: flakePath(r * R(1.3, 2.2)), sx: R(1, 1.9), g: grey(104, 146), dx: R(-0.5, 0.5) * r, dy: R(-0.5, 0.5) * r } : null,
          bits: [] };
        for (let b = 0; b < (p.halo ? Math.floor(rnd() * 4) : 0); b++) {
          const ba = rnd() * 6.28, bd = r * R(1.6, 3.2);
          p.bits.push([p.x + Math.cos(ba) * bd, p.y + Math.sin(ba) * bd, flakePath(R(0.4, 1.1)), grey(100, 140)]);
        }
        pocks.push(p);
        if (rnd() < 0.45) rustL.push([p.x, p.y + r * 0.6, R(8, 46), R(1, 2.4)]);
      }
    }
    for (let g = 0; g < 26; g++) {
      const x = R(0, S), y = R(0, S), ang = R(-0.35, 0.35) + (rnd() < 0.2 ? Math.PI / 2 : 0), len = R(18, 130), n = 1 + Math.floor(rnd() * 5);
      for (let k = 0; k < n; k++) scratches.push([x + R(-3, 3), y + k * R(1.5, 4), ang + R(-0.05, 0.05), len * R(0.5, 1), R(0.6, 1.5), R(0.25, 0.4)]);
      if (rnd() < 0.3) rustL.push([x + R(0, len * 0.6), y + 2, R(6, 28), R(0.8, 1.8)]);
    }
    // Tróc sơn theo cụm (chỗ đá văng / cành quệt / giày dẫm), mảnh dẹt cùng hướng trong một cụm, cỡ lệch hẳn nhau (nhiều vụn
    // li ti, ít mảng to); thêm vụn lẻ tẻ. Trước đây 160 vết tròn cỡ đều rải khắp -> lặp 3.4 lần trên thân thành chấm bi
    for (let c = 0; c < 20; c++) {
      const cx = R(0, S), cy = R(0, S), spread = R(5, 28), dir = R(0, 6.28), stretch = R(1, 2.6), n = 2 + Math.floor(rnd() * 11);
      for (let k = 0; k < n; k++) {
        const a = rnd() * 6.28, d = Math.pow(rnd(), 0.7) * spread;
        chipsL.push([cx + Math.cos(a) * d * stretch * 0.7, cy + Math.sin(a) * d, flakePath(0.6 + 4.2 * Math.pow(rnd(), 2.4)), stretch * R(0.8, 1.2), dir + R(-0.3, 0.3), grey(96, 136)]);
      }
    }
    for (let i = 0; i < 45; i++) chipsL.push([R(0, S), R(0, S), flakePath(R(0.5, 1.8)), R(1, 2), R(0, 6.28), grey(92, 130)]);
    tiled(scar, (ctx) => {
      for (const [x, y, ang, len, w, bend] of scratches) {
        ctx.strokeStyle = 'rgb(128,128,128)';
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + Math.cos(ang) * len * 0.5, y + Math.sin(ang) * len * 0.5 + bend * 10, x + Math.cos(ang) * len, y + Math.sin(ang) * len);
        ctx.stroke();
      }
      for (const [x, y, pts, sx, ang, g] of chipsL) { ctx.fillStyle = g; fillBlob(ctx, x, y, pts, sx, ang); }
      for (const p of pocks) {
        if (p.halo) { ctx.fillStyle = p.halo.g; fillBlob(ctx, p.x + p.halo.dx, p.y + p.halo.dy, p.halo.pts, p.halo.sx, p.ang); }
        for (const [x, y, pts, g] of p.bits) { ctx.fillStyle = g; fillBlob(ctx, x, y, pts); }
        ctx.fillStyle = 'rgb(255,255,255)';
        fillBlob(ctx, p.x, p.y, p.core, p.csx, p.ang);
      }
    });
    tiled(rust, (ctx) => {
      for (const [x, y, len, w] of rustL) drip(ctx, x, y, len, w, 0.75);
    });

    // --- Gộp kênh + phá đều bằng nhiễu (bùn khô nứt mép, muội không đặc đều) ---
    const read = (ctx) => ctx.getImageData(0, 0, S, S).data;
    const dm = read(mud), ds = read(soot), dO = read(oil), dc = read(scar), dr = read(rust);
    const breakup = makeFbm(8, 4, 211), fine = makeFbm(64, 2, 223), grain = makeFbm(128, 2, 229);
    const outA = layer(), outB = layer();
    const iA = outA.createImageData(S, S), iB = outB.createImageData(S, S);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const p = (y * S + x) * 4;
        const n = breakup(x / S, y / S), f = fine(x / S, y / S);
        const m = Math.min(255, dm[p] * (0.75 + 0.5 * f));
        iA.data[p] = m;
        iA.data[p + 1] = Math.min(255, ds[p] * (0.55 + 0.9 * n) * (0.85 + 0.3 * f));
        iA.data[p + 2] = Math.min(255, dO[p] * (0.8 + 0.4 * n));
        iA.data[p + 3] = 255;
        // mép vết tróc / quầng lỗ mảnh rỗ lởm chởm theo hạt (lõi lỗ thép giữ nguyên)
        iB.data[p] = dc[p] >= 200 ? dc[p] : dc[p] * (0.7 + 0.6 * grain(x / S, y / S));
        iB.data[p + 1] = Math.min(255, dr[p] * (0.6 + 0.8 * n));
        iB.data[p + 2] = Math.max(0, Math.min(255, (n - 0.5) * 2.4 * 255 + 128));   // vùng từng hứng mảnh đạn / va quệt
        iB.data[p + 3] = 255;
      }
    }
    outA.putImageData(iA, 0, 0);
    outB.putImageData(iB, 0, 0);
    const toTex = (ctx) => {
      const t = new THREE.CanvasTexture(ctx.canvas);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 4;
      return t;
    };
    TEX_CACHE.__battle = { a: toTex(outA), b: toTex(outB) };
    return TEX_CACHE.__battle;
  }

  /**
   * Shader sơn quân sự (chèn vào MeshStandardMaterial):
   * - màu đỉnh (vertex color) mã hóa: R = che khuất (AO), G = độ cao trên gầm (0 sát đất .. 1 trên cao),
   *   B = mặt ngửa lên trời (0..1)
   * - bụi đất phủ dày dần xuống gầm + rắc trên mặt ngang, loang theo nhiễu; bụi làm sơn nhám hẳn
   * - vệt chảy dọc trên mặt đứng
   * - mép giáp mòn sơn sáng lên, lác đác lộ thép (cạnh sắc lấy từ thuộc tính edgeD do computeEdgeWear tính)
   * Màu vật liệu (diffuse) vẫn nhân vào cuối -> xác xe cháy đen vẫn đen như cũ.
   */
  // ---------------------------------------------------------------------------
  // MÔI TRƯỜNG CHUNG CHO LỚP BẨN: màu & lượng bụi theo bản đồ đang chơi, độ ướt khi mưa. Uniform đọc qua getter mỗi lần
  // vẽ (game không phải gọi cập nhật): bản đồ lấy từ game.terrain, độ ướt từ Weather.U.x (beforeRender đặt khi mưa).
  // Ngoài trận (sảnh, phòng xem xe) dùng màu bụi theo bộ sơn, khô ráo.
  // ---------------------------------------------------------------------------
  // rust: độ ẩm chiến địa -> thép trần không cọ xát (thân guốc xích, giá bắt, đầu bu-lông) gỉ nhiều / ít
  const MAP_DUST = {
    DESERT: { c: [0.70, 0.61, 0.47], k: 1.3, rust: 0.2 },        // cát mịn phủ trắng cả xe; khô -> gần như không gỉ
    URBAN: { c: [0.52, 0.50, 0.47], k: 0.85, rust: 0.5 },        // bụi bê tông xám, ít đất
    JUNGLE: { c: [0.38, 0.30, 0.21], k: 1.0, rust: 0.95 },       // đất đỏ nâu sẫm, ẩm -> gỉ cam nâu phủ dày
    HIGHLAND: { c: [0.50, 0.45, 0.37], k: 1.0, rust: 0.55 },
    RIVER_LAKE: { c: [0.44, 0.39, 0.30], k: 1.0, rust: 0.85 }    // phù sa bờ sông, lội nước thường xuyên
  };
  const envMapDust = () => {
    const g = typeof window !== 'undefined' ? window.game : null;
    return (g && g.terrain && MAP_DUST[g.terrain.mapType]) || null;
  };
  const ENV_V = new THREE.Vector2();
  // x = hệ số lượng bụi của bản đồ, y = độ ướt mưa (0..1)
  const ENV_U = {
    get value() {
      const d = envMapDust();
      // ngoài trận (sảnh, phòng xem xe — chưa có bản đồ): xe mới lăn bánh ít, bụi nhẹ
      return ENV_V.set(d ? d.k : 0.55, typeof Weather !== 'undefined' && Weather.U ? Weather.U.x : 0);
    }
  };
  // mức gỉ theo chiến địa (ngoài trận: vừa phải)
  const RUST_U = { get value() { const d = envMapDust(); return d ? d.rust : 0.4; } };
  function dustUniform(fallback) {
    const c = new THREE.Color();
    return { get value() { const d = envMapDust(), s = d ? d.c : fallback; return c.setRGB(s[0], s[1], s[2]); } };
  }

  function patchPaintMaterial(m, dust, weather, battle = null) {
    if (!weather) return;
    const dustU = dustUniform(dust);
    if (battle) m.defines = Object.assign(m.defines || {}, { VK_BATTLE: '' });
    m.userData.vkPaint = true;
    // function thường (không phải arrow): three gọi material.onBeforeCompile(...) nên this = đúng vật liệu đang biên dịch —
    // bản sao xác xe (clone + gán lại onBeforeCompile) đọc mức cháy userData.vkChar của riêng nó, không của bản gốc
    m.onBeforeCompile = function (sh) {
      const mat = this;
      sh.uniforms.vkWeather = { value: weather };
      sh.uniforms.vkDust = dustU;
      sh.uniforms.vkEnv = ENV_U;
      sh.uniforms.vkChar = { get value() { return (mat && mat.userData && mat.userData.vkChar) || 0; } };
      if (battle) {
        sh.uniforms.vkBattleA = { value: battle.tex.a };
        sh.uniforms.vkBattleB = { value: battle.tex.b };
        sh.uniforms.vkBattle = { value: battle.amount };
        sh.uniforms.vkBattleOff = { value: battle.offset };
      }
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 edgeD;\nvarying vec4 vEdgeD;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEdgeD = edgeD;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform sampler2D vkWeather;
          uniform vec3 vkDust;
          uniform vec2 vkEnv;
          uniform float vkChar;
          varying vec4 vEdgeD;
          #ifdef VK_BATTLE
            uniform sampler2D vkBattleA, vkBattleB;
            uniform float vkBattle;
            uniform vec2 vkBattleOff;
          #endif`)
        .replace('#include <color_fragment>', `
          #ifdef USE_COLOR
            float vkAO = vColor.r, vkH = vColor.g, vkUp = vColor.b;
          #else
            float vkAO = 1.0, vkH = 1.0, vkUp = 0.0;
          #endif
          #ifdef USE_MAP
            vec2 vkUv = vUv;
          #else
            vec2 vkUv = vec2(0.0);
          #endif
          vec3 vkW = texture2D(vkWeather, vkUv * 2.3).rgb;
          vec3 vkTint = diffuse;
          vec3 vkCol = diffuseColor.rgb;
          // Vệt bẩn chảy dọc lác đác trên mặt đứng (chỉ vài vệt sẫm, không phủ đều)
          vkCol *= 1.0 - smoothstep(0.62, 0.86, vkW.g) * 0.16 * (1.0 - vkUp) + smoothstep(0.3, 0.12, vkW.g) * 0.05 * (1.0 - vkUp);
          // Mép cạnh sắc: sơn mòn sáng lên, chỗ mòn sâu lộ thép sẫm
          float vkWear = 0.0;
          if (vEdgeD.w < 0.5) {
            float d = min(min(vEdgeD.x, vEdgeD.y), vEdgeD.z);
            float band = 0.14 + 0.2 * vkW.b;
            vkWear = 1.0 - smoothstep(0.0, band, d);
            vkWear *= smoothstep(0.3, 0.62, vkW.b + 0.45 * vkWear);
          }
          vec3 vkWorn = mix(vkCol * 1.45 + 0.03 * vkTint, vec3(0.29, 0.28, 0.26) * vkTint, step(0.8, vkW.b) * 0.8);
          vkCol = mix(vkCol, vkWorn, vkWear * 0.8);
          #ifdef VK_BATTLE
            // Vết chiến trường: sơn bạc nắng, xước & lỗ mảnh đạn, gỉ chảy, dầu loang, muội cháy sém
            vec2 vkBUv = vkUv * 0.81 + vkBattleOff;
            vec3 vkBA = texture2D(vkBattleA, vkBUv).rgb;
            vec3 vkBB = texture2D(vkBattleB, vkBUv).rgb;
            float vkZone = smoothstep(0.4, 0.75, vkBB.b);
            float vkScar = texture2D(vkBattleB, vkBUv * 3.4 + vec2(0.37, 0.61)).r;
            float vkSide = 1.0 - vkUp;
            float vkLum = dot(vkCol, vec3(0.3, 0.59, 0.11));
            vkCol = mix(vkCol, vkLum * vec3(1.05, 1.0, 0.9), 0.2 * vkBattle);
            float vkPit = smoothstep(0.8, 0.95, vkScar) * vkZone * vkBattle;
            float vkScr = smoothstep(0.3, 0.48, vkScar) * (1.0 - vkPit) * (0.12 + 0.88 * vkZone) * vkBattle;   // ngoài vùng hư hại chỉ lác đác
            vkCol = mix(vkCol, vec3(0.4, 0.39, 0.35) * vkTint * (0.85 + 0.3 * vkW.b), vkScr * 0.55);
            vkCol = mix(vkCol, vec3(0.1, 0.095, 0.085) * vkTint, vkPit * 0.8);
            float vkRust = vkBB.g * vkSide * (0.35 + 0.65 * vkZone) * vkBattle;
            vkCol = mix(vkCol, vec3(0.32, 0.17, 0.08) * vkTint * (0.75 + 0.5 * vkW.b), vkRust * 0.7);
            float vkOil = smoothstep(0.12, 0.7, vkBA.b) * (0.45 + 0.55 * vkSide) * vkBattle;
            vkCol *= 1.0 - vkOil * 0.6;
            float vkSoot = smoothstep(0.1, 0.8, vkBA.g) * vkBattle;
            vkCol = mix(vkCol, vec3(0.04, 0.038, 0.035) * vkTint, vkSoot * 0.7);
          #endif
          // XÁC XE CHÁY (vkChar 0..1, explosion_fx applyChar): trước tiên muội khói phủ loang đen; lửa to kéo dài thì sơn
          // phồng rộp rồi cháy rụi, lộ thép bị nung — gỉ nâu cam trên mặt đứng, tro xám bạc đóng mảng trên mặt ngửa, vệt
          // muội đen còn bám loang lổ. Không phải đen thui đồng màu
          float vkCh = vkChar;
          if (vkCh > 0.001) {
            float vkN1 = vkW.r, vkN2 = vkW.b, vkN3 = vkW.g;
            float vkSootK = smoothstep(0.0, 0.45, vkCh);
            float vkBurnK = smoothstep(0.3, 1.0, vkCh) * (0.7 + 0.3 * vkN1);
            vec3 vkSootC = vec3(0.045, 0.042, 0.038) * (0.8 + 0.4 * vkN2);
            vec3 vkRustC = mix(vec3(0.17, 0.095, 0.055), vec3(0.33, 0.19, 0.1), vkN1);
            vec3 vkAshC = mix(vec3(0.27, 0.26, 0.245), vec3(0.47, 0.455, 0.43), vkN2);
            float vkAshM = smoothstep(0.42, 0.75, vkN2 * 0.65 + vkUp * 0.6);
            float vkRustM = smoothstep(0.25, 0.6, vkN1 + (1.0 - vkUp) * 0.25);
            vec3 vkBurnt = mix(vec3(0.11, 0.09, 0.075), vkRustC, vkRustM);
            vkBurnt = mix(vkBurnt, vkAshC, vkAshM * 0.85);
            vkBurnt = mix(vkBurnt, vkSootC, smoothstep(0.45, 0.8, vkN3) * 0.8);
            vkCol = mix(vkCol, vkSootC, vkSootK * (0.55 + 0.35 * vkN3));
            vkCol = mix(vkCol, vkBurnt, vkBurnK);
          }
          // Bụi đất theo bản đồ: dày dần xuống gầm, rắc trên mặt ngửa; loang theo nhiễu. Trời mưa: bụi mặt ngửa bị rửa
          // trôi gần hết, bụi gầm ngấm nước thành bùn nhão sẫm & bóng
          float vkWet = vkEnv.y;
          float vkLow = pow(1.0 - vkH, 1.5);
          float vkDustK = clamp((vkLow * (0.55 + 0.6 * vkW.r) + vkUp * (0.05 + 0.3 * vkW.r) * (0.6 + 0.4 * vkW.b) * (1.0 - 0.75 * vkWet)) * vkEnv.x - 0.07, 0.0, 0.85);
          vkCol = mix(vkCol, mix(vkDust, vkDust * vec3(0.62, 0.55, 0.48), vkWet) * vkTint, vkDustK);
          #ifdef VK_BATTLE
            // Bùn văng từ bánh: dày sát gầm, lên cao chỉ còn vết bắn to; mặt sàn có bùn giày dẫm.
            // Lõi vết dày còn ướt (sẫm, hơi bóng), mép khô bạc màu như đất
            float vkMudT = mix(0.06, 0.8, smoothstep(0.0, 0.9, vkH)) - vkUp * 0.14;
            float vkMud = smoothstep(vkMudT, vkMudT + 0.14, vkBA.r) * vkBattle;
            vec3 vkMudCol = mix(vkDust * 0.82, vkDust * 0.45, smoothstep(0.65, 1.0, vkBA.r));
            vkMudCol = mix(vkMudCol, vkDust * vec3(0.52, 0.46, 0.4), vkWet * 0.7);
            vkCol = mix(vkCol, vkMudCol * vkTint, vkMud * 0.93);
          #endif
          // Nước mưa đọng trên mặt phẳng ngửa (nóc tháp, sàn động cơ, hốc trũng khuất): vũng mỏng loang theo nhiễu, hốc
          // (AO thấp) đọng nhiều hơn; mặt nước sẫm & gần như gương (lớp ướt chung của Weather phản chiếu trời xám)
          float vkPud = vkWet * smoothstep(0.88, 0.97, vkUp) * smoothstep(0.62, 0.72, vkW.r * 0.8 + (1.0 - vkAO) * 0.9 + vkW.b * 0.2);
          vkCol *= 1.0 - vkPud * 0.45;
          diffuseColor.rgb = vkCol * vkAO;
        `)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          roughnessFactor = mix(roughnessFactor, mix(1.0, 0.45, vkWet), vkDustK);
          roughnessFactor = mix(roughnessFactor, 0.5, vkWear * 0.5);
          #ifdef VK_BATTLE
            roughnessFactor = mix(roughnessFactor, 0.55, vkPit * 0.7);
            roughnessFactor = mix(roughnessFactor, 0.3, vkOil * 0.8);
            roughnessFactor = mix(roughnessFactor, 1.0, vkSoot * 0.8);
            roughnessFactor = mix(roughnessFactor, mix(mix(1.0, 0.5, smoothstep(0.75, 1.0, vkBA.r)), 0.3, vkWet), vkMud);
          #endif
          roughnessFactor = mix(roughnessFactor, 0.09, vkPud);
          roughnessFactor = mix(roughnessFactor, 0.97, vkCh);   // tro / gỉ cháy: xỉn hẳn, không còn ánh sơn`);
    };
    m.customProgramCacheKey = () => (battle ? 'vkPaint2b' : 'vkPaint2');
  }

  /**
   * Bản sao vật liệu cho bộ phận chạy (mắt xích, lốp cao su, vành / răng thép bánh): đất bụi theo bản đồ nhét kẽ & phủ
   * màng loang, cục đất vón bám rải rác; trời mưa thành bùn nhão sẫm, bóng ướt. Dựng cho InstancedMesh: nhiễu lấy theo tọa
   * độ cục bộ chi tiết + số thứ tự bản sao -> mỗi mắt xích / bánh một kiểu bẩn riêng, bám chặt theo khi xích chạy, bánh quay.
   * strength: mức bẩn tối đa (vành thép mòn sáng ít bám, thân xích bám nhiều). opts.inner: mặt trong vòng xích (y < 0 hệ
   * mắt xích, quanh răng dẫn hướng) lèn đất dày hơn. Màu xác cháy (explosion_fx đổi m.color) vẫn sẫm cả lớp đất.
   * opts.rust (0..1): thép trần gỉ loang nâu cam theo độ ẩm chiến địa (sa mạc ít, rừng / sông nhiều, mưa sẫm thêm).
   * opts.polish: mặt cọ xát mài sáng như thép mới — 'track': 2 mặt răng dẫn hướng (cọ đĩa bánh), dải mặt trong guốc nơi bánh
   * chịu tải lăn, mép guốc phía đất (hệ mắt xích buildLink của Halberd); số R: mặt quay ra ngoài cách trục bánh > R (mặt lăn
   * vành bánh dẫn hướng, sườn răng bánh sao). Chỗ mài sáng không gỉ, không bám đất.
   * m.userData.dirtAge.value = 1: xác nằm lâu (cứ điểm) — gỉ dày khắp, hết vệt sáng.
   */
  function dirtyMaterial(src, strength, opts = {}) {
    const m = src.clone();
    // vật liệu sơn kiểu hộp (boxUV: paint / dark có vết chiến trường) dùng màu đỉnh làm kênh mòn / bóng đổ / hướng lên, không
    // phải màu thật — shader bùn này thay shader sơn nên phải tắt, không thì đầu bu-lông / vành bánh nhuộm đỏ tím
    if (src.userData && src.userData.boxUV) m.vertexColors = false;
    const base = src.color.clone();
    const dustU = dustUniform(opts.dust || [0.55, 0.49, 0.39]);
    const age = { value: 0 };
    m.userData.dirtAge = age;
    const rustK = opts.rust || 0, pol = opts.polish;
    const def = { VK_DIRT_K: strength.toFixed(3), VK_RUST_K: rustK.toFixed(3) };
    if (opts.inner) def.VK_DIRT_IN = '';
    if (pol === 'track') def.VK_POL_TRACK = '';
    else if (typeof pol === 'number') def.VK_POL_R = pol.toFixed(3);
    m.defines = Object.assign({}, m.defines || {}, def);
    // khai báo dự phòng ngay trong shader: vật liệu bị clone / mượn onBeforeCompile (MeshStandardMaterial.copy của r128 đặt lại
    // defines = { STANDARD }) mất VK_* -> trước đây lỗi biên dịch "VK_DIRT_K undeclared identifier"
    const vkDefs = Object.keys(def).map(k => `#ifndef ${k}\n#define ${k} ${def[k]}\n#endif`).join('\n');
    m.onBeforeCompile = (sh) => {
      sh.uniforms.vkDust = dustU;
      sh.uniforms.vkEnv = ENV_U;
      sh.uniforms.vkRustMap = RUST_U;
      sh.uniforms.vkAge = age;
      sh.uniforms.vkBase = { value: base };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vDirtP, vDirtN;\nvarying float vDirtI;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vDirtP = position;
          vDirtN = objectNormal;
          #if defined( USE_INSTANCING ) && __VERSION__ >= 300
            vDirtI = float( gl_InstanceID );
          #else
            vDirtI = 0.0;
          #endif`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
${vkDefs}
          uniform vec3 vkDust, vkBase;
          uniform vec2 vkEnv;
          uniform float vkRustMap, vkAge;
          varying vec3 vDirtP, vDirtN;
          varying float vDirtI;
          float vkH3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
          float vkN3(vec3 p) {
            vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
            return mix(mix(mix(vkH3(i), vkH3(i + vec3(1, 0, 0)), f.x), mix(vkH3(i + vec3(0, 1, 0)), vkH3(i + vec3(1, 1, 0)), f.x), f.y),
                       mix(mix(vkH3(i + vec3(0, 0, 1)), vkH3(i + vec3(1, 0, 1)), f.x), mix(vkH3(i + vec3(0, 1, 1)), vkH3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
          }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          vec3 vkP = vDirtP + vec3(7.13, 3.71, 5.19) * vDirtI;
          vec3 vkNl = normalize(vDirtN);
          // màng bụi gần đều (bộ phận chạy luôn phủ đất), dày mỏng loang chậm; mảng vón dày rải rác
          float vkN = vkN3(vkP * 0.9) * 0.65 + vkN3(vkP * 2.6) * 0.35;
          float vkAmt = VK_DIRT_K * vkEnv.x;
          float vkDirt = clamp(vkAmt * (0.45 + 0.6 * (vkN - 0.5)), 0.0, 0.85);
          #ifdef VK_DIRT_IN
            vkDirt = max(vkDirt, smoothstep(0.05, -0.5, vDirtP.y) * vkAmt * (0.7 + 0.3 * vkN));
          #endif
          vkDirt = max(vkDirt, smoothstep(0.66, 0.78, vkN3(vkP * 3.1 + 4.1)) * min(1.0, vkAmt));   // mảng đất vón
          vkDirt = min(vkDirt, 0.95);
          float vkWet = vkEnv.y;
          // màu xác cháy: explosion_fx nhân m.color -> tỉ lệ so với màu gốc cũng làm sẫm lớp đất
          float vkCh = dot(diffuse / max(vkBase, vec3(0.004)), vec3(0.3333));
          // GỈ: loang theo nhiễu riêng (mắt nọ gỉ nhiều mắt kia ít), nâu sẫm ở lõi tới cam ở mép mảng; mưa ướt sẫm thêm
          float vkRn = vkN3(vkP * 1.9 + 11.3) * 0.6 + vkN3(vkP * 5.7 + 2.9) * 0.4;
          float vkRust = clamp(VK_RUST_K * max(vkRustMap + 0.25 * vkWet, vkAge * 1.2) * (0.3 + 1.2 * (vkRn - 0.4)), 0.0, 0.92);
          vec3 vkRc = mix(vec3(0.19, 0.105, 0.06), vec3(0.42, 0.21, 0.09), smoothstep(0.35, 0.8, vkRn)) * mix(1.0, 0.72, vkWet);
          // MÀI SÁNG: mặt cọ xát liên tục — thép mới sáng, không gỉ, không bám đất
          float vkPol = 0.0;
          #ifdef VK_POL_TRACK
            float vkAx = abs(vDirtP.x);
            vkPol = max(vkPol, step(0.7, abs(vkNl.x)) * (1.0 - smoothstep(0.26, 0.32, vkAx)) * step(vDirtP.y, -0.3) * 0.9);   // răng dẫn hướng
            vkPol = max(vkPol, step(vkNl.y, -0.7) * step(vDirtP.y, -0.2) * smoothstep(0.55, 0.7, vkAx) * (1.0 - smoothstep(2.4, 2.55, vkAx)) * 0.75);   // đường lăn bánh
            vkPol = max(vkPol, step(0.7, vkNl.y) * step(0.3, vDirtP.y) * step(vDirtP.y, 0.4) * 0.45);   // mép guốc phía đất
          #endif
          #ifdef VK_POL_R
            float vkRad = length(vDirtP.yz);
            vkPol = max(vkPol, smoothstep(VK_POL_R - 0.05, VK_POL_R + 0.12, vkRad) * mix(0.35, 0.95, 1.0 - abs(vkNl.x)));
          #endif
          vkPol *= (1.0 - vkAge) * (0.75 + 0.25 * vkN) * (1.0 - 0.5 * vkWet * vkDirt);
          vkRust *= 1.0 - vkPol;
          diffuseColor.rgb = mix(diffuseColor.rgb, vkRc * vkCh, vkRust);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.5, 0.49, 0.46) * vkCh, vkPol);
          vkDirt *= 1.0 - 0.85 * vkPol;
          // đất lèn chặt trong kẽ / bám màng dầu mỡ sẫm hơn bụi bay phủ thân xe; ướt -> bùn sẫm
          vec3 vkDc = mix(vkDust * (0.55 + 0.25 * vkN), vkDust * vec3(0.55, 0.49, 0.43) * (0.8 + 0.3 * vkN), vkWet);
          diffuseColor.rgb = mix(diffuseColor.rgb, vkDc * vkCh, vkDirt);`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          roughnessFactor = mix(roughnessFactor, 0.92, vkRust);
          roughnessFactor = mix(roughnessFactor, 0.28, vkPol);
          roughnessFactor = mix(roughnessFactor, mix(1.0, 0.3, vkWet), vkDirt);`)
        .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
          metalnessFactor = mix(metalnessFactor, 0.1, vkRust);
          metalnessFactor = mix(metalnessFactor, 0.85, vkPol);
          metalnessFactor *= 1.0 - vkDirt;`);
    };
    m.customProgramCacheKey = () => 'vkDirt' + strength + (opts.inner ? 'i' : '') + '|' + rustK + '|' + (pol || '');
    return m;
  }

  // Texture mặt xích / lốp cao su (đường vân nhỏ), dùng chung
  function getGrimeTexture() {
    if (TEX_CACHE.__grime) return TEX_CACHE.__grime;
    if (typeof document === 'undefined') return null;
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(size, size);
    const n = makeFbm(8, 4, 5);
    for (let i = 0, p = 0; i < size * size; i++, p += 4) {
      const v = 200 + (n((i % size) / size, Math.floor(i / size) / size) - 0.5) * 110;
      img.data[p] = img.data[p + 1] = img.data[p + 2] = Math.max(0, Math.min(255, v));
      img.data[p + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    TEX_CACHE.__grime = t;
    return t;
  }

  // Lốp đã chạy chiến trường: cao su xám bạc (không đen tuyền), màng bụi loang, bùn khô bám cục
  function getTireTexture() {
    if (TEX_CACHE.__tire) return TEX_CACHE.__tire;
    if (typeof document === 'undefined') return null;
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(size, size);
    const film = makeFbm(4, 4, 301), clod = makeFbm(16, 3, 307), grain = makeFbm(64, 2, 311);
    const rubber = [40, 39, 37], dust = [104, 93, 76], mud = [70, 58, 44];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const nx = x / size, ny = y / size, p = (y * size + x) * 4;
        const g = grain(nx, ny);
        const f = smooth01(0.35, 0.8, film(nx, ny)) * 0.3 + 0.05;
        const c = smooth01(0.66, 0.74, clod(nx, ny) * 0.8 + film(nx, ny) * 0.3);
        for (let k = 0; k < 3; k++) {
          let v = rubber[k] * (0.9 + g * 0.2);
          v += (dust[k] - v) * f;
          v += (mud[k] * (0.85 + g * 0.3) - v) * c * 0.9;
          img.data[p + k] = Math.max(0, Math.min(255, v));
        }
        img.data[p + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    TEX_CACHE.__tire = t;
    return t;
  }

  // Tấm chắn bùn cao su sau bánh (UV 0..1 trên mặt tấm, đỉnh ảnh = mép trên): màng bụi dày dần xuống dưới, lớp bùn
  // bánh hắt vón cục ở nửa dưới (mép răng cưa, lõi sát mép đáy còn ướt sẫm), vết bắn thưa dần lên trên, vệt bùn chảy dọc
  function getMudFlapTexture() {
    if (TEX_CACHE.__mudFlap) return TEX_CACHE.__mudFlap;
    if (typeof document === 'undefined') return null;
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(size, size);
    const film = makeFbm(4, 4, 401), clod = makeFbm(8, 3, 409), splat = makeFbm(24, 2, 419);
    const drip = makeFbm(32, 2, 431), grain = makeFbm(64, 2, 421);
    const rubber = [38, 37, 35], dust = [112, 99, 80], mud = [84, 68, 50], wet = [46, 38, 29];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const nx = x / size, ny = y / size, p = (y * size + x) * 4;
        const g = grain(nx, ny), c = clod(nx, ny);
        const f = Math.max(0, Math.min(0.75, 0.12 + 0.45 * ny * ny + (film(nx, ny) - 0.5) * 0.3));
        const crust = smooth01(-0.03, 0.03, ny - (0.6 + (0.5 - c) * 0.55));
        const wetK = smooth01(0.78, 0.95, ny + (c - 0.5) * 0.3);
        const sp = smooth01(0.66, 0.72, splat(nx, ny) + ny * 0.22 - 0.06);
        const dr = smooth01(0.6, 0.72, drip(nx, ny * 0.06)) * smooth01(0.2, 0.55, ny);
        for (let k = 0; k < 3; k++) {
          let v = rubber[k] * (0.9 + g * 0.2);
          v += (dust[k] - v) * f;
          v += (mud[k] * (0.85 + g * 0.3) - v) * Math.max(dr * 0.55, sp * 0.85);
          v += (mud[k] * (0.8 + g * 0.4) - v) * crust * 0.95;
          v += (wet[k] * (0.9 + g * 0.2) - v) * crust * wetK * 0.75;
          img.data[p + k] = Math.max(0, Math.min(255, v));
        }
        img.data[p + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(canvas);
    TEX_CACHE.__mudFlap = t;
    return t;
  }

  /**
   * Kính cabin chống đạn bám bụi (map + roughnessMap theo UV mặt hộp, 0..1 trên mỗi ô kính): kính dày tối, không
   * nhìn xuyên vào trong; đọc ra là mặt kính nhờ phản chiếu trời (getGlassEnvCube) + lớp bụi dày ở mép & đáy,
   * vệt mưa chảy dọc, lấm tấm bùn / xác côn trùng.
   * kind: 'windL' (kính chắn gió bên lái) | 'windR' (bên phụ, có vết đá văng nứt sao) | 'side' (kính cửa).
   * Kính chắn gió: cần gạt gốc ở góc dưới (u ≈ 0.15) quét cung sạch, mép cung dồn bụi thành gờ.
   * Màu ảnh đã chia cho màu vật liệu 0x606060 (để hệ hư hại vẫn nhận đây là kính tối, không phải kính đèn).
   */
  function getDirtyGlassTextures(kind) {
    const key = '__glass_' + kind;
    if (TEX_CACHE[key]) return TEX_CACHE[key];
    if (typeof document === 'undefined') return null;
    const wind = kind !== 'side';
    const size = wind ? 512 : 256, W = size;
    const mk = () => { const c = document.createElement('canvas'); c.width = c.height = size; return c; };
    const ic = mk(), cc = mk(), rc = mk();
    // --- Kính chống đạn dày nhiều lớp: tối, ngả xanh rêu, không nhìn xuyên vào cabin (màu thật, chưa chia) ---
    // dải tối hơn ở mép trên (dải chống chói), loang nhẹ do độ dày các lớp kính không đều
    const ix = ic.getContext('2d');
    const bg = ix.createLinearGradient(0, 0, 0, W);
    bg.addColorStop(0, 'rgb(9,12,11)');
    bg.addColorStop(wind ? 0.16 : 0.1, 'rgb(13,17,16)');
    bg.addColorStop(0.55, 'rgb(19,23,21)');
    bg.addColorStop(1, 'rgb(15,18,17)');
    ix.fillStyle = bg;
    ix.fillRect(0, 0, W, W);
    const inter = ix.getImageData(0, 0, W, W).data;

    // --- Bụi, vệt mưa, cung gạt nước, bùn bắn ---
    const cImg = cc.getContext('2d').createImageData(W, W), rImg = rc.getContext('2d').createImageData(W, W);
    const seed = kind === 'windL' ? 401 : kind === 'windR' ? 409 : 415;
    const blot = makeFbm(4, 4, seed), fine = makeFbm(32, 2, seed + 7), rain = makeFbm(64, 2, seed + 13);
    const rnd = mulberry32(seed + 31);
    const inv = 1 / 0.376;
    const tint = [0.82, 0.93, 1.0], dust = [92, 85, 70];
    // gạt nước (đơn vị mét-kính: ô 8.9 x 7): gốc dưới góc u = 0.15, lưỡi dài từ r 1.0 tới 5.8, quét 0..105°
    const PX = 0.15 * 8.9, PY = -0.35, R0 = 1.0, R1 = 5.8, AMAX = 1.83;
    for (let y = 0; y < W; y++) {
      for (let x = 0; x < W; x++) {
        const u = x / W, v = 1 - y / W, p = (y * W + x) * 4;
        const edge = Math.min(u, 1 - u, v, 1 - v);
        let d = 0.1 + blot(u, v) * 0.22 + (1 - smooth01(0, 0.13, edge)) * 0.42 + (1 - smooth01(0, 0.3, v)) * 0.2;
        d += (rain(u, v * 0.04) - 0.5) * 0.16 * smooth01(0.2, 0.9, v);
        if (wind) {
          const X = u * 8.9 - PX, Y = v * 7 - PY, r = Math.hypot(X, Y), a = Math.atan2(Y, X);
          const inR = smooth01(R0 - 0.06, R0 + 0.06, r) * (1 - smooth01(R1 - 0.08, R1 + 0.04, r));
          const inA = 1 - smooth01(AMAX - 0.02, AMAX + 0.02, a);
          const swept = inR * inA * (a > -0.15 ? 1 : 0);
          const arcs = 0.5 + 0.5 * Math.sin(r * 55 + fine(u, v) * 3);
          d = d * (1 - swept * 0.9) + swept * arcs * arcs * 0.06;
          // gờ bụi dồn ở mép cung quét
          const ridge = Math.exp(-Math.pow((r - R1 - 0.12) / 0.08, 2)) * inA + Math.exp(-Math.pow((a - AMAX - 0.035) / 0.025, 2)) * inR;
          d += ridge * 0.35 * (a > -0.15 ? 1 : 0);
        }
        d = Math.max(0, Math.min(0.95, d * (0.85 + fine(u, v) * 0.3)));
        const speck = rnd() < (v < 0.5 ? 0.0035 : 0.0012) ? 1 : 0;
        for (let k = 0; k < 3; k++) {
          let c = inter[p + k] * tint[k] + 4;
          c = c + (dust[k] - c) * d;
          if (speck) c = dust[k] * 0.62;
          cImg.data[p + k] = Math.min(255, c * inv);
        }
        cImg.data[p + 3] = 255;
        const rough = Math.min(255, (0.05 + d * 0.9 + speck * 0.5) * 255);
        rImg.data[p] = rImg.data[p + 1] = rImg.data[p + 2] = rough;
        rImg.data[p + 3] = 255;
      }
    }
    const cx = cc.getContext('2d'), rx = rc.getContext('2d');
    cx.putImageData(cImg, 0, 0);
    rx.putImageData(rImg, 0, 0);
    if (kind === 'windR') {
      // đá văng: nốt vỡ hình sao + một vết nứt dài bò ra mép kính
      const ox = W * 0.68, oy = W * 0.4;
      for (const [ctx, col, lw] of [[cx, 'rgba(235,245,245,0.85)', 1.6], [rx, 'rgba(120,120,120,1)', 2]]) {
        ctx.strokeStyle = col;
        ctx.lineWidth = lw;
        const rr2 = mulberry32(77);
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * Math.PI * 2 + rr2() * 0.4, l = W * (0.012 + rr2() * 0.03);
          ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox + Math.cos(a) * l, oy + Math.sin(a) * l); ctx.stroke();
        }
        ctx.beginPath();
        ctx.moveTo(ox, oy);
        let px = ox, py = oy;
        while (px < W) { px += W * (0.02 + rr2() * 0.03); py += W * (rr2() - 0.35) * 0.03; ctx.lineTo(px, py); }
        ctx.stroke();
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(ox, oy, W * 0.007, 0, Math.PI * 2); ctx.fill();
      }
    }
    const tex = (c) => { const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t; };
    TEX_CACHE[key] = { map: tex(cc), roughnessMap: tex(rc) };
    return TEX_CACHE[key];
  }

  // Kính đèn pha tròn: chóa phản quang sáng sau lớp kính khía rãnh (khía dọc + dải lăng kính ngang), chụp che
  // bóng ở giữa, bụi bám nửa dưới, lấm tấm bùn; cracked = vỡ nứt một góc
  function getHeadlampTexture(cracked) {
    const key = cracked ? '__lampC' : '__lamp';
    if (TEX_CACHE[key]) return TEX_CACHE[key];
    if (typeof document === 'undefined') return null;
    const S = 128;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(S, S);
    const film = makeFbm(4, 3, cracked ? 501 : 503), rnd = mulberry32(cracked ? 511 : 513);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const u = x / S - 0.5, v = 0.5 - y / S, r = Math.hypot(u, v) * 2, p = (y * S + x) * 4;
        let b = 228 - r * 70;                                    // chóa sáng giữa, tối dần ra viền
        b += Math.sin(u * 2 * Math.PI * 14) * 10;                // khía dọc
        b += Math.abs(v) < 0.08 ? 14 * Math.cos(v * 40) : 0;     // dải lăng kính ngang
        b -= r > 0.88 ? (r - 0.88) * 600 : 0;                    // gờ viền tối
        const cap = 1 - smooth01(0.1, 0.14, r);
        b = b * (1 - cap) + 120 * cap;                           // chụp che bóng
        const d = Math.max(0, Math.min(0.75, (0.25 - v) * 0.9 + (film(u + 0.5, v + 0.5) - 0.5) * 0.5));
        const col = [b * 0.99, b * 0.98, b * 0.9];
        const dc = [128, 114, 90];
        const sp = rnd() < 0.006 * (v < 0 ? 3 : 1);
        for (let k = 0; k < 3; k++) img.data[p + k] = Math.max(0, Math.min(255, sp ? dc[k] * 0.6 : col[k] + (dc[k] - col[k]) * d));
        img.data[p + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    if (cracked) {
      ctx.strokeStyle = 'rgba(40,40,36,0.9)';
      ctx.lineWidth = 1.2;
      const r2 = mulberry32(91);
      const ox = S * 0.7, oy = S * 0.3;
      for (let i = 0; i < 6; i++) {
        let px = ox, py = oy;
        ctx.beginPath(); ctx.moveTo(px, py);
        const a = r2() * Math.PI * 2;
        for (let k = 0; k < 5; k++) { px += Math.cos(a + (r2() - 0.5)) * S * 0.07; py += Math.sin(a + (r2() - 0.5)) * S * 0.07; ctx.lineTo(px, py); }
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(30,30,28,0.9)';
      ctx.beginPath(); ctx.moveTo(ox - 5, oy - 3); ctx.lineTo(ox + 6, oy - 5); ctx.lineTo(ox + 3, oy + 6); ctx.closePath(); ctx.fill();
    }
    TEX_CACHE[key] = new THREE.CanvasTexture(c);
    return TEX_CACHE[key];
  }

  /**
   * Bầu trời phản chiếu riêng cho kính cửa / gương: trời có mây mờ, dải đồi xa sẫm ở chân trời, mặt đất nâu.
   * Kính tối phản chiếu được đường chân trời -> đọc ra là mặt kính nghiêng thật, không phải mảng màu phẳng.
   */
  function getGlassEnvCube() {
    if (TEX_CACHE.__genv) return TEX_CACHE.__genv;
    if (typeof document === 'undefined') return null;
    const size = 128;
    const ridge = makeFbm(4, 4, 601), cloud = makeFbm(4, 4, 607);
    const side = document.createElement('canvas');
    side.width = side.height = size;
    const ctx = side.getContext('2d');
    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size, v = 1 - y / size, p = (y * size + x) * 4;   // v 0.5 = chân trời
        let col;
        if (v >= 0.5) {
          const h = (v - 0.5) * 2;
          const sky = [138 + 40 * (1 - h), 156 + 30 * (1 - h), 176 + 12 * (1 - h)];
          const cl = smooth01(0.5, 0.75, cloud(u, h * 0.5)) * (1 - h * 0.6);
          col = sky.map(c => c + (205 - c) * cl * 0.7);
          const rh = 0.5 + 0.06 * ridge(u, 0.1);                          // dải đồi xa
          if (v < rh) col = [78, 82, 72];
        } else {
          const g = Math.min(1, (0.5 - v) * 6);
          col = [120 - 50 * g, 112 - 50 * g, 96 - 46 * g];
        }
        img.data[p] = col[0]; img.data[p + 1] = col[1]; img.data[p + 2] = col[2]; img.data[p + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const flat = (r, g, b) => {
      const c = document.createElement('canvas');
      c.width = c.height = size;   // mọi mặt cube map phải cùng cỡ, lệch cỡ -> texture không hợp lệ (đen)
      const x = c.getContext('2d');
      x.fillStyle = `rgb(${r},${g},${b})`;
      x.fillRect(0, 0, size, size);
      return c;
    };
    const tex = new THREE.CubeTexture([side, side, flat(140, 158, 178), flat(66, 60, 50), side, side]);
    tex.needsUpdate = true;
    TEX_CACHE.__genv = tex;
    return tex;
  }

  /**
   * Bầu trời phản chiếu dùng chung (cube map vẽ canvas, có mipmap): trời xám xanh ở đỉnh, chân trời mờ
   * hơi ấm, mặt đất nâu tối. MeshStandardMaterial lấy mip theo độ nhám -> thép / kính / mép sơn mòn bắt
   * ánh trời nhạt, mặt ngửa sáng hơn mặt úp; kính cửa ánh trời thay vì đen đặc. Cường độ đặt thấp
   * từng vật liệu để không làm xe sáng hơn cảnh.
   */
  function getEnvCube() {
    if (TEX_CACHE.__env) return TEX_CACHE.__env;
    if (typeof document === 'undefined') return null;
    const size = 64;
    const sky = [150, 168, 182], horizon = [176, 172, 160], ground = [62, 56, 46];
    const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    // Màu theo cao độ hướng nhìn (dy: -1 đất .. 1 thiên đỉnh)
    const colorAt = (dy) => {
      if (dy >= 0) return lerp3(horizon, sky, Math.pow(Math.min(1, dy * 1.6), 0.7));
      return lerp3(horizon, ground, Math.min(1, Math.pow(-dy * 5, 0.6)));
    };
    const face = (fn) => {
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const ctx = c.getContext('2d');
      const img = ctx.createImageData(size, size);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const u = (x + 0.5) / size * 2 - 1, v = (y + 0.5) / size * 2 - 1;
          const col = colorAt(fn(u, v));
          const p = (y * size + x) * 4;
          img.data[p] = col[0]; img.data[p + 1] = col[1]; img.data[p + 2] = col[2]; img.data[p + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      return c;
    };
    // Mặt bên: hàng trên ảnh = +Y. dy = thành phần Y của hướng chuẩn hóa
    const side = face((u, v) => -v / Math.hypot(1, u, v));
    const top = face(() => 1), bottom = face(() => -1);
    const tex = new THREE.CubeTexture([side, side, top, bottom, side, side]);
    tex.needsUpdate = true;
    TEX_CACHE.__env = tex;
    return tex;
  }

  // ---------------------------------------------------------------------------
  // BỘ VẬT LIỆU PBR CHUẨN CHO MỘT XE (mỗi xe một bộ riêng vì hiệu ứng tàng hình
  // và màu xác cháy chỉnh trực tiếp lên vật liệu)
  // ---------------------------------------------------------------------------
  // opts.battle (0..1): bật lớp vết chiến trường (bùn văng, muội, dầu, xước, lỗ mảnh, gỉ) + lốp bám bùn, kính bụi,
  // khung gầm sẫm cũng nhận bụi bùn. Mỗi xe lệch texture vết một đoạn ngẫu nhiên -> không xe nào giống xe nào.
  // Vẻ ngoài riêng của từng xe (mảng hao mòn, số hiệu, vị trí vết chiến trường, chữ tróc sơn...) gieo từ unit.lookSeed:
  // dựng lại mô hình (đổi trang bị ở phòng xem xe) vẫn ra đúng chiếc xe cũ. Xe chưa có hạt giống thì gieo một lần, giữ lại
  function lookSeed(unit) {
    if (unit.lookSeed == null) unit.lookSeed = (Math.random() * 1e9) | 0;
    return unit.lookSeed;
  }
  const lookRng = (unit, salt = 0) => mulberry32((lookSeed(unit) + salt) | 0);

  // opts.seed: hạt giống vẻ ngoài của xe (lookSeed) -> lớp vết chiến trường lệch cố định, dựng lại không đổi
  function createMaterials(team, opts = {}) {
    const isBlue = team === 'BLUE';
    const paint = getPaintTextures(isBlue ? 'WOODLAND' : 'DESERT');
    const grimeTex = getGrimeTexture();
    const weather = getWeatherTexture();
    const battleTex = opts.battle ? getBattleTextures() : null;
    const battle = battleTex ? {
      tex: battleTex,
      amount: opts.battle,
      offset: (() => { const r = mulberry32(opts.seed != null ? (opts.seed ^ 0x5bd1e995) : (Math.random() * 1e9) | 0); return new THREE.Vector2(r(), r()); })()
    } : null;

    const paintMat = (tint) => {
      const m = new THREE.MeshStandardMaterial({
        color: tint,
        map: paint ? paint.map : null,
        roughnessMap: paint ? paint.roughnessMap : null,
        bumpMap: paint ? paint.bumpMap : null,
        bumpScale: 0.035,
        roughness: 1.0,
        metalness: 0.05,
        vertexColors: true
      });
      m.userData.boxUV = true;
      m.userData.baseColor = tint;
      if (paint) patchPaintMaterial(m, paint.dust, weather, battle);
      return m;
    };

    const mats = {
      // Giáp sơn ngụy trang chính
      paint: paintMat(0xffffff),
      // Sơn phủ bụi đất (bánh xe, gầm, váy xích)
      paintDusty: paintMat(0xd2c6ae),
      // Mặt trong / khe tối (lưới tản nhiệt, khoang sâu)
      dark: new THREE.MeshStandardMaterial({ color: 0x23241f, roughness: 0.85, metalness: 0.2 }),
      // Thép trần mài mòn (chốt xích, miệng nòng, vành bánh). Không có envMap nên kim loại quá cao
      // sẽ đen sì -> để bán kim loại, xám ngả nâu như thép dầu mỡ ngoài trời
      steel: new THREE.MeshStandardMaterial({ color: 0x6b675f, roughness: 0.5, metalness: 0.5 }),
      // Mắt xích thép đúc bám bùn, gỉ nhẹ
      track: new THREE.MeshStandardMaterial({
        color: 0x3f3832, map: grimeTex, roughness: 0.86, metalness: 0.35
      }),
      // Cao su đen vành bánh / đệm xích
      rubber: new THREE.MeshStandardMaterial({ color: 0x1c1b19, map: grimeTex, roughness: 0.95, metalness: 0.0 }),
      // Kính quang học phủ màng chống phản xạ
      // (tối như kính thật, chỉ ánh xanh nhẹ; trước đây tự phát sáng xanh lơ trông như đồ chơi)
      glass: new THREE.MeshStandardMaterial({
        color: 0x1a2327, roughness: 0.12, metalness: 0.35, emissive: 0x0b1f27, emissiveIntensity: 0.18
      }),
      // Kính đèn pha
      lens: new THREE.MeshStandardMaterial({
        color: 0xcfcab4, roughness: 0.15, metalness: 0.2, emissive: 0x3a3424, emissiveIntensity: 0.4
      }),
      // Đèn hậu
      tailLens: new THREE.MeshStandardMaterial({
        color: 0x5c0f0b, roughness: 0.2, metalness: 0.1, emissive: 0x4a0604, emissiveIntensity: 0.6
      }),
      // Bạt vải / túi đồ dã chiến
      // (vân sợi vải + nếp nhăn từ texture nhiễu; màu nâng nhẹ bù độ tối của texture)
      canvas: new THREE.MeshStandardMaterial({ color: isBlue ? 0x67664c : 0xa58e68, map: grimeTex, roughness: 0.97, metalness: 0.0 }),
      canvasDark: new THREE.MeshStandardMaterial({ color: isBlue ? 0x4a4a38 : 0x806c4d, map: grimeTex, roughness: 0.97, metalness: 0.0 }),
      // Tấm vải nhận diện phe trên nóc tháp (nhìn rõ từ camera trên cao)
      // vải nhận diện kiểu VS-17 (2 mặt huỳnh quang thật): phe xanh trải mặt cam, phe đỏ trải mặt hồng cerise — chói từ trên
      // không, đã bạc nắng (lớp phong hoá bên dưới)
      idPanel: new THREE.MeshStandardMaterial({
        color: isBlue ? 0xe0622a : 0xc94a7c,
        emissive: isBlue ? 0x4a1606 : 0x3e0a22,
        emissiveIntensity: 0.22,
        roughness: 0.95,
        metalness: 0.0
      })
    };
    // Phản chiếu bầu trời: kim loại & kính mạnh, sơn mờ chỉ chút ít (mép mòn, mặt ngửa)
    const env = getEnvCube();
    if (env) {
      const envK = { paint: 0.3, paintDusty: 0.22, dark: 0.25, steel: 0.85, track: 0.35, rubber: 0.15, glass: 1.0, lens: 0.8, tailLens: 0.6 };
      for (const k in envK) {
        mats[k].envMap = env;
        mats[k].envMapIntensity = envK[k];
      }
      // Có trời để phản chiếu -> thép trần được phép kim loại thật hơn (trước đây 0.5 để khỏi đen sì)
      mats.steel.metalness = 0.72;
      mats.steel.roughness = 0.42;
    }
    if (battle && paint) {
      // Thép sơn sẫm (khung gầm, cầu xe, giá đỡ) cũng ăn bụi bùn như phần sơn: dùng vân bẩn xám làm map
      // (độ sáng trung bình ~0.78 -> nâng màu bù lại)
      const dark = new THREE.MeshStandardMaterial({ color: 0x2d2e28, map: grimeTex, roughness: 0.85, metalness: 0.2, vertexColors: true });
      dark.userData.boxUV = true;
      dark.userData.baseColor = 0x2d2e28;
      patchPaintMaterial(dark, paint.dust, weather, battle);
      dark.envMap = mats.dark.envMap;
      dark.envMapIntensity = mats.dark.envMapIntensity;
      mats.dark = dark;
      // Thép trần ngoài thực địa: xỉn, dầu mỡ bám bụi, không sáng bóng
      mats.steel.color.setHex(0x57534b);
      mats.steel.roughness = 0.62;
      mats.steel.metalness = 0.6;
      // Lốp bám bùn khô; màu đỉnh (tireGeometry) làm tối rãnh gai / chân gai. Mọi hình gộp chung mesh với vật liệu
      // này phải có thuộc tính color -> chỉ dùng cho hình từ tireGeometry
      mats.tire = new THREE.MeshStandardMaterial({ color: 0xffffff, map: getTireTexture(), roughness: 0.92, metalness: 0.0, vertexColors: true });
      mats.tire.userData.surface = 'rubber';
      // Tấm chắn bùn cao su bám bùn bánh hắt (hình hộp mỏng không vát: UV 0..1 mỗi mặt)
      mats.mudFlap = new THREE.MeshStandardMaterial({ color: 0xffffff, map: getMudFlapTexture(), roughness: 0.95, metalness: 0.0 });
      mats.mudFlap.userData.surface = 'rubber';
      // Kính cabin bụi bám, kính chắn gió có cung gạt nước
      const genv = getGlassEnvCube();
      for (const [k, kind] of [['glassWindL', 'windL'], ['glassWindR', 'windR'], ['glassDusty', 'side']]) {
        const t = getDirtyGlassTextures(kind);
        const g = mats.glass.clone();
        g.color.setHex(0x606060);
        g.map = t.map;
        g.roughnessMap = t.roughnessMap;
        g.roughness = 1.0;
        g.metalness = 0.2;
        g.emissiveIntensity = 0.06;
        if (genv) { g.envMap = genv; g.envMapIntensity = 1.0; }
        g.userData = { surface: 'glass', windowGlass: true };
        mats[k] = g;
      }
      mats.glassWind = mats.glassWindL;
      // KÍNH QUANG HỌC trên kính ngắm / camera (khác kính cửa & chóa đèn): ô kính ngày phủ màng chống lóa — sẫm, ánh xanh tím
      // khi bắt trời, bụi phủ mép dưới; cửa sổ ảnh nhiệt bằng germani — xám đen bóng như gương, không trong; ô đo xa laser —
      // kính lọc hổ phách sẫm. Trước đây ô ảnh nhiệt / đo xa dùng chóa đèn pha (kem, tự phát sáng) -> đĩa trắng như mắt nhựa
      {
        const t = getDirtyGlassTextures('side');
        mats.optic = new THREE.MeshStandardMaterial({ color: 0x3d4a52, map: t.map, roughnessMap: t.roughnessMap, roughness: 0.75, metalness: 0.3,
          emissive: 0x0a1418, emissiveIntensity: 0.25, envMap: genv, envMapIntensity: 1.3 });
        mats.thermalWin = new THREE.MeshStandardMaterial({ color: 0x26282a, roughnessMap: t.roughnessMap, roughness: 0.6, metalness: 0.75,
          envMap: genv, envMapIntensity: 1.1 });
        mats.laserWin = new THREE.MeshStandardMaterial({ color: 0x3a2412, roughness: 0.22, metalness: 0.35, emissive: 0x140802, emissiveIntensity: 0.4,
          envMap: genv, envMapIntensity: 0.9 });
        for (const k of ['optic', 'thermalWin', 'laserWin']) mats[k].userData.surface = 'glass';
      }
      // Kính đèn pha (trái nứt), kính xi-nhan hổ phách, gương chiếu hậu tráng bạc
      for (const [k, cracked] of [['headLensL', true], ['headLensR', false]]) {
        mats[k] = new THREE.MeshStandardMaterial({
          color: 0xffffff, map: getHeadlampTexture(cracked), roughness: 0.2, metalness: 0.15,
          emissive: 0x2a261c, emissiveIntensity: 0.3, envMap: genv, envMapIntensity: 0.7
        });
        mats[k].userData.surface = 'glass';
      }
      mats.amberLens = new THREE.MeshStandardMaterial({ color: 0xc8861f, roughness: 0.28, metalness: 0.1, emissive: 0x3a1e04, emissiveIntensity: 0.45, envMap: genv, envMapIntensity: 0.6 });
      mats.amberLens.userData.surface = 'glass';
      mats.mirror = new THREE.MeshStandardMaterial({ color: 0x9da3a4, roughness: 0.14, metalness: 1.0, envMap: genv, envMapIntensity: 1.0 });
      mats.mirror.userData.surface = 'glass';
      // cáp thép bện: sẫm, bóng mỡ, đất bám kẽ bện, gỉ loang (dùng với VehicleKit.cable)
      mats.cable = dirtyMaterial(new THREE.MeshStandardMaterial({ color: 0x3b3934, roughness: 0.5, metalness: 0.6, envMap: env, envMapIntensity: 0.55 }), 0.45, { rust: 0.75 });
      // thép mài sáng (lưỡi cắt lưỡi ủi, mép cọ xát liên tục) · thép trần trầy xước gỉ (mặt lưỡi ủi bị đất đá mài trơ sơn)
      mats.steelWorn = new THREE.MeshStandardMaterial({ color: 0x8f8b82, roughness: 0.3, metalness: 0.85, envMap: env, envMapIntensity: 0.9 });
      mats.scraped = dirtyMaterial(new THREE.MeshStandardMaterial({ color: 0x5f5c55, roughness: 0.6, metalness: 0.55, envMap: env, envMapIntensity: 0.5 }), 0.5, { rust: 0.85 });
      // bùn đất vón bám (màu theo bản đồ qua lớp đất của dirtyMaterial)
      mats.mud = dirtyMaterial(new THREE.MeshStandardMaterial({ color: 0x3a3226, roughness: 0.95, metalness: 0 }), 1.0);
      for (const k of ['cable', 'steelWorn', 'scraped']) mats[k].userData.surface = 'metal';
      // Muội đen (miệng ống xả, loa hãm lùi cháy sém), gỗ thùng đạn / chèn bánh
      mats.soot = new THREE.MeshStandardMaterial({ color: 0x9a948c, map: grimeTex, roughness: 0.98, metalness: 0.1 });
      mats.soot.color.multiplyScalar(0.3);
      mats.wood = new THREE.MeshStandardMaterial({ color: isBlue ? 0x6a5a44 : 0x7a6649, map: grimeTex, roughness: 0.93, metalness: 0.0 });
      mats.wood.userData.surface = 'cloth';   // gỗ: trúng đạn không tóe lửa, không nảy
    }
    // tấm vải nhận diện đã phơi nắng gió: bạc màu, bụi bám, loang ố (vẫn đủ đậm để nhận ra phe từ trên cao)
    if (typeof Weathering !== 'undefined') {
      Weathering.apply(mats.idPanel, 'card', { grime: 0, fade: 0.6, stain: 0.75, dust: 0.7, streak: 0.2, moss: 0, vary: 0, scale: 2.5 });
      mats.idPanel.emissiveIntensity = 0.12;
    }
    mats.glass.userData.surface = 'glass';
    mats.glass.userData.windowGlass = true;   // kính cửa / kính chắn gió (khác kính đèn, ống ngắm)
    mats.lens.userData.surface = 'glass';
    mats.tailLens.userData.surface = 'glass';
    mats.rubber.userData.surface = 'rubber';
    mats.canvas.userData.surface = 'cloth';
    mats.canvasDark.userData.surface = 'cloth';
    return mats;
  }

  // ---------------------------------------------------------------------------
  // HÌNH HỌC
  // ---------------------------------------------------------------------------
  // Chiếu UV theo trục pháp tuyến trội (box/triplanar) để vân sơn liền mạch giữa các khối
  function applyBoxUV(geo, scale = UV_SCALE) {
    const pos = geo.attributes.position;
    const nrm = geo.attributes.normal;
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const ax = Math.abs(nrm.getX(i)), ay = Math.abs(nrm.getY(i)), az = Math.abs(nrm.getZ(i));
      let u, v;
      if (ax >= ay && ax >= az) { u = z; v = y; }
      else if (ay >= az) { u = x; v = z; }
      else { u = x; v = y; }
      uv[i * 2] = u * scale;
      uv[i * 2 + 1] = v * scale;
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  }

  // Dữ liệu thời tiết theo đỉnh cho shader sơn (patchPaintMaterial), ghi vào vertex color:
  // R = che khuất (gầm tối dần, mặt úp xuống tối hơn), G = độ cao trên mặt đất (0 sát đất .. 1 từ ~1.8 m),
  // B = mức ngửa lên trời (bụi đọng trên mặt ngang)
  function applyGroundGrime(geo, yBase) {
    const pos = geo.attributes.position;
    const nrm = geo.attributes.normal;
    const col = new Float32Array(pos.count * 3);
    // Che khuất tiếp xúc: chân mỗi chi tiết (chỗ tì lên giáp) tối dần lên trên -> chi tiết "ngồi" trên
    // thân xe chứ không như dán nổi. Dải che khuất theo chiều cao chi tiết, tối đa ~0.3 m.
    let yMin = Infinity, yMax = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y < yMin) yMin = y;
      if (y > yMax) yMax = y;
    }
    const band = Math.max(0.05, Math.min(yMax - yMin, 2.4) * 0.9);
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) + yBase;
      let k = Math.max(0, Math.min(1, (y - 1.5) / 12.5));
      k = k * k * (3 - 2 * k);
      const ny = nrm.getY(i);
      const under = ny < -0.5 ? 0.8 : 1.0;
      const c = Math.min(1, (pos.getY(i) - yMin) / band);
      const contact = 0.66 + 0.34 * Math.sqrt(c);
      col[i * 3] = (0.72 + 0.28 * k) * under * contact;
      col[i * 3 + 1] = k;
      col[i * 3 + 2] = ny > 0.55 ? Math.min(1, (ny - 0.55) / 0.35) : 0;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }

  // Gộp nhiều BufferGeometry không đánh chỉ số (position + normal + uv [+ color])
  function mergeGeometries(geos) {
    let total = 0;
    for (const g of geos) total += g.attributes.position.count;
    const pos = new Float32Array(total * 3);
    const nrm = new Float32Array(total * 3);
    const uv = new Float32Array(total * 2);
    const hasColor = geos.every(g => g.attributes.color);
    const col = hasColor ? new Float32Array(total * 3) : null;
    let o = 0;
    for (const g of geos) {
      const n = g.attributes.position.count;
      pos.set(g.attributes.position.array.subarray(0, n * 3), o * 3);
      nrm.set(g.attributes.normal.array.subarray(0, n * 3), o * 3);
      if (g.attributes.uv) uv.set(g.attributes.uv.array.subarray(0, n * 2), o * 2);
      if (col) col.set(g.attributes.color.array.subarray(0, n * 3), o * 3);
      o += n;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.computeBoundingSphere();
    out.computeBoundingBox();
    return out;
  }

  /**
   * Khoảng cách tới cạnh sắc cho shader mòn mép sơn. Với mỗi tam giác, cạnh nào là mép giáp thật
   * (2 mặt kề gập > ~35° hoặc cạnh hở) thì ghi độ cao tam giác hạ từ đỉnh đối diện; nội suy tuyến tính
   * trong tam giác cho đúng khoảng cách (đơn vị thế giới) từ điểm vẽ tới cạnh đó. Cạnh chéo của mặt phẳng
   * (2 tam giác đồng phẳng) không tính -> không lộ đường chéo. Thuộc tính vec4 edgeD (w = 0: hợp lệ).
   * Xe cùng loại có hình học y hệt -> lưu đệm theo chữ ký hình học để 20 xe chỉ tính vài lần.
   */
  const EDGE_CACHE = new Map();
  const EDGE_COS = Math.cos(35 * Math.PI / 180);
  function computeEdgeWear(geo) {
    const pos = geo.attributes.position.array;
    const nV = geo.attributes.position.count, nT = Math.floor(nV / 3);
    if (!nT) return;
    let sig = nV;
    for (let i = 0; i < pos.length; i += 7) sig = (sig * 31 + Math.round(pos[i] * 64)) % 2147483647;
    const key = nV + ':' + sig;
    let out = EDGE_CACHE.get(key);
    if (!out) {
      // Hàn đỉnh trùng vị trí (lưới 1/64 đơn vị) -> id số
      const vid = new Int32Array(nV);
      const weld = new Map();
      let nextId = 0;
      for (let i = 0; i < nV; i++) {
        const x = Math.round(pos[i * 3] * 64), y = Math.round(pos[i * 3 + 1] * 64), z = Math.round(pos[i * 3 + 2] * 64);
        const k = x + ',' + y + ',' + z;
        let id = weld.get(k);
        if (id === undefined) { id = nextId++; weld.set(k, id); }
        vid[i] = id;
      }
      // Pháp tuyến mặt
      const fn = new Float32Array(nT * 3);
      for (let t = 0; t < nT; t++) {
        const a = t * 9;
        const ux = pos[a + 3] - pos[a], uy = pos[a + 4] - pos[a + 1], uz = pos[a + 5] - pos[a + 2];
        const vx = pos[a + 6] - pos[a], vy = pos[a + 7] - pos[a + 1], vz = pos[a + 8] - pos[a + 2];
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const l = Math.hypot(nx, ny, nz) || 1;
        fn[t * 3] = nx / l; fn[t * 3 + 1] = ny / l; fn[t * 3 + 2] = nz / l;
      }
      // Gom các tam giác theo cạnh (cạnh e đối diện đỉnh e)
      const edges = new Map();
      const sharp = new Uint8Array(nT * 3).fill(1);
      for (let t = 0; t < nT; t++) {
        for (let e = 0; e < 3; e++) {
          const a = vid[t * 3 + (e + 1) % 3], b = vid[t * 3 + (e + 2) % 3];
          if (a === b) { sharp[t * 3 + e] = 0; continue; }
          const k = a < b ? a * 4194304 + b : b * 4194304 + a;
          const list = edges.get(k);
          if (list) list.push(t * 3 + e); else edges.set(k, [t * 3 + e]);
        }
      }
      for (const list of edges.values()) {
        if (list.length < 2) continue;
        for (let i = 0; i < list.length; i++) {
          const ti = (list[i] / 3) | 0;
          for (let j = 0; j < list.length; j++) {
            if (i === j) continue;
            const tj = (list[j] / 3) | 0;
            const d = fn[ti * 3] * fn[tj * 3] + fn[ti * 3 + 1] * fn[tj * 3 + 1] + fn[ti * 3 + 2] * fn[tj * 3 + 2];
            if (d >= EDGE_COS) { sharp[list[i]] = 0; break; }
          }
        }
      }
      out = new Float32Array(nV * 4);
      const FAR = 1000;
      for (let t = 0; t < nT; t++) {
        const a = t * 9;
        const P = (k, c) => pos[a + k * 3 + c];
        const ux = P(1, 0) - P(0, 0), uy = P(1, 1) - P(0, 1), uz = P(1, 2) - P(0, 2);
        const vx = P(2, 0) - P(0, 0), vy = P(2, 1) - P(0, 1), vz = P(2, 2) - P(0, 2);
        const area2 = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
        for (let e = 0; e < 3; e++) {
          const p = (e + 1) % 3, q = (e + 2) % 3;
          const len = Math.hypot(P(p, 0) - P(q, 0), P(p, 1) - P(q, 1), P(p, 2) - P(q, 2)) || 1;
          const alt = area2 / len;
          for (let k = 0; k < 3; k++) {
            out[(t * 3 + k) * 4 + e] = sharp[t * 3 + e] ? (k === e ? alt : 0) : FAR;
          }
        }
        for (let k = 0; k < 3; k++) out[(t * 3 + k) * 4 + 3] = 0;
      }
      if (EDGE_CACHE.size > 64) EDGE_CACHE.clear();
      EDGE_CACHE.set(key, out);
    }
    geo.setAttribute('edgeD', new THREE.BufferAttribute(out, 4));
  }

  const _m4 = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _e = new THREE.Euler();
  const _v = new THREE.Vector3();
  const _s = new THREE.Vector3();

  function makeMatrix(pos, rot, scale) {
    _e.set(rot ? rot[0] : 0, rot ? rot[1] : 0, rot ? rot[2] : 0, (rot && rot[3]) || 'XYZ');
    _q.setFromEuler(_e);
    _v.set(pos ? pos[0] : 0, pos ? pos[1] : 0, pos ? pos[2] : 0);
    if (typeof scale === 'number') _s.set(scale, scale, scale);
    else if (scale) _s.set(scale[0], scale[1], scale[2]);
    else _s.set(1, 1, 1);
    return _m4.compose(_v, _q, _s);
  }

  // Vị trí giữa + góc Euler để trục Y của khối hướng từ p0 tới p1
  const _up = new THREE.Vector3(0, 1, 0);
  function orientBetween(p0, p1) {
    const d = new THREE.Vector3(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
    const len = d.length();
    const q = new THREE.Quaternion().setFromUnitVectors(_up, d.clone().normalize());
    const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
    return {
      len,
      pos: [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2],
      rot: [e.x, e.y, e.z]
    };
  }

  // Điểm trên đường cong Bézier bậc 2
  function bezier3(p0, p1, p2, t) {
    const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
    return [0, 1, 2].map(k => a * p0[k] + b * p1[k] + c * p2[k]);
  }

  /**
   * Khối hộp vát cạnh 45° (chamfer): thép tấm thật luôn có mép mài / mối hàn bo, không vuông sắc như khối CAD.
   * Dải vát nhỏ bắt sáng thành viền mảnh dọc mọi cạnh -> khối đọc rõ hình, hết vẻ "đồ chơi khối hộp".
   * Kích thước ngoài giữ đúng w × h × d (vát ăn vào trong). Pháp tuyến phẳng từng mặt (non-indexed).
   */
  function chamferBoxGeometry(w, h, d, bevel) {
    const hx = w / 2, hy = h / 2, hz = d / 2;
    const b = Math.min(bevel, hx * 0.45, hy * 0.45, hz * 0.45);
    const verts = [];
    // 3 đỉnh ở mỗi góc (sx, sy, sz): nằm trên mặt X, mặt Y, mặt Z
    const PX = (sx, sy, sz) => [sx * hx, sy * (hy - b), sz * (hz - b)];
    const PY = (sx, sy, sz) => [sx * (hx - b), sy * hy, sz * (hz - b)];
    const PZ = (sx, sy, sz) => [sx * (hx - b), sy * (hy - b), sz * hz];
    const quad = (a, bq, c, dq) => {
      const out = [(a[0] + bq[0] + c[0] + dq[0]) / 4, (a[1] + bq[1] + c[1] + dq[1]) / 4, (a[2] + bq[2] + c[2] + dq[2]) / 4];
      pushTri(verts, a, bq, c, out);
      pushTri(verts, a, c, dq, out);
    };
    const S = [-1, 1];
    for (const s of S) {
      quad(PX(s, -1, -1), PX(s, 1, -1), PX(s, 1, 1), PX(s, -1, 1));
      quad(PY(-1, s, -1), PY(1, s, -1), PY(1, s, 1), PY(-1, s, 1));
      quad(PZ(-1, -1, s), PZ(1, -1, s), PZ(1, 1, s), PZ(-1, 1, s));
    }
    for (const s of S) {
      for (const t of S) {
        quad(PY(-1, s, t), PY(1, s, t), PZ(1, s, t), PZ(-1, s, t));   // cạnh dọc trục X
        quad(PX(s, -1, t), PX(s, 1, t), PZ(s, 1, t), PZ(s, -1, t));   // cạnh dọc trục Y
        quad(PX(s, t, -1), PX(s, t, 1), PY(s, t, 1), PY(s, t, -1));   // cạnh dọc trục Z
        for (const u of S) {
          const a = PX(s, t, u), c = PY(s, t, u), e = PZ(s, t, u);
          pushTri(verts, a, c, e, [s, t, u]);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.computeVertexNormals();
    return g;
  }

  /**
   * Trụ tròn (trục Y, đỉnh +Y bán kính rTop) thay cho CylinderGeometry:
   * - mép hai mặt đầu vát nhỏ (bevel > 0) -> vành sáng mảnh như ống thép tiện / bánh đúc thật
   * - UV trụ liên tục theo chu vi (đơn vị thế giới × UV_SCALE): vân ngụy trang quấn quanh ống
   *   thay vì vỡ thành ô vuông như chiếu hộp; mặt đầu chiếu phẳng
   * Pháp tuyến mượt quanh chu vi, gãy ở mép vát. Hình học không đánh chỉ số, uv.userData.custom = true.
   */
  function roundCylGeometry(rTop, rBottom, len, seg, bevel = 0, open = false) {
    const h = len / 2;
    const b = Math.min(bevel, Math.min(rTop, rBottom) * 0.3, len * 0.2);
    // Mặt cắt dọc (r, y) từ đáy lên đỉnh
    const prof = b > 0.001
      ? [[rBottom - b, -h], [rBottom, -h + b], [rTop, h - b], [rTop - b, h]]
      : [[rBottom, -h], [rTop, h]];
    const g = revolveProfile(prof, seg, (rTop + rBottom) / 2);
    if (!open) {
      const pos = Array.from(g.attributes.position.array), nrm = Array.from(g.attributes.normal.array), uv = Array.from(g.attributes.uv.array);
      const ring = (i) => { const a = (i / seg) * Math.PI * 2; return [Math.sin(a), Math.cos(a)]; };
      for (const [r, y, ny] of [[prof[prof.length - 1][0], h, 1], [prof[0][0], -h, -1]]) {
        if (r <= 0.0001) continue;
        for (let i = 0; i < seg; i++) {
          const A = ring(i), B = ring(i + 1);
          const pts = ny > 0 ? [[0, 0], [A[0] * r, A[1] * r], [B[0] * r, B[1] * r]] : [[0, 0], [B[0] * r, B[1] * r], [A[0] * r, A[1] * r]];
          for (const p of pts) {
            pos.push(p[0], y, p[1]);
            nrm.push(0, ny, 0);
            uv.push(p[0] * UV_SCALE, p[1] * UV_SCALE);
          }
        }
      }
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    }
    return g;
  }

  /**
   * Mặt tròn xoay quanh trục Y từ mặt cắt dọc prof = [[r, y], ...]. Đi theo chiều y tăng -> mặt hướng ra ngoài;
   * đi ngược (y giảm) -> mặt hướng vào trục (lòng ống); đi ngang r giảm -> mặt hướng +Y. Pháp tuyến phẳng từng
   * đoạn (mép vát sắc), mượt quanh chu vi. rAvg: bán kính quy đổi UV theo chu vi.
   */
  function revolveProfile(prof, seg, rAvg) {
    const pos = [], nrm = [], uv = [];
    const ring = (i) => { const a = (i / seg) * Math.PI * 2; return [Math.sin(a), Math.cos(a), a]; };
    for (let k = 0; k < prof.length - 1; k++) {
      const [r0, y0] = prof[k], [r1, y1] = prof[k + 1];
      let nr = y1 - y0, ny = -(r1 - r0);
      const l = Math.hypot(nr, ny) || 1; nr /= l; ny /= l;
      for (let i = 0; i < seg; i++) {
        const A = ring(i), B = ring(i + 1);
        const v = (s, r, y) => {
          pos.push(s[0] * r, y, s[1] * r);
          nrm.push(s[0] * nr, ny, s[1] * nr);
          uv.push(s[2] * rAvg * UV_SCALE, y * UV_SCALE);
        };
        v(A, r0, y0); v(B, r0, y0); v(B, r1, y1);
        v(A, r0, y0); v(B, r1, y1); v(A, r1, y1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.userData.customUV = true;
    return g;
  }

  // Vát mép trụ theo cỡ: ống / bánh / tháp lớn vát ~1-2 cm, chi tiết nhỏ không vát
  function cylBevel(rTop, rBottom, len, seg) {
    const r = Math.min(rTop, rBottom);
    if (r < 0.45 || len < 0.25 || seg < 10) return 0;
    return Math.min(0.16, 0.04 + r * 0.05);
  }

  // Độ vát theo cỡ khối: tấm lớn vát ~2-4 cm, chi tiết nhỏ (bu-lông, khe, lá chớp) giữ hộp thường cho nhẹ
  function boxGeometry(w, h, d) {
    const m = Math.min(w, h, d);
    if (m < 0.22 || Math.max(w, h, d) < 0.9) return new THREE.BoxGeometry(w, h, d);
    return chamferBoxGeometry(w, h, d, Math.min(0.3, 0.06 + m * 0.1));
  }

  /**
   * Gom chi tiết tĩnh theo vật liệu rồi gộp thành một mesh cho mỗi vật liệu.
   * Mọi tọa độ tính trong hệ tọa độ của group cha sẽ nhận mesh.
   */
  class PartBatch {
    // yBase: độ cao của gốc tọa độ batch so với mặt đất (để tính lớp bẩn gầm xe)
    constructor(yBase = 0) {
      this.buckets = new Map();
      this.yBase = yBase;
      this.tag = null;
    }

    // Đánh dấu các chi tiết thêm sau lệnh này thuộc bộ phận có thể hỏng / rơi ra (null = phần cố định).
    // Bộ phận vẫn gộp chung mesh (không tăng draw call); hệ thống hư hại tách riêng khi cần.
    setTag(tag) {
      this.tag = tag || null;
      return this;
    }

    add(geo, mat, pos, rot, scale) {
      const customUV = !!(geo.userData && geo.userData.customUV) && !scale;
      const g = geo.index ? geo.toNonIndexed() : geo.clone();
      if (!g.attributes.normal) g.computeVertexNormals();
      g.applyMatrix4(makeMatrix(pos, rot, scale));
      if (this.tag) g.userData.partTag = this.tag;
      if (mat.userData && mat.userData.boxUV) {
        if (!customUV) applyBoxUV(g);
        applyGroundGrime(g, this.yBase);
      }
      if (!this.buckets.has(mat)) this.buckets.set(mat, []);
      this.buckets.get(mat).push(g);
      geo.dispose && geo !== g && geo.dispose();
      return this;
    }

    box(w, h, d, mat, pos, rot) {
      return this.add(this.plain ? new THREE.BoxGeometry(w, h, d) : boxGeometry(w, h, d), mat, pos, rot);
    }

    // Trụ nằm theo trục: 'x' | 'y' | 'z'
    cyl(rTop, rBottom, len, seg, mat, pos, axis = 'y', rot = null, open = false) {
      const g = roundCylGeometry(rTop, rBottom, len, seg, this.plain ? 0 : cylBevel(rTop, rBottom, len, seg), open);
      if (axis === 'x') g.rotateZ(-Math.PI / 2);
      else if (axis === 'z') g.rotateX(-Math.PI / 2);
      return this.add(g, mat, pos, rot);
    }

    // Vật tròn xoay theo mặt cắt dọc [[r, y], ...] (xem revolveProfile); axis 'z': +y của mặt cắt hướng -Z (mũi xe)
    lathe(prof, seg, mat, pos, axis = 'y', rAvg = prof[0][0]) {
      const g = revolveProfile(prof, seg, rAvg);
      if (axis === 'x') g.rotateZ(-Math.PI / 2);
      else if (axis === 'z') g.rotateX(-Math.PI / 2);
      return this.add(g, mat, pos);
    }

    // Ống trụ nối 2 điểm (xi-lanh thủy lực, thanh chống, ống dẫn)
    strut(p0, p1, radius, mat, seg = 8, radius1 = radius) {
      const o = orientBetween(p0, p1);
      return this.add(roundCylGeometry(radius1, radius, o.len, seg, cylBevel(radius1, radius, o.len, seg)), mat, o.pos, o.rot);
    }

    // Thanh hộp nối 2 điểm (tay đòn, dầm đỡ, mắt máng tiếp đạn)
    beam(p0, p1, w, d, mat) {
      const o = orientBetween(p0, p1);
      return this.add(boxGeometry(w, o.len, d), mat, o.pos, o.rot);
    }

    // Tay nắm chữ U bằng thép tròn hàn lên giáp: p = giữa hai chân (trên mặt giáp), dir = 'x' | 'z'
    // (phương thanh nắm), cao 'up' theo +Y. Sơn cùng màu xe -> shader tự mòn sơn ở chỗ tay cầm.
    grabHandle(p, dir, len, up, mat, r = 0.13) {
      const ax = dir === 'x' ? len / 2 : 0, az = dir === 'x' ? 0 : len / 2;
      const p0 = [p[0] - ax, p[1], p[2] - az], p1 = [p[0] + ax, p[1], p[2] + az];
      const q0 = [p0[0], p0[1] + up, p0[2]], q1 = [p1[0], p1[1] + up, p1[2]];
      this.strut(p0, q0, r, mat, 6);
      this.strut(p1, q1, r, mat, 6);
      this.strut(q0, q1, r, mat, 6);
      return this;
    }

    // Hàng bu-lông đầu lục giác từ p0 tới p1 (n con), mũ bu-lông nhô theo trục 'x' | 'y' | 'z'
    // (dấu của nx hướng ra ngoài: dir = ±1). rot: nghiêng thêm cho mặt giáp vát.
    boltRow(p0, p1, n, axis, mat, r = 0.17, dir = 1, rot = null) {
      for (let i = 0; i < n; i++) {
        const k = n === 1 ? 0.5 : i / (n - 1);
        const p = [p0[0] + (p1[0] - p0[0]) * k, p0[1] + (p1[1] - p0[1]) * k, p0[2] + (p1[2] - p0[2]) * k];
        if (axis === 'x') p[0] += dir * 0.06; else if (axis === 'y') p[1] += dir * 0.06; else p[2] += dir * 0.06;
        this.cyl(r, r * 1.05, 0.16, 6, mat, p, axis, rot);
      }
      return this;
    }

    // Khe ghép tấm giáp (rãnh sẫm mảnh) từ p0 tới p1 trên mặt có pháp tuyến n ([x, y, z])
    seam(p0, p1, n, mat, w = 0.12) {
      const o = orientBetween(p0, p1);
      _e.set(o.rot[0], o.rot[1], o.rot[2], 'XYZ');
      _q.setFromEuler(_e);
      _v.set(1, 0, 0).applyQuaternion(_q);
      const thinX = Math.abs(_v.x * n[0] + _v.y * n[1] + _v.z * n[2]) > 0.7;
      const t = 0.06;
      return this.add(new THREE.BoxGeometry(thinX ? t : w, o.len, thinX ? w : t), mat, o.pos, o.rot);
    }

    // Đường hàn nổi (gờ tròn nhỏ cùng màu sơn) dọc mép ghép hai tấm giáp
    weld(p0, p1, mat, r = 0.11) {
      return this.strut(p0, p1, r, mat, 5);
    }

    // Bản lề cửa / nắp: các khớp trụ xen kẽ dọc trục 'x' | 'y' | 'z' tại p, dài len
    hinge(p, axis, len, mat, r = 0.28, knuckles = 3) {
      const seg = len / (knuckles * 2 - 1);
      for (let i = 0; i < knuckles; i++) {
        const off = -len / 2 + seg * (i * 2 + 0.5);
        const q = [p[0], p[1], p[2]];
        if (axis === 'x') q[0] += off; else if (axis === 'y') q[1] += off; else q[2] += off;
        this.cyl(r, r, seg * 0.92, 8, mat, q, axis);
      }
      return this;
    }

    // Can nhiên liệu 20 L kiểu NATO: thân hai nửa dập ghép có gờ mép hàn giữa, mặt hông dập gân chữ X
    // kèm ô vuông trung tâm, vai vát, tay xách 3 quai, cổ rót nghiêng kèm nắp cam-lock có chốt gài.
    // pos = tâm can; bề dày t theo trục X cục bộ, cao h, rộng d; rotY quay quanh trục đứng.
    jerrycan(pos, rotY, t, h, d, mat, dark) {
      const c = Math.cos(rotY), sn = Math.sin(rotY);
      const P = (lx, ly, lz) => [pos[0] + lx * c + lz * sn, pos[1] + ly, pos[2] - lx * sn + lz * c];
      const dk = dark || mat;
      // Thân chính + vai vát + đế dập gờ chịu lực
      this.box(t, h * 0.86, d, mat, P(0, -h * 0.05, 0), [0, rotY, 0]);
      this.box(t * 0.88, h * 0.09, d * 0.93, mat, P(0, h * 0.41, 0), [0, rotY, 0]);
      this.box(t * 0.96, h * 0.05, d * 0.96, dk, P(0, -h * 0.48, 0), [0, rotY, 0]);
      // Gờ mép hàn dập ghép hai nửa vỏ thép chạy dọc giữa mặt trước, mặt sau và đáy
      this.box(0.05, h * 0.88, d + 0.07, dk, P(0, -h * 0.05, 0), [0, rotY, 0]);
      // Gân chữ X dập nổi + ô vuông tâm + khung gờ viền hai mặt bên
      const ang = Math.atan2(d * 0.68, h * 0.64), L = Math.hypot(h * 0.64, d * 0.68);
      for (const sx of [-1, 1]) {
        const xFace = sx * (t / 2 + 0.024);
        for (const k of [-1, 1]) {
          this.box(0.07, L, Math.max(0.11, d * 0.058), mat, P(xFace, -h * 0.05, 0), [k * ang, rotY, 0, 'YXZ']);
        }
        // Ô vuông dập nổi ở giao điểm chữ X (đặc trưng can quân sự 20L)
        this.box(0.08, h * 0.16, d * 0.18, mat, P(xFace + sx * 0.008, -h * 0.05, 0), [0, rotY, 0]);
        // Gờ viền ngang trên/dưới và dọc trước/sau quanh mặt hông
        this.box(0.06, h * 0.065, d * 0.86, mat, P(xFace, h * 0.30, 0), [0, rotY, 0]);
        this.box(0.06, h * 0.065, d * 0.86, mat, P(xFace, -h * 0.40, 0), [0, rotY, 0]);
        this.box(0.055, h * 0.66, d * 0.06, mat, P(xFace, -h * 0.05, d * 0.40), [0, rotY, 0]);
        this.box(0.055, h * 0.66, d * 0.06, mat, P(xFace, -h * 0.05, -d * 0.40), [0, rotY, 0]);
      }
      // Cụm tay xách 3 ống thép tròn (cầm tay thật hơn thanh hộp đặc) + vách chân quai
      const hy = h * 0.45 + 0.04;
      for (const sx of [-0.34, 0, 0.34]) {
        this.cyl(0.055, 0.055, d * 0.56, 6, mat, P(sx * t, hy + h * 0.08, -d * 0.13), 'z', [0, rotY, 0]);
      }
      for (const kz of [-0.40, -0.13, 0.14]) {
        this.box(t * 0.78, h * 0.08, 0.09, mat, P(0, hy + h * 0.035, kz * d), [0, rotY, 0]);
      }
      // Cổ vòi rót + nắp bật cam-lock + tai gài & chốt khóa
      this.cyl(t * 0.21, t * 0.24, h * 0.08, 8, dk, P(0, hy + h * 0.02, d * 0.34));
      this.box(t * 0.44, 0.06, d * 0.16, mat, P(0, hy + h * 0.068, d * 0.34), [0, rotY, 0]);
      this.box(t * 0.26, 0.08, d * 0.18, dk, P(0, hy + h * 0.085, d * 0.29), [-0.22, rotY, 0, 'YXZ']);
      this.cyl(0.04, 0.04, t * 0.52, 6, dk, P(0, hy + h * 0.055, d * 0.41), 'x', [0, rotY, 0]);
      return this;
    }

    // Chuyển toàn bộ thành mesh và gắn vào group. origin: dời gốc mesh (để getWorldPosition có ý nghĩa)
    build(parent, origin = null, opts = {}) {
      const meshes = new Map();
      for (const [mat, geos] of this.buckets) {
        // Khoảng đỉnh của từng bộ phận được đánh dấu trong mesh gộp
        const ranges = {};
        let off = 0;
        for (const g of geos) {
          const n = g.attributes.position.count, tag = g.userData.partTag;
          if (tag) {
            const list = ranges[tag] || (ranges[tag] = []);
            const last = list[list.length - 1];
            if (last && last[0] + last[1] === off) last[1] += n;
            else list.push([off, n]);
          }
          off += n;
        }
        const merged = mergeGeometries(geos);
        geos.forEach(g => g.dispose());
        if (mat.userData && mat.userData.boxUV) computeEdgeWear(merged);
        const mesh = new THREE.Mesh(merged, mat);
        if (Object.keys(ranges).length) {
          mesh.userData.partRanges = ranges;
          if (PartBatch.registry) {
            for (const tag in ranges) {
              const list = PartBatch.registry[tag] || (PartBatch.registry[tag] = []);
              list.push({ mesh, ranges: ranges[tag], origin: origin ? origin.slice() : null });
            }
          }
        }
        if (origin) {
          merged.translate(-origin[0], -origin[1], -origin[2]);
          merged.computeBoundingSphere();
          mesh.position.set(origin[0], origin[1], origin[2]);
        }
        mesh.castShadow = opts.castShadow !== false;
        mesh.receiveShadow = opts.receiveShadow !== false;
        parent.add(mesh);
        meshes.set(mat, mesh);
      }
      this.buckets.clear();
      return meshes;
    }

    // Gộp thành 1 geometry duy nhất (dùng cho InstancedMesh) — bỏ qua phân biệt vật liệu
    toGeometryByMaterial() {
      const out = new Map();
      for (const [mat, geos] of this.buckets) {
        const merged = mergeGeometries(geos);
        if (mat.userData && mat.userData.boxUV) computeEdgeWear(merged);
        out.set(mat, merged);
        geos.forEach(g => g.dispose());
      }
      this.buckets.clear();
      return out;
    }
  }

  /**
   * Lốp xe quân sự địa hình (trục quay = trục Y, hông "trên" +Y là hông ngoài có chữ nổi). Trả về mảng
   * BufferGeometry không chỉ số, đã có uv riêng (userData.customUV) và màu đỉnh làm che khuất:
   * - thân lốp: lathe mặt cắt thật (mặt gai phẳng, vai bo, hông phồng, mép tanh), rãnh gai sẫm hơn hông
   * - gai: mỗi gai là khối đúc liền bám theo mặt cong của lốp, chạy chéo chữ V từ giữa mặt lốp vắt qua vai
   *   xuống hông; hai nửa so le nửa bước, mép trong hai nửa gối nhau như lốp XZL; gai thấp dần ở vai
   * - hông ngoài: chữ nổi (cỡ lốp, hãng, mã) + gờ bảo vệ vành
   * R: bán kính đáy rãnh gai (ngoài cùng = R + lugH), H: nửa bề rộng, bead: bán kính mép tanh (vành).
   */
  function tireGeometry({ R, H, bead, lugH = 0.55, lugs = 20, seg = 48, seed = 7 }) {
    const rnd = mulberry32(seed);
    const k = UV_SCALE * 2;
    // Nửa trên mặt cắt: từ giữa mặt gai lên vai, qua hông tới mép tanh
    const half = new THREE.SplineCurve([
      [R, 0], [R, H * 0.4], [R - 0.05, H * 0.66], [R - 0.28, H * 0.88], [R - 0.7, H * 1.0],
      [(R + bead) / 2, H * 1.04], [bead + 0.55, H * 0.98], [bead + 0.22, H * 0.9], [bead + 0.26, H * 0.82], [bead, H * 0.78]
    ].map(([r, y]) => new THREE.Vector2(r, y))).getPoints(36).map(p => [p.x, p.y]);
    const cum = [0];
    for (let i = 1; i < half.length; i++) cum.push(cum[i - 1] + Math.hypot(half[i][0] - half[i - 1][0], half[i][1] - half[i - 1][1]));
    // (r, y, nr, ny) tại độ dài cung u tính từ đường giữa mặt lốp (u < 0: nửa dưới, lật y)
    const prof = (u) => {
      const s = u < 0 ? -1 : 1, a = Math.min(Math.abs(u), cum[cum.length - 1]);
      let i = 1;
      while (i < cum.length - 1 && cum[i] < a) i++;
      const t = (a - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]);
      const p0 = half[i - 1], p1 = half[i];
      const dr = p1[0] - p0[0], dy = p1[1] - p0[1], l = Math.hypot(dr, dy) || 1;
      return [p0[0] + dr * t, s * (p0[1] + dy * t), dy / l, -s * dr / l];
    };
    const pt = (th, r, y) => [r * Math.cos(th), y, -r * Math.sin(th)];
    const out = [];
    const finish = (pos, uvs, cols) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      g.computeVertexNormals();
      g.userData.customUV = true;
      out.push(g);
      return g;
    };

    // --- Thân lốp ---
    const full = half.slice().reverse().map(([r, y]) => new THREE.Vector2(r, -y)).concat(half.slice(1).map(([r, y]) => new THREE.Vector2(r, y)));
    const lathe = new THREE.LatheGeometry(full, seg).toNonIndexed();
    {
      const p = lathe.attributes.position, uv = lathe.attributes.uv;
      const uvs = [], cols = [];
      const circ = 2 * Math.PI * R, plen = cum[cum.length - 1] * 2;
      for (let i = 0; i < p.count; i++) {
        const r = Math.hypot(p.getX(i), p.getZ(i));
        uvs.push(uv.getX(i) * circ * k, uv.getY(i) * plen * k);
        // đáy rãnh gai tối (đất lèn + khuất sáng), hông sáng hơn, sát vành hơi tối
        const groove = smooth01(R - 0.75, R - 0.1, r);
        const c = 0.92 - groove * 0.36 - (1 - smooth01(bead, bead + 0.5, r)) * 0.12;
        cols.push(c, c, c);
      }
      finish(Array.from(p.array), uvs, cols);
    }

    // --- Gai chữ V đúc liền ---
    const pitch = (Math.PI * 2) / lugs;
    const uA = -H * 0.14, uB = cum[cum.length - 1] * 0.5;   // gối qua đường giữa ... vắt qua vai xuống nửa hông
    const slope = 0.75;                                       // độ chéo gai (~37°)
    const wTh = pitch * 0.48;
    const NU = 7;
    const pos = [], uvs = [], cols = [];
    const tri = (a, b, c, ca, cb, cc, want) => {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      const flip = ((uy * vz - uz * vy) * want[0] + (uz * vx - ux * vz) * want[1] + (ux * vy - uy * vx) * want[2]) < 0;
      const vs = flip ? [a, c, b] : [a, b, c], cs = flip ? [ca, cc, cb] : [ca, cb, cc];
      for (let q = 0; q < 3; q++) {
        pos.push(...vs[q]);
        const r = Math.hypot(vs[q][0], vs[q][2]);
        uvs.push(Math.atan2(-vs[q][2], vs[q][0]) * r * k, vs[q][1] * k);
        cols.push(cs[q], cs[q], cs[q]);
      }
    };
    const quad = (a, b, c, d, ca, cb, cc, cd, want) => { tri(a, b, c, ca, cb, cc, want); tri(a, c, d, ca, cc, cd, want); };
    for (let i = 0; i < lugs; i++) {
      for (const side of [1, -1]) {
        const th0 = (i + (side < 0 ? 0.5 : 0)) * pitch + (rnd() - 0.5) * 0.01;
        const wear = 0.94 + rnd() * 0.06;   // gai còn sâu, mòn nhẹ không đều
        const rows = [];
        for (let j = 0; j <= NU; j++) {
          const t = j / NU, u = uA + (uB - uA) * t;
          const [r, y, nr, ny] = prof(side * u);
          const th = th0 + slope * Math.max(0, u) / R;   // nửa dưới lật y -> hai nửa thành chữ V
          const h = lugH * wear * (1 - 0.25 * smooth01(0.6, 1, t));
          const w0 = wTh * (1.05 - 0.12 * t), w1 = w0 * 0.88;
          const n3 = (tt) => [nr * Math.cos(tt), ny, -nr * Math.sin(tt)];
          const base = (tt) => { const q = pt(tt, r, y), n = n3(tt); return [q[0] - n[0] * 0.04, q[1] - n[1] * 0.04, q[2] - n[2] * 0.04]; };
          const top = (tt) => { const q = pt(tt, r, y), n = n3(tt); return [q[0] + n[0] * h, q[1] + n[1] * h, q[2] + n[2] * h]; };
          rows.push({ bl: base(th - w0 / 2), br: base(th + w0 / 2), tl: top(th - w1 / 2), tr: top(th + w1 / 2), n: n3(th), th, y });
        }
        for (let j = 0; j < NU; j++) {
          const A = rows[j], B = rows[j + 1];
          const nm = [(A.n[0] + B.n[0]) / 2, (A.n[1] + B.n[1]) / 2, (A.n[2] + B.n[2]) / 2];
          quad(A.tl, A.tr, B.tr, B.tl, 0.9, 0.9, 0.9, 0.9, nm);
          quad(A.bl, A.tl, B.tl, B.bl, 0.62, 0.85, 0.85, 0.62, [Math.sin(A.th), 0, Math.cos(A.th)]);
          quad(A.br, A.tr, B.tr, B.br, 0.62, 0.85, 0.85, 0.62, [-Math.sin(A.th), 0, -Math.cos(A.th)]);
        }
        // hai đầu gai
        const F = rows[0], E = rows[NU];
        const along = (a, b) => [b.tl[0] - a.tl[0], b.tl[1] - a.tl[1], b.tl[2] - a.tl[2]];
        const dF = along(rows[1], F), dE = along(rows[NU - 1], E);
        quad(F.bl, F.br, F.tr, F.tl, 0.62, 0.62, 0.85, 0.85, dF);
        quad(E.bl, E.br, E.tr, E.tl, 0.62, 0.62, 0.85, 0.85, dE);
      }
    }
    // Gờ tròn bảo vệ mép vành + đường gân hông (vòng nổi trên hông ngoài)
    const yAtR = (rr) => {
      for (let i = 1; i < half.length; i++) {
        const a = half[i - 1], b = half[i];
        if (a[0] >= rr && b[0] < rr) return a[1] + (b[1] - a[1]) * (a[0] - rr) / (a[0] - b[0]);
      }
      return H;
    };
    for (const [rr, w] of [[bead + 0.42, 0.12], [R - 0.62, 0.06]]) {
      const y0 = yAtR(rr) - 0.02, y1 = y0 + 0.02 + w * 0.6;
      for (let i = 0; i < seg; i++) {
        const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2, am = (a0 + a1) / 2;
        const er = [Math.cos(am), 0, -Math.sin(am)], ei = [-er[0], 0, -er[2]];
        quad(pt(a0, rr - w, y1), pt(a1, rr - w, y1), pt(a1, rr + w, y1), pt(a0, rr + w, y1), 0.92, 0.92, 0.92, 0.92, [0, 1, 0]);
        quad(pt(a0, rr - w, y0), pt(a1, rr - w, y0), pt(a1, rr - w, y1), pt(a0, rr - w, y1), 0.8, 0.8, 0.9, 0.9, ei);
        quad(pt(a0, rr + w, y0), pt(a1, rr + w, y0), pt(a1, rr + w, y1), pt(a0, rr + w, y1), 0.8, 0.8, 0.9, 0.9, er);
      }
    }
    finish(pos, uvs, cols);

    // --- Hông ngoài: chữ nổi kiểu 7 nét (cỡ lốp, hãng, mã sản xuất) ---
    const yAt = yAtR;
    const lp = [], lu = [], lc = [];
    const bar = (th, rC, tC, lenR, lenT) => {
      const g = new THREE.BoxGeometry(lenR, 0.1, lenT).toNonIndexed();
      g.rotateY(th);
      const q = pt(th, rC, yAt(rC) + 0.02), e = [Math.sin(th) * tC, 0, Math.cos(th) * tC];
      g.translate(q[0] + e[0], q[1], q[2] + e[2]);
      const a = g.attributes.position;
      for (let i = 0; i < a.count; i++) {
        lp.push(a.getX(i), a.getY(i), a.getZ(i));
        lu.push(a.getX(i) * k, a.getZ(i) * k);
        lc.push(0.95, 0.95, 0.95);
      }
    };
    const SEGS = [[0, 1, 0], [0, 0, 0], [0, -1, 0], [1, 0.5, 1], [1, -0.5, 1], [-1, 0.5, 1], [-1, -0.5, 1]];
    const rL = (bead + R) / 2 + 0.1, cw = 0.28, chh = 0.46, sw = 0.07;
    for (const [a0, n] of [[0.3, 13], [3.4, 9], [5.2, 5]]) {
      for (let c = 0; c < n; c++) {
        if (rnd() < 0.12) continue;   // khoảng trắng giữa các cụm chữ
        const th = a0 + c * (cw * 1.35) / rL;
        for (const [kind, o, vert] of SEGS) {
          if (rnd() < 0.42) continue;
          if (!vert) bar(th, rL + o * chh / 2, 0, sw, cw);
          else bar(th, rL + o * chh / 2, kind * cw / 2, chh / 2, sw);
        }
      }
    }
    finish(lp, lu, lc);
    return out;
  }

  function pushTri(arr, a, b, c, desired) {
    // Đảo chiều tam giác nếu pháp tuyến ngược hướng mong muốn
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (nx * desired[0] + ny * desired[1] + nz * desired[2] < 0) {
      arr.push(...a, ...c, ...b);
    } else {
      arr.push(...a, ...b, ...c);
    }
  }

  /**
   * Co đa giác [x, z] vào trong d đơn vị (mỗi cạnh tịnh tiến song song, đỉnh mới = giao hai cạnh kề).
   * d: một số cho mọi cạnh, hoặc mảng theo cạnh (cạnh i nối đỉnh i -> i+1; số âm = nở ra ngoài).
   * Cạnh ngắn bị co mất hướng (đảo chiều) -> tự giảm d cho tới khi đa giác còn hợp lệ.
   */
  function insetPolygon(pts, d) {
    const n = pts.length;
    let a2 = 0;
    for (let i = 0; i < n; i++) {
      const p = pts[i], q = pts[(i + 1) % n];
      a2 += p[0] * q[1] - q[0] * p[1];
    }
    const sgn = a2 > 0 ? 1 : -1;
    const nrm = [], dir = [];
    for (let i = 0; i < n; i++) {
      const p = pts[i], q = pts[(i + 1) % n];
      const dx = q[0] - p[0], dz = q[1] - p[1], l = Math.hypot(dx, dz) || 1;
      dir.push([dx / l, dz / l]);
      nrm.push([sgn * -dz / l, sgn * dx / l]);   // pháp tuyến hướng vào trong
    }
    const dist = Array.isArray(d) ? d : pts.map(() => d);
    // Đỉnh i = giao của cạnh (i-1) và cạnh i sau khi tịnh tiến; hai cạnh gần song song -> dời theo trung bình
    const at = (k) => pts.map((p, i) => {
      const h = (i - 1 + n) % n;
      const d0 = dist[h] * k, d1 = dist[i] * k;
      const a0 = [p[0] + nrm[h][0] * d0, p[1] + nrm[h][1] * d0];
      const a1 = [p[0] + nrm[i][0] * d1, p[1] + nrm[i][1] * d1];
      const e0 = dir[h], e1 = dir[i];
      const cr = e0[0] * e1[1] - e0[1] * e1[0];
      if (Math.abs(cr) < 1e-4) return [(a0[0] + a1[0]) / 2, (a0[1] + a1[1]) / 2];
      const t = ((a1[0] - a0[0]) * e1[1] - (a1[1] - a0[1]) * e1[0]) / cr;
      return [a0[0] + e0[0] * t, a0[1] + e0[1] * t];
    });
    for (let tries = 0, k = 1; tries < 8; tries++, k *= 0.75) {
      const out = at(k);
      let ok = true;
      for (let i = 0; i < n && ok; i++) {
        const j = (i + 1) % n;
        const ox = pts[j][0] - pts[i][0], oz = pts[j][1] - pts[i][1];
        if (ox * ox + oz * oz < 1e-6) continue;
        ok = ox * (out[j][0] - out[i][0]) + oz * (out[j][1] - out[i][1]) > 0;
      }
      if (ok) return out;
    }
    return pts.map(p => p.slice());
  }

  /**
   * Khối giáp nhiều tầng: rings = [{ pts, y }, ...] từ đáy lên (cùng số đỉnh [x, z]; y là số hoặc mảng theo đỉnh).
   * Mỗi cặp vành kề nhau sinh một dải mặt phẳng -> dựng được mặt giáp nghiêng gãy khúc kiểu tháp pháo thật:
   * tấm dưới vát hắt vào trong (undercut), gờ sống ở giữa, tấm trên ngả vào trong. Đa giác lõm (khe nòng) dùng được.
   * chamfer > 0: mép nóc vát chéo 45°.
   */
  function loftRings(rings, chamfer = 0) {
    const n = rings[0].pts.length;
    const R = rings.map(r => ({ pts: r.pts, y: Array.isArray(r.y) ? (i) => r.y[i] : () => r.y }));
    const last = R[R.length - 1], prev = R[R.length - 2];
    let minH = Infinity;
    for (let i = 0; i < n; i++) minH = Math.min(minH, last.y(i) - prev.y(i));
    const c = Math.min(chamfer, minH * 0.45);
    if (c > 0.01) {
      const top = last;
      R[R.length - 1] = { pts: top.pts, y: (i) => top.y(i) - c };
      R.push({ pts: insetPolygon(top.pts, c), y: top.y });
    }
    // Hướng ra ngoài của từng cạnh theo chiều quấn đa giác (đúng cả với đa giác lõm)
    const p0 = R[0].pts;
    let a2 = 0;
    for (let i = 0; i < n; i++) {
      const p = p0[i], q = p0[(i + 1) % n];
      a2 += p[0] * q[1] - q[0] * p[1];
    }
    const sgn = a2 > 0 ? 1 : -1;

    const verts = [];
    for (let r = 0; r < R.length - 1; r++) {
      const A = R[r], B = R[r + 1];
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const b0 = [A.pts[i][0], A.y(i), A.pts[i][1]];
        const b1 = [A.pts[j][0], A.y(j), A.pts[j][1]];
        const t0 = [B.pts[i][0], B.y(i), B.pts[i][1]];
        const t1 = [B.pts[j][0], B.y(j), B.pts[j][1]];
        const ex = p0[j][0] - p0[i][0], ez = p0[j][1] - p0[i][1];
        const out = [sgn * ez, 0, -sgn * ex];
        pushTri(verts, b0, b1, t1, out);
        pushTri(verts, b0, t1, t0, out);
      }
    }
    const capTris = (ring, dir) => {
      const pts = ring.pts;
      const contour = pts.map(p => new THREE.Vector2(p[0], p[1]));
      const tris = THREE.ShapeUtils.triangulateShape(contour, []);
      for (const t of tris) {
        pushTri(verts,
          [pts[t[0]][0], ring.y(t[0]), pts[t[0]][1]],
          [pts[t[1]][0], ring.y(t[1]), pts[t[1]][1]],
          [pts[t[2]][0], ring.y(t[2]), pts[t[2]][1]],
          dir);
      }
    };
    capTris(R[R.length - 1], [0, 1, 0]);
    capTris(R[0], [0, -1, 0]);

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.computeVertexNormals();
    return g;
  }

  /**
   * Khối lăng trụ vát (loft) giữa đa giác đáy và đa giác đỉnh (cùng số đỉnh, tọa độ [x, z]).
   * yTop có thể là số hoặc mảng độ cao từng đỉnh -> mặt nóc nghiêng.
   * chamfer > 0: mép nóc vát chéo 45° (dải thép vát chạy quanh nóc như tháp pháo / thân xe hàn thật);
   * kích thước ngoài giữ nguyên, nóc phẳng co vào trong đúng chamfer đơn vị.
   * Pháp tuyến phẳng từng mặt => cạnh giáp sắc nét như thép tấm hàn.
   */
  function loft(bottom, top, yBottom, yTop, chamfer = 0) {
    const n = bottom.length;
    const yt = (i) => (Array.isArray(yTop) ? yTop[i] : yTop);
    let cx = 0, cz = 0;
    for (const p of bottom) { cx += p[0]; cz += p[1]; }
    cx /= n; cz /= n;
    const cy = (yBottom + (Array.isArray(yTop) ? yTop.reduce((s, v) => s + v, 0) / n : yTop)) / 2;

    // Các vành từ đáy lên: [đáy] -> [đỉnh hông] -> (nóc co vào trong nếu vát)
    let minH = Infinity;
    for (let i = 0; i < n; i++) minH = Math.min(minH, yt(i) - yBottom);
    const c = Math.min(chamfer, minH * 0.45);
    const rings = [{ pts: bottom, y: () => yBottom }];
    if (c > 0.01) {
      rings.push({ pts: top, y: (i) => yt(i) - c });
      rings.push({ pts: insetPolygon(top, c), y: yt });
    } else {
      rings.push({ pts: top, y: yt });
    }

    const verts = [];
    for (let r = 0; r < rings.length - 1; r++) {
      const A = rings[r], B = rings[r + 1];
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const b0 = [A.pts[i][0], A.y(i), A.pts[i][1]];
        const b1 = [A.pts[j][0], A.y(j), A.pts[j][1]];
        const t0 = [B.pts[i][0], B.y(i), B.pts[i][1]];
        const t1 = [B.pts[j][0], B.y(j), B.pts[j][1]];
        const mx = (b0[0] + b1[0] + t0[0] + t1[0]) / 4 - cx;
        const my = (b0[1] + b1[1] + t0[1] + t1[1]) / 4 - cy;
        const mz = (b0[2] + b1[2] + t0[2] + t1[2]) / 4 - cz;
        const out = [mx, my * 0.2, mz];
        pushTri(verts, b0, b1, t1, out);
        pushTri(verts, b0, t1, t0, out);
      }
    }
    top = rings[rings.length - 1].pts;
    const capTris = (pts, yf, dir) => {
      const contour = pts.map(p => new THREE.Vector2(p[0], p[1]));
      const tris = THREE.ShapeUtils.triangulateShape(contour, []);
      for (const t of tris) {
        pushTri(verts,
          [pts[t[0]][0], yf(t[0]), pts[t[0]][1]],
          [pts[t[1]][0], yf(t[1]), pts[t[1]][1]],
          [pts[t[2]][0], yf(t[2]), pts[t[2]][1]],
          dir);
      }
    };
    capTris(top, yt, [0, 1, 0]);
    capTris(bottom, () => yBottom, [0, -1, 0]);

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.computeVertexNormals();
    return g;
  }

  /**
   * Khối đùn theo mặt cắt dọc (nhìn từ sườn xe): points = [[z, y], ...], đùn theo trục X với bề rộng width.
   * Dùng cho thân xe có giáp mũi vát, váy xích, tấm chắn bùn...
   */
  function sideProfile(points, width, bevel = 0) {
    const shape = new THREE.Shape();
    points.forEach((p, i) => (i === 0 ? shape.moveTo(p[0], p[1]) : shape.lineTo(p[0], p[1])));
    shape.closePath();
    const depth = Math.max(0.01, width - bevel * 2);
    const g = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: bevel > 0,
      bevelThickness: bevel,
      bevelSize: bevel,
      // Bo cạnh vào trong: mặt ngoài giữ đúng đường bao thiết kế, phụ kiện gắn sát bề mặt không bị chìm
      bevelOffset: -bevel,
      bevelSegments: 1,
      curveSegments: 1
    });
    g.rotateY(-Math.PI / 2);
    g.translate(depth / 2, 0, 0);
    return g;
  }

  // ---------------------------------------------------------------------------
  // CỤM BÁNH XOAY (InstancedMesh theo vật liệu, mỗi bánh một instance)
  // ---------------------------------------------------------------------------
  class WheelSet {
    /**
     * buildFn(batch): dựng 1 bánh quanh gốc tọa độ, trục quay = trục X, mặt ngoài hướng +X.
     * positions: [{ x, y, z }]; bánh bên trái (x < 0) tự lật 180° để mặt ngoài hướng ra ngoài.
     */
    constructor(parent, buildFn, positions, radius) {
      this.radius = radius;
      this.positions = positions;
      this.angles = new Float32Array(positions.length);
      const batch = new PartBatch(positions.length ? positions[0].y : 0);
      buildFn(batch);
      this.meshes = [];
      for (const [mat, geo] of batch.toGeometryByMaterial()) {
        const im = new THREE.InstancedMesh(geo, mat, positions.length);
        im.castShadow = true;
        im.receiveShadow = true;
        im.frustumCulled = false;
        parent.add(im);
        this.meshes.push(im);
      }
      this._flip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
      this._roll = new THREE.Quaternion();
      this._steerQ = new THREE.Quaternion();
      this._axis = new THREE.Vector3(1, 0, 0);
      this._yAxis = new THREE.Vector3(0, 1, 0);
      // Góc bẻ lái chung; bánh nào có positions[i].steer (hệ số) mới bẻ theo
      this.steerAngle = 0;
      this._one = new THREE.Vector3(1, 1, 1);
      this._p = new THREE.Vector3();
      this._q = new THREE.Quaternion();
      this._m = new THREE.Matrix4();
      this._sm = new THREE.Matrix4();
      // Mức xịt lốp từng bánh (0 = căng, 1 = xẹp hẳn) và bánh bị văng mất
      this.flat = new Float32Array(positions.length);
      this.gone = new Uint8Array(positions.length);
      // Lốp cháy trụi (0 = còn nguyên, 1 = cao su cháy hết chỉ còn vành thép): mesh cao su (surface 'rubber') co dần về
      // mép vành rồi mất hẳn; thân xe sụt xuống theo (VehicleDamage.recompute dùng rimRadius). rimRadius: bán kính mép vành
      this.burnt = new Float32Array(positions.length);
      this.rubber = this.meshes.map(im => !!(im.material && im.material.userData && im.material.userData.surface === 'rubber'));
      // mép vành = điểm xa trục nhất của các chi tiết không phải cao su (vành, moay-ơ, ống bơm hơi)
      let rimR = 0;
      this.meshes.forEach((im, k) => {
        if (this.rubber[k]) return;
        const pa = im.geometry.attributes.position;
        for (let j = 0; j < pa.count; j++) rimR = Math.max(rimR, Math.hypot(pa.getY(j), pa.getZ(j)));
      });
      this.rimRadius = rimR > radius * 0.3 && rimR < radius * 0.95 ? rimR : radius * 0.55;
      this._bs = new THREE.Vector3();
      this.update();
      const flush = () => { if (this._stale) this.update(); };
      for (const im of this.meshes) im.onBeforeRender = flush;
    }

    setFlat(i, k) {
      if (i >= 0 && i < this.flat.length) { this.flat[i] = Math.max(0, Math.min(2, k)); this.update(); }
    }

    setBurnt(i, k) {
      if (i >= 0 && i < this.burnt.length) { this.burnt[i] = Math.max(0, Math.min(1, k)); this.update(); }
    }

    resetDamage() {
      this.flat.fill(0);
      this.gone.fill(0);
      this.burnt.fill(0);
      this.update();
    }

    // Lăn quãng đường dài distLeft / distRight (đơn vị thế giới) -> góc quay = s / r
    roll(distLeft, distRight) {
      for (let i = 0; i < this.positions.length; i++) {
        const d = this.positions[i].x < 0 ? distLeft : distRight;
        this.angles[i] -= d / this.radius;
      }
      // xe đang bị ẩn (game.updateUnitLOD): chỉ cộng dồn góc, quay bánh một lần khi mesh được vẽ lại (xem TrackSystem)
      if (this.meshes[0] && this.meshes[0]._lodH) { this._stale = true; return; }
      this.update();
    }

    update() {
      this._stale = false;
      for (let i = 0; i < this.positions.length; i++) {
        const p = this.positions[i];
        const left = p.x < 0;
        // Bánh trái bị lật quanh Y nên chiều quay quanh trục X cục bộ đảo dấu
        this._roll.setFromAxisAngle(this._axis, left ? -this.angles[i] : this.angles[i]);
        if (left) this._q.copy(this._flip).multiply(this._roll);
        else this._q.copy(this._roll);
        if (p.steer) {
          this._steerQ.setFromAxisAngle(this._yAxis, this.steerAngle * p.steer);
          this._q.premultiply(this._steerQ);
        }
        if (this.gone[i]) {
          this._m.makeScale(0, 0, 0);
        } else if (this.flat[i] > 0) {
          // Lốp xẹp: lốp bẹp theo phương đứng của thân xe (không xoay theo bánh), tâm bánh giữ nguyên trong hệ thân —
          // chính thân xe tụt xuống ở góc đó (VehicleDamage.recompute: sink / nghiêng ~0.2R) nên đáy lốp bẹp vẫn tì đúng
          // mặt đất; hạ thêm tâm bánh ở đây sẽ thành tụt 2 lần -> lốp ngập xuống đất
          const f = this.flat[i];
          const sy = 1 - 0.2 * f;
          this._m.makeRotationFromQuaternion(this._q);
          this._sm.makeScale(1 + 0.04 * f, sy, 1 + 0.03 * f);
          this._m.premultiply(this._sm);
          this._m.setPosition(p.x, p.y, p.z);
        } else {
          this._p.set(p.x, p.y, p.z);
          this._m.compose(this._p, this._q, this._one);
        }
        const b = this.gone[i] ? 0 : this.burnt[i];
        if (b > 0) {
          // Lốp cháy: vành / moay-ơ tròn nguyên (không bẹp theo lốp xẹp), cao su co dần về mép vành, mỏng đi rồi mất hẳn
          this._p.set(p.x, p.y, p.z);
          this._m.compose(this._p, this._q, this._one);
          const rr = 1 - b * (1 - Math.min(0.98, this.rimRadius / this.radius));
          this._bs.set(1 - 0.35 * b, rr, rr);
          this._sm.compose(this._p, this._q, b >= 0.97 ? this._bs.set(0, 0, 0) : this._bs);
          for (let k = 0; k < this.meshes.length; k++) this.meshes[k].setMatrixAt(i, this.rubber[k] ? this._sm : this._m);
          continue;
        }
        for (const im of this.meshes) im.setMatrixAt(i, this._m);
      }
      for (const im of this.meshes) im.instanceMatrix.needsUpdate = true;
    }
  }

  // ---------------------------------------------------------------------------
  // HỆ THỐNG XÍCH TỪNG MẮT (InstancedMesh)
  // ---------------------------------------------------------------------------
  /**
   * circles: các vòng tròn đường đi tâm mắt xích theo thứ tự ngược chiều kim đồng hồ khi nhìn
   * từ bên phải xe trong mặt phẳng (u = z, v = y): bánh dẫn hướng trước -> bánh tải đầu ->
   * bánh tải cuối -> bánh sao sau. Mỗi vòng { u, v, r } (r đã cộng nửa độ dày xích).
   */
  function buildTrackPath(circles) {
    const n = circles.length;
    const tangents = [];
    for (let i = 0; i < n; i++) {
      const A = circles[i], B = circles[(i + 1) % n];
      const du = B.u - A.u, dv = B.v - A.v;
      const L = Math.hypot(du, dv);
      const phi = Math.atan2(dv, du);
      const beta = phi - Math.acos(Math.max(-1, Math.min(1, (A.r - B.r) / L)));
      const nu = Math.cos(beta), nv = Math.sin(beta);
      tangents.push({
        beta,
        p0: { u: A.u + A.r * nu, v: A.v + A.r * nv },
        p1: { u: B.u + B.r * nu, v: B.v + B.r * nv }
      });
    }
    const segs = [];
    for (let i = 0; i < n; i++) {
      // Cung trên vòng tròn i: từ tiếp tuyến vào (i-1) tới tiếp tuyến ra (i)
      const C = circles[i];
      const tin = tangents[(i - 1 + n) % n], tout = tangents[i];
      let a0 = tin.beta, a1 = tout.beta;
      let d = a1 - a0;
      while (d < 0) d += Math.PI * 2;
      while (d >= Math.PI * 2) d -= Math.PI * 2;
      if (d > 1e-4 && d < Math.PI * 2 - 1e-4) {
        segs.push({ type: 'arc', C, a0, da: d, len: C.r * d });
      }
      const t = tout;
      const len = Math.hypot(t.p1.u - t.p0.u, t.p1.v - t.p0.v);
      segs.push({ type: 'line', p0: t.p0, p1: t.p1, len });
    }
    let total = 0;
    for (const s of segs) { s.start = total; total += s.len; }
    return { segs, length: total };
  }

  // Trả về vị trí (u, v) và hướng đi (tu, tv) tại khoảng cách s trên đường xích
  function samplePath(path, s, out) {
    s = ((s % path.length) + path.length) % path.length;
    let seg = path.segs[path.segs.length - 1];
    for (const sg of path.segs) {
      if (s < sg.start + sg.len) { seg = sg; break; }
    }
    const local = s - seg.start;
    if (seg.type === 'line') {
      const k = seg.len > 0 ? local / seg.len : 0;
      out.u = seg.p0.u + (seg.p1.u - seg.p0.u) * k;
      out.v = seg.p0.v + (seg.p1.v - seg.p0.v) * k;
      out.tu = (seg.p1.u - seg.p0.u) / (seg.len || 1);
      out.tv = (seg.p1.v - seg.p0.v) / (seg.len || 1);
    } else {
      const a = seg.a0 + local / seg.C.r;
      out.u = seg.C.u + seg.C.r * Math.cos(a);
      out.v = seg.C.v + seg.C.r * Math.sin(a);
      // Đi ngược chiều kim đồng hồ: tiếp tuyến = (-sin, cos)
      out.tu = -Math.sin(a);
      out.tv = Math.cos(a);
    }
    return out;
  }

  // Đĩa tròn dày t có n lỗ tròn bán kính holeR thủng thật trên vòng ringR; trục quay = X, tâm bề dày tại gốc.
  // Cung tròn Shape lấy 2 x curveSegments điểm: 6 -> lỗ 12 cạnh (đủ tròn ở cỡ này); viền ngoài cũng 12 cạnh nên r phải
  // lớn hơn mép trong vành ~4% để đa giác không hở khe (viền ngoài nằm khuất trong vành)
  function holedDisc(r, n, holeR, ringR, t) {
    const sh = new THREE.Shape();
    sh.absarc(0, 0, r, 0, Math.PI * 2, false);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, h = new THREE.Path();
      h.absarc(Math.cos(a) * ringR, Math.sin(a) * ringR, holeR, 0, Math.PI * 2, true);
      sh.holes.push(h);
    }
    return extrudeX(sh, t, 6, false);
  }

  // Vành răng bánh sao: n răng chân rộng, đỉnh bằng bo tròn (mặt cắt đúc thật), lỗ giữa rIn lắp lên tang trống.
  // Mỗi răng 9 điểm đặt dày ở sườn & đỉnh (chân răng là cung tròn, thưa cũng không lộ)
  const TOOTH_U = [0, 0.2, 0.28, 0.36, 0.43, 0.57, 0.64, 0.72, 0.8];
  function toothedRing(n, rRoot, rTip, rIn, t) {
    const sh = new THREE.Shape();
    for (let i = 0; i < n; i++) {
      for (const u of TOOTH_U) {
        const s = Math.min(1, Math.max(0, (0.3 - Math.abs(u - 0.5)) / 0.3 * 1.6));
        const r = rRoot + (rTip - rRoot) * s * s * (3 - 2 * s), a = ((i + u) / n) * Math.PI * 2;
        if (i === 0 && u === 0) sh.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else sh.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
    }
    sh.closePath();
    const h = new THREE.Path();
    h.absarc(0, 0, rIn, 0, Math.PI * 2, true);
    sh.holes.push(h);
    return extrudeX(sh, t, 8, true);
  }

  function extrudeX(shape, t, curveSegments, bevel) {
    const b = bevel ? 0.03 : 0;
    const g = new THREE.ExtrudeGeometry(shape, { depth: t - 2 * b, curveSegments, bevelEnabled: bevel, bevelThickness: b, bevelSize: b, bevelSegments: 1 });
    g.rotateY(Math.PI / 2);
    g.translate(-(t - 2 * b) / 2, 0, 0);
    return g;
  }

  /**
   * Mắt xích chốt kép kiểu Diehl 570 (xe tăng / xe hỏa lực cùng khung): 2 nửa guốc thép hai bên răng dẫn hướng, mặt đất có đệm
   * cao su thay được, mắt nọ sát mắt kia (chỉ lộ rãnh vát giữa hai guốc), khớp nối đầu chốt hai mép ngoài + khớp giữa mang răng
   * dẫn hướng. Hệ mắt xích TrackSystem: X ngang, Y ra ngoài (mặt đất y = 0.6), Z dọc. Vật liệu bẩn / gỉ / mài sáng
   * (dirtyMaterial polish 'track') dựa đúng các mặt này
   */
  function diehlLink(b, pitch, halfSpan, track, pad) {
    const shoeW = halfSpan - 0.62;              // một nửa guốc: từ cạnh khớp giữa ra tới khớp mép
    for (const s of [-1, 1]) {
      const x = s * (0.3 + shoeW / 2);
      // Thân guốc: nửa trong (ống chốt) gần kín bước xích, nửa ngoài ngắn hơn -> rãnh vát giữa hai mắt
      b.box(shoeW, 0.35, pitch * 0.97, track, [x, -0.125, 0]);
      b.box(shoeW, 0.3, pitch * 0.82, track, [x, 0.2, 0]);
      // Đệm cao su mặt đất (mặt ngoài y = 0.6 chạm đất), mép lùi vào trong guốc
      b.box(shoeW - 0.3, 0.25, pitch * 0.62, pad, [x, 0.475, 0]);
      // Khớp nối đầu chốt mép ngoài, ôm hai chốt của 2 mắt liền kề
      b.box(0.44, 0.5, pitch * 0.5, track, [s * (halfSpan - 0.15), -0.02, pitch / 2]);
    }
    // Khớp giữa liền chân răng dẫn hướng + đầu răng thuôn (chạy giữa hai đĩa bánh chịu tải)
    b.box(0.54, 1.0, pitch * 0.46, track, [0, -0.33, pitch / 2]);
    b.box(0.38, 0.4, pitch * 0.3, track, [0, -1.0, pitch / 2]);
  }

  class TrackSystem {
    /**
     * opts: { circles, sidesX: [-x, +x], pitch, buildLink(batch) }
     * buildLink dựng 1 mắt xích: trục X = bề ngang xích, Y = hướng ra ngoài (mặt bám đất), Z = dọc xích.
     */
    constructor(parent, opts) {
      this.path = buildTrackPath(opts.circles);
      this.count = Math.max(8, Math.round(this.path.length / opts.pitch));
      this.pitch = this.path.length / this.count;
      this.sidesX = opts.sidesX;
      this.offsets = this.sidesX.map(() => 0);

      const batch = new PartBatch();
      batch.plain = true;   // mắt xích nhỏ, hàng trăm cái: không vát cạnh cho nhẹ
      opts.buildLink(batch, this.pitch);
      this.meshes = [];
      for (const [mat, geo] of batch.toGeometryByMaterial()) {
        const im = new THREE.InstancedMesh(geo, mat, this.count * this.sidesX.length);
        im.castShadow = true;
        im.receiveShadow = true;
        im.frustumCulled = false;
        parent.add(im);
        this.meshes.push(im);
      }
      this._m = new THREE.Matrix4();
      this._smp = { u: 0, v: 0, tu: 0, tv: 0 };
      for (let s = 0; s < this.sidesX.length; s++) this.layoutSide(s);
      // Xe đang bị game.updateUnitLOD ẩn (ngoài màn hình / quá xa, mesh có _lodH): advance chỉ cộng dồn quãng đường, mắt
      // xích xếp lại một lần khi mesh được vẽ lại (onBeforeRender -> lên GPU ở khung sau, trễ 1 khung không ai thấy)
      this._stale = this.sidesX.map(() => false);
      const flush = () => {
        for (let s = 0; s < this._stale.length; s++) if (this._stale[s]) { this._stale[s] = false; this.layoutSide(s); }
      };
      for (const im of this.meshes) im.onBeforeRender = flush;
    }

    layoutSide(sideIdx) {
      const x = this.sidesX[sideIdx];
      const base = sideIdx * this.count;
      const m = this._m;
      const p = this._smp;
      for (let i = 0; i < this.count; i++) {
        samplePath(this.path, i * this.pitch + this.offsets[sideIdx], p);
        // Hệ trục mắt xích: X ngang, Y hướng ra ngoài vòng xích, Z ngược chiều chạy
        const yx = 0, yy = -p.tu, yz = p.tv;
        const zx = 0, zy = -p.tv, zz = -p.tu;
        m.set(
          1, 0, 0, x,
          0, yy, zy, p.v,
          0, yz, zz, p.u,
          0, 0, 0, 1
        );
        for (const im of this.meshes) im.setMatrixAt(base + i, m);
      }
      for (const im of this.meshes) im.instanceMatrix.needsUpdate = true;
    }

    // Dịch xích theo quãng đường xe lăn bánh (dương = tiến về phía trước)
    advance(distances) {
      for (let s = 0; s < this.sidesX.length; s++) {
        if (this.broken && this.broken[s]) continue;
        const d = distances[s] || 0;
        if (Math.abs(d) < 1e-5) continue;
        this.offsets[s] = (this.offsets[s] + d) % this.path.length;
        if (this.meshes[0] && this.meshes[0]._lodH) this._stale[s] = true;
        else this.layoutSide(s);
      }
    }

    // Đứt xích tại chỗ: chốt mắt xích gãy ở bánh dẫn hướng trước / sau. Nhánh dưới vẫn nằm dưới bánh,
    // nhánh trên mất căng sụp xuống nằm trên đỉnh bánh chịu tải, đầu đứt rũ qua bánh xuống đất thành
    // một đoạn ngắn nằm ngay trước / sau xe (giữ nguyên số mắt xích, không văng ra xa)
    breakSide(s, forward = true) {
      this.broken = this.broken || this.sidesX.map(() => false);
      if (this.broken[s]) return;
      this.broken[s] = true;
      this._stale[s] = false;   // không để lần xếp trễ đè mất đoạn xích đứt rũ
      const x = this.sidesX[s], sx = Math.sign(x) || 1, base = s * this.count, m = this._m, p = this._smp;
      let minV = Infinity, maxV = -Infinity, minU = Infinity, maxU = -Infinity;
      for (let i = 0; i < this.count; i++) {
        samplePath(this.path, i * this.pitch, p);
        minV = Math.min(minV, p.v); maxV = Math.max(maxV, p.v); minU = Math.min(minU, p.u); maxU = Math.max(maxU, p.u);
      }
      const sg = forward ? -1 : 1, endU = forward ? minU : maxU;
      const vSag = minV + (maxV - minV) * 0.58;
      const nearEnd = (u) => forward ? u < minU + 8 : u > maxU - 8;
      const put = (i, px, pv, pu, tu, tv, tw) => {
        // (tu, tv): hướng dọc dải xích trong mặt phẳng (u, v); trục Y (mặt bám) vuông góc, quay lên trên
        let a = -tu, b = tv;
        if (a < 0) { a = -a; b = -b; }
        const c = Math.cos(tw), sn = Math.sin(tw);
        m.set(
          c, 0, sn, px,
          sn * b, a, -b * c, pv,
          -sn * a, b, a * c, pu,
          0, 0, 0, 1
        );
        for (const im of this.meshes) im.setMatrixAt(base + i, m);
      };
      const drape = [];
      for (let i = 0; i < this.count; i++) {
        samplePath(this.path, i * this.pitch + this.offsets[s], p);
        if (p.v < minV + 1.2) continue;          // nhánh dưới vẫn nằm dưới bánh
        if (nearEnd(p.u)) { drape.push(i); continue; }
        // Nhánh trên sụp xuống đỉnh bánh chịu tải, võng nhẹ giữa các bánh, hơi lệch ra ngoài
        const sag = Math.abs(Math.sin(p.u * 0.33)) * 0.5;
        put(i, x + sx * 0.35 + (Math.random() - 0.5) * 0.15, vSag - sag, p.u, 1, 0, (Math.random() - 0.5) * 0.06);
      }
      // Đầu đứt: rũ từ đỉnh bánh dẫn hướng xuống đất rồi nằm duỗi một đoạn ngắn, xoắn nhẹ ra ngoài
      drape.sort((a, b) => {
        samplePath(this.path, a * this.pitch + this.offsets[s], p); const ua = p.u;
        samplePath(this.path, b * this.pitch + this.offsets[s], p); return (ua - p.u) * sg;
      });
      const pts = [[endU - sg * 8, vSag], [endU - sg * 2, maxV - 0.6], [endU + sg * 2.5, minV + 0.3], [endU + sg * 60, minV]];
      let seg = 0, t = 0;
      for (let k = 0; k < drape.length; k++) {
        let A = pts[seg], B = pts[seg + 1];
        let L = Math.hypot(B[0] - A[0], B[1] - A[1]);
        while (t > L && seg < pts.length - 2) { t -= L; seg++; A = pts[seg]; B = pts[seg + 1]; L = Math.hypot(B[0] - A[0], B[1] - A[1]); }
        const tu = (B[0] - A[0]) / L, tv = (B[1] - A[1]) / L;
        const pu = A[0] + tu * t, pv = A[1] + tv * t;
        const out = sx * (0.35 + Math.min(1.6, k * 0.12));
        put(drape[k], x + out + (Math.random() - 0.5) * 0.2, pv, pu, tu, tv, seg > 0 ? (Math.random() - 0.5) * 0.12 + sx * Math.min(0.25, 0.03 * k) : 0);
        t += this.pitch;
      }
      for (const im of this.meshes) im.instanceMatrix.needsUpdate = true;
    }

    // Nối xích tạm: lắp lại lên bánh
    repairSide(s) {
      if (!this.broken || !this.broken[s]) return;
      this.broken[s] = false;
      this.layoutSide(s);
    }
  }

  /**
   * Cụm cần ăng-ten roi (whip) dao động theo quán tính thật:
   * - Gốc ăng-ten tăng/giảm tốc, ôm cua, xe nhún khi bắn -> ngọn roi trễ pha, uốn cong rồi lắc tắt dần
   * - Xe chạy trên địa hình -> rung xóc nhỏ liên tục tỉ lệ tốc độ
   * Tất cả roi của một xe gộp chung 1 mesh, uốn bằng CPU mỗi khung hình (vài trăm đỉnh) -> 1 draw call.
   * Tọa độ khai báo trong hệ của group cha (thân xe hoặc tháp pháo).
   */
  class AntennaSet {
    constructor(material, parent) {
      this.material = material;
      this.parent = parent;
      this.whips = [];
      this.mesh = null;
      this.time = Math.random() * 100;
      this._q = new THREE.Quaternion();
      this._w = new THREE.Vector3();
      this._a = new THREE.Vector3();
    }

    // pos: chân roi; len: chiều dài; tilt: [ngả quanh X, ngả quanh Z] lúc đứng yên
    add(pos, len, opts = {}) {
      const tx = (opts.tilt && opts.tilt[0]) || 0, tz = (opts.tilt && opts.tilt[1]) || 0;
      const axis = new THREE.Vector3(0, 1, 0).applyEuler(new THREE.Euler(tx, 0, tz)).normalize();
      // Roi dài -> tần số riêng thấp hơn (~1.1 Hz với roi 2 m, ~1.8 Hz với roi 1.4 m)
      const freq = opts.freq || Math.max(0.9, Math.min(2.4, 19 / len));
      this.whips.push({
        base: new THREE.Vector3(pos[0], pos[1], pos[2]), len, axis,
        r0: opts.r0 || 0.09, r1: opts.r1 || 0.045,
        w: Math.PI * 2 * freq, zeta: opts.damping || 0.11,
        // Độ uốn tĩnh của ngọn roi trên mỗi m/s² gia tốc nền
        gain: opts.gain || 0.028,
        bx: 0, bz: 0, vx: 0, vz: 0,
        prev: null, vel: new THREE.Vector3(), acc: new THREE.Vector3(),
        phase: Math.random() * 50, hidden: false, start: 0, count: 0
      });
      return this.whips.length - 1;
    }

    build() {
      const RAD = 5, SEG = 10;
      const pos = [], nrm = [], idx = [];
      this.meta = [];
      for (const w of this.whips) {
        w.start = pos.length / 3;
        for (let j = 0; j <= SEG; j++) {
          const u = j / SEG;
          const r = w.r0 + (w.r1 - w.r0) * u;
          for (let k = 0; k < RAD; k++) {
            const a = (k / RAD) * Math.PI * 2;
            const ox = Math.cos(a) * r, oz = Math.sin(a) * r;
            pos.push(0, 0, 0);
            nrm.push(Math.cos(a), 0, Math.sin(a));
            this.meta.push(u, ox, oz);
          }
        }
        for (let j = 0; j < SEG; j++) {
          for (let k = 0; k < RAD; k++) {
            const a = w.start + j * RAD + k, b = w.start + j * RAD + (k + 1) % RAD;
            idx.push(a, a + RAD, b, b, a + RAD, b + RAD);
          }
        }
        w.count = (SEG + 1) * RAD;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
      g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nrm), 3));
      g.setIndex(idx);
      // vật liệu sơn / thép sẫm có lớp thời tiết đọc màu đỉnh: thiếu thì WebGL đọc (0,0,0) -> roi đen kịt không sáng tối
      if (this.material.vertexColors) {
        const n = pos.length / 3;
        g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).map((_, i) => i % 3 === 2 ? 0 : 1), 3));
        g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
      }
      this.geo = g;
      this.mesh = new THREE.Mesh(g, this.material);
      this.mesh.castShadow = true;
      this.mesh.name = 'antennas';
      this.parent.add(this.mesh);
      this.layout();
      g.computeBoundingSphere();
      g.boundingSphere.radius += 6; // chừa chỗ cho roi uốn
      return this.mesh;
    }

    // Đặt lại đỉnh theo độ uốn hiện tại
    layout() {
      const p = this.geo.attributes.position.array;
      const M = this.meta;
      for (const w of this.whips) {
        for (let i = w.start; i < w.start + w.count; i++) {
          const u = M[i * 3], ox = M[i * 3 + 1], oz = M[i * 3 + 2];
          if (w.hidden) { p[i * 3] = w.base.x; p[i * 3 + 1] = w.base.y; p[i * 3 + 2] = w.base.z; continue; }
          const s = w.len * u;
          // Lò xo chân + thân roi cong dần về ngọn
          const prof = 0.25 * u + 0.75 * u * u;
          const dx = w.bx * w.len * prof, dz = w.bz * w.len * prof;
          const shorten = (dx * dx + dz * dz) / (2 * Math.max(s, 0.5));
          p[i * 3] = w.base.x + w.axis.x * s + dx + ox;
          p[i * 3 + 1] = w.base.y + w.axis.y * s - shorten;
          p[i * 3 + 2] = w.base.z + w.axis.z * s + dz + oz;
        }
      }
      this.geo.attributes.position.needsUpdate = true;
    }

    // Kick tức thời (vd sóng nổ đầu nòng, trúng đạn): dir trong hệ group cha, đơn vị m/s
    impulse(dx, dz) {
      for (const w of this.whips) { w.vx += dx; w.vz += dz; }
    }

    setHidden(i, hidden) {
      if (this.whips[i]) { this.whips[i].hidden = hidden; this.layout(); }
    }

    reset() {
      for (const w of this.whips) { w.bx = w.bz = w.vx = w.vz = 0; w.prev = null; w.vel.set(0, 0, 0); w.acc.set(0, 0, 0); }
      if (this.mesh) this.layout();
    }

    update(dt) {
      if (!this.mesh || !(dt > 0)) return;
      if (dt > 0.1) { this.reset(); return; }
      this.time += dt;
      this.parent.updateWorldMatrix(true, false);
      this.parent.getWorldQuaternion(this._q).invert();
      const kv = 1 - Math.exp(-dt / 0.04), ka = 1 - Math.exp(-dt / 0.07);
      for (const w of this.whips) {
        const wp = this._w.copy(w.base).applyMatrix4(this.parent.matrixWorld);
        if (!w.prev) { w.prev = wp.clone(); continue; }
        // Vận tốc / gia tốc chân roi (đơn vị game: 8 = 1 m) -> m/s, m/s²; làm mượt để khử nhiễu dt
        const vx = (wp.x - w.prev.x) / dt / 8, vy = (wp.y - w.prev.y) / dt / 8, vz = (wp.z - w.prev.z) / dt / 8;
        w.prev.copy(wp);
        if (vx * vx + vy * vy + vz * vz > 2500) { w.vel.set(0, 0, 0); w.acc.set(0, 0, 0); continue; } // dịch chuyển tức thời (hồi sinh)
        const ax = (vx - w.vel.x) / dt, ay = (vy - w.vel.y) / dt, az = (vz - w.vel.z) / dt;
        w.vel.x += (vx - w.vel.x) * kv; w.vel.y += (vy - w.vel.y) * kv; w.vel.z += (vz - w.vel.z) * kv;
        w.acc.x += (ax * kv - w.acc.x) * ka; w.acc.y += (ay * kv - w.acc.y) * ka; w.acc.z += (az * kv - w.acc.z) * ka;
        const a = this._a.copy(w.acc).applyQuaternion(this._q);
        a.clampLength(0, 40);
        // Rung xóc mặt đường tỉ lệ tốc độ (2 tần số lệch pha) + gió nhẹ khi đứng yên
        const sp = Math.min(1.2, Math.hypot(w.vel.x, w.vel.z) / 9);
        const t = this.time + w.phase;
        const road = sp * 2.4, wind = 0.25;
        const nx = road * (Math.sin(t * 11.3) * 0.6 + Math.sin(t * 6.1 + 1.7) * 0.4) + wind * Math.sin(t * 1.3);
        const nz = road * (Math.sin(t * 9.7 + 0.6) * 0.6 + Math.sin(t * 4.9 + 2.9) * 0.4) + wind * Math.sin(t * 0.9 + 1.1);
        // Xóc dọc (nhún) cũng làm roi lắc theo hướng đang ngả
        const heave = a.y * 0.25;
        const fx = -(a.x + nx) - heave * (w.axis.x * 4 + w.bx);
        const fz = -(a.z + nz) - heave * (w.axis.z * 4 + w.bz);
        const W = w.w, k2 = W * W, c = 2 * w.zeta * W;
        // Tích phân bán ẩn, chia bước nhỏ cho ổn định
        const n = Math.max(1, Math.ceil(dt / 0.008)), h = dt / n;
        for (let s = 0; s < n; s++) {
          w.vx += (-k2 * w.bx - c * w.vx + w.gain * k2 * fx) * h;
          w.vz += (-k2 * w.bz - c * w.vz + w.gain * k2 * fz) * h;
          w.bx += w.vx * h; w.bz += w.vz * h;
        }
        const m = Math.hypot(w.bx, w.bz);
        if (m > 0.45) { w.bx *= 0.45 / m; w.bz *= 0.45 / m; }
      }
      this.layout();
    }
  }

  /**
   * TẤM VẢI NHẬN DIỆN trải trên nóc (kiểu VS-17): vải mềm võng giữa, nhăn gợn, mép xệ, các góc buộc dây xuống móc / giá
   * (nút buộc + đoạn dây chạy xuống nóc), một góc gió lật hếch lên. Lưới chia nhỏ (mặt trên + mặt dưới) — không còn là tấm
   * hộp phẳng cứng. b: PartBatch, mat: vải (M.idPanel), cord: dây / nút (M.canvasDark), c: tâm [x, y nóc, z], rotY, rnd
   */
  function idCloth(b, mat, cord, w, d, c, rotY, rnd) {
    const NX = 12, NZ = 9, hw = w / 2, hd = d / 2, seed = rnd() * 10;
    const flapX = rnd() < 0.5 ? -1 : 1, flapZ = rnd() < 0.5 ? -1 : 1;
    const H = (u, v) => {   // u, v trong [-1, 1]
      const edge = Math.max(Math.abs(u), Math.abs(v));
      let y = 0.05 + 0.045 * Math.sin(u * 5.1 + seed) * Math.cos(v * 4.3 - seed) + 0.03 * Math.sin((u + v) * 9.7 + seed * 2);
      y -= 0.04 * edge * edge;                                            // mép xệ xuống sát nóc
      const fl = Math.max(0, (u * flapX + v * flapZ - 1.25) / 0.75);      // góc gió lật
      y += fl * fl * 0.55;
      return y;
    };
    const pos = [], idx = [];
    for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) {
      const u = i / NX * 2 - 1, v = j / NZ * 2 - 1;
      // góc lật cuộn vào trong chút ít
      const fl = Math.max(0, (u * flapX + v * flapZ - 1.25) / 0.75);
      pos.push(u * hw * (1 - fl * 0.18), H(u, v), v * hd * (1 - fl * 0.18));
    }
    const vid = (i, j) => j * (NX + 1) + i;
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
      const a = vid(i, j), bb = vid(i + 1, j), cc = vid(i + 1, j + 1), dd = vid(i, j + 1);
      idx.push(a, dd, bb, bb, dd, cc);   // mặt trên (pháp tuyến +y)
    }
    const top = new THREE.BufferGeometry();
    top.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    top.setIndex(idx);
    top.computeVertexNormals();
    const bot = top.clone();
    bot.translate(0, -0.025, 0);
    const bi = bot.index.array;
    for (let k = 0; k < bi.length; k += 3) { const t = bi[k + 1]; bi[k + 1] = bi[k + 2]; bi[k + 2] = t; }   // mặt dưới lật chiều
    bot.computeVertexNormals();
    const cs = Math.cos(rotY), sn = Math.sin(rotY);
    const P = (x, y, z) => [c[0] + x * cs + z * sn, c[1] + y, c[2] - x * sn + z * cs];
    b.add(top, mat, P(0, 0, 0), [0, rotY, 0]);
    b.add(bot, mat, P(0, 0, 0), [0, rotY, 0]);
    // dây buộc ở các góc (trừ góc gió lật) + giữa 2 cạnh dài: nút vải + đoạn dây xuống nóc
    const ties = [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1]];
    for (const [u, v] of ties) {
      if (u === flapX && v === flapZ) continue;
      const x = u * hw * 0.97, z = v * hd * 0.97, y = H(u, v);
      b.box(0.22, 0.12, 0.22, cord, P(x, y + 0.04, z), [0, rotY + rnd(), 0]);
      b.strut(P(x, y + 0.02, z), P(x + u * 0.5, 0.0, z + v * 0.45), 0.035, cord, 4);
    }
  }

  /**
   * CỬA CHỚP BỌC THÉP KÍNH NGẮM: tấm thép xoay quanh bản lề che ô kính. Bình thường mở; bị pháo / mảnh nổ dập gần
   * (VehicleDamage đặt u._shutUntil) thì đóng sập (~0,1 s) bảo vệ kính, yên vài giây mới mở lại từ từ (~1 s) — updateShutters.
   * o: { hinge: [x, y, z] (hệ parent), w (dài từ bản lề), h (bề ngang còn lại), t (dày), along: 'x' | 'y' (tấm chạy từ bản lề
   *      theo trục nào khi đóng), dir: ±1, axis: 'y' | 'x' (trục bản lề), open: góc mở, tag (bộ phận mang cửa: bị bắn bay thì
   *      cửa ẩn theo), yBase }
   */
  function sightShutter(unit, parent, mat, dark, o) {
    const pivot = new THREE.Group();
    pivot.position.set(o.hinge[0], o.hinge[1], o.hinge[2]);
    const b = new PartBatch(o.yBase || 0);
    const alongY = o.along === 'y', half = o.w / 2 * o.dir;
    const C = alongY ? [0, half, 0] : [half, 0, 0];
    b.box(alongY ? o.h : o.w, alongY ? o.w : o.h, o.t, mat, C);
    // gân tăng cứng chéo + mấu bản lề + tay đẩy nhỏ ở mép tự do
    b.box(alongY ? o.h * 0.8 : 0.08, alongY ? 0.08 : o.h * 0.8, 0.06, mat, [C[0], C[1], -o.t / 2 - 0.03]);
    for (const k of [-0.32, 0.32]) b.cyl(0.07, 0.07, 0.26, 6, dark, alongY ? [k * o.h, 0, 0] : [0, k * o.h, 0], alongY ? 'x' : 'y');
    const tip = alongY ? [0, o.w * o.dir * 0.92, -o.t / 2 - 0.05] : [o.w * o.dir * 0.92, 0, -o.t / 2 - 0.05];
    b.box(alongY ? 0.3 : 0.06, alongY ? 0.06 : 0.3, 0.1, dark, tip);
    b.build(pivot);
    parent.add(pivot);
    if (o.tag) pivot.userData.partGroupTag = o.tag;
    const ax = o.axis || 'y';
    pivot.rotation[ax] = o.open;
    (unit.sightShutters || (unit.sightShutters = [])).push({ pivot, axis: ax, open: o.open, closed: 0, k: 0, tag: o.tag || null });
    return pivot;
  }
  function updateShutters(u, dt) {
    const S = u.sightShutters;
    if (!S || !(dt > 0)) return;
    const shut = (typeof performance !== 'undefined' ? performance.now() : Date.now()) < (u._shutUntil || 0);
    const lostSet = u.dmg && u.dmg.lost;
    for (const s of S) {
      // bộ phận mang cửa đã bị bắn bay (kính ngắm pháo thủ): cửa đi theo, không treo lơ lửng
      s.pivot.visible = !(s.tag && lostSet && lostSet.has(s.tag));
      const tgt = shut ? 1 : 0;
      s.k += (tgt - s.k) * Math.min(1, dt * (tgt > s.k ? 16 : 2.4));
      s.pivot.rotation[s.axis] = s.open + (s.closed - s.open) * s.k;
    }
  }

  /**
   * CÁP THÉP BỆN: đường cong mượt qua các điểm (không gãy khúc như chuỗi thanh thẳng), thân cáp có 3 tao xoắn nổi (gờ xoắn
   * ốc bước ~0,9 đv) -> bắt sáng thành thớ bện; tiết diện hơi dẹt lệch như cáp đã bị đè. b: PartBatch, pts: [[x, y, z]...]
   */
  function cable(b, pts, r, mat) {
    if (pts.length < 2) return;
    const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p[0], p[1], p[2])), false, 'centripetal');
    const len = curve.getLength(), tub = Math.max(8, Math.round(len / 0.2)), RAD = 9;
    const geo = new THREE.TubeGeometry(curve, tub, r, RAD, false);
    const pos = geo.attributes.position, v = new THREE.Vector3(), c = new THREE.Vector3(), pitch = 0.9;
    for (let i = 0; i <= tub; i++) {
      curve.getPointAt(i / tub, c);
      const s = (i / tub) * len;
      for (let j = 0; j <= RAD; j++) {
        const k = i * (RAD + 1) + j, th = (j / RAD) * Math.PI * 2;
        v.fromBufferAttribute(pos, k).sub(c);
        const m = 1 + 0.16 * Math.cos(3 * th - (s / pitch) * Math.PI * 2) - 0.05 * Math.cos(2 * th);
        v.multiplyScalar(m).add(c);
        pos.setXYZ(k, v.x, v.y, v.z);
      }
    }
    geo.computeVertexNormals();
    b.add(geo, mat, [0, 0, 0]);
  }

  // Bộ phận rời là cả một group (đầu kính quét, trạm vũ khí, ống phóng...) có thể bị bắn bay
  function registerPartGroup(unit, name, obj) {
    if (!unit || !obj) return;
    (unit.partGroups || (unit.partGroups = {}))[name] = obj;
  }

  // Texture chớp lửa đầu nòng: lõi trắng nóng -> vàng -> cam -> trong suốt, kèm tia lửa tỏa
  function getMuzzleFlashTexture() {
    if (TEX_CACHE.__flash) return TEX_CACHE.__flash;
    if (typeof document === 'undefined') return null;
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const c = size / 2;
    const g = ctx.createRadialGradient(c, c, 0, c, c, c);
    g.addColorStop(0.0, 'rgba(255,255,240,1)');
    g.addColorStop(0.18, 'rgba(255,236,150,0.95)');
    g.addColorStop(0.45, 'rgba(255,150,40,0.55)');
    g.addColorStop(1.0, 'rgba(255,80,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(255,210,120,0.5)';
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.3;
      ctx.lineWidth = 3 - (i % 3);
      ctx.beginPath();
      ctx.moveTo(c, c);
      ctx.lineTo(c + Math.cos(a) * c * 0.95, c + Math.sin(a) * c * 0.95);
      ctx.stroke();
    }
    const t = new THREE.CanvasTexture(canvas);
    TEX_CACHE.__flash = t;
    return t;
  }

  // Atlas chớp lửa pháo tự động (2x2 biến thể / texture, đổi ngẫu nhiên mỗi phát):
  //  front: nhìn dọc nòng — lõi nhỏ, 4-6 lưỡi khí cháy phụt lệch không đều, mép rách lốm đốm (không phải quả cầu tròn)
  //  side : nhìn ngang — lưỡi lửa từ miệng nòng (đỉnh ảnh) loe ra phía trước, sáng nhất cách miệng một đoạn, đuôi tõe
  //  thành các lưỡi. Màu tối đa vàng-cam (thuốc phóng ban ngày), chỉ lõi rất nhỏ ngả trắng
  function getAutocannonFlashAtlas() {
    if (TEX_CACHE.__acFlash) return TEX_CACHE.__acFlash;
    if (typeof document === 'undefined') return null;
    const hash = (x, y, s) => {
      const h = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453;
      return h - Math.floor(h);
    };
    const vnoise = (x, y, s) => {
      const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
      const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    };
    const fbm = (x, y, s) => 0.5 * vnoise(x, y, s) + 0.3 * vnoise(x * 2.1, y * 2.1, s + 7) + 0.2 * vnoise(x * 4.3, y * 4.3, s + 13);
    const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    // cường độ -> màu (alpha = cường độ; blending cộng nên màu tối tự mờ đi)
    const put = (D, i, k, hot) => {
      k = Math.max(0, Math.min(1, k));
      const w = sstep(0.72, 1.0, k * hot);
      D[i] = 255;
      D[i + 1] = Math.round(255 * Math.min(1, 0.26 + 0.42 * k + 0.3 * w));
      D[i + 2] = Math.round(255 * Math.min(1, 0.03 + 0.1 * k * k + 0.5 * w));
      D[i + 3] = Math.round(255 * k * 0.85);
    };
    const mk = (draw) => {
      const S = 256, cv = document.createElement('canvas');
      cv.width = cv.height = S;
      const ctx = cv.getContext('2d'), img = ctx.createImageData(S, S);
      draw(img.data, S);
      ctx.putImageData(img, 0, 0);
      const t = new THREE.CanvasTexture(cv);
      return t;
    };
    const front = mk((D, S) => {
      const C = S / 2;
      for (let q = 0; q < 4; q++) {
        const ox = (q % 2) * C, oy = (q >> 1) * C, s = q * 17 + 3;
        const nL = 4 + (q % 3), lobes = [];
        for (let k = 0; k < nL; k++) lobes.push({ a: (k / nL) * Math.PI * 2 + (hash(k, q, 1) - 0.5) * 1.1, len: 0.45 + hash(k, q, 2) * 0.5, p: 5 + hash(k, q, 3) * 10 });
        for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) {
          const dx = (x + 0.5) / C * 2 - 1, dy = (y + 0.5) / C * 2 - 1, r = Math.hypot(dx, dy), th = Math.atan2(dy, dx);
          let R = 0.2 + 0.1 * fbm(Math.cos(th) * 2 + 5, Math.sin(th) * 2 + 5, s);
          for (const L of lobes) R += L.len * Math.pow(Math.max(0, Math.cos(th - L.a)), L.p);
          const n = fbm(dx * 5 + q * 9, dy * 5, s);
          let k = 1 - sstep(0.25, 1.0, r / R + (n - 0.5) * 0.55);
          k *= 0.55 + 0.6 * fbm(dx * 9, dy * 9 + q * 4, s + 5);
          k += 0.9 * Math.exp(-r * r * 90);
          k *= 1 - sstep(0.85, 0.98, r);
          put(D, ((oy + y) * S + ox + x) * 4, k, 1.15 - r * 1.2);
        }
      }
    });
    const side = mk((D, S) => {
      const C = S / 2;
      for (let q = 0; q < 4; q++) {
        const ox = (q % 2) * C, oy = (q >> 1) * C, s = q * 23 + 11;
        const peak = 0.3 + hash(q, 1, 9) * 0.15;
        for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) {
          const u = (x + 0.5) / C * 2 - 1, t = (y + 0.5) / C;          // t: 0 = miệng nòng (đỉnh ảnh) -> 1 = mũi lửa
          let W = 0.1 + 0.75 * Math.sin(Math.PI * Math.pow(t, 0.7)) * (0.7 + 0.6 * fbm(t * 5, 1, s));
          W = Math.max(0.05, W);
          const n = fbm(u * 3 + q * 7, t * 9, s);                     // vệt kéo dài dọc trục -> lưỡi lửa
          let k = 1 - sstep(0.2, 1.0, Math.abs(u) / W + (n - 0.5) * 0.7);
          k *= sstep(0.0, 0.05, t) * (1 - sstep(0.45, 0.95, t + (fbm(u * 4, t * 6, s + 3) - 0.5) * 0.5));
          k *= 0.45 + 0.65 * Math.exp(-Math.pow((t - peak) / 0.2, 2));
          k *= 0.6 + 0.55 * fbm(u * 8, t * 14 + q, s + 9);
          k *= 1 - sstep(0.9, 1.0, Math.abs(u));
          put(D, ((oy + y) * S + ox + x) * 4, k, 1.2 - t * 1.1);
        }
      }
    });
    TEX_CACHE.__acFlash = { front, side };
    return TEX_CACHE.__acFlash;
  }

  // Decal chữ số hiệu chiến thuật (nền trong suốt; sơn trắng đã bạc, ngả màu như ngoài chiến trường)
  // worn = true: chữ sơn phai tróc lỗ chỗ, xước ngang, nửa dưới mờ bụi (xe đã qua chiến trường)
  // seed: hạt giống vết tróc (dựng lại xe vẫn tróc đúng chỗ cũ)
  function createStencilDecal(text, w, h, color = 'rgba(214,210,194,0.72)', worn = false, seed = null) {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = Math.round(256 * h / w);
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = color;
    ctx.font = `bold ${Math.round(canvas.height * 0.78)}px "Arial Narrow", Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 2);
    // Khe hở khuôn stencil
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillRect(0, canvas.height * 0.47, canvas.width, canvas.height * 0.06);
    if (worn) {
      const rnd = mulberry32(seed != null ? seed | 0 : (Math.random() * 1e9) | 0);
      const W = canvas.width, H = canvas.height;
      for (let i = 0; i < 260; i++) {
        ctx.fillStyle = `rgba(0,0,0,${0.3 + rnd() * 0.7})`;
        ctx.beginPath();
        ctx.arc(rnd() * W, rnd() * H, 0.5 + rnd() * rnd() * 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      for (let i = 0; i < 7; i++) {
        ctx.strokeStyle = `rgba(0,0,0,${0.5 + rnd() * 0.5})`;
        ctx.lineWidth = 0.8 + rnd() * 2;
        const y = rnd() * H, x = rnd() * W * 0.7;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + W * (0.15 + rnd() * 0.4), y + (rnd() - 0.5) * H * 0.2);
        ctx.stroke();
      }
      const g = ctx.createLinearGradient(0, H * 0.45, 0, H);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.55)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.MeshStandardMaterial({
      map: tex, transparent: true, roughness: 0.9, metalness: 0,
      polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false
    });
    return new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  }

  return {
    UV_SCALE,
    getEnvCube,         // bản đồ phản chiếu trời / đất dùng chung (ô tô trên phố: props.js)
    getPaintTextures,
    createMaterials,
    dirtyMaterial,
    holedDisc,
    toothedRing,
    diehlLink,
    lookSeed,
    lookRng,
    tireGeometry,
    applyBoxUV,
    mergeGeometries,
    PartBatch,
    loft,
    loftRings,
    insetPolygon,
    sideProfile,
    WheelSet,
    TrackSystem,
    AntennaSet,
    registerPartGroup,
    idCloth,
    cable,
    sightShutter,
    updateShutters,
    buildTrackPath,
    samplePath,
    createStencilDecal,
    getMuzzleFlashTexture,
    getAutocannonFlashAtlas,
    orientBetween,
    bezier3,
    mulberry32
  };
})();

if (typeof window !== 'undefined') {
  window.VehicleKit = VehicleKit;
}
