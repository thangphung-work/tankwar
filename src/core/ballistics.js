/**
 * Hệ thống Vật lý Đường đạn 3D Three.js - Hỗ trợ BẮN THẲNG & CẦU VỒNG
 * Hiệu ứng đạn pháo 3D rực lửa, kiểm tra va chạm địa hình 3D, tường móng ngựa và xe địch.
 */
class BallisticsSystem3D {
  constructor(scene) {
    this.scene = scene;
    this.gravity = 9.81;
    this.dragCoeff = 0.00035;
    this.windDriftCoeff = 0.045;
    this.bulletSpeedMultiplier = 3.2; // Tăng tốc độ bay đạn pháo lên gấp 3.2 lần xé gió cực kỳ uy lực
    this.standardV0 = 280; // Sơ tốc pháo chuẩn hóa tăng từ 240 lên 280 để đạn bay căng và nhanh hơn
    // Lựu pháo 155mm L/52 bắn cầu vồng: liều phóng mạnh hơn pháo xe tăng -> phủ toàn chiến trường
    this.artyChargeMul = 1.15;
    // Đạn 155mm có đáy phụt khí (base-bleed) + hệ số đạn đạo tốt -> lực cản chỉ ~35% đạn pháo tăng
    this.artyDragMul = 0.35;
    // Trọng lực của đạn pháo theo đúng tỉ lệ thế giới game (8 đơn vị = 1 m -> 9.81 m/s² = 78.5 đv/s²).
    // Trước đây dùng 9.81 đv/s² (chỉ bằng 1/8 trọng lực thật) nên đạn tăng nâng nòng 5° đã bay gần hết bản đồ.
    this.gunGravity = 78.5;
    // Sơ tốc lựu pháo 155mm (đơn vị game): tầm xa tối đa ~2600-2800 ở góc ~43°, tầm gần nhất ~450 ở 85°
    this.artyV0 = 540;

    // Cấu hình cự ly tiêu chuẩn theo góc nòng (phục vụ hiển thị và tương thích ngược)
    this.charges = {
      1: { name: 'Tiêu chuẩn', v0: 560, maxRange: 1300 }
    };

    this.wind = {
      direction: 45,
      speed: 8.0,
      vx: 0,
      vz: 0,
      nextChange: 0
    };
    this.updateWindVectors();

    this.activeShells = [];
    this.trailParticles = [];

    // Tái sử dụng hình học hạt khói vệt đạn để tối ưu hiệu năng 60 FPS
    this.trailGeo = new THREE.SphereGeometry(1.3, 6, 6);
  }

  updateWindVectors() {
    const rad = this.wind.direction * (Math.PI / 180);
    this.wind.vx = Math.sin(rad) * this.wind.speed;
    this.wind.vz = -Math.cos(rad) * this.wind.speed;
  }

  updateWeather(dt) {
    this.wind.nextChange -= dt;
    if (this.wind.nextChange <= 0) {
      const dAngle = (Math.random() - 0.5) * 40;
      this.wind.direction = (this.wind.direction + dAngle + 360) % 360;
      this.wind.speed = Math.max(3.0, Math.min(18.0, this.wind.speed + (Math.random() - 0.5) * 4));
      this.updateWindVectors();
      this.wind.nextChange = 25 + Math.random() * 20;
    }
  }

  /**
   * Tạo mô hình 3D đầu đạn pháo 155mm chi tiết chuẩn quân sự Art of War 3:
   * - Mũi ngòi nổ kim loại nhọn (Fuze tip)
   * - Thân nón thuôn khí động học (Ogive nose)
   * - Trụ thép chịu áp suất buồng pháo (Bourrelet)
   * - Đai đồng dẫn xoắn nòng khương tuyến (Copper driving band)
   * - Đáy vát giảm xoáy khí động (Boat-tail)
   * - Đốm lửa vạch đường rực cháy (Tracer flare) kèm đèn chiếu PointLight
   */
  createShell155Mesh(isDirectFire, ammoType = 'NORMAL', heavy = false, tracer = true) {
    if (typeof ProjectileModels !== 'undefined') {
      return ProjectileModels.create(ammoType, { heavy, tracer });
    }
    const shellGroup = new THREE.Group();

    const isAP = ammoType === 'AP';
    const isHE = ammoType === 'HE';
    const isCluster = ammoType === 'CLUSTER';
    const isGatling = ammoType === 'GATLING_BULLET';
    const isIncendiary = ammoType === 'INCENDIARY';
    const isRPG = (ammoType === 'RPG' || ammoType === 'ANTI_TANK_MISSILE');

    // 1. ĐẠN LIÊN THANH 6 NÒNG / TRINH SÁT (ĐẠN THƯỜNG HOẶC ĐẠN CHÁY)
    if (isGatling || isIncendiary) {
      const bulletColor = isIncendiary ? 0xff2200 : 0xffaa00;
      const lightColor = isIncendiary ? 0xff3300 : 0xff7700;

      const tracerGeo = new THREE.CylinderGeometry(0.35, 0.45, isIncendiary ? 6.5 : 5.0, 6);
      tracerGeo.rotateX(Math.PI / 2);
      const tracerMat = new THREE.MeshBasicMaterial({ color: bulletColor });
      const tracerMesh = new THREE.Mesh(tracerGeo, tracerMat);
      shellGroup.add(tracerMesh);

      const glowGeo = new THREE.SphereGeometry(isIncendiary ? 1.2 : 0.9, 6, 6);
      const glowMat = new THREE.MeshBasicMaterial({ color: isIncendiary ? 0xffaa44 : 0xffffff });
      const glowMesh = new THREE.Mesh(glowGeo, glowMat);
      shellGroup.add(glowMesh);

      const bulletLight = new THREE.PointLight(lightColor, isIncendiary ? 1.8 : 1.2, isIncendiary ? 50 : 40);
      shellGroup.add(bulletLight);

      return shellGroup;
    }

    // 2. ĐẠN TÊN LỬA PHẢN LỰC / RPG CỦA XE TRINH SÁT
    if (isRPG) {
      const bodyGeo = new THREE.CylinderGeometry(0.85, 0.85, 8.5, 10);
      bodyGeo.rotateX(Math.PI / 2);
      const bodyMat = new THREE.MeshLambertMaterial({ color: 0x2e3640 });
      const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
      shellGroup.add(bodyMesh);

      // Mũi nhọn xuyên giáp cảnh báo
      const noseGeo = new THREE.ConeGeometry(0.85, 3.2, 10);
      noseGeo.rotateX(Math.PI / 2);
      const noseMat = new THREE.MeshLambertMaterial({ color: 0xff4500 });
      const noseMesh = new THREE.Mesh(noseGeo, noseMat);
      noseMesh.position.set(0, 0, -5.8);
      shellGroup.add(noseMesh);

      // 4 Cánh lái chữ thập ở đuôi tên lửa
      const finMat = new THREE.MeshLambertMaterial({ color: 0x64748b });
      for (let f = 0; f < 4; f++) {
        const finGeo = new THREE.BoxGeometry(0.15, 2.8, 2.0);
        const finMesh = new THREE.Mesh(finGeo, finMat);
        finMesh.rotation.z = (f * Math.PI) / 2;
        finMesh.position.set(0, 0, 3.2);
        shellGroup.add(finMesh);
      }

      // Đuôi lửa phản lực rực sáng
      const flameGeo = new THREE.ConeGeometry(0.75, 4.2, 8);
      flameGeo.rotateX(-Math.PI / 2);
      const flameMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
      const flameMesh = new THREE.Mesh(flameGeo, flameMat);
      flameMesh.position.set(0, 0, 5.8);
      shellGroup.add(flameMesh);

      const rocketLight = new THREE.PointLight(0xff5500, 2.4, 80);
      rocketLight.position.set(0, 0, 5.0);
      shellGroup.add(rocketLight);

      return shellGroup;
    }

    // 3. ĐẠN PHÁO CHÍNH (HE, AP, CLUSTER, NORMAL)
    let fuzeColor = 0xdde5ee;
    let bodyColor = 0x2e3640;
    let noseColor = 0x3d4752;
    let tracerColor = 0xffaa00;

    if (isAP) {
      fuzeColor = 0x00ffff;
      bodyColor = 0x121b24;
      noseColor = 0x00e5ff;
      tracerColor = 0x00ffff;
    } else if (isHE) {
      fuzeColor = 0xffea00;
      bodyColor = 0x991f14;
      noseColor = 0xff3b30;
      tracerColor = 0xff3300;
    } else if (isCluster) {
      // ĐẠN CHÙM: Thân xanh ô liu quân sự, mũi vàng sọc kép
      fuzeColor = 0xfacc15;
      bodyColor = 0x1c3829;
      noseColor = 0x2d6a4f;
      tracerColor = 0x52b788;
    } else if (isDirectFire) {
      bodyColor = 0xcc5511;
      noseColor = 0xee7722;
      tracerColor = 0xff4400;
    }

    const bandColor = 0xdda032;
    const tailColor = 0x1d2228;

    const matFuze = new THREE.MeshLambertMaterial({ color: fuzeColor });
    const matNose = new THREE.MeshLambertMaterial({ color: noseColor });
    const matBody = new THREE.MeshLambertMaterial({ color: bodyColor });
    const matBand = new THREE.MeshLambertMaterial({ color: bandColor });
    const matTail = new THREE.MeshLambertMaterial({ color: tailColor });

    // Chóp ngòi nổ
    const fuzeGeo = new THREE.ConeGeometry(0.5, 1.8, 12);
    fuzeGeo.translate(0, 5.6, 0);
    const fuzeMesh = new THREE.Mesh(fuzeGeo, matFuze);
    shellGroup.add(fuzeMesh);

    // Mũi đạn
    const ogiveGeo = new THREE.CylinderGeometry(0.5, 1.5, 3.2, 14);
    ogiveGeo.translate(0, 3.2, 0);
    const ogiveMesh = new THREE.Mesh(ogiveGeo, matNose);
    shellGroup.add(ogiveMesh);

    // Thân đạn
    const bodyGeo = new THREE.CylinderGeometry(1.5, 1.5, 4.2, 14);
    bodyGeo.translate(0, -0.4, 0);
    const bodyMesh = new THREE.Mesh(bodyGeo, matBody);
    shellGroup.add(bodyMesh);

    // Đai dẫn xoắn đồng thau
    const bandGeo = new THREE.CylinderGeometry(1.64, 1.64, 1.2, 14);
    bandGeo.translate(0, -2.7, 0);
    const bandMesh = new THREE.Mesh(bandGeo, matBand);
    shellGroup.add(bandMesh);

    // Đáy vát
    const tailGeo = new THREE.CylinderGeometry(1.5, 1.1, 1.8, 12);
    tailGeo.translate(0, -4.1, 0);
    const tailMesh = new THREE.Mesh(tailGeo, matTail);
    shellGroup.add(tailMesh);

    // Ống vạch đường
    const tracerGeo = new THREE.CylinderGeometry(0.85, 0.85, 0.4, 10);
    tracerGeo.translate(0, -4.95, 0);
    const tracerMat = new THREE.MeshBasicMaterial({ color: tracerColor });
    const tracerMesh = new THREE.Mesh(tracerGeo, tracerMat);
    shellGroup.add(tracerMesh);

    return shellGroup;
  }

  // Tạo Mesh quả đạn con của đạn chùm
  createSubmunitionMesh() {
    if (typeof ProjectileModels !== 'undefined') {
      return ProjectileModels.create('CLUSTER_SUBMUNITION');
    }
    const subGroup = new THREE.Group();
    const bodyGeo = new THREE.CylinderGeometry(0.65, 0.65, 2.4, 8);
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x475569 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    subGroup.add(body);

    const noseGeo = new THREE.ConeGeometry(0.65, 1.0, 8);
    const noseMat = new THREE.MeshLambertMaterial({ color: 0xfacc15 });
    const nose = new THREE.Mesh(noseGeo, noseMat);
    nose.position.y = 1.7;
    subGroup.add(nose);

    const flare = new THREE.PointLight(0xffaa00, 1.0, 30);
    flare.position.y = -1.2;
    subGroup.add(flare);

    return subGroup;
  }

  // Hiệu ứng chớp lửa và vòng sóng chấn động khi đạn chùm kích nổ trên không
  createAirburstFlash(x, y, z) {
    // 1. Quả cầu lửa nổ bung trên không
    const flashGeo = new THREE.SphereGeometry(14, 12, 12);
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xffeedd,
      transparent: true,
      opacity: 0.95,
      depthWrite: false
    });
    const flash = new THREE.Mesh(flashGeo, flashMat);
    flash.position.set(x, y, z);
    this.scene.add(flash);

    this.trailParticles.push({
      mesh: flash,
      life: 0.22,
      maxLife: 0.22
    });

    // 2. Vòng sóng xung kích tỏa ngang
    const ringGeo = new THREE.RingGeometry(2, 8, 24);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xfde047,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(x, y, z);
    this.scene.add(ring);

    this.trailParticles.push({
      mesh: ring,
      life: 0.35,
      maxLife: 0.35
    });
  }

  // Phóng đạn chùm bung 14 quả đạn con trên không diện rộng 260m
  spawnClusterAirburst(shell, terrain, allUnits, onImpact) {
    const cx = shell.x;
    const cy = shell.y;
    const cz = shell.z;

    if (this.fx) this.fx.spawn(cx, cy, cz, 'CLUSTER', 'AIRBURST', { dir: { x: shell.vx || 0, y: shell.vy || 0, z: shell.vz || 0 } });
    else this.createAirburstFlash(cx, cy, cz);

    // Đạn mẹ tách vỏ trên không: tiếng rít lao xuống (dự đoán tới mặt đất) phải tắt ngay lúc này
    if (shell.whistleSnd) { shell.whistleSnd.stop(); shell.whistleSnd = null; }
    if (window.soundEngine && typeof window.soundEngine.playExplosionAtDistance === 'function') {
      // nổ ở độ cao ~20 m: tính khoảng cách xiên tới người nghe, không chỉ khoảng cách trên mặt đất
      const P = window.game && window.game.player;
      const distToPlayer = P ? Math.hypot(P.x - cx, (P.y || 0) - cy, P.z - cz) : 500;
      window.soundEngine.playExplosionAtDistance(distToPlayer, 'AIRBURST', 'CLUSTER', { x: cx, z: cz });
    }

    // Đạn con DPICM: giữ phần lớn vận tốc đạn mẹ (bay tiếp về phía trước), bị đẩy văng tỏa tròn quanh trục bay
    // nhờ lực ly tâm khi vỏ tách; dải băng ổn định tạo lực cản lớn -> rơi dốc dần, vùng rải hình elip kéo dài theo hướng bắn
    const subCount = 18;
    const fwd = new THREE.Vector3(shell.vx, shell.vy, shell.vz);
    const sp0 = fwd.length() || 1;
    fwd.divideScalar(sp0);
    let r1 = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0));
    if (r1.lengthSq() < 1e-4) r1.set(1, 0, 0);
    r1.normalize();
    const r2 = new THREE.Vector3().crossVectors(r1, fwd).normalize();
    for (let k = 0; k < subCount; k++) {
      const angle = (k / subCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.45;
      // Tốc độ phóng đạn con & phần quán tính giữ lại dao động rộng -> vùng rải elip lớn như thực tế
      const eject = 50 + Math.random() * 95;
      const carry = 0.6 + Math.random() * 0.34;
      const radial = r1.clone().multiplyScalar(Math.cos(angle)).addScaledVector(r2, Math.sin(angle));
      const vx = shell.vx * carry + radial.x * eject;
      const vz = shell.vz * carry + radial.z * eject;
      const vy = shell.vy * carry + radial.y * eject - 6;

      const subMesh = this.createSubmunitionMesh();
      subMesh.position.set(cx + (Math.random() - 0.5) * 14, cy - 2, cz + (Math.random() - 0.5) * 14);
      this.scene.add(subMesh);

      this.activeShells.push({
        id: Math.random().toString(36).substring(2, 9),
        shooterId: shell.shooterId,
        shooterTeam: shell.shooterTeam,
        mesh: subMesh,
        x: cx,
        y: cy - 2,
        z: cz,
        vx: vx,
        vy: vy,
        vz: vz,
        isDirectFire: false,
        ammoType: 'CLUSTER_SUBMUNITION',
        isSpecialAmmo: true,
        timeAlive: 0,
        spinAngle: 0,
        trailTimer: 0,
        exploded: false,
        damage: 0.35,
        // vùng rải đạn con giữ theo cỡ vụ nổ / thân xe (không nén theo tỉ lệ tầm lựu pháo)
        g: this.gunGravity,
        k: this.dragCoeff * 6.5,
        dragMul: 6.5   // băng ổn định của đạn con -> cản gió mạnh
      });
    }
  }

  /**
   * Bắn đạn pháo 3D vào Scene Three.js
   * Hỗ trợ các loại đạn: NORMAL (thường), AP (xuyên phá), HE (nổ mạnh)
   */
  // Đạn bắn thẳng theo bản chất (đạn súng / tên lửa) hoặc theo góc nòng thấp
  isDirectFireShot(ammoType, elevation) {
    return (elevation <= 18) || ammoType === 'GATLING_BULLET' || ammoType === 'INCENDIARY' || ammoType === 'RPG' || ammoType === 'ANTI_TANK_MISSILE';
  }

  // Đạn pháo (xe tăng / lựu pháo) — phân biệt với đạn súng / tên lửa (vết đạn, nổ cận đích...)
  isGunRound(ammoType) {
    return ammoType !== 'GATLING_BULLET' && ammoType !== 'INCENDIARY' && ammoType !== 'RPG' && ammoType !== 'ANTI_TANK_MISSILE' && ammoType !== 'SCOUT_BULLET';
  }

  /**
   * Thông số bay của một phát bắn theo SỐ LIỆU THẬT thu nhỏ đúng tỉ lệ (src/core/game_timing.js):
   * v0 / g theo "giây mô phỏng" (= giây thật x bulletSpeedMultiplier), k = hệ số cản theo quãng đường (đơn vị game).
   * Mọi loại đạn chịu trọng lực đầy đủ của thế giới thu nhỏ -> đường đạn là bản sao thu nhỏ của đường đạn thật
   * (pháo tăng APFSDS bay gần như thẳng tới ~2 km game, lựu pháo cầu vồng phủ ~450–2700).
   */
  roundParams(ammoType, shooter = null, chargeLevel = 1) {
    const type = shooter ? shooter.tankType : null;
    const M = this.bulletSpeedMultiplier || 1;
    const GT = typeof GameTiming !== 'undefined' ? GameTiming : null;
    if (!GT) return { v0: 560, g: this.gunGravity, k: this.dragCoeff, maxTravel: 0, eff: 1700, guided: false };
    const r = GT.round(ammoType, type, this.artyChargeMulOf(chargeLevel));
    return {
      key: r.key,
      v0: r.v / M,
      g: r.g / (M * M),
      k: r.k,
      maxTravel: r.maxTravel,
      eff: r.eff,
      guided: r.guided,
      turnAcc: r.turnAcc ? r.turnAcc / (M * M) : 0,
      boostT: r.boostT ? r.boostT * M : 0,
      burnTravel: r.burnTravel || 0
    };
  }

  gravityFor(ammoType, isDirectFire, shooter = null) {
    return this.roundParams(ammoType, shooter).g;
  }

  // Hệ số sơ tốc theo liều phóng lựu pháo (1 = đầy ... 5 = nhỏ nhất); phủ kín cự ly ~450 -> 2700
  artyChargeMulOf(chargeLevel) {
    const z = Math.max(1, Math.min(5, Math.round(chargeLevel || 1)));
    const C = (typeof GameTiming !== 'undefined' && GameTiming.REAL.artyCharges) || [1, 0.8, 0.62, 0.44, 0.34];
    return C[z - 1];
  }

  muzzleVelocity(ammoType, isDirectFire, shooter = null, chargeLevel = 1) {
    return this.roundParams(ammoType, shooter, chargeLevel).v0;
  }

  // Hệ số cản (tương thích ngược): tỉ lệ so với dragCoeff
  dragMulFor(ammoType, isDirectFire, shooter = null) {
    return this.roundParams(ammoType, shooter).k / this.dragCoeff;
  }

  // Điểm đạn cắt mặt đất trên đoạn bay (x0,y0,z0) -> (x1,y1,z1): mỗi bước mô phỏng đạn bay hàng chục đơn vị,
  // lấy cuối bước làm điểm nổ sẽ lệch vài mét -> chia đôi đoạn tìm đúng chỗ chạm (dùng chung cho đạn thật & dự đoán)
  // off: ngưỡng chìm dưới mặt đất dùng để phát hiện chạm (đạn bắn thẳng 0.8) — chia đôi theo đúng ngưỡng đó,
  // nếu không đoạn đã nằm dưới mặt đất ở đầu bước sẽ bị coi là chạm ở CUỐI bước (điểm rơi nhảy cóc ~60 đơn vị)
  groundCrossing(terrain, x0, y0, z0, x1, y1, z1, off = 0) {
    const h = t => (y0 + (y1 - y0) * t) - terrain.getElevationAt(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t) + off;
    let lo = 0, hi = 1;
    if (h(0) > 0) {
      for (let k = 0; k < 10; k++) { const m = (lo + hi) / 2; if (h(m) > 0) lo = m; else hi = m; }
    }
    const x = x0 + (x1 - x0) * hi, z = z0 + (z1 - z0) * hi;
    return { x, y: terrain.getElevationAt(x, z), z };
  }

  fireShell3D(shooter, azimuth, elevation, chargeLevel, ammoType = 'NORMAL') {
    const isDirectFire = this.isDirectFireShot(ammoType, elevation);
    const rp = this.roundParams(ammoType, shooter, chargeLevel);
    // Tên lửa / đạn phản lực rời ống phóng chậm rồi động cơ đẩy tăng tốc (không bắn ra với tốc độ hành trình)
    const v0 = rp.guided ? rp.v0 * 0.3 : rp.v0;

    let startX, startY, startZ;
    let vx, vy, vz;
    let fireDir;

    // Lấy tọa độ và vector hướng thực tế từ miệng nòng pháo 3D (hoặc miệng ống phóng tên lửa)
    if (shooter && (shooter._launchOverride || typeof shooter.getMuzzleWorldTransform === 'function')) {
      const muzzle = shooter._launchOverride || shooter.getMuzzleWorldTransform();
      startX = muzzle.position.x;
      startY = muzzle.position.y;
      startZ = muzzle.position.z;
      fireDir = muzzle.direction;
      vx = fireDir.x * v0;
      vy = fireDir.y * v0;
      vz = fireDir.z * v0;
    } else {
      const elRad = elevation * (Math.PI / 180);
      const azRad = azimuth * (Math.PI / 180);
      const vHoriz = v0 * Math.cos(elRad);
      vy = v0 * Math.sin(elRad);
      vx = vHoriz * Math.sin(azRad);
      vz = -vHoriz * Math.cos(azRad);

      startX = shooter.x + Math.sin(azRad) * 40;
      startZ = shooter.z - Math.cos(azRad) * 40;
      startY = shooter.y + 18 + Math.sin(elRad) * 40;
      fireDir = new THREE.Vector3(vx, vy, vz).normalize();
    }

    // Tạo Mesh đầu đạn 155mm quân sự siêu chi tiết
    // Băng đạn súng: đạn thường cứ 4 viên có 1 viên vạch đường, băng đạn cháy (xuyên-cháy-vạch đường) 1/2;
    // viên đầu mỗi loạt luôn là vạch đường để người bắn thấy ngay đường bay
    let tracer = true;
    if (shooter && (ammoType === 'GATLING_BULLET' || ammoType === 'SCOUT_BULLET' || ammoType === 'INCENDIARY')) {
      // loạt mới khi xe đã ngừng bắn hơn 3 khung hình (đếm khung hình, không phụ thuộc tốc độ khung hình)
      const fr = this._frame || 0;
      if (shooter._beltFrame === undefined || fr - shooter._beltFrame > 3) shooter._beltIdx = 0;
      shooter._beltFrame = fr;
      tracer = (shooter._beltIdx++ % (ammoType === 'INCENDIARY' ? 2 : 4)) === 0;
    }
    // Độ tản mát: hướng đạn lệch ngẫu nhiên quanh hướng nòng theo loại pháo + trạng thái xe (chạy, quay tháp, vừa bắn...)
    // — như nhau cho người chơi và bot (xem dispersion.js)
    if (shooter && typeof Dispersion !== 'undefined') {
      const stream = ammoType === 'GATLING_BULLET' || ammoType === 'SCOUT_BULLET' || ammoType === 'INCENDIARY';
      const p = Dispersion.perturb(shooter, ammoType, elevation, vx, vy, vz, stream);
      vx = p.vx; vy = p.vy; vz = p.vz;
    }
    const shellMesh = this.createShell155Mesh(isDirectFire, ammoType, !!(shooter && shooter.tankType === 'ARTILLERY'), tracer);
    // Đạn APFSDS: 3 mảnh guốc đạn tách khỏi mũi tên urani ngay khi rời nòng
    if (ammoType === 'AP' && this.fx && this.fx.sabotDiscard) {
      this.fx.sabotDiscard(startX, startY, startZ, vx, vy, vz);
    }
    shellMesh.position.set(startX, startY, startZ);

    // Định hướng ban đầu mũi đạn trùng với trục vector vận tốc (trục Y cục bộ của Mesh)
    const initDir = new THREE.Vector3(vx, vy, vz).normalize();
    shellMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), initDir);

    this.scene.add(shellMesh);

    const shell = {
      id: Math.random().toString(36).substring(2, 9),
      shooterId: shooter.id,
      shooterTeam: shooter ? shooter.team : null,
      mesh: shellMesh,
      x: startX,
      y: startY,
      z: startZ,
      vx: vx,
      vy: vy,
      vz: vz,
      isDirectFire: isDirectFire,
      ammoType: ammoType,
      isSpecialAmmo: ammoType !== 'NORMAL',
      timeAlive: 0,
      travel: 0,
      maxTravel: rp.maxTravel,
      g: rp.g,
      k: rp.k,
      dragMul: rp.k / this.dragCoeff,
      spinAngle: 0,
      trailTimer: 0,
      tracer,
      exploded: false
    };

    // Tên lửa có điều khiển: bám mục tiêu xe trinh sát chỉ định (khóa) hoặc điểm ngắm, động cơ đẩy tới tốc độ hành trình
    if (rp.guided) {
      const tg = shooter && shooter.missileTarget;
      shell.guide = {
        cruise: rp.v0, turnAcc: rp.turnAcc, boostT: rp.boostT,
        targetId: tg && tg.unit ? tg.unit.id : null,
        point: tg && tg.point ? { x: tg.point.x, y: tg.point.y, z: tg.point.z } : null,
        lost: false
      };
      // Đang khóa xe: lấy ngay vị trí xe lúc phóng làm điểm dẫn ban đầu (không bay thẳng theo ống phóng
      // khi khung hình đầu chưa xác nhận được tầm nhìn)
      if (tg && tg.unit && !shell.guide.point) {
        const u = tg.unit;
        shell.guide.point = { x: u.x, y: (u.y || 0) + 7, z: u.z };
      }
      if (!shell.guide.targetId && !shell.guide.point) {
        // Không chỉ định mục tiêu: bay theo hướng ống phóng tới hết tầm
        shell.guide.point = { x: startX + fireDir.x * rp.maxTravel, y: startY + fireDir.y * rp.maxTravel, z: startZ + fireDir.z * rp.maxTravel };
      }
    }
    if (rp.burnTravel) shell.burnTravel = rp.burnTravel;

    this.activeShells.push(shell);
    return shell;
  }

  /**
   * Dẫn hướng tên lửa (bán tự động theo đường ngắm): dẫn đường tỉ lệ (PN) tới mục tiêu + bay bám cao độ an toàn trên địa hình,
   * gia tốc ngang giới hạn (~12 g thật thu nhỏ), động cơ giữ tốc độ hành trình. Xe phóng bị diệt -> đứt dây điều khiển,
   * tên lửa bay thẳng theo quán tính. Mục tiêu khuất tầm nhìn cả phe -> bay tới vị trí cuối cùng còn thấy.
   */
  guideMissile(s, dt, allUnits, terrain) {
    const G = s.guide;
    if (!G) return;
    // tăng tốc tới tốc độ hành trình
    const sp = Math.hypot(s.vx, s.vy, s.vz) || 1;
    const accel = G.cruise / Math.max(0.05, G.boostT || 0.3);
    const newSp = Math.min(G.cruise, sp + accel * dt);
    let ux = s.vx / sp, uy = s.vy / sp, uz = s.vz / sp;
    if (!G.lost) {
      let shooter = null, target = null;
      if (allUnits) for (const u of allUnits) { if (u.id === s.shooterId) shooter = u; if (G.targetId && u.id === G.targetId) target = u; }
      if (s.timeAlive > 0.15 && (!shooter || shooter.isDead)) G.lost = true;   // đứt dây / mất xe điều khiển
      if (target && !target.isDead) {
        // kíp xe phải tự nhìn thấy mục tiêu (giữ dấu ngắm trên xe địch); khuất tầm nhìn -> bay tới chỗ thấy lần cuối
        // Phòng thử nghiệm ("luôn hiện mục tiêu"): mục tiêu đang hiện trên màn hình của người chơi cũng tính là thấy.
        // Trận thật vẫn bắt buộc tự nhìn thấy trực tiếp (tên lửa dẫn theo đường ngắm, đồng đội báo vị trí không đủ)
        const onScreen = !!(window.STRONGHOLD_LAB && shooter && shooter.isPlayer && target.group && target.group.visible && !target.isHiddenFromPlayer);
        const seen = !(target._netHidden) && (!shooter || typeof TeamIntel === 'undefined' || TeamIntel.seesDirect(shooter, target) || onScreen);
        if (seen) {
          const ty = (target.y || (terrain ? terrain.getElevationAt(target.x, target.z) : 0)) + 7;
          // vận tốc mục tiêu (đơn vị / giây mô phỏng): xe chỉ dịch chuyển mỗi khung hình, đạn bước 3 lần / khung
          // -> chỉ đo khi vị trí thật sự đổi, lọc mềm để điểm đón đầu không giật
          if (G.point && G.lastT !== undefined && (target.x !== G.point.x || target.z !== G.point.z)) {
            const dtT = s.timeAlive - G.lastT;
            if (dtT > 1e-4) {
              const k = G.tvx === undefined ? 1 : 0.35;
              G.tvx = (G.tvx || 0) + ((target.x - G.point.x) / dtT - (G.tvx || 0)) * k;
              G.tvz = (G.tvz || 0) + ((target.z - G.point.z) / dtT - (G.tvz || 0)) * k;
            }
            G.lastT = s.timeAlive;
          } else if (G.lastT === undefined) G.lastT = s.timeAlive;
          G.point = { x: target.x, y: ty, z: target.z };
          // Máy gây nhiễu trên xe mục tiêu: đầu dò bám chập chờn (điểm ngắm dao động quanh xe, xem bên dưới)
          G.jam = typeof Equipment !== 'undefined' && Equipment.has ? Equipment.has(target, 'jammer') : false;
        }
      } else if (G.targetId && target && target.isDead) {
        G.targetId = null;   // mục tiêu đã bị diệt: lao vào chỗ xác xe
      }
    }
    if (!G.lost && G.point) {
      const P = G.point;
      const dx = P.x - s.x, dz = P.z - s.z, dh = Math.hypot(dx, dz);
      // Dẫn đón đầu theo vận tốc mục tiêu (đơn vị / giây mô phỏng)
      const tgo = dh / Math.max(1, newSp);
      let ax = P.x + (G.tvx || 0) * tgo, az = P.z + (G.tvz || 0) * tgo;
      // bị gây nhiễu: điểm ngắm lắc ~3 m quanh xe (tất định theo thời gian bay -> mọi máy cùng đường bay), chỉ ~5 m cuối mới bám lại
      if (G.jam) { const ph = s.timeAlive * 2.3, k = Math.min(1, dh / 40); ax += Math.sin(ph) * 26 * k; az += Math.cos(ph * 0.77) * 26 * k; }
      // Bay cao hơn đường ngắm một chút, hạ thấp dần khi tới gần (lao thẳng vào thân xe)
      const ay = P.y + Math.min(26, dh * 0.04);
      const hx = ax - s.x, hz = az - s.z, hl = Math.hypot(hx, hz) || 1;
      // Bám địa hình: dò mặt đất phía trước theo hướng tới mục tiêu (bán kính vòng ~380 đơn vị nên phải nhìn xa),
      // chọn độ dốc lớn nhất cần để vượt mọi gò / bờ đất cách mặt đất >= 13 đơn vị
      let slope = (ay - s.y) / hl;
      if (terrain) {
        const CLEAR = 13;
        for (const d of [20, 45, 80, 130, 200, 290, 400]) {
          if (d > hl - 30) break;
          const gx = s.x + hx / hl * d, gz = s.z + hz / hl * d;
          const need = (terrain.getElevationAt(gx, gz) + CLEAR - s.y) / d;
          if (need > slope) slope = need;
        }
        // đang bay quá sát mặt đất ngay bên dưới (còn xa mục tiêu): ngóc lên
        const gh = s.y - terrain.getElevationAt(s.x, s.z);
        if (hl > 60 && gh < CLEAR) slope = Math.max(slope, (CLEAR - gh) / 40);
      }
      let wx = hx / hl, wy = slope, wz = hz / hl;
      const wl = Math.hypot(wx, wy, wz) || 1;
      wx /= wl; wy /= wl; wz /= wl;
      // gia tốc ngang cần để quay vận tốc về hướng mong muốn, giới hạn theo khả năng cánh lái
      // Kênh lái dọc mạnh gấp 4: độ cao địa hình theo tỉ lệ thân xe (8 đv/m) còn quãng bay bị nén (0.5 đv/m),
      // gò đồi "dốc" hơn thật nhiều lần so với tầm bay — không bù thì tên lửa không kịp ngóc lên vượt gò
      let cx = wx - ux, cy = wy - uy, cz = wz - uz;
      const maxA = G.turnAcc * (s.timeAlive < (G.boostT || 0.3) ? 0.5 : 1);
      const dtv = Math.max(dt, 1e-4) / newSp;
      const needH = Math.hypot(cx, cz) / dtv, needV = Math.abs(cy) / dtv;
      const kh = needH > maxA ? maxA / needH : 1, kv = needV > maxA * 4 ? maxA * 4 / needV : 1;
      ux += cx * kh; uy += cy * kv; uz += cz * kh;
      const ul = Math.hypot(ux, uy, uz) || 1;
      ux /= ul; uy /= ul; uz /= ul;
    }
    s.vx = ux * newSp; s.vy = uy * newSp; s.vz = uz * newSp;
  }

  // Một bước bay của đạn không điều khiển: gió, lực cản (k theo quãng đường), trọng lực thế giới thu nhỏ.
  // Đạn phản lực (RPG) còn cháy động cơ thì lực đẩy bù cản & phần lớn trọng lực.
  integrateFlight(s, h) {
    s.vx += (this.wind.vx - s.vx) * this.windDriftCoeff * h;
    s.vz += (this.wind.vz - s.vz) * this.windDriftCoeff * h;
    const burning = s.burnTravel && (s.travel || 0) < s.burnTravel;
    const k = s.k !== undefined ? s.k : this.dragCoeff * (s.dragMul || 1);
    if (!burning) {
      const dragFactor = k * Math.sqrt(s.vx * s.vx + s.vy * s.vy + s.vz * s.vz) * h;
      s.vx -= s.vx * dragFactor;
      s.vy -= s.vy * dragFactor;
      s.vz -= s.vz * dragFactor;
    }
    const g = s.g !== undefined ? s.g : this.gravityFor(s.ammoType, s.isDirectFire);
    s.vy -= g * (burning ? 0.25 : 1) * h;
  }

  updateShells3D(dt, terrain, allUnits, onImpact) {
    this._frame = (this._frame || 0) + 1;
    const veg = this.vegetationProvider ? this.vegetationProvider() : null;
    if (allUnits) this._lastUnits = allUnits;   // bù trễ mạng (advanceShell) lái tên lửa theo cùng danh sách xe
    // 1. Cập nhật các hạt khói xé gió và tàn lửa vạch đường (Tracer Trail Particles)
    for (let pIdx = this.trailParticles.length - 1; pIdx >= 0; pIdx--) {
      const p = this.trailParticles[pIdx];
      p.life -= dt;
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        if (p.mesh.material) p.mesh.material.dispose();
        this.trailParticles.splice(pIdx, 1);
        continue;
      }
      p.mesh.scale.multiplyScalar(1 + dt * 2.8);
      if (p.mesh.material) {
        p.mesh.material.opacity = (p.life / p.maxLife) * 0.75;
      }
    }

    // 2. Cập nhật từng viên đạn pháo đang bay (Chia 3 bước phụ để đạn bay xé gió nhanh gấp 3.2 lần mà không bị xuyên vật thể)
    const subSteps = 3;
    const subDt = (dt * this.bulletSpeedMultiplier) / subSteps;

    for (let i = this.activeShells.length - 1; i >= 0; i--) {
      const s = this.activeShells[i];
      let impacted = false;

      for (let step = 0; step < subSteps; step++) {
        s.timeAlive += subDt;

        if (s.guide) {
          // Tên lửa có điều khiển: động cơ + cánh lái bù trọng lực / cản, tự lái theo mục tiêu
          this.guideMissile(s, subDt, allUnits, terrain);
        } else {
          this.integrateFlight(s, subDt);
        }

        const prevX = s.x;
        const prevY = s.y;
        const prevZ = s.z;

        s.x += s.vx * subDt;
        s.y += s.vy * subDt;
        s.z += s.vz * subDt;
        // Đạn bay sượt / xuyên tán cây: cây rung, lá cành rụng, đạn cháy làm bén lửa
        if (veg && s.timeAlive > 0.01) veg.passSegment(prevX, prevY, prevZ, s.x, s.y, s.z, s.ammoType, this.fx);

        // Đạn Gatling cận chiến: Tiêu hao năng lượng và tan biến sau 0.6 giây (~480 mét)
        // Đạn súng / tên lửa bắn thẳng: hết tầm hiệu quả thì tự hủy (đạn vạch đường cháy hết, tên lửa tự nổ)
        s.travel += Math.hypot(s.x - prevX, s.y - prevY, s.z - prevZ);
        // Bay ra khỏi chiến trường (đạn pháo tăng bắn trượt bay tiếp vài km) -> bỏ
        if (Math.abs(s.x) > 2300 || Math.abs(s.z) > 2300 || s.y < -400) {
          this.removeShellMesh(s, i);
          impacted = true;
          break;
        }
        if (s.maxTravel && s.travel > s.maxTravel) {
          if ((s.ammoType === 'RPG' || s.ammoType === 'ANTI_TANK_MISSILE') && this.fx && this.fx.spawn) {
            this.fx.spawn(s.x, s.y, s.z, 'CLUSTER_SUBMUNITION', 'AIR', {});
            // tên lửa hết tầm tự hủy: có chớp nổ thì phải có tiếng nổ (trước đây nổ câm)
            const P = window.game && window.game.player;
            if (P && window.soundEngine && window.soundEngine.playExplosionAtDistance) {
              window.soundEngine.playExplosionAtDistance(Math.hypot(P.x - s.x, (P.y || 0) - s.y, P.z - s.z), 'AIRBURST', 'CLUSTER_SUBMUNITION', { x: s.x, z: s.z });
            }
          }
          this.removeShellMesh(s, i);
          impacted = true;
          break;
        }

        // KIỂM TRA ĐẠN CHÙM NỔ TRÊN KHÔNG (CLUSTER AIRBURST)
        if (s.ammoType === 'CLUSTER' && s.vy < -12 && s.timeAlive > 0.3) {
          const groundElev = terrain.getElevationAt(s.x, s.z);
          if ((s.y - groundElev) <= 165) { // Kích nổ trên không tầm cao (~21 m), tạo mưa bom con diện rộng
            this.spawnClusterAirburst(s, terrain, allUnits, onImpact);
            this.removeShellMesh(s, i);
            impacted = true;
            break;
          }
        }

        // 1. KIỂM TRA VA CHẠM CÔNG SỰ MÓNG NGỰA HOẶC TÒA NHÀ CĂN CỨ 3D (Ưu tiên kiểm tra trước xe để tránh bắn xuyên tường)
        // 0. CỨ ĐIỂM BÊ TÔNG DƯỚI Ụ ĐẤT: quét dày theo đoạn bay (bê tông / đất đắp không bị phá, đạn nổ tại mặt chạm)
        if (s.timeAlive > 0.004 && terrain.strongholdSegmentHit) {
          const sh = terrain.strongholdSegmentHit(prevX, prevY, prevZ, s.x, s.y, s.z);
          if (sh) {
            s.x = sh.x; s.y = sh.y; s.z = sh.z;
            if (sh.normal) s.hitNormal = sh.normal;
            this.removeShellMesh(s, i);
            if (onImpact) onImpact(s, sh.type);
            impacted = true;
            break;
          }
        }
        // 0b. THÂN CÂY chặn đạn (tán lá thì đạn xuyên qua): đạn súng găm vào thân, đạn pháo / tên lửa nổ tại thân cây
        if (veg && veg.trunkHit && s.timeAlive > 0.01) {
          const th = veg.trunkHit(prevX, prevY, prevZ, s.x, s.y, s.z);
          if (th) {
            s.x = th.x; s.y = th.y; s.z = th.z;
            // pháp tuyến mặt thân cây tại điểm chạm + cây bị trúng (hiệu ứng dằm gỗ & vết đạn dán đúng thân cây)
            if (th.it) {
              const nl = Math.hypot(th.x - th.it.x, th.z - th.it.z) || 1;
              s.hitNormal = { nx: (th.x - th.it.x) / nl, ny: 0, nz: (th.z - th.it.z) / nl };
              s.hitTree = th.it;
            }
            this.removeShellMesh(s, i);
            if (onImpact) onImpact(s, 'TREE');
            impacted = true;
            break;
          }
        }

        if (s.timeAlive > 0.015) {
          // Kiểm tra quét dọc theo đoạn bay để ngăn đạn tốc độ cao nhảy cóc qua tường
          // NHÀ: dò chính xác theo đoạn bay vào mặt tường / sàn / mái còn đặc (đạn lọt qua lỗ thủng / ô sàn sập bay tiếp vào trong)
          if (terrain.buildingSegmentHit) {
            const bh = terrain.buildingSegmentHit(prevX, prevY, prevZ, s.x, s.y, s.z);
            if (bh) {
              s.x = bh.x; s.y = bh.y; s.z = bh.z;
              s.hitNormal = { nx: bh.nx, ny: bh.ny, nz: bh.nz };
              this.removeShellMesh(s, i);
              if (onImpact) onImpact(s, 'BUILDING');
              impacted = true;
              break;
            }
          }
          let wallHit = terrain.checkHorseshoeCollision(s.x, s.y, s.z, true);
          if (!wallHit.hit && (Math.hypot(s.x - prevX, s.z - prevZ) > 3.0)) {
            const midX = (prevX + s.x) * 0.5;
            const midY = (prevY + s.y) * 0.5;
            const midZ = (prevZ + s.z) * 0.5;
            wallHit = terrain.checkHorseshoeCollision(midX, midY, midZ, true);
          }
          if (wallHit.hit) {
            this.removeShellMesh(s, i);
            if (onImpact) onImpact(s, wallHit.type || 'WALL');
            impacted = true;
            break;
          }
        }

        // 2. KIỂM TRA ĐẠN NỔ KHI ĐẾN GẦN MỤC TIÊU (PROXIMITY FUZE / HITBOX COLLISION DETECTION)
        // Chỉ kích nổ nếu không có tường chắn phía trước
        if (s.timeAlive > 0.015 && allUnits) {
          let hitVehicle = null;
          let minHitDist = Infinity;
          let absorbed = null;   // đạn lọt vào miệng khoang trúng phần xe nằm dưới mái che -> gờ hầm bê tông chặn
          let bestT = Infinity;

          const segX = s.x - prevX;
          const segY = s.y - prevY;
          const segZ = s.z - prevZ;
          const segLenSq = segX * segX + segY * segY + segZ * segZ;

          for (const unit of allUnits) {
            // máy chủ không gửi vị trí / quá lâu không có gói mới: bản sao chỉ là phỏng đoán -> không tính va chạm (chống trúng "bóng ma")
            if (unit._netHidden || unit._netStale) continue;
            // Chỉ phát nổ với xe đối phương (không kích nổ vào xe của chính mình hoặc đồng đội)
            const isEnemy = !s.shooterTeam || unit.team !== s.shooterTeam;
            // Xe đang ở trong cứ điểm: bỏ ngòi nổ cận đích, chỉ tính khi đường đạn cắt đúng hộp thân xe;
            // điểm chạm nằm dưới mái che -> bị chặn (không mất máu), phần thò ra ngoài -> trúng bình thường
            const shelter = (!unit.isDead && isEnemy && unit.id !== s.shooterId && terrain.shelterOf) ? terrain.shelterOf(unit) : null;
            if (shelter && typeof Strongholds !== 'undefined') {
              const t = Strongholds.segUnitBox(unit, prevX, prevY, prevZ, prevX + segX, prevY + segY, prevZ + segZ, s.isDirectFire ? 2.0 : 3.0);
              if (t >= 0 && t < bestT) {
                const px = prevX + segX * t, py = prevY + segY * t, pz = prevZ + segZ * t;
                bestT = t;
                if (terrain.isProtectedPoint(px, py, pz)) {
                  const sl = Math.sqrt(segLenSq) || 1;
                  const ep = terrain.strongholdSet.entryPoint(shelter, { x: px, y: py, z: pz }, { x: segX / sl, y: segY / sl, z: segZ / sl });
                  absorbed = { x: ep.x, y: ep.y, z: ep.z, unit };
                  hitVehicle = null;
                } else {
                  absorbed = null;
                  hitVehicle = unit;
                  s.x = px; s.y = py; s.z = pz;
                  minHitDist = 0;
                }
              }
              continue;
            }
            if (bestT < Infinity) continue;
            // Xác xe còn nằm đó là vật cản thật: chặn đạn của mọi phe (chỉ va chạm sát thân, không kích nổ tiếp cận)
            const wreck = unit.isDead && unit.dmg && unit.group && unit.group.visible;
            if (wreck || (!unit.isDead && unit.id !== s.shooterId && isEnemy)) {
              const targetCenterY = unit.y + (wreck ? 7 : 9);
              // Bán kính kích nổ tiếp cận: 40 mét khi bắn thẳng, 34 mét khi bắn cầu vồng
              const proximityRadius = wreck ? 13 : (s.isDirectFire ? 40 : 34);
              const vertTolerance = wreck ? 9 : 26;

              let t = 0;
              if (segLenSq > 0.0001) {
                t = ((unit.x - prevX) * segX + (targetCenterY - prevY) * segY + (unit.z - prevZ) * segZ) / segLenSq;
                t = Math.max(0, Math.min(1, t));
              }

              const closeX = prevX + t * segX;
              const closeY = prevY + t * segY;
              const closeZ = prevZ + t * segZ;

              const distHoriz = Math.hypot(closeX - unit.x, closeZ - unit.z);
              const distVert = Math.abs(closeY - targetCenterY);
              const dist3D = Math.hypot(distHoriz, distVert);

              if (distHoriz <= proximityRadius && distVert <= vertTolerance) {
                if (dist3D < minHitDist) {
                  minHitDist = dist3D;
                  hitVehicle = unit;
                  s.x = closeX;
                  s.y = closeY;
                  s.z = closeZ;
                }
              }
            }
          }

          if (absorbed) {
            s.x = absorbed.x; s.y = absorbed.y; s.z = absorbed.z;
            s.absorbedBy = absorbed.unit;
            this.removeShellMesh(s, i);
            if (onImpact) onImpact(s, 'WALL');
            impacted = true;
            break;
          }
          if (hitVehicle) {
            this.removeShellMesh(s, i);
            if (onImpact) onImpact(s, 'DIRECT_HIT', hitVehicle);
            impacted = true;
            break;
          }
        }

        // 2b. RƠI XUỐNG SÔNG / HỒ: nổ ngay dưới mặt nước (cột nước), không chui xuống đáy
        const wl = terrain.waterSurfaceAt ? terrain.waterSurfaceAt(s.x, s.z) : null;
        if (wl !== null && s.y <= wl && s.timeAlive > 0.02) {
          s.y = wl;
          this.removeShellMesh(s, i);
          if (onImpact) onImpact(s, 'WATER');
          impacted = true;
          break;
        }

        // 3. KIỂM TRA CHẠM MẶT ĐẤT HOẶC VA VÀO ĐỒI NÚI 3D
        const groundElevation = terrain.getElevationAt(s.x, s.z);
        const groundThreshold = s.isDirectFire ? (groundElevation - 0.8) : groundElevation;
        if (s.y <= groundThreshold && s.timeAlive > 0.02) {
          const c = this.groundCrossing(terrain, prevX, prevY, prevZ, s.x, s.y, s.z, s.isDirectFire ? 0.8 : 0);
          s.x = c.x; s.y = c.y; s.z = c.z;
          this.removeShellMesh(s, i);
          if (onImpact) onImpact(s, 'GROUND');
          impacted = true;
          break;
        }
      }

      if (impacted) continue;

      s.mesh.position.set(s.x, s.y, s.z);

      // Cập nhật hướng mũi đạn bám theo tiếp tuyến quỹ đạo bay tức thời (trục Y hướng theo vận tốc)
      const currentVMag = Math.hypot(s.vx, s.vy, s.vz);
      if (currentVMag > 0.1) {
        const currentDir = new THREE.Vector3(s.vx, s.vy, s.vz).normalize();
        s.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), currentDir);

        // Hiệu ứng xoay tròn quanh trục viên đạn (Rifling Spin do rãnh xoắn nòng pháo)
        s.spinAngle += dt * 50.0;
        s.mesh.rotateY(s.spinAngle);
      }

      // Vệt khói xé gió và tàn lửa đuôi đạn (Tracer Trail)
      const isMissile = (s.ammoType === 'RPG' || s.ammoType === 'ANTI_TANK_MISSILE');
      s.trailTimer += dt;
      if (this.fx && (isMissile || s.trailTimer >= 0.022)) {
        s.trailTimer = 0;
        const tailPos = new THREE.Vector3(0, -(s.mesh.userData.length || 10) * 0.45, 0);
        s.mesh.localToWorld(tailPos);
        if (!s.lastTailPos) s.lastTailPos = tailPos.clone();
        // RPG hết nhiên liệu động cơ: tắt lửa đuôi, bay quán tính không còn nhả khói
        if (s.burnTravel && !s.burnedOut && (s.travel || 0) >= s.burnTravel) {
          s.burnedOut = true;
          s.mesh.traverse(o => { if (o.userData.tracer) o.visible = false; });
        }
        this.fx.trail(tailPos.x, tailPos.y, tailPos.z, s.ammoType, s.lastTailPos.x, s.lastTailPos.y, s.lastTailPos.z,
          { travel: s.travel || 0, tracer: s.tracer !== false, burnedOut: !!s.burnedOut, guided: !!s.guide });
        s.lastTailPos.copy(tailPos);
      } else if (!this.fx && s.trailTimer >= 0.018) {
        s.trailTimer = 0;
        const tailPos = new THREE.Vector3(0, -5.2, 0);
        s.mesh.localToWorld(tailPos);

        const trailMat = new THREE.MeshBasicMaterial({
          color: s.isSpecialAmmo ? 0x00ffff : (s.isDirectFire ? 0xff6600 : 0xffbb33),
          transparent: true,
          opacity: 0.75,
          depthWrite: false
        });
        const trailMesh = new THREE.Mesh(this.trailGeo, trailMat);
        trailMesh.position.copy(tailPos);
        this.scene.add(trailMesh);

        this.trailParticles.push({
          mesh: trailMesh,
          life: 0.32,
          maxLife: 0.32
        });
      }
    }
  }

  removeShellMesh(shell, index) {
    shell.exploded = true;
    if (shell.mesh) {
      // Dọn dẹp tất cả các mesh và light con trong Group của đạn
      shell.mesh.traverse(child => {
        if (child.userData && child.userData.sharedAsset) return;
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
      this.scene.remove(shell.mesh);
    }
    this.activeShells.splice(index, 1);
  }

  calculateSimpleSolution(fromX, fromZ, toX, toZ) {
    const dx = toX - fromX;
    const dz = toZ - fromZ;
    const distance = Math.hypot(dx, dz);
    const trueAzimuth = (Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360;

    // Gợi ý góc tà nâng nòng chuẩn hóa theo cự ly
    let suggestedElevation = 0;
    if (distance <= 350) {
      suggestedElevation = 0; // Bắn thẳng trực diện
    } else {
      const v0 = this.standardV0;
      const sin2Theta = Math.min(0.98, (9.8 * distance) / (v0 * v0 * 0.85));
      suggestedElevation = Math.round((Math.asin(sin2Theta) * 0.5 * 180 / Math.PI) * 10) / 10;
    }

    const flightNormX = -dz / distance;
    const flightNormZ = dx / distance;
    const crossWind = this.wind.vx * flightNormX + this.wind.vz * flightNormZ;
    let windHint = 'Không đáng kể';
    if (crossWind > 3) windHint = 'Gió bạt lệch phải // Cần bù sang trái';
    else if (crossWind < -3) windHint = 'Gió bạt lệch trái // Cần bù sang phải';

    return {
      distance: Math.round(distance),
      trueAzimuth: Math.round(trueAzimuth * 10) / 10,
      suggestedElevation: suggestedElevation,
      suggestedCharge: 1,
      suggestedChargeName: `Góc tà gợi ý: ~${suggestedElevation}°`,
      windHint: windHint
    };
  }

  /**
   * Tính toán tự động điểm rơi đạn pháo mô phỏng vật lý thời gian thực
   * Giúp xạ thủ biết trước điểm rơi chính xác khi xoay nòng, nâng hạ nòng hoặc đổi liều phóng
   */
  predictTrajectoryImpact(shooterX, shooterY, shooterZ, azimuth, elevation, chargeLevel, terrain, shooterObj = null, ammoOverride = null) {
    const ammo = ammoOverride || (shooterObj && shooterObj.selectedAmmo) || 'NORMAL';
    const isDirectFire = this.isDirectFireShot(ammo, elevation);
    const rp = this.roundParams(ammo, shooterObj, chargeLevel);
    const v0 = rp.v0, kDrag = rp.k, gAcc = rp.g;

    let x, y, z;
    let vx, vy, vz;

    // Nếu truyền đối tượng xe có miệng nòng 3D, lấy chuẩn xác 100% từ miệng nòng thực tế
    if (shooterObj && typeof shooterObj.getMuzzleWorldTransform === 'function') {
      const muzzle = shooterObj.getMuzzleWorldTransform();
      x = muzzle.position.x;
      y = muzzle.position.y;
      z = muzzle.position.z;
      vx = muzzle.direction.x * v0;
      vy = muzzle.direction.y * v0;
      vz = muzzle.direction.z * v0;
    } else {
      const elRad = elevation * (Math.PI / 180);
      const azRad = azimuth * (Math.PI / 180);

      const vHoriz = v0 * Math.cos(elRad);
      vy = v0 * Math.sin(elRad);
      vx = vHoriz * Math.sin(azRad);
      vz = -vHoriz * Math.cos(azRad);

      const bg = shooterObj && shooterObj.barrel;
      if (bg) {
        // Miệng nòng = tâm quay nòng + nòng dài len nghiêng theo góc el
        const reach = bg.pivotFwd + Math.cos(elRad) * bg.len;
        x = shooterX + Math.sin(azRad) * reach;
        z = shooterZ - Math.cos(azRad) * reach;
        y = shooterY + bg.pivotH + Math.sin(elRad) * bg.len;
      } else {
        x = shooterX + Math.sin(azRad) * 40;
        z = shooterZ - Math.cos(azRad) * 40;
        y = shooterY + 18 + Math.sin(elRad) * 40;
      }
    }

    const simDt = 0.035 * this.bulletSpeedMultiplier;
    let totalTime = 0;
    let travel = 0;
    let maxAltitude = y;
    let hitType = 'GROUND';

    // Trên "trần" bản đồ (cao hơn mọi mặt đất / vật cản) không thể va chạm -> bỏ qua kiểm tra (xem terrain.shotCeiling)
    const ceilY = terrain && terrain.shotCeiling ? terrain.shotCeiling() : Infinity;

    // Mô phỏng từng bước bay theo tốc độ đạn mới
    const maxSteps = Math.ceil(2400 / this.bulletSpeedMultiplier);
    for (let step = 0; step < maxSteps; step++) {
      totalTime += simDt;

      // Gió bạt ngang
      const relWindX = this.wind.vx - vx;
      const relWindZ = this.wind.vz - vz;
      vx += relWindX * this.windDriftCoeff * simDt;
      vz += relWindZ * this.windDriftCoeff * simDt;

      // Lực cản không khí (đạn phản lực còn cháy động cơ: lực đẩy bù cản, phần lớn trọng lực)
      const burning = rp.burnTravel && travel < rp.burnTravel;
      if (!burning) {
        const dragFactor = kDrag * Math.sqrt(vx * vx + vy * vy + vz * vz) * simDt;
        vx -= vx * dragFactor;
        vy -= vy * dragFactor;
        vz -= vz * dragFactor;
      }
      vy -= gAcc * (burning ? 0.25 : 1) * simDt;
      travel += Math.sqrt(vx * vx + vy * vy + vz * vz) * simDt;

      const px0 = x, py0 = y, pz0 = z;
      x += vx * simDt;
      y += vy * simDt;
      z += vz * simDt;

      if (y > maxAltitude) maxAltitude = y;
      if (y >= ceilY) continue;

      // Kiểm tra va chạm công sự móng ngựa 3D
      if (totalTime > 0.06) {
        const wallHit = terrain.checkHorseshoeCollision(x, y, z);
        if (wallHit.hit) {
          hitType = 'WALL';
          break;
        }
      }

      // Kiểm tra chạm mặt đất hoặc đồi núi 3D
      const groundY = terrain.getElevationAt(x, z);
      const groundThreshold = isDirectFire ? (groundY - 0.8) : groundY;
      if (y <= groundThreshold && totalTime > 0.02) {
        const c = this.groundCrossing(terrain, px0, py0, pz0, x, y, z, isDirectFire ? 0.8 : 0);
        x = c.x; y = c.y; z = c.z;
        hitType = 'GROUND';
        break;
      }
    }

    const dist = Math.hypot(x - shooterX, z - shooterZ);

    return {
      impactX: x,
      impactY: y,
      impactZ: z,
      distance: Math.round(dist),
      flightTime: Math.round(totalTime * 10) / 10,
      maxAltitude: Math.round(maxAltitude),
      hitType: hitType,
      maxRange: this.maxRangeFor(shooterObj)
    };
  }

  /**
   * Tính toán toàn bộ đường đạn 3D thành danh sách điểm xuất phát từ đầu nòng pháo
   * Dùng để dựng đường nét đứt 3D trực quan cho người chơi
   */
  calculateTrajectoryPoints(shooter, azimuth, elevation, chargeLevel, terrain) {
    const ammo = (shooter && shooter.selectedAmmo) || 'NORMAL';
    const isDirectFire = this.isDirectFireShot(ammo, elevation);
    const rp = this.roundParams(ammo, shooter, chargeLevel);
    const v0 = rp.v0, kDrag = rp.k, gAcc = rp.g;

    let startX, startY, startZ;
    let vx, vy, vz;

    if (shooter && typeof shooter.getMuzzleWorldTransform === 'function') {
      const muzzle = shooter.getMuzzleWorldTransform();
      startX = muzzle.position.x;
      startY = muzzle.position.y;
      startZ = muzzle.position.z;
      const fireDir = muzzle.direction;
      vx = fireDir.x * v0;
      vy = fireDir.y * v0;
      vz = fireDir.z * v0;
    } else {
      const elRad = elevation * (Math.PI / 180);
      const azRad = azimuth * (Math.PI / 180);
      const vHoriz = v0 * Math.cos(elRad);
      vy = v0 * Math.sin(elRad);
      vx = vHoriz * Math.sin(azRad);
      vz = -vHoriz * Math.cos(azRad);
      startX = shooter ? shooter.x : 0;
      startZ = shooter ? shooter.z : 0;
      startY = (shooter ? shooter.y : 0) + 18;
    }

    const points = [new THREE.Vector3(startX, startY, startZ)];
    let curX = startX;
    let curY = startY;
    let curZ = startZ;
    let curVx = vx;
    let curVy = vy;
    let curVz = vz;

    const simDt = 0.035 * this.bulletSpeedMultiplier;
    let totalTime = 0;
    let travel = 0;
    let hitType = isDirectFire ? 'DIRECT_AIM' : 'GROUND';
    let maxAltitude = curY;

    const ceilY = terrain && terrain.shotCeiling ? terrain.shotCeiling() : Infinity;

    // Mô phỏng từng bước theo tốc độ đạn mới
    const maxSteps = Math.ceil(2400 / this.bulletSpeedMultiplier);
    for (let step = 0; step < maxSteps; step++) {
      totalTime += simDt;

      // Gió bạt ngang
      const relWindX = this.wind.vx - curVx;
      const relWindZ = this.wind.vz - curVz;
      curVx += relWindX * this.windDriftCoeff * simDt;
      curVz += relWindZ * this.windDriftCoeff * simDt;

      // Lực cản không khí (đạn phản lực còn cháy động cơ: lực đẩy bù cản, phần lớn trọng lực)
      const burning = rp.burnTravel && travel < rp.burnTravel;
      if (!burning) {
        const dragFactor = kDrag * Math.sqrt(curVx * curVx + curVy * curVy + curVz * curVz) * simDt;
        curVx -= curVx * dragFactor;
        curVy -= curVy * dragFactor;
        curVz -= curVz * dragFactor;
      }
      curVy -= gAcc * (burning ? 0.25 : 1) * simDt;
      travel += Math.sqrt(curVx * curVx + curVy * curVy + curVz * curVz) * simDt;

      const px0 = curX, py0 = curY, pz0 = curZ;
      curX += curVx * simDt;
      curY += curVy * simDt;
      curZ += curVz * simDt;

      if (curY > maxAltitude) maxAltitude = curY;

      // Lưu điểm lấy mẫu vào đường nét đứt (cứ 2 bước lưu 1 điểm để tối ưu hiệu năng)
      if (step % 2 === 0 || step < 6) {
        points.push(new THREE.Vector3(curX, curY, curZ));
      }
      if (curY >= ceilY) continue;   // trên trần bản đồ: không thể chạm gì

      // Kiểm tra va chạm công sự bê tông hoặc tòa nhà
      if (totalTime > 0.05 && terrain) {
        const wallHit = terrain.checkHorseshoeCollision(curX, curY, curZ);
        if (wallHit.hit) {
          hitType = 'WALL';
          points.push(new THREE.Vector3(curX, curY, curZ));
          break;
        }
      }

      // Kiểm tra chạm mặt đất hoặc đồi núi sa mạc
      if (terrain && totalTime > 0.02) {
        const groundY = terrain.getElevationAt(curX, curZ);
        const groundThreshold = isDirectFire ? (groundY - 0.8) : groundY;
        if (curY <= groundThreshold) {
          const c = this.groundCrossing(terrain, px0, py0, pz0, curX, curY, curZ, isDirectFire ? 0.8 : 0);
          curX = c.x; curY = c.y; curZ = c.z;
          hitType = isDirectFire ? 'DIRECT_AIM' : 'GROUND';
          points.push(new THREE.Vector3(curX, curY, curZ));
          break;
        }
      }
    }

    const dist = Math.hypot(curX - startX, curZ - startZ);

    return {
      points,
      impactPoint: new THREE.Vector3(curX, curY, curZ),
      distance: Math.round(dist),
      hitType,
      maxAltitude: Math.round(maxAltitude)
    };
  }

  /**
   * Tính toán giải pháp ngắm bắn tự động tối ưu tới mục tiêu (Auto-Aiming Calculator)
   * Tìm góc tà elevation chuẩn xác nhất tới điểm đích với sơ tốc pháo tiêu chuẩn
   */
  solveAimingForTarget(shooterX, shooterY, shooterZ, targetX, targetZ, terrain, shooterObj = null, opts = null) {
    const dx = targetX - shooterX;
    const dz = targetZ - shooterZ;
    const dist = Math.hypot(dx, dz);
    const baseAz = (Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360;
    const ux = dist > 0 ? dx / dist : 0, uz = dist > 0 ? dz / dist : -1;

    // Chọn góc nòng THẤP NHẤT mà đạn thật sự rơi tới điểm chỉ định:
    // quét nâng dần; phát nào đâm đồi / tường / nhà trước mục tiêu thì tiếp tục nâng (bắn vòng qua vật cản);
    // khi điểm rơi vượt qua mục tiêu -> chia đôi khoảng để ra nghiệm chính xác.
    // Lựu pháo: bắn cầu vồng 25..70° (đánh xa) hoặc HẠ NÒNG BẮN THẲNG (liều đầy, đạn bay căng) khi địch áp sát.
    const arty = !!(shooterObj && shooterObj.tankType === 'ARTILLERY');
    const AD = BallisticsSystem3D.ARTY_DIRECT;
    const probe = shooterObj ? { tankType: shooterObj.tankType, selectedAmmo: shooterObj.selectedAmmo } : null;
    // Đạn bay ra từ miệng nòng thật: lấy độ cao / tầm với của tâm quay nòng và chiều dài nòng đo trên mô hình 3D
    // (trước đây giả định cố định cao 18, trước 40 cho mọi xe -> pháo bắn thẳng lệch điểm rơi đáng kể)
    if (probe && typeof shooterObj.barrelGeometry === 'function') {
      const bg = shooterObj.barrelGeometry();
      if (bg) probe.barrel = bg;
    }
    const tol = Math.max(8, dist * 0.012);
    // Lựu pháo: chọn liều phóng nhỏ nhất bắn tới được (đạn rơi dốc, ít mòn nòng) — thử liều lần trước trước
    // directArty: lựu pháo hạ nòng bắn thẳng (góc thấp, liều đầy)
    const solveFor = (curCharge, directArty = false) => {
      const lobArty = arty && !directArty;
      const elMax = directArty ? AD.elMax : this.maxElevationFor(shooterObj);
      const elMin = directArty ? this.minElevationFor(shooterObj, baseAz) : (arty ? 25 : -10);
      let az = baseAz;
      const targetY = terrain && terrain.getElevationAt ? terrain.getElevationAt(targetX, targetZ) : 0;
      const ammo = (shooterObj && shooterObj.selectedAmmo) || 'NORMAL';
      const capAmmo = shooterObj && shooterObj.tankType === 'GATLING' ? (ammo === 'INCENDIARY' ? 'INCENDIARY' : 'GATLING_BULLET') : ammo;
      const cap = this.maxTravelFor ? this.maxTravelFor(capAmmo, shooterObj) : 0;
      const shot = (el) => {
        const p = this.predictTrajectoryImpact(shooterX, shooterY, shooterZ, az, el, curCharge, terrain, probe);
        const ix = p.impactX - shooterX, iz = p.impactZ - shooterZ;
        p.along = ix * ux + iz * uz;                 // cự ly theo hướng bắn
        p.lateral = -ix * uz + iz * ux;              // dạt ngang (gió)
        p.err = p.along - dist;                      // âm = rơi ngắn, dương = vượt qua
        // rơi ngắn vì đâm vật cản (tường / nhà) hoặc đồi nhô cao hơn đường ngắm thẳng tới mục tiêu
        const lineY = shooterY + 10 + (targetY - shooterY - 10) * Math.max(0, Math.min(1, p.along / Math.max(1, dist)));
        p.early = p.err < -tol && (p.hitType === 'WALL' || p.impactY > lineY + 6);
        // Đạn súng / tên lửa tự hủy khi hết tầm bay: quỹ đạo dài hơn tầm tự hủy coi như không tới (rơi ngắn)
        if (cap > 0) {
          const path = Math.hypot(p.along, (p.maxAltitude - shooterY) * 2);
          if (path > cap) { p.err = -cap; p.early = false; p.overCap = true; }
        }
        return p;
      };
      const hint = opts && typeof opts.hintEl === 'number' ? opts.hintEl : null;
      const solveEl = (from, to) => {
        const step = lobArty ? 2.0 : (directArty ? 0.5 : 1.0);
        let prev = null, prevEl = from, best = null, bestEl = from, obstacle = false, found = false;
        const els = [];
        for (let el = from; el < to - 1e-6; el += step) els.push(el);
        els.push(to);   // luôn thử cả đầu mút trên của dải dò
        for (const el of els) {
          const p = shot(el);
          if (!best || Math.abs(p.err) < Math.abs(best.err)) { best = p; bestEl = el; }
          if (p.early) obstacle = true;
          // đổi dấu sai số (ngắn -> vượt hoặc ngược lại, với lựu pháo nhánh cầu vồng) => có nghiệm trong khoảng
          if (prev && Math.sign(prev.err) !== Math.sign(p.err)) {
            let lo = prevEl, hi = el, plo = prev;
            // đường đạn căng (APFSDS ~1650 u/s): lệch 0.01° đã dời điểm rơi vài mét -> chia đôi mịn hơn cho pháo bắn thẳng
            for (let k = 0; k < (lobArty ? 8 : 13); k++) {
              const m = (lo + hi) / 2, pm = shot(m);
              if (Math.abs(pm.err) < Math.abs(best.err)) { best = pm; bestEl = m; }
              if (Math.sign(pm.err) === Math.sign(plo.err)) { lo = m; plo = pm; } else hi = m;
            }
            found = true;
            break;
          }
          if (Math.abs(p.err) < tol) { found = true; break; }
          prev = p; prevEl = el;
        }
        return { best, bestEl, obstacle, found };
      };
      // Khởi động ấm (bám mục tiêu đang khóa): dò quanh góc nòng lần trước trước, không thấy mới quét toàn dải
      const full = () => solveEl(elMin, elMax);
      const warm = () => {
        if (hint === null || hint < elMin - 1 || hint > elMax + 1) return full();   // gợi ý thuộc nhánh quỹ đạo khác
        const w = lobArty ? 6 : 3;
        const r = solveEl(Math.max(elMin, hint - w), Math.min(elMax, hint + w));
        return r.found ? r : full();
      };
      let R = warm();
      // Bù gió dạt ngang: xoay hướng ngược độ dạt rồi giải lại góc nòng một lần
      if (dist > 50 && Math.abs(R.best.lateral) > 2) {
        az = (baseAz - Math.atan2(R.best.lateral, dist) * 180 / Math.PI + 360) % 360;
        const R2 = warm();
        R2.obstacle = R2.obstacle || R.obstacle;
        R = R2;
      }
      // "bắn tới được": điểm rơi đủ gần điểm chỉ định (đạn pháo có bán kính nổ; lệch vài mét vẫn tính là trúng vùng)
      const okTol = Math.max(15, dist * 0.025);
      const okOf = (r) => Math.abs(r.best.err) < okTol && Math.abs(r.best.lateral) < okTol;
      // Bắn thẳng bị vật cản chặn -> thử BẮN CẦU VỒNG (nâng nòng vượt giới hạn bắn thẳng, trong giới hạn cơ khí của giá pháo).
      // Không dùng để bắn xa hơn tầm bắn bình thường của xe.
      let lob = false;
      const lobMax = this.maxLobElevationFor ? this.maxLobElevationFor(shooterObj) : elMax;
      const rangeMax = this.maxRangeFor ? this.maxRangeFor(shooterObj) : Infinity;
      if (!okOf(R) && !arty && lobMax > elMax && dist <= rangeMax && (R.obstacle || R.best.err < -tol)) {
        const RL = solveEl(elMax, lobMax);
        if (RL.found && okOf(RL)) { RL.obstacle = true; R = RL; lob = true; }
      }
      const best = R.best;
      const miss = Math.hypot(best.err, best.lateral);
      const reachable = okOf(R);
      const lofted = reachable && !lobArty && R.obstacle;

      return {
        charge: curCharge,
        direct: !lobArty,
        elevation: Math.round(R.bestEl * 100) / 100,
        azimuth: Math.round(az * 10) / 10,
        distance: Math.round(dist),
        reachable,
        lofted,
        lob,
        miss: Math.round(miss),
        flightTime: best.flightTime,
        impactX: best.impactX, impactZ: best.impactZ
      };
    };
    if (!arty) return this.aimCenterMass(solveFor(1), shooterY, dist, targetX, targetZ, terrain, shooterObj, probe, opts);
    // Lựu pháo: chọn quỹ đạo. Tự động: địch gần (dưới tầm cầu vồng ngắn nhất) -> hạ nòng bắn thẳng, xa -> cầu vồng;
    // bắn thẳng bị đồi / nhà chặn mà vẫn đủ xa cho cầu vồng thì chuyển sang cầu vồng (và ngược lại).
    const mode = (opts && opts.artyMode) || (shooterObj && shooterObj.artyFireMode) || 'auto';
    const lobMin = this.artyLobMinRange();
    const direct = () => {
      if (dist < AD.min || dist > AD.max) return null;
      // bắn xe (opts.atUnit): nhắm tâm thân xe; bắn một điểm trên mặt đất: đạn rơi đúng điểm đó
      if (!(opts && opts.atUnit)) return solveFor(1, true);
      const r = this.solveArtyDirect(shooterX, shooterY, shooterZ, targetX, targetZ, terrain, shooterObj, probe, baseAz);
      if (r.reachable) return r;
      // đường bắn thẳng bị đồi / nhà chặn: thử nâng nòng (vẫn trong dải bắn thẳng) vòng qua vật cản
      const r2 = solveFor(1, true);
      return r2.reachable ? r2 : r;
    };
    const lob = () => {
      const order = [5, 4, 3, 2, 1];
      const hc = opts && opts.hintCharge;
      if (hc) { order.splice(order.indexOf(hc), 1); order.unshift(hc); }
      let first = null;
      for (const ch of order) {
        const r = solveFor(ch);
        if (!first || (!first.reachable && r.miss < first.miss)) first = first && first.reachable ? first : r;
        if (r.reachable) return r;
      }
      return first;
    };
    // Tự chọn: bắn vào xe (đã thấy, đường bắn thẳng thông) trong tầm bắn thẳng -> hạ nòng bắn thẳng trước;
    // đường thẳng bị đồi / nhà chặn thì mới nâng nòng bắn cầu vồng. Bắn điểm trên mặt đất: gần bắn thẳng, xa cầu vồng.
    // Mục tiêu trong điểm mù mũi xe: tháp không quay tới được -> báo không bắn tới (phải quay thân xe)
    const blind = this.inArtyBlind(shooterObj, baseAz);
    const fin = (r) => { if (blind && r) { r.reachable = false; r.blind = true; } return r; };
    const tries = mode === 'direct' ? [direct] : mode === 'lob' ? [lob]
      : (dist < lobMin * 1.08 || (opts && opts.atUnit && !opts.preferLob && dist <= AD.max)) ? [direct, lob] : [lob, direct];
    let first = null;
    for (const f of tries) {
      const r = f();
      if (!r) continue;
      if (r.reachable) return fin(r);
      if (!first) first = r;
    }
    // không quỹ đạo nào tới: trả nghiệm của quỹ đạo ưu tiên (ngoài cự ly bắn thẳng: nghiệm thẳng gần nhất để nòng vẫn chỉ về mục tiêu)
    return fin(first || solveFor(1, true));
  }

  // LỰU PHÁO BẮN THẲNG: chọn góc nòng để đạn bay căng ngang TÂM THÂN XE mục tiêu (không phải chân xe trên mặt đất —
  // tầm gần nòng không hạ đủ thấp để đạn cắm đất ngay chân xe, nhưng ngòi nổ cận đích nổ khi lướt sát thân xe).
  // Kiểm tra lại bằng mô phỏng đầy đủ: đạn đâm dốc / tường / nhà trước mục tiêu thì không bắn tới.
  solveArtyDirect(shooterX, shooterY, shooterZ, targetX, targetZ, terrain, shooterObj, probe, az) {
    const AD = BallisticsSystem3D.ARTY_DIRECT;
    const dx = targetX - shooterX, dz = targetZ - shooterZ, dist = Math.hypot(dx, dz);
    const ux = dist > 0 ? dx / dist : 0, uz = dist > 0 ? dz / dist : -1;
    const elMin = this.minElevationFor(shooterObj, az), elMax = AD.elMax;
    const ty = (terrain && terrain.getElevationAt ? terrain.getElevationAt(targetX, targetZ) : 0) + 9;   // tâm thân xe
    const h = el => this.shotHeightAt(shooterY, el, 1, shooterObj, probe, dist);
    let lo = elMin, hi = elMax, el;
    const hl = h(lo), hh = h(hi);
    if (hl === null || hh === null) el = hl === null ? hi : lo;
    else if (hl >= ty) el = lo;          // nòng đã hạ tới đáy: đạn vẫn bay cao hơn tâm xe (mục tiêu sát, thấp hơn mình)
    else if (hh <= ty) el = hi;          // mục tiêu trên cao quá tầm bắn thẳng
    else {
      for (let k = 0; k < 18; k++) { const m = (lo + hi) / 2; if (h(m) < ty) lo = m; else hi = m; }
      el = (lo + hi) / 2;
    }
    const hy = h(el);
    // trúng khi đạn bay qua trong dải cao của xe: thấp nhất sát chân xe, cao nhất ngang nóc tháp — đúng dải ngòi nổ cận đích
    // (tâm thân +-26) để không báo "không tới" khi nòng vắt qua cabin chỉ hạ được 0° và đạn bay ngang tháp xe địch
    const onBody = hy !== null && hy - ty <= 24 && ty - hy <= 12;
    const p = this.predictTrajectoryImpact(shooterX, shooterY, shooterZ, az, el, 1, terrain, probe);
    const along = (p.impactX - shooterX) * ux + (p.impactZ - shooterZ) * uz;
    const blocked = along < dist - (p.hitType === 'WALL' ? 18 : 30);   // chạm đất / tường trước khi tới thân xe
    return {
      charge: 1, direct: true, pointBlank: el === elMin,
      elevation: Math.round(el * 100) / 100,
      azimuth: Math.round(az * 10) / 10,
      distance: Math.round(dist),
      reachable: onBody && !blocked,
      lofted: false, lob: false,
      miss: onBody ? 0 : Math.round(hy === null ? dist : Math.abs(hy - ty)),
      flightTime: p.flightTime,
      impactX: p.impactX, impactZ: p.impactZ
    };
  }

  // Độ cao đường đạn khi bay tới cự ly ngang `dist` theo hướng bắn (bỏ qua gió) — dùng cho bắn thẳng tầm rất gần
  shotHeightAt(sy, el, charge, shooterObj, probe, dist) {
    const ammo = (shooterObj && shooterObj.selectedAmmo) || 'NORMAL';
    const rp = this.roundParams(ammo, shooterObj, charge);
    const elRad = el * Math.PI / 180;
    const bg = probe && probe.barrel;
    let x = bg ? bg.pivotFwd + Math.cos(elRad) * bg.len : 40;
    let y = sy + (bg ? bg.pivotH + Math.sin(elRad) * bg.len : 18 + Math.sin(elRad) * 40);
    let vx = rp.v0 * Math.cos(elRad), vy = rp.v0 * Math.sin(elRad);
    if (x >= dist) return y;
    const dt = 0.01 * (this.bulletSpeedMultiplier || 1);
    for (let i = 0; i < 4000; i++) {
      const v = Math.sqrt(vx * vx + vy * vy), d = rp.k * v * dt;
      vx -= vx * d; vy -= vy * d; vy -= rp.g * dt;
      const nx = x + vx * dt, ny = y + vy * dt;
      if (nx >= dist) return y + (ny - y) * (dist - x) / Math.max(1e-6, nx - x);
      x = nx; y = ny;
    }
    return null;
  }

  // Cự ly ngắn nhất bắn cầu vồng được (liều nhỏ nhất, góc nâng tối đa, mặt đất phẳng, lặng gió) — tính một lần
  artyLobMinRange() {
    if (this._artyLobMin) return this._artyLobMin;
    const flat = { getElevationAt: () => 0, checkHorseshoeCollision: () => ({ hit: false }), waterSurfaceAt: () => null };
    const probe = { tankType: 'ARTILLERY', selectedAmmo: 'HE' };
    const el = this.maxElevationFor(probe);
    const w = this.wind; this.wind = { vx: 0, vz: 0 };
    let d = 0;
    try { d = this.predictTrajectoryImpact(0, 0, 0, 0, el, 5, flat, probe).distance; } finally { this.wind = w; }
    return (this._artyLobMin = d || 440);
  }
}

// Tầm bay tối đa (đơn vị game) của đạn súng / tên lửa trước khi tự hủy / cháy hết vạch đường — số liệu thật x rangeScale
// (game_timing.js). Đạn pháo bay hết quỹ đạo (0).
BallisticsSystem3D.prototype.maxTravelFor = function (ammoType, shooter = null) {
  if (typeof GameTiming === 'undefined') return 0;
  const type = shooter ? shooter.tankType : (ammoType === 'INCENDIARY' ? 'GATLING' : null);
  return GameTiming.round(ammoType, type).maxTravel;
};

// Tầm bắn hiệu quả tối đa hiển thị trên HUD / bản đồ / bộ giải ngắm theo loại xe (số liệu thật x rangeScale)
BallisticsSystem3D.prototype.maxRangeFor = function (shooter) {
  const GT = typeof GameTiming !== 'undefined' ? GameTiming : null;
  if (!GT) return 1700;
  const t = shooter ? shooter.tankType : 'ALL_ROUNDER';
  switch (t) {
    case 'ARTILLERY': return Math.round(GT.round('HE', 'ARTILLERY').eff);              // ~2700
    case 'GATLING': return Math.round(GT.round('GATLING_BULLET', 'GATLING').eff);       // 30mm ~1000
    case 'SCOUT': return Math.round(GT.round('ANTI_TANK_MISSILE', 'SCOUT').eff);        // tên lửa ~2000 (súng máy ~700)
    default: return Math.round(GT.round('AP', t).eff);                                  // pháo tăng APFSDS ~1750
  }
};

// Góc nâng nòng tối đa theo loại xe: pháo tăng / súng chỉ bắn thẳng (tối đa 12°), lựu pháo bắn cầu vồng tới 85°
// Góc nâng tối đa khi BẮN CẦU VỒNG vượt vật cản (giới hạn cơ khí của giá pháo / súng):
// tăng chủ lực +20°, tháp 30mm & giá súng máy trinh sát +45°, lựu pháo 85°. Chỉ dùng khi đường bắn thẳng bị chặn.
BallisticsSystem3D.prototype.maxLobElevationFor = function (shooter) {
  const t = shooter && shooter.tankType;
  // như xe thật: lựu pháo 70°, tháp 30mm & giá súng máy 12.7mm ngóc được +60°, pháo tăng +20°
  return t === 'ARTILLERY' ? 70 : (t === 'GATLING' || t === 'SCOUT') ? 60 : 20;
};

// LỰU PHÁO HẠ NÒNG BẮN THẲNG: liều đầy, góc thấp, đạn bay căng — để tự vệ khi địch áp sát (dưới tầm cầu vồng).
// min/max: cự ly bắn thẳng (đơn vị game); elMax: góc nâng cao nhất vẫn tính là bắn thẳng;
// depress: góc hạ nòng thấp nhất ra hai bên / phía sau (lựu pháo trên xe tải thật -3..-5°);
// cabSector: nửa góc (rad) phía trước mà nòng vắt qua nóc cabin -> không hạ dưới 0° (nòng không đâm vào cabin)
// blind: nửa góc (rad) ĐIỂM MÙ phía mũi xe — tháp không quay vào đây (nòng không vắt qua cabin, ống xả, đầu xe):
//   đo trên mô hình Arbalest: mép cabin (rộng 10.6) cách trục tháp 35.5, ống xả cao ngang trục nòng cách 29 / lệch 9.6,
//   cộng bán kính nòng + khoảng an toàn ~1 m cho sóng đầu nòng -> ~31°. Mũi xe ±31° là điểm mù, phải quay thân xe.
BallisticsSystem3D.ARTY_DIRECT = { min: 60, max: 800, elMax: 15, depress: -5, cabSector: 0.85, blind: 0.55 };

// Góc tháp so với đầu xe (rad, -PI..PI; 0 = nòng chỉ về mũi xe) của hướng bắn azimuthDeg
BallisticsSystem3D.prototype.artyRelAngle = function (shooter, azimuthDeg) {
  const az = azimuthDeg !== undefined ? azimuthDeg : (shooter.azimuth || 0);
  const rel = -(az * Math.PI / 180) - (shooter.bodyAngle || 0);
  return Math.atan2(Math.sin(rel), Math.cos(rel));
};
// Hướng bắn nằm trong điểm mù mũi xe của pháo tự hành
BallisticsSystem3D.prototype.inArtyBlind = function (shooter, azimuthDeg) {
  if (!shooter || shooter.tankType !== 'ARTILLERY') return false;
  return Math.abs(this.artyRelAngle(shooter, azimuthDeg)) < BallisticsSystem3D.ARTY_DIRECT.blind;
};

// Góc hạ nòng thấp nhất theo hướng tháp (azimuthDeg: hướng bắn trong thế giới; mặc định hướng tháp hiện tại)
BallisticsSystem3D.prototype.minElevationFor = function (shooter, azimuthDeg) {
  if (!shooter || shooter.tankType !== 'ARTILLERY') return -10;
  const AD = BallisticsSystem3D.ARTY_DIRECT;
  const az = azimuthDeg !== undefined ? azimuthDeg : (shooter.azimuth || 0);
  // cùng quy ước với tháp pháo 3D: turretGroup.rotation.y = -az - bodyAngle (0 = nòng chỉ về đầu xe, qua cabin)
  let rel = -(az * Math.PI / 180) - (shooter.bodyAngle || 0);
  rel = Math.atan2(Math.sin(rel), Math.cos(rel));
  return Math.abs(rel) < AD.cabSector ? 0 : AD.depress;
};

// BẮN THẲNG VÀO XE (opts.atUnit): nâng nòng một chút để đường đạn đi qua TÂM THÂN XE thay vì cắm đúng chân xe.
// Có độ tản mát thì nhắm chân xe = một nửa số phát cắm đất trước mục tiêu; nhắm giữa thân thì lệch lên / xuống đều còn trúng.
BallisticsSystem3D.AIM_CENTER_H = 11;   // độ cao tâm thân xe trên mặt đất (đv, ~1.4 m)
BallisticsSystem3D.prototype.aimCenterMass = function (sol, shooterY, dist, targetX, targetZ, terrain, shooterObj, probe, opts) {
  if (!sol || !opts || !opts.atUnit || !sol.reachable || sol.lob || sol.lofted || !shooterObj || dist < 30) return sol;
  const ammo = shooterObj.selectedAmmo || 'NORMAL';
  if (ammo === 'ANTI_TANK_MISSILE' || ammo === 'RPG') return sol;
  const ty = (terrain && terrain.getElevationAt ? terrain.getElevationAt(targetX, targetZ) : 0) + BallisticsSystem3D.AIM_CENTER_H;
  const h = el => this.shotHeightAt(shooterY, el, sol.charge || 1, shooterObj, probe, dist);
  let lo = sol.elevation - 0.3, hi = sol.elevation + 3;
  const hl = h(lo), hh = h(hi);
  if (hl === null || hh === null || hl >= ty || hh <= ty) return sol;
  for (let k = 0; k < 16; k++) { const m = (lo + hi) / 2; if (h(m) < ty) lo = m; else hi = m; }
  sol.elevation = Math.round((lo + hi) * 50) / 100;
  sol.centerMass = true;
  return sol;
};

BallisticsSystem3D.prototype.maxElevationFor = function (shooter) {
  // pháo tăng phương Tây -10° / +20°; lựu pháo 155mm tối đa 70° (Archer / PzH 2000 / M109: 65-75°)
  return shooter && shooter.tankType === 'ARTILLERY' ? 70 : 20;
};

window.BallisticsSystem3D = BallisticsSystem3D;
