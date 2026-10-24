/**
 * CÔNG TRÌNH PHỤ & VẬT CẢN TRÊN BẢN ĐỒ (dữ liệu sinh tất định trong MapGen -> mọi máy giống hệt nhau)
 * - Hàng rào gỗ / tre, tường đá, tường đất, bờ rào cây quanh vườn & ruộng: xe húc đổ, đạn nổ phá đổ.
 * - Ruộng (lúa, lúa mì, rơm, rau, sắn, đất khô): mặt ruộng kẻ luống bám theo địa hình.
 * - Xác xe cháy rụi (xe tăng / xe bọc thép / xe tải): chắn xe & chắn đạn như đá tảng, vài chiếc còn âm ỉ khói.
 * - Bao cát (mép hào ẩn xe, chốt đầu làng): chắn đạn thẳng & giảm sóng nổ; xe cán qua thì bẹp xuống.
 * - Hào ẩn xe: đã đào thẳng vào lưới độ cao trong MapGen; ở đây chỉ dựng bao cát trên ụ phía trước.
 * - Đô thị: đèn đường, đèn giao thông, cột điện + dây, xe con đỗ, nhà chờ xe buýt (xe húc đổ / cán bẹp), mái che cây
 *   xăng, cầu vượt bộ hành (cột / chân cầu chặn xe).
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

  const WRECK_HP = { truck: 2, apc: 5, tank: 9 };
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
  // ĐỒ VẬT ĐƯỜNG PHỐ (đô thị, MapGen 5e): đèn đường, đèn giao thông, cột điện + dây, xe con đỗ, nhà chờ xe buýt, mái
  // che cây xăng, cầu vượt bộ hành. Mỗi vật = vài khối hộp / trụ đơn vị (phóng theo ma trận) gom theo (hình, vật liệu)
  // thành InstancedMesh dùng chung -> ~15 draw call cho hàng nghìn vật. Hệ cục bộ: gốc tại chân vật, trục +z = hướng
  // "trước" của vật (cần đèn vươn ra phố / đầu xe / dọc tuyến dây điện / lưng nhà chờ / vào trong lô cây xăng),
  // quay theo góc angle của MapGen (+z -> (sin a, cos a)). Đổ / bẹp tính theo băm toạ độ (không RNG) -> mọi máy như nhau
  // ---------------------------------------------------------------------------
  // màu sơn theo mẫu (danh mục MapGen.CAR_CATALOG tag fixedColor -> map gửi color = -1)
  const CAR_FIXED_COL = { taxi: 0xe8b820 };
  const CAR_COL = [0xe8e8e6, 0xb8bcc0, 0x26282c, 0x9e2a26, 0x2c4c7c, 0x6c7074, 0x2e4a36, 0xc8b894, 0x1e2a44, 0x5e2228, 0x8aa8c0, 0x7a6a58];
  const SMAT = {
    paint: { color: 0xffffff, roughness: 0.4, metalness: 0.4 },
    cabin: { color: 0x121314, roughness: 0.92, metalness: 0 },
    glass: { color: 0x46575f, roughness: 0.08, metalness: 0.45, transparent: true, opacity: 0.6 },
    rim: { color: 0xc6cacd, roughness: 0.28, metalness: 0.85 },
    trim: { color: 0x1e2022, roughness: 0.72, metalness: 0.05 },
    plate: { color: 0xeeeee6, emissive: 0x1a1a18, roughness: 0.5, metalness: 0 },
    tire: { color: 0x161616, roughness: 0.92, metalness: 0 },
    metal: { color: 0x8a8f92, roughness: 0.5, metalness: 0.6 },
    dark: { color: 0x2a2d30, roughness: 0.6, metalness: 0.35 },
    concrete: { color: 0xb4b0a6, roughness: 0.92, metalness: 0 },
    glow: { color: 0xd8d2c0, emissive: 0x0c0b08, roughness: 0.3, metalness: 0 },   // đèn pha xe bỏ hoang: tắt (hết ắc quy)
    red: { color: 0x9a2018, emissive: 0x100202, roughness: 0.3, metalness: 0 },
    amber: { color: 0xc08a20, emissive: 0x2a1800, roughness: 0.4, metalness: 0 },
    green: { color: 0x1f8a40, emissive: 0x0a2a12, roughness: 0.4, metalness: 0 },
    roofBlue: { color: 0x3e5f80, roughness: 0.6, metalness: 0.3 },
    panel: { color: 0x9fc0cc, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.35, depthWrite: false },
    ad: { color: 0xe8e4d4, emissive: 0x26241c, roughness: 0.5, metalness: 0 },
    white: { color: 0xeeeeea, roughness: 0.55, metalness: 0.1 },
    brand: { color: 0xc8241c, roughness: 0.5, metalness: 0.1 },
    // thành phố ma mất điện: kính đèn giao thông tắt, chỉ còn màu kính bám bụi; bóng đèn đường tắt
    lensR: { color: 0x5a1a14, roughness: 0.25, metalness: 0.1 },
    lensA: { color: 0x5a4216, roughness: 0.25, metalness: 0.1 },
    lensG: { color: 0x1a4428, roughness: 0.25, metalness: 0.1 },
    sigBody: { color: 0x2b2c2a, roughness: 0.7, metalness: 0.3 },
    sigPole: { color: 0x575b58, roughness: 0.55, metalness: 0.55 },
    deadLamp: { color: 0x8c8a82, roughness: 0.35, metalness: 0.1 }
  };
  // phần: [hình 'box' | 'cyl', vật liệu, x, y, z, sx, sy, sz, rx, ry, rz] (hộp / trụ đơn vị tâm tại gốc)
  const P = (g, m, x, y, z, sx, sy, sz, rx, ry, rz) => [g, m, x, y, z, sx, sy, sz, rx || 0, ry || 0, rz || 0];
  // ---------------------------------------------------------------------------
  // MẪU Ô TÔ (tỉ lệ thật, 8 đv = 1 m; mũi xe theo +z cục bộ, mặt đất y = 0):
  //  - thân dưới: biên dạng cạnh xe (cản / capô dốc / mép kính / cốp) có khoét hốc bánh, đùn theo bề ngang + bo mép
  //  - khoang: kính bao quanh (biên dạng kính chắn gió nghiêng, mui, kính hậu), mui + cột A / B / C sơn màu xe
  //  - chi tiết: cản nhựa đen, lưới tản nhiệt, đèn pha / đèn hậu, gương, biển số, nẹp sườn; lốp + mâm kim loại
  // Phần có vai trò (role) để biến dạng khi bị cán / húc: 'body' thân dưới, 'cabin' khoang (sập xuống), 'wheel' bánh
  // ---------------------------------------------------------------------------
  // L dài, W rộng, belt mép dưới kính, clear gầm, r bán kính lốp, wb nửa chiều dài cơ sở, track nửa vệt bánh
  // body: biên dạng thân (z, y) từ mũi-dưới đi lên, dọc nóc ra đuôi, xuống đuôi-dưới (đáy + hốc bánh tự thêm)
  // gh: biên dạng kính (z, y so với mép kính): [chân kính chắn gió, đỉnh kính chắn gió, cuối mui, chân kính hậu]
  // bp: z cột B (null = không có), van: khoang là thùng tôn kín (kính chỉ ở cabin)
  // ---------------------------------------------------------------------------
  // MẪU Ô TÔ BỎ HOANG (8 đv = 1 m; mũi theo +z cục bộ, mặt đất y = 0)
  //  - thân dưới LOFT: ~40-70 mặt cắt siêu elip dọc thân (mũi / đuôi tròn khi nhìn từ trên, vai xe thu vào, nóc capô
  //    vồng nhẹ), hốc bánh khoét tròn 2 bên; khoang kính loft thu hẹp lên trên (tumblehome), mỗi mặt tự xếp loại:
  //    mui / cột A-B-C sơn, kính chắn gió / kính hậu / kính cửa; nội thất tối sau kính
  //  - lốp thành phồng (lathe), mâm 5 chấu, trống phanh tối; bóng tối dưới gầm
  //  - DẤU THỜI GIAN theo từng xe (thuộc tính aWear = bụi, gỉ, phai): texture mặt nạ theo thân (khe cửa, tay nắm, nắp
  //    capô / cốp, nắp xăng, bụi tích mặt ngang, bùn bắn chân sườn, vệt mưa chảy dọc, gỉ mép dưới / quanh hốc bánh /
  //    dọc khe cửa) trộn trong shader: sơn phai bạc, bụi đất phủ, gỉ nâu sần (nhám, mất bóng)
  // Phần có vai trò (role) để biến dạng khi bị cán / húc: 'body' thân dưới, 'cabin' khoang (sập), 'wheel' bánh
  // ---------------------------------------------------------------------------
  // top: đường nóc thân dưới (z tăng từ đuôi tới mũi, [z, y, bán kính bo]); gh: đường kính [chân kính hậu, đỉnh kính
  // hậu, đỉnh kính chắn gió, chân kính chắn gió] (y tính từ mép kính belt); doors: các cánh cửa [z trước, z sau]
  const CAR_SPEC = {
    sedan: { L: 37.4, W: 14.2, belt: 7.3, clear: 1.5, r: 2.6, wb: 11.2, m: 1.4,
      top: [[-18.7, 5.0], [-18.3, 6.3, 0.8], [-16.2, 7.2, 1.6], [-9.8, 7.3, 0.6], [6.8, 7.3, 0.6], [16.6, 6.7, 1.8], [18.7, 5.0]],
      gh: [[-9.8, 0], [-5.6, 4.6, 2.4], [1.2, 4.6, 2.0], [6.8, 0]], bp: -2.0, doors: [[6.4, -2.0], [-2.0, -9.2]] },
    hatch: { L: 32.4, W: 13.8, belt: 7.3, clear: 1.5, r: 2.5, wb: 9.8, m: 1.2,
      top: [[-16.2, 5.2], [-15.9, 6.4, 0.6], [-14.8, 7.3, 1.0], [6.0, 7.3, 0.6], [14.2, 6.6, 1.8], [16.2, 5.0]],
      gh: [[-14.8, 0], [-12.2, 4.7, 1.8], [0.8, 4.8, 2.2], [6.0, 0]], bp: -3.6, doors: [[5.8, -3.6], [-3.6, -11.0]] },
    suv: { L: 38.4, W: 15, belt: 8.8, clear: 2.1, r: 3.0, wb: 12.0, m: 2.1,
      top: [[-19.2, 6.0], [-18.9, 7.6, 0.6], [-17.8, 8.8, 0.8], [7.2, 8.8, 0.6], [16.6, 8.2, 1.4], [19.2, 6.2]],
      gh: [[-17.8, 0], [-16.6, 5.6, 1.4], [2.6, 5.6, 1.6], [7.2, 0]], bp: -4.0, rails: true, doors: [[7.0, -4.0], [-4.0, -12.4]] },
    van: { L: 40.4, W: 15.2, belt: 8.0, clear: 1.8, r: 2.8, wb: 13.0, m: 2.4, van: true,
      top: [[-20.2, 6.4], [-20.0, 7.6, 0.5], [-19.4, 8.0, 0.5], [17.4, 8.0, 0.6], [19.0, 7.4, 1.0], [20.2, 5.6]],
      gh: [[-19.4, 0], [-19.0, 7.6, 0.8], [12.4, 7.6, 1.8], [17.4, 0]], bp: null, doors: [[16.8, 10.8], [8.0, -4.0]] },
    pickup: { L: 42.4, W: 15, belt: 7.8, clear: 2.1, r: 3.0, wb: 13.4, m: 2.0, bed: true,
      top: [[-21.2, 6.2], [-21.0, 7.8, 0.5], [9.2, 7.8, 0.6], [18.8, 7.4, 1.4], [21.2, 6.0]],
      gh: [[-3.6, 0], [-2.8, 5.4, 1.2], [5.0, 5.4, 1.6], [9.2, 0]], bp: null, doors: [[9.0, -3.4]] }
  };
  CAR_SPEC.taxi = Object.assign({}, CAR_SPEC.sedan, { taxi: true });
  // bo tròn các góc đường gấp khúc: điểm [x, y, r] có r > 0 thay bằng cung tiếp xúc 2 cạnh kề
  function fillet(pts) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const B = pts[i], r = B[2] || 0;
      if (!r || i === 0 || i === pts.length - 1) { out.push([B[0], B[1]]); continue; }
      const A = pts[i - 1], C = pts[i + 1];
      let ux = A[0] - B[0], uy = A[1] - B[1], vx = C[0] - B[0], vy = C[1] - B[1];
      const la = Math.hypot(ux, uy), lc = Math.hypot(vx, vy);
      ux /= la; uy /= la; vx /= lc; vy /= lc;
      const th = Math.acos(Math.max(-1, Math.min(1, ux * vx + uy * vy)));
      if (th < 0.05 || th > Math.PI - 0.05) { out.push([B[0], B[1]]); continue; }
      const t = Math.min(r / Math.tan(th / 2), la * 0.45, lc * 0.45), rr = t * Math.tan(th / 2);
      const bx = ux + vx, by = uy + vy, bl = Math.hypot(bx, by), d = rr / Math.sin(th / 2);
      const cx = B[0] + bx / bl * d, cy = B[1] + by / bl * d;
      const p1 = [B[0] + ux * t, B[1] + uy * t], p2 = [B[0] + vx * t, B[1] + vy * t];
      let a0 = Math.atan2(p1[1] - cy, p1[0] - cx), a1 = Math.atan2(p2[1] - cy, p2[0] - cx), da = a1 - a0;
      while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
      for (let k = 0; k <= 6; k++) { const a = a0 + da * k / 6; out.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); }
    }
    return out;
  }
  // y của đường gấp khúc (z tăng dần) tại z (lấy cao nhất nếu nhiều đoạn chứa z)
  function lineAt(P, z) {
    let y = -Infinity;
    for (let i = 0; i < P.length - 1; i++) {
      const a = P[i], b = P[i + 1], lo = Math.min(a[0], b[0]), hi = Math.max(a[0], b[0]);
      if (z < lo - 1e-6 || z > hi + 1e-6) continue;
      y = Math.max(y, hi - lo < 1e-6 ? Math.max(a[1], b[1]) : a[1] + (b[1] - a[1]) * (z - a[0]) / (b[0] - a[0]));
    }
    return y === -Infinity ? P[z < P[0][0] ? 0 : P.length - 1][1] : y;
  }
  const spow = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);
  // lưới loft từ các vành (mỗi vành M+1 điểm, điểm cuối trùng điểm đầu cho uv liền); quay mặt ra ngoài theo tâm vành
  function ringMesh(rings, M) {
    const pos = [], uv = [], idx = [];
    for (const R of rings) for (const p of R) { pos.push(p[0], p[1], p[2]); uv.push(p[3], p[4]); }
    const S = M + 1;
    for (let i = 0; i < rings.length - 1; i++) for (let k = 0; k < M; k++) {
      const a = i * S + k, b = a + 1, c = a + S, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    // kiểm tra 1 điểm sườn phải (k = 0): pháp tuyến phải hướng +x; ngược thì lật chiều tam giác
    const mid = Math.floor(rings.length / 2) * S, n = g.attributes.normal;
    if (n.getX(mid) < 0) { const I = g.index.array; for (let i = 0; i < I.length; i += 3) { const t = I[i + 1]; I[i + 1] = I[i + 2]; I[i + 2] = t; } g.computeVertexNormals(); }
    return g;
  }
  const CAR_GEO = {};
  function carGeo(key) {
    if (CAR_GEO[key]) return CAR_GEO[key];
    let g;
    if (key === 'c:tire') {
      // lốp: mặt gai phẳng, vai bo, thành lốp phồng (bán kính 1 = mép ngoài, trục quay Y, bề ngang 1)
      const pr = [[0.6, -0.5], [0.8, -0.53], [0.93, -0.48], [0.99, -0.36], [1.0, -0.2], [1.0, 0.2], [0.99, 0.36], [0.93, 0.48], [0.8, 0.53], [0.6, 0.5]];
      g = new THREE.LatheGeometry(pr.map(p => new THREE.Vector2(p[0], p[1])), 26);
    } else if (key === 'c:rim') {
      // mâm hợp kim 5 chấu (mặt ngoài +Y): vành môi, lòng vành, 5 chấu, moay-ơ
      const parts = [];
      const lip = new THREE.LatheGeometry([[0.5, 0.36], [0.6, 0.42], [0.62, 0.47], [0.55, 0.49]].map(p => new THREE.Vector2(p[0], p[1])), 26);
      parts.push([lip, null], [new THREE.CylinderGeometry(0.58, 0.58, 0.82, 22, 1, true), null]);
      for (let k = 0; k < 5; k++) {
        const a = k / 5 * Math.PI * 2;
        parts.push([new THREE.BoxGeometry(0.1, 0.09, 0.44), M4(Math.sin(a) * 0.3, 0.44, Math.cos(a) * 0.3, 0, a, 0)]);
      }
      parts.push([new THREE.CylinderGeometry(0.15, 0.17, 0.12, 12), M4(0, 0.45, 0)]);
      g = merge(parts);
    } else if (key === 'c:drum') g = new THREE.CylinderGeometry(0.5, 0.5, 0.1, 16);
    else if (key === 'c:shadow') { g = new THREE.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2); }
    else {
      const [kind, part] = key.slice(2).split('_'), S = CAR_SPEC[kind];
      if (part === 'body') g = loftBody(S);
      else if (part === 'ghg' || part === 'ghp' || part === 'gha') { const G = loftCabin(S); CAR_GEO['c:' + kind + '_ghg'] = G.glass; CAR_GEO['c:' + kind + '_ghp'] = G.paint; CAR_GEO['c:' + kind + '_gha'] = G.all; g = part === 'ghg' ? G.glass : part === 'ghp' ? G.paint : G.all; }
    }
    return (CAR_GEO[key] = g);
  }
  // THÂN DƯỚI: vành siêu elip theo z; mặt bằng bo tròn mũi / đuôi (siêu elip bậc 6); đáy nâng thành vòm hốc bánh
  function loftBody(S) {
    const top = fillet(S.top), L2 = S.L / 2, W2 = S.W / 2, Ra = S.r + 0.5, sill = S.clear + 0.25, M = 36;
    const zs = new Set();
    for (let z = -L2; z <= L2 + 1e-6; z += 0.8) zs.add(+z.toFixed(3));
    for (const wz of [-S.wb, S.wb]) for (let z = wz - Ra - 0.3; z <= wz + Ra + 0.3; z += 0.22) zs.add(+z.toFixed(3));
    for (let z = L2 - 2.6; z <= L2; z += 0.22) { zs.add(+z.toFixed(3)); zs.add(+(-z).toFixed(3)); }
    zs.add(L2); zs.add(-L2);
    const Z = [...zs].filter(z => Math.abs(z) <= L2).sort((a, b) => a - b);
    const rings = Z.map(z => {
      const w = W2 * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(z) / L2, 6)), 1 / 6);
      let y0 = sill + 0.8 * Math.max(0, Math.min(1, (Math.abs(z) - (L2 - 4)) / 4));   // cản trước / sau cao hơn sườn
      for (const wz of [-S.wb, S.wb]) { const d = z - wz; if (Math.abs(d) < Ra) y0 = Math.max(y0, S.r + Math.sqrt(Ra * Ra - d * d)); }
      const y1 = Math.max(y0 + 0.08, lineAt(top, z)), ym = (y0 + y1) / 2, hh = (y1 - y0) / 2;
      const R = [];
      for (let k = 0; k <= M; k++) {
        const th = k / M * Math.PI * 2, ex = spow(Math.cos(th), 0.2), ey = spow(Math.sin(th), 0.27);
        R.push([w * ex * (1 - 0.05 * Math.max(0, ey)), ym + hh * ey, z, (z + L2) / S.L, k / M]);
      }
      return R;
    });
    return ringMesh(rings, M);
  }
  // KHOANG: vành từ đáy (chìm vào thân) lên đường mui, hẹp dần lên trên; tam giác xếp loại kính / sơn theo hướng mặt
  function loftCabin(S) {
    const gh = fillet(S.gh), z0 = gh[0][0], z1 = gh[gh.length - 1][0], Wb = (S.W - 2.0) / 2, M = 40;
    const roofZ0 = S.gh[1][0], roofZ1 = S.gh[2][0];
    const rings = [];
    for (let z = z0; z <= z1 + 1e-6; z += 0.3) {
      const h = Math.max(0.05, lineAt(gh, z)), R = [];
      for (let k = 0; k <= M; k++) {
        const th = k / M * Math.PI * 2, ex = spow(Math.cos(th), 0.3), ey = spow(Math.sin(th), 0.42), t = (ey + 1) / 2;
        R.push([(Wb - 1.5 * t) * ex, -0.6 + (h + 0.6) * t, z, (z - z0) / (z1 - z0), k / M]);
      }
      rings.push(R);
    }
    const all = ringMesh(rings, M), g = all.toNonIndexed();
    const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
    const gl = { p: [], n: [], u: [] }, pa = { p: [], n: [], u: [] };
    for (let t = 0; t < P.count; t += 3) {
      let nx = 0, ny = 0, nz = 0, cz = 0, cy = 0, ax = 0;
      for (let j = 0; j < 3; j++) { nx += N.getX(t + j); ny += N.getY(t + j); nz += N.getZ(t + j); cz += P.getZ(t + j) / 3; cy += P.getY(t + j) / 3; ax = Math.max(ax, Math.abs(P.getX(t + j))); }
      const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
      const h = lineAt(gh, cz), edge = ax > Wb - 1.5 * Math.min(1, Math.max(0, (cy + 0.6) / (h + 0.6))) - 0.55;
      let glass;
      if (ny > 0.72 || ny < -0.5) glass = false;                       // mui / đáy
      else if (nz > 0.42) glass = !edge && cy > 0.3 && ny < 0.85;                    // kính chắn gió (cột A ở 2 mép)
      else if (nz < -0.42) glass = !S.van && !edge && cy > 0.4;         // kính hậu (cột C ở 2 mép)
      else {
        // kính cửa 2 bên: giữa cột A và cột C, trừ cột B; xe van chỉ có kính cửa cabin
        const zA = roofZ1 - 0.6, zC = roofZ0 + 0.7;
        glass = Math.abs(nx) > 0.55 && cy > 0.3 && cy < h - 0.45 && (S.van ? (cz > roofZ1 - 6.8 && cz < zA) : (cz > zC && cz < zA && (S.bp === null || Math.abs(cz - S.bp) > 0.55)));
      }
      const o = glass ? gl : pa;
      for (let j = 0; j < 3; j++) { o.p.push(P.getX(t + j), P.getY(t + j), P.getZ(t + j)); o.n.push(N.getX(t + j), N.getY(t + j), N.getZ(t + j)); o.u.push(U.getX(t + j), U.getY(t + j)); }
    }
    const mk = o => { const q = new THREE.BufferGeometry(); q.setAttribute('position', new THREE.Float32BufferAttribute(o.p, 3)); q.setAttribute('normal', new THREE.Float32BufferAttribute(o.n, 3)); q.setAttribute('uv', new THREE.Float32BufferAttribute(o.u, 2)); return q; };
    return { glass: mk(gl), paint: mk(pa), all };
  }
  // Danh sách phần của 1 mẫu xe: [hình, vật liệu, x, y, z, sx, sy, sz, rx, ry, rz, vai trò]
  const CP = (g, m, x, y, z, sx, sy, sz, rx, ry, rz, role) => [g, m, x, y, z, sx, sy, sz, rx || 0, ry || 0, rz || 0, role || 'body'];
  function carParts(kind) {
    const S = CAR_SPEC[kind], base = kind === 'taxi' ? 'sedan' : kind, L2 = S.L / 2, W2 = S.W / 2, B = S.belt;
    const H = S.gh[1][1], Wg = S.W - 2.0, zRoof = (S.gh[1][0] + S.gh[2][0]) / 2, zWs = S.gh[3][0];
    const P2 = [];
    P2.push(CP('c:' + base + '_body', 'paint', 0, 0, 0, 1, 1, 1));
    P2.push(CP('c:' + base + '_ghp', 'paint', 0, B, 0, 1, 1, 1, 0, 0, 0, 'cabin'));
    P2.push(CP('c:' + base + '_ghg', 'glass', 0, B, 0, 1, 1, 1, 0, 0, 0, 'cabin'));
    // nội thất tối sau kính (ghế, taplo): kính bán trong không nhìn xuyên ra sau xe
    P2.push(CP('c:' + base + '_gha', 'cabin', 0, B - 0.15, (S.gh[0][0] + zWs) * 0.04, 0.9, 0.86, 0.92, 0, 0, 0, 'cabin'));   // khối nội thất = khoang thu nhỏ
    if (S.van) P2.push(CP('box', 'trim', 0, B - 0.1, -2, S.W + 0.12, 0.35, S.L * 0.6));   // gân thùng tôn
    if (S.rails) for (const sx of [1, -1]) P2.push(CP('box', 'trim', sx * (Wg / 2 - 1.2), B + H + 0.5, zRoof, 0.4, 0.45, Math.abs(S.gh[2][0] - S.gh[1][0]) + 1, 0, 0, 0, 'cabin'));
    if (S.bed) {
      // thùng hàng bán tải: 2 thành + bửng sau, sàn thùng, gờ mép thùng
      const bz0 = S.gh[0][0] - 0.8, bz1 = -L2 + 0.5, bl = bz0 - bz1;
      for (const sx of [1, -1]) P2.push(CP('box', 'paint', sx * (W2 - 0.55), B + 1.3, (bz0 + bz1) / 2, 0.8, 2.6, bl), CP('box', 'trim', sx * (W2 - 0.55), B + 2.7, (bz0 + bz1) / 2, 1.0, 0.25, bl));
      P2.push(CP('box', 'paint', 0, B + 1.3, bz1 + 0.35, S.W - 1.2, 2.6, 0.7), CP('box', 'trim', 0, B + 0.1, (bz0 + bz1) / 2, S.W - 2, 0.25, bl - 1));
    }
    if (S.taxi) P2.push(CP('box', 'glow', 0, B + H + 0.85, zRoof, 4.0, 1.4, 2.0, 0, 0, 0, 'cabin'));
    // cản (nhựa đen), lưới tản nhiệt, đèn pha / hậu, gương, tay gạt mưa, biển số, ống xả
    const bumpY = S.clear + 1.3;
    P2.push(CP('box', 'trim', 0, bumpY, L2 - 0.4, S.W * 0.74, 1.6, 1.0), CP('box', 'trim', 0, bumpY, -L2 + 0.4, S.W * 0.74, 1.6, 1.0));
    P2.push(CP('box', 'trim', 0, bumpY + 1.7, L2 - 0.35, S.W * (S.rails ? 0.5 : 0.38), S.rails ? 1.9 : 1.1, 0.5));
    const lightY = bumpY + 2.1;
    for (const sx of [1, -1]) {
      P2.push(CP('box', 'glow', sx * W2 * 0.6, lightY, L2 - 0.55, 2.6, 0.9, 0.7));
      P2.push(CP('box', 'red', sx * W2 * 0.62, lightY + 0.7, -L2 + 0.55, 2.2, 1.1, 0.7));
      P2.push(CP('box', 'paint', sx * (W2 - 0.1), B + 0.85, zWs - 1.9, 1.3, 0.9, 1.0));
      P2.push(CP('box', 'trim', sx * (W2 - 0.9), B + 0.65, zWs - 1.6, 0.6, 0.3, 0.3));
    }
    P2.push(CP('box', 'trim', 1.6, B + 0.25, zWs + 0.5, 4.5, 0.18, 0.3, 0, 0.12, 0), CP('box', 'trim', -2.6, B + 0.25, zWs + 0.6, 4.5, 0.18, 0.3, 0, 0.12, 0));
    P2.push(CP('box', 'plate', 0, bumpY + 0.05, L2 + 0.1, 3.6, 1.0, 0.15), CP('box', 'plate', 0, bumpY + 0.05, -L2 - 0.1, 3.6, 1.0, 0.15));
    P2.push(CP('c:drum', 'trim', W2 * 0.45, S.clear + 0.6, -L2 + 0.6, 0.55, 2.0, 0.55, Math.PI / 2, 0, 0));   // ống xả
    // bánh: lòng hốc bánh tối, lốp, trống phanh, mâm (mặt ngoài quay ra ngoài xe)
    for (const sx of [1, -1]) for (const sz of [1, -1]) {
      const wx = sx * (W2 - 1.45), rz = sx > 0 ? -Math.PI / 2 : Math.PI / 2;
      P2.push(CP('box', 'cabin', sx * (W2 - 3.2), S.r + 0.7, sz * S.wb, 3.0, (S.r + 0.5) * 1.5, (S.r + 0.5) * 2));
      P2.push(CP('c:tire', 'tire', wx, S.r, sz * S.wb, S.r, 2.0, S.r, 0, 0, rz, 'wheel'));
      P2.push(CP('c:drum', 'trim', wx - sx * 0.1, S.r, sz * S.wb, S.r * 0.95, 1.4, S.r * 0.95, 0, 0, rz, 'wheel'));
      P2.push(CP('c:rim', 'rim', wx, S.r, sz * S.wb, S.r, 2.0, S.r, 0, 0, rz, 'wheel'));
    }
    // bóng tối dưới gầm (xe "đứng" trên mặt đường)
    P2.push(CP('c:shadow', 'shadow', 0, 0.35, 0, S.W * 1.25, 1, S.L * 1.08));
    return P2;
  }
  const CAR = {};
  for (const k in CAR_SPEC) CAR[k] = carParts(k);

  // ---------------------------------------------------------------------------
  // DẤU THỜI GIAN: texture mặt nạ (R chi tiết tối: khe / tay nắm / vệt bẩn · G bụi · B gỉ · A biến thiên) theo uv của
  // thân loft (u dọc thân đuôi -> mũi, v quanh mặt cắt: 0 sườn phải, 0.25 nóc, 0.5 sườn trái, 0.75 gầm)
  // ---------------------------------------------------------------------------
  const vnoise = (x, y, s) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, f = t => t * t * (3 - 2 * t);
    const h = (a, b) => hash(a * 73856093 ^ b * 19349663 ^ s);
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    return a + (b - a) * f(xf) + (c - a) * f(yf) + (a - b - c + d) * f(xf) * f(yf);
  };
  const fbm2 = (x, y, s) => (vnoise(x, y, s) * 0.55 + vnoise(x * 2.1, y * 2.1, s + 7) * 0.28 + vnoise(x * 4.3, y * 4.3, s + 13) * 0.17);
  const WEAR_TEX = {};
  function wearTex(key) {
    if (WEAR_TEX[key]) return WEAR_TEX[key];
    const Wd = 256, Hd = 128, n = Wd * Hd, R = new Float32Array(n), G = new Float32Array(n), Bc = new Float32Array(n), A = new Float32Array(n);
    const kind = key.split(':')[1], S = CAR_SPEC[kind], seed = key.length * 131;
    for (let j = 0; j < Hd; j++) for (let i = 0; i < Wd; i++) {
      const p = j * Wd + i, u = i / Wd, v = j / Hd, nz = fbm2(u * 18, v * 9, seed), nz2 = fbm2(u * 46, v * 23, seed + 5);
      A[p] = nz2; R[p] = 0.93 + 0.07 * nz2;
      if (key.startsWith('glass')) { G[p] = 0.25 + 0.75 * nz; Bc[p] = 0; continue; }
      if (key === 'box') { G[p] = 0.3 + 0.6 * nz; Bc[p] = Math.max(0, nz2 - 0.5) * 2; continue; }
      // bụi: tích dày trên mặt ngang (nóc / capô / cốp), mỏng dần xuống sườn, bùn bắn dải chân sườn; gỉ: mép dưới, quanh
      // hốc bánh, mảng lốm đốm
      const top = Math.max(0, 1 - Math.abs(v - 0.25) / 0.14), sideLow = Math.max(0, 1 - Math.abs(v - 0.69) / 0.06) + Math.max(0, 1 - Math.abs(v - 0.81) / 0.06);
      G[p] = Math.min(1, (0.25 + 0.75 * top) * (0.55 + 0.6 * nz) + sideLow * 0.7 * nz2);
      let rust = Math.max(0, (sideLow * 1.2 - 0.3)) * (0.5 + nz) + Math.max(0, nz2 - 0.78) * 2.5;
      if (S) for (const wz of [-S.wb, S.wb]) {
        const uw = (wz + S.L / 2) / S.L, du = Math.abs(u - uw) * S.L;
        if (du < S.r + 1.6 && (v > 0.6 || v < 0.05 || (v > 0.45 && v < 0.62))) rust += Math.max(0, 1 - du / (S.r + 1.6)) * 0.8 * (0.4 + nz);
      }
      Bc[p] = Math.min(1, rust);
    }
    const line = (u0, v0, v1, val, wpx) => { const i = Math.round(u0 * Wd); for (let j = Math.floor(v0 * Hd); j <= Math.ceil(v1 * Hd); j++) for (let d = 0; d < wpx; d++) { const jj = (j + Hd) % Hd, ii = Math.min(Wd - 1, Math.max(0, i + d)); R[jj * Wd + ii] = Math.min(R[jj * Wd + ii], val); Bc[jj * Wd + ii] = Math.min(1, Bc[jj * Wd + ii] + 0.25); } };
    const rect = (u0, v0, du, dv, val) => { for (let j = Math.floor(v0 * Hd); j < Math.ceil((v0 + dv) * Hd); j++) for (let i = Math.floor(u0 * Wd); i < Math.ceil((u0 + du) * Wd); i++) { const jj = (j + Hd) % Hd; if (i >= 0 && i < Wd) R[jj * Wd + i] = Math.min(R[jj * Wd + i], val); } };
    if (S && key.startsWith('body')) {
      const U = z => (z + S.L / 2) / S.L;
      // khe cửa 2 bên + tay nắm; khe nắp capô / cốp; nắp bình xăng; vệt mưa chảy dọc sườn
      for (const [zf, zr] of S.doors) for (const zz of [zf, zr]) { line(U(zz), -0.13, 0.12, 0.35, 1); line(U(zz), 0.38, 0.63, 0.35, 1); }
      for (const [, zr] of S.doors) { rect(U(zr + 0.6), 0.075, 0.03, 0.025, 0.3); rect(U(zr + 0.6), 0.4, 0.03, 0.025, 0.3); }
      const zw = S.gh[3][0];
      line(U(zw + 0.8), 0.13, 0.37, 0.4, 1);
      if (!S.van && !S.bed && kind !== 'hatch') line(U(S.gh[0][0] - 0.7), 0.13, 0.37, 0.4, 1);
      rect(U(-S.L / 2 + 6.5), 0.04, 0.035, 0.05, 0.55);
      // vệt mưa: từ vai xe chảy xuống dọc sườn (sườn phải: v giảm qua 0 về 0.86; sườn trái: v tăng 0.39 -> 0.64), cuốn
      // bụi đi, để lại vệt cáu bẩn
      for (let k = 0; k < 14; k++) {
        const ii = Math.floor(hash(seed + k * 7) * Wd), right = hash(seed + k * 7 + 1) < 0.5, steps = Math.floor((0.1 + hash(seed + k * 7 + 2) * 0.14) * Hd);
        for (let st = 0; st < steps; st++) {
          const jj = ((Math.floor((right ? 0.11 : 0.39) * Hd) + (right ? -st : st)) % Hd + Hd) % Hd, p = jj * Wd + ii;
          G[p] *= 0.55; R[p] = Math.min(R[p], 0.9);
        }
      }
    }
    const c = document.createElement('canvas'); c.width = Wd; c.height = Hd;
    const g2 = c.getContext('2d'), img = g2.createImageData(Wd, Hd);
    for (let p = 0; p < n; p++) { img.data[p * 4] = R[p] * 255; img.data[p * 4 + 1] = G[p] * 255; img.data[p * 4 + 2] = Bc[p] * 255; img.data[p * 4 + 3] = 255; }   // alpha giữ 255: canvas nhân sẵn alpha sẽ làm sai các kênh mặt nạ
    g2.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
    t.premultiplyAlpha = false;
    return (WEAR_TEX[key] = t);
  }
  // vật liệu có dấu thời gian: màu (theo xe) -> phai bạc theo aWear.z, tối theo khe / vết bẩn (R), gỉ (B x aWear.y),
  // bụi (G x aWear.x); bụi / gỉ làm mất bóng (nhám, hết kim loại)
  function wearMaterial(params, tex, glass) {
    const m = new THREE.MeshStandardMaterial(params);
    m.onBeforeCompile = sh => {
      sh.uniforms.wearMap = { value: tex };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aWear;\nvarying vec3 vWear;\nvarying vec2 vWUv;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\nvWear = aWear; vWUv = uv;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D wearMap;\nvarying vec3 vWear;\nvarying vec2 vWUv;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          vec4 wm = texture2D(wearMap, vWUv);
          float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(lum) * 0.8 + 0.1, vWear.z * 0.75);
          diffuseColor.rgb *= wm.r;
          float rustK = clamp(wm.b * vWear.y * 1.7 - 0.12, 0.0, 1.0);
          float var1 = wm.r;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.36, 0.19, 0.09) * (0.6 + 0.6 * var1), rustK);
          float dustK = clamp(wm.g * vWear.x * ${glass ? '1.1' : '1.25'}, 0.0, 0.93);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.5, 0.46, 0.39) * (0.85 + 0.25 * var1), dustK);
          ${glass ? 'diffuseColor.a = mix(diffuseColor.a, 1.0, dustK * 0.8);' : ''}
          float wearRough = max(rustK, dustK);`)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.96, wearRough);')
        .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor *= 1.0 - wearRough;');
    };
    return m;
  }
  // bóng dưới gầm: gradient tối tâm, mờ dần ra mép
  const shadowTex = () => tex('carShadow', 64, 64, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(0,0,0,0.75)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  // nửa rộng hw, nửa dài hl, cao capô hood (mặt xích leo lên trước khi nóc sập), mép dưới kính belt (trên đó là khoang sập
  // khi bị cán), khối lượng m (tấn)
  const CAR_DIM = {
    sedan: { hw: 7.1, hl: 18.7, hood: 6.8, belt: 7.3, m: 1.4 }, hatch: { hw: 6.9, hl: 16.2, hood: 6.8, belt: 7.3, m: 1.2 },
    suv: { hw: 7.5, hl: 19.2, hood: 8.3, belt: 8.8, m: 2.1 }, van: { hw: 7.6, hl: 20.2, hood: 8.0, belt: 8.0, m: 2.4 },
    pickup: { hw: 7.5, hl: 21.2, hood: 7.8, belt: 7.8, m: 2.0 }
  };
  CAR_DIM.taxi = CAR_DIM.sedan;
  // động lượng (tấn x đv/s) cần để húc gãy / đổ: cột đèn thép, đèn giao thông, nhà chờ, cột điện bê tông cốt thép
  const BREAK_P = { lamp: 140, signal: 190, busStop: 230, pole: 420 };
  // cụm 3 đèn tại (x, y, z) quay mặt +x (fx = 1) hoặc -x; tilt: cụm treo lệch (khớp treo gỉ gãy 1 bên)
  function signalHead(x, y, z, fx, tilt) {
    const out = [], H = 9.6, rz = tilt || 0;
    const at = (dy) => [x - Math.sin(rz) * dy, y + Math.cos(rz) * dy];
    out.push(P('box', 'sigBody', x, y, z, 2.4, H, 2.8, 0, 0, rz));
    out.push(P('box', 'white', x - fx * 1.35, y, z, 0.12, H + 2.4, 5.6, 0, 0, rz));       // viền phản quang tấm hắt
    out.push(P('box', 'sigBody', x - fx * 1.28, y, z, 0.16, H + 2.0, 5.2, 0, 0, rz));     // tấm hắt đen
    [[3.1, 'lensR'], [0, 'lensA'], [-3.1, 'lensG']].forEach(([dy, m]) => {
      const [px, py] = at(dy);
      out.push(P('cyl', m, px + fx * 1.25, py, z, 1.05, 0.3, 1.05, 0, 0, Math.PI / 2 + rz));
      out.push(P('box', 'sigBody', px + fx * 2.1, py + 1.2, z, 1.8, 0.14, 2.5, 0, 0, rz - fx * 0.18));   // mái chụp
      for (const sz of [-1, 1]) out.push(P('box', 'sigBody', px + fx * 2.0, py + 0.3, z + sz * 1.2, 1.6, 1.8, 0.1, 0, 0, rz));
    });
    return out;
  }
  function signalParts(variant) {
    const p = [
      P('cyl', 'concrete', 0, 0.8, 0, 2.2, 1.6, 2.2),                 // bệ móng
      P('cyl', 'sigPole', 0, 2.2, 0, 1.5, 1.4, 1.5),                  // chân đế bắt bu lông
      P('cyl', 'sigPole', 0, 25, 0, 1.0, 48, 1.0), P('cyl', 'sigPole', 0, 49.2, 0, 1.15, 0.6, 1.15),
      P('box', 'sigPole', 0, 45.5, 11, 1.0, 1.1, 22), P('box', 'sigPole', 0, 45.6, 29, 0.7, 0.8, 16),   // cần vươn thon dần
      P('box', 'sigPole', 0, 41.5, 6.5, 0.45, 0.45, 15.5, -0.52, 0, 0),                                   // thanh chống xiên
      P('box', 'sigBody', 0, 44.6, 33.6, 0.4, 1.6, 0.4),                                                  // khớp treo
      P('box', 'sigBody', 0.9, 13, 0, 1.4, 6, 3.2),                                                        // hộp điều khiển
      P('box', 'sigBody', 0, 19, 1.6, 2.2, 4.8, 2.2), P('box', 'lensR', 0, 20.1, 2.75, 1.4, 1.4, 0.1), P('box', 'lensG', 0, 17.9, 2.75, 1.4, 1.4, 0.1)   // đèn đi bộ
    ];
    p.push(...signalHead(0, 39.2, 34, 1, variant ? 0.32 : 0));
    p.push(...signalHead(-1.2, 30, 0, -1, 0));      // cụm phụ trên cột (hướng xe phía bên kia)
    return p;
  }
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const impact = (...a) => { if (typeof spgImpact === 'function') spgImpact(...a); };
  const gameFx = () => { const g = typeof window !== 'undefined' && window.game; return g && g.effectsManager && g.effectsManager.fx || null; };
  const STREET = {
    // đèn đường cao 9 m, cần vươn 1,8 m ra lòng đường
    lamp: { rad: 1.6, h: 72, walk: true, parts: [P('cyl', 'metal', 0, 2, 0, 1.3, 4, 1.3), P('cyl', 'metal', 0, 36, 0, 0.7, 72, 0.7),
      P('box', 'metal', 0, 71, 7, 0.5, 0.5, 14), P('box', 'dark', 0, 70.5, 14.5, 2.2, 1.2, 5), P('box', 'deadLamp', 0, 69.8, 14.5, 1.6, 0.2, 4)] },
    // đèn giao thông kiểu cần vươn: bệ bê tông, cột thép mạ kẽm 6 m, cần vươn thon dần 4,8 m + thanh chống xiên; cụm đèn
    // chính treo trên lòng đường quay về dòng xe tới (+x): vỏ đèn, tấm hắt sau viền trắng phản quang, 3 kính tròn có chụp
    // che nắng (mái + 2 má); cụm phụ trên thân cột cho làn sát lề, đèn đi bộ, hộp điều khiển. Mất điện: kính tắt.
    signal: { rad: 2, h: 48, walk: true, parts: signalParts(false) },
    signalB: { rad: 2, h: 48, walk: true, parts: signalParts(true) },
    // cột điện bê tông 10 m, xà ngang vuông góc tuyến dây
    pole: { rad: 2, h: 82, walk: true, parts: [P('box', 'concrete', 0, 41, 0, 1.9, 82, 1.9), P('box', 'dark', 0, 77, 0, 16, 0.9, 0.9)] },
    // nhà chờ xe buýt: mái, vách kính sau lưng, ghế, bảng quảng cáo bên hông
    busStop: { rad: 14, h: 21, walk: true, flat: true, parts: [
      P('cyl', 'metal', 13, 10, -5, 0.5, 20, 0.5), P('cyl', 'metal', -13, 10, -5, 0.5, 20, 0.5), P('cyl', 'metal', 13, 10, 5, 0.5, 20, 0.5), P('cyl', 'metal', -13, 10, 5, 0.5, 20, 0.5),
      P('box', 'roofBlue', 0, 20.6, 0, 30, 1, 13), P('box', 'panel', 0, 10.5, 5.6, 26, 15, 0.4), P('box', 'metal', 0, 4, 3.4, 20, 1, 3), P('box', 'ad', 14.2, 9.5, 0, 0.6, 14, 10)] }
  };
  const UNIT = { box: () => new THREE.BoxGeometry(1, 1, 1), cyl: () => new THREE.CylinderGeometry(1, 1, 1, 10) };

  class StreetSet {
    constructor(T, data, group) {
      this.T = T; this.group = group;
      this.grid = new Map(); this.items = [];
      this.ims = {};          // 'hình|vật liệu' -> { im, list: [Matrix4], cols: [Color] }
      this.wires = [];
      this.moving = new Set();   // ô tô đang trượt sau cú húc
      this.burningSet = new Set(); this.smolderSet = new Set();   // ô tô đang cháy / cháy xong còn âm ỉ khói
      const D = data, S = (x, z) => T.groundAtRaw(x, z);
      const add = (o, parts) => { o.parts = parts; o.seed = ((o.x * 7) ^ (o.z * 13)) | 0; this.items.push(o); this.addGrid(o); };
      for (const l of D.lamps || []) add({ type: 'lamp', x: l.x, z: l.z, angle: l.angle }, STREET.lamp.parts);
      for (const l of D.signals || []) {
        // bỏ hoang lâu năm: cột hơi nghiêng, ~1/3 cụm đèn treo lệch
        const o = { type: 'signal', x: l.x, z: l.z, angle: l.angle }, hs = hash((l.x * 13) ^ (l.z * 7));
        o.roll = (hs - 0.5) * 0.05; o.pitch = (hash(hs * 9999 | 0) - 0.5) * 0.04;
        add(o, (hs * 7 % 1) < 0.33 ? STREET.signalB.parts : STREET.signal.parts);
      }
      const poles = (D.poles || []).map(l => { const o = { type: 'pole', x: l.x, z: l.z, angle: l.angle, link: l.link }; add(o, STREET.pole.parts); return o; });
      for (const l of D.busStops || []) add({ type: 'busStop', x: l.x, z: l.z, angle: l.angle }, STREET.busStop.parts);
      const useCivilCars = typeof CivilCars !== 'undefined';
      for (const c of D.cars || []) {
        const o = { type: 'car', x: c.x, z: c.z, angle: c.angle, kind: c.kind, rad: 9, c: 0, d: 0, roll: 0, pitch: 0, skew: 0, squeeze: 0 };
        o.color = new THREE.Color(CAR_FIXED_COL[c.kind] !== undefined && (c.color < 0 || c.kind === 'taxi') ? CAR_FIXED_COL[c.kind] : CAR_COL[Math.max(0, c.color) % CAR_COL.length]);
        if (c.seed !== undefined) o.seed = c.seed | 0;   // seed biến thể từ map (bụi / gỉ / hư hại), không phụ thuộc vị trí
        this.abandon(o);
        if (useCivilCars) {
          try {
            let age = 0.35, rust = 0.15, dust = 0.25;
            if (o.burnt) {
              age = 1.0; rust = 0.95; dust = 0.85;
            } else if (o.rusted) {
              age = 0.92; rust = 0.9; dust = 0.65;
            } else if (o.preBroken) {
              age = 0.72; rust = 0.45; dust = 0.6;
            } else if (o.dusty) {
              age = 0.55; rust = 0.25; dust = 0.88;
            } else {
              age = 0.12 + hash(o.seed + 1) * 0.18; rust = 0.05; dust = 0.15;
            }
            const carGrp = CivilCars.build(c.kind, {
              color: o.color,
              age,
              rust,
              dust,
              seed: o.seed,
              fuel: o.fuel,
              burnt: o.burnt,
              crush: o.burnt ? 0.35 : (o.c || 0)
            });
            o.group = carGrp;
            this.group.add(carGrp);
            o.parts = [];
            o.seed = ((o.x * 7) ^ (o.z * 13)) | 0;
            this.items.push(o);
            this.addGrid(o);
          } catch (e) {
            console.warn('[props] Lỗi dựng CivilCars, dùng model cũ:', e);
            add(o, CAR[c.kind] || CAR.sedan);
          }
        } else {
          add(o, CAR[c.kind] || CAR.sedan);
        }
      }
      // mái che cây xăng + cột bơm; cầu vượt bộ hành — vật cố định (cột / chân cầu chặn xe như đá tảng)
      for (const c of D.canopies || []) this.addCanopy(c);
      for (const f of D.footbridges || []) this.addFootbridge(f);
      for (const o of this.items) {
        o.y = S(o.x, o.z) + (STREET[o.type] && STREET[o.type].walk ? 1.2 : 0);   // trên vỉa hè (cao 15 cm)
        if (o.group) {
          o.group.position.set(o.x, o.y, o.z);
          o.group.rotation.y = o.angle;
          if (o.roll || o.pitch) {
            o.group.rotation.x = o.pitch || 0;
            o.group.rotation.z = o.roll || 0;
          }
          o.slots = [];
        } else {
          o.slots = o.parts.map(p => this.slot(p, o));
        }
      }
      // dây điện: mỗi nhịp giữa 2 cột liên tiếp = 3 dây x 2 đoạn võng
      for (const p of poles) {
        if (p.link < 0 || !poles[p.link]) continue;
        const q = poles[p.link], span = { a: p, b: q, slots: [] };
        for (const off of [-7, 0, 7]) {
          const A = this.armPoint(p, off), B = this.armPoint(q, off), M = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2 - Math.hypot(B[0] - A[0], B[2] - A[2]) * 0.035, (A[2] + B[2]) / 2];
          for (const [u, v] of [[A, M], [M, B]]) span.slots.push(this.wireSlot(u, v));
        }
        (p.spans || (p.spans = [])).push(span); (q.spans || (q.spans = [])).push(span);
        this.wires.push(span);
      }
      for (const k in this.ims) {
        const e = this.ims[k], [g, m] = k.split('|');
        const geo = g.startsWith('c:') ? carGeo(g).clone() : UNIT[g]();
        let mat;
        if (m === 'shadow') mat = new THREE.MeshBasicMaterial({ map: shadowTex(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
        else if (m === 'paint' || m === 'glass' || m === 'rim') {
          const kind = g.startsWith('c:') ? g.slice(2).split('_')[0] : '', part = g.startsWith('c:') ? g.slice(2).split('_')[1] : '';
          const key = m === 'glass' ? 'glass:' + kind : part === 'body' ? 'body:' + kind : part === 'ghp' ? 'cab:' + kind : 'box';
          mat = wearMaterial(SMAT[m], wearTex(key), m === 'glass');
          // thuộc tính dấu thời gian từng xe (bụi, gỉ, phai)
          geo.setAttribute('aWear', new THREE.InstancedBufferAttribute(new Float32Array(e.wear.length ? e.wear : new Array(e.list.length * 3).fill(0)), 3));
        } else mat = new THREE.MeshStandardMaterial(SMAT[m]);
        const env = typeof VehicleKit !== 'undefined' && VehicleKit.getEnvCube ? VehicleKit.getEnvCube() : null;
        if (env && (m === 'paint' || m === 'glass' || m === 'rim' || m === 'glow' || m === 'red')) { mat.envMap = env; mat.envMapIntensity = m === 'paint' ? 0.75 : m === 'glass' ? 1.2 : 0.9; }
        const im = new THREE.InstancedMesh(geo, mat, e.list.length);
        im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(e.list.length * 3).fill(1), 3);
        e.list.forEach((mx, i) => { im.setMatrixAt(i, mx); im.setColorAt(i, e.cols[i]); });
        im.castShadow = m !== 'panel' && m !== 'glow' && m !== 'shadow' && m !== 'glass'; im.receiveShadow = m !== 'shadow'; im.frustumCulled = false;
        im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
        im.name = 'street_' + k;
        this.group.add(im); e.im = im;
      }
      // tình trạng ban đầu cần InstancedMesh đã dựng: kính vỡ sẵn, xác cháy
      for (const o of this.items) if (o.type === 'car') { if (o.burnt) this.charCar(o); else if (o.preBroken) this.shatter(o, true); }
      this.flush();
    }
    key(x, z) { return Math.floor(x / 60) * 1000 + Math.floor(z / 60); }
    addGrid(o) { const k = this.key(o.x, o.z); if (!this.grid.has(k)) this.grid.set(k, []); this.grid.get(k).push(o); }
    near(x, z, r) {
      const out = [];
      for (let i = Math.floor((x - r) / 60); i <= Math.floor((x + r) / 60); i++)
        for (let j = Math.floor((z - r) / 60); j <= Math.floor((z + r) / 60); j++) { const l = this.grid.get(i * 1000 + j); if (l) for (const o of l) out.push(o); }
      return out;
    }
    // ma trận thế giới của 1 phần: chân vật (x, y, z) · đổ (quay quanh chân về hướng fall) · bẹp (sy) · hướng vật · phần
    partMatrix(o, p) {
      if (o.type === 'car') { p = this.deformCar(o, p); if (!p) return new THREE.Matrix4().makeScale(0, 0, 0); }
      const local = M4(p[2], p[3], p[4], p[8], p[9], p[10], p[5], p[6], p[7]);
      const base = new THREE.Matrix4().makeRotationY(o.angle);
      // ô tô bị cán lệch một bên / bị húc: thân nghiêng ngang (roll) / chúc (pitch) quanh chân
      if (o.roll || o.pitch) base.multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(o.pitch || 0, 0, o.roll || 0)));
      if (o.squash) base.premultiply(new THREE.Matrix4().makeScale(1, o.squash, 1));
      if (o.fall) {
        const ax = new THREE.Vector3(o.fall[1], 0, -o.fall[0]).normalize();
        base.premultiply(new THREE.Matrix4().makeRotationAxis(ax, o.fallA || 1.35));
      }
      base.premultiply(new THREE.Matrix4().makeTranslation(o.x, o.y - (o.sink || 0), o.z));
      return base.multiply(local);
    }
    // Ô tô biến dạng theo mức bẹp c (bị cán) và hư hại d (bị húc): khoang kính / nóc sập xuống nóc thân, thân dưới ép dẹt
    // và bè ra, lốp lún + choãi ra ngoài, khoang lệch khi bị húc ngang (skew), bị lưỡi ủi dồn thì co ngắn (squeeze)
    deformCar(o, p) {
      const D = CAR_DIM[o.kind] || CAR_DIM.sedan, c = o.c || 0, wide = 1 + 0.12 * c, sq = 1 - (o.squeeze || 0);
      let [g, m, x, y, z, sx, sy, sz, rx, ry, rz, role] = p;
      if (m === 'glass' && o.noGlass) return null;
      if (role === 'wheel') {
        const w = (x > 0 ? 1 : 0) + (z < 0 ? 2 : 0);
        if (o.burnt && m === 'tire') return null;                     // lốp cháy rụi, còn vành sắt
        if (o.noWheel === w) return null;                             // bánh bị tháo / văng mất
        if (o.flats && o.flats[w] && m === 'tire') sx *= 0.62;   // lốp xẹp bẹp dưới vành
        if (o.flats && o.flats[w]) y -= p[5] * 0.32;
        y *= 1 - 0.35 * c; x *= 1 + 0.18 * c; rz += Math.sign(x) * 0.55 * c;
      }
      else if (role === 'cabin') {
        const k = 1 - 0.85 * c, base = D.belt * (1 - 0.5 * c);
        y = base + (y - D.belt) * k; sy *= Math.max(0.12, k); x *= wide; sx *= wide;
        ry += (o.skew || 0) * Math.min(1, (o.d || 0) * 1.5 + c);
      } else { const k = 1 - 0.5 * c; y *= k; sy *= k; x *= wide; sx *= wide; }
      return [g, m, x, y, z * sq, sx, sy, sz * sq, rx, ry, rz, role];
    }
    slot(p, o) {
      const k = p[0] + '|' + p[1], e = this.ims[k] || (this.ims[k] = { list: [], cols: [], wear: [] });
      e.list.push(this.partMatrix(o, p));
      const w = o.wear || [0, 0, 0];
      e.wear.push(w[0], w[1], w[2]);
      e.cols.push(p[1] === 'paint' && o.color ? o.color : new THREE.Color(1, 1, 1));
      return [k, e.list.length - 1, p];
    }
    armPoint(p, off) {
      const c = Math.cos(p.angle), s = Math.sin(p.angle), y = this.T.groundAtRaw(p.x, p.z) + 1.2 + 77.5;
      return [p.x + c * off, y, p.z - s * off];   // trục x cục bộ quay theo angle: (cos a, 0, -sin a)
    }
    wireSlot(a, b) {
      const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz) || 1;
      const m = new THREE.Matrix4().lookAt(new THREE.Vector3(...a), new THREE.Vector3(...b), new THREE.Vector3(0, 1, 0));
      m.multiply(new THREE.Matrix4().makeScale(0.22, 0.22, L));
      m.setPosition((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
      const k = 'box|dark', e = this.ims[k] || (this.ims[k] = { list: [], cols: [], wear: [] });
      e.wear.push(0, 0, 0);
      e.list.push(m); e.cols.push(new THREE.Color(0.6, 0.6, 0.6));
      return [k, e.list.length - 1];
    }
    addCanopy(c) {
      const w = c.w, d = c.d, parts = [];
      for (const sx of [1, -1]) for (const sz of [1, -1]) parts.push(P('box', 'white', sx * (w / 2 - 14), 22, sz * (d / 2 - 16), 2.6, 44, 2.6));
      // mái trắng, viền bảng hiệu màu hãng quanh mép
      parts.push(P('box', 'white', 0, 46, 0, w, 3.4, d), P('box', 'brand', 0, 48.2, d / 2, w + 0.6, 3.4, 0.6), P('box', 'brand', 0, 48.2, -d / 2, w + 0.6, 3.4, 0.6),
        P('box', 'brand', w / 2, 48.2, 0, 0.6, 3.4, d), P('box', 'brand', -w / 2, 48.2, 0, 0.6, 3.4, d));
      for (const px of [-w / 4, w / 4]) parts.push(P('box', 'concrete', px, 0.6, 0, 12, 1.2, 5), P('box', 'white', px, 7, 0, 4.4, 12, 2.6), P('box', 'brand', px, 11.6, 0, 4.6, 2.2, 2.8));
      const o = { type: 'canopy', x: c.x, z: c.z, angle: c.angle, fixed: true };
      this.items.push(o); o.parts = parts;
      const ca = Math.cos(c.angle), sa = Math.sin(c.angle), W = (lx, lz) => [c.x + ca * lx + sa * lz, c.z - sa * lx + ca * lz];
      for (const sx of [1, -1]) for (const sz of [1, -1]) { const [x, z] = W(sx * (w / 2 - 14), sz * (d / 2 - 16)); this.T.boulders.push({ x, z, radius: 2.6, height: 46, mat: 'metal' }); }
      for (const px of [-w / 4, w / 4]) { const [x, z] = W(px, 0); this.T.boulders.push({ x, z, radius: 4, height: 12, mat: 'metal' }); }
    }
    addFootbridge(f) {
      // nhịp ngang qua đại lộ (trục x cục bộ) cao 5,75 m, 2 trụ trên vỉa hè, cầu thang dốc xuống dọc vỉa hè ở 2 đầu
      const S = f.span, y = 46, parts = [P('box', 'concrete', 0, y, 0, S + 8, 2, 20), P('box', 'metal', 0, y + 4, 9.6, S + 8, 4, 0.5), P('box', 'metal', 0, y + 4, -9.6, S + 8, 4, 0.5)];
      const run = 60, tilt = Math.atan2(y, run), L = Math.hypot(y, run);
      for (const sx of [1, -1]) {
        parts.push(P('box', 'concrete', sx * (S / 2), y / 2, 0, 3, y, 3));
        const sz = sx;   // 2 đầu cầu thang ngược chiều nhau
        parts.push(P('box', 'concrete', sx * (S / 2), y / 2, sz * (10 + run / 2), 14, 2, L, sz * tilt, 0, 0));
      }
      const o = { type: 'footbridge', x: f.x, z: f.z, angle: f.angle, fixed: true };
      this.items.push(o); o.parts = parts;
      const ca = Math.cos(f.angle), sa = Math.sin(f.angle), W = (lx, lz) => [f.x + ca * lx + sa * lz, f.z - sa * lx + ca * lz];
      for (const sx of [1, -1]) {
        const [x, z] = W(sx * S / 2, 0); this.T.boulders.push({ x, z, radius: 2.6, height: y + 2, mat: 'concrete' });
        for (const t of [0.35, 0.75]) { const [sx2, sz2] = W(sx * S / 2, sx * (10 + run * t)); this.T.boulders.push({ x: sx2, z: sz2, radius: 7.5, height: y * (1 - t), mat: 'concrete' }); }
      }
    }
    refresh(o) {
      if (o.group) {
        o.group.position.set(o.x, o.y, o.z);
        o.group.rotation.y = o.angle;
        if (o.roll || o.pitch) {
          o.group.rotation.x = o.pitch || 0;
          o.group.rotation.z = o.roll || 0;
        }
        return;
      }
      o.slots.forEach(([k, i, p]) => { this.ims[k].im.setMatrixAt(i, this.partMatrix(o, p)); this.ims[k].dirty = true; });
    }
    flush() { for (const k in this.ims) { const e = this.ims[k]; if (e.dirty && e.im) { e.im.instanceMatrix.needsUpdate = true; if (e.cdirty) e.im.instanceColor.needsUpdate = true; e.dirty = e.cdirty = false; } } }
    // cột đổ về hướng (dx, dz); dây điện nối vào cột đó đứt (ẩn)
    topple(o, dx, dz, fx) {
      if (o.broken || o.fixed) return;
      o.broken = true;
      const l = Math.hypot(dx, dz) || 1, jit = (hash(o.seed) - 0.5) * 0.6;
      const fxd = dx / l * Math.cos(jit) - dz / l * Math.sin(jit), fzd = dx / l * Math.sin(jit) + dz / l * Math.cos(jit);
      if (STREET[o.type] && STREET[o.type].flat) o.squash = 0.35 + hash(o.seed + 3) * 0.1;
      else { o.fall = [fxd, fzd]; o.fallA = 1.3 + hash(o.seed + 5) * 0.22; }
      this.refresh(o);
      for (const sp of o.spans || []) for (const [k, i] of sp.slots) { this.ims[k].im.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0)); this.ims[k].dirty = true; }
      sfx(o.type === 'pole' ? 'masonry' : o.type === 'busStop' ? 'glass' : 'sheetMetal', o.x, o.y + 4, o.z, 0.45, { h: 4 });
      if (fx && fx.smoke) for (let k = 0; k < 4; k++) fx.smoke.add({ x: o.x + fxd * k * 6, y: o.y + 2, z: o.z + fzd * k * 6, vx: (hash(o.seed + k) - 0.5) * 6, vy: 3, vz: (hash(o.seed + k + 7) - 0.5) * 6,
        size: 1.6, grow: 2, drag: 2, grav: 4, life: 1.1, alpha: 0.4, fadeIn: 0.02, c0: [0.55, 0.53, 0.5], cell: 2 });
    }
    // xe con bị cán: bẹp nóc; bị nổ: cháy đen
    // TÌNH TRẠNG BỎ HOANG (băm theo vị trí -> mọi máy như nhau): bụi / gỉ / phai, còn xăng hay không, độ bền, lốp xẹp,
    // mất bánh, kính vỡ sẵn, xác đã cháy từ trước
    abandon(o) {
      const h = k => hash(o.seed * 7 + k * 101);
      const D = CAR_DIM[o.kind] || CAR_DIM.sedan, S = CAR_SPEC[o.kind] || CAR_SPEC.sedan;
      o.hp = o.hpMax = 60 + D.m * 40;                                       // tôn mỏng: đạn pháo nổ gần là nát
      o.fuel = h(4) < 0.6 ? 0.25 + 0.75 * h(5) : 0;                         // 60% còn xăng trong bình (cháy được)
      const st = h(6);
      if (st < 0.08) {
        // 1. Xác xe cháy rụi từ trước: đen than, rỉ sét trơ khung, không kính, sập mui
        o.burnt = true; o.fuel = 0; o.noGlass = true; o.wear = [0.4, 1, 1]; o.sink = S.r * 0.55; o.c = 0.35; o.d = 0.6; o.hp = 0;
      } else if (st < 0.28) {
        // 2. Xe rỉ sét nặng, bỏ hoang lâu năm: sơn bong tróc, đốm nâu đỏ loang lổ, lốp xẹp
        o.rusted = true; o.wear = [0.85, 0.95, 0.85];
        o.flats = [h(7) < 0.7, h(8) < 0.7, h(9) < 0.5, h(10) < 0.5]; if (!o.flats.some(Boolean)) o.flats[0] = true;
        if (h(11) < 0.35) o.noWheel = Math.floor(h(11) * 4);
      } else if (st < 0.48) {
        // 3. Xe hỏng hóc chiến sự, vỡ nát: vết đạn, kính rạn vỡ đục, capô / mui móp méo
        o.preBroken = true; o.c = 0.12 + 0.18 * h(13); o.wear = [0.65, 0.5, 0.7];
        if (h(14) < 0.5) o.flats = [h(7) < 0.5, h(8) < 0.5, false, false];
      } else if (st < 0.72) {
        // 4. Xe cũ bám bụi bẩn, cát đất, sơn bạc màu
        o.dusty = true; o.wear = [0.9, 0.25, 0.4];
      } else {
        // 5. Xe tương đối mới / sạch sẽ, đỗ thông thường
        o.wear = [0.2, 0.08, 0.1];
      }
      if (h(12) < 0.25) o.preBroken = true;
      // thân nghiêng về phía bánh xẹp / mất bánh (bánh: 0 trái trước, 1 phải trước, 2 trái sau, 3 phải sau)
      const low = [0, 1, 2, 3].map(w => (o.flats && o.flats[w] ? 1 : 0) + (o.noWheel === w ? 2.4 : 0));
      o.roll = ((low[0] + low[2]) - (low[1] + low[3])) * 0.035;
      o.pitch = ((low[0] + low[1]) - (low[2] + low[3])) * 0.025;
    }
    // kính vỡ: ô kính rạn trắng đục (vỡ nặng thì rơi hết, xem noGlass)
    shatter(o, silent) {
      if (o.glassBroken) return;
      o.glassBroken = true;
      if (o.group && o.group.userData && o.group.userData.crush) {
        o.group.userData.crush.shoot(0, 8, 0, 0, -1, 0, 'SCOUT_BULLET');
      }
      o.slots.forEach(([k, i, p]) => { if (p[1] === 'glass' && this.ims[k].im) { this.ims[k].im.setColorAt(i, new THREE.Color(1.9, 1.9, 1.95)); this.ims[k].cdirty = this.ims[k].dirty = true; } });
      if (!silent) sfx('glass', o.x, o.y + 8, o.z, 0.5, { h: 8 });
    }
    setWear(o, w) {
      o.wear = w;
      o.slots.forEach(([k, i]) => { const e = this.ims[k], a = e.im && e.im.geometry.attributes.aWear; if (a) { a.setXYZ(i, w[0], w[1], w[2]); a.needsUpdate = true; } });
    }
    // xác cháy: sơn cháy rộp đen nâu, mâm gỉ, kính / lốp cháy rụi, thân lún xuống vành sắt
    charCar(o) {
      o.burnt = true; o.noGlass = true; o.fuel = 0;
      o.sink = Math.max(o.sink || 0, (CAR_SPEC[o.kind] || CAR_SPEC.sedan).r * 0.55);
      if (o.group && o.group.userData && o.group.userData.crush) {
        o.group.userData.crush.ignite(0, 4, 0);
      }
      this.setWear(o, [0.3, 1, 1]);
      o.slots.forEach(([k, i, p]) => {
        const e = this.ims[k], m = p[1];
        if (!e.im) return;
        const col = m === 'paint' ? [0.2, 0.15, 0.11] : m === 'rim' ? [0.45, 0.3, 0.2] : (m === 'trim' || m === 'cabin') ? [0.12, 0.1, 0.09] : (m === 'glow' || m === 'red' || m === 'plate') ? [0.16, 0.14, 0.12] : null;
        if (col) { e.im.setColorAt(i, new THREE.Color(col[0], col[1], col[2])); e.cdirty = e.dirty = true; }
      });
      this.refresh(o);
    }
    // Ô tô nhận sát thương dmg (thang máu ô tô): móp / vỡ kính / khung oằn theo mức; còn xăng thì bắt lửa khi nát, trúng
    // đạn cháy hoặc nổ mạnh gần bình xăng. (dx, dz): hướng từ nguồn nổ tới xe -> bên bị móp
    carDamage(o, dmg, dx, dz, inc, fx) {
      if (o.burning || o.burnt || dmg <= 0) return;
      o.hp -= dmg;
      const ca = Math.cos(o.angle), sa = Math.sin(o.angle), lx = dx * ca - dz * sa;
      this.dent(o, dmg * 60, lx >= 0 ? -1 : 1);
      if (dmg > 12) this.shatter(o);
      if (dmg > 45) o.noGlass = true;                                                // kính vỡ vụn rơi hết
      if (o.hp < o.hpMax * 0.35) o.c = Math.max(o.c, 0.12 + 0.25 * (1 - Math.max(0, o.hp) / o.hpMax));   // khung oằn, nóc lõm
      if (o.group && o.group.userData && o.group.userData.crush) {
        const tx = dx * ca - dz * sa, tz = dx * sa + dz * ca;
        o.group.userData.crush.shoot(tx, 4, tz, -tx, 0, -tz, inc ? 'INCENDIARY' : (dmg > 50 ? 'HE' : 'SCOUT_BULLET'));
      }
      const ign = o.fuel > 0 && (o.hp <= 0 || (inc && hash(o.seed + Math.round(o.hp * 3)) < 0.55) || (dmg > 35 && hash(o.seed + 17 + Math.round(dmg)) < o.fuel * 0.6));
      if (ign) this.ignite(o);
      else if (o.hp <= 0 && !o.wrecked) { o.wrecked = true; o.noGlass = true; this.setWear(o, [Math.min(1, o.wear[0] + 0.2), Math.min(1, o.wear[1] + 0.3), o.wear[2]]); }
      this.refresh(o);
    }
    // bắt lửa: cháy ~30-70 s theo lượng xăng; bình còn nhiều xăng thì vài giây sau nổ
    ignite(o) {
      if (o.burning || o.burnt) return;
      const h = hash(o.seed + 31);
      o.burning = { t: 0, dur: 30 + 40 * o.fuel + 15 * h, boom: o.fuel > 0.45 ? 2.5 + 4 * h : -1, acc: 0, snd: 0 };
      o.fuel = 0;
      this.burningSet.add(o);
      if (o.group && o.group.userData && o.group.userData.crush) {
        o.group.userData.crush.ignite(0, 4, -8);
      }
      sfx('fuel', o.x, o.y + 6, o.z, 0.55, { h: 6 });
    }
    // bình xăng nổ: quả cầu lửa, mảnh tôn bay, sóng nóng đốt / làm móp ô tô sát bên (cháy lan)
    fuelBlast(o, fx) {
      sfx('fuel', o.x, o.y + 6, o.z, 1, { h: 8 });
      sfx('sheetMetal', o.x, o.y + 6, o.z, 0.9, { h: 10 });
      if (fx && fx.fire) for (let k = 0; k < 36; k++) {
        const a = Math.random() * 6.283, sp = 10 + Math.random() * 30;
        fx.fire.add({ x: o.x + Math.cos(a) * 3, y: o.y + 6, z: o.z + Math.sin(a) * 3, vx: Math.cos(a) * sp, vy: 14 + Math.random() * 30, vz: Math.sin(a) * sp,
          size: 5 + Math.random() * 7, grow: 4, drag: 2.2, grav: -6, life: 0.6 + Math.random() * 0.6, alpha: 1, fadeIn: 0.01, c0: [1, 0.78, 0.36], c1: [0.8, 0.22, 0.03], cell: 1, floor: false });
      }
      if (fx && fx.smoke) for (let k = 0; k < 16; k++) fx.smoke.add({ x: o.x + (Math.random() - 0.5) * 10, y: o.y + 10, z: o.z + (Math.random() - 0.5) * 10,
        vx: (Math.random() - 0.5) * 16, vy: 16 + Math.random() * 16, vz: (Math.random() - 0.5) * 16, size: 8 + Math.random() * 6, grow: 9, drag: 1, grav: -3, life: 4 + Math.random() * 3, alpha: 0.7, fadeIn: 0.05, c0: [0.08, 0.07, 0.06], c1: [0.25, 0.24, 0.23], cell: 0, floor: false });
      this.carDamage(o, 999, 0, 0, false, fx);
      o.c = Math.max(o.c, 0.3); o.d = 1;
      for (const q of this.near(o.x, o.z, 60)) {
        if (q === o || q.type !== 'car' || q.burnt || q.burning) continue;
        const d = Math.hypot(q.x - o.x, q.z - o.z);
        if (d < 55) this.carDamage(q, 55 * (1 - d / 55) + 5, q.x - o.x, q.z - o.z, true, fx);
      }
      this.refresh(o);
    }
    // Đạn bay tới (x, y, z) trúng thân ô tô (chưa bẹp dí) -> nổ / dừng trên thân xe như trúng xác xe (tôn mỏng)
    hitTest(x, y, z) {
      for (let i = Math.floor((x - 24) / 60); i <= Math.floor((x + 24) / 60); i++) for (let j = Math.floor((z - 24) / 60); j <= Math.floor((z + 24) / 60); j++) {
        const l = this.grid.get(i * 1000 + j);
        if (l) for (const o of l) {
          if (o.type !== 'car' || o.c >= 0.85 || Math.abs(o.x - x) > 22 || Math.abs(o.z - z) > 22) continue;
          const S = CAR_SPEC[o.kind] || CAR_SPEC.sedan, top = o.y - (o.sink || 0) + (S.belt + S.gh[1][1]) * (1 - 0.6 * o.c);
          if (y < o.y - 1 || y > top) continue;
          const D = CAR_DIM[o.kind] || CAR_DIM.sedan, ca = Math.cos(o.angle), sa = Math.sin(o.angle), tx = x - o.x, tz = z - o.z;
          if (Math.abs(tx * ca - tz * sa) <= D.hw && Math.abs(tx * sa + tz * ca) <= D.hl) return { hit: true, type: 'BOULDER', x, y, z, car: true };
        }
      }
      return null;
    }
    damageAt(x, y, z, A, fx, ammo) {
      const small = A.power < 0.3, inc = ammo === 'INCENDIARY';
      const R = small ? 6 : A.radius;
      for (const o of this.near(x, z, R + 24)) {
        if (o.fixed) continue;
        if (o.type === 'car') {
          // khoảng cách từ tâm nổ tới thân xe (hộp mặt bằng + chiều cao), không phải tới tâm xe
          const D = CAR_DIM[o.kind] || CAR_DIM.sedan, ca = Math.cos(o.angle), sa = Math.sin(o.angle), tx = x - o.x, tz = z - o.z;
          const ex = Math.max(0, Math.abs(tx * ca - tz * sa) - D.hw), ez = Math.max(0, Math.abs(tx * sa + tz * ca) - D.hl), ey = Math.max(0, y - (o.y + D.belt + 5));
          const d = Math.hypot(ex, ez, ey);
          if (d >= R) continue;
          if (small) { this.carDamage(o, 3 + 8 * A.power, o.x - x, o.z - z, inc, fx); continue; }
          const k = 1 - d / R;
          this.carDamage(o, A.power * 140 * k * k + 6, o.x - x, o.z - z, inc, fx);
          // sóng nổ hất ô tô trượt đi
          if (A.power * k > 0.3 && !o.burnt) {
            const l = Math.hypot(o.x - x, o.z - z) || 1, v = 70 * A.power * k;
            o.vx = (o.x - x) / l * v; o.vz = (o.z - z) / l * v; o.w = (hash(o.seed + Math.round(x)) - 0.5) * 2 * A.power * k;
            this.moving.add(o);
          }
        } else if (!small) {
          const d = Math.hypot(o.x - x, o.z - z, Math.max(0, o.y - y));
          if (d < A.radius * 0.6) this.topple(o, o.x - x, o.z - z, fx);
        }
      }
      this.flush();
    }
    // Va chạm xe (đi qua / húc) với ô tô / cột tính trong vehicleContact theo khối lượng & tốc độ cho mọi xe; game.js vẫn
    // gọi crush mỗi khung cho cây / rào -> ở đây không làm gì
    crush() {}

    // ---------------------------------------------------------------------------
    // VA CHẠM XE <-> Ô TÔ / CỘT
    // ---------------------------------------------------------------------------
    // Hộp thân xe khi tâm ở (x, z) (như spgVehObb ở spg.js)
    unitObb(u, x, z, out) {
      const B = VehicleCollision.hullBox(u), a = u.bodyAngle || 0, ca = Math.cos(a), sa = Math.sin(a), o = out || this._ub || (this._ub = {});
      const lcx = (B.minX + B.maxX) / 2, lcz = (B.minZ + B.maxZ) / 2;
      o.cx = x + lcx * ca + lcz * sa; o.cz = z - lcx * sa + lcz * ca; o.ux = ca; o.uz = -sa; o.hu = (B.maxX - B.minX) / 2; o.hv = (B.maxZ - B.minZ) / 2;
      return o;
    }
    carObb(o, x, z, ang, out) {
      const D = CAR_DIM[o.kind] || CAR_DIM.sedan, a = ang === undefined ? o.angle : ang, b = out || this._cb || (this._cb = {});
      b.cx = x === undefined ? o.x : x; b.cz = z === undefined ? o.z : z; b.ux = Math.cos(a); b.uz = -Math.sin(a);
      b.hu = D.hw * (1 + 0.12 * o.c); b.hv = D.hl * (1 - (o.squeeze || 0));
      return b;
    }
    /**
     * Xe đi từ (x0, z0) tới (x1, z1) trong khung: va chạm với ô tô / cột trên phố. Trả về vị trí đã chỉnh để thân xe không
     * lồng vào ô tô / cột còn đứng. proxy = xe bản sao mạng (vị trí do máy chủ của nó quyết): chỉ tác động lên đồ vật
     */
    vehicleContact(unit, x0, z0, x1, z1, dt, proxy) {
      const out = this._vcOut || (this._vcOut = { x: 0, z: 0 });
      out.x = x1; out.z = z1;
      if (typeof VehicleCollision === 'undefined' || !dt || unit.isDead) return out;
      const reach = VehicleCollision.reach(unit), near = this.near(x1, z1, reach + 26);
      if (!near.length) return out;
      const sp = unit.speed || 0, fa = unit.bodyAngle || 0;
      const ctx = this._ctx || (this._ctx = {});
      ctx.unit = unit; ctx.dt = dt; ctx.proxy = proxy; this._dt = dt;
      ctx.mvx = proxy ? -Math.sin(fa) * sp * dt : x1 - x0; ctx.mvz = proxy ? -Math.cos(fa) * sp * dt : z1 - z0;
      ctx.tracked = !unit.isWheeled;
      // xe 6 nòng lắp lưỡi ủi (mặc định, chưa bị bắn văng): lưỡi ủi dồn ô tô bẹp về trước thay vì leo lên
      ctx.dozer = unit.tankType === 'GATLING' && (!unit.frontId || unit.frontId === 'dozer') && (typeof VehicleDamage === 'undefined' || !VehicleDamage.hasPart || VehicleDamage.hasPart(unit, 'dozer'));
      for (const o of near) {
        if (o.type === 'car') this.carContact(o, ctx, out);
        else if (!o.broken && !o.fixed && STREET[o.type]) this.poleContact(o, ctx, out);
      }
      this.flush();
      return out;
    }
    firstTouch(o, u) {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now(), first = !(o._hu === u.id && now - o._ht < 400);
      o._hu = u.id; o._ht = now;
      return first;
    }
    // Cột đèn / đèn giao thông / nhà chờ / cột điện: đủ động lượng thì gãy đổ theo hướng húc, không đủ thì chặn xe như cột
    poleContact(o, ctx, out) {
      const u = ctx.unit, ub = this.unitObb(u, out.x, out.z), R = STREET[o.type].rad;
      const tx = o.x - ub.cx, tz = o.z - ub.cz, lu = tx * ub.ux + tz * ub.uz, lv = -tx * ub.uz + tz * ub.ux;
      const cu = clamp(lu, -ub.hu, ub.hu), cv = clamp(lv, -ub.hv, ub.hv);
      const inside = Math.abs(lu) < ub.hu && Math.abs(lv) < ub.hv;
      const px = ub.cx + cu * ub.ux - cv * ub.uz, pz = ub.cz + cu * ub.uz + cv * ub.ux;
      const dx = o.x - px, dz = o.z - pz, d = Math.hypot(dx, dz);
      if (!inside && d >= R) return;
      const v = Math.hypot(ctx.mvx, ctx.mvz) / ctx.dt, Pm = (u.mass || 40) * v, thr = BREAK_P[o.type] || 200;
      const first = this.firstTouch(o, u), pos = { x: o.x, y: o.y + 6, z: o.z };
      if (Pm >= thr || (ctx.tracked && v > 2.5)) {
        this.topple(o, ctx.mvx, ctx.mvz, gameFx());
        if (!ctx.proxy) u.speed *= 1 - Math.min(0.2, thr / Math.max(Pm, 1) * 0.12);
        impact(u, o.type === 'pole' ? 'concrete' : 'pole', pos, v, 0, u.mass || 40, 1.2, true, null);
        return;
      }
      if (ctx.proxy) return;
      // không đủ đà húc gãy: cột chặn lại, thân xe tì vào cột (không xuyên)
      if (inside) {
        const eu = ub.hu - Math.abs(lu), ev = ub.hv - Math.abs(lv);
        if (eu < ev) { const k = -(eu + R) * Math.sign(lu || 1); out.x += ub.ux * k; out.z += ub.uz * k; }
        else { const k = -(ev + R) * Math.sign(lv || 1); out.x += -ub.uz * k; out.z += ub.ux * k; }
      } else { const k = (R - d) / (d || 1); out.x -= dx * k; out.z -= dz * k; }
      u.speed *= Math.pow(0.6, ctx.dt * 60);
      impact(u, o.type === 'pole' ? 'concrete' : 'pole', pos, v, 0, u.mass || 40, Infinity, first, null);
    }
    // tỉ lệ diện tích ô tô nằm dưới thân xe (lưới 3 x 5 điểm trên mặt bằng ô tô)
    coverage(o, ub) {
      const D = CAR_DIM[o.kind] || CAR_DIM.sedan, ca = Math.cos(o.angle), sa = Math.sin(o.angle);
      let n = 0;
      for (const fx of [-0.7, 0, 0.7]) for (const fz of [-0.8, -0.4, 0, 0.4, 0.8]) {
        const lx = fx * D.hw, lz = fz * D.hl, x = o.x + lx * ca + lz * sa, z = o.z - lx * sa + lz * ca;
        const tx = x - ub.cx, tz = z - ub.cz;
        if (Math.abs(tx * ub.ux + tz * ub.uz) <= ub.hu && Math.abs(-tx * ub.uz + tz * ub.ux) <= ub.hv) n++;
      }
      return n / 15;
    }
    carContact(o, ctx, out) {
      if (o.c >= 0.7) {
        if (this.moving.has(o)) { this.moving.delete(o); o.vx = o.vz = o.w = 0; }
        return;   // đã bẹp dí sát đất: không sinh va chạm hộp cứng nữa, xe khác lăn qua nhẹ nhàng
      }
      const D = CAR_DIM[o.kind] || CAR_DIM.sedan, u = ctx.unit, VC = VehicleCollision;
      const ub = this.unitObb(u, out.x, out.z);
      const p = VC.obbPush(ub.cx, ub.cz, ub.ux, ub.uz, ub.hu, ub.hv, this.carObb(o), this._pp || (this._pp = {}));
      if (!p || p.d < 1e-4) return;
      const first = this.firstTouch(o, u), nx = p.x / p.d, nz = p.z / p.d;   // n: từ ô tô hướng ra phía xe
      const vn = Math.max(0, -(ctx.mvx * nx + ctx.mvz * nz)) / ctx.dt;     // tốc độ áp vào ô tô
      const mU = u.mass || 40, mC = D.m, pos = { x: o.x + nx * D.hw, y: o.y + 6, z: o.z + nz * D.hw };
      // điểm chạm (gần tâm xe nhất trên mặt bằng ô tô) trong hệ ô tô -> bên bị húc, cánh tay đòn mô-men
      const ca = Math.cos(o.angle), sa = Math.sin(o.angle), tx = ub.cx - o.x, tz = ub.cz - o.z;
      const lx = clamp(tx * ca - tz * sa, -D.hw, D.hw), lz = clamp(tx * sa + tz * ca, -D.hl, D.hl);
      const rx = lx * ca + lz * sa, rz = -lx * sa + lz * ca;
      if (ctx.tracked && !(ctx.dozer && o.c < 0.6)) {
        // CÁN: xích leo lên ô tô (mặt đỡ trong vehicleDebris thấp dần), ô tô bẹp theo phần thân nằm dưới xích
        const target = Math.min(1, this.coverage(o, ub) * 1.7);
        if (target > o.c + 0.01) {
          const dc = target - o.c;
          if (!o.c) { o.roll = clamp(-lx / D.hw, -1, 1) * 0.09; o.skew = (hash(o.seed + 3) - 0.5) * 0.3; }   // bên bị đè trước lún hơn
          o.c = target;
          if (o.c > 0.12) this.shatter(o);
          if (dc > 0.04) sfx('metalCrush', o.x, o.y + 4, o.z, clamp(0.35 + dc * 2.5, 0.35, 1), { h: 4 });
          if (o.group && o.group.userData && o.group.userData.crush) {
            const ca2 = Math.cos(o.angle), sa2 = Math.sin(o.angle);
            const dx2 = ub.cx - o.x, dz2 = ub.cz - o.z;
            const tx2 = dx2 * ca2 - dz2 * sa2, tz2 = dx2 * sa2 + dz2 * ca2;
            const hd2 = (u.heading || 0) - o.angle;
            o.group.userData.crush.stamp(tx2, tz2, hd2, ctx.dt || 0.016);
          }
          this.refresh(o);
        }
        // vừa chạm, xích chưa kịp leo lên: mũi xe húc ô tô lùi (chậm thì ủi được một đoạn, nhanh thì leo luôn)
        if (!ctx.proxy && o.c < 0.25) { const k = 0.5 / (1 + vn / 20); this.moveCar(o, ctx.mvx * k, ctx.mvz * k, 0, u); }
        if (first) { if (!ctx.proxy) u.speed *= 0.9; impact(u, 'car', pos, vn, 0, mU, mC, true, null); }
        return;
      }
      // Xe đã bẹp nhiều (o.c >= 0.45) thì dính cố định xuống đường, không bị đẩy trượt hay xoay tròn nữa
      if (o.c >= 0.45) {
        if (this.moving.has(o)) { this.moving.delete(o); o.vx = o.vz = o.w = 0; }
        return;
      }
      // ĐẨY: xe bánh lốp / lưỡi ủi không cán được — ô tô trượt, xoay sang bên; kẹt tường / xe khác thì xe đẩy phải khựng
      const mEff = mC * (this.moving.has(o) ? 1 : 1.6);   // đang đỗ kéo phanh tay: lốp miết đường, khó đẩy hơn
      const sc = mU / (mU + mEff), want = p.d * sc;
      const Fx = -nx * want, Fz = -nz * want, I = (D.hl * D.hl + D.hw * D.hw) / 3;
      const dTh = clamp((rz * Fx - rx * Fz) / I * 0.9, -0.12, 0.12);
      const moved = this.moveCar(o, Fx, Fz, dTh, u);
      if (!ctx.proxy) {
        const rest = Math.max(0, p.d - moved);   // phần chồng ô tô không nhường được -> xe tự lùi (không xuyên)
        out.x += nx * rest; out.z += nz * rest;
        u.speed *= Math.pow(Math.max(0.3, 1 - 0.35 * (rest / p.d) - 0.1 * (1 - sc)), ctx.dt * 60);
      }
      if (first && vn > 6 && o.c < 0.35) {
        // ô tô văng trượt tiếp sau cú húc (ma sát lốp hãm lại) + móp theo năng lượng va chạm
        const vk = Math.min(vn * sc * 0.8, 110);
        o.vx = -nx * vk; o.vz = -nz * vk; o.w = clamp(dTh / ctx.dt * 0.35, -2.5, 2.5);
        this.moving.add(o);
        const mu = mU * mC / (mU + mC);
        this.dent(o, 0.5 * mu * vn * vn, lx >= 0 ? 1 : -1);
      }
      if (ctx.dozer && moved > 0.05) {
        // lưỡi ủi dồn ô tô: bẹp dần + co ngắn theo quãng bị ủi
        o.c = Math.min(0.9, o.c + moved / 70); o.squeeze = Math.min(0.28, o.squeeze + moved / 260);
        if (o.c > 0.15) this.shatter(o);
        this.refresh(o);
        if (Math.random() < ctx.dt * 4) sfx('metalCrush', o.x, o.y + 4, o.z, 0.45, { h: 4 });
      }
      if (first) impact(u, 'car', pos, vn, 0, mU, mC, true, null);
      else if (moved / ctx.dt > 12) impact(u, 'car', pos, 0, moved / ctx.dt, mU, mC, false, null);   // đang ủi ô tô trượt: tiếng cạ / lốp miết đường
    }
    // móp méo do bị húc: năng lượng E (tấn x (đv/s)^2 / 2) -> hư hại d; side: bên bị húc (+1 phải / -1 trái theo trục x ô tô)
    dent(o, E, side) {
      const dd = E / 3500;
      if (dd < 0.02) return;
      o.d = Math.min(1, (o.d || 0) + dd);
      o.skew = clamp((o.skew || 0) - side * 0.12 * Math.min(1, dd * 2), -0.2, 0.2);
      o.roll = clamp((o.roll || 0) + side * 0.03 * Math.min(1, dd * 2), -0.1, 0.1);
      if (o.d > 0.3) this.shatter(o);
      const k = 1 - 0.22 * o.d;
      o.slots.forEach(([key, i, p]) => { if (p[1] === 'paint' && !o.burnt) { this.ims[key].im.setColorAt(i, o.color.clone().multiplyScalar(k)); this.ims[key].cdirty = this.ims[key].dirty = true; } });
      this.refresh(o);
    }
    // Dời ô tô (dx, dz) + xoay dθ, không lồng vào nhà / đá / ô tô khác / xe khác; vướng thì dời bớt (1/2, 1/4).
    // Trả về quãng đã dời được
    // depth: ô tô bị dồn vào ô tô khác thì đẩy dây chuyền ô tô đó (tối đa 2 xe nối tiếp) — xe nặng ủi được cả hàng xe đỗ
    moveCar(o, dx, dz, dTh, pusher, depth = 0) {
      const L = Math.hypot(dx, dz);
      if (L < 1e-4 && Math.abs(dTh) < 1e-5) return 0;
      for (const f of [1, 0.5, 0.25]) {
        const x = o.x + dx * f, z = o.z + dz * f, a = o.angle + dTh * f;
        if (this.carBlocked(o, x, z, a, pusher)) {
          // vướng ô tô khác: dồn nó đi cùng hướng (mất bớt đà do thêm khối lượng), rồi thử lại
          const q = this._whyObj;
          // ô tô bị dồn vào cột đèn / cột điện / nhà chờ: xe đẩy đủ động lượng thì cột gãy theo, ô tô đi tiếp
          if (pusher && q && BREAK_P[this._why] && (pusher.mass || 40) * Math.abs(pusher.speed || 0) * 0.8 >= BREAK_P[this._why] && !q.broken) {
            this.topple(q, dx, dz, gameFx());
            if (!this.carBlocked(o, x, z, a, pusher)) { const ox = o.x, oz = o.z; o.x = x; o.z = z; o.angle = a; o.y = this.T.groundAtRaw(x, z); this.regrid(o, ox, oz); this.refresh(o); return L * f; }
            continue;
          }
          if (!(this._why === 'car' && q && depth < 2 && f === 1 && this.moveCar(q, dx * 0.85, dz * 0.85, 0, pusher, depth + 1) > 0.05 && !this.carBlocked(o, x, z, a, pusher))) continue;
          if (!this.moving.has(q) && L / Math.max(1e-3, this._dt || 0.016) > 20) { q.vx = dx / (this._dt || 0.016) * 0.4; q.vz = dz / (this._dt || 0.016) * 0.4; q.w = 0; this.moving.add(q); }
        }
        const ox = o.x, oz = o.z;
        o.x = x; o.z = z; o.angle = a;
        o.y = this.T.groundAtRaw(x, z);
        this.regrid(o, ox, oz);
        this.refresh(o);
        return L * f;
      }
      return 0;
    }
    carBlocked(o, x, z, a, pusher) {
      const VC = VehicleCollision, cb = this.carObb(o, x, z, a, this._cb2 || (this._cb2 = {})), T = this.T;
      const r = Math.hypot(cb.hu, cb.hv);
      // nhà / công trình
      for (const b of T.vehicleObstacles(x, z, null)) {
        if (b.y1 <= o.y + 2) continue;
        const q = VC.obbPush(cb.cx, cb.cz, cb.ux, cb.uz, cb.hu, cb.hv, b, this._pq || (this._pq = {}));
        if (q && q.d > 0.3) { this._why = 'building'; return true; }
      }
      // đá tảng / xác xe / chân cột mái che (vòng tròn)
      const circ = (cx, cz, rad) => {
        const tx = cx - x, tz = cz - z, lu = clamp(tx * cb.ux + tz * cb.uz, -cb.hu, cb.hu), lv = clamp(-tx * cb.uz + tz * cb.ux, -cb.hv, cb.hv);
        return Math.hypot(tx - lu * cb.ux + lv * cb.uz, tz - lu * cb.uz - lv * cb.ux) < rad;
      };
      for (const rk of T.boulders) {
        const rad = rk.radius || 18;
        if (Math.abs(rk.x - x) > r + rad || Math.abs(rk.z - z) > r + rad) continue;
        if (circ(rk.x, rk.z, rad * 0.8)) { this._why = 'boulder'; return true; }
      }
      // ô tô khác chưa bẹp, cột còn đứng
      for (const q of this.near(x, z, r + 24)) {
        if (q === o || q.fixed) continue;
        if (q.type === 'car') {
          if (q.c >= 0.85) continue;
          const pq = VC.obbPush(cb.cx, cb.cz, cb.ux, cb.uz, cb.hu, cb.hv, this.carObb(q, undefined, undefined, undefined, this._cb3 || (this._cb3 = {})), this._pq2 || (this._pq2 = {}));
          if (pq && pq.d > 0.3) { this._why = 'car'; this._whyObj = q; return true; }
        } else if (!q.broken && STREET[q.type] && circ(q.x, q.z, STREET[q.type].rad)) { this._why = q.type; this._whyObj = q; return true; }
      }
      // xe khác (trừ xe đang đẩy)
      const units = typeof window !== 'undefined' && window.game && window.game.units;
      if (units) for (const v of units) {
        if (v === pusher || !v.group || !v.group.visible || Math.abs(v.x - x) > r + 60 || Math.abs(v.z - z) > r + 60) continue;
        const ub = this.unitObb(v, v.x, v.z, this._ub2 || (this._ub2 = {})), pv = VC.obbPush(cb.cx, cb.cz, cb.ux, cb.uz, cb.hu, cb.hv, ub, this._pq3 || (this._pq3 = {}));
        if (pv && pv.d > 0.3) { this._why = 'unit'; return true; }
      }
      // mép kè kênh / bậc dốc gắt: ô tô không lăn xuống lòng kênh
      if (T.groundAtRaw(x, z) < o.y - 4) { this._why = 'drop'; return true; }
      return false;
    }
    regrid(o, ox, oz) {
      const k0 = this.key(ox, oz), k1 = this.key(o.x, o.z);
      if (k0 === k1) return;
      const l = this.grid.get(k0);
      if (l) { const i = l.indexOf(o); if (i >= 0) l.splice(i, 1); }
      this.addGrid(o);
    }
    // ô tô đang trượt sau cú húc: ma sát lốp hãm (~0,7 g), quay chậm dần; đâm vào vật khác thì dừng + móp thêm
    update(dt, fx, cam) {
      if (!dt) return;
      for (const o of this.items) {
        if (o.type === 'car' && o.group && o.group.userData && o.group.userData.crush) {
          o.group.userData.crush.update(dt);
        }
      }
      // Ô TÔ CHÁY: lửa bốc từ khoang / khoang máy, khói đen cuộn cột cao; vài giây sau nổ bình xăng; sau ~6 s sơn cháy
      // rộp thành khung đen, lốp cháy rụi; hết xăng tắt dần, còn âm ỉ khói mỏng ~40 s
      for (const o of this.burningSet) {
        const B = o.burning;
        B.t += dt;
        if (B.boom > 0 && B.t >= B.boom) { B.boom = -1; this.fuelBlast(o, fx); }
        if (B.t > 6 && !o.charred) { o.charred = true; this.charCar(o); }
        if (B.t >= B.dur) { this.burningSet.delete(o); o.burning = null; o.burnt = true; o.smolder = 40; this.smolderSet.add(o); continue; }
        if ((B.snd -= dt) <= 0) { B.snd = 1.6 + Math.random(); sfx('fire', o.x, o.y + 6, o.z, 0.5, { h: 6 }); }
        if (!fx || (cam && Math.hypot(cam.x - o.x, cam.z - o.z) > 1800)) continue;
        const k = Math.min(1, B.t / 2.5) * Math.min(1, (B.dur - B.t) / 10), S = CAR_SPEC[o.kind] || CAR_SPEC.sedan;
        B.acc += dt * (14 * k);
        const ca = Math.cos(o.angle), sa = Math.sin(o.angle);
        while (B.acc >= 1) {
          B.acc -= 1;
          const lz = (Math.random() - 0.35) * S.L * 0.6, lx = (Math.random() - 0.5) * S.W * 0.6;
          const x = o.x + lx * ca + lz * sa, z = o.z - lx * sa + lz * ca, y = o.y - (o.sink || 0) + S.belt * 0.7 + Math.random() * 3;
          if (fx.fire) fx.fire.add({ x, y, z, vx: (Math.random() - 0.5) * 4, vy: 12 + Math.random() * 16, vz: (Math.random() - 0.5) * 4,
            size: 3.5 + Math.random() * 4, grow: -4, drag: 1.2, grav: -14, life: 0.45 + Math.random() * 0.4, alpha: 0.95, fadeIn: 0.03, c0: [1, 0.78, 0.38], c1: [0.85, 0.24, 0.04], cell: 1, floor: false });
          if (fx.smoke && Math.random() < 0.45) fx.smoke.add({ x, y: y + 6, z, vx: (Math.random() - 0.5) * 3, vy: 14 + Math.random() * 8, vz: (Math.random() - 0.5) * 3,
            size: 5 + Math.random() * 4, grow: 7, drag: 0.5, grav: -2.5, life: 5 + Math.random() * 3, alpha: 0.6 * k + 0.1, fadeIn: 0.1, c0: [0.06, 0.055, 0.05], c1: [0.28, 0.27, 0.26], cell: 0, floor: false });
        }
      }
      for (const o of this.smolderSet) {
        o.smolder -= dt;
        if (o.smolder <= 0) { this.smolderSet.delete(o); continue; }
        if (fx && fx.smoke && Math.random() < dt * 3 && !(cam && Math.hypot(cam.x - o.x, cam.z - o.z) > 1500))
          fx.smoke.add({ x: o.x + (Math.random() - 0.5) * 8, y: o.y + 6, z: o.z + (Math.random() - 0.5) * 8, vx: (Math.random() - 0.5) * 2, vy: 6 + Math.random() * 4, vz: (Math.random() - 0.5) * 2,
            size: 3 + Math.random() * 2, grow: 4, drag: 0.6, grav: -1.5, life: 4, alpha: 0.25 * Math.min(1, o.smolder / 10), fadeIn: 0.3, c0: [0.2, 0.19, 0.18], c1: [0.4, 0.39, 0.38], cell: 0, floor: false });
      }
      if (!this.moving.size) { this.flush(); return; }
      for (const o of this.moving) {
        const v = Math.hypot(o.vx || 0, o.vz || 0);
        if ((v < 3 && Math.abs(o.w || 0) < 0.12) || o.c >= 0.5) { this.moving.delete(o); o.vx = o.vz = o.w = 0; continue; }
        const nv = Math.max(0, v - 70 * dt), k = v > 0 ? nv / v : 0;
        o.vx *= k; o.vz *= k; o.w = (o.w || 0) * Math.exp(-8 * dt);   // ma sát xoay mạnh, dừng xoay nhanh chóng
        const want = Math.hypot(o.vx * dt, o.vz * dt), got = this.moveCar(o, o.vx * dt, o.vz * dt, o.w * dt, null);
        if (want > 1e-3 && got < want * 0.9) {
          this.dent(o, 0.25 * (CAR_DIM[o.kind] || CAR_DIM.sedan).m * v * v, 1);
          sfx('sheetMetal', o.x, o.y + 4, o.z, clamp(v / 80, 0.3, 0.8), { h: 4 });
          o.vx = o.vz = o.w = 0; this.moving.delete(o);
        }
      }
      this.flush();
    }
    // Mặt đỡ cho xích / bánh (VehicleCollision.debrisHeight, kiểu ụ vòm): xe xích leo lên ô tô (cao capô, thấp dần khi
    // ô tô bẹp); ô tô đã bẹp dí thì mọi xe bò qua. Xe bánh lốp gặp ô tô còn nguyên: không có mặt đỡ (bị chặn / đẩy)
    vehicleDebris(x, z, r, unit, out) {
      const tracked = unit && !unit.isWheeled;
      const dozer = unit && unit.tankType === 'GATLING' && (!unit.frontId || unit.frontId === 'dozer');
      for (const o of this.near(x, z, r + 24)) {
        if (o.type !== 'car') continue;
        if (o.c >= 0.75) continue;   // xe đã bị cán phẳng lì sát đất: không nhấp nhô nữa, xe lăn qua êm ái
        if (!tracked && o.c < 0.6) continue;
        const D = CAR_DIM[o.kind] || CAR_DIM.sedan, ca = Math.cos(o.angle), sa = Math.sin(o.angle);
        const rem = Math.max(0, 1 - o.c);
        const top = o.y + Math.max(0.18, D.hood * rem * rem);   // độ cao xẹp mượt mà theo lũy thừa, không tạo ụ nhô cao
        const rad = (D.hw + 2.5) * (0.45 + 0.55 * rem);
        for (const fz of [-0.55, 0, 0.55]) {
          const lz = fz * D.hl * (1 - (o.squeeze || 0));
          out.push({ bump: true, x: o.x + lz * sa, z: o.z + lz * ca, r: rad, base: o.y, top });
        }
      }
      return out;
    }
    reground(x0, z0, x1, z1) {
      const S = this.T.surfaceAt ? (x, z) => this.T.surfaceAt(x, z, true) : (x, z) => this.T.groundAtRaw(x, z);
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, R = Math.hypot(x1 - x0, z1 - z0) / 2 + 20;
      for (const o of this.near(cx, cz, R)) {
        if (o.fixed || o.x < x0 - 4 || o.x > x1 + 4 || o.z < z0 - 4 || o.z > z1 + 4) continue;
        const y = Math.min(o.y, S(o.x, o.z) + (STREET[o.type] && STREET[o.type].walk ? 1.2 : 0));   // hố dưới chân -> lún theo (không nâng lên)
        if (Math.abs(y - o.y) < 0.05) continue;
        o.y = y; this.refresh(o);
      }
      this.flush();
    }
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
      // đồ vật đường phố (đô thị): sau xác xe (đẩy thêm cột mái che / chân cầu vượt vào T.boulders)
      if ((data.lamps && data.lamps.length) || (data.cars && data.cars.length) || (data.canopies && data.canopies.length)) this.street = new StreetSet(T, data, this.group);
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
      // bị sóng nổ hất văng: nằm bẹp dí trên đất chỗ rơi (rách toác sát tâm nổ: cát vãi hết, không còn hình bao)
      if (b.gone) return b.shred ? M4(b.x, b.y - 30, b.z, 0, 0, 0, 0.01, 0.01, 0.01) : M4(b.tx, b.ty, b.tz, b.troll, b.tyaw, 0, 0.95, 0.42, 1.2);
      const y = b.flat ? b.y - b.layer * 1.6 - 0.5 : b.y;
      return M4(b.x, y, b.z, 0, b.yaw, (hash(b.seed + 2) - 0.5) * 0.12, 1, b.flat ? 0.45 : 1, b.flat ? 1.25 : 1);
    }

    // Mẫu hình học gộp cho xác xe (1 lần cho mỗi loại xe, tái sử dụng cho toàn bộ xác xe trên bản đồ)
    // Giảm từ 150 mesh / xe xuống 2 mesh / xe (giảm ~7500 mesh, cứu 90% lượt vẽ và giải phóng GPU submit)
    getWreckTemplate(tankType) {
      this._wreckTpl = this._wreckTpl || {};
      if (this._wreckTpl[tankType]) return this._wreckTpl[tankType];
      if (typeof TankModelBuilder === 'undefined') return null;

      const dummy = {
        id: 'wreck_tpl_' + tankType,
        team: 'RED',
        tankType: tankType,
        group: new THREE.Group(),
        scene: new THREE.Scene()
      };
      TankModelBuilder.buildModel(dummy);
      if (dummy.hpGroup && dummy.hpGroup.parent) dummy.hpGroup.parent.remove(dummy.hpGroup);
      if (dummy.reactiveArmorMesh) dummy.reactiveArmorMesh.visible = false;
      if (dummy.barrelPivot) dummy.barrelPivot.rotation.x = -0.28;

      dummy.group.updateMatrixWorld(true);
      const turretRoot = dummy.turretGroup;
      if (turretRoot) turretRoot.updateMatrixWorld(true);

      const bodyMeshes = [];
      const turretMeshes = [];

      dummy.group.traverse(c => {
        if (c.isMesh && c.geometry) {
          let p = c.parent, inTurret = false;
          while (p && p !== dummy.group) {
            if (p === turretRoot) { inTurret = true; break; }
            p = p.parent;
          }
          if (inTurret) turretMeshes.push(c);
          else bodyMeshes.push(c);
        }
      });

      const mergeList = (meshList, baseObject) => {
        baseObject.updateMatrixWorld(true);
        const inv = baseObject.matrixWorld.clone().invert();
        const parts = [];
        let totalCount = 0;
        for (const m of meshList) {
          if (!m.geometry) continue;
          m.updateMatrixWorld(true);
          const relMat = m.matrixWorld.clone().premultiply(inv);
          const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
          g.applyMatrix4(relMat);
          parts.push(g);
          totalCount += g.attributes.position.count;
        }
        if (!totalCount) return null;
        const pos = new Float32Array(totalCount * 3);
        const nrm = new Float32Array(totalCount * 3);
        let offset = 0;
        for (const g of parts) {
          const cnt = g.attributes.position.count;
          pos.set(g.attributes.position.array, offset * 3);
          if (g.attributes.normal) nrm.set(g.attributes.normal.array, offset * 3);
          offset += cnt;
        }
        const res = new THREE.BufferGeometry();
        res.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        res.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
        res.computeVertexNormals();
        res.computeBoundingSphere();
        return res;
      };

      const bodyGeo = mergeList(bodyMeshes, dummy.group);
      const turretGeo = turretRoot && turretMeshes.length ? mergeList(turretMeshes, turretRoot) : null;
      const turretPos = turretRoot ? turretRoot.position.clone() : new THREE.Vector3(0, 0, 0);

      return (this._wreckTpl[tankType] = { bodyGeo, turretGeo, turretPos });
    }

    // ---- XÁC XE CHIẾN TRƯỜNG THỰC TẾ (mô hình gộp tối ưu hiệu năng cao, giảm 90% draw calls)
    buildWrecks(list, G) {
      if (!list.length) return;
      this.wreckIM = this.wreckIM || {};

      for (const w of list) {
        const gy = G(w.x, w.z);
        w._slots = [];
        w._dy = 0;
        w._g0 = this.wreckFoot(w).map(([x, z]) => G(x, z));
        w.gy = gy;
        w.hp = w.hp0 = WRECK_HP[w.kind] || 3;

        const tankType = w.kind === 'truck' ? 'ARTILLERY' : w.kind === 'apc' ? 'GATLING' : 'ALL_ROUNDER';
        const tpl = this.getWreckTemplate(tankType);

        if (tpl && tpl.bodyGeo) {
          const charColor = new THREE.Color(0x161412);
          const rustColor = new THREE.Color(0x2a1a14);
          const charRatio = 0.72 + hash(w.z | 0) * 0.28;
          const col = charColor.clone().lerp(rustColor, hash(w.x | 0) * 0.35).multiplyScalar(charRatio);
          const mat = new THREE.MeshStandardMaterial({
            color: col,
            roughness: 0.95,
            metalness: 0.15
          });

          const wreckGrp = new THREE.Group();
          const bodyMesh = new THREE.Mesh(tpl.bodyGeo, mat);
          bodyMesh.castShadow = true;
          bodyMesh.receiveShadow = true;
          wreckGrp.add(bodyMesh);

          if (tpl.turretGeo) {
            const turretGrp = new THREE.Group();
            turretGrp.position.copy(tpl.turretPos);
            const turretMesh = new THREE.Mesh(tpl.turretGeo, mat);
            turretMesh.castShadow = true;
            turretMesh.receiveShadow = true;
            turretGrp.add(turretMesh);

            const blown = (w.kind === 'tank' || w.kind === 'apc') && hash((w.x * 7) | 0) < 0.35;
            if (blown) {
              turretGrp.position.set(-18 - hash(w.x | 0) * 8, -6.5, 12 * (hash(w.z | 0) < 0.5 ? 1 : -1));
              turretGrp.rotation.set(0.35, 1.2, 2.4);
            } else {
              turretGrp.rotation.y = w.turretRot || (hash(w.x | 0) - 0.5) * 2;
              turretGrp.rotation.z = (hash(w.z | 0) - 0.5) * 0.32;
            }
            wreckGrp.add(turretGrp);
            w.turretGroup = turretGrp;
          }

          wreckGrp.position.set(w.x, gy - 0.4, w.z);
          wreckGrp.rotation.set(w.roll || 0, -w.angle, w.tilt || 0);
          this.group.add(wreckGrp);
          w.group = wreckGrp;
        }

        // Đăng ký vùng va chạm collider kiên cố (chắn xe & chắn đạn)
        const ca = Math.cos(w.angle), sa = Math.sin(w.angle), half = w.kind === 'truck' ? 13 : 14;
        w._b = [];
        for (const f of [-half * 0.6, 0, half * 0.6]) {
          const b = { x: w.x + ca * f, z: w.z + sa * f, radius: w.kind === 'truck' ? 6.5 : 8.5, height: w.kind === 'truck' ? 12 : 13, wreck: true };
          this.T.boulders.push(b); w._b.push(b);
        }

        this.wrecks.push(w);
        if (w.smoke) this.smokers.push(w._smoker = { x: w.x, y: gy + 8, z: w.z, phase: hash(w.x | 0) * 3 });
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
        } else if (o.gone) {
          // bao bị hất văng: nằm theo mặt đất mới chỗ rơi
          if (o.shred || !inBox(o.tx, o.tz, 3)) continue;
          const ty = S(o.tx, o.tz) + 0.35;
          if (Math.abs(ty - o.ty) < 0.02) continue;
          o.ty = ty;
          this.bagIM.setMatrixAt(o.i, this.bagMatrix(o));
          bags = true;
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
        if (!w._slots || w.shattered || !inBox(w.x, w.z, 14)) continue;
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
      if (this.street) this.street.reground(x0, z0, x1, z1);
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
        } else if (!o.flat && !o.gone && Math.hypot(o.x - x, o.z - z) < r) {
          o.flat = true;
          this.bagIM.setMatrixAt(o.i, this.bagMatrix(o));
          bagDirty = true;
        }
      }
      if (bagDirty) { this.bagIM.instanceMatrix.needsUpdate = true; this.updateBagTops(); }
      if (this.street) this.street.crush(x, z, r, dx, dz, fx);
    }
    updateBagTops() {
      // đoạn bao cát bị cán bẹp quá nửa -> không còn chắn đạn
      for (const sg of this.bagSegs) {
        let n = 0, f = 0;
        for (const b of this.near((sg.x0 + sg.x1) / 2, (sg.z0 + sg.z1) / 2, sg.L / 2 + 4)) {
          if (b.im || segDist(b.x, b.z, sg.x0, sg.z0, sg.x1, sg.z1) > 1) continue;
          n++; if (b.flat || b.gone) f++;
        }
        sg.dead = n > 0 && f / n > 0.5;
        sg.gaps = f > 0;   // có bao đã bẹp / văng: chắn đạn theo từng chỗ (standTop) thay vì cả đoạn cao đều
      }
    }
    /** Sóng nổ / đạn tại (x, y, z): đổ rào trong bán kính */
    damageAt(x, y, z, ammo, heavy, fx) {
      const A = (typeof Destructibles !== 'undefined' && Destructibles.ammoInfo) ? Destructibles.ammoInfo(ammo, heavy) : { power: 1, radius: 20 };
      const R = A.power >= 0.3 ? A.radius * 1.3 + 4 : A.radius;
      let bagHit = false;
      for (const o of this.near(x, z, R + 10)) {
        if (!o.im) { if (this.blastBag(o, x, y, z, A, ammo)) bagHit = true; continue; }
        if (o.broken) continue;
        // khoảng cách 3 chiều: nổ trên tán cây / nóc nhà cao không quật đổ rào dưới đất (trước đây chỉ xét mặt bằng)
        const hasG = Number.isFinite(o.ga) && Number.isFinite(o.gb) && Number.isFinite(y);
        const top = hasG ? (o.ga + o.gb) / 2 + o.F.h : 0, bot = hasG ? Math.min(o.ga, o.gb) - 1 : 0;
        const dy = !hasG ? 0 : y > top ? y - top : y < bot ? bot - y : 0;
        const d = Math.hypot(segDist(x, z, o.ax, o.az, o.bx, o.bz), dy);
        if (d > R) continue;
        // tường đá / đất bền hơn rào gỗ: cần nổ mạnh hoặc gần. Đạn xuyên động năng không có sức nổ: chỉ đổ đoạn bị trúng thẳng
        if (o.F.solid && !o.F.leafy && (A.power < 0.9 || ammo === 'AP') && d > A.radius * 0.5) continue;
        if (A.power < 0.3 && o.F.solid) continue;
        this.breakSpan(o, o.x - x, o.z - z, fx);
      }
      if (bagHit) this.bagsBlasted(x, y, z, A, fx);
      if (this.street) this.street.damageAt(x, y, z, A, fx, ammo);
      for (const w of this.wrecks) if (!w.shattered && Math.abs(w.x - x) < 40 + A.radius && Math.abs(w.z - z) < 40 + A.radius) this.blastWreck(w, x, y, z, A, ammo, fx);
    }
    /**
     * Xác xe trúng đạn / nổ gần: sức phá = sức nổ giảm theo khoảng cách tới thân xác xe (+ động năng nếu trúng thẳng). Đạn
     * súng chỉ băm dần (xe tải cháy rỗng: ~35 viên 30 mm). Quá nửa sức chịu: xác xe bị thổi xô lệch, méo, đen sạm hơn; hết
     * sức chịu: nát bét — thân, tháp, xích, bánh văng tung toé nằm bẹp quanh chỗ cũ, không còn che chắn / cản xe (gỡ khỏi
     * danh sách vật cản như đá tảng vỡ). Sức chịu chỉ đổi theo chuỗi ENV_HIT (băm theo toạ độ, không RNG) -> mọi máy như nhau
     */
    blastWreck(w, x, y, z, A, ammo, fx) {
      let d = Infinity;
      for (const b of w._b) d = Math.min(d, Math.max(0, Math.hypot(x - b.x, z - b.z) - b.radius));
      const top = (w.gy || 0) + (w.kind === 'truck' ? 12 : 13), dy = y > top ? y - top : 0;
      d = Math.hypot(d, dy);
      const R = A.power >= 0.3 ? A.radius * 0.6 + 4 : A.radius;
      if (d > R) return;
      const direct = d < 2.5;
      let dmg = A.power * Math.pow(1 - d / R, 1.5) + (direct && A.pierce ? A.power * 0.4 : 0);
      if (A.power < 0.3) dmg *= direct ? (w.kind === 'truck' ? 1 : w.kind === 'apc' ? 0.35 : 0.08) : 0;   // đạn súng: chỉ trúng thẳng, giáp dày gần như vô hại
      // mũi tên xuyên giáp: khoan lỗ xuyên qua thân thép, ít khi xé vụn được cả xác xe (xe tải mỏng thì toác)
      if (ammo === 'AP') dmg *= w.kind === 'truck' ? 0.8 : 0.3;
      if (dmg <= 0.001) return;
      const was = w.hp / w.hp0;
      w.hp -= dmg;
      const k = w.hp / w.hp0;
      if (k <= 0) this.shatterWreck(w, x, z, fx);
      else if (was > 0.5 && k <= 0.5) this.mangleWreck(w, x, z, fx);
    }
    // ĐỒNG BỘ (terrain.envStateString): sức chịu còn lại từng xác xe theo bậc 1/20 ('X' = đã nát) — máy vào trận giữa chừng
    // / máy lệch trạng thái gộp theo mức hư nặng hơn
    wreckState() { return this.wrecks.map(w => w.shattered ? 'X' : Math.max(0, Math.round((w.hp !== undefined ? w.hp / w.hp0 : 1) * 20))).join(','); }
    applyWreckState(str, fx) {
      String(str).split(',').forEach((v, i) => {
        const w = this.wrecks[i];
        if (!w || w.shattered || v === '' || w.hp === undefined) return;
        if (v === 'X') { this.shatterWreck(w, w.x + 1, w.z, null); return; }
        const k = +v / 20;
        if (!(k < w.hp / w.hp0)) return;
        const was = w.hp / w.hp0;
        w.hp = k * w.hp0;
        if (was > 0.5 && k <= 0.5) this.mangleWreck(w, w.x + 1, w.z, null);
      });
    }
    // nửa sức chịu: cả xác xe bị sức ép xô lệch ra xa điểm nổ ~0,5-1 m, nghiêng / lật nghiêng, cháy đen thêm
    mangleWreck(w, x, z, fx) {
      let dx = w.x - x, dz = w.z - z;
      const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const h = hash(Math.round(w.x * 3) ^ Math.round(w.z * 5));
      const push = 4 + h * 5, roll = (h - 0.5) * 0.5;

      // Xô lệch và làm nghiêng mô hình xe chi tiết
      if (w.group) {
        w.group.position.x += dx * push;
        w.group.position.z += dz * push;
        w.group.rotation.z += roll;
      }

      const T0 = new THREE.Matrix4().makeTranslation(-w.x, -(w.gy || 0), -w.z);
      const Rm = new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(-dz, 0, dx), roll);
      const T1 = new THREE.Matrix4().makeTranslation(w.x + dx * push, (w.gy || 0), w.z + dz * push);
      const X = T1.multiply(Rm).multiply(T0), m = new THREE.Matrix4();
      for (const [g, i] of (w._slots || [])) {
        const im = this.wreckIM[g];
        if (!im) continue;
        im.getMatrixAt(i, m); m.premultiply(X); im.setMatrixAt(i, m);
        im.setColorAt(i, new THREE.Color(0.42, 0.4, 0.38)); im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
      }
      for (const b of w._b) { b.x += dx * push; b.z += dz * push; b.height *= 0.8; }
      this.wreckFx(w, fx, 0.6);
    }
    // nát bét: từng bộ phận văng ra 1-5 m quanh chỗ cũ theo hướng xa điểm nổ, nằm bẹp nghiêng ngả trên đất; gỡ va chạm
    shatterWreck(w, x, z, fx) {
      w.shattered = true;
      let dx = w.x - x, dz = w.z - z;
      const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;

      // Mô hình xe chi tiết bẹp dí khung gầm và thổi văng tháp pháo
      if (w.group) {
        w.group.scale.set(1.15, 0.42, 1.15);
        w.group.position.y -= 1.8;
        if (w.turretGroup) {
          w.turretGroup.position.x += dx * 16;
          w.turretGroup.position.z += dz * 16;
          w.turretGroup.rotation.x += (hash(Math.round(w.x)) - 0.5) * 1.5;
        }
      }

      const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), e = new THREE.Euler();
      let n = 0;
      for (const [g, i] of (w._slots || [])) {
        const im = this.wreckIM[g];
        if (!im) continue;
        im.getMatrixAt(i, m); m.decompose(p, q, sc);
        const h1 = hash(i * 31 + n * 7 + Math.round(w.x)), h2 = hash(i * 17 + n * 13 + Math.round(w.z)), h3 = hash(i * 11 + n * 3 + 5);
        n++;
        let dx = p.x - x, dz = p.z - z;
        const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
        const a = (h1 - 0.5) * 1.6, ca = Math.cos(a), sa = Math.sin(a);
        const fly = 8 + h2 * (g === 'turret' || g === 'barrel' || g === 'wheel' ? 34 : 18);
        p.x += (dx * ca - dz * sa) * fly; p.z += (dx * sa + dz * ca) * fly;
        // thân / khung bẹp dí, xé làm mảng nằm nghiêng; bánh, xích, nòng nằm vương vãi
        if (g === 'hull') sc.set(sc.x * (0.55 + 0.3 * h3), sc.y * 0.4, sc.z * (0.55 + 0.3 * h2));
        q.premultiply(new THREE.Quaternion().setFromEuler(e.set((h2 - 0.5) * 1.4, h1 * 6.28, (h3 - 0.5) * 1.4)));
        const gy = this.T.surfaceAt ? this.T.surfaceAt(p.x, p.z, true) : this.T.groundAtRaw(p.x, p.z);
        p.y = gy + Math.min(sc.x, sc.y, sc.z) * 0.3;
        m.compose(p, q, sc);
        im.setMatrixAt(i, m);
        im.setColorAt(i, new THREE.Color(0.26, 0.25, 0.24));
        im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
      }
      // không còn che chắn / cản đường: gỡ khỏi danh sách vật cản (như đá tảng vỡ) + báo bot tìm đường lại
      for (const b of w._b) { const bi = this.T.boulders.indexOf(b); if (bi >= 0) this.T.boulders.splice(bi, 1); }
      if (this.T.envDamage && this.T.envDamage.markNav) this.T.envDamage.markNav(w.x, w.z, 120);
      if (w._smoker) w._smoker.y = (w.gy || 0) + 3;
      this.wreckFx(w, fx, 1.2);
    }
    wreckFx(w, fx, k) {
      if (fx && fx.smoke) for (let i = 0; i < Math.round(10 * k); i++) {
        const a = hash(i * 13 + Math.round(w.x)) * TAU, r = hash(i * 7 + Math.round(w.z)) * 10;
        fx.smoke.add({ x: w.x + Math.cos(a) * r, y: (w.gy || 0) + 3, z: w.z + Math.sin(a) * r, vx: Math.cos(a) * 12, vy: 6 + hash(i + 3) * 10, vz: Math.sin(a) * 12,
          size: 3 + hash(i + 5) * 4, grow: 4, drag: 2, grav: 4, life: 1.8, alpha: 0.6, fadeIn: 0.02, c0: [0.3, 0.29, 0.27], cell: 2 });
      }
      sfx('sheetMetal', w.x, (w.gy || 0) + 5, w.z, 0.5 * k, { h: 5 });
    }
    /**
     * Bao cát trúng nổ: bao cát chặn đạn súng & mảnh văng rất tốt (đạn súng không làm gì được), nhưng sức nổ áp sát xé rách,
     * hất văng bao -> bờ bao thủng một khe đúng chỗ nổ: nổ mạnh 120 mm khe ~2 m, đa năng / tên lửa ~1,5 m, bom con ~1 m,
     * lựu pháo 155 ~3 m; đạn xuyên động năng chỉ xé rách bao bị trúng thẳng.
     * Sát tâm nổ: bao rách toác (cát vãi hết) hoặc bị hất văng xa vài mét; xa hơn: bao rách, xẹp lún tại chỗ.
     * Không dùng RNG (băm theo toạ độ) -> mọi máy nhận ENV_HIT ra cùng kết quả.
     */
    blastBag(b, x, y, z, A, ammo) {
      if (b.gone || A.power < 0.3) return false;
      const kinetic = ammo === 'AP';
      // (điểm chạm nằm ở mặt bờ bao, cách đường tâm bao ~2,6 đv -> bán kính tính từ tâm bao cộng thêm khoảng đó)
      const Rb = kinetic ? 3.6 : A.radius * 0.24 + 3;
      const d = Math.hypot(b.x - x, b.y - y, b.z - z);
      if (d > Rb) return false;
      if (kinetic || d > Rb * 0.55) {
        if (b.flat) return false;
        b.flat = true;
        return true;
      }
      b.gone = true;
      const h = hash(b.seed + Math.round(x * 3) * 131 + Math.round(z * 3) * 71);
      if (d < Rb * 0.22) { b.shred = true; return true; }
      // hất văng theo hướng từ tâm nổ ra, càng gần càng xa
      let dx = b.x - x, dz = b.z - z;
      const l = Math.hypot(dx, dz);
      if (l < 0.3) { const a = h * TAU; dx = Math.cos(a); dz = Math.sin(a); } else { dx /= l; dz /= l; }
      const fly = 3 + (1 - d / Rb) * 14 * (0.6 + 0.8 * h);
      const sw = (hash(b.seed + 17) - 0.5) * 0.9;   // lệch ngang một chút
      b.tx = b.x + (dx - dz * sw) * fly; b.tz = b.z + (dz + dx * sw) * fly;
      const T = this.T, g = T.surfaceAt ? T.surfaceAt(b.tx, b.tz, true) : T.groundAtRaw(b.tx, b.tz);
      b.ty = g + 0.35; b.tyaw = h * TAU; b.troll = (hash(b.seed + 29) - 0.5) * 0.5;
      return true;
    }
    // Sau loạt bao bị nổ: bao lớp trên mất chỗ tựa thì đổ sụp xuống, cập nhật hình & khả năng chắn đạn, bụi cát + tiếng
    bagsBlasted(x, y, z, A, fx) {
      const near = this.near(x, z, A.radius * 0.32 + 12).filter(o => !o.im);
      for (let pass = 0; pass < 3; pass++) {
        for (const b of near) {
          if (b.gone || b.flat || !b.layer) continue;
          const held = near.some(q => q.layer === b.layer - 1 && !q.gone && !q.flat && Math.hypot(q.x - b.x, q.z - b.z) < 3.6);
          if (!held) b.flat = true;
        }
      }
      for (const b of near) this.bagIM.setMatrixAt(b.i, this.bagMatrix(b));
      this.bagIM.instanceMatrix.needsUpdate = true;
      this.updateBagTops();
      if (fx && fx.smoke) {
        for (let k = 0; k < 10; k++) {
          const a = hash(k * 13 + Math.round(x)) * TAU, r = hash(k * 7 + Math.round(z)) * 4;
          fx.smoke.add({ x: x + Math.cos(a) * r, y: y + 1, z: z + Math.sin(a) * r, vx: Math.cos(a) * 9, vy: 4 + hash(k + 3) * 7, vz: Math.sin(a) * 9,
            size: 1.6 + hash(k + 5) * 1.8, grow: 2.4, drag: 2.2, grav: 5, life: 1.6, alpha: 0.55, fadeIn: 0.02, c0: [0.62, 0.55, 0.42], cell: 2 });
        }
      }
      sfx('adobe', x, y, z, 0.5, { h: 3 });
    }
    // Đỉnh bờ bao (so với chân bờ) tại (x, z) theo các bao còn đứng gần đó: -1 = khe hở (bao quanh đó đã rách / văng / đổ)
    standTop(x, z) {
      let top = -1;
      for (const b of this.near(x, z, 4)) {
        if (b.im || b.gone || b.flat || Math.abs(b.x - x) > 3.4 || Math.abs(b.z - z) > 3.4) continue;
        top = Math.max(top, b.layer * 1.85 + 2.6);
      }
      return top;
    }
    /** Điểm (x, y, z) nằm trong khối bao cát còn nguyên -> chắn đạn */
    // Gọi ở mỗi bước mô phỏng đường đạn (hàng nghìn lần / khung): loại nhanh bằng hộp bao của đoạn bao cát
    // (nới 2.6 = bề dày bờ bao) và dải độ cao, rồi mới tính khoảng cách điểm - đoạn — kết quả y hệt cách cũ
    hitTest(x, y, z) {
      if (this.street) { const h = this.street.hitTest(x, y, z); if (h) return h; }
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
        if (y < gy - 2 || y > gy + sg.top) continue;
        // khe hở do nổ / lớp trên đã đổ: đạn bay lọt qua chỗ bờ bao thấp hơn
        const top = sg.gaps ? this.standTop(x, z) : sg.top;
        if (y <= gy + top) return { hit: true, type: 'SANDBAG', x, y, z };
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
        const top = sg.gaps ? this.standTop(ex + (ux - ex) * t, ez + (uz - ez) * t) : sg.top;
        if (y <= gy + top) return true;
      }
      return false;
    }
    update(dt, fx, cam) {
      if (this.street) this.street.update(dt, fx, cam);   // ô tô trượt sau cú húc / đang cháy
      if (!fx || !fx.smoke || !this.smokers.length) return;
      this.smokeAcc += dt;
      if (this.smokeAcc < 0.22) return;
      const step = this.smokeAcc; this.smokeAcc = 0;
      for (const s of this.smokers) {
        if (cam && Math.hypot(cam.x - s.x, cam.z - s.z) > 1700) continue;
        s.phase += step;
        const k = 0.6 + 0.4 * Math.sin(s.phase * 0.7);
        fx.smoke.add({ x: s.x + (Math.random() - 0.5) * 6, y: s.y, z: s.z + (Math.random() - 0.5) * 6, vx: (Math.random() - 0.5) * 3, vy: 7 + Math.random() * 5, vz: (Math.random() - 0.5) * 3,
          size: 4 + Math.random() * 3, grow: 6, drag: 0.5, grav: -2, life: 5 + Math.random() * 3, alpha: 0.32 * k, fadeIn: 0.3, c0: [0.12, 0.11, 0.1], c1: [0.36, 0.35, 0.34], cell: 0, floor: false });
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
