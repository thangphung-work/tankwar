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
  createShell155Mesh(isDirectFire, ammoType = 'NORMAL', heavy = false) {
    if (typeof ProjectileModels !== 'undefined') {
      return ProjectileModels.create(ammoType, { heavy });
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

    if (this.fx) this.fx.spawn(cx, cy, cz, 'CLUSTER', 'AIRBURST');
    else this.createAirburstFlash(cx, cy, cz);

    if (window.soundEngine && typeof window.soundEngine.playExplosionAtDistance === 'function') {
      const distToPlayer = (window.game && window.game.player) ? Math.hypot(window.game.player.x - cx, window.game.player.z - cz) : 500;
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
    const shellMesh = this.createShell155Mesh(isDirectFire, ammoType, !!(shooter && shooter.tankType === 'ARTILLERY'));
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
        const seen = !(target._netHidden) && (!shooter || typeof TeamIntel === 'undefined' || TeamIntel.knows(shooter, target));
        if (seen) {
          const ty = (target.y || (terrain ? terrain.getElevationAt(target.x, target.z) : 0)) + 7;
          if (G.point && G.lastT !== undefined && G.lastT > 0) {
            const dtT = s.timeAlive - G.lastT;
            if (dtT > 1e-4) { G.tvx = (target.x - G.point.x) / dtT; G.tvz = (target.z - G.point.z) / dtT; }
          }
          G.point = { x: target.x, y: ty, z: target.z };
          G.lastT = s.timeAlive;
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
      // Bay cao hơn đường ngắm một chút, hạ thấp dần khi tới gần (lao thẳng vào thân xe)
      const ay = P.y + Math.min(26, dh * 0.04);
      const hx = ax - s.x, hz = az - s.z, hl = Math.hypot(hx, hz) || 1;
      // Bám địa hình: dò mặt đất phía trước theo hướng tới mục tiêu (bán kính vòng ~380 đơn vị nên phải nhìn xa),
      // chọn độ dốc lớn nhất cần để vượt mọi gò / bờ đất cách mặt đất >= 10 đơn vị
      let slope = (ay - s.y) / hl;
      if (terrain) {
        for (const d of [30, 70, 130, 200, 290, 400]) {
          if (d > hl - 40) break;
          const gx = s.x + hx / hl * d, gz = s.z + hz / hl * d;
          const need = (terrain.getElevationAt(gx, gz) + 10 - s.y) / d;
          if (need > slope) slope = need;
        }
      }
      let wx = hx / hl, wy = slope, wz = hz / hl;
      const wl = Math.hypot(wx, wy, wz) || 1;
      wx /= wl; wy /= wl; wz /= wl;
      // gia tốc ngang cần để quay vận tốc về hướng mong muốn, giới hạn theo khả năng cánh lái
      let cx = wx - ux, cy = wy - uy, cz = wz - uz;
      const need = Math.hypot(cx, cy, cz) * newSp / Math.max(dt, 1e-4);
      const maxA = G.turnAcc * (s.timeAlive < (G.boostT || 0.3) ? 0.5 : 1);
      const kk = need > maxA ? maxA / need : 1;
      ux += cx * kk; uy += cy * kk; uz += cz * kk;
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
      const dragFactor = k * Math.hypot(s.vx, s.vy, s.vz) * h;
      s.vx -= s.vx * dragFactor;
      s.vy -= s.vy * dragFactor;
      s.vz -= s.vz * dragFactor;
    }
    const g = s.g !== undefined ? s.g : this.gravityFor(s.ammoType, s.isDirectFire);
    s.vy -= g * (burning ? 0.25 : 1) * h;
  }

  updateShells3D(dt, terrain, allUnits, onImpact) {
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
            this.removeShellMesh(s, i);
            if (onImpact) onImpact(s, 'TREE');
            impacted = true;
            break;
          }
        }

        if (s.timeAlive > 0.015) {
          // Kiểm tra quét dọc theo đoạn bay để ngăn đạn tốc độ cao nhảy cóc qua tường
          let wallHit = terrain.checkHorseshoeCollision(s.x, s.y, s.z);
          if (!wallHit.hit && (Math.hypot(s.x - prevX, s.z - prevZ) > 3.0)) {
            const midX = (prevX + s.x) * 0.5;
            const midY = (prevY + s.y) * 0.5;
            const midZ = (prevZ + s.z) * 0.5;
            wallHit = terrain.checkHorseshoeCollision(midX, midY, midZ);
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
            if (unit._netHidden) continue;   // máy chủ không gửi vị trí: bản sao đứng ở toạ độ cũ, không tính va chạm
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
        this.fx.trail(tailPos.x, tailPos.y, tailPos.z, s.ammoType, s.lastTailPos.x, s.lastTailPos.y, s.lastTailPos.z);
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
        const dragFactor = kDrag * Math.hypot(vx, vy, vz) * simDt;
        vx -= vx * dragFactor;
        vy -= vy * dragFactor;
        vz -= vz * dragFactor;
      }
      vy -= gAcc * (burning ? 0.25 : 1) * simDt;
      travel += Math.hypot(vx, vy, vz) * simDt;

      const px0 = x, py0 = y, pz0 = z;
      x += vx * simDt;
      y += vy * simDt;
      z += vz * simDt;

      if (y > maxAltitude) maxAltitude = y;

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
        const dragFactor = kDrag * Math.hypot(curVx, curVy, curVz) * simDt;
        curVx -= curVx * dragFactor;
        curVy -= curVy * dragFactor;
        curVz -= curVz * dragFactor;
      }
      curVy -= gAcc * (burning ? 0.25 : 1) * simDt;
      travel += Math.hypot(curVx, curVy, curVz) * simDt;

      const px0 = curX, py0 = curY, pz0 = curZ;
      curX += curVx * simDt;
      curY += curVy * simDt;
      curZ += curVz * simDt;

      if (curY > maxAltitude) maxAltitude = curY;

      // Lưu điểm lấy mẫu vào đường nét đứt (cứ 2 bước lưu 1 điểm để tối ưu hiệu năng)
      if (step % 2 === 0 || step < 6) {
        points.push(new THREE.Vector3(curX, curY, curZ));
      }

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
    // khi điểm rơi vượt qua mục tiêu -> chia đôi khoảng để ra nghiệm chính xác. Lựu pháo chỉ bắn cầu vồng 25..85°.
    const arty = !!(shooterObj && shooterObj.tankType === 'ARTILLERY');
    const probe = shooterObj ? { tankType: shooterObj.tankType, selectedAmmo: shooterObj.selectedAmmo } : null;
    // Đạn bay ra từ miệng nòng thật: lấy độ cao / tầm với của tâm quay nòng và chiều dài nòng đo trên mô hình 3D
    // (trước đây giả định cố định cao 18, trước 40 cho mọi xe -> pháo bắn thẳng lệch điểm rơi đáng kể)
    if (probe && typeof shooterObj.barrelGeometry === 'function') {
      const bg = shooterObj.barrelGeometry();
      if (bg) probe.barrel = bg;
    }
    const elMax = this.maxElevationFor(shooterObj);
    const elMin = arty ? 25 : -10;
    const tol = Math.max(8, dist * 0.012);
    // Lựu pháo: chọn liều phóng nhỏ nhất bắn tới được (đạn rơi dốc, ít mòn nòng) — thử liều lần trước trước
    const solveFor = (curCharge) => {
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
        const step = arty ? 2.0 : 1.0;
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
            for (let k = 0; k < (arty ? 8 : 13); k++) {
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
        if (hint === null) return full();
        const w = arty ? 6 : 3;
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
      const lofted = reachable && !arty && R.obstacle;

      return {
        charge: curCharge,
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
    if (!arty) return solveFor(1);
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

BallisticsSystem3D.prototype.maxElevationFor = function (shooter) {
  // pháo tăng phương Tây -10° / +20°; lựu pháo 155mm tối đa 70° (Archer / PzH 2000 / M109: 65-75°)
  return shooter && shooter.tankType === 'ARTILLERY' ? 70 : 20;
};

window.BallisticsSystem3D = BallisticsSystem3D;
