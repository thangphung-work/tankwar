/**
 * VỆT BÁNH XÍCH / BÁNH LỐP TRÊN MẶT ĐẤT — riêng theo từng xe
 * - Xe xích (tăng chủ lực, xe 6 nòng): 2 dải xích đúng tâm & bề rộng dải xích của model, in hằn từng guốc xích.
 * - Xe bánh lốp: mỗi bên một vệt bánh trước + một vệt bánh sau (khi đánh lái vệt bánh trước tách ra theo cung cua),
 *   hoa lốp việt dã chữ V (xe trinh sát 4x4) / hoa lốp khối xe tải (pháo tự hành 6x6).
 * - Vệt là RÃNH LÚN có thật (bản đồ độ cao): lòng rãnh lún xuống, gân guốc xích / hoa lốp hằn sâu hơn, đất bị ép dồn
 *   thành gờ hai bên mép. Được chiếu sáng theo đúng hướng mặt trời (thành rãnh phía nắng sáng, phía kia đổ bóng)
 *   bằng cách nhân lên màu mặt đất bên dưới -> đúng màu đất, đúng ánh sáng, đúng sương mù xa.
 * - Xe xích bẻ lái trượt ngang (skid-steer): vệt bị miết nhòe hoa; quay tại chỗ cày thành vùng đất nát rộng.
 * - Độ lún & màu theo mặt đất (cát lún sâu, bùn sẫm ướt, cỏ dập, đường nhựa chỉ còn vệt cao su mờ, lội nước không để vết),
 *   giữ khá lâu rồi mờ dần.
 */
const TireTracks = (() => {
  const SEG = 2.2;          // khoảng cách giữa 2 điểm vệt (đơn vị game)
  const MAX_PTS = 700;      // số điểm giữ lại mỗi vệt (~1500 đơn vị đường)
  const LIFE = 120;         // giây trước khi mờ hết (mờ dần ở 1/3 cuối)
  const clock = () => performance.now() / 1000;

  // Cấu hình theo loại xe: các vệt (lx, lz trong hệ xe), bề rộng dải tiếp đất, chiều dài 1 ô hoa,
  // len: chiều dài dải xích tì đất (tính độ trượt ngang khi bẻ lái), hmax: độ lún tối đa (đơn vị game, ~8 = 1 m)
  const CFG = {
    ALL_ROUNDER: { tex: 'trackMbt', w: 5.4, tile: 3.6, len: 34, hmax: 0.75, lines: [[-12.2, 0], [12.2, 0]] },
    GATLING: { tex: 'trackFsv', w: 5.6, tile: 3.4, len: 30, hmax: 0.65, lines: [[-12.6, 0], [12.6, 0]] },
    SCOUT: { tex: 'tireOffroad', w: 2.9, tile: 3.2, hmax: 0.4, wheels: true },
    ARTILLERY: { tex: 'tireTruck', w: 3.6, tile: 3.0, hmax: 0.5, wheels: true }
  };
  const BERM = 1.35;        // dải vẽ rộng hơn dải tiếp đất để chứa gờ đất bị ép dồn ra hai bên

  // Theo mặt đất: k = độ đậm chung, d = độ lún (nhân hmax), c = hệ số màu đất bị nén / xới (nhân lên màu đất)
  const SURF = {
    SAND: { k: 1.0, d: 1.0, c: [0.9, 0.87, 0.82] },          // cát: lún sâu, màu gần như cũ (vết hiện nhờ bóng đổ)
    JUNGLE_SOIL: { k: 0.95, d: 1.1, c: [0.68, 0.64, 0.6] },  // đất rừng ẩm: lún, đất ướt lật lên sẫm
    GRASS: { k: 0.85, d: 0.5, c: [0.78, 0.8, 0.66] },         // cỏ bị dập: nông, cỏ úa sẫm lộ đất
    ROAD: { k: 0.85, d: 0.55, c: [0.84, 0.8, 0.74] },         // đường đất
    MOUNTAIN: { k: 0.5, d: 0.2, c: [0.88, 0.87, 0.85] },      // đất đá cứng: hằn rất nông
    URBAN_ROAD: { k: 0.3, d: 0, c: [0.62, 0.62, 0.62] },      // nhựa / bê tông: chỉ vệt cao su, bụi
    BRIDGE: { k: 0.2, d: 0, c: [0.62, 0.62, 0.62] },
    WATER: { k: 0, d: 0, c: [1, 1, 1] }
  };
  const ROAD_NAME_K = [[/BÙN/, 1.0, 1.3, [0.6, 0.56, 0.52]], [/SỎI/, 0.6, 0.35, [0.9, 0.89, 0.86]], [/NHỰA/, 0.3, 0, [0.6, 0.6, 0.6]]];

  // ---------------------------------------------------------------------------
  // BẢN ĐỒ ĐỘ CAO HOA XÍCH / HOA LỐP (lặp theo chiều dọc)
  // R: độ cao (0.5 = mặt đất, 0 = lún sâu nhất, 1 = gờ cao nhất), G: mức đất bị nén / xới (để đổi màu)
  // ---------------------------------------------------------------------------
  const TEX = {};
  const TW = 64, TH = 128;
  const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  // dải gân mềm: 1 trong khoảng [c-hw, c+hw] theo chu kỳ 1, mép mềm
  const bar = (v, c, hw, soft) => { let d = Math.abs(((v - c) % 1 + 1.5) % 1 - 0.5); return 1 - sstep(hw, hw + soft, d); };
  function pattern(kind, u, v) {
    const x = Math.abs(u - 0.5) * 2;   // 0 giữa dải, 1 mép dải tiếp đất
    if (kind === 'trackMbt') {
      // guốc xích thép có gân ngang (grouser) 2 guốc / ô; khe vấu dẫn hướng ở giữa: đất không bị ép -> gờ giữa
      const g = bar(v * 2, 0.3, 0.1, 0.06);
      const pad = bar(v * 2, 0.55, 0.32, 0.06) * 0.25;
      const horn = 1 - sstep(0.06, 0.12, x);
      return { p: (g + pad) * (1 - horn) - 0.45 * horn };
    }
    if (kind === 'trackFsv') {
      // xích chốt kép đệm cao su: 2 khối đệm / guốc + gờ nối ngang mảnh
      const blk = bar(v * 2, 0.25, 0.14, 0.05) * (sstep(0.08, 0.14, x));
      const link = bar(v * 2, 0.62, 0.05, 0.04) * 0.6;
      return { p: Math.max(blk, link) };
    }
    if (kind === 'tireOffroad') {
      // hoa lốp việt dã chữ V: 4 hàng / ô, gân xiên từ giữa ra mép
      const vv = v * 4 - x * 0.45;
      return { p: bar(vv, 0.3, 0.17, 0.08) * sstep(0.04, 0.1, x) };
    }
    // hoa lốp khối xe tải: 3 hàng khối so le, rãnh dọc giữa các khối
    const col = x < 0.3 ? 0 : 1;
    const off = col ? 0.5 : 0;
    const blk = bar(v * 5 + off, 0.5, 0.3, 0.06);
    const gap = 1 - (sstep(0.24, 0.3, x) * (1 - sstep(0.36, 0.42, x)));
    return { p: blk * gap };
  }
  function makeTex(kind) {
    if (TEX[kind]) return TEX[kind];
    const c = document.createElement('canvas');
    c.width = TW; c.height = TH;
    const g = c.getContext('2d');
    const img = g.createImageData(TW, TH), D = img.data;
    const R = 1 / BERM;               // mép dải tiếp đất trong hệ u của dải vẽ
    const tire = kind === 'tireOffroad' || kind === 'tireTruck';
    for (let j = 0; j < TH; j++) {
      const v = (j + 0.5) / TH;
      for (let i = 0; i < TW; i++) {
        const u = (i + 0.5) / TW;
        const s = Math.abs(u - 0.5) * 2;                 // 0 giữa .. 1 mép dải vẽ
        const inside = 1 - sstep(R - 0.07, R + 0.01, s);  // lòng rãnh (thành rãnh dốc, hơi bo)
        const berm = Math.exp(-Math.pow((s - (R + 0.09)) / 0.075, 2)) * (1 - sstep(0.94, 1, s));
        const uu = 0.5 + (u - 0.5) / R;                  // u trong hệ dải tiếp đất
        const p = pattern(kind, uu, v).p;
        // độ cao (đơn vị hmax): lòng rãnh -0.55, gân hằn sâu thêm, gờ đất +0.3
        const h = inside * (-0.55 - 0.4 * p) + berm * (tire ? 0.17 : 0.32);
        const m = Math.min(1, inside * (0.85 + 0.15 * p) + berm * 0.35);
        const k = (j * TW + i) * 4;
        D[k] = Math.round(Math.max(0, Math.min(1, 0.5 + h * 0.5)) * 255);
        D[k + 1] = Math.round(m * 255);
        D[k + 2] = 0; D[k + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = THREE.ClampToEdgeWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    t.premultiplyAlpha = false;
    return (TEX[kind] = t);
  }

  const timeU = { value: 0 };
  const sunU = { value: new THREE.Vector3(0.4, 0.8, 0.3).normalize() };
  const fogU = { value: 0 };
  const MATS = {};
  function material(kind) {
    if (MATS[kind]) return MATS[kind];
    const m = new THREE.ShaderMaterial({
      uniforms: { map: { value: makeTex(kind) }, uTime: timeU, uLife: { value: LIFE }, uSun: sunU, uFog: fogU, uTex: { value: new THREE.Vector2(1 / TW, 1 / TH) } },
      vertexShader: `
        attribute float aBirth; attribute float aStr; attribute vec3 aCol; attribute vec3 aDir; attribute vec4 aGeo;
        varying vec2 vUv; varying float vA; varying vec3 vCol; varying vec2 vTU; varying vec2 vTV; varying vec4 vGeo; varying float vFogD; varying vec2 vW;
        uniform float uTime; uniform float uLife;
        void main() {
          vUv = uv;
          float age = uTime - aBirth;
          vA = aStr * clamp((uLife - age) / (uLife * 0.35), 0.0, 1.0);
          vCol = aCol;
          // hướng trục u (ngang dải) và trục v (dọc dải, luôn theo hướng mũi xe) trên mặt đất
          vTV = aDir.xy * aDir.z;
          vTU = vec2(aDir.y, -aDir.x);
          vGeo = aGeo;   // x: bề rộng dải vẽ, y: chiều dài ô hoa, z: độ trượt 0..1, w: độ lún (đơn vị game)
          vW = (modelMatrix * vec4(position, 1.0)).xz;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vFogD = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D map; uniform vec3 uSun; uniform float uFog; uniform vec2 uTex;
        varying vec2 vUv; varying float vA; varying vec3 vCol; varying vec2 vTU; varying vec2 vTV; varying vec4 vGeo; varying float vFogD; varying vec2 vW;
        // xích trượt ngang -> hoa bị miết nhòe dọc vệt (lấy trung bình 5 điểm dọc v); trượt mạnh thì mất hẳn hoa
        vec2 H(vec2 uv) {
          float sl = vGeo.z * 1.4;
          vec2 a = texture2D(map, uv).rg * 0.4;
          a += texture2D(map, uv + vec2(0.0, sl * 0.5)).rg * 0.2 + texture2D(map, uv - vec2(0.0, sl * 0.5)).rg * 0.2;
          a += texture2D(map, uv + vec2(0.0, sl)).rg * 0.1 + texture2D(map, uv - vec2(0.0, sl)).rg * 0.1;
          // trượt mạnh (quay tại chỗ): hoa xích bị xóa sạch, chỉ còn lòng rãnh bị cày (lấy mức mip thô)
          float wipe = smoothstep(0.35, 0.8, vGeo.z);
          if (wipe > 0.0) a = mix(a, texture2D(map, uv, 4.5).rg, wipe);
          return a;
        }
        // nhiễu giá trị: đất bị xích cày xới thành cục, ụ lổn nhổn
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vnoise(vec2 p) {
          vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
        }
        float churn(vec2 w) { return vnoise(w * 0.7) * 0.65 + vnoise(w * 1.9 + 17.0) * 0.35; }
        void main() {
          float fogF = 1.0 - exp(-uFog * uFog * vFogD * vFogD);
          float fade = vA * (1.0 - fogF);
          if (fade < 0.01) discard;
          vec2 c = H(vUv);
          float hx = (H(vUv + vec2(uTex.x, 0.0)).r - H(vUv - vec2(uTex.x, 0.0)).r) / (2.0 * uTex.x);
          float hy = (H(vUv + vec2(0.0, uTex.y)).r - H(vUv - vec2(0.0, uTex.y)).r) / (2.0 * uTex.y);
          // độ dốc mặt rãnh trong hệ thế giới (độ cao thật = (R - 0.5) * 2 * độ lún)
          float k = 2.0 * vGeo.w;
          vec2 g = vTU * (hx * k / vGeo.x) + vTV * (hy * k / vGeo.y);
          // vùng trượt / quay tại chỗ: đất xới cục trong lòng rãnh (độ dốc của nhiễu theo hệ thế giới)
          float ch = vGeo.z * vGeo.z * c.g * vGeo.w * 0.9;
          if (ch > 0.01) {
            float n0 = churn(vW);
            g += ch * vec2(churn(vW + vec2(0.35, 0.0)) - n0, churn(vW + vec2(0.0, 0.35)) - n0) / 0.35;
          }
          vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
          // chiếu sáng tương đối so với mặt đất phẳng (nắng + ánh trời): thành rãnh hướng nắng sáng lên, phía kia tối
          float amb = 0.6;
          float lit = (amb + max(dot(n, uSun), 0.0)) / (amb + max(uSun.y, 0.0));
          // đáy rãnh / khe gân hẹp nhận ít ánh trời hơn (che khuất)
          lit *= 1.0 - 0.18 * clamp((0.5 - c.r) * 2.0, 0.0, 1.0) * clamp(vGeo.w, 0.0, 1.0);
          vec3 m = lit * mix(vec3(1.0), vCol, c.g);
          m = mix(vec3(1.0), m, fade);
          // nhân lên màu mặt đất (2x multiply: 0.5 = giữ nguyên); khung hình lưu giá trị đã nén gamma
          gl_FragColor = vec4(pow(max(m, vec3(0.0)), vec3(0.6)) * 0.5, 1.0);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.DstColorFactor,
      blendDst: THREE.SrcColorFactor,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
    });
    return (MATS[kind] = m);
  }

  // ---------------------------------------------------------------------------
  // MỘT VỆT (dải băng liên tục, bộ đệm tuyến tính có dời khối khi đầy)
  // ---------------------------------------------------------------------------
  class Line {
    constructor(scene, kind, width, tile, lx, lz) {
      this.lx = lx; this.lz = lz; this.w = width; this.tile = tile; this.slip = 0;
      const N = MAX_PTS * 2;   // bộ đệm gấp đôi: đầy thì dời nửa sau về đầu
      this.N = N;
      const V = N * 2;
      this.pos = new Float32Array(V * 3);
      this.uv = new Float32Array(V * 2);
      this.birth = new Float32Array(V);
      this.str = new Float32Array(V);
      this.col = new Float32Array(V * 3);
      this.dir = new Float32Array(V * 3);
      this.geo4 = new Float32Array(V * 4);
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
      g.setAttribute('aDir', new THREE.BufferAttribute(this.dir, 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('aGeo', new THREE.BufferAttribute(this.geo4, 4).setUsage(THREE.DynamicDrawUsage));
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

    // (dx, dz): hướng dải (theo chiều chạy), vcoord: tọa độ dọc hoa (tăng theo hướng mũi xe), sg: +1 tiến / -1 lùi,
    // width: bề rộng dải vẽ, slip: độ trượt 0..1, depth: độ lún (đơn vị game)
    writePoint(x, z, dx, dz, y0, y1, vcoord, str, col, t, sg, width, slip, depth) {
      if (this.head >= this.N) this.shift();
      const k = this.head++;
      const nx = -dz, nz = dx, hw = width / 2;
      const v = k * 2;
      const P = this.pos, U = this.uv;
      P[v * 3] = x + nx * hw; P[v * 3 + 1] = y0; P[v * 3 + 2] = z + nz * hw;
      P[v * 3 + 3] = x - nx * hw; P[v * 3 + 4] = y1; P[v * 3 + 5] = z - nz * hw;
      const vv = vcoord / this.tile;
      U[v * 2] = 0; U[v * 2 + 1] = vv; U[v * 2 + 2] = 1; U[v * 2 + 3] = vv;
      this.birth[v] = this.birth[v + 1] = t;
      this.str[v] = this.str[v + 1] = str;
      for (let i = 0; i < 2; i++) {
        const o3 = (v + i) * 3, o4 = (v + i) * 4;
        this.col[o3] = col[0]; this.col[o3 + 1] = col[1]; this.col[o3 + 2] = col[2];
        this.dir[o3] = dx; this.dir[o3 + 1] = dz; this.dir[o3 + 2] = sg;
        this.geo4[o4] = width; this.geo4[o4 + 1] = this.tile; this.geo4[o4 + 2] = slip; this.geo4[o4 + 3] = depth;
      }
      this.markDirty(v, 2);
    }

    // Đầy bộ đệm: giữ MAX_PTS điểm mới nhất, dời về đầu
    shift() {
      const keep = MAX_PTS, from = this.head - keep;
      const mv = (arr, n) => arr.copyWithin(0, from * 2 * n, this.head * 2 * n);
      mv(this.pos, 3); mv(this.uv, 2); mv(this.birth, 1); mv(this.str, 1); mv(this.col, 3); mv(this.dir, 3); mv(this.geo4, 4);
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
      for (const [name, n] of [['position', 3], ['uv', 2], ['aBirth', 1], ['aStr', 1], ['aCol', 3], ['aDir', 3], ['aGeo', 4]]) {
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
      for (const [re, k, d, c] of ROAD_NAME_K) if (re.test(info.name || '')) return { k, d, c };
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

  // Hướng nắng & sương mù của cảnh hiện tại
  let sunLight = null;
  function syncLight(u, terrain) {
    const atm = terrain && terrain.atmosphere;
    if (atm && atm.sunDir) sunU.value.copy(atm.sunDir);
    else {
      if (!sunLight || !sunLight.parent) { sunLight = null; u.scene.traverse(o => { if (!sunLight && o.isDirectionalLight) sunLight = o; }); }
      if (sunLight) sunU.value.copy(sunLight.position).sub(sunLight.target.position).normalize();
    }
    const f = u.scene.fog;
    fogU.value = f && f.isFogExp2 ? f.density : 0;
  }

  /** Gọi mỗi khung từ spg.js */
  function update(u, terrain, info) {
    if (!u.scene || !u.group || typeof document === 'undefined') return;
    const t = clock();
    timeU.value = t;
    if (!u._tt) {
      u._tt = linesFor(u).map(d => { const L = new Line(u.scene, d.cfg.tex, d.cfg.w, d.cfg.tile, d.lx, d.lz); L.cfg = d.cfg; return L; });
    }
    if (u.isDead) { for (const L of u._tt) L.last = null; return; }
    syncLight(u, terrain);
    const a = u.bodyAngle || 0, c = Math.cos(a), s = Math.sin(a);
    const fx = -Math.sin(a), fz = -Math.cos(a);
    const sf = surfaceOf(info);
    const gAt = terrain.getVehicleGroundAt ? (x, z) => terrain.getVehicleGroundAt(x, z, u._suspY) : (x, z) => terrain.getElevationAt(x, z);
    u._tt.forEach((L) => {
      const cfg = L.cfg;
      // vị trí điểm tiếp đất của vệt trong thế giới
      const x = u.x + L.lx * c + L.lz * s;
      const z = u.z - L.lx * s + L.lz * c;
      if (!L.last) { L.last = { x, z, v: 0, dx: fx, dz: fz, a, sg: 1 }; return; }
      let dx = x - L.last.x, dz = z - L.last.z;
      const d = Math.hypot(dx, dz);
      if (d < SEG) return;
      // dịch chuyển tức thời (hồi sinh) hoặc lội nước / không bám đất: ngắt vệt
      const brk = d > 40 || sf.k <= 0;
      dx /= d; dz /= d;
      // tiến / lùi so với mũi xe: hoa lốp chữ V luôn in theo chiều mũi xe, kể cả khi lùi
      const along = dx * fx + dz * fz;
      const sg = Math.abs(along) > 0.2 ? Math.sign(along) : L.last.sg;
      // ĐỘ TRƯỢT NGANG: xe xích bẻ lái thì hai đầu dải xích bị miết ngang (quãng ≈ góc quay × nửa dải xích);
      // quay tại chỗ gần như chỉ còn trượt. Xe bánh: bánh sau trượt khi xe văng đuôi (bánh trước đánh lái nên không tính)
      let da = a - L.last.a; da = Math.atan2(Math.sin(da), Math.cos(da));
      const lat = Math.abs(dx * fz - dz * fx) * d;
      const lon = Math.abs(along) * d;
      const scrub = cfg.len ? Math.abs(da) * cfg.len / 2 + lat : (L.lz > 0 ? lat : 0);
      const slip0 = Math.min(1, 1.6 * scrub / (scrub + lon + 0.5));
      L.slip = L.slip * 0.55 + slip0 * 0.45;
      const slip = brk ? 0 : L.slip;
      // hướng vệt mượt (trung bình với đoạn trước) để mép băng không gãy khúc
      let mx = dx + L.last.dx * 0.6, mz = dz + L.last.dz * 0.6;
      const ml = Math.hypot(mx, mz) || 1; mx /= ml; mz /= ml;
      // quay tại chỗ: vùng đất bị cày rộng bằng vành quét của dải xích — hai đầu dải xích quét ra xa tâm quay hơn
      // phần giữa, nên vùng cày nằm lệch ra phía ngoài (không nở vào trong, tránh dải gập chéo lên chính nó)
      const s2 = slip * slip;
      const width = L.w * BERM * (1 + (cfg.len ? 1.2 : 0.3) * s2);
      const hw = width / 2;
      let ox = 0, oz = 0;
      if (cfg.len) {
        const out = Math.sign(L.lx) * (width - L.w * BERM) * 0.5;
        ox = c * out; oz = -s * out;   // trục ngang của xe trong thế giới
      }
      const px = x + ox, pz = z + oz;
      const y0 = gAt(px - mz * hw, pz + mx * hw) + 0.14, y1 = gAt(px + mz * hw, pz - mx * hw) + 0.14;
      const br = u.trackBroken && (L.lx < 0 ? u.trackBroken[0] : u.trackBroken[1]);
      const str = brk ? 0 : sf.k * (br ? 0.45 : 1) * (u.isInBush ? 0.7 : 1);
      const depth = cfg.hmax * (sf.d !== undefined ? sf.d : 1) * (1 + 0.4 * slip);
      const vc = L.last.v + (brk ? 0 : sg * d);
      if (brk || L.last.zero) {
        // cặp điểm cường độ 0 để không nối vệt qua chỗ ngắt
        L.writePoint(L.last.x, L.last.z, mx, mz, y0, y1, L.last.v, 0, sf.c, t, sg, width, slip, depth);
        L.writePoint(px, pz, mx, mz, y0, y1, vc, 0, sf.c, t, sg, width, slip, depth);
      }
      if (!brk) L.writePoint(px, pz, mx, mz, y0, y1, vc, str, sf.c, t, sg, width, slip, depth);
      L.last = { x, z, v: vc, dx: mx, dz: mz, zero: brk, a, sg };
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
