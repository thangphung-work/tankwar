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
    // Texture chỉ tạo 1 lần rồi dùng lại -> vẽ bằng bộ sinh số RIÊNG theo tên texture, không lấy số của bộ sinh
    // dùng chung (nếu lấy, máy nào đã tạo texture từ trước sẽ lệch dãy số -> nhà / cây dựng khác nhau giữa các máy)
    let kh = 2166136261;
    for (let i = 0; i < key.length; i++) kh = Math.imul(kh ^ key.charCodeAt(i), 16777619);
    withSeed(kh >>> 0, () => draw(g, w, h));
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
  // Bê tông nứt toác: vài đường nứt dài giữ hướng (gãy khúc nhẹ, mảnh dần, rẽ nhánh ít) + mảng tróc lộ cốt liệu xám sáng.
  // Không vẽ chấm tròn / thép gỉ: texture lặp trên mọi khối nên chi tiết đặc trưng nào cũng thành hoa văn lộ liễu.
  function crackedTex() {
    return canvasTex('concreteCracked', 256, 256, (g, w, h) => {
      g.drawImage(concreteTex().image, 0, 0);
      g.lineCap = 'round'; g.lineJoin = 'round';
      const crack = (x, y, a, len, lw, depth) => {
        const steps = Math.max(3, Math.round(len / 9));
        for (let s = 0; s < steps; s++) {
          a += rand(-0.45, 0.45);
          const nx = x + Math.cos(a) * len / steps, ny = y + Math.sin(a) * len / steps;
          const cw = Math.max(0.6, lw * (1 - s / steps * 0.7));
          g.strokeStyle = 'rgba(205,200,190,0.35)'; g.lineWidth = cw + 0.8;
          g.beginPath(); g.moveTo(x + 0.7, y + 0.7); g.lineTo(nx + 0.7, ny + 0.7); g.stroke();
          g.strokeStyle = 'rgba(28,25,22,0.8)'; g.lineWidth = cw;
          g.beginPath(); g.moveTo(x, y); g.lineTo(nx, ny); g.stroke();
          x = nx; y = ny;
          if (depth > 0 && RNG() < 0.22) crack(x, y, a + (RNG() < 0.5 ? 1 : -1) * rand(0.5, 1.1), len * rand(0.25, 0.45), cw * 0.7, depth - 1);
        }
      };
      // Nứt chạy xiên chéo dài xuyên khối (tường bị ép / rung) - đi qua mép để nối liền giữa các khối lặp
      for (let k = 0; k < 4; k++) crack(RNG() * w, RNG() * h, rand(0, 6.28), rand(110, 200), rand(1.4, 2.2), 2);
      // Mảng tróc nham nhở: bê tông tươi sáng hơn, lấm tấm đá dăm, mép dưới đổ bóng
      for (let k = 0; k < 3; k++) {
        const cx = RNG() * w, cy = RNG() * h, R = rand(9, 18), n = 11;
        const pts = [];
        for (let i = 0; i < n; i++) { const a = i / n * 6.283; const r = R * rand(0.55, 1.2); pts.push([cx + Math.cos(a) * r * 1.3, cy + Math.sin(a) * r]); }
        g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath();
        g.fillStyle = 'rgba(176,171,160,0.85)'; g.fill();
        g.strokeStyle = 'rgba(45,42,38,0.55)'; g.lineWidth = 1.2; g.stroke();
        for (let i = 0; i < 24; i++) {
          const v = 95 + Math.floor(RNG() * 70);
          g.fillStyle = `rgba(${v},${v - 3},${v - 8},0.8)`;
          g.fillRect(cx + rand(-R, R), cy + rand(-R * 0.7, R * 0.7), rand(1, 3), rand(1, 2.5));
        }
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
  // Lỗ xuyên khối (hệ đơn vị -0.5..0.5, z = bề dày): miệng lỗ mặt trước loe rộng (bê tông bong vảy quanh điểm chạm),
  // lòng lỗ hẹp ở giữa bề dày, mặt sau bong mảng rộng hơn (sóng ứng suất phản xạ làm bê tông vỡ toác phía sau).
  // kF / kB: bán kính miệng trước / sau so với lòng lỗ (rx, ry). Mép lỗ lởm chởm, ba lớp cùng dáng nhưng lệch nhau.
  function boreGeo(cx, cy, rx, ry, kF, kB) {
    const n = 18, base = [];
    for (let i = 0; i < n; i++) base.push(rand(0.62, 1.32) * (RNG() < 0.2 ? rand(1.15, 1.45) : 1));
    const lim = 0.46;
    const ring = (k, jit) => {
      const out = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rand(-0.12, 0.12);
        const r = base[i] * k * (jit ? rand(0.8, 1.2) : 1);
        let dx = Math.cos(a) * rx * r, dy = Math.sin(a) * ry * r;
        // co điểm vào trong khối theo phương bán kính (không kẹp từng trục -> không tạo mép thẳng)
        const f = Math.min(1, dx ? (Math.sign(dx) * lim - cx) / dx : 1, dy ? (Math.sign(dy) * lim - cy) / dy : 1);
        out.push(new THREE.Vector2(cx + dx * f, cy + dy * f));
      }
      return out;
    };
    const F = ring(kF, true), M = ring(1, false), Bk = ring(kB, true);
    const sq = [new THREE.Vector2(-0.5, -0.5), new THREE.Vector2(0.5, -0.5), new THREE.Vector2(0.5, 0.5), new THREE.Vector2(-0.5, 0.5)];
    const face = (hole, z) => {
      const sh = new THREE.Shape(z > 0 ? sq : sq.map(v => new THREE.Vector2(-v.x, v.y)));
      sh.holes.push(new THREE.Path(z > 0 ? hole : hole.map(v => new THREE.Vector2(-v.x, v.y))));
      const g = new THREE.ShapeGeometry(sh);
      const p = g.attributes.position, uv = g.attributes.uv;
      for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) + 0.5, p.getY(i) + 0.5);
      return place(g, [0, 0, z > 0 ? 0.5 : -0.5], [0, z > 0 ? 0 : Math.PI, 0]);
    };
    const parts = [face(F, 1), face(Bk, -1)];
    parts.push(place(new THREE.PlaneGeometry(1, 1), [0.5, 0, 0], [0, Math.PI / 2, 0]), place(new THREE.PlaneGeometry(1, 1), [-0.5, 0, 0], [0, -Math.PI / 2, 0]),
      place(new THREE.PlaneGeometry(1, 1), [0, 0.5, 0], [-Math.PI / 2, 0, 0]), place(new THREE.PlaneGeometry(1, 1), [0, -0.5, 0], [Math.PI / 2, 0, 0]));
    // Vách lòng lỗ: nối miệng trước -> eo giữa -> miệng sau, tam giác quay mặt vào trục lỗ
    const pos = [], uvs = [];
    const zs = [[F, 0.5], [M, rand(-0.12, 0.12)], [Bk, -0.5]];
    const tri = (A, B, C) => {
      const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz;
      const mx = (A[0] + B[0] + C[0]) / 3 - cx, my = (A[1] + B[1] + C[1]) / 3 - cy;
      const list = nx * mx + ny * my > 0 ? [A, C, B] : [A, B, C];   // pháp tuyến phải hướng vào tâm lỗ
      for (const q of list) { pos.push(q[0], q[1], q[2]); uvs.push(q[3], q[2] + 0.5); }
    };
    for (let l = 0; l < 2; l++) {
      const [P, za] = zs[l], [Q, zb] = zs[l + 1];
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const a = [P[i].x, P[i].y, za, i / n], b = [P[j].x, P[j].y, za, (i + 1) / n], c = [Q[j].x, Q[j].y, zb, (i + 1) / n], d = [Q[i].x, Q[i].y, zb, i / n];
        tri(a, b, c); tri(a, c, d);
      }
    }
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    tg.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    tg.computeVertexNormals();
    parts.push(tg);
    return merge(parts);
  }
  // Đường gãy tự nhiên: dao động tần số thấp (mảng vỡ lớn) + sứt nhỏ, thỉnh thoảng gãy bậc -> không thành răng cưa đều
  function crackProfile(n, amp) {
    const out = [];
    let v = 0, slope = rand(-1, 1) * amp;
    for (let i = 0; i <= n; i++) {
      slope = (slope + rand(-1, 1) * amp * 0.9) * 0.75;
      v += slope;
      if (RNG() < 0.12) v += rand(-1, 1) * amp * 1.6;
      out.push(v + rand(-0.5, 0.5) * amp * 0.35);
    }
    const m = out.reduce((a, b) => a + b, 0) / out.length;
    return out.map(x => x - m);
  }
  // Viền khối bị khuyết vỡ: chu vi chia nhỏ, từng điểm co về tâm theo "vết ăn" của các cạnh bị vỡ lan sang
  // (khối hình sao quanh tâm nên co theo bán kính không bao giờ tự cắt). sides: chuỗi 'L' 'R' 'T' 'B'.
  function bittenShape(sides) {
    const E = [['B', -0.5, -0.5, 0.5, -0.5], ['R', 0.5, -0.5, 0.5, 0.5], ['T', 0.5, 0.5, -0.5, 0.5], ['L', -0.5, 0.5, -0.5, -0.5]];
    const has = c => sides.includes(c);
    const pts = [];
    const M = 16;
    for (let e = 0; e < 4; e++) {
      const [key, x0, y0, x1, y1] = E[e];
      const on = has(key), prev = has(E[(e + 3) % 4][0]), next = has(E[(e + 1) % 4][0]);
      // tâm vết ăn dồn về góc có cạnh kề cũng vỡ -> góc khối mất hẳn một mảng
      const tc = prev && next ? rand(0.4, 0.6) : prev ? rand(0.1, 0.4) : next ? rand(0.6, 0.9) : rand(0.25, 0.75);
      const hw = prev && next ? rand(0.65, 0.95) : prev || next ? rand(0.45, 0.8) : rand(0.25, 0.55);
      const D = rand(0.2, 0.62);
      const prof = crackProfile(M, 0.06);
      const skew = rand(0.5, 1.6);   // vết ăn lệch một phía
      for (let i = 0; i < M; i++) {
        const t = i / M;
        let k = 0;
        if (on) {
          const u = (t - tc) / (t < tc ? hw : hw * skew);
          k = Math.abs(u) < 1 ? D * Math.pow(1 - u * u, 0.55) : 0;
          if (k > 0.02) k = Math.max(0.02, Math.min(0.78, k + prof[i] * 1.4));
        }
        const sc = 1 - k;
        pts.push(new THREE.Vector2((x0 + (x1 - x0) * t) * sc, (y0 + (y1 - y0) * t) * sc));
      }
    }
    return extrudeUnit(new THREE.Shape(pts));
  }
  // Cốt thép lòi khỏi mép gãy: chân thanh ngập trong bê tông bên dưới mép, phần lòi ra cong queo cùng một hướng chung;
  // thép nằm ở 2 lớp sát 2 mặt tường (lớp bê tông bảo vệ), khoảng cách không đều
  function rebarAlong(tops) {
    const topAt = x => {
      for (let i = 1; i < tops.length; i++) {
        const [xa, ya] = tops[i - 1], [xb, yb] = tops[i];
        if ((x <= xa && x >= xb) || (x >= xa && x <= xb)) return ya + (yb - ya) * ((x - xa) / ((xb - xa) || 1));
      }
      return tops[0][1];
    };
    const parts = [];
    const n = 2 + Math.floor(RNG() * 4);
    const bendDir = rand(-1, 1);
    for (let i = 0; i < n; i++) {
      const x = -0.4 + (i + rand(0.15, 0.85)) * (0.8 / n);
      const z = (RNG() < 0.5 ? -1 : 1) * rand(0.22, 0.34);
      const y0 = topAt(x) - 0.14;
      const L = rand(0.1, 0.42), h1 = 0.14 + L * rand(0.35, 0.7), h2 = L * rand(0.5, 0.9);
      parts.push(place(new THREE.CylinderGeometry(0.015, 0.017, h1, 4), [x, y0 + h1 / 2, z]));
      const bg = place(new THREE.CylinderGeometry(0.013, 0.015, h2, 4), [0, h2 / 2, 0]);
      bg.applyMatrix4(new THREE.Matrix4().makeRotationZ((bendDir + rand(-0.6, 0.6)) * 1.1));
      bg.applyMatrix4(new THREE.Matrix4().makeRotationY(rand(-0.6, 0.6)));
      bg.translate(x, y0 + h1, z);
      parts.push(bg);
    }
    return merge(parts);
  }
  const FRACTURE = {
    // Khối thủng lỗ méo (đạn xuyên / nổ sát): biến thể dùng chung cho mảng tường nhà
    holed() {
      const R = rand(0.16, 0.22);
      return boreGeo(rand(-0.1, 0.1), rand(-0.08, 0.1), R, R, rand(1.3, 1.6), rand(1.4, 1.9));
    },
    // Gốc khối còn lại sau khi vỡ: mép trên gãy thành mảng lớn nghiêng lệch, có bậc gãy, cao thấp thất thường
    remnant() {
      const n = 18, prof = crackProfile(n, 0.075);
      const base = rand(-0.3, 0.1), tilt = rand(-0.35, 0.35);
      const tops = [];
      for (let i = 0; i <= n; i++) {
        const x = 0.5 - i / n;
        tops.push([x, Math.max(-0.44, Math.min(0.4, base + tilt * x + prof[i]))]);
      }
      const pts = [new THREE.Vector2(-0.5, -0.5), new THREE.Vector2(0.5, -0.5)];
      for (const [x, y] of tops) pts.push(new THREE.Vector2(x, y));
      const geo = extrudeUnit(new THREE.Shape(pts));
      geo.userData.rebar = rebarAlong(tops);
      return geo;
    },
    bite(sides) { return bittenShape(sides); }
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
      // Mặt tường nguyên nhưng kính cửa đã vỡ do sóng nổ (nhà cửa)
      if (opts.shatterMat) this.pools.shatter = new Pool(parent, box, opts.shatterMat, cap, { color: true });
      this.variants = {};
      this.parent = parent; this.intactMat = intactMat; this.brokenMat = brokenMat; this.cap = cap;
      this.vN = opts.variants || 3;
      this.nCustom = 0;
      this.maxCustom = opts.maxCustom !== undefined ? opts.maxCustom : 40;
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
        const pool = new Pool(this.parent, geo, broken ? this.brokenMat : this.intactMat, cap, { color: true });
        if (geo.userData.rebar) pool.rebar = new Pool(this.parent, geo.userData.rebar, REBAR_MAT(), cap, { castShadow: false });
        list.push(pool);
      }
      return list;
    }
    poolFor(type) {
      if (type === 'box') return this.pools.box;
      if (type === 'shatter' && this.pools.shatter) return this.pools.shatter;
      const list = this.variants[type] || this.makeVariants(type);
      return list[Math.floor(RNG() * list.length)];
    }
    add(type, matrix, color) {
      // Gốc gãy & mép khuyết là phần nhìn thấy rõ của lỗ vỡ -> mỗi khối một hình riêng (sinh lúc vỡ), không lặp mẫu.
      // Quá nhiều khối vỡ thì quay về vài mẫu dùng chung để giữ số lần vẽ thấp.
      if ((type === 'remnant' || type.startsWith('bite')) && this.nCustom < this.maxCustom) {
        const geo = FRACTURE[type] ? FRACTURE[type]() : FRACTURE.bite(type.slice(4));
        const h = this.addCustom(geo, matrix, color || new THREE.Color(1, 1, 1), false, type === 'remnant' ? this.brokenMat : this.intactMat);
        h.type = type;
        return h;
      }
      const pool = this.poolFor(type);
      const idx = pool.add(matrix, color);
      if (idx < 0) return null;
      const h = { type, pool, idx, m: matrix.clone(), c: color ? color.clone() : new THREE.Color(1, 1, 1), extra: [] };
      if (type === 'remnant') { const rp = pool.rebar || this.rebarStub; const r = rp.add(matrix); if (r >= 0) h.extra.push([rp, r]); }
      if (type === 'holed') { const r = this.rebarGrid.add(matrix); if (r >= 0) h.extra.push([this.rebarGrid, r]); }
      return h;
    }
    // Khối mang hình vỡ riêng (lỗ xuyên đúng chỗ đạn chạm, gốc gãy / mép khuyết riêng từng khối): 1 instance riêng,
    // cùng kiểu handle với các khối khác
    addCustom(geo, matrix, color, grid, mat) {
      const pool = new Pool(this.parent, geo, mat || this.brokenMat, 1, { color: true });
      const idx = pool.add(matrix, color);
      pool.commit();
      this.nCustom++;
      const h = { type: 'custom', custom: true, owner: this, pool, idx, m: matrix.clone(), c: color.clone(), extra: [] };
      if (grid) { const r = this.rebarGrid.add(matrix); if (r >= 0) h.extra.push([this.rebarGrid, r]); this.rebarGrid.commit(); }
      if (geo.userData.rebar) {
        const rp = new Pool(this.parent, geo.userData.rebar, REBAR_MAT(), 1, { castShadow: false });
        rp.add(matrix); rp.commit();
        h.rebarMesh = rp.mesh;
      }
      return h;
    }
    hide(h) {
      if (!h) return;
      if (h.custom) {
        this.parent.remove(h.pool.mesh); h.pool.mesh.geometry.dispose();
        if (h.rebarMesh) { this.parent.remove(h.rebarMesh); h.rebarMesh.geometry.dispose(); h.rebarMesh = null; }
        if (!h.freed) { h.freed = true; h.owner.nCustom--; }
      }
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
      if (this.pools.shatter) this.pools.shatter.commit();
      for (const t in this.variants) for (const p of this.variants[t]) { p.commit(); if (p.rebar) p.rebar.commit(); }
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
      fx.hardRocks.add({ x: x + rand(-2, 2), y: y + rand(-1, 2), z: z + rand(-2, 2), vx: Math.cos(a) * sp, vy: rand(10, up || 45), vz: Math.sin(a) * sp, size: rand(sz * 0.25, sz * 0.6), life: rand(3, 6), c: col || [0.47, 0.46, 0.43] });
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

    // ---- ĐỒNG BỘ: mỗi cây 1 ký tự (0 nguyên, B trụi lá / cháy rụi, F đã đổ) + áp hợp nhất
    stateString() {
      let s = '';
      for (const it of this.items) s += it.fallen ? 'F' : (it.crownGone || it.state === 'burnt') ? 'B' : '0';
      return s;
    }
    applyState(str, fx) {
      const s = String(str || '');
      this.items.forEach((it, i) => {
        const c = s[i];
        if (c === 'F' && !it.fallen) this.fell(it, Math.cos(i), Math.sin(i), fx);
        else if (c === 'B' && !it.fallen && !it.crownGone) {
          it.crownGone = true;
          if (it.ci >= 0) it.V.crown.hide(it.ci);
          this.reweigh(it);
        }
      });
    }

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
  // NHÀ CỬA — kích thước thật (8 đơn vị = 1 m): tầng cao ~3 m, khoang cửa sổ ~3 m, tường bao dày ~0,27 m.
  // Mỗi mảng tường (1 khoang x 1 tầng) còn nguyên là 1 instance dùng chung; trúng đạn thì chuyển sang lưới ô ~0,2 m
  // riêng: đạn khoét ĐÚNG điểm chạm, theo loại đạn & góc bắn (lỗ xuyên, vành bê tông bóc lở, muội khói, cốt thép
  // cong lòi ra), lỗ liền mạch qua mép các mảng kề nhau, mảnh tường treo không còn chỗ bám thì rơi xuống.
  // Sàn / mái chia ô theo khoang (thủng / sập từng ô), đạn bay lọt qua lỗ đã có và nổ bên trong nhà.
  // ===========================================================================
  const STYLE = {
    office: { tex: 'office', colors: [0xb9c2c8, 0xa8b0b5, 0xc8c2b4], floorH: 27, bay: 28, roof: 'flat', rc: true, mat: 'concrete' },
    apartment: { tex: 'apt', colors: [0xe0d4bc, 0xd8c3a5, 0xc9cfd2, 0xe6d9c6, 0xc7b39a], floorH: 25, bay: 26, roof: 'flat', rc: true, mat: 'concrete' },
    shop: { tex: 'shop', colors: [0xe7dfcf, 0xd9c7aa, 0xcfc8be], floorH: 26, bay: 26, roof: 'flat', rc: true, mat: 'concrete' },
    ruin: { tex: 'apt', colors: [0x9c968c, 0x8e8a82], floorH: 25, bay: 26, roof: 'flat', ruined: true, rc: true, mat: 'concrete' },
    mudbrick: { tex: 'adobe', colors: [0xffffff, 0xf0e6d6], floorH: 22, bay: 22, roof: 'flat', mat: 'adobe' },
    stone: { tex: 'stone', colors: [0xffffff, 0xe8e4dc], floorH: 22, bay: 22, roof: 'pitched', mat: 'stone' },
    stilt: { tex: 'wood', colors: [0xffffff, 0xeadcc4], floorH: 21, bay: 22, roof: 'pitched', mat: 'wood' },
    farm: { tex: 'apt', colors: [0xf2ede2, 0xe9dcc4, 0xd7d2c7], floorH: 22, bay: 24, roof: 'pitched', rc: true, mat: 'concrete' },
    hangar: { tex: 'metal', colors: [0x9aa08e, 0xa7a99c, 0x8f9583], floorH: 52, bay: 36, roof: 'arched', mat: 'metal' }
  };
  // Vật liệu tường: độ dày, màu mặt gãy, độ giòn (hệ số lỗ thủng), màu bụi
  const WALLMAT = {
    concrete: { T: 2.2, edge: [0.6, 0.58, 0.54], k: 1.0, dust: [0.72, 0.7, 0.66] },
    adobe: { T: 3.2, edge: [0.68, 0.56, 0.4], k: 1.25, dust: [0.78, 0.68, 0.52] },
    stone: { T: 3.6, edge: [0.58, 0.56, 0.52], k: 0.8, dust: [0.7, 0.68, 0.64] },
    wood: { T: 1.4, edge: [0.48, 0.34, 0.2], k: 1.5, dust: [0.55, 0.45, 0.32] },
    metal: { T: 0.7, edge: [0.4, 0.42, 0.4], k: 1.35, dust: [0.6, 0.6, 0.58] }
  };
  // Tác động lên nhà theo loại đạn (đơn vị thế giới, 8 = 1 m):
  //  hole: bán kính lỗ xuyên tường · crater: vành bê tông bóc lở quanh lỗ · soot: muội khói · glass: sóng nổ làm vỡ kính
  //  sp/sr: sức & bán kính phá kết cấu (cột, ô sàn, mái) · chip: đạn nhỏ đục dần từng phát · ric: ngưỡng cos góc chạm thì nảy
  //  exit: đạn động năng xuyên qua nhà, khoét lỗ ra ở vách đối diện · heat: luồng nổ lõm phụt vào trong
  const BLD = {
    SCOUT_BULLET: { hole: 0, crater: 0.9, chip: 0.34, soot: 0, glass: 1.5, sp: 0, sr: 0, kin: true, ric: 0.4 },
    GATLING_BULLET: { hole: 0, crater: 1.5, chip: 0.55, soot: 1.8, glass: 4, sp: 0.02, sr: 3, kin: true, ric: 0.36 },
    INCENDIARY: { hole: 0, crater: 1.3, chip: 0.4, soot: 3.5, glass: 3, sp: 0.01, sr: 3, kin: true, ric: 0.36 },
    AP: { hole: 2.6, crater: 4.6, soot: 0, glass: 10, sp: 0.25, sr: 5, kin: true, ric: 0.24, exit: 3.6 },
    RPG: { hole: 2.6, crater: 5.4, soot: 9, glass: 34, sp: 0.5, sr: 10, heat: true },
    ANTI_TANK_MISSILE: { hole: 3.6, crater: 7, soot: 12, glass: 44, sp: 0.8, sr: 13, heat: true },
    CLUSTER_SUBMUNITION: { hole: 2.6, crater: 5, soot: 8, glass: 28, sp: 0.5, sr: 9, heat: true },
    NORMAL: { hole: 6.5, crater: 10, soot: 15, glass: 60, sp: 1.1, sr: 20 },
    CLUSTER: { hole: 6, crater: 9.5, soot: 14, glass: 55, sp: 1.0, sr: 20 },
    HE: { hole: 10, crater: 14.5, soot: 21, glass: 90, sp: 1.7, sr: 28 }
  };
  function bldInfo(ammo, heavy) {
    const a = BLD[ammo] || BLD.NORMAL;
    if (!heavy) return a;
    // Pháo 152/155 mm: lỗ thủng 4-5 m, phá cả cột / ô sàn quanh điểm nổ
    return Object.assign({}, a, { hole: a.hole * 1.8, crater: a.crater * 1.7, soot: a.soot * 1.6, glass: a.glass * 1.8, sp: a.sp * 2.0, sr: a.sr * 1.7 });
  }
  const hash3 = (x, y, s) => { const k = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return k - Math.floor(k); };
  // Nhiễu méo viền lỗ theo góc, dùng chung cho mọi mảng của cùng một phát -> lỗ liền mạch qua mép 2 mảng kề nhau
  function holeNoise() {
    const h = [2, 3, 5, 7].map(k => ({ k, a: rand(0.04, 0.15) * (k > 4 ? 0.6 : 1), p: rand(0, 6.283) }));
    return a => { let s = 0; for (const q of h) s += q.a * Math.sin(q.k * a + q.p); return s; };
  }
  const NO_NOISE = () => 0;
  // Ô kính vỡ: lòng phòng tối, mảnh kính lởm chởm còn bám khung, vệt muội phía trên ô cửa
  function brokenWindowTex(style) {
    return canvasTex('winBroken_' + style, 128, 128, (g, w, h) => {
      g.drawImage(windowPanelTex(style).image, 0, 0);
      const rects = { office: [[6, 14, w - 12, h - 30]], adobe: [[48, 40, 32, 34]], stone: [[46, 38, 36, 40]], wood: [[40, 40, 48, 38]], metal: [],
        shop: [[38, 34, 25, 46], [65, 34, 25, 46], [8, 66, 112, 62]], apt: [[38, 34, 25, 46], [65, 34, 25, 46]] }[style] || [[38, 34, 25, 46], [65, 34, 25, 46]];
      for (const [x, y, rw, rh] of rects) {
        g.fillStyle = '#15130f'; g.fillRect(x, y, rw, rh);
        g.fillStyle = 'rgba(150,170,180,0.7)';
        for (let k = 0; k < 6; k++) {
          const side = Math.floor(RNG() * 4), t = RNG(), L = rand(4, 12);
          const px = side < 2 ? x + t * rw : (side === 2 ? x : x + rw), py = side >= 2 ? y + t * rh : (side === 0 ? y : y + rh);
          const cx = x + rw / 2, cy = y + rh / 2, dl = Math.hypot(cx - px, cy - py) || 1;
          g.beginPath(); g.moveTo(px - 3 * (cy - py) / dl, py + 3 * (cx - px) / dl); g.lineTo(px + 3 * (cy - py) / dl, py - 3 * (cx - px) / dl);
          g.lineTo(px + (cx - px) / dl * L, py + (cy - py) / dl * L); g.closePath(); g.fill();
        }
        const gr = g.createLinearGradient(0, y - 22, 0, y + 4);
        gr.addColorStop(0, 'rgba(20,18,16,0)'); gr.addColorStop(1, 'rgba(20,18,16,0.55)');
        g.fillStyle = gr; g.fillRect(x - 4, y - 22, rw + 8, 26);
      }
      if (style === 'metal') speckle(g, w, h, 60, ['rgba(20,20,20,0.6)'], 2, 4);
    });
  }
  // Đá vụn văng theo hướng (pháp tuyến mặt tường): n mảnh, cỡ sz, tốc độ sp
  function jet(fx, x, y, z, nx, ny, nz, n, sz, sp, col, spread) {
    if (!fx || !fx.hardRocks) return;
    const s = spread === undefined ? 0.7 : spread;
    for (let i = 0; i < n; i++) {
      const v = sp * rand(0.35, 1);
      fx.hardRocks.add({ x: x + rand(-1.5, 1.5), y: y + rand(-1.5, 1.5), z: z + rand(-1.5, 1.5),
        vx: (nx + rand(-s, s)) * v, vy: (ny + rand(-s * 0.4, s)) * v + rand(4, 20), vz: (nz + rand(-s, s)) * v,
        size: rand(sz * 0.25, sz * 0.7), life: rand(3, 6), c: col || [0.47, 0.46, 0.43] });
    }
  }
  function dustJet(fx, x, y, z, nx, nz, n, size, col, sp) {
    if (!fx || !fx.smoke) return;
    for (let i = 0; i < n; i++) {
      const v = (sp || 20) * rand(0.4, 1);
      fx.smoke.add({ x: x + rand(-1, 1) * size * 0.3, y: y + rand(-0.3, 0.5) * size * 0.3, z: z + rand(-1, 1) * size * 0.3,
        vx: nx * v + rand(-5, 5), vy: rand(2, 12), vz: nz * v + rand(-5, 5), size: size * rand(0.5, 0.9), grow: size * 0.45,
        drag: 1.6, grav: -1.2, life: rand(3, 6), alpha: 0.6, fadeIn: 0.06, c0: col || [0.7, 0.68, 0.64], cell: 2 });
    }
  }

  class BuildingSet {
    constructor(parent, list, groundAt) {
      this.group = new THREE.Group();
      this.group.name = 'buildings';
      parent.add(this.group);
      this.groundAt = groundAt;
      this.items = [];
      this.anim = [];
      this.vents = [];
      let slabs = 0, cols = 0, roofs = 0;
      const plans = list.map(b => {
        const st = STYLE[b.kind] || STYLE.apartment;
        const bx = Math.max(1, Math.round(b.w / st.bay)), bz = Math.max(1, Math.round(b.d / st.bay));
        const floors = b.kind === 'hangar' ? 1 : Math.max(1, b.floors | 0);
        slabs += (floors + 1) * bx * bz + 2;
        cols += 4 * floors + (bx > 2 && bz > 2 ? floors * 4 : 0);
        roofs += 1;
        return { b, st, bx, bz, floors };
      });
      const unit = new THREE.BoxGeometry(1, 1, 1);
      const cracked = new THREE.MeshStandardMaterial({ map: crackedTex(), roughness: 0.95 });
      // Mỗi kiểu mặt tường: khối nguyên / kính vỡ (instanced) + vật liệu lưới ô của mảng đã trúng đạn (màu theo đỉnh)
      this.panelKits = {};
      this.dmgMats = {};
      const counts = {};
      for (const p of plans) counts[p.st.tex] = (counts[p.st.tex] || 0) + 2 * (p.bx + p.bz) * p.floors;
      for (const key in counts) {
        const mat = new THREE.MeshStandardMaterial({ map: windowPanelTex(key), roughness: key === 'office' ? 0.35 : 0.9, metalness: key === 'office' ? 0.4 : key === 'metal' ? 0.5 : 0.02 });
        const shatterMat = new THREE.MeshStandardMaterial({ map: brokenWindowTex(key), roughness: 0.9, metalness: key === 'metal' ? 0.5 : 0.04 });
        this.panelKits[key] = new FractureKit(this.group, mat, cracked, counts[key], { variants: 1, shatterMat });
        this.dmgMats[key] = new THREE.MeshStandardMaterial({ map: brokenWindowTex(key), vertexColors: true, roughness: 0.92, metalness: key === 'metal' ? 0.4 : 0.02 });
      }
      this.slabPool = new Pool(this.group, unit, new THREE.MeshStandardMaterial({ map: slabTex(), roughness: 0.92 }), slabs, { color: true });
      this.colPool = new Pool(this.group, unit, new THREE.MeshStandardMaterial({ map: concreteTex(), roughness: 0.9 }), cols, { color: true });
      const prism = new THREE.CylinderGeometry(0.5, 0.5, 1, 3, 1);
      prism.rotateZ(Math.PI / 2); prism.rotateX(-Math.PI / 2); // nóc mái hướng lên trên, sống mái dọc trục X
      prism.translate(0, 0.25, 0);
      this.roofPool = new Pool(this.group, prism, new THREE.MeshStandardMaterial({ map: roofTileTex(), roughness: 0.8 }), roofs, { color: true });
      const arch = new THREE.CylinderGeometry(0.5, 0.5, 1, 18, 1, false, 0, Math.PI);
      arch.rotateZ(Math.PI / 2); // vòm cong lên trên, trục dọc theo X
      this.archPool = new Pool(this.group, arch, new THREE.MeshStandardMaterial({ map: windowPanelTex('metal'), roughness: 0.55, metalness: 0.5, side: THREE.DoubleSide }), roofs, { color: true });
      // Tảng bê tông lớn vương vãi trên đống đổ nát
      this.slabChunkPool = new Pool(this.group, jitter(new THREE.BoxGeometry(1, 1, 1, 2, 1, 2), 0.25, 9), cracked, list.length * 34, { color: true });
      // Gạch đá vỡ rơi xuống chân tường chỗ bị khoét thủng
      this.bitPool = new Pool(this.group, jitter(new THREE.DodecahedronGeometry(0.5, 0), 0.35, 5), cracked, list.length * 14 + 40, { color: true });
      this.rubbleMat = new THREE.MeshStandardMaterial({ map: cracked.map || null, vertexColors: true, roughness: 1, metalness: 0, flatShading: true });
      for (const p of plans) this.items.push(this.buildOne(p));
      for (const B of this.items) if (B.dmgPanels.size) this.rebuildDamage(B);
      this.commitAll();
    }

    commitAll() {
      for (const k in this.panelKits) this.panelKits[k].commit();
      [this.slabPool, this.colPool, this.roofPool, this.archPool, this.slabChunkPool, this.bitPool].forEach(pl => pl.commit());
    }

    buildOne(P) {
      const { b, st, bx, bz, floors } = P;
      const gy = this.groundAt(b.x, b.z);
      const WM = WALLMAT[st.mat || 'concrete'];
      const W = bx * st.bay, D = bz * st.bay, FH = st.floorH, T = WM.T;
      const base = new THREE.Matrix4().makeRotationY(b.angle || 0).setPosition(b.x, gy - 1.5, b.z);
      const color = new THREE.Color(st.colors[Math.floor(RNG() * st.colors.length)]);
      const B = { x: b.x, z: b.z, y: gy, w: W, d: D, bx, bz, floors, FH, T, st, WM, base, color, mods: [], collapsed: false, angle: b.angle || 0, kind: b.kind,
        hpTotal: 0, walls: [], levels: [], wgrid: { x1: [], 'x-1': [], z1: [], 'z-1': [] }, roofMod: null, dmgPanels: new Set(), cut: false, cutHold: 0, seedG: Math.floor(RNG() * 1e6) };
      const kit = this.panelKits[st.tex];
      const mk = (pool, lx, ly, lz, sx, sy, sz, ry, role, floor, hx, hy, hz) => {
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry || 0);
        const m = new THREE.Matrix4().compose(new THREE.Vector3(lx, ly, lz), q, new THREE.Vector3(sx, sy, sz));
        const world = base.clone().multiply(m);
        const c = color.clone().multiplyScalar(rand(0.92, 1.05));
        const hp = role === 'col' ? 2.2 : role === 'slab' ? 2.6 : role === 'roof' ? (pool === this.slabPool ? 2.2 : 3.0) : 1.0;
        const mod = { local: m, world, role, floor, ry: ry || 0, hp, hp0: hp, state: 'ok', c, lx, ly, lz, sx, hx: hx || sx / 2, hy: hy || sy / 2, hz: hz || sz / 2, id: B.mods.length };
        if (pool === 'panel') { mod.kit = kit; mod.h = kit.add('box', world, c); }
        else { mod.pool = pool; mod.idx = pool.add(world, c); }
        if (role === 'wall') {
          mod.ax = Math.cos(mod.ry); mod.az = -Math.sin(mod.ry);   // trục dọc tường của mảng
          mod.ox = Math.sin(mod.ry); mod.oz = Math.cos(mod.ry);    // pháp tuyến hướng ra ngoài nhà
          mod.frame = base.clone().multiply(new THREE.Matrix4().compose(new THREE.Vector3(lx, ly, lz), q, new THREE.Vector3(1, 1, 1)));
          B.walls.push(mod);
        }
        B.mods.push(mod);
        B.hpTotal += hp;
        return mod;
      };
      const ruined = !!st.ruined;
      const flatRoof = st.roof === 'flat';
      for (let f = 0; f < floors; f++) {
        const y = 1.5 + f * FH + FH / 2;
        if (ruined && f === floors - 1 && f > 0 && RNG() < 0.6) continue;
        for (let i = 0; i < bx; i++) {
          const lx = -W / 2 + st.bay * (i + 0.5);
          for (const s of [-1, 1]) {
            if (ruined && RNG() < 0.25) continue;
            const m = mk('panel', lx, y, s * (D / 2 - T / 2), st.bay, FH, T, s > 0 ? 0 : Math.PI, 'wall', f);
            B.wgrid['z' + s][f * bx + i] = m;
          }
        }
        for (let j = 0; j < bz; j++) {
          const lz = -D / 2 + st.bay * (j + 0.5);
          for (const s of [-1, 1]) {
            if (ruined && RNG() < 0.25) continue;
            const m = mk('panel', s * (W / 2 - T / 2), y, lz, st.bay, FH, T, s > 0 ? Math.PI / 2 : -Math.PI / 2, 'wall', f);
            B.wgrid['x' + s][f * bz + j] = m;
          }
        }
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) mk(this.colPool, sx * (W / 2 - 0.8), y, sz * (D / 2 - 0.8), 3.0, FH, 3.0, 0, 'col', f);
        if (bx > 2 && bz > 2) for (const sx of [-1, 1]) for (const sz of [-1, 1]) mk(this.colPool, sx * W / 6, y, sz * D / 6, 2.6, FH, 2.6, 0, 'col', f);
        // Sàn trần tầng f chia ô theo khoang (thủng / sập từng ô). Tầng trên cùng nhà mái bằng: ô mái thay cho sàn trần
        if (f === floors - 1 && flatRoof) continue;
        B.levels.push(this.tileLevel(B, mk, 1.5 + (f + 1) * FH, 1.6, 'slab', f, 0.6));
      }
      mk(this.slabPool, 0, 1.0, 0, W + 2, 2.2, D + 2, 0, 'base', -1);
      const topY = 1.5 + floors * FH;
      if (st.roof === 'pitched') {
        const rh = Math.min(W, D) * 0.42;
        B.roofMod = mk(this.roofPool, 0, topY + 0.6, 0, W + 3, rh / 0.75, (D + 3) / 0.866, 0, 'roof', floors, W / 2 + 1.5, rh / 2, D / 2 + 1.5);
        B.roofMod.ly = topY + 0.6 + rh / 2;
        B.roofShape = { kind: 'pitched', y0: topY + 0.6, h: rh, hx: W / 2 + 1.5, hz: D / 2 + 1.5 };
      } else if (st.roof === 'arched') {
        B.roofMod = mk(this.archPool, 0, topY - 0.5, 0, W, FH * 1.3, D, 0, 'roof', floors, W / 2, FH * 0.33, D / 2);
        B.roofMod.ly = topY - 0.5 + FH * 0.33;
        B.roofShape = { kind: 'arched', y0: topY - 0.5, h: FH * 0.65, hx: W / 2, hz: D / 2 };
      } else {
        B.levels.push(this.tileLevel(B, mk, topY + 1.4, 2.8, 'roof', floors, -0.25));
      }
      B.topY = topY;
      B.entry = { x: b.x, z: b.z, radius: Math.hypot(W, D) * 0.5 * 0.92, height: topY + 4, type: 'BUILDING', id: 'bldg-' + Math.round(b.x) + '-' + Math.round(b.z), ref: B };
      B.halfW = W / 2; B.halfD = D / 2;
      // Nhà đổ nát sẵn: vài lỗ đạn pháo cũ ám khói trên tường
      if (ruined) {
        for (const m of B.walls) {
          if (RNG() > 0.22) continue;
          const P2 = { hole: rand(3, 8), crater: rand(6, 11), soot: rand(6, 14), chip: 0, stretch: 1, tx: 1, ty: 0, noise: holeNoise(), seed: rand(0, 1000), inner: false };
          this.carve(B, m, rand(-0.3, 0.3) * st.bay, rand(-0.3, 0.3) * FH, P2);
        }
      }
      return B;
    }
    // Một lớp sàn / mái chia ô theo khoang; ô biên chìa ra ngoài tường 'over' đơn vị
    tileLevel(B, mk, y, th, role, f, over) {
      const { bx, bz, st } = B, W = bx * st.bay, D = bz * st.bay;
      const L = { y, th, role, f, tiles: [] };
      for (let i = 0; i < bx; i++) {
        for (let j = 0; j < bz; j++) {
          const ex0 = i === 0 ? over : 0, ex1 = i === bx - 1 ? over : 0, ez0 = j === 0 ? over : 0, ez1 = j === bz - 1 ? over : 0;
          const sx = st.bay + ex0 + ex1, sz = st.bay + ez0 + ez1;
          const lx = -W / 2 + st.bay * (i + 0.5) + (ex1 - ex0) / 2, lz = -D / 2 + st.bay * (j + 0.5) + (ez1 - ez0) / 2;
          const t = mk(this.slabPool, lx, y, lz, sx, th, sz, 0, role, f);
          t.ti = i; t.tj = j;
          L.tiles.push(t);
        }
      }
      return L;
    }

    toLocal(B, x, y, z) {
      const dx = x - B.x, dz = z - B.z;
      const c = Math.cos(-B.angle), s = Math.sin(-B.angle);
      return { x: dx * c + dz * s, y: y - (B.y - 1.5), z: -dx * s + dz * c };
    }
    toWorld(B, lx, ly, lz) {
      const c = Math.cos(B.angle), s = Math.sin(B.angle);
      return { x: B.x + lx * c + lz * s, y: ly + B.y - 1.5, z: B.z - lx * s + lz * c };
    }
    dirToWorld(B, x, y, z) { const c = Math.cos(B.angle), s = Math.sin(B.angle); return { x: x * c + z * s, y, z: -x * s + z * c }; }
    dirToLocal(B, d) { const c = Math.cos(B.angle), s = Math.sin(B.angle); return { x: d.x * c - d.z * s, y: d.y, z: d.x * s + d.z * c }; }

    modWorldPos(m) { return new THREE.Vector3().setFromMatrixPosition(m.world); }
    hideMod(m) { if (m.kit) { if (m.h) m.kit.hide(m.h); } else m.pool.hide(m.idx); }
    tintMod(m, c) { if (m.kit) { if (m.h) m.kit.color(m.h, c); } else m.pool.color(m.idx, c); }

    // ---- ĐỒNG BỘ: trạng thái gọn từng nhà ('C' = đã sập; mỗi mô-đun 1 ký tự: 0 nguyên, 1 vỡ kính / sứt mặt, 2 thủng, 4 mất hẳn)
    stateString() {
      const R = { ok: 0, glass: 1, scarred: 1, holed: 2, stub: 3, gone: 4 };
      return this.items.map(B => B.collapsed ? 'C' : B.mods.map(m => R[m.state] || 0).join('')).join('|');
    }
    // Áp trạng thái của máy khác theo kiểu HỢP NHẤT: chỉ phá thêm, không dựng lại (phá hủy luôn cộng dồn)
    applyState(str, fx) {
      const R = { ok: 0, glass: 1, scarred: 1, holed: 2, stub: 3, gone: 4 };
      const parts = String(str || '').split('|');
      this._syncing = true;
      try {
        parts.forEach((code, i) => {
          const B = this.items[i];
          if (!B || B.collapsed || !code) return;
          if (code === 'C') { this.collapse(B, fx); return; }
          let changed = false;
          B.mods.forEach((m, k) => {
            const t = +code[k] || 0, cur = R[m.state] || 0;
            if (t <= cur) return;
            if (t >= 3) { this.setGone(B, m, fx, true); changed = true; }
            else if (m.role === 'wall' && t === 2) {
              this.carve(B, m, 0, 0, { hole: B.st.bay * 0.3, crater: B.st.bay * 0.45, soot: B.st.bay * 0.5, chip: 0, stretch: 1, tx: 1, ty: 0, noise: holeNoise(), seed: rand(0, 1000), inner: false });
              changed = true;
            } else if (m.role === 'wall' && t === 1) { this.shatter(B, m, null); changed = true; }
          });
          if (changed) { this.rebuildDamage(B); this.checkStructure(B, fx); }
        });
      } finally { this._syncing = false; }
      this.commitAll();
    }

    // ---------------------------------------------------------------------------
    // LƯỚI Ô CỦA MẢNG TƯỜNG ĐÃ TRÚNG ĐẠN
    // ---------------------------------------------------------------------------
    toMask(B, m) {
      const nx = Math.max(6, Math.round(B.st.bay / 1.7)), ny = Math.max(6, Math.round(B.FH / 1.7)), n = nx * ny;
      m.mk = { nx, ny, cw: B.st.bay / nx, ch: B.FH / ny, s: new Uint8Array(n).fill(1), hp: new Float32Array(n).fill(1),
        so: new Uint8Array(n), si: new Uint8Array(n), st: new Uint8Array(n), gone: 0, bow: -1, ver: 1 };
      // mảng tường giờ có hình riêng: bỏ instance dùng chung
      if (m.h) { m.kit.hide(m.h); m.h = null; }
      if (m.state === 'ok' || m.state === 'glass') m.state = 'scarred';
      B.dmgPanels.add(m);
      return m.mk;
    }
    // Ô tại điểm (hệ tọa độ nhà) có còn đặc không
    cellSolid(B, m, L) {
      const K = m.mk;
      if (!K) return true;
      const rx = L.x - m.lx, rz = L.z - m.lz;
      const px = rx * m.ax + rz * m.az, py = L.y - m.ly;
      const i = Math.max(0, Math.min(K.nx - 1, Math.floor((px + B.st.bay / 2) / K.cw)));
      const j = Math.max(0, Math.min(K.ny - 1, Math.floor((py + B.FH / 2) / K.ch)));
      return K.s[j * K.nx + i] === 1;
    }
    /**
     * Khoét mảng tường m tại (px, py) (hệ mảng: x dọc tường, y đứng, tâm mảng = 0).
     * P: hole / crater / soot (bán kính), chip (đạn nhỏ đục dần), stretch + (tx, ty) (kéo dài theo hướng đạn khi bắn xiên),
     *    noise (méo viền theo góc), seed, inner (nổ từ phía trong nhà -> bóc lở mặt trong)
     */
    carve(B, m, px, py, P) {
      if (m.state === 'gone') return { removed: 0 };
      const K = m.mk || this.toMask(B, m);
      const bay = B.st.bay, FH = B.FH;
      const Rm = Math.max(P.hole * 1.5, P.crater * 1.4, P.soot * 1.3) * Math.max(1, P.stretch) + 2;
      const gx0 = m.lx * m.ax + m.lz * m.az;
      let removed = 0, sx = 0, sy = 0, touched = false;
      for (let j = 0; j < K.ny; j++) {
        const cy = -FH / 2 + (j + 0.5) * K.ch, dy = cy - py;
        if (Math.abs(dy) > Rm) continue;
        for (let i = 0; i < K.nx; i++) {
          const k = j * K.nx + i;
          if (!K.s[k]) continue;
          const cx = -bay / 2 + (i + 0.5) * K.cw, dx = cx - px;
          if (Math.abs(dx) > Rm) continue;
          const a = dx * P.tx + dy * P.ty, b = -dx * P.ty + dy * P.tx;
          const d = Math.hypot(a / P.stretch, b);
          const nn = 1 + P.noise(Math.atan2(dy, dx)) + (hash3(cx + gx0, cy + m.ly, P.seed) - 0.5) * 0.24;
          const hR = P.hole * nn;
          if (hR > 0 && d < hR) { K.s[k] = 0; removed++; sx += cx; sy += cy; continue; }
          const cR = P.crater * nn;
          if (d < cR) {
            touched = true;
            let lvl;
            if (P.chip) {
              K.hp[k] -= P.chip * (1 - d / cR);
              lvl = Math.min(3, 1 + Math.floor((1 - Math.max(0, K.hp[k])) * 3));
            } else lvl = Math.min(3, 1 + Math.floor(2.99 * (1 - (d - Math.max(0, hR)) / Math.max(0.5, cR - Math.max(0, hR)))));
            if (P.inner) K.si[k] = Math.max(K.si[k], lvl); else K.so[k] = Math.max(K.so[k], lvl);
            // bóc lở cả 2 mặt / đục mãi một chỗ: thủng xuyên
            if ((P.chip && K.hp[k] <= 0) || K.so[k] + K.si[k] >= 5) { K.s[k] = 0; removed++; sx += cx; sy += cy; continue; }
          }
          if (P.soot > 0 && !P.inner) {
            const sR = P.soot * nn;
            if (d < sR) { K.st[k] = Math.min(255, K.st[k] + 235 * Math.pow(1 - d / sR, 1.3)); touched = true; }
          }
        }
      }
      let islands = 0;
      if (removed) islands = this.dropIslands(K);
      K.gone += removed + islands;
      if (removed || touched) { K.ver++; K.bow = P.inner ? 1 : -1; }
      if (K.gone >= K.nx * K.ny * 0.82) { this.setGone(B, m, null); }
      else if (K.gone > 0) m.state = 'holed';
      return { removed: removed + islands, cx: removed ? sx / removed : px, cy: removed ? sy / removed : py };
    }
    // Mảng tường treo lơ lửng (không còn dính vào mép mảng nào) rơi xuống
    dropIslands(K) {
      const { nx, ny, s } = K, seen = new Uint8Array(nx * ny), st = [];
      for (let i = 0; i < nx; i++) { st.push(i, (ny - 1) * nx + i); }
      for (let j = 0; j < ny; j++) { st.push(j * nx, j * nx + nx - 1); }
      while (st.length) {
        const k = st.pop();
        if (seen[k] || !s[k]) continue;
        seen[k] = 1;
        const i = k % nx, j = (k - i) / nx;
        if (i > 0) st.push(k - 1); if (i < nx - 1) st.push(k + 1);
        if (j > 0) st.push(k - nx); if (j < ny - 1) st.push(k + nx);
      }
      let n = 0;
      for (let k = 0; k < nx * ny; k++) if (s[k] && !seen[k]) { s[k] = 0; n++; }
      return n;
    }

    // Hình của 1 mảng tường đã trúng đạn (tọa độ thế giới): gộp ô theo hàng, mặt trước lõm theo mức bóc lở,
    // mặt gãy màu bê tông / gạch thô, muội khói đen dần về tâm vụ nổ
    panelGeo(B, m) {
      const K = m.mk, bay = B.st.bay, FH = B.FH, T = B.T, raw = B.WM.edge, cb = m.c;
      const P = [], N = [], U = [], C = [];
      const push = (a, b, c, d, n, uv, col) => {
        const vs = [a, b, c, a, c, d], us = [uv[0], uv[1], uv[2], uv[0], uv[2], uv[3]];
        for (let q = 0; q < 6; q++) { P.push(vs[q][0], vs[q][1], vs[q][2]); N.push(n[0], n[1], n[2]); U.push(us[q][0], us[q][1]); C.push(col[0], col[1], col[2]); }
      };
      const EUV = [[0.08, 0.92], [0.1, 0.92], [0.1, 0.94], [0.08, 0.94]];
      const uvR = (x0, x1, y0, y1) => [[x0 / bay + 0.5, y0 / FH + 0.5], [x1 / bay + 0.5, y0 / FH + 0.5], [x1 / bay + 0.5, y1 / FH + 0.5], [x0 / bay + 0.5, y1 / FH + 0.5]];
      for (let j = 0; j < K.ny; j++) {
        let i = 0;
        while (i < K.nx) {
          const k = j * K.nx + i;
          if (!K.s[k]) { i++; continue; }
          const so = K.so[k], si = K.si[k], sq = K.st[k] >> 5;
          let e = i + 1;
          while (e < K.nx) { const q = j * K.nx + e; if (!K.s[q] || K.so[q] !== so || K.si[q] !== si || (K.st[q] >> 5) !== sq) break; e++; }
          const x0 = -bay / 2 + i * K.cw, x1 = -bay / 2 + e * K.cw, y0 = -FH / 2 + j * K.ch, y1 = y0 + K.ch;
          const z1 = T / 2 - so * T * 0.2, z0 = -T / 2 + si * T * 0.2;
          const soot = 1 - 0.86 * (sq / 7);
          let fr = cb.r, fg = cb.g, fb = cb.b;
          if (so) { const t = 0.5 + 0.12 * so, sh = 1.04 - 0.1 * so; fr += (raw[0] * sh - fr) * t; fg += (raw[1] * sh - fg) * t; fb += (raw[2] * sh - fb) * t; }
          const front = [fr * soot, fg * soot, fb * soot];
          const back = si ? [raw[0] * 0.5, raw[1] * 0.5, raw[2] * 0.5] : [cb.r * 0.5, cb.g * 0.5, cb.b * 0.5];
          const ek = (0.72 + 0.14 * hash3(i, j, m.id)) * (1 - 0.5 * (sq / 7));
          const edge = [raw[0] * ek, raw[1] * ek, raw[2] * ek];
          push([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], so ? EUV : uvR(x0, x1, y0, y1), front);
          push([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], si ? EUV : uvR(x1, x0, y0, y1), back);
          push([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], EUV, edge);
          push([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], EUV, edge);
          push([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], EUV, edge);
          push([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], EUV, edge);
          i = e;
        }
      }
      const pos = new Float32Array(P), nrm = new Float32Array(N);
      const e = m.frame.elements, v = new THREE.Vector3();
      for (let q = 0; q < pos.length; q += 3) {
        v.set(pos[q], pos[q + 1], pos[q + 2]).applyMatrix4(m.frame);
        pos[q] = v.x; pos[q + 1] = v.y; pos[q + 2] = v.z;
        const x = nrm[q], y = nrm[q + 1], z = nrm[q + 2];
        nrm[q] = e[0] * x + e[4] * y + e[8] * z; nrm[q + 1] = e[1] * x + e[5] * y + e[9] * z; nrm[q + 2] = e[2] * x + e[6] * y + e[10] * z;
      }
      return { pos, nrm, uv: new Float32Array(U), col: new Float32Array(C) };
    }
    // Cốt thép trong lỗ thủng (nhà bê tông cốt thép): thanh còn neo 2 đầu thì cong võng theo hướng sóng nổ,
    // lỗ rộng / neo 1 đầu thì gãy cụt chĩa ra, mảng nổ bay sạch không còn neo thì mất luôn
    rebarGeo(B, m) {
      const K = m.mk, bay = B.st.bay, FH = B.FH, bow = K.bow;
      const r = seededRng((m.id * 9973 + K.ver * 131 + B.seedG) >>> 0);
      const rr = (a, b) => a + r() * (b - a);
      const segs = [];
      const bar = pts => { for (let q = 0; q + 1 < pts.length; q++) segs.push([pts[q], pts[q + 1]]); };
      const runs = (len, solidAt, cb) => {
        let a = -1;
        for (let t = 0; t <= len; t++) {
          const hole = t < len && !solidAt(t);
          if (hole && a < 0) a = t;
          if (!hole && a >= 0) { cb(a, t - 1, a > 0, t < len); a = -1; }
        }
      };
      const step = 3;
      for (let i = 1; i < K.nx && segs.length < 40; i += step) {
        const x = -bay / 2 + (i + 0.5) * K.cw;
        runs(K.ny, j => K.s[j * K.nx + i], (j0, j1, aB, aT) => {
          if (!aB && !aT) return;
          const ya = -FH / 2 + j0 * K.ch, yb = -FH / 2 + (j1 + 1) * K.ch, L = yb - ya;
          if (aB && aT && L < 15 && r() < 0.8) bar([[x, ya - 0.5, 0], [x + rr(-0.8, 0.8), (ya + yb) / 2, bow * L * rr(0.12, 0.3)], [x, yb + 0.5, 0]]);
          else {
            if (aB) { const l = Math.min(L * rr(0.25, 0.55), 7); bar([[x, ya - 0.5, 0], [x, ya + l * 0.45, bow * l * 0.1], [x + rr(-1, 1), ya + l * 0.8, bow * l * rr(0.4, 0.8)]]); }
            if (aT) { const l = Math.min(L * rr(0.25, 0.55), 7); bar([[x, yb + 0.5, 0], [x, yb - l * 0.45, bow * l * 0.1], [x + rr(-1, 1), yb - l * 0.8, bow * l * rr(0.4, 0.8)]]); }
          }
        });
      }
      for (let j = 1; j < K.ny && segs.length < 72; j += step) {
        const y = -FH / 2 + (j + 0.5) * K.ch;
        runs(K.nx, i => K.s[j * K.nx + i], (i0, i1, aL, aR) => {
          if (!aL && !aR) return;
          const xa = -bay / 2 + i0 * K.cw, xb = -bay / 2 + (i1 + 1) * K.cw, L = xb - xa;
          if (aL && aR && L < 15 && r() < 0.8) bar([[xa - 0.5, y, 0], [(xa + xb) / 2, y - rr(0.3, 1.6), bow * L * rr(0.12, 0.3)], [xb + 0.5, y, 0]]);
          else {
            if (aL) { const l = Math.min(L * rr(0.25, 0.55), 7); bar([[xa - 0.5, y, 0], [xa + l * 0.5, y - rr(0, 1), bow * l * 0.15], [xa + l * 0.85, y - rr(0.5, 2.5), bow * l * rr(0.4, 0.8)]]); }
            if (aR) { const l = Math.min(L * rr(0.25, 0.55), 7); bar([[xb + 0.5, y, 0], [xb - l * 0.5, y - rr(0, 1), bow * l * 0.15], [xb - l * 0.85, y - rr(0.5, 2.5), bow * l * rr(0.4, 0.8)]]); }
          }
        });
      }
      if (!segs.length) return null;
      const list = [], up = new THREE.Vector3(0, 1, 0), A = new THREE.Vector3(), Bv = new THREE.Vector3(), d = new THREE.Vector3(), q = new THREE.Quaternion(), M = new THREE.Matrix4();
      for (const [a, b] of segs) {
        A.set(a[0], a[1], a[2]); Bv.set(b[0], b[1], b[2]);
        d.subVectors(Bv, A); const L = d.length(); if (L < 0.05) continue;
        q.setFromUnitVectors(up, d.normalize());
        const g = new THREE.BoxGeometry(0.28, L + 0.2, 0.28).toNonIndexed();
        g.applyMatrix4(M.compose(A.clone().add(Bv).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
        g.applyMatrix4(m.frame);
        list.push(g);
      }
      return list.length ? merge(list) : null;
    }
    // Gộp hình mọi mảng tường đã trúng đạn của 1 nhà thành 1 mesh (+1 mesh cốt thép): ít draw call
    rebuildDamage(B) {
      const parts = [], bars = [];
      for (const m of B.dmgPanels) {
        if (m.state === 'gone' || (B.cut && this.isCutMod(B, m))) continue;
        if (m.geoVer !== m.mk.ver) {
          m.geo = this.panelGeo(B, m);
          if (m.bar) m.bar.dispose();
          m.bar = B.st.rc && m.mk.gone > 0 ? this.rebarGeo(B, m) : null;
          m.geoVer = m.mk.ver;
        }
        parts.push(m.geo);
        if (m.bar) bars.push(m.bar);
      }
      if (!B.dmgMesh) {
        B.dmgMesh = new THREE.Mesh(new THREE.BufferGeometry(), this.dmgMats[B.st.tex]);
        B.dmgMesh.castShadow = B.dmgMesh.receiveShadow = true;
        B.dmgMesh.userData.building = B;
        this.group.add(B.dmgMesh);
      }
      let n = 0;
      for (const p of parts) n += p.pos.length;
      const pos = new Float32Array(n), nrm = new Float32Array(n), uv = new Float32Array(n / 3 * 2), col = new Float32Array(n);
      let o = 0, ou = 0;
      for (const p of parts) { pos.set(p.pos, o); nrm.set(p.nrm, o); col.set(p.col, o); uv.set(p.uv, ou); o += p.pos.length; ou += p.uv.length; }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.computeBoundingSphere();
      B.dmgMesh.geometry.dispose();
      B.dmgMesh.geometry = g;
      B.dmgMesh.visible = n > 0 && !B.collapsed;
      if (B.barMesh) { this.group.remove(B.barMesh); B.barMesh.geometry.dispose(); B.barMesh = null; }
      if (bars.length && !B.collapsed) {
        B.barMesh = new THREE.Mesh(merge(bars), REBAR_MAT());
        B.barMesh.raycast = () => {};   // không chặn tia dò va chạm của phòng thử
        this.group.add(B.barMesh);
      }
    }

    // ---------------------------------------------------------------------------
    // VA CHẠM ĐẠN: đoạn bay cắt mặt tường / sàn / mái còn đặc (lọt qua lỗ thủng & ô cửa đã vỡ toác)
    // ---------------------------------------------------------------------------
    wallAt(B, key, along, py) {
      const f = Math.floor((py - 1.5) / B.FH);
      if (f < 0 || f >= B.floors) return null;
      const n = key[0] === 'z' ? B.bx : B.bz, half = key[0] === 'z' ? B.halfW : B.halfD;
      const i = Math.max(0, Math.min(n - 1, Math.floor((along + half) / B.st.bay)));
      return B.wgrid[key][f * n + i] || null;
    }
    tileAt(B, Lv, px, pz) {
      const i = Math.max(0, Math.min(B.bx - 1, Math.floor((px + B.halfW) / B.st.bay)));
      const j = Math.max(0, Math.min(B.bz - 1, Math.floor((pz + B.halfD) / B.st.bay)));
      return Lv.tiles[i * B.bz + j] || null;
    }
    inRoof(B, p) {
      const R = B.roofShape;
      if (Math.abs(p.x) > R.hx || p.y < R.y0 || p.y > R.y0 + R.h) return false;
      const u = (p.y - R.y0) / R.h;
      return R.kind === 'pitched' ? Math.abs(p.z) <= R.hz * (1 - u) : u * u + (p.z / R.hz) * (p.z / R.hz) <= 1;
    }
    segHitB(B, a, b) {
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
      const hw = B.halfW, hd = B.halfD, T = B.T, wallTop = 1.5 + B.floors * B.FH;
      let best = null;
      // Tường: mặt ngoài (đạn từ ngoài vào) & mặt trong (đạn đã lọt vào nhà bắn ra)
      for (const axis of ['x', 'z']) {
        const p0 = axis === 'x' ? a.x : a.z, dp = axis === 'x' ? dx : dz, half = axis === 'x' ? hw : hd, lim = axis === 'x' ? hd : hw;
        if (Math.abs(dp) < 1e-9) continue;
        for (const sgn of [1, -1]) {
          for (const outer of [true, false]) {
            if (outer ? dp * sgn > 0 : dp * sgn < 0) continue;
            const t = (sgn * (outer ? half : half - T) - p0) / dp;
            if (t < 0 || t > 1 || (best && t >= best.t)) continue;
            const L = { x: a.x + dx * t, y: a.y + dy * t, z: a.z + dz * t };
            if (L.y < 0.5 || L.y > wallTop) continue;
            const along = axis === 'x' ? L.z : L.x;
            if (Math.abs(along) > lim) continue;
            const m = this.wallAt(B, axis + sgn, along, L.y);
            if (!m || m.state === 'gone' || !this.cellSolid(B, m, L)) continue;
            best = { t, part: 'wall', m, L, ln: outer ? [m.ox, 0, m.oz] : [-m.ox, 0, -m.oz], inside: !outer };
          }
        }
      }
      // Sàn / mái: mặt trên (đạn rơi xuống) & mặt dưới (đạn bay lên)
      if (Math.abs(dy) > 1e-9) {
        for (const Lv of B.levels) {
          const top = dy < 0, yy = Lv.y + (top ? Lv.th / 2 : -Lv.th / 2);
          const t = (yy - a.y) / dy;
          if (t < 0 || t > 1 || (best && t >= best.t)) continue;
          const L = { x: a.x + dx * t, y: yy, z: a.z + dz * t };
          if (Math.abs(L.x) > hw + 0.6 || Math.abs(L.z) > hd + 0.6) continue;
          const m = this.tileAt(B, Lv, L.x, L.z);
          if (!m || m.state === 'gone') continue;
          best = { t, part: Lv.role, m, L, ln: [0, top ? 1 : -1, 0], inside: !(top && Lv.role === 'roof') };
        }
      }
      // Mái dốc / mái vòm: dò theo đoạn rồi chia đôi tìm điểm chạm
      if (B.roofMod && B.roofMod.state !== 'gone') {
        const n = 12;
        let prevT = 0;
        for (let k = 0; k <= n; k++) {
          const t = k / n;
          if (best && t >= best.t) break;
          const p = { x: a.x + dx * t, y: a.y + dy * t, z: a.z + dz * t };
          if (this.inRoof(B, p)) {
            let lo = prevT, hi = t;
            for (let it = 0; it < 7; it++) { const mid = (lo + hi) / 2; if (this.inRoof(B, { x: a.x + dx * mid, y: a.y + dy * mid, z: a.z + dz * mid })) hi = mid; else lo = mid; }
            const L = { x: a.x + dx * hi, y: a.y + dy * hi, z: a.z + dz * hi }, R = B.roofShape;
            let ln = R.kind === 'pitched' ? [0, R.hz, Math.sign(L.z) * R.h] : [0, (L.y - R.y0) / (R.h * R.h), L.z / (R.hz * R.hz)];
            const l = Math.hypot(ln[0], ln[1], ln[2]) || 1; ln = [ln[0] / l, ln[1] / l, ln[2] / l];
            best = { t: hi, part: 'roof', m: B.roofMod, L, ln, inside: false };
            break;
          }
          prevT = t;
        }
      }
      return best;
    }
    // Đoạn bay (thế giới) -> điểm chạm nhà gần nhất { x, y, z, nx, ny, nz, B, part, m, L, inside }
    segmentHit(x0, y0, z0, x1, y1, z1) {
      let best = null;
      for (const B of this.items) {
        if (B.collapsed) continue;
        const r = Math.hypot(B.halfW, B.halfD) + 6;
        if (Math.max(x0, x1) < B.x - r || Math.min(x0, x1) > B.x + r || Math.max(z0, z1) < B.z - r || Math.min(z0, z1) > B.z + r) continue;
        if (Math.min(y0, y1) > B.y + B.topY + B.FH) continue;
        if (segPointDist(x0, z0, x1, z1, B.x, B.z) > r) continue;
        const h = this.segHitB(B, this.toLocal(B, x0, y0, z0), this.toLocal(B, x1, y1, z1));
        if (h && (!best || h.t < best.t)) { h.B = B; best = h; }
      }
      if (!best) return null;
      const B = best.B, w = this.toWorld(B, best.L.x, best.L.y, best.L.z), n = this.dirToWorld(B, best.ln[0], best.ln[1], best.ln[2]);
      return Object.assign(best, { x: w.x, y: w.y, z: w.z, nx: n.x, ny: n.y, nz: n.z, type: 'BUILDING' });
    }

    // ---------------------------------------------------------------------------
    // TRÚNG ĐẠN
    // ---------------------------------------------------------------------------
    /**
     * Đạn nổ / xuyên tại (x, y, z). info: { t: loại va chạm ('BUILDING' = trúng thẳng nhà), dx/dy/dz: hướng bay }.
     * override: { power } hệ số sức phá (đạn xuyên đã mất bớt năng lượng).
     */
    damageAt(x, y, z, ammo, heavy, fx, override, info) {
      info = info || {};
      let I = bldInfo(ammo, heavy);
      if (override && override.power !== undefined) {
        const k = override.power;
        I = Object.assign({}, I, { hole: I.hole * k, crater: I.crater * Math.sqrt(k), sp: I.sp * k, glass: I.glass * Math.sqrt(k) });
      }
      const events = [];
      const dl = Math.hypot(info.dx || 0, info.dy || 0, info.dz || 0);
      const dir = dl > 1e-6 ? { x: info.dx / dl, y: info.dy / dl, z: info.dz / dl } : null;
      // Trúng thẳng: dò lại đúng mặt bị chạm từ hướng bay (mọi máy cùng điểm nổ chuẩn -> cùng kết quả)
      const direct = info.t === 'BUILDING' && dir ? this.segmentHit(x - dir.x * 30, y - dir.y * 30, z - dir.z * 30, x + dir.x * 4, y + dir.y * 4, z + dir.z * 4) : null;
      const reach = Math.max(I.glass, I.sr, I.crater * 1.5, I.soot * 1.2) + 10;
      for (const B of this.items) {
        if (B.collapsed) continue;
        if (Math.hypot(x - B.x, z - B.z) > Math.hypot(B.halfW, B.halfD) + reach) continue;
        const ctx = { B, I, fx, touched: new Set(), changed: false, inside: false, floor: -1, glassFx: 0, ammo };
        let L = this.toLocal(B, x, y, z);
        if (direct && direct.B === B) { this.directHit(ctx, direct, dir); L = direct.L; }
        else {
          // Nổ ngoài trời sát nhà / nổ bên trong nhà (đạn lọt vào qua lỗ thủng, đạn con xuyên mái)
          const inBox = Math.abs(L.x) < B.halfW - B.T && Math.abs(L.z) < B.halfD - B.T && L.y > 1 && L.y < 1.5 + B.floors * B.FH;
          if (inBox) { ctx.inside = true; ctx.floor = Math.max(0, Math.min(B.floors - 1, Math.floor((L.y - 1.5) / B.FH))); }
        }
        this.blastNear(ctx, L);
        if (ctx.changed) {
          events.hit = true;
          this.rebuildDamage(B);
          const ev = this.checkStructure(B, fx);
          if (ev) events.push(ev);
          this.commitAll();
        }
      }
      return events;
    }

    directHit(ctx, D, dir) {
      const { B, I, fx } = ctx;
      const ld = this.dirToLocal(B, dir);
      const W = this.toWorld(B, D.L.x, D.L.y, D.L.z), Nw = this.dirToWorld(B, D.ln[0], D.ln[1], D.ln[2]);
      const cosI = Math.max(0, -(ld.x * D.ln[0] + ld.y * D.ln[1] + ld.z * D.ln[2]));
      ctx.changed = true;
      if (D.part === 'wall') {
        const m = D.m;
        let tx = ld.x * m.ax + ld.z * m.az, ty = ld.y;
        const tl = Math.hypot(tx, ty);
        if (tl > 1e-4) { tx /= tl; ty /= tl; } else { tx = 1; ty = 0; }
        let hole = I.hole * B.WM.k, crater = I.crater, soot = I.soot, chip = I.chip || 0, stretch = 1;
        const ric = I.kin && cosI < I.ric;
        if (ric) { hole = 0; chip = chip ? chip * 0.5 : 0.35; crater *= 0.8; stretch = 2.6; soot = 0; }   // sượt: chỉ cày một rãnh bóc lở dài theo hướng bay
        else if (I.kin) stretch = Math.min(2.4, 1 / Math.max(cosI, 0.4));                                  // xuyên xiên: lỗ thuôn dài
        else {
          stretch = 1 + (1 - cosI) * 0.6;
          // nổ lõm chạm quá xiên: luồng phụt không đủ cự ly, lỗ nhỏ; đạn nổ chạm xiên: phần lớn sức nổ dội ra ngoài
          hole *= I.heat ? (cosI < 0.25 ? 0.45 : 1) : (0.6 + 0.4 * cosI);
        }
        const P = { hole, crater, soot, chip, stretch, tx, ty, noise: holeNoise(), seed: rand(0, 1000), inner: D.inside };
        const res = this.carveFace(ctx, m, D.L, P);
        ctx.floor = m.floor;
        ctx.inside = D.inside;
        this.wallDebris(ctx, W, Nw, dir, res, ric);
        // Đạn động năng xuyên qua nhà: lỗ ra ở vách đối diện, bê tông phụt ra ngoài (đầu đạn mất phần lớn năng lượng)
        if (I.exit && !ric && !D.inside) {
          const s0 = { x: D.L.x + ld.x * (B.T + 0.8), y: D.L.y + ld.y * (B.T + 0.8), z: D.L.z + ld.z * (B.T + 0.8) };
          const span = B.w + B.d + B.topY;
          const h2 = this.segHitB(B, s0, { x: s0.x + ld.x * span, y: s0.y + ld.y * span, z: s0.z + ld.z * span });
          if (h2 && h2.part === 'wall') {
            const m2 = h2.m;
            let ex = ld.x * m2.ax + ld.z * m2.az, ey = ld.y; const el = Math.hypot(ex, ey) || 1;
            const cos2 = Math.abs(ld.x * m2.ox + ld.z * m2.oz);
            const P2 = { hole: I.exit * B.WM.k, crater: I.crater * 1.5, soot: 0, chip: 0, stretch: Math.min(2.4, 1 / Math.max(cos2, 0.4)), tx: ex / el, ty: ey / el, noise: holeNoise(), seed: rand(0, 1000), inner: false };
            const r2 = this.carveFace(ctx, m2, h2.L, P2);
            const W2 = this.toWorld(B, h2.L.x, h2.L.y, h2.L.z);
            if (fx && fx.spallCone) fx.spallCone(new THREE.Vector3(W2.x, W2.y, W2.z), new THREE.Vector3(dir.x, dir.y, dir.z), 40, { spread: 0.45, dust: B.WM.dust });
            const o = this.dirToWorld(B, m2.ox, 0, m2.oz);
            jet(fx, W2.x, W2.y, W2.z, o.x, 0.1, o.z, 3 + Math.min(6, r2.removed >> 2), 2.6, 70, B.WM.edge, 0.4);
            sfx('concrete', W2.x, W2.y, W2.z, 0.6);
          } else if (h2 && h2.m) this.hitTile(ctx, h2.m, I.sp * 0.6, W);
        }
        // Luồng nổ lõm xuyên tường: kim loại nóng chảy + bê tông phụt vào trong phòng
        if (I.heat && !ric && !D.inside && fx && fx.spallCone) fx.spallCone(new THREE.Vector3(W.x + dir.x * B.T, W.y + dir.y * B.T, W.z + dir.z * B.T), new THREE.Vector3(dir.x, dir.y, dir.z), 26, { spread: 0.5, dust: B.WM.dust });
      } else {
        // Sàn / mái bị chạm
        const m = D.m;
        const fromTop = D.ln[1] > 0.5;
        const dmg = (I.sp * 1.25 + I.hole * 0.04) * (I.kin ? 0.45 : 1) * (0.5 + 0.5 * cosI);
        const broke = this.hitTile(ctx, m, dmg, W);
        if (D.part === 'roof') { ctx.inside = broke; ctx.floor = B.floors - 1; }
        else { ctx.inside = true; ctx.floor = fromTop ? Math.min(B.floors - 1, m.floor + 1) : m.floor; }
        const s = Math.min(1.6, 0.4 + I.sp);
        jet(fx, W.x, W.y + 1, W.z, Nw.x, Math.max(0.6, Nw.y), Nw.z, Math.round(2 + 5 * s), 2.4 * s, 55, B.WM.edge, 0.8);
        dustBurst(fx, W.x, W.y + 2, W.z, Math.round(1 + 3 * s), 8 + 10 * s, B.WM.dust);
      }
    }
    // Khoét cả các mảng cùng mặt phẳng kề bên (lỗ / vành bóc lở / muội vượt qua mép mảng)
    carveFace(ctx, m, L, P) {
      const { B } = ctx, bay = B.st.bay, FH = B.FH;
      const R = Math.max(P.hole * 1.5, P.crater * 1.4, P.soot * 1.3) * Math.max(1, P.stretch) + 2;
      let removed = 0;
      for (const q of B.walls) {
        if (q.state === 'gone' || Math.abs(q.ry - m.ry) > 1e-3) continue;
        if (Math.abs((q.lx - m.lx) * m.ox + (q.lz - m.lz) * m.oz) > 0.5) continue;
        const rx = L.x - q.lx, rz = L.z - q.lz;
        const px = rx * q.ax + rz * q.az, py = L.y - q.ly;
        if (Math.abs(px) > bay / 2 + R || Math.abs(py) > FH / 2 + R) continue;
        removed += this.carve(B, q, px, py, P).removed;
        ctx.touched.add(q);
        if (B.cut && this.isCutMod(B, q)) this.cutHide(q);
      }
      return { removed };
    }
    // Gạch đá vỡ văng ra theo mặt bị nổ, bụi phụt, đống vụn rơi xuống chân tường
    wallDebris(ctx, W, N, dir, res, ric) {
      const { B, I, fx } = ctx;
      const cells = res.removed, vol = cells * 2.6 * B.T;
      if (I.chip) {
        dustJet(fx, W.x, W.y, W.z, N.x, N.z, 1, ric ? 2.5 : 3.2, B.WM.dust, 14);
        if (cells) jet(fx, W.x, W.y, W.z, N.x, N.y, N.z, 2, 1.2, 40, B.WM.edge, 0.5);
        if (!this._syncing) sfx('concrete', W.x, W.y, W.z, 0.25);
        return;
      }
      const s = Math.min(2.2, 0.5 + Math.sqrt(vol) / 18);
      // phần lớn mảnh vỡ bật ngược về phía mặt bị nổ, một ít bị sóng nổ thổi vào trong
      jet(fx, W.x, W.y, W.z, N.x, N.y + 0.15, N.z, Math.round(3 + 6 * s), 2.2 * s, 60 + 30 * s, B.WM.edge, 0.65);
      jet(fx, W.x, W.y, W.z, dir.x, dir.y, dir.z, Math.round(2 + 3 * s), 1.8 * s, 50, B.WM.edge, 0.5);
      dustJet(fx, W.x, W.y, W.z, N.x, N.z, Math.round(2 + 3 * s), 8 + 8 * s, B.WM.dust, 18 + 10 * s);
      dustBurst(fx, W.x, W.y, W.z, Math.round(1 + 2 * s), 10 + 8 * s, B.WM.dust);
      // đống gạch vụn dưới chân tường phía ngoài
      if (cells > 18 && !ctx.inside) {
        const nb = Math.min(6, Math.round(cells / 22));
        const gy = this.groundAt(W.x, W.z);
        for (let k = 0; k < nb; k++) {
          const off = rand(2, 9), side = rand(-1, 1) * Math.sqrt(cells) * 0.6, sz = rand(1.6, 3.4) * Math.min(1.6, s);
          const px = W.x + N.x * off - N.z * side, pz = W.z + N.z * off + N.x * side;
          this.bitPool.add(new THREE.Matrix4().compose(new THREE.Vector3(px, gy + sz * 0.2, pz), new THREE.Quaternion().setFromEuler(new THREE.Euler(rand(0, 3), rand(0, 3), rand(0, 3))),
            new THREE.Vector3(sz * 1.3, sz * 0.8, sz)), new THREE.Color(B.WM.edge[0], B.WM.edge[1], B.WM.edge[2]).multiplyScalar(rand(0.85, 1.15)));
        }
      }
      if (!this._syncing) sfx('concrete', W.x, W.y, W.z, Math.min(1.2, 0.5 + s * 0.35));
    }
    // Ô sàn / mái / mái dốc trúng sức phá dmg; trả về true nếu vỡ
    hitTile(ctx, m, dmg, W) {
      const { B } = ctx;
      if (m.state === 'gone') return false;
      m.hp -= dmg;
      ctx.changed = true;
      this.tintMod(m, m.c.clone().multiplyScalar(0.45 + 0.5 * clamp01(m.hp / m.hp0)));
      if (m.hp <= 0) { this.setGone(B, m, ctx.fx); return true; }
      if (m.state === 'ok') m.state = 'scarred';
      void W;
      return false;
    }
    // Sóng nổ / mảnh văng quanh điểm nổ: cột, ô sàn, mảng tường gần (không trúng thẳng), kính vỡ, khói phụt ra cửa sổ
    blastNear(ctx, L) {
      const { B, I, fx } = ctx;
      const bay = B.st.bay, FH = B.FH, T = B.T;
      const kIn = ctx.inside ? 1.5 : 1;
      if (I.sp > 0) {
        for (const m of B.mods) {
          if (m.role === 'wall' || m.state === 'gone' || m.role === 'base') continue;
          const d = Math.hypot(Math.max(0, Math.abs(L.x - m.lx) - m.hx), Math.max(0, Math.abs(L.y - m.ly) - m.hy), Math.max(0, Math.abs(L.z - m.lz) - m.hz));
          if (d > I.sr) continue;
          const dmg = I.sp * Math.pow(1 - d / I.sr, 1.5) * kIn;
          if (dmg < 0.03) continue;
          this.hitTile(ctx, m, dmg, null);
        }
      }
      let vents = 0;
      for (const m of B.walls) {
        if (m.state === 'gone' || ctx.touched.has(m)) continue;
        const rx = L.x - m.lx, rz = L.z - m.lz;
        const pz = rx * m.ox + rz * m.oz, px = rx * m.ax + rz * m.az, py = L.y - m.ly;
        const dp = Math.max(0, Math.abs(pz) - T / 2);
        const ex = Math.max(0, Math.abs(px) - bay / 2), ey = Math.max(0, Math.abs(py) - FH / 2);
        const d3 = Math.hypot(ex, ey, dp);
        const inner = pz < 0;                                  // điểm nổ ở phía trong nhà so với mảng này
        const sameRoom = ctx.inside && m.floor === ctx.floor;  // nổ trong phòng kín: sóng nổ dội khắp tầng
        if (d3 > I.glass && !sameRoom) continue;
        // kính: mảng quay về phía vụ nổ vỡ ở bán kính đầy đủ, mảng quay lưng chỉ vỡ khi rất gần
        const facing = inner === ctx.inside ? 1 : 0.4;
        if ((m.state === 'ok') && (sameRoom || d3 < I.glass * facing)) this.shatter(B, m, ctx);
        if (sameRoom && vents < 4 && !I.kin && I.sp > 0.3 && (m.state === 'glass' || m.state === 'holed')) {
          const w = this.toWorld(B, m.lx + m.ox * T, m.ly + FH * 0.15, m.lz + m.oz * T), o = this.dirToWorld(B, m.ox, 0, m.oz);
          if (this.vents.length < 48) this.vents.push({ B, x: w.x, y: w.y, z: w.z, nx: o.x, nz: o.z, t: rand(10, 22) * Math.min(1.5, I.sp), acc: rand(0, 0.2) });
          vents++;
        }
        if (I.kin && !ctx.inside) continue;
        // nổ gần (không trúng thẳng): chỉ phá thủng khi nổ sát mặt tường, xa hơn thì bóc lở / ám khói / mảnh văng rỗ mặt
        const hole = I.hole * B.WM.k * clamp01(1 - dp / (I.hole * 0.75 + 0.01)) * (sameRoom ? 1.25 : 1);
        const crater = I.crater * clamp01(1 - dp / (I.crater * 1.2 + 0.01));
        const soot = inner ? 0 : I.soot * clamp01(1 - dp / (I.soot * 1.1 + 0.01));
        const R = Math.max(hole, crater, soot) * 1.3;
        if ((hole > 1.2 || crater > 1.5 || soot > 2) && ex < R && ey < R) {
          this.carve(B, m, px, py, { hole: hole > 1.2 ? hole : 0, crater, soot, chip: 0, stretch: 1, tx: 1, ty: 0, noise: holeNoise(), seed: rand(0, 1000), inner });
          ctx.changed = true;
          if (B.cut && this.isCutMod(B, m)) this.cutHide(m);
        }
        if (I.sr > 0 && I.sp > 0.3 && dp < I.sr && ex < I.sr && ey < I.sr) {
          const n = Math.round(9 * (1 - dp / I.sr) * Math.min(1.6, I.sp));
          for (let k = 0; k < n; k++) {
            const a = rand(0, 6.283), r = rand(0.15, 1) * (dp * 0.9 + 6);
            const qx = px + Math.cos(a) * r, qy = py + Math.sin(a) * r;
            if (Math.abs(qx) > bay / 2 || Math.abs(qy) > FH / 2) continue;
            this.carve(B, m, qx, qy, { hole: 0, crater: rand(0.8, 1.5), soot: 0, chip: 0.3, stretch: 1, tx: 1, ty: 0, noise: NO_NOISE, seed: rand(0, 1000), inner });
            ctx.changed = true;
          }
          if (n && B.cut && this.isCutMod(B, m)) this.cutHide(m);
        }
      }
      if (vents) ctx.changed = true;
    }
    // Kính vỡ do sóng nổ (mảng tường còn nguyên đổi sang mặt cửa vỡ toác)
    shatter(B, m, ctx) {
      if (m.state !== 'ok' || !m.h) return;
      m.h = m.kit.swap(m.h, 'shatter', m.c);
      m.state = 'glass';
      if (ctx) {
        ctx.changed = true;
        if (B.cut && this.isCutMod(B, m)) this.cutHide(m);
        if (ctx.fx && ctx.glassFx < 6 && B.st.tex !== 'metal') {
          ctx.glassFx++;
          const w = this.toWorld(B, m.lx + m.ox * 1.5, m.ly, m.lz + m.oz * 1.5), o = this.dirToWorld(B, m.ox, 0, m.oz);
          jet(ctx.fx, w.x, w.y, w.z, o.x * 0.6, 0.2, o.z * 0.6, 4, 0.9, 30, [0.72, 0.82, 0.88], 0.6);
        }
      }
    }
    // Mô-đun mất hẳn (mảng tường nát vụn / ô sàn sập / mái sập / cột gãy)
    setGone(B, m, fx, quiet) {
      if (m.state === 'gone') return;
      const wasMask = !!m.mk;
      m.state = 'gone';
      m.hp = 0;
      this.hideMod(m);
      if (wasMask) B.dmgPanels.delete(m);
      if (B.cut && this.isCutMod(B, m)) return;
      const wp = m.role === 'wall' ? this.toWorld(B, m.lx, m.ly, m.lz) : this.modWorldPos(m);
      if (fx && fx.removeMarksNear) fx.removeMarksNear(wp.x, wp.y, wp.z, (m.sx || 8) * 0.7);
      if (quiet && this._syncing) return;
      const big = m.role === 'slab' || m.role === 'roof';
      chunks(fx, wp.x, wp.y, wp.z, big ? 5 : 3, m.role === 'col' ? 2.6 : 3.4, B.WM.edge, big ? 10 : 30);
      dustBurst(fx, wp.x, wp.y, wp.z, big ? 4 : 3, big ? 16 : 12, B.WM.dust);
      sfx('concrete', wp.x, wp.y, wp.z, 1);
    }

    checkStructure(B, fx) {
      let alive = 0, total = 0, base = 0, baseAlive = 0;
      const frac = m => (m.mk ? m.mk.gone / (m.mk.nx * m.mk.ny) : 0);
      for (const m of B.mods) {
        if (m.role !== 'wall' && m.role !== 'col') continue;
        total += m.hp0;
        if (m.state !== 'gone' && m.state !== 'stub') alive += m.role === 'wall' ? m.hp0 * (1 - frac(m)) : Math.max(0, m.hp);
        if (m.floor === 0) { base++; if (m.state !== 'gone' && frac(m) < 0.55) baseAlive++; }
      }
      // Mảng tường tầng trên mất hết chỗ tựa bên dưới thì đổ xuống theo
      for (const m of B.walls) {
        if (m.floor <= 0 || m.state === 'gone') continue;
        const below = B.mods.some(q => q.floor === m.floor - 1 && q.state !== 'gone' && (q.role === 'wall' || q.role === 'col') && frac(q) < 0.7 && Math.hypot(q.lx - m.lx, q.lz - m.lz) < B.st.bay * 1.6);
        if (!below) { this.setGone(B, m, fx); const w = this.toWorld(B, m.lx, m.ly, m.lz); chunks(fx, w.x, w.y, w.z, 6, 3, B.WM.edge); }
      }
      // Ô sàn mất hết chỗ đỡ (không còn ô kề nào & không còn tường / cột bên dưới) sập xuống
      for (const Lv of B.levels) {
        for (const t of Lv.tiles) {
          if (t.state === 'gone') continue;
          const nb = Lv.tiles.some(q => q !== t && q.state !== 'gone' && Math.abs(q.ti - t.ti) + Math.abs(q.tj - t.tj) === 1);
          if (nb) continue;
          const sup = B.mods.some(q => (q.role === 'wall' || q.role === 'col') && q.floor === Lv.f - (Lv.role === 'roof' ? 1 : 0) && q.state !== 'gone' && Math.abs(q.lx - t.lx) < B.st.bay && Math.abs(q.lz - t.lz) < B.st.bay);
          if (!sup) this.setGone(B, t, fx);
        }
      }
      if ((base > 0 && baseAlive / base < 0.45) || (total > 0 && alive / total < 0.4)) {
        this.collapse(B, fx);
        return { type: 'collapse', text: 'TÒA NHÀ SẬP ĐỔ', x: B.x, z: B.z };
      }
      return null;
    }

    collapse(B, fx) {
      if (B.collapsed) return;
      if (B.cut) this.applyCut(B, false);
      B.collapsed = true;
      const tilt = new THREE.Vector3(rand(-1, 1), 0, rand(-1, 1)).normalize();
      for (const m of B.mods) {
        if (m.state === 'gone') continue;
        if (m.kit && !m.h) { m.state = 'gone'; continue; }   // mảng đã khoét lỗ (hình riêng): mất trong bụi sập
        if (m.kit && m.h) for (const [p, i] of m.h.extra) p.hide(i);
        this.anim.push({ B, m, t: 0, delay: (m.floor + 1) * 0.12 + rand(0, 0.25), drop: m.ly + rand(4, 10), tilt, spin: rand(-0.4, 0.4) });
      }
      if (B.dmgMesh) B.dmgMesh.visible = false;
      if (B.barMesh) B.barMesh.visible = false;
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

    update(dt, fx) {
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
      // Nổ trong phòng: khói đen cuộn phụt ra các ô cửa vỡ / lỗ thủng của tầng đó một lúc lâu
      for (let i = this.vents.length - 1; i >= 0; i--) {
        const v = this.vents[i];
        v.t -= dt; v.acc += dt;
        if (v.t <= 0 || v.B.collapsed) { this.vents.splice(i, 1); continue; }
        if (v.acc < 0.25 || !fx || !fx.smoke) continue;
        v.acc = 0;
        const g = rand(0.16, 0.26);
        fx.smoke.add({ x: v.x, y: v.y, z: v.z, vx: v.nx * rand(6, 14), vy: rand(5, 12), vz: v.nz * rand(6, 14), size: rand(5, 9), grow: 6, drag: 0.8, grav: -3,
          life: rand(4, 7), alpha: 0.5 * Math.min(1, v.t / 4), fadeIn: 0.2, c0: [g, g * 0.97, g * 0.94], cell: 2 });
      }
    }

    // ---- NHÀ CHE KHUẤT XE MÌNH: tạm cắt bỏ các tầng trên (kiểu game chiến thuật) để luôn thấy xe ----
    isCutMod(B, m) { return m.role === 'roof' || (m.floor >= 1 && (m.role === 'wall' || m.role === 'col' || m.role === 'slab')); }
    cutHide(m) {
      if (m.kit) { if (m.h) { m.h.pool.hide(m.h.idx); for (const [p, i] of m.h.extra) p.hide(i); } }
      else if (m.pool) m.pool.hide(m.idx);
    }
    cutShow(m) {
      if (m.kit) { if (m.h) { m.h.pool.set(m.h.idx, m.h.m); for (const [p, i] of m.h.extra) p.set(i, m.h.m); } }
      else if (m.pool) m.pool.set(m.idx, m.world);
    }
    applyCut(B, on) {
      B.cut = on;
      for (const m of B.mods) {
        if (m.state === 'gone' || !this.isCutMod(B, m)) continue;
        if (on) this.cutHide(m); else this.cutShow(m);
      }
      if (B.dmgPanels.size) this.rebuildDamage(B);
    }
    // cam: vị trí camera, foc: xe đang theo dõi (x, y, z). Đường nhìn xe -> camera cắt qua nhà dưới mái -> cắt tầng
    setView(cam, foc, dt) {
      if (!cam || !foc) return;
      let dirty = false;
      for (const B of this.items) {
        let want = false;
        if (!B.collapsed && B.floors >= 2 && Math.abs(B.x - foc.x) < 700 && Math.abs(B.z - foc.z) < 700) {
          const a = this.toLocal(B, foc.x, foc.y + 10, foc.z), b = this.toLocal(B, cam.x, cam.y, cam.z);
          let t0 = 0, t1 = 1;
          for (const [p, d, h] of [[a.x, b.x - a.x, B.halfW + 6], [a.z, b.z - a.z, B.halfD + 6]]) {
            if (Math.abs(d) < 1e-6) { if (Math.abs(p) > h) { t0 = 2; break; } continue; }
            let u0 = (-h - p) / d, u1 = (h - p) / d;
            if (u0 > u1) { const s = u0; u0 = u1; u1 = s; }
            t0 = Math.max(t0, u0); t1 = Math.min(t1, u1);
          }
          if (t0 <= t1 && t0 <= 1) want = a.y + (b.y - a.y) * t0 < B.topY + B.FH * 0.5;
        }
        if (want) B.cutHold = 0.5; else B.cutHold -= dt || 0.016;
        const on = B.cutHold > 0;
        if (on !== B.cut) { this.applyCut(B, on); dirty = true; }
      }
      if (dirty) this.commitAll();
    }
  }

  // ===========================================================================
  // KẾT CẤU KHỐI BÊ TÔNG (tường / boong-ke): sứt mẻ -> nứt lộ thép -> vỡ còn gốc gãy -> vỡ vụn
  // ===========================================================================
  class BlockStructure {
    constructor(parent, cap) {
      const conc = new THREE.MeshStandardMaterial({ map: concreteTex(), roughness: 0.92, metalness: 0.02 });
      const cracked = new THREE.MeshStandardMaterial({ map: crackedTex(), roughness: 0.95 });
      this.kitC = new FractureKit(parent, conc, cracked, cap, { maxCustom: 100 });      // khối lành
      this.kitK = new FractureKit(parent, cracked, cracked, cap, { maxCustom: 100 });   // khối đã nứt toác
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
    // Điểm (thế giới) -> hệ cục bộ của khối: u dọc tường, v theo chiều cao, w theo bề dày (đều -0.5..0.5 khi nằm trong khối)
    // và khoảng cách từ điểm tới mặt khối (0 nếu nằm trong / trên mặt)
    localOf(q, x, y, z) {
      const dx = x - q.x, dz = z - q.z;
      const along = dx * q.ax + dz * q.az, across = dz * q.ax - dx * q.az;
      const ex = Math.max(0, Math.abs(along) - q.len / 2), ez = Math.max(0, Math.abs(across) - q.thick / 2);
      const ey = y < q.y0 ? q.y0 - y : y > q.y1 ? y - q.y1 : 0;
      const H = q.m.elements[5] || (q.y1 - q.y0);   // chiều cao gốc của khối (y1 bị hạ khi còn gốc gãy)
      const yc = q.m.elements[13];
      return { u: along / q.len, v: (y - yc) / H, w: across / q.thick, dist: Math.hypot(ex, ey, ez) };
    }

    // Sát thương hình cầu quanh điểm nổ. ammo (tùy chọn) quyết định dáng lỗ xuyên: AP (động năng) / HEAT / đạn nhỏ
    damageSphere(x, y, z, R, power, pierce, fx, filter, ammo) {
      let broke = 0;
      this.lastPierced = false;
      // Khối bị đạn chạm trực tiếp: chỉ khối này bị khoét lỗ xuyên (1 viên đạn = 1 lỗ, không thủng lan sang khối kề)
      let hitQ = null, hitD = 2.5;
      for (const q of this.blocks) {
        if (!q.alive || (filter && !filter(q))) continue;
        if (Math.abs(x - q.x) > q.radius + 3 || Math.abs(z - q.z) > q.radius + 3) continue;
        const L = this.localOf(q, x, y, z);
        if (L.dist < hitD) { hitD = L.dist; hitQ = q; }
      }
      for (const q of this.blocks) {
        if (!q.alive || (filter && !filter(q))) continue;
        const dy = y < q.y0 ? q.y0 - y : y > q.y1 ? y - q.y1 : 0;
        const d = Math.max(0, Math.hypot(x - q.x, z - q.z) - q.radius * 0.7);
        const dist = q === hitQ ? 0 : Math.hypot(d, dy);
        if (dist > R) continue;
        const direct = q === hitQ;
        const k = clamp01(1 - dist / R);
        let dmg = power * (0.15 + 1.1 * k * k);
        if (pierce && direct) dmg *= 1.5;
        // đạn xuyên chỉ khoét đúng khối bị chạm: AP gần như không làm hại khối kề, đầu nổ lõm chỉ có ít thuốc nổ văng ra
        else if (pierce && power >= 0.8) dmg *= ammo === 'AP' ? 0.05 : 0.3;
        // đạn nhỏ chỉ sứt / đục dần mặt bê tông (12.7mm sứt mẻ, 30mm nổ-mảnh đục sâu hơn), gần như không lan sang khối bên
        if (power < 0.3) dmg *= (power < 0.2 ? 0.3 : 0.45) * (direct ? 1 : 0.15);
        q.hp -= dmg;
        // Đạn xuyên (APFSDS / luồng nổ lõm) trúng thẳng khối: khoét thủng xuyên qua tường đúng chỗ chạm
        const punch = pierce && direct && power >= 0.8;
        if (punch && !q.stub && !q.bored) {
          // phát xuyên đầu tiên: lỗ thủng gọn xuyên qua khối (không gãy cụt cả khối); phát sau mới làm vỡ
          q.hp = Math.max(q.hp, 0.25);
          this.boreBlock(q, fx, x, y, z, ammo === 'AP' ? 'ke' : 'heat');
          this.lastPierced = true;
        }
        else if (q.hp <= 0) {
          // Sức nổ dư nhiều so với độ bền khối: thổi bay cả khối, không còn gốc gãy
          if (q.hp < -q.hpMax * 0.6) q.noStub = true;
          this.breakBlock(q, fx); broke++; if (punch) this.lastPierced = true;
        }
        else if (punch && !q.stub) this.lastPierced = true;
        else if (!q.cracked && !q.stub && q.hp < q.hpMax * 0.5) this.crackBlock(q, fx);
        // Xả đạn liên tục vào một chỗ: đục thủng xuyên qua khối (lỗ toác lộ cốt thép)
        else if (q.cracked && !q.stub && !q.bored && power < 0.3 && direct && q.hp < q.hpMax * (power < 0.2 ? 0.3 : 0.45)) this.boreBlock(q, fx, x, y, z, 'bullet');
        else if (k > 0.2 && !q.stub) q.kit.color(q.h, q.c.clone().multiplyScalar(0.6 + 0.4 * (q.hp / q.hpMax)));
      }
      if (broke) this.commit();
      return broke;
    }
    // Khoét thủng xuyên khối bê tông đúng chỗ đạn chạm.
    //  ke: lõi động năng xuyên lỗ hẹp, miệng vào bong vảy vừa, mặt sau toác rộng; thép cắt đứt
    //  heat: luồng kim loại nổ lõm -> lỗ rất hẹp sâu, miệng vào cháy rỗ rộng, mặt sau bong ít
    //  bullet: xả đạn đục dần -> miệng vào toác rộng nhất, lộ lưới thép
    boreBlock(q, fx, x, y, z, kind) {
      q.bored = true;
      q.cracked = true;
      q.kit.hide(q.h);
      q.kit = this.kitK;
      const col = q.c.clone().multiplyScalar(0.88);
      if (x === undefined) {
        q.h = this.kitK.add('holed', q.m, col);
      } else {
        const L = this.localOf(q, x, y, z);
        const H = q.m.elements[5] || (q.y1 - q.y0);
        const core = kind === 'ke' ? rand(0.75, 1.0) : kind === 'heat' ? rand(0.45, 0.6) : rand(0.9, 1.25);   // bán kính lòng lỗ (đơn vị game)
        const kIn = kind === 'ke' ? rand(1.6, 2.0) : kind === 'heat' ? rand(2.4, 3.0) : rand(1.7, 2.1);
        const kOut = kind === 'ke' ? rand(2.2, 2.7) : kind === 'heat' ? rand(1.5, 1.9) : rand(1.2, 1.5);
        const rx = core / q.len, ry = core / H;
        // đạn đến từ phía mặt +w hay -w của khối -> miệng vào nằm ở mặt đó
        const fromPlus = L.w >= 0;
        const cx = Math.max(-0.3, Math.min(0.3, L.u)), cy = Math.max(-0.3, Math.min(0.3, L.v));
        const geo = boreGeo(cx, cy, rx, ry, fromPlus ? kIn : kOut, fromPlus ? kOut : kIn);
        q.h = this.kitK.addCustom(geo, q.m, col, kind === 'bullet');
      }
      if (fx && fx.removeMarksNear) fx.removeMarksNear(x !== undefined ? x : q.x, y !== undefined ? y : (q.y0 + q.y1) / 2, z !== undefined ? z : q.z, 2.5);
      chunks(fx, x !== undefined ? x : q.x, y !== undefined ? y : (q.y0 + q.y1) / 2, z !== undefined ? z : q.z, 2, 1.2);
      sfx('concrete', q.x, (q.y0 + q.y1) / 2, q.z, 0.6);
      this.commit();
    }
    crackBlock(q, fx) {
      q.cracked = true;
      if (q.h && q.h.custom) {
        // hình vỡ riêng: giữ nguyên dáng, chỉ đổi sang mặt bê tông nứt
        q.h.pool.mesh.material = this.kitK.intactMat;
        q.kit = this.kitK;
        q.kit.color(q.h, q.c.clone().multiplyScalar(0.92));
        return;
      }
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
          new THREE.Quaternion().setFromEuler(new THREE.Euler(rand(0, 3), rand(0, 3), rand(0, 3))), new THREE.Vector3(s * 1.4, s, s)), new THREE.Color(0.6, 0.59, 0.56).multiplyScalar(rand(0.82, 1.05)));
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
      // Gốc gãy chỉ còn lại khi chân khối tựa trên nền / khối lành bên dưới; khối treo trên lỗ vỡ thì đổ hết,
      // không để lại dải bê tông lơ lửng có cốt thép chĩa lên
      if (!q.stub && !q.noStub && this.supported(q)) {
        // Vỡ lần đầu: còn trơ gốc gãy răng cưa lòi cốt thép (vẫn che được thân dưới xe)
        q.kit.hide(q.h);
        q.kit = this.kitK;
        q.h = this.kitK.add('remnant', q.m, q.c.clone().multiplyScalar(0.85));
        q.stub = true;
        q.y1 = q.y0 + q.h0frac * (oldTop - q.y0);
        q.hp = q.hpMax * 0.35;
        this.biteNeighbours(q, oldTop);
      } else {
        q.alive = false;
        q.kit.hide(q.h);
        if (!q.bitDone) this.biteNeighbours(q, oldTop);
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
          // Gốc gãy bên trên mất chỗ tựa: cụt cả hai đầu thì không thép nào giữ nổi -> rơi xuống đống vụn
          if (o.stub) { if (!this.supported(o)) { o.noStub = true; this.breakBlock(o, fx); } continue; }
          const held = this.blocks.some(n => n !== o && n.alive && !n.stub && Math.abs(n.y0 - o.y0) < 1 && Math.abs(n.rotY - o.rotY) < 0.01 &&
            Math.abs(Math.hypot(n.x - o.x, n.z - o.z) - (n.len + o.len) / 2) < 2);
          if (held) { if (!o.cracked) this.crackBlock(o, fx); continue; }
          o.noStub = true; this.breakBlock(o, fx);
        }
      }
    }
    // Chân khối có tựa trên nền đất hoặc trên mặt một khối còn lành ngay bên dưới không
    supported(q) {
      if (q.groundY === undefined || q.y0 <= q.groundY + 2.5) return true;
      return this.blocks.some(n => n !== q && n.alive && !n.stub && Math.abs(n.y1 - q.y0) < 1 && Math.hypot(n.x - q.x, n.z - q.z) < 1.5);
    }
    // Vết vỡ lan sang khối kề: khối hai bên sứt mép cạnh giáp, khối dưới sứt mép trên, khối treo phía trên sứt mép dưới
    // -> lỗ vỡ trên tường loang lổ theo nhiều khối, không thành ô cửa vuông vắn đúng một khối
    biteNeighbours(q, top) {
      q.bitDone = true;
      const qTop = top !== undefined ? top : q.y1;
      const addBite = (n, side) => {
        n.bites = n.bites || new Set();
        if (n.bites.has(side)) return;
        n.bites.add(side);
        n.bitten = true;
        n.kit.hide(n.h);
        n.h = n.kit.add('bite' + ['L', 'R', 'T', 'B'].filter(c => n.bites.has(c)).join(''), n.m, n.c);
      };
      for (const n of this.blocks) {
        if (n === q || !n.alive || n.stub || n.bored) continue;
        if (Math.abs(n.rotY - q.rotY) > 0.01) continue;
        const dx = q.x - n.x, dz = q.z - n.z;
        const along = dx * n.ax + dz * n.az;
        const sameCol = Math.hypot(dx, dz) < 1.5;
        if (sameCol) {
          if (Math.abs(n.y1 - q.y0) < 1) addBite(n, 'T');            // khối ngay dưới
          else if (Math.abs(n.y0 - qTop) < 1) addBite(n, 'B');       // khối treo ngay trên
          continue;
        }
        if (Math.abs(n.y0 - q.y0) > 1) continue;
        if (Math.abs(Math.abs(along) - n.len) > 2 || Math.hypot(dx - along * n.ax, dz - along * n.az) > 2) continue;
        addBite(n, along > 0 ? 'R' : 'L');
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
        const broke = this.S.damageSphere(x, y, z, R, A.power, A.pierce, fx, q => q.K === K, ammo);
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
      const broke = this.S.damageSphere(worldPos.x, worldPos.y, worldPos.z, radius, power, A.pierce, fx, null, ammoType);
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
      this.set = new BuildingSet(this.group, [{ x: o.x || 0, z: o.z || 0, w: o.w || 104, d: o.d || 78, floors: o.floors || 4, angle: o.angle || 0, kind: o.kind || 'apartment' }], () => 0);
      this.B = this.set.items[0];
    }
    get visible() { return this.group.visible; }
    set visible(v) { this._vis = v; this.group.visible = v; }
    get isCollapsed() { return this.B.collapsed; }
    // Cùng cơ chế với game: opts { dir (hướng bay), heavy, hitType ('BUILDING' = trúng thẳng nhà, khác = nổ gần) }
    damageAt(worldPos, radius, power, ammoType, fx, opts = {}) {
      this._fx = fx;
      const d = opts.dir || {};
      return this.set.damageAt(worldPos.x, worldPos.y, worldPos.z, ammoType, !!opts.heavy, fx, null,
        { t: opts.hitType || 'BUILDING', dx: d.x || 0, dy: d.y || 0, dz: d.z || 0 });
    }
    update(dt) { this.set.update(dt, this._fx); }
    getHealthRatio() {
      if (this.B.collapsed) return 0;
      let a = 0, t = 0;
      for (const m of this.B.mods) {
        if (m.role !== 'wall' && m.role !== 'col') continue;
        t++;
        if (m.state !== 'gone') a += m.mk ? 1 - m.mk.gone / (m.mk.nx * m.mk.ny) : 1;
      }
      return t ? a / t : 1;
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
