/**
 * Hệ thống Địa hình Chiến trường 3D sinh ngẫu nhiên theo seed (Three.js WebGL)
 * 5 loại chiến địa, mỗi trận một bản đồ khác (cùng seed -> giống hệt nhau trên mọi máy):
 * 1. DESERT     - Sa mạc: đụn cát lưỡi liềm theo hướng gió, núi bàn, ốc đảo cọ, đường đất lún vệt bánh
 * 2. URBAN      - Đô thị: lưới phố không đều, nhà cao tầng / chung cư / cửa hàng / nhà đổ nát, đường nhựa ổ gà
 * 3. JUNGLE     - Rừng rậm: đồi lượn sóng, rừng dày đặc, đường bùn nhão
 * 4. HIGHLAND   - Cao nguyên: núi đá sống lưng, rừng thông, đường sỏi đèo dốc
 * 5. RIVER_LAKE - Sông hồ: sông uốn khúc chảy dọc chiến trường, hồ, cầu bê tông, làng ven sông
 * Dữ liệu bản đồ: src/core/map_gen.js (thuần dữ liệu); vật thể phá hủy: src/gameplay/destructibles.js
 */
class BattleTerrain3D {
  constructor(scene, width = 3600, depth = 3600, mapType = 'DESERT', seed) {
    this.scene = scene;
    this.width = width;
    this.depth = depth;
    this.mapType = mapType || 'DESERT';
    this.seed = (seed >>> 0) || (typeof MapGen !== 'undefined' ? MapGen.randomSeed() : 1);

    this.segments = typeof MapGen !== 'undefined' ? MapGen.RES : 96;
    this.gridCols = this.segments;
    this.gridRows = this.segments;
    this.heightData = new Float32Array((this.segments + 1) * (this.segments + 1));

    this.group = new THREE.Group();
    this.group.name = 'terrain';
    this.scene.add(this.group);

    this.horseshoeForts = [];
    this.buildings = [];
    this.palmTrees = [];
    this.bushClusters = [];
    this.boulders = [];
    this.bridges = [];
    this.craters = [];
    this.waterMesh = null;

    this.mapCanvas = document.createElement('canvas');
    this.mapCanvas.width = 1200;
    this.mapCanvas.height = 1200;
    this.mapCtx = this.mapCanvas.getContext('2d');

    this.buildTerrain();
  }

  // ---------------------------------------------------------------------------
  // VÒNG ĐỜI
  // ---------------------------------------------------------------------------
  clearTerrain() {
    const disposeObj = (obj) => {
      obj.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose());
      });
    };
    while (this.group.children.length > 0) {
      const obj = this.group.children[0];
      this.group.remove(obj);
      disposeObj(obj);
    }
    if (this.groundTexture) { this.groundTexture.dispose(); this.groundTexture = null; }
    this.horseshoeForts = [];
    this.buildings = [];
    this.palmTrees = [];
    this.bushClusters = [];
    this.boulders = [];
    this.bridges = [];
    this.craters = [];
    this.waterMesh = null;
    this.trees = this.buildingSet = this.bunkerSet = this.strongholdSet = this.groundCover = this.propSet = null;
    this.envDamage = null;
    this.rockItems = [];
    this.built = false;
  }

  // Đổi map (giữ nguyên nếu đã dựng đúng loại + seed -> vào trận không phải dựng lại)
  setMapType(mapType, seed) {
    const t = mapType || 'DESERT';
    const s = seed === undefined || seed === null ? this.seed : (seed >>> 0);
    if (this.built && t === this.mapType && s === this.seed) return false;
    this.mapType = t;
    this.seed = s;
    this.clearTerrain();
    this.buildTerrain();
    return true;
  }
  prepare(mapType, seed) { return this.setMapType(mapType, seed); }

  buildTerrain() {
    const t0 = performance.now();
    this.map = MapGen.get(this.mapType, this.seed);
    this.segments = this.map.res;
    this.heightData = new Float32Array(this.map.heights);
    // Hạ lưới đất dưới kênh xe chạy của các cứ điểm (sàn khoang / dốc bê tông nằm trên)
    const SHL = this.map.strongholds || [];
    if (SHL.length && typeof Strongholds !== 'undefined') Strongholds.carveHeights(this.heightData, this.segments, this.width, SHL);
    this.applyAtmosphere();
    this.initTerrainMesh();
    this.buildRoads();
    this.buildWater();
    this.buildRocks();
    this.buildBridges();   // + hệ thống phá hủy cảnh vật (EnvDamage): đá tảng có máu, cầu sập, vết đạn tích tụ
    this.buildBushes();

    const ground = (x, z) => this.groundAtRaw(x, z);
    if (SHL.length && typeof Strongholds !== 'undefined') {
      this.strongholdSet = new Strongholds.StrongholdSet(this.group, SHL, { mapType: this.mapType, groundAt: ground });
    }
    // Dựng nhà / cây / boong-ke với hạt giống của bản đồ -> mọi máy có cùng hình dạng & độ bền từng mảng
    if (typeof Destructibles !== 'undefined') Destructibles.withSeed((this.seed ^ 0x5eed1234) >>> 0, () => {
      this.bunkerSet = new Destructibles.BunkerSet(this.group, this.map.bunkers, ground);
      this.horseshoeForts = this.bunkerSet.items.map(k => k.fort);
      this.buildingSet = new Destructibles.BuildingSet(this.group, this.map.buildings, ground);
      this.buildings = this.buildingSet.items.map(b => b.entry);
      this.trees = new Destructibles.TreeField(this.group, this.map.trees, ground);
      this.palmTrees = this.trees.items;
    });

    // Hàng rào, ruộng, xác xe, bao cát (props.js)
    if (typeof Props !== 'undefined' && this.map.props) this.propSet = new Props.PropSet(this, this.map.props);

    // Cỏ 3D + đá vụn quanh camera (rải theo vùng nhìn thấy, xem GroundCover.update)
    if (typeof GroundCover !== 'undefined' && typeof GroundShader !== 'undefined') this.groundCover = new GroundCover.Cover(this);
    this.optimizeStaticScene();
    this.renderPrecomputedMap();
    this.built = true;
    this.buildMs = Math.round(performance.now() - t0);
  }

  optimizeStaticScene() {
    this.group.updateMatrixWorld(true);
    this.group.traverse((obj) => {
      if (obj === this.group || obj === this.waterMesh) return;
      obj.matrixAutoUpdate = false;
      if (obj.isMesh && !obj.isInstancedMesh && obj.castShadow && obj.geometry) {
        if (!obj.geometry.boundingSphere) obj.geometry.computeBoundingSphere();
        const s = obj.scale;
        if (obj.geometry.boundingSphere.radius * Math.max(s.x, s.y, s.z) < 9) obj.castShadow = false;
      }
    });
  }

  // ---------------------------------------------------------------------------
  // KHÍ QUYỂN: màu trời, sương mù, mặt trời theo giờ trong ngày (dùng cho SkySystem & đèn)
  // ---------------------------------------------------------------------------
  applyAtmosphere() {
    if (!this.scene) return;
    const sun = this.map.sun;
    const PAL = {
      DESERT: { zenith: 0x4f86c6, horizon: 0xe6cfa4, fog: 0xdcc39a, density: 0.00022, ground: 0xb08a5a },
      URBAN: { zenith: 0x5c7fa8, horizon: 0xc4c6c4, fog: 0xb9bcbc, density: 0.00030, ground: 0x6a6a64 },
      JUNGLE: { zenith: 0x5d8fb5, horizon: 0xb9cbb6, fog: 0xa9bba4, density: 0.00036, ground: 0x3c4a2a },
      HIGHLAND: { zenith: 0x3f7cc4, horizon: 0xc9d8e4, fog: 0xbfcfdc, density: 0.00020, ground: 0x6b6450 },
      RIVER_LAKE: { zenith: 0x4c8bd0, horizon: 0xd2dfe4, fog: 0xc6d6da, density: 0.00026, ground: 0x55663a }
    };
    const p = Object.assign({}, PAL[this.mapType] || PAL.DESERT);
    // Giờ vàng / sáng sớm: chân trời ấm hơn, trời đậm hơn
    const warm = sun.timeOfDay === 'golden' ? 0.55 : sun.timeOfDay === 'morning' ? 0.25 : 0;
    const mix = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t).getHex();
    if (warm) { p.horizon = mix(p.horizon, 0xf0a868, warm); p.fog = mix(p.fog, 0xe6a878, warm * 0.8); p.zenith = mix(p.zenith, 0x35558f, warm * 0.5); }
    p.sun = sun;
    // Hướng mặt trời (từ mặt đất nhìn lên mặt trời)
    p.sunDir = new THREE.Vector3(Math.cos(sun.elevation) * Math.sin(sun.azimuth), Math.sin(sun.elevation), Math.cos(sun.elevation) * Math.cos(sun.azimuth)).normalize();
    const elevK = Math.min(1, sun.elevation / 0.9);
    p.sunColor = new THREE.Color(0xffe2b0).lerp(new THREE.Color(0xfff6e8), elevK).getHex();
    p.sunIntensity = 0.95 + 0.6 * elevK;
    p.skyIntensity = 0.42 + 0.22 * elevK;
    this.atmosphere = p;
    this.scene.background = new THREE.Color(p.horizon);
    this.scene.fog = new THREE.FogExp2(p.fog, p.density);
    if (typeof SkySystem !== 'undefined') this.sky = SkySystem.create(this.group, p);
  }

  // ---------------------------------------------------------------------------
  // LƯỚI ĐỊA HÌNH + TEXTURE MẶT ĐẤT VẼ TỪ DỮ LIỆU (biome, độ dốc, độ cao, đường, nước)
  // ---------------------------------------------------------------------------
  initTerrainMesh() {
    const S = this.segments;
    const geo = new THREE.PlaneGeometry(this.width, this.depth, S, S);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    // PlaneGeometry sau khi xoay: hàng đỉnh đầu tiên ở z = -depth/2 -> khớp heightData[iz*(S+1)+ix]
    for (let i = 0; i < pos.count; i++) pos.setY(i, this.heightData[i]);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();

    this.groundTexture = this.paintGround();
    const detail = this.detailTexture();
    const mat = new THREE.MeshStandardMaterial({ map: this.groundTexture, roughness: this.mapType === 'URBAN' ? 0.82 : 0.95, metalness: 0.0 });
    // Shader mặt đất nhiều lớp vật liệu (cỏ / đất / đá / sỏi theo độ dốc & nhiễu), ảnh nền cũ chỉ pha màu tầng lớn
    if (typeof GroundShader !== 'undefined') {
      GroundShader.apply(mat, { mapType: this.mapType, macroCanvas: this.groundCanvas, water: !!(this.map.river || this.map.lakes.length), terrain: this });
    } else
    // Lớp chi tiết lặp lại (hạt cát / sỏi / cỏ) trộn vào màu nền -> nhìn gần không bị nhòe
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.detailMap = { value: detail };
      sh.uniforms.detailScale = { value: 260.0 };
      sh.fragmentShader = 'uniform sampler2D detailMap;\nuniform float detailScale;\n' + sh.fragmentShader.replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        vec3 dA = texture2D(detailMap, vUv * detailScale).rgb;
        vec3 dB = texture2D(detailMap, vUv * detailScale * 0.173 + 0.31).rgb;
        diffuseColor.rgb *= (dA * 0.55 + dB * 0.45) * 2.0;`
      );
    };
    if (typeof GroundShader === 'undefined') mat.customProgramCacheKey = () => 'terrainDetail';
    // Hố bom khoét lỗ mặt đất để lòng chảo lõm hiện ra (xem ExplosionFX.addCrater)
    if (typeof ExplosionFX !== 'undefined' && ExplosionFX.installGroundHoles) ExplosionFX.installGroundHoles(mat);
    this.terrainMesh = new THREE.Mesh(geo, mat);
    this.terrainMesh.receiveShadow = true;
    this.terrainMesh.name = 'ground';
    this.mesh = this.terrainMesh;
    this.group.add(this.terrainMesh);
  }

  // Texture hạt chi tiết trung tính (trung bình ~0.5 để nhân x2 không đổi độ sáng)
  detailTexture() {
    if (BattleTerrain3D._detail && BattleTerrain3D._detail[this.mapType]) return BattleTerrain3D._detail[this.mapType];
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    const img = g.createImageData(256, 256);
    const coarse = this.mapType === 'HIGHLAND' ? 1.0 : this.mapType === 'URBAN' ? 0.5 : 0.75;
    for (let i = 0; i < 256 * 256; i++) {
      const x = i & 255, y = i >> 8;
      let v = 0.5 + (Math.random() - 0.5) * 0.16 * coarse;
      // Sỏi / hạt lớn rải rác
      if (Math.random() < 0.012 * coarse) v += (Math.random() - 0.4) * 0.35;
      // Vân gợn gió (sa mạc) / vết rạn bê tông (đô thị)
      if (this.mapType === 'DESERT') v += Math.sin(x * 0.19 + Math.sin(y * 0.05) * 3) * 0.035;
      const k = Math.max(0, Math.min(255, v * 255));
      img.data[i * 4] = k; img.data[i * 4 + 1] = k; img.data[i * 4 + 2] = k * (this.mapType === 'JUNGLE' ? 0.98 : 1); img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    // Làm mịn nhẹ 1 lượt để hạt không lấm tấm quá
    g.globalAlpha = 0.5; g.drawImage(c, 1, 0); g.drawImage(c, 0, 1); g.globalAlpha = 1;
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    BattleTerrain3D._detail = BattleTerrain3D._detail || {};
    BattleTerrain3D._detail[this.mapType] = t;
    return t;
  }

  paintGround() {
    const SZ = 1024;
    const cv = document.createElement('canvas');
    cv.width = cv.height = SZ;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(SZ, SZ);
    const D = img.data;
    const M = this.map, N = M.res + 1, cell = M.cell;
    const half = this.width / 2;
    const hgt = this.heightData;
    // Nhiễu màu: bảng giá trị ngẫu nhiên có seed, nội suy song tuyến ở 2 tỉ lệ
    const rng = MapGen.mulberry32(this.seed ^ 0x9e3779b9);
    const NT = 128, nt = new Float32Array(NT * NT);
    for (let i = 0; i < nt.length; i++) nt[i] = rng();
    const vnoise = (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
      const a = nt[(yi & 127) * NT + (xi & 127)], b = nt[(yi & 127) * NT + ((xi + 1) & 127)];
      const c = nt[((yi + 1) & 127) * NT + (xi & 127)], d = nt[((yi + 1) & 127) * NT + ((xi + 1) & 127)];
      const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
      return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
    };
    const P = {
      DESERT: { a: [214, 182, 134], b: [196, 156, 104], c: [168, 128, 84], rock: [150, 118, 86], wet: [120, 104, 70] },
      URBAN: { a: [128, 126, 120], b: [112, 110, 104], c: [96, 94, 88], rock: [100, 98, 92], wet: [70, 72, 60] },
      JUNGLE: { a: [62, 84, 38], b: [48, 70, 30], c: [86, 70, 44], rock: [92, 88, 74], wet: [58, 48, 32] },
      HIGHLAND: { a: [104, 112, 62], b: [126, 118, 76], c: [92, 84, 60], rock: [128, 124, 116], wet: [80, 76, 56] },
      RIVER_LAKE: { a: [90, 116, 54], b: [110, 126, 64], c: [120, 104, 70], rock: [120, 116, 104], wet: [96, 84, 58] }
    }[this.mapType] || null;
    const pal = P;
    const sun = this.atmosphere ? this.atmosphere.sunDir : new THREE.Vector3(0.4, 0.8, 0.3);
    for (let py = 0; py < SZ; py++) {
      const wz = (py + 0.5) / SZ * this.depth - half;
      const gz = (wz + half) / cell;
      const iz = Math.min(N - 2, Math.max(0, Math.floor(gz))), fz = gz - iz;
      for (let px = 0; px < SZ; px++) {
        const wx = (px + 0.5) / SZ * this.width - half;
        const gx = (wx + half) / cell;
        const ix = Math.min(N - 2, Math.max(0, Math.floor(gx))), fx = gx - ix;
        const i0 = iz * N + ix;
        const h00 = hgt[i0], h10 = hgt[i0 + 1], h01 = hgt[i0 + N], h11 = hgt[i0 + N + 1];
        const h = (h00 * (1 - fx) + h10 * fx) * (1 - fz) + (h01 * (1 - fx) + h11 * fx) * fz;
        const dhx = ((h10 - h00) * (1 - fz) + (h11 - h01) * fz) / cell;
        const dhz = ((h01 - h00) * (1 - fx) + (h11 - h10) * fx) / cell;
        const slope = Math.hypot(dhx, dhz);
        const n1 = vnoise(wx * 0.012, wz * 0.012), n2 = vnoise(wx * 0.05 + 50, wz * 0.05 + 50), n3 = vnoise(wx * 0.0035 + 9, wz * 0.0035 + 3);
        let r, g, b;
        // Trộn 3 sắc nền theo nhiễu tầng lớn / nhỏ
        const t1 = Math.min(1, Math.max(0, n3 * 1.6 - 0.3)), t2 = n1 * 0.6 + n2 * 0.4;
        r = pal.a[0] + (pal.b[0] - pal.a[0]) * t1; g = pal.a[1] + (pal.b[1] - pal.a[1]) * t1; b = pal.a[2] + (pal.b[2] - pal.a[2]) * t1;
        const tc = Math.max(0, t2 - 0.55) * 2.2;
        r += (pal.c[0] - r) * tc; g += (pal.c[1] - g) * tc; b += (pal.c[2] - b) * tc;
        // Đá lộ trên sườn dốc / đỉnh núi
        let rk = Math.max(0, Math.min(1, (slope - 0.38) * 3.2 + (n2 - 0.5) * 0.6));
        if (this.mapType === 'HIGHLAND' && h > 85) rk = Math.max(rk, Math.min(1, (h - 85) / 25 + (n1 - 0.5)));
        if (this.mapType === 'DESERT') rk *= 0.7;
        r += (pal.rock[0] - r) * rk; g += (pal.rock[1] - g) * rk; b += (pal.rock[2] - b) * rk;
        // Đất ẩm / bùn ven nước, đáy sông
        if (h < 2.5 && (this.mapType === 'RIVER_LAKE' || this.mapType === 'JUNGLE')) {
          const w = Math.min(1, (2.5 - h) / 4);
          r += (pal.wet[0] - r) * w; g += (pal.wet[1] - g) * w; b += (pal.wet[2] - b) * w;
        }
        // Đổ bóng địa hình nướng sẵn (che khuất theo hướng nắng, giúp đồi núi nổi khối)
        const nx = -dhx, nz = -dhz, ny = 1, nl = Math.hypot(nx, ny, nz);
        const lit = Math.max(0, (nx * sun.x + ny * sun.y + nz * sun.z) / nl);
        const shade = 0.82 + 0.22 * lit;
        const k = (py * SZ + px) * 4;
        D[k] = Math.min(255, r * shade); D[k + 1] = Math.min(255, g * shade); D[k + 2] = Math.min(255, b * shade); D[k + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const toPx = v => (v + half) / this.width * SZ;
    const sc = SZ / this.width;
    // Ốc đảo / thảm thực vật dưới tán cây và bụi rậm
    ctx.globalCompositeOperation = 'source-over';
    const veg = { DESERT: 'rgba(92,96,48,', URBAN: 'rgba(70,98,46,', JUNGLE: 'rgba(30,52,20,', HIGHLAND: 'rgba(58,74,36,', RIVER_LAKE: 'rgba(54,84,36,' }[this.mapType];
    for (const bsh of M.bushes) {
      const gr = ctx.createRadialGradient(toPx(bsh.x), toPx(bsh.z), 0, toPx(bsh.x), toPx(bsh.z), bsh.r * sc * 1.25);
      gr.addColorStop(0, veg + '0.75)'); gr.addColorStop(0.7, veg + '0.35)'); gr.addColorStop(1, veg + '0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(toPx(bsh.x), toPx(bsh.z), bsh.r * sc * 1.25, 0, 6.283); ctx.fill();
    }
    for (const t of M.trees) {
      if (t.kind === 'cactus' || t.kind === 'deadTree') continue;
      ctx.fillStyle = veg + '0.22)';
      ctx.beginPath(); ctx.arc(toPx(t.x), toPx(t.z), (t.kind === 'jungle' ? 12 : 8) * sc * 1.4, 0, 6.283); ctx.fill();
    }
    // Đường: nền đường + vệt bánh xe / vạch kẻ
    const style = {
      asphalt: { base: '#3b3d40', edge: '#5d5d58', line: 'rgba(225,215,170,0.85)' },
      dirt: { base: this.mapType === 'DESERT' ? '#a7865c' : '#8a7354', edge: this.mapType === 'DESERT' ? '#bd9d70' : '#7a6a4c', rut: 'rgba(70,52,34,0.55)' },
      mud: { base: '#4c3b29', edge: '#3f4a2a', rut: 'rgba(30,22,14,0.65)' },
      gravel: { base: '#8d8778', edge: '#77745f', rut: 'rgba(80,76,66,0.6)' }
    };
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const stroke = (rd, w, col, dash) => {
      ctx.strokeStyle = col; ctx.lineWidth = w * sc; ctx.setLineDash(dash || []);
      ctx.beginPath();
      rd.pts.forEach((p, i) => i ? ctx.lineTo(toPx(p[0]), toPx(p[1])) : ctx.moveTo(toPx(p[0]), toPx(p[1])));
      ctx.stroke();
    };
    for (const rd of M.roads) { const s = style[rd.kind] || style.dirt; stroke(rd, rd.width + 14, s.edge); }
    for (const rd of M.roads) { const s = style[rd.kind] || style.dirt; stroke(rd, rd.width, s.base); }
    ctx.setLineDash([]);
    // Nước (mặt nước 3D phủ lên, đây là màu đáy nhìn qua)
    if (M.river) {
      ctx.strokeStyle = '#3d4a3c'; ctx.lineWidth = M.river.width * sc;
      ctx.beginPath(); M.river.pts.forEach((p, i) => i ? ctx.lineTo(toPx(p[0]), toPx(p[1])) : ctx.moveTo(toPx(p[0]), toPx(p[1]))); ctx.stroke();
      for (const L of M.lakes) { ctx.fillStyle = '#3d4a3c'; ctx.beginPath(); ctx.arc(toPx(L.x), toPx(L.z), L.r * sc, 0, 6.283); ctx.fill(); }
    }
    // Nền bê tông dưới boong-ke
    for (const k of M.bunkers) { ctx.fillStyle = 'rgba(110,106,96,0.55)'; ctx.beginPath(); ctx.arc(toPx(k.x), toPx(k.z), 62 * sc, 0, 6.283); ctx.fill(); }
    this.groundCanvas = cv;
    const tex = new THREE.CanvasTexture(cv);
    tex.anisotropy = 8;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    return tex;
  }

  // ---------------------------------------------------------------------------
  // MẶT ĐƯỜNG 3D: dải đường bám địa hình, texture lặp (vạch kẻ / vệt bánh / ổ gà)
  // ---------------------------------------------------------------------------
  roadTexture(kind) {
    BattleTerrain3D._roadTex = BattleTerrain3D._roadTex || {};
    const key = kind + this.mapType;
    if (BattleTerrain3D._roadTex[key]) return BattleTerrain3D._roadTex[key];
    const c = document.createElement('canvas');
    c.width = 128; c.height = 256;
    const g = c.getContext('2d');
    const sp = (n, cols, s0, s1) => { for (let i = 0; i < n; i++) { g.fillStyle = cols[i % cols.length]; const s = s0 + Math.random() * (s1 - s0); g.fillRect(Math.random() * 128, Math.random() * 256, s, s); } };
    if (kind === 'asphalt') {
      g.fillStyle = '#3c3e41'; g.fillRect(0, 0, 128, 256);
      sp(5000, ['rgba(20,20,22,0.35)', 'rgba(120,120,118,0.25)'], 1, 2);
      // Mảng vá & ổ gà
      for (let i = 0; i < 5; i++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(25,26,28,0.7)' : 'rgba(80,80,78,0.45)'; g.beginPath(); g.ellipse(20 + Math.random() * 88, Math.random() * 256, 6 + Math.random() * 12, 5 + Math.random() * 10, Math.random() * 3, 0, 6.3); g.fill(); }
      g.strokeStyle = 'rgba(15,15,16,0.6)'; g.lineWidth = 1;
      for (let i = 0; i < 10; i++) { let x = Math.random() * 128, y = Math.random() * 256; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (Math.random() - 0.5) * 18; y += Math.random() * 14; g.lineTo(x, y); } g.stroke(); }
      g.fillStyle = 'rgba(220,214,190,0.85)'; g.fillRect(6, 0, 3, 256); g.fillRect(119, 0, 3, 256);
      g.fillStyle = 'rgba(232,196,90,0.9)'; g.fillRect(62, 0, 4, 120);
    } else {
      const base = kind === 'mud' ? '#4f3e2b' : kind === 'gravel' ? '#8e8878' : (this.mapType === 'DESERT' ? '#a8885e' : '#8b7556');
      g.fillStyle = base; g.fillRect(0, 0, 128, 256);
      sp(kind === 'gravel' ? 7000 : 3500, kind === 'gravel' ? ['rgba(60,58,52,0.45)', 'rgba(200,196,184,0.35)', 'rgba(120,110,96,0.4)'] : ['rgba(50,36,22,0.3)', 'rgba(220,200,160,0.18)'], 1, kind === 'gravel' ? 3 : 2);
      // 2 cặp vệt bánh xe lún sâu
      for (const x of [30, 98]) {
        const gr = g.createLinearGradient(x - 12, 0, x + 12, 0);
        gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, kind === 'mud' ? 'rgba(25,18,10,0.7)' : 'rgba(60,44,28,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(x - 12, 0, 24, 256);
        g.strokeStyle = 'rgba(40,30,20,0.35)'; g.lineWidth = 1;
        for (let y = 0; y < 256; y += 6) { g.beginPath(); g.moveTo(x - 7, y); g.lineTo(x + 7, y + 3); g.stroke(); }  // vân lốp / xích
      }
      // Vũng nước / ổ gà
      for (let i = 0; i < (kind === 'mud' ? 6 : 3); i++) {
        g.fillStyle = kind === 'mud' ? 'rgba(40,46,44,0.75)' : 'rgba(70,52,34,0.45)';
        g.beginPath(); g.ellipse(20 + Math.random() * 88, Math.random() * 256, 7 + Math.random() * 10, 5 + Math.random() * 8, Math.random() * 3, 0, 6.3); g.fill();
      }
      // Mép đường loang ra cỏ / cát
      const eg = g.createLinearGradient(0, 0, 128, 0);
      eg.addColorStop(0, 'rgba(0,0,0,0.25)'); eg.addColorStop(0.12, 'rgba(0,0,0,0)'); eg.addColorStop(0.88, 'rgba(0,0,0,0)'); eg.addColorStop(1, 'rgba(0,0,0,0.25)');
      g.fillStyle = eg; g.fillRect(0, 0, 128, 256);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    BattleTerrain3D._roadTex[key] = t;
    return t;
  }

  buildRoads() {
    const byKind = {};
    for (const rd of this.map.roads) {
      const pts = rd.pts;
      if (pts.length < 2) continue;
      const hw = rd.width / 2;
      const across = 5;
      const P = [], UV = [], I = [];
      let vAcc = 0;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
        let tx = b[0] - a[0], tz = b[1] - a[1];
        const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
        const nx = -tz, nz = tx;
        if (i > 0) vAcc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        for (let k = 0; k <= across; k++) {
          const s = -1 + 2 * k / across;
          const x = pts[i][0] + nx * s * hw, z = pts[i][1] + nz * s * hw;
          const y = this.groundAtRaw(x, z) + 0.35;
          P.push(x, y, z);
          UV.push(k / across, vAcc / (rd.width * 2));
        }
      }
      for (let i = 0; i < pts.length - 1; i++) {
        for (let k = 0; k < across; k++) {
          const a = i * (across + 1) + k, b = a + 1, c = a + across + 1, d = c + 1;
          I.push(a, c, b, b, c, d);
        }
      }
      (byKind[rd.kind] || (byKind[rd.kind] = [])).push({ P, UV, I });
    }
    for (const kind in byKind) {
      // Gộp toàn bộ đường cùng loại thành 1 mesh
      let nv = 0, ni = 0;
      for (const p of byKind[kind]) { nv += p.P.length / 3; ni += p.I.length; }
      const pos = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), idx = new Uint32Array(ni);
      let ov = 0, oi = 0;
      for (const p of byKind[kind]) {
        pos.set(p.P, ov * 3); uv.set(p.UV, ov * 2);
        for (let k = 0; k < p.I.length; k++) idx[oi + k] = p.I[k] + ov;
        ov += p.P.length / 3; oi += p.I.length;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      g.setIndex(new THREE.BufferAttribute(idx, 1));
      g.computeVertexNormals();
      const m = new THREE.MeshStandardMaterial({
        map: this.roadTexture(kind), roughness: kind === 'asphalt' ? 0.78 : 0.97, metalness: 0,
        polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3
      });
      if (typeof ExplosionFX !== 'undefined' && ExplosionFX.installGroundHoles) ExplosionFX.installGroundHoles(m);
      const mesh = new THREE.Mesh(g, m);
      mesh.receiveShadow = true;
      mesh.name = 'road_' + kind;
      this.group.add(mesh);
    }
  }

  // ---------------------------------------------------------------------------
  // NƯỚC: mặt nước gợn sóng phản chiếu bầu trời
  // ---------------------------------------------------------------------------
  buildWater() {
    if (!this.map.river && !this.map.lakes.length) return;
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    const img = g.createImageData(256, 256);
    // Bản đồ pháp tuyến gợn sóng từ tổng các sóng sin
    const waves = [];
    for (let i = 0; i < 9; i++) waves.push({ kx: Math.round((Math.random() - 0.5) * 12), ky: Math.round((Math.random() - 0.5) * 12), a: Math.random() * 0.8 + 0.2, p: Math.random() * 6.28 });
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
      let dx = 0, dy = 0;
      for (const w of waves) { const ph = (w.kx * x + w.ky * y) / 256 * 6.283 + w.p; const cc = Math.cos(ph) * w.a; dx += cc * w.kx; dy += cc * w.ky; }
      const k = (y * 256 + x) * 4;
      img.data[k] = 128 + dx * 2.2; img.data[k + 1] = 128 + dy * 2.2; img.data[k + 2] = 255; img.data[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const normal = new THREE.CanvasTexture(c);
    normal.wrapS = normal.wrapT = THREE.RepeatWrapping;
    normal.repeat.set(36, 36);
    const atm = this.atmosphere;
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x2c5868).lerp(new THREE.Color(atm.zenith), 0.25), roughness: 0.12, metalness: 0.35,
      normalMap: normal, normalScale: new THREE.Vector2(0.45, 0.45), transparent: true, opacity: 0.86, depthWrite: false
    });
    const geo = new THREE.PlaneGeometry(this.width, this.depth, 1, 1);
    geo.rotateX(-Math.PI / 2);
    this.waterMesh = new THREE.Mesh(geo, mat);
    this.waterMesh.position.y = 0.2;
    this.waterMesh.renderOrder = 2;
    this.waterNormal = normal;
    this.group.add(this.waterMesh);
  }

  // ---------------------------------------------------------------------------
  // CẦU BÊ TÔNG DẦM HỘP VƯỢT SÔNG
  // ---------------------------------------------------------------------------
  buildBridges() {
    this.bridges = [];
    if (typeof EnvDamage !== 'undefined') {
      // Cầu nhiều nhịp (mỗi nhịp có máu, sập được) do EnvDamage dựng
      this.envDamage = new EnvDamage.System(this, this.rockItems || []);
      this.bridges = this.envDamage.bridges.items;
      return;
    }
    if (!this.map.bridges.length) return;
    const conc = new THREE.MeshStandardMaterial({ map: Destructibles ? null : null, color: 0xa8a49a, roughness: 0.9 });
    const asphalt = new THREE.MeshStandardMaterial({ map: this.roadTexture('asphalt'), roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 });
    const steel = new THREE.MeshStandardMaterial({ color: 0x5f6a70, roughness: 0.5, metalness: 0.6 });
    for (const b of this.map.bridges) {
      const f = { x: Math.sin(b.angle), z: Math.cos(b.angle) };
      const hA = this.groundAtRaw(b.x - f.x * b.length / 2, b.z - f.z * b.length / 2);
      const hB = this.groundAtRaw(b.x + f.x * b.length / 2, b.z + f.z * b.length / 2);
      const deckY = Math.max(4, Math.max(hA, hB) + 1.2);
      const grp = new THREE.Group();
      grp.position.set(b.x, 0, b.z);
      grp.rotation.y = b.angle;
      const deck = new THREE.Mesh(new THREE.BoxGeometry(b.width, 4, b.length), conc);
      deck.position.y = deckY - 2; deck.castShadow = deck.receiveShadow = true; grp.add(deck);
      const top = new THREE.Mesh(new THREE.PlaneGeometry(b.width - 6, b.length), asphalt);
      top.rotation.x = -Math.PI / 2; top.position.y = deckY + 0.05;
      top.material.map = this.roadTexture('asphalt');
      top.receiveShadow = true; grp.add(top);
      for (const s of [-1, 1]) {
        const curb = new THREE.Mesh(new THREE.BoxGeometry(3, 1.6, b.length), conc);
        curb.position.set(s * (b.width / 2 - 1.5), deckY + 0.8, 0); grp.add(curb);
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, b.length), steel);
        rail.position.set(s * (b.width / 2 - 1.2), deckY + 4.2, 0); grp.add(rail);
        for (let z = -b.length / 2 + 6; z < b.length / 2; z += 12) {
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.6, 3.4, 0.6), steel);
          post.position.set(s * (b.width / 2 - 1.2), deckY + 2.4, z); grp.add(post);
        }
      }
      // Trụ cầu
      for (let z = -b.length / 2 + 40; z < b.length / 2 - 30; z += 55) {
        const pier = new THREE.Mesh(new THREE.BoxGeometry(b.width * 0.7, deckY + 16, 7), conc);
        pier.position.set(0, (deckY - 4) / 2 - 6, z); pier.castShadow = true; grp.add(pier);
      }
      this.group.add(grp);
      this.bridges.push({ x: b.x, z: b.z, angle: b.angle, f, width: b.width, length: b.length, deckY });
    }
  }

  bridgeAt(x, z) {
    // nhịp cầu đã sập -> không còn mặt cầu (nước / lòng sông)
    if (this.envDamage) return this.envDamage.bridges.at(x, z);
    for (const b of this.bridges) {
      const dx = x - b.x, dz = z - b.z;
      const along = dx * b.f.x + dz * b.f.z, across = -dx * b.f.z + dz * b.f.x;
      if (Math.abs(along) <= b.length / 2 && Math.abs(across) <= b.width / 2) return { b, along, across };
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // ĐÁ TẢNG & BỤI RẬM
  // ---------------------------------------------------------------------------
  rockTexture() {
    const key = 'rock' + this.mapType;
    BattleTerrain3D._rockTex = BattleTerrain3D._rockTex || {};
    if (BattleTerrain3D._rockTex[key]) return BattleTerrain3D._rockTex[key];
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const base = { DESERT: '#a6835e', HIGHLAND: '#8a877f', URBAN: '#8f8b84', JUNGLE: '#6f6a5c', RIVER_LAKE: '#85817a' }[this.mapType] || '#888';
    g.fillStyle = base; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '30,26,22' : '230,224,210'},${Math.random() * 0.22})`; const s = 1 + Math.random() * 3; g.fillRect(Math.random() * 128, Math.random() * 128, s, s); }
    g.strokeStyle = 'rgba(40,34,28,0.45)'; g.lineWidth = 1.2;
    for (let k = 0; k < 12; k++) { let x = Math.random() * 128, y = Math.random() * 128; g.beginPath(); g.moveTo(x, y); for (let s = 0; s < 4; s++) { x += (Math.random() - 0.5) * 30; y += (Math.random() - 0.5) * 30; g.lineTo(x, y); } g.stroke(); }
    if (this.mapType === 'DESERT') for (let y = 0; y < 128; y += 9) { g.fillStyle = 'rgba(120,80,50,0.18)'; g.fillRect(0, y, 128, 3); }  // vân đá trầm tích
    if (this.mapType === 'JUNGLE' || this.mapType === 'RIVER_LAKE') for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(60,90,40,0.35)'; g.beginPath(); g.arc(Math.random() * 128, Math.random() * 40, 3 + Math.random() * 6, 0, 6.3); g.fill(); } // rêu
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    BattleTerrain3D._rockTex[key] = t;
    return t;
  }

  buildRocks() {
    this.boulders = [];
    this.rockItems = [];
    const rocks = this.map.rocks;
    if (!rocks.length) return;
    const mat = new THREE.MeshStandardMaterial({ map: this.rockTexture(), roughness: 0.93, metalness: 0.02, flatShading: true });
    const variants = [0, 1, 2].map(v => {
      const g = new THREE.IcosahedronGeometry(1, 1).toNonIndexed();
      const p = g.attributes.position;
      const seed = v * 13.7 + 1;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const n = Math.sin(x * 3.1 + seed) * 0.18 + Math.sin(y * 4.3 + z * 2.2 + seed) * 0.14 + Math.sin(z * 5.7 - x * 1.3) * 0.1;
        const k = 1 + n;
        // Đáy phẳng chôn vào đất, đỉnh hơi dẹt
        p.setXYZ(i, x * k, Math.max(-0.35, y * k * 0.8), z * k);
      }
      g.computeVertexNormals();
      return g;
    });
    const pools = variants.map(g => {
      const im = new THREE.InstancedMesh(g, mat, rocks.length);
      im.count = 0; im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false;
      im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(rocks.length * 3).fill(1), 3);
      this.group.add(im);
      return im;
    });
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    rocks.forEach((r, i) => {
      const im = pools[i % 3];
      const y = this.groundAtRaw(r.x, r.z);
      e.set((Math.random() - 0.5) * 0.4, r.rot, (Math.random() - 0.5) * 0.4);
      m4.compose(new THREE.Vector3(r.x, y + r.h * 0.12, r.z), q.setFromEuler(e), new THREE.Vector3(r.r, r.h * 0.9, r.r * (0.75 + Math.random() * 0.4)));
      const k = im.count++;
      im.setMatrixAt(k, m4);
      const col = new THREE.Color(1, 1, 1).multiplyScalar(0.82 + Math.random() * 0.28);
      im.setColorAt(k, col);
      const boulder = r.r > 9 ? { x: r.x, z: r.z, radius: r.r * 0.9, height: r.h * 0.8 } : null;
      if (boulder) this.boulders.push(boulder);
      // bản ghi cho EnvDamage: đá có máu, mẻ / nhỏ dần / vỡ tung theo loại đạn
      const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scale = new THREE.Vector3();
      m4.decompose(pos, quat, scale);
      this.rockItems.push({ x: r.x, z: r.z, y, r: r.r, h: r.h, im, k, pos, quat, scale, color: col, col: [col.r, col.g, col.b], boulder });
    });
    pools.forEach(im => { im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; });
  }

  buildBushes() {
    this.bushClusters = this.map.bushes.map(b => ({ x: b.x, z: b.z, radius: b.r }));
    // Bụi cây thấp dày đặc trong vùng ngụy trang (che thân xe)
    const total = this.map.bushes.length * 26;
    if (!total) return;
    const leafCol = { DESERT: [0x6f6e3c, 0x857e48], URBAN: [0x4f6a32, 0x5d7a3a], JUNGLE: [0x2f5a24, 0x3b6d2b], HIGHLAND: [0x4c5e30, 0x5b6a38], RIVER_LAKE: [0x466b2e, 0x557a35] }[this.mapType];
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 700; i++) { const s = 0.6 + Math.random() * 0.5; g.fillStyle = `rgb(${200 * s | 0},${235 * s | 0},${190 * s | 0})`; g.beginPath(); g.ellipse(Math.random() * 128, Math.random() * 128, 2 + Math.random() * 4, 1 + Math.random() * 2, Math.random() * 3, 0, 6.3); g.fill(); }
    const tex = new THREE.CanvasTexture(c);
    const geo = new THREE.IcosahedronGeometry(1, 1).toNonIndexed();
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const k = 1 + Math.sin(p.getX(i) * 7 + p.getZ(i) * 5) * 0.2; p.setXYZ(i, p.getX(i) * k, Math.max(-0.2, p.getY(i) * 0.7 * k), p.getZ(i) * k); }
    geo.computeVertexNormals();
    const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }), total);
    im.count = 0; im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false;
    im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(total * 3).fill(1), 3);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
    for (const b of this.map.bushes) {
      for (let k = 0; k < 26; k++) {
        const a = Math.random() * 6.283, d = Math.sqrt(Math.random()) * b.r * 0.85;
        const x = b.x + Math.cos(a) * d, z = b.z + Math.sin(a) * d;
        if (this.map.roadAt(x, z)) continue;
        const s = 5 + Math.random() * 7;
        m4.compose(new THREE.Vector3(x, this.groundAtRaw(x, z) + s * 0.25, z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * 6.3), new THREE.Vector3(s * 1.3, s, s * 1.2));
        const i = im.count++;
        im.setMatrixAt(i, m4);
        im.setColorAt(i, new THREE.Color(leafCol[k & 1]).multiplyScalar(0.8 + Math.random() * 0.35));
      }
    }
    im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true;
    this.group.add(im);
  }

  // ---------------------------------------------------------------------------
  // CẬP NHẬT MỖI KHUNG HÌNH (cây cháy / đổ, nhà sập, mặt nước gợn)
  // ---------------------------------------------------------------------------
  update(dt, fx) {
    if (typeof GroundShader !== 'undefined') GroundShader.tick(dt);   // bóng mây trôi
    if (this.trees) this.trees.update(dt, fx);
    if (this.buildingSet) this.buildingSet.update(dt, fx);
    if (this.propSet) this.propSet.update(dt, fx, this.camPos || null);
    if (this.envDamage) this.envDamage.update(dt, fx);
    if (this.waterNormal) { this.waterNormal.offset.x += dt * 0.004; this.waterNormal.offset.y += dt * 0.0025; }
  }

  // Sóng nổ / đạn tác động lên cây, nhà, boong-ke tại điểm nổ
  damageAt(x, y, z, ammo, heavy, fx, info) {
    const events = [];
    if (this.envDamage) events.push(...this.envDamage.damageAt(x, y, z, ammo, heavy, fx, info || {}));
    if (this.trees) this.trees.damageAt(x, y, z, ammo, heavy, fx);
    if (this.propSet) this.propSet.damageAt(x, y, z, ammo, heavy, fx);
    if (this.buildingSet) events.push(...this.buildingSet.damageAt(x, y, z, ammo, heavy, fx, null, info || {}));
    if (this.bunkerSet) events.push(...this.bunkerSet.damageAt(x, y, z, ammo, heavy, fx));
    return events;
  }

  // Hệ số sát thương sóng nổ còn lại khi có vật cản giữa điểm nổ và xe (tường bê tông, mái hầm, nhà)
  blastFactor(ex, ey, ez, ux, uy, uz) {
    // Ụ đất / tường bê tông cứ điểm nằm giữa điểm nổ và xe
    if (this.strongholdSet && this.strongholdSet.segmentHit(ex, ey, ez, ux, uy, uz)) return 0.15;
    if (this.bunkerSet) {
      const hit = this.bunkerSet.blocks(ex, ey, ez, ux, uy, uz);
      if (hit) return hit.roof ? 0.12 : 0.18;
    }
    // bờ bao cát giữa điểm nổ và xe
    if (this.propSet && this.propSet.blocks(ex, ey, ez, ux, uy, uz)) return 0.4;
    for (const b of this.buildings) {
      if (!b.ref || b.ref.collapsed) continue;
      const t = Destructibles.segCircleT(ex, ez, ux, uz, b.x, b.z, b.radius * 0.8);
      if (t >= 0) {
        const yl = ey + (uy - ey) * t;
        if (yl < b.ref.y + b.height) return 0.3;
      }
    }
    return 1;
  }
  isUnderCover(x, z) { return this.bunkerSet ? !!this.bunkerSet.isUnderCover(x, z) : false; }

  // ---------------------------------------------------------------------------
  // CỨ ĐIỂM BÊ TÔNG: che chắn xe nằm trong khoang
  // ---------------------------------------------------------------------------
  // Cứ điểm đang che (một phần) xe này, null nếu xe ở ngoài
  shelterOf(unit) { return this.strongholdSet && unit ? this.strongholdSet.shelterOf(unit) : null; }
  // Hệ số sát thương nổ còn lại theo phần thân xe thò ra ngoài mái che (0 = nằm khuất hoàn toàn)
  shelterFactor(unit) {
    if (!this.strongholdSet || !unit) return 1;
    const e = this.strongholdSet.exposure(unit);
    return e < 0.04 ? 0 : e;
  }
  isProtectedPoint(x, y, z) { return this.strongholdSet ? !!this.strongholdSet.protectedAt(x, y, z) : false; }
  strongholdSegmentHit(x0, y0, z0, x1, y1, z1) { return this.strongholdSet ? this.strongholdSet.segmentHit(x0, y0, z0, x1, y1, z1) : null; }
  // Đạn cắt mặt tường / sàn / mái nhà còn đặc (lọt qua lỗ thủng đã có): { x, y, z, nx, ny, nz, inside, part }
  buildingSegmentHit(x0, y0, z0, x1, y1, z1) { return this.buildingSet ? this.buildingSet.segmentHit(x0, y0, z0, x1, y1, z1) : null; }
  // Cắt tạm các tầng trên của nhà che khuất xe đang theo dõi
  updateBuildingView(cam, focus, dt) { if (this.buildingSet) this.buildingSet.setView(cam, focus, dt); }
  // ĐỒNG BỘ: trạng thái phá hủy nhà & cây gọn thành chuỗi (máy chủ phòng so "dấu vân tay"; lệch thì gộp hợp nhất)
  envStateString() {
    return (this.buildingSet && this.buildingSet.stateString ? this.buildingSet.stateString() : '') + '#' + (this.trees && this.trees.stateString ? this.trees.stateString() : '');
  }
  applyEnvState(str, fx) {
    const [b, t] = String(str || '').split('#');
    if (b && this.buildingSet && this.buildingSet.applyState) this.buildingSet.applyState(b, fx);
    if (t && this.trees && this.trees.applyState) this.trees.applyState(t, fx);
  }
  // Rừng rậm: mật độ tán quanh điểm (>= FOREST_DENSE là rừng rậm) & quãng xuyên rừng rậm trên đường ngắm
  forestDensityAt(x, z) { return this.trees && this.trees.densityAt ? this.trees.densityAt(x, z) : 0; }
  forestLOS(ax, az, bx, bz, limit) { return this.trees && this.trees.denseLength ? this.trees.denseLength(ax, az, bx, bz, limit || 1e9, BattleTerrain3D.FOREST_DENSE) : 0; }
  // Nòng pháo (chốt nòng -> đầu nòng) cắm vào bê tông / ụ đất?
  barrelBlocked(p0, p1) { return this.strongholdSet ? this.strongholdSet.barrelBlocked(p0, p1) : false; }
  nearStronghold(x, z, pad = 40) { return this.strongholdSet ? !!this.strongholdSet.near(x, z, pad) : false; }
  // Không đào hố bom / khoét lỗ mặt đất trên ụ đất & sàn bê tông của cứ điểm
  noCraterAt(x, z) { return (this.strongholdSet ? !!this.strongholdSet.covers(x, z, 6) : false) || !!(this.bridges.length && this.bridgeAt(x, z)); }

  // Cây đổ khi xe húc
  crushVegetation(x, z, radius, vx, vz, fx) {
    if (this.trees) this.trees.crush(x, z, radius, vx, vz, fx);
    // ... và húc đổ hàng rào / tường đá, cán bẹp bao cát
    if (this.propSet && Math.hypot(vx, vz) >= 6) this.propSet.crush(x, z, radius, vx, vz, fx);
  }

  // ---------------------------------------------------------------------------
  // TRA CỨU ĐỘ CAO / ĐỊA HÌNH
  // ---------------------------------------------------------------------------
  getHeightAt(x, z) { return this.getElevationAt(x, z); }

  groundAtRaw(x, z) {
    const S = this.segments, N = S + 1;
    const gx = ((x + this.width / 2) / this.width) * S, gz = ((z + this.depth / 2) / this.depth) * S;
    const ix = Math.max(0, Math.min(S - 1, Math.floor(gx))), iz = Math.max(0, Math.min(S - 1, Math.floor(gz)));
    const fx = Math.max(0, Math.min(1, gx - ix)), fz = Math.max(0, Math.min(1, gz - iz));
    const h = this.heightData;
    const i = iz * N + ix;
    // Nội suy theo đúng 2 tam giác của lưới (khớp mặt đất hiển thị, xe không lún / lơ lửng)
    if (fx + fz <= 1) return h[i] + (h[i + 1] - h[i]) * fx + (h[i + N] - h[i]) * fz;
    return h[i + N + 1] + (h[i + N] - h[i + N + 1]) * (1 - fx) + (h[i + 1] - h[i + N + 1]) * (1 - fz);
  }

  getElevationAt(x, z) {
    if (this.strongholdSet) {
      const sh = this.strongholdSet.surfaceAt(x, z);
      if (sh !== null) return sh;
    }
    const g = this.groundAtRaw(x, z);
    if (this.bridges.length) {
      const br = this.bridgeAt(x, z);
      if (br) return Math.max(g, br.b.deckY);
    }
    return g;
  }

  // Cao độ mặt nước tại (x, z) nếu là sông / hồ (null nếu là đất liền / mặt cầu)
  // Mặt đất cho bánh xích / bánh xe (trong cứ điểm: sàn khoang / dốc; trên ụ đất / nắp hầm: mặt đất đắp)
  getVehicleGroundAt(x, z, refY) {
    if (this.strongholdSet) {
      const f = this.strongholdSet.vehicleFloorAt(x, z, refY);
      if (f !== null) return f;
    }
    return this.getElevationAt(x, z);
  }

  waterSurfaceAt(x, z) {
    if (!this.waterMesh) return null;
    if (this.groundAtRaw(x, z) >= 0.1) return null;
    if (this.bridges.length && this.bridgeAt(x, z)) return null;
    return this.waterMesh.position.y;
  }

  isPositionInBush(x, z) {
    for (let i = 0; i < this.bushClusters.length; i++) {
      const c = this.bushClusters[i];
      if (Math.hypot(x - c.x, z - c.z) <= c.radius) return true;
    }
    return false;
  }

  // Va chạm đạn với vật cản (nhà, tường & mái boong-ke, đá tảng)
  // skipBuildings: nhà còn đứng đã được dò chính xác theo đoạn bay (buildingSegmentHit) -> chỉ còn xét đống đổ nát
  checkHorseshoeCollision(x, y, z, skipBuildings) {
    if (this.propSet) { const pb = this.propSet.hitTest(x, y, z); if (pb) return pb; }
    if (this.strongholdSet) {
      const c = this.strongholdSet.concreteAt(x, y, z);
      if (c) return { hit: true, type: 'WALL', stronghold: c.K, normal: c.normal, x, y, z };
    }
    for (const b of this.buildings) {
      if (Math.abs(x - b.x) > b.radius || Math.abs(z - b.z) > b.radius) continue;
      const R = b.ref;
      if (R && skipBuildings && !R.collapsed) continue;
      if (R) {
        // Hộp bao xoay theo hướng nhà (chính xác hơn hình trụ)
        const L = this.buildingSet.toLocal(R, x, y, z);
        if (Math.abs(L.x) <= R.halfW + 1 && Math.abs(L.z) <= R.halfD + 1 && y >= R.y - 5 && y <= R.y + b.height) return { hit: true, obstacle: b, type: 'BUILDING', x, y, z };
      } else if (Math.hypot(x - b.x, z - b.z) <= b.radius) {
        const gy = this.getElevationAt(b.x, b.z);
        if (y <= gy + (b.height || 60) && y >= gy - 5) return { hit: true, obstacle: b, type: 'BUILDING', x, y, z };
      }
    }
    for (const fort of this.horseshoeForts) {
      if (Math.hypot(x - fort.x, z - fort.z) > fort.outerRadius + 15) continue;
      const K = fort.ref;
      if (K) {
        for (const q of K.blocks) {
          if (!q.alive) continue;
          if (y < q.y0 - 2 || y > q.y1 + 1) continue;
          if (Math.hypot(x - q.x, z - q.z) <= q.radius + 2) return { hit: true, fort, type: 'WALL', x, y, z };
        }
        if (K.roofed) {
          const L = this.bunkerSet.local(K, x, z);
          for (const s of K.roofs) {
            if (!s.alive) continue;
            if (Math.abs(L.f - s.lf) <= s.len / 2 && Math.abs(L.r) <= Destructibles.BK.Wd / 2 + Destructibles.BK.T + 1 && y >= s.y0 - 1 && y <= s.y1 + 4) return { hit: true, fort, type: 'WALL', x, y, z };
          }
        }
      }
    }
    for (const rock of this.boulders) {
      if (Math.hypot(x - rock.x, z - rock.z) <= rock.radius) {
        const gy = this.groundAtRaw(rock.x, rock.z);
        if (y <= gy + rock.height && y >= gy - 5) return { hit: true, obstacle: rock, type: 'BOULDER', x, y, z };
      }
    }
    return { hit: false };
  }

  isUnitInsideHorseshoe(unitX, unitZ) {
    for (const fort of this.horseshoeForts) {
      const dx = unitX - fort.x, dz = unitZ - fort.z;
      const fwd = dx * Math.cos(fort.openAngle) + dz * Math.sin(fort.openAngle);
      const right = -dx * Math.sin(fort.openAngle) + dz * Math.cos(fort.openAngle);
      if (fwd > -fort.armLength + 14 && fwd < fort.armLength && Math.abs(right) < fort.armRadius - 14) return { inside: true, fort };
    }
    return { inside: false };
  }

  getTerrainInfoAt(x, z, forwardSlope = 0) {
    const elevation = this.getElevationAt(x, z);
    const slopeK = (base) => forwardSlope > 0.05 ? Math.max(0.18, 1.0 - forwardSlope * 2.2) * base : Math.min(1.35, 1.0 - forwardSlope * 0.8) * base;
    if (this.strongholdSet) {
      const si = this.strongholdSet.surfaceInfo(x, z);
      if (si) return { type: 'URBAN_ROAD', speedMult: slopeK(1.0), elevation: this.getVehicleGroundAt(x, z), friction: 0.95, bumpiness: 0.08, dustMult: 0.15, sinkY: 0, engineLoad: forwardSlope > 0.05 ? 1.25 : 0.9, name: si.name, stronghold: si.K, sheltered: si.inside };
    }
    if (this.bridges.length && this.bridgeAt(x, z)) {
      return { type: 'BRIDGE', speedMult: 1.08, elevation, friction: 0.95, bumpiness: 0.06, dustMult: 0.1, sinkY: 0, engineLoad: 0.9, name: 'CẦU BÊ TÔNG VƯỢT SÔNG' };
    }
    if ((this.map.river || this.map.lakes.length) && this.groundAtRaw(x, z) < -0.8) {
      const deep = this.groundAtRaw(x, z) < -6;
      return { type: 'WATER', speedMult: deep ? 0.4 : 0.6, elevation, friction: 0.7, bumpiness: 0.25, dustMult: 0.1, sinkY: deep ? -3 : -1.8, engineLoad: 1.6, name: deep ? 'LỘI NƯỚC SÂU (CHẬM, NGẬP XÍCH)' : 'LỘI NƯỚC NÔNG' };
    }
    const road = this.map.roadAt(x, z);
    if (road) {
      const R = {
        asphalt: { type: 'URBAN_ROAD', speedMult: 1.15, bumpiness: 0.12, dustMult: 0.25, sinkY: 0, engineLoad: 0.85, name: 'ĐƯỜNG NHỰA (CÓ Ổ GÀ)' },
        dirt: { type: 'ROAD', speedMult: 1.08, bumpiness: 0.42, dustMult: 0.9, sinkY: -0.1, engineLoad: 0.92, name: 'ĐƯỜNG ĐẤT (LÚN VỆT BÁNH, Ổ GÀ)' },
        gravel: { type: 'ROAD', speedMult: 1.05, bumpiness: 0.55, dustMult: 0.7, sinkY: 0, engineLoad: 0.95, name: 'ĐƯỜNG SỎI ĐÁ GỒ GHỀ' },
        mud: { type: 'ROAD', speedMult: 0.94, bumpiness: 0.6, dustMult: 0.15, sinkY: -0.5, engineLoad: 1.15, name: 'ĐƯỜNG BÙN NHÃO' }
      }[road.kind] || null;
      if (R) return Object.assign({ elevation, friction: 0.95 }, R);
    }
    // Độ dốc hiện tại
    const e = 10;
    const slope = Math.hypot(this.groundAtRaw(x + e, z) - this.groundAtRaw(x - e, z), this.groundAtRaw(x, z + e) - this.groundAtRaw(x, z - e)) / (2 * e);
    if (slope > 0.42 || (this.mapType === 'HIGHLAND' && elevation > 80)) {
      return { type: 'MOUNTAIN', speedMult: Math.max(0.2, slopeK(0.5)), elevation, friction: 0.8, bumpiness: 1.4, dustMult: 0.8, sinkY: 0, engineLoad: forwardSlope > 0.05 ? 1.85 : 0.95, name: `SƯỜN DỐC ĐÁ (+${Math.round(elevation)}M)` };
    }
    const base = {
      DESERT: { type: 'SAND', speedMult: 0.86, bumpiness: 0.5, dustMult: 1.0, sinkY: -0.8, engineLoad: 1.18, name: 'CÁT SA MẠC (LÚN, BỤI MÙ)' },
      URBAN: { type: 'URBAN_ROAD', speedMult: 1.0, bumpiness: 0.2, dustMult: 0.4, sinkY: 0, engineLoad: 0.95, name: 'SÂN BÊ TÔNG / VỈA HÈ' },
      JUNGLE: { type: 'JUNGLE_SOIL', speedMult: 0.88, bumpiness: 0.55, dustMult: 0.2, sinkY: -0.5, engineLoad: 1.1, name: 'ĐẤT MÙN RỪNG (RỄ CÂY, GỒ GHỀ)' },
      HIGHLAND: { type: 'GRASS', speedMult: 0.92, bumpiness: 0.6, dustMult: 0.55, sinkY: -0.2, engineLoad: 1.05, name: 'ĐỒNG CỎ ĐỒI NÚI (ĐÁ LỔN NHỔN)' },
      RIVER_LAKE: { type: 'GRASS', speedMult: 0.95, bumpiness: 0.4, dustMult: 0.4, sinkY: -0.3, engineLoad: 1.0, name: 'BÃI CỎ VEN SÔNG' }
    }[this.mapType];
    return Object.assign({ elevation, friction: 0.88 }, base, { speedMult: slope > 0.2 ? slopeK(base.speedMult) : base.speedMult });
  }

  resolveVehicleCollision(currentX, currentZ, nextX, nextZ, vehicleRadius = 16, unit = null) {
    let resX = nextX, resZ = nextZ, hit = false;
    // Cứ điểm: thân xe (hình hộp xoay theo hướng xe) không chui vào tường / ụ đất
    if (this.strongholdSet) {
      const r = this.strongholdSet.collideVehicle(resX, resZ, unit, vehicleRadius);
      if (r) { resX = r.x; resZ = r.z; hit = r.hit; }
    }
    const pushOut = (cx, cz, r) => {
      const dx = resX - cx, dz = resZ - cz, d = Math.hypot(dx, dz), m = r + vehicleRadius;
      if (d < m && d > 0.001) { resX = cx + dx * m / d; resZ = cz + dz * m / d; hit = true; }
    };
    // Nhà: hộp xoay (đống đổ nát vẫn chặn nhưng thấp - xe vẫn không chui qua được)
    for (const b of this.buildings) {
      if (Math.abs(resX - b.x) > b.radius + vehicleRadius + 10 || Math.abs(resZ - b.z) > b.radius + vehicleRadius + 10) continue;
      const R = b.ref;
      if (!R) { pushOut(b.x, b.z, b.radius); continue; }
      const c = Math.cos(-R.angle), s = Math.sin(-R.angle);
      const dx = resX - R.x, dz = resZ - R.z;
      let lx = dx * c + dz * s, lz = -dx * s + dz * c;
      const hx = R.halfW + vehicleRadius * 0.8, hz = R.halfD + vehicleRadius * 0.8;
      if (Math.abs(lx) < hx && Math.abs(lz) < hz) {
        if (hx - Math.abs(lx) < hz - Math.abs(lz)) lx = Math.sign(lx) * hx; else lz = Math.sign(lz) * hz;
        resX = R.x + lx * c - lz * s; resZ = R.z + lx * s + lz * c;
        hit = true;
      }
    }
    // Lan can cầu
    for (const br of this.bridges) {
      const dx = resX - br.x, dz = resZ - br.z;
      const along = dx * br.f.x + dz * br.f.z, across = -dx * br.f.z + dz * br.f.x;
      const sp = br.spans && this.envDamage ? this.envDamage.bridges.spanAt(br, along) : null;
      if (sp && sp.state !== 'ok') continue;   // nhịp sập: lan can rơi theo
      if (Math.abs(along) <= br.length / 2 - 4) {
        const halfW = br.width / 2;
        if (Math.abs(across) > halfW - vehicleRadius && Math.abs(across) < halfW + 12) {
          const na = Math.sign(across) * (halfW - vehicleRadius);
          resX = br.x + along * br.f.x - na * br.f.z;
          resZ = br.z + along * br.f.z + na * br.f.x;
          hit = true;
        }
      }
    }
    for (const fort of this.horseshoeForts) {
      if (Math.hypot(resX - fort.x, resZ - fort.z) > fort.outerRadius + 35) continue;
      for (const block of fort.wallBlocks) pushOut(block.x, block.z, block.radius);
    }
    for (const rock of this.boulders) pushOut(rock.x, rock.z, rock.radius || 18);
    return { x: resX, z: resZ, hit };
  }

  // ---------------------------------------------------------------------------
  // BẢN ĐỒ VỆ TINH / MINIMAP
  // ---------------------------------------------------------------------------
  renderPrecomputedMap() {
    const ctx = this.mapCtx;
    const w = this.mapCanvas.width, h = this.mapCanvas.height;
    const sc = w / this.width, half = this.width / 2;
    const P = v => (v + half) * sc;
    ctx.clearRect(0, 0, w, h);
    if (this.groundCanvas) ctx.drawImage(this.groundCanvas, 0, 0, w, h);
    // Nước
    if (this.map.river) {
      ctx.strokeStyle = '#2f6f8f'; ctx.lineWidth = this.map.river.width * sc;
      ctx.lineCap = 'round';
      ctx.beginPath(); this.map.river.pts.forEach((p, i) => i ? ctx.lineTo(P(p[0]), P(p[1])) : ctx.moveTo(P(p[0]), P(p[1]))); ctx.stroke();
    }
    for (const L of this.map.lakes) { ctx.fillStyle = '#2f6f8f'; ctx.beginPath(); ctx.arc(P(L.x), P(L.z), L.r * sc, 0, 6.283); ctx.fill(); }
    // Cây
    ctx.fillStyle = 'rgba(28,48,22,0.55)';
    for (const t of this.map.trees) { ctx.beginPath(); ctx.arc(P(t.x), P(t.z), (t.kind === 'cactus' ? 1.2 : 2.6), 0, 6.283); ctx.fill(); }
    // Cầu
    for (const b of this.bridges) {
      ctx.save(); ctx.translate(P(b.x), P(b.z)); ctx.rotate(-b.angle);
      ctx.fillStyle = '#b8b4aa';
      if (b.spans) { for (const s of b.spans) if (s.state === 'ok') ctx.fillRect(-b.width / 2 * sc, s.a0 * sc, b.width * sc, (s.a1 - s.a0) * sc); }
      else ctx.fillRect(-b.width / 2 * sc, -b.length / 2 * sc, b.width * sc, b.length * sc);
      ctx.restore();
    }
    // Nhà
    for (const b of this.buildings) {
      const R = b.ref;
      if (!R) continue;
      ctx.save(); ctx.translate(P(R.x), P(R.z)); ctx.rotate(-R.angle);
      ctx.fillStyle = R.kind === 'office' ? '#5b6670' : '#7a7064';
      ctx.fillRect(-R.halfW * sc, -R.halfD * sc, R.halfW * 2 * sc, R.halfD * 2 * sc);
      ctx.strokeStyle = 'rgba(20,20,20,0.6)'; ctx.lineWidth = 1; ctx.strokeRect(-R.halfW * sc, -R.halfD * sc, R.halfW * 2 * sc, R.halfD * 2 * sc);
      ctx.restore();
    }
    // Cứ điểm bê tông dưới ụ đất
    if (this.strongholdSet) this.strongholdSet.drawOnMap(ctx, P, sc);
    // Boong-ke (hình chữ U)
    for (const f of this.horseshoeForts) {
      ctx.save(); ctx.translate(P(f.x), P(f.z)); ctx.rotate(f.openAngle);
      ctx.strokeStyle = '#d6d2c6'; ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(f.armLength * sc, -f.armRadius * sc); ctx.lineTo(-f.armLength * sc, -f.armRadius * sc);
      ctx.lineTo(-f.armLength * sc, f.armRadius * sc); ctx.lineTo(f.armLength * sc, f.armRadius * sc);
      ctx.stroke();
      ctx.restore();
    }
  }

  // Hố bom hạ thấp lưới độ cao vật lý (xe sụt xuống lòng hố); lưới hiển thị đã được khoét lỗ thay bằng lòng chảo
  deformCrater(x, z, r, depth) {
    const S = this.segments, N = S + 1, cell = this.width / S;
    const i0 = Math.max(0, Math.floor((x - r + this.width / 2) / cell)), i1 = Math.min(S, Math.ceil((x + r + this.width / 2) / cell));
    const j0 = Math.max(0, Math.floor((z - r + this.depth / 2) / cell)), j1 = Math.min(S, Math.ceil((z + r + this.depth / 2) / cell));
    const base = this.groundAtRaw(x, z);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const wx = -this.width / 2 + i * cell, wz = -this.depth / 2 + j * cell;
      const d = Math.hypot(wx - x, wz - z);
      if (d >= r) continue;
      const k = 1 - d / r;
      const target = base - depth * (k * k * (3 - 2 * k));
      const idx = j * N + i;
      if (target < this.heightData[idx]) this.heightData[idx] = target;
    }
  }

  // Hố bom tạm (tương thích ngược; hố thật do ExplosionFX vẽ)
  addCrater3D(x, z, radius = 30) {
    const groundY = this.getElevationAt(x, z);
    const craterGeo = new THREE.CircleGeometry(radius, 16);
    craterGeo.rotateX(-Math.PI / 2);
    const craterMat = new THREE.MeshBasicMaterial({ color: 0x241a10, transparent: true, opacity: 0.8, depthWrite: false });
    const craterMesh = new THREE.Mesh(craterGeo, craterMat);
    craterMesh.position.set(x, groundY + 0.25, z);
    this.group.add(craterMesh);
    this.craters.push({ mesh: craterMesh, alpha: 0.8, life: 60 });
  }
}

window.BattleTerrain3D = BattleTerrain3D;

// Ngưỡng rừng rậm: số cây có tán (quy đổi) trong ô ~72x72 quanh điểm
BattleTerrain3D.FOREST_DENSE = 10;
