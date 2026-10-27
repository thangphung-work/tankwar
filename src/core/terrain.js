/**
 * Hệ thống Địa hình Chiến trường 3D sinh ngẫu nhiên theo seed (Three.js WebGL)
 * 5 loại chiến địa, mỗi trận một bản đồ khác (cùng seed -> giống hệt nhau trên mọi máy):
 * 1. DESERT     - Sa mạc: đụn cát lưỡi liềm ngang gió (sườn khuất dốc), núi bàn vách đá, ốc đảo ao nước + cọ, đường đất lún vệt bánh
 * 2. URBAN      - Đô thị: lưới phố không đều, nhà cao tầng / chung cư / cửa hàng / nhà đổ nát, đường nhựa ổ gà
 * 3. JUNGLE     - Rừng rậm: đồi lượn sóng, rừng dày đặc, đường bùn nhão
 * 4. HIGHLAND   - Cao nguyên: núi đá sống lưng, rừng thông, đường sỏi đèo dốc
 * 5. RIVER_LAKE - Sông hồ: sông uốn khúc chảy dọc chiến trường, hồ, cầu bê tông, làng ven sông
 * Dữ liệu bản đồ: src/core/map_gen.js (thuần dữ liệu); vật thể phá hủy: src/gameplay/destructibles.js
 */
let Terrain3DClod = null;   // hình cục đất vón dùng chung cho các ụ đất xe ủi
let Terrain3DSoilTex = null;   // vân hạt đất xới dùng chung cho các ụ đất (bermSoilTexture)
// Nhiễu giá trị 2D mượt (0..1) cho mặt ụ đất: cục đất vón, mảng đất đổ — hàm cố định theo toạ độ -> mọi chỗ gọi cùng một mặt
function bermNoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const h = (i, j) => { let n = Math.imul(i, 374761393) ^ Math.imul(j, 668265263); n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = h(xi, zi), b = h(xi + 1, zi), c = h(xi, zi + 1), d = h(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
// Bảng mặt đất cho getTerrainInfoAt (hằng, dựng 1 lần — trước đây dựng lại mỗi lần gọi, mỗi xe mỗi khung hình)
const TERRAIN_ROAD_INFO = {
  asphalt: { type: 'URBAN_ROAD', speedMult: 1.15, bumpiness: 0.12, dustMult: 0.25, sinkY: 0, engineLoad: 0.85, name: 'ĐƯỜNG NHỰA (CÓ Ổ GÀ)' },
  dirt: { type: 'ROAD', speedMult: 1.08, bumpiness: 0.42, dustMult: 0.9, sinkY: -0.1, engineLoad: 0.92, name: 'ĐƯỜNG ĐẤT (LÚN VỆT BÁNH, Ổ GÀ)' },
  gravel: { type: 'ROAD', speedMult: 1.05, bumpiness: 0.55, dustMult: 0.7, sinkY: 0, engineLoad: 0.95, name: 'ĐƯỜNG SỎI ĐÁ GỒ GHỀ' },
  mud: { type: 'ROAD', speedMult: 0.94, bumpiness: 0.6, dustMult: 0.15, sinkY: -0.5, engineLoad: 1.15, name: 'ĐƯỜNG BÙN NHÃO' }
};
const TERRAIN_BASE_INFO = {
  DESERT: { type: 'SAND', speedMult: 0.86, bumpiness: 0.5, dustMult: 1.0, sinkY: -0.8, engineLoad: 1.18, name: 'CÁT SA MẠC (LÚN, BỤI MÙ)' },
  URBAN: { type: 'URBAN_ROAD', speedMult: 1.0, bumpiness: 0.2, dustMult: 0.4, sinkY: 0, engineLoad: 0.95, name: 'SÂN BÊ TÔNG / VỈA HÈ' },
  JUNGLE: { type: 'JUNGLE_SOIL', speedMult: 0.88, bumpiness: 0.55, dustMult: 0.2, sinkY: -0.5, engineLoad: 1.1, name: 'ĐẤT MÙN RỪNG (RỄ CÂY, GỒ GHỀ)' },
  HIGHLAND: { type: 'GRASS', speedMult: 0.92, bumpiness: 0.6, dustMult: 0.55, sinkY: -0.2, engineLoad: 1.05, name: 'ĐỒNG CỎ ĐỒI NÚI (ĐÁ LỔN NHỔN)' },
  RIVER_LAKE: { type: 'GRASS', speedMult: 0.95, bumpiness: 0.4, dustMult: 0.4, sinkY: -0.3, engineLoad: 1.0, name: 'BÃI CỎ VEN SÔNG' }
};
// Phần mảnh văng / sức ép còn lại khi nhà nằm giữa điểm nổ và xe (blastFactor), theo vật liệu tường nhà
const BLAST_COVER = { concrete: 0.3, stone: 0.3, adobe: 0.35, wood: 0.55, metal: 0.8 };

class BattleTerrain3D {
  // opts.defer: chưa dựng gì (built = false, mặt đất phẳng cao 0) — setMapType / prepare sẽ dựng khi cần
  constructor(scene, width = MapGen.SIZE, depth = MapGen.SIZE, mapType = 'DESERT', seed, opts = {}) {
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
    this.berms = [];
    this.waterMesh = null;

    this.mapCanvas = document.createElement('canvas');
    this.mapCanvas.width = 1200;
    this.mapCanvas.height = 1200;
    this.mapCtx = this.mapCanvas.getContext('2d');

    if (opts.defer) { this.built = false; return; }
    this.buildTerrain();
  }

  // ---------------------------------------------------------------------------
  // VÒNG ĐỜI
  // ---------------------------------------------------------------------------
  /**
   * Giải phóng bộ nhớ GPU của cả cây object: hình khối, vật liệu và kết cấu gắn trong vật liệu (map, normalMap,
   * uniform của shader...). Trước đây chỉ dispose hình khối + vật liệu -> kết cấu (ảnh, canvas) nằm lại trong VRAM.
   * Kết cấu / vật liệu dùng chung (bộ nhớ đệm cấp module) vẫn dùng tiếp được: three.js tự nạp lại lên GPU khi vẽ.
   * Không đụng kết cấu của render target (ảnh không phải ảnh thật -> không nạp lại được).
   */
  static disposeObject(root) {
    if (!root || !root.traverse) return;
    const seen = new Set();
    const tex = (t) => {
      if (!t || !t.isTexture || seen.has(t)) return;
      seen.add(t);
      const im = t.image;
      const real = t.isDataTexture || t.isCompressedTexture || (im && (
        (typeof HTMLCanvasElement !== 'undefined' && im instanceof HTMLCanvasElement) ||
        (typeof HTMLImageElement !== 'undefined' && im instanceof HTMLImageElement) ||
        (typeof ImageBitmap !== 'undefined' && im instanceof ImageBitmap) ||
        (typeof OffscreenCanvas !== 'undefined' && im instanceof OffscreenCanvas)));
      if (real) t.dispose();
    };
    const mat = (m) => {
      if (!m || seen.has(m)) return;
      seen.add(m);
      for (const k in m) { const v = m[k]; if (v && v.isTexture && k !== 'envMap') tex(v); }
      if (m.uniforms) for (const k in m.uniforms) { const u = m.uniforms[k]; if (u && u.value && u.value.isTexture) tex(u.value); }
      m.dispose();
    };
    root.traverse(o => {
      if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); }
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(mat);
      if (o.isInstancedMesh && o.dispose) o.dispose();
    });
  }

  clearTerrain() {
    this._detailToken = (this._detailToken || 0) + 1;
    while (this.group.children.length > 0) {
      const obj = this.group.children[0];
      this.group.remove(obj);
      BattleTerrain3D.disposeObject(obj);
    }
    if (this.groundTexture) { this.groundTexture.dispose(); this.groundTexture = null; }
    this.horseshoeForts = [];
    this.buildings = [];
    this.palmTrees = [];
    this.bushClusters = [];
    this.boulders = [];
    this.bridges = [];
    this.craters = [];
    this.berms = [];
    this.waterMesh = null;
    this.backdrop = null;
    this.trees = this.buildingSet = this.bunkerSet = this.strongholdSet = this.landmarkSet = this.groundCover = this.propSet = null;
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
    // lưới tìm đường lưu theo object terrain: dựng lại bản đồ trên cùng object -> bỏ lưới của bản đồ cũ
    if (typeof Navigator !== 'undefined' && Navigator.invalidate) Navigator.invalidate(this);
    this.buildTerrain();
    return true;
  }
  prepare(mapType, seed) { return this.setMapType(mapType, seed); }

  buildTerrain() {
    const t0 = performance.now();
    // thời gian từng bước (ms) -> this.buildSteps + 1 dòng [MAP] trong Console: biết bước nào nặng mà tối ưu
    const steps = [];
    let tl = t0;
    const lap = (name) => { const n = performance.now(); steps.push([name, Math.round(n - tl)]); tl = n; };
    this.map = MapGen.get(this.mapType, this.seed);
    this.segments = this.map.res;
    this.heightData = new Float32Array(this.map.heights);
    lap('mapgen');
    this.applyAtmosphere();
    lap('atmosphere');
    // Fast boot: mặt đất và các lớp chi tiết đều dựng bất đồng bộ theo từng nhịp nhỏ dưới nền
    // để không chặn luồng chính hay làm giật video / hoạt ảnh gõ chữ của Chỉ huy.
    this.built = true;
    this.detailsReady = false;
    this.buildMs = Math.round(performance.now() - t0);
    this.buildSteps = steps;
    this.buildTerrainDetailsAsync();
    return;

    /* Đường dựng đồng bộ cũ giữ lại làm tài liệu/tham chiếu cho các trang lab. */
    this.buildRoads();
    // đô thị: vỉa hè + bó vỉa bo góc, mảng nhựa ngã tư, vạch qua đường, kè kênh (streetscape.js)
    if (typeof Streetscape !== 'undefined') this.streetscape = Streetscape.build(this);
    lap('roads');
    this.buildWater();
    lap('water');
    // Cảnh nền ngoài bản đồ: vành núi, bờ biển / biển cát / dãy núi, đảo xa tới chân trời (không còn khoảng trống ngoài mép)
    if (typeof Backdrop !== 'undefined') {
      this.backdrop = Backdrop.build(this);
      if (this.backdrop) this.group.add(this.backdrop.group);
    }
    lap('backdrop');
    this.buildRocks();
    this.buildBridges();   // + hệ thống phá hủy cảnh vật (EnvDamage): đá tảng có máu, cầu sập, vết đạn tích tụ
    this.buildBushes();
    lap('rocks+bridges+bushes');

    const ground = (x, z) => this.groundAtRaw(x, z);
    if (SHL.length && typeof Strongholds !== 'undefined') {
      // ụ đất / lớp đất phủ mái dùng chung shader + ảnh nền với mặt đất -> màu cứ điểm khớp màu địa hình từng map
      this.strongholdSet = new Strongholds.StrongholdSet(this.group, SHL, {
        mapType: this.mapType, groundAt: ground, sun: this.map.sun, boulders: this.boulders,
        groundMaterial: o => this.groundLikeMaterial(o), worldSize: [this.width, this.depth], leafColors: this.leafColors()
      });
      // trời mưa: lòng hầm (sàn hạ thấp 2,5 m, chỗ trũng nhất) ngập nước
      if (this.weather && this.weather.rain && this.strongholdSet.setFlood) this.strongholdSet.setFlood(this.weather.flood, Weather.floodMaterial(true, Strongholds.S));
    }
    lap('strongholds');
    // Công trình bối cảnh giữa 3 cứ điểm (bệ phóng hạt nhân, hầm sinh học, trận địa phòng không)
    if ((this.map.landmarks || []).length && typeof Landmarks !== 'undefined') this.landmarkSet = new Landmarks.LandmarkSet(this.group, this.map.landmarks, { groundAt: ground, sun: this.map.sun, terrain: this });
    lap('landmarks');
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
    lap('buildings+trees');

    // Hàng rào, ruộng, xác xe, bao cát (props.js)
    if (typeof Props !== 'undefined' && this.map.props) this.propSet = new Props.PropSet(this, this.map.props);
    lap('props');

    // Sóng xung kích bom tiền oanh tạc: phá hủy, sập nứt công trình và quật đổ cây cối quanh hố bom trước khi vào trận
    this.prebakeCraterDamage();
    lap('crater_shockwave');

    // Cỏ 3D + đá vụn quanh camera (rải theo vùng nhìn thấy, xem GroundCover.update)
    if (typeof GroundCover !== 'undefined' && typeof GroundShader !== 'undefined') this.groundCover = new GroundCover.Cover(this);
    lap('groundcover');
    this.optimizeStaticScene();
    lap('optimize');
    this.renderPrecomputedMap();
    lap('minimap');
    this.built = true;
    this.buildMs = Math.round(performance.now() - t0);
    this.buildSteps = steps;
    console.info(`[MAP] Dựng ${this.mapType} #${this.seed}: ${this.buildMs} ms — ` + steps.filter(s => s[1] >= 5).map(s => s[0] + ' ' + s[1]).join(' · '));
  }

  buildTerrainDetailsAsync() {
    const token = this._detailToken = (this._detailToken || 0) + 1;
    this.previewReady = false;
    const alive = () => token === this._detailToken && this.built && this.group;
    const ground = (x, z) => this.groundAtRaw(x, z);
    const SHL = this.map.strongholds || [];
    const steps = [
      ['ground_mesh', () => {
        if (SHL.length && typeof Strongholds !== 'undefined') Strongholds.carveHeights(this.heightData, this.segments, this.width, SHL);
        this.initTerrainMesh();
      }],
      ['landmarks_water', () => {
        this.buildWater();
        if ((this.map.landmarks || []).length && typeof Landmarks !== 'undefined')
          this.landmarkSet = new Landmarks.LandmarkSet(this.group, this.map.landmarks, { groundAt: ground, sun: this.map.sun, terrain: this });
      }],
      ['strongholds_backdrop', () => {
        if (SHL.length && typeof Strongholds !== 'undefined') {
          this.strongholdSet = new Strongholds.StrongholdSet(this.group, SHL, {
            mapType: this.mapType, groundAt: ground, sun: this.map.sun, boulders: this.boulders,
            groundMaterial: o => this.groundLikeMaterial(o), worldSize: [this.width, this.depth], leafColors: this.leafColors(),
            deferWrecks: true   // xác xe quanh cứ điểm dựng từng chiếc ở bước 'stronghold_wrecks' (mỗi chiếc ~0,5-1 s)
          });
          // trời mưa: lòng hầm (sàn hạ thấp 2,5 m, chỗ trũng nhất) ngập nước (như đường dựng đồng bộ cũ)
          if (this.weather && this.weather.rain && this.strongholdSet.setFlood) this.strongholdSet.setFlood(this.weather.flood, Weather.floodMaterial(true, Strongholds.S));
        }
        if (typeof Backdrop !== 'undefined') {
          this.backdrop = Backdrop.build(this);
          if (this.backdrop) this.group.add(this.backdrop.group);
        }
      }],
      ['stronghold_wrecks', () => {
        if (this.strongholdSet && this.strongholdSet.stepWrecks && !this.strongholdSet.stepWrecks(1)) return false;
      }],
      ['roads', () => {
        this.buildRoads();
        this.previewReady = true;
        if (typeof window !== 'undefined' && window.matchmakingController && typeof window.matchmakingController.onPreviewReady === 'function') {
          try { window.matchmakingController.onPreviewReady(); } catch (e) {}
        }
        if (this.reconOnly) {
          this.optimizeStaticScene();
          this.detailsReady = true;
          steps.length = 0;
        }
      }],
      ['streetscape', () => {
        if (typeof Streetscape !== 'undefined') this.streetscape = Streetscape.build(this);
      }],
      ['rocks', () => this.buildRocks()],
      ['bridges', () => this.buildBridges()],
      ['bushes', () => this.buildBushes()],
      ['bunkers_trees', () => {
        if (typeof Destructibles === 'undefined') return;
        Destructibles.withSeed((this.seed ^ 0x5eed1234) >>> 0, () => {
          this.bunkerSet = new Destructibles.BunkerSet(this.group, this.map.bunkers, ground);
          this.horseshoeForts = this.bunkerSet.items.map(k => k.fort);
          this.trees = new Destructibles.TreeField(this.group, this.map.trees, (x, z) => this.surfaceAt(x, z, true));
          this.trees.solidHit = (ax, ay, az, bx, by, bz) => !!this.buildingSegmentHit(ax, ay, az, bx, by, bz);
          this.palmTrees = this.trees.items;
        });
      }],
      ['buildings', () => {
        if (typeof Destructibles === 'undefined') return;
        Destructibles.withSeed((this.seed ^ 0x5eed5678) >>> 0, () => {
          this.buildingSet = new Destructibles.BuildingSet(this.group, this.map.buildings, (x, z) => this.surfaceAt(x, z, true), { defer: true });
        });
      }],
      ['building_instances', () => {
        if (!this.buildingSet) return;
        if (!this.buildingSet.stepBuild(5)) return false;
        this.buildings = this.buildingSet.items.map(b => b.entry);
      }],
      ['props', () => { if (typeof Props !== 'undefined' && this.map.props) this.propSet = new Props.PropSet(this, this.map.props); }],
      ['craters_cover', () => {
        this.prebakeCraterDamage();
        if (typeof GroundCover !== 'undefined' && typeof GroundShader !== 'undefined') this.groundCover = new GroundCover.Cover(this);
      }],
      ['finish', () => {
        this.optimizeStaticScene();
        this.renderPrecomputedMap();
        this.detailsReady = true;
        if (typeof Navigator !== 'undefined' && Navigator.invalidate) Navigator.invalidate(this);
        console.info(`[MAP] Chi tiết ${this.mapType} #${this.seed} đã dựng xong dưới nền`);
      }]
    ];
    this._pendingDetailSteps = steps;
    this._detailAlive = alive;
    const next = () => {
      if (!alive()) return;
      const step = steps[0];
      if (!step) return;
      const t0 = performance.now();
      let done = true;
      try { done = step[1]() !== false; } catch (e) { console.warn('[MAP] ' + step[0], e); }
      if (done) steps.shift();
      const ms = Math.round(performance.now() - t0);
      if (ms >= 8) console.info(`[MAP] ${step[0]} ${ms} ms`);
      setTimeout(next, 24);
    };
    setTimeout(next, 16);
  }

  /**
   * Dựng nốt NGAY (đồng bộ) các bước chi tiết còn chờ của buildTerrainDetailsAsync. Gọi lúc vào trận (startMatchWithSlots):
   * chọn điểm hồi sinh, cờ cứ điểm (CapturePointsManager), hòm tiếp tế, xe bia các phòng thử... đọc nhà / cây / boong-ke / cứ
   * điểm / vật cản ngay lúc đó — trước đây vào trận sớm (phòng thử, trận ghép nhanh) thì các phần này chưa có: cờ rơi về toạ độ
   * mặc định, xe hồi sinh lọt vào nhà, làng phòng thử tầm bắn thành tâm bản đồ. Trận thường đã dựng xong trong lúc tìm trận
   * -> không tốn gì
   */
  finishDetailsNow() {
    const steps = this._pendingDetailSteps;
    if (!steps || this.detailsReady || (this._detailAlive && !this._detailAlive())) return;
    const t0 = performance.now();
    while (steps.length) {
      const step = steps[0];
      let done = true;
      try { done = step[1]() !== false; } catch (e) { console.warn('[MAP] ' + step[0], e); }
      if (done) steps.shift();
    }
    console.info(`[MAP] Dựng nốt chi tiết ngay lúc vào trận: ${Math.round(performance.now() - t0)} ms`);
  }

  // Tính toán trước sóng xung kích bom đạn tiền oanh tạc:
  // Tái sử dụng hệ thống phá hủy vật lý của game để tác động lên nhà cửa, cây cối, xe cộ quanh hố bom
  prebakeCraterDamage() {
    if (!this.map) return;
    const craters = [];
    for (const sh of this.map.strongholds || []) {
      for (const c of sh.craters || []) craters.push(c);
    }
    if (this.map.props && this.map.props.craters) {
      for (const c of this.map.props.craters) craters.push(c);
    }
    if (!craters.length) return;

    // Tối ưu hóa: Chỉ tính toán sóng xung kích cho tối đa 8 hố bom gần công trình xây dựng nhất
    const blds = this.map.buildings || [];
    const targetCraters = [];
    for (const c of craters) {
      let nearBuilding = false;
      for (const b of blds) {
        if (Math.hypot(c.x - b.x, c.z - b.z) < 95) {
          nearBuilding = true;
          break;
        }
      }
      if (nearBuilding) targetCraters.push(c);
      if (targetCraters.length >= 8) break;
    }

    for (const c of targetCraters) {
      const cy = this.getElevationAt(c.x, c.z);
      const power = Math.max(2.8, (c.d || 8) * 0.45);

      if (this.buildingSet) {
        try {
          this.buildingSet.damageAt(c.x, cy, c.z, 'HE', true, null, { power });
        } catch (e) {}
      }
      if (this.trees) {
        try {
          this.trees.damageAt(c.x, cy, c.z, 'HE', true, null);
        } catch (e) {}
      }
      if (this.propSet) {
        try {
          this.propSet.damageAt(c.x, cy, c.z, 'HE', true, null);
        } catch (e) {}
      }
    }
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
      DESERT: { zenith: 0x4a86cc, horizon: 0xd6dbd6, fog: 0xd5cfbd, density: 0.00014, ground: 0xb08a5a, sunK: 1.08, skyK: 0.9 },
      URBAN: { zenith: 0x5c7fa8, horizon: 0xc4c6c4, fog: 0xb9bcbc, density: 0.00018, ground: 0x6a6a64, sunK: 0.95, skyK: 0.88 },
      JUNGLE: { zenith: 0x5d8fb5, horizon: 0xb9cbb6, fog: 0xa9b7a2, density: 0.00022, ground: 0x4a4a32, sunK: 0.94, skyK: 1.06 },
      HIGHLAND: { zenith: 0x3f7cc4, horizon: 0xc9d8e4, fog: 0xbfcfdc, density: 0.00012, ground: 0x6b6450, sunK: 1.04, skyK: 0.96 },
      RIVER_LAKE: { zenith: 0x4c8bd0, horizon: 0xd2dfe4, fog: 0xc6d6da, density: 0.00016, ground: 0x5a6040, sunK: 1.0, skyK: 1.0 }
    };
    const p = Object.assign({}, PAL[this.mapType] || PAL.DESERT);
    // Thời tiết theo hạt giống bản đồ (mọi máy giống nhau) — xem Weather.forMap
    const W = this.weather = typeof Weather !== 'undefined' ? Weather.forMap(this.mapType, this.seed) : { rain: false };
    // Giờ vàng / sáng sớm: chân trời ấm hơn, trời đậm hơn (trời mưa: mây kín, không còn nắng vàng)
    const warm = W.rain ? 0 : sun.timeOfDay === 'golden' ? 0.55 : sun.timeOfDay === 'morning' ? 0.25 : 0;
    const mix = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t).getHex();
    // (sương chỉ ngả ấm nhẹ: sương cam đậm làm cả nửa dưới bầu trời và cảnh xa vàng ệch)
    if (warm) { p.horizon = mix(p.horizon, 0xf0b888, warm * 0.45); p.fog = mix(p.fog, 0xe8c8a8, warm * 0.3); p.zenith = mix(p.zenith, 0x35558f, warm * 0.35); }
    p.sun = sun;
    // Hướng mặt trời (từ mặt đất nhìn lên mặt trời)
    p.sunDir = new THREE.Vector3(Math.cos(sun.elevation) * Math.sin(sun.azimuth), Math.sin(sun.elevation), Math.cos(sun.elevation) * Math.cos(sun.azimuth)).normalize();
    const elevK = Math.min(1, sun.elevation / 0.9);
    p.sunColor = new THREE.Color(0xffe2b0).lerp(new THREE.Color(0xfff6e8), elevK).getHex();
    // Tổng ánh sáng trên mặt đất phẳng giữa trưa ~1.5 (cũ ~2.2 -> nền sáng bị cắt trắng / lá cây xanh neon).
    // Nắng trực tiếp chiếm phần lớn, ánh trời tán xạ ít hơn: vùng bóng còn ~35% vùng nắng (trước ~45-50% -> cảnh phẳng
    // như trời âm u, khối nhà / xe không nổi). Bóng vẫn có sắc trời xanh nhạt (ánh trời), không đen kịt
    p.sunIntensity = (0.75 + 0.25 * elevK) * p.sunK * 1.2;
    p.skyIntensity = (0.68 + 0.1 * elevK) * p.skyK * 0.78;
    p.ambientIntensity = 0.08;
    // bóng mây trôi: độ đậm (phần nắng bị che) & ngưỡng độ phủ — sa mạc trời quang ít mây, rừng / sông hồ mây nhiều
    const CL = { DESERT: [0.3, 0.66], URBAN: [0.4, 0.6], JUNGLE: [0.45, 0.56], HIGHLAND: [0.4, 0.6], RIVER_LAKE: [0.42, 0.58] }[this.mapType] || [0.4, 0.6];
    p.cloudK = CL[0]; p.cloudCover = CL[1];
    if (W.rain) {
      // MƯA: mây xám kín trời, nắng trực tiếp yếu hẳn (bóng đổ nhạt, tản), ánh trời tán xạ chiếm phần lớn, sương mù
      // dày theo màn mưa -> tầm nhìn hạn chế; không còn bóng mây trôi (mây phủ đều)
      p.zenith = W.zen; p.horizon = W.hor; p.fog = W.fog; p.ground = W.ground;
      p.density = W.dens * (0.85 + 0.25 * W.intensity);
      p.sunColor = 0xd9dee4;
      p.sunIntensity *= 0.26;
      p.skyIntensity *= 1.55;
      p.ambientIntensity = 0.12;
      p.cloudK = 0;
      p.overcast = 1;
      // mây đen giông (W.storm): vòm trời sẫm hẳn (sky.js), ánh sáng cảnh chỉ giảm nhẹ để xe địch vẫn nhìn rõ
      p.storm = W.storm || 0;
      p.sunIntensity *= 1 - 0.3 * p.storm;
      p.skyIntensity *= 1 - 0.1 * p.storm;
      // ánh sáng mây mù đổ từ trên cao xuống: hướng sáng chính gần đỉnh đầu (~72°) -> không còn vệt nắng loá trên mặt nước /
      // vũng khi nhìn ngược hướng mặt trời thấp, bóng đổ ngắn & nhạt như trời âm u thật
      const el = 1.25;
      p.sunDir = new THREE.Vector3(Math.cos(el) * Math.sin(sun.azimuth), Math.sin(el), Math.cos(el) * Math.cos(sun.azimuth)).normalize();
    }
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
      GroundShader.apply(mat, { mapType: this.mapType, macroCanvas: this.groundCanvas, water: this.hasWater(), terrain: this });
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
    // cây dò tia BVH dựng sẵn ngay lúc tải bản đồ (ngắm theo chuột / dò mặt đất 30 lần/s: trước đây thử từng tam giác)
    this.terrainMesh.userData.bvhLarge = true;
    if (typeof window !== 'undefined' && window.RaycastBVH && RaycastBVH.prebuild) RaycastBVH.prebuild(this.terrainMesh);
    this.mesh = this.terrainMesh;
    this.group.add(this.terrainMesh);
  }

  // Vật liệu "mặt đất" cho khối đắp đất nằm trên địa hình (ụ đất cứ điểm): cùng shader nhiều lớp + ảnh màu nền
  // với lưới địa hình (lưới phải có uv theo tọa độ bản đồ: u = 0.5 + x / width, v = 0.5 - z / depth),
  // nhưng sáng tối theo pháp tuyến riêng của lưới. null nếu không có GroundShader.
  groundLikeMaterial(o = {}) {
    if (typeof GroundShader === 'undefined' || !this.groundTexture) return null;
    const mat = new THREE.MeshStandardMaterial({ map: this.groundTexture, roughness: this.mapType === 'URBAN' ? 0.82 : 0.95, metalness: 0.0, vertexColors: !!o.vertexColors });
    GroundShader.apply(mat, { mapType: this.mapType, macroCanvas: this.groundCanvas, water: this.hasWater(), terrain: this, ownNormals: true });
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
    // ~3.5 đơn vị / điểm ảnh như bản đồ 3600 cũ (1024 px)
    // Nền nhiễu địa hình biến thiên mượt tính ở 512px (~18ms), sau đó phóng mượt lên 2048px để vẽ đường/sân bê tông/cứ điểm sắc nét tuyệt đối
    const SZ = Math.min(2048, Math.round(this.width / 3600 * 4) * 256);
    const BG_SZ = 512;
    const cv = document.createElement('canvas');
    cv.width = cv.height = SZ;
    const ctx = cv.getContext('2d');
    const bgCv = document.createElement('canvas');
    bgCv.width = bgCv.height = BG_SZ;
    const bgCtx = bgCv.getContext('2d');
    const img = bgCtx.createImageData(BG_SZ, BG_SZ);
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
    for (let py = 0; py < BG_SZ; py++) {
      const wz = (py + 0.5) / BG_SZ * this.depth - half;
      const gz = (wz + half) / cell;
      const iz = Math.min(N - 2, Math.max(0, Math.floor(gz))), fz = gz - iz;
      for (let px = 0; px < BG_SZ; px++) {
        const wx = (px + 0.5) / BG_SZ * this.width - half;
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
        const k = (py * BG_SZ + px) * 4;
        D[k] = Math.min(255, r * shade); D[k + 1] = Math.min(255, g * shade); D[k + 2] = Math.min(255, b * shade); D[k + 3] = 255;
      }
    }
    bgCtx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(bgCv, 0, 0, SZ, SZ);
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
    // Lối vào cửa hầm cứ điểm: rãnh thoát nước đất ẩm sẫm hai bên + vai sỏi đầm dọc đường vào; nền sỏi viền quanh sân phễu
    const gravel = { DESERT: '#a8977a', URBAN: '#807e78', JUNGLE: '#6f6b58', HIGHLAND: '#8a8573', RIVER_LAKE: '#827d69' }[this.mapType] || '#8a8573';
    const ditch = { DESERT: '#94795a', URBAN: '#5e5c52', JUNGLE: '#3e3a26', HIGHLAND: '#5f5a44', RIVER_LAKE: '#55513a' }[this.mapType] || '#5f5a44';
    const portalRoads = M.roads.filter(rd => rd.portal);
    for (const rd of portalRoads) stroke(rd, rd.width + 48, ditch);
    for (const rd of M.roads) { const s = style[rd.kind] || style.dirt; stroke(rd, rd.width + 14, s.edge); }
    for (const rd of portalRoads) stroke(rd, rd.width + 16, gravel);
    for (const rd of M.roads) { const s = style[rd.kind] || style.dirt; stroke(rd, rd.width, s.base); }
    if (portalRoads.length && typeof MapGen !== 'undefined' && MapGen.portalHalf) {
      const PT = MapGen.PORTAL;
      ctx.fillStyle = gravel;
      for (const c of M.strongholds || []) for (const sg of [1, -1]) {
        const fx = Math.cos(c.angle), fz = Math.sin(c.angle);
        const W = (f, r) => [toPx(c.x + fx * sg * f - fz * r), toPx(c.z + fz * sg * f + fx * r)];
        ctx.beginPath();
        const side = [];
        for (let f = PT.END - 2; f <= PT.NECK_F + 6; f += 6) side.push(f);
        side.forEach((f, i) => { const p = W(f, MapGen.portalHalf(f) + 12); i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); });
        for (let i = side.length - 1; i >= 0; i--) { const p = W(side[i], -(MapGen.portalHalf(side[i]) + 12)); ctx.lineTo(p[0], p[1]); }
        ctx.closePath(); ctx.fill();
      }
    }
    ctx.setLineDash([]);
    // Nước (mặt nước 3D phủ lên, đây là màu đáy nhìn qua)
    if (M.river) {
      ctx.strokeStyle = '#3d4a3c';
      BattleTerrain3D.strokeRiver(ctx, M.river, toPx, sc);
      for (const L of M.lakes) { ctx.fillStyle = '#3d4a3c'; ctx.beginPath(); ctx.arc(toPx(L.x), toPx(L.z), L.r * sc, 0, 6.283); ctx.fill(); }
    }
    // Nền bê tông dưới boong-ke
    for (const k of M.bunkers) { ctx.fillStyle = 'rgba(110,106,96,0.55)'; ctx.beginPath(); ctx.arc(toPx(k.x), toPx(k.z), 62 * sc, 0, 6.283); ctx.fill(); }
    // Sân bê tông / đường đất trong khu công trình bối cảnh
    if (M.landmarks && M.landmarks.length && typeof Landmarks !== 'undefined') Landmarks.paintGround(ctx, M.landmarks, toPx, sc);
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
    // vẽ theo hệ 128 x 256 nhưng canvas x4 (512 x 1024): đường phố 9-15 m mỗi px ~2-3 cm, hết nhoè mảng
    const RS = 4;
    c.width = 128 * RS; c.height = 256 * RS;
    const g = c.getContext('2d');
    g.scale(RS, RS);
    const sp = (n, cols, s0, s1) => { for (let i = 0; i < n; i++) { g.fillStyle = cols[i % cols.length]; const s = s0 + Math.random() * (s1 - s0); g.fillRect(Math.random() * 128, Math.random() * 256, s, s); } };
    // biến thể nhựa đô thị theo số làn (map_gen: road.lanes): asphalt4 = đại lộ 4 làn (vạch vàng đôi giữa, vạch trắng
    // đứt phân làn), asphalt0 = ngõ không kẻ vạch
    if (kind === 'asphalt4' || kind === 'asphalt0') {
      g.fillStyle = '#3f3e3c'; g.fillRect(0, 0, 128, 256);
      sp(9000, ['rgba(20,20,22,0.3)', 'rgba(120,120,118,0.22)'], 0.3, 0.8);
      if (kind === 'asphalt4') {
        for (const x of [16, 48, 80, 112]) {
          const gr = g.createLinearGradient(x - 9, 0, x + 9, 0);
          gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, 'rgba(22,22,24,0.22)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
          g.fillStyle = gr; g.fillRect(x - 9, 0, 18, 256);
        }
        g.fillStyle = 'rgba(220,214,190,0.85)'; g.fillRect(3, 0, 2, 256); g.fillRect(123, 0, 2, 256);
        g.fillStyle = 'rgba(232,196,90,0.9)'; g.fillRect(60, 0, 2, 256); g.fillRect(66, 0, 2, 256);
        g.fillStyle = 'rgba(225,220,200,0.85)';
        for (const y of [0, 128]) { g.fillRect(31, y, 2, 40); g.fillRect(95, y, 2, 40); }
      } else {
        // ngõ: vệt bánh xe máy giữa ngõ, nắp cống thoát nước
        const gr = g.createLinearGradient(50, 0, 78, 0);
        gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, 'rgba(26,26,28,0.2)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(50, 0, 28, 256);
      }
      sp(2400, ['rgba(60,62,65,0.8)'], 0.3, 0.9);
    } else if (kind === 'asphalt') {
      // Chỉ hạt nhựa + vạch kẻ (theo UV); ổ gà / vá / vết dầu / nứt rải theo tọa độ thế giới trong shader -> không lặp
      g.fillStyle = '#3f3e3c'; g.fillRect(0, 0, 128, 256);
      sp(9000, ['rgba(20,20,22,0.3)', 'rgba(120,120,118,0.22)'], 0.3, 0.8);
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
        sp(2400, ['rgba(60,62,65,0.8)'], 0.3, 0.9);
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
    if (kind.startsWith('asphalt')) {
      // cốt liệu mịn ở độ phân giải gốc: đá dăm sáng / bitum tối lấm tấm 1-2 px
      g.setTransform(1, 0, 0, 1, 0, 0);
      for (let i = 0; i < 90000; i++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(18,18,18,0.28)' : 'rgba(150,148,142,0.22)'; g.fillRect(Math.random() * c.width, Math.random() * c.height, 1 + Math.random(), 1 + Math.random()); }
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    BattleTerrain3D._roadTex[key] = t;
    return t;
  }

  buildRoads() {
    const byKind = {};
    const wet = this.hasWater();
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
          for (let q = 0; q < 4; q++) {
            const ux = q < 2 ? (q ? -3 : 3) : 0, uz = q < 2 ? 0 : (q === 2 ? 3 : -3);
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
      // nhựa đô thị: nhóm theo số làn kẻ vạch (đại lộ 4 làn / ngõ không vạch / còn lại 2 làn)
      const rk = rd.kind === 'asphalt' && (rd.lanes === 4 || rd.lanes === 0) ? 'asphalt' + rd.lanes : rd.kind;
      (byKind[rk] || (byKind[rk] = [])).push({ P, UV, I, NR, ri });
    });
    // Ngã giao: đỉnh nằm trên lòng đường khác -> rdJ ~ 1, shader xóa vạch sơn / vệt bánh ở đó (vạch không chạy xuyên ngã tư)
    const HB = 64, segs = new Map(), hk = (i, j) => i * 100003 + j;
    this.map.roads.forEach((rd, ri) => {
      for (let i = 0; i < rd.pts.length - 1; i++) {
        const a = rd.pts[i], b = rd.pts[i + 1];
        const k = hk(Math.floor((a[0] + b[0]) / 2 / HB), Math.floor((a[1] + b[1]) / 2 / HB));
        if (!segs.has(k)) segs.set(k, []);
        // [tuyến, đầu x, đầu z, vectơ đoạn x, z, độ dài², nửa bề rộng, (nửa bề rộng + 3)² — ngoài đó trọng số = 0]
        const ex = b[0] - a[0], ez = b[1] - a[1], hw = rd.width / 2;
        segs.get(k).push([ri, a[0], a[1], ex, ez, ex * ex + ez * ez || 1, hw, (hw + 3) * (hw + 3)]);
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
          for (let q = 0; q < list.length; q++) {
            const s = list[q];
            if (s[0] === p.ri) continue;
            const ex = s[3], ez = s[4];
            let t = ((x - s[1]) * ex + (z - s[2]) * ez) / s[5];
            t = t < 0 ? 0 : t > 1 ? 1 : t;
            const qx = x - s[1] - ex * t, qz = z - s[2] - ez * t, d2 = qx * qx + qz * qz;
            if (d2 >= s[7]) continue;   // xa hơn mép đường + 3: trọng số 0 (khỏi khai căn)
            const w = 1 - Math.max(0, Math.min(1, (Math.sqrt(d2) - (s[6] - 3)) / 6));
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
        map: this.roadTexture(kind), roughness: kind.startsWith('asphalt') ? 0.78 : 0.97, metalness: 0,
        polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3
      });
      this.roadShader(m, kind.startsWith('asphalt') ? 'asphalt' : kind);
      if (typeof ExplosionFX !== 'undefined' && ExplosionFX.installGroundHoles) ExplosionFX.installGroundHoles(m);
      const mesh = new THREE.Mesh(g, m);
      mesh.receiveShadow = true;
      mesh.name = 'road_' + kind;
      this.group.add(mesh);
    }
  }

  // Chống lặp mặt đường: texture UV chỉ giữ hạt + vạch kẻ / vệt bánh; ổ gà, mảng vá, vết dầu, vũng nước, nứt,
  // độ sáng tầng thấp và mép đường lởm chởm đều tính theo tọa độ thế giới + hash -> mỗi đoạn đường một khác
  // junction: mảng nhựa lòng ngã tư (streetscape) dùng chung shader mặt đường -> hạt, tông loang, bụi, nứt liền mạch qua
  // mép ngã tư; không có mép đường (không cắt mép / không dải rãnh), không có vạch
  roadShader(m, kind, junction) {
    const desert = this.mapType === 'DESERT';
    const C = {
      // (nhựa phố sẫm hơn chút: tách rõ khỏi vỉa hè / bãi đất, không thành một mảng xám đều)
      asphalt: { cell: 11, prob: this.mapType === 'URBAN' ? 0.22 : 0.6, e0: 0.006, ea: 0.022, cr: 0.02, tint: this.mapType === 'URBAN' ? [0.73, 0.73, 0.75] : [0.8, 0.8, 0.82], hole: 0.5, puddle: 0.5 },
      dirt: { cell: 9, prob: 0.45, e0: 0.02, ea: 0.09, cr: 0.05, tint: desert ? [1.08, 1.04, 0.95] : [0.84, 0.88, 0.72], hole: 0.62, puddle: desert ? 0.0 : 0.35 },
      gravel: { cell: 9, prob: 0.45, e0: 0.018, ea: 0.08, cr: 0.05, tint: [0.88, 0.9, 0.8], hole: 0.66, puddle: 0.25 },
      mud: { cell: 8, prob: 0.6, e0: 0.02, ea: 0.1, cr: 0.06, tint: [0.8, 0.86, 0.68], hole: 0.55, puddle: 1.0 }
    }[kind] || null;
    if (!C) return;
    const f = v => (+v).toFixed(4);
    const defs = `#define RD_CELL ${f(C.cell)}\n#define RD_PROB ${f(C.prob)}\n#define RD_E0 ${f(C.e0)}\n#define RD_EA ${f(C.ea)}\n#define RD_CR ${f(C.cr)}\n` +
      `#define RD_TINT vec3(${C.tint.map(f).join(',')})\n#define RD_HOLE ${f(C.hole)}\n#define RD_PUDDLE ${f(C.puddle)}\n` + (kind === 'asphalt' ? '#define RD_ASPHALT\n' : '') + (kind === 'asphalt' && this.mapType === 'URBAN' ? '#define RD_CURB\n' : '') + (junction ? '#define RD_JUNC\n' : '') +
      // lượng vũng khi mưa: đường đất / bùn đọng nhiều, sỏi thoát nước, sa mạc cát thấm nhanh
      `#define RD_RAIN ${f({ asphalt: 0.8, dirt: desert ? 0.35 : 1.0, gravel: 0.5, mud: 1.3 }[kind] || 0.6)}\n`;
    const rain = typeof Weather !== 'undefined' && Weather.glsl;
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
  float rdWet = 0.0, rdPaint = 0.0, rdAlli = 0.0;
  {
    // Ngã giao: đường nhựa lấy texture trơn (không vạch sơn) thay cho vạch; mọi loại: mép không lởm chởm đè lên lòng đường kia
    float rdJn = smoothstep(0.3, 0.8, vRdJ);
#ifdef RD_ASPHALT
#ifndef RD_JUNC
    diffuseColor.rgb = mix(diffuseColor.rgb, mapTexelToLinear(texture2D(rdPlain, vUv)).rgb, rdJn);
#endif
#endif
#ifdef RD_ASPHALT
    // vạch sơn (texel sáng / vàng hẳn so với nhựa ~0,25; texture đường giữ hệ sRGB) — đánh dấu trước khi các lớp bẩn / loang làm đổi tông
    rdPaint = smoothstep(0.45, 0.6, max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b)));
#endif
    // Mép đường lởm chởm theo nhiễu (không thẳng tắp), dải sát mép ngả màu nền (cỏ / cát / bụi)
#ifdef RD_JUNC
    float rdE = 0.5;
#else
    float rdE = min(vUv.x, 1.0 - vUv.x);
#endif
    float eN = rdN(rw * 0.07) * 0.6 + rdN(rw * 0.31 + 3.0) * 0.4;
    float rdM = rdE - (RD_E0 + RD_EA * eN) + (rdN(rw * 0.9 + 11.0) - 0.5) * RD_CR + rdJn * 0.5;
#ifdef RD_CURB
    // phố có bó vỉa: mép nhựa thẳng chạy tới chân bó vỉa (không lởm chởm lộ đất), dải rãnh thoát nước sát mép bám bụi sẫm
    rdM = rdE + rdJn * 0.5;
    diffuseColor.rgb *= mix(0.78, 1.0, max(smoothstep(0.0, 0.035, rdE), rdJn));   // trong lòng ngã tư không có bó vỉa -> không rãnh
#endif
    if (rdM < 0.0) discard;
#ifndef RD_CURB
    diffuseColor.rgb *= mix(RD_TINT, vec3(1.0), smoothstep(0.0, 0.07, rdM));
#endif
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
        if (ins > rdPatch) { rdPatch = ins; rdTone = rdH(cid + 9.9) < 0.6 ? 0.84 : 1.07; }
        rdMul *= 1.0 - 0.16 * (1.0 - smoothstep(0.0, 0.07, abs(sd)));
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
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * rdTone * (0.94 + 0.12 * rdN(rw * 0.6)), rdPatch);
    // nứt mạng theo đường đồng mức nhiễu, chỉ ở vài vùng, mờ dần khi ở xa (khỏi nhấp nháy)
    vec2 cq = rw * 0.16 + (vec2(rdN(rw * 0.9), rdN(rw * 0.9 + 5.3)) - 0.5) * 0.7;
    float c1 = abs(rdN(cq) - 0.5), c2 = abs(rdN(cq * 2.7 + 13.0) - 0.5);
    float cw = 0.012 + 0.02 * rdFar;
    float crack = max(1.0 - smoothstep(0.0, cw, c1), (1.0 - smoothstep(0.0, cw * 0.8, c2)) * 0.7);
    crack *= smoothstep(0.52, 0.68, rdN(rw * 0.02 + 3.0)) * (1.0 - rdFar);
    rdMul *= 1.0 - 0.38 * crack;
    // cốt liệu đá dăm: hạt sáng tối lấm tấm ~3-6 cm gần máy quay (mờ dần ra xa tránh nhấp nháy), mặt nhựa không nhoè mảng
    float ag = rdH(floor(rw * 2.6)) * 0.6 + rdH(floor(rw * 5.3) + 17.0) * 0.4;
    diffuseColor.rgb *= 1.0 + (ag - 0.5) * 0.22 * (1.0 - smoothstep(0.1, 0.45, rdFar));
    diffuseColor.rgb *= 0.93 + 0.14 * rdN(rw * 1.3 + 2.0);
#endif
    diffuseColor.rgb *= rdMul;
    // Độ sáng / sắc tầng thấp: từng quãng đường cũ mới khác nhau
    float lf = rdN(rw * 0.011) * 0.6 + rdN(rw * 0.043 + 17.0) * 0.4;
    #ifdef RD_CURB
    diffuseColor.rgb *= (0.92 + 0.16 * lf) * (0.97 + 0.06 * rdN(rw * 0.21 + 5.0));
    {
      // THÀNH PHỐ MA (bỏ hoang nhiều năm): vạch sơn bạc phai mất từng đoạn; lớp bụi đất phủ mỏng loang lổ; cát bụi + lá
      // mục dồn thành dải dọc chân bó vỉa (mép không đều); cỏ dại mọc trong vết nứt / mạch vá / rãnh; lá khô, rác vụn
      // NỨT DA CÁ SẤU (mặt nhựa mỏi, nhiều năm không bảo trì): lưới ô 15-40 cm (voronoi, biên ô uốn theo nhiễu), dày ở vệt
      // bánh xe & từng mảng lớn; mảng nhựa bong hẳn lộ lớp đá dăm móng sáng xám, sần
      vec2 vp = rw * 0.42 + (vec2(rdN(rw * 0.6), rdN(rw * 0.6 + 7.0)) - 0.5) * 0.7;
      vec2 vi = floor(vp), vf = fract(vp);
      float d1 = 8.0, d2 = 8.0;
      for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
        vec2 gq = vec2(float(i), float(j)), o = vec2(rdH(vi + gq), rdH(vi + gq + 19.1));
        float d = length(gq + o - vf);
        if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
      }
      float wheel = 1.0 - smoothstep(0.06, 0.16, abs(abs(vUv.x - 0.5) - 0.22));
      float aMask = smoothstep(0.48, 0.66, rdN(rw * 0.018 + 60.0) * 0.7 + wheel * 0.3);
      rdAlli = (1.0 - smoothstep(0.02, 0.055 + 0.05 * rdFar, d2 - d1)) * aMask * (1.0 - rdFar * 0.85);
      diffuseColor.rgb *= 1.0 - 0.5 * rdAlli;
      float spall = smoothstep(0.64, 0.69, rdN(rw * 0.09 + 80.0) * 0.6 + rdN(rw * 0.5 + 3.0) * 0.4) * (0.4 + 0.6 * aMask);
      float spRim = smoothstep(0.6, 0.64, rdN(rw * 0.09 + 80.0) * 0.6 + rdN(rw * 0.5 + 3.0) * 0.4) - spall;
      diffuseColor.rgb *= 1.0 - 0.35 * spRim;   // mép mảng bong: nhựa vỡ sẫm
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.4, 0.38, 0.34) * (0.7 + 0.55 * rdH(floor(rw * 6.0))), spall * 0.92);
      rdWet = max(rdWet, spall * 0.4 * step(0.6, rdN(rw * 0.2 + 5.0)));   // hố bong đọng nước
      vec3 dirt = vec3(0.30, 0.27, 0.22);
      float paint = smoothstep(0.45, 0.6, max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b)));
      float fade = smoothstep(0.3, 0.75, rdN(rw * 0.05 + 21.0) * 0.7 + rdN(rw * 0.6 + 4.0) * 0.3);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.2, 0.2, 0.19) * (0.9 + 0.2 * lf), paint * (0.35 + 0.55 * fade));
      float dust = smoothstep(0.4, 0.85, rdN(rw * 0.03 + 50.0) * 0.6 + rdN(rw * 0.15 + 8.0) * 0.4);
      diffuseColor.rgb = mix(diffuseColor.rgb, dirt * (0.9 + 0.2 * rdN(rw * 0.9)), 0.12 + 0.3 * dust);
      float drift = (1.0 - smoothstep(0.02, 0.07 + 0.09 * rdN(rw * 0.08 + 3.0) + 0.05 * rdN(rw * 0.5), rdE)) * (1.0 - rdJn);
      diffuseColor.rgb = mix(diffuseColor.rgb, dirt * (0.85 + 0.3 * rdN(rw * 2.0 + 1.0)), drift * 0.85);
      float weedN = rdN(rw * 0.7 + 30.0) * 0.6 + rdN(rw * 3.0 + 9.0) * 0.4;
      float weed = max(max(crack * 1.6, rdAlli * 0.9), drift * 0.9 * smoothstep(0.45, 0.7, rdN(rw * 0.12 + 77.0))) * smoothstep(0.45, 0.7, weedN);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.22, 0.09) * (0.75 + 0.5 * rdN(rw * 4.0)), clamp(weed, 0.0, 1.0) * 0.85);
      // lá khô / giấy vụn: đốm nhỏ theo ô lưới thế giới, dày hơn sát lề
      vec2 lc = floor(rw * 1.6);
      float lh = rdH(lc + 3.0);
      vec2 lo = fract(rw * 1.6) - 0.5 - (vec2(rdH(lc + 7.0), rdH(lc + 9.0)) - 0.5) * 0.5;
      float leaf = step(lh, 0.06 + 0.3 * drift) * (1.0 - smoothstep(0.12, 0.2, length(lo * vec2(1.0, 1.7)))) * (1.0 - rdFar);
      diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(0.36, 0.24, 0.12), vec3(0.5, 0.48, 0.42), step(0.8, rdH(lc + 1.0))), leaf * 0.9);
      rdWet *= 1.0 - drift * 0.5;
    }
#else
    diffuseColor.rgb *= (0.84 + 0.32 * lf) * (0.94 + 0.12 * rdN(rw * 0.21 + 5.0));
#endif
    diffuseColor.rgb *= mix(vec3(1.03, 1.0, 0.96), vec3(0.97, 0.99, 1.03), rdN(rw * 0.02 + 40.0));${rain ? `
    if (skyWetU.x > 0.0) {
      // mưa: ổ gà / chỗ lún đầy nước, vũng loang dọc vệt bánh xe & chỗ mặt đường võng (không đọng dưới gầm cầu / mái che)
      float rdOpen = skyWetU.w > 0.0 ? 1.0 - smoothstep(10.0, 16.0, skyWetTop(rw) - vRoadW.y) : 1.0;
      float rv = rdN(rw * 0.045 + 9.0) * 0.65 + rdN(rw * 0.19 + 2.0) * 0.35;
      float rut = 1.0 - smoothstep(0.05, 0.12, abs(abs(vUv.x - 0.5) - 0.2));
      float rp = smoothstep(0.6 - RD_RAIN * 0.12, 0.66 - RD_RAIN * 0.12, rv + rut * 0.12 * RD_RAIN) * min(RD_RAIN, 1.0);
      rdWet = clamp(max(rdWet * 1.8, rp), 0.0, 1.0) * rdOpen * skyWetU.x;
      diffuseColor.rgb *= 1.0 - 0.3 * rdWet;
    }` : ''}
#ifdef RD_ASPHALT
    if (rdPaint > 0.0) {
      // VẠCH SƠN NHIỆT DẺO: không phải mảng màu phẳng — hạt cát / bi thuỷ tinh lấm tấm (hạt sáng tối ~1 cm), mặt sơn sần
      // theo hạt đá nhựa bên dưới, mép vạch mòn lởm chởm, bánh xe mài tróc thành mảng nhỏ lộ nhựa sẫm
      float pg = rdH(floor(rw * 14.0)) * 0.6 + rdH(floor(rw * 31.0) + 5.0) * 0.4;
      float near = 1.0 - smoothstep(0.08, 0.5, rdFar);
      diffuseColor.rgb *= mix(1.0, 0.72 + 0.42 * pg, rdPaint * near);
      diffuseColor.rgb *= mix(1.0, 0.86 + 0.18 * rdN(rw * 2.2 + 3.0), rdPaint);
      float chip = smoothstep(0.62, 0.7, rdN(rw * 1.6 + 31.0) * 0.55 + rdN(rw * 6.5 + 2.0) * 0.3 + rdH(floor(rw * 9.0)) * 0.15);
      float edge = smoothstep(0.3, 0.9, rdPaint) ;   // mép vạch (rdPaint < 1): dễ tróc hơn
      float cn2 = rdN(rw * 1.6 + 31.0) * 0.55 + rdN(rw * 6.5 + 2.0) * 0.3 + rdH(floor(rw * 9.0)) * 0.15;
      float bare = clamp(chip + rdAlli * 1.4 + (1.0 - edge) * 0.45 * smoothstep(0.5, 0.75, rdN(rw * 5.0 + 9.0)), 0.0, 1.0);
      diffuseColor.rgb *= 1.0 + 0.18 * (smoothstep(0.55, 0.61, cn2) - chip) * rdPaint;   // mép vảy sơn bong cong lên
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.045, 0.044, 0.042) * (0.8 + 0.4 * rdN(rw * 3.0)), rdPaint * bare * 0.9);
      // bụi đường bám vào sơn (sơn trắng / vàng ngả xám)
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(0.33))) * vec3(1.0, 0.97, 0.92), rdPaint * 0.25);
    }
#endif
    diffuseColor.rgb *= 1.0 - 0.25 * rdWet;
  }`).replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  roughnessFactor *= 0.86 + 0.24 * rdN(vRoadW.xz * 0.35) - 0.12 * (1.0 - smoothstep(0.08, 0.16, abs(abs(vUv.x - 0.5) - 0.22)));
  roughnessFactor = mix(roughnessFactor, 0.92, rdPaint * 0.8);
  roughnessFactor = mix(roughnessFactor, 0.14, rdWet);`);
    };
    m.customProgramCacheKey = () => 'roadW3:' + kind + (junction ? ':j' : '') + ':' + this.mapType + (rain ? ':rain' : '');
  }

  // ---------------------------------------------------------------------------
  // NƯỚC: mặt nước gợn sóng phản chiếu bầu trời
  // ---------------------------------------------------------------------------
  // bản đồ có mặt nước (sông / hồ / kênh đào đô thị): bật mặt nước, lội nước, đáy ướt
  hasWater() { const M = this.map; return !!(M && (M.river || M.lakes.length || (M.canals && M.canals.length))); }

  // mực nước: sông hồ +0,2; kênh đào đô thị hạ thấp -5,5 (bờ kè cao ~1,2 m trên mặt nước như kênh phố thật — trước đây
  // bờ chỉ cao hơn nước ~0,5 m: gầm cầu không có chỗ, dầm cầu chìm sát mặt nước)
  get waterLevel() { const M = this.map; return M && !M.river && !(M.lakes && M.lakes.length) && M.canals && M.canals.length ? -5.5 : 0.2; }

  buildWater() {
    if (!this.hasWater()) return;
    const { mat, U } = this.waterMaterial(false);
    this.waterUniforms = U;
    const geo = new THREE.PlaneGeometry(this.width, this.depth, 1, 1);
    geo.rotateX(-Math.PI / 2);
    this.waterMesh = new THREE.Mesh(geo, mat);
    this.waterMesh.position.y = this.waterLevel;
    this.waterMesh.renderOrder = 2;
    this.group.add(this.waterMesh);
  }


  // Bản đồ pháp tuyến gợn sóng (dùng chung cho sông hồ và biển)
  waterNormalMap() {
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
    this.waterNormal = normal;
    return normal;
  }

  // Vật liệu mặt nước. sea = mặt biển ngoài bản đồ (độ sâu theo thuộc tính đỉnh aDep, xa hòa vào sương)
  waterMaterial(sea) {
    const atm = this.atmosphere;
    // Nước sông hồ thật: thân nước tối xanh rêu-xám (phù sa, tảo), không phải màu xanh dương sơn phẳng;
    // màu trời chỉ hiện ra qua phản chiếu Fresnel — nhìn xiên / xa thì sáng ánh trời, nhìn thẳng xuống thì tối trong
    const body = { DESERT: 0x26302a, JUNGLE: 0x202a1e, URBAN: 0x232c2a }[this.mapType] || 0x1e2b29;
    // biển: nước sâu trong hơn, ngả xanh lam - lục theo màu trời
    const bodyCol = sea ? new THREE.Color(0x1d3438).lerp(new THREE.Color(atm.zenith), 0.22) : new THREE.Color(body).lerp(new THREE.Color(atm.zenith), 0.12);
    const mat = new THREE.MeshStandardMaterial({
      color: bodyCol, roughness: 0.18, metalness: 0.0, transparent: true, opacity: 0.9, depthWrite: false
    });
    const skyRefl = new THREE.Color(atm.horizon).lerp(new THREE.Color(atm.zenith), 0.35).multiplyScalar(0.85);
    // Bản đồ độ sâu nước theo lưới địa hình (đơn vị game, -2..14): ven bờ nông trong & ngả màu bùn, có viền bọt
    // (biển: độ sâu lấy từ thuộc tính đỉnh aDep của lưới mặt biển, không theo lưới bản đồ)
    const S = this.segments, N = S + 1;
    let depthTex = null;
    if (!sea) {
      const dd = new Uint8Array(N * N * 4);
      for (let i = 0; i < N * N; i++) {
        const v = Math.round((Math.max(-2, Math.min(14, this.waterLevel - this.heightData[i])) + 2) / 16 * 255);
        dd[i * 4] = dd[i * 4 + 1] = dd[i * 4 + 2] = v; dd[i * 4 + 3] = 255;
      }
      depthTex = new THREE.DataTexture(dd, N, N, THREE.RGBAFormat);
      depthTex.magFilter = depthTex.minFilter = THREE.LinearFilter;
      depthTex.needsUpdate = true;
    }
    this.waterTime = this.waterTime || { value: 0 };
    const U = {
      wSky: { value: skyRefl }, wNrm: { value: this.waterNormal || this.waterNormalMap() }, wDepth: { value: depthTex }, wT: this.waterTime,
      wMap: { value: new THREE.Vector4(this.width, this.depth, S, N) },
      wShallow: { value: bodyCol.clone().lerp(new THREE.Color(0x6a6650), 0.55) },
      wFoam: { value: new THREE.Color(0xc4ccc9) },
      // phản chiếu: trời chân trời -> đỉnh theo hướng tia phản xạ; sát chân trời là bóng bờ (nhà phố / cây ven sông), không phải trời
      wHor: { value: new THREE.Color(atm.horizon).multiplyScalar(0.9) }, wZen: { value: new THREE.Color(atm.zenith).multiplyScalar(0.9) },
      wBank: { value: new THREE.Color({ URBAN: 0x3a3936, JUNGLE: 0x1c2616, DESERT: 0x5a5244 }[this.mapType] || 0x26301e) },
      wBankK: { value: sea ? 0.0 : this.mapType === 'URBAN' ? 0.85 : 0.6 },
      wSun: { value: new THREE.Vector3(atm.sunDir.x, atm.sunDir.y, atm.sunDir.z).normalize() },
      wSunK: { value: (atm.sunK !== undefined ? atm.sunK : 1) * (this.weather && this.weather.rain ? 0.25 : 1) }
    };
    const rain = typeof Weather !== 'undefined' && Weather.glsl;
    if (rain) Weather.markDry(mat);
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = 'varying vec3 vWPos;\n' + (sea ? 'attribute float aDep;\nvarying float vDep;\n' : '') + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
  vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;${sea ? '\n  vDep = aDep;' : ''}`);
      sh.fragmentShader = `uniform vec3 wSky; uniform sampler2D wNrm; uniform sampler2D wDepth; uniform float wT; uniform vec4 wMap;
uniform vec3 wShallow; uniform vec3 wFoam; varying vec3 vWPos;
uniform vec3 wHor; uniform vec3 wZen; uniform vec3 wBank; uniform float wBankK; uniform vec3 wSun; uniform float wSunK;
${sea ? 'varying float vDep;' : ''}
` + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
  // độ sâu nước tại điểm này: ven bờ màu bùn nhạt, trong hơn (thấy đáy)
  ${sea ? 'float wDep = clamp(vDep, -2.0, 14.0);' : `vec2 wuv = vec2((vWPos.x + wMap.x * 0.5) / wMap.x * wMap.z + 0.5, (vWPos.z + wMap.y * 0.5) / wMap.y * wMap.z + 0.5) / wMap.w;
  float wDep = texture2D(wDepth, wuv).r * 16.0 - 2.0;`}
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
  vec2 wg = wn0 * 0.12 + (wn1 * 0.55 + wn2 * 0.45) * 0.26 * (1.0 - wFar * 0.85) + wn3 * 0.18 * (1.0 - smoothstep(120.0, 520.0, wDist));
  wg *= 1.0 - wFar * 0.5;
  float wDrop = 0.0;${rain ? `
  if (skyWetU.x > 0.0) {
    // mưa: mặt nước lăn tăn khắp nơi + vòng sóng giọt mưa dày đặc gần máy quay, giọt vừa chạm bật đốm sáng
    wg += wn3 * 0.12 * skyWetU.x;
    if (wDist < 520.0) {
      vec3 rr = skyRainDrops(wp, skyWetU.y, skyWetU.z);
      float rk = (1.0 - wDist / 520.0) * skyWetU.x;
      wg += rr.xy * rk * 0.8;
      wDrop = rr.z * rk;
    }
    wg += skyBlastRip(wp).xy;   // sóng xung kích vụ nổ / luồng khí đầu nòng lan trên mặt nước
  }` : ''}
  normal = normalize((viewMatrix * vec4(normalize(vec3(-wg.x, 1.0, -wg.y)), 0.0)).xyz);`).replace('#include <tonemapping_fragment>', `
  {
    float fres = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 5.0);
    float refl = min(0.85, 0.02 + 0.98 * fres);
    // tia phản xạ theo toạ độ thế giới: trời sáng dần về chân trời, sát chân trời là bóng bờ tối (nhà / cây), gợn sóng
    // làm bóng bờ rung vỡ; vệt nắng lấp lánh trên đỉnh gợn
    vec3 wN = normalize(vec3(-wg.x, 1.0, -wg.y)), wV = normalize(vWPos - cameraPosition), wR = reflect(wV, wN);
    float ry = clamp(wR.y, 0.0, 1.0);
    vec3 envC = mix(wHor, wZen, sqrt(ry));
    envC = mix(envC, wBank * (0.8 + 0.4 * wn2.x), wBankK * (1.0 - smoothstep(0.03, 0.3, ry + wn1.y * 0.05)));
    gl_FragColor.rgb = mix(gl_FragColor.rgb, envC, refl);
    float glint = pow(max(dot(wR, wSun), 0.0), 420.0) * 6.0 + pow(max(dot(wR, wSun), 0.0), 40.0) * 0.12;
    gl_FragColor.rgb += vec3(1.0, 0.96, 0.88) * glint * wSunK * (1.0 - wFar * 0.6);
    gl_FragColor.a = mix(gl_FragColor.a, 1.0, fres * 0.6);
    gl_FragColor.rgb += wSky * wDrop * 0.25;
    // viền bọt ven bờ: dải mỏng lăn tăn theo gợn sóng, dày mỏng không đều
    float wf = (1.0 - smoothstep(0.35, 1.5, wDep + wn1.x * 0.45 + wn2.y * 0.25)) * smoothstep(0.1, 0.45, wDep);
    wf *= 0.55 + 0.45 * sin(wT * 1.3 + dot(wp, vec2(0.05, 0.037)));
    gl_FragColor.rgb = mix(gl_FragColor.rgb, wFoam * (0.6 + 0.4 * gl_FragColor.g / max(0.05, wFoam.g)), wf * 0.55);
    gl_FragColor.a = max(gl_FragColor.a, wf * 0.7);
  }
  #include <tonemapping_fragment>`);
      // biển xa hòa hẳn vào sương trước khi chạm mặt phẳng cắt xa của camera (không lộ mép cắt)
      if (sea) BattleTerrain3D.applyFarFade(sh, true);
    };
    mat.customProgramCacheKey = () => 'waterWorld4' + (sea ? ':sea' : '') + (rain ? ':rain' : '');
    return { mat, U };
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
    // giữ vật cản đã có từ trước (xác xe chiến trường quanh cứ điểm — dựng bất đồng bộ trước bước đá tảng): danh sách vật cản
    // được làm mới ở đầu mỗi lần dựng bản đồ
    this.boulders = (this.boulders || []).filter(b => b.wreck);
    this.rockItems = [];
    const rocks = this.map.rocks;
    if (!rocks.length) return;
    const mat = new THREE.MeshStandardMaterial({ map: this.rockTexture(), roughness: 0.9, metalness: 0.02, vertexColors: true });
    // phong hoá (gameplay/weathering.js): vệt nước mưa chảy sẫm, loang ố, rêu / địa y theo khí hậu, đất bám chân đá
    if (typeof Weathering !== 'undefined') Weathering.apply(mat, 'stone', { space: 'local', grimeH: 3.5, lift: 1.5, scale: 0.8, moss: 0.9 });
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
      const boulder = { x: r.x, z: r.z, radius: r.r * 0.9, height: r.h * 0.8 };
      if (boulder) this.boulders.push(boulder);
      // bản ghi cho EnvDamage: đá có máu, mẻ / nhỏ dần / vỡ tung theo loại đạn
      const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scale = new THREE.Vector3();
      m4.decompose(pos, quat, scale);
      this.rockItems.push({ x: r.x, z: r.z, y, r: r.r, h: r.h, im, k, pos, quat, scale, color: col, col: [col.r, col.g, col.b], boulder });
    });
    pools.forEach(im => { im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; });
  }

  buildBushes() {
    this.bushClusters = this.map.bushes.map(b => ({ x: b.x, z: b.z, radius: b.r, origR: b.r }));
    this.bushItems = [];
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
        const col = new THREE.Color(leafCol[k & 1]).multiplyScalar(0.8 + Math.random() * 0.35);
        if (Math.random() < 0.18) col.lerp(new THREE.Color(0x7d7044), 0.3 + Math.random() * 0.35);   // bụi úa vàng (nắng hạn / sâu bệnh)
        im.setColorAt(i, col);
        b.aliveCount = (b.aliveCount || 0) + 1;
        this.bushItems.push({ i, b, x, z, y: this.groundAtRaw(x, z), baseMat: m4.clone(), s, col0: col.clone(), broken: false, burnt: false });
      }
    }
    im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true;
    im.name = 'bushes';
    this.bushIM = im;
    this.group.add(im);
  }

  // Bụi rậm ngụy trang bị xe cán qua: đè bẹp dí rạp xuống đất, gãy nát, xơ xác; dập nát nhiều thì mất tác dụng che giấu
  crushBushes(x, z, radius, vx, vz, fx) {
    if (!this.bushIM || !this.bushItems || !this.bushItems.length) return;
    let hit = false;
    const P = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), M = new THREE.Matrix4();
    const leafSfx = typeof window !== 'undefined' && window.soundEngine && window.soundEngine.secondaryAt;
    for (const it of this.bushItems) {
      if (it.broken) continue;
      const d = Math.hypot(it.x - x, it.z - z);
      if (d > radius + 4) continue;
      it.broken = true;
      it.b.aliveCount = Math.max(0, (it.b.aliveCount || 1) - 1);
      if (it.b.aliveCount < 6) it.b.radius = Math.max(0, it.b.radius * 0.65);
      M.copy(it.baseMat).decompose(P, Q, S);
      // xe cán: bẹp dí sát đất (y còn 18%), xoè ngang bè ra
      S.y *= 0.18; S.x *= 1.35; S.z *= 1.35;
      P.y = it.y + 0.3;
      M.compose(P, Q, S);
      this.bushIM.setMatrixAt(it.i, M);
      const deadCol = it.col0.clone().multiplyScalar(0.42);
      this.bushIM.setColorAt(it.i, deadCol);
      hit = true;
      if (fx && fx.smoke) {
        for (let k = 0; k < 3; k++) fx.smoke.add({ x: it.x + (Math.random() - 0.5) * 4, y: it.y + 1, z: it.z + (Math.random() - 0.5) * 4,
          vx: (Math.random() - 0.5) * 4, vy: 2 + Math.random() * 3, vz: (Math.random() - 0.5) * 4, size: 1.2 + Math.random(), grow: 1.5, drag: 2, grav: 3, life: 0.8, alpha: 0.4, fadeIn: 0.02, c0: [0.35, 0.42, 0.22], cell: 2 });
      }
    }
    if (hit) {
      this.bushIM.instanceMatrix.needsUpdate = true;
      this.bushIM.instanceColor.needsUpdate = true;
      if (leafSfx) leafSfx('leafStrip', { x, y: this.groundAtRaw(x, z) + 1, z }, 0.5, { h: 2 });
    }
  }

  // Bụi rậm trúng đạn nổ / đạn cháy: thổi bay hoặc thiêu rụi thành tro than đen
  damageBushes(x, y, z, ammo, heavy, fx) {
    if (!this.bushIM || !this.bushItems || !this.bushItems.length) return;
    // đạn bắn thẳng (xuyên / súng máy): chỉ quanh điểm trúng, lá cành rách xơ xác chứ không cháy
    const bullet = ammo === 'AP' || ammo === 'GATLING_BULLET' || ammo === 'SCOUT_BULLET' || ammo === 'MG762';
    const R = (ammo === 'HE' ? 24 : ammo === 'INCENDIARY' ? 18 : bullet ? 5 : 12) * (heavy ? 1.4 : 1);
    const inc = ammo === 'INCENDIARY' || ammo === 'INCENDIARY_HMG' || ammo === 'CLUSTER_SUBMUNITION';
    let hit = false;
    const P = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), M = new THREE.Matrix4();
    for (const it of this.bushItems) {
      if (it.burnt) continue;
      const d = Math.hypot(it.x - x, it.z - z);
      if (d > R) continue;
      if (bullet) {
        // mỗi loạt trúng: bụi thưa / thấp đi, lá rách úa vàng dần; trúng nhiều thì trơ cành mất tác dụng che
        it.shot = (it.shot || 0) + 1;
        const k = Math.max(0.4, 1 - 0.15 * it.shot);
        M.copy(it.baseMat).decompose(P, Q, S);
        S.set(S.x * (0.6 + 0.4 * k), S.y * k, S.z * (0.6 + 0.4 * k));
        P.y = it.y + it.s * 0.25 * k;
        M.compose(P, Q, S);
        this.bushIM.setMatrixAt(it.i, M);
        this.bushIM.setColorAt(it.i, it.col0.clone().lerp(new THREE.Color(0x6b6040), Math.min(0.6, 0.12 * it.shot)));
        if (it.shot >= 4 && !it.broken) { it.broken = true; it.b.aliveCount = Math.max(0, (it.b.aliveCount || 1) - 1); if (it.b.aliveCount < 8) it.b.radius = Math.max(0, it.b.radius * 0.5); }
        hit = true;
        continue;
      }
      it.burnt = true; it.broken = true;
      it.b.aliveCount = Math.max(0, (it.b.aliveCount || 1) - 1);
      if (it.b.aliveCount < 8) it.b.radius = Math.max(0, it.b.radius * 0.5);
      M.copy(it.baseMat).decompose(P, Q, S);
      if (d < R * 0.45 && !inc) {
        // nổ sát tâm: thổi bay sạch không còn dấu vết
        S.set(0.001, 0.001, 0.001);
      } else {
        // đạn cháy: cháy rụi trơ cành than đen; sóng nổ vòng ngoài: quật xơ xác, cháy xém nâu sẫm (còn lốm đốm lá)
        if (inc) { S.set(S.x * 0.35, S.y * 0.22, S.z * 0.35); this.bushIM.setColorAt(it.i, new THREE.Color(0.08, 0.07, 0.06)); }
        else { S.set(S.x * 0.6, S.y * 0.4, S.z * 0.6); this.bushIM.setColorAt(it.i, it.col0.clone().lerp(new THREE.Color(0.2, 0.15, 0.09), 0.75)); }
      }
      P.y = it.y + 0.2;
      M.compose(P, Q, S);
      this.bushIM.setMatrixAt(it.i, M);
      hit = true;
      if (fx && fx.smoke && Math.random() < 0.6) {
        fx.smoke.add({ x: it.x, y: it.y + 2, z: it.z, vx: (Math.random() - 0.5) * 3, vy: 4 + Math.random() * 4, vz: (Math.random() - 0.5) * 3,
          size: 2 + Math.random() * 2, grow: 3, drag: 1, grav: -1, life: 1.5, alpha: 0.5, fadeIn: 0.05, c0: [0.1, 0.09, 0.08], c1: [0.25, 0.24, 0.22], cell: 0 });
      }
    }
    if (hit) {
      this.bushIM.instanceMatrix.needsUpdate = true;
      this.bushIM.instanceColor.needsUpdate = true;
    }
  }

  // ---------------------------------------------------------------------------
  // CẬP NHẬT MỖI KHUNG HÌNH (cây cháy / đổ, nhà sập, mặt nước gợn)
  // ---------------------------------------------------------------------------
  update(dt, fx) {
    if (typeof GroundShader !== 'undefined') GroundShader.tick(dt);
    if (typeof SkySystem !== 'undefined' && SkySystem.tickClouds) SkySystem.tickClouds(dt);   // bóng mây trôi
    if (this.trees) this.trees.update(dt, fx);
    if (this.buildingSet) this.buildingSet.update(dt, fx);
    if (this.propSet) this.propSet.update(dt, fx, this.camPos || null);
    if (this.landmarkSet) this.landmarkSet.update(dt, fx, this.camPos || null);
    if (this.envDamage) this.envDamage.update(dt, fx);
    if (this.streetscape && this.streetscape.junk) this.streetscape.junk.update(dt);   // thùng rác / bao rác bị sóng nổ hất văng
    if (this.waterTime) this.waterTime.value += dt;   // sóng mặt nước trôi theo thời gian (sông hồ + biển)
  }

  // Sóng nổ / đạn tác động lên cây, nhà, boong-ke tại điểm nổ
  damageAt(x, y, z, ammo, heavy, fx, info) {
    const events = [];
    if (typeof Weather !== 'undefined' && Weather.shelterDirty) Weather.shelterDirty();   // mái che có thể đổi -> bản đồ hứng mưa
    if (this.envDamage) events.push(...this.envDamage.damageAt(x, y, z, ammo, heavy, fx, info || {}));
    if (this.trees) this.trees.damageAt(x, y, z, ammo, heavy, fx);
    if (this.propSet) this.propSet.damageAt(x, y, z, ammo, heavy, fx);
    if (this.streetscape && this.streetscape.junk) this.streetscape.junk.blast(x, y, z, ammo, heavy);
    this.damageBushes(x, y, z, ammo, heavy, fx);
    if (this.buildingSet) events.push(...this.buildingSet.damageAt(x, y, z, ammo, heavy, fx, null, info || {}));
    if (this.bunkerSet) events.push(...this.bunkerSet.damageAt(x, y, z, ammo, heavy, fx, null, info || {}));
    if (this.landmarkSet && this.landmarkSet.damageAt) events.push(...this.landmarkSet.damageAt(x, y, z, ammo, heavy, fx));
    return events;
  }

  // Hệ số sát thương sóng nổ còn lại khi có vật cản giữa điểm nổ và xe (tường bê tông, mái hầm, nhà)
  // opt.noStronghold: bỏ phần cứ điểm (xe nằm trong cứ điểm: phần bị che đã tính theo từng điểm thân xe ở shelterFactor)
  blastFactor(ex, ey, ez, ux, uy, uz, opt) {
    // Ụ đất / tường bê tông cứ điểm nằm giữa điểm nổ và xe
    if (!(opt && opt.noStronghold) && this.strongholdSet && this.strongholdSet.segmentHit(ex, ey, ez, ux, uy, uz)) return 0.15;
    // khối bê tông / thép của công trình bối cảnh
    if (this.landmarkSet && this.landmarkSet.segmentHit(ex, ey, ez, ux, uy, uz)) return 0.2;
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
        // vật liệu tường: mảnh thép xuyên qua vách tôn 1-2 mm gần như nguyên vẹn, vách gỗ chặn được một phần; tường xây /
        // bê tông chặn gần hết mảnh, chỉ sức ép vòng qua (trước đây nhà nào cũng 0,3)
        if (yl < b.ref.y + b.height) return BLAST_COVER[b.ref.st && b.ref.st.mat] || 0.3;
      }
    }
    return 1;
  }
  // Vật che THẤP giữa điểm nổ và điểm ngắm thân xe (tường rào đá / đất nện / rào gỗ, đá tảng, xác xe): che theo phần thân xe
  // khuất bóng vật (Props.lowCover; vật che trọn: tường đá / đất 0,4, rào gỗ 0,85, đá tảng / xác xe 0,35). Tách khỏi
  // blastFactor: game.blastShield chỉ tính gò / sống đất (terrainShield) khi blastFactor = 1 (tránh tính 2 lần đất ụ cứ
  // điểm) — vật thấp ven đường không được làm mất phần đất che đó. 1 = không che
  lowShield(ex, ey, ez, ux, uy, uz) {
    let k = this.propSet && this.propSet.blastCover ? this.propSet.blastCover(ex, ey, ez, ux, uy, uz) : 1;
    const LC = typeof Props !== 'undefined' && Props.lowCover;
    const dx = ux - ex, dz = uz - ez, a = dx * dx + dz * dz;
    if (!LC || a < 1) return k;
    const L = Math.sqrt(a), mnX = Math.min(ex, ux), mxX = Math.max(ex, ux), mnZ = Math.min(ez, uz), mxZ = Math.max(ez, uz);
    // đá tảng, xác xe (xác xe bản đồ & xác xe bị hạ giữ lại: noShot vẫn che mảnh), chân cột mái che / trụ cầu vượt
    for (const rk of this.boulders) {
      const r = rk.radius || 0;
      if (r < 1.5 || !(rk.height > 0)) continue;
      if (rk.x + r < mnX || rk.x - r > mxX || rk.z + r < mnZ || rk.z - r > mxZ) continue;
      const fx = ex - rk.x, fz = ez - rk.z, b = fx * dx + fz * dz, c = fx * fx + fz * fz - r * r, disc = b * b - a * c;
      if (disc <= 0) continue;
      const sq = Math.sqrt(disc), t0 = Math.max(0, (-b - sq) / a), t1 = Math.min(1, (-b + sq) / a);
      // dây cung quá ngắn (đường bay chỉ sượt mép, hoặc điểm nổ nằm sát mặt đá mà xe ở cùng phía): không che
      if (t1 - t0 < 0.5 * r / L) continue;
      k = Math.min(k, LC(ey, uy, t0, t1, this.groundAtRaw(rk.x, rk.z) + rk.height, 0.35));
    }
    return k;
  }
  // Thân cây / rừng rậm giữa điểm nổ và xe: hệ số mảnh văng còn lại (1 = không che)
  treeShield(ex, ey, ez, ux, uy, uz) { return this.trees && this.trees.blastShield ? this.trees.blastShield(ex, ey, ez, ux, uy, uz) : 1; }
  isUnderCover(x, z) { return this.bunkerSet ? !!this.bunkerSet.isUnderCover(x, z) : false; }

  // ---------------------------------------------------------------------------
  // CỨ ĐIỂM BÊ TÔNG: che chắn xe nằm trong khoang
  // ---------------------------------------------------------------------------
  // Cứ điểm đang che (một phần) xe này, null nếu xe ở ngoài
  shelterOf(unit) { return this.strongholdSet && unit ? this.strongholdSet.shelterOf(unit) : null; }
  // Hệ số sát thương nổ còn lại theo phần thân xe bị lộ (0 = nằm khuất hoàn toàn). burst (tùy chọn): điểm nổ -> phần thân xe
  // nhìn thấy điểm nổ qua miệng hầm / lỗ sập (xem Strongholds.exposure)
  shelterFactor(unit, burst) {
    if (!this.strongholdSet || !unit) return 1;
    const e = this.strongholdSet.exposure(unit, burst);
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
    return (this.buildingSet && this.buildingSet.stateString ? this.buildingSet.stateString() : '') + '#' + (this.trees && this.trees.stateString ? this.trees.stateString() : '')
      + '#' + (this.strongholdSet && this.strongholdSet.stateString ? this.strongholdSet.stateString() : '')
      + '#' + (this.landmarkSet && this.landmarkSet.stateString ? this.landmarkSet.stateString() : '')
      + '#' + (this.buildingSet && this.buildingSet.fireState ? this.buildingSet.fireState() : '')
      + '#' + (this.propSet && this.propSet.wreckState ? this.propSet.wreckState() : '');
  }
  applyEnvState(str, fx) {
    const [b, t, sh, lm, fire, wk] = String(str || '').split('#');
    if (wk && this.propSet && this.propSet.applyWreckState) this.propSet.applyWreckState(wk, fx);
    // nhà đang / đã cháy (người vào trận giữa chừng thấy lửa, khói; tác động kết cấu đã có trong chuỗi nhà)
    if (fire && this.buildingSet && this.buildingSet.applyFireState) this.buildingSet.applyFireState(fire);
    if (lm && this.landmarkSet && this.landmarkSet.applyState) this.landmarkSet.applyState(lm, fx);
    if (b && this.buildingSet && this.buildingSet.applyState) this.buildingSet.applyState(b, fx);
    if (t && this.trees && this.trees.applyState) this.trees.applyState(t, fx);
    // mái cứ điểm: máu từng ô (lấy mức hư hại nặng hơn), ô đã sập thì sập luôn
    if (sh && this.strongholdSet && this.strongholdSet.applyState) this.strongholdSet.applyState(sh, fx);
  }
  // Rừng rậm: mật độ tán quanh điểm (>= FOREST_DENSE là rừng rậm) & quãng xuyên rừng rậm trên đường ngắm
  forestDensityAt(x, z) { return this.trees && this.trees.densityAt ? this.trees.densityAt(x, z) : 0; }
  // Đỗ ngay dưới tán cây còn lá: drone soi từ trên xuống khó thấy (TeamIntel.droneSees / server_auth cờ F_CANOPY)
  // rv: bán kính thân xe (đv) — xe càng to càng khó giấu trọn dưới tán
  // Xe trong nhà còn đứng: mái / sàn che drone, tường che radar (BuildingSet.coverAt; TeamIntel.droneSees / updateRadar)
  indoorCover(x, z) { return this.buildingSet && this.buildingSet.coverAt ? this.buildingSet.coverAt(x, z) : null; }
  underCanopy(x, z, rv) { return !!(this.trees && this.trees.canopyCover && this.trees.canopyCover(x, z, rv) >= BattleTerrain3D.CANOPY_HIDE); }
  forestLOS(ax, az, bx, bz, limit) { return this.trees && this.trees.denseLength ? this.trees.denseLength(ax, az, bx, bz, limit || 1e9, BattleTerrain3D.FOREST_DENSE) : 0; }
  // Nòng pháo (chốt nòng -> đầu nòng) cắm vào bê tông / ụ đất?
  barrelBlocked(p0, p1) { return this.strongholdSet ? this.strongholdSet.barrelBlocked(p0, p1) : false; }
  nearStronghold(x, z, pad = 40) { return this.strongholdSet ? !!this.strongholdSet.near(x, z, pad) : false; }
  // Không đào hố bom / khoét lỗ mặt đất trên ụ đất & sàn bê tông của cứ điểm
  // vỉa hè: mặt lát nằm trên đất -> hố khoét vào đất bên dưới bị che (vết nổ do EnvDamage vẽ lên mặt lát)
  noCraterAt(x, z) { return (this.strongholdSet ? !!this.strongholdSet.covers(x, z, 6) : false) || !!(this.bridges.length && this.bridgeAt(x, z)) || !!(this.streetscape && this.streetscape.covers && this.streetscape.covers(x, z)); }

  // Cây đổ khi xe húc
  // Có `unit`: cây / rào / tường / bao cát do ramObjects xử lý theo lực mỗi khung (mọi tốc độ) — ở đây chỉ còn bụi rậm, cỏ
  crushVegetation(x, z, radius, vx, vz, fx, unit) {
    if (!unit) {
      if (this.trees) this.trees.crush(x, z, radius, vx, vz, fx);
      // ... và húc đổ hàng rào / tường đá, cán bẹp bao cát
      if (this.propSet && Math.hypot(vx, vz) >= 6) this.propSet.crush(x, z, radius, vx, vz, fx);
    }
    // Cây trồng ngoài ruộng bị xích / bánh đè rạp theo chiều chạy (props.js)
    if (unit && this.propSet && this.propSet.trampleCrops) this.propSet.trampleCrops(x, z, radius, vx, vz);
    // Bụi rậm ngụy trang bị đè bẹp
    this.crushBushes(x, z, radius, vx, vz, fx);
    // Cỏ 3D bị xích / bánh xe đè rạp sát đất xuôi chiều chạy
    if (this.groundCover && unit && unit.bodyAngle !== undefined) {
      const a = unit.bodyAngle || 0, sp = unit.speed || 0, tracked = !unit.isWheeled;
      this.groundCover.trample({
        cx: unit.x, cz: unit.z,
        ux: Math.cos(a), uz: -Math.sin(a),
        hu: (unit.tankType === 'SCOUT' ? 8 : 12),
        hv: (unit.tankType === 'SCOUT' ? 14 : 20),
        dx: -Math.sin(a) * Math.sign(sp || 1),
        dz: -Math.cos(a) * Math.sign(sp || 1),
        lane: tracked ? 4.5 : 3.0
      });
    }
  }

  // XE HÚC VẬT THEO LỰC (mọi xe, mọi khung, cả lúc bò chậm): hộp thân xe chạm cây / nhịp rào / tường / bao cát.
  // Đủ lực (lực kéo bám đất + đà xe, xem VehicleCollision.ramForce) thì cây gãy / bật gốc, tường đổ, xe mất đà theo
  // năng lượng phá; không đủ thì vật chặn xe (resolveVehicleCollision / vehicleObstacles). Bao cát: xích trèo lên ụ bao
  // rồi đè bẹp. Thân cây đổ, gốc cụt, đống đá tường sập, bao cát thành mặt cho xích trèo qua (vehicleDebris)
  ramObjects(unit, dt, fx) {
    if (typeof VehicleCollision === 'undefined' || !unit || unit.isDead || !dt) return;
    const ob = VehicleCollision.vehObb(unit, unit.x, unit.z, unit.bodyAngle || 0, this._ramObb || (this._ramObb = {}));
    // tốc độ TRƯỚC cú húc (ram làm xe mất đà): tiếng thân xe nện vào vật to theo đà lúc chạm, không theo đà còn lại
    const a = unit.bodyAngle || 0, sp0 = unit.speed || 0;
    const felled = this.trees && this.trees.ram ? this.trees.ram(unit, ob, dt, fx) : null;
    const spans = this.propSet && this.propSet.ram ? this.propSet.ram(unit, ob, dt, fx) : null;
    // bồn cây / cọc chắn xe quanh chân cao ốc: xe xích nghiền, cán gập (BuildingSet.ramYard)
    if (this.buildingSet && this.buildingSet.ramYard) this.buildingSet.ramYard(unit, ob, fx);
    // tường / cột tầng trệt nhà: đủ lực thì xe húc đổ, chui vào nhà (BuildingSet.ram)
    const walls = this.buildingSet && this.buildingSet.ram ? this.buildingSet.ram(unit, ob, dt, fx) : null;
    const hitSpans = walls ? (spans || []).concat(walls) : spans;
    if (felled || hitSpans) this.crushHullSound(unit, -Math.sin(a) * sp0, -Math.cos(a) * sp0, felled, hitSpans);
  }

  // Tiếng THÂN XE đập vào cây / rào lúc húc đổ (tiếng gãy đổ của chính cây / rào do Destructibles / Props phát): mũi xe
  // nện thân cây "CỘC" trầm, tường đá / đất "huỵch" — to theo tốc độ húc chiếu lên hướng tới vật, khối lượng xe và cỡ vật
  // (cây to / tường đá cản nhiều hơn rào gỗ). Mỗi xe mỗi loại vật liệu một tiếng / 0,28 s (chạy dọc hàng rào không dồn dập)
  crushHullSound(unit, vx, vz, felled, spans) {
    const S = typeof window !== 'undefined' && window.soundEngine;
    if (!S || !S.collideAt) return;
    const v = Math.hypot(vx, vz);
    if (v < 1) return;
    const self = !!unit.isPlayer, mA = unit.mass || 40, y = (unit.y || 0) + 6;
    const hit = (px, pz, mat, mB) => {
      const dx = px - unit.x, dz = pz - unit.z, dl = Math.hypot(dx, dz);
      const vn = dl > 1e-3 ? Math.max(0.35 * v, (vx * dx + vz * dz) / dl) : v;
      S.collideAt({ x: px, y, z: pz }, { vn, mA, mB, mat, self, yield: true, key: unit.id + '|crush|' + mat });
    };
    if (felled) {
      // cây to nhất vừa húc: khối lượng thân ~ π r² h x 0,75 t/m³, nhân thêm sức giữ của rễ / thớ gỗ
      let best = null, bm = 0;
      for (const it of felled) {
        if (it.kind === 'cactus') continue;
        const r = (it.trunkR || 1.5) / 8, h = (it.height || 40) / 8, m = Math.min(12, Math.max(0.8, Math.PI * r * r * h * 0.75 * 3));
        if (m > bm) { bm = m; best = it; }
      }
      if (best) hit(best.x, best.z, 'tree', bm);
    }
    if (spans && spans.length) {
      // rào đá / tường đất (nặng, cản nhiều) ưu tiên hơn rào gỗ / tre
      const s = spans.find(q => q.mat !== 'wood') || spans[0];
      hit(s.x, s.z, s.mat, s.mat === 'wood' ? 0.4 : 4);
    }
  }

  // Xe trinh sát cọ / húc cây: cây đứng vững, chỉ rung & rụng lá (Destructibles.brush); hàng rào vẫn húc đổ, xương rồng
  // vẫn bị cán. Trả về các cây vừa bị húc (để lá rơi đọng lên xe)
  // unit (tuỳ chọn): chỉ rung cây chạm sát hộp thân xe
  brushVegetation(x, z, radius, vx, vz, fx, now, unit) {
    let hit = [];
    // (xương rồng / cây nhỏ / rào / bao cát: ramObjects theo lực)
    const ob = unit && typeof VehicleCollision !== 'undefined' ? VehicleCollision.vehObb(unit, unit.x, unit.z, unit.bodyAngle || 0, this._brObb || (this._brObb = {})) : null;
    if (this.trees) hit = this.trees.brush(x, z, radius, vx, vz, fx, now, ob);
    return hit;
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

  // Mặt lát kè + lối dạo bờ kênh đô thị: lưới địa hình (~24 đv/ô) không dựng được bờ đứng, sườn đất lòng kênh nằm sau tường
  // kè (map_gen 3b') -> trên dải bờ (từ tường kè ra 40) lấy cao độ bờ phía ngoài; null nếu không ở dải bờ kênh
  canalQuayAt(x, z) {
    for (const c of this.map.canals || []) {
      const ca = Math.cos(c.rot), sa = Math.sin(c.rot), u = x * ca + z * sa - c.a, v = -x * sa + z * ca;
      if (Math.abs(v) > c.vEnd || Math.abs(u) < c.hw || Math.abs(u) > c.hw + 40) continue;
      const ub = c.a + Math.sign(u) * (c.hw + 48);
      return this.groundAtRaw(ub * ca - v * sa, ub * sa + v * ca);
    }
    return null;
  }

  // Mặt đất kể cả ụ đất do xe ủi đắp (addBerm): xe leo lên được, đạn bắn vào thì chạm "đất", che tầm nhìn như gò
  getElevationAt(x, z) {
    const g = this._elevBase(x, z);
    return this.berms && this.berms.length ? g + this.bermAt(x, z) : g;
  }

  // ---------------------------------------------------------------------------
  // Ụ ĐẤT XE ỦI ĐẮP (Hailstorm còn lưỡi ủi — game.js updateDig): bờ đất nằm ngang trước mũi xe (+ 2 bờ ôm hai sườn khi đắp
  // xong — xe nằm trong ổ đất hình chữ U, chỉ còn tháp nhô lên). Cộng vào getElevationAt: xe leo lên được, đạn bắn vào
  // chạm "đất", che tầm nhìn như gò; mảnh văng vụ nổ bên kia ụ bị đất chặn (bermShield).
  // b.k: mức đắp 0..1. Mặt ụ gồ ghề (cục đất vón, rãnh lưỡi ủi) theo hàm nhiễu cố định -> mọi chỗ gọi đều cùng một mặt
  // ---------------------------------------------------------------------------
  bermAt(x, z, only) {
    let h = 0;
    for (const b of only ? [only] : this.berms) {
      const dx = x - b.x, dz = z - b.z;
      if (dx * dx + dz * dz > b.R2) continue;
      const a = dx * b.cx + dz * b.cz, f0 = dx * b.fx + dz * b.fz;   // a: dọc bờ, f: xuyên bờ
      const pile = b.kind === 'pile', sl = b.slump || 0;
      // ĐẤT LAN THEO HƯỚNG CUA (b.sk -1..1, + = về bên phải xe — game.js pushBerm theo đống lệch dọc lưỡi): đất trượt dọc mặt
      // lưỡi về đầu PHÍA NGOÀI cua -> cánh bên đó dài ra & cong ôm về sau quanh đầu lưỡi (che góc mũi / sườn trước bên đó),
      // cánh phía trong ngắn lại. Đi thẳng: sk về 0, đống cân lại hai bên
      const sk = pile ? b.sk || 0 : 0, out = sk * a > 0 ? Math.abs(sk) : 0, inn = sk * a < 0 ? Math.abs(sk) : 0;
      const Ls = b.L * (1 + 0.42 * out - 0.12 * inn);
      // ĐỐNG TRƯỚC LƯỠI: mặt bằng hình lưỡi liềm — dày nhất giữa lưỡi, hai cánh cong ôm về sau quanh hai đầu lưỡi (đất bị
      // mặt lưỡi cong dồn vào giữa, tràn qua đầu lưỡi đổ dọc hai góc mũi xe); bờ / luống thường thẳng
      const ua = Math.min(1, Math.abs(a) / Ls);
      const f = pile ? f0 + b.W * (0.55 + 0.35 * out) * ua * ua : f0;
      // chân ụ không thẳng tắp: bề dày & chiều dài đổi chậm theo nhiễu (đất đổ không đều); ụ ngấm mưa sụt (tickBerms): thấp
      // xuống, chân bè rộng ra. Đống trước lưỡi: mặt trước (xa xe) đổ dài & dày hơn -> lớp đất chắn đạn bắn thẳng vào mũi dày
      const W = b.W * (1 + 0.13 * Math.sin(a * 0.19 + b.seed) + 0.07 * Math.sin(a * 0.47 + b.seed * 1.7)) * (1 + 0.5 * sl) * (pile && f >= 0 ? 1.3 : 1);
      const L = Ls * (1 + 0.08 * Math.sin(f0 * 0.35 + b.seed * 0.7));
      // hai đầu bờ thoải dần (đất đổ ra), không cắt cụt; luống / bờ thường vuốt ngắn hơn để các đoạn luống nối liền thành dải
      const e = Math.min(1, Math.max(0, (L - Math.abs(a)) / (L * (pile ? 0.45 : 0.28))));
      if (e <= 0) continue;
      let prof;
      if (pile && f < 0) {
        // mặt áp lưỡi: đất bị lưỡi ép dựng gần đứng theo mặt lưỡi (cách tâm đống ~7,2 đv), sụp gọn ngay sau mép lưỡi (không
        // lấn vào gầm xe)
        const tb = -f / (b.W * 0.5);
        if (tb >= 1) continue;
        prof = 1 - Math.pow(tb, 6);
      } else {
        // mặt trước / bờ thường: đất xốp đổ theo góc nghỉ ~35° — sườn gần thẳng, đỉnh tròn hẹp, chân loe nhẹ (không phồng
        // tròn như cái gối)
        const t = Math.abs(f) / W;
        if (t >= 1) continue;
        const s = 1 - t;
        prof = Math.pow(s * s * (3 - 2 * s), 0.75);
      }
      // GỒ GHỀ: mảng đất đổ lớn (theo toạ độ ụ — trôi theo đống) + cục đất vón nhỏ (theo toạ độ thế giới: đống đang đẩy thì
      // đất như đang cuộn lật). Cục vón chỉ nổi rõ ở chỗ đất dày
      let big = 0.9 + 0.09 * Math.sin(a * 0.23 + f0 * 0.17 + b.seed) + 0.07 * Math.sin(a * 0.11 - f0 * 0.41 + b.seed * 2.3)
        + 0.08 * (bermNoise(a * 0.09 + b.seed, f0 * 0.13) - 0.5);
      // luống / bờ thường: sống luống cao thấp lổn nhổn dọc chiều dài (đất rơi từng đợt) — không đều như khúc ống
      if (!pile) big *= 1 + 0.45 * (bermNoise(a * 0.33 + b.seed * 3.1, f0 * 0.18) - 0.5);
      let v = b.H * b.k * (1 - sl) * (e * e * (3 - 2 * e)) * prof * big;
      if (v > 0.6) v += (bermNoise(x * 0.42, z * 0.42) - 0.5) * 1.1 * Math.min(1, v / 5) + (bermNoise(x * 1.1 + 7.3, z * 1.1) - 0.5) * 0.45;
      if (b.dents && v > 0) v = Math.max(0, v - this.bermDent(b, a, f0));
      if (v > h) h = v;
    }
    return h;
  }

  // Đất bị nổ hất khỏi ụ tại (a, f) (toạ độ dọc / xuyên bờ): các vết khoét cộng dồn -> bắn liên tục vào một chỗ thì
  // thủng ụ. Lòng vết khoét lõm tròn, đất văng đắp gờ thấp quanh miệng (gờ chỉ đắp khi chỗ đó còn đất ụ)
  bermDent(b, a, f) {
    let cut = 0, rim = 0;
    for (const d of b.dents) {
      const da = a - d.a, df = f - d.f, r2 = d.r * d.r, q = (da * da + df * df) / r2;
      if (q >= 2.6) continue;
      if (q < 1) { const s = 1 - q; cut += d.d * s * Math.sqrt(s); }
      else rim = Math.max(rim, d.d * 0.16 * Math.exp(-Math.pow((Math.sqrt(q) - 1.12) / 0.22, 2)));
    }
    return cut - rim;
  }
  // Đất ụ tại (x, z) nếu điểm nằm trên ụ còn đất (> 1,5 đv): bảng màu đất ụ (bermSoil) của ụ cao nhất ở đó; null = không có ụ
  bermSoilAt(x, z) {
    if (!this.berms || !this.berms.length) return null;
    let best = null, bh = 1.5;
    for (const b of this.berms) {
      if (!b.soil) continue;
      const h = this.bermAt(x, z, b);
      if (h > bh) { bh = h; best = b.soil; }
    }
    return best;
  }
  // Nổ chạm ụ đất (đạn nổ trên / sát mặt ụ): đất ụ bị hất tung thành vết khoét thay vì khoét hố mặt đất bên dưới.
  // R / D: bán kính / độ sâu hố nổ (đv) ở đất thường; đất đắp tơi xốp nên khoét rộng & sâu hơn. Trả true nếu ụ đã nhận phát
  // nổ (bên gọi bỏ qua hố mặt đất); false khi chỗ đó ụ đã mòn sát đất -> nổ khoét hố đất nền như thường
  blastBerm(x, z, R, D, kind) {
    if (!this.berms || !this.berms.length || this.bermAt(x, z) < 2.5) return false;
    const k = kind === 'gouge' ? { r: 0.55, d: 0.7 } : kind === 'heat' ? { r: 1.35, d: 1.6 } : kind === 'cluster' ? { r: 1.2, d: 1.3 } : { r: 1.15, d: 1.45 };
    const r = Math.max(4.5, R * k.r), dd = Math.max(2.5, D * k.d);
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const b of this.berms) {
      if (!b.mesh || this.bermAt(x, z, b) <= 0) continue;
      const dx = x - b.x, dz = z - b.z;
      const dents = b.dents || (b.dents = []);
      dents.push({ a: dx * b.cx + dz * b.cz, f: dx * b.fx + dz * b.fz, r, d: dd });
      // giới hạn số vết khoét: gộp 2 vết cũ nhất (cùng chỗ thì dồn độ sâu) để ụ không "liền lại"
      if (dents.length > 48) { const o = dents.shift(), n = dents[0]; n.d = Math.max(n.d, o.d); n.r = Math.max(n.r, o.r * 0.8); }
      this.setBermLevel(b, b.k);
      x0 = Math.min(x0, x - r * 1.7); x1 = Math.max(x1, x + r * 1.7); z0 = Math.min(z0, z - r * 1.7); z1 = Math.max(z1, z + r * 1.7);
    }
    if (x0 === Infinity) return false;
    // đồ vật đang nằm trên mặt ụ (đá vụn, cục đất, bụi cỏ...) rơi xuống theo mặt mới
    const fx = typeof ExplosionFX !== 'undefined' && ExplosionFX.forScene ? ExplosionFX.forScene(this.scene) : null;
    if (fx && fx.groundChanged) fx.groundChanged(x0, z0, x1, z1); else this.onGroundChanged(x0, z0, x1, z1);
    return true;
  }

  // Lưỡi ủi xén / xích xe nén lún đất ụ tại (x, z): vết lõm bán kính r sâu thêm d đv, cộng dồn vào vết cùng loại ngay
  // gần đó -> xe chạy qua lại vài lượt thì ụ bẹp hẳn thành lối qua. skip: ụ đang nằm trước lưỡi (không tự xén).
  // Trả lượng đất đã xén (đv cao, cộng các ụ) — lưỡi ủi gom số đất đó vào đống trước lưỡi
  cutBerm(x, z, r, d, skip) {
    if (!this.berms || !this.berms.length) return 0;
    let got = 0;
    for (const b of this.berms) {
      if (b === skip || !b.mesh) continue;
      const dx = x - b.x, dz = z - b.z;
      if (dx * dx + dz * dz > b.R2) continue;
      const h = this.bermAt(x, z, b);
      if (h < 1) continue;
      const a = dx * b.cx + dz * b.cz, f = dx * b.fx + dz * b.fz;
      const dents = b.dents || (b.dents = []);
      let n = null;
      for (let i = dents.length - 1; i >= Math.max(0, dents.length - 8); i--) {
        const o = dents[i];
        if (o.c && Math.hypot(o.a - a, o.f - f) < r * 0.45) { n = o; break; }
      }
      if (n) n.d = Math.min(b.H * 1.3, n.d + d);
      else {
        dents.push({ a, f, r, d, c: 1 });
        if (dents.length > 48) { const o = dents.shift(), m = dents[0]; m.d = Math.max(m.d, o.d); m.r = Math.max(m.r, o.r * 0.8); }
      }
      got += Math.min(h, d);
      this.setBermLevel(b, b.k);
    }
    return got;
  }

  // Loại đất dưới lưỡi ủi (game.js updateDig — DOZER_SOIL): 'hard' mặt nhựa / bê tông (lưỡi chỉ cạo lớp mặt), 'rock' đá
  // sỏi, 'sand' cát khô rời, 'wsand' cát ướt mưa (kết dính), 'mud' bùn / đất sũng nước mưa, 'slurry' bùn nhão trong vũng
  // nước đọng (Weather.puddleAt — đúng chỗ thấy vũng), 'soil' đất thường
  dozerSoil(x, z) {
    const fx = typeof ExplosionFX !== 'undefined' && ExplosionFX.forScene ? ExplosionFX.forScene(this.scene) : null;
    const pal = fx && fx.surfacePalette ? fx.surfacePalette(x, z, 'GROUND') : null, m = pal && pal.mat;
    const rain = !!(this.weather && this.weather.rain);
    if (m === 'asphalt' || m === 'hard') return 'hard';
    if (m === 'rock') return 'rock';
    if (m === 'sand' || this.mapType === 'DESERT') return rain ? 'wsand' : 'sand';
    const pud = rain && typeof Weather !== 'undefined' && Weather.puddleAt ? Weather.puddleAt(this, x, z) : 0;
    if (pud > 0.35) return 'slurry';
    if (m === 'mud' || (pal && pal.wet) || rain) return 'mud';
    return 'soil';
  }

  // MƯA LÀM SỤT Ụ ĐẤT: đất đắp tơi xốp ngấm mưa thì chảy sệ — ụ thấp dần & bè chân ra (b.slump 0..~0,22 cường độ mưa,
  // ~2 phút gần tới mức sụt; cát ướt kết dính sụt ít hơn). Ụ đang bị lưỡi đẩy luôn là đất mới vun lại (moveBerm xoá sụt).
  // Trời khô: không sụt. Dựng lại lưới chỉ khi sụt thêm đủ thấy (~1,5%) -> rẻ
  tickBerms(dt) {
    const W = this.weather;
    if (!this.berms || !this.berms.length || !W || !W.rain) return;
    const I = W.intensity || 0.9;
    for (const b of this.berms) {
      if (!b.mesh || b.k <= 0) continue;
      const tgt = (b.soil && b.soil.sand ? 0.1 : 0.22) * I;
      b.slump = (b.slump || 0) + (tgt - (b.slump || 0)) * Math.min(1, dt / 120);
      if (Math.abs(b.slump - (b.slumpDrawn || 0)) > 0.015) { b.slumpDrawn = b.slump; this.setBermLevel(b, b.k); }
    }
  }

  // Vân hạt đất xới (dùng chung, xám quanh ~0,8 để nhân màu đỉnh lưới): hạt đất mịn nhiều tầng + vụn đất sẫm + sỏi sáng
  // lấm tấm + vệt ẩm loang — làm map & bumpMap cho mặt ụ (không còn mặt nhẵn bóng như nhựa)
  static bermSoilTexture() {
    if (Terrain3DSoilTex) return Terrain3DSoilTex;
    const N = 256, c = document.createElement('canvas');
    c.width = c.height = N;
    const X = c.getContext('2d'), img = X.createImageData(N, N), d = img.data;
    const tile = (x, y, s) => bermNoise((x % s) / s * 8, (y % s) / s * 8);   // lặp khít 256 px
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const n = 0.45 * tile(x, y, 256) + 0.3 * tile(x * 2, y * 2, 256) + 0.25 * tile(x * 5, y * 5, 256);
      const g = 0.62 + 0.34 * n + (Math.random() - 0.5) * 0.12;
      const i = (y * N + x) * 4, v = Math.max(0, Math.min(255, g * 255));
      d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
    }
    X.putImageData(img, 0, 0);
    for (let k = 0; k < 420; k++) {   // vụn đất sẫm & cục nhỏ (thưa, nhạt — không lấm chấm đều như bánh quy)
      const r = 0.5 + Math.random() * Math.random() * 2.4;
      X.fillStyle = `rgba(40,32,24,${0.12 + Math.random() * 0.25})`;
      X.beginPath(); X.arc(Math.random() * N, Math.random() * N, r, 0, Math.PI * 2); X.fill();
    }
    for (let k = 0; k < 260; k++) {   // sỏi / hạt khô sáng
      const r = 0.5 + Math.random() * 1.4;
      X.fillStyle = `rgba(235,228,214,${0.25 + Math.random() * 0.35})`;
      X.beginPath(); X.arc(Math.random() * N, Math.random() * N, r, 0, Math.PI * 2); X.fill();
    }
    const T = new THREE.CanvasTexture(c);
    T.wrapS = T.wrapT = THREE.RepeatWrapping;
    T.anisotropy = 4;
    Terrain3DSoilTex = T;
    return T;
  }

  // opts: { L: nửa chiều dài bờ, W: nửa bề dày, H: cao tối đa, kind } (đv, 8 đv = 1 m). kind: 'pile' = đống trước lưỡi ủi
  // (mặt áp lưỡi dựng đứng, mặt bằng lưỡi liềm — mặc định khi không truyền kích thước), 'ridge' = bờ / luống đất thường
  addBerm(x, z, yaw, opts = {}) {
    if (!this.berms) this.berms = [];
    // f = hướng xuyên bờ (yaw như bodyAngle: (-sin, -cos)), c = dọc bờ
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    // đống trước lưỡi mặc định: nửa bề dày 15 -> mặt trước đổ ~38° (góc nghỉ đất xới), mặt áp lưỡi dựng đứng (bermAt)
    const kind = opts.kind || (opts.L ? 'ridge' : 'pile');
    const b = { x, z, yaw, fx, fz, cx: -fz, cz: fx, L: opts.L || 26, W: opts.W || (kind === 'pile' ? 15 : 12), H: opts.H || 12, k: 0, R2: 0, mesh: null,
      kind, seed: (Math.abs(Math.round(x * 7 + z * 13)) % 997) * 0.37 };
    // chừa chỗ chân ụ gồ ghề (bermAt: bề dày / chiều dài đổi theo nhiễu) & bè ra khi mưa làm sụt (tickBerms); đống trước
    // lưỡi: thêm cánh dài ra / cong về sau khi cua & mặt trước dày (bermAt sk)
    const pileK = kind === 'pile', GA0 = b.L * (pileK ? 1.55 : 1.1) + 2, GF0 = b.W * (pileK ? 1.8 : 1.45) + 2;
    b.R2 = GA0 * GA0 + GF0 * GF0;
    // quá 80 ụ: bỏ ụ nhỏ nhất trong số ụ cũ nhất (luống đất tràn / đống rớt khi cua) — giữ lại ổ bắn, ụ cao còn có ích
    if (this.berms.length >= 80) {
      let o = this.berms[0];
      for (let i = 1; i < 30; i++) { const q = this.berms[i]; if (q.H * q.k < o.H * o.k) o = q; }
      this.removeBerm(o);
    }
    this.berms.push(b);
    const S = this.bermSoil(x, z);
    b.soil = S;
    // khối đất: lưới phủ cả chân ụ gồ ghề (lấn ra 2 đv để mép ụ vùi vào đất), đỉnh = mặt đất + độ cao ụ. Ô lưới ~1,2-1,5 đv
    // để thấy được cục đất vón trên mặt (bermAt); đống trước lưỡi dày ô hơn
    const pile = pileK, GA = GA0, GF = GF0;
    const geo = new THREE.PlaneGeometry(1, 1, Math.max(8, Math.min(56, Math.round(GA * 2 / (pile ? 1.3 : 1.6)))), Math.max(6, Math.min(30, Math.round(GF * 2 / (pile ? 1.2 : 1.5)))));
    const pos = geo.attributes.position, uv = geo.attributes.uv;
    b.base = new Float32Array(pos.count); b.wxz = []; b.af = new Float32Array(pos.count * 2);
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const a = pos.getX(i) * 2 * GA, f = pos.getY(i) * 2 * GF;
      b.af[i * 2] = a; b.af[i * 2 + 1] = f;
      uv.setXY(i, a / 22 + b.seed, f / 22);   // vân hạt đất ~2,7 m một ô, bám theo đống (đất cuộn đi cùng lưỡi)
      const wx = x + a * b.cx + f * b.fx, wz = z + a * b.cz + f * b.fz;
      b.wxz.push([wx, wz]);
      b.base[i] = this._elevBase(wx, wz);
      // màu đất mới lật theo đất bản đồ (cát vàng ẩm ở sa mạc, đất nâu sẫm ở đồng cỏ / rừng): loang mảng ẩm sẫm / khô sáng
      // theo nhiễu; chỉ sát chân ụ mới ngả sang màu mặt đất để hòa vào nền (trước đây ngả từ 60% bề dày -> luống hẹp xanh xám)
      const n = 0.82 + 0.26 * bermNoise(wx * 0.07 + 3.1, wz * 0.07) + (Math.random() - 0.5) * 0.06;
      const tE = Math.min(1, Math.abs(f) / (b.W * (pile && f > 0 ? 1.5 : 1.15) + 2)), eE = Math.min(1, Math.abs(a) / (b.L + 2)), edge = Math.max(tE, eE);
      const m = Math.max(0, (edge - 0.82) / 0.18);
      for (let c = 0; c < 3; c++) col[i * 3 + c] = (S.core[c] * (1 - m) + S.edge[c] * m) * n;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    b.col0 = col.slice();
    const tex = BattleTerrain3D.bermSoilTexture();
    // map (~0,8 trung bình) nhân màu đỉnh -> nâng màu đỉnh bù lại; đất khô nhám, bùn ướt hơi bóng
    b.mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, map: tex, bumpMap: tex, bumpScale: S.wet ? 0.35 : 0.8,
      roughness: S.wet ? 0.62 : 0.97, metalness: 0, color: new THREE.Color(1.22, 1.22, 1.22) }));
    b.mesh.castShadow = b.mesh.receiveShadow = true;
    b.mesh.frustumCulled = false;
    this.group.add(b.mesh);
    // cục đất vón & đá lẫn trong đất rải trên lưng ụ (đặt lại theo mặt ụ mỗi khi ụ cao lên — setBermLevel): nhiều cục nhỏ
    // vùi nửa thân trong đất, ít cục to; ~1/4 là sỏi đá màu đá nền
    if (!Terrain3DClod) Terrain3DClod = new THREE.DodecahedronGeometry(1, 0);
    const clodMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(S.clod[0], S.clod[1], S.clod[2]), roughness: S.wet ? 0.55 : 1, flatShading: true });
    const rock = S.rock || [0.4, 0.38, 0.35];
    const stoneMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(rock[0], rock[1], rock[2]), roughness: S.wet ? 0.5 : 0.9, flatShading: true });
    b.clods = [];
    const nClod = opts.clods !== undefined ? opts.clods : Math.round(b.L * 1.6);
    for (let i = 0; i < nClod; i++) {
      const a = (Math.random() * 2 - 1) * b.L * 0.9, f = (Math.random() * 2 - 1) * b.W * 0.8;
      const stone = Math.random() < 0.25;
      const m = new THREE.Mesh(Terrain3DClod, stone ? stoneMat : clodMat);
      const r = Math.random();
      const sz = (0.22 + r * r * 0.9) * (S.sand ? 0.55 : 1) * (stone ? 0.8 : 1);   // phần lớn cục nhỏ, thỉnh thoảng cục to
      m.scale.set(sz * (0.8 + Math.random() * 0.5), sz * (0.45 + Math.random() * 0.3), sz * (0.8 + Math.random() * 0.5));
      m.rotation.set(Math.random() * 3, Math.random() * 6, Math.random() * 3);
      m.castShadow = sz > 0.5; m.receiveShadow = true;
      m.userData.a = a; m.userData.f = f; m.userData.sz = sz;
      m.userData.wx = x + a * b.cx + f * b.fx; m.userData.wz = z + a * b.cz + f * b.fz;
      b.mesh.add(m);
      b.clods.push(m);
    }
    this.setBermLevel(b, 0);
    return b;
  }

  // Màu đất ụ theo mặt đất tại chỗ ủi (ExplosionFX.surfacePalette): core = đất mới lật (ẩm, sẫm hơn mặt đất), edge = mặt
  // đất xung quanh, clod = cục đất vón. Trời mưa: đất lật lên là bùn sũng nước (sẫm hơn, cục bùn bóng)
  bermSoil(x, z) {
    const fx = typeof ExplosionFX !== 'undefined' && ExplosionFX.forScene ? ExplosionFX.forScene(this.scene) : null;
    let pal = fx && fx.surfacePalette ? fx.surfacePalette(x, z, 'GROUND') : null;
    if (pal && (pal.mat === 'asphalt' || pal.mat === 'hard')) pal = fx.palette('GROUND');   // lưỡi ủi cạo lớp nhựa / bê tông: lộ đất nền
    const wet = !!(this.weather && this.weather.rain);
    const sand = !!(pal && pal.mat === 'sand') || this.mapType === 'DESERT';
    const soil = pal ? pal.soil : [0.38, 0.3, 0.21], dark = pal ? pal.dark : [0.12, 0.1, 0.08], dust = pal ? pal.dust : [0.6, 0.55, 0.45];
    const mix = (p, q, t, k = 1) => [(p[0] + (q[0] - p[0]) * t) * k, (p[1] + (q[1] - p[1]) * t) * k, (p[2] + (q[2] - p[2]) * t) * k];
    // cát: lớp dưới ẩm sẫm hơn mặt cát khô một chút; đất: lật lên nâu sẫm ẩm
    // đất (không phải cát): kéo về sắc nâu đất mới lật — bảng màu bản đồ vùng cỏ ngả ô-liu xám, đắp lên trông như ụ nhựa xanh
    const BROWN = [0.36, 0.26, 0.17];
    const core = sand ? mix(soil, dust, 0.15, wet ? 0.78 : 0.95) : mix(mix(soil, dark, 0.22), BROWN, 0.4, wet ? 0.7 : 0.9);
    const edge = sand ? mix(dust, soil, 0.35, wet ? 0.8 : 0.95)
      : this.mapType === 'URBAN' ? [0.36, 0.35, 0.33] : this.mapType === 'JUNGLE' ? [0.22, 0.25, 0.13] : [0.27, 0.29, 0.16];
    const clod = sand ? mix(soil, dark, 0.3, 0.85) : mix(mix(dark, soil, 0.45), BROWN, 0.3, wet ? 0.72 : 0.95);
    // bụi đất khô bốc lên khi ủi (game.js digFx): màu bụi mặt đất bản đồ, sáng & nhạt (không phải khói xám)
    return { core, edge, clod, wet, sand, rock: pal ? pal.rock : null, dust: sand ? [0.76, 0.66, 0.5] : mix(dust, BROWN, 0.2) };
  }

  // Dời ụ đang được lưỡi ủi đẩy tới vị trí mới (giữ nguyên lưới, vật liệu): đất trên lưng ụ CUỘN về phía trước — cục đất
  // trượt từ mặt lưỡi lên đỉnh đống rồi lăn đổ xuống mặt trước, lộn vòng theo quãng đẩy; tới chân trước thì bị lưỡi vùi
  // xuống, trồi lại sát mặt lưỡi (ẩn dưới đất nên không thấy nhảy)
  moveBerm(b, x, z, yaw) {
    if (!b || !b.mesh) return;
    const adv = (x - b.x) * b.fx + (z - b.z) * b.fz;
    // lưỡi ủi đẩy tới: đất cuộn lấp dần các vết nổ khoét trên ụ
    if (adv > 0 && b.dents) {
      for (const d of b.dents) d.d *= Math.max(0, 1 - adv * 0.08);
      b.dents = b.dents.filter(d => d.d > 0.3);
    }
    b.x = x; b.z = z; b.yaw = yaw; b.slump = b.slumpDrawn = 0;   // đất vừa được lưỡi vun lại: chưa sụt
    b.fx = -Math.sin(yaw); b.fz = -Math.cos(yaw); b.cx = -b.fz; b.cz = b.fx;
    for (let i = 0; i < b.base.length; i++) {
      const a = b.af[i * 2], f = b.af[i * 2 + 1];
      const wx = x + a * b.cx + f * b.fx, wz = z + a * b.cz + f * b.fz;
      b.wxz[i][0] = wx; b.wxz[i][1] = wz;
      b.base[i] = this._elevBase(wx, wz);
    }
    const W = b.W * 0.85;
    for (const c of b.clods || []) {
      const u = c.userData;
      if (adv > 0) {
        // mặt sau (sát lưỡi) đất bị ép trồi lên chậm, qua đỉnh thì lăn nhanh xuống mặt trước
        u.f += adv * (u.f < 0 ? 0.7 : 1.5) * (0.8 + 0.4 * ((u.sz * 7) % 1));
        if (u.f > W) { u.f = -W + (u.f - W) * 0.3; u.a = (Math.random() * 2 - 1) * b.L * 0.9; }
        c.rotation.x -= adv * (u.f < 0 ? 0.3 : 1.1) / Math.max(0.4, u.sz);
      }
      u.wx = x + u.a * b.cx + u.f * b.fx; u.wz = z + u.a * b.cz + u.f * b.fz;
    }
    this.setBermLevel(b, b.k);
  }

  setBermLevel(b, k) {
    b.k = Math.max(0, Math.min(1, k));
    if (!b.mesh) return;
    const pos = b.mesh.geometry.attributes.position, col = b.mesh.geometry.attributes.color;
    // đỉnh chỉ tính ụ này; lún 0,4 đv vào đất để không hở mép. Đất trên đỉnh ụ (đã lộ gió, khô) sáng hơn chân ụ —
    // trời mưa thì cả ụ sũng nước như nhau
    const dry = b.soil && b.soil.wet ? 0.03 : 0.16;
    for (let i = 0; i < pos.count; i++) {
      const [wx, wz] = b.wxz[i];
      const hh = this.bermAt(wx, wz, b);
      const cut = b.dents ? this.bermDent(b, b.af[i * 2], b.af[i * 2 + 1]) : 0;
      // chỗ ụ bị nổ khoét sạch: đỉnh lưới chìm hẳn xuống dưới đất (không thành tấm nắp đậy lên hố nổ ở đất nền)
      pos.setXYZ(i, wx, b.base[i] + hh - (hh <= 0.05 && cut > 0.5 ? 3 : 0.4), wz);
      let lit = 1 - dry / 2 + dry * Math.min(1, hh / Math.max(1, b.H));
      // lòng vết khoét: đất ẩm phía trong lộ ra + muội thuốc nổ -> sẫm hơn
      if (cut > 0) lit *= 1 - 0.38 * Math.min(1, cut / 5);
      col.setXYZ(i, b.col0[i * 3] * lit, b.col0[i * 3 + 1] * lit, b.col0[i * 3 + 2] * lit);
    }
    pos.needsUpdate = true; col.needsUpdate = true;
    // cục đất nằm trên mặt ụ (ụ còn thấp: chìm hẳn, chưa thấy)
    for (const c of b.clods || []) {
      const hh = this.bermAt(c.userData.wx, c.userData.wz, b);
      c.visible = hh > 1.2;
      // vùi gần nửa thân vào đất (không nằm chỏng chơ trên mặt nhẵn)
      c.position.set(c.userData.wx, this._elevBase(c.userData.wx, c.userData.wz) + hh - 0.4 * c.userData.sz, c.userData.wz);
    }
    b.mesh.geometry.computeVertexNormals();
    b.mesh.geometry.computeBoundingSphere();
  }

  removeBerm(b) {
    const i = this.berms.indexOf(b);
    if (i >= 0) this.berms.splice(i, 1);
    if (b.mesh) {
      this.group.remove(b.mesh); b.mesh.geometry.dispose(); b.mesh.material.dispose();   // (vân đất dùng chung: không huỷ)
      if (b.clods) for (const m of new Set(b.clods.map(c => c.material))) m.dispose();
      b.mesh = null; b.clods = null;
    }
  }

  // Ụ đất chắn giữa điểm nổ (ex, ey, ez) và xe (ux, uy, uz): đất hút mảnh văng & phần lớn sức ép -> hệ số sát thương nổ lan
  // (1 = không che). Dò dọc đoạn thẳng: đoạn nào chui dưới mặt ụ là bị chặn; ụ càng dày (ngập càng sâu) càng chặn nhiều
  // Gò / sống đất / mép hố bom (mặt đất _elevBase: kể cả sàn kênh & ụ cứ điểm, KHÔNG tính ụ xe ủi — đã có bermShield)
  // chắn giữa điểm nổ và xe: đường thẳng điểm nổ -> thân xe chui dưới mặt đất -> mảnh văng bị đất chặn, chỉ còn sức ép
  // vòng qua đỉnh. Bỏ hai đầu đoạn (miệng hố quả đạn vừa đào, gầm xe nằm sát đất). 1 = không che
  terrainShield(ex, ey, ez, ux, uy, uz) {
    let deep = 0;
    for (let i = 2; i < 15; i++) {
      const t = i / 16, x = ex + (ux - ex) * t, z = ez + (uz - ez) * t, y = ey + (uy - ey) * t;
      const top = this._elevBase(x, z);
      if (y < top) deep = Math.max(deep, top - y);
    }
    return deep <= 0.5 ? 1 : Math.max(0.25, 1 - 0.75 * Math.min(1, deep / 8));
  }

  // ĐẠN BAY XUYÊN Ụ ĐẤT GIỮA HAI BƯỚC MÔ PHỎNG: đạn bắn thẳng bay ~100+ đv mỗi bước, hai đầu bước đều trên mặt đất -> trước
  // đây lọt qua ụ dày ~3-4 m (đạn súng máy / 30mm / xuyên giáp trúng thân xe nấp sau ụ như bãi trống). Dò dày (~1,5 đv) phần
  // đoạn bay đi qua vòng bao các ụ còn đất; trả t (0..1) của mẫu đầu tiên chìm dưới mặt đất (getElevationAt đã cộng ụ) — bên
  // gọi chia đôi tìm đúng mặt chạm. -1: không chạm ụ nào
  bermSegmentHit(x0, y0, z0, x1, y1, z1, off = 0) {
    if (!this.berms || !this.berms.length) return -1;
    const dx = x1 - x0, dz = z1 - z0, L2 = dx * dx + dz * dz;
    if (L2 < 1e-6) return -1;
    let lo = 2, hi = -1, top = -Infinity;
    for (const b of this.berms) {
      if (!b.mesh || b.k * b.H < 1.5) continue;
      // đoạn (chiếu ngang) cắt vòng bao ụ: khoảng t vào / ra
      const px = x0 - b.x, pz = z0 - b.z, B = px * dx + pz * dz, C = px * px + pz * pz - b.R2;
      const disc = B * B - L2 * C;
      if (disc <= 0) continue;
      const s = Math.sqrt(disc), ta = (-B - s) / L2, tb = (-B + s) / L2;
      if (tb < 0 || ta > 1) continue;
      lo = Math.min(lo, Math.max(0, ta)); hi = Math.max(hi, Math.min(1, tb));
      top = Math.max(top, this._elevBase(b.x, b.z) + b.H * 1.6 + 10);   // (+10: nền dốc dưới ụ)
    }
    if (hi < lo) return -1;
    // cả đoạn qua vùng ụ đều cao hơn đỉnh ụ cao nhất: bỏ qua (đạn cầu vồng / bay cao)
    if (Math.min(y0 + (y1 - y0) * lo, y0 + (y1 - y0) * hi) > top) return -1;
    const n = Math.min(160, Math.max(2, Math.ceil((hi - lo) * Math.sqrt(L2) / 1.5)));
    for (let i = 0; i <= n; i++) {
      const t = lo + (hi - lo) * i / n;
      const x = x0 + dx * t, z = z0 + dz * t, y = y0 + (y1 - y0) * t;
      if (y - this.getElevationAt(x, z) + off <= 0) return t;
    }
    return -1;
  }

  bermShield(ex, ey, ez, ux, uy, uz) {
    if (!this.berms || !this.berms.length) return 1;
    let deep = 0;
    for (let i = 1; i < 16; i++) {
      const t = i / 16, x = ex + (ux - ex) * t, z = ez + (uz - ez) * t, y = ey + (uy - ey) * t;
      const bh = this.bermAt(x, z);
      if (bh < 1.5) continue;
      const top = this._elevBase(x, z) + bh;
      if (y < top) deep = Math.max(deep, top - y);
    }
    return deep <= 0 ? 1 : Math.max(0.2, 1 - 0.8 * Math.min(1, deep / 6));
  }

  _elevBase(x, z) {
    if (this.strongholdSet) {
      const sh = this.strongholdSet.surfaceAt(x, z);
      if (sh !== null) return sh;
    }
    let g = this.groundAtRaw(x, z);
    // công trình có mặt đất riêng (sân khoét hầm sinh học + nắp đất gò): lưới thô bên dưới đã bị hạ
    if (this.landmarkSet && this.landmarkSet.surf && this.landmarkSet.surf.length) { const s = this.landmarkSet.surfaceAt(x, z, g); if (s !== null) g = s; }
    if (this.bridges.length) {
      const br = this.bridgeAt(x, z);
      if (br) return Math.max(g, br.y !== undefined ? br.y : br.b.deckY);
      // nhịp cầu đang sập / đã đổ: xe rơi theo mặt nhịp, không xuyên qua dầm nằm dưới sông
      const fy = this.envDamage && this.envDamage.bridges.brokenDeckAt ? this.envDamage.bridges.brokenDeckAt(x, z) : null;
      if (fy !== null) return Math.max(g, fy);
    }
    if (this.map && this.map.canals && this.map.canals.length) {
      const q = this.canalQuayAt(x, z);
      if (q !== null && q > g) return q;
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
  // soil: chỉ là đất trong hố bị xe ủi / san (gọi dày khi xe lăn qua hố): bỏ qua việc nặng không liên quan (rải lại cỏ)
  onGroundChanged(x0, z0, x1, z1, soil) {
    // ụ đất nằm trên vùng hố nổ: chân ụ hạ theo đất nền mới
    if (this.berms) for (const b of this.berms) {
      if (!b.mesh) continue;
      const R = Math.sqrt(b.R2);
      if (b.x + R < x0 || b.x - R > x1 || b.z + R < z0 || b.z - R > z1) continue;
      for (let i = 0; i < b.base.length; i++) b.base[i] = this._elevBase(b.wxz[i][0], b.wxz[i][1]);
      this.setBermLevel(b, b.k);
    }
    if (!soil && this.groundCover && this.groundCover.reground) this.groundCover.reground(x0, z0, x1, z1);
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

  // Mặt đất xích / bánh THẬT SỰ tì lên: mặt nhìn thấy của hố bom (lòng hố sâu thật, gờ đất đắp), không phải lưới vật lý
  // thô (~2 m / ô, chỉ hạ ~75% ở vài đỉnh lưới -> xe lướt trên hố như không có)
  vehicleSurfaceAt(x, z, refY) {
    const g = this.getVehicleGroundAt(x, z, refY);
    const fx = this._fxSurf !== undefined ? this._fxSurf : (typeof ExplosionFX !== 'undefined' && ExplosionFX.forScene ? ExplosionFX.forScene(this.scene) : null);
    if (fx) this._fxSurf = fx;
    return fx && fx.craterSurfaceAt ? fx.craterSurfaceAt(x, z, g) : g;
  }
  // Có hố bom nào trong bán kính r quanh (x, z)
  cratersNear(x, z, r) {
    const fx = this._fxSurf !== undefined ? this._fxSurf : (typeof ExplosionFX !== 'undefined' && ExplosionFX.forScene ? ExplosionFX.forScene(this.scene) : null);
    if (fx) this._fxSurf = fx;
    return !!(fx && fx.cratersNear && fx.cratersNear(x, z, r));
  }

  waterSurfaceAt(x, z) {
    // trời mưa: nước ngập lòng hầm cứ điểm, nước đọng trong hố bom
    if (this.weather && this.weather.rain) {
      const f = this.strongholdSet && this.strongholdSet.floodAt ? this.strongholdSet.floodAt(x, z) : null;
      if (f !== null) return f;
      const fx = this._fxSurf !== undefined ? this._fxSurf : (typeof ExplosionFX !== 'undefined' && ExplosionFX.forScene ? ExplosionFX.forScene(this.scene) : null);
      const c = fx ? Weather.craterWaterAt(fx, x, z) : null;
      if (c !== null) return c;
    }
    if (!this.waterMesh) return null;
    if (this.groundAtRaw(x, z) >= this.waterLevel - 0.1) return null;
    if (this.bridges.length && this.bridgeAt(x, z)) return null;
    return this.waterMesh.position.y;
  }

  isPositionInBush(x, z) {
    for (let i = 0; i < this.bushClusters.length; i++) {
      const c = this.bushClusters[i];
      const dx = x - c.x, dz = z - c.z;
      if (dx * dx + dz * dz <= c.radius * c.radius) return true;
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
    if (this.landmarkSet) top = Math.max(top, this.landmarkSet.maxTop());
    for (const br of this.bridges) top = Math.max(top, br.deckY !== undefined ? br.deckY : -Infinity);
    if (this.propSet) for (const sg of this.propSet.bagSegs) top = Math.max(top, Math.max(sg.g0, sg.g1) + sg.top);
    // lề: gờ đất quanh hố bom, dầm / gờ nhô, sai số nội suy
    const y = top + 30;
    this._shotCeil = { h: H, sig, sh: this.strongholdSet, y };
    return y;
  }

  // Va chạm đạn với vật cản (nhà, tường & mái boong-ke, đá tảng)
  // skipBuildings: nhà còn đứng đã được dò chính xác theo đoạn bay (buildingSegmentHit) -> chỉ còn xét đống đổ nát
  // ammo (tùy chọn): loại đạn đang bay — rào gỗ / tre để đạn động năng lọt qua (PropSet.wallHit)
  checkHorseshoeCollision(x, y, z, skipBuildings, ammo) {
    if (this.propSet) { const pb = this.propSet.hitTest(x, y, z, ammo); if (pb) return pb; }
    if (this.strongholdSet) {
      const c = this.strongholdSet.concreteAt(x, y, z);
      if (c) return { hit: true, type: 'WALL', stronghold: c.K, normal: c.normal, x, y, z };
    }
    if (this.landmarkSet) { const lm = this.landmarkSet.hitTest(x, y, z); if (lm) return lm; }
    if (this.depotSet) { const dp = this.depotSet.hitTest(x, y, z); if (dp) return dp; }
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
      if (rock.noShot) continue;   // xác xe giữ lại: đạn trúng thẳng hộp thân xác (ballistics), không chặn bằng trụ tròn
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
    if (this.hasWater() && this.groundAtRaw(x, z) < -0.8) {
      const deep = this.groundAtRaw(x, z) < -6;
      return { type: 'WATER', speedMult: deep ? 0.4 : 0.6, elevation, friction: 0.7, bumpiness: 0.25, dustMult: 0.1, sinkY: deep ? -3 : -1.8, engineLoad: 1.6, name: deep ? 'LỘI NƯỚC SÂU (CHẬM, NGẬP XÍCH)' : 'LỘI NƯỚC NÔNG' };
    }
    const road = this.map.roadAt(x, z);
    if (road) {
      const R = TERRAIN_ROAD_INFO[road.kind];
      if (R) return { type: R.type, speedMult: R.speedMult, elevation, friction: 0.95, bumpiness: R.bumpiness, dustMult: R.dustMult, sinkY: R.sinkY, engineLoad: R.engineLoad, name: R.name };
    }
    // Độ dốc hiện tại
    const e = 10;
    const slope = Math.hypot(this.groundAtRaw(x + e, z) - this.groundAtRaw(x - e, z), this.groundAtRaw(x, z + e) - this.groundAtRaw(x, z - e)) / (2 * e);
    if (slope > 0.42 || (this.mapType === 'HIGHLAND' && elevation > 80)) {
      return { type: 'MOUNTAIN', speedMult: Math.max(0.2, slopeK(0.5)), elevation, friction: 0.8, bumpiness: 1.4, dustMult: 0.8, sinkY: 0, engineLoad: forwardSlope > 0.05 ? 1.85 : 0.95, name: `SƯỜN DỐC ĐÁ (+${Math.round(elevation)}M)` };
    }
    const base = TERRAIN_BASE_INFO[this.mapType];
    return { elevation, friction: 0.88, type: base.type, speedMult: slope > 0.2 ? slopeK(base.speedMult) : base.speedMult, bumpiness: base.bumpiness, dustMult: base.dustMult, sinkY: base.sinkY, engineLoad: base.engineLoad, name: base.name };
  }

  // Hộp vật cản (nhà) gần xe cho VehicleCollision: tường nhà còn đứng cao hết tầng, nhà sập còn đống đổ nát thấp
  // barrel: dò cho nòng (spg.applyWallBarrelBlock) — mọi mảng tường nhà còn đứng đều chặn, kể cả mảng thân xe sắp húc đổ
  vehicleObstacles(x, z, unit, barrel) {
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
    }
    // nhà còn đứng: hộp từng mảng tường / cột tầng trệt (mảng đã mất là lối vào; mảng xe đủ lực húc thì không chặn — ramObjects
    // đánh đổ khi chạm), nhà nguyên vẹn mà xe không húc nổi: một hộp cả nhà (BuildingSet.vehicleBoxes)
    if (this.buildingSet && this.buildingSet.vehicleBoxes) this.buildingSet.vehicleBoxes(x, z, reach + 10, unit, out, !!barrel);
    if (this.landmarkSet) this.landmarkSet.vehicleBoxes(x, z, reach + 10, out);
    // điểm tiếp tế hậu phương: xe tải + đống pallet (src/gameplay/supply_depot.js)
    if (this.depotSet) this.depotSet.vehicleBoxes(x, z, reach + 10, out);
    // tường đá / tường đất / bờ rào cây còn đứng mà xe này không đủ lực húc đổ (unit = null: ô tô bị đẩy -> mọi tường)
    if (this.propSet && this.propSet.vehicleBoxes) this.propSet.vehicleBoxes(x, z, reach + 10, unit, out);
    // khúc gốc thân cây đổ to hơn bậc leo của xe (xe leo được thì hullPush bỏ qua, xích trèo qua theo vehicleDebris)
    if (this.trees && this.trees.vehicleBoxes) this.trees.vehicleBoxes(x, z, reach + 10, out);
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
    // ô tô đỗ trên phố: xe xích leo lên cán (mặt đỡ thấp dần khi ô tô bẹp), ô tô đã bẹp dí thì mọi xe bò qua
    if (this.propSet && this.propSet.street) this.propSet.street.vehicleDebris(x, z, r, unit, out);
    // thân cây đổ & gốc cụt, đống đá tường sập, ụ bao cát (còn nguyên / bị đè bẹp)
    if (this.trees && this.trees.vehicleDebris) this.trees.vehicleDebris(x, z, r, out);
    if (this.propSet && this.propSet.vehicleDebris) this.propSet.vehicleDebris(x, z, r, out);
    return out.length ? out : null;
  }

  resolveVehicleCollision(currentX, currentZ, nextX, nextZ, vehicleRadius = 16, unit = null) {
    let resX = nextX, resZ = nextZ, hit = false, mat = null;   // mat: vật liệu vật cản vừa chạm (tiếng / bụi va chạm)
    // Cứ điểm: thân xe (hình hộp xoay theo hướng xe) không chui vào tường / ụ đất
    if (this.strongholdSet) {
      const r = this.strongholdSet.collideVehicle(resX, resZ, unit, vehicleRadius);
      if (r) { resX = r.x; resZ = r.z; hit = r.hit; if (r.hit) mat = 'concrete'; }
    }
    let roundHit = false;   // vật cản tròn (đá / khối pháo đài / cây) vừa đẩy xe trong bước này
    const pushOut = (cx, cz, r, m0) => {
      const dx = resX - cx, dz = resZ - cz, m = r + vehicleRadius;
      if (dx >= m || dx <= -m || dz >= m || dz <= -m) return;   // lọc thô trước khi khai căn
      const d2 = dx * dx + dz * dz;
      if (d2 < m * m && d2 > 1e-6) { const d = Math.sqrt(d2); resX = cx + dx * m / d; resZ = cz + dz * m / d; hit = true; roundHit = true; mat = m0 || 'rock'; }
    };
    const VC = unit && typeof VehicleCollision !== 'undefined' ? VehicleCollision : null;
    // Chia quãng đi thành bước <= ~6 đv: hộp nhà, lan can cầu, đá tảng, khối pháo đài, cây cùng xét trong TỪNG bước
    // (khung hình dài: xe nhanh không nhảy qua cây; đá đẩy ra không đẩy ngược vào tường nhà)
    const x0 = currentX, z0 = currentZ, sx = resX - x0, sz = resZ - z0, mv = Math.hypot(sx, sz);
    const n = Math.max(1, Math.min(10, Math.ceil(mv / 6)));
    // Nhà: hộp xoay (đống đổ nát vẫn chặn nhưng thấp - xe vẫn không chui qua được).
    // Xe thật: thân xe (hộp xoay theo hướng xe) + nòng pháo va vào tường nhà, trượt dọc theo tường
    const boxes = VC ? this.vehicleObstacles(x0 + sx / 2, z0 + sz / 2, unit) : null;
    const climb = VC ? (unit.y || 0) + VC.stepOf(unit) : -Infinity;
    // Cây còn đứng mà xe không đủ lực húc gãy ngay (TreeField.holds: sức thân cây theo đường kính so với lực kéo + đà xe)
    // chặn thân xe (hộp xoay theo hướng xe): xe trinh sát bị mọi cây chặn, xe tăng chạy chậm bị cây to chặn
    const trees = VC && this.trees && this.trees.holds ? this.trees.near(x0 + sx / 2, z0 + sz / 2, VC.reach(unit) + mv / 2) : null;
    const tob = trees && trees.length ? (this._tob || (this._tob = {})) : null, tcg = this._tcg || (this._tcg = {});
    resX = x0; resZ = z0;
    for (let s = 1; s <= n; s++) {
      const ax = resX, az = resZ;
      resX += sx / n; resZ += sz / n;
      roundHit = false;
      if (boxes && boxes.length) {
        const r = VC.resolve(unit, ax, az, resX, resZ, boxes);
        resX = r.x; resZ = r.z; hit = hit || r.hit;
        if (r.hit) {
          // vật liệu: hộp gần tâm xe nhất (đo khoảng cách ra ngoài mặt hộp)
          let bd = Infinity;
          for (const b of boxes) {
            const tx = resX - b.cx, tz = resZ - b.cz, e = Math.max(Math.abs(tx * b.ux + tz * b.uz) - b.hu, Math.abs(-tx * b.uz + tz * b.ux) - b.hv);
            if (e < bd) { bd = e; mat = b.mat || 'concrete'; }
          }
        }
      }
      if (!VC) for (const b of this.buildings) {
        if (Math.abs(resX - b.x) > b.radius + vehicleRadius + 10 || Math.abs(resZ - b.z) > b.radius + vehicleRadius + 10) continue;
        const R = b.ref;
        if (!R) { pushOut(b.x, b.z, b.radius); continue; }
        const c = Math.cos(-R.angle), sn = Math.sin(-R.angle);
        const dx = resX - R.x, dz = resZ - R.z;
        let lx = dx * c + dz * sn, lz = -dx * sn + dz * c;
        const hx = R.halfW + vehicleRadius * 0.8, hz = R.halfD + vehicleRadius * 0.8;
        if (Math.abs(lx) < hx && Math.abs(lz) < hz) {
          if (hx - Math.abs(lx) < hz - Math.abs(lz)) lx = Math.sign(lx) * hx; else lz = Math.sign(lz) * hz;
          resX = R.x + lx * c - lz * sn; resZ = R.z + lx * sn + lz * c;
          hit = true; mat = 'concrete';
        }
      }
      // Lan can cầu: xe ĐANG trên mặt cầu (hoặc từ đầu cầu chạy vào, cao ngang mặt cầu) thì lan can giữ xe trên cầu;
      // xe ở ngoài (lội sông cạnh cầu, bãi bờ thấp) thì lan can chặn từ phía ngoài — không kéo xe lên mặt cầu
      for (const br of this.bridges) {
        const dx = resX - br.x, dz = resZ - br.z;
        const along = dx * br.f.x + dz * br.f.z, across = -dx * br.f.z + dz * br.f.x;
        if (Math.abs(along) > br.length / 2 - 4) continue;
        const halfW = br.width / 2, aa = Math.abs(across);
        if (aa <= halfW - vehicleRadius || aa >= halfW + 12 + vehicleRadius) continue;
        const sp = br.spans && this.envDamage ? this.envDamage.bridges.spanAt(br, along) : null;
        if (sp && sp.state !== 'ok') continue;   // nhịp sập: lan can rơi theo
        const ox = x0 - br.x, oz = z0 - br.z;
        const al0 = ox * br.f.x + oz * br.f.z, ac0 = -ox * br.f.z + oz * br.f.x;
        const onDeck = Math.abs(ac0) < halfW && Math.abs(al0) <= br.length / 2;
        const fromEnd = Math.abs(al0) > br.length / 2 - 4 && Math.abs(ac0) < halfW + 12 && (!unit || (unit.y || 0) > br.deckY - 6);
        let na;
        if (onDeck || fromEnd) {
          if (!onDeck && aa >= halfW + 12) continue;
          na = Math.sign(across) * (halfW - vehicleRadius);
        } else {
          if (aa >= halfW + 12) continue;
          na = Math.sign(ac0 || across) * (halfW + 12);
        }
        resX = br.x + along * br.f.x - na * br.f.z;
        resZ = br.z + along * br.f.z + na * br.f.x;
        hit = true; mat = 'metal';
      }
      for (const fort of this.horseshoeForts) {
        if (Math.hypot(resX - fort.x, resZ - fort.z) > fort.outerRadius + 35) continue;
        // gốc tường gãy thấp hơn bậc leo được: xích bò qua (thành mặt đỡ trong vehicleDebris), không chặn như tường
        for (const block of fort.wallBlocks) if (block.y1 > climb) pushOut(block.x, block.z, block.radius, 'concrete');
      }
      for (const rock of this.boulders) {
        // xác xe trên bản đồ mà xe này đủ lực ủi: props.wreckContact đã dời xác xe / giữ xe theo hộp thân xác xe
        if (rock.wreckOf && unit && this.propSet && this.propSet.pushesWreck(rock.wreckOf, unit)) continue;
        pushOut(rock.x, rock.z, rock.radius || 18, rock.wreck ? 'wreck' : rock.mat || 'rock');
      }
      if (tob) {
        VC.vehObb(unit, resX, resZ, unit.bodyAngle || 0, tob);
        for (const it of trees) {
          if (it.fallen || it.shattered) continue;
          VC.circleGap(tob, it.x, it.z, it.trunkR || 1.5, tcg);
          if (tcg.gap >= 0) continue;
          if (!this.trees.holds(it, unit, Math.max(0, VC.approach(unit, tcg.nx, tcg.nz)))) {
            // đủ lực: để xe lấn vào, TreeField.ram (cuối khung) đánh đổ đúng cây này dù tốc độ xe vừa tụt
            it._goU = unit; it._goT = typeof performance !== 'undefined' ? performance.now() / 1000 : 0;
            continue;
          }
          const k = -tcg.gap;
          resX += tcg.nx * k; resZ += tcg.nz * k; tob.cx += tcg.nx * k; tob.cz += tcg.nz * k;
          hit = true; roundHit = true; mat = 'tree';
        }
      }
    }
    // bước cuối bị vật cản tròn đẩy: đẩy lại khỏi hộp nhà (không kẹt nửa thân trong tường)
    if (roundHit && boxes && boxes.length) {
      const r = VC.resolve(unit, resX, resZ, resX, resZ, boxes);
      resX = r.x; resZ = r.z;
    }
    return { x: resX, z: resZ, hit, mat };
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
      ctx.strokeStyle = '#2f6f8f';
      ctx.lineCap = 'round';
      BattleTerrain3D.strokeRiver(ctx, this.map.river, P, sc);
    }
    for (const L of this.map.lakes) { ctx.fillStyle = '#2f6f8f'; ctx.beginPath(); ctx.arc(P(L.x), P(L.z), L.r * sc, 0, 6.283); ctx.fill(); }
    for (const c of this.map.canals || []) {   // kênh đào đô thị
      ctx.strokeStyle = '#2f6f8f'; ctx.lineWidth = c.hw * 2 * sc; ctx.lineCap = 'butt';
      ctx.beginPath(); ctx.moveTo(P(c.pts[0][0]), P(c.pts[0][1])); ctx.lineTo(P(c.pts[1][0]), P(c.pts[1][1])); ctx.stroke();
    }
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
    // Công trình bối cảnh (bệ phóng, hầm sinh học, trận địa phòng không)
    if (this.landmarkSet) this.landmarkSet.drawOnMap(ctx, P, sc, false);
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
    // Phủ tối ngoài lòng thung lũng: bản đồ nhỏ thấy đúng hình dạng vùng chiến đấu
    BattleTerrain3D.shadeOutside(ctx, this.map, P, w);
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
// độ che tán (Destructibles.TreeField.canopyCover) từ mức này trở lên: tính là núp dưới tán
BattleTerrain3D.CANOPY_HIDE = 0.6;

// Cảnh nền ngoài bản đồ (Backdrop) + mặt biển xa dần hòa hẳn vào màu sương trong khoảng [x, y] (camera far = 9000).
// Dùng chung một uniform: đổi giá trị là mọi vật liệu cảnh nền đổi theo (vd ảnh toàn cảnh khi xem cả đảo)
BattleTerrain3D.FAR_FADE = { value: new THREE.Vector2(6000, 8700) };
BattleTerrain3D.farFadeGLSL = (alpha) => `#ifdef USE_FOG
  {
    float farK = smoothstep(farFade.x, farFade.y, length(vViewPosition));
    gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, farK);${alpha ? '\n    gl_FragColor.a = mix(gl_FragColor.a, 1.0, farK);' : ''}
  }
  #endif`;
// gắn uniform farFade + đoạn hòa sương xa vào shader đã biên dịch
BattleTerrain3D.applyFarFade = (sh, alpha) => {
  sh.uniforms.farFade = BattleTerrain3D.FAR_FADE;
  sh.fragmentShader = 'uniform vec2 farFade;\n' + sh.fragmentShader.replace('#include <fog_fragment>', '#include <fog_fragment>\n' + BattleTerrain3D.farFadeGLSL(alpha));
};

// Vẽ sông lên canvas 2D (ảnh nền mặt đất, bản đồ nhỏ, bản đồ chiến thuật): bề rộng theo từng đoạn (rộng dần về hạ lưu)
// + suối nhỏ đầu nguồn. P: toạ độ thế giới -> điểm ảnh; sc: điểm ảnh / đơn vị
BattleTerrain3D.strokeRiver = (ctx, R, P, sc) => {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const line of [R.pts, R.inlet || []]) {
    for (let i = 0; i < line.length - 1; i++) {
      ctx.lineWidth = 2 * (line[i][2] || R.width / 2) * sc;
      ctx.beginPath(); ctx.moveTo(P(line[i][0]), P(line[i][1])); ctx.lineTo(P(line[i + 1][0]), P(line[i + 1][1])); ctx.stroke();
    }
  }
};

// Bản đồ 2D: phủ tối phần ngoài lòng thung lũng (sườn vành núi phía ngoài tường giữ xe, cảnh nền) theo đúng đường chân
// núi của bản đồ -> thấy hình dạng thật của vùng chiến đấu. P: toạ độ thế giới -> điểm ảnh; size: cạnh canvas (điểm ảnh)
// lw: bề dày nét chân núi (mặc định theo size — vùng phóng gần như minimap truyền riêng)
BattleTerrain3D.shadeOutside = (ctx, map, P, size, lw) => {
  const O = map && map.outer;
  if (!O || !O.rimFoot) return;
  const ring = [];
  for (let a = 0; a < 360; a++) {
    const t = a / 360 * Math.PI * 2, c = Math.cos(t), s = Math.sin(t), r = O.rimFoot(c * 2000, s * 2000) + O.wall * 0.35;
    ring.push([P(c * r), P(s * r)]);
  }
  const path = () => { ctx.moveTo(ring[0][0], ring[0][1]); for (let i = 1; i < ring.length; i++) ctx.lineTo(ring[i][0], ring[i][1]); ctx.closePath(); };
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, size, size); path();
  ctx.fillStyle = 'rgba(6, 10, 12, 0.5)'; ctx.fill('evenodd');
  ctx.beginPath(); path();
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)'; ctx.lineWidth = lw || Math.max(2, size / 220); ctx.stroke();
  ctx.restore();
};
