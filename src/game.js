/**
 * Bộ điều phối trò chơi 3D Three.js - Góc nhìn từ trên nghiêng xuống chuẩn Art of War 3
 */

// Tra phần tử giao diện theo id có nhớ đệm: vòng lặp game cập nhật HUD mỗi khung hình (~80 chỗ tra id) -> không tra lại DOM
// mỗi lần. Phần tử bị gỡ khỏi trang (isConnected = false) thì tra lại; không nhớ kết quả rỗng.
const __domCache = new Map();
function domById(id) {
  const el = __domCache.get(id);
  if (el && el.isConnected) return el;
  const found = document.getElementById(id);
  if (found) __domCache.set(id, found);
  else __domCache.delete(id);
  return found;
}

class ArtilleryGame3D {
  constructor() {
    this.container = domById('webgl-container');

    this.worldWidth = MapGen.SIZE;
    this.worldDepth = MapGen.SIZE;

    // 1. Khởi tạo Three.js Scene, Camera, Renderer
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xd6ba78); // Màu trời sa mạc vàng ấm

    this.camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      1,
      9000   // xa đủ để từ camera pháo binh trên cao vẫn thấy biển / đảo xa thay vì mảng trời bị cắt
    );

    // high-performance: máy có 2 card (laptop Intel + NVIDIA/AMD) chạy game bằng card rời thay vì card tích hợp
    this.renderer = new THREE.WebGLRenderer({ antialias: !(window.GameMenu && GameMenu.wantAntialias() === false), powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Nén vùng sáng mềm (không cháy trắng / xanh neon), trung tông giữ nguyên — xem SkySystem.installToneCurve
    if (typeof SkySystem !== 'undefined' && SkySystem.installToneCurve) SkySystem.installToneCurve(this.renderer, 1.1);
    this.container.appendChild(this.renderer.domElement);

    // 2. Thiết lập Ánh sáng Sa mạc & Bóng đổ 3D
    this.setupLighting();

    // 3. Khởi tạo Địa hình 3D, Vật lý đường đạn 3D, Radar, Vòng bo
    this.currentMapType = 'DESERT';
    this.terrain = new BattleTerrain3D(this.scene, this.worldWidth, this.worldDepth, this.currentMapType);
    this.mapSeed = this.terrain.seed;
    this.applyAtmosphereLights();
    this.ballistics = new BallisticsSystem3D(this.scene);
    this.ballistics.vegetationProvider = () => this.terrain && this.terrain.trees;
    this.ballistics.terrainProvider = () => this.terrain;
    this.radar = new CounterBatteryRadar();
    this.zone = new BattleZone(this.worldWidth, this.worldDepth);

    // Danh sách xe pháo tự hành 3D
    this.units = [];
    this.player = null;

    // Hệ thống tự động khóa mục tiêu và chuyển đổi đối tượng (Phím Tab)
    this.lockedTarget = null;
    this.autoLockCooldown = 0;

    // Hệ thống các hòm tiếp tế rải rác trên bản đồ chiến trường
    this.supplyCrates = [];

    // Hệ thống 3 Cứ Điểm Chiến Lược A, B, C (Chiếm giữ 60s liên tục là thắng ngay)
    this.capturePoints = [];

    // Vụ nổ & Sóng chấn động 3D
    this.explosions3D = [];
    this.cameraShake = 0;

    // Minimap Art of War 3
    this.miniCanvas = domById('aow-minimap-canvas');
    this.miniCtx = this.miniCanvas ? this.miniCanvas.getContext('2d') : null;
    this.miniScannerAngle = 0;


    this.keys = {};
    this.lastTime = performance.now();
    this.matchStartTime = Date.now();
    this.isGameOver = false;

    // THỂ THỨC ĐẤU ĐỘI DEATHMATCH: CHIẾN ĐẤU TRONG 10 PHÚT (600 GIÂY), HOẶC GIỮ CỨ ĐIỂM QUÁ 1 PHÚT LÀ THẮNG
    this.matchDuration = 600; // 10 phút thi đấu = 600 giây
    this.respawnWaitPenalty = 10.0; // Mỗi lần hồi sinh bị phạt chờ 10 giây
    this.maxTeamLives = Infinity; // Hồi sinh vô hạn lần
    this.blueLives = Infinity;
    this.redLives = Infinity;
    this.blueKills = 0;
    this.blueDeaths = 0;
    this.redKills = 0;
    this.redDeaths = 0;
    this.respawnQueue = [];

    // ĐƯỜNG ĐẠN DỰ KIẾN TỪ ĐẦU NÒNG: dải vạch mảnh có nhịp (world_markers.js)
    this.trajectoryLine = WorldMarkers.trajectory();
    this.trajectoryMat = this.trajectoryLine.material;
    this.scene.add(this.trajectoryLine);

    this.tacticalMap = new TacticalMapController(this);

    // Hòm Tiếp Tế Hỏa Lực Thả Dù Chiến Thuật
    this.airdrop = null;
    this.airdropTimer = 25;

    // Trạng thái ghép trận & Bắt đầu trận chiến
    this.isGameStarted = false;

    // Khởi tạo các hệ thống tính năng module hóa (Modular Managers)
    if (typeof CapturePointsManager !== 'undefined') {
      this.capturePointsManager = new CapturePointsManager(this);
    }
    if (typeof SupplyManager !== 'undefined') {
      this.supplyManager = new SupplyManager(this);
    }
    if (typeof EffectsManager !== 'undefined') {
      this.effectsManager = new EffectsManager(this);
      this.explosions3D = this.effectsManager.explosions3D;
      if (this.ballistics) this.ballistics.fx = this.effectsManager.fx;
    }
    if (typeof HUDController !== 'undefined') {
      this.hud = new HUDController(this);
    }

    this.initEntities3D();
    this.initInput();
    this.initHUD();

    // Khởi tạo hoặc liên kết Sảnh Chờ Ghép Trận Nhiều Người Chơi
    if (window.matchmakingController) {
      this.matchmaking = window.matchmakingController;
      this.matchmaking.game = this;
    } else {
      this.matchmaking = new MatchmakingController(this);
      window.matchmakingController = this.matchmaking;
    }
    window.game = this;
    window.artilleryGame = this;
    // [NET] Dựng sẵn bản đồ theo loại + hạt giống của sảnh chờ (prepareMap) ngay khi game sẵn sàng
    if (this.matchmaking && typeof this.matchmaking.onGameAttached === 'function') this.matchmaking.onGameAttached(this);

    // Khởi tạo hoặc liên kết Phòng Trưng Bày & Chi Tiết Thiết Kế Xe Tăng 3D
    if (window.tankInspector) {
      this.tankInspector = window.tankInspector;
      this.tankInspector.game = this;
    } else if (typeof TankInspector !== 'undefined') {
      this.tankInspector = new TankInspector(this);
      window.tankInspector = this.tankInspector;
    }

    window.addEventListener('resize', () => this.onResize());

    // Bắt đầu vòng lặp game 3D
    requestAnimationFrame((t) => this.loop(t));
  }

  setupLighting() {
    // Ánh sáng môi trường: ambient nhẹ + ánh trời bán cầu (trời xanh phía trên, đất phản xạ phía dưới)
    const ambientLight = new THREE.AmbientLight(0xfff5e4, 0.75);
    this.scene.add(ambientLight);
    this.ambientLight = ambientLight;
    this.hemiLight = new THREE.HemisphereLight(0xcfe0f5, 0x8a7458, 0.0);
    this.scene.add(this.hemiLight);

    // Ánh sáng mặt trời chiếu nghiêng 45 độ tạo bóng đổ sâu sắc nét như ảnh
    this.sunLight = new THREE.DirectionalLight(0xfff7e8, 1.35);
    this.sunLight.position.set(-600, 1100, -500);
    this.sunLight.castShadow = true;

    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 100;
    this.sunLight.shadow.camera.far = 3000;
    this.sunLight.shadow.camera.left = -900;
    this.sunLight.shadow.camera.right = 900;
    this.sunLight.shadow.camera.top = 900;
    this.sunLight.shadow.camera.bottom = -900;
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.normalBias = 0.8;   // chống sọc bóng tự đổ trên mặt dốc khi nắng thấp

    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    // Bể đèn chớp (lửa đầu nòng / chớp nổ) tạo NGAY TỪ ĐẦU: trước đây bể chỉ được tạo lúc phát bắn đầu tiên ->
    // số đèn trong cảnh đổi -> Three.js biên dịch lại shader của MỌI vật liệu giữa lúc giao tranh (khựng hàng giây)
    if (typeof SpgFXPool !== 'undefined' && SpgFXPool.muzzleLight) SpgFXPool.muzzleLight(this.scene);
  }

  // Biên dịch sẵn shader cho mọi vật liệu đang có trong cảnh (xe, địa hình, lớp hiệu ứng) lúc vào trận,
  // để lần đầu thấy một loại vật thể / hiệu ứng không làm khựng khung hình
  prewarmShaders() {
    // bản đồ mới tạo kết cấu mới: áp lại cài đặt đồ họa (lọc dị hướng, bóng đổ) trước khi biên dịch
    if (window.GameMenu && GameMenu.applyGraphics) GameMenu.applyGraphics();
    this.prewarmEffects();
    try { this.renderer.compile(this.scene, this.camera); } catch (e) { /* bỏ qua */ }
    this.pinShaderPrograms();
  }

  // Vật liệu chỉ sinh ra lúc giao tranh (vết đạn / lỗ thủng trên giáp, vỏ sóng nổ): tạo tạm mỗi loại một cái bằng
  // chính hàm của hệ hiệu ứng (đặt sâu dưới lòng đất, không bao giờ nhìn thấy), biên dịch + ghim shader rồi xoá ngay
  // -> phát trúng đầu tiên trong trận không còn khựng vì biên dịch shader
  prewarmEffects() {
    const fx = this.effectsManager && this.effectsManager.fx;
    if (!fx || !this.renderer) return;
    const holder = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial());
    holder.position.set(0, -5000, 0);
    this.scene.add(holder);
    const marks = [];
    let shock = null;
    try {
      if (fx.addSurfaceMark && fx.surfaceMarks) {
        const p = new THREE.Vector3(0, -5000, 0), n = new THREE.Vector3(0, 0, 1);
        for (const kind of ['penetration', 'turretRing', 'burnGlow', 'armorCrater', 'metalHole', 'bulletDent', 'glassCrack', 'scorch', 'concreteHole', 'steelDent', 'heiSplash', 'concretePit']) {
          const r = fx.addSurfaceMark(p, n, holder, kind, 2, { noFit: true });
          if (r) marks.push(r);
        }
      }
      if (fx.shocks && fx.shocks.mat && fx.shocks.geo) { shock = new THREE.Mesh(fx.shocks.geo, fx.shocks.mat()); holder.add(shock); }
      this.renderer.compile(this.scene, this.camera);
      this.pinShaderPrograms();
    } catch (e) { /* bỏ qua: chỉ là làm nóng shader */ }
    for (const r of marks) { const i = fx.surfaceMarks.indexOf(r); if (i >= 0) fx.removeSurfaceMark(i); }
    if (shock) shock.material.dispose();
    this.scene.remove(holder);
    holder.geometry.dispose(); holder.material.dispose();
  }

  // GHIM SHADER: Three.js xoá chương trình shader ngay khi vật liệu cuối cùng dùng nó bị huỷ (dispose). Hiệu ứng tạo
  // rồi huỷ vật liệu liên tục (vỏ sóng nổ, vết đạn / lỗ thủng trên xe, sẹo đất...) nên MỖI vụ nổ lại phải biên dịch
  // lại shader (khựng 50-150 ms). Giữ thêm 1 lượt tham chiếu cho mọi shader đã biên dịch -> dùng lại ngay, không biên
  // dịch lại. Số shader khác nhau có hạn (~50-80), tốn rất ít bộ nhớ GPU.
  pinShaderPrograms() {
    const P = this.renderer && this.renderer.info && this.renderer.info.programs;
    if (!P || P.length === this._pinnedPrograms) return;   // đã ghim thì không bao giờ bị xoá -> số lượng chỉ tăng
    for (const p of P) if (!p.__pinned && typeof p.usedTimes === 'number') { p.__pinned = true; p.usedTimes++; }
    this._pinnedPrograms = P.length;
  }

  // Ánh sáng khớp bầu trời & giờ trong ngày của bản đồ hiện tại (mặt trời nhìn thấy = hướng đổ bóng)
  applyAtmosphereLights() {
    const atm = this.terrain && this.terrain.atmosphere;
    if (!atm || typeof SkySystem === 'undefined') return;
    SkySystem.applyLights(this.scene, this.sunLight, this.hemiLight, this.ambientLight, atm);
    this.sunDir = atm.sunDir.clone();
  }

  /**
   * Sinh sẵn bản đồ theo (loại, seed) trong lúc chờ ghép trận -> vào trận không phải dựng lại.
   * Mọi máy cùng seed sẽ có bản đồ giống hệt nhau.
   */
  prepareMap(mapType, seed) {
    const t = mapType || this.currentMapType || 'DESERT';
    const s = (seed === undefined || seed === null) ? this.mapSeed : (seed >>> 0);
    this.currentMapType = t;
    this.mapSeed = s;
    if (this.terrain) {
      const rebuilt = this.terrain.setMapType(t, s);
      if (rebuilt) {
        this.applyAtmosphereLights();
        this.changeMap(t);
        // Biên dịch sẵn shader của bản đồ mới để khung hình đầu tiên trong trận không bị khựng
        try { this.renderer.compile(this.scene, this.camera); } catch (e) { /* bỏ qua */ }
      }
    }
    return this.terrain;
  }

  // Getter đồng bộ trạng thái cứ điểm và hòm tiếp tế
  get capturePoints() {
    return this.capturePointsManager ? this.capturePointsManager.points : this._capturePoints;
  }
  set capturePoints(val) {
    if (this.capturePointsManager) this.capturePointsManager.points = val;
    this._capturePoints = val;
  }

  get airdrop() {
    return this.supplyManager ? this.supplyManager.airdrop : this._airdrop;
  }
  set airdrop(val) {
    if (this.supplyManager) this.supplyManager.airdrop = val;
    this._airdrop = val;
  }

  get supplyCrates() {
    return this.supplyManager ? this.supplyManager.supplyCrates : this._supplyCrates;
  }
  set supplyCrates(val) {
    if (this.supplyManager) this.supplyManager.supplyCrates = val;
    this._supplyCrates = val;
  }

  initEntities3D() {
    this.units = [];

    // ==========================================
    // 1. PHE XANH (LIÊN MINH ĐỒNG MINH - CĂN CỨ PHÍA NAM)
    // ==========================================
    // Xe pháo người chơi chỉ huy (mặc định nòng bắn thẳng trực diện 0 độ)
    this.player = new SPGUnit3D(this.scene, {
      name: 'CHỈ HUY LIÊN MINH [SPG-155]',
      isPlayer: true,
      team: 'BLUE',
      x: 0,
      z: 900,
      bodyAngle: 0,
      azimuth: 0,
      elevation: 0,
      charge: 2
    });
    this.units.push(this.player);

    // Bot pháo tự hành đồng minh #1
    const ally1 = new SPGUnit3D(this.scene, {
      name: 'PHÁO ĐỒNG MINH #1',
      isPlayer: false,
      team: 'BLUE',
      x: -360,
      z: 1050,
      bodyAngle: 0,
      azimuth: 0,
      elevation: 0,
      charge: 2
    });
    this.units.push(ally1);

    // Bot pháo tự hành đồng minh #2
    const ally2 = new SPGUnit3D(this.scene, {
      name: 'PHÁO ĐỒNG MINH #2',
      isPlayer: false,
      team: 'BLUE',
      x: 360,
      z: 1050,
      bodyAngle: 0,
      azimuth: 0,
      elevation: 0,
      charge: 2
    });
    this.units.push(ally2);

    // ==========================================
    // 2. PHE ĐỎ (KHÁNG CHIẾN QUÂN ĐỊCH - CĂN CỨ PHÍA BẮC)
    // ==========================================
    // Bot pháo địch #1 (Chủ lực trung tâm)
    const enemy1 = new SPGUnit3D(this.scene, {
      name: 'PHÁO ĐỊCH KHÁNG CHIẾN #1',
      isPlayer: false,
      team: 'RED',
      x: 0,
      z: -900,
      bodyAngle: Math.PI,
      azimuth: 180,
      elevation: 0,
      charge: 2
    });
    this.units.push(enemy1);

    // Bot pháo địch #2 (Cánh trái)
    const enemy2 = new SPGUnit3D(this.scene, {
      name: 'PHÁO ĐỊCH KHÁNG CHIẾN #2',
      isPlayer: false,
      team: 'RED',
      x: -400,
      z: -1050,
      bodyAngle: Math.PI,
      azimuth: 180,
      elevation: 0,
      charge: 2
    });
    this.units.push(enemy2);

    // Bot pháo địch #3 (Cánh phải)
    const enemy3 = new SPGUnit3D(this.scene, {
      name: 'PHÁO ĐỊCH KHÁNG CHIẾN #3',
      isPlayer: false,
      team: 'RED',
      x: 400,
      z: -1050,
      bodyAngle: Math.PI,
      azimuth: 180,
      elevation: 0,
      charge: 2
    });
    this.units.push(enemy3);

    this.updateTeamScoreUI();
    this.updateAliveCount();
    this.initSupplyCrates();
    this.initCapturePoints();

    // 3. Dấu điểm rơi dự kiến nằm sát mặt đất: vòng mảnh có vạch chia + chữ thập (bị chắn: dấu X)
    this.reticle3D = WorldMarkers.groundMarker('impact');
    this.reticleRingMesh = this.reticle3D;
    this.reticleRingMat = this.reticle3D.material;
    this.reticle3D.visible = false;
    this.scene.add(this.reticle3D);

    // 4. Khung khóa mục tiêu: 4 góc ngoặc vát ôm xe địch, quay mặt về camera
    this.lockReticle3D = WorldMarkers.lockBrackets();
    this.lockRingMesh = this.lockReticle3D;
    this.lockReticle3D.visible = false;
    this.scene.add(this.lockReticle3D);
  }

  // BẮT ĐẦU TRẬN CHIẾN TỪ DANH SÁCH GHÉP TRẬN (MULTI-PLAYER / BOT SLOTS)
  startMatchWithSlots(slots, myPeerId) {
    this.isGameStarted = true;
    this._aimPoint = null;
    this._lockTrack = null;
    if (typeof TeamIntel !== 'undefined') { TeamIntel.bind(this); TeamIntel.reset(); }
    this.matchStartTime = Date.now();
    // Bản đồ cứ điểm: vòng bo thu hẹp dần về quanh 3 cứ điểm (đặt trước khi chọn chỗ xuất phát)
    // Bản đồ kiểu cũ (3 cờ A / B / C): bo cũng co về quanh 3 cờ — trước đây tâm bo co ngẫu nhiên có thể bỏ cờ A / C
    // ra ngoài vùng an toàn, phe đang giữ cờ đó thắng chắc vì đối phương không vào hạ cờ được
    const M = this.terrain && this.terrain.map;
    const SHs = M && M.strongholds && M.strongholds.length ? M.strongholds : (M && M.capture && M.capture.length ? M.capture : null);
    if (SHs && this.zone && this.zone.focusOn) this.zone.focusOn(SHs);
    this.initEntitiesWithSlots(slots, myPeerId);
    if (this.resetDroneWorld) this.resetDroneWorld();
    this.prewarmShaders();
    // [NET] Gắn đồng bộ mạng: xe từ xa nội suy, bot do chủ phòng điều khiển, bắn bù trễ, sát thương có chủ quyền
    // (trả về null khi chơi độc lập / file:// -> hành vi y như cũ)
    this.netSync = (typeof NetGameSync !== 'undefined' && this.matchmaking && this.matchmaking.net)
      ? NetGameSync.attach(this, this.matchmaking.net, slots) : null;
    if (this.netSync) this.startBackgroundTicker();

    const meSlot = slots.find(s => s.peerId === myPeerId);
    const myName = meSlot ? meSlot.name : 'CHỈ HUY LIÊN MINH';

    this._playerDeaths = 0;
    this.addCombatLog(`[[rocket]] XUẤT TRẬN THÀNH CÔNG! Chào mừng ${myName} vào chiến địa!`, 'tip');
    this.addCombatLog('[[swords]] Chiếm 1 cứ điểm A, B hoặc C rồi đứng giữ đủ 60 giây để thắng — hoặc hạ nhiều địch hơn khi hết giờ', 'system');
    if (window.GameMenu && GameMenu.maybeShowFirstHint) GameMenu.maybeShowFirstHint();
  }

  // Khởi tạo các xe pháo 3D theo danh sách các vị trí đã ghép trận
  initEntitiesWithSlots(slots, myPeerId) {
    // Dọn dẹp xe cũ nếu có
    if (this.units && this.units.length > 0) {
      this.units.forEach(u => {
        if (u.group) this.scene.remove(u.group);
      });
    }
    this.units = [];
    this.player = null;

    // Vị trí xuất phát NGẪU NHIÊN trên bản đồ: dùng hạt giống chung của trận (chủ phòng gửi kèm lệnh xuất trận)
    // -> mọi máy trong phòng tính ra cùng một bộ vị trí
    const mm = this.matchmaking;
    const seed = ((mm && typeof mm.spawnSeed === 'number') ? mm.spawnSeed : (this.mapSeed || 1)) >>> 0;
    const rng = ArtilleryGame3D.seededRandom(seed ^ 0x5bd1e995);
    const placed = [];

    slots.forEach((slot, idx) => {
      const team = slot.team || (idx < 10 ? 'BLUE' : 'RED');
      const sp = this.pickRandomSpawn(team, rng, placed);
      placed.push({ x: sp.x, z: sp.z, team });
      const cfg = { x: sp.x, z: sp.z, bodyAngle: sp.bodyAngle, azimuth: ArtilleryGame3D.headingDeg(sp.bodyAngle), elevation: 0, team };
      const isMe = !!(slot.peerId && slot.peerId === myPeerId);
      const isRemote = !!(slot.isHuman && !isMe);

      let assignedTankType = slot.tankType;
      if (isMe && this.matchmaking && this.matchmaking.selectedTankType) {
        assignedTankType = this.matchmaking.selectedTankType;
      }
      if (!assignedTankType) {
        // Phân bổ đa dạng chiến thuật cho các bot máy
        const pool = ['ALL_ROUNDER', 'GATLING', 'ARTILLERY', 'SCOUT'];
        assignedTankType = pool[idx % 4];
      }

      const unit = new SPGUnit3D(this.scene, {
        name: slot.name || `CHIẾN HẠM #${idx + 1}`,
        isPlayer: isMe,
        isRemotePlayer: isRemote,
        peerId: slot.peerId,
        team: cfg.team,
        tankType: assignedTankType,
        x: cfg.x,
        z: cfg.z,
        bodyAngle: cfg.bodyAngle,
        azimuth: cfg.azimuth,
        elevation: cfg.elevation,
        charge: 2
      });
      unit.spawnX = cfg.x;
      unit.spawnZ = cfg.z;
      // Trang bị mua thêm: xe của mình lấy từ tài khoản (kho đạn thật), người chơi khác gửi kèm slot,
      // xe do máy điều khiển nhận bộ ngẫu nhiên theo hạt giống chung (mọi máy giống nhau)
      if (typeof Equipment !== 'undefined') {
        let kit = null, eqOpts = null;
        if (isMe && window.Account && Account.kitFor) { const k = Account.kitFor(assignedTankType); kit = k.kit; eqOpts = { local: true, stock: k.stock }; }
        else if (slot.isHuman) kit = slot.kit || null;
        else kit = Equipment.botKit(assignedTankType, ArtilleryGame3D.seededRandom((seed ^ (idx * 0x9e3779b1)) >>> 0));
        Equipment.equip(unit, kit, eqOpts);
      }

      if (isMe) {
        this.player = unit;
      }
      this.units.push(unit);
    });

    // Fallback: nếu chưa có player thì gán xe đầu tiên
    if (!this.player && this.units.length > 0) {
      this.player = this.units[0];
      this.player.isPlayer = true;
      this.player.isRemotePlayer = false;
    }

    this.updateTeamScoreUI();
    this.updateAliveCount();
    this.syncHUDControls();
    this.updateAmmoUI();
    this.initSupplyCrates();
    this.initCapturePoints();
  }

  // Bộ sinh số ngẫu nhiên theo hạt giống (mulberry32): cùng hạt giống -> cùng dãy số trên mọi máy
  static seededRandom(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Hướng thân xe (radian) -> góc tháp pháo (độ, 0..360) cùng hướng
  static headingDeg(bodyAngle) {
    return ((bodyAngle * 180 / Math.PI) % 360 + 360) % 360;
  }

  // Chỗ đặt xe được không: đất liền bằng phẳng, không dính nhà / đá / công sự / cứ điểm / cờ chiếm đóng
  isSpawnGroundClear(x, z) {
    const T = this.terrain;
    if (!T) return true;
    if (T.waterSurfaceAt && T.waterSurfaceAt(x, z) !== null) return false;
    if (T.groundAtRaw && T.groundAtRaw(x, z) < -0.5) return false;
    if (T.bridges && T.bridges.length && T.bridgeAt(x, z)) return false;
    if (T.strongholdSet && T.strongholdSet.near(x, z, 60)) return false;
    if (T.landmarkSet && T.landmarkSet.near(x, z, 40)) return false;
    for (const b of T.buildings || []) if (Math.hypot(x - b.x, z - b.z) < (b.radius || 30) + 40) return false;
    for (const r of T.boulders || []) if (Math.hypot(x - r.x, z - r.z) < (r.radius || 18) + 30) return false;
    for (const f of T.horseshoeForts || []) if (Math.hypot(x - f.x, z - f.z) < (f.outerRadius || 60) + 30) return false;
    for (const cp of this.capturePoints || []) if (Math.hypot(x - cp.x, z - cp.z) < (cp.radius || 85) + 120) return false;
    if (T.groundAtRaw) {
      const e = 12;
      const slope = Math.hypot(T.groundAtRaw(x + e, z) - T.groundAtRaw(x - e, z), T.groundAtRaw(x, z + e) - T.groundAtRaw(x, z - e)) / (2 * e);
      if (slope > 0.32) return false;
    }
    if (T.getTerrainInfoAt) {
      const info = T.getTerrainInfoAt(x, z);
      if (info && (info.type === 'MOUNTAIN' || info.type === 'WATER')) return false;
    }
    return true;
  }

  /**
   * Chọn vị trí xuất phát / hồi sinh ngẫu nhiên trên bản đồ (trong vòng bo an toàn):
   * thử nhiều điểm, ưu tiên điểm xa xe địch (tới ~650m) và không chồng lên đồng đội.
   * rng: hàm [0,1) — khi xuất trận dùng hạt giống chung để mọi máy giống nhau; hồi sinh dùng Math.random.
   * others: các xe cần né (mặc định toàn bộ xe đang sống). Trả về { x, z, bodyAngle } (thân xe hướng vào giữa trận).
   */
  pickRandomSpawn(team, rng = Math.random, others = null, opts = null) {
    const nearTeam = !!(opts && opts.nearTeam);   // hồi sinh: gần đồng đội (dễ định hướng, cùng tiến lên), vẫn xa địch
    const H = this.worldWidth / 2;
    const lim = H - 220;
    // Vòng an toàn: vòng nhỏ hơn giữa vòng bo hiện tại và vòng sắp co (khi vòng co đã định sẵn theo cứ điểm)
    let zx = 0, zz = 0, zr = H - 250;
    const Z = this.zone;
    if (Z && Z.current) {
      let c = Z.current;
      if (Z.plan && Z.next && Z.next.radius < c.radius) c = Z.next;
      zx = c.x - H; zz = c.y - H; zr = Math.max(150, c.radius - 160);
    }
    const list = others || (this.units || []).filter(u => !u.isDead);
    const ENEMY_OK = 650, FRIEND_OK = 220;
    let best = null, bestScore = -Infinity;
    for (let i = 0; i < 90; i++) {
      const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * zr;
      const x = zx + Math.cos(a) * r, z = zz + Math.sin(a) * r;
      if (Math.abs(x) > lim || Math.abs(z) > lim) continue;
      if (!this.isSpawnGroundClear(x, z)) continue;
      let dFriend = Infinity, dEnemy = Infinity;
      for (const u of list) {
        if (!u) continue;
        const d = Math.hypot(u.x - x, u.z - z);
        if (u.team === team) { if (d < dFriend) dFriend = d; } else if (d < dEnemy) dEnemy = d;
      }
      if (Math.min(dFriend, dEnemy) < 80) continue;
      let score = Math.min(dEnemy, ENEMY_OK) + Math.min(dFriend, FRIEND_OK) * 0.35 + rng() * 30;
      if (nearTeam && dFriend < Infinity) score -= Math.max(0, dFriend - 420) * 0.9;
      if (score > bestScore) { bestScore = score; best = { x, z }; }
      if (dEnemy >= ENEMY_OK && dFriend >= FRIEND_OK && (!nearTeam || dFriend <= 420) && i >= 12) break;
    }
    if (!best) {
      // Bản đồ quá chật: lùi về một điểm theo phe
      const side = team === 'BLUE' ? 1 : -1;
      best = { x: zx + (rng() - 0.5) * 400, z: zz + side * Math.min(zr * 0.6, 900) };
    }
    // Thân xe hướng về giữa trận (trung tâm các cứ điểm, hoặc tâm vòng bo); mũi xe = (-sin, -cos)
    const cps = this.capturePoints || [];
    let fx = zx, fz = zz;
    if (cps.length) { fx = 0; fz = 0; cps.forEach(p => { fx += p.x; fz += p.z; }); fx /= cps.length; fz /= cps.length; }
    const dx = fx - best.x, dz = fz - best.z;
    const bodyAngle = (Math.hypot(dx, dz) > 1) ? Math.atan2(-dx, -dz) : rng() * Math.PI * 2;
    return { x: best.x, z: best.z, bodyAngle };
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  initInput() {
    window.addEventListener('keydown', (e) => {
      // Phòng xem xe 3D đang mở: Space dùng để bắn thử, không bắn trong trận
      if (e.code === 'Space' && window.tankInspector && window.tankInspector.isOpen) return;
      this.keys[e.code] = true;

      if (e.code === 'Space') {
        e.preventDefault();
        this.triggerPlayerFire();
      }

      // Phím G: phóng 1 loạt lựu đạn khói (cần Ống phóng lựu khói + lựu đạn khói trong kho)
      if (e.code === 'KeyG' && !e.repeat) this.triggerPlayerSmoke();

      // Phím B: pháo tự hành đổi cách bắn (tự chọn / luôn bắn thẳng / luôn bắn cầu vồng)
      if (e.code === 'KeyB' && !e.repeat) this.cycleArtyFireMode();

      // Phím Tab: Tự động khóa mục tiêu hoặc chuyển đổi sang xe địch tiếp theo
      if (e.code === 'Tab') {
        e.preventDefault();
        this.cycleLockedTarget();
      }

      // Phím tắt đổi loại đạn thích ứng theo dòng xe người chơi đang điều khiển: [1]/[Q], [2]/[E], [3]/[R]
      if (this.player && this.player.availableAmmos) {
        if (e.code === 'Digit1' || e.code === 'KeyQ') {
          if (this.player.availableAmmos[0]) this.selectAmmoType(this.player.availableAmmos[0]);
        } else if (e.code === 'Digit2' || e.code === 'KeyE') {
          if (this.player.availableAmmos[1]) this.selectAmmoType(this.player.availableAmmos[1]);
        } else if (e.code === 'Digit3' || e.code === 'KeyR') {
          if (this.player.availableAmmos[2]) this.selectAmmoType(this.player.availableAmmos[2]);
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });

    // Rời cửa sổ (Alt-Tab, mở tab khác) khi đang giữ phím: trình duyệt không gửi keyup -> nhả hết phím,
    // tránh xe tự chạy / súng tự xả khi quay lại
    const releaseAll = () => { this.keys = {}; this.isPointerFiring = false; };
    window.addEventListener('blur', releaseAll);
    document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });

    // 🖱️ NHẤP CHUỘT TRÊN MÀN HÌNH 3D ĐỂ TỰ ĐỘNG KHÓA MỤC TIÊU (SMART AUTO-AIM)
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    // Tọa độ chuột theo đúng khung canvas (không giả định canvas phủ kín cửa sổ)
    const setMouse = (clientX, clientY) => {
      const r = this.renderer.domElement.getBoundingClientRect();
      mouse.x = ((clientX - r.left) / r.width) * 2 - 1;
      mouse.y = -((clientY - r.top) / r.height) * 2 + 1;
      raycaster.setFromCamera(mouse, this.camera);
      return r;
    };

    // Điểm mặt đất dưới con trỏ (gọi sau setMouse). Camera thấp: trỏ lên trời / quá chân trời thì lấy điểm
    // xa ~2400 theo đúng hướng trỏ (pháo tầm xa vẫn ngắm được về phía đó)
    const groundUnderMouse = () => {
      const hits = raycaster.intersectObject(this.terrain.mesh);
      if (hits.length) return hits[0].point;
      const d = raycaster.ray.direction, o = raycaster.ray.origin, l = Math.hypot(d.x, d.z);
      if (l < 1e-4) return null;
      const lim = (this.terrain.width || this.worldWidth) / 2 - 20;
      const x = Math.max(-lim, Math.min(lim, o.x + d.x / l * 2400)), z = Math.max(-lim, Math.min(lim, o.z + d.z / l * 2400));
      return new THREE.Vector3(x, this.terrain.getElevationAt(x, z), z);
    };

    // Xe địch dưới con trỏ: ưu tiên tia chạm đúng mô hình xe (thân, tháp, nòng); hụt thì lấy xe có tâm gần con trỏ nhất
    // trên màn hình (≤ 48px) — tránh lỗi cũ lấy điểm mặt đất phía sau xe (camera nhìn chéo) rồi khóa hụt / ngắm lệch
    const pickEnemyAt = (clientX, clientY) => {
      const r = setMouse(clientX, clientY);
      const cands = this.units.filter(u => this.canTarget(u) && u.group);
      let best = null, bestD = Infinity;
      for (const u of cands) {
        const hit = raycaster.intersectObject(u.group, true).find(h => h.object.visible);
        if (hit && hit.distance < bestD) { bestD = hit.distance; best = u; }
      }
      if (best) return best;
      const v = new THREE.Vector3();
      let bestPx = 48;
      for (const u of cands) {
        v.set(u.x, (u.y || 0) + 10, u.z).project(this.camera);
        if (v.z > 1) continue;
        const px = Math.hypot((v.x - mouse.x) * r.width / 2, (v.y - mouse.y) * r.height / 2);
        if (px < bestPx) { bestPx = px; best = u; }
      }
      return best;
    };

    const handleAimFromScreen = (clientX, clientY) => {
      if (!this.player || this.player.isDead || this.tacticalMap.isOpen) return;
      const aa = this.canShootAir && this.canShootAir(this.player) && !(this._sight && this._sight.arty);

      // Xe 6 nòng / trinh sát nhấp đúng drone địch đang thấy: khóa drone (radar / Tab không khóa được drone)
      if (aa) {
        const r = setMouse(clientX, clientY);
        const dr = this.pickDroneAt(mouse, r);
        if (dr) { this.setAirAim({ kind: 'drone', dr }); return; }
      }

      // Click vào xe địch: khóa luôn xe đó (nòng tự tính góc & đón đầu)
      const clickedEnemy = pickEnemyAt(clientX, clientY);
      if (clickedEnemy) {
        this.setLockedTarget(clickedEnemy, true);
        return;
      }

      setMouse(clientX, clientY);
      // trỏ lên trời (tia không chạm đất, hướng lên): xe 6 nòng / trinh sát nâng nòng bắn theo hướng đó
      if (aa && raycaster.ray.direction.y > 0.02) {
        const th = raycaster.intersectObject(this.terrain.mesh);
        if (!th.length || th[0].distance > 2600) { this.aimAtSky(raycaster.ray); return; }
      }
      const targetPoint = groundUnderMouse();

      if (targetPoint) {
        // Ngắm vào một điểm trên mặt đất: nhả khóa xe (nếu không tháp sẽ quay về bám mục tiêu cũ)
        if (this.lockedTarget) {
          this.setLockedTarget(null);
          this.addCombatLog('[[lock-open]] Đã nhả khóa mục tiêu — ngắm vào điểm đã chọn', 'tip');
        }
        this.aimPlayerAtTarget(targetPoint.x, targetPoint.z);
      }
    };

    // Nhấp chuột phải vào chiến trường: LÁI TỰ ĐỘNG tới điểm đó (tự tìm đường né nhà, đá, tường, sườn quá dốc)
    // (tên lửa chống tăng xe trinh sát: phím F)
    this.renderer.domElement.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (!this.player || this.player.isDead || this.tacticalMap.isOpen) return;
      setMouse(e.clientX, e.clientY);
      const pt = groundUnderMouse();
      if (pt) this.setAutoDriveTarget(pt.x, pt.z);
    });

    // CAMERA: con lăn chuột = gần / xa (kéo xa camera nâng dần lên cao), giữ chuột giữa + kéo = nhìn quanh xe
    this.renderer.domElement.addEventListener('wheel', (e) => {
      if (!this.isGameStarted || !this._cam) return;
      e.preventDefault();
      const C = this._cam;
      const S = this._sight;
      if (S) {
        if (S.arty) S.hT = Math.max(120, Math.min(700, S.hT * (e.deltaY > 0 ? 1.15 : 1 / 1.15)));   // độ cao bay của drone so với mặt đất
        else S.magT = Math.max(S.prof.magMin, Math.min(S.prof.magMax, S.magT * (e.deltaY > 0 ? 1 / 1.25 : 1.25)));
        return;
      }
      C.zoomT = Math.max(0.6, Math.min(3.4, C.zoomT * (e.deltaY > 0 ? 1.12 : 1 / 1.12)));
    }, { passive: false });
    this.renderer.domElement.addEventListener('pointermove', (e) => {
      if (!this._freeLook || !this._cam || this._sight) return;
      this._cam.freeYaw = Math.max(-Math.PI, Math.min(Math.PI, this._cam.freeYaw - e.movementX * 0.006));
      this._cam.freePitch = Math.max(-0.2, Math.min(0.9, this._cam.freePitch + e.movementY * 0.004));
    });
    window.addEventListener('pointerup', (e) => { if (e.button === 1) this._freeLook = false; });
    this.renderer.domElement.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); });   // chặn cuộn tự động của trình duyệt
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'KeyV' || e.repeat || !this.isGameStarted) return;
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (this._sight) this.setSightMode(false);
      this.toggleHighView();
    });

    // CHẾ ĐỘ NGẮM BẮN: bấm rồi thả Ctrl, hoặc bấm C, để vào / thoát kính ngắm.
    // Ctrl bật theo kiểu bấm-thả chứ không giữ (giữ Ctrl rồi bấm W là tổ hợp đóng tab của trình duyệt).
    // Phím đang giữ sẵn để lái (W tự lặp) không làm hỏng cú bấm Ctrl; chỉ một phím MỚI bấm kèm Ctrl mới tính là tổ hợp.
    let ctrlAlone = false;
    const PAN = { KeyW: 1, KeyA: 1, KeyS: 1, KeyD: 1, ShiftLeft: 1, ShiftRight: 1, KeyQ: 1, KeyE: 1 };   // màn hình drone: lái drone
    // đang gõ chữ vào ô nhập còn hiện trên màn hình (ô ẩn sau khi vào trận vẫn giữ tiêu điểm thì không tính)
    const typing = (e) => { const t = e.target; return !!(t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable) && t.offsetParent !== null); };
    const toggleSight = () => {
      if (!this.isGameStarted || this.isGameOver || !this.player || this.player.isDead) return;
      if ((window.GameMenu && GameMenu.isOpen && GameMenu.isOpen()) || (window.tankInspector && window.tankInspector.isOpen)) return;
      if (this.tacticalMap && this.tacticalMap.isOpen) this.tacticalMap.toggle(false);
      // xe pháo: drone cất cánh từ nóc cabin rồi mới chuyển sang hình từ drone
      if (!this._sight && this.player.tankType === 'ARTILLERY') { this.launchDrone(); return; }
      this.setSightMode(!this._sight);
    };
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Control') { if (!e.repeat) ctrlAlone = true; return; }
      if (!e.repeat) ctrlAlone = false;
      if (e.key === 'Escape' && this._sight) this.setSightMode(false);
      if (e.code === 'KeyC' && !e.repeat && !e.ctrlKey && !e.altKey && !e.metaKey && !typing(e)) toggleSight();
      // bản đồ hỏa lực của pháo: W A S D (+ Shift) di chuyển vùng nhìn, không lái xe
      if (this._sight && this._sight.arty && PAN[e.code]) { this._sight.keys[e.code] = true; e.stopImmediatePropagation(); }
      // màn hình drone: F = đánh dấu mục tiêu tại tâm màn hình (điểm gimbal camera đang nhìn)
      if (this._sight && this._sight.arty && e.code === 'KeyF' && !typing(e)) {
        e.stopImmediatePropagation();
        if (!e.repeat && this._sight.cx !== undefined) {
          if (this.lockedTarget) this.setLockedTarget(null);
          this.aimPlayerAtTarget(this._sight.cx, this._sight.cz);
        }
      }
    }, true);
    window.addEventListener('keyup', (e) => {
      if (this._sight && this._sight.arty && PAN[e.code]) { this._sight.keys[e.code] = false; e.stopImmediatePropagation(); }
      if (e.key !== 'Control') return;
      const go = ctrlAlone;
      ctrlAlone = false;
      if (go && !typing(e)) toggleSight();
    }, true);
    window.addEventListener('pointerdown', () => { ctrlAlone = false; }, true);

    // Nhấp chuột trái vào màn hình 3D để ngắm nhanh
    this.renderer.domElement.addEventListener('pointerdown', (e) => {
      if (e.button === 0) {
        handleAimFromScreen(e.clientX, e.clientY);
      } else if (e.button === 1) {
        e.preventDefault();
        this._freeLook = true;
      }
    });
  }

  // Phóng tên lửa dẫn hướng của xe trinh sát (ô đạn 3 + Space): chỉ khi đầu dò đã khóa chắc
  // một xe địch mà kíp xe đang nhìn thấy
  triggerPlayerAntiTank() {
    const P = this.player;
    if (!P || P.isDead || P.tankType !== 'SCOUT') return;
    if (this.inNoFireZone()) { this.noFireWarn(); return; }
    if ((P.missileAmmoCount || 0) <= 0) {
      this.addCombatLog('[[alert-triangle]] Đã hết tên lửa! Nhặt hòm tiếp tế trên map' + this.stockNote('ANTI_TANK_MISSILE'), 'alert');
      return;
    }
    if (P.dmg && P.dmg.rpgDisabled) {
      this.addCombatLog('[[alert-triangle]] Ống phóng tên lửa đã bị bắn hỏng!', 'alert');
      return;
    }
    if (P.antiTankCooldown > 0) {
      this.addCombatLog(`[[hourglass]] Đang nạp tên lửa vào ống phóng, còn ${P.antiTankCooldown.toFixed(1)}s`, 'alert');
      return;
    }
    const S = this._seeker || { state: 'none' };
    if (S.state === 'none') {
      this.addCombatLog('[[lock]] Cần khóa xe địch trước khi phóng (nhấp vào xe địch hoặc Tab)', 'alert');
      return;
    }
    if (S.state === 'blind') {
      this.addCombatLog('[[eye-off]] Không nhìn thấy mục tiêu: tên lửa chỉ phóng vào xe địch trong tầm nhìn', 'alert');
      return;
    }
    if (S.state === 'seeking') {
      this.addCombatLog('[[loader]] Đầu dò chưa khóa xong, giữ mục tiêu trong tầm nhìn thêm chút nữa', 'alert');
      return;
    }

    const lockT = this.lockedTarget;
    P.missileTarget = { unit: lockT };
    const missile = P.fireAntiTank(this.ballistics, this.radar);
    if (missile) {
      if (this.matchmaking) {
        this.matchmaking.broadcastMyFire(missile);
      }
      this.cameraShake = 3;
      this.updateAmmoUI();
      this.addCombatLog(`[[rocket]] Đã phóng tên lửa vào ${lockT.name}! Giữ xe sống và giữ mục tiêu trong tầm nhìn tới khi trúng`, 'tip');
    }
  }

  // Kíp xe nhìn thấy mục tiêu bằng mắt / kính ngắm (không tính vị trí đồng đội báo hay radar)
  missileCanSee(shooter, t) {
    if (!shooter || !t || t.isDead) return false;
    if (typeof Equipment !== 'undefined' && Equipment.lockBlocked && Equipment.lockBlocked(t, shooter.team)) return false;   // khói đa phổ: đầu dò mù
    if (typeof TeamIntel === 'undefined') return true;
    // Phòng thử nghiệm ("luôn hiện mục tiêu"): mục tiêu đang hiện trên màn hình người chơi coi như nhìn thấy
    if (window.STRONGHOLD_LAB && shooter.isPlayer && t.group && t.group.visible && !t.isHiddenFromPlayer) return true;
    return TeamIntel.seesDirect(shooter, t);
  }

  // ĐẦU DÒ TÊN LỬA (xe trinh sát đang chọn ô tên lửa): 'none' chưa khóa xe · 'blind' khuất tầm nhìn
  // · 'seeking' đang bám (~0.8 s) · 'locked' sẵn sàng phóng. Kèm tiếng đầu dò và màu khung ngắm.
  updateMissileSeeker(dt) {
    const P = this.player;
    const S = this._seeker || (this._seeker = { state: 'none', p: 0, id: null, tick: 0 });
    const active = P && !P.isDead && P.tankType === 'SCOUT' && P.selectedAmmo === 'ANTI_TANK_MISSILE';
    const T = active && this.lockedTarget && !this.lockedTarget.isDead ? this.lockedTarget : null;
    const prev = S.state;
    if (!T) { S.state = 'none'; S.p = 0; S.id = null; }
    else {
      if (S.id !== T.id) { S.id = T.id; S.p = 0; }
      if (!this.missileCanSee(P, T)) { S.state = 'blind'; S.p = 0; }
      else {
        // máy gây nhiễu trên xe địch: đầu dò mất gấp đôi thời gian mới khóa được
        const jam = typeof Equipment !== 'undefined' && Equipment.has && Equipment.has(T, 'jammer');
        S.p = Math.min(1, S.p + dt / (jam ? 1.6 : 0.8));
        S.state = S.p >= 1 ? 'locked' : 'seeking';
      }
    }
    const SE = window.soundEngine;
    S.tick -= dt;
    if (S.state === 'seeking' && S.tick <= 0) {
      S.tick = 0.16;
      if (SE && SE.playMissileSeek) SE.playMissileSeek(S.p);
    } else if (S.state === 'locked') {
      if (prev !== 'locked') { S.tick = 1.0; if (SE && SE.playMissileLock) SE.playMissileLock(); }
      else if (S.tick <= 0) { S.tick = 1.0; if (SE && SE.playMissileLockHold) SE.playMissileLockHold(); }
    }
    if (prev === 'locked' || prev === 'seeking') {
      if (S.state === 'blind' && SE && SE.playTargetLost) SE.playTargetLost();
    }

    // Màu khung ngắm 3D: đỏ = khóa súng thường, vàng nhấp nháy = đầu dò đang bám, xanh = tên lửa đã khóa, xám = khuất tầm nhìn
    if (this.lockRingMesh && this.lockRingMesh.material) {
      const c = !active || S.state === 'none' ? WorldMarkers.C.enemy
        : S.state === 'locked' ? WorldMarkers.C.on
          : S.state === 'blind' ? 0x8a96a3
            : (Math.sin(Date.now() * 0.03) > 0 ? WorldMarkers.C.slew : 0xc9822a);
      this.lockRingMesh.material.color.setHex(c);
    }

    // Báo cho máy của xe bị khóa (tia laser đo xa / dẫn tên lửa chỉ chiếu được khi tự nhìn thấy mục tiêu)
    if (P && !P.isDead && this.lockedTarget && !this.lockedTarget.isDead && P.tankType !== 'ARTILLERY'
      && this.missileCanSee(P, this.lockedTarget)) {
      P._lockOn = { id: this.lockedTarget.id, m: active ? 2 : 1, at: Date.now() };
    } else if (P) P._lockOn = null;
  }

  // CẢNH BÁO BỊ KHÓA / TÊN LỬA LAO TỚI cho người chơi: chip + mũi tên chỉ hướng + tiếng báo
  updateThreatWarnings(dt) {
    const P = this.player;
    const box = domById('lock-warning');
    const arrows = domById('threat-arrows');
    const W = this._threatW || (this._threatW = { beep: 0, mbeep: 0, wasMissile: false });
    const threats = [];   // { x, z, kind: 'gun' | 'mlock' | 'missile', d }
    if (P && !P.isDead) {
      const now = Date.now();
      for (const u of this.units) {
        if (!u || u.isDead || u.team === P.team || !u._lockOn) continue;
        if (u._lockOn.id !== P.id || now - u._lockOn.at > 3500) continue;
        if (typeof Equipment !== 'undefined' && Equipment.lockBlocked && Equipment.lockBlocked(P, u.team)) continue;   // khói đa phổ đã cắt tia khóa
        threats.push({ x: u.x, z: u.z, kind: u._lockOn.m === 2 ? 'mlock' : 'gun', hidden: !!u._netHidden });
      }
      for (const s of (this.ballistics && this.ballistics.activeShells) || []) {
        const G = s.guide;
        if (!G || G.lost || G.targetId !== P.id || s.shooterTeam === P.team) continue;
        threats.push({ x: s.x, z: s.z, kind: 'missile', d: Math.hypot(s.x - P.x, s.z - P.z) });
      }
    }
    const missile = threats.filter(t => t.kind === 'missile').sort((a, b) => a.d - b.d)[0];
    const mlock = threats.some(t => t.kind === 'mlock');
    const gun = threats.some(t => t.kind === 'gun');

    if (box) {
      const text = missile ? '[[rocket]] TÊN LỬA ĐANG LAO TỚI! VÀO BỤI / RỪNG RẬM ĐỂ THOÁT'
        : mlock ? '[[target-arrow]] BỊ TÊN LỬA KHÓA'
          : gun ? '[[target-arrow]] BỊ KHÓA MỤC TIÊU' : '';
      if (box._t !== text) {
        box._t = text;
        box.classList.toggle('hidden', !text);
        box.classList.toggle('missile', !!missile || mlock);
        if (text) UIIcons.set(box, text);
      }
    }

    // Mũi tên quanh tâm màn hình theo hướng mối đe dọa (theo góc nhìn camera)
    if (arrows) {
      const list = threats.filter(t => !t.hidden).slice(0, 4);
      while (arrows.children.length < list.length) {
        const a = document.createElement('div');
        a.className = 'threat-arrow';
        arrows.appendChild(a);
      }
      const v = this._threatV || (this._threatV = new THREE.Vector3());
      for (let i = 0; i < arrows.children.length; i++) {
        const el = arrows.children[i];
        const t = list[i];
        if (!t) { el.style.display = 'none'; continue; }
        v.set(t.x, P.y || 0, t.z).applyMatrix4(this.camera.matrixWorldInverse);
        const ang = Math.atan2(v.x, -v.z);
        el.style.display = '';
        el.className = 'threat-arrow ' + t.kind;
        el.style.transform = `rotate(${ang}rad) translateY(-150px)`;
      }
    }

    // Tiếng: tên lửa lao tới (dồn dập dần khi gần) > bị khóa tên lửa > bị khóa súng
    const SE = window.soundEngine;
    W.beep -= dt;
    if (missile) {
      const urg = Math.max(0, Math.min(1, 1 - missile.d / 900));
      if (W.beep <= 0) { W.beep = 0.7 - urg * 0.4; if (SE && SE.playMissileWarning) SE.playMissileWarning(urg); }
      if (!W.wasMissile) this.addCombatLog('[[rocket]] Tên lửa địch đang lao tới! Vào bụi hoặc rừng rậm để kíp phóng mất dấu, hoặc hạ xe phóng để đứt điều khiển', 'alert');
    } else if (mlock || gun) {
      // máy báo laser: kêu ngay lúc bị chiếu, sau đó nhắc thưa (tia dẫn tên lửa 1 s, khóa súng 3 s)
      if (W.beep <= 0) { W.beep = mlock ? 1.0 : 3.0; if (SE && SE.playLockWarning) SE.playLockWarning(mlock ? 2 : 1); }
    } else W.beep = 0;
    W.wasMissile = !!missile;
  }

  // TÍNH TOÁN VÀ ĐỒNG BỘ NÒNG PHÁO KHÓA VÀO TỌA ĐỘ MỤC TIÊU
  // quiet: chỉnh điểm ngắm liên tục (màn hình điều khiển hỏa lực của pháo) — không ghi nhật ký mỗi lần, kính ngắm đã báo trạng thái
  aimPlayerAtTarget(targetX, targetZ, quiet = false) {
    if (!this.player || this.player.isDead) return;
    if (this.artyAimBlocked && this.artyAimBlocked(targetX, targetZ)) return;
    if (this._airAim) this.clearAirAim();
    const P = this.player;
    const fixedGun = P.canElevate === false || P.tankType === 'GATLING';
    // Bộ giải chọn góc nòng thấp nhất thật sự tới điểm chỉ định; bị đồi / tường / nhà chặn đường thẳng thì tự nâng nòng
    const sol = this.ballistics.solveAimingForTarget(P.x, P.y, P.z, targetX, targetZ, this.terrain, P);
    if (!sol) return;
    if (sol.charge) P.charge = sol.charge;   // lựu pháo: liều phóng do máy tính hỏa lực chọn
    // Giữ điểm ngắm: mỗi khung hình tháp quay / nòng tự nâng hạ theo nghiệm đường đạn mới
    // (xe mình chạy vẫn bắn trúng đúng điểm đã chọn) — cùng bộ bám như khi khóa xe địch
    this._aimSeq = (this._aimSeq || 0) + 1;
    this._aimPoint = { id: 'pt' + this._aimSeq, x: targetX, z: targetZ, y: this.terrain.getElevationAt(targetX, targetZ) };
    this._lockTrack = null;
    P.aimAz = P.aimEl = undefined;
    if (fixedGun) P.fcsTarget = { x: targetX, z: targetZ, y: this._aimPoint.y + 8, el: sol.elevation };
    this.syncHUDControls();
    const d = sol.distance;
    if (quiet) return;
    if (!sol.reachable && sol.blind) {
      this.addCombatLog('[[alert-triangle]] Điểm này ở ngay trước mũi xe — nòng không quay qua cabin được. Quay thân xe sang bên để bắn', 'alert');
    } else if (!sol.reachable) {
      this.addCombatLog(`[[x]] Không bắn tới điểm này (${d}M) — bị vật cản che hoặc quá xa, hãy tiến thêm / đổi vị trí`, 'alert');
    } else if (sol.lob) {
      this.addCombatLog(`[[crosshair]] Ngắm điểm cách ${d}M — vật cản chắn đường bắn thẳng, chuyển sang BẮN CẦU VỒNG (nâng nòng cao)`, 'tip');
    } else if (sol.lofted) {
      this.addCombatLog(`[[crosshair]] Ngắm điểm cách ${d}M — đường thẳng bị che, đã nâng nòng bắn vòng qua vật cản`, 'tip');
    } else if (P.tankType === 'ARTILLERY') {
      this.addCombatLog(sol.direct ? `[[arrow-narrow-right]] Ngắm điểm cách ${d}M — hạ nòng BẮN THẲNG` : `[[arrow-curve-right]] Ngắm điểm cách ${d}M — BẮN CẦU VỒNG`, 'tip');
    } else {
      this.addCombatLog(`[[crosshair]] Ngắm điểm cách ${d}M — bắn tới được`, 'tip');
    }
  }

  // PHÁO TỰ HÀNH: CÁCH BẮN — tự chọn (gần bắn thẳng, xa bắn cầu vồng) / luôn bắn thẳng / luôn bắn cầu vồng
  cycleArtyFireMode() {
    const P = this.player;
    if (!P || P.isDead || P.tankType !== 'ARTILLERY') return;
    const order = ['auto', 'direct', 'lob'];
    P.artyFireMode = order[(order.indexOf(P.artyFireMode || 'auto') + 1) % order.length];
    // giải lại đường đạn ngay theo cách bắn mới
    if (this._lockTrack) { this._lockTrack.solveT = 0; this._lockTrack.solved = false; }
    const msg = {
      auto: '[[arrows-shuffle]] Cách bắn: TỰ CHỌN — địch gần thì hạ nòng bắn thẳng, xa thì bắn cầu vồng',
      direct: '[[arrow-narrow-right]] Cách bắn: luôn BẮN THẲNG — hạ nòng, đánh gần (tối đa ' + BallisticsSystem3D.ARTY_DIRECT.max + 'M)',
      lob: '[[arrow-curve-right]] Cách bắn: luôn BẮN CẦU VỒNG — đánh xa, qua đồi / nhà'
    }[P.artyFireMode];
    this.addCombatLog(msg + ' [B: ĐỔI]', 'tip');
    if (window.soundEngine && window.soundEngine.playAmmoSwitch) window.soundEngine.playAmmoSwitch();
    this.updateArtyModeUI(true);
  }

  // Ô cách bắn trên HUD (chỉ hiện với pháo tự hành)
  updateArtyModeUI(force = false) {
    const btn = domById('arty-mode-btn');
    if (!btn) return;
    const P = this.player;
    const show = !!(P && !P.isDead && P.tankType === 'ARTILLERY');
    if (btn.hidden === show) btn.hidden = !show;
    if (!show) return;
    if (!btn._wired) {
      btn._wired = true;
      btn.addEventListener('click', (e) => { e.stopPropagation(); this.cycleArtyFireMode(); btn.blur(); });
    }
    const mode = P.artyFireMode || 'auto';
    const tr = this._lockTrack;
    const direct = mode === 'direct' ? true : mode === 'lob' ? false
      : (tr && tr.solved && tr.direct !== undefined ? tr.direct : (P.elevation <= 18));
    const key = mode + '|' + direct;
    if (!force && btn._k === key) return;
    btn._k = key;
    btn.classList.toggle('direct', direct);
    btn.innerHTML = UIIcons.tag(direct ? 'arrow-narrow-right' : 'arrow-curve-right')
      + `<b>${direct ? 'BẮN THẲNG' : 'BẮN CẦU VỒNG'}</b><small>${mode === 'auto' ? 'TỰ CHỌN' : 'CỐ ĐỊNH'} · B</small>`;
  }

  // Đường đạn dự tính có đi xuyên qua thân xe mục tiêu không (ngòi nổ cận đích nổ ngay khi lướt sát thân xe)
  trajPassesUnit(points, x, y, z) {
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      const sx = b.x - a.x, sy = b.y - a.y, sz = b.z - a.z;
      const L2 = sx * sx + sy * sy + sz * sz;
      let t = L2 > 1e-6 ? ((x - a.x) * sx + (y - a.y) * sy + (z - a.z) * sz) / L2 : 0;
      t = Math.max(0, Math.min(1, t));
      const cx = a.x + sx * t, cy = a.y + sy * t, cz = a.z + sz * t;
      if (Math.hypot(cx - x, cz - z) <= 22 && Math.abs(cy - y) <= 16) return true;
    }
    return false;
  }

  // ĐƯỜNG ĐẠN DỰ TÍNH CÓ BỊ CHE TRƯỚC KHI TỚI MỤC TIÊU? Dò dọc đường đạn (đã có trọng lực, lực cản, gió) từ đầu nòng
  // tới mép thân mục tiêu bằng đúng các hàm va chạm mà viên đạn thật dùng: mặt đất / gò / đồi, cứ điểm dưới ụ đất,
  // nhà, tường công sự, thân cây. Trả về { x, y, z, type } của chỗ bị chặn, hoặc null nếu đạn tới được mục tiêu.
  // (tâm thân mục tiêu lộ ra thì đường đạn nhắm vào tâm vẫn qua được -> lộ một phần vẫn tính là trúng)
  aimCoverAlong(points, tx, tz, reach, hitType) {
    const T = this.terrain, P = this.player;
    if (!T || !P || !points || points.length < 2) return null;
    const dT = Math.hypot(tx - P.x, tz - P.z) - reach;   // dò tới mép thân mục tiêu (gần phía mình)
    const veg = T.trees;
    let reached = false;
    for (let i = 1; i < points.length && !reached; i++) {
      const a = points[i - 1], b = points[i];
      let bx = b.x, by = b.y, bz = b.z;
      const da = Math.hypot(a.x - P.x, a.z - P.z), db = Math.hypot(b.x - P.x, b.z - P.z);
      if (db >= dT) {
        const t = db > da ? Math.max(0, Math.min(1, (dT - da) / (db - da))) : 1;
        bx = a.x + (b.x - a.x) * t; by = a.y + (b.y - a.y) * t; bz = a.z + (b.z - a.z) * t;
        reached = true;
      }
      if (T.strongholdSegmentHit) { const h = T.strongholdSegmentHit(a.x, a.y, a.z, bx, by, bz); if (h) return { x: h.x, y: h.y, z: h.z, type: 'STRONGHOLD' }; }
      if (T.buildingSegmentHit) { const h = T.buildingSegmentHit(a.x, a.y, a.z, bx, by, bz); if (h) return { x: h.x, y: h.y, z: h.z, type: 'BUILDING' }; }
      if (veg && veg.trunkHit) { const h = veg.trunkHit(a.x, a.y, a.z, bx, by, bz); if (h) return { x: h.x, y: h.y, z: h.z, type: 'TREE' }; }
      if (T.checkHorseshoeCollision && T.checkHorseshoeCollision(bx, by, bz).hit) return { x: bx, y: by, z: bz, type: 'WALL' };
      // mặt đất / gò: lấy mẫu dày trong đoạn (bỏ 8 đv đầu sát miệng nòng)
      const L = Math.hypot(bx - a.x, bz - a.z), n = Math.max(1, Math.ceil(L / 5));
      for (let k = 1; k <= n; k++) {
        const t = k / n, x = a.x + (bx - a.x) * t, y = a.y + (by - a.y) * t, z = a.z + (bz - a.z) * t;
        if (Math.abs(x - P.x) + Math.abs(z - P.z) < 8) continue;
        if (y < T.getElevationAt(x, z) - 0.8) return { x, y, z, type: 'GROUND' };
      }
    }
    if (reached) return null;
    // đường đạn dự tính đã dừng (chạm đất / tường) trước khi tới mục tiêu
    const e = points[points.length - 1];
    return { x: e.x, y: e.y, z: e.z, type: hitType === 'WALL' ? 'WALL' : 'GROUND' };
  }

  // =========================================================================
  // HỆ THỐNG KHÓA MỤC TIÊU VÀ CHUYỂN ĐỔI BẰNG PHÍM TAB
  // =========================================================================
  cycleLockedTarget() {
    if (!this.player || this.player.isDead) return;
    // Đang ngắm tay trên mục tiêu đã khóa: TAB = cho tháp bám lại mục tiêu đó (không nhảy sang xe khác)
    if (this._manualAim && this.lockedTarget && !this.lockedTarget.isDead) {
      this._manualAim = false;
      this._lockTrack = null;
      this.addCombatLog('[[lock]] Tháp bám lại mục tiêu đang khóa', 'tip');
      this.updateTargetLockUI();
      return;
    }

    // Chỉ các xe địch mình đang biết vị trí (tự thấy / radar của mình / đồng đội trinh sát báo) trong tầm khóa
    const maxLock = this.lockRangeFor(this.player);
    const enemies = this.units.filter(u => this.canTarget(u)
      && Math.hypot(u.x - this.player.x, u.z - this.player.z) <= maxLock);
    if (enemies.length === 0) {
      this.setLockedTarget(null);
      const EQ = typeof Equipment !== 'undefined' && Equipment.lockBlocked ? Equipment : null;
      const veiled = EQ && this.units.some(u => u && !u.isDead && EQ.lockBlocked(u, this.player.team)
        && Math.hypot(u.x - this.player.x, u.z - this.player.z) <= maxLock);
      this.addCombatLog(veiled ? '[[lock-off]] Xe địch đang núp sau khói đa phổ — chưa khóa được cho tới khi khói tan'
        : '[[alert-triangle]] Không thấy xe địch nào trong tầm nhìn — cần xe trinh sát (radar) báo vị trí!', 'alert');
      return;
    }

    // Sắp xếp các xe địch theo khoảng cách từ gần nhất đến xa nhất
    enemies.forEach(e => {
      e._distToPlayer = Math.hypot(e.x - this.player.x, e.z - this.player.z);
    });
    enemies.sort((a, b) => a._distToPlayer - b._distToPlayer);

    let nextTarget = null;
    if (!this.lockedTarget || this.lockedTarget.isDead) {
      nextTarget = enemies[0];
    } else {
      const curIdx = enemies.findIndex(e => e.id === this.lockedTarget.id);
      if (curIdx === -1) {
        nextTarget = enemies[0];
      } else {
        const nextIdx = (curIdx + 1) % enemies.length;
        nextTarget = enemies[nextIdx];
      }
    }

    this.setLockedTarget(nextTarget, true);
  }

  setLockedTarget(target, isManualCycle = false) {
    // pháo mất drone: không khóa được xe ngoài tầm bắn thẳng
    if (target && this.artyAimBlocked && this.artyAimBlocked(target.x, target.z)) return;
    if (target && this._airAim) this.clearAirAim();
    this.lockedTarget = target;
    this._lockLostT = 0;
    this._lockTrack = null;
    this._manualAim = false;
    if (target) this._aimPoint = null;   // khóa xe thay cho điểm ngắm mặt đất
    if (this.lockReticle3D) this.lockReticle3D.userData.forId = null;   // chạy lại hiệu ứng khung thu vào khi khóa
    if (!target) {
      if (this.lockReticle3D) this.lockReticle3D.visible = false;
      this.updateTargetLockUI();
      return;
    }
    // Tháp pháo tự quay tới & bám mục tiêu với tốc độ quay thật của tháp (trackLockedTarget mỗi khung hình)

    // Phát âm thanh khóa mục tiêu điện tử
    if (window.soundEngine && typeof window.soundEngine.playTargetLockSound === 'function') {
      window.soundEngine.playTargetLockSound();
    }

    let tankName = 'XE TĂNG ĐỊCH';
    if (target.tankType === 'ALL_ROUNDER') tankName = 'XE TĂNG ĐA DỤNG';
    else if (target.tankType === 'GATLING') tankName = 'XE TĂNG 6 NÒNG';
    else if (target.tankType === 'ARTILLERY') tankName = 'PHÁO TỰ HÀNH';
    else if (target.tankType === 'SCOUT') tankName = 'XE TRINH SÁT';

    const dist = Math.round(Math.hypot(target.x - this.player.x, target.z - this.player.z));
    const hpPercent = Math.round((target.hp / target.maxHp) * 100);

    const prefix = isManualCycle ? '[[lock]] ĐÃ KHÓA' : '[[bolt]] TỰ ĐỘNG KHÓA ĐỊCH ÁP SÁT';
    this.addCombatLog(`${prefix}: [${tankName}] // CỰ LY ${dist}M // MÁU ${hpPercent}% [TAB: ĐỔI MỤC TIÊU]`, 'tip');

    this.updateTargetLockUI();
  }

  // =========================================================================
  // LÁI TỰ ĐỘNG TỚI ĐIỂM CHỈ ĐỊNH (chuột phải trên màn hình 3D / bản đồ chiến thuật)
  // =========================================================================
  setAutoDriveTarget(x, z) {
    if (x === null || x === undefined || !this.player || this.player.isDead) {
      this.autoDrive = null;   // dấu điểm đến tự mờ dần (updateDriveMarker)
      return;
    }
    const W = this.terrain ? this.terrain.width / 2 - 70 : 1700, D = this.terrain ? this.terrain.depth / 2 - 70 : 1700;
    x = Math.max(-W, Math.min(W, x)); z = Math.max(-D, Math.min(D, z));
    // Điểm chọn không đứng được (trong nhà, nước sâu, vách / chóp quá dốc): dời tới chỗ đi được gần nhất
    const snap = typeof Navigator !== 'undefined' && Navigator.nearestDrivable ? Navigator.nearestDrivable(this.terrain, this.player, x, z) : null;
    if (snap && snap.moved) {
      x = snap.x; z = snap.z;
      this.addCombatLog('[[map-pin]] Xe không vào được chỗ đó — chọn chỗ đi được gần nhất', 'tip');
    }
    this.autoDrive = { x, z, nav: {} };
    // tìm đường ngay để báo nếu không tới được
    const path = typeof Navigator !== 'undefined' ? Navigator.findPath(this.terrain, this.player, x, z) : [{ x, z }];
    this.autoDrive.nav = { tx: x, tz: z, path, idx: 0, replanT: 3, minT: 0.5 };
    const dist = Math.round(Math.hypot(x - this.player.x, z - this.player.z));
    if (!path) this.addCombatLog('[[alert-triangle]] Không tìm được đường tới điểm đó (vật cản / dốc quá cao với xe này) — xe sẽ chạy gần nhất có thể', 'alert');
    else this.addCombatLog(`[[route]] LÁI TỰ ĐỘNG tới điểm chỉ định (${dist}M${path.length > 1 ? `, vòng tránh vật cản qua ${path.length - 1} điểm` : ''}) — bấm W/A/S/D để tự lái`, 'tip');
    if (!this._autoMarker || this._autoMarker.parent !== this.scene) {
      this._autoMarker = WorldMarkers.groundMarker('move');
      this.scene.add(this._autoMarker);
    }
    // đặt điểm mới: chạy lại hiệu ứng gợn sóng + bung nhẹ
    const M = this._autoMarker;
    M.userData.pop = 0; M.userData.fade = 1; M.visible = true;
    WorldMarkers.placeOnGround(M, this.terrain, x, z, null, M.userData.r0 = WorldMarkers.sizeFor(this.camera, x, this.terrain.getElevationAt(x, z), z, 12, 0.026), 0);
  }

  updateAutoDrive(dt, isBoost) {
    const A = this.autoDrive, P = this.player;
    if (!A || !P || P.isDead) { this.setAutoDriveTarget(null); return; }
    const st = typeof Navigator !== "undefined" ? Navigator.steer(P, A.nav, this.terrain, A.x, A.z, dt, 30) : { dx: A.x - P.x, dz: A.z - P.z, dist: 99, arrived: false };
    if (st.arrived) {
      P.steer(0, 0, dt, false);
      this.setAutoDriveTarget(null);
      this.addCombatLog('[[route]] Đã tới điểm chỉ định', 'tip');
      return;
    }
    let dx = st.dx, dz = st.dz;
    // tránh va xe khác trên đường
    for (const o of this.units) {
      if (o === P || o.isDead) continue;
      const sx = P.x - o.x, sz = P.z - o.z, d = Math.hypot(sx, sz);
      if (d > 0.001 && d < 60) { const w = (60 - d) / 60 * 1.6; dx += sx / d * w; dz += sz / d * w; }
    }
    P.steer(dx, dz, dt, isBoost && st.dist > 250);
    // gần tới nơi: giảm tốc dần để kịp quay vào đích & dừng êm (không lượn vòng quanh điểm)
    const cap = Math.max(22, st.dist * 1.1);
    if (st.dist < 140 && Math.abs(P.speed) > cap) P.speed = Math.sign(P.speed) * Math.max(cap, Math.abs(P.speed) - P.acceleration * 1.5 * dt);
  }

  // Vẽ đường lái tự động lên bản đồ (minimap / bản đồ chiến thuật)
  drawAutoDrivePath(ctx, toScreen, big) {
    const A = this.autoDrive;
    if (!A || !this.player) return;
    const pts = [{ x: this.player.x, z: this.player.z }];
    const path = A.nav && A.nav.path;
    if (path) for (let i = A.nav.idx || 0; i < path.length; i++) pts.push(path[i]);
    else pts.push({ x: A.x, z: A.z });
    ctx.save();
    ctx.strokeStyle = 'rgba(0,229,255,0.85)';
    ctx.lineWidth = big ? 2 : 1.2;
    ctx.setLineDash(big ? [6, 4] : [3, 2]);
    ctx.beginPath();
    pts.forEach((p, i) => { const s = toScreen(p.x, p.z); i ? ctx.lineTo(s.x, s.y) : ctx.moveTo(s.x, s.y); });
    ctx.stroke();
    ctx.setLineDash([]);
    const e = toScreen(A.x, A.z);
    ctx.beginPath(); ctx.arc(e.x, e.y, big ? 6 : 3.5, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  // Dấu chỉ 3D (mũi tên vàng + cột sáng) trên đầu xe địch đang được đồng đội trinh sát báo vị trí
  updateSpotMarkers(dt) {
    if (!this._spotMarkers) this._spotMarkers = [];
    const list = [];
    if (typeof TeamIntel !== 'undefined' && this.player) {
      for (const u of this.units) {
        if (u.isDead || u.team === this.player.team) continue;
        const r = TeamIntel.reportOf(this.player.team, u);
        if (r && r.spotter !== this.player) list.push(u);
      }
    }
    while (this._spotMarkers.length < list.length) {
      const g = new THREE.Group();
      const mat = new THREE.MeshBasicMaterial({ color: 0xffd60a, transparent: true, opacity: 0.9, depthTest: false });
      const cone = new THREE.Mesh(new THREE.ConeGeometry(4.5, 9, 4), mat);
      cone.rotation.x = Math.PI;   // mũi nhọn chỉ xuống xe địch
      g.add(cone);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 26, 6), new THREE.MeshBasicMaterial({ color: 0xffd60a, transparent: true, opacity: 0.25, depthWrite: false }));
      beam.position.y = 16;
      g.add(beam);
      g.renderOrder = 999;
      g.visible = false;
      this.scene.add(g);
      this._spotMarkers.push(g);
    }
    const t = performance.now() * 0.001;
    this._spotMarkers.forEach((g, i) => {
      const u = list[i];
      if (!u) { g.visible = false; return; }
      g.visible = true;
      g.position.set(u.x, (u.y || 0) + 30 + Math.sin(t * 4 + i) * 2, u.z);
      g.rotation.y += dt * 2.5;
    });
  }

  // Tầm khóa mục tiêu: xe thường tối đa 1400m; pháo tự hành khóa xa theo tầm bắn (mục tiêu do trinh sát báo vị trí)
  lockRangeFor(u) {
    if (!u) return 1400;
    // pháo mất drone trinh sát: chỉ còn bắn thẳng tự vệ
    if (u === this.player && u.tankType === 'ARTILLERY' && this._drone && this._drone.unit === u && this._drone.state === 'lost') {
      return typeof BallisticsSystem3D !== 'undefined' ? BallisticsSystem3D.ARTY_DIRECT.max : 800;
    }
    const r = this.ballistics && typeof this.ballistics.maxRangeFor === 'function' ? this.ballistics.maxRangeFor(u) : 0;
    return Math.max(1400, r || 0);
  }

  // Xe địch được phép khóa: mình đang biết vị trí (tầm nhìn / radar / đồng đội báo) hoặc đang hiện rõ trên màn hình
  // (sương mù chiến tranh ẩn xe chưa phát hiện bằng group.visible, nên điều kiện thứ hai không làm lộ xe địch)
  canTarget(u) {
    if (!u || u.isDead || !this.player || u.team === this.player.team) return false;
    // xe địch vừa phóng khói đa phổ lúc bị khóa: không khóa được cho tới khi khói tan
    if (typeof Equipment !== 'undefined' && Equipment.lockBlocked && Equipment.lockBlocked(u, this.player.team)) return false;
    if (typeof TeamIntel === 'undefined' || TeamIntel.knows(this.player, u)) return true;
    return !!(u.group && u.group.visible && !u.isHiddenFromPlayer);
  }

  nearestKnownEnemy(maxDist) {
    if (!this.player) return null;
    let best = null, bd = maxDist;
    for (const u of this.units) {
      if (!this.canTarget(u)) continue;
      const d = Math.hypot(u.x - this.player.x, u.z - this.player.z);
      if (d < bd) { bd = d; best = u; }
    }
    return best;
  }

  // Bám mục tiêu đã khóa: lọc vận tốc mục tiêu, tính điểm đón đầu theo thời gian bay của đạn,
  // rồi xoay tháp / nâng nòng tới đó với tốc độ quay thật (không giật tức thời)
  // T: xe đã khóa (mặc định) hoặc điểm ngắm cố định trên mặt đất { id, x, y, z }
  trackLockedTarget(dt, rotSpeed, elevSpeed, T = this.lockedTarget) {
    const P = this.player;
    if (!P || !T || dt <= 0) return;
    let tr = this._lockTrack;
    if (!tr || tr.id !== T.id) tr = this._lockTrack = { id: T.id, x: T.x, z: T.z, vx: 0, vz: 0, flightT: 0, solveT: 0, el: P.elevation, leadK: 0 };
    // 1. Vận tốc mục tiêu từ chuyển động thực tế (đúng cho cả bot lẫn xe của máy khác)
    const ivx = (T.x - tr.x) / dt, ivz = (T.z - tr.z) / dt;
    if (Math.hypot(ivx, ivz) < 400) {   // bỏ qua cú nhảy vị trí (hồi sinh / hiệu chỉnh mạng)
      // đạn bay càng lâu, lượng đón đầu càng nhạy với vận tốc đo được (lựu pháo bay 5-7 s: lệch 10 đv/s = lệch 60 đv) ->
      // lọc vận tốc chậm hơn theo thời gian bay, nếu không xe địch lượn qua lại là điểm ngắm giật theo
      const k = 1 - Math.exp(-dt * Math.min(5, 2.5 / Math.max(0.5, tr.flightT || 0)));
      tr.vx += (ivx - tr.vx) * k; tr.vz += (ivz - tr.vz) * k;
    }
    tr.x = T.x; tr.z = T.z;

    const B = this.ballistics, mult = B.bulletSpeedMultiplier || 1;
    const fixedGun = P.canElevate === false || P.tankType === 'GATLING';
    if (fixedGun) {
      const ammo = P.selectedAmmo === 'INCENDIARY' ? 'INCENDIARY' : 'GATLING_BULLET';
      const v0 = B.muzzleVelocity(ammo, true, P) * mult;
      tr.flightT = Math.hypot(T.x - P.x, T.z - P.z) / Math.max(1, v0);
    }
    // 2. Điểm đón đầu (giới hạn để mục tiêu đổi hướng không kéo nòng đi quá xa)
    let lx = tr.vx * tr.flightT, lz = tr.vz * tr.flightT;
    const ll = Math.hypot(lx, lz), cap = 320;
    if (ll > cap) { lx *= cap / ll; lz *= cap / ll; }
    // Máy tính hỏa lực cần thời gian bám mục tiêu mới tính đủ lượng đón đầu (~1.5 s; mục tiêu đổi hướng gắt thì
    // phải bám lại một phần). Bắn vội vào xe đang chạy dễ trượt -> có chỗ cho kỹ năng chọn thời điểm bóp cò.
    // Vòng ngắm chỉ chuyển xanh khi đường đạn tới đúng điểm đón đầu ĐẦY ĐỦ (fullX / fullZ).
    // gia tốc mục tiêu (từ vận tốc đã lọc): mục tiêu cua gắt / tăng giảm tốc -> lượng đón đầu đã tính bị mất dần
    const acc = tr.pvx === undefined ? 0 : Math.hypot(tr.vx - tr.pvx, tr.vz - tr.pvz) / dt;
    tr.pvx = tr.vx; tr.pvz = tr.vz;
    tr.leadK = Math.max(0, Math.min(1, (tr.leadK || 0) + dt / 1.5 - Math.min(acc, 400) * dt / 240));
    tr.fullX = T.x + lx; tr.fullZ = T.z + lz;
    const aimX = T.x + lx * tr.leadK, aimZ = T.z + lz * tr.leadK;
    tr.aimX = aimX; tr.aimZ = aimZ;   // điểm nòng đang bám (đón đầu theo mức đã tính được)

    // 3. Xoay tháp theo đường ngắn nhất với tốc độ quay tháp
    // Bù độ nghiêng thân xe trên dốc: nòng thật (không phải góc lệnh) phải chỉ đúng nghiệm đường đạn
    const off = P.barrelWorldOffset ? P.barrelWorldOffset() : { el: 0, az: 0 };
    // tr.windAz: lượng xoay bù gió bạt ngang của nghiệm đường đạn (bộ giải đã tính góc nòng theo hướng đã bù —
    // trước đây tháp vẫn chỉ thẳng vào mục tiêu nên đạn rơi lệch ngang đúng bằng độ dạt của gió)
    const want = (Math.atan2(aimX - P.x, -(aimZ - P.z)) * 180 / Math.PI + (tr.windAz || 0) - off.az + 720) % 360;
    const diff = ((want - P.azimuth + 540) % 360) - 180;
    const step = rotSpeed * dt;
    // pháo tự hành: tháp quay vòng phía đuôi xe, không quét qua điểm mù mũi xe
    if (P.turretBlindHalf && P.turretBlindHalf() > 0) P.azimuth = P.stepAzimuth(P.azimuth, want, step).az;
    else P.azimuth = (P.azimuth + Math.max(-step, Math.min(step, diff)) + 360) % 360;

    // 4. Góc tà: xe 6 nòng do máy tính hỏa lực tự nâng nòng; xe khác giải đường đạn ~8 lần/giây
    const ty = (T.y || this.terrain.getElevationAt(T.x, T.z));
    if (fixedGun) {
      // nòng do máy tính hỏa lực tự nâng: dùng nghiệm đường đạn (vòng qua vật cản nếu cần)
      tr.solveT -= dt;
      if (tr.solveT <= 0) {
        tr.solveT = 0.15;
        const sol = B.solveAimingForTarget(P.x, P.y, P.z, aimX, aimZ, this.terrain, P, { hintEl: tr.fel, atUnit: T !== this._aimPoint });
        tr.fel = sol && sol.reachable ? sol.elevation : undefined;
        tr.reachable = !!(sol && sol.reachable !== false);
      }
      P.fcsTarget = { x: aimX, z: aimZ, y: ty + 9, el: tr.fel };
    } else {
      tr.solveT -= dt;
      if (tr.solveT <= 0) {
        // lựu pháo: đạn bay lâu, mô phỏng nặng -> giải thưa hơn; luôn dò quanh nghiệm lần trước
        tr.solveT = P.tankType === 'ARTILLERY' ? 0.5 : 0.12;
        const sol = B.solveAimingForTarget(P.x, P.y, P.z, aimX, aimZ, this.terrain, P, { hintEl: tr.solved ? tr.el : undefined, hintCharge: tr.solved ? tr.charge : undefined, atUnit: T !== this._aimPoint });
        tr.solved = true;
        tr.reachable = !!(sol && sol.reachable !== false);
        if (sol) {
          tr.el = sol.elevation;
          const baseAz = Math.atan2(aimX - P.x, -(aimZ - P.z)) * 180 / Math.PI;
          tr.windAz = sol.reachable !== false && typeof sol.azimuth === 'number' ? ((sol.azimuth - baseAz + 540) % 360) - 180 : 0;
          if (sol.charge) { tr.charge = sol.charge; P.charge = sol.charge; }   // lựu pháo: liều phóng theo cự ly
          tr.flightT = Math.min(30, (sol.flightTime || 0) / mult);
          if (P.tankType === 'ARTILLERY') {
            // lựu pháo tự đổi quỹ đạo (gần: hạ nòng bắn thẳng, xa: cầu vồng) -> báo một dòng ngắn
            if (tr.direct !== undefined && tr.direct !== !!sol.direct && sol.reachable && T === this.lockedTarget) {
              this.addCombatLog(sol.direct ? '[[arrow-narrow-right]] Địch ở gần — hạ nòng BẮN THẲNG' : '[[arrow-curve-right]] Địch ở xa — chuyển sang BẮN CẦU VỒNG', 'tip');
            }
            tr.direct = !!sol.direct;
            // mục tiêu lọt vào điểm mù mũi xe: báo một lần (nòng không quay qua cabin được)
            if (sol.blind && !tr.blind && T === this.lockedTarget) this.addCombatLog('[[alert-triangle]] Địch ở ngay trước mũi xe — nòng không quay qua cabin được. Quay thân xe sang bên để bắn', 'alert');
            tr.blind = !!sol.blind;
          }
        }
      }
      // Thân xe nghiêng làm góc nòng cần thiết vượt giới hạn cơ khí của giá pháo -> không bắn tới (phải đổi chỗ đứng)
      const elCap = B.maxLobElevationFor ? B.maxLobElevationFor(P) : (B.maxElevationFor ? B.maxElevationFor(P) : 85);
      if (tr.el - off.el > elCap + 0.5) tr.reachable = false;
      const de = (tr.el - off.el) - P.elevation, es = elevSpeed * dt;
      P.elevation = Math.max(-10, Math.min(85, P.elevation + Math.max(-es, Math.min(es, de))));
    }
    this.syncHUDControls();
  }

  // Dấu neo điểm ngắm trên mặt đất (thoi hở đỉnh + vạch hướng, nằm sát đất): tháp & nòng tự bám điểm này khi xe di chuyển
  updateAimAnchor(dt) {
    const A = this._aimPoint;
    if (!A || !this.player || this.player.isDead) {
      if (this._aimAnchor) this._aimAnchor.visible = false;
      return;
    }
    if (!this._aimAnchor || this._aimAnchor.parent !== this.scene) {
      this._aimAnchor = WorldMarkers.groundMarker('aim');
      this._aimAnchorMat = this._aimAnchor.material;
      this.scene.add(this._aimAnchor);
    }
    const g = this._aimAnchor, U = this._aimAnchorMat.uniforms;
    g.visible = true;
    WorldMarkers.placeOnGround(g, this.terrain, A.x, A.z, A.y, WorldMarkers.sizeFor(this.camera, A.x, A.y, A.z, 13, 0.028), 0);
    U.uSpin.value = (U.uSpin.value + dt * 0.4) % 6.2832;
    this._aimAnchorMat.color.setHex(this._aimState === 'on' ? WorldMarkers.C.on : (this._aimState === 'blocked' || this._aimState === 'covered') ? WorldMarkers.C.blocked : WorldMarkers.C.slew);
    this.updateTargetLockUI();
  }

  // Dấu điểm lái tự động tới: gợn sóng khi vừa đặt, nhịp nhẹ khi đang chạy, mờ dần khi tới nơi / hủy
  updateDriveMarker(dt) {
    const M = this._autoMarker;
    if (!M || (!M.visible && !this.autoDrive)) return;
    if (this.autoDrive && M.parent === this.scene) {
      const p = M.position;
      WorldMarkers.placeOnGround(M, this.terrain, this.autoDrive.x, this.autoDrive.z, null,
        M.userData.r0 = WorldMarkers.sizeFor(this.camera, p.x, p.y, p.z, 12, 0.026), 0);
      // vừa đặt: bung to rồi thu về đúng cỡ
      const k = 1 - M.userData.pop;
      M.scale.setScalar(M.userData.r0 * (1 + k * k * 0.6));
    }
    WorldMarkers.tickMove(M, dt, !!this.autoDrive);
  }

  updateTargetLockUI() {
    const box = domById('target-lock-stat-box');
    const textEl = domById('target-lock-text');
    const subEl = domById('target-lock-sub');
    if (!box || !textEl) return;

    if (this.lockedTarget && !this.lockedTarget.isDead) {
      box.classList.add('locked');
      let tankName = 'XE ĐỊCH';
      if (this.lockedTarget.tankType === 'ALL_ROUNDER') tankName = 'TĂNG ĐA DỤNG';
      else if (this.lockedTarget.tankType === 'GATLING') tankName = 'TĂNG 6 NÒNG';
      else if (this.lockedTarget.tankType === 'ARTILLERY') tankName = 'PHÁO TỰ HÀNH';
      else if (this.lockedTarget.tankType === 'SCOUT') tankName = 'XE TRINH SÁT';

      const dist = Math.round(Math.hypot(this.lockedTarget.x - this.player.x, this.lockedTarget.z - this.player.z));
      const hpPercent = Math.round((this.lockedTarget.hp / this.lockedTarget.maxHp) * 100);

      textEl.textContent = `${tankName} · ${hpPercent}%`;
      const tHp = domById('target-hp-bar');
      if (tHp) tHp.style.width = `${Math.max(0, Math.min(100, hpPercent))}%`;
      if (subEl) subEl.textContent = this._manualAim ? `${dist}M · NGẮM TAY · TAB: BÁM LẠI` : `${dist}M · ${this.aimStateText()}`;
      box.classList.remove('anchored');
    } else if (this._aimPoint && this.player) {
      // Điểm neo trên mặt đất: nòng tự tính góc để đạn rơi đúng điểm này kể cả khi xe mình đang chạy
      box.classList.remove('locked');
      box.classList.add('anchored');
      const dist = Math.round(Math.hypot(this._aimPoint.x - this.player.x, this._aimPoint.z - this.player.z));
      const t = `ĐIỂM NGẮM · ${dist}M`;
      if (textEl.textContent !== t) textEl.textContent = t;
      const s = this.aimStateText();
      if (subEl && subEl.textContent !== s) subEl.textContent = s;
    } else {
      box.classList.remove('locked', 'anchored');
      textEl.textContent = 'CHƯA KHÓA';
      if (subEl) subEl.textContent = 'CLICK XE ĐỊCH / MẶT ĐẤT · TAB';
    }
  }

  aimStateText() {
    const P = this.player;
    if (P && P.tankType === 'SCOUT' && P.selectedAmmo === 'ANTI_TANK_MISSILE') {
      const S = this._seeker || { state: 'none', p: 0 };
      return S.state === 'locked' ? 'TÊN LỬA ĐÃ KHÓA · SPACE PHÓNG'
        : S.state === 'seeking' ? `ĐẦU DÒ ĐANG BÁM ${Math.round(S.p * 100)}%`
          : 'KHÔNG NHÌN THẤY · TÊN LỬA KHÔNG KHÓA ĐƯỢC';
    }
    return this._aimState === 'on' ? 'ĐÃ NGẮM TRÚNG · SPACE BẮN'
      : this._aimState === 'covered' ? 'BỊ CHE — ĐỔI GÓC BẮN'
      : this._aimState === 'blocked' ? 'KHÔNG BẮN TỚI — ĐỔI VỊ TRÍ'
        : 'ĐANG XOAY THÁP / NÒNG...';
  }

  updateTeamScoreUI() {
    if (this.hud) {
      return this.hud.updateTeamScoreUI();
    }
    const blueLivesEl = domById('blue-lives-count');
    const redLivesEl = domById('red-lives-count');
    const blueKdEl = domById('blue-kd-val');
    const redKdEl = domById('red-kd-val');
    const blueUnitsEl = domById('blue-units-count');
    const redUnitsEl = domById('red-units-count');
    const scoreBlueEl = domById('score-blue-val');
    const scoreRedEl = domById('score-red-val');

    if (blueLivesEl) blueLivesEl.textContent = '∞ (10s)';
    if (redLivesEl) redLivesEl.textContent = '∞ (10s)';
    if (blueKdEl) blueKdEl.textContent = `${this.blueKills}/${this.blueDeaths}`;
    if (redKdEl) redKdEl.textContent = `${this.redKills}/${this.redDeaths}`;

    if (this.units) {
      const blueUnits = this.units.filter(u => u.team === 'BLUE');
      const redUnits = this.units.filter(u => u.team === 'RED');
      const blueAlive = blueUnits.filter(u => !u.isDead).length;
      const redAlive = redUnits.filter(u => !u.isDead).length;

      if (blueUnitsEl) blueUnitsEl.textContent = blueAlive.toString();
      if (redUnitsEl) redUnitsEl.textContent = redAlive.toString();
      // Hiển thị Điểm Hạ Gục tại bảng điểm trung tâm
      if (scoreBlueEl) scoreBlueEl.textContent = this.blueKills.toString();
      if (scoreRedEl) scoreRedEl.textContent = this.redKills.toString();

      // Cập nhật thanh ưu thế hạ gục thế trận
      const momentumBlue = domById('kill-momentum-blue');
      const momentumRed = domById('kill-momentum-red');
      if (momentumBlue && momentumRed) {
        const totalKills = this.blueKills + this.redKills;
        let bluePct = 50;
        if (totalKills > 0) {
          bluePct = Math.max(15, Math.min(85, Math.round((this.blueKills / totalKills) * 100)));
        }
        momentumBlue.style.width = `${bluePct}%`;
        momentumRed.style.width = `${100 - bluePct}%`;
      }

      // Cập nhật danh sách icon xe tăng hàng ngang của Phe Xanh
      const blueTankIconsContainer = domById('blue-tank-icons');
      if (blueTankIconsContainer) {
        blueTankIconsContainer.innerHTML = this.renderTankIconsHTML(blueUnits, 'BLUE');
      }

      // Cập nhật danh sách icon xe tăng hàng ngang của Phe Đỏ
      const redTankIconsContainer = domById('red-tank-icons');
      if (redTankIconsContainer) {
        redTankIconsContainer.innerHTML = this.renderTankIconsHTML(redUnits, 'RED');
      }
    }
  }

  renderTankIconsHTML(units, team) {
    const isBlue = team === 'BLUE';
    return units.map((u, idx) => {
      const isDead = !!u.isDead;
      const isPlayer = !!u.isPlayer;
      const statusClass = isDead ? 'dead' : 'alive';
      const teamClass = isBlue ? 'blue-unit' : 'red-unit';
      const playerClass = isPlayer ? 'is-player' : '';
      const unitName = u.name || (isBlue ? `Pháo Xanh #${idx + 1}` : `Pháo Đỏ #${idx + 1}`);
      const maxHp = u.maxHp || 2;
      const currentHp = Math.max(0, u.hp || 0);
      const hpPercent = Math.max(0, Math.min(100, Math.round((currentHp / maxHp) * 100)));

      // Lấy thời gian chờ tái xuất kích nếu xe đang chết
      const respawnItem = this.respawnQueue ? this.respawnQueue.find(r => r.unit === u) : null;
      const respawnSec = (respawnItem && respawnItem.timer > 0) ? Math.ceil(respawnItem.timer) : '';

      const tooltip = `${unitName} (${u.tankType || 'ALL_ROUNDER'}) // ${isDead ? `ĐÃ BỊ TIÊU DIỆT ${respawnSec ? `(Tái xuất sau ${respawnSec}s)` : ''}` : `MÁU: ${currentHp.toFixed(1)}/${maxHp}`}`;

      let svgContent = '';
      const type = u.tankType || 'ALL_ROUNDER';
      if (type === 'GATLING') {
        svgContent = `
          <svg class="tank-svg" viewBox="0 0 36 22" fill="currentColor">
            <rect x="2" y="14" width="26" height="5.5" rx="1.5" />
            <polygon points="3,14 27,14 29,9 4,9" />
            <rect x="7" y="5.5" width="14" height="5.5" rx="1.5" />
            <rect x="21" y="6.5" width="11" height="1.6" rx="0.5" />
            <rect x="21" y="9" width="11" height="1.6" rx="0.5" />
            <circle cx="33" cy="8.5" r="2.2" />
          </svg>
        `;
      } else if (type === 'ARTILLERY') {
        svgContent = `
          <svg class="tank-svg" viewBox="0 0 36 22" fill="currentColor">
            <rect x="1" y="15" width="31" height="5" rx="1.5" />
            <polygon points="2,15 32,15 34,10.5 3,10.5" />
            <rect x="4" y="6" width="16" height="6.5" rx="1.5" />
            <g transform="rotate(-15 16 9)">
              <rect x="15" y="8" width="18" height="2.2" rx="0.5" />
              <rect x="24" y="7" width="3.5" height="4.2" rx="0.8" opacity="0.9" />
            </g>
          </svg>
        `;
      } else if (type === 'SCOUT') {
        svgContent = `
          <svg class="tank-svg" viewBox="0 0 36 22" fill="currentColor">
            <circle cx="5" cy="16.5" r="3.2" />
            <circle cx="12" cy="16.5" r="3.2" />
            <circle cx="19" cy="16.5" r="3.2" />
            <circle cx="26" cy="16.5" r="3.2" />
            <polygon points="2,13.5 29,13.5 33,9.5 4,9.5" />
            <polygon points="10,9.5 21,9.5 23,6.5 12,6.5" />
            <rect x="21" y="7.5" width="11" height="1.4" rx="0.4" />
            <line x1="13" y1="6.5" x2="13" y2="2" stroke="currentColor" stroke-width="1.2" />
            <circle cx="13" cy="2" r="1.5" />
          </svg>
        `;
      } else {
        svgContent = `
          <svg class="tank-svg" viewBox="0 0 36 22" fill="currentColor">
            <rect x="2" y="14.5" width="28" height="5" rx="1.8" />
            <polygon points="3,14.5 29,14.5 33,9.5 5,9.5" />
            <polygon points="8,9.5 24,9.5 27,5 11,5" />
            <rect x="24" y="6.5" width="11" height="2" rx="0.5" />
            <rect x="28" y="5.5" width="3.2" height="4" rx="0.6" opacity="0.9" />
          </svg>
        `;
      }

      return `
        <div class="tank-status-icon ${teamClass} ${statusClass} ${playerClass}" title="${tooltip}" data-unit-id="${u.id || idx}">
          ${isPlayer ? '<span class="player-pip-tag">BẠN</span>' : ''}
          <div class="tank-svg-wrap">
            ${svgContent}
          </div>
          ${isDead ? `
            <div class="dead-overlay">
              <span class="dead-cross"><i class="ti ti-x" aria-hidden="true"></i></span>
              ${respawnSec ? `<span class="respawn-mini-sec">${respawnSec}s</span>` : ''}
            </div>
          ` : `
            <div class="tank-hp-bar">
              <div class="tank-hp-fill" style="width: ${hpPercent}%"></div>
            </div>
          `}
        </div>
      `;
    }).join('');
  }

  initHUD() {
    const fireBtn = domById('fire-btn');
    if (fireBtn) {
      fireBtn.addEventListener('click', () => this.triggerPlayerFire());
      // Giữ nút bắn để xả đạn liên thanh (xe 6 nòng / trinh sát)
      // Giữ con trỏ / ngón tay cho nút: tay trượt khỏi nút lúc đang giữ không làm loạt đạn dừng giữa chừng (trước đây
      // 'pointerleave' nhả cò ngay khi lệch ra mép nút)
      fireBtn.addEventListener('pointerdown', (e) => {
        this.isPointerFiring = true;
        try { fireBtn.setPointerCapture(e.pointerId); } catch (err) { /* trình duyệt cũ */ }
      });
      ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(ev => {
        fireBtn.addEventListener(ev, () => { this.isPointerFiring = false; });
      });
    }

    // Nút chọn Liều phóng 1-5
    const chargeBtns = document.querySelectorAll('.charge-btn');
    chargeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const c = parseInt(btn.getAttribute('data-charge'), 10);
        this.selectCharge(c);
      });
    });

    // Nút chọn Loại đạn pháo: NORMAL (Thường), AP (Xuyên phá), HE (Nổ mạnh)
    const ammoBtns = document.querySelectorAll('.ammo-tab');
    ammoBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const ammo = btn.getAttribute('data-ammo');
        this.selectAmmoType(ammo);
      });
    });


    const restartBtn = domById('restart-game-btn');
    if (restartBtn) {
      restartBtn.addEventListener('click', () => this.restartMatch());
    }
  }

  // Câu nhắc kho vật tư khi bắn hết 1 loại đạn (Equipment.outOfStockNote)
  stockNote(k) {
    const P = this.player || (this.game && this.game.player);
    return (typeof Equipment !== 'undefined' && Equipment.outOfStockNote && P) ? Equipment.outOfStockNote(P, k) : '';
  }

  selectAmmoType(ammoType) {
    if (this.hud) return this.hud.selectAmmoType(ammoType);
    if (!this.player) return;

    // Kiểm tra cơ số đạn nâng cao
    if (ammoType === 'AP' && (this.player.apAmmoCount || 0) <= 0) {
      this.addCombatLog('[[alert-triangle]] Đã hết đạn xuyên phá! Nhặt hòm tiếp tế trên map' + this.stockNote('AP'), 'alert');
      return;
    }
    if (ammoType === 'HE' && (this.player.heAmmoCount || 0) <= 0 && this.player.tankType !== 'ARTILLERY') {
      this.addCombatLog('[[alert-triangle]] Đã hết đạn nổ mạnh! Nhặt hòm tiếp tế trên map' + this.stockNote('HE'), 'alert');
      return;
    }
    if (ammoType === 'CLUSTER' && (this.player.clusterAmmoCount || 0) <= 0) {
      this.addCombatLog('[[alert-triangle]] Đã hết đạn chùm nổ trên không! Nhặt hòm tiếp tế trên map' + this.stockNote('CLUSTER'), 'alert');
      return;
    }
    if (ammoType === 'INCENDIARY' && (this.player.incendiaryAmmoCount || 0) <= 0) {
      this.addCombatLog('[[alert-triangle]] Đã hết đạn cháy! Súng chuyển về đạn thường' + this.stockNote('INCENDIARY'), 'alert');
      return;
    }
    if (ammoType === 'ANTI_TANK_MISSILE' && (this.player.missileAmmoCount || 0) <= 0) {
      this.addCombatLog('[[alert-triangle]] Đã hết tên lửa! Nhặt hòm tiếp tế trên map' + this.stockNote('ANTI_TANK_MISSILE'), 'alert');
      return;
    }

    this.player.selectedAmmo = ammoType;
    this.updateAmmoUI();

    let name = 'ĐẠN CƠ BẢN';
    if (ammoType === 'AP') {
      name = this.player.tankType === 'ARTILLERY' ? 'ĐẠN XUYÊN PHÁ HẠNG NẶNG (ST 3.8)' : 'ĐẠN XUYÊN PHÁ (ST 2.3)';
    } else if (ammoType === 'HE') {
      name = 'ĐẠN NỔ MẠNH (BÁN KÍNH 160M DIỆN RỘNG)';
    } else if (ammoType === 'CLUSTER') {
      name = 'ĐẠN CHÙM NỔ TRÊN KHÔNG (BUNG 14 ĐẠN CON QUÉT 260M)';
    } else if (ammoType === 'INCENDIARY') {
      name = 'ĐẠN CHÁY NÂNG CAO (GÂY THIÊU ĐỐT LIÊN TỤC & LÀM CHẬM XE)';
    } else if (ammoType === 'ANTI_TANK_MISSILE') {
      name = 'TÊN LỬA CHỐNG TĂNG DẪN HƯỚNG';
    } else if (ammoType === 'GATLING_BULLET') {
      name = 'ĐẠN NHỎ LIÊN THANH (MƯA ĐẠN 6 NÒNG)';
    } else if (ammoType === 'SCOUT_BULLET') {
      name = 'ĐẠN NHỎ PHÁO 30MM (BẮN TỐC ĐỘ CAO)';
    }

    this.addCombatLog(`Đã nạp: ${name}`, 'tip');
  }

  updateAmmoUI() {
    if (this.hud) {
      return this.hud.updateAmmoUI();
    }
    if (!this.player) return;
    const ammoContainer = domById('ammo-selector');
    if (!ammoContainer) return;

    const ammos = this.player.availableAmmos || ['NORMAL', 'AP', 'HE'];

    // Render động danh sách các nút chọn đạn chuẩn xác theo từng loại xe
    let html = '';
    ammos.forEach((type, idx) => {
      const hotkey = idx + 1;
      const isActive = (this.player.selectedAmmo === type);
      let cardName = 'THƯỜNG';
      let qtyStr = '∞';
      let iconColor = '#e2e8f0';

      if (type === 'AP') {
        cardName = 'XUYÊN PHÁ';
        qtyStr = `x${this.player.apAmmoCount || 0}`;
        iconColor = '#00e5ff';
      } else if (type === 'HE') {
        cardName = 'NỔ MẠNH';
        qtyStr = (this.player.tankType === 'ARTILLERY') ? (this.player.heAmmoCount > 0 ? `x${this.player.heAmmoCount}` : '∞') : `x${this.player.heAmmoCount || 0}`;
        iconColor = '#f59e0b';
      } else if (type === 'CLUSTER') {
        cardName = 'ĐẠN CHÙM';
        qtyStr = `x${this.player.clusterAmmoCount || 0}`;
        iconColor = '#52b788';
      } else if (type === 'INCENDIARY') {
        cardName = 'ĐẠN CHÁY';
        qtyStr = `x${this.player.incendiaryAmmoCount || 0}`;
        iconColor = '#ff4500';
      } else if (type === 'ANTI_TANK_MISSILE') {
        cardName = 'TÊN LỬA';
        qtyStr = `x${this.player.missileAmmoCount || 0}`;
        iconColor = '#f97316';
      } else if (type === 'GATLING_BULLET' || type === 'SCOUT_BULLET') {
        cardName = 'ĐẠN NHỎ';
        qtyStr = '∞';
        iconColor = '#fbbf24';
      }

      html += `
        <button class="ammo-tab ${isActive ? 'active' : ''}" data-ammo="${type}" id="ammo-tab-${type}" title="[${hotkey}] ${cardName}">
          <span class="ammo-hotkey-tag">[${hotkey}]</span>
          <div class="ammo-svg-box">
            <svg class="ammo-svg-art" viewBox="0 0 24 24">
              <path d="M12 2 L15 8 L9 8 Z" fill="${iconColor}"/>
              <rect x="9.5" y="8" width="5" height="11" fill="#475569"/>
              <rect x="8.5" y="18" width="7" height="2.5" fill="#facc15"/>
            </svg>
          </div>
          <div class="ammo-info-compact">
            <span class="ammo-card-name">${cardName}</span>
            <span class="ammo-qty-pill">${qtyStr}</span>
          </div>
        </button>
      `;
    });

    ammoContainer.innerHTML = html;

    // Gán lại sự kiện click cho các nút đạn
    ammos.forEach(type => {
      const btn = domById(`ammo-tab-${type}`);
      if (btn) {
        btn.addEventListener('click', () => this.selectAmmoType(type));
      }
    });

    const armorTag = domById('reactive-armor-tag');
    if (armorTag) {
      if (this.player.hasReactiveArmor) {
        armorTag.classList.remove('hidden');
      } else {
        armorTag.classList.add('hidden');
      }
    }
  }

  selectCharge(chargeNum) {
    if (!this.player || chargeNum < 1 || chargeNum > 5) return;
    this.player.charge = chargeNum;

    const chargeBtns = document.querySelectorAll('.charge-btn');
    chargeBtns.forEach(btn => {
      if (parseInt(btn.getAttribute('data-charge'), 10) === chargeNum) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  // VÙNG CẤM BẮN (khu công trình giữa 3 cứ điểm): điểm rơi dự kiến hoặc xe đang khóa nằm trong đó -> không khai hỏa
  inNoFireZone() {
    const LS = this.terrain && this.terrain.landmarkSet;
    if (!LS || !LS.noFireAt) return false;
    const T = this.lockedTarget && !this.lockedTarget.isDead ? this.lockedTarget : null;
    return !!((this._lastTraj && LS.noFireAt(this._lastTraj.x, this._lastTraj.z, 8)) || (T && LS.noFireAt(T.x, T.z, 8)));
  }
  noFireWarn() {
    const t = performance.now();
    if (t - (this._nfzT || 0) < 1500) return;
    this._nfzT = t;
    this.addCombatLog('[[alert-triangle]] VÙNG CẤM BẮN — khu căn cứ giữa 3 cứ điểm, không được ngắm bắn vào đó!', 'alert');
  }

  triggerPlayerFire() {
    if (!this.player || this.player.isDead) return;
    // xe tăng đang ngắm lên trời / khóa drone: Space bóp cò trạm súng máy phòng không (drone_air.js), không bắn pháo chính
    if (this._airAim && this.player.tankType === 'ALL_ROUNDER') return;
    if (this.inNoFireZone()) { this.noFireWarn(); return; }
    // Xe trinh sát đang chọn ô tên lửa: Space phóng tên lửa dẫn hướng (súng máy nạp đạn không ảnh hưởng)
    if (this.player.tankType === 'SCOUT' && this.player.selectedAmmo === 'ANTI_TANK_MISSILE') {
      this.triggerPlayerAntiTank();
      return;
    }

    if (this.player.reloadTimer > 0) {
      this.addCombatLog('[[alert-triangle]] Đang trong chu kỳ nạp đạn, chưa thể khai hỏa!', 'alert');
      return;
    }

    // 1. Xe 6 nòng & xe trinh sát: xả đạn liên thanh khi GIỮ phím Space / nút bắn (xử lý trong updateGatling)
    if (this.player.tankType === 'GATLING' || this.player.tankType === 'SCOUT') {
      if (this.player.tankType === 'GATLING' && this.player.isOverheated) {
        this.addCombatLog('[[flame]] Cụm 6 nòng đang QUÁ NHIỆT nóng đỏ! Cần ngừng xả đạn để chờ nòng nguội bớt!', 'alert');
      }
      return;
    }

    // 2. Kiểm tra trạng thái pháo cao xạ (Artillery)
    if (this.player.tankType === 'ARTILLERY') {
      if (!this.player.isDeployed) {
        const pct = Math.round((this.player.deployProgress || 0) * 100);
        if (pct > 0) {
          this.addCombatLog(`[[hourglass]] Pháo cao xạ đang hạ chân chống (${pct}%)... Cần đứng yên 2 giây!`, 'alert');
        } else {
          this.addCombatLog('[[alert-triangle]] Pháo cao xạ cần dừng xe 2 giây để hạ chân chống thủy lực cố định mới có thể bắn!', 'alert');
        }
        return;
      }
      // Nòng đang gác trên nóc cabin / chĩa về mũi xe: không bắn vắt qua cabin
      if (this.player.turretInBlind) {
        this.addCombatLog('[[alert-triangle]] Nòng pháo đang chĩa qua nóc cabin — xoay tháp sang bên / ra sau (phím ← →) hoặc quay thân xe rồi mới bắn', 'alert');
        return;
      }

      // Mục tiêu sát thân xe hơn cả tầm bắn thẳng ngắn nhất (nòng dài gần bằng khoảng cách): không bắn được
      // (địch gần dưới tầm cầu vồng thì máy tính hỏa lực tự hạ nòng bắn thẳng — xem solveAimingForTarget)
      if (this.lockedTarget) {
        const dist = Math.hypot(this.lockedTarget.x - this.player.x, this.lockedTarget.z - this.player.z);
        const minD = BallisticsSystem3D.ARTY_DIRECT.min;
        if (dist < minD) {
          this.addCombatLog(`[[alert-triangle]] Địch sát quá (${Math.round(dist)}M) — nòng pháo dài hơn khoảng cách, hãy lùi xe ra!`, 'alert');
          return;
        }
      }
    }

    const firedShell = this.player.fire(this.ballistics, this.radar);
    if (firedShell) {
      // màn hình drone: đếm ngược thời gian bay tới lúc đạn chạm đất
      if (this.player.tankType === 'ARTILLERY') this._shotWatch = { shell: firedShell, eta: (this._lastTraj && this._lastTraj.ft) || 0, t: 0 };
      if (this.matchmaking) {
        this.matchmaking.broadcastMyFire(firedShell);
      }
      this.cameraShake = (this.player.tankType === 'ARTILLERY') ? 5 : 3;   // giật nhẹ khi khai hỏa (trước 16-28)
      this.updateAmmoUI();

    }
  }

  // Khoảng cách từ điểm nổ tới thân xe (3D): theo chiều ngang tính tới tâm xe, theo chiều đứng chỉ tính phần
  // nằm ngoài chiều cao thân xe (~2 m) -> nổ sát đất cạnh xe không đổi, nổ trên mái nhà / trên cao thì xa hơn
  blastDistance(unit, x, y, z) {
    const base = unit.y || (this.terrain && this.terrain.getElevationAt ? this.terrain.getElevationAt(unit.x, unit.z) : 0);
    const dy = y < base ? base - y : Math.max(0, y - (base + 16));
    return Math.hypot(unit.x - x, unit.z - z, dy);
  }

  // Mức sát thương nổ lan còn lại theo khoảng cách: trọn vẹn trong vùng lõi, ra ngoài giảm dần ~1/r
  // (mật độ mảnh văng & xung sức ép giảm nhanh theo khoảng cách), về 0 êm ở mép bán kính nổ
  blastFalloff(dist, core, radius) {
    if (dist >= radius) return 0;
    return Math.min(1, core / Math.max(1, dist)) * (1 - Math.pow(dist / radius, 3));
  }

  // Xử lý nổ đạn pháo 3D
  handleShellImpact(shell, hitType = 'GROUND', directTarget = null) {
    // Đạn đã nổ: cắt ngay tiếng rít đang lao xuống (điểm rơi thật có thể khác dự đoán)
    if (shell.whistleSnd) { shell.whistleSnd.stop(); shell.whistleSnd = null; }
    // CỨ ĐIỂM BÊ TÔNG: đạn chạm phần xe đang nằm dưới mái che -> bê tông / gờ hầm chặn (không mất máu);
    // chỉ phần thân xe thò ra khỏi vùng bảo vệ mới bị trúng
    if (hitType === 'DIRECT_HIT' && directTarget && this.terrain && this.terrain.shelterOf && this.terrain.shelterOf(directTarget)) {
      const fxS = this.effectsManager && this.effectsManager.fx;
      const probe = fxS && directTarget.group ? fxS.raycastUnit(directTarget, shell) : null;
      const pt = probe ? probe.point : shell;
      if (this.terrain.isProtectedPoint(pt.x, pt.y, pt.z)) {
        shell.absorbedBy = directTarget;
        hitType = 'WALL';
        directTarget = null;
      }
    }
    const x = shell.x;
    const y = shell.y;
    const z = shell.z;
    const ammoType = shell.ammoType || 'NORMAL';
    const isSpecial = (ammoType !== 'NORMAL');
    // Bê tông cứ điểm không bị xuyên / phá: không phụt mảnh bê tông ra mặt sau
    const onStronghold = hitType === 'WALL' && !!(this.terrain && this.terrain.strongholdSet && this.terrain.strongholdSet.covers(x, z, 8));

    // 1-2. Vụ nổ chân thực: chớp sáng, cầu lửa, đất đá văng, bụi khói, hố đạn / vết nứt tường (ExplosionFX)
    //      Trúng xe: dò tia vào mô hình để nổ đúng điểm chạm, vết đạn bám vào bộ phận bị bắn, nảy khi góc sượt
    const fxSys = this.effectsManager && this.effectsManager.fx;
    let fxDone = false;
    let unitHit = null;
    if (fxSys && hitType === 'DIRECT_HIT' && directTarget && directTarget.group) {
      const hit = fxSys.raycastUnit(directTarget, shell);
      unitHit = hit;
      if (hit) {
        const surf = fxSys.impactSurface(ammoType, hit, new THREE.Vector3(shell.vx || 0, shell.vy || 0, shell.vz || 0), { heavy: !!shell.isHeavyArty });
        if (surf && surf.ricochet) hit.ricochet = true;
        fxDone = true;
      }
    }
    if (!fxDone && hitType === 'WATER' && fxSys && fxSys.waterBurst) {
      // Đạn rơi xuống nước: cột nước / tia nước theo loại đạn, nghiêng theo hướng bay + sóng nổ lan
      const depth = this.terrain && this.terrain.groundAtRaw ? Math.max(0.5, y - this.terrain.groundAtRaw(x, z)) : 6;
      fxSys.waterBurst(x, y, z, ammoType, !!shell.isHeavyArty, depth, { x: shell.vx || 0, y: shell.vy || 0, z: shell.vz || 0 });
      fxDone = true;
    }
    const remoteShell = !!(this.netSync && this.netSync.skipShellDamage && this.netSync.skipShellDamage(shell, this.units.find(u => u.id === shell.shooterId)));
    // Trúng nhà: pháp tuyến đúng mặt tường / sàn / mái bị chạm -> lửa, mảnh văng bật ra đúng phía
    const bn = (hitType === 'BUILDING' || hitType === 'TREE') && shell.hitNormal && shell.hitNormal.ny !== undefined ? { x: shell.hitNormal.nx, y: shell.hitNormal.ny, z: shell.hitNormal.nz } : null;
    // Nổ trên tán cây: hiệu ứng nổ trên không + cành gãy, dăm gỗ, lá vụn mưa xuống
    if (!fxDone && hitType === 'CANOPY') {
      this.createImpactEffects(x, y, z, ammoType, 'AIRBURST', { heavy: !!shell.isHeavyArty, dir: { x: shell.vx || 0, y: shell.vy || 0, z: shell.vz || 0 }, noCrater: true });
      const tr = this.terrain && this.terrain.trees;
      if (tr && tr.canopyBurstFx) tr.canopyBurstFx(x, y, z, ammoType === 'GATLING_BULLET' ? 0.3 : shell.isHeavyArty ? 1.4 : 1, fxSys);
      fxDone = true;
    }
    if (!fxDone) this.createImpactEffects(x, y, z, ammoType, hitType, { heavy: !!shell.isHeavyArty, dir: { x: shell.vx || 0, y: shell.vy || 0, z: shell.vz || 0 }, normal: bn || undefined, tree: hitType === 'TREE' ? shell.hitTree : undefined, noCrater: remoteShell || hitType === 'TREE' || hitType === 'SANDBAG' });
    // Đạn xuyên giáp đâm thủng tường: lõi urani vỡ nóng đỏ + bê tông phụt ra mặt sau (nhà: lỗ ra ở vách bên kia do Destructibles tính)
    if (ammoType === 'AP' && !onStronghold && hitType === 'WALL' && fxSys && fxSys.spallCone) {
      const dv = new THREE.Vector3(shell.vx || 0, shell.vy || 0, shell.vz || 0);
      if (dv.lengthSq() > 1) {
        dv.normalize();
        fxSys.spallCone(new THREE.Vector3(x, y, z).addScaledVector(dv, 12), dv, 46, { spread: 0.42, dust: [0.72, 0.7, 0.66] });
      }
    }
    // Đầu nổ lõm (RPG / tên lửa) trúng tường bê tông / vách nhà: luồng kim loại nóng chảy xuyên thủng, phụt sáng ra
    // mặt sau (vách nhà: bê tông phụt mặt sau do Destructibles tính, ở đây chỉ vẽ luồng)
    if ((ammoType === 'RPG' || ammoType === 'ANTI_TANK_MISSILE') && !onStronghold && (hitType === 'WALL' || hitType === 'BUILDING') && fxSys && fxSys.heatPierce) {
      const dv = new THREE.Vector3(shell.vx || 0, shell.vy || 0, shell.vz || 0);
      if (dv.lengthSq() > 1) fxSys.heatPierce(new THREE.Vector3(x, y, z), dv.normalize(), hitType === 'WALL' ? 6.4 : 3, { noSpall: hitType === 'BUILDING', power: ammoType === 'ANTI_TANK_MISSILE' ? 1.25 : 1 });
    }

    // Vụ nổ tác động lên cảnh vật (cây cháy / đổ, nhà thủng / sập, hố bom).
    // ĐỒNG BỘ: chỉ máy có chủ quyền với viên đạn tính (máy bắn; bot -> chủ phòng) với hạt giống ngẫu nhiên riêng,
    // rồi gửi ENV_HIT (điểm nổ chuẩn + hạt giống) -> mọi máy phá cảnh vật giống hệt nhau.
    if (this.terrain && this.terrain.damageAt) {
      const envShooter = this.units.find(u => u.id === shell.shooterId);
      const envAuth = !(this.netSync && this.netSync.skipShellDamage && this.netSync.skipShellDamage(shell, envShooter));
      if (envAuth) {
        const seed = (Math.random() * 4294967296) >>> 0;
        const dir = { x: shell.vx || 0, y: shell.vy || 0, z: shell.vz || 0 };
        // pháp tuyến mặt bê tông cứ điểm bị trúng (vết đạn tích tụ đúng mặt tường); null = mái / mặt trên
        const hn = shell.hitNormal || null;
        // Làm tròn đúng như gói ENV_HIT -> máy bắn & máy nhận khoét nhà giống hệt nhau đến từng ô
        const q1 = v => Math.round(v * 10) / 10, q2 = v => (typeof v === 'number' ? Math.round(v * 100) / 100 : undefined);
        const ev = { x: q1(x), y: q1(y), z: q1(z), a: ammoType, h: !!shell.isHeavyArty, t: hitType, s: seed, dx: q1(dir.x), dy: q1(dir.y), dz: q1(dir.z), os: onStronghold ? 1 : 0,
          nx: hn ? q2(hn.nx) : undefined, ny: hn ? q2(hn.ny) : undefined, nz: hn ? q2(hn.nz) : undefined };
        this.applyEnvDamage(ev, false);
        if (this.netSync && this.netSync.sendEnvHit) this.netSync.sendEnvHit(ev);
      }
    }

    // 3. Âm thanh nổ tức thì không trễ & phân loại theo cỡ đạn (HE, AP, Tên lửa, Súng máy)
    if (this.player && window.soundEngine) {
      const distToPlayer = Math.hypot(this.player.x - x, this.player.z - z);
      window.soundEngine.playExplosionAtDistance(distToPlayer, hitType === 'CANOPY' ? 'TREE' : hitType, ammoType, { x, z }, { heavy: !!shell.isHeavyArty });
      // Xe mình trúng đạn: tiếng thép thân xe nghe từ trong khoang + ù tai; đạn lớn nổ sát bên cũng gây ù tai
      if (directTarget && directTarget === this.player && hitType === 'DIRECT_HIT') {
        if (window.soundEngine.playHullHit) window.soundEngine.playHullHit(ammoType);
      } else if (window.soundEngine.shellShock && !this.player.isDead) {
        const big = ammoType === 'HE' || ammoType === 'NORMAL' || ammoType === 'CLUSTER' || ammoType === 'RPG' || ammoType === 'ANTI_TANK_MISSILE';
        const R = shell.isHeavyArty ? 220 : 130;
        if (big && distToPlayer < R) window.soundEngine.shellShock((1 - distToPlayer / R) * (ammoType === 'HE' || shell.isHeavyArty ? 0.8 : 0.55));
      }

      // Không rung khung hình khi đạn nổ (theo yêu cầu: gây khó chịu, khó ngắm)
    }

    const shooter = this.units.find(u => u.id === shell.shooterId);
    const shooterTeam = shooter ? shooter.team : shell.shooterTeam;

    // [NET] Đạn do máy khác bắn: chỉ hiển thị hiệu ứng nổ ở trên; sát thương do máy có chủ quyền quyết định & gửi sự kiện DAMAGE
    if (this.netSync && this.netSync.skipShellDamage(shell, shooter)) {
      // Hư hại bộ phận (xích đứt, lốp xẹp, giáp bong, kẹt tháp...) vẫn chạy trên mọi máy để hình ảnh khớp
      // và xe của mình nhận đúng hình phạt chỉ số; máu vẫn do máy có chủ quyền quyết định
      this.applyVehicleDamageVisuals(shell, hitType, directTarget, unitHit, ammoType, shooter, shooterTeam, fxSys);
      return;
    }

    // 4. Nếu va chạm bờ tường móng ngựa 3D hoặc tòa nhà cao tầng kiên cố
    if (hitType === 'WALL' || hitType === 'BUILDING') {
      const now = performance.now();
      if (shell.absorbedBy && (shell.absorbedBy.isPlayer || (shooter && shooter.isPlayer))) {
        if (!this._shelterLogT || now - this._shelterLogT > 2500) {
          this._shelterLogT = now;
          this.addCombatLog(shell.absorbedBy.isPlayer
            ? '[[shield]] Mái & tường bê tông cứ điểm đã chặn đạn — xe bạn nằm trong vùng bảo vệ, không mất máu!'
            : `[[shield]] ${shell.absorbedBy.name} đang nấp trong cứ điểm: đạn bị bê tông chặn! Chờ địch thò ra ngoài.`, 'tip');
        }
      } else if (shooter && shooter.isPlayer) {
        this.addCombatLog(onStronghold ? '[[wall]] Đạn nổ trên bê tông / ụ đất cứ điểm (không thể phá hủy)!' : '[[shield]] Đạn pháo va vào tường công sự / tòa nhà kiên cố và phát nổ!', 'tip');
      }
    }

    // 5. Nếu bắn thẳng trúng trực tiếp thân xe
    // Trúng thẳng xác xe: xé rã tiếp (văng tháp, móp nát thân), không tính điểm
    if (hitType === 'DIRECT_HIT' && directTarget && directTarget.isDead && unitHit && typeof VehicleDamage !== 'undefined') {
      const wr = VehicleDamage.onDirectHit(directTarget, { hit: unitHit, ammo: ammoType, heavy: !!shell.isHeavyArty, fx: fxSys, dir: new THREE.Vector3(shell.vx || 0, shell.vy || 0, shell.vz || 0) });
      this.reportWreckDamage(directTarget, shooter, wr && wr.events);
    }
    if (hitType === 'DIRECT_HIT' && directTarget && !directTarget.isDead) {
      // MIỄN NHIỄM SÁT THƯƠNG PHE MÌNH: Bỏ qua nếu bắn trúng xe đồng minh
      if (shooterTeam && directTarget.team === shooterTeam) {
        return;
      }

      // Tính toán sát thương trực tiếp theo loại xe và loại đạn:
      // - GATLING: 0.15 sát thương (đốt máu dần liên tục)
      // - SCOUT SÚNG MÁY: 0.08 sát thương / SCOUT ĐẠN CHỐNG TĂNG: 1.6 sát thương
      // - PHÁO TỰ HÀNH: 2.5 - 3.0 sát thương (hủy diệt, trúng phát chết luôn xe máu giấy)
      // - TANK ĐA DỤNG: 1 - 2 sát thương (cân bằng)
      // Sát thương trúng thẳng đã gồm cả sức nổ tại chỗ (xe trúng thẳng không bị cộng thêm sát thương nổ lan)
      let directDamage = 1.6;
      if (ammoType === 'GATLING_BULLET' || ammoType === 'SCOUT_BULLET') {
        directDamage = (shooter && shooter.tankType === 'SCOUT') ? 0.12 : 0.075; // 12.7mm bắn chậm hơn nhưng mỗi viên mạnh hơn; 30mm Gatling băng 450 viên nên mỗi viên nhẹ hơn
      } else if (ammoType === 'INCENDIARY') {
        directDamage = (shooter && shooter.tankType === 'SCOUT') ? 0.14 : 0.12;   // bén lửa: xem dưới (lồng thép chặn được)
      } else if (ammoType === 'ANTI_TANK_MISSILE') {
        directDamage = 3.0; // Tên lửa chống tăng đầu nổ kép: xuyên sườn tăng chủ lực 2 phát chết, xe nhẹ 1 phát
      } else if (ammoType === 'RPG') {
        directDamage = 2.4; // Đạn phản lực nổ lõm đơn: xuyên sườn / đuôi, không xuyên giáp trước tăng chủ lực
      } else if (ammoType === 'CLUSTER_SUBMUNITION') {
        directDamage = 0.5; // Bom con nổ lõm-mảnh trúng thẳng nóc xe
      } else if (ammoType === 'CLUSTER') {
        directDamage = 1.8;
      } else if (shell.isHeavyArty) {
        directDamage = (ammoType === 'AP') ? 3.2 : 3.0; // Lựu pháo 155mm trúng thẳng (đánh nóc): diệt gọn xe nhẹ, xe tăng chủ lực chịu 2 phát
      } else {
        // Sát thương khi XUYÊN THỦNG; có xuyên được không do VehicleDamage tính (độ xuyên vs giáp, góc chạm, vùng trúng)
        directDamage = (ammoType === 'AP') ? 2.0 : ((ammoType === 'HE') ? 1.6 : 1.6);
      }

      // Giáp theo cấp + hướng + gạch ERA, kèm hỏng hóc bộ phận theo đúng điểm chạm
      if (typeof VehicleDamage !== 'undefined') {
        const dmgRes = VehicleDamage.onDirectHit(directTarget, {
          hit: unitHit, ammo: ammoType, heavy: !!shell.isHeavyArty, shooter, fx: fxSys,
          dir: new THREE.Vector3(shell.vx || 0, shell.vy || 0, shell.vz || 0)
        });
        directDamage = Math.round(directDamage * dmgRes.mul * 1000) / 1000;
        if (dmgRes.noFire) directTarget._noIgnite = true;
        // Đạn nảy khỏi giáp nghiêng: chỉ còn chút sát thương va đập
        if (unitHit && unitHit.ricochet) directDamage = Math.round(directDamage * 0.12 * 1000) / 1000;
        // Đạn đã nảy trên mặt nước trước khi trúng: chao đảo, chạm xiên / ngang thân -> xuyên kém hẳn
        if (shell.skips) directDamage = Math.round(directDamage * (shell.skipMul || 1) * 1000) / 1000;
        this.reportVehicleDamage(directTarget, shooter, dmgRes.events);
      }
      // [NET] máy này có quyền với phát bắn -> gửi trạng thái hư hại bộ phận (đứt xích, cháy...) cho mọi máy
      if (this.netSync && this.netSync.queueParts) this.netSync.queueParts(directTarget);

      // Giáp phản ứng nổ nhặt từ thùng tiếp tế: phản ứng theo loại đạn như gạch giáp nổ (Equipment.eraEffect)
      // phát đã bị chặn hết (gạch giáp nổ mua thêm, lồng thép, hệ thống đánh chặn): không đốt thêm giáp nhặt được
      directTarget._eraIgnore = directDamage <= 0;
      if (directTarget.hasReactiveArmor && !directTarget._eraIgnore && !(unitHit && unitHit.ricochet) && typeof Equipment !== 'undefined' && Equipment.eraEffect) {
        const eff = Equipment.eraEffect(ammoType, !!shell.isHeavyArty, shooter);
        if (!eff.trigger) directTarget._eraIgnore = true;          // đạn nhỏ: gạch không kích nổ, giữ nguyên giáp
        else if (eff.mul > 0) {
          // đạn quá mạnh (tên lửa đầu nổ kép, mũi tên xuyên giáp, lựu pháo): gạch nổ & mất nhưng chỉ giảm bớt sát thương
          directTarget.hasReactiveArmor = false;
          if (directTarget.reactiveArmorMesh) directTarget.reactiveArmorMesh.visible = false;
          if (typeof directTarget.spawnReactiveArmorTriggerFX === 'function') directTarget.spawnReactiveArmorTriggerFX();
          directDamage = Math.round(directDamage * eff.mul * 1000) / 1000;
          directTarget._eraIgnore = true;
          const why = eff.why === 'tandem' ? 'đầu nổ kép xuyên qua' : eff.why === 'kinetic' ? 'mũi tên xuyên giáp bị chém lệch' : 'lựu pháo quá mạnh';
          if (directTarget.isPlayer || (shooter && shooter.isPlayer)) this.addCombatLog(`[[shield]] Giáp phản ứng nổ của ${directTarget.name} kích nổ nhưng ${why} — chỉ giảm ${Math.round((1 - eff.mul) * 100)}% sát thương`, 'alert');
        }
      }
      const res = directTarget.takeDamage(directDamage, shooter, 'DIRECT_HIT');
      directTarget._eraIgnore = false;
      // Đạn cháy bén lửa vào xe (trừ khi chất cháy bắn tung trên lồng thép)
      if (ammoType === 'INCENDIARY' && !directTarget._noIgnite && !directTarget.isDead && typeof directTarget.ignite === 'function') directTarget.ignite(2.0);
      directTarget._noIgnite = false;

      if (res.blocked) {
        this.addCombatLog(`[[shield]] GIÁP PHẢN ỨNG NỔ CỦA ${directTarget.name} ĐÃ KÍCH NỔ CẢN PHÁ ĐẠN! BẢO VỆ XE AN TOÀN KHÔNG MẤT MÁU!`, 'alert');
      } else if (res.killed) {
        if (directTarget.isPlayer) {
          this.addCombatLog(`[[alert-triangle]] BỊ BẮN THẲNG TRÚNG TRỰC TIẾP! PHÁ HỦY HOÀN TOÀN!`, 'alert');
        } else if (shooter && shooter.isPlayer) {
          const specialTag = (ammoType === 'ANTI_TANK_MISSILE') ? ' [ĐẠN CHỐNG TĂNG]' : ((ammoType === 'GATLING_BULLET') ? ' [SÚNG MÁY LIÊN THANH]' : (shell.isHeavyArty ? ' [PHÁO HẠNG NẶNG]' : (ammoType === 'AP' ? ' [ĐẠN XUYÊN PHÁ]' : '')));
          this.addCombatLog(`[[bomb]] BẮN THẲNG TRÚNG TRỰC TIẾP ${directTarget.name}!${specialTag} TIÊU DIỆT HOÀN TOÀN!`, 'tip');
        }
        this.onUnitDestroyed(directTarget, shooter);
      } else {
        if (directTarget.isPlayer && ammoType !== 'GATLING_BULLET') {
          this.addCombatLog(`[[alert-triangle]] BỊ BẮN TRÚNG (-${directDamage} MÁU)! CÒN ${res.currentHp.toFixed(1)}/${directTarget.maxHp} MÁU!`, 'alert');
        } else if (shooter && shooter.isPlayer && ammoType !== 'GATLING_BULLET') {
          this.addCombatLog(`[[crosshair]] BẮN TRÚNG ${directTarget.name}! (-${directDamage} MÁU) CÒN ${res.currentHp.toFixed(1)}/${directTarget.maxHp} MÁU!`, 'tip');
        }
        this.updateTeamScoreUI();
      }
      return;
    }

    // 6. Sát thương nổ diện rộng 3D
    // Bán kính nổ / vùng lõi theo loại đạn (bảng dùng chung với vòng sát thương dự kiến trên HUD — ballistics.js)
    const BP = BallisticsSystem3D.blastProfile(ammoType, !!shell.isHeavyArty);
    const blastRadius = BP.radius, blastCore = BP.core;

    this.units.forEach(unit => {
      if (unit._netHidden || unit._netStale) return;   // vị trí không rõ (máy chủ lọc tầm nhìn / mất gói quá lâu)
      // Xác xe trong vùng nổ: tiếp tục bị xé rã (chỉ hiệu ứng, không tính điểm)
      if (unit.isDead && unit.dmg && unit.group && unit.group.visible && typeof VehicleDamage !== 'undefined') {
        if (hitType === 'DIRECT_HIT' && unit === directTarget) return;
        const dW = this.blastDistance(unit, x, y, z);
        if (dW <= blastRadius) {
          const wr = VehicleDamage.onSplash(unit, { x, y, z, ammo: ammoType, heavy: !!shell.isHeavyArty, dist: dW, radius: blastRadius, fx: fxSys });
          this.reportWreckDamage(unit, shooter, wr && wr.events);
        }
        return;
      }
      // Xe trúng thẳng đã nhận đủ sát thương (gồm sức nổ tại chỗ) -> không tính thêm sát thương nổ lan lần nữa
      if (hitType === 'DIRECT_HIT' && unit === directTarget) return;
      if (!unit.isDead) {
        // MIỄN NHIỄM HOÀN TOÀN SÁT THƯƠNG PHE MÌNH: Tự bắn vào tường hay đất không bao giờ gây sát thương lên phe ta
        if (shooterTeam && unit.team === shooterTeam) {
          return;
        }

        const dist = this.blastDistance(unit, x, y, z);
        if (dist <= blastRadius) {
          // Sát thương lớn nhất (sát điểm nổ) theo loại đạn; nhân với mức giảm theo khoảng cách ở dưới
          let splashDamage = 1.0;
          if (ammoType === 'GATLING_BULLET' || ammoType === 'SCOUT_BULLET') {
            // 30mm nổ-mảnh văng mảnh nhỏ sát điểm chạm; 12.7mm không có thuốc nổ
            splashDamage = (ammoType === 'SCOUT_BULLET' || (shooter && shooter.tankType === 'SCOUT')) ? 0 : 0.015;
          } else if (ammoType === 'INCENDIARY') {
            splashDamage = 0.08;   // bén lửa khi nổ sát xe: xem dưới (lồng thép chặn được)
          } else if (ammoType === 'CLUSTER_SUBMUNITION') {
            splashDamage = 0.45; // Mảnh văng sát thương nhỏ diện rộng
          } else if (ammoType === 'RPG' || ammoType === 'ANTI_TANK_MISSILE') {
            splashDamage = 1.3;
          } else if (shell.isHeavyArty) {
            splashDamage = 2.2; // Pháo HE hạng nặng nổ lan cực mạnh
          } else if (ammoType === 'HE') {
            splashDamage = 1.6;
          } else if (ammoType === 'AP') {
            splashDamage = 0.15;   // không thuốc nổ: chỉ mảnh vỡ / bụi kim loại cháy sát điểm chạm
          }
          splashDamage *= this.blastFalloff(dist, blastCore, blastRadius);

          // Nổ dưới nước: nước hấp thụ phần lớn mảnh văng & sóng nổ
          if (hitType === 'WATER') splashDamage *= 0.5;
          const premSplash = typeof Equipment !== 'undefined' ? Equipment.splashMul(shooter, ammoType) : 1;   // lựu đạn mảnh định sẵn
          splashDamage *= premSplash;
          // Cứ điểm: chỉ phần thân xe thò ra khỏi mái che mới hứng sức ép / mảnh văng
          const exposure = this.terrain && this.terrain.shelterFactor ? this.terrain.shelterFactor(unit) : 1;
          if (exposure <= 0) return;
          splashDamage *= exposure;
          // Vật cản che chắn sóng nổ & mảnh văng: tường / mái boong-ke bê tông dày, tòa nhà
          if (this.terrain && this.terrain.blastFactor) {
            const uy = (unit.y || this.terrain.getElevationAt(unit.x, unit.z)) + 8;
            let shield = this.terrain.blastFactor(x, y + 2, z, unit.x, uy, unit.z);
            // Nấp dưới mái hầm: đạn chùm / lựu pháo nổ trên cao gần như vô hại
            if (shield === 1 && this.terrain.isUnderCover && this.terrain.isUnderCover(unit.x, unit.z) && y > uy + 18) shield = 0.15;
            if (shield < 1) {
              splashDamage *= shield;
              if (unit.isPlayer && !this._coverLogT || (unit.isPlayer && performance.now() - this._coverLogT > 5000)) {
                this._coverLogT = performance.now();
                this.addCombatLog('[[wall]] Tường bê tông / mái hầm đã chặn phần lớn sức ép vụ nổ!', 'tip');
              }
            }
          }
          // Nổ trên tán: mảnh thép + dăm gỗ dội thẳng từ trên xuống, tán / thân cây không che được xe nấp ngay dưới tán
          if (hitType === 'CANOPY') {
            const below = Math.hypot(unit.x - x, unit.z - z);
            if (below < 45) splashDamage *= 1.25;
            if (unit.isPlayer && below < 60 && (!this._burstLogT || performance.now() - this._burstLogT > 8000)) {
              this._burstLogT = performance.now();
              this.addCombatLog('[[tree]] Đạn nổ trên tán cây: mảnh văng & dăm gỗ dội xuống từ trên đầu!', 'alert');
            }
          }
          // Thân cây / rừng rậm chắn đường bay mảnh văng (sức ép vẫn vòng qua): giảm bớt sát thương nổ lan
          else if (this.terrain && this.terrain.treeShield && ammoType !== 'INCENDIARY') {
            const uy2 = (unit.y || this.terrain.getElevationAt(unit.x, unit.z)) + 6;
            const tsh = this.terrain.treeShield(x, y + 2, z, unit.x, uy2, unit.z);
            if (tsh < 1) {
              splashDamage *= tsh;
              if (unit.isPlayer && (!this._treeLogT || performance.now() - this._treeLogT > 8000)) {
                this._treeLogT = performance.now();
                this.addCombatLog('[[tree]] Thân cây / rừng rậm đã đỡ bớt mảnh văng!', 'tip');
              }
            }
          }
          if (typeof VehicleDamage !== 'undefined') {
            const dmgRes = VehicleDamage.onSplash(unit, { x, y, z, ammo: ammoType, heavy: !!shell.isHeavyArty, dist, radius: blastRadius, shooter, fx: fxSys });
            splashDamage = Math.round(splashDamage * dmgRes.mul * 1000) / 1000;
            if (dmgRes.noFire) unit._noIgnite = true;
            // phần cộng thêm của đạn cao cấp không vượt ngưỡng 1 phát máy chủ chấp nhận (2.6 máu)
            if (premSplash > 1) splashDamage = Math.min(splashDamage, Math.max(2.5, splashDamage / premSplash));
            this.reportVehicleDamage(unit, shooter, dmgRes.events);
          }
          if (this.netSync && this.netSync.queueParts) this.netSync.queueParts(unit);

          // Sức nổ lan / mảnh văng không làm giáp phản ứng nổ kích nổ (gạch chỉ phản ứng với đạn trúng thẳng)
          unit._eraIgnore = true;
          const res = unit.takeDamage(splashDamage, shooter, 'SHELL');
          unit._eraIgnore = false;
          if (ammoType === 'INCENDIARY' && dist <= 12 && !unit._noIgnite && !unit.isDead && typeof unit.ignite === 'function') unit.ignite(1.5);
          unit._noIgnite = false;

          if (res.blocked) {
            this.addCombatLog(`[[shield]] GIÁP PHẢN ỨNG NỔ CỦA ${unit.name} ĐÃ CẢN PHÁ VỤ NỔ! KHÔNG MẤT MÁU!`, 'alert');
          } else if (res.killed) {
            if (unit.isPlayer) {
              this.addCombatLog(`[[alert-triangle]] BỊ TRÚNG ĐẠN PHÁO KÍCH! PHÁ HỦY HOÀN TOÀN!`, 'alert');
            } else if (shooter && shooter.isPlayer) {
              const specialTag = shell.isHeavyArty ? ' [PHÁO HẠNG NẶNG]' : (ammoType === 'HE' ? ' [ĐẠN NỔ MẠNH 120M]' : '');
              this.addCombatLog(`[[crosshair]] ĐÁNH TRÚNG ${unit.name}!${specialTag} TIÊU DIỆT HOÀN TOÀN!`, 'tip');
            }
            this.onUnitDestroyed(unit, shooter);
          } else {
            if (unit.isPlayer && ammoType !== 'GATLING_BULLET') {
              this.addCombatLog(`[[alert-triangle]] DÍNH SỨC ÉP ĐẠN NỔ (-${splashDamage} MÁU)! CÒN ${res.currentHp.toFixed(1)}/${unit.maxHp} MÁU!`, 'alert');
            }
            this.updateTeamScoreUI();
          }
        }
      }
    });
  }

  /**
   * Phá hủy cảnh vật theo một sự kiện nổ: d = { x, y, z, a (loại đạn), h (pháo hạng nặng), t (loại va chạm),
   * s (hạt giống ngẫu nhiên), dx/dy/dz (hướng bay), os (trúng bê tông cứ điểm) }.
   * Chạy trong Destructibles.withSeed(s) -> kết quả vỡ / sập giống hệt nhau trên mọi máy.
   * fromNet: sự kiện từ máy khác -> tự đào hố bom tại điểm nổ chuẩn (đạn mô phỏng cục bộ không đào).
   */
  applyEnvDamage(d, fromNet) {
    if (!this.terrain || !this.terrain.damageAt) return;
    const fxSys = this.effectsManager && this.effectsManager.fx;
    const run = () => {
      const envEvents = this.terrain.damageAt(d.x, d.y, d.z, d.a, !!d.h, fxSys, { t: d.t, nx: d.nx, ny: d.ny, nz: d.nz, dx: d.dx, dy: d.dy, dz: d.dz });
      // Đạn xuyên động năng trúng tường boong-ke: xuyên thủng, bay tiếp phá vách phía sau (tối đa ~2 lớp vách).
      // Nhà: lỗ vào + lỗ ra ở vách đối diện do BuildingSet tự dò theo hướng bay
      if (d.a === 'AP' && !d.os && d.t === 'WALL') {
        const sp = Math.hypot(d.dx || 0, d.dy || 0, d.dz || 0);
        if (sp > 1) {
          const dx = d.dx / sp, dy = d.dy / sp, dz = d.dz / sp;
          let walls = 0;
          for (let k = 6; k <= 66 && walls < 2; k += 5) {
            const px = d.x + dx * k, py = d.y + dy * k, pz = d.z + dz * k, ov = { power: 0.7 - walls * 0.25 };
            const ev2 = this.terrain.bunkerSet ? this.terrain.bunkerSet.damageAt(px, py, pz, d.a, false, fxSys, ov) : null;
            if (ev2 && ev2.hit) { walls++; k += 6; }
          }
          if (fxSys && fxSys.spallCone) fxSys.spallCone(new THREE.Vector3(d.x + dx * 4, d.y + dy * 4, d.z + dz * 4), new THREE.Vector3(dx, dy, dz), 10, {});
        }
      }
      if (envEvents && envEvents.length && this.player && Math.hypot(this.player.x - d.x, this.player.z - d.z) < 1400) {
        for (const ev of envEvents) if (ev.type === 'collapse') this.addCombatLog('[[building]] Một tòa nhà vừa sập đổ hoàn toàn!', 'tip');
        for (const ev of envEvents) if (ev.type === 'bridgeCollapse') this.addCombatLog('[[building-bridge]] Một nhịp cầu vừa gãy sập xuống sông — đường qua sông bị cắt!', 'alert');
      }
    };
    if (typeof Destructibles !== 'undefined' && Destructibles.withSeed) Destructibles.withSeed(d.s >>> 0, run); else run();
    if (fromNet && fxSys && fxSys.syncCrater && (d.t === 'GROUND' || !d.t)) fxSys.syncCrater(d.x, d.y, d.z, d.a, !!d.h, { x: d.dx || 0, y: d.dy || -1, z: d.dz || 0 });
  }

  // Đạn từ máy khác: chỉ chạy hư hại bộ phận (không trừ máu) cho xe trúng trực tiếp & xe trong vùng nổ
  applyVehicleDamageVisuals(shell, hitType, directTarget, unitHit, ammoType, shooter, shooterTeam, fxSys) {
    if (typeof VehicleDamage === 'undefined') return;
    const heavy = !!shell.isHeavyArty;
    const dir = new THREE.Vector3(shell.vx || 0, shell.vy || 0, shell.vz || 0);
    // Xác xe trúng đạn từ máy khác: vẫn móp / bẹp dần giống hệt trên máy bắn
    if (hitType === 'DIRECT_HIT' && directTarget && directTarget.isDead && unitHit) {
      const wr = VehicleDamage.onDirectHit(directTarget, { hit: unitHit, ammo: ammoType, heavy, fx: fxSys, dir });
      this.reportWreckDamage(directTarget, shooter, wr && wr.events);
    }
    // Xe còn sống: chỉ chạy phần HÌNH ẢNH (móp, tia lửa); hư hại bộ phận thật do máy có quyền tính & gửi PARTS
    if (hitType === 'DIRECT_HIT' && directTarget && !directTarget.isDead && !(shooterTeam && directTarget.team === shooterTeam)) {
      VehicleDamage.visualOnly(() => VehicleDamage.onDirectHit(directTarget, { hit: unitHit, ammo: ammoType, heavy, shooter, fx: fxSys, dir }));
      return;
    }
    const R = { HE: heavy ? 135 : 75, CLUSTER: 85, CLUSTER_SUBMUNITION: 32, RPG: 45, ANTI_TANK_MISSILE: 45, AP: 9, INCENDIARY: 16, GATLING_BULLET: 10, SCOUT_BULLET: 10 }[ammoType] || (heavy ? 90 : 55);
    for (const unit of this.units) {
      if (unit.isDead && unit.dmg && unit.group && unit.group.visible && !(hitType === 'DIRECT_HIT' && unit === directTarget)) {
        const dW = Math.hypot(unit.x - shell.x, unit.z - shell.z);
        if (dW <= R) VehicleDamage.onSplash(unit, { x: shell.x, y: shell.y, z: shell.z, ammo: ammoType, heavy, dist: dW, radius: R, fx: fxSys });
        continue;
      }
      if (unit.isDead || (shooterTeam && unit.team === shooterTeam)) continue;
      const dist = Math.hypot(unit.x - shell.x, unit.z - shell.z);
      if (dist > R) continue;
      if (this.terrain && this.terrain.shelterFactor && this.terrain.shelterFactor(unit) <= 0) continue;
      VehicleDamage.visualOnly(() => VehicleDamage.onSplash(unit, { x: shell.x, y: shell.y, z: shell.z, ammo: ammoType, heavy, dist, radius: R, shooter, fx: fxSys }));
    }
  }

  // Các nấc biến dạng của xác xe (hư nặng -> biến dạng cực nặng -> bẹp dúm): báo khi mình bắn hoặc xác nằm gần
  reportWreckDamage(unit, shooter, events) {
    if (!events || !events.length || !this.player) return;
    const near = Math.hypot(unit.x - this.player.x, unit.z - this.player.z) < 700;
    for (const e of events) {
      if (!e.stage) continue;
      if ((shooter && shooter.isPlayer) || near) this.addCombatLog(`[[skull]] ${unit.name}: ${e.text}`, shooter && shooter.isPlayer ? 'tip' : 'info');
    }
  }

  // Thông báo hỏng hóc bộ phận cho người chơi (xe mình bị hỏng / mình bắn hỏng xe địch)
  reportVehicleDamage(unit, shooter, events) {
    if (!events || !events.length) return;
    this._dmgLogAt = this._dmgLogAt || {};
    for (const e of events) {
      if (e.type === 'acc') continue;
      const key = unit.id + e.text;
      const now = performance.now();
      if (this._dmgLogAt[key] && now - this._dmgLogAt[key] < 4000) continue;
      this._dmgLogAt[key] = now;
      if (unit.isPlayer) this.addCombatLog(`[[tool]] XE BẠN: ${e.text}`, 'alert');
      else if (shooter && shooter.isPlayer) this.addCombatLog(`[[crosshair]] ${unit.name}: ${e.text}`, 'tip');
    }
  }

  onUnitDestroyed(victim, killer) {
    const isBlue = victim.team === 'BLUE';
    if (isBlue) {
      this.blueDeaths++;
    } else {
      this.redDeaths++;
    }

    if (killer) {
      if (killer.team === 'BLUE') {
        this.blueKills++;
      } else if (killer.team === 'RED') {
        this.redKills++;
      }
    }

    this.updateTeamScoreUI();
    this.updateAliveCount();

    const teamName = isBlue ? 'PHE XANH' : 'PHE ĐỎ';
    const killerName = killer ? killer.name : 'VÙNG BO CHIẾN ĐỊA';
    const penalty = this.respawnWaitPenalty || 10.0;

    // Cơ chế hồi sinh vô hạn lần - Phạt 10 giây mỗi lần hy sinh
    // Bảng hạ gục: 1 dòng ngắn; xe người chơi liên quan thì nổi bật (đỏ khi mình bị hạ, xanh khi mình hạ địch)
    if (victim.isPlayer) this.addCombatLog(`[[skull]] Bạn bị ${killer ? killer.name : 'vùng bo'} hạ — xuất kích lại sau ${penalty} giây`, 'defeat');
    else if (killer && killer.isPlayer) this.addCombatLog(`[[target-arrow]] Bạn hạ ${victim.name}`, 'victory');
    else this.addCombatLog(`[[skull]] ${killerName} hạ ${victim.name}`, 'feed');

    this.respawnQueue.push({
      unit: victim,
      timer: penalty,
      totalWait: penalty,
      isBlue: isBlue
    });

    // Nếu xe người chơi bị bắn hạ: Bật banner đếm ngược 10 giây phạt hồi sinh
    if (victim.isPlayer) {
      this._playerDeaths = (this._playerDeaths || 0) + 1;   // thống kê cuối trận (tài khoản)
      const respawnBanner = domById('player-respawn-banner');
      const timeValEl = domById('player-respawn-time');
      const barFillEl = domById('player-respawn-bar');
      if (respawnBanner) {
        respawnBanner.classList.remove('hidden');
      }
      if (timeValEl) {
        timeValEl.textContent = `${penalty.toFixed(1)}S`;
      }
      if (barFillEl) {
        barFillEl.style.width = '100%';
      }
    }
  }

  updateRespawnQueue(dt) {
    for (let i = this.respawnQueue.length - 1; i >= 0; i--) {
      const item = this.respawnQueue[i];
      item.timer -= dt;

      // Cập nhật banner đếm ngược trực quan nếu là xe của người chơi
      if (item.unit.isPlayer) {
        const timeValEl = domById('player-respawn-time');
        const barFillEl = domById('player-respawn-bar');
        const remaining = Math.max(0, item.timer);
        if (timeValEl) {
          timeValEl.textContent = `${remaining.toFixed(1)}S`;
        }
        if (barFillEl) {
          const pct = Math.max(0, Math.min(100, (remaining / (item.totalWait || 10.0)) * 100));
          barFillEl.style.width = `${pct}%`;
        }
      }

      if (item.timer <= 0) {
        // Tái xuất kích ở vị trí ngẫu nhiên trên bản đồ (xa xe địch, trong vòng bo an toàn)
        const sp = this.pickRandomSpawn(item.unit.team, Math.random, this.units.filter(u => u !== item.unit && !u.isDead), { nearTeam: true });
        item.unit.respawn(sp.x, sp.z, sp.bodyAngle);
        item.unit.azimuth = ArtilleryGame3D.headingDeg(sp.bodyAngle);

        // Nếu xe người chơi tái xuất: ẩn banner đếm ngược phạt hồi sinh
        if (item.unit.isPlayer) {
          const respawnBanner = domById('player-respawn-banner');
          if (respawnBanner) {
            respawnBanner.classList.add('hidden');
          }
        }

        const teamName = item.isBlue ? 'PHE XANH' : 'PHE ĐỎ';
        if (item.unit.isPlayer) this.addCombatLog('[[refresh]] Đã xuất kích lại — được bảo vệ 3 giây', 'tip');

        this.updateAliveCount();
        this.updateTeamScoreUI();
        this.respawnQueue.splice(i, 1);
      }
    }
  }

  updateAliveCount() {
    const aliveCountEl = domById('alive-count');
    if (aliveCountEl) {
      const count = this.units.filter(u => !u.isDead).length;
      aliveCountEl.textContent = count.toString();
    }
  }


  // ==========================================
  // HỆ THỐNG HIỆU ỨNG VA CHẠM NỔ 3D RIÊNG BIỆT CHO TỪNG LOẠI ĐẠN
  // ==========================================
  createImpactEffects(x, y, z, ammoType = 'NORMAL', hitType = 'GROUND', opts = {}) {
    if (this.effectsManager) {
      return this.effectsManager.createImpactEffects(x, y, z, ammoType, hitType, opts);
    }
    const groundY = this.terrain.getElevationAt(x, z);
    const impactY = Math.max(y, groundY + 0.5);

    // =========================================================================
    // 1. ĐẠN SÚNG MÁY LIÊN THANH (GATLING_BULLET): Nổ vi mô nhỏ gọn, không che khuất
    // =========================================================================
    if (ammoType === 'GATLING_BULLET') {
      const gFireGeo = new THREE.SphereGeometry(3.5, 8, 8);
      const gFireMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.9, depthWrite: false });
      const gFireMesh = new THREE.Mesh(gFireGeo, gFireMat);
      gFireMesh.position.set(x, impactY + 1.2, z);
      this.scene.add(gFireMesh);

      this.explosions3D.push({ mesh: gFireMesh, scale: 1.0, alpha: 0.9, life: 0.18, growSpeed: 6.0 });

      // Vài tia lửa nhỏ bắn tung tóe
      for (let i = 0; i < 5; i++) {
        const spGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
        const spMat = new THREE.MeshBasicMaterial({ color: 0xffdd44, transparent: true, opacity: 0.95, depthWrite: false });
        const spMesh = new THREE.Mesh(spGeo, spMat);
        spMesh.position.set(x, impactY + 1, z);
        this.scene.add(spMesh);

        const ang = Math.random() * Math.PI * 2;
        const spd = 30 + Math.random() * 45;
        this.explosions3D.push({
          type: 'DEBRIS',
          mesh: spMesh,
          groundY: groundY,
          vx: Math.cos(ang) * spd,
          vy: 15 + Math.random() * 25,
          vz: Math.sin(ang) * spd,
          rotSpeedX: 0,
          rotSpeedY: 0,
          life: 0.16 + Math.random() * 0.1,
          alpha: 0.95
        });
      }
      return;
    }

    // =========================================================================
    // 2. ĐẠN XUYÊN PHÁ (AP): NỔ TẬP TRUNG NĂNG LƯỢNG CAO, CHỚP PLASMA XANH CYAN & TIA VONFRAM XÉ GIÓ
    // =========================================================================
    if (ammoType === 'AP') {
      // Chớp sáng Plasma xanh lơ chói lòa
      const apCoreGeo = new THREE.SphereGeometry(18, 12, 12);
      const apCoreMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.98, depthWrite: false });
      const apCoreMesh = new THREE.Mesh(apCoreGeo, apCoreMat);
      apCoreMesh.position.set(x, impactY + 3.5, z);
      this.scene.add(apCoreMesh);

      this.explosions3D.push({ mesh: apCoreMesh, scale: 1.0, alpha: 0.98, life: 0.28, growSpeed: 8.5 });

      // Lõi năng lượng trắng sáng lóa mắt ở tâm
      const apWhiteGeo = new THREE.SphereGeometry(9, 10, 10);
      const apWhiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1.0, depthWrite: false });
      const apWhiteMesh = new THREE.Mesh(apWhiteGeo, apWhiteMat);
      apWhiteMesh.position.set(x, impactY + 3.5, z);
      this.scene.add(apWhiteMesh);
      this.explosions3D.push({ mesh: apWhiteMesh, scale: 1.0, alpha: 1.0, life: 0.16, growSpeed: 10.0 });

      // Sóng xung kích siêu thanh mỏng dẹt màu xanh neon quét cực nhanh
      const apRingGeo = new THREE.RingGeometry(2, 5, 24);
      apRingGeo.rotateX(-Math.PI / 2);
      const apRingMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });
      const apRingMesh = new THREE.Mesh(apRingGeo, apRingMat);
      apRingMesh.position.set(x, groundY + 0.6, z);
      this.scene.add(apRingMesh);

      this.explosions3D.push({ type: 'SHOCKWAVE', mesh: apRingMesh, scale: 1.0, alpha: 0.9, life: 0.32, expandSpeed: 160.0 });

      // Hàng chục tia kim loại Vonfram nóng chảy bắn xé gió với vận tốc cực lớn (200+ m/s)
      for (let i = 0; i < 28; i++) {
        const rayLen = 1.2 + Math.random() * 2.5;
        const pGeo = new THREE.BoxGeometry(0.4, 0.4, rayLen);
        const pMat = new THREE.MeshBasicMaterial({
          color: Math.random() > 0.3 ? 0x00ffff : 0xffffff,
          transparent: true,
          opacity: 1.0,
          depthWrite: false
        });
        const pMesh = new THREE.Mesh(pGeo, pMat);
        pMesh.position.set(x, impactY + 2, z);
        this.scene.add(pMesh);

        const angle = Math.random() * Math.PI * 2;
        const spd = 120 + Math.random() * 140;
        this.explosions3D.push({
          type: 'DEBRIS',
          mesh: pMesh,
          groundY: groundY,
          vx: Math.cos(angle) * spd,
          vy: 20 + Math.random() * 65,
          vz: Math.sin(angle) * spd,
          rotSpeedX: 0,
          rotSpeedY: 0,
          life: 0.45 + Math.random() * 0.25,
          alpha: 1.0
        });
      }

      // Vết nứt sém đất sẫm màu có ánh xanh neon ở giữa
      const scorchGeo = new THREE.RingGeometry(2, 16, 20);
      scorchGeo.rotateX(-Math.PI / 2);
      const scorchMat = new THREE.MeshBasicMaterial({ color: 0x122438, transparent: true, opacity: 0.65, depthWrite: false, side: THREE.DoubleSide });
      const scorchMesh = new THREE.Mesh(scorchGeo, scorchMat);
      scorchMesh.position.set(x, groundY + 0.35, z);
      this.scene.add(scorchMesh);
      this.explosions3D.push({ type: 'SCORCH', mesh: scorchMesh, timer: 0, fadeStart: 6.0, totalLife: 12.0, alpha: 0.65, maxAlpha: 0.65 });
      return;
    }

    // =========================================================================
    // 3. ĐẠN NỔ MẠNH (HE): VỤ NỔ NẤM KHỔNG LỒ RỰC LỬA, KHÓI ĐEN CUỒN CUỘN LAN 120M
    // =========================================================================
    if (ammoType === 'HE') {
      // Quả cầu lửa chính khổng lồ bành trướng cực đại
      const heFireGeo = new THREE.SphereGeometry(46, 16, 16);
      const heFireMat = new THREE.MeshBasicMaterial({ color: 0xff2600, transparent: true, opacity: 0.95, depthWrite: false });
      const heFireMesh = new THREE.Mesh(heFireGeo, heFireMat);
      heFireMesh.position.set(x, impactY + 12, z);
      this.scene.add(heFireMesh);
      this.explosions3D.push({ mesh: heFireMesh, scale: 1.0, alpha: 0.95, life: 0.85, growSpeed: 5.5 });

      // 3 Quả cầu lửa phụ bốc nở lệch tâm tạo hình vòm mây nấm cuồn cuộn
      const subOffsets = [[12, 18, 8], [-14, 22, -10], [6, 26, -14]];
      subOffsets.forEach(([ox, oy, oz]) => {
        const subGeo = new THREE.SphereGeometry(26, 12, 12);
        const subMat = new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.88, depthWrite: false });
        const subMesh = new THREE.Mesh(subGeo, subMat);
        subMesh.position.set(x + ox, impactY + oy, z + oz);
        this.scene.add(subMesh);
        this.explosions3D.push({ mesh: subMesh, scale: 1.0, alpha: 0.88, life: 0.72, growSpeed: 4.8 });
      });

      // 2 Vòng sóng xung kích đất quét bạt sa mạc cực rộng
      [1.0, 1.35].forEach((mult, idx) => {
        const ringGeo = new THREE.RingGeometry(3, 10, 32);
        ringGeo.rotateX(-Math.PI / 2);
        const ringMat = new THREE.MeshBasicMaterial({
          color: idx === 0 ? 0xff4400 : 0xffaa33,
          transparent: true,
          opacity: 0.85,
          depthWrite: false,
          side: THREE.DoubleSide
        });
        const ringMesh = new THREE.Mesh(ringGeo, ringMat);
        ringMesh.position.set(x, groundY + 0.8 + idx * 0.2, z);
        this.scene.add(ringMesh);
        this.explosions3D.push({ type: 'SHOCKWAVE', mesh: ringMesh, scale: 1.0, alpha: 0.85, life: 0.55 * mult, expandSpeed: 210.0 * mult });
      });

      // Vết cháy sém khổng lồ đen thui trên mặt đất
      const scorchGeo = new THREE.RingGeometry(6, 46, 28);
      scorchGeo.rotateX(-Math.PI / 2);
      const scorchMat = new THREE.MeshBasicMaterial({ color: 0x1f140d, transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide });
      const scorchMesh = new THREE.Mesh(scorchGeo, scorchMat);
      scorchMesh.position.set(x, groundY + 0.35, z);
      this.scene.add(scorchMesh);
      this.explosions3D.push({ type: 'SCORCH', mesh: scorchMesh, timer: 0, fadeStart: 10.0, totalLife: 20.0, alpha: 0.75, maxAlpha: 0.75 });

      // Cột khói đen than kịt 22 đám cuộn bốc lên cao
      const darkSmokes = [0x1a1614, 0x2d241e, 0x42352b, 0x120f0e];
      for (let i = 0; i < 22; i++) {
        const sRadius = 7.0 + Math.random() * 8.0;
        const sGeo = new THREE.SphereGeometry(sRadius, 7, 7);
        const sMat = new THREE.MeshBasicMaterial({
          color: darkSmokes[Math.floor(Math.random() * darkSmokes.length)],
          transparent: true,
          opacity: 0.8,
          depthWrite: false
        });
        const sMesh = new THREE.Mesh(sGeo, sMat);
        sMesh.position.set(x + (Math.random() - 0.5) * 22, impactY + 4 + Math.random() * 12, z + (Math.random() - 0.5) * 22);
        this.scene.add(sMesh);

        this.explosions3D.push({
          type: 'SMOKE',
          mesh: sMesh,
          vx: (Math.random() - 0.5) * 16,
          vy: 24 + Math.random() * 38,
          vz: (Math.random() - 0.5) * 16,
          scale: 1.0,
          growSpeed: 2.4 + Math.random() * 2.2,
          alpha: 0.8,
          life: 2.6 + Math.random() * 1.4
        });
      }

      // Hàng chục mảnh đất đá và tàn lửa đỏ rực bắn tung tóe lên trời
      for (let i = 0; i < 35; i++) {
        const size = 1.4 + Math.random() * 2.8;
        const dGeo = new THREE.BoxGeometry(size, size, size);
        const isFireDebris = Math.random() > 0.4;
        const dMat = new THREE.MeshLambertMaterial({
          color: isFireDebris ? 0xff4400 : 0x3d2716,
          transparent: true,
          opacity: 0.95
        });
        const dMesh = new THREE.Mesh(dGeo, dMat);
        dMesh.position.set(x, impactY + 3, z);
        this.scene.add(dMesh);

        const angle = Math.random() * Math.PI * 2;
        const spd = 45 + Math.random() * 110;
        this.explosions3D.push({
          type: 'DEBRIS',
          mesh: dMesh,
          groundY: groundY,
          vx: Math.cos(angle) * spd,
          vy: 65 + Math.random() * 120,
          vz: Math.sin(angle) * spd,
          rotSpeedX: (Math.random() - 0.5) * 16,
          rotSpeedY: (Math.random() - 0.5) * 16,
          life: 2.4 + Math.random() * 1.0,
          alpha: 0.95
        });
      }
      return;
    }

    // =========================================================================
    // 4. ĐẠN CHỐNG TĂNG (ANTI_TANK_MISSILE): NỔ NẠP LÕM XUYÊN GIÁP, LUỒNG LỬA NHIỆT PHỤT MẠNH
    // =========================================================================
    if (ammoType === 'ANTI_TANK_MISSILE') {
      const atCoreGeo = new THREE.SphereGeometry(24, 12, 12);
      const atCoreMat = new THREE.MeshBasicMaterial({ color: 0xff5500, transparent: true, opacity: 0.95, depthWrite: false });
      const atCoreMesh = new THREE.Mesh(atCoreGeo, atCoreMat);
      atCoreMesh.position.set(x, impactY + 4, z);
      this.scene.add(atCoreMesh);
      this.explosions3D.push({ mesh: atCoreMesh, scale: 1.0, alpha: 0.95, life: 0.42, growSpeed: 6.5 });

      // Luồng lửa nạp lõm phụt thẳng lên cao
      const jetGeo = new THREE.CylinderGeometry(1.5, 6.5, 28, 8);
      const jetMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.9, depthWrite: false });
      const jetMesh = new THREE.Mesh(jetGeo, jetMat);
      jetMesh.position.set(x, impactY + 14, z);
      this.scene.add(jetMesh);
      this.explosions3D.push({ mesh: jetMesh, scale: 1.0, alpha: 0.9, life: 0.28, growSpeed: 4.0 });

      // Sóng nón xung kích
      const atRingGeo = new THREE.RingGeometry(2, 8, 24);
      atRingGeo.rotateX(-Math.PI / 2);
      const atRingMat = new THREE.MeshBasicMaterial({ color: 0xff7722, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
      const atRingMesh = new THREE.Mesh(atRingGeo, atRingMat);
      atRingMesh.position.set(x, groundY + 0.6, z);
      this.scene.add(atRingMesh);
      this.explosions3D.push({ type: 'SHOCKWAVE', mesh: atRingMesh, scale: 1.0, alpha: 0.85, life: 0.38, expandSpeed: 140.0 });

      // Mảnh vỡ kim loại phản lực bắn tóe
      for (let i = 0; i < 20; i++) {
        const pGeo = new THREE.BoxGeometry(0.9, 0.9, 0.9);
        const pMat = new THREE.MeshBasicMaterial({ color: Math.random() > 0.3 ? 0xffcc00 : 0xff3b00, transparent: true, opacity: 1.0, depthWrite: false });
        const pMesh = new THREE.Mesh(pGeo, pMat);
        pMesh.position.set(x, impactY + 2, z);
        this.scene.add(pMesh);

        const angle = Math.random() * Math.PI * 2;
        const spd = 70 + Math.random() * 95;
        this.explosions3D.push({
          type: 'DEBRIS',
          mesh: pMesh,
          groundY: groundY,
          vx: Math.cos(angle) * spd,
          vy: 40 + Math.random() * 75,
          vz: Math.sin(angle) * spd,
          rotSpeedX: 0,
          rotSpeedY: 0,
          life: 0.5 + Math.random() * 0.3,
          alpha: 1.0
        });
      }
      return;
    }

    // =========================================================================
    // 5. ĐẠN THƯỜNG TIÊU CHUẨN (NORMAL): VỤ NỔ 155MM ĐẤT CÁT SA MẠC CÂN BẰNG
    // =========================================================================
    const fireGeo = new THREE.SphereGeometry(24, 12, 12);
    const fireMat = new THREE.MeshBasicMaterial({ color: 0xff9900, transparent: true, opacity: 0.95, depthWrite: false });
    const fireMesh = new THREE.Mesh(fireGeo, fireMat);
    fireMesh.position.set(x, impactY + 4, z);
    this.scene.add(fireMesh);
    this.explosions3D.push({ mesh: fireMesh, scale: 1.0, alpha: 0.95, life: 0.45, growSpeed: 4.5 });

    // Vòng sóng xung kích bụi cát quét rạt mặt đất
    const ringGeo = new THREE.RingGeometry(2, 6, 28);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xeed2a2, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.position.set(x, groundY + 0.8, z);
    this.scene.add(ringMesh);
    this.explosions3D.push({ type: 'SHOCKWAVE', mesh: ringMesh, scale: 1.0, alpha: 0.8, life: 0.45, expandSpeed: 110.0 });

    // Vết sém đất cát
    const scorchGeo = new THREE.RingGeometry(3, 24, 24);
    scorchGeo.rotateX(-Math.PI / 2);
    const scorchMat = new THREE.MeshBasicMaterial({ color: 0x3d2716, transparent: true, opacity: 0.48, depthWrite: false, side: THREE.DoubleSide });
    const scorchMesh = new THREE.Mesh(scorchGeo, scorchMat);
    scorchMesh.position.set(x, groundY + 0.35, z);
    this.scene.add(scorchMesh);
    this.explosions3D.push({ type: 'SCORCH', mesh: scorchMesh, timer: 0, fadeStart: 8.0, totalLife: 15.0, alpha: 0.48, maxAlpha: 0.48 });

    // Cột đất cát văng tung tóe
    const dirtColors = [0x4a3219, 0x6e4a25, 0x9c7442, 0xd4a559, 0x321e0e];
    for (let i = 0; i < 18; i++) {
      const size = 1.0 + Math.random() * 2.2;
      const dGeo = new THREE.BoxGeometry(size, size, size);
      const dMat = new THREE.MeshLambertMaterial({
        color: dirtColors[Math.floor(Math.random() * dirtColors.length)],
        transparent: true,
        opacity: 0.95
      });
      const dMesh = new THREE.Mesh(dGeo, dMat);
      dMesh.position.set(x + (Math.random() - 0.5) * 6, impactY + 1.5, z + (Math.random() - 0.5) * 6);
      this.scene.add(dMesh);

      const angle = Math.random() * Math.PI * 2;
      const horizSpeed = 18 + Math.random() * 60;
      this.explosions3D.push({
        type: 'DEBRIS',
        mesh: dMesh,
        groundY: groundY,
        vx: Math.cos(angle) * horizSpeed,
        vy: 45 + Math.random() * 80,
        vz: Math.sin(angle) * horizSpeed,
        rotSpeedX: (Math.random() - 0.5) * 12,
        rotSpeedY: (Math.random() - 0.5) * 12,
        life: 1.8 + Math.random() * 0.8,
        alpha: 0.95
      });
    }

    // Khói bụi sa mạc bốc lên
    for (let i = 0; i < 8; i++) {
      const sRadius = 4.0 + Math.random() * 4.5;
      const sGeo = new THREE.SphereGeometry(sRadius, 7, 7);
      const sMat = new THREE.MeshBasicMaterial({ color: 0x8f7d67, transparent: true, opacity: 0.65, depthWrite: false });
      const sMesh = new THREE.Mesh(sGeo, sMat);
      sMesh.position.set(x + (Math.random() - 0.5) * 10, impactY + 2 + Math.random() * 6, z + (Math.random() - 0.5) * 10);
      this.scene.add(sMesh);

      this.explosions3D.push({
        type: 'SMOKE',
        mesh: sMesh,
        vx: (Math.random() - 0.5) * 8,
        vy: 16 + Math.random() * 22,
        vz: (Math.random() - 0.5) * 8,
        scale: 1.0,
        growSpeed: 1.8 + Math.random() * 1.5,
        alpha: 0.65,
        life: 1.8 + Math.random() * 0.9
      });
    }
  }

  // ==========================================
  // HỆ THỐNG HÒM TIẾP TẾ HỎA LỰC THẢ DÙ CHIẾN THUẬT (TACTICAL AIRDROP)
  // ==========================================
  spawnAirdrop() {
    if (this.supplyManager) {
      return this.supplyManager.spawnAirdrop();
    }
    if (this.airdrop) {
      if (this.airdrop.mesh) this.scene.remove(this.airdrop.mesh);
      this.airdrop = null;
    }

    const zoneCenterX = this.zone.current.x - this.worldWidth / 2;
    const zoneCenterZ = this.zone.current.y - this.worldDepth / 2;

    const r = Math.random() * (this.zone.current.radius * 0.65);
    const angle = Math.random() * Math.PI * 2;
    const dropX = zoneCenterX + Math.cos(angle) * r;
    const dropZ = zoneCenterZ + Math.sin(angle) * r;
    const groundY = this.terrain.getElevationAt(dropX, dropZ);

    const airdropGroup = new THREE.Group();

    // 1. Khối thùng hàng quân sự
    const crateGeo = new THREE.BoxGeometry(22, 18, 22);
    const crateMat = new THREE.MeshLambertMaterial({ color: 0x2e6b3c });
    const crateMesh = new THREE.Mesh(crateGeo, crateMat);
    crateMesh.castShadow = true;
    airdropGroup.add(crateMesh);

    const stripeGeo = new THREE.BoxGeometry(22.4, 4, 22.4);
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0xffcc00 });
    const stripeMesh = new THREE.Mesh(stripeGeo, stripeMat);
    airdropGroup.add(stripeMesh);

    // 2. Chiếc dù quân sự
    const parachuteGroup = new THREE.Group();
    parachuteGroup.position.y = 35;

    const canopyGeo = new THREE.ConeGeometry(26, 20, 16, 1, true);
    canopyGeo.rotateX(Math.PI);
    const canopyMat = new THREE.MeshBasicMaterial({ color: 0xfffae6, side: THREE.DoubleSide });
    const canopyMesh = new THREE.Mesh(canopyGeo, canopyMat);
    parachuteGroup.add(canopyMesh);

    const lineMat = new THREE.LineBasicMaterial({ color: 0x888888 });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const lineGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, -25, 0),
        new THREE.Vector3(Math.cos(a) * 24, 0, Math.sin(a) * 24)
      ]);
      const line = new THREE.Line(lineGeo, lineMat);
      parachuteGroup.add(line);
    }
    airdropGroup.add(parachuteGroup);

    // 3. Cột sáng phát quang định vị từ xa
    const beaconGeo = new THREE.CylinderGeometry(2, 2, 450, 12);
    const beaconMat = new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      transparent: true,
      opacity: 0.35,
      depthWrite: false
    });
    const beaconMesh = new THREE.Mesh(beaconGeo, beaconMat);
    beaconMesh.position.y = 225;
    airdropGroup.add(beaconMesh);

    airdropGroup.position.set(dropX, groundY + 650, dropZ);
    this.scene.add(airdropGroup);

    this.airdrop = {
      mesh: airdropGroup,
      parachuteGroup: parachuteGroup,
      beaconMesh: beaconMesh,
      x: dropX,
      z: dropZ,
      y: groundY + 650,
      groundY: groundY,
      landed: false,
      collected: false,
      smokeTimer: 0
    };

    if (window.soundEngine) {
      window.soundEngine.playRadioChirp();
    }
    this.addCombatLog('[[package]] MÁY BAY ĐANG THẢ DÙ HÒM TIẾP TẾ HỎA LỰC! HÃY TRANH ĐOẠT NGAY!', 'tip');
  }

  updateAirdrop(dt) {
    if (this.supplyManager) {
      return this.supplyManager.updateAirdrop(dt, this.units);
    }
    if (!this.airdrop) {
      this.airdropTimer -= dt;
      if (this.airdropTimer <= 0) {
        this.spawnAirdrop();
        this.airdropTimer = 60;
      }
      return;
    }

    const drop = this.airdrop;
    if (drop.collected) return;

    if (!drop.landed) {
      drop.y -= 75 * dt;
      drop.mesh.position.y = drop.y;

      if (drop.y <= drop.groundY + 9) {
        drop.y = drop.groundY + 9;
        drop.mesh.position.y = drop.y;
        drop.landed = true;
        drop.mesh.remove(drop.parachuteGroup);
        if (drop.beaconMesh) drop.beaconMesh.material.color.setHex(0xffaa00);
        this.addCombatLog('[[package]] HÒM TIẾP TẾ ĐÃ TIẾP ĐẤT! TRANH ĐOẠT HỎA LỰC NGAY!', 'tip');
      }
    } else {
      // Đã tiếp đất: Tỏa khói tín hiệu cam
      drop.smokeTimer += dt;
      if (drop.smokeTimer > 0.18) {
        drop.smokeTimer = 0;
        this.spawnAirdropSmoke(drop.x, drop.groundY + 9, drop.z);
      }

      // Kiểm tra xe nào nhặt được hòm
      for (const unit of this.units) {
        if (!unit.isDead) {
          const dist = Math.hypot(unit.x - drop.x, unit.z - drop.z);
          if (dist < 32) {
            drop.collected = true;
            this.scene.remove(drop.mesh);

            // Ngẫu nhiên 1 trong 5 loại quà:
            // 0: Đạn Xuyên Phá (AP), 1: Đạn Nổ Mạnh (HE), 2: Giáp Phản Ứng Nổ, 3: Nâng cấp tăng máu 1 đơn vị, 4: Động cơ tăng áp tốc độ
            let lootRoll = Math.floor(Math.random() * 5);
            // Đạn xuyên giáp (lõi urani nghèo) chỉ xe tăng dùng được -> xe khác nhận đạn nổ mạnh
            if (lootRoll === 0 && unit.tankType !== 'ALL_ROUNDER') lootRoll = 1;
            let lootMsg = '';

            if (lootRoll === 0) {
              unit.apAmmoCount = (unit.apAmmoCount || 0) + 2;
              if (unit.isPlayer) unit.selectedAmmo = 'AP';
              lootMsg = '2 VIÊN ĐẠN XUYÊN PHÁ (BẮN PHÁT CHẾT LUÔN)!';
            } else if (lootRoll === 1) {
              unit.heAmmoCount = (unit.heAmmoCount || 0) + 2;
              if (unit.isPlayer) unit.selectedAmmo = 'HE';
              lootMsg = '2 VIÊN ĐẠN NỔ MẠNH (BÁN KÍNH NỔ 120M)!';
            } else if (lootRoll === 2) {
              unit.hasReactiveArmor = true;
              lootMsg = 'GIÁP PHẢN ỨNG NỔ (PHÁ HỦY 1 PHÁT RPG / ĐẠN PHÁO TRÚNG THẲNG)!';
            } else if (lootRoll === 3) {
              unit.maxHp += 1;
              unit.hp = unit.maxHp;
              lootMsg = `HỘP SINH LỰC CHIẾN ĐẤU (TĂNG THANH MÁU LÊN ${unit.maxHp} VÀ HỒI ĐẦY MÁU)!`;
            } else {
              unit.speedBoostTimer = 20.0; // Tăng tốc độ di chuyển cực bốc trong 20 giây
              lootMsg = 'ĐỘNG CƠ TĂNG ÁP TỐC ĐỘ (+65% TỐC ĐỘ DI CHUYỂN TRONG 20S)!';
            }

            if (unit.isPlayer) {
              this.addCombatLog(`[[gift]] BẠN ĐÃ CHIẾM ĐƯỢC HÒM TIẾP TẾ: +${lootMsg}`, 'tip');
              if (window.soundEngine) (window.soundEngine.playSupplyPickup || window.soundEngine.playReloadDone).call(window.soundEngine);
              this.updateAmmoUI();
            } else if ((typeof TeamIntel === 'undefined' || !this.player || unit.team === this.player.team || TeamIntel.knows(this.player, unit))) {
              this.addCombatLog(`[[alert-triangle]] ${unit.name} ĐÃ CHIẾM ĐƯỢC HÒM TIẾP TẾ: +${lootMsg}`, 'alert');
            }

            this.airdrop = null;
            this.airdropTimer = 22; // 22 giây sau tiếp tục thả thùng mới
            break;
          }
        }
      }
    }
  }

  spawnAirdropSmoke(x, y, z) {
    const sGeo = new THREE.SphereGeometry(3.5 + Math.random() * 2, 6, 6);
    const sMat = new THREE.MeshBasicMaterial({
      color: 0xff6600,
      transparent: true,
      opacity: 0.7,
      depthWrite: false
    });
    const sMesh = new THREE.Mesh(sGeo, sMat);
    sMesh.position.set(x + (Math.random() - 0.5) * 4, y, z + (Math.random() - 0.5) * 4);
    this.scene.add(sMesh);

    this.explosions3D.push({
      mesh: sMesh,
      scale: 1.0,
      alpha: 0.7,
      life: 1.5,
      vy: 12 + Math.random() * 6
    });
  }

  // =========================================================================
  // HỆ THỐNG CÁC HÒM TIẾP TẾ RẢI RÁC TRÊN BẢN ĐỒ CHIẾN TRƯỜNG
  // =========================================================================
  initSupplyCrates() {
    if (this.supplyManager) {
      return this.supplyManager.initSupplyCrates();
    }
    if (this.supplyCrates && this.supplyCrates.length > 0) {
      this.supplyCrates.forEach(c => {
        if (c.mesh) this.scene.remove(c.mesh);
      });
    }
    this.supplyCrates = [];

    // Danh sách 11 vị trí rải rác chiến lược (bố cục gốc cho bản đồ 3600, giãn theo kích thước bản đồ)
    const K = this.worldWidth / 3600;
    const crateLocations = [
      { x: 0, z: 0, type: 'ALL', name: 'TRUNG TÂM CHIẾN ĐỊA' },
      { x: -360, z: 520, type: 'REPAIR', name: 'CÔNG SỰ TÂY PHE XANH' },
      { x: 360, z: 520, type: 'AMMO', name: 'CÔNG SỰ ĐÔNG PHE XANH' },
      { x: -360, z: -520, type: 'AMMO', name: 'CÔNG SỰ TÂY PHE ĐỎ' },
      { x: 360, z: -520, type: 'REPAIR', name: 'CÔNG SỰ ĐÔNG PHE ĐỎ' },
      { x: -950, z: -400, type: 'SPEED', name: 'THUNG LŨNG TÂY BẮC' },
      { x: 950, z: -400, type: 'AMMO', name: 'THUNG LŨNG ĐÔNG BẮC' },
      { x: -950, z: 400, type: 'REPAIR', name: 'THUNG LŨNG TÂY NAM' },
      { x: 950, z: 400, type: 'SPEED', name: 'THUNG LŨNG ĐÔNG NAM' },
      { x: -650, z: 0, type: 'ALL', name: 'ĐÈO CÁT PHÍA TÂY' },
      { x: 650, z: 0, type: 'ALL', name: 'ĐÈO CÁT PHÍA ĐÔNG' }
    ];

    crateLocations.forEach((loc0, idx) => {
      const loc = Object.assign({}, loc0, { x: loc0.x * K, z: loc0.z * K });
      const groundY = this.terrain.getElevationAt(loc.x, loc.z);
      const crateMesh = this.createSupplyCrateMesh(loc.type);
      crateMesh.position.set(loc.x, groundY + 7, loc.z);
      this.scene.add(crateMesh);

      this.supplyCrates.push({
        id: `crate_${idx}`,
        x: loc.x,
        z: loc.z,
        baseY: groundY + 7,
        type: loc.type,
        name: loc.name,
        active: true,
        respawnTimer: 0,
        mesh: crateMesh
      });
    });
  }

  createSupplyCrateMesh(type = 'ALL') {
    const group = new THREE.Group();

    const crateW = 18;
    const crateH = 14;
    const crateD = 18;

    let bodyColor = 0x1e3a1e;
    let glowColor = 0x00ff9d;
    let stripeColor = 0x00e5ff;
    if (type === 'AMMO') {
      bodyColor = 0x3d2806;
      glowColor = 0xf59e0b;
      stripeColor = 0xfbbf24;
    } else if (type === 'REPAIR') {
      bodyColor = 0x1e293b;
      glowColor = 0x10b981;
      stripeColor = 0x34d399;
    } else if (type === 'SPEED') {
      bodyColor = 0x1e1e38;
      glowColor = 0x00e5ff;
      stripeColor = 0x38bdf8;
    } else {
      bodyColor = 0x3b1c1c;
      glowColor = 0xffd700;
      stripeColor = 0xfacc15;
    }

    const crateGeo = new THREE.BoxGeometry(crateW, crateH, crateD);
    const crateMat = new THREE.MeshLambertMaterial({ color: bodyColor });
    const crateMesh = new THREE.Mesh(crateGeo, crateMat);
    crateMesh.castShadow = true;
    group.add(crateMesh);

    const edgeGeo = new THREE.BoxGeometry(crateW + 0.6, 2.5, crateD + 0.6);
    const edgeMat = new THREE.MeshBasicMaterial({ color: stripeColor });
    const edgeMesh = new THREE.Mesh(edgeGeo, edgeMat);
    group.add(edgeMesh);

    const crossMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    const cross1Geo = new THREE.PlaneGeometry(8, 2.2);
    cross1Geo.rotateX(-Math.PI / 2);
    const cross1 = new THREE.Mesh(cross1Geo, crossMat);
    cross1.position.y = crateH / 2 + 0.1;
    group.add(cross1);

    const cross2Geo = new THREE.PlaneGeometry(2.2, 8);
    cross2Geo.rotateX(-Math.PI / 2);
    const cross2 = new THREE.Mesh(cross2Geo, crossMat);
    cross2.position.y = crateH / 2 + 0.1;
    group.add(cross2);

    const beamGeo = new THREE.CylinderGeometry(5, 9, 65, 12, 1, true);
    beamGeo.translate(0, 32.5, 0);
    const beamMat = new THREE.MeshBasicMaterial({
      color: glowColor,
      transparent: true,
      opacity: 0.32,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const beamMesh = new THREE.Mesh(beamGeo, beamMat);
    group.add(beamMesh);

    const haloGeo = new THREE.RingGeometry(11, 14, 16);
    haloGeo.rotateX(-Math.PI / 2);
    const haloMat = new THREE.MeshBasicMaterial({
      color: glowColor,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const haloMesh = new THREE.Mesh(haloGeo, haloMat);
    haloMesh.position.y = -crateH / 2 + 0.2;
    group.add(haloMesh);

    return group;
  }

  updateSupplyCrates(dt) {
    if (this.supplyManager) {
      return this.supplyManager.updateSupplyCrates(dt, this.units);
    }
    if (!this.supplyCrates || this.supplyCrates.length === 0) return;

    for (const crate of this.supplyCrates) {
      if (crate.active) {
        crate.mesh.rotation.y += dt * 1.0;
        crate.mesh.position.y = crate.baseY + Math.sin(Date.now() * 0.003 + crate.x) * 1.5;

        for (const unit of this.units) {
          if (!unit.isDead) {
            const dist = Math.hypot(unit.x - crate.x, unit.z - crate.z);
            if (dist < 28) {
              crate.active = false;
              crate.mesh.visible = false;
              crate.respawnTimer = 35.0;

              let rewardMsg = '';
              if (crate.type === 'REPAIR') {
                unit.hp = unit.maxHp;
                unit.hasReactiveArmor = true;
                rewardMsg = 'HỒI ĐẦY 100% MÁU & TRANG BỊ GIÁP PHẢN ỨNG NỔ!';
              } else if (crate.type === 'AMMO' || crate.type === 'ALL') {
                if (crate.type === 'ALL') {
                  unit.hp = unit.maxHp;
                  unit.hasReactiveArmor = true;
                }
                if (unit.tankType === 'ARTILLERY') {
                  unit.heAmmoCount = (unit.heAmmoCount || 0) + 3;
                  unit.clusterAmmoCount = (unit.clusterAmmoCount || 0) + 2;
                  unit.apAmmoCount = (unit.apAmmoCount || 0) + 2;
                  rewardMsg = 'NẠP ĐẦY ĐẠN NỔ MẠNH, ĐẠN CHÙM VÀ ĐẠN XUYÊN PHÁ!';
                } else if (unit.tankType === 'GATLING') {
                  unit.incendiaryAmmoCount = (unit.incendiaryAmmoCount || 0) + 60;
                  rewardMsg = '+60 VIÊN ĐẠN CHÁY NÂNG CAO!';
                } else if (unit.tankType === 'SCOUT') {
                  unit.incendiaryAmmoCount = (unit.incendiaryAmmoCount || 0) + 40;
                  unit.missileAmmoCount = (unit.missileAmmoCount || 0) + 3;
                  rewardMsg = '+40 ĐẠN CHÁY VÀ +3 TÊN LỬA CHỐNG TĂNG!';
                } else {
                  unit.apAmmoCount = (unit.apAmmoCount || 0) + 2;
                  unit.heAmmoCount = (unit.heAmmoCount || 0) + 2;
                  rewardMsg = '+2 ĐẠN XUYÊN PHÁ VÀ +2 ĐẠN NỔ PHÁ!';
                }
              } else if (crate.type === 'SPEED') {
                unit.speedBoostTimer = 20.0;
                rewardMsg = 'TĂNG TỐC ĐỘ DI CHUYỂN +65% TRONG 20S!';
              }

              if (unit.isPlayer) {
                this.addCombatLog(`[[gift]] BẠN ĐÃ CHIẾM HÒM TIẾP TẾ [${crate.name}]: +${rewardMsg}`, 'tip');
                if (window.soundEngine) (window.soundEngine.playSupplyPickup || window.soundEngine.playReloadDone).call(window.soundEngine);
                this.updateAmmoUI();
              } else if ((typeof TeamIntel === 'undefined' || !this.player || unit.team === this.player.team || TeamIntel.knows(this.player, unit))) {
                this.addCombatLog(`[[alert-triangle]] ${unit.name} đã nhặt hòm tiếp tế tại [${crate.name}]`, 'alert');
              }
              break;
            }
          }
        }
      } else {
        crate.respawnTimer -= dt;
        if (crate.respawnTimer <= 0) {
          crate.active = true;
          crate.mesh.visible = true;
          this.addCombatLog(`[[package]] Hòm tiếp tế tại [${crate.name}] đã xuất hiện trở lại!`, 'system');
        }
      }
    }
  }

  // =========================================================================
  // CAMERA BÁM ĐUÔI GÓC THẤP — kiểu camera game đua xe nhưng đặt cao hơn một chút
  // · đứng sau xe theo hướng thân xe; đang khóa xe địch thì theo hướng nòng (luôn thấy mục tiêu đang bắn)
  // · con lăn chuột: gần / xa; kéo ra xa camera nâng dần thành góc nhìn trên cao như kiểu cũ
  // · V: chuyển nhanh bám đuôi <-> nhìn cao (pháo tầm xa xem điểm rơi); giữ chuột giữa + kéo: nhìn quanh
  // · không chui vào đồi / nhà: nâng góc camera, vẫn bị che thì kéo lại gần xe; tán cây chắn tầm nhìn tạm ẩn
  // =========================================================================
  camZoomParams(z) {
    const u = Math.max(0, Math.min(1, (z - 1.05) / 1.95)), t = u * u * (3 - 2 * u);   // 0 = bám đuôi … 1 = nhìn từ trên cao
    const phiDeg = z < 1 ? 23 - (1 - z) * 16 : 23 + 33 * t;                            // góc nâng camera nhìn xuống xe
    return { t, phi: phiDeg * Math.PI / 180, R: 235 * z, ahead: 130 * Math.min(1.25, z) * (1 - t) + 40 * t, up: 18 * (1 - t) + 8 * t };
  }
  camDefaultZoom(P) { return P && P.tankType === 'SCOUT' ? 1.05 : 1; }
  // Hệ số khoảng cách camera theo xe: pháo tự hành bắn xa -> camera lùi xa hơn ~1,5 lần ở mọi mức zoom (thấy vùng rộng hơn)
  camDistK(P) { return P && P.tankType === 'ARTILLERY' ? 1.5 : 1; }

  toggleHighView() {
    const C = this._cam;
    if (!C || !this.player) return;
    if (C.zoomT >= 2.1) {
      C.zoomT = C.chaseZoom || this.camDefaultZoom(this.player);
      this.addCombatLog('[[video]] Góc nhìn bám đuôi', 'tip');
    } else {
      C.chaseZoom = C.zoomT;
      C.zoomT = this.player.tankType === 'ARTILLERY' ? 3.3 : 2.6;
      this.addCombatLog('[[eye]] Góc nhìn cao — bấm V để về bám đuôi, M mở bản đồ để ngắm thật xa', 'tip');
    }
  }

  // Đỉnh vật cản dưới điểm (x, z): mặt đất + mái nhà còn đứng (camera không được chui vào)
  camObstacleTop(x, z, near) {
    let h = this.terrain ? this.terrain.getElevationAt(x, z) : 0;
    if (near && near.length) {
      const bs = this.terrain.buildingSet;
      for (const B of near) {
        const L = bs.toLocal(B, x, 0, z);
        if (Math.abs(L.x) < B.halfW + 5 && Math.abs(L.z) < B.halfD + 5) h = Math.max(h, B.y - 1.5 + B.topY + (B.FH || 25) * 0.6);
      }
    }
    return h;
  }

  // DRONE TRINH SÁT của pháo tự hành (màn hình điều khiển hỏa lực): vật thể thật — đậu trên nóc cabin, cất cánh, bay,
  // pin giới hạn thời gian bay, tự bay về đáp để sạc
  droneState() {
    const P = this.player;
    let D = this._drone;
    if (!D || D.unit !== P) {
      if (D && D.model && D.model.parent) D.model.parent.remove(D.model);
      D = this._drone = { unit: P, batt: 1, hp: 1, state: 'docked', x: P ? P.x : 0, y: P ? (P.y || 0) : 0, z: P ? P.z : 0, yaw: P ? (P.bodyAngle || 0) : 0, vx: 0, vy: 0, vz: 0, wvx: 0, wvy: 0, wvz: 0, warned: 0, model: null };
    }
    return D;
  }

  // Bãi đáp trên nóc cabin xe pháo (tọa độ thế giới) + hướng mũi xe
  dronePadWorld() {
    const P = this.player, ch = P && P.chassisGroup;
    const v = this._padV || (this._padV = new THREE.Vector3());
    if (ch && typeof ReconDrone !== 'undefined') {
      ch.updateWorldMatrix(true, false);
      v.set(ReconDrone.PAD.x, ReconDrone.PAD.y, ReconDrone.PAD.z);
      ch.localToWorld(v);
      return { x: v.x, y: v.y, z: v.z };
    }
    return { x: P.x, y: (P.y || 0) + 24, z: P.z };
  }

  // Bấm C với xe pháo: drone cất cánh từ nóc cabin (nhìn từ camera sau xe ~1 giây) rồi chuyển sang hình từ drone
  launchDrone() {
    const P = this.player, C = ArtilleryGame3D.DRONE, D = this.droneState();
    if (D.state === 'launching') return;
    if (D.state === 'lost') {
      this.addCombatLog('[[alert-triangle]] Drone trinh sát đã bị bắn hạ — hồi sinh để nhận drone mới', 'alert');
      return;
    }
    if (D.batt < C.minLaunch) {
      const need = Math.ceil((C.minLaunch - D.batt) * C.charge);
      this.addCombatLog(`[[battery]] Drone trinh sát đang sạc ${Math.round(D.batt * 100)}% — cần ${Math.round(C.minLaunch * 100)}% để cất cánh (còn ~${need} giây)`, 'alert');
      return;
    }
    if (D.state !== 'docked') { this.setSightMode(true); return; }   // đang bay về: mở hình ngay, bay tiếp
    const pd = this.dronePadWorld();
    D.state = 'launching'; D.launchT = 0;
    D.x = pd.x; D.y = pd.y; D.z = pd.z; D.yaw = P.bodyAngle || 0; D.vx = D.vz = D.vy = 0;
    this.addCombatLog('[[drone]] Drone trinh sát cất cánh', 'tip');
  }

  /**
   * Mỗi khung hình (xe pháo): pin (bay nhanh tốn hơn; còn vừa đủ pin bay về + dự phòng thì tự bay về), pha cất cánh,
   * drone tự bay về khi đã đóng màn hình (vẫn tốn pin, thấy drone bay trên chiến trường), đậu trên xe thì sạc;
   * cập nhật mô hình 3D drone (cánh quạt, vị trí).
   */
  updateDroneBattery(dt) {
    const P = this.player;
    if (!P || P.tankType !== 'ARTILLERY' || !(dt > 0)) return;
    const C = ArtilleryGame3D.DRONE, D = this.droneState(), SE = window.soundEngine;
    const S = this._sight && this._sight.arty ? this._sight : null;
    // mô hình 3D drone
    if (!D.model && typeof ReconDrone !== 'undefined') { D.model = ReconDrone.build(P.team); this.scene.add(D.model); }
    const M = D.model;
    if (M && M.parent !== this.scene) this.scene.add(M);
    if (P.isDead) {
      // xe bị hạ: drone đang bay mất liên lạc, rơi; hồi sinh nhận drone mới (đầy pin)
      if (this.destroyOwnDrone && D.state !== 'docked' && D.state !== 'lost') this.destroyOwnDrone(null, 'link');
      D.respawnNew = true;
      if (M) M.visible = false;
      return;
    }
    if (D.respawnNew) {
      D.respawnNew = false;
      if (D.state === 'lost') this.addCombatLog('[[drone]] Drone trinh sát mới đã sẵn sàng trên nóc cabin (C)', 'tip');
      D.state = 'docked'; D.batt = 1; D.hp = 1; D.warned = 0; D.vx = D.vy = D.vz = 0;
    }
    if (D.state === 'lost') {
      // bị bắn hạ: không còn drone trên nóc cabin (màn hình drone đang mở thì đang chiếu cảnh rơi / mất tín hiệu)
      if (M) M.visible = false;
      return;
    }
    const pd = this.dronePadWorld();
    if (S) {
      if (S.landed) {
        // đã đáp xuống xe: tắt màn hình, bắt đầu sạc
        D.state = 'docked';
        this.setSightMode(false);
        this.addCombatLog('[[battery]] Drone đã đáp về xe — đang sạc pin', 'tip');
        return;
      }
      D.state = 'flying';
      const sp = Math.hypot(D.vx, D.vz);
      D.batt = Math.max(0, D.batt - dt / C.flight * Math.min(1.6, 1 + sp / 1200));
      const home = Math.hypot(D.x - pd.x, D.z - pd.z);
      const reserve = (home / C.rthSpeed + C.reserveS) / C.flight;
      if (!S.rth && D.batt <= reserve) {
        S.rth = true;
        D.warned = C.warn.length;
        this.addCombatLog('[[battery]] PIN DRONE YẾU — drone tự bay về xe để sạc', 'alert');
        if (SE && SE.playDroneBattery) SE.playDroneBattery('rth');
      }
      for (let i = D.warned; i < C.warn.length; i++) {
        if (D.batt > C.warn[i]) break;
        D.warned = i + 1;
        this.addCombatLog(`[[battery]] Pin drone còn ${Math.round(C.warn[i] * 100)}% — sắp phải bay về sạc`, 'alert');
        if (SE && SE.playDroneBattery) SE.playDroneBattery('low');
      }
      if (M) { M.visible = false; ReconDrone.animate(M, dt, 1); }
      return;
    }
    if (D.state === 'launching') {
      // cất cánh từ đế sạc trên nóc cabin: kẹp càng nhả, cánh quay lên, bốc thẳng lên ~35 đơn vị rồi chuyển sang hình từ drone
      D.launchT += dt;
      const k = Math.min(1, Math.max(0, (D.launchT - 0.5) / 0.75));
      D.x = pd.x; D.z = pd.z; D.y = pd.y + k * k * (3 - 2 * k) * 35;
      D.batt = Math.max(0, D.batt - dt / C.flight);
      if (SE && SE.updateDrone) SE.updateDrone(true, { climb: k > 0 && k < 1 ? 160 : 0, speed: 0 });
      if (M) {
        M.visible = true;
        M.position.set(D.x, D.y, D.z);
        M.rotation.set(0, D.yaw, 0);
        ReconDrone.animate(M, dt, 1);
      }
      if (D.launchT >= 1.3) {
        if (this.isGameOver || this.isGameStarted === false || (this.tacticalMap && this.tacticalMap.isOpen)) { D.state = 'returning'; return; }
        this.setSightMode(true);
      }
      return;
    }
    if (D.state === 'flying' || D.state === 'returning') {
      // màn hình đã đóng nhưng drone còn ở ngoài: tự bay về nóc cabin (vẫn tốn pin) rồi hạ xuống đáp, về tới nơi mới sạc
      D.state = 'returning';
      D.batt = Math.max(0, D.batt - dt / C.flight);
      const dx = pd.x - D.x, dz = pd.z - D.z, d = Math.hypot(dx, dz), st = C.rthSpeed * dt;
      const gD = this.terrain ? this.terrain.getElevationAt(D.x, D.z) : 0;
      if (d > st) { D.x += dx / d * st; D.z += dz / d * st; D.yaw = Math.atan2(-dx, -dz); }
      else { D.x = pd.x; D.z = pd.z; }
      const wantY = d > 60 ? Math.max(gD + 90, pd.y + 40) : pd.y;
      D.y += Math.max(-140 * dt, Math.min(140 * dt, wantY - D.y));
      if (d <= st + 1 && D.y - pd.y < 1) { D.state = 'docked'; D.vx = D.vz = D.vy = 0; }
      if (M) {
        M.visible = true;
        M.position.set(D.x, D.y, D.z);
        M.rotation.set(d > 60 ? -0.12 : 0, D.yaw, 0);   // bay nhanh thì chúc mũi
        ReconDrone.animate(M, dt, 1);
      }
      return;
    }
    // đậu trên nóc cabin: theo xe (kể cả nghiêng theo dốc), cánh đứng yên, sạc pin
    D.x = pd.x; D.y = pd.y; D.z = pd.z;
    D.batt = Math.min(1, D.batt + dt / C.charge);
    if (D.batt > C.warn[0]) D.warned = 0;
    if (M) {
      M.visible = true;
      M.position.set(pd.x, pd.y, pd.z);
      if (P.chassisGroup) P.chassisGroup.getWorldQuaternion(M.quaternion); else M.rotation.set(0, P.bodyAngle || 0, 0);
      ReconDrone.animate(M, dt, 0);
    }
  }

  /**
   * NHÃN TRÊN HÌNH DRONE: MỤC TIÊU (điểm đã đánh dấu / xe đã khóa, cự ly tính từ PHÁO), ĐIỂM RƠI DỰ KIẾN (đường đạn
   * tính từ nòng pháo: lệch bao nhiêu so với mục tiêu, bay bao lâu), PHÁO (xe mình). Điểm nằm ngoài khung hình: nhãn
   * nằm ở mép kèm mũi tên chỉ hướng. Bắn xong: đếm ngược tới lúc đạn chạm đất.
   */
  updateDroneTags(dt, S) {
    const el = this._sightEl, P = this.player, cam = this.camera;
    if (!el || !this._droneTags) return;
    const W = window.innerWidth, H = window.innerHeight, m = 70, mTop = 120, mBot = 150;   // chừa chỗ bảng HUD trên / dưới
    const v = this._tagV || (this._tagV = new THREE.Vector3());
    const place = (tag, x, y, z, text, col) => {
      if (!tag) return;
      if (x === null) { if (!tag.hidden) tag.hidden = true; return; }
      if (tag.hidden) tag.hidden = false;
      v.set(x, y, z).project(cam);
      let sx = (v.x * 0.5 + 0.5) * W, sy = (-v.y * 0.5 + 0.5) * H;
      const behind = v.z > 1;
      if (behind) { sx = W - sx; sy = H - sy; }
      const off = behind || sx < m || sx > W - m || sy < mTop || sy > H - mBot;
      if (off) {
        // kẹp về mép, mũi tên chỉ hướng điểm
        const cx = W / 2, cy = (mTop + H - mBot) / 2;
        let ax = sx - cx, ay = sy - cy;
        if (behind && Math.abs(ax) + Math.abs(ay) < 1) ay = 1;
        const k = Math.min((W / 2 - m) / Math.max(1e-3, Math.abs(ax)), ((H - mTop - mBot) / 2) / Math.max(1e-3, Math.abs(ay)));
        sx = cx + ax * k; sy = cy + ay * k;
        tag._arrow.style.transform = 'rotate(' + Math.atan2(ay, ax) + 'rad)';
      }
      tag.classList.toggle('off', off);
      tag.classList.toggle('flip', sx > W - 280);   // sát mép phải: chữ nằm bên trái điểm
      tag.style.transform = 'translate(' + Math.round(sx) + 'px,' + Math.round(sy) + 'px)';
      if (tag._txt.textContent !== text) tag._txt.textContent = text;
      if (tag._c !== col) { tag._c = col; tag.style.setProperty('--tc', col); }
    };
    const T = this._droneTags, tr = this._lockTrack, L = this._lastTraj;
    const tgt = this.lockedTarget && !this.lockedTarget.isDead && !this._manualAim ? this.lockedTarget : this._aimPoint;
    let ax = null, az = null;
    if (tgt) {
      ax = tr && tr.id === tgt.id && tr.fullX !== undefined ? tr.fullX : tgt.x;
      az = tr && tr.id === tgt.id && tr.fullZ !== undefined ? tr.fullZ : tgt.z;
      const ay = this.terrain ? this.terrain.getElevationAt(ax, az) : 0;
      const lead = tgt === this.lockedTarget && Math.hypot(ax - tgt.x, az - tgt.z) > 15;
      place(T.tgt, ax, ay + 4, az, (lead ? 'ĐÓN ĐẦU · ' : 'MỤC TIÊU · ') + Math.round(Math.hypot(ax - P.x, az - P.z)).toLocaleString() + ' M', '#ffd166');
    } else place(T.tgt, null);
    if (L && !L.out) {
      const st = this._aimState;
      const col = st === 'on' ? '#5cf08a' : (st === 'blocked' || st === 'covered' || L.wall) ? '#ff5a4a' : '#ffb020';
      const miss = ax !== null ? Math.round(Math.hypot(L.x - ax, L.z - az)) : null;
      const what = this._clusterFP && this._clusterFP.F ? 'TÂM VÙNG RẢI' : L.wall ? 'ĐẠN CHẠM VẬT CẢN' : 'ĐIỂM RƠI';
      place(T.imp, L.x, L.y + 2, L.z, what + (miss !== null ? ' · LỆCH ' + miss + ' M' : '') + (L.ft ? ' · BAY ' + L.ft.toFixed(1) + ' S' : ''), col);
    } else place(T.imp, null);
    const D = this.droneState();
    place(T.gun, P.x, (P.y || 0) + 30, P.z, 'PHÁO · ' + Math.round(Math.hypot(D.x - P.x, D.z - P.z)).toLocaleString() + ' M', '#9fd3ff');
    // xe phòng không đang khóa drone (hướng như máy cảnh báo radar; nằm ngoài khung hình thì mũi tên ở mép)
    const TH = this._droneThreat && this._droneThreat.top;
    if (T.aa) place(T.aa, TH ? TH.x : null, TH ? (TH.y || 0) + 14 : 0, TH ? TH.z : 0, (this._droneThreat.firing ? 'PHÒNG KHÔNG ĐANG BẮN · ' : 'PHÒNG KHÔNG KHÓA · ') + (TH ? Math.round(Math.hypot(TH.x - D.x, TH.z - D.z)).toLocaleString() + ' M' : ''), '#ff3b30');
    // đạn đang bay: đếm ngược tới lúc chạm đất
    const W2 = this._shotWatch;
    let sTxt = '';
    if (W2) {
      W2.t += dt;
      const alive = this.ballistics.activeShells.includes(W2.shell) && !W2.shell.exploded;
      if (alive) { W2.seen = true; sTxt = 'ĐẠN ĐANG BAY · CHẠM ĐẤT SAU ' + Math.max(0, W2.eta - W2.t).toFixed(1) + ' S'; }
      else {
        W2.after = (W2.after || 0) + dt;
        sTxt = W2.shell.ammoType === 'CLUSTER' ? 'ĐẠN CHÙM ĐÃ TÁCH' : 'ĐẠN ĐÃ NỔ';
        if (W2.after > 2) this._shotWatch = null;
      }
    }
    if (T.shot.textContent !== sTxt) T.shot.textContent = sTxt;
    T.shot.hidden = !sTxt;
    if (S.sigEdge !== T._sig) { T._sig = S.sigEdge; T.sig.hidden = !S.sigEdge; }
  }

  updateChaseCamera(dt) {
    const P = this.player, cam = this.camera;
    const C = this._cam || (this._cam = { unit: null, zoom: 1, zoomT: 1, chaseZoom: 0, yaw: 0, y: 0, px: 0, pz: 0, phi: 0, R: 0, freeYaw: 0, freePitch: 0, treeT: 0 });
    this.updateDroneBattery(dt);
    if (this._sight) {
      if (P.isDead || this.isGameOver || this._sight.unit !== P) this.setSightMode(false);
      else { this.updateSightCamera(dt); return; }
    }
    const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

    // Hướng muốn nhìn = hướng tháp pháo thật trong thế giới (kiểu camera game xe tăng): xoay tháp thì camera xoay theo,
    // thân xe chạy / rẽ hướng khác thì camera vẫn giữ hướng nòng. Khóa mục tiêu: tháp tự bám -> camera quay dần về mục tiêu.
    // Xe đã bị hạ: giữ hướng cũ (tháp văng / xoay lung tung không kéo camera theo)
    const turretWorld = P._turretYaw !== undefined ? P._turretYaw + (P.bodyAngle || 0) : -(P.azimuth || 0) * Math.PI / 180;
    const want = P.isDead ? C.yaw : wrap(turretWorld);
    const respawned = C.dead && !P.isDead;
    C.dead = !!P.isDead;
    if (C.unit !== P || respawned) {
      // vào trận / hồi sinh / đổi xe: đặt camera ngay sau lưng xe, không lia từ chỗ cũ
      const z0 = C.unit ? C.zoomT : this.camDefaultZoom(P);
      Object.assign(C, { unit: P, yaw: want, y: P.y || 0, px: P.x, pz: P.z, zoom: z0, zoomT: z0, phi: 0, R: 0, freeYaw: 0, freePitch: 0 });
    }

    // Xoay mượt về hướng tháp (lọc + giới hạn tốc độ quay ~140°/s -> tháp quay nhanh / đón đầu không giật, không chóng mặt)
    const dYaw = wrap(want - C.yaw);
    const maxRate = 2.4 * dt;
    C.yaw = wrap(C.yaw + Math.max(-maxRate, Math.min(maxRate, dYaw * (1 - Math.exp(-dt * 6)))));
    // Nhìn quanh (giữ chuột giữa + kéo): thả ra thì từ từ quay về hướng tháp
    if (!this._freeLook) { const k = Math.exp(-dt * 2.5); C.freeYaw *= k; C.freePitch *= k; }
    C.zoom += (C.zoomT - C.zoom) * (1 - Math.exp(-dt * 6));

    // Vị trí xe đã lọc nhẹ (xóc, nảy trên đá không làm khung hình rung); độ cao lọc chậm hơn (đồi dốc không nhấp nhô)
    const kp = 1 - Math.exp(-dt * 12);
    C.px += (P.x - C.px) * kp; C.pz += (P.z - C.pz) * kp;
    if (Math.hypot(P.x - C.px, P.z - C.pz) > 300) { C.px = P.x; C.pz = P.z; }
    C.y += ((P.y || 0) - C.y) * (1 - Math.exp(-dt * 4));

    const Z = this.camZoomParams(C.zoom);
    const distK = this.camDistK(P);
    Z.R *= distK;
    Z.ahead *= distK;   // lùi xa hơn thì điểm nhìn cũng đẩy ra xa tương ứng: xe vẫn ở 1/3 dưới khung hình, thấy xa hơn phía trước
    const yaw = wrap(C.yaw + C.freeYaw);
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const pivotY = C.y + 22;

    // Vật cản giữa xe và camera: đồi, mái nhà. Thử nâng góc camera từng nấc, vẫn bị che thì kéo lại gần xe
    const bs = this.terrain && this.terrain.buildingSet;
    const near = bs ? bs.items.filter(B => !B.collapsed && Math.abs(B.x - C.px) < Z.R + 120 && Math.abs(B.z - C.pz) < Z.R + 120) : null;
    const freeAt = (phi, R) => {
      const cp = Math.cos(phi), sp = Math.sin(phi);
      for (let i = 1; i <= 12; i++) {
        const s = i / 12, h = R * s;
        if (pivotY + sp * h < this.camObstacleTop(C.px - fx * cp * h, C.pz - fz * cp * h, near) + 10) return (i - 1) / 12;
      }
      return 1;
    };
    let phi = Math.max(0.12, Math.min(1.35, Z.phi + C.freePitch)), R = Z.R;
    let s = freeAt(phi, R);
    for (let k = 1; s < 1 && k <= 7; k++) { phi = Math.min(1.35, Z.phi + C.freePitch + k * 0.13); s = freeAt(phi, R); }
    if (s < 1) R = Math.max(90, R * s);
    // bị che: nâng / kéo lại nhanh; hết che: trả về từ từ (không bật qua bật lại)
    if (!C.R) { C.R = R; C.phi = phi; }
    C.R += (R - C.R) * (1 - Math.exp(-dt * (R < C.R ? 14 : 2.2)));
    C.phi += (phi - C.phi) * (1 - Math.exp(-dt * (phi > C.phi ? 10 : 2.2)));

    let shakeX = 0, shakeZ = 0;
    if (this.cameraShake > 0) {
      shakeX = (Math.random() - 0.5) * this.cameraShake;
      shakeZ = (Math.random() - 0.5) * this.cameraShake;
      this.cameraShake = Math.max(0, this.cameraShake - dt * 25);
    }
    const cp = Math.cos(C.phi), sp = Math.sin(C.phi);
    const camX = C.px - fx * cp * C.R + shakeX, camZ = C.pz - fz * cp * C.R + shakeZ;
    let camY = pivotY + sp * C.R;
    camY = Math.max(camY, this.camObstacleTop(camX, camZ, near) + 8);
    cam.position.set(camX, camY, camZ);
    // camera bị đẩy lên cao vì vật cản: điểm nhìn lùi dần về xe để xe vẫn nằm trong khung hình
    const ahead = Z.ahead * Math.max(0, 1 - Math.max(0, C.phi - Z.phi) / 0.7);
    // xe 6 nòng / trinh sát đang ngắm lên trời / khóa drone: camera ngước lên theo nòng (thấy được drone trên cao)
    const AA = this._airAim && !P.isDead ? this._airAim : null;
    const upT = AA && AA.barrelEl > 3 ? Math.tan(Math.min(38, AA.barrelEl) * Math.PI / 180) * (ahead + C.R * cp) * 0.85 : 0;
    C.airUp = (C.airUp || 0) + (upT - (C.airUp || 0)) * (1 - Math.exp(-dt * 3));
    cam.lookAt(C.px + fx * ahead, C.y + Z.up + C.airUp, C.pz + fz * ahead);
    this._camYaw = yaw;
    // Thanh máu trên nóc xe mình: camera bám đuôi ở sát sau xe -> thanh to chắn giữa màn hình (máu đã có ở góc dưới)
    if (P.hpGroup) P.hpGroup.visible = Z.t > 0.5;

    // Nhà cao tầng chắn giữa camera và xe mình: tạm cắt bỏ các tầng trên để luôn thấy xe
    if (this.terrain && this.terrain.updateBuildingView) this.terrain.updateBuildingView(cam.position, P, dt);
    // Tán cây chắn giữa camera và xe: tạm ẩn (kiểm tra ~12 lần / giây)
    C.treeT -= dt;
    const trees = this.terrain && this.terrain.trees;
    if (trees && trees.setCameraView && C.treeT <= 0) { C.treeT = 0.08; trees.setCameraView(cam.position, { x: P.x, y: (P.y || 0) + 14, z: P.z }); }

    // Tâm vùng mặt đất nhìn rõ (cỏ 3D, bóng đổ): bám đuôi = phía trước xe; nhìn cao = quanh điểm nhìn
    const fAhead = 380 * (1 - Z.t) + Z.ahead * Z.t;
    this._viewFocus = { x: C.px + fx * fAhead, z: C.pz + fz * fAhead };

    // Sương mù: góc thấp nhìn tới tận chân trời -> sương dày hơn một chút để xa mờ dần (đỡ lộ mép bản đồ, đỡ vẽ chi tiết xa)
    const fog = this.scene.fog;
    if (fog && fog.density !== undefined) {
      if (fog._baseD === undefined) fog._baseD = fog.density;
      fog.density = fog._baseD + (Math.max(fog._baseD, 0.0004 / Math.sqrt(distK)) - fog._baseD) * (1 - Z.t);
    }

    // Khung bóng đổ ôm vùng nhìn rõ phía trước xe (bóng xa hơn đã chìm trong sương). Tâm khóa theo lưới texel để bóng không rung.
    const sd = this.sunDir || new THREE.Vector3(-0.42, 0.82, -0.36);
    const aspK = Math.max(1, cam.aspect / 1.78);
    const half = Math.ceil((620 * (1 - Z.t) + 700 * (C.zoom / 2.6) * Z.t) * distK * aspK / 20) * 20;
    const sc = this.sunLight.shadow.camera;
    if (sc.right !== half) { sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half; sc.updateProjectionMatrix(); }
    const texel = (2 * half) / (this.sunLight.shadow.mapSize.width || 2048);
    const sAhead = 330 * (1 - Z.t) + Z.ahead * Z.t;
    const focusX = Math.round((C.px + fx * sAhead) / texel) * texel;
    const focusZ = Math.round((C.pz + fz * sAhead) / texel) * texel;
    const focusY = C.y;
    this.sunLight.position.set(focusX + sd.x * 1300, focusY + sd.y * 1300, focusZ + sd.z * 1300);
    this.sunLight.target.position.set(focusX, focusY, focusZ);
  }

  // =========================================================================
  // CHẾ ĐỘ NGẮM BẮN (Ctrl)
  // · Xe bắn thẳng (Halberd, Hailstorm, Marten): nhìn qua kính ngắm trên nóc tháp, dọc theo nòng, phóng to bằng con lăn.
  //   Khung ngắm sáng, mảnh kiểu chiến thuật, mỗi xe một kiểu vạch. Tâm kính đặt vào điểm cần trúng
  //   (xanh: nòng đã khớp, cam: tháp đang quay, đỏ: bị chắn). Xe mình ẩn khi nhìn qua kính.
  // · Pháo tự hành (Arbalest): ĐIỀU KHIỂN HỎA LỰC — camera bay theo vào gần điểm ngắm, chỉnh cự ly / hướng bằng W A S D
  //   (vòng tầm tối thiểu / tối đa), W A S D di chuyển vùng nhìn (xe đứng yên), con lăn nâng / hạ độ cao.
  // Nhấp chuột vẫn ngắm điểm / khóa xe như thường; Space bắn; Ctrl / Esc thoát.
  // =========================================================================
  sightProfile(type) {
    switch (type) {
      case 'GATLING': return { kind: 'ring', mag: 3, magMin: 2, magMax: 6, name: 'KÍNH NGẮM 30MM' };
      case 'SCOUT': return { kind: 'box', mag: 3, magMin: 2, magMax: 8, name: 'KÍNH DẪN BẮN' };
      case 'ARTILLERY': return { kind: 'arty', name: 'ĐIỀU KHIỂN HỎA LỰC' };
      default: return { kind: 'chevron', mag: 4, magMin: 2, magMax: 10, name: 'KÍNH NGẮM PHÁO THỦ' };
    }
  }

  artyRangeOf(P) {
    const B = this.ballistics;
    const max = B && B.maxRangeFor ? B.maxRangeFor(P) : 2700;
    const min = B && B.artyLobMinRange ? B.artyLobMinRange() : (P.minFiringDist || 440);
    return { min, max };
  }

  setSightMode(on) {
    const P = this.player, cam = this.camera;
    if (on && (!P || P.isDead || !P.group)) return;
    if (!!on === !!this._sight) return;
    const extras = [this.trajectoryLine].filter(Boolean);   // đường đạn dự kiến xuất phát ngay sát ống kính: tạm ẩn
    if (on) {
      const C = this._cam;
      const prof = this.sightProfile(P.tankType);
      const tw = P._turretYaw !== undefined ? P._turretYaw + (P.bodyAngle || 0) : -(P.azimuth || 0) * Math.PI / 180;
      const S = this._sight = { unit: P, prof, arty: prof.kind === 'arty', magT: prof.mag || 1, mag: 1.5, yaw: tw, pitch: 0, y: null, keys: {} };
      if (C) C.freeYaw = C.freePitch = 0;
      this._freeLook = false;
      if (S.arty) {
        const DR = this.droneState(), DC = ArtilleryGame3D.DRONE;
        // camera gắn trên drone (đang lơ lửng trên xe sau pha cất cánh, hoặc đang bay về thì bay tiếp từ chỗ đó);
        // tự bay ra vùng đang ngắm (xe đã khóa / điểm đã đánh dấu / điểm đạn rơi theo nòng; chưa có thì giữa vùng bắn)
        // — chạm phím lái là người chơi cầm lái
        const R = this.artyRangeOf(P), mid = (R.min + R.max) / 2;
        const A = (this.lockedTarget && !this.lockedTarget.isDead ? this.lockedTarget : null) || this._aimPoint;
        const L = this._lastTraj;
        const G = A || (L && !L.out && !L.wall && L.d >= R.min ? { x: L.x, z: L.z } : { x: P.x - Math.sin(tw) * mid, z: P.z - Math.cos(tw) * mid });
        if (DR.state === 'docked') { const pd = this.dronePadWorld(); DR.x = pd.x; DR.y = pd.y + 30; DR.z = pd.z; DR.yaw = (P.bodyAngle || 0); }
        DR.state = 'flying';
        DR.vx = DR.vx || 0; DR.vz = DR.vz || 0; DR.vy = DR.vy || 0;
        S.hT = DC.cruiseAlt; S.pitch = -1.38; S.roll = 0; S.t = 0;
        const gb = Math.atan2(-(G.x - P.x), -(G.z - P.z));   // hướng drone = hướng từ xe tới mục tiêu (đỉnh màn hình = hướng bắn)
        const back = DC.cruiseAlt / Math.tan(-DC.gimbal);
        S.auto = { x: G.x - (-Math.sin(gb)) * back, z: G.z - (-Math.cos(gb)) * back, yaw: gb };
        S.cx = G.x; S.cz = G.z; S.h = DR.y;
        if (DR.model) DR.model.visible = false;   // camera nằm trong drone
        this.renderer.domElement.style.filter = 'saturate(.62) contrast(1.12) brightness(1.04)';   // hình ảnh truyền về từ camera drone
        if (window.soundEngine && window.soundEngine.playDroneLink) window.soundEngine.playDroneLink('up');
        for (const k of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) this.keys[k] = false;   // xe dừng, phím dùng để di chuyển vùng nhìn
      } else {
        P.group.traverse(o => o.layers.set(1));
        extras.forEach(o => o.layers.set(1));
      }
      const trees = this.terrain && this.terrain.trees;
      if (trees && trees.setCameraView) trees.setCameraView(null, null);   // nhìn qua kính: cây chắn là chắn thật
      this.buildSightOverlay(P, prof);
      if (window.soundEngine && window.soundEngine.playAmmoSwitch) window.soundEngine.playAmmoSwitch();
    } else {
      const S = this._sight;
      this._sight = null;
      if (!S.arty) {
        if (S.unit && S.unit.group) S.unit.group.traverse(o => o.layers.set(o._lodH ? 1 : 0));
        extras.forEach(o => o.layers.set(0));
      }
      if (this._rangeRings) this._rangeRings.visible = false;
      this._lodMag = 1;
      for (const u of this.units) if (u.hpGroup) u.hpGroup.scale.setScalar(1);
      cam.fov = 45; cam.updateProjectionMatrix();
      if (this._cam) { this._cam.yaw = S.arty ? this._cam.yaw : S.yaw; this._cam.R = 0; }
      if (this._sightEl) this._sightEl.classList.add('hidden');
      if (S.arty) {
        this.renderer.domElement.style.filter = '';
        this.renderer.domElement.style.transform = '';
        const SE = window.soundEngine;
        if (SE && SE.updateDrone) { SE.updateDrone(false); SE.playDroneLink('down'); }
      }
    }
  }

  // Khung ngắm HTML (đè lên khung hình, không chặn chuột): mảnh, sáng, góc khung kiểu chiến thuật; vạch theo loại xe
  buildSightOverlay(P, prof) {
    if (!domById('gun-sight-style')) {
      const st = document.createElement('style');
      st.id = 'gun-sight-style';
      st.textContent = [
        '#gun-sight{position:fixed;inset:0;pointer-events:none;z-index:5;font-family:"Chakra Petch",system-ui,sans-serif;color:#dff5d8;--gs-c:#ffb020}',
        '#gun-sight.hidden{display:none}',
        '#gun-sight .gs-vig{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 50%,transparent 62%,rgba(6,12,8,.28) 100%)}',
        '#gun-sight .gs-frame{position:absolute;inset:7vh 7vw}',
        '#gun-sight .gs-frame i{position:absolute;width:34px;height:34px;border:0 solid rgba(223,245,216,.75)}',
        '#gun-sight .gs-frame i:nth-child(1){left:0;top:0;border-left-width:2px;border-top-width:2px}',
        '#gun-sight .gs-frame i:nth-child(2){right:0;top:0;border-right-width:2px;border-top-width:2px}',
        '#gun-sight .gs-frame i:nth-child(3){left:0;bottom:0;border-left-width:2px;border-bottom-width:2px}',
        '#gun-sight .gs-frame i:nth-child(4){right:0;bottom:0;border-right-width:2px;border-bottom-width:2px}',
        '#gun-sight svg.gs-ret{position:absolute;left:50%;top:50%;width:min(56vh,56vw);height:min(56vh,56vw);transform:translate(-50%,-50%);overflow:visible;filter:drop-shadow(0 0 1px rgba(0,0,0,.9)) drop-shadow(0 0 2px rgba(0,0,0,.5))}',
        '#gun-sight .gs-l{stroke:#dff5d8;stroke-width:1.1;fill:none}',
        '#gun-sight .gs-t{stroke:#dff5d8;stroke-width:.9}',
        '#gun-sight .gs-m{stroke:var(--gs-c);stroke-width:1.5;fill:none}',
        '#gun-sight .gs-d{fill:var(--gs-c)}',
        '#gun-sight .gs-n{fill:#dff5d8;font-size:5px;font-family:inherit}',
        '#gun-sight .gs-top{position:absolute;top:max(calc(7vh + 6px),78px);left:50%;transform:translateX(-50%);display:flex;gap:14px;align-items:center;font-size:13px;letter-spacing:.12em;text-shadow:0 0 3px #000,0 0 6px #000}',
        '#gun-sight .gs-top b{font-weight:600;color:#fff}',
        '#gun-sight .gs-side{position:absolute;left:calc(7vw + 12px);top:50%;transform:translateY(-50%);display:grid;gap:6px;font-size:12px;letter-spacing:.08em;text-shadow:0 0 3px #000,0 0 6px #000}',
        '#gun-sight .gs-side span{display:block}',
        '#gun-sight .gs-side .gs-big{font-size:20px;font-weight:600;color:var(--gs-c)}',
        '#gun-sight .gs-state{color:var(--gs-c);font-weight:600}',
        '#gun-sight .gs-blast{color:#ff9a6e;font-size:11px;max-width:220px;line-height:1.35}',
        '#gun-sight .gs-hint{position:absolute;left:50%;bottom:calc(7vh + 64px);transform:translateX(-50%);font-size:11px;opacity:.8;letter-spacing:.04em;text-shadow:0 0 3px #000;white-space:nowrap}',
        '#gun-sight.arty .gs-vig{background:radial-gradient(ellipse at 50% 50%,transparent 70%,rgba(6,12,8,.22) 100%)}',
        // hình truyền về từ drone trinh sát: vạch quét, hạt nhiễu, chớp nhiễu lúc bắt tín hiệu, đèn REC, thông số bay
        '#gun-sight .gs-scan{position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(0,0,0,.07) 0 1px,transparent 1px 3px);mix-blend-mode:multiply}',
        '#gun-sight .gs-grain,#gun-sight .gs-static{position:absolute;inset:-60px;background-image:url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%27160%27 height=%27160%27%3E%3Cfilter id=%27n%27%3E%3CfeTurbulence type=%27fractalNoise%27 baseFrequency=%27.9%27 numOctaves=%272%27 stitchTiles=%27stitch%27/%3E%3C/filter%3E%3Crect width=%27100%25%27 height=%27100%25%27 filter=%27url(%23n)%27/%3E%3C/svg%3E");background-size:160px 160px}',
        '#gun-sight .gs-grain{opacity:.07;animation:gsGrain .45s steps(4) infinite}',
        '#gun-sight .gs-static{opacity:0;background-color:#9aa59a;animation:gsStatic .75s ease-out 1,gsGrain .2s steps(3) 4}',
        '@keyframes gsGrain{0%{transform:translate(0,0)}25%{transform:translate(-37px,21px)}50%{transform:translate(23px,-41px)}75%{transform:translate(-15px,-12px)}100%{transform:translate(31px,35px)}}',
        '@keyframes gsStatic{0%{opacity:.85}35%{opacity:.5}100%{opacity:0}}',
        '#gun-sight .gs-uav{position:absolute;right:calc(7vw + 12px);top:50%;transform:translateY(-50%);display:grid;gap:5px;text-align:right;font-size:11px;letter-spacing:.08em;text-shadow:0 0 3px #000,0 0 6px #000;font-variant-numeric:tabular-nums}',
        '#gun-sight .gs-uav b{font-weight:600;color:#fff}',
        '#gun-sight .gs-rec{color:#ff5a4a;font-weight:600}',
        // nhãn trên hình drone: chấm + chữ; nằm ngoài khung hình thì ở mép kèm mũi tên chỉ hướng
        '#gun-sight .gs-tags{position:absolute;inset:0}',
        '#gun-sight .gs-tag{position:absolute;left:0;top:0;--tc:#ffd166;color:var(--tc);font-size:11px;font-weight:600;letter-spacing:.06em;white-space:nowrap;text-shadow:0 0 3px #000,0 0 6px #000;font-variant-numeric:tabular-nums}',
        '#gun-sight .gs-tag span{position:absolute;left:12px;top:-22px;padding:2px 6px;border-left:2px solid var(--tc);background:rgba(8,12,10,.45)}',
        '#gun-sight .gs-tag i{position:absolute;left:-4px;top:-4px;width:8px;height:8px;border:2px solid var(--tc);border-radius:50%;box-sizing:border-box}',
        '#gun-sight .gs-tag.off i{left:-7px;top:-6px;width:0;height:0;border-radius:0;border-width:6px 0 6px 12px;border-color:transparent transparent transparent var(--tc)}',
        '#gun-sight .gs-tag.off span{top:10px;left:-40px}',
        '#gun-sight .gs-tag.flip span{left:auto;right:12px;border-left:0;border-right:2px solid var(--tc)}',
        '#gun-sight .gs-tag.off.flip span{right:4px;left:auto}',
        '#gun-sight .gs-shot{position:absolute;top:calc(50% + 46px);left:50%;transform:translateX(-50%);font-size:14px;font-weight:600;letter-spacing:.1em;color:#ffd166;text-shadow:0 0 3px #000,0 0 6px #000}',
        '#gun-sight .gs-sig{position:absolute;top:max(calc(7vh + 58px),130px);left:50%;transform:translateX(-50%);font-size:12px;font-weight:600;letter-spacing:.1em;color:#ff5a4a;text-shadow:0 0 3px #000;animation:gsRec 1s steps(1) infinite}',
        // thanh pin UAV góc trên bên phải: hình cục pin 10 vạch
        '#gun-sight .gs-bat{position:absolute;top:max(calc(7vh + 10px),82px);right:calc(7vw + 12px);display:flex;align-items:center;gap:8px;--bc:#5cf08a;font-size:12px;letter-spacing:.08em;text-shadow:0 0 3px #000,0 0 6px #000;font-variant-numeric:tabular-nums}',
        '#gun-sight .gs-bat[data-lv=mid]{--bc:#ffd166}',
        '#gun-sight .gs-bat[data-lv=low]{--bc:#ff3b30}',
        '#gun-sight .gs-bat b{color:var(--bc);font-weight:600;min-width:84px;text-align:right}',
        '#gun-sight .gs-bat-c{position:relative;display:flex;gap:2px;padding:2px;width:118px;height:20px;box-sizing:border-box;border:2px solid var(--bc);border-radius:3px;background:rgba(8,12,10,.45);box-shadow:0 0 4px rgba(0,0,0,.7)}',
        '#gun-sight .gs-bat-c::after{content:"";position:absolute;right:-6px;top:4px;width:4px;height:8px;border-radius:0 2px 2px 0;background:var(--bc)}',
        '#gun-sight .gs-bat-c i{flex:1;background:rgba(255,255,255,.06)}',
        '#gun-sight .gs-bat-c i.on{background:var(--bc)}',
        '#gun-sight .gs-bat[data-lv=low] .gs-bat-c{animation:gsRec 1s steps(1) infinite}',
        // drone bị bắn: cảnh báo nhấp nháy, thân drone; bị bắn hạ: nhiễu trắng phủ kín "MẤT TÍN HIỆU"
        '#gun-sight .gs-fire{position:absolute;top:calc(50% - 74px);left:50%;transform:translateX(-50%);font-size:15px;font-weight:700;letter-spacing:.14em;color:#ff3b30;text-shadow:0 0 3px #000,0 0 8px #000;animation:gsRec .5s steps(1) infinite}',
        '#gun-sight .gs-hull.mid{color:#ffd166}#gun-sight .gs-hull.low{color:#ff3b30}',
        '#gun-sight .gs-lock{position:absolute;top:calc(50% - 100px);left:50%;transform:translateX(-50%);padding:3px 12px;border:2px solid #ff3b30;font-size:15px;font-weight:700;letter-spacing:.14em;color:#ff3b30;background:rgba(40,6,4,.45);text-shadow:0 0 3px #000;animation:gsLock 1s steps(1) infinite}',
        '#gun-sight .gs-lock.fire{animation-duration:.3s;background:rgba(90,8,4,.55)}',
        '@keyframes gsLock{50%{opacity:.45}}',
        // mất tín hiệu: hình đứng khựng ở khung cuối, nhiễu trắng + vạch xé hình phủ dần (JS chỉnh --na, nền), rồi hiện chữ
        '#gun-sight .gs-dead{position:absolute;inset:0;display:grid;place-content:center;gap:10px;text-align:center;background:rgba(28,31,28,var(--bg,0));color:#e8ece6;text-shadow:0 0 4px #000;--na:.35}',
        '#gun-sight .gs-dead .gs-tear{position:absolute;inset:0;opacity:calc(var(--na) * .9);background:repeating-linear-gradient(0deg,rgba(235,240,232,.0) 0 7px,rgba(235,240,232,.35) 7px 9px,rgba(0,0,0,.25) 9px 13px);background-size:100% 37px;animation:gsTear .12s steps(2) infinite}',
        '@keyframes gsTear{0%{background-position:0 0}50%{background-position:0 -19px}100%{background-position:0 11px}}',
        '#gun-sight .gs-dead .gs-txt{display:grid;gap:10px;opacity:0;transition:opacity .25s}',
        '#gun-sight .gs-dead.txt .gs-txt{opacity:1}',
        // drone bốc cháy: ánh lửa liếm vào mép ống kính
        '#gun-sight .gs-burn{position:absolute;inset:0;opacity:0;pointer-events:none;background:radial-gradient(ellipse 70% 55% at 85% 100%,rgba(255,120,20,.75),rgba(255,70,0,.25) 45%,transparent 70%),radial-gradient(ellipse 40% 35% at 0% 85%,rgba(255,150,40,.45),transparent 70%);mix-blend-mode:screen}',
        '#gun-sight .gs-dead[hidden]{display:none}',
        '#gun-sight .gs-dead-n{position:absolute;inset:-60px;opacity:var(--na);background-image:url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%27160%27 height=%27160%27%3E%3Cfilter id=%27n%27%3E%3CfeTurbulence type=%27fractalNoise%27 baseFrequency=%27.95%27 numOctaves=%272%27 stitchTiles=%27stitch%27/%3E%3C/filter%3E%3Crect width=%27100%25%27 height=%27100%25%27 filter=%27url(%23n)%27/%3E%3C/svg%3E");background-size:160px 160px;animation:gsGrain .16s steps(3) infinite}',
        '#gun-sight .gs-dead b{position:relative;font-size:34px;font-weight:700;letter-spacing:.2em;background:rgba(10,12,10,.7);padding:6px 18px}',
        '#gun-sight .gs-dead span{position:relative;font-size:14px;font-weight:600;letter-spacing:.14em;color:#ff5a4a;background:rgba(10,12,10,.7);padding:4px 12px;justify-self:center}',
        '#gun-sight .gs-rec i{display:inline-block;width:8px;height:8px;border-radius:50%;background:#ff3b30;margin-right:6px;vertical-align:0;animation:gsRec 1s steps(1) infinite}',
        '@keyframes gsRec{50%{opacity:0}}',
        '@media (prefers-reduced-motion:reduce){#gun-sight .gs-grain,#gun-sight .gs-static,#gun-sight .gs-rec i{animation:none}}',
        '#gun-sight.optic .gs-vig{background:radial-gradient(circle at 50% 50%,transparent 0,transparent 46%,rgba(12,16,12,.14) 49%,rgba(12,16,12,.24) 100%)}',
        '#gun-sight .gs-optic{position:absolute;left:50%;top:50%;width:min(92vh,92vw);height:min(92vh,92vw);transform:translate(-50%,-50%);border-radius:50%;box-shadow:0 0 0 1px rgba(18,22,16,.45),inset 0 0 36px rgba(0,0,0,.16)}',
        '#gun-sight svg.gs-ret.etched{filter:drop-shadow(0 0 .6px rgba(236,240,226,.95)) drop-shadow(0 0 1.6px rgba(236,240,226,.4))}',
        '#gun-sight svg.gs-ret.etched .gs-l,#gun-sight svg.gs-ret.etched .gs-t{stroke:#151812}',
        '#gun-sight svg.gs-ret.etched .gs-l{stroke-width:.9}',
        '#gun-sight svg.gs-ret.etched .gs-n{fill:#151812;font-size:4.6px;font-weight:600}',
        '#gun-sight .gs-faint{opacity:.55}',
        '@media (max-width:700px){#gun-sight .gs-hint,#gun-sight .gs-side{display:none}}'
      ].join('\n');
      document.head.appendChild(st);
    }
    let el = this._sightEl;
    if (!el) {
      el = this._sightEl = document.createElement('div');
      el.id = 'gun-sight';
      document.body.appendChild(el);
    }
    const ticks = (n, y0, dy, w) => { let s = ''; for (let i = 1; i <= n; i++) { const y = y0 + i * dy, ww = i % 2 ? w : w * 1.8; s += '<line class="gs-t" x1="' + (-ww) + '" y1="' + y + '" x2="' + ww + '" y2="' + y + '"/>'; } return s; };
    let ret = '';
    if (prof.kind === 'chevron') {
      // tăng chủ lực: chữ Λ ở tâm, 2 vạch ngang có khe, vạch cự ly bên dưới, vạch lệch ngang 2 bên
      ret = '<line class="gs-l" x1="-70" y1="0" x2="-14" y2="0"/><line class="gs-l" x1="14" y1="0" x2="70" y2="0"/>'
        + '<line class="gs-l" x1="0" y1="14" x2="0" y2="58"/>' + ticks(4, 14, 10, 3)
        + '<line class="gs-t" x1="-28" y1="-3" x2="-28" y2="3"/><line class="gs-t" x1="-42" y1="-3" x2="-42" y2="3"/><line class="gs-t" x1="-56" y1="-3" x2="-56" y2="3"/>'
        + '<line class="gs-t" x1="28" y1="-3" x2="28" y2="3"/><line class="gs-t" x1="42" y1="-3" x2="42" y2="3"/><line class="gs-t" x1="56" y1="-3" x2="56" y2="3"/>'
        + '<path class="gs-m" d="M-7 7 L0 0 L7 7"/>';
    } else if (prof.kind === 'ring') {
      // pháo tự động 30mm (kiểu kính ngắm BMP): chữ Λ ở tâm, thước đón đầu ngang có số, thang cự ly bậc thang bên trái
      // (×100 m), 2 vòng đón đầu mục tiêu bay mảnh — vạch khắc đen, viền sáng như vạch trên kính thật
      let h = '<line class="gs-l" x1="-92" y1="0" x2="-12" y2="0"/><line class="gs-l" x1="12" y1="0" x2="92" y2="0"/>'
        + '<line class="gs-l" x1="0" y1="12" x2="0" y2="44"/>';
      for (let i = 1; i <= 13; i++) {
        const x = 12 + i * 6, big = i % 3 === 0, hh = big ? 4 : 2;
        h += '<line class="gs-t" x1="' + x + '" y1="' + (-hh) + '" x2="' + x + '" y2="0"/><line class="gs-t" x1="' + (-x) + '" y1="' + (-hh) + '" x2="' + (-x) + '" y2="0"/>';
        if (big) h += '<text class="gs-n" x="' + x + '" y="-6" text-anchor="middle">' + (i / 3) + '</text><text class="gs-n" x="' + (-x) + '" y="-6" text-anchor="middle">' + (i / 3) + '</text>';
      }
      [4, 8, 12, 16, 20].forEach((r, i) => {
        const y = 8 + i * 7, x0 = -30 - i * 3;
        h += '<line class="gs-t" x1="' + x0 + '" y1="' + y + '" x2="' + (x0 + 9) + '" y2="' + y + '"/><text class="gs-n" x="' + (x0 - 3) + '" y="' + (y + 1.8) + '" text-anchor="end">' + r + '</text>';
      });
      h += '<circle class="gs-l gs-faint" cx="0" cy="0" r="46" stroke-dasharray="1.5 4"/><circle class="gs-l gs-faint" cx="0" cy="0" r="78" stroke-dasharray="1.5 5"/>'
        + '<path class="gs-m" d="M-7 8 L0 0 L7 8"/><circle class="gs-d" cx="0" cy="0" r="1.1"/>';
      ret = h;
    } else if (prof.kind === 'box') {
      const missile = P.selectedAmmo === 'ANTI_TANK_MISSILE';
      let h = '';
      if (missile) {
        // kính dẫn tên lửa: chữ thập mảnh suốt khung có vạch chia, khung bám mục tiêu (màu theo đầu dò)
        h = '<line class="gs-l" x1="-96" y1="0" x2="-8" y2="0"/><line class="gs-l" x1="8" y1="0" x2="96" y2="0"/>'
          + '<line class="gs-l" x1="0" y1="-70" x2="0" y2="-8"/><line class="gs-l" x1="0" y1="8" x2="0" y2="70"/>';
        for (let i = 1; i <= 11; i++) {
          const d = 8 + i * 8, w = i % 4 === 0 ? 3.5 : 1.8;
          h += '<line class="gs-t" x1="' + d + '" y1="' + (-w) + '" x2="' + d + '" y2="' + w + '"/><line class="gs-t" x1="' + (-d) + '" y1="' + (-w) + '" x2="' + (-d) + '" y2="' + w + '"/>';
          if (d <= 70) h += '<line class="gs-t" x1="' + (-w) + '" y1="' + d + '" x2="' + w + '" y2="' + d + '"/><line class="gs-t" x1="' + (-w) + '" y1="' + (-d) + '" x2="' + w + '" y2="' + (-d) + '"/>';
        }
        h += '<path class="gs-m" d="M-20 -10 V-15 H-13 M13 -15 H20 V-10 M20 10 V15 H13 M-13 15 H-20 V10"/>'
          + '<circle class="gs-d" cx="0" cy="0" r="1"/>';
      } else {
        // súng máy 12.7mm (kính chuẩn trực): vòng tròn + chấm sáng ở tâm, vạch bù đạn rơi bên dưới (×100 m)
        h = '<circle class="gs-l" cx="0" cy="0" r="22"/>'
          + '<line class="gs-l" x1="-40" y1="0" x2="-26" y2="0"/><line class="gs-l" x1="26" y1="0" x2="40" y2="0"/>'
          + '<line class="gs-l" x1="0" y1="-40" x2="0" y2="-26"/><line class="gs-l" x1="0" y1="26" x2="0" y2="52"/>'
          + '<circle class="gs-l gs-faint" cx="0" cy="0" r="58" stroke-dasharray="1.5 5"/>';
        [4, 6, 8].forEach((r, i) => {
          const y = 6 + i * 6, w = 3 + i * 1.5;
          h += '<line class="gs-t" x1="' + (-w) + '" y1="' + y + '" x2="' + w + '" y2="' + y + '"/><text class="gs-n" x="' + (w + 2.5) + '" y="' + (y + 1.8) + '">' + r + '</text>';
        });
        h += '<circle class="gs-d" cx="0" cy="0" r="1.6"/><circle class="gs-m" cx="0" cy="0" r="3.2"/>';
      }
      ret = h;
    }
    const arty = prof.kind === 'arty', etched = prof.kind === 'ring' || prof.kind === 'box';
    el.className = arty ? 'arty' : etched ? 'optic' : '';
    if (prof.kind === 'box') prof = Object.assign({}, prof, { name: P.selectedAmmo === 'ANTI_TANK_MISSILE' ? 'KÍNH DẪN TÊN LỬA' : 'KÍNH SÚNG MÁY 12.7MM' });
    if (this._sight) this._sight.ammo = P.selectedAmmo;
    el.innerHTML = (arty ? '<div class="gs-grain"></div><div class="gs-scan"></div><div class="gs-static"></div>'
        + '<div class="gs-uav"><span class="gs-rec"><i></i>REC · UAV TRINH SÁT</span><span>ĐỘ CAO <b class="gs-alt">—</b></span>'
        + '<span>CÁCH XE <b class="gs-dist">—</b></span><span>GIÓ <b class="gs-wind">—</b></span><span>THÂN DRONE <b class="gs-hull">100%</b></span><span class="gs-grid"></span>'
        + '</div><div class="gs-bat"><span class="gs-bat-l">PIN UAV</span><span class="gs-bat-c">' + '<i></i>'.repeat(10) + '</span><b class="gs-batt">—</b></div>'
        + '<div class="gs-tags"><div class="gs-tag tgt"><i></i><span></span></div><div class="gs-tag imp"><i></i><span></span></div>'
        + '<div class="gs-tag gun"><i></i><span></span></div><div class="gs-tag aa"><i></i><span></span></div></div><div class="gs-shot" hidden></div><div class="gs-sig" hidden>SẮP RA NGOÀI TẦM TÍN HIỆU</div>'
        + '<div class="gs-burn"></div><div class="gs-fire" hidden>⚠ DRONE ĐANG BỊ BẮN</div><div class="gs-lock" hidden></div>' : '')
      + '<div class="gs-vig"></div><div class="gs-frame"><i></i><i></i><i></i><i></i></div>'
      + (etched ? '<div class="gs-optic"></div>' : '')
      // pháo: dấu tâm màn hình = điểm sẽ ngắm khi thả phím W A S D
      + (arty ? '<svg class="gs-ret" viewBox="-100 -100 200 200"><circle class="gs-m" r="6"/><circle class="gs-d" r="1"/>'
        + '<line class="gs-l" x1="-24" y1="0" x2="-10" y2="0"/><line class="gs-l" x1="10" y1="0" x2="24" y2="0"/>'
        + '<line class="gs-l" x1="0" y1="-24" x2="0" y2="-10"/><line class="gs-l" x1="0" y1="10" x2="0" y2="24"/></svg>'
        : '<svg class="gs-ret' + (etched ? ' etched' : '') + '" viewBox="-100 -100 200 200">' + ret + '</svg>')
      + '<div class="gs-top"><span>' + prof.name + '</span><b class="gs-hdg">000°</b><span class="gs-mag"></span></div>'
      + '<div class="gs-side"><span>CỰ LY</span><span class="gs-big gs-range">—</span><span class="gs-state"></span><span class="gs-blast"></span></div>'
      + '<div class="gs-hint">' + (arty
        ? 'W A S D: lái drone · Q / E: xoay · Shift: nhanh · Lăn chuột: lên / xuống · Nhấp: đánh dấu mục tiêu / khóa xe · F: đánh dấu tâm màn hình · Space: bắn · C: thu drone'
        : 'Lăn chuột: phóng to / thu nhỏ · Nhấp: ngắm điểm / khóa xe' + (P.tankType === 'GATLING' || P.tankType === 'SCOUT' ? ' · Nhấp lên trời: nâng nòng · Nhấp drone địch: khóa drone' : '') + ' · Space: bắn · Ctrl hoặc C: thoát') + '</div>'
      + (arty ? '<div class="gs-dead" hidden><div class="gs-dead-n"></div><div class="gs-tear"></div><div class="gs-txt"><b>MẤT TÍN HIỆU</b><span>DRONE TRINH SÁT ĐÃ BỊ PHÁ HỦY</span></div></div>' : '');
    this._sightMagEl = el.querySelector('.gs-mag');
    this._sightRangeEl = el.querySelector('.gs-range');
    this._sightStateEl = el.querySelector('.gs-state');
    this._sightBlastEl = el.querySelector('.gs-blast');
    this._sightHdgEl = el.querySelector('.gs-hdg');
    this._droneTags = null;
    if (arty) {
      const tg = (c) => { const e = el.querySelector('.gs-tag.' + c); e._arrow = e.querySelector('i'); e._txt = e.querySelector('span'); e.hidden = true; return e; };
      this._droneTags = { tgt: tg('tgt'), imp: tg('imp'), gun: tg('gun'), aa: tg('aa'), shot: el.querySelector('.gs-shot'), sig: el.querySelector('.gs-sig') };
    }
    this._uavEl = arty ? { alt: el.querySelector('.gs-alt'), dist: el.querySelector('.gs-dist'), wind: el.querySelector('.gs-wind'), grid: el.querySelector('.gs-grid'), stat: el.querySelector('.gs-static'), batt: el.querySelector('.gs-batt'), bat: el.querySelector('.gs-bat'), segs: [...el.querySelectorAll('.gs-bat-c i')], hull: el.querySelector('.gs-hull'), fire: el.querySelector('.gs-fire'), lock: el.querySelector('.gs-lock'), burn: el.querySelector('.gs-burn'), dead: el.querySelector('.gs-dead'), t: 0 } : null;
    el._c = null;
    return el;
  }

  // Vòng tầm bắn tối thiểu / tối đa bám theo mặt đất (chỉ hiện trong bản đồ hỏa lực của pháo)
  updateRangeRings(P, R, dt) {
    let G = this._rangeRings;
    if (!G || G.parent !== this.scene) {
      G = this._rangeRings = new THREE.Group();
      const mk = (c) => { const l = new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: 0.85, depthTest: false })); l.renderOrder = 996; l.frustumCulled = false; G.add(l); return l; };
      G.userData.max = mk(0xffb020); G.userData.min = mk(0xff5a4a);
      this.scene.add(G);
    }
    G.visible = true;
    const U = G.userData;
    U.t = (U.t || 0) - dt;
    if (U.t > 0 && Math.hypot(P.x - (U.x || 0), P.z - (U.z || 0)) < 25 && U.r === R.max) return;
    U.t = 0.5; U.x = P.x; U.z = P.z; U.r = R.max;
    const T = this.terrain, lim = (T && T.width ? T.width : this.worldWidth) / 2;
    for (const [line, r] of [[U.max, R.max], [U.min, R.min]]) {
      const pts = [];
      for (let i = 0; i < 180; i++) {
        const a = i / 180 * Math.PI * 2;
        const x = Math.max(-lim, Math.min(lim, P.x + Math.cos(a) * r)), z = Math.max(-lim, Math.min(lim, P.z + Math.sin(a) * r));
        pts.push(new THREE.Vector3(x, (T ? T.getElevationAt(x, z) : 0) + 4, z));
      }
      line.geometry.setFromPoints(pts);
    }
  }

  updateSightCamera(dt) {
    const P = this.player, cam = this.camera, S = this._sight;
    const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
    const T = this.terrain;
    const L = this._lastTraj, A = this._lastAim;
    let fx, fz, px, py, pz, range = null;

    if (S.arty) {
      // MÀN HÌNH DRONE TRINH SÁT: camera gắn dưới bụng drone (gimbal chúc xuống ~52°), drone là vật thể thật có quán tính,
      // pin, tầm tín hiệu. Người chơi LÁI DRONE (W A S D bay, Q / E xoay, lăn chuột lên / xuống); điểm bắn đánh dấu bằng
      // nhấp chuột / phím F (tâm màn hình). Điểm rơi vẫn do máy tính hỏa lực tính TỪ VỊ TRÍ PHÁO (không phải từ drone):
      // nhãn MỤC TIÊU / ĐIỂM RƠI / PHÁO trên màn hình cho biết đạn sẽ rơi ở đâu so với điểm đã đánh dấu.
      // drone vừa bị bắn hạ: hình lật nhào theo drone rơi rồi nhiễu trắng "MẤT TÍN HIỆU", tự về camera xe
      if (S.dying) { this.updateDroneDeathCam(dt, S); return; }
      const R = this.artyRangeOf(P), C = ArtilleryGame3D.DRONE, D = this.droneState();
      const K = S.keys, fast = K.ShiftLeft || K.ShiftRight;
      let mf = (K.KeyW ? 1 : 0) - (K.KeyS ? 1 : 0), mr = (K.KeyD ? 1 : 0) - (K.KeyA ? 1 : 0), my = (K.KeyE ? 1 : 0) - (K.KeyQ ? 1 : 0);
      S.t = (S.t || 0) + dt;
      const pad = this.dronePadWorld();
      // vận tốc bãi đáp (xe mình đang chạy): drone bay về bám theo xe, không bị tụt lại phía sau
      if (S._pad && dt > 0) { S.pvx = (pad.x - S._pad.x) / dt; S.pvz = (pad.z - S._pad.z) / dt; if (Math.hypot(S.pvx, S.pvz) > 600) S.pvx = S.pvz = 0; }
      S._pad = { x: pad.x, z: pad.z };
      if (S.rth) {
        // PIN YẾU: tự bay về trên nóc cabin xe rồi hạ xuống đáp (không điều khiển được nữa)
        mf = mr = my = 0;
        S.auto = { x: pad.x, z: pad.z, speed: C.rthSpeed, land: true };
      }
      if (mf || mr || my) S.auto = null;   // người chơi cầm lái: hủy bay tự động
      if (my) D.yaw = wrap(D.yaw - my * C.yawRate * dt);
      fx = -Math.sin(D.yaw); fz = -Math.cos(D.yaw);
      const rx = -fz, rz = fx;
      let wvx = 0, wvz = 0;
      if (S.auto) {
        const ax = S.auto.x - D.x, az = S.auto.z - D.z, ad = Math.hypot(ax, az);
        const sp = Math.min(S.auto.speed || C.autoSpeed, ad * 1.8);
        if (ad > 0.5) { wvx = ax / ad * sp; wvz = az / ad * sp; }
        if (S.auto.land) { wvx += S.pvx || 0; wvz += S.pvz || 0; }
        if (S.auto.yaw !== undefined) D.yaw = wrap(D.yaw + wrap(S.auto.yaw - D.yaw) * (1 - Math.exp(-dt * 2.5)));
        if (ad < (S.auto.land ? 3 : 8)) { if (S.auto.land) S.landing = true; else S.auto = null; }
      } else {
        const sp = fast ? C.fastSpeed : C.speed;
        wvx = (fx * mf + rx * mr) * sp; wvz = (fz * mf + rz * mr) * sp;
      }
      // quán tính: tăng / giảm tốc mềm như drone thật
      const kv = 1 - Math.exp(-dt * 2.2);
      D.vx += (wvx - D.vx) * kv; D.vz += (wvz - D.vz) * kv;
      D.x += D.vx * dt; D.z += D.vz * dt;
      // sát nóc cabin khi đang đáp: khóa ngang theo bãi đáp (xe chạy vẫn đáp được)
      if (S.auto && S.auto.land && Math.hypot(pad.x - D.x, pad.z - D.z) < 40) {
        const kk = Math.min(1, dt * 8);
        D.x += (pad.x - D.x) * kk; D.z += (pad.z - D.z) * kk;
        D.vx = S.pvx || 0; D.vz = S.pvz || 0;
      }
      // tầm tín hiệu (quanh xe mình) + mép bản đồ
      const sig = R.max + C.signalExtra;
      let ddx = D.x - P.x, ddz = D.z - P.z, dd = Math.hypot(ddx, ddz);
      S.sigEdge = dd > sig - 60;
      if (dd > sig) { D.x = P.x + ddx / dd * sig; D.z = P.z + ddz / dd * sig; D.vx *= 0.5; D.vz *= 0.5; if (S.auto && !S.rth) S.auto = null; }
      const edge = Math.max(0, (T && T.width ? T.width : this.worldWidth) / 2 - 40);
      if (Math.abs(D.x) > edge || Math.abs(D.z) > edge) { if (S.auto && !S.rth) S.auto = null; D.vx *= 0.5; D.vz *= 0.5; }   // mép bản đồ: dừng bay tự động
      D.x = Math.max(-edge, Math.min(edge, D.x)); D.z = Math.max(-edge, Math.min(edge, D.z));
      // độ cao: giữ độ cao làm việc so với mặt đất (lăn chuột chỉnh); đáp thì hạ xuống nóc cabin; tốc độ lên / xuống giới hạn
      const gD = T ? T.getElevationAt(D.x, D.z) : 0;
      const wantY = S.landing ? pad.y : gD + S.hT;
      const vyWant = Math.max(-C.climbRate, Math.min(C.climbRate, (wantY - D.y) * 1.6));
      D.vy += (vyWant - D.vy) * (1 - Math.exp(-dt * 3));
      D.y += D.vy * dt;
      if (!S.landing) D.y = Math.max(D.y, gD + 30);
      if (S.landing && D.y - pad.y < 2 && Math.hypot(D.x - pad.x, D.z - pad.z) < 4) S.landed = true;
      // gimbal: sát xe (cất cánh / đáp) nhìn gần thẳng xuống, bay thì chúc ~52°
      const nearPad = Math.hypot(D.x - pad.x, D.z - pad.z) < 80 && D.y - pad.y < 90;
      S.pitch += ((nearPad || S.landing ? -1.38 : C.gimbal) - S.pitch) * (1 - Math.exp(-dt * 2));
      // nghiêng cánh theo tốc độ dạt ngang, trôi lơ lửng nhẹ
      const vLat = D.vx * rx + D.vz * rz;
      S.roll = (S.roll || 0) + (Math.max(-0.12, Math.min(0.12, -vLat / 2600)) - (S.roll || 0)) * (1 - Math.exp(-dt * 4));
      const t = S.t;
      px = D.x + Math.sin(t * 0.63) * 1.6; pz = D.z + Math.cos(t * 0.71) * 1.6;
      py = D.y + Math.sin(t * 0.91) * 1.2 + 0.4;   // ống kính gimbal dưới mũi drone
      if (Math.abs(cam.fov - 55) > 0.01) { cam.fov = 55; cam.updateProjectionMatrix(); }
      cam.position.set(px, py, pz);
      const cp = Math.cos(S.pitch), spch = Math.sin(S.pitch);
      cam.lookAt(px + fx * cp * 100, py + spch * 100, pz + fz * cp * 100);
      cam.rotateZ(S.roll + Math.sin(t * 0.8) * 0.006);
      // đạn rít qua / trúng drone: hình giật, chập chờn
      if (S.jolt > 0) {
        S.jolt = Math.max(0, S.jolt - dt * 2.5);
        cam.rotateX((Math.random() - 0.5) * S.jolt * 0.14);
        cam.rotateY((Math.random() - 0.5) * S.jolt * 0.14);
      }
      if (S.glitch > 0) {
        S.glitch -= dt;
        this.renderer.domElement.style.transform = S.glitch > 0 && Math.random() < 0.7
          ? 'translate(' + Math.round((Math.random() - 0.5) * 30 * S.glitch) + 'px,' + Math.round((Math.random() - 0.5) * 16 * S.glitch) + 'px)' : '';
      }
      if (S.underFire > 0) S.underFire -= dt;
      // drone bốc cháy (thân dưới 35%): ánh lửa liếm mép ống kính, chao đảo, tín hiệu chập chờn
      const burning = (D.hp === undefined ? 1 : D.hp) < 0.35;
      if (burning) {
        S.burnT = (S.burnT || 0) + dt;
        cam.rotateZ(Math.sin(S.burnT * 5.3) * 0.035 + Math.sin(S.burnT * 13.1) * 0.01);
        if (Math.random() < dt * 1.6) S.glitch = Math.max(S.glitch || 0, 0.18);
      }
      {
        const U = this._uavEl, uf = U && U.fire, on = S.underFire > 0 || burning;
        if (uf && uf.hidden === on) uf.hidden = !on;
        const txt = burning ? '⚠ DRONE BỐC CHÁY · MẤT ỔN ĐỊNH' : '⚠ DRONE ĐANG BỊ BẮN';
        if (uf && uf.textContent !== txt) uf.textContent = txt;
        if (U && U.burn) U.burn.style.opacity = burning ? (0.35 + 0.25 * Math.sin(S.burnT * 17) * Math.sin(S.burnT * 7.3)).toFixed(2) : '0';
      }
      S.yaw = D.yaw;
      // điểm mặt đất ở tâm màn hình (tia nhìn của gimbal cắt địa hình)
      {
        const dx3 = fx * cp, dz3 = fz * cp;
        let lo = 0, hi = 0, hit = false;
        for (let tt = 20; tt < 4000; tt += 25) {
          if (py + spch * tt <= (T ? T.getElevationAt(px + dx3 * tt, pz + dz3 * tt) : 0)) { hi = tt; hit = true; break; }
          lo = tt;
        }
        if (!hit) hi = lo;
        for (let k = 0; k < 8 && hit; k++) {
          const m = (lo + hi) / 2;
          if (py + spch * m <= (T ? T.getElevationAt(px + dx3 * m, pz + dz3 * m) : 0)) hi = m; else lo = m;
        }
        S.cx = px + dx3 * hi; S.cz = pz + dz3 * hi;
      }
      const gy = T ? T.getElevationAt(S.cx, S.cz) : 0;
      if (S.y === null) S.y = gy;
      S.y += (gy - S.y) * (1 - Math.exp(-dt * 4));
      S.h = py - gD;
      S.alt = Math.round(py - gD);
      // tiếng cánh quạt theo chuyển động thật của drone: lên cao / tăng tốc -> rotor quay nhanh, nghiêng cánh -> lệch rotor
      if (window.soundEngine && window.soundEngine.updateDrone && dt > 0) {
        const M = S.mot || (S.mot = { x: px, y: py, z: pz, climb: 0, speed: 0 });
        const kM = 1 - Math.exp(-dt * 5);
        M.climb += ((py - M.y) / dt - M.climb) * kM;
        M.speed += (Math.hypot(px - M.x, pz - M.z) / dt - M.speed) * kM;
        M.x = px; M.y = py; M.z = pz;
        window.soundEngine.updateDrone(true, { climb: M.climb, speed: M.speed, roll: S.roll });
      }
      this._camYaw = D.yaw;
      this._lodMag = 1;
      this.updateRangeRings(P, R, dt);
      this._viewFocus = { x: S.cx, z: S.cz };
      const fog = this.scene.fog;
      if (fog && fog.density !== undefined) { if (fog._baseD === undefined) fog._baseD = fog.density; fog.density = fog._baseD; }
      const half = Math.ceil(Math.max(500, Math.min(1000, S.h * 1.6)) / 20) * 20;
      const sd = this.sunDir || new THREE.Vector3(-0.42, 0.82, -0.36);
      const sc = this.sunLight.shadow.camera;
      if (sc.right !== half) { sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half; sc.updateProjectionMatrix(); }
      const texel = (2 * half) / (this.sunLight.shadow.mapSize.width || 2048);
      const fX = Math.round(S.cx / texel) * texel, fZ = Math.round(S.cz / texel) * texel;
      this.sunLight.position.set(fX + sd.x * 1300, S.y + sd.y * 1300, fZ + sd.z * 1300);
      this.sunLight.target.position.set(fX, S.y, fZ);
      // cự ly: từ PHÁO tới điểm đã đánh dấu (chưa đánh dấu: tới tâm màn hình)
      const dc = Math.round(Math.hypot(S.cx - P.x, S.cz - P.z));
      range = A ? A.d : dc;
      const rr = A ? A.d : dc;
      S.rangeNote = rr > R.max ? 'NGOÀI TẦM BẮN' : rr < R.min ? 'QUÁ GẦN — DƯỚI TẦM CẦU VỒNG' : null;
      this.updateDroneTags(dt, S);
    } else {
      // KÍNH NGẮM: gắn chặt vào tháp, bám gần như tức thì, chỉ lọc rung
      const tw = P._turretYaw !== undefined ? P._turretYaw + (P.bodyAngle || 0) : -(P.azimuth || 0) * Math.PI / 180;
      S.yaw = wrap(S.yaw + wrap(tw - S.yaw) * (1 - Math.exp(-dt * 18)));
      fx = -Math.sin(S.yaw); fz = -Math.cos(S.yaw);
      const v = this._sightV || (this._sightV = new THREE.Vector3());
      if (P.barrelPivot) { P.barrelPivot.updateWorldMatrix(true, false); P.barrelPivot.getWorldPosition(v); } else v.set(P.x, (P.y || 0) + 26, P.z);
      px = v.x - fx * 4; pz = v.z - fz * 4;
      const gy = T ? T.getElevationAt(px, pz) : 0;
      if (S.y === null) S.y = v.y + 7;
      S.y += (v.y + 7 - S.y) * (1 - Math.exp(-dt * 10));
      py = Math.max(S.y, gy + 4);
      // đang khóa xe / ngắm điểm: tâm kính đặt vào điểm cần trúng (màu cho biết nòng đã khớp chưa); không thì vào điểm đạn rơi
      const Q = A || (L && !L.wall && L.d > 40 ? L : null);
      let want = Q ? Math.atan2(Q.y - py, Math.hypot(Q.x - px, Q.z - pz)) : (P.elevation || 0) * Math.PI / 180;
      // ngắm lên trời / khóa drone địch: kính ngóc theo nòng (tới ~60°)
      const AA = this._airAim;
      if (AA && AA.barrelEl !== undefined) want = Math.min(1.05, AA.barrelEl * Math.PI / 180);
      else want = Math.max(-0.26, Math.min(0.14, want));
      S.pitch += (want - S.pitch) * (1 - Math.exp(-dt * 8));
      S.mag += (S.magT - S.mag) * (1 - Math.exp(-dt * 8));
      const fov = 45 / S.mag;
      if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
      cam.position.set(px, py, pz);
      const cp = Math.cos(S.pitch);
      cam.lookAt(px + fx * cp * 100, py + Math.sin(S.pitch) * 100, pz + fz * cp * 100);
      this._camYaw = S.yaw;
      this._lodMag = S.mag;
      // thanh máu / khung khóa trên xe địch: kính phóng to N lần thì thu nhỏ lại cho khỏi che kín mục tiêu
      const kUI = 1 / Math.pow(S.mag, 0.7);
      for (const u of this.units) if (u !== P && u.hpGroup) u.hpGroup.scale.setScalar(kUI);
      if (this.lockReticle3D && this.lockReticle3D.visible) this.lockReticle3D.scale.multiplyScalar(kUI);
      this._viewFocus = { x: px + fx * 520, z: pz + fz * 520 };
      const fog = this.scene.fog;
      if (fog && fog.density !== undefined) { if (fog._baseD === undefined) fog._baseD = fog.density; fog.density = fog._baseD; }
      const sd = this.sunDir || new THREE.Vector3(-0.42, 0.82, -0.36);
      const half = 720;
      const sc = this.sunLight.shadow.camera;
      if (sc.right !== half) { sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half; sc.updateProjectionMatrix(); }
      const texel = (2 * half) / (this.sunLight.shadow.mapSize.width || 2048);
      const fX = Math.round((px + fx * 480) / texel) * texel, fZ = Math.round((pz + fz * 480) / texel) * texel;
      this.sunLight.position.set(fX + sd.x * 1300, py + sd.y * 1300, fZ + sd.z * 1300);
      this.sunLight.target.position.set(fX, py, fZ);
      range = (A || L) ? (A || L).d : null;
      S.rangeNote = null;
    }
    if (T && T.updateBuildingView) T.updateBuildingView(cam.position, P, dt);

    if (S.prof.kind === 'box' && S.ammo !== P.selectedAmmo) this.buildSightOverlay(P, S.prof);
    // chữ trên khung: hướng, độ phóng / độ cao, cự ly, trạng thái ngắm (màu theo trạng thái)
    const el = this._sightEl;
    if (el) {
      const st = this._aimState, wall = L && L.wall;
      const sk = S.prof.kind === 'box' && P.selectedAmmo === 'ANTI_TANK_MISSILE' && this._seeker ? this._seeker.state : null;   // kính dẫn tên lửa: màu theo đầu dò
      const col = S.rangeNote ? '#ff5a4a' : sk === 'locked' ? '#5cf08a' : sk === 'seeking' ? '#ffb020' : sk === 'blind' ? '#8899aa'
        : st === 'on' ? '#5cf08a' : (st === 'blocked' || st === 'covered' || wall) ? '#ff3b30' : st === 'slew' ? '#ffb020' : '#dff5d8';
      if (el._c !== col) { el._c = col; el.style.setProperty('--gs-c', col); }
      const hdg = String(Math.round(((-S.yaw * 180 / Math.PI) % 360 + 360) % 360)).padStart(3, '0') + '°';
      if (this._sightHdgEl.textContent !== hdg) this._sightHdgEl.textContent = hdg;
      const RR = S.arty ? this.artyRangeOf(P) : null;
      const m = S.arty ? 'VÙNG BẮN ' + Math.round(RR.min) + '–' + Math.round(RR.max) + ' M' : '×' + (Math.round(S.mag * 10) / 10);
      if (this._sightMagEl.textContent !== m) this._sightMagEl.textContent = m;
      const r = range !== null ? range.toLocaleString() + ' M' : '—';
      if (this._sightRangeEl.textContent !== r) this._sightRangeEl.textContent = r;
      const tr = this._lockTrack;
      const sTxt = (S.rth ? 'PIN YẾU — DRONE ĐANG BAY VỀ XE' : null) || S.rangeNote || (tr && tr.blind && st !== 'on' ? 'TRƯỚC MŨI XE — QUAY THÂN XE' : null) || (L && L.out && st !== 'on' ? 'ĐẠN BAY RA NGOÀI BẢN ĐỒ' : null) || (sk === 'locked' ? 'TÊN LỬA ĐÃ KHÓA' : sk === 'seeking' ? 'ĐẦU DÒ ĐANG BÁM' : sk === 'blind' ? 'KHÔNG NHÌN THẤY MỤC TIÊU' : st === 'on' ? 'ĐÃ NGẮM TRÚNG' : st === 'covered' ? 'BỊ CHE' : (st === 'blocked' || wall) ? 'BỊ CHẮN' : st === 'slew' ? 'ĐANG XOAY THÁP' : (S.arty ? 'NHẤP ĐỂ CHỌN ĐIỂM BẮN' : ''));
      if (this._sightStateEl.textContent !== sTxt) this._sightStateEl.textContent = sTxt;
      // vùng sát thương dự kiến của loại đạn đang nạp (cùng đơn vị với cự ly) + sức nổ ước tính tới xe đang khóa
      const BI = this._blastInfo;
      let bTxt = '';
      if (BI) {
        bTxt = (BI.cluster ? 'VÙNG RẢI ĐẠN CON ~' : 'VÙNG NỔ ') + BI.radius + ' M' + (BI.core ? ' · LÕI ' + BI.core + ' M' : '');
        if (BI.hitK !== null && BI.cluster) bTxt += BI.hitK > 0 ? ' · MỤC TIÊU TRONG VÙNG RẢI' : ' · MỤC TIÊU NGOÀI VÙNG RẢI';
        else if (BI.hitK !== null) bTxt += BI.hitK >= 0.99 ? ' · MỤC TIÊU TRONG LÕI' : BI.hitK > 0 ? ' · SỨC NỔ TỚI MỤC TIÊU ~' + Math.round(BI.hitK * 100) + '%' : ' · MỤC TIÊU NGOÀI VÙNG NỔ';
      }
      if (this._sightBlastEl && this._sightBlastEl.textContent !== bTxt) this._sightBlastEl.textContent = bTxt;
      // thông số drone (~6 lần/giây): độ cao trên mặt đất, cách xe mình, gió (hướng gió thổi tới, độ thật), ô lưới bản đồ
      const U = S.arty ? this._uavEl : null;
      if (U && (U.t -= dt) <= 0) {
        U.t = 0.16;
        const W = this.ballistics.wind || {};
        const set = (e, v) => { if (e && e.textContent !== v) e.textContent = v; };
        set(U.alt, (S.alt || 0) + ' M');
        set(U.dist, Math.round(Math.hypot(cam.position.x - P.x, cam.position.z - P.z)).toLocaleString() + ' M');
        set(U.wind, (W.speed !== undefined ? W.speed.toFixed(1) : '—') + ' · ' + String(Math.round(((W.direction || 0) % 360 + 360) % 360)).padStart(3, '0') + '°');
        const half = (T && T.width ? T.width : 3600) / 2, gx = Math.floor((S.cx + half) / 100), gz = Math.floor((S.cz + half) / 100);
        set(U.grid, 'Ô LƯỚI ' + String(gx).padStart(2, '0') + '-' + String(gz).padStart(2, '0'));
        // thanh pin UAV: 10 vạch + % + thời gian bay còn lại (bay treo); dưới 50% vàng, dưới 30% đỏ nhấp nháy
        const DR = this.droneState(), bs = Math.max(0, Math.round(DR.batt * ArtilleryGame3D.DRONE.flight));
        if (U.hull) {
          const hp = Math.round(Math.max(0, DR.hp === undefined ? 1 : DR.hp) * 100), cls = 'gs-hull' + (hp < 35 ? ' low' : hp < 70 ? ' mid' : '');
          set(U.hull, hp + '%');
          if (U.hull.className !== cls) U.hull.className = cls;
        }
        set(U.batt, Math.round(DR.batt * 100) + '% · ' + Math.floor(bs / 60) + ':' + String(bs % 60).padStart(2, '0'));
        if (U.bat) {
          const lv = DR.batt < ArtilleryGame3D.DRONE.warn[0] ? 'low' : DR.batt < 0.5 ? 'mid' : 'ok';
          if (U.bat._lv !== lv) { U.bat._lv = lv; U.bat.dataset.lv = lv; }
          const on = Math.ceil(DR.batt * 10 - 1e-6);
          U.segs.forEach((e, i) => { const v = i < on; if (e._on !== v) { e._on = v; e.classList.toggle('on', v); } });
        }
      }
    }
  }

  // BỎ VẼ CHI TIẾT NHỎ Ở XA theo cỡ trên màn hình: camera thấp nhìn tới chân trời thấy cả trận 10v10 + 3 cứ điểm,
  // mỗi bu-lông / đèn / móc kéo / ăng-ten ở xa chỉ còn 1-2 điểm ảnh nhưng vẫn tốn 1 lượt vẽ (và 1 lượt vẽ bóng).
  // Chi tiết có bán kính < ~0.6% khoảng cách tới camera được chuyển sang layer 1 (camera chỉ vẽ layer 0) —
  // không đụng .visible mà logic xe / hư hại / cứ điểm đang dùng. Thân, tháp, nòng, mảng lớn vẫn vẽ đủ.
  // Mesh instanced của xe (mắt xích, bánh, bu-lông) không tự cắt theo khung nhìn (frustumCulled = false):
  // xe nằm ngoài màn hình (hoặc rất xa) thì tắt hẳn — kiểm tra mỗi khung hình vì camera xoay nhanh.
  updateUnitLOD(dt) {
    const cam = this.camera, cp = cam.position, v = new THREE.Vector3();
    const setHidden = (o, h) => { if (o._lodH !== h) { o._lodH = h; o.layers.set(h ? 1 : 0); } };
    const radiusOf = (o) => {
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      o.getWorldScale(v);
      return o.geometry.boundingSphere.radius * Math.max(v.x, v.y, v.z);
    };
    cam.updateMatrixWorld();
    const L = this._lodTmp || (this._lodTmp = { fr: new THREE.Frustum(), m: new THREE.Matrix4(), s: new THREE.Sphere() });
    L.fr.setFromProjectionMatrix(L.m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    for (const u of this.units) {
      if (!u.group) continue;
      if (u._lodGroup !== u.group) {
        u._lodGroup = u.group;
        u._lodParts = [];
        u._lodInst = [];
        u.group.traverse(o => {
          if (!o.isMesh || !o.geometry || o === u.hpBarMesh || o === u.hpBgMesh) return;
          for (let a = o.parent; a; a = a.parent) if (a === u.hpGroup) return;
          if (o.isInstancedMesh) { u._lodInst.push(o); return; }
          const r = radiusOf(o);
          if (r < 14) u._lodParts.push({ o, r });
        });
      }
      const d = u === this.player ? 0 : Math.hypot(u.x - cp.x, (u.y || 0) - cp.y, u.z - cp.z);
      L.s.center.set(u.x, (u.y || 0) + 15, u.z); L.s.radius = 80;
      const instOff = u !== this.player && (d > 1800 * (this._lodMag || 1) || !L.fr.intersectsSphere(L.s));
      for (const o of u._lodInst) setHidden(o, instOff);
      u._lodD = d;
    }
    this._lodT = (this._lodT || 0) - dt;
    if (this._lodT > 0) return;
    this._lodT = 0.25;
    const K = 0.0062 / (this._lodMag || 1);   // kính ngắm phóng to N lần: chi tiết xa to gấp N trên màn hình
    for (const u of this.units) if (u._lodParts) for (const P of u._lodParts) setHidden(P.o, P.r < K * (u._lodD || 0));
    // Công trình tĩnh (cứ điểm, boong-ke): dựng danh sách 1 lần cho mỗi bản đồ
    const T = this.terrain;
    if (T && T.group) {
      if (this._lodStaticFor !== T.map) {
        this._lodStaticFor = T.map;
        this._lodStatic = [];
        for (const grp of T.group.children) {
          if (grp.name !== 'strongholds' && grp.name !== 'bunkers') continue;
          grp.updateMatrixWorld(true);
          grp.traverse(o => {
            if (!o.isMesh || o.isInstancedMesh || !o.geometry) return;
            const r = radiusOf(o);
            if (r < 14) this._lodStatic.push({ o, r, c: o.geometry.boundingSphere.center.clone().applyMatrix4(o.matrixWorld) });
          });
        }
      }
      for (const P of this._lodStatic) setHidden(P.o, P.r < K * P.c.distanceTo(cp));
    }
  }

  // VÒNG TẢN MÁT quanh điểm ngắm: ~9/10 phát rơi trong vòng. Nở to khi xe chạy / tháp đang quay / vừa bắn,
  // co lại khi đứng yên ngắm lâu (dispersion.js). Lựu pháo bắn cầu vồng: hình bầu dục dài theo hướng bắn.
  updateSpreadRing(dt, at, col) {
    const P = this.player;
    if (!P || typeof Dispersion === 'undefined' || !at) return;
    if (!this.spreadRing) {
      const geo = new THREE.RingGeometry(0.88, 1, 72);
      geo.rotateX(-Math.PI / 2);
      this.spreadRingMat = new THREE.MeshBasicMaterial({ color: 0xffb700, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false, depthTest: false });
      this.spreadRing = new THREE.Mesh(geo, this.spreadRingMat);
      this.spreadRing.renderOrder = 3;
      this.scene.add(this.spreadRing);
      this._spreadR = null;
    }
    const dist = Math.max(1, Math.hypot(at.x - P.x, at.z - P.z));
    const R = Dispersion.ring(P, dist, P.selectedAmmo, P.elevation);
    // lựu pháo bắn cầu vồng: vùng rơi tính từ độ nhạy của chính đường đạn (khớp với các phát bắn thật rải ra);
    // tính lại ~4 lần/giây, giữa các lần chỉ nhân theo hệ số trạng thái xe hiện tại (chạy / quay tháp / vừa bắn)
    if (R.lob && this.ballistics.impactSpread) {
      const C = this._spreadCalc || (this._spreadCalc = { t: 0, E: null, mul: 1 });
      C.t -= dt;
      if (C.t <= 0) {
        C.t = 0.25;
        const sg = Dispersion.sigma(P, P.selectedAmmo, P.elevation, dist);
        C.E = this.ballistics.impactSpread(P, this.terrain, sg);
        C.mul = sg.mul;
      }
      if (C.E) { const k = R.mul / (C.mul || 1); R.along = 2 * C.E.along * k; R.cross = 2 * C.E.cross * k; }
    }
    const want = { a: Math.max(5, R.along), c: Math.max(5, R.cross) };
    const S = this._spreadR || (this._spreadR = { a: want.a, c: want.c });
    const k = Math.min(1, dt * 8);
    S.a += (want.a - S.a) * k; S.c += (want.c - S.c) * k;
    const ring = this.spreadRing;
    ring.position.set(at.x, at.y - 0.6, at.z);
    ring.rotation.y = Math.PI - (P.azimuth || 0) * Math.PI / 180;   // trục z cục bộ = hướng bắn
    ring.scale.set(S.c, 1, S.a);
    this.spreadRingMat.color.setHex(col);
    // vòng càng to (kém chụm) càng mờ đi một chút để không che chiến trường
    this.spreadRingMat.opacity = Math.max(0.28, Math.min(0.6, 0.6 - (R.mul - 1) * 0.12));
    ring.visible = true;
  }

  // VÙNG SÁT THƯƠNG DỰ KIẾN quanh điểm rơi, theo loại đạn đang nạp (cùng bảng bán kính với sát thương thật —
  // BallisticsSystem3D.blastProfile): vòng ngoài = bán kính nổ lan tối đa, đĩa trong = vùng lõi chịu trọn sức nổ.
  // Đạn chùm: vùng rải đạn con (elip theo hướng bắn, tính từ điểm đạn mẹ tách vỏ) + bán kính nổ mỗi đạn con.
  // Đang khóa xe / ngắm điểm: ước lượng sức nổ tới mục tiêu nếu đạn rơi đúng điểm dự kiến (this._blastInfo -> kính ngắm).
  updateBlastZone(dt, at, fp = null, tgt = null) {
    const P = this.player;
    let Z = this._blastZone;
    if (!at || !P || typeof BallisticsSystem3D === 'undefined' || !BallisticsSystem3D.blastProfile) {
      if (Z) Z.visible = false;
      this._blastInfo = null;
      return;
    }
    if (!Z || Z.parent !== this.scene) {
      Z = this._blastZone = new THREE.Group();
      const outer = new THREE.RingGeometry(0.965, 1, 96); outer.rotateX(-Math.PI / 2);
      const disc = new THREE.CircleGeometry(1, 64); disc.rotateX(-Math.PI / 2);
      const mk = (geo, op) => {
        const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xff6a3d, transparent: true, opacity: op, side: THREE.DoubleSide, depthWrite: false, depthTest: false }));
        m.renderOrder = 2; m.frustumCulled = false; Z.add(m); return m;
      };
      Z.userData = { outer: mk(outer, 0.55), fill: mk(disc, 0.07), core: mk(disc, 0.16) };
      this.scene.add(Z);
    }
    const U = Z.userData;
    // loại đạn sẽ bắn ra (như spg.fire): xe pháo HE / CLUSTER / AP, xe 6 nòng & trinh sát đạn liên thanh / tên lửa
    const ammo = P.selectedAmmo || 'NORMAL', heavy = P.tankType === 'ARTILLERY';
    const fire = heavy ? (ammo === 'CLUSTER' || ammo === 'AP' ? ammo : 'HE')
      : P.tankType === 'GATLING' ? (ammo === 'INCENDIARY' ? 'INCENDIARY' : 'GATLING_BULLET')
      : P.tankType === 'SCOUT' ? (ammo === 'INCENDIARY' || ammo === 'ANTI_TANK_MISSILE' ? ammo : 'SCOUT_BULLET') : ammo;
    const BP = BallisticsSystem3D.blastProfile(fire, heavy);
    if (BP.radius < 20 && fire !== 'CLUSTER') { Z.visible = false; this._blastInfo = null; return; }   // đạn súng: mảnh văng sát điểm chạm
    let cx = at.x, cz = at.z, ra = BP.radius, rc = BP.radius, core = BP.core, yaw = Math.PI - (P.azimuth || 0) * Math.PI / 180;
    if (fire === 'CLUSTER' && fp) {
      // vùng rải đạn con (elip theo hướng bắn) + bán kính nổ mỗi đạn con
      const SR = BallisticsSystem3D.blastProfile('CLUSTER_SUBMUNITION', heavy).radius;
      cx = fp.x; cz = fp.z; ra = fp.along + SR; rc = fp.cross + SR; core = 0; yaw = fp.yaw;
    }
    const y = this.terrain ? this.terrain.getElevationAt(cx, cz) : at.y;
    Z.position.set(cx, y + 0.8, cz);
    Z.rotation.y = yaw;
    U.outer.scale.set(rc, 1, ra); U.fill.scale.set(rc, 1, ra);
    U.core.visible = core > 0;
    if (core > 0) U.core.scale.set(core, 1, core);
    Z.visible = true;
    // sức nổ ước tính tới mục tiêu đang ngắm (1 = trọn sức nổ ở lõi); xe đứng ngoài vòng: 0
    let hitK = null;
    if (tgt && !tgt.isDead && tgt.id !== undefined && tgt !== this._aimPoint) {
      const dx = tgt.x - cx, dz = tgt.z - cz;
      if (fire === 'CLUSTER') {
        // trong elip vùng rải đạn con: 1, ngoài: 0
        const al = dx * Math.sin(yaw) + dz * Math.cos(yaw), cr = dx * Math.cos(yaw) - dz * Math.sin(yaw);
        hitK = (al / ra) * (al / ra) + (cr / rc) * (cr / rc) <= 1 ? 1 : 0;
      } else hitK = this.blastFalloff(Math.hypot(dx, dz), BP.core, BP.radius);
    }
    this._blastInfo = { radius: Math.round(Math.max(ra, rc)), core: Math.round(core), cluster: fire === 'CLUSTER', hitK };
  }

  loop(currentTime) {
    const now = typeof currentTime === 'number' && !isNaN(currentTime) ? currentTime : performance.now();
    const frameMs = now - (this.lastTime || now);
    const dt = Math.min(Math.max(0, frameMs / 1000), 0.1);
    this.lastTime = now;
    this._lastLoopAt = performance.now();
    if (typeof GfxQuality !== 'undefined') GfxQuality.update(frameMs, this.isGameStarted && !this.isGameOver);

    // Lên lịch khung sau TRƯỚC: một lỗi bất ngờ trong 1 khung hình không được làm chết cả vòng lặp
    // (chơi mạng: máy đứng hẳn = lệch toàn bộ trận so với các máy khác)
    requestAnimationFrame((t) => this.loop(t));
    try {
      this.update(dt);
      this.render();
    } catch (e) {
      this._loopErrN = (this._loopErrN || 0) + 1;
      if (this._loopErrN <= 3 || this._loopErrN % 300 === 0) console.error('[GAME] Lỗi trong khung hình (vòng lặp vẫn chạy tiếp):', e);
    }
  }

  // Chơi mạng: tab bị ẩn (chuyển cửa sổ / thu nhỏ) thì trình duyệt ngừng requestAnimationFrame -> nếu là chủ phòng,
  // cả trận đứng (bot, hòm, sát thương không gửi). Bộ đếm nhịp trong Web Worker (không bị hãm như tab nền)
  // chạy tiếp phần logic 20 lần / giây, bỏ phần vẽ.
  startBackgroundTicker() {
    if (this._bgTicker || typeof Worker === 'undefined' || typeof Blob === 'undefined') return;
    try {
      const url = URL.createObjectURL(new Blob(['setInterval(function(){postMessage(0)},50)'], { type: 'application/javascript' }));
      this._bgTicker = new Worker(url);
      this._bgTicker.onmessage = () => {
        if (!document.hidden || !this.netSync || this.netSync.detached) return;
        const now = performance.now();
        if (now - (this._lastLoopAt || 0) < 150) return;   // rAF vẫn chạy: không làm gì
        const dt = Math.min(Math.max(0, (now - (this.lastTime || now)) / 1000), 0.1);
        this.lastTime = now;
        this._lastLoopAt = now;
        try { this.update(dt); } catch (e) { console.warn('[NET] Lỗi nhịp nền', e); }
      };
    } catch (e) { this._bgTicker = null; }
  }

  update(dt) {
    if (this.isGameOver) return;

    // Khi đang ở sảnh chờ ghép trận: Xoay nhẹ góc camera toàn cảnh sa mạc làm hình nền động tuyệt đẹp
    if (!this.isGameStarted) {
      this.bgAngle = (this.bgAngle || 0) + dt * 0.08;
      const camR = 750;
      this.camera.position.x = Math.sin(this.bgAngle) * camR;
      this.camera.position.y = 520;
      this.camera.position.z = Math.cos(this.bgAngle) * camR;
      this.camera.lookAt(0, 30, 0);
      return;
    }

    // 1. ĐIỀU KHIỂN XE VÀ NÒNG PHÁO
    if (this.player && !this.player.isDead) {
      // 1.1. ĐIỀU KHIỂN THÁP PHÁO BẰNG PHÍM MŨI TÊN (ngắm tay dự phòng — ngắm chính bằng chuột / TAB, nòng tự tính góc)
      let turretChanged = false;
      // Xoay tay bằng phím mũi tên cũng bị giới hạn bởi tốc độ quay tháp / nâng nòng thật của từng xe
      const TRm = this.player.turretRates ? this.player.turretRates() : { traverse: 42, elevate: 24 };
      const turretRotSpeed = TRm.traverse;
      const turretElevSpeed = TRm.elevate;

      // ←: Xoay tháp sang trái
      if (this.keys['ArrowLeft']) {
        this.player.azimuth = (this.player.azimuth - turretRotSpeed * dt + 360) % 360;
        turretChanged = true;
      }
      // →: Xoay tháp sang phải
      if (this.keys['ArrowRight']) {
        this.player.azimuth = (this.player.azimuth + turretRotSpeed * dt) % 360;
        turretChanged = true;
      }
      // ↑: Nâng nòng (xe 6 nòng: máy tính hỏa lực tự nâng nòng)
      if (this.keys['ArrowUp']) {
        if (this.player.canElevate === false || this.player.tankType === 'GATLING') {
          this.showGatlingFixedBarrelNotice();
        } else {
          const elMax = this.ballistics.maxElevationFor ? this.ballistics.maxElevationFor(this.player) : 85;
          this.player.elevation = Math.min(elMax, this.player.elevation + turretElevSpeed * dt);
          turretChanged = true;
        }
      }
      // ↓: Hạ nòng
      if (this.keys['ArrowDown']) {
        if (this.player.canElevate === false || this.player.tankType === 'GATLING') {
          this.showGatlingFixedBarrelNotice();
        } else {
          this.player.elevation = Math.max(-10, this.player.elevation - turretElevSpeed * dt);
          turretChanged = true;
        }
      }

      if (turretChanged) {
        // tự xoay bằng phím: hủy lệnh ngắm đang quay dở và điểm ngắm mặt đất
        this.player.aimAz = this.player.aimEl = undefined;
        this._aimPoint = null;
        this.syncHUDControls();
        // Đang khóa mục tiêu mà người chơi tự xoay nòng: chuyển sang NGẮM TAY, tháp không bị kéo về mục tiêu nữa
        // (khung khóa vẫn giữ để theo dõi địch; bấm TAB để tháp bám lại mục tiêu)
        if (this.lockedTarget && !this._manualAim) {
          this._manualAim = true;
          this.addCombatLog('[[crosshair]] NGẮM TAY — tháp ngừng bám mục tiêu. Bấm [TAB] để bám lại.', 'tip');
          this.updateTargetLockUI();
        }
      }

      // 1.1.a. TỰ ĐỘNG BÁM MỤC TIÊU & TỰ ĐỘNG KHÓA KHI CÓ ĐỊCH Ở GẦN
      // Chỉ khóa / bám được xe địch mà mình đang biết vị trí (tự nhìn thấy, radar của mình, hoặc đồng đội trinh sát báo)
      // Xe 6 nòng / trinh sát đang ngắm lên trời / khóa drone địch: máy tính hỏa lực bám drone, không tự khóa xe
      if (this._airAim && this.updatePlayerAirAim(dt, turretChanged)) {
        if (this.lockReticle3D) this.lockReticle3D.visible = false;
      } else if (this.lockedTarget) {
        if (this.lockedTarget.isDead) {
          // Xe mục tiêu bị hạ: tự tìm xe địch gần nhất còn sống (và đang thấy được) khác
          const next = this.nearestKnownEnemy(this.lockRangeFor(this.player));
          this.setLockedTarget(next || null);
        } else {
          const T = this.lockedTarget;
          const dist = Math.hypot(T.x - this.player.x, T.z - this.player.z);
          const known = this.canTarget(T);
          this._lockLostT = known ? 0 : (this._lockLostT || 0) + dt;
          if (dist > this.lockRangeFor(this.player)) {
            this.addCombatLog('[[alert-triangle]] Mục tiêu đã vượt quá cự ly ngắm bắn, đã hủy khóa!', 'alert');
            this.setLockedTarget(null);
          } else if (typeof Equipment !== 'undefined' && Equipment.lockBlocked && Equipment.lockBlocked(T, this.player.team)) {
            this.addCombatLog('[[lock-off]] MẤT KHÓA — địch phóng khói đa phổ, kính ngắm nhiệt & laser đo xa bị mù. Không khóa lại được tới khi khói tan!', 'alert');
            if (window.soundEngine && window.soundEngine.playTargetLost) window.soundEngine.playTargetLost();
            this.setLockedTarget(null);
          } else if (this._lockLostT > 1.5) {
            this.addCombatLog('[[radar-2]] MẤT DẤU MỤC TIÊU — địch đã khuất tầm nhìn / núp bụi, không còn ai báo vị trí. Đã hủy khóa!', 'alert');
            this.setLockedTarget(null);
          } else {
            // Tự động xoay tháp bám mục tiêu (có tính đón đầu xe đang chạy) nếu người chơi không bấm phím mũi tên
            if (!turretChanged && !this._manualAim) {
              // bám mục tiêu với đúng tốc độ quay tháp / nâng nòng của xe
              const TR = this.player.turretRates ? this.player.turretRates() : { traverse: turretRotSpeed, elevate: turretElevSpeed };
              this.player.aimAz = this.player.aimEl = undefined;
              this.trackLockedTarget(dt, TR.traverse, TR.elevate);
            }

            // Khung khóa: 4 góc ngoặc ôm xe địch (thu lại + xoay khi vừa khóa)
            if (this.lockReticle3D) WorldMarkers.tickLock(this.lockReticle3D, T, dt, this.camera);
            this.updateTargetLockUI();
          }
        }
      } else if (this._aimPoint) {
        // Đang ngắm một điểm trên mặt đất: tháp quay / nòng tự nâng hạ theo nghiệm đường đạn tới đúng điểm đó
        if (this.lockReticle3D) this.lockReticle3D.visible = false;
        if (!turretChanged) {
          const TR = this.player.turretRates ? this.player.turretRates() : { traverse: turretRotSpeed, elevate: turretElevSpeed };
          this.trackLockedTarget(dt, TR.traverse, TR.elevate, this._aimPoint);
        }
      } else {
        // Chưa khóa: tự động khóa khi có xe địch áp sát gần (bán kính <= 360m) mà mình nhìn thấy
        this.autoLockCooldown = Math.max(0, (this.autoLockCooldown || 0) - dt);
        if (this.autoLockCooldown <= 0) {
          const closest = this.nearestKnownEnemy(360);
          if (closest) {
            this.autoLockCooldown = 2.5;
            this.setLockedTarget(closest, false);
          } else {
            if (this.lockReticle3D) this.lockReticle3D.visible = false;
          }
        }
      }

      // 1.1.b. ĐIỀU KHIỂN BẮN LIÊN THANH CỦA XE 6 NÒNG (GATLING) VÀ XE TRINH SÁT (SCOUT)
      if (this.player.tankType === 'GATLING' || this.player.tankType === 'SCOUT') {
        // đang chọn ô tên lửa: Space chỉ để phóng tên lửa, không xả súng máy
        const missileSel = this.player.tankType === 'SCOUT' && this.player.selectedAmmo === 'ANTI_TANK_MISSILE';
        const wantFire = !missileSel && !!(this.keys['Space'] || this.isPointerFiring);
        const nfz = wantFire && this.inNoFireZone();
        if (nfz) this.noFireWarn();
        this.player.isFiringGatling = wantFire && !nfz;
      }

      // 1.2. LÁI XE CƠ ĐỘNG theo thân xe như xe thật: W / S ga tiến / lùi, A / D đánh lái trái / phải
      // (xe xích: A / D xoay tại chỗ; xe bánh lốp: A / D chỉ bẻ bánh, phải có ga mới cua được)
      const fwdIn = (this.keys['KeyW'] ? 1 : 0) - (this.keys['KeyS'] ? 1 : 0);
      const turnIn = (this.keys['KeyD'] ? 1 : 0) - (this.keys['KeyA'] ? 1 : 0);

      const isBoost = !!(this.keys['ShiftLeft'] || this.keys['ShiftRight']);
      if (this.autoDrive && (fwdIn || turnIn)) {
        // Người chơi tự cầm lái: hủy lái tự động
        this.setAutoDriveTarget(null);
        this.addCombatLog('[[route]] Đã hủy lái tự động — chuyển sang tự lái', 'tip');
      }
      if (this.autoDrive) this.updateAutoDrive(dt, isBoost);
      else this.player.move(fwdIn, turnIn, dt, isBoost);

      if (window.soundEngine) {
        const speedRatio = Math.abs(this.player.speed) / this.player.baseMaxSpeed;
        // Tiếng máy theo đúng loại xe + tình trạng hư hại (máy hư bỏ nổ, xích đứt, lốp xịt)
        const D = this.player.dmg;
        const cnt = o => (o ? Object.keys(o).filter(k => o[k]).length : 0);
        // Tốc độ xoay thân xe (để có tiếng xích rít khi quay gắt / quay đầu tại chỗ)
        const ba = this.player.bodyAngle || 0;
        let dBody = this._sndBodyAngle === undefined ? 0 : ba - this._sndBodyAngle;
        while (dBody > Math.PI) dBody -= Math.PI * 2;
        while (dBody < -Math.PI) dBody += Math.PI * 2;
        if (Math.abs(dBody) > 0.5) dBody = 0;
        this._sndBodyAngle = ba;
        window.soundEngine.updateEngine(speedRatio, isBoost, this.player.engineLoad || 1.0, {
          turn: dt > 0 ? dBody / dt : 0,
          tankType: this.player.tankType,
          engineDmg: D ? D.engine || 0 : 0,
          tracksBroken: D && D.trackTimer ? (D.trackTimer[0] > 0 ? 1 : 0) + (D.trackTimer[1] > 0 ? 1 : 0) : 0,
          flatTires: D ? cnt(D.flat) + cnt(D.gone) : 0,
          stall: !!this.player.climbStall,   // dốc quá cao, xe không leo nổi: máy gồng hết cỡ
          turbo: typeof Equipment !== 'undefined' && Equipment.has(this.player, 'turbo')   // động cơ tăng áp: turbo rít to, có van xả áp
        });
        // Tiếng lội nước theo độ sâu & tốc độ thật (src/core/audio/wading.js)
        if (window.soundEngine.updateWading) {
          window.soundEngine.updateWading(this.player.waterDepth || 0, speedRatio, { dead: this.player.isDead });
        }
        // Mô-tơ quay tháp: theo tốc độ người chơi xoay HƯỚNG NGẮM (tháp trong hệ toạ độ thế giới). Không tính phần bộ ổn định
        // quay bù khi thân xe xoay: thân xe trong game xoay tới ~166°/s nên phần bù đó làm mô-tơ rít hết cỡ mỗi lần đánh lái
        // Dùng azimuth (hướng tháp trong thế giới, tháp kẹt thì spg.js ghi ngược hướng thật về đây). Không cộng _turretYaw + bodyAngle:
        // ở chỗ này bodyAngle đã đổi theo khung hình mới còn _turretYaw vẫn của khung trước -> đánh lái sinh tốc độ quay ảo làm mô-tơ kêu
        if (window.soundEngine.updateTurretDrive && this.player._turretYaw !== undefined) {
          const ty = -(this.player.azimuth || 0) * Math.PI / 180;
          let dy = this._sndTurretYaw === undefined ? 0 : ty - this._sndTurretYaw;
          while (dy > Math.PI) dy -= Math.PI * 2;
          while (dy < -Math.PI) dy += Math.PI * 2;
          if (Math.abs(dy) > 0.5) dy = 0;   // nhảy hướng đột ngột (hồi sinh / đổi xe) không phải tháp đang quay
          this._sndTurretYaw = ty;
          window.soundEngine.updateTurretDrive(dt > 0 ? dy / dt : 0, this.player.tankType, !!(D && D.traverse < 0.999));
        }
        // Bơm nâng hạ nòng: theo góc nòng so với thân xe, đã trừ phần bộ ổn định tự bù khi thân xe chồm / nghiêng theo địa hình
        if (window.soundEngine.updateElevationDrive) {
          const se = window.soundEngine;
          se.updateElevationDrive(se.elevationRate(this._sndElev || (this._sndElev = {}), this.player, dt), this.player.tankType);
        }
      }

      // ĐỒNG BỘ MULTIPLAYER: do NetGameSync gửi gộp lô + lượng tử hóa ~20Hz (xem netSync.preUpdate bên dưới)
    }

    // [NET] Gửi gói trạng thái định kỳ + đặt tư thế nội suy cho xe từ xa / bot do máy khác điều khiển
    if (this.netSync) this.netSync.preUpdate(dt);

    // 2. Cập nhật các xe pháo 3D
    this.units.forEach(unit => {
      unit.update(dt, this.terrain, this.ballistics, this.radar, this.zone, this.units, this.airdrop, this.supplyCrates, this.capturePoints);
    });

    // [NET] Ghi đè lại tư thế nội suy (update() tự tích phân vận tốc cho mọi xe)
    if (this.netSync) this.netSync.postUpdate(dt);

    // 2.1. CẬP NHẬT CƠ CHẾ NÚP BỤI NGỤY TRANG (BUSH STEALTH & CAMOUFLAGE)
    this.units.forEach(unit => {
      if (unit.isDead) return;
      const prevInBush = !!unit.isInBush;
      unit.isInBush = this.terrain.isPositionInBush(unit.x, unit.z);
      // mật độ rừng quanh xe (rừng rậm -> khó bị phát hiện từ xa)
      unit.forestDens = this.terrain.forestDensityAt ? this.terrain.forestDensityAt(unit.x, unit.z) : 0;
      if (unit.revealTimer > 0) {
        unit.revealTimer = Math.max(0, unit.revealTimer - dt);
      }

      // Nếu người chơi vừa lái xe tiến vào bụi rậm: phát âm thanh lá cây xào xạc
      if (unit.isPlayer && !prevInBush && unit.isInBush) {
        if (window.soundEngine && typeof window.soundEngine.playBushRustle === 'function') {
          window.soundEngine.playBushRustle();
        }
      }

      // Cập nhật hiệu ứng mờ bán trong suốt khi ẩn nấp
      if (typeof unit.updateStealthVisual === 'function') {
        unit.updateStealthVisual(dt);
      }

      if (unit.isPlayer) {
        // Xe người chơi: Luôn hiển thị cho chính mình (nhưng thân xe mờ bán trong suốt khi ở trong bụi)
        unit.group.visible = true;
      }
    });

    // 2.2. TÌNH BÁO CHIẾN TRƯỜNG: tầm nhìn từng xe, radar quay của xe trinh sát, báo vị trí cho đồng đội
    if (typeof TeamIntel !== 'undefined') {
      TeamIntel.update(dt, this.units, this.player, this.lockedTarget);
    }
    this.updateMissileSeeker(dt);
    this.updateThreatWarnings(dt);
    const myTeam = this.player ? this.player.team : 'BLUE';
    this.units.forEach(unit => {
      if (unit.isPlayer) return;
      if (unit.isDead) {
        // Xe địch bị hạ lúc đang khuất tầm: xác xe hiện ra (một lần, sau đó vòng đời xác xe tự quản)
        if (unit.isHiddenFromPlayer) { unit.isHiddenFromPlayer = false; unit.group.visible = true; }
        return;
      }
      if (unit.team === myTeam) {
        // Xe đồng minh: Luôn hiển thị (ở trạng thái mờ nếu núp bụi)
        unit.group.visible = true;
        unit.isHiddenFromPlayer = false;
        return;
      }
      // XE ĐỊCH: chỉ hiện khi xe mình nhìn thấy (trong tầm nhìn, không núp bụi), radar trinh sát của mình bắt được,
      // hoặc đồng đội trinh sát đang báo vị trí. Địch núp bụi chỉ bị nhìn thấy ở cự ly gần (TeamIntel.BUSH_SPOT).
      const known = (typeof TeamIntel !== 'undefined' && this.player)
        ? TeamIntel.knows(this.player, unit)
        : !(unit.isInBush && unit.revealTimer <= 0) || (this.player && Math.hypot(unit.x - this.player.x, unit.z - this.player.z) <= 260);
      unit.group.visible = known;
      unit.isHiddenFromPlayer = !known;
    });
    // Tiếng máy các xe khác (đồng đội, địch, bot, người chơi mạng): CHỈ xe mà mình thực sự có vị trí — đồng đội, địch
    // đang bị phát hiện, không bị máy chủ giấu (server_auth) — để tiếng máy không làm lộ xe địch đang khuất tầm nhìn
    if (window.soundEngine && window.soundEngine.updateOtherEngines && this.player) {
      const others = this._sndOthers || (this._sndOthers = []);
      others.length = 0;
      this.units.forEach(unit => {
        if (unit === this.player || unit.isPlayer || unit.isDead || unit._netHidden || unit.isHiddenFromPlayer) return;
        const ba = unit.bodyAngle || 0;
        let db = unit._sndBodyAngle === undefined ? 0 : ba - unit._sndBodyAngle;
        while (db > Math.PI) db -= Math.PI * 2;
        while (db < -Math.PI) db += Math.PI * 2;
        if (Math.abs(db) > 0.5) db = 0;
        unit._sndBodyAngle = ba;
        others.push({
          id: unit.id, x: unit.x, z: unit.z, type: unit.tankType,
          sr: Math.abs(unit.speed || 0) / (unit.baseMaxSpeed || 1),
          turn: dt > 0 ? db / dt : 0,
          dmg: unit.dmg ? unit.dmg.engine || 0 : 0
        });
      });
      window.soundEngine.updateOtherEngines(others);
    }
    this.updateSpotMarkers(dt);

    // Cập nhật Hòm Tiếp Tế Chiến Thuật thả dù
    this.updateAirdrop(dt);
    // Cập nhật các Hòm Tiếp Tế rải rác trên bản đồ
    this.updateSupplyCrates(dt);
    // Cập nhật 3 Cứ Điểm Chiến Lược A, B, C
    this.updateCapturePoints(dt);
    // Cứ điểm bê tông: làm mờ mái khi xe mình nằm trong khoang
    if (this.terrain && this.terrain.strongholdSet) {
      const sight = (typeof TeamIntel !== 'undefined' && this.player && TeamIntel.sightRange) ? TeamIntel.sightRange(this.player) : 520;
      this.terrain.strongholdSet.updateCutaway(this.player, dt, this.units, { sight, all: !!this.strongholdXray });
      // Chiếm cứ điểm: phe nào đứng giữ khoang thì kéo cờ phe đó lên nắp hầm
      this.terrain.strongholdSet.updateCapture(this.units, dt);
    }
    // Cỏ 3D & đá vụn: rải lại quanh tâm vùng camera nhìn thấy
    // Cài đặt đồ họa (GameMenu): bóng đổ / cỏ 3D có thể tắt cho máy yếu
    if (this.sunLight) this.sunLight.castShadow = this.gfxShadows !== false;
    const gc = this.terrain && this.terrain.groundCover;
    if (gc) {
      if (gc.group) gc.group.visible = this.gfxGrass !== false;
      // tâm vùng mặt đất camera nhìn thấy rõ (camera bám đuôi: phía trước xe theo hướng nhìn)
      const vf = this._viewFocus;
      if (this.gfxGrass !== false) gc.update(vf ? vf.x : this.camera.position.x, vf ? vf.z : this.camera.position.z - 380);
    }

    // Cập nhật hàng chờ hồi sinh của các xe thuộc 2 phe
    this.updateRespawnQueue(dt);
    if (typeof Equipment !== 'undefined' && Equipment.update) Equipment.update(dt, this);

    // Xe mình bị hạ: máy tắt lịm, mô-tơ tháp dừng
    if (this.player && this.player.isDead && window.soundEngine && window.soundEngine.updateEngine) {
      window.soundEngine.updateEngine(0, false, 1, { dead: true });
      if (window.soundEngine.updateTurretDrive) window.soundEngine.updateTurretDrive(0, this.player.tankType);
      if (window.soundEngine.updateElevationDrive) window.soundEngine.updateElevationDrive(0, this.player.tankType);
    }

    // 3. Cập nhật đạn pháo 3D & kiểm tra tiếng rít đạn lao xuống + cảnh báo né đạn
    let hasIncomingDanger = false;
    if (this.player && this.ballistics.activeShells.length > 0) {
      for (const s of this.ballistics.activeShells) {
        // Đạn bắn thẳng bay sượt qua gần xe mình: nghe tiếng "chát" siêu thanh + xé gió đúng lúc đạn vượt qua
        if (!s.flybyDone && s.shooterId !== this.player.id && !this.player.isDead && s.timeAlive > 0.08 && window.soundEngine && window.soundEngine.playFlyby) {
          const at = s.ammoType;
          const kind = at === 'SCOUT_BULLET' ? 'mg' : (at === 'GATLING_BULLET' || at === 'INCENDIARY') ? 'cannon30'
            : (at === 'RPG' || at === 'ANTI_TANK_MISSILE') ? 'missile' : (s.isDirectFire ? 'shell' : null);
          if (!kind) s.flybyDone = true;   // đạn cầu vồng đã có tiếng rít lao xuống
          else {
            const dH = Math.hypot(s.x - this.player.x, s.z - this.player.z);
            const prev = s._flyPrev;
            s._flyPrev = dH;
            if (prev !== undefined) {
              if (dH < prev) s._flyIn = true;   // đang lao lại gần
              else if (s._flyIn) {
                // vừa vượt qua điểm gần xe mình nhất
                s.flybyDone = true;
                const R = kind === 'mg' ? 45 : kind === 'cannon30' ? 55 : kind === 'missile' ? 110 : 90;
                // (đang xem qua drone: tai nghe ở micro drone, không nghe đạn rít qua xe)
                if (prev < R && Math.abs(s.y - (this.player.y || 0)) < 90 && !(this._sight && this._sight.arty)) window.soundEngine.playFlyby(kind, prev, { x: s.x, z: s.z });
              } else s.flybyDone = true;        // bay ra xa ngay từ đầu (đạn đồng đội bắn cạnh mình)
            }
          }
        }
        // Đạn pháo đang rơi xuống: dự đoán thời điểm & điểm chạm đất, bắt đầu tiếng rít ~1.5-2.5 s trước
        // để tiếng xé gió dày dần và tắt đúng lúc nổ (bỏ qua đạn súng, tên lửa, đạn bắn thẳng)
        if (!s.whistled && s.vy < 0 && !s.isDirectFire && s.ammoType !== 'CLUSTER_SUBMUNITION' && this.ballistics.isGunRound && this.ballistics.isGunRound(s.ammoType)) {
          const B = this.ballistics, mult = B.bulletSpeedMultiplier || 1;
          const gr = s.g !== undefined ? s.g : B.gravityFor(s.ammoType, s.isDirectFire);   // trọng lực riêng của phát bắn (lựu pháo thu nhỏ theo tỉ lệ riêng)
          // Đạn chùm tách vỏ ở ~165 đơn vị trên mặt đất (ballistics.js): canh tiếng rít tới lúc tách vỏ, không phải lúc chạm đất
          const h = s.ammoType === 'CLUSTER' && this.terrain
            ? s.y - (this.terrain.getElevationAt(s.x, s.z) + 165)
            : s.y - (this.player.y || 0);
          // y(τ) = h + vy·τ − ½·g·τ² = 0 (τ: thời gian mô phỏng, = thời gian thật × mult)
          const tau = (s.vy + Math.sqrt(s.vy * s.vy + 2 * gr * Math.max(0, h))) / gr;
          const T = tau / mult;
          const heavy = !!s.isHeavyArty;
          if (T <= (heavy ? 2.4 : 1.6)) {
            s.whistled = true;
            const ix = s.x + s.vx * tau, iz = s.z + s.vz * tau;
            const dImp = Math.hypot(ix - this.player.x, iz - this.player.z);
            if (window.soundEngine && !this.player.isDead) s.whistleSnd = window.soundEngine.playIncomingWhistle(dImp, T, { heavy, pos: { x: ix, z: iz } });
          }
        }

        // Cảnh báo nguy hiểm khi đạn pháo rơi gần người chơi hoặc bot
        if (s.vy < -15) {
          if (s.shooterId !== this.player.id && !this.player.isDead) {
            const distP = Math.hypot(s.x - this.player.x, s.z - this.player.z);
            if (distP < 85 && (s.y - this.player.y) < 280) {
              hasIncomingDanger = true;
            }
          }

          // Cảnh báo bot né đạn (chỉ đạn địch: đạn đồng đội không gây sát thương, không cần né)
          for (const u of this.units) {
            if (!u.isDead && !u.isPlayer && u.id !== s.shooterId && !(s.shooterTeam && u.team === s.shooterTeam)) {
              if (Math.hypot(s.x - u.x, s.z - u.z) < 80 && (s.y - u.y) < 280) {
                u.alertIncomingShell(s.x, s.z);
              }
            }
          }
        }
      }
    }

    const warnBanner = domById('warning-banner');
    if (warnBanner) {
      if (!this.player || this.player.isDead) {
        warnBanner.classList.add('hidden');
      } else if (hasIncomingDanger) {
        warnBanner.classList.remove('hidden');
        const glitchEl = warnBanner.querySelector('.warning-glitch');
        const subEl = warnBanner.querySelector('.warning-sub');
        if (glitchEl) UIIcons.set(glitchEl, '[[alert-triangle]] ĐẠN PHÁO ĐANG LAO XUỐNG ĐẦU! BẬT SHIFT CHẠY NGAY! [[alert-triangle]]');
        if (subEl) subEl.textContent = 'LÁI W/A/S/D + SHIFT ĐỂ CƠ ĐỘNG NÉ TÂM NỔ!';
      } else if (this.player.isOutsideZone) {
        warnBanner.classList.remove('hidden');
        const glitchEl = warnBanner.querySelector('.warning-glitch');
        const subEl = warnBanner.querySelector('.warning-sub');
        if (glitchEl) UIIcons.set(glitchEl, '[[alert-triangle]] BẠN ĐANG Ở NGOÀI VÙNG AN TOÀN — ĐANG MẤT MÁU! [[alert-triangle]]');
        if (subEl) subEl.textContent = 'LÁI VỀ PHÍA TÂM VÒNG BO NGAY (XEM BẢN ĐỒ NHỎ)!';
      } else if (this.radar && this.radar.detections && this.radar.detections.some(d => d.shooterId === this.player.id && d.alpha > 0.4)) {
        warnBanner.classList.remove('hidden');
        const glitchEl = warnBanner.querySelector('.warning-glitch');
        const subEl = warnBanner.querySelector('.warning-sub');
        if (glitchEl) UIIcons.set(glitchEl, '[[alert-triangle]] BỊ RADAR PHẢN PHÁO ĐỐI PHƯƠNG KHÓA VỊ TRÍ! [[alert-triangle]]');
        if (subEl) subEl.textContent = 'CƠ ĐỘNG NGAY ĐỂ MỞ RỘNG VÙNG TRỐN THOÁT!';
      } else {
        warnBanner.classList.add('hidden');
      }
    }

    if (this.updateDroneWorld) this.updateDroneWorld(dt);
    this.ballistics.updateShells3D(dt, this.terrain, this.units, (s, hitType, hitTarget) => this.handleShellImpact(s, hitType, hitTarget));
    this.ballistics.updateWeather(dt);

    // 4. Cập nhật radar phản pháo & vòng bo
    this.radar.update(dt, {
      x: (this.player ? this.player.x : 0) + this.worldWidth / 2,
      y: (this.player ? this.player.z : 0) + this.worldDepth / 2
    });
    this.zone.update(dt, this.units, this.worldWidth / 2, this.worldDepth / 2);

    // 5. CẬP NHẬT CAMERA BÁM ĐUÔI GÓC THẤP (xem updateChaseCamera)
    if (this.player) { this.updateChaseCamera(dt); this.updateUnitLOD(dt); }
    // Vòm trời luôn bao quanh camera (không bị cắt bởi mặt phẳng xa)
    if (this.terrain && this.terrain.sky && this.terrain.sky.mesh) {
      this.terrain.sky.mesh.position.copy(this.camera.position);
      this.terrain.sky.mesh.updateMatrix();
      this.terrain.sky.mesh.updateMatrixWorld(true);
    }

    // 6. Cập nhật hệ thống hiệu ứng nổ 3D, khói bụi, sóng xung kích, mảnh văng & vết sém mờ dần
    if (this.effectsManager && this.effectsManager.fx) this.effectsManager.fx.update(dt);
    if (typeof VehicleDamage !== 'undefined') {
      if (!this._dmgGround && this.terrain) {
        this._dmgGround = true;
        VehicleDamage.setGroundProvider((gx, gz) => this.terrain.getElevationAt(gx, gz));
      }
      VehicleDamage.update(dt, this.units);
    }
    // Bóng che ánh trời dưới gầm xe trên mặt đất (GroundShader contact AO)
    if (typeof GroundShader !== 'undefined' && GroundShader.setVehicles && this.terrain) {
      GroundShader.setVehicles(this.units, this.camera && this.camera.position, (x, z) => this.terrain.getElevationAt(x, z));
    }
    // Cây cháy / đổ, nhà sập, mặt nước; xe húc đổ cây khi chạy qua
    if (this.terrain && this.terrain.update) {
      const fxs = this.effectsManager && this.effectsManager.fx;
      this.terrain.update(dt, fxs);
      if (this.terrain.crushVegetation) {
        for (const u of this.units) {
          if (u.isDead || Math.abs(u.speed || 0) < 8) continue;
          const a = u.bodyAngle || 0;
          this.terrain.crushVegetation(u.x, u.z, u.tankType === 'SCOUT' ? 9 : 14, -Math.sin(a) * u.speed, -Math.cos(a) * u.speed, fxs);
        }
      }
    }
    for (let i = this.explosions3D.length - 1; i >= 0; i--) {
      const exp = this.explosions3D[i];
      let dead = false;

      if (exp.type === 'DEBRIS') {
        // Mảnh vụn đất cát văng tung tóe có trọng lực
        exp.vy -= 190 * dt;
        exp.mesh.position.x += exp.vx * dt;
        exp.mesh.position.y += exp.vy * dt;
        exp.mesh.position.z += exp.vz * dt;
        exp.mesh.rotation.x += exp.rotSpeedX * dt;
        exp.mesh.rotation.y += exp.rotSpeedY * dt;

        if (exp.mesh.position.y <= exp.groundY + 0.3) {
          exp.mesh.position.y = exp.groundY + 0.3;
          exp.vx *= 0.45;
          exp.vz *= 0.45;
          exp.vy = 0;
        }

        exp.life -= dt;
        if (exp.life < 0.6) {
          exp.alpha = Math.max(0, exp.life / 0.6);
          if (exp.mesh.material) exp.mesh.material.opacity = exp.alpha;
        }
        if (exp.life <= 0) dead = true;
      } else if (exp.type === 'SHOCKWAVE') {
        // Sóng xung kích bụi quét rạt mặt đất
        exp.scale += exp.expandSpeed * dt;
        exp.alpha -= dt / exp.life;
        exp.mesh.scale.set(exp.scale, exp.scale, 1);
        if (exp.mesh.material) exp.mesh.material.opacity = Math.max(0, exp.alpha);
        if (exp.alpha <= 0) dead = true;
      } else if (exp.type === 'SMOKE') {
        // Khói bụi sa mạc cuộn bốc lên cao
        exp.mesh.position.y += exp.vy * dt;
        exp.mesh.position.x += exp.vx * dt;
        exp.mesh.position.z += exp.vz * dt;
        exp.scale += exp.growSpeed * dt;
        exp.alpha -= dt / exp.life;
        exp.mesh.scale.set(exp.scale, exp.scale, exp.scale);
        if (exp.mesh.material) exp.mesh.material.opacity = Math.max(0, exp.alpha);
        if (exp.alpha <= 0) dead = true;
      } else if (exp.type === 'SCORCH') {
        // Vết sém đất cát mờ dần sau một khoảng thời gian (tan biến dần vào cát)
        exp.timer += dt;
        if (exp.timer >= exp.fadeStart) {
          const fadeProgress = (exp.timer - exp.fadeStart) / (exp.totalLife - exp.fadeStart);
          exp.alpha = Math.max(0, exp.maxAlpha * (1 - fadeProgress));
          if (exp.mesh.material) exp.mesh.material.opacity = exp.alpha;
        }
        if (exp.timer >= exp.totalLife) dead = true;
      } else {
        // Hiệu ứng quả cầu lửa nổ & khói airdrop mặc định
        if (exp.vy) exp.mesh.position.y += exp.vy * dt;
        if (exp.vx) exp.mesh.position.x += exp.vx * dt;
        if (exp.vz) exp.mesh.position.z += exp.vz * dt;
        exp.scale += dt * (exp.growSpeed || 3.5);
        exp.alpha -= dt / (exp.life || 0.6);
        exp.mesh.scale.set(exp.scale, exp.scale, exp.scale);
        if (exp.mesh.material) exp.mesh.material.opacity = Math.max(0, exp.alpha);
        if (exp.alpha <= 0) dead = true;
      }

      if (dead) {
        this.scene.remove(exp.mesh);
        if (exp.mesh.geometry) exp.mesh.geometry.dispose();
        if (exp.mesh.material) {
          if (Array.isArray(exp.mesh.material)) {
            exp.mesh.material.forEach(m => m.dispose());
          } else {
            exp.mesh.material.dispose();
          }
        }
        this.explosions3D.splice(i, 1);
      }
    }

    // 7. CẬP NHẬT ĐƯỜNG ĐẠN NÉT ĐỨT 3D TỪ ĐẦU NÒNG (DASHED TRAJECTORY LINE)
    if (this.player && !this.player.isDead) {
      const traj = this.ballistics.calculateTrajectoryPoints(
        this.player,
        this.player.azimuth,
        this.player.elevation,
        this.player.charge,
        this.terrain
      );

      if (traj && traj.points && traj.points.length > 1) {
        const isOut = traj.hitType === 'OUT';   // đạn bay ra ngoài chiến trường: không có điểm rơi
        // Đạn chùm: điểm rơi = tâm vùng rải đạn con (đạn mẹ tách vỏ trên không, đạn con rơi ngắn hơn) — cùng điểm bộ giải
        // ngắm nhắm vào; vùng rải tính lại ~7 lần/giây
        const FP = this._clusterFP || (this._clusterFP = { t: 0, F: null });
        if (traj.burst && !isOut && this.player.selectedAmmo === 'CLUSTER' && this.ballistics.clusterFootprint) {
          FP.t -= dt;
          if (FP.t <= 0 || !FP.F) { FP.t = 0.15; FP.F = this.ballistics.clusterFootprint(traj.burst, this.terrain); }
          if (FP.F) {
            traj.impactPoint.set(FP.F.x, this.terrain.getElevationAt(FP.F.x, FP.F.z), FP.F.z);
            traj.distance = Math.round(Math.hypot(FP.F.x - this.player.x, FP.F.z - this.player.z));
          }
        } else FP.F = null;
        this._lastTraj = { x: traj.impactPoint.x, y: traj.impactPoint.y, z: traj.impactPoint.z, d: traj.distance, wall: traj.hitType === 'WALL', out: isOut, ft: (traj.flightTime || 0) / (this.ballistics.bulletSpeedMultiplier || 1) };

        const isWall = traj.hitType === 'WALL';
        // Trạng thái ngắm so với điểm cần trúng (xe đã khóa — có đón đầu — hoặc điểm neo trên mặt đất)
        const tgt = (this.lockedTarget && !this.lockedTarget.isDead && !this._manualAim) ? this.lockedTarget : this._aimPoint;
        const tr = this._lockTrack;
        let aimState = 'free';
        let passAt = null;   // đạn lướt qua thân xe mục tiêu (điểm rơi xuống đất nằm sau xe): vòng ngắm đặt tại xe
        this._lastAim = null;   // điểm cần trúng (có đón đầu) — tâm kính ngắm bắn đặt vào đây
        if (tgt) {
          // điểm cần trúng: đón đầu đầy đủ (nòng có thể chưa bám tới khi máy tính hỏa lực chưa tính xong đón đầu)
          const ax = tr && tr.id === tgt.id && tr.fullX !== undefined ? tr.fullX : (tr && tr.id === tgt.id && tr.aimX !== undefined ? tr.aimX : tgt.x);
          const az = tr && tr.id === tgt.id && tr.fullZ !== undefined ? tr.fullZ : (tr && tr.id === tgt.id && tr.aimZ !== undefined ? tr.aimZ : tgt.z);
          const miss = Math.hypot(traj.impactPoint.x - ax, traj.impactPoint.z - az);
          const unreachable = tr && tr.id === tgt.id && tr.reachable === false;
          const onTol = Math.max(14, Math.hypot(ax - this.player.x, az - this.player.z) * 0.02);
          // bắn thẳng tầm gần: điểm rơi xuống đất nằm sau xe địch nhưng đạn lướt ngang thân xe -> vẫn trúng
          // (tính cả đoạn nòng: địch sát tới mức miệng nòng đã vượt qua tâm xe địch)
          const passes = miss >= onTol && tgt === this.lockedTarget && !isWall
            && this.trajPassesUnit([new THREE.Vector3(this.player.x, (this.player.y || 0) + 22, this.player.z), ...traj.points], ax, (tgt.y || 0) + 9, az);
          aimState = (miss < onTol || passes) && !isOut ? 'on' : ((unreachable || isWall || isOut) && miss > 40 ? 'blocked' : 'slew');
          // Nòng đã chỉ đúng hướng mục tiêu mà đường đạn bị gò / đồi / nhà / tường / thân cây chặn trước khi tới -> BỊ CHE
          // (trước đây đạn chạm đỉnh gò ngay trước xe địch vẫn nằm trong dung sai -> báo "đã ngắm trúng")
          const Pp = this.player;
          const dTg = Math.hypot(ax - Pp.x, az - Pp.z);
          let dA = Math.atan2(traj.impactPoint.x - Pp.x, traj.impactPoint.z - Pp.z) - Math.atan2(ax - Pp.x, az - Pp.z);
          while (dA > Math.PI) dA -= Math.PI * 2;
          while (dA < -Math.PI) dA += Math.PI * 2;
          const aligned = Math.abs(dA) < Math.max(0.035, 24 / Math.max(1, dTg));
          const CV = this._aimCover || (this._aimCover = { t: 0, id: null, hit: null });
          CV.t -= dt;
          if (!aligned) { CV.hit = null; CV.t = 0; }
          else if (CV.t <= 0 || CV.id !== tgt.id) {
            CV.t = 0.2; CV.id = tgt.id;
            CV.hit = this.aimCoverAlong(traj.points, ax, az, tgt === this._aimPoint ? 8 : 18, traj.hitType);
          }
          // trong tầm bắn mà vẫn không tới được = vật cản (gò, nhà...) chứ không phải xa quá -> cũng báo BỊ CHE
          const inRange = !this.ballistics.maxRangeFor || dTg <= this.ballistics.maxRangeFor(Pp);
          if (aligned && CV.hit && (aimState !== 'blocked' || inRange)) aimState = 'covered';
          if (passes) passAt = { x: ax, y: (tgt.y || this.terrain.getElevationAt(ax, az)), z: az };
          this._lastAim = { x: ax, y: (tgt === this._aimPoint ? this.terrain.getElevationAt(ax, az) + 2 : (tgt.y || 0) + 10), z: az, d: Math.round(Math.hypot(ax - this.player.x, az - this.player.z)) };
          this._aimMiss = miss;
        }
        // vùng cấm bắn: điểm rơi / xe đang khóa nằm trong khu căn cứ -> đường đạn đỏ, không khai hỏa được
        const noFire = this.inNoFireZone();
        if (noFire) aimState = 'blocked';
        this._aimState = aimState;
        if (!tgt && this._aimCover) this._aimCover.hit = null;
        const col = WorldMarkers.stateColor(aimState === 'covered' ? 'blocked' : aimState, isWall);
        WorldMarkers.setTrajectory(this.trajectoryLine, traj.points, col, this.camera, this.renderer.domElement.clientHeight);

        if (this.reticle3D) {
          // dấu điểm rơi nằm sát mặt đất (nghiêng theo dốc), cỡ theo khoảng cách camera; bị chắn: dấu X
          const ip = passAt || traj.impactPoint;
          const rr = WorldMarkers.sizeFor(this.camera, ip.x, ip.y, ip.z, 12, 0.026);
          WorldMarkers.placeOnGround(this.reticle3D, this.terrain, ip.x, ip.z, ip.y, rr, 0);
          const RU = this.reticleRingMat.uniforms;
          RU.uSpin.value = (RU.uSpin.value + dt * 0.5) % 6.2832;
          RU.uState.value = (isWall || isOut || aimState === 'blocked' || aimState === 'covered') ? 1 : 0;
          this.reticleRingMat.color.setHex(col);
          this.reticle3D.visible = true;
          this.updateSpreadRing(dt, this.reticle3D.position, col);
          this.updateBlastZone(dt, isOut || isWall ? null : (passAt || traj.impactPoint), FP.F, tgt);
        }

        const trajDistEl = domById('traj-dist-val');
        if (trajDistEl) {
          trajDistEl.textContent = `${traj.distance.toLocaleString()}M`;
        }
        this.updateArtyModeUI();
        const trajModeHint = domById('traj-mode-hint');
        if (trajModeHint) {
          if (noFire) {
            trajModeHint.textContent = '[VÙNG CẤM BẮN — KHÔNG ĐƯỢC KHAI HỎA]';
            trajModeHint.style.color = '#ff3b30';
          } else if (isWall) {
            trajModeHint.textContent = '[CẢNH BÁO: BỊ CHẮN TƯỜNG]';
            trajModeHint.style.color = '#ff3b30';
          } else if (this.player.canElevate === false || this.player.tankType === 'GATLING') {
            trajModeHint.textContent = '[BẮN THẲNG // MÁY TÍNH HỎA LỰC TỰ NÂNG NÒNG]';
            trajModeHint.style.color = '#f97316';
          } else if (this.player.elevation < 0) {
            trajModeHint.textContent = '[HẠ NÒNG ÂM - BẮN GẦN]';
            trajModeHint.style.color = '#00ff9d';
          } else if (this.player.elevation <= 15) {
            trajModeHint.textContent = '[BẮN THẲNG TRỰC DIỆN]';
            trajModeHint.style.color = '#00e5ff';
          } else {
            trajModeHint.textContent = '[BẮN CẦU VỒNG]';
            trajModeHint.style.color = '#ffb700';
          }
        }
      }
    } else {
      if (this.trajectoryLine) this.trajectoryLine.visible = false;
      if (this.reticle3D) this.reticle3D.visible = false;
      if (this.spreadRing) this.spreadRing.visible = false;
      this.updateBlastZone(dt, null);
    }
    this.updateAimAnchor(dt);
    this.updateDriveMarker(dt);

    // 8. CẢNH BÁO RADAR CẬN CHIẾN: NẾU CÓ XE ĐỊCH TRONG BÁN KÍNH QUANH XE (TIẾNG BÍP BÍP)
    if (this.player && !this.player.isDead) {
      let closestEnemyDist = Infinity;
      for (const unit of this.units) {
        // Chỉ cảnh báo xe địch mình đang biết vị trí (không có radar thì không "đánh hơi" được địch khuất tầm)
        if (!unit.isDead && unit.team !== this.player.team && (typeof TeamIntel === 'undefined' || TeamIntel.knows(this.player, unit))) {
          const d = Math.hypot(unit.x - this.player.x, unit.z - this.player.z);
          if (d < closestEnemyDist) {
            closestEnemyDist = d;
          }
        }
      }

      const radarAlertRadius = 600; // Bán kính cảnh giới quanh xe (600 đơn vị ~ 75 m)
      // Chỉ báo LÚC địch vừa áp sát (vào vòng 600, rồi vào vòng 280), không bíp liên tục suốt lúc giao chiến gần —
      // bíp dồn dập liên tục lẫn với các tiếng báo khác nghe rất loạn, và xe thật không có còi kiểu đó
      const zone = closestEnemyDist < 280 ? 2 : closestEnemyDist < radarAlertRadius ? 1 : 0;
      // ra hẳn khỏi vòng (thêm 15%) mới tính là rời đi, để địch lảng vảng ở rìa không làm bíp lặp lại
      const outZone = closestEnemyDist < 280 * 1.15 ? 2 : closestEnemyDist < radarAlertRadius * 1.15 ? 1 : 0;
      const prevZone = this._proxZone || 0;
      if (zone > prevZone && window.soundEngine && typeof window.soundEngine.playRadarProximityBeep === 'function') {
        window.soundEngine.playRadarProximityBeep(zone);
      }
      this._proxZone = Math.max(zone, Math.min(prevZone, outZone));
    }

    this.miniScannerAngle = (this.miniScannerAngle + dt * 160) % 360;

    this.updateHUDValues();
  }

  updateHUDValues() {
    const battleTimerEl = domById('battle-timer');
    if (battleTimerEl) {
      const elapsedSecs = Math.max(0, Math.floor((Date.now() - this.matchStartTime) / 1000));
      const remainingSecs = Math.max(0, (this.matchDuration || 600) - elapsedSecs);
      const m = Math.floor(remainingSecs / 60).toString().padStart(2, '0');
      const s = (remainingSecs % 60).toString().padStart(2, '0');
      // Trận không giới hạn thời gian (phòng thử nghiệm) -> hiện ∞ thay vì số phút khổng lồ
      battleTimerEl.textContent = remainingSecs > 99 * 60 ? '∞' : `${m}:${s}`;

      // Hết 10 phút thi đấu: Kết thúc trận chiến và tính điểm Kills
      // Chơi mạng: chủ phòng quyết định kết thúc (tỉ số chung); chủ phòng im lặng quá 8 s sau giờ hết thì tự kết thúc
      if (remainingSecs <= 0 && !this.isGameOver && this.isGameStarted) {
        const ns = this.netSync;
        if (ns && !ns.detached && !ns.net.isHost) {
          const overSecs = (Date.now() - this.matchStartTime) / 1000 - (this.matchDuration || 600);
          if (overSecs > 8) { this._netEndFallback = true; try { this.finishMatchByTime(); } finally { this._netEndFallback = false; } }
        } else {
          this.finishMatchByTime();
        }
      }
    }

    if (!this.player) return;

    const hpBar = domById('hp-bar');
    const hpText = domById('hp-text');
    if (hpBar && hpText) {
      const hpPct = Math.max(0, Math.min(100, (this.player.hp / this.player.maxHp) * 100));
      const prevPct = this._hudHpPct;
      if (prevPct !== hpPct) {
        this._hudHpPct = hpPct;
        // ô máu chiếm (100% - 6px) của khung; vệt "máu vừa mất" (#hp-ghost) đi theo bằng transition trễ trong hud.css
        const w = `calc((100% - 6px) * ${hpPct / 100})`;
        hpBar.style.width = w;
        const ghost = domById('hp-ghost');
        if (ghost) ghost.style.width = w;
        hpBar.classList.toggle('warn', hpPct < 60 && hpPct >= 30);
        hpBar.classList.toggle('crit', hpPct < 30 && hpPct > 0);
        // màu chuyển dần: xanh lá -> vàng (dưới 60 %) -> đỏ (dưới 35 %)
        const t = hpPct / 100;
        const lerp = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
        const OK = [143, 196, 111], AMB = [231, 166, 58], RED = [224, 103, 92];
        const c = t >= 0.6 ? OK : t >= 0.35 ? lerp(AMB, OK, (t - 0.35) / 0.25) : lerp(RED, AMB, Math.max(0, (t - 0.15) / 0.2));
        const row = domById('hp-row');
        if (row) {
          row.style.setProperty('--hp-c', `rgb(${c[0]}, ${c[1]}, ${c[2]})`);
          if (prevPct !== undefined && hpPct < prevPct) {
            row.classList.add('hit');
            clearTimeout(this._hudHpHitT);
            this._hudHpHitT = setTimeout(() => row.classList.remove('hit'), 140);
          }
        }
      }
      const fmt = v => (Math.round(Math.max(0, v) * 10) / 10).toString();
      hpText.textContent = `${fmt(this.player.hp)} / ${fmt(this.player.maxHp)}`;
    }

    this.updateAmmoUI();

    const reloadBar = domById('reload-bar');
    const reloadText = domById('reload-text');
    const fireBtn = domById('fire-btn');
    const fireMainText = (fireBtn && typeof fireBtn.querySelector === 'function') ? fireBtn.querySelector('.fire-main-text') : null;

    if (fireMainText) {
      const fireLabel = {
        AP: ['BẮN XUYÊN GIÁP', '#9be3ff'], HE: ['BẮN NỔ MẠNH', '#ffd27a'], CLUSTER: ['BẮN ĐẠN CHÙM', '#a8f5c0'],
        RPG: ['PHÓNG TÊN LỬA', '#ffc08a'], INCENDIARY: ['BẮN ĐẠN CHÁY', '#ffb08a']
      }[this.player.selectedAmmo] || ['KHAI HỎA', '#ffffff'];
      if (fireMainText.textContent !== fireLabel[0]) fireMainText.textContent = fireLabel[0];
      fireMainText.style.color = fireLabel[1];
    }

    if (reloadBar && reloadText) {
      if (this.player.reloadTimer <= 0) {
        reloadBar.style.width = '100%';
        reloadText.textContent = 'SẴN SÀNG';
        reloadText.style.color = '#5cf08a';
        if (fireBtn) fireBtn.disabled = false;
      } else {
        const reloadPct = ((this.player.reloadDuration - this.player.reloadTimer) / this.player.reloadDuration) * 100;
        reloadBar.style.width = `${reloadPct}%`;
        reloadText.textContent = `NẠP ĐẠN ${this.player.reloadTimer.toFixed(1)}S`;
        reloadText.style.color = '#ffb020';
        if (fireBtn) fireBtn.disabled = true;
      }
    }

    const speedText = domById('speed-text');
    if (speedText) {
      // đang lội nước: hiện tốc độ thật (nước cản làm xe chậm hẳn dù vẫn đạp hết ga)
      const vShow = Math.abs(this.player.speed) * ((this.player.waterDepth || 0) > 0.6 ? (this.player._groundMult || 1) : 1);
      const speedKmH = Math.round(typeof GameTiming !== 'undefined' ? GameTiming.kmh(vShow) : vShow * 0.45);
      speedText.textContent = `${speedKmH} KM/H`;
    }

    const boostTag = domById('speed-boost-tag');
    if (boostTag) {
      if (this.player.speedBoostTimer > 0) {
        boostTag.classList.remove('hidden');
        boostTag.textContent = `TĂNG TỐC ${Math.ceil(this.player.speedBoostTimer)}S`;
      } else {
        boostTag.classList.add('hidden');
      }
    }
    this.syncEquipmentChips();

    const stealthBanner = domById('stealth-banner');
    const stealthOverlay = domById('stealth-camo-overlay');
    const isPlayerInBush = !this.player.isDead && this.player.isInBush;
    const isPlayerRevealed = isPlayerInBush && this.player.revealTimer > 0;

    if (stealthBanner) {
      if (isPlayerInBush) {
        stealthBanner.classList.remove('hidden');
        if (isPlayerRevealed) {
          stealthBanner.innerHTML = `<span class="stealth-pulse-dot red"></span> BỊ LỘ VỊ TRÍ DO VỪA KHAI HỎA · ${this.player.revealTimer.toFixed(1)}S`;
          stealthBanner.classList.add('revealed');
        } else {
          stealthBanner.innerHTML = `<span class="stealth-pulse-dot green"></span> ĐANG NÚP BỤI · ĐỊCH CHỈ THẤY XE KHI Ở GẦN`;
          stealthBanner.classList.remove('revealed');
        }
      } else {
        stealthBanner.classList.add('hidden');
      }
    }

    if (stealthOverlay) {
      if (isPlayerInBush) {
        stealthOverlay.classList.add('active');
        if (isPlayerRevealed) {
          stealthOverlay.classList.add('revealed');
        } else {
          stealthOverlay.classList.remove('revealed');
        }
      } else {
        stealthOverlay.classList.remove('active');
        stealthOverlay.classList.remove('revealed');
      }
    }

    const terrainText = domById('terrain-text');
    if (terrainText) {
      const tInfo = this.terrain.getTerrainInfoAt(this.player.x, this.player.z, this.player.currentPitch);
      terrainText.textContent = tInfo.name;
    }

    const windValEl = domById('hud-wind-val');
    if (windValEl && this.ballistics && this.ballistics.wind) {
      const dir = Math.round(this.ballistics.wind.direction);
      let dirName = 'BẮC';
      if (dir >= 22.5 && dir < 67.5) dirName = 'ĐÔNG BẮC';
      else if (dir >= 67.5 && dir < 112.5) dirName = 'ĐÔNG';
      else if (dir >= 112.5 && dir < 157.5) dirName = 'ĐÔNG NAM';
      else if (dir >= 157.5 && dir < 202.5) dirName = 'NAM';
      else if (dir >= 202.5 && dir < 247.5) dirName = 'TÂY NAM';
      else if (dir >= 247.5 && dir < 292.5) dirName = 'TÂY';
      else if (dir >= 292.5 && dir < 337.5) dirName = 'TÂY BẮC';
      windValEl.textContent = `${dirName} (${dir}°) // ${this.ballistics.wind.speed.toFixed(1)} M/S`;
    }

    // Cập nhật thông tin binh chủng xe tăng đang điều khiển trên HUD
    const tankClassText = domById('tank-class-text');
    const gatlingSpinTag = domById('gatling-spin-tag');
    const gatlingMagTag = domById('gatling-mag-tag');
    const gatlingHeatTag = domById('gatling-heat-tag');
    const artyDeployTag = domById('arty-deploy-tag');
    const artyDroneTag = domById('arty-drone-tag');
    const scoutMissileTag = domById('scout-missile-tag');
    const scoutRadarTag = domById('scout-radar-tag');
    const P = this.player;
    // Đặt nội dung + màu cho một chip trạng thái (ẩn khi text rỗng)
    const chip = (el, text, color) => {
      if (!el) return;
      el.classList.toggle('hidden', !text);
      if (!text) return;
      if (el.textContent !== text) el.textContent = text;
      el.style.color = color;
    };

    if (tankClassText && this._hudVehType !== P.tankType) {
      this._hudVehType = P.tankType;
      const ident = {
        GATLING: ['HAILSTORM R6', 'XE HỎA LỰC 6 NÒNG', '#ffd166'],
        ARTILLERY: ['ARBALEST 155', 'PHÁO TỰ HÀNH', '#ff8a7a'],
        SCOUT: ['MARTEN R4', 'XE TRINH SÁT', '#5cf08a']
      }[P.tankType] || ['HALBERD MK.3', 'XE TĂNG CHỦ LỰC', '#3cc8ff'];
      tankClassText.textContent = ident[0];
      tankClassText.style.color = ident[2];
      const roleEl = domById('hud-veh-role');
      if (roleEl) roleEl.textContent = ident[1];
      const iconEl = domById('hud-veh-icon');
      if (iconEl && this.hud) {
        iconEl.innerHTML = this.hud.tankSvg(P.tankType);
        iconEl.style.color = ident[2];
      }
    }

    // 1. XE 6 NÒNG (GATLING): băng đạn · tốc độ quay nòng · nhiệt nòng
    if (P.tankType === 'GATLING') {
      const spinPct = Math.round((P.spinUpTime / P.spinRequired) * 100);
      chip(gatlingSpinTag,
        spinPct >= 100 ? 'NÒNG 100% · TOÀN TỐC' : spinPct > 0 ? `NÒNG ĐANG QUAY ${spinPct}%` : 'GIỮ SPACE: QUAY NÒNG',
        spinPct >= 100 ? '#5cf08a' : spinPct > 0 ? '#ffd166' : '#7d93a2');
      chip(gatlingMagTag,
        P.reloadTimer > 0 ? `NẠP BĂNG ${P.reloadTimer.toFixed(1)}S` : `BĂNG ${P.gatlingMag}/${P.gatlingMagMax}`,
        P.reloadTimer > 0 ? '#ff4d4d' : '#3cc8ff');
      const heatPct = Math.round((P.barrelHeat || 0) * 100);
      chip(gatlingHeatTag,
        P.isOverheated ? `QUÁ NHIỆT ${heatPct}% · ĐANG NGUỘI` : `NHIỆT NÒNG ${heatPct}%`,
        P.isOverheated ? '#ff4d4d' : heatPct > 65 ? '#ff8c42' : heatPct > 25 ? '#ffd166' : '#7d93a2');
    } else {
      chip(gatlingSpinTag, '');
      chip(gatlingHeatTag, '');
    }

    // 2. PHÁO TỰ HÀNH (ARTILLERY): càng chống
    if (P.tankType === 'ARTILLERY') {
      if (P.isDeployed) chip(artyDeployTag, 'CÀNG CHỐNG ĐÃ HẠ · SẴN SÀNG', '#5cf08a');
      else if (P.standStillTimer > 0) chip(artyDeployTag, `ĐANG HẠ CÀNG ${Math.round((P.deployProgress || 0) * 100)}%`, '#ffd166');
      else chip(artyDeployTag, 'CHƯA HẠ CÀNG · DỪNG XE 2S', '#ff8a7a');
      // drone trinh sát: pin / đang sạc / đang bay về
      const DR = this.droneState(), DC = ArtilleryGame3D.DRONE, pct = Math.round(DR.batt * 100);
      const charging = DR.state === 'docked' && DR.batt < 0.999;
      const hull = Math.round(Math.max(0, DR.hp === undefined ? 1 : DR.hp) * 100);
      const thr = this._droneThreat && this._droneThreat.top;
      const [dTxt, dCol] = DR.state === 'lost' ? ['MẤT DRONE · CHỜ HỒI SINH', '#ff4d4d']
        : thr && DR.state !== 'docked' ? [this._droneThreat.firing ? 'DRONE ĐANG BỊ BẮN!' : 'DRONE BỊ KHÓA MỤC TIÊU', '#ff4d4d']
        : DR.state === 'flying' || DR.state === 'launching' ? [`DRONE ĐANG BAY ${pct}%` + (hull < 100 ? ` · THÂN ${hull}%` : ''), pct < DC.warn[0] * 100 || hull < 35 ? '#ff4d4d' : '#3cc8ff']
        : DR.state === 'returning' ? [`DRONE ĐANG BAY VỀ ${pct}%`, '#ffb020']
          : !charging ? ['DRONE SẴN SÀNG · C', '#5cf08a']
            : [`DRONE ĐANG SẠC ${pct}%` + (DR.batt < DC.minLaunch ? ' · CHƯA BAY ĐƯỢC' : ''), DR.batt < DC.minLaunch ? '#ff8a7a' : '#ffd166'];
      if (artyDroneTag) {
        artyDroneTag.classList.remove('hidden');
        const tx = artyDroneTag.querySelector('.dr-txt'), bt = artyDroneTag.querySelector('.dr-bat');
        if (tx && tx.textContent !== dTxt) tx.textContent = dTxt;
        artyDroneTag.style.color = dCol;
        if (bt) { bt.firstChild.style.width = (DR.state === 'lost' ? 0 : pct) + '%'; bt.classList.toggle('charging', charging); }
      }
    } else {
      chip(artyDeployTag, '');
      if (artyDroneTag) artyDroneTag.classList.add('hidden');
    }

    // 3. XE TRINH SÁT (SCOUT): súng máy · tên lửa chống tăng · radar
    if (P.tankType === 'SCOUT') {
      chip(gatlingMagTag,
        P.reloadTimer > 0 ? `NẠP SÚNG MÁY ${P.reloadTimer.toFixed(1)}S` : `SÚNG MÁY ${P.gatlingMag}/${P.gatlingMagMax}`,
        P.reloadTimer > 0 ? '#ff4d4d' : '#5cf08a');
      const nM = P.missileAmmoCount || 0;
      const sel = P.selectedAmmo === 'ANTI_TANK_MISSILE';
      const S = this._seeker || { state: 'none', p: 0 };
      const [mTxt, mCol] = nM <= 0 ? ['TÊN LỬA · HẾT', '#ff4d4d']
        : (P.dmg && P.dmg.rpgDisabled) ? ['ỐNG PHÓNG HỎNG', '#ff4d4d']
          : P.antiTankCooldown > 0 ? [`TÊN LỬA ×${nM} · NẠP ${P.antiTankCooldown.toFixed(1)}S`, '#ffb020']
            : !sel ? [`TÊN LỬA ×${nM} · BẤM 3`, '#7d93a2']
              : S.state === 'locked' ? [`TÊN LỬA ×${nM} · ĐÃ KHÓA · SPACE`, '#5cf08a']
                : S.state === 'seeking' ? [`ĐANG BÁM ${Math.round(S.p * 100)}%`, '#ffd166']
                  : S.state === 'blind' ? ['KHÔNG NHÌN THẤY MỤC TIÊU', '#ff8a7a']
                    : ['KHÓA XE ĐỊCH ĐỂ PHÓNG', '#ffd166'];
      chip(scoutMissileTag, mTxt, mCol);
      const radarOk = typeof TeamIntel === 'undefined' || TeamIntel.hasRadar(P);
      const rr = Math.round(P.reconRadius || 950);
      const nRep = typeof TeamIntel !== 'undefined' ? [...TeamIntel.reports.values()].filter(r => r.spotter === P).length : 0;
      chip(scoutRadarTag,
        radarOk ? `RADAR ${rr}M${nRep ? ' · ĐANG BÁO VỊ TRÍ' : ' · KHÓA ĐỊCH ĐỂ BÁO'}` : 'RADAR HỎNG · CHỈ QUAN SÁT MẮT',
        radarOk ? '#6ee7b7' : '#ff4d4d');
    } else {
      if (P.tankType !== 'GATLING') chip(gatlingMagTag, '');
      chip(scoutMissileTag, '');
      chip(scoutRadarTag, '');
    }
  }

  syncHUDControls() {
    if (!this.player) return;

    const azSlider = domById('azimuth-slider');
    const azValEl = domById('azimuth-val');
    if (azSlider && azValEl) {
      azSlider.value = this.player.azimuth;
      azValEl.textContent = `${this.player.azimuth.toFixed(1).padStart(5, '0')}°`;
    }

    const elSlider = domById('elevation-slider');
    const elValEl = domById('elevation-val');
    const fireModeHint = domById('fire-mode-hint');

    const isFixedGatling = (this.player.canElevate === false || this.player.tankType === 'GATLING');

    // Cập nhật hướng dẫn phím bấm nâng hạ nòng trên HUD
    const aimGuideEl = document.querySelector('.aim-keys-guide');
    if (aimGuideEl) {
      if (isFixedGatling) {
        aimGuideEl.innerHTML = `
          <span class="key-pill"><b>← / →</b>: Quay tháp pháo</span>
          <span class="key-pill" style="color: #fb923c; border-color: rgba(249, 115, 22, 0.4);"><b>↑ / ↓</b>: Máy tính tự nâng nòng</span>
          <span class="key-pill"><b>W A S D</b>: Lái xe</span>
        `;
      } else {
        aimGuideEl.innerHTML = `
          <span class="key-pill"><b>← / →</b>: Quay tháp pháo</span>
          <span class="key-pill"><b>↑ / ↓</b>: Nâng / hạ nòng pháo</span>
          <span class="key-pill"><b>W A S D</b>: Lái xe</span>
        `;
      }
    }

    if (elSlider && elValEl) {
      if (isFixedGatling) {
        this.player.elevation = 0;
        elSlider.value = 0;
        elValEl.textContent = 'CỐ ĐỊNH 0.0°';
        elValEl.style.color = '#fb923c';

        if (fireModeHint) {
          fireModeHint.textContent = '[CẬN CHIẾN // NÒNG CỐ ĐỊNH 0°]';
          fireModeHint.style.color = '#fb923c';
        }
      } else {
        elSlider.value = this.player.elevation;
        elValEl.textContent = `${this.player.elevation.toFixed(1)}°`;
        elValEl.style.color = '';

        if (fireModeHint) {
          const pred = this.currentPrediction || this.ballistics.predictTrajectoryImpact(
            this.player.x, this.player.y, this.player.z,
            this.player.azimuth, this.player.elevation, this.player.charge,
            this.terrain, this.player
          );
          const distStr = pred ? ` // ĐIỂM RƠI: ${pred.distance}M (${pred.flightTime}S)` : '';
          if (this.player.elevation < 0) {
            fireModeHint.textContent = `[HẠ NÒNG ÂM]${distStr}`;
            fireModeHint.style.color = '#00ff9d';
          } else if (this.player.elevation <= 15) {
            fireModeHint.textContent = `[BẮN THẲNG]${distStr}`;
            fireModeHint.style.color = '#00e5ff';
          } else {
            fireModeHint.textContent = `[CẦU VỒNG]${distStr}`;
            fireModeHint.style.color = '#ffb700';
          }
        }
      }
    }

    this.selectCharge(this.player.charge);
  }

  showGatlingFixedBarrelNotice() {
    const now = Date.now();
    if (!this._lastGatlingNotice || now - this._lastGatlingNotice > 3000) {
      this._lastGatlingNotice = now;
      this.addCombatLog('Xe 6 nòng dùng máy tính điều khiển hỏa lực: nòng tự nâng / hạ vào tâm mục tiêu, chỉ cần xoay tháp & khóa mục tiêu!', 'tip');
      if (window.soundEngine && typeof window.soundEngine.playTargetLost === 'function') {
        window.soundEngine.playTargetLost();
      }
    }
  }

  addCombatLog(text, type = 'system') {
    const logBox = domById('combat-log');
    if (!logBox) return;

    // Chặn trùng lặp tin nhắn giống hệt vừa mới hiển thị
    const lastEntry = logBox.lastElementChild;
    if (lastEntry && lastEntry._iconRaw === text) {
      return;
    }

    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry._feed = type === 'feed';
    UIIcons.set(entry, text);
    logBox.appendChild(entry);

    // Tự mờ dần rồi thu gọn (không để lại khoảng trống): tin chung 3 giây, tin của bạn 5 giây
    setTimeout(() => {
      entry.classList.add('out');
      setTimeout(() => {
        if (entry.parentElement) entry.remove();
      }, 400);
    }, entry._feed ? 3000 : 5000);

    // Tối đa 4 dòng: bỏ tin chung cũ nhất trước, giữ tin liên quan trực tiếp tới người chơi
    while (logBox.children.length > 4) {
      const kids = Array.from(logBox.children);
      logBox.removeChild(kids.find(k => k._feed) || kids[0]);
    }
  }

  render() {
    // 1. Render Scene 3D Three.js (đo thời gian GPU cho độ phân giải động — GfxQuality)
    const GQ = typeof GfxQuality !== 'undefined' ? GfxQuality : null;
    if (GQ) GQ.beginFrame();
    // bóng mây trôi chỉ bật cho cảnh trận (sảnh / phòng xem xe dùng chung chunk chiếu sáng nhưng không có mây)
    const atm = this.terrain && this.terrain.atmosphere, SK = typeof SkySystem !== 'undefined' && SkySystem.setClouds ? SkySystem : null;
    // drone vừa bị bắn hạ: hình truyền về đứng khựng ở khung cuối (không vẽ khung mới), nhiễu phủ lên
    const frozen = this._sight && this._sight.dying && this._sight.dying.freeze;
    if (!frozen) {
      if (SK && atm) SK.setClouds(atm.cloudK || 0, atm.cloudCover);
      this.renderer.render(this.scene, this.camera);
      if (SK) SK.setClouds(0);
    }
    if (GQ) GQ.endFrame();
    this.pinShaderPrograms();

    // 2. Render Minimap chuẩn Art of War 3
    this.renderAOWMinimap();

    // 3. Render Tactical Map nếu đang mở
    if (this.tacticalMap.isOpen) {
      this.tacticalMap.render();
    }
  }

  renderAOWMinimap() {
    if (!this.miniCtx || !this.miniCanvas || !this.player) return;
    const ctx = this.miniCtx;
    const w = this.miniCanvas.width;
    const h = this.miniCanvas.height;
    const scale = w / this.worldWidth;

    ctx.clearRect(0, 0, w, h);

    // Dựng nền bản đồ: dùng chung nền bản đồ tác chiến (đổ bóng + đồng mức); dựng ngầm 1 lần, trong lúc chờ dùng nền cũ
    const tm = this.tacticalMap;
    if (tm && tm.buildBase && this.terrain.map && (!tm.base || tm.base.map !== this.terrain.map) && this._tacBaseFor !== this.terrain.map) {
      this._tacBaseFor = this.terrain.map;
      setTimeout(() => { try { tm.buildBase(); } catch (e) { /* bỏ qua */ } }, 50);
    }
    ctx.drawImage(tm && tm.base && tm.base.map === this.terrain.map ? tm.base.canvas : this.terrain.mapCanvas, 0, 0, w, h);

    // Vòng bo
    this.zone.renderOnTacticalMap(ctx, scale);

    // Vùng khoanh radar
    this.radar.renderOnTacticalMap(ctx, scale);

    // Vẽ 3 Cứ Điểm Chiến Lược A, B, C trên Minimap
    if (this.capturePoints && this.capturePoints.length > 0) {
      this.capturePoints.forEach(cp => {
        const cx = (cp.x + this.worldWidth / 2) * scale;
        const cz = (cp.z + this.worldDepth / 2) * scale;
        const rMini = (cp.radius / this.worldWidth) * w;

        ctx.save();
        const owner = (cp.owner || '').toString().toUpperCase();
        let cpColor = '#ffffff';
        if (owner === 'BLUE') cpColor = '#5fb0dc';
        else if (owner === 'RED') cpColor = '#e0675c';

        // Vòng ranh giới cứ điểm
        ctx.strokeStyle = cpColor;
        ctx.lineWidth = cp.isDisputed ? 2 : 1.2;
        if (cp.isDisputed) ctx.setLineDash([3, 2]);
        ctx.beginPath();
        ctx.arc(cx, cz, rMini, 0, Math.PI * 2);
        ctx.stroke();

        // Nút tròn tâm có chữ A, B, C
        ctx.fillStyle = cpColor;
        ctx.beginPath();
        ctx.arc(cx, cz, 4.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#000000';
        ctx.font = 'bold 7px Chakra Petch';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(cp.id, cx, cz);

        // Vòng đếm thời gian giữ 60s
        if (owner === 'BLUE' || owner === 'RED') {
          const holdRatio = Math.min(1, cp.holdTimer / 60.0);
          ctx.strokeStyle = '#e7a63a';
          ctx.lineWidth = 1.8;
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.arc(cx, cz, 6.5, -Math.PI / 2, -Math.PI / 2 + holdRatio * Math.PI * 2);
          ctx.stroke();
        }

        ctx.restore();
      });
    }

    // Vẽ Các Hòm Tiếp Tế Rải Rác trên Minimap
    if (this.supplyCrates && this.supplyCrates.length > 0) {
      this.supplyCrates.forEach(crate => {
        if (crate.active) {
          const cx = (crate.x + this.worldWidth / 2) * scale;
          const cz = (crate.z + this.worldDepth / 2) * scale;
          ctx.save();
          const pulse = 4.2 + Math.sin(Date.now() * 0.008 + crate.x) * 1.5;
          ctx.strokeStyle = '#e7a63a';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(cx, cz, pulse, 0, Math.PI * 2);
          ctx.stroke();

          ctx.fillStyle = '#e7a63a';
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1;
          ctx.fillRect(cx - 3, cz - 3, 6, 6);
          ctx.strokeRect(cx - 3, cz - 3, 6, 6);

          ctx.fillStyle = '#ffffff';
          ctx.fillRect(cx - 1.5, cz - 0.5, 3, 1);
          ctx.fillRect(cx - 0.5, cz - 1.5, 1, 3);
          ctx.restore();
        }
      });
    }

    // Vẽ Hòm Tiếp Tế Thả Dù trên Minimap nếu có
    if (this.airdrop && !this.airdrop.collected) {
      const ax = (this.airdrop.x + this.worldWidth / 2) * scale;
      const az = (this.airdrop.z + this.worldDepth / 2) * scale;
      ctx.save();
      ctx.fillStyle = '#e7a63a';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(ax, az, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#f5c46b';
      ctx.font = 'bold 8px Chakra Petch';
      ctx.textAlign = 'center';
      ctx.fillText('HÒM THẢ DÙ', ax, az - 6);
      ctx.restore();
    }

    // Khung nhìn camera Viewport (chuẩn Art of War 3)
    const px = (this.player.x + this.worldWidth / 2) * scale;
    const pz = (this.player.z + this.worldDepth / 2) * scale;

    // VÒNG TRÒN BÁN KÍNH TẦM BẮN & ĐIỂM RƠI DỰ KIẾN TRÊN MINIMAP
    const pred = this.currentPrediction || this.ballistics.predictTrajectoryImpact(
      this.player.x, this.player.y, this.player.z,
      this.player.azimuth, this.player.elevation, this.player.charge,
      this.terrain, this.player
    );

    // 1. Vòng tròn bán kính tầm bắn tối đa của liều phóng hiện tại
    const maxRangeMini = (pred.maxRange / this.worldWidth) * w;
    ctx.save();
    ctx.strokeStyle = 'rgba(223, 228, 217, 0.45)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(px, pz, maxRangeMini, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // 2. Tia laser dẫn bắn từ xe đến điểm rơi trên Minimap
    const impX = (pred.impactX + this.worldWidth / 2) * scale;
    const impZ = (pred.impactZ + this.worldDepth / 2) * scale;

    ctx.strokeStyle = pred.hitType === 'WALL' ? 'rgba(255, 59, 48, 0.75)' : 'rgba(231, 166, 58, 0.75)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(px, pz);
    ctx.lineTo(impX, impZ);
    ctx.stroke();
    ctx.setLineDash([]);

    // 3. Tâm ngắm điểm rơi trên Minimap
    ctx.strokeStyle = pred.hitType === 'WALL' ? '#e0675c' : '#e7a63a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(impX, impZ, 3.5, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = pred.hitType === 'WALL' ? '#e0675c' : '#e7a63a';
    ctx.beginPath();
    ctx.arc(impX, impZ, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 3b. Vẽ các cụm bụi rậm ngụy trang trên Minimap
    if (this.terrain && this.terrain.bushClusters) {
      ctx.save();
      ctx.fillStyle = 'rgba(46, 125, 50, 0.4)';
      ctx.strokeStyle = 'rgba(76, 175, 80, 0.65)';
      ctx.lineWidth = 1;
      this.terrain.bushClusters.forEach(bc => {
        const bx = (bc.x + this.worldWidth / 2) * scale;
        const bz = (bc.z + this.worldDepth / 2) * scale;
        const br = bc.radius * scale;
        ctx.beginPath();
        ctx.arc(bx, bz, br, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });
      ctx.restore();
    }

    this.drawAutoDrivePath(ctx, (wx, wz) => ({ x: (wx + this.worldWidth / 2) * scale, y: (wz + this.worldDepth / 2) * scale }), false);

    // 4. Vẽ các xe pháo 2 phe trên Minimap: đồng minh luôn hiện; xe địch chỉ hiện khi mình nhìn thấy,
    // radar trinh sát của mình bắt được (ô vuông), hoặc đồng đội trinh sát báo vị trí (hình thoi vàng nhấp nháy)
    if (typeof TeamIntel !== 'undefined') {
      TeamIntel.drawOnMap(ctx, this.player, this.units,
        (wx, wz) => ({ x: (wx + this.worldWidth / 2) * scale, y: (wz + this.worldDepth / 2) * scale }), scale, { dot: 3.2, playerDot: 4.5 });
    } else {
      this.units.forEach(u => {
        if (u.isDead || u.isHiddenFromPlayer) return;
        const ux = (u.x + this.worldWidth / 2) * scale;
        const uz = (u.z + this.worldDepth / 2) * scale;
        ctx.fillStyle = u.team === 'BLUE' ? '#5fb0dc' : '#e0675c';
        ctx.beginPath();
        ctx.arc(ux, uz, u.isPlayer ? 4.5 : 3.2, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // drone đang bay (phe mình + drone địch đang thấy)
    if (this.drawDronesOnMap) this.drawDronesOnMap(ctx, (wx, wz) => ({ x: (wx + this.worldWidth / 2) * scale, y: (wz + this.worldDepth / 2) * scale }), false);

    // Xe địch đang khóa: khung khóa đỏ (vàng khi đang ngắm tay) — vẽ đúng chỗ ký hiệu đang hiện
    const LT = this.lockedTarget;
    const lp = LT && !LT.isDead && this.tacticalMap && this.tacticalMap.shownPos ? this.tacticalMap.shownPos(LT) : null;
    if (lp) {
      const lx = (lp.x + this.worldWidth / 2) * scale, lz = (lp.z + this.worldDepth / 2) * scale, r = 7, L = 3;
      ctx.save();
      ctx.strokeStyle = this._manualAim ? '#e7a63a' : '#ff4d4d';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        ctx.moveTo(lx + sx * r, lz + sy * (r - L)); ctx.lineTo(lx + sx * r, lz + sy * r); ctx.lineTo(lx + sx * (r - L), lz + sy * r);
      }
      ctx.stroke();
      ctx.restore();
    }

    // Hình quạt hướng camera đang nhìn (camera bám đuôi xoay theo xe / nòng)
    {
      const yaw = this._camYaw || 0, fxm = -Math.sin(yaw), fzm = -Math.cos(yaw);
      const half = Math.atan(Math.tan(this.camera.fov * Math.PI / 360) * this.camera.aspect);
      const L = 34, rot = (a) => ({ x: fxm * Math.cos(a) - fzm * Math.sin(a), z: fxm * Math.sin(a) + fzm * Math.cos(a) });
      const l = rot(-half), r = rot(half);
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px, pz); ctx.lineTo(px + l.x * L, pz + l.z * L); ctx.lineTo(px + r.x * L, pz + r.z * L); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.restore();
    }

    // Điểm neo ngắm bắn trên Minimap (chữ thập vàng / xanh khi đã ngắm trúng)
    if (this._aimPoint) {
      const ax = (this._aimPoint.x + this.worldWidth / 2) * scale;
      const az = (this._aimPoint.z + this.worldDepth / 2) * scale;
      ctx.save();
      ctx.strokeStyle = this._aimState === 'on' ? '#5cf08a' : '#ffb020';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(ax, az, 4, 0, Math.PI * 2);
      ctx.moveTo(ax - 7, az); ctx.lineTo(ax - 2, az);
      ctx.moveTo(ax + 2, az); ctx.lineTo(ax + 7, az);
      ctx.moveTo(ax, az - 7); ctx.lineTo(ax, az - 2);
      ctx.moveTo(ax, az + 2); ctx.lineTo(ax, az + 7);
      ctx.stroke();
      ctx.restore();
    }

    // Hướng nòng pháo trên Minimap
    const barrelRad = (this.player.azimuth * Math.PI) / 180;
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px, pz);
    ctx.lineTo(px + Math.sin(barrelRad) * 12, pz - Math.cos(barrelRad) * 12);
    ctx.stroke();

    // Tia quét trang trí (chỉ khi không có hệ tình báo; xe trinh sát đã có tia quét radar thật vẽ ở trên)
    if (typeof TeamIntel === 'undefined') {
      const sweepRad = (this.miniScannerAngle * Math.PI) / 180;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(w / 2, h / 2);
      ctx.arc(w / 2, h / 2, w * 0.7, sweepRad - 0.35, sweepRad);
      ctx.closePath();
      ctx.fillStyle = 'rgba(0, 229, 255, 0.12)';
      ctx.fill();
      ctx.restore();
    }
  }

  finishMatchByTime() {
    if (this.isGameOver) return;
    this.isGameOver = true;
    const my = this.myTeam();
    const mine = my === 'RED' ? this.redKills : this.blueKills;
    const theirs = my === 'RED' ? this.blueKills : this.redKills;
    const result = mine > theirs ? 'win' : mine < theirs ? 'loss' : 'draw';
    const sub = result === 'draw'
      ? `Hết giờ — hai đội hòa ${mine} – ${theirs} điểm hạ gục.`
      : `Hết giờ — ${result === 'win' ? 'đội bạn thắng' : 'đội bạn thua'} ${mine} – ${theirs} điểm hạ gục.`;
    this.showMatchResult(result, sub);
  }

  finishMatchByCapture(winningTeam, cpName) {
    if (this.isGameOver) return;
    this.isGameOver = true;
    const won = String(winningTeam).toUpperCase() === this.myTeam();
    const where = String(cpName || 'cứ điểm').replace(/\s*\(.*\)\s*$/, '');
    const sub = won
      ? `Đội bạn giữ vững ${where} đủ 60 giây.`
      : `Đội địch đã giữ ${where} đủ 60 giây.`;
    this.addCombatLog(won ? `[[trophy]] ĐỘI BẠN THẮNG — giữ vững ${where}!` : `[[flag]] ĐỘI ĐỊCH THẮNG — họ đã giữ ${where}`, won ? 'victory' : 'defeat');
    this.showMatchResult(won ? 'win' : 'loss', sub);
  }

  // Phím G: phóng màn khói trước mũi xe (cần trang bị Ống phóng lựu khói)
  triggerPlayerSmoke() {
    const P = this.player;
    if (!P || P.isDead || !this.isGameStarted || this.isGameOver || typeof Equipment === 'undefined') return;
    if (!Equipment.has(P, 'smoke')) {
      this.addCombatLog('[[cloud]] Xe chưa lắp ống phóng lựu khói — lắp trong Kho vũ khí (nhóm PHỤ KIỆN) ở sảnh', 'tip');
      return;
    }
    if (!(P.smokeLeft > 0)) { this.addCombatLog('[[cloud]] Đã hết lựu đạn khói trong ống phóng' + this.stockNote('SMOKE'), 'alert'); return; }
    if (!Equipment.smokeSides(P)) { this.addCombatLog('[[alert-triangle]] Cả hai cụm ống phóng lựu khói đã bị bắn hỏng!', 'alert'); return; }
    if (P._smokeAt && performance.now() - P._smokeAt < Equipment.SMOKE_GAP) return;   // loạt trước vừa bắn (chống bấm đúp)
    const r = Equipment.triggerSmoke(this, P);
    if (!r) return;
    const one = r.m !== 3 ? (Equipment.smokeSides(P) === 3 ? ' (quả cuối, 1 bên)' : ' (1 bên ống phóng đã hỏng)') : '';
    this.addCombatLog(`[[cloud]] Đã bắn ${Equipment.smokeCount(r.m)} quả lựu đạn khói${one} — trong ống còn ${P.smokeLeft} quả`, 'tip');
    if (r.k) this.addCombatLog('[[lock-off]] Đang bị khóa: khói đa phổ sẽ cắt tia khóa của địch khi khói nở', 'tip');
    this.syncEquipmentChips();
  }

  // Ô trạng thái trang bị trên thanh dưới: khói còn lại, lượt đánh chặn
  syncEquipmentChips() {
    const P = this.player;
    const host = domById('speed-boost-tag');
    if (!host || !host.parentElement) return;
    let el = domById('eq-chips');
    if (!el) { el = document.createElement('span'); el.id = 'eq-chips'; el.className = 'hx-chip'; el.style.color = '#cbd5e1'; host.parentElement.appendChild(el); }
    if (!P || P.isDead || typeof Equipment === 'undefined' || !P.kit) { UIIcons.set(el, ''); return; }
    const parts = [];
    if (Equipment.has(P, 'smoke')) parts.push(`[[cloud]] KHÓI ×${P.smokeLeft || 0} [G]`);
    if (Equipment.has(P, 'aps')) parts.push(`[[radar]] ĐÁNH CHẶN ×${Equipment.apsLeft(P)}`);
    // lưới lá: đứng yên = ẩn (địch phải tới gần mới thấy / radar mới bắt được), chạy hoặc vừa bắn = lộ
    // lưới bắt lửa: đang cháy = lộ hẳn (khói lửa); cháy hết = mất lưới tới lần xuất kích sau
    const cfs = window.CamoFire ? CamoFire.status(P) : 'none';
    if (Equipment.has(P, 'camo') && cfs === 'burning') parts.push('[[flame]] LƯỚI NGỤY TRANG ĐANG CHÁY');
    else if (Equipment.has(P, 'camo') && cfs === 'gone') parts.push('[[leaf-off]] LƯỚI NGỤY TRANG ĐÃ CHÁY');
    else if (Equipment.has(P, 'camo') && Equipment.camoRadarFactor) parts.push(Equipment.camoRadarFactor(P) < 1 ? '[[leaf]] NGỤY TRANG: ẨN' : '[[leaf]] NGỤY TRANG: LỘ');
    UIIcons.set(el, parts.join('   '));
    el.style.color = cfs === 'burning' ? '#f0a54a' : '#cbd5e1';
    el.classList.toggle('hidden', !parts.length);
  }

  // Phe của người chơi trên máy này (khách vào phòng có thể ở Phe Đỏ)
  myTeam() {
    return this.player && this.player.team === 'RED' ? 'RED' : 'BLUE';
  }

  // Bảng kết quả cuối trận — luôn viết theo góc nhìn đội của người chơi
  showMatchResult(result, subText) {
    const modal = domById('game-over-modal');
    const title = domById('game-over-title');
    const sub = domById('game-over-subtitle');
    const T = { win: ['victory-title', 'CHIẾN THẮNG!'], loss: ['defeat-title', 'THẤT BẠI'], draw: ['draw-title', 'HÒA'] }[result];
    if (title) { title.className = T[0]; title.textContent = T[1]; }
    if (sub) sub.textContent = subText;
    if (result === 'win' && window.soundEngine && typeof window.soundEngine.playVictoryFanfare === 'function') window.soundEngine.playVictoryFanfare();
    // nhạc kết trận: dàn nhạc thắng / thua / hòa (src/core/audio/music.js)
    if (window.soundEngine && typeof window.soundEngine.setMusicMode === 'function') window.soundEngine.setMusicMode({ win: 'victory', loss: 'defeat', draw: 'draw' }[result] || 'off');
    // Màn hình kết quả: nhả phím đang giữ, đóng bản đồ lớn / menu tạm dừng nếu đang mở
    this.keys = {};
    if (this.tacticalMap && this.tacticalMap.isOpen && this.tacticalMap.toggle) this.tacticalMap.toggle(false);
    if (window.GameMenu && GameMenu.close) GameMenu.close();

    const elapsedSecs = Math.min(this.matchDuration || 600, Math.floor((Date.now() - this.matchStartTime) / 1000));
    const m = Math.floor(elapsedSecs / 60);
    const s = elapsedSecs % 60;
    const set = (id, v) => { const el = domById(id); if (el) el.textContent = v; };
    set('stat-shots', String(this.player ? this.player.shotsFired : 0));
    set('stat-kills', String(this.player ? this.player.kills : 0));
    set('stat-damage', String(this.player ? Math.round(this.player.damageDealt) : 0));
    set('stat-time', `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
    this.renderKdPodium();
    if (modal) modal.classList.remove('hidden');
  }

  // Top 3 hạ gục / bị hạ cả trận: được thưởng thêm Bạc (mua trang bị) & kinh nghiệm — máy chủ cộng khi lưu kết quả
  renderKdPodium() {
    this._kdPlace = 0;
    const card = document.querySelector('#game-over-modal .stats-summary');
    if (!card || typeof Equipment === 'undefined' || !Equipment.rankKD) return;
    const top = Equipment.rankKD(this.units.map(u => ({ key: u, kills: u.kills || 0, deaths: u.deaths || 0, damage: u.damageDealt || 0 })));
    this._kdPlace = top.findIndex(t => t.key === this.player) + 1;
    let el = domById('kd-podium');
    if (!el) { el = document.createElement('div'); el.id = 'kd-podium'; el.className = 'kd-podium'; card.after(el); }
    const esc = (t) => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const rows = top.map((t, i) => {
      const u = t.key, me = u === this.player;
      return `<li class="kd-row p${i + 1}${me ? ' me' : ''}">`
        + `<span class="kd-medal"><i class="ti ti-medal"></i>${i + 1}</span>`
        + `<span class="kd-name ${u.team === 'RED' ? 'red' : 'blue'}">${esc(me ? 'BẠN' : u.name)}</span>`
        + `<span class="kd-val"><b>${t.kills}</b> hạ · <b>${t.deaths}</b> bị hạ</span>`
        + `<span class="kd-bonus"><i class="ti ti-coins"></i> +${Equipment.KD_BONUS[i].silver} Bạc</span></li>`;
    }).join('');
    el.innerHTML = `<div class="kd-title"><i class="ti ti-trophy"></i> TOP 3 HẠ GỤC NHIỀU, ÍT BỊ HẠ</div>`
      + (rows ? `<ol>${rows}</ol>` : `<div class="kd-empty">Chưa ai hạ được xe nào</div>`)
      + `<div class="kd-note">Bạc thưởng dùng để mua trang bị & đạn cho xe</div>`;
  }

  // Cứ điểm A / B / C: toàn bộ logic nằm ở CapturePointsManager (src/gameplay/capture_points.js)
  initCapturePoints() {
    return this.capturePointsManager ? this.capturePointsManager.init() : [];
  }

  updateCapturePoints(dt) {
    if (this.capturePointsManager) this.capturePointsManager.updateCapturePoints(dt, this.units);
  }

  updateCapturePointsUI() {
    if (this.capturePointsManager) this.capturePointsManager.updateCapturePointsUI();
  }

  // Chuyển đổi loại map chiến trường thời gian thực
  changeMap(mapType) {
    if (!mapType) return;
    this.currentMapType = mapType;
    if (this.terrain) {
      this.terrain.setMapType(mapType);
      this.mapSeed = this.terrain.seed;
      this.applyAtmosphereLights();
    }

    // Tái định vị các cứ điểm A, B, C theo độ cao map mới
    if (this.capturePoints && this.capturePoints.length > 0) {
      this.capturePoints.forEach(cp => {
        if (cp.mesh) {
          const newY = this.terrain.getElevationAt(cp.x, cp.z);
          cp.y = newY;
          cp.mesh.position.y = newY;
        }
      });
    }

    // Tái định vị các hòm tiếp tế theo độ cao map mới
    if (this.supplyCrates && this.supplyCrates.length > 0) {
      this.supplyCrates.forEach(crate => {
        if (crate.mesh) {
          const newY = this.terrain.getElevationAt(crate.x, crate.z);
          crate.y = newY + 7;
          crate.mesh.position.y = crate.y;
        }
      });
    }

    // Vẽ lại bản đồ vệ tinh chiến thuật
    if (this.tacticalMap && typeof this.tacticalMap.renderSatelliteMap === 'function') {
      this.tacticalMap.renderSatelliteMap();
    }

    let mapName = 'Sa Mạc Lửa';
    if (mapType === 'URBAN') mapName = 'Đô Thị Đổ Nát';
    else if (mapType === 'JUNGLE') mapName = 'Rừng Rậm Nhiệt Đới';
    else if (mapType === 'HIGHLAND') mapName = 'Cao Nguyên Đồi Núi';
    else if (mapType === 'RIVER_LAKE') mapName = 'Sông Hồ Phân Tranh';

    this.addCombatLog(`[[map-2]] Chiến địa đã chuyển sang: [${mapName.toUpperCase()}]!`, 'system');
  }

  triggerGameOver(isVictory) {
    this.finishMatchByTime();
  }

  restartMatch() {
    domById('game-over-modal').classList.add('hidden');
    const respawnBanner = domById('player-respawn-banner');
    if (respawnBanner) respawnBanner.classList.add('hidden');

    this.isGameOver = false;
    this.matchStartTime = Date.now();
    this._playerDeaths = 0;
    if (typeof TeamIntel !== 'undefined') TeamIntel.reset();
    if (typeof Equipment !== 'undefined' && Equipment.clearSmoke) Equipment.clearSmoke();
    this.setLockedTarget(null);
    this._spotMarkers = null;   // scene sắp bị dọn sạch
    this._autoMarker = null; this.autoDrive = null;

    // Dọn dẹp scene 3D cũ
    while (this.scene.children.length > 0) {
      this.scene.remove(this.scene.children[0]);
    }
    // Hiệu ứng nổ dùng chung qua các trận: xoá dấu vết trận cũ (hố, vết đạn, mảnh vụn) rồi gắn lại các lớp vào cảnh mới dọn
    const fxR = this.effectsManager && this.effectsManager.fx;
    if (fxR) { if (fxR.clear) fxR.clear(); if (fxR.reattach) fxR.reattach(); }

    this.blueLives = Infinity;
    this.redLives = Infinity;
    this.blueKills = 0;
    this.blueDeaths = 0;
    this.redKills = 0;
    this.redDeaths = 0;
    this.respawnQueue = [];

    this.setupLighting();
    this.terrain = new BattleTerrain3D(this.scene, this.worldWidth, this.worldDepth, this.currentMapType, this.mapSeed);
    this.applyAtmosphereLights();
    if (typeof ExplosionFX !== 'undefined' && ExplosionFX.clearGroundHoles) ExplosionFX.clearGroundHoles();
    this.ballistics = new BallisticsSystem3D(this.scene);
    this.ballistics.vegetationProvider = () => this.terrain && this.terrain.trees;
    this.ballistics.terrainProvider = () => this.terrain;
    if (this.effectsManager) this.ballistics.fx = this.effectsManager.fx;
    this.radar = new CounterBatteryRadar();
    this.zone = new BattleZone(this.worldWidth, this.worldDepth);
    this.explosions3D = [];
    this.airdrop = null;
    this.airdropTimer = 25;

    // Tạo lại đường đạn dự kiến (scene vừa được dọn sạch)
    this.trajectoryLine = WorldMarkers.trajectory();
    this.trajectoryMat = this.trajectoryLine.material;
    this.scene.add(this.trajectoryLine);
    this._aimAnchor = null;

    this.initEntities3D();
    this.updateTeamScoreUI();
    this.syncHUDControls();
    this.updateAmmoUI();

    // Mở lại Sảnh Chờ Ghép Trận Nhiều Người Chơi
    if (this.matchmaking) {
      this.isGameStarted = false;
      // [NET] Gỡ đồng bộ trận cũ, rời phòng mạng, hiện lại sảnh (chờ bấm "TÌM TRẬN ĐẤU")
      if (typeof this.matchmaking.onReturnToLobby === 'function') this.matchmaking.onReturnToLobby();
    }
  }
}

// drone trinh sát trên chiến trường: đồng bộ mạng, bị bắn hạ, phòng không của xe 6 nòng / trinh sát (drone_air.js)
if (typeof DroneAir !== 'undefined') Object.assign(ArtilleryGame3D.prototype, DroneAir.methods);

window.ArtilleryGame3D = ArtilleryGame3D;

// DRONE TRINH SÁT của pháo tự hành (giây thật trong trận 10 phút):
// flight: bay treo hết một lần sạc đầy (bay nhanh tốn pin hơn, tới 1.6 lần) · charge: sạc từ cạn tới đầy khi nằm trên xe
// minLaunch: pin tối thiểu để cất cánh · rthSpeed: tốc độ tự bay về (đv/s) · reserveS: dự phòng khi tính pin bay về
// warn: các mức báo pin yếu. (Drone trinh sát thật bay 25-40 phút; game nén thời gian một nửa và trận chỉ 10 phút
// nên lấy theo nhịp chơi: bay ~2/3 thời gian, phải về sạc vài lần mỗi trận.)
// speed / fastSpeed: tốc độ bay khi lái (đv/s, Shift: nhanh) · autoSpeed: tự bay ra vùng ngắm · climbRate: lên / xuống tối đa
// yawRate: xoay (rad/s) · cruiseAlt: độ cao bay mặc định trên mặt đất · gimbal: góc chúc camera (rad)
// signalExtra: tầm tín hiệu = tầm bắn tối đa của pháo + chừng này
ArtilleryGame3D.DRONE = {
  flight: 120, charge: 60, minLaunch: 0.2, rthSpeed: 700, reserveS: 3, warn: [0.3, 0.15],
  speed: 260, fastSpeed: 620, autoSpeed: 650, climbRate: 180, yawRate: 1.2, cruiseAlt: 420, gimbal: -0.91, signalExtra: 400
};

// Khởi động Game 3D khi trang sẵn sàng (Cơ chế an toàn kép)
function startArtilleryGameInstance() {
  if (!window.artilleryGame) {
    try {
      window.artilleryGame = new ArtilleryGame3D();
      window.game = window.artilleryGame;
      console.log('Chiến địa pháo binh 3D đã khởi động thành công!');
    } catch (err) {
      console.error('Lỗi khi khởi động ArtilleryGame3D:', err);
    }
  }
}

window.startArtilleryGameInstance = startArtilleryGameInstance;

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', startArtilleryGameInstance);
} else {
  startArtilleryGameInstance();
}
