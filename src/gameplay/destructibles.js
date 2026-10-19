/**
 * VẬT THỂ PHÁ HỦY ĐƯỢC TRÊN CHIẾN TRƯỜNG
 * - Cây: cháy sém lá -> bốc cháy -> trơ thân cháy đen; sóng nổ mạnh quật đổ; xe tăng húc đổ
 * - Nhà: ghép từ các mô-đun (mảng tường từng tầng, sàn, cột, mái) -> trúng đạn thủng lỗ, vỡ mảng,
 *        mất trụ đỡ thì sập dây chuyền thành đống đổ nát, bụi mù
 * - Boong-ke bê tông cốt thép: tường dày + mái đổ bê tông phủ bao cát, khối tường sứt mẻ / nứt / vỡ,
 *        chặn sóng nổ & mảnh văng cho xe nấp bên trong
 * Tất cả dùng InstancedMesh dùng chung -> vài chục draw call cho cả bản đồ.
 */
const Destructibles = (() => {
  // Bộ sinh số ngẫu nhiên dùng chung của mọi vật thể phá hủy được. Mặc định Math.random; trong withSeed() là chuỗi
  // có hạt giống -> cùng một sự kiện (dựng bản đồ / một phát đạn trúng) cho kết quả giống hệt nhau trên mọi máy chơi.
  let RNG = Math.random;
  function seededRng(seed) {
    let a = seed >>> 0;
    return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function withSeed(seed, fn) {
    const prev = RNG;
    RNG = seededRng(seed);
    try { return fn(); } finally { RNG = prev; }
  }
  const rand = (a, b) => a + RNG() * (b - a);
  const clamp01 = v => Math.max(0, Math.min(1, v));
  const sfx = (kind, x, y, z, k) => { if (typeof window !== 'undefined' && window.soundEngine && window.soundEngine.secondaryAt) window.soundEngine.secondaryAt(kind, { x, y, z }, k || 1); };

  // Sức phá & bán kính tác động lên công trình / cây theo loại đạn
  const AMMO = {
    NORMAL: { power: 1.0, radius: 22, heat: 0.5 },
    HE: { power: 1.7, radius: 32, heat: 0.8 },
    AP: { power: 1.0, radius: 4.2, heat: 0.6, pierce: true },   // xuyên động năng: phá tập trung, vùng ảnh hưởng nhỏ
    CLUSTER: { power: 1.2, radius: 30, heat: 0.6 },
    CLUSTER_SUBMUNITION: { power: 0.55, radius: 13, heat: 0.5 },
    RPG: { power: 1.3, radius: 15, heat: 0.7, pierce: true },
    ANTI_TANK_MISSILE: { power: 1.3, radius: 15, heat: 0.7, pierce: true },
    GATLING_BULLET: { power: 0.07, radius: 3.5, heat: 0.1 },
    INCENDIARY: { power: 0.08, radius: 5, heat: 1.0, fire: true },
    SCOUT_BULLET: { power: 0.035, radius: 2.5, heat: 0.03 }
  };
  function ammoInfo(ammo, heavy) {
    const a = AMMO[ammo] || AMMO.NORMAL;
    if (!heavy) return a;
    return { power: a.power * 1.8, radius: a.radius * 1.7, heat: a.heat, pierce: a.pierce, fire: a.fire };
  }

  // ---------------------------------------------------------------------------
  // TEXTURE THỦ TỤC
  // ---------------------------------------------------------------------------
  const TEX = {};
  function canvasTex(key, w, h, draw, repeat) {
    if (TEX[key]) return TEX[key];
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    draw(g, w, h);
    const t = new THREE.CanvasTexture(c);
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
    t.anisotropy = 4;
    TEX[key] = t;
    return t;
  }
  function speckle(g, w, h, n, cols, smin, smax) {
    for (let i = 0; i < n; i++) {
      g.fillStyle = cols[i % cols.length];
      const s = smin + RNG() * (smax - smin);
      g.fillRect(RNG() * w, RNG() * h, s, s);
    }
  }
  // Bê tông đúc: vệt ván khuôn, lỗ ty, vệt nước chảy, rêu ố chân tường
  function concreteTex() {
    return canvasTex('concrete', 256, 256, (g, w, h) => {
      g.fillStyle = '#9d9a90'; g.fillRect(0, 0, w, h);
      speckle(g, w, h, 2600, ['rgba(70,68,62,0.18)', 'rgba(200,196,186,0.16)', 'rgba(110,104,92,0.2)'], 1, 3);
      g.strokeStyle = 'rgba(60,58,52,0.35)'; g.lineWidth = 1.5;
      for (let y = 0; y <= h; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
      for (let x = 0; x <= w; x += 128) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
      g.fillStyle = 'rgba(40,38,34,0.5)';
      for (let y = 32; y < h; y += 64) for (let x = 32; x < w; x += 64) { g.beginPath(); g.arc(x, y, 2, 0, 6.3); g.fill(); }
      for (let i = 0; i < 18; i++) {
        const x = RNG() * w;
        const gr = g.createLinearGradient(x, 0, x, h);
        gr.addColorStop(0, 'rgba(50,46,40,0.0)'); gr.addColorStop(0.6, 'rgba(50,46,40,0.18)'); gr.addColorStop(1, 'rgba(60,70,40,0.3)');
        g.fillStyle = gr; g.fillRect(x, 0, 3 + RNG() * 7, h);
      }
    }, true);
  }
  function crackedTex() {
    return canvasTex('concreteCracked', 256, 256, (g, w, h) => {
      g.drawImage(concreteTex().image, 0, 0);
      g.strokeStyle = 'rgba(25,22,18,0.85)'; g.lineWidth = 1.6;
      for (let k = 0; k < 9; k++) {
        let x = RNG() * w, y = RNG() * h;
        g.beginPath(); g.moveTo(x, y);
        for (let s = 0; s < 8; s++) { x += rand(-26, 26); y += rand(-26, 26); g.lineTo(x, y); }
        g.stroke();
      }
      // Mảng bê tông bong lộ cốt thép gỉ
      for (let k = 0; k < 5; k++) {
        const x = RNG() * w, y = RNG() * h, r = rand(10, 22);
        g.fillStyle = 'rgba(70,64,56,0.9)'; g.beginPath(); g.arc(x, y, r, 0, 6.3); g.fill();
        g.strokeStyle = 'rgba(120,60,30,0.95)'; g.lineWidth = 2;
        for (let b = -1; b <= 1; b++) { g.beginPath(); g.moveTo(x - r, y + b * 6); g.lineTo(x + r, y + b * 6); g.stroke(); }
      }
    }, true);
  }
  // Mảng tường có cửa sổ (1 khoang tầng): tường tô màu trắng (nhuộm bằng instanceColor), khung cửa, kính tối
  function windowPanelTex(style) {
    return canvasTex('win_' + style, 128, 128, (g, w, h) => {
      g.fillStyle = '#e8e4da'; g.fillRect(0, 0, w, h);
      speckle(g, w, h, 900, ['rgba(120,110,95,0.15)', 'rgba(255,255,255,0.15)'], 1, 3);
      if (style === 'office') {
        // Mặt dựng kính: khung nhôm, kính phản chiếu
        g.fillStyle = '#9aa3a8'; g.fillRect(0, 0, w, h);
        const gr = g.createLinearGradient(0, 0, w, h);
        gr.addColorStop(0, '#2c3d4c'); gr.addColorStop(0.5, '#4f6a7d'); gr.addColorStop(1, '#22313d');
        g.fillStyle = gr; g.fillRect(6, 14, w - 12, h - 30);
        g.fillStyle = '#9aa3a8'; g.fillRect(w / 2 - 2, 14, 4, h - 30);
        g.fillStyle = 'rgba(255,255,255,0.12)'; g.beginPath(); g.moveTo(12, h - 20); g.lineTo(40, 18); g.lineTo(54, 18); g.lineTo(26, h - 20); g.fill();
      } else if (style === 'adobe') {
        g.fillStyle = '#d9c9a8'; g.fillRect(0, 0, w, h);
        speckle(g, w, h, 1400, ['rgba(140,110,70,0.2)', 'rgba(255,240,210,0.2)'], 1, 4);
        g.fillStyle = '#2a211a'; g.fillRect(48, 40, 32, 34);
        g.fillStyle = '#6b4a2a'; g.fillRect(44, 36, 40, 5); g.fillRect(44, 74, 40, 4);
      } else if (style === 'stone') {
        g.fillStyle = '#b8b2a6'; g.fillRect(0, 0, w, h);
        g.strokeStyle = 'rgba(70,64,56,0.55)'; g.lineWidth = 1.5;
        for (let y = 0; y < h; y += 16) for (let x = (y / 16) % 2 ? 0 : 12; x < w; x += 24) g.strokeRect(x, y, 24, 16);
        g.fillStyle = '#1e1a16'; g.fillRect(46, 38, 36, 40);
        g.fillStyle = '#5a3e26'; g.fillRect(46, 56, 36, 3); g.fillRect(63, 38, 3, 40);
      } else if (style === 'wood') {
        g.fillStyle = '#c9b48e'; g.fillRect(0, 0, w, h);
        for (let x = 0; x < w; x += 10) { g.fillStyle = x % 20 ? 'rgba(90,60,30,0.28)' : 'rgba(60,40,20,0.35)'; g.fillRect(x, 0, 2, h); }
        g.fillStyle = '#231a12'; g.fillRect(40, 40, 48, 38);
        g.fillStyle = '#7b5a36'; g.fillRect(38, 38, 52, 4); g.fillRect(62, 40, 4, 38);
      } else if (style === 'metal') {
        g.fillStyle = '#cfd2cf'; g.fillRect(0, 0, w, h);
        for (let x = 0; x < w; x += 8) { g.fillStyle = 'rgba(60,64,62,0.35)'; g.fillRect(x, 0, 3, h); }
        speckle(g, w, h, 300, ['rgba(140,80,40,0.25)'], 2, 6);
      } else {
        // Chung cư / cửa hàng: tường tô, cửa sổ 2 cánh có ô văng, bệ cửa
        g.fillStyle = '#3a4248'; g.fillRect(34, 30, 60, 54);
        g.fillStyle = '#56636c'; g.fillRect(38, 34, 25, 46); g.fillRect(65, 34, 25, 46);
        g.fillStyle = 'rgba(255,255,255,0.1)'; g.fillRect(40, 36, 8, 42);
        g.fillStyle = '#bdb6a8'; g.fillRect(30, 26, 68, 5); g.fillRect(28, 84, 72, 6);
        if (style === 'shop') {
          g.fillStyle = '#2b2f33'; g.fillRect(8, 64, 112, 64);
          g.fillStyle = '#7d1f1a'; g.fillRect(4, 56, 120, 10);
        }
      }
      // Ố bẩn chân tường
      const gr2 = g.createLinearGradient(0, h * 0.7, 0, h);
      gr2.addColorStop(0, 'rgba(60,50,40,0)'); gr2.addColorStop(1, 'rgba(60,50,40,0.28)');
      g.fillStyle = gr2; g.fillRect(0, h * 0.7, w, h * 0.3);
    });
  }
  function slabTex() {
    return canvasTex('slab', 128, 128, (g, w, h) => {
      g.fillStyle = '#8f8b82'; g.fillRect(0, 0, w, h);
      speckle(g, w, h, 1200, ['rgba(50,48,44,0.22)', 'rgba(210,205,195,0.15)'], 1, 3);
      g.fillStyle = 'rgba(40,38,34,0.4)'; g.fillRect(0, 0, w, 3); g.fillRect(0, h - 3, w, 3);
    }, true);
  }
  function roofTileTex() {
    return canvasTex('roofTile', 128, 128, (g, w, h) => {
      g.fillStyle = '#8a4a32'; g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 10) {
        g.fillStyle = 'rgba(40,20,10,0.4)'; g.fillRect(0, y + 8, w, 2);
        for (let x = (y / 10) % 2 ? 0 : 8; x < w; x += 16) { g.fillStyle = 'rgba(255,200,160,0.12)'; g.fillRect(x, y, 8, 8); }
      }
    }, true);
  }
  function sandbagTex() {
    return canvasTex('sandbag', 64, 64, (g, w, h) => {
      g.fillStyle = '#a99b74'; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(70,60,40,0.5)'; g.lineWidth = 1;
      for (let i = 0; i < w; i += 3) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 2, h); g.stroke(); }
      speckle(g, w, h, 200, ['rgba(60,50,30,0.3)'], 1, 3);
    }, true);
  }
  function barkTex(kind) {
    return canvasTex('bark_' + kind, 64, 128, (g, w, h) => {
      const base = { palm: '#7d6a4f', pine: '#5b3e2b', birch: '#cfc8b8', dead: '#6e6455', cactus: '#4e6b34' }[kind] || '#5e4632';
      g.fillStyle = base; g.fillRect(0, 0, w, h);
      if (kind === 'palm') {
        for (let y = 0; y < h; y += 9) { g.fillStyle = 'rgba(40,30,20,0.5)'; g.fillRect(0, y, w, 3); g.fillStyle = 'rgba(200,180,140,0.15)'; g.fillRect(0, y + 3, w, 2); }
      } else if (kind === 'cactus') {
        for (let x = 0; x < w; x += 8) { g.fillStyle = 'rgba(20,40,10,0.45)'; g.fillRect(x, 0, 2, h); g.fillStyle = 'rgba(180,200,140,0.25)'; g.fillRect(x + 4, 0, 1, h); }
      } else {
        for (let x = 0; x < w; x += 4) { g.fillStyle = `rgba(20,14,8,${0.2 + RNG() * 0.35})`; g.fillRect(x + rand(-1, 1), 0, rand(1, 2.5), h); }
        speckle(g, w, h, 160, ['rgba(255,240,220,0.1)', 'rgba(0,0,0,0.25)'], 1, 4);
      }
    }, true);
  }
  // Lá cây (kênh alpha để cắt viền lá)
  function leafTex(kind) {
    return canvasTex('leaf_' + kind, 128, 128, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      if (kind === 'frond') {
        // Tàu lá cọ: sống lá giữa + lá chét xếp hai bên
        g.strokeStyle = '#5c6b2a'; g.lineWidth = 3; g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.stroke();
        for (let y = 4; y < h; y += 5) {
          const L = 52 * Math.sin((y / h) * Math.PI) + 6;
          g.strokeStyle = `rgb(${60 + RNG() * 30},${100 + RNG() * 40},${30 + RNG() * 20})`;
          g.lineWidth = 3;
          g.beginPath(); g.moveTo(w / 2, y); g.lineTo(w / 2 - L, y + 10); g.stroke();
          g.beginPath(); g.moveTo(w / 2, y); g.lineTo(w / 2 + L, y + 10); g.stroke();
        }
      } else if (kind === 'needle') {
        for (let i = 0; i < 2200; i++) {
          const x = RNG() * w, y = RNG() * h;
          if (RNG() > 1 - (y / h) * 0.15) continue;
          g.strokeStyle = `rgba(${25 + RNG() * 25},${55 + RNG() * 35},${30 + RNG() * 20},0.95)`;
          g.lineWidth = 1.4; g.beginPath(); g.moveTo(x, y); g.lineTo(x + rand(-4, 4), y + rand(3, 7)); g.stroke();
        }
      } else {
        // Tán lá rộng: nhiều phiến lá chồng lớp, sáng tối xen kẽ
        const pal = kind === 'jungle' ? [[40, 90, 30], [55, 115, 35], [30, 70, 25]] : kind === 'dry' ? [[120, 120, 60], [140, 130, 70], [100, 95, 50]] : [[55, 95, 35], [75, 120, 45], [45, 80, 30]];
        for (let i = 0; i < 520; i++) {
          const c = pal[i % 3];
          const s = rand(0.7, 1.2);
          g.fillStyle = `rgba(${c[0] * s | 0},${c[1] * s | 0},${c[2] * s | 0},0.96)`;
          const x = RNG() * w, y = RNG() * h, a = RNG() * 6.3;
          g.beginPath(); g.ellipse(x, y, rand(3, 6), rand(1.5, 3), a, 0, 6.3); g.fill();
        }
      }
    });
  }

  // ---------------------------------------------------------------------------
  // HÌNH HỌC: gộp các BufferGeometry không chỉ số (position/normal/uv)
  // ---------------------------------------------------------------------------
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
  function place(geo, pos, rot, scale) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    _e.set(rot ? rot[0] : 0, rot ? rot[1] : 0, rot ? rot[2] : 0);
    _q.setFromEuler(_e);
    _v.set(pos ? pos[0] : 0, pos ? pos[1] : 0, pos ? pos[2] : 0);
    if (typeof scale === 'number') _s.set(scale, scale, scale); else if (scale) _s.set(scale[0], scale[1], scale[2]); else _s.set(1, 1, 1);
    g.applyMatrix4(_m.compose(_v, _q, _s));
    return g;
  }
  function merge(list) {
    let n = 0;
    for (const g of list) n += g.attributes.position.count;
    const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    let o = 0;
    for (const g of list) {
      const c = g.attributes.position.count;
      pos.set(g.attributes.position.array.subarray(0, c * 3), o * 3);
      if (!g.attributes.normal) g.computeVertexNormals();
      nrm.set(g.attributes.normal.array.subarray(0, c * 3), o * 3);
      if (g.attributes.uv) uv.set(g.attributes.uv.array.subarray(0, c * 2), o * 2);
      o += c;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    out.computeBoundingSphere();
    return out;
  }
  // Nhiễu đỉnh cho khối tán lá / đá (bề mặt sần, không tròn trịa)
  function jitter(geo, amt, seed) {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const k = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + seed) * 43758.5453;
      const f = 1 + (k - Math.floor(k) - 0.5) * amt;
      p.setXYZ(i, x * f, y * f, z * f);
    }
    geo.computeVertexNormals();
    return geo;
  }

  // Bể chứa instance dùng chung
  class Pool {
    constructor(parent, geo, mat, cap, opts = {}) {
      this.mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, cap));
      this.mesh.count = 0;
      this.mesh.castShadow = opts.castShadow !== false;
      this.mesh.receiveShadow = opts.receiveShadow !== false;
      this.mesh.frustumCulled = false;
      this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      if (opts.color) {
        this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, cap) * 3).fill(1), 3);
      }
      parent.add(this.mesh);
      this.cap = cap;
    }
    add(matrix, color) {
      const i = this.mesh.count;
      if (i >= this.cap) return -1;
      this.mesh.count++;
      this.mesh.setMatrixAt(i, matrix);
      if (color && this.mesh.instanceColor) this.mesh.setColorAt(i, color);
      return i;
    }
    set(i, matrix) { if (i >= 0) { this.mesh.setMatrixAt(i, matrix); this.mesh.instanceMatrix.needsUpdate = true; } }
    hide(i) { if (i >= 0) { this.mesh.setMatrixAt(i, ZERO); this.mesh.instanceMatrix.needsUpdate = true; } }
    color(i, c) { if (i >= 0 && this.mesh.instanceColor) { this.mesh.setColorAt(i, c); this.mesh.instanceColor.needsUpdate = true; } }
    commit() { this.mesh.instanceMatrix.needsUpdate = true; if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true; }
  }
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

  // ---------------------------------------------------------------------------
  // HÌNH HỌC VỠ NỨT (khối đơn vị -0.5..0.5): viền gãy lởm chởm ngẫu nhiên, lỗ thủng méo mó, cốt thép lòi ra
  // ---------------------------------------------------------------------------
  function extrudeUnit(shape) {
    const g = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false, steps: 1, curveSegments: 1 });
    g.translate(0, 0, -0.5);
    // UV phẳng theo mặt chính (giữ texture bê tông không méo)
    const p = g.attributes.position, uv = g.attributes.uv;
    const n = g.attributes.normal || (g.computeVertexNormals(), g.attributes.normal);
    for (let i = 0; i < p.count; i++) {
      const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
      if (ax > 0.7) uv.setXY(i, p.getZ(i) + 0.5, p.getY(i) + 0.5);
      else if (ay > 0.7) uv.setXY(i, p.getX(i) + 0.5, p.getZ(i) + 0.5);
      else uv.setXY(i, p.getX(i) + 0.5, p.getY(i) + 0.5);
    }
    return g;
  }
  // Đường gãy răng cưa giữa 2 điểm (các điểm lệch ngẫu nhiên vuông góc)
  function jagged(pts, x0, y0, x1, y1, n, amp, clampFn) {
    for (let i = 1; i < n; i++) {
      const t = i / n + rand(-0.3, 0.3) / n;
      let x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
      const nx = -(y1 - y0), ny = x1 - x0, l = Math.hypot(nx, ny) || 1;
      const k = rand(-amp, amp);
      x += nx / l * k; y += ny / l * k;
      if (clampFn) [x, y] = clampFn(x, y);
      pts.push(new THREE.Vector2(x, y));
    }
  }
  const cl = (x, y) => [Math.max(-0.5, Math.min(0.5, x)), Math.max(-0.5, Math.min(0.5, y))];
  const FRACTURE = {
    // Khối vỡ thủng lỗ méo ở giữa (đạn xuyên / nổ sát)
    holed() {
      const s = new THREE.Shape([new THREE.Vector2(-0.5, -0.5), new THREE.Vector2(0.5, -0.5), new THREE.Vector2(0.5, 0.5), new THREE.Vector2(-0.5, 0.5)]);
      const cx = rand(-0.1, 0.1), cy = rand(-0.08, 0.1), R = rand(0.2, 0.3), n = 12;
      const hole = [];
      for (let i = 0; i < n; i++) {
        const a = -(i / n) * Math.PI * 2;
        const r = R * rand(0.6, 1.35);
        hole.push(new THREE.Vector2(Math.max(-0.42, Math.min(0.42, cx + Math.cos(a) * r * 1.15)), Math.max(-0.4, Math.min(0.42, cy + Math.sin(a) * r))));
      }
      s.holes.push(new THREE.Path(hole));
      return extrudeUnit(s);
    },
    // Gốc khối còn lại sau khi vỡ: mép trên gãy răng cưa (chỉ còn 15-60% chiều cao)
    remnant() {
      const pts = [new THREE.Vector2(-0.5, -0.5), new THREE.Vector2(0.5, -0.5)];
      const hR = rand(-0.4, 0.1), hL = rand(-0.4, 0.1);
      pts.push(new THREE.Vector2(0.5, hR));
      jagged(pts, 0.5, hR, -0.5, hL, 7, 0.14, (x, y) => [x, Math.max(-0.45, Math.min(0.3, y))]);
      pts.push(new THREE.Vector2(-0.5, hL));
      return extrudeUnit(new THREE.Shape(pts));
    },
    // Khối lành bị sứt mép phía cạnh khối vỡ (vết gãy lan sang)
    biteR(mirror) {
      const y0 = rand(-0.45, -0.1), y1 = rand(0.15, 0.5), d = rand(0.12, 0.3);
      let pts = [new THREE.Vector2(-0.5, -0.5), new THREE.Vector2(0.5, -0.5), new THREE.Vector2(0.5, y0)];
      jagged(pts, 0.5 - d * 0.4, y0, 0.5 - d, (y0 + y1) / 2, 3, 0.06, cl);
      jagged(pts, 0.5 - d, (y0 + y1) / 2, 0.5 - d * 0.3, y1, 3, 0.06, cl);
      pts.push(new THREE.Vector2(0.5, y1), new THREE.Vector2(0.5, 0.5), new THREE.Vector2(-0.5, 0.5));
      // Soi gương đường viền trước khi đùn (giữ chiều quấn tam giác đúng)
      if (mirror) pts = pts.map(v => new THREE.Vector2(-v.x, v.y)).reverse();
      return extrudeUnit(new THREE.Shape(pts));
    },
    biteL() { return FRACTURE.biteR(true); },
    // Khuyết vỡ trên nhiều cạnh cùng lúc (sides: chuỗi 'L' 'R' 'T'): mép gãy ăn sâu không đều, không còn cạnh thẳng
    bite(sides) {
      const L = sides.includes('L'), R = sides.includes('R'), T = sides.includes('T');
      const topR = T ? rand(0.05, 0.3) : 0.5, topL = T ? rand(0.05, 0.3) : 0.5;
      const dR = R ? rand(0.2, L ? 0.42 : 0.55) : 0, dL = L ? rand(0.2, R ? 0.42 : 0.55) : 0;
      const pts = [new THREE.Vector2(-0.5, -0.5), new THREE.Vector2(0.5, -0.5)];
      const notch = (x, yA, yB, d, sgn) => {
        // khuyết lõm vào trong từ cạnh x (sgn = -1: cạnh phải lõm sang trái)
        const mid = (yA + yB) / 2 + rand(-0.1, 0.1) * (yB - yA);
        jagged(pts, x + sgn * d * rand(0.15, 0.4), yA, x + sgn * d, mid, 4, 0.07, cl);
        pts.push(new THREE.Vector2(x + sgn * d * rand(0.85, 1.05), mid));
        jagged(pts, x + sgn * d, mid, x + sgn * d * rand(0.2, 0.5), yB, 4, 0.07, cl);
      };
      if (R) {
        const y0 = rand(-0.45, -0.1), y1 = T ? topR : rand(Math.max(y0 + 0.35, 0.2), 0.5);
        pts.push(new THREE.Vector2(0.5, y0));
        notch(0.5, y0, y1, dR, -1);
        if (!T) pts.push(new THREE.Vector2(0.5, y1));
      }
      if (T) {
        const x0 = 0.5 - (R ? dR * 0.3 : 0), x1 = -0.5 + (L ? dL * 0.3 : 0);
        if (!R) pts.push(new THREE.Vector2(0.5, topR));
        jagged(pts, x0, topR, x1, topL, 7, 0.1, (x, y) => [Math.max(-0.5, Math.min(0.5, x)), Math.max(-0.2, Math.min(0.5, y))]);
        if (!L) pts.push(new THREE.Vector2(-0.5, topL));
      } else {
        pts.push(new THREE.Vector2(0.5, 0.5), new THREE.Vector2(-0.5, 0.5));
      }
      if (L) {
        const y1 = T ? topL : rand(0.2, 0.5), y0 = rand(-0.45, Math.min(-0.1, y1 - 0.35));
        if (!T) pts.push(new THREE.Vector2(-0.5, y1));
        notch(-0.5, y1, y0, dL, 1);
        pts.push(new THREE.Vector2(-0.5, y0));
      }
      return extrudeUnit(new THREE.Shape(pts));
    },
    biteT() {
      const pts = [new THREE.Vector2(-0.5, -0.5), new THREE.Vector2(0.5, -0.5), new THREE.Vector2(0.5, rand(0.25, 0.5))];
      jagged(pts, 0.5, 0.35, -0.5, 0.35, 6, 0.12, cl);
      pts.push(new THREE.Vector2(-0.5, rand(0.25, 0.5)));
      return extrudeUnit(new THREE.Shape(pts));
    }
  };
  // Cốt thép lòi ra: bó thanh thép cong queo (đặt trên mép gãy / chạy ngang qua lỗ thủng)
  function rebarGeo(kind) {
    const parts = [];
    if (kind === 'stub') {
      for (let i = 0; i < 4; i++) {
        const x = -0.36 + i * 0.24 + rand(-0.04, 0.04);
        const h = rand(0.25, 0.6);
        const bend = rand(-0.9, 0.9);
        const a = place(new THREE.CylinderGeometry(0.018, 0.018, h, 4), [x, h / 2, 0]);
        const b = place(new THREE.CylinderGeometry(0.016, 0.016, h * 0.6, 4), [0, h * 0.3, 0]);
        b.applyMatrix4(new THREE.Matrix4().makeRotationZ(bend)); b.translate(x, h, 0);
        parts.push(a, b);
      }
    } else {
      for (let i = -1; i <= 1; i++) {
        parts.push(place(new THREE.CylinderGeometry(0.016, 0.016, 1, 4), [i * 0.22 + rand(-0.03, 0.03), 0, rand(-0.1, 0.1)], [0, 0, rand(-0.25, 0.25)]));
        parts.push(place(new THREE.CylinderGeometry(0.016, 0.016, 1, 4), [0, i * 0.22 + rand(-0.03, 0.03), rand(-0.1, 0.1)], [0, 0, Math.PI / 2 + rand(-0.2, 0.2)]));
      }
    }
    return merge(parts);
  }
  const REBAR_MAT = () => (TEX.__rebarMat || (TEX.__rebarMat = new THREE.MeshStandardMaterial({ color: 0x6b3f22, roughness: 0.8, metalness: 0.5 })));

  /**
   * Bộ khối có thể vỡ theo nhiều trạng thái: nguyên / sứt mép / thủng lỗ / gốc gãy.
   * Mỗi trạng thái + biến thể = 1 InstancedMesh -> không tăng draw call theo số khối.
   */
  class FractureKit {
    constructor(parent, intactMat, brokenMat, cap, opts = {}) {
      this.pools = {};
      const box = new THREE.BoxGeometry(1, 1, 1);
      this.pools.box = new Pool(parent, box, intactMat, cap, { color: true });
      this.variants = {};
      this.parent = parent; this.intactMat = intactMat; this.brokenMat = brokenMat; this.cap = cap;
      this.vN = opts.variants || 3;
      for (const t of ['holed', 'remnant']) this.makeVariants(t);
      this.rebarStub = new Pool(parent, rebarGeo('stub'), REBAR_MAT(), Math.ceil(cap * 0.6) + 4, { castShadow: false });
      this.rebarGrid = new Pool(parent, rebarGeo('grid'), REBAR_MAT(), Math.ceil(cap * 0.6) + 4, { castShadow: false });
    }
    makeVariants(type) {
      const list = this.variants[type] = [];
      const broken = type === 'holed' || type === 'remnant';
      // Sứt mép 1 cạnh hay gặp nhất -> nhiều instance; ghép nhiều cạnh ít hơn
      const cap = Math.ceil(this.cap / this.vN * (type.length > 5 ? 0.5 : 1)) + 4;
      for (let v = 0; v < this.vN; v++) {
        const geo = FRACTURE[type] ? FRACTURE[type]() : FRACTURE.bite(type.slice(4));
        list.push(new Pool(this.parent, geo, broken ? this.brokenMat : this.intactMat, cap, { color: true }));
      }
      return list;
    }
    poolFor(type) {
      if (type === 'box') return this.pools.box;
      const list = this.variants[type] || this.makeVariants(type);
      return list[Math.floor(RNG() * list.length)];
    }
    add(type, matrix, color) {
      if (type === 'biteL' || type === 'biteR' || type === 'biteT') type = 'bite' + type.slice(4);
      const pool = this.poolFor(type);
      const idx = pool.add(matrix, color);
      if (idx < 0) return null;
      const h = { type, pool, idx, m: matrix.clone(), c: color ? color.clone() : new THREE.Color(1, 1, 1), extra: [] };
      if (type === 'remnant') { const r = this.rebarStub.add(matrix); if (r >= 0) h.extra.push([this.rebarStub, r]); }
      if (type === 'holed') { const r = this.rebarGrid.add(matrix); if (r >= 0) h.extra.push([this.rebarGrid, r]); }
      return h;
    }
    hide(h) {
      if (!h) return;
      h.pool.hide(h.idx);
      for (const [p, i] of h.extra) p.hide(i);
      h.extra.length = 0;
    }
    // Đổi trạng thái hiển thị của khối (giữ nguyên vị trí / kích thước)
    swap(h, type, color) {
      if (!h) return null;
      this.hide(h);
      const n = this.add(type, h.m, color || h.c);
      this.commit();
      return n || h;
    }
    color(h, c) { if (h) h.pool.color(h.idx, c); }
    commit() {
      this.pools.box.commit();
      for (const t in this.variants) for (const p of this.variants[t]) p.commit();
      this.rebarStub.commit(); this.rebarGrid.commit();
    }
  }

  // Bụi / đá vụn dùng hệ hạt của ExplosionFX nếu có
  function dustBurst(fx, x, y, z, n, size, col) {
    if (!fx || !fx.smoke) return;
    for (let i = 0; i < n; i++) {
      fx.smoke.add({
        x: x + rand(-size, size) * 0.4, y: y + rand(0, size * 0.3), z: z + rand(-size, size) * 0.4,
        vx: rand(-14, 14), vy: rand(4, 22), vz: rand(-14, 14), size: size * rand(0.5, 0.9), grow: size * 0.5,
        drag: 1.6, grav: -1.2, life: rand(3, 6), alpha: 0.6, fadeIn: 0.08, c0: col || [0.7, 0.68, 0.64], cell: 2
      });
    }
  }
  function chunks(fx, x, y, z, n, sz, col, up) {
    if (!fx || !fx.hardRocks) return;
    for (let i = 0; i < n; i++) {
      const a = RNG() * 6.283, sp = rand(15, 60);
      fx.hardRocks.add({ x: x + rand(-2, 2), y: y + rand(-1, 2), z: z + rand(-2, 2), vx: Math.cos(a) * sp, vy: rand(10, up || 45), vz: Math.sin(a) * sp, size: rand(sz * 0.25, sz * 0.6), life: rand(3, 6), c: col || [0.62, 0.6, 0.56] });
    }
  }

  // ===========================================================================
  // CÂY
  // ===========================================================================
  const TREE_COLORS = {
    ok: new THREE.Color(1, 1, 1),
    scorched: new THREE.Color(0.55, 0.42, 0.25),
    charred: new THREE.Color(0.12, 0.1, 0.09)
  };

  function buildTreeVariant(kind) {
    // trả { trunk: geometry, crown: geometry|null, crownMat, trunkMat, height }
    const T = [], C = [];
    let crownKind = 'broad', height = 40, barkKind = 'oak';
    if (kind === 'palm') {
      barkKind = 'palm'; crownKind = 'frond'; height = 52;
      let x = 0, y = 0, z = 0;
      const lean = rand(0.08, 0.22);
      for (let i = 0; i < 8; i++) {
        const seg = place(new THREE.CylinderGeometry(1.25 - i * 0.06, 1.35 - i * 0.06, 6.5, 7, 1, true), [x, y + 3.25, z], [0, 0, -lean * (i / 8)]);
        T.push(seg);
        x += Math.sin(lean * (i / 8)) * 6.5; y += Math.cos(lean * (i / 8)) * 6.5;
      }
      const top = [x, y, z];
      for (let f = 0; f < 11; f++) {
        const a = (f / 11) * Math.PI * 2 + rand(-0.2, 0.2);
        const droop = rand(0.5, 1.1);
        // Tàu lá: dải cong 4 đốt rủ xuống
        let px = top[0], py = top[1], pz = top[2];
        for (let s = 0; s < 4; s++) {
          const pitch = -0.25 + s * droop * 0.38;
          const len = 5.5;
          const g = new THREE.PlaneGeometry(4.2 - s * 0.6, len);
          g.translate(0, len / 2, 0);
          // UV dọc tàu lá theo đốt
          const uv = g.attributes.uv;
          for (let i = 0; i < uv.count; i++) uv.setY(i, (uv.getY(i) + s) / 4);
          C.push(place(g, [px, py, pz], [Math.PI / 2 + pitch, 0, 0], 1));
          // xoay quanh trục đứng theo hướng tàu lá
          const last = C[C.length - 1];
          last.translate(-px, -py, -pz);
          last.applyMatrix4(new THREE.Matrix4().makeRotationY(a));
          last.translate(px, py, pz);
          px += Math.sin(a) * Math.cos(pitch) * len; pz += Math.cos(a) * Math.cos(pitch) * len; py -= Math.sin(pitch) * len;
        }
      }
      for (let k = 0; k < 4; k++) C.push(place(new THREE.SphereGeometry(0.9, 6, 4), [top[0] + rand(-1, 1), top[1] - 1, top[2] + rand(-1, 1)]));
    } else if (kind === 'pine') {
      barkKind = 'pine'; crownKind = 'needle'; height = 58;
      T.push(place(new THREE.CylinderGeometry(0.6, 1.6, 50, 7), [0, 25, 0]));
      for (let i = 0; i < 6; i++) {
        const r = 11 - i * 1.6, hh = 13 - i * 0.8;
        C.push(jitter(place(new THREE.ConeGeometry(r, hh, 9, 1, true), [0, 14 + i * 7, 0], [0, i * 0.7, 0]), 0.18, i));
      }
    } else if (kind === 'cypress') {
      barkKind = 'oak'; crownKind = 'needle'; height = 46;
      T.push(place(new THREE.CylinderGeometry(0.7, 1.2, 14, 6), [0, 7, 0]));
      C.push(jitter(place(new THREE.SphereGeometry(6, 9, 10), [0, 26, 0], null, [1, 3.1, 1]), 0.2, 3));
    } else if (kind === 'cactus') {
      barkKind = 'cactus'; crownKind = null; height = 22;
      T.push(place(new THREE.CylinderGeometry(1.6, 1.8, 20, 10), [0, 10, 0]), place(new THREE.SphereGeometry(1.6, 10, 5, 0, 6.3, 0, Math.PI / 2), [0, 20, 0]));
      for (const s of [-1, 1]) {
        if (RNG() < 0.8) {
          const h0 = rand(6, 11);
          T.push(place(new THREE.CylinderGeometry(1.0, 1.0, 4, 8), [s * 3, h0, 0], [0, 0, Math.PI / 2]));
          T.push(place(new THREE.CylinderGeometry(1.0, 1.1, 7, 8), [s * 5, h0 + 3.4, 0]), place(new THREE.SphereGeometry(1.0, 8, 4, 0, 6.3, 0, Math.PI / 2), [s * 5, h0 + 6.9, 0]));
        }
      }
    } else if (kind === 'deadTree') {
      barkKind = 'dead'; crownKind = null; height = 34;
      T.push(place(new THREE.CylinderGeometry(0.7, 1.7, 26, 6), [0, 13, 0], [0, 0, rand(-0.1, 0.1)]));
      for (let b = 0; b < 5; b++) {
        const y = rand(12, 24), a = rand(0, 6.28), L = rand(7, 13);
        const br = place(new THREE.CylinderGeometry(0.2, 0.55, L, 5), [0, L / 2, 0]);
        br.applyMatrix4(new THREE.Matrix4().makeRotationZ(rand(0.6, 1.1)));
        br.applyMatrix4(new THREE.Matrix4().makeRotationY(a));
        br.translate(0, y, 0);
        T.push(br);
      }
    } else if (kind === 'acacia') {
      barkKind = 'oak'; crownKind = 'dry'; height = 30;
      T.push(place(new THREE.CylinderGeometry(0.8, 1.4, 16, 6), [0, 8, 0], [0, 0, 0.12]));
      for (const s of [-1, 1]) {
        const br = place(new THREE.CylinderGeometry(0.4, 0.7, 12, 5), [0, 6, 0]);
        br.applyMatrix4(new THREE.Matrix4().makeRotationZ(s * 0.7)); br.translate(0, 13, 0); T.push(br);
      }
      for (let k = 0; k < 6; k++) C.push(jitter(place(new THREE.SphereGeometry(6, 8, 5), [rand(-9, 9), 23 + rand(-1, 1.5), rand(-9, 9)], null, [1.4, 0.35, 1.4]), 0.25, k));
    } else if (kind === 'willow') {
      barkKind = 'oak'; crownKind = 'broad'; height = 34;
      T.push(place(new THREE.CylinderGeometry(1.0, 1.9, 18, 7), [0, 9, 0]));
      for (let k = 0; k < 7; k++) C.push(jitter(place(new THREE.SphereGeometry(7, 9, 7), [rand(-7, 7), 22 + rand(-2, 3), rand(-7, 7)], null, [1, 1.35, 1]), 0.3, k));
      for (let k = 0; k < 10; k++) { const a = (k / 10) * 6.28; C.push(place(new THREE.ConeGeometry(4, 16, 6, 1, true), [Math.cos(a) * 9, 15, Math.sin(a) * 9], [Math.PI, 0, 0])); }
    } else if (kind === 'jungle') {
      barkKind = 'oak'; crownKind = 'jungle'; height = 64;
      T.push(place(new THREE.CylinderGeometry(1.0, 2.0, 46, 7), [0, 23, 0]));
      for (let r = 0; r < 4; r++) { const a = r * 1.57 + 0.4; T.push(place(new THREE.BoxGeometry(0.5, 7, 4), [Math.cos(a) * 2.2, 3, Math.sin(a) * 2.2], [0, -a, 0])); }
      for (let k = 0; k < 7; k++) C.push(jitter(place(new THREE.SphereGeometry(8, 9, 6), [rand(-10, 10), 48 + rand(-3, 5), rand(-10, 10)], null, [1.3, 0.55, 1.3]), 0.3, k));
    } else {
      // Cây lá rộng (bàng / sồi): thân + 3 cành + tán nhiều khối
      barkKind = 'oak'; crownKind = 'broad'; height = 40;
      T.push(place(new THREE.CylinderGeometry(1.0, 1.8, 18, 7), [0, 9, 0]));
      for (let b = 0; b < 3; b++) {
        const br = place(new THREE.CylinderGeometry(0.45, 0.8, 11, 5), [0, 5.5, 0]);
        br.applyMatrix4(new THREE.Matrix4().makeRotationZ(rand(0.4, 0.8)));
        br.applyMatrix4(new THREE.Matrix4().makeRotationY(b * 2.1 + rand(-0.3, 0.3)));
        br.translate(0, 15, 0); T.push(br);
      }
      for (let k = 0; k < 8; k++) C.push(jitter(place(new THREE.IcosahedronGeometry(7, 1), [rand(-8, 8), 27 + rand(-4, 6), rand(-8, 8)], null, rand(0.8, 1.2)), 0.35, k));
    }
    return { trunk: merge(T), crown: C.length ? merge(C) : null, crownKind, barkKind, height };
  }

  // Cây to cao như thật (so với xe): hệ số phóng theo loại; thân cây (bán kính gốc, phần thân / chiều cao) chặn đạn
  const TREE_SCALE = { cactus: 1.0, deadTree: 1.3 };
  const TRUNK = {
    palm: [1.3, 0.9], pine: [1.4, 0.85], cypress: [1.0, 0.3], cactus: [1.7, 0.9], deadTree: [1.4, 0.75],
    acacia: [1.2, 0.5], willow: [1.6, 0.5], jungle: [1.7, 0.72], broadleaf: [1.5, 0.45]
  };
  // Trọng số che khuất của 1 cây (tán dày = 1; cây khô / mất tán chỉ còn thân = ít)
  const SCREEN = { cactus: 0, deadTree: 0.35 };
  const DC = 24;                 // ô lưới mật độ tán (đơn vị thế giới)

  class TreeField {
    constructor(parent, trees, groundAt) {
      this.group = new THREE.Group();
      this.group.name = 'trees';
      parent.add(this.group);
      this.groundAt = groundAt;
      this.items = [];
      this.burning = [];
      this.falling = [];
      this.grid = new Map();
      this.swaying = [];
      this.smouldering = [];
      // Gom theo loại -> 2 biến thể hình học / loại cho đỡ đơn điệu
      const byKind = {};
      for (const t of trees) (byKind[t.kind] || (byKind[t.kind] = [])).push(t);
      this.kinds = {};
      for (const kind in byKind) {
        const list = byKind[kind];
        const variants = [buildTreeVariant(kind), buildTreeVariant(kind)];
        const vs = variants.map(v => {
          const trunkMat = new THREE.MeshStandardMaterial({ map: barkTex(v.barkKind), roughness: 0.95, metalness: 0 });
          let crownMat = null;
          if (v.crown) {
            const transparent = v.crownKind === 'frond';
            crownMat = new THREE.MeshStandardMaterial({
              map: leafTex(v.crownKind), alphaTest: 0.45, transparent: false, side: THREE.DoubleSide,
              roughness: 0.85, metalness: 0
            });
            void transparent;
          }
          const n = list.length;
          return {
            info: v,
            trunk: new Pool(this.group, v.trunk, trunkMat, n, { color: true }),
            crown: v.crown ? new Pool(this.group, v.crown, crownMat, n, { color: true }) : null
          };
        });
        this.kinds[kind] = vs;
        list.forEach((t, k) => {
          const V = vs[k % 2];
          const gy = groundAt(t.x, t.z);
          const s = t.s * (TREE_SCALE[kind] !== undefined ? TREE_SCALE[kind] : 1.6);
          const m = new THREE.Matrix4().compose(new THREE.Vector3(t.x, gy - 0.6, t.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.rot), new THREE.Vector3(s, s, s));
          const tint = new THREE.Color(1, 1, 1).multiplyScalar(rand(0.85, 1.08));
          const item = {
            x: t.x, z: t.z, y: gy, kind, s, V, rot: t.rot, height: V.info.height * s,
            ti: V.trunk.add(m, tint), ci: V.crown ? V.crown.add(m, tint) : -1,
            base: m.clone(), tint, heat: 0, state: 'ok', burnT: 0
          };
          const tk = TRUNK[kind] || [1.4, 0.6];
          item.trunkR = tk[0] * s; item.trunkH = item.height * tk[1];
          item._dw = 0;
          this.items.push(item);
          this.reweigh(item);
          const key = this.key(t.x, t.z);
          if (!this.grid.has(key)) this.grid.set(key, []);
          this.grid.get(key).push(item);
        });
        vs.forEach(V => { V.trunk.commit(); if (V.crown) V.crown.commit(); });
      }
    }
    key(x, z) { return Math.floor(x / 60) * 1000 + Math.floor(z / 60); }

    // ---- MẬT ĐỘ TÁN CÂY (rừng rậm che tầm nhìn): lưới ô DC, cập nhật khi cây đổ / trụi lá / cháy rụi
    reweigh(it) {
      if (!this.dens) this.dens = new Map();
      const w = it.fallen ? 0 : (it.crownGone || it.state === 'burnt') ? 0.2 : (SCREEN[it.kind] !== undefined ? SCREEN[it.kind] : 1);
      if (w === it._dw) return;
      const k = Math.floor(it.x / DC) * 100000 + Math.floor(it.z / DC);
      this.dens.set(k, (this.dens.get(k) || 0) + w - it._dw);
      it._dw = w;
    }
    /** Số cây có tán (quy đổi) trong ô 3x3 (~72x72) quanh điểm. >= ~10: rừng rậm */
    densityAt(x, z) {
      if (!this.dens) return 0;
      const i = Math.floor(x / DC), j = Math.floor(z / DC);
      let n = 0;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) n += this.dens.get((i + a) * 100000 + j + b) || 0;
      return n;
    }
    /** Quãng đường đi xuyên rừng rậm giữa 2 điểm (dừng sớm khi vượt `limit`) */
    denseLength(ax, az, bx, bz, limit, thr) {
      const L = Math.hypot(bx - ax, bz - az), step = 12, n = Math.ceil(L / step);
      if (!n) return 0;
      let acc = 0;
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        if (this.densityAt(ax + (bx - ax) * t, az + (bz - az) * t) >= thr) { acc += L / n; if (acc > limit) return acc; }
      }
      return acc;
    }
    /** Đoạn bay đạn cắt thân cây đang đứng -> điểm chạm gần nhất { x, y, z, t, it } (tán lá thì đạn xuyên qua) */
    trunkHit(ax, ay, az, bx, by, bz) {
      const minX = Math.min(ax, bx) - 4, maxX = Math.max(ax, bx) + 4, minZ = Math.min(az, bz) - 4, maxZ = Math.max(az, bz) + 4;
      if ((maxX - minX) > 600 || (maxZ - minZ) > 600) return null;
      let best = null;
      for (let gx = Math.floor(minX / 60); gx <= Math.floor(maxX / 60); gx++) {
        for (let gz = Math.floor(minZ / 60); gz <= Math.floor(maxZ / 60); gz++) {
          const l = this.grid.get(gx * 1000 + gz);
          if (!l) continue;
          for (const it of l) {
            if (it.fallen || it.x < minX - it.trunkR || it.x > maxX + it.trunkR || it.z < minZ - it.trunkR || it.z > maxZ + it.trunkR) continue;
            // giao đoạn bay (2D) với vòng thân; đầu đoạn đã nằm trong thân thì bỏ qua (nòng sát gốc cây)
            const dx = bx - ax, dz = bz - az, fx = ax - it.x, fz = az - it.z;
            const qa = dx * dx + dz * dz, qb = 2 * (fx * dx + fz * dz), qc = fx * fx + fz * fz - it.trunkR * it.trunkR;
            if (qa < 1e-9 || qc <= 0) continue;
            const disc = qb * qb - 4 * qa * qc;
            if (disc < 0) continue;
            const t = (-qb - Math.sqrt(disc)) / (2 * qa);
            if (t < 0 || t > 1 || (best && t >= best.t)) continue;
            const y = ay + (by - ay) * t;
            if (y < it.y - 1 || y > it.y + it.trunkH) continue;
            best = { t, x: ax + (bx - ax) * t, y, z: az + (bz - az) * t, it };
          }
        }
      }
      return best;
    }
    near(x, z, r) {
      const out = [];
      const x0 = Math.floor((x - r) / 60), x1 = Math.floor((x + r) / 60), z0 = Math.floor((z - r) / 60), z1 = Math.floor((z + r) / 60);
      for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) {
        const l = this.grid.get(i * 1000 + j);
        if (l) for (const it of l) if (Math.hypot(it.x - x, it.z - z) <= r) out.push(it);
      }
      return out;
    }
    setColor(it, c) {
      it.V.trunk.color(it.ti, c);
      if (it.ci >= 0) it.V.crown.color(it.ci, c);
    }
    // Nhiệt + sóng nổ tác động lên cây quanh điểm nổ
    damageAt(x, y, z, ammo, heavy, fx) {
      const A = ammoInfo(ammo, heavy);
      const blasty = A.power >= 0.5;
      // Sóng nổ lan xa hơn vùng sát thương: cây rung lắc theo khoảng cách
      const Rw = blasty ? A.radius * 5 + 20 : A.radius * 2 + 6;
      const R = A.radius * 2.2 + 6;
      for (const it of this.near(x, z, Rw)) {
        const d = Math.hypot(it.x - x, it.z - z);
        const kw = 1 - d / Rw;
        if (!it.fallen) this.push(it, it.x - x, it.z - z, (blasty ? 0.55 : 0.08) * kw * kw * A.power);
        if (d > R) continue;
        if (it.fallen && it.heat > 2) continue;
        const k = 1 - d / R;
        it.heat += k * A.heat * (A.fire ? 2.2 : 1) * (heavy ? 1.5 : 1);
        // Đạn nổ mạnh sát gốc: lửa nổ bén cháy rụi cả cây
        if (blasty && d < A.radius * 1.3) it.heat = Math.max(it.heat, 1.7 + k);
        // Quật đổ: sóng nổ mạnh sát gốc / trúng trực tiếp (đổ xong vẫn tiếp tục cháy)
        if (!it.fallen && (k * A.power > 0.85 || (d < A.radius * 0.8 && A.power > 0.5))) this.fell(it, it.x - x, it.z - z, fx);
        if (blasty && k > 0.3) this.stripLeaves(it, 0.35 * k, x, y, z, fx);
        this.refreshLook(it, fx);
      }
    }

    // Lực đẩy làm cây nghiêng rồi đung đưa tắt dần (lò xo + giảm chấn), cây to dao động chậm hơn
    push(it, dx, dz, mag) {
      if (mag < 0.003) return;
      const l = Math.hypot(dx, dz) || 1;
      if (!it.sw) it.sw = { ax: 0, az: 0, vx: 0, vz: 0 };
      // nghiêng ra xa tâm nổ: quay quanh trục vuông góc hướng đẩy
      it.sw.vx += (dz / l) * mag * 6;
      it.sw.vz += (-dx / l) * mag * 6;
      if (!it.swaying) { it.swaying = true; this.swaying.push(it); }
    }

    // Lá & cành bị xé rụng (mảnh đạn / sóng nổ / đạn bay xuyên tán)
    stripLeaves(it, amount, x, y, z, fx) {
      if (it.ci < 0 || it.crownGone) return;
      it.leaves = (it.leaves === undefined ? 1 : it.leaves) - amount;
      if (fx && fx.smoke) {
        const leafC = it.state === 'ok' ? [0.32, 0.42, 0.18] : [0.45, 0.36, 0.2];
        for (let i = 0; i < Math.round(4 + amount * 20); i++) {
          fx.smoke.add({ x: it.x + rand(-6, 6) * it.s, y: it.y + it.height * rand(0.55, 0.95), z: it.z + rand(-6, 6) * it.s,
            vx: rand(-8, 8), vy: rand(-2, 6), vz: rand(-8, 8), size: rand(0.6, 1.3), grow: 0, drag: 2.2, grav: 18, life: rand(2, 3.5), alpha: 0.95, fadeIn: 0.01, c0: leafC, cell: 2 });
        }
      }
      if (it.leaves < 0.25) {
        // Trơ cành: tán lá bị xé sạch
        it.crownGone = true;
        this.reweigh(it);
        it.V.crown.hide(it.ci);
        sfx('treeFall', it.x, it.y, it.z, 0.4);
      } else {
        it.V.crown.color(it.ci, (it.state === 'ok' ? it.tint : TREE_COLORS.scorched).clone().multiplyScalar(0.75 + 0.25 * it.leaves));
      }
    }

    // Đạn bay sượt / xuyên qua tán cây: lá rơi, cây rung, cành gãy; đạn cháy / vạch đường làm bén lửa
    passSegment(ax, ay, az, bx, by, bz, ammo, fx) {
      const minX = Math.min(ax, bx) - 14, maxX = Math.max(ax, bx) + 14, minZ = Math.min(az, bz) - 14, maxZ = Math.max(az, bz) + 14;
      if ((maxX - minX) > 800 || (maxZ - minZ) > 800) return;
      const A = ammoInfo(ammo, false);
      for (let gx = Math.floor(minX / 60); gx <= Math.floor(maxX / 60); gx++) {
        for (let gz = Math.floor(minZ / 60); gz <= Math.floor(maxZ / 60); gz++) {
          const l = this.grid.get(gx * 1000 + gz);
          if (!l) continue;
          for (const it of l) {
            if (it.fallen) continue;
            // khoảng cách đoạn bay tới trục thân cây (2D) + độ cao trong tán
            const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
            const t = L2 > 0 ? Math.max(0, Math.min(1, ((it.x - ax) * dx + (it.z - az) * dz) / L2)) : 0;
            const px = ax + dx * t, pz = az + dz * t, py = ay + (by - ay) * t;
            const dist = Math.hypot(it.x - px, it.z - pz);
            const crownR = (it.kind === 'cypress' ? 5 : it.kind === 'cactus' ? 2 : 9) * it.s;
            if (dist > crownR || py < it.y + 2 || py > it.y + it.height * 1.05) continue;
            if (it._lastHitT && performance.now() - it._lastHitT < 40) continue;
            it._lastHitT = performance.now();
            const big = A.power >= 0.5;
            this.push(it, dx, dz, big ? 0.12 : 0.025);
            this.stripLeaves(it, big ? 0.28 : 0.04, px, py, pz, fx);
            if (ammo === 'INCENDIARY') it.heat += 0.9;
            else if (ammo === 'GATLING_BULLET') it.heat += 0.12;   // đầu đạn nổ-cháy 30mm
            else if (ammo === 'RPG' || ammo === 'ANTI_TANK_MISSILE') it.heat += 0.5; // lửa đuôi tên lửa
            this.refreshLook(it, fx);
          }
        }
      }
    }

    refreshLook(it, fx) {
      if (it.heat > 1.6 && it.state !== 'burnt') {
        // Cháy rụi: lá cháy hết, trơ thân đen
        if (it.state !== 'burning') { it.state = 'burning'; it.burnT = rand(6, 11); this.burning.push(it); sfx('fire', it.x, it.y, it.z, 0.8); }
      } else if (it.heat > 0.55 && it.state === 'ok') {
        it.state = 'scorched';
        const c = TREE_COLORS.scorched.clone().multiplyScalar(rand(0.85, 1.1));
        if (it.ci >= 0) it.V.crown.color(it.ci, c);
        it.V.trunk.color(it.ti, new THREE.Color(0.5, 0.45, 0.4));
      }
      void fx;
    }
    fell(it, dx, dz, fx) {
      if (it.fallen) return;
      it.fallen = true;
      this.reweigh(it);
      const len = Math.hypot(dx, dz) || 1;
      it.fall = { ax: dz / len, az: -dx / len, t: 0, dur: rand(1.1, 1.8) };
      this.falling.push(it);
      dustBurst(fx, it.x, it.y, it.z, 2, 8, [0.6, 0.55, 0.45]);
      sfx('treeFall', it.x, it.y, it.z, Math.min(1.2, it.height / 40));
    }
    // Xe húc đổ cây khi chạy qua
    crush(x, z, r, vx, vz, fx) {
      if (Math.hypot(vx, vz) < 6) return;
      for (const it of this.near(x, z, r)) {
        if (it.fallen || it.kind === 'cactus' && RNG() < 0.5) continue;
        this.fell(it, vx, vz, fx);
      }
    }
    update(dt, fx) {
      for (let i = this.smouldering.length - 1; i >= 0; i--) {
        const it = this.smouldering[i];
        it.smoulder -= dt;
        if (it.smoulder <= 0) { this.smouldering.splice(i, 1); continue; }
        if (fx && fx.smoke && RNG() < dt * 3) {
          const g = rand(0.2, 0.32);
          fx.smoke.add({ x: it.x + rand(-1, 1), y: it.y + it.height * rand(0.2, 0.6), z: it.z + rand(-1, 1), vx: rand(-1.5, 1.5), vy: rand(5, 9), vz: rand(-1.5, 1.5),
            size: rand(2, 3.5), grow: 4, drag: 0.6, grav: -2, life: rand(3, 5), alpha: 0.35, fadeIn: 0.3, c0: [g, g, g], cell: 0, floor: false });
        }
      }
      // Cây đung đưa sau sóng nổ / đạn bay qua
      for (let i = this.swaying.length - 1; i >= 0; i--) {
        const it = this.swaying[i];
        if (it.fallen) { it.swaying = false; this.swaying.splice(i, 1); continue; }
        const W = it.sw, k = 30 / Math.max(0.6, it.s * it.height / 40), c = 2.2;
        const n = Math.max(1, Math.ceil(dt / 0.01)), h = dt / n;
        for (let q = 0; q < n; q++) {
          W.vx += (-k * W.ax - c * W.vx) * h; W.vz += (-k * W.az - c * W.vz) * h;
          W.ax += W.vx * h; W.az += W.vz * h;
        }
        W.ax = Math.max(-0.5, Math.min(0.5, W.ax)); W.az = Math.max(-0.5, Math.min(0.5, W.az));
        const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(W.ax, 0, W.az)).multiply(new THREE.Matrix4().makeRotationY(it.rot));
        m.scale(new THREE.Vector3(it.s, it.s, it.s)).setPosition(it.x, it.y - 0.6, it.z);
        it.V.trunk.set(it.ti, m);
        if (it.ci >= 0 && !it.crownGone) it.V.crown.set(it.ci, m);
        if (Math.abs(W.ax) + Math.abs(W.az) + Math.abs(W.vx) * 0.1 + Math.abs(W.vz) * 0.1 < 0.002) {
          it.swaying = false; this.swaying.splice(i, 1);
          W.ax = W.az = W.vx = W.vz = 0;
          it.V.trunk.set(it.ti, it.base); if (it.ci >= 0 && !it.crownGone) it.V.crown.set(it.ci, it.base);
        }
      }
      for (let i = this.falling.length - 1; i >= 0; i--) {
        const it = this.falling[i];
        const F = it.fall;
        F.t += dt;
        const p = Math.min(1, F.t / F.dur);
        const ang = (Math.PI / 2 - 0.06) * p * p;
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(F.ax, 0, F.az), ang);
        const m = new THREE.Matrix4().makeRotationFromQuaternion(q).multiply(new THREE.Matrix4().makeRotationY(it.rot));
        m.scale(new THREE.Vector3(it.s, it.s, it.s));
        m.setPosition(it.x, it.y - 0.6, it.z);
        it.V.trunk.set(it.ti, m);
        if (it.ci >= 0) { if (it.crownGone) it.V.crown.hide(it.ci); else it.V.crown.set(it.ci, m); }
        if (p >= 1) {
          this.falling.splice(i, 1);
          dustBurst(fx, it.x + F.az * -it.height * 0.6, it.y, it.z + F.ax * it.height * 0.6, 3, 10, [0.62, 0.56, 0.46]);
        }
      }
      for (let i = this.burning.length - 1; i >= 0; i--) {
        const it = this.burning[i];
        it.burnT -= dt;
        // Tiếng cây cháy: nguồn âm liên tục khi tán lá còn cháy (lá khô nổ lách tách nhiều), báo 2 lần/giây
        it.sndT = (it.sndT || 0) - dt;
        if (it.sndT <= 0 && typeof window !== 'undefined' && window.soundEngine && window.soundEngine.fireSource) {
          it.sndT = 0.5;
          window.soundEngine.fireSource(it, { x: it.x, y: it.y, z: it.z }, it.crownGone ? 0.45 : 0.8);
        }
        // Lửa liếm tán lá + khói đen
        if (fx && fx.fire && RNG() < dt * 9) {
          const h = it.fallen ? 3 : it.height * rand(0.55, 0.95);
          fx.fire.add({ x: it.x + rand(-4, 4), y: it.y + h, z: it.z + rand(-4, 4), vx: rand(-2, 2), vy: rand(8, 16), vz: rand(-2, 2), size: rand(4, 8), grow: -2, life: rand(0.4, 0.8), alpha: 0.95, fadeIn: 0.04, c0: [1, 0.7, 0.3], c1: [0.8, 0.25, 0.05], cell: 1, floor: false });
          fx.smoke.add({ x: it.x, y: it.y + h + 4, z: it.z, vx: rand(-3, 3), vy: rand(10, 18), vz: rand(-3, 3), size: rand(6, 10), grow: 7, drag: 0.6, grav: -3, life: rand(3, 5), alpha: 0.55, fadeIn: 0.2, c0: [0.1, 0.09, 0.08], c1: [0.3, 0.29, 0.28], cell: 0, floor: false });
        }
        // Lá cháy dần -> mất tán
        const prog = 1 - Math.max(0, it.burnT) / 9;
        if (it.ci >= 0 && !it.crownGone) it.V.crown.color(it.ci, TREE_COLORS.scorched.clone().lerp(TREE_COLORS.charred, clamp01(prog * 1.4)));
        if (prog > 0.6 && it.ci >= 0 && !it.crownGone) {
          it.crownGone = true;
          this.reweigh(it);
          it.V.crown.hide(it.ci);
          if (fx && fx.fire) for (let k = 0; k < 10; k++) fx.fire.add({ x: it.x + rand(-6, 6), y: it.y + it.height * 0.8, z: it.z + rand(-6, 6), vx: rand(-6, 6), vy: rand(-4, 10), vz: rand(-6, 6), size: rand(0.8, 1.6), grow: -0.5, drag: 0.6, grav: 30, life: rand(1, 2), alpha: 1, fadeIn: 0.01, c0: [1, 0.6, 0.2], c1: [0.6, 0.15, 0.02], cell: 3 });
        }
        if (it.burnT <= 0) {
          this.burning.splice(i, 1);
          // Cháy rụi: lá cháy sạch, trơ khung thân + cành than đen
          if (it.ci >= 0 && !it.crownGone) { it.crownGone = true; it.V.crown.hide(it.ci); }
          it.state = 'burnt';
          this.reweigh(it);
          it.V.trunk.color(it.ti, TREE_COLORS.charred);
          if (!it.fallen) this.push(it, rand(-1, 1), rand(-1, 1), 0.02);
          // Thân cây cháy rụi còn âm ỉ bốc khói một lúc lâu
          it.smoulder = rand(18, 30);
          this.smouldering.push(it);
        }
      }
    }
    reset() {
      for (const it of this.items) {
        it.heat = 0; it.state = 'ok'; it.fallen = false; it.crownGone = false; it.fall = null; it.leaves = 1; it.sw = null; it.swaying = false;
        it.V.trunk.set(it.ti, it.base); if (it.ci >= 0) it.V.crown.set(it.ci, it.base);
        this.setColor(it, it.tint);
      }
      this.burning.length = 0; this.falling.length = 0; this.swaying.length = 0; this.smouldering.length = 0;
    }
  }

  // ===========================================================================
  // NHÀ CỬA (mô-đun hóa)
  // ===========================================================================
  const STYLE = {
    office: { tex: 'office', colors: [0xb9c2c8, 0xa8b0b5, 0xc8c2b4], floorH: 13, bay: 15, roof: 'flat' },
    apartment: { tex: 'apt', colors: [0xe0d4bc, 0xd8c3a5, 0xc9cfd2, 0xe6d9c6, 0xc7b39a], floorH: 12, bay: 14, roof: 'flat' },
    shop: { tex: 'shop', colors: [0xe7dfcf, 0xd9c7aa, 0xcfc8be], floorH: 12, bay: 14, roof: 'flat' },
    ruin: { tex: 'apt', colors: [0x9c968c, 0x8e8a82], floorH: 12, bay: 14, roof: 'flat', ruined: true },
    mudbrick: { tex: 'adobe', colors: [0xffffff, 0xf0e6d6], floorH: 11, bay: 13, roof: 'flat' },
    stone: { tex: 'stone', colors: [0xffffff, 0xe8e4dc], floorH: 11, bay: 13, roof: 'pitched' },
    stilt: { tex: 'wood', colors: [0xffffff, 0xeadcc4], floorH: 10, bay: 12, roof: 'pitched' },
    farm: { tex: 'apt', colors: [0xf2ede2, 0xe9dcc4, 0xd7d2c7], floorH: 11, bay: 13, roof: 'pitched' },
    hangar: { tex: 'metal', colors: [0x9aa08e, 0xa7a99c, 0x8f9583], floorH: 22, bay: 18, roof: 'arched' }
  };

  class BuildingSet {
    constructor(parent, list, groundAt) {
      this.group = new THREE.Group();
      this.group.name = 'buildings';
      parent.add(this.group);
      this.groundAt = groundAt;
      this.items = [];
      this.anim = [];
      let panels = 0, slabs = 0, cols = 0, roofs = 0;
      const plans = list.map(b => {
        const st = STYLE[b.kind] || STYLE.apartment;
        const bx = Math.max(1, Math.round(b.w / st.bay)), bz = Math.max(1, Math.round(b.d / st.bay));
        const floors = b.kind === 'hangar' ? 1 : b.floors;
        panels += 2 * (bx + bz) * floors;
        slabs += floors + 2;
        cols += 4 * floors + (bx > 2 && bz > 2 ? floors * 4 : 0);
        roofs += 1;
        return { b, st, bx, bz, floors };
      });
      const unit = new THREE.BoxGeometry(1, 1, 1);
      const cracked = new THREE.MeshStandardMaterial({ map: crackedTex(), roughness: 0.95 });
      // Mỗi kiểu mặt tường 1 bộ khối vỡ: nguyên / sứt mép / thủng lỗ / gốc gãy
      this.panelKits = {};
      const counts = {};
      for (const p of plans) counts[p.st.tex] = (counts[p.st.tex] || 0) + 2 * (p.bx + p.bz) * p.floors;
      for (const key in counts) {
        const tex = windowPanelTex(key === 'apt' ? 'apt' : key);
        const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: key === 'office' ? 0.35 : 0.9, metalness: key === 'office' ? 0.4 : key === 'metal' ? 0.5 : 0.02 });
        this.panelKits[key] = new FractureKit(this.group, mat, cracked, counts[key], { variants: 2 });
      }
      this.slabPool = new Pool(this.group, unit, new THREE.MeshStandardMaterial({ map: slabTex(), roughness: 0.92 }), slabs, { color: true });
      this.colPool = new Pool(this.group, unit, new THREE.MeshStandardMaterial({ map: concreteTex(), roughness: 0.9 }), cols, { color: true });
      const prism = new THREE.CylinderGeometry(0.5, 0.5, 1, 3, 1);
      prism.rotateZ(Math.PI / 2); prism.rotateX(-Math.PI / 2); // nóc mái hướng lên trên, sống mái dọc trục X
      prism.translate(0, 0.25, 0);
      this.roofPool = new Pool(this.group, prism, new THREE.MeshStandardMaterial({ map: roofTileTex(), roughness: 0.8 }), roofs, { color: true });
      const arch = new THREE.CylinderGeometry(0.5, 0.5, 1, 18, 1, false, 0, Math.PI);
      arch.rotateZ(Math.PI / 2); // vòm cong lên trên, trục dọc theo X
      this.archPool = new Pool(this.group, arch, new THREE.MeshStandardMaterial({ map: windowPanelTex('metal'), roughness: 0.55, metalness: 0.5 }), roofs, { color: true });
      const rubble = jitter(new THREE.SphereGeometry(0.5, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2), 0.35, 4);
      this.rubblePool = new Pool(this.group, rubble, cracked, list.length, { color: true });
      // Tảng bê tông lớn vương vãi trên đống đổ nát
      this.slabChunkPool = new Pool(this.group, jitter(new THREE.BoxGeometry(1, 1, 1, 2, 1, 2), 0.25, 9), cracked, list.length * 34, { color: true });
      this.rubbleMat = new THREE.MeshStandardMaterial({ map: cracked.map || null, vertexColors: true, roughness: 1, metalness: 0, flatShading: true });
      for (const p of plans) this.items.push(this.buildOne(p));
      this.commitAll();
    }

    commitAll() {
      for (const k in this.panelKits) this.panelKits[k].commit();
      [this.slabPool, this.colPool, this.roofPool, this.archPool, this.rubblePool, this.slabChunkPool].forEach(pl => pl.commit());
    }

    buildOne(P) {
      const { b, st, bx, bz, floors } = P;
      const gy = this.groundAt(b.x, b.z);
      const W = bx * st.bay, D = bz * st.bay, FH = st.floorH, T = 2.2;
      const base = new THREE.Matrix4().makeRotationY(b.angle || 0).setPosition(b.x, gy - 1.5, b.z);
      const color = new THREE.Color(st.colors[Math.floor(RNG() * st.colors.length)]);
      const B = { x: b.x, z: b.z, y: gy, w: W, d: D, floors, FH, st, base, color, mods: [], collapsed: false, angle: b.angle || 0, kind: b.kind, hpTotal: 0 };
      const kit = this.panelKits[st.tex];
      const mk = (pool, lx, ly, lz, sx, sy, sz, ry, role, floor) => {
        const m = new THREE.Matrix4().compose(new THREE.Vector3(lx, ly, lz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry || 0), new THREE.Vector3(sx, sy, sz));
        const world = base.clone().multiply(m);
        const c = color.clone().multiplyScalar(rand(0.92, 1.05));
        const mod = { local: m, world, role, floor, ry: ry || 0, hp: role === 'col' ? 2.2 : role === 'slab' ? 2.6 : role === 'roof' ? 1.6 : 1.0, state: 'ok', c, lx, ly, lz, sx };
        if (pool === 'panel') { mod.kit = kit; mod.h = kit.add('box', world, c); }
        else { mod.pool = pool; mod.idx = pool.add(world, c); }
        B.mods.push(mod);
        B.hpTotal += mod.hp;
        return mod;
      };
      const ruined = !!st.ruined;
      for (let f = 0; f < floors; f++) {
        const y = 1.5 + f * FH + FH / 2;
        if (ruined && f === floors - 1 && RNG() < 0.6) continue;
        for (let i = 0; i < bx; i++) {
          const lx = -W / 2 + st.bay * (i + 0.5);
          for (const s of [-1, 1]) {
            if (ruined && RNG() < 0.25) continue;
            mk('panel', lx, y, s * (D / 2 - T / 2), st.bay, FH, T, s > 0 ? 0 : Math.PI, 'wall', f);
          }
        }
        for (let j = 0; j < bz; j++) {
          const lz = -D / 2 + st.bay * (j + 0.5);
          for (const s of [-1, 1]) {
            if (ruined && RNG() < 0.25) continue;
            mk('panel', s * (W / 2 - T / 2), y, lz, st.bay, FH, T, s > 0 ? Math.PI / 2 : -Math.PI / 2, 'wall', f);
          }
        }
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) mk(this.colPool, sx * (W / 2 - 0.6), y, sz * (D / 2 - 0.6), 2.6, FH, 2.6, 0, 'col', f);
        if (bx > 2 && bz > 2) for (const sx of [-1, 1]) for (const sz of [-1, 1]) mk(this.colPool, sx * W / 6, y, sz * D / 6, 2.0, FH, 2.0, 0, 'col', f);
        mk(this.slabPool, 0, 1.5 + (f + 1) * FH, 0, W + 1.2, 1.2, D + 1.2, 0, 'slab', f);
      }
      mk(this.slabPool, 0, 1.0, 0, W + 2, 2.2, D + 2, 0, 'base', -1);
      const topY = 1.5 + floors * FH;
      if (st.roof === 'pitched') mk(this.roofPool, 0, topY + 0.6, 0, W + 3, Math.min(W, D) * 0.42 / 0.75, (D + 3) / 0.866, 0, 'roof', floors);
      else if (st.roof === 'arched') mk(this.archPool, 0, topY - 0.5, 0, W, FH * 1.3, D, 0, 'roof', floors);
      else mk(this.slabPool, 0, topY + 1.4, 0, W - 0.5, 2.8, D - 0.5, 0, 'roof', floors);
      B.topY = topY;
      B.rubbleIdx = -1;
      B.entry = { x: b.x, z: b.z, radius: Math.hypot(W, D) * 0.5 * 0.92, height: topY + 4, type: 'BUILDING', id: 'bldg-' + Math.round(b.x) + '-' + Math.round(b.z), ref: B };
      B.halfW = W / 2; B.halfD = D / 2;
      return B;
    }

    toLocal(B, x, y, z) {
      const dx = x - B.x, dz = z - B.z;
      const c = Math.cos(-B.angle), s = Math.sin(-B.angle);
      return { x: dx * c + dz * s, y: y - (B.y - 1.5), z: -dx * s + dz * c };
    }

    modWorldPos(m) { return new THREE.Vector3().setFromMatrixPosition(m.world); }
    hideMod(m) { if (m.kit) m.kit.hide(m.h); else m.pool.hide(m.idx); }
    tintMod(m, c) { if (m.kit) m.kit.color(m.h, c); else m.pool.color(m.idx, c); }

    // Đạn nổ / xuyên trúng nhà. override: { power, radius } (phòng thử đạn tự cấp năng lượng phá hủy)
    damageAt(x, y, z, ammo, heavy, fx, override) {
      const A = override ? Object.assign({}, ammoInfo(ammo, heavy), override) : ammoInfo(ammo, heavy);
      const events = [];
      // Sức phá kết cấu tập trung quanh điểm nổ (đạn 120mm HE khoét thủng ~1-2 mảng tường, không phá cả mặt nhà);
      // sóng nổ lan rộng hơn chỉ làm nứt / vỡ kính chứ không đánh sập
      const R = A.radius * 0.5 + 4;
      for (const B of this.items) {
        if (B.collapsed) continue;
        if (Math.hypot(x - B.x, z - B.z) > Math.hypot(B.halfW, B.halfD) + R) continue;
        const L = this.toLocal(B, x, y, z);
        let changed = false;
        for (const m of B.mods) {
          if (m.state === 'gone' || m.state === 'stub') continue;
          const d = Math.hypot(L.x - m.lx, L.y - m.ly, L.z - m.lz) - (m.role === 'slab' || m.role === 'base' ? 0 : 3);
          if (d > R) continue;
          const k = clamp01(1 - Math.max(0, d) / R);
          let dmg = A.power * (0.25 + 1.2 * k * k);
          if (A.pierce && d < 6) dmg *= 1.8;
          if (m.role === 'base') dmg *= 0.2;
          m.hp -= dmg;
          changed = true;
          if (m.state === 'ok' && k > 0.3) this.tintMod(m, m.c.clone().multiplyScalar(0.55 + 0.3 * (1 - k)));
          if (m.hp <= 0) this.breakModule(B, m, fx);
          else if (m.hp < 0.55 && m.role === 'wall' && m.state === 'ok') this.holeModule(B, m, fx);
        }
        if (changed) {
          events.hit = true;
          const ev = this.checkStructure(B, fx);
          if (ev) events.push(ev);
          this.commitAll();
        }
      }
      return events;
    }

    holeModule(B, m, fx) {
      m.h = m.kit.swap(m.h, 'holed', m.c.clone().multiplyScalar(0.85));
      m.state = 'holed';
      const wp = this.modWorldPos(m);
      if (fx && fx.removeMarksNear) fx.removeMarksNear(wp.x, wp.y, wp.z, B.st.bay * 0.45);
      chunks(fx, wp.x, wp.y, wp.z, 2, 2.2);
      dustBurst(fx, wp.x, wp.y, wp.z, 2, 9);
      sfx('concrete', wp.x, wp.y, wp.z, 0.7);
    }

    breakModule(B, m, fx) {
      const wp = this.modWorldPos(m);
      if (fx && fx.removeMarksNear) fx.removeMarksNear(wp.x, wp.y, wp.z, (m.sx || 8) * 0.7);
      if (m.role === 'wall' && m.kit) {
        // Mảng tường vỡ: còn lại phần chân gãy răng cưa lòi cốt thép, mảng bên cạnh sứt mép
        m.h = m.kit.swap(m.h, 'remnant', m.c.clone().multiplyScalar(0.8));
        m.state = 'stub';
        this.biteNeighbours(B, m, fx);
      } else {
        m.state = 'gone';
        this.hideMod(m);
      }
      chunks(fx, wp.x, wp.y, wp.z, m.role === 'slab' ? 4 : 3, m.role === 'col' ? 2.6 : 3.2);
      dustBurst(fx, wp.x, wp.y, wp.z, 3, 12);
      sfx('concrete', wp.x, wp.y, wp.z, 1);
    }

    // Mảng tường lành kề bên chỗ vỡ bị sứt mép phía giáp ranh, mảng ngay dưới sứt mép trên
    biteNeighbours(B, m, fx) {
      const ax = Math.cos(m.ry), az = -Math.sin(m.ry);   // trục +X cục bộ của mảng (dọc tường)
      const cascade = [];
      for (const n of B.mods) {
        if (n === m || n.role !== 'wall' || n.ry !== m.ry) continue;
        if (n.state !== 'ok' && n.state !== 'bitten' && n.state !== 'holed') continue;
        const dx = m.lx - n.lx, dz = m.lz - n.lz, dy = m.ly - n.ly;
        const along = dx * ax + dz * az;
        let side = null;
        if (Math.abs(dy) < 1 && Math.abs(Math.abs(along) - B.st.bay) < 1.5 && Math.hypot(dx - along * ax, dz - along * az) < 2) side = along > 0 ? 'R' : 'L';
        else if (Math.abs(dy - B.FH) < 1 && Math.hypot(dx, dz) < 1.5) side = 'T';
        if (!side) continue;
        // Mảng đã thủng lỗ ngay sát chỗ vỡ: nứt lan, dễ gãy theo
        if (n.state === 'holed') { if (RNG() < 0.45) cascade.push(n); continue; }
        n.bites = n.bites || new Set();
        if (n.bites.has(side)) continue;
        n.bites.add(side);
        const key = ['L', 'R', 'T'].filter(c => n.bites.has(c)).join('');
        n.h = n.kit.swap(n.h, 'bite' + key, n.c);
        n.state = 'bitten';
      }
      for (const n of cascade) if (n.state === 'holed') { n.hp = 0; this.breakModule(B, n, fx); }
    }

    checkStructure(B, fx) {
      let alive = 0, base = 0, baseAlive = 0;
      for (const m of B.mods) {
        if (m.state !== 'gone' && m.state !== 'stub') alive += Math.max(0, m.hp);
        if (m.floor === 0 && (m.role === 'col' || m.role === 'wall')) { base++; if (m.state !== 'gone' && m.state !== 'stub') baseAlive++; }
      }
      const ratio = alive / B.hpTotal;
      // Mảng tường tầng trên mất chỗ tựa thì đổ xuống theo
      for (const m of B.mods) {
        if (m.role !== 'wall' || m.floor <= 0 || m.state === 'gone' || m.state === 'stub') continue;
        const below = B.mods.some(q => q.floor === m.floor - 1 && q.state !== 'gone' && q.state !== 'stub' && (q.role === 'wall' || q.role === 'col') && Math.hypot(q.lx - m.lx, q.lz - m.lz) < B.st.bay * 1.6);
        if (!below) { m.state = 'gone'; this.hideMod(m); const wp = this.modWorldPos(m); if (fx && fx.removeMarksNear) fx.removeMarksNear(wp.x, wp.y, wp.z, 9); chunks(fx, wp.x, wp.y, wp.z, 6, 3); }
      }
      if ((base > 0 && baseAlive / base < 0.45) || ratio < 0.38) {
        this.collapse(B, fx);
        return { type: 'collapse', text: 'TÒA NHÀ SẬP ĐỔ', x: B.x, z: B.z };
      }
      return null;
    }

    collapse(B, fx) {
      if (B.collapsed) return;
      B.collapsed = true;
      const tilt = new THREE.Vector3(rand(-1, 1), 0, rand(-1, 1)).normalize();
      for (const m of B.mods) {
        if (m.state === 'gone') continue;
        if (m.kit && m.h) for (const [p, i] of m.h.extra) p.hide(i);
        this.anim.push({ B, m, t: 0, delay: (m.floor + 1) * 0.12 + rand(0, 0.25), drop: m.ly + rand(4, 10), tilt, spin: rand(-0.4, 0.4) });
      }
      if (fx && fx.removeMarksNear) fx.removeMarksNear(B.x, B.y + B.topY / 2, B.z, Math.hypot(B.halfW, B.halfD, B.topY / 2) + 6);
      const H = B.topY;
      for (let i = 0; i < 26; i++) {
        const a = RNG() * 6.283, r = RNG() * Math.max(B.halfW, B.halfD);
        dustBurst(fx, B.x + Math.cos(a) * r, B.y + rand(0, H * 0.6), B.z + Math.sin(a) * r, 1, 22 + H * 0.12, [0.72, 0.7, 0.66]);
      }
      chunks(fx, B.x, B.y + H * 0.4, B.z, 12, 4, null, 60);
      sfx('collapse', B.x, B.y, B.z, Math.min(1.4, 0.6 + H / 80));
      // Đống đổ nát giữ đúng khối lượng: phần đặc của nhà (~28% thể tích bao) nở rời ~1.5 lần khi vỡ vụn.
      // Bám theo nền chữ nhật của nhà (không phải ụ tròn), mặt lổn nhổn, tràn ra ngoài vài mét, sàn bê tông gãy xếp chồng,
      // vài mảng tường góc còn đứng nghiêng, thép lòi ra
      this.buildRubble(B);
      this.commitAll();
      B.entry.height = B.rubbleH + 2;
      B.entry.radius *= 0.9;
    }

    buildRubble(B) {
      const H = B.topY, W = B.w, D = B.d;
      const spill = Math.min(20, 6 + H * 0.2);
      const solid = W * D * H * 0.28 * 1.5;
      const seed = RNG() * 1000;
      const hsh = (x, y) => { const k = Math.sin(x * 127.1 + y * 311.7 + seed) * 43758.5453; return k - Math.floor(k); };
      const vn = (x, y) => {
        const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
        const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
        const a = hsh(xi, yi), b = hsh(xi + 1, yi), c = hsh(xi, yi + 1), d = hsh(xi + 1, yi + 1);
        return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
      };
      // Các cục đổ nát lớn (khối sàn / cầu thang / lõi thang máy sụp chồng lên nhau)
      const lumps = [];
      for (let i = 0; i < 6 + B.floors * 2; i++) lumps.push({ x: rand(-0.5, 0.5) * W, z: rand(-0.5, 0.5) * D, r: rand(4, 9), h: rand(0.25, 0.6) });
      const shape = (x, z) => {
        const ox = Math.max(0, Math.abs(x) - W / 2), oz = Math.max(0, Math.abs(z) - D / 2);
        const dOut = Math.hypot(ox, oz);
        const dIn = Math.min(W / 2 - Math.abs(x), D / 2 - Math.abs(z));
        // trong nền nhà gần như đầy, mép nhà dốc xuống rồi tràn ra ngoài theo dạng đất đá đổ (lởm chởm, không đều)
        const edgeNoise = (vn(x * 0.09 + 3, z * 0.09) - 0.5) * spill * 0.9;
        let f = dOut > 0 ? Math.max(0, 1 - Math.pow(Math.max(0, dOut + edgeNoise * 0.6) / (spill * 0.95), 0.75)) * 0.62 : 0.62 + 0.38 * Math.min(1, dIn / (Math.min(W, D) * 0.3));
        f = Math.max(0, f);
        let h = f * (0.55 + 0.75 * vn(x * 0.07, z * 0.07)) + f * 0.35 * (vn(x * 0.22 + 7, z * 0.22) - 0.5);
        for (const L of lumps) { const dd = Math.hypot(x - L.x, z - L.z) / L.r; if (dd < 1) h += L.h * f * (1 - dd * dd); }
        // khối vụn góc cạnh (bậc thang nhỏ) cho mặt đống
        h += f * 0.12 * Math.round((vn(x * 0.5, z * 0.5 + 11) - 0.5) * 3);
        return h;
      };
      const LX = W + spill * 2, LZ = D + spill * 2;
      const nx = Math.max(18, Math.min(56, Math.round(LX / 2))), nz = Math.max(18, Math.min(56, Math.round(LZ / 2)));
      const geo = new THREE.PlaneGeometry(LX, LZ, nx, nz);
      geo.rotateX(-Math.PI / 2);
      const pos = geo.attributes.position;
      const raw = new Float32Array(pos.count);
      let vol = 0, rawMax = 0.01;
      for (let i = 0; i < pos.count; i++) { raw[i] = shape(pos.getX(i), pos.getZ(i)); vol += raw[i]; rawMax = Math.max(rawMax, raw[i]); }
      vol *= (LX / nx) * (LZ / nz);
      // đống đổ nát thật cao ~20-35% chiều cao nhà (phần dư khối lượng tràn rộng ra xung quanh)
      const sc = Math.min(Math.max(6, H * 0.36) / rawMax, solid / Math.max(1, vol));
      const hAt = (x, z) => shape(x, z) * sc;
      const col = new Float32Array(pos.count * 3);
      const base = new THREE.Color(0.74, 0.72, 0.68).lerp(B.color, 0.25);
      let maxH = 0;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), z = pos.getZ(i);
        let h = raw[i] * sc;
        const border = Math.abs(x) > LX / 2 - 0.1 || Math.abs(z) > LZ / 2 - 0.1;
        h = border ? -0.6 : h - 0.3;
        pos.setY(i, h);
        maxH = Math.max(maxH, h);
        // màu: bê tông vụn xám, chỗ trũng tối (khe rỗng), vài mảng sơn tường, bụi trắng phủ rìa
        const n = vn(x * 0.3 + 5, z * 0.3);
        const c = base.clone().multiplyScalar(0.62 + 0.45 * n);
        if (vn(x * 0.15 + 21, z * 0.15) > 0.72) c.lerp(B.color, 0.6);
        if (raw[i] < 0.12) c.lerp(new THREE.Color(0.8, 0.78, 0.74), 0.45);
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.computeVertexNormals();
      const g = new THREE.Group();
      g.position.set(B.x, B.y - 1.2, B.z);
      g.rotation.y = B.angle;
      const mesh = new THREE.Mesh(geo, this.rubbleMat);
      mesh.castShadow = mesh.receiveShadow = true;
      g.add(mesh);
      // Thép lòi ra khỏi đống đổ nát (cong queo, chĩa nhiều hướng)
      const bars = [];
      for (let i = 0; i < 12 + B.floors * 3; i++) {
        const x = rand(-0.5, 0.5) * W, z = rand(-0.5, 0.5) * D, L = rand(2.5, 6);
        const c = new THREE.CylinderGeometry(0.13, 0.13, L, 4);
        c.translate(0, L / 2, 0);
        c.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rand(-1.1, 1.1), rand(0, 6.3), rand(-1.1, 1.1))));
        c.translate(x, hAt(x, z) - 0.6, z);
        bars.push(c.toNonIndexed());
      }
      if (bars.length) {
        const rb = new THREE.Mesh(merge(bars), REBAR_MAT());
        rb.castShadow = true;
        g.add(rb);
      }
      this.group.add(g);
      g.scale.y = 0.001;
      B.rubbleGroup = g;
      B.rubbleH = maxH;
      B.rubbleT = 0;
      // Sàn bê tông gãy xếp chồng nghiêng ngả trên mặt đống + mảng tường góc còn đứng xiêu vẹo
      B.chunkIdx = [];
      const toWorld = (lx, ly, lz) => new THREE.Vector3(lx, ly, lz).applyAxisAngle(new THREE.Vector3(0, 1, 0), B.angle).add(new THREE.Vector3(B.x, B.y - 1.2, B.z));
      const slabs = Math.min(26, 8 + B.floors * 4);
      for (let i = 0; i < slabs; i++) {
        const lx = rand(-0.55, 0.55) * W, lz = rand(-0.55, 0.55) * D;
        const sx = rand(7, Math.min(18, W * 0.5)), sz = rand(5, Math.min(14, D * 0.45));
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rand(-0.6, 0.6), B.angle + rand(-0.5, 0.5), rand(-0.6, 0.6)));
        const cm = new THREE.Matrix4().compose(toWorld(lx, hAt(lx, lz) - 0.5, lz), q, new THREE.Vector3(sx, rand(1.0, 1.6), sz));
        const idx = this.slabChunkPool.add(ZERO, new THREE.Color(0.8, 0.78, 0.74).lerp(B.color, 0.2).multiplyScalar(rand(0.75, 1)));
        if (idx >= 0) B.chunkIdx.push([idx, cm]);
      }
      const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]].sort(() => RNG() - 0.5).slice(0, 2 + Math.floor(RNG() * 2));
      for (const [cx, cz] of corners) {
        const along = RNG() < 0.5;
        const len = rand(6, 12), hh = rand(0.22, 0.42) * H;
        const lx = cx * (W / 2 - (along ? len / 2 : 1)), lz = cz * (D / 2 - (along ? 1 : len / 2));
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rand(-0.25, 0.25), B.angle + (along ? 0 : Math.PI / 2), rand(-0.3, 0.3)));
        const cm = new THREE.Matrix4().compose(toWorld(lx, hh / 2 - 1, lz), q, new THREE.Vector3(len, hh, 1.8));
        const idx = this.slabChunkPool.add(ZERO, B.color.clone().multiplyScalar(rand(0.6, 0.85)));
        if (idx >= 0) B.chunkIdx.push([idx, cm]);
      }
    }

    update(dt) {
      for (let i = this.anim.length - 1; i >= 0; i--) {
        const A = this.anim[i];
        A.t += dt;
        const t = A.t - A.delay;
        if (t < 0) continue;
        const fall = Math.min(A.drop, 0.5 * 90 * t * t);
        const k = fall / A.drop;
        const off = new THREE.Matrix4().compose(
          new THREE.Vector3(A.tilt.x * k * 6, -fall, A.tilt.z * k * 6),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(A.tilt.z * k * 0.5, A.spin * k, -A.tilt.x * k * 0.5)),
          new THREE.Vector3(1, 1 - k * 0.6, 1)
        );
        const m = A.B.base.clone().multiply(off).multiply(A.m.local);
        if (A.m.kit) A.m.h.pool.set(A.m.h.idx, m); else A.m.pool.set(A.m.idx, m);
        if (k >= 1) {
          A.m.state = 'gone';
          this.hideMod(A.m);
          this.anim.splice(i, 1);
        }
      }
      for (const B of this.items) {
        if (!B.collapsed || B.rubbleT >= 1) continue;
        B.rubbleT = Math.min(1, B.rubbleT + dt / 1.6);
        if (B.rubbleGroup) B.rubbleGroup.scale.y = Math.max(0.001, B.rubbleT);
        if (B.rubbleT >= 1) for (const [idx, cm] of B.chunkIdx) this.slabChunkPool.set(idx, cm);
      }
    }
  }

  // ===========================================================================
  // KẾT CẤU KHỐI BÊ TÔNG (tường / boong-ke): sứt mẻ -> nứt lộ thép -> vỡ còn gốc gãy -> vỡ vụn
  // ===========================================================================
  class BlockStructure {
    constructor(parent, cap) {
      const conc = new THREE.MeshStandardMaterial({ map: concreteTex(), roughness: 0.92, metalness: 0.02 });
      const cracked = new THREE.MeshStandardMaterial({ map: crackedTex(), roughness: 0.95 });
      this.kitC = new FractureKit(parent, conc, cracked, cap);      // khối lành
      this.kitK = new FractureKit(parent, cracked, cracked, cap);   // khối đã nứt toác
      this.rubblePool = new Pool(parent, jitter(new THREE.DodecahedronGeometry(0.5, 0), 0.3, 7), cracked, cap * 3, { color: true });
      this.blocks = [];
    }
    // pos: tâm chân khối (thế giới), rotY: hướng trục dọc (+X cục bộ) của khối
    addBlock(o) {
      const m = new THREE.Matrix4().compose(new THREE.Vector3(o.x, o.y0 + o.h / 2, o.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), o.rotY), new THREE.Vector3(o.len, o.h, o.thick));
      const c = new THREE.Color(1, 1, 1).multiplyScalar(rand(0.86, 1.02));
      const q = Object.assign({}, o, {
        y1: o.y0 + o.h, m, c, hp: o.hp || 7.0, hpMax: o.hp || 7.0, alive: true, cracked: false, stub: false,
        ax: Math.cos(o.rotY), az: -Math.sin(o.rotY), radius: Math.max(o.len, o.thick) * 0.55 + 1
      });
      q.kit = this.kitC;
      q.h = this.kitC.add('box', m, c);
      this.blocks.push(q);
      return q;
    }
    commit() { this.kitC.commit(); this.kitK.commit(); this.rubblePool.commit(); }

    // Sát thương hình cầu quanh điểm nổ
    damageSphere(x, y, z, R, power, pierce, fx, filter) {
      let broke = 0;
      this.lastPierced = false;
      for (const q of this.blocks) {
        if (!q.alive || (filter && !filter(q))) continue;
        const dy = y < q.y0 ? q.y0 - y : y > q.y1 ? y - q.y1 : 0;
        const d = Math.max(0, Math.hypot(x - q.x, z - q.z) - q.radius * 0.7);
        const dist = Math.hypot(d, dy);
        if (dist > R) continue;
        const k = clamp01(1 - dist / R);
        let dmg = power * (0.15 + 1.1 * k * k);
        if (pierce && dist < 4) dmg *= 1.5;
        // đạn nhỏ chỉ sứt / đục dần mặt bê tông (12.7mm sứt mẻ, 30mm nổ-mảnh đục sâu hơn), gần như không lan sang khối bên
        if (power < 0.3) dmg *= (power < 0.2 ? 0.3 : 0.45) * (dist < 1.5 ? 1 : 0.35);
        q.hp -= dmg;
        // Đạn xuyên (APFSDS / luồng nổ lõm) trúng thẳng khối: khoét thủng xuyên qua tường, lộ cốt thép
        const punch = pierce && dist < 3 && power >= 0.8;
        if (punch && !q.stub && !q.bored) {
          // phát xuyên đầu tiên: lỗ thủng gọn xuyên qua khối (không gãy cụt cả khối); phát sau mới làm vỡ
          q.hp = Math.max(q.hp, 0.25);
          this.boreBlock(q, fx);
          this.lastPierced = true;
        }
        else if (q.hp <= 0) { this.breakBlock(q, fx); broke++; if (punch) this.lastPierced = true; }
        else if (punch && !q.stub) this.lastPierced = true;
        else if (!q.cracked && !q.stub && q.hp < q.hpMax * 0.5) this.crackBlock(q, fx);
        // Xả đạn liên tục vào một chỗ: đục thủng xuyên qua khối (lỗ toác lộ cốt thép)
        else if (q.cracked && !q.stub && !q.bored && power < 0.3 && dist < 1.5 && q.hp < q.hpMax * (power < 0.2 ? 0.3 : 0.45)) this.boreBlock(q, fx);
        else if (k > 0.2 && !q.stub) q.kit.color(q.h, q.c.clone().multiplyScalar(0.6 + 0.4 * (q.hp / q.hpMax)));
      }
      if (broke) this.commit();
      return broke;
    }
    // Khoét thủng xuyên khối bê tông (lỗ toác lộ cốt thép)
    boreBlock(q, fx) {
      q.bored = true;
      q.cracked = true;
      q.kit.hide(q.h);
      q.kit = this.kitK;
      q.h = this.kitK.add('holed', q.m, q.c.clone().multiplyScalar(0.88));
      if (fx && fx.removeMarksNear) fx.removeMarksNear(q.x, (q.y0 + q.y1) / 2, q.z, Math.max(q.len, q.h0frac * 4) * 0.4);
      chunks(fx, q.x, (q.y0 + q.y1) / 2, q.z, 2, 1.6);
      sfx('concrete', q.x, (q.y0 + q.y1) / 2, q.z, 0.6);
      this.commit();
    }
    crackBlock(q, fx) {
      q.cracked = true;
      // giữ hình dạng hiện có (lành / sứt mép) nhưng đổi sang mặt bê tông nứt toác
      const type = q.h ? q.h.type : 'box';
      this.kitC.hide(q.h);
      q.kit = this.kitK;
      q.h = this.kitK.add(type === 'remnant' ? 'remnant' : type, q.m, q.c.clone().multiplyScalar(0.92));
      this.commit();
      void fx;
    }
    // Mảnh vỡ theo đúng thể tích bê tông bị phá: ~35% nằm lại thành đống vụn chân tường, ~12% văng bay, còn lại thành bụi
    debrisFor(q, vol, fx) {
      const yc = (q.y0 + q.y1) / 2;
      const nRest = vol > 400 ? 4 : vol > 120 ? 3 : 2;
      const sRest = Math.cbrt(vol * 0.35 / nRest / 0.38);
      const gy = q.groundY !== undefined ? q.groundY : q.y0 + 2;
      for (let i = 0; i < nRest; i++) {
        const s = sRest * rand(0.7, 1.25);
        const off = rand(0.5, 1.2) * Math.max(q.thick, 4);
        const side = RNG() < 0.65 ? 1 : -1;   // phần lớn đổ ra phía bị nổ
        this.rubblePool.add(new THREE.Matrix4().compose(
          new THREE.Vector3(q.x + q.ax * rand(-0.5, 0.5) * q.len - q.az * side * off, gy + s * 0.2, q.z + q.az * rand(-0.5, 0.5) * q.len + q.ax * side * off),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(rand(0, 3), rand(0, 3), rand(0, 3))), new THREE.Vector3(s * 1.4, s, s)), new THREE.Color(0.75, 0.73, 0.7).multiplyScalar(rand(0.85, 1.05)));
      }
      const nFly = 3;
      const sFly = Math.cbrt(vol * 0.12 / nFly / 2.2);
      chunks(fx, q.x, yc, q.z, nFly, Math.min(6, sFly * 1.6));
      dustBurst(fx, q.x, yc, q.z, 2 + Math.min(4, Math.round(vol / 300)), 8 + Math.min(10, Math.cbrt(vol) * 0.8), [0.7, 0.69, 0.66]);
    }

    breakBlock(q, fx) {
      const yc = (q.y0 + q.y1) / 2;
      if (fx && fx.removeMarksNear) fx.removeMarksNear(q.x, yc, q.z, Math.max(q.len, q.h) * 0.75);
      const oldTop = q.y1;
      if (!q.stub && !q.noStub) {
        // Vỡ lần đầu: còn trơ gốc gãy răng cưa lòi cốt thép (vẫn che được thân dưới xe)
        q.kit.hide(q.h);
        q.kit = this.kitK;
        q.h = this.kitK.add('remnant', q.m, q.c.clone().multiplyScalar(0.85));
        q.stub = true;
        q.y1 = q.y0 + q.h0frac * (oldTop - q.y0);
        q.hp = q.hpMax * 0.35;
        this.biteNeighbours(q);
      } else {
        q.alive = false;
        q.kit.hide(q.h);
      }
      // Thể tích bị phá: lần đầu = phần trên gốc gãy, lần sau = phần gốc còn lại
      const vol = q.len * q.thick * Math.max(0, oldTop - q.y1 + (q.alive ? 0 : q.y1 - q.y0));
      this.debrisFor(q, Math.max(8, vol), fx);
      sfx('concrete', q.x, yc, q.z, 1);
      // Khối chồng bên trên mất chân đỡ: bê tông cốt thép liền khối -> còn khối lành kề bên cùng hàng thì
      // treo lại nhờ thép (nứt toác), chỉ đổ khi cả vùng xung quanh đã bị khoét cạn
      for (const o of this.blocks) {
        if (!o.alive || o === q) continue;
        if (Math.hypot(o.x - q.x, o.z - q.z) < 1.5 && o.y0 >= oldTop - 1) {
          const held = this.blocks.some(n => n !== o && n.alive && !n.stub && Math.abs(n.y0 - o.y0) < 1 && Math.abs(n.rotY - o.rotY) < 0.01 &&
            Math.abs(Math.hypot(n.x - o.x, n.z - o.z) - (n.len + o.len) / 2) < 2);
          if (held) { if (!o.cracked) this.crackBlock(o, fx); continue; }
          o.noStub = true; this.breakBlock(o, fx);
        }
      }
    }
    biteNeighbours(q) {
      const addBite = (n, side) => {
        n.bites = n.bites || new Set();
        if (n.bites.has(side)) return;
        n.bites.add(side);
        n.bitten = true;
        n.kit.hide(n.h);
        n.h = n.kit.add('bite' + ['L', 'R', 'T'].filter(c => n.bites.has(c)).join(''), n.m, n.c);
      };
      for (const n of this.blocks) {
        if (n === q || !n.alive || n.stub || n.bored) continue;
        if (Math.abs(n.y0 - q.y0) > 1 || Math.abs(n.rotY - q.rotY) > 0.01) continue;
        const dx = q.x - n.x, dz = q.z - n.z;
        const along = dx * n.ax + dz * n.az;
        if (Math.abs(Math.abs(along) - n.len) > 2 || Math.hypot(dx - along * n.ax, dz - along * n.az) > 2) continue;
        addBite(n, along > 0 ? 'R' : 'L');
      }
      // Khối ngay dưới sứt mép trên
      for (const n of this.blocks) {
        if (n === q || !n.alive || n.stub || n.bored) continue;
        if (Math.hypot(n.x - q.x, n.z - q.z) < 1.5 && Math.abs(n.y1 - q.y0) < 1) addBite(n, 'T');
      }
    }
  }

  // ===========================================================================
  // BOONG-KE BÊ TÔNG CỐT THÉP
  // ===========================================================================
  // Hệ cục bộ: trục f hướng cửa mở (cos a, sin a), trục r vuông góc. Lòng hầm dài 72 x rộng 58.
  const BK = { L: 72, Wd: 58, T: 12, Hfull: 32, Hfront: 20, roofY: 32, roofT: 6, coverF: 8, block: 14 };

  class BunkerSet {
    constructor(parent, list, groundAt) {
      this.group = new THREE.Group();
      this.group.name = 'bunkers';
      parent.add(this.group);
      this.groundAt = groundAt;
      this.items = [];
      this.S = new BlockStructure(this.group, list.length * 60 + 10);
      const unit = new THREE.BoxGeometry(1, 1, 1);
      const conc = new THREE.MeshStandardMaterial({ map: concreteTex(), roughness: 0.92, metalness: 0.02 });
      this.roofPool = new Pool(this.group, unit, conc, list.length * 12, { color: true });
      const bag = jitter(new THREE.SphereGeometry(0.5, 8, 5), 0.12, 2);
      this.bagPool = new Pool(this.group, bag, new THREE.MeshStandardMaterial({ map: sandbagTex(), roughness: 1 }), list.length * 200, { color: true });
      for (const b of list) this.items.push(this.buildOne(b));
      this.S.commit();
      [this.roofPool, this.bagPool].forEach(p => p.commit());
    }

    buildOne(b) {
      const gy = this.groundAt(b.x, b.z);
      const a = b.openAngle;
      const f = { x: Math.cos(a), z: Math.sin(a) }, r = { x: -Math.sin(a), z: Math.cos(a) };
      const W = (lf, lr) => ({ x: b.x + f.x * lf + r.x * lr, z: b.z + f.z * lf + r.z * lr });
      // Góc quay để trục +X cục bộ của khối chạy dọc tường: dọc theo r (tường hậu) / dọc theo f (tường hông)
      const rotAlongR = Math.atan2(-r.z, r.x), rotAlongF = Math.atan2(-f.z, f.x);
      const K = { x: b.x, z: b.z, y: gy, openAngle: a, f, r, blocks: [], roofs: [], roofed: b.roofed !== false, side: b.side };
      const addBlock = (lf, lr, ly, len, thick, h, wall, alongF) => {
        const p = W(lf, lr);
        const gyl = Math.min(gy, this.groundAt(p.x, p.z));
        const q = this.S.addBlock({ x: p.x, z: p.z, y0: gyl - 2 + ly, h, len, thick, rotY: alongF ? rotAlongF : rotAlongR, wall, lf, lr, hp: 7.0, groundY: gyl });
        q.h0frac = rand(0.35, 0.6);
        q.K = K;
        K.blocks.push(q);
        return q;
      };
      const { L, Wd, T, Hfull, Hfront, coverF, block } = BK;
      // Tường hậu (quay về phía địch) cao hết cỡ, có khe bắn
      const backF = -L / 2 - T / 2;
      for (let lr = -Wd / 2 - T; lr < Wd / 2 + T - 0.1; lr += block) {
        const c = lr + block / 2;
        addBlock(backF, c, 0, block, T, 21, 'back', false);
        addBlock(backF, c, 25, block, T, Hfull - 25 + 2, 'back', false);
        if (Math.abs(c) > 10) addBlock(backF, c, 21, block, T, 4, 'back', false);
      }
      // 2 tường hông: phần dưới mái cao hết cỡ, phần trước thấp (tường chắn che thân xe)
      for (const s of [-1, 1]) {
        const lr = s * (Wd / 2 + T / 2);
        for (let lf = -L / 2; lf < L / 2 - 0.1; lf += block) {
          const c = lf + block / 2;
          addBlock(c, lr, 0, block, T, c < coverF ? Hfull + 2 : Hfront, 'side', true);
        }
        for (let k = 0; k < 10; k++) {
          const p = W(L / 2 + 3 + rand(-1, 1), lr + rand(-5, 5));
          const ym = this.groundAt(p.x, p.z) + 1 + (k % 3) * 2.2;
          this.bagPool.add(new THREE.Matrix4().compose(new THREE.Vector3(p.x, ym, p.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotAlongF + rand(-0.3, 0.3)), new THREE.Vector3(5, 2.2, 3)), new THREE.Color(1, 1, 1).multiplyScalar(rand(0.8, 1.05)));
        }
      }
      // Mái đổ bê tông dày + lớp bao cát phủ trên
      if (K.roofed) {
        const f0 = -L / 2 - T, f1 = coverF;
        for (let lf = f0; lf < f1 - 0.1; lf += 12) {
          const len = Math.min(12, f1 - lf);
          const p = W(lf + len / 2, 0);
          const ry = gy - 2 + BK.roofY + 2;
          const m = new THREE.Matrix4().compose(new THREE.Vector3(p.x, ry + BK.roofT / 2, p.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotAlongR), new THREE.Vector3(Wd + 2 * T + 2, BK.roofT, len));
          const c = new THREE.Color(1, 1, 1).multiplyScalar(rand(0.82, 0.95));
          const bags = [];
          for (let k = 0; k < 12; k++) {
            const q = W(lf + rand(0, len), rand(-Wd / 2 - T, Wd / 2 + T));
            bags.push(this.bagPool.add(new THREE.Matrix4().compose(new THREE.Vector3(q.x, ry + BK.roofT + 1, q.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotAlongR + rand(-0.4, 0.4)), new THREE.Vector3(5, 2, 3)), new THREE.Color(0.9, 0.88, 0.78).multiplyScalar(rand(0.85, 1.05))));
          }
          K.roofs.push({ lf: lf + len / 2, len, y0: ry, y1: ry + BK.roofT, m, c, hp: 16, alive: true, idx: this.roofPool.add(m, c), bags });
        }
      }
      K.fort = {
        x: b.x, z: b.z, openAngle: a, armRadius: Wd / 2 + 12, armLength: L / 2 + 12, wallThickness: T, wallHeight: Hfull + 6,
        outerRadius: Math.hypot(L / 2 + T, Wd / 2 + T) + 4, ref: K,
        get wallBlocks() { return K.blocks.filter(q => q.alive); }
      };
      return K;
    }

    local(K, x, z) {
      const dx = x - K.x, dz = z - K.z;
      return { f: dx * K.f.x + dz * K.f.z, r: dx * K.r.x + dz * K.r.z };
    }

    isUnderCover(x, z) {
      for (const K of this.items) {
        if (!K.roofed) continue;
        const L = this.local(K, x, z);
        if (L.f > -BK.L / 2 && L.f < BK.coverF - 4 && Math.abs(L.r) < BK.Wd / 2) {
          if (K.roofs.some(q => q.alive && Math.abs(q.lf - L.f) < q.len / 2 + 2)) return K;
        }
      }
      return null;
    }

    blocks(ex, ey, ez, ux, uy, uz) {
      for (const K of this.items) {
        if (segPointDist(ex, ez, ux, uz, K.x, K.z) > 80) continue;
        for (const q of K.blocks) {
          if (!q.alive) continue;
          const t = segCircleT(ex, ez, ux, uz, q.x, q.z, q.radius);
          if (t < 0) continue;
          const yLine = ey + (uy - ey) * t;
          if (yLine < q.y1 && yLine > q.y0 - 2) return { block: q, K };
        }
        if (K.roofed) {
          const Lu = this.local(K, ux, uz);
          if (Lu.f > -BK.L / 2 && Lu.f < BK.coverF && Math.abs(Lu.r) < BK.Wd / 2) {
            const roofY = K.y - 2 + BK.roofY + 2;
            if (ey > roofY && uy < roofY && K.roofs.some(q => q.alive && Math.abs(q.lf - Lu.f) < q.len / 2 + 4)) return { roof: true, K };
          }
        }
      }
      return null;
    }

    damageAt(x, y, z, ammo, heavy, fx, override) {
      const A = override ? Object.assign({}, ammoInfo(ammo, heavy), override) : ammoInfo(ammo, heavy);
      const events = [];
      const R = A.radius + 5;
      for (const K of this.items) {
        if (Math.hypot(x - K.x, z - K.z) > 90 + R) continue;
        const broke = this.S.damageSphere(x, y, z, R, A.power, A.pierce, fx, q => q.K === K);
        for (const s of K.roofs) {
          if (!s.alive) continue;
          const L = this.local(K, x, z);
          if (Math.abs(L.f - s.lf) > s.len / 2 + R || Math.abs(L.r) > BK.Wd / 2 + BK.T + R) continue;
          const dy = y < s.y0 ? s.y0 - y : y > s.y1 ? y - s.y1 : 0;
          if (dy > R) continue;
          const k = clamp01(1 - dy / R);
          // Mái bê tông dày 0.75 m: nổ phía dưới / bên cạnh gần như không làm sập, chỉ đạn rơi trúng nóc mới phá
          s.hp -= A.power * (0.1 + 0.9 * k) * (A.power < 0.2 ? 0.2 : 1) * (y < s.y0 ? 0.35 : 1);
          this.roofPool.color(s.idx, s.c.clone().multiplyScalar(0.55 + 0.45 * clamp01(s.hp / 16)));
          if (s.hp <= 0) this.breakRoof(K, s, fx);
        }
        for (const s of K.roofs) {
          if (!s.alive) continue;
          // Tấm mái tựa trên tường hông (2 bên) và tường hậu (đoạn mái phía sau)
          const sup = K.blocks.some(q => q.alive && !q.stub && ((q.wall === 'side' && Math.abs(q.lf - s.lf) < 12) || (q.wall === 'back' && s.lf < -BK.L / 2 + 8 && q.y1 > K.y + 20)));
          if (!sup) this.breakRoof(K, s, fx, true);
        }
        if (broke) { events.hit = true; events.push({ type: 'bunker', text: 'BOONG-KE VỠ MẢNG TƯỜNG', x: K.x, z: K.z }); }
      }
      return events;
    }
    breakRoof(K, s, fx, sag) {
      s.alive = false;
      this.roofPool.hide(s.idx);
      for (const bi of s.bags) this.bagPool.hide(bi);
      const p = { x: K.x + K.f.x * s.lf, z: K.z + K.f.z * s.lf };
      if (fx && fx.removeMarksNear) fx.removeMarksNear(p.x, s.y0, p.z, 18);
      chunks(fx, p.x, s.y0, p.z, 5, 4, null, sag ? 10 : 40);
      dustBurst(fx, p.x, s.y0, p.z, 5, 16);
    }
    update() {}
  }

  // ===========================================================================
  // DÙNG CHO PHÒNG THỬ ĐẠN: 1 bức tường bê tông thẳng / 1 tòa nhà 4 tầng (cùng cơ chế với game)
  // ===========================================================================
  class ConcreteWall {
    constructor(scene, opts = {}) {
      this.scene = scene;
      this.opts = opts;
      this.build();
    }
    build() {
      const o = this.opts;
      this.group = new THREE.Group();
      this.group.visible = this._vis || false;
      this.scene.add(this.group);
      const cols = o.cols || 12, rows = o.rows || 5, bw = o.blockW || 5.9, bh = o.blockH || 5.1, bd = o.blockD || 6.4;
      const yaw = o.yaw || 0;
      this.S = new BlockStructure(this.group, cols * rows + 4);
      this.total = 0;
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          const lx = (c - (cols - 1) / 2) * bw;
          const q = this.S.addBlock({ x: Math.cos(yaw) * lx, z: -Math.sin(yaw) * lx, y0: r * bh, h: bh + 0.02, len: bw + 0.02, thick: bd, rotY: yaw, hp: o.hp || 1.6, groundY: 0 });
          q.h0frac = rand(0.3, 0.65);
          this.total++;
        }
      }
      this.S.commit();
    }
    get visible() { return this.group.visible; }
    set visible(v) { this._vis = v; this.group.visible = v; }
    damageAt(worldPos, radius, power, ammoType, fx) {
      const A = ammoInfo(ammoType, false);
      const broke = this.S.damageSphere(worldPos.x, worldPos.y, worldPos.z, radius, power, A.pierce, fx);
      return { pierced: !!this.S.lastPierced, broke };
    }
    getHealthRatio() {
      let s = 0;
      for (const q of this.S.blocks) s += q.alive ? (q.stub ? 0.3 : clamp01(q.hp / q.hpMax) * 0.3 + 0.7) : 0;
      return s / this.total;
    }
    reset() {
      const vis = this.group.visible;
      this.scene.remove(this.group);
      this.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
      this._vis = vis;
      this.build();
    }
  }

  class SingleBuilding {
    constructor(scene, opts = {}) {
      this.scene = scene;
      this.opts = opts;
      this.build();
    }
    build() {
      const o = this.opts;
      this.group = new THREE.Group();
      this.group.visible = this._vis || false;
      this.scene.add(this.group);
      this.set = new BuildingSet(this.group, [{ x: o.x || 0, z: o.z || 0, w: o.w || 44, d: o.d || 36, floors: o.floors || 4, angle: o.angle || 0, kind: o.kind || 'apartment' }], () => 0);
      this.B = this.set.items[0];
    }
    get visible() { return this.group.visible; }
    set visible(v) { this._vis = v; this.group.visible = v; }
    get isCollapsed() { return this.B.collapsed; }
    damageAt(worldPos, radius, power, ammoType, fx) {
      this.set.damageAt(worldPos.x, worldPos.y, worldPos.z, ammoType, false, fx, { radius, power: power * 0.55 });
    }
    update(dt) { this.set.update(dt); }
    getHealthRatio() {
      if (this.B.collapsed) return 0;
      let a = 0;
      for (const m of this.B.mods) if (m.state !== 'gone' && m.state !== 'stub') a++;
      return a / this.B.mods.length;
    }
    reset() {
      const vis = this.group.visible;
      this.scene.remove(this.group);
      this._vis = vis;
      this.build();
    }
  }

  // Khoảng cách điểm -> đoạn thẳng (2D)
  function segPointDist(ax, az, bx, bz, px, pz) {
    const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz;
    const t = L > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L)) : 0;
    return Math.hypot(px - ax - dx * t, pz - az - dz * t);
  }
  // Tham số t (0..1) nơi đoạn thẳng AB cắt đường tròn tâm C bán kính r; -1 nếu không cắt
  function segCircleT(ax, az, bx, bz, cx, cz, r) {
    const dx = bx - ax, dz = bz - az;
    const fx = ax - cx, fz = az - cz;
    const a = dx * dx + dz * dz, b = 2 * (fx * dx + fz * dz), c = fx * fx + fz * fz - r * r;
    if (a < 1e-9) return -1;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return -1;
    const sq = Math.sqrt(disc);
    const t1 = (-b - sq) / (2 * a), t2 = (-b + sq) / (2 * a);
    // Bỏ qua khi một đầu nằm hẳn trong khối (điểm nổ / xe sát mặt tường)
    if (t1 > 0.02 && t1 < 0.98) return t1;
    if (t2 > 0.02 && t2 < 0.98 && c > 0) return t2;
    return -1;
  }

  return { TreeField, BuildingSet, BunkerSet, ConcreteWall, SingleBuilding, BlockStructure, FractureKit, ammoInfo, BK, segCircleT, withSeed };
})();

if (typeof window !== 'undefined') window.Destructibles = Destructibles;
