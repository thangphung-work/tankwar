/**
 * CÔNG TRÌNH PHỤ & VẬT CẢN TRÊN BẢN ĐỒ (dữ liệu sinh tất định trong MapGen -> mọi máy giống hệt nhau)
 * - Hàng rào gỗ / tre, tường đá, tường đất, bờ rào cây quanh vườn & ruộng: xe húc đổ, đạn nổ phá đổ.
 * - Ruộng (lúa, lúa mì, rơm, rau, sắn, đất khô): mặt ruộng kẻ luống bám theo địa hình.
 * - Xác xe cháy rụi (xe tăng / xe bọc thép / xe tải): chắn xe & chắn đạn như đá tảng, vài chiếc còn âm ỉ khói.
 * - Bao cát (mép hào ẩn xe, chốt đầu làng): chắn đạn thẳng & giảm sóng nổ; xe cán qua thì bẹp xuống.
 * - Hào ẩn xe: đã đào thẳng vào lưới độ cao trong MapGen; ở đây chỉ dựng bao cát trên ụ phía trước.
 */
const Props = (() => {
  const TAU = Math.PI * 2;
  // băm tất định theo số nguyên -> [0, 1)
  const hash = (n) => { let h = (n | 0) * 374761393 + 668265263; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const sfx = (kind, x, y, z, k, o) => { if (typeof window !== 'undefined' && window.soundEngine && window.soundEngine.secondaryAt) window.soundEngine.secondaryAt(kind, { x, y, z }, k || 1, o || null); };

  // ---------------------------------------------------------------------------
  // TEXTURE THỦ TỤC
  // ---------------------------------------------------------------------------
  const TEX = {};
  function tex(key, w, h, draw, rep) {
    if (TEX[key]) return TEX[key];
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
    t.anisotropy = 4;
    return (TEX[key] = t);
  }
  function speckle(g, w, h, n, cols, smin, smax, seed) {
    for (let i = 0; i < n; i++) {
      const r1 = hash(seed + i * 3), r2 = hash(seed + i * 3 + 1), r3 = hash(seed + i * 3 + 2);
      g.fillStyle = cols[i % cols.length];
      g.globalAlpha = 0.25 + r3 * 0.5;
      const s = smin + r3 * (smax - smin);
      g.fillRect(r1 * w, r2 * h, s, s * (0.6 + r1));
    }
    g.globalAlpha = 1;
  }
  const woodTex = () => tex('wood', 128, 32, (g, w, h) => {
    g.fillStyle = '#6b5236'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 2) { g.fillStyle = `rgba(${40 + hash(y) * 40 | 0},${28 + hash(y + 9) * 25 | 0},16,0.35)`; g.fillRect(0, y, w, 1); }
    speckle(g, w, h, 90, ['#3b2b1c', '#8a7050', '#55432e'], 1, 4, 11);
  }, true);
  const stoneTex = (mud) => tex(mud ? 'mudwall' : 'stonewall', 128, 64, (g, w, h) => {
    g.fillStyle = mud ? '#9a8262' : '#7c7a74'; g.fillRect(0, 0, w, h);
    if (mud) { speckle(g, w, h, 260, ['#7e6748', '#b09a76', '#8d7353'], 1, 5, 21); return; }
    // đá xếp khan: viên đá to nhỏ không đều, mạch tối
    let y = 0, row = 0;
    while (y < h) {
      const rh = 9 + hash(row * 7) * 9;
      let x = -hash(row) * 20;
      while (x < w) {
        const rw = 12 + hash(row * 31 + x | 0) * 22, k = 0.75 + hash(x * 13 + row | 0) * 0.45;
        g.fillStyle = `rgb(${120 * k | 0},${118 * k | 0},${110 * k | 0})`;
        g.beginPath(); g.ellipse(x + rw / 2, y + rh / 2, rw / 2 - 1, rh / 2 - 1, 0, 0, TAU); g.fill();
        x += rw;
      }
      y += rh; row++;
    }
    speckle(g, w, h, 160, ['#4d4b46', '#9c9a92', '#5f6a4a'], 1, 3, 23);
  }, true);
  const hedgeTex = () => tex('hedge', 128, 64, (g, w, h) => {
    g.fillStyle = '#2f4220'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 700; i++) {
      const x = hash(i * 5) * w, y = hash(i * 5 + 1) * h, s = 2 + hash(i * 5 + 2) * 5, k = 0.6 + hash(i * 5 + 3) * 0.8;
      g.fillStyle = `rgb(${52 * k | 0},${78 * k | 0},${34 * k | 0})`;
      g.beginPath(); g.ellipse(x, y, s, s * 0.6, hash(i) * 3, 0, TAU); g.fill();
    }
  }, true);
  const burlapTex = () => tex('burlap', 64, 32, (g, w, h) => {
    g.fillStyle = '#8f7d58'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 2) { g.fillStyle = 'rgba(60,48,30,0.18)'; g.fillRect(x, 0, 1, h); }
    for (let y = 0; y < h; y += 2) { g.fillStyle = 'rgba(160,140,100,0.15)'; g.fillRect(0, y, w, 1); }
    speckle(g, w, h, 60, ['#5d4f35', '#a89670', '#6d5f40'], 1, 4, 31);
  }, true);
  const charTex = () => tex('charred', 128, 128, (g, w, h) => {
    // xác xe cháy: thép xám than + mảng gỉ nâu cam + tro xám nhạt (không đen kịt)
    g.fillStyle = '#4a443d'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      const x = hash(i * 7) * w, y = hash(i * 7 + 1) * h, r = 4 + hash(i * 7 + 2) * 18;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      const rust = hash(i * 7 + 3) < 0.55;
      gr.addColorStop(0, rust ? 'rgba(128,72,38,0.6)' : 'rgba(24,21,18,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    speckle(g, w, h, 400, ['#2a2520', '#7a5232', '#6e6962', '#8a5a33', '#8c867c'], 1, 3, 41);
  }, true);
  // mặt ruộng: 1 ô = 64 đơn vị, luống chạy theo trục u
  const CROP = {
    rice: { soil: '#434a32', row: '#5f7238', tip: '#7f9052', rows: 10, rough: 0.78, water: true },
    veg: { soil: '#5a4630', row: '#506a32', tip: '#6e8a48', rows: 7, rough: 0.95 },
    wheat: { soil: '#8a7444', row: '#c4a65a', tip: '#e2c97c', rows: 14, rough: 0.95 },
    hay: { soil: '#857049', row: '#b59d62', tip: '#d1bb80', rows: 16, rough: 1.0, bales: true },
    cassava: { soil: '#5b4128', row: '#425e30', tip: '#5e7a44', rows: 6, rough: 0.95 },
    dry: { soil: '#a08460', row: '#8a7050', tip: '#b49a72', rows: 8, rough: 1.0 }
  };
  const cropTex = (k) => tex('crop_' + k, 256, 256, (g, w, h) => {
    const C = CROP[k] || CROP.veg;
    g.fillStyle = C.soil; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 500, ['rgba(0,0,0,0.5)', 'rgba(255,255,255,0.3)'], 1, 3, 51);
    const p = h / C.rows;
    for (let r = 0; r < C.rows; r++) {
      const y0 = r * p;
      // luống: dải cây trồng có mép lởm chởm
      for (let x = 0; x < w; x += 2) {
        const j = (hash(r * 977 + x) - 0.5) * p * 0.18, th = p * (0.42 + hash(r * 131 + x * 7) * 0.2);
        g.fillStyle = C.row; g.fillRect(x, y0 + p * 0.3 + j, 2, th);
        if (hash(x * 3 + r) < 0.5) { g.fillStyle = C.tip; g.fillRect(x, y0 + p * 0.32 + j, 1, th * 0.45); }
      }
      g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, y0 + p * 0.9, w, p * 0.1);   // rãnh giữa luống
    }
    if (C.water) { g.fillStyle = 'rgba(96,112,108,0.2)'; for (let r = 0; r < C.rows; r++) g.fillRect(0, r * p + p * 0.82, w, p * 0.18); }
  }, true);

  // ---------------------------------------------------------------------------
  // HÌNH HỌC
  // ---------------------------------------------------------------------------
  function merge(list) {
    const geos = list.map(([g, m]) => { const n = g.index ? g.toNonIndexed() : g.clone(); if (m) n.applyMatrix4(m); return n; });
    let total = 0;
    for (const g of geos) total += g.attributes.position.count;
    const pos = new Float32Array(total * 3), nrm = new Float32Array(total * 3), uv = new Float32Array(total * 2);
    let o = 0;
    for (const g of geos) {
      const n = g.attributes.position.count;
      pos.set(g.attributes.position.array, o * 3);
      nrm.set(g.attributes.normal.array, o * 3);
      if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
      o += n;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    out.computeBoundingSphere();
    return out;
  }
  const M4 = (x, y, z, rx, ry, rz, sx, sy, sz) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0)), new THREE.Vector3(sx || 1, sy || 1, sz || 1));
  // gồ ghề nhẹ đỉnh khối (bờ rào cây / tường đá xếp)
  function lumpy(g, amp, seed) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const k = hash(seed + Math.round(x * 3) * 31 + Math.round(y * 3) * 17 + Math.round(z * 3) * 7);
      if (y > 0.01) p.setY(i, y + (k - 0.5) * amp * 2);
      p.setZ(i, z * (1 + (hash(seed + Math.round(x * 3) * 13) - 0.5) * 0.5));
    }
    g.computeVertexNormals();
    return g;
  }

  // Mẫu 1 nhịp hàng rào theo loại: chiều dài nhịp L dọc trục x (tâm tại gốc), chân ở y = 0
  const FENCE = {
    wood: { L: 14, h: 6.5, t: 1, mat: () => woodTex(), color: 0xffffff, rough: 0.95 },
    bamboo: { L: 12, h: 7.5, t: 1, mat: () => woodTex(), color: 0xd8cc88, rough: 0.9 },
    stone: { L: 10, h: 5, t: 3.4, mat: () => stoneTex(false), color: 0xffffff, rough: 0.97, solid: true },
    mud: { L: 10, h: 6, t: 3, mat: () => stoneTex(true), color: 0xffffff, rough: 1, solid: true },
    hedge: { L: 10, h: 8.5, t: 5.5, mat: () => hedgeTex(), color: 0xffffff, rough: 0.9, solid: true, leafy: true }
  };
  function fenceGeo(kind) {
    const F = FENCE[kind];
    if (kind === 'wood' || kind === 'bamboo') {
      const parts = [[new THREE.BoxGeometry(0.9, F.h, 0.9), M4(-F.L / 2, F.h / 2, 0)]];
      const rails = kind === 'bamboo' ? [0.3, 0.55, 0.8] : [0.4, 0.82];
      for (const r of rails) parts.push([new THREE.BoxGeometry(F.L + 0.6, kind === 'bamboo' ? 0.45 : 0.7, 0.35), M4(0, F.h * r, 0.45)]);
      if (kind === 'bamboo') for (let k = 1; k < 6; k++) parts.push([new THREE.CylinderGeometry(0.3, 0.3, F.h * 0.95, 5), M4(-F.L / 2 + k * F.L / 6, F.h * 0.47, 0.75)]);
      return merge(parts);
    }
    const g = new THREE.BoxGeometry(F.L + 0.4, F.h, F.t, 4, 2, 2);
    g.translate(0, F.h / 2, 0);
    return merge([[lumpy(g, F.leafy ? 1.1 : 0.45, kind.length * 101), null]]);
  }

  // Bộ phận xác xe: [hình, ma trận cục bộ] theo loại; trục x = hướng xe, chân ở y = 0
  function wreckParts(kind) {
    const P = [];
    if (kind === 'tank') {
      P.push(['hull', M4(0, 6, 0, 0, 0, 0, 34, 7.5, 16)]);
      P.push(['hull', M4(15, 6.5, 0, 0, 0, -0.55, 8, 5, 15.6)]);              // tấm giáp trước vát
      P.push(['track', M4(0, 3.4, 7.4, 0, 0, 0, 36, 6.8, 3.6)]);
      P.push(['track', M4(0, 3.4, -7.4, 0, 0, 0, 36, 6.8, 3.6)]);
      P.push(['turret', M4(-2, 11.5, 0, 0, 0, 0, 7.5, 4.5, 6.4)]);
      P.push(['barrel', M4(16, 12.2, 0, 0, 0, Math.PI / 2 - 0.06, 0.75, 24, 0.75)]);
    } else if (kind === 'apc') {
      P.push(['hull', M4(0, 7, 0, 0, 0, 0, 30, 8.5, 14)]);
      P.push(['hull', M4(13.5, 6.4, 0, 0, 0, -0.7, 6, 5, 13.6)]);
      P.push(['track', M4(0, 2.8, 6.4, 0, 0, 0, 30, 5.6, 3.2)]);
      P.push(['track', M4(0, 2.8, -6.4, 0, 0, 0, 30, 5.6, 3.2)]);
      P.push(['turret', M4(2, 12.4, 0, 0, 0, 0, 3.4, 2.6, 3.4)]);
      P.push(['barrel', M4(8, 13, 0, 0, 0, Math.PI / 2, 0.35, 10, 0.35)]);
    } else {
      P.push(['hull', M4(-1, 3.6, 0, 0, 0, 0, 30, 1.8, 9)]);                 // khung gầm
      P.push(['hull', M4(10.5, 8.5, 0, 0, 0, 0, 8, 8.5, 11.5)]);              // ca-bin
      P.push(['hull', M4(-5, 6.4, 0, 0, 0, 0, 20, 2.6, 12)]);                 // thùng xe
      P.push(['hull', M4(-5, 9.4, 5.8, 0, 0, 0, 20, 4, 0.5)]);
      P.push(['hull', M4(-5, 9.4, -5.8, 0, 0, 0, 20, 4, 0.5)]);
      for (const f of [10, -6, -12]) for (const sd of [1, -1]) P.push(['wheel', M4(f, 2.6, sd * 5.3, Math.PI / 2, 0, 0, 2.6, 2, 2.6)]);
    }
    return P;
  }

  // ---------------------------------------------------------------------------
  // BỘ CÔNG TRÌNH PHỤ
  // ---------------------------------------------------------------------------
  class PropSet {
    constructor(T, data) {
      this.T = T;
      this.data = data;
      this.group = new THREE.Group(); this.group.name = 'props';
      T.group.add(this.group);
      this.grid = new Map();             // ô 60 -> [nhịp rào | bao cát]
      this.spans = [];
      this.bags = [];
      this.bagSegs = [];                 // đoạn bao cát (chắn đạn)
      this.wrecks = [];
      this.smokers = [];
      this.smokeAcc = 0;
      const G = (x, z) => T.groundAtRaw(x, z);
      this.buildFences(data.fences || [], G);
      this.buildFields(data.fields || [], G);
      this.buildSandbags(data.sandbags || [], G);
      this.buildWrecks(data.wrecks || [], G);
    }
    key(x, z) { return Math.floor(x / 60) * 1000 + Math.floor(z / 60); }
    addGrid(o) { const k = this.key(o.x, o.z); if (!this.grid.has(k)) this.grid.set(k, []); this.grid.get(k).push(o); }
    near(x, z, r) {
      const out = [];
      for (let i = Math.floor((x - r) / 60); i <= Math.floor((x + r) / 60); i++)
        for (let j = Math.floor((z - r) / 60); j <= Math.floor((z + r) / 60); j++) {
          const l = this.grid.get(i * 1000 + j);
          if (l) for (const o of l) out.push(o);
        }
      return out;
    }

    // ---- HÀNG RÀO / TƯỜNG / BỜ RÀO CÂY
    buildFences(list, G) {
      const byKind = {};
      list.forEach((f, idx) => {
        const F = FENCE[f.kind] || FENCE.wood;
        const L = Math.hypot(f.x1 - f.x0, f.z1 - f.z0);
        if (L < 1) return;
        const n = Math.max(1, Math.round(L / F.L));
        for (let k = 0; k < n; k++) {
          const t0 = k / n, t1 = (k + 1) / n;
          const ax = f.x0 + (f.x1 - f.x0) * t0, az = f.z0 + (f.z1 - f.z0) * t0, bx = f.x0 + (f.x1 - f.x0) * t1, bz = f.z0 + (f.z1 - f.z0) * t1;
          (byKind[f.kind] || (byKind[f.kind] = [])).push({ ax, az, bx, bz, kind: f.kind, seed: idx * 131 + k, x: (ax + bx) / 2, z: (az + bz) / 2 });
        }
      });
      for (const kind in byKind) {
        const F = FENCE[kind] || FENCE.wood, arr = byKind[kind];
        const mat = new THREE.MeshStandardMaterial({ map: F.mat(), color: F.color, roughness: F.rough, metalness: 0 });
        const im = new THREE.InstancedMesh(fenceGeo(kind), mat, arr.length);
        im.castShadow = F.solid; im.receiveShadow = true; im.frustumCulled = false;
        im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(arr.length * 3).fill(1), 3);
        arr.forEach((s, i) => {
          s.im = im; s.i = i; s.F = F; s.broken = false;
          s.L = Math.hypot(s.bx - s.ax, s.bz - s.az);
          s.yaw = -Math.atan2(s.bz - s.az, s.bx - s.ax);
          s.ga = G(s.ax, s.az); s.gb = G(s.bx, s.bz);
          s.pitch = Math.atan2(s.gb - s.ga, s.L);
          im.setMatrixAt(i, this.spanMatrix(s, 0));
          const k = 0.82 + hash(s.seed) * 0.3;
          im.setColorAt(i, new THREE.Color(k, k, k));
          this.spans.push(s); this.addGrid(s);
        });
        im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true;
        this.group.add(im);
      }
    }
    spanMatrix(s, fall) {
      const y = (s.ga + s.gb) / 2 - 0.4;
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, s.yaw, s.pitch, 'YZX'));
      let sy = 1;
      if (fall) {
        // đổ rạp: rào gỗ ngã nghiêng sang 1 bên; tường / bờ rào sụp còn đống thấp
        if (s.F.solid) sy = 0.32 + hash(s.seed + 5) * 0.15;
        else q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), fall * (1.2 + hash(s.seed + 3) * 0.3)));
      }
      return new THREE.Matrix4().compose(new THREE.Vector3(s.x, y, s.z), q, new THREE.Vector3(s.L / s.F.L, sy, 1));
    }
    breakSpan(s, dx, dz, fx) {
      if (s.broken) return;
      s.broken = true;
      // ngã về phía bị đẩy: dấu của tích có hướng giữa pháp tuyến nhịp rào và hướng đẩy
      // trục Z cục bộ của nhịp rào = n; quay +góc quanh trục X làm đỉnh rào ngả về +Z -> bị đẩy theo +n thì side = +1
      const nx = -(s.bz - s.az), nz = (s.bx - s.ax);
      const side = (nx * dx + nz * dz) >= 0 ? 1 : -1;
      s.side = side;
      s.im.setMatrixAt(s.i, this.spanMatrix(s, side));
      s.im.instanceMatrix.needsUpdate = true;
      if (s.F.solid && !s.F.leafy) s.im.setColorAt(s.i, new THREE.Color(0.7, 0.68, 0.64)), s.im.instanceColor.needsUpdate = true;
      if (fx && fx.smoke) {
        const c = s.F.leafy ? [0.3, 0.4, 0.18] : s.F.solid ? [0.55, 0.52, 0.46] : [0.45, 0.36, 0.24];
        for (let k = 0; k < 6; k++) fx.smoke.add({ x: s.x + (hash(s.seed + k) - 0.5) * s.L, y: (s.ga + s.gb) / 2 + 2, z: s.z + (hash(s.seed + k + 9) - 0.5) * s.L,
          vx: (hash(k) - 0.5) * 8, vy: 3 + hash(k + 2) * 5, vz: (hash(k + 4) - 0.5) * 8, size: 1.4 + hash(k + 6) * 1.6, grow: 2, drag: 2, grav: 6, life: 1.2, alpha: 0.5, fadeIn: 0.02, c0: c, cell: 2 });
      }
      // tiếng theo vật liệu rào: gỗ / tre gãy rắc, tường đá đổ, tường đất bở sụp, bờ rào cây xào xạc gãy cành
      const snd = s.F.leafy ? 'leafStrip' : s.F === FENCE.stone ? 'masonry' : s.F.solid ? 'adobe' : 'woodBreak';
      sfx(snd, s.x, (s.ga + s.gb) / 2 + 2, s.z, s.F.leafy ? 0.8 : s.F.solid ? 0.45 : 0.4, { h: s.F.h });
    }

    // ---- RUỘNG: lưới bám địa hình, kẻ luống theo cạnh dài
    buildFields(list, G) {
      const byCrop = {};
      for (const f of list) (byCrop[f.crop] || (byCrop[f.crop] = [])).push(f);
      for (const crop in byCrop) {
        const pos = [], uv = [], idx = [];
        for (const f of byCrop[crop]) {
          const ca = Math.cos(f.angle), sa = Math.sin(f.angle);
          const nu = Math.max(2, Math.ceil(f.w / 12)), nv = Math.max(2, Math.ceil(f.d / 12)), base = pos.length / 3;
          for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
            const u = -f.w / 2 + f.w * i / nu, v = -f.d / 2 + f.d * j / nv;
            const x = f.x + ca * u - sa * v, z = f.z + sa * u + ca * v;
            pos.push(x, G(x, z) + 0.35, z);
            uv.push(u / 64, v / 64);   // luống chạy dọc cạnh dài (u)
          }
          for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
            const a = base + j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
            idx.push(a, c, b, b, c, d);
          }
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        g.setIndex(idx);
        g.computeVertexNormals();
        const C = CROP[crop] || CROP.veg;
        const mat = new THREE.MeshStandardMaterial({ map: cropTex(crop), roughness: C.rough, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
        const m = new THREE.Mesh(g, mat);
        m.receiveShadow = true;
        this.group.add(m);
        (this.fieldGeos || (this.fieldGeos = [])).push(g);
        // ruộng rơm: vài cuộn rơm tròn
        if (C.bales) {
          const bales = [];
          for (const f of byCrop[crop]) {
            const ca = Math.cos(f.angle), sa = Math.sin(f.angle), n = 3 + Math.floor(hash(f.x | 0) * 5);
            for (let k = 0; k < n; k++) {
              const u = (hash((f.x | 0) + k * 7) - 0.5) * f.w * 0.8, v = (hash((f.z | 0) + k * 11) - 0.5) * f.d * 0.8;
              const x = f.x + ca * u - sa * v, z = f.z + sa * u + ca * v;
              bales.push(M4(x, G(x, z) + 3.6, z, Math.PI / 2, hash(k + (f.x | 0)) * TAU, 0, 1, 1, 1));
            }
          }
          const bg = new THREE.CylinderGeometry(3.8, 3.8, 6, 12);
          const bm = new THREE.MeshStandardMaterial({ map: cropTex('hay'), color: 0xd8c690, roughness: 1 });
          const im = new THREE.InstancedMesh(bg, bm, Math.max(1, bales.length));
          im.count = bales.length;
          bales.forEach((m4, i) => im.setMatrixAt(i, m4));
          im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false;
          this.group.add(im);
        }
      }
    }

    // ---- BAO CÁT
    buildSandbags(list, G) {
      const mats = [];
      for (const sg of list) {
        const L = Math.hypot(sg.x1 - sg.x0, sg.z1 - sg.z0);
        if (L < 2) continue;
        const tx = (sg.x1 - sg.x0) / L, tz = (sg.z1 - sg.z0) / L, yaw = -Math.atan2(tz, tx), layers = sg.layers || 2;
        const n = Math.max(1, Math.round(L / 5.4));
        let top = 0;
        for (let ly = 0; ly < layers; ly++) {
          const nn = n - (ly % 2 ? 1 : 0);
          for (let k = 0; k < nn; k++) {
            const t = (k + 0.5 + (ly % 2 ? 0.5 : 0)) / n;
            const x = sg.x0 + (sg.x1 - sg.x0) * t, z = sg.z0 + (sg.z1 - sg.z0) * t, seed = mats.length * 7 + 3;
            const y = G(x, z) + 0.9 + ly * 1.85;
            top = Math.max(top, ly * 1.85 + 2.6);
            const b = { x, z, y, yaw: yaw + (hash(seed) - 0.5) * 0.25, seed, flat: false, i: mats.length, layer: ly };
            mats.push(b); this.bags.push(b); this.addGrid(b);
          }
        }
        this.bagSegs.push({ x0: sg.x0, z0: sg.z0, x1: sg.x1, z1: sg.z1, tx, tz, L, top, g0: G(sg.x0, sg.z0), g1: G(sg.x1, sg.z1) });
      }
      if (!mats.length) return;
      const geo = new THREE.SphereGeometry(1, 9, 5);
      geo.scale(2.9, 1.05, 1.6);
      const mat = new THREE.MeshStandardMaterial({ map: burlapTex(), roughness: 1, metalness: 0 });
      const im = new THREE.InstancedMesh(geo, mat, mats.length);
      im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false;
      im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(mats.length * 3).fill(1), 3);
      this.bagIM = im;
      for (const b of mats) {
        im.setMatrixAt(b.i, this.bagMatrix(b));
        const k = 0.78 + hash(b.seed + 1) * 0.35;
        im.setColorAt(b.i, new THREE.Color(k, k * 0.97, k * 0.9));
      }
      im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true;
      this.group.add(im);
    }
    bagMatrix(b) {
      const y = b.flat ? b.y - b.layer * 1.6 - 0.5 : b.y;
      return M4(b.x, y, b.z, 0, b.yaw, (hash(b.seed + 2) - 0.5) * 0.12, 1, b.flat ? 0.45 : 1, b.flat ? 1.25 : 1);
    }

    // ---- XÁC XE
    buildWrecks(list, G) {
      if (!list.length) return;
      const geos = {
        hull: new THREE.BoxGeometry(1, 1, 1),
        track: new THREE.BoxGeometry(1, 1, 1, 6, 1, 1),
        turret: new THREE.CylinderGeometry(1, 1.15, 1, 12),
        barrel: new THREE.CylinderGeometry(1, 1, 1, 8),
        wheel: new THREE.CylinderGeometry(1, 1, 1, 12)
      };
      geos.turret.translate(0, 0, 0);
      const mat = new THREE.MeshStandardMaterial({ map: charTex(), roughness: 0.9, metalness: 0.1 });
      const trackMat = new THREE.MeshStandardMaterial({ color: 0x35302a, roughness: 1, metalness: 0.1 });
      const inst = {};   // geoName -> [Matrix4]
      const colors = {};
      for (const w of list) {
        const gy = G(w.x, w.z);
        const yaw = -w.angle;
        const W = M4(w.x, gy - 0.9, w.z, w.roll || 0, yaw, w.tilt || 0);
        const parts = wreckParts(w.kind);
        w._slots = []; w._dy = 0;
        w._g0 = this.wreckFoot(w).map(([x, z]) => G(x, z));
        const blown = w.kind === 'tank' && hash((w.x * 7) | 0) < 0.3;   // tháp pháo bị thổi bay
        const k = 0.78 + hash((w.z * 3) | 0) * 0.3;
        for (const [g, lm] of parts) {
          let m;
          if ((g === 'turret' || g === 'barrel') && w.kind !== 'truck') {
            // tháp pháo xoay lệch thân / văng ra nằm cạnh xe
            const pivot = M4(-2, 0, 0, 0, w.turretRot || 0, 0);
            const local = new THREE.Matrix4().multiplyMatrices(pivot, new THREE.Matrix4().multiplyMatrices(M4(2, 0, 0), lm));
            if (blown) {
              const off = M4(-22 - hash(w.x | 0) * 8, -9.5, 14 * (hash(w.z | 0) < 0.5 ? 1 : -1), 0.3, 1.2, 2.6);
              m = new THREE.Matrix4().multiplyMatrices(W, new THREE.Matrix4().multiplyMatrices(off, local));
            } else m = new THREE.Matrix4().multiplyMatrices(W, local);
          } else m = new THREE.Matrix4().multiplyMatrices(W, lm);
          (inst[g] || (inst[g] = [])).push(m);
          (colors[g] || (colors[g] = [])).push(k);
          w._slots.push([g, inst[g].length - 1]);
        }
        // va chạm: chuỗi vòng tròn dọc thân (xe & đạn coi như đá tảng)
        const ca = Math.cos(w.angle), sa = Math.sin(w.angle), half = w.kind === 'truck' ? 13 : 14;
        for (const f of [-half * 0.6, 0, half * 0.6]) {
          this.T.boulders.push({ x: w.x + ca * f, z: w.z + sa * f, radius: w.kind === 'truck' ? 6.5 : 8.5, height: w.kind === 'truck' ? 12 : 13, wreck: true });
        }
        this.wrecks.push(w);
        // fire: xác xe còn cháy âm ỉ (lửa liếm quanh khoang máy + khói đen dày hơn)
        if (w.smoke || w.fire) this.smokers.push(w._smoker = { x: w.x, y: gy + 10, z: w.z, phase: hash(w.x | 0) * 3, fire: !!w.fire });
      }
      this.wreckIM = {};
      for (const g in inst) {
        const im = new THREE.InstancedMesh(geos[g], g === 'track' || g === 'wheel' ? trackMat : mat, inst[g].length);
        im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(inst[g].length * 3).fill(1), 3);
        inst[g].forEach((m, i) => { im.setMatrixAt(i, m); const k = colors[g][i]; im.setColorAt(i, new THREE.Color(k, k * 0.95, k * 0.9)); });
        im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false;
        im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true;
        this.group.add(im);
        this.wreckIM[g] = im;
      }
    }
    wreckFoot(w) {
      const ca = Math.cos(w.angle), sa = Math.sin(w.angle), h = w.kind === 'truck' ? 11 : 12, s = 6;
      return [[w.x, w.z], [w.x + ca * h, w.z + sa * h], [w.x - ca * h, w.z - sa * h], [w.x - sa * s, w.z + ca * s], [w.x + sa * s, w.z - ca * s]];
    }

    // ---------------------------------------------------------------------------
    // MẶT ĐẤT ĐỔI (hố bom mới / hố bị xoá): rào, bao cát, xác xe, mặt ruộng đặt lại theo mặt đất mới
    // ---------------------------------------------------------------------------
    reground(x0, z0, x1, z1) {
      const T = this.T, raw = (x, z) => T.groundAtRaw(x, z);
      const S = T.surfaceAt ? (x, z) => T.surfaceAt(x, z, true) : raw;
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, R = Math.hypot(x1 - x0, z1 - z0) / 2 + 20;
      const inBox = (x, z, p) => x >= x0 - p && x <= x1 + p && z >= z0 - p && z <= z1 + p;
      const dirtyIM = new Set();
      let bags = false;
      for (const o of this.near(cx, cz, R)) {
        if (o.im) {
          // nhịp rào: 2 đầu theo mặt đất mới; hố dưới giữa nhịp thì cả nhịp lún theo (không vắt ngang trên miệng hố)
          if (!inBox(o.x, o.z, o.L / 2 + 2)) continue;
          let ga = S(o.ax, o.az), gb = S(o.bx, o.bz);
          const dm = Math.min(0, S(o.x, o.z) - (ga + gb) / 2);
          ga += dm; gb += dm;
          if (Math.abs(ga - o.ga) + Math.abs(gb - o.gb) < 0.02) continue;
          o.ga = ga; o.gb = gb; o.pitch = Math.atan2(gb - ga, o.L);
          o.im.setMatrixAt(o.i, this.spanMatrix(o, o.broken ? (o.side || 1) : 0));
          dirtyIM.add(o.im);
        } else if (inBox(o.x, o.z, 3)) {
          const y = S(o.x, o.z) + 0.9 + o.layer * 1.85;
          if (Math.abs(y - o.y) < 0.02) continue;
          o.y = y;
          this.bagIM.setMatrixAt(o.i, this.bagMatrix(o));
          bags = true;
        }
      }
      if (bags) {
        this.bagIM.instanceMatrix.needsUpdate = true;
        for (const sg of this.bagSegs) if (inBox(sg.x0, sg.z0, 3) || inBox(sg.x1, sg.z1, 3)) { sg.g0 = S(sg.x0, sg.z0); sg.g1 = S(sg.x1, sg.z1); }
      }
      // xác xe: tựa trên 2 điểm đỡ cao nhất dưới thân (hố một bên -> nằm vắt mép hố; hố dưới cả thân -> lún xuống)
      const tmp = new THREE.Matrix4();
      for (const w of this.wrecks) {
        if (!w._slots || !inBox(w.x, w.z, 14)) continue;
        const ds = this.wreckFoot(w).map(([x, z], k) => S(x, z) - w._g0[k]).sort((a, b) => b - a);
        const dy = Math.min(0.5, ds[1]);
        if (Math.abs(dy - w._dy) < 0.02) continue;
        const step = dy - w._dy;
        w._dy = dy;
        for (const [g, i] of w._slots) {
          const im = this.wreckIM[g];
          im.getMatrixAt(i, tmp);
          tmp.elements[13] += step;
          im.setMatrixAt(i, tmp);
          dirtyIM.add(im);
        }
        if (w._smoker) w._smoker.y += step;
      }
      dirtyIM.forEach(im => { im.instanceMatrix.needsUpdate = true; });
      // mặt ruộng: bám mặt đất mới; trong lòng hố thì chìm dưới lưới hố (lòng hố lộ ra, không bị mặt ruộng phẳng che)
      for (const g of this.fieldGeos || []) {
        const P = g.attributes.position;
        let any = false;
        for (let i = 0; i < P.count; i++) {
          const x = P.getX(i), z = P.getZ(i);
          if (!inBox(x, z, 0)) continue;
          const sf = S(x, z), y = sf < raw(x, z) - 0.3 ? sf - 1.0 : sf + 0.35;
          if (Math.abs(y - P.getY(i)) < 0.01) continue;
          P.setY(i, y); any = true;
        }
        if (any) { P.needsUpdate = true; g.computeVertexNormals(); g.computeBoundingSphere(); }
      }
    }

    // ---------------------------------------------------------------------------
    // TƯƠNG TÁC
    // ---------------------------------------------------------------------------
    /** Xe chạy qua: húc đổ rào phía trước, cán bẹp bao cát */
    crush(x, z, r, dx, dz, fx) {
      let bagDirty = false;
      for (const o of this.near(x, z, r + 10)) {
        if (o.im) {
          if (o.broken) continue;
          if (segDist(x, z, o.ax, o.az, o.bx, o.bz) > r) continue;
          this.breakSpan(o, dx, dz, fx);
        } else if (!o.flat && Math.hypot(o.x - x, o.z - z) < r) {
          o.flat = true;
          this.bagIM.setMatrixAt(o.i, this.bagMatrix(o));
          bagDirty = true;
        }
      }
      if (bagDirty) { this.bagIM.instanceMatrix.needsUpdate = true; this.updateBagTops(); }
    }
    updateBagTops() {
      // đoạn bao cát bị cán bẹp quá nửa -> không còn chắn đạn
      for (const sg of this.bagSegs) {
        let n = 0, f = 0;
        for (const b of this.near((sg.x0 + sg.x1) / 2, (sg.z0 + sg.z1) / 2, sg.L / 2 + 4)) {
          if (b.im || segDist(b.x, b.z, sg.x0, sg.z0, sg.x1, sg.z1) > 1) continue;
          n++; if (b.flat) f++;
        }
        sg.dead = n > 0 && f / n > 0.5;
      }
    }
    /** Sóng nổ / đạn tại (x, y, z): đổ rào trong bán kính */
    damageAt(x, y, z, ammo, heavy, fx) {
      const A = (typeof Destructibles !== 'undefined' && Destructibles.ammoInfo) ? Destructibles.ammoInfo(ammo, heavy) : { power: 1, radius: 20 };
      const R = A.power >= 0.3 ? A.radius * 1.3 + 4 : A.radius;
      for (const o of this.near(x, z, R + 10)) {
        if (!o.im || o.broken) continue;
        const d = segDist(x, z, o.ax, o.az, o.bx, o.bz);
        if (d > R) continue;
        // tường đá / đất bền hơn rào gỗ: cần nổ mạnh hoặc gần
        if (o.F.solid && !o.F.leafy && A.power < 0.9 && d > A.radius * 0.5) continue;
        if (A.power < 0.3 && o.F.solid) continue;
        this.breakSpan(o, o.x - x, o.z - z, fx);
      }
    }
    /** Điểm (x, y, z) nằm trong khối bao cát còn nguyên -> chắn đạn */
    // Gọi ở mỗi bước mô phỏng đường đạn (hàng nghìn lần / khung): loại nhanh bằng hộp bao của đoạn bao cát
    // (nới 2.6 = bề dày bờ bao) và dải độ cao, rồi mới tính khoảng cách điểm - đoạn — kết quả y hệt cách cũ
    hitTest(x, y, z) {
      for (const sg of this.bagSegs) {
        if (sg.dead) continue;
        if (x < (sg.x0 < sg.x1 ? sg.x0 : sg.x1) - 2.6 || x > (sg.x0 > sg.x1 ? sg.x0 : sg.x1) + 2.6 ||
            z < (sg.z0 < sg.z1 ? sg.z0 : sg.z1) - 2.6 || z > (sg.z0 > sg.z1 ? sg.z0 : sg.z1) + 2.6) continue;
        if (y < (sg.g0 < sg.g1 ? sg.g0 : sg.g1) - 2 || y > (sg.g0 > sg.g1 ? sg.g0 : sg.g1) + sg.top) continue;
        const dx = sg.x1 - sg.x0, dz = sg.z1 - sg.z0, L2 = dx * dx + dz * dz;
        const t = L2 > 0 ? Math.max(0, Math.min(1, ((x - sg.x0) * dx + (z - sg.z0) * dz) / L2)) : 0;
        const ex = x - (sg.x0 + dx * t), ez = z - (sg.z0 + dz * t);
        if (ex * ex + ez * ez > 2.6 * 2.6) continue;
        const gy = sg.g0 + (sg.g1 - sg.g0) * t;
        if (y >= gy - 2 && y <= gy + sg.top) return { hit: true, type: 'SANDBAG', x, y, z };
      }
      return null;
    }
    /** Đường từ điểm nổ tới xe đi qua bờ bao cát (thấp) -> che bớt sóng nổ */
    blocks(ex, ey, ez, ux, uy, uz) {
      for (const sg of this.bagSegs) {
        if (sg.dead) continue;
        const t = segSegT(ex, ez, ux, uz, sg.x0, sg.z0, sg.x1, sg.z1);
        if (t < 0) continue;
        const y = ey + (uy - ey) * t, gy = (sg.g0 + sg.g1) / 2;
        if (y <= gy + sg.top) return true;
      }
      return false;
    }
    update(dt, fx, cam) {
      if (!fx || !fx.smoke || !this.smokers.length) return;
      // lửa: nhịp riêng dày hơn khói (lưỡi lửa sống ngắn), chỉ khi camera ở gần
      if (fx.fire) {
        this.fireAcc = (this.fireAcc || 0) + dt;
        if (this.fireAcc >= 0.07) {
          this.fireAcc = 0;
          for (const s of this.smokers) {
            if (!s.fire || (cam && Math.hypot(cam.x - s.x, cam.z - s.z) > 1100)) continue;
            const fl = 0.6 + 0.4 * Math.sin(s.phase * 2.3 + Math.random());
            fx.fire.add({ x: s.x + (Math.random() - 0.5) * 9, y: s.y - 3 + Math.random() * 2, z: s.z + (Math.random() - 0.5) * 9,
              vx: (Math.random() - 0.5) * 2, vy: 6 + Math.random() * 6, vz: (Math.random() - 0.5) * 2,
              size: 2.2 + Math.random() * 2.2 * fl, grow: 1.5, drag: 0.6, grav: -3, life: 0.45 + Math.random() * 0.4, alpha: 0.85 * fl, fadeIn: 0.04,
              c0: [1, 0.78, 0.4], c1: [0.9, 0.3, 0.06], cell: 1, floor: false });
          }
        }
      }
      this.smokeAcc += dt;
      if (this.smokeAcc < 0.22) return;
      const step = this.smokeAcc; this.smokeAcc = 0;
      // tiếng lửa cháy của xác xe đang cháy ở gần (nguồn âm liên tục, báo ~4 lần / giây)
      const SE = typeof window !== 'undefined' && window.soundEngine && window.soundEngine.fireSource ? window.soundEngine : null;
      if (SE && cam) for (const s of this.smokers) if (s.fire && Math.hypot(cam.x - s.x, cam.z - s.z) < 450) SE.fireSource(s, s, 0.45);
      for (const s of this.smokers) {
        if (cam && Math.hypot(cam.x - s.x, cam.z - s.z) > 1700) continue;
        s.phase += step;
        const k = 0.6 + 0.4 * Math.sin(s.phase * 0.7);
        fx.smoke.add({ x: s.x + (Math.random() - 0.5) * 6, y: s.y, z: s.z + (Math.random() - 0.5) * 6, vx: (Math.random() - 0.5) * 3, vy: 7 + Math.random() * 5, vz: (Math.random() - 0.5) * 3,
          size: 4 + Math.random() * 3, grow: 6, drag: 0.5, grav: -2, life: 5 + Math.random() * 3, alpha: (s.fire ? 0.5 : 0.32) * k, fadeIn: 0.3,
          c0: s.fire ? [0.06, 0.055, 0.05] : [0.12, 0.11, 0.1], c1: [0.36, 0.35, 0.34], cell: 0, floor: false });
      }
    }
    /** Vẽ lên bản đồ chiến thuật: ruộng, hào ẩn xe, xác xe */
    drawOnMap(ctx, P, sc) {
      const D = this.data;
      ctx.save();
      for (const f of D.fields || []) {
        const c = { x: P(f.x), y: P(f.z) };
        ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(f.angle);
        ctx.fillStyle = 'rgba(190,200,120,0.18)'; ctx.strokeStyle = 'rgba(210,220,150,0.35)'; ctx.lineWidth = 1;
        ctx.fillRect(-f.w / 2 * sc, -f.d / 2 * sc, f.w * sc, f.d * sc); ctx.strokeRect(-f.w / 2 * sc, -f.d / 2 * sc, f.w * sc, f.d * sc);
        ctx.restore();
      }
      for (const p of D.pits || []) {
        const c = { x: P(p.x), y: P(p.z) }, r = Math.max(3, 26 * sc);
        ctx.strokeStyle = 'rgba(230,200,120,0.85)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(c.x, c.y, r, p.angle - 1.1, p.angle + 1.1); ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(40,30,25,0.9)'; ctx.lineWidth = 2;
      for (const w of D.wrecks || []) {
        const c = { x: P(w.x), y: P(w.z) }, r = Math.max(2.5, 9 * sc);
        ctx.beginPath(); ctx.moveTo(c.x - r, c.y - r); ctx.lineTo(c.x + r, c.y + r); ctx.moveTo(c.x + r, c.y - r); ctx.lineTo(c.x - r, c.y + r); ctx.stroke();
      }
      ctx.restore();
    }
  }

  // khoảng cách điểm - đoạn thẳng (2D); full = true trả { d, t }
  function segDist(px, pz, ax, az, bx, bz, full) {
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
    const t = L2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L2)) : 0;
    const d = Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
    return full ? { d, t } : d;
  }
  // tham số t trên đoạn (a->b) nơi cắt đoạn (c->d), -1 nếu không cắt
  function segSegT(ax, az, bx, bz, cx, cz, dx, dz) {
    const rx = bx - ax, rz = bz - az, sx = dx - cx, sz = dz - cz, den = rx * sz - rz * sx;
    if (Math.abs(den) < 1e-9) return -1;
    const t = ((cx - ax) * sz - (cz - az) * sx) / den, u = ((cx - ax) * rz - (cz - az) * rx) / den;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : -1;
  }

  return { PropSet, segDist };
})();
if (typeof window !== 'undefined') window.Props = Props;
