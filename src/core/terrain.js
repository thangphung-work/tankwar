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
      // ụ đất / lớp đất phủ mái dùng chung shader + ảnh nền với mặt đất -> màu cứ điểm khớp màu địa hình từng map
      this.strongholdSet = new Strongholds.StrongholdSet(this.group, SHL, {
        mapType: this.mapType, groundAt: ground,
        groundMaterial: o => this.groundLikeMaterial(o), worldSize: [this.width, this.depth], leafColors: this.leafColors()
      });
    }
    // Dựng nhà / cây / boong-ke với hạt giống của bản đồ -> mọi máy có cùng hình dạng & độ bền từng mảng
    if (typeof Destructibles !== 'undefined') Destructibles.withSeed((this.seed ^ 0x5eed1234) >>> 0, () => {
      this.bunkerSet = new Destructibles.BunkerSet(this.group, this.map.bunkers, ground);
      this.horseshoeForts = this.bunkerSet.items.map(k => k.fort);
      // mặt đất NHÌN THẤY (lòng hố bom): đống đổ nát / gạch vụn đặt lên đó (lúc dựng nhà chưa có hố -> trùng groundAtRaw)
      this.buildingSet = new Destructibles.BuildingSet(this.group, this.map.buildings, (x, z) => this.surfaceAt(x, z, true));
      this.buildings = this.buildingSet.items.map(b => b.entry);
      this.trees = new Destructibles.TreeField(this.group, this.map.trees, (x, z) => this.surfaceAt(x, z, true));
      // cây đổ vào nhà: thân dừng lại tựa lên tường / mái còn đứng thay vì xuyên qua
      this.trees.solidHit = (ax, ay, az, bx, by, bz) => !!this.buildingSegmentHit(ax, ay, az, bx, by, bz);
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
      // sunK / skyK: đặc trưng ánh sáng từng chiến địa (sa mạc nắng gắt, rừng ẩm nhiều ánh trời tán xạ, cao nguyên trong vắt)
      DESERT: { zenith: 0x4f86c6, horizon: 0xe6cfa4, fog: 0xdcc39a, density: 0.00022, ground: 0xb08a5a, sunK: 1.08, skyK: 0.9 },
      URBAN: { zenith: 0x5c7fa8, horizon: 0xc4c6c4, fog: 0xb9bcbc, density: 0.00030, ground: 0x6a6a64, sunK: 0.95, skyK: 0.88 },
      JUNGLE: { zenith: 0x5d8fb5, horizon: 0xb9cbb6, fog: 0xa9b7a2, density: 0.00036, ground: 0x4a4a32, sunK: 0.94, skyK: 1.06 },
      HIGHLAND: { zenith: 0x3f7cc4, horizon: 0xc9d8e4, fog: 0xbfcfdc, density: 0.00020, ground: 0x6b6450, sunK: 1.04, skyK: 0.96 },
      RIVER_LAKE: { zenith: 0x4c8bd0, horizon: 0xd2dfe4, fog: 0xc6d6da, density: 0.00026, ground: 0x5a6040, sunK: 1.0, skyK: 1.0 }
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
    // Tổng ánh sáng trên mặt đất phẳng giữa trưa ~1.6 (cũ ~2.2 -> nền sáng bị cắt trắng / lá cây xanh neon);
    // ánh trời mạnh hơn để vùng bóng còn ~45% vùng nắng (bóng có sắc trời xanh nhạt, không đen kịt)
    p.sunIntensity = (0.75 + 0.25 * elevK) * p.sunK;
    p.skyIntensity = (0.68 + 0.1 * elevK) * p.skyK;
    p.ambientIntensity = 0.15;
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

  // Vật liệu "mặt đất" cho khối đắp đất nằm trên địa hình (ụ đất cứ điểm): cùng shader nhiều lớp + ảnh màu nền
  // với lưới địa hình (lưới phải có uv theo tọa độ bản đồ: u = 0.5 + x / width, v = 0.5 - z / depth),
  // nhưng sáng tối theo pháp tuyến riêng của lưới. null nếu không có GroundShader.
  groundLikeMaterial(o = {}) {
    if (typeof GroundShader === 'undefined' || !this.groundTexture) return null;
    const mat = new THREE.MeshStandardMaterial({ map: this.groundTexture, roughness: this.mapType === 'URBAN' ? 0.82 : 0.95, metalness: 0.0, vertexColors: !!o.vertexColors });
    GroundShader.apply(mat, { mapType: this.mapType, macroCanvas: this.groundCanvas, water: !!(this.map.river || this.map.lakes.length), terrain: this, ownNormals: true });
    return mat;
  }

  // Màu lá bụi cây theo map (xanh rêu / ô liu: xanh lá thuần dưới nắng thành xanh neon)
  leafColors() {
    return { DESERT: [0x6f6e3c, 0x857e48], URBAN: [0x4e5c34, 0x5c6a3e], JUNGLE: [0x34482a, 0x405630], HIGHLAND: [0x4a5632, 0x58643a], RIVER_LAKE: [0x485a30, 0x566a38] }[this.mapType] || [0x4a5632, 0x58643a];
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
  roadTexture(kind, plain) {
    BattleTerrain3D._roadTex = BattleTerrain3D._roadTex || {};
    const key = kind + this.mapType + (plain ? ':plain' : '');
    if (BattleTerrain3D._roadTex[key]) return BattleTerrain3D._roadTex[key];
    const c = document.createElement('canvas');
    c.width = 128; c.height = 256;
    const g = c.getContext('2d');
    const sp = (n, cols, s0, s1) => { for (let i = 0; i < n; i++) { g.fillStyle = cols[i % cols.length]; const s = s0 + Math.random() * (s1 - s0); g.fillRect(Math.random() * 128, Math.random() * 256, s, s); } };
    if (kind === 'asphalt') {
      // Chỉ hạt nhựa + vạch kẻ (theo UV); ổ gà / vá / vết dầu / nứt rải theo tọa độ thế giới trong shader -> không lặp
      g.fillStyle = '#3c3e41'; g.fillRect(0, 0, 128, 256);
      sp(5000, ['rgba(20,20,22,0.35)', 'rgba(120,120,118,0.25)'], 1, 2);
      if (!plain) {
        // Vệt bánh xe mòn bóng trên 2 làn
        for (const x of [34, 94]) {
          const gr = g.createLinearGradient(x - 14, 0, x + 14, 0);
          gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, 'rgba(22,22,24,0.22)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
          g.fillStyle = gr; g.fillRect(x - 14, 0, 28, 256);
        }
        g.fillStyle = 'rgba(220,214,190,0.85)'; g.fillRect(6, 0, 3, 256); g.fillRect(119, 0, 3, 256);
        g.fillStyle = 'rgba(232,196,90,0.9)'; g.fillRect(62, 0, 4, 120);
        // Sơn vạch mòn loang lổ
        sp(900, ['rgba(60,62,65,0.8)'], 1, 3);
      }
    } else {
      const base = kind === 'mud' ? '#4f3e2b' : kind === 'gravel' ? '#67625a' : (this.mapType === 'DESERT' ? '#a8885e' : '#706048');
      g.fillStyle = base; g.fillRect(0, 0, 128, 256);
      sp(kind === 'gravel' ? 7000 : 3500, kind === 'gravel' ? ['rgba(60,58,52,0.45)', 'rgba(170,166,154,0.3)', 'rgba(120,110,96,0.4)'] : ['rgba(50,36,22,0.3)', 'rgba(220,200,160,0.18)'], 1, kind === 'gravel' ? 3 : 2);
      // 2 cặp vệt bánh xe lún sâu
      for (const x of [30, 98]) {
        const gr = g.createLinearGradient(x - 12, 0, x + 12, 0);
        gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, kind === 'mud' ? 'rgba(25,18,10,0.7)' : 'rgba(60,44,28,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(x - 12, 0, 24, 256);
        // vân lốp / xích: vệt ngắn rải ngẫu nhiên (vạch đều mỗi 6 px gây sọc moiré khi nhìn xiên)
        g.strokeStyle = 'rgba(40,30,20,0.14)'; g.lineWidth = 1;
        for (let i = 0; i < 70; i++) { const y = Math.random() * 256, xx = x + (Math.random() - 0.5) * 12, l = 2 + Math.random() * 4; g.beginPath(); g.moveTo(xx - l, y); g.lineTo(xx + l, y + (Math.random() - 0.3) * 3); g.stroke(); }
      }
      // Vũng nước / ổ gà / mép đường loang ra cỏ: rải theo tọa độ thế giới trong roadShader (không lặp, mép không thẳng tắp)
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    BattleTerrain3D._roadTex[key] = t;
    return t;
  }

  buildRoads() {
    const byKind = {};
    const wet = !!(this.map.river || this.map.lakes.length);
    const STEP = 6, across = 8;   // lưới mịn (ô địa hình ~16) -> mặt đường bám sát nền, đất không trồi xuyên / đường không lơ lửng
    this.map.roads.forEach((rd, ri) => {
      // Tuyến A* có khúc zig-zag bán kính ~5-10 (< nửa bề rộng) -> dải đường gập lật tam giác.
      // Mesh dùng bản sao tâm tuyến đã bỏ điểm sát nhau + làm trơn (khúc cua lớn gần như giữ nguyên)
      let pts = [];
      for (const p of rd.pts) if (!pts.length || Math.hypot(p[0] - pts[pts.length - 1][0], p[1] - pts[pts.length - 1][1]) > 4) pts.push([p[0], p[1]]);
      if (pts.length < 2) return;
      for (let pass = 0; pass < 4; pass++) {
        const sm = pts.map(p => p.slice());
        for (let i = 1; i < pts.length - 1; i++) for (let c = 0; c < 2; c++) sm[i][c] = (pts[i - 1][c] + 2 * pts[i][c] + pts[i + 1][c]) / 4;
        pts = sm;
      }
      const hw = rd.width / 2;
      // Mỗi tuyến nâng lệch nhau chút -> chỗ 2 đường giao nhau không z-fight
      const lift = 0.3 + (ri % 4) * 0.05;
      // Mép trái / phải tại từng điểm gốc, rồi chia nhỏ mỗi đoạn theo STEP
      const E = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
        let tx = b[0] - a[0], tz = b[1] - a[1];
        const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
        E.push([pts[i][0] + tz * hw, pts[i][1] - tx * hw, pts[i][0] - tz * hw, pts[i][1] + tx * hw]);
      }
      const rows = [];
      let vAcc = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const sl = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
        const sub = Math.max(1, Math.ceil(sl / STEP));
        for (let j = 0; j < sub; j++) {
          const t = j / sub, A = E[i], B = E[i + 1];
          rows.push([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t, A[3] + (B[3] - A[3]) * t, vAcc + sl * t]);
        }
        vAcc += sl;
      }
      const L = E[E.length - 1];
      rows.push([L[0], L[1], L[2], L[3], vAcc]);
      // Khúc cua gắt (bán kính < nửa bề rộng): mép trong không được lùi so với hàng trước -> dồn thành quạt, không lật tam giác
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i], q = rows[i - 1], n = rows[Math.min(rows.length - 1, i + 1)];
        const tx = (n[0] + n[2]) - (q[0] + q[2]), tz = (n[1] + n[3]) - (q[1] + q[3]);
        if ((r[0] - q[0]) * tx + (r[1] - q[1]) * tz < 0) { r[0] = q[0]; r[1] = q[1]; }
        if ((r[2] - q[2]) * tx + (r[3] - q[3]) * tz < 0) { r[2] = q[2]; r[3] = q[3]; }
      }
      const P = [], UV = [], I = [], NR = [], low = [];
      for (const r of rows) {
        for (let k = 0; k <= across; k++) {
          const s = k / across;
          const x = r[0] + (r[2] - r[0]) * s, z = r[1] + (r[3] - r[1]) * s;
          const gy = this.groundAtRaw(x, z);
          // Bù chỗ nền lồi (gờ / nếp gãy) giữa 2 đỉnh lưới: điểm giữa cao hơn dây cung -> nâng đỉnh lên, dốc phẳng thì bù = 0
          let bulge = 0;
          for (const [ux, uz] of [[3, 0], [-3, 0], [0, 3], [0, -3]]) {
            const bm = this.groundAtRaw(x + ux, z + uz) - (gy + this.groundAtRaw(x + ux * 2, z + uz * 2)) / 2;
            if (bm > bulge) bulge = bm;
          }
          P.push(x, gy + Math.min(bulge, 1.2) + lift, z);
          // Pháp tuyến theo dốc nền trên ±5 (mặt đường san phẳng): không gợn sọc sáng tối theo từng hàng lưới
          const ddx = this.groundAtRaw(x + 5, z) - this.groundAtRaw(x - 5, z), ddz = this.groundAtRaw(x, z + 5) - this.groundAtRaw(x, z - 5);
          const nl = Math.hypot(ddx, 10, ddz);
          NR.push(-ddx / nl, 10 / nl, -ddz / nl);
          UV.push(s, r[4] / (rd.width * 2));
          low.push(wet && gy < 0.25);   // dưới mặt nước (sông / hồ): cầu phủ lên, bỏ mặt đường
        }
      }
      for (let i = 0; i < rows.length - 1; i++) {
        for (let k = 0; k < across; k++) {
          const a = i * (across + 1) + k, b = a + 1, c = a + across + 1, d = c + 1;
          if (low[a] || low[b] || low[c] || low[d]) continue;
          // Ngược chiều kim đồng hồ nhìn từ trên -> pháp tuyến hướng LÊN (FrontSide không bị cull)
          I.push(a, b, c, b, d, c);
        }
      }
      (byKind[rd.kind] || (byKind[rd.kind] = [])).push({ P, UV, I, NR, ri });
    });
    // Ngã giao: đỉnh nằm trên lòng đường khác -> rdJ ~ 1, shader xóa vạch sơn / vệt bánh ở đó (vạch không chạy xuyên ngã tư)
    const HB = 64, segs = new Map(), hk = (i, j) => i * 100003 + j;
    this.map.roads.forEach((rd, ri) => {
      for (let i = 0; i < rd.pts.length - 1; i++) {
        const a = rd.pts[i], b = rd.pts[i + 1];
        const k = hk(Math.floor((a[0] + b[0]) / 2 / HB), Math.floor((a[1] + b[1]) / 2 / HB));
        if (!segs.has(k)) segs.set(k, []);
        segs.get(k).push([ri, a[0], a[1], b[0], b[1], rd.width / 2]);
      }
    });
    for (const kind in byKind) for (const p of byKind[kind]) {
      const n = p.P.length / 3, J = p.J = new Float32Array(n);
      for (let v = 0; v < n; v++) {
        const x = p.P[v * 3], z = p.P[v * 3 + 2], ci = Math.floor(x / HB), cj = Math.floor(z / HB);
        let j = 0;
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
          const list = segs.get(hk(ci + di, cj + dj));
          if (!list) continue;
          for (const s of list) {
            if (s[0] === p.ri) continue;
            const ex = s[3] - s[1], ez = s[4] - s[2], l2 = ex * ex + ez * ez || 1;
            const t = Math.max(0, Math.min(1, ((x - s[1]) * ex + (z - s[2]) * ez) / l2));
            const d = Math.hypot(x - s[1] - ex * t, z - s[2] - ez * t);
            const w = 1 - Math.max(0, Math.min(1, (d - (s[5] - 3)) / 6));
            if (w > j) j = w;
          }
        }
        J[v] = j;
      }
    }
    for (const kind in byKind) {
      // Gộp toàn bộ đường cùng loại thành 1 mesh
      let nv = 0, ni = 0;
      for (const p of byKind[kind]) { nv += p.P.length / 3; ni += p.I.length; }
      const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), jn = new Float32Array(nv), idx = new Uint32Array(ni);
      let ov = 0, oi = 0;
      for (const p of byKind[kind]) {
        pos.set(p.P, ov * 3); nrm.set(p.NR, ov * 3); uv.set(p.UV, ov * 2); jn.set(p.J, ov);
        for (let k = 0; k < p.I.length; k++) idx[oi + k] = p.I[k] + ov;
        ov += p.P.length / 3; oi += p.I.length;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      g.setAttribute('rdJ', new THREE.BufferAttribute(jn, 1));
      g.setIndex(new THREE.BufferAttribute(idx, 1));
      g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
      const m = new THREE.MeshStandardMaterial({
        map: this.roadTexture(kind), roughness: kind === 'asphalt' ? 0.78 : 0.97, metalness: 0,
        polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3
      });
      this.roadShader(m, kind);
      if (typeof ExplosionFX !== 'undefined' && ExplosionFX.installGroundHoles) ExplosionFX.installGroundHoles(m);
      const mesh = new THREE.Mesh(g, m);
      mesh.receiveShadow = true;
      mesh.name = 'road_' + kind;
      this.group.add(mesh);
    }
  }

  // Chống lặp mặt đường: texture UV chỉ giữ hạt + vạch kẻ / vệt bánh; ổ gà, mảng vá, vết dầu, vũng nước, nứt,
  // độ sáng tầng thấp và mép đường lởm chởm đều tính theo tọa độ thế giới + hash -> mỗi đoạn đường một khác
  roadShader(m, kind) {
    const desert = this.mapType === 'DESERT';
    const C = {
      asphalt: { cell: 11, prob: 0.6, e0: 0.006, ea: 0.022, cr: 0.02, tint: [0.8, 0.8, 0.82], hole: 0.5, puddle: 0.5 },
      dirt: { cell: 9, prob: 0.45, e0: 0.02, ea: 0.09, cr: 0.05, tint: desert ? [1.08, 1.04, 0.95] : [0.84, 0.88, 0.72], hole: 0.62, puddle: desert ? 0.0 : 0.35 },
      gravel: { cell: 9, prob: 0.45, e0: 0.018, ea: 0.08, cr: 0.05, tint: [0.88, 0.9, 0.8], hole: 0.66, puddle: 0.25 },
      mud: { cell: 8, prob: 0.6, e0: 0.02, ea: 0.1, cr: 0.06, tint: [0.8, 0.86, 0.68], hole: 0.55, puddle: 1.0 }
    }[kind] || null;
    if (!C) return;
    const f = v => (+v).toFixed(4);
    const defs = `#define RD_CELL ${f(C.cell)}\n#define RD_PROB ${f(C.prob)}\n#define RD_E0 ${f(C.e0)}\n#define RD_EA ${f(C.ea)}\n#define RD_CR ${f(C.cr)}\n` +
      `#define RD_TINT vec3(${C.tint.map(f).join(',')})\n#define RD_HOLE ${f(C.hole)}\n#define RD_PUDDLE ${f(C.puddle)}\n` + (kind === 'asphalt' ? '#define RD_ASPHALT\n' : '');
    const plainTex = kind === 'asphalt' ? this.roadTexture('asphalt', true) : null;
    m.onBeforeCompile = (sh) => {
      if (plainTex) sh.uniforms.rdPlain = { value: plainTex };
      sh.vertexShader = 'attribute float rdJ;\nvarying float vRdJ;\nvarying vec3 vRoadW;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n  vRoadW = (modelMatrix * vec4(transformed, 1.0)).xyz;\n  vRdJ = rdJ;');
      sh.fragmentShader = defs + (plainTex ? 'uniform sampler2D rdPlain;\n' : '') + `varying vec3 vRoadW;
varying float vRdJ;
float rdH(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float rdN(vec2 p) { vec2 i = floor(p), u = fract(p); u = u * u * (3.0 - 2.0 * u);
  return mix(mix(rdH(i), rdH(i + vec2(1.0, 0.0)), u.x), mix(rdH(i + vec2(0.0, 1.0)), rdH(i + vec2(1.0, 1.0)), u.x), u.y); }
` + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
  vec2 rw = vRoadW.xz;
  float rdFar = clamp(length(vViewPosition) / 260.0, 0.0, 1.0);
  float rdWet = 0.0;
  {
    // Ngã giao: đường nhựa lấy texture trơn (không vạch sơn) thay cho vạch; mọi loại: mép không lởm chởm đè lên lòng đường kia
    float rdJn = smoothstep(0.3, 0.8, vRdJ);
#ifdef RD_ASPHALT
    diffuseColor.rgb = mix(diffuseColor.rgb, mapTexelToLinear(texture2D(rdPlain, vUv)).rgb, rdJn);
#endif
    // Mép đường lởm chởm theo nhiễu (không thẳng tắp), dải sát mép ngả màu nền (cỏ / cát / bụi)
    float rdE = min(vUv.x, 1.0 - vUv.x);
    float eN = rdN(rw * 0.07) * 0.6 + rdN(rw * 0.31 + 3.0) * 0.4;
    float rdM = rdE - (RD_E0 + RD_EA * eN) + (rdN(rw * 0.9 + 11.0) - 0.5) * RD_CR + rdJn * 0.5;
    if (rdM < 0.0) discard;
    diffuseColor.rgb *= mix(RD_TINT, vec3(1.0), smoothstep(0.0, 0.07, rdM));
    float rdMul = 1.0, rdPatch = 0.0, rdTone = 1.0;
    vec2 c0 = floor(rw / RD_CELL);
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      vec2 cid = c0 + vec2(float(i), float(j));
      float h0 = rdH(cid);
      if (h0 > RD_PROB) continue;
      float ft = h0 / RD_PROB;
      vec2 cc = (cid + 0.15 + 0.7 * vec2(rdH(cid + 71.3), rdH(cid + 13.7))) * RD_CELL;
      float an = rdH(cid + 191.1) * 6.2832, ca = cos(an), sa = sin(an);
      vec2 d = rw - cc;
      vec2 q = vec2(ca * d.x + sa * d.y, -sa * d.x + ca * d.y);
      float sz = rdH(cid + 3.1);
      float wob = rdN(rw * 1.7 + cid * 3.7) - 0.5;
#ifdef RD_ASPHALT
      if (ft < 0.3) {          // ổ gà: lòng sẫm, vành vỡ sáng, có khi đọng nước
        float dd = length(q / vec2(1.0, 0.65)) / (0.5 + 1.1 * sz) + wob * 0.45;
        rdMul *= mix(RD_HOLE, 1.0, smoothstep(0.85, 1.0, dd)) * (1.0 + 0.15 * smoothstep(0.95, 1.05, dd) * (1.0 - smoothstep(1.1, 1.4, dd)));
        rdWet = max(rdWet, (1.0 - smoothstep(0.5, 0.8, dd)) * step(0.5, rdH(cid + 5.5)) * RD_PUDDLE);
      } else if (ft < 0.68) {  // mảng vá chữ nhật (nhựa mới sẫm / cũ bạc), đè mất vạch sơn
        vec2 b = abs(q) - vec2(1.2 + 3.5 * sz, 0.9 + 2.2 * rdH(cid + 8.8)) + wob * 0.25;
        float sd = length(max(b, 0.0)) + min(max(b.x, b.y), 0.0);
        float ins = 1.0 - smoothstep(-0.05, 0.05, sd);
        if (ins > rdPatch) { rdPatch = ins; rdTone = rdH(cid + 9.9) < 0.6 ? 0.74 : 1.16; }
        rdMul *= 1.0 - 0.3 * (1.0 - smoothstep(0.0, 0.12, abs(sd)));
      } else {                 // vết dầu loang
        float dd = length(q / vec2(1.0, 0.6)) / (0.8 + 2.2 * sz) + wob * 0.3;
        float k = 1.0 - smoothstep(0.3, 1.0, dd);
        rdMul *= 1.0 - 0.42 * k;
        rdWet = max(rdWet, k * 0.45);
      }
#else
      if (ft < 0.4) {          // ổ gà / vũng nước
        float dd = length(q / vec2(1.0, 0.6)) / (0.8 + 1.8 * sz) + wob * 0.5;
        rdMul *= mix(RD_HOLE, 1.0, smoothstep(0.8, 1.0, dd));
        rdWet = max(rdWet, (1.0 - smoothstep(0.55, 0.85, dd)) * RD_PUDDLE * step(0.35, rdH(cid + 5.5)));
      } else if (ft < 0.7) {   // mảng đá dăm / đất nện sáng hơn, lấm tấm hạt
        float dd = length(q / vec2(1.0, 0.7)) / (1.5 + 3.0 * sz) + wob * 0.6;
        float k = 1.0 - smoothstep(0.6, 1.0, dd);
        rdMul *= mix(1.0, 1.1 + 0.25 * (rdH(floor(rw * 4.0)) - 0.5) * (1.0 - rdFar), k);
      } else {                 // mảng ẩm sẫm
        float dd = length(q / vec2(1.0, 0.5)) / (2.0 + 4.0 * sz) + wob * 0.5;
        rdMul *= 1.0 - 0.22 * (1.0 - smoothstep(0.2, 1.0, dd));
      }
#endif
    }
#ifdef RD_ASPHALT
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.235, 0.243, 0.255) * rdTone * (0.94 + 0.12 * rdN(rw * 0.6)), rdPatch);
    // nứt mạng theo đường đồng mức nhiễu, chỉ ở vài vùng, mờ dần khi ở xa (khỏi nhấp nháy)
    float cn = rdN(rw * 0.08) + 0.5 * rdN(rw * 0.21 + 7.0);
    float crack = (1.0 - smoothstep(0.0, 0.02, abs(cn - 0.75))) * smoothstep(0.5, 0.7, rdN(rw * 0.025 + 3.0)) * (1.0 - rdFar);
    rdMul *= 1.0 - 0.5 * crack;
#endif
    diffuseColor.rgb *= rdMul;
    // Độ sáng / sắc tầng thấp: từng quãng đường cũ mới khác nhau
    float lf = rdN(rw * 0.011) * 0.6 + rdN(rw * 0.043 + 17.0) * 0.4;
    diffuseColor.rgb *= (0.84 + 0.32 * lf) * (0.94 + 0.12 * rdN(rw * 0.21 + 5.0));
    diffuseColor.rgb *= mix(vec3(1.03, 1.0, 0.96), vec3(0.97, 0.99, 1.03), rdN(rw * 0.02 + 40.0));
    diffuseColor.rgb *= 1.0 - 0.25 * rdWet;
  }`).replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  roughnessFactor = mix(roughnessFactor, 0.14, rdWet);`);
    };
    m.customProgramCacheKey = () => 'roadW3:' + kind + ':' + this.mapType;
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
    // Bản đồ độ dốc gợn sóng từ nhiễu fBm lặp liền mạch (5 tầng, mọi hướng như nhau) — tổng sóng sin cũ
    // cho ra các sọc thẳng song song trông rất giả. Kênh R/G = độ dốc theo x / z.
    const NS = 256, Hn = new Float32Array(NS * NS);
    const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
    for (const [P, amp] of [[4, 1], [8, 0.55], [16, 0.3], [32, 0.16], [64, 0.08]]) {
      const lat = new Float32Array(P * P);
      for (let i = 0; i < lat.length; i++) lat[i] = Math.random() * 2 - 1;
      for (let y = 0; y < NS; y++) {
        const v = y / NS * P, j0 = Math.floor(v), j1 = (j0 + 1) % P, ty = fade(v - j0);
        for (let x = 0; x < NS; x++) {
          const u = x / NS * P, i0 = Math.floor(u), i1 = (i0 + 1) % P, tx = fade(u - i0);
          const a = lat[j0 * P + i0] + (lat[j0 * P + i1] - lat[j0 * P + i0]) * tx;
          const b = lat[j1 * P + i0] + (lat[j1 * P + i1] - lat[j1 * P + i0]) * tx;
          Hn[y * NS + x] += (a + (b - a) * ty) * amp;
        }
      }
    }
    const gx = new Float32Array(NS * NS), gy = new Float32Array(NS * NS);
    let gmax = 1e-6;
    for (let y = 0; y < NS; y++) for (let x = 0; x < NS; x++) {
      const i = y * NS + x;
      gx[i] = (Hn[y * NS + (x + 1) % NS] - Hn[y * NS + (x + NS - 1) % NS]) * 0.5;
      gy[i] = (Hn[((y + 1) % NS) * NS + x] - Hn[((y + NS - 1) % NS) * NS + x]) * 0.5;
      gmax = Math.max(gmax, Math.abs(gx[i]), Math.abs(gy[i]));
    }
    for (let i = 0; i < NS * NS; i++) {
      const k = i * 4;
      img.data[k] = 128 + gx[i] / gmax * 120; img.data[k + 1] = 128 + gy[i] / gmax * 120; img.data[k + 2] = 255; img.data[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const normal = new THREE.CanvasTexture(c);
    normal.wrapS = normal.wrapT = THREE.RepeatWrapping;
    const atm = this.atmosphere;
    // Nước sông hồ thật: thân nước tối xanh rêu-xám (phù sa, tảo), không phải màu xanh dương sơn phẳng;
    // màu trời chỉ hiện ra qua phản chiếu Fresnel — nhìn xiên / xa thì sáng ánh trời, nhìn thẳng xuống thì tối trong
    const body = { DESERT: 0x26302a, JUNGLE: 0x202a1e, URBAN: 0x232c2a }[this.mapType] || 0x1e2b29;
    const bodyCol = new THREE.Color(body).lerp(new THREE.Color(atm.zenith), 0.12);
    const mat = new THREE.MeshStandardMaterial({
      color: bodyCol, roughness: 0.18, metalness: 0.0, transparent: true, opacity: 0.9, depthWrite: false
    });
    const skyRefl = new THREE.Color(atm.horizon).lerp(new THREE.Color(atm.zenith), 0.35).multiplyScalar(0.85);
    // Bản đồ độ sâu nước theo lưới địa hình (đơn vị game, -2..14): ven bờ nông trong & ngả màu bùn, có viền bọt
    const S = this.segments, N = S + 1, dd = new Uint8Array(N * N * 4);
    for (let i = 0; i < N * N; i++) {
      const v = Math.round((Math.max(-2, Math.min(14, 0.2 - this.heightData[i])) + 2) / 16 * 255);
      dd[i * 4] = dd[i * 4 + 1] = dd[i * 4 + 2] = v; dd[i * 4 + 3] = 255;
    }
    const depthTex = new THREE.DataTexture(dd, N, N, THREE.RGBAFormat);
    depthTex.magFilter = depthTex.minFilter = THREE.LinearFilter;
    depthTex.needsUpdate = true;
    const U = this.waterUniforms = {
      wSky: { value: skyRefl }, wNrm: { value: normal }, wDepth: { value: depthTex }, wT: { value: 0 },
      wMap: { value: new THREE.Vector4(this.width, this.depth, S, N) },
      wShallow: { value: bodyCol.clone().lerp(new THREE.Color(0x6a6650), 0.55) },
      wFoam: { value: new THREE.Color(0xc4ccc9) }
    };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = 'varying vec3 vWPos;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
  vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
      sh.fragmentShader = `uniform vec3 wSky; uniform sampler2D wNrm; uniform sampler2D wDepth; uniform float wT; uniform vec4 wMap;
uniform vec3 wShallow; uniform vec3 wFoam; varying vec3 vWPos;
` + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
  // độ sâu nước tại điểm này: ven bờ màu bùn nhạt, trong hơn (thấy đáy)
  vec2 wuv = vec2((vWPos.x + wMap.x * 0.5) / wMap.x * wMap.z + 0.5, (vWPos.z + wMap.y * 0.5) / wMap.y * wMap.z + 0.5) / wMap.w;
  float wDep = texture2D(wDepth, wuv).r * 16.0 - 2.0;
  diffuseColor.rgb = mix(wShallow, diffuseColor.rgb, smoothstep(0.5, 7.0, wDep));
  // mép nước mờ dần theo bản đồ độ sâu (đường bờ mượt), không lộ đường cắt tam giác của lưới địa hình
  diffuseColor.a *= smoothstep(0.05, 1.3, wDep) * mix(0.55, 1.0, smoothstep(1.3, 6.0, wDep));`).replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  // Mặt sóng theo toạ độ thế giới (không theo ô lưới), chỉ từ vân nhiễu tự nhiên ở 4 tỉ lệ: sóng lừng dài, gợn vừa,
  // gợn nhỏ, lăn tăn sát máy quay — mỗi lớp xoay lệch hướng & trôi theo gió với tốc độ khác nhau, không còn sọc thẳng
  vec2 wp = vWPos.xz;
  float wDist = length(vViewPosition);
  float wFar = smoothstep(500.0, 2600.0, wDist);
  vec2 wn0 = texture2D(wNrm, mat2(0.94, 0.342, -0.342, 0.94) * wp / 230.0 + vec2(wT * 0.0035, wT * 0.0021)).xy * 2.0 - 1.0;
  vec2 wn1 = texture2D(wNrm, mat2(0.866, 0.5, -0.5, 0.866) * wp / 73.0 + vec2(wT * 0.009, wT * 0.005)).xy * 2.0 - 1.0;
  vec2 wn2 = texture2D(wNrm, mat2(0.342, -0.94, 0.94, 0.342) * wp / 23.0 - vec2(wT * 0.018, -wT * 0.011)).xy * 2.0 - 1.0;
  // gợn lăn tăn rất nhỏ gần máy quay: vệt nắng vỡ thành lấp lánh thay vì mảng trắng loá
  vec2 wn3 = texture2D(wNrm, mat2(-0.5, 0.866, -0.866, -0.5) * wp / 7.0 + vec2(wT * 0.035, wT * 0.027)).xy * 2.0 - 1.0;
  vec2 wg = wn0 * 0.12 + (wn1 * 0.55 + wn2 * 0.45) * 0.2 * (1.0 - wFar * 0.85) + wn3 * 0.13 * (1.0 - smoothstep(120.0, 520.0, wDist));
  wg *= 1.0 - wFar * 0.5;
  normal = normalize((viewMatrix * vec4(normalize(vec3(-wg.x, 1.0, -wg.y)), 0.0)).xyz);`).replace('#include <tonemapping_fragment>', `
  {
    float fres = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 4.0);
    float refl = 0.05 + 0.55 * fres;
    gl_FragColor.rgb = mix(gl_FragColor.rgb, wSky, refl);
    gl_FragColor.a = mix(gl_FragColor.a, 1.0, fres * 0.6);
    // viền bọt ven bờ: dải mỏng lăn tăn theo gợn sóng, dày mỏng không đều
    float wf = (1.0 - smoothstep(0.35, 1.5, wDep + wn1.x * 0.45 + wn2.y * 0.25)) * smoothstep(0.1, 0.45, wDep);
    wf *= 0.55 + 0.45 * sin(wT * 1.3 + dot(wp, vec2(0.05, 0.037)));
    gl_FragColor.rgb = mix(gl_FragColor.rgb, wFoam * (0.6 + 0.4 * gl_FragColor.g / max(0.05, wFoam.g)), wf * 0.55);
    gl_FragColor.a = max(gl_FragColor.a, wf * 0.7);
  }
  #include <tonemapping_fragment>`);
    };
    mat.customProgramCacheKey = () => 'waterWorld3';
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
    const base = { DESERT: '#8a6e54', HIGHLAND: '#64615a', URBAN: '#6c6963', JUNGLE: '#55524a', RIVER_LAKE: '#625e57' }[this.mapType] || '#666666';
    g.fillStyle = base; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${Math.random() < 0.55 ? '30,26,22' : '190,184,170'},${Math.random() * 0.2})`; const s = 1 + Math.random() * 3; g.fillRect(Math.random() * 128, Math.random() * 128, s, s); }
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
    const mat = new THREE.MeshStandardMaterial({ map: this.rockTexture(), roughness: 0.9, metalness: 0.02, vertexColors: true });
    // Mặt trên đá: rêu (rừng / sông hồ), địa y bạc (cao nguyên), bụi cát (sa mạc), bụi xám (đô thị)
    const topTint = { JUNGLE: [0.62, 0.8, 0.44], RIVER_LAKE: [0.72, 0.84, 0.56], HIGHLAND: [0.95, 0.97, 0.86], DESERT: [1.12, 1.0, 0.84], URBAN: [0.94, 0.93, 0.9] }[this.mapType] || [1, 1, 1];
    const variants = [0, 1, 2].map(v => {
      // Tảng đá: khối cầu chia mịn, nhiễu nhiều tầng (gồ ghề lớn + sần nhỏ), vài mặt cắt phẳng như vết vỡ tự nhiên,
      // đáy phẳng chôn vào đất; pháp tuyến mượt (không lộ mặt tam giác), khe lõm tối, mặt hướng lên phủ rêu / bụi
      let sd = (v + 1) * 2654435761 >>> 0;
      const rnd = () => { sd = (sd + 0x6D2B79F5) >>> 0; let t = Math.imul(sd ^ (sd >>> 15), 1 | sd); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
      const waves = [];
      for (let k = 0; k < 9; k++) {
        const z = rnd() * 2 - 1, a = rnd() * 6.283, r = Math.sqrt(1 - z * z), f = 1.4 * Math.pow(1.85, k % 5);
        waves.push([Math.cos(a) * r * f, z * f, Math.sin(a) * r * f, rnd() * 6.283, 0.2 / Math.pow(1.7, k % 5)]);
      }
      const cuts = [];
      for (let k = 0; k < 4; k++) {
        const z = k === 0 ? 0.85 + rnd() * 0.15 : rnd() * 0.9 - 0.3, a = rnd() * 6.283, r = Math.sqrt(1 - z * z);
        cuts.push([Math.cos(a) * r, z, Math.sin(a) * r, 0.62 + rnd() * 0.2]);
      }
      const g = new THREE.IcosahedronGeometry(1, 4);
      const p = g.attributes.position;
      const disp = new Float32Array(p.count);
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        let n = 0;
        for (const w of waves) n += Math.sin(x * w[0] + y * w[1] + z * w[2] + w[3]) * w[4];
        let X = x * (1 + n), Y = y * (1 + n), Z = z * (1 + n);
        for (const c of cuts) {
          const dd = X * c[0] + Y * c[1] + Z * c[2] - c[3];
          if (dd > 0) { X -= c[0] * dd * 0.9; Y -= c[1] * dd * 0.9; Z -= c[2] * dd * 0.9; }
        }
        Y = Math.max(-0.35, Y * 0.82);
        disp[i] = Math.hypot(X, Y / 0.82, Z);
        p.setXYZ(i, X, Y, Z);
      }
      // pháp tuyến mượt: cộng dồn pháp tuyến mặt theo vị trí đỉnh gốc (đỉnh trùng nhau ở đường nối UV dùng chung)
      const key = i => Math.round(p.getX(i) * 1e4) + ',' + Math.round(p.getY(i) * 1e4) + ',' + Math.round(p.getZ(i) * 1e4);
      const acc = new Map(), A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
      for (let i = 0; i < p.count; i += 3) {
        A.fromBufferAttribute(p, i); B.fromBufferAttribute(p, i + 1); C.fromBufferAttribute(p, i + 2);
        const fn = B.clone().sub(A).cross(C.clone().sub(A));
        for (let j = 0; j < 3; j++) { const k = key(i + j); const s = acc.get(k); if (s) s.add(fn); else acc.set(k, fn.clone()); }
      }
      const nrm = g.attributes.normal, col = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) {
        const n = acc.get(key(i)).normalize();
        nrm.setXYZ(i, n.x, n.y, n.z);
        // khe lõm (bị đẩy vào trong) tối hơn; chân đá sát đất tối; mặt hướng lên phủ rêu / bụi
        const ao = Math.max(0.45, Math.min(1.08, 0.62 + (disp[i] - 0.82) * 1.6)) * (0.72 + 0.28 * Math.min(1, (p.getY(i) + 0.35) / 0.5));
        const up = Math.max(0, Math.min(1, (n.y - 0.55) * 2.6));
        col[i * 3] = ao * (1 + (topTint[0] - 1) * up); col[i * 3 + 1] = ao * (1 + (topTint[1] - 1) * up); col[i * 3 + 2] = ao * (1 + (topTint[2] - 1) * up);
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      // UV chiếu phẳng xiên theo vị trí (UV cầu gốc bị xoắn ở đỉnh đá)
      const uv = g.attributes.uv;
      for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) * 0.8 + p.getZ(i) * 0.45, p.getY(i) * 0.9 + p.getZ(i) * 0.4 - p.getX(i) * 0.2);
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
      const col = new THREE.Color(1, 1, 1).multiplyScalar(0.74 + Math.random() * 0.26);
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
    const leafCol = this.leafColors();
    let geo, mat;
    const F = typeof Destructibles !== 'undefined' && Destructibles.Foliage;
    if (F) {
      // Bụi lá thật: vòm thẻ lá cắt alpha (texture lá nhạt màu, sắc xanh theo bản đồ do instanceColor quyết định)
      geo = F.bushGeometry(0xb05e5);
      mat = F.foliageMat(F.leafTex('neutral'));
    } else {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const g = c.getContext('2d');
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 700; i++) { const s = 0.6 + Math.random() * 0.5; g.fillStyle = `rgb(${212 * s | 0},${228 * s | 0},${198 * s | 0})`; g.beginPath(); g.ellipse(Math.random() * 128, Math.random() * 128, 2 + Math.random() * 4, 1 + Math.random() * 2, Math.random() * 3, 0, 6.3); g.fill(); }
      geo = new THREE.IcosahedronGeometry(1, 1).toNonIndexed();
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) { const k = 1 + Math.sin(p.getX(i) * 7 + p.getZ(i) * 5) * 0.2; p.setXYZ(i, p.getX(i) * k, Math.max(-0.2, p.getY(i) * 0.7 * k), p.getZ(i) * k); }
      geo.computeVertexNormals();
      mat = new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(c), roughness: 0.95 });
    }
    const im = new THREE.InstancedMesh(geo, mat, total);
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
    if (this.waterUniforms) this.waterUniforms.wT.value += dt;   // sóng mặt nước trôi theo thời gian
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
      if (br) return Math.max(g, br.y !== undefined ? br.y : br.b.deckY);
      // nhịp cầu đang sập / đã đổ: xe rơi theo mặt nhịp, không xuyên qua dầm nằm dưới sông
      const fy = this.envDamage && this.envDamage.bridges.brokenDeckAt ? this.envDamage.bridges.brokenDeckAt(x, z) : null;
      if (fy !== null) return Math.max(g, fy);
    }
    return g;
  }

  // Mặt đất NHÌN THẤY cho đồ vật đặt trên đất (cây, đá, mảnh vụn, rào...): trong hố bom = lòng hố thật (sâu hơn lưới
  // vật lý ~25%), trên gờ hố = gờ đất đắp. raw: bỏ qua mặt cầu / cứ điểm (như groundAtRaw)
  surfaceAt(x, z, raw) {
    const g = raw ? this.groundAtRaw(x, z) : this.getElevationAt(x, z);
    const fx = this._fxSurf !== undefined ? this._fxSurf : (typeof ExplosionFX !== 'undefined' && ExplosionFX.forScene ? ExplosionFX.forScene(this.scene) : null);
    if (fx) this._fxSurf = fx;
    return fx && fx.craterSurfaceAt ? fx.craterSurfaceAt(x, z, g) : g;
  }
  // Mặt đất trong vùng chữ nhật vừa đổi (hố bom mới / hố bị xoá): mọi đồ vật trong vùng đặt lại độ cao theo mặt mới
  onGroundChanged(x0, z0, x1, z1) {
    if (this.trees && this.trees.reground) this.trees.reground(x0, z0, x1, z1);
    if (this.envDamage && this.envDamage.reground) this.envDamage.reground(x0, z0, x1, z1);
    if (this.propSet && this.propSet.reground) this.propSet.reground(x0, z0, x1, z1);
    if (this.buildingSet && this.buildingSet.reground) this.buildingSet.reground(x0, z0, x1, z1);
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

  // "Trần" của bản đồ: độ cao mà TRÊN đó không còn gì để đạn chạm (mặt đất cao nhất, mái nhà, ụ cứ điểm, đá, bao cát,
  // mặt cầu) + lề an toàn. Mô phỏng đường đạn bỏ qua kiểm tra va chạm / chạm đất khi đạn đang bay trên trần
  // (phần lớn quỹ đạo cầu vồng) — kết quả y hệt vì ở đó không thể va chạm. Mặt đất chỉ bị hạ thấp (hố bom),
  // vật cản chỉ thấp đi (nhà sập); tính lại khi danh sách vật cản đổi số lượng hoặc đổi bản đồ.
  shotCeiling() {
    const C = this._shotCeil;
    const sig = this.buildings.length + this.boulders.length * 1e3 + this.horseshoeForts.length * 1e6 + this.bridges.length * 1e7 +
      (this.propSet ? this.propSet.bagSegs.length * 1e8 : 0);
    if (C && C.h === this.heightData && C.sig === sig && C.sh === this.strongholdSet) return C.y;
    let top = -Infinity;
    const H = this.heightData;
    for (let i = 0; i < H.length; i++) if (H[i] > top) top = H[i];
    for (const b of this.buildings) {
      const R = b.ref;
      top = Math.max(top, R ? R.y + b.height : this.groundAtRaw(b.x, b.z) + (b.height || 60));
    }
    for (const rock of this.boulders) top = Math.max(top, this.groundAtRaw(rock.x, rock.z) + rock.height);
    for (const fort of this.horseshoeForts) {
      const K = fort.ref;
      if (!K) continue;
      for (const q of K.blocks) top = Math.max(top, q.y1 + 1);
      if (K.roofs) for (const s of K.roofs) top = Math.max(top, s.y1 + 4);
    }
    if (this.strongholdSet) top = Math.max(top, this.strongholdSet.maxTop());
    for (const br of this.bridges) top = Math.max(top, br.deckY !== undefined ? br.deckY : -Infinity);
    if (this.propSet) for (const sg of this.propSet.bagSegs) top = Math.max(top, Math.max(sg.g0, sg.g1) + sg.top);
    // lề: gờ đất quanh hố bom, dầm / gờ nhô, sai số nội suy
    const y = top + 30;
    this._shotCeil = { h: H, sig, sh: this.strongholdSet, y };
    return y;
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
      } else if ((x - b.x) * (x - b.x) + (z - b.z) * (z - b.z) <= b.radius * b.radius) {
        const gy = this.getElevationAt(b.x, b.z);
        if (y <= gy + (b.height || 60) && y >= gy - 5) return { hit: true, obstacle: b, type: 'BUILDING', x, y, z };
      }
    }
    // Hàm này chạy hàng nghìn lần mỗi khung (mỗi bước mô phỏng đường đạn của bot / đạn đang bay):
    // so sánh bình phương khoảng cách thay cho Math.hypot (chậm ~10 lần) — kết quả va chạm y hệt
    for (const fort of this.horseshoeForts) {
      const fdx = x - fort.x, fdz = z - fort.z, fr = fort.outerRadius + 15;
      if (fdx * fdx + fdz * fdz > fr * fr) continue;
      const K = fort.ref;
      if (K) {
        for (const q of K.blocks) {
          if (!q.alive) continue;
          if (y < q.y0 - 2 || y > q.y1 + 1) continue;
          const qdx = x - q.x, qdz = z - q.z, qr = q.radius + 2;
          if (qdx * qdx + qdz * qdz <= qr * qr) return { hit: true, fort, type: 'WALL', x, y, z };
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
      const rdx = x - rock.x, rdz = z - rock.z, rr = rock.radius;
      if (rdx > rr || rdx < -rr || rdz > rr || rdz < -rr) continue;
      if (rdx * rdx + rdz * rdz <= rr * rr) {
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

  // Hộp vật cản (nhà) gần xe cho VehicleCollision: tường nhà còn đứng cao hết tầng, nhà sập còn đống đổ nát thấp
  vehicleObstacles(x, z, unit) {
    const out = this._vcBoxes || (this._vcBoxes = []);
    out.length = 0;
    const reach = typeof VehicleCollision !== 'undefined' && unit ? VehicleCollision.reach(unit) : 60;
    for (const b of this.buildings) {
      const R = b.ref;
      if (!R) continue;
      const m = R.halfW + R.halfD + reach + 10;
      if (Math.abs(x - R.x) > m || Math.abs(z - R.z) > m) continue;
      // Nhà sập: không còn hộp cứng — đống đổ nát là mặt cho xích bò lên (vehicleDebris), chỉ mảng tường góc còn đứng chặn
      if (R.collapsed) { if (R.rubbleWalls) for (const w of R.rubbleWalls) out.push(w); continue; }
      const box = b._vcBox || (b._vcBox = { cx: R.x, cz: R.z, ux: Math.cos(R.angle), uz: -Math.sin(R.angle), hu: R.halfW, hv: R.halfD, y0: 0, y1: 0 });
      box.y0 = (R.y || 0) - 20;
      box.y1 = (R.y || 0) + (b.height || 60);
      out.push(box);
    }
    return out;
  }

  // Đổ nát quanh xe cho xích / bánh bò lên (VehicleCollision.trackSupport): mặt đống nhà sập, đống gạch chân tường,
  // gốc tường gãy & ụ vụn của boong-ke. null nếu quanh xe không có gì (xe chạy như mặt đất trơn)
  vehicleDebris(x, z, unit) {
    if (typeof VehicleCollision === 'undefined') return null;
    const out = this._vcDebris || (this._vcDebris = []);
    out.length = 0;
    const r = 40 + Math.min(20, Math.abs((unit && unit.speed) || 0) * 0.1);
    if (this.buildingSet && this.buildingSet.vehicleDebris) this.buildingSet.vehicleDebris(x, z, r, out);
    if (this.bunkerSet && this.bunkerSet.S) VehicleCollision.blockDebris(this.bunkerSet.S, 0, x, z, r, out);
    return out.length ? out : null;
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
    // Nhà: hộp xoay (đống đổ nát vẫn chặn nhưng thấp - xe vẫn không chui qua được).
    // Xe thật: thân xe (hộp xoay theo hướng xe) + nòng pháo va vào tường nhà, trượt dọc theo tường
    if (unit && typeof VehicleCollision !== 'undefined') {
      const boxes = this.vehicleObstacles(resX, resZ, unit);
      if (boxes.length) {
        const r = VehicleCollision.resolve(unit, currentX, currentZ, resX, resZ, boxes);
        resX = r.x; resZ = r.z; hit = hit || r.hit;
      }
    }
    for (const b of (unit && typeof VehicleCollision !== 'undefined') ? [] : this.buildings) {
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
      // gốc tường gãy thấp hơn bậc leo được: xích bò qua (thành mặt đỡ trong vehicleDebris), không chặn như tường
      const climb = unit && typeof VehicleCollision !== 'undefined' ? (unit.y || 0) + VehicleCollision.stepOf(unit) : -Infinity;
      for (const block of fort.wallBlocks) if (block.y1 > climb) pushOut(block.x, block.z, block.radius);
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
