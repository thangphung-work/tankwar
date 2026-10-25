/**
 * HÌNH HÒM TIẾP TẾ (supply_manager.js) — dựng như hàng tiếp tế quân sự thật, 8 đơn vị = 1 m, gốc nhóm = mặt đất giữa
 * pallet (hòm thả dù: gốc giữa khối hàng, đáy ở y = -9 như trước):
 *  · AMMO   — pallet gỗ chất thùng đạn gỗ sơn ô liu (nẹp đầu, quai thừng, khoá, chữ kẻ vàng) + hộp đạn thép, dây chằng
 *  · SPEED  — 2 phuy dầu 200 L + can xăng 20 L kiểu NATO (gân chữ X, 3 quai), dây chằng
 *  · REPAIR — hòm đồ nghề thép, 2 đoạn xích dự phòng + bánh chịu tải xếp trên, can dầu, dây chằng
 *  · ALL    — pallet hàng hỗn hợp (thùng đạn, hòm y tế chữ thập đỏ, hộp đạn) trùm lưới hàng
 *  · thả dù — túi hàng bạt kiểu A-22 trên tấm đế gỗ + đệm giấy tổ ong, đai dọc / đai ngang, khoá treo; dù tròn ô liu
 *    nhiều múi phồng, lỗ thoát khí đỉnh, dây dù tụ về đai treo; tiếp đất thì dù xẹp nằm cạnh hòm (collapsedChute)
 *  · ống lựu đạn khói tín hiệu (kiểu M18) nằm trên đất cạnh hòm — chỗ phát khói (SMOKE: toạ độ trong nhóm hòm)
 * Mỗi kiểu dựng 1 lần (gộp theo vật liệu -> vài lần vẽ), các hòm cùng kiểu dùng chung hình. Bề mặt: texture thủ tục
 * + normal map (ván ghép sơn có rãnh, thớ gỗ, tróc sơn, xước, thép sần, bạt dệt), khối chính vát cạnh bắt sáng, tối dần
 * ở chân / kẽ hàng (che khuất), vệt bóng mềm dưới pallet; cũ theo thời gian bằng Weathering (bạc nắng, bùn, vệt mưa).
 */
const SupplyCrateModel = (() => {
  const TAU = Math.PI * 2;
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const M4 = (x, y, z, rx, ry, rz) => new THREE.Matrix4().compose(V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0)), V3(1, 1, 1));
  const mul = (a, b) => new THREE.Matrix4().multiplyMatrices(a, b);
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const col = (hex, k) => new THREE.Color(hex).multiplyScalar(k === undefined ? 1 : k);

  // bảng màu (không gian màu như các vật khác của game — không bật sRGB)
  const C = {
    olive: 0x4a4c2f, olive2: 0x51532f, oliveDk: 0x37392a, sand: 0x8a7c58, steel: 0x3c3f3d, steelLt: 0x5d605c,
    strap: 0x4d4c35, rope: 0x7d6b4a, rubber: 0x1d1d1c, canvas: 0x676648, card: 0x9a8862, net: 0x3c4130,
    woods: [0x8a6a44, 0x7a5c38, 0x93734b, 0x6f5434, 0x84653f], ply: 0x9c8158,
    yellow: 0xc4a245, white: 0xd8d4c6, black: 0x22221c
  };

  // ---------------------------------------------------------------------------
  // TEXTURE THỦ TỤC (lặp, vẽ canvas 1 lần): mỗi loại có ảnh độ sáng (xám — màu sơn / gỗ lấy từ màu đỉnh từng chi tiết)
  // + normal map dựng từ trường độ cao (rãnh ván, thớ gỗ, mép tróc sơn, sần sơn thép, sợi bạt dệt bắt sáng thật).
  // Tỉ lệ: 1 ô ảnh = TILE đơn vị thế giới (UV chiếu theo kích thước thật — projUV)
  // ---------------------------------------------------------------------------
  const TILE = { wood: 16, paint: 12, steel: 10, cloth: 6, rubber: 8 };
  function noise2(S, seed, cells) {
    // nhiễu giá trị tuần hoàn (lặp liền mép) cỡ ô `cells`
    const R = rng(seed), n = cells, g = new Float32Array(n * n);
    for (let i = 0; i < g.length; i++) g[i] = R();
    return (x, y) => {
      const fx = x / S * n, fy = y / S * n, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
      const a = g[((iy % n + n) % n) * n + ((ix % n + n) % n)], b = g[((iy % n + n) % n) * n + (((ix + 1) % n + n) % n)];
      const c = g[(((iy + 1) % n + n) % n) * n + ((ix % n + n) % n)], d = g[(((iy + 1) % n + n) % n) * n + (((ix + 1) % n + n) % n)];
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
    };
  }
  // trường độ cao H + độ sáng A (0..1) -> { map, normalMap } (normal theo độ dốc H, lặp liền mép)
  function texPair(S, H, A, strength) {
    const mk = () => { const c = document.createElement('canvas'); c.width = c.height = S; return c; };
    const cm = mk(), cn = mk(), gm = cm.getContext('2d'), gn = cn.getContext('2d');
    const im = gm.createImageData(S, S), inn = gn.createImageData(S, S), D = im.data, N = inn.data;
    const h = (x, y) => H[((y + S) % S) * S + ((x + S) % S)];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4, a = Math.max(0, Math.min(1, A[y * S + x])) * 255;
      D[i] = D[i + 1] = D[i + 2] = a; D[i + 3] = 255;
      const dx = (h(x + 1, y) - h(x - 1, y)) * strength, dy = (h(x, y + 1) - h(x, y - 1)) * strength, l = Math.hypot(dx, dy, 1);
      N[i] = (-dx / l * 0.5 + 0.5) * 255; N[i + 1] = (dy / l * 0.5 + 0.5) * 255; N[i + 2] = (1 / l * 0.5 + 0.5) * 255; N[i + 3] = 255;
    }
    gm.putImageData(im, 0, 0); gn.putImageData(inn, 0, 0);
    const t = (c) => { const x = new THREE.CanvasTexture(c); x.wrapS = x.wrapT = THREE.RepeatWrapping; x.anisotropy = 4; return x; };
    return { map: t(cm), normalMap: t(cn) };
  }
  // vết xước mảnh / đốm tróc rải ngẫu nhiên lên H, A (lặp liền mép)
  function scratches(S, H, A, R, n, dh, da) {
    for (let k = 0; k < n; k++) {
      let x = R() * S, y = R() * S; const a = R() * TAU, len = 6 + R() * 40;
      for (let s = 0; s < len; s++) {
        const i = ((Math.round(y) % S + S) % S) * S + ((Math.round(x) % S + S) % S);
        H[i] -= dh; A[i] = Math.min(1, A[i] + da);
        x += Math.cos(a + Math.sin(s * 0.2) * 0.2); y += Math.sin(a + Math.sin(s * 0.2) * 0.2);
      }
    }
  }
  function chips(S, H, A, R, n, rmax, dh, da) {
    for (let k = 0; k < n; k++) {
      const cx = R() * S, cy = R() * S, r = 1.5 + R() * rmax;
      for (let y = -r - 1; y <= r + 1; y++) for (let x = -r - 1; x <= r + 1; x++) {
        const d = Math.hypot(x, y * 1.3) / r + (R() - 0.5) * 0.25;
        if (d > 1) continue;
        const i = ((Math.round(cy + y) % S + S) % S) * S + ((Math.round(cx + x) % S + S) % S);
        H[i] -= dh; A[i] = Math.min(1, A[i] + da * (1 - d * 0.3));
      }
    }
  }
  const TEX = {};
  function tex(kind) {
    if (TEX[kind]) return TEX[kind];
    const S = kind === 'wood' || kind === 'paint' ? 512 : 256, H = new Float32Array(S * S), A = new Float32Array(S * S), R = rng(kind.length * 131 + 7);
    if (kind === 'wood') {
      // gỗ thô pallet: thớ dọc theo u (ngang ảnh) uốn lượn, mắt gỗ, vân sớm / muộn, bẩn loang, đinh
      const nB = noise2(S, 3, 6), nF = noise2(S, 5, 64), nD = noise2(S, 9, 8), knots = Array.from({ length: 5 }, () => [R() * S, R() * S, 5 + R() * 9]);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        let v = y / S * 46 + nB(x, y) * 6;
        for (const [kx, ky, kr] of knots) { const dx = (x - kx) / 3, dy = y - ky, d = Math.hypot(dx, dy); if (d < kr * 3) v += Math.exp(-d / kr) * 5 * Math.sign(dy || 1); }
        const ring = 0.5 + 0.5 * Math.sin(v * TAU / 2.2), fine = nF(x * 4 % S, y);
        let a = 0.78 + 0.12 * ring + 0.08 * fine - 0.12 * Math.max(0, nD(x, y) - 0.55);
        for (const [kx, ky, kr] of knots) { const d = Math.hypot((x - kx) / 1.6, y - ky); if (d < kr) a -= (1 - d / kr) * 0.35; }
        H[y * S + x] = ring * 0.35 + fine * 0.25; A[y * S + x] = a;
      }
      scratches(S, H, A, R, 30, 0.3, -0.08);
    } else if (kind === 'paint') {
      // thùng gỗ sơn: ván ghép (rãnh nối theo u, 4 ván / ô), thớ gỗ lộ dưới lớp sơn, sơn tróc mép, xước, đốm bẩn
      const nF = noise2(S, 11, 96), nB = noise2(S, 13, 5), nD = noise2(S, 17, 10), boards = 4;
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const fv = (y / S * boards) % 1, seam = Math.min(fv, 1 - fv) * S / boards;   // khoảng cách tới rãnh (điểm ảnh)
        const groove = seam < 2.2 ? (1 - seam / 2.2) : 0;
        const grain = 0.5 + 0.5 * Math.sin((y / S * 70 + nB(x, y) * 5) * TAU / 2);
        let a = 0.86 + 0.05 * grain + 0.04 * nF(x, y) - 0.35 * groove - 0.1 * Math.max(0, nD(x, y) - 0.6);
        H[y * S + x] = -groove * 1.2 + grain * 0.12 + nF(x, y) * 0.08; A[y * S + x] = a;
      }
      chips(S, H, A, R, 60, 5, 0.35, 0.14);
      scratches(S, H, A, R, 70, 0.25, 0.12);
    } else if (kind === 'steel') {
      // thép sơn: sần vỏ cam, vết xước, móp nhẹ, đốm tróc
      const nF = noise2(S, 21, 64), nM = noise2(S, 23, 6);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        H[y * S + x] = nF(x, y) * 0.25 + nM(x, y) * 0.6; A[y * S + x] = 0.88 + 0.06 * nF(x, y) - 0.06 * nM(x, y);
      }
      chips(S, H, A, R, 22, 3, 0.3, 0.1);
      scratches(S, H, A, R, 45, 0.2, 0.1);
    } else if (kind === 'cloth') {
      // bạt / đai dệt: sợi ngang dọc đan xen, xơ vải, loang bẩn
      const nF = noise2(S, 31, 48), nD = noise2(S, 33, 6), P = 4;
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const wx = Math.sin(x / P * Math.PI), wy = Math.sin(y / P * Math.PI), over = ((Math.floor(x / P) + Math.floor(y / P)) & 1) ? wx * wx : wy * wy;
        H[y * S + x] = over * 0.6 + nF(x, y) * 0.2; A[y * S + x] = 0.84 + 0.1 * over + 0.05 * nF(x, y) - 0.14 * Math.max(0, nD(x, y) - 0.55);
      }
    } else {
      // cao su: hạt mịn, mòn
      const nF = noise2(S, 41, 80);
      for (let i = 0; i < S * S; i++) { const x = i % S, y = i / S | 0; H[i] = nF(x, y) * 0.3; A[i] = 0.9 + 0.08 * nF(x, y); }
    }
    return (TEX[kind] = texPair(S, H, A, kind === 'paint' ? 2.4 : kind === 'cloth' ? 2.2 : 1.6));
  }
  // vệt bóng mềm dưới hòm (đổ lên đất: hòm "ngồi" trên mặt đất, không lơ lửng)
  function shadowTex() {
    const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d'), gr = g.createRadialGradient(S / 2, S / 2, S * 0.18, S / 2, S / 2, S / 2);
    gr.addColorStop(0, 'rgba(0,0,0,0.85)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    return new THREE.CanvasTexture(c);
  }

  // ---------------------------------------------------------------------------
  // TẤM CHỮ KẺ SƠN (atlas 4 x 4 ô 256 x 128)
  // ---------------------------------------------------------------------------
  // nội dung từng ô atlas: dòng chữ (trắng — tô màu bằng màu đỉnh) hoặc vẽ riêng (chữ thập đỏ giữ màu thật)
  const DECALS = [
    ['AMMUNITION', 'CTG 7.62MM BALL M80'], ['CTG 120MM HE', 'LOT 4-17  1 RD'], ['DIESEL'], ['JP-8  FUEL'],
    ['TOOLS'], ['SPARE PARTS', 'NSN 2530-01'], ['THIS SIDE UP', '↑   ↑'], ['AIRDROP', 'SUPPLY 2/3'],
    ['OIL', 'OE/HDO-15'], 'cross', ['MEDICAL', 'FIRST AID'], ['DANGER', 'EXPLOSIVES 1.1D']
  ];
  function decalAtlas() {
    const W = 1024, H = 512, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'), R = rng(11);
    DECALS.forEach((d, i) => {
      const x0 = (i % 4) * 256, y0 = (i / 4 | 0) * 128;
      g.save(); g.beginPath(); g.rect(x0, y0, 256, 128); g.clip();
      if (d === 'cross') {
        g.fillStyle = '#e8e6de'; g.beginPath(); g.arc(x0 + 128, y0 + 64, 56, 0, TAU); g.fill();
        g.fillStyle = '#b3241f'; g.fillRect(x0 + 116, y0 + 22, 24, 84); g.fillRect(x0 + 86, y0 + 52, 84, 24);
      } else {
        g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
        const two = d.length > 1;
        const fit = (txt, px, y) => {
          g.font = `bold ${px}px "Arial Narrow", "Roboto Condensed", Arial, sans-serif`;
          if (g.letterSpacing !== undefined) g.letterSpacing = Math.round(px * 0.08) + 'px';
          const w = g.measureText(txt).width, s = Math.min(1, 236 / w);
          g.save(); g.translate(x0 + 128, y); g.scale(s, 1); g.fillText(txt, 0, 0); g.restore();
        };
        if (two) { fit(d[0], 50, y0 + 42); fit(d[1], 30, y0 + 92); } else fit(d[0], 76, y0 + 66);
      }
      // sơn phun qua khuôn: mép lốm đốm, tróc vài chỗ
      g.globalCompositeOperation = 'destination-out';
      for (let k = 0; k < 900; k++) { g.globalAlpha = 0.2 + R() * 0.6; g.fillRect(x0 + R() * 256, y0 + R() * 128, 1 + R() * 3, 1 + R() * 2); }
      for (let k = 0; k < 3; k++) {
        const fx = x0 + R() * 256, gr = g.createRadialGradient(fx, y0 + R() * 128, 4, fx, y0 + 64, 60 + R() * 60);
        gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.globalAlpha = 1; g.fillStyle = gr; g.fillRect(x0, y0, 256, 128);
      }
      g.restore();
    });
    const t = new THREE.CanvasTexture(c); t.anisotropy = 4;
    return t;
  }

  // ---------------------------------------------------------------------------
  // VẬT LIỆU dùng chung (màu theo đỉnh; phong hoá theo toạ độ vật — hòm thả dù rơi không trượt hoa văn)
  // ---------------------------------------------------------------------------
  let MAT = null;
  function mats() {
    if (MAT) return MAT;
    const WX = typeof Weathering !== 'undefined' ? Weathering : null;
    const std = (o, wx, over) => {
      const m = new THREE.MeshStandardMaterial(Object.assign({ color: 0xffffff, vertexColors: true }, o));
      if (WX && wx) WX.apply(m, wx, Object.assign({ space: 'local' }, over));
      return m;
    };
    const tx = (k, n) => { const t = tex(k); return { map: t.map, normalMap: t.normalMap, normalScale: new THREE.Vector2(n, n) }; };
    MAT = {
      wood: std(Object.assign(tx('wood', 0.9), { roughness: 0.95 }), 'wood', { moss: 0.3, grimeH: 1.6, dust: 0.5 }),
      paint: std(Object.assign(tx('paint', 1), { roughness: 0.86, metalness: 0.02 }), 'paint', { rust: 0.06, chip: 0.2, grimeH: 1.8, dust: 0.65, streak: 0.6 }),   // sơn ô liu trên gỗ / thép
      steel: std(Object.assign(tx('steel', 0.7), { roughness: 0.6, metalness: 0.12 }), 'paint', { rust: 0.5, chip: 0.2, grimeH: 1.6, dust: 0.5 }),   // thép sơn: không bóng kim loại
      cloth: std(Object.assign(tx('cloth', 0.8), { roughness: 1 }), 'card', { stain: 0.55, grime: 0.6, grimeH: 1.4, fade: 0.5 }),   // đai, bạt, thừng, lưới
      rubber: std(Object.assign(tx('rubber', 0.6), { roughness: 0.95 }), 'soil', { dust: 0.5 }),
      shadow: new THREE.MeshBasicMaterial({ map: shadowTex(), transparent: true, opacity: 0.62, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
      decal: new THREE.MeshStandardMaterial({ map: decalAtlas(), vertexColors: true, transparent: true, alphaTest: 0.3, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, roughness: 0.85 }),
      canopy: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }),
      line: new THREE.LineBasicMaterial({ color: 0x34342b })
    };
    return MAT;
  }

  // ---------------------------------------------------------------------------
  // BỘ DỰNG: gom hình theo vật liệu, màu từng chi tiết ghi vào màu đỉnh, có ngăn xếp phép đặt (đặt cả cụm rồi xoay)
  // ---------------------------------------------------------------------------
  class B {
    constructor(seed) { this.parts = new Map(); this.T = new THREE.Matrix4(); this.r = rng(seed); this.lines = []; }
    push(m) { const old = this.T; this.T = mul(this.T, m); return old; }
    pop(old) { this.T = old; }
    rv(a) { return 1 + (this.r() - 0.5) * 2 * a; }               // hệ số lệch ngẫu nhiên ±a
    add(m, geo, mtx, c) {
      if (!this.parts.has(m)) this.parts.set(m, []);
      this.parts.get(m).push([geo, mul(this.T, mtx), c]);
    }
    // hộp tâm (x, y, z), cỡ (sx, sy, sz): khối đủ lớn được vát cạnh (cạnh bắt sáng như đồ thật, không sắc lẹm như hộp
    // dựng hình); UV theo kích thước thật, thớ / rãnh ván chạy theo cạnh dài nhất của từng mặt
    box(m, c, x, y, z, sx, sy, sz, ry, rx, rz, bev) {
      const mn = Math.min(sx, sy, sz);
      if (bev === undefined) bev = mn < 0.7 ? 0 : m === 'paint' ? 0.11 : m === 'steel' ? 0.07 : m === 'wood' ? 0.05 : 0;
      const g = bev > 0 ? chamferBox(sx, sy, sz, Math.min(bev, mn / 3)) : new THREE.BoxGeometry(sx, sy, sz);
      if (TILE[m]) projUV(g, [sx, sy, sz], TILE[m]);
      this.add(m, g, M4(x, y, z, rx, ry, rz), c);
    }
    // trụ đứng tâm (x, y, z) — rx / rz để nằm ngang
    cyl(m, c, x, y, z, r, h, seg, rx, rz, r2) {
      const g = new THREE.CylinderGeometry(r, r2 === undefined ? r : r2, h, seg || 16);
      if (TILE[m]) cylUV(g, TILE[m]);
      this.add(m, g, M4(x, y, z, rx, 0, rz), c);
    }
    // tấm chữ kẻ (ô atlas id) quay mặt về +z (ry xoay quanh trục đứng)
    decal(id, c, x, y, z, w, h, ry) {
      const g = new THREE.PlaneGeometry(w, h), uv = g.attributes.uv, u0 = (id % 4) / 4, v0 = 1 - ((id / 4 | 0) + 1) / 4;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) / 4, v0 + uv.getY(i) / 4);
      this.add('decal', g, M4(x, y, z, 0, ry || 0, 0), c);
    }
    line(a, b) { const A = a.clone().applyMatrix4(this.T), Bp = b.clone().applyMatrix4(this.T); this.lines.push(A.x, A.y, A.z, Bp.x, Bp.y, Bp.z); }
    // gộp: mỗi vật liệu 1 hình
    bake() {
      const M = mats(), out = [];
      for (const [m, list] of this.parts) out.push({ geo: merge(list, m === 'decal' || m === 'shadow' ? null : this.ground || 0), mat: M[m], cast: m !== 'decal' && m !== 'shadow', recv: m !== 'shadow' });
      if (this.lines.length) {
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.lines, 3));
        out.push({ geo: g, mat: M.line, line: true });
      }
      return out;
    }
  }
  function projUV(g, size, tile) {
    const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
      const axis = ax > ay && ax > az ? 0 : ay > az ? 1 : 2, o = [0, 1, 2].filter(a => a !== axis);
      const [a, b] = size[o[0]] >= size[o[1]] ? o : [o[1], o[0]];
      const P = [p.getX(i), p.getY(i), p.getZ(i)];
      uv.setXY(i, P[a] / tile, P[b] / tile);
    }
  }
  // hộp vát cạnh c (đùn hình chữ nhật có vát)
  function chamferBox(sx, sy, sz, c) {
    const sh = new THREE.Shape();
    sh.moveTo(-sx / 2 + c, -sy / 2 + c); sh.lineTo(sx / 2 - c, -sy / 2 + c); sh.lineTo(sx / 2 - c, sy / 2 - c); sh.lineTo(-sx / 2 + c, sy / 2 - c); sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: sz - 2 * c, bevelEnabled: true, bevelThickness: c, bevelSize: c, bevelSegments: 1, curveSegments: 1 });
    g.translate(0, 0, -(sz - 2 * c) / 2);
    return g;
  }
  // UV trụ: thân quấn quanh theo chu vi thật, hai đáy chiếu phẳng
  function cylUV(g, tile) {
    const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      if (Math.abs(n.getY(i)) > 0.5) uv.setXY(i, x / tile, z / tile);
      else uv.setXY(i, Math.atan2(z, x) * Math.hypot(x, z) / tile, y / tile);
    }
  }
  // gộp; ground (cao độ đáy nhóm) khác null: ghi thêm độ che khuất vào màu đỉnh — tối dần xuống sát đất và ở chân từng
  // chi tiết (kẽ giữa các thùng, gầm pallet), như bóng che khuất ánh trời của đồ thật
  function merge(list, ground) {
    let total = 0;
    const geos = list.map(([g, m, c]) => { const n = g.index ? g.toNonIndexed() : g; n.applyMatrix4(m); total += n.attributes.position.count; return [n, c]; });
    const pos = new Float32Array(total * 3), nrm = new Float32Array(total * 3), uv = new Float32Array(total * 2), cl = new Float32Array(total * 3);
    let o = 0;
    for (const [g, c] of geos) {
      const n = g.attributes.position.count;
      pos.set(g.attributes.position.array, o * 3);
      if (!g.attributes.normal) g.computeVertexNormals();
      nrm.set(g.attributes.normal.array, o * 3);
      if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
      const cc = c || new THREE.Color(1, 1, 1), P = g.attributes.position.array;
      let y0 = Infinity, y1 = -Infinity;
      if (ground !== null) for (let i = 1; i < P.length; i += 3) { if (P[i] < y0) y0 = P[i]; if (P[i] > y1) y1 = P[i]; }
      const span = Math.max(0.3, Math.min(1.4, (y1 - y0) * 0.45));
      for (let i = 0; i < n; i++) {
        let k = 1;
        if (ground !== null) {
          const y = P[i * 3 + 1], tg = Math.min(1, Math.max(0, (y - ground) / 3)), tp = Math.min(1, Math.max(0, (y - y0) / span));
          k = (0.6 + 0.4 * tg * tg * (3 - 2 * tg)) * (0.8 + 0.2 * tp * tp * (3 - 2 * tp));
        }
        cl[(o + i) * 3] = cc.r * k; cl[(o + i) * 3 + 1] = cc.g * k; cl[(o + i) * 3 + 2] = cc.b * k;
      }
      o += n;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    out.setAttribute('color', new THREE.BufferAttribute(cl, 3));
    out.computeBoundingSphere();
    return out;
  }

  // ---------------------------------------------------------------------------
  // CHI TIẾT
  // ---------------------------------------------------------------------------
  const plank = (b) => col(C.woods[b.r() * C.woods.length | 0], b.rv(0.08));
  // pallet gỗ sx x sz: 3 ván đế, 9 cục kê, 3 ván giằng dọc, 7 ván mặt; trả về cao độ mặt pallet
  function pallet(b, sx, sz) {
    const zs = [-sz / 2 + 1.1, 0, sz / 2 - 1.1], xs = [-sx / 2 + 1, 0, sx / 2 - 1];
    for (const z of zs) b.box('wood', plank(b), 0, 0.125, z, sx, 0.25, 2.2);
    for (const x of xs) for (const z of zs) b.box('wood', col(C.woods[3], b.rv(0.1)), x, 0.7, z, 2, 0.9, 2.2);
    for (const x of xs) b.box('wood', plank(b), x, 1.275, 0, 2, 0.25, sz);
    for (let i = 0; i < 7; i++) b.box('wood', plank(b), (b.r() - 0.5) * 0.15, 1.525, -sz / 2 + 0.85 + i * (sz - 1.7) / 6, sx, 0.25, 1.55, (b.r() - 0.5) * 0.01);
    return 1.65;
  }
  // thùng đạn gỗ sơn ô liu (đáy tại y): thân, đường mép nắp, nẹp hai đầu, quai thừng, 2 khoá, chữ kẻ vàng mặt trước
  function ammoBox(b, x, y, z, ry, id) {
    const L = 7.2, H = 2.8, D = 3.6, s = b.push(M4(x, y, z, 0, ry, 0)), oc = col(C.olive, b.rv(0.08)).offsetHSL((b.r() - 0.5) * 0.03, (b.r() - 0.5) * 0.12, 0);
    b.box('paint', oc, 0, H / 2, 0, L, H, D);
    b.box('paint', col(C.oliveDk, 0.9), 0, H * 0.79, 0, L + 0.06, 0.12, D + 0.06);
    for (const e of [-1, 1]) {
      b.box('paint', oc.clone().multiplyScalar(0.9), e * (L / 2 + 0.15), H / 2, 0, 0.3, H, D);
      b.box('cloth', col(C.rope, b.rv(0.1)), e * (L / 2 + 0.42), H * 0.58, 0, 0.22, 0.22, 1.7);
      for (const q of [-1, 1]) b.box('cloth', col(C.rope), e * (L / 2 + 0.36), H * 0.58, q * 0.85, 0.16, 0.5, 0.16);
    }
    for (const q of [-1, 1]) b.box('steel', col(C.steelLt), q * L / 4, H * 0.7, D / 2 + 0.06, 0.55, 0.65, 0.12);
    b.decal(id, col(C.yellow, b.rv(0.05)), -0.2, H * 0.4, D / 2 + 0.03, 4.4, 2.2);
    b.pop(s);
    return y + H;
  }
  // hộp đạn thép (kiểu M2A1): thân, viền nắp, quai xách trên nắp, cần khoá đầu hộp
  function ammoCan(b, x, y, z, ry) {
    const L = 2.4, H = 1.5, W = 1.2, s = b.push(M4(x, y, z, 0, ry, 0)), c = col(C.olive2, b.rv(0.06));
    b.box('steel', c, 0, H / 2, 0, L, H, W);
    b.box('steel', c.clone().multiplyScalar(0.85), 0, H - 0.1, 0, L + 0.12, 0.2, W + 0.12);
    b.box('steel', col(C.steel), 0, H + 0.32, 0, 1.0, 0.12, 0.14);
    for (const q of [-1, 1]) b.box('steel', col(C.steel), q * 0.45, H + 0.15, 0, 0.1, 0.3, 0.1);
    b.box('steel', c.clone().multiplyScalar(0.8), L / 2 + 0.07, H * 0.62, 0, 0.12, 0.85, 0.5);
    b.decal(0, col(C.yellow), 0, H * 0.45, W / 2 + 0.03, 1.8, 0.9);
    b.pop(s);
  }
  // can 20 L kiểu NATO: thân, gân chữ X hai mặt rộng, 3 quai trên nóc, vòi rót
  function jerrycan(b, x, y, z, ry, c0) {
    const W = 2.76, H = 3.8, T = 1.32, s = b.push(M4(x, y, z, 0, ry, 0)), c = col(c0 || C.olive, b.rv(0.06));
    b.box('paint', c, 0, (H - 0.3) / 2, 0, W, H - 0.3, T);
    b.box('paint', c.clone().multiplyScalar(0.92), 0, H - 0.22, 0, W - 0.3, 0.16, T - 0.2);
    const dw = W * 0.78, dh = (H - 0.3) * 0.78, a = Math.atan2(dh, dw), len = Math.hypot(dw, dh);
    for (const e of [-1, 1]) for (const q of [-1, 1]) b.box('paint', c.clone().multiplyScalar(1.07), 0, (H - 0.3) / 2, e * (T / 2 + 0.04), len, 0.32, 0.08, 0, 0, q * a);
    for (const hx of [-0.75, 0, 0.75]) b.box('paint', c.clone().multiplyScalar(0.95), hx, H - 0.12, 0, 0.24, 0.34, T * 0.8);
    b.cyl('paint', c.clone().multiplyScalar(0.85), W / 2 - 0.5, H - 0.05, 0, 0.3, 0.55, 10, 0, -0.55);
    b.pop(s);
  }
  // phuy 200 L: thân, 2 đai lăn, vành mép trên / dưới, mặt nắp lõm, 2 nút, chữ kẻ (quay về hướng ry)
  function drum(b, x, y, z, ry, c0, id) {
    const R = 2.32, H = 7, s = b.push(M4(x, y, z, 0, ry, 0)), c = col(c0, b.rv(0.06));
    b.cyl('steel', c, 0, H / 2, 0, R, H, 22);
    for (const t of [H / 3, H * 2 / 3]) b.cyl('steel', c.clone().multiplyScalar(0.85), 0, t, 0, R + 0.1, 0.22, 22);
    for (const t of [0.12, H - 0.06]) b.cyl('steel', c.clone().multiplyScalar(0.9), 0, t, 0, R + 0.06, 0.26, 22);
    b.cyl('steel', c.clone().multiplyScalar(0.75), 0, H - 0.14, 0, R - 0.12, 0.05, 22);
    for (const q of [-1, 1]) b.cyl('steel', col(C.steelLt), q * 1.15, H - 0.08, 0.2, 0.34, 0.14, 8);
    if (id !== undefined) b.decal(id, col(C.white, 0.95), 0, H * 0.5, R + 0.03, 2.1, 1.05);
    b.pop(s);
    return y + H;
  }
  // hòm đồ nghề thép sơn ô liu: thân, nắp chờm, 2 gân ngang, quai hai đầu, 2 khoá cài, chữ kẻ mặt trước
  function toolChest(b, x, y, z, ry, L, H, D, id, c0) {
    const s = b.push(M4(x, y, z, 0, ry, 0)), c = col(c0 || C.olive, b.rv(0.06));
    b.box('paint', c, 0, H / 2, 0, L, H, D);
    b.box('paint', c.clone().multiplyScalar(0.88), 0, H + 0.3, 0, L + 0.24, 0.6, D + 0.24);
    for (const t of [0.2, 0.8]) b.box('paint', c.clone().multiplyScalar(0.93), 0, H * t, 0, L + 0.1, 0.24, D + 0.1);
    for (const e of [-1, 1]) {
      b.box('steel', col(C.steel), e * (L / 2 + 0.3), H * 0.72, 0, 0.14, 0.18, 2.2);
      for (const q of [-1, 1]) b.box('steel', col(C.steel), e * (L / 2 + 0.17), H * 0.72, q * 1.05, 0.22, 0.32, 0.14);
    }
    for (const q of [-1, 1]) b.box('steel', col(C.steelLt), q * L * 0.3, H - 0.15, D / 2 + 0.16, 0.5, 0.7, 0.12);
    if (id !== undefined) b.decal(id, id === 9 ? new THREE.Color(1, 1, 1) : col(C.white, 0.92), 0, H * 0.5, D / 2 + 0.03, id === 9 ? 2.6 : 3.4, id === 9 ? 1.3 : 1.7);
    b.pop(s);
    return y + H + 0.6;
  }
  // đoạn xích dự phòng n mắt nằm phẳng dọc trục x (đáy tại y)
  function trackSection(b, x, y, z, ry, n) {
    const s = b.push(M4(x, y, z, 0, ry, 0)), P = 1.35;
    for (let i = 0; i < n; i++) {
      const xi = (i - (n - 1) / 2) * P;
      b.box('steel', col(C.steel, b.rv(0.08)), xi, 0.22, 0, 1.15, 0.44, 5.2);
      for (const q of [-1, 1]) b.box('rubber', col(C.rubber), xi, 0.5, q * 1.3, 0.85, 0.12, 1.9);
      b.box('steel', col(C.steelLt, 0.8), xi, 0.62, 0, 0.5, 0.36, 0.5);   // vấu dẫn hướng
      b.cyl('steel', col(C.steel, 0.9), xi + P / 2, 0.22, 0, 0.2, 5.5, 8, Math.PI / 2);
    }
    b.pop(s);
    return y + 0.68;
  }
  // ống lựu đạn khói tín hiệu kiểu M18 nằm trên đất (gốc giữa thân, sát đất), đầu phụt khói hướng +x; band: màu khói
  function smokeCanister(b, x, y, z, ry, band) {
    const s = b.push(M4(x, y, z, 0, ry, 0)), r = 0.33, L = 1.15;
    b.cyl('steel', col(C.oliveDk, 1.1), 0, r, 0, r, L, 14, 0, Math.PI / 2);
    b.cyl('paint', col(band), L / 2 - 0.12, r, 0, r + 0.01, 0.2, 14, 0, Math.PI / 2);
    b.cyl('steel', col(0x1a1a16), L / 2 + 0.03, r, 0, r * 0.85, 0.06, 14, 0, Math.PI / 2);   // nắp cháy đen chỗ phụt khói
    b.box('steel', col(C.steelLt, 0.8), -0.9, 0.04, 0.55, 0.9, 0.05, 0.2, 0.6);               // chốt bẩy rơi bên cạnh
    b.add('shadow', new THREE.PlaneGeometry(2.6, 1.6).rotateX(-Math.PI / 2), M4(L / 2 + 0.9, 0.05, 0), null);   // sém đất trước miệng phụt
    b.pop(s);
  }
  // bánh chịu tải đôi nằm phẳng (đáy tại y): 2 lốp cao su, đĩa thép, may-ơ
  function roadWheel(b, x, y, z) {
    const R = 3.2;
    for (const t of [0.3, 1.3]) { b.cyl('rubber', col(C.rubber), x, y + t, z, R, 0.6, 24); b.cyl('paint', col(C.olive), x, y + t, z, R - 0.5, 0.64, 24); }
    b.cyl('steel', col(C.steel), x, y + 0.8, z, R - 1.0, 0.4, 20);
    b.cyl('steel', col(C.steelLt), x, y + 0.8, z, 0.9, 1.9, 12);
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; b.cyl('steel', col(C.steelLt), x + Math.cos(a) * 1.25, y + 1.62, z + Math.sin(a) * 1.25, 0.14, 0.12, 6); }
    return y + 1.6;
  }
  // dây chằng hàng vắt ngang khối [y0..y1], bề ngang d theo trục vuông góc; dọc trục 'z' (đặt tại x = p) hoặc 'x' (tại z = p)
  function strap(b, axis, p, d, y0, y1, c0) {
    const c = col(c0 || C.strap, b.rv(0.05)), w = 0.45, t = 0.07, h = y1 - y0;
    if (axis === 'z') {
      b.box('cloth', c, p, y1 + t / 2, 0, w, t, d + 2 * t);
      for (const e of [-1, 1]) b.box('cloth', c, p, y0 + h / 2, e * (d / 2 + t / 2), w, h, t);
      b.box('steel', col(C.steelLt), p, y0 + h * 0.5, d / 2 + 0.16, 0.7, 1.0, 0.22);
    } else {
      b.box('cloth', c, 0, y1 + t / 2, p, d + 2 * t, t, w);
      for (const e of [-1, 1]) b.box('cloth', c, e * (d / 2 + t / 2), y0 + h / 2, p, t, h, w);
      b.box('steel', col(C.steelLt), d / 2 + 0.16, y0 + h * 0.5, p, 0.22, 1.0, 0.7);
    }
  }
  // lưới hàng trùm khối [-sx/2..sx/2] x [y0..y1] x [-sz/2..sz/2]: mắt lưới hình thoi trên nóc (~2.4 đv), thừng dọc
  // 4 mặt bên, thừng viền mép nóc / chân; thừng mảnh, sẫm — nhìn ra lưới vải chứ không thành lồng
  function cargoNet(b, sx, sz, y0, y1) {
    const c = col(C.net), t = 0.09, h = y1 - y0, st = 2.4, ax = sx / 2, az = sz / 2, yt = y1 + t / 2;
    // đường chéo x ± z = k cắt hình chữ nhật nóc -> đoạn thừng
    for (const sg of [1, -1]) for (let k = -(ax + az) + st / 2; k < ax + az; k += st) {
      const pts = [];
      for (const x of [-ax, ax]) { const z = (k - x) * sg; if (Math.abs(z) <= az) pts.push([x, z]); }
      for (const z of [-az, az]) { const x = k - sg * z; if (Math.abs(x) <= ax) pts.push([x, z]); }
      if (pts.length < 2) continue;
      const [p, q] = pts, len = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (len < 0.3) continue;
      b.box('cloth', c, (p[0] + q[0]) / 2, yt, (p[1] + q[1]) / 2, len, t, t, -Math.atan2(q[1] - p[1], q[0] - p[0]));
    }
    for (let x = -ax; x <= ax + 0.01; x += sx / Math.round(sx / st)) for (const e of [-1, 1]) b.box('cloth', c, x, y0 + h / 2, e * (az + t / 2), t, h, t);
    for (let z = -az; z <= az + 0.01; z += sz / Math.round(sz / st)) for (const e of [-1, 1]) b.box('cloth', c, e * (ax + t / 2), y0 + h / 2, z, t, h, t);
    for (const y of [y0 + 0.3, y1]) for (const e of [-1, 1]) {
      b.box('cloth', c, 0, y, e * (az + t / 2), sx + 2 * t, 0.14, 0.14);
      b.box('cloth', c, e * (ax + t / 2), y, 0, 0.14, 0.14, sz + 2 * t);
    }
  }

  // ---------------------------------------------------------------------------
  // CÁC KIỂU HÒM MẶT ĐẤT
  // ---------------------------------------------------------------------------
  function buildType(type) {
    const b = new B(type.length * 977 + type.charCodeAt(0) * 31), sx = 16, sz = 13, j = () => (b.r() - 0.5) * 0.05;
    const top = pallet(b, sx, sz);
    b.add('shadow', new THREE.PlaneGeometry(sx + 5, sz + 5).rotateX(-Math.PI / 2), M4(0, 0.25, 0), null);
    smokeCanister(b, SMOKE.crate.x - 0.6, 0, SMOKE.crate.z, 0, 0xc9a430);
    if (type === 'AMMO') {
      // 2 lớp đủ 2 x 3 thùng + lớp 3: nửa trái 3 thùng, nửa phải 4 hộp đạn thép; dây chằng
      for (let k = 0; k < 2; k++) for (const x of [-3.75, 3.75]) for (const z of [-3.8, 0, 3.8]) ammoBox(b, x + j() * 4, top + k * 2.8, z, (z < 0 ? Math.PI : 0) + j(), k ? 0 : 1);
      for (const z of [-3.8, 0, 3.8]) ammoBox(b, -3.75 + j() * 4, top + 5.6, z, (z < 0 ? Math.PI : 0) + j(), 11);
      for (const x of [2.45, 5.05]) for (const z of [-0.75, 0.75]) ammoCan(b, x, top + 5.6, z, (z < 0 ? Math.PI : 0) + j());
      for (const x of [-5.6, -1.9]) strap(b, 'z', x, 11.3, top, top + 8.4);
      strap(b, 'z', 3.75, 11.3, top, top + 5.6);
    } else if (type === 'SPEED') {
      // 2 phuy dầu đứng + 10 can xăng (2 cột x 5 hàng), dây chằng quanh khối can
      for (const z of [-3.1, 3.1]) drum(b, -4.3, top, z, -Math.PI / 2 + j() * 6, C.olive2, 2);
      for (const [i, x] of [1.2, 4.4].entries()) for (let r = 0; r < 5; r++) jerrycan(b, x, top, -3 + r * 1.5, j() * 2, (i * 5 + r) % 4 === 1 ? C.sand : C.olive);
      for (const z of [-1.6, 1.6]) { const s = b.push(M4(2.8, 0, 0)); strap(b, 'x', z, 6.2, top, top + 3.68); b.pop(s); }
    } else if (type === 'REPAIR') {
      // hòm đồ nghề lớn + 2 can dầu bên trái; 2 đoạn xích + bánh chịu tải xếp bên phải
      const ct = toolChest(b, -3.1, top, -2.9, Math.PI + j(), 8.6, 4.2, 5.2, 5);
      { const s2 = b.push(M4(-3.1, 0, -2.9)); strap(b, 'z', 0, 5.44, top, ct, C.strap); b.pop(s2); }
      for (const x of [-5.4, -1.9]) jerrycan(b, x, top, 3.6, j() * 3, C.oliveDk);
      let y = trackSection(b, 4.2, top, 0, Math.PI / 2 + j(), 5);
      y = trackSection(b, 4.25, y, 0.1, Math.PI / 2 + j() * 2, 5);
      roadWheel(b, 4.2, y, 0);
    } else {
      // ALL: khối hàng phẳng nóc 2 lớp (thùng đạn + hòm y tế chữ thập đỏ) trùm lưới hàng ôm sát, 2 dây chằng
      for (const x of [-3.75, 3.75]) for (const z of [-3.8, 0, 3.8]) ammoBox(b, x + j() * 2, top, z, (z < 0 ? Math.PI : 0) + j() * 0.5, 0);
      for (const z of [-3.8, 0, 3.8]) ammoBox(b, -3.75 + j() * 2, top + 2.8, z, (z < 0 ? Math.PI : 0) + j() * 0.5, 1);
      toolChest(b, 3.75, top + 2.8, -3.8, Math.PI, 7.2, 2.2, 3.5, 9, C.olive2);
      for (const z of [0, 3.8]) ammoBox(b, 3.75 + j() * 2, top + 2.8, z, j() * 0.5, 1);
      cargoNet(b, 15.3, 11.25, top, top + 5.63);
      for (const x of [-4.4, 4.4]) strap(b, 'z', x, 11.25, top, top + 5.7);
    }
    return b.bake();
  }

  // ---------------------------------------------------------------------------
  // HÒM THẢ DÙ: túi hàng A-22 + dù tròn
  // ---------------------------------------------------------------------------
  // bao bạt bọc hàng: hộp chia ô, bo tròn cạnh / góc bán kính r, các mặt bên phồng ra giữa (đáy phẳng trên đế),
  // nếp nhăn nhẹ theo hàm nhiễu cố định
  function bagGeo(sx, sy, sz, r, bulge) {
    const g = new THREE.BoxGeometry(sx, sy, sz, 12, 10, 12), p = g.attributes.position;
    const ix = sx / 2 - r, iy = sy / 2 - r, iz = sz / 2 - r, cl = (v, m) => Math.max(-m, Math.min(m, v));
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const cx = cl(x, ix), cy = cl(y, iy), cz = cl(z, iz), dx = x - cx, dy = y - cy, dz = z - cz, L = Math.hypot(dx, dy, dz) || 1;
      let nx = dx / L, ny = dy / L, nz = dz / L;
      if (dy < 0 && Math.abs(dx) + Math.abs(dz) < 1e-6) { nx = 0; ny = -1; nz = 0; }
      const fx = 1 - (cx / ix) ** 2, fy = 1 - (cy / iy) ** 2, fz = 1 - (cz / iz) ** 2;
      const w = ny < -0.5 ? 0 : Math.abs(nx) * fy * fz + Math.abs(nz) * fx * fy + Math.max(0, ny) * fx * fz * 0.5;
      const wr = 0.08 * Math.sin(x * 1.3 + y * 0.7) * Math.sin(z * 1.1 - y * 0.9) + 0.05 * Math.sin(y * 2.3 + x * 0.4);
      const k = r + w * bulge + (ny < -0.5 ? 0 : wr);
      p.setXYZ(i, cx + nx * k, cy + ny * k, cz + nz * k);
    }
    g.computeVertexNormals();
    return g;
  }
  function buildBundle() {
    const b = new B(4242), y0 = -9;
    b.ground = y0;
    b.add('shadow', new THREE.PlaneGeometry(22, 22).rotateX(-Math.PI / 2), M4(0, y0 + 0.25, 0), null);
    b.box('wood', col(C.ply), 0, y0 + 0.5, 0, 16, 1, 16);
    b.box('cloth', col(C.card), 0, y0 + 1.4, 0, 15.2, 0.8, 15.2);
    const by = y0 + 1.8, bh = 13, top = by + bh;
    const bag = bagGeo(14.6, bh, 14.6, 1.1, 0.9); projUV(bag, [14.6, bh, 14.6], TILE.cloth);
    b.add('cloth', bag, M4(0, by + bh / 2, 0), col(C.canvas));
    // đai dọc (2 mỗi chiều) vắt qua nóc xuống đế, đai ngang ôm thân, khoá đai, móc treo trên nóc
    const sc = col(C.strap), w = 0.85, t = 0.12, hw = 7.3 + 0.75;   // đai sát mặt túi đã phồng
    for (const p of [-3.6, 3.6]) {
      b.box('cloth', sc, p, top + 0.5, 0, w, t, 15); b.box('cloth', sc, 0, top + 0.57, p, 15, t, w);
      for (const e of [-1, 1]) { b.box('cloth', sc, p, by + bh / 2, e * hw, w, bh, t); b.box('cloth', sc, e * hw, by + bh / 2, p, t, bh, w); }
    }
    for (const e of [-1, 1]) { b.box('cloth', sc, 0, by + bh * 0.42, e * (hw + 0.1), 14.2, w, t); b.box('cloth', sc, e * (hw + 0.1), by + bh * 0.42, 0, t, w, 14.2); }
    for (const e of [-1, 1]) for (const p of [-3.6, 3.6]) b.box('steel', col(C.steelLt), p, by + bh * 0.42, e * (hw + 0.25), 1.3, 1.5, 0.3);
    b.box('steel', col(C.steel), 0, top + 0.75, 0, 2.2, 0.6, 2.2);
    b.cyl('steel', col(C.steelLt), 0, top + 1.4, 0, 0.9, 0.25, 12, Math.PI / 2);
    b.decal(7, col(C.black), 0, by + bh * 0.72, 7.5 + 0.62, 5.6, 2.8);
    b.decal(6, col(C.black), 0, by + bh * 0.72, -7.5 - 0.62, 5.6, 2.8, Math.PI);
    b.decal(6, col(C.black), 7.5 + 0.62, by + bh * 0.72, 0, 5.6, 2.8, Math.PI / 2);
    return { parts: b.bake(), top: top + 1.5 };
  }
  // dù tròn (gốc nhóm dù = tâm vành mép, y lên): N múi phồng giữa đường may, màu múi xen kẽ, lỗ thoát khí trên đỉnh;
  // dây dù từ mỗi đường may tụ về điểm tụ phía dưới rồi 1 dây treo xuống móc trên hòm (hook: y cục bộ)
  function buildCanopy(hook) {
    const N = 24, M = 9, R0 = 28.4, P0 = 0.09, P1 = 1.25, FL = 0.62, yOff = -R0 * Math.cos(P1) * FL;
    const pos = [], cl = [];
    const V = (a, ph, bul) => { const r = R0 * Math.sin(ph) * (1 + bul), y = R0 * Math.cos(ph) * FL + yOff + bul * 6; return [Math.cos(a) * r, y, Math.sin(a) * r]; };
    const SUB = 3;   // mỗi múi chia 3 dải để phồng cong
    const cA = col(0x58593b), cB = col(0x4f5036), cS = col(0x3e3f2c);
    for (let i = 0; i < N; i++) for (let s2 = 0; s2 < SUB; s2++) for (let k = 0; k < M; k++) {
      const f0 = s2 / SUB, f1 = (s2 + 1) / SUB, a0 = (i + f0) / N * TAU, a1 = (i + f1) / N * TAU;
      const ph0 = P0 + (P1 - P0) * k / M, ph1 = P0 + (P1 - P0) * (k + 1) / M;
      const bu = (f, ph) => Math.sin(Math.PI * f) * 0.045 * Math.min(1, ph / 0.5);
      const q = [V(a0, ph0, bu(f0, ph0)), V(a1, ph0, bu(f1, ph0)), V(a1, ph1, bu(f1, ph1)), V(a0, ph1, bu(f0, ph1))];
      const c = k === M - 1 ? cS : (i % 2 ? cA : cB);
      for (const idx of [0, 1, 2, 0, 2, 3]) { pos.push(...q[idx]); cl.push(c.r, c.g, c.b); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3));
    g.computeVertexNormals();
    const L = [], cy = hook + 7;   // điểm tụ dây
    for (let i = 0; i < N; i++) { const [x, y, z] = V(i / N * TAU, P1, 0); L.push(x, y, z, 0, cy, 0); }
    L.push(0, cy, 0, 0, hook, 0);
    for (const e of [-1, 1]) L.push(0, cy, 0, e * 0.8, hook, 0), L.push(0, cy, 0, 0, hook, e * 0.8);
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(L, 3));
    return { canopy: g, lines: lg };
  }
  // dù xẹp nằm trên đất cạnh hòm (gốc = mặt đất): đống vải nhăn dẹt + vài dây vắt về móc hòm
  function collapsedChuteGeo() {
    const g = new THREE.SphereGeometry(9, 22, 8, 0, TAU, 0, Math.PI / 2), p = g.attributes.position, R = rng(9), cs = [];
    const ph = Array.from({ length: 5 }, () => [R() * TAU, 2 + R() * 4, 0.3 + R() * 0.5]);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), a = Math.atan2(z, x);
      let k = 1; for (const [o, f, amp] of ph) k += Math.sin(a * f + o) * amp * 0.12;
      const fold = 0.45 + 0.55 * Math.abs(Math.sin(a * 9 + x * 0.35)) * (0.7 + 0.3 * Math.sin(Math.hypot(x, z) * 0.9));
      p.setXYZ(i, x * 1.5 * k, p.getY(i) * 0.2 * fold + 0.15, z * 1.0 * k);
      const c = col(i % 3 ? 0x56573a : 0x4d4e34, 0.74 + R() * 0.12); cs.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(cs, 3));
    g.computeVertexNormals();
    return g;
  }

  // ---------------------------------------------------------------------------
  // GIAO DIỆN
  // ---------------------------------------------------------------------------
  const CACHE = {};
  // chỗ phát khói (đầu ống M18) trong nhóm hòm: hòm mặt đất / hòm thả dù đã tiếp đất (đáy y = -9)
  const SMOKE = { crate: { x: 10.2, y: 0.36, z: 7.6 }, airdrop: { x: 12.4, y: -8.64, z: -5.5 } };
  // ống khói đặt riêng (hòm thả dù: bung khi tiếp đất); gốc = giữa thân sát đất, đầu phụt về +x
  function canister(band) {
    const k = 'can' + band;
    if (!CACHE[k]) { const b = new B(7); smokeCanister(b, 0, 0, 0, 0, band); CACHE[k] = b.bake(); }
    return toMeshes(CACHE[k], new THREE.Group());
  }
  const toMeshes = (parts, group) => {
    for (const P of parts) {
      const m = P.line ? new THREE.LineSegments(P.geo, P.mat) : new THREE.Mesh(P.geo, P.mat);
      if (!P.line) { m.castShadow = !!P.cast; m.receiveShadow = P.recv !== false; }
      group.add(m);
    }
    return group;
  };
  // hòm mặt đất theo loại (gốc = mặt đất giữa pallet)
  function crate(type) {
    const k = type === 'AMMO' || type === 'SPEED' || type === 'REPAIR' ? type : 'ALL';
    if (!CACHE[k]) CACHE[k] = buildType(k);
    return toMeshes(CACHE[k], new THREE.Group());
  }
  // hòm thả dù: { group, chute } — group gốc giữa khối hàng (đáy y = -9), chute là nhóm dù đặt tại y = 35 trong group
  function airdrop() {
    if (!CACHE.bundle) {
      const B2 = buildBundle(), cn = buildCanopy(B2.top - 35);
      CACHE.bundle = { parts: B2.parts, canopy: cn.canopy, lines: cn.lines };
    }
    const M = mats(), group = toMeshes(CACHE.bundle.parts, new THREE.Group()), chute = new THREE.Group();
    chute.position.y = 35;
    const cm = new THREE.Mesh(CACHE.bundle.canopy, M.canopy); cm.castShadow = true;
    chute.add(cm, new THREE.LineSegments(CACHE.bundle.lines, M.line));
    group.add(chute);
    return { group, chute };
  }
  // dù xẹp trên đất (gốc = mặt đất tại chỗ nằm); hook: điểm móc trên hòm tính từ chỗ nằm (vẽ vài dây dù vắt về)
  function collapsedChute(hook) {
    if (!CACHE.heap) CACHE.heap = collapsedChuteGeo();
    const M = mats(), g = new THREE.Group(), m = new THREE.Mesh(CACHE.heap, M.canopy);
    m.castShadow = true; m.receiveShadow = true; g.add(m);
    if (hook) {
      const L = [];
      for (let i = 0; i < 5; i++) { const a = (i - 2) * 0.35, sx = -Math.cos(a) * 9, sz = Math.sin(a) * 6; L.push(sx * 0.8, 0.6, sz, hook.x, hook.y, hook.z); }
      const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(L, 3));
      g.add(new THREE.LineSegments(lg, M.line));
    }
    return g;
  }

  return { crate, airdrop, collapsedChute, canister, SMOKE };
})();

if (typeof window !== 'undefined') window.SupplyCrateModel = SupplyCrateModel;
