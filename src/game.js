/**
 * Bộ điều phối trò chơi 3D Three.js - Góc nhìn từ trên nghiêng xuống chuẩn Art of War 3
 */
class ArtilleryGame3D {
  constructor() {
    this.container = document.getElementById('webgl-container');

    this.worldWidth = 3600;
    this.worldDepth = 3600;

    // 1. Khởi tạo Three.js Scene, Camera, Renderer
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xd6ba78); // Màu trời sa mạc vàng ấm

    this.camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      1,
      6000
    );

    this.renderer = new THREE.WebGLRenderer({ antialias: !(window.GameMenu && GameMenu.wantAntialias() === false) });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
    this.miniCanvas = document.getElementById('aow-minimap-canvas');
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

    // ĐƯỜNG ĐẠN NÉT ĐỨT 3D TÍNH TOÁN TRƯỚC TỪ ĐẦU NÒNG (DASHED TRAJECTORY)
    this.trajectoryGeo = new THREE.BufferGeometry();
    this.trajectoryMat = new THREE.LineDashedMaterial({
      color: 0x00f0ff,
      dashSize: 8,
      gapSize: 5,
      scale: 1,
      linewidth: 2,
      transparent: true,
      opacity: 0.95,
      depthWrite: false
    });
    this.trajectoryLine = new THREE.Line(this.trajectoryGeo, this.trajectoryMat);
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

    // 3. Tâm ngắm laser 3D chiếu điểm rơi dự kiến trên mặt đất (Projected 3D Landing Reticle)
    this.reticle3D = new THREE.Group();

    const reticleRingGeo = new THREE.RingGeometry(8, 10.5, 24);
    reticleRingGeo.rotateX(-Math.PI / 2);
    this.reticleRingMat = new THREE.MeshBasicMaterial({
      color: 0xffb700,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    this.reticleRingMesh = new THREE.Mesh(reticleRingGeo, this.reticleRingMat);
    this.reticle3D.add(this.reticleRingMesh);

    const reticleCrossGeo1 = new THREE.PlaneGeometry(22, 1.5);
    reticleCrossGeo1.rotateX(-Math.PI / 2);
    const reticleCrossMesh1 = new THREE.Mesh(reticleCrossGeo1, this.reticleRingMat);
    this.reticle3D.add(reticleCrossMesh1);

    const reticleCrossGeo2 = new THREE.PlaneGeometry(1.5, 22);
    reticleCrossGeo2.rotateX(-Math.PI / 2);
    const reticleCrossMesh2 = new THREE.Mesh(reticleCrossGeo2, this.reticleRingMat);
    this.reticle3D.add(reticleCrossMesh2);

    this.scene.add(this.reticle3D);

    // 4. Khung ngắm 3D khóa mục tiêu điện tử (Target Lock Reticle 3D)
    this.lockReticle3D = new THREE.Group();

    // Vòng bát giác màu đỏ cảnh báo sắc nét
    const lockRingGeo = new THREE.RingGeometry(11, 13.5, 8);
    lockRingGeo.rotateX(-Math.PI / 2);
    const lockMat = new THREE.MeshBasicMaterial({
      color: 0xff2233,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
      depthWrite: false
    });
    this.lockRingMesh = new THREE.Mesh(lockRingGeo, lockMat);
    this.lockReticle3D.add(this.lockRingMesh);

    // 4 góc ngắm chữ L vuông vức màu vàng cam nổi bật
    const bracketMat = new THREE.MeshBasicMaterial({
      color: 0xffcc00,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95,
      depthWrite: false
    });
    [-1, 1].forEach(sx => {
      [-1, 1].forEach(sz => {
        const hGeo = new THREE.PlaneGeometry(6, 1.2);
        hGeo.rotateX(-Math.PI / 2);
        const hMesh = new THREE.Mesh(hGeo, bracketMat);
        hMesh.position.set(sx * 14, 0.2, sz * 16.5);
        this.lockReticle3D.add(hMesh);

        const vGeo = new THREE.PlaneGeometry(1.2, 6);
        vGeo.rotateX(-Math.PI / 2);
        const vMesh = new THREE.Mesh(vGeo, bracketMat);
        vMesh.position.set(sx * 16.5, 0.2, sz * 14);
        this.lockReticle3D.add(vMesh);
      });
    });

    // Mũi tên tam giác 3D chỉ thẳng xuống nóc xe mục tiêu
    const arrowGeo = new THREE.ConeGeometry(3.5, 7, 4);
    arrowGeo.rotateX(Math.PI);
    const arrowMesh = new THREE.Mesh(arrowGeo, new THREE.MeshBasicMaterial({ color: 0xff2233 }));
    arrowMesh.position.set(0, 15, 0);
    this.lockReticle3D.add(arrowMesh);

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
    const SHs = this.terrain && this.terrain.map && this.terrain.map.strongholds;
    if (SHs && SHs.length && this.zone && this.zone.focusOn) this.zone.focusOn(SHs);
    this.initEntitiesWithSlots(slots, myPeerId);
    // [NET] Gắn đồng bộ mạng: xe từ xa nội suy, bot do chủ phòng điều khiển, bắn bù trễ, sát thương có chủ quyền
    // (trả về null khi chơi độc lập / file:// -> hành vi y như cũ)
    this.netSync = (typeof NetGameSync !== 'undefined' && this.matchmaking && this.matchmaking.net)
      ? NetGameSync.attach(this, this.matchmaking.net, slots) : null;
    if (this.netSync) this.startBackgroundTicker();

    const meSlot = slots.find(s => s.peerId === myPeerId);
    const myName = meSlot ? meSlot.name : 'CHỈ HUY LIÊN MINH';

    this._playerDeaths = 0;
    this.addCombatLog(`[[rocket]] XUẤT TRẬN THÀNH CÔNG! Chào mừng ${myName} vào chiến địa!`, 'tip');
    this.addCombatLog('[[swords]] Chiếm và giữ 1 cứ điểm A, B hoặc C đủ 60 giây để thắng — hoặc hạ nhiều địch hơn khi hết giờ', 'system');
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

      // Phím G: phóng lựu đạn khói (trang bị mua thêm)
      if (e.code === 'KeyG' && !e.repeat) this.triggerPlayerSmoke();

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

      // Click vào xe địch: khóa luôn xe đó (nòng tự tính góc & đón đầu)
      const clickedEnemy = pickEnemyAt(clientX, clientY);
      if (clickedEnemy) {
        this.setLockedTarget(clickedEnemy, true);
        return;
      }

      setMouse(clientX, clientY);
      const intersects = raycaster.intersectObject(this.terrain.mesh);
      let targetPoint = null;

      if (intersects.length > 0) {
        targetPoint = intersects[0].point;
      } else {
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        targetPoint = new THREE.Vector3();
        if (!raycaster.ray.intersectPlane(plane, targetPoint)) targetPoint = null;
      }

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
      const hits = raycaster.intersectObject(this.terrain.mesh);
      let pt = hits.length ? hits[0].point : null;
      if (!pt) { pt = new THREE.Vector3(); if (!raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), pt)) pt = null; }
      if (pt) this.setAutoDriveTarget(pt.x, pt.z);
    });

    // Nhấp chuột trái vào màn hình 3D để ngắm nhanh
    this.renderer.domElement.addEventListener('pointerdown', (e) => {
      if (e.button === 0) {
        handleAimFromScreen(e.clientX, e.clientY);
      }
    });
  }

  // Phóng tên lửa dẫn hướng của xe trinh sát (ô đạn 3 + Space): chỉ khi đầu dò đã khóa chắc
  // một xe địch mà kíp xe đang nhìn thấy
  triggerPlayerAntiTank() {
    const P = this.player;
    if (!P || P.isDead || P.tankType !== 'SCOUT') return;
    if ((P.missileAmmoCount || 0) <= 0) {
      this.addCombatLog('[[alert-triangle]] Đã hết tên lửa! Hãy nhặt hòm tiếp tế để nạp thêm!', 'alert');
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
      const c = !active || S.state === 'none' ? 0xff2233
        : S.state === 'locked' ? 0x33ff88
          : S.state === 'blind' ? 0x8899aa
            : (Math.sin(Date.now() * 0.03) > 0 ? 0xffcc00 : 0xff7a00);
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
    const box = document.getElementById('lock-warning');
    const arrows = document.getElementById('threat-arrows');
    const W = this._threatW || (this._threatW = { beep: 0, mbeep: 0, wasMissile: false });
    const threats = [];   // { x, z, kind: 'gun' | 'mlock' | 'missile', d }
    if (P && !P.isDead) {
      const now = Date.now();
      for (const u of this.units) {
        if (!u || u.isDead || u.team === P.team || !u._lockOn) continue;
        if (u._lockOn.id !== P.id || now - u._lockOn.at > 3500) continue;
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
      if (W.beep <= 0) { W.beep = 0.45 - urg * 0.36; if (SE && SE.playMissileWarning) SE.playMissileWarning(urg); }
      if (!W.wasMissile) this.addCombatLog('[[rocket]] Tên lửa địch đang lao tới! Vào bụi hoặc rừng rậm để kíp phóng mất dấu, hoặc hạ xe phóng để đứt điều khiển', 'alert');
    } else if (mlock || gun) {
      if (W.beep <= 0) { W.beep = mlock ? 0.55 : 1.3; if (SE && SE.playLockWarning) SE.playLockWarning(mlock ? 2 : 1); }
    } else W.beep = 0;
    W.wasMissile = !!missile;
  }

  // TÍNH TOÁN VÀ ĐỒNG BỘ NÒNG PHÁO KHÓA VÀO TỌA ĐỘ MỤC TIÊU
  aimPlayerAtTarget(targetX, targetZ) {
    if (!this.player || this.player.isDead) return;
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
    if (!sol.reachable) {
      this.addCombatLog(`[[x]] Không bắn tới điểm này (${d}M) — bị vật cản che hoặc quá xa, hãy tiến thêm / đổi vị trí`, 'alert');
    } else if (sol.lob) {
      this.addCombatLog(`[[crosshair]] Ngắm điểm cách ${d}M — vật cản chắn đường bắn thẳng, chuyển sang BẮN CẦU VỒNG (nâng nòng cao)`, 'tip');
    } else if (sol.lofted) {
      this.addCombatLog(`[[crosshair]] Ngắm điểm cách ${d}M — đường thẳng bị che, đã nâng nòng bắn vòng qua vật cản`, 'tip');
    } else {
      this.addCombatLog(`[[crosshair]] Ngắm điểm cách ${d}M — bắn tới được`, 'tip');
    }
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
      this.addCombatLog('[[alert-triangle]] Không thấy xe địch nào trong tầm nhìn — cần xe trinh sát (radar) báo vị trí!', 'alert');
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
    this.lockedTarget = target;
    this._lockLostT = 0;
    this._lockTrack = null;
    this._manualAim = false;
    if (target) this._aimPoint = null;   // khóa xe thay cho điểm ngắm mặt đất
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
      this.autoDrive = null;
      if (this._autoMarker) this._autoMarker.visible = false;
      return;
    }
    const W = this.terrain ? this.terrain.width / 2 - 70 : 1700, D = this.terrain ? this.terrain.depth / 2 - 70 : 1700;
    x = Math.max(-W, Math.min(W, x)); z = Math.max(-D, Math.min(D, z));
    this.autoDrive = { x, z, nav: {} };
    // tìm đường ngay để báo nếu không tới được
    const path = typeof Navigator !== 'undefined' ? Navigator.findPath(this.terrain, this.player, x, z) : [{ x, z }];
    this.autoDrive.nav = { tx: x, tz: z, path, idx: 0, replanT: 3, minT: 0.5 };
    const dist = Math.round(Math.hypot(x - this.player.x, z - this.player.z));
    if (!path) this.addCombatLog('[[alert-triangle]] Không tìm được đường tới điểm đó (vật cản / dốc quá cao với xe này) — xe sẽ chạy gần nhất có thể', 'alert');
    else this.addCombatLog(`[[route]] LÁI TỰ ĐỘNG tới điểm chỉ định (${dist}M${path.length > 1 ? `, vòng tránh vật cản qua ${path.length - 1} điểm` : ''}) — bấm W/A/S/D để tự lái`, 'tip');
    if (!this._autoMarker) {
      const g = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.RingGeometry(9, 12, 32), new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2;
      g.add(ring);
      const pin = new THREE.Mesh(new THREE.ConeGeometry(3, 8, 4), new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.8 }));
      pin.rotation.x = Math.PI; pin.position.y = 12;
      g.add(pin);
      g.renderOrder = 998;
      this.scene.add(g);
      this._autoMarker = g;
    }
    this._autoMarker.visible = true;
    this._autoMarker.position.set(x, this.terrain.getElevationAt(x, z) + 0.6, z);
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
    if (this._autoMarker) this._autoMarker.rotation.y += dt * 1.5;
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
    const r = this.ballistics && typeof this.ballistics.maxRangeFor === 'function' ? this.ballistics.maxRangeFor(u) : 0;
    return Math.max(1400, r || 0);
  }

  // Xe địch được phép khóa: mình đang biết vị trí (tầm nhìn / radar / đồng đội báo) hoặc đang hiện rõ trên màn hình
  // (sương mù chiến tranh ẩn xe chưa phát hiện bằng group.visible, nên điều kiện thứ hai không làm lộ xe địch)
  canTarget(u) {
    if (!u || u.isDead || !this.player || u.team === this.player.team) return false;
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
    if (!tr || tr.id !== T.id) tr = this._lockTrack = { id: T.id, x: T.x, z: T.z, vx: 0, vz: 0, flightT: 0, solveT: 0, el: P.elevation };
    // 1. Vận tốc mục tiêu từ chuyển động thực tế (đúng cho cả bot lẫn xe của máy khác)
    const ivx = (T.x - tr.x) / dt, ivz = (T.z - tr.z) / dt;
    if (Math.hypot(ivx, ivz) < 400) {   // bỏ qua cú nhảy vị trí (hồi sinh / hiệu chỉnh mạng)
      const k = 1 - Math.exp(-dt * 5);
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
    const aimX = T.x + lx, aimZ = T.z + lz;
    tr.aimX = aimX; tr.aimZ = aimZ;   // điểm cần rơi trúng (đã đón đầu) — để tô màu đường đạn khi đã ngắm trúng

    // 3. Xoay tháp theo đường ngắn nhất với tốc độ quay tháp
    // Bù độ nghiêng thân xe trên dốc: nòng thật (không phải góc lệnh) phải chỉ đúng nghiệm đường đạn
    const off = P.barrelWorldOffset ? P.barrelWorldOffset() : { el: 0, az: 0 };
    const want = (Math.atan2(aimX - P.x, -(aimZ - P.z)) * 180 / Math.PI - off.az + 360) % 360;
    const diff = ((want - P.azimuth + 540) % 360) - 180;
    const step = rotSpeed * dt;
    P.azimuth = (P.azimuth + Math.max(-step, Math.min(step, diff)) + 360) % 360;

    // 4. Góc tà: xe 6 nòng do máy tính hỏa lực tự nâng nòng; xe khác giải đường đạn ~8 lần/giây
    const ty = (T.y || this.terrain.getElevationAt(T.x, T.z));
    if (fixedGun) {
      // nòng do máy tính hỏa lực tự nâng: dùng nghiệm đường đạn (vòng qua vật cản nếu cần)
      tr.solveT -= dt;
      if (tr.solveT <= 0) {
        tr.solveT = 0.15;
        const sol = B.solveAimingForTarget(P.x, P.y, P.z, aimX, aimZ, this.terrain, P, { hintEl: tr.fel });
        tr.fel = sol && sol.reachable ? sol.elevation : undefined;
        tr.reachable = !!(sol && sol.reachable !== false);
      }
      P.fcsTarget = { x: aimX, z: aimZ, y: ty + 9, el: tr.fel };
    } else {
      tr.solveT -= dt;
      if (tr.solveT <= 0) {
        // lựu pháo: đạn bay lâu, mô phỏng nặng -> giải thưa hơn; luôn dò quanh nghiệm lần trước
        tr.solveT = P.tankType === 'ARTILLERY' ? 0.5 : 0.12;
        const sol = B.solveAimingForTarget(P.x, P.y, P.z, aimX, aimZ, this.terrain, P, { hintEl: tr.solved ? tr.el : undefined, hintCharge: tr.solved ? tr.charge : undefined });
        tr.solved = true;
        tr.reachable = !!(sol && sol.reachable !== false);
        if (sol) {
          tr.el = sol.elevation;
          if (sol.charge) { tr.charge = sol.charge; P.charge = sol.charge; }   // lựu pháo: liều phóng theo cự ly
          tr.flightT = Math.min(30, (sol.flightTime || 0) / mult);
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

  // Chuỗi chấm sáng dọc đường đạn tính toán (nét đứt WebGL chỉ dày 1px, nhìn từ trên cao rất khó thấy)
  updateTrajectoryDots(points, color) {
    if (!this._trajDots || this._trajDots.parent !== this.scene) {
      const mat = new THREE.PointsMaterial({ size: 4.5, sizeAttenuation: true, transparent: true, opacity: 0.95, depthWrite: false });
      this._trajDots = new THREE.Points(new THREE.BufferGeometry(), mat);
      this._trajDots.renderOrder = 997;
      this._trajDots.frustumCulled = false;
      this.scene.add(this._trajDots);
    }
    // cách đều ~14 đơn vị một chấm
    const dots = [];
    let acc = 0;
    for (let i = 1; i < points.length; i++) {
      acc += points[i].distanceTo(points[i - 1]);
      if (acc >= 14) { acc = 0; dots.push(points[i]); }
    }
    this._trajDots.geometry.setFromPoints(dots);
    this._trajDots.material.color.setHex(color);
    this._trajDots.visible = dots.length > 0;
  }

  // Dấu neo điểm ngắm trên mặt đất (vòng + cọc): tháp & nòng tự bám điểm này khi xe di chuyển
  updateAimAnchor(dt) {
    const A = this._aimPoint;
    if (!A || !this.player || this.player.isDead) {
      if (this._aimAnchor) this._aimAnchor.visible = false;
      return;
    }
    if (!this._aimAnchor || this._aimAnchor.parent !== this.scene) {
      const g = new THREE.Group();
      const mat = new THREE.MeshBasicMaterial({ color: 0xffb020, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false });
      const ring = new THREE.Mesh(new THREE.RingGeometry(10, 12.5, 40), mat);
      ring.rotation.x = -Math.PI / 2;
      g.add(ring);
      for (let k = 0; k < 4; k++) {
        const tick = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 7), mat);
        tick.rotation.x = -Math.PI / 2;
        tick.rotation.z = k * Math.PI / 2;
        tick.position.set(Math.sin(k * Math.PI / 2) * 16, 0, Math.cos(k * Math.PI / 2) * 16);
        g.add(tick);
      }
      const pin = new THREE.Mesh(new THREE.ConeGeometry(2.6, 9, 4), mat);
      pin.rotation.x = Math.PI;
      pin.position.y = 14;
      g.add(pin);
      g.renderOrder = 998;
      this.scene.add(g);
      this._aimAnchor = g;
      this._aimAnchorMat = mat;
    }
    const g = this._aimAnchor;
    g.visible = true;
    g.position.set(A.x, A.y + 0.8, A.z);
    g.rotation.y += dt * 0.8;
    this._aimAnchorMat.color.setHex(this._aimState === 'on' ? 0x5cf08a : this._aimState === 'blocked' ? 0xff3b30 : 0xffb020);
    this.updateTargetLockUI();
  }

  updateTargetLockUI() {
    const box = document.getElementById('target-lock-stat-box');
    const textEl = document.getElementById('target-lock-text');
    const subEl = document.getElementById('target-lock-sub');
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
      const tHp = document.getElementById('target-hp-bar');
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
      : this._aimState === 'blocked' ? 'KHÔNG BẮN TỚI — ĐỔI VỊ TRÍ'
        : 'ĐANG XOAY THÁP / NÒNG...';
  }

  updateTeamScoreUI() {
    if (this.hud) {
      return this.hud.updateTeamScoreUI();
    }
    const blueLivesEl = document.getElementById('blue-lives-count');
    const redLivesEl = document.getElementById('red-lives-count');
    const blueKdEl = document.getElementById('blue-kd-val');
    const redKdEl = document.getElementById('red-kd-val');
    const blueUnitsEl = document.getElementById('blue-units-count');
    const redUnitsEl = document.getElementById('red-units-count');
    const scoreBlueEl = document.getElementById('score-blue-val');
    const scoreRedEl = document.getElementById('score-red-val');

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
      const momentumBlue = document.getElementById('kill-momentum-blue');
      const momentumRed = document.getElementById('kill-momentum-red');
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
      const blueTankIconsContainer = document.getElementById('blue-tank-icons');
      if (blueTankIconsContainer) {
        blueTankIconsContainer.innerHTML = this.renderTankIconsHTML(blueUnits, 'BLUE');
      }

      // Cập nhật danh sách icon xe tăng hàng ngang của Phe Đỏ
      const redTankIconsContainer = document.getElementById('red-tank-icons');
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
    const fireBtn = document.getElementById('fire-btn');
    if (fireBtn) {
      fireBtn.addEventListener('click', () => this.triggerPlayerFire());
      // Giữ nút bắn để xả đạn liên thanh (xe 6 nòng / trinh sát)
      fireBtn.addEventListener('pointerdown', () => { this.isPointerFiring = true; });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => {
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


    const restartBtn = document.getElementById('restart-game-btn');
    if (restartBtn) {
      restartBtn.addEventListener('click', () => this.restartMatch());
    }
  }

  selectAmmoType(ammoType) {
    if (this.hud) return this.hud.selectAmmoType(ammoType);
    if (!this.player) return;

    // Kiểm tra cơ số đạn nâng cao
    if (ammoType === 'AP' && (this.player.apAmmoCount || 0) <= 0) {
      this.addCombatLog('[[alert-triangle]] Đã hết đạn xuyên phá! Hãy tìm nhặt hòm tiếp tế trên map!', 'alert');
      return;
    }
    if (ammoType === 'HE' && (this.player.heAmmoCount || 0) <= 0 && this.player.tankType !== 'ARTILLERY') {
      this.addCombatLog('[[alert-triangle]] Đã hết đạn nổ mạnh! Hãy tìm nhặt hòm tiếp tế trên map!', 'alert');
      return;
    }
    if (ammoType === 'CLUSTER' && (this.player.clusterAmmoCount || 0) <= 0) {
      this.addCombatLog('[[alert-triangle]] Đã hết đạn chùm nổ trên không! Hãy nhặt hòm tiếp tế để nạp thêm!', 'alert');
      return;
    }
    if (ammoType === 'INCENDIARY' && (this.player.incendiaryAmmoCount || 0) <= 0) {
      this.addCombatLog('[[alert-triangle]] Đã hết đạn cháy nâng cao! Súng chuyển về đạn nhỏ liên thanh cơ bản!', 'alert');
      return;
    }
    if (ammoType === 'ANTI_TANK_MISSILE' && (this.player.missileAmmoCount || 0) <= 0) {
      this.addCombatLog('[[alert-triangle]] Đã hết tên lửa! Hãy nhặt hòm tiếp tế để nạp thêm!', 'alert');
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
    const ammoContainer = document.getElementById('ammo-selector');
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
      const btn = document.getElementById(`ammo-tab-${type}`);
      if (btn) {
        btn.addEventListener('click', () => this.selectAmmoType(type));
      }
    });

    const armorTag = document.getElementById('reactive-armor-tag');
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

  triggerPlayerFire() {
    if (!this.player || this.player.isDead) return;
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

      // Kiểm tra khoảng cách mục tiêu đang khóa: Không được bắn mục tiêu quá sát thân xe (< 45m)
      if (this.lockedTarget) {
        const dist = Math.hypot(this.lockedTarget.x - this.player.x, this.lockedTarget.z - this.player.z);
        const minD = this.player.minFiringDist || 440;
        if (dist < minD) {
          this.addCombatLog(`[[alert-triangle]] Mục tiêu quá gần (${Math.round(dist)}m < ${Math.round(minD)}m)! Lựu pháo bắn cầu vồng không thể hạ đạn xuống sát thân xe!`, 'alert');
          return;
        }
      }
    }

    const firedShell = this.player.fire(this.ballistics, this.radar);
    if (firedShell) {
      if (this.matchmaking) {
        this.matchmaking.broadcastMyFire(firedShell);
      }
      this.cameraShake = (this.player.tankType === 'ARTILLERY') ? 5 : 3;   // giật nhẹ khi khai hỏa (trước 16-28)
      this.updateAmmoUI();

    }
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
      // Nổ dưới mặt nước: cột nước trắng xóa + sóng mù + gợn sóng
      const depth = this.terrain && this.terrain.groundAtRaw ? Math.max(0.5, y - this.terrain.groundAtRaw(x, z)) : 6;
      fxSys.waterBurst(x, y, z, ammoType, !!shell.isHeavyArty, depth);
      fxDone = true;
    }
    const remoteShell = !!(this.netSync && this.netSync.skipShellDamage && this.netSync.skipShellDamage(shell, this.units.find(u => u.id === shell.shooterId)));
    // Trúng nhà: pháp tuyến đúng mặt tường / sàn / mái bị chạm -> lửa, mảnh văng bật ra đúng phía
    const bn = hitType === 'BUILDING' && shell.hitNormal && shell.hitNormal.ny !== undefined ? { x: shell.hitNormal.nx, y: shell.hitNormal.ny, z: shell.hitNormal.nz } : null;
    if (!fxDone) this.createImpactEffects(x, y, z, ammoType, hitType, { heavy: !!shell.isHeavyArty, dir: { x: shell.vx || 0, y: shell.vy || 0, z: shell.vz || 0 }, normal: bn || undefined, noCrater: remoteShell || hitType === 'TREE' || hitType === 'SANDBAG' });
    // Đạn xuyên giáp đâm thủng tường: lõi urani vỡ nóng đỏ + bê tông phụt ra mặt sau (nhà: lỗ ra ở vách bên kia do Destructibles tính)
    if (ammoType === 'AP' && !onStronghold && hitType === 'WALL' && fxSys && fxSys.spallCone) {
      const dv = new THREE.Vector3(shell.vx || 0, shell.vy || 0, shell.vz || 0);
      if (dv.lengthSq() > 1) {
        dv.normalize();
        fxSys.spallCone(new THREE.Vector3(x, y, z).addScaledVector(dv, 12), dv, 46, { spread: 0.42, dust: [0.72, 0.7, 0.66] });
      }
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
      window.soundEngine.playExplosionAtDistance(distToPlayer, hitType, ammoType, { x, z }, { heavy: !!shell.isHeavyArty });
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
        directDamage = (shooter && shooter.tankType === 'SCOUT') ? 0.12 : 0.1; // 12.7mm bắn chậm hơn nhưng mỗi viên mạnh hơn
      } else if (ammoType === 'INCENDIARY') {
        directDamage = (shooter && shooter.tankType === 'SCOUT') ? 0.14 : 0.16;
        if (typeof directTarget.ignite === 'function') {
          directTarget.ignite(2.0);
        }
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
        // Đạn nảy khỏi giáp nghiêng: chỉ còn chút sát thương va đập
        if (unitHit && unitHit.ricochet) directDamage = Math.round(directDamage * 0.12 * 1000) / 1000;
        this.reportVehicleDamage(directTarget, shooter, dmgRes.events);
      }
      // [NET] máy này có quyền với phát bắn -> gửi trạng thái hư hại bộ phận (đứt xích, cháy...) cho mọi máy
      if (this.netSync && this.netSync.queueParts) this.netSync.queueParts(directTarget);

      const res = directTarget.takeDamage(directDamage, shooter, 'DIRECT_HIT');

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
    let blastRadius = 55; // Mặc định cho đạn pháo 120mm tiêu chuẩn
    if (ammoType === 'GATLING_BULLET' || ammoType === 'SCOUT_BULLET') {
      blastRadius = 10;
    } else if (ammoType === 'INCENDIARY') {
      blastRadius = 16;
    } else if (ammoType === 'CLUSTER_SUBMUNITION') {
      blastRadius = 32; // Bán kính nổ mảnh văng đạn con
    } else if (ammoType === 'CLUSTER') {
      blastRadius = 85;
    } else if (ammoType === 'RPG' || ammoType === 'ANTI_TANK_MISSILE') {
      blastRadius = 45;
    } else if (ammoType === 'HE') {
      blastRadius = shell.isHeavyArty ? 135 : 75; // Bán kính nổ pháo HE mở rộng tương xứng uy lực
    } else if (ammoType === 'AP') {
      blastRadius = 9; // Đạn xuyên động năng không có thuốc nổ: chỉ mảnh vỡ sát điểm chạm
    } else if (shell.isHeavyArty) {
      blastRadius = 90;
    }

    this.units.forEach(unit => {
      if (unit._netHidden || unit._netStale) return;   // vị trí không rõ (máy chủ lọc tầm nhìn / mất gói quá lâu)
      // Xác xe trong vùng nổ: tiếp tục bị xé rã (chỉ hiệu ứng, không tính điểm)
      if (unit.isDead && unit.dmg && unit.group && unit.group.visible && typeof VehicleDamage !== 'undefined') {
        if (hitType === 'DIRECT_HIT' && unit === directTarget) return;
        const dW = Math.hypot(unit.x - x, unit.z - z);
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

        const dist = Math.hypot(unit.x - x, unit.z - z);
        if (dist <= blastRadius) {
          let splashDamage = (dist <= 25) ? 1.0 : 0.5;
          if (ammoType === 'GATLING_BULLET' || ammoType === 'SCOUT_BULLET') {
            // 30mm nổ-mảnh văng mảnh nhỏ sát điểm chạm; 12.7mm không có thuốc nổ
            splashDamage = (ammoType === 'SCOUT_BULLET' || (shooter && shooter.tankType === 'SCOUT')) ? 0 : 0.02;
          } else if (ammoType === 'INCENDIARY') {
            splashDamage = 0.08;
            if (typeof unit.ignite === 'function' && dist <= 12) unit.ignite(1.5);
          } else if (ammoType === 'CLUSTER_SUBMUNITION') {
            splashDamage = 0.45; // Mảnh văng sát thương nhỏ diện rộng
          } else if (ammoType === 'RPG' || ammoType === 'ANTI_TANK_MISSILE') {
            splashDamage = 1.3;
          } else if (shell.isHeavyArty) {
            splashDamage = (dist <= 55) ? 2.2 : 1.2; // Pháo HE hạng nặng nổ lan cực mạnh
          } else if (ammoType === 'HE') {
            splashDamage = (dist <= 35) ? 1.6 : 0.9;
          } else if (ammoType === 'AP') {
            splashDamage = 0.15;   // không thuốc nổ: chỉ mảnh vỡ / bụi kim loại cháy sát điểm chạm
          }

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
          if (typeof VehicleDamage !== 'undefined') {
            const dmgRes = VehicleDamage.onSplash(unit, { x, y, z, ammo: ammoType, heavy: !!shell.isHeavyArty, dist, radius: blastRadius, shooter, fx: fxSys });
            splashDamage = Math.round(splashDamage * dmgRes.mul * 1000) / 1000;
            // phần cộng thêm của đạn cao cấp không vượt ngưỡng 1 phát máy chủ chấp nhận (2.6 máu)
            if (premSplash > 1) splashDamage = Math.min(splashDamage, Math.max(2.5, splashDamage / premSplash));
            this.reportVehicleDamage(unit, shooter, dmgRes.events);
          }
          if (this.netSync && this.netSync.queueParts) this.netSync.queueParts(unit);

          const res = unit.takeDamage(splashDamage, shooter, 'SHELL');

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
      const respawnBanner = document.getElementById('player-respawn-banner');
      const timeValEl = document.getElementById('player-respawn-time');
      const barFillEl = document.getElementById('player-respawn-bar');
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
        const timeValEl = document.getElementById('player-respawn-time');
        const barFillEl = document.getElementById('player-respawn-bar');
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
          const respawnBanner = document.getElementById('player-respawn-banner');
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
    const aliveCountEl = document.getElementById('alive-count');
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

    const zoneCenterX = this.zone.current.x - 1800;
    const zoneCenterZ = this.zone.current.y - 1800;

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
              lootMsg = 'GIÁP PHẢN ỨNG NỔ (CHỊU ĐƯỢC 1 VIÊN KHÔNG MẤT MÁU)!';
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
              if (window.soundEngine) window.soundEngine.playReloadDone();
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

    // Danh sách 11 vị trí rải rác chiến lược trên chiến trường 3600 x 3600
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

    crateLocations.forEach((loc, idx) => {
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
                if (window.soundEngine && typeof window.soundEngine.playReloadDone === 'function') {
                  window.soundEngine.playReloadDone();
                }
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

  loop(currentTime) {
    const now = typeof currentTime === 'number' && !isNaN(currentTime) ? currentTime : performance.now();
    const dt = Math.min(Math.max(0, (now - (this.lastTime || now)) / 1000), 0.1);
    this.lastTime = now;
    this._lastLoopAt = performance.now();

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
      if (this.lockedTarget) {
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

            // Cập nhật vị trí khung ngắm 3D xoay trên đầu xe địch
            if (this.lockReticle3D) {
              this.lockReticle3D.position.set(T.x, T.y + 16, T.z);
              this.lockReticle3D.rotation.y += dt * 3.2;
              const pulse = 1.0 + Math.sin(Date.now() * 0.009) * 0.12;
              this.lockReticle3D.scale.set(pulse, pulse, pulse);
              this.lockReticle3D.visible = true;
            }
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
        this.player.isFiringGatling = !missileSel && !!(this.keys['Space'] || this.isPointerFiring);
      }

      // 1.2. LÁI XE CƠ ĐỘNG: W / A / S / D
      let inputX = 0;
      let inputZ = 0;

      if (this.keys['KeyD']) inputX += 1;
      if (this.keys['KeyA']) inputX -= 1;
      if (this.keys['KeyS']) inputZ += 1;
      if (this.keys['KeyW']) inputZ -= 1;

      const isBoost = !!(this.keys['ShiftLeft'] || this.keys['ShiftRight']);
      if (this.autoDrive && (inputX || inputZ)) {
        // Người chơi tự cầm lái: hủy lái tự động
        this.setAutoDriveTarget(null);
        this.addCombatLog('[[route]] Đã hủy lái tự động — chuyển sang tự lái', 'tip');
      }
      if (this.autoDrive) this.updateAutoDrive(dt, isBoost);
      else this.player.steer(inputX, inputZ, dt, isBoost);

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
          flatTires: D ? cnt(D.flat) + cnt(D.gone) : 0
        });
        // Mô-tơ quay tháp: theo tốc độ người chơi xoay HƯỚNG NGẮM (tháp trong hệ toạ độ thế giới). Không tính phần bộ ổn định
        // quay bù khi thân xe xoay: thân xe trong game xoay tới ~166°/s nên phần bù đó làm mô-tơ rít hết cỡ mỗi lần đánh lái
        if (window.soundEngine.updateTurretDrive && this.player._turretYaw !== undefined) {
          const ty = this.player._turretYaw + (this.player.bodyAngle || 0);
          let dy = this._sndTurretYaw === undefined ? 0 : ty - this._sndTurretYaw;
          while (dy > Math.PI) dy -= Math.PI * 2;
          while (dy < -Math.PI) dy += Math.PI * 2;
          if (Math.abs(dy) > 0.5) dy = 0;   // nhảy hướng đột ngột (hồi sinh / đổi xe) không phải tháp đang quay
          this._sndTurretYaw = ty;
          window.soundEngine.updateTurretDrive(dt > 0 ? dy / dt : 0, this.player.tankType, !!(D && D.traverse < 0.999));
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
      // hoặc đồng đội trinh sát đang báo vị trí. Xe tăng thường không phát hiện được địch núp bụi.
      const known = (typeof TeamIntel !== 'undefined' && this.player)
        ? TeamIntel.knows(this.player, unit)
        : !(unit.isInBush && unit.revealTimer <= 0);
      unit.group.visible = known;
      unit.isHiddenFromPlayer = !known;
    });
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
      if (this.gfxGrass !== false) gc.update(this.camera.position.x, this.camera.position.z - 320 * (this._camK || 1) - 60);
    }

    // Cập nhật hàng chờ hồi sinh của các xe thuộc 2 phe
    this.updateRespawnQueue(dt);
    if (typeof Equipment !== 'undefined' && Equipment.update) Equipment.update(dt, this);

    // Xe mình bị hạ: máy tắt lịm, mô-tơ tháp dừng
    if (this.player && this.player.isDead && window.soundEngine && window.soundEngine.updateEngine) {
      window.soundEngine.updateEngine(0, false, 1, { dead: true });
      if (window.soundEngine.updateTurretDrive) window.soundEngine.updateTurretDrive(0, this.player.tankType);
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
                if (prev < R && Math.abs(s.y - (this.player.y || 0)) < 90) window.soundEngine.playFlyby(kind, prev, { x: s.x, z: s.z });
              } else s.flybyDone = true;        // bay ra xa ngay từ đầu (đạn đồng đội bắn cạnh mình)
            }
          }
        }
        // Đạn pháo đang rơi xuống: dự đoán thời điểm & điểm chạm đất, bắt đầu tiếng rít ~1.5-2.5 s trước
        // để tiếng xé gió dày dần và tắt đúng lúc nổ (bỏ qua đạn súng, tên lửa, đạn bắn thẳng)
        if (!s.whistled && s.vy < 0 && !s.isDirectFire && s.ammoType !== 'CLUSTER_SUBMUNITION' && this.ballistics.isGunRound && this.ballistics.isGunRound(s.ammoType)) {
          const B = this.ballistics, mult = B.bulletSpeedMultiplier || 1;
          const gr = s.g !== undefined ? s.g : B.gravityFor(s.ammoType, s.isDirectFire);   // trọng lực riêng của phát bắn (lựu pháo thu nhỏ theo tỉ lệ riêng)
          const h = s.y - (this.player.y || 0);
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

          // Cảnh báo bot né đạn
          for (const u of this.units) {
            if (!u.isDead && !u.isPlayer && u.id !== s.shooterId) {
              if (Math.hypot(s.x - u.x, s.z - u.z) < 80 && (s.y - u.y) < 280) {
                u.alertIncomingShell(s.x, s.z);
              }
            }
          }
        }
      }
    }

    const warnBanner = document.getElementById('warning-banner');
    if (warnBanner) {
      if (!this.player || this.player.isDead) {
        warnBanner.classList.add('hidden');
      } else if (hasIncomingDanger) {
        warnBanner.classList.remove('hidden');
        const glitchEl = warnBanner.querySelector('.warning-glitch');
        const subEl = warnBanner.querySelector('.warning-sub');
        if (glitchEl) UIIcons.set(glitchEl, '[[alert-triangle]] ĐẠN PHÁO ĐANG LAO XUỐNG ĐẦU! BẬT SHIFT CHẠY NGAY! [[alert-triangle]]');
        if (subEl) subEl.textContent = 'LÁI W/A/S/D + SHIFT ĐỂ CƠ ĐỘNG NÉ TÂM NỔ!';
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

    this.ballistics.updateShells3D(dt, this.terrain, this.units, (s, hitType, hitTarget) => this.handleShellImpact(s, hitType, hitTarget));
    this.ballistics.updateWeather(dt);

    // 4. Cập nhật radar phản pháo & vòng bo
    this.radar.update(dt, {
      x: this.player ? this.player.x + 1800 : 1800,
      y: this.player ? this.player.z + 1800 : 1800
    });
    this.zone.update(dt, this.units.map(u => ({
      ...u,
      x: u.x + 1800,
      y: u.z + 1800,
      takeDamage: (amt) => u.takeDamage(amt, null, 'ZONE')
    })));

    // 5. CẬP NHẬT CAMERA 3D NGHIÊNG 55 ĐỘ TỪ TRÊN XUỐNG CHUẨN ART OF WAR 3
    if (this.player) {
      let shakeX = 0;
      let shakeZ = 0;
      if (this.cameraShake > 0) {
        shakeX = (Math.random() - 0.5) * this.cameraShake;
        shakeZ = (Math.random() - 0.5) * this.cameraShake;
        this.cameraShake = Math.max(0, this.cameraShake - dt * 25);
      }

      // Camera đặt ở độ cao Y = 420, lùi về sau Z = 320 (Góc nghiêng ~55 độ cực đẹp)
      // Xe trinh sát: góc nhìn rộng hơn xe tăng thường (camera lùi cao & xa hơn ~30%)
      const wantK = this.player.tankType === 'SCOUT' ? 1.3 : 1;
      this._camK = this._camK === undefined ? wantK : this._camK + (wantK - this._camK) * Math.min(1, dt * 3);
      // Nhìn trước theo hướng xe đang chạy (thấy đường phía trước nhiều hơn), lọc mượt để không lắc
      const P = this.player;
      const fwdX = -Math.sin(P.bodyAngle || 0) * (P.speed || 0), fwdZ = -Math.cos(P.bodyAngle || 0) * (P.speed || 0);
      const kLook = Math.min(1, dt * 2.5);
      this._camLook = this._camLook || { x: 0, z: 0, y: P.y };
      this._camLook.x += (Math.max(-90, Math.min(90, fwdX * 0.45)) - this._camLook.x) * kLook;
      this._camLook.z += (Math.max(-90, Math.min(90, fwdZ * 0.45)) - this._camLook.z) * kLook;
      // độ cao camera bám độ cao xe đã lọc chậm (đồi dốc không làm camera nhấp nhô)
      this._camLook.y += (P.y - this._camLook.y) * Math.min(1, dt * 3);
      const fx = P.x + this._camLook.x, fz = P.z + this._camLook.z;
      const targetCamX = fx + shakeX;
      const targetCamY = this._camLook.y + 420 * this._camK;
      const targetCamZ = fz + 320 * this._camK + shakeZ;

      // Bám mượt theo thời gian thực (không phụ thuộc FPS như hệ số 0.12 mỗi khung cũ)
      const kCam = 1 - Math.exp(-dt * 7);
      this.camera.position.x += (targetCamX - this.camera.position.x) * kCam;
      this.camera.position.y += (targetCamY - this.camera.position.y) * kCam;
      this.camera.position.z += (targetCamZ - this.camera.position.z) * kCam;

      // Điểm nhìn cũng lọc như vị trí camera -> khung hình trượt đều, không giật khi xe xóc
      this.camera.lookAt(this.camera.position.x - shakeX, this.camera.position.y - 420 * this._camK + 10, this.camera.position.z - 320 * this._camK - shakeZ);
      // Nhà cao tầng chắn giữa camera và xe mình: tạm cắt bỏ các tầng trên để luôn thấy xe
      if (this.terrain && this.terrain.updateBuildingView) this.terrain.updateBuildingView(this.camera.position, P, dt);

      // Cập nhật vị trí ánh sáng mặt trời chiếu bám theo xe
      // Khung bóng đổ ôm vừa vùng camera nhìn thấy (trước đây cố định 1800 x 1800 quanh xe): ít vật phải vẽ vào
      // bản đồ bóng hơn và mỗi texel bóng phủ diện tích nhỏ hơn -> bóng nét hơn. Tâm khung khóa theo lưới texel để bóng không rung.
      const sd = this.sunDir || new THREE.Vector3(-0.42, 0.82, -0.36);
      const aspK = Math.max(1, this.camera.aspect / 1.78);
      const half = Math.ceil(700 * this._camK * aspK / 20) * 20;
      const sc = this.sunLight.shadow.camera;
      if (sc.right !== half) { sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half; sc.updateProjectionMatrix(); }
      const texel = (2 * half) / (this.sunLight.shadow.mapSize.width || 2048);
      const focusX = Math.round(this.camera.position.x / texel) * texel;
      const focusZ = Math.round((this.camera.position.z - 320 * this._camK - 90 * this._camK) / texel) * texel;
      const focusY = this._camLook.y;
      this.sunLight.position.set(focusX + sd.x * 1300, focusY + sd.y * 1300, focusZ + sd.z * 1300);
      this.sunLight.target.position.set(focusX, focusY, focusZ);
    }
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
        this.trajectoryGeo.setFromPoints(traj.points);
        this.trajectoryLine.computeLineDistances();
        this.trajectoryLine.visible = true;

        const isWall = traj.hitType === 'WALL';
        // Trạng thái ngắm so với điểm cần trúng (xe đã khóa — có đón đầu — hoặc điểm neo trên mặt đất)
        const tgt = (this.lockedTarget && !this.lockedTarget.isDead && !this._manualAim) ? this.lockedTarget : this._aimPoint;
        const tr = this._lockTrack;
        let aimState = 'free';
        if (tgt) {
          const ax = tr && tr.id === tgt.id && tr.aimX !== undefined ? tr.aimX : tgt.x;
          const az = tr && tr.id === tgt.id && tr.aimZ !== undefined ? tr.aimZ : tgt.z;
          const miss = Math.hypot(traj.impactPoint.x - ax, traj.impactPoint.z - az);
          const unreachable = tr && tr.id === tgt.id && tr.reachable === false;
          const onTol = Math.max(14, Math.hypot(ax - this.player.x, az - this.player.z) * 0.02);
          aimState = miss < onTol ? 'on' : ((unreachable || isWall) && miss > 40 ? 'blocked' : 'slew');
          this._aimMiss = miss;
        }
        this._aimState = aimState;
        const col = aimState === 'on' ? 0x5cf08a : aimState === 'slew' ? 0xffb020 : (isWall || aimState === 'blocked') ? 0xff3b30 : 0x00f0ff;
        this.trajectoryMat.color.setHex(col);
        this.updateTrajectoryDots(traj.points, col);

        if (this.reticle3D) {
          this.reticle3D.position.copy(traj.impactPoint);
          this.reticle3D.position.y += 1.2;
          this.reticleRingMesh.rotation.z += dt * 1.8;
          this.reticleRingMat.color.setHex(col);
          this.reticle3D.visible = true;
        }

        const trajDistEl = document.getElementById('traj-dist-val');
        if (trajDistEl) {
          trajDistEl.textContent = `${traj.distance.toLocaleString()}M`;
        }
        const trajModeHint = document.getElementById('traj-mode-hint');
        if (trajModeHint) {
          if (isWall) {
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
      if (this._trajDots) this._trajDots.visible = false;
    }
    this.updateAimAnchor(dt);

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

      const radarAlertRadius = 600; // Bán kính radar cảnh giới xung quanh xe (600 mét)
      if (closestEnemyDist < radarAlertRadius) {
        this.radarProximityTimer = (this.radarProximityTimer || 0) - dt;
        // Khoảng cách càng gần, nhịp bíp bíp càng dồn dập
        const beepInterval = Math.max(0.32, (closestEnemyDist / radarAlertRadius) * 1.3);
        const urgency = closestEnemyDist < 280 ? 2 : 1;

        if (this.radarProximityTimer <= 0) {
          this.radarProximityTimer = beepInterval;
          if (window.soundEngine && typeof window.soundEngine.playRadarProximityBeep === 'function') {
            window.soundEngine.playRadarProximityBeep(urgency);
          }
        }
      } else {
        this.radarProximityTimer = 0;
      }
    }

    this.miniScannerAngle = (this.miniScannerAngle + dt * 160) % 360;

    this.updateHUDValues();
  }

  updateHUDValues() {
    const battleTimerEl = document.getElementById('battle-timer');
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

    const hpBar = document.getElementById('hp-bar');
    const hpText = document.getElementById('hp-text');
    if (hpBar && hpText) {
      const hpPct = Math.max(0, (this.player.hp / this.player.maxHp) * 100);
      hpBar.style.width = `${hpPct}%`;
      hpBar.classList.toggle('warn', hpPct < 60 && hpPct >= 30);
      hpBar.classList.toggle('crit', hpPct < 30);
      const fmt = v => (Math.round(Math.max(0, v) * 10) / 10).toString();
      hpText.textContent = `${fmt(this.player.hp)} / ${fmt(this.player.maxHp)}`;
    }

    this.updateAmmoUI();

    const reloadBar = document.getElementById('reload-bar');
    const reloadText = document.getElementById('reload-text');
    const fireBtn = document.getElementById('fire-btn');
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

    const speedText = document.getElementById('speed-text');
    if (speedText) {
      const speedKmH = Math.round(typeof GameTiming !== 'undefined' ? GameTiming.kmh(Math.abs(this.player.speed)) : Math.abs(this.player.speed) * 0.45);
      speedText.textContent = `${speedKmH} KM/H`;
    }

    const boostTag = document.getElementById('speed-boost-tag');
    if (boostTag) {
      if (this.player.speedBoostTimer > 0) {
        boostTag.classList.remove('hidden');
        boostTag.textContent = `TĂNG TỐC ${Math.ceil(this.player.speedBoostTimer)}S`;
      } else {
        boostTag.classList.add('hidden');
      }
    }
    this.syncEquipmentChips();

    const stealthBanner = document.getElementById('stealth-banner');
    const stealthOverlay = document.getElementById('stealth-camo-overlay');
    const isPlayerInBush = !this.player.isDead && this.player.isInBush;
    const isPlayerRevealed = isPlayerInBush && this.player.revealTimer > 0;

    if (stealthBanner) {
      if (isPlayerInBush) {
        stealthBanner.classList.remove('hidden');
        if (isPlayerRevealed) {
          stealthBanner.innerHTML = `<span class="stealth-pulse-dot red"></span> BỊ LỘ VỊ TRÍ DO VỪA KHAI HỎA · ${this.player.revealTimer.toFixed(1)}S`;
          stealthBanner.classList.add('revealed');
        } else {
          stealthBanner.innerHTML = `<span class="stealth-pulse-dot green"></span> ĐANG NÚP BỤI · ĐỊCH KHÔNG NHÌN THẤY XE`;
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

    const terrainText = document.getElementById('terrain-text');
    if (terrainText) {
      const tInfo = this.terrain.getTerrainInfoAt(this.player.x, this.player.z, this.player.currentPitch);
      terrainText.textContent = tInfo.name;
    }

    const windValEl = document.getElementById('hud-wind-val');
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
    const tankClassText = document.getElementById('tank-class-text');
    const gatlingSpinTag = document.getElementById('gatling-spin-tag');
    const gatlingMagTag = document.getElementById('gatling-mag-tag');
    const gatlingHeatTag = document.getElementById('gatling-heat-tag');
    const artyDeployTag = document.getElementById('arty-deploy-tag');
    const scoutMissileTag = document.getElementById('scout-missile-tag');
    const scoutRadarTag = document.getElementById('scout-radar-tag');
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
      const roleEl = document.getElementById('hud-veh-role');
      if (roleEl) roleEl.textContent = ident[1];
      const iconEl = document.getElementById('hud-veh-icon');
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
    } else {
      chip(artyDeployTag, '');
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

    const azSlider = document.getElementById('azimuth-slider');
    const azValEl = document.getElementById('azimuth-val');
    if (azSlider && azValEl) {
      azSlider.value = this.player.azimuth;
      azValEl.textContent = `${this.player.azimuth.toFixed(1).padStart(5, '0')}°`;
    }

    const elSlider = document.getElementById('elevation-slider');
    const elValEl = document.getElementById('elevation-val');
    const fireModeHint = document.getElementById('fire-mode-hint');

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
    const logBox = document.getElementById('combat-log');
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
    // 1. Render Scene 3D Three.js
    this.renderer.render(this.scene, this.camera);

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

    // Khung nhìn camera Viewport (chuẩn Art of War 3)
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(px - 18, pz - 14, 36, 28);

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
      this.addCombatLog('[[cloud]] Xe chưa lắp ống phóng lựu khói — mua trong mục NÂNG CẤP ở sảnh', 'tip');
      return;
    }
    if (!(P.smokeLeft > 0)) { this.addCombatLog('[[cloud]] Đã hết lựu đạn khói (nạp lại khi xuất kích lần sau)', 'alert'); return; }
    Equipment.triggerSmoke(this, P);
    this.addCombatLog(`[[cloud]] Đã phóng màn khói — địch không nhìn xuyên qua được (còn ${P.smokeLeft})`, 'tip');
    this.syncEquipmentChips();
  }

  // Ô trạng thái trang bị trên thanh dưới: khói còn lại, lượt đánh chặn
  syncEquipmentChips() {
    const P = this.player;
    const host = document.getElementById('speed-boost-tag');
    if (!host || !host.parentElement) return;
    let el = document.getElementById('eq-chips');
    if (!el) { el = document.createElement('span'); el.id = 'eq-chips'; el.className = 'hx-chip'; el.style.color = '#cbd5e1'; host.parentElement.appendChild(el); }
    if (!P || P.isDead || typeof Equipment === 'undefined' || !P.kit) { UIIcons.set(el, ''); return; }
    const parts = [];
    if (Equipment.has(P, 'smoke')) parts.push(`[[cloud]] KHÓI ×${P.smokeLeft || 0} [G]`);
    if (Equipment.has(P, 'aps')) parts.push(`[[radar]] ĐÁNH CHẶN ×${Equipment.apsLeft(P)}`);
    UIIcons.set(el, parts.join('   '));
    el.classList.toggle('hidden', !parts.length);
  }

  // Phe của người chơi trên máy này (khách vào phòng có thể ở Phe Đỏ)
  myTeam() {
    return this.player && this.player.team === 'RED' ? 'RED' : 'BLUE';
  }

  // Bảng kết quả cuối trận — luôn viết theo góc nhìn đội của người chơi
  showMatchResult(result, subText) {
    const modal = document.getElementById('game-over-modal');
    const title = document.getElementById('game-over-title');
    const sub = document.getElementById('game-over-subtitle');
    const T = { win: ['victory-title', 'CHIẾN THẮNG!'], loss: ['defeat-title', 'THẤT BẠI'], draw: ['draw-title', 'HÒA'] }[result];
    if (title) { title.className = T[0]; title.textContent = T[1]; }
    if (sub) sub.textContent = subText;
    if (result === 'win' && window.soundEngine && typeof window.soundEngine.playVictoryFanfare === 'function') window.soundEngine.playVictoryFanfare();
    // Màn hình kết quả: nhả phím đang giữ, đóng bản đồ lớn / menu tạm dừng nếu đang mở
    this.keys = {};
    if (this.tacticalMap && this.tacticalMap.isOpen && this.tacticalMap.toggle) this.tacticalMap.toggle(false);
    if (window.GameMenu && GameMenu.close) GameMenu.close();

    const elapsedSecs = Math.min(this.matchDuration || 600, Math.floor((Date.now() - this.matchStartTime) / 1000));
    const m = Math.floor(elapsedSecs / 60);
    const s = elapsedSecs % 60;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('stat-shots', String(this.player ? this.player.shotsFired : 0));
    set('stat-kills', String(this.player ? this.player.kills : 0));
    set('stat-damage', String(this.player ? Math.round(this.player.damageDealt) : 0));
    set('stat-time', `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
    if (modal) modal.classList.remove('hidden');
  }

  initCapturePoints() {
    if (this.capturePointsManager) {
      return this.capturePointsManager.init();
    }
    // Dọn dẹp các cứ điểm 3D cũ nếu có
    if (this.capturePoints && this.capturePoints.length > 0) {
      this.capturePoints.forEach(cp => {
        if (cp.group && cp.group.parent) {
          cp.group.parent.remove(cp.group);
        }
      });
    }

    this.capturePoints = [
      {
        id: 'A',
        name: 'CỨ ĐIỂM A (PHÍA TÂY)',
        shortName: 'CỨ ĐIỂM A',
        x: -800,
        z: 0,
        radius: 85,
        owner: null, // null: Trung lập, 'blue': Phe Xanh, 'red': Phe Đỏ
        captureProgress: 0, // 0 - 100
        holdTimer: 0.0, // Thời gian giữ cứ điểm (giây)
        holdGoal: 60.0, // Mục tiêu 60 giây (1 phút) để thắng
        isDisputed: false,
        alert45Played: false
      },
      {
        id: 'B',
        name: 'CỨ ĐIỂM B (TRUNG TÂM)',
        shortName: 'CỨ ĐIỂM B',
        x: 0,
        z: 0,
        radius: 85,
        owner: null,
        captureProgress: 0,
        holdTimer: 0.0,
        holdGoal: 60.0,
        isDisputed: false,
        alert45Played: false
      },
      {
        id: 'C',
        name: 'CỨ ĐIỂM C (PHÍA ĐÔNG)',
        shortName: 'CỨ ĐIỂM C',
        x: 800,
        z: 0,
        radius: 85,
        owner: null,
        captureProgress: 0,
        holdTimer: 0.0,
        holdGoal: 60.0,
        isDisputed: false,
        alert45Played: false
      }
    ];

    // Khởi tạo đồ họa 3D cho 3 cứ điểm
    this.capturePoints.forEach(cp => {
      const terrainHeight = this.terrain ? this.terrain.getElevationAt(cp.x, cp.z) : 0;
      cp.y = terrainHeight;
      this.createCapturePointMesh(cp);
    });

    this.updateCapturePointsUI();
  }

  createCapturePointMesh(cp) {
    const group = new THREE.Group();
    group.position.set(cp.x, cp.y, cp.z);

    // 1. Vòng tròn ranh giới chiếm cứ điểm trên mặt đất (Bán kính 85 mét)
    const ringGeo = new THREE.RingGeometry(cp.radius - 2.5, cp.radius, 48);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.position.y = 0.4;
    group.add(ringMesh);
    cp.ringMat = ringMat;

    // 2. Vùng phát sáng mờ bên trong cứ điểm
    const zoneAreaGeo = new THREE.CircleGeometry(cp.radius - 2.6, 48);
    zoneAreaGeo.rotateX(-Math.PI / 2);
    const zoneAreaMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.08,
      side: THREE.DoubleSide
    });
    const zoneAreaMesh = new THREE.Mesh(zoneAreaGeo, zoneAreaMat);
    zoneAreaMesh.position.y = 0.2;
    group.add(zoneAreaMesh);
    cp.zoneAreaMat = zoneAreaMat;

    // 3. Bệ bê tông cứ điểm trung tâm
    const baseGeo = new THREE.CylinderGeometry(8, 10, 2.5, 16);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.8,
      metalness: 0.2
    });
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    baseMesh.position.y = 1.25;
    baseMesh.castShadow = true;
    baseMesh.receiveShadow = true;
    group.add(baseMesh);

    // 4. Cột cờ trung tâm vươn cao 22 mét
    const poleGeo = new THREE.CylinderGeometry(0.4, 0.6, 22, 12);
    const poleMat = new THREE.MeshStandardMaterial({
      color: 0xd1d5db,
      metalness: 0.8,
      roughness: 0.3
    });
    const poleMesh = new THREE.Mesh(poleGeo, poleMat);
    poleMesh.position.y = 12.25;
    poleMesh.castShadow = true;
    group.add(poleMesh);

    // 5. Quả cầu đỉnh cột cờ
    const orbGeo = new THREE.SphereGeometry(1.2, 16, 16);
    const orbMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      emissive: 0xca8a04,
      emissiveIntensity: 0.4,
      metalness: 0.9,
      roughness: 0.1
    });
    const orbMesh = new THREE.Mesh(orbGeo, orbMat);
    orbMesh.position.y = 23.5;
    group.add(orbMesh);

    // 6. Lá cờ hiệu cứ điểm tung bay (Hiển thị màu phe)
    const flagGeo = new THREE.PlaneGeometry(9, 5);
    const flagMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      side: THREE.DoubleSide,
      roughness: 0.6
    });
    const flagMesh = new THREE.Mesh(flagGeo, flagMat);
    flagMesh.position.set(4.8, 19.5, 0);
    flagMesh.castShadow = true;
    group.add(flagMesh);
    cp.flagMesh = flagMesh;
    cp.flagMat = flagMat;

    // 7. Khối ký hiệu chữ cái A, B, C xoay nhẹ trên không
    const markerGeo = new THREE.BoxGeometry(3.5, 3.5, 3.5);
    const markerMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x64748b,
      emissiveIntensity: 0.3,
      metalness: 0.5,
      roughness: 0.3
    });
    const markerMesh = new THREE.Mesh(markerGeo, markerMat);
    markerMesh.position.y = 26.5;
    group.add(markerMesh);
    cp.markerMesh = markerMesh;

    this.scene.add(group);
    cp.group = group;
  }

  updateCapturePoints(dt) {
    if (this.capturePointsManager) {
      return this.capturePointsManager.updateCapturePoints(dt, this.units);
    }
    if (!this.capturePoints || this.capturePoints.length === 0 || this.isGameOver) return;

    const captureRate = 14.0; // Tốc độ chiếm (% mỗi giây với 1 xe)

    this.capturePoints.forEach(cp => {
      // 1. Tìm các xe còn sống nằm trong ranh giới cứ điểm
      let blueInZone = 0;
      let redInZone = 0;

      this.units.forEach(u => {
        if (!u.isAlive) return;
        const dist = Math.hypot(u.x - cp.x, u.z - cp.z);
        if (dist <= cp.radius) {
          if (u.team === 'blue') blueInZone++;
          else if (u.team === 'red') redInZone++;
        }
      });

      // 2. Xử lý logic trạng thái cứ điểm
      if (blueInZone > 0 && redInZone > 0) {
        // Có xe cả 2 phe: Tranh chấp dữ dội, đóng băng tiến trình và thời gian giữ
        cp.isDisputed = true;
      } else if (blueInZone > 0) {
        // Chỉ có Phe Xanh hiện diện
        cp.isDisputed = false;
        const speed = captureRate * (1 + 0.4 * (blueInZone - 1));

        if (cp.owner === 'blue') {
          // Phe Xanh đang kiểm soát: Tiến trình đầy đủ, đếm thời gian giữ
          cp.captureProgress = 100;
          cp.holdTimer += dt;
        } else if (cp.owner === 'red') {
          // Phe Xanh hạ cờ Phe Đỏ
          cp.captureProgress -= speed * dt;
          cp.holdTimer = 0.0;
          cp.alert45Played = false;
          if (cp.captureProgress <= 0) {
            cp.owner = null;
            cp.captureProgress = 0;
            this.addCombatLog(`Phe Xanh đã vô hiệu hóa thành công ${cp.name}! Cứ điểm trở lại trạng thái Trung Lập!`, 'system');
          }
        } else {
          // Cứ điểm đang Trung Lập: Kéo cờ Phe Xanh
          cp.captureProgress += speed * dt;
          if (cp.captureProgress >= 100) {
            cp.captureProgress = 100;
            cp.owner = 'blue';
            cp.holdTimer = 0.0;
            cp.alert45Played = false;
            this.addCombatLog(`Phe Xanh đã làm chủ ${cp.name}! Cần giữ vững cứ điểm trong 1 phút để giành chiến thắng!`, 'victory');
            if (window.soundEngine && typeof window.soundEngine.playTargetLockAcquired === 'function') {
              window.soundEngine.playTargetLockAcquired();
            }
          }
        }
      } else if (redInZone > 0) {
        // Chỉ có Phe Đỏ hiện diện
        cp.isDisputed = false;
        const speed = captureRate * (1 + 0.4 * (redInZone - 1));

        if (cp.owner === 'red') {
          cp.captureProgress = 100;
          cp.holdTimer += dt;
        } else if (cp.owner === 'blue') {
          cp.captureProgress -= speed * dt;
          cp.holdTimer = 0.0;
          cp.alert45Played = false;
          if (cp.captureProgress <= 0) {
            cp.owner = null;
            cp.captureProgress = 0;
            this.addCombatLog(`Quân Địch đã vô hiệu hóa quyền kiểm soát của Phe Xanh tại ${cp.name}!`, 'defeat');
          }
        } else {
          cp.captureProgress += speed * dt;
          if (cp.captureProgress >= 100) {
            cp.captureProgress = 100;
            cp.owner = 'red';
            cp.holdTimer = 0.0;
            cp.alert45Played = false;
            this.addCombatLog(`CẢNH BÁO: Quân Địch đã làm chủ ${cp.name}! Mau tiến tới ngăn chặn!`, 'defeat');
          }
        }
      } else {
        // Không có xe nào trong vùng
        cp.isDisputed = false;
        if (cp.owner) {
          // Cứ điểm đã thuộc quyền sở hữu của một phe: Tiếp tục tích lũy thời gian giữ vững
          cp.holdTimer += dt;
        } else {
          // Chưa có phe nào làm chủ: Tiến trình chiếm dở giảm dần về 0
          if (cp.captureProgress > 0) {
            cp.captureProgress = Math.max(0, cp.captureProgress - 8.0 * dt);
          }
        }
      }

      // 3. Cảnh báo khẩn cấp khi phe nào giữ được 45s (còn 15s là thắng trận)
      if (cp.owner && cp.holdTimer >= 45.0 && !cp.alert45Played) {
        cp.alert45Played = true;
        const remainingToWin = Math.max(1, Math.ceil(cp.holdGoal - cp.holdTimer));
        const teamName = cp.owner === 'blue' ? 'PHE XANH' : 'PHE ĐỎ';
        this.addCombatLog(`[BÁO ĐỘNG KHẨN CẤP] ${teamName} chỉ còn ${remainingToWin} giây nữa là thắng trận nhờ chiếm giữ ${cp.name}! Mau ngăn chặn!`, 'system');
        if (window.soundEngine && typeof window.soundEngine.playRadarAlert === 'function') {
          window.soundEngine.playRadarAlert();
        }
      }

      // 4. KIỂM TRA ĐIỀU KIỆN THẮNG TRẬN KHI GIỮ QUÁ 1 PHÚT (60 GIÂY)
      if (cp.owner && cp.holdTimer >= cp.holdGoal && !this.isGameOver) {
        this.finishMatchByCapture(cp.owner, cp.name);
        return;
      }

      // 5. Cập nhật hiệu ứng hình ảnh 3D
      if (cp.markerMesh) {
        cp.markerMesh.rotation.y += dt * 0.8;
      }
      if (cp.flagMesh) {
        cp.flagMesh.rotation.y = Math.sin(Date.now() * 0.003) * 0.25;
      }

      // Đổi màu sắc 3D theo chủ sở hữu và trạng thái
      let targetHex = 0xffffff;
      let areaHex = 0xffffff;
      let areaOpacity = 0.08;

      if (cp.owner === 'blue') {
        targetHex = 0x38bdf8;
        areaHex = 0x0284c7;
        areaOpacity = 0.16;
      } else if (cp.owner === 'red') {
        targetHex = 0xef4444;
        areaHex = 0xdc2626;
        areaOpacity = 0.16;
      } else if (cp.captureProgress > 0) {
        targetHex = 0xfacc15; // Vàng nhạt khi đang kéo cờ
      }

      // Nhấp nháy khẩn cấp khi sắp thắng (>45s)
      if (cp.owner && cp.holdTimer >= 45.0) {
        const pulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.012);
        areaOpacity = 0.2 + 0.25 * pulse;
      }

      if (cp.ringMat) {
        cp.ringMat.color.setHex(targetHex);
      }
      if (cp.zoneAreaMat) {
        cp.zoneAreaMat.color.setHex(areaHex);
        cp.zoneAreaMat.opacity = areaOpacity;
      }
      if (cp.flagMat) {
        cp.flagMat.color.setHex(targetHex);
      }
    });

    // 6. Cập nhật giao diện HUD của các cứ điểm
    this.updateCapturePointsUI();
  }

  updateCapturePointsUI() {
    if (!this.capturePoints) return;

    this.capturePoints.forEach(cp => {
      const lowerId = cp.id.toLowerCase();
      const cardEl = document.getElementById(`cp-card-${lowerId}`);
      const flagEl = document.getElementById(`cp-flag-${lowerId}`);
      const statusEl = document.getElementById(`cp-status-${lowerId}`);
      const barEl = document.getElementById(`cp-bar-${lowerId}`);
      const timerEl = document.getElementById(`cp-timer-${lowerId}`);

      if (!cardEl) return;

      // Xóa class trạng thái cũ
      cardEl.classList.remove('neutral', 'blue-owned', 'red-owned', 'disputed', 'winning-soon');

      if (cp.isDisputed) {
        cardEl.classList.add('disputed');
        if (flagEl) UIIcons.set(flagEl, '[[swords]]');
        if (statusEl) statusEl.textContent = 'TRANH CHẤP';
        if (timerEl) {
          const secs = Math.floor(cp.holdTimer);
          timerEl.textContent = cp.owner ? `GIỮ: ${secs}s/60s (ĐÓNG BĂNG)` : 'Đang tranh chấp';
        }
      } else if (cp.owner === 'blue') {
        cardEl.classList.add('blue-owned');
        if (flagEl) UIIcons.set(flagEl, '[[circle-filled.ic-blue]]');
        if (statusEl) statusEl.textContent = 'PHE XANH';
        const secs = Math.floor(cp.holdTimer);
        if (timerEl) timerEl.textContent = `GIỮ: ${secs}s / 60s`;
        if (cp.holdTimer >= 45.0) cardEl.classList.add('winning-soon');
      } else if (cp.owner === 'red') {
        cardEl.classList.add('red-owned');
        if (flagEl) UIIcons.set(flagEl, '[[circle-filled.ic-red]]');
        if (statusEl) statusEl.textContent = 'PHE ĐỎ';
        const secs = Math.floor(cp.holdTimer);
        if (timerEl) timerEl.textContent = `GIỮ: ${secs}s / 60s`;
        if (cp.holdTimer >= 45.0) cardEl.classList.add('winning-soon');
      } else {
        cardEl.classList.add('neutral');
        if (flagEl) UIIcons.set(flagEl, '[[circle-filled.ic-neutral]]');
        if (statusEl) statusEl.textContent = cp.captureProgress > 0 ? 'ĐANG CHIẾM' : 'TRUNG LẬP';
        if (timerEl) timerEl.textContent = cp.captureProgress > 0 ? `Tiến trình: ${Math.round(cp.captureProgress)}%` : 'Chưa chiếm';
      }

      if (barEl) {
        if (cp.owner) {
          // Nếu đã chiếm được, thanh tiến trình hiển thị tỷ lệ thời gian giữ vững (0s -> 60s)
          const holdPct = Math.min(100, (cp.holdTimer / cp.holdGoal) * 100);
          barEl.style.width = `${holdPct}%`;
          barEl.style.backgroundColor = cp.owner === 'blue' ? '#38bdf8' : '#ef4444';
        } else {
          // Khi đang trung lập hoặc đang kéo cờ
          barEl.style.width = `${cp.captureProgress}%`;
          barEl.style.backgroundColor = '#facc15';
        }
      }
    });
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
    document.getElementById('game-over-modal').classList.add('hidden');
    const respawnBanner = document.getElementById('player-respawn-banner');
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
    if (this.effectsManager) this.ballistics.fx = this.effectsManager.fx;
    this.radar = new CounterBatteryRadar();
    this.zone = new BattleZone(this.worldWidth, this.worldDepth);
    this.explosions3D = [];
    this.airdrop = null;
    this.airdropTimer = 25;

    // Tạo lại đường nét đứt 3D
    this.trajectoryGeo = new THREE.BufferGeometry();
    this.trajectoryMat = new THREE.LineDashedMaterial({
      color: 0x00f0ff,
      dashSize: 8,
      gapSize: 5,
      scale: 1,
      linewidth: 2,
      transparent: true,
      opacity: 0.95,
      depthWrite: false
    });
    this.trajectoryLine = new THREE.Line(this.trajectoryGeo, this.trajectoryMat);
    this.scene.add(this.trajectoryLine);

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

window.ArtilleryGame3D = ArtilleryGame3D;

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
