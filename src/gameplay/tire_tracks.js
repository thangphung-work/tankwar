/**
 * VỆT BÁNH XÍCH / BÁNH LỐP TRÊN MẶT ĐẤT — riêng theo từng xe
 * - Xe xích (tăng chủ lực, xe 6 nòng): 2 dải xích đúng tâm & bề rộng dải xích của model, in hằn từng guốc xích.
 * - Xe bánh lốp: mỗi bên một vệt bánh trước + một vệt bánh sau (khi đánh lái vệt bánh trước tách ra theo cung cua),
 *   hoa lốp việt dã chữ V (xe trinh sát 4x4) / hoa lốp khối xe tải (pháo tự hành 6x6).
 * - Vệt liền mạch bám theo địa hình, độ đậm & màu theo mặt đất (cát hằn sâu, bùn đen, cỏ nâu sẫm, đường nhựa chỉ vệt cao su mờ,
 *   lội nước không để vết), mờ dần theo thời gian.
 */
const TireTracks = (() => {
  const SEG = 2.2;          // khoảng cách giữa 2 điểm vệt (đơn vị game)
  const MAX_PTS = 700;      // số điểm giữ lại mỗi vệt (~1500 đơn vị đường)
  const LIFE = 40;          // giây trước khi mờ hết
  const clock = () => performance.now() / 1000;

  // Cấu hình theo loại xe: các vệt (lx, lz trong hệ xe), bề rộng, kiểu hoa, chiều dài 1 ô hoa
  const CFG = {
    ALL_ROUNDER: { tex: 'trackMbt', w: 5.4, tile: 3.6, lines: [[-12.2, 0], [12.2, 0]] },
    GATLING: { tex: 'trackFsv', w: 5.6, tile: 3.4, lines: [[-12.6, 0], [12.6, 0]] },
    SCOUT: { tex: 'tireOffroad', w: 2.9, tile: 3.2, wheels: true },
    ARTILLERY: { tex: 'tireTruck', w: 3.6, tile: 3.0, wheels: true }
  };

  // Màu & độ đậm theo mặt đất
  const SURF = {
    // màu đất bị nén / rãnh hằn: chỉ sẫm hơn mặt đất xung quanh một chút (không đen kịt)
    SAND: { k: 1.0, c: [0.56, 0.45, 0.3] },
    JUNGLE_SOIL: { k: 0.9, c: [0.22, 0.17, 0.11] },
    GRASS: { k: 0.8, c: [0.27, 0.26, 0.15] },
    ROAD: { k: 0.85, c: [0.4, 0.33, 0.23] },
    MOUNTAIN: { k: 0.35, c: [0.43, 0.41, 0.37] },
    URBAN_ROAD: { k: 0.25, c: [0.08, 0.08, 0.08] },
    BRIDGE: { k: 0.18, c: [0.08, 0.08, 0.08] },
    WATER: { k: 0, c: [0, 0, 0] }
  };
  const ROAD_NAME_K = [[/BÙN/, 1.0, [0.17, 0.13, 0.09]], [/SỎI/, 0.5, [0.4, 0.38, 0.34]], [/NHỰA/, 0.22, [0.08, 0.08, 0.08]]];

  // ---------------------------------------------------------------------------
  // HOA XÍCH / HOA LỐP (canvas, lặp theo chiều dọc; trắng = in hằn, alpha = độ đậm)
  // ---------------------------------------------------------------------------
  const TEX = {};
  function makeTex(kind) {
    if (TEX[kind]) return TEX[kind];
    const W = 64, H = 128;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.clearRect(0, 0, W, H);
    const soil = (a) => `rgba(255,255,255,${a})`;
    // nền dải đất bị nén (mép mờ dần)
    const grad = g.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0, soil(0)); grad.addColorStop(0.12, soil(0.22)); grad.addColorStop(0.88, soil(0.22)); grad.addColorStop(1, soil(0));
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
    g.fillStyle = soil(1);
    if (kind === 'trackMbt' || kind === 'trackFsv') {
      // guốc xích: thanh ngang, có rãnh giữa (vấu dẫn hướng) — mỗi ô 2 guốc
      const pads = 2, ph = H / pads;
      for (let i = 0; i < pads; i++) {
        const y = i * ph;
        if (kind === 'trackMbt') {
          g.fillRect(5, y + ph * 0.1, W * 0.4, ph * 0.42);
          g.fillRect(W * 0.6 - 5 + 5, y + ph * 0.1, W * 0.4 - 5, ph * 0.42);
          g.fillStyle = soil(0.6); g.fillRect(W * 0.45, y + ph * 0.62, W * 0.1, ph * 0.22); g.fillStyle = soil(1);
        } else {
          // xích chốt kép đệm cao su: 2 khối đệm lệch + gờ ngang mảnh
          g.fillRect(4, y + ph * 0.08, W * 0.42, ph * 0.3);
          g.fillRect(W * 0.54, y + ph * 0.08, W * 0.42, ph * 0.3);
          g.fillRect(4, y + ph * 0.55, W - 8, ph * 0.12);
        }
      }
    } else if (kind === 'tireOffroad') {
      // hoa lốp việt dã chữ V (định hướng)
      const rows = 4, rh = H / rows;
      for (let i = 0; i < rows; i++) {
        const y = i * rh;
        for (const s of [-1, 1]) {
          g.beginPath();
          const x0 = W / 2 + s * 3, x1 = W / 2 + s * (W / 2 - 3);
          g.moveTo(x0, y + rh * 0.15); g.lineTo(x1, y + rh * 0.55); g.lineTo(x1, y + rh * 0.95); g.lineTo(x0, y + rh * 0.55);
          g.closePath(); g.fill();
        }
      }
    } else {
      // hoa lốp khối xe tải: 3 hàng khối so le + rãnh dọc
      const rows = 5, rh = H / rows;
      for (let i = 0; i < rows; i++) {
        const y = i * rh, off = (i % 2) * 5;
        g.fillRect(3, y + 2 + off * 0.3, W * 0.27, rh * 0.62);
        g.fillRect(W * 0.365, y + rh * 0.3, W * 0.27, rh * 0.62);
        g.fillRect(W * 0.7, y + 2 + off * 0.3, W * 0.27, rh * 0.62);
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = THREE.ClampToEdgeWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    return (TEX[kind] = t);
  }

  const timeU = { value: 0 };
  const MATS = {};
  function material(kind) {
    if (MATS[kind]) return MATS[kind];
    const m = new THREE.ShaderMaterial({
      uniforms: { map: { value: makeTex(kind) }, uTime: timeU, uLife: { value: LIFE } },
      vertexShader: `
        attribute float aBirth; attribute float aStr; attribute vec3 aCol;
        varying vec2 vUv; varying float vA; varying vec3 vCol;
        uniform float uTime; uniform float uLife;
        void main() {
          vUv = uv;
          float age = uTime - aBirth;
          vA = aStr * clamp(1.0 - age / uLife, 0.0, 1.0);
          vCol = aCol;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform sampler2D map;
        varying vec2 vUv; varying float vA; varying vec3 vCol;
        void main() {
          vec4 t = texture2D(map, vUv);
          float a = t.a * vA * 0.5;
          if (a < 0.008) discard;
          gl_FragColor = vec4(vCol, a);
        }`,
      transparent: true,
      depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
    });
    return (MATS[kind] = m);
  }

  // ---------------------------------------------------------------------------
  // MỘT VỆT (dải băng liên tục, bộ đệm tuyến tính có dời khối khi đầy)
  // ---------------------------------------------------------------------------
  class Line {
    constructor(scene, kind, width, tile, lx, lz) {
      this.lx = lx; this.lz = lz; this.w = width; this.tile = tile;
      const N = MAX_PTS * 2;   // bộ đệm gấp đôi: đầy thì dời nửa sau về đầu
      this.N = N;
      const V = N * 2;
      this.pos = new Float32Array(V * 3);
      this.uv = new Float32Array(V * 2);
      this.birth = new Float32Array(V);
      this.str = new Float32Array(V);
      this.col = new Float32Array(V * 3);
      const idx = new Uint16Array((N - 1) * 6);
      for (let k = 0; k < N - 1; k++) {
        const a = k * 2, b = a + 1, c = a + 2, d = a + 3;
        idx.set([a, c, b, b, c, d], k * 6);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('uv', new THREE.BufferAttribute(this.uv, 2).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('aBirth', new THREE.BufferAttribute(this.birth, 1).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('aStr', new THREE.BufferAttribute(this.str, 1).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('aCol', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
      g.setIndex(new THREE.BufferAttribute(idx, 1));
      g.setDrawRange(0, 0);
      this.geo = g;
      this.mesh = new THREE.Mesh(g, material(kind));
      this.mesh.frustumCulled = false;
      this.mesh.renderOrder = 1;
      this.mesh.name = 'tireTrack';
      scene.add(this.mesh);
      this.head = 0;          // số điểm đã ghi trong bộ đệm
      this.last = null;       // điểm cuối {x, z, dist}
      this.dirty0 = 0;
    }

    writePoint(x, z, dx, dz, y0, y1, dist, str, col, t) {
      if (this.head >= this.N) this.shift();
      const k = this.head++;
      const nx = -dz, nz = dx, hw = this.w / 2;
      const v = k * 2;
      const P = this.pos, U = this.uv;
      P[v * 3] = x + nx * hw; P[v * 3 + 1] = y0; P[v * 3 + 2] = z + nz * hw;
      P[v * 3 + 3] = x - nx * hw; P[v * 3 + 4] = y1; P[v * 3 + 5] = z - nz * hw;
      const vv = dist / this.tile;
      U[v * 2] = 0; U[v * 2 + 1] = vv; U[v * 2 + 2] = 1; U[v * 2 + 3] = vv;
      this.birth[v] = this.birth[v + 1] = t;
      this.str[v] = this.str[v + 1] = str;
      for (let i = 0; i < 2; i++) { this.col[(v + i) * 3] = col[0]; this.col[(v + i) * 3 + 1] = col[1]; this.col[(v + i) * 3 + 2] = col[2]; }
      this.markDirty(v, 2);
    }

    // Đầy bộ đệm: giữ MAX_PTS điểm mới nhất, dời về đầu
    shift() {
      const keep = MAX_PTS, from = this.head - keep;
      const mv = (arr, n) => arr.copyWithin(0, from * 2 * n, this.head * 2 * n);
      mv(this.pos, 3); mv(this.uv, 2); mv(this.birth, 1); mv(this.str, 1); mv(this.col, 3);
      this.head = keep;
      this.fullUpload = true;
    }

    markDirty(v, n) {
      if (this.dMin === undefined || v < this.dMin) this.dMin = v;
      if (this.dMax === undefined || v + n > this.dMax) this.dMax = v + n;
    }

    flush() {
      if (this.dMin === undefined && !this.fullUpload) return;
      const a = this.geo.attributes;
      for (const [name, n] of [['position', 3], ['uv', 2], ['aBirth', 1], ['aStr', 1], ['aCol', 3]]) {
        const at = a[name];
        if (this.fullUpload) { at.updateRange.offset = 0; at.updateRange.count = -1; }
        else { at.updateRange.offset = this.dMin * n; at.updateRange.count = (this.dMax - this.dMin) * n; }
        at.needsUpdate = true;
      }
      this.fullUpload = false;
      this.dMin = this.dMax = undefined;
      // chỉ vẽ MAX_PTS điểm mới nhất
      const first = Math.max(0, this.head - MAX_PTS);
      const quads = Math.max(0, this.head - 1 - first);
      this.geo.setDrawRange(first * 6, quads * 6);
    }

    dispose() {
      if (this.mesh.parent) this.mesh.parent.remove(this.mesh);
      this.geo.dispose();
    }
  }

  function surfaceOf(info) {
    if (!info) return SURF.GRASS;
    if (info.type === 'ROAD' || info.type === 'URBAN_ROAD') {
      for (const [re, k, c] of ROAD_NAME_K) if (re.test(info.name || '')) return { k, c };
    }
    return SURF[info.type] || SURF.GRASS;
  }

  function linesFor(u) {
    const cfg = CFG[u.tankType] || CFG.ALL_ROUNDER;
    let defs = cfg.lines;
    if (cfg.wheels) {
      // Lấy đúng vị trí bánh từ model: mỗi bên bánh trước nhất + bánh sau nhất
      const ws = u.wheelSet;
      const ps = ws && ws.positions && ws.positions.length ? ws.positions : [{ x: -7, z: -10 }, { x: 7, z: -10 }, { x: -7, z: 10 }, { x: 7, z: 10 }];
      const zs = ps.map(p => p.z), zF = Math.min(...zs), zR = Math.max(...zs);
      const xL = Math.min(...ps.map(p => p.x)), xR = Math.max(...ps.map(p => p.x));
      defs = [[xL, zF], [xR, zF], [xL, zR], [xR, zR]];
    }
    return defs.map(([lx, lz]) => ({ lx, lz, cfg }));
  }

  /** Gọi mỗi khung từ spg.js */
  function update(u, terrain, info) {
    if (!u.scene || !u.group || typeof document === 'undefined') return;
    const t = clock();
    timeU.value = t;
    if (!u._tt) {
      u._tt = linesFor(u).map(d => new Line(u.scene, d.cfg.tex, d.cfg.w, d.cfg.tile, d.lx, d.lz));
    }
    if (u.isDead) { for (const L of u._tt) L.last = null; return; }
    const a = u.bodyAngle || 0, c = Math.cos(a), s = Math.sin(a);
    const fx = -Math.sin(a), fz = -Math.cos(a);
    const sf = surfaceOf(info);
    // Xe đang trượt ở sườn quá dốc / xích đứt bên đó: vệt quét mờ hơn
    // vệt xích in theo mặt nhìn thấy (trong / quanh hố bom là lòng hố & gờ đất, không phải lưới vật lý thô)
    const gAt = u.inCrater && terrain.vehicleSurfaceAt ? (x, z) => terrain.vehicleSurfaceAt(x, z, u._suspY)
      : terrain.getVehicleGroundAt ? (x, z) => terrain.getVehicleGroundAt(x, z, u._suspY) : (x, z) => terrain.getElevationAt(x, z);
    u._tt.forEach((L, i) => {
      // vị trí điểm tiếp đất của vệt trong thế giới
      const x = u.x + L.lx * c + L.lz * s;
      const z = u.z - L.lx * s + L.lz * c;
      if (!L.last) { L.last = { x, z, dist: 0, dx: fx, dz: fz }; return; }
      let dx = x - L.last.x, dz = z - L.last.z;
      const d = Math.hypot(dx, dz);
      if (d < SEG) return;
      // dịch chuyển tức thời (hồi sinh) hoặc lội nước / không bám đất: ngắt vệt
      const brk = d > 40 || sf.k <= 0;
      dx /= d; dz /= d;
      // hướng vệt mượt (trung bình với đoạn trước) để mép băng không gãy khúc
      let mx = dx + L.last.dx * 0.6, mz = dz + L.last.dz * 0.6;
      const ml = Math.hypot(mx, mz) || 1; mx /= ml; mz /= ml;
      const hw = L.w / 2;
      const y0 = gAt(x - mz * hw, z + mx * hw) + 0.14, y1 = gAt(x + mz * hw, z - mx * hw) + 0.14;
      const br = u.trackBroken && (L.lx < 0 ? u.trackBroken[0] : u.trackBroken[1]);
      const str = brk ? 0 : sf.k * (br ? 0.45 : 1) * (u.isInBush ? 0.7 : 1);
      const dist = L.last.dist + (brk ? 0 : d);
      if (brk || L.last.zero) {
        // cặp điểm cường độ 0 để không nối vệt qua chỗ ngắt
        L.writePoint(L.last.x, L.last.z, mx, mz, y0, y1, L.last.dist, 0, sf.c, t);
        L.writePoint(x, z, mx, mz, y0, y1, dist, 0, sf.c, t);
      }
      if (!brk) L.writePoint(x, z, mx, mz, y0, y1, dist, str, sf.c, t);
      L.last = { x, z, dist, dx: mx, dz: mz, zero: brk };
    });
    for (const L of u._tt) L.flush();
  }

  function clear(u) {
    if (!u || !u._tt) return;
    for (const L of u._tt) L.dispose();
    u._tt = null;
  }

  return { update, clear, CFG };
})();

if (typeof window !== 'undefined') window.TireTracks = TireTracks;
